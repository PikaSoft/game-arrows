import { describe, expect, test } from 'vitest';
import { Rng } from '../src/shared/rng';
import { COVERED_INTRO, LOOP_THRESHOLDS, loopSpecFor, MIXED_INTRO, rateLoop, TIMED_INTRO, TUTORIAL_COUNT } from '../src/games/loop/core/difficulty';
import { buildLoopLevel, deal, MIN_CAPACITY } from '../src/games/loop/core/levels';
import { balanced, chuteSlot, crateCount, intakeSlot, starsFor } from '../src/games/loop/core/rules';
import { LoopSim, SHIP_SLOTS, STEP_HZ } from '../src/games/loop/core/sim';
import { blunderRate, replay, runUntilSettled, solveLoop } from '../src/games/loop/core/solver';
import { CRATE, Crate, LoopLevel } from '../src/games/loop/core/types';
import { LOOP_KEY, loadLoop, recordLoopClear, resetLoop } from '../src/games/loop/game/storage';

const full = (c: number): Crate => new Array(CRATE).fill(c);
const lvl = (supply: Crate[][], bays: number[][], capacity: number, extra: Partial<LoopLevel> = {}): LoopLevel => ({
  number: 99,
  colors: 4,
  supply,
  bays,
  capacity,
  ticksPerSlot: 10,
  covered: false,
  limitTicks: 0,
  solution: [],
  difficulty: 'Easy',
  ...extra,
});
const shifts = (sim: LoopSim, n: number) => {
  for (let k = 0; k < n; k++) sim.shift();
};

describe('layout', () => {
  test('chutes sit on the top run and intakes on the bottom, each in its own slot', () => {
    for (const [cols, bays, cap] of [[2, 2, 8], [3, 2, 12], [3, 3, 12], [4, 3, 16], [4, 2, 32]]) {
      const chutes = Array.from({ length: cols }, (_, i) => chuteSlot(i, cols, cap));
      const intakes = Array.from({ length: bays }, (_, j) => intakeSlot(j, bays, cap));
      expect(new Set(chutes).size).toBe(cols);
      expect(new Set(intakes).size).toBe(bays);
      for (const c of chutes) expect(c).toBeLessThan(0.3 * cap);
      for (const i of intakes) {
        expect(i).toBeGreaterThanOrEqual(Math.floor(0.5 * cap));
        expect(i).toBeLessThan(0.8 * cap);
      }
      // The belt runs right to left along the bottom, so the left bay comes later.
      expect(intakes[0]).toBeGreaterThan(intakes[bays - 1]);
    }
  });
});

