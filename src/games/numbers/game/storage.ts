export interface NumbersRecord {
  stars: number;
  bestMoves: number;
  bestMs: number;
}

export interface NumbersProgress {
  unlocked: number;
  current: number;
  levels: Record<number, NumbersRecord>;
}

export const NUMBERS_KEY = 'numbers.v1';

const defaults = (): NumbersProgress => ({ unlocked: 1, current: 1, levels: {} });

export function loadNumbers(): NumbersProgress {
  try {
    const raw = localStorage.getItem(NUMBERS_KEY);
    if (!raw) return defaults();
    const p = JSON.parse(raw) as Partial<NumbersProgress>;
    return { ...defaults(), ...p, levels: p.levels ?? {} };
  } catch {
    return defaults();
  }
}

export function saveNumbers(p: NumbersProgress): void {
  try {
    localStorage.setItem(NUMBERS_KEY, JSON.stringify(p));
  } catch {
    // Storage can be unavailable (private mode, blocked). The game still works.
  }
}

/** Record a clear. Keeps the best stars, fewest mistakes and best time separately. */
export function recordNumbersClear(p: NumbersProgress, level: number, stars: number, moves: number, ms: number) {
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
  saveNumbers(p);
  return { newBestMoves, newBestTime, prev };
}

export function resetNumbers(p: NumbersProgress): void {
  const d = defaults();
  p.unlocked = d.unlocked;
  p.current = d.current;
  p.levels = {};
  saveNumbers(p);
}
