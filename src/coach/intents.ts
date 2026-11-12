export type Intent = 'ready' | 'break' | 'skip' | 'done' | 'stop' | 'repeat' | 'easier' | 'harder' | 'status' | 'start' | 'map' | 'place';

/** Every phrase the offline recogniser listens for (lower case, words in its vocabulary). */
export const PHRASES: Record<Intent, string[]> = {
  ready: ['ready', "i'm ready", 'i am ready', "let's go", 'continue', 'resume'],
  break: ['i need a break', 'need a break', 'take a break', 'pause', 'give me a minute', 'hold on', 'time out'],
  skip: ['skip', 'skip this', 'skip this one', 'next exercise'],
  done: ['done', "i'm done", 'i am done', 'finished'],
  stop: ['end workout', 'stop workout', 'finish workout', 'end session'],
  repeat: ['show me', 'show me again', 'repeat', 'explain again', 'how do i do it'],
  easier: ['easier', 'too hard', 'make it easier'],
  harder: ['harder', 'too easy', 'make it harder'],
  status: ['how many', 'how many left', 'how long', 'how much longer'],
  start: ['start workout', 'start training', 'begin workout'],
  map: ['map my gym', 'map the gym', 'set up my gym', 'map again', 'fix the mapping', 'map it again'],
  place: ['here', 'right here', 'place it here'],
};

export const GRAMMAR: string[] = [...new Set(Object.values(PHRASES).flat()), '[unk]'];

const exact = new Map<string, Intent>();
for (const [intent, list] of Object.entries(PHRASES) as [Intent, string[]][]) for (const p of list) exact.set(p, intent);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z' ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Loose patterns for free-form transcripts (browser speech recognition, or a voice model later). */
const LOOSE: [RegExp, Intent][] = [
  [/\b(end|stop|finish|quit)\b.*\b(workout|session|training)\b/, 'stop'],
  [/\b(start|begin)\b.*\b(workout|training|session)\b/, 'start'],
  [/\bre-?map\b|\bmap\b.*\b(gym|again|bench|bar|mat)\b|\bfix\b.*\bmapping\b|\bset ?up\b.*\bgym\b/, 'map'],
  [/\b(break|pause|breather|give me a (minute|second|sec)|hold on|time ?out|wait)\b/, 'break'],
  [/\b(too hard|easier|too heavy|too much)\b/, 'easier'],
  [/\b(too easy|harder|more reps)\b/, 'harder'],
  [/\b(skip|next exercise|next one)\b/, 'skip'],
  [/\b(show me|again|repeat|explain|how do i)\b/, 'repeat'],
  [/\b(how many|how long|how much)\b/, 'status'],
  [/\b(i'?m|i am) (done|finished)\b|^(done|finished)$/, 'done'],
  [/\b(ready|let'?s go|continue|resume|go on)\b/, 'ready'],
  [/\b(right )?here\b/, 'place'],
];

export function matchIntent(text: string): Intent | null {
  const t = norm(text);
  if (!t) return null;
  const hit = exact.get(t);
  if (hit) return hit;
  for (const [re, intent] of LOOSE) if (re.test(t)) return intent;
  return null;
}
