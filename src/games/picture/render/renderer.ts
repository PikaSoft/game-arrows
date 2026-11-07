import { Theme } from '../../../shared/themes';
import { EMPTY, FILLED } from '../core/types';

/** What the renderer needs to know about the session each frame. */
export interface PictureView {
  w: number;
  h: number;
  level: { rows: number[][]; cols: number[][]; solution: number[] };
  known: number[];
  mistakes: Set<number>;
  hinted: number | null;
  won: boolean;
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

const POP_MS = 200;

export class PictureRenderer {
  view: PictureView | null = null;
  /** The cell under the finger: its row and column get a soft band. */
  focus: number | null = null;
  cell = 30;
  /** The grid's top-left corner, in CSS pixels (clues sit above and to the left). */
  ox = 0;
  oy = 0;

  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private pops = new Map<number, number>();
  private wonAt = 0;
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

  setView(v: PictureView | null): void {
    this.view = v;
    this.focus = null;
    this.pops.clear();
    this.wonAt = 0;
    this.particles = [];
    this.layout();
    this.invalidate();
  }

  /** Room for the clues: the longest row clue (in numbers) and the tallest column clue. */
  private clueRoom(v: PictureView): { across: number; down: number } {
    const longest = (lists: number[][]) => Math.max(1, ...lists.map((l) => Math.max(1, l.length)));
    // Two-digit numbers need a little more room.
    const wide = v.level.rows.some((r) => r.some((n) => n >= 10)) ? 0.85 : 0.62;
    return { across: longest(v.level.rows) * wide + 0.4, down: longest(v.level.cols) * 0.62 + 0.4 };
  }

  layout(): void {
    const v = this.view;
    if (!v || !this.cssW) return;
    const { across, down } = this.clueRoom(v);
    this.cell = Math.max(14, Math.min((this.cssW - 16) / (v.w + across), (this.cssH - 16) / (v.h + down), 48));
    const totalW = (v.w + across) * this.cell;
    const totalH = (v.h + down) * this.cell;
    this.ox = (this.cssW - totalW) / 2 + across * this.cell;
    this.oy = (this.cssH - totalH) / 2 + down * this.cell;
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

  celebrate(): void {
    this.wonAt = performance.now();
    const t0 = this.wonAt;
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
      this.drawClues(v);
      more = this.drawCells(v, now) || more;
      this.drawGrid(v);
      if (v.hinted !== null) {
        this.drawHint(v, v.hinted, now);
        more = true;
      }
    }
    more = this.drawParticles(now) || more;
    if (more) this.invalidate();
  }

  private drawFocus(v: PictureView): void {
    if (this.focus === null || v.won) return;
    const ctx = this.ctx;
    const c = this.cell;
    const x = this.focus % v.w;
    const y = (this.focus / v.w) | 0;
    ctx.fillStyle = this.theme.accent;
    ctx.globalAlpha = 0.14;
    ctx.fillRect(0, this.oy + y * c, this.ox + v.w * c, c);
    ctx.fillRect(this.ox + x * c, 0, c, this.oy + v.h * c);
    ctx.globalAlpha = 1;
  }

