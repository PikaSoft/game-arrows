import { Rng } from '../../../shared/rng';

/**
 * Fruit Drop rules and physics. No drawing and no clock: the UI calls step() at a fixed
 * rate, so the same seed and the same drops on the same steps always give the same game.
 *
 * The bucket is W wide and H deep. x runs left to right, y runs downward: the rim is at
 * y = 0 and the floor at y = H. The side walls carry on upward past the rim, so nothing
 * falls out; a pile that stays above the rim ends the game instead.
 */

export const STEP_HZ = 120;
export const W = 1;
export const H = 1.3;
/** Where the held fruit hangs before it is dropped (above the rim). */
export const SPAWN_Y = -0.13;
/** Seconds a landed fruit may poke above the rim before the bucket counts as overflowing. */
export const OVERFLOW_S = 2;
/** Seconds between drops. */
export const COOLDOWN_S = 0.45;
/** Only the smallest fruits are dealt; the rest must be made by merging. */
export const DEALT_TIERS = 5;
/** Bonus for popping two of the largest fruit. */
export const POP_BONUS = 100;
/** Most the bucket can lean when the phone is tipped, in degrees. */
export const MAX_TILT_DEG = 8;
const MAX_TILT = (MAX_TILT_DEG * Math.PI) / 180;
/** Upward speed a full-strength shake gives a fruit (bucket depths per second). */
export const SHAKE_KICK = 1.1;

export const FRUITS = ['Blueberry', 'Raspberry', 'Lime', 'Plum', 'Lemon', 'Orange', 'Apple', 'Grapefruit', 'Coconut', 'Melon'] as const;
export const RADII = [0.042, 0.054, 0.068, 0.084, 0.103, 0.126, 0.153, 0.186, 0.222, 0.262] as const;
export const TOP_TIER = RADII.length - 1;

/** Points for making a fruit of this size by merging: 1, 3, 6, 10… */
export const pointsFor = (tier: number): number => (tier * (tier + 1)) / 2;

const DT = 1 / STEP_HZ;
const GRAVITY = 5;
const ITERATIONS = 8;
/** How much fruits bounce off each other and the bucket (the share of speed kept). */
export const BOUNCE_LEVELS = { none: 0, low: 0.15, medium: 0.4, high: 0.65, super: 0.85 } as const;
export type BounceLevel = keyof typeof BOUNCE_LEVELS;
export const DEFAULT_BOUNCE: BounceLevel = 'low';
export const isBounceLevel = (v: unknown): v is BounceLevel => typeof v === 'string' && Object.prototype.hasOwnProperty.call(BOUNCE_LEVELS, v);
/** Below this closing speed a contact does not bounce (stops resting fruit from jittering). */
const BOUNCE_MIN = 0.35;
const FRICTION = 0.35;
/** Overlap left alone, and the share of the rest pushed apart each pass. */
const SLOP = 0.0005;
const PUSH = 0.6;
/** How close two equal fruits must be to count as touching. */
const TOUCH = 0.002;
const MAX_SPEED = 6;
/** Share of sideways speed and spin a landed fruit keeps each step. */
const ROLL_DRAG = 0.99;

export interface Body {
  id: number;
  tier: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  /** Has touched the floor or another fruit. A fruit still falling cannot overflow the bucket. */
  landed: boolean;
}

export interface MergeEvent {
  x: number;
  y: number;
  /** Size of the fruit that was made, or -1 when two of the largest popped. */
  tier: number;
}

export interface StepEvents {
  merges: MergeEvent[];
  /** Fruits that touched down for the first time this step. */
  landings: number;
  /** The game ended on this step. */
  over: boolean;
}

export interface SavedFruit {
  seed: number;
  dealt: number;
  current: number;
  next: number;
  score: number;
  biggest: number;
  nextId: number;
  cooldown: number;
  overflow: number;
  bodies: Body[];
}

