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

/** The number shown on each square: mines among its neighbours (-1 for a mine itself). */
export function numbers(w: number, h: number, mines: number[]): number[] {
  const isMine = new Uint8Array(w * h);
  for (const m of mines) isMine[m] = 1;
  return Array.from({ length: w * h }, (_, i) => (isMine[i] ? -1 : around(w, h, i).filter((o) => isMine[o]).length));
}

/**
 * Uncover square i (which must be safe) and, if it shows 0, everything around it, and so
 * on. Marks `open` in place and returns the squares newly opened.
 */
export function flood(w: number, h: number, nums: number[], open: Uint8Array, i: number): number[] {
  const out: number[] = [];
  const stack = [i];
  while (stack.length) {
    const c = stack.pop()!;
    if (open[c] || nums[c] < 0) continue;
    open[c] = 1;
    out.push(c);
    if (nums[c] === 0) for (const o of around(w, h, c)) if (!open[o]) stack.push(o);
  }
  return out;
}
