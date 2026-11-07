import { Theme } from '../../../shared/themes';
import { BALL_R, BricksSim, PADDLE_H, PADDLE_Y, Power } from '../core/sim';
import { BRICK_H, FIELD_H, FIELD_W, UNBREAKABLE, WALL_TOP } from '../core/types';

/** Brick colours by row (top down), lightened for fewer hits left. */
const ROW_COLORS = ['#d9584a', '#ee8a3a', '#e8b93a', '#5aa457', '#3bb3a7', '#4f9ed8', '#8e62c4'];
const STEEL = '#8b9097';
const CAPSULE_COLORS: Record<Power, string> = { wide: '#4f9ed8', slow: '#5aa457', multi: '#e77fb3' };
const CAPSULE_LABEL: Record<Power, string> = { wide: 'W', slow: 'S', multi: '+' };

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  t0: number;
  life: number;
  size: number;
}

export class BricksRenderer {
  sim: BricksSim | null = null;
  /** Size of one field unit in CSS pixels, and the field's top-left corner. */
  unit = 20;
  ox = 0;
  oy = 0;

  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private bits: Bit[] = [];
  /** Bricks that were just hit, for a flash. */
  private flashes = new Map<string, number>();

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
    this.unit = Math.max(8, Math.min((this.cssW - 12) / FIELD_W, (this.cssH - 8) / FIELD_H));
    this.ox = (this.cssW - FIELD_W * this.unit) / 2;
    this.oy = (this.cssH - FIELD_H * this.unit) / 2;
  }

  setSim(s: BricksSim | null): void {
    this.sim = s;
    this.bits = [];
    this.flashes.clear();
  }

  /** Field x of a point on the canvas. */
  toField(px: number): number {
    return (px - this.ox) / this.unit;
  }

  hit(row: number, col: number, broke: boolean): void {
    const now = performance.now();
    this.flashes.set(`${row},${col}`, now);
    if (!broke) return;
    const color = ROW_COLORS[row % ROW_COLORS.length];
    for (let k = 0; k < 8; k++) {
      this.bits.push({
        x: col + Math.random(),
        y: WALL_TOP + (row + Math.random()) * BRICK_H,
        vx: (Math.random() - 0.5) * 6,
        vy: -Math.random() * 4,
        color,
        t0: now,
        life: 500 + Math.random() * 300,
        size: 0.12 + Math.random() * 0.12,
      });
    }
  }

  confetti(): void {
    const now = performance.now();
    for (let k = 0; k < 90; k++) {
      this.bits.push({
        x: Math.random() * FIELD_W,
        y: -0.5 - Math.random() * 2,
        vx: (Math.random() - 0.5) * 2,
        vy: 3 + Math.random() * 4,
        color: this.theme.confetti[k % this.theme.confetti.length],
        t0: now + Math.random() * 400,
        life: 2200,
        size: 0.15 + Math.random() * 0.15,
      });
    }
  }

  draw(): void {
    const ctx = this.ctx;
    const u = this.unit;
    const now = performance.now();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    const s = this.sim;
    if (!s) return;
    // The field.
    ctx.fillStyle = this.theme.surface;
    ctx.beginPath();
    ctx.roundRect(this.ox, this.oy, FIELD_W * u, FIELD_H * u, u * 0.4);
    ctx.fill();
    // Bricks.
    s.wall.forEach((row, r) =>
      row.forEach((v, c) => {
        if (!v) return;
        const x = this.ox + c * u;
        const y = this.oy + (WALL_TOP + r * BRICK_H) * u;
        const w = u;
        const h = BRICK_H * u;
        const pad = Math.max(1, u * 0.05);
        let color = v === UNBREAKABLE ? STEEL : ROW_COLORS[r % ROW_COLORS.length];
        // More hits left: darker.
        if (v !== UNBREAKABLE && v > 1) color = this.mix(color, '#000000', (v - 1) * 0.18);
        const f = this.flashes.get(`${r},${c}`);
        if (f !== undefined) {
          if (now - f > 120) this.flashes.delete(`${r},${c}`);
          else color = '#ffffff';
        }
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(x + pad, y + pad, w - pad * 2, h - pad * 2, h * 0.25);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(x + pad * 2, y + pad * 1.6, w - pad * 4, h * 0.18);
        if (v === UNBREAKABLE) {
          // Rivets.
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          for (const dx of [0.2, 0.8]) {
            ctx.beginPath();
            ctx.arc(x + w * dx, y + h / 2, h * 0.1, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (v > 1) {
          // Pips for hits left.
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          for (let k = 0; k < v; k++) {
            ctx.beginPath();
            ctx.arc(x + w / 2 + (k - (v - 1) / 2) * h * 0.4, y + h * 0.6, h * 0.09, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }),
    );
    // Capsules.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${Math.round(u * 0.42)}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    for (const c of s.capsules) {
      const x = this.ox + c.x * u;
      const y = this.oy + c.y * u;
      ctx.fillStyle = CAPSULE_COLORS[c.kind];
      ctx.beginPath();
      ctx.roundRect(x - u * 0.45, y - u * 0.22, u * 0.9, u * 0.44, u * 0.22);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(CAPSULE_LABEL[c.kind], x, y + 1);
    }
    // Paddle: wider while the W power-up lasts, and blinking in its last two seconds.
    const pw = s.paddleW;
    const blink = s.wideLeft > 0 && s.wideLeft < 2 && Math.floor(now / 150) % 2 === 0;
    ctx.fillStyle = blink ? this.theme.muted : this.theme.accent;
    ctx.beginPath();
    ctx.roundRect(this.ox + (s.paddleX - pw / 2) * u, this.oy + PADDLE_Y * u, pw * u, PADDLE_H * u, (PADDLE_H * u) / 2);
    ctx.fill();
    ctx.strokeStyle = this.theme.line;
    ctx.lineWidth = Math.max(1, u * 0.06);
    ctx.stroke();
    // Balls.
    const balls = s.waiting ? [s.restingBall()] : s.balls;
    for (const b of balls) {
      ctx.fillStyle = s.slowLeft > 0 ? '#5aa457' : this.theme.line;
      ctx.beginPath();
      ctx.arc(this.ox + b.x * u, this.oy + b.y * u, BALL_R * u * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    // Flying bits.
    this.bits = this.bits.filter((q) => now - q.t0 < q.life);
    for (const q of this.bits) {
      const t = (now - q.t0) / 1000;
      if (t < 0) continue;
      const x = q.x + q.vx * t;
      const y = q.y + q.vy * t + 6 * t * t;
      ctx.globalAlpha = 1 - (now - q.t0) / q.life;
      ctx.fillStyle = q.color;
      ctx.fillRect(this.ox + (x - q.size / 2) * u, this.oy + (y - q.size / 2) * u, q.size * u, q.size * u);
    }
    ctx.globalAlpha = 1;
  }

  private mix(a: string, b: string, k: number): string {
    const pa = parseInt(a.slice(1), 16);
    const pb = parseInt(b.slice(1), 16);
    const ch = (sh: number) => Math.round(((pa >> sh) & 255) * (1 - k) + ((pb >> sh) & 255) * k);
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }
}
