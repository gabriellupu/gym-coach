/**
 * Pre-renders every line the coach can say into one audio sprite:
 *   public/voice/coach.mp3 + public/voice/coach.json  ({ id: [startSeconds, durationSeconds] })
 * and each exercise's instructions and form cues into their own small files, loaded on demand:
 *   public/voice/how-<exercise>.mp3, tip-<exercise>-<n>.mp3
 *
 * Voice: Piper "en_US-joe-medium" (dataset licence CC0), https://huggingface.co/rhasspy/piper-voices
 * Usage: pip install piper-tts && npm run build:voice -- <path/to/en_US-joe-medium.onnx>
 * Re-run after editing src/coach/lines.ts or the exercise library.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LINES } from '../src/coach/lines';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const model = process.argv[2];
if (!model) throw new Error('Pass the path to a Piper .onnx voice model');
const out = resolve(root, 'public/voice');
mkdirSync(out, { recursive: true });
const tmp = resolve(out, '_lines.json');
writeFileSync(tmp, JSON.stringify(LINES));
execFileSync('python3', [resolve(root, 'scripts/voice_synth.py'), model, tmp, resolve(out, '_sprite.wav'), resolve(out, 'coach.json'), out], { stdio: 'inherit' });
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', resolve(out, '_sprite.wav'), '-ac', '1', '-ar', '22050', '-b:a', '48k', resolve(out, 'coach.mp3')], { stdio: 'inherit' });
const enc = (wav: string, mp3: string) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-ar', '22050', '-b:a', '48k', mp3], { stdio: 'inherit' });
for (const f of readdirSync(out).filter((x) => x.endsWith('.wav') && x !== '_sprite.wav')) {
  enc(resolve(out, f), resolve(out, f.replace('.wav', '.mp3')));
  rmSync(resolve(out, f));
}
rmSync(tmp);
if (!process.env.KEEP_WAV) rmSync(resolve(out, '_sprite.wav'));
console.log(`voice: ${Object.keys(LINES).length} lines`);
