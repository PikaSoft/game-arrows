import { around, flood } from './rules';

/*
 * A solver that never guesses. It knows which squares are open (with their numbers) and
 * which are known mines, and works out more in waves, always with the simplest kind of
 * reasoning that gets anywhere:
 *   1. One number: if its mines are all found, the rest round it are safe; if its
 *      covered squares are exactly the mines it still needs, they're all mines.
 *   2. Two numbers that share squares: if the mines one needs can't all fit in the
 *      shared squares, the rest must fill its own squares, which can settle the other's.
 *   3. Trying every arrangement of mines along the edge of the open area (and the count
 *      of mines left), and keeping what is the same in all of them.
 */

export interface Knowledge {
  open: Uint8Array;
  mine: Uint8Array;
}

interface Constraint {
  cells: number[];
  need: number;
}

function constraints(w: number, h: number, nums: number[], k: Knowledge): Constraint[] | null {
  const out: Constraint[] = [];
  for (let i = 0; i < nums.length; i++) {
    if (!k.open[i] || nums[i] <= 0) continue;
    const cells: number[] = [];
    let found = 0;
    for (const o of around(w, h, i)) {
      if (k.mine[o]) found++;
      else if (!k.open[o]) cells.push(o);
    }
    const need = nums[i] - found;
    if (need < 0 || need > cells.length) return null;
    if (cells.length) out.push({ cells, need });
  }
  return out;
}

export interface Step {
  safe: number[];
  mines: number[];
  /** Which kind of reasoning found it: 1, 2 or 3 (see the top of this file). */
  level: number;
}

/** Everything one wave of the simplest reasoning that works can find. Null if nothing. */
export function nextStep(w: number, h: number, nums: number[], k: Knowledge, totalMines: number): Step | null {
  const cs = constraints(w, h, nums, k);
  if (!cs) return null;
  const safe = new Set<number>();
  const mines = new Set<number>();
  // 1. One number at a time.
  for (const c of cs) {
    if (c.need === 0) c.cells.forEach((x) => safe.add(x));
    else if (c.need === c.cells.length) c.cells.forEach((x) => mines.add(x));
  }
  if (safe.size || mines.size) return { safe: [...safe], mines: [...mines], level: 1 };
  // 2. Two numbers that share squares.
  for (const a of cs) {
    for (const b of cs) {
      if (a === b) continue;
      const shared = b.cells.filter((x) => a.cells.includes(x));
      if (!shared.length) continue;
      const bOnly = b.cells.filter((x) => !a.cells.includes(x));
      const aOnly = a.cells.filter((x) => !b.cells.includes(x));
      // The shared squares hold at most `most` of b's mines (no more than a needs, and
      // no more than there are squares). If the rest of b's mines exactly fill b's own
      // squares, those are all mines; and if that means the shared squares hold all of
      // a's mines, a's own squares are safe.
      const most = Math.min(a.need, shared.length);
      if (bOnly.length && b.need - most === bOnly.length) {
        bOnly.forEach((x) => mines.add(x));
        if (most === a.need) aOnly.forEach((x) => safe.add(x));
      }
    }
  }
  if (safe.size || mines.size) return { safe: [...safe], mines: [...mines], level: 2 };
  // 3. Every arrangement along the edge, plus the count of mines left.
  const step = enumerate(w, h, cs, k, totalMines);
  return step;
}

