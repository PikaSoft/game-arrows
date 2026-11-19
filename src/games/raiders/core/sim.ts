import { Rng } from '../../../shared/rng';

/** Simulation steps per second. Small steps keep shots from skipping through things. */
export const STEP_HZ = 120;
const DT = 1 / STEP_HZ;

/** The field, in units. */
export const W = 16;
export const H = 24;

export const START_LIVES = 3;
export const MAX_LIVES = 5;
/** One more life each time the score passes a multiple of this. */
export const EXTRA_LIFE_EVERY = 5000;

/**
 * The ship sits well above the bottom of the field, so a finger dragging below it on a
 * phone doesn't cover it or the bolts coming down.
 */
export const SHIP_Y = H - 3.5;
export const SHIP_W = 1.4;
export const SHIP_H = 0.7;
const SHIP_MIN_X = SHIP_W / 2 + 0.1;
const SHIP_MAX_X = W - SHIP_W / 2 - 0.1;

/** The ship fires by itself this often (seconds), with at most MAX_SHOTS in flight. */
export const FIRE_EVERY = 0.35;
export const MAX_SHOTS = 2;
const SHOT_SPEED = 18;
/** Seconds the ship blinks (and can't be hit) after losing a life. */
export const SHIELD_TIME = 2;

export const ROWS = 5;
export const COLS = 8;
/** Gap between raider centres. */
export const SPACE_X = 1.4;
export const SPACE_Y = 1.1;
export const RAIDER_W = 1.0;
export const RAIDER_H = 0.7;
/** Points for a raider, by row (top down). */
export const ROW_POINTS = [30, 20, 20, 10, 10];
/** How far the formation moves sideways in one march step, and down at an edge. */
const MARCH_X = 0.35;
const MARCH_DOWN = 0.5;
const EDGE = 0.3;

/** Bonus ship across the top. */
export const SAUCER_Y = 1.4;
export const SAUCER_W = 1.6;
export const SAUCER_H = 0.6;
const SAUCER_SPEED = 3.5;
export const SAUCER_POINTS = [50, 100, 150, 300];

/** Shields: blocks of small cells that any shot chips away. */
export const CELL = 0.25;
export const SHIELD_COLS = 8;
export const SHIELD_ROWS = 5;
export const SHIELD_TOP = SHIP_Y - 3.2;
const SHIELD_XS = [W / 4, W / 2, (3 * W) / 4];

/** Seconds between the last raider falling and the next wave. */
export const WAVE_GAP = 1.6;
/** Bonus for clearing a wave, times the wave number. */
export const WAVE_BONUS = 100;

export interface Shot {
  x: number;
  y: number;
}

export interface Bolt {
  x: number;
  y: number;
  vy: number;
}

export interface Shield {
  /** Top-left corner. */
  x: number;
  y: number;
  cells: boolean[][];
}

export interface Saucer {
  x: number;
  dir: 1 | -1;
}

/** What happened during a step, for sound and effects. */
export interface Events {
  fired: boolean;
  raidersHit: { x: number; y: number; row: number; points: number }[];
  shieldHits: { x: number; y: number }[];
  /** A shot and a bolt met and both went. */
  clashes: { x: number; y: number }[];
  saucerHit: { x: number; y: number; points: number } | null;
  saucerCame: boolean;
  playerHit: boolean;
  extraLife: boolean;
  waveCleared: boolean;
  waveStarted: boolean;
  gameOver: boolean;
}

const none = (): Events => ({
  fired: false,
  raidersHit: [],
  shieldHits: [],
  clashes: [],
  saucerHit: null,
  saucerCame: false,
  playerHit: false,
  extraLife: false,
  waveCleared: false,
  waveStarted: false,
  gameOver: false,
});

/** A shield's starting shape: a block with its top corners cut and an arch underneath. */
export function shieldShape(): boolean[][] {
  return Array.from({ length: SHIELD_ROWS }, (_, r) =>
    Array.from({ length: SHIELD_COLS }, (_, c) => {
      if (r === 0 && (c === 0 || c === SHIELD_COLS - 1)) return false;
      if (r >= SHIELD_ROWS - 2 && c >= 3 && c <= 4) return false;
      return true;
    }),
  );
}

/**
 * The rules of the game with no drawing or timing: one `step()` advances 1/STEP_HZ of a
 * second. Everything is deterministic for a given seed and sequence of ship moves, so the
 * tests can play whole games.
 */
