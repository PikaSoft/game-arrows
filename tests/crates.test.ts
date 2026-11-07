import { describe, expect, test } from 'vitest';
import { Rng } from '../src/shared/rng';
import { CRATE_THRESHOLDS, rateCrates, TUTORIAL_COUNT } from '../src/games/crates/core/difficulty';
import { buildCrateLevel } from '../src/games/crates/core/levels';
import { carveRoom } from '../src/games/crates/core/room';
import { liveCells, reach, Room, walkPath } from '../src/games/crates/core/rules';
import { lowerBound, pullAll, solve } from '../src/games/crates/core/solver';
import { CrateLevel } from '../src/games/crates/core/types';
import { Session } from '../src/games/crates/game/session';
import { CRATES_KEY, loadCrates, recordCratesClear, resetCrates } from '../src/games/crates/game/storage';

/** Build a room from a picture: # wall, . target, $ crate, * crate on target, @ player. */
function parse(rows: string[]): { room: Room; targets: number[]; crates: number[]; player: number } {
  const h = rows.length;
  const w = rows[0].length;
  const walls: boolean[] = [];
  const targets: number[] = [];
  const crates: number[] = [];
  let player = -1;
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const i = y * w + x;
      walls.push(ch === '#');
      if (ch === '.' || ch === '*') targets.push(i);
      if (ch === '$' || ch === '*') crates.push(i);
      if (ch === '@') player = i;
    }),
  );
  return { room: { w, h, walls }, targets, crates, player };
}

const level = (rows: string[], par = 1): CrateLevel => {
  const p = parse(rows);
  return { number: 1, w: p.room.w, h: p.room.h, walls: p.room.walls as boolean[], targets: p.targets, crates: p.crates, player: p.player, par, difficulty: 'Easy' };
};

describe('rules', () => {
  const p = parse(['######', '#@ $.#', '######']);

  test('walking goes round crates, not through them', () => {
    expect(walkPath(p.room, p.crates, p.player, 8)).toEqual([8]);
    expect(walkPath(p.room, p.crates, p.player, 10)).toBeNull();
  });

  test('reach stops at crates', () => {
    const blocked = new Uint8Array(18);
    blocked[9] = 1;
    const r = reach(p.room, blocked, 7);
    expect(r[8]).toBe(1);
    expect(r[10]).toBe(0);
  });

  test('corners that are not targets are dead for crates', () => {
    const q = parse(['#####', '#   #', '# . #', '#   #', '#####']);
    const live = liveCells(q.room, q.targets);
    expect(live[6]).toBe(0); // top-left corner
    expect(live[7]).toBe(0); // against the top wall: it can only slide along it, never down
    expect(live[12]).toBe(1); // the target
  });
});

describe('solver', () => {
  test('one crate in a corridor takes one push', () => {
    const p = parse(['######', '#@ $.#', '######']);
    const r = solve(p.room, p.targets, p.crates, p.player)!;
    expect(r.pushes).toEqual([{ from: 9, dir: 1 }]);
  });

  test('a crate stuck in a corner has no solution', () => {
    const p = parse(['#####', '#$  #', '# .@#', '#####']);
    expect(solve(p.room, p.targets, p.crates, p.player)).toBeNull();
  });

  test('pulling backward gives exact pars that the forward search agrees with', () => {
    const rng = new Rng(4);
    for (let k = 0; k < 6; k++) {
      const carved = carveRoom(8, 8, rng, 14, 2);
      if (!carved) continue;
      const floor = carved.walls.map((x, i) => (x ? -1 : i)).filter((i) => i >= 0);
      const targets = rng.shuffle(floor).slice(0, 2).sort((a, b) => a - b);
      const all = pullAll(carved, targets, 2000);
      for (const pos of [all[all.length - 1], all[all.length >> 1]]) {
        const r = solve(carved, targets, pos.crates, pos.area)!;
        expect(r.pushes.length).toBe(pos.dist);
        expect(lowerBound(carved, targets, pos.crates)).toBeLessThanOrEqual(pos.dist);
      }
    }
  });
});

