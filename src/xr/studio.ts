import * as THREE from 'three';
import { Figure } from '../avatar/figure';
import { CommandEars, type Ears } from '../coach/ears';
import type { Intent } from '../coach/intents';
import { lineText } from '../coach/lines';
import { Mapping } from '../coach/mapping';
import type { CoachCmd, HudView, Script, Stage } from '../coach/script';
import { Beeper, CoachVoice, type SayMode } from '../coach/voice';
import { Workout } from '../coach/workout';
import { EXERCISES } from '../domain/exercises';
import { GEAR_IDS } from '../domain/gear';
import { buildPlan, stationOf } from '../domain/planner';
import { saveProfile, weekGoal, type Profile } from '../domain/profile';
import type { GearId, Placement } from '../domain/types';
import type { BodyState, V3 } from '../motion/body';
import { simulateBody } from '../motion/sim';
import { Board } from './board';
import { Stations } from './stations';

export type Mode = 'mr' | 'vr' | 'preview';
type Spot = { pos: THREE.Vector3; yaw: number };
type AnchorX = XRAnchor & { requestPersistentHandle?: () => Promise<string> };
type SessionX = XRSession & { restorePersistentAnchor?: (h: string) => Promise<XRAnchor>; deletePersistentAnchor?: (h: string) => Promise<void> };

const UP = new THREE.Vector3(0, 1, 0);
const yawTo = (from: THREE.Vector3, to: THREE.Vector3) => Math.atan2(to.x - from.x, to.z - from.z);

/**
 * The room: renderer, WebXR session, tracking, the coach, the board and the
 * mapped equipment. Implements `Stage`, the world the session scripts act on.
 */
export class Studio implements Stage {
  mode: Mode = 'preview';
  onExit: () => void = () => {};
  onProfile: (p: Profile) => void = () => {};
  /** Test/preview hooks. */
  debug = { view: null as HudView | null, captions: [] as string[], heard: [] as string[], ears: 'off', anchor: 'none' };

  /** For emulator tests: the pose a trainee doing the current exercise would be in at `phase`. */
  simulate(phase: number): BodyState {
    const e = (this.view.ex && this.view.mode === 'work' ? EXERCISES[this.view.ex] : null) ?? EXERCISES.squat;
    return simulateBody(e, this.view.mode === 'work' ? phase : 0, 1.62, { x: this.head.x, z: this.head.z });
  }

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(62, 1, 0.05, 60);
  private env = new THREE.Group();
  private figure: Figure;
  private coachAt: Spot = { pos: new THREE.Vector3(0, 0, -2.3), yaw: 0 };
  private coachFade = 1;
  private station: GearId | null = null;
  private stations = new Stations();
  private board = new Board();
  private boardGoal = { pos: new THREE.Vector3(0.95, 1.45, -2.2), quat: new THREE.Quaternion(), scale: 1 };
  private boardSnap = true;
  private confetti: { pts: THREE.Points; vel: Float32Array; life: number } | null = null;
  private rays: { line: THREE.Line; dot: THREE.Mesh }[] = [];
  private handDots: THREE.Mesh[] = [];

  private audio: AudioContext | null = null;
  private voice: CoachVoice | null = null;
  private beeper: Beeper | null = null;
  private ears: Ears | null = null;
  private said = { text: '', until: 0 };

  private script: Script | null = null;
  private view: HudView = { mode: 'hub', title: '', buttons: [] };
  private session: XRSession | null = null;
  private anchor: XRAnchor | null = null;
  private wantAnchor = false;
  private clock = new THREE.Clock();
  private time = 0;

