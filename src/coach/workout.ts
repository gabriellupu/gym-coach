import { ex } from '../domain/exercises';
import { kcal, stationOf } from '../domain/planner';
import { weekGoal, type Profile } from '../domain/profile';
import type { Exercise, GearId, Plan, SessionLog, Step } from '../domain/types';
import { HoldWatch, RepCounter, type RepEvent } from '../motion/reps';
import type { Intent } from './intents';
import { count as call, num, pick } from './lines';
import { End, Repeat, Script, Skip, type Co, type HudView, type Stage } from './script';

const WORK_BUTTONS: Intent[] = ['break', 'done', 'skip', 'stop'];
const fmtAmount = (e: Exercise, s: Step) => (e.kind === 'reps' ? `${s.sets} × ${s.amount}${e.perSide ? ' / side' : ''}` : `${s.sets > 1 ? `${s.sets} × ` : ''}${s.amount}s`);

/** One coached session, start to finish. */
export class Workout extends Script {
  readonly log: SessionLog = { date: new Date().toISOString(), minutes: 0, kcal: 0, reps: 0, sets: [], completed: false };
  private view: HudView = { mode: 'brief', title: '', buttons: [] };
  private at: GearId | null = null;
  private benchAngle: number | null = null;
  private lastRole = '';
  private cur: Step | null = null;
  private live: { left: () => number; unit: 'reps' | 'secs' } | null = null;
  private feel: -1 | 0 | 1 = 0;
  private stepIdx = 0;

  constructor(
    stage: Stage,
    private profile: Profile,
    private plan: Plan,
    private onSave: (p: Profile) => void,
  ) {
    super(stage);
  }

  private show(v: HudView) {
    this.view = v;
    this.stage.show(v);
  }

  private closing = false;

  /** The mapped station the trainee is working at right now. */
  get station(): GearId | null {
    return this.at;
  }

  /** Freeze the session while something else (a re-map) takes over the stage. */
  suspend() {
    this.paused = true;
  }
  unsuspend() {
    this.paused = false;
    this.stage.show(this.view);
  }

  onIntent(i: Intent) {
    if (this.finished || this.closing) return;
    if (this.paused) {
      if (i === 'ready') {
        this.paused = false;
        this.stage.say('resume', { mode: 'cut' });
        this.stage.show(this.view);
      } else if (i === 'stop') {
        this.paused = false;
        this.interrupt(new End());
      }
      return;
    }
    switch (i) {
      case 'break':
        this.paused = true;
        this.stage.say('break', { mode: 'cut' });
        this.stage.coach({ do: 'idle' });
        this.stage.show({ mode: 'paused', title: 'Paused', sub: 'Take your time.', hint: 'Say “I’m ready” to continue', buttons: this.stage.mappable() ? ['ready', 'map', 'stop'] : ['ready', 'stop'] });
        return;
      case 'skip':
        return this.interrupt(new Skip());
      case 'stop':
        return this.interrupt(new End());
      case 'repeat':
        return this.interrupt(new Repeat());
      case 'easier':
      case 'harder': {
        if (!this.cur) return;
        const e = ex(this.cur.ex);
        const k = i === 'easier' ? 0.8 : 1.2;
        const min = e.kind === 'reps' ? 3 : 10;
        const next = Math.max(min, Math.round(this.cur.amount * k) + (i === 'harder' && e.kind === 'reps' ? 1 : 0));
        this.cur.amount = next;
        this.feel = i === 'easier' ? -1 : 1;
        this.stage.say(i, { mode: 'cut' });
        return;
      }
      case 'status':
        if (this.live) this.stage.say([num(Math.max(1, Math.ceil(this.live.left()))), this.live.unit === 'reps' ? 'togo' : 'secsleft'], { mode: 'cut' });
        return;
      default:
        this.flags[i] = true;
    }
  }

  protected *run(): Co {
    const steps = this.plan.steps;
    try {
      yield* this.intro();
      for (this.stepIdx = 0; this.stepIdx < steps.length; this.stepIdx++) {
        const step = steps[this.stepIdx];
        try {
          yield* this.doStep(step);
        } catch (e) {
          if (!(e instanceof Skip)) throw e;
          this.live = null;
          this.stage.say('skip', { mode: 'cut' });
        }
      }
      this.log.completed = true;
    } catch (e) {
      if (!(e instanceof End)) throw e;
      this.stage.hush();
    }
    yield* this.outro();
  }

