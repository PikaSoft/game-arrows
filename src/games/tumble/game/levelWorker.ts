import { buildTumbleLevel } from '../core/levels';

self.onmessage = (e: MessageEvent<number>) => {
  (self as unknown as Worker).postMessage(buildTumbleLevel(e.data));
};
