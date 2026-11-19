import { Theme } from '../../../shared/themes';
import { BridgesLevel } from '../core/types';

/** What the renderer needs to know about the session each frame. */
export interface BridgesView {
  level: BridgesLevel;
  bridges: number[];
  hinted: number | null;
  done(i: number): boolean;
}

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

const FLASH_MS = 700;
const SHAKE_MS = 300;
const WATER = '#3f95dc';

export class BridgesRenderer {
  view: BridgesView | null = null;
  /** The link a drag is pointing at, drawn as a preview. */
  preview: number | null = null;
  /** The island a drag started from. */
  from: number | null = null;
  cell = 40;
  ox = 0;
  oy = 0;

  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  /** Links a wrong bridge was tried on, and when. */
  private flashes = new Map<number, number>();
  private shakes = new Map<number, number>();
  private particles: Particle[] = [];
  private raf = 0;

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
    this.layout();
    this.invalidate();
  }

  setView(v: BridgesView | null): void {
    this.view = v;
    this.preview = null;
    this.from = null;
    this.flashes.clear();
    this.shakes.clear();
    this.particles = [];
    this.layout();
    this.invalidate();
  }

  layout(): void {
    const v = this.view;
    if (!v || !this.cssW) return;
    const { w, h } = v.level;
    this.cell = Math.max(20, Math.min((this.cssW - 16) / w, (this.cssH - 16) / h, 72));
    this.ox = (this.cssW - w * this.cell) / 2;
    this.oy = (this.cssH - h * this.cell) / 2;
  }

  /** Square under a point, as [x, y] plus the offset from its centre in squares, or null. */
  squareAt(px: number, py: number): { x: number; y: number; fx: number; fy: number } | null {
    const v = this.view;
    if (!v) return null;
    const gx = (px - this.ox) / this.cell;
    const gy = (py - this.oy) / this.cell;
    const x = Math.floor(gx);
    const y = Math.floor(gy);
    if (x < 0 || y < 0 || x >= v.level.w || y >= v.level.h) return null;
    return { x, y, fx: gx - x - 0.5, fy: gy - y - 0.5 };
  }

  centre(i: number): [number, number] {
    const p = this.view!.level.islands[i];
    return [this.ox + (p.x + 0.5) * this.cell, this.oy + (p.y + 0.5) * this.cell];
  }

  flash(k: number): void {
    this.flashes.set(k, performance.now());
    this.invalidate();
  }

  shake(i: number): void {
    this.shakes.set(i, performance.now());
    this.invalidate();
  }

  celebrate(): void {
    const t0 = performance.now();
    for (let k = 0; k < 90; k++) {
      this.particles.push({
        x: Math.random() * this.cssW,
        y: -10 - Math.random() * 60,
        vx: (Math.random() - 0.5) * 0.08,
        vy: 0.12 + Math.random() * 0.18,
        color: this.theme.confetti[k % this.theme.confetti.length],
        t0: t0 + Math.random() * 400,
        life: 2200,
        size: 3 + Math.random() * 3,
      });
    }
    this.invalidate();
  }

  invalidate(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.draw();
    });
  }

  private draw(): void {
    const ctx = this.ctx;
    const now = performance.now();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    let more = false;
    const v = this.view;
    if (v) {
      this.drawWater(v);
      if (this.preview !== null) this.drawLink(v, this.preview, 1, this.theme.accent, 0.55);
      v.level.links.forEach((_, k) => {
        if (v.bridges[k]) this.drawLink(v, k, v.bridges[k], this.theme.line, 1);
      });
      for (const [k, t0] of this.flashes) {
        const t = (now - t0) / FLASH_MS;
        if (t >= 1) this.flashes.delete(k);
        else {
          this.drawLink(v, k, 1, this.theme.danger, 1 - t, v.bridges[k]);
          more = true;
        }
      }
      if (v.hinted !== null) {
        this.drawLink(v, v.hinted, v.bridges[v.hinted], this.theme.accent, 0.45 + 0.4 * Math.sin(now / 180));
        more = true;
      }
      v.level.islands.forEach((_, i) => {
        more = this.drawIsland(v, i, now) || more;
      });
    }
    more = this.drawParticles(now) || more;
    if (more) this.invalidate();
  }

  /** The sea, with a faint dot on every square to help line islands up. */
  private drawWater(v: BridgesView): void {
    const ctx = this.ctx;
    const c = this.cell;
    const { w, h } = v.level;
    ctx.fillStyle = WATER;
    ctx.globalAlpha = 0.1;
    ctx.beginPath();
    ctx.roundRect(this.ox - 4, this.oy - 4, w * c + 8, h * c + 8, Math.max(8, c * 0.25));
    ctx.fill();
    ctx.globalAlpha = 0.28;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        ctx.beginPath();
        ctx.arc(this.ox + (x + 0.5) * c, this.oy + (y + 0.5) * c, Math.max(1, c * 0.035), 0, Math.PI * 2);
        ctx.fill();
      }
    ctx.globalAlpha = 1;
  }

  /**
   * Draw `count` bridges along link k, between the island edges. `slot` shifts a single
   * line to where the next bridge would go (for a failed second bridge).
   */
  private drawLink(v: BridgesView, k: number, count: number, colour: string, alpha: number, slot = 0): void {
    const ctx = this.ctx;
    const c = this.cell;
    const l = v.level.links[k];
    const [ax, ay] = this.centre(l.a);
    const [bx, by] = this.centre(l.b);
    const r = c * 0.36;
    const ux = l.across ? 1 : 0;
    const uy = l.across ? 0 : 1;
    const gap = c * 0.13;
    const offsets = count === 2 ? [-gap, gap] : slot ? [gap] : [0];
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.strokeStyle = colour;
    ctx.lineWidth = Math.max(2.5, c * 0.08);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const o of offsets) {
      ctx.moveTo(ax + ux * r - uy * o, ay + uy * r + ux * o);
      ctx.lineTo(bx - ux * r - uy * o, by - uy * r + ux * o);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** One island: a ring with its number, filled once it has all its bridges. True while animating. */
  private drawIsland(v: BridgesView, i: number, now: number): boolean {
    const ctx = this.ctx;
    const c = this.cell;
    let [x, y] = this.centre(i);
    let moving = false;
    const sh = this.shakes.get(i);
    if (sh !== undefined) {
      const t = (now - sh) / SHAKE_MS;
      if (t >= 1) this.shakes.delete(i);
      else {
        x += Math.sin(t * Math.PI * 6) * (1 - t) * c * 0.08;
        moving = true;
      }
    }
    const done = v.done(i);
    const r = c * 0.36;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = done ? this.theme.accent : this.theme.surface;
    ctx.fill();
    ctx.lineWidth = Math.max(2, c * (this.from === i ? 0.11 : 0.07));
    ctx.strokeStyle = this.from === i ? this.theme.accent : this.theme.line;
    ctx.stroke();
    ctx.fillStyle = done ? this.theme.surface : this.theme.text;
    ctx.font = `700 ${Math.max(11, c * 0.42)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(v.level.islands[i].n), x, y + c * 0.02);
    return moving;
  }

  private drawParticles(now: number): boolean {
    if (!this.particles.length) return false;
    const ctx = this.ctx;
    this.particles = this.particles.filter((q) => now - q.t0 < q.life);
    for (const q of this.particles) {
      const dt = now - q.t0;
      if (dt < 0) continue;
      const x = q.x + q.vx * dt;
      const y = q.y + q.vy * dt + 0.00012 * dt * dt;
      ctx.globalAlpha = 1 - dt / q.life;
      ctx.fillStyle = q.color;
      ctx.fillRect(x - q.size / 2, y - q.size / 2, q.size, q.size);
    }
    ctx.globalAlpha = 1;
    return this.particles.length > 0;
  }
}
