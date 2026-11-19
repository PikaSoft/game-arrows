export interface CodesRecord {
  stars: number;
  bestMoves: number;
  bestMs: number;
}

export interface CodesProgress {
  unlocked: number;
  current: number;
  levels: Record<number, CodesRecord>;
}

export const CODES_KEY = 'codes.v1';

const defaults = (): CodesProgress => ({ unlocked: 1, current: 1, levels: {} });

export function loadCodes(): CodesProgress {
  try {
    const raw = localStorage.getItem(CODES_KEY);
    if (!raw) return defaults();
    const p = JSON.parse(raw) as Partial<CodesProgress>;
    return { ...defaults(), ...p, levels: p.levels ?? {} };
  } catch {
    return defaults();
  }
}

export function saveCodes(p: CodesProgress): void {
  try {
    localStorage.setItem(CODES_KEY, JSON.stringify(p));
  } catch {
    // Storage can be unavailable (private mode, blocked). The game still works.
  }
}

/** Record a clear. Keeps the best stars, fewest guesses and best time separately. */
export function recordCodesClear(p: CodesProgress, level: number, stars: number, moves: number, ms: number) {
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
  saveCodes(p);
  return { newBestMoves, newBestTime, prev };
}

export function resetCodes(p: CodesProgress): void {
  const d = defaults();
  p.unlocked = d.unlocked;
  p.current = d.current;
  p.levels = {};
  saveCodes(p);
}
