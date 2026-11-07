import { DX, DY } from './types';

/** The board shape the rules need. */
export interface Board {
  w: number;
  h: number;
  rocks: boolean[];
  holes: number[];
  exits: number[];
}

/** A puck that is home (stopped on its exit) is out of play: -1. */
export const HOME = -1;

export interface SlideResult {
  /** Where each puck ends up (HOME once it stops on its exit). */
  pos: number[];
  /** Each puck's path, cell by cell, for animation (empty if it didn't move). */
  paths: number[][];
  /** The puck that fell into a hole, if any: then the move doesn't happen. */
  fell: number | null;
  /** True if anything moved. */
  moved: boolean;
}

/**
 * Swipe toward side d: every puck still in play slides until the next cell is the edge,
 * a rock or another puck. The puck furthest along goes first, so pucks in a line stack
 * up. A puck that slides over a hole falls in (the swipe is undone). A puck that stops
 * on its own exit goes home; passing over it isn't enough.
 */
export function slide(b: Board, pos: number[], d: number): SlideResult {
  const { w, h } = b;
  const holes = new Set(b.holes);
  const next = pos.slice();
  const paths: number[][] = pos.map(() => []);
  const along = (i: number) => (i % w) * DX[d] + ((i / w) | 0) * DY[d];
  const order = pos.map((_, k) => k).filter((k) => pos[k] !== HOME);
  order.sort((a, c) => along(pos[c]) - along(pos[a]));
  let fell: number | null = null;
  for (const k of order) {
    let at = next[k];
    for (;;) {
      const x = (at % w) + DX[d];
      const y = ((at / w) | 0) + DY[d];
      if (x < 0 || y < 0 || x >= w || y >= h) break;
      const to = y * w + x;
      if (b.rocks[to] || next.some((p, j) => j !== k && p === to)) break;
      at = to;
      paths[k].push(to);
      if (holes.has(to)) {
        fell = k;
        break;
      }
    }
    next[k] = at;
    if (fell !== null) break;
  }
  const moved = paths.some((p) => p.length > 0);
  if (fell === null) for (const k of order) if (next[k] === b.exits[k]) next[k] = HOME;
  return { pos: fell === null ? next : pos.slice(), paths, fell, moved };
}

export const allHome = (pos: number[]): boolean => pos.every((p) => p === HOME);