export class FruitSim {
  bodies: Body[] = [];
  /** The fruit in hand, and the one after it. */
  current: number;
  next: number;
  score = 0;
  /** Largest fruit made so far (the size index). */
  biggest = 0;
  over = false;
  /**
   * How far gravity leans from straight down, in radians (positive pulls to the right).
   * A live input from the phone, not part of the saved game.
   */
  tilt = 0;
  /** Bounciness of every contact. A player setting, so it is not part of the saved game. */
  restitution: number = BOUNCE_LEVELS[DEFAULT_BOUNCE];

  private rng: Rng;
  private dealt = 0;
  private nextId = 1;
  /** Steps until the next drop is allowed. */
  private cooldown = 0;
  /** Steps a landed fruit has been above the rim without a break. */
  private overflow = 0;
  /** Shakes so far, which varies how each one scatters the fruit. */
  private shakes = 0;

  constructor(readonly seed: number) {
    this.rng = new Rng(seed);
    this.current = this.deal();
    this.next = this.deal();
  }

  private deal(): number {
    this.dealt++;
    return this.rng.int(0, DEALT_TIERS - 1);
  }

  /** Lean the bucket. Kept within a few degrees either way. */
  setTilt(rad: number): void {
    if (!Number.isFinite(rad)) return;
    this.tilt = Math.max(-MAX_TILT, Math.min(MAX_TILT, rad));
  }

  /**
   * Jolt the bucket, as when the phone is shaken: every fruit that has landed hops up a
   * little, with a small push to one side. `strength` runs from 0 to 1. Small fruit hop a
   * touch higher than big ones. A live input, so it does not change what fruit are dealt.
   */
  shake(strength: number): void {
    if (this.over || !Number.isFinite(strength) || strength <= 0) return;
    const k = Math.min(1, strength) * SHAKE_KICK;
    this.shakes++;
    for (const b of this.bodies) {
      if (!b.landed) continue;
      // A spread that differs per fruit and per shake, without touching the dealing rng.
      const h = (((b.id * 0.618034 + this.shakes * 0.414214) % 1) + 1) % 1;
      const light = 1 - 0.35 * (b.tier / TOP_TIER);
      b.vy -= k * light * (0.7 + 0.3 * h);
      b.vx += k * light * (h - 0.5) * 0.5;
      b.spin += (h - 0.5) * 6 * k;
    }
  }

  /** True when a fruit is in hand and can be dropped. */
  get ready(): boolean {
    return !this.over && this.cooldown <= 0;
  }

  /** How close the bucket is to overflowing: 0 is fine, 1 is game over. */
  get danger(): number {
    return Math.min(1, this.overflow / (OVERFLOW_S * STEP_HZ));
  }

  /** The nearest x to `x` where the fruit in hand fits between the walls. */
  clampX(x: number): number {
    const r = RADII[this.current];
    return Math.min(W - r, Math.max(r, x));
  }

  /** Let go of the fruit in hand above `x`. False if no fruit is ready. */
  drop(x: number): boolean {
    if (!this.ready || !Number.isFinite(x)) return false;
    // A hair to one side or the other, so fruit dropped on the same spot does not balance in a column.
    const id = this.nextId++;
    const nudge = (((id * 0.618034) % 1) - 0.5) * 0.004;
    this.bodies.push({ id, tier: this.current, x: this.clampX(x + nudge), y: SPAWN_Y, vx: 0, vy: 0, angle: 0, spin: 0, landed: false });
    this.biggest = Math.max(this.biggest, this.current);
    this.current = this.next;
    this.next = this.deal();
    this.cooldown = Math.round(COOLDOWN_S * STEP_HZ);
    return true;
  }

