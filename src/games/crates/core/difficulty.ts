import { Rng } from '../../../shared/rng';
import { Difficulty } from './types';

export const TUTORIAL_COUNT = 4;

export interface CrateSpec {
  /** Size including the outer wall. */
  w: number;
  h: number;
  crates: number;
  pillars: number;
  /** Extra pushes (see rateCrates) the generator aims for. */
  target: number;
  /** Fewest pushes a level should need. */
  minPar: number;
  tip?: string;
}

const TUTORIALS: CrateSpec[] = [
  { w: 6, h: 6, crates: 1, pillars: 0, target: 0, minPar: 3, tip: 'Swipe to walk. Walk into a crate to push it. Get every crate onto a target.' },
  { w: 7, h: 6, crates: 2, pillars: 1, target: 1, minPar: 5, tip: 'Crates can only be pushed, never pulled. A crate in a corner is stuck there.' },
  { w: 7, h: 7, crates: 2, pillars: 2, target: 2, minPar: 7, tip: 'Tap any floor to walk there. Only pushes count toward par.' },
  { w: 7, h: 8, crates: 3, pillars: 2, target: 3, minPar: 8, tip: 'Undo is free and unlimited. Stuck? A hint plays the next push for you.' },
];

/** What level n should look like. Same n, same spec, on every device. */
export function crateSpecFor(n: number): CrateSpec {
  if (n <= TUTORIAL_COUNT) return TUTORIALS[n - 1];
  const rng = new Rng(n * 2903 + 59);
  const t = Math.min(1, (n - TUTORIAL_COUNT - 1) / 30);
  // Rooms grow from 7x7 to about 9x10 (walls included) over the first 35 levels, then vary.
  const grow = t >= 1 ? rng.int(1, 2) : Math.round(t * 2);
  const w = 7 + grow;
  const h = w + rng.int(0, 1);
  const crates = Math.min(5, 2 + Math.round(t * 2 + rng.next() * 1.2));
  const pillars = rng.int(1, 3 + grow);
  // Extra pushes ramp from about 1 to 12, then vary, with the odd breather.
  let target = t >= 1 ? rng.int(2, 15) : Math.round(1 + t * 10 + rng.next() * 2);
  if (rng.next() < 0.1) target = rng.int(0, 2);
  return { w, h, crates, pillars, target, minPar: 4 + crates * 2 + Math.round(t * 4) };
}

/**
 * Label from the extra pushes: pushes in the shortest solution beyond what the crates
 * would need if each could slide to its target on its own. Those extra pushes are the
 * crates that have to be moved out of the way, or round the long way, first. The count
 * is always even: a crate that goes out of its way has to come back.
 */
export const CRATE_THRESHOLDS = [4, 8, 12];

export function rateCrates(extra: number): Difficulty {
  if (extra < CRATE_THRESHOLDS[0]) return 'Easy';
  if (extra < CRATE_THRESHOLDS[1]) return 'Medium';
  if (extra < CRATE_THRESHOLDS[2]) return 'Hard';
  return 'Super Hard';
}
