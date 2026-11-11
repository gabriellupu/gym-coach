'use client';
import { GOALS, LEVELS, weekGoal } from '@/domain/profile';
import type { Goal, Level } from '@/domain/types';
import { Shell } from '@/ui/Shell';
import { useProfile } from '@/ui/useProfile';

function Pick<T extends string | number>({ value, options, onPick }: { value: T; options: [T, string, string?][]; onPick: (v: T) => void }) {
  return (
    <div className="pick">
      {options.map(([v, label, sub]) => (
        <button key={String(v)} className={v === value ? 'on' : ''} onClick={() => onPick(v)}>
          <b>{label}</b>
          {sub && <small>{sub}</small>}
        </button>
      ))}
    </div>
  );
}

export default function Goals() {
  const { profile, update, ready } = useProfile();
  const g = weekGoal(profile);
  return (
    <Shell>
      <h1 className="pagetitle">Goals</h1>
      <p className="lede">Tell Max what you’re training for. He sets the weekly target, builds each session and nudges the load up as you get stronger.</p>
      <div className="col" style={{ visibility: ready ? 'visible' : 'hidden' }}>
        <div className="card">
          <h2>What are you training for?</h2>
          <Pick value={profile.goal} options={(Object.keys(GOALS) as Goal[]).map((k) => [k, GOALS[k].name, GOALS[k].blurb])} onPick={(v) => update((p) => (p.goal = v))} />
        </div>
        <div className="grid2">
          <div className="card">
            <h2>Experience</h2>
            <Pick value={profile.level} options={([1, 2, 3] as Level[]).map((l) => [l, LEVELS[l]])} onPick={(v) => update((p) => (p.level = v))} />
          </div>
          <div className="card">
            <h2>Session length</h2>
            <Pick value={profile.minutes} options={[15, 20, 30, 45].map((m) => [m, `${m} min`])} onPick={(v) => update((p) => (p.minutes = v))} />
          </div>
          <div className="card">
            <h2>Days per week</h2>
            <Pick value={profile.daysPerWeek} options={[2, 3, 4, 5, 6].map((d) => [d, String(d)])} onPick={(v) => update((p) => (p.daysPerWeek = v))} />
            <p className="dim">
              Weekly target: {g.sessions} sessions · {g.minutes} active minutes
            </p>
          </div>
          <div className="card">
            <h2>About you</h2>
            <div className="row">
              <input className="input" placeholder="First name" value={profile.name} onChange={(e) => update((p) => (p.name = e.target.value.slice(0, 20)))} />
              <input className="input" type="number" min={30} max={200} value={profile.weightKg} onChange={(e) => update((p) => (p.weightKg = Number(e.target.value) || 75))} />
              <span className="dim">kg</span>
            </div>
            <label className="check">
              <input type="checkbox" checked={profile.settings.voice} onChange={(e) => update((p) => (p.settings.voice = e.target.checked))} /> Coach speaks out loud
            </label>
            <label className="check">
              <input type="checkbox" checked={profile.settings.mic} onChange={(e) => update((p) => (p.settings.mic = e.target.checked))} /> Listen for my voice (processed on the headset, never uploaded)
            </label>
          </div>
        </div>
        {profile.history.length > 0 && (
          <div className="card">
            <h2>History</h2>
            <ol className="plan">
              {profile.history.slice(-8).reverse().map((h, i) => (
                <li key={i}>
                  <span className="pname">{new Date(h.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  <span className="pdose">
                    {h.minutes} min · {h.reps} reps · {h.kcal} kcal{h.completed ? '' : ' · ended early'}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </Shell>
  );
}
