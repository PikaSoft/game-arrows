import { MAX_TILT_DEG } from '../core/sim';

/** Phone tip (degrees) that is ignored, so a phone held roughly upright does not creep. */
export const DEAD_ZONE_DEG = 3;
/** Phone tip (degrees) that gives the bucket its full lean. Tipping further adds nothing. */
export const FULL_TIP_DEG = 20;

/** How far the bucket leans (radians) for a phone tipped `deg` degrees to the right. */
export function tiltFromPhone(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const over = Math.abs(deg) - DEAD_ZONE_DEG;
  if (over <= 0) return 0;
  const k = Math.min(1, over / (FULL_TIP_DEG - DEAD_ZONE_DEG));
  return (Math.sign(deg) * k * MAX_TILT_DEG * Math.PI) / 180;
}

/**
 * How far the screen's left-to-right line dips from level, in degrees (positive: right side
 * down), from a deviceorientation reading and the screen's rotation. Works whether the phone
 * is held flat or upright.
 */
export function sidewaysTip(e: { beta: number | null; gamma: number | null }, screenAngle: number): number | null {
  const { beta, gamma } = e;
  if (beta === null || gamma === null || !Number.isFinite(beta) || !Number.isFinite(gamma)) return null;
  const b = (beta * Math.PI) / 180;
  const g = (gamma * Math.PI) / 180;
  // "Up" in the phone's own frame (x to the right edge, y to the top edge, z out of the screen).
  const upX = -Math.sin(g) * Math.cos(b);
  const upY = Math.sin(b);
  // The screen's left-to-right direction in the phone's frame, for each way the screen can be turned.
  let along: number;
  switch (((Math.round(screenAngle / 90) % 4) + 4) % 4) {
    case 1:
      along = -upY;
      break;
    case 2:
      along = -upX;
      break;
    case 3:
      along = upY;
      break;
    default:
      along = upX;
  }
  return (Math.asin(Math.max(-1, Math.min(1, -along))) * 180) / Math.PI;
}

type PermissionApi = { requestPermission?: () => Promise<string> };

/**
 * Follows the phone's tip. iOS only reports it after permission is asked from a tap, so
 * call `ask()` from a tap handler; elsewhere it starts on its own. Without a sensor the
 * target just stays at zero.
 */
export class PhoneTilt {
  /** Lean the phone is asking for, in radians. */
  target = 0;
  private asked = false;
  private allowed = false;
  private wanted = false;
  private listening = false;

  private onOrient = (e: DeviceOrientationEvent) => {
    const so = (screen as Screen & { orientation?: { angle: number } }).orientation;
    const angle = so ? so.angle : Number((window as unknown as { orientation?: number }).orientation) || 0;
    const tip = sidewaysTip(e, angle);
    this.target = tip === null ? 0 : tiltFromPhone(tip);
  };

  /** Start following the phone (once it is allowed to). */
  start(): void {
    this.wanted = true;
    if (this.listening || typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return;
    const api = DeviceOrientationEvent as unknown as PermissionApi;
    // On iOS nothing arrives until ask() has been answered.
    if (typeof api.requestPermission === 'function' && !this.allowed) return;
    window.addEventListener('deviceorientation', this.onOrient);
    this.listening = true;
  }

  stop(): void {
    this.wanted = false;
    if (typeof window !== 'undefined') window.removeEventListener('deviceorientation', this.onOrient);
    this.listening = false;
    this.target = 0;
  }

  /** Ask for the sensor once. Must run inside a tap. */
  ask(): void {
    if (this.asked || typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return;
    const api = DeviceOrientationEvent as unknown as PermissionApi;
    if (typeof api.requestPermission !== 'function') return;
    this.asked = true;
    api
      .requestPermission()
      .then((r) => {
        this.allowed = r === 'granted';
        if (this.allowed && this.wanted) this.start();
      })
      .catch(() => {
        // Declined or not allowed here: the game plays level.
      });
  }
}
