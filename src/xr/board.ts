import * as THREE from 'three';
import { DemoScene } from '../avatar/demo';
import type { Ctx } from '../avatar/anims';
import type { EarsState } from '../coach/ears';
import type { Intent } from '../coach/intents';
import type { HudView } from '../coach/script';

const W = 1280, H = 720;
export const BOARD_W = 1.3, BOARD_H = (BOARD_W * H) / W;
const DEMO = { x: 28, y: 28, s: 520 }; // demo viewport on the canvas, px
const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const COL = { bg: 'rgba(11,14,20,0.9)', line: 'rgba(120,140,170,0.28)', text: '#eef2f8', dim: '#94a0b4', teal: '#4de2c5', amber: '#ffb454', pink: '#ff7a9c' };

const LABEL: Record<Intent, string> = {
  ready: "I'M READY", break: 'BREAK', skip: 'SKIP', done: 'DONE', stop: 'END', repeat: 'SHOW ME', easier: 'EASIER', harder: 'HARDER',
  status: 'STATUS', start: 'START WORKOUT', map: 'MAP MY GYM', place: 'HERE',
};

interface Button {
  intent: Intent;
  mesh: THREE.Mesh;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  hover: number;
  label: string;
}

/**
 * The coach's board: a floating panel with the looping exercise animation on
 * the left, the live numbers on the right, captions along the bottom and a row
 * of buttons underneath for when you'd rather point than talk.
 */
export class Board {
  readonly group = new THREE.Group();
  readonly demo = new DemoScene();
  private canvas = document.createElement('canvas');
  private g: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private rt = new THREE.WebGLRenderTarget(640, 640, { samples: 4 });
  private demoMesh: THREE.Mesh;
  private buttons: Button[] = [];
  private view: HudView = { mode: 'hub', title: '', buttons: [] };
  private key = '';
  private caption = '';
  private captionUntil = 0;
  private heard = '';
  private heardUntil = 0;
  private ears: EarsState = 'off';
  private pulse = 0;
  private time = 0;
  private lastBig = '';

