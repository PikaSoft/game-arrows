import { Beam, BeamLevel, CRYSTAL, DX, DY, FIXED, MIRROR, Orient, Port, WALL } from './types';

export type Board = Pick<BeamLevel, 'w' | 'h' | 'cells' | 'beams'>;

/** The direction a beam leaves a mirror. `/` swaps north and east, `\` north and west. */
export const reflect = (d: number, o: Orient): number => (o === 0 ? [1, 0, 3, 2][d] : [3, 2, 1, 0][d]);

export const isMirror = (c: number): boolean => c === MIRROR || c === FIXED;

export const portKey = (p: Port): number => p.side * 64 + p.pos;
export const samePort = (a: Port, b: Port): boolean => a.side === b.side && a.pos === b.pos;

/** The first cell a lamp's beam enters, and which way it is going. */
export function entry(w: number, h: number, p: Port): { cell: number; dir: number } {
  if (p.side === 0) return { cell: p.pos, dir: 2 };
  if (p.side === 1) return { cell: p.pos * w + (w - 1), dir: 3 };
  if (p.side === 2) return { cell: (h - 1) * w + p.pos, dir: 0 };
  return { cell: p.pos * w, dir: 1 };
}

/** The port a beam reaches when it leaves cell (x, y) going `dir`. */
export function exitPort(x: number, y: number, dir: number): Port {
  if (dir === 0) return { side: 0, pos: x };
  if (dir === 1) return { side: 1, pos: y };
  if (dir === 2) return { side: 2, pos: x };
  return { side: 3, pos: y };
}

export interface Trace {
  /** Cells the beam passes, in order. A cell can appear twice (a mirror hit from both sides). */
  cells: number[];
  /** Where it leaves the board, or null if a wall stops it. */
  exit: Port | null;
  /** The way it was going at the end (into the wall, or off the board). */
  dir: number;
}

/** Follow one beam through the board with mirrors turned as `orient` says. */
export function trace(b: Board, orient: ArrayLike<number>, lamp: Port): Trace {
  const { w, h, cells } = b;
  let { cell, dir } = entry(w, h, lamp);
  const out: number[] = [];
  // Reflection can be undone step by step, so a beam from the border always leaves again;
  // the cap is only a guard.
  for (let step = 0; step < w * h * 4 + 4; step++) {
    const c = cells[cell];
    if (c === WALL) return { cells: out, exit: null, dir };
    out.push(cell);
    if (isMirror(c)) dir = reflect(dir, orient[cell] as Orient);
    const x = (cell % w) + DX[dir];
    const y = ((cell / w) | 0) + DY[dir];
    if (x < 0 || y < 0 || x >= w || y >= h) return { cells: out, exit: exitPort(cell % w, (cell / w) | 0, dir), dir };
    cell = y * w + x;
  }
  return { cells: out, exit: null, dir };
}

export interface Status {
  traces: Trace[];
  /** For each beam, whether it reaches its own target. */
  reached: boolean[];
  /** Crystals some beam passes through. */
  lit: Set<number>;
  crystals: number;
  solved: boolean;
}

export function status(b: Board, orient: ArrayLike<number>): Status {
  const traces = b.beams.map((beam: Beam) => trace(b, orient, beam.lamp));
  const reached = traces.map((t, i) => !!t.exit && samePort(t.exit, b.beams[i].target));
  const lit = new Set<number>();
  for (const t of traces) for (const c of t.cells) if (b.cells[c] === CRYSTAL) lit.add(c);
  const crystals = b.cells.filter((c) => c === CRYSTAL).length;
  return { traces, reached, lit, crystals, solved: reached.every(Boolean) && lit.size === crystals };
}
