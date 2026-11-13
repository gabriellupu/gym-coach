import { EXERCISE_LIST, ex } from './exercises';
import type { ExRecord, Profile } from './profile';
import type { Exercise, GearId, Goal, Group, Plan, Step } from './types';

function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353), (h = (h << 13) | (h >>> 19));
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const SLOTS: Record<Goal, Group[]> = {
  strength: ['push', 'pull', 'legs', 'push', 'pull', 'legs', 'core', 'push', 'pull'],
  lean: ['legs', 'push', 'cardio', 'pull', 'core', 'legs', 'cardio', 'push', 'core'],
  fit: ['push', 'legs', 'pull', 'core', 'push', 'legs', 'pull', 'cardio', 'core'],
  mobility: ['legs', 'core', 'pull', 'core', 'legs', 'push'],
};
const SHAPE: Record<Goal, { sets: [number, number, number]; rest: number; focus: string }> = {
  strength: { sets: [3, 3, 4], rest: 75, focus: 'Strength' },
  lean: { sets: [2, 3, 3], rest: 35, focus: 'Fat burn' },
  fit: { sets: [2, 3, 3], rest: 45, focus: 'Full body' },
  mobility: { sets: [2, 2, 2], rest: 30, focus: 'Mobility & core' },
};

/** Can this trainee do this move? `headset` also drops moves that are miserable in a headset. */
export function available(e: Exercise, p: Profile, headset = false): boolean {
  if (headset && e.noHeadset) return false;
  if (!e.gear.every((g) => p.gear[g]?.owned)) return false;
  if (e.bench && !p.gear.bench.adjustable) return false;
  return true;
}

/** Which mapped spot a move happens at. */
export function stationOf(e: Exercise): GearId | null {
  if (e.gear.includes('bench')) return 'bench';
  if (e.gear.includes('pullup_bar')) return 'pullup_bar';
  if (e.gear.includes('mat')) return 'mat';
  return null;
}

export function pickLoad(e: Exercise, loads: number[] | undefined, rec?: ExRecord): number | undefined {
  if (!e.load || !loads?.length) return undefined;
  const sorted = [...loads].sort((a, b) => a - b);
  if (rec?.loadKg !== undefined && sorted.includes(rec.loadKg)) return rec.loadKg;
  const q = { light: 0.2, medium: 0.5, heavy: 0.8 }[e.load];
  return sorted[Math.min(sorted.length - 1, Math.round(q * (sorted.length - 1)))];
}

/** Seconds a step takes including the demo, sets and rests. */
export function stepSeconds(s: Step): number {
  const e = ex(s.ex);
  const work = e.kind === 'reps' ? s.amount * e.tempo * (e.perSide ? 2 : 1) : s.amount;
  return (s.role === 'main' ? 30 : 12) + s.sets * (work + 8) + (s.sets - 1) * s.rest;
}

function dose(e: Exercise, p: Profile): { amount: number; loadKg?: number } {
  const rec = p.records[e.id];
  const base = e.dose[p.level - 1];
  let loadKg = pickLoad(e, p.gear.dumbbells.loads, rec);
  if (!rec) return { amount: base, loadKg };
  let amount = rec.amount;
  const cap = e.dose[2] + (e.kind === 'reps' ? 3 : 15);
  if (rec.feel < 0) amount = Math.max(e.kind === 'reps' ? 4 : 10, Math.round(amount * 0.85));
  else {
    // Progressive overload: a little more each time; once the reps top out, go heavier.
    amount += e.kind === 'reps' ? (rec.feel > 0 ? 2 : 1) : rec.feel > 0 ? 10 : 5;
    if (amount > cap) {
      const loads = [...(p.gear.dumbbells.loads ?? [])].sort((a, b) => a - b);
      const next = loadKg !== undefined ? loads.find((l) => l > loadKg!) : undefined;
      if (next !== undefined) (loadKg = next), (amount = e.dose[0]);
      else amount = cap;
    }
  }
  return { amount, loadKg };
}

