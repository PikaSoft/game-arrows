/** Classic snake: best apples per speed. */
export interface ClassicProgress {
  best: Record<string, number>;
  bestLength: number;
  games: number;
  /** Speed picked last time. */
  speed: string;
}

export interface TrailRecord {
  stars: number;
  bestMs: number;
}

export interface TrailsProgress {
  unlocked: number;
  current: number;
  levels: Record<number, TrailRecord>;
}

export const CLASSIC_KEY = 'snake.v1';
export const TRAILS_KEY = 'snake-trails.v1';

function read<T extends object>(key: string, defaults: () => T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaults();
    return { ...defaults(), ...(JSON.parse(raw) as Partial<T>) };
  } catch {
    return defaults();
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private mode, blocked). The game still works.
  }
}

const classicDefaults = (): ClassicProgress => ({ best: {}, bestLength: 0, games: 0, speed: 'normal' });
const trailsDefaults = (): TrailsProgress => ({ unlocked: 1, current: 1, levels: {} });

export const loadClassic = () => read(CLASSIC_KEY, classicDefaults);
export const loadTrails = () => read(TRAILS_KEY, trailsDefaults);

/** Record a finished classic game. Returns the previous best for that speed. */
export function recordClassicGame(p: ClassicProgress, speed: string, score: number, length: number) {
  const prev = p.best[speed] ?? 0;
  p.best[speed] = Math.max(prev, score);
  p.bestLength = Math.max(p.bestLength, length);
  p.games++;
  write(CLASSIC_KEY, p);
  return { prev, newBest: score > prev };
}

/** Record a cleared level. Keeps the best stars and best time separately. */
export function recordTrailClear(p: TrailsProgress, level: number, stars: number, ms: number) {
  const prev = p.levels[level];
  p.levels[level] = { stars: Math.max(stars, prev?.stars ?? 0), bestMs: Math.min(ms, prev?.bestMs ?? Infinity) };
  p.unlocked = Math.max(p.unlocked, level + 1);
  p.current = level + 1;
  write(TRAILS_KEY, p);
  return { prev, newBest: !prev || ms < prev.bestMs };
}

export const saveClassic = (p: ClassicProgress) => write(CLASSIC_KEY, p);

export function resetClassic(p: ClassicProgress): void {
  Object.assign(p, classicDefaults());
  write(CLASSIC_KEY, p);
}

export function resetTrails(p: TrailsProgress): void {
  Object.assign(p, trailsDefaults());
  write(TRAILS_KEY, p);
}
