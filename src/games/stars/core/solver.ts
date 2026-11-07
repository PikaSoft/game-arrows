import { around, Board, units } from './rules';
import { DOT, STAR, UNKNOWN } from './types';

/** Every way to choose k of the items in `list`. */
function choose<T>(list: T[], k: number): T[][] {
  const out: T[][] = [];
  const pick = (start: number, chosen: T[]) => {
    if (chosen.length === k) {
      out.push(chosen.slice());
      return;
    }
    for (let i = start; i <= list.length - (k - chosen.length); i++) {
      chosen.push(list[i]);
      pick(i + 1, chosen);
      chosen.pop();
    }
  };
  pick(0, []);
  return out;
}

export interface SearchResult {
  count: number;
  first: number[] | null;
  /** Every answer found (up to the limit). */
  all: number[][];
  exhausted: boolean;
}

/**
 * Count answers up to `limit` by backtracking row by row: each row picks its `per` columns,
 * never two side by side, none touching the row above, no column or region over `per`,
 * and every column and region still able to reach `per`. Capped by nodes.
 */
export function search(b: Board, limit = 2, budget = 400000): SearchResult {
  const n = b.size;
  const res: SearchResult = { count: 0, first: null, all: [], exhausted: false };
  const colStars = new Int32Array(n);
  const regStars = new Int32Array(n);
  // Squares of each region still below the current row, to check it can still fill up.
  const regLeftFrom: Int32Array[] = Array.from({ length: n + 1 }, () => new Int32Array(n));
  for (let y = n - 1; y >= 0; y--) {
    regLeftFrom[y].set(regLeftFrom[y + 1]);
    for (let x = 0; x < n; x++) regLeftFrom[y][b.regions[y * n + x]]++;
  }
  const rowChoices = choose([...Array(n).keys()], b.per).filter((cols) => cols.every((c, k) => k === 0 || c - cols[k - 1] > 1));
  const chosen: number[][] = [];
  let nodes = 0;
  const go = (y: number): void => {
    if (res.count >= limit || res.exhausted) return;
    if (++nodes > budget) {
      res.exhausted = true;
      return;
    }
    if (y === n) {
      if ([...colStars].every((v) => v === b.per) && [...regStars].every((v) => v === b.per)) {
        res.count++;
        const stars = chosen.flatMap((cols, yy) => cols.map((c) => yy * n + c));
        if (!res.first) res.first = stars;
        res.all.push(stars);
      }
      return;
    }
    const above = y > 0 ? chosen[y - 1] : [];
    for (const cols of rowChoices) {
      if (cols.some((c) => colStars[c] >= b.per || above.some((a) => Math.abs(a - c) <= 1))) continue;
      const regs = cols.map((c) => b.regions[y * n + c]);
      let ok = true;
      for (const r of regs) regStars[r]++;
      for (const c of cols) colStars[c]++;
      for (let r = 0; r < n && ok; r++) {
        if (regStars[r] > b.per) ok = false;
        // Not enough squares left below this row for the region to reach its count.
        else if (regStars[r] + regLeftFrom[y + 1][r] < b.per) ok = false;
      }
      for (let c = 0; c < n && ok; c++) if (colStars[c] + (n - 1 - y) * 1 < b.per) ok = false;
      if (ok) {
        chosen.push(cols);
        go(y + 1);
        chosen.pop();
      }
      for (const r of regs) regStars[r]--;
      for (const c of cols) colStars[c]--;
      if (res.count >= limit || res.exhausted) return;
    }
  };
  go(0);
  return res;
}

/**
 * One wave of reasoning, every rule using only what was known when the wave began:
 * - Around every star, all eight squares are dots.
 * - Each row, column and region: try every way to place its remaining stars on its open
 *   squares (none touching each other or a star already placed). A square that's a star in
 *   every way is a star; one that's a star in none is a dot.
 * Returns the new grid, or null on a contradiction.
 */
export function wave(b: Board, g: number[]): number[] | null {
  const next = g.slice();
  const set = (i: number, v: number): boolean => {
    if (next[i] === v) return true;
    if (next[i] !== UNKNOWN) return false;
    next[i] = v;
    return true;
  };
  for (let i = 0; i < g.length; i++) {
    if (g[i] !== STAR) continue;
    for (const o of around(b.size, i)) if (g[o] === STAR || !set(o, DOT)) return null;
  }
  for (const unit of units(b)) {
    const open = unit.filter((i) => g[i] === UNKNOWN);
    const need = b.per - unit.filter((i) => g[i] === STAR).length;
    if (need < 0 || need > open.length) return null;
    if (!open.length) continue;
    const allowed = open.filter((i) => !around(b.size, i).some((o) => g[o] === STAR));
    let inAll: Set<number> | null = null;
    const inAny = new Set<number>();
    for (const pick of choose(allowed, need)) {
      if (pick.some((a, k) => pick.slice(k + 1).some((c) => around(b.size, a).includes(c)))) continue;
      inAll = inAll ? new Set(pick.filter((p) => inAll!.has(p))) : new Set(pick);
      for (const p of pick) inAny.add(p);
    }
    if (!inAll) return null;
    for (const i of open) {
      if (inAll.has(i) && !set(i, STAR)) return null;
      if (!inAny.has(i) && !set(i, DOT)) return null;
    }
  }
  return next;
}

/** Run waves until nothing changes. Null on a contradiction. */
function settle(b: Board, g: number[]): number[] | null {
  let cur: number[] = g;
  for (let guard = 0; guard < 100; guard++) {
    const next = wave(b, cur);
    if (!next) return null;
    if (next.every((v, i) => v === cur[i])) return cur;
    cur = next;
  }
  return cur;
}

export interface Rating {
  solved: boolean;
  grid: number[];
  waves: number;
  /** Waves where the rules stalled and a square had to be tried both ways. */
  lookaheads: number;
  /** Average over the waves of (open squares + 1) / (squares settled that wave + 1). */
  score: number;
}

/**
 * Solve by reasoning, in waves, measured like Arrow Escape's label. When the rules stall,
 * one sweep of trying each open square as a star and as a dot (following the rules until
 * they stop) counts as a wave: whatever leads to a contradiction is ruled out.
 */
export function rate(b: Board, start?: number[]): Rating {
  let g = start ? start.slice() : new Array<number>(b.size * b.size).fill(UNKNOWN);
  let total = 0;
  let waves = 0;
  let lookaheads = 0;
  for (let guard = 0; guard < 300; guard++) {
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
          [STAR, DOT],
          [DOT, STAR],
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
  const done = g.every((v) => v !== UNKNOWN);
  return { solved: done && !!wave(b, g), grid: g, waves, lookaheads, score: waves ? total / waves : 0 };
}
