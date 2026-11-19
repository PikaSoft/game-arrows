import { Rng } from '../../../shared/rng';

/**
 * Units: the cave is VIEW_H units tall on screen (y grows downward), and distance is in
 * the same units. On a phone in portrait about 6 units of cave show across the screen.
 */
export const VIEW_H = 12;

/** Forward speed in units a second: starts gentle and rises with distance to a cap. */
export const START_SPEED = 2.6;
export const MAX_SPEED = 4.6;
export const SPEED_PER_UNIT = 1 / 600;
export const speedAt = (x: number): number => Math.min(MAX_SPEED, START_SPEED + Math.max(0, x) * SPEED_PER_UNIT);

/** Vertical motion: climbing while held, sinking otherwise (units per second squared), capped speed. */
export const CLIMB = 13;
export const SINK = 12;
export const MAX_VY = 5;

/** The gap starts wide and narrows with distance to a floor, always well above the glider's size. */
export const START_GAP = 6.5;
export const MIN_GAP = 3.1;
export const GAP_PER_UNIT = 1 / 450;
export const gapAt = (x: number): number => Math.max(MIN_GAP, START_GAP - Math.max(0, x - LEAD_IN) * GAP_PER_UNIT);

/** Units of straight, wide cave at the start, so the first moments are easy. */
export const LEAD_IN = 14;

/**
 * Caps on how the centre line may bend at a distance, from what the glider can follow at
 * the speed it will have there. Slope (rise per unit) needs a vertical speed of
 * slope x speed, so it stays a share of MAX_VY / speed. A change of slope needs an
 * acceleration of change x speed squared, so it stays a share of the weaker of CLIMB and
 * SINK over speed squared. The shares leave room for a person's reactions.
 */
export const SLOPE_SHARE = 0.45;
export const BEND_SHARE = 0.16;
export const slopeCap = (x: number): number => (SLOPE_SHARE * MAX_VY) / speedAt(x);
export const bendCap = (x: number): number => (BEND_SHARE * Math.min(CLIMB, SINK)) / speedAt(x) ** 2;

/** Gap kept between the walls and the top and bottom of the screen. */
const EDGE = 0.6;
/** Gems: the chance one is placed at a sample past the lead-in, and how far inside a wall it sits. */
export const GEM_CHANCE = 0.06;
export const GEM_INSET = 0.8;

export interface Gem {
  x: number;
  y: number;
  taken: boolean;
}

/** The cave, sampled every unit: centre line and gap height. Built ahead as needed. */
export class Cave {
  centre: number[] = [];
  gap: number[] = [];
  gems: Gem[] = [];
  private rng: Rng;
  private slope = 0;

  constructor(readonly seed: number) {
    this.rng = new Rng(seed);
  }

  get length(): number {
    return this.centre.length;
  }

  /** Lay the cave out to at least `x` units. */
  extend(x: number): void {
    while (this.centre.length <= Math.ceil(x) + 1) this.addSample();
  }

  private addSample(): void {
    const i = this.centre.length;
    const g = gapAt(i);
    const lo = g / 2 + EDGE;
    const hi = VIEW_H - g / 2 - EDGE;
    if (i <= LEAD_IN) {
      this.centre.push(VIEW_H / 2);
      this.gap.push(g);
      return;
    }
    const c = this.centre[i - 1];
    const sCap = slopeCap(i);
    const bCap = bendCap(i);
    let dm = (this.rng.next() * 2 - 1) * bCap;
    // Steer clear of the screen's edges in time: if carrying on would run past one before
    // the bend could level out, bend away as hard as allowed.
    // Stopping distance, with room to spare for the band itself creeping in as the gap narrows.
    const stop = (this.slope * this.slope) / (2 * bCap) + Math.abs(this.slope) * 3 + 0.4;
    if (this.slope > 0 && c + stop > hi) dm = -bCap;
    else if (this.slope < 0 && c - stop < lo) dm = bCap;
    else if (c > hi - 0.8) dm = -bCap;
    else if (c < lo + 0.8) dm = bCap;
    this.slope = Math.max(-sCap, Math.min(sCap, this.slope + dm));
    // A last guard; the steering above keeps it from ever biting in practice (the tests check the bend cap).
    const next = Math.max(lo, Math.min(hi, c + this.slope));
    this.slope = next - c;
    this.centre.push(next);
    this.gap.push(g);
    if (this.rng.next() < GEM_CHANCE) {
      const up = this.rng.next() < 0.5;
      this.gems.push({ x: i, y: up ? next - g / 2 + GEM_INSET : next + g / 2 - GEM_INSET, taken: false });
    }
  }

  /** Centre and gap at any distance, between samples by straight lines. */
  at(x: number): { centre: number; gap: number } {
    this.extend(x + 1);
    const i = Math.max(0, Math.floor(x));
    const t = Math.max(0, x) - i;
    return { centre: this.centre[i] + (this.centre[i + 1] - this.centre[i]) * t, gap: this.gap[i] + (this.gap[i + 1] - this.gap[i]) * t };
  }

  /** Top and bottom wall at a distance. */
  walls(x: number): [number, number] {
    const { centre, gap } = this.at(x);
    return [centre - gap / 2, centre + gap / 2];
  }

  /** Forget gems well behind (the samples are kept: they're small). */
  trim(x: number): void {
    this.gems = this.gems.filter((g) => g.x >= x);
  }
}