  private *intro(): Co {
    const first = this.profile.history.length === 0;
    this.stage.coach({ do: 'wave' });
    this.show({
      mode: 'brief',
      title: this.plan.title,
      sub: `${this.plan.steps.length} moves · about ${this.plan.minutes} min`,
      stats: this.plan.steps.filter((s) => s.role === 'main').slice(0, 6).map((s) => ({ label: ex(s.ex).name, value: fmtAmount(ex(s.ex), s) })),
      buttons: ['skip', 'stop'],
    });
    try {
      yield* this.speak(first ? 'intro' : pick('hello'));
      yield* this.speak(['today', 'about', num(this.plan.minutes), 'minutes']);
      if (this.stage.tracked()) {
        // Standing height scales every range-of-motion threshold to this person.
        yield* this.speak('standtall');
        const ys: number[] = [];
        const end = this.t + 1.2;
        while (this.t < end) ys.push(this.stage.body().head.y), yield;
        const h = ys.sort((a, b) => a - b)[ys.length >> 1];
        if (h > 1.1 && h < 2.2) this.stage.calibrate(h);
        yield* this.speak('gotit');
      }
    } catch (e) {
      if (!(e instanceof Skip) && !(e instanceof Repeat)) throw e; // "skip" here just skips the talking
    }
  }

  private base(e: Exercise, step: Step, mode: HudView['mode']): HudView {
    const nextStep = this.plan.steps[this.stepIdx + 1];
    return {
      mode,
      title: e.name,
      ex: e.id,
      sub: fmtAmount(e, step) + (step.loadKg ? ` · ${step.loadKg} kg` : ''),
      step: [this.stepIdx + 1, this.plan.steps.length],
      next: nextStep ? ex(nextStep.ex).name : 'Finish',
      buttons: WORK_BUTTONS,
    };
  }

  private *doStep(step: Step): Co {
    const e = ex(step.ex);
    this.cur = step;
    this.feel = 0;
    if (step.role !== this.lastRole) {
      this.lastRole = step.role;
      yield* this.speak(step.role === 'warmup' ? 'warmup' : step.role === 'main' ? 'mainblock' : 'cooldown');
    }
    yield* this.travel(e, step);

    // What, how much, with what.
    this.stage.coach({ do: 'demo', ex: e.id });
    this.show({ ...this.base(e, step, 'demo'), hint: e.bench !== undefined ? `Backrest: ${e.bench === 0 ? 'flat' : e.bench + '°'}` : undefined });
    const say: string[] = [this.stepIdx === 0 ? 'first' : 'next', `x-${e.id}`];
    if (step.role === 'main') say.push(`sets${Math.min(4, step.sets)}`, num(step.amount), e.kind !== 'reps' ? 'usecs' : e.perSide ? 'urepsside' : 'ureps');
    yield* this.speak(say);
    if (e.bench !== undefined && e.bench !== this.benchAngle) {
      this.benchAngle = e.bench;
      yield* this.speak(`bench${e.bench}`);
    }
    if (e.gear.includes('dumbbells')) yield* this.speak(step.loadKg && Number.isInteger(step.loadKg) ? ['grab', num(step.loadKg), 'kilo'] : 'grabany');

    const known = (this.profile.records[e.id]?.times ?? 0) >= 2;
    let explain = !known || step.role !== 'main';
    for (let set = 1; set <= step.sets; ) {
      try {
        if (set === 1 || explain) {
          yield* this.demo(e, step, explain);
          explain = false;
          if (step.role === 'main') yield* this.waitReady(e, step);
          else yield* this.speak('herewego');
        } else yield* this.speak(set === step.sets ? 'lastset' : `set${Math.min(4, set)}`);
        yield* this.countdown(e, step, set);
        const done = yield* this.work(e, step, set);
        this.live = null;
        this.log.sets.push({ ex: e.id, amount: done, loadKg: step.loadKg });
        if (done < step.amount * 0.7) this.feel = -1;
        this.stage.beep('done');
        this.stage.coach({ do: 'cheer' });
        if (set < step.sets) yield* this.rest(step.rest, `Set ${set + 1} of ${step.sets}`, e, step);
        set++;
      } catch (err) {
        if (!(err instanceof Repeat)) throw err;
        this.live = null;
        this.stage.say('repeat', { mode: 'cut' });
        explain = true;
      }
    }
    const rec = this.profile.records[e.id];
    this.profile.records[e.id] = { amount: step.amount, loadKg: step.loadKg, feel: this.feel, times: (rec?.times ?? 0) + 1 };
    this.cur = null;
    const next = this.plan.steps[this.stepIdx + 1];
    if (next && step.role === 'main') {
      try {
        yield* this.rest(Math.round(step.rest * 0.6), '', e, step, next);
      } catch (err) {
        if (!(err instanceof Repeat)) throw err;
      }
    }
  }

