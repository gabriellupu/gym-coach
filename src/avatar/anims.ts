import { BAR, BENCH } from '../domain/gear';
import { ARM, DIM, LEG, TORSO, type Limb, type Pose } from './rig';

/** The equipment the figure is posed against (real, mapped sizes in the headset). */
export interface Ctx {
  bench: { length: number; height: number; width: number; seat: number; angle: number };
  barH: number;
}
export const defaultCtx = (angle = 0): Ctx => ({ bench: { ...BENCH, angle }, barH: BAR.height });

export interface Anim {
  /** Keyframes at phase 0..1, first at 0; the cycle loops back to the first. */
  keys: [number, Pose][];
  /** Dumbbells: one in each hand, or one held in both. */
  db?: 'pair' | 'one' | 'right';
  /** Handle direction: across the chest, along the torso, out of the chest, or along the forearm. */
  dbAxis?: 'x' | 'y' | 'z' | 'arm';
  /** Camera azimuth (degrees round the figure, 0 = front) for the on-board view. */
  cam?: number;
}

const F = DIM.footH;
/** Hip height standing tall, and a comfortable full arm reach. */
const ST = F + LEG - 0.012;
const R = ARM - 0.012;
/** Ankle height when up on the ball of the foot. */
const TOE = 0.2;
const RAD = Math.PI / 180;
type T3 = [number, number, number];

/** The same arm on both sides (x mirrored). */
const arms = (a: Limb): Pick<Pose, 'armL' | 'armR'> => {
  const flip = (t?: T3): T3 | undefined => (t ? [-t[0], t[1], t[2]] : undefined);
  return { armL: a, armR: { ...a, to: flip(a.to), at: flip(a.at), pole: flip(a.pole) } };
};
const feet = (w: number, z = 0, y = F): Pick<Pose, 'legL' | 'legR'> => ({ legL: { to: [w, y, z] }, legR: { to: [-w, y, z] } });
const stand = (o: Partial<Pose> = {}): Pose => ({ pos: [0, ST, 0], ...feet(0.11), ...arms({ out: 7, bend: 10 }), ...o });
const cycle = (a: Pose, b: Pose, hold = 0.08): [number, Pose][] => [[0, a], [0.5 - hold, b], [0.5 + hold, b]];

// ───────────── On the bench ─────────────
/** Lying / sitting back against the backrest at its current angle. Faces the foot end. */
function onBench(c: Ctx, o: Partial<Pose>): Pose {
  const { length: L, height: H, seat, angle } = c.bench;
  const s = Math.sin(angle * RAD), k = Math.cos(angle * RAD);
  const hinge = -L / 2 + seat;
  const off = 0.105 + s * 0.03; // sit clear of the pad when upright
  const y = H + s * 0.1 + k * off;
  const z = hinge + k * 0.1 - s * off;
  return {
    pos: [0, y, z], yaw: 180, pitch: -(90 - angle), head: angle > 60 ? 0 : -4,
    legL: { to: [-0.2, F, z - 0.45 - k * 0.03], pole: [0, 1, -1] }, legR: { to: [0.2, F, z - 0.45 - k * 0.03], pole: [0, 1, -1] },
    footL: 'flat', footR: 'flat', ...o,
  };
}

/** Straight body from toes to shoulders, shoulders `sy` high above hands at z = 0. */
function plank(sy: number, footY: number, o: Partial<Pose> = {}): { pose: Pose; D: number } {
  const ay = footY + TOE;
  const len = LEG + TORSO;
  const ang = Math.asin(Math.max(-0.9, Math.min(0.9, (sy - ay) / len)));
  const D = len * Math.cos(ang);
  return {
    D,
    pose: {
      pos: [0, ay + LEG * Math.sin(ang), -D + LEG * Math.cos(ang)], pitch: 90 - ang / RAD, head: -18,
      legL: { to: [0.09, ay, -D], pole: [0, -1, 0.3] }, legR: { to: [-0.09, ay, -D], pole: [0, -1, 0.3] }, footL: 'toes', footR: 'toes', ...o,
    },
  };
}
const pushup = (handY: number, footY: number, cam: number, frame: (D: number) => Pose['frame']): Anim => {
  const top = plank(handY + ARM - 0.01, footY, arms({ to: [0.24, handY, 0.02], pole: [1, 0.3, -0.8] }));
  const bot = plank(handY + 0.17, footY, arms({ to: [0.24, handY, 0.02], pole: [1, 0.3, -0.8] }));
  top.pose.frame = bot.pose.frame = frame(top.D);
  return { keys: cycle(top.pose, bot.pose, 0.05), cam };
};

