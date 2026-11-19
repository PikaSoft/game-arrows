export type Difficulty = 'Tutorial' | 'Easy' | 'Medium' | 'Hard' | 'Super Hard';

/**
 * A tile's place, in half-tile steps: a tile covers x to x + 2 and y to y + 2 on its
 * layer z. Upper layers can sit straight on the tiles below or straddle four of them.
 */
export interface Slot {
  x: number;
  y: number;
  z: number;
}

export interface PairsLevel {
  number: number;
  slots: Slot[];
  /** The picture on each tile (0 to KINDS - 1). Every picture comes an even number of times. */
  faces: number[];
  difficulty: Difficulty;
  /** Share of random playthroughs that get stuck (0 to 1). Drives the label. */
  score?: number;
  tip?: string;
}

/** Pictures: 8 shapes x 3 styles. */
export const SHAPES = 8;
export const STYLES = 3;
export const KINDS = SHAPES * STYLES;
