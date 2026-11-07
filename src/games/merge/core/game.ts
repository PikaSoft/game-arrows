import { Rng } from '../../../shared/rng';
import { Board, emptyBoard, slide, SlideResult, STONE, stuck } from './rules';

/** Chance a new tile is a 3 rather than a 1. */
export const THREE_CHANCE = 0.15;
/** Stones start turning up after this many moves, then every STONE_EVERY moves. */
export const STONE_FROM = 30;
export const STONE_EVERY = 25;
/** How many moves a stone lasts before it crumbles. */
export const STONE_LIFE = 8;
export const START_TILES = 3;

/** A game in progress, as kept between visits. */
export interface SavedGame {
  cells: number[];
  life: number[];
  score: number;
  moves: number;
}

export interface MoveResult extends SlideResult {
  /** The square a new tile appeared in, and its value. */
  spawned: { at: number; value: number } | null;
  /** A stone that appeared this move, and stones that crumbled. */
  stone: number | null;
  crumbled: number[];
}

/**
 * One game: a board, a score and a seeded source of new tiles. A swipe that changes
 * nothing isn't a move. After each move, stones count down (and crumble at 0), a stone
 * may appear, and a new tile appears on an empty square.
 */
export class MergeGame {
  board: Board = emptyBoard();
  score = 0;
  moves = 0;
  over = false;
  private rng: Rng;

  constructor(readonly seed: number, saved?: SavedGame) {
    if (saved) {
      // Carry on a saved game. New tiles come from a fresh seed, which is fine: only a
      // game in progress needs them to be unpredictable, not repeatable.
      this.board = { cells: saved.cells.slice(), life: saved.life.slice() };
      this.score = saved.score;
      this.moves = saved.moves;
      this.rng = new Rng(seed ^ (saved.moves * 2654435761));
      this.over = stuck(this.board);
      return;
    }
    this.rng = new Rng(seed);
    for (let k = 0; k < START_TILES; k++) this.spawn();
  }

  /** What's needed to carry this game on later. */
  save(): SavedGame {
    return { cells: this.board.cells.slice(), life: this.board.life.slice(), score: this.score, moves: this.moves };
  }

  get best(): number {
    return Math.max(0, ...this.board.cells);
  }

  private empties(): number[] {
    return this.board.cells.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0);
  }

  private spawn(): { at: number; value: number } | null {
    const e = this.empties();
    if (!e.length) return null;
    const at = this.rng.pick(e);
    const value = this.rng.next() < THREE_CHANCE ? 3 : 1;
    this.board.cells[at] = value;
    return { at, value };
  }

  swipe(d: number): MoveResult | null {
    if (this.over) return null;
    const r = slide(this.board, d);
    if (!r.changed) return null;
    this.board = r.board;
    this.score += r.gained;
    this.moves++;
    // Stones wear down, then maybe a new one turns up.
    const crumbled: number[] = [];
    this.board.cells.forEach((v, i) => {
      if (v !== STONE) return;
      this.board.life[i]--;
      if (this.board.life[i] <= 0) {
        this.board.cells[i] = 0;
        this.board.life[i] = 0;
        crumbled.push(i);
      }
    });
    let stone: number | null = null;
    if (this.moves >= STONE_FROM && (this.moves - STONE_FROM) % STONE_EVERY === 0) {
      const e = this.empties();
      if (e.length > 2) {
        stone = this.rng.pick(e);
        this.board.cells[stone] = STONE;
        this.board.life[stone] = STONE_LIFE;
      }
    }
    const spawned = this.spawn();
    if (stuck(this.board)) this.over = true;
    return { ...r, board: this.board, spawned, stone, crumbled };
  }
}
