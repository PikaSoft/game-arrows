import { affected, allOff, press } from '../core/rules';
import { solveMin } from '../core/solver';
import { LightsLevel } from '../core/types';

export const HINTS_PER_LEVEL = 3;

/** One play of a Light Switch level: the lights, taps and undo. */
export class Session {
  board: number[];
  taps = 0;
  elapsedMs = 0;
  hints = HINTS_PER_LEVEL;
  hintsUsed = 0;
  /** The tile the last hint pointed at, until it is tapped. */
  hinted: number | null = null;
  private history: number[] = [];

  constructor(readonly level: LightsLevel) {
    this.board = level.board.slice();
  }

  get w() {
    return this.level.w;
  }
  get h() {
    return this.level.h;
  }
  get won(): boolean {
    return allOff(this.board);
  }
  get timerRunning(): boolean {
    return !this.won;
  }
  get canUndo(): boolean {
    return this.history.length > 0;
  }
  get lit(): number {
    return this.board.filter((v) => v !== 0).length;
  }
  /** Tiles a tap on i would change. */
  reach(i: number): number[] {
    return affected(this.w, this.h, this.level.pattern, i);
  }

  /** Tap tile i: it and the tiles it reaches move one step on. */
  tap(i: number): boolean {
    if (this.won) return false;
    this.board = press(this.board, this.w, this.h, this.level.pattern, this.level.states, i);
    this.history.push(i);
    this.taps++;
    if (this.hinted === i) this.hinted = null;
    return true;
  }

  /** Take back the last tap. Undone taps still count. Returns the tile, or null. */
  undo(): number | null {
    const i = this.history.pop();
    if (i === undefined) return null;
    this.board = press(this.board, this.w, this.h, this.level.pattern, this.level.states, i, -1);
    return i;
  }

  /**
   * Point at a tile that a shortest solution from here taps (the one it taps most, then
   * the first in reading order). Costs a star. Doesn't tap it.
   */
  hint(): number | null {
    if (this.hints <= 0 || this.won) return null;
    const x = solveMin(this.w, this.h, this.level.pattern, this.level.states, this.board);
    if (!x) return null;
    let best = -1;
    for (let i = 0; i < x.length; i++) if (x[i] > 0 && (best < 0 || x[i] > x[best])) best = i;
    if (best < 0) return null;
    this.hints--;
    this.hintsUsed++;
    this.hinted = best;
    return best;
  }

  /** Stars from taps against par, one fewer for each hint used, never below one. */
  stars(): number {
    const par = this.level.par;
    const byTaps = this.taps <= par ? 3 : this.taps <= Math.ceil(par * 1.25) ? 2 : 1;
    return Math.max(1, byTaps - this.hintsUsed);
  }
}
