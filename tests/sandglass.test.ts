import { describe, expect, test } from 'vitest';
import { HIDDEN_INTRO, LIQUID_INTRO, rateSand, sandSpecFor, TUTORIAL_COUNT } from '../src/games/sandglass/core/difficulty';
import { buildSandLevel } from '../src/games/sandglass/core/levels';
import { canPour, isSolved, pour, pourAmount, sandCount, usefulMoves } from '../src/games/sandglass/core/rules';
import { runsOver, solve } from '../src/games/sandglass/core/solver';
import { isLiquid, LIQUID_BASE, SandLevel } from '../src/games/sandglass/core/types';
import { Session } from '../src/games/sandglass/game/session';

const lvl = (bottles: number[][], capacity = 4, hidden?: number[], par = 3): SandLevel => ({
  number: 99,
  capacity,
  colors: 2,
  bottles,
  hidden: hidden ?? bottles.map(() => 0),
  par,
  difficulty: 'Easy',
});

describe('pour rules', () => {
  test('only onto an empty bottle or the same colour, with room', () => {
    const b = [[0, 1], [1], [0], [], [1, 1, 1, 1]];
    expect(canPour(b, 4, 0, 1)).toBe(true); // 1 onto 1
    expect(canPour(b, 4, 0, 2)).toBe(false); // 1 onto 0
    expect(canPour(b, 4, 0, 3)).toBe(true); // into empty
    expect(canPour(b, 4, 0, 4)).toBe(false); // full
    expect(canPour(b, 4, 3, 0)).toBe(false); // nothing to pour
    expect(canPour(b, 4, 0, 0)).toBe(false);
  });

  test('moves the whole top run, as much as fits', () => {
    const b = [[0, 1, 1, 1], [0, 0, 1]];
    expect(pourAmount(b, 4, 0, 1)).toBe(1); // only one space
    expect(pour(b, 4, 0, 1)).toBe(1);
    expect(b).toEqual([[0, 1, 1], [0, 0, 1, 1]]);
    const c = [[0, 1, 1], []];
    expect(pour(c, 4, 0, 1)).toBe(2);
    expect(c).toEqual([[0], [1, 1]]);
  });

  test('useful moves skip pointless ones and duplicate empties', () => {
    const b = [[0, 0], [1, 0], [], []];
    const m = usefulMoves(b, 4);
    expect(m).toContainEqual([1, 0]);
    expect(m).toContainEqual([1, 2]);
    expect(m).not.toContainEqual([1, 3]); // same as pouring into bottle 2
    expect(m).not.toContainEqual([0, 2]); // a one-colour bottle into an empty one
  });
});

