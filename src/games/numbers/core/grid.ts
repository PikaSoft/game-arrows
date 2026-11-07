/** The shape of a board: size, box size, and for each cell its row, column and box. */
export interface Shape {
  size: number;
  boxW: number;
  boxH: number;
  /** For each cell, every other cell in its row, column or box. */
  peers: number[][];
  /** Every row, column and box, as cell lists: the units digits can't repeat in. */
  units: number[][];
  rows: number[][];
  cols: number[][];
  boxes: number[][];
  boxOf: number[];
}

const shapes = new Map<number, Shape>();

export function shapeOf(size: number): Shape {
  const hit = shapes.get(size);
  if (hit) return hit;
  const boxW = size === 6 ? 3 : 3;
  const boxH = size === 6 ? 2 : 3;
  const n = size * size;
  const rows = Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => y * size + x));
  const cols = Array.from({ length: size }, (_, x) => Array.from({ length: size }, (_, y) => y * size + x));
  const boxes: number[][] = Array.from({ length: size }, () => []);
  const boxOf: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = i % size;
    const y = (i / size) | 0;
    const b = Math.floor(y / boxH) * (size / boxW) + Math.floor(x / boxW);
    boxes[b].push(i);
    boxOf.push(b);
  }
  const units = [...rows, ...cols, ...boxes];
  const peers = Array.from({ length: n }, (_, i) => {
    const set = new Set<number>([...rows[(i / size) | 0], ...cols[i % size], ...boxes[boxOf[i]]]);
    set.delete(i);
    return [...set];
  });
  const s: Shape = { size, boxW, boxH, peers, units, rows, cols, boxes, boxOf };
  shapes.set(size, s);
  return s;
}

/** Number of set bits. */
export const bits = (m: number): number => {
  let c = 0;
  for (; m; m &= m - 1) c++;
  return c;
};
/** The digit of a single-bit mask (bit d - 1 set for digit d). */
export const digitOf = (m: number): number => 31 - Math.clz32(m) + 1;

/** Candidates for every cell of a grid: digits not already used by its peers. */
export function candidates(sh: Shape, grid: number[]): number[] {
  const all = (1 << sh.size) - 1;
  return grid.map((v, i) => {
    if (v) return 0;
    let m = all;
    for (const p of sh.peers[i]) if (grid[p]) m &= ~(1 << (grid[p] - 1));
    return m;
  });
}

/**
 * Count solutions up to `limit` by backtracking, always filling the cell with the fewest
 * options. Used to make sure a puzzle has exactly one answer. Capped by nodes.
 */
export function countSolutions(sh: Shape, grid: number[], limit = 2, budget = 200000): { count: number; first: number[] | null; exhausted: boolean } {
  const g = grid.slice();
  let count = 0;
  let first: number[] | null = null;
  let nodes = 0;
  let exhausted = false;
  const all = (1 << sh.size) - 1;
  // Givens that clash with each other mean no answer at all.
  for (let i = 0; i < g.length; i++) if (g[i] && sh.peers[i].some((p) => g[p] === g[i])) return { count: 0, first: null, exhausted: false };
  const go = (): void => {
    if (count >= limit || exhausted) return;
    if (++nodes > budget) {
      exhausted = true;
      return;
    }
    let best = -1;
    let bestMask = 0;
    let bestCount = 99;
    for (let i = 0; i < g.length; i++) {
      if (g[i]) continue;
      let m = all;
      for (const p of sh.peers[i]) if (g[p]) m &= ~(1 << (g[p] - 1));
      const c = bits(m);
      if (c < bestCount) {
        bestCount = c;
        best = i;
        bestMask = m;
        if (c <= 1) break;
      }
    }
    if (best < 0) {
      count++;
      if (!first) first = g.slice();
      return;
    }
    for (let m = bestMask; m; m &= m - 1) {
      g[best] = digitOf(m & -m);
      go();
      if (count >= limit || exhausted) break;
    }
    g[best] = 0;
  };
  go();
  return { count, first, exhausted };
}
