import { Theme } from '../../../shared/themes';
import { VIEW_H } from '../core/cave';
import { GliderSim } from '../core/sim';

/** Gem colour, the same on every theme. */
const GEM = '#2cc4d6';
/** Where the glider sits, in units from the left edge: room to see what's coming. */
export const GLIDER_X = 1.5;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  t0: number;
  life: number;
  size: number;
}

/** A soft rocky outline for a parallax layer, from sines (no randomness, so it never jumps). */
const ridge = (x: number, seed: number): number =>
  Math.sin(x * 0.37 + seed) * 0.9 + Math.sin(x * 0.11 + seed * 2.1) * 1.6 + Math.sin(x * 0.83 + seed * 0.7) * 0.35;

export class GliderRenderer {
  sim: GliderSim | null = null;
  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private scale = 40;
  private trail: { x: number; y: number }[] = [];
  private particles: Particle[] = [];
  private crashedAt = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    public theme: Theme,
  ) {
    this.ctx = canvas.getContext('2d')!;
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.cssW = r.width;
    this.cssH = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    this.scale = this.cssH / VIEW_H;
    this.draw();
  }

  setSim(s: GliderSim | null): void {
    this.sim = s;
    this.trail = [];
    this.particles = [];
    this.crashedAt = 0;
  }

  /** A gem picked up: a little burst where it was. */
  gem(x: number, y: number): void {
    const t0 = performance.now();
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      this.particles.push({ x, y, vx: Math.cos(a) * 1.6, vy: Math.sin(a) * 1.6, color: GEM, t0, life: 420, size: 0.09 });
    }
  }

  crash(): void {
    const s = this.sim;
    if (!s) return;
    this.crashedAt = performance.now();
    for (let k = 0; k < 26; k++) {
      const a = Math.random() * Math.PI * 2;
      const v = 1 + Math.random() * 3;
      this.particles.push({ x: s.x, y: s.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color: k % 2 ? this.theme.accent : this.theme.line, t0: this.crashedAt, life: 700, size: 0.1 });
    }
  }

  draw(): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    const s = this.sim;
    if (!s || !this.cssW) return;
    const k = this.scale;
    const viewW = this.cssW / k;
    const x0 = s.x - GLIDER_X;
    const sx = (x: number) => (x - x0) * k;
    const sy = (y: number) => y * k;
    // Parallax rock in the distance: two faint layers that drift slower than the cave.
    for (const [speed, alpha, base, seed] of [
      [0.3, 0.07, 3.2, 1.3],
      [0.55, 0.11, 2.2, 4.1],
    ] as const) {
      ctx.fillStyle = this.theme.line;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let px = 0; px <= this.cssW + 8; px += 8) ctx.lineTo(px, sy(base + ridge((px / k + s.x * speed) * 0.9, seed)));
      ctx.lineTo(this.cssW, 0);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, this.cssH);
      for (let px = 0; px <= this.cssW + 8; px += 8) ctx.lineTo(px, sy(VIEW_H - base - ridge((px / k + s.x * speed) * 0.9, seed + 2)));
      ctx.lineTo(this.cssW, this.cssH);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // The cave walls, one sample per unit with a point at each screen edge.
    const xs: number[] = [x0];
    for (let x = Math.ceil(x0); x < x0 + viewW + 1; x++) xs.push(x);
    xs.push(x0 + viewW + 1);
    const walls = xs.map((x) => s.cave.walls(x));
    for (const side of [0, 1]) {
      ctx.fillStyle = this.theme.line;
      ctx.globalAlpha = 0.82;
      ctx.beginPath();
      ctx.moveTo(sx(xs[0]), side ? this.cssH : 0);
      xs.forEach((x, i) => ctx.lineTo(sx(x), sy(walls[i][side])));
      ctx.lineTo(sx(xs[xs.length - 1]), side ? this.cssH : 0);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      // A bright lip along the wall's face.
      ctx.strokeStyle = this.theme.accent;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = Math.max(2, k * 0.06);
      ctx.lineJoin = 'round';
      ctx.beginPath();
      xs.forEach((x, i) => (i ? ctx.lineTo(sx(x), sy(walls[i][side])) : ctx.moveTo(sx(x), sy(walls[i][side]))));
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // Gems.
    const now = performance.now();
    for (const g of s.cave.gems) {
      if (g.taken || g.x < x0 - 1 || g.x > x0 + viewW + 1) continue;
      const r = k * 0.2 * (1 + 0.08 * Math.sin(now / 160 + g.x));
      const gx = sx(g.x);
      const gy = sy(g.y);
      ctx.fillStyle = GEM;
      ctx.beginPath();
      ctx.moveTo(gx, gy - r * 1.3);
      ctx.lineTo(gx + r, gy);
      ctx.lineTo(gx, gy + r * 1.3);
      ctx.lineTo(gx - r, gy);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.arc(gx - r * 0.25, gy - r * 0.35, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
    // Trail, then the glider (unless it has broken up).
    if (!s.over) {
      this.trail.push({ x: s.x, y: s.y });
      if (this.trail.length > 24) this.trail.shift();
    }
    ctx.strokeStyle = this.theme.accent;
    ctx.lineCap = 'round';
    for (let i = 1; i < this.trail.length; i++) {
      ctx.globalAlpha = (i / this.trail.length) * 0.45;
      ctx.lineWidth = k * 0.08 * (i / this.trail.length);
      ctx.beginPath();
      ctx.moveTo(sx(this.trail[i - 1].x), sy(this.trail[i - 1].y));
      ctx.lineTo(sx(this.trail[i].x), sy(this.trail[i].y));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (!s.over) this.glider(sx(s.x), sy(s.y), Math.atan2(s.vy, s.speed) * 0.8, k);
    // Particles, in cave units.
    this.particles = this.particles.filter((q) => now - q.t0 < q.life);
    for (const q of this.particles) {
      const t = (now - q.t0) / 1000;
      ctx.globalAlpha = 1 - (now - q.t0) / q.life;
      ctx.fillStyle = q.color;
      const size = q.size * k;
      ctx.fillRect(sx(q.x + q.vx * t) - size / 2, sy(q.y + q.vy * t + 3 * t * t) - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }

  /** A small dart-shaped glider, tilted with its climb or dive. */
  private glider(x: number, y: number, tilt: number, k: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    const L = k * 0.34;
    ctx.fillStyle = this.theme.accent;
    ctx.strokeStyle = this.theme.text;
    ctx.lineWidth = Math.max(1.5, k * 0.035);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(L, 0);
    ctx.lineTo(-L * 0.8, -L * 0.62);
    ctx.lineTo(-L * 0.45, 0);
    ctx.lineTo(-L * 0.8, L * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