export class RaidersSim {
  wave = 0;
  score = 0;
  lives = START_LIVES;
  over = false;
  time = 0;
  /** Ship centre x. */
  shipX = W / 2;
  /** Seconds left of the blink after losing a life. */
  shieldLeft = 0;

  /** alive[row][col]. */
  alive: boolean[][] = [];
  /** Centre of the top-left raider's slot. Raiders sit on a grid from here. */
  fx = 0;
  fy = 0;
  dir: 1 | -1 = 1;
  /** Flips with every march step, for the two-frame walk. */
  frame = 0;
  shots: Shot[] = [];
  bolts: Bolt[] = [];
  shields: Shield[] = [];
  saucer: Saucer | null = null;
  /** Seconds until the next wave starts (only while between waves). */
  gapLeft = 0;

  private marchLeft = 0;
  private fireLeft = 0;
  private boltLeft = 0;
  private saucerLeft = 0;
  private nextLifeAt = EXTRA_LIFE_EVERY;
  private rng: Rng;

  constructor(readonly seed: number) {
    this.rng = new Rng(seed);
    this.startWave();
  }

  // ---------- Queries ----------

  get left(): number {
    let n = 0;
    for (const row of this.alive) for (const a of row) if (a) n++;
    return n;
  }

  /** Centre of a raider's slot. */
  raiderX(c: number): number {
    return this.fx + c * SPACE_X;
  }
  raiderY(r: number): number {
    return this.fy + r * SPACE_Y;
  }

  /** Seconds between march steps: quicker as raiders fall and wave by wave. */
  marchInterval(): number {
    const frac = this.left / (ROWS * COLS);
    const pace = Math.max(0.55, Math.pow(0.92, this.wave - 1));
    return Math.max(0.03, (0.05 + 0.55 * frac) * pace);
  }

  /** Seconds between raider bolts, wave by wave. */
  boltInterval(): number {
    return Math.max(0.35, 1.2 * Math.pow(0.9, this.wave - 1));
  }

  maxBolts(): number {
    return Math.min(6, 3 + Math.floor(this.wave / 3));
  }

  boltSpeed(): number {
    return Math.min(10, 6.7 + 0.3 * this.wave);
  }

  // ---------- Input ----------

  moveShip(x: number): void {
    this.shipX = Math.max(SHIP_MIN_X, Math.min(SHIP_MAX_X, x));
  }

  // ---------- Waves ----------

  private startWave(): void {
    this.wave++;
    this.alive = Array.from({ length: ROWS }, () => new Array(COLS).fill(true));
    // Each wave starts a little lower, up to a point.
    this.fy = 3 + Math.min(this.wave - 1, 4) * 0.5;
    this.fx = (W - (COLS - 1) * SPACE_X) / 2;
    this.dir = 1;
    this.frame = 0;
    this.marchLeft = this.marchInterval();
    this.boltLeft = 1.5;
    this.fireLeft = 0.4;
    this.saucerLeft = 14 + this.rng.next() * 10;
    this.shots = [];
    this.bolts = [];
    this.saucer = null;
    this.shields = SHIELD_XS.map((cx) => ({ x: cx - (SHIELD_COLS * CELL) / 2, y: SHIELD_TOP, cells: shieldShape() }));
    this.gapLeft = 0;
  }

  private addScore(n: number, ev: Events): void {
    this.score += n;
    while (this.score >= this.nextLifeAt) {
      this.nextLifeAt += EXTRA_LIFE_EVERY;
      if (this.lives < MAX_LIVES) {
        this.lives++;
        ev.extraLife = true;
      }
    }
  }

  // ---------- Step ----------

  step(): Events {
    const ev = none();
    if (this.over) return ev;
    this.time += DT;
    if (this.shieldLeft > 0) this.shieldLeft = Math.max(0, this.shieldLeft - DT);

    if (this.gapLeft > 0) {
      this.gapLeft -= DT;
      this.moveShots(ev);
      if (this.gapLeft <= 0) {
        this.startWave();
        ev.waveStarted = true;
      }
      return ev;
    }

    this.autoFire(ev);
    this.march(ev);
    if (this.over) return ev;
    this.raiderFire();
    this.moveSaucer(ev);
    this.moveShots(ev);
    this.moveBolts(ev);
    if (this.over) return ev;

    if (this.left === 0) {
      ev.waveCleared = true;
      this.addScore(WAVE_BONUS * this.wave, ev);
      this.gapLeft = WAVE_GAP;
      this.bolts = [];
      this.saucer = null;
    }
    return ev;
  }

