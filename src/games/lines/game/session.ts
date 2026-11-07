import { adjacent, complete, dotsOf, isSolved } from '../core/rules';
import { LinesLevel } from '../core/types';

export const HINTS_PER_LEVEL = 3;

/**
 * One play of a Colour Lines level. Each colour has at most one line, drawn from one of
 * its dots. While a line is being drawn, lines it crosses are cut back to just before the
 * crossing; if the new line backs off again, they come back as they were.
 */
export class Session {
  readonly dots: [number, number][];
  /** Dot cell -> colour. */
  readonly dotColour = new Map<number, number>();
  /** Each colour's line, starting at one of its dots. Empty when not drawn. */
  paths: number[][];
  moves = 0;
  elapsedMs = 0;
  hints = HINTS_PER_LEVEL;
  hintsUsed = 0;
  /** Colour the last hint drew, for the renderer to highlight. */
  hinted: number | null = null;
  private history: number[][][] = [];
  /** The line being drawn, and every line as it was when drawing began. */
  private drawing: { colour: number; line: number[]; base: number[][] } | null = null;

  constructor(readonly level: LinesLevel) {
    this.dots = dotsOf(level.solution);
    this.dots.forEach(([a, b], c) => {
      this.dotColour.set(a, c);
      this.dotColour.set(b, c);
    });
    this.paths = this.dots.map(() => []);
  }

  get w() {
    return this.level.w;
  }
  get h() {
    return this.level.h;
  }
  get colours() {
    return this.dots.length;
  }
  get active(): number | null {
    return this.drawing?.colour ?? null;
  }
  /** The end of the line being drawn. */
  get head(): number | null {
    const d = this.drawing;
    return d && d.line.length ? d.line[d.line.length - 1] : null;
  }
  get won(): boolean {
    return isSolved(this.w, this.h, this.paths, this.dots);
  }
  get timerRunning(): boolean {
    return !this.won;
  }
  get canUndo(): boolean {
    return this.history.length > 0;
  }
  isComplete(c: number): boolean {
    return complete(this.w, this.paths[c], this.dots[c]);
  }
  get joined(): number {
    return this.dots.filter((_, c) => this.isComplete(c)).length;
  }
  /** Colour covering each cell (dots always count), or -1. */
  owners(): Int16Array {
    const own = new Int16Array(this.w * this.h).fill(-1);
    for (const [cell, c] of this.dotColour) own[cell] = c;
    this.paths.forEach((p, c) => p.forEach((i) => (own[i] = c)));
    return own;
  }
  /** Share of the board covered by lines (a dot on its own doesn't count). */
  get filledPercent(): number {
    const n = this.paths.reduce((sum, p) => sum + (p.length > 1 ? p.length : 0), 0);
    return Math.round((100 * n) / (this.w * this.h));
  }

  /**
   * Start drawing from a cell: a dot starts its colour's line afresh from there; a cell on
   * a line (its loose end, say) picks that line up from that point. Returns the colour,
   * or null.
   */
  begin(cell: number): number | null {
    if (this.won) return null;
    const base = this.paths.map((p) => p.slice());
    const dc = this.dotColour.get(cell);
    let colour: number;
    let line: number[];
    if (dc !== undefined) {
      // A dot always starts its colour's line afresh from there.
      colour = dc;
      line = [cell];
    } else {
      const own = this.owners()[cell];
      if (own < 0) return null;
      colour = own;
      const p = this.paths[own];
      line = p.slice(0, p.indexOf(cell) + 1);
    }
    base[colour] = [];
    this.history.push(this.paths.map((p) => p.slice()));
    this.drawing = { colour, line, base };
    this.hinted = null;
    this.refresh();
    return colour;
  }

  /**
   * Carry the line on into a cell beside its end. Going back over the line shortens it.
   * Lines can't enter another colour's dot, or carry on past their own second dot.
   * Returns true if the line changed.
   */
  extend(cell: number): boolean {
    const d = this.drawing;
    if (!d) return false;
    const line = d.line;
    const at = line.indexOf(cell);
    if (at >= 0) {
      if (at === line.length - 1) return false;
      d.line = line.slice(0, at + 1);
      this.refresh();
      return true;
    }
    const head = line[line.length - 1];
    if (!adjacent(this.w, head, cell)) return false;
    if (line.length > 1 && this.dotColour.get(head) === d.colour) return false; // already joined
    const dc = this.dotColour.get(cell);
    if (dc !== undefined && dc !== d.colour) return false;
    d.line = line.concat(cell);
    this.refresh();
    return true;
  }

  /** Finish drawing. Counts as a move if anything changed. */
  end(): void {
    const d = this.drawing;
    if (!d) return;
    this.drawing = null;
    // A dot on its own is no line at all.
    if (this.paths[d.colour].length < 2) this.paths[d.colour] = [];
    const before = this.history[this.history.length - 1];
    const same = before && before.every((p, c) => p.length === this.paths[c].length && p.every((x, k) => x === this.paths[c][k]));
    if (same) this.history.pop();
    else this.moves++;
  }

  /** Rebuild every line from the one being drawn: others are cut where it crosses them. */
  private refresh(): void {
    const d = this.drawing!;
    const taken = new Set(d.line);
    this.paths = d.base.map((p, c) => {
      if (c === d.colour) return d.line.slice();
      const cut = p.findIndex((i) => taken.has(i));
      return cut < 0 ? p : p.slice(0, cut);
    });
  }

  /** Step back one move. */
  undo(): boolean {
    if (this.drawing) return false;
    const prev = this.history.pop();
    if (!prev) return false;
    this.paths = prev;
    this.hinted = null;
    return true;
  }

  /**
   * Draw one colour's line as it is in the solution, cutting anything in its way. Picks a
   * colour that isn't right yet, the shortest first.
   */
  hint(): number | null {
    if (this.hints <= 0 || this.won || this.drawing) return null;
    const sol = this.level.solution;
    const right = (c: number) => {
      const p = this.paths[c];
      const s = sol[c];
      if (p.length !== s.length) return false;
      return p.every((x, k) => x === s[k]) || p.every((x, k) => x === s[s.length - 1 - k]);
    };
    const wrong = sol.map((_, c) => c).filter((c) => !right(c));
    if (!wrong.length) return null;
    wrong.sort((a, b) => sol[a].length - sol[b].length);
    const c = wrong[0];
    this.history.push(this.paths.map((p) => p.slice()));
    const base = this.paths.map((p) => p.slice());
    base[c] = [];
    this.drawing = { colour: c, line: sol[c].slice(), base };
    this.refresh();
    this.drawing = null;
    this.hints--;
    this.hintsUsed++;
    this.hinted = c;
    return c;
  }

  /** Three stars without hints, one fewer for each hint used, never below one. */
  stars(): number {
    return Math.max(1, 3 - this.hintsUsed);
  }
}