  constructor() {
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W, BOARD_H), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false }));
    panel.renderOrder = 10;
    const k = BOARD_W / W;
    this.demoMesh = new THREE.Mesh(new THREE.PlaneGeometry(DEMO.s * k, DEMO.s * k), new THREE.MeshBasicMaterial({ map: this.rt.texture, transparent: true, depthWrite: false }));
    this.demoMesh.position.set((DEMO.x + DEMO.s / 2 - W / 2) * k, (H / 2 - DEMO.y - DEMO.s / 2) * k, 0.002);
    this.demoMesh.renderOrder = 11;
    this.group.add(panel, this.demoMesh);
    this.demo.scene.background = null;
    this.draw();
  }

  setEars(s: EarsState) {
    this.ears = s;
    this.key = '';
  }
  setCaption(text: string, seconds: number) {
    this.caption = text;
    this.captionUntil = this.time + seconds;
    this.key = '';
  }
  /** Flash what the coach just heard, so voice never feels like a black box. */
  setHeard(text: string) {
    this.heard = text;
    this.heardUntil = this.time + 2.2;
    this.key = '';
  }

  show(v: HudView, ctx?: Ctx) {
    if (v.big !== this.lastBig && v.mode === 'work') this.pulse = 1;
    this.lastBig = v.big ?? '';
    const showDemo = !!v.ex && v.mode !== 'summary';
    if (showDemo && (v.ex !== this.demo.ex || ctx)) this.demo.set(v.ex!, ctx);
    this.demoMesh.visible = showDemo;
    if (v.buttons.join() !== this.view.buttons.join() || v.mode !== this.view.mode) this.layoutButtons(v);
    this.view = v;
  }

  private layoutButtons(v: HudView) {
    for (const b of this.buttons) this.group.remove(b.mesh), b.tex.dispose(), (b.mesh.material as THREE.Material).dispose();
    this.buttons = [];
    const n = v.buttons.length;
    if (!n) return;
    const gap = 0.025;
    const bw = Math.min(0.4, (BOARD_W - gap * (n - 1)) / n), bh = 0.125;
    v.buttons.forEach((intent, i) => {
      const c = document.createElement('canvas');
      c.width = 384;
      c.height = Math.round((384 * bh) / bw);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      mesh.position.set((i - (n - 1) / 2) * (bw + gap), -BOARD_H / 2 - bh / 2 - 0.03, 0.01);
      mesh.renderOrder = 12;
      const label = intent === 'stop' && (v.mode === 'hub' || v.mode === 'summary') ? 'EXIT' : intent === 'done' && v.mode === 'mapping' ? 'FINISH' : intent === 'ready' && v.mode === 'rest' ? 'SKIP REST' : LABEL[intent];
      const b: Button = { intent, mesh, ctx: c.getContext('2d')!, tex, hover: -1, label };
      this.buttons.push(b);
      this.group.add(mesh);
      this.paintButton(b, 0);
    });
  }

  private paintButton(b: Button, hover: number) {
    if (Math.abs(hover - b.hover) < 0.04) return;
    b.hover = hover;
    const g = b.ctx, w = g.canvas.width, h = g.canvas.height;
    const primary = b.intent === 'ready' || b.intent === 'start';
    const danger = b.intent === 'stop';
    g.clearRect(0, 0, w, h);
    g.beginPath();
    g.roundRect(4, 4, w - 8, h - 8, h * 0.36);
    g.fillStyle = primary ? `rgba(77,226,197,${0.85 + hover * 0.15})` : `rgba(${20 + hover * 40},${26 + hover * 50},${38 + hover * 60},0.92)`;
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = danger ? COL.pink : primary ? '#bff7ea' : hover > 0.3 ? COL.teal : 'rgba(140,160,190,0.5)';
    g.stroke();
    g.fillStyle = primary ? '#06231d' : danger ? COL.pink : COL.text;
    let size = h * 0.34;
    g.font = `700 ${size}px ${FONT}`;
    while (g.measureText(b.label).width > w - 40 && size > 12) g.font = `700 ${(size -= 2)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(b.label, w / 2, h / 2 + 2);
    b.tex.needsUpdate = true;
  }

  /** Which button a ray hits, and where; also drives hover feedback. */
  hit(ray: THREE.Raycaster): { intent: Intent; point: THREE.Vector3 } | null {
    const hits = ray.intersectObjects(this.buttons.map((b) => b.mesh), false);
    const b = hits.length ? this.buttons.find((x) => x.mesh === hits[0].object) : undefined;
    return b ? { intent: b.intent, point: hits[0].point } : null;
  }
  /** A fingertip pushed through a button. */
  poke(tip: THREE.Vector3): Intent | null {
    const p = new THREE.Vector3();
    for (const b of this.buttons) {
      p.copy(tip);
      b.mesh.worldToLocal(p);
      const geo = (b.mesh.geometry as THREE.PlaneGeometry).parameters;
      if (Math.abs(p.x) < geo.width / 2 && Math.abs(p.y) < geo.height / 2 && p.z < 0.012 && p.z > -0.05) return b.intent;
    }
    return null;
  }
  hover(intents: (Intent | null)[], dt: number) {
    for (const b of this.buttons) {
      const target = intents.includes(b.intent) ? 1 : 0;
      this.paintButton(b, Math.max(0, b.hover) + (target - Math.max(0, b.hover)) * Math.min(1, dt * 12));
    }
  }
  hitsPanel(ray: THREE.Raycaster): THREE.Vector3 | null {
    const h = ray.intersectObject(this.group.children[0], false);
    return h.length ? h[0].point : null;
  }

  update(dt: number, renderer: THREE.WebGLRenderer) {
    this.time += dt;
    this.pulse = Math.max(0, this.pulse - dt * 3);
    if (this.demoMesh.visible) {
      this.demo.update(dt, 1);
      // Render the little studio into its texture (outside the XR camera rig).
      const xr = renderer.xr.enabled, cur = renderer.getRenderTarget();
      const clear = renderer.getClearAlpha();
      renderer.xr.enabled = false;
      renderer.setRenderTarget(this.rt);
      renderer.setClearAlpha(0);
      renderer.clear();
      renderer.render(this.demo.scene, this.demo.camera);
      renderer.setRenderTarget(cur);
      renderer.setClearAlpha(clear);
      renderer.xr.enabled = xr;
    }
    const v = this.view;
    const cap = this.time < this.captionUntil ? this.caption : '';
    const heard = this.time < this.heardUntil ? this.heard : '';
    const key = [v.mode, v.title, v.sub, v.big, v.unit, Math.round((v.progress ?? -1) * 200), Math.round((v.depth ?? -1) * 40), v.set?.join(), v.step?.join(), v.hint, v.next, cap, heard, this.ears, Math.round(this.pulse * 10), v.stats?.map((s) => s.value).join()].join('|');
    if (key === this.key) return;
    this.key = key;
    this.draw(cap, heard);
  }

  private draw(cap = '', heard = '') {
    const g = this.g, v = this.view;
    g.clearRect(0, 0, W, H);
    g.beginPath();
    g.roundRect(6, 6, W - 12, H - 12, 44);
    g.fillStyle = COL.bg;
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = v.mode === 'paused' ? COL.amber : 'rgba(77,226,197,0.55)';
    g.stroke();

    const hasDemo = !!v.ex && v.mode !== 'summary';
    const x0 = hasDemo ? DEMO.x + DEMO.s + 36 : 64;
    const cx = (x0 + W - 40) / 2;
    if (hasDemo) {
      g.beginPath();
      g.roundRect(DEMO.x, DEMO.y, DEMO.s, DEMO.s, 30);
      g.fillStyle = 'rgba(22,28,40,0.9)';
      g.fill();
      g.strokeStyle = COL.line;
      g.lineWidth = 2;
      g.stroke();
    }
    g.textBaseline = 'alphabetic';
    const fit = (text: string, max: number, size: number, weight = 700) => {
      g.font = `${weight} ${size}px ${FONT}`;
      while (g.measureText(text).width > max && size > 16) g.font = `${weight} ${(size -= 2)}px ${FONT}`;
    };

    // Header.
    g.textAlign = 'left';
    g.fillStyle = COL.teal;
    g.font = `700 30px ${FONT}`;
    const tag = { hub: 'GYM COACH', brief: "TODAY'S SESSION", goto: 'ON THE MOVE', demo: 'WATCH', ready: 'YOUR TURN', countdown: 'GET SET', work: 'WORK', rest: 'REST', paused: 'PAUSED', summary: 'DONE', mapping: 'GYM SET-UP' }[v.mode];
    g.fillText(tag + (v.step ? `   ${v.step[0]} / ${v.step[1]}` : ''), x0, 76);
    if (v.set) {
      g.textAlign = 'right';
      g.fillStyle = COL.amber;
      g.fillText(`SET ${v.set[0]} / ${v.set[1]}`, W - 48, 76);
      g.textAlign = 'left';
    }
    g.fillStyle = COL.text;
    fit(v.title, W - 48 - x0, hasDemo ? 62 : 76);
    g.fillText(v.title, x0, 146);
    if (v.sub) {
      g.fillStyle = COL.dim;
      fit(v.sub, W - 48 - x0, 38, 500);
      g.fillText(v.sub, x0, 196);
    }

    // The big figure with its ring.
    if (v.big) {
      const cy = 362, r = 112;
      g.textAlign = 'center';
      if (v.progress !== undefined) {
        g.lineWidth = 16;
        g.strokeStyle = 'rgba(120,140,170,0.2)';
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.stroke();
        g.strokeStyle = v.mode === 'rest' ? COL.amber : COL.teal;
        g.lineCap = 'round';
        g.beginPath();
        g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, Math.max(0.001, v.progress)));
        g.stroke();
        g.lineCap = 'butt';
      }
      const size = (v.big.length > 3 ? 84 : 132) * (1 + this.pulse * 0.16);
      g.fillStyle = this.pulse > 0.05 ? COL.teal : COL.text;
      fit(v.big, v.progress !== undefined ? r * 1.6 : W - 60 - x0, size, 800);
      g.fillText(v.big, cx, cy + (v.big.length > 3 ? 28 : 44));
      if (v.unit) {
        g.fillStyle = COL.dim;
        fit(v.unit, W - 60 - x0, 34, 600);
        g.fillText(v.unit, cx, cy + r + 50);
      }
      // Live range-of-motion gauge.
      if (v.depth !== undefined) {
        const gx = W - 84, gy = 250, gh = 230;
        g.fillStyle = 'rgba(120,140,170,0.2)';
        g.beginPath();
        g.roundRect(gx, gy, 22, gh, 11);
        g.fill();
        const d = Math.min(1, v.depth);
        g.fillStyle = v.depth >= 1 ? COL.teal : COL.amber;
        g.beginPath();
        g.roundRect(gx, gy + gh * (1 - d), 22, Math.max(22, gh * d), 11);
        g.fill();
        g.fillStyle = COL.dim;
        g.font = `600 18px ${FONT}`;
        g.fillText('RANGE', gx + 11, gy + gh + 28);
      }
      g.textAlign = 'left';
    }

    // Stats list (plan, summary, weekly goal).
    if (v.stats?.length) {
      const top = v.big ? 520 : 262, rows = v.stats.slice(0, v.hint ? 4 : 5), rh = Math.min(66, (560 - top) / rows.length);
      rows.forEach((s, i) => {
        const y = top + i * rh;
        g.fillStyle = COL.dim;
        fit(s.label, (W - 48 - x0) * 0.62, 38, 500);
        g.fillText(s.label, x0, y);
        g.textAlign = 'right';
        g.fillStyle = COL.text;
        g.font = `700 38px ${FONT}`;
        g.fillText(s.value, W - 48, y);
        g.textAlign = 'left';
        g.fillStyle = COL.line;
        g.fillRect(x0, y + 20, W - 48 - x0, 1.5);
      });
    }
    if (v.hint) {
      g.fillStyle = COL.amber;
      fit(v.hint, W - 48 - x0, 34, 600);
      g.textAlign = 'center';
      g.fillText(v.hint, cx, 556);
      g.textAlign = 'left';
    }
    if (v.next && hasDemo && v.mode !== 'rest') {
      g.fillStyle = COL.dim;
      g.font = `500 22px ${FONT}`;
      g.fillText(`Next: ${v.next}`, DEMO.x + 22, DEMO.y + DEMO.s - 20);
    }

    // Caption strip + mic status.
    g.fillStyle = 'rgba(120,140,170,0.14)';
    g.beginPath();
    g.roundRect(28, 580, W - 56, 112, 28);
    g.fill();
    const mic = { listening: ['●', COL.teal, 'listening'], loading: ['◌', COL.amber, 'waking up'], denied: ['✕', COL.pink, 'mic blocked'], unavailable: ['✕', COL.pink, 'no voice'], off: ['○', COL.dim, 'mic off'] }[this.ears] as [string, string, string];
    g.fillStyle = mic[1];
    g.font = `700 24px ${FONT}`;
    g.textAlign = 'right';
    g.fillText(`${mic[0]} ${heard ? `“${heard}”` : mic[2]}`, W - 56, 616);
    g.textAlign = 'left';
    g.fillStyle = COL.text;
    const words = cap.split(' ');
    const lines: string[] = [];
    g.font = `500 34px ${FONT}`;
    let line = '';
    for (const w of words) {
      const max = lines.length === 0 ? W - 360 : W - 120;
      if (g.measureText(`${line} ${w}`).width > max && line) lines.push(line), (line = w);
      else line = line ? `${line} ${w}` : w;
    }
    if (line) lines.push(line);
    const shown = lines.slice(-2);
    shown.forEach((l, i) => g.fillText(l, 56, (shown.length > 1 ? 624 : 648) + i * 42));
    this.tex.needsUpdate = true;
  }
}
