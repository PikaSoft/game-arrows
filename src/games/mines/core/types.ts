export type Difficulty = 'Tutorial' | 'Easy' | 'Medium' | 'Hard' | 'Super Hard';

export interface MinesLevel {
  number: number;
  w: number;
  h: number;
  /** Mine squares. */
  mines: number[];
  /** Where play starts: this square and everything around it is safe, and opens at once. */
  start: number;
  difficulty: Difficulty;
  /** How hard the no-guess solver found it (see rateMines). Drives the label. */
  score?: number;
  /** The hardest kind of reasoning needed, for the label's tooltip. */
  hardest?: string;
  tip?: string;
}
