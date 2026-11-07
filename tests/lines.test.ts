import { describe, expect, test } from 'vitest';
import { Rng } from '../src/shared/rng';
import { LINES_THRESHOLDS, rateLines, TUTORIAL_COUNT } from '../src/games/lines/core/difficulty';
import { buildLinesLevel } from '../src/games/lines/core/levels';
import { growPaths } from '../src/games/lines/core/paths';
import { adjacent, complete, dotsOf, isSolved } from '../src/games/lines/core/rules';
import { pathsFrom, rate, search, startState, viable } from '../src/games/lines/core/solver';
import { LinesLevel, MAX_COLOURS } from '../src/games/lines/core/types';
import { Session } from '../src/games/lines/game/session';
import { LINES_KEY, loadLines, recordLinesClear, resetLines } from '../src/games/lines/game/storage';

// A 3x3 board, cells numbered
//   0 1 2
//   3 4 5
//   6 7 8
// Red runs 0-1-2-5, blue 3-4, green 6-7-8.
const SOL = [
  [0, 1, 2, 5],
  [3, 4],
  [6, 7, 8],
];

describe('rules', () => {
  test('a complete line runs dot to dot in steps', () => {
    expect(complete(3, [0, 1, 2, 5], [0, 5])).toBe(true);
    expect(complete(3, [5, 2, 1, 0], [0, 5])).toBe(true);
    expect(complete(3, [0, 1, 5], [0, 5])).toBe(false); // 1 to 5 is not a step
    expect(complete(3, [0, 1, 2], [0, 5])).toBe(false);
  });
  test('solved only when every line is complete and every cell covered once', () => {
    expect(isSolved(3, 3, SOL, dotsOf(SOL))).toBe(true);
    expect(isSolved(3, 3, [SOL[0], SOL[1], []], dotsOf(SOL))).toBe(false);
  });
  test('adjacent', () => {
    expect(adjacent(3, 2, 3)).toBe(false); // wraps a row
    expect(adjacent(3, 2, 5)).toBe(true);
  });
});

describe('solver', () => {
  test('finds the one solution of a small board', () => {
    const r = search(3, 3, dotsOf(SOL), 2);
    expect(r.count).toBe(1);
    expect(pathsFrom(r.first!, dotsOf(SOL))).toEqual(SOL);
  });

  test('counts solutions: none, one, or more than one', () => {
    // 3x2, one colour from the top middle to the bottom middle: the corners can't all be
    // reached, so there is no solution.
    expect(search(3, 2, [[1, 4]], 2).count).toBe(0);
    // 2x2, one colour between two side-by-side dots: it must go the long way round.
    expect(search(2, 2, [[0, 1]], 2).count).toBe(1);
    // 3x3, one colour from corner to corner: snaking by rows or by columns both work.
    expect(search(3, 3, [[0, 8]], 2).count).toBe(2);
  });

  test('an empty cell with only one way in is caught', () => {
    // 3x1: red dots at both ends leave the middle with two ways in.
    expect(viable(startState(3, 1, [[0, 2]]))).toBe(true);
    // Red dots side by side leave the last cell with one way in: it can never be filled.
    expect(viable(startState(3, 1, [[0, 1]]))).toBe(false);
  });

  test('grown paths cover the grid and never touch themselves', () => {
    const rng = new Rng(3);
    let made = 0;
    for (let k = 0; k < 30; k++) {
      const p = growPaths(7, 7, 8, 3, rng);
      if (!p) continue;
      made++;
      expect(p.flat().sort((a, b) => a - b)).toEqual([...Array(49).keys()]);
      for (const q of p) {
        expect(q.length).toBeGreaterThanOrEqual(3);
        for (let i = 0; i < q.length; i++) {
          for (let j = i + 1; j < q.length; j++) expect(adjacent(7, q[i], q[j])).toBe(j === i + 1);
        }
      }
    }
    expect(made).toBeGreaterThan(5);
  });

  test('rating: a board solved by forced moves alone scores near 1', () => {
    expect(rate(3, 3, SOL).score).toBeLessThan(1.5);
  });
});

