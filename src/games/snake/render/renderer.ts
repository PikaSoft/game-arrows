import { Theme } from '../../../shared/themes';
import { SnakeSim } from '../core/sim';
import { DX, DY } from '../core/types';

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

const CRASH_MS = 450;

export class SnakeRenderer {
  sim: SnakeSim | null = null;
  /** How far through the current step the snake is, 0 to 1. */
  alpha = 1;
  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private cell = 0;
  private ox = 0;
  private oy = 0;
  private raf = 0;
  private particles: Particle[] = [];
  private crashAt = 0;

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

  /** Width / height of the drawing area, for picking a board shape. */
  get aspect(): number {
    return this.cssW && this.cssH ? this.cssW / this.cssH : 0.75;
  }

  setSim(s: SnakeSim | null): void {
    this.sim = s;
    this.alpha = 1;
    this.particles = [];
    this.crashAt = 0;
    this.layout();
    this.invalidate();
  }

  private layout(): void {
    const s = this.sim;
    if (!s || !this.cssW) return;
    const pad = 12;
    this.cell = Math.max(4, Math.floor(Math.min((this.cssW - pad * 2) / s.w, (this.cssH - pad * 2) / s.h)));
    this.ox = Math.round((this.cssW - this.cell * s.w) / 2);
    this.oy = Math.round((this.cssH - this.cell * s.h) / 2);
  }

  private centre(i: number): [number, number] {
    const w = this.sim!.w;
    const x = i % w;
    const y = (i - x) / w;
    return [this.ox + (x + 0.5) * this.cell, this.oy + (y + 0.5) * this.cell];
  }

  /** Little burst where an apple was eaten. */
  pop(cellIndex: number): void {
    const [x, y] = this.centre(cellIndex);
    const t0 = performance.now();
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const sp = 0.05 + Math.random() * 0.08;
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.04, color: k % 3 ? this.theme.accent : this.theme.moving, t0, life: 450, size: 2 + Math.random() * 2.5 });
    }
    this.invalidate();
  }

  crash(): void {
    this.crashAt = performance.now();
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
    const t = this.theme;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    const s = this.sim;
    let again = false;
    if (s) {
      const c = this.cell;
      const shakeT = this.crashAt ? (now - this.crashAt) / CRASH_MS : 1;
      const shake = shakeT < 1 ? Math.sin(shakeT * 40) * (1 - shakeT) * c * 0.25 : 0;
      if (shakeT < 1) again = true;
      ctx.save();
      ctx.translate(shake, 0);

      // Board with a faint checker so cells are easy to count.
      ctx.fillStyle = t.surface;
      this.roundRect(this.ox - 3, this.oy - 3, c * s.w + 6, c * s.h + 6, 10);
      ctx.fill();
      ctx.strokeStyle = t.line;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = this.mix(t.surface, t.line, 0.05);
      for (let y = 0; y < s.h; y++) for (let x = (y & 1); x < s.w; x += 2) ctx.fillRect(this.ox + x * c, this.oy + y * c, c, c);

      // Walls
      ctx.fillStyle = t.line;
      for (let i = 0; i < s.walls.length; i++) {
        if (!s.walls[i]) continue;
        const x = i % s.w;
        const y = (i - x) / s.w;
        this.roundRect(this.ox + x * c + 1, this.oy + y * c + 1, c - 2, c - 2, c * 0.2);
        ctx.fill();
      }

      // Apple
      if (s.food >= 0) {
        const [fx, fy] = this.centre(s.food);
        const pulse = 1 + Math.sin(now / 180) * 0.06;
        const r = c * 0.36 * pulse;
        ctx.fillStyle = t.accent;
        ctx.beginPath();
        ctx.arc(fx, fy + c * 0.04, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = t.moving;
        ctx.lineWidth = Math.max(1.5, c * 0.1);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(fx, fy - r * 0.7);
        ctx.quadraticCurveTo(fx + r * 0.3, fy - r * 1.3, fx + r * 0.7, fy - r * 1.2);
        ctx.stroke();
        again = true;
      }

      this.drawSnake(s, c, now);
      ctx.restore();
    }
    if (this.drawParticles(now)) again = true;
    if (again) this.invalidate();
  }

  private drawSnake(s: SnakeSim, c: number, now: number): void {
    const ctx = this.ctx;
    const t = this.theme;
    const a = s.dead ? 1 : Math.max(0, Math.min(1, this.alpha));
    const pts = s.body.map((i) => this.centre(i));
    // Head glides from the previous cell; tail glides out of the cell it is leaving.
    if (pts.length > 1 && a < 1) {
      const [hx, hy] = pts[0];
      const [px, py] = pts[1];
      pts[0] = [px + (hx - px) * a, py + (hy - py) * a];
    }
    if (s.lastTail !== null && a < 1) {
      const [lx, ly] = this.centre(s.lastTail);
      const [tx, ty] = pts[pts.length - 1];
      pts.push([lx + (tx - lx) * a, ly + (ty - ly) * a]);
    }
    const body = s.dead && now - this.crashAt < CRASH_MS * 2 && Math.floor((now - this.crashAt) / 110) % 2 === 0 ? t.danger : t.moving;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    if (pts.length === 1) ctx.lineTo(pts[0][0] + 0.01, pts[0][1]);
    ctx.strokeStyle = this.mix(body, '#000000', 0.25);
    ctx.lineWidth = c * 0.78;
    ctx.stroke();
    ctx.strokeStyle = body;
    ctx.lineWidth = c * 0.62;
    ctx.stroke();

    // Head and eyes, facing the way it is moving.
    const [hx, hy] = pts[0];
    ctx.fillStyle = this.mix(body, '#000000', 0.15);
    ctx.beginPath();
    ctx.arc(hx, hy, c * 0.42, 0, Math.PI * 2);
    ctx.fill();
    const d = s.dir;
    const fx = DX[d];
    const fy = DY[d];
    for (const side of [-1, 1]) {
      const ex = hx + fx * c * 0.12 + -fy * side * c * 0.18;
      const ey = hy + fy * c * 0.12 + fx * side * c * 0.18;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex, ey, c * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1b1b1b';
      ctx.beginPath();
      if (s.dead) {
        ctx.fillRect(ex - c * 0.08, ey - c * 0.02, c * 0.16, c * 0.04);
      } else {
        ctx.arc(ex + fx * c * 0.04, ey + fy * c * 0.04, c * 0.06, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawParticles(now: number): boolean {
    if (!this.particles.length) return false;
    const ctx = this.ctx;
    this.particles = this.particles.filter((q) => now - q.t0 < q.life);
    for (const q of this.particles) {
      const dt = now - q.t0;
      if (dt < 0) continue;
      ctx.globalAlpha = 1 - dt / q.life;
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x + q.vx * dt - q.size / 2, q.y + q.vy * dt + 0.00012 * dt * dt - q.size / 2, q.size, q.size);
    }
    ctx.globalAlpha = 1;
    return this.particles.length > 0;
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  private mix(a: string, b: string, k: number): string {
    const pa = parseInt(a.slice(1), 16);
    const pb = parseInt(b.slice(1), 16);
    const ch = (sh: number) => Math.round(((pa >> sh) & 255) * (1 - k) + ((pb >> sh) & 255) * k);
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }
}