  private drawClues(v: PictureView): void {
    const ctx = this.ctx;
    const c = this.cell;
    const size = Math.max(10, Math.round(c * 0.5));
    ctx.font = `700 ${size}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.textBaseline = 'middle';
    // Row clues, right-aligned against the grid.
    ctx.textAlign = 'right';
    v.level.rows.forEach((runs, y) => {
      ctx.fillStyle = this.theme.text;
      ctx.globalAlpha = v.rowDone(y) ? 0.3 : 1;
      const list = runs.length ? runs : [0];
      const step = c * (list.some((n) => n >= 10) ? 0.85 : 0.62);
      list
        .slice()
        .reverse()
        .forEach((n, k) => ctx.fillText(String(n), this.ox - c * 0.25 - k * step, this.oy + (y + 0.5) * c));
    });
    // Column clues, stacked above the grid.
    ctx.textAlign = 'center';
    v.level.cols.forEach((runs, x) => {
      ctx.fillStyle = this.theme.text;
      ctx.globalAlpha = v.colDone(x) ? 0.3 : 1;
      const list = runs.length ? runs : [0];
      list
        .slice()
        .reverse()
        .forEach((n, k) => ctx.fillText(String(n), this.ox + (x + 0.5) * c, this.oy - c * 0.4 - k * c * 0.62));
    });
    ctx.globalAlpha = 1;
  }

  private drawCells(v: PictureView, now: number): boolean {
    const ctx = this.ctx;
    const c = this.cell;
    let more = false;
    ctx.fillStyle = this.theme.surface;
    ctx.fillRect(this.ox, this.oy, v.w * c, v.h * c);
    // When solved, the picture fills in from the top in the accent colour.
    const reveal = this.wonAt ? Math.min(1, (now - this.wonAt) / 700) : 0;
    if (this.wonAt && reveal < 1) more = true;
    for (let i = 0; i < v.known.length; i++) {
      const x = i % v.w;
      const y = (i / v.w) | 0;
      const k = v.known[i];
      const wrong = v.mistakes.has(i);
      let pop = 0;
      const p = this.pops.get(i);
      if (p !== undefined) {
        const t = (now - p) / POP_MS;
        if (t >= 1) this.pops.delete(i);
        else {
          pop = Math.sin(t * Math.PI) * 0.12;
          more = true;
        }
      }
      const px = this.ox + x * c;
      const py = this.oy + y * c;
      if (k === FILLED) {
        const lit = this.wonAt && y / v.h <= reveal;
        ctx.fillStyle = lit ? this.theme.accent : wrong ? this.theme.danger : this.theme.line;
        const pad = c * (0.06 - pop);
        ctx.beginPath();
        ctx.roundRect(px + pad, py + pad, c - pad * 2, c - pad * 2, c * 0.12);
        ctx.fill();
      } else if (k === EMPTY && !this.wonAt) {
        ctx.strokeStyle = wrong ? this.theme.danger : this.theme.muted;
        ctx.lineWidth = Math.max(1.5, c * (wrong ? 0.09 : 0.06));
        ctx.lineCap = 'round';
        const a = c * (0.28 - pop);
        const cx = px + c / 2;
        const cy = py + c / 2;
        ctx.beginPath();
        ctx.moveTo(cx - a, cy - a);
        ctx.lineTo(cx + a, cy + a);
        ctx.moveTo(cx + a, cy - a);
        ctx.lineTo(cx - a, cy + a);
        ctx.stroke();
      }
    }
    return more;
  }

  /** Thin lines between cells, thicker every five, and a frame. */
  private drawGrid(v: PictureView): void {
    const ctx = this.ctx;
    const c = this.cell;
    for (let x = 0; x <= v.w; x++) {
      const major = x % 5 === 0 || x === v.w;
      ctx.strokeStyle = this.theme.line;
      ctx.globalAlpha = major ? 0.6 : 0.18;
      ctx.lineWidth = major ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(this.ox + x * c, this.oy);
      ctx.lineTo(this.ox + x * c, this.oy + v.h * c);
      ctx.stroke();
    }
    for (let y = 0; y <= v.h; y++) {
      const major = y % 5 === 0 || y === v.h;
      ctx.strokeStyle = this.theme.line;
      ctx.globalAlpha = major ? 0.6 : 0.18;
      ctx.lineWidth = major ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(this.ox, this.oy + y * c);
      ctx.lineTo(this.ox + v.w * c, this.oy + y * c);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawHint(v: PictureView, i: number, now: number): void {
    const ctx = this.ctx;
    const c = this.cell;
    const x = i % v.w;
    const y = (i / v.w) | 0;
    ctx.save();
    ctx.strokeStyle = this.theme.accent;
    ctx.lineWidth = Math.max(2.5, c * 0.1);
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(now / 180);
    ctx.strokeRect(this.ox + x * c + 1, this.oy + y * c + 1, c - 2, c - 2);
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
