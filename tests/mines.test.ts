import { describe, expect, test } from 'vitest';
import { MINES_THRESHOLDS, minesScore, rateMines, TUTORIAL_COUNT } from '../src/games/mines/core/difficulty';
import { buildMinesLevel } from '../src/games/mines/core/levels';
import { around, flood, numbers } from '../src/games/mines/core/rules';
import { nextStep, solve } from '../src/games/mines/core/solver';
import { MinesLevel } from '../src/games/mines/core/types';
import { Session, START_HEARTS } from '../src/games/mines/game/session';
import { loadMines, MINES_KEY, recordMinesClear, resetMines } from '../src/games/mines/game/storage';

/** Board from a picture: * mine, S start, . safe. */
function parse(rows: string[]): { w: number; h: number; mines: number[]; start: number } {
  const w = rows[0].length;
  const h = rows.length;
  const mines: number[] = [];
  let start = 0;
  rows.forEach((r, y) =>
    [...r].forEach((ch, x) => {
      if (ch === '*') mines.push(y * w + x);
      if (ch === 'S') start = y * w + x;
    }),
  );
  return { w, h, mines, start };
}

describe('rules', () => {
  test('numbers count the mines around each square', () => {
    const { w, h, mines } = parse(['*..', '...', '..*']);
    expect(numbers(w, h, mines)).toEqual([-1, 1, 0, 1, 2, 1, 0, 1, -1]);
    expect(around(3, 3, 0).sort()).toEqual([1, 3, 4]);
  });

  test('opening a 0 floods out to the numbers around it', () => {
    const { w, h, mines } = parse(['....', '....', '...*']);
    const nums = numbers(w, h, mines);
    const open = new Uint8Array(w * h);
    const got = flood(w, h, nums, open, 0);
    expect(got.length).toBe(11); // everything but the mine
    expect(open[11]).toBe(0);
  });
});

describe('solver', () => {
  test('one number: a 1 with one covered square beside it marks a mine', () => {
    const { w, h, mines } = parse(['S.*']);
    const nums = numbers(w, h, mines);
    const open = new Uint8Array(3);
    open[0] = 1;
    open[1] = 1;
    const s = nextStep(w, h, nums, { open, mine: new Uint8Array(3) }, 1)!;
    expect(s.level).toBe(1);
    expect(s.mines).toEqual([2]);
  });

  test('two numbers: the 1-2 pattern along a wall', () => {
    // Bottom row open: 1 2 1 under a covered row, the classic pattern with one answer.
    //   * . *        (covered)
    //   1 2 1        (open)
    const w = 3;
    const h = 2;
    const mines = [0, 2];
    const nums = numbers(w, h, mines);
    const open = new Uint8Array(6);
    open[3] = open[4] = open[5] = 1;
    const k = { open, mine: new Uint8Array(6) };
    // No single number settles anything; the 1 and the 2 together show both corners are
    // mines. Then the 1 alone shows the middle is safe.
    const s = nextStep(w, h, nums, k, 2)!;
    expect(s.level).toBe(2);
    expect(s.mines.sort()).toEqual([0, 2]);
    for (const m of s.mines) k.mine[m] = 1;
    const next = nextStep(w, h, nums, k, 2)!;
    expect(next.level).toBe(1);
    expect(next.safe).toEqual([1]);
  });

  test('every step agrees with where the mines really are', () => {
    for (const n of [5, 18, 33]) {
      const l = buildMinesLevel(n);
      const nums = numbers(l.w, l.h, l.mines);
      const k = { open: new Uint8Array(l.w * l.h), mine: new Uint8Array(l.w * l.h) };
      flood(l.w, l.h, nums, k.open, l.start);
      const mineSet = new Set(l.mines);
      for (let guard = 0; guard < 500; guard++) {
        const s = nextStep(l.w, l.h, nums, k, l.mines.length);
        if (!s) break;
        for (const c of s.safe) expect(mineSet.has(c)).toBe(false);
        for (const c of s.mines) expect(mineSet.has(c)).toBe(true);
        for (const m of s.mines) k.mine[m] = 1;
        for (const c of s.safe) flood(l.w, l.h, nums, k.open, c);
      }
    }
  });

  test('a board that needs a guess is not solved', () => {
    // 2x3, mine bottom-left: the two 1s both see both bottom squares, a pure 50/50.
    const guess = parse(['S.', '..', '*.']);
    expect(solve(guess.w, guess.h, numbers(guess.w, guess.h, guess.mines), guess.start, 1).solved).toBe(false);
    // 3x3, mine bottom-left: the zeros open everything else, so the mine is the only square left.
    const fine = parse(['S..', '...', '*..']);
    expect(solve(fine.w, fine.h, numbers(fine.w, fine.h, fine.mines), fine.start, 1).solved).toBe(true);
  });
});

