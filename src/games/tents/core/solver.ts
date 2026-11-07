import { around, Board, pairable, sides } from './rules';
import { GRASS, TENT, TREE, UNKNOWN } from './types';

/** Squares that could ever hold a tent: beside a tree, and not a tree. */
export function candidates(b: Board): number[] {
  const trees = new Set(b.trees);
  const out: number[] = [];
  for (let i = 0; i < b.w * b.h; i++) if (!trees.has(i) && sides(b.w, b.h, i).some((c) => trees.has(c))) out.push(i);
  return out;
}

export interface SearchResult {
  count: number;
  first: number[] | null;
  exhausted: boolean;
}

/**
 * Count answers (tent sets) up to `limit` by backtracking over the squares beside trees,
 * in order: tent or grass. Cut off early when a tent would touch another, a row or column
 * would go over or can no longer reach its count, or a tree is left with nowhere for its
 * tent. A full set must also pair every tent with its own tree. Capped by nodes.
 */
export function search(b: Board, limit = 2, budget = 300000): SearchResult {
  const { w, h } = b;
  const cells = candidates(b);
  const n = w * h;
  const state = new Uint8Array(n); // 0 undecided, 1 tent, 2 grass
  const isCand = new Uint8Array(n);
  for (const c of cells) isCand[c] = 1;
  const rowTents = new Int32Array(h);
  const colTents = new Int32Array(w);
  // Undecided candidates left in each row and column.
  const rowLeft = new Int32Array(h);
  const colLeft = new Int32Array(w);
  for (const c of cells) {
    rowLeft[(c / w) | 0]++;
    colLeft[c % w]++;
  }
  const treeSides = b.trees.map((t) => sides(w, h, t).filter((c) => isCand[c]));
  const treesBeside = new Map<number, number[]>();
  b.trees.forEach((_, k) => {
    for (const c of treeSides[k]) {
      const list = treesBeside.get(c) ?? [];
      list.push(k);
      treesBeside.set(c, list);
    }
  });
  const res: SearchResult = { count: 0, first: null, exhausted: false };
  let nodes = 0;
  const go = (k: number): void => {
    if (res.count >= limit || res.exhausted) return;
    if (++nodes > budget) {
      res.exhausted = true;
      return;
    }
    if (k === cells.length) {
      const tents = cells.filter((c) => state[c] === 1);
      if (pairable(b, tents)) {
        res.count++;
        if (!res.first) res.first = tents;
      }
      return;
    }
    const c = cells[k];
    const y = (c / w) | 0;
    const x = c % w;
    rowLeft[y]--;
    colLeft[x]--;
    // Tent.
    if (rowTents[y] < b.rowCounts[y] && colTents[x] < b.colCounts[x] && !around(w, h, c).some((o) => state[o] === 1)) {
      state[c] = 1;
      rowTents[y]++;
      colTents[x]++;
      go(k + 1);
      rowTents[y]--;
      colTents[x]--;
    }
    // Grass: only if the row, column and nearby trees can still be satisfied.
    if (res.count < limit && !res.exhausted && rowTents[y] + rowLeft[y] >= b.rowCounts[y] && colTents[x] + colLeft[x] >= b.colCounts[x]) {
      state[c] = 2;
      const ok = (treesBeside.get(c) ?? []).every((t) => treeSides[t].some((s) => state[s] !== 2));
      if (ok) go(k + 1);
    }
    state[c] = 0;
    rowLeft[y]++;
    colLeft[x]++;
  };
  go(0);
  return res;
}

/** A row or column, as its squares. */
function lines(b: Board): { cells: number[]; count: number }[] {
  const out: { cells: number[]; count: number }[] = [];
  for (let y = 0; y < b.h; y++) out.push({ cells: Array.from({ length: b.w }, (_, x) => y * b.w + x), count: b.rowCounts[y] });
  for (let x = 0; x < b.w; x++) out.push({ cells: Array.from({ length: b.h }, (_, y) => y * b.w + x), count: b.colCounts[x] });
  return out;
}

/** The starting grid: trees, and grass on every square no tree is beside. */
export function startGrid(b: Board): number[] {
  const g = new Array<number>(b.w * b.h).fill(GRASS);
  for (const t of b.trees) g[t] = TREE;
  for (const c of candidates(b)) g[c] = UNKNOWN;
  return g;
}

/**
 * One wave of reasoning, every rule using only what was known when the wave began:
 * - A row or column: try every way to place its remaining tents on its open squares (no
 *   two side by side); a square that's a tent in every way is a tent, in none is grass.
 * - Every square around a tent (diagonals too) is grass.
 * - A tree with only one open square beside it, and no tent yet, needs its tent there.
 * Returns the new grid, or null on a contradiction.
 */
