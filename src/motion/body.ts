import type { Signal } from '../domain/types';

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** What the headset can see of the trainee, in floor-level space (y up, metres). */
export interface BodyState {
  head: V3;
  left: V3 | null;
  right: V3 | null;
  /** Calibrated standing head height. */
  standH: number;
}

const dist = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Reads a scalar signal off the body, or null when the tracking it needs is missing. */
export function readSignal(sig: Signal, b: BodyState): number | null {
  const H = b.standH || 1.6;
  const hands = [b.left, b.right].filter((h): h is V3 => !!h);
  switch (sig) {
    case 'headY':
      return b.head.y / H;
    case 'handsY':
      return hands.length ? (hands.reduce((s, h) => s + h.y, 0) / hands.length - b.head.y) / H : null;
    case 'handHiY':
      return hands.length ? (Math.max(...hands.map((h) => h.y)) - b.head.y) / H : null;
    case 'handsSpread':
      return hands.length === 2 ? dist(hands[0], hands[1]) / H : null;
    case 'handsReach':
      return hands.length ? hands.reduce((s, h) => s + dist(h, b.head), 0) / hands.length / H : null;
  }
}
