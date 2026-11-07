import { Board } from '../core/rules';
import { startGrid, wave } from '../core/solver';
import { GRASS, TENT, TentsLevel, UNKNOWN } from '../core/types';

export const START_HEARTS = 3;
export const HINTS_PER_LEVEL = 3;

export type Mode = 'tent' | 'grass';

export interface MarkResult {
  ok: boolean;
  /** Squares turned to grass automatically because their row or column was finished. */
  grassed: number[];
  outOfHearts: boolean;
}

/**
 * One play of a Tents and Trees level. Like Picture Grid, every mark is checked against
 * the answer straight away: a right mark stays; a wrong one shows what the square really
 * is and costs a heart. Squares with no tree beside them start as grass.
 */
export class Session {
  readonly board: Board;
  known: number[];
  mistakes = new Set<number>();
  hearts = START_HEARTS;
  continued = false;
  awaitingContinue = false;
  elapsedMs = 0;
  hints = HINTS_PER_LEVEL;
  hinted: number | null = null;
  private tentSet: Set<number>;

  constructor(readonly level: TentsLevel) {
    this.board = { w: level.w, h: level.h, trees: level.trees, rowCounts: level.rowCounts, colCounts: level.colCounts };
    this.known = startGrid(this.board);
    this.tentSet = new Set(level.tents);
    // Rows and columns with no tents show as finished from the start, so fill them in.
    for (let y = 0; y < level.h; y++) if (!level.rowCounts[y]) this.autoGrass(y * level.w);
    for (let x = 0; x < level.w; x++) if (!level.colCounts[x]) this.autoGrass(x);
  }

  get w() {
    return this.level.w;
  }
  get h() {
    return this.level.h;
  }
  get won(): boolean {
    return this.level.tents.every((t) => this.known[t] === TENT);
  }
  get timerRunning(): boolean {
    return !this.won && !this.awaitingContinue;
  }
  get found(): [number, number] {
    return [this.level.tents.filter((t) => this.known[t] === TENT).length, this.level.tents.length];
  }
  rowDone(y: number): boolean {
    return this.level.tents.every((t) => ((t / this.w) | 0) !== y || this.known[t] === TENT);
  }
  colDone(x: number): boolean {
    return this.level.tents.every((t) => t % this.w !== x || this.known[t] === TENT);
  }

  private truth(i: number): number {
    return this.tentSet.has(i) ? TENT : GRASS;
  }

  /** Mark square i as a tent or grass. Null if it is already worked out (or a tree). */
  mark(i: number, mode: Mode): MarkResult | null {
    if (this.known[i] !== UNKNOWN || this.won || this.awaitingContinue) return null;
    const truth = this.truth(i);
    const ok = (mode === 'tent') === (truth === TENT);
    this.known[i] = truth;
    if (this.hinted === i) this.hinted = null;
    let outOfHearts = false;
    if (!ok) {
      this.mistakes.add(i);
      if (!this.continued && this.hearts > 0) {
        this.hearts--;
        // Out of hearts, unless that mark just finished the board: then it simply ends
        // with no stars, rather than asking whether to carry on.
        if (this.hearts === 0 && !this.won) {
          this.awaitingContinue = true;
          outOfHearts = true;
        }
      }
    }
    return { ok, grassed: this.autoGrass(i), outOfHearts };
  }

  /** Fill what's left of a finished row or column through square i with grass. */
  private autoGrass(i: number): number[] {
    const x = i % this.w;
    const y = (i / this.w) | 0;
    const out: number[] = [];
    const fill = (cells: number[]) => {
      for (const c of cells) if (this.known[c] === UNKNOWN) {
        this.known[c] = GRASS;
        out.push(c);
      }
    };
    if (this.rowDone(y)) fill(Array.from({ length: this.w }, (_, k) => y * this.w + k));
    if (this.colDone(x)) fill(Array.from({ length: this.h }, (_, k) => k * this.w + x));
    return out;
  }

  continueWithoutHearts(): void {
    this.awaitingContinue = false;
    this.continued = true;
  }

  /** Reveal a square the rules can work out from the board as it is, preferring a tent. Free. */
  hint(): number | null {
    if (this.hints <= 0 || this.won || this.awaitingContinue) return null;
    const next = wave(this.board, this.known);
    const open = this.known.map((v, i) => (v === UNKNOWN ? i : -1)).filter((i) => i >= 0);
    const deducible = next ? open.filter((i) => next[i] !== UNKNOWN) : [];
    const pool = deducible.length ? deducible : open;
    const i = pool.find((c) => this.tentSet.has(c)) ?? pool[0];
    if (i === undefined) return null;
    this.known[i] = this.truth(i);
    this.autoGrass(i);
    this.hints--;
    this.hinted = i;
    return i;
  }

  stars(): number {
    return this.continued ? 0 : this.hearts;
  }
}
