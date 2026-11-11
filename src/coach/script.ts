import type { GearId, Placement } from '../domain/types';
import type { BodyState, V3 } from '../motion/body';
import type { Intent } from './intents';
import type { SayMode } from './voice';

/** Everything the board shows. Scripts push a fresh one whenever something changes. */
export interface HudView {
  mode: 'hub' | 'brief' | 'goto' | 'demo' | 'ready' | 'countdown' | 'work' | 'rest' | 'paused' | 'summary' | 'mapping';
  title: string;
  sub?: string;
  /** The big figure (reps, seconds, countdown). */
  big?: string;
  unit?: string;
  /** 0..1 ring around the big figure. */
  progress?: number;
  /** 0..1 live range-of-motion gauge. */
  depth?: number;
  set?: [number, number];
  step?: [number, number];
  next?: string;
  hint?: string;
  /** Exercise the on-board demo should loop. */
  ex?: string;
  stats?: { label: string; value: string }[];
  /** Buttons to show, in order. */
  buttons: Intent[];
}

export type CoachCmd =
  | { do: 'idle' }
  | { do: 'wave' }
  | { do: 'cheer' }
  /** Demonstrate at the exercise's station (on the real bench, under the real bar…). */
  | { do: 'demo'; ex: string; speed?: number }
  /** Stand beside the station and watch the trainee work. */
  | { do: 'spot'; ex: string }
  /** Stand at a station and call the trainee over. */
  | { do: 'beckon'; gear: GearId };

/** What a script needs from the world: the XR studio in the headset, a fake in tests. */
export interface Stage {
  say(ids: string | string[], opts?: { mode?: SayMode; caption?: string }): number;
  hush(): void;
  beep(kind: 'tick' | 'go' | 'rep' | 'done' | 'warn' | 'place'): void;
  body(): BodyState;
  show(view: HudView): void;
  coach(cmd: CoachCmd): void;
  /** Trainee's distance to a mapped station (m), or null if it isn't mapped. */
  distanceTo(gear: GearId): number | null;
  /** Light the way to a station (null clears). */
  guide(gear: GearId | null): void;
  celebrate(): void;
  /** Where the trainee is pointing/touching right now, for "here". */
  pointer(): V3 | null;
  place(gear: GearId, p: Placement | null): void;
  calibrate(standH: number): void;
}

export class Skip extends Error {}
export class End extends Error {}
export class Repeat extends Error {}

type Co<T = void> = Generator<void, T, void>;

/**
 * Sessions are written as coroutines: straight-line "say this, wait for that"
 * code that yields once per frame. Voice intents either set flags the script
 * polls, or are thrown into it (skip, end, repeat) at the next frame.
 */
export abstract class Script {
  finished = false;
  paused = false;
  /** Script time in seconds; stands still while paused. */
  protected t = 0;
  protected dt = 0;
  protected flags: Partial<Record<Intent, boolean>> = {};
  private it: Co | null = null;
  private inject: Error | null = null;

  constructor(protected stage: Stage) {}

  start() {
    this.it = this.run();
  }

  update(dt: number) {
    if (this.finished || !this.it || this.paused) return;
    this.dt = dt;
    this.t += dt;
    const err = this.inject;
    this.inject = null;
    try {
      const r = err ? this.it.throw(err) : this.it.next();
      if (r.done) this.finished = true;
    } catch (e) {
      // A control signal nobody was waiting for (e.g. "skip" during the goodbye): just wrap up.
      if (!(e instanceof Skip || e instanceof End || e instanceof Repeat)) throw e;
      this.finished = true;
    }
  }

  /** Throw a control signal into the script at its next frame. */
  protected interrupt(e: Error) {
    this.inject = e;
  }

  protected *sleep(seconds: number): Co {
    const end = this.t + seconds;
    while (this.t < end) yield;
  }

  /** Wait for a condition; returns false if it timed out first. */
  protected *until(pred: () => boolean, timeout = Infinity): Co<boolean> {
    const end = this.t + timeout;
    while (!pred()) {
      if (this.t >= end) return false;
      yield;
    }
    return true;
  }

  /** Say something and wait until it has been said. */
  protected *speak(ids: string | string[], opts?: { mode?: SayMode; caption?: string }): Co {
    yield* this.sleep(this.stage.say(ids, opts) + 0.15);
  }

  /** Clear and return a flag set by a voice intent. */
  protected take(i: Intent): boolean {
    const v = !!this.flags[i];
    this.flags[i] = false;
    return v;
  }

  abstract onIntent(i: Intent): void;
  /** A pinch / trigger pull in open space (not on a button). */
  onPoint(_p: V3): void {}
  protected abstract run(): Co;
}
export type { Co };