describe('levels', () => {
  const built = new Map<number, MinesLevel>();
  const get = (n: number) => {
    if (!built.has(n)) built.set(n, buildMinesLevel(n));
    return built.get(n)!;
  };

  test('levels 1 to 60 can be finished without guessing, and start safe', () => {
    for (let n = 1; n <= 60; n++) {
      const l = get(n);
      const near = new Set([l.start, ...around(l.w, l.h, l.start)]);
      expect(l.mines.some((m) => near.has(m))).toBe(false);
      expect(new Set(l.mines).size).toBe(l.mines.length);
      const r = solve(l.w, l.h, numbers(l.w, l.h, l.mines), l.start, l.mines.length);
      expect(r.solved).toBe(true);
      expect(minesScore(r.uses)).toBe(l.score);
    }
  });

  test('the same level is the same board every time', () => {
    for (const n of [1, 14, 40]) expect(buildMinesLevel(n)).toEqual(get(n));
  });

  test('labels follow the score, and every label turns up', () => {
    for (let n = 1; n <= TUTORIAL_COUNT; n++) expect(get(n).difficulty).toBe('Tutorial');
    for (let n = TUTORIAL_COUNT + 1; n <= 60; n++) expect(get(n).difficulty).toBe(rateMines(get(n).score!));
    const labels = new Set(Array.from({ length: 60 - TUTORIAL_COUNT }, (_, k) => get(k + TUTORIAL_COUNT + 1).difficulty));
    expect(labels.size).toBe(4);
    expect(rateMines(MINES_THRESHOLDS[0] - 1)).toBe('Easy');
    expect(rateMines(MINES_THRESHOLDS[2])).toBe('Super Hard');
  });
});

describe('session', () => {
  const lvl = (): MinesLevel => ({ number: 1, ...parse(['S...', '....', '..*.', '....']), difficulty: 'Easy' });

  test('the start area opens by itself, and uncovering every safe square wins', () => {
    const s = new Session(lvl());
    expect(s.open[0]).toBe(1);
    expect(s.won).toBe(false);
    for (let i = 0; i < 16; i++) if (!s.isMine(i)) s.reveal(i);
    expect(s.won).toBe(true);
    expect(s.stars()).toBe(START_HEARTS);
  });

  test('a mine costs a heart and stays shown; play goes on', () => {
    const s = new Session(lvl());
    const r = s.reveal(10)!;
    expect(r.hit).toBe(10);
    expect(s.hearts).toBe(START_HEARTS - 1);
    expect(s.covered(10)).toBe(false);
    expect(s.reveal(10)).toBeNull();
    for (let i = 0; i < 16; i++) if (!s.isMine(i)) s.reveal(i);
    expect(s.won).toBe(true);
    expect(s.stars()).toBe(START_HEARTS - 1);
  });

  test('flags are notes: they block a tap, and count down the mines', () => {
    const s = new Session(lvl());
    const covered = [...Array(16).keys()].find((i) => s.covered(i))!;
    expect(s.minesLeft).toBe(1);
    expect(s.toggleFlag(covered)).toBe(true);
    expect(s.minesLeft).toBe(0);
    expect(s.reveal(covered)).toBeNull();
    s.toggleFlag(covered);
    expect(s.minesLeft).toBe(1);
  });

  test('tapping a number whose mine is flagged opens the rest around it', () => {
    // 3 wide, mine at 10 (middle of row 3). The start opens rows 0 to 2; row 2 shows 1 1 1.
    const board = (): MinesLevel => ({ number: 1, ...parse(['S..', '...', '...', '.*.', '...', '...']), difficulty: 'Easy' });
    const s = new Session(board());
    expect([6, 7, 8].map((i) => s.nums[i])).toEqual([1, 1, 1]);
    expect(s.chord(7)).toBeNull(); // nothing flagged yet
    s.toggleFlag(10);
    const r = s.chord(7)!;
    expect(r.hit).toBeNull();
    expect(s.open[9] && s.open[11]).toBeTruthy();
    // With the flag on the wrong square, the chord sets off the real mine.
    const t = new Session(board());
    t.toggleFlag(9);
    const r2 = t.chord(6)!;
    expect(r2.hit).toBe(10);
    expect(t.hearts).toBe(START_HEARTS - 1);
  });

  test('out of hearts asks to carry on, and carrying on earns no stars', () => {
    const s = new Session(buildMinesLevel(20));
    const [a, b, c] = s.level.mines.filter((m) => s.covered(m));
    s.reveal(a);
    s.reveal(b);
    expect(s.reveal(c)!.outOfHearts).toBe(true);
    expect(s.awaitingContinue).toBe(true);
    s.continueWithoutHearts();
    for (let i = 0; i < s.w * s.h; i++) if (!s.isMine(i)) s.reveal(i);
    expect(s.won).toBe(true);
    expect(s.stars()).toBe(0);
  });

  test('hints alone finish a real level without a mine going off', () => {
    const s = new Session(buildMinesLevel(30));
    s.hints = 999;
    for (let k = 0; k < 400 && !s.won; k++) {
      const r = s.hint();
      expect(r).not.toBeNull();
      if (r!.kind === 'mine') expect(s.isMine(r!.cell)).toBe(true);
      else expect(s.isMine(r!.cell)).toBe(false);
    }
    expect(s.won).toBe(true);
    expect(s.hit.size).toBe(0);
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
    const p = loadMines();
    recordMinesClear(p, 1, 2, 1, 50000);
    recordMinesClear(p, 1, 3, 0, 60000);
    expect(p.levels[1]).toEqual({ stars: 3, bestMoves: 0, bestMs: 50000 });
    expect(JSON.parse(mem.get(MINES_KEY)!).unlocked).toBe(2);
    resetMines(p);
    expect(loadMines()).toEqual({ unlocked: 1, current: 1, levels: {} });
  });
});
