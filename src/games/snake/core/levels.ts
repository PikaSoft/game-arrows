import { Rng } from '../../../shared/rng';
import { Dir, DX, DY, Point, SnakeLevel } from './types';

export const TUTORIAL_COUNT = 3;
const START_LEN = 3;
/** Clear cells needed straight ahead of the head at the start. */
export const START_RUNWAY = 5;

/** Steps a decent player needs per apple, on average: about the mean distance between two cells, plus detours. */
const parFor = (w: number, h: number, target: number, speed: number) =>
  Math.round(((target * (w + h) * 0.5) / speed) * 1000 + 2000);

/** Builds a level from rows of text: '#' wall, '.' floor. */
function fromRows(n: number, rows: string[], start: Point[], dir: Dir, target: number, speed: number, tip: string): SnakeLevel {
  const h = rows.length;
  const w = rows[0].length;
  const walls: number[] = [];
  rows.forEach((r, y) => [...r].forEach((c, x) => c === '#' && walls.push(y * w + x)));
  return { number: n, w, h, walls, start, dir, target, speed, par: parFor(w, h, target, speed), difficulty: 'Tutorial', tip };
}

const column = (x: number, y: number, dy: number): Point[] => Array.from({ length: START_LEN }, (_, k) => ({ x, y: y + k * dy }));

function tutorial(n: number): SnakeLevel {
  const open = Array.from({ length: 13 }, () => '.'.repeat(12));
  if (n === 1) return fromRows(1, open, column(5, 8, 1), 0, 6, 5.5, 'Swipe to steer. Eat 6 apples, and keep off the edges and your own tail.');
  if (n === 2) {
    const rows = open.map((r, y) => (y === 5 ? '..########..' : r));
    rows.push('.'.repeat(12));
    return fromRows(2, rows, column(5, 11, 1), 0, 8, 6, 'Walls are solid too. Go around the bar.');
  }
  const rows = Array.from({ length: 15 }, (_, y) =>
    [...'.'.repeat(13)].map((_, x) => ((x === 3 || x === 9) && (y === 4 || y === 10) ? '#' : '.')).join(''),
  );
  return fromRows(3, rows, column(6, 9, 1), 0, 10, 6.5, 'Each apple makes you longer. Plan a loop before you get boxed in.');
}

/** Every free cell reachable from `from`? */
export function connected(w: number, h: number, wall: Uint8Array, from: number): boolean {
  const seen = new Uint8Array(w * h);
  const stack = [from];
  seen[from] = 1;
  let count = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (wall[j] || seen[j]) continue;
      seen[j] = 1;
      count++;
      stack.push(j);
    }
  }
  let free = 0;
  for (let i = 0; i < wall.length; i++) if (!wall[i]) free++;
  return count === free;
}

/** Can a snake start at `head` facing `dir`, with its body behind and a clear runway ahead? */
export function startFits(w: number, h: number, wall: Uint8Array, head: Point, dir: Dir): boolean {
  for (let k = -(START_LEN - 1); k <= START_RUNWAY; k++) {
    const x = head.x + DX[dir] * k;
    const y = head.y + DY[dir] * k;
    if (x < 0 || y < 0 || x >= w || y >= h || wall[y * w + x]) return false;
  }
  return true;
}

type Sym = 'h' | 'v' | 'both' | 'rot';

