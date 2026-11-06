import { Rng } from '../../../shared/rng';
import { clone, isSolved, pour, usefulMoves } from './rules';
import { exhausted, Move, search } from './solver';
import { Bottle, Difficulty } from './types';

export const TUTORIAL_COUNT = 4;
/** First level with covered layers. */
export const HIDDEN_INTRO = 20;
/** First level where some colours are liquid. */
export const LIQUID_INTRO = 35;

export interface SandSpec {
  colors: number;
  capacity: number;
  empties: number;
  hidden: boolean;
  /** How many of the colours are liquid instead of sand. */
  liquids: number;
  tip?: string;
}

const TUTORIALS: SandSpec[] = [
  { colors: 2, capacity: 4, empties: 1, hidden: false, liquids: 0, tip: 'Tap a bottle, then tap another to pour. Sand only lands on the same colour or in an empty bottle.' },
  { colors: 3, capacity: 4, empties: 2, hidden: false, liquids: 0, tip: 'You can also drag a bottle onto another. Finish with one colour per bottle.' },
  { colors: 3, capacity: 4, empties: 1, hidden: false, liquids: 0, tip: 'Undo is free. Once per level you can add an empty bottle, but that caps you at two stars.' },
  { colors: 4, capacity: 4, empties: 2, hidden: false, liquids: 0, tip: 'Finish within par for three stars.' },
];

/** What level n should look like. Same n, same spec, on every device. */
export function sandSpecFor(n: number): SandSpec {
  if (n <= TUTORIAL_COUNT) return TUTORIALS[n - 1];
  const rng = new Rng(n * 7919 + 13);
  const t = Math.min(1, (n - TUTORIAL_COUNT - 1) / 40);
  // Colours ramp from 4 to 12 over the first ~45 levels, then wander.
  let colors = Math.round(4 + t * 8);
  if (t >= 1) colors = rng.int(7, 12);
  else colors = Math.max(4, Math.min(12, colors + rng.int(-1, 1)));
  // Taller bottles arrive once the player has the hang of it.
  let capacity = 4;
  if (n >= 25) capacity = rng.next() < 0.4 ? 5 : 4;
  if (n >= 40) {
    const r = rng.next();
    capacity = r < 0.45 ? 4 : r < 0.75 ? 5 : 6;
  }
  // Big bottles with many colours get fewer colours so the board stays readable.
  if (capacity === 6) colors = Math.min(colors, 9);
  // Hard levels have only one spare bottle.
  let empties = 2;
  const oneChance = Math.min(0.45, Math.max(0, (n - 12) / 50));
  if (colors <= 10 && rng.next() < oneChance) empties = 1;
  let hidden = false;
  let tip: string | undefined;
  if (n === HIDDEN_INTRO) {
    hidden = true;
    tip = 'Some sand is covered. A layer shows its colour once the sand above it is poured off.';
    colors = Math.min(colors, 7);
    capacity = 4;
    empties = 2;
  } else if (n > HIDDEN_INTRO && rng.next() < 0.25) hidden = true;
  // Liquids: sand sinks below them. Kept apart from covered sand, since a sinking pour
  // would land on layers the player cannot see.
  let liquids = 0;
  if (n === LIQUID_INTRO) {
    hidden = false;
    liquids = 2;
    tip = 'Some colours are liquid. Sand sinks below liquid, and only the top colour pours. Liquid lands only on the same liquid or in an empty bottle.';
    colors = Math.min(colors, 6);
    capacity = 4;
    empties = 2;
  } else if (n > LIQUID_INTRO && !hidden && rng.next() < 0.3) {
    liquids = rng.int(2, Math.max(2, Math.min(4, Math.floor(colors / 2))));
  }
  return { colors, capacity, empties, hidden, liquids, tip };
}

/**
 * How hard the right pour is to find. Plays the solution through and, at each
 * position, checks every useful pour to see whether the board can still be solved
 * afterwards. A player trying pours at random would make about
 * (pours + 1) / (safe pours + 1) attempts to find a safe one; this returns the
 * average of that over the level.
 */
export function blunderScore(start: Bottle[], cap: number, path: Move[], budget = 1500): number {
  const b = clone(start);
  let total = 0;
  let steps = 0;
  for (const [f, t] of path) {
    if (isSolved(b, cap)) break;
    const moves = usefulMoves(b, cap);
    let safe = 0;
    for (const [mf, mt] of moves) {
      const next = clone(b);
      pour(next, cap, mf, mt);
      // A search that runs out of budget counts as safe: we only count clear dead ends.
      if (search(next, cap, 4, budget) !== null || exhausted) safe++;
    }
    total += (moves.length + 1) / (safe + 1);
    steps++;
    pour(b, cap, f, t);
  }
  return steps ? total / steps : 1;
}

/**
 * Label from the blunder score.
 */
export const SAND_THRESHOLDS = [1.07, 1.18, 1.3];

export function rateSand(score: number): Difficulty {
  if (score < SAND_THRESHOLDS[0]) return 'Easy';
  if (score < SAND_THRESHOLDS[1]) return 'Medium';
  if (score < SAND_THRESHOLDS[2]) return 'Hard';
  return 'Super Hard';
}
