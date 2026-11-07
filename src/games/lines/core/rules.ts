import { DX, DY } from './types';

/** The cell through side d (0..3) of cell i, or -1 off the board. */
export function neighbour(w: number, h: number, i: number, d: number): number {
  const x = (i % w) + DX[d];
  const y = ((i / w) | 0) + DY[d];
  return x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x;
}

export function adjacent(w: number, a: number, b: number): boolean {
  const ax = a % w;
  const bx = b % w;
  const ay = (a / w) | 0;
  const by = (b / w) | 0;
  return Math.abs(ax - bx) + Math.abs(ay - by) === 1;
}

/** The two dots of each colour. */
export const dotsOf = (solution: number[][]): [number, number][] => solution.map((p) => [p[0], p[p.length - 1]]);

/** A path is complete when it runs, step by step, from one of its colour's dots to the other. */
export function complete(w: number, path: number[], dots: [number, number]): boolean {
  if (path.length < 2) return false;
  const a = path[0];
  const b = path[path.length - 1];
  if (!((a === dots[0] && b === dots[1]) || (a === dots[1] && b === dots[0]))) return false;
  for (let k = 1; k < path.length; k++) if (!adjacent(w, path[k - 1], path[k])) return false;
  return true;
}

/** Solved when every colour is joined and every cell is covered, with no cell used twice. */
export function isSolved(w: number, h: number, paths: number[][], dots: [number, number][]): boolean {
  const seen = new Uint8Array(w * h);
  for (let c = 0; c < dots.length; c++) {
    if (!complete(w, paths[c] ?? [], dots[c])) return false;
    for (const i of paths[c]) {
      if (seen[i]) return false;
      seen[i] = 1;
    }
  }
  return seen.every(Boolean);
}
