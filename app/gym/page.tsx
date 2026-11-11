'use client';
import { useState } from 'react';
import { EXERCISE_LIST } from '@/domain/exercises';
import { GEAR, GEAR_IDS } from '@/domain/gear';
import { available } from '@/domain/planner';
import { Shell } from '@/ui/Shell';
import { useProfile } from '@/ui/useProfile';

export default function Gym() {
  const { profile, update, ready } = useProfile();
  const [kg, setKg] = useState('');
  const count = EXERCISE_LIST.filter((e) => available(e, profile)).length;
  const addLoad = () => {
    const v = Number(kg.replace(',', '.'));
    if (v > 0 && v <= 100) update((p) => (p.gear.dumbbells.loads = [...new Set([...(p.gear.dumbbells.loads ?? []), v])].sort((a, b) => a - b)));
    setKg('');
  };
  return (
    <Shell>
      <h1 className="pagetitle">My gym</h1>
      <p className="lede">
        Tick what you have. Then, in the headset, say <b>“map my gym”</b> to pin each piece in your room. {count} of {EXERCISE_LIST.length} exercises unlocked.
      </p>
      <div className="gear" style={{ visibility: ready ? 'visible' : 'hidden' }}>
        {GEAR_IDS.map((id) => {
          const g = GEAR[id], item = profile.gear[id];
          return (
            <div key={id} className={`card gearcard ${item.owned ? 'own' : ''}`}>
              <button className="geartoggle" onClick={() => update((p) => (p.gear[id].owned = !p.gear[id].owned))} aria-pressed={item.owned}>
                <span className="gicon">{g.icon}</span>
                <span>
                  <b>{g.name}</b>
                  <small>{g.blurb}</small>
                </span>
                <span className={`switch ${item.owned ? 'on' : ''}`} />
              </button>
              {item.owned && (
                <div className="gearbody">
                  {id === 'bench' && (
                    <label className="check">
                      <input type="checkbox" checked={!!item.adjustable} onChange={(e) => update((p) => (p.gear.bench.adjustable = e.target.checked))} />
                      Backrest adjusts (incline and upright exercises)
                    </label>
                  )}
                  {id === 'dumbbells' && (
                    <div>
                      <div className="chips">
                        {(item.loads ?? []).map((l) => (
                          <button key={l} className="chip x" onClick={() => update((p) => (p.gear.dumbbells.loads = p.gear.dumbbells.loads?.filter((v) => v !== l)))} title="Remove">
                            {l} kg ✕
                          </button>
                        ))}
                      </div>
                      <div className="row">
                        <input className="input" inputMode="decimal" placeholder="Add weight (kg)" value={kg} onChange={(e) => setKg(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addLoad()} />
                        <button className="btn small" onClick={addLoad}>
                          Add
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="mapstate">
                    {item.placement ? (
                      <>
                        <span className="ok">● Pinned in your room</span>
                        <button className="link" onClick={() => update((p) => delete p.gear[id].placement)}>
                          Clear
                        </button>
                      </>
                    ) : (
                      <span className="dim">○ Not pinned yet — the coach will bring a virtual one</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Shell>
  );
}
