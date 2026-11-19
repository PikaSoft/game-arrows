import { Rng } from '../../../shared/rng';
import { PairsSpec, pairsSpecFor, ratePairs, TUTORIAL_COUNT } from './difficulty';
import { blocks } from './rules';
import { dealBackwards, deadShare } from './solver';
import { KINDS, PairsLevel, Slot } from './types';

/**
 * A pile, mirrored left to right. The bottom layer is a block of tiles with some left
 * out. Each layer above sits either straight on the tiles below or straddling four of
 * them, but only where every part of it rests on a tile. The count is kept even.
 */
export function layOut(spec: PairsSpec, rng: Rng): Slot[] {
  const { cols, rows } = spec;
  const span = cols * 2;
  const slots: Slot[] = [];
  const keyOf = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const taken = new Set<string>();
  const add = (x: number, y: number, z: number) => {
    if (taken.has(keyOf(x, y, z))) return;
    taken.add(keyOf(x, y, z));
    slots.push({ x, y, z });
  };
  // Bottom layer: the middle rows always full, others thinned from the outside in.
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < Math.ceil(cols / 2); c++) {
      const edge = r === 0 || r === rows - 1 || c === 0;
      if (edge && rng.next() > spec.fill) continue;
      add(c * 2, r * 2, 0);
      add(span - 2 - c * 2, r * 2, 0);
    }
  // Half-squares covered by each layer.
  const covered = (z: number) => {
    const s = new Set<string>();
    for (const t of slots) if (t.z === z) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) s.add(`${t.x + dx},${t.y + dy}`);
    return s;
  };
  for (let z = 1; z < spec.layers; z++) {
    const below = covered(z - 1);
    const off = z > 1 || rng.next() < 0.5 ? 1 : 0;
    const rests = (x: number, y: number) => [[0, 0], [1, 0], [0, 1], [1, 1]].every(([dx, dy]) => below.has(`${x + dx},${y + dy}`));
    let any = false;
    for (let y = off; y + 2 <= rows * 2; y += 2)
      for (let x = off; x * 2 + 2 <= span; x += 2) {
        const mx = span - 2 - x;
        if (!rests(x, y) || !rests(mx, y) || rng.next() > spec.upper) continue;
        add(x, y, z);
        add(mx, y, z);
        any = true;
      }
    if (!any) break;
  }
  if (slots.length % 2) {
    // Lift one tile off the top layer (nothing rests on it).
    const top = Math.max(...slots.map((s) => s.z));
    const i = slots.findIndex((s) => s.z === top);
    slots.splice(i, 1);
  }
  return slots;
}

/** Pictures for each pair: `kinds` different ones, spread evenly, in a random order. */
export function pairKinds(pairs: number, kinds: number, rng: Rng): number[] {
  const chosen = rng.shuffle([...Array(KINDS).keys()]).slice(0, Math.min(kinds, KINDS));
  return rng.shuffle(Array.from({ length: pairs }, (_, i) => chosen[i % chosen.length]));
}

/** Of up to `tries` deals, keep the one whose share of stuck playthroughs is closest to the target. */
export function deal(spec: PairsSpec, slots: Slot[], rng: Rng, tries = 30): { faces: number[]; score: number } {
  const b = blocks(slots);
  const alive = slots.map(() => true);
  let best: { faces: number[]; score: number } | null = null;
  for (let k = 0; k < tries; k++) {
    const faces = dealBackwards(b, alive, pairKinds(slots.length / 2, spec.kinds, rng), rng);
    if (!faces) continue;
    const score = Math.round(deadShare(b, faces, alive, rng) * 100) / 100;
    if (!best || Math.abs(score - spec.target) < Math.abs(best.score - spec.target)) best = { faces, score };
    if (Math.abs(score - spec.target) < 0.04) break;
  }
  return best!;
}

export function buildPairsLevel(n: number): PairsLevel {
  const spec = pairsSpecFor(n);
  const rng = new Rng(n * 4421 + 9);
  let slots = layOut(spec, rng);
  let d = deal(spec, slots, rng);
  // A pile that never deals (it can't in practice) gets a fresh layout.
  for (let k = 0; !d && k < 10; k++) {
    slots = layOut(spec, rng);
    d = deal(spec, slots, rng);
  }
  return {
    number: n,
    slots,
    faces: d.faces,
    difficulty: n <= TUTORIAL_COUNT ? 'Tutorial' : ratePairs(d.score),
    score: d.score,
    tip: spec.tip,
  };
}
