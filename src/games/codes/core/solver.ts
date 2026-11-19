import { Rng } from '../../../shared/rng';
import { allCodes, feedbackKey, fits, Guess, mark, sameFeedback } from './rules';

/** Most guesses tried as the next move, and most codes each one is measured against. */
const GUESS_SAMPLE = 48;
const EVAL_SAMPLE = 600;

export interface Size {
  slots: number;
  colours: number;
  repeats: boolean;
}

const cache = new Map<string, Uint8Array>();
function codesFor(s: Size): Uint8Array {
  const key = `${s.slots}:${s.colours}:${s.repeats}`;
  let all = cache.get(key);
  if (!all) {
    all = allCodes(s.slots, s.colours, s.repeats);
    cache.set(key, all);
  }
  return all;
}

/** Every code that still fits the answers so far. */
export function remaining(s: Size, history: readonly Guess[]): number[][] {
  const all = codesFor(s);
  const out: number[][] = [];
  for (let k = 0; k < all.length; k += s.slots) {
    const code = Array.from(all.subarray(k, k + s.slots));
    if (fits(code, history)) out.push(code);
  }
  return out;
}

/** Up to `n` items picked evenly at random (all of them if there are few). */
function sample<T>(items: T[], n: number, rng: Rng): T[] {
  if (items.length <= n) return items;
  const idx = rng.shuffle([...items.keys()]).slice(0, n).sort((a, b) => a - b);
  return idx.map((i) => items[i]);
}

/**
 * The next guess a careful player would make: a code that still fits every answer, chosen
 * to leave the fewest codes in the worst case. The search is capped by sample sizes, not
 * time, so every device picks the same guess. Null if no code fits (the answers were
 * inconsistent).
 */
export function nextGuess(s: Size, history: readonly Guess[], rng: Rng): number[] | null {
  return pickGuess(s, remaining(s, history), rng);
}

/** As nextGuess, from the list of codes that still fit. */
export function pickGuess(s: Size, left: number[][], rng: Rng): number[] | null {
  if (left.length === 0) return null;
  if (left.length <= 2) return left[0];
  const guesses = sample(left, GUESS_SAMPLE, rng);
  const against = sample(left, EVAL_SAMPLE, rng);
  let best = guesses[0];
  let bestWorst = Infinity;
  const counts = new Map<number, number>();
  for (const g of guesses) {
    counts.clear();
    let worst = 0;
    for (const c of against) {
      const k = feedbackKey(mark(g, c), s.slots);
      const v = (counts.get(k) ?? 0) + 1;
      counts.set(k, v);
      if (v > worst) worst = v;
      if (worst >= bestWorst) break;
    }
    if (worst < bestWorst) {
      bestWorst = worst;
      best = g;
    }
  }
  return best;
}

/** How many guesses the careful player above needs to crack `code`. */
export function solveCount(s: Size, code: number[], seed: number): number {
  const rng = new Rng(seed);
  let left = remaining(s, []);
  for (let turn = 1; turn <= 30; turn++) {
    const g = pickGuess(s, left, rng)!;
    const f = mark(g, code);
    if (f.exact === s.slots) return turn;
    left = left.filter((c) => sameFeedback(mark(g, c), f));
  }
  return 30;
}

/** Codes sampled to measure a size. */
export const PAR_SAMPLE = 16;
const expectedCache = new Map<string, number>();

/**
 * The solver's average guesses over a fixed sample of codes for this size, to one decimal.
 * The sample comes from a seed of the size alone, so it is the same for every level and
 * every device, and doesn't depend on how lucky one code happens to be.
 */
export function expectedGuesses(s: Size): number {
  const key = `${s.slots}:${s.colours}:${s.repeats}`;
  const hit = expectedCache.get(key);
  if (hit !== undefined) return hit;
  const rng = new Rng(s.slots * 1009 + s.colours * 101 + (s.repeats ? 7 : 0));
  const all = codesFor(s);
  const total = all.length / s.slots;
  let sum = 0;
  for (let i = 0; i < PAR_SAMPLE; i++) {
    const k = rng.int(0, total - 1) * s.slots;
    sum += solveCount(s, Array.from(all.subarray(k, k + s.slots)), i * 31 + 5);
  }
  const avg = Math.round((sum / PAR_SAMPLE) * 10) / 10;
  expectedCache.set(key, avg);
  return avg;
}
