import { Theme } from '../../../shared/themes';
import { Slot, STYLES } from '../core/types';

/** One colour per shape, the same on every theme. The shape and style alone tell pictures apart. */
export const SHAPE_COLORS = ['#e5413b', '#2f6fe0', '#2e9e44', '#ee7d2a', '#8e4fd6', '#1f9fae', '#d23bb0', '#b8860b'];
export const SHAPE_NAMES = ['circle', 'triangle', 'square', 'diamond', 'star', 'hexagon', 'plus', 'cross'];
export const STYLE_NAMES = ['solid', 'ring', 'twin'];

/** What the renderer needs to know about the session each frame. */
export interface PairsView {
  slots: Slot[];
  alive: boolean[];
  faces: number[];
  selected: number | null;
  hinted: [number, number] | null;
  freeSet(): Set<number>;
}

interface Gone {
  i: number;
  face: number;
  t0: number;
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

const GONE_MS = 260;
const SHAKE_MS = 300;
/** Tiles are a little taller than wide. */
const TALL = 1.25;

export class PairsRenderer {
  view: PairsView | null = null;
  /** Half-tile step across, and the pile's top-left. */
  u = 20;
  ox = 0;
  oy = 0;

  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private order: number[] = [];
  private gone: Gone[] = [];
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

  setView(v: PairsView | null): void {
    this.view = v;
    this.gone = [];
    this.shakes.clear();
    this.particles = [];
    // Back to front: lower layers first, then top to bottom, left to right.
    this.order = v ? v.slots.map((_, i) => i).sort((a, b) => v.slots[a].z - v.slots[b].z || v.slots[a].y - v.slots[b].y || v.slots[a].x - v.slots[b].x) : [];
    this.layout();
    this.invalidate();
  }

  private get lift(): number {
    return this.u * 0.28;
  }
  private get edge(): number {
    return this.u * 0.2;
  }

  layout(): void {
    const v = this.view;
    if (!v || !this.cssW || !v.slots.length) return;
    const maxX = Math.max(...v.slots.map((s) => s.x)) + 2;
    const maxY = Math.max(...v.slots.map((s) => s.y)) + 2;
    const layers = Math.max(...v.slots.map((s) => s.z));
    // Width = maxX half steps + the layer shift + the tile edge; same for height, taller.
    const wFor = (u: number) => maxX * u + layers * u * 0.28 + u * 0.2;
    const hFor = (u: number) => maxY * u * TALL + layers * u * 0.28 + u * 0.2;
    this.u = Math.max(8, Math.min((this.cssW - 16) / wFor(1), (this.cssH - 16) / hFor(1), 40));
    this.ox = (this.cssW - wFor(this.u)) / 2 + layers * this.lift;
    this.oy = (this.cssH - hFor(this.u)) / 2 + layers * this.lift;
  }

  /** A tile's face rectangle in canvas pixels. */
  private rect(i: number): [number, number, number, number] {
    const s = this.view!.slots[i];
    const u = this.u;
    const gap = Math.max(1, u * 0.06);
    return [this.ox + s.x * u - s.z * this.lift + gap, this.oy + s.y * u * TALL - s.z * this.lift + gap, 2 * u - gap * 2, 2 * u * TALL - gap * 2];
  }

  /** The topmost tile under a point, or null. */
  tileAt(px: number, py: number): number | null {
    const v = this.view;
    if (!v) return null;
    for (let k = this.order.length - 1; k >= 0; k--) {
      const i = this.order[k];
      if (!v.alive[i]) continue;
      const [x, y, w, h] = this.rect(i);
      if (px >= x && px <= x + w + this.edge && py >= y && py <= y + h + this.edge) return i;
    }
    return null;
  }

  removed(pair: [number, number]): void {
    const now = performance.now();
    for (const i of pair) this.gone.push({ i, face: this.view!.faces[i], t0: now });
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
      const free = v.freeSet();
      for (const i of this.order) if (v.alive[i]) more = this.drawTile(v, i, free.has(i), now) || more;
      this.gone = this.gone.filter((g) => now - g.t0 < GONE_MS);
      for (const g of this.gone) {
        const t = (now - g.t0) / GONE_MS;
        const [x, y, w, h] = this.rect(g.i);
        ctx.save();
        ctx.globalAlpha = 1 - t;
        ctx.translate(x + w / 2, y + h / 2 - t * this.u);
        ctx.scale(1 + t * 0.15, 1 + t * 0.15);
        this.face(-w / 2, -h / 2, w, h, g.face, true);
        ctx.restore();
        more = true;
      }
      if (v.hinted) more = true;
    }
    more = this.drawParticles(now) || more;
    if (more) this.invalidate();
  }

