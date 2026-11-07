import { Rng } from '../../../shared/rng';
import { rateTents, tentsSpecFor, TentsSpec, TUTORIAL_COUNT } from './difficulty';
import { around, Board, sides } from './rules';
import { rate, search } from './solver';
import { TentsLevel } from './types';

interface Candidate {
  board: Board;
  tents: number[];
  score: number;
}

/**
 * Place tents at random so none touch, give each one a tree beside it on a free square,
 * and count the tents per row and column. Keep only boards with exactly one answer that
 * the reasoning solver can finish, and of those the one closest to `target`.
 */
export function generate(spec: TentsSpec, rng: Rng, target: number): Candidate {
  const { w, h } = spec;
  const n = w * h;
  let best: Candidate | null = null;
  const off = (c: Candidate) => Math.abs(c.score - target);
  for (let attempt = 0; attempt < 150; attempt++) {
    const want = Math.max(2, Math.round(n * spec.density));
    const used = new Uint8Array(n); // 1 tent, 2 tree
    const tents: number[] = [];
    const trees: number[] = [];
    for (const i of rng.shuffle([...Array(n).keys()])) {
      if (tents.length >= want) break;
      if (used[i] || around(w, h, i).some((o) => used[o] === 1)) continue;
      const spots = sides(w, h, i).filter((c) => !used[c]);
      if (!spots.length) continue;
      const tree = rng.pick(spots);
      used[i] = 1;
      used[tree] = 2;
      tents.push(i);
      trees.push(tree);
    }
    if (tents.length < want - 1) continue;
    trees.sort((a, b) => a - b);
    tents.sort((a, b) => a - b);
    const board: Board = {
      w,
      h,
      trees,
      rowCounts: Array.from({ length: h }, (_, y) => tents.filter((t) => ((t / w) | 0) === y).length),
      colCounts: Array.from({ length: w }, (_, x) => tents.filter((t) => t % w === x).length),
    };
    const s = search(board, 2, 60000);
    if (s.count !== 1 || s.exhausted) continue;
    const r = rate(board);
    if (!r.solved) continue;
    const c = { board, tents, score: r.score };
    if (!best || off(c) < off(best)) best = c;
    if (off(best) < 0.05) break;
  }
  if (best) return best;
  return generate({ ...spec, density: spec.density + 0.02 }, rng, target);
}

export function buildTentsLevel(n: number): TentsLevel {
  const spec = tentsSpecFor(n);
  const c = generate(spec, new Rng(n * 70841 + 13), spec.target);
  const score = Math.round(c.score * 100) / 100;
  return {
    number: n,
    w: spec.w,
    h: spec.h,
    trees: c.board.trees,
    tents: c.tents,
    rowCounts: c.board.rowCounts,
    colCounts: c.board.colCounts,
    difficulty: n <= TUTORIAL_COUNT ? 'Tutorial' : rateTents(score),
    score,
    tip: spec.tip,
  };
}
