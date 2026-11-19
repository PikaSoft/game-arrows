/** Star Raiders progress: bests and games played. A game is not saved part way through. */
export interface RaidersProgress {
  bestScore: number;
  bestWave: number;
  games: number;
}

export const RAIDERS_KEY = 'raiders.v1';

const defaults = (): RaidersProgress => ({ bestScore: 0, bestWave: 0, games: 0 });

export function loadRaiders(): RaidersProgress {
  try {
    const raw = localStorage.getItem(RAIDERS_KEY);
    return raw ? { ...defaults(), ...(JSON.parse(raw) as Partial<RaidersProgress>) } : defaults();
  } catch {
    return defaults();
  }
}

export function saveRaiders(p: RaidersProgress): void {
  try {
    localStorage.setItem(RAIDERS_KEY, JSON.stringify(p));
  } catch {
    // Storage can be unavailable (private mode, blocked). The game still works.
  }
}

/** Record a finished game. Returns true when it set a new best score. */
export function recordRaidersGame(p: RaidersProgress, score: number, wave: number): boolean {
  const best = score > p.bestScore;
  p.bestScore = Math.max(p.bestScore, score);
  p.bestWave = Math.max(p.bestWave, wave);
  p.games++;
  saveRaiders(p);
  return best;
}

export function resetRaiders(p: RaidersProgress): void {
  Object.assign(p, defaults());
  saveRaiders(p);
}
