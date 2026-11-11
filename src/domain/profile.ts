import { GEAR_IDS } from './gear';
import type { GearId, GearItem, Goal, Level, SessionLog } from './types';

export interface ExRecord {
  /** Reps or seconds per set the trainee last worked at. */
  amount: number;
  loadKg?: number;
  /** -1 too hard, 0 fine, 1 too easy (from "easier" / "harder" or missed reps). */
  feel: -1 | 0 | 1;
  times: number;
}

export interface Profile {
  v: 1;
  name: string;
  goal: Goal;
  level: Level;
  minutes: number;
  daysPerWeek: number;
  weightKg: number;
  gear: Record<GearId, GearItem>;
  /** WebXR persistent-anchor handle of the gym origin all placements hang off. */
  anchor: string;
  records: Record<string, ExRecord>;
  history: SessionLog[];
  settings: { voice: boolean; mic: boolean; volume: number };
  onboarded: boolean;
}

const KEY = 'gym-coach:v1';

export function defaultProfile(): Profile {
  return {
    v: 1,
    name: '',
    goal: 'fit',
    level: 1,
    minutes: 20,
    daysPerWeek: 3,
    weightKg: 75,
    gear: {
      bench: { owned: true, adjustable: true },
      dumbbells: { owned: true, loads: [5, 8, 10, 12] },
      mat: { owned: true },
      pullup_bar: { owned: true },
    },
    anchor: '',
    records: {},
    history: [],
    settings: { voice: true, mic: true, volume: 1 },
    onboarded: false,
  };
}

/** localStorage can throw in private / sandboxed browsers; never let that break the app. */
function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadProfile(): Profile {
  const base = defaultProfile();
  try {
    const raw = storage()?.getItem(KEY);
    if (!raw) return base;
    const p = JSON.parse(raw) as Partial<Profile>;
    const gear = { ...base.gear };
    for (const id of GEAR_IDS) gear[id] = { ...base.gear[id], ...(p.gear?.[id] ?? {}) };
    return { ...base, ...p, gear, settings: { ...base.settings, ...(p.settings ?? {}) }, v: 1 };
  } catch {
    return base;
  }
}

export function saveProfile(p: Profile) {
  try {
    storage()?.setItem(KEY, JSON.stringify(p));
  } catch {
    /* quota / private mode: progress just isn't kept */
  }
}

const startOfWeek = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Monday
  return x;
};

export interface WeekGoal {
  sessions: number;
  sessionsDone: number;
  minutes: number;
  minutesDone: number;
  repsDone: number;
  /** Consecutive past weeks in which the session target was met. */
  streak: number;
  message: string;
}

/** The coach's weekly target and where the trainee stands against it. */
export function weekGoal(p: Profile, now = new Date()): WeekGoal {
  const week0 = startOfWeek(now).getTime();
  const WEEK = 7 * 864e5;
  const inWeek = (k: number) => p.history.filter((h) => {
    const t = new Date(h.date).getTime();
    return t >= week0 - k * WEEK && t < week0 - (k - 1) * WEEK;
  });
  const cur = inWeek(0);
  let streak = 0;
  for (let k = 1; k < 52 && inWeek(k).length >= p.daysPerWeek; k++) streak++;
  const sessionsDone = cur.length;
  if (sessionsDone >= p.daysPerWeek) streak++;
  const left = p.daysPerWeek - sessionsDone;
  const message =
    left <= 0 ? 'Weekly goal smashed. Anything more is a bonus.'
    : sessionsDone === 0 ? `Goal this week: ${p.daysPerWeek} sessions. Let's get the first one in.`
    : `${left} more session${left > 1 ? 's' : ''} to hit this week's goal.`;
  return {
    sessions: p.daysPerWeek,
    sessionsDone,
    minutes: p.daysPerWeek * p.minutes,
    minutesDone: Math.round(cur.reduce((s, h) => s + h.minutes, 0)),
    repsDone: cur.reduce((s, h) => s + h.reps, 0),
    streak,
    message,
  };
}

export const GOALS: Record<Goal, { name: string; blurb: string }> = {
  strength: { name: 'Build strength', blurb: 'Heavier sets, longer rests, steady overload.' },
  lean: { name: 'Burn fat', blurb: 'Short rests, big movements, heart rate up.' },
  fit: { name: 'General fitness', blurb: 'A balanced mix of strength, core and cardio.' },
  mobility: { name: 'Move better', blurb: 'Lighter work, core control and long stretches.' },
};
export const LEVELS: Record<Level, string> = { 1: 'Beginner', 2: 'Intermediate', 3: 'Advanced' };
