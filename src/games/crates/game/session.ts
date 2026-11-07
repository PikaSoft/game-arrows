import { liveCells, Room, solved, step, walkPath } from '../core/rules';
import { solve } from '../core/solver';
import { CrateLevel } from '../core/types';

export const HINTS_PER_LEVEL = 3;

export type StepResult = { kind: 'walk' } | { kind: 'push'; crate: number } | null;

interface Snapshot {
  player: number;
  crates: number[];
}

/** One play of a Crate Push level: where the player and crates are, pushes and undo. */
export class Session {
  readonly room: Room;
  /** Each crate's cell. A crate keeps its index for the whole level, so it can be animated. */
  crates: number[];
  player: number;
  /** The side the player last moved toward, for the renderer. */
  facing = 2;
  pushes = 0;
  steps = 0;
  elapsedMs = 0;
  hints = HINTS_PER_LEVEL;
  hintsUsed = 0;
  /** Cells a crate can still get to a target from. */
  readonly live: Uint8Array;
  private history: Snapshot[] = [];

  constructor(readonly level: CrateLevel) {
    this.room = { w: level.w, h: level.h, walls: level.walls };
    this.crates = level.crates.slice();
    this.player = level.player;
    this.live = liveCells(this.room, level.targets);
  }

  get won(): boolean {
    return solved(this.crates, this.level.targets);
  }
  get timerRunning(): boolean {
    return !this.won;
  }
  get canUndo(): boolean {
    return this.history.length > 0;
  }
  get onTarget(): number {
    return this.crates.filter((c) => this.level.targets.includes(c)).length;
  }
  crateAt(cell: number): number {
    return this.crates.indexOf(cell);
  }
  /** A crate sitting where it can never reach a target: the level can't be finished now. */
  get stuck(): boolean {
    return this.crates.some((c) => !this.live[c]);
  }

  /** Step one cell toward side d, pushing a crate if one is in the way. */
  move(d: number): StepResult {
    if (this.won) return null;
    const to = step(this.level.w, this.player, d);
    this.facing = d;
    if (this.room.walls[to]) return null;
    const k = this.crateAt(to);
    if (k >= 0) {
      const beyond = step(this.level.w, to, d);
      if (this.room.walls[beyond] || this.crateAt(beyond) >= 0) return null;
      this.history.push({ player: this.player, crates: this.crates.slice() });
      this.crates = this.crates.slice();
      this.crates[k] = beyond;
      this.player = to;
      this.pushes++;
      this.steps++;
      return { kind: 'push', crate: k };
    }
    this.player = to;
    this.steps++;
    return { kind: 'walk' };
  }

  /** The sides to step, in order, to walk to `cell` without pushing anything. Null if it can't be reached. */
  routeTo(cell: number): number[] | null {
    const path = walkPath(this.room, this.crates, this.player, cell);
    if (!path) return null;
    const dirs: number[] = [];
    let at = this.player;
    for (const next of path) {
      dirs.push([0, 1, 2, 3].find((d) => step(this.level.w, at, d) === next)!);
      at = next;
    }
    return dirs;
  }

  /** Take back the last push (and the walking since). Undone pushes still count. */
  undo(): boolean {
    const s = this.history.pop();
    if (!s) return false;
    this.player = s.player;
    this.crates = s.crates;
    return true;
  }

  /**
   * The next push of a shortest solution from here: the route to walk, then the push.
   * Null if no solution was found (the crates are stuck, or the search gave up).
   */
  hint(): number[] | null {
    if (this.hints <= 0 || this.won) return null;
    const res = solve(this.room, this.level.targets, this.crates, this.player, 60000);
    if (!res || !res.pushes.length) return null;
    const p = res.pushes[0];
    const behind = step(this.level.w, p.from, (p.dir + 2) % 4);
    const route = this.routeTo(behind);
    if (!route) return null;
    this.hints--;
    this.hintsUsed++;
    return route.concat(p.dir);
  }

  /** Stars from pushes against par, one fewer for each hint used, never below one. */
  stars(): number {
    const par = this.level.par;
    const byPushes = this.pushes <= par ? 3 : this.pushes <= Math.ceil(par * 1.25) ? 2 : 1;
    return Math.max(1, byPushes - this.hintsUsed);
  }
}
