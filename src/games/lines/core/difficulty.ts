import { Rng } from '../../../shared/rng';
import { Difficulty } from './types';

export const TUTORIAL_COUNT = 3;

export interface LinesSpec {
  w: number;
  h: number;
  /** Colours the generator aims for. Fewer colours means longer, harder paths. */
  colours: number;
  /** Score the generator aims for (see rateLines). */
  target: number;
  tip?: string;
}

const TUTORIALS: LinesSpec[] = [
  { w: 4, h: 4, colours: 3, target: 1, tip: 'Drag from a dot to its twin to join them. Fill every square to finish.' },
  { w: 5, h: 5, colours: 4, target: 1, tip: 'Lines cannot cross. Drawing over another line cuts it back.' },
  { w: 5, h: 6, colours: 5, target: 1.1, tip: 'Stuck? A hint draws one line for you, but costs a star.' },
];

/** What level n should look like. Same n, same spec, on every device. */
export function linesSpecFor(n: number): LinesSpec {
  if (n <= TUTORIAL_COUNT) return TUTORIALS[n - 1];
  const rng = new Rng(n * 4421 + 17);
  const t = Math.min(1, (n - TUTORIAL_COUNT - 1) / 32);
  // Boards grow from 5x5 to about 9x10 over the first 35 levels, then vary.
  const grow = t >= 1 ? rng.int(2, 4) : Math.round(t * 4);
  const w = 5 + grow;
  const h = Math.min(11, w + rng.int(0, 2));
  // About one colour per 6 cells on small boards, one per 8 on big ones.
  const colours = Math.max(4, Math.round((w * h) / (6 + t * 2 + rng.next())));
  // Target ramps from easy to hard, then varies, with the odd breather.
  let target = t >= 1 ? 1.1 + Math.pow(rng.next(), 1.3) * 1.2 : 1.05 + t * 0.6 + rng.next() * 0.15;
  if (rng.next() < 0.1) target = 1.05;
  return { w, h, colours, target };
}

/**
 * Label from the rating score: on average, how many line ends there are to look at for
 * each one that has only one way to go. See `rate` in solver.ts.
 */
export const LINES_THRESHOLDS = [1.15, 1.37, 1.65];

export function rateLines(score: number): Difficulty {
  if (score < LINES_THRESHOLDS[0]) return 'Easy';
  if (score < LINES_THRESHOLDS[1]) return 'Medium';
  if (score < LINES_THRESHOLDS[2]) return 'Hard';
  return 'Super Hard';
}
