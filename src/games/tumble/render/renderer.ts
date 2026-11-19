import { Theme } from '../../../shared/themes';
import { covers } from '../core/rules';
import { Block, BRIDGE, DX, DY, GOAL, NONE, STAND, SWITCH, TumbleLevel, WEAK } from '../core/types';

/** Switch and bridge colours, one per switch, the same on every theme. */
export const SWITCH_COLORS = ['#2f6fe0', '#d23bb0'];
const BLOCK = '#e8a637';
const BLOCK_SIDE = '#b47a1e';

/** What the renderer needs to know about the session each frame. */
export interface TumbleView {
  level: TumbleLevel;
  block: Block;
  hinted: number | null;
  bridgeOpen(k: number): boolean;
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

const ROLL_MS = 150;
const SHAKE_MS = 320;

/** A block's footprint in squares, and how tall it stands. */
interface Shape {
  x: number;
  y: number;
  w: number;
  h: number;
  lift: number;
}

const shapeOf = (b: Block): Shape => {
  const cs = covers(b);
  const xs = cs.map(([x]) => x);
  const ys = cs.map(([, y]) => y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs) + 1, h: Math.max(...ys) - Math.min(...ys) + 1, lift: b.pose === STAND ? 0.55 : 0.28 };
};

export class TumbleRenderer {
  view: TumbleView | null = null;
  cell = 40;
  ox = 0;
  oy = 0;

  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private anim: { from: Shape; t0: number } | null = null;
  private shakeT0 = 0;
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

  setView(v: TumbleView | null): void {
    this.view = v;
    this.anim = null;
    this.shakeT0 = 0;
    this.particles = [];
    this.layout();
    this.invalidate();
  }

  /** Fit the squares actually in use (not the whole grid) to the screen, with room above for a standing block. */
  layout(): void {
    const v = this.view;
    if (!v || !this.cssW) return;
    const { w, tiles } = v.level;
    const used = tiles.map((t, i) => (t !== NONE ? i : -1)).filter((i) => i >= 0);
    const xs = used.map((i) => i % w);
    const ys = used.map((i) => (i / w) | 0);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    const bw = Math.max(...xs) - x0 + 1;
    const bh = Math.max(...ys) - y0 + 1;
    this.cell = Math.max(18, Math.min((this.cssW - 16) / bw, (this.cssH - 16) / (bh + 0.6), 64));
    this.ox = (this.cssW - bw * this.cell) / 2 - x0 * this.cell;
    this.oy = (this.cssH - bh * this.cell) / 2 + this.cell * 0.3 - y0 * this.cell;
  }

  /** Roll from where the block was. */
  rolled(from: Block): void {
    this.anim = { from: shapeOf(from), t0: performance.now() };
    this.invalidate();
  }

