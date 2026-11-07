import { allHome, Board, slide } from './rules';

const key = (pos: number[]) => pos.join(',');

export interface Search {
  /** Fewest swipes to get every puck home, or -1 if it can't be done. */
  par: number;
  /** The swipes of one shortest solution. */
  moves: number[];
  /** Positions reachable from the start. */
  reachable: number;
  /** Of those, how many can never get every puck home: dead ends. */
  dead: number;
}

/**
 * Breadth-first search over swipes. Positions are where each puck is (or home). Also
 * counts dead ends: positions you can slide into but never get out of to a solution.
 * Swipes into holes or that move nothing aren't moves.
 */
export function explore(b: Board, start: number[], budget = 20000): Search {
  const id = new Map<string, number>([[key(start), 0]]);
  const states: number[][] = [start];
  const parent: number[] = [-1];
  const via: number[] = [-1];
  const edges: number[][] = [];
  let goal = -1;
  for (let q = 0; q < states.length && states.length < budget; q++) {
    const pos = states[q];
    edges[q] = [];
    if (allHome(pos)) {
      if (goal < 0) goal = q;
      continue;
    }
    for (let d = 0; d < 4; d++) {
      const r = slide(b, pos, d);
      if (!r.moved || r.fell !== null) continue;
      const k = key(r.pos);
      let j = id.get(k);
      if (j === undefined) {
        j = states.length;
        id.set(k, j);
        states.push(r.pos);
        parent.push(q);
        via.push(d);
      }
      edges[q].push(j);
    }
  }
  const n = states.length;
  for (let q = 0; q < n; q++) edges[q] ??= [];
  // Which positions can still reach a goal: walk the edges backward from every goal.
  const back: number[][] = Array.from({ length: n }, () => []);
  edges.forEach((out, q) => out.forEach((j) => back[j].push(q)));
  const alive = new Uint8Array(n);
  const stack: number[] = [];
  for (let q = 0; q < n; q++) if (allHome(states[q])) {
    alive[q] = 1;
    stack.push(q);
  }
  while (stack.length) {
    const j = stack.pop()!;
    for (const q of back[j]) if (!alive[q]) {
      alive[q] = 1;
      stack.push(q);
    }
  }
  let dead = 0;
  for (let q = 0; q < n; q++) if (!alive[q]) dead++;
  const moves: number[] = [];
  if (goal >= 0) for (let q = goal; parent[q] >= 0; q = parent[q]) moves.push(via[q]);
  moves.reverse();
  return { par: goal < 0 ? -1 : moves.length, moves, reachable: n, dead };
}

/** Every position one puck can stop at from `start`, with its fewest swipes. */
export function stops(b: Board, start: number): Map<number, number> {
  const dist = new Map<number, number>([[start, 0]]);
  const queue = [start];
  const noExit = { ...b, exits: [-2] };
  for (let q = 0; q < queue.length; q++) {
    const at = queue[q];
    for (let d = 0; d < 4; d++) {
      const r = slide(noExit, [at], d);
      if (!r.moved || r.fell !== null || dist.has(r.pos[0])) continue;
      dist.set(r.pos[0], dist.get(at)! + 1);
      queue.push(r.pos[0]);
    }
  }
  return dist;
}
