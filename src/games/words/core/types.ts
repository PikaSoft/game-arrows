export type Difficulty = 'Tutorial' | 'Easy' | 'Medium' | 'Hard' | 'Super Hard';

export interface WordsLevel {
  number: number;
  /** The grid is size x size letters. */
  size: number;
  letters: string[];
  /** Every word that can be traced on the grid, longest first. */
  words: string[];
  /** Words to find for one, two and three stars. */
  targets: [number, number, number];
  /** Length of the round. */
  seconds: number;
  difficulty: Difficulty;
  /** How many words the grid hides (see rateWords). Drives the label. */
  score?: number;
  tip?: string;
}
