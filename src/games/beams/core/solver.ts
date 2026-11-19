import { Board, entry, exitPort, isMirror, reflect, samePort } from './rules';
import { CRYSTAL, DX, DY, MIRROR, Orient, WALL } from './types';

export interface SolveResult {
  /** Fewest taps from `start` that solve the board, or null if none was found. */
  taps: number | null;
  /** A way round for every mirror in a cheapest solution (untouched mirrors keep `start`). */
  orient: Orient[] | null;
  /** Distinct solutions found (different beam paths), up to the search cap. */
  solutions: number;
  /** Search steps taken. */
  nodes: number;
  /** True if the cap stopped the search early. */
  capped: boolean;
}

/**
 * Follow the beams one at a time from `start`. A turnable mirror is decided only when a
 * beam first reaches it: both ways round are tried (keeping it as it is first). Mirrors no
 * beam touches stay as they are, since they can't matter. A beam must leave through its
 * own target, and once every beam is placed every crystal must be lit.
 *
 * `exhaustive` explores everything (to count solutions and measure effort); otherwise
 * branches that already cost as much as the best found are cut. Work is capped by steps,
 * not time, so every device gets the same answer.
 */
export function solve(b: Board, start: ArrayLike<number>, exhaustive = true, maxNodes = 150_000): SolveResult {
  const { w, h, cells, beams } = b;
  const n = w * h;
  const set = new Int8Array(n).fill(-1);
  for (let i = 0; i < n; i++) if (cells[i] !== MIRROR && isMirror(cells[i])) set[i] = start[i];
  const litCount = new Int16Array(n);
  const crystals: number[] = [];
  for (let i = 0; i < n; i++) if (cells[i] === CRYSTAL) crystals.push(i);
  let nodes = 0;
  let capped = false;
  let solutions = 0;
  let best = Infinity;
  let bestSet: Int8Array | null = null;

  const finish = (cost: number) => {
    for (const c of crystals) if (litCount[c] === 0) return;
    solutions++;
    if (cost < best) {
      best = cost;
      bestSet = set.slice();
    }
  };

  // Walk beam `k` from (cell, dir) with `cost` taps spent so far.
  const walk = (k: number, cell: number, dir: number, cost: number): void => {
    if (capped) return;
    if (++nodes > maxNodes) {
      capped = true;
      return;
    }
    if (!exhaustive && cost >= best) return;
    const lit: number[] = [];
    for (let step = 0; step < n * 4 + 4; step++) {
      const c = cells[cell];
      if (c === WALL) break;
      litCount[cell]++;
      lit.push(cell);
      if (c === MIRROR && set[cell] < 0) {
        // Decide this mirror: as it is (free), then turned (one tap).
        for (const o of [start[cell], 1 - start[cell]] as Orient[]) {
          set[cell] = o;
          const d = reflect(dir, o);
          next(k, cell, d, cost + (o === start[cell] ? 0 : 1));
          set[cell] = -1;
        }
        break;
      }
      if (isMirror(c)) dir = reflect(dir, set[cell] as Orient);
      const x = (cell % w) + DX[dir];
      const y = ((cell / w) | 0) + DY[dir];
      if (x < 0 || y < 0 || x >= w || y >= h) {
        if (samePort(exitPort(cell % w, (cell / w) | 0, dir), beams[k].target)) startBeam(k + 1, cost);
        break;
      }
      cell = y * w + x;
    }
    for (const c of lit) litCount[c]--;
  };

  // Continue from a mirror just decided: step out of it in direction d.
  const next = (k: number, cell: number, d: number, cost: number) => {
    const x = (cell % w) + DX[d];
    const y = ((cell / w) | 0) + DY[d];
    if (x < 0 || y < 0 || x >= w || y >= h) {
      if (samePort(exitPort(cell % w, (cell / w) | 0, d), beams[k].target)) startBeam(k + 1, cost);
      return;
    }
    walk(k, y * w + x, d, cost);
  };

  const startBeam = (k: number, cost: number) => {
    if (k === beams.length) return finish(cost);
    const e = entry(w, h, beams[k].lamp);
    walk(k, e.cell, e.dir, cost);
  };

  startBeam(0, 0);
  let orient: Orient[] | null = null;
  if (bestSet) {
    const s = bestSet as Int8Array;
    orient = Array.from({ length: n }, (_, i) => (isMirror(cells[i]) ? ((s[i] >= 0 ? s[i] : start[i]) as Orient) : 0));
  }
  return { taps: Number.isFinite(best) ? best : null, orient, solutions, nodes, capped };
}