describe('levels', () => {
  const built = new Map<number, LinesLevel>();
  const level = (n: number) => {
    if (!built.has(n)) built.set(n, buildLinesLevel(n));
    return built.get(n)!;
  };
  const LAST = 30;

  test(`levels 1 to ${LAST} build with exactly one solution`, () => {
    for (let n = 1; n <= LAST; n++) {
      const l = level(n);
      expect(l.solution.length).toBeLessThanOrEqual(MAX_COLOURS);
      expect(isSolved(l.w, l.h, l.solution, dotsOf(l.solution))).toBe(true);
      const r = search(l.w, l.h, dotsOf(l.solution), 2, 50000);
      expect(r.exhausted).toBe(false);
      expect(r.count).toBe(1);
    }
  }, 60000);

  test('the same level is the same board every time', () => {
    for (const n of [1, 9, 27]) expect(buildLinesLevel(n)).toEqual(level(n));
  });

  test('tutorials are labelled, then the label follows the score', () => {
    for (let n = 1; n <= TUTORIAL_COUNT; n++) expect(level(n).difficulty).toBe('Tutorial');
    for (let n = TUTORIAL_COUNT + 1; n <= LAST; n++) expect(level(n).difficulty).toBe(rateLines(level(n).score!));
    const labels = new Set(Array.from({ length: LAST - TUTORIAL_COUNT }, (_, k) => level(k + TUTORIAL_COUNT + 1).difficulty));
    expect(labels.size).toBeGreaterThanOrEqual(3);
  });

  test('labels by threshold', () => {
    expect(rateLines(1)).toBe('Easy');
    expect(rateLines(LINES_THRESHOLDS[0])).toBe('Medium');
    expect(rateLines(LINES_THRESHOLDS[1])).toBe('Hard');
    expect(rateLines(LINES_THRESHOLDS[2])).toBe('Super Hard');
  });
});

describe('session', () => {
  const lvl = (): LinesLevel => ({ number: 1, w: 3, h: 3, solution: SOL.map((p) => p.slice()), difficulty: 'Easy' });
  const draw = (s: Session, cells: number[]) => {
    s.begin(cells[0]);
    for (const c of cells.slice(1)) s.extend(c);
    s.end();
  };

  test('drawing every line wins with three stars', () => {
    const s = new Session(lvl());
    draw(s, [0, 1, 2, 5]);
    draw(s, [4, 3]);
    expect(s.won).toBe(false);
    draw(s, [8, 7, 6]);
    expect(s.won).toBe(true);
    expect(s.moves).toBe(3);
    expect(s.stars()).toBe(3);
  });

  test("lines can't enter another colour's dot or skip cells", () => {
    const s = new Session(lvl());
    s.begin(0);
    expect(s.extend(3)).toBe(false); // blue dot
    expect(s.extend(2)).toBe(false); // not beside the end
    expect(s.extend(1)).toBe(true);
    s.end();
  });

  test('crossing a line cuts it, and backing off restores it', () => {
    const s = new Session(lvl());
    draw(s, [0, 1, 2, 5]);
    s.begin(4); // blue, heading up through red
    s.extend(1);
    expect(s.paths[0]).toEqual([0]);
    s.extend(4); // back off: red comes back
    expect(s.paths[0]).toEqual([0, 1, 2, 5]);
    s.extend(1);
    s.end();
    expect(s.paths[0]).toEqual([0]);
    expect(s.undo()).toBe(true);
    expect(s.paths[0]).toEqual([0, 1, 2, 5]);
  });

  test('a line stops at its second dot, and backing over itself shortens it', () => {
    const s = new Session(lvl());
    s.begin(3);
    s.extend(4);
    expect(s.isComplete(1)).toBe(true);
    expect(s.extend(5)).toBe(false);
    s.end();
    s.begin(0);
    s.extend(1);
    s.extend(2);
    s.extend(1);
    expect(s.paths[0]).toEqual([0, 1]);
    s.end();
  });

  test('pressing a loose end carries the line on', () => {
    const s = new Session(lvl());
    draw(s, [0, 1]);
    s.begin(1);
    s.extend(2);
    s.extend(5);
    s.end();
    expect(s.isComplete(0)).toBe(true);
  });

  test('a press that changes nothing is not a move', () => {
    const s = new Session(lvl());
    s.begin(4); // a dot with no line yet, let go straight away
    s.end();
    s.begin(7); // an empty cell: nothing to pick up
    s.end();
    expect(s.moves).toBe(0);
    expect(s.canUndo).toBe(false);
  });

  test('hints draw the solution line and cost a star each', () => {
    const s = new Session(lvl());
    draw(s, [6, 3]); // green can't enter blue's dot, so nothing is drawn
    expect(s.hint()).toBe(1); // shortest wrong line: blue
    expect(s.isComplete(1)).toBe(true);
    expect(s.stars()).toBe(2);
    s.hint();
    s.hint();
    expect(s.won).toBe(true);
    expect(s.stars()).toBe(1);
    expect(s.hint()).toBeNull();
  });

  test('hints alone solve a real level', () => {
    const s = new Session(buildLinesLevel(8));
    s.hints = 99;
    while (!s.won) expect(s.hint()).not.toBeNull();
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
    const p = loadLines();
    recordLinesClear(p, 1, 2, 6, 5000);
    recordLinesClear(p, 1, 3, 8, 7000);
    expect(p.levels[1]).toEqual({ stars: 3, bestMoves: 6, bestMs: 5000 });
    expect(JSON.parse(mem.get(LINES_KEY)!).unlocked).toBe(2);
    resetLines(p);
    expect(loadLines()).toEqual({ unlocked: 1, current: 1, levels: {} });
  });
});
