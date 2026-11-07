import { Rng } from '../../../shared/rng';
import { Difficulty } from './types';

export const TUTORIAL_COUNT = 3;

export interface NumbersSpec {
  size: 6 | 9;
  /** Hardest technique tier allowed (and aimed for). */
  tier: number;
  tip?: string;
}

const TUTORIALS: NumbersSpec[] = [
  { size: 6, tier: 1, tip: 'Fill the grid so every row, column and box has 1 to 6 once each. Tap a square, then a digit.' },
  { size: 6, tier: 2, tip: 'Switch on Notes to pencil in the digits a square could be. A wrong digit costs a heart.' },
  { size: 9, tier: 1, tip: 'The full-size grid: 1 to 9 in every row, column and 3x3 box.' },
];

/** What level n should look like. Same n, same spec, on every device. */
export function numbersSpecFor(n: number): NumbersSpec {
  if (n <= TUTORIAL_COUNT) return TUTORIALS[n - 1];
  const rng = new Rng(n * 2459 + 97);
  const t = Math.min(1, (n - TUTORIAL_COUNT - 1) / 32);
  // Quick 6x6 boards are common early, then turn up now and then as a breather.
  const size: 6 | 9 = rng.next() < 0.5 - t * 0.35 ? 6 : 9;
  // Tiers ramp from 1 to 4 over the first 35 levels, then vary.
  let tier = t >= 1 ? rng.pick([2, 3, 3, 4, 4]) : Math.min(4, 1 + Math.floor(t * 3.2 + rng.next() * 0.8));
  if (rng.next() < 0.1) tier = 1;
  // 6x6 boards hardly ever need more than singles.
  if (size === 6) tier = Math.min(tier, 2);
  return { size, tier };
}

export const TIER_LABELS: Difficulty[] = ['Easy', 'Easy', 'Medium', 'Hard', 'Super Hard'];
export const rateNumbers = (tier: number): Difficulty => TIER_LABELS[Math.max(1, Math.min(4, tier))];