  private autoFire(ev: Events): void {
    this.fireLeft -= DT;
    if (this.fireLeft > 0 || this.shots.length >= MAX_SHOTS) return;
    this.shots.push({ x: this.shipX, y: SHIP_Y - SHIP_H / 2 });
    this.fireLeft = FIRE_EVERY;
    ev.fired = true;
  }

  /** The formation moves in steps: sideways, or down and back at an edge. */
  private march(ev: Events): void {
    this.marchLeft -= DT;
    if (this.marchLeft > 0) return;
    this.marchLeft += this.marchInterval();
    let minC = COLS;
    let maxC = -1;
    for (const row of this.alive)
      row.forEach((a, c) => {
        if (!a) return;
        minC = Math.min(minC, c);
        maxC = Math.max(maxC, c);
      });
    if (maxC < 0) return;
    const nx = this.fx + this.dir * MARCH_X;
    const leftEdge = nx + minC * SPACE_X - RAIDER_W / 2;
    const rightEdge = nx + maxC * SPACE_X + RAIDER_W / 2;
    if (leftEdge < EDGE || rightEdge > W - EDGE) {
      this.fy += MARCH_DOWN;
      this.dir = this.dir === 1 ? -1 : 1;
    } else this.fx = nx;
    this.frame ^= 1;
    this.raidersTouch(ev);
  }

