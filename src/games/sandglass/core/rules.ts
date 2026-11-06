import { Bottle, isLiquid } from './types';

export const top = (b: Bottle): number => (b.length ? b[b.length - 1] : -1);

/** Number of layers of the top colour sitting together at the top. */
export function topRun(b: Bottle): number {
  if (!b.length) return 0;
  const c = b[b.length - 1];
  let n = 1;
  while (n < b.length && b[b.length - 1 - n] === c) n++;
  return n;
}

export const isUniform = (b: Bottle): boolean => b.length > 0 && topRun(b) === b.length;
export const isComplete = (b: Bottle, cap: number): boolean => b.length === cap && isUniform(b);

/** Layers of sand in a bottle. Sand always sits below any liquid. */
export function sandCount(b: Bottle): number {
  let n = 0;
  while (n < b.length && !isLiquid(b[n])) n++;
  return n;
}

/**
 * Where a pour of colour c would settle in bottle b: liquid floats on top, sand sinks
 * through any liquid and comes to rest on the sand.
 */
export const landingIndex = (b: Bottle, c: number): number => (isLiquid(c) ? b.length : sandCount(b));

/**
 * The top colour pours. It must come to rest on the same colour or on the bottom of
 * the bottle, and there must be room. So sand can sink through liquid onto matching
 * sand (or to the bottom of a bottle holding only liquid), while liquid needs the same
 * liquid or an empty bottle.
 */
export function canPour(bottles: Bottle[], cap: number, from: number, to: number): boolean {
  if (from === to) return false;
  const a = bottles[from];
  const b = bottles[to];
  if (!a.length || b.length >= cap) return false;
  const c = top(a);
  const at = landingIndex(b, c);
  return at === 0 || b[at - 1] === c;
}

/** How many layers a pour would move: the whole top run, as much as fits. */
export function pourAmount(bottles: Bottle[], cap: number, from: number, to: number): number {
  if (!canPour(bottles, cap, from, to)) return 0;
  return Math.min(topRun(bottles[from]), cap - bottles[to].length);
}

/** Pours in place and returns the number of layers moved (0 if not allowed). */
export function pour(bottles: Bottle[], cap: number, from: number, to: number): number {
  const n = pourAmount(bottles, cap, from, to);
  const c = top(bottles[from]);
  const at = landingIndex(bottles[to], c);
  for (let i = 0; i < n; i++) bottles[from].pop();
  bottles[to].splice(at, 0, ...new Array<number>(n).fill(c));
  return n;
}

/**
 * A pour that can never help: tipping a bottle that holds only one colour into an
 * empty one just swaps which bottle it is in.
 */
export function isPointless(bottles: Bottle[], from: number, to: number): boolean {
  return bottles[to].length === 0 && isUniform(bottles[from]);
}

export function isSolved(bottles: Bottle[], cap: number): boolean {
  return bottles.every((b) => b.length === 0 || isComplete(b, cap));
}

/** Every pour worth making from this position. */
export function usefulMoves(bottles: Bottle[], cap: number): [number, number][] {
  const out: [number, number][] = [];
  let firstEmpty = -1;
  for (let to = 0; to < bottles.length; to++) if (!bottles[to].length) { firstEmpty = to; break; }
  for (let from = 0; from < bottles.length; from++) {
    if (!bottles[from].length || isComplete(bottles[from], cap)) continue;
    for (let to = 0; to < bottles.length; to++) {
      // Empty bottles are interchangeable, so only the first one is worth trying.
      if (!bottles[to].length && to !== firstEmpty) continue;
      if (canPour(bottles, cap, from, to) && !isPointless(bottles, from, to)) out.push([from, to]);
    }
  }
  return out;
}

/** Same position regardless of bottle order. */
export function stateKey(bottles: Bottle[]): string {
  return bottles.map((b) => b.join(',')).sort().join('|');
}

export const clone = (bottles: Bottle[]): Bottle[] => bottles.map((b) => b.slice());
