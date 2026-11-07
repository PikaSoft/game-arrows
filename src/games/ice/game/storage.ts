export interface IceRecord {
  stars: number;
  bestMoves: number;
  bestMs: number;
}

export interface IceProgress {
  unlocked: number;
  current: number;
  levels: Record<number, IceRecord>;
}

export const ICE_KEY = 'ice.v1';

const defaults = (): IceProgress => ({ unlocked: 1, current: 1, levels: {} });

export function loadIce(): IceProgress {
  try {
    const raw = localStorage.getItem(ICE_KEY);
    if (!raw) return defaults();
    const p = JSON.parse(raw) as Partial<IceProgress>;
    return { ...defaults(), ...p, levels: p.levels ?? {} };
  } catch {
    return defaults();
  }
}

export function saveIce(p: IceProgress): void {
  try {
    localStorage.setItem(ICE_KEY, JSON.stringify(p));
  } catch {
    // Storage can be unavailable (private mode, blocked). The game still works.
  }
}

/** Record a clear. Keeps the best stars, fewest swipes and best time separately. */
export function recordIceClear(p: IceProgress, level: number, stars: number, moves: number, ms: number) {
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
  saveIce(p);
  return { newBestMoves, newBestTime, prev };
}

export function resetIce(p: IceProgress): void {
  const d = defaults();
  p.unlocked = d.unlocked;
  p.current = d.current;
  p.levels = {};
  saveIce(p);
}
