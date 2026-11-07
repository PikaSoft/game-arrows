export interface LinesRecord {
  stars: number;
  bestMoves: number;
  bestMs: number;
}

export interface LinesProgress {
  unlocked: number;
  current: number;
  levels: Record<number, LinesRecord>;
}

export const LINES_KEY = 'lines.v1';

const defaults = (): LinesProgress => ({ unlocked: 1, current: 1, levels: {} });

export function loadLines(): LinesProgress {
  try {
    const raw = localStorage.getItem(LINES_KEY);
    if (!raw) return defaults();
    const p = JSON.parse(raw) as Partial<LinesProgress>;
    return { ...defaults(), ...p, levels: p.levels ?? {} };
  } catch {
    return defaults();
  }
}

export function saveLines(p: LinesProgress): void {
  try {
    localStorage.setItem(LINES_KEY, JSON.stringify(p));
  } catch {
    // Storage can be unavailable (private mode, blocked). The game still works.
  }
}

/** Record a clear. Keeps the best stars, fewest moves and best time separately. */
export function recordLinesClear(p: LinesProgress, level: number, stars: number, moves: number, ms: number) {
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
  saveLines(p);
  return { newBestMoves, newBestTime, prev };
}

export function resetLines(p: LinesProgress): void {
  const d = defaults();
  p.unlocked = d.unlocked;
  p.current = d.current;
  p.levels = {};
  saveLines(p);
}
