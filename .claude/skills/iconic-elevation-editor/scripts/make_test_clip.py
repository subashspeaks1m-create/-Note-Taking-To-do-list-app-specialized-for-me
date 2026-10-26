#!/usr/bin/env python3
"""Build a synthetic talking-head test clip (flite TTS + pauses + fillers) with a ground-truth word transcript.

Writes into OUT_DIR:
  raw_talking_head.mp4   1080x1920 30 fps, burned-in SOURCE timer so every cut can be verified frame by frame
  words.json             word-level timestamps (phrase-accurate; words spread by character length)
  broll/                 two clips + one photo for cutaway tests
  script.txt             plain script (for the --script silence-alignment fallback)

Needs an ffmpeg built with --enable-libflite (most distro builds are). Real footage + faster-whisper is the
normal path; this exists so the pipeline can be regression-tested offline.
"""
import json
import os
import subprocess
import sys
import wave

from PIL import Image, ImageDraw

PHRASES = [
    ("At eighteen, I tore up my own contract.", 0.6),
    ("um", 0.35),
    ("Not because I had a better offer.", 0.5),
    ("Because I was too impatient.", 0.8),
    ("Scouts close your reel in eight seconds.", 0.45),
    ("Most players film it wrong.", 0.5),
    ("Here are three rules.", 0.7),
    ("Rule one. Get to the point.", 0.4),
    ("Rule two. No slow motion. Ever.", 0.6),
    ("uh", 0.3),
    ("Rule three. No lyrics. Instrumentals only.", 0.55),
    ("DM me pathway and I will show you the route.", 0.4),
]


def sh(cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def wav_dur(p):
    with wave.open(p) as w:
        return w.getnframes() / w.getframerate()


def main(out):
    os.makedirs(os.path.join(out, "broll"), exist_ok=True)
    tmp = os.path.join(out, "_tts")
    os.makedirs(tmp, exist_ok=True)
    words, t, parts = [], 0.25, []
    sh(["ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", "0.25", os.path.join(tmp, "lead.wav")])
    parts.append(os.path.join(tmp, "lead.wav"))
    for i, (text, pause) in enumerate(PHRASES):
        p = os.path.join(tmp, "p%02d.wav" % i)
        safe = text.replace("'", "").replace(":", "").replace(",", "")
        sh(["ffmpeg", "-y", "-f", "lavfi", "-i", "flite=text='%s':voice=slt" % safe,
            "-af", "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,aresample=48000",
            "-ac", "1", p])
        d = wav_dur(p)
        toks = text.split()
        total_chars = sum(len(x) + 1 for x in toks)
        tt = t
        for tok in toks:
            wd = d * (len(tok) + 1) / total_chars
            words.append({"w": tok, "s": round(tt, 3), "e": round(tt + wd * 0.92, 3)})
            tt += wd
        parts.append(p)
        sp = os.path.join(tmp, "s%02d.wav" % i)
        sh(["ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", str(pause), sp])
        parts.append(sp)
        t += d + pause
    lst = os.path.join(tmp, "list.txt")
    open(lst, "w").write("".join("file '%s'\n" % os.path.abspath(p) for p in parts))
    voice = os.path.join(tmp, "voice.wav")
    sh(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-ar", "48000", voice])
    dur = wav_dur(voice)

    # "presenter on a pitch": sky, stands, grass, white-shirt torso + head (face ~38% from top)
    bg = Image.new("RGB", (1080, 1920), (140, 170, 200))
    d = ImageDraw.Draw(bg)
    d.rectangle([0, 700, 1080, 1000], fill=(170, 40, 45))
    d.rectangle([0, 1000, 1080, 1920], fill=(52, 120, 58))
    d.ellipse([400, 500, 680, 830], fill=(92, 60, 42))
    d.rounded_rectangle([250, 860, 830, 1920], radius=160, fill=(236, 234, 228))
    d.rectangle([515, 820, 565, 880], fill=(92, 60, 42))
    bgp = os.path.join(tmp, "bg.png")
    bg.save(bgp)
    out_mp4 = os.path.join(out, "raw_talking_head.mp4")
    sh(["ffmpeg", "-y", "-loop", "1", "-framerate", "30", "-i", bgp, "-i", voice,
        "-vf", "drawtext=fontfile=/usr/share/fonts/opentype/inter/Inter-Bold.otf:text='SRC %{pts\\:hms}':x=40:y=40:fontsize=54:fontcolor=yellow:box=1:boxcolor=black@0.6,format=yuv420p",
        "-t", "%.3f" % dur, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-shortest", out_mp4])
    for k, col in enumerate(("0x335577", "0x775533")):
        sh(["ffmpeg", "-y", "-f", "lavfi", "-i", "testsrc2=s=1920x1080:r=30:d=8", "-vf",
            "colorchannelmixer=.6:.2:.2:0:.2:.6:.2:0:.2:.2:.6,drawtext=fontfile=/usr/share/fonts/opentype/inter/Inter-Bold.otf:text='BROLL %d':x=(w-tw)/2:y=(h-th)/2:fontsize=140:fontcolor=white" % (k + 1),
            "-c:v", "libx264", "-preset", "veryfast", os.path.join(out, "broll", "clip%d.mp4" % (k + 1))])
    ph = Image.new("RGB", (900, 1200), (60, 60, 70))
    ImageDraw.Draw(ph).text((300, 560), "PROOF PHOTO", fill=(255, 255, 255))
    ph.save(os.path.join(out, "broll", "photo.jpg"))
    json.dump(words, open(os.path.join(out, "words.json"), "w"), indent=0)
    open(os.path.join(out, "script.txt"), "w").write(" ".join(p for p, _ in PHRASES if p not in ("um", "uh")))
    print("wrote", out_mp4, "%.2fs" % dur, len(words), "words")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "test_assets")