describe('liquids', () => {
  const A = LIQUID_BASE;
  const B = LIQUID_BASE + 1;

  test('only the top colour pours, so liquid goes before the sand under it', () => {
    const b = [[0, 0, A], [], [0]];
    expect(canPour(b, 4, 0, 2)).toBe(false); // the liquid on top cannot land on sand
    expect(pour(b, 4, 0, 1)).toBe(1);
    expect(b).toEqual([[0, 0], [A], [0]]);
    expect(pour(b, 4, 0, 2)).toBe(2);
    expect(b).toEqual([[], [A], [0, 0, 0]]);
  });

  test('sand sinks below liquid onto matching sand, or to the bottom', () => {
    const b = [[1, 1], [1, A, A], [B], [2, B]];
    expect(canPour(b, 4, 0, 1)).toBe(true);
    expect(pour(b, 4, 0, 1)).toBe(1); // only one space left
    expect(b[1]).toEqual([1, 1, A, A]);
    expect(pour(b, 4, 0, 2)).toBe(1); // a bottle holding only liquid
    expect(b[2]).toEqual([1, B]);
    expect(canPour([[1], [2, B]], 4, 0, 1)).toBe(false); // the sand under the liquid is another colour
  });

  test('liquid lands only on the same liquid or in an empty bottle', () => {
    const b = [[0, A], [A], [B], [0], []];
    expect(canPour(b, 4, 0, 1)).toBe(true);
    expect(canPour(b, 4, 0, 2)).toBe(false);
    expect(canPour(b, 4, 0, 3)).toBe(false);
    expect(canPour(b, 4, 0, 4)).toBe(true);
    expect(pourAmount([[A, A, A], [A, A]], 4, 0, 1)).toBe(2);
  });

  test('a board with liquids solves to one colour per bottle', () => {
    const start = [[0, 1, A], [1, 0, A], [0, 1, A], [], []];
    const res = solve(start, 3)!;
    expect(res).not.toBeNull();
    const b = start.map((x) => x.slice());
    for (const [f, t] of res.moves) expect(pour(b, 3, f, t)).toBeGreaterThan(0);
    expect(isSolved(b, 3)).toBe(true);
  });

  test('liquid levels arrive later, never with covered sand, and deal settled bottles', () => {
    for (let n = 1; n < LIQUID_INTRO; n++) expect(sandSpecFor(n).liquids).toBe(0);
    expect(sandSpecFor(LIQUID_INTRO).liquids).toBe(2);
    let count = 0;
    for (let n = LIQUID_INTRO; n <= 150; n++) {
      const s = sandSpecFor(n);
      if (s.liquids) count++;
      if (s.liquids) expect(s.hidden).toBe(false);
    }
    expect(count).toBeGreaterThan(15);
    for (const n of [LIQUID_INTRO, 59, 72]) {
      const a = buildSandLevel(n);
      expect(a).toEqual(buildSandLevel(n));
      expect(new Set(a.bottles.flat().filter(isLiquid)).size).toBe(a.liquids);
      for (const bottle of a.bottles) expect(bottle.slice(sandCount(bottle)).every(isLiquid)).toBe(true);
      expect(solve(a.bottles, a.capacity)).not.toBeNull();
    }
    expect(buildSandLevel(LIQUID_INTRO).difficulty).not.toBe('Tutorial');
  }, 120000);
});

describe('solver', () => {
  test('finds the shortest solution on a small board', () => {
    const start = [[0, 1, 0, 1], [1, 0, 1, 0], [], []];
    const res = solve(start, 4)!;
    expect(res.optimal).toBe(true);
    expect(res.moves.length).toBeGreaterThanOrEqual(runsOver(start));
    const b = start.map((x) => x.slice());
    for (const [f, t] of res.moves) expect(pour(b, 4, f, t)).toBeGreaterThan(0);
    expect(isSolved(b, 4)).toBe(true);
  });

  test('reports unsolvable boards', () => {
    expect(solve([[0, 1], [1, 0]], 2)).toBeNull();
  });
});

