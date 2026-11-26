/**
 * The seven four-cell pieces. Each is drawn in a square box (4 wide for the long bar, 2 for
 * the square, 3 for the rest) and turns about the middle of that box, so the four states
 * come from rotating the first one. Rows go down the screen.
 */
export type PieceId = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type Cell = readonly [number, number];

export const PIECE_NAMES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'] as const;
export const PIECE_COUNT = 7;

const SPAWN: { box: number; cells: Cell[] }[] = [
  { box: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] }, // I
  { box: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] }, // O
  { box: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] }, // T
  { box: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] }, // S
  { box: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] }, // Z
  { box: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] }, // J
  { box: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] }, // L
];

/** Turn a shape a quarter clockwise inside its box. */
const turn = (cells: Cell[], box: number): Cell[] => cells.map(([x, y]) => [box - 1 - y, x] as const);

/** BOX[id] is the box size; SHAPES[id][rot] the cells for rotation 0 (spawn) to 3. */
export const BOX: number[] = SPAWN.map((s) => s.box);
export const SHAPES: Cell[][][] = SPAWN.map(({ box, cells }) => {
  const out = [cells];
  for (let r = 1; r < 4; r++) out.push(turn(out[r - 1], box));
  return out;
});

/**
 * Wall kicks: offsets tried in order when a turn doesn't fit where the piece is. Written
 * with y going up (the usual way these tables are given) and flipped when used.
 * Keyed by "from" and "to" rotation, e.g. "01" is spawn to a quarter clockwise.
 */
const KICKS_MAIN: Record<string, Cell[]> = {
  '01': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '10': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '12': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '21': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '23': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '32': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '30': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '03': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const KICKS_BAR: Record<string, Cell[]> = {
  '01': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '10': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '12': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '21': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '23': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '32': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '30': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '03': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

/** Kick offsets for a turn, in screen terms (y down). */
export function kicks(id: PieceId, from: number, to: number): Cell[] {
  if (id === 1) return [[0, 0]];
  const table = id === 0 ? KICKS_BAR : KICKS_MAIN;
  return table[`${from}${to}`].map(([x, y]) => [x, y === 0 ? 0 : -y] as const);
}
