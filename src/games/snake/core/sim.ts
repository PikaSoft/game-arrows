import { Rng } from '../../../shared/rng';
import { Dir, DX, DY, opposite, Point } from './types';

export interface SimConfig {
  w: number;
  h: number;
  walls?: number[];
  /** Snake cells, head first. */
  start: Point[];
  dir: Dir;
  /** Apples needed to win; 0 means endless. */
  target?: number;
  rng: Rng;
}

export interface StepResult {
  ate: boolean;
  died: boolean;
  won: boolean;
}

/** Turns buffered ahead of the snake, so two quick swipes both count. */
const MAX_QUEUE = 2;

/** The rules of snake on a grid, with no DOM or timing. One `step()` moves one cell. */
export class SnakeSim {
  readonly w: number;
  readonly h: number;
  readonly walls: Uint8Array;
  readonly target: number;
  /** Cell indices, head first. */
  body: number[];
  dir: Dir;
  food = -1;
  eaten = 0;
  steps = 0;
  dead = false;
  won = false;
  /** Cell the head tried to enter when it died. */
  crashCell = -1;
  /** Cell the tail left on the last step (null if the snake grew instead). For smooth drawing. */
  lastTail: number | null = null;
  private occ: Uint8Array;
  private queue: Dir[] = [];
  private rng: Rng;

  constructor(cfg: SimConfig) {
    this.w = cfg.w;
    this.h = cfg.h;
    this.walls = new Uint8Array(cfg.w * cfg.h);
    for (const i of cfg.walls ?? []) this.walls[i] = 1;
    this.occ = new Uint8Array(cfg.w * cfg.h);
    this.body = cfg.start.map((p) => p.y * cfg.w + p.x);
    for (const i of this.body) this.occ[i]++;
    this.dir = cfg.dir;
    this.target = cfg.target ?? 0;
    this.rng = cfg.rng;
    this.spawnFood();
  }

  get head(): number {
    return this.body[0];
  }
  get length(): number {
    return this.body.length;
  }
  /** Direction the snake will move next (after any buffered turns). */
  get heading(): Dir {
    return this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
  }

  isWall(i: number): boolean {
    return this.walls[i] === 1;
  }
  isSnake(i: number): boolean {
    return this.occ[i] > 0;
  }

  /** Queue a turn. Ignores turning back on yourself and repeats of the current heading. */
  turn(d: Dir): boolean {
    if (this.dead || this.won) return false;
    const last = this.heading;
    if (d === last || d === opposite(last) || this.queue.length >= MAX_QUEUE) return false;
    this.queue.push(d);
    return true;
  }

  step(): StepResult {
    if (this.dead || this.won) return { ate: false, died: false, won: false };
    if (this.queue.length) this.dir = this.queue.shift()!;
    const hx = this.head % this.w;
    const hy = Math.floor(this.head / this.w);
    const nx = hx + DX[this.dir];
    const ny = hy + DY[this.dir];
    const idx = ny * this.w + nx;
    const eating = idx === this.food;
    const tail = this.body[this.body.length - 1];
    const off = nx < 0 || ny < 0 || nx >= this.w || ny >= this.h;
    // The tail moves out of the way this step unless the snake is growing.
    if (off || this.walls[idx] || (this.occ[idx] && !(idx === tail && !eating))) {
      this.dead = true;
      this.crashCell = off ? -1 : idx;
      return { ate: false, died: true, won: false };
    }
    this.steps++;
    if (eating) {
      this.lastTail = null;
    } else {
      this.body.pop();
      this.occ[tail]--;
      this.lastTail = tail;
    }
    this.body.unshift(idx);
    this.occ[idx]++;
    if (eating) {
      this.eaten++;
      this.spawnFood();
      if ((this.target && this.eaten >= this.target) || this.food < 0) this.won = true;
    }
    return { ate: eating, died: false, won: this.won };
  }

  /** Put the apple on a random empty cell, or nowhere if the board is full. */
  spawnFood(): void {
    const free: number[] = [];
    for (let i = 0; i < this.walls.length; i++) if (!this.walls[i] && !this.occ[i]) free.push(i);
    this.food = free.length ? free[Math.floor(this.rng.next() * free.length)] : -1;
  }

  /** For tests: put the apple somewhere specific. */
  placeFood(i: number): void {
    this.food = i;
  }
}
