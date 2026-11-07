export type Difficulty = 'Tutorial' | 'Easy' | 'Medium' | 'Hard' | 'Super Hard';

/** What is known about a square. Trees are fixed and never change. */
export const UNKNOWN = 0;
export const TENT = 1;
export const GRASS = 2;
export const TREE = 3;

export interface TentsLevel {
  number: number;
  w: number;
  h: number;
  /** Tree squares. */
  trees: number[];
  /** The one answer: tent squares. */
  tents: number[];
  /** Tents in each row (top down) and each column (left to right). */
  rowCounts: number[];
  colCounts: number[];
  difficulty: Difficulty;
  /** How hard the solver found it (see rateTents). Drives the label. */
  score?: number;
  tip?: string;
}
