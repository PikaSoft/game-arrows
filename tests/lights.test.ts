import { describe, expect, test } from 'vitest';
import { CROSS_INTRO, LIGHTS_THRESHOLDS, lightsScore, rateLights, THREE_INTRO, TUTORIAL_COUNT } from '../src/games/lights/core/difficulty';
import { buildLightsLevel } from '../src/games/lights/core/levels';
import { affected, allOff, press } from '../src/games/lights/core/rules';
import { solveMin } from '../src/games/lights/core/solver';
import { LightsLevel } from '../src/games/lights/core/types';
import { Session } from '../src/games/lights/game/session';
import { LIGHTS_KEY, loadLights, recordLightsClear, resetLights } from '../src/games/lights/game/storage';

/** Apply a tap count per tile to a board. */
const applyAll = (board: number[], w: number, h: number, pattern: 'plus' | 'cross', states: number, x: number[]) =>
  x.reduce((b, times, i) => (times ? press(b, w, h, pattern, states, i, times) : b), board);

describe('rules', () => {
  test('a tap reaches the tile and its sides, or its corners', () => {
    expect(affected(3, 3, 'plus', 4).sort()).toEqual([1, 3, 4, 5, 7]);
    expect(affected(3, 3, 'plus', 0).sort()).toEqual([0, 1, 3]);
    expect(affected(3, 3, 'cross', 4).sort()).toEqual([0, 2, 4, 6, 8]);
    expect(affected(3, 3, 'cross', 0).sort()).toEqual([0, 4]);
  });

  test('tapping twice (or three times on three-step lights) puts everything back', () => {
    const b = [0, 1, 0, 1, 1, 0, 0, 0, 1];
    expect(press(press(b, 3, 3, 'plus', 2, 4), 3, 3, 'plus', 2, 4)).toEqual(b);
    let c = b.slice();
    for (let k = 0; k < 3; k++) c = press(c, 3, 3, 'plus', 3, 2);
    expect(c).toEqual(b);
    expect(press(press(b, 3, 3, 'cross', 3, 2), 3, 3, 'cross', 3, 2, -1)).toEqual(b);
  });
});

describe('solver', () => {
  test('finds the single tap that made a board', () => {
    const b = press(new Array(9).fill(0), 3, 3, 'plus', 2, 4);
    const x = solveMin(3, 3, 'plus', 2, b)!;
    expect(x.reduce((a, v) => a + v, 0)).toBe(1);
    expect(x[4]).toBe(1);
  });

  test('its answer always turns the board off, for every pattern and step count', () => {
    for (const pattern of ['plus', 'cross'] as const) {
      for (const states of [2, 3]) {
        for (const [w, h] of [[4, 4], [5, 5], [5, 6], [6, 8]]) {
          let b = new Array(w * h).fill(0);
          for (const i of [0, 3, 7, w * h - 1]) b = press(b, w, h, pattern, states, i);
          const x = solveMin(w, h, pattern, states, b)!;
          expect(allOff(applyAll(b, w, h, pattern, states, x))).toBe(true);
          expect(x.reduce((a, v) => a + v, 0)).toBeLessThanOrEqual(4 * (states - 1));
        }
      }
    }
  });

  /** The true fewest taps, by trying every combination (small boards only). */
  const bruteMin = (board: number[], w: number, h: number, pattern: 'plus' | 'cross', states: number) => {
    const n = w * h;
    let best = Infinity;
    const x = new Array(n).fill(0);
    const total = Math.pow(states, n);
    for (let m = 0; m < total; m++) {
      let code = m;
      for (let i = 0; i < n; i++) {
        x[i] = code % states;
        code = Math.floor(code / states);
      }
      const taps = x.reduce((a, v) => a + v, 0);
      if (taps < best && allOff(applyAll(board, w, h, pattern, states, x))) best = taps;
    }
    return best;
  };

  test('the answer is the true shortest, even where boards have free choices', () => {
    // 4x4 with side taps has 4 free choices, 3x3 three-step corner taps has 2.
    const cases: [number, number, 'plus' | 'cross', number, number[]][] = [
      [4, 4, 'plus', 2, [0, 5, 10, 15, 3, 6, 9, 12, 1]],
      [4, 4, 'cross', 2, [0, 1, 2, 7, 11]],
      [3, 3, 'cross', 3, [0, 4, 4, 8, 2]],
      [3, 3, 'plus', 3, [1, 1, 3, 5, 7, 8]],
    ];
    for (const [w, h, pattern, states, made] of cases) {
      let b = new Array(w * h).fill(0);
      for (const i of made) b = press(b, w, h, pattern, states, i);
      const x = solveMin(w, h, pattern, states, b)!;
      expect(allOff(applyAll(b, w, h, pattern, states, x))).toBe(true);
      expect(x.reduce((a, v) => a + v, 0)).toBe(bruteMin(b, w, h, pattern, states));
    }
  });
});

