import { Rng } from '../../../shared/rng';
import { Board } from './rules';

/**
 * A random set of stars that follows the row, column and touching rules: row by row,
 * `per` columns each, never side by side or touching the row above, with every column
 * ending on exactly `per`. Backtracking with the order shuffled by the seed.
 */
export function placeStars(size: number, per: number, rng: Rng): number[] | null {
  const cols = new Int32Array(size);
  const rows: number[][] = [];
  const combos: number[][] = [];
  const pick = (start: number, chosen: number[]) => {
    if (chosen.length === per) {
      if (chosen.every((c, k) => k === 0 || c - chosen[k - 1] > 1)) combos.push(chosen.slice());
      return;
    }
    for (let c = start; c < size; c++) {
      chosen.push(c);
      pick(c + 1, chosen);
      chosen.pop();
    }
  };
  pick(0, []);
  let nodes = 0;
  const go = (y: number): boolean => {
    if (++nodes > 20000) return false;
    if (y === size) return [...cols].every((v) => v === per);
    const above = y ? rows[y - 1] : [];
    for (const choice of rng.shuffle(combos.slice())) {
      if (choice.some((c) => cols[c] >= per || above.some((a) => Math.abs(a - c) <= 1))) continue;
      for (const c of choice) cols[c]++;
      // Every column must still be able to reach `per` with the rows left.
      if ([...cols].every((v) => v + (size - 1 - y) >= per)) {
        rows.push(choice);
        if (go(y + 1)) return true;
        rows.pop();
      }
      for (const c of choice) cols[c]--;
    }
    return false;
  };
  if (!go(0)) return null;
  return rows.flatMap((cs, y) => cs.map((c) => y * size + c));
}

/**
 * Grow `size` regions over the grid. With one star per region, each star seeds its own
 * region; with two, stars are paired with a near neighbour and grow one region together.
 * Regions take turns claiming a square beside them, the smaller ones more often, so they
 * come out irregular but not too uneven. Null if a pair's region didn't join up.
 */
export function growRegions(size: number, per: number, stars: number[], rng: Rng): Board | null {
  const n = size * size;
  const regions = new Array<number>(n).fill(-1);
  const xy = (i: number) => [i % size, (i / size) | 0];
  const dist = (a: number, b: number) => {
    const [ax, ay] = xy(a);
    const [bx, by] = xy(b);
    return Math.abs(ax - bx) + Math.abs(ay - by);
  };
  // Seeds: each star alone, or stars paired with the nearest one still free.
  const groups: number[][] = [];
  if (per === 1) for (const s of stars) groups.push([s]);
  else {
    const free = rng.shuffle(stars.slice());
    while (free.length) {
      const a = free.pop()!;
      free.sort((p, q) => dist(a, q) - dist(a, p));
      const b = free.pop();
      if (b === undefined || dist(a, b) > 4) return null;
      groups.push([a, b]);
    }
  }
  groups.forEach((g, r) => g.forEach((s) => (regions[s] = r)));
  const sizes = groups.map((g) => g.length);
  const step = [-size, 1, size, -1];
  const frontier = (r: number) => {
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      if (regions[i] !== r) continue;
      for (const d of step) {
        const j = i + d;
        if (j < 0 || j >= n || regions[j] !== -1) continue;
        if ((d === 1 && j % size === 0) || (d === -1 && i % size === 0)) continue;
        out.push(j);
      }
    }
    return out;
  };
  for (let guard = 0; guard < n * 4 && regions.includes(-1); guard++) {
    // Smaller regions are likelier to grow.
    const weights = sizes.map((s) => 1 / (s * s));
    let pickR = rng.next() * weights.reduce((a, b) => a + b, 0);
    let r = 0;
    for (; r < weights.length - 1; r++) {
      pickR -= weights[r];
      if (pickR <= 0) break;
    }
    const f = frontier(r);
    if (!f.length) {
      sizes[r] = 1e9; // boxed in: let the others grow
      continue;
    }
    regions[rng.pick(f)] = r;
    sizes[r]++;
  }
  if (regions.includes(-1)) return null;
  // A pair's region must be one piece.
  for (let r = 0; r < groups.length; r++) {
    const cells = regions.map((v, i) => (v === r ? i : -1)).filter((i) => i >= 0);
    const seen = new Set([cells[0]]);
    const stack = [cells[0]];
    while (stack.length) {
      const i = stack.pop()!;
      for (const d of step) {
        const j = i + d;
        if (j < 0 || j >= n || regions[j] !== r || seen.has(j)) continue;
        if ((d === 1 && j % size === 0) || (d === -1 && i % size === 0)) continue;
        seen.add(j);
        stack.push(j);
      }
    }
    if (seen.size !== cells.length) return null;
  }
  return { size, per, regions };
}

/** True if region r is one connected piece. */
function connected(size: number, regions: number[], r: number): boolean {
  const cells = regions.map((v, i) => (v === r ? i : -1)).filter((i) => i >= 0);
  if (!cells.length) return false;
  const seen = new Set([cells[0]]);
  const stack = [cells[0]];
  while (stack.length) {
    const i = stack.pop()!;
    for (const j of sideNeighbours(size, i)) {
      if (regions[j] !== r || seen.has(j)) continue;
      seen.add(j);
      stack.push(j);
    }
  }
  return seen.size === cells.length;
}

function sideNeighbours(size: number, i: number): number[] {
  const x = i % size;
  const y = (i / size) | 0;
  const out: number[] = [];
  if (y > 0) out.push(i - size);
  if (x < size - 1) out.push(i + 1);
  if (y < size - 1) out.push(i + size);
  if (x > 0) out.push(i - 1);
  return out;
}

/**
 * Nudge region borders until the intended stars are the only answer. While a second
 * answer exists, take one of its stars that isn't an intended star and hand that square
 * to a neighbouring region (keeping every region in one piece). The intended stars don't
 * move, so they still fit; the other answer now has a region with too many or too few.
 * `count` finds answers (up to 2) and returns them. Null if it doesn't settle in time.
 */
export function repair(b: Board, stars: number[], rng: Rng, count: (b: Board) => number[][] | null, tries = 80): Board | null {
  const regions = b.regions.slice();
  const intended = new Set(stars);
  for (let t = 0; t < tries; t++) {
    const found = count({ ...b, regions });
    if (!found) return null; // the search gave up
    const other = found.find((s) => s.some((i) => !intended.has(i)));
    if (!other) return { ...b, regions };
    const moved = rng.shuffle(other.filter((i) => !intended.has(i))).some((s) => {
      const from = regions[s];
      for (const j of rng.shuffle(sideNeighbours(b.size, s))) {
        const to = regions[j];
        if (to === from) continue;
        regions[s] = to;
        if (connected(b.size, regions, from) && connected(b.size, regions, to)) return true;
        regions[s] = from;
      }
      return false;
    });
    if (!moved) return null;
  }
  return null;
}
