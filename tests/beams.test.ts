import { beforeEach, describe, expect, test } from 'vitest';
import { BEAM_THRESHOLDS, beamSpecFor, CRYSTAL_INTRO, rateBeams, TUTORIAL_COUNT } from '../src/games/beams/core/difficulty';
import { buildBeamLevel, MAX_SOLUTIONS } from '../src/games/beams/core/levels';
import { entry, reflect, status, trace } from '../src/games/beams/core/rules';
import { solve } from '../src/games/beams/core/solver';
import { BeamLevel, Cell, CRYSTAL, EMPTY, FIXED, MIRROR, Orient, WALL } from '../src/games/beams/core/types';
import { Session } from '../src/games/beams/game/session';
import { BEAMS_KEY, loadBeams, recordBeamsClear, resetBeams } from '../src/games/beams/game/storage';

const E = EMPTY;
const M = MIRROR;

/**
 * A 3x3 board. The red lamp shines in from the left on the middle row; the target is on
 * the top edge above the middle column. A mirror in the centre must be `/` to send it up.
 */
function small(cells: Cell[], start: Orient[]): BeamLevel {
  return {
    number: 1,
    w: 3,
    h: 3,
    cells,
    start,
    solution: start,
    beams: [{ colour: 0, lamp: { side: 3, pos: 1 }, target: { side: 0, pos: 1 } }],
    par: 1,
    difficulty: 'Tutorial',
  };
}

