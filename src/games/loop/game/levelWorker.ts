import { buildLoopLevel } from '../core/levels';

self.onmessage = (e: MessageEvent<number>) => {
  (self as unknown as Worker).postMessage(buildLoopLevel(e.data));
};
