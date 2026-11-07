export type Difficulty = 'Tutorial' | 'Easy' | 'Medium' | 'Hard' | 'Super Hard';

/** Step to the neighbour on each side: up, right, down, left. */
export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];

/** Colours the renderer can tell apart; the generator never uses more. */
export const MAX_COLOURS = 18;

export interface LinesLevel {
  number: number;
  w: number;
  h: number;
  /**
   * The one solution: for each colour, its path of cells (index y * w + x) from one dot
   * to the other. The dots are each path's first and last cells.
   */
  solution: number[][];
  difficulty: Difficulty;
  /** How hard the solver found it (see rateLines). Drives the label. */
  score?: number;
  tip?: string;
}
