import { bridgeOwner, startOpen, step, Step } from '../core/rules';
import { solve } from '../core/solver';
import { Block, TumbleLevel } from '../core/types';

export const HINTS_PER_LEVEL = 3;

/**
 * One play of a Tumble Block level. Each swipe tips the block one way. A move that would
 * leave any part over nothing (or stand it on a cracked square) is wasted: it counts, but
 * the block stays where it was. Undo is free and takes the move back.
 */
export class Session {
  block: Block;
  open: number;
  moves = 0;
  elapsedMs = 0;
  hints = HINTS_PER_LEVEL;
  hintsUsed = 0;
  /** The way the last hint said to tip, until the next move. */
  hinted: number | null = null;
  won = false;
  private owner: Map<number, number>;
  private history: { block: Block; open: number }[] = [];

  constructor(readonly level: TumbleLevel) {
    this.block = { ...level.start };
    this.open = startOpen(level.switches);
    this.owner = bridgeOwner(level.switches);
  }

  get timerRunning(): boolean {
    return !this.won;
  }
  get canUndo(): boolean {
    return this.history.length > 0;
  }
  bridgeOpen(k: number): boolean {
    return !!(this.open & (1 << k));
  }

  move(d: number): Step | null {
    if (this.won) return null;
    const s = step(this.level, this.owner, this.block, this.open, d);
    this.moves++;
    this.hinted = null;
    if (s.fell) return s;
    this.history.push({ block: this.block, open: this.open });
    this.block = s.block;
    this.open = s.open;
    this.won = s.won;
    return s;
  }

  /** Take back the last move that went somewhere. Free: it doesn't count as a move. */
  undo(): boolean {
    const h = this.history.pop();
    if (!h || this.won) {
      if (h) this.history.push(h);
      return false;
    }
    this.block = h.block;
    this.open = h.open;
    this.moves = Math.max(0, this.moves - 1);
    this.hinted = null;
    return true;
  }

  /** Point the way a shortest route from here tips next. Costs a star. */
  hint(): number | null {
    if (this.hints <= 0 || this.won) return null;
    const r = solve(this.level, this.block, this.open);
    if (!r.path?.length) return null;
    this.hints--;
    this.hintsUsed++;
    this.hinted = r.path[0];
    return this.hinted;
  }

  /** Stars from moves against par, one fewer for each hint used, never below one. */
  stars(): number {
    const par = this.level.par;
    const byMoves = this.moves <= par ? 3 : this.moves <= Math.ceil(par * 1.25) ? 2 : 1;
    return Math.max(1, byMoves - this.hintsUsed);
  }
}
