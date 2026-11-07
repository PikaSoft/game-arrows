import { describe, expect, test } from 'vitest';
import { HOLE_INTRO, ICE_THRESHOLDS, iceScore, rateIce, TUTORIAL_COUNT, TWIN_INTRO } from '../src/games/ice/core/difficulty';
import { buildIceLevel } from '../src/games/ice/core/levels';
import { allHome, Board, HOME, slide } from '../src/games/ice/core/rules';
import { explore, stops } from '../src/games/ice/core/solver';
import { IceLevel } from '../src/games/ice/core/types';
import { Session } from '../src/games/ice/game/session';
import { ICE_KEY, loadIce, recordIceClear, resetIce } from '../src/games/ice/game/storage';

/** Build a board from a picture: # rock, o hole, A/B puck starts, a/b their flags. */
function parse(rows: string[]): { board: Board; starts: number[] } {
  const h = rows.length;
  const w = rows[0].length;
  const rocks: boolean[] = [];
  const holes: number[] = [];
  const starts: number[] = [];
  const exits: number[] = [];
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const i = y * w + x;
      rocks.push(ch === '#');
      if (ch === 'o') holes.push(i);
      if (ch === 'A') starts[0] = i;
      if (ch === 'B') starts[1] = i;
      if (ch === 'a') exits[0] = i;
      if (ch === 'b') exits[1] = i;
    }),
  );
  return { board: { w, h, rocks, holes, exits }, starts: starts.filter((s) => s !== undefined) };
}

const level = (rows: string[], par = 1): IceLevel => {
  const { board, starts } = parse(rows);
  return { number: 1, w: board.w, h: board.h, rocks: board.rocks, holes: board.holes, starts, exits: board.exits, par, difficulty: 'Easy' };
};

describe('rules', () => {
  test('a puck slides to the edge or a rock, and passing its flag is not enough', () => {
    const { board, starts } = parse(['A.a..', '.....', '..#..']);
    expect(slide(board, starts, 1).pos).toEqual([4]); // slid past the flag at 2
    expect(slide(board, starts, 2).pos).toEqual([10]);
    expect(slide(board, starts, 0).moved).toBe(false);
  });

  test('stopping on the flag sends the puck home', () => {
    const { board, starts } = parse(['A.a#.']);
    expect(slide(board, starts, 1).pos).toEqual([HOME]);
  });

  test('a puck sliding over a hole falls in, and nothing moves', () => {
    const { board, starts } = parse(['A.o..a']);
    const r = slide(board, starts, 1);
    expect(r.fell).toBe(0);
    expect(r.pos).toEqual(starts);
    expect(r.paths[0]).toEqual([1, 2]);
  });

  test('two pucks stop against each other, the leading one first', () => {
    const { board, starts } = parse(['AB...', '..a.b']);
    const r = slide(board, starts, 1);
    expect(r.pos).toEqual([3, 4]);
    const back = slide(board, r.pos, 3);
    expect(back.pos).toEqual([0, 1]);
  });
});

