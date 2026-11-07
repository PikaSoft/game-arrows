export interface StarsRecord {
  stars: number;
  bestMoves: number;
  bestMs: number;
}

export interface StarsProgress {
  unlocked: number;
  current: number;
  levels: Record<number, StarsRecord>;
}

export const STARS_KEY = 'stars.v1';

const defaults = (): StarsProgress => ({ unlocked: 1, current: 1, levels: {} });

export function loadStars(): StarsProgress {
  try {
    const raw = localStorage.getItem(STARS_KEY);
    if (!raw) return defaults();
    const p = JSON.parse(raw) as Partial<StarsProgress>;
    return { ...defaults(), ...p, levels: p.levels ?? {} };
  } catch {
    return defaults();
  }
}

export function saveStars(p: StarsProgress): void {
  try {
    localStorage.setItem(STARS_KEY, JSON.stringify(p));
  } catch {
    // Storage can be unavailable (private mode, blocked). The game still works.
  }
}

/** Record a clear. Keeps the best stars, fewest mistakes and best time separately. */
export function recordStarsClear(p: StarsProgress, level: number, stars: number, moves: number, ms: number) {
  const prev = p.levels[level];
  const newBestMoves = !prev || moves < prev.bestMoves;
  const newBestTime = !prev || ms < prev.bestMs;
  p.levels[level] = {
    stars: Math.max(stars, prev?.stars ?? 0),
    bestMoves: Math.min(moves, prev?.bestMoves ?? Infinity),
    bestMs: Math.min(ms, prev?.bestMs ?? Infinity),
  };
  p.unlocked = Math.max(p.unlocked, level + 1);
  p.current = level + 1;
  saveStars(p);
  return { newBestMoves, newBestTime, prev };
}

export function resetStars(p: StarsProgress): void {
  const d = defaults();
  p.unlocked = d.unlocked;
  p.current = d.current;
  p.levels = {};
  saveStars(p);
}
