import * as THREE from 'three';
import { animFor, sample, type Anim, type Ctx } from './anims';
import { HumanBody } from './human';
import { DIM, solve, type Pose, type Solved } from './rig';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * A pictogram stickman: one bright line per bone, drawn unlit so it reads at a
 * glance on the coach's board. The right side is tinted so you can tell the
 * near limb from the far one.
 */
class StickBody {
  readonly group = new THREE.Group();
  private bones: { mesh: THREE.Mesh; a: (s: Solved) => THREE.Vector3; b: (s: Solved) => THREE.Vector3 }[] = [];
  private balls: { mesh: THREE.Mesh; at: (s: Solved) => THREE.Vector3 }[] = [];
  private mats: THREE.MeshBasicMaterial[] = [];

  constructor() {
    const mat = (c: number) => {
      const m = new THREE.MeshBasicMaterial({ color: c });
      this.mats.push(m);
      return m;
    };
    const left = mat(0xf4f7fb), right = mat(0x4de2c5), core = mat(0xf4f7fb);
    const bone = (r: number, m: THREE.Material, a: (s: Solved) => THREE.Vector3, b: (s: Solved) => THREE.Vector3) => {
      const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, 1, 4, 10), m);
      this.group.add(mesh);
      this.bones.push({ mesh, a, b });
    };
    const ball = (r: number, m: THREE.Material, at: (s: Solved) => THREE.Vector3) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), m);
      this.group.add(mesh);
      this.balls.push({ mesh, at });
    };
    const R = 0.03;
    for (const i of [1, 0] as const) {
      const m = i === 0 ? left : right;
      bone(R, m, (s) => s.sh[i], (s) => s.el[i]);
      bone(R, m, (s) => s.el[i], (s) => s.tip[i]);
      bone(R * 1.1, m, (s) => s.hip[i], (s) => s.kn[i]);
      bone(R * 1.1, m, (s) => s.kn[i], (s) => s.an[i]);
      bone(R, m, (s) => s.an[i], (s) => s.toe[i]);
    }
    bone(R * 1.35, core, (s) => s.hips, (s) => s.chest);
    bone(R * 1.35, core, (s) => s.chest, (s) => s.neck);
    bone(R, core, (s) => s.sh[0], (s) => s.sh[1]);
    bone(R, core, (s) => s.hip[0], (s) => s.hip[1]);
    ball(DIM.headR * 1.08, core, (s) => s.head);
    // A visor dot so the facing direction is never ambiguous.
    ball(0.035, mat(0x0b0e14), (s) => s.head.clone().add(new THREE.Vector3(0, 0.01, DIM.headR * 0.95).applyQuaternion(s.headQ)));
  }

  setOpacity(o: number) {
    for (const m of this.mats) (m.transparent = o < 1), (m.opacity = o);
  }

  draw(s: Solved) {
    const dir = new THREE.Vector3();
    for (const { mesh, a, b } of this.bones) {
      const p0 = a(s), p1 = b(s);
      dir.subVectors(p1, p0);
      const len = dir.length() || 1e-4;
      mesh.position.copy(p0).addScaledVector(dir, 0.5);
      // Capsule geometry is 1 long plus its caps: scale only the shaft.
      mesh.scale.set(1, len, 1);
      mesh.quaternion.setFromUnitVectors(UP, dir.divideScalar(len));
    }
    for (const { mesh, at } of this.balls) mesh.position.copy(at(s));
  }
}

export type FigureStyle = 'stick' | 'human';

/**
 * Someone performing an exercise animation: owns the animation state, solves
 * the pose each frame and hands it to a body to draw — a stickman for the
 * board, the human coach for the room.
 */
export class Figure {
  readonly group = new THREE.Group();
  phase = 0;
  /** Cycles per second. */
  rate = 0.4;
  anim: Anim;
  solved!: Solved;
  private stick = new StickBody();
  private human: HumanBody | null = null;
  private dumbbells: THREE.Group[] = [];
  private shadow: THREE.Mesh;
  private opacity = 1;
  private from: Pose | null = null;
  private blend = 1;
  private exId = '';

