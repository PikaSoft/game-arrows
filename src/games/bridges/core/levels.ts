import { Rng } from '../../../shared/rng';
import { BridgesSpec, bridgesScore, bridgesSpecFor, rateBridges, TUTORIAL_COUNT } from './difficulty';
import { links as linksOf } from './rules';
import { solveLogic, TIER_NAMES } from './solver';
import { BridgesLevel, Island } from './types';

const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

/**
 * Grow a map of islands: start with one, then again and again pick an island and a
 * direction and put a new island some way off, joined by one or two bridges. New islands
 * never sit next to another (even at a corner), and new bridges never cross old ones or
 * pass an island. Then add a few extra bridges between islands that see each other.
 * Each island's number is its bridge total.
 */
export function layOut(spec: BridgesSpec, rng: Rng): Island[] | null {
  const { w, h } = spec;
  const isl: { x: number; y: number }[] = [];
  const at = new Int16Array(w * h).fill(-1);
  /** 1 where a bridge runs across, 2 where one runs down. */
  const run = new Uint8Array(w * h);
  const bridges: { a: number; b: number; v: number; cells: number[]; across: boolean }[] = [];
  const crowded = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && at[ny * w + nx] >= 0) return true;
      }
    return false;
  };
  const add = (x: number, y: number) => {
    at[y * w + x] = isl.length;
    isl.push({ x, y });
  };
  add(rng.int(0, w - 1), rng.int(0, h - 1));
  for (let tries = 0; isl.length < spec.islands && tries < spec.islands * 60; tries++) {
    const a = rng.int(0, isl.length - 1);
    const d = rng.int(0, 3);
    const len = rng.int(2, Math.max(2, Math.min(5, Math.round(Math.max(w, h) / 2))));
    const cells: number[] = [];
    let x = isl[a].x;
    let y = isl[a].y;
    let ok = true;
    for (let s = 1; s <= len && ok; s++) {
      x += DX[d];
      y += DY[d];
      if (x < 0 || y < 0 || x >= w || y >= h) ok = false;
      else if (s < len) {
        const c = y * w + x;
        if (at[c] >= 0 || run[c]) ok = false;
        cells.push(c);
      }
    }
    if (!ok || run[y * w + x] || crowded(x, y)) continue;
    const across = d % 2 === 0;
    const b = isl.length;
    add(x, y);
    for (const c of cells) run[c] = across ? 1 : 2;
    bridges.push({ a, b, v: rng.next() < spec.doubles ? 2 : 1, cells, across });
  }
  if (isl.length < Math.max(3, spec.islands * 0.75)) return null;
  // Extra bridges between islands that see each other with a clear run between.
  const islands: Island[] = isl.map((p) => ({ ...p, n: 0 }));
  const have = new Set(bridges.map((br) => `${Math.min(br.a, br.b)}:${Math.max(br.a, br.b)}`));
  for (const l of linksOf(w, h, islands)) {
    const key = `${Math.min(l.a, l.b)}:${Math.max(l.a, l.b)}`;
    if (have.has(key) || l.cells.some((c) => run[c]) || rng.next() >= spec.extra) continue;
    for (const c of l.cells) run[c] = l.across ? 1 : 2;
    bridges.push({ a: l.a, b: l.b, v: rng.next() < spec.doubles ? 2 : 1, cells: l.cells, across: l.across });
    have.add(key);
  }
  for (const br of bridges) {
    islands[br.a].n += br.v;
    islands[br.b].n += br.v;
  }
  return islands;
}

interface Candidate {
  islands: Island[];
  solution: number[];
  score: number;
  hardest: number;
}

/** Of many maps, keep the first whose score is the target, else the closest below it. */
export function generate(spec: BridgesSpec, rng: Rng, tries = spec.target >= 3 ? 700 : 80): Candidate | null {
  let best: Candidate | null = null;
  for (let k = 0; k < tries; k++) {
    const islands = layOut(spec, rng);
    if (!islands) continue;
    const ls = linksOf(spec.w, spec.h, islands);
    const r = solveLogic({ islands, links: ls }, spec.target >= 3 ? 3 : spec.target);
    if (!r.bridges) continue;
    const score = bridgesScore(r.hardest, r.trials);
    if (score > spec.target) continue;
    if (!best || score > best.score) best = { islands, solution: r.bridges, score, hardest: r.hardest };
    if (score === spec.target) break;
  }
  return best;
}

export function buildBridgesLevel(n: number): BridgesLevel {
  const spec = bridgesSpecFor(n);
  const rng = new Rng(n * 6203 + 11);
  let c = generate(spec, rng);
  for (let k = 0; !c && k < 5; k++) c = generate({ ...spec, target: 3 }, rng);
  const islands = c!.islands;
  return {
    number: n,
    w: spec.w,
    h: spec.h,
    islands,
    links: linksOf(spec.w, spec.h, islands),
    solution: c!.solution,
    difficulty: n <= TUTORIAL_COUNT ? 'Tutorial' : rateBridges(c!.score),
    score: c!.score,
    hardest: TIER_NAMES[c!.hardest],
    tip: spec.tip,
  };
}
