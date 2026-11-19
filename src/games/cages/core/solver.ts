import { makes, Shape, shapeOf } from './rules';
import { Cage } from './types';

/**
 * Steps, easiest first. Each square keeps a bitmask of the numbers it could still be
 * (bit d - 1 for d). The solver works in waves, each with the easiest step that narrows
 * anything.
 */
export const TIER_NAMES = ['', 'Singles', 'Cage combinations', 'Pairs and pointing', 'Trial and error'];

export interface Puzzle {
  size: number;
  cages: Cage[];
}

interface Ctx {
  sh: Shape;
  cages: Cage[];
  /** Bitmask of every number. */
  all: number;
  /** Work done (cage-filling steps), and the most allowed before giving up. */
  work: number;
  limit: number;
}

/** Thrown when a solve runs past its work limit. */
class OutOfWork extends Error {}

/** Cage-filling steps one solve may take before it gives up (so every device stops at the same point). */
export const WORK_LIMIT = 400_000;

const bits = (m: number) => {
  let c = 0;
  for (; m; m &= m - 1) c++;
  return c;
};
const digit = (m: number) => 32 - Math.clz32(m);

/** Step 1, singles: a settled square clears its number from its row and column; a number with one place left in a line goes there. */
function singles(c: Ctx, d: Int32Array): boolean | null {
  let changed = false;
  for (let i = 0; i < d.length; i++) {
    if (!d[i]) return null;
    if (bits(d[i]) !== 1) continue;
    for (const p of c.sh.peers[i])
      if (d[p] & d[i]) {
        d[p] &= ~d[i];
        if (!d[p]) return null;
        changed = true;
      }
  }
  for (const u of c.sh.units)
    for (let k = 0; k < c.sh.size; k++) {
      const bit = 1 << k;
      const at = u.filter((i) => d[i] & bit);
      if (!at.length) return null;
      if (at.length === 1 && d[at[0]] !== bit) {
        d[at[0]] = bit;
        changed = true;
      }
    }
  return changed;
}

/**
 * Every way to fill a cage from what its squares could be, keeping numbers apart where
 * two squares share a row or column. Calls `use` with each; stops if it returns false.
 */
function eachFill(c: Ctx, cage: Cage, d: Int32Array, use: (vals: number[]) => boolean | void): void {
  const cells = cage.cells;
  const vals: number[] = [];
  const size = c.sh.size;
  const go = (k: number): boolean => {
    if (++c.work > c.limit) throw new OutOfWork();
    if (k === cells.length) return makes(cage.op, cage.target, vals) ? use(vals) !== false : true;
    for (let m = d[cells[k]]; m; m &= m - 1) {
      const v = digit(m & -m);
      let clash = false;
      for (let j = 0; j < k && !clash; j++) {
        const a = cells[j];
        const b = cells[k];
        if (vals[j] === v && (a % size === b % size || ((a / size) | 0) === ((b / size) | 0))) clash = true;
      }
      if (clash) continue;
      // Cheap bounds for sums and products.
      if (cage.op === '+') {
        const sum = vals.reduce((x, y) => x + y, 0) + v;
        if (sum > cage.target || sum + (cells.length - k - 1) > cage.target) continue;
      } else if (cage.op === 'x') {
        const prod = vals.reduce((x, y) => x * y, 1) * v;
        if (cage.target % prod) continue;
      }
      vals.push(v);
      const ok = go(k + 1);
      vals.pop();
      if (!ok) return false;
    }
    return true;
  };
  go(0);
}

/** Step 2, cage combinations: a number a square has in no working way to fill its cage is out. */
function combos(c: Ctx, d: Int32Array): boolean | null {
  let changed = false;
  for (const cage of c.cages) {
    const seen = new Array<number>(cage.cells.length).fill(0);
    let any = false;
    eachFill(c, cage, d, (vals) => {
      any = true;
      vals.forEach((v, k) => (seen[k] |= 1 << (v - 1)));
    });
    if (!any) return null;
    cage.cells.forEach((i, k) => {
      if ((d[i] & seen[k]) !== d[i]) {
        d[i] &= seen[k];
        changed = true;
      }
    });
  }
  return changed;
}

/**
 * Step 3, pairs and pointing: two squares in a line with the same two numbers left keep
 * them from the rest of the line; and a number every way of filling a cage puts in one
 * line (and nowhere else in the cage's other options for it) is out of the rest of that line.
 */
