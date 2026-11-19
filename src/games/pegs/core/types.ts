export type Difficulty = 'Tutorial' | 'Easy' | 'Medium' | 'Hard' | 'Super Hard';

/** A jump: the peg at `from` hops over `over` into the empty hole `to`, and `over` is taken off. */
export interface Jump {
  from: number;
  over: number;
  to: number;
}

export interface PegsLevel {
  number: number;
  w: number;
  h: number;
  /** Which squares are holes, row by row (index y * w + x). */
  holes: boolean[];
  /** Which holes start with a peg. */
  pegs: boolean[];
  /** The ringed hole: finish with one peg here for three stars. */
  goal: number;
  /** One way to finish with one peg on the goal, from the start. */
  solution: Jump[];
  difficulty: Difficulty;
  /** Search effort in bits (see ratePegs). Drives the label. */
  score?: number;
  tip?: string;
}
