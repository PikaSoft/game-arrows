import { Rng } from '../../../shared/rng';
import { HUGE, LARGE, MEDIUM, shapeIndex, SMALL } from './shapes';
import { Difficulty } from './types';

export const TUTORIAL_COUNT = 5;
/** First level with coloured gates. */
export const GATE_INTRO = 20;
/** How many block colours there are. */
export const COLOR_COUNT = 8;

export interface SqueezeSpec {
  w: number;
  h: number;
  blocks: number;
  /** Shapes to draw from. */
  pool: number[];
  gaps: number;
  gapMin: number;
  gapMax: number;
  /** How many gaps are coloured gates. */
  gates: number;
  /** Setup moves the generator aims for (see rateSqueeze). */
  target: number;
  tip?: string;
}

const s = (...names: string[]) => names.map(shapeIndex);

const TUTORIALS: SqueezeSpec[] = [
  { w: 4, h: 4, blocks: 3, pool: s('bar2h', 'bar2v', 'dot'), gaps: 1, gapMin: 2, gapMax: 2, gates: 0, target: 0, tip: 'Drag a block out through the gap in the frame. Clear every block to finish.' },
  { w: 4, h: 5, blocks: 4, pool: s('bar2h', 'bar2v', 'bar3v', 'dot'), gaps: 1, gapMin: 1, gapMax: 1, gates: 0, target: 0, tip: 'A block only fits through a gap as wide as it is. Shapes never turn.' },
  { w: 5, h: 5, blocks: 5, pool: s('bar2h', 'bar2v', 'corner-a', 'corner-d', 'dot'), gaps: 2, gapMin: 1, gapMax: 2, gates: 0, target: 1, tip: 'Slide blocks aside to clear the way. One drag is one move, however far it goes.' },
  { w: 5, h: 5, blocks: 6, pool: s('bar2h', 'bar2v', 'bar3h', 'corner-b', 'corner-c', 'dot'), gaps: 2, gapMin: 1, gapMax: 2, gates: 0, target: 1, tip: 'Finish within par for three stars. Undo is free.' },
  { w: 5, h: 6, blocks: 7, pool: [...SMALL, ...MEDIUM], gaps: 2, gapMin: 1, gapMax: 3, gates: 0, target: 2, tip: 'While you drag a block, the gaps it fits through light up.' },
];

/** What level n should look like. Same n, same spec, on every device. */
export function squeezeSpecFor(n: number): SqueezeSpec {
  if (n <= TUTORIAL_COUNT) return TUTORIALS[n - 1];
  const rng = new Rng(n * 6151 + 29);
  const t = Math.min(1, (n - TUTORIAL_COUNT - 1) / 30);
  // Boards grow from 5x5 to about 8x8 over the first 35 levels, then vary.
  const grow = t >= 1 ? rng.int(1, 3) : Math.round(t * 2.4);
  const w = Math.min(8, 5 + grow + (rng.next() < 0.4 ? 1 : 0));
  const h = Math.min(8, 5 + grow + (rng.next() < 0.5 ? 1 : 0));
  const pool = [...SMALL, ...MEDIUM];
  if (n >= 9) pool.push(...LARGE);
  if (n >= 30) pool.push(...HUGE);
  // A fuller board means more blocks in the way.
  const density = 0.72 + t * 0.08 + rng.next() * 0.06;
  const avg = n >= 30 ? 3.4 : n >= 9 ? 3 : 2.3;
  const blocks = Math.round((w * h * density) / avg);
  const gaps = rng.next() < 0.25 + t * 0.4 ? 1 : rng.next() < 0.8 ? 2 : 3;
  let gates = 0;
  let tip: string | undefined;
  let gapCount = gaps;
  if (n === GATE_INTRO) {
    gates = 1;
    gapCount = 2;
    tip = 'A coloured gate only lets blocks of its colour through. Other gaps take any block.';
  } else if (n > GATE_INTRO && rng.next() < 0.35) {
    gapCount = Math.max(2, gaps);
    gates = rng.int(1, gapCount - 1);
  }
  // Setup moves ramp up from 1 to about 6, then vary, with the odd breather.
  let target = t >= 1 ? rng.int(2, 9) : Math.round(1 + t * 5 + rng.next() * 2);
  if (rng.next() < 0.1) target = rng.int(0, 2);
  if (n === GATE_INTRO) target = 1;
  return { w, h, blocks, pool, gaps: gapCount, gapMin: 1, gapMax: rng.next() < 0.25 ? 3 : 2, gates, target, tip };
}

/**
 * Label from the setup count: moves in the shortest solution that do not take a block
 * out. Every block costs one move to leave; anything more is a block that had to be moved
 * out of the way first, and those are the moves that take working out.
 */
export const SQUEEZE_THRESHOLDS = [2, 4, 6];

export function rateSqueeze(setup: number): Difficulty {
  if (setup < SQUEEZE_THRESHOLDS[0]) return 'Easy';
  if (setup < SQUEEZE_THRESHOLDS[1]) return 'Medium';
  if (setup < SQUEEZE_THRESHOLDS[2]) return 'Hard';
  return 'Super Hard';
}