  /** Walk the trainee to the mapped station this move happens at. */
  private *travel(e: Exercise, step: Step): Co {
    const station = stationOf(e);
    if (!station) {
      if (this.stepIdx === 0) yield* this.speak('space');
      return;
    }
    if (station === this.at) return;
    this.at = station;
    const d = this.stage.distanceTo(station);
    if (d === null || d < 1.6) return;
    this.stage.guide(station);
    this.stage.coach({ do: 'beckon', gear: station });
    this.show({ ...this.base(e, step, 'goto'), title: `Go to ${station === 'pullup_bar' ? 'the pull-up bar' : `the ${station}`}`, sub: `Next: ${e.name}`, hint: 'Follow the path on the floor', buttons: ['ready', 'skip', 'stop'] });
    this.flags.ready = false;
    yield* this.speak(`goto-${station}`);
    const there = () => (this.stage.distanceTo(station) ?? 0) < 1.5 || this.take('ready');
    for (let nudges = 0; nudges < 3; nudges++) {
      if (yield* this.until(there, 20)) break;
      this.stage.say('gotonudge');
    }
    this.stage.guide(null);
    this.stage.say(pick('arrived'));
  }

  private *demo(e: Exercise, step: Step, explain: boolean): Co {
    this.stage.coach({ do: 'demo', ex: e.id });
    this.show({ ...this.base(e, step, 'demo'), hint: 'Watch the demo' });
    const t0 = this.t;
    yield* this.speak(explain ? `how-${e.id}` : 'watch');
    // Always show at least two full reps.
    yield* this.sleep(Math.max(0, Math.min(8, e.tempo * 2) - (this.t - t0)));
  }

  private *waitReady(e: Exercise, step: Step): Co {
    this.flags.ready = false;
    this.show({ ...this.base(e, step, 'ready'), big: 'Ready?', hint: 'Say “I’m ready”', buttons: ['ready', 'repeat', 'skip', 'stop'] });
    yield* this.speak(pick('yourturn'));
    for (let wait = 22; ; wait = 40) {
      if (yield* this.until(() => this.take('ready'), wait)) return;
      this.stage.say(pick('readynudge'));
    }
  }

  private *countdown(e: Exercise, step: Step, set: number): Co {
    this.stage.coach(this.userOwnsStation(e) ? { do: 'spot', ex: e.id } : { do: 'demo', ex: e.id });
    for (const n of [3, 2, 1]) {
      this.show({ ...this.base(e, step, 'countdown'), big: String(n), set: [set, step.sets] });
      this.stage.beep('tick');
      this.stage.say(call(n), { mode: 'cut' });
      yield* this.sleep(0.85);
    }
    this.stage.beep('go');
    this.stage.say('go', { mode: 'cut' });
  }

  /** On the bench or bar the coach steps aside and spots; otherwise he trains alongside. */
  private userOwnsStation(e: Exercise) {
    return e.gear.includes('bench') || e.gear.includes('pullup_bar');
  }

  private *work(e: Exercise, step: Step, set: number): Co<number> {
    const t0 = this.t;
    let done: number;
    if (e.kind === 'reps') {
      done = yield* this.reps(e, step, set, e.perSide ? 'Left side' : undefined);
      if (e.perSide) {
        this.stage.say('switchsides', { mode: 'cut' });
        this.show({ ...this.base(e, step, 'work'), big: '↔', unit: 'switch sides', set: [set, step.sets] });
        yield* this.sleep(3.5);
        done = Math.min(done, yield* this.reps(e, step, set, 'Right side'));
      }
      this.stage.say(pick('setdone'), { mode: 'cut' });
    } else {
      done = yield* this.clock(e, step, set);
      this.stage.say('time', { mode: 'cut' });
    }
    this.log.kcal += kcal(e.met, this.profile.weightKg, this.t - t0);
    return done;
  }

