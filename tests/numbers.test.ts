import { describe, expect, test } from 'vitest';
import { Rng } from '../src/shared/rng';
import { numbersSpecFor, rateNumbers, TUTORIAL_COUNT } from '../src/games/numbers/core/difficulty';
import { countSolutions, shapeOf } from '../src/games/numbers/core/grid';
import { buildNumbersLevel, fullGrid } from '../src/games/numbers/core/levels';
import { nextPlacement, rateHuman } from '../src/games/numbers/core/techniques';
import { NumbersLevel } from '../src/games/numbers/core/types';
import { Session, START_HEARTS } from '../src/games/numbers/game/session';
import { loadNumbers, NUMBERS_KEY, recordNumbersClear, resetNumbers } from '../src/games/numbers/game/storage';

/** True if every row, column and box holds each digit once. */
function valid(size: number, g: number[]): boolean {
  const sh = shapeOf(size);
  return sh.units.every((u) => new Set(u.map((i) => g[i])).size === size && u.every((i) => g[i] >= 1 && g[i] <= size));
}

describe('grid', () => {
  test('shapes: 9x9 has 3x3 boxes, 6x6 has 2-high, 3-wide boxes, and every square sees 20 or 12 others', () => {
    const nine = shapeOf(9);
    expect(nine.units.length).toBe(27);
    expect(nine.peers[0].length).toBe(20);
    expect(nine.boxes[0]).toEqual([0, 1, 2, 9, 10, 11, 18, 19, 20]);
    const six = shapeOf(6);
    expect(six.peers[0].length).toBe(12);
    expect(six.boxes[0]).toEqual([0, 1, 2, 6, 7, 8]);
    expect(six.boxes[1]).toEqual([3, 4, 5, 9, 10, 11]);
  });

  test('full grids are valid on both sizes', () => {
    const rng = new Rng(3);
    for (const size of [6, 9]) for (let k = 0; k < 5; k++) expect(valid(size, fullGrid(size, rng))).toBe(true);
  });

  test('counting solutions spots one, many and none', () => {
    const rng = new Rng(8);
    const g = fullGrid(9, rng);
    const one = g.slice();
    one[0] = 0;
    expect(countSolutions(shapeOf(9), one).count).toBe(1);
    expect(countSolutions(shapeOf(9), new Array(81).fill(0)).count).toBe(2);
    const bad = g.slice();
    bad[1] = bad[0]; // two of the same digit in a row
    bad[2] = 0;
    expect(countSolutions(shapeOf(9), bad).count).toBe(0);
  });
});

describe('techniques', () => {
  test('a grid one square short is a hidden single in its box', () => {
    const g = fullGrid(9, new Rng(1));
    const p = g.slice();
    p[40] = 0;
    expect(nextPlacement(shapeOf(9), p)).toEqual({ cell: 40, digit: g[40], name: 'Hidden single in a box' });
    const r = rateHuman(shapeOf(9), p);
    expect(r.solved).toBe(true);
    expect(r.tier).toBe(1);
  });

  test('every step the technique solver takes agrees with the answer', () => {
    const l = buildNumbersLevel(40);
    const sh = shapeOf(l.size);
    const g = l.givens.slice();
    for (let k = 0; k < 81 && g.some((v) => !v); k++) {
      const p = nextPlacement(sh, g)!;
      expect(p.digit).toBe(l.solution[p.cell]);
      g[p.cell] = p.digit;
    }
    expect(g).toEqual(l.solution);
  });
});

