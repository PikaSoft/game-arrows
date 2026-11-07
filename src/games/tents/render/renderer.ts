import { Theme } from '../../../shared/themes';
import { GRASS, TENT, TREE } from '../core/types';

const GRASS_COLOR = '#9fcf7c';
const TREE_COLOR = '#3f8f4a';
const TRUNK = '#7a5232';
const TENT_COLOR = '#e8893a';

/** What the renderer needs to know about the session each frame. */
export interface TentsView {
  w: number;
  h: number;
  level: { rowCounts: number[]; colCounts: number[] };
  known: number[];
  mistakes: Set<number>;
  hinted: number | null;
  rowDone(y: number): boolean;
  colDone(x: number): boolean;
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

export class TentsRenderer {
  view: TentsView | null = null;
  /** The square under the finger: its row and column get a soft band. */
  focus: number | null = null;
  cell = 36;
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

  setView(v: TentsView | null): void {
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
    // One square's worth of room for the counts, on the left and along the top.
    this.cell = Math.max(18, Math.min((this.cssW - 16) / (v.w + 0.9), (this.cssH - 16) / (v.h + 0.9), 56));
    this.ox = (this.cssW - (v.w + 0.9) * this.cell) / 2 + 0.9 * this.cell;
    this.oy = (this.cssH - (v.h + 0.9) * this.cell) / 2 + 0.9 * this.cell;
  }

  cellAt(px: number, py: number): number | null {
    const v = this.view;
    if (!v) return null;
    const x = Math.floor((px - this.ox) / this.cell);
    const y = Math.floor((py - this.oy) / this.cell);
    return x < 0 || y < 0 || x >= v.w || y >= v.h ? null : y * v.w + x;
  }

