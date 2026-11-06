import { clone, pour, isSolved, stateKey, usefulMoves } from './rules';
import { Bottle } from './types';

export type Move = [number, number];

export interface SolveResult {
  moves: Move[];
  /** True when the search proved this is the shortest solution. */
  optimal: boolean;
}

/**
 * Lower bound on moves left. Every pour merges at most one run of sand into another,
 * so the number of runs above one per colour can drop by at most one per move.
 */
export function runsOver(bottles: Bottle[]): number {
  let runs = 0;
  const colours = new Set<number>();
  for (const b of bottles) {
    for (let i = 0; i < b.length; i++) {
      colours.add(b[i]);
      if (i === 0 || b[i] !== b[i - 1]) runs++;
    }
  }
  return runs - colours.size;
}

interface Node {
  bottles: Bottle[];
  g: number;
  f: number;
  parent: Node | null;
  move: Move | null;
}

/** Binary min-heap on f, then deeper g first. */
class Heap {
  private a: Node[] = [];
  get size() {
    return this.a.length;
  }
  private less(x: Node, y: Node) {
    return x.f < y.f || (x.f === y.f && x.g > y.g);
  }
  push(n: Node) {
    const a = this.a;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(a[i], a[p])) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop(): Node {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.less(a[l], a[m])) m = l;
        if (r < a.length && this.less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

/** After search() returns null: true if it ran out of budget, false if it proved no solution exists. */
export let exhausted = false;

export function search(start: Bottle[], cap: number, weight: number, budget: number): Move[] | null {
  exhausted = false;
  const open = new Heap();
  const seen = new Map<string, number>();
  open.push({ bottles: clone(start), g: 0, f: weight * runsOver(start), parent: null, move: null });
  seen.set(stateKey(start), 0);
  let expanded = 0;
  while (open.size) {
    const n = open.pop();
    if (isSolved(n.bottles, cap)) {
      const moves: Move[] = [];
      for (let x: Node | null = n; x && x.move; x = x.parent) moves.push(x.move);
      return moves.reverse();
    }
    if (++expanded > budget) {
      exhausted = true;
      return null;
    }
    for (const m of usefulMoves(n.bottles, cap)) {
      const next = clone(n.bottles);
      pour(next, cap, m[0], m[1]);
      const k = stateKey(next);
      const g = n.g + 1;
      const prev = seen.get(k);
      if (prev !== undefined && prev <= g) continue;
      seen.set(k, g);
      open.push({ bottles: next, g, f: g + weight * runsOver(next), parent: n, move: m });
    }
  }
  return null; // searched everything: no solution
}

/**
 * Finds a solution. Tries an exact A* search first; if the board is too big for that,
 * falls back to faster searches that still find a short (not always shortest) answer.
 * Returns null when the board cannot be solved.
 */
export function solve(start: Bottle[], cap: number, budget = 40000): SolveResult | null {
  const exact = search(start, cap, 1, budget);
  if (exact) return { moves: exact, optimal: true };
  for (const w of [1.6, 3, 8]) {
    const m = search(start, cap, w, budget * 2);
    if (m) return { moves: m, optimal: false };
  }
  return null;
}
