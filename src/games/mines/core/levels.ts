import { Rng } from '../../../shared/rng';
import { HARDEST, minesScore, minesSpecFor, MinesSpec, rateMines, TUTORIAL_COUNT } from './difficulty';
import { around, numbers } from './rules';
import { solve } from './solver';
import { MinesLevel } from './types';

interface Candidate {
  mines: number[];
  start: number;
  score: number;
  hardest: number;
}

/**
 * Pick a start square near the middle, scatter mines anywhere except it and its
 * neighbours, and keep only boards the solver can finish from there without ever
 * guessing. Of those, keep the one whose score is closest to `target`.
 */
export function generate(spec: MinesSpec, rng: Rng, target: number): Candidate {
  const { w, h } = spec;
  const n = w * h;
  const count = Math.max(3, Math.round(n * spec.density));
  let best: Candidate | null = null;
  const off = (c: Candidate) => Math.abs(c.score - target);
  for (let attempt = 0; attempt < 600; attempt++) {
    const sx = rng.int(Math.floor(w / 4), Math.ceil((3 * w) / 4) - 1);
    const sy = rng.int(Math.floor(h / 4), Math.ceil((3 * h) / 4) - 1);
    const start = sy * w + sx;
    const keepClear = new Set([start, ...around(w, h, start)]);
    const mines = rng
      .shuffle([...Array(n).keys()].filter((i) => !keepClear.has(i)))
      .slice(0, count)
      .sort((a, b) => a - b);
    const nums = numbers(w, h, mines);
    const r = solve(w, h, nums, start, mines.length);
    if (!r.solved) continue;
    const c = { mines, start, score: minesScore(r.uses), hardest: r.uses[3] ? 3 : r.uses[2] ? 2 : 1 };
    if (!best || off(c) < off(best)) best = c;
    if (off(best) < 0.5) break;
  }
  if (best) return best;
  return generate({ ...spec, density: spec.density - 0.02 }, rng, target);
}

export function buildMinesLevel(n: number): MinesLevel {
  const spec = minesSpecFor(n);
  const c = generate(spec, new Rng(n * 30011 + 47), spec.target);
  return {
    number: n,
    w: spec.w,
    h: spec.h,
    mines: c.mines,
    start: c.start,
    difficulty: n <= TUTORIAL_COUNT ? 'Tutorial' : rateMines(c.score),
    score: c.score,
    hardest: HARDEST[c.hardest],
    tip: spec.tip,
  };
}
