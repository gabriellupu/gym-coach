import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXERCISE_LIST } from '../src/domain/exercises';
import { buildPlan, available } from '../src/domain/planner';
import { defaultProfile } from '../src/domain/profile';
import { RepCounter } from '../src/motion/reps';
import { simulateBody } from '../src/motion/sim';

const noise = (i: number) => Math.sin(i * 12.9898) * 0.004;

test('every motion-tracked exercise counts clean reps and ignores fidgeting', () => {
  for (const e of EXERCISE_LIST) {
    if (e.detect.by !== 'motion') continue;
    let reps = 0;
    const c = new RepCounter(e.detect, () => reps++);
    const dt = 1 / 72;
    // 2 s settling with head jitter and a slow 3 cm drift, then 8 reps, then standing around.
    for (let i = 0; i < 144; i++) {
      const b = simulateBody(e, 0);
      b.head.y += noise(i) + i * 0.0002;
      c.update(dt, b);
    }
    assert.equal(reps, 0, `${e.id}: counted while idle`);
    const n = Math.round((8 * e.tempo) / dt);
    for (let i = 0; i < n; i++) {
      const b = simulateBody(e, (i * dt) / e.tempo);
      b.head.y += noise(i);
      c.update(dt, b);
    }
    for (let i = 0; i < 100; i++) c.update(dt, simulateBody(e, 0));
    assert.equal(reps, 8, `${e.id}: expected 8 reps, got ${reps}`);
  }
});

test('half reps are not counted', () => {
  const e = EXERCISE_LIST.find((x) => x.id === 'squat')!;
  let reps = 0;
  const c = new RepCounter(e.detect as never, () => reps++);
  for (let i = 0; i < 72 * 10; i++) {
    const b = simulateBody(e, 0);
    b.head.y -= 0.08 * (1 - Math.cos((i / 72 / 2.4) * Math.PI * 2)) / 2; // 8 cm dips
    c.update(1 / 72, b);
  }
  assert.equal(reps, 0);
});

test('plans fit the time budget, only use owned gear, and lead with the bench', () => {
  for (const goal of ['strength', 'lean', 'fit', 'mobility'] as const)
    for (const minutes of [15, 20, 30, 45])
      for (const level of [1, 2, 3] as const) {
        const p = { ...defaultProfile(), goal, minutes, level };
        const plan = buildPlan(p, new Date('2026-03-02'));
        assert.ok(plan.minutes <= minutes + 1, `${goal}/${minutes}: ${plan.minutes} min`);
        assert.ok(plan.steps.some((s) => s.role === 'main'));
        assert.equal(plan.steps[0].role, 'warmup');
        assert.equal(plan.steps.at(-1)!.role, 'cooldown');
      }
  const p = defaultProfile();
  p.gear.bench.owned = false;
  p.gear.pullup_bar.owned = false;
  const plan = buildPlan(p);
  for (const s of plan.steps) assert.ok(available(EXERCISE_LIST.find((e) => e.id === s.ex)!, p), s.ex);
});
