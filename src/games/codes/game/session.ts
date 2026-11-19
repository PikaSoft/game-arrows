import { Rng } from '../../../shared/rng';
import { Guess, mark } from '../core/rules';
import { nextGuess, remaining } from '../core/solver';
import { CodesLevel } from '../core/types';

export const HINTS_PER_LEVEL = 3;

/** One play of a Code Breaker level: the guesses so far and the row being filled in. */
export class Session {
  readonly guesses: Guess[] = [];
  /** The row being filled in; null is an empty slot. */
  row: (number | null)[];
  /** Slots locked in by a long press; they keep their colour and carry over to the next guess. */
  locked: boolean[];
  /** The slot the next colour goes into. */
  cursor = 0;
  elapsedMs = 0;
  hints = HINTS_PER_LEVEL;
  hintsUsed = 0;

  constructor(readonly level: CodesLevel) {
    this.row = new Array<number | null>(level.slots).fill(null);
    this.locked = new Array<boolean>(level.slots).fill(false);
  }

  get slots() {
    return this.level.slots;
  }
  get won(): boolean {
    const last = this.guesses[this.guesses.length - 1];
    return !!last && last.feedback.exact === this.slots;
  }
  get timerRunning(): boolean {
    return !this.won;
  }
  get rowFull(): boolean {
    return this.row.every((c) => c !== null);
  }
  /** True when nothing can be cleared: every slot is empty or locked. */
  get rowEmpty(): boolean {
    return this.row.every((c, i) => c === null || this.locked[i]);
  }

  /** Lock a filled slot in (or unlock a locked one). Locked slots fill themselves on the next guess. */
  toggleLock(i: number): boolean {
    if (this.won || i < 0 || i >= this.slots) return false;
    if (this.locked[i]) {
      this.locked[i] = false;
      return true;
    }
    if (this.row[i] === null) return false;
    this.locked[i] = true;
    if (this.cursor === i) this.cursor = this.nextEmpty(i);
    return true;
  }

  /** Put a colour in the selected slot and move on to the next empty one. */
  place(colour: number): boolean {
    if (this.won || colour < 0 || colour >= this.level.colours) return false;
    if (this.locked[this.cursor]) {
      this.cursor = this.nextEmpty(this.cursor);
      if (this.locked[this.cursor]) return false;
    }
    this.row[this.cursor] = colour;
    this.cursor = this.nextEmpty(this.cursor);
    return true;
  }

  /** Tap a slot in the row: select it, or clear it if it was already selected. */
  select(i: number): void {
    if (this.won || i < 0 || i >= this.slots || this.locked[i]) return;
    if (this.cursor === i && this.row[i] !== null) this.row[i] = null;
    this.cursor = i;
  }

  /** Clear the last filled slot (before the cursor if possible). */
  backspace(): boolean {
    if (this.won) return false;
    for (let k = 0; k < this.slots; k++) {
      const i = (this.cursor - 1 - k + this.slots * 2) % this.slots;
      if (this.row[i] !== null && !this.locked[i]) {
        this.row[i] = null;
        this.cursor = i;
        return true;
      }
    }
    return false;
  }

  /** Check the row against the code. Null if the row isn't full. */
  submit(): Guess | null {
    if (this.won || !this.rowFull) return null;
    const pegs = this.row as number[];
    const g: Guess = { pegs: pegs.slice(), feedback: mark(pegs, this.level.code) };
    this.guesses.push(g);
    if (this.won) this.locked.fill(false);
    // Locked slots carry their colour into the next guess.
    this.row = pegs.map((c, i) => (this.locked[i] ? c : null));
    this.cursor = this.locked[0] ? this.nextEmpty(0) : 0;
    return g;
  }

  /** How many codes still fit every answer so far. */
  codesLeft(): number {
    return remaining(this.level, this.guesses).length;
  }

  /**
   * Fill the row with a code that fits every answer so far (the one the solver would try).
   * Costs a star. Doesn't check it.
   */
  hint(): number[] | null {
    if (this.hints <= 0 || this.won) return null;
    const g = nextGuess(this.level, this.guesses, new Rng(this.level.number * 97 + this.guesses.length));
    if (!g) return null;
    const pegs = this.row;
    this.hints--;
    this.hintsUsed++;
    this.row = g.slice();
    // Keep only the locks the hint agrees with.
    this.locked = this.locked.map((l, i) => l && g[i] === pegs[i]);
    this.cursor = this.slots - 1;
    return g;
  }

  /** Stars from guesses against par, one fewer for each hint used, never below one. */
  stars(): number {
    const par = this.level.par;
    const n = this.guesses.length;
    const byGuesses = n <= par ? 3 : n <= par + 2 ? 2 : 1;
    return Math.max(1, byGuesses - this.hintsUsed);
  }

  /** The next empty slot after `from`; failing that the next unlocked one; failing that `from`. */
  private nextEmpty(from: number): number {
    for (let k = 1; k <= this.slots; k++) {
      const i = (from + k) % this.slots;
      if (this.row[i] === null && !this.locked[i]) return i;
    }
    const step = Math.min(from + 1, this.slots - 1);
    if (!this.locked[step]) return step;
    for (let k = 1; k <= this.slots; k++) {
      const i = (from + k) % this.slots;
      if (!this.locked[i]) return i;
    }
    return from;
  }
}
