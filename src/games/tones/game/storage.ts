export interface TonesRecord {
  stars: number;
  bestMoves: number;
  bestMs: number;
}

export interface TonesProgress {
  unlocked: number;
  current: number;
  levels: Record<number, TonesRecord>;
}

export const TONES_KEY = 'tones.v1';

const defaults = (): TonesProgress => ({ unlocked: 1, current: 1, levels: {} });

export function loadTones(): TonesProgress {
  try {
    const raw = localStorage.getItem(TONES_KEY);
    if (!raw) return defaults();
    const p = JSON.parse(raw) as Partial<TonesProgress>;
    return { ...defaults(), ...p, levels: p.levels ?? {} };
  } catch {
    return defaults();
  }
}

export function saveTones(p: TonesProgress): void {
  try {
    localStorage.setItem(TONES_KEY, JSON.stringify(p));
  } catch {
    // Storage can be unavailable (private mode, blocked). The game still works.
  }
}

/** Record a clear. Keeps the best stars, fewest mistakes and best time separately. */
export function recordTonesClear(p: TonesProgress, level: number, stars: number, moves: number, ms: number) {
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
  saveTones(p);
  return { newBestMoves, newBestTime, prev };
}

export function resetTones(p: TonesProgress): void {
  const d = defaults();
  p.unlocked = d.unlocked;
  p.current = d.current;
  p.levels = {};
  saveTones(p);
}
