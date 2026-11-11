'use client';
import Link from 'next/link';
import { useMemo } from 'react';
import { ex } from '@/domain/exercises';
import { GEAR, GEAR_IDS } from '@/domain/gear';
import { buildPlan } from '@/domain/planner';
import { GOALS, weekGoal } from '@/domain/profile';
import { Demo } from '@/ui/Demo';
import { Shell } from '@/ui/Shell';
import { useProfile } from '@/ui/useProfile';

export default function Home() {
  const { profile, ready } = useProfile();
  const plan = useMemo(() => buildPlan(profile), [profile]);
  const goal = weekGoal(profile);
  const main = plan.steps.filter((s) => s.role === 'main');
  const hero = (main.find((s) => ex(s.ex).gear.includes('bench')) ?? main[0])?.ex ?? 'bench_press';
  const unmapped = GEAR_IDS.filter((id) => profile.gear[id].owned && !profile.gear[id].placement);
  const pct = Math.min(1, goal.sessionsDone / goal.sessions);
  return (
    <Shell>
      <section className="hero">
        <div>
          <p className="eyebrow">Mixed-reality personal trainer</p>
          <h1>
            Your coach, <em>in your room</em>, on your gear.
          </h1>
          <p className="lede">
            Max demonstrates every move on your actual bench, counts your reps from how you move, and listens: say “I’m ready”, “I need a break” or “show me again”.
          </p>
          <div className="row">
            <Link href="/train/" className="btn primary">
              Start today’s session
            </Link>
            <Link href="/gym/" className="btn">
              Set up my gym
            </Link>
          </div>
          <p className="fine">Open this page in the Meta Quest browser for passthrough. On a laptop you get a preview.</p>
        </div>
        <div className="stagebox">
          <Demo ex={hero} className="demo" />
          <span className="chip float">{ex(hero).name}</span>
        </div>
      </section>

      <section className="grid2" style={{ visibility: ready ? 'visible' : 'hidden' }}>
        <div className="card">
          <div className="cardhead">
            <h2>Today · {plan.title}</h2>
            <span className="chip">{plan.minutes} min</span>
          </div>
          <p className="dim">{GOALS[profile.goal].blurb}</p>
          <ol className="plan">
            {plan.steps.map((s, i) => {
              const e = ex(s.ex);
              return (
                <li key={i} className={s.role}>
                  <span className="pname">{e.name}</span>
                  <span className="gearicons">{e.gear.map((g) => GEAR[g].icon).join(' ')}</span>
                  <span className="pdose">
                    {e.kind === 'reps' ? `${s.sets} × ${s.amount}` : `${s.sets > 1 ? `${s.sets} × ` : ''}${s.amount}s`}
                    {s.loadKg ? ` · ${s.loadKg} kg` : ''}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
        <div className="col">
          <div className="card goal">
            <svg viewBox="0 0 120 120" className="ring">
              <circle cx="60" cy="60" r="50" className="track" />
              <circle cx="60" cy="60" r="50" className="fill" strokeDasharray={`${pct * 314} 314`} />
              <text x="60" y="58" textAnchor="middle" className="ringbig">
                {goal.sessionsDone}/{goal.sessions}
              </text>
              <text x="60" y="78" textAnchor="middle" className="ringsmall">
                sessions
              </text>
            </svg>
            <div>
              <h2>This week’s goal</h2>
              <p>{goal.message}</p>
              <p className="dim">
                {goal.minutesDone} / {goal.minutes} active minutes · {goal.repsDone} reps · {goal.streak} week streak
              </p>
            </div>
          </div>
          {unmapped.length > 0 && (
            <div className="card note">
              <h2>Map your gym</h2>
              <p>
                In the headset, say <b>“map my gym”</b> and touch {unmapped.map((id) => GEAR[id].say).join(', ')}. Max will then demonstrate right on your equipment and guide you between stations.
              </p>
            </div>
          )}
          <div className="card">
            <h2>Talk to your coach</h2>
            <div className="says">
              {['I’m ready', 'I need a break', 'Show me again', 'Skip', 'Too easy', 'Too hard', 'How many left?', 'I’m done', 'End workout'].map((s) => (
                <span key={s}>“{s}”</span>
              ))}
            </div>
          </div>
        </div>
      </section>
    </Shell>
  );
}
