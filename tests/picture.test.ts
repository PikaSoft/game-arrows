import { describe, expect, test } from 'vitest';
import { PICTURE_THRESHOLDS, ratePicture, TUTORIAL_COUNT } from '../src/games/picture/core/difficulty';
import { buildPictureLevel, cluesOf } from '../src/games/picture/core/levels';
import { runsOf, solveLine } from '../src/games/picture/core/line';
import { PICTURES, toGrid, TUTORIAL_PICTURES } from '../src/games/picture/core/pictures';
import { rate } from '../src/games/picture/core/solver';
import { EMPTY as E, FILLED as F, PictureLevel, UNKNOWN as U } from '../src/games/picture/core/types';
import { Session, START_HEARTS } from '../src/games/picture/game/session';
import { loadPicture, PICTURE_KEY, recordPictureClear, resetPicture } from '../src/games/picture/game/storage';

describe('line solver', () => {
  test('runs of a line', () => {
    expect(runsOf([1, 1, 0, 1, 0, 0, 1, 1, 1])).toEqual([2, 1, 3]);
    expect(runsOf([0, 0])).toEqual([]);
  });

  test('a run longer than half the line fixes its middle', () => {
    expect(solveLine([U, U, U, U, U], [4])).toEqual([U, F, F, F, U]);
  });

  test('runs that fill the line exactly fix everything', () => {
    expect(solveLine([U, U, U, U, U], [2, 2])).toEqual([F, F, E, F, F]);
    expect(solveLine([U, U, U], [])).toEqual([E, E, E]);
  });

  test('known cells push runs into place', () => {
    // A filled cell at the start means the run of 2 starts there.
    expect(solveLine([F, U, U, U, U], [2])).toEqual([F, F, E, E, E]);
    // An empty cell in the middle leaves room for a 3 only on the right.
    expect(solveLine([U, E, U, U, U], [3])).toEqual([E, E, F, F, F]);
  });

  test('a line that cannot fit returns null', () => {
    expect(solveLine([U, U, U], [2, 2])).toBeNull();
    expect(solveLine([F, U, F], [1])).toBeNull();
  });

  test('agrees with listing every placement by hand', () => {
    // Brute force: every 0/1 line of length 8 that fits the runs and the known cells.
    const lines: number[][] = [];
    for (let m = 0; m < 256; m++) lines.push(Array.from({ length: 8 }, (_, i) => (m >> i) & 1));
    const cases: [number[], number[]][] = [
      [[U, U, U, U, U, U, U, U], [3, 1]],
      [[U, F, U, U, U, E, U, U], [2, 2]],
      [[U, U, U, F, U, U, U, U], [1, 1, 1]],
      [[E, U, U, U, F, U, U, U], [4]],
    ];
    for (const [cells, runs] of cases) {
      const fits = lines.filter(
        (l) => runsOf(l).join() === runs.join() && l.every((v, i) => cells[i] === U || (cells[i] === F) === (v === 1)),
      );
      const expected = cells.map((_, i) => (fits.every((l) => l[i]) ? F : fits.every((l) => !l[i]) ? E : U));
      expect(solveLine(cells, runs)).toEqual(expected);
    }
  });
});

describe('pictures', () => {
  test('every hand-drawn picture is rectangular and solvable by line logic alone', () => {
    for (const d of [...TUTORIAL_PICTURES, ...PICTURES]) {
      const { w, h, cells } = toGrid(d);
      expect(d.rows.every((r) => r.length === w)).toBe(true);
      const r = rate(cluesOf(w, h, cells));
      expect(r.solved).toBe(true);
      expect(r.grid.map((v) => (v === F ? 1 : 0))).toEqual(cells);
    }
  });

  test('a picture with two answers is not solved by line logic', () => {
    // A 2x2 checkerboard: the clues are the same for both diagonals.
    expect(rate(cluesOf(2, 2, [1, 0, 0, 1])).solved).toBe(false);
  });
});

