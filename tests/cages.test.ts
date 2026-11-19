import { beforeEach, describe, expect, test } from 'vitest';
import { cagesScore, cagesSpecFor, PAIRS_INTRO, rateCages, TRIAL_INTRO, TUTORIAL_COUNT, tierFor } from '../src/games/cages/core/difficulty';
import { buildCagesLevel, carveCages, latinSquare } from '../src/games/cages/core/levels';
import { cageLabel, isSolved, makes, shapeOf, targetOf } from '../src/games/cages/core/rules';
import { nextPlacement, solveLogic, TIER_NAMES } from '../src/games/cages/core/solver';
import { Cage, CagesLevel } from '../src/games/cages/core/types';
import { Session, START_HEARTS } from '../src/games/cages/game/session';
import { CAGES_KEY, loadCages, recordCagesClear, resetCages } from '../src/games/cages/game/storage';
import { Rng } from '../src/shared/rng';

describe('rules', () => {
  test('signs make their targets, larger number first for − and ÷', () => {
    expect(makes('+', 7, [3, 4])).toBe(true);
    expect(makes('x', 12, [3, 4])).toBe(true);
    expect(makes('-', 1, [3, 4])).toBe(true);
    expect(makes('-', 1, [4, 3])).toBe(true);
    expect(makes('/', 2, [2, 4])).toBe(true);
    expect(makes('/', 2, [3, 4])).toBe(false);
    expect(makes('=', 3, [3])).toBe(true);
    expect(targetOf('/', [2, 6])).toBe(3);
    expect(cageLabel({ cells: [0, 1], op: '-', target: 2 })).toBe('2−');
    expect(cageLabel({ cells: [0], op: '=', target: 4 })).toBe('4');
  });

  test('shuffled squares are Latin squares', () => {
    for (const size of [4, 5, 6, 7, 8]) {
      const g = latinSquare(size, new Rng(size));
      for (const u of shapeOf(size).units) expect(new Set(u.map((i) => g[i])).size).toBe(size);
    }
  });

  test('cages cover every square once, joined, with few single squares', () => {
    const spec = cagesSpecFor(30);
    const cages = carveCages(spec.size, spec, new Rng(2));
    const seen = cages.flat().sort((a, b) => a - b);
    expect(seen).toEqual([...Array(spec.size * spec.size).keys()]);
    expect(cages.filter((c) => c.length === 1).length).toBeLessThanOrEqual(spec.singles);
    for (const c of cages) {
      // Joined: every square reaches the first through the cage.
      const set = new Set(c);
      const reach = new Set([c[0]]);
      const stack = [c[0]];
      while (stack.length) {
        const i = stack.pop()!;
        for (const j of [i + 1, i - 1, i + spec.size, i - spec.size]) {
          const sameRow = Math.abs(j - i) === 1 ? ((j / spec.size) | 0) === ((i / spec.size) | 0) : true;
          if (set.has(j) && sameRow && !reach.has(j)) {
            reach.add(j);
            stack.push(j);
          }
        }
      }
      expect(reach.size).toBe(c.length);
    }
  });
});

