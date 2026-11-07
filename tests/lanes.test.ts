import { describe, expect, test } from 'vitest';
import { Course, LANES, movesAt, passable } from '../src/games/lanes/core/course';
import { GRACE_SECONDS, LanesSim, MAX_SPEED, speedAt, START_SPEED, STEP_HZ } from '../src/games/lanes/core/sim';
import { LANES_KEY, loadLanes, recordRun, resetLanes } from '../src/games/lanes/game/storage';

type Act = 'stay' | 'left' | 'right' | 'jump';

/**
 * Find a route through rows (nearest first) with the same rules `passable` uses, and
 * return its first action, or null if there is none. Used to steer a test player.
 */
function plan(rows: string[], lane: number, wait: number, air: number, laneRows: number, jumpRows: number): Act | null {
  let states = new Map<string, Act>([[`${lane},${wait},${air}`, 'stay']]);
  rows.forEach((row, k) => {
    const next = new Map<string, Act>();
    for (const [s, act] of states) {
      const [l0, w, a] = s.split(',').map(Number);
      const up = a > 0;
      const opts: [number, number, number, boolean, Act][] = [[l0, Math.max(0, w - 1), Math.max(0, a - 1), up, 'stay']];
      if (w === 0) {
        if (l0 > 0) opts.push([l0 - 1, laneRows - 1, Math.max(0, a - 1), up, 'left']);
        if (l0 < LANES - 1) opts.push([l0 + 1, laneRows - 1, Math.max(0, a - 1), up, 'right']);
      }
      if (a === 0) opts.push([l0, Math.max(0, w - 1), jumpRows - 1, true, 'jump']);
      for (const [l, w2, a2, inAir, act2] of opts) {
        if (row[l] === '#' || (row[l] === '^' && !inAir)) continue;
        const key = `${l},${w2},${a2}`;
        if (!next.has(key)) next.set(key, k === 0 ? act2 : act);
      }
    }
    states = next;
  });
  const acts = [...states.values()];
  return acts.length ? (acts.includes('stay') ? 'stay' : acts[0]) : null;
}

/** Run a test player that plans each row as it reaches it. Returns the sim. */
function autorun(seed: number, metres: number): LanesSim {
  const sim = new LanesSim(seed);
  let lastRow = -1;
  let wait = 0;
  while (!sim.over && sim.distance < metres) {
    const r = Math.floor(sim.distance);
    if (r !== lastRow) {
      lastRow = r;
      if (wait > 0) wait--;
      const rows: string[] = [];
      for (let k = r; k < r + 16; k++) {
        const row = ['.', '.', '.'];
        for (const t of sim.course.things) if (Math.floor(t.row) === k && t.kind !== 'coin') row[t.lane] = t.kind === 'wall' ? '#' : '^';
        rows.push(row.join(''));
      }
      const m = movesAt(sim.speed);
      const act = plan(rows, sim.lane, wait, Math.ceil(sim.airLeft * sim.speed), m.laneRows, m.jumpRows);
      if (act === 'left' || act === 'right') {
        sim.move(act === 'left' ? -1 : 1);
        wait = m.laneRows;
      } else if (act === 'jump') sim.jump();
    }
    sim.step();
  }
  return sim;
}

describe('passable', () => {
  const m = { laneRows: 2, jumpRows: 3 };

  test('a wall in your lane needs a lane change; three walls across is impossible', () => {
    expect(passable(['#..'], 0, m)).toBe(true); // move over on that very row
    expect(passable(['###'], 1, m)).toBe(false);
  });

  test('hurdles are jumped, walls are not', () => {
    expect(passable(['^^^'], 1, m)).toBe(true);
    expect(passable(['...', '^^^', '...', '###'], 1, m)).toBe(false);
  });

  test('a wall right after a lane change needs the wait to have run out', () => {
    // From lane 0: move to 1 on the first row; row 3 walls lane 1, so another move is
    // needed by then. With laneRows 2 that's allowed; with 3 it isn't.
    const rows = ['#..', '...', '.#.'];
    expect(passable(rows, 0, { laneRows: 2, jumpRows: 3 })).toBe(true);
    expect(passable(rows, 0, { laneRows: 3, jumpRows: 3 })).toBe(false);
  });

  test('moves get slower to make as speed rises, with no float slips', () => {
    expect(movesAt(7).laneRows).toBe(2);
    expect(movesAt(15).laneRows).toBe(3); // 15 x 0.2 is 3.0000000000000004 in floats
    expect(movesAt(16).laneRows).toBe(4);
    expect(movesAt(7).jumpRows).toBe(3);
  });
});

