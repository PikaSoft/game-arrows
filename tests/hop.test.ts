import { beforeEach, describe, expect, test } from 'vitest';
import { HELP } from '../src/games/help';
import { buildLevel, COLS, LOOP, MID_ROW, NEST_COLS, NEST_ROW, padState, PAD_CYCLE, RIVER_ROWS, ROAD_ROWS, spansAt, START_ROW } from '../src/games/hop/core/lanes';
import { planCrossing, playPlan } from '../src/games/hop/core/planner';
import { HopSim, LIFE_TIME, NEST_POINTS, ROW_POINTS, START_LIVES, STEP_HZ } from '../src/games/hop/core/sim';
import { HOP_KEY, loadHop, recordGame, resetHop } from '../src/games/hop/game/storage';

/** Step until the chick is back at the start (after a fall or a nest). */
const settle = (s: HopSim) => {
  while (s.wait > 0 && !s.over) s.step();
};

/** Gaps between neighbouring things in a lane, going round the loop. */
function gaps(lane: ReturnType<typeof buildLevel>['lanes'][number]): number[] {
  const things = [...lane.things].sort((a, b) => a.offset - b.offset);
  return things.map((t, i) => {
    const next = things[(i + 1) % things.length];
    const end = t.offset + t.len;
    let g = next.offset - end;
    if (g < 0) g += LOOP;
    return i === things.length - 1 && things.length === 1 ? LOOP - t.len : g;
  });
}

describe('lanes', () => {
  test('the same level number builds the same lanes', () => {
    expect(buildLevel(9)).toEqual(buildLevel(9));
    expect(buildLevel(9)).not.toEqual(buildLevel(10));
  });

  test('every lane is laid sensibly, levels 1 to 40', () => {
    for (let n = 1; n <= 40; n++) {
      const spec = buildLevel(n);
      expect(spec.lanes.map((l) => l.row).sort((a, b) => a - b)).toEqual([...RIVER_ROWS, ...ROAD_ROWS]);
      for (const lane of spec.lanes) {
        const len = lane.things.reduce((a, t) => a + t.len, 0);
        const g = gaps(lane);
        expect(len + g.reduce((a, b) => a + b, 0)).toBeCloseTo(LOOP, 6);
        if (lane.kind === 'road') {
          // Room to stand between any two cars.
          for (const x of g) expect(x).toBeGreaterThanOrEqual(2 - 1e-9);
        } else {
          // Never a long wait for the next log or raft.
          for (const x of g) expect(x).toBeLessThanOrEqual(3.2 + 1e-9);
        }
      }
      // Lanes next to each other go opposite ways.
      for (const rows of [RIVER_ROWS, ROAD_ROWS]) {
        for (let i = 1; i < rows.length; i++) {
          const a = spec.lanes.find((l) => l.row === rows[i - 1])!;
          const b = spec.lanes.find((l) => l.row === rows[i])!;
          expect(a.dir).toBe(-b.dir);
        }
      }
      const pads = spec.lanes.filter((l) => l.kind === 'pads').length;
      expect(pads).toBe(n >= 7 ? 2 : n >= 3 ? 1 : 0);
    }
  });

  test('pads spend most of their time afloat', () => {
    const th = { offset: 0, len: 2, phase: 0, look: 0 };
    let up = 0;
    for (let t = 0; t < PAD_CYCLE; t += 0.01) if (padState(th, t) !== 2) up++;
    expect(up / (PAD_CYCLE / 0.01)).toBeGreaterThan(0.7);
  });

  test('things wrap round: what leaves one side comes back on the other', () => {
    const lane = buildLevel(1).lanes[0];
    const covered = (t: number) => spansAt(lane, t).reduce((a, s) => a + Math.max(0, Math.min(s.right, COLS) - Math.max(s.left, 0)), 0);
    // Coverage on the board changes as things come and go, but the loop is always full.
    const period = LOOP / lane.speed;
    expect(covered(0)).toBeCloseTo(covered(period), 6);
  });
});

