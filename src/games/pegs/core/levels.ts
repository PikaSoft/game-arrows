import { Rng } from '../../../shared/rng';
import { PegsSpec, pegsSpecFor, ratePegs, TUTORIAL_COUNT } from './difficulty';
import { allJumps } from './rules';
import { search } from './solver';
import { Jump, PegsLevel } from './types';

/**
 * A board shape, mirrored both ways: the union of one to three centred bars and blocks
 * (a cross, a plus with a fat middle, a wide block...). Small boards are often just full.
 */
export function shape(w: number, h: number, rng: Rng): boolean[] {
  const holes = new Array<boolean>(w * h).fill(false);
  const bars = rng.int(1, 3);
  for (let k = 0; k < bars; k++) {
    // A centred rectangle with odd sides, so it stays symmetric.
    const bw = 1 + 2 * rng.int(Math.floor(w / 4), Math.floor((w - 1) / 2));
    const bh = 1 + 2 * rng.int(Math.floor(h / 4), Math.floor((h - 1) / 2));
    const x0 = (w - bw) / 2;
    const y0 = (h - bh) / 2;
    for (let y = y0; y < y0 + bh; y++) for (let x = x0; x < x0 + bw; x++) holes[y * w + x] = true;
  }
  return holes;
}

/**
 * Build a start position backwards from one peg on the goal. A reverse jump takes a peg
 * at `to`, with `over` and `from` both empty, and puts pegs on `over` and `from` instead:
 * played forwards, that is an ordinary jump. Each reverse jump adds a peg. Returns the
 * start and the forward solution, or null if the pegs run out of room.
 */
export function buildBackwards(w: number, h: number, holes: boolean[], goal: number, pegs: number, rng: Rng): { start: boolean[]; solution: Jump[] } | null {
  const jumps = allJumps(w, h, holes);
  const state = new Array<boolean>(w * h).fill(false);
  state[goal] = true;
  const back: Jump[] = [];
  for (let k = 1; k < pegs; k++) {
    const options = jumps.filter((j) => state[j.to] && !state[j.over] && !state[j.from]);
    if (!options.length) return null;
    const j = rng.pick(options);
    state[j.to] = false;
    state[j.over] = true;
    state[j.from] = true;
    back.push(j);
  }
  return { start: state, solution: back.reverse() };
}

/** Positions the solver may look at while a level is built; boards that need more are skipped. */
export const GEN_NODES = 60_000;

interface Candidate {
  holes: boolean[];
  start: boolean[];
  goal: number;
  solution: Jump[];
  score: number;
}

/** Of up to `tries` boards, keep the one whose search effort is closest to the target. */
export function generate(spec: PegsSpec, rng: Rng, tries = 40): Candidate | null {
  let best: Candidate | null = null;
  for (let k = 0; k < tries; k++) {
    const holes = spec.h === 3 ? new Array<boolean>(spec.w * spec.h).fill(false).map((_, i) => ((i / spec.w) | 0) === 1) : shape(spec.w, spec.h, rng);
    const spots = holes.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    if (spots.length < spec.pegs + 2) continue;
    const goal = rng.pick(spots);
    const built = buildBackwards(spec.w, spec.h, holes, goal, spec.pegs, rng);
    if (!built) continue;
    const r = search(allJumps(spec.w, spec.h, holes), built.start, goal, GEN_NODES);
    if (!r.path || r.capped) continue;
    const score = Math.round(Math.log2(r.nodes + 1) * 10) / 10;
    const c = { holes, start: built.start, goal, solution: r.path, score };
    if (!best || Math.abs(score - spec.target) < Math.abs(best.score - spec.target)) best = c;
    if (Math.abs(score - spec.target) < 0.4) break;
  }
  return best;
}

export function buildPegsLevel(n: number): PegsLevel {
  const spec = pegsSpecFor(n);
  const rng = new Rng(n * 3301 + 29);
  let c = generate(spec, rng);
  for (let k = 0; !c && k < 10; k++) c = generate({ ...spec, pegs: Math.max(2, spec.pegs - 2) }, rng);
  return {
    number: n,
    w: spec.w,
    h: spec.h,
    holes: c!.holes,
    pegs: c!.start,
    goal: c!.goal,
    solution: c!.solution,
    difficulty: n <= TUTORIAL_COUNT ? 'Tutorial' : ratePegs(c!.score),
    score: c!.score,
    tip: spec.tip,
  };
}

