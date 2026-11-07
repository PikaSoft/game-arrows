export type Difficulty = 'Tutorial' | 'Easy' | 'Medium' | 'Hard' | 'Super Hard';

/** Step on each side: up, right, down, left. */
export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];

export interface CrateLevel {
  number: number;
  w: number;
  h: number;
  /** True for each wall cell, row by row (index y * w + x). The outer ring is always wall. */
  walls: boolean[];
  targets: number[];
  /** Where the crates start. */
  crates: number[];
  player: number;
  /** Pushes for three stars: the fewest pushes that solve the level. */
  par: number;
  difficulty: Difficulty;
  /** Pushes beyond the obvious (see rateCrates). Drives the label. */
  score?: number;
  tip?: string;
}
