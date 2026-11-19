import { Rng } from '../../../shared/rng';
import { CagesSpec, cagesScore, cagesSpecFor, rateCages, tierFor, TUTORIAL_COUNT } from './difficulty';
import { targetOf } from './rules';
import { solveLogic, TIER_NAMES } from './solver';
import { Cage, CagesLevel, Op } from './types';

/** A random Latin square: a shifted base square with rows, columns and numbers shuffled. */
export function latinSquare(size: number, rng: Rng): number[] {
  const rows = rng.shuffle([...Array(size).keys()]);
  const cols = rng.shuffle([...Array(size).keys()]);
  const nums = rng.shuffle([...Array(size).keys()].map((k) => k + 1));
  const out: number[] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) out.push(nums[(rows[y] + cols[x]) % size]);
  return out;
}

/**
 * Split the grid into cages: take squares in a random order and grow a cage from each
 * free one by adding free neighbours, up to a random size. Only a few one-square cages
 * are allowed, since each gives its number away.
 */
export function carveCages(size: number, spec: CagesSpec, rng: Rng): number[][] {
  const owner = new Int16Array(size * size).fill(-1);
  const cages: number[][] = [];
  let singles = 0;
  for (const start of rng.shuffle([...Array(size * size).keys()])) {
    if (owner[start] >= 0) continue;
    const want = rng.int(2, spec.maxCage);
    const cells = [start];
    owner[start] = cages.length;
    while (cells.length < want) {
      const edge: number[] = [];
      for (const i of cells) {
        const x = i % size;
        const y = (i / size) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < size && ny < size && owner[ny * size + nx] < 0) edge.push(ny * size + nx);
        }
      }
      if (!edge.length) break;
      const next = rng.pick(edge);
      owner[next] = cages.length;
      cells.push(next);
    }
    if (cells.length === 1) {
      // Too many singles: join a neighbouring cage instead.
      if (singles >= spec.singles) {
        const x = start % size;
        const y = (start / size) | 0;
        const n = [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .map(([dx, dy]) => [x + dx, y + dy])
          .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < size && ny < size)
          .map(([nx, ny]) => owner[ny * size + nx])
          .filter((o) => o >= 0 && o !== cages.length && cages[o].length < spec.maxCage + 1);
        if (n.length) {
          const o = rng.pick(n);
          owner[start] = o;
          cages[o].push(start);
          continue;
        }
      }
      singles++;
    }
    cages.push(cells);
  }
  return cages;
}

/** A sign for a cage that its numbers allow. Two-square cages favour − and ÷ when they work. */
function pickOp(values: number[], spec: CagesSpec, rng: Rng): Op {
  if (values.length === 1) return '=';
  const ok: Op[] = [];
  if (spec.ops.includes('+')) ok.push('+');
  if (spec.ops.includes('x') && values.reduce((a, b) => a * b, 1) <= 1000) ok.push('x');
  if (values.length === 2) {
    if (spec.ops.includes('-')) ok.push('-', '-');
    const [hi, lo] = values[0] > values[1] ? values : [values[1], values[0]];
    if (spec.ops.includes('/') && hi % lo === 0) ok.push('/', '/', '/');
  }
  return rng.pick(ok.length ? ok : ['+']);
}

interface Candidate {
  cages: Cage[];
  solution: number[];
  score: number;
  hardest: number;
}

/** Of many boards, keep the first that needs exactly the target, else the closest below it. */
export function generate(spec: CagesSpec, rng: Rng, tries = spec.target >= 3 ? 150 : 120): Candidate | null {
  let best: Candidate | null = null;
  for (let k = 0; k < tries; k++) {
    const solution = latinSquare(spec.size, rng);
    const cages: Cage[] = carveCages(spec.size, spec, rng).map((cells) => {
      const values = cells.map((i) => solution[i]);
      const op = pickOp(values, spec, rng);
      return { cells, op, target: targetOf(op, values) };
    });
    const r = solveLogic({ size: spec.size, cages }, tierFor(spec.target));
    if (!r.grid) continue;
    const score = cagesScore(r.hardest, r.trials);
    if (score > spec.target) continue;
    if (!best || score > best.score) best = { cages, solution, score, hardest: r.hardest };
    if (score === spec.target) break;
  }
  return best;
}

export function buildCagesLevel(n: number): CagesLevel {
  const spec = cagesSpecFor(n);
  const rng = new Rng(n * 3929 + 17);
  let c = generate(spec, rng);
  // No board found at that difficulty: try one step harder at a time.
  for (let t = spec.target + 1; !c && t <= 4; t++) c = generate({ ...spec, target: t }, rng);
  for (let k = 0; !c && k < 10; k++) c = generate({ ...spec, target: 4 }, rng);
  return {
    number: n,
    size: spec.size,
    cages: c!.cages,
    solution: c!.solution,
    difficulty: n <= TUTORIAL_COUNT ? 'Tutorial' : rateCages(c!.score),
    score: c!.score,
    hardest: TIER_NAMES[c!.hardest],
    tip: spec.tip,
  };
}
