import { Rng } from '../../../shared/rng';
import { Blocks, blocks, freePairs, freeTiles, isFree } from '../core/rules';
import { dealBackwards, findPath } from '../core/solver';
import { PairsLevel } from '../core/types';

export const HINTS_PER_LEVEL = 3;
export const SHUFFLES_PER_LEVEL = 3;

export type TapResult = 'blocked' | 'select' | 'deselect' | 'switch' | 'match';

/**
 * One play of a Layer Pairs level. Tap a free tile, then a free tile with the same picture,
 * to lift both off. Undo is free; hints and shuffles cost a star each.
 */
export class Session {
  alive: boolean[];
  faces: number[];
  selected: number | null = null;
  elapsedMs = 0;
  hints = HINTS_PER_LEVEL;
  hintsUsed = 0;
  shuffles = SHUFFLES_PER_LEVEL;
  shufflesUsed = 0;
  undos = 0;
  /** The pair the last hint pointed at, until one of them is tapped. */
  hinted: [number, number] | null = null;
  readonly blocks: Blocks;
  private history: [number, number][] = [];

  constructor(readonly level: PairsLevel) {
    this.alive = level.slots.map(() => true);
    this.faces = level.faces.slice();
    this.blocks = blocks(level.slots);
  }

  get slots() {
    return this.level.slots;
  }
  get left(): number {
    return this.alive.filter(Boolean).length;
  }
  get won(): boolean {
    return this.left === 0;
  }
  /** No free pair left, with tiles still on the table. */
  get stuck(): boolean {
    return !this.won && freePairs(this.blocks, this.alive, this.faces).length === 0;
  }
  get timerRunning(): boolean {
    return !this.won;
  }
  get canUndo(): boolean {
    return this.history.length > 0;
  }
  /** Free tiles that have a free match: how many tiles could go right now. */
  get freeMatched(): number {
    const set = new Set(freePairs(this.blocks, this.alive, this.faces).flat());
    return set.size;
  }
  free(i: number): boolean {
    return isFree(this.blocks, this.alive, i);
  }

  tap(i: number): TapResult | null {
    if (this.won || !this.alive[i]) return null;
    if (!this.free(i)) return 'blocked';
    const s = this.selected;
    if (s === null) {
      this.selected = i;
      return 'select';
    }
    if (s === i) {
      this.selected = null;
      return 'deselect';
    }
    if (this.faces[s] !== this.faces[i]) {
      this.selected = i;
      return 'switch';
    }
    this.alive[s] = false;
    this.alive[i] = false;
    this.history.push([s, i]);
    this.selected = null;
    if (this.hinted && (this.hinted.includes(s) || this.hinted.includes(i))) this.hinted = null;
    return 'match';
  }

  /** Put the last pair back. Free and unlimited. */
  undo(): [number, number] | null {
    const p = this.history.pop();
    if (!p) return null;
    this.alive[p[0]] = true;
    this.alive[p[1]] = true;
    this.selected = null;
    this.hinted = null;
    this.undos++;
    return p;
  }

  /**
   * Point at a pair that still leads to a clear table. 'dead' if there is none from here
   * (undo or shuffle instead; that costs nothing). If the search gives up on a big pile,
   * any free pair. Costs a star when it points at a pair.
   */
  hint(): [number, number] | 'dead' | null {
    if (this.hints <= 0 || this.won) return null;
    const path = findPath(this.blocks, this.faces, this.alive);
    let pair = path.pairs?.[0] ?? null;
    if (!pair) {
      if (!path.capped) return 'dead';
      pair = freePairs(this.blocks, this.alive, this.faces)[0] ?? null;
      if (!pair) return 'dead';
    }
    this.hints--;
    this.hintsUsed++;
    this.hinted = pair;
    this.selected = null;
    return pair;
  }

  /**
   * Deal the pictures left on the table again, so that they can all be cleared. Costs a star.
   */
  shuffle(): boolean {
    if (this.shuffles <= 0 || this.won) return false;
    const rng = new Rng(this.level.number * 131 + this.shufflesUsed * 7919 + this.history.length);
    const live = this.alive.map((a, i) => (a ? i : -1)).filter((i) => i >= 0);
    // The pictures left, as pairs.
    const count = new Map<number, number>();
    for (const i of live) count.set(this.faces[i], (count.get(this.faces[i]) ?? 0) + 1);
    const kinds: number[] = [];
    for (const [k, n] of count) for (let p = 0; p < n / 2; p++) kinds.push(k);
    let faces: number[] | null = null;
    for (let k = 0; k < 30 && !faces; k++) faces = dealBackwards(this.blocks, this.alive, rng.shuffle(kinds.slice()), rng);
    if (faces) for (const i of live) this.faces[i] = faces[i];
    else {
      // The pile can't be dealt to clear (a lone stack): just mix the pictures.
      const mixed = rng.shuffle(live.map((i) => this.faces[i]));
      live.forEach((i, k) => (this.faces[i] = mixed[k]));
    }
    this.shuffles--;
    this.shufflesUsed++;
    this.selected = null;
    this.hinted = null;
    return true;
  }

  /** Free tiles right now, for the renderer. */
  freeSet(): Set<number> {
    return new Set(freeTiles(this.blocks, this.alive));
  }

  stars(): number {
    return Math.max(1, 3 - this.hintsUsed - this.shufflesUsed);
  }
}
