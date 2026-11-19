import { allJumps, apply, count, legal, undoJump } from '../core/rules';
import { search } from '../core/solver';
import { Jump, PegsLevel } from '../core/types';

export const HINTS_PER_LEVEL = 3;

export type TapResult = 'select' | 'deselect' | 'jump' | 'stuck' | null;

/**
 * One play of a Peg Jump level. Jump pegs until none can move. One peg left on the ring
 * is three stars, one anywhere two, two pegs one; more than that hasn't cleared the
 * level. Undo is free; each hint costs a star.
 */
export class Session {
  pegs: boolean[];
  readonly jumps: Jump[];
  selected: number | null = null;
  moves = 0;
  elapsedMs = 0;
  hints = HINTS_PER_LEVEL;
  hintsUsed = 0;
  /** The jump the last hint showed, until it is made (or the board changes). */
  hinted: Jump | null = null;
  private history: Jump[] = [];

  constructor(readonly level: PegsLevel) {
    this.pegs = level.pegs.slice();
    this.jumps = allJumps(level.w, level.h, level.holes);
  }

  get left(): number {
    return count(this.pegs);
  }
  get options(): Jump[] {
    return legal(this.jumps, this.pegs);
  }
  /** No jump is left. */
  get finished(): boolean {
    return this.options.length === 0;
  }
  /** Finished with one or two pegs: the level counts as cleared. */
  get cleared(): boolean {
    return this.finished && this.left <= 2;
  }
  get onGoal(): boolean {
    return this.left === 1 && this.pegs[this.level.goal];
  }
  get timerRunning(): boolean {
    return !this.finished;
  }
  /** The last jump made, for the renderer. */
  get lastJump(): Jump | undefined {
    return this.history[this.history.length - 1];
  }
  get canUndo(): boolean {
    return this.history.length > 0;
  }
  /** Jumps the peg at i can make now. */
  from(i: number): Jump[] {
    return this.options.filter((j) => j.from === i);
  }

  /** Tap square i: pick up a peg, put it down, or jump the picked-up peg into an empty hole. */
  tap(i: number): TapResult {
    if (this.finished || !this.level.holes[i]) return null;
    if (this.pegs[i]) {
      if (this.selected === i) {
        this.selected = null;
        return 'deselect';
      }
      if (!this.from(i).length) return 'stuck';
      this.selected = i;
      return 'select';
    }
    if (this.selected === null) return null;
    const j = this.from(this.selected).find((m) => m.to === i);
    if (!j) return null;
    this.jump(j);
    return 'jump';
  }

  jump(j: Jump): void {
    apply(this.pegs, j);
    this.history.push(j);
    this.moves++;
    this.selected = null;
    this.hinted = null;
  }

  /** Take back the last jump. Free and unlimited. */
  undo(): Jump | null {
    const j = this.history.pop();
    if (!j) return null;
    undoJump(this.pegs, j);
    this.selected = null;
    this.hinted = null;
    return j;
  }

  /**
   * Show a jump that can still finish with one peg on the ring (or, failing that, one peg
   * anywhere). 'dead' if neither is possible from here: undo instead, which costs nothing.
   * Costs a star when it shows a jump.
   */
  hint(): Jump | 'dead' | null {
    if (this.hints <= 0 || this.finished) return null;
    let r = search(this.jumps, this.pegs, this.level.goal);
    if (!r.path) r = search(this.jumps, this.pegs, null);
    const j = r.path?.[0] ?? (r.capped ? this.options[0] : null);
    if (!j) return 'dead';
    this.hints--;
    this.hintsUsed++;
    this.hinted = j;
    this.selected = j.from;
    return j;
  }

  stars(): number {
    if (!this.cleared) return 0;
    const base = this.left === 1 ? (this.onGoal ? 3 : 2) : 1;
    return Math.max(1, base - this.hintsUsed);
  }
}
