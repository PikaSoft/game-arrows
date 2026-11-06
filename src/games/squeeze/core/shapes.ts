/** A shape is a list of cells [dx, dy] whose bounding box starts at 0, 0. */
export interface Shape {
  name: string;
  cells: [number, number][];
  w: number;
  h: number;
}

function shape(name: string, rows: string[]): Shape {
  const cells: [number, number][] = [];
  rows.forEach((r, y) => [...r].forEach((ch, x) => ch === '#' && cells.push([x, y])));
  return { name, cells, w: Math.max(...rows.map((r) => r.length)), h: rows.length };
}

/** Every shape the generator can use. Shapes never rotate in play, so each turn is its own entry. */
export const SHAPES: Shape[] = [
  shape('dot', ['#']),
  shape('bar2h', ['##']),
  shape('bar2v', ['#', '#']),
  shape('bar3h', ['###']),
  shape('bar3v', ['#', '#', '#']),
  shape('corner-a', ['##', '#.']),
  shape('corner-b', ['##', '.#']),
  shape('corner-c', ['#.', '##']),
  shape('corner-d', ['.#', '##']),
  shape('square', ['##', '##']),
  shape('bar4h', ['####']),
  shape('bar4v', ['#', '#', '#', '#']),
  shape('l-a', ['#.', '#.', '##']),
  shape('l-b', ['###', '#..']),
  shape('l-c', ['##', '.#', '.#']),
  shape('l-d', ['..#', '###']),
  shape('j-a', ['.#', '.#', '##']),
  shape('j-b', ['#..', '###']),
  shape('t-a', ['###', '.#.']),
  shape('t-b', ['.#.', '###']),
  shape('t-c', ['#.', '##', '#.']),
  shape('t-d', ['.#', '##', '.#']),
  shape('s-h', ['.##', '##.']),
  shape('z-h', ['##.', '.##']),
  shape('s-v', ['#.', '##', '.#']),
  shape('z-v', ['.#', '##', '#.']),
  shape('p', ['##', '##', '#.']),
  shape('u', ['#.#', '###']),
  shape('plus', ['.#.', '###', '.#.']),
  shape('rect3', ['###', '###']),
];

export const shapeIndex = (name: string): number => SHAPES.findIndex((s) => s.name === name);

/** Groups the generator draws from as levels get harder. */
export const SMALL = ['dot', 'bar2h', 'bar2v', 'bar3h', 'bar3v'].map(shapeIndex);
export const MEDIUM = ['corner-a', 'corner-b', 'corner-c', 'corner-d', 'square', 'bar4h', 'bar4v'].map(shapeIndex);
export const LARGE = ['l-a', 'l-b', 'l-c', 'l-d', 'j-a', 'j-b', 't-a', 't-b', 't-c', 't-d', 's-h', 'z-h', 's-v', 'z-v'].map(shapeIndex);
export const HUGE = ['p', 'u', 'plus', 'rect3'].map(shapeIndex);
