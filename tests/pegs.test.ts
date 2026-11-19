import { beforeEach, describe, expect, test } from 'vitest';
import { pegsSpecFor, PEGS_THRESHOLDS, ratePegs, TUTORIAL_COUNT } from '../src/games/pegs/core/difficulty';
import { buildBackwards, buildPegsLevel, shape } from '../src/games/pegs/core/levels';
import { allJumps, apply, count, legal } from '../src/games/pegs/core/rules';
import { search } from '../src/games/pegs/core/solver';
import { PegsLevel } from '../src/games/pegs/core/types';
import { Session } from '../src/games/pegs/game/session';
import { loadPegs, PEGS_KEY, recordPegsClear, resetPegs } from '../src/games/pegs/game/storage';
import { Rng } from '../src/shared/rng';

/** A row of five holes with pegs on the first two. */
const row = (): PegsLevel => ({
  number: 1,
  w: 5,
  h: 1,
  holes: [true, true, true, true, true],
  pegs: [true, true, false, false, false],
  goal: 2,
  solution: [{ from: 0, over: 1, to: 2 }],
  difficulty: 'Tutorial',
});

describe('rules', () => {
  test('jumps go two holes across or down, over a hole', () => {
    const j = allJumps(5, 1, [true, true, true, true, true]);
    expect(j).toContainEqual({ from: 0, over: 1, to: 2 });
    expect(j).toContainEqual({ from: 4, over: 3, to: 2 });
    expect(j).toHaveLength(6);
    const gap = allJumps(3, 1, [true, false, true]);
    expect(gap).toHaveLength(0);
  });

  test('a jump takes the jumped peg off', () => {
    const l = row();
    const pegs = l.pegs.slice();
    const [j] = legal(allJumps(5, 1, l.holes), pegs);
    apply(pegs, j);
    expect(pegs).toEqual([false, false, true, false, false]);
    expect(count(pegs)).toBe(1);
  });

  test('shapes are mirrored both ways', () => {
    for (let s = 0; s < 10; s++) {
      const h = shape(7, 7, new Rng(s));
      for (let y = 0; y < 7; y++)
        for (let x = 0; x < 7; x++) {
          expect(h[y * 7 + x]).toBe(h[y * 7 + 6 - x]);
          expect(h[y * 7 + x]).toBe(h[(6 - y) * 7 + x]);
        }
    }
  });
});

describe('solver', () => {
  test('boards built backwards can be finished on the goal', () => {
    for (let s = 0; s < 15; s++) {
      const rng = new Rng(s);
      const holes = shape(7, 7, rng);
      const spots = holes.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
      const goal = spots[Math.floor(spots.length / 2)];
      const b = buildBackwards(7, 7, holes, goal, 10, rng);
      if (!b) continue;
      expect(count(b.start)).toBe(10);
      // The forward solution plays out.
      const pegs = b.start.slice();
      for (const j of b.solution) {
        expect(legal(allJumps(7, 7, holes), pegs)).toContainEqual(j);
        apply(pegs, j);
      }
      expect(count(pegs)).toBe(1);
      expect(pegs[goal]).toBe(true);
      expect(search(allJumps(7, 7, holes), b.start, goal).path).not.toBeNull();
    }
  });

  test('says when a finish is impossible', () => {
    // Two pegs far apart can never meet.
    const holes = [true, true, true, true, true];
    expect(search(allJumps(5, 1, holes), [true, false, false, false, true], null).path).toBeNull();
  });
});

describe('levels', () => {
  test('levels 1 to 50 build, can be finished on the ring, and are the same built twice', () => {
    for (let n = 1; n <= 50; n++) {
      const l = buildPegsLevel(n);
      const jumps = allJumps(l.w, l.h, l.holes);
      const pegs = l.pegs.slice();
      for (const j of l.solution) {
        expect(legal(jumps, pegs), `level ${n}`).toContainEqual(j);
        apply(pegs, j);
      }
      expect(count(pegs)).toBe(1);
      expect(pegs[l.goal]).toBe(true);
      for (let i = 0; i < l.holes.length; i++) if (l.pegs[i]) expect(l.holes[i]).toBe(true);
      expect(l.difficulty).toBe(n <= TUTORIAL_COUNT ? 'Tutorial' : ratePegs(l.score!));
      if (n % 10 === 0) expect(buildPegsLevel(n)).toEqual(l);
    }
  }, 120_000);

  test('specs ramp and labels follow the thresholds', () => {
    expect(pegsSpecFor(1).pegs).toBe(2);
    for (let n = 4; n <= 100; n++) expect(pegsSpecFor(n).w).toBeLessThanOrEqual(7);
    expect(ratePegs(PEGS_THRESHOLDS[0] - 0.1)).toBe('Easy');
    expect(ratePegs(PEGS_THRESHOLDS[2])).toBe('Super Hard');
  });
});

describe('session', () => {
  test('pick up, jump, finish on the ring for three stars', () => {
    const s = new Session(row());
    expect(s.tap(2)).toBeNull(); // nothing picked up
    expect(s.tap(1)).toBe('stuck'); // can't jump: 0 is a peg, 2 has no peg to jump
    expect(s.tap(0)).toBe('select');
    expect(s.tap(0)).toBe('deselect');
    s.tap(0);
    expect(s.tap(2)).toBe('jump');
    expect(s.cleared).toBe(true);
    expect(s.onGoal).toBe(true);
    expect(s.stars()).toBe(3);
    expect(s.undo()).toEqual({ from: 0, over: 1, to: 2 });
    expect(s.left).toBe(2);
  });

  test('finishing off the ring is two stars, more than two pegs is not a clear', () => {
    const l = { ...row(), goal: 4 };
    const s = new Session(l);
    s.tap(0);
    s.tap(2);
    expect(s.stars()).toBe(2);
    const t = new Session({ ...row(), pegs: [true, false, true, false, true] });
    expect(t.finished).toBe(true);
    expect(t.cleared).toBe(false);
    expect(t.stars()).toBe(0);
  });

  test('following hints finishes on the ring; each hint costs a star', () => {
    const l = buildPegsLevel(12);
    const s = new Session(l);
    s.hints = 99;
    while (!s.finished) {
      const h = s.hint();
      expect(typeof h).toBe('object');
      const j = h as { from: number; to: number };
      expect(s.selected).toBe(j.from);
      expect(s.tap(j.to)).toBe('jump');
    }
    expect(s.onGoal).toBe(true);
    expect(s.stars()).toBe(1);
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
    const p = loadPegs();
    recordPegsClear(p, 1, 2, 9, 5000);
    recordPegsClear(p, 1, 3, 7, 6000);
    expect(p.levels[1]).toEqual({ stars: 3, bestMoves: 7, bestMs: 5000 });
    expect(JSON.parse(mem.get(PEGS_KEY)!).unlocked).toBe(2);
    resetPegs(p);
    expect(loadPegs()).toEqual({ unlocked: 1, current: 1, levels: {} });
  });
});
