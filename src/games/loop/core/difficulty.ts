import { Rng } from '../../../shared/rng';
import { Difficulty } from './types';

export const TUTORIAL_COUNT = 4;
/** First level with a clock. */
export const TIMED_INTRO = 8;
/** First level with crates that hold two colours. */
export const MIXED_INTRO = 11;
/** First level where crates behind the front one are covered. */
export const COVERED_INTRO = 18;

export interface LoopSpec {
  colors: number;
  cols: number;
  bays: number;
  /** Trays to fill in all. There is one crate for each. */
  trays: number;
  /** Pairs of crates that swap half their cubes, so each holds two colours. */
  mixed: number;
  covered: boolean;
  timed: boolean;
  /** Steps per belt slot. Lower is faster. */
  ticksPerSlot: number;
  /** Belt slots beyond the fewest the level can be cleared with. */
  slack: number;
  tip?: string;
}

/** The tutorial boards are written by hand in levels.ts; these describe them. */
const TUTORIALS: LoopSpec[] = [
  { colors: 2, cols: 2, bays: 2, trays: 4, mixed: 0, covered: false, timed: false, ticksPerSlot: 15, slack: 8, tip: 'Tap a column to tip its front crate onto the belt. Each tray below picks up the cubes of its own colour.' },
  { colors: 3, cols: 2, bays: 2, trays: 4, mixed: 0, covered: false, timed: false, ticksPerSlot: 15, slack: 4, tip: 'A full tray ships out and the next one slides up. Only the front tray of each bay collects.' },
  { colors: 4, cols: 2, bays: 2, trays: 4, mixed: 0, covered: false, timed: false, ticksPerSlot: 15, slack: 0, tip: 'Cubes that no front tray wants keep circling and take up room. Tip the crates your trays are waiting for first.' },
  { colors: 4, cols: 2, bays: 2, trays: 6, mixed: 0, covered: false, timed: false, ticksPerSlot: 14, slack: 0, tip: 'If a crate cannot drop its cubes within one lap, the belt jams. Undo takes back your last tap. Clear a level with no undos for three stars.' },
];

export const TIMED_TIP = 'Now there is a clock. It starts on your first tap: ship every tray before it runs out.';
export const MIXED_TIP = 'Some crates hold two colours. Both lots of cubes drop together.';
export const COVERED_TIP = 'Crates marked ? show their colours only when they reach the front.';

/** What level n should look like. Same n, same spec, on every device. */
export function loopSpecFor(n: number): LoopSpec {
  if (n <= TUTORIAL_COUNT) return TUTORIALS[n - 1];
  const rng = new Rng(n * 6151 + 3);
  const t = Math.min(1, (n - TUTORIAL_COUNT - 1) / 36);
  const colors = Math.min(6, 3 + Math.floor(t * 3 + rng.next() * 0.9));
  const cols = n < 9 ? 2 : n < 22 ? 3 : rng.next() < 0.45 ? 4 : 3;
  const bays = n < 14 ? 2 : rng.next() < 0.5 ? 3 : 2;
  const trays = Math.min(12, Math.max(colors + 2, Math.round(colors * (1.5 + t * 0.6 + rng.next() * 0.3))));
  let mixed = 0;
  let covered = false;
  let timed = n >= TIMED_INTRO && rng.next() < 0.8;
  let tip: string | undefined;
  if (n === MIXED_INTRO) mixed = 1;
  else if (n > MIXED_INTRO && rng.next() < 0.55) mixed = 1 + Math.floor(rng.next() * (t >= 1 ? 3 : 2));
  if (n === COVERED_INTRO) covered = true;
  else if (n > COVERED_INTRO) covered = rng.next() < 0.4;
  // The belt speeds up and its spare room shrinks over the first 40 levels.
  let ticksPerSlot = Math.round(14 - t * 5 + rng.next());
  let slack = n < 8 ? 4 : n < 16 ? 2 : rng.next() < 0.3 ? 2 : 0;
  // The odd breather: a slower belt with room to spare.
  if (n > 12 && rng.next() < 0.1) {
    slack = 6;
    ticksPerSlot = 13;
  }
  if (n === TIMED_INTRO) {
    timed = true;
    tip = TIMED_TIP;
  } else if (n === MIXED_INTRO) {
    timed = false;
    tip = MIXED_TIP;
  } else if (n === COVERED_INTRO) {
    timed = false;
    tip = COVERED_TIP;
  }
  return { colors, cols, bays, trays, mixed, covered, timed, ticksPerSlot, slack, tip };
}

/**
 * Score: three times the share of taps (out of 100) that jam the belt when playing
 * carefully but at random, plus a little for a clock and for covered crates, which both
 * make planning harder.
 */
export function loopScore(blunder: number, timed: boolean, covered: boolean): number {
  return Math.round(blunder * 300) + (timed ? 8 : 0) + (covered ? 6 : 0);
}

export const LOOP_THRESHOLDS = [20, 42, 68];

export function rateLoop(score: number): Difficulty {
  if (score < LOOP_THRESHOLDS[0]) return 'Easy';
  if (score < LOOP_THRESHOLDS[1]) return 'Medium';
  if (score < LOOP_THRESHOLDS[2]) return 'Hard';
  return 'Super Hard';
}
