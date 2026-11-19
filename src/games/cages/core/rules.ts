import { Cage, Op } from './types';

/** Rows, columns and, for each square, the others in its row or column. */
export interface Shape {
  size: number;
  rows: number[][];
  cols: number[][];
  /** Every row and column. */
  units: number[][];
  peers: number[][];
}

const shapes = new Map<number, Shape>();

export function shapeOf(size: number): Shape {
  const hit = shapes.get(size);
  if (hit) return hit;
  const rows = Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => y * size + x));
  const cols = Array.from({ length: size }, (_, x) => Array.from({ length: size }, (_, y) => y * size + x));
  const peers = Array.from({ length: size * size }, (_, i) => {
    const s = new Set([...rows[(i / size) | 0], ...cols[i % size]]);
    s.delete(i);
    return [...s];
  });
  const sh = { size, rows, cols, units: [...rows, ...cols], peers };
  shapes.set(size, sh);
  return sh;
}

/** True if the numbers make the target with the cage's sign. '-' and '/' take the larger first. */
export function makes(op: Op, target: number, values: number[]): boolean {
  if (op === '=') return values[0] === target;
  if (op === '+') return values.reduce((a, b) => a + b, 0) === target;
  if (op === 'x') return values.reduce((a, b) => a * b, 1) === target;
  const [a, b] = values[0] >= values[1] ? values : [values[1], values[0]];
  return op === '-' ? a - b === target : b * target === a;
}

/** The target the numbers make with a sign. */
export function targetOf(op: Op, values: number[]): number {
  if (op === '=') return values[0];
  if (op === '+') return values.reduce((a, b) => a + b, 0);
  if (op === 'x') return values.reduce((a, b) => a * b, 1);
  const hi = Math.max(values[0], values[1]);
  const lo = Math.min(values[0], values[1]);
  return op === '-' ? hi - lo : hi / lo;
}

/** The label shown in a cage's corner, e.g. "12+", "3−", "5". */
export function cageLabel(c: Cage): string {
  const sign = c.op === '=' ? '' : c.op === '-' ? '−' : c.op === 'x' ? '×' : c.op === '/' ? '÷' : '+';
  return `${c.target}${sign}`;
}

/** True if a full grid is a Latin square and every cage makes its target. */
export function isSolved(size: number, cages: Cage[], grid: number[]): boolean {
  const sh = shapeOf(size);
  for (const u of sh.units) if (new Set(u.map((i) => grid[i])).size !== size || u.some((i) => grid[i] < 1 || grid[i] > size)) return false;
  return cages.every((c) => makes(c.op, c.target, c.cells.map((i) => grid[i])));
}
