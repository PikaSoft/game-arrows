import { Grid, gridOf, isLoop } from './grid';
import { OFF, ON, UNKNOWN } from './types';

/** Steps, easiest first. The solver works in waves, each with the easiest step that settles anything. */
export const TIER_NAMES = ['', 'Counting', 'One loop', 'Inside and outside', 'Trial and error'];

export interface Puzzle {
  w: number;
  h: number;
  clues: number[];
}

class Broken extends Error {}
class OutOfWork extends Error {}

interface Ctx {
  g: Grid;
  clues: number[];
  work: number;
  limit: number;
}

/** Steps one solve may take before it gives up (counted, not timed, so every device agrees). */
export const WORK_LIMIT = 800_000;

function set(d: Int8Array, e: number, v: number): boolean {
  if (d[e] === v) return false;
  if (d[e] !== UNKNOWN) throw new Broken();
  d[e] = v;
  return true;
}

/**
 * Step 1, counting. A number with all its fence placed crosses out the rest of its square;
 * one that needs every open side fences them all. A dot with two fences crosses out the
 * rest; a dot with one fence and one open line must use it; a dot with no fence and one
 * open line can't use it (the fence would dead-end there).
 */
function counting(c: Ctx, d: Int8Array): boolean {
  let changed = false;
  for (let cell = 0; cell < c.clues.length; cell++) {
    const n = c.clues[cell];
    if (n < 0) continue;
    const es = c.g.cellEdges[cell];
    let on = 0;
    let unk = 0;
    for (const e of es) {
      if (d[e] === ON) on++;
      else if (d[e] === UNKNOWN) unk++;
    }
    if (on > n || on + unk < n) throw new Broken();
    if (!unk) continue;
    if (on === n) for (const e of es) if (d[e] === UNKNOWN) changed = set(d, e, OFF) || changed;
    if (on + unk === n) for (const e of es) if (d[e] === UNKNOWN) changed = set(d, e, ON) || changed;
  }
  for (const es of c.g.dotEdges) {
    let on = 0;
    let unk = 0;
    for (const e of es) {
      if (d[e] === ON) on++;
      else if (d[e] === UNKNOWN) unk++;
    }
    if (on > 2 || (on === 1 && unk === 0)) throw new Broken();
    if (!unk) continue;
    // Two fences: the rest are out. One fence and one open line: it goes on. No fence and one open line: it's out.
    const fill = on === 2 ? OFF : on === 1 && unk === 1 ? ON : on === 0 && unk === 1 ? OFF : UNKNOWN;
    if (fill !== UNKNOWN) for (const e of es) if (d[e] === UNKNOWN) changed = set(d, e, fill) || changed;
  }
  c.work += c.clues.length + c.g.dotEdges.length;
  if (c.work > c.limit) throw new OutOfWork();
  return changed;
}

/**
 * Step 2, one loop. A line that would close the fence into a loop is crossed out unless
 * that loop would be the whole answer: every fence placed so far on it, and every number met.
 */