describe('levels', () => {
  const built = new Map<number, PictureLevel>();
  const get = (n: number) => {
    if (!built.has(n)) built.set(n, buildPictureLevel(n));
    return built.get(n)!;
  };

  test('levels 1 to 70 build, match their clues, and solve by line logic', () => {
    for (let n = 1; n <= 70; n++) {
      const l = get(n);
      expect(l.solution.length).toBe(l.w * l.h);
      expect(cluesOf(l.w, l.h, l.solution)).toEqual({ w: l.w, h: l.h, rows: l.rows, cols: l.cols });
      const r = rate(l);
      expect(r.solved).toBe(true);
      expect(l.solution.some((v) => v)).toBe(true);
    }
  });

  test('tutorials and every tenth level are hand-drawn pictures', () => {
    for (let n = 1; n <= TUTORIAL_COUNT; n++) expect(get(n).name).toBe(TUTORIAL_PICTURES[n - 1].name);
    expect(get(10).name).toBe(PICTURES[0].name);
    expect(get(20).name).toBe(PICTURES[1].name);
    expect(get(11).name).toBeUndefined();
  });

  test('the same level is the same board every time', () => {
    for (const n of [2, 13, 40, 57]) expect(buildPictureLevel(n)).toEqual(get(n));
  });

  test('labels follow the score', () => {
    for (let n = 1; n <= TUTORIAL_COUNT; n++) expect(get(n).difficulty).toBe('Tutorial');
    for (let n = TUTORIAL_COUNT + 1; n <= 70; n++) expect(get(n).difficulty).toBe(ratePicture(get(n).score!));
    expect(ratePicture(PICTURE_THRESHOLDS[0] - 0.01)).toBe('Easy');
    expect(ratePicture(PICTURE_THRESHOLDS[2])).toBe('Super Hard');
  });
});

describe('session', () => {
  // The heart: 5x5.
  const heart = (): PictureLevel => {
    const { w, h, cells } = toGrid(TUTORIAL_PICTURES[0]);
    const c = cluesOf(w, h, cells);
    return { number: 1, w, h, solution: cells, rows: c.rows, cols: c.cols, name: 'a heart', difficulty: 'Tutorial' };
  };

  test('filling every filled square wins with three stars', () => {
    const s = new Session(heart());
    s.level.solution.forEach((v, i) => v && s.mark(i, 'fill'));
    expect(s.won).toBe(true);
    expect(s.stars()).toBe(START_HEARTS);
    expect(s.mistakes.size).toBe(0);
  });

  test('a wrong mark shows the truth, costs a heart, and a marked square cannot change', () => {
    const s = new Session(heart());
    const r = s.mark(0, 'fill')!; // the top-left corner is empty
    expect(r.ok).toBe(false);
    expect(s.known[0]).toBe(E);
    expect(s.hearts).toBe(START_HEARTS - 1);
    expect(s.mark(0, 'cross')).toBeNull();
    expect(s.mark(1, 'cross')!.ok).toBe(false); // (1,0) is filled
    expect(s.known[1]).toBe(F);
  });

  test('a finished row is crossed off automatically', () => {
    const s = new Session(heart());
    // Bottom row: ..#.. has one filled square.
    const r = s.mark(22, 'fill')!;
    expect(r.ok).toBe(true);
    expect(r.crossed.sort()).toEqual([20, 21, 23, 24]);
    expect(s.rowDone(4)).toBe(true);
  });

  test('running out of hearts asks to carry on, and carrying on earns no stars', () => {
    const s = new Session(heart());
    s.mark(0, 'fill');
    s.mark(2, 'fill');
    const r = s.mark(4, 'fill')!;
    expect(r.outOfHearts).toBe(true);
    expect(s.awaitingContinue).toBe(true);
    expect(s.mark(1, 'fill')).toBeNull();
    s.continueWithoutHearts();
    s.level.solution.forEach((v, i) => v && s.mark(i, 'fill'));
    expect(s.won).toBe(true);
    expect(s.stars()).toBe(0);
  });

  test('hints reveal squares line logic can work out, and are free', () => {
    const s = new Session(buildPictureLevel(15));
    s.hints = 9999;
    for (let k = 0; k < 400 && !s.won; k++) expect(s.hint()).not.toBeNull();
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
    const p = loadPicture();
    recordPictureClear(p, 1, 2, 1, 5000);
    recordPictureClear(p, 1, 3, 0, 6000);
    expect(p.levels[1]).toEqual({ stars: 3, bestMoves: 0, bestMs: 5000 });
    expect(JSON.parse(mem.get(PICTURE_KEY)!).unlocked).toBe(2);
    resetPicture(p);
    expect(loadPicture()).toEqual({ unlocked: 1, current: 1, levels: {} });
  });
});
