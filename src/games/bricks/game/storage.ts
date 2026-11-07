export interface BricksRecord {
  stars: number;
  bestMoves: number;
  bestMs: number;
}

export interface BricksProgress {
  unlocked: number;
  current: number;
  levels: Record<number, BricksRecord>;
}

export const BRICKS_KEY = 'bricks.v1';

const defaults = (): BricksProgress => ({ unlocked: 1, current: 1, levels: {} });

export function loadBricks(): BricksProgress {
  try {
    const raw = localStorage.getItem(BRICKS_KEY);
    if (!raw) return defaults();
    const p = JSON.parse(raw) as Partial<BricksProgress>;
    return { ...defaults(), ...p, levels: p.levels ?? {} };
  } catch {
    return defaults();
  }
}

export function saveBricks(p: BricksProgress): void {
  try {
    localStorage.setItem(BRICKS_KEY, JSON.stringify(p));
  } catch {
    // Storage can be unavailable (private mode, blocked). The game still works.
  }
}

/** Record a clear. Keeps the best stars, fewest balls lost and best time separately. */
export function recordBricksClear(p: BricksProgress, level: number, stars: number, moves: number, ms: number) {
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
  saveBricks(p);
  return { newBestMoves, newBestTime, prev };
}

export function resetBricks(p: BricksProgress): void {
  const d = defaults();
  p.unlocked = d.unlocked;
  p.current = d.current;
  p.levels = {};
  saveBricks(p);
}
