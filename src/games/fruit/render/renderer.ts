import { Theme } from '../../../shared/themes';
import { FruitSim, H, RADII, SPAWN_Y, W } from '../core/sim';

/** A ring that spreads from where two fruits joined. */
interface Pop {
  x: number;
  y: number;
  r: number;
  colour: string;
  t0: number;
}

/** Room above the rim for the fruit in hand, and a little under the floor, in bucket units. */
const ABOVE = 0.46;
const BELOW = 0.06;
const POP_MS = 380;
const GROW_MS = 140;

/** Main colour and a darker shade for each fruit, smallest first. */
const COLOURS: [string, string][] = [
  ['#4f6fd8', '#2f478f'],
  ['#e0457b', '#a62a55'],
  ['#8fcf3c', '#5d9422'],
  ['#8a4fb8', '#5b2f82'],
  ['#f4d53a', '#c9a514'],
  ['#f59a2c', '#c26d10'],
  ['#e2413c', '#a52722'],
  ['#f47f6b', '#c7523f'],
  ['#9a6a45', '#6a4428'],
  ['#58b56a', '#2f7a41'],
];

export class FruitRenderer {
  sim: FruitSim | null = null;
  /** Where the fruit in hand hangs (bucket units). */
  aimX = W / 2;

  private ctx: CanvasRenderingContext2D;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private unit = 100;
  private ox = 0;
  private oy = 0;
  private pops: Pop[] = [];
  /** When each merged fruit appeared, so it can swell into place. */
  private born = new Map<number, number>();

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
    this.unit = Math.max(40, Math.min((this.cssW - 28) / W, (this.cssH - 12) / (H + ABOVE + BELOW)));
    this.ox = (this.cssW - W * this.unit) / 2;
    const used = (H + ABOVE + BELOW) * this.unit;
    this.oy = (this.cssH - used) / 2 + ABOVE * this.unit;
  }

  setSim(s: FruitSim | null): void {
    this.sim = s;
    this.pops = [];
    this.born.clear();
  }

  /** Bucket x under a point on the screen. */
  toWorldX(clientX: number): number {
    return (clientX - this.canvas.getBoundingClientRect().left - this.ox) / this.unit;
  }

  /** Two fruits joined at (x, y); `tier` is the fruit made, or -1 for a pop. */
  pop(x: number, y: number, tier: number): void {
    const now = performance.now();
    this.pops.push({ x, y, r: RADII[tier < 0 ? RADII.length - 1 : tier], colour: COLOURS[tier < 0 ? RADII.length - 1 : tier][0], t0: now });
    const s = this.sim;
    if (!s || tier < 0) return;
    // The new fruit is the last one of that size in the list.
    for (let i = s.bodies.length - 1; i >= 0; i--) {
      if (s.bodies[i].tier === tier && !this.born.has(s.bodies[i].id)) {
        this.born.set(s.bodies[i].id, now);
        break;
      }
    }
  }

  draw(): void {
    const { ctx, unit: u, theme } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    const s = this.sim;
    if (!s) return;
    const now = performance.now();
    const X = (x: number) => this.ox + x * u;
    const Y = (y: number) => this.oy + y * u;
    const wall = Math.max(4, u * 0.022);

    // Bucket: a tinted inside and a U-shaped wall.
    ctx.fillStyle = theme.surface;
    ctx.fillRect(X(0), Y(0), W * u, H * u);
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = wall;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(X(0) - wall / 2, Y(0));
    ctx.lineTo(X(0) - wall / 2, Y(H) + wall / 2);
    ctx.lineTo(X(W) + wall / 2, Y(H) + wall / 2);
    ctx.lineTo(X(W) + wall / 2, Y(0));
    ctx.stroke();

    // The rim line: muted normally, pulsing red as the bucket gets close to overflowing.
    const danger = s.danger;
    ctx.save();
    ctx.setLineDash([u * 0.03, u * 0.03]);
    ctx.lineWidth = Math.max(1.5, u * 0.008);
    if (danger > 0 || s.over) {
      ctx.strokeStyle = theme.danger;
      ctx.globalAlpha = s.over ? 1 : 0.45 + 0.55 * Math.abs(Math.sin(now / 110));
      ctx.lineWidth *= 1.6;
    } else {
      ctx.strokeStyle = theme.muted;
      ctx.globalAlpha = 0.7;
    }
    ctx.beginPath();
    ctx.moveTo(X(0), Y(0));
    ctx.lineTo(X(W), Y(0));
    ctx.stroke();
    ctx.restore();

    // The fruit in hand and a faint line showing where it will fall.
    if (s.ready) {
      const x = s.clampX(this.aimX);
      ctx.save();
      ctx.strokeStyle = theme.muted;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = Math.max(1, u * 0.005);
      ctx.setLineDash([u * 0.012, u * 0.024]);
      ctx.beginPath();
      ctx.moveTo(X(x), Y(SPAWN_Y + RADII[s.current]));
      ctx.lineTo(X(x), Y(H));
      ctx.stroke();
      ctx.restore();
      this.fruit(X(x), Y(SPAWN_Y), RADII[s.current] * u, s.current, 0);
    }

    for (const b of s.bodies) {
      let scale = 1;
      const t0 = this.born.get(b.id);
      if (t0 !== undefined) {
        const k = (now - t0) / GROW_MS;
        if (k >= 1) this.born.delete(b.id);
        else scale = 0.7 + 0.3 * k;
      }
      this.fruit(X(b.x), Y(b.y), RADII[b.tier] * u * scale, b.tier, b.angle);
    }

    this.pops = this.pops.filter((p) => now - p.t0 < POP_MS);
    for (const p of this.pops) {
      const k = (now - p.t0) / POP_MS;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = p.colour;
      ctx.lineWidth = Math.max(2, u * 0.02 * (1 - k));
      ctx.beginPath();
      ctx.arc(X(p.x), Y(p.y), p.r * u * (1 + 0.6 * k), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // What comes after the fruit in hand.
    const nr = Math.min(RADII[s.next] * u, u * 0.075);
    const nx = X(W) - u * 0.085;
    const ny = Y(-ABOVE) + u * 0.13;
    ctx.fillStyle = theme.muted;
    ctx.font = `600 ${Math.max(10, u * 0.038)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('NEXT', nx, ny - u * 0.085);
    this.fruit(nx, ny, nr, s.next, 0);
  }

  /** One fruit: a shaded ball with its own markings, turned by `angle`. */
  private fruit(cx: number, cy: number, r: number, tier: number, angle: number): void {
    const { ctx } = this;
    const [main, dark] = COLOURS[tier];
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = main;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // Markings are drawn on a ball of radius 1.
    ctx.save();
    ctx.rotate(angle);
    ctx.scale(r, r);
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    this.markings(tier, dark);
    ctx.restore();

    ctx.strokeStyle = dark;
    ctx.lineWidth = Math.max(1, r * 0.09);
    ctx.beginPath();
    ctx.arc(0, 0, r - ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.stroke();
    // A highlight that stays put while the fruit rolls.
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.36, -r * 0.42, r * 0.26, r * 0.15, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private markings(tier: number, dark: string): void {
    const { ctx } = this;
    const dot = (x: number, y: number, r: number) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };
    const leaf = (x: number, y: number, len: number, turn: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(turn);
      ctx.fillStyle = '#4c9a3f';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(len * 0.5, -len * 0.45, len, 0);
      ctx.quadraticCurveTo(len * 0.5, len * 0.45, 0, 0);
      ctx.fill();
      ctx.restore();
    };
    /** Cut-fruit look: a paler inside split into wedges. */
    const wedges = (inner: string, n: number) => {
      ctx.fillStyle = inner;
      dot(0, 0, 0.74);
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 0.07;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * 0.74, Math.sin(a) * 0.74);
      }
      ctx.stroke();
      ctx.lineWidth = 0.08;
      ctx.beginPath();
      ctx.arc(0, 0, 0.74, 0, Math.PI * 2);
      ctx.stroke();
    };
    ctx.fillStyle = dark;
    ctx.strokeStyle = dark;
    switch (tier) {
      case 0: {
        // Blueberry: a little crown.
        dot(0, -0.25, 0.3);
        ctx.fillStyle = '#7f9bf0';
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
          dot(Math.cos(a) * 0.3, -0.25 + Math.sin(a) * 0.3, 0.1);
        }
        break;
      }
      case 1: {
        // Raspberry: a cluster of beads.
        ctx.globalAlpha = 0.55;
        for (let ring = 0; ring < 2; ring++) {
          const n = ring ? 9 : 4;
          const d = ring ? 0.72 : 0.3;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + ring * 0.3;
            dot(Math.cos(a) * d, Math.sin(a) * d, 0.17);
          }
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 2:
        wedges('#d9f29a', 8);
        break;
      case 3: {
        // Plum: a crease down one side and a stem.
        ctx.lineWidth = 0.09;
        ctx.beginPath();
        ctx.moveTo(0.05, -0.95);
        ctx.quadraticCurveTo(0.45, 0, 0.05, 0.95);
        ctx.stroke();
        ctx.strokeStyle = '#5a3a1e';
        ctx.lineWidth = 0.12;
        ctx.beginPath();
        ctx.moveTo(0.05, -0.95);
        ctx.lineTo(-0.1, -0.62);
        ctx.stroke();
        break;
      }
      case 4: {
        // Lemon: a nub at each end and a few pores.
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.ellipse(-1, 0, 0.28, 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(1, 0, 0.28, 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        dot(-0.2, 0.35, 0.05);
        dot(0.3, 0.1, 0.05);
        dot(0.1, -0.45, 0.05);
        dot(-0.45, -0.1, 0.05);
        ctx.globalAlpha = 1;
        break;
      }
      case 5: {
        // Orange: pores and a leaf at the stalk.
        ctx.globalAlpha = 0.5;
        for (let i = 0; i < 7; i++) {
          const a = i * 2.4;
          dot(Math.cos(a) * (0.25 + 0.08 * i), Math.sin(a) * (0.25 + 0.08 * i) + 0.1, 0.045);
        }
        ctx.globalAlpha = 1;
        dot(0, -0.72, 0.09);
        leaf(0, -0.72, 0.5, -0.5);
        break;
      }
      case 6: {
        // Apple: a dip at the top, a stem and a leaf.
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.ellipse(0, -0.82, 0.34, 0.16, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#5a3a1e';
        ctx.lineWidth = 0.09;
        ctx.beginPath();
        ctx.moveTo(0, -0.8);
        ctx.quadraticCurveTo(0.02, -0.6, -0.08, -0.45);
        ctx.stroke();
        leaf(0, -0.7, 0.42, -0.35);
        break;
      }
      case 7:
        wedges('#ffc1b0', 10);
        break;
      case 8: {
        // Coconut: husk lines and three eyes.
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 0.05;
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.moveTo(i * 0.38, -1);
          ctx.quadraticCurveTo(i * 0.5, 0, i * 0.38, 1);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#3d2614';
        dot(-0.2, -0.38, 0.1);
        dot(0.2, -0.38, 0.1);
        dot(0, -0.08, 0.1);
        break;
      }
      default: {
        // Melon: stripes that bow outward.
        ctx.lineWidth = 0.13;
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.moveTo(i * 0.2, -1);
          ctx.quadraticCurveTo(i * 0.72, 0, i * 0.2, 1);
          ctx.stroke();
        }
        ctx.fillStyle = '#5a3a1e';
        dot(0, -0.9, 0.09);
      }
    }
  }
}
