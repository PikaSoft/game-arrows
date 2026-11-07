import { describe, expect, test } from 'vitest';
import { GATE_INTRO, rateSqueeze, squeezeSpecFor, TUTORIAL_COUNT } from '../src/games/squeeze/core/difficulty';
import { buildSqueezeLevel } from '../src/games/squeeze/core/levels';
import { Board, canExit, findExit, occupancy, reachable } from '../src/games/squeeze/core/rules';
import { shapeIndex } from '../src/games/squeeze/core/shapes';
import { slideRange } from '../src/games/squeeze/core/slide';
import { solve, startPos } from '../src/games/squeeze/core/solver';
import { Block, Gap, SqueezeLevel } from '../src/games/squeeze/core/types';
import { Session } from '../src/games/squeeze/game/session';

const gap = (side: Gap['side'], start: number, len: number, color: number | null = null): Gap => ({ side, start, len, color });
const block = (name: string, x: number, y: number, color = 0): Block => ({ shape: shapeIndex(name), x, y, color });
const lvl = (w: number, h: number, gaps: Gap[], blocks: Block[], par = 1): SqueezeLevel => ({
  number: 99,
  w,
  h,
  gaps,
  blocks,
  par,
  difficulty: 'Easy',
});

describe('exit rules', () => {
  const board: Board = { w: 4, h: 4, gaps: [gap('top', 1, 2), gap('right', 0, 1, 3)] };

  test('a block fits only through a gap that spans it', () => {
    const blocks = [block('bar2h', 1, 2), block('bar3h', 0, 3)];
    const occ0 = occupancy(board, blocks, startPos(blocks), 0);
    expect(canExit(board, blocks, occ0, 0, 1, 2, 'top')).toBe(true);
    expect(canExit(board, blocks, occ0, 0, 0, 2, 'top')).toBe(false); // column 0 is wall
    const occ1 = occupancy(board, blocks, startPos(blocks), 1);
    // Three wide never fits a two wide gap.
    expect(canExit(board, blocks, occ1, 1, 0, 3, 'top')).toBe(false);
  });

  test('the way out has to be clear', () => {
    const blocks = [block('dot', 1, 3), block('dot', 1, 1)];
    const occ = occupancy(board, blocks, startPos(blocks), 0);
    expect(canExit(board, blocks, occ, 0, 1, 3, 'top')).toBe(false);
    expect(canExit(board, blocks, occ, 0, 2, 3, 'top')).toBe(true);
  });

  test('a coloured gate only takes its own colour', () => {
    const blocks = [block('dot', 3, 0, 3), block('dot', 3, 0, 1)];
    const occ = occupancy(board, [blocks[0]], [{ x: 3, y: 0 }], 0);
    expect(canExit(board, blocks, occ, 0, 3, 0, 'right')).toBe(true);
    expect(canExit(board, blocks, occ, 1, 3, 0, 'right')).toBe(false);
  });

  test('reachable spreads around obstacles, and findExit uses it', () => {
    const b: Board = { w: 3, h: 3, gaps: [gap('bottom', 2, 1)] };
    // A wall of two bars down the middle column leaves the dot boxed in on the left.
    const blocks = [block('dot', 0, 0), block('bar3v', 1, 0)];
    const pos = startPos(blocks);
    expect(reachable(b, blocks, pos, 0).sort((x, y) => x - y)).toEqual([0, 3, 6]);
    expect(findExit(b, blocks, pos, 0)).toBeNull(); // boxed in, away from the gap
    // The bar can slide right into column 2 and drop out of the bottom.
    expect(findExit(b, blocks, pos, 1)).toEqual({ x: 2, y: 0, side: 'bottom' });
  });
});

describe('solver', () => {
  test('blocks that can leave straight away take one move each', () => {
    const board: Board = { w: 3, h: 3, gaps: [gap('top', 0, 3)] };
    const blocks = [block('dot', 0, 2), block('bar2h', 1, 0)];
    const res = solve(board, blocks, startPos(blocks))!;
    expect(res.moves.length).toBe(2);
  });

  test('a blocker has to be moved aside first', () => {
    // Only a one wide gap at the top of column 0. The bar sits right under it and is
    // two wide, so it can never leave there: a second gap on the right lets it out.
    const board: Board = { w: 3, h: 3, gaps: [gap('top', 0, 1), gap('right', 2, 1)] };
    const blocks = [block('dot', 0, 2), block('bar2h', 0, 1), block('dot', 2, 0)];
    const res = solve(board, blocks, startPos(blocks))!;
    expect(res).not.toBeNull();
    expect(res.moves.length).toBeGreaterThanOrEqual(3);
    expect(res.moves.filter((m) => m.to === null).length).toBe(3);
  });

  test('a block with no gap it fits makes the board unsolvable', () => {
    const board: Board = { w: 3, h: 3, gaps: [gap('top', 0, 1)] };
    const blocks = [block('square', 0, 0)];
    expect(solve(board, blocks, startPos(blocks))).toBeNull();
  });

  test('solutions replay through a session', () => {
    const board: Board = { w: 4, h: 4, gaps: [gap('left', 1, 1), gap('bottom', 2, 2)] };
    const blocks = [block('bar2h', 0, 1), block('square', 2, 0), block('dot', 1, 3), block('bar2v', 0, 2)];
    const res = solve(board, blocks, startPos(blocks))!;
    const s = new Session(lvl(4, 4, board.gaps, blocks, res.moves.length));
    for (const m of res.moves) expect(m.to ? s.commit(m.block, m.to) : s.leave(m.block)).toBeTruthy();
    expect(s.won).toBe(true);
    expect(s.stars()).toBe(3);
  });
});

