import { SHAPES } from './shapes';
import { Block, Gap, OUTWARD, Side, SIDES } from './types';

/** The fixed part of a level: board size and the gaps in its frame. */
export interface Board {
  w: number;
  h: number;
  gaps: Gap[];
}

/** Where a block is. Null once it has left the board. */
export type Pos = { x: number; y: number } | null;

export const posKey = (w: number, x: number, y: number) => y * w + x;

/** Grid of which block covers each cell (-1 for none), skipping block `skip`. */
export function occupancy(board: Board, blocks: Block[], pos: Pos[], skip = -1): Int16Array {
  const g = new Int16Array(board.w * board.h).fill(-1);
  pos.forEach((p, i) => {
    if (!p || i === skip) return;
    for (const [dx, dy] of SHAPES[blocks[i].shape].cells) g[(p.y + dy) * board.w + p.x + dx] = i;
  });
  return g;
}

/** Does block shape `s` fit at x, y on the board without touching anything in `occ`? */
export function fits(board: Board, occ: Int16Array, s: number, x: number, y: number): boolean {
  const sh = SHAPES[s];
  if (x < 0 || y < 0 || x + sh.w > board.w || y + sh.h > board.h) return false;
  for (const [dx, dy] of sh.cells) if (occ[(y + dy) * board.w + x + dx] !== -1) return false;
  return true;
}

/** Every position block `i` can slide to from where it is (including where it is). */
export function reachable(board: Board, blocks: Block[], pos: Pos[], i: number, occ = occupancy(board, blocks, pos, i)): number[] {
  const p = pos[i];
  if (!p) return [];
  const s = blocks[i].shape;
  const seen = new Uint8Array(board.w * board.h);
  const start = posKey(board.w, p.x, p.y);
  const out = [start];
  seen[start] = 1;
  for (let k = 0; k < out.length; k++) {
    const x = out[k] % board.w;
    const y = (out[k] / board.w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= board.w || ny >= board.h) continue;
      const key = posKey(board.w, nx, ny);
      if (seen[key] || !fits(board, occ, s, nx, ny)) continue;
      seen[key] = 1;
      out.push(key);
    }
  }
  return out;
}

/** The gap a block of this shape and colour at x, y would pass through on `side`, if any. */
export function gapFor(board: Board, block: Block, x: number, y: number, side: Side): Gap | null {
  const sh = SHAPES[block.shape];
  const horizontal = side === 'top' || side === 'bottom';
  const from = horizontal ? x : y;
  const to = from + (horizontal ? sh.w : sh.h) - 1;
  for (const g of board.gaps) {
    if (g.side !== side || from < g.start || to > g.start + g.len - 1) continue;
    if (g.color !== null && g.color !== block.color) continue;
    return g;
  }
  return null;
}

/**
 * Can block `i`, standing at x, y, slide straight out through `side`? It needs a gap that
 * spans every column (or row) it covers, takes its colour, and a clear path to the edge.
 */
export function canExit(board: Board, blocks: Block[], occ: Int16Array, i: number, x: number, y: number, side: Side): boolean {
  if (!gapFor(board, blocks[i], x, y, side)) return false;
  const [ox, oy] = OUTWARD[side];
  const sh = SHAPES[blocks[i].shape];
  for (const [dx, dy] of sh.cells) {
    let cx = x + dx + ox;
    let cy = y + dy + oy;
    while (cx >= 0 && cy >= 0 && cx < board.w && cy < board.h) {
      if (occ[cy * board.w + cx] !== -1) return false;
      cx += ox;
      cy += oy;
    }
  }
  return true;
}

/** A side block `i` can leave through from x, y, or null. */
export function exitSide(board: Board, blocks: Block[], occ: Int16Array, i: number, x: number, y: number): Side | null {
  for (const side of SIDES) if (canExit(board, blocks, occ, i, x, y, side)) return side;
  return null;
}

/** Could block `i` ever leave through some gap, on an empty board? */
export function hasExit(board: Board, block: Block): boolean {
  const sh = SHAPES[block.shape];
  for (const g of board.gaps) {
    if (g.color !== null && g.color !== block.color) continue;
    const span = g.side === 'top' || g.side === 'bottom' ? sh.w : sh.h;
    if (span <= g.len) return true;
  }
  return false;
}

/** Where block `i` could leave from right now: a reachable position and side, or null. */
export function findExit(board: Board, blocks: Block[], pos: Pos[], i: number): { x: number; y: number; side: Side } | null {
  if (!pos[i] || !hasExit(board, blocks[i])) return null;
  const occ = occupancy(board, blocks, pos, i);
  for (const key of reachable(board, blocks, pos, i, occ)) {
    const x = key % board.w;
    const y = (key / board.w) | 0;
    const side = exitSide(board, blocks, occ, i, x, y);
    if (side) return { x, y, side };
  }
  return null;
}

export const isSolved = (pos: Pos[]): boolean => pos.every((p) => p === null);
