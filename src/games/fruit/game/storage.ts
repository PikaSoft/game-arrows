import { SavedFruit } from '../core/sim';

/** Fruit Drop progress: bests, games played, and the game in progress (if any). */
export interface FruitProgress {
  bestScore: number;
  /** Largest fruit ever made (its size index), or -1 before the first game. */
  bestFruit: number;
  games: number;
  saved: SavedFruit | null;
}

export const FRUIT_KEY = 'fruit.v1';

const defaults = (): FruitProgress => ({ bestScore: 0, bestFruit: -1, games: 0, saved: null });

export function loadFruit(): FruitProgress {
  try {
    const raw = localStorage.getItem(FRUIT_KEY);
    return raw ? { ...defaults(), ...(JSON.parse(raw) as Partial<FruitProgress>) } : defaults();
  } catch {
    return defaults();
  }
}

export function saveFruit(p: FruitProgress): void {
  try {
    localStorage.setItem(FRUIT_KEY, JSON.stringify(p));
  } catch {
    // Storage can be unavailable (private mode, blocked). The game still works.
  }
}

/** Keep bests up to date as a game goes (so they survive even if it's never finished). */
export function noteBests(p: FruitProgress, score: number, fruit: number): void {
  p.bestScore = Math.max(p.bestScore, score);
  p.bestFruit = Math.max(p.bestFruit, fruit);
}

/** Record a finished game: bests, one more game played, and nothing left to continue. */
export function recordGame(p: FruitProgress, score: number, fruit: number): void {
  noteBests(p, score, fruit);
  p.games++;
  p.saved = null;
  saveFruit(p);
}

export function resetFruit(p: FruitProgress): void {
  Object.assign(p, defaults());
  saveFruit(p);
}
