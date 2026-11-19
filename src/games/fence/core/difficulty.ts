import { Rng } from '../../../shared/rng';
import { Difficulty } from './types';

export const TUTORIAL_COUNT = 3;
/** First level that may need inside and outside, and trial and error. */
export const SIDES_INTRO = 8;
export const TRIAL_INTRO = 20;

export interface FenceSpec {
  w: number;
  h: number;
  /** Share of squares inside the fence. */
  fill: number;
  /** Score to aim for (1 to 4). */
  target: number;
  tip?: string;
}

const TUTORIALS: FenceSpec[] = [
  { w: 4, h: 4, fill: 0.5, target: 1, tip: 'Draw one closed fence along the dotted lines. Each number says how many of its four sides the fence uses.' },
  { w: 5, h: 5, fill: 0.5, target: 1, tip: "Switch to Cross, or hold a line, to mark where the fence can't go. A wrong mark costs a heart." },
  { w: 5, h: 5, fill: 0.5, target: 1, tip: 'The fence is a single loop: it never branches, never crosses itself and never splits in two.' },
];

/** What level n should look like. Same n, same spec, on every device. */
export function fenceSpecFor(n: number): FenceSpec {
  if (n <= TUTORIAL_COUNT) return TUTORIALS[n - 1];
  const rng = new Rng(n * 3767 + 19);
  const t = Math.min(1, (n - TUTORIAL_COUNT - 1) / 32);
  const g = t >= 1 ? 0.5 + rng.next() * 0.5 : t;
  const w = 5 + Math.round(g * 3);
  const h = Math.min(10, w + Math.round(g * 2 + rng.next() * 1.5));
  let target = t >= 1 ? rng.pick([1, 2, 2, 3, 3, 4]) : Math.min(4, 1 + Math.floor(t * 3.4 + rng.next() * 0.7));
  if (n < SIDES_INTRO) target = 1;
  if (n === SIDES_INTRO) target = 2;
  if (n < TRIAL_INTRO) target = Math.min(target, 2);
  if (rng.next() < 0.1) target = 1;
  const tip = n === SIDES_INTRO ? 'Every square is inside the fence or outside. A fence between two squares puts them on different sides.' : undefined;
  return { w, h, fill: 0.4 + rng.next() * 0.2, target, tip };
}

/** Waves of trial and error that make a board Super Hard rather than Hard. */
export const SUPER_TRIALS = 3;
/** Waves of inside and outside that make a board Medium rather than Easy. */
export const MEDIUM_SIDES = 2;
/**
 * Score: 1 for no trial and error and at most one wave of inside and outside, 2 for more
 * of those, 3 for trial and error, 4 for trial and error three or more times.
 */
export const fenceScore = (hardest: number, trials: number, sides: number): number =>
  hardest >= 4 ? (trials >= SUPER_TRIALS ? 4 : 3) : sides >= MEDIUM_SIDES ? 2 : 1;
/** The hardest step a score allows. */
export const tierFor = (score: number): number => (score >= 3 ? 4 : 3);
export function rateFence(score: number): Difficulty {
  return (['Easy', 'Easy', 'Medium', 'Hard', 'Super Hard'] as Difficulty[])[Math.max(1, Math.min(4, score))];
}
