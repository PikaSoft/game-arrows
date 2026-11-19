import { Rng } from '../../../shared/rng';
import { rateTones, TonesSpec, tonesSpecFor, TUTORIAL_COUNT } from './difficulty';
import { validLines } from './rules';
import { solveLogic, TIER_NAMES } from './solver';
import { A, B, EMPTY, TonesLevel } from './types';

/**
 * A full valid grid: rows picked one by one (in a seeded random order) from the valid
 * rows, each new row keeping every column legal (no three in a row, never over half of
 * a tone) and different from the rows above. Columns are checked for copies at the end.
 * Capped by steps; null if the cap is hit.
 */
export function fullGrid(size: number, rng: Rng, maxSteps = 200_000): number[] | null {
  const rows = rng.shuffle(Array.from(validLines(size)));
  const half = size / 2;
  const chosen: number[] = [];
  const colA = new Array<number>(size).fill(0);
  let steps = 0;
  const fits = (m: number): boolean => {
    const y = chosen.length;
    for (let x = 0; x < size; x++) {
      const bit = (m >> x) & 1;
      const a = colA[x] + bit;
      if (a > half || y + 1 - a > half) return false;
      if (y >= 2) {
        const p = (chosen[y - 1] >> x) & 1;
        const q = (chosen[y - 2] >> x) & 1;
        if (p === q && q === bit) return false;
      }
    }
    return !chosen.includes(m);
  };
  const colsDistinct = (): boolean => {
    const seen = new Set<number>();
    for (let x = 0; x < size; x++) {
      let c = 0;
      for (let y = 0; y < size; y++) c |= ((chosen[y] >> x) & 1) << y;
      if (seen.has(c)) return false;
      seen.add(c);
    }
    return true;
  };
  const place = (): boolean => {
    if (++steps > maxSteps) return false;
    if (chosen.length === size) return colsDistinct();
    // Start from a different spot in the shuffled list for each row, so rows vary.
    const off = rng.int(0, rows.length - 1);
    for (let k = 0; k < rows.length; k++) {
      const m = rows[(off + k) % rows.length];
      if (!fits(m)) continue;
      chosen.push(m);
      for (let x = 0; x < size; x++) colA[x] += (m >> x) & 1;
      if (place()) return true;
      chosen.pop();
      for (let x = 0; x < size; x++) colA[x] -= (m >> x) & 1;
      if (steps > maxSteps) return false;
    }
    return false;
  };
  if (!place()) return null;
  const grid: number[] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) grid.push((chosen[y] >> x) & 1 ? A : B);
  return grid;
}

/** Clues the trial-and-error pass may try to remove, after the tier 4 pass. */
export const TRIAL_REMOVALS = 12;

interface Candidate {
  givens: number[];
  solution: number[];
  hardest: number;
  clues: number;
}

/**
 * Take clues away in a seeded random order, keeping each removal only if the reasoning
 * solver can still finish without anything harder than the spec's tier. What is left
 * has one answer.
 */
function carve(spec: TonesSpec, rng: Rng): Candidate | null {
  const solution = fullGrid(spec.size, rng);
  if (!solution) return null;
  const givens = solution.slice();
  // Cheap tiers first: trial and error is slow, so it only gets a final pass.
  const passes = spec.tier >= 5 ? [4, 5] : [spec.tier];
  for (const tier of passes) {
    let order = rng.shuffle(givens.map((_, i) => i).filter((i) => givens[i] !== EMPTY));
    // Trial and error is slow to check, so it only gets a few removals.
    if (tier === 5) order = order.slice(0, TRIAL_REMOVALS);
    for (const i of order) {
      const v = givens[i];
      givens[i] = EMPTY;
      if (!solveLogic(spec.size, givens, tier).grid) givens[i] = v;
    }
  }
  const r = solveLogic(spec.size, givens, spec.tier);
  if (!r.grid) return null;
  return { givens, solution, hardest: r.hardest, clues: givens.filter((v) => v !== EMPTY).length };
}

/** Of a few tries, keep one that needs exactly the spec's tier, with the fewest clues. */
export function generate(spec: TonesSpec, rng: Rng): Candidate {
  const tries = spec.tier >= 5 ? 3 : spec.tier >= 3 ? 5 : 3;
  let best: Candidate | null = null;
  const better = (c: Candidate, b: Candidate | null) =>
    !b ||
    (c.hardest === spec.tier) !== (b.hardest === spec.tier)
      ? !b || c.hardest === spec.tier
      : c.hardest !== b.hardest
        ? c.hardest > b.hardest
        : c.clues < b.clues;
  // Trial-and-error boards are slow to make, so the first one that needs it is kept.
  const enough = (k: number) => !!best && best.hardest === spec.tier && (k >= tries || spec.tier >= 5);
  for (let k = 0; k < tries * 3 && !enough(k); k++) {
    const c = carve(spec, rng);
    if (c && better(c, best)) best = c;
  }
  return best!;
}

export function buildTonesLevel(n: number): TonesLevel {
  const spec = tonesSpecFor(n);
  const rng = new Rng(n * 5113 + 23);
  const c = generate(spec, rng);
  return {
    number: n,
    size: spec.size,
    givens: c.givens,
    solution: c.solution,
    difficulty: n <= TUTORIAL_COUNT ? 'Tutorial' : rateTones(c.hardest),
    score: c.hardest,
    hardest: TIER_NAMES[c.hardest],
    tip: spec.tip,
  };
}
