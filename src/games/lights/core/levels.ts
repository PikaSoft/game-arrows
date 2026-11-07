import { Rng } from '../../../shared/rng';
import { lightsScore, lightsSpecFor, LightsSpec, rateLights, TUTORIAL_COUNT } from './difficulty';
import { press } from './rules';
import { solveMin } from './solver';
import { LightsLevel } from './types';

interface Candidate {
  board: number[];
  par: number;
}

/**
 * Start with every light off and tap tiles at random: the board that comes out can always
 * be solved, by tapping the same tiles again (or as many more times as brings them round).
 * The solver then finds the true fewest taps, which can be fewer than were made. Keep the
 * board whose par is closest to `target`.
 */
export function generate(spec: LightsSpec, rng: Rng, target: number): Candidate {
  const { w, h, pattern, states } = spec;
  const n = w * h;
  let best: Candidate | null = null;
  for (let attempt = 0; attempt < 30; attempt++) {
    let board = new Array<number>(n).fill(0);
    // Tap a few more tiles than the target: some taps cancel out.
    const taps = Math.min(n, target + rng.int(0, Math.ceil(target * 0.3)));
    const tiles = rng.shuffle([...Array(n).keys()]).slice(0, taps);
    for (const i of tiles) board = press(board, w, h, pattern, states, i, states === 3 ? rng.int(1, 2) : 1);
    if (board.every((v) => v === 0)) continue;
    const x = solveMin(w, h, pattern, states, board);
    if (!x) continue;
    const par = x.reduce((a, b) => a + b, 0);
    const c = { board, par };
    if (!best || Math.abs(par - target) < Math.abs(best.par - target)) best = c;
    if (best.par === target) break;
  }
  return best!;
}

export function buildLightsLevel(n: number): LightsLevel {
  const spec = lightsSpecFor(n);
  const rng = new Rng(n * 7727 + 31);
  const c = generate(spec, rng, spec.target);
  const score = lightsScore(c.par, spec.pattern, spec.states);
  return {
    number: n,
    w: spec.w,
    h: spec.h,
    pattern: spec.pattern,
    states: spec.states,
    board: c.board,
    par: c.par,
    difficulty: n <= TUTORIAL_COUNT ? 'Tutorial' : rateLights(score),
    score,
    tip: spec.tip,
  };
}
