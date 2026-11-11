'use client';
import { useState } from 'react';
import { EXERCISE_LIST, ex } from '@/domain/exercises';
import { GEAR } from '@/domain/gear';
import { available } from '@/domain/planner';
import type { GearId } from '@/domain/types';
import { Demo } from '@/ui/Demo';
import { Shell } from '@/ui/Shell';
import { useProfile } from '@/ui/useProfile';

const FILTERS: [string, GearId | 'body' | 'all'][] = [['All', 'all'], ['Bench', 'bench'], ['Dumbbells', 'dumbbells'], ['Pull-up bar', 'pullup_bar'], ['Mat', 'mat'], ['Bodyweight', 'body']];

export default function Library() {
  const { profile } = useProfile();
  const [id, setId] = useState('bench_press');
  const [filter, setFilter] = useState<GearId | 'body' | 'all'>('all');
  const e = ex(id);
  const list = EXERCISE_LIST.filter((x) => filter === 'all' || (filter === 'body' ? x.gear.length === 0 : x.gear.includes(filter)));
  return (
    <Shell>
      <h1 className="pagetitle">Exercises</h1>
      <div className="library">
        <div className="card viewer">
          <Demo ex={id} className="demo tall" />
          <div className="cardhead">
            <h2>{e.name}</h2>
            <span className="chip">{e.gear.length ? e.gear.map((g) => GEAR[g].name.replace('Adjustable b', 'B')).join(' + ') : 'Bodyweight'}</span>
          </div>
          {e.bench !== undefined && <p className="dim">Backrest: {e.bench === 0 ? 'flat' : `${e.bench}°`}</p>}
          <p>{e.how}</p>
          <ul className="tips">
            {e.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p className="fine">{e.detect.by === 'motion' ? 'Reps are counted from your movement.' : e.kind === 'reps' ? 'The coach sets the pace and counts for you.' : e.hold ? 'The clock only runs while you hold the position.' : 'Timed.'}</p>
        </div>
        <div>
          <div className="chips">
            {FILTERS.map(([label, f]) => (
              <button key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
                {label}
              </button>
            ))}
          </div>
          <div className="exlist">
            {list.map((x) => (
              <button key={x.id} className={`${x.id === id ? 'on' : ''} ${available(x, profile) ? '' : 'locked'}`} onClick={() => setId(x.id)}>
                <b>{x.name}</b>
                <small>
                  {x.group} · {x.role === 'main' ? ['', 'easy', 'medium', 'hard'][x.level] : x.role}
                </small>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  );
}
