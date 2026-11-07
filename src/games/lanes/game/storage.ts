/** Lane Dodger progress: best run, most coins in a run, and totals. */
export interface LanesProgress {
  best: number;
  bestCoins: number;
  coins: number;
  runs: number;
}

export const LANES_KEY = 'lanes.v1';

const defaults = (): LanesProgress => ({ best: 0, bestCoins: 0, coins: 0, runs: 0 });

export function loadLanes(): LanesProgress {
  try {
    const raw = localStorage.getItem(LANES_KEY);
    if (!raw) return defaults();
    return { ...defaults(), ...(JSON.parse(raw) as Partial<LanesProgress>) };
  } catch {
    return defaults();
  }
}

export function saveLanes(p: LanesProgress): void {
  try {
    localStorage.setItem(LANES_KEY, JSON.stringify(p));
  } catch {
    // Storage can be unavailable (private mode, blocked). The game still works.
  }
}

/** Record a finished run. Returns the best distance before it. */
export function recordRun(p: LanesProgress, metres: number, coins: number): number {
  const prev = p.best;
  p.best = Math.max(p.best, metres);
  p.bestCoins = Math.max(p.bestCoins, coins);
  p.coins += coins;
  p.runs++;
  saveLanes(p);
  return prev;
}

export function resetLanes(p: LanesProgress): void {
  Object.assign(p, defaults());
  saveLanes(p);
}
