export interface LightsRecord {
  stars: number;
  bestMoves: number;
  bestMs: number;
}

export interface LightsProgress {
  unlocked: number;
  current: number;
  levels: Record<number, LightsRecord>;
}

export const LIGHTS_KEY = 'lights.v1';

const defaults = (): LightsProgress => ({ unlocked: 1, current: 1, levels: {} });

export function loadLights(): LightsProgress {
  try {
    const raw = localStorage.getItem(LIGHTS_KEY);
    if (!raw) return defaults();
    const p = JSON.parse(raw) as Partial<LightsProgress>;
    return { ...defaults(), ...p, levels: p.levels ?? {} };
  } catch {
    return defaults();
  }
}

export function saveLights(p: LightsProgress): void {
  try {
    localStorage.setItem(LIGHTS_KEY, JSON.stringify(p));
  } catch {
    // Storage can be unavailable (private mode, blocked). The game still works.
  }
}

/** Record a clear. Keeps the best stars, fewest taps and best time separately. */
export function recordLightsClear(p: LightsProgress, level: number, stars: number, moves: number, ms: number) {
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
  saveLights(p);
  return { newBestMoves, newBestTime, prev };
}

export function resetLights(p: LightsProgress): void {
  const d = defaults();
  p.unlocked = d.unlocked;
  p.current = d.current;
  p.levels = {};
  saveLights(p);
}