describe('rules', () => {
  test('mirrors reflect the way they lean', () => {
    // `/`: east turns north, north turns east, west turns south.
    expect(reflect(1, 0)).toBe(0);
    expect(reflect(0, 0)).toBe(1);
    expect(reflect(3, 0)).toBe(2);
    // `\`: east turns south, north turns west.
    expect(reflect(1, 1)).toBe(2);
    expect(reflect(0, 1)).toBe(3);
    for (const o of [0, 1] as Orient[]) for (let d = 0; d < 4; d++) expect(reflect(reflect(d, o) ^ 2, o)).toBe(d ^ 2);
  });

  test('lamps shine inward from every side', () => {
    expect(entry(4, 3, { side: 0, pos: 2 })).toEqual({ cell: 2, dir: 2 });
    expect(entry(4, 3, { side: 1, pos: 1 })).toEqual({ cell: 7, dir: 3 });
    expect(entry(4, 3, { side: 2, pos: 0 })).toEqual({ cell: 8, dir: 0 });
    expect(entry(4, 3, { side: 3, pos: 2 })).toEqual({ cell: 8, dir: 1 });
  });

  test('traces a beam through mirrors, off the board or into a wall', () => {
    const cells: Cell[] = [E, E, E, E, M, E, E, E, E];
    const b = small(cells, [0, 0, 0, 0, 1, 0, 0, 0, 0]);
    const wrong = trace(b, b.start, b.beams[0].lamp);
    expect(wrong.cells).toEqual([3, 4, 7]);
    expect(wrong.exit).toEqual({ side: 2, pos: 1 });
    const right = trace(b, [0, 0, 0, 0, 0, 0, 0, 0, 0], b.beams[0].lamp);
    expect(right.exit).toEqual({ side: 0, pos: 1 });
    const walled = small([E, W(), E, E, M, E, E, E, E], b.start);
    const t = trace(walled, [0, 0, 0, 0, 0, 0, 0, 0, 0], walled.beams[0].lamp);
    expect(t.exit).toBeNull();
    expect(t.cells).toEqual([3, 4]);
  });

  test('a board is solved when every beam reaches its target and every crystal is lit', () => {
    const b = small([E, E, E, CRYSTAL, M, E, E, E, E], [0, 0, 0, 0, 1, 0, 0, 0, 0]);
    expect(status(b, b.start).solved).toBe(false);
    const st = status(b, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(st.solved).toBe(true);
    expect(st.lit.has(3)).toBe(true);
    const unlit = small([E, E, E, E, M, E, E, E, CRYSTAL], [0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(status(unlit, unlit.start).solved).toBe(false);
  });
});

function W(): Cell {
  return WALL;
}

describe('solver', () => {
  test('finds the one tap that solves a small board', () => {
    const b = small([E, E, E, E, M, E, E, E, E], [0, 0, 0, 0, 1, 0, 0, 0, 0]);
    const r = solve(b, b.start);
    expect(r.taps).toBe(1);
    expect(r.solutions).toBe(1);
    expect(status(b, r.orient!).solved).toBe(true);
  });

  test('a pinned mirror the wrong way makes a board impossible', () => {
    const b = small([E, E, E, E, FIXED, E, E, E, E], [0, 0, 0, 0, 1, 0, 0, 0, 0]);
    expect(solve(b, b.start).taps).toBeNull();
  });

  test('mirrors no beam touches are never turned', () => {
    const b = small([M, E, M, E, M, E, M, E, M], [1, 0, 1, 0, 1, 0, 0, 0, 1]);
    const r = solve(b, b.start);
    expect(r.taps).toBe(1);
    expect(r.orient![0]).toBe(1);
    expect(r.orient![8]).toBe(1);
  });
});

describe('levels', () => {
  test('specs ramp and stay in range, and crystals arrive on their level', () => {
    for (let n = 1; n <= 150; n++) {
      const s = beamSpecFor(n);
      expect(s.w).toBeGreaterThanOrEqual(4);
      expect(s.w).toBeLessThanOrEqual(8);
      expect(s.h).toBeLessThanOrEqual(9);
      if (n < CRYSTAL_INTRO) expect(s.crystals).toBe(0);
    }
    expect(beamSpecFor(CRYSTAL_INTRO).crystals).toBe(1);
  });

  test('levels 1 to 60 build, solve, start unsolved, and are the same when built twice', () => {
    for (let n = 1; n <= 60; n++) {
      const l = buildBeamLevel(n);
      expect(l.number).toBe(n);
      expect(l.cells).toHaveLength(l.w * l.h);
      expect(status(l, l.start).solved, `level ${n} starts solved`).toBe(false);
      expect(status(l, l.solution).solved, `level ${n} solution`).toBe(true);
      const r = solve(l, l.start);
      expect(r.taps).toBe(l.par);
      expect(r.solutions).toBeLessThanOrEqual(MAX_SOLUTIONS);
      // Pinned mirrors start the right way.
      for (let i = 0; i < l.cells.length; i++) if (l.cells[i] === FIXED) expect(l.start[i]).toBe(l.solution[i]);
      if (n <= TUTORIAL_COUNT) expect(l.difficulty).toBe('Tutorial');
      else expect(l.difficulty).toBe(rateBeams(l.score!));
      if (n % 10 === 0) expect(buildBeamLevel(n)).toEqual(l);
    }
  }, 120_000);

  test('labels follow the thresholds', () => {
    expect(rateBeams(BEAM_THRESHOLDS[0] - 0.1)).toBe('Easy');
    expect(rateBeams(BEAM_THRESHOLDS[0])).toBe('Medium');
    expect(rateBeams(BEAM_THRESHOLDS[2])).toBe('Super Hard');
  });
});

describe('session', () => {
  test('taps turn mirrors, undo counts, and par gives stars', () => {
    const s = new Session(small([M, E, E, E, M, E, E, E, FIXED], [0, 0, 0, 0, 1, 0, 0, 0, 0]));
    expect(s.tap(8)).toBe(false); // pinned
    expect(s.tap(1)).toBe(false); // empty
    expect(s.tap(0)).toBe(true); // a mirror no beam touches
    expect(s.undo()).toBe(0);
    expect(s.orient[0]).toBe(0);
    expect(s.won).toBe(false);
    expect(s.tap(4)).toBe(true);
    expect(s.won).toBe(true);
    expect(s.moves).toBe(2);
    expect(s.stars()).toBe(2);
    expect(s.tap(4)).toBe(false);
    expect(s.undo()).toBeNull();
  });

  test('a hint turns a needed mirror, pins it and counts as a tap', () => {
    const l = buildBeamLevel(6);
    const s = new Session(l);
    const i = s.hint()!;
    expect(l.cells[i]).toBe(MIRROR);
    expect(s.locked[i]).toBe(true);
    expect(s.moves).toBe(1);
    expect(s.tap(i)).toBe(false);
    // Following hints alone always finishes within par (if there are enough of them).
    while (!s.won && s.hints > 0) s.hint();
    if (s.won) expect(s.moves).toBeLessThanOrEqual(l.par);
    const r = solve(l, s.orient);
    expect(r.taps).toBe(l.par - s.moves);
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

  test('records clears and resets', () => {
    const p = loadBeams();
    recordBeamsClear(p, 1, 2, 9, 5000);
    recordBeamsClear(p, 1, 3, 7, 6000);
    expect(p.levels[1]).toEqual({ stars: 3, bestMoves: 7, bestMs: 5000 });
    expect(JSON.parse(mem.get(BEAMS_KEY)!).unlocked).toBe(2);
    resetBeams(p);
    expect(loadBeams()).toEqual({ unlocked: 1, current: 1, levels: {} });
  });
});
