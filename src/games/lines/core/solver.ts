import { neighbour } from './rules';

/*
 * The solver grows every colour's path from both of its dots at once. Each colour has two
 * ends (end 2c starts at the first dot, 2c + 1 at the second); an end moves into an empty
 * cell next to it, or joins the colour's other end, which finishes the colour.
 */

export interface State {
  w: number;
  h: number;
  /** Colour + 1 in each cell, 0 when empty. */
  grid: Int8Array;
  /** The cell each end has reached. */
  heads: Int16Array;
  done: Uint8Array;
}

export function startState(w: number, h: number, dots: [number, number][]): State {
  const grid = new Int8Array(w * h);
  const heads = new Int16Array(dots.length * 2);
  dots.forEach(([a, b], c) => {
    grid[a] = c + 1;
    grid[b] = c + 1;
    heads[2 * c] = a;
    heads[2 * c + 1] = b;
  });
  return { w, h, grid, heads, done: new Uint8Array(dots.length) };
}

const clone = (s: State): State => ({ w: s.w, h: s.h, grid: s.grid.slice(), heads: s.heads.slice(), done: s.done.slice() });

/** Where end e can go next: empty cells beside it, or its partner's cell to finish. */
export function movesOf(s: State, e: number): number[] {
  const c = e >> 1;
  if (s.done[c]) return [];
  const head = s.heads[e];
  const partner = s.heads[e ^ 1];
  const out: number[] = [];
  for (let d = 0; d < 4; d++) {
    const j = neighbour(s.w, s.h, head, d);
    if (j < 0) continue;
    if (s.grid[j] === 0 || j === partner) out.push(j);
  }
  return out;
}

export function apply(s: State, e: number, cell: number): State {
  const t = clone(s);
  const c = e >> 1;
  if (cell === s.heads[e ^ 1]) t.done[c] = 1;
  else {
    t.grid[cell] = c + 1;
    t.heads[e] = cell;
  }
  return t;
}

/**
 * Quick checks that a position can still be finished:
 * - every empty cell has at least two neighbours a path could come in through (empty
 *   cells or the ends of unfinished colours), since a path must pass through it;
 * - every unfinished colour's two ends still touch a shared empty area (or each other);
 * - every empty area is touched by both ends of some unfinished colour, or nothing could
 *   ever fill it.
 */
export function viable(s: State): boolean {
  const { w, h, grid, heads, done } = s;
  const n = w * h;
  const isHead = new Int8Array(n); // colour + 1 of an unfinished end in that cell
  for (let e = 0; e < heads.length; e++) if (!done[e >> 1]) isHead[heads[e]] = (e >> 1) + 1;
  // Label the empty areas.
  const region = new Int16Array(n).fill(-1);
  let regions = 0;
  const stack: number[] = [];
  for (let i = 0; i < n; i++) {
    if (grid[i] !== 0) continue;
    let open = 0;
    for (let d = 0; d < 4; d++) {
      const j = neighbour(w, h, i, d);
      if (j >= 0 && (grid[j] === 0 || isHead[j])) open++;
    }
    if (open < 2) return false;
    if (region[i] >= 0) continue;
    region[i] = regions;
    stack.push(i);
    while (stack.length) {
      const k = stack.pop()!;
      for (let d = 0; d < 4; d++) {
        const j = neighbour(w, h, k, d);
        if (j >= 0 && grid[j] === 0 && region[j] < 0) {
          region[j] = regions;
          stack.push(j);
        }
      }
    }
    regions++;
  }
  const served = new Uint8Array(regions);
  // Regions next to a cell, as a small list.
  const touching = (i: number): number[] => {
    const out: number[] = [];
    for (let d = 0; d < 4; d++) {
      const j = neighbour(w, h, i, d);
      if (j >= 0 && region[j] >= 0 && !out.includes(region[j])) out.push(region[j]);
    }
    return out;
  };
  for (let c = 0; c < done.length; c++) {
    if (done[c]) continue;
    const a = heads[2 * c];
    const b = heads[2 * c + 1];
    const ra = touching(a);
    const rb = touching(b);
    const shared = ra.filter((r) => rb.includes(r));
    for (const r of shared) served[r] = 1;
    if (shared.length) continue;
    // No shared area: the ends must be side by side and join directly.
    let side = false;
    for (let d = 0; d < 4; d++) if (neighbour(w, h, a, d) === b) side = true;
    if (!side) return false;
  }
  for (let r = 0; r < regions; r++) if (!served[r]) return false;
  return true;
}

export const finished = (s: State): boolean => s.done.every(Boolean);

/** Moves of end e that keep the position viable. */
export function legalMoves(s: State, e: number): { cell: number; next: State }[] {
  const out: { cell: number; next: State }[] = [];
  for (const cell of movesOf(s, e)) {
    const next = apply(s, e, cell);
    if (viable(next)) out.push({ cell, next });
  }
  return out;
}

