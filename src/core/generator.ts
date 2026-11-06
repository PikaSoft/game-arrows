import { Rng } from './rng';
import { solve } from './solver';
import { Arrow, Cell, DELTA, DIRS, Dir, OPPOSITE } from './types';

export interface GenParams {
  w: number;
  h: number;
  minLen: number;
  maxLen: number;
  /** Chance that a body segment keeps going straight instead of turning (0..1). */
  straightness: number;
  /** Boards generated per level; the one with the deepest dependency chain wins. */
  candidates: number;
}

export interface Generated {
  w: number;
  h: number;
  arrows: Arrow[];
  depth: number;
  initialFree: number;
}

/**
 * Builds a fully packed, always solvable board by working backwards.
 *
 * Arrows are inserted one at a time onto an empty grid. Each new arrow must have a
 * clear straight line from its head to the edge at the moment it is placed. Playing
 * the insertions in reverse is then a valid solution: the last arrow placed has a
 * clear path, and removing it can only clear paths for the rest.
 *
 * To make sure the grid can be filled completely, every empty cell must keep at
 * least one clear straight line to an edge after each insertion (it is "exposed").
 * Any exposed cell can always host at least a one-cell arrow, so filling never
 * paints itself into a corner unless an insertion breaks that rule, which we reject.
 */
export function generate(seed: number, p: GenParams): Generated {
  let best: Generated | null = null;
  let attempt = 0;
  let made = 0;
  while (made < p.candidates && attempt < p.candidates * 20) {
    const arrows = tryBuild(new Rng(seed * 7919 + attempt), p);
    attempt++;
    if (!arrows) continue;
    const res = solve({ w: p.w, h: p.h, arrows });
    if (!res.solvable) continue; // should never happen; guard anyway
    made++;
    const g: Generated = { w: p.w, h: p.h, arrows, depth: res.depth, initialFree: res.initialFree };
    if (!best || score(g) > score(best)) best = g;
  }
  if (!best) throw new Error(`Generator failed for seed ${seed}`);
  return best;
}

function score(g: Generated): number {
  // Deep dependency chains and few starting moves make for harder boards.
  return g.depth * 10 - g.initialFree / Math.max(1, g.arrows.length) * 50;
}

function tryBuild(rng: Rng, p: GenParams): Arrow[] | null {
  const { w, h } = p;
  const N = w * h;
  const occ = new Uint8Array(N); // 1 = filled
  const placed: Cell[][] = [];
  const dirs: Dir[] = [];
  let emptyCount = N;

  // clear[d][i] = 1 when the straight line from cell i in direction d is empty.
  const base = [new Uint8Array(N), new Uint8Array(N), new Uint8Array(N), new Uint8Array(N)];
  const trial = [new Uint8Array(N), new Uint8Array(N), new Uint8Array(N), new Uint8Array(N)];

  const computeClear = (out: Uint8Array[]) => {
    const [up, down, left, right] = out;
    for (let y = 0; y < h; y++) {
      let ok = 1;
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        left[i] = ok;
        if (occ[i]) ok = 0;
      }
      ok = 1;
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        right[i] = ok;
        if (occ[i]) ok = 0;
      }
    }
    for (let x = 0; x < w; x++) {
      let ok = 1;
      for (let y = 0; y < h; y++) {
        const i = y * w + x;
        up[i] = ok;
        if (occ[i]) ok = 0;
      }
      ok = 1;
      for (let y = h - 1; y >= 0; y--) {
        const i = y * w + x;
        down[i] = ok;
        if (occ[i]) ok = 0;
      }
    }
  };
  const dirIndex: Record<Dir, number> = { U: 0, D: 1, L: 2, R: 3 };

  /**
   * After placing `cells`, does every empty cell still have a clear line out?
   * A cell's left/right lines depend only on its row and up/down only on its
   * column, so only rows and columns the new arrow touches need rescanning.
   */
  const allEmptyExposed = (cells: Cell[]): boolean => {
    for (let k = 0; k < 4; k++) trial[k].set(base[k]);
    const [up, down, left, right] = trial;
    const rows = new Set(cells.map((c) => c.y));
    const cols = new Set(cells.map((c) => c.x));
    for (const y of rows) {
      let ok = 1;
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        left[i] = ok;
        if (occ[i]) ok = 0;
      }
      ok = 1;
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        right[i] = ok;
        if (occ[i]) ok = 0;
      }
    }
    for (const x of cols) {
      let ok = 1;
      for (let y = 0; y < h; y++) {
        const i = y * w + x;
        up[i] = ok;
        if (occ[i]) ok = 0;
      }
      ok = 1;
      for (let y = h - 1; y >= 0; y--) {
        const i = y * w + x;
        down[i] = ok;
        if (occ[i]) ok = 0;
      }
    }
    const exposed = (i: number) => occ[i] || up[i] | down[i] | left[i] | right[i];
    for (const y of rows) for (let x = 0; x < w; x++) if (!exposed(y * w + x)) return false;
    for (const x of cols) for (let y = 0; y < h; y++) if (!exposed(y * w + x)) return false;
    return true;
  };

  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  computeClear(base);

  /** Try to place an arrow with its head on cell idx, at least `floor` cells long. */
  const tryPlace = (idx: number, floor: number): boolean => {
    const hx = idx % w;
    const hy = (idx / w) | 0;
    // Favour long exit lines: later arrows are likely to land in them, which creates
    // the dependencies that make a board hard. Short lines leave arrows trivially free.
    const rayLen = (d: Dir) => (d === 'U' ? hy : d === 'D' ? h - 1 - hy : d === 'L' ? hx : w - 1 - hx);
    const options = DIRS.filter((d) => base[dirIndex[d]][idx] === 1)
      .map((d) => ({ d, k: rayLen(d) * (0.5 + rng.next()) }))
      .sort((a, b) => b.k - a.k)
      .map((o) => o.d);
    for (const d of options) {
      const body = growBody(rng, p, occ, w, h, hx, hy, d, inside);
      if (body.length < floor) continue;
      // Full body first, then shorter versions; shorter bodies block less.
      const lens = [...new Set([body.length, Math.ceil((body.length + floor) / 2), floor])];
      for (const len of lens) {
        const cells = body.slice(0, len);
        for (const c of cells) occ[c.y * w + c.x] = 1;
        if (allEmptyExposed(cells)) {
          placed.push(cells.reverse()); // tail first, head last
          dirs.push(d);
          emptyCount -= len;
          [base[0], trial[0]] = [trial[0], base[0]];
          [base[1], trial[1]] = [trial[1], base[1]];
          [base[2], trial[2]] = [trial[2], base[2]];
          [base[3], trial[3]] = [trial[3], base[3]];
          return true;
        }
        for (const c of cells) occ[c.y * w + c.x] = 0;
      }
    }
    return false;
  };

  // Sweep empty cells in random order. Lower the minimum length only when a whole
  // sweep places nothing, so short arrows appear only where nothing longer fits.
  let floor = Math.max(1, p.minLen);
  while (emptyCount > 0) {
    let progress = false;
    const empties: number[] = [];
    for (let i = 0; i < N; i++) if (!occ[i]) empties.push(i);
    for (const idx of rng.shuffle(empties)) {
      if (occ[idx]) continue;
      if (tryPlace(idx, floor)) progress = true;
    }
    if (!progress) {
      if (floor === 1) return null;
      floor--;
    }
  }

  const arrows = placed.map((cells, i) => ({ id: i, cells, dir: dirs[i] }));
  const merged = absorbFree(rng, p, mergePass(rng, p, arrows));
  // Ids carry no hint about the solution order.
  const ids = rng.shuffle(merged.map((_, i) => i));
  return merged.map((a, i) => ({ ...a, id: ids[i] }));
}

