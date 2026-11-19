import { Rng } from '../../../shared/rng';
import { Difficulty } from './types';

export const TUTORIAL_COUNT = 3;
/** First level that needs the no-copies rule. */
export const UNIQUE_INTRO = 15;
/** First level that may need trial and error. */
export const TRIAL_INTRO = 26;

export interface TonesSpec {
  size: number;
  /** Hardest technique tier allowed (and aimed for). */
  tier: number;
  tip?: string;
}

const TUTORIALS: TonesSpec[] = [
  { size: 4, tier: 1, tip: 'Fill every square, orange or blue. Never three of one colour in a row, across or down.' },
  { size: 6, tier: 2, tip: 'Every row and column holds as many orange as blue. The edge numbers count what each line still needs.' },
  { size: 6, tier: 3, tip: "Tap a square to place the switch's colour; hold it for the other one. A wrong square costs a heart." },
];

/** What level n should look like. Same n, same spec, on every device. */
export function tonesSpecFor(n: number): TonesSpec {
  if (n <= TUTORIAL_COUNT) return TUTORIALS[n - 1];
  if (n === UNIQUE_INTRO) return { size: 8, tier: 4, tip: 'No two rows may be the same, and no two columns. A finished line can rule out a copy.' };
  const rng = new Rng(n * 3343 + 71);
  const t = Math.min(1, (n - TUTORIAL_COUNT - 1) / 32);
  // Sizes grow from 6 to 12 over the first 35 levels, then vary.
  let size = t >= 1 ? rng.pick([8, 10, 10, 12, 12]) : 6 + 2 * Math.min(3, Math.floor(t * 3.4 + rng.next() * 0.6));
  let tier = t >= 1 ? rng.pick([2, 3, 3, 4, 4, 5]) : Math.min(5, 1 + Math.floor(t * 4 + rng.next() * 0.9));
  if (n < UNIQUE_INTRO) tier = Math.min(tier, 3);
  if (n < TRIAL_INTRO) tier = Math.min(tier, 4);
  // The odd breather.
  if (rng.next() < 0.1) {
    tier = 2;
    size = Math.min(size, 8);
  }
  return { size, tier: Math.max(1, tier) };
}

export const TIER_LABELS: Difficulty[] = ['Easy', 'Easy', 'Easy', 'Medium', 'Hard', 'Super Hard'];
export const rateTones = (tier: number): Difficulty => TIER_LABELS[Math.max(1, Math.min(5, tier))];
