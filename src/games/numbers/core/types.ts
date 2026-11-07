export type Difficulty = 'Tutorial' | 'Easy' | 'Medium' | 'Hard' | 'Super Hard';

export interface NumbersLevel {
  number: number;
  /** Digits per row (6 or 9). Boxes are 2x3 on 6, 3x3 on 9. */
  size: 6 | 9;
  /** The puzzle as given: a digit 1..size, or 0 for blank. Row by row. */
  givens: number[];
  /** The one answer. */
  solution: number[];
  difficulty: Difficulty;
  /** Hardest technique needed (1 to 4, see techniques.ts). Drives the label. */
  score?: number;
  /** Name of that technique, for the label's tooltip. */
  hardest?: string;
  tip?: string;
}
