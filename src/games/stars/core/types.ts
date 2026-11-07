export type Difficulty = 'Tutorial' | 'Easy' | 'Medium' | 'Hard' | 'Super Hard';

/** What is known about a square. */
export const UNKNOWN = 0;
export const STAR = 1;
export const DOT = 2;

export interface StarsLevel {
  number: number;
  /** The grid is size x size, split into `size` regions. */
  size: number;
  /** Stars in every row, column and region. */
  per: number;
  /** Region of each square, row by row (0 to size - 1). */
  regions: number[];
  /** The one answer: star squares. */
  stars: number[];
  difficulty: Difficulty;
  /** How hard the reasoning solver found it (see rateStars). Drives the label. */
  score?: number;
  tip?: string;
}
