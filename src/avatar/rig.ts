import { Quaternion, Vector3 } from 'three';

/**
 * Body proportions, metres. These are the rest-pose measurements of the coach model
 * (public/models/coach.glb), so the solved joints land exactly on his skeleton.
 */
export const DIM = {
  hipH: 0.906, thigh: 0.405, shin: 0.377, footH: 0.128, footLen: 0.2, hipW: 0.089,
  spine: 0.28, chest: 0.296, neck: 0.11, headR: 0.105, shoulderW: 0.192, shoulderDrop: 0.053,
  upper: 0.273, fore: 0.231, hand: 0.1,
};
/** Hip → shoulder-line distance. */
export const TORSO = DIM.spine + DIM.chest - DIM.shoulderDrop;
export const ARM = DIM.upper + DIM.fore;
export const LEG = DIM.thigh + DIM.shin;

type T3 = [number, number, number];

/**
 * A limb is posed either by joint angles (degrees) or by where its end should
 * be, solved with two-bone IK so contacts are exact:
 *   to  wrist/ankle target in the stage frame (floor, bench top, bar)
 *   at  wrist target relative to the shoulder line (x left, y up the torso, z out the chest)
 */
export interface Limb {
  raise?: number;
  out?: number;
  twist?: number;
  bend?: number;
  to?: T3;
  at?: T3;
  /** Which way the elbow/knee points, same frame as the target. */
  pole?: T3;
}

export interface Pose {
  /** Hips in the stage frame. */
  pos: T3;
  /** Whole-figure placement inside the stage: positions and targets are rotated/moved by it. */
  frame?: { x?: number; z?: number; yaw?: number };
  /** Pelvis orientation: pitch + leans forward, yaw + turns to the figure's left. */
  pitch?: number;
  yaw?: number;
  roll?: number;
  /** Forward bend (+) of the lower and upper back, side bend and twist. */
  spine?: number;
  chest?: number;
  side?: number;
  twist?: number;
  head?: number;
  headYaw?: number;
  armL?: Limb;
  armR?: Limb;
  legL?: Limb;
  legR?: Limb;
  /** flat: sole on a surface · toes: up on the ball of the foot · free: follows the shin. */
  footL?: 'flat' | 'toes' | 'free';
  footR?: 'flat' | 'toes' | 'free';
  /** Lift the whole figure so its lowest foot rests on the floor (for FK legs: jumps, marches). */
  ground?: number;
}

export interface Solved {
  hips: Vector3; waist: Vector3; chest: Vector3; neck: Vector3; head: Vector3;
  hipsQ: Quaternion; spineQ: Quaternion; chestQ: Quaternion; headQ: Quaternion;
  sh: [Vector3, Vector3]; el: [Vector3, Vector3]; ha: [Vector3, Vector3]; tip: [Vector3, Vector3];
  hip: [Vector3, Vector3]; kn: [Vector3, Vector3]; an: [Vector3, Vector3]; toe: [Vector3, Vector3];
}

const RAD = Math.PI / 180;
const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);
const q = (axis: Vector3, deg: number) => new Quaternion().setFromAxisAngle(axis, deg * RAD);
const v = (t: T3) => new Vector3(t[0], t[1], t[2]);

/** Two-bone IK: the middle joint, given both ends, bone lengths and a bend direction. */
function ik(root: Vector3, target: Vector3, a: number, b: number, pole: Vector3): { mid: Vector3; end: Vector3 } {
  const dir = target.clone().sub(root);
  const raw = dir.length();
  const d = Math.min(Math.max(raw, Math.abs(a - b) + 1e-3), a + b - 1e-3);
  dir.normalize();
  const along = (a * a - b * b + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, a * a - along * along));
  const side = pole.clone().addScaledVector(dir, -pole.dot(dir));
  if (side.lengthSq() < 1e-6) side.set(0, 0, 1).addScaledVector(dir, -dir.z);
  side.normalize();
  return { mid: root.clone().addScaledVector(dir, along).addScaledVector(side, h), end: root.clone().addScaledVector(dir, d) };
}

