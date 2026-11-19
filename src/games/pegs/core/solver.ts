import { apply, count, legal, undoJump } from './rules';
import { Jump } from './types';

export interface SearchResult {
  /** Jumps that finish as asked, or null if none was found. */
  path: Jump[] | null;
  /** Positions looked at. */
  nodes: number;
  /** True if the search ran out of positions before deciding. */
  capped: boolean;
}

/**
 * Look for a way to finish with one peg: on `goal`, or anywhere if goal is null. Depth
 * first, remembering positions already found to be dead ends. Capped by positions, not
 * time, so every device gives the same answer.
 */
export function search(jumps: Jump[], start: boolean[], goal: number | null, maxNodes = 150_000): SearchResult {
  const pegs = start.slice();
  // Pack the pegs into a short string key, 30 holes to a number.
  const holes: number[] = [];
  for (const j of jumps) for (const i of [j.from, j.over, j.to]) if (!holes.includes(i)) holes.push(i);
  for (let i = 0; i < pegs.length; i++) if (pegs[i] && !holes.includes(i)) holes.push(i);
  const key = () => {
    let a = 0;
    let b = 0;
    let c = 0;
    holes.forEach((i, k) => {
      if (!pegs[i]) return;
      if (k < 30) a |= 1 << k;
      else if (k < 60) b |= 1 << (k - 30);
      else c |= 1 << (k - 60);
    });
    return `${a},${b},${c}`;
  };
  const dead = new Set<string>();
  const path: Jump[] = [];
  let nodes = 0;
  let capped = false;
  let left = count(pegs);
  const go = (): boolean => {
    if (left === 1) return goal === null || pegs[goal];
    if (++nodes > maxNodes) {
      capped = true;
      return false;
    }
    const k = key();
    if (dead.has(k)) return false;
    for (const j of legal(jumps, pegs)) {
      apply(pegs, j);
      left--;
      path.push(j);
      if (go()) return true;
      path.pop();
      left++;
      undoJump(pegs, j);
      if (capped) return false;
    }
    dead.add(k);
    return false;
  };
  const ok = go();
  return { path: ok ? path.slice() : null, nodes, capped };
}
