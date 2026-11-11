import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchIntent } from '../src/coach/intents';
import { LINES, lineText } from '../src/coach/lines';
import { Mapping } from '../src/coach/mapping';
import type { CoachCmd, HudView, Stage } from '../src/coach/script';
import { Workout } from '../src/coach/workout';
import { ex } from '../src/domain/exercises';
import { buildPlan } from '../src/domain/planner';
import { defaultProfile } from '../src/domain/profile';
import type { GearId, Placement } from '../src/domain/types';
import { simulateBody } from '../src/motion/sim';

/** A world with a trainee who does exactly what the board says. */
class FakeStage implements Stage {
  view: HudView = { mode: 'brief', title: '', buttons: [] };
  said: string[] = [];
  cmds: CoachCmd[] = [];
  placed: Partial<Record<GearId, Placement | null>> = {};
  t = 0;
  hand = { x: 0, y: 1, z: 0 };
  say(ids: string | string[]) {
    for (const id of [ids].flat()) {
      assert.ok(id.startsWith('~') || LINES[id], `no line for "${id}"`);
      this.said.push(id);
    }
    return 0.4 * [ids].flat().length;
  }
  hush() {}
  beep() {}
  body() {
    const e = this.view.ex ? ex(this.view.ex) : null;
    if (!e || this.view.mode !== 'work') return simulateBody(ex('squat'), 0);
    return simulateBody(e, this.t / e.tempo);
  }
  show(v: HudView) { this.view = v; }
  coach(c: CoachCmd) { this.cmds.push(c); }
  distanceTo() { return null; }
  guide() {}
  celebrate() {}
  pointer() { return this.hand; }
  place(g: GearId, p: Placement | null) { this.placed[g] = p; }
  calibrate() {}
}

test('a full session runs start to finish, counts reps and records progress', () => {
  for (const goal of ['strength', 'lean', 'mobility'] as const) {
    const profile = { ...defaultProfile(), goal, minutes: 20 };
    const plan = buildPlan(profile, new Date('2026-03-02'));
    const stage = new FakeStage();
    let saved = false;
    const w = new Workout(stage, profile, plan, () => (saved = true));
    w.start();
    const dt = 1 / 30;
    for (let i = 0; !w.finished; i++) {
      assert.ok(i < 30 * 60 * 60, 'session never finished');
      stage.t += dt;
      if (stage.view.mode === 'ready' && i % 30 === 0) w.onIntent('ready');
      w.update(dt);
    }
    assert.ok(saved && w.log.completed);
    assert.equal(profile.history.length, 1);
    const sets = plan.steps.reduce((s, x) => s + x.sets, 0);
    assert.equal(w.log.sets.length, sets);
    for (const s of plan.steps) {
      const got = w.log.sets.filter((x) => x.ex === s.ex);
      for (const g of got) assert.equal(g.amount, s.amount, `${s.ex}: did ${g.amount} of ${s.amount}`);
      assert.ok(profile.records[s.ex].times === 1);
    }
    assert.ok(w.log.minutes <= 22, `${goal}: took ${w.log.minutes} min for a 20 min plan`);
    assert.equal(stage.view.mode, 'summary');
  }
});

test('break pauses the clock, skip moves on, end workout wraps up', () => {
  const profile = defaultProfile();
  const stage = new FakeStage();
  const w = new Workout(stage, profile, buildPlan(profile), () => {});
  w.start();
  const run = (s: number) => { for (let i = 0; i < s * 30 && !w.finished; i++) (stage.t += 1 / 30), w.update(1 / 30); };
  run(40);
  w.onIntent('break');
  assert.equal(stage.view.mode, 'paused');
  const before = JSON.stringify(w.log);
  run(60);
  assert.equal(JSON.stringify(w.log), before);
  w.onIntent('ready');
  run(1);
  assert.notEqual(stage.view.mode, 'paused');
  const title = stage.view.title;
  w.onIntent('skip');
  run(15);
  assert.ok(stage.said.includes('skip'));
  assert.notEqual(stage.view.title, title);
  w.onIntent('stop');
  run(20);
  assert.ok(w.finished && !w.log.completed);
});

test('mapping pins two points per item and rejects implausible ones', () => {
  const stage = new FakeStage();
  const m = new Mapping(stage, ['bench', 'dumbbells']);
  m.start();
  const run = (s: number) => { for (let i = 0; i < s * 30; i++) m.update(1 / 30); };
  run(5);
  m.onPoint({ x: 0, y: 0.45, z: 0 });
  run(2);
  m.onPoint({ x: 0.1, y: 0.45, z: 0 }); // 10 cm bench: no
  run(4);
  assert.equal(stage.placed.bench, undefined);
  m.onPoint({ x: 0, y: 0.45, z: 0 });
  m.onPoint({ x: 0, y: 0.45, z: 0 }); // a double pinch must not become the second point
  run(2);
  m.onPoint({ x: 0, y: 0.45, z: 1.2 });
  run(3);
  assert.deepEqual(stage.placed.bench, { a: [0, 0.45, 0], b: [0, 0.45, 1.2] });
  run(1);
  m.onIntent('place'); // "here" uses the hand
  run(8);
  assert.ok(stage.placed.dumbbells && m.finished);
});

test('spoken phrases map to intents', () => {
  const cases: [string, string | null][] = [
    ["I'm ready", 'ready'], ['i need a break', 'break'], ['Okay coach, give me a minute please', 'break'], ['skip this one', 'skip'],
    ['end workout', 'stop'], ['show me again', 'repeat'], ['that is too easy', 'harder'], ['how many left', 'status'],
    ['map my gym', 'map'], ['start workout', 'start'], ['right here', 'place'], ["i'm done", 'done'], ['the weather is nice', null],
  ];
  for (const [text, want] of cases) assert.equal(matchIntent(text), want, text);
  assert.ok(lineText('how-bench_press').length > 20);
});
