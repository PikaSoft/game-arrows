import { Dir, HopSim } from './sim';

/** The planner decides once per beat: a hop (or a wait), then this many steps. */
export const BEAT_STEPS = 15;

/**
 * Find hops that take the chick from where it is now into an empty nest without a fall,
 * by a breadth-first search over beats (null in the plan means wait a beat). The lanes are
 * a function of time alone, so a plan found here plays out exactly when followed. Used
 * by the tests to show every level can be crossed; returns null if no plan is found
 * within `maxBeats`.
 */
export function planCrossing(start: HopSim, maxBeats = 240): (Dir | null)[] | null {
  interface Node {
    sim: HopSim;
    path: (Dir | null)[];
  }
  let frontier: Node[] = [{ sim: start.clone(), path: [] }];
  const moves: (Dir | null)[] = [0, null, 1, 3, 2];
  for (let beat = 0; beat < maxBeats && frontier.length; beat++) {
    const next: Node[] = [];
    const seen = new Set<string>();
    for (const node of frontier) {
      for (const m of moves) {
        const s = node.sim.clone();
        if (m !== null) s.hop(m);
        let lost = false;
        let home = false;
        for (let k = 0; k < BEAT_STEPS; k++) {
          const ev = s.step();
          if (ev.died) {
            lost = true;
            break;
          }
          if (ev.nest !== null) {
            home = true;
            break;
          }
        }
        if (lost) continue;
        const path = [...node.path, m];
        if (home) return path;
        const key = `${s.row}:${Math.round(s.x * 4)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({ sim: s, path });
      }
    }
    frontier = next;
  }
  return null;
}

/** Play a plan on `sim` (beat by beat, as the planner did). Returns false if the chick fell. */
export function playPlan(sim: HopSim, plan: (Dir | null)[]): boolean {
  for (const m of plan) {
    if (m !== null) sim.hop(m);
    for (let k = 0; k < BEAT_STEPS; k++) {
      const ev = sim.step();
      if (ev.died) return false;
      if (ev.nest !== null) return true;
    }
  }
  return true;
}