describe('levels', () => {
  const built = new Map<number, CrateLevel>();
  const get = (n: number) => {
    if (!built.has(n)) built.set(n, buildCrateLevel(n));
    return built.get(n)!;
  };
  const LAST = 24;

  test(`levels 1 to ${LAST} build, start unsolved, and par is the true fewest pushes`, () => {
    for (let n = 1; n <= LAST; n++) {
      const l = get(n);
      expect(l.walls.length).toBe(l.w * l.h);
      expect(l.crates.length).toBe(l.targets.length);
      expect(l.walls[l.player]).toBe(false);
      expect(l.crates.includes(l.player)).toBe(false);
      expect(l.crates.every((c) => l.targets.includes(c))).toBe(false);
      // The outer ring is wall, so a step can never leave the board.
      for (let x = 0; x < l.w; x++) expect(l.walls[x] && l.walls[(l.h - 1) * l.w + x]).toBe(true);
      for (let y = 0; y < l.h; y++) expect(l.walls[y * l.w] && l.walls[y * l.w + l.w - 1]).toBe(true);
      const r = solve({ w: l.w, h: l.h, walls: l.walls }, l.targets, l.crates, l.player, 400000)!;
      expect(r.pushes.length).toBe(l.par);
    }
  }, 60000);

  test('the same level is the same board every time', () => {
    for (const n of [1, 9, 20]) expect(buildCrateLevel(n)).toEqual(get(n));
  });

  test('tutorials are labelled, then the label follows the extra pushes', () => {
    for (let n = 1; n <= TUTORIAL_COUNT; n++) expect(get(n).difficulty).toBe('Tutorial');
    for (let n = TUTORIAL_COUNT + 1; n <= LAST; n++) expect(get(n).difficulty).toBe(rateCrates(get(n).score!));
  });

  test('labels by threshold', () => {
    expect(rateCrates(0)).toBe('Easy');
    expect(rateCrates(CRATE_THRESHOLDS[0])).toBe('Medium');
    expect(rateCrates(CRATE_THRESHOLDS[1])).toBe('Hard');
    expect(rateCrates(CRATE_THRESHOLDS[2])).toBe('Super Hard');
  });
});

describe('session', () => {
  test('walking, pushing and winning', () => {
    const s = new Session(level(['#######', '#@ $ .#', '#######'], 2));
    expect(s.move(1)).toEqual({ kind: 'walk' });
    expect(s.move(1)).toEqual({ kind: 'push', crate: 0 });
    expect(s.won).toBe(false);
    s.move(1);
    expect(s.won).toBe(true);
    expect(s.pushes).toBe(2);
    expect(s.steps).toBe(3);
    expect(s.stars()).toBe(3);
    expect(s.move(1)).toBeNull();
  });

  test("walls and crates two deep can't be pushed", () => {
    const s = new Session(level(['#######', '#@$$..#', '#######']));
    expect(s.move(1)).toBeNull();
    expect(s.move(3)).toBeNull(); // wall
    expect(s.pushes).toBe(0);
  });

  test('undo takes back the last push and the player with it', () => {
    const s = new Session(level(['#######', '#@ $ .#', '#######']));
    s.move(1);
    s.move(1);
    expect(s.undo()).toBe(true);
    expect(s.crates).toEqual([10]);
    expect(s.player).toBe(9);
    expect(s.pushes).toBe(1);
    expect(s.undo()).toBe(false);
  });

  test('route to a cell walks round crates', () => {
    const s = new Session(level(['######', '#@   #', '# $. #', '#    #', '######']));
    // From the top-left to the cell under the crate: down the left side, then across.
    const route = s.routeTo(20)!;
    expect(route.length).toBe(3);
    let at = s.player;
    for (const d of route) {
      at += [-6, 1, 6, -1][d];
      expect(s.crates).not.toContain(at);
    }
    expect(at).toBe(20);
    expect(s.routeTo(14)).toBeNull(); // the crate itself
  });

  test('a crate pushed where it can never reach a target is reported stuck', () => {
    // The crate can only reach the target straight down; pushed left against the wall it's done for.
    const s = new Session(level(['#####', '#   #', '# $@#', '# . #', '#####']));
    expect(s.stuck).toBe(false);
    s.move(3);
    expect(s.crates).toEqual([11]);
    expect(s.stuck).toBe(true);
    expect(s.hint()).toBeNull();
  });

  test('hints walk to and play the next push of a shortest solution, costing a star', () => {
    const s = new Session(level(['#######', '#@ $ .#', '#######'], 2));
    const route = s.hint()!;
    expect(route).toEqual([1, 1]);
    route.forEach((d) => s.move(d));
    expect(s.pushes).toBe(1);
    expect(s.hintsUsed).toBe(1);
    s.move(1);
    expect(s.won).toBe(true);
    expect(s.stars()).toBe(2);
  });

  test('hints alone solve a real level', () => {
    const s = new Session(buildCrateLevel(10));
    s.hints = 999;
    for (let k = 0; k < 200 && !s.won; k++) {
      const route = s.hint();
      expect(route).not.toBeNull();
      route!.forEach((d) => s.move(d));
    }
    expect(s.won).toBe(true);
    expect(s.pushes).toBe(s.level.par);
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
    const p = loadCrates();
    recordCratesClear(p, 1, 2, 12, 5000);
    recordCratesClear(p, 1, 3, 10, 7000);
    expect(p.levels[1]).toEqual({ stars: 3, bestMoves: 10, bestMs: 5000 });
    expect(JSON.parse(mem.get(CRATES_KEY)!).unlocked).toBe(2);
    resetCrates(p);
    expect(loadCrates()).toEqual({ unlocked: 1, current: 1, levels: {} });
  });
});
