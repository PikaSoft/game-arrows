import { Rng } from '../../../shared/rng';
import { Difficulty, Op } from './types';

export const TUTORIAL_COUNT = 3;
/** First level that may need pairs and pointing, and trial and error. */
export const PAIRS_INTRO = 10;
export const TRIAL_INTRO = 24;

export interface CagesSpec {
  size: number;
  /** Signs cages may use (one-square cages always show their number). */
  ops: Op[];
  /** Most squares in a cage, and the most one-square cages on a board. */
  maxCage: number;
  singles: number;
  /** Score to aim for (1 to 4, see rateCages). */
  target: number;
  tip?: string;
}

const TUTORIALS: CagesSpec[] = [
  { size: 4, ops: ['+'], maxCage: 3, singles: 2, target: 1, tip: 'Fill the grid so every row and column has 1 to 4 once each. The numbers in each outlined cage add up to its target.' },
  { size: 4, ops: ['+', '-', 'x', '/'], maxCage: 3, singles: 1, target: 1, tip: 'A cage can also use −, × or ÷. For − and ÷, take the smaller number from or into the larger one.' },
  { size: 5, ops: ['+', '-', 'x'], maxCage: 3, singles: 1, target: 1, tip: 'Switch on Notes to pencil in what a square could be. A wrong number costs a heart.' },
];

/** What level n should look like. Same n, same spec, on every device. */
export function cagesSpecFor(n: number): CagesSpec {
  if (n <= TUTORIAL_COUNT) return TUTORIALS[n - 1];
  const rng = new Rng(n * 2851 + 61);
  const t = Math.min(1, (n - TUTORIAL_COUNT - 1) / 32);
  // Grids grow from 5x5 to 8x8 over the first 35 levels, then vary; small ones come back as breathers.
  let size = t >= 1 ? rng.pick([5, 6, 6, 7, 7, 8]) : 5 + Math.min(3, Math.floor(t * 3.3 + rng.next() * 0.7));
  let target = t >= 1 ? rng.pick([1, 2, 2, 3, 3, 4]) : Math.min(4, 1 + Math.floor(t * 3.4 + rng.next() * 0.7));
  if (n < PAIRS_INTRO) target = 1;
  if (n < TRIAL_INTRO) target = Math.min(target, 2);
  if (rng.next() < 0.1) {
    target = 1;
    size = Math.min(size, 6);
  }
  return { size, ops: ['+', '-', 'x', '/'], maxCage: size >= 7 ? 4 : 3, singles: rng.int(0, size >= 7 ? 2 : 1), target };
}

/** Waves of trial and error that make a board Super Hard rather than Hard. */
export const SUPER_TRIALS = 3;
/** Score from the hardest step and how often trial and error was needed: 1 up to cage combinations, 2 pairs and pointing, 3 trial and error, 4 trial and error three or more times. */
export const cagesScore = (hardest: number, trials: number): number => (hardest >= 4 ? (trials >= SUPER_TRIALS ? 4 : 3) : hardest >= 3 ? 2 : 1);
/** The hardest step a score allows. */
export const tierFor = (score: number): number => (score >= 3 ? 4 : score + 1);
export const rateCages = (score: number): Difficulty => (['Easy', 'Easy', 'Medium', 'Hard', 'Super Hard'] as Difficulty[])[Math.max(1, Math.min(4, score))];
