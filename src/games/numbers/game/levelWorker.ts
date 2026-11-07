import { buildNumbersLevel } from '../core/levels';

self.onmessage = (e: MessageEvent<number>) => {
  (self as unknown as Worker).postMessage(buildNumbersLevel(e.data));
};
