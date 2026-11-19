import { beforeEach, describe, expect, test } from 'vitest';
import { rateTones, TRIAL_INTRO, TUTORIAL_COUNT, tonesSpecFor, UNIQUE_INTRO } from '../src/games/tones/core/difficulty';
import { buildTonesLevel, fullGrid } from '../src/games/tones/core/levels';
import { isSolved, lineBroken, validLines } from '../src/games/tones/core/rules';
import { nextWave, solveLogic, TIER_NAMES } from '../src/games/tones/core/solver';
import { A, B, EMPTY as _, TonesLevel } from '../src/games/tones/core/types';
import { Session, START_HEARTS } from '../src/games/tones/game/session';
import { loadTones, recordTonesClear, resetTones, TONES_KEY } from '../src/games/tones/game/storage';
import { Rng } from '../src/shared/rng';

describe('rules', () => {
  test('valid lines are balanced with no three in a row', () => {
    expect(validLines(4).length).toBe(6);
    expect(validLines(6).length).toBe(14);
    for (const m of validLines(8)) {
      let ones = 0;
      for (let k = 0; k < 8; k++) ones += (m >> k) & 1;
      expect(ones).toBe(4);
      for (let k = 0; k + 2 < 8; k++) expect([0, 7]).not.toContain((m >> k) & 7);
    }
  });

  test('a line breaks with three in a row or too many of a tone', () => {
    expect(lineBroken([A, A, A, _, _, _])).toBe(true);
    expect(lineBroken([A, B, A, A, _, A])).toBe(true);
    expect(lineBroken([A, A, _, B, B, _])).toBe(false);
    expect(lineBroken([_, _, _, _])).toBe(false);
  });

  test('a solved grid keeps every rule, including no copied rows or columns', () => {
    const good = [A, B, B, A, B, A, A, B, A, A, B, B, B, B, A, A];
    expect(isSolved(good, 4)).toBe(true);
    const copied = [A, B, B, A, A, B, B, A, B, A, A, B, B, A, A, B];
    expect(isSolved(copied, 4)).toBe(false);
    expect(isSolved([...good.slice(0, 15), _], 4)).toBe(false);
  });

  test('full grids are valid for every size', () => {
    for (const size of [4, 6, 8, 10, 12]) {
      const g = fullGrid(size, new Rng(size))!;
      expect(isSolved(g, size)).toBe(true);
    }
  });
});

describe('solver', () => {
  test('tier 1: a pair or a gap forces the other tone', () => {
    const g = [A, A, _, _, _, _, _, _, _, _, _, _, _, _, _, _];
    const w = nextWave(4, g)!;
    expect(w.tier).toBe(1);
    expect(w.moves.get(2)).toBe(B);
    const gap = [B, _, B, _, _, _, _, _, _, _, _, _, _, _, _, _];
    expect(nextWave(4, gap)!.moves.get(1)).toBe(A);
  });

  test('tier 2: a line with half of one tone fills the rest with the other', () => {
    const g = [A, _, _, A, _, _, _, _, _, _, _, _, _, _, _, _];
    const w = nextWave(4, g)!;
    expect(w.tier).toBe(2);
    expect(w.moves.get(1)).toBe(B);
    expect(w.moves.get(2)).toBe(B);
  });

  test('tier 4: a finished row rules out its copy', () => {
    // Top row finished; the bottom row starts the same way and could end as a copy.
    const g = new Array<number>(36).fill(_);
    [A, B, A, B, A, B].forEach((v, x) => (g[x] = v));
    [A, B, A, B].forEach((v, x) => (g[30 + x] = v));
    // Let the easier tiers do all they can first.
    for (let w = nextWave(6, g, 3); w; w = nextWave(6, g, 3)) for (const [i, v] of w.moves) g[i] = v;
    expect(g[34]).toBe(_);
    const w = nextWave(6, g)!;
    expect(w.tier).toBe(4);
    expect(w.moves.get(34)).toBe(B);
    expect(w.moves.get(35)).toBe(A);
  });

  test('every tier name is set', () => {
    for (let t = 1; t <= 5; t++) expect(TIER_NAMES[t]).toBeTruthy();
  });
});

