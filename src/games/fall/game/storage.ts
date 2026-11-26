/** Block Fall progress: best score, most lines and highest level in one game, and games played. */
export interface FallProgress {
  best: number;
  bestLines: number;
  bestLevel: number;
  runs: number;
}

export const FALL_KEY = 'fall.v1';

const defaults = (): FallProgress => ({ best: 0, bestLines: 0, bestLevel: 0, runs: 0 });

export function loadFall(): FallProgress {
  try {
    const raw = localStorage.getItem(FALL_KEY);
    if (!raw) return defaults();
    return { ...defaults(), ...(JSON.parse(raw) as Partial<FallProgress>) };
  } catch {
    return defaults();
  }
}

export function saveFall(p: FallProgress): void {
  try {
    localStorage.setItem(FALL_KEY, JSON.stringify(p));
  } catch {
    // Storage can be unavailable (private mode, blocked). The game still works.
  }
}

/** Record a finished game. Returns the best score before it. */
export function recordGame(p: FallProgress, score: number, lines: number, level: number): number {
  const prev = p.best;
  p.best = Math.max(p.best, score);
  p.bestLines = Math.max(p.bestLines, lines);
  p.bestLevel = Math.max(p.bestLevel, level);
  p.runs++;
  saveFall(p);
  return prev;
}

export function resetFall(p: FallProgress): void {
  Object.assign(p, defaults());
  saveFall(p);
}
