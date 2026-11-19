export interface BeamsRecord {
  stars: number;
  bestMoves: number;
  bestMs: number;
}

export interface BeamsProgress {
  unlocked: number;
  current: number;
  levels: Record<number, BeamsRecord>;
}

export const BEAMS_KEY = 'beams.v1';

const defaults = (): BeamsProgress => ({ unlocked: 1, current: 1, levels: {} });

export function loadBeams(): BeamsProgress {
  try {
    const raw = localStorage.getItem(BEAMS_KEY);
    if (!raw) return defaults();
    const p = JSON.parse(raw) as Partial<BeamsProgress>;
    return { ...defaults(), ...p, levels: p.levels ?? {} };
  } catch {
    return defaults();
  }
}

export function saveBeams(p: BeamsProgress): void {
  try {
    localStorage.setItem(BEAMS_KEY, JSON.stringify(p));
  } catch {
    // Storage can be unavailable (private mode, blocked). The game still works.
  }
}

/** Record a clear. Keeps the best stars, fewest taps and best time separately. */
export function recordBeamsClear(p: BeamsProgress, level: number, stars: number, moves: number, ms: number) {
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
  saveBeams(p);
  return { newBestMoves, newBestTime, prev };
}

export function resetBeams(p: BeamsProgress): void {
  const d = defaults();
  p.unlocked = d.unlocked;
  p.current = d.current;
  p.levels = {};
  saveBeams(p);
}
