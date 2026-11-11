import * as THREE from 'three';
import type { Ctx } from '../avatar/anims';
import { BenchProp, makeBar, makeMat } from '../avatar/props';
import { BAR, BENCH, GEAR, MAT } from '../domain/gear';
import type { GearId, Placement } from '../domain/types';

/** A spot in the gym: floor position, heading, and the equipment's measured size. */
export interface Frame {
  pos: THREE.Vector3;
  yaw: number;
  length: number;
  height: number;
  mapped: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Turns the two pinned points into a stage frame (gym-local). */
export function frameOf(gear: GearId, p: Placement): Frame {
  const a = new THREE.Vector3(...p.a), b = new THREE.Vector3(...p.b);
  const pos = a.clone().add(b).multiplyScalar(0.5).setY(0);
  const d = a.clone().sub(b).setY(0);
  const y = (a.y + b.y) / 2;
  switch (gear) {
    case 'bench': // a = head end, b = foot end, both on the bench top
      return { pos, yaw: Math.atan2(d.x, d.z), length: clamp(d.length(), 0.9, 1.6), height: clamp(y, 0.3, 0.65), mapped: true };
    case 'pullup_bar': {
      // a = left end, b = right end as the trainee faces it; the coach hangs facing them.
      const r = b.clone().sub(a).setY(0);
      return { pos, yaw: Math.atan2(-r.z, r.x), length: clamp(r.length(), 0.5, 1.6), height: clamp(y, 1.6, 2.6), mapped: true };
    }
    case 'mat':
      return { pos, yaw: Math.atan2(d.x, d.z), length: clamp(d.length(), 1.2, 2.4), height: 0, mapped: true };
    default:
      return { pos: a.clone().setY(0), yaw: 0, length: 0, height: clamp(a.y, 0, 1.6), mapped: true };
  }
}

/** Where the equipment stands when nothing is mapped: a small virtual gym in front of the start point. */
const DEFAULTS: Record<GearId, Frame> = {
  bench: { pos: new THREE.Vector3(-1.45, 0, -2.5), yaw: Math.PI / 2 + 0.35, length: BENCH.length, height: BENCH.height, mapped: false },
  pullup_bar: { pos: new THREE.Vector3(1.6, 0, -2.7), yaw: -0.3, length: BAR.width, height: BAR.height, mapped: false },
  mat: { pos: new THREE.Vector3(0, 0, -2.3), yaw: Math.PI / 2, length: MAT.length, height: 0, mapped: false },
  dumbbells: { pos: new THREE.Vector3(-0.3, 0, -3.3), yaw: 0, length: 0, height: 0.3, mapped: false },
};

function label(text: string, color: number): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.beginPath();
  g.roundRect(4, 4, 504, 120, 60);
  g.fillStyle = 'rgba(11,14,20,0.85)';
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
  g.stroke();
  g.fillStyle = '#eef2f8';
  g.font = '700 52px ui-sans-serif, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(0.44, 0.11, 1);
  return s;
}

interface Station {
  frame: Frame;
  root: THREE.Group;
  marker: THREE.Group;
  ring: THREE.Mesh;
  ghost: THREE.Object3D | null;
  solid: THREE.Object3D | null;
  bench: BenchProp | null;
  flash: number;
}

/**
 * Everything the coach knows about the room. All stations live under `root`,
 * which is glued to one persistent anchor, so a single anchor keeps the whole
 * gym in place between sessions.
 */
export class Stations {
  readonly root = new THREE.Group();
  private list = new Map<GearId, Station>();
  private path: THREE.Mesh[] = [];
  private guideTo: GearId | null = null;
  private t = 0;
  /** In passthrough the real equipment is right there: only outline it. */
  passthrough = false;
  /** Outlines stay up while mapping. */
  showGhosts = false;