  /** Advance the bucket by 1 / STEP_HZ seconds. */
  step(): StepEvents {
    const ev: StepEvents = { merges: [], landings: 0, over: false };
    if (this.over) return ev;
    if (this.cooldown > 0) this.cooldown--;
    const bodies = this.bodies;
    const gx = GRAVITY * Math.sin(this.tilt) * DT;
    const gy = GRAVITY * Math.cos(this.tilt) * DT;

    for (const b of bodies) {
      b.vx += gx;
      b.vy += gy;
      const speed = Math.hypot(b.vx, b.vy);
      if (speed > MAX_SPEED) {
        b.vx *= MAX_SPEED / speed;
        b.vy *= MAX_SPEED / speed;
      }
      // Rolling resistance: fruit that has landed slows down instead of rolling for ever.
      if (b.landed) {
        b.vx *= ROLL_DRAG;
        b.spin *= ROLL_DRAG;
      }
      b.x += b.vx * DT;
      b.y += b.vy * DT;
      b.angle += b.spin * DT;
    }

    for (let pass = 0; pass < ITERATIONS; pass++) {
      for (let i = 0; i < bodies.length; i++) {
        const a = bodies[i];
        const ra = RADII[a.tier];
        for (let j = i + 1; j < bodies.length; j++) {
          const b = bodies[j];
          const rb = RADII[b.tier];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const reach = ra + rb;
          if (Math.abs(dx) >= reach || Math.abs(dy) >= reach) continue;
          const d2 = dx * dx + dy * dy;
          if (d2 >= reach * reach) continue;
          const d = Math.sqrt(d2);
          // Two fruits on exactly the same spot: push them apart sideways.
          const nx = d > 1e-9 ? dx / d : 1;
          const ny = d > 1e-9 ? dy / d : 0;
          if (!a.landed) ev.landings++;
          if (!b.landed) ev.landings++;
          a.landed = b.landed = true;
          collide(a, b, nx, ny, reach - d, this.restitution);
        }
        // Walls and floor: the normal points from the fruit into the wall.
        if (a.x < ra) collide(a, null, -1, 0, ra - a.x, this.restitution);
        if (a.x > W - ra) collide(a, null, 1, 0, a.x - (W - ra), this.restitution);
        if (a.y > H - ra) {
          if (!a.landed) ev.landings++;
          a.landed = true;
          collide(a, null, 0, 1, a.y - (H - ra), this.restitution);
        }
      }
    }

    this.merge(ev);

    // Overflow: a fruit that has landed and still pokes above the rim.
    let above = false;
    for (const b of this.bodies) {
      if (b.landed && b.y - RADII[b.tier] < 0) {
        above = true;
        break;
      }
    }
    this.overflow = above ? this.overflow + 1 : 0;
    if (this.overflow >= OVERFLOW_S * STEP_HZ) {
      this.over = true;
      ev.over = true;
    }
    return ev;
  }

