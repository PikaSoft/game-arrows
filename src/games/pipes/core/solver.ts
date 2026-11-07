import { neighbour, rotateBy } from './rules';
import { DIRS } from './types';

/*
 * Each cell keeps the set of openings it could still end up with, as a 16-bit set over
 * the masks 0..15 (bit m set means mask m is still possible). Deductions remove masks
 * until each cell has one left.
 */

/** HAS[d]: the set of masks that open through side d. */
const HAS = DIRS.map((bit) => {
  let s = 0;
  for (let m = 0; m < 16; m++) if (m & bit) s |= 1 << m;
  return s;
});

const single = (s: number) => s !== 0 && (s & (s - 1)) === 0;
const maskOf = (s: number) => 31 - Math.clz32(s);

/** The masks a tile can show: its distinct rotations. */
export function rotationsOf(m: number): number {
  let s = 0;
  for (let k = 0; k < 4; k++) s |= 1 << rotateBy(m, k);
  return s;
}

/** Starting candidates: every rotation of each tile that doesn't point off the board. */
export function initialCandidates(w: number, h: number, tiles: number[]): Uint16Array {
  const cand = new Uint16Array(tiles.length);
  for (let i = 0; i < tiles.length; i++) {
    let s = rotationsOf(tiles[i]);
    for (let d = 0; d < 4; d++) if (neighbour(w, h, i, d) < 0) s &= ~HAS[d];
    cand[i] = s;
  }
  return cand;
}

/**
 * Edge rule: two neighbours agree on the edge between them. Once every option left for a
 * cell opens (or closes) a side, the neighbour across it must match. Runs until nothing
 * changes. False if some cell runs out of options.
 */
export function propagate(w: number, h: number, cand: Uint16Array, start?: number[]): boolean {
  const n = cand.length;
  const queued = new Uint8Array(n);
  const queue: number[] = start ?? [...Array(n).keys()];
  for (const i of queue) queued[i] = 1;
  while (queue.length) {
    const i = queue.pop()!;
    queued[i] = 0;
    const s = cand[i];
    for (let d = 0; d < 4; d++) {
      const j = neighbour(w, h, i, d);
      if (j < 0) continue;
      const back = HAS[(d + 2) % 4];
      let t = cand[j];
      if ((s & ~HAS[d]) === 0) t &= back; // every option opens toward j
      else if ((s & HAS[d]) === 0) t &= ~back; // none does
      else continue;
      if (t === cand[j]) continue;
      if (t === 0) return false;
      cand[j] = t;
      if (!queued[j]) {
        queued[j] = 1;
        queue.push(j);
      }
    }
  }
  return true;
}

/**
 * Join rule: pipes that are already fixed must not close off a group of their own. A set
 * of fixed tiles whose every opening leads to another of them is sealed; unless that
 * group is the whole board, the water can never reach it (or never leave it).
 */
