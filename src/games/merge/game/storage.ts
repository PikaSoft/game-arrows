import { SavedGame } from '../core/game';

/**
 * Which rules the progress was made under. 1 was three-tile merges (tiles 1, 3, 9, 27…);
 * 2 is pairs (1, 2, 4, 8…). Bests and saved games from other rules don't carry over.
 */
export const RULES = 2;

/** Merge Tiles progress: bests, games played, and the game in progress (if any). */
export interface MergeProgress {
  rules: number;
  bestScore: number;
  bestTile: number;
  games: number;
  saved: SavedGame | null;
}

export const MERGE_KEY = 'merge.v1';

const defaults = (): MergeProgress => ({ rules: RULES, bestScore: 0, bestTile: 0, games: 0, saved: null });

export function loadMerge(): MergeProgress {
  try {
    const raw = localStorage.getItem(MERGE_KEY);
    if (!raw) return defaults();
    const stored = JSON.parse(raw) as Partial<MergeProgress>;
    const p = { ...defaults(), ...stored, rules: stored.rules ?? 1 };
    // Made under the old three-tile rules: keep the count of games, start the rest afresh.
    if (p.rules !== RULES) return { ...defaults(), games: p.games };
    return p;
  } catch {
    return defaults();
  }
}

export function saveMerge(p: MergeProgress): void {
  try {
    localStorage.setItem(MERGE_KEY, JSON.stringify(p));
  } catch {
    // Storage can be unavailable (private mode, blocked). The game still works.
  }
}

/** Keep bests up to date as a game goes (so they survive even if it's never finished). */
export function noteBests(p: MergeProgress, score: number, tile: number): boolean {
  const better = score > p.bestScore || tile > p.bestTile;
  p.bestScore = Math.max(p.bestScore, score);
  p.bestTile = Math.max(p.bestTile, tile);
  return better;
}

/** Record a finished game: bests, one more game played, and nothing left to continue. */
export function recordGame(p: MergeProgress, score: number, tile: number): void {
  noteBests(p, score, tile);
  p.games++;
  p.saved = null;
  saveMerge(p);
}

export function resetMerge(p: MergeProgress): void {
  Object.assign(p, defaults());
  saveMerge(p);
}
