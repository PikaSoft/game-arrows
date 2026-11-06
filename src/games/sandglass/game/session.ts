import { canPour, clone, isComplete, isShuttling, isSolved, pour, topRun, usefulMoves } from '../core/rules';
import { Bottle, SandLevel } from '../core/types';

export type PourResult =
  | { kind: 'pour'; from: number; to: number; color: number; amount: number; before: Bottle[]; completed: boolean; revealed: number[] }
  | { kind: 'invalid'; from: number; to: number };

/** One play of a Sandglass level: the bottles, moves, undo history and covered layers. */
export class Session {
  bottles: Bottle[];
  /** Per bottle, how many layers from the bottom are still covered. Never grows. */
  hidden: number[];
  readonly capacity: number;
  moves = 0;
  elapsedMs = 0;
  addedBottle = false;
  private history: Bottle[][] = [];

  constructor(readonly level: SandLevel) {
    this.capacity = level.capacity;
    this.bottles = clone(level.bottles);
    this.hidden = level.hidden.slice();
    this.reveal();
  }

  get won(): boolean {
    return isSolved(this.bottles, this.capacity);
  }
  get timerRunning(): boolean {
    return !this.won;
  }
  get canUndo(): boolean {
    return this.history.length > 0;
  }
  /** No pour left that could change anything. */
  get noMoves(): boolean {
    return !this.won && usefulMoves(this.bottles, this.capacity).length === 0;
  }
  /** The only pours left move one colour back and forth between the same two bottles. */
  get shuttling(): boolean {
    return !this.won && isShuttling(this.bottles, this.capacity);
  }
  get stuck(): boolean {
    return this.noMoves || this.shuttling;
  }

  canPour(from: number, to: number): boolean {
    return canPour(this.bottles, this.capacity, from, to);
  }

  pour(from: number, to: number): PourResult {
    if (!this.canPour(from, to)) return { kind: 'invalid', from, to };
    const before = clone(this.bottles);
    const color = this.bottles[from][this.bottles[from].length - 1];
    const amount = pour(this.bottles, this.capacity, from, to);
    this.history.push(before);
    this.moves++;
    const revealed = this.reveal();
    return { kind: 'pour', from, to, color, amount, before, completed: isComplete(this.bottles[to], this.capacity), revealed };
  }

  /**
   * Uncover whatever is now on top. Sand of one colour lying together counts as one
   * clump, so the layers under a newly uncovered one show too if they match it.
   * Returns the bottles where something was uncovered.
   */
  private reveal(): number[] {
    const changed: number[] = [];
    this.bottles.forEach((b, i) => {
      const visible = b.length ? b.length - topRun(b) : 0;
      if (this.hidden[i] > visible) {
        this.hidden[i] = visible;
        changed.push(i);
      }
    });
    return changed;
  }

  /** Step back one pour. Undone pours still count as moves, and covered sand stays seen. */
  undo(): boolean {
    const prev = this.history.pop();
    if (!prev) return false;
    this.bottles = prev;
    this.reveal();
    return true;
  }

  /** Once per level: an extra empty bottle. Caps the result at two stars. */
  addBottle(): boolean {
    if (this.addedBottle) return false;
    this.addedBottle = true;
    this.bottles.push([]);
    this.hidden.push(0);
    for (const h of this.history) h.push([]);
    return true;
  }

  isHidden(bottle: number, layer: number): boolean {
    return layer < this.hidden[bottle];
  }

  stars(): number {
    const par = this.level.par;
    let s = this.moves <= par ? 3 : this.moves <= Math.ceil(par * 1.25) ? 2 : 1;
    if (this.addedBottle) s = Math.min(s, 2);
    return s;
  }
}
