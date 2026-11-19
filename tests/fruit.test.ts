import { describe, expect, test } from 'vitest';
import { BOUNCE_LEVELS, FruitSim, H, MAX_TILT_DEG, OVERFLOW_S, POP_BONUS, RADII, STEP_HZ, TOP_TIER, W, pointsFor } from '../src/games/fruit/core/sim';
import { sidewaysTip, tiltFromPhone } from '../src/games/fruit/game/tilt';
import { FRUIT_KEY, loadFruit, noteBests, recordGame, resetFruit, saveFruit } from '../src/games/fruit/game/storage';

/** Run the bucket for a while. */
function run(sim: FruitSim, seconds: number) {
  const merges = [];
  for (let i = 0; i < seconds * STEP_HZ && !sim.over; i++) merges.push(...sim.step().merges);
  return merges;
}

/** Drop a fruit of a chosen size (the dealt one is replaced). */
function dropTier(sim: FruitSim, tier: number, x: number) {
  run(sim, 0.5);
  sim.current = tier;
  expect(sim.drop(x)).toBe(true);
}

const speed = (sim: FruitSim) => Math.max(0, ...sim.bodies.map((b) => Math.hypot(b.vx, b.vy)));

describe('physics', () => {
  test('a fruit falls and comes to rest on the floor', () => {
    const sim = new FruitSim(1);
    dropTier(sim, 3, 0.5);
    run(sim, 3);
    const [b] = sim.bodies;
    expect(b.landed).toBe(true);
    expect(b.y).toBeCloseTo(H - RADII[3], 2);
    expect(b.x).toBeCloseTo(0.5, 2);
    expect(speed(sim)).toBeLessThan(0.05);
  });

  test('a drop is kept between the walls', () => {
    const sim = new FruitSim(1);
    dropTier(sim, 4, -5);
    expect(sim.bodies[0].x).toBeCloseTo(RADII[4]);
    dropTier(sim, 0, 99);
    expect(sim.bodies[1].x).toBeCloseTo(W - RADII[0]);
  });

  test('there is a short wait between drops', () => {
    const sim = new FruitSim(1);
    expect(sim.drop(0.5)).toBe(true);
    expect(sim.ready).toBe(false);
    expect(sim.drop(0.5)).toBe(false);
    run(sim, 0.5);
    expect(sim.ready).toBe(true);
  });

  test('different fruits push each other but never merge or overlap', () => {
    const sim = new FruitSim(2);
    const tiers = [0, 1, 2, 3, 4, 5, 6];
    for (const [i, t] of tiers.entries()) dropTier(sim, t, 0.3 + 0.07 * i);
    run(sim, 6);
    expect(sim.bodies.map((b) => b.tier).sort()).toEqual(tiers);
    expect(sim.score).toBe(0);
    for (const a of sim.bodies) {
      const r = RADII[a.tier];
      expect(a.x).toBeGreaterThan(r - 0.005);
      expect(a.x).toBeLessThan(W - r + 0.005);
      expect(a.y).toBeLessThan(H - r + 0.005);
      for (const b of sim.bodies) {
        if (a.id >= b.id) continue;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(r + RADII[b.tier] - 0.006);
      }
    }
    expect(speed(sim)).toBeLessThan(0.1);
  });

  test('a fruit dropped on the side of another rolls off it', () => {
    const sim = new FruitSim(2);
    dropTier(sim, 6, 0.5);
    run(sim, 2);
    dropTier(sim, 2, 0.56);
    run(sim, 3);
    const small = sim.bodies.find((b) => b.tier === 2)!;
    expect(small.x).toBeGreaterThan(0.5 + RADII[6]);
    expect(small.y).toBeCloseTo(H - RADII[2], 2);
    expect(small.angle).not.toBe(0);
  });
});

describe('merging', () => {
  test('two equal fruits join into the next size and score', () => {
    const sim = new FruitSim(3);
    dropTier(sim, 2, 0.5);
    run(sim, 2);
    dropTier(sim, 2, 0.5);
    const merges = run(sim, 2);
    expect(merges).toHaveLength(1);
    expect(merges[0].tier).toBe(3);
    expect(sim.bodies).toHaveLength(1);
    expect(sim.bodies[0].tier).toBe(3);
    expect(sim.score).toBe(pointsFor(3));
    expect(sim.biggest).toBe(3);
  });

  test('a join can set off another', () => {
    const sim = new FruitSim(3);
    // A raspberry and a blueberry resting side by side on the floor.
    const at = (id: number, tier: number, x: number) => ({ id, tier, x, y: H - RADII[tier], vx: 0, vy: 0, angle: 0, spin: 0, landed: true });
    sim.bodies.push(at(101, 1, 0.3), at(102, 0, 0.3 + RADII[0] + RADII[1]));
    run(sim, 1);
    expect(sim.bodies).toHaveLength(2);
    dropTier(sim, 0, sim.bodies[1].x + 0.01);
    run(sim, 3);
    // 0 + 0 makes a 1 that touches the raspberry beside it, and the two make a 2.
    expect(sim.bodies.map((b) => b.tier)).toEqual([2]);
    expect(sim.score).toBe(pointsFor(1) + pointsFor(2));
  });

  test('two of the largest pop for a bonus', () => {
    const sim = new FruitSim(3);
    dropTier(sim, TOP_TIER, 0.3);
    run(sim, 2);
    dropTier(sim, TOP_TIER, 0.7);
    const merges = run(sim, 2);
    expect(merges.map((m) => m.tier)).toEqual([-1]);
    expect(sim.bodies).toHaveLength(0);
    expect(sim.score).toBe(POP_BONUS);
  });
});

