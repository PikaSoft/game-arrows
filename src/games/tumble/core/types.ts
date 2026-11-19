export type Difficulty = 'Tutorial' | 'Easy' | 'Medium' | 'Hard' | 'Super Hard';

/** How the block lies: standing on one square, or lying across two side by side, or two one above the other. */
export const STAND = 0;
export const ACROSS = 1;
export const DOWN = 2;
export type Pose = typeof STAND | typeof ACROSS | typeof DOWN;

/** The block: its top-left square and its pose. */
export interface Block {
  x: number;
  y: number;
  pose: Pose;
}

/** Squares. */
export const NONE = 0;
export const FLOOR = 1;
/** Holds a lying block; breaks under a standing one. */
export const WEAK = 2;
export const SWITCH = 3;
/** Solid only while its switch has it open. */
export const BRIDGE = 4;
export const GOAL = 5;

/** A switch and the bridge squares it opens and closes. */
export interface Switch {
  at: number;
  bridges: number[];
  /** True if its bridges start open. */
  open: boolean;
}

/** Directions: north, east, south, west (as Ice Slide). */
export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];

export interface TumbleLevel {
  number: number;
  w: number;
  h: number;
  tiles: number[];
  start: Block;
  goal: number;
  switches: Switch[];
  /** Fewest moves to stand on the goal. */
  par: number;
  /** One shortest way, as directions. */
  solution: number[];
  difficulty: Difficulty;
  /** Weighted par (see rateTumble). Drives the label. */
  score?: number;
  tip?: string;
}
