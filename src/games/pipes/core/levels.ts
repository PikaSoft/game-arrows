import { Rng } from '../../../shared/rng';
import { pipeSpecFor, PipeSpec, ratePipes, TUTORIAL_COUNT } from './difficulty';
import { degree, parFor, rotateBy } from './rules';
import { rate, search } from './solver';
import { spanningTree } from './tree';
import { PipeLevel } from './types';

interface Candidate {
  solution: number[];
  source: number;
  score: number;
}

/**
 * Grow random pipe networks and keep the one whose score is closest to `target`. Only
 * boards with exactly one solution that can be reasoned out without guessing count.
 * Work is capped by attempts and solver nodes, not time, so every device builds the
 * same board for the same level.
 */
export function generate(spec: PipeSpec, rng: Rng, target: number): Candidate {
  const { w, h } = spec;
  let best: Candidate | null = null;
  let work = 0;
  const off = (c: Candidate) => Math.abs(c.score - target);
  for (let attempt = 0; attempt < 120 && work < 60000; attempt++) {
    // The source sits away from the edge, so water spreads in more than one direction.
    const sx = rng.int(Math.min(1, w - 1), Math.max(0, w - 2));
    const sy = rng.int(Math.min(1, h - 1), Math.max(0, h - 2));
    const source = sy * w + sx;
    const solution = spanningTree(w, h, source, rng, spec.straight, spec.branchy);
    const s = search(w, h, solution, 2, 4000);
    work += s.nodes + 20;
    if (s.count !== 1 || s.exhausted) continue;
    const r = rate(w, h, solution);
    if (!r) continue;
    const c = { solution, source, score: r.score };
    if (!best || off(c) < off(best)) best = c;
    if (off(best) < 0.05) break;
  }
  if (best) return best;
  // Should not happen: almost every network has one solution. Fall back to straight runs.
  return generate({ ...spec, straight: 1, branchy: 1 }, rng, target);
}

/** Turn each tile at random so the board starts scrambled. Most tiles start wrong. */
export function scramble(solution: number[], rng: Rng): number[] {
  return solution.map((m) => {
    if (degree(m) === 4) return m;
    let k = rng.next() < 0.88 ? rng.int(1, 3) : 0;
    // A straight pipe turned half way looks the same; give it a quarter turn instead.
    if (rotateBy(m, k) === m && k !== 0) k = rng.next() < 0.5 ? 1 : 3;
    return rotateBy(m, k);
  });
}

export function buildPipeLevel(n: number): PipeLevel {
  const spec = pipeSpecFor(n);
  const rng = new Rng(n * 104729 + 7);
  const c = generate(spec, rng, spec.target);
  let tiles = scramble(c.solution, rng);
  // Never hand out a board that is already solved (only possible on tiny ones).
  if (tiles.every((m, i) => m === c.solution[i])) tiles = tiles.map((m) => rotateBy(m, 1));
  // The label comes from the score as stored, so the two always agree.
  const score = Math.round(c.score * 100) / 100;
  return {
    number: n,
    w: spec.w,
    h: spec.h,
    tiles,
    source: c.source,
    solution: c.solution,
    par: parFor(tiles, c.solution),
    difficulty: n <= TUTORIAL_COUNT ? 'Tutorial' : ratePipes(score),
    score,
    tip: spec.tip,
  };
}
