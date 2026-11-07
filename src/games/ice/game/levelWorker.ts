import { buildIceLevel } from '../core/levels';

self.onmessage = (e: MessageEvent<number>) => {
  (self as unknown as Worker).postMessage(buildIceLevel(e.data));
};
