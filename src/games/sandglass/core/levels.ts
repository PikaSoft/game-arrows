import { Rng } from '../../../shared/rng';
import { blunderScore, rateSand, sandSpecFor, SandSpec } from './difficulty';
import { isComplete, topRun } from './rules';
import { solve } from './solver';
import { Bottle, SandLevel } from './types';

interface Candidate {
  bottles: Bottle[];
  par: number;
  score: number;
}

/** Deal every layer of sand into the bottles at random, leaving the spares empty. */
export function deal(spec: SandSpec, rng: Rng): Bottle[] {
  const units: number[] = [];
  for (let c = 0; c < spec.colors; c++) for (let i = 0; i < spec.capacity; i++) units.push(c);
  rng.shuffle(units);
  const bottles: Bottle[] = [];
  for (let b = 0; b < spec.colors; b++) bottles.push(units.slice(b * spec.capacity, (b + 1) * spec.capacity));
  for (let e = 0; e < spec.empties; e++) bottles.push([]);
  return bottles;
}

/** A deal is too easy if sand is already sorted into long runs. */
function wellMixed(bottles: Bottle[], cap: number): boolean {
  let same = 0;
  let pairs = 0;
  for (const b of bottles) {
    if (isComplete(b, cap) || (b.length && topRun(b) >= cap - 1)) return false;
    for (let i = 1; i < b.length; i++) {
      pairs++;
      if (b[i] === b[i - 1]) same++;
    }
  }
  return same <= Math.ceil(pairs * 0.2);
}

export function generate(spec: SandSpec, rng: Rng, wanted: number, pickHardest: boolean): Candidate {
  let best: Candidate | null = null;
  let found = 0;
  for (let attempt = 0; attempt < 400 && found < wanted; attempt++) {
    const bottles = deal(spec, rng);
    if (!wellMixed(bottles, spec.capacity)) continue;
    const res = solve(bottles, spec.capacity, spec.colors > 8 ? 15000 : 30000);
    if (!res) continue;
    found++;
    const score = blunderScore(bottles, spec.capacity, res.moves);
    const c = { bottles, par: res.moves.length, score };
    if (!best || (pickHardest ? c.score > best.score : c.score < best.score)) best = c;
  }
  if (best) return best;
  // Should never happen, but always hand back a playable board: add a spare bottle.
  return generate({ ...spec, empties: spec.empties + 1 }, rng, 1, pickHardest);
}

export function buildSandLevel(n: number): SandLevel {
  const spec = sandSpecFor(n);
  const rng = new Rng(n * 104729 + 7);
  const tutorial = spec.tip !== undefined && !spec.hidden;
  const big = spec.colors * spec.capacity > 40;
  const c = generate(spec, rng, tutorial || big ? 3 : 4, !tutorial);
  // Covered layers: everything below each bottle's top run.
  const hidden = c.bottles.map((b) => (spec.hidden && b.length ? b.length - topRun(b) : 0));
  const covered = hidden.reduce((s, h) => s + h, 0);
  // Without seeing everything, nobody can plan perfectly; allow for some discovery.
  const par = c.par + Math.ceil(covered / 4);
  return {
    number: n,
    capacity: spec.capacity,
    colors: spec.colors,
    bottles: c.bottles,
    hidden,
    par,
    difficulty: tutorial ? 'Tutorial' : rateSand(c.score),
    score: c.score,
    tip: spec.tip,
  };
}
