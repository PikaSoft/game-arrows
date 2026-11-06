export interface SqueezeRecord {
  stars: number;
  bestMoves: number;
  bestMs: number;
}

export interface SqueezeProgress {
  unlocked: number;
  current: number;
  levels: Record<number, SqueezeRecord>;
}

export const SQUEEZE_KEY = 'squeeze.v1';

const defaults = (): SqueezeProgress => ({ unlocked: 1, current: 1, levels: {} });

export function loadSqueeze(): SqueezeProgress {
  try {
    const raw = localStorage.getItem(SQUEEZE_KEY);
    if (!raw) return defaults();
    const p = JSON.parse(raw) as Partial<SqueezeProgress>;
    return { ...defaults(), ...p, levels: p.levels ?? {} };
  } catch {
    return defaults();
  }
}

export function saveSqueeze(p: SqueezeProgress): void {
  try {
    localStorage.setItem(SQUEEZE_KEY, JSON.stringify(p));
  } catch {
    // Storage can be unavailable (private mode, blocked). The game still works.
  }
}

/** Record a clear. Keeps the best stars, fewest moves and best time separately. */
export function recordSqueezeClear(p: SqueezeProgress, level: number, stars: number, moves: number, ms: number) {
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
  saveSqueeze(p);
  return { newBestMoves, newBestTime, prev };
}

export function resetSqueeze(p: SqueezeProgress): void {
  const d = defaults();
  p.unlocked = d.unlocked;
  p.current = d.current;
  p.levels = {};
  saveSqueeze(p);
}
