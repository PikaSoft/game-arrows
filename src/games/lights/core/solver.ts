import { affected } from './rules';
import { Pattern } from './types';

/*
 * Each tap adds 1 (mod the number of states) to the tiles it reaches, and the order of
 * taps doesn't matter. So a board is a system of linear equations mod p (p = 2 or 3):
 * for every tile, the taps that reach it must add up to minus its step. Gaussian
 * elimination gives one answer plus the free choices; trying every free choice finds the
 * answer with the fewest taps.
 */

interface Reduced {
  n: number;
  p: number;
  /** Row-reduced matrix: rows[r][c], with a pivot column per row. */
  rows: Int8Array[];
  /** For each pivot row, the row operations that built it, so the right-hand side can follow. */
  combo: Int8Array[];
  pivots: number[];
  free: number[];
}

const cache = new Map<string, Reduced>();

const inv = (a: number, p: number) => (p === 2 ? 1 : a === 1 ? 1 : 2);

function reduce(w: number, h: number, pattern: Pattern, p: number): Reduced {
  const key = `${w}x${h}:${pattern}:${p}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const n = w * h;
  // Column j is tap j; row i is tile i.
  const rows = Array.from({ length: n }, () => new Int8Array(n));
  for (let j = 0; j < n; j++) for (const i of affected(w, h, pattern, j)) rows[i][j] = 1;
  // Track the combination of original rows behind each row (identity to start).
  const combo = Array.from({ length: n }, (_, i) => {
    const r = new Int8Array(n);
    r[i] = 1;
    return r;
  });
  const pivots: number[] = [];
  let r = 0;
  for (let c = 0; c < n && r < n; c++) {
    let pr = -1;
    for (let k = r; k < n; k++) if (rows[k][c] % p !== 0) {
      pr = k;
      break;
    }
    if (pr < 0) continue;
    [rows[r], rows[pr]] = [rows[pr], rows[r]];
    [combo[r], combo[pr]] = [combo[pr], combo[r]];
    const s = inv(rows[r][c], p);
    for (let k = 0; k < n; k++) {
      rows[r][k] = (rows[r][k] * s) % p;
      combo[r][k] = (combo[r][k] * s) % p;
    }
    for (let k = 0; k < n; k++) {
      if (k === r || rows[k][c] === 0) continue;
      const f = rows[k][c];
      for (let m = 0; m < n; m++) {
        rows[k][m] = (((rows[k][m] - f * rows[r][m]) % p) + p) % p;
        combo[k][m] = (((combo[k][m] - f * combo[r][m]) % p) + p) % p;
      }
    }
    pivots.push(c);
    r++;
  }
  const isPivot = new Set(pivots);
  const free = [...Array(n).keys()].filter((c) => !isPivot.has(c));
  const red: Reduced = { n, p, rows, combo, pivots, free };
  cache.set(key, red);
  return red;
}

/** How many free choices a board shape has (each multiplies the answers by p). */
export const freedom = (w: number, h: number, pattern: Pattern, p: number): number => reduce(w, h, pattern, p).free.length;

/**
 * The fewest taps that turn every light off: how many times to tap each tile (0 to p - 1).
 * Null if the board can't be solved. Tries every free choice when there are few enough;
 * otherwise returns the plain answer, which may not be the shortest.
 */
export function solveMin(w: number, h: number, pattern: Pattern, p: number, board: number[], maxFree = 12): number[] | null {
  const red = reduce(w, h, pattern, p);
  const { n, rows, combo, pivots, free } = red;
  // Right-hand side: minus each tile's step, carried through the same row operations.
  const target = board.map((v) => (p - (v % p)) % p);
  const rhs = new Int8Array(n);
  for (let r = 0; r < n; r++) {
    let s = 0;
    for (let k = 0; k < n; k++) if (combo[r][k]) s += combo[r][k] * target[k];
    rhs[r] = s % p;
  }
  // Rows past the pivots must be 0 = 0, or there is no answer.
  for (let r = pivots.length; r < n; r++) if (rhs[r] !== 0) return null;
  const tryFree = free.length <= maxFree ? free.length : 0;
  let best: number[] | null = null;
  let bestTaps = Infinity;
  const total = Math.pow(p, tryFree);
  const x = new Array<number>(n).fill(0);
  for (let m = 0; m < total; m++) {
    let code = m;
    for (const f of free) x[f] = 0;
    for (let k = 0; k < tryFree; k++) {
      x[free[k]] = code % p;
      code = Math.floor(code / p);
    }
    for (let r = 0; r < pivots.length; r++) {
      let s = rhs[r];
      for (const f of free) if (rows[r][f]) s -= rows[r][f] * x[f];
      x[pivots[r]] = ((s % p) + p) % p;
    }
    const taps = x.reduce((a, b) => a + b, 0);
    if (taps < bestTaps) {
      bestTaps = taps;
      best = x.slice();
    }
  }
  return best;
}
