import { beforeEach, describe, expect, test } from 'vitest';
import { buildFlipLevel, flipScore, flipSpecFor, LOOKALIKE_INTRO, parFor, pickKinds, rateFlip, SWAP_EVERY, SWAP_INTRO, TUTORIAL_COUNT } from '../src/games/flip/core/levels';
import { FlipLevel, STYLES } from '../src/games/flip/core/types';
import { Session } from '../src/games/flip/game/session';
import { FLIP_KEY, loadFlip, recordFlipClear, resetFlip } from '../src/games/flip/game/storage';
import { pictureSvg } from '../src/games/flip/render/pictures';
import { Rng } from '../src/shared/rng';

/** A tiny level: pictures 0 0 1 1 in a row. */
const tiny = (swapEvery = 0): FlipLevel => ({
  number: 1,
  cols: 4,
  rows: 1,
  faces: [0, 1, 0, 1],
  par: 1,
  lookalike: false,
  swapEvery,
  seed: 1,
  difficulty: 'Tutorial',
});

describe('levels', () => {
  test('levels 1 to 80 deal each picture on exactly two cards and fit the grid', () => {
    for (let n = 1; n <= 80; n++) {
      const l = buildFlipLevel(n);
      expect(l.faces).toHaveLength(l.cols * l.rows);
      const count = new Map<number, number>();
      for (const f of l.faces) count.set(f, (count.get(f) ?? 0) + 1);
      for (const c of count.values()) expect(c).toBe(2);
      expect(l.par).toBe(parFor(l.faces.length / 2));
      expect(l.difficulty).toBe(n <= TUTORIAL_COUNT ? 'Tutorial' : rateFlip(flipScore(l.faces.length / 2, l.lookalike, !!l.swapEvery)));
      if (n < LOOKALIKE_INTRO) expect(l.lookalike).toBe(false);
      if (n < SWAP_INTRO) expect(l.swapEvery).toBe(0);
      expect(buildFlipLevel(n)).toEqual(l);
    }
    expect(flipSpecFor(LOOKALIKE_INTRO).lookalike).toBe(true);
    expect(flipSpecFor(SWAP_INTRO).swap).toBe(true);
  });

  test('look-alike sets share shapes; plain sets spread them out', () => {
    const shapes = (ks: number[]) => new Set(ks.map((k) => Math.floor(k / STYLES))).size;
    expect(shapes(pickKinds(6, true, new Rng(1)))).toBe(2);
    expect(shapes(pickKinds(6, false, new Rng(1)))).toBe(6);
    expect(new Set(pickKinds(18, false, new Rng(2))).size).toBe(18);
  });

  test('every picture draws', () => {
    for (let k = 0; k < 24; k++) expect(pictureSvg(k)).toContain('<svg');
  });
});

describe('session', () => {
  test('a match stays up, a miss shows until hidden, and stars follow misses', () => {
    const s = new Session(tiny());
    expect(s.tap(0).kind).toBe('first');
    expect(s.tap(0).kind).toBe('ignored');
    expect(s.tap(1)).toEqual({ kind: 'miss', pair: [0, 1], swapDue: false });
    expect(s.isUp(0) && s.isUp(1)).toBe(true);
    // The next tap turns the miss back first.
    expect(s.tap(2).kind).toBe('first');
    expect(s.isUp(1)).toBe(false);
    expect(s.tap(0).kind).toBe('match');
    s.tap(1);
    expect(s.tap(3).kind).toBe('match');
    expect(s.won).toBe(true);
    expect(s.misses).toBe(1);
    expect(s.stars()).toBe(3);
  });

  test('every few misses two face-down cards with different pictures swap', () => {
    const l = { ...buildFlipLevel(SWAP_INTRO) };
    const s = new Session(l);
    // Miss on purpose: pick two cards with different pictures each time.
    let swaps = 0;
    for (let k = 0; k < SWAP_EVERY * 2; k++) {
      const a = s.faces.findIndex((_, i) => !s.isUp(i));
      const b = s.faces.findIndex((f, i) => !s.isUp(i) && i !== a && f !== s.faces[a]);
      s.tap(a);
      const r = s.tap(b);
      expect(r.kind).toBe('miss');
      s.hide();
      if (r.kind === 'miss' && r.swapDue) {
        const before = s.faces.slice();
        const pair = s.swap()!;
        expect(before[pair[0]]).not.toBe(before[pair[1]]);
        expect(s.faces[pair[0]]).toBe(before[pair[1]]);
        swaps++;
      }
    }
    expect(swaps).toBe(2);
    expect(s.stars()).toBe(s.misses <= l.par ? 3 : s.misses <= l.par * 2 ? 2 : 1);
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
    const p = loadFlip();
    recordFlipClear(p, 1, 2, 4, 5000);
    recordFlipClear(p, 1, 3, 2, 6000);
    expect(p.levels[1]).toEqual({ stars: 3, bestMoves: 2, bestMs: 5000 });
    expect(JSON.parse(mem.get(FLIP_KEY)!).unlocked).toBe(2);
    resetFlip(p);
    expect(loadFlip()).toEqual({ unlocked: 1, current: 1, levels: {} });
  });
});
