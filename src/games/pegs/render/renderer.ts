import { Theme } from '../../../shared/themes';
import { Jump, PegsLevel } from '../core/types';

/** Peg colour, the same on every theme. */
export const PEG = '#d9604a';

/** What the renderer needs to know about the session each frame. */
export interface PegsView {
  level: PegsLevel;
  pegs: boolean[];
  selected: number | null;
  hinted: Jump | null;
  from(i: number): Jump[];
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

const JUMP_MS = 220;
const SHAKE_MS = 300;

export class PegsRenderer {
  view: PegsView | null = null;
  cell = 48;
  ox = 0;
  oy = 0;

  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private anim: { j: Jump; t0: number } | null = null;
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

  setView(v: PegsView | null): void {
    this.view = v;
    this.anim = null;
    this.shakes.clear();
    this.particles = [];
    this.layout();
    this.invalidate();
  }

  layout(): void {
    const v = this.view;
    if (!v || !this.cssW) return;
    const { w, h } = v.level;
    this.cell = Math.max(24, Math.min((this.cssW - 24) / w, (this.cssH - 24) / h, 80));
    this.ox = (this.cssW - w * this.cell) / 2;
    this.oy = (this.cssH - h * this.cell) / 2;
  }

  cellAt(px: number, py: number): number | null {
    const v = this.view;
    if (!v) return null;
    const x = Math.floor((px - this.ox) / this.cell);
    const y = Math.floor((py - this.oy) / this.cell);
    if (x < 0 || y < 0 || x >= v.level.w || y >= v.level.h) return null;
    return y * v.level.w + x;
  }

  private centre(i: number): [number, number] {
    const w = this.view!.level.w;
    return [this.ox + ((i % w) + 0.5) * this.cell, this.oy + (((i / w) | 0) + 0.5) * this.cell];
  }

  jumped(j: Jump): void {
    this.anim = { j, t0: performance.now() };
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
      const c = this.cell;
      const { w, holes, goal } = v.level;
      // The board: a slab under the holes (squares that join up, so no gaps between them).
      ctx.fillStyle = this.theme.surface;
      for (let i = 0; i < holes.length; i++) {
        if (!holes[i]) continue;
        ctx.fillRect(this.ox + (i % w) * c - 0.5, this.oy + ((i / w) | 0) * c - 0.5, c + 1, c + 1);
      }
      const targets = v.selected !== null ? new Set(v.from(v.selected).map((j) => j.to)) : new Set<number>();
      const a = this.anim;
      let t = 1;
      if (a) {
        t = (now - a.t0) / JUMP_MS;
        if (t >= 1) this.anim = null;
        else more = true;
      }
      for (let i = 0; i < holes.length; i++) {
        if (!holes[i]) continue;
        const [x, y] = this.centre(i);
        // Hole.
        ctx.fillStyle = this.theme.line;
        ctx.globalAlpha = 0.18;
        ctx.beginPath();
        ctx.arc(x, y, c * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        if (i === goal) {
          // The goal: a dashed ring, so it never looks like a picked-up or hinted peg.
          ctx.strokeStyle = this.theme.accent;
          ctx.lineWidth = Math.max(2, c * 0.05);
          ctx.setLineDash([c * 0.09, c * 0.07]);
          ctx.beginPath();
          ctx.arc(x, y, c * 0.43, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if (targets.has(i)) {
          ctx.fillStyle = this.theme.accent;
          ctx.globalAlpha = 0.8;
          ctx.beginPath();
          ctx.arc(x, y, c * 0.12, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
      for (let i = 0; i < holes.length; i++) {
        if (!holes[i] || !v.pegs[i]) continue;
        if (a && i === a.j.to) continue;
        let [x, y] = this.centre(i);
        const sh = this.shakes.get(i);
        if (sh !== undefined) {
          const st = (now - sh) / SHAKE_MS;
          if (st >= 1) this.shakes.delete(i);
          else {
            x += Math.sin(st * Math.PI * 6) * (1 - st) * c * 0.08;
            more = true;
          }
        }
        this.peg(x, y, c, v.selected === i);
      }
      if (a) {
        // The jumped peg fades where it was; the jumper arcs over it.
        const [ox, oy] = this.centre(a.j.over);
        ctx.globalAlpha = 1 - t;
        this.peg(ox, oy, c * (1 - 0.3 * t), false);
        ctx.globalAlpha = 1;
        const [fx, fy] = this.centre(a.j.from);
        const [tx, ty] = this.centre(a.j.to);
        const e = t * (2 - t);
        this.peg(fx + (tx - fx) * e, fy + (ty - fy) * e - Math.sin(e * Math.PI) * c * 0.45, c * (1 + 0.12 * Math.sin(e * Math.PI)), false);
      }
      if (v.hinted) {
        const pulse = 0.55 + 0.45 * Math.sin(now / 180);
        ctx.strokeStyle = this.theme.accent;
        ctx.lineWidth = Math.max(2.5, c * 0.07);
        ctx.globalAlpha = pulse;
        for (const i of [v.hinted.from, v.hinted.to]) {
          const [x, y] = this.centre(i);
          ctx.beginPath();
          ctx.arc(x, y, c * 0.44, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        more = true;
      }
    }
    more = this.drawParticles(now) || more;
    if (more) this.invalidate();
  }

  /** A shiny peg seen from above. */
  private peg(x: number, y: number, c: number, lifted: boolean): void {
    const ctx = this.ctx;
    const r = c * (lifted ? 0.36 : 0.32);
    if (lifted) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.arc(x + c * 0.04, y + c * 0.07, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, '#f6b3a4');
    g.addColorStop(0.45, PEG);
    g.addColorStop(1, '#9c3a2a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y - (lifted ? c * 0.05 : 0), r, 0, Math.PI * 2);
    ctx.fill();
    if (lifted) {
      ctx.strokeStyle = this.theme.accent;
      ctx.lineWidth = Math.max(2, c * 0.06);
      ctx.stroke();
    }
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