describe('session', () => {
  test('counts moves, undo keeps the count, invalid pours are refused', () => {
    const s = new Session(lvl([[0, 1, 1, 0], [1, 0, 0, 1], []]));
    expect(s.pour(0, 1).kind).toBe('invalid');
    expect(s.moves).toBe(0);
    expect(s.pour(0, 2).kind).toBe('pour');
    expect(s.moves).toBe(1);
    expect(s.undo()).toBe(true);
    expect(s.bottles).toEqual([[0, 1, 1, 0], [1, 0, 0, 1], []]);
    expect(s.moves).toBe(1);
    expect(s.undo()).toBe(false);
  });

  test('covered layers reveal and stay revealed after undo', () => {
    // Bottle 0: two covered layers under a visible top.
    const s = new Session(lvl([[1, 0, 1], [0, 0, 1], [], [1, 0]], 4, [2, 2, 0, 1]));
    expect(s.isHidden(0, 1)).toBe(true);
    s.pour(0, 2); // the 1 on top goes, layer 1 (colour 0) shows
    expect(s.isHidden(0, 1)).toBe(false);
    expect(s.isHidden(0, 0)).toBe(true);
    s.undo();
    expect(s.isHidden(0, 1)).toBe(false);
  });

  test('matching sand under a revealed layer shows with it', () => {
    const s = new Session(lvl([[0, 0, 1], [], [1]], 4, [2, 0, 0]));
    s.pour(0, 2);
    expect(s.isHidden(0, 0)).toBe(false);
  });

  test('stars by moves; the extra bottle caps at two', () => {
    const solved = () => new Session(lvl([[0, 0, 1, 1], [1, 1, 0, 0], []], 4, undefined, 3));
    const s = solved();
    s.pour(0, 2);
    s.pour(1, 0);
    s.pour(1, 2);
    expect(s.won).toBe(true);
    expect(s.stars()).toBe(3);
    const t = solved();
    expect(t.addBottle()).toBe(true);
    expect(t.addBottle()).toBe(false);
    t.pour(0, 2);
    t.pour(1, 0);
    t.pour(1, 2);
    expect(t.won).toBe(true);
    expect(t.stars()).toBe(2);
    const u = solved();
    for (let i = 0; i < 6; i++) {
      u.pour(0, 2);
      u.undo();
    }
    u.pour(0, 2);
    u.pour(1, 0);
    u.pour(1, 2);
    expect(u.moves).toBe(9);
    expect(u.stars()).toBe(1);
  });

  test('stuck when no useful pour is left', () => {
    const s = new Session(lvl([[0, 1], [1, 0]], 2));
    expect(s.stuck).toBe(true);
    s.addBottle();
    expect(s.stuck).toBe(false);
  });

  test('stuck when the only pour shuttles one colour between two bottles', () => {
    // Bottles 0 and 1 can only trade a single 2 back and forth; 2 and 3 are dead.
    const s = new Session(lvl([[0, 2, 2], [1, 2], [0, 1], [1, 1, 0]], 3));
    expect(s.noMoves).toBe(false);
    expect(s.shuttling).toBe(true);
    expect(s.stuck).toBe(true);
    s.pour(0, 1);
    expect(s.shuttling).toBe(true);
    s.addBottle();
    expect(s.stuck).toBe(false);
  });

  test('not stuck when a back-and-forth pour can lead somewhere', () => {
    // Pouring the 1 from bottle 0 onto bottle 1 frees bottle 0's 0 to join bottle 2.
    const s = new Session(lvl([[0, 1], [1], [0]], 2));
    expect(s.shuttling).toBe(false);
    expect(s.stuck).toBe(false);
  });

  test('undo history follows an added bottle', () => {
    const s = new Session(lvl([[0, 1, 1, 0], [1, 0, 0, 1], []]));
    s.pour(0, 2);
    s.addBottle();
    s.undo();
    expect(s.bottles).toEqual([[0, 1, 1, 0], [1, 0, 0, 1], [], []]);
  });
});

describe('levels', () => {
  test('spec ramps colours and capacity, and introduces covered sand', () => {
    expect(sandSpecFor(1).colors).toBe(2);
    expect(sandSpecFor(HIDDEN_INTRO).hidden).toBe(true);
    let caps = new Set<number>();
    for (let n = 1; n <= 120; n++) caps.add(sandSpecFor(n).capacity);
    expect([...caps].sort()).toEqual([4, 5, 6]);
    expect(rateSand(1)).toBe('Easy');
    expect(rateSand(3)).toBe('Super Hard');
  });

  test('levels are deterministic, complete and solvable', () => {
    for (const n of [1, 2, 3, 4, 5, 9, 17, HIDDEN_INTRO, 33, 47]) {
      const a = buildSandLevel(n);
      const b = buildSandLevel(n);
      expect(a).toEqual(b);
      // Every colour fills exactly one bottle.
      const counts = new Map<number, number>();
      for (const bottle of a.bottles) for (const c of bottle) counts.set(c, (counts.get(c) ?? 0) + 1);
      expect(counts.size).toBe(a.colors);
      for (const v of counts.values()) expect(v).toBe(a.capacity);
      expect(solve(a.bottles, a.capacity)).not.toBeNull();
      expect(a.par).toBeGreaterThan(0);
      if (n <= TUTORIAL_COUNT) expect(a.difficulty).toBe('Tutorial');
    }
  }, 120000);
});
