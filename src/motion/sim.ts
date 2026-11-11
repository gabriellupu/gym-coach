import type { Exercise } from '../domain/types';
import type { BodyState } from './body';

/**
 * A stand-in trainee for the desktop preview and tests: produces the head and
 * hand motion a real person doing the exercise would, at a given rep phase.
 * `phase` 0 → rest, 0.5 → far end of the rep, 1 → rest.
 */
export function simulateBody(e: Exercise, phase: number, standH = 1.62, at = { x: 0, z: 0 }): BodyState {
  const u = (1 - Math.cos(phase * Math.PI * 2)) / 2;
  const H = standH;
  let headY = H;
  if (e.posture === 'prone') headY = 0.36 * H;
  if (e.posture === 'supine') headY = e.gear.includes('bench') ? 0.34 * H : 0.08 * H;
  if (e.posture === 'seated') headY = 0.72 * H;
  let handRel = -0.42 * H;
  let spread = 0.4;
  const d = e.detect;
  if (d.by === 'motion') {
    const travel = d.amp * 1.5 * H * u * d.dir;
    if (d.signal === 'headY') headY += travel;
    else if (d.signal === 'handsSpread') spread += Math.abs(travel);
    else {
      if (d.dir < 0) handRel = 0.25 * H;
      handRel += travel;
    }
  }
  if (e.hold?.signal === 'handsY') handRel = 0.2 * H;
  if (e.hold?.signal === 'headY') headY = ((e.hold.min + e.hold.max) / 2) * H;
  const head = { x: at.x, y: headY, z: at.z };
  const hand = (s: number) => ({ x: at.x + (s * spread) / 2, y: headY + handRel, z: at.z - 0.25 });
  const left = hand(-1);
  const right = hand(1);
  if (d.by === 'motion' && d.signal === 'handHiY') right.y = headY - 0.42 * H; // support hand stays put
  return { head, left, right, standH };
}
