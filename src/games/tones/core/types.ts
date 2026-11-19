export type Difficulty = 'Tutorial' | 'Easy' | 'Medium' | 'Hard' | 'Super Hard';

/** What a square holds. */
export const EMPTY = 0;
export const A = 1;
export const B = 2;

export interface TonesLevel {
  number: number;
  /** Squares per row and column (even). */
  size: number;
  /** The puzzle as given: A, B or EMPTY, row by row. */
  givens: number[];
  /** The one answer. */
  solution: number[];
  difficulty: Difficulty;
  /** Hardest technique tier needed (1 to 5, see solver.ts). Drives the label. */
  score?: number;
  /** Name of that technique, for the label's tooltip. */
  hardest?: string;
  tip?: string;
}
