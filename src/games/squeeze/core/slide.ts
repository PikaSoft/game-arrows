import { Board, canExit, fits } from './rules';
import { Block, Side } from './types';

export type Axis = 'x' | 'y';

/**
 * How far block i, lined up on cell x, y, can slide along one axis: whole cells from
 * `lo` (zero or negative) to `hi` (zero or positive). An end is open (named by the side it
 * leads out through) when the block can leave the board from that end cell.
 */
export interface SlideRange {
  lo: number;
  hi: number;
  exitLo: Side | null;
  exitHi: Side | null;
}

export function slideRange(board: Board, blocks: Block[], occ: Int16Array, i: number, x: number, y: number, axis: Axis): SlideRange {
  const s = blocks[i].shape;
  const ax = axis === 'x' ? 1 : 0;
  const ay = axis === 'y' ? 1 : 0;
  let lo = 0;
  while (fits(board, occ, s, x + (lo - 1) * ax, y + (lo - 1) * ay)) lo--;
  let hi = 0;
  while (fits(board, occ, s, x + (hi + 1) * ax, y + (hi + 1) * ay)) hi++;
  const sideLo: Side = axis === 'x' ? 'left' : 'top';
  const sideHi: Side = axis === 'x' ? 'right' : 'bottom';
  return {
    lo,
    hi,
    exitLo: canExit(board, blocks, occ, i, x + lo * ax, y + lo * ay, sideLo) ? sideLo : null,
    exitHi: canExit(board, blocks, occ, i, x + hi * ax, y + hi * ay, sideHi) ? sideHi : null,
  };
}
