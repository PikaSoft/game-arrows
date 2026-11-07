import { Rng } from '../../../shared/rng';
import { neighbour } from './rules';
import { DIRS } from './types';

/**
 * A random spanning tree over the grid, as each cell's openings. Every cell is reached
 * and there are no loops, so the pipes form one network with nothing left over.
 *
 * Grown from `root` like randomised Prim's: each step picks an edge from the frontier and
 * joins the cell it leads to. `straight` (0..1) prefers carrying on in the direction the
 * pipe came from, which gives longer runs and fewer short dead ends. `branchy` (0..1)
 * prefers growing from the newest cell (long winding paths) over a random one (bushy).
 */
export function spanningTree(w: number, h: number, root: number, rng: Rng, straight = 0.3, branchy = 0.5): number[] {
  const n = w * h;
  const masks = new Array<number>(n).fill(0);
  const inTree = new Uint8Array(n);
  /** Frontier edges: from cell, side index, and the side the pipe arrived through. */
  const frontier: { i: number; d: number; came: number }[] = [];
  const addEdges = (i: number, came: number) => {
    for (let d = 0; d < 4; d++) {
      const j = neighbour(w, h, i, d);
      if (j >= 0 && !inTree[j]) frontier.push({ i, d, came });
    }
  };
  inTree[root] = 1;
  addEdges(root, -1);
  let joined = 1;
  while (joined < n && frontier.length) {
    let k: number;
    if (rng.next() < branchy) {
      // Grow from the newest cell, preferring to carry straight on.
      let last = frontier.length - 1;
      const from = frontier[last].i;
      const options: number[] = [];
      while (last >= 0 && frontier[last].i === from) options.push(last--);
      const ahead = options.find((o) => frontier[o].d === frontier[o].came);
      k = ahead !== undefined && rng.next() < straight ? ahead : rng.pick(options);
    } else k = rng.int(0, frontier.length - 1);
    const e = frontier[k];
    frontier.splice(k, 1);
    const j = neighbour(w, h, e.i, e.d);
    if (inTree[j]) continue;
    inTree[j] = 1;
    joined++;
    masks[e.i] |= DIRS[e.d];
    masks[j] |= DIRS[(e.d + 2) % 4];
    addEdges(j, e.d);
  }
  return masks;
}