  /** Join every pair of equal fruits that touch. Each fruit joins at most once per step. */
  private merge(ev: StepEvents): void {
    const bodies = this.bodies;
    const gone = new Set<Body>();
    const made: Body[] = [];
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      if (gone.has(a)) continue;
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        if (b.tier !== a.tier || gone.has(b)) continue;
        const reach = RADII[a.tier] * 2 + TOUCH;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        if (dx * dx + dy * dy > reach * reach) continue;
        gone.add(a);
        gone.add(b);
        const x = (a.x + b.x) / 2;
        const y = (a.y + b.y) / 2;
        if (a.tier === TOP_TIER) {
          this.score += POP_BONUS;
          ev.merges.push({ x, y, tier: -1 });
        } else {
          const tier = a.tier + 1;
          const r = RADII[tier];
          const m: Body = {
            id: this.nextId++,
            tier,
            x: Math.min(W - r, Math.max(r, x)),
            y: Math.min(H - r, y),
            vx: (a.vx + b.vx) / 2,
            vy: (a.vy + b.vy) / 2,
            angle: a.angle,
            spin: (a.spin + b.spin) / 2,
            landed: true,
          };
          made.push(m);
          this.score += pointsFor(tier);
          this.biggest = Math.max(this.biggest, tier);
          ev.merges.push({ x: m.x, y: m.y, tier });
        }
        break;
      }
    }
    if (gone.size) this.bodies = bodies.filter((b) => !gone.has(b)).concat(made);
  }

  save(): SavedFruit {
    return {
      seed: this.seed,
      dealt: this.dealt,
      current: this.current,
      next: this.next,
      score: this.score,
      biggest: this.biggest,
      nextId: this.nextId,
      cooldown: this.cooldown,
      overflow: this.overflow,
      bodies: this.bodies.map((b) => ({ ...b })),
    };
  }

  /** Pick a saved game back up. Null if the saved data is not usable. */
  static restore(s: SavedFruit): FruitSim | null {
    try {
      const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
      const tierOk = (t: unknown) => ok(t) && Number.isInteger(t) && t >= 0 && t <= TOP_TIER;
      if (!ok(s.seed) || !ok(s.dealt) || s.dealt < 2 || s.dealt > 1e6 || !tierOk(s.current) || !tierOk(s.next) || !Array.isArray(s.bodies)) return null;
      const sim = new FruitSim(s.seed);
      while (sim.dealt < s.dealt) sim.deal();
      sim.current = s.current;
      sim.next = s.next;
      sim.score = ok(s.score) ? s.score : 0;
      sim.biggest = tierOk(s.biggest) ? s.biggest : 0;
      sim.nextId = ok(s.nextId) ? s.nextId : s.bodies.length + 1;
      sim.cooldown = ok(s.cooldown) ? s.cooldown : 0;
      sim.overflow = ok(s.overflow) ? s.overflow : 0;
      for (const b of s.bodies) {
        if (!tierOk(b.tier) || ![b.id, b.x, b.y, b.vx, b.vy, b.angle, b.spin].every(ok)) return null;
        sim.bodies.push({ id: b.id, tier: b.tier, x: b.x, y: b.y, vx: b.vx, vy: b.vy, angle: b.angle, spin: b.spin, landed: !!b.landed });
      }
      return sim;
    } catch {
      return null;
    }
  }
}

/**
 * Settle one contact. `n` points from `a` towards `b` (or into the wall when `b` is null)
 * and `depth` is how far they overlap. Fruits are pushed apart by weight, then bounce
 * (by `restitution`) and rub: the rubbing is what makes them roll.
 */
function collide(a: Body, b: Body | null, nx: number, ny: number, depth: number, restitution: number): void {
  const ra = RADII[a.tier];
  const rb = b ? RADII[b.tier] : 0;
  // Weight goes with area.
  const ia = 1 / (ra * ra);
  const ib = b ? 1 / (rb * rb) : 0;
  const sum = ia + ib;

  const push = (Math.max(0, depth - SLOP) * PUSH) / sum;
  a.x -= nx * push * ia;
  a.y -= ny * push * ia;
  if (b) {
    b.x += nx * push * ib;
    b.y += ny * push * ib;
  }

  // Speed of each surface at the point of contact (the tangent is the normal turned a quarter).
  const tx = -ny;
  const ty = nx;
  const avx = a.vx + a.spin * ra * tx;
  const avy = a.vy + a.spin * ra * ty;
  const bvx = b ? b.vx - b.spin * rb * tx : 0;
  const bvy = b ? b.vy - b.spin * rb * ty : 0;
  const rvx = bvx - avx;
  const rvy = bvy - avy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return;

  const jn = (-(1 + (vn < -BOUNCE_MIN ? restitution : 0)) * vn) / sum;
  a.vx -= jn * nx * ia;
  a.vy -= jn * ny * ia;
  if (b) {
    b.vx += jn * nx * ib;
    b.vy += jn * ny * ib;
  }

  // Friction, limited by how hard the two press together. A disc's spin takes twice the push.
  const vt = rvx * tx + rvy * ty;
  const jt = Math.max(-FRICTION * jn, Math.min(FRICTION * jn, -vt / (3 * sum)));
  a.vx -= jt * tx * ia;
  a.vy -= jt * ty * ia;
  a.spin -= (2 * jt * ia) / ra;
  if (b) {
    b.vx += jt * tx * ib;
    b.vy += jt * ty * ib;
    b.spin -= (2 * jt * ib) / rb;
  }
}
