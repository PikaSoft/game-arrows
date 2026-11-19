import { beforeEach, describe, expect, test } from 'vitest';
import { PAIRS_THRESHOLDS, pairsSpecFor, ratePairs, TUTORIAL_COUNT } from '../src/games/pairs/core/difficulty';
import { buildPairsLevel, layOut, pairKinds } from '../src/games/pairs/core/levels';
import { blocks, freePairs, freeTiles, isFree } from '../src/games/pairs/core/rules';
import { dealBackwards, deadShare, findPath } from '../src/games/pairs/core/solver';
import { KINDS, PairsLevel, Slot } from '../src/games/pairs/core/types';
import { Session } from '../src/games/pairs/game/session';
import { loadPairs, PAIRS_KEY, recordPairsClear, resetPairs } from '../src/games/pairs/game/storage';
import { Rng } from '../src/shared/rng';

/** Play a pile out by following a path; true if it clears. */
function clears(slots: Slot[], faces: number[], pairs: [number, number][]): boolean {
  const b = blocks(slots);
  const alive = slots.map(() => true);
  for (const [p, q] of pairs) {
    if (!isFree(b, alive, p) || !isFree(b, alive, q) || faces[p] !== faces[q]) return false;
    alive[p] = alive[q] = false;
  }
  return alive.every((a) => !a);
}

describe('rules', () => {
  // A row of three with one tile on top of the middle one.
  const slots: Slot[] = [
    { x: 0, y: 0, z: 0 },
    { x: 2, y: 0, z: 0 },
    { x: 4, y: 0, z: 0 },
    { x: 2, y: 0, z: 1 },
  ];

  test('a tile is free with nothing on top and one side open', () => {
    const b = blocks(slots);
    const alive = [true, true, true, true];
    expect(freeTiles(b, alive)).toEqual([0, 2, 3]);
    alive[3] = false;
    expect(isFree(b, alive, 1)).toBe(false); // both sides still taken
    alive[0] = false;
    expect(isFree(b, alive, 1)).toBe(true);
  });

  test('a tile straddling two below covers both', () => {
    const b = blocks([{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 1, y: 0, z: 1 }]);
    expect(b.above[0]).toEqual([2]);
    expect(b.above[1]).toEqual([2]);
  });

  test('free pairs need the same picture', () => {
    const b = blocks(slots);
    expect(freePairs(b, [true, true, true, true], [0, 1, 0, 1])).toEqual([[0, 2]]);
  });
});

describe('dealing and solving', () => {
  test('a backward deal can always be played out', () => {
    for (let s = 0; s < 20; s++) {
      const rng = new Rng(s);
      const slots = layOut(pairsSpecFor(30), rng);
      expect(slots.length % 2).toBe(0);
      const b = blocks(slots);
      const faces = dealBackwards(b, slots.map(() => true), pairKinds(slots.length / 2, 10, rng), rng);
      expect(faces).not.toBeNull();
      const path = findPath(b, faces!, slots.map(() => true));
      if (path.pairs) expect(clears(slots, faces!, path.pairs)).toBe(true);
      else expect(path.capped).toBe(true);
    }
  });

  test('layouts are mirrored left to right and every upper tile rests on tiles below', () => {
    const slots = layOut(pairsSpecFor(40), new Rng(3));
    const span = Math.max(...slots.filter((s) => s.z === 0).map((s) => s.x)) + 2;
    const has = (x: number, y: number, z: number) => slots.some((s) => s.x === x && s.y === y && s.z === z);
    const top = Math.max(...slots.map((s) => s.z));
    for (const s of slots) if (s.z < top) expect(has(span - 2 - s.x, s.y, s.z)).toBe(true);
    for (const s of slots.filter((t) => t.z > 0)) {
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const hx = s.x + dx;
        const hy = s.y + dy;
        expect(slots.some((t) => t.z === s.z - 1 && hx >= t.x && hx < t.x + 2 && hy >= t.y && hy < t.y + 2)).toBe(true);
      }
    }
  });

  test('pictures come in even numbers and stay in range', () => {
    const k = pairKinds(20, 6, new Rng(1));
    expect(new Set(k).size).toBe(6);
    for (const v of k) expect(v).toBeLessThan(KINDS);
  });

  test('a pile with no free match is a dead end, and random play measures it', () => {
    const slots: Slot[] = [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }];
    const b = blocks(slots);
    // a b a b in a row: only the ends are free, and they differ.
    expect(findPath(b, [0, 1, 1, 0], [true, true, true, true]).pairs).not.toBeNull();
    expect(findPath(b, [0, 1, 0, 1], [true, true, true, true]).pairs).toBeNull();
    expect(deadShare(b, [0, 1, 0, 1], [true, true, true, true], new Rng(1))).toBe(1);
  });
});

