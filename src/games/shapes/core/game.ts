import { Rng } from '../../../shared/rng';
import { PIECES } from './pieces';

export const SIZE = 8;
export const TRAY = 3;
/** Pieces placed before the draw has fully shifted toward the big, awkward pieces. */
export const WARM_UP = 60;
/** Tries at a new set of pieces, looking for one where at least one piece fits. */
export const DEAL_TRIES = 8;
/** Search steps allowed when checking a new set can be placed in full. */
export const SET_CHECK_STEPS = 4000;

/** A game in progress, as kept between visits. */
export interface SavedGame {
  /** 0 for an empty square, else the colour + 1 of the piece that filled it. */
  cells: number[];
  /** Piece ids in the tray, or -1 for a slot already used. */
  tray: number[];
  score: number;
  placed: number;
  streak: number;
  /** Lines cleared so far. */
  lines?: number;
}

export interface PlaceResult {
  /** Squares the piece filled. */
  filled: number[];
  rows: number[];
  cols: number[];
  /** Squares cleared (each once, even where a row and column cross). */
  cleared: number[];
  gained: number;
  /** A new set of pieces was dealt. */
  dealt: boolean;
}

/** Points for clearing `lines` lines at once, with `streak` placements in a row that cleared. */
export function clearPoints(lines: number, streak: number): number {
  if (!lines) return 0;
  return 10 * lines * lines + (streak > 1 ? 10 * (streak - 1) : 0);
}

/**
 * One game: an 8x8 board, a tray of three pieces and a score. Placing a piece fills its
 * squares; then every full row and column clears at once. When the tray is empty, three
 * new pieces are dealt. The game ends when no piece in the tray fits anywhere.
 */
export class ShapeGame {
  cells: number[] = new Array(SIZE * SIZE).fill(0);
  tray: number[] = [];
  score = 0;
  placed = 0;
  streak = 0;
  /** Lines cleared so far. */
  lines = 0;
  over = false;
  private rng: Rng;

  constructor(readonly seed: number, saved?: SavedGame) {
    if (saved) {
      // Carry on a saved game. New pieces come from a fresh seed, which is fine: only a
      // game in progress needs them to be unpredictable, not repeatable.
      this.cells = saved.cells.slice();
      this.tray = saved.tray.slice();
      this.score = saved.score;
      this.placed = saved.placed;
      this.streak = saved.streak;
      this.lines = saved.lines ?? 0;
      this.rng = new Rng(seed ^ (saved.placed * 2654435761));
      if (this.tray.every((t) => t < 0)) this.deal();
      this.over = !this.anyFits();
      return;
    }
    this.rng = new Rng(seed);
    this.deal();
  }

  save(): SavedGame {
    return { cells: this.cells.slice(), tray: this.tray.slice(), score: this.score, placed: this.placed, streak: this.streak, lines: this.lines };
  }

  /** True if piece `id` fits with its top-left at (x, y). */
  fits(id: number, x: number, y: number): boolean {
    const p = PIECES[id];
    if (x < 0 || y < 0 || x + p.w > SIZE || y + p.h > SIZE) return false;
    return p.cells.every(([cx, cy]) => this.cells[(y + cy) * SIZE + x + cx] === 0);
  }

  /** True if piece `id` fits anywhere. */
  fitsAnywhere(id: number): boolean {
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (this.fits(id, x, y)) return true;
    return false;
  }

  anyFits(): boolean {
    return this.tray.some((id) => id >= 0 && this.fitsAnywhere(id));
  }

