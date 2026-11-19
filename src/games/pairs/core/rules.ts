import { Slot } from './types';

/** Which tiles block which: for each tile, those on top of it, and those beside it on the left and right. */
export interface Blocks {
  above: number[][];
  left: number[][];
  right: number[][];
}

export function blocks(slots: Slot[]): Blocks {
  const above = slots.map(() => [] as number[]);
  const left = slots.map(() => [] as number[]);
  const right = slots.map(() => [] as number[]);
  slots.forEach((a, i) => {
    slots.forEach((b, j) => {
      if (i === j) return;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (b.z === a.z + 1 && Math.abs(dx) < 2 && Math.abs(dy) < 2) above[i].push(j);
      if (b.z === a.z && Math.abs(dy) < 2) {
        if (dx === -2) left[i].push(j);
        if (dx === 2) right[i].push(j);
      }
    });
  });
  return { above, left, right };
}

/** A tile is free when nothing lies on it and its left or right side is open. */
export function isFree(b: Blocks, alive: ArrayLike<boolean | number>, i: number): boolean {
  if (!alive[i]) return false;
  if (b.above[i].some((j) => alive[j])) return false;
  return !b.left[i].some((j) => alive[j]) || !b.right[i].some((j) => alive[j]);
}

export function freeTiles(b: Blocks, alive: ArrayLike<boolean | number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < alive.length; i++) if (isFree(b, alive, i)) out.push(i);
  return out;
}

/** Every pair of free tiles with the same picture. */
export function freePairs(b: Blocks, alive: ArrayLike<boolean | number>, faces: number[]): [number, number][] {
  const free = freeTiles(b, alive);
  const out: [number, number][] = [];
  for (let p = 0; p < free.length; p++)
    for (let q = p + 1; q < free.length; q++) if (faces[free[p]] === faces[free[q]]) out.push([free[p], free[q]]);
  return out;
}
