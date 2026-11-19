import { beforeEach, describe, expect, test } from 'vitest';
import { rateTumble, SWITCH_INTRO, TUMBLE_THRESHOLDS, tumbleSpecFor, TUTORIAL_COUNT, WEAK_INTRO } from '../src/games/tumble/core/difficulty';
import { buildTumbleLevel, pressesSwitch } from '../src/games/tumble/core/levels';
import { bridgeOwner, covers, roll, startOpen, step } from '../src/games/tumble/core/rules';
import { solve } from '../src/games/tumble/core/solver';
import { ACROSS, Block, BRIDGE, DOWN, FLOOR, GOAL, NONE, STAND, SWITCH, TumbleLevel, WEAK } from '../src/games/tumble/core/types';
import { Session } from '../src/games/tumble/game/session';
import { loadTumble, recordTumbleClear, resetTumble, TUMBLE_KEY } from '../src/games/tumble/game/storage';

/** A board from a picture: . floor, # none, c cracked, s switch, b bridge (of switch 0), G goal. */
function board(rows: string[], start: Block, open = false): TumbleLevel {
  const w = rows[0].length;
  const tiles: number[] = [];
  let goal = -1;
  let sw = -1;
  const bridges: number[] = [];
  rows.forEach((r, y) =>
    [...r].forEach((ch, x) => {
      const i = y * w + x;
      tiles.push(ch === '.' ? FLOOR : ch === 'c' ? WEAK : ch === 's' ? SWITCH : ch === 'b' ? BRIDGE : ch === 'G' ? GOAL : NONE);
      if (ch === 'G') goal = i;
      if (ch === 's') sw = i;
      if (ch === 'b') bridges.push(i);
    }),
  );
  return {
    number: 1,
    w,
    h: rows.length,
    tiles,
    start,
    goal,
    switches: sw >= 0 ? [{ at: sw, bridges, open }] : [],
    par: 0,
    solution: [],
    difficulty: 'Tutorial',
  };
}

describe('rules', () => {
  test('tipping the block and tipping it back returns it', () => {
    for (const pose of [STAND, ACROSS, DOWN] as const)
      for (let d = 0; d < 4; d++) {
        const b: Block = { x: 5, y: 5, pose };
        expect(roll(roll(b, d), (d + 2) % 4)).toEqual(b);
      }
  });

  test('a standing block tips onto two squares; a lying one rolls or stands', () => {
    expect(covers(roll({ x: 2, y: 2, pose: STAND }, 1))).toEqual([[3, 2], [4, 2]]);
    expect(covers(roll({ x: 2, y: 2, pose: STAND }, 0))).toEqual([[2, 0], [2, 1]]);
    expect(roll({ x: 2, y: 2, pose: ACROSS }, 2)).toEqual({ x: 2, y: 3, pose: ACROSS });
    expect(roll({ x: 2, y: 2, pose: DOWN }, 2)).toEqual({ x: 2, y: 4, pose: STAND });
  });

  test('falls off edges, gaps and cracked squares; stands in the hole', () => {
    const l = board(['...cG'], { x: 0, y: 0, pose: STAND });
    const own = bridgeOwner(l.switches);
    expect(step(l, own, l.start, 0, 3).fell).toBe(true); // off the left edge
    const lying = step(l, own, l.start, 0, 1);
    expect(lying.fell).toBe(false);
    expect(lying.block).toEqual({ x: 1, y: 0, pose: ACROSS });
    // Standing up on the cracked square breaks it.
    const crack = step(l, own, lying.block, 0, 1);
    expect(crack.fell).toBe(true);
    expect(crack.broke).toBe(3);
    // Lying across the crack and the goal is fine; standing on the goal wins.
    const over = step(l, own, { x: 2, y: 0, pose: STAND }, 0, 1);
    expect(over.fell).toBe(false);
    // Lying across the crack and the hole, then standing up on the hole: a win.
    expect(step(l, own, { x: 2, y: 0, pose: ACROSS }, 0, 1).won).toBe(true);
    expect(step(l, own, { x: 3, y: 0, pose: ACROSS }, 0, 1).fell).toBe(true); // off the end
    const win = board(['..G'], { x: 0, y: 0, pose: ACROSS });
    expect(step(win, bridgeOwner([]), win.start, 0, 1).won).toBe(true);
  });

  test('a switch opens its bridges, and pressing it again closes them', () => {
    const l = board(['s..bb..G'], { x: 0, y: 0, pose: STAND });
    const own = bridgeOwner(l.switches);
    expect(startOpen(l.switches)).toBe(0);
    // Standing on the start switch doesn't press it; tipping onto it does.
    const off = step(l, own, l.start, 0, 1);
    expect(off.pressed).toEqual([]);
    const back = step(l, own, off.block, off.open, 3);
    expect(back.pressed).toEqual([0]);
    expect(back.open).toBe(1);
  });
});

