import { Rng } from '../../../shared/rng';
import { Difficulty } from './types';

export const TUTORIAL_COUNT = 2;

export interface WordsSpec {
  size: number;
  seconds: number;
  /** How many words the grid should hide (see rateWords). */
  target: number;
  tip?: string;
}

const TUTORIALS: WordsSpec[] = [
  { size: 4, seconds: 150, target: 150, tip: 'Drag through touching letters (diagonals too) to spell a word of 3 or more letters. Let go to try it.' },
  { size: 4, seconds: 120, target: 130, tip: 'Longer words score far more. Find enough words before time runs out to earn stars.' },
];

/** What level n should look like. Same n, same spec, on every device. */
export function wordsSpecFor(n: number): WordsSpec {
  if (n <= TUTORIAL_COUNT) return TUTORIALS[n - 1];
  const rng = new Rng(n * 3301 + 11);
  const t = Math.min(1, (n - TUTORIAL_COUNT - 1) / 30);
  // 5x5 grids come in from level 10 and become most of them.
  const size = n >= 10 && rng.next() < 0.3 + t * 0.5 ? 5 : 4;
  const seconds = size === 5 ? 180 : 120;
  // Fewer words hidden as levels go on (it gets harder to find enough), then varying.
  let target = t >= 1 ? 35 + rng.next() * 110 : 140 - t * 90 + rng.next() * 15;
  if (rng.next() < 0.1) target = 140;
  return { size, seconds, target, tip: n === 10 ? 'A bigger grid, and a longer round to match.' : undefined };
}

/** Words to find for one, two and three stars: a share of what's there, within limits. */
export function targetsFor(total: number): [number, number, number] {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));
  return [clamp(total * 0.12, 4, 10), clamp(total * 0.22, 8, 20), clamp(total * 0.33, 12, 30)];
}

/**
 * Label from how many words the grid hides. The star targets are capped (at most 30 for
 * three stars), so a grid full of words leaves plenty to choose from; a sparse one needs a
 * bigger share of them, and the few that are there tend to be harder to spot.
 */
export const WORDS_THRESHOLDS = [120, 85, 55];

export function rateWords(words: number): Difficulty {
  if (words >= WORDS_THRESHOLDS[0]) return 'Easy';
  if (words >= WORDS_THRESHOLDS[1]) return 'Medium';
  if (words >= WORDS_THRESHOLDS[2]) return 'Hard';
  return 'Super Hard';
}