/** Supine on the floor, head toward -Z, knees bent, feet flat. */
const supine = (o: Partial<Pose> = {}): Pose => ({
  pos: [0, 0.105, 0], pitch: -90, legL: { to: [0.13, F, 0.52] }, legR: { to: [-0.13, F, 0.52] }, footL: 'flat', footR: 'flat',
  ...arms({ out: 12, bend: 5 }), frame: { yaw: 90 }, ...o,
});

function hang(c: Ctx, grip: number, lift: number, o: Partial<Pose> = {}): Pose {
  const y = c.barH - ARM + 0.01 - TORSO + lift;
  // Low bar: tuck the shins back so the feet clear the floor.
  const room = y - lift - 0.12 - DIM.thigh;
  const bend = room >= DIM.shin ? 12 : Math.acos(Math.max(-0.2, room / DIM.shin)) / RAD;
  return {
    pos: [0, y, lift ? -0.06 : 0], pitch: lift ? -8 : 0, head: lift ? -12 : 0,
    armL: { to: [grip, c.barH, 0], pole: [1, -0.5, -0.25] }, armR: { to: [-grip, c.barH, 0], pole: [-1, -0.5, -0.25] },
    legL: { raise: lift ? 8 : 2, bend }, legR: { raise: lift ? 8 : 2, bend }, footL: 'free', footR: 'free', ...o,
  };
}

const squatLegs = feet(0.19);
const kneesOut = { legL: { to: [0.19, F, 0] as T3, pole: [0.45, 0, 1] as T3 }, legR: { to: [-0.19, F, 0] as T3, pole: [-0.45, 0, 1] as T3 } };