const STATION_ORDER = ['pullup_bar', 'bench', 'dumbbells', 'mat', 'none'];

export function buildPlan(p: Profile, now = new Date(), opts: { headset?: boolean } = {}): Plan {
  const rand = rng(`${now.toISOString().slice(0, 10)}:${p.history.length}:${p.goal}`);
  const pool = EXERCISE_LIST.filter((e) => available(e, p, opts.headset));
  const last = new Set(p.history.at(-1)?.sets.map((s) => s.ex) ?? []);
  const shape = SHAPE[p.goal];
  const sets = shape.sets[p.level - 1];
  const mk = (e: Exercise, role: Step['role'], n: number, rest: number): Step => ({ ex: e.id, sets: n, rest, role, ...dose(e, p) });
  const pickRole = (role: Step['role'], n: number) =>
    pool.filter((e) => e.role === role).map((e) => ({ e, s: rand() - (last.has(e.id) ? 0.4 : 0) })).sort((a, b) => b.s - a.s).slice(0, n).map((x) => x.e);

  const warm = pickRole('warmup', p.minutes >= 25 ? 3 : 2).map((e) => mk(e, 'warmup', 1, 10));
  const cool = pickRole('cooldown', p.minutes >= 25 ? 3 : 2).map((e) => mk(e, 'cooldown', 1, 5));
  let budget = p.minutes * 60 - [...warm, ...cool].reduce((s, x) => s + stepSeconds(x), 0) - 40;

  const main: Step[] = [];
  const used = new Set<string>();
  for (const group of SLOTS[p.goal]) {
    const cands = pool.filter((e) => e.role === 'main' && e.group === group && !used.has(e.id) && e.level <= p.level + 1 && (p.goal !== 'mobility' || e.level === 1));
    if (!cands.length) continue;
    // The bench comes first: it's the centrepiece of this gym.
    const score = (e: Exercise) =>
      rand() * 2.2 + (e.gear.includes('bench') ? 2 : 0) + (e.gear.includes('dumbbells') ? 1 : 0) + (e.gear.includes('pullup_bar') ? 1.4 : 0) -
      (last.has(e.id) ? 2 : 0) - Math.abs(e.level - p.level) * 0.5;
    const e = cands.map((c) => ({ c, s: score(c) })).sort((a, b) => b.s - a.s)[0].c;
    const step = mk(e, 'main', sets, e.kind === 'reps' ? shape.rest : Math.min(shape.rest, 40));
    const cost = stepSeconds(step);
    if (cost > budget) {
      if (main.length >= 2) break;
      step.sets = Math.max(1, step.sets - 1);
    }
    budget -= stepSeconds(step);
    main.push(step);
    used.add(e.id);
    if (budget < 90) break;
  }
  // Walk the room once: bar, then bench (fewest backrest changes), then free weights, then the floor.
  const key = (s: Step) => {
    const e = ex(s.ex);
    const st = stationOf(e) === 'mat' ? 'mat' : stationOf(e) ?? (e.gear.includes('dumbbells') ? 'dumbbells' : 'none');
    return STATION_ORDER.indexOf(st) * 100 + (e.bench ?? 0);
  };
  main.sort((a, b) => key(a) - key(b));

  const steps = [...warm, ...main, ...cool];
  const benchy = main.filter((s) => ex(s.ex).gear.includes('bench')).length;
  const title = `${benchy >= main.length / 2 && benchy ? 'Bench ' : ''}${shape.focus}`;
  return { title, focus: shape.focus, steps, minutes: Math.round(steps.reduce((s, x) => s + stepSeconds(x), 0) / 60) };
}

/** kcal for `seconds` of work at an exercise's MET. */
export const kcal = (met: number, weightKg: number, seconds: number) => (met * 3.5 * weightKg * (seconds / 60)) / 200;
