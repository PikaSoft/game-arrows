import { crossings, linksOf } from '../core/rules';
import { nextBridges } from '../core/solver';
import { BridgesLevel } from '../core/types';

export const START_HEARTS = 3;
export const HINTS_PER_LEVEL = 3;

export type BuildResult =
  | { ok: true; outOfHearts: false }
  | { ok: false; outOfHearts: boolean }
  /** Refused without a heart: the rules on the board already forbid it. */
  | { blocked: 'cross' | 'full' | 'double' };

/**
 * One play of an Island Bridges level. Like the other deduction games, every bridge is
 * checked straight away: a right one is built; a wrong one isn't, and costs a heart.
 * Bridges the board itself rules out (crossing a bridge, a third bridge, or more than
 * an island's number) are simply refused.
 */
export class Session {
  bridges: number[];
  mistakes = 0;
  hearts = START_HEARTS;
  continued = false;
  awaitingContinue = false;
  elapsedMs = 0;
  hints = HINTS_PER_LEVEL;
  hinted: number | null = null;
  readonly adj: number[][];
  readonly cross: number[][];

  constructor(readonly level: BridgesLevel) {
    this.bridges = level.links.map(() => 0);
    this.adj = linksOf(level.islands.length, level.links);
    this.cross = crossings(level.links);
  }

  get won(): boolean {
    return this.bridges.every((b, k) => b === this.level.solution[k]);
  }
  get timerRunning(): boolean {
    return !this.won && !this.awaitingContinue;
  }
  /** Bridges built at island i. */
  built(i: number): number {
    return this.adj[i].reduce((s, k) => s + this.bridges[k], 0);
  }
  done(i: number): boolean {
    return this.built(i) === this.level.islands[i].n;
  }
  get islandsDone(): number {
    return this.level.islands.filter((_, i) => this.done(i)).length;
  }

  /** Add one bridge on link k. Null if the board is finished or waiting on a choice. */
  build(k: number): BuildResult | null {
    if (this.won || this.awaitingContinue) return null;
    const l = this.level.links[k];
    if (this.bridges[k] >= 2) return { blocked: 'double' };
    if (this.done(l.a) || this.done(l.b)) return { blocked: 'full' };
    if (this.cross[k].some((j) => this.bridges[j] > 0)) return { blocked: 'cross' };
    if (this.hinted === k) this.hinted = null;
    if (this.level.solution[k] > this.bridges[k]) {
      this.bridges[k]++;
      return { ok: true, outOfHearts: false };
    }
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

  continueWithoutHearts(): void {
    this.awaitingContinue = false;
    this.continued = true;
  }

  /** Build a bridge the rules can work out from the board as it is. Free. */
  hint(): number | null {
    if (this.hints <= 0 || this.won || this.awaitingContinue) return null;
    const next = nextBridges(this.level, this.bridges);
    const k = next[0] ?? this.level.solution.findIndex((v, j) => v > this.bridges[j]);
    if (k < 0) return null;
    this.bridges[k]++;
    this.hints--;
    this.hinted = k;
    return k;
  }

  stars(): number {
    return this.continued ? 0 : this.hearts;
  }
}
