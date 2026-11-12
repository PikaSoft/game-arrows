import { chuteSlot, intakeSlot } from './rules';
import { CRATE, LoopLevel } from './types';

export const STEP_HZ = 60;
/** Belt slots that pass while a full tray ships out and the next slides up. */
export const SHIP_SLOTS = 2;
const EMPTY = -1;

export interface Events {
  /** Cubes that dropped from a chute onto the belt. `id` follows the cube round the belt. */
  dropped: { col: number; color: number; id: number }[];
  /** Cubes a tray picked off the belt. `fill` is how many the tray held before. */
  taken: { bay: number; color: number; id: number; fill: number }[];
  shipped: { bay: number; color: number }[];
  jammed: boolean;
  timeUp: boolean;
  won: boolean;
}

export interface Snapshot {
  belt: number[];
  rot: number;
  sub: number;
  ticks: number;
  started: boolean;
  next: number[];
  chutes: number[][];
  wait: number[];
  bayIdx: number[];
  fill: number[];
  busy: number[];
  taps: number;
}

const noEvents = (): Events => ({ dropped: [], taken: [], shipped: [], jammed: false, timeUp: false, won: false });

/**
 * The belt in real time. It is a ring of slots that moves one place every `ticksPerSlot`
 * steps. Chutes drop a waiting cube into each empty slot that passes; the front tray of
 * each bay picks off each cube of its colour that passes. Everything happens on the
 * step the belt moves a slot, so the same taps on the same steps always play out the same.
 */
export class LoopSim {
  readonly capacity: number;
  readonly cols: number;
  readonly bayCount: number;
  readonly chuteAt: number[];
  readonly intakeAt: number[];

  /** belt[p] is the colour in the slot now at place p, or -1. */
  belt: number[];
  /** Slots moved so far. A cube's id is its place minus this, so it stays put as the belt turns. */
  rot = 0;
  /** Steps since the belt last moved a slot. */
  sub = 0;
  /** Steps played since the first tap. */
  ticks = 0;
  started = false;
  /** Per column, how many crates have been tipped. */
  next: number[];
  /** Per column, cubes waiting to drop. */
  chutes: number[][];
  /** Per column, slots in a row that passed full while cubes waited. */
  wait: number[];
  /** Per bay, how many trays have shipped. */
  bayIdx: number[];
  /** Per bay, cubes in the front tray. */
  fill: number[];
  /** Per bay, slots left until the next tray is in place. */
  busy: number[];
  taps = 0;
  jammed = false;
  timeUp = false;
  won = false;

  constructor(readonly level: LoopLevel) {
    this.capacity = level.capacity;
    this.cols = level.supply.length;
    this.bayCount = level.bays.length;
    this.chuteAt = level.supply.map((_, i) => chuteSlot(i, this.cols, this.capacity));
    this.intakeAt = level.bays.map((_, j) => intakeSlot(j, this.bayCount, this.capacity));
    this.belt = new Array(this.capacity).fill(EMPTY);
    this.next = new Array(this.cols).fill(0);
    this.chutes = level.supply.map(() => []);
    this.wait = new Array(this.cols).fill(0);
    this.bayIdx = new Array(this.bayCount).fill(0);
    this.fill = new Array(this.bayCount).fill(0);
    this.busy = new Array(this.bayCount).fill(0);
    this.won = level.bays.every((b) => b.length === 0);
  }

  get over(): boolean {
    return this.jammed || this.timeUp || this.won;
  }

  /** Cubes riding the belt. */
  get load(): number {
    let n = 0;
    for (const c of this.belt) if (c !== EMPTY) n++;
    return n;
  }

  get traysLeft(): number {
    let n = 0;
    for (let j = 0; j < this.bayCount; j++) n += this.level.bays[j].length - this.bayIdx[j];
    return n;
  }

  get cratesLeft(): number {
    let n = 0;
    for (let i = 0; i < this.cols; i++) n += this.level.supply[i].length - this.next[i];
    return n;
  }

  /** The colour bay `j` is collecting, or -1 if it has no trays left. */
  frontTray(j: number): number {
    const bay = this.level.bays[j];
    return this.bayIdx[j] < bay.length ? bay[this.bayIdx[j]] : EMPTY;
  }