  /** Raiders wipe out shield cells they pass through, and end the game at the ship's row. */
  private raidersTouch(ev: Events): void {
    let lowest = -Infinity;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        if (!this.alive[r][c]) continue;
        const x = this.raiderX(c);
        const y = this.raiderY(r);
        lowest = Math.max(lowest, y + RAIDER_H / 2);
        for (const s of this.shields) this.clearCells(s, x - RAIDER_W / 2, y - RAIDER_H / 2, x + RAIDER_W / 2, y + RAIDER_H / 2);
      }
    if (lowest >= SHIP_Y - SHIP_H / 2) {
      this.lives = 0;
      this.over = true;
      ev.playerHit = true;
      ev.gameOver = true;
    }
  }

  private clearCells(s: Shield, x0: number, y0: number, x1: number, y1: number): void {
    const c0 = Math.max(0, Math.floor((x0 - s.x) / CELL));
    const c1 = Math.min(SHIELD_COLS - 1, Math.floor((x1 - s.x) / CELL));
    const r0 = Math.max(0, Math.floor((y0 - s.y) / CELL));
    const r1 = Math.min(SHIELD_ROWS - 1, Math.floor((y1 - s.y) / CELL));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) s.cells[r][c] = false;
  }

  /** The cell under a point, if it is still standing. */
  private cellAt(x: number, y: number): { s: Shield; r: number; c: number } | null {
    for (const s of this.shields) {
      const c = Math.floor((x - s.x) / CELL);
      const r = Math.floor((y - s.y) / CELL);
      if (r >= 0 && r < SHIELD_ROWS && c >= 0 && c < SHIELD_COLS && s.cells[r][c]) return { s, r, c };
    }
    return null;
  }

  /** The lowest raider in a random column fires; now and then it picks the ship's column. */
  private raiderFire(): void {
    this.boltLeft -= DT;
    if (this.boltLeft > 0) return;
    this.boltLeft = this.boltInterval() * (0.6 + this.rng.next() * 0.8);
    if (this.bolts.length >= this.maxBolts()) return;
    const cols: number[] = [];
    for (let c = 0; c < COLS; c++) if (this.alive.some((row) => row[c])) cols.push(c);
    if (!cols.length) return;
    let col = this.rng.pick(cols);
    if (this.rng.next() < 0.3) {
      // Aim: the column nearest the ship.
      col = cols.reduce((best, c) => (Math.abs(this.raiderX(c) - this.shipX) < Math.abs(this.raiderX(best) - this.shipX) ? c : best));
    }
    let row = ROWS - 1;
    while (row >= 0 && !this.alive[row][col]) row--;
    this.bolts.push({ x: this.raiderX(col), y: this.raiderY(row) + RAIDER_H / 2, vy: this.boltSpeed() });
  }

  private moveSaucer(ev: Events): void {
    if (this.saucer) {
      this.saucer.x += this.saucer.dir * SAUCER_SPEED * DT;
      if (this.saucer.x < -SAUCER_W || this.saucer.x > W + SAUCER_W) this.saucer = null;
      return;
    }
    this.saucerLeft -= DT;
    if (this.saucerLeft > 0) return;
    this.saucerLeft = 18 + this.rng.next() * 10;
    // Only once the formation has moved down out of its way.
    if (this.left < 6 || this.fy - RAIDER_H < SAUCER_Y + SAUCER_H) return;
    const dir = this.rng.next() < 0.5 ? 1 : -1;
    this.saucer = { x: dir === 1 ? -SAUCER_W / 2 : W + SAUCER_W / 2, dir };
    ev.saucerCame = true;
  }

  private moveShots(ev: Events): void {
    const keep: Shot[] = [];
    for (const sh of this.shots) {
      sh.y -= SHOT_SPEED * DT;
      if (sh.y >= 0 && !this.shotHits(sh, ev)) keep.push(sh);
    }
    this.shots = keep;
  }

  /** True when the shot hit something (and is spent). */
  private shotHits(sh: Shot, ev: Events): boolean {
    // Shields.
    const cell = this.cellAt(sh.x, sh.y);
    if (cell) {
      cell.s.cells[cell.r][cell.c] = false;
      ev.shieldHits.push({ x: sh.x, y: sh.y });
      return true;
    }
    // Bolts.
    const bi = this.bolts.findIndex((b) => Math.abs(b.x - sh.x) < 0.22 && Math.abs(b.y - sh.y) < 0.35);
    if (bi >= 0) {
      ev.clashes.push({ x: sh.x, y: sh.y });
      this.bolts.splice(bi, 1);
      return true;
    }
    // Raiders.
    const c = Math.round((sh.x - this.fx) / SPACE_X);
    const r = Math.round((sh.y - this.fy) / SPACE_Y);
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS && this.alive[r][c]) {
      if (Math.abs(sh.x - this.raiderX(c)) <= RAIDER_W / 2 && Math.abs(sh.y - this.raiderY(r)) <= RAIDER_H / 2) {
        this.alive[r][c] = false;
        const points = ROW_POINTS[r];
        this.addScore(points, ev);
        ev.raidersHit.push({ x: this.raiderX(c), y: this.raiderY(r), row: r, points });
        return true;
      }
    }
    // Saucer.
    const s = this.saucer;
    if (s && Math.abs(sh.x - s.x) <= SAUCER_W / 2 && Math.abs(sh.y - SAUCER_Y) <= SAUCER_H / 2) {
      const points = this.rng.pick(SAUCER_POINTS);
      this.addScore(points, ev);
      ev.saucerHit = { x: s.x, y: SAUCER_Y, points };
      this.saucer = null;
      return true;
    }
    return false;
  }

  private moveBolts(ev: Events): void {
    const keep: Bolt[] = [];
    for (const b of this.bolts) {
      b.y += b.vy * DT;
      if (b.y > H) continue;
      const cell = this.cellAt(b.x, b.y);
      if (cell) {
        cell.s.cells[cell.r][cell.c] = false;
        // Bolts are rougher than shots: they take a neighbour below too.
        if (cell.r + 1 < SHIELD_ROWS) cell.s.cells[cell.r + 1][cell.c] = false;
        ev.shieldHits.push({ x: b.x, y: b.y });
        continue;
      }
      if (
        this.shieldLeft <= 0 &&
        Math.abs(b.x - this.shipX) <= SHIP_W / 2 &&
        b.y >= SHIP_Y - SHIP_H / 2 &&
        b.y <= SHIP_Y + SHIP_H / 2
      ) {
        this.loseLife(ev);
        if (this.over) return;
        // Every bolt goes, so the ship gets a moment to recover.
        this.bolts = [];
        return;
      }
      keep.push(b);
    }
    this.bolts = keep;
  }

  private loseLife(ev: Events): void {
    this.lives--;
    ev.playerHit = true;
    if (this.lives <= 0) {
      this.lives = 0;
      this.over = true;
      ev.gameOver = true;
      return;
    }
    this.shieldLeft = SHIELD_TIME;
  }
}
