import type { GearId } from './types';

export interface GearSpec {
  id: GearId;
  name: string;
  /** How the coach refers to it: "Head over to {say}". */
  say: string;
  icon: string;
  blurb: string;
  /** What the two pinned points are. */
  pinA: string;
  pinB: string;
  color: number;
}

export const GEAR: Record<GearId, GearSpec> = {
  bench: {
    id: 'bench',
    name: 'Adjustable bench',
    say: 'your bench',
    icon: '🛋️',
    blurb: 'Flat, incline and upright work. The coach demonstrates right on it.',
    pinA: 'the head end of the bench top',
    pinB: 'the foot end of the bench top',
    color: 0x4de2c5,
  },
  dumbbells: {
    id: 'dumbbells',
    name: 'Dumbbells',
    say: 'your dumbbells',
    icon: '🏋️',
    blurb: 'Tell the coach which weights you have and he picks the pair.',
    pinA: 'where your dumbbells are kept',
    pinB: '',
    color: 0xffb454,
  },
  mat: {
    id: 'mat',
    name: 'Exercise mat',
    say: 'your mat',
    icon: '🧘',
    blurb: 'Floor work, core and stretching.',
    pinA: 'one short end of the mat',
    pinB: 'the other short end of the mat',
    color: 0x7aa8ff,
  },
  pullup_bar: {
    id: 'pullup_bar',
    name: 'Pull-up bar',
    say: 'your pull-up bar',
    icon: '🪜',
    blurb: 'Pull-ups, chin-ups, hangs and knee raises.',
    pinA: 'the left end of the bar',
    pinB: 'the right end of the bar',
    color: 0xff7a9c,
  },
};

export const GEAR_IDS = Object.keys(GEAR) as GearId[];

/** Default real-world sizes used until (or instead of) mapping. */
export const BENCH = { length: 1.25, height: 0.45, width: 0.28, seat: 0.36 };
export const BAR = { height: 2.2, width: 1.0 };
export const MAT = { length: 1.8, width: 0.62 };