  constructor() {
    const chevron = new THREE.Shape();
    chevron.moveTo(-0.11, -0.05).lineTo(0, 0.07).lineTo(0.11, -0.05).lineTo(0.11, -0.11).lineTo(0, 0.01).lineTo(-0.11, -0.11).closePath();
    const geo = new THREE.ShapeGeometry(chevron);
    geo.rotateX(Math.PI / 2); // tip toward +Z
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x4de2c5, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false;
      this.path.push(m);
      this.root.add(m);
    }
  }

  frame(gear: GearId): Frame {
    return this.list.get(gear)?.frame ?? DEFAULTS[gear];
  }

  /** (Re)build a station from a placement, or from the virtual-gym default when there is none. */
  set(gear: GearId, placement: Placement | undefined, owned: boolean) {
    const old = this.list.get(gear);
    if (old) this.root.remove(old.root);
    this.list.delete(gear);
    if (!owned) return;
    const frame = placement ? frameOf(gear, placement) : DEFAULTS[gear];
    const spec = GEAR[gear];
    const root = new THREE.Group();
    root.position.copy(frame.pos);
    root.rotation.y = frame.yaw;
    const marker = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.4, 48), new THREE.MeshBasicMaterial({ color: spec.color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.006;
    const tag = label(spec.name.replace('Adjustable b', 'B').replace('Exercise m', 'M'), spec.color);
    tag.position.y = Math.max(frame.height, gear === 'pullup_bar' ? 0 : 0.2) + (gear === 'pullup_bar' ? 0.22 : 0.42);
    marker.add(ring, tag);
    let ghost: THREE.Object3D | null = null, solid: THREE.Object3D | null = null, bench: BenchProp | null = null;
    const b = { ...BENCH, length: frame.length || BENCH.length, height: frame.height || BENCH.height, angle: 0 };
    if (gear === 'bench') {
      ghost = new BenchProp(b, true).group;
      bench = new BenchProp(b);
      solid = bench.group;
    } else if (gear === 'pullup_bar') {
      ghost = makeBar(frame.height, frame.length, true);
      solid = makeBar(frame.height, frame.length);
    } else if (gear === 'mat') {
      ghost = makeMat(frame.length, true);
      solid = makeMat(frame.length);
    }
    if (ghost) root.add(ghost);
    if (solid) root.add(solid);
    root.add(marker);
    this.root.add(root);
    this.list.set(gear, { frame, root, marker, ring, ghost, solid, bench, flash: placement ? 4 : 0 });
  }

  /** Sizes the coach's body is posed against for an exercise at this bench angle. */
  ctx(angle: number): Ctx {
    const b = this.frame('bench'), bar = this.frame('pullup_bar');
    return { bench: { ...BENCH, length: b.length, height: b.height, angle }, barH: bar.height };
  }

  setBenchAngle(deg: number) {
    const s = this.list.get('bench');
    s?.bench?.setAngle(deg, s.frame.height);
  }

  guide(gear: GearId | null) {
    this.guideTo = gear;
  }

  /** World position of a station's floor point. */
  world(gear: GearId, out = new THREE.Vector3()): THREE.Vector3 {
    return this.root.localToWorld(out.copy(this.frame(gear).pos));
  }
  worldYaw(gear: GearId): number {
    return this.frame(gear).yaw + this.root.rotation.y;
  }

  update(dt: number, head: THREE.Vector3) {
    this.t += dt;
    for (const [gear, s] of this.list) {
      s.flash = Math.max(0, s.flash - dt);
      const target = gear === this.guideTo;
      const real = this.passthrough && s.frame.mapped;
      if (s.solid) s.solid.visible = !real && !(this.passthrough && gear === 'mat');
      if (s.ghost) s.ghost.visible = real && (this.showGhosts || s.flash > 0 || target);
      // Markers: always for mapped gear while guiding or mapping; a quiet ring otherwise.
      s.marker.visible = s.frame.mapped || !this.passthrough;
      const pulse = target ? 1 + Math.sin(this.t * 5) * 0.18 : 1;
      s.ring.scale.setScalar(pulse * (gear === 'dumbbells' ? 0.6 : 1));
      (s.ring.material as THREE.MeshBasicMaterial).opacity = target ? 0.95 : this.showGhosts ? 0.7 : 0.25;
      s.marker.children[1].visible = target || this.showGhosts || s.flash > 0 || !this.passthrough;
    }
    // Chevrons flowing along the floor from the trainee to the station.
    const to = this.guideTo ? this.frame(this.guideTo).pos : null;
    const from = this.root.worldToLocal(head.clone()).setY(0);
    const dist = to ? from.distanceTo(to) : 0;
    this.path.forEach((m, i) => {
      const n = this.path.length;
      const u = (i + (this.t * 1.4) % 1) / n;
      const d = 0.35 + u * (dist - 0.75);
      m.visible = !!to && dist > 1.1 && d < dist - 0.35;
      if (!m.visible || !to) return;
      const dir = to.clone().sub(from).normalize();
      m.position.copy(from).addScaledVector(dir, d).setY(0.012);
      m.rotation.y = Math.atan2(dir.x, dir.z);
      (m.material as THREE.MeshBasicMaterial).opacity = Math.sin(u * Math.PI) * 0.9;
    });
  }
}
