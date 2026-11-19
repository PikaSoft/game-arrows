import { Theme } from '../../../shared/themes';
import { Status } from '../core/rules';
import { Beam, Cell, CRYSTAL, DX, DY, FIXED, MIRROR, Orient, Port, WALL } from '../core/types';

/** Beam colours, the same on every theme so a colour always means the same beam. */
export const BEAM_COLORS = ['#e5413b', '#2f6fe0', '#2e9e44', '#8e4fd6'];
export const BEAM_NAMES = ['red', 'blue', 'green', 'purple'];

/** What the renderer needs to know about the session each frame. */
export interface BeamView {
  w: number;
  h: number;
  cells: Cell[];
  beams: Beam[];
  orient: Orient[];
  locked: boolean[];
  hinted: number | null;
  status: Status;
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

const SHAKE_MS = 300;
/** How long a mirror takes to swing round. */
const TURN_MS = 140;

export class BeamRenderer {
  view: BeamView | null = null;
  /** Cell size and the top-left corner of the grid (inside the border ring), in CSS pixels. */
  cell = 40;
  ox = 0;
  oy = 0;

  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  /** Angle each mirror is drawn at, in quarter turns: 0 is `/`, 1 is `\`. Glides to its orient. */
  private shown: number[] = [];
  private shakes = new Map<number, number>();
  private particles: Particle[] = [];
  private raf = 0;
  private lastFrame = 0;

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

  setView(v: BeamView | null): void {
    this.view = v;
    this.shown = v ? v.orient.slice() : [];
    this.shakes.clear();
    this.particles = [];
    this.layout();
    this.invalidate();
  }

  layout(): void {
    const v = this.view;
    if (!v || !this.cssW) return;
    // One cell of border all round for the lamps and targets.
    this.cell = Math.max(18, Math.min((this.cssW - 16) / (v.w + 2), (this.cssH - 16) / (v.h + 2), 72));
    this.ox = (this.cssW - v.w * this.cell) / 2;
    this.oy = (this.cssH - v.h * this.cell) / 2;
  }

  /** The cell under a point on the canvas, or null. */
  cellAt(px: number, py: number): number | null {
    const v = this.view;
    if (!v) return null;
    const x = Math.floor((px - this.ox) / this.cell);
    const y = Math.floor((py - this.oy) / this.cell);
    return x < 0 || y < 0 || x >= v.w || y >= v.h ? null : y * v.w + x;
  }

