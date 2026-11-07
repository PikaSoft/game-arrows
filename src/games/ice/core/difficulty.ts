import { Rng } from '../../../shared/rng';
import { Difficulty } from './types';

export const TUTORIAL_COUNT = 3;
/** First level with holes in the ice. */
export const HOLE_INTRO = 12;
/** First level with two pucks. */
export const TWIN_INTRO = 25;

export interface IceSpec {
  w: number;
  h: number;
  /** Share of cells that are rock. */
  rocks: number;
  holes: number;
  pucks: 1 | 2;
  /** Score (see rateIce) the generator aims for. */
  target: number;
  tip?: string;
}

const TUTORIALS: IceSpec[] = [
  { w: 5, h: 5, rocks: 0.16, holes: 0, pucks: 1, target: 2, tip: 'Swipe to slide the puck. It only stops at a rock or the edge. Stop it on the flag.' },
  { w: 6, h: 6, rocks: 0.16, holes: 0, pucks: 1, target: 4, tip: 'Sliding past the flag is not enough: the puck has to stop on it.' },
  { w: 6, h: 7, rocks: 0.14, holes: 0, pucks: 1, target: 6, tip: 'Reach the flag in par swipes or fewer for three stars.' },
];

/** What level n should look like. Same n, same spec, on every device. */
export function iceSpecFor(n: number): IceSpec {
  if (n <= TUTORIAL_COUNT) return TUTORIALS[n - 1];
  const rng = new Rng(n * 5003 + 71);
  const t = Math.min(1, (n - TUTORIAL_COUNT - 1) / 32);
  // Boards grow from 6x7 to about 9x11 over the first 35 levels, then vary.
  const grow = t >= 1 ? rng.int(1, 3) : Math.round(t * 3);
  const w = 6 + grow;
  const h = w + rng.int(1, 2);
  let holes = 0;
  let pucks: 1 | 2 = 1;
  let tip: string | undefined;
  if (n === HOLE_INTRO) {
    holes = 2;
    tip = 'Holes! A puck that slides over one falls in, and the swipe is wasted.';
  } else if (n > HOLE_INTRO && rng.next() < 0.45) holes = rng.int(1, 2 + grow);
  if (n === TWIN_INTRO) {
    pucks = 2;
    holes = 0;
    tip = 'Two pucks slide together. Each has its own flag, and they stop against each other.';
  } else if (n > TWIN_INTRO && rng.next() < 0.35) pucks = 2;
  // Score ramps up, then varies, with the odd breather.
  let target = t >= 1 ? 6 + rng.next() * 14 : 5 + t * 10 + rng.next() * 3;
  if (rng.next() < 0.1) target = 4 + rng.next() * 2;
  if (n === HOLE_INTRO || n === TWIN_INTRO) target = Math.min(target, 7);
  return { w, h, rocks: 0.12 + rng.next() * 0.08, holes, pucks, target: Math.round(target), tip };
}

/**
 * Score: par, weighted by the share of positions that are dead ends (positions you can
 * slide into but never get out of to the flag). A board full of traps punishes the
 * obvious first swipe, so it is harder than its par alone suggests.
 */
export function iceScore(par: number, reachable: number, dead: number): number {
  return Math.round(par * (1 + (reachable ? dead / reachable : 0)));
}

export const ICE_THRESHOLDS = [7, 11, 15];

export function rateIce(score: number): Difficulty {
  if (score < ICE_THRESHOLDS[0]) return 'Easy';
  if (score < ICE_THRESHOLDS[1]) return 'Medium';
  if (score < ICE_THRESHOLDS[2]) return 'Hard';
  return 'Super Hard';
}
