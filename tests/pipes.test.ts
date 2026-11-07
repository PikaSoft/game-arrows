import { describe, expect, test } from 'vitest';
import { Rng } from '../src/shared/rng';
import { PIPE_THRESHOLDS, pipeSpecFor, ratePipes, TUTORIAL_COUNT } from '../src/games/pipes/core/difficulty';
import { buildPipeLevel, scramble } from '../src/games/pipes/core/levels';
import { degree, isSolved, looseEnds, parFor, rotate, rotateBy, turnsBetween, watered } from '../src/games/pipes/core/rules';
import { deduce, rate, search } from '../src/games/pipes/core/solver';
import { spanningTree } from '../src/games/pipes/core/tree';
import { E, N, PipeLevel, S, W } from '../src/games/pipes/core/types';
import { Session } from '../src/games/pipes/game/session';
import { loadPipes, PIPES_KEY, recordPipesClear, resetPipes } from '../src/games/pipes/game/storage';

describe('rules', () => {
  test('a quarter turn moves each opening one side clockwise', () => {
    expect(rotate(N)).toBe(E);
    expect(rotate(W)).toBe(N);
    expect(rotate(N | E)).toBe(E | S);
    expect(rotateBy(N | S, 2)).toBe(N | S);
    expect(rotateBy(N, 4)).toBe(N);
    expect(rotateBy(N, -1)).toBe(W);
  });

  test('turnsBetween counts the fewest clockwise turns', () => {
    expect(turnsBetween(N, W)).toBe(3);
    expect(turnsBetween(N | S, E | W)).toBe(1);
    expect(turnsBetween(N | E | S | W, N | E | S | W)).toBe(0);
    expect(turnsBetween(N, N | E)).toBe(-1);
  });

  // A 2x2 loop of corners would be a cycle; a 2x2 tree:  source(0) - 1, 0 - 2, 2 - 3.
  const tree = [E | S, W, N | E, W];
  test('solved board: everything wet, no loose ends', () => {
    expect(isSolved(2, 2, tree, 0)).toBe(true);
    expect(watered(2, 2, tree, 0).size).toBe(4);
  });
  test('one tile turned: loose ends and dry tiles', () => {
    const bad = tree.slice();
    bad[3] = rotate(bad[3]);
    expect(looseEnds(2, 2, bad)).toBeGreaterThan(0);
    expect(isSolved(2, 2, bad, 0)).toBe(false);
    expect(watered(2, 2, bad, 0).has(3)).toBe(false);
  });
  test('par sums the turns each tile needs', () => {
    const start = [rotateBy(tree[0], 1), tree[1], rotateBy(tree[2], 3), rotateBy(tree[3], 2)];
    expect(parFor(start, tree)).toBe(3 + 0 + 1 + 2);
  });
});

describe('solver', () => {
  test('a spanning tree covers every cell with one network', () => {
    const rng = new Rng(5);
    for (const [w, h] of [[3, 3], [5, 4], [8, 10]]) {
      const t = spanningTree(w, h, 0, rng);
      expect(isSolved(w, h, t, 0)).toBe(true);
      // A tree has one edge fewer than it has cells.
      expect(t.reduce((s, m) => s + degree(m), 0)).toBe(2 * (w * h - 1));
    }
  });

  test('search finds the solution from any scramble', () => {
    const rng = new Rng(9);
    const t = spanningTree(5, 5, 12, rng);
    const r = search(5, 5, scramble(t, rng), 2);
    expect(r.count).toBeGreaterThanOrEqual(1);
    expect(isSolved(5, 5, r.first!, 12)).toBe(true);
  });

  test('a 1x2 board with two end caps has exactly one solution', () => {
    const r = search(2, 1, [N, N], 2);
    expect(r.count).toBe(1);
    expect(r.first).toEqual([E, W]);
  });

  test('a board with no answer is rejected', () => {
    // Four end caps on a 2x2 can only pair up, leaving two separate networks: no answer.
    expect(search(2, 2, [N, N, N, N], 2).count).toBe(0);
  });

  test('deduce and rate solve generated boards without guessing', () => {
    const rng = new Rng(21);
    let rated = 0;
    for (let k = 0; k < 20; k++) {
      const t = spanningTree(6, 6, 14, rng);
      if (search(6, 6, t, 2).count !== 1) continue;
      const r = rate(6, 6, t);
      if (!r) continue;
      rated++;
      expect(r.score).toBeGreaterThanOrEqual(1);
      expect(deduce(6, 6, t).solved).toBe(true);
    }
    expect(rated).toBeGreaterThan(10);
  });
});

