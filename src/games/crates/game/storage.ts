export interface CrateRecord {
  stars: number;
  bestMoves: number;
  bestMs: number;
}

export interface CrateProgress {
  unlocked: number;
  current: number;
  levels: Record<number, CrateRecord>;
}

export const CRATES_KEY = 'crates.v1';

const defaults = (): CrateProgress => ({ unlocked: 1, current: 1, levels: {} });

export function loadCrates(): CrateProgress {
  try {
    const raw = localStorage.getItem(CRATES_KEY);
    if (!raw) return defaults();
    const p = JSON.parse(raw) as Partial<CrateProgress>;
    return { ...defaults(), ...p, levels: p.levels ?? {} };
  } catch {
    return defaults();
  }
}

export function saveCrates(p: CrateProgress): void {
  try {
    localStorage.setItem(CRATES_KEY, JSON.stringify(p));
  } catch {
    // Storage can be unavailable (private mode, blocked). The game still works.
  }
}

/** Record a clear. Keeps the best stars, fewest pushes and best time separately. */
export function recordCratesClear(p: CrateProgress, level: number, stars: number, moves: number, ms: number) {
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
  saveCrates(p);
  return { newBestMoves, newBestTime, prev };
}

export function resetCrates(p: CrateProgress): void {
  const d = defaults();
  p.unlocked = d.unlocked;
  p.current = d.current;
  p.levels = {};
  saveCrates(p);
}
