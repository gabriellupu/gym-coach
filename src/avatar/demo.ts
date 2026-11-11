import * as THREE from 'three';
import { EXERCISES } from '../domain/exercises';
import { defaultCtx, type Ctx } from './anims';
import { Figure } from './figure';
import { BenchProp, makeBar, makeMat } from './props';

/**
 * A self-contained little studio showing the coach doing one exercise on
 * virtual equipment. Used for the on-board animation in XR, the exercise
 * library on the web, and the pose contact sheet.
 */
export class DemoScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 30);
  readonly figure: Figure;
  private props = new THREE.Group();
  private ctx: Ctx = defaultCtx();
  private target = new THREE.Vector3(0, 0.9, 0);
  private dist = 4;
  private az = 0;
  /** Extra slow orbit so the move reads in 3D. */
  orbit = 0.22;
  private t = 0;
  ex = '';

  constructor(opts: { floor?: boolean; human?: string } = {}) {
    this.figure = opts.human ? new Figure(this.ctx, 'human', opts.human) : new Figure(this.ctx);
    this.scene.add(this.figure.group, this.props);
    this.scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x20242e, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2.5, 4, 3);
    const rim = new THREE.DirectionalLight(opts.human ? 0xcfe0ff : 0x4de2c5, opts.human ? 0.9 : 1.4);
    rim.position.set(-3, 2, -3);
    this.scene.add(key, rim);
    if (opts.floor !== false) {
      const floor = new THREE.Mesh(new THREE.CircleGeometry(2.6, 48), new THREE.MeshStandardMaterial({ color: 0x161b26, roughness: 0.95 }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.002;
      const ring = new THREE.Mesh(new THREE.RingGeometry(2.56, 2.6, 64), new THREE.MeshBasicMaterial({ color: 0x4de2c5, transparent: true, opacity: 0.5 }));
      ring.rotation.x = -Math.PI / 2;
      this.scene.add(floor, ring);
    }
    this.set('idle');
  }

  set(id: string, ctx?: Ctx) {
    const e = EXERCISES[id];
    if (id === this.ex && !ctx) return;
    this.ex = id;
    this.ctx = ctx ?? defaultCtx(e?.bench ?? 0);
    this.figure.setCtx(this.ctx);
    this.figure.play(id, 1 / (e?.tempo ?? 3), { snap: true });
    this.props.clear();
    if (e?.gear.includes('bench')) this.props.add(new BenchProp(this.ctx.bench).group);
    if (e?.gear.includes('pullup_bar')) this.props.add(makeBar(this.ctx.barH));
    if (e?.gear.includes('mat')) {
      const mat = makeMat();
      mat.rotation.y = Math.PI / 2;
      mat.position.x = 0.1;
      this.props.add(mat);
    }
    const b = this.figure.bounds();
    if (e?.gear.includes('bench')) b.union(new THREE.Sphere(new THREE.Vector3(0, 0.4, 0), 0.8));
    this.target.copy(b.center);
    this.dist = (b.radius / Math.sin((this.camera.fov / 2) * (Math.PI / 180))) * 1.02;
    this.az = ((this.figure.anim.cam ?? 30) * Math.PI) / 180;
  }

  update(dt: number, aspect = 1) {
    this.t += dt;
    this.figure.update(dt);
    const a = this.az + Math.sin(this.t * 0.35) * this.orbit;
    const el = 0.2;
    const d = this.dist * (aspect < 1 ? 1 / aspect : 1);
    this.camera.aspect = aspect;
    this.camera.position.set(this.target.x + Math.sin(a) * Math.cos(el) * d, this.target.y + Math.sin(el) * d, this.target.z + Math.cos(a) * Math.cos(el) * d);
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
  }
}
