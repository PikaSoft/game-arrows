import { Rng } from '../../../shared/rng';
import { LoopSim } from './sim';
import { LoopLevel } from './types';

export type Outcome = 'settled' | 'jam' | 'won';

/**
 * Careful play: let the belt run, a slot at a time, until nothing more will happen
 * without another tap. The clock is ignored here.
 */
export function runUntilSettled(sim: LoopSim): Outcome {
  // A waiting chute jams within one lap and a wanted cube is collected within one lap,
  // so this always ends; the cap is only a backstop.
  for (let k = 0; k < sim.capacity * 200; k++) {
    if (sim.won) return 'won';
    if (sim.jammed) return 'jam';
    if (sim.settled) return 'settled';
    sim.shift();
  }
  return 'jam';
}

/** What matters about a settled belt, leaving out where exactly the cubes sit. */
function keyOf(sim: LoopSim): string {
  const counts = new Array(sim.level.colors).fill(0);
  for (const c of sim.belt) if (c >= 0) counts[c]++;
  return `${sim.next.join(',')}|${sim.bayIdx.join(',')}|${sim.fill.join(',')}|${counts.join(',')}`;
}

/** Columns worth trying, best first: crates whose cubes the front trays want now. */
function ordered(sim: LoopSim): number[] {
  const want = new Set<number>();
  for (let j = 0; j < sim.bayCount; j++) want.add(sim.frontTray(j));
  const cols: { col: number; hits: number }[] = [];
  for (let i = 0; i < sim.cols; i++) {
    if (!sim.canTap(i)) continue;
    const crate = sim.level.supply[i][sim.next[i]];
    cols.push({ col: i, hits: crate.filter((c) => want.has(c)).length });
  }
  return cols.sort((a, b) => b.hits - a.hits || a.col - b.col).map((c) => c.col);
}

/**
 * Find a tap order that clears the level when every tap waits for the belt to settle.
 * It plays the real belt, so the order it returns is one that works. `budget` caps the
 * taps tried, so every device gives the same answer. Null if none was found.
 */
export function solveLoop(level: LoopLevel, budget = 4000): number[] | null {
  const sim = new LoopSim({ ...level, limitTicks: 0 });
  const dead = new Set<string>();
  const path: number[] = [];
  let tried = 0;
  const search = (): boolean => {
    if (sim.won) return true;
    const key = keyOf(sim);
    if (dead.has(key)) return false;
    const snap = sim.snapshot();
    for (const col of ordered(sim)) {
      if (tried++ >= budget) return false;
      sim.tap(col);
      path.push(col);
      const out = runUntilSettled(sim);
      if (out === 'won' || (out === 'settled' && search())) return true;
      path.pop();
      sim.restore(snap);
    }
    dead.add(key);
    return false;
  };
  return search() ? path : null;
}

/**
 * Play a tap order carefully on the real belt. Returns the steps it took from the first
 * tap, or null if it jammed or ran out of taps before the last tray shipped.
 */
export function replay(level: LoopLevel, order: number[]): number | null {
  const sim = new LoopSim({ ...level, limitTicks: 0 });
  for (const col of order) {
    if (!sim.tap(col)) return null;
    const out = runUntilSettled(sim);
    if (out === 'jam') return null;
    if (out === 'won') break;
  }
  return sim.won ? (sim.rot + 1) * level.ticksPerSlot : null;
}

/**
 * How risky the level is: the share of taps that jam the belt in careful but random
 * games. A game picks any column that still has crates, waits for the belt to settle,
 * and repeats until it wins or jams.
 */
export function blunderRate(level: LoopLevel, rng: Rng, runs = 40): number {
  let jams = 0;
  let taps = 0;
  for (let r = 0; r < runs; r++) {
    const sim = new LoopSim({ ...level, limitTicks: 0 });
    for (;;) {
      const open: number[] = [];
      for (let i = 0; i < sim.cols; i++) if (sim.canTap(i)) open.push(i);
      if (!open.length) break;
      sim.tap(rng.pick(open));
      taps++;
      const out = runUntilSettled(sim);
      if (out === 'jam') {
        jams++;
        break;
      }
      if (out === 'won') break;
    }
  }
  return taps ? jams / taps : 0;
}