  canTap(col: number): boolean {
    return !this.over && col >= 0 && col < this.cols && this.next[col] < this.level.supply[col].length;
  }

  /** Tip the front crate of a column into its chute. */
  tap(col: number): boolean {
    if (!this.canTap(col)) return false;
    this.chutes[col].push(...this.level.supply[col][this.next[col]]);
    this.next[col]++;
    this.taps++;
    this.started = true;
    return true;
  }

  /** Nothing more will happen until the next tap. */
  get settled(): boolean {
    if (this.chutes.some((c) => c.length) || this.busy.some((b) => b > 0)) return false;
    for (let j = 0; j < this.bayCount; j++) {
      const want = this.frontTray(j);
      if (want !== EMPTY && this.belt.includes(want)) return false;
    }
    return true;
  }

  /** The id of the cube in place p: it stays the same while the cube rides the belt. */
  idAt(p: number): number {
    return (((p - this.rot) % this.capacity) + this.capacity) % this.capacity;
  }

  /** Where cube `id` is now. */
  placeOf(id: number): number {
    return (id + this.rot) % this.capacity;
  }

  /** One step of 1/STEP_HZ seconds. */
  step(): Events {
    if (this.over) return noEvents();
    if (this.started) {
      this.ticks++;
      if (this.level.limitTicks && this.ticks >= this.level.limitTicks) {
        this.timeUp = true;
        return { ...noEvents(), timeUp: true };
      }
    }
    if (++this.sub < this.level.ticksPerSlot) return noEvents();
    this.sub = 0;
    return this.shift();
  }

  /** Move the belt one slot, then let the trays collect and the chutes drop. */
  shift(): Events {
    const ev = noEvents();
    if (this.over) return ev;
    this.belt.unshift(this.belt.pop()!);
    this.rot++;
    for (let j = 0; j < this.bayCount; j++) {
      if (this.busy[j] > 0) {
        this.busy[j]--;
        continue;
      }
      const want = this.frontTray(j);
      const p = this.intakeAt[j];
      if (want === EMPTY || this.belt[p] !== want) continue;
      this.belt[p] = EMPTY;
      ev.taken.push({ bay: j, color: want, id: this.idAt(p), fill: this.fill[j] });
      if (++this.fill[j] === CRATE) {
        this.fill[j] = 0;
        this.bayIdx[j]++;
        this.busy[j] = SHIP_SLOTS;
        ev.shipped.push({ bay: j, color: want });
      }
    }
    for (let i = 0; i < this.cols; i++) {
      const chute = this.chutes[i];
      if (!chute.length) continue;
      const p = this.chuteAt[i];
      if (this.belt[p] === EMPTY) {
        const color = chute.shift()!;
        this.belt[p] = color;
        this.wait[i] = 0;
        ev.dropped.push({ col: i, color, id: this.idAt(p) });
      } else if (++this.wait[i] >= this.capacity) {
        this.jammed = true;
        ev.jammed = true;
      }
    }
    if (!this.jammed && this.traysLeft === 0) {
      this.won = true;
      ev.won = true;
    }
    return ev;
  }

  snapshot(): Snapshot {
    return {
      belt: this.belt.slice(),
      rot: this.rot,
      sub: this.sub,
      ticks: this.ticks,
      started: this.started,
      next: this.next.slice(),
      chutes: this.chutes.map((c) => c.slice()),
      wait: this.wait.slice(),
      bayIdx: this.bayIdx.slice(),
      fill: this.fill.slice(),
      busy: this.busy.slice(),
      taps: this.taps,
    };
  }

  /** Go back to a snapshot. Clears a jam or a run-out clock, since those came after it. */
  restore(s: Snapshot): void {
    this.belt = s.belt.slice();
    this.rot = s.rot;
    this.sub = s.sub;
    this.ticks = s.ticks;
    this.started = s.started;
    this.next = s.next.slice();
    this.chutes = s.chutes.map((c) => c.slice());
    this.wait = s.wait.slice();
    this.bayIdx = s.bayIdx.slice();
    this.fill = s.fill.slice();
    this.busy = s.busy.slice();
    this.taps = s.taps;
    this.jammed = false;
    this.timeUp = false;
    this.won = this.traysLeft === 0;
  }
}
