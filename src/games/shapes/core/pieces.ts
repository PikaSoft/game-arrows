/** A piece: its squares as [x, y] from its top-left, how wide and tall it is, and how often it comes. */
export interface Piece {
  id: number;
  cells: [number, number][];
  w: number;
  h: number;
  /** Draw weight at the start of a game, and once the game has warmed up. */
  early: number;
  late: number;
  /** Colour index. */
  colour: number;
}

/** Build a piece from a picture: '#' is a square. */
function shape(rows: string[], early: number, late: number, colour: number): Omit<Piece, 'id'> {
  const cells: [number, number][] = [];
  rows.forEach((r, y) => [...r].forEach((ch, x) => ch === '#' && cells.push([x, y])));
  return { cells, w: Math.max(...rows.map((r) => r.length)), h: rows.length, early, late, colour };
}

const SHAPES: Omit<Piece, 'id'>[] = [
  // Dots and straight lines.
  shape(['#'], 3, 1.5, 0),
  shape(['##'], 3, 2, 1),
  shape(['#', '#'], 3, 2, 1),
  shape(['###'], 3, 2, 2),
  shape(['#', '#', '#'], 3, 2, 2),
  shape(['####'], 1.5, 2, 3),
  shape(['#', '#', '#', '#'], 1.5, 2, 3),
  shape(['#####'], 0.4, 1.4, 4),
  shape(['#', '#', '#', '#', '#'], 0.4, 1.4, 4),
  // Squares and blocks.
  shape(['##', '##'], 3, 2.5, 5),
  shape(['###', '###', '###'], 0.3, 1.2, 6),
  shape(['###', '###'], 0.6, 1.2, 0),
  shape(['##', '##', '##'], 0.6, 1.2, 0),
  // Small corners.
  shape(['##', '#.'], 2, 1.5, 1),
  shape(['##', '.#'], 2, 1.5, 1),
  shape(['#.', '##'], 2, 1.5, 1),
  shape(['.#', '##'], 2, 1.5, 1),
  // L shapes.
  shape(['#.', '#.', '##'], 1, 1.3, 2),
  shape(['.#', '.#', '##'], 1, 1.3, 2),
  shape(['##', '#.', '#.'], 1, 1.3, 2),
  shape(['##', '.#', '.#'], 1, 1.3, 2),
  shape(['###', '#..'], 1, 1.3, 3),
  shape(['###', '..#'], 1, 1.3, 3),
  shape(['#..', '###'], 1, 1.3, 3),
  shape(['..#', '###'], 1, 1.3, 3),
  // T shapes.
  shape(['###', '.#.'], 0.8, 1.2, 4),
  shape(['.#.', '###'], 0.8, 1.2, 4),
  shape(['#.', '##', '#.'], 0.8, 1.2, 4),
  shape(['.#', '##', '.#'], 0.8, 1.2, 4),
  // S and Z shapes.
  shape(['.##', '##.'], 0.6, 1.1, 5),
  shape(['##.', '.##'], 0.6, 1.1, 5),
  shape(['#.', '##', '.#'], 0.6, 1.1, 5),
  shape(['.#', '##', '#.'], 0.6, 1.1, 5),
  // Big corners.
  shape(['###', '#..', '#..'], 0.3, 1, 6),
  shape(['###', '..#', '..#'], 0.3, 1, 6),
  shape(['#..', '#..', '###'], 0.3, 1, 6),
  shape(['..#', '..#', '###'], 0.3, 1, 6),
];

export const PIECES: Piece[] = SHAPES.map((s, id) => ({ ...s, id }));
