import { Rng } from '../../../shared/rng';
import { reach, step } from './rules';

/**
 * A random warehouse floor: `w` x `h` cells including the outer wall. Carved as a few
 * overlapping rectangles, then sprinkled with single pillars, keeping the floor in one
 * piece. Rooms full of nooks and pillars make for more interesting pushing than an open
 * hall. The result is cropped to the floor plus one ring of wall, so its size can come out
 * smaller than asked. Null if the floor came out too small.
 */
export function carveRoom(w: number, h: number, rng: Rng, minFloor: number, pillars: number): { w: number; h: number; walls: boolean[] } | null {
  const n = w * h;
  const walls = new Array<boolean>(n).fill(true);
  const iw = w - 2;
  const ih = h - 2;
  const rects = 3 + rng.int(0, 3);
  for (let r = 0; r < rects; r++) {
    const rw = rng.int(2, Math.max(2, Math.ceil(iw * 0.7)));
    const rh = rng.int(2, Math.max(2, Math.ceil(ih * 0.7)));
    const x0 = rng.int(1, Math.max(1, w - 1 - rw));
    const y0 = rng.int(1, Math.max(1, h - 1 - rh));
    for (let y = y0; y < Math.min(h - 1, y0 + rh); y++) for (let x = x0; x < Math.min(w - 1, x0 + rw); x++) walls[y * w + x] = false;
  }
  // Pillars: a wall cell that doesn't split the floor.
  for (let p = 0; p < pillars; p++) {
    const i = rng.int(0, n - 1);
    if (walls[i]) continue;
    walls[i] = true;
    if (!connected(w, h, walls)) walls[i] = false;
  }
  // Keep the biggest piece of floor.
  const blocked = new Uint8Array(n);
  let bestSeen: Uint8Array | null = null;
  let bestSize = 0;
  const covered = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (walls[i] || covered[i]) continue;
    const s = reach({ w, h, walls }, blocked, i);
    let size = 0;
    for (let j = 0; j < n; j++) if (s[j]) {
      covered[j] = 1;
      size++;
    }
    if (size > bestSize) {
      bestSize = size;
      bestSeen = s;
    }
  }
  if (!bestSeen || bestSize < minFloor) return null;
  for (let i = 0; i < n; i++) walls[i] = !bestSeen[i];
  // Fill dead-end pockets one cell deep that only lead into a wall on three sides: they add
  // nothing but walking.
  for (let i = 0; i < n; i++) {
    if (walls[i]) continue;
    let open = 0;
    for (let d = 0; d < 4; d++) if (!walls[step(w, i, d)]) open++;
    if (open <= 1 && rng.next() < 0.6) walls[i] = true;
  }
  return crop(w, h, walls);
}

/** Trim rows and columns of solid wall, keeping one ring of wall round the floor. */
function crop(w: number, h: number, walls: boolean[]): { w: number; h: number; walls: boolean[] } {
  let x0 = w;
  let y0 = h;
  let x1 = 0;
  let y1 = 0;
  for (let i = 0; i < w * h; i++) {
    if (walls[i]) continue;
    const x = i % w;
    const y = (i / w) | 0;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const cw = x1 - x0 + 3;
  const ch = y1 - y0 + 3;
  const out: boolean[] = [];
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) out.push(walls[(y + y0 - 1) * w + (x + x0 - 1)]);
  return { w: cw, h: ch, walls: out };
}

function connected(w: number, h: number, walls: boolean[]): boolean {
  const n = w * h;
  const first = walls.indexOf(false);
  if (first < 0) return false;
  const s = reach({ w, h, walls }, new Uint8Array(n), first);
  for (let i = 0; i < n; i++) if (!walls[i] && !s[i]) return false;
  return true;
}
