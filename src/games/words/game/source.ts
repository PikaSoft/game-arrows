import { WordsLevel } from '../core/types';

/**
 * Builds levels in a worker, which is also the only place the word list is loaded: the
 * game screens never need it, since each level carries every word its grid holds. If
 * workers aren't available, the level builder (and the word list with it) is loaded on
 * demand instead, so it still stays out of the main download.
 */
export class WordsSource {
  private cache = new Map<number, Promise<WordsLevel>>();
  private worker: Worker | null = null;
  private pending = new Map<number, (l: WordsLevel) => void>();

  constructor() {
    try {
      this.worker = new Worker(new URL('./levelWorker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<WordsLevel>) => {
        const done = this.pending.get(e.data.number);
        this.pending.delete(e.data.number);
        done?.(e.data);
      };
      this.worker.onerror = () => {
        this.worker = null;
        for (const [n, done] of this.pending) void this.inline(n).then(done);
        this.pending.clear();
      };
    } catch {
      this.worker = null;
    }
  }

  private inline(n: number): Promise<WordsLevel> {
    return import('../core/levels').then((m) => m.buildWordsLevel(n));
  }

  get(n: number): Promise<WordsLevel> {
    let p = this.cache.get(n);
    if (!p) {
      p = this.worker
        ? new Promise<WordsLevel>((resolve) => {
            this.pending.set(n, resolve);
            this.worker!.postMessage(n);
          })
        : this.inline(n);
      this.cache.set(n, p);
      if (this.cache.size > 8) this.cache.delete(this.cache.keys().next().value!);
    }
    return p;
  }
}
