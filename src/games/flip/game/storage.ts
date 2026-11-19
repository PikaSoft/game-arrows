export interface FlipRecord {
  stars: number;
  bestMoves: number;
  bestMs: number;
}

export interface FlipProgress {
  unlocked: number;
  current: number;
  levels: Record<number, FlipRecord>;
}

export const FLIP_KEY = 'flip.v1';

const defaults = (): FlipProgress => ({ unlocked: 1, current: 1, levels: {} });

export function loadFlip(): FlipProgress {
  try {
    const raw = localStorage.getItem(FLIP_KEY);
    if (!raw) return defaults();
    const p = JSON.parse(raw) as Partial<FlipProgress>;
    return { ...defaults(), ...p, levels: p.levels ?? {} };
  } catch {
    return defaults();
  }
}

export function saveFlip(p: FlipProgress): void {
  try {
    localStorage.setItem(FLIP_KEY, JSON.stringify(p));
  } catch {
    // Storage can be unavailable (private mode, blocked). The game still works.
  }
}

/** Record a clear. Keeps the best stars, fewest misses and best time separately. */
export function recordFlipClear(p: FlipProgress, level: number, stars: number, moves: number, ms: number) {
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
  saveFlip(p);
  return { newBestMoves, newBestTime, prev };
}

export function resetFlip(p: FlipProgress): void {
  const d = defaults();
  p.unlocked = d.unlocked;
  p.current = d.current;
  p.levels = {};
  saveFlip(p);
}
