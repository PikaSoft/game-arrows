/** Stack Tower progress: the best height, and how many towers have been built. */
export interface StackProgress {
  best: number;
  /** Most perfect drops in one tower. */
  bestPerfects: number;
  games: number;
}

export const STACK_KEY = 'stack.v1';

const defaults = (): StackProgress => ({ best: 0, bestPerfects: 0, games: 0 });

export function loadStack(): StackProgress {
  try {
    const raw = localStorage.getItem(STACK_KEY);
    if (!raw) return defaults();
    return { ...defaults(), ...(JSON.parse(raw) as Partial<StackProgress>) };
  } catch {
    return defaults();
  }
}

export function saveStack(p: StackProgress): void {
  try {
    localStorage.setItem(STACK_KEY, JSON.stringify(p));
  } catch {
    // Storage can be unavailable (private mode, blocked). The game still works.
  }
}

/** Record a finished tower. Returns the best height before it. */
export function recordTower(p: StackProgress, height: number, perfects: number): number {
  const prev = p.best;
  p.best = Math.max(p.best, height);
  p.bestPerfects = Math.max(p.bestPerfects, perfects);
  p.games++;
  saveStack(p);
  return prev;
}

export function resetStack(p: StackProgress): void {
  Object.assign(p, defaults());
  saveStack(p);
}
