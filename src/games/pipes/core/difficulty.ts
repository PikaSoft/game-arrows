import { Rng } from '../../../shared/rng';
import { Difficulty } from './types';

export const TUTORIAL_COUNT = 4;

export interface PipeSpec {
  w: number;
  h: number;
  /** Tree shape (see spanningTree): long straight runs are easier than bushy ones. */
  straight: number;
  branchy: number;
  /** Score the generator aims for (see ratePipes). */
  target: number;
  tip?: string;
}

const TUTORIALS: PipeSpec[] = [
  { w: 3, h: 3, straight: 0.8, branchy: 0.9, target: 1, tip: 'Tap a tile to turn it. Join every pipe to the tap so water reaches them all.' },
  { w: 4, h: 4, straight: 0.6, branchy: 0.8, target: 1.1, tip: 'Pipes at the edge can never point off the board. Start there.' },
  { w: 4, h: 5, straight: 0.4, branchy: 0.6, target: 1.2, tip: 'Long-press a tile to lock it once you are sure. Locked tiles do not turn.' },
  { w: 5, h: 5, straight: 0.3, branchy: 0.5, target: 1.3, tip: 'Finish within par taps for three stars. Stuck? A hint turns one tile into place.' },
];

/** What level n should look like. Same n, same spec, on every device. */
export function pipeSpecFor(n: number): PipeSpec {
  if (n <= TUTORIAL_COUNT) return TUTORIALS[n - 1];
  const rng = new Rng(n * 7919 + 41);
  const t = Math.min(1, (n - TUTORIAL_COUNT - 1) / 30);
  // Boards grow from 5x5 to about 8x9 over the first 35 levels, then vary.
  const grow = t >= 1 ? rng.int(1, 4) : Math.round(t * 3);
  const w = Math.min(8, 5 + grow - (rng.next() < 0.3 ? 1 : 0));
  const h = Math.min(10, w + rng.int(0, 2));
  // Bushier trees (more junctions and dead ends) as levels go on.
  const straight = Math.max(0.1, 0.7 - t * 0.5 - rng.next() * 0.2);
  const branchy = Math.max(0.1, 0.8 - t * 0.5 - rng.next() * 0.2);
  // Target ramps from easy to hard, then varies, with the odd breather.
  let target = t >= 1 ? 1.5 + Math.pow(rng.next(), 1.2) * 1.9 : 1.3 + t * 1.2 + rng.next() * 0.3;
  if (rng.next() < 0.1) target = 1.3 + rng.next() * 0.3;
  return { w, h, straight, branchy, target };
}

/**
 * Label from the rating score: on average, how many open tiles there are for each one the
 * player can settle at that point. See `rate` in solver.ts.
 */
export const PIPE_THRESHOLDS = [1.6, 2.1, 2.7];

export function ratePipes(score: number): Difficulty {
  if (score < PIPE_THRESHOLDS[0]) return 'Easy';
  if (score < PIPE_THRESHOLDS[1]) return 'Medium';
  if (score < PIPE_THRESHOLDS[2]) return 'Hard';
  return 'Super Hard';
}
