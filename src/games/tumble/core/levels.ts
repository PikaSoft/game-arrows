import { Rng } from '../../../shared/rng';
import { rateTumble, TumbleSpec, tumbleSpecFor, TUTORIAL_COUNT } from './difficulty';
import { bridgeOwner, covers, roll, startOpen, step } from './rules';
import { solve } from './solver';
import { Block, BRIDGE, DX, DY, FLOOR, GOAL, NONE, STAND, Switch, SWITCH, TumbleLevel, WEAK } from './types';

/** Par plus two for each move of the answer that takes the block further from the goal. */
export function tumbleScore(w: number, start: Block, goal: number, path: number[]): number {
  const gx = goal % w;
  const gy = (goal / w) | 0;
  const dist = (b: Block) => Math.min(...covers(b).map(([x, y]) => Math.abs(x - gx) + Math.abs(y - gy)));
  let b = start;
  let away = 0;
  for (const d of path) {
    const nb = roll(b, d);
    if (dist(nb) > dist(b)) away++;
    b = nb;
  }
  return path.length + 2 * away;
}

/** True if following `path` presses some switch. */
export function pressesSwitch(board: { w: number; h: number; tiles: number[]; switches: Switch[] }, start: Block, path: number[]): boolean {
  const owner = bridgeOwner(board.switches);
  let b = start;
  let o = startOpen(board.switches);
  for (const d of path) {
    const st = step(board, owner, b, o, d);
    if (st.pressed.length) return true;
    b = st.block;
    o = st.open;
  }
  return false;
}

interface Candidate {
  tiles: number[];
  start: Block;
  goal: number;
  switches: Switch[];
  path: number[];
  score: number;
}

/**
 * Grow a board from a random walk of the block: every square it touches becomes floor,
 * the start is where it set off (standing) and the hole where it ends standing. Extra
 * squares go round the walk; some plain squares crack; and for each switch, a stretch of
 * squares the walk reached late becomes bridges, closed, with the switch on a square it
 * passed earlier. The solver then finds the true shortest way, which is often not the walk.
 */
function grow(spec: TumbleSpec, rng: Rng): Candidate | null {
  const { w, h } = spec;
  const tiles = new Array<number>(w * h).fill(NONE);
  const inside = (b: Block) => covers(b).every(([x, y]) => x >= 0 && y >= 0 && x < w && y < h);
  const start: Block = { x: rng.int(1, w - 2), y: rng.int(1, h - 2), pose: STAND };
  let b = start;
  /** When each square was first touched, in moves. */
  const first = new Map<number, number>();
  const touch = (blk: Block, k: number) => {
    for (const [x, y] of covers(blk)) {
      const i = y * w + x;
      tiles[i] = FLOOR;
      if (!first.has(i)) first.set(i, k);
    }
  };
  touch(b, 0);
  let last = -1;
  for (let k = 1; k <= spec.walk + 6; k++) {
    if (k > spec.walk && b.pose === STAND) break;
    const dirs = [0, 1, 2, 3].filter((d) => d !== (last + 2) % 4 && inside(roll(b, d)));
    if (!dirs.length) return null;
    const d = rng.pick(dirs);
    b = roll(b, d);
    last = d;
    touch(b, k);
  }
  if (b.pose !== STAND) return null;
  const goal = b.y * w + b.x;
  if (goal === start.y * w + start.x) return null;
  // Extra squares beside the walk.
  const floor = () => tiles.map((t, i) => (t !== NONE ? i : -1)).filter((i) => i >= 0);
  const extra = Math.round(floor().length * spec.extra);
  for (let k = 0; k < extra; k++) {
    const i = rng.pick(floor());
    const d = rng.int(0, 3);
    const x = (i % w) + DX[d];
    const y = ((i / w) | 0) + DY[d];
    if (x >= 0 && y >= 0 && x < w && y < h) tiles[y * w + x] = FLOOR;
  }
  const startI = start.y * w + start.x;
  tiles[goal] = GOAL;
  // Switches and bridges.
  const switches: Switch[] = [];
  const order = [...first.entries()].filter(([i]) => i !== startI && i !== goal).sort((a, b2) => a[1] - b2[1]);
  for (let s = 0; s < spec.switches; s++) {
    const late = order.filter(([, k]) => k > spec.walk * 0.5).map(([i]) => i).filter((i) => tiles[i] === FLOOR);
    const early = order.filter(([, k]) => k < spec.walk * 0.45).map(([i]) => i).filter((i) => tiles[i] === FLOOR);
    if (!late.length || !early.length) break;
    const at = rng.pick(early);
    const seed = rng.pick(late);
    // A short run of bridge squares: the seed and touched neighbours reached late too.
    const bridges = [seed];
    for (const [ni, k] of order) {
      if (bridges.length >= 3) break;
      if (ni === seed || tiles[ni] !== FLOOR || k <= spec.walk * 0.5) continue;
      if (bridges.some((bi) => Math.abs((bi % w) - (ni % w)) + Math.abs(((bi / w) | 0) - ((ni / w) | 0)) === 1)) bridges.push(ni);
    }
    tiles[at] = SWITCH;
    for (const bi of bridges) tiles[bi] = BRIDGE;
    switches.push({ at, bridges, open: false });
  }
  // Cracked squares.
  for (let i = 0; i < tiles.length; i++) if (tiles[i] === FLOOR && i !== startI && rng.next() < spec.weak) tiles[i] = WEAK;
  const board = { w, h, tiles, switches };
  const r = solve(board, start, startOpen(switches));
  if (!r.path || r.path.length < 2) return null;
  // A switch board must need its switch: the shortest way has to press one.
  if (switches.length && !pressesSwitch(board, start, r.path)) return null;
  return { tiles, start, goal, switches, path: r.path, score: tumbleScore(w, start, goal, r.path) };
}

/** Of up to `tries` boards, keep the one whose score is closest to the target. */
export function generate(spec: TumbleSpec, rng: Rng, tries = spec.switches ? 200 : 60): Candidate | null {
  let best: Candidate | null = null;
  for (let k = 0; k < tries; k++) {
    const c = grow(spec, rng);
    if (!c) continue;
    if (spec.switches && c.switches.length < spec.switches) continue;
    if (!best || Math.abs(c.score - spec.target) < Math.abs(best.score - spec.target)) best = c;
    if (Math.abs(c.score - spec.target) < 1) break;
  }
  return best;
}

export function buildTumbleLevel(n: number): TumbleLevel {
  const spec = tumbleSpecFor(n);
  const rng = new Rng(n * 7151 + 3);
  let c = generate(spec, rng);
  for (let k = 0; !c && k < 10; k++) c = generate({ ...spec, switches: 0 }, rng);
  return {
    number: n,
    w: spec.w,
    h: spec.h,
    tiles: c!.tiles,
    start: c!.start,
    goal: c!.goal,
    switches: c!.switches,
    par: c!.path.length,
    solution: c!.path,
    difficulty: n <= TUTORIAL_COUNT ? 'Tutorial' : rateTumble(c!.score),
    score: c!.score,
    tip: spec.tip,
  };
}
