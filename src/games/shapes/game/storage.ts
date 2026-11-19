import { SavedGame } from '../core/game';

/** Shape Fit progress: bests, games played, and the game in progress (if any). */
export interface ShapesProgress {
  bestScore: number;
  /** Most lines cleared in one game. */
  bestLines: number;
  games: number;
  saved: SavedGame | null;
}

export const SHAPES_KEY = 'shapes.v1';

const defaults = (): ShapesProgress => ({ bestScore: 0, bestLines: 0, games: 0, saved: null });

export function loadShapes(): ShapesProgress {
  try {
    const raw = localStorage.getItem(SHAPES_KEY);
    if (!raw) return defaults();
    return { ...defaults(), ...(JSON.parse(raw) as Partial<ShapesProgress>) };
  } catch {
    return defaults();
  }
}

export function saveShapes(p: ShapesProgress): void {
  try {
    localStorage.setItem(SHAPES_KEY, JSON.stringify(p));
  } catch {
    // Storage can be unavailable (private mode, blocked). The game still works.
  }
}

/** Keep bests up to date as a game goes (so they survive even if it's never finished). */
export function noteBests(p: ShapesProgress, score: number, lines: number): void {
  p.bestScore = Math.max(p.bestScore, score);
  p.bestLines = Math.max(p.bestLines, lines);
}

/** Record a finished game: bests, one more game played, and nothing left to continue. */
export function recordGame(p: ShapesProgress, score: number, lines: number): void {
  noteBests(p, score, lines);
  p.games++;
  p.saved = null;
  saveShapes(p);
}

export function resetShapes(p: ShapesProgress): void {
  Object.assign(p, defaults());
  saveShapes(p);
}
