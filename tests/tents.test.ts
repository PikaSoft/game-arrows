import { describe, expect, test } from 'vitest';
import { Rng } from '../src/shared/rng';
import { rateTents, TENTS_THRESHOLDS, TUTORIAL_COUNT } from '../src/games/tents/core/difficulty';
import { buildTentsLevel } from '../src/games/tents/core/levels';
import { around, Board, pairable, sides, valid } from '../src/games/tents/core/rules';
import { candidates, rate, search, startGrid } from '../src/games/tents/core/solver';
import { GRASS, TENT, TentsLevel, TREE, UNKNOWN } from '../src/games/tents/core/types';
import { Session, START_HEARTS } from '../src/games/tents/game/session';
import { loadTents, recordTentsClear, resetTents, TENTS_KEY } from '../src/games/tents/game/storage';

/** Build a board from a picture: T tree, A tent (the answer), . empty. Counts come from the tents. */
function parse(rows: string[]): { board: Board; tents: number[] } {
  const h = rows.length;
  const w = rows[0].length;
  const trees: number[] = [];
  const tents: number[] = [];
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === 'T') trees.push(y * w + x);
      if (ch === 'A') tents.push(y * w + x);
    }),
  );
  const rowCounts = Array.from({ length: h }, (_, y) => tents.filter((t) => ((t / w) | 0) === y).length);
  const colCounts = Array.from({ length: w }, (_, x) => tents.filter((t) => t % w === x).length);
  return { board: { w, h, trees, rowCounts, colCounts }, tents };
}

describe('rules', () => {
  test('neighbours', () => {
    expect(sides(3, 3, 4).sort()).toEqual([1, 3, 5, 7]);
    expect(sides(3, 3, 0).sort()).toEqual([1, 3]);
    expect(around(3, 3, 4).length).toBe(8);
    expect(around(3, 3, 0).sort()).toEqual([1, 3, 4]);
  });

  test('tents must pair one to one with trees beside them', () => {
    // Tents at 1 and 3 are both beside the corner (0) and the middle (4).
    const { board } = parse(['...', '...', '...']);
    expect(pairable({ ...board, trees: [0, 4] }, [1, 3])).toBe(true);
    // With trees at 4 and 8, only 4 is beside either tent: one tree can't take two tents.
    expect(pairable({ ...board, trees: [4, 8] }, [1, 3])).toBe(false);
  });

  test('valid checks touching, counts and pairing', () => {
    const { board, tents } = parse(['TA..', '....', '..AT']);
    expect(valid(board, tents)).toBe(true);
    expect(valid(board, [1, 5])).toBe(false); // touching, and wrong counts
  });
});

describe('solver', () => {
  test('candidates are the squares beside trees', () => {
    const { board } = parse(['T..', '...', '..T']);
    expect(candidates(board).sort((a, b) => a - b)).toEqual([1, 3, 5, 7]);
  });

  test('finds the one answer of a small board', () => {
    const one = parse(['TA..', '....', '..AT']);
    const r = search(one.board);
    expect(r.count).toBe(1);
    expect(r.first).toEqual(one.tents);
  });

  test('counts answers the same as trying every set of squares', () => {
    // Small random boards: trees and counts from random tents, checked by brute force.
    const rng = new Rng(11);
    let multi = 0;
    for (let k = 0; k < 60; k++) {
      const w = 4;
      const h = 4;
      const trees = rng.shuffle([...Array(16).keys()]).slice(0, rng.int(2, 3)).sort((a, b) => a - b);
      const cands = candidates({ w, h, trees, rowCounts: [], colCounts: [] });
      const tents = rng.shuffle(cands.slice()).slice(0, trees.length);
      const rowCounts = Array.from({ length: h }, (_, y) => tents.filter((t) => ((t / w) | 0) === y).length);
      const colCounts = Array.from({ length: w }, (_, x) => tents.filter((t) => t % w === x).length);
      const board: Board = { w, h, trees, rowCounts, colCounts };
      let brute = 0;
      for (let m = 0; m < 1 << cands.length; m++) {
        const set = cands.filter((_, j) => m & (1 << j));
        if (set.length === trees.length && valid(board, set)) brute++;
      }
      expect(search(board, 99).count).toBe(brute);
      if (brute > 1) multi++;
    }
    expect(multi).toBeGreaterThan(0); // some boards really had several answers
  });

  test('the start grid has trees and grass everywhere no tree is beside', () => {
    const { board } = parse(['T..', '...', '...']);
    const g = startGrid(board);
    expect(g[0]).toBe(TREE);
    expect(g[1]).toBe(UNKNOWN);
    expect(g[3]).toBe(UNKNOWN);
    expect(g[8]).toBe(GRASS);
  });

  test('reasoning solves a small board to the answer', () => {
    const { board, tents } = parse(['TA..', '....', '..AT']);
    const r = rate(board);
    expect(r.solved).toBe(true);
    expect(r.grid.map((v, i) => (v === TENT ? i : -1)).filter((i) => i >= 0)).toEqual(tents);
  });
});

