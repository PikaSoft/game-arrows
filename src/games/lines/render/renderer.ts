import { Theme } from '../../../shared/themes';

/** Line colours, spread apart so up to 18 stay tellable on light and dark themes. */
export const LINE_COLORS = [
  '#e5413b', // red
  '#2f6fe0', // blue
  '#2e9e44', // green
  '#f2c12e', // yellow
  '#f07f1e', // orange
  '#2cc4d6', // cyan
  '#d23bb0', // magenta
  '#7d4bd1', // purple
  '#9ccc2c', // lime
  '#f58fb8', // pink
  '#9a5b2e', // brown
  '#138a7e', // teal
  '#8cc8f5', // sky
  '#8c1d3b', // maroon
  '#b5b02a', // olive
  '#8a8f99', // grey
  '#f5b98c', // peach
  '#2b3f8c', // navy
];
export const lineColor = (c: number): string => LINE_COLORS[c % LINE_COLORS.length];

/** What the renderer needs to know about the session each frame. */
export interface LinesView {
  w: number;
  h: number;
  dots: [number, number][];
  paths: number[][];
  active: number | null;
  hinted: number | null;
  isComplete(c: number): boolean;
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

export class LinesRenderer {
  view: LinesView | null = null;
  /** Where the finger is while drawing, in CSS pixels, to show a soft blob under it. */
  finger: { x: number; y: number } | null = null;
  cell = 40;
  ox = 0;
  oy = 0;

  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  /** When each colour was last joined, for a short pulse on its dots. */
  private joinedAt = new Map<number, number>();
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

  setView(v: LinesView | null): void {
    this.view = v;
    this.finger = null;
    this.joinedAt.clear();
    this.particles = [];
    this.layout();
    this.invalidate();
  }

  layout(): void {
    const v = this.view;
    if (!v || !this.cssW) return;
    this.cell = Math.max(16, Math.min((this.cssW - 20) / v.w, (this.cssH - 20) / v.h, 72));
    this.ox = (this.cssW - v.w * this.cell) / 2;
    this.oy = (this.cssH - v.h * this.cell) / 2;
  }

  /** The cell under a point on the canvas, or null off the board. */
  cellAt(px: number, py: number): number | null {
    const v = this.view;
    if (!v) return null;
    const x = Math.floor((px - this.ox) / this.cell);
    const y = Math.floor((py - this.oy) / this.cell);
    return x < 0 || y < 0 || x >= v.w || y >= v.h ? null : y * v.w + x;
  }

  /** Board position (in cells, fractional) of a point on the canvas. */
  toCell(px: number, py: number): { x: number; y: number } {
    return { x: (px - this.ox) / this.cell, y: (py - this.oy) / this.cell };
  }

  joined(c: number): void {
    this.joinedAt.set(c, performance.now());
    this.invalidate();
  }

  confetti(): void {
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

  private center(i: number): [number, number] {
    const w = this.view!.w;
    return [this.ox + ((i % w) + 0.5) * this.cell, this.oy + (((i / w) | 0) + 0.5) * this.cell];
  }

  private draw(): void {
    const ctx = this.ctx;
    const now = performance.now();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    let more = false;
    const v = this.view;
    if (v) {
      this.drawBoard(v);
      this.drawFills(v);
      this.drawLines(v);
      more = this.drawDots(v, now) || more;
      if (v.hinted !== null) {
        this.drawHint(v, v.hinted, now);
        more = true;
      }
      this.drawFinger(v);
    }
    more = this.drawParticles(now) || more;
    if (more) this.invalidate();
  }

  private drawBoard(v: LinesView): void {
    const ctx = this.ctx;
    const c = this.cell;
    ctx.fillStyle = this.theme.surface;
    ctx.beginPath();
    ctx.roundRect(this.ox - 4, this.oy - 4, v.w * c + 8, v.h * c + 8, Math.min(14, c * 0.2));
    ctx.fill();
    ctx.strokeStyle = this.theme.muted;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < v.w; x++) {
      ctx.moveTo(this.ox + x * c, this.oy);
      ctx.lineTo(this.ox + x * c, this.oy + v.h * c);
    }
    for (let y = 1; y < v.h; y++) {
      ctx.moveTo(this.ox, this.oy + y * c);
      ctx.lineTo(this.ox + v.w * c, this.oy + y * c);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** A soft tint behind each line's cells, stronger once the colour is joined. */
  private drawFills(v: LinesView): void {
    const ctx = this.ctx;
    const c = this.cell;
    v.paths.forEach((p, col) => {
      if (p.length < 2) return;
      ctx.fillStyle = lineColor(col);
      ctx.globalAlpha = v.isComplete(col) ? 0.24 : 0.12;
      for (const i of p) ctx.fillRect(this.ox + (i % v.w) * c + 0.5, this.oy + ((i / v.w) | 0) * c + 0.5, c - 1, c - 1);
    });
    ctx.globalAlpha = 1;
  }

  private drawLines(v: LinesView): void {
    const ctx = this.ctx;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    v.paths.forEach((p, col) => {
      if (p.length < 2) return;
      ctx.strokeStyle = lineColor(col);
      ctx.lineWidth = this.cell * (col === v.active ? 0.36 : 0.3);
      ctx.beginPath();
      p.forEach((i, k) => {
        const [x, y] = this.center(i);
        if (k) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.stroke();
    });
  }

  private drawDots(v: LinesView, now: number): boolean {
    const ctx = this.ctx;
    const c = this.cell;
    let more = false;
    v.dots.forEach((pair, col) => {
      const t0 = this.joinedAt.get(col);
      let pulse = 0;
      if (t0 !== undefined) {
        const t = (now - t0) / 450;
        if (t >= 1) this.joinedAt.delete(col);
        else {
          pulse = Math.sin(t * Math.PI);
          more = true;
        }
      }
      const done = v.isComplete(col);
      for (const i of pair) {
        const [x, y] = this.center(i);
        const r = c * (0.33 + pulse * 0.08);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = lineColor(col);
        ctx.fill();
        // A joined colour's dots get a white ring, so finished pairs stand out.
        if (done) {
          ctx.lineWidth = Math.max(1.5, c * 0.05);
          ctx.strokeStyle = 'rgba(255,255,255,0.85)';
          ctx.beginPath();
          ctx.arc(x, y, r * 0.62, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    });
    return more;
  }

  private drawHint(v: LinesView, col: number, now: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = this.theme.accent;
    ctx.lineWidth = Math.max(2, this.cell * 0.06);
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(now / 180);
    for (const i of v.dots[col]) {
      const [x, y] = this.center(i);
      ctx.beginPath();
      ctx.arc(x, y, this.cell * 0.46, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawFinger(v: LinesView): void {
    if (!this.finger || v.active === null) return;
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(this.finger.x, this.finger.y, this.cell * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = lineColor(v.active);
    ctx.globalAlpha = 0.25;
    ctx.fill();
    ctx.globalAlpha = 1;
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
