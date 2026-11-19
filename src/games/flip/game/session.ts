import { Rng } from '../../../shared/rng';
import { FlipLevel } from '../core/types';

export type TapResult =
  | { kind: 'ignored' }
  | { kind: 'first' }
  | { kind: 'match'; pair: [number, number] }
  /** Two different pictures: they stay up until the next tap or `hide()`. A swap may be due once they're down. */
  | { kind: 'miss'; pair: [number, number]; swapDue: boolean };

/**
 * One play of a Pair Flip level. Turn over two cards at a time; a matching pair stays up.
 * A miss shows both until the next tap (or a short wait), then turns them back.
 */
export class Session {
  faces: number[];
  matched: boolean[];
  /** Cards face up but not matched: one after a first tap, two after a miss. */
  up: number[] = [];
  misses = 0;
  found = 0;
  elapsedMs = 0;
  private rng: Rng;

  constructor(readonly level: FlipLevel) {
    this.faces = level.faces.slice();
    this.matched = level.faces.map(() => false);
    this.rng = new Rng(level.seed);
  }

  get pairs(): number {
    return this.faces.length / 2;
  }
  get won(): boolean {
    return this.found === this.pairs;
  }
  get timerRunning(): boolean {
    return !this.won;
  }
  isUp(i: number): boolean {
    return this.matched[i] || this.up.includes(i);
  }

  /** Turn back a missed pair. True if there was one. */
  hide(): boolean {
    if (this.up.length !== 2) return false;
    this.up = [];
    return true;
  }

  tap(i: number): TapResult {
    if (this.won || this.matched[i] || this.up.includes(i)) return { kind: 'ignored' };
    // A missed pair still showing goes back first.
    this.hide();
    this.up.push(i);
    if (this.up.length === 1) return { kind: 'first' };
    const [a, b] = this.up;
    if (this.faces[a] === this.faces[b]) {
      this.matched[a] = this.matched[b] = true;
      this.up = [];
      this.found++;
      return { kind: 'match', pair: [a, b] };
    }
    this.misses++;
    const every = this.level.swapEvery;
    return { kind: 'miss', pair: [a, b], swapDue: every > 0 && this.misses % every === 0 };
  }

  /**
   * Swap two face-down cards (not the pair just missed, if it's still up). Returns them,
   * or null if fewer than two are down.
   */
  swap(): [number, number] | null {
    const down = this.faces.map((_, i) => i).filter((i) => !this.isUp(i));
    if (down.length < 2) return null;
    const a = this.rng.pick(down);
    const b = this.rng.pick(down.filter((i) => i !== a && this.faces[i] !== this.faces[a]));
    if (b === undefined) return null;
    [this.faces[a], this.faces[b]] = [this.faces[b], this.faces[a]];
    return [a, b];
  }

  /** Stars from misses: par or fewer is three, up to twice par two, otherwise one. */
  stars(): number {
    const par = this.level.par;
    return this.misses <= par ? 3 : this.misses <= par * 2 ? 2 : 1;
  }
}
