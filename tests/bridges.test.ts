import { beforeEach, describe, expect, test } from 'vitest';
import { bridgesScore, bridgesSpecFor, ISOLATION_INTRO, rateBridges, TRIAL_INTRO, TUTORIAL_COUNT } from '../src/games/bridges/core/difficulty';
import { buildBridgesLevel, layOut } from '../src/games/bridges/core/levels';
import { connected, crossings, isSolved, links } from '../src/games/bridges/core/rules';
import { nextBridges, solveLogic, TIER_NAMES } from '../src/games/bridges/core/solver';
import { BridgesLevel, Island } from '../src/games/bridges/core/types';
import { Session, START_HEARTS } from '../src/games/bridges/game/session';
import { BRIDGES_KEY, loadBridges, recordBridgesClear, resetBridges } from '../src/games/bridges/game/storage';
import { Rng } from '../src/shared/rng';

/** A puzzle from a picture: digits are islands, dots water. */
function parse(rows: string[]): { w: number; h: number; islands: Island[] } {
  const islands: Island[] = [];
  rows.forEach((r, y) => [...r].forEach((ch, x) => ch !== '.' && islands.push({ x, y, n: Number(ch) })));
  return { w: rows[0].length, h: rows.length, islands };
}

describe('rules', () => {
  test('links join each island to the nearest one right and below, never neighbours', () => {
    const { w, h, islands } = parse(['2.2', '...', '2.2']);
    const ls = links(w, h, islands);
    expect(ls).toHaveLength(4);
    expect(ls.every((l) => l.cells.length === 1)).toBe(true);
    const nb = parse(['11', '..']);
    expect(links(nb.w, nb.h, nb.islands)).toHaveLength(0);
  });

  test('a link across crosses a link down when they share a square', () => {
    const { w, h, islands } = parse(['.1.', '1.1', '.1.']);
    const ls = links(w, h, islands);
    const cross = crossings(ls);
    expect(ls).toHaveLength(2);
    expect(cross[0]).toEqual([1]);
  });

  test('a solution meets every number, never crosses and joins everything', () => {
    const { w, h, islands } = parse(['2.2', '...', '2.2']);
    const ls = links(w, h, islands);
    // A ring of single bridges.
    expect(isSolved(islands, ls, [1, 1, 1, 1])).toBe(true);
    expect(isSolved(islands, ls, [2, 0, 0, 2])).toBe(false);
    expect(connected(4, ls, [2, 0, 0, 2])).toBe(false);
  });
});

describe('solver', () => {
  test('counting: a 4 in a corner needs two bridges each way', () => {
    const { w, h, islands } = parse(['4.2', '...', '2..']);
    const p = { islands, links: links(w, h, islands) };
    const r = solveLogic(p, 1);
    expect(r.bridges).toEqual([2, 2]);
    expect(r.hardest).toBe(1);
  });

  test('isolation: two 1s may not join when other islands need them', () => {
    // Joining the two 1s would finish them both and cut them off from the 2s; counting alone
    // also allows that (with a double bridge between the 2s).
    const { w, h, islands } = parse(['1.1', '...', '2.2']);
    const p = { islands, links: links(w, h, islands) };
    expect(solveLogic(p, 1).bridges).toBeNull();
    const r = solveLogic(p, 2);
    expect(isSolved(islands, p.links, r.bridges!)).toBe(true);
    expect(r.bridges![0]).toBe(0);
    expect(r.hardest).toBe(2);
  });

  test('every step has a name', () => {
    for (let t = 1; t <= 3; t++) expect(TIER_NAMES[t]).toBeTruthy();
  });

  test('layouts never put islands side by side', () => {
    const spec = bridgesSpecFor(30);
    for (let k = 0; k < 20; k++) {
      const isl = layOut(spec, new Rng(k));
      if (!isl) continue;
      for (const a of isl) for (const b of isl) if (a !== b) expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeGreaterThan(1);
    }
  });
});

