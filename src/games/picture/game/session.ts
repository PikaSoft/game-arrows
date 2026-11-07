import { wave } from '../core/solver';
import { EMPTY, FILLED, PictureLevel, UNKNOWN } from '../core/types';

export const START_HEARTS = 3;
export const HINTS_PER_LEVEL = 3;

export type Mode = 'fill' | 'cross';

export interface MarkResult {
  /** True if the mark was right. A wrong one shows the right answer and costs a heart. */
  ok: boolean;
  /** Cells crossed off automatically because their row or column was finished. */
  crossed: number[];
  /** This mark used up the last heart. */
  outOfHearts: boolean;
}

/**
 * One play of a Picture Grid level. Every mark is checked against the picture straight
 * away: a right mark stays; a wrong one shows what the cell really is and costs a heart.
 * So what's on the board is always true.
 */
export class Session {
  /** What the player has worked out for each cell. */
  known: number[];
  /** Cells the player got wrong (shown in red). */
  mistakes = new Set<number>();
  hearts = START_HEARTS;
  /** Ran out of hearts and chose to carry on: no stars. */
  continued = false;
  awaitingContinue = false;
  marks = 0;
  elapsedMs = 0;
  hints = HINTS_PER_LEVEL;
  /** The cell the last hint revealed, for the renderer to highlight. */
  hinted: number | null = null;

  constructor(readonly level: PictureLevel) {
    this.known = new Array<number>(level.w * level.h).fill(UNKNOWN);
  }

  get w() {
    return this.level.w;
  }
  get h() {
    return this.level.h;
  }
  get won(): boolean {
    return this.level.solution.every((v, i) => !v || this.known[i] === FILLED);
  }
  get timerRunning(): boolean {
    return !this.won && !this.awaitingContinue;
  }
  /** Filled cells found so far, out of how many the picture has. */
  get found(): [number, number] {
    let f = 0;
    let t = 0;
    this.level.solution.forEach((v, i) => {
      if (!v) return;
      t++;
      if (this.known[i] === FILLED) f++;
    });
    return [f, t];
  }

  private truth(i: number): number {
    return this.level.solution[i] ? FILLED : EMPTY;
  }

  /** True when every filled cell of row y has been found. */
  rowDone(y: number): boolean {
    for (let x = 0; x < this.w; x++) if (this.level.solution[y * this.w + x] && this.known[y * this.w + x] !== FILLED) return false;
    return true;
  }
  colDone(x: number): boolean {
    for (let y = 0; y < this.h; y++) if (this.level.solution[y * this.w + x] && this.known[y * this.w + x] !== FILLED) return false;
    return true;
  }

  /** Mark cell i as filled or crossed. Null if it is already worked out. */
  mark(i: number, mode: Mode): MarkResult | null {
    if (this.known[i] !== UNKNOWN || this.won || this.awaitingContinue) return null;
    const truth = this.truth(i);
    const ok = (mode === 'fill') === (truth === FILLED);
    this.known[i] = truth;
    this.marks++;
    if (this.hinted === i) this.hinted = null;
    let outOfHearts = false;
    if (!ok) {
      this.mistakes.add(i);
      if (!this.continued && this.hearts > 0) {
        this.hearts--;
        if (this.hearts === 0) {
          this.awaitingContinue = true;
          outOfHearts = true;
        }
      }
    }
    return { ok, crossed: this.autoCross(i), outOfHearts };
  }

  /** Cross off what's left of a finished row or column through cell i. */
  private autoCross(i: number): number[] {
    const x = i % this.w;
    const y = (i / this.w) | 0;
    const out: number[] = [];
    const cross = (cells: number[]) => {
      for (const c of cells) if (this.known[c] === UNKNOWN) {
        this.known[c] = EMPTY;
        out.push(c);
      }
    };
    if (this.rowDone(y)) cross(Array.from({ length: this.w }, (_, k) => y * this.w + k));
    if (this.colDone(x)) cross(Array.from({ length: this.h }, (_, k) => k * this.w + x));
    return out;
  }

  continueWithoutHearts(): void {
    this.awaitingContinue = false;
    this.continued = true;
  }

  /**
   * Reveal a cell that line logic can work out from what's on the board now, preferring a
   * filled one. Hints are free. Returns the cell, or null.
   */
  hint(): number | null {
    if (this.hints <= 0 || this.won || this.awaitingContinue) return null;
    const next = wave(this.level, this.known);
    const open = this.known.map((v, i) => (v === UNKNOWN ? i : -1)).filter((i) => i >= 0);
    const deducible = next ? open.filter((i) => next[i] !== UNKNOWN) : [];
    const pool = deducible.length ? deducible : open;
    const i = pool.find((c) => this.level.solution[c]) ?? pool[0];
    if (i === undefined) return null;
    this.known[i] = this.truth(i);
    this.autoCross(i);
    this.hints--;
    this.hinted = i;
    return i;
  }

  /** Stars are the hearts left, or none after carrying on without hearts. */
  stars(): number {
    return this.continued ? 0 : this.hearts;
  }
}
