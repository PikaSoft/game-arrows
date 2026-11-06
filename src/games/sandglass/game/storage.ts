export interface SandRecord {
  stars: number;
  bestMoves: number;
  bestMs: number;
}

export interface SandProgress {
  unlocked: number;
  current: number;
  levels: Record<number, SandRecord>;
}

export const SAND_KEY = 'sandglass.v1';

const defaults = (): SandProgress => ({ unlocked: 1, current: 1, levels: {} });

export function loadSand(): SandProgress {
  try {
    const raw = localStorage.getItem(SAND_KEY);
    if (!raw) return defaults();
    const p = JSON.parse(raw) as Partial<SandProgress>;
    return { ...defaults(), ...p, levels: p.levels ?? {} };
  } catch {
    return defaults();
  }
}

export function saveSand(p: SandProgress): void {
  try {
    localStorage.setItem(SAND_KEY, JSON.stringify(p));
  } catch {
    // Storage can be unavailable (private mode, blocked). The game still works.
  }
}

/** Record a clear. Keeps the best stars, fewest moves and best time separately. */
export function recordSandClear(p: SandProgress, level: number, stars: number, moves: number, ms: number) {
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
  saveSand(p);
  return { newBestMoves, newBestTime, prev };
}

export function resetSand(p: SandProgress): void {
  const d = defaults();
  p.unlocked = d.unlocked;
  p.current = d.current;
  p.levels = {};
  saveSand(p);
}
