import { Rng } from '../../../shared/rng';
import { COLOR_COUNT, rateSqueeze, squeezeSpecFor, SqueezeSpec, TUTORIAL_COUNT } from './difficulty';
import { Board, fits, hasExit, occupancy } from './rules';
import { SHAPES } from './shapes';
import { lastExplored, solve, startPos } from './solver';
import { Block, Gap, SIDES, SqueezeLevel } from './types';

interface Candidate {
  blocks: Block[];
  gaps: Gap[];
  par: number;
  setup: number;
  explored: number;
}

/** Cut the gaps into the frame: never two on one side that touch. */
export function makeGaps(spec: SqueezeSpec, rng: Rng): Gap[] {
  const gaps: Gap[] = [];
  const sides = rng.shuffle(SIDES.slice());
  for (let k = 0; k < spec.gaps; k++) {
    const side = sides[k % 4];
    const length = side === 'top' || side === 'bottom' ? spec.w : spec.h;
    for (let tries = 0; tries < 20; tries++) {
      const len = Math.min(length - 1, rng.int(spec.gapMin, spec.gapMax));
      const start = rng.int(0, length - len);
      const clash = gaps.some((g) => g.side === side && start <= g.start + g.len && g.start <= start + len);
      if (clash) continue;
      gaps.push({ side, start, len, color: null });
      break;
    }
  }
  // Gates take distinct colours.
  const colours = rng.shuffle([...Array(COLOR_COUNT).keys()]);
  rng.shuffle(gaps.slice()).slice(0, spec.gates).forEach((g, i) => (g.color = colours[i]));
  return gaps;
}

/** Drop blocks onto the board at random until it holds as many as the spec wants. */
export function scatter(spec: SqueezeSpec, gaps: Gap[], rng: Rng): Block[] {
  const board: Board = { w: spec.w, h: spec.h, gaps };
  const gateColours = gaps.filter((g) => g.color !== null).map((g) => g.color!);
  const free = [...Array(COLOR_COUNT).keys()].filter((c) => !gateColours.includes(c));
  const anyGap = gaps.some((g) => g.color === null);
  const blocks: Block[] = [];
  for (let tries = 0; tries < spec.blocks * 12 && blocks.length < spec.blocks; tries++) {
    const shape = rng.pick(spec.pool);
    // Most blocks are free colours; on gate levels some wear a gate's colour.
    const color = gateColours.length && (!anyGap || rng.next() < 0.4) ? rng.pick(gateColours) : rng.pick(free);
    const b: Block = { shape, color, x: 0, y: 0 };
    if (!hasExit(board, b)) continue;
    const occ = occupancy(board, blocks, startPos(blocks));
    const sh = SHAPES[shape];
    const spots: [number, number][] = [];
    for (let y = 0; y + sh.h <= spec.h; y++) for (let x = 0; x + sh.w <= spec.w; x++) if (fits(board, occ, shape, x, y)) spots.push([x, y]);
    if (!spots.length) continue;
    [b.x, b.y] = rng.pick(spots);
    blocks.push(b);
  }
  return blocks;
}

/**
 * Deal boards at random and keep the solvable one whose setup count is closest to
 * `target`. The work is capped by solver states rather than time, so every device
 * builds the same board for the same level.
 */
export function generate(spec: SqueezeSpec, rng: Rng, target: number): Candidate {
  let best: Candidate | null = null;
  let work = 0;
  const off = (c: Candidate) => Math.abs(c.setup - target);
  for (let attempt = 0; attempt < 400 && work < 35000; attempt++) {
    const gaps = makeGaps(spec, rng);
    const blocks = scatter(spec, gaps, rng);
    if (blocks.length < spec.blocks - 1) continue;
    const board: Board = { w: spec.w, h: spec.h, gaps };
    const res = solve(board, blocks, startPos(blocks), 4000);
    work += lastExplored + 50;
    if (!res) continue;
    const par = res.moves.length;
    const c = { blocks, gaps, par, setup: par - blocks.length, explored: res.explored };
    if (!best || off(c) < off(best) || (off(c) === off(best) && c.explored > best.explored)) best = c;
    if (off(best) === 0) break;
  }
  if (best) return best;
  // Crowded boards can fail to come out solvable; try again with one block fewer.
  return generate({ ...spec, blocks: spec.blocks - 1 }, rng, target);
}

export function buildSqueezeLevel(n: number): SqueezeLevel {
  const spec = squeezeSpecFor(n);
  const rng = new Rng(n * 15485863 + 11);
  const tutorial = n <= TUTORIAL_COUNT;
  const c = generate(spec, rng, spec.target);
  return {
    number: n,
    w: spec.w,
    h: spec.h,
    blocks: c.blocks,
    gaps: c.gaps,
    par: c.par,
    difficulty: tutorial ? 'Tutorial' : rateSqueeze(c.setup),
    score: c.setup,
    tip: spec.tip,
  };
}
