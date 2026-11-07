import { Theme } from '../../../shared/themes';

/** Puck colours: the first puck, then the second. Flags match. */
export const PUCKS = ['#3f95dc', '#e5574b'];
const ICE = '#cfe8f7';
const ROCK = '#8b9097';

/** What the renderer needs to know about the session each frame. */
export interface IceView {
  level: { w: number; h: number; rocks: boolean[]; holes: number[]; exits: number[]; starts: number[] };
  pos: number[];
  hintDir: number | null;
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

/** A puck sliding along a path: drawn there until it arrives. */
interface Slide {
  from: number;
  path: number[];
  t0: number;
  /** Fell into a hole at the end of the path: shrink, then reappear at `from`. */
  fall: boolean;
  /** Stopped on its flag: shrink into it. */
  home: boolean;
}

/** Time per cell while sliding. */
const CELL_MS = 42;
const FALL_MS = 420;
const HOME_MS = 300;

export class IceRenderer {
  view: IceView | null = null;
  cell = 40;
  ox = 0;
  oy = 0;

  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private slides = new Map<number, Slide>();
  private bump: { d: number; t0: number } | null = null;
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

  setView(v: IceView | null): void {
    this.view = v;
    this.snap();
    this.particles = [];
    this.layout();
  }

  /** Stop every animation and show the pucks where they are. */
  snap(): void {
    this.slides.clear();
    this.bump = null;
    this.invalidate();
  }

  layout(): void {
    const v = this.view;
    if (!v || !this.cssW) return;
    const { w, h } = v.level;
    this.cell = Math.max(16, Math.min((this.cssW - 20) / w, (this.cssH - 20) / h, 64));
    this.ox = (this.cssW - w * this.cell) / 2;
    this.oy = (this.cssH - h * this.cell) / 2;
  }

  /** Puck k slides from `from` along `path`. */
  slide(k: number, from: number, path: number[], fall: boolean, home: boolean): void {
    if (!path.length) return;
    this.slides.set(k, { from, path, t0: performance.now(), fall, home });
    this.invalidate();
  }

  /** A swipe that moved nothing: everything shudders that way. */
  shake(d: number): void {
    this.bump = { d, t0: performance.now() };
    this.invalidate();
  }

  /** True while any puck is still sliding. */
  get busy(): boolean {
    return this.slides.size > 0;
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

  private xy(i: number): { x: number; y: number } {
    const w = this.view!.level.w;
    return { x: i % w, y: (i / w) | 0 };
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
      let bx = 0;
      let by = 0;
      if (this.bump) {
        const t = (now - this.bump.t0) / 260;
        if (t >= 1) this.bump = null;
        else {
          const a = Math.sin(t * Math.PI) * 0.1;
          bx = [0, 1, 0, -1][this.bump.d] * a;
          by = [-1, 0, 1, 0][this.bump.d] * a;
          more = true;
        }
      }
      v.pos.forEach((p, k) => {
        const s = this.slides.get(k);
        if (s) {
          more = true;
          if (this.drawSliding(k, s, now)) return;
          this.slides.delete(k);
        }
        if (p >= 0) {
          const { x, y } = this.xy(p);
          this.drawPuck(k, x + bx, y + by, 1);
        }
      });
      if (v.hintDir !== null) {
        this.drawHint(v, v.hintDir, now);
        more = true;
      }
    }
    more = this.drawParticles(now) || more;
    if (more) this.invalidate();
  }

  /** Draw a puck mid-slide. False once the animation is over. */
  private drawSliding(k: number, s: Slide, now: number): boolean {
    const cells = s.path.length;
    const slideMs = cells * CELL_MS;
    const t = now - s.t0;
    const a = this.xy(s.from);
    if (t < slideMs) {
      // Ease out over the last stretch, so the puck seems to skid to a stop.
      const u = t / slideMs;
      const e = 1 - Math.pow(1 - u, 1.8);
      const f = e * cells;
      const i = Math.min(cells - 1, Math.floor(f));
      const from = i === 0 ? a : this.xy(s.path[i - 1]);
      const to = this.xy(s.path[i]);
      const r = f - i;
      this.drawPuck(k, from.x + (to.x - from.x) * r, from.y + (to.y - from.y) * r, 1);
      return true;
    }
    const end = this.xy(s.path[cells - 1]);
    if (s.fall) {
      const u = (t - slideMs) / FALL_MS;
      if (u < 1) {
        this.drawPuck(k, end.x, end.y, Math.max(0, 1 - u * 1.4));
        return true;
      }
      return false;
    }
    if (s.home) {
      const u = (t - slideMs) / HOME_MS;
      if (u < 1) {
        this.drawPuck(k, end.x, end.y, 1 - u);
        return true;
      }
    }
    return false;
  }

