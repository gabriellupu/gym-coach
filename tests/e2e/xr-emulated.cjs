/**
 * Drives a whole mixed-reality session in Meta's WebXR emulator (IWER) inside headless Chromium:
 * enter passthrough, map the gym by pinching, then train with a scripted "trainee" who moves
 * the emulated headset and hands the way the exercise demands, so reps are counted from motion.
 *
 *   npm run dev -- -p 3111 &   then   node tests/e2e/xr-emulated.cjs [outDir] [maxSeconds]
 * Needs Playwright with Chromium available to `require`.
 */
const { chromium } = require('playwright');
const path = require('node:path');
const out = process.argv[2] ?? '.';
const maxSeconds = Number(process.argv[3] ?? 240);
const URL = process.env.APP_URL ?? 'http://localhost:3111';

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 1280 } });
  const errors = [];
  p.on('pageerror', (e) => (errors.push(e.message), console.log('PAGEERROR', e.message)));
  p.on('console', (m) => m.type() === 'error' && !/404|mic/i.test(m.text()) && console.log('ERR', m.text().slice(0, 240)));
  await p.addInitScript({ path: path.resolve(__dirname, '../../node_modules/iwer/build/iwer.min.js') });
  await p.addInitScript(() => {
    const d = new IWER.XRDevice(IWER.metaQuest3, { stereoEnabled: false });
    d.installRuntime({ forceInstall: true });
    d.primaryInputMode = 'hand';
    d.position.set(0, 1.62, 0);
    window.xrd = d;
  });
  await p.goto(`${URL}/train/?capture`);
  await p.getByRole('button', { name: /Enter mixed reality/ }).click({ timeout: 30000 });
  await p.waitForFunction(() => window.__studio?.debug.view?.mode === 'hub' && window.__studio.mode === 'mr', null, { timeout: 15000 }).catch(async (e) => { console.log('gate says:', await p.locator('.err').allTextContents(), await p.evaluate(() => window.__studio?.mode)); throw e; });
  await p.waitForTimeout(1500);
  const dbg = () => p.evaluate(() => { const d = window.__studio.debug; return { mode: d.view?.mode, title: d.view?.title, sub: d.view?.sub, big: d.view?.big, ex: d.view?.ex, anchor: d.anchor, cap: d.captions.at(-1) }; });
  console.log('hub', JSON.stringify(await dbg()));
  await p.screenshot({ path: `${out}/xr-hub.png` });

  // ── Map the gym: touch + pinch each point the wizard asks for ──
  const pinchAt = async (x, y, z) => {
    await p.evaluate(([x, y, z]) => { const h = window.xrd.hands.right; h.position.set(x, y, z); }, [x, y, z]);
    await p.waitForTimeout(250);
    await p.evaluate(() => window.xrd.hands.right.updatePinchValue(1));
    await p.waitForTimeout(250);
    await p.evaluate(() => window.xrd.hands.right.updatePinchValue(0));
    await p.waitForTimeout(250);
  };
  await p.evaluate(() => window.__studio.intent('map'));
  await p.waitForFunction(() => window.__studio.debug.view?.mode === 'mapping');
  const points = {
    'bench': [[-1.2, 0.46, -2.1], [-1.2, 0.46, -0.9]],
    'Dumbbells': [[-0.4, 0.3, -2.6]],
    'mat': [[0.6, 0.02, -2.6], [0.6, 0.02, -0.9]],
    'Pull-up bar': [[1.3, 2.15, -2.4], [2.2, 2.15, -2.4]],
  };
  for (let i = 0; i < 80; i++) {
    const s = await dbg();
    if (s.mode !== 'mapping') break;
    const key = Object.keys(points).find((k) => s.title.includes(k));
    if (key && /Touch/.test(s.sub ?? '')) {
      const idx = s.big?.startsWith('2') ? 1 : 0;
      await pinchAt(...points[key][idx]);
      if (key === 'bench' && idx === 1) await p.waitForTimeout(400), await p.screenshot({ path: `${out}/xr-mapping.png` });
    }
    await p.waitForTimeout(500);
  }
  const gear = await p.evaluate(() => JSON.parse(localStorage.getItem('gym-coach:v1')).gear);
  console.log('mapped', JSON.stringify(Object.fromEntries(Object.entries(gear).map(([k, v]) => [k, v.placement]))));
  console.log('after mapping', JSON.stringify(await dbg()));
  if (!gear.bench.placement || !gear.pullup_bar.placement) throw new Error('mapping failed');

  // ── Train: a robot trainee moves the emulated headset and hands through each rep ──
  await p.evaluate(() => {
    let t = 0;
    setInterval(() => {
      const s = window.__studio, v = s.debug.view;
      if (v?.mode === 'mapping') return; // hands are busy pinching
      const tempo = { work: 2.2 }[v?.mode] ?? 0;
      t = tempo ? t + 0.03 / tempo : 0;
      const body = s.simulate(t);
      // Walk to wherever the coach sends us.
      const goal = window.__walk;
      if (goal) { const d = window.xrd.position; d.x += (goal[0] - d.x) * 0.06; d.z += (goal[1] - d.z) * 0.06; }
      window.xrd.position.y = body.head.y;
      window.xrd.hands.left.position.set(body.left.x, body.left.y, body.left.z);
      window.xrd.hands.right.position.set(body.right.x, body.right.y, body.right.z);
    }, 30);
  });
  await p.evaluate(() => window.__studio.intent('start'));
  const seen = new Set();
  const t0 = Date.now();
  let reps = 0;
  while ((Date.now() - t0) / 1000 < maxSeconds) {
    await p.waitForTimeout(700);
    const s = await dbg();
    if (s.mode === 'ready') await p.evaluate(() => window.__studio.intent('ready'));
    if (s.mode === 'goto') await p.evaluate((t) => (window.__walk = /bench/.test(t) ? [-0.3, -1.4] : /bar/.test(t) ? [1.7, -1.3] : [0.6, -0.4]), s.title);
    if (s.mode === 'work' && s.big) reps = Math.max(reps, 0);
    const key = `${s.mode}:${s.ex ?? s.title}`;
    if (!seen.has(key)) {
      seen.add(key);
      console.log(Math.round((Date.now() - t0) / 1000), JSON.stringify(s));
      if (['goto', 'demo', 'work', 'rest', 'summary'].includes(s.mode)) {
        if (s.mode === 'work' || s.mode === 'demo') await p.waitForTimeout(2600);
        await p.screenshot({ path: `${out}/xr-${s.mode}-${s.ex ?? 'x'}.png` });
      }
    }
    // Once, mid-set: the mapping has "drifted" — re-map without losing the workout.
    if (s.mode === 'work' && !seen.has('remap')) {
      seen.add('remap');
      await p.evaluate(() => window.__studio.intent('map'));
      await p.waitForFunction(() => window.__studio.debug.view?.mode === 'mapping');
      console.log('remap started', JSON.stringify(await dbg()));
      for (let i = 0; i < 80; i++) {
        const m = await dbg();
        if (m.mode !== 'mapping') break;
        const key = Object.keys(points).find((k) => m.title.includes(k));
        if (key && /Touch/.test(m.sub ?? '')) await pinchAt(...points[key][m.big?.startsWith('2') ? 1 : 0].map((v, i) => v + (i === 0 ? 0.3 : 0)));
        await p.waitForTimeout(500);
      }
      const after = await dbg();
      console.log('remap done, workout resumed at', JSON.stringify(after));
      if (after.mode === 'mapping' || after.title !== s.title) throw new Error('workout did not resume after re-map');
      const moved = await p.evaluate(() => JSON.parse(localStorage.getItem('gym-coach:v1')).gear.bench.placement.a[0]);
      console.log('bench x after re-map', moved.toFixed(2));
    }
    if (s.mode === 'summary') break;
    // Keep the run short: once a main set has been seen through, skip ahead.
    if (process.env.FAST && s.mode === 'rest') await p.evaluate(() => window.__studio.intent('skip'));
  }
  console.log('final', JSON.stringify(await dbg()));
  await b.close();
  if (errors.length) process.exit(1);
})();
