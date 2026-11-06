/** Maps board cells (1 unit each) to CSS pixels on the canvas. */
export class Camera {
  scale = 20; // CSS px per cell
  ox = 0; // screen x of board origin
  oy = 0;
  private fitScale = 20;
  private viewW = 0;
  private viewH = 0;
  private boardW = 1;
  private boardH = 1;

  setView(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
  }

  setBoard(w: number, h: number): void {
    this.boardW = w;
    this.boardH = h;
  }

  fit(): void {
    const pad = 16;
    const s = Math.min((this.viewW - pad * 2) / this.boardW, (this.viewH - pad * 2) / this.boardH);
    this.fitScale = Math.max(2, Math.min(s, 72));
    this.scale = this.fitScale;
    this.ox = (this.viewW - this.boardW * this.scale) / 2;
    this.oy = (this.viewH - this.boardH * this.scale) / 2;
  }

  get isFitted(): boolean {
    return Math.abs(this.scale - this.fitScale) < 0.01;
  }

  get maxScale(): number {
    return Math.max(this.fitScale * 6, 56);
  }

  toWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.ox) / this.scale, y: (sy - this.oy) / this.scale };
  }

  /** Zoom by `factor` keeping the screen point (sx, sy) fixed. */
  zoomAt(sx: number, sy: number, factor: number): void {
    const next = Math.min(this.maxScale, Math.max(this.fitScale * 0.9, this.scale * factor));
    const f = next / this.scale;
    this.ox = sx - (sx - this.ox) * f;
    this.oy = sy - (sy - this.oy) * f;
    this.scale = next;
    this.clamp();
  }

  /** Bring a board point to the middle of the view if it is near or past the edge. */
  reveal(x: number, y: number): void {
    if (this.isFitted) return; // the whole board is already visible
    const sx = this.ox + x * this.scale;
    const sy = this.oy + y * this.scale;
    const m = 48;
    if (sx > m && sy > m && sx < this.viewW - m && sy < this.viewH - m) return;
    this.pan(this.viewW / 2 - sx, this.viewH / 2 - sy);
  }

  pan(dx: number, dy: number): void {
    this.ox += dx;
    this.oy += dy;
    this.clamp();
  }

  /** Keep at least part of the board on screen. */
  private clamp(): void {
    const bw = this.boardW * this.scale;
    const bh = this.boardH * this.scale;
    const margin = 60;
    if (bw <= this.viewW) this.ox = Math.min(Math.max(this.ox, 0), this.viewW - bw);
    else this.ox = Math.min(Math.max(this.ox, this.viewW - bw - margin), margin);
    if (bh <= this.viewH) this.oy = Math.min(Math.max(this.oy, 0), this.viewH - bh);
    else this.oy = Math.min(Math.max(this.oy, this.viewH - bh - margin), margin);
  }
}