describe('solver', () => {
  test('finds the fewest swipes and counts dead ends', () => {
    const { board, starts } = parse(['A...#', '....a', '.....']);
    const s = explore(board, starts);
    expect(s.par).toBeGreaterThan(0);
    // Playing the moves gets home.
    let pos = starts;
    for (const d of s.moves) pos = slide(board, pos, d).pos;
    expect(allHome(pos)).toBe(true);
  });

  test('an unreachable flag has no solution', () => {
    const { board, starts } = parse(['A..', '...', '.a.']);
    expect(explore(board, starts).par).toBe(-1);
  });

  test('stops lists every cell a lone puck can stop at', () => {
    // On an open 3x3, from the middle: the sides in one swipe, the corners in two. The
    // middle itself can never be stopped on again, but it is the start.
    const { board } = parse(['...', '...', '...']);
    const st = stops(board, 4);
    expect([...st.keys()].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(st.get(4)).toBe(0);
    expect(st.get(1)).toBe(1);
    expect(st.get(0)).toBe(2);
  });
});

describe('levels', () => {
  const built = new Map<number, IceLevel>();
  const get = (n: number) => {
    if (!built.has(n)) built.set(n, buildIceLevel(n));
    return built.get(n)!;
  };

  test('levels 1 to 60 build and par is the true fewest swipes', () => {
    for (let n = 1; n <= 60; n++) {
      const l = get(n);
      expect(l.rocks.length).toBe(l.w * l.h);
      expect(l.starts.length).toBe(l.exits.length);
      for (const c of [...l.starts, ...l.exits, ...l.holes]) expect(l.rocks[c]).toBe(false);
      expect(new Set([...l.starts, ...l.exits, ...l.holes]).size).toBe(l.starts.length * 2 + l.holes.length);
      const s = explore({ w: l.w, h: l.h, rocks: l.rocks, holes: l.holes, exits: l.exits }, l.starts);
      expect(s.par).toBe(l.par);
      expect(l.par).toBeGreaterThanOrEqual(2);
      expect(l.score).toBe(iceScore(s.par, s.reachable, s.dead));
    }
  });

  test('the same level is the same board every time', () => {
    for (const n of [1, 12, 25, 47]) expect(buildIceLevel(n)).toEqual(get(n));
  });

  test('holes and twin pucks arrive on their intro levels, not before', () => {
    expect(get(HOLE_INTRO).holes.length).toBeGreaterThan(0);
    expect(get(TWIN_INTRO).starts.length).toBe(2);
    for (let n = 1; n < HOLE_INTRO; n++) expect(get(n).holes.length).toBe(0);
    for (let n = 1; n < TWIN_INTRO; n++) expect(get(n).starts.length).toBe(1);
  });

  test('tutorials are labelled, then the label follows the score', () => {
    for (let n = 1; n <= TUTORIAL_COUNT; n++) expect(get(n).difficulty).toBe('Tutorial');
    for (let n = TUTORIAL_COUNT + 1; n <= 60; n++) expect(get(n).difficulty).toBe(rateIce(get(n).score!));
    expect(rateIce(ICE_THRESHOLDS[0] - 1)).toBe('Easy');
    expect(rateIce(ICE_THRESHOLDS[2])).toBe('Super Hard');
  });
});

describe('session', () => {
  test('swiping home: the long way round costs a star', () => {
    // Par is 2 (down, then right onto the flag at the edge). Right first stops at the rock.
    const s = new Session(level(['A...#', '....a'], 2));
    s.swipe(1);
    expect(s.pos).toEqual([3]);
    s.swipe(2);
    expect(s.won).toBe(false);
    s.swipe(1);
    expect(s.won).toBe(true);
    expect(s.swipes).toBe(3);
    expect(s.stars()).toBe(2);
  });

  test('a swipe that moves nothing is not a swipe', () => {
    const s = new Session(level(['A..a']));
    expect(s.swipe(3)).toBeNull();
    expect(s.swipes).toBe(0);
  });

  test('falling in a hole wastes the swipe but moves nothing', () => {
    const s = new Session(level(['A.o.a', '.....']));
    const r = s.swipe(1)!;
    expect(r.fell).toBe(0);
    expect(s.pos).toEqual([0]);
    expect(s.swipes).toBe(1);
    expect(s.canUndo).toBe(false);
  });

  test('dead ends are spotted, and undo gets out of them', () => {
    // Swiping up lands in the top-left nook, from which the flag can never be reached.
    const s = new Session(level(['..##', '#Aa#', '..#.']));
    expect(s.deadEnd).toBe(false);
    s.swipe(0);
    expect(s.deadEnd).toBe(true);
    expect(s.hint()).toBeNull();
    expect(s.undo()).toBe(true);
    expect(s.pos).toEqual([5]);
    expect(s.swipes).toBe(1);
    expect(s.deadEnd).toBe(false);
  });

  test('hints point the first swipe of a shortest way home and cost a star', () => {
    const l = buildIceLevel(20);
    const s = new Session(l);
    s.hints = 999;
    for (let k = 0; k < 100 && !s.won; k++) s.swipe(s.hint()!);
    expect(s.won).toBe(true);
    expect(s.swipes).toBe(l.par);
    expect(s.stars()).toBe(1);
  });

  test('twin pucks: hints lead both home', () => {
    const s = new Session(buildIceLevel(25));
    s.hints = 999;
    for (let k = 0; k < 100 && !s.won; k++) s.swipe(s.hint()!);
    expect(s.won).toBe(true);
    expect(s.swipes).toBe(s.level.par);
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
    const p = loadIce();
    recordIceClear(p, 1, 2, 9, 5000);
    recordIceClear(p, 1, 3, 7, 6000);
    expect(p.levels[1]).toEqual({ stars: 3, bestMoves: 7, bestMs: 5000 });
    expect(JSON.parse(mem.get(ICE_KEY)!).unlocked).toBe(2);
    resetIce(p);
    expect(loadIce()).toEqual({ unlocked: 1, current: 1, levels: {} });
  });
});
