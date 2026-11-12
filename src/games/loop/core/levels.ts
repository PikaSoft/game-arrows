import { Rng } from '../../../shared/rng';
import { loopScore, loopSpecFor, LoopSpec, rateLoop, TUTORIAL_COUNT } from './difficulty';
import { crateCount } from './rules';
import { STEP_HZ } from './sim';
import { blunderRate, replay, solveLoop } from './solver';
import { CRATE, Crate, LoopLevel } from './types';

/** The smallest and biggest belts the generator hands out. */
export const MIN_CAPACITY = 8;
export const MAX_CAPACITY = 32;

const full = (c: number): Crate => new Array(CRATE).fill(c);

interface Board {
  supply: Crate[][];
  bays: number[][];
  capacity: number;
}

/** Hand-made boards for the first levels. Colours: 0 red, 1 blue, 2 yellow, 3 green. */
const TUTORIAL_BOARDS: Board[] = [
  // Any order works: there is room for everything.
  { supply: [[full(0), full(1)], [full(1), full(0)]], bays: [[0, 0], [1, 1]], capacity: 16 },
  // The second tray in each bay has to wait its turn.
  { supply: [[full(0), full(1)], [full(2), full(0)]], bays: [[0, 1], [2, 0]], capacity: 12 },
  // Both front crates are unwanted. Tipping both fills the belt.
  { supply: [[full(2), full(0)], [full(3), full(1)]], bays: [[0, 2], [1, 3]], capacity: 8 },
  // A longer one with the same trap.
  { supply: [[full(3), full(1), full(0)], [full(2), full(0), full(1)]], bays: [[0, 1, 2], [3, 0, 1]], capacity: 8 },
];

/** Deal trays into bays and a matching crate for each into the columns. */
export function deal(spec: LoopSpec, rng: Rng): { supply: Crate[][]; bays: number[][] } {
  const trays: number[] = [];
  for (let c = 0; c < spec.colors; c++) trays.push(c);
  while (trays.length < spec.trays) trays.push(rng.int(0, spec.colors - 1));
  const crates: Crate[] = trays.map(full);
  rng.shuffle(trays);
  const bays: number[][] = Array.from({ length: spec.bays }, () => []);
  trays.forEach((c, k) => bays[k % spec.bays].push(c));
  // Mixed crates: two crates of different colours swap half their cubes.
  for (let m = 0; m < spec.mixed; m++) {
    for (let tries = 0; tries < 20; tries++) {
      const a = rng.pick(crates);
      const b = rng.pick(crates);
      if (a[0] === b[0] || a[0] !== a[CRATE - 1] || b[0] !== b[CRATE - 1]) continue;
      const half = CRATE / 2;
      const ca = a[0];
      const cb = b[0];
      for (let k = half; k < CRATE; k++) {
        a[k] = cb;
        b[k] = ca;
      }
      break;
    }
  }
  rng.shuffle(crates);
  const supply: Crate[][] = Array.from({ length: spec.cols }, () => []);
  crates.forEach((crate, k) => supply[k % spec.cols].push(crate));
  return { supply, bays };
}

/** The level with everything but its label filled in, or null if this belt size can't be cleared. */
function finish(n: number, spec: LoopSpec, board: Board): LoopLevel | null {
  const level: LoopLevel = {
    number: n,
    colors: spec.colors,
    supply: board.supply,
    bays: board.bays,
    capacity: board.capacity,
    ticksPerSlot: spec.ticksPerSlot,
    covered: spec.covered,
    limitTicks: 0,
    solution: [],
    difficulty: 'Tutorial',
    tip: spec.tip,
  };
  const solution = solveLoop(level);
  if (!solution) return null;
  const ticks = replay(level, solution);
  if (ticks === null) return null;
  level.solution = solution;
  // The clock: a careful run, a quarter again, half a second a tap and a few to get going.
  if (spec.timed) level.limitTicks = Math.round(ticks * 1.25 + solution.length * 0.5 * STEP_HZ + 4 * STEP_HZ);
  return level;
}

/** The smallest belt this deal can be cleared on, with the spec's spare room added. */
function fit(n: number, spec: LoopSpec, d: { supply: Crate[][]; bays: number[][] }): LoopLevel | null {
  const floor = Math.max(MIN_CAPACITY, spec.cols * 4);
  for (let cap = floor; cap <= MAX_CAPACITY; cap += 2) {
    if (!finish(n, spec, { ...d, capacity: cap })) continue;
    // Spare room on top. A bigger belt changes the timing, so check it still clears.
    for (let extra = spec.slack; extra <= spec.slack + 8; extra += 2) {
      const level = finish(n, spec, { ...d, capacity: Math.min(cap + extra, MAX_CAPACITY + 8) });
      if (level) return level;
    }
    return null;
  }
  return null;
}

export function buildLoopLevel(n: number): LoopLevel {
  const spec = loopSpecFor(n);
  if (n <= TUTORIAL_COUNT) {
    const level = finish(n, spec, TUTORIAL_BOARDS[n - 1]);
    if (!level) throw new Error(`Colour Loop tutorial ${n} cannot be cleared`);
    return level;
  }
  const rng = new Rng(n * 7919 + 11);
  let best: LoopLevel | null = null;
  let bestRate = -1;
  let found = 0;
  for (let attempt = 0; attempt < 12 && found < 4; attempt++) {
    const level = fit(n, spec, deal(spec, rng));
    if (!level) continue;
    found++;
    const rate = blunderRate(level, rng);
    if (rate > bestRate) {
      best = level;
      bestRate = rate;
    }
  }
  if (!best) {
    // Should never happen, but always hand back a playable board: a belt with room for
    // every cube can't jam.
    const d = deal(spec, rng);
    best = finish(n, spec, { ...d, capacity: crateCount(d) * CRATE })!;
    bestRate = 0;
  }
  best.score = loopScore(bestRate, best.limitTicks > 0, best.covered);
  best.difficulty = rateLoop(best.score);
  return best;
}