describe('levels', () => {
  const built = new Map<number, LightsLevel>();
  const get = (n: number) => {
    if (!built.has(n)) built.set(n, buildLightsLevel(n));
    return built.get(n)!;
  };

  test('levels 1 to 80 build, start lit, and par really solves them', () => {
    for (let n = 1; n <= 80; n++) {
      const l = get(n);
      expect(l.board.length).toBe(l.w * l.h);
      expect(allOff(l.board)).toBe(false);
      expect(l.board.every((v) => v >= 0 && v < l.states)).toBe(true);
      const x = solveMin(l.w, l.h, l.pattern, l.states, l.board)!;
      expect(x.reduce((a, v) => a + v, 0)).toBe(l.par);
      expect(allOff(applyAll(l.board, l.w, l.h, l.pattern, l.states, x))).toBe(true);
    }
  });

  test('the same level is the same board every time', () => {
    for (const n of [1, 15, 30, 61]) expect(buildLightsLevel(n)).toEqual(get(n));
  });

  test('corner taps and three-step lights arrive on their intro levels, not before', () => {
    expect(get(CROSS_INTRO).pattern).toBe('cross');
    expect(get(THREE_INTRO).states).toBe(3);
    for (let n = 1; n < CROSS_INTRO; n++) expect(get(n).pattern).toBe('plus');
    for (let n = 1; n < THREE_INTRO; n++) expect(get(n).states).toBe(2);
  });

  test('tutorials are labelled, then the label follows the weighted par', () => {
    for (let n = 1; n <= TUTORIAL_COUNT; n++) expect(get(n).difficulty).toBe('Tutorial');
    for (let n = TUTORIAL_COUNT + 1; n <= 80; n++) {
      const l = get(n);
      expect(l.score).toBe(lightsScore(l.par, l.pattern, l.states));
      expect(l.difficulty).toBe(rateLights(l.score!));
    }
    expect(rateLights(LIGHTS_THRESHOLDS[0] - 1)).toBe('Easy');
    expect(rateLights(LIGHTS_THRESHOLDS[2])).toBe('Super Hard');
  });
});

describe('session', () => {
  const lvl = (): LightsLevel => ({
    number: 1,
    w: 3,
    h: 3,
    pattern: 'plus',
    states: 2,
    board: press(press(new Array(9).fill(0), 3, 3, 'plus', 2, 4), 3, 3, 'plus', 2, 0),
    par: 2,
    difficulty: 'Easy',
  });

  test('tapping the right tiles wins in par', () => {
    const s = new Session(lvl());
    expect(s.lit).toBeGreaterThan(0);
    s.tap(0);
    s.tap(4);
    expect(s.won).toBe(true);
    expect(s.stars()).toBe(3);
    expect(s.tap(1)).toBe(false);
  });

  test('undo turns back the last tap but still counts', () => {
    const s = new Session(lvl());
    const start = s.board.slice();
    s.tap(8);
    expect(s.undo()).toBe(8);
    expect(s.board).toEqual(start);
    expect(s.taps).toBe(1);
    expect(s.undo()).toBeNull();
  });

  test('hints point at a tile of a shortest solution and cost a star', () => {
    const s = new Session(lvl());
    const i = s.hint()!;
    expect([0, 4]).toContain(i);
    expect(s.hinted).toBe(i);
    s.tap(i);
    expect(s.hinted).toBeNull();
    s.tap(i === 0 ? 4 : 0);
    expect(s.won).toBe(true);
    expect(s.stars()).toBe(2);
  });

  test('following hints solves a real level in par', () => {
    const s = new Session(buildLightsLevel(33));
    s.hints = 999;
    for (let k = 0; k < 200 && !s.won; k++) s.tap(s.hint()!);
    expect(s.won).toBe(true);
    expect(s.taps).toBe(s.level.par);
  });

  test('stars from par', () => {
    const s = new Session({ ...lvl(), par: 8 });
    s.taps = 8;
    expect(s.stars()).toBe(3);
    s.taps = 10;
    expect(s.stars()).toBe(2);
    s.taps = 11;
    expect(s.stars()).toBe(1);
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
    const p = loadLights();
    recordLightsClear(p, 1, 2, 9, 5000);
    recordLightsClear(p, 1, 3, 7, 6000);
    expect(p.levels[1]).toEqual({ stars: 3, bestMoves: 7, bestMs: 5000 });
    expect(JSON.parse(mem.get(LIGHTS_KEY)!).unlocked).toBe(2);
    resetLights(p);
    expect(loadLights()).toEqual({ unlocked: 1, current: 1, levels: {} });
  });
});
