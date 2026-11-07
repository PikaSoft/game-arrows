import { around, flood, numbers } from '../core/rules';
import { nextStep } from '../core/solver';
import { MinesLevel } from '../core/types';

export const START_HEARTS = 3;
export const HINTS_PER_LEVEL = 3;

export interface RevealResult {
  /** Squares newly uncovered. */
  opened: number[];
  /** The mine hit, if any: it costs a heart and stays shown. */
  hit: number | null;
  outOfHearts: boolean;
}

/**
 * One play of a Hidden Mines level. The start square (and everything a 0 there opens)
 * is uncovered from the beginning. Uncovering a mine costs a heart; the mine stays shown
 * and play goes on. Flags are the player's own notes and are never checked.
 */
export class Session {
  readonly nums: number[];
  open: Uint8Array;
  flagged: Uint8Array;
  /** Mines the player has set off. */
  hit = new Set<number>();
  hearts = START_HEARTS;
  continued = false;
  awaitingContinue = false;
  elapsedMs = 0;
  hints = HINTS_PER_LEVEL;
  /** The square the last hint showed. */
  hinted: number | null = null;
  private safeTotal: number;
  private mineSet: Set<number>;

  constructor(readonly level: MinesLevel) {
    const { w, h, mines, start } = level;
    this.nums = numbers(w, h, mines);
    this.open = new Uint8Array(w * h);
    this.flagged = new Uint8Array(w * h);
    this.mineSet = new Set(mines);
    this.safeTotal = w * h - mines.length;
    flood(w, h, this.nums, this.open, start);
  }

  get w() {
    return this.level.w;
  }
  get h() {
    return this.level.h;
  }
  get won(): boolean {
    let n = 0;
    for (let i = 0; i < this.open.length; i++) n += this.open[i];
    return n === this.safeTotal;
  }
  get timerRunning(): boolean {
    return !this.won && !this.awaitingContinue;
  }
  /** Mines not yet flagged or set off (can go below 0 if flags are wrong). */
  get minesLeft(): number {
    let f = 0;
    for (let i = 0; i < this.flagged.length; i++) f += this.flagged[i];
    return this.level.mines.length - f - this.hit.size;
  }
  isMine(i: number): boolean {
    return this.mineSet.has(i);
  }
  /** Covered: not uncovered and not a mine already set off. */
  covered(i: number): boolean {
    return !this.open[i] && !this.hit.has(i);
  }

  /** Uncover square i. Null if it can't be (already open, flagged, or a mine shown). */
  reveal(i: number): RevealResult | null {
    if (!this.covered(i) || this.flagged[i] || this.won || this.awaitingContinue) return null;
    if (this.hinted === i) this.hinted = null;
    if (this.mineSet.has(i)) return this.setOff(i, []);
    const opened = flood(this.w, this.h, this.nums, this.open, i);
    // Flags on squares that turned out safe and got opened by a flood just go away.
    for (const c of opened) this.flagged[c] = 0;
    return { opened, hit: null, outOfHearts: false };
  }

  private setOff(i: number, opened: number[]): RevealResult {
    this.hit.add(i);
    this.flagged[i] = 0;
    let outOfHearts = false;
    if (!this.continued && this.hearts > 0) {
      this.hearts--;
      if (this.hearts === 0) {
        this.awaitingContinue = true;
        outOfHearts = true;
      }
    }
    return { opened, hit: i, outOfHearts };
  }

  /**
   * Tap on an uncovered number whose mines are all flagged (or set off): uncover every
   * other covered square around it. A wrong flag means a mine gets set off (the first one
   * found, and that ends the chord). Null if the count doesn't match yet.
   */
  chord(i: number): RevealResult | null {
    if (!this.open[i] || this.nums[i] <= 0 || this.won || this.awaitingContinue) return null;
    const near = around(this.w, this.h, i);
    const marked = near.filter((o) => this.flagged[o] || this.hit.has(o)).length;
    if (marked !== this.nums[i]) return null;
    const opened: number[] = [];
    for (const o of near) {
      if (!this.covered(o) || this.flagged[o]) continue;
      if (this.mineSet.has(o)) return this.setOff(o, opened);
      opened.push(...flood(this.w, this.h, this.nums, this.open, o));
    }
    for (const c of opened) this.flagged[c] = 0;
    return opened.length ? { opened, hit: null, outOfHearts: false } : null;
  }

  /** Flag or unflag a covered square. Not checked, and not a move. */
  toggleFlag(i: number): boolean {
    if (!this.covered(i) || this.won) return false;
    this.flagged[i] ^= 1;
    return true;
  }

  continueWithoutHearts(): void {
    this.awaitingContinue = false;
    this.continued = true;
  }

  /**
   * Uncover a square that can be worked out as safe from what's showing (flags aren't
   * trusted, only mines set off). If only mines can be worked out, flag one instead.
   * Hints are free. Returns the square, or null.
   */
  hint(): { cell: number; kind: 'safe' | 'mine' } | null {
    if (this.hints <= 0 || this.won || this.awaitingContinue) return null;
    // Reason forward on a copy, taking found mines as known, until a safe square turns up.
    const k = { open: this.open.slice(), mine: new Uint8Array(this.open.length) };
    for (const m of this.hit) k.mine[m] = 1;
    let cell = -1;
    let kind: 'safe' | 'mine' = 'safe';
    let unflaggedMine = -1;
    for (let guard = 0; guard < 100 && cell < 0; guard++) {
      const step = nextStep(this.w, this.h, this.nums, k, this.level.mines.length);
      if (!step) break;
      if (step.safe.length) cell = step.safe[0];
      else {
        if (unflaggedMine < 0) unflaggedMine = step.mines.find((m) => !this.flagged[m]) ?? -1;
        for (const m of step.mines) k.mine[m] = 1;
      }
    }
    if (cell < 0 && unflaggedMine >= 0) {
      cell = unflaggedMine;
      kind = 'mine';
    }
    // Shouldn't happen on our boards; fall back to any covered safe square.
    if (cell < 0) cell = this.open.findIndex((v, i) => !v && !this.mineSet.has(i));
    if (cell < 0) return null;
    if (kind === 'safe') {
      const opened = flood(this.w, this.h, this.nums, this.open, cell);
      for (const c of opened) this.flagged[c] = 0;
    } else this.flagged[cell] = 1;
    this.hints--;
    this.hinted = cell;
    return { cell, kind };
  }

  stars(): number {
    return this.continued ? 0 : this.hearts;
  }
}
