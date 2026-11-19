import { Rng } from '../../../shared/rng';
import { Difficulty } from './types';

export const TUTORIAL_COUNT = 3;

export interface PegsSpec {
  w: number;
  h: number;
  /** Pegs at the start. */
  pegs: number;
  /** Score to aim for (see ratePegs). */
  target: number;
  tip?: string;
}

const TUTORIALS: PegsSpec[] = [
  { w: 5, h: 3, pegs: 2, target: 0, tip: 'Tap a peg, then the empty hole two steps past its neighbour. It jumps over, and the peg it jumps is taken off.' },
  { w: 5, h: 5, pegs: 4, target: 2, tip: 'Finish with one peg on the ringed hole for three stars. One peg anywhere else is two; two pegs left is one.' },
  { w: 5, h: 5, pegs: 6, target: 3, tip: 'Undo is free. A hint shows a jump that can still finish on the ring, for a star.' },
];

/** What level n should look like. Same n, same spec, on every device. */
export function pegsSpecFor(n: number): PegsSpec {
  if (n <= TUTORIAL_COUNT) return TUTORIALS[n - 1];
  const rng = new Rng(n * 5711 + 37);
  const t = Math.min(1, (n - TUTORIAL_COUNT - 1) / 32);
  // Boards grow from 5x5 to 7x7, and pegs from 6 to about 20, over the first 35 levels.
  const g = t >= 1 ? 0.5 + rng.next() * 0.5 : t;
  const w = 5 + 2 * Math.round(g);
  const h = 5 + 2 * Math.round(g * (0.6 + rng.next() * 0.4));
  let pegs = Math.round(6 + g * 14 + rng.next() * 3);
  let target = t >= 1 ? 4 + rng.next() * 8 : 3 + t * 7 + rng.next() * 1.5;
  if (rng.next() < 0.1) {
    pegs = Math.max(5, pegs - 6);
    target = 3;
  }
  return { w, h, pegs, target };
}

/**
 * Label from the search effort, in bits: log2 of the positions the solver looks at
 * before it finds a finish on the ring, trying jumps in a fixed order. A board where
 * most jumps lead nowhere takes longer to search, and to think through.
 */
export const PEGS_THRESHOLDS = [4, 7, 10];

export function ratePegs(score: number): Difficulty {
  if (score < PEGS_THRESHOLDS[0]) return 'Easy';
  if (score < PEGS_THRESHOLDS[1]) return 'Medium';
  if (score < PEGS_THRESHOLDS[2]) return 'Hard';
  return 'Super Hard';
}
