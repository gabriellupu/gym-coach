import { GEAR } from '../domain/gear';
import type { GearId } from '../domain/types';
import type { V3 } from '../motion/body';
import type { Intent } from './intents';
import { End, Script, Skip, type Co, type Stage } from './script';

/** Plausible distance between the two pinned points, metres. */
const SPAN: Record<GearId, [number, number]> = { bench: [0.6, 2.2], mat: [0.8, 2.6], pullup_bar: [0.35, 2.5], dumbbells: [0, 0] };

/**
 * Walks the trainee round their own room pinning each piece of equipment:
 * touch it and pinch (or say "here"). Two points per item give its position,
 * direction, length and height, so the coach can lie on the real bench and
 * hang from the real bar.
 */
export class Mapping extends Script {
  private point: V3 | null = null;

  constructor(
    stage: Stage,
    private gear: GearId[],
    /** Lines to open and close with; a mid-workout re-map uses shorter ones. */
    private say: { intro: string; outro: string } = { intro: 'mapintro', outro: 'mapdone' },
  ) {
    super(stage);
  }

  onIntent(i: Intent) {
    if (i === 'place') {
      const p = this.stage.pointer();
      if (p) this.point = p;
    } else if (i === 'skip') this.interrupt(new Skip());
    else if (i === 'stop' || i === 'done') this.interrupt(new End());
  }

  onPoint(p: V3) {
    this.point = p;
  }

  private *pin(gear: GearId, which: 'a' | 'b', n: number): Co<V3> {
    const g = GEAR[gear];
    this.point = null;
    this.stage.show({
      mode: 'mapping',
      title: `${g.icon}  ${g.name}`,
      sub: `Touch ${which === 'a' ? g.pinA : g.pinB}`,
      big: g.pinB ? `${which === 'a' ? 1 : 2} / 2` : '',
      hint: 'Then pinch — or say “here”',
      step: [n + 1, this.gear.length],
      buttons: ['skip', 'done'],
    });
    // Ignore a stray second pinch from the previous point.
    yield* this.sleep(0.7);
    this.point = null;
    yield* this.until(() => this.point !== null);
    this.stage.beep('place');
    return this.point!;
  }

  protected *run(): Co {
    try {
      this.stage.coach({ do: 'idle' });
      this.stage.show({ mode: 'mapping', title: 'Map your gym', sub: 'Show the coach where everything is', buttons: ['skip', 'done'] });
      try {
        yield* this.speak(this.say.intro);
      } catch (e) {
        if (!(e instanceof Skip)) throw e;
        this.stage.hush();
      }
      for (let n = 0; n < this.gear.length; n++) {
        const gear = this.gear[n];
        try {
          for (;;) {
            this.stage.say(`pin-${gear}-a`, { mode: 'cut' });
            const a = yield* this.pin(gear, 'a', n);
            let b = a;
            if (GEAR[gear].pinB) {
              this.stage.say(['mapsecond', `pin-${gear}-b`], { mode: 'cut' });
              b = yield* this.pin(gear, 'b', n);
              const d = Math.hypot(a.x - b.x, a.z - b.z);
              if (d < SPAN[gear][0] || d > SPAN[gear][1]) {
                this.stage.say('mapbad', { mode: 'cut' });
                yield* this.sleep(2);
                continue;
              }
            }
            this.stage.place(gear, { a: [a.x, a.y, a.z], b: [b.x, b.y, b.z] });
            yield* this.speak('mapplaced', { mode: 'cut' });
            break;
          }
        } catch (e) {
          if (!(e instanceof Skip)) throw e;
          this.stage.say('mapskip', { mode: 'cut' });
        }
      }
      this.stage.celebrate();
      yield* this.speak(this.say.outro);
    } catch (e) {
      if (!(e instanceof End)) throw e;
      this.stage.hush();
    }
  }
}