describe('levels', () => {
  const built = new Map<number, TentsLevel>();
  const get = (n: number) => {
    if (!built.has(n)) built.set(n, buildTentsLevel(n));
    return built.get(n)!;
  };
  const LAST = 40;

  test(`levels 1 to ${LAST} have exactly one answer, and reasoning reaches it`, () => {
    for (let n = 1; n <= LAST; n++) {
      const l = get(n);
      const board: Board = { w: l.w, h: l.h, trees: l.trees, rowCounts: l.rowCounts, colCounts: l.colCounts };
      expect(l.trees.length).toBe(l.tents.length);
      expect(valid(board, l.tents)).toBe(true);
      const s = search(board, 2, 2000000);
      expect(s.exhausted).toBe(false);
      expect(s.count).toBe(1);
      const r = rate(board);
      expect(r.solved).toBe(true);
      expect(r.grid.map((v, i) => (v === TENT ? i : -1)).filter((i) => i >= 0)).toEqual(l.tents);
    }
  }, 60000);

  test('the same level is the same board every time', () => {
    for (const n of [1, 12, 33]) expect(buildTentsLevel(n)).toEqual(get(n));
  });

  test('labels follow the score', () => {
    for (let n = 1; n <= TUTORIAL_COUNT; n++) expect(get(n).difficulty).toBe('Tutorial');
    for (let n = TUTORIAL_COUNT + 1; n <= LAST; n++) expect(get(n).difficulty).toBe(rateTents(get(n).score!));
    expect(rateTents(TENTS_THRESHOLDS[0] - 0.01)).toBe('Easy');
    expect(rateTents(TENTS_THRESHOLDS[2])).toBe('Super Hard');
  });
});

describe('session', () => {
  const lvl = (): TentsLevel => {
    const { board, tents } = parse(['TA..', '....', '..AT']);
    return { number: 1, ...board, tents, difficulty: 'Easy' };
  };

  test('marking every tent wins with three stars', () => {
    const s = new Session(lvl());
    s.mark(1, 'tent');
    s.mark(10, 'tent');
    expect(s.won).toBe(true);
    expect(s.stars()).toBe(START_HEARTS);
  });

  test('a wrong mark shows the truth and costs a heart; trees and marked squares are fixed', () => {
    const s = new Session(buildTentsLevel(12));
    expect(s.mark(s.level.trees[0], 'tent')).toBeNull();
    const grass = s.known.findIndex((v, i) => v === UNKNOWN && !s.level.tents.includes(i));
    const r = s.mark(grass, 'tent')!;
    expect(r.ok).toBe(false);
    expect(s.known[grass]).toBe(GRASS);
    expect(s.hearts).toBe(START_HEARTS - 1);
    expect(s.mark(grass, 'grass')).toBeNull();
  });

  test('rows and columns with no tents start as grass', () => {
    const s = new Session(lvl());
    // Row 1 has no tents: all grass from the start. Column 0 has none either.
    for (const c of [4, 5, 6, 7, 0 + 8]) expect(s.known[c]).toBe(GRASS);
    expect(s.known[1]).toBe(UNKNOWN);
  });

  test('a finished row fills with grass', () => {
    const s = new Session(lvl());
    const r = s.mark(1, 'tent')!;
    expect(r.ok).toBe(true);
    expect(s.rowDone(0)).toBe(true);
    for (const c of [2, 3]) expect(s.known[c]).toBe(GRASS);
  });

  test('a last wrong mark that finishes the board ends it without asking', () => {
    const s = new Session(buildTentsLevel(12));
    const tents = s.level.tents;
    // Two wrong marks, then every tent but the last marked right...
    tents.slice(0, 2).forEach((t) => s.mark(t, 'grass'));
    tents.slice(2, -1).forEach((t) => s.mark(t, 'tent'));
    expect(s.hearts).toBe(1);
    // ...and the last one marked wrong: it shows the last tent, so the board is done.
    const r = s.mark(tents[tents.length - 1], 'grass')!;
    expect(r.outOfHearts).toBe(false);
    expect(s.won).toBe(true);
    expect(s.awaitingContinue).toBe(false);
    expect(s.stars()).toBe(0);
  });

  test('carrying on after running out of hearts earns no stars', () => {
    const s = new Session(buildTentsLevel(12));
    const wrongs = s.level.tents.slice(0, 3);
    wrongs.forEach((t) => s.mark(t, 'grass'));
    expect(s.awaitingContinue).toBe(true);
    s.continueWithoutHearts();
    for (const t of s.level.tents) s.mark(t, 'tent');
    expect(s.won).toBe(true);
    expect(s.stars()).toBe(0);
  });

  test('hints alone finish a real level, and are free', () => {
    const s = new Session(buildTentsLevel(20));
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
    const p = loadTents();
    recordTentsClear(p, 1, 2, 1, 50000);
    recordTentsClear(p, 1, 3, 0, 60000);
    expect(p.levels[1]).toEqual({ stars: 3, bestMoves: 0, bestMs: 50000 });
    expect(JSON.parse(mem.get(TENTS_KEY)!).unlocked).toBe(2);
    resetTents(p);
    expect(loadTents()).toEqual({ unlocked: 1, current: 1, levels: {} });
  });
});
