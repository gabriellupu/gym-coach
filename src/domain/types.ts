export type GearId = 'bench' | 'dumbbells' | 'mat' | 'pullup_bar';
export type Goal = 'strength' | 'lean' | 'fit' | 'mobility';
export type Level = 1 | 2 | 3;
export type Group = 'push' | 'pull' | 'legs' | 'core' | 'cardio' | 'mobility';
export type Role = 'warmup' | 'main' | 'cooldown';
export type Kind = 'reps' | 'timed' | 'hold';
/** Where the trainee's eyes are during the move; decides where the board floats. */
export type Posture = 'stand' | 'prone' | 'supine' | 'seated' | 'hang';
export type LoadClass = 'light' | 'medium' | 'heavy';
/** Backrest angle in degrees from horizontal. */
export type BenchAngle = 0 | 45 | 80;

/** Scalar body signals a rep can be read from (all normalised by standing height). */
export type Signal =
  | 'headY' // head height
  | 'handsY' // mean hand height relative to the head
  | 'handHiY' // higher hand relative to the head (one-arm work)
  | 'handsSpread' // distance between the hands
  | 'handsReach'; // mean hand distance from the head

export type Detect =
  /** A rep is an excursion of `signal` by at least `amp` in direction `dir`, and back. */
  | { by: 'motion'; signal: Signal; dir: 1 | -1; amp: number }
  /** Can't be seen from head and hands: the coach sets the pace and counts. */
  | { by: 'tempo' };

export interface HoldCheck {
  signal: Signal;
  min: number;
  max: number;
}

export interface Exercise {
  id: string;
  name: string;
  gear: GearId[];
  bench?: BenchAngle;
  kind: Kind;
  group: Group;
  role: Role;
  level: Level;
  posture: Posture;
  /** Seconds for one clean rep (demo speed and tempo counting). */
  tempo: number;
  /** Reps (or seconds for timed/hold) per set at level 1, 2, 3. */
  dose: [number, number, number];
  detect: Detect;
  hold?: HoldCheck;
  perSide?: boolean;
  load?: LoadClass;
  met: number;
  /** Spoken set-up and execution, one or two sentences. */
  how: string;
  /** Short form cues the coach drops in mid-set. */
  tips: string[];
}

/** A point pair pinned on real equipment, in gym-anchor space (metres, y up). */
export interface Placement {
  a: [number, number, number];
  b: [number, number, number];
}

export interface GearItem {
  owned: boolean;
  placement?: Placement;
  /** Dumbbell weights available, kg. */
  loads?: number[];
  /** Bench: can the backrest be raised? */
  adjustable?: boolean;
}

export interface Step {
  ex: string;
  sets: number;
  /** Reps, or seconds for timed/hold. */
  amount: number;
  rest: number;
  role: Role;
  loadKg?: number;
}

export interface Plan {
  title: string;
  focus: string;
  steps: Step[];
  minutes: number;
}

export interface SetLog {
  ex: string;
  amount: number;
  loadKg?: number;
}

export interface SessionLog {
  date: string; // ISO
  minutes: number;
  kcal: number;
  reps: number;
  sets: SetLog[];
  completed: boolean;
}