describe('belt', () => {
  test('a tipped crate drops a cube into each empty slot that passes', () => {
    // Neither front tray wants colour 1 yet, so the cubes stay on the belt.
    const s = new LoopSim(lvl([[full(1)], [full(0)]], [[0], [0, 1]], 8));
    expect(s.tap(0)).toBe(true);
    expect(s.chutes[0]).toEqual([1, 1, 1, 1]);
    shifts(s, 4);
    expect(s.chutes[0]).toEqual([]);
    expect(s.load).toBe(4);
    expect(s.cratesLeft).toBe(1);
    // The cubes ride round: after a full lap they are back where they were.
    const before = s.belt.slice();
    shifts(s, 8);
    expect(s.belt).toEqual(before);
    expect(s.canTap(5)).toBe(false);
  });

  test('the belt moves one slot every ticksPerSlot steps, and the clock starts on the first tap', () => {
    const s = new LoopSim(lvl([[full(1)]], [[1]], 8, { ticksPerSlot: 5 }));
    for (let k = 0; k < 20; k++) s.step();
    expect(s.rot).toBe(4);
    expect(s.ticks).toBe(0);
    s.tap(0);
    for (let k = 0; k < 5; k++) s.step();
    expect(s.ticks).toBe(5);
    expect(s.rot).toBe(5);
    expect(s.load).toBe(1);
  });

  test('a front tray picks up its colour, ships when full and the next slides up', () => {
    const s = new LoopSim(lvl([[full(0), full(1)]], [[0, 1]], 8));
    s.tap(0);
    let shipped = 0;
    let taken = 0;
    for (let k = 0; k < 16 && !shipped; k++) {
      const ev = s.shift();
      taken += ev.taken.length;
      shipped += ev.shipped.length;
    }
    expect(taken).toBe(4);
    expect(shipped).toBe(1);
    expect(s.frontTray(0)).toBe(1);
    expect(s.busy[0]).toBe(SHIP_SLOTS);
    expect(s.load).toBe(0);
    expect(s.traysLeft).toBe(1);
    expect(s.settled).toBe(false);
    shifts(s, SHIP_SLOTS);
    expect(s.settled).toBe(true);
    s.tap(0);
    expect(runUntilSettled(s)).toBe('won');
    expect(s.won).toBe(true);
    expect(s.canTap(0)).toBe(false);
  });

  test('cubes no front tray wants keep circling, and only the front tray collects', () => {
    const s = new LoopSim(lvl([[full(1), full(0)]], [[0, 1]], 8));
    s.tap(0);
    expect(runUntilSettled(s)).toBe('settled');
    expect(s.load).toBe(4);
    expect(s.fill[0]).toBe(0);
    s.tap(0);
    expect(runUntilSettled(s)).toBe('won');
    expect(s.load).toBe(0);
  });

  test('a chute that waits a whole lap with no empty slot jams the belt', () => {
    // Two crates of a colour nothing wants yet fill all 8 slots; the third cannot drop.
    const s = new LoopSim(lvl([[full(1), full(2), full(0)]], [[0, 1, 2]], 8));
    s.tap(0);
    s.tap(0);
    expect(runUntilSettled(s)).toBe('settled');
    expect(s.load).toBe(8);
    s.tap(0);
    let jam = 0;
    for (let k = 0; k < 8; k++) if (s.shift().jammed) jam = k + 1;
    expect(jam).toBe(8);
    expect(s.jammed).toBe(true);
    expect(s.over).toBe(true);
    expect(s.tap(0)).toBe(false);
  });

  test('a full belt does not jam while trays keep making room', () => {
    const s = new LoopSim(lvl([[full(1), full(2), full(0)]], [[0, 1, 2]], 10));
    s.tap(0);
    s.tap(0);
    runUntilSettled(s);
    s.tap(0);
    expect(runUntilSettled(s)).toBe('won');
  });

  test('the clock ends the level when it runs out', () => {
    const s = new LoopSim(lvl([[full(1), full(0)]], [[0, 1]], 8, { limitTicks: 30 }));
    for (let k = 0; k < 100; k++) s.step();
    expect(s.timeUp).toBe(false);
    s.tap(0);
    let at = 0;
    for (let k = 1; k <= 40 && !at; k++) if (s.step().timeUp) at = k;
    expect(at).toBe(30);
    expect(s.over).toBe(true);
  });

  test('a snapshot puts the belt back exactly, and clears a jam', () => {
    const s = new LoopSim(lvl([[full(1), full(2), full(0)]], [[0, 1, 2]], 8, { ticksPerSlot: 3 }));
    s.tap(0);
    for (let k = 0; k < 20; k++) s.step();
    const snap = s.snapshot();
    const copy = JSON.stringify(snap);
    s.tap(0);
    s.tap(0);
    for (let k = 0; k < 200; k++) s.step();
    expect(s.jammed).toBe(true);
    s.restore(snap);
    expect(s.jammed).toBe(false);
    expect(JSON.stringify(s.snapshot())).toBe(copy);
    // Playing on from the snapshot matches a fresh game given the same taps.
    const fresh = new LoopSim(s.level);
    fresh.tap(0);
    for (let k = 0; k < 20; k++) fresh.step();
    for (let k = 0; k < 50; k++) {
      s.step();
      fresh.step();
    }
    expect(s.snapshot()).toEqual(fresh.snapshot());
  });

  test('cube ids follow cubes round the belt', () => {
    const s = new LoopSim(lvl([[full(1)], [full(0)]], [[0], [0, 1]], 8));
    s.tap(0);
    const ev = s.shift();
    const id = ev.dropped[0].id;
    for (let k = 0; k < 5; k++) {
      expect(s.belt[s.placeOf(id)]).toBe(1);
      expect(s.idAt(s.placeOf(id))).toBe(id);
      s.shift();
    }
  });
});

