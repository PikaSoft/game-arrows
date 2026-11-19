import { beforeEach, describe, expect, test } from 'vitest';
import { bendCap, Cave, CLIMB, GEM_INSET, LEAD_IN, MAX_SPEED, MAX_VY, MIN_GAP, SINK, slopeCap, speedAt, START_GAP, VIEW_H } from '../src/games/glider/core/cave';
import { autopilot, GliderSim, HIT_R, STEP_HZ } from '../src/games/glider/core/sim';
import { GLIDER_KEY, loadGlider, recordFlight, resetGlider } from '../src/games/glider/game/storage';
import { HELP } from '../src/games/help';

describe('cave', () => {
  test('the same seed lays the same cave', () => {
    const a = new Cave(5);
    const b = new Cave(5);
    a.extend(500);
    b.extend(500);
    expect(a.centre).toEqual(b.centre);
    expect(a.gems).toEqual(b.gems);
  });

  test('gaps stay above the floor, bends within what the glider can follow, walls on screen', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const c = new Cave(seed);
      c.extend(3000);
      for (let i = 1; i < 3000; i++) {
        expect(c.gap[i]).toBeGreaterThanOrEqual(MIN_GAP - 1e-9);
        expect(c.gap[i]).toBeLessThanOrEqual(START_GAP + 1e-9);
        const slope = c.centre[i] - c.centre[i - 1];
        expect(Math.abs(slope)).toBeLessThanOrEqual(slopeCap(i) + 1e-9);
        if (i > 1) expect(Math.abs(slope - (c.centre[i - 1] - c.centre[i - 2]))).toBeLessThanOrEqual(Math.max(bendCap(i), bendCap(i - 1)) + 1e-9);
        const [top, bottom] = c.walls(i);
        expect(top).toBeGreaterThan(0);
        expect(bottom).toBeLessThan(VIEW_H);
      }
      // The start is straight and wide.
      for (let i = 0; i <= LEAD_IN; i++) expect(c.centre[i]).toBe(VIEW_H / 2);
    }
  });

  test('gems sit inside the gap, a little in from a wall', () => {
    const c = new Cave(7);
    c.extend(2000);
    expect(c.gems.length).toBeGreaterThan(20);
    for (const g of c.gems) {
      const [top, bottom] = c.walls(g.x);
      expect(g.y).toBeGreaterThanOrEqual(top + GEM_INSET - 1e-9);
      expect(g.y).toBeLessThanOrEqual(bottom - GEM_INSET + 1e-9);
    }
  });

  test('speed starts gentle and caps', () => {
    expect(speedAt(0)).toBeLessThan(MAX_SPEED);
    expect(speedAt(1e6)).toBe(MAX_SPEED);
  });
});

describe('flight', () => {
  test('holding climbs and letting go sinks, both capped', () => {
    const s = new GliderSim(1);
    s.hold(true);
    for (let k = 0; k < STEP_HZ / 10; k++) s.step();
    expect(s.vy).toBeLessThan(0);
    expect(s.vy).toBeCloseTo(-(CLIMB / 10), 1);
    s.hold(false);
    for (let k = 0; k < STEP_HZ / 4; k++) s.step();
    expect(s.vy).toBeGreaterThan(0);
    const t = new GliderSim(1);
    for (let k = 0; k < STEP_HZ; k++) t.step();
    expect(t.over).toBe(true); // sank into the floor
    expect(Math.abs(t.vy)).toBeLessThanOrEqual(MAX_VY);
    expect(SINK).toBeGreaterThan(0);
  });

  test('touching a wall ends the flight', () => {
    const s = new GliderSim(2);
    const [top] = s.cave.walls(s.x);
    s.y = top + HIT_R * 0.5;
    s.step();
    expect(s.over).toBe(true);
  });

  test('a gem in the way is picked up once', () => {
    const s = new GliderSim(3);
    s.cave.gems.push({ x: s.x + 0.2, y: s.y, taken: false });
    s.hold(true);
    let got = 0;
    for (let k = 0; k < 30; k++) got += s.step().gems.length;
    expect(got).toBe(1);
    expect(s.gems).toBe(1);
  });

  test('a simple pilot flies 3,000 units to top speed on every seed: the cave can always be flown', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const s = new GliderSim(seed);
      while (!s.over && s.x < 3000) {
        s.hold(autopilot(s));
        s.step();
      }
      expect(s.over, `seed ${seed} crashed at ${Math.round(s.x)}`).toBe(false);
      expect(s.speed).toBe(MAX_SPEED);
    }
  }, 120_000);
});

describe('help', () => {
  test('the first-flight tip is in How to play', async () => {
    const { FIRST_TIP } = await import('../src/games/glider/ui');
    expect(HELP.glider.tips).toContain(FIRST_TIP);
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

  test('keeps bests and totals, and resets', () => {
    const p = loadGlider();
    expect(recordFlight(p, 120, 3)).toBe(0);
    expect(recordFlight(p, 80, 5)).toBe(120);
    expect(loadGlider()).toEqual({ best: 120, bestGems: 5, gems: 8, runs: 2 });
    expect(JSON.parse(mem.get(GLIDER_KEY)!).runs).toBe(2);
    resetGlider(p);
    expect(loadGlider()).toEqual({ best: 0, bestGems: 0, gems: 0, runs: 0 });
  });
});