describe('solver', () => {
  test('finds the shortest way, opening a bridge on the way', () => {
    // In one row a standing block only ever stands on every third square, so the hole is at 6.
    const l = board(['.s.bb.G'], { x: 0, y: 0, pose: STAND });
    const r = solve(l, l.start);
    expect(r.path).toEqual([1, 1, 1, 1]);
    expect(r.path).not.toBeNull();
    expect(pressesSwitch(l, l.start, r.path!)).toBe(true);
    // Without the switch the bridge stays shut and there's no way.
    const closed = board(['...bb.G'], { x: 0, y: 0, pose: STAND });
    expect(solve(closed, closed.start).path).toBeNull();
  });
});

describe('levels', () => {
  test('specs bring in cracked squares and switches on their levels', () => {
    for (let n = 1; n < WEAK_INTRO; n++) expect(tumbleSpecFor(n).weak).toBe(0);
    for (let n = 1; n < SWITCH_INTRO; n++) expect(tumbleSpecFor(n).switches).toBe(0);
    expect(tumbleSpecFor(WEAK_INTRO).weak).toBeGreaterThan(0);
    expect(tumbleSpecFor(SWITCH_INTRO).switches).toBe(1);
  });

  test('levels 1 to 60 build, their answers work and are shortest, and are the same built twice', () => {
    for (let n = 1; n <= 60; n++) {
      const l = buildTumbleLevel(n);
      const own = bridgeOwner(l.switches);
      let b = l.start;
      let o = startOpen(l.switches);
      let won = false;
      for (const d of l.solution) {
        const s = step(l, own, b, o, d);
        expect(s.fell, `level ${n}`).toBe(false);
        b = s.block;
        o = s.open;
        won = s.won;
      }
      expect(won).toBe(true);
      expect(l.par).toBe(l.solution.length);
      expect(solve(l, l.start).path!.length).toBe(l.par);
      if (l.switches.length) expect(pressesSwitch(l, l.start, l.solution)).toBe(true);
      expect(l.difficulty).toBe(n <= TUTORIAL_COUNT ? 'Tutorial' : rateTumble(l.score!));
      if (n % 10 === 0) expect(buildTumbleLevel(n)).toEqual(l);
    }
  });

  test('labels follow the thresholds', () => {
    expect(rateTumble(TUMBLE_THRESHOLDS[0] - 1)).toBe('Easy');
    expect(rateTumble(TUMBLE_THRESHOLDS[2])).toBe('Super Hard');
  });
});

describe('session', () => {
  test('moves, wasted moves, free undo and par stars', () => {
    const l = { ...board(['...G'], { x: 0, y: 0, pose: STAND }), par: 2 };
    const s = new Session(l);
    expect(s.move(3)!.fell).toBe(true);
    expect(s.block).toEqual(l.start);
    expect(s.moves).toBe(1);
    s.move(1);
    expect(s.undo()).toBe(true);
    expect(s.moves).toBe(1);
    s.move(1);
    s.move(1);
    expect(s.won).toBe(true);
    expect(s.moves).toBe(3);
    expect(s.stars()).toBe(2); // 3 moves is within par + 25% (rounded up)
  });

  test('following hints wins in par, each hint costing a star', () => {
    const l = buildTumbleLevel(20);
    const s = new Session(l);
    s.hints = 99;
    while (!s.won) {
      const d = s.hint()!;
      expect(s.move(d)!.fell).toBe(false);
    }
    expect(s.moves).toBe(l.par);
    expect(s.stars()).toBe(1);
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
    const p = loadTumble();
    recordTumbleClear(p, 1, 2, 9, 5000);
    recordTumbleClear(p, 1, 3, 7, 6000);
    expect(p.levels[1]).toEqual({ stars: 3, bestMoves: 7, bestMs: 5000 });
    expect(JSON.parse(mem.get(TUMBLE_KEY)!).unlocked).toBe(2);
    resetTumble(p);
    expect(loadTumble()).toEqual({ unlocked: 1, current: 1, levels: {} });
  });
});
