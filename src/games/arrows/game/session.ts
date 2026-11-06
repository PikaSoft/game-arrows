import { Board } from '../core/board';
import { Arrow, Level } from '../core/types';

export const START_HEARTS = 3;
export const START_HINTS = 3;

export type TapResult =
  | { kind: 'exit'; arrow: Arrow; distToEdge: number }
  | { kind: 'blocked'; arrow: Arrow; distToBlocker: number; lostHeart: boolean; outOfHearts: boolean }
  | { kind: 'none' };

/** Rules for one play-through of a level. No rendering or timing in here. */
export class Session {
  readonly level: Level;
  readonly board: Board;
  hearts = START_HEARTS;
  hints = START_HINTS;
  /** True once the player chose to keep going after running out of hearts. */
  continued = false;
  /** Player input is locked while the remaining arrows auto-finish. */
  autoFinishing = false;
  elapsedMs = 0;
  hintId: number | null = null;
  private freeCache: number | null = null;

  constructor(level: Level) {
    this.level = level;
    this.board = new Board(level);
  }

  get remaining(): number {
    return this.board.remaining;
  }

  get freeCount(): number {
    if (this.freeCache === null) this.freeCache = this.board.freeArrows().length;
    return this.freeCache;
  }

  get won(): boolean {
    return this.board.remaining === 0;
  }

  get timerRunning(): boolean {
    return !this.won && !this.autoFinishing;
  }

  /** Waiting on the player to decide after the last heart was spent. */
  get awaitingContinue(): boolean {
    return this.hearts === 0 && !this.continued;
  }

  stars(): number {
    if (this.continued) return 0;
    return this.hearts;
  }

  tap(id: number): TapResult {
    if (this.autoFinishing || this.awaitingContinue) return { kind: 'none' };
    const arrow = this.board.arrows.get(id);
    if (!arrow) return { kind: 'none' };
    const block = this.board.blocker(arrow);
    if (!block) return { kind: 'exit', arrow, distToEdge: this.exit(arrow) };
    const lostHeart = this.hearts > 0 && !this.continued;
    if (lostHeart) this.hearts--;
    return {
      kind: 'blocked',
      arrow,
      distToBlocker: block.dist,
      lostHeart,
      outOfHearts: lostHeart && this.hearts === 0,
    };
  }

  private exit(arrow: Arrow): number {
    const d = this.board.distToEdge(arrow);
    this.board.remove(arrow.id);
    this.freeCache = null;
    if (this.hintId === arrow.id) this.hintId = null;
    return d;
  }

  /** True when arrows remain and every one of them can leave now. */
  shouldAutoFinish(): boolean {
    return this.remaining > 0 && this.freeCount === this.remaining;
  }

  /** Remove all remaining arrows (they are all free). Returns them with exit distances. */
  startAutoFinish(): { arrow: Arrow; distToEdge: number }[] {
    this.autoFinishing = true;
    this.hintId = null;
    const all = [...this.board.arrows.values()];
    // Leave in an order that never passes through a still-present arrow visually:
    // nearest to the edge first.
    all.sort((a, b) => this.board.distToEdge(a) - this.board.distToEdge(b));
    return all.map((a) => ({ arrow: a, distToEdge: this.exit(a) }));
  }

  continueWithoutHearts(): void {
    this.continued = true;
  }

  useHint(): Arrow | null {
    if (this.hints <= 0 || this.autoFinishing || this.won) return null;
    const free = this.board.freeArrows();
    if (free.length === 0) return null;
    // Prefer an arrow that unblocks others, so the hint actually teaches something.
    const blockers = new Set<number>();
    for (const a of this.board.arrows.values()) {
      const b = this.board.blocker(a);
      if (b) blockers.add(b.id);
    }
    const pick = free.find((a) => blockers.has(a.id)) ?? free[0];
    this.hints--;
    this.hintId = pick.id;
    return pick;
  }
}