export const ANIMS: Record<string, (c: Ctx) => Anim> = {
  // ── Bench + dumbbells ──
  bench_press: (c) => ({
    db: 'pair', cam: 120,
    keys: cycle(onBench(c, arms({ at: [0.18, 0, R], pole: [1, -0.2, -0.5] })), onBench(c, arms({ at: [0.31, -0.03, 0.05], pole: [1, -0.2, -0.5] }))),
  }),
  incline_press: (c) => ({
    db: 'pair', cam: 120,
    keys: cycle(onBench(c, arms({ at: [0.18, 0.3, 0.44], pole: [1, -0.4, -0.4] })), onBench(c, arms({ at: [0.31, -0.02, 0.07], pole: [1, -0.4, -0.4] }))),
  }),
  db_fly: (c) => ({
    db: 'pair', dbAxis: 'y', cam: 150,
    keys: cycle(onBench(c, arms({ at: [0.07, 0, R], pole: [1, 0, -0.6] })), onBench(c, arms({ at: [0.5, 0, 0.13], pole: [0.2, 0, -1] }))),
  }),
  seated_press: (c) => ({
    db: 'pair', cam: 150,
    keys: cycle(onBench(c, arms({ at: [0.31, 0.06, 0.1], pole: [0.8, -1, 0.1] })), onBench(c, arms({ at: [0.19, R, 0.07], pole: [0.8, -1, 0.1] }))),
  }),
  skull_crusher: (c) => ({
    db: 'pair', dbAxis: 'y', cam: 105,
    keys: cycle(onBench(c, arms({ at: [0.14, 0.02, R], pole: [0, -1, 1] })), onBench(c, arms({ at: [0.14, 0.27, 0.24], pole: [0, -1, 1] }))),
  }),
  pullover: (c) => ({
    db: 'one', dbAxis: 'arm', cam: 105,
    keys: cycle(onBench(c, arms({ at: [0.05, 0.02, 0.52], pole: [1, 0, 0.6] })), onBench(c, arms({ at: [0.07, 0.5, -0.02], pole: [1, 0, 0.6] }))),
  }),
  incline_curl: (c) => {
    const back = -(90 - c.bench.angle);
    return { db: 'pair', cam: 120, keys: cycle(onBench(c, arms({ raise: back, out: 6, bend: 6 })), onBench(c, arms({ raise: back, out: 6, bend: 138 }))) };
  },
  one_arm_row: (c) => {
    const H = c.bench.height, z = -0.28;
    const base = (hand: T3): Pose => ({
      pos: [-0.14, H + 0.44, z], pitch: 80, head: -25,
      legL: { to: [-0.05, H + 0.07, z - 0.37], pole: [0, -1, 0.7] }, footL: 'free',
      legR: { to: [-0.42, F, z - 0.06], pole: [-0.2, 0, 1] },
      armL: { to: [-0.02, H + 0.04, z + 0.5], pole: [0.6, 0.2, -1] },
      armR: { to: hand, pole: [-0.5, 1, -1] },
    });
    return { db: 'right', dbAxis: 'y', cam: -60, keys: cycle(base([-0.36, H - 0.03, z + 0.44]), base([-0.37, H + 0.36, z + 0.2]), 0.06) };
  },
  split_squat: (c) => {
    const H = c.bench.height;
    const base = (y: number): Pose => ({
      pos: [0, y, -0.2], pitch: 8, frame: { yaw: 180, z: -c.bench.length / 2 - 0.62 },
      legL: { to: [0.1, H + 0.1, -0.74], pole: [0.1, -1, 0.5] }, footL: 'free',
      legR: { to: [-0.1, F, 0.12], pole: [-0.1, 0.2, 1] }, ...arms({ out: 8, bend: 25, raise: 5 }),
    });
    return { cam: 70, keys: cycle(base(ST - 0.03), base(0.52)) };
  },
  hip_thrust: (c) => {
    const H = c.bench.height;
    const up = (ang: number): Pose => {
      // Shoulder blades stay on the bench edge; the hips swing about them.
      const sy = H + 0.02, sz = 0.04;
      return {
        pos: [0, sy - TORSO * Math.sin(ang * RAD), sz + TORSO * Math.cos(ang * RAD)], pitch: -(90 - ang), head: 18,
        legL: { to: [0.15, F, 0.93] }, legR: { to: [-0.15, F, 0.93] }, footL: 'flat', footR: 'flat',
        ...arms({ out: 70, bend: 25, raise: -10 }), frame: { yaw: 90, x: c.bench.width / 2 - 0.02 },
      };
    };
    return { cam: 20, keys: cycle(up(36), up(-2), 0.1) };
  },
  bench_dip: (c) => {
    const H = c.bench.height;
    const base = (y: number): Pose => ({
      pos: [0, y, 0.03], pitch: -4, frame: { yaw: 90, x: c.bench.width / 2 + 0.17 },
      legL: { to: [0.1, F, 0.66] }, legR: { to: [-0.1, F, 0.66] }, footL: 'flat', footR: 'flat',
      ...arms({ to: [0.2, H + 0.04, -0.17], pole: [0.15, 0.3, -1] }),
    });
    return { cam: 20, keys: cycle(base(H + 0.02), base(H - 0.2), 0.05) };
  },
  incline_pushup: (c) => pushup(c.bench.height + 0.04, 0, 150, () => ({ yaw: -90, x: 0.1 })),
  decline_pushup: (c) => pushup(0.05, c.bench.height, 25, (D) => ({ yaw: 90, x: D - 0.02 })),
  step_up: (c) => {
    const H = c.bench.height;
    const fr = { yaw: -90, x: 0.44 };
    const lead: Limb = { to: [0.1, H + F, 0.44], pole: [0.1, 0.3, 1] };
    const down: Pose = { pos: [0, ST, 0.02], pitch: 6, legL: lead, legR: { to: [-0.1, F, 0] }, ...arms({ out: 8, bend: 30, raise: 10 }), frame: fr };
    const up: Pose = { pos: [0, H + ST, 0.42], legL: lead, legR: { to: [-0.1, H + F, 0.44] }, ...arms({ out: 8, bend: 30, raise: 0 }), frame: fr };
    return { cam: 110, keys: [[0, down], [0.42, up], [0.56, up]] };
  },
  // ── Dumbbells, standing ──
  curl: () => ({ db: 'pair', cam: 35, keys: cycle(stand(arms({ out: 6, bend: 5, twist: 0 })), stand(arms({ out: 6, bend: 140, raise: 8 }))) }),
  standing_press: () => ({
    db: 'pair', cam: 25,
    keys: cycle(stand(arms({ at: [0.29, 0.03, 0.12], pole: [0.8, -1, 0.2] })), stand(arms({ at: [0.18, R, 0.04], pole: [0.8, -1, 0.2] }))),
  }),
  lateral_raise: () => ({ db: 'pair', dbAxis: 'z', cam: 15, keys: cycle(stand(arms({ out: 9, bend: 12 })), stand(arms({ out: 86, bend: 14 }))) }),
  bent_row: () => {
    const base = (a: Limb): Pose => ({ pos: [0, ST - 0.08, -0.2], pitch: 58, head: -30, ...feet(0.13), ...kneesOutNarrow, ...arms(a) });
    return { db: 'pair', dbAxis: 'y', cam: 70, keys: cycle(base({ raise: 58, out: 4, bend: 6 }), base({ raise: -18, out: 14, bend: 112 }), 0.06) };
  },
  goblet_squat: () => {
    const hold = arms({ at: [0.075, -0.1, 0.19], pole: [0.7, -1, 0] });
    return { db: 'one', dbAxis: 'y', cam: 40, keys: cycle({ pos: [0, ST - 0.005, 0], ...kneesOut, ...hold }, { pos: [0, 0.47, -0.24], pitch: 22, spine: -6, ...kneesOut, ...hold }) };
  },
  rdl: () => ({
    db: 'pair', cam: 70,
    keys: cycle(stand({ ...feet(0.12), ...arms({ raise: 6, out: 4, bend: 4 }) }), { pos: [0, ST - 0.05, -0.22], pitch: 68, head: -35, ...feet(0.12), ...arms({ raise: 70, out: 3, bend: 3 }) }),
  }),
  overhead_ext: () => ({
    db: 'one', dbAxis: 'arm', cam: 60,
    keys: cycle(stand(arms({ at: [0.05, R, 0], pole: [0.3, 0.6, 1] })), stand(arms({ at: [0.06, 0.17, -0.15], pole: [0.3, 0.6, 1] }))),
  }),
  // ── Bodyweight / mat ──
  squat: () => ({
    cam: 40,
    keys: cycle({ pos: [0, ST - 0.005, 0], ...kneesOut, ...arms({ raise: 25, out: 5, bend: 10 }) }, { pos: [0, 0.48, -0.25], pitch: 30, spine: -6, ...kneesOut, ...arms({ raise: 118, out: 4, bend: 8 }) }),
  }),
  lunge: () => {
    const up = stand(arms({ out: 6, bend: 70, raise: -5 }));
    const down = (s: 1 | -1): Pose => {
      const back: Limb = { to: [s * 0.11, TOE, -0.68], pole: [0, -1, 0.6] };
      const front: Limb = { to: [-s * 0.11, F, 0.02], pole: [0, 0.2, 1] };
      return { pos: [0, 0.52, -0.3], ...(s > 0 ? { legL: back, legR: front, footL: 'toes' as const } : { legR: back, legL: front, footR: 'toes' as const }), ...arms({ out: 6, bend: 70, raise: -5 }) };
    };
    return { cam: 70, keys: [[0, up], [0.2, down(1)], [0.3, down(1)], [0.5, up], [0.7, down(-1)], [0.8, down(-1)]] };
  },
  pushup: () => pushup(0.05, 0, 25, () => ({ yaw: 90, x: -0.55 })),
  burpee: () => {
    const fr = { yaw: 90, x: -0.3 };
    const st = stand({ frame: fr });
    const crouch: Pose = { pos: [0, 0.4, -0.12], pitch: 62, head: -30, ...feet(0.16, -0.05), ...arms({ to: [0.22, 0.05, 0.42], pole: [1, 0.3, -0.6] }), frame: fr };
    const pl = plank(0.05 + ARM - 0.01, 0, arms({ to: [0.22, 0.05, 0.42], pole: [1, 0.3, -0.6] })).pose;
    pl.pos = [pl.pos[0], pl.pos[1], pl.pos[2] + 0.42];
    pl.legL = { to: [0.09, TOE, pl.legL!.to![2] + 0.42], pole: [0, -1, 0.3] };
    pl.legR = { to: [-0.09, TOE, pl.legR!.to![2] + 0.42], pole: [0, -1, 0.3] };
    pl.frame = fr;
    const jump: Pose = { pos: [0, ST + 0.24, 0], legL: { raise: 2, bend: 6, out: 3 }, legR: { raise: 2, bend: 6, out: 3 }, footL: 'toes', footR: 'toes', ...arms({ raise: 172, out: 8, bend: 8 }), frame: fr };
    return { cam: 10, keys: [[0, st], [0.16, crouch], [0.32, pl], [0.44, pl], [0.6, crouch], [0.78, jump], [0.9, st]] };
  },
  crunch: () => {
    const hands = arms({ at: [0.17, 0.2, 0.06], pole: [1, 0.2, -0.2] });
    return { cam: 20, keys: cycle(supine({ ...hands, head: 8 }), supine({ ...hands, spine: 24, chest: 22, head: 14 }), 0.06) };
  },
  leg_raise: () => {
    const base = (raise: number): Pose => supine({ legL: { raise, bend: 4, out: 3 }, legR: { raise, bend: 4, out: 3 }, footL: 'free', footR: 'free', ...arms({ out: 16, bend: 4, raise: -4 }) });
    return { cam: 20, keys: cycle(base(8), base(90), 0.05) };
  },
  glute_bridge: () => {
    const up = (ang: number): Pose => supine({
      pos: [0, 0.15 + TORSO * Math.sin(ang * RAD), 0.52 - 0.44 - (1 - Math.cos(ang * RAD)) * 0.1], pitch: -90 - ang, head: -ang * 0.8,
      legL: { to: [0.13, F, 0.52] }, legR: { to: [-0.13, F, 0.52] }, ...arms({ out: 14, bend: 4, raise: -ang }),
    });
    const down = up(-6);
    down.pos = [0, 0.105, 0.06];
    return { cam: 20, keys: cycle(down, up(26), 0.1) };
  },
  plank: () => {
    const p = (dy: number) => {
      const r = plank(0.34 + dy, 0, arms({ to: [0.19, 0.04, 0.25], pole: [0.1, -1, -0.4] })).pose;
      r.frame = { yaw: 90, x: -0.5 };
      return r;
    };
    return { cam: 20, keys: [[0, p(0)], [0.5, p(0.012)]] };
  },
  mountain_climber: () => {
    const p = (s: 1 | -1) => {
      const r = plank(0.05 + ARM - 0.01, 0, arms({ to: [0.24, 0.05, 0.02], pole: [1, 0.3, -0.8] })).pose;
      const knee: Limb = { to: [s * 0.09, 0.13, -0.42], pole: [0, 0.3, 1] };
      if (s > 0) r.legL = knee;
      else r.legR = knee;
      r.pos = [0, r.pos[1] + 0.05, r.pos[2]];
      r.frame = { yaw: 90, x: -0.5 };
      return r;
    };
    return { cam: 20, keys: [[0, p(1)], [0.5, p(-1)]] };
  },
  // ── Pull-up bar ──
  pullup: (c) => ({ cam: 160, keys: cycle(hang(c, 0.32, 0), hang(c, 0.32, 0.5), 0.06) }),
  chinup: (c) => ({ cam: 160, keys: cycle(hang(c, 0.2, 0), hang(c, 0.2, 0.5, { armL: { to: [0.2, c.barH, 0], pole: [0.3, -0.6, 1] }, armR: { to: [-0.2, c.barH, 0], pole: [-0.3, -0.6, 1] } }), 0.06) }),
  knee_raise: (c) => {
    const tuck: Limb = { raise: 105, bend: 118 };
    return { cam: 120, keys: cycle(hang(c, 0.3, 0), hang(c, 0.3, 0, { legL: tuck, legR: tuck, spine: 14, pos: [0, c.barH - ARM + 0.01 - TORSO, -0.03] }), 0.08) };
  },
  dead_hang: (c) => ({ cam: 160, keys: [[0, hang(c, 0.3, 0, { side: -1.5 })], [0.5, hang(c, 0.3, 0, { side: 1.5 })]] }),
  // ── Warm-up ──
  jumping_jack: () => {
    const legs = (o: number): Pick<Pose, 'legL' | 'legR'> => ({ legL: { out: o, bend: 4 }, legR: { out: o, bend: 4 } });
    return {
      cam: 0,
      keys: [
        [0, { pos: [0, ST - 0.015, 0], ground: 0, ...legs(3), ...arms({ out: 8, bend: 8 }) }],
        [0.25, { pos: [0, ST - 0.015, 0], ground: 0.06, ...legs(14), ...arms({ out: 100, bend: 10 }) }],
        [0.5, { pos: [0, ST - 0.015, 0], ground: 0, ...legs(22), ...arms({ out: 168, bend: 14 }) }],
        [0.75, { pos: [0, ST - 0.015, 0], ground: 0.06, ...legs(12), ...arms({ out: 90, bend: 10 }) }],
      ],
    };
  },
  high_knees: () => {
    const p = (s: 1 | -1, g: number): Pose => {
      const upLeg: Limb = { raise: 88, bend: 95 };
      const dn: Limb = { raise: 0, bend: 6 };
      const fwd: Limb = { raise: 50, bend: 95, out: 6 };
      const bk: Limb = { raise: -30, bend: 95, out: 6 };
      return { pos: [0, ST - 0.015, 0], ground: g, pitch: 3, legL: s > 0 ? upLeg : dn, legR: s > 0 ? dn : upLeg, armL: s > 0 ? bk : fwd, armR: s > 0 ? fwd : bk };
    };
    return { cam: 50, keys: [[0, p(1, 0)], [0.25, p(1, 0.05)], [0.5, p(-1, 0)], [0.75, p(-1, 0.05)]] };
  },
  arm_circles: () => {
    const p = (raise: number, out: number): Pose => stand(arms({ raise, out, bend: 4 }));
    return { cam: 30, keys: [[0, p(0, 104)], [0.25, p(16, 90)], [0.5, p(0, 76)], [0.75, p(-16, 90)]] };
  },
  torso_twist: () => {
    const p = (t: number): Pose => ({ pos: [0, ST - 0.015, 0], ...feet(0.2), twist: t, headYaw: t * 0.25, armL: { raise: 35 + t * 0.5, out: 28, bend: 75 }, armR: { raise: 35 - t * 0.5, out: 28, bend: 75 } });
    return { cam: 20, keys: [[0, p(-55)], [0.5, p(55)]] };
  },
  // ── Cool-down ──
  forward_fold: () => {
    const p = (a: number): Pose => ({ pos: [0, ST - 0.02, -0.14], pitch: a, spine: 22, chest: 14, head: 12, ...feet(0.11), ...arms({ raise: a + 36, out: 3, bend: 6 }) });
    return { cam: 70, keys: [[0, p(92)], [0.5, p(97)]] };
  },
  chest_stretch: () => {
    const p = (a: number): Pose => stand({ spine: -6 - a, chest: -8 - a, head: -14 - a, ...arms({ raise: -38 - a * 2, out: 4, bend: 8 }) });
    return { cam: 70, keys: [[0, p(0)], [0.5, p(3)]] };
  },
  childs_pose: () => {
    const p = (a: number): Pose => ({
      pos: [0, 0.2, 0], pitch: 66 + a, spine: 18, chest: 10, head: 6, frame: { yaw: 90, x: -0.3 },
      legL: { to: [0.1, 0.05, -0.2], pole: [0.2, 0, 1] }, legR: { to: [-0.1, 0.05, -0.2], pole: [-0.2, 0, 1] }, footL: 'free', footR: 'free',
      ...arms({ to: [0.16, 0.04, 0.98], pole: [0.4, 1, 0] }),
    });
    return { cam: 20, keys: [[0, p(0)], [0.5, p(2)]] };
  },
  cobra: () => {
    const p = (a: number): Pose => ({
      pos: [0, 0.1, 0], pitch: 82, spine: -24 - a, chest: -26 - a, head: -22, frame: { yaw: 90, x: -0.3 },
      legL: { raise: -6, bend: 0, out: 5 }, legR: { raise: -6, bend: 0, out: 5 }, footL: 'free', footR: 'free',
      ...arms({ to: [0.2, 0.04, 0.4], pole: [0.6, 0.4, -1] }),
    });
    return { cam: 20, keys: [[0, p(0)], [0.5, p(4)]] };
  },
  // ── The coach between exercises ──
  idle: () => ({ keys: [[0, stand()], [0.5, stand({ pos: [0, ST - 0.004, 0], spine: -1.2, chest: -1.2, ...arms({ out: 8, bend: 12 }) })]] }),
  spot: () => {
    const p = (a: number): Pose => ({ pos: [0, ST - 0.05, -0.05], pitch: 12, head: 8, ...feet(0.17), ...arms({ raise: 30 + a, out: 12, bend: 62 }) });
    return { keys: [[0, p(0)], [0.5, p(3)]] };
  },
  wave: () => {
    const p = (o: number): Pose => stand({ armL: { out: 7, bend: 10 }, armR: { out: 142, bend: 48 + o, twist: -20 }, headYaw: 0 });
    return { keys: [[0, p(-28)], [0.5, p(28)]] };
  },
  cheer: () => ({
    keys: [
      [0, stand({ ...arms({ out: 138, bend: 50 }) })],
      [0.5, stand({ pos: [0, ST - 0.015, 0], ...arms({ out: 152, bend: 12 }) })],
    ],
  }),
  beckon: () => {
    const p = (b: number): Pose => stand({ armL: { out: 7, bend: 10 }, armR: { raise: 70, out: 15, bend: b } });
    return { keys: [[0, p(30)], [0.5, p(115)]] };
  },
};
const kneesOutNarrow = { legL: { to: [0.13, F, 0] as T3, pole: [0.2, 0, 1] as T3 }, legR: { to: [-0.13, F, 0] as T3, pole: [-0.2, 0, 1] as T3 } };

const smooth = (t: number) => t * t * (3 - 2 * t);

/** The pose at a phase (0..1, wraps) of an animation. */
export function sample(a: Anim, phase: number): Pose {
  const ph = ((phase % 1) + 1) % 1;
  const k = a.keys;
  let i = k.length - 1;
  while (i > 0 && k[i][0] > ph) i--;
  const next = k[(i + 1) % k.length];
  const end = i + 1 < k.length ? next[0] : 1;
  const t = end > k[i][0] ? (ph - k[i][0]) / (end - k[i][0]) : 0;
  return mixPose(k[i][1], next[1], smooth(t));
}
import { mix } from './rig';
const mixPose = (a: Pose, b: Pose, t: number): Pose => mix(a, b, t);

export const animFor = (id: string, c: Ctx): Anim => (ANIMS[id] ?? ANIMS.idle)(c);
