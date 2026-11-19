import { Jump } from './types';

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Every jump the board's shape allows, whether or not pegs are there for it. */
export function allJumps(w: number, h: number, holes: boolean[]): Jump[] {
  const out: Jump[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!holes[y * w + x]) continue;
      for (const [dx, dy] of DIRS) {
        const x2 = x + 2 * dx;
        const y2 = y + 2 * dy;
        if (x2 < 0 || y2 < 0 || x2 >= w || y2 >= h) continue;
        const over = (y + dy) * w + x + dx;
        const to = y2 * w + x2;
        if (holes[over] && holes[to]) out.push({ from: y * w + x, over, to });
      }
    }
  return out;
}

/** Jumps the pegs allow right now. */
export function legal(jumps: Jump[], pegs: ArrayLike<boolean>): Jump[] {
  return jumps.filter((j) => pegs[j.from] && pegs[j.over] && !pegs[j.to]);
}

export function apply(pegs: boolean[], j: Jump): void {
  pegs[j.from] = false;
  pegs[j.over] = false;
  pegs[j.to] = true;
}

export function undoJump(pegs: boolean[], j: Jump): void {
  pegs[j.from] = true;
  pegs[j.over] = true;
  pegs[j.to] = false;
}

export const count = (pegs: ArrayLike<boolean>): number => {
  let n = 0;
  for (let i = 0; i < pegs.length; i++) if (pegs[i]) n++;
  return n;
};
