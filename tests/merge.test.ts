import { describe, expect, test } from 'vitest';
import { MergeGame, STONE_EVERY, STONE_FROM, STONE_LIFE } from '../src/games/merge/core/game';
import { Board, emptyBoard, lines, SIZE, slide, STONE, stuck } from '../src/games/merge/core/rules';
import { loadMerge, MERGE_KEY, noteBests, recordGame, resetMerge, RULES, saveMerge } from '../src/games/merge/game/storage';

/** A board with one row set (the rest empty). */
const row = (values: number[], r = 0): Board => {
  const b = emptyBoard();
  values.forEach((v, x) => (b.cells[r * SIZE + x] = v));
  return b;
};
const rowOf = (b: Board, r = 0) => b.cells.slice(r * SIZE, r * SIZE + SIZE);

describe('sliding', () => {
  test('lines run from the edge tiles move toward', () => {
    expect(lines(1)[0]).toEqual([4, 3, 2, 1, 0]); // right: row 0 from the right
    expect(lines(3)[0]).toEqual([0, 1, 2, 3, 4]); // left
    expect(lines(0)[0]).toEqual([0, 5, 10, 15, 20]); // up: column 0 from the top
  });

  test('tiles slide to the edge', () => {
    const r = slide(row([0, 3, 0, 1, 0]), 3);
    expect(rowOf(r.board)).toEqual([3, 1, 0, 0, 0]);
    expect(r.merges).toEqual([]);
    expect(r.changed).toBe(true);
  });

  test('two equal tiles that meet merge into one worth both', () => {
    const r = slide(row([2, 0, 0, 2, 0]), 3);
    expect(rowOf(r.board)).toEqual([4, 0, 0, 0, 0]);
    expect(r.gained).toBe(4);
    expect(r.merges).toEqual([{ at: 0, value: 4 }]);
  });

  test('merging starts from the edge tiles move toward', () => {
    expect(rowOf(slide(row([1, 1, 1, 0, 0]), 3).board)).toEqual([2, 1, 0, 0, 0]);
    expect(rowOf(slide(row([1, 1, 1, 0, 0]), 1).board)).toEqual([0, 0, 0, 1, 2]);
  });

  test('each tile merges once per swipe: four 2s make two 4s, not an 8', () => {
    expect(rowOf(slide(row([2, 2, 2, 2, 0]), 3).board)).toEqual([4, 4, 0, 0, 0]);
  });

  test('a new merged tile does not merge again in the same swipe', () => {
    // 1 1 2: the two 1s make a 2, which must not join the 2 behind it.
    expect(rowOf(slide(row([1, 1, 2, 0, 0]), 3).board)).toEqual([2, 2, 0, 0, 0]);
  });

  test('stones stay put and split a line', () => {
    const b = row([0, 1, STONE, 0, 1]);
    b.life[2] = 4;
    const r = slide(b, 3);
    expect(rowOf(r.board)).toEqual([1, 0, STONE, 1, 0]);
    // Tiles on either side can't merge through a stone.
    const c = row([1, STONE, 1, 0, 0]);
    expect(slide(c, 3).merges).toEqual([]);
  });

  test('a swipe that moves nothing does not change anything', () => {
    expect(slide(row([1, 3, 0, 0, 0]), 3).changed).toBe(false);
  });

  test('a full board with no two equal neighbours is stuck', () => {
    const b = emptyBoard();
    // A checkerboard of 1s and 2s: no two equal tiles side by side anywhere.
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) b.cells[y * SIZE + x] = (x + y) % 2 ? 2 : 1;
    expect(stuck(b)).toBe(true);
    b.cells[0] = 0;
    expect(stuck(b)).toBe(false);
  });
});

