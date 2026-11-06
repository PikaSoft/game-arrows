export type Dir = 'U' | 'D' | 'L' | 'R';

export interface Cell {
  x: number;
  y: number;
}

/** An arrow is a chain of orthogonally adjacent cells. The last cell is the head. */
export interface Arrow {
  id: number;
  cells: Cell[];
  dir: Dir;
}

export type Difficulty = 'Tutorial' | 'Easy' | 'Medium' | 'Hard' | 'Super Hard';

export interface Level {
  number: number;
  w: number;
  h: number;
  arrows: Arrow[];
  difficulty: Difficulty;
  /** Optional one-line tip shown on tutorial levels. */
  tip?: string;
}

export const DIRS: Dir[] = ['U', 'D', 'L', 'R'];

export const DELTA: Record<Dir, Cell> = {
  U: { x: 0, y: -1 },
  D: { x: 0, y: 1 },
  L: { x: -1, y: 0 },
  R: { x: 1, y: 0 },
};

export const OPPOSITE: Record<Dir, Dir> = { U: 'D', D: 'U', L: 'R', R: 'L' };

export function dirBetween(a: Cell, b: Cell): Dir | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 1 && dy === 0) return 'R';
  if (dx === -1 && dy === 0) return 'L';
  if (dx === 0 && dy === 1) return 'D';
  if (dx === 0 && dy === -1) return 'U';
  return null;
}
