export interface MinesRecord {
  stars: number;
  bestMoves: number;
  bestMs: number;
}

export interface MinesProgress {
  unlocked: number;
  current: number;
  levels: Record<number, MinesRecord>;
}

export const MINES_KEY = 'mines.v1';

const defaults = (): MinesProgress => ({ unlocked: 1, current: 1, levels: {} });

export function loadMines(): MinesProgress {
  try {
    const raw = localStorage.getItem(MINES_KEY);
    if (!raw) return defaults();
    const p = JSON.parse(raw) as Partial<MinesProgress>;
    return { ...defaults(), ...p, levels: p.levels ?? {} };
  } catch {
    return defaults();
  }
}

export function saveMines(p: MinesProgress): void {
  try {
    localStorage.setItem(MINES_KEY, JSON.stringify(p));
  } catch {
    // Storage can be unavailable (private mode, blocked). The game still works.
  }
}

/** Record a clear. Keeps the best stars, fewest mines hit and best time separately. */
export function recordMinesClear(p: MinesProgress, level: number, stars: number, moves: number, ms: number) {
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
  saveMines(p);
  return { newBestMoves, newBestTime, prev };
}

export function resetMines(p: MinesProgress): void {
  const d = defaults();
  p.unlocked = d.unlocked;
  p.current = d.current;
  p.levels = {};
  saveMines(p);
}
