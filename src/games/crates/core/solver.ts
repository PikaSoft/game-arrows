import { liveCells, reach, Room, step } from './rules';

/*
 * A position is the crates (sorted) plus which area the player is in. Where exactly the
 * player stands within that area doesn't matter for pushing, so the area is named by its
 * lowest cell. That shrinks the search a lot.
 */

const keyOf = (crates: number[], area: number): string => String.fromCharCode(area, ...crates);

function blockedBy(n: number, crates: number[]): Uint8Array {
  const b = new Uint8Array(n);
  for (const c of crates) b[c] = 1;
  return b;
}

/** The lowest cell the player can reach from `at`: names the area. */
function areaOf(room: Room, crates: number[], at: number): { area: number; seen: Uint8Array } {
  const seen = reach(room, blockedBy(room.w * room.h, crates), at);
  return { area: seen.indexOf(1), seen };
}

export interface Push {
  /** The crate's cell before the push, and the side it is pushed toward. */
  from: number;
  dir: number;
}

export interface SolveResult {
  pushes: Push[];
  explored: number;
}

/**
 * Fewest pushes from a position to solved: a breadth-first search where one move is one
 * push. Crates pushed onto cells they can never leave alive are cut off early. Work is
 * capped by positions explored, so it gives up (null) on anything too big.
 */
export function solve(room: Room, targets: number[], crates: number[], player: number, budget = 150000): SolveResult | null {
  const n = room.w * room.h;
  const live = liveCells(room, targets);
  const isTarget = new Uint8Array(n);
  for (const t of targets) isTarget[t] = 1;
  const start = crates.slice().sort((a, b) => a - b);
  const first = areaOf(room, start, player);
  interface Node {
    crates: number[];
    area: number;
    parent: number;
    push: Push | null;
  }
  const nodes: Node[] = [{ crates: start, area: first.area, parent: -1, push: null }];
  const seen = new Set([keyOf(start, first.area)]);
  for (let q = 0; q < nodes.length; q++) {
    const node = nodes[q];
    if (node.crates.every((c) => isTarget[c])) {
      const pushes: Push[] = [];
      for (let k = q; nodes[k].push; k = nodes[k].parent) pushes.push(nodes[k].push!);
      return { pushes: pushes.reverse(), explored: nodes.length };
    }
    if (nodes.length > budget) return null;
    const blocked = blockedBy(n, node.crates);
    const can = reach(room, blocked, node.area);
    for (let k = 0; k < node.crates.length; k++) {
      const c = node.crates[k];
      for (let d = 0; d < 4; d++) {
        // Push toward d: the player stands on the far side, the cell ahead must be free.
        const behind = step(room.w, c, (d + 2) % 4);
        const ahead = step(room.w, c, d);
        if (!can[behind] || room.walls[ahead] || blocked[ahead] || !live[ahead]) continue;
        const next = node.crates.slice();
        next[k] = ahead;
        next.sort((a, b) => a - b);
        const { area } = areaOf(room, next, c);
        const key = keyOf(next, area);
        if (seen.has(key)) continue;
        seen.add(key);
        nodes.push({ crates: next, area, parent: q, push: { from: c, dir: d } });
      }
    }
  }
  return null;
}

export interface Pulled {
  crates: number[];
  /** Area the player is in (its lowest cell). */
  area: number;
  /** Fewest pushes from here back to solved. */
  dist: number;
}

/**
 * Every position that can be solved, found by working backward from solved: start with
 * the crates on their targets and the player in any area, then pull crates around. A pull
 * is a push played in reverse, so the number of pulls to reach a position is exactly the
 * fewest pushes that solve it. Capped by positions found.
 */
export function pullAll(room: Room, targets: number[], budget = 30000): Pulled[] {
  const n = room.w * room.h;
  const goal = targets.slice().sort((a, b) => a - b);
  const out: Pulled[] = [];
  const seen = new Set<string>();
  // One start per area the player could be in around the solved crates.
  const blocked = blockedBy(n, goal);
  const covered = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (room.walls[i] || blocked[i] || covered[i]) continue;
    const s = reach(room, blocked, i);
    for (let j = 0; j < n; j++) if (s[j]) covered[j] = 1;
    const key = keyOf(goal, i);
    seen.add(key);
    out.push({ crates: goal, area: i, dist: 0 });
  }
  for (let q = 0; q < out.length && out.length < budget; q++) {
    const node = out[q];
    const nb = blockedBy(n, node.crates);
    const can = reach(room, nb, node.area);
    for (let k = 0; k < node.crates.length; k++) {
      const c = node.crates[k];
      for (let d = 0; d < 4; d++) {
        // Pull toward d: the player stands at c + d and steps back to c + 2d.
        const p = step(room.w, c, d);
        if (!can[p]) continue;
        const back = step(room.w, p, d);
        if (room.walls[back] || nb[back]) continue;
        const next = node.crates.slice();
        next[k] = p;
        next.sort((a, b) => a - b);
        const { area } = areaOf(room, next, back);
        const key = keyOf(next, area);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ crates: next, area, dist: node.dist + 1 });
      }
    }
  }
  return out;
}

/** Fewest pushes for one crate alone from each cell to the nearest target, ignoring the player. */
export function crateDistances(room: Room, target: number): Int32Array {
  const n = room.w * room.h;
  const dist = new Int32Array(n).fill(-1);
  // Work backward from the target with pulls: a crate at a cell reached in k pulls needs k pushes.
  dist[target] = 0;
  const queue = [target];
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    for (let d = 0; d < 4; d++) {
      const a = step(room.w, i, d);
      const b = step(room.w, a, d);
      if (room.walls[a] || room.walls[b] || dist[a] >= 0) continue;
      dist[a] = dist[i] + 1;
      queue.push(a);
    }
  }
  return dist;
}

/**
 * The fewest pushes the crates would need if each could move freely on its own: the best
 * way to match crates to targets, by sum of single-crate distances. A lower bound on par.
 */
export function lowerBound(room: Room, targets: number[], crates: number[], tables = targets.map((t) => crateDistances(room, t))): number {
  let best = Infinity;
  const used = new Array<boolean>(targets.length).fill(false);
  const go = (k: number, sum: number) => {
    if (sum >= best) return;
    if (k === crates.length) {
      best = sum;
      return;
    }
    for (let t = 0; t < targets.length; t++) {
      if (used[t]) continue;
      const d = tables[t][crates[k]];
      if (d < 0) continue;
      used[t] = true;
      go(k + 1, sum + d);
      used[t] = false;
    }
  };
  go(0, 0);
  return best;
}
