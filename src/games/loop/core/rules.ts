import { CRATE, LoopLevel } from './types';

/**
 * The belt is a closed track. Positions along it run from 0 to 1, clockwise, starting at
 * the left end of the top straight. The top and bottom straights each take TOP_SPAN of
 * the way round, and each rounded end takes SIDE_SPAN.
 */
export const TOP_SPAN = 0.3;
export const SIDE_SPAN = 0.2;

/** Where column `i` of `cols` drops its cubes, as a belt slot. The top runs left to right. */
export function chuteSlot(i: number, cols: number, capacity: number): number {
  return Math.floor(((i + 0.5) / cols) * TOP_SPAN * capacity) % capacity;
}

/** Where bay `j` of `bays` picks cubes off, as a belt slot. The bottom runs right to left. */
export function intakeSlot(j: number, bays: number, capacity: number): number {
  return Math.floor((TOP_SPAN + SIDE_SPAN + (1 - (j + 0.5) / bays) * TOP_SPAN) * capacity) % capacity;
}

/** How many cubes of each colour the crates supply and the trays want. They must match. */
export function cubeCounts(level: Pick<LoopLevel, 'supply' | 'bays' | 'colors'>): { supplied: number[]; wanted: number[] } {
  const supplied = new Array(level.colors).fill(0);
  const wanted = new Array(level.colors).fill(0);
  for (const col of level.supply) for (const crate of col) for (const c of crate) supplied[c]++;
  for (const bay of level.bays) for (const c of bay) wanted[c] += CRATE;
  return { supplied, wanted };
}

/** A level is fair if every cube has a tray slot waiting for it and every crate is full. */
export function balanced(level: Pick<LoopLevel, 'supply' | 'bays' | 'colors'>): boolean {
  const { supplied, wanted } = cubeCounts(level);
  return supplied.every((n, c) => n === wanted[c]) && level.supply.every((col) => col.every((crate) => crate.length === CRATE));
}

export function crateCount(level: Pick<LoopLevel, 'supply'>): number {
  return level.supply.reduce((s, col) => s + col.length, 0);
}

/** Stars for a clear: three with no undos, two with one or two, one otherwise. */
export function starsFor(undos: number): number {
  return undos === 0 ? 3 : undos <= 2 ? 2 : 1;
}