export function sealedOff(w: number, h: number, cand: Uint16Array): boolean {
  const n = cand.length;
  const seen = new Uint8Array(n);
  const stack: number[] = [];
  for (let s0 = 0; s0 < n; s0++) {
    if (seen[s0] || !single(cand[s0])) continue;
    seen[s0] = 1;
    stack.push(s0);
    let size = 0;
    let open = false;
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const m = maskOf(cand[i]);
      for (let d = 0; d < 4; d++) {
        if (!(m & DIRS[d])) continue;
        const j = neighbour(w, h, i, d);
        if (j < 0) continue;
        if (!single(cand[j])) {
          open = true;
          continue;
        }
        if (!seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    if (!open && size < n) return true;
  }
  return false;
}

const consistent = (w: number, h: number, cand: Uint16Array, start?: number[]) => propagate(w, h, cand, start) && !sealedOff(w, h, cand);

export const solvedFrom = (cand: Uint16Array): number[] | null => (cand.every(single) ? [...cand].map(maskOf) : null);

export interface Deduction {
  cand: Uint16Array;
  /** Rounds of looking one turn ahead that were needed (0: the edge rule alone did it). */
  rounds: number;
  /** Tiles the edge rule alone fixed, before any looking ahead. */
  direct: number;
  solved: boolean;
}

/**
 * Solve by reasoning, the way a player would. The edge rule first; when that stalls, try
 * each option left for each tile and drop the ones that soon lead to a contradiction
 * (pipes that can't meet, or a sealed-off group). Each such sweep is one round.
 */
export function deduce(w: number, h: number, tiles: number[], maxRounds = 40): Deduction {
  const cand = initialCandidates(w, h, tiles);
  if (!propagate(w, h, cand)) return { cand, rounds: 0, direct: 0, solved: false };
  const direct = cand.filter(single).length;
  let rounds = 0;
  while (!cand.every(single) && rounds < maxRounds) {
    let changed = false;
    for (let i = 0; i < cand.length; i++) {
      if (single(cand[i])) continue;
      for (let s = cand[i]; s; s &= s - 1) {
        const bit = s & -s;
        const trial = cand.slice();
        trial[i] = bit;
        if (consistent(w, h, trial, [i])) continue;
        cand[i] &= ~bit;
        changed = true;
      }
      if (cand[i] === 0) return { cand, rounds, direct, solved: false };
    }
    if (!changed) break;
    rounds++;
    if (!consistent(w, h, cand)) return { cand, rounds, direct, solved: false };
  }
  return { cand, rounds, direct, solved: cand.every(single) && !sealedOff(w, h, cand) };
}

export interface SearchResult {
  /** Solutions found, stopping at `limit`. */
  count: number;
  first: number[] | null;
  /** Guesses made on the way to the first solution. */
  guesses: number;
  /** True if the node budget ran out before the search finished. */
  exhausted: boolean;
  nodes: number;
}

/**
 * Backtracking search with the edge and join rules. Counts solutions up to `limit`, so
 * limit 2 tells whether the board has exactly one. Work is capped by nodes, not time, so
 * every device gets the same answer.
 */
export function search(w: number, h: number, tiles: number[], limit = 2, budget = 20000, from?: Uint16Array): SearchResult {
  const res: SearchResult = { count: 0, first: null, guesses: 0, exhausted: false, nodes: 0 };
  const root = from ? from.slice() : initialCandidates(w, h, tiles);
  if (!consistent(w, h, root)) return res;
  let guessesOnPath = 0;
  const go = (cand: Uint16Array, guesses: number): void => {
    if (res.count >= limit || res.exhausted) return;
    if (++res.nodes > budget) {
      res.exhausted = true;
      return;
    }
    // Branch on the undecided cell with the fewest options.
    let best = -1;
    let bestCount = 99;
    for (let i = 0; i < cand.length; i++) {
      const s = cand[i];
      if (single(s)) continue;
      let c = 0;
      for (let t = s; t; t &= t - 1) c++;
      if (c < bestCount) {
        bestCount = c;
        best = i;
      }
    }
    if (best < 0) {
      res.count++;
      if (!res.first) {
        res.first = solvedFrom(cand);
        guessesOnPath = guesses;
      }
      return;
    }
    for (let s = cand[best]; s; s &= s - 1) {
      const trial = cand.slice();
      trial[best] = s & -s;
      if (consistent(w, h, trial, [best])) go(trial, guesses + (bestCount > 1 ? 1 : 0));
      if (res.count >= limit || res.exhausted) return;
    }
  };
  go(root, 0);
  res.guesses = guessesOnPath;
  return res;
}

export interface Rating {
  /** Average over the solve of (tiles left + 1) / (tiles fixed this step + 1). */
  score: number;
  /** Steps of reasoning, one per wave of deductions. */
  steps: number;
  /** Steps where the edge rule stalled and a tile had to be tried both ways. */
  lookaheads: number;
}

/**
 * How hard the board is to reason out, measured like Arrow Escape's label. The solve
 * runs in waves: each wave uses only what was known at the start of it, the way a player
 * looks at the board, settles what they can, then looks again. A wave that fixes few
 * tiles while many are still open is a hard spot. When the edge rule stalls, one sweep of
 * trying each option ahead counts as a wave too. Null if guessing would be needed.
 */
export function rate(w: number, h: number, tiles: number[]): Rating | null {
  const cand = initialCandidates(w, h, tiles);
  const n = cand.length;
  let total = 0;
  let steps = 0;
  let lookaheads = 0;
  for (let guard = 0; guard < 400; guard++) {
    const open = cand.filter((s) => !single(s)).length;
    if (open === 0) break;
    const snap = cand.slice();
    let changed = false;
    for (let i = 0; i < n; i++) {
      let t = snap[i];
      if (single(t)) continue;
      for (let d = 0; d < 4; d++) {
        const j = neighbour(w, h, i, d);
        if (j < 0) continue;
        const s = snap[j];
        const toward = HAS[(d + 2) % 4];
        if ((s & ~toward) === 0) t &= HAS[d];
        else if ((s & toward) === 0) t &= ~HAS[d];
      }
      if (t === 0) return null;
      if (t !== cand[i]) {
        cand[i] = t;
        changed = true;
      }
    }
    if (!changed) {
      // Stalled: try each option of each open tile one step ahead.
      lookaheads++;
      for (let i = 0; i < n; i++) {
        if (single(snap[i])) continue;
        for (let s = snap[i]; s; s &= s - 1) {
          const trial = snap.slice();
          trial[i] = s & -s;
          if (consistent(w, h, trial, [i])) continue;
          cand[i] &= ~(s & -s);
          changed = true;
        }
      }
      if (!changed) return null;
    }
    const fixed = open - cand.filter((s) => !single(s)).length;
    total += (open + 1) / (fixed + 1);
    steps++;
  }
  if (!cand.every(single) || sealedOff(w, h, cand)) return null;
  return { score: steps ? total / steps : 0, steps, lookaheads };
}
