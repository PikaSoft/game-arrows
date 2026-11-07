import { describe, expect, test } from 'vitest';
import { Rng } from '../src/shared/rng';
import { BRICKS_THRESHOLDS, rateBricks, STEEL_INTRO, TUTORIAL_COUNT } from '../src/games/bricks/core/difficulty';
import { buildBricksLevel, pocketed, reachable } from '../src/games/bricks/core/levels';
import { BALL_R, BricksSim, PADDLE_Y, START_LIVES, STEP_HZ } from '../src/games/bricks/core/sim';
import { BRICK_H, BricksLevel, FIELD_W, UNBREAKABLE, WALL_TOP } from '../src/games/bricks/core/types';
import { BRICKS_KEY, loadBricks, recordBricksClear, resetBricks } from '../src/games/bricks/game/storage';

const lvl = (rows: number[][], speed = 12, powerUps = false): BricksLevel => ({ number: 99, rows, speed, powerUps, difficulty: 'Easy' });
const empty = () => new Array(FIELD_W).fill(0);
/** A wall with one brick in the top-right corner, out of the way: an empty wall counts as cleared. */
const corner = () => {
  const row = empty();
  row[FIELD_W - 1] = 1;
  return row;
};

/**
 * A simple player: keeps the paddle under the lowest ball coming down, and aims each hit
 * at one of the lowest bricks left by choosing where on the paddle the ball lands.
 */
function autoplay(sim: BricksSim, seconds: number, seed = 1): void {
  const rng = new Rng(seed);
  const MAX_DEFLECT = (62 * Math.PI) / 180;
  const pickAim = () => {
    const targets: [number, number][] = [];
    sim.wall.forEach((row, r) => row.forEach((v, c) => v > 0 && v !== UNBREAKABLE && targets.push([r, c])));
    if (!targets.length) return 0;
    targets.sort((a, b) => b[0] - a[0]);
    const [r, c] = targets[Math.floor(rng.next() * Math.min(4, targets.length))];
    const off = Math.atan2(c + 0.5 - sim.paddleX, PADDLE_Y - (WALL_TOP + (r + 0.5) * BRICK_H)) / MAX_DEFLECT;
    return Math.max(-0.95, Math.min(0.95, off)) * (sim.paddleW / 2);
  };
  let aim = 0;
  for (let k = 0; k < seconds * STEP_HZ && !sim.over; k++) {
    if (sim.waiting) {
      sim.serve();
      aim = pickAim();
    }
    const down = sim.balls.filter((b) => b.vy > 0).sort((a, b) => b.y - a.y)[0] ?? sim.balls[0];
    if (down) {
      const tx = down.x + (down.vx / Math.max(1e-6, down.vy)) * Math.max(0, PADDLE_Y - down.y);
      const fx = ((tx % 24) + 24) % 24;
      const land = fx > 12 ? 24 - fx : fx;
      const step = 28 / STEP_HZ;
      sim.movePaddle(sim.paddleX + Math.max(-step, Math.min(step, land - aim - sim.paddleX)));
    }
    if (sim.step().paddle) aim = pickAim();
  }
}

describe('sim', () => {
  test('the ball waits on the paddle until served, then flies up', () => {
    const sim = new BricksSim(lvl([[1, ...new Array(11).fill(0)]]));
    sim.step();
    expect(sim.balls.length).toBe(0);
    sim.serve();
    expect(sim.balls.length).toBe(1);
    expect(sim.balls[0].vy).toBeLessThan(0);
    expect(Math.hypot(sim.balls[0].vx, sim.balls[0].vy)).toBeCloseTo(12);
  });

  test('walls bounce the ball, and it keeps its speed', () => {
    const sim = new BricksSim(lvl([corner()]));
    sim.serve();
    sim.balls[0] = { x: 0.5, y: 10, vx: -12, vy: -1 };
    for (let k = 0; k < 20; k++) sim.step();
    expect(sim.balls[0].vx).toBeGreaterThan(0);
    expect(Math.hypot(sim.balls[0].vx, sim.balls[0].vy)).toBeCloseTo(Math.hypot(12, 1));
  });

  test('the ball never runs flat: it always climbs or falls at a fair angle', () => {
    const sim = new BricksSim(lvl([corner()]));
    sim.serve();
    sim.balls[0] = { x: 6, y: 10, vx: 12, vy: -0.01 };
    sim.step();
    const b = sim.balls[0];
    expect(Math.abs(b.vy) / Math.hypot(b.vx, b.vy)).toBeGreaterThan(Math.sin((21 * Math.PI) / 180));
  });

  test('where the ball lands on the paddle sets its angle', () => {
    const angleAfter = (offset: number) => {
      const sim = new BricksSim(lvl([corner()]));
      sim.serve();
      sim.movePaddle(6);
      sim.balls[0] = { x: 6 + offset, y: PADDLE_Y - BALL_R - 0.01, vx: 0, vy: 12 };
      sim.step();
      return Math.atan2(sim.balls[0].vx, -sim.balls[0].vy);
    };
    expect(angleAfter(0)).toBeCloseTo(0);
    expect(angleAfter(1)).toBeGreaterThan(0.6);
    expect(angleAfter(-1)).toBeLessThan(-0.6);
  });

  test('a hit knocks a brick down a level; steel never breaks', () => {
    const row = empty();
    row[5] = 2;
    row[6] = UNBREAKABLE;
    const sim = new BricksSim(lvl([row]));
    sim.serve();
    const y = WALL_TOP + BRICK_H + BALL_R - 0.02;
    sim.balls[0] = { x: 5.5, y, vx: 0, vy: -12 };
    const ev = sim.step();
    expect(ev.bricksHit).toEqual([{ row: 0, col: 5, broke: false }]);
    expect(sim.wall[0][5]).toBe(1);
    expect(sim.balls[0].vy).toBeGreaterThan(0);
    sim.balls[0] = { x: 6.5, y, vx: 0, vy: -12 };
    sim.step();
    expect(sim.wall[0][6]).toBe(UNBREAKABLE);
  });

  test('dropping the ball costs a life; dropping all three ends the level', () => {
    const sim = new BricksSim(lvl([[1, ...new Array(11).fill(0)]]));
    for (let life = START_LIVES; life > 0; life--) {
      sim.serve();
      sim.movePaddle(11); // out of the way
      sim.balls[0] = { x: 2, y: PADDLE_Y + 1, vx: 0, vy: 12 };
      let ev = sim.step();
      for (let k = 0; k < STEP_HZ && !ev.lifeLost; k++) ev = sim.step();
      expect(sim.lives).toBe(life - 1);
    }
    expect(sim.over).toBe(true);
    expect(sim.cleared).toBe(false);
  });

  test('a multi-ball capsule splits the ball into three', () => {
    const sim = new BricksSim(lvl([corner()], 12, true));
    sim.serve();
    sim.capsules.push({ x: sim.paddleX, y: PADDLE_Y - 0.1, kind: 'multi' });
    sim.balls[0] = { x: 3, y: 8, vx: 3, vy: -11 };
    const ev = sim.step();
    expect(ev.caught).toEqual(['multi']);
    expect(sim.balls.length).toBe(3);
  });

  test('the slow capsule slows every ball, and it wears off', () => {
    const sim = new BricksSim(lvl([corner()], 12, true));
    sim.serve();
    sim.balls[0] = { x: 3, y: 8, vx: 0, vy: -12 };
    sim.capsules.push({ x: sim.paddleX, y: PADDLE_Y - 0.1, kind: 'slow' });
    sim.step();
    expect(Math.hypot(sim.balls[0].vx, sim.balls[0].vy)).toBeCloseTo(9);
    sim.slowLeft = 1 / STEP_HZ / 2;
    sim.step();
    expect(Math.hypot(sim.balls[0].vx, sim.balls[0].vy)).toBeCloseTo(12);
  });
});

