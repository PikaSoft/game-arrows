import { beforeEach, describe, expect, test } from 'vitest';
import {
  COLS,
  EXTRA_LIFE_EVERY,
  FIRE_EVERY,
  MAX_LIVES,
  MAX_SHOTS,
  RaidersSim,
  ROW_POINTS,
  ROWS,
  SHIELD_TIME,
  SHIP_H,
  SHIP_Y,
  START_LIVES,
  STEP_HZ,
  W,
  WAVE_BONUS,
  WAVE_GAP,
} from '../src/games/raiders/core/sim';
import { loadRaiders, RAIDERS_KEY, recordRaidersGame, resetRaiders } from '../src/games/raiders/game/storage';

const steps = (sim: RaidersSim, seconds: number) => {
  for (let k = 0; k < seconds * STEP_HZ && !sim.over; k++) sim.step();
};
/** A sim that will never fire back, so tests of the ship's own shots stay simple. */
const quiet = (seed = 1) => {
  const s = new RaidersSim(seed);
  (s as unknown as { boltInterval: () => number }).boltInterval = () => 1e9;
  (s as unknown as { boltLeft: number }).boltLeft = 1e9;
  return s;
};

/** Keeps the ship under the nearest column of raiders, stepping away from bolts about to land. */
function autoplay(sim: RaidersSim, seconds: number): void {
  for (let k = 0; k < seconds * STEP_HZ && !sim.over; k++) {
    let target = sim.shipX;
    let best = Infinity;
    for (let c = 0; c < COLS; c++) {
      if (!sim.alive.some((row) => row[c])) continue;
      const d = Math.abs(sim.raiderX(c) - sim.shipX);
      if (d < best) {
        best = d;
        target = sim.raiderX(c);
      }
    }
    const danger = sim.bolts.some((b) => b.y > SHIP_Y - 4 && Math.abs(b.x - sim.shipX) < 1.1);
    if (danger) target = sim.shipX + (sim.shipX < W / 2 ? 2 : -2);
    const step = 14 / STEP_HZ;
    sim.moveShip(sim.shipX + Math.max(-step, Math.min(step, target - sim.shipX)));
    sim.step();
  }
}