describe('session', () => {
  test('moves, undo and stars', () => {
    // A 3x3 board with one gap, at the right end of the top row.
    const gaps = [gap('right', 0, 1)];
    const blocks = [block('dot', 0, 0), block('bar2h', 0, 2)];
    const s = new Session(lvl(3, 3, gaps, blocks, 2));
    expect(s.commit(0, { x: 0, y: 0 })).toBe(false); // nowhere new
    expect(s.leave(1, { x: 0, y: 2 })).toBeNull(); // no gap on row 2
    expect(s.leave(0)).toBe('right'); // straight along row 0
    expect(s.moves).toBe(1);
    expect(s.commit(1, { x: 1, y: 1 })).toBe(true);
    expect(s.undo()).toBe(true);
    expect(s.pos[1]).toEqual({ x: 0, y: 2 });
    expect(s.moves).toBe(2); // undone moves still count
    expect(s.leave(1, { x: 1, y: 0 })).toBe('right'); // slide up and out in one move
    expect(s.won).toBe(true);
    expect(s.moves).toBe(3);
    expect(s.stars()).toBe(2); // par 2, and 3 is within par + 25% rounded up
  });
});

describe('levels', () => {
  test('specs: tutorials first, gates from their intro level', () => {
    for (let n = 1; n <= TUTORIAL_COUNT; n++) expect(squeezeSpecFor(n).tip).toBeTruthy();
    expect(squeezeSpecFor(GATE_INTRO).gates).toBe(1);
    for (let n = 1; n < GATE_INTRO; n++) expect(squeezeSpecFor(n).gates).toBe(0);
    expect(rateSqueeze(0)).toBe('Easy');
    expect(rateSqueeze(9)).toBe('Super Hard');
  });

  test('generated levels are deterministic, solvable and par counts every block', () => {
    for (const n of [1, 2, 3, 5, 6, 11, 20, 27, 34]) {
      const a = buildSqueezeLevel(n);
      expect(buildSqueezeLevel(n)).toEqual(a);
      const board: Board = { w: a.w, h: a.h, gaps: a.gaps };
      const res = solve(board, a.blocks, startPos(a.blocks), 20000)!;
      expect(res, `level ${n}`).not.toBeNull();
      expect(res.moves.length).toBe(a.par);
      expect(a.par).toBeGreaterThanOrEqual(a.blocks.length);
      expect(a.score).toBe(a.par - a.blocks.length);
      const s = new Session(a);
      for (const m of res.moves) expect(m.to ? s.commit(m.block, m.to) : s.leave(m.block)).toBeTruthy();
      expect(s.won).toBe(true);
    }
  }, 60000);
});

describe('sliding', () => {
  test('a block slides until it meets a block or the frame', () => {
    const board: Board = { w: 5, h: 3, gaps: [] };
    const blocks = [block('bar2h', 2, 1), block('dot', 0, 1)];
    const occ = occupancy(board, blocks, startPos(blocks), 0);
    expect(slideRange(board, blocks, occ, 0, 2, 1, 'x')).toEqual({ lo: -1, hi: 1, exitLo: null, exitHi: null });
    expect(slideRange(board, blocks, occ, 0, 2, 1, 'y')).toEqual({ lo: -1, hi: 1, exitLo: null, exitHi: null });
  });

  test('an end is open only at a gap the block fits, with a clear way out', () => {
    const board: Board = { w: 4, h: 3, gaps: [gap('right', 1, 1), gap('top', 0, 1)] };
    const blocks = [block('bar2h', 0, 1), block('dot', 3, 0)];
    const occ = occupancy(board, blocks, startPos(blocks), 0);
    const r = slideRange(board, blocks, occ, 0, 0, 1, 'x');
    expect(r).toEqual({ lo: 0, hi: 2, exitLo: null, exitHi: 'right' });
    // Two wide never fits the one wide gap on top.
    expect(slideRange(board, blocks, occ, 0, 0, 1, 'y').exitLo).toBeNull();
    // The dot can go out of the top only from column 0, so not from where it is.
    const occ1 = occupancy(board, blocks, startPos(blocks), 1);
    expect(slideRange(board, blocks, occ1, 1, 3, 0, 'y').exitLo).toBeNull();
  });

  test('positions off the board are refused, even ones whose cell key wraps to another row', () => {
    const s = new Session(lvl(3, 3, [], [block('dot', 2, 0)]));
    expect(s.commit(0, { x: 3, y: 0 })).toBe(false); // key 3 is cell 0, 1
    expect(s.commit(0, { x: -1, y: 1 })).toBe(false); // key 2 is cell 2, 0
    expect(s.leave(0, { x: 3, y: 0 })).toBeNull();
    expect(s.commit(0, { x: 0, y: 1 })).toBe(true);
    expect(s.pos[0]).toEqual({ x: 0, y: 1 });
  });
});
