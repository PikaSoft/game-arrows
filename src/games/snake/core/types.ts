/** Directions in clockwise order: up, right, down, left. */
export type Dir = 0 | 1 | 2 | 3;
export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;
export const opposite = (d: Dir): Dir => ((d + 2) % 4) as Dir;

export interface Point {
  x: number;
  y: number;
}

export interface SnakeLevel {
  number: number;
  w: number;
  h: number;
  /** Cell indices (y * w + x) that are walls. The edge of the board is always solid. */
  walls: number[];
  /** Snake cells, head first. */
  start: Point[];
  dir: Dir;
  /** Apples to eat to finish the level. */
  target: number;
  /** Steps per second. */
  speed: number;
  /** Time for three stars, in ms. */
  par: number;
  difficulty: string;
  tip?: string;
}
