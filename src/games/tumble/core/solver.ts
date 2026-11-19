import { bridgeOwner, Board, startOpen, step } from './rules';
import { Block } from './types';

const key = (b: Block, open: number) => `${b.x},${b.y},${b.pose},${open}`;

export interface Solved {
  /** Fewest moves, as directions, or null if the goal can't be reached. */
  path: number[] | null;
  /** States reached. */
  states: number;
}

/** Breadth first over block position, pose and which bridges are open. */
export function solve(board: Board, start: Block, open = startOpen(board.switches), maxStates = 200_000): Solved {
  const owner = bridgeOwner(board.switches);
  const prev = new Map<string, [string, number] | null>();
  const k0 = key(start, open);
  prev.set(k0, null);
  let q: [Block, number, string][] = [[start, open, k0]];
  while (q.length && prev.size < maxStates) {
    const next: [Block, number, string][] = [];
    for (const [b, o, k] of q) {
      for (let d = 0; d < 4; d++) {
        const s = step(board, owner, b, o, d);
        if (s.fell) continue;
        const nk = key(s.block, s.open);
        if (prev.has(nk)) continue;
        prev.set(nk, [k, d]);
        if (s.won) {
          const path: number[] = [];
          for (let c: string = nk; prev.get(c); c = prev.get(c)![0]) path.unshift(prev.get(c)![1]);
          return { path, states: prev.size };
        }
        next.push([s.block, s.open, nk]);
      }
    }
    q = next;
  }
  return { path: null, states: prev.size };
}