function pairs(c: Ctx, d: Int32Array): boolean | null {
  let changed = false;
  for (const u of c.sh.units) {
    for (let p = 0; p < u.length; p++) {
      const m = d[u[p]];
      if (bits(m) !== 2) continue;
      for (let q = p + 1; q < u.length; q++) {
        if (d[u[q]] !== m) continue;
        for (const r of u)
          if (r !== u[p] && r !== u[q] && d[r] & m) {
            d[r] &= ~m;
            if (!d[r]) return null;
            changed = true;
          }
      }
    }
  }
  // Pointing: for each cage and number, if every way to fill the cage uses that number in
  // the same row (or column), no other square of that line outside the cage can have it.
  const size = c.sh.size;
  for (const cage of c.cages) {
    let ways = 0;
    // For each number: the set of rows / columns it lands in, across ways (bitmask), and how many ways use it.
    const used = new Array<number>(size).fill(0);
    const rowMask = new Array<number>(size).fill(0);
    const colMask = new Array<number>(size).fill(0);
    let tooMany = false;
    eachFill(c, cage, d, (vals) => {
      if (++ways > 400) {
        tooMany = true;
        return false;
      }
      const inThis = new Array<number>(size).fill(0);
      const r = new Array<number>(size).fill(-1);
      const col = new Array<number>(size).fill(-1);
      vals.forEach((v, k) => {
        const i = cage.cells[k];
        inThis[v - 1]++;
        // A number used twice in a cage is in two rows and two columns: mark as spread.
        r[v - 1] = inThis[v - 1] > 1 ? -2 : (i / size) | 0;
        col[v - 1] = inThis[v - 1] > 1 ? -2 : i % size;
      });
      for (let v = 0; v < size; v++) {
        if (!inThis[v]) continue;
        used[v]++;
        rowMask[v] |= r[v] < 0 ? -1 : 1 << r[v];
        colMask[v] |= col[v] < 0 ? -1 : 1 << col[v];
      }
    });
    if (tooMany || !ways) continue;
    const inCage = new Set(cage.cells);
    for (let v = 0; v < size; v++) {
      if (used[v] !== ways) continue;
      const bit = 1 << v;
      for (const [mask, lines] of [
        [rowMask[v], c.sh.rows],
        [colMask[v], c.sh.cols],
      ] as const) {
        if (mask < 0 || bits(mask) !== 1) continue;
        for (const i of lines[digit(mask) - 1])
          if (!inCage.has(i) && d[i] & bit) {
            d[i] &= ~bit;
            if (!d[i]) return null;
            changed = true;
          }
      }
    }
  }
  return changed;
}

function step(c: Ctx, d: Int32Array, tier: number): boolean | null {
  return tier === 1 ? singles(c, d) : tier === 2 ? combos(c, d) : tier === 3 ? pairs(c, d) : trial(c, d);
}

/** Apply steps 1 to 3 until nothing changes. False if the board turns out impossible. */
function propagate(c: Ctx, d: Int32Array): boolean {
  for (;;) {
    let moved = false;
    for (let t = 1; t <= 3 && !moved; t++) {
      const r = step(c, d, t);
      if (r === null) return false;
      moved = r;
    }
    if (!moved) return true;
  }
}

/** Step 4, trial and error: a number that leads (by steps 1 to 3) to an impossible board is out. Stops at the first. */
function trial(c: Ctx, d: Int32Array): boolean {
  // Squares with the fewest options first (two-way squares are the quickest to test).
  const order = [...d.keys()].filter((i) => bits(d[i]) > 1).sort((a, b) => bits(d[a]) - bits(d[b]) || a - b);
  for (const i of order)
    for (let m = d[i]; m; m &= m - 1) {
      const bit = m & -m;
      const t = d.slice();
      t[i] = bit;
      if (!propagate(c, t)) {
        d[i] &= ~bit;
        return true;
      }
    }
  return false;
}

function ctxOf(p: Puzzle, limit = WORK_LIMIT): Ctx {
  return { sh: shapeOf(p.size), cages: p.cages, all: (1 << p.size) - 1, work: 0, limit };
}

/** Starting options: everything, or the number already in a square. */
function startOptions(c: Ctx, known?: ArrayLike<number>): Int32Array {
  return Int32Array.from({ length: c.sh.size * c.sh.size }, (_, i) => (known && known[i] ? 1 << (known[i] - 1) : c.all));
}

export interface LogicResult {
  grid: number[] | null;
  hardest: number;
  /** Waves that needed trial and error. */
  trials: number;
}

/**
 * Solve like a person, in waves, with nothing harder than maxTier. A board it finishes has
 * exactly one answer, since every number was forced.
 */
export function solveLogic(p: Puzzle, maxTier = 4, known?: ArrayLike<number>, limit = WORK_LIMIT): LogicResult {
  try {
    return solveWaves(p, maxTier, known, limit);
  } catch (e) {
    if (e instanceof OutOfWork) return { grid: null, hardest: 4, trials: 0 };
    throw e;
  }
}

function solveWaves(p: Puzzle, maxTier: number, known: ArrayLike<number> | undefined, limit: number): LogicResult {
  const c = ctxOf(p, limit);
  let d = startOptions(c, known);
  let hardest = 0;
  let trials = 0;
  for (let guard = 0; guard < 5000; guard++) {
    if (d.every((m) => bits(m) === 1)) {
      const t = d.slice();
      if (!propagate(c, t)) return { grid: null, hardest, trials };
      return { grid: Array.from(d, digit), hardest, trials };
    }
    let moved = false;
    for (let t = 1; t <= maxTier && !moved; t++) {
      const next = d.slice();
      const r = step(c, next, t);
      if (r === null) return { grid: null, hardest, trials };
      if (r) {
        d = next;
        hardest = Math.max(hardest, t);
        if (t === 4) trials++;
        moved = true;
      }
    }
    if (!moved) return { grid: null, hardest, trials };
  }
  return { grid: null, hardest, trials };
}

/** The first empty square the waves settle from the numbers already placed, or null. */
export function nextPlacement(p: Puzzle, grid: ArrayLike<number>): number | null {
  try {
    return nextWaves(p, grid);
  } catch (e) {
    if (e instanceof OutOfWork) return null;
    throw e;
  }
}

function nextWaves(p: Puzzle, grid: ArrayLike<number>): number | null {
  const c = ctxOf(p);
  let d = startOptions(c, grid);
  for (let guard = 0; guard < 500; guard++) {
    for (let i = 0; i < d.length; i++) if (!grid[i] && bits(d[i]) === 1) return i;
    let moved = false;
    for (let t = 1; t <= 4 && !moved; t++) {
      const next = d.slice();
      const r = step(c, next, t);
      if (r === null) return null;
      if (r) {
        d = next;
        moved = true;
      }
    }
    if (!moved) return null;
  }
  return null;
}
