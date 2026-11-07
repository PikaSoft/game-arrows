import { Course, JUMP_SECONDS, LANES, Thing } from './course';

export const STEP_HZ = 120;
/** Speed in rows (metres) per second: starts easy and creeps up with distance. */
export const START_SPEED = 7;
export const MAX_SPEED = 16;
export const SPEED_PER_METRE = 1 / 100;
/**
 * The runner's length for collisions, in rows. Short enough that the bit of it that pokes
 * into the next row before a row ends is always inside the grace window (at every speed
 * from START_SPEED up), so dodging as a row ends is safe. That's what the course
 * generator's whole-row model of the player assumes.
 */
export const RUNNER_LEN = 0.35;
/**
 * A collision only counts once it has lasted this long: a swipe that arrives just after
 * touching something still gets you out of it.
 */
export const GRACE_SECONDS = 0.08;
/** Speed at a distance: depends on nothing else, so the course can plan for it. */
export const speedAt = (distance: number): number => Math.min(MAX_SPEED, START_SPEED + distance * SPEED_PER_METRE);

/** How far ahead the course is laid, in rows. */
const LOOK_AHEAD = 40;

export interface StepEvents {
  coins: number;
  crashed: Thing | null;
}

/** The rules of the run with no drawing or timing: one `step()` is 1/STEP_HZ of a second. */
export class LanesSim {
  readonly course: Course;
  /** Distance run, in rows (metres): the near edge of the runner. */
  distance = 0;
  lane = 1;
  /** Seconds left in the air. */
  airLeft = 0;
  coins = 0;
  over = false;
  time = 0;
  /** How long the runner has been touching something solid, in seconds. */
  private touching = 0;

  constructor(readonly seed: number) {
    this.course = new Course(seed);
    this.course.extend(LOOK_AHEAD, speedAt);
  }

  get speed(): number {
    return speedAt(this.distance);
  }
  get airborne(): boolean {
    return this.airLeft > 0;
  }
  get metres(): number {
    return Math.floor(this.distance);
  }

  /** Change lane: -1 left, 1 right. False at the edge. */
  move(dir: -1 | 1): boolean {
    if (this.over) return false;
    const l = this.lane + dir;
    if (l < 0 || l >= LANES) return false;
    this.lane = l;
    return true;
  }

  /** Jump, unless already in the air. */
  jump(): boolean {
    if (this.over || this.airborne) return false;
    this.airLeft = JUMP_SECONDS;
    return true;
  }

  /** Things overlapping the runner in its lane now. */
  private hits(): Thing[] {
    const d = this.distance;
    return this.course.things.filter((t) => t.lane === this.lane && t.row < d + RUNNER_LEN && t.row + 1 > d);
  }

  step(): StepEvents {
    const ev: StepEvents = { coins: 0, crashed: null };
    if (this.over) return ev;
    const dt = 1 / STEP_HZ;
    this.time += dt;
    this.distance += this.speed * dt;
    this.airLeft = Math.max(0, this.airLeft - dt);
    let solid: Thing | null = null;
    for (const t of this.hits()) {
      if (t.kind === 'coin') {
        this.coins++;
        ev.coins++;
        this.course.things.splice(this.course.things.indexOf(t), 1);
      } else if (t.kind === 'wall' || !this.airborne) solid = t;
    }
    if (solid) {
      this.touching += dt;
      if (this.touching >= GRACE_SECONDS - 1e-9) {
        this.over = true;
        ev.crashed = solid;
      }
    } else this.touching = 0;
    this.course.extend(this.distance + LOOK_AHEAD, speedAt);
    this.course.trim(this.distance - 4);
    return ev;
  }
}
