import { buildLevel } from '../core/levels';
import { Level } from '../core/types';

/**
 * Builds levels off the main thread so large boards never freeze the UI.
 * Falls back to building inline if workers are unavailable.
 */
export class LevelSource {
  private cache = new Map<number, Promise<Level>>();
  private worker: Worker | null = null;
  private pending = new Map<number, (l: Level) => void>();

  constructor() {
    try {
      this.worker = new Worker(new URL('./levelWorker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<Level>) => {
        const done = this.pending.get(e.data.number);
        this.pending.delete(e.data.number);
        done?.(e.data);
      };
      this.worker.onerror = () => {
        this.worker = null;
        for (const [n, done] of this.pending) done(buildLevel(n));
        this.pending.clear();
      };
    } catch {
      this.worker = null;
    }
  }

  get(n: number): Promise<Level> {
    let p = this.cache.get(n);
    if (!p) {
      p = new Promise<Level>((resolve) => {
        if (this.worker) {
          this.pending.set(n, resolve);
          this.worker.postMessage(n);
        } else {
          setTimeout(() => resolve(buildLevel(n)), 0);
        }
      });
      this.cache.set(n, p);
      if (this.cache.size > 12) this.cache.delete(this.cache.keys().next().value!);
    }
    return p;
  }
}
