import { beforeEach, describe, expect, test } from 'vitest';
import { codesScore, codesSpecFor, rateCodes, REPEAT_INTRO, TUTORIAL_COUNT } from '../src/games/codes/core/difficulty';
import { buildCodesLevel } from '../src/games/codes/core/levels';
import { allCodes, codeCount, fits, Guess, mark } from '../src/games/codes/core/rules';
import { expectedGuesses, nextGuess, remaining, solveCount } from '../src/games/codes/core/solver';
import { CodesLevel } from '../src/games/codes/core/types';
import { Session } from '../src/games/codes/game/session';
import { CODES_KEY, loadCodes, recordCodesClear, resetCodes } from '../src/games/codes/game/storage';
import { Rng } from '../src/shared/rng';

describe('rules', () => {
  test('marks right place and right colour, counting each code peg once', () => {
    expect(mark([0, 1, 2, 3], [0, 1, 2, 3])).toEqual({ exact: 4, near: 0 });
    expect(mark([3, 2, 1, 0], [0, 1, 2, 3])).toEqual({ exact: 0, near: 4 });
    expect(mark([0, 0, 1, 1], [0, 1, 2, 3])).toEqual({ exact: 1, near: 1 });
    expect(mark([1, 1, 1, 1], [0, 1, 2, 1])).toEqual({ exact: 2, near: 0 });
    expect(mark([2, 2, 0, 0], [0, 2, 2, 3])).toEqual({ exact: 1, near: 2 });
    expect(mark([4, 5, 4, 5], [0, 1, 2, 3])).toEqual({ exact: 0, near: 0 });
  });

  test('marking is symmetric in its counts', () => {
    const rng = new Rng(5);
    for (let i = 0; i < 200; i++) {
      const a = Array.from({ length: 5 }, () => rng.int(0, 5));
      const b = Array.from({ length: 5 }, () => rng.int(0, 5));
      expect(mark(a, b)).toEqual(mark(b, a));
    }
  });

  test('lists every code once, with or without repeats', () => {
    for (const [slots, colours, repeats] of [[3, 4, false], [3, 4, true], [4, 6, false]] as const) {
      const all = allCodes(slots, colours, repeats);
      expect(all.length / slots).toBe(codeCount(slots, colours, repeats));
      const seen = new Set<string>();
      for (let k = 0; k < all.length; k += slots) {
        const code = Array.from(all.subarray(k, k + slots));
        if (!repeats) expect(new Set(code).size).toBe(slots);
        seen.add(code.join(','));
      }
      expect(seen.size).toBe(codeCount(slots, colours, repeats));
    }
    expect(codeCount(4, 6, true)).toBe(1296);
    expect(codeCount(4, 6, false)).toBe(360);
  });

  test('fits checks a code against every answer', () => {
    const code = [0, 1, 2];
    const history = [{ pegs: [0, 2, 3], feedback: mark([0, 2, 3], code) }];
    expect(fits(code, history)).toBe(true);
    expect(fits([0, 3, 2], history)).toBe(false);
  });
});

