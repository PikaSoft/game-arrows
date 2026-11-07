import { DX, DY } from './types';

/** The cell one step from i through side d. Walls ring the board, so this never leaves it. */
export const step = (w: number, i: number, d: number): number => i + DX[d] + DY[d] * w;

/** Board shape the rules need. */
export interface Room {
  w: number;
  h: number;
  walls: boolean[] | Uint8Array;
}

/**
 * Cells the player can walk to without pushing anything, from `from`, as a mark per cell
 * (1 = reachable). `blocked` marks crate cells.
 */
export function reach(room: Room, blocked: Uint8Array, from: number): Uint8Array {
  const seen = new Uint8Array(room.w * room.h);
  const stack = [from];
  seen[from] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    for (let d = 0; d < 4; d++) {
      const j = step(room.w, i, d);
      if (seen[j] || room.walls[j] || blocked[j]) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return seen;
}

/** Shortest walk from `from` to `to` around walls and crates, as cells after `from`. Null if none. */
export function walkPath(room: Room, crates: number[], from: number, to: number): number[] | null {
  if (from === to) return [];
  const n = room.w * room.h;
  const blocked = new Uint8Array(n);
  for (const c of crates) blocked[c] = 1;
  if (room.walls[to] || blocked[to]) return null;
  const prev = new Int32Array(n).fill(-1);
  prev[from] = from;
  const queue = [from];
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    if (i === to) break;
    for (let d = 0; d < 4; d++) {
      const j = step(room.w, i, d);
      if (prev[j] >= 0 || room.walls[j] || blocked[j]) continue;
      prev[j] = i;
      queue.push(j);
    }
  }
  if (prev[to] < 0) return null;
  const path: number[] = [];
  for (let i = to; i !== from; i = prev[i]) path.push(i);
  return path.reverse();
}

/** All crates on targets. */
export const solved = (crates: number[], targets: number[]): boolean => crates.every((c) => targets.includes(c));

/**
 * Cells a crate can never leave alive: a crate pushed there can never reach any target.
 * Found by pulling from every target: a crate can be pushed from cell c to a target only
 * if a pull from that target, with room for the player, can bring it back to c.
 */
export function liveCells(room: Room, targets: number[]): Uint8Array {
  const live = new Uint8Array(room.w * room.h);
  const stack = targets.slice();
  for (const t of targets) live[t] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    for (let d = 0; d < 4; d++) {
      // Pull the crate from i toward d: the player stands at i + d and steps to i + 2d.
      const a = step(room.w, i, d);
      if (room.walls[a]) continue;
      const b = step(room.w, a, d);
      if (b < 0 || b >= live.length || room.walls[b] || live[a]) continue;
      live[a] = 1;
      stack.push(a);
    }
  }
  return live;
}
