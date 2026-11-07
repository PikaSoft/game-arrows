import { Rng } from '../../../shared/rng';
import { PICTURES, TUTORIAL_PICTURES } from './pictures';
import { Difficulty } from './types';

export const TUTORIAL_COUNT = TUTORIAL_PICTURES.length;

export interface PictureSpec {
  w: number;
  h: number;
  /** Share of cells filled. Around half gives the most interesting clues. */
  density: number;
  /** How blobby the picture is: more smoothing passes, bigger shapes, easier clues. */
  smooth: number;
  /** Score (see ratePicture) the generator aims for. */
  target: number;
  /** A hand-drawn picture instead of a generated one: its index in PICTURES. */
  drawing?: number;
  tip?: string;
}

const TIPS = [
  'Each number is a run of filled squares in that row or column, in order, with gaps between. Tap to fill.',
  'Hold a square for a moment to cross it out as empty (or switch to Cross). A wrong guess costs a heart.',
  'Drag to paint several squares in one stroke; hold first to paint crosses. Finished lines fade their numbers.',
];

/** What level n should look like. Same n, same spec, on every device. */
export function pictureSpecFor(n: number): PictureSpec {
  if (n <= TUTORIAL_COUNT) {
    const d = TUTORIAL_PICTURES[n - 1];
    return { w: d.rows[0].length, h: d.rows.length, density: 0, smooth: 0, target: 0, drawing: -n, tip: TIPS[n - 1] };
  }
  // Every tenth level is a hand-drawn picture, in turn.
  if (n % 10 === 0) {
    const d = PICTURES[(n / 10 - 1) % PICTURES.length];
    return { w: d.rows[0].length, h: d.rows.length, density: 0, smooth: 0, target: 0, drawing: (n / 10 - 1) % PICTURES.length };
  }
  const rng = new Rng(n * 6263 + 23);
  const t = Math.min(1, (n - TUTORIAL_COUNT - 1) / 32);
  // Boards grow from 6x6 to about 12x12 over the first 35 levels, then vary.
  const grow = t >= 1 ? rng.int(3, 6) : Math.round(t * 6);
  const w = 6 + grow;
  const h = Math.min(13, w + rng.int(-1, 1));
  const smooth = t >= 1 ? rng.int(1, 2) : t < 0.4 ? 2 : rng.int(1, 2);
  // Target ramps up, then varies, with the odd breather.
  let target = t >= 1 ? 1.4 + Math.pow(rng.next(), 1.3) * 1.6 : 1.25 + t * 0.9 + rng.next() * 0.2;
  if (rng.next() < 0.1) target = 1.3;
  return { w, h, density: 0.5 + rng.next() * 0.12, smooth, target };
}

/**
 * Label from the rating score: on average, how many open squares there are for each one
 * line logic can settle in a wave. See `rate` in solver.ts.
 */
export const PICTURE_THRESHOLDS = [1.5, 1.9, 2.5];

export function ratePicture(score: number): Difficulty {
  if (score < PICTURE_THRESHOLDS[0]) return 'Easy';
  if (score < PICTURE_THRESHOLDS[1]) return 'Medium';
  if (score < PICTURE_THRESHOLDS[2]) return 'Hard';
  return 'Super Hard';
}
