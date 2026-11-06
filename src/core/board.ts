import { Arrow, Cell, DELTA, Level } from './types';

/** Live board state: which arrow occupies each cell. -1 means empty. */
export class Board {
  readonly w: number;
  readonly h: number;
  readonly grid: Int32Array;
  readonly arrows: Map<number, Arrow> = new Map();

  constructor(level: Pick<Level, 'w' | 'h' | 'arrows'>) {
    this.w = level.w;
    this.h = level.h;
    this.grid = new Int32Array(level.w * level.h).fill(-1);
    for (const a of level.arrows) {
      this.arrows.set(a.id, a);
      for (const c of a.cells) this.grid[c.y * this.w + c.x] = a.id;
    }
  }

  get remaining(): number {
    return this.arrows.size;
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  at(x: number, y: number): number {
    return this.inside(x, y) ? this.grid[y * this.w + x] : -1;
  }

  /**
   * Walk from the head toward the edge. Returns the first blocking cell and its
   * distance from the head, or null when the way out is clear.
   */
  blocker(a: Arrow): { cell: Cell; dist: number; id: number } | null {
    const head = a.cells[a.cells.length - 1];
    const d = DELTA[a.dir];
    let x = head.x + d.x;
    let y = head.y + d.y;
    let dist = 1;
    while (this.inside(x, y)) {
      const id = this.grid[y * this.w + x];
      if (id !== -1) return { cell: { x, y }, dist, id };
      x += d.x;
      y += d.y;
      dist++;
    }
    return null;
  }

  isFree(a: Arrow): boolean {
    return this.blocker(a) === null;
  }

  /** Number of cells from the head to just past the board edge. */
  distToEdge(a: Arrow): number {
    const head = a.cells[a.cells.length - 1];
    switch (a.dir) {
      case 'U': return head.y + 1;
      case 'D': return this.h - head.y;
      case 'L': return head.x + 1;
      case 'R': return this.w - head.x;
    }
  }

  freeArrows(): Arrow[] {
    const out: Arrow[] = [];
    for (const a of this.arrows.values()) if (this.isFree(a)) out.push(a);
    return out;
  }

  remove(id: number): Arrow | undefined {
    const a = this.arrows.get(id);
    if (!a) return undefined;
    for (const c of a.cells) this.grid[c.y * this.w + c.x] = -1;
    this.arrows.delete(id);
    return a;
  }
}
