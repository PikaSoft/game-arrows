/** The board shape the rules need. */
export interface Board {
  size: number;
  per: number;
  regions: number[];
}

/** All eight neighbours of square i. */
export function around(size: number, i: number): number[] {
  const x = i % size;
  const y = (i / size) | 0;
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < size && ny < size) out.push(ny * size + nx);
    }
  }
  return out;
}

/** Every row, column and region, as square lists: each must hold exactly `per` stars. */
export function units(b: Board): number[][] {
  const n = b.size;
  const rows = Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => y * n + x));
  const cols = Array.from({ length: n }, (_, x) => Array.from({ length: n }, (_, y) => y * n + x));
  const regs: number[][] = Array.from({ length: n }, () => []);
  b.regions.forEach((r, i) => regs[r].push(i));
  return [...rows, ...cols, ...regs];
}

/** True if a set of stars follows every rule. */
export function valid(b: Board, stars: number[]): boolean {
  const set = new Set(stars);
  for (const s of stars) if (around(b.size, s).some((o) => set.has(o))) return false;
  return units(b).every((u) => u.filter((i) => set.has(i)).length === b.per);
}
