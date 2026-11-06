import { buildSqueezeLevel } from '../core/levels';

self.onmessage = (e: MessageEvent<number>) => {
  (self as unknown as Worker).postMessage(buildSqueezeLevel(e.data));
};
