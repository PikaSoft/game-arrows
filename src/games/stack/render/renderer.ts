import { Theme } from '../../../shared/themes';
import { FIELD_W, Slab, StackSim } from '../core/sim';

/** A cut-off piece falling away. */
interface Falling {
  slab: Slab;
  floor: number;
  t0: number;
  /** Which way it tips: -1 left, 1 right. */
  side: number;
  hue: number;
}

/** Floors kept in view below the top. */
const VIEW_BELOW = 9;
const GRAVITY = 30; // units per second squared

export class StackRenderer {
  sim: StackSim | null = null;
  /** First floor's colour; each floor above shifts a little round the colour wheel. */
  hue = 200;
  unit = 30;

  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private camera = 0;
  private falling: Falling[] = [];
  private flash: { t0: number; streak: number } | null = null;

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
    this.unit = Math.max(10, Math.min((this.cssW - 16) / (FIELD_W + 1), this.cssH / (VIEW_BELOW + 7)));
  }

  setSim(s: StackSim | null, hue = 200): void {
    this.sim = s;
    this.hue = hue;
    this.camera = 0;
    this.falling = [];
    this.flash = null;
  }

  colourOf(floor: number, light = 0): string {
    return `hsl(${(this.hue + floor * 7) % 360}, 55%, ${58 + light}%)`;
  }

  drop(slab: Slab, floor: number, side: number): void {
    this.falling.push({ slab, floor, t0: performance.now(), side, hue: floor });
  }

  perfect(streak: number): void {
    this.flash = { t0: performance.now(), streak };
  }

  /** Draw a frame. `moving` is the sliding block's left edge, or null if there is none. */
  draw(moving: number | null): void {
    const ctx = this.ctx;
    const u = this.unit;
    const now = performance.now();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    const s = this.sim;
    if (!s) return;
    // The camera glides up so the top of the tower stays in the upper middle.
    const want = Math.max(0, s.stack.length - VIEW_BELOW);
    this.camera += (want - this.camera) * 0.12;
    if (Math.abs(want - this.camera) < 0.001) this.camera = want;
    const ox = (this.cssW - FIELD_W * u) / 2;
    // Floor k's bottom edge on screen.
    const groundY = this.cssH - u * 1.2;
    const yOf = (floor: number) => groundY - (floor - this.camera + 1) * u;
    const slab = (x: number, floor: number, w: number, colour: string, dark: string) => {
      const px = ox + x * u;
      const py = yOf(floor);
      ctx.fillStyle = dark;
      ctx.fillRect(px, py + u * 0.78, w * u, u * 0.22);
      ctx.fillStyle = colour;
      ctx.fillRect(px, py, w * u, u * 0.8);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(px, py, w * u, u * 0.12);
    };
    // The ground, under the first block.
    if (this.camera < 1) {
      ctx.fillStyle = this.theme.line;
      ctx.globalAlpha = 0.25;
      ctx.fillRect(0, yOf(0) + u, this.cssW, this.cssH);
      ctx.globalAlpha = 1;
    }
    const first = Math.max(0, Math.floor(this.camera) - 1);
    for (let k = first; k < s.stack.length; k++) {
      const b = s.stack[k];
      slab(b.x, k, b.w, this.colourOf(k), this.colourOf(k, -18));
    }
    if (moving !== null && !s.over) {
      const k = s.stack.length;
      slab(moving, k, s.width, this.colourOf(k), this.colourOf(k, -18));
    }
    // Cut-off pieces fall, tipping as they go.
    this.falling = this.falling.filter((f) => now - f.t0 < 1600);
    for (const f of this.falling) {
      const t = (now - f.t0) / 1000;
      const drop = 0.5 * GRAVITY * t * t;
      const px = ox + (f.slab.x + f.slab.w / 2) * u;
      const py = yOf(f.floor) + drop * u + u * 0.4;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(f.side * t * 2.2);
      ctx.globalAlpha = Math.max(0, 1 - t / 1.6);
      ctx.fillStyle = this.colourOf(f.hue);
      ctx.fillRect((-f.slab.w / 2) * u, -0.4 * u, f.slab.w * u, 0.8 * u);
      ctx.restore();
    }
    // Perfect drop: a ring round the top block and a word above it.
    if (this.flash) {
      const t = (now - this.flash.t0) / 700;
      if (t >= 1) this.flash = null;
      else {
        const top = s.top;
        const k = s.stack.length - 1;
        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = 1 - t;
        ctx.lineWidth = 3;
        const grow = t * u * 0.6;
        ctx.strokeRect(ox + top.x * u - grow, yOf(k) - grow, top.w * u + grow * 2, u * 0.8 + grow * 2);
        ctx.fillStyle = this.theme.text;
        ctx.font = `800 ${Math.round(u * 0.6)}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(this.flash.streak > 1 ? `Perfect x${this.flash.streak}` : 'Perfect!', this.cssW / 2, yOf(k) - u * (1.2 + t * 0.8));
        ctx.globalAlpha = 1;
      }
    }
    // The height so far, big and faint behind everything near the top.
    ctx.fillStyle = this.theme.text;
    ctx.globalAlpha = 0.12;
    ctx.font = `900 ${Math.round(u * 3)}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(String(s.score), this.cssW / 2, u * 0.4);
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = 1;
  }
}