  private *reps(e: Exercise, step: Step, set: number, side?: string): Co<number> {
    let count = 0;
    let lastRepAt = this.t;
    let shallow = 0;
    let rushed = 0;
    const said = { range: false, slow: false, tip: false, push: false, stalled: false };
    const onRep = (r: RepEvent) => {
      count = r.n;
      lastRepAt = this.t;
      said.push = said.stalled = false;
      this.log.reps++;
      this.stage.beep('rep');
      const left = step.amount - count;
      shallow = r.quality < 0.72 ? shallow + 1 : 0;
      rushed = r.period < e.tempo * 0.45 ? rushed + 1 : 0;
      if (left === 0) return;
      if (left === 3 && step.amount >= 6) this.stage.say('more3', { mode: 'cut' });
      else if (left === 1) this.stage.say('last1', { mode: 'cut' });
      else if (shallow >= 2 && !said.range) (said.range = true), this.stage.say('range', { mode: 'cut' });
      else if (rushed >= 2 && !said.slow) (said.slow = true), this.stage.say('slow', { mode: 'cut' });
      else if (count === Math.ceil(step.amount / 2) && step.amount >= 8) this.stage.say([call(count), set > 1 ? pick('push') : pick('praise')], { mode: 'cut' });
      else if (!said.tip && count === 2 + ((set + this.stepIdx) % 2) && step.amount >= 6) (said.tip = true), this.stage.say([call(count), `tip-${e.id}-${((set + this.stepIdx) % e.tips.length) + 1}`], { mode: 'cut' });
      else this.stage.say(call(count), { mode: 'ifFree' });
    };
    // Without tracking (screen-and-audio mode) every set is paced by the coach's count.
    let counter = e.detect.by === 'motion' && this.stage.tracked() ? new RepCounter(e.detect, onRep) : null;
    let nextBeat = this.t + e.tempo;
    if (!counter) this.stage.say('followme');
    this.live = { left: () => step.amount - count, unit: 'reps' };
    this.flags.done = false;

    while (count < step.amount) {
      if (this.take('done')) {
        this.stage.say('doneearly', { mode: 'cut' });
        break;
      }
      if (counter) {
        counter.update(this.dt, this.stage.body());
        if (counter.blindFor > 2.5) {
          // Hands hidden (wrapped round a dumbbell, out of view): pace the set instead.
          counter = null;
          nextBeat = this.t + e.tempo + this.stage.say('blind', { mode: 'cut' });
        } else {
          const idle = this.t - lastRepAt;
          if (idle > Math.max(7, e.tempo * 3) && !said.push) (said.push = true), this.stage.say(pick('push'));
          if (idle > 22 && !said.stalled) (said.stalled = true), this.stage.say('stalled');
          if (idle > 42) break;
        }
      } else if (this.t >= nextBeat) {
        nextBeat += e.tempo;
        onRep({ n: count + 1, quality: 1, period: e.tempo });
      }
      this.show({
        ...this.base(e, step, 'work'),
        big: String(count),
        unit: `of ${step.amount}`,
        progress: count / step.amount,
        depth: counter?.depth,
        set: [set, step.sets],
        hint: side ?? (counter ? undefined : 'Follow the count'),
      });
      yield;
    }
    this.show({ ...this.base(e, step, 'work'), big: String(count), unit: `of ${step.amount}`, progress: count / step.amount, set: [set, step.sets] });
    return count;
  }