  /** Rows and columns that placing `id` at (x, y) would fill. */
  wouldClear(id: number, x: number, y: number): { rows: number[]; cols: number[] } {
    const filled = new Set(PIECES[id].cells.map(([cx, cy]) => (y + cy) * SIZE + x + cx));
    const full = (i: number) => this.cells[i] !== 0 || filled.has(i);
    const rows: number[] = [];
    const cols: number[] = [];
    for (let r = 0; r < SIZE; r++) {
      let ok = true;
      for (let c = 0; c < SIZE && ok; c++) ok = full(r * SIZE + c);
      if (ok) rows.push(r);
    }
    for (let c = 0; c < SIZE; c++) {
      let ok = true;
      for (let r = 0; r < SIZE && ok; r++) ok = full(r * SIZE + c);
      if (ok) cols.push(c);
    }
    return { rows, cols };
  }

  /** Place the piece in tray slot `slot` with its top-left at (x, y). Null if it doesn't fit. */
  place(slot: number, x: number, y: number): PlaceResult | null {
    if (this.over) return null;
    const id = this.tray[slot];
    if (id === undefined || id < 0 || !this.fits(id, x, y)) return null;
    const p = PIECES[id];
    const { rows, cols } = this.wouldClear(id, x, y);
    const filled = p.cells.map(([cx, cy]) => (y + cy) * SIZE + x + cx);
    for (const i of filled) this.cells[i] = p.colour + 1;
    const cleared = new Set<number>();
    for (const r of rows) for (let c = 0; c < SIZE; c++) cleared.add(r * SIZE + c);
    for (const c of cols) for (let r = 0; r < SIZE; r++) cleared.add(r * SIZE + c);
    for (const i of cleared) this.cells[i] = 0;
    const lines = rows.length + cols.length;
    this.streak = lines ? this.streak + 1 : 0;
    this.lines += lines;
    const gained = p.cells.length + clearPoints(lines, this.streak);
    this.score += gained;
    this.placed++;
    this.tray[slot] = -1;
    let dealt = false;
    if (this.tray.every((t) => t < 0)) {
      this.deal();
      dealt = true;
    }
    this.over = !this.anyFits();
    return { filled, rows, cols, cleared: [...cleared], gained, dealt };
  }

  /** One piece, weighted from the early mix toward the late one as the game warms up. */
  private draw(): number {
    const t = Math.min(1, this.placed / WARM_UP);
    const weights = PIECES.map((p) => p.early + (p.late - p.early) * t);
    let r = this.rng.next() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) return i;
    }
    return weights.length - 1;
  }

  /**
   * True if all of `ids` can be placed, one after another in some order (clearing lines
   * as they go). Capped by search steps, so a slow case just counts as "no".
   */
  canPlaceAll(ids: number[], budget = { steps: SET_CHECK_STEPS }): boolean {
    if (!ids.length) return true;
    for (let k = 0; k < ids.length; k++) {
      const id = ids[k];
      const rest = ids.filter((_, j) => j !== k);
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++) {
          if (!this.fits(id, x, y)) continue;
          if (--budget.steps < 0) return false;
          const saved = this.cells.slice();
          const { rows, cols } = this.wouldClear(id, x, y);
          for (const [cx, cy] of PIECES[id].cells) this.cells[(y + cy) * SIZE + x + cx] = 1;
          for (const r of rows) for (let c = 0; c < SIZE; c++) this.cells[r * SIZE + c] = 0;
          for (const c of cols) for (let r = 0; r < SIZE; r++) this.cells[r * SIZE + c] = 0;
          const ok = this.canPlaceAll(rest, budget);
          this.cells = saved;
          if (ok) return true;
          if (budget.steps < 0) return false;
        }
    }
    return false;
  }

  /**
   * A new set of three. Tries a few sets for one that can be placed in full; failing
   * that, one where at least one piece fits; failing that, the last one drawn.
   */
  private deal(): void {
    let fallback: number[] | null = null;
    for (let k = 0; k < DEAL_TRIES; k++) {
      const set = Array.from({ length: TRAY }, () => this.draw());
      this.tray = set;
      if (this.canPlaceAll(set)) return;
      if (!fallback && this.anyFits()) fallback = set;
    }
    if (fallback) this.tray = fallback;
  }
}
