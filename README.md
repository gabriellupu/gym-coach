# Gym Coach

A mixed-reality fitness instructor that runs in the **Meta Quest browser** (WebXR, no install). You tell it what equipment you own, pin that equipment in your own room, and a human coach demonstrates every exercise **on your actual bench / under your actual pull-up bar** in passthrough, then counts your reps from how you move and talks you through the session.

V1 covers an **adjustable bench** (the centrepiece), **dumbbells**, a **mat**, a **pull-up bar** and bodyweight work: 42 exercises.

| | |
| --- | --- |
| **Your gym** | Tick your gear on the web page (dumbbell weights, whether the backrest adjusts). In the headset say *"map my gym"*: touch each end of the bench top and pinch (or say *"here"*), same for the bar and the mat. Two points give position, direction, length and height. Everything hangs off one WebXR persistent anchor, so it is still there next session. |
| **The coach** | A skinned human character posed procedurally with IK, not canned clips, so his hands and feet land exactly on the mapped bench, bar and floor at whatever size they really are. He demonstrates on the equipment, then steps aside to spot you. Unmapped gear? He brings a virtual one. |
| **The board** | A floating panel with a looping **stickman** animation of the current move, the rep count / timer, a live range-of-motion gauge, captions and buttons. It stands beside the coach, and drifts into view when you are lying on the bench or the floor. |
| **Rep counting** | Reps are read from head and hand tracking (squat depth, press height, pull-up height…), scaled to your standing height. Half reps do not count; shallow or rushed reps get a form cue. Moves the headset cannot see (hip thrust, leg raises) are paced by the coach's count, as is any set where your hands drop out of tracking. Holds only run the clock while you are in position. |
| **Voice** | *"I'm ready"*, *"I need a break"*, *"skip"*, *"show me again"*, *"too easy / too hard"*, *"how many left"*, *"I'm done"*, *"end workout"*, *"start workout"*, *"map my gym"*. Recognised **on the headset** (Vosk WASM, grammar-constrained), because the Quest browser has no speech recognition; nothing you say is uploaded. Every command is also a button on the board (point and pinch, or poke). |
| **Goals** | Pick a goal, level, session length and days per week. The coach sets a weekly target, builds each session from the gear you have (bench first), and applies progressive overload: a rep more each time, then the next dumbbell up. |

## Run

```bash
npm install
```

```bash
npm run dev          # http://localhost:3000 — desktop preview with a simulated trainee
```

```bash
npm run dev:https    # self-signed HTTPS so a Quest on your LAN can enter XR
```

```bash
npm run build        # static site in out/
```

`dev` and `build` first fetch the speech runtime and its 40 MB model into `public/` (git-ignored; see `scripts/fetch-ears.mjs`). Pushing to `main` deploys to GitHub Pages via `.github/workflows/pages.yml` (enable Pages → "GitHub Actions"). Open the URL in the Quest browser, go to **Train**, and choose **Enter mixed reality**.

Desktop preview keys: `Enter` start · `R` ready · `B` break · `S` skip · `D` done · `W` show me · `M` map · `E` end.

## Status: what has and has not been verified

Verified here, in headless Chromium:

- `npm test`: rep counter against simulated motion for every motion-tracked exercise, planner, full scripted sessions, mapping wizard, intent matching.
- A whole passthrough session in Meta's WebXR emulator (IWER): `immersive-ar` entry, persistent anchor, mapping by pinch, station guidance, reps counted from emulated headset/hand motion (`tests/e2e/xr-emulated.cjs`).
- Voice commands end to end with synthesized speech fed to a fake microphone.
- All 42 poses rendered and checked by eye on both the human and the stickman (`/sheet`, `/sheet?human`).

**Not yet tried on a physical Quest.** The real unknowns: hand tracking while gripping dumbbells (the fallback is the coach pacing the set), recognition accuracy and false triggers with real room noise, recogniser load time on the headset, and how the detection thresholds feel on real bodies.

## Architecture

```
app/                  Next.js pages (static export): Today, My gym, Goals, Exercises, Train
src/domain/           gear catalog, exercise library, planner, profile + weekly goal (localStorage)
src/motion/           body signals, rep counter, hold watcher, simulated trainee
src/coach/
  lines.ts            everything the coach can say
  voice.ts            clip playback (sprite + on-demand clips), captions, beeps
  ears.ts, intents.ts offline command recognition → intents
  script.ts           coroutine engine: "say this, wait for that", with skip / break / end
  workout.ts          the session director
  mapping.ts          the gym-mapping wizard
src/avatar/
  rig.ts              pose description + two-bone IK → joint positions
  anims.ts            every exercise as keyframed poses, parametrised by the real bench / bar size
  human.ts            drives the skinned coach's skeleton from the solved joints
  figure.ts           animation state; stickman renderer
  demo.ts, props.ts   the on-board mini studio, bench / bar / mat models
src/xr/
  studio.ts           renderer, WebXR session, tracking, anchors, input, coach placement
  stations.ts         mapped equipment frames, markers, floor path
  board.ts            the floating panel
```

**Voice-to-voice later.** `Ears` (speech → intents) and `Mouth` (lines → speech) are interfaces. A realtime voice model can replace both and call `Studio.intent()` as its tool; that needs a small backend (NestJS) to mint session tokens, which is why there is no backend yet.

**Adding an exercise:** an entry in `src/domain/exercises.ts` (gear, detection signal, spoken instructions) and a pose function in `src/avatar/anims.ts`; check it at `/sheet?ids=<id>&human`, then re-run `npm run build:voice`.

## Assets

- Coach: Mixamo character "Bryce" (free to use in projects; not redistributable as a standalone asset). Rebuild with `scripts/build-coach.mjs`.
- Voice: Piper `en_US-joe-medium` (CC0 dataset). Rebuild with `npm run build:voice -- <model.onnx>`.
- Speech recognition: Vosk `vosk-model-small-en-us-0.15` (Apache-2.0) via `vosk-browser`.
