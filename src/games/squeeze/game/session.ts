import { Board, exitSide, occupancy, Pos, reachable } from '../core/rules';
import { startPos } from '../core/solver';
import { Side, SqueezeLevel } from '../core/types';

/** One play of a Squeeze level: where each block is, moves and undo history. */
export class Session {
  readonly board: Board;
  pos: Pos[];
  moves = 0;
  elapsedMs = 0;
  private history: Pos[][] = [];

  constructor(readonly level: SqueezeLevel) {
    this.board = { w: level.w, h: level.h, gaps: level.gaps };
    this.pos = startPos(level.blocks);
  }

  get blocks() {
    return this.level.blocks;
  }
  get won(): boolean {
    return this.pos.every((p) => p === null);
  }
  get timerRunning(): boolean {
    return !this.won;
  }
  get canUndo(): boolean {
    return this.history.length > 0;
  }
  get left(): number {
    return this.pos.filter(Boolean).length;
  }

  /** Index of the block covering cell x, y, or null. */
  blockAt(x: number, y: number): number | null {
    if (x < 0 || y < 0 || x >= this.board.w || y >= this.board.h) return null;
    const i = occupancy(this.board, this.blocks, this.pos)[y * this.board.w + x];
    return i >= 0 ? i : null;
  }

  /**
   * What block i can do right now: the cells (as y * w + x) its top-left can slide to,
   * and for each of those the side it could leave through, if any.
   */
  options(i: number): { reach: Set<number>; exits: Map<number, Side> } {
    const occ = occupancy(this.board, this.blocks, this.pos, i);
    const reach = new Set(reachable(this.board, this.blocks, this.pos, i, occ));
    const exits = new Map<number, Side>();
    for (const k of reach) {
      const side = exitSide(this.board, this.blocks, occ, i, k % this.board.w, (k / this.board.w) | 0);
      if (side) exits.set(k, side);
    }
    return { reach, exits };
  }

  /** Slide block i to `to`. One move, however far it went. */
  commit(i: number, to: { x: number; y: number }): boolean {
    const cur = this.pos[i];
    if (!cur || (to.x === cur.x && to.y === cur.y)) return false;
    if (!this.options(i).reach.has(to.y * this.board.w + to.x)) return false;
    this.record(i, { ...to });
    return true;
  }

  /**
   * Block i leaves the board, sliding first to `at` (where it is, if left out) and out
   * through a gap from there. One move. Returns the side it left through, or null.
   */
  leave(i: number, at?: { x: number; y: number }): Side | null {
    const cur = this.pos[i];
    if (!cur) return null;
    const { exits } = this.options(i);
    const from = at ?? cur;
    const side = exits.get(from.y * this.board.w + from.x) ?? (at ? null : [...exits.values()][0]);
    if (!side) return null;
    this.record(i, null);
    return side;
  }

  private record(i: number, p: Pos): void {
    this.history.push(this.pos);
    this.pos = this.pos.slice();
    this.pos[i] = p;
    this.moves++;
  }

  /** Step back one move. Undone moves still count. */
  undo(): boolean {
    const prev = this.history.pop();
    if (!prev) return false;
    this.pos = prev;
    return true;
  }

  stars(): number {
    const par = this.level.par;
    return this.moves <= par ? 3 : this.moves <= Math.ceil(par * 1.25) ? 2 : 1;
  }
}
