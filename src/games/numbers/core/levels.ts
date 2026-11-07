import { Rng } from '../../../shared/rng';
import { numbersSpecFor, NumbersSpec, rateNumbers, TUTORIAL_COUNT } from './difficulty';
import { countSolutions, shapeOf } from './grid';
import { rateHuman } from './techniques';
import { NumbersLevel } from './types';

/** A random complete grid: backtracking with the digit order shuffled by the seed. */
export function fullGrid(size: number, rng: Rng): number[] {
  const sh = shapeOf(size);
  const g = new Array<number>(size * size).fill(0);
  const fill = (i: number): boolean => {
    if (i === g.length) return true;
    let used = 0;
    for (const p of sh.peers[i]) if (g[p]) used |= 1 << (g[p] - 1);
    for (const d of rng.shuffle([...Array(size).keys()].map((k) => k + 1))) {
      if (used & (1 << (d - 1))) continue;
      g[i] = d;
      if (fill(i + 1)) return true;
    }
    g[i] = 0;
    return false;
  };
  fill(0);
  return g;
}

interface Candidate {
  givens: number[];
  solution: number[];
  tier: number;
  hardest: string;
}

/**
 * Start from a full grid and take clues away, at first in pairs (a square and its mirror
 * through the centre, for the usual symmetric look), later one at a time. A removal stays only if the puzzle still has
 * exactly one answer and the technique solver can still finish it using nothing harder
 * than the level's tier. Of a few tries, keep one that really needs that tier, with the
 * fewest clues.
 */
export function generate(spec: NumbersSpec, rng: Rng): Candidate {
  const sh = shapeOf(spec.size);
  const n = spec.size * spec.size;
  let best: Candidate | null = null;
  // Harder tiers are rarer, so they get more tries. After the first few, drop the mirror
  // rule: removing one clue at a time leaves more room for a hard puzzle.
  const tries = [0, 6, 10, 30, 60][spec.tier];
  for (let attempt = 0; attempt < tries; attempt++) {
    const solution = fullGrid(spec.size, rng);
    const givens = solution.slice();
    const mirror = attempt < tries / 2;
    const order = rng.shuffle([...Array(mirror ? Math.ceil(n / 2) : n).keys()]);
    for (const i of order) {
      const j = mirror ? n - 1 - i : i;
      const keep = [givens[i], givens[j]];
      givens[i] = 0;
      givens[j] = 0;
      const unique = countSolutions(sh, givens, 2, 20000);
      const r = unique.count === 1 && !unique.exhausted ? rateHuman(sh, givens) : null;
      if (!r || !r.solved || r.tier > spec.tier) {
        givens[i] = keep[0];
        givens[j] = keep[1];
      }
    }
    const r = rateHuman(sh, givens);
    const c = { givens, solution, tier: r.tier, hardest: r.hardest };
    const clues = (x: Candidate) => x.givens.filter(Boolean).length;
    if (!best || (c.tier === spec.tier && (best.tier !== spec.tier || clues(c) < clues(best))) || (best.tier !== spec.tier && c.tier > best.tier)) best = c;
    if (best.tier === spec.tier) break;
  }
  return best!;
}

export function buildNumbersLevel(n: number): NumbersLevel {
  const spec = numbersSpecFor(n);
  const c = generate(spec, new Rng(n * 15731 + 89));
  return {
    number: n,
    size: spec.size,
    givens: c.givens,
    solution: c.solution,
    difficulty: n <= TUTORIAL_COUNT ? 'Tutorial' : rateNumbers(c.tier),
    score: c.tier,
    hardest: c.hardest,
    tip: spec.tip,
  };
}