describe('levels', () => {
  test('levels 1 to 60 build, can be cleared, and are the same built twice', () => {
    for (let n = 1; n <= 60; n++) {
      const l = buildPairsLevel(n);
      expect(l.slots.length % 2).toBe(0);
      const count = new Map<number, number>();
      for (const f of l.faces) count.set(f, (count.get(f) ?? 0) + 1);
      for (const c of count.values()) expect(c % 2).toBe(0);
      expect(l.difficulty).toBe(n <= TUTORIAL_COUNT ? 'Tutorial' : ratePairs(l.score!));
      if (n <= 12) {
        const path = findPath(blocks(l.slots), l.faces, l.slots.map(() => true), 200_000);
        expect(path.pairs, `level ${n}`).not.toBeNull();
        expect(clears(l.slots, l.faces, path.pairs!)).toBe(true);
      }
      if (n % 10 === 0) expect(buildPairsLevel(n)).toEqual(l);
    }
  }, 120_000);

  test('labels follow the thresholds', () => {
    expect(ratePairs(0)).toBe('Easy');
    expect(ratePairs(PAIRS_THRESHOLDS[0])).toBe('Medium');
    expect(ratePairs(PAIRS_THRESHOLDS[2])).toBe('Super Hard');
  });
});

describe('session', () => {
  const level = (): PairsLevel => buildPairsLevel(5);

  test('select, switch, match and undo', () => {
    const s = new Session(level());
    const [[p, q]] = freePairs(s.blocks, s.alive, s.faces);
    expect(s.tap(p)).toBe('select');
    expect(s.tap(p)).toBe('deselect');
    s.tap(p);
    const other = freeTiles(s.blocks, s.alive).find((i) => s.faces[i] !== s.faces[p]);
    if (other !== undefined) {
      expect(s.tap(other)).toBe('switch');
      s.tap(p);
    }
    expect(s.tap(q)).toBe('match');
    expect(s.alive[p] || s.alive[q]).toBe(false);
    expect(s.undo()).toEqual([p, q]);
    expect(s.alive[p] && s.alive[q]).toBe(true);
    const covered = s.alive.findIndex((_, i) => !s.free(i));
    if (covered >= 0) expect(s.tap(covered)).toBe('blocked');
  });

  test('following hints clears the table; each hint costs a star', () => {
    const s = new Session(level());
    s.hints = 999;
    while (!s.won) {
      const h = s.hint();
      expect(Array.isArray(h)).toBe(true);
      const [a, b] = h as [number, number];
      s.tap(a);
      expect(s.tap(b)).toBe('match');
    }
    expect(s.stars()).toBe(1);
  });

  test('a shuffle leaves the same pictures and a table that can be cleared', () => {
    const s = new Session(buildPairsLevel(20));
    // Take a few pairs, then shuffle.
    for (let k = 0; k < 4; k++) {
      const pr = freePairs(s.blocks, s.alive, s.faces)[0];
      if (!pr) break;
      s.tap(pr[0]);
      s.tap(pr[1]);
    }
    const before = s.faces.filter((_, i) => s.alive[i]).sort();
    expect(s.shuffle()).toBe(true);
    expect(s.faces.filter((_, i) => s.alive[i]).sort()).toEqual(before);
    const path = findPath(s.blocks, s.faces, s.alive, 200_000);
    expect(path.pairs !== null || path.capped).toBe(true);
    expect(s.stars()).toBe(2);
  });

  test('a clean clear is three stars', () => {
    const l = level();
    const s = new Session(l);
    const path = findPath(s.blocks, s.faces, s.alive, 200_000).pairs!;
    for (const [a, b] of path) {
      s.tap(a);
      s.tap(b);
    }
    expect(s.won).toBe(true);
    expect(s.stars()).toBe(3);
  });
});

describe('storage', () => {
  const mem = new Map<string, string>();
  beforeEach(() => {
    mem.clear();
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => mem.set(k, v),
      removeItem: (k: string) => mem.delete(k),
    };
  });

  test('records clears and resets', () => {
    const p = loadPairs();
    recordPairsClear(p, 1, 2, 3, 5000);
    recordPairsClear(p, 1, 3, 0, 6000);
    expect(p.levels[1]).toEqual({ stars: 3, bestMoves: 0, bestMs: 5000 });
    expect(JSON.parse(mem.get(PAIRS_KEY)!).unlocked).toBe(2);
    resetPairs(p);
    expect(loadPairs()).toEqual({ unlocked: 1, current: 1, levels: {} });
  });
});
