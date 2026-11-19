export interface FenceRecord {
  stars: number;
  bestMoves: number;
  bestMs: number;
}

export interface FenceProgress {
  unlocked: number;
  current: number;
  levels: Record<number, FenceRecord>;
}

export const FENCE_KEY = 'fence.v1';

const defaults = (): FenceProgress => ({ unlocked: 1, current: 1, levels: {} });

export function loadFence(): FenceProgress {
  try {
    const raw = localStorage.getItem(FENCE_KEY);
    if (!raw) return defaults();
    const p = JSON.parse(raw) as Partial<FenceProgress>;
    return { ...defaults(), ...p, levels: p.levels ?? {} };
  } catch {
    return defaults();
  }
}

export function saveFence(p: FenceProgress): void {
  try {
    localStorage.setItem(FENCE_KEY, JSON.stringify(p));
  } catch {
    // Storage can be unavailable (private mode, blocked). The game still works.
  }
}

/** Record a clear. Keeps the best stars, fewest mistakes and best time separately. */
export function recordFenceClear(p: FenceProgress, level: number, stars: number, moves: number, ms: number) {
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
  saveFence(p);
  return { newBestMoves, newBestTime, prev };
}

export function resetFence(p: FenceProgress): void {
  const d = defaults();
  p.unlocked = d.unlocked;
  p.current = d.current;
  p.levels = {};
  saveFence(p);
}
