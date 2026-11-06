import { Board } from '../core/board';
import { Arrow } from '../core/types';
import { Theme } from '../ui/themes';
import { Camera } from './camera';
import { bodyAt, buildRoute, Pt, Route, TIP } from './path';

interface ExitAnim {
  kind: 'exit';
  arrow: Arrow;
  route: Route;
  start: number;
  duration: number;
  travel: number; // cells to travel until fully off the board
  fadeFrom: number;
}

interface BumpAnim {
  kind: 'bump';
  arrow: Arrow;
  route: Route;
  start: number;
  duration: number;
  reach: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  color: string;
  life: number;
}

const LINE = 0.15; // stroke width in cells
const easeIn = (t: number) => t * t;
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  readonly camera = new Camera();
  board: Board | null = null;
  theme: Theme;
  hintId: number | null = null;
  private exits: ExitAnim[] = [];
  private bumps = new Map<number, BumpAnim>();
  private particles: Particle[] = [];
  private dirty = true;
  private raf = 0;
  private dpr = 1;
  private cssW = 0;
  private cssH = 0;

  constructor(canvas: HTMLCanvasElement, theme: Theme) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.theme = theme;
  }

  get animating(): boolean {
    return this.exits.length > 0 || this.bumps.size > 0 || this.particles.length > 0;
  }

  get exitsRunning(): boolean {
    return this.exits.length > 0;
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.cssW = r.width;
    this.cssH = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    const wasFitted = this.camera.isFitted;
    this.camera.setView(r.width, r.height);
    if (wasFitted || !this.board) this.camera.fit();
    this.invalidate();
  }

  setBoard(board: Board): void {
    this.board = board;
    this.exits = [];
    this.bumps.clear();
    this.particles = [];
    this.hintId = null;
    this.camera.setBoard(board.w, board.h);
    this.camera.fit();
    this.invalidate();
  }

  invalidate(): void {
    this.dirty = true;
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  addExit(arrow: Arrow, distToEdge: number, delayMs = 0): void {
    const n = arrow.cells.length;
    const travel = distToEdge + n + 1;
    const route = buildRoute(arrow, travel + 2);
    // Speed up for long trips so big boards stay snappy.
    const duration = Math.min(900, 260 + travel * 22);
    this.bumps.delete(arrow.id);
    this.exits.push({
      kind: 'exit',
      arrow,
      route,
      start: performance.now() + delayMs,
      duration,
      travel,
      fadeFrom: Math.min(0.9, (distToEdge + n * 0.4) / travel),
    });
    this.invalidate();
  }

  addBump(arrow: Arrow, distToBlocker: number): void {
    const route = buildRoute(arrow, distToBlocker + 1);
    // Slide right up to the blocker (the tip stops just short of its line), then back.
    const reach = Math.max(0.15, distToBlocker - 0.3 - TIP);
    this.bumps.set(arrow.id, {
      kind: 'bump',
      arrow,
      route,
      start: performance.now(),
      duration: 260 + Math.min(distToBlocker, 12) * 30,
      reach,
    });
    this.invalidate();
  }

  confetti(): void {
    const colors = this.theme.confetti;
    for (let i = 0; i < 160; i++) {
      const fromLeft = i % 2 === 0;
      this.particles.push({
        x: fromLeft ? -10 : this.cssW + 10,
        y: this.cssH * (0.55 + Math.random() * 0.3),
        vx: (fromLeft ? 1 : -1) * (3 + Math.random() * 7),
        vy: -(7 + Math.random() * 9),
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        size: 5 + Math.random() * 6,
        color: colors[i % colors.length],
        life: 1,
      });
    }
    this.invalidate();
  }

  /** Arrow id under a screen point, with a little slack around each cell. */
  hitTest(sx: number, sy: number): number | null {
    const b = this.board;
    if (!b) return null;
    const p = this.camera.toWorld(sx, sy);
    const cx = Math.floor(p.x);
    const cy = Math.floor(p.y);
    const direct = b.at(cx, cy);
    if (direct !== -1) return direct;
    // Nearest occupied cell centre within a forgiving radius.
    const slackCells = Math.max(0.75, 18 / this.camera.scale);
    const r = Math.ceil(slackCells);
    let best: number | null = null;
    let bestD = slackCells * slackCells;
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        const id = b.at(x, y);
        if (id === -1) continue;
        const d = (x + 0.5 - p.x) ** 2 + (y + 0.5 - p.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = id;
        }
      }
    }
    return best;
  }

  private frame = (now: number): void => {
    this.raf = 0;
    const needsMore = this.animating || this.hintId !== null;
    if (this.dirty || needsMore) this.draw(now);
    this.dirty = false;
    if (this.animating || this.hintId !== null) this.raf = requestAnimationFrame(this.frame);
  };

  private draw(now: number): void {
    const { ctx, camera: cam, theme } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    const b = this.board;
    if (!b) return;

    ctx.save();
    ctx.translate(cam.ox, cam.oy);
    ctx.scale(cam.scale, cam.scale);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Faint board outline so empty space still reads as the playing area.
    ctx.strokeStyle = theme.muted;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1.5 / cam.scale;
    ctx.setLineDash([4 / cam.scale, 6 / cam.scale]);
    ctx.strokeRect(0, 0, b.w, b.h);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    this.drawGrid(b);

    // Resting arrows.
    for (const a of b.arrows.values()) {
      const bump = this.bumps.get(a.id);
      if (bump) continue;
      const pulse = a.id === this.hintId ? 0.5 + 0.5 * Math.sin(now / 160) : 0;
      if (pulse) this.drawHalo(buildRoute(a, 0), 0, pulse);
      this.drawArrow(buildRoute(a, 0), 0, a.id === this.hintId ? theme.accent : theme.line, 1);
    }

    // Bumping arrows: out to the blocker and back, flashing red.
    for (const [id, bump] of this.bumps) {
      const t = (now - bump.start) / bump.duration;
      if (t >= 1 || !b.arrows.has(id)) {
        this.bumps.delete(id);
        if (b.arrows.has(id)) this.drawArrow(buildRoute(bump.arrow, 0), 0, theme.line, 1);
        continue;
      }
      const off = t < 0.45 ? easeOut(t / 0.45) * bump.reach : (1 - easeIn((t - 0.45) / 0.55)) * bump.reach;
      this.drawArrow(bump.route, off, theme.danger, 1);
    }

    // Leaving arrows.
    this.exits = this.exits.filter((e) => {
      const t = (now - e.start) / e.duration;
      if (t < 0) {
        this.drawArrow(e.route, 0, theme.line, 1);
        return true;
      }
      if (t >= 1) return false;
      const p = easeIn(Math.min(1, t * 1.05)) * 0.35 + t * 0.65;
      const alpha = p < e.fadeFrom ? 1 : Math.max(0, 1 - (p - e.fadeFrom) / (1 - e.fadeFrom));
      this.drawArrow(e.route, p * e.travel, theme.line, alpha);
      return true;
    });
    ctx.restore();

    this.drawParticles();
  }

  /** Faint dot at every cell centre (the nodes arrows travel through). */
  private drawGrid(b: Board): void {
    const { ctx, camera: cam } = this;
    // Too dense to read when zoomed far out; skip rather than draw noise.
    if (cam.scale < 6) return;
    const r = Math.min(1.6, Math.max(0.8, cam.scale * 0.04)) / cam.scale;
    // Only the nodes currently on screen.
    const tl = cam.toWorld(0, 0);
    const br = cam.toWorld(this.cssW, this.cssH);
    const x0 = Math.max(0, Math.floor(tl.x));
    const y0 = Math.max(0, Math.floor(tl.y));
    const x1 = Math.min(b.w - 1, Math.ceil(br.x));
    const y1 = Math.min(b.h - 1, Math.ceil(br.y));
    ctx.fillStyle = this.theme.muted;
    ctx.globalAlpha = Math.min(0.4, 0.15 + (cam.scale - 6) * 0.01);
    ctx.beginPath();
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        ctx.moveTo(x + 0.5 + r, y + 0.5);
        ctx.arc(x + 0.5, y + 0.5, r, 0, Math.PI * 2);
      }
    }
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private drawArrow(route: Route, offset: number, color: string, alpha: number): void {
    const ctx = this.ctx;
    const pts = bodyAt(route, offset);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = LINE;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) ctx.lineTo(pts[i].x, pts[i].y);
    // Stop the shaft inside the arrowhead so the tip stays crisp.
    const tip = pts[pts.length - 1];
    const prev = pts[pts.length - 2] ?? pts[0];
    const dir = unit(prev, tip);
    ctx.lineTo(tip.x - dir.x * 0.2, tip.y - dir.y * 0.2);
    ctx.stroke();
    this.drawHead(tip, dir);
    ctx.globalAlpha = 1;
  }

  private drawHead(tip: Pt, d: Pt): void {
    const ctx = this.ctx;
    const len = 0.36;
    const half = 0.22;
    const bx = tip.x - d.x * len;
    const by = tip.y - d.y * len;
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(bx - d.y * half, by + d.x * half);
    ctx.lineTo(bx + d.x * 0.08, by + d.y * 0.08);
    ctx.lineTo(bx + d.y * half, by - d.x * half);
    ctx.closePath();
    ctx.fill();
  }

  private drawHalo(route: Route, offset: number, pulse: number): void {
    const ctx = this.ctx;
    const pts = bodyAt(route, offset);
    ctx.globalAlpha = 0.18 + 0.22 * pulse;
    ctx.strokeStyle = this.theme.accent;
    ctx.lineWidth = 0.62;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawParticles(): void {
    if (!this.particles.length) return;
    const ctx = this.ctx;
    for (const p of this.particles) {
      p.vy += 0.35;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life -= 0.006;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    this.particles = this.particles.filter((p) => p.life > 0 && p.y < this.cssH + 40);
  }
}

function unit(a: Pt, b: Pt): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
}

