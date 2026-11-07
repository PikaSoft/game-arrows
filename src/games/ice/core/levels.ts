import { Rng } from '../../../shared/rng';
import { iceScore, iceSpecFor, IceSpec, rateIce, TUTORIAL_COUNT } from './difficulty';
import { Board } from './rules';
import { explore, stops } from './solver';
import { IceLevel } from './types';

interface Candidate {
  rocks: boolean[];
  holes: number[];
  starts: number[];
  exits: number[];
  par: number;
  score: number;
}

/**
 * Scatter rocks and holes, place the pucks, then pick flags among the cells each puck
 * can stop at, so every flag can be reached. A full search from the start gives par and
 * counts the dead ends. Keep the board whose score is closest to `target`. Work is
 * capped by attempts and positions searched, not time, so every device builds the same
 * board.
 */
export function generate(spec: IceSpec, rng: Rng, target: number): Candidate {
  const { w, h } = spec;
  const n = w * h;
  let best: Candidate | null = null;
  let work = 0;
  const off = (c: Candidate) => Math.abs(c.score - target);
  for (let attempt = 0; attempt < 80 && work < 300000; attempt++) {
    const rocks = new Array<boolean>(n).fill(false);
    const cells = rng.shuffle([...Array(n).keys()]);
    const rockCount = Math.round(n * spec.rocks);
    for (const i of cells.slice(0, rockCount)) rocks[i] = true;
    const free = cells.slice(rockCount);
    const starts = free.slice(0, spec.pucks);
    const holes = free.slice(spec.pucks, spec.pucks + spec.holes);
    const base: Board = { w, h, rocks, holes, exits: [] };
    // Flags: cells each puck can stop at on its own, a fair distance away.
    const reach = starts.map((s) => stops(base, s));
    for (let pick = 0; pick < 6; pick++) {
      const exits = starts.map((_, k) => {
        const options = [...reach[k].entries()].filter(([c, d]) => d >= 2 && !starts.includes(c));
        if (!options.length) return -1;
        // Lean toward far stops: pick the furthest of a few random ones.
        let bestOpt = rng.pick(options);
        for (let r = 0; r < 2; r++) {
          const o = rng.pick(options);
          if (o[1] > bestOpt[1]) bestOpt = o;
        }
        return bestOpt[0];
      });
      if (exits.some((e) => e < 0) || new Set(exits).size !== exits.length) continue;
      const s = explore({ ...base, exits }, starts, 20000);
      work += s.reachable;
      if (s.par < 2) continue;
      const c: Candidate = { rocks, holes, starts, exits, par: s.par, score: iceScore(s.par, s.reachable, s.dead) };
      if (!best || off(c) < off(best)) best = c;
    }
    if (best && off(best) === 0) break;
  }
  if (best) return best;
  return generate({ ...spec, rocks: Math.max(0.08, spec.rocks - 0.03) }, rng, target);
}

export function buildIceLevel(n: number): IceLevel {
  const spec = iceSpecFor(n);
  const rng = new Rng(n * 48271 + 19);
  const c = generate(spec, rng, spec.target);
  return {
    number: n,
    w: spec.w,
    h: spec.h,
    rocks: c.rocks,
    holes: c.holes,
    starts: c.starts,
    exits: c.exits,
    par: c.par,
    difficulty: n <= TUTORIAL_COUNT ? 'Tutorial' : rateIce(c.score),
    score: c.score,
    tip: spec.tip,
  };
}