/**
 * Join arrows end to end into longer snakes. An arrow Y whose end touches the tail
 * of arrow X becomes X's new tail section.
 *
 * Input arrows are in insertion order, so a valid removal order is the reverse of
 * their index. If Y is removed after X in that order (Y has the lower index), the
 * merged arrow can simply leave at X's turn: X's exit line is unchanged, and Y's
 * cells now empty earlier than before, which can only help other arrows. So the
 * board stays solvable without re-running the solver.
 */
function mergePass(rng: Rng, p: GenParams, input: Arrow[]): Arrow[] {
  const { w, h } = p;
  const arrows: (Arrow | null)[] = input.slice();
  const key = (c: Cell) => c.y * w + c.x;
  const owner = new Int32Array(w * h);
  arrows.forEach((a, i) => a!.cells.forEach((c) => (owner[key(c)] = i)));

  for (let round = 0; round < 4; round++) {
    let changed = false;
    for (const xi of rng.shuffle(arrows.map((_, i) => i))) {
      const X = arrows[xi];
      if (!X || X.cells.length >= p.maxLen) continue;
      const tail = X.cells[0];
      for (const d of rng.shuffle(DIRS.slice())) {
        const nx = tail.x + DELTA[d].x;
        const ny = tail.y + DELTA[d].y;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        // A one-cell arrow's new last segment must line up with its direction.
        if (X.cells.length === 1 && OPPOSITE[d] !== X.dir) continue;
        const yi = owner[ny * w + nx];
        if (yi >= xi) continue; // Y must leave after X; see above
        const Y = arrows[yi]!;
        if (X.cells.length + Y.cells.length > p.maxLen) continue;
        const yh = Y.cells[Y.cells.length - 1];
        const yt = Y.cells[0];
        let prefix: Cell[] | null = null;
        if (yh.x === nx && yh.y === ny) prefix = Y.cells;
        else if (yt.x === nx && yt.y === ny) prefix = Y.cells.slice().reverse();
        if (!prefix) continue;
        arrows[xi] = { ...X, cells: [...prefix, ...X.cells] };
        arrows[yi] = null;
        for (const c of prefix) owner[key(c)] = xi;
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }
  return arrows.filter((a): a is Arrow => a !== null);
}

/**
 * On a packed board an arrow starts free only if its head sits on the border
 * pointing out, so the edges fill up with easy moves. Fold those arrows into the
 * tail of a neighbouring arrow where the board stays solvable.
 */
function absorbFree(rng: Rng, p: GenParams, input: Arrow[]): Arrow[] {
  const { w, h } = p;
  let arrows = input.slice();
  const owner = new Int32Array(w * h);
  const rebuild = () => arrows.forEach((a, i) => a.cells.forEach((c) => (owner[c.y * w + c.x] = i)));
  rebuild();
  const isFreeStart = (a: Arrow) => {
    const hd = a.cells[a.cells.length - 1];
    const d = DELTA[a.dir];
    const nx = hd.x + d.x;
    const ny = hd.y + d.y;
    return nx < 0 || ny < 0 || nx >= w || ny >= h;
  };
  const target = Math.max(2, Math.round(arrows.length * 0.12));
  const free = rng.shuffle(arrows.filter(isFreeStart));
  let freeCount = free.length;
  for (const X of free) {
    if (freeCount <= target) break;
    const xi = arrows.indexOf(X);
    if (xi < 0) continue;
    // X's tail or head must touch Z's tail; X becomes the start of Z.
    const ends = [
      { at: X.cells[0], seq: X.cells.slice().reverse() }, // X tail touches: walk X head..tail then Z
      { at: X.cells[X.cells.length - 1], seq: X.cells }, // X head touches: walk X tail..head then Z
    ];
    let done = false;
    for (const end of rng.shuffle(ends)) {
      for (const d of rng.shuffle(DIRS.slice())) {
        const nx = end.at.x + DELTA[d].x;
        const ny = end.at.y + DELTA[d].y;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const zi = owner[ny * w + nx];
        if (zi === xi) continue;
        const Z = arrows[zi];
        if (Z.cells.length + X.cells.length > p.maxLen + 2) continue;
        if (Z.cells[0].x !== nx || Z.cells[0].y !== ny) continue;
        if (Z.cells.length === 1 && OPPOSITE[d] === Z.dir) continue;
        const merged: Arrow = { ...Z, cells: [...end.seq, ...Z.cells] };
        if (Z.cells.length === 1) {
          // One-cell arrow: the new last segment must line up with its direction.
          const prev = merged.cells[merged.cells.length - 2];
          const hd = merged.cells[merged.cells.length - 1];
          if (hd.x - prev.x !== DELTA[Z.dir].x || hd.y - prev.y !== DELTA[Z.dir].y) continue;
        }
        if (blocksItself(merged, w, h)) continue;
        const trial = arrows.filter((_, i) => i !== xi).map((a) => (a === Z ? merged : a));
        if (!solve({ w, h, arrows: trial }).solvable) continue;
        arrows = trial;
        rebuild();
        freeCount--;
        done = true;
        break;
      }
      if (done) break;
    }
  }
  return arrows;
}

function blocksItself(a: Arrow, w: number, h: number): boolean {
  const hd = a.cells[a.cells.length - 1];
  const d = DELTA[a.dir];
  for (let x = hd.x + d.x, y = hd.y + d.y; x >= 0 && y >= 0 && x < w && y < h; x += d.x, y += d.y) {
    if (a.cells.some((c) => c.x === x && c.y === y)) return true;
  }
  return false;
}

/** Random walk backwards from the head. Returns cells head-first. */
function growBody(
  rng: Rng,
  p: GenParams,
  occ: Uint8Array,
  w: number,
  _h: number,
  hx: number,
  hy: number,
  d: Dir,
  inside: (x: number, y: number) => boolean,
): Cell[] {
  const body: Cell[] = [{ x: hx, y: hy }];
  const target = rng.int(p.minLen, p.maxLen);
  const used = new Set<number>([hy * w + hx]);
  // Cells on the head's own exit line are off limits, so the arrow never blocks itself.
  const ray = new Set<number>();
  {
    const dd = DELTA[d];
    for (let x = hx + dd.x, y = hy + dd.y; inside(x, y); x += dd.x, y += dd.y) ray.add(y * w + x);
  }
  const ok = (x: number, y: number) => {
    if (!inside(x, y)) return false;
    const i = y * w + x;
    return !occ[i] && !used.has(i) && !ray.has(i);
  };

  // The cell behind the head must line up with the arrow's direction.
  const back = DELTA[d];
  let x = hx - back.x;
  let y = hy - back.y;
  if (!ok(x, y)) return body;
  body.push({ x, y });
  used.add(y * w + x);
  let heading: Dir = OPPOSITE[d]; // direction we are walking (away from head)

  while (body.length < target) {
    const turns = rng.shuffle(DIRS.filter((q) => q !== heading && q !== OPPOSITE[heading]));
    const prefs: Dir[] = rng.next() < p.straightness ? [heading, ...turns] : [...turns, heading];
    let moved = false;
    for (const q of prefs) {
      const nx = x + DELTA[q].x;
      const ny = y + DELTA[q].y;
      if (ok(nx, ny)) {
        x = nx;
        y = ny;
        body.push({ x, y });
        used.add(y * w + x);
        heading = q;
        moved = true;
        break;
      }
    }
    if (!moved) break;
  }
  return body;
}
