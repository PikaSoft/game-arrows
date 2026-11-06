export type Difficulty = 'Tutorial' | 'Easy' | 'Medium' | 'Hard' | 'Super Hard';

/** A bottle's layers of sand, bottom first. Each number is a colour id. */
export type Bottle = number[];

export interface SandLevel {
  number: number;
  /** Layers each bottle holds. Every colour has exactly this many layers. */
  capacity: number;
  colors: number;
  bottles: Bottle[];
  /** Per bottle, how many layers from the bottom start covered. */
  hidden: number[];
  /** Moves for three stars. */
  par: number;
  difficulty: Difficulty;
  /** Average pours a player trying at random would check to find a safe one. Drives the label. */
  score?: number;
  tip?: string;
}