describe('hopping', () => {
  test('hops move a cell; the start bank is the bottom and the sides are walls', () => {
    const s = new HopSim(1);
    const x0 = s.x;
    s.hop(2);
    expect(s.row).toBe(START_ROW);
    s.hop(3);
    expect(s.x).toBe(x0 - 1);
    for (let k = 0; k < STEP_HZ; k++) s.step();
    for (let i = 0; i < 8; i++) {
      s.hop(3);
      for (let k = 0; k < STEP_HZ / 4; k++) s.step();
    }
    expect(s.x).toBe(0.5);
  });

  test('a second hop pressed straight after the first waits and then goes', () => {
    const s = new HopSim(1);
    s.hop(1);
    s.hop(3);
    expect(s.queued).toBe(3);
    const x = s.x;
    for (let k = 0; k < STEP_HZ / 4; k++) s.step();
    expect(s.x).toBe(x - 1);
  });

  test('a car costs a life, then a new chick sets off from the start', () => {
    const s = new HopSim(1);
    const lane = s.lane(ROAD_ROWS[ROAD_ROWS.length - 1])!;
    s.row = lane.row;
    const sp = spansAt(lane, s.time + 1 / STEP_HZ).find((x) => x.left > 0.5 && x.right < COLS - 0.5) ?? spansAt(lane, s.time)[0];
    s.x = (sp.left + sp.right) / 2;
    const ev = s.step();
    expect(ev.died).toBe('car');
    expect(s.lives).toBe(START_LIVES - 1);
    settle(s);
    expect(s.row).toBe(START_ROW);
    expect(s.clock).toBe(LIFE_TIME);
  });

  test('open water costs a life; a log carries the chick along', () => {
    const s = new HopSim(1);
    const lane = s.lane(RIVER_ROWS[RIVER_ROWS.length - 1])!;
    s.row = lane.row;
    // Find a moment with a log well on the board, and stand on it.
    let sp = null;
    for (let k = 0; k < 2000 && !sp; k++) {
      sp = spansAt(lane, s.time).find((x) => x.left > 1 && x.right < COLS - 1) ?? null;
      if (!sp) s.time += 0.01;
    }
    s.x = (sp!.left + sp!.right) / 2;
    const x = s.x;
    s.step();
    expect(s.lives).toBe(START_LIVES);
    expect(Math.sign(s.x - x)).toBe(lane.dir);
    // Now into the water between logs.
    const t = new HopSim(1);
    t.row = lane.row;
    t.time = s.time;
    const spans = spansAt(lane, t.time).sort((a, b) => a.left - b.left);
    const gap = spans.findIndex((a, i) => i > 0 && a.left - spans[i - 1].right > 0.8 && a.left > 0.5 && spans[i - 1].right < COLS - 0.5);
    if (gap > 0) {
      t.x = (spans[gap].left + spans[gap - 1].right) / 2;
      expect(t.step().died).toBe('water');
    }
  });

  test('the hedge between nests, and a full nest, cost a life; an empty nest scores', () => {
    const s = new HopSim(1);
    s.row = NEST_ROW + 1;
    s.x = NEST_COLS[0] + 1.5; // between nests 0 and 1
    s.row = NEST_ROW;
    expect(s.step().died).toBe('bank');
    settle(s);
    const t = new HopSim(1);
    t.row = NEST_ROW;
    t.x = NEST_COLS[2] + 0.5;
    const before = t.score;
    const ev = t.step();
    expect(ev.nest).toBe(2);
    expect(t.score - before).toBeGreaterThanOrEqual(NEST_POINTS);
    settle(t);
    t.row = NEST_ROW;
    t.x = NEST_COLS[2] + 0.5;
    expect(t.step().died).toBe('bank');
  });

  test('new rows score once per life', () => {
    const s = new HopSim(1);
    s.hop(0);
    expect(s.score).toBe(ROW_POINTS);
    for (let k = 0; k < STEP_HZ / 4; k++) s.step();
    s.hop(2);
    for (let k = 0; k < STEP_HZ / 4; k++) s.step();
    s.hop(0);
    expect(s.score).toBe(ROW_POINTS);
  });

  test('running out of time costs a life, and three lost lives end the game', () => {
    const s = new HopSim(1);
    let lost = 0;
    while (!s.over) {
      const ev = s.step();
      if (ev.died) {
        expect(ev.died).toBe('time');
        lost++;
      }
    }
    expect(lost).toBe(START_LIVES);
    expect(s.time).toBeGreaterThan(LIFE_TIME * START_LIVES);
  });

  test('the middle bank is safe', () => {
    const s = new HopSim(4);
    s.row = MID_ROW;
    for (let k = 0; k < STEP_HZ * 5; k++) expect(s.step().died).toBeNull();
  });
});

describe('every level can be crossed', () => {
  test('a planner fills all four nests on levels 1 to 25 without losing a life', () => {
    for (let n = 1; n <= 25; n++) {
      const s = new HopSim(n);
      for (let nest = 0; nest < NEST_COLS.length; nest++) {
        const plan = planCrossing(s);
        expect(plan, `level ${n} nest ${nest + 1}`).not.toBeNull();
        expect(playPlan(s, plan!), `level ${n} nest ${nest + 1}`).toBe(true);
        settle(s);
      }
      expect(s.level).toBe(n + 1);
      expect(s.lives).toBe(START_LIVES);
    }
  }, 120_000);
});

describe('help', () => {
  test('the first tip is in How to play', async () => {
    const { FIRST_TIP } = await import('../src/games/hop/ui');
    expect(HELP.hop.tips).toContain(FIRST_TIP);
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

  test('keeps bests and totals, and resets', () => {
    const p = loadHop();
    expect(recordGame(p, 900, 3, 9)).toBe(0);
    expect(recordGame(p, 400, 4, 5)).toBe(900);
    expect(loadHop()).toEqual({ best: 900, bestLevel: 4, homes: 14, runs: 2 });
    expect(JSON.parse(mem.get(HOP_KEY)!).runs).toBe(2);
    resetHop(p);
    expect(loadHop()).toEqual({ best: 0, bestLevel: 0, homes: 0, runs: 0 });
  });
});