describe('game', () => {
  test('starts with a few tiles and gains a new one after each move', () => {
    const g = new MergeGame(1);
    const count = () => g.board.cells.filter((v) => v > 0).length;
    expect(count()).toBe(3);
    let moved = false;
    for (const d of [0, 1, 2, 3]) {
      const before = count();
      const r = g.swipe(d);
      if (!r) continue;
      expect(count()).toBe(before - r.merges.length + 1);
      expect(g.moves).toBe(1);
      moved = true;
      break;
    }
    expect(moved).toBe(true);
  });

  test('stones turn up on schedule and crumble after a few moves', () => {
    const g = new MergeGame(4);
    let seenStone = -1;
    let crumbledAt = -1;
    for (let k = 0; k < 200 && !g.over; k++) {
      const d = [0, 1, 2, 3].find((dir) => slide(g.board, dir).changed);
      if (d === undefined) break;
      const r = g.swipe(d)!;
      if (r.stone !== null && seenStone < 0) {
        seenStone = g.moves;
        expect(g.moves).toBe(STONE_FROM);
        expect(g.board.life[r.stone]).toBe(STONE_LIFE);
      }
      if (r.crumbled.length && crumbledAt < 0) crumbledAt = g.moves;
    }
    expect(seenStone).toBe(STONE_FROM);
    expect(crumbledAt).toBe(STONE_FROM + STONE_LIFE);
    expect(STONE_EVERY).toBeGreaterThan(STONE_LIFE);
  });

  test('a game can be saved and carried on', () => {
    const g = new MergeGame(7);
    for (const d of [0, 1, 2, 3, 0, 1]) g.swipe(d);
    const s = g.save();
    const h = new MergeGame(99, s);
    expect(h.board.cells).toEqual(g.board.cells);
    expect(h.score).toBe(g.score);
    expect(h.moves).toBe(g.moves);
  });

  test('games end, and a player who keeps space free lasts longer than random', () => {
    const play = (seed: number, smart: boolean) => {
      const g = new MergeGame(seed);
      let k = 0;
      while (!g.over && g.moves < 3000) {
        const options = [0, 1, 2, 3].filter((d) => slide(g.board, d).changed);
        let d = options[k++ % options.length];
        if (smart) d = options.sort((a, b) => slide(g.board, b).board.cells.filter((v) => !v).length - slide(g.board, a).board.cells.filter((v) => !v).length)[0];
        g.swipe(d);
      }
      return g;
    };
    let smart = 0;
    let dumb = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const a = play(seed, true);
      const b = play(seed, false);
      expect(a.over).toBe(true);
      expect(b.over).toBe(true);
      smart += a.moves;
      dumb += b.moves;
    }
    expect(smart).toBeGreaterThan(dumb);
  });
});

describe('storage', () => {
  test('keeps bests, counts games and the game in progress', () => {
    const mem = new Map<string, string>();
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => mem.set(k, v),
      removeItem: (k: string) => mem.delete(k),
    };
    const p = loadMerge();
    p.saved = new MergeGame(3).save();
    expect(noteBests(p, 120, 32)).toBe(true);
    saveMerge(p);
    expect(loadMerge().saved).not.toBeNull();
    recordGame(p, 90, 64);
    expect(p).toEqual({ rules: RULES, bestScore: 120, bestTile: 64, games: 1, saved: null });
    expect(JSON.parse(mem.get(MERGE_KEY)!).games).toBe(1);
    resetMerge(p);
    expect(loadMerge()).toEqual({ rules: RULES, bestScore: 0, bestTile: 0, games: 0, saved: null });
  });

  test('progress from the old three-tile rules starts afresh, keeping the games count', () => {
    const mem = new Map<string, string>();
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => mem.set(k, v),
      removeItem: (k: string) => mem.delete(k),
    };
    mem.set(MERGE_KEY, JSON.stringify({ bestScore: 300, bestTile: 81, games: 4, saved: { cells: [27], life: [0], score: 300, moves: 90 } }));
    expect(loadMerge()).toEqual({ rules: RULES, bestScore: 0, bestTile: 0, games: 4, saved: null });
  });
});
