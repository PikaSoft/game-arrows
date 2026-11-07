import { describe, expect, test } from 'vitest';
import { Rng } from '../src/shared/rng';
import { rateStars, STARS_THRESHOLDS, TUTORIAL_COUNT, TWO_STAR_INTRO } from '../src/games/stars/core/difficulty';
import { growRegions, placeStars, repair } from '../src/games/stars/core/layout';
import { buildStarsLevel } from '../src/games/stars/core/levels';
import { around, Board, units, valid } from '../src/games/stars/core/rules';
import { rate, search } from '../src/games/stars/core/solver';
import { DOT, STAR, StarsLevel, UNKNOWN } from '../src/games/stars/core/types';
import { Session, START_HEARTS } from '../src/games/stars/game/session';
import { loadStars, recordStarsClear, resetStars, STARS_KEY } from '../src/games/stars/game/storage';

/** A board from a picture of region letters, one row per string. */
const board = (rows: string[], per = 1): Board => ({
  size: rows.length,
  per,
  regions: rows.flatMap((r) => [...r].map((ch) => ch.charCodeAt(0) - 97)),
});

// A 4x4 board with one answer: stars at (2,0), (0,1), (3,2), (1,3).
const FOUR = board(['abbb', 'aabd', 'cccd', 'ccdd']);
const FOUR_STARS = [2, 4, 11, 13];

describe('rules', () => {
  test('rows, columns and regions are the units', () => {
    const u = units(FOUR);
    expect(u.length).toBe(12);
    expect(u[8].sort((a, b) => a - b)).toEqual([0, 4, 5]); // region a
  });

  test('valid checks counts and touching', () => {
    expect(valid(FOUR, FOUR_STARS)).toBe(true);
    expect(valid(FOUR, [1, 7, 8, 14])).toBe(false); // 7 and 14 are both in region d
    expect(around(4, 5).length).toBe(8);
  });
});

describe('solver', () => {
  test('finds the one answer of a small board', () => {
    const s = search(FOUR);
    expect(s.count).toBe(1);
    expect(s.first).toEqual(FOUR_STARS);
  });

  test('counts answers the same as trying every star set', () => {
    const rng = new Rng(2);
    for (let k = 0; k < 20; k++) {
      const stars = placeStars(5, 1, rng)!;
      const b = growRegions(5, 1, stars, rng)!;
      // Brute force: one star per row, so 5^5 choices.
      let brute = 0;
      for (let m = 0; m < 5 ** 5; m++) {
        let code = m;
        const set: number[] = [];
        for (let y = 0; y < 5; y++) {
          set.push(y * 5 + (code % 5));
          code = Math.floor(code / 5);
        }
        if (valid(b, set)) brute++;
      }
      expect(search(b, 9999).count).toBe(brute);
    }
  });

  test('reasoning solves the small board to its answer', () => {
    const r = rate(FOUR);
    expect(r.solved).toBe(true);
    expect(r.grid.map((v, i) => (v === STAR ? i : -1)).filter((i) => i >= 0)).toEqual(FOUR_STARS);
  });
});

describe('layout', () => {
  test('placed stars follow the rules, one or two per line', () => {
    const rng = new Rng(5);
    for (const [size, per] of [[6, 1], [8, 1], [10, 2]]) {
      const stars = placeStars(size, per, rng)!;
      const set = new Set(stars);
      for (const s of stars) expect(around(size, s).some((o) => set.has(o))).toBe(false);
      for (let y = 0; y < size; y++) expect(stars.filter((s) => ((s / size) | 0) === y).length).toBe(per);
      for (let x = 0; x < size; x++) expect(stars.filter((s) => s % size === x).length).toBe(per);
    }
  });

  test('repair leaves the intended stars as the only answer', () => {
    const rng = new Rng(8);
    let repaired = 0;
    for (let k = 0; k < 30; k++) {
      const stars = placeStars(6, 1, rng)!;
      const grown = growRegions(6, 1, stars, rng)!;
      const b = repair(grown, stars, rng, (bb) => search(bb, 2).all);
      if (!b) continue;
      repaired++;
      const s = search(b, 2);
      expect(s.count).toBe(1);
      expect(s.first!.slice().sort((a, c) => a - c)).toEqual(stars.slice().sort((a, c) => a - c));
    }
    expect(repaired).toBeGreaterThan(3);
  });
});

