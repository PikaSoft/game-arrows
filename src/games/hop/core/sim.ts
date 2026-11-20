import { buildLevel, COLS, Lane, LevelSpec, NEST_COLS, NEST_ROW, padState, spansAt, START_ROW } from './lanes';

export const STEP_HZ = 120;
/** Time between hops, in seconds. A hop pressed sooner waits and then goes. */
export const HOP_TIME = 0.12;
/** Half the chick's width when a car hits it: a little narrower than it's drawn. */
export const HIT_HALF = 0.3;
/** How far past a log's end the chick's middle can be and still stand on it. */
export const LOG_GRACE = 0.15;
/** How far off a nest's middle a landing still counts. */
export const NEST_REACH = 0.5;
/** Seconds to reach a nest before the life is lost. */
export const LIFE_TIME = 30;
export const START_LIVES = 3;
/** Seconds the board waits after a fall before the next chick sets off. */
export const RESPAWN_TIME = 1.1;

export type Dir = 0 | 1 | 2 | 3; // up, right, down, left
export type Cause = 'car' | 'water' | 'edge' | 'bank' | 'time';

export interface StepEvents {
  hopped: boolean;
  nest: number | null;
  died: Cause | null;
  levelUp: boolean;
  over: boolean;
}

/** Points: each new row reached in a life, each nest, seconds left on a nest, a full set. */
export const ROW_POINTS = 10;
export const NEST_POINTS = 50;
export const SECOND_POINTS = 2;
export const LEVEL_POINTS = 200;

/** The rules of a game with no drawing or timing: one `step()` is 1/STEP_HZ of a second. */
export class HopSim {
  spec: LevelSpec;
  level = 1;
  /** Seconds since the level began: every lane's position is a function of this. */
  time = 0;
  row = START_ROW;
  /** The chick's middle, in cells from the left edge. */
  x = Math.floor(COLS / 2) + 0.5;
  lives = START_LIVES;
  score = 0;
  nests: boolean[] = NEST_COLS.map(() => false);
  /** Nests filled over the whole game. */
  homes = 0;
  /** Seconds left in this life. */
  clock = LIFE_TIME;
  /** Seconds until the next hop can go, and a hop waiting for it. */
  cool = 0;
  queued: Dir | null = null;
  /** Seconds left before a new chick sets off after a fall or a nest; 0 while playing. */
  wait = 0;
  lastCause: Cause | null = null;
  /** Hops made so far, and the way the last one went (for drawing). */
  hops = 0;
  lastDir: Dir = 0;
  over = false;
  /** The highest row (smallest number) reached in this life, for points. */
  private best = START_ROW;

  constructor(level = 1) {
    this.level = level;
    this.spec = buildLevel(level);
  }

  lane(row: number): Lane | undefined {
    return this.spec.lanes.find((l) => l.row === row);
  }

  /** Ask for a hop. It goes now if it can, or as soon as the last hop is done. */
  hop(d: Dir): void {
    if (this.over || this.wait > 0) return;
    if (this.cool > 0) this.queued = d;
    else this.doHop(d);
  }

  private hopped = false;
  private doHop(d: Dir): void {
    const onWater = this.lane(this.row)?.kind !== undefined && this.lane(this.row)!.kind !== 'road';
    let row = this.row;
    let x = this.x;
    if (d === 0) row--;
    else if (d === 2) row++;
    else x += d === 1 ? 1 : -1;
    if (row > START_ROW) return;
    if (x < 0.5 || x > COLS - 0.5) {
      // Can't hop off the sides; on a log, a hop that would leave the board is clamped.
      if (!onWater) return;
      x = Math.max(0.5, Math.min(COLS - 0.5, x));
    }
    const landWater = this.lane(row) !== undefined && this.lane(row)!.kind !== 'road';
    // Off the water, the chick hops along the grid: snap to the nearest column.
    if (!landWater) x = Math.max(0.5, Math.min(COLS - 0.5, Math.round(x - 0.5) + 0.5));
    this.row = row;
    this.x = x;
    this.cool = HOP_TIME;
    this.hopped = true;
    this.hops++;
    this.lastDir = d;
    if (row < this.best) {
      this.score += ROW_POINTS * (this.best - row);
      this.best = row;
    }
  }

