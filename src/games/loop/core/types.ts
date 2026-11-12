export type Difficulty = 'Tutorial' | 'Easy' | 'Medium' | 'Hard' | 'Super Hard';

/** Cubes in a crate, and cubes a tray holds before it ships. */
export const CRATE = 4;

/** The cubes in one crate, in the order they drop. Each number is a colour id. */
export type Crate = number[];

export interface LoopLevel {
  number: number;
  colors: number;
  /** Supply columns. Each is a queue of crates, front first. */
  supply: Crate[][];
  /** Collector bays. Each is a queue of tray colours, front first. */
  bays: number[][];
  /** Slots on the belt. */
  capacity: number;
  /** Simulation steps the belt takes to move one slot. Lower is faster. */
  ticksPerSlot: number;
  /** Crates behind the front one hide their colours. */
  covered: boolean;
  /** Steps allowed from the first tap, or 0 for no clock. */
  limitTicks: number;
  /** A tap order (column numbers) that clears the level when each tap waits for the belt to settle. */
  solution: number[];
  difficulty: Difficulty;
  /** Three times the share of careful random taps that jam the belt (out of 100), plus a little for a clock or covered crates. Drives the label. */
  score?: number;
  tip?: string;
}
