import { Rng } from '../../../shared/rng';
import { Blocks, freePairs, freeTiles } from './rules';

/**
 * Deal pictures backwards: again and again take two tiles that are free in what is left,
 * give them the same picture and lift them off. Played forwards, those pairs in reverse
 * order clear the pile, so every deal can be finished. `kinds` lists the picture for each
 * pair in the order dealt. Null if the pile jams (fewer than two free tiles).
 */
export function dealBackwards(b: Blocks, alive: boolean[], kinds: number[], rng: Rng): number[] | null {
  const left = alive.slice();
  const faces = new Array<number>(alive.length).fill(-1);
  for (const kind of kinds) {
    const free = freeTiles(b, left);
    if (free.length < 2) return null;
    const p = rng.int(0, free.length - 1);
    let q = rng.int(0, free.length - 2);
    if (q >= p) q++;
    faces[free[p]] = kind;
    faces[free[q]] = kind;
    left[free[p]] = false;
    left[free[q]] = false;
  }
  return faces;
}

/** Share of random playthroughs (taking any free pair at random) that get stuck. */
export function deadShare(b: Blocks, faces: number[], alive: boolean[], rng: Rng, runs = 60): number {
  let stuck = 0;
  for (let r = 0; r < runs; r++) {
    const a = alive.slice();
    let left = a.filter(Boolean).length;
    while (left > 0) {
      const pairs = freePairs(b, a, faces);
      if (!pairs.length) {
        stuck++;
        break;
      }
      const [p, q] = rng.pick(pairs);
      a[p] = false;
      a[q] = false;
      left -= 2;
    }
  }
  return stuck / runs;
}

export interface Path {
  /** A way to clear the rest, pair by pair, or null if there is none (or the search gave up). */
  pairs: [number, number][] | null;
  /** True if the search ran out of steps before deciding. */
  capped: boolean;
}

/**
 * Look for a way to clear what is left. Depth first, trying first the pairs that free the
 * most tiles, and remembering positions already found to be dead ends. Capped by steps.
 */
export function findPath(b: Blocks, faces: number[], alive: boolean[], maxSteps = 20_000): Path {
  const a = alive.slice();
  const dead = new Set<string>();
  let steps = 0;
  let capped = false;
  const key = () => a.map((v) => (v ? 1 : 0)).join('');
  const path: [number, number][] = [];
  const go = (left: number): boolean => {
    if (left === 0) return true;
    if (++steps > maxSteps) {
      capped = true;
      return false;
    }
    const k = key();
    if (dead.has(k)) return false;
    const pairs = freePairs(b, a, faces);
    // Pairs that uncover more tiles first.
    const gain = (p: [number, number]) => {
      a[p[0]] = false;
      a[p[1]] = false;
      const n = freeTiles(b, a).length;
      a[p[0]] = true;
      a[p[1]] = true;
      return n;
    };
    const scored = pairs.map((p) => [gain(p), p] as const).sort((x, y) => y[0] - x[0]);
    for (const [, p] of scored) {
      a[p[0]] = false;
      a[p[1]] = false;
      path.push(p);
      if (go(left - 2)) return true;
      path.pop();
      a[p[0]] = true;
      a[p[1]] = true;
      if (capped) return false;
    }
    dead.add(k);
    return false;
  };
  const ok = go(a.filter(Boolean).length);
  return { pairs: ok ? path.slice() : null, capped };
}