describe('solver', () => {
  const size = { slots: 3, colours: 4, repeats: false };

  test('the code always fits, and every guess it suggests fits too', () => {
    const code = [2, 0, 3];
    const rng = new Rng(1);
    const history: Guess[] = [];
    for (let turn = 0; turn < 10; turn++) {
      const left = remaining(size, history);
      expect(left.some((c) => c.join() === code.join())).toBe(true);
      const g = nextGuess(size, history, rng)!;
      expect(fits(g, history)).toBe(true);
      const feedback = mark(g, code);
      if (feedback.exact === 3) return;
      history.push({ pegs: g, feedback });
    }
    throw new Error('did not crack the code');
  });

  test('cracks every small code within a few guesses', () => {
    const all = allCodes(3, 4, false);
    for (let k = 0; k < all.length; k += 3) {
      expect(solveCount(size, Array.from(all.subarray(k, k + 3)), k)).toBeLessThanOrEqual(5);
    }
  });

  test('cracks the biggest sizes in a reasonable number of guesses', () => {
    for (const s of [
      { slots: 5, colours: 8, repeats: true },
      { slots: 6, colours: 8, repeats: false },
    ]) {
      const rng = new Rng(9);
      for (let i = 0; i < 3; i++) {
        const code = Array.from({ length: s.slots }, () => rng.int(0, s.colours - 1));
        if (!s.repeats) code.splice(0, code.length, ...rng.shuffle([...Array(s.colours).keys()]).slice(0, s.slots));
        expect(solveCount(s, code, i)).toBeLessThanOrEqual(9);
      }
    }
  });

  test('the expected count is the same every time and grows with the size', () => {
    const small = expectedGuesses({ slots: 4, colours: 5, repeats: false });
    expect(expectedGuesses({ slots: 4, colours: 5, repeats: false })).toBe(small);
    expect(expectedGuesses({ slots: 5, colours: 8, repeats: true })).toBeGreaterThan(small);
  });
});

describe('levels', () => {
  test('specs ramp up and stay in range', () => {
    for (let n = 1; n <= 200; n++) {
      const s = codesSpecFor(n);
      expect(s.slots).toBeGreaterThanOrEqual(3);
      expect(s.slots).toBeLessThanOrEqual(6);
      expect(s.colours).toBeLessThanOrEqual(8);
      if (!s.repeats) expect(s.colours).toBeGreaterThanOrEqual(s.slots);
      if (n < REPEAT_INTRO) expect(s.repeats).toBe(false);
    }
    expect(codesSpecFor(REPEAT_INTRO).repeats).toBe(true);
    expect(codesSpecFor(REPEAT_INTRO).tip).toBeTruthy();
  });

  test('levels 1 to 60 build, are the same when built twice, and fit their size', () => {
    for (let n = 1; n <= 60; n++) {
      const l = buildCodesLevel(n);
      expect(l.number).toBe(n);
      expect(l.code).toHaveLength(l.slots);
      for (const c of l.code) expect(c >= 0 && c < l.colours).toBe(true);
      if (!l.repeats) expect(new Set(l.code).size).toBe(l.slots);
      expect(l.par).toBe(Math.ceil(l.expected) + 1);
      expect(l.difficulty).toBe(n <= TUTORIAL_COUNT ? 'Tutorial' : rateCodes(codesScore(l)));
      expect(buildCodesLevel(n)).toEqual(l);
    }
  });

  test('labels grow with the number of codes', () => {
    expect(rateCodes(codesScore({ slots: 4, colours: 5, repeats: false }))).toBe('Easy');
    expect(rateCodes(codesScore({ slots: 4, colours: 6, repeats: true }))).toBe('Medium');
    expect(rateCodes(codesScore({ slots: 4, colours: 8, repeats: true }))).toBe('Hard');
    expect(rateCodes(codesScore({ slots: 5, colours: 8, repeats: true }))).toBe('Super Hard');
  });
});

