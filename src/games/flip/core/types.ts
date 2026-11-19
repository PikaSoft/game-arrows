export type Difficulty = 'Tutorial' | 'Easy' | 'Medium' | 'Hard' | 'Super Hard';

/** Pictures: 8 shapes x 3 styles (solid, ring, twin), as in Layer Pairs. */
export const SHAPES = 8;
export const STYLES = 3;
export const KINDS = SHAPES * STYLES;

export interface FlipLevel {
  number: number;
  cols: number;
  rows: number;
  /** The picture on each card, row by row. Each picture is on exactly two cards. */
  faces: number[];
  /** Misses for three stars. */
  par: number;
  /** Pictures chosen to look alike (same shape and colour, different style). */
  lookalike: boolean;
  /** After every this many misses, two face-down cards swap places (0 for never). */
  swapEvery: number;
  /** Seed for which cards swap. */
  seed: number;
  difficulty: Difficulty;
  score?: number;
  tip?: string;
}
