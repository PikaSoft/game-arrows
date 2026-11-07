import { Rng } from '../../../shared/rng';

/** Width of the play area, in block units. The first block is half of it. */
export const FIELD_W = 10;
export const START_W = 5;
/** A drop this close to dead centre (in units) snaps to a perfect landing. */
export const SNAP = 0.12;
/** Perfect drops in a row before each further one grows the block back a little. */
export const STREAK_TO_GROW = 3;
export const GROW = 0.25;
/** Slide speed, in units per second: starts slow and creeps up with height. */
export const BASE_SPEED = 4;
export const SPEED_STEP = 0.08;
export const MAX_SPEED = 10;

/** A placed block: its left edge and width. Floors are one unit tall. */
export interface Slab {
  x: number;
  w: number;
}

export interface DropResult {
  /** The block as it landed (null if it missed the tower completely). */
  placed: Slab | null;
  /** The piece that hung over and was cut off (null if none). */
  cut: Slab | null;
  perfect: boolean;
  /** The block grew back a little from a perfect streak. */
  grew: boolean;
  gameOver: boolean;
}

/**
 * The rules of the tower, with no drawing or timing. The moving block's position is a
 * function of time since it appeared, so the game can ask where it was at the exact
 * moment of a tap (taps on phones arrive a little late; the event's timestamp doesn't).
 */
export class StackSim {
  stack: Slab[] = [{ x: (FIELD_W - START_W) / 2, w: START_W }];
  /** Width of the block now sliding. */
  width = START_W;
  /** Which side it came in from: -1 left, 1 right. */
  from: -1 | 1 = -1;
  streak = 0;
  perfects = 0;
  over = false;
  private rng: Rng;

  constructor(readonly seed: number) {
    this.rng = new Rng(seed);
    this.from = this.rng.next() < 0.5 ? -1 : 1;
  }

  /** Floors placed on top of the first block. */
  get score(): number {
    return this.stack.length - 1;
  }
  get top(): Slab {
    return this.stack[this.stack.length - 1];
  }
  get speed(): number {
    return Math.min(MAX_SPEED, BASE_SPEED + this.score * SPEED_STEP);
  }

  /**
   * Left edge of the sliding block, `t` seconds after it appeared. It sweeps from just
   * off one side to just off the other and back, so its centre crosses the whole field.
   */
  xAt(t: number): number {
    const lo = -this.width / 2;
    const hi = FIELD_W - this.width / 2;
    const span = hi - lo;
    // Triangle wave: there and back, starting at the side it came in from.
    const d = (t * this.speed) % (span * 2);
    const along = d <= span ? d : span * 2 - d;
    return this.from < 0 ? lo + along : hi - along;
  }

  /** Drop the block where it is `t` seconds after it appeared. */
  drop(t: number): DropResult {
    if (this.over) return { placed: null, cut: null, perfect: false, grew: false, gameOver: true };
    const top = this.top;
    let x = this.xAt(t);
    const w = this.width;
    // Near enough dead on: snap to a perfect landing.
    if (Math.abs(x - top.x) <= SNAP && w <= top.w + 1e-9) x = top.x;
    const left = Math.max(x, top.x);
    const right = Math.min(x + w, top.x + top.w);
    if (right - left <= 1e-6) {
      this.over = true;
      return { placed: null, cut: { x, w }, perfect: false, grew: false, gameOver: true };
    }
    const perfect = x === top.x && Math.abs(w - top.w) < 1e-9;
    let placed: Slab = { x: left, w: right - left };
    let cut: Slab | null = null;
    if (!perfect) {
      cut = x < top.x ? { x, w: top.x - x } : { x: right, w: x + w - right };
      if (cut.w < 1e-6) cut = null;
    }
    let grew = false;
    if (perfect) {
      this.streak++;
      this.perfects++;
      // A run of perfect drops earns a little width back, up to the starting width.
      if (this.streak >= STREAK_TO_GROW && placed.w < START_W) {
        const add = Math.min(GROW, START_W - placed.w);
        placed = { x: Math.max(0, Math.min(FIELD_W - placed.w - add, placed.x - add / 2)), w: placed.w + add };
        grew = true;
      }
    } else this.streak = 0;
    this.stack.push(placed);
    this.width = placed.w;
    this.from = this.rng.next() < 0.5 ? -1 : 1;
    return { placed, cut, perfect, grew, gameOver: false };
  }
}
