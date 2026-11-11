import type { Detect, HoldCheck } from '../domain/types';
import { readSignal, type BodyState } from './body';

export interface RepEvent {
  n: number;
  /** Range of motion of this rep relative to the best rep so far (0..1+). */
  quality: number;
  /** Seconds this rep took. */
  period: number;
}

/**
 * Counts reps from one body signal: a rep is an excursion away from the rest
 * position by at least `amp`, and most of the way back. The rest position is
 * re-learned whenever the trainee is still, so drift and shuffling don't count.
 */
export class RepCounter {
  count = 0;
  /** 0 at rest .. 1 at the target depth; drives the live range gauge. */
  depth = 0;
  /** Seconds since the signal's tracking was last valid. */
  blindFor = 0;
  private base: number | null = null;
  private smooth: number | null = null;
  private out = false;
  private peak = 0;
  private best = 0;
  private tOut = 0;
  private tLast = 0;
  private t = 0;
  private still = 0;

  constructor(
    private spec: Extract<Detect, { by: 'motion' }>,
    private onRep: (e: RepEvent) => void,
  ) {}

  update(dt: number, body: BodyState) {
    this.t += dt;
    const raw = readSignal(this.spec.signal, body);
    if (raw === null) {
      this.blindFor += dt;
      return;
    }
    this.blindFor = 0;
    const k = 1 - Math.exp(-dt * 18);
    const prev = this.smooth ?? raw;
    this.smooth = prev + (raw - prev) * k;
    if (this.base === null) this.base = this.smooth;
    const { dir, amp } = this.spec;
    const e = dir * (this.smooth - this.base);
    this.depth = Math.max(0, Math.min(1.3, e / (Math.max(amp, this.best * 0.85) || amp)));

    if (!this.out) {
      // Resting: follow slow drift; also follow fast if they've settled somewhere new.
      const speed = Math.abs(this.smooth - prev) / Math.max(dt, 1e-3);
      this.still = speed < amp * 0.25 ? this.still + dt : 0;
      const rate = e < 0 ? 6 : this.still > 1.2 && e < amp * 0.6 ? 2 : 0.15;
      this.base += (this.smooth - this.base) * (1 - Math.exp(-dt * rate));
      if (e > amp * 0.6) {
        this.out = true;
        this.peak = e;
        this.tOut = this.t;
      }
      return;
    }
    this.peak = Math.max(this.peak, e);
    const back = e < Math.max(this.peak * 0.35, amp * 0.2);
    if (back) {
      this.out = false;
      this.still = 0;
      if (this.peak >= amp && this.t - this.tOut > 0.25) {
        this.count++;
        this.best = Math.max(this.best, this.peak);
        const period = this.tLast ? this.t - this.tLast : this.t - this.tOut;
        this.tLast = this.t;
        this.onRep({ n: this.count, quality: this.peak / this.best, period });
      }
    } else if (this.t - this.tOut > 12) {
      // Parked at the far end (e.g. sat down): that's the new rest position.
      this.out = false;
      this.base = this.smooth;
    }
  }
}

/** Runs a clock only while the trainee is actually in position. */
export class HoldWatch {
  inPose = true;
  private off = 0;
  constructor(private check: HoldCheck) {}

  update(dt: number, body: BodyState): boolean {
    const v = readSignal(this.check.signal, body);
    // Unknown (tracking lost) counts as holding: never punish for what we can't see.
    const ok = v === null || (v >= this.check.min && v <= this.check.max);
    this.off = ok ? 0 : this.off + dt;
    this.inPose = this.off < 0.8;
    return this.inPose;
  }
}
