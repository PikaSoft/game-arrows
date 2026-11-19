import { Rng } from '../../../shared/rng';
import { Difficulty, FlipLevel, KINDS, SHAPES, STYLES } from './types';

export const TUTORIAL_COUNT = 3;
/** First level whose pictures look alike, and first with cards that swap. */
export const LOOKALIKE_INTRO = 10;
export const SWAP_INTRO = 18;
/** Misses between swaps. */
export const SWAP_EVERY = 3;

export interface FlipSpec {
  cols: number;
  rows: number;
  lookalike: boolean;
  swap: boolean;
  tip?: string;
}

const TUTORIALS: FlipSpec[] = [
  { cols: 3, rows: 2, lookalike: false, swap: false, tip: 'Tap two cards to turn them over. A matching pair stays face up; find every pair.' },
  { cols: 3, rows: 4, lookalike: false, swap: false, tip: 'Remember where each picture was. Finish within par misses for three stars.' },
  { cols: 4, rows: 4, lookalike: false, swap: false, tip: 'Tap anywhere to turn a missed pair back early and keep going.' },
];

/** Grids from small to large; each holds an even number of cards. */
const SIZES: [number, number][] = [
  [4, 4],
  [4, 5],
  [4, 6],
  [5, 6],
  [6, 6],
];

/** What level n should look like. Same n, same spec, on every device. */
export function flipSpecFor(n: number): FlipSpec {
  if (n <= TUTORIAL_COUNT) return TUTORIALS[n - 1];
  const rng = new Rng(n * 2689 + 47);
  const t = Math.min(1, (n - TUTORIAL_COUNT - 1) / 30);
  let k = t >= 1 ? rng.int(2, SIZES.length - 1) : Math.min(SIZES.length - 1, Math.floor(t * SIZES.length + rng.next() * 0.8));
  if (rng.next() < 0.1) k = Math.max(0, k - 2);
  const [cols, rows] = SIZES[k];
  const lookalike = n === LOOKALIKE_INTRO || (n > LOOKALIKE_INTRO && rng.next() < 0.5);
  const swap = n === SWAP_INTRO || (n > SWAP_INTRO && rng.next() < 0.5);
  const tip =
    n === LOOKALIKE_INTRO
      ? 'Look closely: some pictures share a shape and colour, and differ only in style.'
      : n === SWAP_INTRO
        ? 'Every third miss, two face-down cards swap places. Watch them move.'
        : undefined;
  return { cols, rows, lookalike, swap, tip };
}

/**
 * Par: three misses for every four pairs, rounded up. Even a perfect memory misses about
 * 0.6 times per pair on average (the first look at each card is a guess), so par is
 * reachable with care but not by luck alone.
 */
export const parFor = (pairs: number): number => Math.ceil(pairs * 0.75);

/** Score: pairs, plus more for look-alike pictures and swapping cards. */
export const flipScore = (pairs: number, lookalike: boolean, swap: boolean): number => pairs + (lookalike ? 5 : 0) + (swap ? 7 : 0);
export const FLIP_THRESHOLDS = [10, 15, 21];
export function rateFlip(score: number): Difficulty {
  if (score < FLIP_THRESHOLDS[0]) return 'Easy';
  if (score < FLIP_THRESHOLDS[1]) return 'Medium';
  if (score < FLIP_THRESHOLDS[2]) return 'Hard';
  return 'Super Hard';
}

/**
 * Pictures for `pairs` pairs. Look-alike sets use every style of a few shapes (so the same
 * shape and colour turns up as solid, ring and twin); otherwise as many different shapes
 * as possible come first.
 */
export function pickKinds(pairs: number, lookalike: boolean, rng: Rng): number[] {
  const shapes = rng.shuffle([...Array(SHAPES).keys()]);
  const styles = (s: number) => rng.shuffle([...Array(STYLES).keys()]).map((st) => s * STYLES + st);
  const out: number[] = [];
  if (lookalike) {
    for (const s of shapes) {
      out.push(...styles(s));
      if (out.length >= pairs) break;
    }
  } else {
    // One style of each shape first, then a second style of each, and so on.
    const bySlot = shapes.map((s) => styles(s));
    for (let k = 0; k < STYLES && out.length < pairs; k++) for (const list of bySlot) if (out.length < pairs) out.push(list[k]);
  }
  return out.slice(0, Math.min(pairs, KINDS));
}

export function buildFlipLevel(n: number): FlipLevel {
  const spec = flipSpecFor(n);
  const rng = new Rng(n * 5003 + 71);
  const pairs = (spec.cols * spec.rows) / 2;
  const kinds = pickKinds(pairs, spec.lookalike, rng);
  const faces = rng.shuffle(kinds.flatMap((k) => [k, k]));
  const score = flipScore(pairs, spec.lookalike, spec.swap);
  return {
    number: n,
    cols: spec.cols,
    rows: spec.rows,
    faces,
    par: parFor(pairs),
    lookalike: spec.lookalike,
    swapEvery: spec.swap ? SWAP_EVERY : 0,
    seed: n * 977 + 13,
    difficulty: n <= TUTORIAL_COUNT ? 'Tutorial' : rateFlip(score),
    score,
    tip: spec.tip,
  };
}
