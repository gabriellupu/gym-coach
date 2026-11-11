"""Synthesises {id: text} with Piper into one WAV sprite plus a JSON index of [start, duration].
Per-exercise clips (ids starting "how-" or "tip-") are written as separate WAVs into split_dir so they can be loaded on demand."""
import io, json, sys, wave
import numpy as np
from piper import PiperVoice, SynthesisConfig

model, lines_path, wav_out, index_out, split_dir = sys.argv[1:6]
voice = PiperVoice.load(model)
lines = json.load(open(lines_path))
rate = voice.config.sample_rate
gap = np.zeros(int(rate * 0.12), dtype=np.int16)
chunks, index, pos = [gap], {}, len(gap)

for key, text in lines.items():
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        # Rep counts are snappy; one-word cues are slowed slightly so they stay clear; instructions are unhurried.
        scale = 0.9 if key[0] == "n" and key[1:].isdigit() else 1.08 if len(text) < 12 else 1.0 if key.startswith("how-") else 0.96
        voice.synthesize_wav(text, w, syn_config=SynthesisConfig(length_scale=scale))
    buf.seek(0)
    with wave.open(buf, "rb") as w:
        pcm = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
    loud = np.nonzero(np.abs(pcm) > 400)[0]
    if len(loud):
        pcm = pcm[max(0, loud[0] - int(rate * 0.05)) : min(len(pcm), loud[-1] + int(rate * 0.08))]
    peak = max(1, int(np.abs(pcm).max()))
    pcm = (pcm.astype(np.float32) * (26000 / peak)).astype(np.int16)
    if key.startswith(("how-", "tip-")):
        with wave.open(f"{split_dir}/{key}.wav", "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(rate)
            w.writeframes(pcm.tobytes())
        continue
    index[key] = [round(pos / rate, 3), round(len(pcm) / rate, 3)]
    chunks += [pcm, gap]
    pos += len(pcm) + len(gap)

with wave.open(wav_out, "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(rate)
    w.writeframes(np.concatenate(chunks).tobytes())
json.dump(index, open(index_out, "w"), separators=(",", ":"))
print(f"sprite: {pos / rate:.1f}s, {len(index)} clips")
