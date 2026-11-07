import { DIRS, DX, DY } from './types';

/** The openings after one quarter turn clockwise. */
export const rotate = (m: number): number => ((m << 1) | (m >> 3)) & 15;

/** The openings after k quarter turns clockwise. */
export function rotateBy(m: number, k: number): number {
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) m = rotate(m);
  return m;
}

/** The side facing back (north for south and so on). */
export const opposite = (d: number): number => rotateBy(d, 2);

/** Quarter turns clockwise to get from `from` to `to`, or -1 if no turn does. */
export function turnsBetween(from: number, to: number): number {
  for (let k = 0; k < 4; k++) if (rotateBy(from, k) === to) return k;
  return -1;
}

/** Number of openings. */
export const degree = (m: number): number => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);

/** The cell through side index d (0..3) of cell i, or -1 off the board. */
export function neighbour(w: number, h: number, i: number, d: number): number {
  const x = (i % w) + DX[d];
  const y = ((i / w) | 0) + DY[d];
  return x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x;
}

/** Cells joined to the source through pipes that meet on both sides. */
export function watered(w: number, h: number, masks: number[], source: number): Set<number> {
  const seen = new Set<number>([source]);
  const stack = [source];
  while (stack.length) {
    const i = stack.pop()!;
    for (let d = 0; d < 4; d++) {
      if (!(masks[i] & DIRS[d])) continue;
      const j = neighbour(w, h, i, d);
      if (j < 0 || seen.has(j) || !(masks[j] & DIRS[(d + 2) % 4])) continue;
      seen.add(j);
      stack.push(j);
    }
  }
  return seen;
}

/** Openings that lead nowhere: off the board or into a side with no pipe. */
export function looseEnds(w: number, h: number, masks: number[]): number {
  let n = 0;
  for (let i = 0; i < masks.length; i++) {
    for (let d = 0; d < 4; d++) {
      if (!(masks[i] & DIRS[d])) continue;
      const j = neighbour(w, h, i, d);
      if (j < 0 || !(masks[j] & DIRS[(d + 2) % 4])) n++;
    }
  }
  return n;
}

/** Solved when every tile is joined to the source and no pipe end is left open. */
export function isSolved(w: number, h: number, masks: number[], source: number): boolean {
  return looseEnds(w, h, masks) === 0 && watered(w, h, masks, source).size === masks.length;
}

/** Fewest clockwise taps that turn each tile from `start` into `solution`. */
export function parFor(start: number[], solution: number[]): number {
  return start.reduce((sum, m, i) => sum + turnsBetween(m, solution[i]), 0);
}
