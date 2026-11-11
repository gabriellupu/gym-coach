import { lineText } from './lines';

export type SayMode = 'queue' | 'cut' | 'ifFree';

/** Anything that can speak for the coach (clips today; a voice-to-voice model later). */
export interface Mouth {
  say(ids: string | string[], opts?: { mode?: SayMode; caption?: string }): number;
  stop(): void;
  readonly speaking: boolean;
}

/**
 * The coach's voice: pre-rendered clips in one audio sprite played through
 * Web Audio. Lines without a clip fall back to the browser's speech synthesis,
 * and captions are always emitted so nothing depends on sound.
 */
export class CoachVoice implements Mouth {
  onCaption: (text: string, seconds: number) => void = () => {};
  private buffer: AudioBuffer | null = null;
  private index: Record<string, [number, number]> = {};
  /** Long clips (exercise instructions) fetched on demand, one file each. */
  private extra = new Map<string, AudioBuffer>();
  private base = '';
  private playing: AudioBufferSourceNode[] = [];
  private busyUntil = 0;
  private timers: number[] = [];
  enabled = true;

  constructor(
    private ctx: AudioContext,
    private out: AudioNode,
  ) {}

  /** Decode at the clips' own 22 kHz: half the memory of the context's 48 kHz. */
  private decode(data: ArrayBuffer): Promise<AudioBuffer> {
    return new OfflineAudioContext(1, 1, 22050).decodeAudioData(data);
  }

  /** Fetch the instruction clips a session is going to need. */
  prepare(ids: string[]) {
    for (const id of ids) {
      if (this.extra.has(id) || !this.base) continue;
      fetch(`${this.base}/voice/${id}.mp3`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((b) => this.decode(b))
        .then((buf) => this.extra.set(id, buf))
        .catch(() => {});
    }
  }

  async load(base: string) {
    this.base = base;
    try {
      const [idx, audio] = await Promise.all([fetch(`${base}/voice/coach.json`).then((r) => r.json()), fetch(`${base}/voice/coach.mp3`).then((r) => r.arrayBuffer())]);
      this.buffer = await this.decode(audio);
      this.index = idx;
    } catch (e) {
      console.warn('Coach voice clips unavailable; using speech synthesis / captions', e);
    }
  }

  get speaking() {
    return this.ctx.currentTime < this.busyUntil;
  }

  private duration(id: string) {
    const clip = this.index[id];
    return clip ? clip[1] : (this.extra.get(id)?.duration ?? 0.35 + lineText(id).split(/\s+/).length * 0.3);
  }

  /** Speak lines in order; returns seconds until this speech has finished. */
  say(ids: string | string[], opts: { mode?: SayMode; caption?: string } = {}): number {
    const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
    if (!list.length) return 0;
    const now = this.ctx.currentTime;
    const mode = opts.mode ?? 'queue';
    if (mode === 'ifFree' && this.speaking) return 0;
    if (mode === 'cut') this.stop();
    let t = Math.max(now + 0.02, this.busyUntil);
    const startDelay = t - now;
    const text = opts.caption ?? list.map(lineText).join(' ');
    let total = 0;
    for (const id of list) {
      const d = this.duration(id);
      const clip = this.index[id];
      const whole = this.extra.get(id);
      if (!this.enabled) {
        /* captions only */
      } else if ((this.buffer && clip) || whole) {
        const src = this.ctx.createBufferSource();
        src.buffer = whole ?? this.buffer;
        src.connect(this.out);
        if (whole) src.start(t);
        else src.start(t, Math.max(0, clip[0] - 0.01), clip[1] + 0.03);
        this.playing.push(src);
        src.onended = () => (this.playing = this.playing.filter((p) => p !== src));
      } else if (typeof speechSynthesis !== 'undefined') {
        const u = new SpeechSynthesisUtterance(lineText(id));
        u.rate = 1.05;
        this.timers.push(window.setTimeout(() => speechSynthesis.speak(u), (t - now) * 1000));
      }
      // Clips that are fragments of one sentence ("Three sets of" + "ten" + "reps") run tight.
      const gap = list.length > 1 && d < 1.3 ? 0.04 : 0.16;
      t += d + gap;
      total += d + gap;
    }
    this.timers.push(window.setTimeout(() => this.onCaption(text, total + 1.2), startDelay * 1000));
    this.busyUntil = t;
    return startDelay + total;
  }

  stop() {
    for (const p of this.playing) {
      try {
        p.stop();
      } catch {
        /* already stopped */
      }
    }
    this.playing = [];
    for (const id of this.timers) clearTimeout(id);
    this.timers = [];
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    this.busyUntil = 0;
  }
}

/** Short synthesized cues: countdown ticks, rep blips, chimes. */
export class Beeper {
  constructor(
    private ctx: AudioContext,
    private out: AudioNode,
  ) {}

  private tone(freq: number, dur: number, gain: number, when = 0, type: OscillatorType = 'sine') {
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  play(kind: 'tick' | 'go' | 'rep' | 'done' | 'warn' | 'heard' | 'place') {
    switch (kind) {
      case 'tick': return this.tone(660, 0.12, 0.18);
      case 'go': return this.tone(990, 0.4, 0.22);
      case 'rep': return this.tone(520, 0.09, 0.12, 0, 'triangle');
      case 'warn': return this.tone(300, 0.25, 0.14, 0, 'triangle');
      case 'heard': return this.tone(880, 0.07, 0.08), this.tone(1320, 0.1, 0.08, 0.07);
      case 'place': return this.tone(700, 0.1, 0.16), this.tone(1050, 0.22, 0.16, 0.09);
      case 'done': return [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.5, 0.14, i * 0.11));
    }
  }
}
