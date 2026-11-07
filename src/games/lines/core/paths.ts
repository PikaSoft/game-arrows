import { Rng } from '../../../shared/rng';
import { neighbour } from './rules';

/**
 * Split the grid into paths by joining them up: start with every cell on its own, then
 * keep joining the end of one path to the end of a neighbouring one, at random, as long
 * as the joined path never runs alongside itself. A path that touches itself leaves room
 * for a shortcut, and such boards almost never have one solution. Stops at `target` paths or when no join
 * is left. Null if some path ends up shorter than `min` cells.
 */
export function growPaths(w: number, h: number, target: number, min: number, rng: Rng, maxLen = w * h): number[][] | null {
  const n = w * h;
  const owner = new Int32Array(n);
  const paths = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    owner[i] = i;
    paths.set(i, [i]);
  }
  /** True if joining end `e` of p to end `j` of q leaves no other contact between them. */
  const clean = (p: number[], e: number, j: number, qid: number) => {
    for (const a of p) {
      for (let d = 0; d < 4; d++) {
        const b = neighbour(w, h, a, d);
        if (b < 0 || owner[b] !== qid) continue;
        if (a === e && b === j) continue;
        return false;
      }
    }
    return true;
  };
  while (paths.size > target) {
    // Pick a random path end and try its neighbours; shorter paths go first so pieces even out.
    const ids = rng.shuffle([...paths.keys()]);
    ids.sort((a, b) => paths.get(a)!.length - paths.get(b)!.length);
    let joined = false;
    for (const pid of ids.slice(0, Math.max(4, ids.length >> 1))) {
      const p = paths.get(pid)!;
      const ends = p.length === 1 ? [p[0]] : rng.shuffle([p[0], p[p.length - 1]]);
      for (const e of ends) {
        const dirs = rng.shuffle([0, 1, 2, 3]);
        for (const d of dirs) {
          const j = neighbour(w, h, e, d);
          if (j < 0) continue;
          const qid = owner[j];
          if (qid === pid) continue;
          const q = paths.get(qid)!;
          if (q[0] !== j && q[q.length - 1] !== j) continue;
          if (p.length + q.length > maxLen) continue;
          if (!clean(p, e, j, qid)) continue;
          // Join: p ends at e, q starts at j.
          const pp = p[p.length - 1] === e ? p : p.slice().reverse();
          const qq = q[0] === j ? q : q.slice().reverse();
          const merged = pp.concat(qq);
          for (const c of qq) owner[c] = pid;
          paths.delete(qid);
          paths.set(pid, merged);
          joined = true;
          break;
        }
        if (joined) break;
      }
      if (joined) break;
    }
    if (!joined) break;
  }
  const out = [...paths.values()];
  return out.every((p) => p.length >= min) ? out : null;
}