describe('Star Raiders sim', () => {
  test('starts with a full formation, three lives and three shields', () => {
    const s = new RaidersSim(1);
    expect(s.wave).toBe(1);
    expect(s.left).toBe(ROWS * COLS);
    expect(s.lives).toBe(START_LIVES);
    expect(s.shields).toHaveLength(3);
    expect(s.score).toBe(0);
  });

  test('the formation marches sideways, then steps down and turns at an edge', () => {
    const s = quiet();
    s.moveShip(0); // out of the way of its own shots hitting much
    const x0 = s.fx;
    const y0 = s.fy;
    steps(s, 1);
    expect(s.fx).toBeGreaterThan(x0);
    expect(s.fy).toBe(y0);
    let turned = false;
    for (let k = 0; k < 20 * STEP_HZ && !turned; k++) {
      s.step();
      if (s.dir === -1) turned = true;
    }
    expect(turned).toBe(true);
    expect(s.fy).toBeGreaterThan(y0);
  });

  test('marches faster as raiders fall', () => {
    const s = quiet();
    const full = s.marchInterval();
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS - 1; c++) s.alive[r][c] = false;
    expect(s.marchInterval()).toBeLessThan(full / 3);
  });

  test('the ship fires by itself, at most two shots at a time', () => {
    const s = quiet();
    let fired = 0;
    for (let k = 0; k < STEP_HZ; k++) {
      if (s.step().fired) fired++;
      expect(s.shots.length).toBeLessThanOrEqual(MAX_SHOTS);
    }
    expect(fired).toBeGreaterThanOrEqual(Math.floor(1 / FIRE_EVERY) - 1);
  });

  test('a shot destroys the lowest raider in its column and scores by row', () => {
    const s = quiet();
    // Clear the shield path: fire from between shields at a column.
    s.shields = [];
    const c = 3;
    let hit = false;
    for (let k = 0; k < 3 * STEP_HZ && !hit; k++) {
      s.moveShip(s.raiderX(c));
      const ev = s.step();
      if (ev.raidersHit.length) {
        hit = true;
        expect(ev.raidersHit[0].row).toBe(ROWS - 1);
        expect(s.score).toBe(ROW_POINTS[ROWS - 1]);
      }
    }
    expect(hit).toBe(true);
    expect(s.left).toBe(ROWS * COLS - 1);
  });

  test('shots chip the shields', () => {
    const s = quiet();
    const sh = s.shields[1];
    s.moveShip(sh.x + 1);
    const before = sh.cells.flat().filter(Boolean).length;
    steps(s, 1);
    expect(sh.cells.flat().filter(Boolean).length).toBeLessThan(before);
  });

  test('a bolt on the ship costs a life, then the ship blinks safe for a while', () => {
    const s = quiet();
    s.shields = [];
    s.bolts.push({ x: s.shipX, y: SHIP_Y - 1, vy: 8 });
    let ev;
    for (let k = 0; k < STEP_HZ; k++) {
      ev = s.step();
      if (ev.playerHit) break;
    }
    expect(ev!.playerHit).toBe(true);
    expect(s.lives).toBe(START_LIVES - 1);
    expect(s.shieldLeft).toBeCloseTo(SHIELD_TIME, 1);
    // While blinking, bolts pass through.
    s.bolts.push({ x: s.shipX, y: SHIP_Y - 0.5, vy: 8 });
    steps(s, 0.3);
    expect(s.lives).toBe(START_LIVES - 1);
  });

  test('losing the last life ends the game', () => {
    const s = quiet();
    s.shields = [];
    s.lives = 1;
    s.bolts.push({ x: s.shipX, y: SHIP_Y - 1, vy: 8 });
    steps(s, 1);
    expect(s.over).toBe(true);
    expect(s.lives).toBe(0);
  });

  test('raiders reaching the ship row end the game', () => {
    const s = quiet();
    s.fy = SHIP_Y - SHIP_H / 2 - (ROWS - 1) * 1.1 - 0.4;
    let over = false;
    for (let k = 0; k < 10 * STEP_HZ && !over; k++) over = s.step().gameOver;
    expect(over).toBe(true);
    expect(s.over).toBe(true);
  });

  test('clearing a wave scores a bonus, then the next wave starts lower and faster', () => {
    const s = quiet();
    const pace = s.marchInterval();
    const y = s.fy;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) s.alive[r][c] = false;
    const ev = s.step();
    expect(ev.waveCleared).toBe(true);
    expect(s.score).toBe(WAVE_BONUS);
    let started = false;
    for (let k = 0; k < (WAVE_GAP + 0.5) * STEP_HZ && !started; k++) started = s.step().waveStarted;
    expect(started).toBe(true);
    expect(s.wave).toBe(2);
    expect(s.left).toBe(ROWS * COLS);
    expect(s.fy).toBeGreaterThan(y);
    expect(s.marchInterval()).toBeLessThan(pace);
  });

  test('an extra life every few thousand points, up to the cap', () => {
    const s = quiet();
    s.score = EXTRA_LIFE_EVERY - 10;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) s.alive[r][c] = false;
    const ev = s.step();
    expect(ev.extraLife).toBe(true);
    expect(s.lives).toBe(START_LIVES + 1);
    s.lives = MAX_LIVES;
    s.score = 2 * EXTRA_LIFE_EVERY - 1;
    (s as unknown as { addScore: (n: number, ev: unknown) => void }).addScore(5, { extraLife: false });
    expect(s.lives).toBe(MAX_LIVES);
  });

  test('the same seed and moves give the same game', () => {
    const a = new RaidersSim(42);
    const b = new RaidersSim(42);
    autoplay(a, 30);
    autoplay(b, 30);
    expect(a.score).toBe(b.score);
    expect(a.lives).toBe(b.lives);
    expect(a.alive).toEqual(b.alive);
    expect(a.bolts).toEqual(b.bolts);
  });

  test('a simple player clears the first wave', () => {
    let cleared = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const s = new RaidersSim(seed);
      autoplay(s, 120);
      if (s.wave >= 2) cleared++;
    }
    expect(cleared).toBeGreaterThanOrEqual(3);
  });
});

describe('Star Raiders storage', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    };
  });

  test('records bests and games, and resets', () => {
    const p = loadRaiders();
    expect(p).toEqual({ bestScore: 0, bestWave: 0, games: 0 });
    expect(recordRaidersGame(p, 500, 2)).toBe(true);
    expect(recordRaidersGame(p, 300, 3)).toBe(false);
    const again = loadRaiders();
    expect(again).toEqual({ bestScore: 500, bestWave: 3, games: 2 });
    expect(localStorage.getItem(RAIDERS_KEY)).toBeTruthy();
    resetRaiders(again);
    expect(loadRaiders().games).toBe(0);
  });
});
