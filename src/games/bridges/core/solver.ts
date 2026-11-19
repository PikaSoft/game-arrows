import { crossings, linksOf } from './rules';
import { Island, Link } from './types';

/**
 * Each link's possible bridge counts as a bitmask: bit v set if v bridges (0, 1, 2) could
 * still be right. The solver narrows these in waves, always with the easiest step that
 * settles anything.
 */
export const TIER_NAMES = ['', 'Counting', 'Isolation', 'Trial and error'];

export interface Puzzle {
  islands: Island[];
  links: Link[];
}

interface Ctx {
  islands: Island[];
  links: Link[];
  adj: number[][];
  cross: number[][];
}

const lo = (m: number) => (m & 1 ? 0 : m & 2 ? 1 : 2);
const hi = (m: number) => (m & 4 ? 2 : m & 2 ? 1 : 0);
/** Keep only values from a to b. */
const clamp = (m: number, a: number, b: number) => {
  let out = 0;
  for (let v = Math.max(0, a); v <= Math.min(2, b); v++) out |= 1 << v;
  return m & out;
};

function ctxOf(p: Puzzle): Ctx {
  return { islands: p.islands, links: p.links, adj: linksOf(p.islands.length, p.links), cross: crossings(p.links) };
}

/** Step 1, counting: each island's number against what its links can still give, and crossings. */
function counting(c: Ctx, d: Uint8Array): boolean | null {
  let changed = false;
  const set = (k: number, m: number) => {
    if (m !== d[k]) {
      d[k] = m;
      changed = true;
    }
  };
  for (let k = 0; k < d.length; k++) if (lo(d[k]) > 0) for (const j of c.cross[k]) set(j, d[j] & 1);
  for (let i = 0; i < c.islands.length; i++) {
    const n = c.islands[i].n;
    let sumLo = 0;
    let sumHi = 0;
    for (const k of c.adj[i]) {
      if (!d[k]) return null;
      sumLo += lo(d[k]);
      sumHi += hi(d[k]);
    }
    if (sumLo > n || sumHi < n) return null;
    for (const k of c.adj[i]) set(k, clamp(d[k], n - (sumHi - hi(d[k])), n - (sumLo - lo(d[k]))));
  }
  for (let k = 0; k < d.length; k++) if (!d[k]) return null;
  return changed;
}

/** Groups of islands joined by bridges that are certain (at least one bridge). */
function groups(c: Ctx, d: Uint8Array): number[] {
  const parent = c.islands.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  c.links.forEach((l, k) => {
    if (lo(d[k]) > 0) parent[find(l.a)] = find(l.b);
  });
  return c.islands.map((_, i) => find(i));
}

/**
 * Step 2, isolation: a group whose islands would all be finished can't be the whole map
 * unless it is, so no link may finish a group early; and a group with one way out must
 * use it. Null if a group is already cut off.
 */
function isolation(c: Ctx, d: Uint8Array): boolean | null {
  const g = groups(c, d);
  const total = c.islands.length;
  const need = new Map<number, number>();
  const size = new Map<number, number>();
  c.islands.forEach((p, i) => {
    const used = c.adj[i].reduce((s, k) => s + lo(d[k]), 0);
    need.set(g[i], (need.get(g[i]) ?? 0) + p.n - used);
    size.set(g[i], (size.get(g[i]) ?? 0) + 1);
  });
  if (size.size > 1) for (const nd of need.values()) if (nd === 0) return null;
  let changed = false;
  c.links.forEach((l, k) => {
    const a = g[l.a];
    const b = g[l.b];
    const base = lo(d[k]);
    for (let v = base + 1; v <= hi(d[k]); v++) {
      const left = (a === b ? need.get(a)! : need.get(a)! + need.get(b)!) - 2 * (v - base);
      const sz = a === b ? size.get(a)! : size.get(a)! + size.get(b)!;
      if (left === 0 && sz < total) {
        const m = clamp(d[k], 0, v - 1);
        if (m !== d[k]) {
          d[k] = m;
          changed = true;
        }
        break;
      }
    }
  });
  // A group (not the whole map) with only one link that could lead out must use it.
  if (size.size > 1) {
    const ways = new Map<number, number[]>();
    c.links.forEach((l, k) => {
      if (g[l.a] === g[l.b] || hi(d[k]) === 0) return;
      for (const r of [g[l.a], g[l.b]]) ways.set(r, [...(ways.get(r) ?? []), k]);
    });
    for (const r of size.keys()) {
      const w = ways.get(r) ?? [];
      if (w.length === 0) return null;
      if (w.length === 1 && lo(d[w[0]]) === 0) {
        d[w[0]] &= 6;
        if (!d[w[0]]) return null;
        changed = true;
      }
    }
  }
  return changed;
}

