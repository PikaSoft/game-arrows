import { A, B, EMPTY } from './types';

/** Every row, then every column, as lists of square indices. */
export function lines(size: number): number[][] {
  const out: number[][] = [];
  for (let y = 0; y < size; y++) out.push(Array.from({ length: size }, (_, x) => y * size + x));
  for (let x = 0; x < size; x++) out.push(Array.from({ length: size }, (_, y) => y * size + x));
  return out;
}

const cache = new Map<number, Int32Array>();

/**
 * Every valid full line for a size, as a bitmask with a 1 for each A: half the squares
 * of each tone and never three of one tone in a row. Bit k is square k along the line.
 */
export function validLines(size: number): Int32Array {
  let hit = cache.get(size);
  if (hit) return hit;
  const out: number[] = [];
  const full = (1 << size) - 1;
  for (let m = 0; m <= full; m++) {
    let ones = 0;
    for (let k = 0; k < size; k++) ones += (m >> k) & 1;
    if (ones * 2 !== size) continue;
    let ok = true;
    for (let k = 0; k + 2 < size && ok; k++) {
      const t = (m >> k) & 7;
      if (t === 0 || t === 7) ok = false;
    }
    if (ok) out.push(m);
  }
  hit = Int32Array.from(out);
  cache.set(size, hit);
  return hit;
}

/** A line's squares as two bitmasks: which hold A, which hold B. */
export function lineMasks(grid: ArrayLike<number>, line: number[]): [number, number] {
  let a = 0;
  let b = 0;
  for (let k = 0; k < line.length; k++) {
    const v = grid[line[k]];
    if (v === A) a |= 1 << k;
    else if (v === B) b |= 1 << k;
  }
  return [a, b];
}

/** True if a partly filled line breaks a rule: three in a row, or more than half of a tone. */
export function lineBroken(values: number[]): boolean {
  const half = values.length / 2;
  let a = 0;
  let b = 0;
  for (let k = 0; k < values.length; k++) {
    if (values[k] === A) a++;
    if (values[k] === B) b++;
    if (k >= 2 && values[k] !== EMPTY && values[k] === values[k - 1] && values[k] === values[k - 2]) return true;
  }
  return a > half || b > half;
}

/** True if the grid is full and keeps every rule, including no two equal rows or columns. */
export function isSolved(grid: ArrayLike<number>, size: number): boolean {
  if (Array.from(grid).some((v) => v === EMPTY)) return false;
  const ls = lines(size);
  for (const l of ls) if (lineBroken(l.map((i) => grid[i]))) return false;
  const rows = new Set(ls.slice(0, size).map((l) => lineMasks(grid, l)[0]));
  const cols = new Set(ls.slice(size).map((l) => lineMasks(grid, l)[0]));
  return rows.size === size && cols.size === size;
}
