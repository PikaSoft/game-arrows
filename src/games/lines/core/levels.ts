import { Rng } from '../../../shared/rng';
import { linesSpecFor, LinesSpec, rateLines, TUTORIAL_COUNT } from './difficulty';
import { growPaths } from './paths';
import { dotsOf } from './rules';
import { rate, search } from './solver';
import { LinesLevel, MAX_COLOURS } from './types';

interface Candidate {
  solution: number[][];
  score: number;
}

/**
 * Grow random sets of paths and keep the one whose score is closest to `target`. Only
 * boards with exactly one solution count. Work is capped by attempts and solver nodes,
 * not time, so every device builds the same board for the same level.
 */
export function generate(spec: LinesSpec, rng: Rng, target: number): Candidate {
  const { w, h } = spec;
  let best: Candidate | null = null;
  let work = 0;
  let found = 0;
  const off = (c: Candidate) => Math.abs(c.score - target);
  for (let attempt = 0; attempt < 400 && work < 30000; attempt++) {
    const solution = growPaths(w, h, spec.colours, 3, rng);
    work += 5;
    if (!solution || solution.length > MAX_COLOURS) continue;
    const s = search(w, h, dotsOf(solution), 2, 6000);
    work += s.nodes;
    if (s.count !== 1 || s.exhausted) continue;
    const c = { solution, score: rate(w, h, solution).score };
    found++;
    if (!best || off(c) < off(best)) best = c;
    if (off(best) < 0.03 || found >= 14) break;
  }
  if (best) return best;
  // Hardly ever needed: allow two-cell lines, which almost always works.
  for (;;) {
    const solution = growPaths(w, h, spec.colours, 2, rng);
    if (!solution || solution.length > MAX_COLOURS) continue;
    const s = search(w, h, dotsOf(solution), 2, 20000);
    if (s.count === 1 && !s.exhausted) return { solution, score: rate(w, h, solution).score };
  }
}

export function buildLinesLevel(n: number): LinesLevel {
  const spec = linesSpecFor(n);
  const rng = new Rng(n * 130363 + 3);
  const c = generate(spec, rng, spec.target);
  // Colours in a shuffled but fixed order, so neighbouring levels don't all start red.
  const solution = rng.shuffle(c.solution.slice());
  // The label comes from the score as stored, so the two always agree.
  const score = Math.round(c.score * 100) / 100;
  return {
    number: n,
    w: spec.w,
    h: spec.h,
    solution,
    difficulty: n <= TUTORIAL_COUNT ? 'Tutorial' : rateLines(score),
    score,
    tip: spec.tip,
  };
}
