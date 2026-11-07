/** Board size: SIZE x SIZE squares. */
export const SIZE = 5;
/** A stone in a square: it doesn't slide, blocks tiles, and crumbles after a few moves. */
export const STONE = -1;

/**
 * A square: 0 empty, a positive tile value (1, 2, 4, 8…), or STONE. Stones carry how many
 * more moves they last in a parallel `life` array.
 */
export interface Board {
  cells: number[];
  life: number[];
}

export interface Merge {
  /** The square the merged tile ends up in, and its new value. */
  at: number;
  value: number;
}

export interface SlideResult {
  board: Board;
  /** Where each tile came from and went to, for animation. */
  moves: { from: number; to: number }[];
  merges: Merge[];
  /** Points scored: the sum of the merged tiles' new values. */
  gained: number;
  changed: boolean;
}

/** Side indices: 0 up, 1 right, 2 down, 3 left. */
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

/**
 * The squares of each line along direction d, leading edge first: for a swipe right, each
 * row read from right to left, so tiles pile up against the right side.
 */
export function lines(d: number): number[][] {
  const out: number[][] = [];
  for (let k = 0; k < SIZE; k++) {
    const line: number[] = [];
    for (let j = 0; j < SIZE; j++) {
      // Start at the edge the tiles move toward.
      let x: number;
      let y: number;
      if (DX[d] !== 0) {
        y = k;
        x = DX[d] > 0 ? SIZE - 1 - j : j;
      } else {
        x = k;
        y = DY[d] > 0 ? SIZE - 1 - j : j;
      }
      line.push(y * SIZE + x);
    }
    out.push(line);
  }
  return out;
}

/**
 * Swipe toward side d. In each line, tiles slide toward that side until they hit the
 * edge, a stone or another tile. Then, from the leading edge, two equal tiles side by
 * side merge into one worth both (each tile merges at most once per swipe). Stones stay
 * put and split a line into separate stretches.
 */
export function slide(b: Board, d: number): SlideResult {
  const cells = b.cells.slice();
  const life = b.life.slice();
  const moves: { from: number; to: number }[] = [];
  const merges: Merge[] = [];
  let gained = 0;
  for (const line of lines(d)) {
    // Split into stretches between stones.
    let start = 0;
    for (let j = 0; j <= SIZE; j++) {
      if (j < SIZE && b.cells[line[j]] !== STONE) continue;
      const stretch = line.slice(start, j);
      start = j + 1;
      const tiles = stretch.filter((c) => b.cells[c] > 0);
      for (const c of stretch) cells[c] = 0;
      let out = 0;
      for (let t = 0; t < tiles.length; ) {
        const v = b.cells[tiles[t]];
        const to = stretch[out++];
        if (t + 1 < tiles.length && b.cells[tiles[t + 1]] === v) {
          cells[to] = v * 2;
          merges.push({ at: to, value: v * 2 });
          gained += v * 2;
          for (let m = 0; m < 2; m++) moves.push({ from: tiles[t + m], to });
          t += 2;
        } else {
          cells[to] = v;
          moves.push({ from: tiles[t], to });
          t++;
        }
      }
    }
  }
  const changed = merges.length > 0 || moves.some((m) => m.from !== m.to);
  return { board: { cells, life }, moves, merges, gained, changed };
}

/** True if no swipe would change anything. */
export const stuck = (b: Board): boolean => [0, 1, 2, 3].every((d) => !slide(b, d).changed);

export const emptyBoard = (): Board => ({ cells: new Array(SIZE * SIZE).fill(0), life: new Array(SIZE * SIZE).fill(0) });
