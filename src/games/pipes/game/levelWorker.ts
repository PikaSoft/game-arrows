import { buildPipeLevel } from '../core/levels';

self.onmessage = (e: MessageEvent<number>) => {
  (self as unknown as Worker).postMessage(buildPipeLevel(e.data));
};
