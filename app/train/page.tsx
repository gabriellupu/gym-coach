'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { preloadEars } from '@/coach/ears';
import { loadProfile } from '@/domain/profile';
import type { Mode, Studio } from '@/xr/studio';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export default function Train() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const studio = useRef<Studio | null>(null);
  const [support, setSupport] = useState({ mr: false, vr: false, checked: false });
  const [mode, setMode] = useState<Mode | null>(null);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [ears, setEars] = useState<'loading' | 'ready' | 'off'>('loading');

  useEffect(() => {
    let dead = false;
    const profile = loadProfile();
    void import('@/xr/studio').then(({ Studio }) => {
      if (dead || !canvas.current) return;
      const s = new Studio(canvas.current, profile, BASE);
      s.onExit = () => setMode(null);
      studio.current = s;
      (window as unknown as { __studio: Studio }).__studio = s;
      setLoaded(true);
    });
    const xr = navigator.xr;
    void Promise.all([xr?.isSessionSupported('immersive-ar').catch(() => false), xr?.isSessionSupported('immersive-vr').catch(() => false)]).then(([mr, vr]) => !dead && setSupport({ mr: !!mr, vr: !!vr, checked: true }));
    // Fetch the on-device speech model while the trainee is still reading this page.
    if (profile.settings.mic) preloadEars(BASE).then(() => !dead && setEars('ready'), () => !dead && setEars('off'));
    else setEars('off');
    return () => {
      dead = true;
      studio.current?.dispose();
      studio.current = null;
    };
  }, []);

  const enter = async (m: Mode) => {
    setError('');
    if (!studio.current) return;
    try {
      await studio.current.enter(m);
      setMode(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="train">
      <canvas ref={canvas} className="xr" />
      {mode === null && (
        <div className="gate">
          <div className="card gatecard">
            <p className="eyebrow">Gym Coach</p>
            <h1>Ready to train?</h1>
            <p className="lede">Clear a little space, put the headset on, and allow the microphone so you can talk to Max.</p>
            <div className="col">
              <button className="btn primary big" disabled={!support.mr || !loaded} onClick={() => enter('mr')}>
                Enter mixed reality
                <small>{support.mr ? 'Passthrough — train on your real equipment' : support.checked ? 'Needs a passthrough headset (Meta Quest browser)' : 'Checking…'}</small>
              </button>
              <button className="btn big" disabled={!support.vr || !loaded} onClick={() => enter('vr')}>
                Enter VR
                <small>{support.vr ? 'A virtual studio' : 'Needs a VR headset'}</small>
              </button>
              <button className="btn big" disabled={!loaded} onClick={() => enter('preview')}>
                Preview on this screen
                <small>A simulated trainee runs the session. Keys: R ready · B break · S skip · E end</small>
              </button>
            </div>
            {error && <p className="err">{error}</p>}
            <p className="fine">
              Voice commands: {ears === 'ready' ? 'on-device recogniser ready' : ears === 'loading' ? 'downloading on-device recogniser (45 MB, once)…' : 'off — use the buttons on the board'}
            </p>
            <Link href="/" className="link">
              ← Back
            </Link>
          </div>
        </div>
      )}
      {mode === 'preview' && (
        <button className="btn small leave" onClick={() => studio.current?.exit()}>
          Exit preview
        </button>
      )}
    </div>
  );
}