describe('session', () => {
  const level: CodesLevel = {
    number: 1,
    slots: 3,
    colours: 4,
    repeats: false,
    code: [2, 0, 3],
    par: 3,
    expected: 2.8,
    difficulty: 'Tutorial',
  };

  test('fills slots in order, clears them, and checks only a full row', () => {
    const s = new Session(level);
    expect(s.submit()).toBeNull();
    s.place(1);
    s.place(2);
    expect(s.row).toEqual([1, 2, null]);
    expect(s.cursor).toBe(2);
    s.backspace();
    expect(s.row).toEqual([1, null, null]);
    s.select(0);
    s.select(0); // second tap on a filled, selected slot empties it
    expect(s.row).toEqual([null, null, null]);
    s.place(0);
    s.place(1);
    s.place(2);
    const g = s.submit()!;
    expect(g.feedback).toEqual({ exact: 0, near: 2 });
    expect(s.row).toEqual([null, null, null]);
    expect(s.won).toBe(false);
  });

  test('wins on the code, and stars follow guesses and hints', () => {
    const s = new Session(level);
    for (const c of [2, 0, 3]) s.place(c);
    s.submit();
    expect(s.won).toBe(true);
    expect(s.stars()).toBe(3);
    expect(s.place(1)).toBe(false);

    const t = new Session(level);
    for (let i = 0; i < 4; i++) {
      for (const c of [0, 1, 2]) t.place(c);
      t.submit();
    }
    for (const c of [2, 0, 3]) t.place(c);
    t.submit();
    expect(t.guesses).toHaveLength(5);
    expect(t.stars()).toBe(2);
  });

  test('locked slots keep their colour, are skipped, and fill the next guess', () => {
    const s = new Session(level);
    expect(s.toggleLock(0)).toBe(false); // can't lock an empty slot
    s.place(2);
    expect(s.toggleLock(0)).toBe(true);
    s.select(0);
    s.select(0); // tapping a locked slot doesn't clear it
    expect(s.row[0]).toBe(2);
    s.place(1);
    s.place(0);
    expect(s.row).toEqual([2, 1, 0]);
    s.backspace();
    s.backspace();
    expect(s.backspace()).toBe(false); // the locked slot stays
    expect(s.row).toEqual([2, null, null]);
    s.place(1);
    s.place(0);
    s.submit();
    expect(s.row).toEqual([2, null, null]);
    expect(s.cursor).toBe(1);
    s.place(0);
    s.place(3);
    expect(s.row).toEqual([2, 0, 3]);
    s.submit();
    expect(s.won).toBe(true);
    expect(s.locked).toEqual([false, false, false]);
  });

  test('a fully locked row refills itself and ignores new colours', () => {
    const s = new Session(level);
    for (const c of [0, 1, 2]) s.place(c);
    for (let i = 0; i < 3; i++) s.toggleLock(i);
    expect(s.rowEmpty).toBe(true);
    expect(s.place(3)).toBe(false);
    s.submit();
    expect(s.row).toEqual([0, 1, 2]);
    expect(s.rowFull).toBe(true);
    s.toggleLock(1);
    s.select(1);
    s.place(3);
    expect(s.row).toEqual([0, 3, 2]);
  });

  test('a hint fills the row with a code that fits, and costs a star', () => {
    const s = new Session(level);
    for (const c of [0, 1, 2]) s.place(c);
    s.submit();
    const h = s.hint()!;
    expect(fits(h, s.guesses)).toBe(true);
    expect(s.row).toEqual(h);
    expect(s.hints).toBe(2);
    expect(s.codesLeft()).toBeGreaterThan(0);
    // Keep playing codes that fit (as a hint would) until it is cracked.
    const rng = new Rng(3);
    for (let turn = 0; turn < 8 && !s.won; turn++) {
      if (!s.rowFull) for (const c of nextGuess(level, s.guesses, rng)!) s.place(c);
      s.submit();
    }
    expect(s.won).toBe(true);
    expect(s.hintsUsed).toBe(1);
    expect(s.stars()).toBeLessThanOrEqual(2);
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

  test('round trips and keeps the best of each record', () => {
    const p = loadCodes();
    expect(p.unlocked).toBe(1);
    recordCodesClear(p, 1, 2, 6, 40000);
    recordCodesClear(p, 1, 3, 4, 50000);
    const q = loadCodes();
    expect(q.levels[1]).toEqual({ stars: 3, bestMoves: 4, bestMs: 40000 });
    expect(q.unlocked).toBe(2);
    expect(JSON.parse(mem.get(CODES_KEY)!).current).toBe(2);
    resetCodes(q);
    expect(loadCodes().levels).toEqual({});
  });
});