describe('auto-finish', () => {
  test('the win is guaranteed once the cubes still to come fit in the empty slots', () => {
    const s = new LoopSim(lvl([[full(1), full(2), full(0)]], [[0, 1, 2]], 8, { limitTicks: 600 }));
    expect(s.guaranteed).toBe(false); // nothing tapped yet
    s.tap(0);
    expect(s.guaranteed).toBe(false); // 12 cubes to come, 8 slots
    runUntilSettled(s);
    expect(s.guaranteed).toBe(false); // 8 to come, 4 free
    const roomy = new LoopSim(lvl([[full(1), full(2), full(0)]], [[0, 1, 2]], 12, { limitTicks: 600 }));
    expect(roomy.guaranteed).toBe(false);
    roomy.tap(0);
    expect(roomy.guaranteed).toBe(true); // 12 to come, 12 free
    roomy.finish();
    expect(roomy.auto).toBe(true);
    expect(roomy.cratesLeft).toBe(0);
    expect(roomy.tap(0)).toBe(false);
    const ticks = roomy.ticks;
    for (let k = 0; k < 5000 && !roomy.over; k++) roomy.step();
    expect(roomy.won).toBe(true);
    // The clock stopped when the finish began, so it cannot run out.
    expect(roomy.ticks).toBe(ticks);
  });

  test('it is guaranteed when every crate is tipped and dropped', () => {
    const s = new LoopSim(lvl([[full(1), full(0)]], [[0, 1]], 8));
    s.tap(0);
    s.tap(0);
    expect(s.guaranteed).toBe(true);
    shifts(s, 3);
    expect(s.guaranteed).toBe(true);
    const done = new LoopSim(lvl([[full(0)]], [[0]], 8));
    done.tap(0);
    runUntilSettled(done);
    expect(done.guaranteed).toBe(false); // already won
  });

  test('finishing as soon as it is guaranteed never jams, on levels 1 to 60', () => {
    for (let n = 1; n <= 60; n++) {
      const level = buildLoopLevel(n);
      const sim = new LoopSim(level);
      let tapsMade = 0;
      for (const col of level.solution) {
        if (sim.auto) break;
        sim.tap(col);
        tapsMade++;
        while (!sim.over && !sim.settled && !sim.auto) {
          sim.step();
          if (sim.guaranteed) sim.finish();
        }
      }
      for (let k = 0; k < 20000 && !sim.over; k++) sim.step();
      expect(sim.won, `level ${n}`).toBe(true);
      expect(tapsMade, `level ${n}`).toBeGreaterThan(0);
      // The same from every point a rushed player might reach: tap everything at once
      // on a belt with room for it all.
      const big = new LoopSim({ ...level, capacity: crateCount(level) * CRATE, limitTicks: 0 });
      big.tap(0);
      expect(big.guaranteed).toBe(true);
      big.finish();
      for (let k = 0; k < 40000 && !big.over; k++) big.step();
      expect(big.won, `level ${n} all at once`).toBe(true);
    }
  });
});

describe('solver', () => {
  test('finds the order that keeps the belt clear, and knows a hopeless board', () => {
    // Both front crates are unwanted. On 8 slots only one of them may go before its partner.
    const level = lvl([[full(2), full(0)], [full(3), full(1)]], [[0, 2], [1, 3]], 8);
    const order = solveLoop(level)!;
    expect(order).not.toBeNull();
    expect(order.length).toBe(4);
    expect(replay(level, order)).toBeGreaterThan(0);
    expect(replay(level, [0, 1, 0, 1])).toBeNull();
    expect(replay(level, [0, 0])).toBeNull(); // not finished
    // Three unwanted crates in front of the one that is wanted: 8 slots can never do it.
    const stuck = lvl([[full(1), full(2), full(3), full(0)]], [[0, 1, 2, 3]], 8);
    expect(solveLoop(stuck)).toBeNull();
    expect(solveLoop({ ...stuck, capacity: 14 })).toEqual([0, 0, 0, 0]);
  });

  test('blunder rate is zero when nothing can go wrong and high when most taps jam', () => {
    const safe = lvl([[full(0), full(1)], [full(1), full(0)]], [[0, 0], [1, 1]], 16);
    expect(blunderRate(safe, new Rng(1))).toBe(0);
    const risky = lvl([[full(2), full(0)], [full(3), full(1)]], [[0, 2], [1, 3]], 8);
    const r = blunderRate(risky, new Rng(1), 200);
    expect(r).toBeGreaterThan(0.1);
    expect(r).toBeLessThan(0.4);
  });

  test('stars come from undos', () => {
    expect([0, 1, 2, 3, 9].map(starsFor)).toEqual([3, 2, 2, 1, 1]);
  });
});

