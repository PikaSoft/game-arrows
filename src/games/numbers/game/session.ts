import { Shape, shapeOf } from '../core/grid';
import { nextPlacement } from '../core/techniques';
import { NumbersLevel } from '../core/types';

export const START_HEARTS = 3;
export const HINTS_PER_LEVEL = 3;

export interface PlaceResult {
  ok: boolean;
  /** This digit used up the last heart. */
  outOfHearts: boolean;
}

/**
 * One play of a Number Place level. Digits are checked against the answer straight away:
 * a right one stays; a wrong one isn't placed and costs a heart. Notes are free.
 */
export class Session {
  readonly shape: Shape;
  grid: number[];
  /** Pencil marks: a bit per digit for each square. */
  notes: number[];
  hearts = START_HEARTS;
  continued = false;
  awaitingContinue = false;
  mistakes = 0;
  elapsedMs = 0;
  hints = HINTS_PER_LEVEL;
  /** The square the last hint filled. */
  hinted: number | null = null;
  selected: number | null = null;

  constructor(readonly level: NumbersLevel) {
    this.shape = shapeOf(level.size);
    this.grid = level.givens.slice();
    this.notes = level.givens.map(() => 0);
  }

  get size() {
    return this.level.size;
  }
  get won(): boolean {
    return this.grid.every((v, i) => v === this.level.solution[i]);
  }
  get timerRunning(): boolean {
    return !this.won && !this.awaitingContinue;
  }
  /** Squares still empty. */
  get left(): number {
    return this.grid.filter((v) => !v).length;
  }
  isGiven(i: number): boolean {
    return this.level.givens[i] !== 0;
  }
  /** How many of digit d are still to place. */
  remaining(d: number): number {
    return this.size - this.grid.filter((v) => v === d).length;
  }

  /** Put digit d in square i. Null if the square is a given or already filled. */
  place(i: number, d: number): PlaceResult | null {
    if (this.grid[i] || this.won || this.awaitingContinue) return null;
    if (this.level.solution[i] !== d) {
      this.mistakes++;
      let outOfHearts = false;
      if (!this.continued && this.hearts > 0) {
        this.hearts--;
        if (this.hearts === 0) {
          this.awaitingContinue = true;
          outOfHearts = true;
        }
      }
      return { ok: false, outOfHearts };
    }
    this.fill(i, d);
    return { ok: true, outOfHearts: false };
  }

  private fill(i: number, d: number): void {
    this.grid[i] = d;
    this.notes[i] = 0;
    const bit = 1 << (d - 1);
    // A placed digit can't be a note anywhere it can see.
    for (const p of this.shape.peers[i]) this.notes[p] &= ~bit;
    if (this.hinted === i) this.hinted = null;
  }

  /** Pencil digit d in or out of square i. */
  toggleNote(i: number, d: number): boolean {
    if (this.grid[i] || this.won) return false;
    this.notes[i] ^= 1 << (d - 1);
    return true;
  }

  clearNotes(i: number): boolean {
    if (!this.notes[i]) return false;
    this.notes[i] = 0;
    return true;
  }

  continueWithoutHearts(): void {
    this.awaitingContinue = false;
    this.continued = true;
  }

  /**
   * Fill the next square a player could work out by technique from the board as it is.
   * Hints are free. Returns the square, or null.
   */
  hint(): number | null {
    if (this.hints <= 0 || this.won || this.awaitingContinue) return null;
    const next = nextPlacement(this.shape, this.grid);
    const i = next ? next.cell : this.grid.findIndex((v) => !v);
    if (i < 0) return null;
    this.fill(i, this.level.solution[i]);
    this.hints--;
    this.hinted = i;
    return i;
  }

  stars(): number {
    return this.continued ? 0 : this.hearts;
  }
}
