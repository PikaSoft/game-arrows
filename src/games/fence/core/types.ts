export type Difficulty = 'Tutorial' | 'Easy' | 'Medium' | 'Hard' | 'Super Hard';

/** What is known about a line between two dots. */
export const UNKNOWN = 0;
export const ON = 1;
export const OFF = 2;

export interface FenceLevel {
  number: number;
  /** Squares across and down (dots are one more each way). */
  w: number;
  h: number;
  /** A number per square (0 to 3), or -1 for none. Row by row. */
  clues: number[];
  /** Which lines the fence uses (see grid.ts for the order). */
  solution: boolean[];
  difficulty: Difficulty;
  /** Difficulty score (1 to 4). Drives the label. */
  score?: number;
  hardest?: string;
  tip?: string;
}