describe('levels', () => {
  test('specs ramp and introduce each rule on its level', () => {
    for (let n = 1; n <= 150; n++) {
      const s = tonesSpecFor(n);
      expect(s.size % 2).toBe(0);
      expect(s.size).toBeLessThanOrEqual(12);
      if (n < UNIQUE_INTRO) expect(s.tier).toBeLessThanOrEqual(3);
      if (n < TRIAL_INTRO) expect(s.tier).toBeLessThanOrEqual(4);
    }
    expect(tonesSpecFor(UNIQUE_INTRO).tier).toBe(4);
    expect(tonesSpecFor(UNIQUE_INTRO).tip).toBeTruthy();
  });

  test('levels 1 to 60 build, have one answer, need their tier and are the same built twice', () => {
    for (let n = 1; n <= 60; n++) {
      const l = buildTonesLevel(n);
      const spec = tonesSpecFor(n);
      expect(l.size).toBe(spec.size);
      expect(isSolved(l.solution, l.size)).toBe(true);
      for (let i = 0; i < l.givens.length; i++) if (l.givens[i]) expect(l.givens[i]).toBe(l.solution[i]);
      expect(l.givens.some((v) => v === _)).toBe(true);
      // The reasoning solver finishes with the level's tier (so the answer is unique) and not without it.
      const r = solveLogic(l.size, l.givens, l.score);
      expect(r.grid, `level ${n}`).toEqual(l.solution);
      expect(r.hardest).toBe(l.score);
      if (l.score! > 1) expect(solveLogic(l.size, l.givens, l.score! - 1).grid).toBeNull();
      expect(l.difficulty).toBe(n <= TUTORIAL_COUNT ? 'Tutorial' : rateTones(l.score!));
      if (n % 10 === 0) expect(buildTonesLevel(n)).toEqual(l);
    }
  }, 300_000);
});

describe('session', () => {
  const level = (): TonesLevel => buildTonesLevel(4);

  test('right marks stay, wrong ones show the truth and cost a heart', () => {
    const l = level();
    const s = new Session(l);
    const open = l.givens.map((v, i) => (v === _ ? i : -1)).filter((i) => i >= 0);
    const [i, j] = open;
    const right = l.solution[i] === A ? 'a' : 'b';
    expect(s.mark(i, right)!.ok).toBe(true);
    expect(s.mark(i, right)).toBeNull();
    const wrong = l.solution[j] === A ? 'b' : 'a';
    expect(s.mark(j, wrong)!.ok).toBe(false);
    expect(s.known[j]).toBe(l.solution[j]);
    expect(s.hearts).toBe(START_HEARTS - 1);
    expect(s.mistakes.has(j)).toBe(true);
  });

  test('running out of hearts waits for a choice; keeping going earns no stars', () => {
    const l = level();
    const s = new Session(l);
    const open = l.givens.map((v, i) => (v === _ ? i : -1)).filter((i) => i >= 0);
    for (let k = 0; k < 3; k++) s.mark(open[k], l.solution[open[k]] === A ? 'b' : 'a');
    expect(s.awaitingContinue).toBe(true);
    expect(s.mark(open[3], 'a')).toBeNull();
    s.continueWithoutHearts();
    for (const i of open.slice(3)) s.mark(i, l.solution[i] === A ? 'a' : 'b');
    expect(s.won).toBe(true);
    expect(s.stars()).toBe(0);
  });

  test('hints fill squares the rules can work out, and are free', () => {
    const l = buildTonesLevel(20);
    const s = new Session(l);
    const before = s.known.slice();
    const w = nextWave(l.size, before)!;
    const i = s.hint()!;
    expect(w.moves.has(i)).toBe(true);
    expect(s.known[i]).toBe(l.solution[i]);
    expect(s.hints).toBe(2);
    expect(s.hearts).toBe(START_HEARTS);
    while (s.hints > 0) s.hint();
    expect(s.hint()).toBeNull();
  });

  test('a clean finish gives three stars', () => {
    const l = level();
    const s = new Session(l);
    l.givens.forEach((v, i) => v === _ && s.mark(i, l.solution[i] === A ? 'a' : 'b'));
    expect(s.won).toBe(true);
    expect(s.stars()).toBe(3);
    expect(s.left).toBe(0);
    expect(s.needs(0, A)).toBe(0);
  });
});

describe('storage', () => {
  const mem = new Map<string, string>();
  beforeEach(() => {
    mem.clear();
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => mem.set(k, v),
      removeItem: (k: string) => mem.delete(k),
    };
  });

  test('records clears and resets', () => {
    const p = loadTones();
    recordTonesClear(p, 1, 2, 1, 5000);
    recordTonesClear(p, 1, 3, 0, 6000);
    expect(p.levels[1]).toEqual({ stars: 3, bestMoves: 0, bestMs: 5000 });
    expect(JSON.parse(mem.get(TONES_KEY)!).unlocked).toBe(2);
    resetTones(p);
    expect(loadTones()).toEqual({ unlocked: 1, current: 1, levels: {} });
  });
});
