import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { Solved } from './rig';

const X = new THREE.Vector3(1, 0, 0);
type Side = 'Left' | 'Right';

interface Rest {
  bone: THREE.Bone;
  parent: string | null;
  /** Rest transform in model space, and rest position relative to the parent. */
  q: THREE.Quaternion;
  p: THREE.Vector3;
  local: THREE.Vector3;
}

/** Orientation whose X axis is `primary` and whose Z axis is the hinge (bend) axis. */
function frame(primary: THREE.Vector3, hinge: THREE.Vector3, out = new THREE.Quaternion()): THREE.Quaternion {
  const x = primary.clone().normalize();
  const z = hinge.clone().addScaledVector(x, -hinge.dot(x));
  if (z.lengthSq() < 1e-8) z.set(0, 0, 1).addScaledVector(x, -x.z);
  z.normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  return out.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/**
 * The human-looking coach: a skinned character whose skeleton is driven
 * directly from the solved pose. Every limb bone is placed on its solved joint
 * and aimed at the next one, with the elbow/knee hinge taken from the bend
 * plane, so hands and feet land exactly where the IK put them (on the bench,
 * the bar, the floor) and there are no canned clips to drift off the equipment.
 */
export class HumanBody {
  readonly group = new THREE.Group();
  ready = false;
  private rest = new Map<string, Rest>();
  private world = new Map<string, { q: THREE.Quaternion; p: THREE.Vector3 }>();
  private mats: { m: THREE.Material; cutout: boolean }[] = [];
  private hipsOffset = new THREE.Vector3();
  private curl = 0;

  async load(url: string) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(url);
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh;
      if (mesh.isMesh) {
        mesh.frustumCulled = false; // bones move far from the bind pose (lying on a bench)
        for (const m of [mesh.material].flat()) {
          const std = m as THREE.MeshStandardMaterial;
          std.metalness = 0;
          std.roughness = Math.max(0.6, std.roughness ?? 1);
          // Hair and lashes are alpha cards: cut them out instead of blending so they sort correctly.
          const cutout = m.transparent || m.alphaTest > 0;
          if (cutout) (m.alphaTest = 0.4), (m.transparent = false), (m.side = THREE.DoubleSide);
          this.mats.push({ m, cutout });
        }
      }
      const bone = o as THREE.Bone;
      if (bone.isBone) {
        const p = new THREE.Vector3(), q = new THREE.Quaternion();
        bone.matrixWorld.decompose(p, q, new THREE.Vector3());
        const parent = (bone.parent as THREE.Bone | null)?.isBone ? bone.parent!.name : null;
        this.rest.set(bone.name, { bone, parent, q, p, local: bone.position.clone() });
      }
    });
    const up = (s: Side) => this.rest.get(`${s}UpLeg`)!.p;
    this.hipsOffset.copy(this.rest.get('Hips')!.p).sub(up('Left').clone().add(up('Right')).multiplyScalar(0.5));
    this.group.add(root);
    this.ready = true;
  }

  setOpacity(o: number) {
    for (const { m, cutout } of this.mats) (m.transparent = o < 1), (m.opacity = o), (m.depthWrite = o >= 1 || cutout);
  }

  /** Curl the fingers round a dumbbell handle (0 open .. 1 closed). */
  setGrip(v: number) {
    this.curl = v;
  }

  private set(name: string, q: THREE.Quaternion, p?: THREE.Vector3) {
    const r = this.rest.get(name);
    if (!r) return;
    const par = r.parent ? this.world.get(r.parent) : null;
    const pq = par?.q ?? new THREE.Quaternion();
    const pp = par?.p ?? new THREE.Vector3();
    const inv = pq.clone().invert();
    const pos = p ?? r.local.clone().applyQuaternion(pq).add(pp);
    r.bone.quaternion.copy(inv).multiply(q);
    r.bone.position.copy(pos).sub(pp).applyQuaternion(inv);
    this.world.set(name, { q: q.clone(), p: pos.clone() });
  }

  /** World rotation for a bone given a rotation of the whole body part away from rest. */
  private turned(name: string, delta: THREE.Quaternion) {
    return delta.clone().multiply(this.rest.get(name)!.q);
  }

  /** Aim one limb segment from `a` to `b`, hinging about `hinge`. */
  private aim(name: string, child: string, a: THREE.Vector3, b: THREE.Vector3, hinge: THREE.Vector3, restHinge: THREE.Vector3): THREE.Quaternion {
    const r = this.rest.get(name)!;
    const restDir = this.rest.get(child)!.p.clone().sub(r.p);
    const delta = frame(b.clone().sub(a), hinge).multiply(frame(restDir, restHinge).invert());
    this.set(name, delta.clone().multiply(r.q), a);
    return delta;
  }

  /**
   * The bend axis of a two-bone limb. When the limb is nearly straight the
   * bend plane is undefined, so fall back to carrying the rest hinge along
   * with the parent body part.
   */
  private hinge(a: THREE.Vector3, mid: THREE.Vector3, b: THREE.Vector3, restDir: THREE.Vector3, restHinge: THREE.Vector3, parent: THREE.Quaternion): THREE.Vector3 {
    const u = mid.clone().sub(a).normalize(), l = b.clone().sub(mid).normalize();
    const bent = new THREE.Vector3().crossVectors(u, l);
    const amount = bent.length();
    const carried = restHinge.clone().applyQuaternion(parent);
    const swing = new THREE.Quaternion().setFromUnitVectors(restDir.clone().normalize().applyQuaternion(parent), u);
    carried.applyQuaternion(swing);
    if (amount < 1e-4) return carried;
    bent.divideScalar(amount);
    const k = THREE.MathUtils.smoothstep(amount, 0.06, 0.3);
    return carried.lerp(bent, k).normalize();
  }

  draw(s: Solved) {
    if (!this.ready) return;
    this.world.clear();
    // Torso.
    this.set('Hips', this.turned('Hips', s.hipsQ), s.hips.clone().add(this.hipsOffset.clone().applyQuaternion(s.hipsQ)));
    this.set('Spine', this.turned('Spine', s.spineQ));
    this.set('Spine1', this.turned('Spine1', s.spineQ.clone().slerp(s.chestQ, 0.5)));
    this.set('Spine2', this.turned('Spine2', s.chestQ));
    this.set('Neck', this.turned('Neck', s.chestQ.clone().slerp(s.headQ, 0.5)));
    this.set('Head', this.turned('Head', s.headQ));

    (['Left', 'Right'] as Side[]).forEach((side, i) => {
      const sg = i === 0 ? 1 : -1;
      // Arm: T-pose rest, elbow folds forward, so the hinge is ∓Y.
      this.set(`${side}Shoulder`, this.turned(`${side}Shoulder`, s.chestQ));
      const armRest = new THREE.Vector3(sg, 0, 0), armHinge = new THREE.Vector3(0, -sg, 0);
      const ah = this.hinge(s.sh[i], s.el[i], s.ha[i], armRest, armHinge, s.chestQ);
      this.aim(`${side}Arm`, `${side}ForeArm`, s.sh[i], s.el[i], ah, armHinge);
      const fore = this.aim(`${side}ForeArm`, `${side}Hand`, s.el[i], s.ha[i], ah, armHinge);
      this.set(`${side}Hand`, this.turned(`${side}Hand`, fore), s.ha[i]);
      // Fingers.
      if (this.curl > 0) {
        const hand = this.world.get(`${side}Hand`)!.q;
        const axis = new THREE.Vector3(0, 0, -sg).applyQuaternion(fore); // knuckle axis in the T-pose
        for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) {
          let acc = hand;
          for (let k = 1; k <= 3; k++) {
            const name = `${side}Hand${f}${k}`;
            const r = this.rest.get(name);
            if (!r) break;
            const bend = new THREE.Quaternion().setFromAxisAngle(axis, -sg * this.curl * 1.15 * k);
            acc = bend.multiply(fore).multiply(r.q);
            this.set(name, acc);
          }
        }
      }
      // Leg: knee folds backward, hinge +X.
      const legRest = new THREE.Vector3(0, -1, 0);
      const lh = this.hinge(s.hip[i], s.kn[i], s.an[i], legRest, X, s.hipsQ);
      this.aim(`${side}UpLeg`, `${side}Leg`, s.hip[i], s.kn[i], lh, X);
      this.aim(`${side}Leg`, `${side}Foot`, s.kn[i], s.an[i], lh, X);
      const lateral = X.clone().applyQuaternion(s.hipsQ);
      this.aim(`${side}Foot`, `${side}ToeBase`, s.an[i], s.toe[i], lateral, X);
    });
  }
}