describe('levels', () => {
  test('a deal has a crate for every tray and uses every colour', () => {
    const spec = { ...loopSpecFor(40), mixed: 2 };
    const d = deal(spec, new Rng(5));
    expect(d.supply.length).toBe(spec.cols);
    expect(d.bays.length).toBe(spec.bays);
    expect(balanced({ ...d, colors: spec.colors })).toBe(true);
    expect(crateCount(d)).toBe(spec.trays);
    expect(new Set(d.bays.flat()).size).toBe(spec.colors);
    const mixedCrates = d.supply.flat().filter((c) => new Set(c).size > 1);
    expect(mixedCrates.length).toBe(4);
  });

  test('levels 1 to 60 build, clear when replayed on the real belt, and are the same when built twice', () => {
    const labels = new Set<string>();
    for (let n = 1; n <= 60; n++) {
      const level = buildLoopLevel(n);
      const spec = loopSpecFor(n);
      expect(level.number).toBe(n);
      expect(balanced(level), `level ${n}`).toBe(true);
      expect(level.capacity).toBeGreaterThanOrEqual(MIN_CAPACITY);
      expect(level.capacity).toBeGreaterThanOrEqual(level.supply.length * 4);
      expect(level.solution.length, `level ${n}`).toBe(crateCount(level));
      const ticks = replay(level, level.solution);
      expect(ticks, `level ${n}`).not.toBeNull();
      // Played step by step with the clock running, a careful run finishes with time to spare.
      const sim = new LoopSim(level);
      for (const col of level.solution) {
        sim.tap(col);
        while (!sim.over && !sim.settled) sim.step();
      }
      expect(sim.won, `level ${n}`).toBe(true);
      if (level.limitTicks) expect(sim.ticks).toBeLessThan(level.limitTicks * 0.85);
      expect(level.limitTicks > 0).toBe(spec.timed);
      expect(level.covered).toBe(spec.covered);
      expect(level.tip).toBe(spec.tip);
      if (n <= TUTORIAL_COUNT) expect(level.difficulty).toBe('Tutorial');
      else {
        expect(level.difficulty).toBe(rateLoop(level.score!));
        labels.add(level.difficulty);
      }
      expect(buildLoopLevel(n)).toEqual(level);
    }
    expect(labels.size).toBeGreaterThanOrEqual(3);
  });

  test('the tutorials teach what their tips say', () => {
    // Level 1: nothing can go wrong, in any order.
    expect(blunderRate(buildLoopLevel(1), new Rng(2), 100)).toBe(0);
    // Level 3: tipping both front crates fills the belt.
    const three = buildLoopLevel(3);
    expect(replay(three, [0, 1, 0, 1])).toBeNull();
    // Level 4 can go wrong too.
    expect(blunderRate(buildLoopLevel(4), new Rng(2), 100)).toBeGreaterThan(0);
  });

  test('new ideas arrive on their own levels', () => {
    expect(loopSpecFor(TIMED_INTRO).timed).toBe(true);
    for (let n = 1; n < TIMED_INTRO; n++) expect(loopSpecFor(n).timed).toBe(false);
    expect(loopSpecFor(MIXED_INTRO).mixed).toBe(1);
    for (let n = 1; n < MIXED_INTRO; n++) expect(loopSpecFor(n).mixed).toBe(0);
    expect(loopSpecFor(COVERED_INTRO).covered).toBe(true);
    for (let n = 1; n < COVERED_INTRO; n++) expect(loopSpecFor(n).covered).toBe(false);
    const mixed = buildLoopLevel(MIXED_INTRO);
    expect(mixed.supply.flat().some((c) => new Set(c).size > 1)).toBe(true);
    expect(LOOP_THRESHOLDS).toEqual([...LOOP_THRESHOLDS].sort((a, b) => a - b));
    expect(STEP_HZ).toBe(60);
  });
});

describe('storage', () => {
  test('round trips and keeps the best of each', () => {
    const store = new Map<string, string>();
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    const p = loadLoop();
    expect(p).toEqual({ unlocked: 1, current: 1, levels: {} });
    recordLoopClear(p, 1, 2, 1, 30000);
    const again = recordLoopClear(p, 1, 3, 0, 40000);
    expect(again.newBestTime).toBe(false);
    expect(p.levels[1]).toEqual({ stars: 3, bestMoves: 0, bestMs: 30000 });
    expect(p.unlocked).toBe(2);
    expect(JSON.parse(store.get(LOOP_KEY)!)).toEqual(p);
    expect(loadLoop()).toEqual(p);
    resetLoop(p);
    expect(loadLoop()).toEqual({ unlocked: 1, current: 1, levels: {} });
  });
});
