/** Cave Glider progress: best flight, most gems in one flight, and totals. */
export interface GliderProgress {
  best: number;
  bestGems: number;
  gems: number;
  runs: number;
}

export const GLIDER_KEY = 'glider.v1';

const defaults = (): GliderProgress => ({ best: 0, bestGems: 0, gems: 0, runs: 0 });

export function loadGlider(): GliderProgress {
  try {
    const raw = localStorage.getItem(GLIDER_KEY);
    if (!raw) return defaults();
    return { ...defaults(), ...(JSON.parse(raw) as Partial<GliderProgress>) };
  } catch {
    return defaults();
  }
}

export function saveGlider(p: GliderProgress): void {
  try {
    localStorage.setItem(GLIDER_KEY, JSON.stringify(p));
  } catch {
    // Storage can be unavailable (private mode, blocked). The game still works.
  }
}

/** Record a finished flight. Returns the best distance before it. */
export function recordFlight(p: GliderProgress, metres: number, gems: number): number {
  const prev = p.best;
  p.best = Math.max(p.best, metres);
  p.bestGems = Math.max(p.bestGems, gems);
  p.gems += gems;
  p.runs++;
  saveGlider(p);
  return prev;
}

export function resetGlider(p: GliderProgress): void {
  Object.assign(p, defaults());
  saveGlider(p);
}
