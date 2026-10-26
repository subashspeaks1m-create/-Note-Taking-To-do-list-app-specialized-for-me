#!/usr/bin/env python3
"""Procedural SFX + ambient-trap music bed matching the Iconic Elevation sound palette.

Sound palette (see references/style-bible.md, pillar 5):
  pop      - UI card / badge / callout appears
  tick     - list item / timeline node lights up
  whoosh   - B-roll or split-screen enters
  thud     - hook frame 0, full-screen rule cards, CTA card (sub-bass impact)
  riser    - ~1 s before the CTA
  shutter  - still photo (proof shot) enters
  bed      - low ambient trap bed, ~118 BPM, minor key, sits -16..-22 dB under voice

Everything is generated with numpy so the skill works offline with zero assets.
Drop real files into --sfx-dir (pop.wav, whoosh.wav, ...) to override any of them.

Usage:
  python sfx_synth.py OUT_DIR                 # writes every SFX wav
  python sfx_synth.py OUT_DIR --bed 60        # also writes a 60 s music bed
"""
import argparse
import os
import wave

import numpy as np

SR = 48000
RNG = np.random.default_rng(7)


def _t(dur):
    return np.arange(int(SR * dur)) / SR


def _norm(x, peak_db=-1.0):
    m = np.max(np.abs(x)) or 1.0
    return x / m * (10 ** (peak_db / 20))


def _fft_filter(x, lo=None, hi=None):
    """Brick-ish band filter with soft (raised cosine) edges, applied in the frequency domain."""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    g = np.ones_like(f)
    if lo:
        g *= np.clip((f - lo * 0.7) / (lo * 0.3), 0, 1)
    if hi:
        g *= np.clip((hi * 1.3 - f) / (hi * 0.3), 0, 1)
    return np.fft.irfft(X * g, n=len(x))


def _sweep_noise(dur, f_start, f_end, width=0.6):
    """Noise through a band-pass whose centre glides log-wise from f_start to f_end (STFT overlap-add)."""
    n = int(SR * dur)
    noise = RNG.standard_normal(n + 2048)
    win, hop = 2048, 256
    w = np.hanning(win)
    out = np.zeros(n + win)
    freqs = np.fft.rfftfreq(win, 1 / SR)
    for i, start in enumerate(range(0, n, hop)):
        pos = start / max(n - 1, 1)
        fc = f_start * (f_end / f_start) ** pos
        spec = np.fft.rfft(noise[start:start + win] * w)
        gain = np.exp(-0.5 * (np.log(np.maximum(freqs, 1) / fc) / width) ** 2)
        out[start:start + win] += np.fft.irfft(spec * gain, n=win) * w
    return out[:n]


def pop():
    t = _t(0.12)
    f = 420 + 700 * np.exp(-t / 0.012)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.035)
    click = _fft_filter(RNG.standard_normal(len(t)), lo=2500) * np.exp(-t / 0.003) * 0.35
    return _norm(body + click)


def tick():
    t = _t(0.05)
    tone = np.sin(2 * np.pi * 3200 * t) * np.exp(-t / 0.008)
    click = _fft_filter(RNG.standard_normal(len(t)), lo=4000) * np.exp(-t / 0.002) * 0.5
    return _norm(tone + click)


def whoosh(dur=0.5):
    t = _t(dur)
    rise = np.where(t < dur * 0.6, (t / (dur * 0.6)) ** 2, np.exp(-(t - dur * 0.6) / (dur * 0.12)))
    up = _sweep_noise(dur, 350, 3200, 0.55)
    return _norm(up * rise)


def thud(dur=0.8):
    t = _t(dur)
    f = 34 + 40 * np.exp(-t / 0.05)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.28)
    knock = _fft_filter(RNG.standard_normal(len(t)), hi=900) * np.exp(-t / 0.012) * 0.6
    return _norm(np.tanh((sub + knock) * 1.8))


def riser(dur=1.2):
    t = _t(dur)
    env = (t / dur) ** 2.2
    noise = _sweep_noise(dur, 250, 6000, 0.8)
    f = 180 * (12 ** (t / dur))
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.25
    return _norm((noise + tone) * env)


def shutter():
    t = _t(0.16)
    burst = _fft_filter(RNG.standard_normal(len(t)), lo=1500, hi=9000)
    env = np.exp(-t / 0.006) + 0.8 * np.exp(-np.clip(t - 0.06, 0, None) / 0.01) * (t >= 0.06)
    return _norm(burst * env)


SFX = {"pop": pop, "tick": tick, "whoosh": whoosh, "thud": thud, "riser": riser, "shutter": shutter}


def _note(n):
    """MIDI note -> Hz."""
    return 440.0 * 2 ** ((n - 69) / 12)


