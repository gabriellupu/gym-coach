/**
 * Fetches the offline speech-recognition pieces into public/ (git-ignored):
 *   public/vendor/vosk.js                         the Vosk WASM runtime (from node_modules)
 *   public/models/vosk-model-small-en-us.tar.gz   the 40 MB English model
 * Runs before `dev` and `build`; skips whatever is already there.
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODEL_URL = process.env.VOSK_MODEL_URL ?? 'https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz';
const vendor = resolve(root, 'public/vendor/vosk.js');
const model = resolve(root, 'public/models/vosk-model-small-en-us.tar.gz');

mkdirSync(dirname(vendor), { recursive: true });
mkdirSync(dirname(model), { recursive: true });
copyFileSync(resolve(root, 'node_modules/vosk-browser/dist/vosk.js'), vendor);

if (existsSync(model)) console.log('ears: model already present');
else {
  try {
    console.log(`ears: downloading ${MODEL_URL}`);
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(model, Buffer.from(await res.arrayBuffer()));
    console.log('ears: model saved');
  } catch (e) {
    // Not fatal: the app falls back to browser speech recognition, then to buttons.
    console.warn(`ears: could not fetch the speech model (${e.message}). Voice commands will be limited.`);
  }
}
