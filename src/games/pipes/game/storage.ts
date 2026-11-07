export interface PipeRecord {
  stars: number;
  bestMoves: number;
  bestMs: number;
}

export interface PipeProgress {
  unlocked: number;
  current: number;
  levels: Record<number, PipeRecord>;
}

export const PIPES_KEY = 'pipes.v1';

const defaults = (): PipeProgress => ({ unlocked: 1, current: 1, levels: {} });

export function loadPipes(): PipeProgress {
  try {
    const raw = localStorage.getItem(PIPES_KEY);
    if (!raw) return defaults();
    const p = JSON.parse(raw) as Partial<PipeProgress>;
    return { ...defaults(), ...p, levels: p.levels ?? {} };
  } catch {
    return defaults();
  }
}

export function savePipes(p: PipeProgress): void {
  try {
    localStorage.setItem(PIPES_KEY, JSON.stringify(p));
  } catch {
    // Storage can be unavailable (private mode, blocked). The game still works.
  }
}

/** Record a clear. Keeps the best stars, fewest taps and best time separately. */
export function recordPipesClear(p: PipeProgress, level: number, stars: number, moves: number, ms: number) {
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
  savePipes(p);
  return { newBestMoves, newBestTime, prev };
}

export function resetPipes(p: PipeProgress): void {
  const d = defaults();
  p.unlocked = d.unlocked;
  p.current = d.current;
  p.levels = {};
  savePipes(p);
}
