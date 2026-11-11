import type { Detect, Exercise, GearId, Signal } from './types';

const motion = (signal: Signal, dir: 1 | -1, amp: number): Detect => ({ by: 'motion', signal, dir, amp });
const tempo: Detect = { by: 'tempo' };
const B: GearId = 'bench';
const D: GearId = 'dumbbells';
const M: GearId = 'mat';
const P: GearId = 'pullup_bar';

/**
 * The V1 library: bench, dumbbells, mat, pull-up bar and bodyweight.
 * `how` and `tips` are spoken, so they are written for the ear.
 */
const LIST: Exercise[] = [
  // ───────────── Bench + dumbbells ─────────────
  {
    id: 'bench_press', name: 'Dumbbell bench press', gear: [B, D], bench: 0, kind: 'reps', group: 'push', role: 'main', level: 1, posture: 'supine',
    tempo: 3, dose: [8, 10, 12], detect: motion('handsY', 1, 0.11), load: 'heavy', met: 5,
    how: 'Lie back on the bench, feet planted, dumbbells over your chest. Lower them to chest level with elbows at forty five degrees, then press straight up.',
    tips: ['Shoulder blades pinned back.', 'Feet stay planted.', 'Control the way down.'],
  },
  {
    id: 'incline_press', name: 'Incline dumbbell press', gear: [B, D], bench: 45, kind: 'reps', group: 'push', role: 'main', level: 2, posture: 'supine',
    tempo: 3, dose: [8, 10, 12], detect: motion('handsY', 1, 0.11), load: 'medium', met: 5,
    how: 'Sit back against the incline with the dumbbells at your shoulders. Press up and slightly back until your arms are straight, then lower under control.',
    tips: ['Chest up.', 'Do not let the elbows flare.', 'Full lockout at the top.'],
  },
  {
    id: 'db_fly', name: 'Dumbbell fly', gear: [B, D], bench: 0, kind: 'reps', group: 'push', role: 'main', level: 2, posture: 'supine',
    tempo: 3.5, dose: [8, 10, 12], detect: motion('handsSpread', 1, 0.3), load: 'light', met: 4,
    how: 'Lie back with the dumbbells above your chest, palms facing each other. Open your arms wide with a soft bend in the elbows, then squeeze them back together.',
    tips: ['Soft elbows.', 'Feel the stretch across the chest.', 'Squeeze at the top.'],
  },
  {
    id: 'seated_press', name: 'Seated shoulder press', gear: [B, D], bench: 80, kind: 'reps', group: 'push', role: 'main', level: 1, posture: 'seated',
    tempo: 3, dose: [8, 10, 12], detect: motion('handsY', 1, 0.13), load: 'medium', met: 4.5,
    how: 'Sit tall against the upright backrest, dumbbells at ear height, elbows under your wrists. Press overhead until your arms are straight, then lower to your ears.',
    tips: ['Ribs down, do not arch.', 'Press straight up.', 'Lower all the way to the ears.'],
  },
  {
    id: 'one_arm_row', name: 'One arm dumbbell row', gear: [B, D], bench: 0, kind: 'reps', group: 'pull', role: 'main', level: 1, posture: 'prone', perSide: true,
    tempo: 2.6, dose: [8, 10, 12], detect: motion('handHiY', 1, 0.07), load: 'heavy', met: 4.5,
    how: 'Put one knee and the same hand on the bench, back flat like a table. Pull the dumbbell to your hip, elbow close, then lower it all the way.',
    tips: ['Back flat.', 'Pull to the hip, not the shoulder.', 'No twisting.'],
  },
  {
    id: 'skull_crusher', name: 'Lying triceps extension', gear: [B, D], bench: 0, kind: 'reps', group: 'push', role: 'main', level: 2, posture: 'supine',
    tempo: 3, dose: [8, 10, 12], detect: motion('handsY', -1, 0.1), load: 'light', met: 3.5,
    how: 'Lie back with the dumbbells straight above your shoulders. Keep your upper arms still and bend the elbows to lower the weights beside your head, then extend.',
    tips: ['Elbows point at the ceiling.', 'Only the forearms move.', 'Squeeze the triceps.'],
  },
  {
    id: 'pullover', name: 'Dumbbell pullover', gear: [B, D], bench: 0, kind: 'reps', group: 'pull', role: 'main', level: 2, posture: 'supine',
    tempo: 3.5, dose: [8, 10, 12], detect: motion('handsY', -1, 0.13), load: 'medium', met: 4,
    how: 'Lie back holding one dumbbell with both hands above your chest. With a slight bend in the elbows, lower it in an arc behind your head, then pull it back over your chest.',
    tips: ['Ribs down.', 'Long arms, soft elbows.', 'Feel the lats stretch.'],
  },
  {
    id: 'incline_curl', name: 'Incline dumbbell curl', gear: [B, D], bench: 45, kind: 'reps', group: 'pull', role: 'main', level: 2, posture: 'seated',
    tempo: 3, dose: [8, 10, 12], detect: motion('handsY', 1, 0.12), load: 'light', met: 3.5,
    how: 'Lean back on the incline and let your arms hang straight down. Curl both dumbbells up without moving your elbows forward, then lower all the way.',
    tips: ['Elbows stay back.', 'All the way down.', 'No swinging.'],
  },
  {
    id: 'split_squat', name: 'Bulgarian split squat', gear: [B], bench: 0, kind: 'reps', group: 'legs', role: 'main', level: 2, posture: 'stand', perSide: true,
    tempo: 3, dose: [6, 8, 10], detect: motion('headY', -1, 0.09), met: 6,
    how: 'Stand a big step in front of the bench and rest your back foot on it. Drop straight down until your front thigh is level, then drive up through the front heel.',
    tips: ['Front knee tracks over the toes.', 'Chest tall.', 'Drive through the heel.'],
  },
  {
    id: 'hip_thrust', name: 'Hip thrust', gear: [B], bench: 0, kind: 'reps', group: 'legs', role: 'main', level: 1, posture: 'supine',
    tempo: 2.8, dose: [10, 12, 15], detect: tempo, met: 4,
    how: 'Sit on the floor with your shoulder blades against the edge of the bench, feet flat. Drive your hips up until your body is level, squeeze, and lower.',
    tips: ['Chin tucked.', 'Squeeze the glutes at the top.', 'Shins vertical.'],
  },
  {
    id: 'bench_dip', name: 'Bench dips', gear: [B], bench: 0, kind: 'reps', group: 'push', role: 'main', level: 1, posture: 'seated',
    tempo: 2.4, dose: [8, 12, 15], detect: motion('headY', -1, 0.06), met: 4.5,
    how: 'Sit on the edge of the bench, hands beside your hips, and slide forward off it. Bend your elbows straight back to lower, then press up.',
    tips: ['Elbows straight back.', 'Shoulders away from your ears.', 'Stay close to the bench.'],
  },
  {
    id: 'incline_pushup', name: 'Incline push up', gear: [B], bench: 0, kind: 'reps', group: 'push', role: 'main', level: 1, posture: 'prone',
    tempo: 2.4, dose: [8, 12, 15], detect: motion('headY', -1, 0.06), met: 4.5,
    how: 'Hands on the edge of the bench, shoulder width, body in one straight line. Lower your chest to the bench and push away.',
    tips: ['Body like a plank.', 'Chest to the bench.', 'Squeeze the glutes.'],
  },
  {
    id: 'decline_pushup', name: 'Decline push up', gear: [B], bench: 0, kind: 'reps', group: 'push', role: 'main', level: 3, posture: 'prone',
    tempo: 2.6, dose: [6, 10, 14], detect: motion('headY', -1, 0.07), met: 6,
    how: 'Feet up on the bench, hands on the floor under your shoulders. Lower your chest to the floor with a tight core and push back up.',
    tips: ['Do not let the hips sag.', 'Elbows at forty five degrees.', 'Full range.'],
  },
  {
    id: 'step_up', name: 'Bench step ups', gear: [B], bench: 0, kind: 'reps', group: 'legs', role: 'main', level: 1, posture: 'stand', perSide: true,
    tempo: 2.6, dose: [8, 10, 12], detect: motion('headY', 1, 0.13), met: 6.5,
    how: 'Face the bench and plant one whole foot on it. Stand up tall on that leg, then lower back down slowly.',
    tips: ['Push through the top foot.', 'Stand all the way up.', 'Slow on the way down.'],
  },
  // ───────────── Dumbbells, standing ─────────────
  {
    id: 'curl', name: 'Biceps curl', gear: [D], kind: 'reps', group: 'pull', role: 'main', level: 1, posture: 'stand',
    tempo: 2.6, dose: [10, 12, 14], detect: motion('handsY', 1, 0.14), load: 'medium', met: 3.5,
    how: 'Stand tall, dumbbells at your sides, palms forward. Curl them to your shoulders keeping your elbows glued to your ribs, and lower slowly.',
    tips: ['Elbows glued to your ribs.', 'No swinging.', 'Slow on the way down.'],
  },
  {
    id: 'standing_press', name: 'Standing shoulder press', gear: [D], kind: 'reps', group: 'push', role: 'main', level: 2, posture: 'stand',
    tempo: 3, dose: [8, 10, 12], detect: motion('handsY', 1, 0.13), load: 'medium', met: 5,
    how: 'Stand with feet hip width, dumbbells at your shoulders. Brace your core and press straight overhead, then bring them back to your shoulders.',
    tips: ['Brace your core.', 'Do not lean back.', 'Finish with arms by your ears.'],
  },
  {
    id: 'lateral_raise', name: 'Lateral raise', gear: [D], kind: 'reps', group: 'push', role: 'main', level: 1, posture: 'stand',
    tempo: 2.8, dose: [10, 12, 15], detect: motion('handsY', 1, 0.13), load: 'light', met: 3.5,
    how: 'Dumbbells at your sides, slight bend in the elbows. Raise your arms out to shoulder height, pause, and lower with control.',
    tips: ['Lead with the elbows.', 'Shoulder height, no higher.', 'No shrugging.'],
  },
  {
    id: 'bent_row', name: 'Bent over row', gear: [D], kind: 'reps', group: 'pull', role: 'main', level: 2, posture: 'stand',
    tempo: 2.8, dose: [8, 10, 12], detect: motion('handsY', 1, 0.07), load: 'heavy', met: 4.5,
    how: 'Hinge forward at the hips with a flat back, dumbbells hanging under your shoulders. Row them to your ribs, squeeze your shoulder blades, and lower.',
    tips: ['Back flat.', 'Squeeze the shoulder blades.', 'Keep the hinge, do not stand up.'],
  },
  {
    id: 'goblet_squat', name: 'Goblet squat', gear: [D], kind: 'reps', group: 'legs', role: 'main', level: 1, posture: 'stand',
    tempo: 3, dose: [8, 10, 12], detect: motion('headY', -1, 0.13), load: 'heavy', met: 6,
    how: 'Hold one dumbbell against your chest with both hands. Sit down between your heels with your chest tall, then stand up strong.',
    tips: ['Chest tall.', 'Knees out.', 'Sit deeper.'],
  },
  {
    id: 'rdl', name: 'Romanian deadlift', gear: [D], kind: 'reps', group: 'legs', role: 'main', level: 2, posture: 'stand',
    tempo: 3.2, dose: [8, 10, 12], detect: motion('headY', -1, 0.1), load: 'heavy', met: 5,
    how: 'Dumbbells in front of your thighs, knees soft. Push your hips back and slide the weights down your legs with a flat back, then drive your hips forward to stand.',
    tips: ['Hips back.', 'Weights close to your legs.', 'Back stays flat.'],
  },
  {
    id: 'overhead_ext', name: 'Overhead triceps extension', gear: [D], kind: 'reps', group: 'push', role: 'main', level: 1, posture: 'stand',
    tempo: 2.8, dose: [10, 12, 14], detect: motion('handsY', -1, 0.09), load: 'light', met: 3.5,
    how: 'Hold one dumbbell overhead with both hands. Keeping your elbows close to your head, lower it behind your neck and extend back up.',
    tips: ['Elbows in.', 'Upper arms stay still.', 'Full stretch at the bottom.'],
  },
  // ───────────── Bodyweight / mat ─────────────
  {
    id: 'squat', name: 'Bodyweight squat', gear: [], kind: 'reps', group: 'legs', role: 'main', level: 1, posture: 'stand',
    tempo: 2.4, dose: [12, 15, 20], detect: motion('headY', -1, 0.13), met: 5,
    how: 'Feet shoulder width, arms out in front. Sit back and down until your thighs are level with the floor, then stand up.',
    tips: ['Weight in your heels.', 'Knees out.', 'Get a little deeper.'],
  },
  {
    id: 'lunge', name: 'Reverse lunge', gear: [], kind: 'reps', group: 'legs', role: 'main', level: 1, posture: 'stand', perSide: true,
    tempo: 2.6, dose: [8, 10, 12], detect: motion('headY', -1, 0.09), met: 5.5,
    how: 'Step one foot back and lower until both knees are at ninety degrees, then push through the front foot to stand. Alternate legs.',
    tips: ['Torso upright.', 'Back knee kisses the floor.', 'Push through the front heel.'],
  },
  {
    id: 'pushup', name: 'Push up', gear: [M], kind: 'reps', group: 'push', role: 'main', level: 2, posture: 'prone',
    tempo: 2.4, dose: [6, 10, 15], detect: motion('headY', -1, 0.08), met: 5.5,
    how: 'Hands under your shoulders, body in one straight line from head to heels. Lower your chest to the floor and push the ground away.',
    tips: ['Tight core.', 'Chest to the floor.', 'Elbows at forty five degrees.'],
  },
  {
    id: 'burpee', name: 'Burpees', gear: [M], kind: 'reps', group: 'cardio', role: 'main', level: 3, posture: 'stand',
    tempo: 3.4, dose: [6, 8, 12], detect: motion('headY', -1, 0.3), met: 9,
    how: 'Squat down, hands on the floor, jump your feet back to a plank, jump them in again, and explode up with a jump.',
    tips: ['Find a rhythm.', 'Land soft.', 'Keep breathing.'],
  },
  {
    id: 'crunch', name: 'Crunches', gear: [M], kind: 'reps', group: 'core', role: 'main', level: 1, posture: 'supine',
    tempo: 2.2, dose: [12, 15, 20], detect: motion('headY', 1, 0.04), met: 3.5,
    how: 'Lie on your back, knees bent, fingertips by your ears. Curl your shoulders off the mat, breathe out at the top, and lower slowly.',
    tips: ['Chin off your chest.', 'Breathe out as you come up.', 'Lower back stays down.'],
  },
  {
    id: 'leg_raise', name: 'Lying leg raises', gear: [M], kind: 'reps', group: 'core', role: 'main', level: 2, posture: 'supine',
    tempo: 3, dose: [8, 12, 15], detect: tempo, met: 3.5,
    how: 'Lie flat with your hands under your hips. Lift straight legs to vertical, then lower them slowly without letting your heels touch the floor.',
    tips: ['Press your lower back down.', 'Slow on the way down.', 'Legs long.'],
  },
  {
    id: 'glute_bridge', name: 'Glute bridge', gear: [M], kind: 'reps', group: 'legs', role: 'main', level: 1, posture: 'supine',
    tempo: 2.6, dose: [12, 15, 20], detect: tempo, met: 3.5,
    how: 'Lie on your back, knees bent, feet close to your hips. Drive through your heels to lift your hips, squeeze for a beat, and lower.',
    tips: ['Squeeze at the top.', 'Drive through the heels.', 'Ribs down.'],
  },
  {
    id: 'plank', name: 'Plank', gear: [M], kind: 'hold', group: 'core', role: 'main', level: 1, posture: 'prone',
    tempo: 4, dose: [25, 40, 60], detect: tempo, hold: { signal: 'headY', min: 0.08, max: 0.42 }, met: 4,
    how: 'Forearms on the mat, elbows under your shoulders, legs straight. Hold one straight line from head to heels.',
    tips: ['Hips level.', 'Squeeze everything.', 'Breathe.'],
  },
  {
    id: 'mountain_climber', name: 'Mountain climbers', gear: [M], kind: 'timed', group: 'cardio', role: 'main', level: 2, posture: 'prone',
    tempo: 0.9, dose: [20, 30, 40], detect: tempo, met: 8,
    how: 'Start in a high plank. Drive one knee to your chest, then switch legs fast, like running on the spot.',
    tips: ['Hips low.', 'Fast feet.', 'Shoulders over your hands.'],
  },
  // ───────────── Pull-up bar ─────────────
  {
    id: 'pullup', name: 'Pull ups', gear: [P], kind: 'reps', group: 'pull', role: 'main', level: 2, posture: 'hang',
    tempo: 3, dose: [3, 6, 10], detect: motion('headY', 1, 0.09), met: 8,
    how: 'Grip the bar a little wider than your shoulders, palms away. From a dead hang, pull your chest to the bar, then lower all the way down.',
    tips: ['Pull your elbows to your hips.', 'Chin over the bar.', 'All the way down.'],
  },
  {
    id: 'chinup', name: 'Chin ups', gear: [P], kind: 'reps', group: 'pull', role: 'main', level: 2, posture: 'hang',
    tempo: 3, dose: [3, 6, 10], detect: motion('headY', 1, 0.09), met: 8,
    how: 'Grip the bar shoulder width with your palms facing you. Pull until your chin clears the bar, and lower with control.',
    tips: ['Chest up.', 'No kicking.', 'Control the way down.'],
  },
  {
    id: 'knee_raise', name: 'Hanging knee raises', gear: [P], kind: 'reps', group: 'core', role: 'main', level: 2, posture: 'hang',
    tempo: 2.6, dose: [6, 10, 14], detect: tempo, met: 5,
    how: 'Hang from the bar with straight arms. Pull your knees up to your chest without swinging, then lower your legs slowly.',
    tips: ['No swinging.', 'Curl your hips up.', 'Slow on the way down.'],
  },
  {
    id: 'dead_hang', name: 'Dead hang', gear: [P], kind: 'hold', group: 'pull', role: 'main', level: 1, posture: 'hang',
    tempo: 4, dose: [15, 30, 45], detect: tempo, hold: { signal: 'handsY', min: 0.04, max: 0.6 }, met: 3.5,
    how: 'Grip the bar and simply hang with straight arms and active shoulders. Hold on for the whole time.',
    tips: ['Shoulders away from your ears.', 'Squeeze the bar.', 'Breathe.'],
  },
  // ───────────── Warm-up ─────────────
  {
    id: 'jumping_jack', name: 'Jumping jacks', gear: [], kind: 'timed', group: 'cardio', role: 'warmup', level: 1, posture: 'stand',
    tempo: 1, dose: [30, 40, 45], detect: motion('handsY', 1, 0.25), met: 8,
    how: 'Jump your feet wide as your hands go overhead, then jump back together. Nice and light.',
    tips: ['Light on your feet.', 'Arms all the way up.', 'Stay loose.'],
  },
  {
    id: 'high_knees', name: 'High knees', gear: [], kind: 'timed', group: 'cardio', role: 'warmup', level: 1, posture: 'stand',
    tempo: 0.7, dose: [25, 30, 40], detect: tempo, met: 8,
    how: 'Run on the spot, driving your knees up to hip height and pumping your arms.',
    tips: ['Knees up.', 'Pump the arms.', 'Stay tall.'],
  },
  {
    id: 'arm_circles', name: 'Arm circles', gear: [], kind: 'timed', group: 'mobility', role: 'warmup', level: 1, posture: 'stand',
    tempo: 1.6, dose: [25, 30, 30], detect: tempo, met: 2.5,
    how: 'Arms out to the sides. Draw big slow circles, forward first, then reverse halfway through.',
    tips: ['Big circles.', 'Loosen the shoulders.'],
  },
  {
    id: 'torso_twist', name: 'Torso twists', gear: [], kind: 'timed', group: 'mobility', role: 'warmup', level: 1, posture: 'stand',
    tempo: 1.8, dose: [25, 30, 30], detect: tempo, met: 2.5,
    how: 'Feet wide, arms relaxed. Rotate your upper body left and right, letting your arms swing and your back heel lift.',
    tips: ['Let the hips turn.', 'Stay relaxed.'],
  },
  // ───────────── Cool-down ─────────────
  {
    id: 'forward_fold', name: 'Forward fold', gear: [], kind: 'hold', group: 'mobility', role: 'cooldown', level: 1, posture: 'stand',
    tempo: 5, dose: [25, 30, 30], detect: tempo, met: 2,
    how: 'Feet hip width. Fold forward from the hips and let your head and arms hang heavy. Soften your knees.',
    tips: ['Let your head hang.', 'Breathe into the backs of your legs.'],
  },
  {
    id: 'chest_stretch', name: 'Chest opener', gear: [], kind: 'hold', group: 'mobility', role: 'cooldown', level: 1, posture: 'stand',
    tempo: 5, dose: [20, 25, 30], detect: tempo, met: 2,
    how: 'Clasp your hands behind your back, straighten your arms, and lift your chest to the ceiling.',
    tips: ['Open the chest.', 'Slow breaths.'],
  },
  {
    id: 'childs_pose', name: "Child's pose", gear: [M], kind: 'hold', group: 'mobility', role: 'cooldown', level: 1, posture: 'prone',
    tempo: 5, dose: [25, 30, 40], detect: tempo, met: 2,
    how: 'Kneel on the mat, sit back on your heels, and reach your arms long in front of you with your forehead down.',
    tips: ['Sink your hips back.', 'Let everything go.'],
  },
  {
    id: 'cobra', name: 'Cobra stretch', gear: [M], kind: 'hold', group: 'mobility', role: 'cooldown', level: 1, posture: 'prone',
    tempo: 5, dose: [20, 25, 30], detect: tempo, met: 2,
    how: 'Lie face down, hands under your shoulders. Press your chest up while your hips stay on the mat, and look forward.',
    tips: ['Shoulders down.', 'Long neck.'],
  },
];

export const EXERCISES: Record<string, Exercise> = Object.fromEntries(LIST.map((e) => [e.id, e]));
export const EXERCISE_LIST = LIST;
export const ex = (id: string): Exercise => {
  const e = EXERCISES[id];
  if (!e) throw new Error(`Unknown exercise ${id}`);
  return e;
};
