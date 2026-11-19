import { Rng } from '../../../shared/rng';
import { Difficulty } from './types';

export const TUTORIAL_COUNT = 3;
/** First level with cracked squares, and with switches and bridges. */
export const WEAK_INTRO = 8;
export const SWITCH_INTRO = 14;

export interface TumbleSpec {
  w: number;
  h: number;
  /** Moves in the walk the level is grown from. */
  walk: number;
  /** Extra squares added round the walk, as a share of its squares. */
  extra: number;
  /** Share of plain squares made cracked. */
  weak: number;
  /** Switches (each with its own bridges). */
  switches: number;
  /** Score to aim for (see rateTumble). */
  target: number;
  tip?: string;
}

const TUTORIALS: TumbleSpec[] = [
  { w: 6, h: 6, walk: 5, extra: 0.3, weak: 0, switches: 0, target: 4, tip: 'Swipe to tip the block over. Stand it upright on the hole to finish.' },
  { w: 6, h: 8, walk: 8, extra: 0.2, weak: 0, switches: 0, target: 7, tip: "Don't let any part hang over the edge: the block topples off and that move is wasted." },
  { w: 7, h: 8, walk: 10, extra: 0.3, weak: 0, switches: 0, target: 9, tip: 'Reach the hole in par moves or fewer for three stars. Undo is free.' },
];

/** What level n should look like. Same n, same spec, on every device. */
export function tumbleSpecFor(n: number): TumbleSpec {
  if (n <= TUTORIAL_COUNT) return TUTORIALS[n - 1];
  const rng = new Rng(n * 6481 + 53);
  const t = Math.min(1, (n - TUTORIAL_COUNT - 1) / 32);
  const g = t >= 1 ? 0.5 + rng.next() * 0.5 : t;
  const w = 7 + Math.round(g * 2);
  const h = 8 + Math.round(g * 4);
  const tip =
    n === WEAK_INTRO
      ? 'Cracked squares hold a lying block, but break under a standing one.'
      : n === SWITCH_INTRO
        ? 'Rolling onto a switch opens or closes the bridges of its colour.'
        : undefined;
  const weak = n >= WEAK_INTRO && (n === WEAK_INTRO || rng.next() < 0.5) ? 0.15 + rng.next() * 0.15 : 0;
  const switches = n >= SWITCH_INTRO && (n === SWITCH_INTRO || rng.next() < 0.5) ? (n > SWITCH_INTRO + 10 && rng.next() < 0.4 ? 2 : 1) : 0;
  let target = t >= 1 ? 12 + rng.next() * 16 : 8 + t * 16 + rng.next() * 4;
  if (rng.next() < 0.1) target = 8;
  return { w, h, walk: Math.round(target * 1.2), extra: 0.25 + rng.next() * 0.25, weak, switches, target, tip };
}

/**
 * Label from par weighted by detours: par plus two for each move of a shortest answer that
 * takes the block further from the hole. A board that can be crossed head on is easy;
 * one where you must wander away to come back right is not.
 */
export const TUMBLE_THRESHOLDS = [10, 17, 25];

export function rateTumble(score: number): Difficulty {
  if (score < TUMBLE_THRESHOLDS[0]) return 'Easy';
  if (score < TUMBLE_THRESHOLDS[1]) return 'Medium';
  if (score < TUMBLE_THRESHOLDS[2]) return 'Hard';
  return 'Super Hard';
}
