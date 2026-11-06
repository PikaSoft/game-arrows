export type Difficulty = 'Tutorial' | 'Easy' | 'Medium' | 'Hard' | 'Super Hard';

/**
 * A bottle's layers, bottom first. Each number is a colour id. Ids from LIQUID_BASE up
 * are liquids: sand sinks through them, so in any bottle all sand sits below all liquid.
 */
export type Bottle = number[];

/** Colour ids at or above this are liquids rather than sand. */
export const LIQUID_BASE = 100;
export const isLiquid = (c: number): boolean => c >= LIQUID_BASE;

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
  /** How many colours are liquid (ids from LIQUID_BASE). */
  liquids?: number;
  tip?: string;
}
