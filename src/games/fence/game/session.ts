import { gridOf, Grid } from '../core/grid';
import { nextWave } from '../core/solver';
import { FenceLevel, OFF, ON, UNKNOWN } from '../core/types';

export const START_HEARTS = 3;
export const HINTS_PER_LEVEL = 3;

export type Mode = 'fence' | 'cross';

export interface MarkResult {
  ok: boolean;
  /** Lines crossed out automatically as a result. */
  crossed: number[];
  outOfHearts: boolean;
}

/**
 * One play of a Fence Loop level. Like Star Battle, every mark is checked straight away: a
 * right one stays; a wrong one shows what the line really is and costs a heart. Crosses
 * that follow for certain fill in by themselves.
 */
export class Session {
  readonly g: Grid;
  known: Int8Array;
  mistakes = new Set<number>();
  hearts = START_HEARTS;
  continued = false;
  awaitingContinue = false;
  elapsedMs = 0;
  hints = HINTS_PER_LEVEL;
  hinted: number | null = null;

  constructor(readonly level: FenceLevel) {
    this.g = gridOf(level.w, level.h);
    this.known = new Int8Array(this.g.edges);
    this.autoCross();
  }

  get won(): boolean {
    return this.level.solution.every((on, e) => !on || this.known[e] === ON);
  }
  get timerRunning(): boolean {
    return !this.won && !this.awaitingContinue;
  }
  /** Fence placed, and fence in the answer. */
  get progress(): [number, number] {
    let placed = 0;
    let total = 0;
    this.level.solution.forEach((on, e) => {
      if (!on) return;
      total++;
      if (this.known[e] === ON) placed++;
    });
    return [placed, total];
  }
  /** True when a numbered square has all its fence. */
  satisfied(cell: number): boolean {
    const n = this.level.clues[cell];
    return n >= 0 && this.g.cellEdges[cell].filter((e) => this.known[e] === ON).length === n;
  }

  mark(e: number, mode: Mode): MarkResult | null {
    if (this.known[e] !== UNKNOWN || this.won || this.awaitingContinue) return null;
    const truth = this.level.solution[e];
    const ok = (mode === 'fence') === truth;
    this.known[e] = truth ? ON : OFF;
    if (this.hinted === e) this.hinted = null;
    let outOfHearts = false;
    if (!ok) {
      this.mistakes.add(e);
      if (!this.continued && this.hearts > 0) {
        this.hearts--;
        if (this.hearts === 0 && !this.won) {
          this.awaitingContinue = true;
          outOfHearts = true;
        }
      }
    }
    return { ok, crossed: this.autoCross(), outOfHearts };
  }

  /**
   * Crosses that follow for certain: every line round a 0, the rest of a dot that has two
   * fences, and the rest of a numbered square that has all its fence.
   */
  private autoCross(): number[] {
    const out: number[] = [];
    const cross = (e: number) => {
      if (this.known[e] !== UNKNOWN) return;
      this.known[e] = OFF;
      out.push(e);
    };
    for (const es of this.g.dotEdges) if (es.filter((e) => this.known[e] === ON).length === 2) es.forEach(cross);
    this.level.clues.forEach((n, cell) => {
      if (n < 0) return;
      const es = this.g.cellEdges[cell];
      if (es.filter((e) => this.known[e] === ON).length === n) es.forEach(cross);
    });
    return out;
  }

  continueWithoutHearts(): void {
    this.awaitingContinue = false;
    this.continued = true;
  }

  /** Reveal a line the next step of reasoning settles, preferring fence. Free. */
  hint(): number | null {
    if (this.hints <= 0 || this.won || this.awaitingContinue) return null;
    const wave = nextWave(this.level, this.known);
    const on = wave.find(([, v]) => v === ON);
    let e = on ? on[0] : wave[0]?.[0];
    if (e === undefined) e = this.level.solution.findIndex((s, k) => s && this.known[k] === UNKNOWN);
    if (e < 0) return null;
    this.known[e] = this.level.solution[e] ? ON : OFF;
    this.autoCross();
    this.hints--;
    this.hinted = e;
    return e;
  }

  stars(): number {
    return this.continued ? 0 : this.hearts;
  }
}
