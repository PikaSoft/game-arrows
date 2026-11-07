import { Rng } from '../../../shared/rng';
import { Difficulty } from './types';

export const TUTORIAL_COUNT = 3;
/** First level with two stars per row, column and region (on a 10x10 grid). */
export const TWO_STAR_INTRO = 35;

export interface StarsSpec {
  size: number;
  per: number;
  /** Score (see rateStars) the generator aims for. */
  target: number;
  tip?: string;
}

const TUTORIALS: StarsSpec[] = [
  { size: 5, per: 1, target: 1.2, tip: 'Put one star in every row, every column and every coloured region. Stars never touch, not even at the corners.' },
  { size: 5, per: 1, target: 1.6, tip: 'Hold a square for a moment to mark it with a dot (it has no star), or switch to Dot. A wrong mark costs a heart.' },
  { size: 6, per: 1, target: 2, tip: 'Drag to mark several squares at once. Squares around a star fill with dots by themselves.' },
];

/** What level n should look like. Same n, same spec, on every device. */
export function starsSpecFor(n: number): StarsSpec {
  if (n <= TUTORIAL_COUNT) return TUTORIALS[n - 1];
  const rng = new Rng(n * 6997 + 1);
  const t = Math.min(1, (n - TUTORIAL_COUNT - 1) / 30);
  if (n === TWO_STAR_INTRO || (n > TWO_STAR_INTRO && rng.next() < 0.2)) {
    return { size: 10, per: 2, target: 10, tip: n === TWO_STAR_INTRO ? 'A big one: two stars in every row, column and region.' : undefined };
  }
  // One star each, on grids growing from 6x6 to 9x9 over the first 30 or so levels, then varying.
  const size = t >= 1 ? rng.int(7, 9) : Math.min(9, 6 + Math.floor(t * 3.5));
  let target = t >= 1 ? 2 + rng.next() * 7 : 1.8 + t * 5 + rng.next();
  if (rng.next() < 0.1) target = 2;
  return { size, per: 1, target };
}

/**
 * Label from the rating score: on average, how many open squares there are for each one
 * the rules settle in a wave. See `rate` in solver.ts.
 */
export const STARS_THRESHOLDS = [2.4, 4, 7];

export function rateStars(score: number): Difficulty {
  if (score < STARS_THRESHOLDS[0]) return 'Easy';
  if (score < STARS_THRESHOLDS[1]) return 'Medium';
  if (score < STARS_THRESHOLDS[2]) return 'Hard';
  return 'Super Hard';
}