  pop(cells: number[]): void {
    const now = performance.now();
    for (const i of cells) this.pops.set(i, now);
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

  private draw(): void {
    const ctx = this.ctx;
    const now = performance.now();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    let more = false;
    const v = this.view;
    if (v) {
      this.drawFocus(v);
      this.drawCounts(v);
      more = this.drawSquares(v, now) || more;
      this.drawGrid(v);
      if (v.hinted !== null) {
        this.drawHint(v, v.hinted, now);
        more = true;
      }
    }
    more = this.drawParticles(now) || more;
    if (more) this.invalidate();
  }

  private drawFocus(v: TentsView): void {
    if (this.focus === null) return;
    const ctx = this.ctx;
    const c = this.cell;
    const x = this.focus % v.w;
    const y = (this.focus / v.w) | 0;
    ctx.fillStyle = this.theme.accent;
    ctx.globalAlpha = 0.14;
    ctx.fillRect(this.ox - c * 0.9, this.oy + y * c, (v.w + 0.9) * c, c);
    ctx.fillRect(this.ox + x * c, this.oy - c * 0.9, c, (v.h + 0.9) * c);
    ctx.globalAlpha = 1;
  }

  private drawCounts(v: TentsView): void {
    const ctx = this.ctx;
    const c = this.cell;
    ctx.font = `700 ${Math.max(11, Math.round(c * 0.5))}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = this.theme.text;
    v.level.rowCounts.forEach((n, y) => {
      ctx.globalAlpha = v.rowDone(y) ? 0.3 : 1;
      ctx.fillText(String(n), this.ox - c * 0.45, this.oy + (y + 0.5) * c);
    });
    v.level.colCounts.forEach((n, x) => {
      ctx.globalAlpha = v.colDone(x) ? 0.3 : 1;
      ctx.fillText(String(n), this.ox + (x + 0.5) * c, this.oy - c * 0.45);
    });
    ctx.globalAlpha = 1;
  }

  private drawSquares(v: TentsView, now: number): boolean {
    const ctx = this.ctx;
    const c = this.cell;
    let more = false;
    ctx.fillStyle = this.theme.surface;
    ctx.fillRect(this.ox, this.oy, v.w * c, v.h * c);
    for (let i = 0; i < v.known.length; i++) {
      const x = i % v.w;
      const y = (i / v.w) | 0;
      const px = this.ox + x * c;
      const py = this.oy + y * c;
      const k = v.known[i];
      let scale = 1;
      const p = this.pops.get(i);
      if (p !== undefined) {
        const t = (now - p) / 220;
        if (t >= 1) this.pops.delete(i);
        else {
          scale = 1 + Math.sin(t * Math.PI) * 0.18;
          more = true;
        }
      }
      if (k === GRASS) {
        ctx.fillStyle = GRASS_COLOR;
        ctx.globalAlpha = 0.55;
        ctx.fillRect(px, py, c, c);
        ctx.globalAlpha = 1;
        // A couple of blades of grass.
        ctx.strokeStyle = TREE_COLOR;
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = Math.max(1, c * 0.04);
        ctx.beginPath();
        ctx.moveTo(px + c * 0.4, py + c * 0.66);
        ctx.lineTo(px + c * 0.36, py + c * 0.5);
        ctx.moveTo(px + c * 0.5, py + c * 0.66);
        ctx.lineTo(px + c * 0.54, py + c * 0.46);
        ctx.moveTo(px + c * 0.6, py + c * 0.66);
        ctx.lineTo(px + c * 0.66, py + c * 0.52);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (k === TREE) this.drawTree(px, py);
      else if (k === TENT) this.drawTent(px, py, scale);
      if (v.mistakes.has(i)) {
        ctx.strokeStyle = this.theme.danger;
        ctx.lineWidth = Math.max(2, c * 0.08);
        ctx.strokeRect(px + c * 0.08, py + c * 0.08, c * 0.84, c * 0.84);
      }
    }
    return more;
  }

  private drawTree(px: number, py: number): void {
    const ctx = this.ctx;
    const c = this.cell;
    ctx.fillStyle = TRUNK;
    ctx.fillRect(px + c * 0.44, py + c * 0.55, c * 0.12, c * 0.3);
    ctx.fillStyle = TREE_COLOR;
    for (const [dx, dy, r] of [
      [0.5, 0.36, 0.24],
      [0.34, 0.5, 0.18],
      [0.66, 0.5, 0.18],
    ]) {
      ctx.beginPath();
      ctx.arc(px + c * dx, py + c * dy, c * r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawTent(px: number, py: number, scale: number): void {
    const ctx = this.ctx;
    const c = this.cell;
    const cx = px + c / 2;
    const base = py + c * 0.8;
    const half = c * 0.34 * scale;
    const top = base - c * 0.58 * scale;
    ctx.fillStyle = TENT_COLOR;
    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.lineTo(cx + half, base);
    ctx.lineTo(cx - half, base);
    ctx.closePath();
    ctx.fill();
    // The door.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.moveTo(cx, base - c * 0.3 * scale);
    ctx.lineTo(cx + half * 0.32, base);
    ctx.lineTo(cx - half * 0.32, base);
    ctx.closePath();
    ctx.fill();
  }

  private drawGrid(v: TentsView): void {
    const ctx = this.ctx;
    const c = this.cell;
    ctx.strokeStyle = this.theme.line;
    ctx.globalAlpha = 0.22;
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
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 2;
    ctx.strokeRect(this.ox, this.oy, v.w * c, v.h * c);
    ctx.globalAlpha = 1;
  }

  private drawHint(v: TentsView, i: number, now: number): void {
    const ctx = this.ctx;
    const c = this.cell;
    ctx.save();
    ctx.strokeStyle = this.theme.accent;
    ctx.lineWidth = Math.max(2.5, c * 0.09);
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(now / 180);
    ctx.strokeRect(this.ox + (i % v.w) * c + 2, this.oy + ((i / v.w) | 0) * c + 2, c - 4, c - 4);
    ctx.restore();
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
