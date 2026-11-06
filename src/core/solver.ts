import { Arrow, DELTA, Level } from './types';

export interface SolveResult {
  solvable: boolean;
  /** Number of "waves" of simultaneous removals needed. Higher means deeper dependencies. */
  depth: number;
  /** Arrows free on the starting board. */
  initialFree: number;
  /**
   * Average share of the remaining arrows that are free, over a playthrough that
   * removes free arrows oldest first. Steps after every remaining arrow is free are
   * skipped, as the game finishes those itself. Lower means fewer obvious moves.
   */
  freeShare: number;
  /** Ids of arrows left when stuck (empty when solvable). */
  stuck: number[];
}

/**
 * Removing an arrow only ever empties cells, so it can never block another arrow.
 * That makes greedy removal exact: if any order clears the board, this does.
 *
 * Event driven: each arrow waits on its first blocker and is only rechecked when
 * that blocker leaves.
 */
export function solve(level: Pick<Level, 'w' | 'h' | 'arrows'>): SolveResult {
  const { w, h, arrows } = level;
  const n = arrows.length;
  const grid = new Int32Array(w * h).fill(-1);
  arrows.forEach((a, i) => a.cells.forEach((c) => (grid[c.y * w + c.x] = i)));

  // Arrows sitting in each arrow's exit line at the start; used for wave depth.
  const rayOwners: number[][] = arrows.map((a, i) => {
    const out = new Set<number>();
    scan(a, (id) => {
      if (id !== i) out.add(id);
      return false;
    });
    return [...out];
  });

  function scan(a: Arrow, visit: (id: number) => boolean): number {
    const head = a.cells[a.cells.length - 1];
    const d = DELTA[a.dir];
    for (let x = head.x + d.x, y = head.y + d.y; x >= 0 && y >= 0 && x < w && y < h; x += d.x, y += d.y) {
      const id = grid[y * w + x];
      if (id !== -1 && visit(id)) return id;
    }
    return -1;
  }
  const firstBlocker = (a: Arrow) => scan(a, () => true);

  const waiting: number[][] = Array.from({ length: n }, () => []);
  const queue: number[] = [];
  for (let i = 0; i < n; i++) {
    const b = firstBlocker(arrows[i]);
    if (b === -1) queue.push(i);
    else waiting[b].push(i);
  }
  const initialFree = queue.length;
  const wave = new Int32Array(n);
  let removed = 0;
  let depth = 0;
  let shareSum = 0;
  let shareSteps = 0;
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi];
    // Every queued arrow not yet removed is free; every other arrow still waits on a
    // blocker that is still on the board.
    const freeNow = queue.length - qi;
    if (freeNow < n - qi) {
      shareSum += freeNow / (n - qi);
      shareSteps++;
    }
    let wv = 1;
    for (const r of rayOwners[i]) wv = Math.max(wv, wave[r] + 1);
    wave[i] = wv;
    depth = Math.max(depth, wv);
    for (const c of arrows[i].cells) grid[c.y * w + c.x] = -1;
    removed++;
    for (const j of waiting[i]) {
      const b = firstBlocker(arrows[j]);
      if (b === -1) queue.push(j);
      else waiting[b].push(j);
    }
    waiting[i] = [];
  }
  const freeShare = shareSteps ? shareSum / shareSteps : 1;
  if (removed === n) return { solvable: true, depth, initialFree, freeShare, stuck: [] };
  const done = new Set(queue);
  return {
    solvable: false,
    depth,
    initialFree,
    freeShare,
    stuck: arrows.filter((_, i) => !done.has(i)).map((a) => a.id),
  };
}