function oneLoop(c: Ctx, d: Int8Array): boolean {
  const { g } = c;
  const parent = Array.from({ length: g.dotEdges.length }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  let onCount = 0;
  for (let e = 0; e < g.edges; e++) {
    if (d[e] !== ON) continue;
    onCount++;
    const [a, b] = g.ends[e];
    const ra = find(a);
    const rb = find(b);
    // Already a closed loop: fine only if it is everything (the caller checks the end state).
    if (ra === rb) continue;
    parent[ra] = rb;
  }
  // Size of each group of fence, in lines.
  const size = new Map<number, number>();
  for (let e = 0; e < g.edges; e++) if (d[e] === ON) size.set(find(g.ends[e][0]), (size.get(find(g.ends[e][0])) ?? 0) + 1);
  let changed = false;
  for (let e = 0; e < g.edges; e++) {
    if (d[e] !== UNKNOWN) continue;
    const [a, b] = g.ends[e];
    const r = find(a);
    if (r !== find(b)) continue;
    // Closing this group: allowed only if it holds every fence and meets every number.
    let whole = size.get(r) === onCount;
    if (whole) {
      d[e] = ON;
      whole = c.clues.every((n, cell) => n < 0 || c.g.cellEdges[cell].filter((x) => d[x] === ON).length === n);
      d[e] = UNKNOWN;
    }
    if (!whole) changed = set(d, e, OFF) || changed;
  }
  c.work += g.edges * 2;
  if (c.work > c.limit) throw new OutOfWork();
  return changed;
}

/**
 * Step 3, inside and outside. Every square is inside the fence or out (beyond the border
 * is out). A fence between two squares means they are on different sides; no fence, the
 * same side. Squares tied together this way form groups whose sides are fixed relative to
 * each other, so a line between two squares of one group is settled. And a number counts
 * the neighbours on the other side of its square: when that many are known to differ, the
 * rest must match (no fence); when only that many could differ, they all do (fence).
 */
function insideOutside(c: Ctx, d: Int8Array): boolean {
  const { g } = c;
  const n = c.clues.length;
  const OUT = n;
  const parent = Array.from({ length: n + 1 }, (_, i) => i);
  /** Parity of each node relative to its parent: 1 if on the other side. */
  const par = new Uint8Array(n + 1);
  const find = (i: number): number => {
    if (parent[i] === i) return i;
    const r = find(parent[i]);
    par[i] ^= par[parent[i]];
    parent[i] = r;
    return r;
  };
  const nodes = (e: number): [number, number] => {
    const cs = g.edgeCells[e];
    return cs.length === 2 ? [cs[0], cs[1]] : [cs[0], OUT];
  };
  const join = (a: number, b: number, diff: number) => {
    const ra = find(a);
    const rb = find(b);
    const want = par[a] ^ par[b] ^ diff;
    if (ra === rb) {
      if (want) throw new Broken();
      return;
    }
    parent[ra] = rb;
    par[ra] = want;
  };
  for (let e = 0; e < g.edges; e++) if (d[e] !== UNKNOWN) join(...nodes(e), d[e] === ON ? 1 : 0);
  /** 1 if a and b are known to differ, 0 if known the same, -1 if not known. */
  const rel = (a: number, b: number) => (find(a) === find(b) ? par[a] ^ par[b] : -1);
  let changed = false;
  for (let e = 0; e < g.edges; e++) {
    if (d[e] !== UNKNOWN) continue;
    const r = rel(...nodes(e));
    if (r >= 0) changed = set(d, e, r ? ON : OFF) || changed;
  }
  for (let cell = 0; cell < n; cell++) {
    const k = c.clues[cell];
    if (k < 0) continue;
    let diff = 0;
    let same = 0;
    const open: number[] = [];
    for (const e of g.cellEdges[cell]) {
      const [a, b] = nodes(e);
      const r = rel(a === cell ? a : b, a === cell ? b : a);
      if (r === 1) diff++;
      else if (r === 0) same++;
      else open.push(e);
    }
    if (!open.length) continue;
    if (diff === k) for (const e of open) if (d[e] === UNKNOWN) changed = set(d, e, OFF) || changed;
    if (4 - same === k) for (const e of open) if (d[e] === UNKNOWN) changed = set(d, e, ON) || changed;
  }
  c.work += g.edges * 3;
  if (c.work > c.limit) throw new OutOfWork();
  return changed;
}

/** Steps 1 to 3 until nothing changes. False if the board turns out impossible. */
function propagate(c: Ctx, d: Int8Array): boolean {
  try {
    for (;;) {
      if (counting(c, d)) continue;
      if (oneLoop(c, d)) continue;
      if (!insideOutside(c, d)) return closedOk(c, d);
    }
  } catch (e) {
    if (e instanceof Broken) return false;
    throw e;
  }
}

/** A closed loop that leaves fence elsewhere, or any finished board that isn't one loop, is impossible. */
function closedOk(c: Ctx, d: Int8Array): boolean {
  if (d.includes(UNKNOWN)) {
    // A closed loop plus other fence can never be fixed.
    const on = Array.from(d, (v) => v === ON);
    const loops = loopsOf(c.g, on);
    return !(loops.closed && loops.groups > 1);
  }
  return isLoop(c.g, d, c.clues);
}

function loopsOf(g: Grid, on: boolean[]): { groups: number; closed: boolean } {
  const parent = Array.from({ length: g.dotEdges.length }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  let closed = false;
  const roots = new Set<number>();
  for (let e = 0; e < g.edges; e++) {
    if (!on[e]) continue;
    const ra = find(g.ends[e][0]);
    const rb = find(g.ends[e][1]);
    if (ra === rb) closed = true;
    else parent[ra] = rb;
  }
  for (let e = 0; e < g.edges; e++) if (on[e]) roots.add(find(g.ends[e][0]));
  return { groups: roots.size, closed };
}

/** Step 4, trial and error: a line whose one setting leads (by steps 1 to 3) to an impossible board takes the other. Stops at the first. */
function trial(c: Ctx, d: Int8Array): boolean {
  // Lines touching fence already placed first: they run into trouble soonest.
  const near = (e: number) => c.g.ends[e].some((dot) => c.g.dotEdges[dot].some((x) => d[x] === ON));
  const order: number[] = [];
  for (let e = 0; e < c.g.edges; e++) if (d[e] === UNKNOWN && near(e)) order.push(e);
  for (let e = 0; e < c.g.edges; e++) if (d[e] === UNKNOWN && !near(e)) order.push(e);
  for (const e of order) {
    for (const v of [ON, OFF]) {
      const t = d.slice();
      t[e] = v;
      if (!propagate(c, t)) {
        d[e] = v === ON ? OFF : ON;
        return true;
      }
    }
  }
  return false;
}

function stepTier(c: Ctx, d: Int8Array, tier: number): boolean | null {
  try {
    if (tier === 1) return counting(c, d);
    if (tier === 2) return oneLoop(c, d);
    if (tier === 3) return insideOutside(c, d);
    return trial(c, d);
  } catch (e) {
    if (e instanceof Broken) return null;
    throw e;
  }
}

export interface LogicResult {
  /** Which lines are fence, or null if the solver got stuck (or ran out of work). */
  on: boolean[] | null;
  hardest: number;
  trials: number;
  /** Waves that needed inside and outside. */
  sides: number;
}

function ctxOf(p: Puzzle, limit: number): Ctx {
  return { g: gridOf(p.w, p.h), clues: p.clues, work: 0, limit };
}

/**
 * Solve like a person, in waves, with nothing harder than maxTier. A board it finishes has
 * exactly one answer, since every line was forced. `known` sets lines already decided.
 */
export function solveLogic(p: Puzzle, maxTier = 4, known?: ArrayLike<number>, limit = WORK_LIMIT): LogicResult {
  const c = ctxOf(p, limit);
  let d = known ? Int8Array.from(known) : new Int8Array(c.g.edges);
  let hardest = 0;
  let trials = 0;
  let sides = 0;
  try {
    for (let guard = 0; guard < 10_000; guard++) {
      if (!d.includes(UNKNOWN)) return { on: isLoop(c.g, d, c.clues) ? Array.from(d, (v) => v === ON) : null, hardest, trials, sides };
      let moved = false;
      for (let t = 1; t <= maxTier && !moved; t++) {
        const next = d.slice();
        const r = stepTier(c, next, t);
        if (r === null) return { on: null, hardest, trials, sides };
        if (r) {
          d = next;
          hardest = Math.max(hardest, t);
          if (t === 4) trials++;
          if (t === 3) sides++;
          moved = true;
        }
      }
      if (!moved) return { on: null, hardest, trials, sides };
    }
  } catch (e) {
    if (e instanceof OutOfWork) return { on: null, hardest: 4, trials: 99, sides };
    throw e;
  }
  return { on: null, hardest, trials, sides };
}

/** Lines the next wave settles from what is known, as [line, ON or OFF]. */
export function nextWave(p: Puzzle, known: ArrayLike<number>): [number, number][] {
  const c = ctxOf(p, WORK_LIMIT);
  const d = Int8Array.from(known);
  try {
    for (let t = 1; t <= 4; t++) {
      const next = d.slice();
      const r = stepTier(c, next, t);
      if (r === null) return [];
      if (r) {
        const out: [number, number][] = [];
        for (let e = 0; e < d.length; e++) if (d[e] === UNKNOWN && next[e] !== UNKNOWN) out.push([e, next[e]]);
        return out;
      }
    }
  } catch (e) {
    if (!(e instanceof OutOfWork)) throw e;
  }
  return [];
}
