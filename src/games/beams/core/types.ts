export type Difficulty = 'Tutorial' | 'Easy' | 'Medium' | 'Hard' | 'Super Hard';

/** What sits in a cell. A crystal is empty space that a beam must pass through. */
export const EMPTY = 0;
export const MIRROR = 1;
export const FIXED = 2;
export const WALL = 3;
export const CRYSTAL = 4;
export type Cell = typeof EMPTY | typeof MIRROR | typeof FIXED | typeof WALL | typeof CRYSTAL;

/** A mirror's way round: 0 is `/`, 1 is `\`. */
export type Orient = 0 | 1;

/** Directions a beam travels: north, east, south, west. */
export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];

/**
 * A spot on the border, just outside the grid: `side` is which edge (0 top, 1 right,
 * 2 bottom, 3 left) and `pos` the column (top, bottom) or row (left, right).
 */
export interface Port {
  side: 0 | 1 | 2 | 3;
  pos: number;
}

export interface Beam {
  /** Index into the beam colours. */
  colour: number;
  lamp: Port;
  target: Port;
}

export interface BeamLevel {
  number: number;
  w: number;
  h: number;
  /** What is in each cell, row by row (index y * w + x). */
  cells: Cell[];
  /** Each mirror's way round as the level starts (0 for cells that aren't mirrors). */
  start: Orient[];
  /** A way round for every mirror that solves the board. */
  solution: Orient[];
  beams: Beam[];
  /** Taps for three stars: the fewest that solve the board. */
  par: number;
  difficulty: Difficulty;
  /** Search effort in bits (see rateBeams). Drives the label. */
  score?: number;
  tip?: string;
}