  private drawTile(v: PairsView, i: number, free: boolean, now: number): boolean {
    const ctx = this.ctx;
    let [x, y, w, h] = this.rect(i);
    let moving = false;
    const sh = this.shakes.get(i);
    if (sh !== undefined) {
      const t = (now - sh) / SHAKE_MS;
      if (t >= 1) this.shakes.delete(i);
      else {
        x += Math.sin(t * Math.PI * 6) * (1 - t) * this.u * 0.15;
        moving = true;
      }
    }
    const e = this.edge;
    const r = this.u * 0.28;
    // The tile's side, then its face.
    ctx.fillStyle = this.theme.line;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.roundRect(x + e, y + e, w, h, r);
    ctx.fill();
    ctx.globalAlpha = 1;
    const sel = v.selected === i;
    if (sel) {
      y -= this.u * 0.12;
    }
    this.face(x, y, w, h, v.faces[i], free);
    if (!free) {
      // Covered tiles fade toward the background, so free ones stand out on any theme.
      ctx.fillStyle = this.theme.bg;
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    const hinted = v.hinted?.includes(i);
    if (sel || hinted) {
      ctx.strokeStyle = this.theme.accent;
      ctx.lineWidth = Math.max(2.5, this.u * 0.16);
      ctx.globalAlpha = sel ? 1 : 0.55 + 0.45 * Math.sin(now / 180);
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      ctx.strokeStyle = this.theme.line;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    return moving;
  }

  /** A tile face with its picture. */
  private face(x: number, y: number, w: number, h: number, kind: number, bright: boolean): void {
    const ctx = this.ctx;
    ctx.fillStyle = this.theme.surface;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, this.u * 0.28);
    ctx.fill();
    if (!bright) return this.picture(x + w / 2, y + h / 2, w * 0.62, kind, 0.75);
    this.picture(x + w / 2, y + h / 2, w * 0.62, kind, 1);
  }

  /** Shape (by kind / STYLES) drawn in its style (kind % STYLES): solid, ring, or two small ones. */
  private picture(cx: number, cy: number, size: number, kind: number, alpha: number): void {
    const ctx = this.ctx;
    const shape = Math.floor(kind / STYLES);
    const style = kind % STYLES;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = SHAPE_COLORS[shape];
    ctx.strokeStyle = SHAPE_COLORS[shape];
    if (style === 2) {
      const s = size * 0.5;
      this.path(cx, cy - s * 0.62, s, shape);
      ctx.fill();
      this.path(cx, cy + s * 0.62, s, shape);
      ctx.fill();
    } else {
      this.path(cx, cy, size * (style === 1 ? 0.92 : 1), shape);
      if (style === 0) ctx.fill();
      else {
        ctx.lineWidth = Math.max(2, size * 0.14);
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  private path(cx: number, cy: number, s: number, shape: number): void {
    const ctx = this.ctx;
    const r = s / 2;
    ctx.beginPath();
    const poly = (pts: [number, number][]) => {
      pts.forEach(([px, py], k) => (k ? ctx.lineTo(cx + px * r, cy + py * r) : ctx.moveTo(cx + px * r, cy + py * r)));
      ctx.closePath();
    };
    if (shape === 0) ctx.arc(cx, cy, r * 0.85, 0, Math.PI * 2);
    else if (shape === 1) poly([[0, -0.95], [0.9, 0.75], [-0.9, 0.75]]);
    else if (shape === 2) poly([[-0.75, -0.75], [0.75, -0.75], [0.75, 0.75], [-0.75, 0.75]]);
    else if (shape === 3) poly([[0, -1], [0.85, 0], [0, 1], [-0.85, 0]]);
    else if (shape === 4) {
      const pts: [number, number][] = [];
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const rr = k % 2 ? 0.42 : 1;
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
      }
      poly(pts);
    } else if (shape === 5) {
      const pts: [number, number][] = [];
      for (let k = 0; k < 6; k++) pts.push([Math.cos((k * Math.PI) / 3) * 0.9, Math.sin((k * Math.PI) / 3) * 0.9]);
      poly(pts);
    } else if (shape === 6) poly([[-0.3, -0.9], [0.3, -0.9], [0.3, -0.3], [0.9, -0.3], [0.9, 0.3], [0.3, 0.3], [0.3, 0.9], [-0.3, 0.9], [-0.3, 0.3], [-0.9, 0.3], [-0.9, -0.3], [-0.3, -0.3]]);
    else {
      const a = 0.28;
      poly([[-0.8, -0.8 + a], [-0.8 + a, -0.8], [0, -a], [0.8 - a, -0.8], [0.8, -0.8 + a], [a, 0], [0.8, 0.8 - a], [0.8 - a, 0.8], [0, a], [-0.8 + a, 0.8], [-0.8, 0.8 - a], [-a, 0]]);
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
