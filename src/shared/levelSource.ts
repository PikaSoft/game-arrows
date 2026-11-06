/**
 * Builds levels off the main thread so big boards never freeze the UI.
 * Falls back to building inline if workers are unavailable.
 * The worker receives a level number and posts back a level with that `number`.
 */
export class LevelSource<T extends { number: number }> {
  private cache = new Map<number, Promise<T>>();
  private worker: Worker | null = null;
  private pending = new Map<number, (l: T) => void>();

  constructor(
    private build: (n: number) => T,
    makeWorker: () => Worker,
  ) {
    try {
      this.worker = makeWorker();
      this.worker.onmessage = (e: MessageEvent<T>) => {
        const done = this.pending.get(e.data.number);
        this.pending.delete(e.data.number);
        done?.(e.data);
      };
      this.worker.onerror = () => {
        this.worker = null;
        for (const [n, done] of this.pending) done(this.build(n));
        this.pending.clear();
      };
    } catch {
      this.worker = null;
    }
  }

  get(n: number): Promise<T> {
    let p = this.cache.get(n);
    if (!p) {
      p = new Promise<T>((resolve) => {
        if (this.worker) {
          this.pending.set(n, resolve);
          this.worker.postMessage(n);
        } else {
          setTimeout(() => resolve(this.build(n)), 0);
        }
      });
      this.cache.set(n, p);
      if (this.cache.size > 12) this.cache.delete(this.cache.keys().next().value!);
    }
    return p;
  }
}
