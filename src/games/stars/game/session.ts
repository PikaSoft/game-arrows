import { around, Board, units } from '../core/rules';
import { wave } from '../core/solver';
import { DOT, STAR, StarsLevel, UNKNOWN } from '../core/types';

export const START_HEARTS = 3;
export const HINTS_PER_LEVEL = 3;

export type Mode = 'star' | 'dot';

export interface MarkResult {
  ok: boolean;
  /** Squares dotted automatically: round a star, and the rest of a finished row, column or region. */
  dotted: number[];
  outOfHearts: boolean;
}

/**
 * One play of a Star Battle level. Like Picture Grid, every mark is checked straight away:
 * a right mark stays; a wrong one shows what the square really is and costs a heart.
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
  private starSet: Set<number>;
  private units: number[][];

  constructor(readonly level: StarsLevel) {
    this.board = { size: level.size, per: level.per, regions: level.regions };
    this.known = new Array<number>(level.size * level.size).fill(UNKNOWN);
    this.starSet = new Set(level.stars);
    this.units = units(this.board);
  }

  get size() {
    return this.level.size;
  }
  get won(): boolean {
    return this.level.stars.every((s) => this.known[s] === STAR);
  }
  get timerRunning(): boolean {
    return !this.won && !this.awaitingContinue;
  }
  get found(): [number, number] {
    return [this.level.stars.filter((s) => this.known[s] === STAR).length, this.level.stars.length];
  }

  private truth(i: number): number {
    return this.starSet.has(i) ? STAR : DOT;
  }

  /** Mark square i as a star or a dot. Null if it is already worked out. */
  mark(i: number, mode: Mode): MarkResult | null {
    if (this.known[i] !== UNKNOWN || this.won || this.awaitingContinue) return null;
    const truth = this.truth(i);
    const ok = (mode === 'star') === (truth === STAR);
    this.known[i] = truth;
    if (this.hinted === i) this.hinted = null;
    let outOfHearts = false;
    if (!ok) {
      this.mistakes.add(i);
      if (!this.continued && this.hearts > 0) {
        this.hearts--;
        // Out of hearts, unless that mark just finished the board.
        if (this.hearts === 0 && !this.won) {
          this.awaitingContinue = true;
          outOfHearts = true;
        }
      }
    }
    return { ok, dotted: this.autoDot(), outOfHearts };
  }

  /**
   * Dots that follow from what's on the board for certain: every square round a star, and
   * the rest of any row, column or region that has all its stars.
   */
  private autoDot(): number[] {
    const out: number[] = [];
    const dot = (c: number) => {
      if (this.known[c] !== UNKNOWN) return;
      this.known[c] = DOT;
      out.push(c);
    };
    this.known.forEach((v, i) => v === STAR && around(this.size, i).forEach(dot));
    for (const u of this.units) if (u.filter((c) => this.known[c] === STAR).length === this.level.per) u.forEach(dot);
    return out;
  }

  continueWithoutHearts(): void {
    this.awaitingContinue = false;
    this.continued = true;
  }

  /** Reveal a square the rules can work out from the board as it is, preferring a star. Free. */
  hint(): number | null {
    if (this.hints <= 0 || this.won || this.awaitingContinue) return null;
    const next = wave(this.board, this.known);
    const open = this.known.map((v, i) => (v === UNKNOWN ? i : -1)).filter((i) => i >= 0);
    const deducible = next ? open.filter((i) => next[i] !== UNKNOWN) : [];
    const pool = deducible.length ? deducible : open;
    const i = pool.find((c) => this.starSet.has(c)) ?? pool[0];
    if (i === undefined) return null;
    this.known[i] = this.truth(i);
    this.autoDot();
    this.hints--;
    this.hinted = i;
    return i;
  }

  stars(): number {
    return this.continued ? 0 : this.hearts;
  }
}