describe('levels', () => {
  test('specs ramp and bring in each step on its level', () => {
    for (let n = 1; n <= 150; n++) {
      const s = bridgesSpecFor(n);
      expect(s.w).toBeLessThanOrEqual(9);
      expect(s.h).toBeLessThanOrEqual(12);
      if (n < ISOLATION_INTRO) expect(s.target).toBe(1);
      if (n < TRIAL_INTRO) expect(s.target).toBeLessThanOrEqual(2);
    }
    expect(bridgesSpecFor(ISOLATION_INTRO).target).toBe(2);
  });

  test('levels 1 to 60 build, have one answer, need their steps and are the same built twice', () => {
    for (let n = 1; n <= 60; n++) {
      const l = buildBridgesLevel(n);
      expect(l.links).toEqual(links(l.w, l.h, l.islands));
      expect(isSolved(l.islands, l.links, l.solution), `level ${n}`).toBe(true);
      const r = solveLogic(l);
      expect(r.bridges).toEqual(l.solution);
      expect(bridgesScore(r.hardest, r.trials)).toBe(l.score);
      if (r.hardest > 1) expect(solveLogic(l, r.hardest - 1).bridges).toBeNull();
      expect(l.difficulty).toBe(n <= TUTORIAL_COUNT ? 'Tutorial' : rateBridges(l.score!));
      if (n % 10 === 0) expect(buildBridgesLevel(n)).toEqual(l);
    }
  }, 120_000);
});

describe('session', () => {
  const level = (): BridgesLevel => buildBridgesLevel(6);

  test('right bridges are built, wrong ones cost a heart, and the rules refuse the rest', () => {
    const l = level();
    const s = new Session(l);
    const good = l.solution.findIndex((v) => v > 0);
    expect(s.build(good)).toEqual({ ok: true, outOfHearts: false });
    const bad = l.solution.findIndex((v, k) => v === 0 && !s.cross[k].some((j) => s.bridges[j]));
    if (bad >= 0) {
      expect(s.build(bad)).toEqual({ ok: false, outOfHearts: false });
      expect(s.bridges[bad]).toBe(0);
      expect(s.hearts).toBe(START_HEARTS - 1);
    }
    // A link that crosses a built bridge is refused for free.
    const crossing = s.cross[good][0];
    if (crossing !== undefined) expect(s.build(crossing)).toEqual({ blocked: 'cross' });
  });

  test('building the solution wins with the hearts left as stars', () => {
    const l = level();
    const s = new Session(l);
    l.solution.forEach((v, k) => {
      for (let i = 0; i < v; i++) s.build(k);
    });
    expect(s.won).toBe(true);
    expect(s.stars()).toBe(3);
    expect(s.islandsDone).toBe(l.islands.length);
    expect(s.build(0)).toBeNull();
  });

  test('hints build bridges the rules can work out, for free', () => {
    const l = buildBridgesLevel(30);
    const s = new Session(l);
    const before = s.bridges.slice();
    const next = nextBridges(l, before);
    const k = s.hint()!;
    expect(next).toContain(k);
    expect(s.bridges[k]).toBe(1);
    expect(s.hearts).toBe(START_HEARTS);
    while (s.hints) s.hint();
    expect(s.hint()).toBeNull();
    for (let j = 0; j < l.links.length; j++) expect(s.bridges[j]).toBeLessThanOrEqual(l.solution[j]);
  });

  test('out of hearts waits for a choice; keeping going earns no stars', () => {
    const l = level();
    const s = new Session(l);
    const zero = l.solution.map((v, k) => (v === 0 ? k : -1)).filter((k) => k >= 0);
    if (zero.length < 3) return;
    for (const k of zero.slice(0, 3)) s.build(k);
    expect(s.awaitingContinue).toBe(true);
    s.continueWithoutHearts();
    l.solution.forEach((v, k) => {
      for (let i = 0; i < v; i++) s.build(k);
    });
    expect(s.won).toBe(true);
    expect(s.stars()).toBe(0);
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
    const p = loadBridges();
    recordBridgesClear(p, 1, 2, 1, 5000);
    recordBridgesClear(p, 1, 3, 0, 6000);
    expect(p.levels[1]).toEqual({ stars: 3, bestMoves: 0, bestMs: 5000 });
    expect(JSON.parse(mem.get(BRIDGES_KEY)!).unlocked).toBe(2);
    resetBridges(p);
    expect(loadBridges()).toEqual({ unlocked: 1, current: 1, levels: {} });
  });
});