describe('levels', () => {
  const built = new Map<number, StarsLevel>();
  const get = (n: number) => {
    if (!built.has(n)) built.set(n, buildStarsLevel(n));
    return built.get(n)!;
  };

  test('levels 1 to 34 have exactly one answer, and reasoning reaches it', () => {
    for (let n = 1; n <= 34; n++) {
      const l = get(n);
      const b: Board = { size: l.size, per: l.per, regions: l.regions };
      expect(new Set(l.regions).size).toBe(l.size);
      expect(valid(b, l.stars)).toBe(true);
      const s = search(b, 2, 2000000);
      expect(s.exhausted).toBe(false);
      expect(s.count).toBe(1);
      const r = rate(b);
      expect(r.solved).toBe(true);
      expect(r.grid.map((v, i) => (v === STAR ? i : -1)).filter((i) => i >= 0)).toEqual(l.stars);
    }
  }, 120000);

  test('the first two-star board arrives on its intro level', () => {
    const l = get(TWO_STAR_INTRO);
    expect(l.per).toBe(2);
    expect(l.size).toBe(10);
    expect(search({ size: l.size, per: l.per, regions: l.regions }, 2, 4000000).count).toBe(1);
    for (let n = 1; n < TWO_STAR_INTRO; n++) expect(get(n).per).toBe(1);
  }, 120000);

  test('the same level is the same board every time, and labels follow the score', () => {
    for (const n of [1, 9, 22]) expect(buildStarsLevel(n)).toEqual(get(n));
    for (let n = 1; n <= TUTORIAL_COUNT; n++) expect(get(n).difficulty).toBe('Tutorial');
    for (let n = TUTORIAL_COUNT + 1; n <= 34; n++) expect(get(n).difficulty).toBe(rateStars(get(n).score!));
    expect(rateStars(STARS_THRESHOLDS[0] - 0.1)).toBe('Easy');
    expect(rateStars(STARS_THRESHOLDS[2])).toBe('Super Hard');
  });
});

describe('session', () => {
  const lvl = (): StarsLevel => ({ number: 1, size: 4, per: 1, regions: FOUR.regions, stars: FOUR_STARS, difficulty: 'Easy' });

  test('placing every star wins with three stars, and dots fill in around them', () => {
    const s = new Session(lvl());
    const r = s.mark(2, 'star')!;
    expect(r.ok).toBe(true);
    // Round the star, and the rest of its row, column and region, are dots now.
    for (const c of [0, 1, 3, 5, 6, 7, 10, 14]) expect(s.known[c]).toBe(DOT);
    for (const c of [4, 11, 13]) s.mark(c, 'star');
    expect(s.won).toBe(true);
    expect(s.stars()).toBe(START_HEARTS);
  });

  test('a wrong mark shows the truth and costs a heart', () => {
    const s = new Session(lvl());
    const r = s.mark(10, 'star')!; // a dot really
    expect(r.ok).toBe(false);
    expect(s.known[10]).toBe(DOT);
    expect(s.hearts).toBe(START_HEARTS - 1);
    expect(s.mark(10, 'dot')).toBeNull();
    expect(s.known.filter((v) => v === UNKNOWN).length).toBeGreaterThan(0);
  });

  test('hints alone finish a real level, and are free', () => {
    const s = new Session(buildStarsLevel(12));
    s.hints = 999;
    for (let k = 0; k < 200 && !s.won; k++) expect(s.hint()).not.toBeNull();
    expect(s.won).toBe(true);
    expect(s.stars()).toBe(START_HEARTS);
  });
});

describe('storage', () => {
  test('records clears and resets', () => {
    const mem = new Map<string, string>();
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => mem.set(k, v),
      removeItem: (k: string) => mem.delete(k),
    };
    const p = loadStars();
    recordStarsClear(p, 1, 2, 1, 50000);
    recordStarsClear(p, 1, 3, 0, 60000);
    expect(p.levels[1]).toEqual({ stars: 3, bestMoves: 0, bestMs: 50000 });
    expect(JSON.parse(mem.get(STARS_KEY)!).unlocked).toBe(2);
    resetStars(p);
    expect(loadStars()).toEqual({ unlocked: 1, current: 1, levels: {} });
  });
});
