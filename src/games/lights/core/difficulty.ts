import { Rng } from '../../../shared/rng';
import { Difficulty, Pattern } from './types';

export const TUTORIAL_COUNT = 3;
/** First level where taps reach the diagonals instead of the sides. */
export const CROSS_INTRO = 15;
/** First level with three-step lights. */
export const THREE_INTRO = 30;

export interface LightsSpec {
  w: number;
  h: number;
  pattern: Pattern;
  states: 2 | 3;
  /** Par the generator aims for. */
  target: number;
  tip?: string;
}

const TUTORIALS: LightsSpec[] = [
  { w: 3, h: 3, pattern: 'plus', states: 2, target: 2, tip: 'Tap a light to switch it and the lights beside it. Turn every light off.' },
  { w: 4, h: 4, pattern: 'plus', states: 2, target: 3, tip: 'Tapping the same light twice puts it back. The order of taps never matters.' },
  { w: 4, h: 5, pattern: 'plus', states: 2, target: 5, tip: 'Finish in par taps or fewer for three stars.' },
];

/** What level n should look like. Same n, same spec, on every device. */
export function lightsSpecFor(n: number): LightsSpec {
  if (n <= TUTORIAL_COUNT) return TUTORIALS[n - 1];
  const rng = new Rng(n * 3571 + 13);
  const t = Math.min(1, (n - TUTORIAL_COUNT - 1) / 32);
  // Boards grow from 4x4 to about 7x8 over the first 35 levels, then vary.
  const grow = t >= 1 ? rng.int(1, 3) : Math.round(t * 3);
  const w = 4 + grow;
  const h = Math.min(9, w + rng.int(0, 1));
  let pattern: Pattern = 'plus';
  let states: 2 | 3 = 2;
  let tip: string | undefined;
  if (n === CROSS_INTRO) {
    pattern = 'cross';
    tip = 'On this board a tap switches the lights at its corners instead of its sides.';
  } else if (n > CROSS_INTRO && rng.next() < 0.35) pattern = 'cross';
  if (n === THREE_INTRO) {
    pattern = 'plus';
    states = 3;
    tip = 'These lights have three steps: bright, dim, off. Each tap moves them one step on.';
  } else if (n > THREE_INTRO && rng.next() < 0.35) states = 3;
  // Par ramps up with the board, then varies, with the odd breather.
  const area = w * h;
  let target = Math.round(area * (0.18 + t * 0.14 + rng.next() * 0.08));
  if (rng.next() < 0.1) target = Math.round(area * 0.15);
  if (n === CROSS_INTRO || n === THREE_INTRO) target = Math.min(target, 5);
  if (states === 3) target = Math.round(target * 0.6);
  return { w, h, pattern, states, target: Math.max(2, target), tip };
}

/**
 * Label from par, weighted for how hard the board is to read: diagonal taps are harder
 * to picture than side ones, and three-step lights need each tile tapped the right number
 * of times. Light chasing (clearing row by row) always works, so the label measures how
 * long a board is more than how clever.
 */
export const LIGHTS_THRESHOLDS = [6, 12, 20];

export function lightsScore(par: number, pattern: Pattern, states: number): number {
  return Math.round(par * (pattern === 'cross' ? 1.25 : 1) * (states === 3 ? 1.4 : 1));
}

export function rateLights(score: number): Difficulty {
  if (score < LIGHTS_THRESHOLDS[0]) return 'Easy';
  if (score < LIGHTS_THRESHOLDS[1]) return 'Medium';
  if (score < LIGHTS_THRESHOLDS[2]) return 'Hard';
  return 'Super Hard';
}