/** Apply steps 1 and 2 until nothing changes. False if the board turns out impossible. */
function propagate(c: Ctx, d: Uint8Array): boolean {
  for (;;) {
    const a = counting(c, d);
    if (a === null) return false;
    if (a) continue;
    const b = isolation(c, d);
    if (b === null) return false;
    if (!b) return true;
  }
}

/** Step 3, trial and error: a value that leads (by steps 1 and 2) to an impossible board is out. Stops at the first. */
function trial(c: Ctx, d: Uint8Array): boolean {
  for (let k = 0; k < d.length; k++) {
    if (lo(d[k]) === hi(d[k])) continue;
    for (let v = 0; v <= 2; v++) {
      if (!(d[k] & (1 << v))) continue;
      const t = d.slice();
      t[k] = 1 << v;
      if (!propagate(c, t)) {
        d[k] &= ~(1 << v);
        return true;
      }
    }
  }
  return false;
}

/** One wave from domains `d`: the easiest step that narrows anything, and the narrowed domains. */
export function wave(p: Puzzle, d: Uint8Array, maxTier = 3, c: Ctx = ctxOf(p)): { tier: number; next: Uint8Array } | null {
  for (let t = 1; t <= maxTier; t++) {
    const next = d.slice();
    const r = t === 1 ? counting(c, next) : t === 2 ? isolation(c, next) : trial(c, next);
    if (r === null) return null;
    if (r) return { tier: t, next };
  }
  return null;
}

/** Starting domains: 0 to 2, capped by both islands' numbers; at least `known` bridges where given. */
export function startDomains(p: Puzzle, known?: ArrayLike<number>): Uint8Array {
  return Uint8Array.from(p.links, (l, k) => clamp(7, known ? known[k] : 0, Math.min(2, p.islands[l.a].n, p.islands[l.b].n)));
}

export interface LogicResult {
  /** Bridges per link, or null if the solver got stuck. */
  bridges: number[] | null;
  hardest: number;
  /** Waves that needed trial and error. */
  trials: number;
}

/**
 * Solve like a person, in waves, using nothing harder than maxTier. A board it finishes
 * has exactly one answer, since every bridge was forced.
 */
export function solveLogic(p: Puzzle, maxTier = 3, known?: ArrayLike<number>): LogicResult {
  const c = ctxOf(p);
  let d = startDomains(p, known);
  let hardest = 0;
  let trials = 0;
  for (let guard = 0; guard < 2000; guard++) {
    if (d.every((m) => lo(m) === hi(m))) {
      const bridges = Array.from(d, lo);
      // The last waves may leave a cut-off group that no step looked at; check the end state.
      const t = d.slice();
      return propagate(c, t) && isolation(c, t) !== null ? { bridges, hardest, trials } : { bridges: null, hardest, trials };
    }
    const w = wave(p, d, maxTier, c);
    if (!w) return { bridges: null, hardest, trials };
    hardest = Math.max(hardest, w.tier);
    if (w.tier === 3) trials++;
    d = w.next;
  }
  return { bridges: null, hardest, trials };
}

/** Links whose bridge count the next wave raises, from `known` bridges already built. */
export function nextBridges(p: Puzzle, known: ArrayLike<number>): number[] {
  let d = startDomains(p, known);
  // Run waves until one raises some link's lowest possible count above what is built.
  for (let guard = 0; guard < 200; guard++) {
    const w = wave(p, d);
    if (!w) return [];
    d = w.next;
    const out = [];
    for (let k = 0; k < d.length; k++) if (lo(d[k]) > known[k]) out.push(k);
    if (out.length) return out;
  }
  return [];
}
