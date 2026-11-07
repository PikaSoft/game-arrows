import { allHome, Board, slide, SlideResult } from '../core/rules';
import { explore } from '../core/solver';
import { IceLevel } from '../core/types';

export const HINTS_PER_LEVEL = 3;

/** One play of an Ice Slide level: where the pucks are, swipes and undo. */
export class Session {
  readonly board: Board;
  /** Each puck's cell, or HOME (-1) once it has stopped on its flag. */
  pos: number[];
  swipes = 0;
  elapsedMs = 0;
  hints = HINTS_PER_LEVEL;
  hintsUsed = 0;
  /** The side the last hint pointed to, until the next swipe. */
  hintDir: number | null = null;
  private history: number[][] = [];

  constructor(readonly level: IceLevel) {
    this.board = { w: level.w, h: level.h, rocks: level.rocks, holes: level.holes, exits: level.exits };
    this.pos = level.starts.slice();
  }

  get won(): boolean {
    return allHome(this.pos);
  }
  get timerRunning(): boolean {
    return !this.won;
  }
  get canUndo(): boolean {
    return this.history.length > 0;
  }

  /**
   * Swipe toward side d. A swipe that moves nothing isn't one. A puck that falls into a
   * hole wastes the swipe (it counts, but nothing moves). Returns what happened, or null.
   */
  swipe(d: number): SlideResult | null {
    if (this.won) return null;
    const r = slide(this.board, this.pos, d);
    if (!r.moved) return null;
    this.swipes++;
    this.hintDir = null;
    if (r.fell !== null) return r;
    this.history.push(this.pos);
    this.pos = r.pos;
    return r;
  }

  /** Take back the last swipe. Undone swipes still count. */
  undo(): boolean {
    const prev = this.history.pop();
    if (!prev) return false;
    this.pos = prev;
    this.hintDir = null;
    return true;
  }

  /** True when no sequence of swipes gets every puck home from here. */
  get deadEnd(): boolean {
    return !this.won && explore(this.board, this.pos, 20000).par < 0;
  }

  /** The first swipe of a shortest way home from here. Costs a star. Null if there's none. */
  hint(): number | null {
    if (this.hints <= 0 || this.won) return null;
    const s = explore(this.board, this.pos, 20000);
    if (s.par < 1) return null;
    this.hints--;
    this.hintsUsed++;
    this.hintDir = s.moves[0];
    return s.moves[0];
  }

  /** Stars from swipes against par, one fewer for each hint used, never below one. */
  stars(): number {
    const par = this.level.par;
    const bySwipes = this.swipes <= par ? 3 : this.swipes <= Math.ceil(par * 1.25) ? 2 : 1;
    return Math.max(1, bySwipes - this.hintsUsed);
  }
}