describe('levels', () => {
  const built = new Map<number, PipeLevel>();
  const level = (n: number) => {
    if (!built.has(n)) built.set(n, buildPipeLevel(n));
    return built.get(n)!;
  };

  test('levels 1 to 60 build, have one solution and start unsolved', () => {
    for (let n = 1; n <= 60; n++) {
      const l = level(n);
      const { w, h, tiles, solution, source } = l;
      expect(tiles.length).toBe(w * h);
      expect(isSolved(w, h, solution, source)).toBe(true);
      expect(isSolved(w, h, tiles, source)).toBe(false);
      // Each start tile is a turn of its solved tile.
      tiles.forEach((m, i) => expect(turnsBetween(m, solution[i])).toBeGreaterThanOrEqual(0));
      const r = search(w, h, tiles, 2, 50000);
      expect(r.exhausted).toBe(false);
      expect(r.count).toBe(1);
      expect(r.first).toEqual(solution);
      expect(l.par).toBe(parFor(tiles, solution));
      expect(l.par).toBeGreaterThan(0);
    }
  });

  test('the same level is the same board every time', () => {
    for (const n of [1, 7, 33, 58]) expect(buildPipeLevel(n)).toEqual(level(n));
  });

  test('tutorials are labelled, then the label follows the score', () => {
    for (let n = 1; n <= TUTORIAL_COUNT; n++) expect(level(n).difficulty).toBe('Tutorial');
    for (let n = TUTORIAL_COUNT + 1; n <= 60; n++) expect(level(n).difficulty).toBe(ratePipes(level(n).score!));
  });

  test('labels by threshold', () => {
    expect(ratePipes(1)).toBe('Easy');
    expect(ratePipes(PIPE_THRESHOLDS[0])).toBe('Medium');
    expect(ratePipes(PIPE_THRESHOLDS[1])).toBe('Hard');
    expect(ratePipes(PIPE_THRESHOLDS[2])).toBe('Super Hard');
  });

  test('boards grow and get harder over the first levels', () => {
    const early = [5, 6, 7, 8, 9].map((n) => pipeSpecFor(n).w * pipeSpecFor(n).h);
    const later = [40, 41, 42, 43, 44].map((n) => pipeSpecFor(n).w * pipeSpecFor(n).h);
    const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
    expect(avg(later)).toBeGreaterThan(avg(early));
    const labels = new Set(Array.from({ length: 56 }, (_, k) => level(k + 5).difficulty));
    expect(labels.size).toBeGreaterThanOrEqual(3);
  });
});

describe('session', () => {
  const lvl = (): PipeLevel => {
    const solution = [E | S, W, N | E, W];
    const tiles = [rotateBy(solution[0], 1), solution[1], rotateBy(solution[2], 3), rotateBy(solution[3], 2)];
    return { number: 1, w: 2, h: 2, tiles, source: 0, solution, par: parFor(tiles, solution), difficulty: 'Easy' };
  };

  test('tapping turns tiles and solving wins', () => {
    const s = new Session(lvl());
    expect(s.won).toBe(false);
    for (let k = 0; k < 3; k++) s.tap(0);
    s.tap(2);
    s.tap(3);
    s.tap(3);
    expect(s.won).toBe(true);
    expect(s.moves).toBe(6);
    expect(s.stars()).toBe(3);
    // No more taps once solved.
    expect(s.tap(1)).toBe(false);
  });

  test('locked tiles do not turn; locking is not a move', () => {
    const s = new Session(lvl());
    s.toggleLock(1);
    expect(s.tap(1)).toBe(false);
    expect(s.moves).toBe(0);
    s.toggleLock(1);
    expect(s.tap(1)).toBe(true);
  });

  test('undo turns back but still counts', () => {
    const s = new Session(lvl());
    s.tap(2);
    expect(s.undo()).toBe(2);
    expect(s.mask(2)).toBe(lvl().tiles[2]);
    expect(s.moves).toBe(1);
    expect(s.undo()).toBeNull();
  });

  test('hints turn a tile into place, lock it and count its turns', () => {
    const s = new Session(lvl());
    const i = s.hint()!;
    expect(s.mask(i)).toBe(s.level.solution[i]);
    expect(s.locked[i]).toBe(true);
    expect(s.hints).toBe(2);
    expect(s.moves).toBe(turnsBetween(s.level.tiles[i], s.level.solution[i]));
    s.hint();
    s.hint();
    expect(s.hint()).toBeNull();
  });

  test('stars from par', () => {
    const s = new Session(lvl());
    s.moves = s.level.par;
    expect(s.stars()).toBe(3);
    s.moves = Math.ceil(s.level.par * 1.25);
    expect(s.stars()).toBe(2);
    s.moves++;
    expect(s.stars()).toBe(1);
  });

  test('the hint path solves a real level', () => {
    const s = new Session(buildPipeLevel(12));
    s.hints = 999;
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
    const p = loadPipes();
    recordPipesClear(p, 1, 2, 20, 5000);
    recordPipesClear(p, 1, 3, 25, 4000);
    expect(p.levels[1]).toEqual({ stars: 3, bestMoves: 20, bestMs: 4000 });
    expect(p.unlocked).toBe(2);
    expect(JSON.parse(mem.get(PIPES_KEY)!).levels[1].stars).toBe(3);
    expect(loadPipes().levels[1].stars).toBe(3);
    resetPipes(p);
    expect(loadPipes()).toEqual({ unlocked: 1, current: 1, levels: {} });
  });
});