describe('course', () => {
  test('no row is ever walled right across', () => {
    const c = new Course(9);
    c.extend(2000, speedAt);
    for (let r = 0; r < 1980; r += 1) {
      const rows: string[] = [];
      for (let k = r; k < r + 14; k++) {
        const row = ['.', '.', '.'];
        for (const t of c.things) if (t.row === k && t.kind !== 'coin') row[t.lane] = t.kind === 'wall' ? '#' : '^';
        rows.push(row.join(''));
      }
      // Never a row blocked right across.
      expect(rows[0]).not.toBe('###');
    }
    expect(c.things.length).toBeGreaterThan(100);
  });

  test('a player who plans ahead can run 2000 metres to top speed', () => {
    for (const seed of [3, 17]) {
      const sim = autorun(seed, 2000);
      expect(sim.over).toBe(false);
      expect(sim.speed).toBe(MAX_SPEED);
      expect(sim.coins).toBeGreaterThan(0);
    }
  }, 60000);

  test('the same seed lays the same course', () => {
    const a = new Course(5);
    const b = new Course(5);
    a.extend(500, speedAt);
    b.extend(500, speedAt);
    expect(a.things).toEqual(b.things);
  });
});

describe('sim', () => {
  /** A sim with just the things given, nothing else on the course. */
  const bare = (things: { row: number; lane: number; kind: 'wall' | 'hurdle' | 'coin' }[]) => {
    const s = new LanesSim(1);
    s.course.things = things;
    s.course.laidTo = 1e9;
    return s;
  };
  const runTo = (s: LanesSim, d: number) => {
    while (s.distance < d && !s.over) s.step();
  };

  test('speed starts easy and tops out', () => {
    expect(speedAt(0)).toBe(START_SPEED);
    expect(speedAt(100000)).toBe(MAX_SPEED);
  });

  test('running into a wall ends the run; changing lane in time avoids it', () => {
    const s = bare([{ row: 5, lane: 1, kind: 'wall' }]);
    runTo(s, 6);
    expect(s.over).toBe(true);
    const t = bare([{ row: 5, lane: 1, kind: 'wall' }]);
    runTo(t, 4.5);
    t.move(1);
    runTo(t, 7);
    expect(t.over).toBe(false);
  });

  test('a swipe just after touching a wall still saves you', () => {
    const s = bare([{ row: 5, lane: 1, kind: 'wall' }]);
    // Run until touching, then a little less than the grace window more.
    runTo(s, 5 - 0.3);
    const steps = Math.floor(GRACE_SECONDS * STEP_HZ) - 2;
    for (let k = 0; k < steps; k++) s.step();
    expect(s.over).toBe(false);
    s.move(-1);
    runTo(s, 7);
    expect(s.over).toBe(false);
  });

  test('hurdles are cleared by a jump but walls are not', () => {
    const s = bare([{ row: 5, lane: 1, kind: 'hurdle' }]);
    runTo(s, 4.6);
    expect(s.jump()).toBe(true);
    expect(s.jump()).toBe(false); // not again in the air
    runTo(s, 7);
    expect(s.over).toBe(false);
    const t = bare([{ row: 5, lane: 1, kind: 'wall' }]);
    runTo(t, 4.6);
    t.jump();
    runTo(t, 7);
    expect(t.over).toBe(true);
  });

  test('coins are collected once, in or out of the air', () => {
    const s = bare([
      { row: 3, lane: 1, kind: 'coin' },
      { row: 8, lane: 1, kind: 'coin' },
      { row: 8, lane: 2, kind: 'coin' },
    ]);
    runTo(s, 7.5);
    s.jump();
    runTo(s, 10);
    expect(s.coins).toBe(2);
    expect(s.move(1)).toBe(true);
    expect(s.move(1)).toBe(false); // already at the edge
  });
});

describe('storage', () => {
  test('keeps the best run, the most coins and totals', () => {
    const mem = new Map<string, string>();
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => mem.set(k, v),
      removeItem: (k: string) => mem.delete(k),
    };
    const p = loadLanes();
    expect(recordRun(p, 320, 9)).toBe(0);
    expect(recordRun(p, 150, 12)).toBe(320);
    expect(p).toEqual({ best: 320, bestCoins: 12, coins: 21, runs: 2 });
    expect(JSON.parse(mem.get(LANES_KEY)!).best).toBe(320);
    resetLanes(p);
    expect(loadLanes()).toEqual({ best: 0, bestCoins: 0, coins: 0, runs: 0 });
  });
});
