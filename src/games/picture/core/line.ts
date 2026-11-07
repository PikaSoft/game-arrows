import { EMPTY, FILLED, UNKNOWN } from './types';

/**
 * Solve one line as far as it goes on its own. Given what is known about each cell and
 * the line's run lengths, list every way the runs can be placed that fits what's known,
 * and return what every one of those agrees on. Null if no placement fits.
 *
 * Done without listing placements one by one: `can(i, j)` says whether cells i.. can
 * hold runs j.. ; a forward pass then marks which cells can be filled and which can be
 * empty in some fitting placement. Linear in cells times runs.
 */
export function solveLine(cells: ArrayLike<number>, runs: number[]): number[] | null {
  const n = cells.length;
  const k = runs.length;
  // Filled cells known from i to the end, to check "nothing filled left over" fast.
  const filledFrom = new Int32Array(n + 1);
  for (let i = n - 1; i >= 0; i--) filledFrom[i] = filledFrom[i + 1] + (cells[i] === FILLED ? 1 : 0);
  // emptyBefore[i]: known-empty cells in [0, i), to test a run's cells fast.
  const emptyBefore = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) emptyBefore[i + 1] = emptyBefore[i] + (cells[i] === EMPTY ? 1 : 0);
  const fits = (i: number, len: number) =>
    i + len <= n && emptyBefore[i + len] - emptyBefore[i] === 0 && (i + len === n || cells[i + len] !== FILLED);

  const W = k + 1;
  // can[i * W + j]: 1 yes, 2 no, 0 not worked out yet.
  const can = new Uint8Array((n + 2) * W);
  const go = (i: number, j: number): boolean => {
    if (i > n) i = n;
    const key = i * W + j;
    if (can[key]) return can[key] === 1;
    let ok: boolean;
    if (j === k) ok = filledFrom[i] === 0;
    else if (i >= n) ok = false;
    else {
      ok = false;
      if (cells[i] !== FILLED && go(i + 1, j)) ok = true;
      if (!ok && fits(i, runs[j]) && go(i + runs[j] + 1, j + 1)) ok = true;
    }
    can[key] = ok ? 1 : 2;
    return ok;
  };
  if (!go(0, 0)) return null;

  const canFill = new Uint8Array(n);
  const canEmpty = new Uint8Array(n);
  // Reachable states, walked forward from the start along moves that still lead to a fit.
  const reach = new Uint8Array((n + 2) * W);
  reach[0] = 1;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= k; j++) {
      if (!reach[i * W + j] || !go(i, j)) continue;
      if (j === k) {
        for (let c = i; c < n; c++) canEmpty[c] = 1;
        continue;
      }
      if (i >= n) continue;
      if (cells[i] !== FILLED && go(i + 1, j)) {
        canEmpty[i] = 1;
        reach[(i + 1) * W + j] = 1;
      }
      const len = runs[j];
      if (fits(i, len) && go(i + len + 1, j + 1)) {
        for (let c = i; c < i + len; c++) canFill[c] = 1;
        if (i + len < n) canEmpty[i + len] = 1;
        reach[Math.min(n, i + len + 1) * W + j + 1] = 1;
      }
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(canFill[i] && canEmpty[i] ? UNKNOWN : canFill[i] ? FILLED : EMPTY);
  return out;
}

/** Run lengths of a line of 0/1 cells. */
export function runsOf(line: ArrayLike<number>): number[] {
  const out: number[] = [];
  let run = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i]) run++;
    else if (run) {
      out.push(run);
      run = 0;
    }
  }
  if (run) out.push(run);
  return out;
}
