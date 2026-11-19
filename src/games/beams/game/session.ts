import { status, Status } from '../core/rules';
import { solve } from '../core/solver';
import { BeamLevel, MIRROR, Orient } from '../core/types';

export const HINTS_PER_LEVEL = 3;

/** One play of a Mirror Beam level: which way each mirror faces, taps and undo. */
export class Session {
  orient: Orient[];
  /** Mirrors a hint set, pinned so they can't be knocked out again. */
  locked: boolean[];
  moves = 0;
  elapsedMs = 0;
  hints = HINTS_PER_LEVEL;
  /** The mirror the last hint turned, for the renderer to highlight. */
  hinted: number | null = null;
  private history: number[] = [];
  private cached: Status | null = null;

  constructor(readonly level: BeamLevel) {
    this.orient = level.start.slice();
    this.locked = level.cells.map(() => false);
  }

  get w() {
    return this.level.w;
  }
  get h() {
    return this.level.h;
  }
  /** Where every beam goes right now. */
  get status(): Status {
    return (this.cached ??= status(this.level, this.orient));
  }
  get won(): boolean {
    return this.status.solved;
  }
  get timerRunning(): boolean {
    return !this.won;
  }
  get canUndo(): boolean {
    return this.history.length > 0;
  }
  canTurn(i: number): boolean {
    return this.level.cells[i] === MIRROR && !this.locked[i];
  }

  /** Turn mirror i the other way. One move. False if it can't turn. */
  tap(i: number): boolean {
    if (this.won || !this.canTurn(i)) return false;
    this.flip(i);
    this.history.push(i);
    this.moves++;
    if (this.hinted === i) this.hinted = null;
    return true;
  }

  /** Turn back the last tap. Undone taps still count. */
  undo(): number | null {
    if (this.won) return null;
    const i = this.history.pop();
    if (i === undefined) return null;
    this.flip(i);
    return i;
  }

  /**
   * Turn one mirror that a cheapest solution from here needs turned, and pin it. Prefers
   * the first such mirror along the beams, so hints follow the light. Counts as a tap.
   */
  hint(): number | null {
    if (this.hints <= 0 || this.won) return null;
    const r = solve(this.level, this.orient, false);
    if (!r.orient) return null;
    const along = this.status.traces.flatMap((t) => t.cells);
    const wrong = (i: number) => this.level.cells[i] === MIRROR && !this.locked[i] && r.orient![i] !== this.orient[i];
    const i = along.find(wrong) ?? r.orient.findIndex((_, k) => wrong(k));
    if (i === undefined || i < 0) return null;
    this.flip(i);
    this.history.push(i);
    this.moves++;
    this.locked[i] = true;
    this.hints--;
    this.hinted = i;
    return i;
  }

  stars(): number {
    const par = this.level.par;
    return this.moves <= par ? 3 : this.moves <= Math.ceil(par * 1.25) ? 2 : 1;
  }

  private flip(i: number): void {
    this.orient[i] = (1 - this.orient[i]) as Orient;
    this.cached = null;
  }
}
