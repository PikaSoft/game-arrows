import { describe, expect, test } from 'vitest';
import { BASE_SPEED, FIELD_W, GROW, MAX_SPEED, SNAP, START_W, STREAK_TO_GROW, StackSim } from '../src/games/stack/core/sim';
import { loadStack, recordTower, resetStack, STACK_KEY } from '../src/games/stack/game/storage';

/** The time at which the sliding block's left edge is at x, on its first sweep. */
function timeAt(sim: StackSim, x: number): number {
  const lo = -sim.width / 2;
  const hi = FIELD_W - sim.width / 2;
  const along = sim.from < 0 ? x - lo : hi - x;
  return along / sim.speed;
}

describe('sliding', () => {
  test('the block sweeps from its side to the other and back', () => {
    const sim = new StackSim(1);
    const lo = -sim.width / 2;
    const hi = FIELD_W - sim.width / 2;
    const start = sim.xAt(0);
    expect(start).toBeCloseTo(sim.from < 0 ? lo : hi);
    const span = hi - lo;
    expect(sim.xAt(span / sim.speed)).toBeCloseTo(sim.from < 0 ? hi : lo);
    expect(sim.xAt((2 * span) / sim.speed)).toBeCloseTo(start);
  });

  test('it speeds up with height, up to a limit', () => {
    const sim = new StackSim(2);
    expect(sim.speed).toBe(BASE_SPEED);
    for (let k = 0; k < 200 && !sim.over; k++) sim.drop(timeAt(sim, sim.top.x));
    expect(sim.score).toBe(200);
    expect(sim.speed).toBe(MAX_SPEED);
  });
});

describe('dropping', () => {
  test('a drop dead on the tower is perfect and keeps its width', () => {
    const sim = new StackSim(3);
    const r = sim.drop(timeAt(sim, sim.top.x));
    expect(r.perfect).toBe(true);
    expect(r.cut).toBeNull();
    expect(sim.width).toBe(START_W);
    expect(sim.score).toBe(1);
  });

  test('a near miss snaps to perfect', () => {
    const sim = new StackSim(4);
    const r = sim.drop(timeAt(sim, sim.top.x + SNAP * 0.8));
    expect(r.perfect).toBe(true);
    expect(sim.top.x).toBe(new StackSim(4).top.x);
  });

  test('an overhang is cut off and the tower narrows', () => {
    const sim = new StackSim(5);
    const base = sim.top;
    const r = sim.drop(timeAt(sim, base.x + 1));
    expect(r.perfect).toBe(false);
    expect(r.placed).toEqual({ x: base.x + 1, w: START_W - 1 });
    expect(r.cut!.x).toBeCloseTo(base.x + base.w);
    expect(r.cut!.w).toBeCloseTo(1);
    expect(sim.width).toBeCloseTo(START_W - 1);
    // Overhanging on the left cuts the left part.
    const left = sim.drop(timeAt(sim, sim.top.x - 0.5));
    expect(left.cut!.w).toBeCloseTo(0.5);
    expect(left.placed!.x).toBeCloseTo(base.x + 1);
  });

  test('missing the tower completely ends the game', () => {
    // The block appears just clear of the tower, so dropping it at once misses.
    const sim = new StackSim(6);
    const r = sim.drop(0);
    expect(r.gameOver).toBe(true);
    expect(sim.over).toBe(true);
    expect(sim.score).toBe(0);
    expect(sim.drop(0).gameOver).toBe(true);
  });

  test('a run of perfect drops grows the block back, never past the start width', () => {
    const sim = new StackSim(7);
    sim.drop(timeAt(sim, sim.top.x + 1)); // narrow it to 4
    const narrow = sim.width;
    for (let k = 1; k < STREAK_TO_GROW; k++) expect(sim.drop(timeAt(sim, sim.top.x)).grew).toBe(false);
    const r = sim.drop(timeAt(sim, sim.top.x));
    expect(r.grew).toBe(true);
    expect(sim.width).toBeCloseTo(narrow + GROW);
    expect(sim.streak).toBe(STREAK_TO_GROW);
    for (let k = 0; k < 20; k++) sim.drop(timeAt(sim, sim.top.x));
    expect(sim.width).toBeCloseTo(START_W);
    for (const b of sim.stack) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(FIELD_W + 1e-9);
    }
  });

  test('the same seed gives the same sides each floor', () => {
    const a = new StackSim(42);
    const b = new StackSim(42);
    for (let k = 0; k < 10; k++) {
      expect(a.from).toBe(b.from);
      a.drop(timeAt(a, a.top.x));
      b.drop(timeAt(b, b.top.x));
    }
  });
});

describe('storage', () => {
  test('keeps the best tower and counts games', () => {
    const mem = new Map<string, string>();
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => mem.set(k, v),
      removeItem: (k: string) => mem.delete(k),
    };
    const p = loadStack();
    expect(recordTower(p, 12, 3)).toBe(0);
    expect(recordTower(p, 8, 5)).toBe(12);
    expect(p).toEqual({ best: 12, bestPerfects: 5, games: 2 });
    expect(JSON.parse(mem.get(STACK_KEY)!).best).toBe(12);
    resetStack(p);
    expect(loadStack()).toEqual({ best: 0, bestPerfects: 0, games: 0 });
  });
});
