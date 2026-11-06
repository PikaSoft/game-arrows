import { Board, exitSide, hasExit, isSolved, Pos } from './rules';
import { SHAPES } from './shapes';
import { Block } from './types';

/** Move block `block` to `to`, or out of the board when `to` is null. */
export interface Move {
  block: number;
  to: Pos;
}

export interface SolveResult {
  moves: Move[];
  /** States looked at, a rough measure of how much searching the board needs. */
  explored: number;
}

/** True when the last search ran out of budget before deciding. */
export let exhausted = false;
/** States the last search looked at, solved or not. */
export let lastExplored = 0;

/**
 * Inside the search a state is one number per block: y * w + x + 1, or 0 once it has
 * left. Each node keeps its state, its parent and the move that led to it.
 */
interface Node {
  s: Int16Array;
  parent: Node | null;
  block: number;
  to: number;
}

/**
 * Shortest solution by breadth-first search, where one move takes a block anywhere it
 * can slide to, or out through a gap. When some block can leave, taking it out first is
 * always at least as good (an empty space never blocks anything), so that is the only
 * move tried from such a state. Returns null if unsolvable or over budget (see `exhausted`).
 */
export function solve(board: Board, blocks: Block[], start: Pos[], budget = 60000): SolveResult | null {
  exhausted = false;
  const { w, h } = board;
  const n = blocks.length;
  if (isSolved(start)) return { moves: [], explored: 0 };
  // Blocks with the same shape and colour are interchangeable: sort their codes in the key.
  const groupOf = new Map<string, number[]>();
  blocks.forEach((b, i) => {
    const k = `${b.shape}:${b.color}`;
    if (!groupOf.has(k)) groupOf.set(k, []);
    groupOf.get(k)!.push(i);
  });
  const groups = [...groupOf.values()].filter((g) => g.length > 1);
  const tmp = new Int16Array(n);
  const key = (s: Int16Array): string => {
    if (!groups.length) return String.fromCharCode.apply(null, s as unknown as number[]);
    tmp.set(s);
    for (const g of groups) {
      const v = g.map((i) => s[i]).sort((a, b) => a - b);
      g.forEach((i, k) => (tmp[i] = v[k]));
    }
    return String.fromCharCode.apply(null, tmp as unknown as number[]);
  };

  const cells = w * h;
  const occ = new Int16Array(cells);
  const seenAt = new Int32Array(cells);
  const queue = new Int32Array(cells);
  let stamp = 0;
  const canLeave = blocks.map((b) => hasExit(board, b));

  const s0 = new Int16Array(start.map((p) => (p ? p.y * w + p.x + 1 : 0)));
  const root: Node = { s: s0, parent: null, block: -1, to: 0 };
  const seen = new Set<string>([key(s0)]);
  let frontier: Node[] = [root];
  let explored = 0;

  while (frontier.length) {
    const next: Node[] = [];
    for (const node of frontier) {
      if (++explored > budget) {
        exhausted = true;
        lastExplored = explored;
        return null;
      }
      const s = node.s;
      occ.fill(-1);
      for (let i = 0; i < n; i++) {
        if (!s[i]) continue;
        const base = s[i] - 1;
        for (const [dx, dy] of SHAPES[blocks[i].shape].cells) occ[base + dy * w + dx] = i;
      }
      const children: Node[] = [];
      let exitChild: Node | null = null;
      for (let i = 0; i < n && !exitChild; i++) {
        if (!s[i]) continue;
        const sh = SHAPES[blocks[i].shape];
        const start = s[i] - 1;
        for (const [dx, dy] of sh.cells) occ[start + dy * w + dx] = -1;
        const st = ++stamp;
        let head = 0;
        let tail = 0;
        queue[tail++] = start;
        seenAt[start] = st;
        while (head < tail) {
          const k = queue[head++];
          const x = k % w;
          const y = (k / w) | 0;
          if (canLeave[i] && exitSide(board, blocks, occ, i, x, y)) {
            const c = s.slice();
            c[i] = 0;
            exitChild = { s: c, parent: node, block: i, to: 0 };
            break;
          }
          if (k !== start) {
            const c = s.slice();
            c[i] = k + 1;
            children.push({ s: c, parent: node, block: i, to: k + 1 });
          }
          for (let d = 0; d < 4; d++) {
            const nx = d === 0 ? x + 1 : d === 1 ? x - 1 : x;
            const ny = d === 2 ? y + 1 : d === 3 ? y - 1 : y;
            if (nx < 0 || ny < 0 || nx + sh.w > w || ny + sh.h > h) continue;
            const nk = ny * w + nx;
            if (seenAt[nk] === st) continue;
            seenAt[nk] = st;
            let ok = true;
            for (const [cx, cy] of sh.cells) {
              if (occ[nk + cy * w + cx] !== -1) {
                ok = false;
                break;
              }
            }
            if (ok) queue[tail++] = nk;
          }
        }
        for (const [dx, dy] of sh.cells) occ[start + dy * w + dx] = i;
      }
      for (const c of exitChild ? [exitChild] : children) {
        if (exitChild && c.s.every((v) => v === 0)) {
          lastExplored = explored;
          return { moves: path(c, w), explored };
        }
        const k = key(c.s);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push(c);
      }
    }
    frontier = next;
  }
  lastExplored = explored;
  return null;
}

function path(node: Node, w: number): Move[] {
  const moves: Move[] = [];
  for (let n: Node | null = node; n && n.parent; n = n.parent) {
    moves.push({ block: n.block, to: n.to ? { x: (n.to - 1) % w, y: ((n.to - 1) / w) | 0 } : null });
  }
  return moves.reverse();
}

export const startPos = (blocks: Block[]): Pos[] => blocks.map((b) => ({ x: b.x, y: b.y }));