  private drawBoard(v: IceView): void {
    const ctx = this.ctx;
    const c = this.cell;
    const { w, h, rocks, holes, exits } = v.level;
    // The ice sheet.
    ctx.fillStyle = ICE;
    ctx.beginPath();
    ctx.roundRect(this.ox - 4, this.oy - 4, w * c + 8, h * c + 8, Math.min(14, c * 0.25));
    ctx.fill();
    // Faint scratches on the ice, the same every time.
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    for (let i = 0; i < w * h; i += 3) {
      const { x, y } = this.xy(i);
      const px = this.ox + (x + 0.2 + ((i * 37) % 50) / 100) * c;
      const py = this.oy + (y + 0.3 + ((i * 53) % 40) / 100) * c;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + c * 0.22, py - c * 0.08);
      ctx.stroke();
    }
    // Flags.
    exits.forEach((e, k) => {
      const { x, y } = this.xy(e);
      const cx = this.ox + (x + 0.5) * c;
      const cy = this.oy + (y + 0.5) * c;
      ctx.fillStyle = PUCKS[k];
      ctx.globalAlpha = 0.22;
      ctx.beginPath();
      ctx.arc(cx, cy, c * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#3b4652';
      ctx.lineWidth = Math.max(1.5, c * 0.05);
      ctx.beginPath();
      ctx.moveTo(cx - c * 0.12, cy + c * 0.3);
      ctx.lineTo(cx - c * 0.12, cy - c * 0.3);
      ctx.stroke();
      ctx.fillStyle = PUCKS[k];
      ctx.beginPath();
      ctx.moveTo(cx - c * 0.12, cy - c * 0.3);
      ctx.lineTo(cx + c * 0.24, cy - c * 0.18);
      ctx.lineTo(cx - c * 0.12, cy - c * 0.05);
      ctx.closePath();
      ctx.fill();
    });
    // Holes: dark water.
    for (const i of holes) {
      const { x, y } = this.xy(i);
      ctx.fillStyle = '#1f4e6e';
      ctx.beginPath();
      ctx.ellipse(this.ox + (x + 0.5) * c, this.oy + (y + 0.5) * c, c * 0.4, c * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = Math.max(1, c * 0.03);
      ctx.beginPath();
      ctx.arc(this.ox + (x + 0.42) * c, this.oy + (y + 0.45) * c, c * 0.14, Math.PI * 1.1, Math.PI * 1.7);
      ctx.stroke();
    }
    // Rocks.
    for (let i = 0; i < w * h; i++) {
      if (!rocks[i]) continue;
      const { x, y } = this.xy(i);
      const px = this.ox + x * c;
      const py = this.oy + y * c;
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.roundRect(px + c * 0.08, py + c * 0.14, c * 0.84, c * 0.8, c * 0.28);
      ctx.fill();
      ctx.fillStyle = ROCK;
      ctx.beginPath();
      ctx.roundRect(px + c * 0.08, py + c * 0.06, c * 0.84, c * 0.8, c * 0.28);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.ellipse(px + c * 0.38, py + c * 0.3, c * 0.18, c * 0.08, -0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawPuck(k: number, x: number, y: number, scale: number): void {
    if (scale <= 0) return;
    const ctx = this.ctx;
    const c = this.cell;
    const cx = this.ox + (x + 0.5) * c;
    const cy = this.oy + (y + 0.5) * c;
    const r = c * 0.34 * scale;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + c * 0.08 * scale, r, r * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PUCKS[k];
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = Math.max(1.5, c * 0.05 * scale);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
    ctx.stroke();
  }

  /** An arrow beside each puck still in play, pointing the way to swipe. */
  private drawHint(v: IceView, d: number, now: number): void {
    const ctx = this.ctx;
    const c = this.cell;
    const dx = [0, 1, 0, -1][d];
    const dy = [-1, 0, 1, 0][d];
    const wob = Math.sin(now / 160) * 0.06;
    ctx.save();
    ctx.fillStyle = this.theme.accent;
    ctx.strokeStyle = this.theme.line;
    ctx.lineWidth = Math.max(1, c * 0.03);
    for (const p of v.pos) {
      if (p < 0) continue;
      const { x, y } = this.xy(p);
      const cx = this.ox + (x + 0.5 + dx * (0.72 + wob)) * c;
      const cy = this.oy + (y + 0.5 + dy * (0.72 + wob)) * c;
      const a = c * 0.26;
      ctx.beginPath();
      ctx.moveTo(cx + dx * a, cy + dy * a);
      ctx.lineTo(cx - dx * a * 0.6 + dy * a, cy - dy * a * 0.6 + dx * a);
      ctx.lineTo(cx - dx * a * 0.6 - dy * a, cy - dy * a * 0.6 - dx * a);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
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
