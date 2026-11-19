import { Rng } from '../../../shared/rng';
import { Difficulty } from './types';

export const TUTORIAL_COUNT = 4;
/** First level that needs the isolation step. */
export const ISOLATION_INTRO = 9;
/** First level that may need trial and error. */
export const TRIAL_INTRO = 22;

export interface BridgesSpec {
  w: number;
  h: number;
  /** Islands to aim for. */
  islands: number;
  /** Chance a new island's bridge is double, and of adding extra bridges between islands that see each other. */
  doubles: number;
  extra: number;
  /** Score to aim for (1 to 4, see rateBridges). */
  target: number;
  tip?: string;
}

const TUTORIALS: BridgesSpec[] = [
  { w: 5, h: 5, islands: 4, doubles: 0.2, extra: 0, target: 1, tip: 'Drag from an island toward another to build a bridge. Each number says how many bridges that island needs.' },
  { w: 5, h: 6, islands: 5, doubles: 0.5, extra: 0.2, target: 1, tip: 'Two islands can share one or two bridges. Drag again for the second one.' },
  { w: 6, h: 6, islands: 7, doubles: 0.35, extra: 0.3, target: 1, tip: 'Bridges run straight and never cross, and every island must end up joined in one group.' },
  { w: 6, h: 7, islands: 8, doubles: 0.35, extra: 0.3, target: 1, tip: 'You can also tap the water between two islands. A wrong bridge costs a heart.' },
];

/** What level n should look like. Same n, same spec, on every device. */
export function bridgesSpecFor(n: number): BridgesSpec {
  if (n <= TUTORIAL_COUNT) return TUTORIALS[n - 1];
  if (n === ISOLATION_INTRO)
    return { w: 7, h: 7, islands: 11, doubles: 0.3, extra: 0.35, target: 2, tip: "Don't cut a group off: two 1s joined together could never reach the rest." };
  const rng = new Rng(n * 4517 + 83);
  const t = Math.min(1, (n - TUTORIAL_COUNT - 1) / 32);
  // Maps grow from 7x7 to about 9x12 over the first 36 levels, then vary.
  const grow = t >= 1 ? rng.int(1, 2) : Math.round(t * 2);
  const w = 7 + grow;
  const h = Math.min(12, w + rng.int(0, 3));
  const islands = Math.round(w * h * (0.2 + rng.next() * 0.05));
  let target = t >= 1 ? rng.pick([1, 2, 2, 3, 3, 4]) : Math.min(4, 1 + Math.floor(t * 3.4 + rng.next() * 0.8));
  if (n < ISOLATION_INTRO) target = 1;
  if (n < TRIAL_INTRO) target = Math.min(target, 2);
  if (rng.next() < 0.1) target = 1;
  return { w, h, islands, doubles: 0.3 + rng.next() * 0.2, extra: 0.3 + t * 0.3, target };
}

export const SCORE_LABELS: Difficulty[] = ['Easy', 'Easy', 'Medium', 'Hard', 'Super Hard'];
export const rateBridges = (score: number): Difficulty => SCORE_LABELS[Math.max(1, Math.min(4, score))];

/** Waves of trial and error that make a board Super Hard rather than Hard. */
export const SUPER_TRIALS = 3;
/** Score from the hardest step and how often trial and error was needed. */
export const bridgesScore = (hardest: number, trials: number): number => (hardest >= 3 && trials >= SUPER_TRIALS ? 4 : Math.max(1, hardest));
