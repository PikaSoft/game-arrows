import { Rng } from '../../../shared/rng';
import { Difficulty } from './types';

export const TUTORIAL_COUNT = 4;
/** First level with crystals that must be lit. */
export const CRYSTAL_INTRO = 12;
export const MAX_BEAMS = 4;

export interface BeamSpec {
  w: number;
  h: number;
  beams: number;
  /** Chance a beam turns at each free cell it passes while the level is laid out. */
  turn: number;
  /** Least mirrors on each beam's path. */
  minTurns: number;
  /** Share of other empty cells given a decoy mirror, and a wall. */
  decoys: number;
  walls: number;
  /** Share of the solution's mirrors that are pinned in place. */
  fixed: number;
  crystals: number;
  /** Score the generator aims for (see rateBeams). */
  target: number;
  tip?: string;
}

const TUTORIALS: BeamSpec[] = [
  { w: 4, h: 4, beams: 1, turn: 0.45, minTurns: 2, decoys: 0.1, walls: 0, fixed: 0, crystals: 0, target: 2, tip: 'Tap a mirror to turn it. Guide the beam from the lamp to the target of the same colour.' },
  { w: 5, h: 5, beams: 2, turn: 0.4, minTurns: 2, decoys: 0.15, walls: 0, fixed: 0, crystals: 0, target: 3, tip: 'Each lamp needs the target of its own colour. Beams pass straight through each other.' },
  { w: 5, h: 5, beams: 2, turn: 0.4, minTurns: 2, decoys: 0.2, walls: 0.1, fixed: 0.4, crystals: 0, target: 4, tip: 'Mirrors with a pin are fixed. Walls stop a beam dead.' },
  { w: 5, h: 6, beams: 2, turn: 0.4, minTurns: 2, decoys: 0.25, walls: 0.08, fixed: 0.2, crystals: 0, target: 5, tip: 'Finish within par taps for three stars. Stuck? A hint turns one mirror into place.' },
];

/** What level n should look like. Same n, same spec, on every device. */
export function beamSpecFor(n: number): BeamSpec {
  if (n <= TUTORIAL_COUNT) return TUTORIALS[n - 1];
  const rng = new Rng(n * 6151 + 29);
  const t = Math.min(1, (n - TUTORIAL_COUNT - 1) / 32);
  // Boards grow from 5x6 to about 7x9 over the first 36 levels, then vary.
  const grow = t >= 1 ? rng.int(0, 2) : Math.round(t * 2);
  const w = 5 + grow;
  const h = Math.min(9, w + rng.int(0, 2));
  const beams = Math.min(MAX_BEAMS, 2 + Math.floor(t * 2 + rng.next() * 0.9));
  const crystals = n === CRYSTAL_INTRO ? 1 : n > CRYSTAL_INTRO && rng.next() < 0.45 ? rng.int(1, 2 + Math.round(t)) : 0;
  let target = t >= 1 ? 6 + rng.next() * 7 : 5 + t * 6 + rng.next() * 2;
  if (rng.next() < 0.1) target = 4 + rng.next() * 2;
  return {
    w,
    h,
    beams,
    turn: 0.3 + rng.next() * 0.2,
    minTurns: 2,
    decoys: 0.25 + t * 0.25 + rng.next() * 0.1,
    walls: 0.04 + rng.next() * 0.06,
    fixed: Math.max(0, 0.25 - t * 0.2),
    crystals,
    target,
    tip: n === CRYSTAL_INTRO ? 'Crystals must be lit by a beam too. Any colour will do.' : undefined,
  };
}

/**
 * Label from the search effort, in bits: log2 of the steps the solver takes to explore
 * every way of turning the mirrors the beams reach. A board where wrong turns die out at
 * once is quick to search and quick to read; one where they wander far is not.
 */
export const BEAM_THRESHOLDS = [6, 8.5, 10.5];

export function rateBeams(score: number): Difficulty {
  if (score < BEAM_THRESHOLDS[0]) return 'Easy';
  if (score < BEAM_THRESHOLDS[1]) return 'Medium';
  if (score < BEAM_THRESHOLDS[2]) return 'Hard';
  return 'Super Hard';
}
