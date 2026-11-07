export type Difficulty = 'Tutorial' | 'Easy' | 'Medium' | 'Hard' | 'Super Hard';

/** What is known about a cell. */
export const UNKNOWN = 0;
export const FILLED = 1;
export const EMPTY = 2;

export interface PictureLevel {
  number: number;
  w: number;
  h: number;
  /** The picture: 1 for each filled cell, row by row (index y * w + x). */
  solution: number[];
  /** Run lengths of filled cells along each row, left to right, and each column, top down. */
  rows: number[][];
  cols: number[][];
  /** What the picture shows, for the hand-drawn ones. */
  name?: string;
  difficulty: Difficulty;
  /** How hard the line solver found it (see ratePicture). Drives the label. */
  score?: number;
  tip?: string;
}
