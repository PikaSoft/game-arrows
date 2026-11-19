export type Difficulty = 'Tutorial' | 'Easy' | 'Medium' | 'Hard' | 'Super Hard';

export interface Island {
  x: number;
  y: number;
  /** Bridges this island needs. */
  n: number;
}

/** A pair of islands that can see each other along a row or column, with nothing between. */
export interface Link {
  a: number;
  b: number;
  /** True for a link along a row. */
  across: boolean;
  /** The squares between the two islands. */
  cells: number[];
}

export interface BridgesLevel {
  number: number;
  w: number;
  h: number;
  islands: Island[];
  /** Every possible link, in a fixed order (see links()). */
  links: Link[];
  /** Bridges on each link in the one answer (0, 1 or 2). */
  solution: number[];
  difficulty: Difficulty;
  /** Difficulty score (1 to 4, see rateBridges). Drives the label. */
  score?: number;
  /** Name of the hardest step needed, for the label's tooltip. */
  hardest?: string;
  tip?: string;
}
