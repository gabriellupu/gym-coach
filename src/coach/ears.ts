import { GRAMMAR, matchIntent, type Intent } from './intents';

export type EarsState = 'off' | 'loading' | 'listening' | 'denied' | 'unavailable';

/**
 * Anything that turns the trainee's voice into intents. Today: an offline
 * command recogniser. A voice-to-voice model can implement the same interface
 * and call `onIntent` from its tool calls.
 */
export interface Ears {
  state: EarsState;
  onIntent: (intent: Intent, heard: string) => void;
  onState: (s: EarsState) => void;
  start(ctx: AudioContext): Promise<void>;
  stop(): void;
}

type VoskRecognizer = {
  on(event: string, cb: (m: { result: { text?: string; partial?: string } }) => void): void;
  acceptWaveformFloat(buf: Float32Array, rate: number): void;
  remove(): void;
};
type VoskModel = { KaldiRecognizer: new (rate: number, grammar?: string) => VoskRecognizer; terminate(): void };
declare global {
  interface Window {
    Vosk?: { createModel(url: string): Promise<VoskModel> };
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    SpeechRecognition?: new () => SpeechRecognitionLike;
  }
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}

function loadScript(src: string): Promise<void> {
  return new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => ok();
    s.onerror = () => fail(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

let modelPromise: Promise<VoskModel> | null = null;
/** Starts downloading the recogniser (≈45 MB, cached by the browser) ahead of the session. */
export function preloadEars(base: string): Promise<VoskModel> {
  modelPromise ??= (async () => {
    if (!window.Vosk) await loadScript(`${base}/vendor/vosk.js`);
    return window.Vosk!.createModel(`${base}/models/vosk-model-small-en-us.tar.gz`);
  })();
  modelPromise.catch(() => (modelPromise = null));
  return modelPromise;
}

/**
 * Offline command recognition with Vosk (WASM), constrained to the phrases in
 * intents.ts. Runs entirely on the headset: the Quest browser has no built-in
 * speech recognition, and nothing the trainee says leaves the device.
 * Falls back to the browser's SpeechRecognition where that exists.
 */
export class CommandEars implements Ears {
  state: EarsState = 'off';
  onIntent: (intent: Intent, heard: string) => void = () => {};
  onState: (s: EarsState) => void = () => {};
  private stream: MediaStream | null = null;
  private nodes: AudioNode[] = [];
  private rec: VoskRecognizer | null = null;
  private web: SpeechRecognitionLike | null = null;
  private lastFire = { text: '', at: 0 };
  private stopped = false;

  constructor(private base: string) {}

  private set(s: EarsState) {
    this.state = s;
    this.onState(s);
  }

  private fire(text: string, final: boolean) {
    const intent = matchIntent(text);
    if (!intent) return;
    // A phrase shows up as a partial first and then as the final result: act once.
    const now = performance.now();
    if (this.lastFire.text === intent && now - this.lastFire.at < (final ? 2500 : 1500)) return;
    this.lastFire = { text: intent, at: now };
    this.onIntent(intent, text);
  }

  async start(ctx: AudioContext) {
    this.stopped = false;
    this.set('loading');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    } catch {
      return this.set('denied');
    }
    try {
      const model = await preloadEars(this.base);
      if (this.stopped) return;
      const rec = new model.KaldiRecognizer(ctx.sampleRate, JSON.stringify(GRAMMAR));
      this.rec = rec;
      rec.on('result', (m) => m.result.text && this.fire(m.result.text, true));
      // Partials make short commands feel instant instead of waiting out the end-of-speech silence.
      rec.on('partialresult', (m) => m.result.partial && this.fire(m.result.partial, false));
      const src = ctx.createMediaStreamSource(this.stream);
      const tap = ctx.createScriptProcessor(4096, 1, 1);
      tap.onaudioprocess = (e) => {
        try {
          rec.acceptWaveformFloat(e.inputBuffer.getChannelData(0), ctx.sampleRate);
        } catch {
          /* recogniser shutting down */
        }
      };
      const mute = ctx.createGain();
      mute.gain.value = 0;
      src.connect(tap).connect(mute).connect(ctx.destination);
      this.nodes = [src, tap, mute];
      this.set('listening');
    } catch (e) {
      console.warn('Offline speech model unavailable, trying browser speech recognition', e);
      this.startWebSpeech();
    }
  }

  private startWebSpeech() {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) return this.set('unavailable');
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = 'en-US';
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) this.fire(e.results[i][0].transcript, e.results[i].isFinal);
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') (this.stopped = true), this.set('unavailable');
    };
    r.onend = () => {
      if (!this.stopped) {
        try {
          r.start();
        } catch {
          /* already running */
        }
      }
    };
    try {
      r.start();
      this.web = r;
      this.set('listening');
    } catch {
      this.set('unavailable');
    }
  }

  stop() {
    this.stopped = true;
    this.web?.stop();
    this.web = null;
    for (const n of this.nodes) n.disconnect();
    this.nodes = [];
    this.rec?.remove();
    this.rec = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.set('off');
  }
}
