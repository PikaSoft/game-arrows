import { Theme } from '../../../shared/themes';
import { Grid } from '../core/grid';
import { FenceLevel, OFF, ON } from '../core/types';

/** What the renderer needs to know about the session each frame. */
export interface FenceView {
  level: FenceLevel;
  g: Grid;
  known: Int8Array;
  mistakes: Set<number>;
  hinted: number | null;
  satisfied(cell: number): boolean;
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

const POP_MS = 220;

export class FenceRenderer {
  view: FenceView | null = null;
  /** The line under the finger, outlined. */
  focus: number | null = null;
  cell = 40;
  ox = 0;
  oy = 0;

  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private pops = new Map<number, number>();
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

  setView(v: FenceView | null): void {
    this.view = v;
    this.focus = null;
    this.pops.clear();
    this.particles = [];
    this.layout();
    this.invalidate();
  }

  layout(): void {
    const v = this.view;
    if (!v || !this.cssW) return;
    const { w, h } = v.level;
    this.cell = Math.max(24, Math.min((this.cssW - 28) / w, (this.cssH - 28) / h, 72));
    this.ox = (this.cssW - w * this.cell) / 2;
    this.oy = (this.cssH - h * this.cell) / 2;
  }

  /** The line nearest a point, if the point is close enough to it. */
  edgeAt(px: number, py: number): number | null {
    const v = this.view;
    if (!v) return null;
    const { w, h } = v.level;
    const gx = (px - this.ox) / this.cell;
    const gy = (py - this.oy) / this.cell;
    const rx = Math.round(gx);
    const ry = Math.round(gy);
    const dx = Math.abs(gx - rx);
    const dy = Math.abs(gy - ry);
    if (Math.min(dx, dy) > 0.42) return null;
    if (dy <= dx) {
      // An across line on row ry.
      const x = Math.floor(gx);
      if (ry < 0 || ry > h || x < 0 || x >= w) return null;
      return ry * w + x;
    }
    const y = Math.floor(gy);
    if (rx < 0 || rx > w || y < 0 || y >= h) return null;
    return (h + 1) * w + y * (w + 1) + rx;
  }

  private endsXY(e: number): [number, number, number, number] {
    const v = this.view!;
    const W = v.level.w + 1;
    const [a, b] = v.g.ends[e];
    return [this.ox + (a % W) * this.cell, this.oy + ((a / W) | 0) * this.cell, this.ox + (b % W) * this.cell, this.oy + ((b / W) | 0) * this.cell];
  }

  pop(edges: number[]): void {
    const now = performance.now();
    for (const e of edges) this.pops.set(e, now);
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
      const c = this.cell;
      const { w, h, clues } = v.level;
      ctx.fillStyle = this.theme.surface;
      ctx.beginPath();
      ctx.roundRect(this.ox - c * 0.3, this.oy - c * 0.3, w * c + c * 0.6, h * c + c * 0.6, c * 0.25);
      ctx.fill();
      // Numbers: faded once their square has all its fence.
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(c * 0.5)}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
      clues.forEach((n, cell) => {
        if (n < 0) return;
        ctx.fillStyle = v.satisfied(cell) ? this.theme.muted : this.theme.text;
        ctx.fillText(String(n), this.ox + ((cell % w) + 0.5) * c, this.oy + (((cell / w) | 0) + 0.5) * c + c * 0.03);
      });
      for (let e = 0; e < v.g.edges; e++) {
        const [x1, y1, x2, y2] = this.endsXY(e);
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        let k = 1;
        const p = this.pops.get(e);
        if (p !== undefined) {
          const t = (now - p) / POP_MS;
          if (t >= 1) this.pops.delete(e);
          else {
            k = 0.4 + 0.6 * t;
            more = true;
          }
        }
        if (v.mistakes.has(e)) {
          ctx.strokeStyle = this.theme.danger;
          ctx.globalAlpha = 0.35;
          ctx.lineWidth = c * 0.22;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        if (v.known[e] === ON) {
          ctx.strokeStyle = this.theme.line;
          ctx.lineWidth = Math.max(3, c * 0.1);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(mx + (x1 - mx) * k, my + (y1 - my) * k);
          ctx.lineTo(mx + (x2 - mx) * k, my + (y2 - my) * k);
          ctx.stroke();
        } else if (v.known[e] === OFF) {
          const s = c * 0.08 * k;
          ctx.strokeStyle = v.mistakes.has(e) ? this.theme.danger : this.theme.muted;
          ctx.lineWidth = Math.max(1.5, c * 0.035);
          ctx.beginPath();
          ctx.moveTo(mx - s, my - s);
          ctx.lineTo(mx + s, my + s);
          ctx.moveTo(mx + s, my - s);
          ctx.lineTo(mx - s, my + s);
          ctx.stroke();
        }
        if (e === this.focus || e === v.hinted) {
          ctx.strokeStyle = this.theme.accent;
          ctx.globalAlpha = e === v.hinted ? 0.45 + 0.4 * Math.sin(now / 180) : 0.5;
          ctx.lineWidth = c * 0.2;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          ctx.globalAlpha = 1;
          if (e === v.hinted) more = true;
        }
      }
      // Dots on top.
      ctx.fillStyle = this.theme.line;
      for (let y = 0; y <= h; y++)
        for (let x = 0; x <= w; x++) {
          ctx.beginPath();
          ctx.arc(this.ox + x * c, this.oy + y * c, Math.max(2, c * 0.06), 0, Math.PI * 2);
          ctx.fill();
        }
    }
    more = this.drawParticles(now) || more;
    if (more) this.invalidate();
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