/** Rule 3: try every arrangement of mines on the edge squares that fits every number. */
function enumerate(w: number, h: number, cs: Constraint[], k: Knowledge, totalMines: number): Step | null {
  const n = w * h;
  const edgeSet = new Set<number>();
  for (const c of cs) c.cells.forEach((x) => edgeSet.add(x));
  const edge = [...edgeSet];
  let unknown = 0;
  let foundMines = 0;
  for (let i = 0; i < n; i++) {
    if (k.mine[i]) foundMines++;
    else if (!k.open[i]) unknown++;
  }
  const left = totalMines - foundMines;
  const interior = unknown - edge.length; // covered squares away from every number
  if (edge.length > 22) return null; // too many to try; never happens on our boards
  const index = new Map(edge.map((c, j) => [c, j]));
  const cons = cs.map((c) => ({ idx: c.cells.map((x) => index.get(x)!), need: c.need }));
  const byCell: number[][] = edge.map(() => []);
  cons.forEach((c, ci) => c.idx.forEach((j) => byCell[j].push(ci)));
  const assign = new Int8Array(edge.length).fill(-1);
  const placed = new Int32Array(cons.length);
  const unset = cons.map((c) => c.idx.length);
  const mineCount = new Float64Array(edge.length);
  let solutions = 0;
  let interiorMineSum = 0;
  let edgeMines = 0;
  let nodes = 0;
  const go = (j: number): void => {
    if (++nodes > 400000) return;
    if (j === edge.length) {
      const rest = left - edgeMines;
      if (rest < 0 || rest > interior) return;
      solutions++;
      interiorMineSum += rest;
      for (let t = 0; t < edge.length; t++) if (assign[t] === 1) mineCount[t]++;
      return;
    }
    for (const v of [0, 1]) {
      let ok = edgeMines + v <= left;
      for (const ci of byCell[j]) {
        const c = cons[ci];
        const p = placed[ci] + v;
        const u = unset[ci] - 1;
        if (p > c.need || p + u < c.need) ok = false;
      }
      if (!ok) continue;
      assign[j] = v;
      edgeMines += v;
      for (const ci of byCell[j]) {
        placed[ci] += v;
        unset[ci]--;
      }
      go(j + 1);
      for (const ci of byCell[j]) {
        placed[ci] -= v;
        unset[ci]++;
      }
      edgeMines -= v;
      assign[j] = -1;
    }
  };
  go(0);
  if (!solutions || nodes > 400000) return null;
  const safe: number[] = [];
  const mines: number[] = [];
  edge.forEach((c, j) => {
    if (mineCount[j] === 0) safe.push(c);
    else if (mineCount[j] === solutions) mines.push(c);
  });
  // Squares away from every number: safe if no arrangement leaves mines for them, all
  // mines if every arrangement fills them.
  if (interior > 0) {
    const rest: number[] = [];
    for (let i = 0; i < n; i++) if (!k.open[i] && !k.mine[i] && !edgeSet.has(i)) rest.push(i);
    if (interiorMineSum === 0) safe.push(...rest);
    else if (interiorMineSum === solutions * interior) mines.push(...rest);
  }
  return safe.length || mines.length ? { safe, mines, level: 3 } : null;
}

/** Open a set of safe squares (flooding zeros) and mark mines. */
export function applyStep(w: number, h: number, nums: number[], k: Knowledge, s: Step): number[] {
  const opened: number[] = [];
  for (const m of s.mines) k.mine[m] = 1;
  for (const c of s.safe) if (!k.open[c]) opened.push(...flood(w, h, nums, k.open, c));
  return opened;
}

export interface Rating {
  solved: boolean;
  /** Waves needed of each kind of reasoning (index 1, 2, 3). */
  uses: number[];
  waves: number;
}

/** Play the board out from the start square without guessing. */
export function solve(w: number, h: number, nums: number[], start: number, totalMines: number): Rating {
  const k: Knowledge = { open: new Uint8Array(w * h), mine: new Uint8Array(w * h) };
  flood(w, h, nums, k.open, start);
  const uses = [0, 0, 0, 0];
  let waves = 0;
  const safeTotal = nums.filter((v) => v >= 0).length;
  for (let guard = 0; guard < 2000; guard++) {
    let opened = 0;
    for (let i = 0; i < k.open.length; i++) opened += k.open[i];
    if (opened === safeTotal) return { solved: true, uses, waves };
    const s = nextStep(w, h, nums, k, totalMines);
    if (!s) return { solved: false, uses, waves };
    applyStep(w, h, nums, k, s);
    uses[s.level]++;
    waves++;
  }
  return { solved: false, uses, waves };
}