describe('levels', () => {
  const built = new Map<number, NumbersLevel>();
  const get = (n: number) => {
    if (!built.has(n)) built.set(n, buildNumbersLevel(n));
    return built.get(n)!;
  };
  const LAST = 45;

  test(`levels 1 to ${LAST} have exactly one answer, and the techniques reach it`, () => {
    for (let n = 1; n <= LAST; n++) {
      const l = get(n);
      const sh = shapeOf(l.size);
      expect(valid(l.size, l.solution)).toBe(true);
      expect(l.givens.every((v, i) => v === 0 || v === l.solution[i])).toBe(true);
      const c = countSolutions(sh, l.givens, 2, 1000000);
      expect(c.exhausted).toBe(false);
      expect(c.count).toBe(1);
      const r = rateHuman(sh, l.givens);
      expect(r.solved).toBe(true);
      expect(r.tier).toBe(l.score);
      expect(r.tier).toBeLessThanOrEqual(numbersSpecFor(n).tier);
    }
  }, 60000);

  test('the same level is the same puzzle every time', () => {
    for (const n of [1, 3, 22, 31]) expect(buildNumbersLevel(n)).toEqual(get(n));
  });

  test('labels follow the hardest technique, and every label turns up', () => {
    for (let n = 1; n <= TUTORIAL_COUNT; n++) expect(get(n).difficulty).toBe('Tutorial');
    for (let n = TUTORIAL_COUNT + 1; n <= LAST; n++) expect(get(n).difficulty).toBe(rateNumbers(get(n).score!));
    const labels = new Set(Array.from({ length: LAST - TUTORIAL_COUNT }, (_, k) => get(k + TUTORIAL_COUNT + 1).difficulty));
    expect([...labels].sort()).toEqual(['Easy', 'Hard', 'Medium', 'Super Hard']);
  });

  test('6x6 boards come early and never need more than singles', () => {
    expect(get(1).size).toBe(6);
    for (let n = 1; n <= LAST; n++) if (get(n).size === 6) expect(get(n).score).toBeLessThanOrEqual(2);
  });
});

describe('session', () => {
  const lvl = (): NumbersLevel => {
    const solution = fullGrid(6, new Rng(5));
    const givens = solution.map((v, i) => (i % 4 === 0 ? 0 : v));
    return { number: 1, size: 6, givens, solution, difficulty: 'Easy' };
  };

  test('right digits stay, wrong ones cost a heart and are not placed', () => {
    const s = new Session(lvl());
    const right = s.level.solution[0];
    const wrong = (right % 6) + 1;
    const r = s.place(0, wrong)!;
    expect(r.ok).toBe(false);
    expect(s.grid[0]).toBe(0);
    expect(s.hearts).toBe(START_HEARTS - 1);
    expect(s.place(0, right)!.ok).toBe(true);
    expect(s.place(0, right)).toBeNull(); // already filled
    expect(s.place(1, 1)).toBeNull(); // a given
  });

  test('placing a digit clears it from notes in the same row, column and box', () => {
    const s = new Session(lvl());
    const d = s.level.solution[0];
    s.toggleNote(4, d); // same row, empty square
    s.toggleNote(4, (d % 6) + 1);
    s.place(0, d);
    expect(s.notes[4]).toBe(1 << (((d % 6) + 1) - 1));
    expect(s.clearNotes(4)).toBe(true);
    expect(s.notes[4]).toBe(0);
  });

  test('filling every square wins; stars are hearts left', () => {
    const s = new Session(lvl());
    s.place(0, (s.level.solution[0] % 6) + 1);
    s.level.solution.forEach((v, i) => s.grid[i] || s.place(i, v));
    expect(s.won).toBe(true);
    expect(s.stars()).toBe(2);
  });

  test('running out of hearts asks to carry on, and carrying on earns no stars', () => {
    const s = new Session(lvl());
    const wrong = (s.level.solution[0] % 6) + 1;
    s.place(0, wrong);
    s.place(0, wrong);
    expect(s.place(0, wrong)!.outOfHearts).toBe(true);
    expect(s.place(0, s.level.solution[0])).toBeNull();
    s.continueWithoutHearts();
    s.level.solution.forEach((v, i) => s.grid[i] || s.place(i, v));
    expect(s.won).toBe(true);
    expect(s.stars()).toBe(0);
  });

  test('hints alone finish a real puzzle', () => {
    const s = new Session(buildNumbersLevel(33));
    s.hints = 999;
    for (let k = 0; k < 81 && !s.won; k++) expect(s.hint()).not.toBeNull();
    expect(s.won).toBe(true);
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
    const p = loadNumbers();
    recordNumbersClear(p, 1, 2, 1, 50000);
    recordNumbersClear(p, 1, 3, 0, 60000);
    expect(p.levels[1]).toEqual({ stars: 3, bestMoves: 0, bestMs: 50000 });
    expect(JSON.parse(mem.get(NUMBERS_KEY)!).unlocked).toBe(2);
    resetNumbers(p);
    expect(loadNumbers()).toEqual({ unlocked: 1, current: 1, levels: {} });
  });
});
