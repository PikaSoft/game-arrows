import { solveLine } from './line';
import { UNKNOWN } from './types';

export interface Clues {
  w: number;
  h: number;
  rows: number[][];
  cols: number[][];
}

const rowOf = (g: number[], w: number, y: number) => g.slice(y * w, y * w + w);
const colOf = (g: number[], w: number, h: number, x: number) => Array.from({ length: h }, (_, y) => g[y * w + x]);

/**
 * One wave of reasoning: every row and column is solved on its own, each using only what
 * was known when the wave began (the way a player scans the board, then looks again).
 * Returns the new grid, or null if some line has no fitting placement.
 */
export function wave(c: Clues, grid: number[]): number[] | null {
  const { w, h } = c;
  const next = grid.slice();
  for (let y = 0; y < h; y++) {
    const r = solveLine(rowOf(grid, w, y), c.rows[y]);
    if (!r) return null;
    r.forEach((v, x) => {
      if (v !== UNKNOWN) next[y * w + x] = v;
    });
  }
  for (let x = 0; x < w; x++) {
    const r = solveLine(colOf(grid, w, h, x), c.cols[x]);
    if (!r) return null;
    r.forEach((v, y) => {
      if (v !== UNKNOWN) next[y * w + x] = v;
    });
  }
  return next;
}

export interface Rating {
  solved: boolean;
  grid: number[];
  /** Waves needed. */
  waves: number;
  /** Average over the waves of (open cells + 1) / (cells settled that wave + 1). */
  score: number;
}

/**
 * Solve by line logic alone, in waves, measured like Arrow Escape's label: a wave that
 * settles few cells while many are open is a hard spot. Solved only if line logic alone
 * finishes the picture, which also means it has exactly one answer.
 */
export function rate(c: Clues, start?: number[]): Rating {
  let grid = start ? start.slice() : new Array<number>(c.w * c.h).fill(UNKNOWN);
  let total = 0;
  let waves = 0;
  for (;;) {
    const open = grid.filter((v) => v === UNKNOWN).length;
    if (open === 0) break;
    const next = wave(c, grid);
    if (!next) return { solved: false, grid, waves, score: Infinity };
    const after = next.filter((v) => v === UNKNOWN).length;
    if (after === open) return { solved: false, grid, waves, score: Infinity };
    total += (open + 1) / (open - after + 1);
    waves++;
    grid = next;
  }
  return { solved: true, grid, waves, score: waves ? total / waves : 0 };
}
