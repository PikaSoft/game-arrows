/** Hop Across progress: best score, highest level reached, and totals. */
export interface HopProgress {
  best: number;
  bestLevel: number;
  homes: number;
  runs: number;
}

export const HOP_KEY = 'hop.v1';

const defaults = (): HopProgress => ({ best: 0, bestLevel: 0, homes: 0, runs: 0 });

export function loadHop(): HopProgress {
  try {
    const raw = localStorage.getItem(HOP_KEY);
    if (!raw) return defaults();
    return { ...defaults(), ...(JSON.parse(raw) as Partial<HopProgress>) };
  } catch {
    return defaults();
  }
}

export function saveHop(p: HopProgress): void {
  try {
    localStorage.setItem(HOP_KEY, JSON.stringify(p));
  } catch {
    // Storage can be unavailable (private mode, blocked). The game still works.
  }
}

/** Record a finished game. Returns the best score before it. */
export function recordGame(p: HopProgress, score: number, level: number, homes: number): number {
  const prev = p.best;
  p.best = Math.max(p.best, score);
  p.bestLevel = Math.max(p.bestLevel, level);
  p.homes += homes;
  p.runs++;
  saveHop(p);
  return prev;
}

export function resetHop(p: HopProgress): void {
  Object.assign(p, defaults());
  saveHop(p);
}
