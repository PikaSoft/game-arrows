import { isSolved, neighbour, rotateBy, turnsBetween, watered } from '../core/rules';
import { PipeLevel } from '../core/types';

export const HINTS_PER_LEVEL = 3;

/** One play of a Pipe Link level: how far each tile is turned, locks, taps and undo. */
export class Session {
  /** Quarter turns clockwise applied to each tile so far. Only ever grows, except by undo. */
  turns: number[];
  locked: boolean[];
  moves = 0;
  elapsedMs = 0;
  hints = HINTS_PER_LEVEL;
  /** The tile the last hint fixed, for the renderer to highlight. */
  hinted: number | null = null;
  private history: number[] = [];

  constructor(readonly level: PipeLevel) {
    this.turns = level.tiles.map(() => 0);
    this.locked = level.tiles.map(() => false);
  }

  get w() {
    return this.level.w;
  }
  get h() {
    return this.level.h;
  }
  mask(i: number): number {
    return rotateBy(this.level.tiles[i], this.turns[i]);
  }
  get masks(): number[] {
    return this.level.tiles.map((_, i) => this.mask(i));
  }
  get won(): boolean {
    return isSolved(this.w, this.h, this.masks, this.level.source);
  }
  get timerRunning(): boolean {
    return !this.won;
  }
  get canUndo(): boolean {
    return this.history.length > 0;
  }
  /** Tiles the water reaches right now. */
  watered(): Set<number> {
    return watered(this.w, this.h, this.masks, this.level.source);
  }

  /** Turn tile i a quarter turn clockwise. One move. False if it is locked. */
  tap(i: number): boolean {
    if (this.locked[i] || this.won) return false;
    this.turn(i);
    if (this.hinted === i) this.hinted = null;
    return true;
  }

  private turn(i: number): void {
    this.turns[i]++;
    this.history.push(i);
    this.moves++;
  }

  /** Lock or unlock tile i. Not a move. */
  toggleLock(i: number): void {
    this.locked[i] = !this.locked[i];
  }

  /** Turn back the last tap. Undone taps still count. */
  undo(): number | null {
    const i = this.history.pop();
    if (i === undefined) return null;
    this.turns[i]--;
    return i;
  }

  /**
   * Turn one wrong tile into place and lock it. Prefers a tile next to the water, so the
   * network grows from the tap outward. The turns count as taps, as if played.
   */
  hint(): number | null {
    if (this.hints <= 0 || this.won) return null;
    const { solution, source } = this.level;
    const wrong = solution.map((_, i) => i).filter((i) => this.mask(i) !== solution[i]);
    if (!wrong.length) return null;
    const wet = this.watered();
    const nearWater = (i: number) => i === source || [0, 1, 2, 3].some((d) => wet.has(neighbour(this.w, this.h, i, d)));
    const i = wrong.find(nearWater) ?? wrong[0];
    const k = turnsBetween(this.mask(i), solution[i]);
    for (let n = 0; n < k; n++) this.turn(i);
    this.locked[i] = true;
    this.hints--;
    this.hinted = i;
    return i;
  }

  stars(): number {
    const par = this.level.par;
    return this.moves <= par ? 3 : this.moves <= Math.ceil(par * 1.25) ? 2 : 1;
  }
}
