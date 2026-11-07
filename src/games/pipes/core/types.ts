export type Difficulty = 'Tutorial' | 'Easy' | 'Medium' | 'Hard' | 'Super Hard';

/**
 * A tile's openings as a bitmask: which of its four sides a pipe leaves through.
 * Rotating a tile a quarter turn clockwise moves each opening one side round.
 */
export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;
export const DIRS = [N, E, S, W] as const;
/** Step to the neighbour through each side, in the same order as DIRS. */
export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];

export interface PipeLevel {
  number: number;
  w: number;
  h: number;
  /** Each tile's openings as the level starts, row by row (index y * w + x). */
  tiles: number[];
  /** The cell the water comes from. */
  source: number;
  /** Each tile's openings once solved. Every level has exactly one solution. */
  solution: number[];
  /** Taps for three stars: the fewest quarter turns that solve the board. */
  par: number;
  difficulty: Difficulty;
  /** Reasoning steps the solver needed (see ratePipes). Drives the label. */
  score?: number;
  tip?: string;
}