describe('solver', () => {
  // A 4x4 board with a known answer, cages marked by letter.
  //  1 2 | 3 4      a a b b
  //  3 4 | 1 2      c d d e
  //  2 1 | 4 3      c f g e
  //  4 3 | 2 1      h f g g
  const solution = [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1];
  const groups = ['aabb', 'cdde', 'cfge', 'hfgg'].join('');
  const cagesWith = (ops: Record<string, Cage['op']>): Cage[] =>
    [...new Set(groups)].map((g) => {
      const cells = [...groups].map((ch, i) => (ch === g ? i : -1)).filter((i) => i >= 0);
      const op = ops[g] ?? (cells.length === 1 ? '=' : '+');
      return { cells, op, target: targetOf(op, cells.map((i) => solution[i])) };
    });

  test('the waves solve a small board and agree with its answer', () => {
    const cages = cagesWith({ a: '-', b: 'x', c: '+', d: '/', e: '-', f: '+', g: 'x' });
    const r = solveLogic({ size: 4, cages });
    if (r.grid) {
      expect(r.grid).toEqual(solution);
      expect(isSolved(4, cages, r.grid)).toBe(true);
    }
    // With every number given but one, singles alone finish it.
    const known = solution.map((v, i) => (i === 5 ? 0 : v));
    expect(solveLogic({ size: 4, cages }, 1, known).grid).toEqual(solution);
    expect(nextPlacement({ size: 4, cages }, known)).toBe(5);
  });

  test('every step has a name, and scores map to the steps they allow', () => {
    for (let t = 1; t <= 4; t++) expect(TIER_NAMES[t]).toBeTruthy();
    expect(cagesScore(2, 0)).toBe(1);
    expect(cagesScore(3, 0)).toBe(2);
    expect(cagesScore(4, 1)).toBe(3);
    expect(cagesScore(4, 5)).toBe(4);
    expect(tierFor(1)).toBe(2);
    expect(tierFor(2)).toBe(3);
    expect(tierFor(4)).toBe(4);
  });
});

describe('levels', () => {
  test('specs ramp and bring in each step on its level', () => {
    for (let n = 1; n <= 150; n++) {
      const s = cagesSpecFor(n);
      expect(s.size).toBeGreaterThanOrEqual(4);
      expect(s.size).toBeLessThanOrEqual(8);
      if (n < PAIRS_INTRO) expect(s.target).toBe(1);
      if (n < TRIAL_INTRO) expect(s.target).toBeLessThanOrEqual(2);
    }
  });

  test('levels 1 to 50 build, have one answer, and are the same built twice', () => {
    for (let n = 1; n <= 50; n++) {
      const l = buildCagesLevel(n);
      expect(isSolved(l.size, l.cages, l.solution), `level ${n}`).toBe(true);
      const r = solveLogic(l);
      expect(r.grid).toEqual(l.solution);
      expect(cagesScore(r.hardest, r.trials)).toBe(l.score);
      expect(l.difficulty).toBe(n <= TUTORIAL_COUNT ? 'Tutorial' : rateCages(l.score!));
      if (n % 10 === 0) expect(buildCagesLevel(n)).toEqual(l);
    }
  }, 300_000);
});

describe('session', () => {
  const level = (): CagesLevel => buildCagesLevel(5);

  test('right numbers stay, wrong ones cost a heart, notes are free', () => {
    const l = level();
    const s = new Session(l);
    expect(s.place(0, l.solution[0])!.ok).toBe(true);
    const wrong = (l.solution[1] % l.size) + 1;
    expect(s.place(1, wrong)!.ok).toBe(false);
    expect(s.grid[1]).toBe(0);
    expect(s.hearts).toBe(START_HEARTS - 1);
    expect(s.toggleNote(1, 2)).toBe(true);
    expect(s.notes[1]).toBe(2);
  });

  test('hints fill squares the rules can work out, for free, and the board can be finished', () => {
    const l = buildCagesLevel(15);
    const s = new Session(l);
    const i = s.hint()!;
    expect(s.grid[i]).toBe(l.solution[i]);
    expect(s.hearts).toBe(START_HEARTS);
    l.solution.forEach((v, k) => s.grid[k] || s.place(k, v));
    expect(s.won).toBe(true);
    expect(s.stars()).toBe(3);
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
    const p = loadCages();
    recordCagesClear(p, 1, 2, 1, 5000);
    recordCagesClear(p, 1, 3, 0, 6000);
    expect(p.levels[1]).toEqual({ stars: 3, bestMoves: 0, bestMs: 5000 });
    expect(JSON.parse(mem.get(CAGES_KEY)!).unlocked).toBe(2);
    resetCages(p);
    expect(loadCages()).toEqual({ unlocked: 1, current: 1, levels: {} });
  });
});
