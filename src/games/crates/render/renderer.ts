import { Theme } from '../../../shared/themes';

const CRATE = '#c98a48';
const CRATE_HOME = '#5aa457';
const PLAYER = '#4f9ed8';

/** What the renderer needs to know about the session each frame. */
export interface CrateView {
  level: { w: number; h: number; walls: boolean[]; targets: number[] };
  crates: number[];
  player: number;
  facing: number;
  live: Uint8Array;
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

export class CrateRenderer {
  view: CrateView | null = null;
  cell = 40;
  ox = 0;
  oy = 0;

  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  /** Where the player and each crate are drawn: glides toward where they are. */
  private shownPlayer: { x: number; y: number } | null = null;
  private shownCrates: { x: number; y: number }[] = [];
  private bump: { d: number; t0: number } | null = null;
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

  setView(v: CrateView | null): void {
    this.view = v;
    this.snap();
    this.particles = [];
    this.layout();
  }

  /** Put everything straight where it is, with no glide (after undo or restart). */
  snap(): void {
    this.shownPlayer = null;
    this.shownCrates = [];
    this.bump = null;
    this.invalidate();
  }

  layout(): void {
    const v = this.view;
    if (!v || !this.cssW) return;
    const { w, h } = v.level;
    this.cell = Math.max(16, Math.min((this.cssW - 12) / w, (this.cssH - 12) / h, 64));
    this.ox = (this.cssW - w * this.cell) / 2;
    this.oy = (this.cssH - h * this.cell) / 2;
  }

  /** The cell under a point on the canvas, or null off the board. */
  cellAt(px: number, py: number): number | null {
    const v = this.view;
    if (!v) return null;
    const x = Math.floor((px - this.ox) / this.cell);
    const y = Math.floor((py - this.oy) / this.cell);
    return x < 0 || y < 0 || x >= v.level.w || y >= v.level.h ? null : y * v.level.w + x;
  }

  /** The player bumps against something solid toward side d. */
  shake(d: number): void {
    this.bump = { d, t0: performance.now() };
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

  private xy(i: number): { x: number; y: number } {
    const w = this.view!.level.w;
    return { x: i % w, y: (i / w) | 0 };
  }

  /** Ease a drawn position toward where it should be. True while still moving. */
  private glide(s: { x: number; y: number }, t: { x: number; y: number }, dt: number): boolean {
    const k = 1 - Math.exp(-dt / 38);
    s.x += (t.x - s.x) * k;
    s.y += (t.y - s.y) * k;
    if (Math.abs(t.x - s.x) < 0.004 && Math.abs(t.y - s.y) < 0.004) {
      s.x = t.x;
      s.y = t.y;
      return false;
    }
    return true;
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
      this.drawRoom(v);
      const isTarget = new Set(v.level.targets);
      v.crates.forEach((c, k) => {
        const t = this.xy(c);
        let s = this.shownCrates[k];
        if (!s) s = this.shownCrates[k] = { ...t };
        more = this.glide(s, t, dt) || more;
        this.drawCrate(s.x, s.y, isTarget.has(c), !v.live[c]);
      });
      const pt = this.xy(v.player);
      if (!this.shownPlayer) this.shownPlayer = { ...pt };
      more = this.glide(this.shownPlayer, pt, dt) || more;
      let bx = 0;
      let by = 0;
      if (this.bump) {
        const t = (now - this.bump.t0) / SHAKE_MS;
        if (t >= 1) this.bump = null;
        else {
          const a = Math.sin(t * Math.PI) * 0.12;
          bx = [0, 1, 0, -1][this.bump.d] * a;
          by = [-1, 0, 1, 0][this.bump.d] * a;
          more = true;
        }
      }
      this.drawPlayer(this.shownPlayer.x + bx, this.shownPlayer.y + by, v.facing);
    }
    more = this.drawParticles(now) || more;
    if (more) this.invalidate();
    else this.lastFrame = 0;
  }

  private drawRoom(v: CrateView): void {
    const ctx = this.ctx;
    const c = this.cell;
    const { w, h, walls, targets } = v.level;
    const floor = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && !walls[y * w + x];
    // Floor.
    ctx.fillStyle = this.theme.surface;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (floor(x, y)) ctx.fillRect(this.ox + x * c - 0.5, this.oy + y * c - 0.5, c + 1, c + 1);
    // Walls: only those touching floor (diagonals too), as raised blocks.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (floor(x, y)) continue;
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) near = floor(x + dx, y + dy);
        if (!near) continue;
        const px = this.ox + x * c;
        const py = this.oy + y * c;
        ctx.fillStyle = this.theme.line;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.roundRect(px + 1, py + 1, c - 2, c - 2, c * 0.12);
        ctx.fill();
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(px + c * 0.12, py + c * 0.12, c * 0.76, c * 0.1);
        ctx.globalAlpha = 1;
      }
    }
    // Targets: a ring with a dot.
    ctx.strokeStyle = this.theme.accent;
    ctx.fillStyle = this.theme.accent;
    ctx.lineWidth = Math.max(2, c * 0.07);
    for (const t of targets) {
      const { x, y } = this.xy(t);
      const cx = this.ox + (x + 0.5) * c;
      const cy = this.oy + (y + 0.5) * c;
      ctx.beginPath();
      ctx.arc(cx, cy, c * 0.3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, c * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawCrate(x: number, y: number, home: boolean, dead: boolean): void {
    const ctx = this.ctx;
    const c = this.cell;
    const px = this.ox + x * c + c * 0.08;
    const py = this.oy + y * c + c * 0.08;
    const s = c * 0.84;
    const col = home ? CRATE_HOME : CRATE;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.roundRect(px, py + c * 0.06, s, s, c * 0.1);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.roundRect(px, py, s, s, c * 0.1);
    ctx.fill();
    // Planks: a frame and a diagonal brace.
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = Math.max(1.5, c * 0.05);
    ctx.beginPath();
    ctx.roundRect(px + s * 0.14, py + s * 0.14, s * 0.72, s * 0.72, c * 0.04);
    ctx.moveTo(px + s * 0.14, py + s * 0.86);
    ctx.lineTo(px + s * 0.86, py + s * 0.14);
    ctx.stroke();
    if (dead) {
      // A crate that can't reach any target any more gets a red edge.
      ctx.strokeStyle = this.theme.danger;
      ctx.lineWidth = Math.max(2, c * 0.07);
      ctx.beginPath();
      ctx.roundRect(px, py, s, s, c * 0.1);
      ctx.stroke();
    }
  }

  private drawPlayer(x: number, y: number, facing: number): void {
    const ctx = this.ctx;
    const c = this.cell;
    const cx = this.ox + (x + 0.5) * c;
    const cy = this.oy + (y + 0.5) * c;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + c * 0.3, c * 0.26, c * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PLAYER;
    ctx.beginPath();
    ctx.arc(cx, cy, c * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, c * 0.05);
    ctx.strokeStyle = this.theme.line;
    ctx.stroke();
    // Eyes look the way the player last moved.
    const fx = [0, 1, 0, -1][facing] * c * 0.08;
    const fy = [-1, 0, 1, 0][facing] * c * 0.08;
    for (const side of [-1, 1]) {
      const ex = cx + side * c * 0.11 + fx;
      const ey = cy - c * 0.05 + fy;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex, ey, c * 0.075, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1d2733';
      ctx.beginPath();
      ctx.arc(ex + fx * 0.3, ey + fy * 0.3, c * 0.038, 0, Math.PI * 2);
      ctx.fill();
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
