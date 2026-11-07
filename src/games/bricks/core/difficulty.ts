import { Rng } from '../../../shared/rng';
import { Difficulty } from './types';

export const TUTORIAL_COUNT = 3;
/** First level with unbreakable steel bricks. */
export const STEEL_INTRO = 12;

export interface BricksSpec {
  rows: number;
  /** Ball speed in field units per second. */
  speed: number;
  /** Toughest brick that can appear (1 to 3 hits). */
  maxHits: number;
  /** Share of brick cells that are steel. */
  steel: number;
  powerUps: boolean;
  tip?: string;
}

const TUTORIALS: BricksSpec[] = [
  { rows: 2, speed: 11, maxHits: 1, steel: 0, powerUps: false, tip: 'Drag anywhere to move the paddle, then tap to launch. Break every brick.' },
  { rows: 3, speed: 11.5, maxHits: 2, steel: 0, powerUps: false, tip: 'Darker bricks take more hits. Where the ball meets the paddle sets its angle: the edges send it wide.' },
  { rows: 4, speed: 12, maxHits: 2, steel: 0, powerUps: true, tip: 'Catch falling capsules: W widens the paddle, S slows the ball, and + splits it into three.' },
];

/** What level n should look like. Same n, same spec, on every device. */
export function bricksSpecFor(n: number): BricksSpec {
  if (n <= TUTORIAL_COUNT) return TUTORIALS[n - 1];
  const rng = new Rng(n * 4091 + 7);
  const t = Math.min(1, (n - TUTORIAL_COUNT - 1) / 32);
  const rows = Math.min(6, 3 + Math.round(t * 2.5 + rng.next() * 1.2));
  // The ball speeds up over the first 35 levels, then varies, with the odd breather.
  let speed = t >= 1 ? 14 + rng.next() * 2.5 : 12 + t * 2.5 + rng.next() * 0.6;
  if (rng.next() < 0.1) speed = 12;
  const maxHits = n < 8 ? 2 : 3;
  let steel = 0;
  let tip: string | undefined;
  if (n === STEEL_INTRO) {
    steel = 0.06;
    tip = 'Steel bricks never break. Bounce the ball round them.';
  } else if (n > STEEL_INTRO && rng.next() < 0.5) steel = 0.04 + rng.next() * 0.08;
  return { rows, speed: Math.round(speed * 10) / 10, maxHits, steel, powerUps: true, tip };
}

/**
 * Score: a blend of ball speed, how many hits the wall takes and how much steel is in the
 * way. Faster balls leave less time to get under them; more hits mean a longer level with
 * more chances to drop the ball; steel sends the ball off at awkward angles.
 */
export function bricksScore(speed: number, hits: number, steelShare: number): number {
  return Math.round(((speed - 11) * 1.2 + hits / 20 + steelShare * 25) * 10) / 10;
}

export const BRICKS_THRESHOLDS = [4, 7, 10.5];

export function rateBricks(score: number): Difficulty {
  if (score < BRICKS_THRESHOLDS[0]) return 'Easy';
  if (score < BRICKS_THRESHOLDS[1]) return 'Medium';
  if (score < BRICKS_THRESHOLDS[2]) return 'Hard';
  return 'Super Hard';
}
