import { Rng } from '../../../shared/rng';
import { fenceScore, FenceSpec, fenceSpecFor, rateFence, tierFor, TUTORIAL_COUNT } from './difficulty';
import { gridOf, outline } from './grid';
import { solveLogic, TIER_NAMES } from './solver';
import { FenceLevel } from './types';

/**
 * Grow a blob of squares whose outline is one loop: start with one square and keep adding
 * neighbours, but only where the blob stays free of holes (every square outside can still
 * reach the border) and never touches itself only at a corner (which would make the fence
 * meet itself at a dot).
 */
export function growShape(w: number, h: number, fill: number, rng: Rng): boolean[] {
  const inside = new Array<boolean>(w * h).fill(false);
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && inside[y * w + x];
  inside[rng.int(0, h - 1) * w + rng.int(0, w - 1)] = true;
  let count = 1;
  const want = Math.max(2, Math.round(w * h * fill));
  const cornerOk = (x: number, y: number) => {
    // Every 2x2 block round the new square must not be "two on the diagonal only".
    for (const [bx, by] of [[x - 1, y - 1], [x, y - 1], [x - 1, y], [x, y]]) {
      const a = at(bx, by);
      const b = at(bx + 1, by);
      const c = at(bx, by + 1);
      const d = at(bx + 1, by + 1);
      if ((a && d && !b && !c) || (b && c && !a && !d)) return false;
    }
    return true;
  };
  const noHoles = () => {
    // Every outside square must reach the border through outside squares.
    const seen = new Uint8Array(w * h);
    const stack: number[] = [];
    for (let i = 0; i < w * h; i++) {
      const x = i % w;
      const y = (i / w) | 0;
      if (!inside[i] && (x === 0 || y === 0 || x === w - 1 || y === h - 1)) {
        seen[i] = 1;
        stack.push(i);
      }
    }
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i / w) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (!inside[j] && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    for (let i = 0; i < w * h; i++) if (!inside[i] && !seen[i]) return false;
    return true;
  };
  for (let tries = 0; count < want && tries < w * h * 40; tries++) {
    const edge: number[] = [];
    for (let i = 0; i < w * h; i++) {
      if (inside[i]) continue;
      const x = i % w;
      const y = (i / w) | 0;
      if (at(x + 1, y) || at(x - 1, y) || at(x, y + 1) || at(x, y - 1)) edge.push(i);
    }
    if (!edge.length) break;
    const i = rng.pick(edge);
    inside[i] = true;
    if (cornerOk(i % w, (i / w) | 0) && noHoles()) count++;
    else inside[i] = false;
  }
  return inside;
}

interface Candidate {
  clues: number[];
  solution: boolean[];
  score: number;
  hardest: number;
}

/** Clues the trial-and-error pass may try to remove, after the easier pass. */
export const TRIAL_REMOVALS = 15;

/**
 * Write every square's count, then take clues away in a seeded random order, keeping each
 * removal only if the reasoning solver still finishes with nothing harder than allowed.
 * Trial and error is slow to check, so it gets a short last pass.
 */
function carve(spec: FenceSpec, rng: Rng): Candidate | null {
  const g = gridOf(spec.w, spec.h);
  const inside = growShape(spec.w, spec.h, spec.fill, rng);
  const solution = outline(g, inside);
  const clues = g.cellEdges.map((es) => es.filter((e) => solution[e]).length);
  const p = { w: spec.w, h: spec.h, clues };
  // If even the full set of clues needs more than the target allows, use the easiest step that works.
  let maxTier = tierFor(spec.target);
  while (maxTier < 4 && !solveLogic(p, maxTier).on) maxTier++;
  // The score of the full board: removals can't make it easier than that.
  const full = solveLogic(p, maxTier);
  const floor = full.on ? fenceScore(full.hardest, full.trials, full.sides) : 4;
  for (const tier of maxTier >= 4 ? [3, 4] : [maxTier]) {
    let order = rng.shuffle(clues.map((_, i) => i).filter((i) => clues[i] >= 0));
    if (tier === 4) order = order.slice(0, TRIAL_REMOVALS);
    for (const i of order) {
      const v = clues[i];
      clues[i] = -1;
      // Keep the removal only if the board still solves, and no harder than the target.
      const t = solveLogic(p, tier);
      if (!t.on || fenceScore(t.hardest, t.trials, t.sides) > Math.max(spec.target, floor)) clues[i] = v;
    }
  }
  const r = solveLogic(p, maxTier);
  if (!r.on) return null;
  return { clues, solution, score: fenceScore(r.hardest, r.trials, r.sides), hardest: r.hardest };
}

/** Of a few tries, keep one that needs exactly the target, else the closest below it, else the easiest. */
export function generate(spec: FenceSpec, rng: Rng, tries = spec.target >= 3 ? 2 : spec.target === 2 ? 12 : 4): Candidate {
  let best: Candidate | null = null;
  /** The easiest board seen, in case none is as easy as the target. */
  let easiest: Candidate | null = null;
  for (let k = 0; k < tries * 3; k++) {
    const c = carve(spec, rng);
    if (!c) continue;
    if (!easiest || c.score < easiest.score) easiest = c;
    if (c.score > spec.target) continue;
    if (!best || c.score > best.score || (c.score === best.score && c.clues.filter((v) => v >= 0).length < best.clues.filter((v) => v >= 0).length)) best = c;
    if (best.score === spec.target && (k >= tries - 1 || spec.target >= 3)) break;
  }
  return best ?? easiest!;
}

export function buildFenceLevel(n: number): FenceLevel {
  const spec = fenceSpecFor(n);
  const rng = new Rng(n * 4219 + 83);
  const c = generate(spec, rng);
  return {
    number: n,
    w: spec.w,
    h: spec.h,
    clues: c.clues,
    solution: c.solution,
    difficulty: n <= TUTORIAL_COUNT ? 'Tutorial' : rateFence(c.score),
    score: c.score,
    hardest: TIER_NAMES[c.hardest],
    tip: spec.tip,
  };
}
