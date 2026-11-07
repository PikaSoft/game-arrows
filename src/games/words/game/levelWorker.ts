import { buildWordsLevel } from '../core/levels';

self.onmessage = (e: MessageEvent<number>) => {
  (self as unknown as Worker).postMessage(buildWordsLevel(e.data));
};