/** Each colour's path, dot to dot, read back from a finished position. */
export function pathsFrom(s: State, dots: [number, number][]): number[][] {
  return dots.map(([a, b], c) => {
    const path = [a];
    const seen = new Set([a]);
    let cur = a;
    while (cur !== b) {
      let next = -1;
      for (let d = 0; d < 4 && next < 0; d++) {
        const j = neighbour(s.w, s.h, cur, d);
        if (j >= 0 && !seen.has(j) && s.grid[j] === c + 1) next = j;
      }
      if (next < 0) break;
      seen.add(next);
      path.push(next);
      cur = next;
    }
    return path;
  });
}

export interface SearchResult {
  /** Solutions found, stopping at `limit`. */
  count: number;
  first: State | null;
  /** True if the node budget ran out before the search finished. */
  exhausted: boolean;
  nodes: number;
}

/**
 * Backtracking search. At each step it picks the end with the fewest options and tries
 * each. Counts solutions up to `limit`, so limit 2 tells whether a board has exactly one.
 * Work is capped by nodes, not time, so every device gets the same answer.
 */
export function search(w: number, h: number, dots: [number, number][], limit = 2, budget = 20000): SearchResult {
  const res: SearchResult = { count: 0, first: null, exhausted: false, nodes: 0 };
  const root = startState(w, h, dots);
  if (!viable(root)) return res;
  const ends = dots.length * 2;
  const go = (s: State): void => {
    if (res.count >= limit || res.exhausted) return;
    if (++res.nodes > budget) {
      res.exhausted = true;
      return;
    }
    if (finished(s)) {
      // Every colour joined and no empty cell left (viable() leaves none unserved).
      if (s.grid.every((g) => g !== 0)) {
        res.count++;
        if (!res.first) res.first = s;
      }
      return;
    }
    // The end with the fewest raw options; a forced end needs no checking of the others.
    let best = -1;
    let bestMoves: number[] = [];
    for (let e = 0; e < ends; e++) {
      if (s.done[e >> 1]) continue;
      const m = movesOf(s, e);
      if (best < 0 || m.length < bestMoves.length) {
        best = e;
        bestMoves = m;
        if (m.length <= 1) break;
      }
    }
    for (const cell of bestMoves) {
      const next = apply(s, best, cell);
      if (viable(next)) go(next);
      if (res.count >= limit || res.exhausted) return;
    }
  };
  go(root);
  return res;
}

export interface Rating {
  /** Average over the solve of (open ends + 1) / (forced ends + 1). */
  score: number;
  /** Steps where no end was forced and the next move had to be worked out further ahead. */
  insights: number;
}

/**
 * How hard the board is to reason out, measured like Arrow Escape's label. At each step
 * look at every unfinished end: an end is forced when only one of its moves keeps the
 * board finishable. If some end is forced, play it; the step costs (open ends + 1) /
 * (forced ends + 1), so a step with many ends to check and few forced ones counts as
 * hard. If none is forced, the player has to look further ahead: play the solution's
 * move for the end with the fewest options, and the step costs (open ends + 1).
 */
export function rate(w: number, h: number, solution: number[][]): Rating {
  const dots = solution.map((p) => [p[0], p[p.length - 1]] as [number, number]);
  let s = startState(w, h, dots);
  // How far along its solution path each end has got.
  const at = solution.flatMap((p) => [0, p.length - 1]);
  let total = 0;
  let steps = 0;
  let insights = 0;
  for (let guard = 0; guard < w * h * 2 && !finished(s); guard++) {
    let open = 0;
    let forced = 0;
    let pick = -1;
    let fewest = 99;
    for (let e = 0; e < at.length; e++) {
      if (s.done[e >> 1]) continue;
      open++;
      const m = legalMoves(s, e).length;
      if (m === 1) {
        forced++;
        if (pick < 0 || fewest > 1) {
          pick = e;
          fewest = 1;
        }
      } else if (m < fewest) {
        fewest = m;
        pick = e;
      }
    }
    if (forced) total += (open + 1) / (forced + 1);
    else {
      total += open + 1;
      insights++;
    }
    steps++;
    // Play the solution's next step for the chosen end.
    const c = pick >> 1;
    const path = solution[c];
    const forward = (pick & 1) === 0;
    const nextIdx = at[pick] + (forward ? 1 : -1);
    const cell = path[nextIdx];
    if (cell === s.heads[pick ^ 1]) s = apply(s, pick, cell);
    else {
      s = apply(s, pick, cell);
      at[pick] = nextIdx;
    }
  }
  return { score: steps ? total / steps : 0, insights };
}
