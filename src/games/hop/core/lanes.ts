import { Rng } from '../../../shared/rng';

/** The board, in cells: columns across, rows from the nests (0) down to the start (12). */
export const COLS = 9;
export const ROWS = 13;
export const NEST_ROW = 0;
export const RIVER_ROWS = [1, 2, 3, 4, 5];
export const MID_ROW = 6;
export const ROAD_ROWS = [7, 8, 9, 10, 11];
export const START_ROW = 12;
/** Nest columns along the top bank. Landing anywhere else on it is a fall. */
export const NEST_COLS = [1, 3, 5, 7];
/**
 * Things in a lane run round a loop longer than the board, so they leave one side
 * completely before coming back in on the other.
 */
export const MARGIN = 4;
export const LOOP = COLS + MARGIN * 2;

export type LaneKind = 'road' | 'logs' | 'pads';

export interface Thing {
  /** Left edge at time 0, around the loop (0 to LOOP). */
  offset: number;
  len: number;
  /** For pads: when this raft starts its dive cycle, in seconds. */
  phase: number;
  /** Car colour index, for drawing. */
  look: number;
}

export interface Lane {
  row: number;
  kind: LaneKind;
  /** +1 to the right, -1 to the left. */
  dir: 1 | -1;
  /** Cells a second. */
  speed: number;
  things: Thing[];
}

/** Pads go round a cycle: afloat, a warning wobble, then under for a moment. */
export const PAD_CYCLE = 5;
export const PAD_WARN = 0.9;
export const PAD_UNDER = 1.2;

export interface LevelSpec {
  level: number;
  /** Speed multiplier over the base lane speeds. */
  pace: number;
  lanes: Lane[];
}

/** How much faster each level is than the first, capped. */
export const paceFor = (level: number): number => Math.min(1 + 0.1 * (level - 1), 2);

/**
 * Split `room` into `n` gaps, each between `lo` and `hi`. Returns null if it can't be done.
 */
function splitGaps(rng: Rng, n: number, room: number, lo: number, hi: number): number[] | null {
  if (n * lo > room + 1e-9 || n * hi < room - 1e-9) return null;
  const gaps = new Array<number>(n).fill(lo);
  let left = room - n * lo;
  // Hand out what's left in small random pieces to gaps with space.
  let guard = 0;
  while (left > 1e-9 && guard++ < 1000) {
    const open = gaps.map((g, i) => (g < hi - 1e-9 ? i : -1)).filter((i) => i >= 0);
    const i = rng.pick(open);
    const add = Math.min(left, hi - gaps[i], 0.25 + rng.next() * 0.75);
    gaps[i] += add;
    left -= add;
  }
  return gaps;
}

/** Lay `things` round the loop with gaps between `lo` and `hi`, lengths from `lens()`. */
function layLane(rng: Rng, lens: () => number, lo: number, hi: number): Thing[] {
  for (let tries = 0; tries < 200; tries++) {
    const n = rng.int(2, 6);
    const ls = Array.from({ length: n }, lens);
    const gaps = splitGaps(rng, n, LOOP - ls.reduce((a, b) => a + b, 0), lo, hi);
    if (!gaps) continue;
    const start = rng.next() * LOOP;
    let at = start;
    return ls.map((len, i) => {
      const t: Thing = { offset: at % LOOP, len, phase: rng.next() * PAD_CYCLE, look: rng.int(0, 3) };
      at += len + gaps[i];
      return t;
    });
  }
  throw new Error('could not lay lane');
}

/**
 * Level N's lanes, from N as the seed. Lanes take turns going left and right. Roads get
 * longer trucks and tighter gaps as the levels go on; logs get shorter. Every road gap is
 * wide enough to stand in, and every river gap short enough that a log comes along soon.
 */
export function buildLevel(level: number): LevelSpec {
  const rng = new Rng(level * 7919 + 13);
  const pace = paceFor(level);
  const lanes: Lane[] = [];
  const firstDir: 1 | -1 = rng.next() < 0.5 ? 1 : -1;
  // Pads (rafts that dive now and then) replace one log lane from level 3, two from level 7.
  const padCount = level >= 7 ? 2 : level >= 3 ? 1 : 0;
  const padRows = rng.shuffle([2, 3, 4, 5]).slice(0, padCount);
  RIVER_ROWS.forEach((row, i) => {
    const dir: 1 | -1 = i % 2 ? firstDir : (-firstDir as 1 | -1);
    const base = 0.7 + rng.next() * 0.7;
    if (padRows.includes(row)) {
      lanes.push({ row, kind: 'pads', dir, speed: base * 0.8 * pace, things: layLane(rng, () => rng.int(2, 3), 1, 2.5) });
    } else {
      const longest = level < 4 ? 4 : 3;
      const shortest = level < 6 ? 3 : 2;
      lanes.push({ row, kind: 'logs', dir, speed: base * pace, things: layLane(rng, () => rng.int(shortest, longest), 1.2, 3.2) });
    }
  });
  ROAD_ROWS.forEach((row, i) => {
    const dir: 1 | -1 = i % 2 ? firstDir : (-firstDir as 1 | -1);
    const base = 0.8 + rng.next() * 1.0;
    const trucks = Math.min(0.15 + level * 0.04, 0.5);
    const lens = () => (rng.next() < trucks ? rng.int(2, 3) : 1);
    // Faster lanes leave wider gaps, so a gap passes long enough to step into.
    const lo = 2 + base * pace * 0.5;
    lanes.push({ row, kind: 'road', dir, speed: base * pace, things: layLane(rng, lens, lo, lo + 4) });
  });
  return { level, pace, lanes };
}

/** Left edge on the board (can be off either side) of a thing at time t. */
export function leftAt(lane: Lane, th: Thing, t: number): number {
  const raw = (th.offset + lane.dir * lane.speed * t) % LOOP;
  return (raw < 0 ? raw + LOOP : raw) - MARGIN;
}

/** Where a pad raft is in its dive cycle: 0 afloat, 1 wobbling (about to dive), 2 under. */
export function padState(th: Thing, t: number): 0 | 1 | 2 {
  const c = (((t + th.phase) % PAD_CYCLE) + PAD_CYCLE) % PAD_CYCLE;
  if (c >= PAD_CYCLE - PAD_UNDER) return 2;
  if (c >= PAD_CYCLE - PAD_UNDER - PAD_WARN) return 1;
  return 0;
}

/** The spans [left, right] the lane's things cover on the board at time t, wrap copies included. */
export function spansAt(lane: Lane, t: number): { left: number; right: number; th: Thing }[] {
  const out: { left: number; right: number; th: Thing }[] = [];
  for (const th of lane.things) {
    const l = leftAt(lane, th, t);
    out.push({ left: l, right: l + th.len, th });
    out.push({ left: l - LOOP, right: l - LOOP + th.len, th });
  }
  return out;
}
