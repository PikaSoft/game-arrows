export type Difficulty = 'Tutorial' | 'Easy' | 'Medium' | 'Hard' | 'Super Hard';

/**
 * Which tiles a tap changes: the tile itself plus its four side neighbours ('plus'), or
 * itself plus its four diagonal neighbours ('cross').
 */
export type Pattern = 'plus' | 'cross';

export interface LightsLevel {
  number: number;
  w: number;
  h: number;
  pattern: Pattern;
  /** Steps each light has: 2 (on, off) or 3 (bright, dim, off). A tap moves it one step on. */
  states: 2 | 3;
  /** Each light's step, row by row (index y * w + x). 0 is off. */
  board: number[];
  /** Taps for three stars: the fewest that turn every light off. */
  par: number;
  difficulty: Difficulty;
  /** Weighted par (see rateLights). Drives the label. */
  score?: number;
  tip?: string;
}