export function solve(p: Pose): Solved {
  const hipsQ = q(Y, p.yaw ?? 0).multiply(q(X, p.pitch ?? 0)).multiply(q(Z, p.roll ?? 0));
  const spineQ = hipsQ.clone().multiply(q(X, p.spine ?? 0)).multiply(q(Z, p.side ?? 0)).multiply(q(Y, (p.twist ?? 0) * 0.5));
  const chestQ = spineQ.clone().multiply(q(X, p.chest ?? 0)).multiply(q(Y, (p.twist ?? 0) * 0.5));
  const headQ = chestQ.clone().multiply(q(Y, p.headYaw ?? 0)).multiply(q(X, p.head ?? 0));
  const hips = v(p.pos);
  const up = (qq: Quaternion, len: number) => new Vector3(0, len, 0).applyQuaternion(qq);
  const chest = hips.clone().add(up(spineQ, DIM.spine));
  const waist = hips.clone().add(up(spineQ, DIM.spine * 0.5));
  const neck = chest.clone().add(up(chestQ, DIM.chest));
  const head = neck.clone().add(up(headQ, DIM.neck + DIM.headR * 0.85));
  const shoulderMid = chest.clone().add(up(chestQ, DIM.chest - DIM.shoulderDrop));

  const out: Solved = {
    hips, waist, chest, neck, head, hipsQ, spineQ, chestQ, headQ,
    sh: [new Vector3(), new Vector3()], el: [new Vector3(), new Vector3()], ha: [new Vector3(), new Vector3()], tip: [new Vector3(), new Vector3()],
    hip: [new Vector3(), new Vector3()], kn: [new Vector3(), new Vector3()], an: [new Vector3(), new Vector3()], toe: [new Vector3(), new Vector3()],
  };

  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1; // left is +X
    // ── Arm ──
    const arm = (i === 0 ? p.armL : p.armR) ?? {};
    const sh = shoulderMid.clone().add(new Vector3(s * DIM.shoulderW, 0, 0).applyQuaternion(chestQ));
    out.sh[i].copy(sh);
    if (arm.to || arm.at) {
      const target = arm.to ? v(arm.to) : shoulderMid.clone().add(v(arm.at!).applyQuaternion(chestQ));
      const pole = arm.pole ? v(arm.pole) : new Vector3(s * 0.6, -1, -0.4);
      if (arm.at) pole.applyQuaternion(chestQ);
      const r = ik(sh, target, DIM.upper, DIM.fore, pole);
      out.el[i].copy(r.mid);
      out.ha[i].copy(r.end);
    } else {
      const aq = chestQ.clone().multiply(q(Z, s * (arm.out ?? 0))).multiply(q(X, -(arm.raise ?? 0))).multiply(q(Y, s * (arm.twist ?? 0)));
      out.el[i].copy(sh).add(new Vector3(0, -DIM.upper, 0).applyQuaternion(aq));
      out.ha[i].copy(out.el[i]).add(new Vector3(0, -DIM.fore, 0).applyQuaternion(aq.multiply(q(X, -(arm.bend ?? 0)))));
    }
    out.tip[i].copy(out.ha[i]).add(out.ha[i].clone().sub(out.el[i]).normalize().multiplyScalar(DIM.hand));

    // ── Leg ──
    const leg = (i === 0 ? p.legL : p.legR) ?? {};
    const hip = hips.clone().add(new Vector3(s * DIM.hipW, 0, 0).applyQuaternion(hipsQ));
    out.hip[i].copy(hip);
    if (leg.to) {
      const pole = leg.pole ? v(leg.pole) : new Vector3(s * 0.15, 0.2, 1).applyQuaternion(q(Y, p.yaw ?? 0));
      const r = ik(hip, v(leg.to), DIM.thigh, DIM.shin, pole);
      out.kn[i].copy(r.mid);
      out.an[i].copy(r.end);
    } else {
      const lq = hipsQ.clone().multiply(q(Z, s * (leg.out ?? 0))).multiply(q(X, -(leg.raise ?? 0))).multiply(q(Y, s * (leg.twist ?? 0)));
      out.kn[i].copy(hip).add(new Vector3(0, -DIM.thigh, 0).applyQuaternion(lq));
      out.an[i].copy(out.kn[i]).add(new Vector3(0, -DIM.shin, 0).applyQuaternion(lq.multiply(q(X, leg.bend ?? 0))));
    }
    // ── Foot ──
    const shin = out.an[i].clone().sub(out.kn[i]).normalize();
    const fwd = new Vector3(0, 0, 1).applyQuaternion(hipsQ);
    const mode = (i === 0 ? p.footL : p.footR) ?? (Math.abs(shin.y) > 0.5 && shin.y < 0 && Math.abs(fwd.y) < 0.6 ? 'flat' : 'free');
    const toe = out.toe[i];
    if (mode === 'flat' || mode === 'toes') {
      fwd.y = 0;
      if (fwd.lengthSq() < 0.05) fwd.copy(out.kn[i]).sub(out.hip[i]).setY(0);
      if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, 1);
      fwd.normalize();
      // flat: sole down · toes: up on the ball of the foot, heel lifted.
      if (mode === 'flat') toe.copy(out.an[i]).addScaledVector(fwd, 0.16).setY(out.an[i].y - DIM.footH + 0.007);
      else toe.copy(out.an[i]).addScaledVector(fwd, 0.06).setY(out.an[i].y - 0.19);
    } else {
      // Perpendicular to the shin, toward the front of the knee.
      const kneeFront = new Vector3().crossVectors(new Vector3(s, 0, 0).applyQuaternion(hipsQ), shin).multiplyScalar(-s * s);
      const thigh = out.kn[i].clone().sub(out.hip[i]).normalize();
      const front = thigh.clone().addScaledVector(shin, -thigh.dot(shin));
      if (front.lengthSq() > 0.02) kneeFront.copy(front.normalize());
      else kneeFront.copy(fwd).addScaledVector(shin, -fwd.dot(shin)).normalize();
      toe.copy(out.an[i]).addScaledVector(kneeFront, 0.16).addScaledVector(shin, 0.12);
    }
  }

  const all: Vector3[] = [hips, waist, chest, neck, head, ...out.sh, ...out.el, ...out.ha, ...out.tip, ...out.hip, ...out.kn, ...out.an, ...out.toe];
  if (p.ground !== undefined) {
    const low = Math.min(out.an[0].y - DIM.footH, out.an[1].y - DIM.footH, out.toe[0].y - 0.007, out.toe[1].y - 0.007);
    for (const pt of all) pt.y += p.ground - low;
  }
  const f = p.frame;
  if (f) {
    const fq = q(Y, f.yaw ?? 0);
    const off = new Vector3(f.x ?? 0, 0, f.z ?? 0);
    for (const pt of all) pt.applyQuaternion(fq).add(off);
    for (const qq of [hipsQ, spineQ, chestQ, headQ]) qq.premultiply(fq);
  }
  return out;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Blend two poses field by field (angles and targets alike). */
export function mix<T>(a: T, b: T, t: number): T {
  if (a === undefined) return b;
  if (b === undefined) return a;
  if (typeof a === 'number') return lerp(a, b as number, t) as T;
  if (Array.isArray(a)) return a.map((x, i) => lerp(x, (b as number[])[i], t)) as T;
  if (typeof a === 'object' && a !== null) {
    const o: Record<string, unknown> = {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b as object)])) o[k] = mix((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], t);
    return o as T;
  }
  return t < 0.5 ? a : b;
}
