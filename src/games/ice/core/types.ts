export type Difficulty = 'Tutorial' | 'Easy' | 'Medium' | 'Hard' | 'Super Hard';

/** Step on each side: up, right, down, left. */
export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];

export interface IceLevel {
  number: number;
  w: number;
  h: number;
  /** True for each rock, row by row (index y * w + x). */
  rocks: boolean[];
  /** Cells a puck falls into if it slides over them. */
  holes: number[];
  /** Where each puck starts. One puck, or two that slide together. */
  starts: number[];
  /** Each puck's exit: it must stop exactly there. */
  exits: number[];
  /** Swipes for three stars: the fewest that get every puck home. */
  par: number;
  difficulty: Difficulty;
  /** Par weighted by dead ends (see rateIce). Drives the label. */
  score?: number;
  tip?: string;
}