describe('levels', () => {
  test('walls are mirrored, reachable and free of pockets', () => {
    for (let n = 1; n <= 60; n++) {
      const l = buildBricksLevel(n);
      for (const row of l.rows) expect(row).toEqual(row.slice().reverse());
      expect(reachable(l.rows)).toBe(true);
      expect(pocketed(l.rows)).toBe(false);
      expect(l.rows.flat().some((v) => v > 0 && v !== UNBREAKABLE)).toBe(true);
    }
  });

  test('steel arrives on its intro level, not before', () => {
    expect(buildBricksLevel(STEEL_INTRO).rows.flat()).toContain(UNBREAKABLE);
    for (let n = 1; n < STEEL_INTRO; n++) expect(buildBricksLevel(n).rows.flat()).not.toContain(UNBREAKABLE);
  });

  test('reachable spots a brick sealed in by steel', () => {
    const rows = [empty(), empty(), empty()];
    rows[0][5] = 1; // top row, boxed in below and to the sides
    rows[1][5] = UNBREAKABLE;
    rows[0][4] = UNBREAKABLE;
    rows[0][6] = UNBREAKABLE;
    // Boxed in below and beside, but the ball can go up an empty column, along the open
    // space above the wall, and come down onto it.
    expect(reachable(rows)).toBe(true);
    // Make the whole middle row steel: now nothing can get past it to the top.
    for (let c = 0; c < FIELD_W; c++) rows[1][c] = UNBREAKABLE;
    expect(reachable(rows)).toBe(false);
  });

  test('a player who aims can clear the first levels with time to spare', () => {
    for (const n of [1, 2, 3, 6, 12, 20]) {
      const sim = new BricksSim(buildBricksLevel(n));
      autoplay(sim, 400, n);
      expect(sim.cleared).toBe(true);
    }
  }, 60000);

  test('the same level is the same wall every time, and labels follow the score', () => {
    for (const n of [1, 13, 40]) expect(buildBricksLevel(n)).toEqual(buildBricksLevel(n));
    for (let n = 1; n <= TUTORIAL_COUNT; n++) expect(buildBricksLevel(n).difficulty).toBe('Tutorial');
    for (let n = TUTORIAL_COUNT + 1; n <= 40; n++) expect(buildBricksLevel(n).difficulty).toBe(rateBricks(buildBricksLevel(n).score!));
    expect(rateBricks(BRICKS_THRESHOLDS[0] - 0.1)).toBe('Easy');
    expect(rateBricks(BRICKS_THRESHOLDS[2])).toBe('Super Hard');
  });
});

describe('storage', () => {
  test('records clears and resets', () => {
    const mem = new Map<string, string>();
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => mem.set(k, v),
      removeItem: (k: string) => mem.delete(k),
    };
    const p = loadBricks();
    recordBricksClear(p, 1, 2, 1, 90000);
    recordBricksClear(p, 1, 3, 0, 100000);
    expect(p.levels[1]).toEqual({ stars: 3, bestMoves: 0, bestMs: 90000 });
    expect(JSON.parse(mem.get(BRICKS_KEY)!).unlocked).toBe(2);
    resetBricks(p);
    expect(loadBricks()).toEqual({ unlocked: 1, current: 1, levels: {} });
  });
});
