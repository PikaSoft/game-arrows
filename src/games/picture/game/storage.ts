export interface PictureRecord {
  stars: number;
  bestMoves: number;
  bestMs: number;
}

export interface PictureProgress {
  unlocked: number;
  current: number;
  levels: Record<number, PictureRecord>;
}

export const PICTURE_KEY = 'picture.v1';

const defaults = (): PictureProgress => ({ unlocked: 1, current: 1, levels: {} });

export function loadPicture(): PictureProgress {
  try {
    const raw = localStorage.getItem(PICTURE_KEY);
    if (!raw) return defaults();
    const p = JSON.parse(raw) as Partial<PictureProgress>;
    return { ...defaults(), ...p, levels: p.levels ?? {} };
  } catch {
    return defaults();
  }
}

export function savePicture(p: PictureProgress): void {
  try {
    localStorage.setItem(PICTURE_KEY, JSON.stringify(p));
  } catch {
    // Storage can be unavailable (private mode, blocked). The game still works.
  }
}

/** Record a clear. Keeps the best stars, fewest mistakes and best time separately. */
export function recordPictureClear(p: PictureProgress, level: number, stars: number, moves: number, ms: number) {
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
  savePicture(p);
  return { newBestMoves, newBestTime, prev };
}

export function resetPicture(p: PictureProgress): void {
  const d = defaults();
  p.unlocked = d.unlocked;
  p.current = d.current;
  p.levels = {};
  savePicture(p);
}
