export type Difficulty = 'Tutorial' | 'Easy' | 'Medium' | 'Hard' | 'Super Hard';

/** The answer to a guess: pegs right colour in the right place, and right colour elsewhere. */
export interface Feedback {
  exact: number;
  near: number;
}

export interface CodesLevel {
  number: number;
  /** Pegs in the code. */
  slots: number;
  /** Colours to choose from (0 to colours - 1). */
  colours: number;
  /** True when the code may use a colour more than once. */
  repeats: boolean;
  /** The hidden code, one colour per slot. */
  code: number[];
  /** Guesses for three stars. */
  par: number;
  /** The solver's average guesses for this size (see expectedGuesses). */
  expected: number;
  difficulty: Difficulty;
  /** How many codes are possible, in bits. Drives the label. */
  score?: number;
  tip?: string;
}
