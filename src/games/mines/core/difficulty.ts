import { Rng } from '../../../shared/rng';
import { Difficulty } from './types';

export const TUTORIAL_COUNT = 3;

export interface MinesSpec {
  w: number;
  h: number;
  /** Share of squares that are mines. */
  density: number;
  /** Score (see minesScore) the generator aims for. */
  target: number;
  tip?: string;
}

const TUTORIALS: MinesSpec[] = [
  { w: 6, h: 6, density: 0.1, target: 0, tip: 'Each number says how many of the eight squares around it hide a mine. Tap to uncover a safe square.' },
  { w: 7, h: 8, density: 0.12, target: 1, tip: 'Hold a square to flag a mine (or switch to Flag). Hitting a mine costs a heart.' },
  { w: 8, h: 9, density: 0.13, target: 2, tip: 'Tap a number whose mines are all flagged to uncover the rest around it.' },
];

/** What level n should look like. Same n, same spec, on every device. */
export function minesSpecFor(n: number): MinesSpec {
  if (n <= TUTORIAL_COUNT) return TUTORIALS[n - 1];
  const rng = new Rng(n * 9887 + 61);
  const t = Math.min(1, (n - TUTORIAL_COUNT - 1) / 32);
  // Boards grow from 8x9 to about 10x13 over the first 35 levels, then vary.
  const grow = t >= 1 ? rng.int(1, 2) : Math.round(t * 2);
  const w = 8 + grow;
  const h = Math.min(14, w + 1 + rng.int(0, 2) + grow);
  const density = Math.min(0.21, 0.13 + t * 0.06 + rng.next() * 0.02);
  let target = t >= 1 ? 2 + rng.next() * 10 : 1 + t * 7 + rng.next() * 1.5;
  if (rng.next() < 0.1) target = 1;
  return { w, h, density, target };
}

/**
 * Score: how much harder-than-simple reasoning the board needs. Each wave that needed
 * two numbers together counts 1; each that needed every arrangement tried counts 3.
 */
export const minesScore = (uses: number[]): number => uses[2] + uses[3] * 3;

export const MINES_THRESHOLDS = [3, 6, 9];

export function rateMines(score: number): Difficulty {
  if (score < MINES_THRESHOLDS[0]) return 'Easy';
  if (score < MINES_THRESHOLDS[1]) return 'Medium';
  if (score < MINES_THRESHOLDS[2]) return 'Hard';
  return 'Super Hard';
}

export const HARDEST = ['', 'One number at a time', 'Two numbers together', 'Trying every arrangement'];
