import { Rng } from '../../../shared/rng';
import { Difficulty } from './types';

export const TUTORIAL_COUNT = 3;

export interface TentsSpec {
  w: number;
  h: number;
  /** Share of squares that hold a tent (and as many trees). */
  density: number;
  /** Score (see rateTents) the generator aims for. */
  target: number;
  tip?: string;
}

const TUTORIALS: TentsSpec[] = [
  { w: 5, h: 5, density: 0.16, target: 1.2, tip: 'Put a tent next to every tree (above, below or to the side). The numbers say how many tents each row and column holds.' },
  { w: 6, h: 6, density: 0.17, target: 1.4, tip: 'Tents never touch each other, not even at the corners. Switch to Grass to mark squares that stay empty.' },
  { w: 7, h: 7, density: 0.17, target: 1.6, tip: 'A wrong mark costs a heart. Finished rows and columns fill the rest with grass.' },
];

/** What level n should look like. Same n, same spec, on every device. */
export function tentsSpecFor(n: number): TentsSpec {
  if (n <= TUTORIAL_COUNT) return TUTORIALS[n - 1];
  const rng = new Rng(n * 8191 + 3);
  const t = Math.min(1, (n - TUTORIAL_COUNT - 1) / 32);
  // Boards grow from 6x6 to about 10x10 over the first 35 levels, then vary.
  const grow = t >= 1 ? rng.int(2, 4) : Math.round(t * 4);
  const w = 6 + grow;
  const h = Math.min(11, w + rng.int(0, 1));
  // Target ramps up, then varies, with the odd breather.
  let target = t >= 1 ? 1.5 + Math.pow(rng.next(), 1.2) * 1.8 : 1.4 + t * 1.2 + rng.next() * 0.3;
  if (rng.next() < 0.1) target = 1.4;
  return { w, h, density: 0.16 + rng.next() * 0.04, target };
}

/**
 * Label from the rating score: on average, how many open squares there are for each one
 * the rules settle in a wave. See `rate` in solver.ts.
 */
export const TENTS_THRESHOLDS = [1.7, 2.2, 2.7];

export function rateTents(score: number): Difficulty {
  if (score < TENTS_THRESHOLDS[0]) return 'Easy';
  if (score < TENTS_THRESHOLDS[1]) return 'Medium';
  if (score < TENTS_THRESHOLDS[2]) return 'Hard';
  return 'Super Hard';
}
