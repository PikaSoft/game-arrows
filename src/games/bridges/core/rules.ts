import { Island, Link } from './types';

/**
 * Every link: for each island, the nearest island to its right and the nearest below,
 * if any. Squares between are empty (islands never sit side by side).
 */
export function links(w: number, h: number, islands: Island[]): Link[] {
  const at = new Map<number, number>();
  islands.forEach((p, i) => at.set(p.y * w + p.x, i));
  const out: Link[] = [];
  islands.forEach((p, a) => {
    for (const across of [true, false]) {
      const cells: number[] = [];
      let x = p.x;
      let y = p.y;
      for (;;) {
        if (across) x++;
        else y++;
        if (x >= w || y >= h) break;
        const b = at.get(y * w + x);
        if (b !== undefined) {
          if (cells.length) out.push({ a, b, across, cells });
          break;
        }
        cells.push(y * w + x);
      }
    }
  });
  return out;
}

/** For each link, the links that cross it. */
export function crossings(ls: Link[]): number[][] {
  const out = ls.map(() => [] as number[]);
  for (let i = 0; i < ls.length; i++) {
    const ci = new Set(ls[i].cells);
    for (let j = i + 1; j < ls.length; j++) {
      if (ls[i].across === ls[j].across) continue;
      if (ls[j].cells.some((c) => ci.has(c))) {
        out[i].push(j);
        out[j].push(i);
      }
    }
  }
  return out;
}

/** For each island, the links that touch it. */
export function linksOf(count: number, ls: Link[]): number[][] {
  const out = Array.from({ length: count }, () => [] as number[]);
  ls.forEach((l, k) => {
    out[l.a].push(k);
    out[l.b].push(k);
  });
  return out;
}

/** True if every island is reached from island 0 through links with bridges. */
export function connected(count: number, ls: Link[], bridges: ArrayLike<number>): boolean {
  if (count === 0) return true;
  const adj = linksOf(count, ls);
  const seen = new Set([0]);
  const stack = [0];
  while (stack.length) {
    const i = stack.pop()!;
    for (const k of adj[i]) {
      if (!bridges[k]) continue;
      const j = ls[k].a === i ? ls[k].b : ls[k].a;
      if (!seen.has(j)) {
        seen.add(j);
        stack.push(j);
      }
    }
  }
  return seen.size === count;
}

/** True if bridges meet every island's number, never cross, and join every island. */
export function isSolved(islands: Island[], ls: Link[], bridges: ArrayLike<number>): boolean {
  const adj = linksOf(islands.length, ls);
  for (let i = 0; i < islands.length; i++) if (adj[i].reduce((s, k) => s + bridges[k], 0) !== islands[i].n) return false;
  const cross = crossings(ls);
  for (let k = 0; k < ls.length; k++) if (bridges[k] && cross[k].some((j) => bridges[j])) return false;
  return connected(islands.length, ls, bridges);
}
