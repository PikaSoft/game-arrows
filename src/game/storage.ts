export interface LevelRecord {
  stars: number;
  bestMs: number;
}

export interface Progress {
  /** Highest level the player may open. */
  unlocked: number;
  /** Level the Play button resumes. */
  current: number;
  levels: Record<number, LevelRecord>;
  settings: { sound: boolean; haptics: boolean };
  theme: string;
}

const KEY = 'arrow-escape.v1';

const defaults = (): Progress => ({
  unlocked: 1,
  current: 1,
  levels: {},
  settings: { sound: true, haptics: true },
  theme: 'auto',
});

export function load(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const p = JSON.parse(raw) as Partial<Progress>;
    const d = defaults();
    return { ...d, ...p, settings: { ...d.settings, ...(p.settings ?? {}) }, levels: p.levels ?? {} };
  } catch {
    return defaults();
  }
}

export function save(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Storage can be unavailable (private mode, blocked). The game still works.
  }
}

/** Record a clear. Keeps the best stars and best time separately. */
export function recordClear(p: Progress, level: number, stars: number, ms: number): { newBest: boolean } {
  const prev = p.levels[level];
  const newBest = !prev || ms < prev.bestMs;
  p.levels[level] = {
    stars: Math.max(stars, prev?.stars ?? 0),
    bestMs: Math.min(ms, prev?.bestMs ?? Infinity),
  };
  p.unlocked = Math.max(p.unlocked, level + 1);
  p.current = level + 1;
  save(p);
  return { newBest };
}

export function resetProgress(p: Progress): void {
  const d = defaults();
  p.unlocked = d.unlocked;
  p.current = d.current;
  p.levels = {};
  save(p);
}