export function wave(b: Board, g: number[]): number[] | null {
  const { w, h } = b;
  const next = g.slice();
  const set = (i: number, v: number): boolean => {
    if (next[i] === v) return true;
    if (next[i] !== UNKNOWN) return false;
    next[i] = v;
    return true;
  };
  for (const line of lines(b)) {
    const open = line.cells.filter((c) => g[c] === UNKNOWN);
    const need = line.count - line.cells.filter((c) => g[c] === TENT).length;
    if (need < 0 || need > open.length) return null;
    if (!open.length) continue;
    let inAll = (1 << open.length) - 1;
    let inAny = 0;
    let fits = 0;
    for (let m = 0; m < 1 << open.length; m++) {
      let bitsSet = 0;
      for (let t = m; t; t &= t - 1) bitsSet++;
      if (bitsSet !== need) continue;
      // No two tents side by side along the line, and none touching a known tent.
      let ok = true;
      for (let a = 0; a < open.length && ok; a++) {
        if (!(m & (1 << a))) continue;
        if (around(w, h, open[a]).some((o) => g[o] === TENT)) ok = false;
        for (let c = a + 1; c < open.length && ok; c++) if (m & (1 << c) && around(w, h, open[a]).includes(open[c])) ok = false;
      }
      if (!ok) continue;
      fits++;
      inAll &= m;
      inAny |= m;
    }
    if (!fits) return null;
    for (let a = 0; a < open.length; a++) {
      if (inAll & (1 << a) && !set(open[a], TENT)) return null;
      if (!(inAny & (1 << a)) && !set(open[a], GRASS)) return null;
    }
  }
  for (let i = 0; i < w * h; i++) {
    if (g[i] !== TENT) continue;
    for (const o of around(w, h, i)) if (g[o] === UNKNOWN && !set(o, GRASS)) return null;
  }
  for (const t of b.trees) {
    const s = sides(w, h, t);
    if (s.some((c) => g[c] === TENT)) continue;
    const open = s.filter((c) => g[c] === UNKNOWN);
    if (!open.length) return null;
    if (open.length === 1 && !set(open[0], TENT)) return null;
  }
  // Tents touching, or more tents than trees, is a contradiction.
  const tents = next.map((v, i) => (v === TENT ? i : -1)).filter((i) => i >= 0);
  if (tents.length > b.trees.length) return null;
  for (const t of tents) if (around(w, h, t).some((o) => next[o] === TENT)) return null;
  return next;
}

/** Run waves until nothing changes. Null on a contradiction. */
function settle(b: Board, g: number[]): number[] | null {
  let cur: number[] | null = g;
  for (let guard = 0; guard < 200 && cur; guard++) {
    const next = wave(b, cur);
    if (!next) return null;
    if (next.every((v, i) => v === cur![i])) return cur;
    cur = next;
  }
  return cur;
}

export interface Rating {
  solved: boolean;
  grid: number[];
  waves: number;
  /** Waves where plain rules stalled and a square had to be tried both ways. */
  lookaheads: number;
  /** Average over the waves of (open squares + 1) / (squares settled that wave + 1). */
  score: number;
}

/**
 * Solve by reasoning, in waves, measured like Arrow Escape's label. When the rules stall,
 * one sweep of trying each open square as a tent and as grass (and following the rules
 * until they stop) counts as a wave: whatever leads to a contradiction is ruled out.
 */
export function rate(b: Board, start = startGrid(b)): Rating {
  let g = start.slice();
  let total = 0;
  let waves = 0;
  let lookaheads = 0;
  for (let guard = 0; guard < 400; guard++) {
    const open = g.filter((v) => v === UNKNOWN).length;
    if (!open) break;
    let next = wave(b, g);
    if (!next) return { solved: false, grid: g, waves, lookaheads, score: Infinity };
    if (next.every((v, i) => v === g[i])) {
      lookaheads++;
      next = g.slice();
      for (let i = 0; i < g.length; i++) {
        if (g[i] !== UNKNOWN) continue;
        for (const [tryV, other] of [
          [TENT, GRASS],
          [GRASS, TENT],
        ]) {
          const trial = g.slice();
          trial[i] = tryV;
          if (!settle(b, trial)) {
            next[i] = other;
            break;
          }
        }
      }
      if (next.every((v, i) => v === g[i])) return { solved: false, grid: g, waves, lookaheads, score: Infinity };
    }
    const after = next.filter((v) => v === UNKNOWN).length;
    total += (open + 1) / (open - after + 1);
    waves++;
    g = next;
  }
  const tents = g.map((v, i) => (v === TENT ? i : -1)).filter((i) => i >= 0);
  const solved = g.every((v) => v !== UNKNOWN) && pairable(b, tents);
  return { solved, grid: g, waves, lookaheads, score: waves ? total / waves : 0 };
}
