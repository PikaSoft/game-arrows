export interface LoopRecord {
  stars: number;
  bestMoves: number;
  bestMs: number;
}

export interface LoopProgress {
  unlocked: number;
  current: number;
  levels: Record<number, LoopRecord>;
}

export const LOOP_KEY = 'loop.v1';

const defaults = (): LoopProgress => ({ unlocked: 1, current: 1, levels: {} });

export function loadLoop(): LoopProgress {
  try {
    const raw = localStorage.getItem(LOOP_KEY);
    if (!raw) return defaults();
    const p = JSON.parse(raw) as Partial<LoopProgress>;
    return { ...defaults(), ...p, levels: p.levels ?? {} };
  } catch {
    return defaults();
  }
}

export function saveLoop(p: LoopProgress): void {
  try {
    localStorage.setItem(LOOP_KEY, JSON.stringify(p));
  } catch {
    // Storage can be unavailable (private mode, blocked). The game still works.
  }
}

/** Record a clear. Keeps the best stars, fewest undos and best time separately. */
export function recordLoopClear(p: LoopProgress, level: number, stars: number, moves: number, ms: number) {
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
  saveLoop(p);
  return { newBestMoves, newBestTime, prev };
}

export function resetLoop(p: LoopProgress): void {
  const d = defaults();
  p.unlocked = d.unlocked;
  p.current = d.current;
  p.levels = {};
  saveLoop(p);
}
