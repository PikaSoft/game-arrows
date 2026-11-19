import { Cave, CLIMB, Gem, MAX_VY, SINK, speedAt, VIEW_H } from './cave';

export const STEP_HZ = 120;
/** The glider's hitbox radius: a little smaller than it's drawn, as a grace. */
export const HIT_R = 0.22;
/** How close a gem must come to be picked up. */
export const GEM_R = 0.5;
/** How far ahead the cave is kept laid out, in units. */
const LOOK_AHEAD = 30;

export interface StepEvents {
  gems: Gem[];
  crashed: boolean;
}

/** The rules of a flight with no drawing or timing: one `step()` is 1/STEP_HZ of a second. */
export class GliderSim {
  readonly cave: Cave;
  /** Distance flown, in units. */
  x = 0;
  /** Height on screen (0 at the top, VIEW_H at the bottom), and vertical speed (down is positive). */
  y = VIEW_H / 2;
  vy = 0;
  held = false;
  gems = 0;
  over = false;
  time = 0;

  constructor(readonly seed: number) {
    this.cave = new Cave(seed);
    this.cave.extend(LOOK_AHEAD);
  }

  get speed(): number {
    return speedAt(this.x);
  }
  get metres(): number {
    return Math.floor(this.x);
  }

  hold(on: boolean): void {
    this.held = on;
  }

  /** True if the glider's hitbox touches a wall at (x, y). */
  touches(x: number, y: number): boolean {
    for (const dx of [-HIT_R, 0, HIT_R]) {
      const [top, bottom] = this.cave.walls(x + dx);
      const reach = dx ? Math.sqrt(HIT_R * HIT_R - dx * dx) : HIT_R;
      if (y - reach < top || y + reach > bottom) return true;
    }
    return false;
  }

  step(): StepEvents {
    const ev: StepEvents = { gems: [], crashed: false };
    if (this.over) return ev;
    const dt = 1 / STEP_HZ;
    this.time += dt;
    this.vy += (this.held ? -CLIMB : SINK) * dt;
    this.vy = Math.max(-MAX_VY, Math.min(MAX_VY, this.vy));
    this.y += this.vy * dt;
    this.x += this.speed * dt;
    for (const g of this.cave.gems) {
      if (g.taken || Math.abs(g.x - this.x) > GEM_R || Math.abs(g.y - this.y) > GEM_R) continue;
      g.taken = true;
      this.gems++;
      ev.gems.push(g);
    }
    if (this.touches(this.x, this.y)) {
      this.over = true;
      ev.crashed = true;
    }
    this.cave.extend(this.x + LOOK_AHEAD);
    this.cave.trim(this.x - 8);
    return ev;
  }
}

/**
 * A simple pilot for tests and the browser check: hold while below the cave's centre a
 * short way ahead, let go while above it. If this flies a long way, the cave can be flown.
 */
export function autopilot(sim: GliderSim): boolean {
  const lead = sim.speed * 0.22;
  const target = sim.cave.at(sim.x + lead).centre;
  // Ahead of time for the speed already carried: where it'll be a moment from now.
  const soon = sim.y + sim.vy * 0.12;
  return soon > target;
}