  private *clock(e: Exercise, step: Step, set: number): Co<number> {
    const tracked = this.stage.tracked();
    const watch = tracked && e.kind === 'hold' && e.hold ? new HoldWatch(e.hold) : null;
    let moves = 0;
    const counter = tracked && e.detect.by === 'motion' ? new RepCounter(e.detect, () => (moves++, this.log.reps++)) : null;
    let elapsed = 0;
    let lastWhole = -1;
    let wasIn = true;
    let grace = 3; // seconds to get into position before the clock is strict
    const said = { half: false, ten: false, tip: false };
    this.live = { left: () => step.amount - elapsed, unit: 'secs' };
    this.flags.done = false;
    while (elapsed < step.amount) {
      if (this.take('done')) {
        this.stage.say('doneearly', { mode: 'cut' });
        break;
      }
      const body = this.stage.body();
      counter?.update(this.dt, body);
      grace -= this.dt;
      const inPose = !watch || watch.update(this.dt, body) || grace > 0;
      if (inPose) elapsed += this.dt;
      if (inPose !== wasIn) {
        wasIn = inPose;
        this.stage.beep(inPose ? 'tick' : 'warn');
        this.stage.say(inPose ? 'holdresume' : 'holdbreak', { mode: 'cut' });
      }
      const left = step.amount - elapsed;
      const whole = Math.ceil(left);
      if (whole !== lastWhole) {
        lastWhole = whole;
        if (whole <= 5 && whole >= 1) this.stage.say(call(whole), { mode: 'cut' }), this.stage.beep('tick');
        else if (whole === 10 && step.amount >= 25 && !said.ten) (said.ten = true), this.stage.say('t10', { mode: 'cut' });
        else if (!said.half && elapsed >= step.amount / 2 && step.amount >= 20) (said.half = true), this.stage.say(['thalf', pick('push')]);
        else if (!said.tip && elapsed > 5 && step.amount >= 20) (said.tip = true), this.stage.say(`tip-${e.id}-${(set % e.tips.length) + 1}`, { mode: 'ifFree' });
      }
      this.show({
        ...this.base(e, step, 'work'),
        big: String(Math.max(0, whole)),
        unit: inPose ? 'seconds' : 'paused — get back in position',
        progress: elapsed / step.amount,
        set: step.sets > 1 ? [set, step.sets] : undefined,
        hint: counter && moves ? `${moves} reps` : undefined,
      });
      yield;
    }
    return Math.round(elapsed);
  }

  /** Rest between sets, or (given `next`) between exercises with a preview of what is coming. */
  private *rest(seconds: number, label: string, e: Exercise, step: Step, next?: Step): Co {
    if (seconds < 3) return;
    const ne = next ? ex(next.ex) : null;
    this.stage.coach({ do: 'idle' });
    this.flags.ready = false;
    if (seconds >= 20) this.stage.say(['rest', num(seconds), 'usecs']);
    if (ne && seconds >= 12) this.stage.say(['comingup', `x-${ne.id}`]);
    let said10 = false;
    let tip = seconds >= 40;
    const end = this.t + seconds;
    while (this.t < end) {
      const left = end - this.t;
      if (this.take('ready')) {
        this.stage.say('restskip', { mode: 'cut' });
        break;
      }
      if (left <= 10 && !said10 && seconds >= 25) (said10 = true), this.stage.say('rest10');
      if (tip && left < seconds - 12) (tip = false), this.stage.say(pick('resttip'), { mode: 'ifFree' });
      // Between exercises the board already loops the next move, so it is familiar before it starts.
      const preview = ne && next ? { ex: ne.id, sub: `Coming up: ${ne.name} · ${fmtAmount(ne, next)}`, demoLabel: `Coming up: ${ne.name}` } : { sub: label };
      this.show({ ...this.base(e, step, 'rest'), title: 'Rest', ...preview, big: String(Math.ceil(left)), unit: 'seconds', progress: 1 - left / seconds, hint: 'Say “I’m ready” to skip the rest', buttons: ['ready', 'break', 'skip', 'stop'] });
      yield;
    }
  }

  private *outro(): Co {
    this.closing = true;
    const p = this.profile;
    this.log.minutes = Math.max(1, Math.round(this.t / 60));
    this.log.kcal = Math.round(this.log.kcal);
    if (this.log.sets.length) p.history.push(this.log);
    this.onSave(p);
    const goal = weekGoal(p);
    this.stage.guide(null);
    this.stage.coach({ do: 'cheer' });
    if (this.log.completed) this.stage.celebrate(), this.stage.beep('done');
    this.show({
      mode: 'summary',
      title: this.log.completed ? 'Session complete' : 'Session ended',
      sub: goal.message,
      stats: [
        { label: 'Time', value: `${this.log.minutes} min` },
        { label: 'Reps', value: String(this.log.reps) },
        { label: 'Sets', value: String(this.log.sets.length) },
        { label: 'Energy', value: `${this.log.kcal} kcal` },
        { label: 'This week', value: `${goal.sessionsDone} / ${goal.sessions}` },
      ],
      buttons: [],
    });
    yield* this.speak(this.log.completed ? pick('finish') : 'endearly', { mode: 'cut' });
    if (this.log.sets.length) yield* this.speak(goal.sessionsDone >= goal.sessions ? 'goalhit' : 'goalleft');
    yield* this.sleep(1.5);
  }
}
