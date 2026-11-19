import { lineMasks, lines, validLines } from './rules';
import { A, B, EMPTY } from './types';

/**
 * Techniques, easiest first. The solver works in waves: each wave uses the easiest tier
 * that settles anything, based on the board at the start of that wave.
 */
export const TIER_NAMES = ['', 'Pairs and gaps', 'Counting', 'Line logic', 'No copies', 'Trial and error'];

interface Ctx {
  size: number;
  lines: number[][];
  valid: Int32Array;
}

const ctxCache = new Map<number, Ctx>();
function ctxFor(size: number): Ctx {
  let c = ctxCache.get(size);
  if (!c) {
    c = { size, lines: lines(size), valid: validLines(size) };
    ctxCache.set(size, c);
  }
  return c;
}

/** Squares to set: index and tone. */
type Moves = Map<number, number>;
const other = (v: number) => (v === A ? B : A);

/** Tier 1: two alike side by side, or with a gap between, force the other tone beside or between them. */
function pairs(c: Ctx, g: Int8Array, out: Moves): void {
  for (const l of c.lines) {
    for (let k = 0; k + 2 < l.length; k++) {
      const [p, q, r] = [g[l[k]], g[l[k + 1]], g[l[k + 2]]];
      if (p && p === q && !r) out.set(l[k + 2], other(p));
      if (q && q === r && !p) out.set(l[k], other(q));
      if (p && p === r && !q) out.set(l[k + 1], other(p));
    }
  }
}

/** Tier 2: a line with half its squares of one tone fills the rest with the other. */
function counts(c: Ctx, g: Int8Array, out: Moves): void {
  const half = c.size / 2;
  for (const l of c.lines) {
    let a = 0;
    let b = 0;
    for (const i of l) {
      if (g[i] === A) a++;
      else if (g[i] === B) b++;
    }
    if (a + b === c.size) continue;
    if (a === half) for (const i of l) if (!g[i]) out.set(i, B);
    if (b === half) for (const i of l) if (!g[i]) out.set(i, A);
  }
}

/**
 * Tiers 3 and 4: try every valid way to finish each line and set the squares that come
 * out the same in all of them. Tier 4 also rules out ways that copy a finished line
 * running the same way. Returns false if some line can't be finished at all.
 */
function lineLogic(c: Ctx, g: Int8Array, out: Moves, noCopies: boolean): boolean {
  const { size } = c;
  const full = (1 << size) - 1;
  const finished: Set<number>[] = [new Set(), new Set()];
  if (noCopies) {
    c.lines.forEach((l, li) => {
      const [a, b] = lineMasks(g, l);
      if ((a | b) === full) finished[li < size ? 0 : 1].add(a);
    });
  }
  const dupChecked: Set<number>[] = [new Set(), new Set()];
  for (let li = 0; li < c.lines.length; li++) {
    const l = c.lines[li];
    const [a, b] = lineMasks(g, l);
    if ((a | b) === full) {
      // A finished line that copies another one running the same way breaks the rules.
      if (noCopies && !dupChecked[li < size ? 0 : 1].has(a)) dupChecked[li < size ? 0 : 1].add(a);
      else if (noCopies) return false;
      continue;
    }
    let and = full;
    let or = 0;
    let any = false;
    const done = finished[li < size ? 0 : 1];
    for (const m of c.valid) {
      if ((m & a) !== a || (m & b) !== 0) continue;
      if (noCopies && done.has(m)) continue;
      and &= m;
      or |= m;
      any = true;
    }
    if (!any) return false;
    for (let k = 0; k < size; k++) {
      if (g[l[k]]) continue;
      if ((and >> k) & 1) out.set(l[k], A);
      else if (!((or >> k) & 1)) out.set(l[k], B);
    }
  }
  return true;
}

/** True if the board already breaks a rule. */
function broken(c: Ctx, g: Int8Array): boolean {
  const { size } = c;
  const full = (1 << size) - 1;
  const seen: Set<number>[] = [new Set(), new Set()];
  for (let li = 0; li < c.lines.length; li++) {
    const [a, b] = lineMasks(g, c.lines[li]);
    let ok = false;
    for (const m of c.valid) if ((m & a) === a && (m & b) === 0) {
      ok = true;
      break;
    }
    if (!ok) return true;
    if ((a | b) === full) {
      const s = seen[li < size ? 0 : 1];
      if (s.has(a)) return true;
      s.add(a);
    }
  }
  return false;
}

/** Moves the given tier finds on the board as it is (empty if none). Null if the board is broken. */
function tierMoves(c: Ctx, g: Int8Array, tier: number): Moves | null {
  const out: Moves = new Map();
  if (tier === 1) pairs(c, g, out);
  else if (tier === 2) counts(c, g, out);
  else if (tier === 3 || tier === 4) {
    if (!lineLogic(c, g, out, tier === 4)) return null;
  } else if (tier === 5) {
    // Try each open square as A, then B; if one leads (by tiers 1 to 4) to a broken board,
    // it must be the other. Stops at the first square found, to keep the work down.
    for (let i = 0; i < g.length; i++) {
      if (g[i]) continue;
      for (const t of [A, B]) {
        const h = g.slice();
        h[i] = t;
        if (!propagate(c, h, 4)) {
          out.set(i, other(t));
          return out;
        }
      }
    }
  }
  // Two techniques can't disagree on a sound board; if they do, it is broken.
  return out;
}

/**
 * Apply tiers 1 to maxTier until nothing changes. False if the board turns out broken.
 * Line logic (tier 3 and up) notices any broken line or copied line, and it always runs
 * on the last, quiet pass, so no separate check is needed.
 */
function propagate(c: Ctx, g: Int8Array, maxTier: number): boolean {
  for (;;) {
    let moved = false;
    for (let t = 1; t <= maxTier && !moved; t++) {
      const m = tierMoves(c, g, t);
      if (!m) return false;
      for (const [i, v] of m) {
        if (g[i] && g[i] !== v) return false;
        if (!g[i]) {
          g[i] = v;
          moved = true;
        }
      }
    }
    if (!moved) return true;
  }
}

export interface Wave {
  tier: number;
  moves: Moves;
}

/** The next wave: the squares the easiest useful tier settles from the board as it is. */
export function nextWave(size: number, grid: ArrayLike<number>, maxTier = 5): Wave | null {
  const c = ctxFor(size);
  const g = Int8Array.from(grid);
  for (let t = 1; t <= maxTier; t++) {
    const m = tierMoves(c, g, t);
    if (!m) return null;
    for (const [i, v] of m) if (g[i] && g[i] !== v) return null;
    for (const [i] of m) if (g[i]) m.delete(i);
    if (m.size) return { tier: t, moves: m };
  }
  return null;
}

export interface LogicResult {
  /** The finished grid, or null if the solver got stuck (or the givens are broken). */
  grid: number[] | null;
  /** Hardest tier used. */
  hardest: number;
}

/**
 * Solve like a person, in waves, using nothing harder than maxTier. A board it finishes
 * has exactly one answer, since every square was forced.
 */
export function solveLogic(size: number, givens: ArrayLike<number>, maxTier = 5): LogicResult {
  const c = ctxFor(size);
  const g = Int8Array.from(givens);
  let hardest = 0;
  if (broken(c, g)) return { grid: null, hardest };
  while (g.includes(EMPTY)) {
    const w = nextWave(size, g, maxTier);
    if (!w) return { grid: null, hardest };
    hardest = Math.max(hardest, w.tier);
    for (const [i, v] of w.moves) g[i] = v;
    if (broken(c, g)) return { grid: null, hardest };
  }
  return { grid: Array.from(g), hardest };
}
