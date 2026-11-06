export type Difficulty = 'Tutorial' | 'Easy' | 'Medium' | 'Hard' | 'Super Hard';

export type Side = 'top' | 'right' | 'bottom' | 'left';
export const SIDES: Side[] = ['top', 'right', 'bottom', 'left'];

/** Unit step for leaving through each side. */
export const OUTWARD: Record<Side, [number, number]> = {
  top: [0, -1],
  right: [1, 0],
  bottom: [0, 1],
  left: [-1, 0],
};

/** An opening in the frame: `len` cells along one side, from `start` (column or row). */
export interface Gap {
  side: Side;
  start: number;
  len: number;
  /** A coloured gate only lets blocks of that colour through. Null lets anything through. */
  color: number | null;
}

export interface Block {
  /** Index into SHAPES. */
  shape: number;
  color: number;
  /** Top-left of the shape's bounding box, in cells. */
  x: number;
  y: number;
}

export interface SqueezeLevel {
  number: number;
  w: number;
  h: number;
  blocks: Block[];
  gaps: Gap[];
  /** Moves for three stars: the solver's shortest solution. */
  par: number;
  difficulty: Difficulty;
  /** Moves in the best solution that do not take a block out. Drives the label. */
  score?: number;
  tip?: string;
}