  /** The block wobbles where it is (a wasted move). */
  wobble(): void {
    this.shakeT0 = performance.now();
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
      this.drawTiles(v);
      let s = shapeOf(v.block);
      if (this.anim) {
        const t = (now - this.anim.t0) / ROLL_MS;
        if (t >= 1) this.anim = null;
        else {
          const e = 1 - (1 - t) * (1 - t);
          const f = this.anim.from;
          const mix = (a: number, b: number) => a + (b - a) * e;
          // Over the top of the roll the block is briefly at its tallest.
          s = { x: mix(f.x, s.x), y: mix(f.y, s.y), w: mix(f.w, s.w), h: mix(f.h, s.h), lift: mix(f.lift, s.lift) + Math.sin(e * Math.PI) * 0.2 };
          more = true;
        }
      }
      let dx = 0;
      if (this.shakeT0) {
        const t = (now - this.shakeT0) / SHAKE_MS;
        if (t >= 1) this.shakeT0 = 0;
        else {
          dx = Math.sin(t * Math.PI * 6) * (1 - t) * 0.12;
          more = true;
        }
      }
      if (v.hinted !== null) {
        this.drawHint(v, now);
        more = true;
      }
      this.drawBlock({ ...s, x: s.x + dx });
    }
    more = this.drawParticles(now) || more;
    if (more) this.invalidate();
  }

  private drawTiles(v: TumbleView): void {
    const ctx = this.ctx;
    const c = this.cell;
    const { w, tiles, switches } = v.level;
    const owner = new Map<number, number>();
    switches.forEach((sw, k) => sw.bridges.forEach((i) => owner.set(i, k)));
    const sideH = c * 0.16;
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      if (t === NONE) continue;
      const x = this.ox + (i % w) * c;
      const y = this.oy + ((i / w) | 0) * c;
      const pad = c * 0.04;
      if (t === BRIDGE) {
        const k = owner.get(i)!;
        const col = SWITCH_COLORS[k % SWITCH_COLORS.length];
        if (!v.bridgeOpen(k)) {
          // A closed bridge: just a dashed outline where it would be.
          ctx.strokeStyle = col;
          ctx.globalAlpha = 0.55;
          ctx.lineWidth = Math.max(1.5, c * 0.04);
          ctx.setLineDash([c * 0.12, c * 0.1]);
          ctx.strokeRect(x + pad * 2, y + pad * 2, c - pad * 4, c - pad * 4);
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
          continue;
        }
      }
      // A raised square: its front edge, then its top.
      ctx.fillStyle = this.theme.line;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(x + pad, y + pad + sideH, c - pad * 2, c - pad * 2);
      ctx.globalAlpha = 1;
      ctx.fillStyle = t === GOAL ? this.theme.line : this.theme.surface;
      ctx.fillRect(x + pad, y + pad, c - pad * 2, c - pad * 2);
      if (t === GOAL) {
        // The hole: a dark square well with the accent round its rim.
        ctx.fillStyle = this.theme.bg;
        ctx.fillRect(x + c * 0.2, y + c * 0.2, c * 0.6, c * 0.6);
        ctx.strokeStyle = this.theme.accent;
        ctx.lineWidth = Math.max(2, c * 0.06);
        ctx.strokeRect(x + c * 0.2, y + c * 0.2, c * 0.6, c * 0.6);
      } else if (t === WEAK) {
        ctx.strokeStyle = this.theme.muted;
        ctx.lineWidth = Math.max(1, c * 0.035);
        ctx.beginPath();
        ctx.moveTo(x + c * 0.2, y + c * 0.25);
        ctx.lineTo(x + c * 0.45, y + c * 0.5);
        ctx.lineTo(x + c * 0.35, y + c * 0.75);
        ctx.moveTo(x + c * 0.45, y + c * 0.5);
        ctx.lineTo(x + c * 0.78, y + c * 0.4);
        ctx.stroke();
      } else if (t === SWITCH) {
        const k = switches.findIndex((sw) => sw.at === i);
        ctx.fillStyle = SWITCH_COLORS[k % SWITCH_COLORS.length];
        ctx.beginPath();
        ctx.arc(x + c / 2, y + c / 2, c * 0.22, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(x + c / 2, y + c / 2, c * 0.08, 0, Math.PI * 2);
        ctx.fill();
      } else if (t === BRIDGE) {
        const k = owner.get(i)!;
        ctx.strokeStyle = SWITCH_COLORS[k % SWITCH_COLORS.length];
        ctx.lineWidth = Math.max(1.5, c * 0.05);
        ctx.beginPath();
        for (let p = 1; p < 4; p++) {
          ctx.moveTo(x + c * 0.15, y + (c * p) / 4);
          ctx.lineTo(x + c * 0.85, y + (c * p) / 4);
        }
        ctx.stroke();
      }
    }
  }

  private drawBlock(s: Shape): void {
    const ctx = this.ctx;
    const c = this.cell;
    const pad = c * 0.08;
    const x = this.ox + s.x * c + pad;
    const y = this.oy + s.y * c + pad;
    const w = s.w * c - pad * 2;
    const h = s.h * c - pad * 2;
    const lift = s.lift * c;
    // Shadow, the side facing us, then the top face, raised by the block's height.
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(x + c * 0.06, y + c * 0.1, w, h);
    ctx.fillStyle = BLOCK_SIDE;
    ctx.beginPath();
    ctx.roundRect(x, y - lift, w, h + lift, c * 0.1);
    ctx.fill();
    ctx.fillStyle = BLOCK;
    ctx.beginPath();
    ctx.roundRect(x, y - lift, w, h, c * 0.1);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = Math.max(1, c * 0.03);
    ctx.strokeRect(x + c * 0.08, y - lift + c * 0.08, w - c * 0.16, h - c * 0.16);
  }

  /** An arrow from the block the way the hint says to tip. */
  private drawHint(v: TumbleView, now: number): void {
    const ctx = this.ctx;
    const c = this.cell;
    const s = shapeOf(v.block);
    const d = v.hinted!;
    const cx = this.ox + (s.x + s.w / 2) * c + DX[d] * (s.w / 2 + 0.45) * c;
    const cy = this.oy + (s.y + s.h / 2) * c + DY[d] * (s.h / 2 + 0.45) * c;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((d * Math.PI) / 2);
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(now / 180);
    ctx.fillStyle = this.theme.accent;
    ctx.beginPath();
    ctx.moveTo(0, -c * 0.3);
    ctx.lineTo(c * 0.26, c * 0.1);
    ctx.lineTo(-c * 0.26, c * 0.1);
    ctx.closePath();
    ctx.fill();
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