function generate(n: number): SnakeLevel {
  const rng = new Rng(n * 7919 + 17);
  const ramp = Math.min(1, (n - TUTORIAL_COUNT - 1) / 26);
  const late = n > 30;
  const w = Math.min(20, 12 + Math.round(ramp * 5) + rng.int(0, late ? 3 : 1));
  const h = w + rng.int(1, 4);
  const target = late ? rng.int(14, 26) : 8 + Math.round(ramp * 12) + rng.int(0, 3);
  const speed = Math.round((late ? 8 + rng.next() * 3 : 6.5 + ramp * 3 + rng.next()) * 4) / 4;
  const sym = rng.pick<Sym>(['h', 'v', 'both', 'rot']);
  let pieces = 2 + Math.round(ramp * 4) + rng.int(0, late ? 3 : 1);

  for (let attempt = 0; attempt < 80; attempt++) {
    if (attempt && attempt % 10 === 0 && pieces > 1) pieces--;
    const wall = new Uint8Array(w * h);
    const put = (x: number, y: number) => {
      const pts: [number, number][] = [[x, y]];
      if (sym === 'h' || sym === 'both') pts.push([w - 1 - x, y]);
      if (sym === 'v' || sym === 'both') pts.push([x, h - 1 - y]);
      if (sym === 'both' || sym === 'rot') pts.push([w - 1 - x, h - 1 - y]);
      for (const [px, py] of pts) if (px >= 0 && py >= 0 && px < w && py < h) wall[py * w + px] = 1;
    };
    for (let p = 0; p < pieces; p++) {
      const kind = rng.int(0, 3);
      const x = rng.int(1, w - 2);
      const y = rng.int(1, h - 2);
      if (kind === 0) {
        // straight bar
        const len = rng.int(2, Math.max(3, Math.floor(w / 3)));
        const horiz = rng.next() < 0.5;
        for (let k = 0; k < len; k++) put(horiz ? x + k : x, horiz ? y : y + k);
      } else if (kind === 1) {
        // L shape
        const a = rng.int(2, 4);
        const b = rng.int(2, 4);
        const sx = rng.next() < 0.5 ? 1 : -1;
        const sy = rng.next() < 0.5 ? 1 : -1;
        for (let k = 0; k < a; k++) put(x + k * sx, y);
        for (let k = 1; k < b; k++) put(x, y + k * sy);
      } else if (kind === 2) {
        put(x, y); // pillar
      } else {
        // 2x2 block
        put(x, y);
        put(x + 1, y);
        put(x, y + 1);
        put(x + 1, y + 1);
      }
    }
    let free = 0;
    for (let i = 0; i < wall.length; i++) if (!wall[i]) free++;
    if (free < (target + START_LEN) * 2.5) continue;

    // Start near the bottom middle, heading up, or anywhere that fits.
    const tries: { head: Point; dir: Dir }[] = [];
    for (let y = Math.floor(h * 0.6); y < h - 2; y++) {
      for (const dx of [0, -1, 1, -2, 2, -3, 3]) tries.push({ head: { x: Math.floor(w / 2) + dx, y }, dir: 0 });
    }
    for (let k = 0; k < 40; k++) tries.push({ head: { x: rng.int(0, w - 1), y: rng.int(0, h - 1) }, dir: rng.int(0, 3) as Dir });
    const start = tries.find((t) => startFits(w, h, wall, t.head, t.dir));
    if (!start) continue;
    const headIdx = start.head.y * w + start.head.x;
    if (!connected(w, h, wall, headIdx)) continue;

    const walls: number[] = [];
    for (let i = 0; i < wall.length; i++) if (wall[i]) walls.push(i);
    const body = Array.from({ length: START_LEN }, (_, k) => ({
      x: start.head.x - DX[start.dir] * k,
      y: start.head.y - DY[start.dir] * k,
    }));
    // Difficulty: how fast, how many apples and how cluttered.
    const score = (speed - 6) / 5 + (target - 8) / 24 + (walls.length / (w * h)) * 3;
    const difficulty = score < 0.5 ? 'Easy' : score < 1.0 ? 'Medium' : score < 1.5 ? 'Hard' : 'Super Hard';
    return { number: n, w, h, walls, start: body, dir: start.dir, target, speed, par: parFor(w, h, target, speed), difficulty };
  }
  // Fallback: an open board always works.
  const head = { x: Math.floor(w / 2), y: h - 4 };
  return {
    number: n,
    w,
    h,
    walls: [],
    start: column(head.x, head.y, 1),
    dir: 0,
    target,
    speed,
    par: parFor(w, h, target, speed),
    difficulty: 'Medium',
  };
}

export function buildSnakeLevel(n: number): SnakeLevel {
  return n <= TUTORIAL_COUNT ? tutorial(n) : generate(n);
}
