/**
 * Lines between dots. Across lines come first: (x, y) joins dot (x, y) to (x + 1, y), for
 * y from 0 to h and x from 0 to w - 1. Then down lines: (x, y) joins dot (x, y) to
 * (x, y + 1), for y from 0 to h - 1 and x from 0 to w. Dots are numbered y * (w + 1) + x.
 */
export interface Grid {
  w: number;
  h: number;
  edges: number;
  /** For each line, its two dots. */
  ends: [number, number][];
  /** For each dot, its lines (2 to 4). */
  dotEdges: number[][];
  /** For each square, its four lines: top, bottom, left, right. */
  cellEdges: number[][];
  /** For each line, the squares on either side (one at the border). */
  edgeCells: number[][];
}

const cache = new Map<string, Grid>();

export const across = (w: number, x: number, y: number): number => y * w + x;
export const down = (w: number, h: number, x: number, y: number): number => (h + 1) * w + y * (w + 1) + x;

export function gridOf(w: number, h: number): Grid {
  const key = `${w}x${h}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const dot = (x: number, y: number) => y * (w + 1) + x;
  const ends: [number, number][] = [];
  for (let y = 0; y <= h; y++) for (let x = 0; x < w; x++) ends.push([dot(x, y), dot(x + 1, y)]);
  for (let y = 0; y < h; y++) for (let x = 0; x <= w; x++) ends.push([dot(x, y), dot(x, y + 1)]);
  const dotEdges = Array.from({ length: (w + 1) * (h + 1) }, () => [] as number[]);
  ends.forEach(([a, b], e) => {
    dotEdges[a].push(e);
    dotEdges[b].push(e);
  });
  const cellEdges: number[][] = [];
  const edgeCells = ends.map(() => [] as number[]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const es = [across(w, x, y), across(w, x, y + 1), down(w, h, x, y), down(w, h, x + 1, y)];
      cellEdges.push(es);
      for (const e of es) edgeCells[e].push(y * w + x);
    }
  const g = { w, h, edges: ends.length, ends, dotEdges, cellEdges, edgeCells };
  cache.set(key, g);
  return g;
}

/** The fence round a set of squares: every line with the set on one side only (outside counts as out). */
export function outline(g: Grid, inside: boolean[]): boolean[] {
  return g.edgeCells.map((cs) => {
    const a = cs[0] !== undefined && inside[cs[0]];
    const b = cs[1] !== undefined && inside[cs[1]];
    return cs.length === 1 ? a : a !== b;
  });
}

/** True if the lines form exactly one closed loop and every number is met. */
export function isLoop(g: Grid, on: ArrayLike<boolean | number>, clues?: number[]): boolean {
  const isOn = (e: number) => on[e] === true || on[e] === 1;
  let count = 0;
  let start = -1;
  for (const es of g.dotEdges) {
    const d = es.filter(isOn).length;
    if (d !== 0 && d !== 2) return false;
  }
  for (let e = 0; e < g.edges; e++)
    if (isOn(e)) {
      count++;
      if (start < 0) start = e;
    }
  if (start < 0) return false;
  // Walk the loop from one line; it must take in every line that's on.
  const seen = new Set([start]);
  let [, cur] = g.ends[start];
  let prev = start;
  for (;;) {
    const next = g.dotEdges[cur].find((e) => e !== prev && isOn(e));
    if (next === undefined || next === start) break;
    seen.add(next);
    const [a, b] = g.ends[next];
    cur = a === cur ? b : a;
    prev = next;
  }
  if (seen.size !== count) return false;
  if (clues) for (let c = 0; c < clues.length; c++) if (clues[c] >= 0 && g.cellEdges[c].filter(isOn).length !== clues[c]) return false;
  return true;
}
