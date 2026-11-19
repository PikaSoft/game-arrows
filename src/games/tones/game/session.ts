import { lines } from '../core/rules';
import { nextWave } from '../core/solver';
import { A, B, EMPTY, TonesLevel } from '../core/types';

export const START_HEARTS = 3;
export const HINTS_PER_LEVEL = 3;

export type Mode = 'a' | 'b';

export interface MarkResult {
  ok: boolean;
  outOfHearts: boolean;
}

/**
 * One play of a Two Tones level. Like Star Battle, every square is checked straight away:
 * a right tone stays; a wrong one shows the square's real tone and costs a heart.
 */
export class Session {
  known: number[];
  mistakes = new Set<number>();
  hearts = START_HEARTS;
  continued = false;
  awaitingContinue = false;
  elapsedMs = 0;
  hints = HINTS_PER_LEVEL;
  hinted: number | null = null;
  readonly lines: number[][];

  constructor(readonly level: TonesLevel) {
    this.known = level.givens.slice();
    this.lines = lines(level.size);
  }

  get size() {
    return this.level.size;
  }
  get won(): boolean {
    return this.known.every((v) => v !== EMPTY);
  }
  get timerRunning(): boolean {
    return !this.won && !this.awaitingContinue;
  }
  /** Squares still to fill. */
  get left(): number {
    return this.known.filter((v) => v === EMPTY).length;
  }
  isGiven(i: number): boolean {
    return this.level.givens[i] !== EMPTY;
  }
  /** How many more of a tone line li (rows first, then columns) still needs. */
  needs(li: number, tone: number): number {
    return this.size / 2 - this.lines[li].filter((i) => this.known[i] === tone).length;
  }

  /** Fill square i with a tone. Null if it is already filled. */
  mark(i: number, mode: Mode): MarkResult | null {
    if (this.known[i] !== EMPTY || this.won || this.awaitingContinue) return null;
    const truth = this.level.solution[i];
    const ok = truth === (mode === 'a' ? A : B);
    this.known[i] = truth;
    if (this.hinted === i) this.hinted = null;
    let outOfHearts = false;
    if (!ok) {
      this.mistakes.add(i);
      if (!this.continued && this.hearts > 0) {
        this.hearts--;
        // Out of hearts, unless that square just finished the board.
        if (this.hearts === 0 && !this.won) {
          this.awaitingContinue = true;
          outOfHearts = true;
        }
      }
    }
    return { ok, outOfHearts };
  }

  continueWithoutHearts(): void {
    this.awaitingContinue = false;
    this.continued = true;
  }

  /** Fill a square the rules can work out from the board as it is (the easiest such). Free. */
  hint(): number | null {
    if (this.hints <= 0 || this.won || this.awaitingContinue) return null;
    const w = nextWave(this.size, this.known);
    const open = this.known.map((v, i) => (v === EMPTY ? i : -1)).filter((i) => i >= 0);
    const i = w ? [...w.moves.keys()][0] : open[0];
    if (i === undefined) return null;
    this.known[i] = this.level.solution[i];
    this.hints--;
    this.hinted = i;
    return i;
  }

  stars(): number {
    return this.continued ? 0 : this.hearts;
  }
}
