import { Dir } from '../core/types';

/** Distance in CSS pixels a finger must travel before it counts as a swipe. */
const SWIPE_PX = 18;

/**
 * Swipe anywhere on `el` to steer. A turn fires as soon as the finger has moved far enough,
 * then the anchor moves to the finger, so one continuous drag can make several turns.
 * A press that never moved far enough is a tap.
 */
export function attachSwipe(el: HTMLElement, onDir: (d: Dir) => void, onTap: () => void): void {
  let press: { id: number; x: number; y: number; moved: boolean } | null = null;
  el.addEventListener('pointerdown', (e) => {
    if (press) return;
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events */
    }
  });
  el.addEventListener('pointermove', (e) => {
    if (!press || press.id !== e.pointerId) return;
    const dx = e.clientX - press.x;
    const dy = e.clientY - press.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
    const d: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
    press.x = e.clientX;
    press.y = e.clientY;
    press.moved = true;
    onDir(d);
  });
  const end = (e: PointerEvent, cancelled: boolean) => {
    if (!press || press.id !== e.pointerId) return;
    const tap = !press.moved && !cancelled;
    press = null;
    if (tap) onTap();
  };
  el.addEventListener('pointerup', (e) => end(e, false));
  el.addEventListener('pointercancel', (e) => end(e, true));
}

const KEYS: Record<string, Dir> = {
  ArrowUp: 0,
  ArrowRight: 1,
  ArrowDown: 2,
  ArrowLeft: 3,
  w: 0,
  d: 1,
  s: 2,
  a: 3,
  W: 0,
  D: 1,
  S: 2,
  A: 3,
};

export const keyDir = (key: string): Dir | undefined => KEYS[key];
