/** The board shape the rules need. */
export interface Board {
  w: number;
  h: number;
  trees: number[];
  rowCounts: number[];
  colCounts: number[];
}

/** Side neighbours (up, right, down, left) of square i that are on the board. */
export function sides(w: number, h: number, i: number): number[] {
  const x = i % w;
  const y = (i / w) | 0;
  const out: number[] = [];
  if (y > 0) out.push(i - w);
  if (x < w - 1) out.push(i + 1);
  if (y < h - 1) out.push(i + w);
  if (x > 0) out.push(i - 1);
  return out;
}

/** All eight neighbours of square i that are on the board. */
export function around(w: number, h: number, i: number): number[] {
  const x = i % w;
  const y = (i / w) | 0;
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h) out.push(ny * w + nx);
    }
  }
  return out;
}

/**
 * Can every tent be paired with its own tree beside it, one to one? Bipartite matching
 * by augmenting paths. Only meaningful once there are as many tents as trees.
 */
export function pairable(b: Board, tents: number[]): boolean {
  if (tents.length !== b.trees.length) return false;
  const treeAt = new Map(b.trees.map((t, k) => [t, k]));
  const owner = new Array<number>(b.trees.length).fill(-1);
  const options = tents.map((t) => sides(b.w, b.h, t).map((c) => treeAt.get(c)).filter((k): k is number => k !== undefined));
  const tryTent = (ti: number, seen: boolean[]): boolean => {
    for (const k of options[ti]) {
      if (seen[k]) continue;
      seen[k] = true;
      if (owner[k] < 0 || tryTent(owner[k], seen)) {
        owner[k] = ti;
        return true;
      }
    }
    return false;
  };
  return tents.every((_, ti) => tryTent(ti, new Array(b.trees.length).fill(false)));
}

/** True if a set of tents follows every rule. */
export function valid(b: Board, tents: number[]): boolean {
  const set = new Set(tents);
  const trees = new Set(b.trees);
  if (tents.some((t) => trees.has(t))) return false;
  for (const t of tents) if (around(b.w, b.h, t).some((c) => set.has(c))) return false;
  for (let y = 0; y < b.h; y++) if (tents.filter((t) => ((t / b.w) | 0) === y).length !== b.rowCounts[y]) return false;
  for (let x = 0; x < b.w; x++) if (tents.filter((t) => t % b.w === x).length !== b.colCounts[x]) return false;
  return pairable(b, tents);
}
