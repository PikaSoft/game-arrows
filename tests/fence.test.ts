import { beforeEach, describe, expect, test } from 'vitest';
import { fenceScore, fenceSpecFor, rateFence, SIDES_INTRO, TRIAL_INTRO, TUTORIAL_COUNT } from '../src/games/fence/core/difficulty';
import { across, down, gridOf, isLoop, outline } from '../src/games/fence/core/grid';
import { buildFenceLevel, growShape } from '../src/games/fence/core/levels';
import { nextWave, solveLogic, TIER_NAMES } from '../src/games/fence/core/solver';
import { OFF, ON, UNKNOWN } from '../src/games/fence/core/types';
import { Session, START_HEARTS } from '../src/games/fence/game/session';
import { FENCE_KEY, loadFence, recordFenceClear, resetFence } from '../src/games/fence/game/storage';
import { Rng } from '../src/shared/rng';

describe('grid', () => {
  test('lines, dots and squares line up', () => {
    const g = gridOf(2, 2);
    expect(g.edges).toBe(12);
    expect(g.ends[across(2, 1, 0)]).toEqual([1, 2]);
    expect(g.ends[down(2, 2, 2, 1)]).toEqual([5, 8]);
    expect(g.cellEdges[0]).toEqual([across(2, 0, 0), across(2, 0, 1), down(2, 2, 0, 0), down(2, 2, 1, 0)]);
    expect(g.dotEdges[4]).toHaveLength(4);
    expect(g.dotEdges[0]).toHaveLength(2);
  });

  test('the outline of a solid shape is one loop; two shapes are not', () => {
    const g = gridOf(3, 3);
    const one = outline(g, [true, true, false, true, false, false, false, false, false]);
    expect(isLoop(g, one)).toBe(true);
    const two = outline(g, [true, false, true, false, false, false, false, false, false]);
    expect(isLoop(g, two)).toBe(false);
  });

  test('grown shapes always have a single-loop outline', () => {
    for (let s = 0; s < 30; s++) {
      const w = 5 + (s % 3);
      const h = 6;
      const inside = growShape(w, h, 0.5, new Rng(s));
      expect(isLoop(gridOf(w, h), outline(gridOf(w, h), inside)), `seed ${s}`).toBe(true);
    }
  });
});

describe('solver', () => {
  test('a fully numbered board solves, and its answer is the shape', () => {
    const w = 4;
    const h = 4;
    const g = gridOf(w, h);
    const inside = growShape(w, h, 0.5, new Rng(7));
    const sol = outline(g, inside);
    const clues = g.cellEdges.map((es) => es.filter((e) => sol[e]).length);
    expect(solveLogic({ w, h, clues }).on).toEqual(sol);
  });

  test('counting: a 0 crosses out all four sides (and the dots round it follow on)', () => {
    const p = { w: 2, h: 2, clues: [0, -1, -1, -1] };
    const wave = nextWave(p, new Int8Array(gridOf(2, 2).edges));
    const crossed = wave.filter(([, v]) => v === OFF).map(([e]) => e);
    for (const e of gridOf(2, 2).cellEdges[0]) expect(crossed).toContain(e);
    expect(wave.every(([, v]) => v === OFF)).toBe(true);
  });

  test('every step has a name, and scores map to labels', () => {
    for (let t = 1; t <= 4; t++) expect(TIER_NAMES[t]).toBeTruthy();
    expect(fenceScore(2, 0, 0)).toBe(1);
    expect(fenceScore(3, 0, 5)).toBe(2);
    expect(fenceScore(4, 1, 5)).toBe(3);
    expect(fenceScore(4, 4, 5)).toBe(4);
    expect(rateFence(4)).toBe('Super Hard');
  });
});

describe('levels', () => {
  test('specs ramp and bring in each step on its level', () => {
    for (let n = 1; n <= 150; n++) {
      const s = fenceSpecFor(n);
      expect(s.w).toBeLessThanOrEqual(8);
      expect(s.h).toBeLessThanOrEqual(10);
      if (n < SIDES_INTRO) expect(s.target).toBe(1);
      if (n < TRIAL_INTRO) expect(s.target).toBeLessThanOrEqual(2);
    }
    expect(fenceSpecFor(SIDES_INTRO).tip).toBeTruthy();
  });

  test('levels 1 to 40 build, have one answer, and are the same built twice', () => {
    for (let n = 1; n <= 40; n++) {
      const l = buildFenceLevel(n);
      const g = gridOf(l.w, l.h);
      expect(isLoop(g, l.solution, l.clues), `level ${n}`).toBe(true);
      const r = solveLogic(l);
      expect(r.on).toEqual(l.solution);
      expect(fenceScore(r.hardest, r.trials, r.sides)).toBe(l.score);
      expect(l.difficulty).toBe(n <= TUTORIAL_COUNT ? 'Tutorial' : rateFence(l.score!));
      if (n % 10 === 0) expect(buildFenceLevel(n)).toEqual(l);
    }
  }, 300_000);
});

describe('session', () => {
  test('right marks stay, wrong ones show the truth and cost a heart, and crosses follow', () => {
    const l = buildFenceLevel(4);
    const s = new Session(l);
    // Zeros start crossed out.
    l.clues.forEach((n, cell) => n === 0 && s.g.cellEdges[cell].forEach((e) => expect(s.known[e]).toBe(OFF)));
    const on = l.solution.findIndex((v, e) => v && s.known[e] === UNKNOWN);
    expect(s.mark(on, 'fence')!.ok).toBe(true);
    const off = l.solution.findIndex((v, e) => !v && s.known[e] === UNKNOWN);
    const r = s.mark(off, 'fence')!;
    expect(r.ok).toBe(false);
    expect(s.known[off]).toBe(OFF);
    expect(s.hearts).toBe(START_HEARTS - 1);
    expect(s.mark(on, 'cross')).toBeNull();
  });

  test('placing all the fence wins; hints reveal lines the rules settle, for free', () => {
    const l = buildFenceLevel(12);
    const s = new Session(l);
    const before = s.known.slice();
    const wave = nextWave(l, before).map(([e]) => e);
    const e = s.hint()!;
    expect(wave).toContain(e);
    expect(s.known[e]).toBe(l.solution[e] ? ON : OFF);
    expect(s.hearts).toBe(START_HEARTS);
    l.solution.forEach((v, k) => v && s.known[k] === UNKNOWN && s.mark(k, 'fence'));
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
    const p = loadFence();
    recordFenceClear(p, 1, 2, 1, 5000);
    recordFenceClear(p, 1, 3, 0, 6000);
    expect(p.levels[1]).toEqual({ stars: 3, bestMoves: 0, bestMs: 5000 });
    expect(JSON.parse(mem.get(FENCE_KEY)!).unlocked).toBe(2);
    resetFence(p);
    expect(loadFence()).toEqual({ unlocked: 1, current: 1, levels: {} });
  });
});