  /** Why the chick would be lost standing where it is right now, or null if it's safe. */
  danger(): Cause | null {
    if (this.row === NEST_ROW) return null;
    const lane = this.lane(this.row);
    if (!lane) return null;
    const spans = spansAt(lane, this.time);
    if (lane.kind === 'road') {
      for (const s of spans) if (this.x + HIT_HALF > s.left && this.x - HIT_HALF < s.right) return 'car';
      return null;
    }
    if (this.x < 0 || this.x > COLS) return 'edge';
    for (const s of spans) {
      if (this.x < s.left - LOG_GRACE || this.x > s.right + LOG_GRACE) continue;
      if (lane.kind === 'pads' && padState(s.th, this.time) === 2) continue;
      return null;
    }
    return 'water';
  }

  /** The log or raft the chick stands on, if any (for drifting). */
  private carrier(): Lane | null {
    const lane = this.lane(this.row);
    if (!lane || lane.kind === 'road') return null;
    return this.danger() === null ? lane : null;
  }

  private spawn(): void {
    this.row = START_ROW;
    this.x = Math.floor(COLS / 2) + 0.5;
    this.best = START_ROW;
    this.clock = LIFE_TIME;
    this.cool = 0;
    this.queued = null;
  }

  private lose(cause: Cause, ev: StepEvents): void {
    ev.died = cause;
    this.lastCause = cause;
    this.lives--;
    this.queued = null;
    if (this.lives <= 0) {
      this.over = true;
      ev.over = true;
    } else this.wait = RESPAWN_TIME;
  }

  step(): StepEvents {
    const ev: StepEvents = { hopped: false, nest: null, died: null, levelUp: false, over: false };
    if (this.over) return ev;
    const dt = 1 / STEP_HZ;
    this.time += dt;
    if (this.wait > 0) {
      this.wait -= dt;
      if (this.wait <= 0) {
        this.wait = 0;
        this.spawn();
      }
      return ev;
    }
    // Riding: a log or raft carries the chick with it.
    const ride = this.carrier();
    if (ride) this.x += ride.dir * ride.speed * dt;
    this.cool = Math.max(0, this.cool - dt);
    this.hopped = false;
    if (this.cool === 0 && this.queued !== null) {
      const d = this.queued;
      this.queued = null;
      this.doHop(d);
    }
    ev.hopped = this.hopped;
    this.clock -= dt;
    if (this.row === NEST_ROW) {
      const i = NEST_COLS.findIndex((c) => Math.abs(this.x - (c + 0.5)) <= NEST_REACH);
      if (i < 0 || this.nests[i]) {
        this.lose('bank', ev);
        return ev;
      }
      this.nests[i] = true;
      this.x = NEST_COLS[i] + 0.5;
      this.homes++;
      ev.nest = i;
      this.score += NEST_POINTS + Math.floor(Math.max(0, this.clock)) * SECOND_POINTS;
      if (this.nests.every(Boolean)) {
        this.score += LEVEL_POINTS;
        this.level++;
        this.spec = buildLevel(this.level);
        this.time = 0;
        this.nests = NEST_COLS.map(() => false);
        ev.levelUp = true;
      }
      this.wait = ev.levelUp ? RESPAWN_TIME * 1.6 : RESPAWN_TIME * 0.6;
      return ev;
    }
    const d = this.danger();
    if (d) this.lose(d, ev);
    else if (this.clock <= 0) this.lose('time', ev);
    return ev;
  }

  /** A copy that can be stepped on its own (for tests and look-ahead). */
  clone(): HopSim {
    const c = Object.create(HopSim.prototype) as HopSim;
    Object.assign(c, this);
    c.nests = [...this.nests];
    return c;
  }
}