  constructor(
    private ctx: Ctx,
    style: FigureStyle = 'stick',
    modelUrl = '',
  ) {
    this.anim = animFor('idle', ctx);
    this.group.add(this.stick.group);
    if (style === 'human') {
      // The stickman stands in until the model has loaded (or if it can't).
      const human = new HumanBody();
      human.group.visible = false;
      this.group.add(human.group);
      human.load(modelUrl).then(
        () => {
          this.human = human;
          human.group.visible = true;
          this.stick.group.visible = false;
          human.setOpacity(this.opacity);
        },
        (e) => console.warn('Coach model unavailable; using the stick figure', e),
      );
    }
    for (let i = 0; i < 2; i++) {
      const g = makeDumbbell();
      g.visible = false;
      this.dumbbells.push(g);
      this.group.add(g);
    }
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.55 }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = -1;
    this.group.add(this.shadow);
    this.apply(sample(this.anim, 0));
  }

  setCtx(ctx: Ctx) {
    this.ctx = ctx;
    const id = this.exId;
    this.exId = '';
    const phase = this.phase;
    this.play(id || 'idle', this.rate, { snap: true });
    this.phase = phase;
  }

  /** Switch animation, blending from wherever the body is now. */
  play(id: string, rate: number, opts: { snap?: boolean } = {}) {
    if (id === this.exId) {
      this.rate = rate;
      return;
    }
    this.from = opts.snap ? null : this.current();
    this.blend = opts.snap ? 1 : 0;
    this.exId = id;
    this.anim = animFor(id, this.ctx);
    this.rate = rate;
    this.phase = 0;
  }

  private current(): Pose {
    return sample(this.anim, this.phase);
  }

  update(dt: number) {
    this.phase = (this.phase + dt * this.rate) % 1;
    let pose = this.current();
    if (this.from && this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / 0.55);
      pose = blendPose(this.from, pose, this.blend * this.blend * (3 - 2 * this.blend));
    }
    this.apply(pose);
  }

  setOpacity(o: number) {
    this.opacity = o;
    this.stick.setOpacity(o);
    this.human?.setOpacity(o);
  }

  /** Bounding sphere of the whole cycle, for framing a camera. */
  bounds(): THREE.Sphere {
    const box = new THREE.Box3();
    for (let i = 0; i < 8; i++) {
      const s = solve(sample(this.anim, i / 8));
      for (const p of [s.head, s.hips, ...s.tip, ...s.toe, ...s.kn, ...s.el]) box.expandByPoint(p);
    }
    box.expandByScalar(0.14);
    return box.getBoundingSphere(new THREE.Sphere());
  }

  apply(pose: Pose) {
    const s = (this.solved = solve(pose));
    if (this.human) {
      this.human.setGrip(this.anim.db ? 1 : 0);
      this.human.draw(s);
    } else this.stick.draw(s);

    const mode = this.anim.db;
    const axis = new THREE.Vector3();
    this.dumbbells.forEach((g, i) => {
      g.visible = mode === 'pair' || (mode === 'one' && i === 0) || (mode === 'right' && i === 1);
      if (!g.visible) return;
      const grip = s.ha[i].clone().lerp(s.tip[i], 0.75);
      if (mode === 'one') grip.lerp(s.ha[1].clone().lerp(s.tip[1], 0.75), 0.5);
      const ax = this.anim.dbAxis ?? 'x';
      if (ax === 'arm') axis.subVectors(s.tip[i], s.el[i]).normalize();
      else axis.set(ax === 'x' ? 1 : 0, ax === 'y' ? 1 : 0, ax === 'z' ? 1 : 0).applyQuaternion(s.chestQ);
      if (mode === 'one' && ax === 'arm') grip.addScaledVector(axis, 0.07);
      g.position.copy(grip);
      g.quaternion.setFromUnitVectors(UP, axis);
    });

    // A soft contact shadow sells "standing in your room" more than anything else.
    const lo = Math.min(s.an[0].y, s.an[1].y, s.hips.y, s.ha[0].y, s.ha[1].y);
    const cx = (s.hips.x + s.chest.x + s.an[0].x + s.an[1].x) / 4, cz = (s.hips.z + s.chest.z + s.an[0].z + s.an[1].z) / 4;
    const span = Math.max(0.55, s.head.distanceTo(s.an[0]) * (Math.abs(s.head.y - s.an[0].y) > 1 ? 0.5 : 0.95));
    this.shadow.position.set(cx, 0.004, cz);
    this.shadow.scale.set(span * 1.25, span * 1.25, 1);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.5 * Math.max(0.35, 1 - lo * 0.6) * this.opacity;
  }
}

