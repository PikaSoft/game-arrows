import { Rng } from '../../../shared/rng';
import { Difficulty } from './types';

export const TUTORIAL_COUNT = 3;

export interface PairsSpec {
  /** Bottom layer size, in tiles. */
  cols: number;
  rows: number;
  layers: number;
  /** Share of possible spots filled on the bottom layer, and on upper layers. */
  fill: number;
  upper: number;
  /** Different pictures in play. Fewer pictures means more look-alike pairs to choose between. */
  kinds: number;
  /** Share of random playthroughs that should get stuck. */
  target: number;
  tip?: string;
}

const TUTORIALS: PairsSpec[] = [
  { cols: 4, rows: 3, layers: 1, fill: 1, upper: 0, kinds: 3, target: 0, tip: 'Tap two matching free tiles to clear them. A tile is free when nothing lies on it and its left or right side is open.' },
  { cols: 4, rows: 4, layers: 2, fill: 1, upper: 0.7, kinds: 4, target: 0.1, tip: 'Tiles on top cover the ones below. Free tiles are bright; covered ones are dim.' },
  { cols: 5, rows: 4, layers: 2, fill: 0.9, upper: 0.8, kinds: 5, target: 0.3, tip: 'Some pairs lead to a dead end. Undo is free; each hint or shuffle costs a star.' },
];

/** What level n should look like. Same n, same spec, on every device. */
export function pairsSpecFor(n: number): PairsSpec {
  if (n <= TUTORIAL_COUNT) return TUTORIALS[n - 1];
  const rng = new Rng(n * 7349 + 101);
  const t = Math.min(1, (n - TUTORIAL_COUNT - 1) / 32);
  // Piles grow from 5x4 with two layers to 8x7 with four over the first 35 levels, then vary.
  const g = t >= 1 ? 0.5 + rng.next() * 0.5 : t;
  const cols = 5 + Math.round(g * 3);
  const rows = 4 + Math.round(g * 3 * (0.7 + rng.next() * 0.3));
  const layers = 2 + Math.round(g * 2 * (0.6 + rng.next() * 0.4));
  const kinds = Math.min(16, 5 + Math.round(g * 8 + rng.next() * 2));
  let target = t >= 1 ? 0.25 + rng.next() * 0.7 : 0.15 + t * 0.6 + rng.next() * 0.1;
  if (rng.next() < 0.1) target = 0.1;
  return { cols, rows, layers, fill: 0.8 + rng.next() * 0.2, upper: 0.6 + rng.next() * 0.3, kinds, target };
}

/** Labels from the share of random playthroughs that get stuck. */
export const PAIRS_THRESHOLDS = [0.2, 0.45, 0.7];

export function ratePairs(score: number): Difficulty {
  if (score < PAIRS_THRESHOLDS[0]) return 'Easy';
  if (score < PAIRS_THRESHOLDS[1]) return 'Medium';
  if (score < PAIRS_THRESHOLDS[2]) return 'Hard';
  return 'Super Hard';
}
