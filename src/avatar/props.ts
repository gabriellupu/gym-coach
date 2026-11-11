import * as THREE from 'three';
import { BAR, MAT } from '../domain/gear';
import type { Ctx } from './anims';

const pad = () => new THREE.MeshStandardMaterial({ color: 0x1a1f2b, roughness: 0.75 });
const steel = () => new THREE.MeshStandardMaterial({ color: 0x8b93a3, roughness: 0.35, metalness: 0.7 });
const box = (w: number, h: number, d: number, m: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);

/** An adjustable bench in the stage frame: centred on the origin, head end toward +Z. */
export class BenchProp {
  readonly group = new THREE.Group();
  private back = new THREE.Group();
  private strut: THREE.Mesh;
  private hinge = 0;
  private len = 0;

  constructor(c: Ctx['bench'], ghost = false) {
    const { length: L, height: H, width: W, seat } = c;
    const T = 0.065;
    const p = ghost ? new THREE.MeshBasicMaterial({ color: 0x4de2c5, wireframe: true, transparent: true, opacity: 0.55 }) : pad();
    const s = ghost ? p : steel();
    this.hinge = -L / 2 + seat;
    this.len = L - seat;
    const seatMesh = box(W, T, seat - 0.02, p);
    seatMesh.position.set(0, H - T / 2, -L / 2 + (seat - 0.02) / 2);
    const backMesh = box(W, T, this.len, p);
    backMesh.position.set(0, -T / 2, this.len / 2);
    this.back.position.set(0, H, this.hinge);
    this.back.add(backMesh);
    const rail = box(0.05, 0.05, L * 0.92, s);
    rail.position.set(0, H * 0.42, 0);
    this.strut = box(0.035, 1, 0.035, s);
    this.group.add(seatMesh, this.back, rail, this.strut);
    for (const z of [-L * 0.44, L * 0.44]) {
      const foot = box(W + 0.22, 0.04, 0.05, s);
      foot.position.set(0, 0.02, z);
      const leg = box(0.05, H * 0.42, 0.05, s);
      leg.position.set(0, H * 0.21, z);
      this.group.add(foot, leg);
    }
    const post = box(0.05, H * 0.5, 0.05, s);
    post.position.set(0, H * 0.68, this.hinge - 0.1);
    this.group.add(post);
    this.setAngle(c.angle, H);
  }

  setAngle(deg: number, H: number) {
    const a = (deg * Math.PI) / 180;
    this.back.rotation.x = -a;
    // Support strut from the rail up to the middle of the backrest.
    const top = new THREE.Vector3(0, H + Math.sin(a) * this.len * 0.55 - 0.07 * Math.cos(a), this.hinge + Math.cos(a) * this.len * 0.55 + 0.07 * Math.sin(a));
    const bot = new THREE.Vector3(0, H * 0.42, this.hinge + this.len * 0.7);
    const d = top.clone().sub(bot);
    this.strut.position.copy(bot).addScaledVector(d, 0.5);
    this.strut.scale.set(1, d.length(), 1);
    this.strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    this.strut.visible = deg > 4;
  }
}

/** A pull-up bar at `height`, along X, centred on the origin. */
export function makeBar(height: number, width = BAR.width, ghost = false): THREE.Group {
  const g = new THREE.Group();
  const m = ghost ? new THREE.MeshBasicMaterial({ color: 0xff7a9c, transparent: true, opacity: 0.6 }) : steel();
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, width, 12), m);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = height;
  g.add(bar);
  if (!ghost)
    for (const s of [-1, 1]) {
      const up = box(0.045, height + 0.12, 0.045, steel());
      up.position.set((s * width) / 2, (height + 0.12) / 2, -0.22);
      const arm = box(0.04, 0.04, 0.24, steel());
      arm.position.set((s * width) / 2, height, -0.11);
      const foot = box(0.05, 0.04, 0.7, steel());
      foot.position.set((s * width) / 2, 0.02, -0.1);
      g.add(up, arm, foot);
    }
  return g;
}

export function makeMat(length = MAT.length, ghost = false): THREE.Mesh {
  const m = ghost
    ? new THREE.MeshBasicMaterial({ color: 0x7aa8ff, transparent: true, opacity: 0.25, depthWrite: false })
    : new THREE.MeshStandardMaterial({ color: 0x3b4a78, roughness: 0.9 });
  const mesh = box(MAT.width, 0.012, length, m);
  mesh.position.y = 0.006;
  return mesh;
}