/** A field-wise mix between two poses; reads fine for the half second a transition takes. */
function blendPose(a: Pose, b: Pose, t: number): Pose {
  // Limbs posed differently (angles vs targets) can't be mixed: switch them at the midpoint.
  const limb = (x: Pose['armL'], y: Pose['armL']) => {
    if (!x || !y) return t < 0.5 ? x : y;
    const same = !!x.to === !!y.to && !!x.at === !!y.at;
    return same ? mixLimb(x, y, t) : t < 0.5 ? x : y;
  };
  const n = (x = 0, y = 0) => x + (y - x) * t;
  const fa = a.frame ?? {}, fb = b.frame ?? {};
  return {
    pos: [n(a.pos[0], b.pos[0]), n(a.pos[1], b.pos[1]), n(a.pos[2], b.pos[2])],
    frame: { x: n(fa.x, fb.x), z: n(fa.z, fb.z), yaw: n(fa.yaw, fb.yaw) },
    pitch: n(a.pitch, b.pitch), yaw: n(a.yaw, b.yaw), roll: n(a.roll, b.roll), spine: n(a.spine, b.spine), chest: n(a.chest, b.chest),
    side: n(a.side, b.side), twist: n(a.twist, b.twist), head: n(a.head, b.head), headYaw: n(a.headYaw, b.headYaw),
    armL: limb(a.armL, b.armL), armR: limb(a.armR, b.armR), legL: limb(a.legL, b.legL), legR: limb(a.legR, b.legR),
    footL: t < 0.5 ? a.footL : b.footL, footR: t < 0.5 ? a.footR : b.footR,
    ground: a.ground !== undefined && b.ground !== undefined ? n(a.ground, b.ground) : t < 0.5 ? a.ground : b.ground,
  };
}
function mixLimb(x: NonNullable<Pose['armL']>, y: NonNullable<Pose['armL']>, t: number) {
  const n = (p = 0, q = 0) => p + (q - p) * t;
  const v3 = (p?: [number, number, number], q?: [number, number, number]) => (p && q ? ([n(p[0], q[0]), n(p[1], q[1]), n(p[2], q[2])] as [number, number, number]) : (p ?? q));
  return { raise: n(x.raise, y.raise), out: n(x.out, y.out), twist: n(x.twist, y.twist), bend: n(x.bend, y.bend), to: v3(x.to, y.to), at: v3(x.at, y.at), pole: v3(x.pole, y.pole) };
}

export function makeDumbbell(): THREE.Group {
  const g = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: 0x2b3140, roughness: 0.45, metalness: 0.5 });
  const band = new THREE.MeshStandardMaterial({ color: 0xffb454, roughness: 0.5 });
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 10), new THREE.MeshStandardMaterial({ color: 0xaab2c0, roughness: 0.3, metalness: 0.8 })));
  for (const s of [-1, 1]) {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.058, 6), iron);
    plate.position.y = s * 0.095;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.0535, 0.0535, 0.012, 6), band);
    ring.position.y = s * 0.095;
    g.add(plate, ring);
  }
  return g;
}

let shadowTex: THREE.Texture | null = null;
function shadowTexture(): THREE.Texture {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.75)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.3)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return (shadowTex = new THREE.CanvasTexture(c));
}