def bed(duration, bpm=118):
    """Dark half-time ambient trap bed: minor pad (Am-F-C-G), 808, 8th hats, clap on 3."""
    n = int(SR * (duration + 1))
    out = np.zeros(n)
    beat = 60.0 / bpm
    bar = beat * 4
    chords = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 55, 60, 64], [55, 59, 62, 67]]

    pad = np.zeros(n)
    bar_len = int(bar * SR)
    tb = np.arange(bar_len) / SR
    for b in range(int(duration / bar) + 2):
        s = b * bar_len
        if s >= n:
            break
        seg = np.zeros(bar_len)
        for note in chords[b % 4]:
            for det in (-0.08, 0.08):
                fr = _note(note + det)
                seg += 2 * (tb * fr % 1) - 1  # saw
        seg *= np.minimum(1, tb / 0.4) * np.minimum(1, (bar - tb) / 0.3)
        e = min(n, s + bar_len)
        pad[s:e] += seg[: e - s]
    pad = _fft_filter(pad, hi=1100) * 0.10

    kick_t = _t(0.9)
    kf = 45 + 120 * np.exp(-kick_t / 0.03)
    k808 = np.tanh(2.2 * np.sin(2 * np.pi * np.cumsum(kf) / SR) * np.exp(-kick_t / 0.45))
    hat = _fft_filter(RNG.standard_normal(int(0.04 * SR)), lo=7000) * np.exp(-_t(0.04) / 0.008)
    clap = _fft_filter(RNG.standard_normal(int(0.18 * SR)), lo=900, hi=4000) * np.exp(-_t(0.18) / 0.05)

    step = beat / 4
    pump = np.ones(n)
    for b in range(int(duration / bar) + 2):
        for st in range(16):
            pos = int((b * bar + st * step) * SR)
            if pos >= n:
                continue

            def put(sample, gain):
                e = min(n, pos + len(sample))
                out[pos:e] += sample[: e - pos] * gain

            if st in (0, 7, 10):
                put(k808, 0.55)
                d = min(n - pos, int(0.25 * SR))
                pump[pos:pos + d] = np.minimum(pump[pos:pos + d], 0.55 + 0.45 * np.arange(d) / max(d, 1))
            if st % 2 == 0:
                put(hat, 0.10 if st % 4 else 0.14)
            if b % 2 == 1 and st in (13, 14, 15):
                put(hat, 0.07)
            if st == 8:
                put(clap, 0.22)
    out += pad * pump
    out = out[: int(SR * duration)]
    fade = int(SR * 1.5)
    out[-fade:] *= np.linspace(1, 0, fade)
    out[: int(SR * 0.3)] *= np.linspace(0, 1, int(SR * 0.3))
    return _norm(out, -3.0)


def write_wav(path, x, stereo=True):
    x = np.clip(x, -1, 1)
    pcm = (x * 32767).astype(np.int16)
    if stereo:
        pcm = np.stack([pcm, pcm], axis=1).reshape(-1)
    with wave.open(path, "wb") as w:
        w.setnchannels(2 if stereo else 1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def read_wav_mono(path):
    """Read a 16-bit PCM wav (any channels / rate) as mono float at SR. Use ffmpeg upstream for other formats."""
    with wave.open(path, "rb") as w:
        ch, sw, rate, frames = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        data = np.frombuffer(w.readframes(frames), dtype=np.int16 if sw == 2 else np.int32).astype(np.float64)
    data = data.reshape(-1, ch).mean(axis=1) / (32768.0 if sw == 2 else 2 ** 31)
    if rate != SR:
        idx = np.arange(0, len(data), rate / SR)
        data = np.interp(idx, np.arange(len(data)), data)
    return data


def build_sfx_track(events, duration, sfx_db, sfx_dir=None):
    """events: list of (time_s, kind). Returns a mono float track with every SFX placed sample-accurately."""
    n = int(SR * (duration + 2))
    track = np.zeros(n)
    cache = {}
    for t, kind in events:
        if kind not in cache:
            custom = os.path.join(sfx_dir, kind + ".wav") if sfx_dir else None
            cache[kind] = read_wav_mono(custom) if custom and os.path.exists(custom) else SFX[kind]()
        s = cache[kind] * (10 ** (sfx_db.get(kind, -16) / 20))
        # risers are placed so they END on the cue; everything else starts on it
        pos = int((t - (len(s) / SR if kind == "riser" else 0)) * SR)
        if pos < 0:
            s, pos = s[-pos:], 0
        e = min(n, pos + len(s))
        track[pos:e] += s[: e - pos]
    return track[: int(SR * duration)]


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("out_dir")
    ap.add_argument("--bed", type=float, default=0, help="also render a music bed of this many seconds")
    ap.add_argument("--bpm", type=float, default=118)
    a = ap.parse_args()
    os.makedirs(a.out_dir, exist_ok=True)
    for name, fn in SFX.items():
        write_wav(os.path.join(a.out_dir, name + ".wav"), fn())
    if a.bed:
        write_wav(os.path.join(a.out_dir, "bed.wav"), bed(a.bed, a.bpm))
    print("wrote", sorted(os.listdir(a.out_dir)))
