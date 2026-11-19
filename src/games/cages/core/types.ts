export type Difficulty = 'Tutorial' | 'Easy' | 'Medium' | 'Hard' | 'Super Hard';

/** How a cage's numbers make its target. '=' is a one-square cage that shows its number. */
export type Op = '+' | '-' | 'x' | '/' | '=';

export interface Cage {
  cells: number[];
  op: Op;
  target: number;
}

export interface CagesLevel {
  number: number;
  /** Numbers per row (1 to size). */
  size: number;
  cages: Cage[];
  /** The one answer, row by row. */
  solution: number[];
  difficulty: Difficulty;
  /** Difficulty score (1 to 4, see rateCages). Drives the label. */
  score?: number;
  /** Name of the hardest step needed, for the label's tooltip. */
  hardest?: string;
  tip?: string;
}
