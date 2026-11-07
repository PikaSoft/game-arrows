import { Rng } from '../../../shared/rng';
import { crateSpecFor, CrateSpec, rateCrates, TUTORIAL_COUNT } from './difficulty';
import { reach, Room } from './rules';
import { carveRoom } from './room';
import { crateDistances, lowerBound, pullAll } from './solver';
import { CrateLevel } from './types';

interface Candidate {
  w: number;
  h: number;
  walls: boolean[];
  targets: number[];
  crates: number[];
  player: number;
  par: number;
  extra: number;
}

/**
 * Carve rooms, place targets, and pull crates backward from solved to find every position
 * that can be solved and its exact par. Keep the position whose extra pushes are closest
 * to `target`, preferring a par of at least `minPar`, across a few rooms. Work is capped
 * by positions explored, not time, so every device builds the same level.
 */
export function generate(spec: CrateSpec, rng: Rng, target: number): Candidate {
  let best: Candidate | null = null;
  // Close to the target extra pushes first; then longer is better, and short of minPar is penalised.
  const score = (c: Candidate) => Math.abs(c.extra - target) * 3 - Math.min(c.par, spec.minPar * 2) * 0.2 + Math.max(0, spec.minPar - c.par) * 2;
  let work = 0;
  for (let attempt = 0; attempt < 30 && work < 35000; attempt++) {
    const carved = carveRoom(spec.w, spec.h, rng, spec.crates * 4 + 6, spec.pillars);
    if (!carved) continue;
    const { w, h, walls } = carved;
    const room: Room = carved;
    const floor = walls.map((x, i) => (x ? -1 : i)).filter((i) => i >= 0);
    // Targets away from the outer walls where possible, so they can be reached from several sides.
    const open = (i: number) => [1, -1, w, -w].filter((d) => !walls[i + d]).length;
    const spots = rng.shuffle(floor.filter((i) => open(i) >= 3));
    if (spots.length < spec.crates) continue;
    const targets = spots.slice(0, spec.crates).sort((a, b) => a - b);
    const all = pullAll(room, targets, 7000);
    work += all.length;
    const tables = targets.map((t) => crateDistances(room, t));
    // Look at the deepest positions and a random sample of the rest.
    const deep = all.slice(-200);
    const sample = deep.concat(Array.from({ length: 200 }, () => rng.pick(all)));
    for (const p of sample) {
      if (p.dist < 2) continue;
      // Not too many crates already home.
      const home = p.crates.filter((c) => targets.includes(c)).length;
      if (home > Math.floor(spec.crates / 3)) continue;
      const lb = lowerBound(room, targets, p.crates, tables);
      // Put the player somewhere in their area, away from the crates if possible.
      const blocked = new Uint8Array(w * h);
      for (const c of p.crates) blocked[c] = 1;
      const area = reach(room, blocked, p.area);
      const cells = [...area.keys()].filter((i) => area[i]);
      const player = rng.pick(cells);
      const c: Candidate = { w, h, walls, targets, crates: p.crates, player, par: p.dist, extra: p.dist - lb };
      if (!best || score(c) < score(best)) best = c;
    }
    if (best && Math.abs(best.extra - target) <= 1 && best.par >= spec.minPar) break;
  }
  if (best) return best;
  // Every room came out too cramped: try again with one crate fewer.
  return generate({ ...spec, crates: Math.max(1, spec.crates - 1) }, rng, target);
}

export function buildCrateLevel(n: number): CrateLevel {
  const spec = crateSpecFor(n);
  const rng = new Rng(n * 611953 + 5);
  const c = generate(spec, rng, spec.target);
  return {
    number: n,
    w: c.w,
    h: c.h,
    walls: c.walls,
    targets: c.targets,
    crates: c.crates,
    player: c.player,
    par: c.par,
    difficulty: n <= TUTORIAL_COUNT ? 'Tutorial' : rateCrates(c.extra),
    score: c.extra,
    tip: spec.tip,
  };
}