describe('overflow', () => {
  test('a fruit falling past the rim does not end the game', () => {
    const sim = new FruitSim(4);
    for (let i = 0; i < 6; i++) {
      dropTier(sim, i % 2 ? 4 : 3, 0.2 + 0.12 * i);
      run(sim, 1.5);
    }
    expect(sim.over).toBe(false);
    expect(sim.danger).toBe(0);
  });

  test('a pile that stays above the rim ends it after a pause', () => {
    const sim = new FruitSim(4);
    // Big fruit, mostly of different kinds, until there is no room left.
    let drops = 0;
    while (!sim.over && drops < 60) {
      dropTier(sim, [9, 7, 8, 6][drops % 4], drops % 2 ? 0.25 : 0.75);
      drops++;
      run(sim, 1.5);
    }
    expect(sim.over).toBe(true);
    expect(drops).toBeGreaterThan(2);
    expect(sim.danger).toBe(1);
    expect(sim.drop(0.5)).toBe(false);
    // Nothing moves once the game is over.
    const before = JSON.stringify(sim.bodies);
    sim.step();
    expect(JSON.stringify(sim.bodies)).toBe(before);
    expect(OVERFLOW_S).toBeGreaterThan(1);
  });
});

describe('repeatable games', () => {
  const play = (seed: number) => {
    const sim = new FruitSim(seed);
    for (let i = 0; i < 25 && !sim.over; i++) {
      sim.drop(0.1 + ((i * 37) % 80) / 100);
      run(sim, 0.8);
    }
    return sim;
  };

  test('the same seed and drops give the same bucket', () => {
    expect(JSON.stringify(play(7).save())).toBe(JSON.stringify(play(7).save()));
    expect(JSON.stringify(play(7).save())).not.toBe(JSON.stringify(play(8).save()));
  });

  test('only small fruits are dealt', () => {
    const sim = new FruitSim(9);
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      seen.add(sim.current);
      sim.drop(0.5);
      run(sim, 0.5);
      sim.bodies = [];
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  test('a saved game carries on exactly where it stopped', () => {
    const a = play(11);
    const b = FruitSim.restore(JSON.parse(JSON.stringify(a.save())))!;
    expect(b).not.toBeNull();
    for (const sim of [a, b]) {
      for (let i = 0; i < 5; i++) {
        sim.drop(0.3 + 0.1 * i);
        run(sim, 0.8);
      }
    }
    expect(JSON.stringify(b.save())).toBe(JSON.stringify(a.save()));
  });

  test('broken saved data is refused', () => {
    const s = play(11).save();
    expect(FruitSim.restore({ ...s, bodies: [{ ...s.bodies[0], tier: 42 }] })).toBeNull();
    expect(FruitSim.restore({ ...s, current: -1 })).toBeNull();
    expect(FruitSim.restore({} as never)).toBeNull();
  });
});

describe('storage', () => {
  test('keeps bests, counts games and holds a game in progress', () => {
    const mem = new Map<string, string>();
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => mem.set(k, v),
      removeItem: (k: string) => mem.delete(k),
    };
    const p = loadFruit();
    expect(p).toEqual({ bestScore: 0, bestFruit: -1, games: 0, saved: null, bounce: 'low' });
    p.saved = new FruitSim(1).save();
    saveFruit(p);
    expect(loadFruit().saved?.seed).toBe(1);
    noteBests(p, 30, 4);
    recordGame(p, 20, 6);
    expect(p).toEqual({ bestScore: 30, bestFruit: 6, games: 1, saved: null, bounce: 'low' });
    expect(JSON.parse(mem.get(FRUIT_KEY)!).bestScore).toBe(30);
    resetFruit(p);
    expect(loadFruit()).toEqual({ bestScore: 0, bestFruit: -1, games: 0, saved: null, bounce: 'low' });
  });
});

describe('bounciness', () => {
  /** Drop a fruit from high up and report the fastest it moves upward after first landing. */
  function rebound(restitution: number) {
    const sim = new FruitSim(1);
    sim.restitution = restitution;
    dropTier(sim, 3, 0.5);
    let up = 0;
    for (let i = 0; i < 2 * STEP_HZ; i++) {
      sim.step();
      const [b] = sim.bodies;
      if (b.landed) up = Math.max(up, -b.vy);
    }
    return up;
  }

  test('higher bounciness makes a fruit rebound higher', () => {
    const none = rebound(BOUNCE_LEVELS.none);
    const low = rebound(BOUNCE_LEVELS.low);
    const high = rebound(BOUNCE_LEVELS.super);
    expect(none).toBeLessThan(0.05);
    expect(low).toBeGreaterThan(none);
    expect(high).toBeGreaterThan(low * 2);
  });

  test('a bouncy fruit still comes to rest', () => {
    const sim = new FruitSim(1);
    sim.restitution = BOUNCE_LEVELS.super;
    dropTier(sim, 3, 0.5);
    run(sim, 12);
    expect(speed(sim)).toBeLessThan(0.05);
  });

  test('the bounciness choice is stored, validated, and kept on reset', () => {
    localStorage.setItem(FRUIT_KEY, JSON.stringify({ bestScore: 5, bounce: 'bogus' }));
    expect(loadFruit().bounce).toBe('low');
    const p = loadFruit();
    p.bounce = 'high';
    saveFruit(p);
    expect(loadFruit().bounce).toBe('high');
    resetFruit(p);
    expect(p.bounce).toBe('high');
    expect(loadFruit().bounce).toBe('high');
    expect(loadFruit().bestScore).toBe(0);
  });
});

describe('tilt', () => {
  const MAX = (MAX_TILT_DEG * Math.PI) / 180;

  test('the lean is kept to a few degrees', () => {
    const sim = new FruitSim(1);
    sim.setTilt(1);
    expect(sim.tilt).toBeCloseTo(MAX);
    sim.setTilt(-1);
    expect(sim.tilt).toBeCloseTo(-MAX);
    sim.setTilt(NaN);
    expect(sim.tilt).toBeCloseTo(-MAX);
    sim.setTilt(0.01);
    expect(sim.tilt).toBe(0.01);
  });

  test('a lean rolls loose fruit to the low side', () => {
    const level = new FruitSim(1);
    dropTier(level, 2, 0.5);
    run(level, 3);
    expect(level.bodies[0].x).toBeCloseTo(0.5, 2);

    const right = new FruitSim(1);
    right.setTilt(1);
    dropTier(right, 2, 0.5);
    run(right, 4);
    expect(right.bodies[0].x).toBeCloseTo(W - RADII[2], 2);

    const left = new FruitSim(1);
    left.setTilt(-1);
    dropTier(left, 2, 0.5);
    run(left, 4);
    expect(left.bodies[0].x).toBeCloseTo(RADII[2], 2);
  });

  test('the lean is not saved with the game', () => {
    const sim = new FruitSim(1);
    sim.setTilt(1);
    dropTier(sim, 1, 0.5);
    const back = FruitSim.restore(JSON.parse(JSON.stringify(sim.save())))!;
    expect(back.tilt).toBe(0);
    expect(back.bodies).toEqual(sim.bodies);
  });

  test('phone tip maps to a small, capped lean', () => {
    expect(tiltFromPhone(0)).toBe(0);
    expect(tiltFromPhone(2)).toBe(0);
    expect(tiltFromPhone(-2)).toBe(0);
    expect(tiltFromPhone(11.5)).toBeCloseTo(MAX / 2);
    expect(tiltFromPhone(20)).toBeCloseTo(MAX);
    expect(tiltFromPhone(90)).toBeCloseTo(MAX);
    expect(tiltFromPhone(-90)).toBeCloseTo(-MAX);
    expect(tiltFromPhone(NaN)).toBe(0);
  });

  test('phone tip is read the same held flat or upright, and follows screen rotation', () => {
    // Flat on a table, right edge lowered 10 degrees.
    expect(sidewaysTip({ beta: 0, gamma: 10 }, 0)).toBeCloseTo(10);
    // Held upright and level.
    expect(Math.abs(sidewaysTip({ beta: 90, gamma: 0 }, 0)!)).toBeLessThan(1e-9);
    // Held at 45 degrees and rolled right a little.
    expect(sidewaysTip({ beta: 45, gamma: 10 }, 0)!).toBeGreaterThan(5);
    // Screen turned: the left-to-right line follows the phone's long edge.
    expect(sidewaysTip({ beta: 10, gamma: 0 }, 90)).toBeCloseTo(10);
    expect(sidewaysTip({ beta: 10, gamma: 0 }, 270)).toBeCloseTo(-10);
    expect(sidewaysTip({ beta: 0, gamma: 10 }, 180)).toBeCloseTo(-10);
    expect(sidewaysTip({ beta: null, gamma: 10 }, 0)).toBeNull();
  });
});
