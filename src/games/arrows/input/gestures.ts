import { Camera } from '../render/camera';

export interface GestureHandlers {
  onTap(x: number, y: number): void;
  onViewChange(): void;
  onFirstTouch?(): void;
}

/** Tap, drag-to-pan, pinch-to-zoom and wheel zoom on one element. */
export function attachGestures(el: HTMLElement, cam: Camera, h: GestureHandlers): () => void {
  const pts = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
  let moved = false;
  let multi = false;
  let lastPinch: { d: number; mx: number; my: number } | null = null;

  const local = (e: PointerEvent | WheelEvent) => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const pinchState = () => {
    const [a, b] = [...pts.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };

  const down = (e: PointerEvent) => {
    h.onFirstTouch?.();
    el.setPointerCapture?.(e.pointerId);
    const p = local(e);
    pts.set(e.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y, t: performance.now() });
    if (pts.size === 1) {
      moved = false;
      multi = false;
    } else {
      multi = true;
      lastPinch = pinchState();
    }
  };

  const move = (e: PointerEvent) => {
    const rec = pts.get(e.pointerId);
    if (!rec) return;
    const p = local(e);
    const dx = p.x - rec.x;
    const dy = p.y - rec.y;
    rec.x = p.x;
    rec.y = p.y;
    if (pts.size >= 2 && lastPinch) {
      const now = pinchState();
      cam.zoomAt(now.mx, now.my, now.d / Math.max(1, lastPinch.d));
      cam.pan(now.mx - lastPinch.mx, now.my - lastPinch.my);
      lastPinch = now;
      h.onViewChange();
      return;
    }
    if (!moved && Math.hypot(p.x - rec.sx, p.y - rec.sy) > 8) moved = true;
    if (moved) {
      cam.pan(dx, dy);
      h.onViewChange();
    }
  };

  const up = (e: PointerEvent) => {
    const rec = pts.get(e.pointerId);
    pts.delete(e.pointerId);
    if (!rec) return;
    if (pts.size < 2) lastPinch = null;
    if (pts.size === 0 && !moved && !multi && e.type === 'pointerup') h.onTap(rec.x, rec.y);
  };

  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = local(e);
    if (e.ctrlKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
      cam.zoomAt(p.x, p.y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    } else {
      cam.pan(-e.deltaX, -e.deltaY);
    }
    h.onViewChange();
  };

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', wheel, { passive: false });
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    el.removeEventListener('wheel', wheel);
  };
}
