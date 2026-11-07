export type Difficulty = 'Tutorial' | 'Easy' | 'Medium' | 'Hard' | 'Super Hard';

/** Width of the play field, in brick widths. Bricks are one unit wide and half a unit tall. */
export const FIELD_W = 12;
export const FIELD_H = 20;
export const BRICK_H = 0.5;
/** Top of the brick wall. */
export const WALL_TOP = 1.5;

/** A brick cell: 0 empty, 1 to 3 hits left, UNBREAKABLE never breaks. */
export const UNBREAKABLE = 9;

export interface BricksLevel {
  number: number;
  /** Rows of the wall, top down, FIELD_W cells each. */
  rows: number[][];
  /** Ball speed, in field units per second. */
  speed: number;
  /** Whether power-up capsules can drop. */
  powerUps: boolean;
  difficulty: Difficulty;
  /** Blend of speed, hits and steel (see rateBricks). Drives the label. */
  score?: number;
  tip?: string;
}
