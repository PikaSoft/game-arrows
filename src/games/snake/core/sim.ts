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
  /** Apples on the board at once. */
  foodCount?: number;
  /** Steps between poison moves; 0 turns poison off. */
  poisonEvery?: number;
  rng: Rng;
}

export const DEFAULT_FOOD_COUNT = 3;
export const DEFAULT_POISON_EVERY = 24;

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
  /** Cells holding an apple. */
  foods: number[] = [];
  readonly foodCount: number;
  /** Cell holding the poison, or -1 if there is none. Touching it is fatal. */
  poison = -1;
  readonly poisonEvery: number;
  /** Steps left before the poison jumps behind the tail. */
  poisonIn = 0;
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
    this.foodCount = Math.max(1, cfg.foodCount ?? DEFAULT_FOOD_COUNT);
    this.poisonEvery = cfg.poisonEvery ?? DEFAULT_POISON_EVERY;
    if (this.poisonEvery > 0) {
      this.poisonIn = this.poisonEvery;
      this.movePoison();
    }
    this.fillFood();
  }

  /** The first apple, or -1 if there are none. */
  get food(): number {
    return this.foods.length ? this.foods[0] : -1;
  }
  isFood(i: number): boolean {
    return this.foods.includes(i);
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
    const eating = this.isFood(idx);
    const tail = this.body[this.body.length - 1];
    const off = nx < 0 || ny < 0 || nx >= this.w || ny >= this.h;
    // The tail moves out of the way this step unless the snake is growing.
    if (off || this.walls[idx] || idx === this.poison || (this.occ[idx] && !(idx === tail && !eating))) {
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
      this.foods.splice(this.foods.indexOf(idx), 1);
      this.fillFood();
      if ((this.target && this.eaten >= this.target) || !this.foods.length) this.won = true;
    }
    if (this.poisonEvery > 0 && !this.won && --this.poisonIn <= 0) {
      this.poisonIn = this.poisonEvery;
      this.movePoison();
    }
    return { ate: eating, died: false, won: this.won };
  }

  private freeCells(): number[] {
    const free: number[] = [];
    for (let i = 0; i < this.walls.length; i++) {
      if (!this.walls[i] && !this.occ[i] && i !== this.poison && !this.foods.includes(i)) free.push(i);
    }
    return free;
  }

  /** Top the board up to `foodCount` apples, each on a random empty cell. */
  fillFood(): void {
    if (this.foods.length >= this.foodCount) return;
    const free = this.freeCells();
    while (this.foods.length < this.foodCount && free.length) {
      const k = Math.floor(this.rng.next() * free.length);
      this.foods.push(free[k]);
      free[k] = free[free.length - 1];
      free.pop();
    }
  }

  /** Add one more apple on a random empty cell (if there is room). */
  spawnFood(): void {
    const free = this.freeCells();
    if (free.length) this.foods.push(free[Math.floor(this.rng.next() * free.length)]);
  }

  /**
   * Move the poison just behind the tail: the cell the tail last left if it is clear,
   * otherwise a clear cell next to the tail. Cells next to the head are skipped so the
   * poison never lands right in front of the player. Stays put if there is no room.
   */
  movePoison(): void {
    const tail = this.body[this.body.length - 1];
    const ok = (i: number) =>
      i >= 0 && !this.walls[i] && !this.occ[i] && !this.foods.includes(i) && !this.nextToHead(i);
    const tx = tail % this.w;
    const ty = Math.floor(tail / this.w);
    const options: number[] = [];
    if (this.lastTail !== null && ok(this.lastTail)) options.push(this.lastTail);
    else {
      // Prefer the cell straight behind the tail, then its sides.
      const prev = this.body.length > 1 ? this.body[this.body.length - 2] : -1;
      const back: number[] = [];
      for (let d = 0; d < 4; d++) {
        const nx = tx + DX[d];
        const ny = ty + DY[d];
        if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
        const n = ny * this.w + nx;
        if (!ok(n)) continue;
        const straight = prev >= 0 && n - tail === tail - prev;
        if (straight) back.unshift(n);
        else back.push(n);
      }
      options.push(...back);
    }
    if (options.length) this.poison = options[0];
  }

  private nextToHead(i: number): boolean {
    const hx = this.head % this.w;
    const hy = Math.floor(this.head / this.w);
    const x = i % this.w;
    const y = Math.floor(i / this.w);
    return Math.abs(x - hx) + Math.abs(y - hy) <= 1;
  }

  /** For tests: put the apples somewhere specific (replaces all of them). */
  placeFood(...cells: number[]): void {
    this.foods = cells;
  }

  /** For tests: put the poison somewhere specific, or -1 to remove it. */
  placePoison(i: number): void {
    this.poison = i;
  }
}
