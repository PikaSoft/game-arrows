/** Jolt (m/s², gravity removed) below which phone movement is not a shake. */
export const SHAKE_MIN = 12;
/** Jolt that gives a full-strength shake. */
export const SHAKE_FULL = 30;
/** Shortest gap between two shakes, so one hard shake is not counted many times. */
export const SHAKE_GAP_MS = 280;

/** How hard a shake is (0 to 1) for a jolt of `mag` m/s², or 0 if it is not a shake. */
export function shakeStrength(mag: number): number {
  if (!Number.isFinite(mag) || mag < SHAKE_MIN) return 0;
  return Math.min(1, 0.4 + (0.6 * (mag - SHAKE_MIN)) / (SHAKE_FULL - SHAKE_MIN));
}

type PermissionApi = { requestPermission?: () => Promise<string> };
type Vec = { x: number | null; y: number | null; z: number | null } | null;

const ok = (v: Vec): v is { x: number; y: number; z: number } =>
  !!v && [v.x, v.y, v.z].every((n) => typeof n === 'number' && Number.isFinite(n));

/**
 * Listens for the phone being shaken and calls `onShake` with how hard (0 to 1). iOS only
 * reports motion after permission is asked from a tap, so call `ask()` from a tap handler;
 * elsewhere it starts on its own. Without a sensor nothing happens.
 */
export class PhoneShake {
  private asked = false;
  private allowed = false;
  private wanted = false;
  private listening = false;
  private lastShake = 0;
  /** Running estimate of gravity, for phones that only report it mixed in. */
  private grav: { x: number; y: number; z: number } | null = null;

  constructor(private onShake: (strength: number) => void) {}

  private onMotion = (e: DeviceMotionEvent) => {
    let mag: number;
    if (ok(e.acceleration)) {
      const a = e.acceleration;
      mag = Math.hypot(a.x, a.y, a.z);
    } else if (ok(e.accelerationIncludingGravity)) {
      const a = e.accelerationIncludingGravity;
      const g = (this.grav ??= { ...a });
      g.x += (a.x - g.x) * 0.1;
      g.y += (a.y - g.y) * 0.1;
      g.z += (a.z - g.z) * 0.1;
      mag = Math.hypot(a.x - g.x, a.y - g.y, a.z - g.z);
    } else return;
    const strength = shakeStrength(mag);
    if (!strength) return;
    const now = performance.now();
    if (now - this.lastShake < SHAKE_GAP_MS) return;
    this.lastShake = now;
    this.onShake(strength);
  };

  start(): void {
    this.wanted = true;
    if (this.listening || typeof window === 'undefined' || !('DeviceMotionEvent' in window)) return;
    const api = DeviceMotionEvent as unknown as PermissionApi;
    if (typeof api.requestPermission === 'function' && !this.allowed) return;
    window.addEventListener('devicemotion', this.onMotion);
    this.listening = true;
  }

  stop(): void {
    this.wanted = false;
    if (typeof window !== 'undefined') window.removeEventListener('devicemotion', this.onMotion);
    this.listening = false;
    this.grav = null;
  }

  /** Ask for the sensor once. Must run inside a tap. */
  ask(): void {
    if (this.asked || typeof window === 'undefined' || !('DeviceMotionEvent' in window)) return;
    const api = DeviceMotionEvent as unknown as PermissionApi;
    if (typeof api.requestPermission !== 'function') return;
    this.asked = true;
    api
      .requestPermission()
      .then((r) => {
        this.allowed = r === 'granted';
        if (this.allowed && this.wanted) this.start();
      })
      .catch(() => {
        // Declined or not allowed here: shaking does nothing.
      });
  }
}
