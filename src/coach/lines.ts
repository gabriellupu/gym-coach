import { EXERCISE_LIST } from '../domain/exercises';
import { GEAR, GEAR_IDS } from '../domain/gear';

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
export const numberWord = (n: number): string => (n < 20 ? WORDS[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + WORDS[n % 10] : ''));
export const MAX_NUMBER = 90;
export const MAX_COUNT = 50;

/** Variant groups: `pick('praise')` chooses one of praise1..n. */
const GROUPS: Record<string, string[]> = {
  hello: ['Welcome back. Good to see you.', "Hey, you showed up. That's the hardest part done.", "Good to have you back. Let's get to work."],
  praise: ['Nice.', 'Good rep.', "That's it.", 'Strong.', 'Beautiful.', 'Looking good.', 'Smooth.', 'Yes. Just like that.'],
  push: ["Come on, you've got this.", 'Keep it moving.', "Don't stop now.", 'Stay with me.', 'Dig in.', 'You are stronger than you think.', 'Breathe, and go again.', 'This is where it counts.'],
  setdone: ["And rest. That's the set.", 'Done. Good set.', 'Set complete. Nice work.', "That's it. Shake it out."],
  yourturn: ["Your turn. Say, I'm ready, when you're set.", "Now you. Get in position, and tell me when you're ready.", "Over to you. Say ready when you're set."],
  readynudge: ["Take your time. Say ready when you're set.", "Whenever you're ready, just say so.", "No rush. Tell me when you're ready."],
  finish: ["That's the session. Awesome work today.", 'And we are done. You should be proud of that.', 'Session complete. That was strong.'],
  resttip: ['Shake it out and breathe.', 'Grab some water if you need it.', 'Slow breaths. In through the nose.', 'Relax your shoulders.'],
  arrived: ['Perfect.', 'There you are.', 'Good.'],
};

const SINGLES: Record<string, string> = {
  intro: "Hey, I'm Max, your coach. I'll show you every move, count your reps, and keep you honest. You can talk to me any time. Say, I need a break, skip, or, show me again.",
  hub: "Say, start workout, when you're ready. Or say, map my gym, to show me where your equipment is.",
  hubunmapped: "I don't know where your equipment is yet. Say, map my gym, and we'll set it up. Or say, start workout, and I'll bring my own.",
  today: "Here's the plan for today.",
  about: 'About',
  minutes: 'minutes.',
  standtall: 'First, stand tall and look straight ahead for a second.',
  gotit: 'Got it.',
  warmup: "Let's warm up.",
  mainblock: "You're warm. Now the real work.",
  cooldown: "Great work. Let's cool down and stretch.",
  first: 'First up.',
  next: 'Next up.',
  watch: 'Watch me.',
  herewego: 'Here we go.',
  sets1: 'One set of',
  sets2: 'Two sets of',
  sets3: 'Three sets of',
  sets4: 'Four sets of',
  ureps: 'reps.',
  urepsside: 'reps each side.',
  usecs: 'seconds.',
  grab: 'Grab your',
  kilo: 'kilo dumbbells.',
  grabany: 'Grab a pair of dumbbells you can control.',
  bench0: 'Set the backrest flat.',
  bench45: 'Raise the backrest to about forty five degrees.',
  bench80: 'Set the backrest upright.',
  set2: 'Set two.',
  set3: 'Set three.',
  set4: 'Set four.',
  lastset: 'Last set. Make it count.',
  go: 'Go!',
  half: 'Halfway.',
  more3: 'Three more.',
  more2: 'Two more.',
  last1: 'Last one!',
  slow: 'Slow it down. Control every rep.',
  range: "Full range. Don't cut it short.",
  stalled: "Still with me? Keep going, or say, I'm done.",
  followme: 'Follow my count.',
  blind: "I can't see your hands right now, so I'll set the pace. Follow my count.",
  switchsides: 'Switch sides.',
  thalf: 'Halfway there.',
  t10: 'Ten seconds.',
  time: 'Time!',
  holdbreak: "Clock's paused. Get back in position.",
  holdresume: 'There you go. Hold it.',
  rest: 'Rest for',
  rest10: 'Ten seconds. Get ready.',
  restskip: "Skipping the rest. Let's go.",
  break: 'No problem. Take your time. Say ready when you want to go again.',
  resume: 'Alright. Back to it.',
  skip: 'Okay, skipping that one.',
  easier: "Okay, I'll ease it off.",
  harder: "Love it. Let's turn it up.",
  repeat: 'Sure. Watch again.',
  togo: 'to go.',
  secsleft: 'seconds left.',
  doneearly: "Okay, we'll call it there.",
  endearly: 'Okay, wrapping up here. Good effort today.',
  goalhit: "And that's your weekly goal done. See you next time.",
  goalleft: "One step closer to this week's goal. See you next time.",
  gotonudge: "Over here. Say ready when you're there.",
  space: 'Find some clear space in front of me.',
  nomic: "I can't hear you right now, so use the buttons on the board.",
  mapintro: "Let's map your gym. For each piece of equipment, touch it where I ask, and pinch your fingers. Or just say, here.",
  mapplaced: 'Got it.',
  mapsecond: 'Good. Now',
  mapbad: "Those two points don't look right. Let's try that one again.",
  mapskip: 'Okay, skipped.',
  mapdone: 'All mapped. Now I know my way around.',
};

function build(): Record<string, string> {
  const out: Record<string, string> = { ...SINGLES };
  for (const [k, list] of Object.entries(GROUPS)) list.forEach((t, i) => (out[`${k}${i + 1}`] = t));
  // q = a quantity inside a sentence ("three sets of ten reps"), n = a rep called out loud.
  for (let n = 1; n <= MAX_NUMBER; n++) out[`q${n}`] = numberWord(n);
  for (let n = 1; n <= MAX_COUNT; n++) out[`n${n}`] = numberWord(n) + '!';
  for (const e of EXERCISE_LIST) {
    out[`x-${e.id}`] = `${e.name}.`;
    out[`how-${e.id}`] = e.how;
    e.tips.forEach((t, i) => (out[`tip-${e.id}-${i + 1}`] = t));
  }
  for (const g of GEAR_IDS) {
    out[`goto-${g}`] = `Head over to ${GEAR[g].say}.`;
    out[`pin-${g}-a`] = `Touch ${GEAR[g].pinA}.`;
    if (GEAR[g].pinB) out[`pin-${g}-b`] = `touch ${GEAR[g].pinB}.`;
  }
  return out;
}

export const LINES = build();
const groupSize = Object.fromEntries(Object.entries(GROUPS).map(([k, v]) => [k, v.length]));
const lastPick: Record<string, number> = {};

/** A random member of a variant group, never the same one twice running. */
export function pick(group: string): string {
  const n = groupSize[group];
  if (!n) return group;
  let i = 1 + Math.floor(Math.random() * n);
  if (n > 1 && i === lastPick[group]) i = (i % n) + 1;
  lastPick[group] = i;
  return `${group}${i}`;
}

/** Spoken text for an id. A leading "~" marks literal text with no recorded clip. */
export function lineText(id: string): string {
  if (id.startsWith('~')) return id.slice(1);
  return LINES[id] ?? id;
}
export const num = (n: number) => (n >= 1 && n <= MAX_NUMBER ? `q${Math.round(n)}` : `~${Math.round(n)}`);
export const count = (n: number) => (n >= 1 && n <= MAX_COUNT ? `n${Math.round(n)}` : `~${Math.round(n)}`);