  shake(i: number): void {
    this.shakes.set(i, performance.now());
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

  private centre(i: number): [number, number] {
    const w = this.view!.w;
    return [this.ox + ((i % w) + 0.5) * this.cell, this.oy + (((i / w) | 0) + 0.5) * this.cell];
  }

  private portXY(p: Port): [number, number] {
    const v = this.view!;
    const c = this.cell;
    if (p.side === 0) return [this.ox + (p.pos + 0.5) * c, this.oy - c * 0.5];
    if (p.side === 1) return [this.ox + (v.w + 0.5) * c, this.oy + (p.pos + 0.5) * c];
    if (p.side === 2) return [this.ox + (p.pos + 0.5) * c, this.oy + (v.h + 0.5) * c];
    return [this.ox - c * 0.5, this.oy + (p.pos + 0.5) * c];
  }

  private draw(): void {
    const ctx = this.ctx;
    const now = performance.now();
    const dt = Math.min(64, now - (this.lastFrame || now));
    this.lastFrame = now;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    let more = false;
    const v = this.view;
    if (v) {
      for (let i = 0; i < v.orient.length; i++) {
        const target = v.orient[i];
        const s = this.shown[i] ?? target;
        const gap = target - s;
        if (Math.abs(gap) < 0.01) {
          this.shown[i] = target;
          continue;
        }
        const step = dt / TURN_MS;
        this.shown[i] = Math.abs(gap) <= step ? target : s + Math.sign(gap) * step;
        more = true;
      }
      this.drawBoard(v);
      this.drawBeams(v);
      for (let i = 0; i < v.cells.length; i++) more = this.drawCell(v, i, now) || more;
      this.drawPorts(v);
      if (v.hinted !== null) {
        this.drawHint(v.hinted, now);
        more = true;
      }
    }
    more = this.drawParticles(now) || more;
    if (more) this.invalidate();
    else this.lastFrame = 0;
  }

  private drawBoard(v: BeamView): void {
    const ctx = this.ctx;
    const c = this.cell;
    ctx.fillStyle = this.theme.surface;
    ctx.beginPath();
    ctx.roundRect(this.ox - c * 0.08, this.oy - c * 0.08, v.w * c + c * 0.16, v.h * c + c * 0.16, c * 0.18);
    ctx.fill();
    ctx.strokeStyle = this.theme.muted;
    ctx.globalAlpha = 0.18;
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

  private drawBeams(v: BeamView): void {
    const ctx = this.ctx;
    const c = this.cell;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    v.status.traces.forEach((t, k) => {
      const pts: [number, number][] = [this.portXY(v.beams[k].lamp)];
      for (const i of t.cells) pts.push(this.centre(i));
      if (t.exit) pts.push(this.portXY(t.exit));
      else {
        const [x, y] = pts[pts.length - 1];
        pts.push([x + DX[t.dir] * c * 0.5, y + DY[t.dir] * c * 0.5]);
      }
      const colour = BEAM_COLORS[v.beams[k].colour];
      const path = () => {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      };
      ctx.strokeStyle = colour;
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = c * 0.24;
      path();
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = Math.max(2, c * 0.07);
      path();
      ctx.stroke();
    });
  }

  /** One cell's contents. True while it is still animating. */
  private drawCell(v: BeamView, i: number, now: number): boolean {
    const kind = v.cells[i];
    if (kind !== MIRROR && kind !== FIXED && kind !== WALL && kind !== CRYSTAL) return false;
    const ctx = this.ctx;
    const c = this.cell;
    let [cx, cy] = this.centre(i);
    let moving = false;
    const sh = this.shakes.get(i);
    if (sh !== undefined) {
      const t = (now - sh) / SHAKE_MS;
      if (t >= 1) this.shakes.delete(i);
      else {
        cx += Math.sin(t * Math.PI * 6) * (1 - t) * c * 0.08;
        moving = true;
      }
    }
    if (kind === WALL) {
      ctx.fillStyle = this.theme.line;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.roundRect(cx - c * 0.42, cy - c * 0.42, c * 0.84, c * 0.84, c * 0.12);
      ctx.fill();
      ctx.globalAlpha = 1;
      return moving;
    }
    if (kind === CRYSTAL) {
      const lit = v.status.lit.has(i);
      const r = c * 0.24;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 1.25);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r * 1.25);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      ctx.fillStyle = lit ? '#ffffff' : this.theme.surface;
      ctx.globalAlpha = lit ? 0.95 : 1;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = Math.max(1.5, c * 0.06);
      ctx.strokeStyle = lit ? this.theme.accent : this.theme.line;
      ctx.stroke();
      return moving;
    }
    // A mirror: a dial for one that turns, a bolt for one that doesn't.
    const turnable = kind === MIRROR && !v.locked[i];
    if (turnable) {
      ctx.beginPath();
      ctx.arc(cx, cy, c * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = this.theme.line;
      ctx.globalAlpha = 0.08;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    const angle = -Math.PI / 4 + (this.shown[i] ?? v.orient[i]) * (Math.PI / 2);
    const len = c * 0.42;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.lineCap = 'round';
    ctx.strokeStyle = this.theme.line;
    ctx.lineWidth = Math.max(3, c * 0.13);
    ctx.beginPath();
    ctx.moveTo(-len, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();
    // The shiny face.
    ctx.strokeStyle = this.theme.surface;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = Math.max(1, c * 0.035);
    ctx.beginPath();
    ctx.moveTo(-len * 0.8, 0);
    ctx.lineTo(len * 0.8, 0);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
    if (!turnable) {
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(2.5, c * 0.075), 0, Math.PI * 2);
      ctx.fillStyle = kind === FIXED ? this.theme.muted : this.theme.accent;
      ctx.fill();
      ctx.lineWidth = Math.max(1, c * 0.03);
      ctx.strokeStyle = this.theme.line;
      ctx.stroke();
    }
    return moving;
  }

  /** Lamps (solid, with a nozzle) and targets (rings that fill when their beam arrives). */
  private drawPorts(v: BeamView): void {
    const ctx = this.ctx;
    const c = this.cell;
    const r = c * 0.3;
    v.beams.forEach((b, k) => {
      const colour = BEAM_COLORS[b.colour];
      const [lx, ly] = this.portXY(b.lamp);
      const into = [2, 3, 0, 1][b.lamp.side];
      ctx.fillStyle = this.theme.line;
      ctx.beginPath();
      ctx.arc(lx, ly, r + Math.max(1.5, c * 0.05), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(lx, ly, r, 0, Math.PI * 2);
      ctx.fill();
      // Nozzle pointing into the board.
      ctx.fillStyle = this.theme.line;
      ctx.beginPath();
      const nx = DX[into];
      const ny = DY[into];
      ctx.moveTo(lx + nx * (r + c * 0.16), ly + ny * (r + c * 0.16));
      ctx.lineTo(lx + nx * r * 0.7 - ny * r * 0.55, ly + ny * r * 0.7 + nx * r * 0.55);
      ctx.lineTo(lx + nx * r * 0.7 + ny * r * 0.55, ly + ny * r * 0.7 - nx * r * 0.55);
      ctx.closePath();
      ctx.fill();
      this.symbol(lx, ly, r * 0.55, b.colour, '#ffffff');

      const [tx, ty] = this.portXY(b.target);
      const hit = v.status.reached[k];
      ctx.beginPath();
      ctx.arc(tx, ty, r, 0, Math.PI * 2);
      ctx.fillStyle = hit ? colour : this.theme.surface;
      ctx.fill();
      ctx.lineWidth = Math.max(2.5, c * 0.09);
      ctx.strokeStyle = colour;
      ctx.stroke();
      this.symbol(tx, ty, r * 0.55, b.colour, hit ? '#ffffff' : colour);
    });
  }

  /** A shape per colour, so beams can be told apart without colour. */
  private symbol(x: number, y: number, s: number, colour: number, fill: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = fill;
    ctx.beginPath();
    if (colour === 0) ctx.arc(x, y, s * 0.6, 0, Math.PI * 2);
    else if (colour === 1) {
      ctx.moveTo(x, y - s * 0.75);
      ctx.lineTo(x + s * 0.75, y + s * 0.55);
      ctx.lineTo(x - s * 0.75, y + s * 0.55);
    } else if (colour === 2) ctx.rect(x - s * 0.55, y - s * 0.55, s * 1.1, s * 1.1);
    else {
      ctx.moveTo(x, y - s * 0.8);
      ctx.lineTo(x + s * 0.8, y);
      ctx.lineTo(x, y + s * 0.8);
      ctx.lineTo(x - s * 0.8, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  private drawHint(i: number, now: number): void {
    const ctx = this.ctx;
    const c = this.cell;
    const [cx, cy] = this.centre(i);
    ctx.save();
    ctx.strokeStyle = this.theme.accent;
    ctx.lineWidth = Math.max(2, c * 0.07);
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(now / 180);
    ctx.beginPath();
    ctx.roundRect(cx - c * 0.45, cy - c * 0.45, c * 0.9, c * 0.9, c * 0.14);
    ctx.stroke();
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