  private head = new THREE.Vector3(0, 1.62, 0);
  private gaze = new THREE.Vector3(0, 0, -1);
  private watchFrom = new THREE.Vector3(0, 0, 0);
  private hands: { left: THREE.Vector3 | null; right: THREE.Vector3 | null } = { left: null, right: null };
  private tips: { left: THREE.Vector3 | null; right: THREE.Vector3 | null } = { left: null, right: null };
  private lastTip: 'left' | 'right' = 'right';
  private standH = 1.62;
  private freeStage: Spot = { pos: new THREE.Vector3(0, 0, -2.3), yaw: 0 };
  private pokeAt = 0;
  private look = { yaw: 0, pitch: -0.12 };
  private simT = 0;
  private disposed = false;
  private cleanup: (() => void)[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private profile: Profile,
    private base: string,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: new URLSearchParams(location.search).has('capture') });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType('local-floor');
    this.scene.add(new THREE.HemisphereLight(0xe6eeff, 0x2a2f3a, 1.7));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(1.5, 4, 2.5);
    const rim = new THREE.DirectionalLight(0xcfe0ff, 0.9);
    rim.position.set(-2.5, 2.5, -3);
    this.scene.add(key, rim, this.env, this.stations.root, this.board.group);
    this.buildEnvironment();
    this.figure = new Figure(this.stations.ctx(0), 'human', `${base}/models/coach.glb`);
    this.scene.add(this.figure.group);
    for (let i = 0; i < 2; i++) {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0x4de2c5, transparent: true, opacity: 0.6 }));
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      line.visible = dot.visible = false;
      line.frustumCulled = false;
      this.rays.push({ line, dot });
      const hd = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ color: 0x4de2c5, transparent: true, opacity: 0.7 }));
      hd.visible = false;
      this.handDots.push(hd);
      this.scene.add(line, dot, hd);
    }
    this.syncStations();
    this.bindPreviewInput();
    const onResize = () => this.resize();
    addEventListener('resize', onResize);
    this.cleanup.push(() => removeEventListener('resize', onResize));
    this.resize();
    this.placeCoach(this.freeStage, true);
    this.enterHub(false);
    this.renderer.setAnimationLoop((_t, frame) => this.frame(frame));
  }

  // ───────────── Session lifecycle ─────────────

  /** Must be called from a user gesture: starts audio, the mic and (for mr/vr) the XR session. */
  async enter(mode: Mode) {
    this.mode = mode;
    if (!this.audio) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audio = new Ctor();
      const out = this.audio.createGain();
      out.gain.value = this.profile.settings.volume;
      out.connect(this.audio.destination);
      this.voice = new CoachVoice(this.audio, out);
      this.voice.enabled = this.profile.settings.voice;
      this.voice.onCaption = (text, s) => {
        this.said = { text: text.toLowerCase(), until: this.time + s };
        this.board.setCaption(text, s);
        this.debug.captions.push(text);
      };
      this.beeper = new Beeper(this.audio, out);
      void this.voice.load(this.base);
    }
    void this.audio.resume();

    if (mode !== 'preview') {
      const xr = navigator.xr;
      if (!xr) throw new Error('WebXR is not available in this browser.');
      const session = await xr.requestSession(mode === 'mr' ? 'immersive-ar' : 'immersive-vr', {
        requiredFeatures: ['local-floor'],
        optionalFeatures: ['hand-tracking', 'anchors', 'bounded-floor'],
      });
      this.session = session;
      await this.renderer.xr.setSession(session);
      session.addEventListener('end', () => this.leave());
      session.addEventListener('select', (e) => this.onSelect(e as XRInputSourceEvent));
      this.restoreAnchor(session as SessionX);
    }
    this.stations.passthrough = mode === 'mr';
    this.env.visible = mode !== 'mr';
    this.renderer.setClearColor(0x0b0e14, mode === 'mr' ? 0 : 1);

    if (this.profile.settings.mic && !this.ears) {
      const ears = new CommandEars(this.base);
      this.ears = ears;
      ears.onState = (s) => (this.board.setEars(s), (this.debug.ears = s), (s === 'denied' || s === 'unavailable') && this.say('nomic'));
      ears.onIntent = (intent, heard) => this.onHeard(intent, heard);
      void ears.start(this.audio);
    }
    this.enterHub(true);
  }

  private leave() {
    this.session = null;
    this.anchor = null;
    this.script = null;
    this.voice?.stop();
    this.ears?.stop();
    this.ears = null;
    this.mode = 'preview';
    this.stations.passthrough = false;
    this.env.visible = true;
    this.enterHub(false);
    this.onExit();
  }

  exit() {
    if (this.session) void this.session.end();
    else this.leave();
  }

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    for (const c of this.cleanup) c();
    this.voice?.stop();
    this.ears?.stop();
    void this.audio?.close();
    this.renderer.dispose();
  }

  private resize() {
    if (this.renderer.xr.isPresenting) return;
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ───────────── Hub ─────────────

  private enterHub(speak: boolean, summary?: HudView) {
    this.script = null;
    this.stations.guide(null);
    this.stations.showGhosts = false;
    const p = this.profile;
    const plan = buildPlan(p);
    const g = weekGoal(p);
    this.show(
      summary
        ? { ...summary, buttons: ['start', 'map', 'stop'] }
        : {
            mode: 'hub',
            title: p.name ? `Hey ${p.name}` : 'Ready when you are',
            sub: `Today: ${plan.title} · ${plan.minutes} min`,
            stats: [
              { label: 'This week', value: `${g.sessionsDone} / ${g.sessions} sessions` },
              { label: 'Active minutes', value: `${g.minutesDone} / ${g.minutes}` },
              { label: 'Week streak', value: String(g.streak) },
            ],
            hint: 'Say “start workout” or “map my gym”',
            buttons: ['start', 'map', 'stop'],
          },
    );
    if (!summary) {
      this.coachCmd({ do: 'wave' });
      if (speak) {
        const mapped = GEAR_IDS.some((id) => p.gear[id].owned && p.gear[id].placement);
        this.say(this.mode === 'mr' && !mapped ? 'hubunmapped' : 'hub');
      }
    }
  }

  private startWorkout() {
    this.voice?.stop();
    const plan = buildPlan(this.profile);
    this.voice?.prepare(plan.steps.flatMap((s) => [`how-${s.ex}`, ...EXERCISES[s.ex].tips.map((_, i) => `tip-${s.ex}-${i + 1}`)]));
    const w = new Workout(this, this.profile, plan, (p) => this.persist(p));
    this.run(w, () => this.enterHub(false, this.view));
  }

  private startMapping() {
    this.voice?.stop();
    this.stations.showGhosts = true;
    const owned = GEAR_IDS.filter((id) => this.profile.gear[id].owned);
    this.run(new Mapping(this, owned), () => this.enterHub(true));
  }

  private run(s: Script, done: () => void) {
    this.script = s;
    this.onDone = done;
    s.start();
  }
  private onDone: () => void = () => {};

  private persist(p: Profile) {
    this.profile = p;
    saveProfile(p);
    this.onProfile(p);
  }

  // ───────────── Intents ─────────────

  private onHeard(intent: Intent, heard: string) {
    // The mic can pick up the coach himself ("say, I'm ready…"): ignore our own words.
    if (this.time < this.said.until && this.said.text.includes(heard.toLowerCase())) return;
    this.board.setHeard(heard);
    this.debug.heard.push(`${heard} → ${intent}`);
    this.beeper?.play('heard');
    this.intent(intent);
  }

  /** One entry point for voice, board buttons, keyboard and tests. */
  intent(i: Intent) {
    if (this.script) return this.script.onIntent(i);
    if (i === 'start' || i === 'ready') this.startWorkout();
    else if (i === 'map') this.startMapping();
    else if (i === 'stop') this.exit();
  }

  // ───────────── Stage (what scripts can do) ─────────────

  say(ids: string | string[], opts?: { mode?: SayMode; caption?: string }): number {
    if (this.voice) return this.voice.say(ids, opts);
    const list = [ids].flat();
    const text = opts?.caption ?? list.map(lineText).join(' ');
    const d = list.reduce((s, id) => s + 0.35 + lineText(id).split(/\s+/).length * 0.3, 0);
    this.board.setCaption(text, d + 1);
    this.debug.captions.push(text);
    return d;
  }
  hush() {
    this.voice?.stop();
  }
  beep(kind: Parameters<Stage['beep']>[0]) {
    this.beeper?.play(kind);
  }
  body(): BodyState {
    if (this.mode === 'preview') {
      // No headset: a simulated trainee does the work so the whole flow can be tried on a laptop.
      const e = this.view.ex ? EXERCISES[this.view.ex] : null;
      if (e && this.view.mode === 'work') return simulateBody(e, this.simT / e.tempo, this.standH);
      return simulateBody(EXERCISES.squat, 0, this.standH);
    }
    return { head: this.head, left: this.hands.left, right: this.hands.right, standH: this.standH };
  }
  show(v: HudView) {
    const e = v.ex ? EXERCISES[v.ex] : null;
    const changed = v.ex !== this.view.ex;
    this.view = v;
    this.debug.view = v;
    this.board.show(v, changed && e ? this.demoCtx(v.ex!) : undefined);
  }
  private demoCtx(id: string) {
    const c = this.stations.ctx(EXERCISES[id]?.bench ?? 0);
    return c;
  }
  coach(cmd: CoachCmd) {
    this.coachCmd(cmd);
  }
  distanceTo(gear: GearId): number | null {
    const f = this.stations.frame(gear);
    if (!f.mapped && this.mode === 'mr') return null;
    if (this.mode === 'preview') return null;
    const p = this.stations.world(gear);
    return Math.hypot(p.x - this.head.x, p.z - this.head.z);
  }
  guide(gear: GearId | null) {
    this.stations.guide(gear);
  }
  celebrate() {
    this.burst(this.coachAt.pos.clone().setY(1.9));
  }
  pointer(): V3 | null {
    return this.tips[this.lastTip] ?? this.tips.left ?? this.tips.right ?? this.hands.right ?? this.hands.left ?? (this.mode === 'preview' ? this.previewPoint() : null);
  }
  place(gear: GearId, p: Placement | null) {
    const item = this.profile.gear[gear];
    if (p) {
      // Scripts work in world space; placements are stored relative to the gym anchor.
      const local = (t: [number, number, number]) => this.stations.root.worldToLocal(new THREE.Vector3(...t)).toArray() as [number, number, number];
      let a = local(p.a), b = local(p.b);
      if (gear === 'pullup_bar') {
        // Make "left/right" mean the trainee's left/right from where they are standing now.
        const mid = new THREE.Vector3((a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2);
        const me = this.stations.root.worldToLocal(this.head.clone()).setY(0).sub(mid);
        const r = new THREE.Vector3(b[0] - a[0], 0, b[2] - a[2]);
        if (new THREE.Vector3(-r.z, 0, r.x).dot(me) < 0) [a, b] = [b, a];
      }
      item.placement = { a, b };
    } else delete item.placement;
    this.stations.set(gear, item.placement, item.owned);
    this.figure.setCtx(this.stations.ctx(0));
    this.persist(this.profile);
  }
  calibrate(standH: number) {
    this.standH = standH;
  }

  // ───────────── The coach's whereabouts ─────────────

  private syncStations() {
    for (const id of GEAR_IDS) this.stations.set(id, this.profile.gear[id].placement, this.profile.gear[id].owned);
  }

  /** Where an exercise is demonstrated: on the real bench, under the real bar, beside the mat, or in front of you. */
  private stageFor(id: string): Spot & { station: GearId | null } {
    const e = EXERCISES[id];
    const st = e ? stationOf(e) : null;
    if (st === 'bench' || st === 'pullup_bar') return { pos: this.stations.world(st), yaw: this.stations.worldYaw(st), station: st };
    if (st === 'mat' && this.stations.frame('mat').mapped && this.mode === 'mr') {
      const pos = this.stations.world('mat');
      const m = this.stations.worldYaw('mat');
      const perp = new THREE.Vector3(Math.cos(m), 0, -Math.sin(m));
      const side = perp.dot(this.head.clone().sub(pos)) > 0 ? -1 : 1; // the far side of the mat from you
      return { pos: pos.addScaledVector(perp, side * 1.05), yaw: m - Math.PI / 2, station: 'mat' };
    }
    if (this.mode !== 'preview') {
      const f = this.freeStage;
      const d = Math.hypot(f.pos.x - this.head.x, f.pos.z - this.head.z);
      const facing = new THREE.Vector3(f.pos.x - this.head.x, 0, f.pos.z - this.head.z).normalize().dot(this.flatGaze());
      if (d < 1.3 || d > 3.6 || facing < 0.3) {
        const pos = this.head.clone().setY(0).addScaledVector(this.flatGaze(), 2.1);
        this.freeStage = { pos, yaw: yawTo(pos, this.head) };
      }
    }
    return { ...this.freeStage, station: null };
  }

  private flatGaze() {
    const g = this.gaze.clone().setY(0);
    return g.lengthSq() < 1e-4 ? new THREE.Vector3(0, 0, -1) : g.normalize();
  }

  /** Beside a station, on the side the trainee watched from, looking at it. */
  private spotBy(gear: GearId, faceUser = false): Spot {
    const c = this.stations.world(gear);
    const yaw = this.stations.worldYaw(gear);
    const lateral = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const me = this.watchFrom.clone().sub(c);
    const side = lateral.dot(me) >= 0 ? 1 : -1;
    const pos = gear === 'pullup_bar' ? c.clone().addScaledVector(lateral, side * 0.95).addScaledVector(fwd, 0.55) : c.clone().addScaledVector(lateral, side * 0.82);
    return { pos, yaw: faceUser ? yawTo(pos, this.head) : yawTo(pos, gear === 'pullup_bar' ? c.clone().addScaledVector(fwd, 0.6) : c) };
  }

  private placeCoach(s: Spot, snap = false) {
    const moved = this.coachAt.pos.distanceTo(s.pos) > 0.08 || Math.abs(Math.atan2(Math.sin(s.yaw - this.coachAt.yaw), Math.cos(s.yaw - this.coachAt.yaw))) > 0.15;
    this.coachAt = { pos: s.pos.clone(), yaw: s.yaw };
    this.figure.group.position.copy(s.pos);
    this.figure.group.rotation.y = s.yaw;
    if (moved && !snap) this.coachFade = 0;
    return moved;
  }

  private coachCmd(cmd: CoachCmd) {
    if (cmd.do === 'demo') {
      const e = EXERCISES[cmd.ex];
      const stage = this.stageFor(cmd.ex);
      this.watchFrom.copy(this.head);
      const moved = this.placeCoach(stage) || this.station !== stage.station;
      this.station = stage.station;
      this.figure.setCtx(this.stations.ctx(e?.bench ?? 0));
      if (e?.bench !== undefined) this.stations.setBenchAngle(e.bench);
      this.figure.play(cmd.ex, (cmd.speed ?? 1) / (e?.tempo ?? 3), { snap: moved });
      return;
    }
    const equipment = this.station === 'bench' || this.station === 'pullup_bar' ? this.station : null;
    let moved = false;
    if (cmd.do === 'beckon') {
      moved = this.placeCoach(this.spotBy(cmd.gear, true));
      this.station = null;
    } else if (equipment) {
      // Never stand up inside the bench: step off to the side first.
      moved = this.placeCoach(this.spotBy(equipment, cmd.do !== 'spot'));
      this.station = null;
    } else if (cmd.do !== 'spot' && this.mode !== 'preview') {
      this.placeCoach({ pos: this.coachAt.pos, yaw: yawTo(this.coachAt.pos, this.head) }, true);
    }
    const rate = { idle: 0.22, wave: 1.1, cheer: 1.3, spot: 0.25, beckon: 0.8 }[cmd.do];
    this.figure.play(cmd.do, rate, { snap: moved });
  }

  // ───────────── Anchors ─────────────

  private restoreAnchor(session: SessionX) {
    const handle = this.profile.anchor;
    if (handle && session.restorePersistentAnchor) {
      session.restorePersistentAnchor(handle).then(
        (a) => ((this.anchor = a), (this.debug.anchor = 'restored')),
        () => {
          // The room was re-scanned or the anchor expired: start a new one where we are.
          this.profile.anchor = '';
          this.wantAnchor = true;
        },
      );
    } else this.wantAnchor = true;
  }

  private trackAnchor(frame: XRFrame, ref: XRReferenceSpace) {
    if (this.wantAnchor && frame.createAnchor) {
      this.wantAnchor = false;
      frame.createAnchor(new XRRigidTransform(), ref)?.then(
        async (a: AnchorX) => {
          this.anchor = a;
          this.debug.anchor = 'created';
          try {
            const h = await a.requestPersistentHandle?.();
            if (h) (this.profile.anchor = h), this.persist(this.profile), (this.debug.anchor = 'persisted');
          } catch {
            /* this browser keeps anchors for the session only */
          }
        },
        () => {},
      );
    }
    if (!this.anchor) return;
    const pose = frame.getPose(this.anchor.anchorSpace, ref);
    if (!pose) return;
    const { position: p, orientation: o } = pose.transform;
    this.stations.root.position.set(p.x, p.y, p.z);
    this.stations.root.quaternion.set(o.x, o.y, o.z, o.w);
    this.stations.root.updateMatrixWorld(true);
  }

  // ───────────── Input ─────────────

  private rayFrom(frame: XRFrame, src: XRInputSource, ref: XRReferenceSpace): THREE.Raycaster | null {
    const pose = frame.getPose(src.targetRaySpace, ref);
    if (!pose) return null;
    const { position: p, orientation: o } = pose.transform;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(o.x, o.y, o.z, o.w));
    return new THREE.Raycaster(new THREE.Vector3(p.x, p.y, p.z), dir, 0, 6);
  }

  private onSelect(e: XRInputSourceEvent) {
    const ref = this.renderer.xr.getReferenceSpace();
    if (!ref) return;
    const ray = this.rayFrom(e.frame, e.inputSource, ref);
    const hit = ray && this.board.hit(ray);
    if (hit) {
      this.beeper?.play('heard');
      return this.intent(hit.intent);
    }
    // A pinch in open space is a "here" for the mapping wizard.
    const side = e.inputSource.handedness === 'left' ? 'left' : 'right';
    const p = this.tips[side] ?? this.hands[side] ?? ray?.ray.origin;
    if (p && this.script) this.script.onPoint({ x: p.x, y: p.y, z: p.z });
  }

  private readInputs(frame: XRFrame, ref: XRReferenceSpace, dt: number) {
    this.hands.left = this.hands.right = this.tips.left = this.tips.right = null;
    const hovered: (Intent | null)[] = [];
    let i = 0;
    for (const src of this.session!.inputSources) {
      const side = src.handedness === 'left' ? 'left' : src.handedness === 'right' ? 'right' : null;
      if (!side) continue;
      const v = (pose?: XRPose | null) => (pose ? new THREE.Vector3(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z) : null);
      if (src.hand && frame.getJointPose) {
        const j = (name: XRHandJoint) => {
          const sp = src.hand!.get(name);
          return sp ? v(frame.getJointPose!(sp, ref)) : null;
        };
        this.hands[side] = j('wrist');
        const index = j('index-finger-tip'), thumb = j('thumb-tip');
        this.tips[side] = index && thumb ? index.clone().lerp(thumb, 0.5) : index;
        if (index && this.time > this.pokeAt) {
          const poked = this.board.poke(index);
          if (poked) (this.pokeAt = this.time + 0.9), this.beeper?.play('heard'), this.intent(poked);
        }
      } else if (src.gripSpace) {
        this.hands[side] = v(frame.getPose(src.gripSpace, ref));
        this.tips[side] = this.hands[side];
      }
      if (this.tips[side]) this.lastTip = this.tips[side] && side === 'left' && !this.tips.right ? 'left' : 'right';
      const ray = this.rayFrom(frame, src, ref);
      const r = this.rays[i++ % 2];
      const hit = ray ? this.board.hit(ray) : null;
      const at = hit?.point ?? (ray ? this.board.hitsPanel(ray) : null);
      r.line.visible = r.dot.visible = !!at;
      if (at && ray) {
        (r.line.geometry as THREE.BufferGeometry).setFromPoints([ray.ray.origin, at]);
        r.dot.position.copy(at);
      }
      hovered.push(hit?.intent ?? null);
    }
    for (; i < 2; i++) this.rays[i].line.visible = this.rays[i].dot.visible = false;
    this.board.hover(hovered, dt);
    (['left', 'right'] as const).forEach((s, k) => {
      const h = this.hands[s];
      this.handDots[k].visible = this.mode === 'vr' && !!h;
      if (h) this.handDots[k].position.copy(h);
    });
  }

  private previewPoint(): V3 {
    return { x: this.head.x + this.gaze.x * 1.2, y: 0.45, z: this.head.z + this.gaze.z * 1.2 };
  }

  private bindPreviewInput() {
    const c = this.canvas;
    let drag: { x: number; y: number; moved: boolean } | null = null;
    const ray = (ev: PointerEvent) => {
      const r = c.getBoundingClientRect();
      const rc = new THREE.Raycaster();
      rc.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), this.camera);
      return rc;
    };
    const down = (ev: PointerEvent) => (drag = { x: ev.clientX, y: ev.clientY, moved: false });
    const move = (ev: PointerEvent) => {
      if (this.session) return;
      if (drag && ev.buttons) {
        const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
        this.look.yaw -= dx * 0.004;
        this.look.pitch = Math.max(-1.2, Math.min(1.2, this.look.pitch - dy * 0.004));
        drag.x = ev.clientX;
        drag.y = ev.clientY;
      }
      this.board.hover([this.board.hit(ray(ev))?.intent ?? null], 1);
    };
    const up = (ev: PointerEvent) => {
      if (this.session || drag?.moved) return;
      const hit = this.board.hit(ray(ev));
      if (hit) this.intent(hit.intent);
      else if (this.script) this.script.onPoint(this.previewPoint());
    };
    const keys: Record<string, Intent> = { r: 'ready', b: 'break', s: 'skip', d: 'done', e: 'stop', w: 'repeat', m: 'map', Enter: 'start', h: 'place', '+': 'harder', '-': 'easier' };
    const key = (ev: KeyboardEvent) => keys[ev.key] && !this.session && this.intent(keys[ev.key]);
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    addEventListener('keydown', key);
    this.cleanup.push(() => (c.removeEventListener('pointerdown', down), c.removeEventListener('pointermove', move), c.removeEventListener('pointerup', up), removeEventListener('keydown', key)));
  }

  // ───────────── Frame ─────────────

  private frame(frame?: XRFrame) {
    if (this.disposed) return;
    const dt = Math.min(0.1, this.clock.getDelta());
    this.time += dt;
    const ref = this.renderer.xr.getReferenceSpace();
    if (frame && ref && this.session) {
      const viewer = frame.getViewerPose(ref);
      if (viewer) {
        const { position: p, orientation: o } = viewer.transform;
        this.head.set(p.x, p.y, p.z);
        this.gaze.set(0, 0, -1).applyQuaternion(new THREE.Quaternion(o.x, o.y, o.z, o.w));
      }
      this.trackAnchor(frame, ref);
      this.readInputs(frame, ref, dt);
    } else {
      this.camera.position.set(0, 1.62, 0.9);
      this.camera.rotation.set(this.look.pitch, this.look.yaw, 0, 'YXZ');
      this.head.set(0, 1.62, 0.9);
      this.gaze.set(0, 0, -1).applyEuler(this.camera.rotation);
    }

    const visible = !this.session || this.session.visibilityState === 'visible';
    if (this.script && visible) {
      if (this.view.mode === 'work' && !this.script.paused) this.simT += dt;
      else this.simT = 0;
      this.script.update(dt);
      if (this.script.finished) this.onDone();
    }

    // Coach: animate, and shimmer in when he changes place.
    this.figure.update(dt);
    if (this.coachFade < 1) {
      this.coachFade = Math.min(1, this.coachFade + dt / 0.45);
      const k = this.coachFade * this.coachFade * (3 - 2 * this.coachFade);
      this.figure.setOpacity(k);
      this.figure.group.scale.set(0.9 + 0.1 * k, 0.6 + 0.4 * k, 0.9 + 0.1 * k);
    }

    this.stations.update(dt, this.head);
    this.placeBoard(dt);
    this.board.update(dt, this.renderer);
    this.updateConfetti(dt);
    this.renderer.render(this.scene, this.camera);
  }

  /** The board stays beside the coach, or drifts into view when you're on the bench, the floor or the move. */
  private placeBoard(dt: number) {
    const v = this.view;
    const e = v.ex ? EXERCISES[v.ex] : null;
    const busy = v.mode === 'work' || v.mode === 'countdown' || v.mode === 'ready' || v.mode === 'rest' || v.mode === 'paused';
    const onGear = !!e && (e.gear.includes('bench') || e.gear.includes('pullup_bar') || e.posture === 'prone' || e.posture === 'supine');
    const follow = this.mode !== 'preview' && (v.mode === 'mapping' || v.mode === 'goto' || (busy && onGear));
    const goal = this.boardGoal;
    if (follow) {
      const cur = this.board.group.position.clone().sub(this.head);
      const dist = cur.length();
      const g = this.gaze.clone();
      g.y = Math.max(-0.75, Math.min(0.92, g.y));
      g.normalize();
      const off = Math.acos(Math.max(-1, Math.min(1, cur.normalize().dot(g))));
      if (off > 0.55 || dist < 0.7 || dist > 2.2 || this.boardSnap) {
        // Settle a little to the side of where they're looking, never dead centre over the work.
        const right = new THREE.Vector3().crossVectors(g, UP);
        if (right.lengthSq() < 0.01) right.set(1, 0, 0);
        right.normalize();
        goal.pos.copy(this.head).addScaledVector(g, 1.25).addScaledVector(right, 0.32);
        goal.pos.y = Math.max(0.35, goal.pos.y);
        goal.scale = 0.72;
      }
      goal.quat.setFromRotationMatrix(new THREE.Matrix4().lookAt(this.head, goal.pos, UP));
    } else {
      const c = this.coachAt.pos;
      const to = new THREE.Vector3(c.x - this.head.x, 0, c.z - this.head.z);
      const d = to.length() || 1;
      to.divideScalar(d);
      const right = new THREE.Vector3().crossVectors(to, UP);
      goal.pos.copy(c).addScaledVector(right, 1.05).addScaledVector(to, -0.15).setY(1.42);
      goal.scale = Math.max(0.8, Math.min(1.5, d / 2.3));
      goal.quat.setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(this.head.x, goal.pos.y + 0.1, this.head.z), goal.pos, UP));
    }
    const k = this.boardSnap ? 1 : 1 - Math.exp(-dt * 4.5);
    this.boardSnap = false;
    this.board.group.position.lerp(goal.pos, k);
    this.board.group.quaternion.slerp(goal.quat, k);
    this.board.group.scale.setScalar(this.board.group.scale.x + (goal.scale - this.board.group.scale.x) * k);
  }

  // ───────────── Scenery & effects ─────────────

  private buildEnvironment() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(30, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader: 'varying vec3 p; void main(){ p = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader:
          'varying vec3 p; void main(){ float h = normalize(p).y; vec3 lo = vec3(0.07,0.10,0.15); vec3 hi = vec3(0.02,0.03,0.05); vec3 glow = vec3(0.10,0.42,0.38); vec3 c = mix(lo, hi, smoothstep(0.0,0.6,h)) + glow * 0.35 * exp(-abs(h) * 9.0); gl_FragColor = vec4(c,1.0); }',
      }),
    );
    const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64), new THREE.MeshStandardMaterial({ color: 0x131822, roughness: 0.92 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.004;
    const grid = new THREE.GridHelper(28, 56, 0x2c6f66, 0x1c2431);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.55;
    this.env.add(sky, floor, grid);
  }

  private burst(at: THREE.Vector3) {
    if (this.confetti) this.scene.remove(this.confetti.pts);
    const n = 260;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), vel = new Float32Array(n * 3);
    const palette = [0x4de2c5, 0xffb454, 0xff7a9c, 0x7aa8ff, 0xffffff].map((c) => new THREE.Color(c));
    for (let i = 0; i < n; i++) {
      at.toArray(pos, i * 3);
      const a = Math.random() * Math.PI * 2, s = 0.8 + Math.random() * 2.2;
      vel.set([Math.cos(a) * s, 1.5 + Math.random() * 3, Math.sin(a) * s], i * 3);
      palette[i % palette.length].toArray(col, i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.035, vertexColors: true, transparent: true, depthWrite: false }));
    pts.frustumCulled = false;
    this.confetti = { pts, vel, life: 3.2 };
    this.scene.add(pts);
  }

  private updateConfetti(dt: number) {
    const c = this.confetti;
    if (!c) return;
    c.life -= dt;
    if (c.life <= 0) {
      this.scene.remove(c.pts);
      this.confetti = null;
      return;
    }
    const pos = c.pts.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      c.vel[i * 3 + 1] -= 4.5 * dt;
      for (let k = 0; k < 3; k++) c.vel[i * 3 + k] *= 1 - 0.9 * dt;
      const y = Math.max(0.01, pos.getY(i) + c.vel[i * 3 + 1] * dt);
      pos.setXYZ(i, pos.getX(i) + c.vel[i * 3] * dt, y, pos.getZ(i) + c.vel[i * 3 + 2] * dt);
    }
    pos.needsUpdate = true;
    (c.pts.material as THREE.PointsMaterial).opacity = Math.min(1, c.life);
  }
}
