#!/usr/bin/env python3
"""iconic-elevation-editor: turn a raw talking-head video into a finished @iconic_elevation-style reel.

Pipeline (each stage maps to a pillar in references/style-bible.md):
  1  ingest      probe video, extract 16 kHz mono audio
  2  transcript  faster-whisper word timestamps (or --transcript JSON, or --script + silence fallback)
  3  cut engine  drop fillers/stutters, remove every pause > 0.15 s, frame-snap at 30 fps
  4  shot engine split shots to max 1.7 s (hook) / 3.2 s (body), alternate 100% <-> 115% punch-ins,
                 paint B-roll cutaways (proof flash at 0.9 s, ~30% coverage), hook creep 100->103%
  5  text        Anton captions 1-4 words, lime keyword, 105->100% pop; hook kicker+headline block
  6  graphics    frosted cards, two-tone pills, checklists, rule cards, CTA, REC frame (PNG overlays)
  7  grade       clean rec709 punch: contrast 1.08, sat 1.14, cool shadows, light vignette, no grain
  8  audio       voice -14 LUFS, music ~20 dB under voice (sidechain duck), SFX matrix (thud/whoosh/pop/tick/riser)
  9  render      per-shot H.264 segments -> concat -> overlays + ASS burn + mix -> final.mp4
 10  exports     timeline.md (frame-accurate table), timeline.csv, timeline.edl (CMX3600), plan.json,
                 captions.ass, contact_sheet.jpg

Usage:
  python iconic_edit.py raw.mp4 -o out/ [--plan plan.json] [--broll DIR] [--music FILE|auto|none]
                        [--transcript words.json | --script script.txt] [--caption-style bold|clean]
                        [--highlight keyword|karaoke] [--fit fill|letterbox] [--dry-run]
"""
import argparse
import bisect
import csv
import json
import os
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import graphics as G  # noqa: E402
import sfx_synth as SFX  # noqa: E402

FONT_DIR = os.path.join(SKILL, "assets", "fonts")
VIDEO_EXT = (".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi")
IMAGE_EXT = (".jpg", ".jpeg", ".png", ".webp")

# Words @iconic_elevation colours lime: stakes, outcomes, money, time, identity, absolutes.
POWER_WORDS = set("""
signed sign signing contract offer offers trial trials pro professional club clubs scout scouts scouted agent agents
money paid pay fees free cost costs price million millions thousands euros pounds dollars
years months weeks days seconds minutes age young old
never nothing nobody everything everyone always only every zero
mistake mistakes wrong truth real reason secret problem fix rules rule plan pathway route system method
fail failed failure lost lose losing quit stuck dead dream dreams weight tired broke broken
trafficked fake scam lied lie lies trap traps
asset talent hungry discipline mindset structure infrastructure visibility profile
good better best elite top ahead behind gap start stop now today
parents family kid kids player players career future
""".split())


def log(*a):
    print("[iconic]", *a, flush=True)


def run(cmd, quiet=True):
    r = subprocess.run(cmd, stdout=subprocess.PIPE if quiet else None, stderr=subprocess.PIPE, text=True)
    if r.returncode != 0:
        sys.stderr.write(r.stderr[-4000:])
        raise RuntimeError("command failed: " + " ".join(cmd[:8]) + " ...")
    return r.stdout


def norm(w):
    return re.sub(r"[^a-z0-9']", "", w.lower())


def ass_color(hexstr, alpha=0):
    h = hexstr.lstrip("#")
    return "&H%02X%s%s%s" % (alpha, h[4:6], h[2:4], h[0:2])


def ass_time(t):
    t = max(0.0, t)
    cs = int(round(t * 100))
    return "%d:%02d:%02d.%02d" % (cs // 360000, cs // 6000 % 60, cs // 100 % 60, cs % 100)


def tc(frames, fps):
    f = int(round(frames))
    return "%02d:%02d:%02d:%02d" % (f // (fps * 3600), f // (fps * 60) % 60, f // fps % 60, f % fps)


# ------------------------------------------------------------------ 1. ingest
def probe(path):
    out = json.loads(run(["ffprobe", "-v", "error", "-show_entries",
                          "stream=codec_type,width,height,r_frame_rate:stream_tags=rotate:stream_side_data=rotation:format=duration",
                          "-of", "json", path]))
    v = next((s for s in out["streams"] if s.get("codec_type") == "video"), None)
    has_audio = any(s.get("codec_type") == "audio" for s in out["streams"])
    info = {"duration": float(out["format"]["duration"]), "has_audio": has_audio, "is_image": path.lower().endswith(IMAGE_EXT)}
    if v:
        w, h = v["width"], v["height"]
        rot = int(v.get("tags", {}).get("rotate", 0) or 0)
        for sd in v.get("side_data_list", []) or []:
            rot = int(sd.get("rotation", rot) or rot)
        if abs(rot) % 180 == 90:
            w, h = h, w
        info.update(w=w, h=h)
    return info


# ------------------------------------------------------------------ 2. transcript
def transcribe(wav, model_name, language):
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise SystemExit("faster-whisper not installed: pip install faster-whisper  (or pass --transcript / --script)")
    log("transcribing with faster-whisper", model_name)
    model = WhisperModel(model_name, device="auto", compute_type="default")
    segs, _ = model.transcribe(wav, word_timestamps=True, language=language, condition_on_previous_text=False,
                               initial_prompt="Umm, uh, so, like, you know, I mean, erm.")
    words = []
    for s in segs:
        for w in s.words or []:
            if w.word.strip():
                words.append({"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3)})
    return words


def load_transcript(path):
    data = json.load(open(path))
    if isinstance(data, dict):  # whisper / whisperX style
        data = [w for seg in data.get("segments", []) for w in seg.get("words", [])] or data.get("words", [])
    words = []
    for w in data:
        text = w.get("w") or w.get("word") or w.get("text")
        s, e = w.get("s", w.get("start")), w.get("e", w.get("end"))
        if text and s is not None and e is not None:
            words.append({"w": text.strip(), "s": float(s), "e": float(e)})
    return words


def script_fallback(wav, script_path, duration):
    """No ASR available: find speech regions with silencedetect and spread the script's words across them."""
    err = subprocess.run(["ffmpeg", "-hide_banner", "-i", wav, "-af", "silencedetect=noise=-32dB:d=0.12", "-f", "null", "-"],
                         stderr=subprocess.PIPE, text=True).stderr
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", err)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", err)]
    regions, cur = [], 0.0
    for s, e in zip(starts, ends + [duration] * (len(starts) - len(ends))):
        if s - cur > 0.08:
            regions.append((cur, s))
        cur = e
    if duration - cur > 0.08:
        regions.append((cur, duration))
    tokens = open(script_path).read().split()
    total_speech = sum(e - s for s, e in regions) or 1
    weights = [len(t) + 2 for t in tokens]
    per_sec = sum(weights) / total_speech
    words, i = [], 0
    for s, e in regions:
        budget = (e - s) * per_sec
        t, used = s, 0
        while i < len(tokens) and (used + weights[i] <= budget * 1.08 or used == 0):
            d = weights[i] / per_sec
            words.append({"w": tokens[i], "s": round(t, 3), "e": round(min(e, t + d), 3)})
            t += d
            used += weights[i]
            i += 1
    for tok in tokens[i:]:  # leftovers go on the last region
        words.append({"w": tok, "s": words[-1]["e"], "e": words[-1]["e"] + 0.2})
    return words


# ------------------------------------------------------------------ 3. cut engine
def clean_words(words, fillers):
    fillers = set(fillers)
    out = []
    for w in words:
        n = norm(w["w"])
        if not n or n in fillers:
            continue
        if out and norm(out[-1]["w"]) == n and w["s"] - out[-1]["e"] < 0.4 and len(n) > 1:
            out[-1] = dict(w)  # stutter "I I" / "the the": keep the second take
            continue
        out.append(dict(w))
    return out


def build_segments(words, P, fps, src_dur):
    segs, cur = [], None
    for i, w in enumerate(words):
        if cur and w["s"] - words[cur["last"]]["e"] <= P["max_pause_s"]:
            cur["last"] = i
        else:
            if cur:
                segs.append(cur)
            cur = {"first": i, "last": i}
    if cur:
        segs.append(cur)
    out_f = 0
    prev_out = 0.0
    for sg in segs:
        a = max(prev_out, words[sg["first"]]["s"] - P["pad_in_s"], 0.0)
        b = min(src_dur, words[sg["last"]]["e"] + P["pad_out_s"])
        n = max(2, int(round((b - a) * fps)))
        sg.update(src_in=a, src_out=a + n / fps, frames=n, out_in=out_f)
        out_f += n
        prev_out = sg["src_out"]
    for si, sg in enumerate(segs):
        for k in range(sg["first"], sg["last"] + 1):
            w = words[k]
            w["seg"] = si
            w["os"] = (sg["out_in"] / fps) + (w["s"] - sg["src_in"])
            w["oe"] = (sg["out_in"] / fps) + (min(w["e"], sg["src_out"]) - sg["src_in"])
    return segs, out_f


# ------------------------------------------------------------------ 4. shot engine
def frame_to_src(f, segs, fps):
    starts = [s["out_in"] for s in segs]
    i = max(0, bisect.bisect_right(starts, f) - 1)
    sg = segs[i]
    return sg["src_in"] + (f - sg["out_in"]) / fps


def split_shots(segs, words, P, fps):
    shots = []
    word_starts = sorted(int(round(w["os"] * fps)) for w in words)
    power_starts = {int(round(w["os"] * fps)) for w in words if norm(w["w"]) in POWER_WORDS or re.search(r"\d", w["w"])}
    sentence_starts = {int(round(words[i]["os"] * fps)) for i in range(1, len(words)) if re.search(r"[.!?]$", words[i - 1]["w"])}
    hook_f = P["hook_window_s"] * fps
    for sg in segs:
        a, b = sg["out_in"], sg["out_in"] + sg["frames"]
        while True:
            mx = (P["hook_max_shot_s"] if a < hook_f else P["body_max_shot_s"]) * fps
            mn = P["min_shot_s"] * fps
            if b - a <= mx:
                break
            target = a + mx * 0.75
            cands = [f for f in word_starts if a + mn <= f <= a + mx and b - f >= mn]
            if not cands:
                cut = int(a + mx)
                if b - cut < mn:
                    break
            else:
                def score(f):
                    bonus = (6 if f in sentence_starts else 0) + (4 if f in power_starts else 0)
                    return abs(f - target) - bonus
                cut = min(cands, key=score)
            shots.append({"kind": "a", "f0": a, "f1": cut})
            a = cut
        shots.append({"kind": "a", "f0": a, "f1": b})
    return shots


def choose_broll_slots(shots, total_f, P, fps, n_sources):
    """Auto B-roll: proof flash at 0.9 s, then every 3rd body shot until ~30% coverage."""
    slots = []
    if n_sources:
        f0 = int(P["proof_flash_at_s"] * fps)
        f1 = f0 + int(P["proof_flash_len_s"] * fps)
        if f1 < total_f - 3 * fps:
            slots.append((f0, f1))
    body = [s for s in shots if s["f0"] >= P["hook_window_s"] * fps and s["f1"] <= total_f - 2.5 * fps]
    target = P["broll_ratio"] * total_f
    covered = sum(b - a for a, b in slots)
    for i, s in enumerate(body):
        if covered >= target:
            break
        if i % 3 != 1:
            continue
        ln = min(max(s["f1"] - s["f0"], int(P["broll_min_s"] * fps)), int(P["broll_max_s"] * fps))
        a, b = s["f0"], min(s["f0"] + ln, total_f - int(2.5 * fps))
        if b - a >= P["broll_min_s"] * fps * 0.8:
            slots.append((a, b))
            covered += b - a
    return slots


def paint_broll(shots, total_f, cues, fps, min_a=8):
    owner = [None] * total_f
    for si, s in enumerate(shots):
        for f in range(s["f0"], s["f1"]):
            owner[f] = ("a", si)
    for ci, c in enumerate(cues):
        for f in range(max(0, c["f0"]), min(total_f, c["f1"])):
            owner[f] = ("b", ci)
    runs, f = [], 0
    while f < total_f:
        g = f
        while g < total_f and owner[g] == owner[f]:
            g += 1
        runs.append([owner[f], f, g])
        f = g
    changed = True
    while changed:  # absorb A-roll slivers into neighbouring B-roll
        changed = False
        for i, (o, a, b) in enumerate(runs):
            if o[0] == "a" and b - a < min_a:
                nb = runs[i - 1] if i > 0 and runs[i - 1][0][0] == "b" else (runs[i + 1] if i + 1 < len(runs) and runs[i + 1][0][0] == "b" else None)
                if nb is not None:
                    nb[1], nb[2] = min(nb[1], a), max(nb[2], b)
                    runs.pop(i)
                    changed = True
                    break
    out = []
    for o, a, b in runs:
        if o[0] == "a":
            out.append({"kind": "a", "f0": a, "f1": b})
        else:
            c = dict(cues[o[1]])
            c.update(kind="b", f0=a, f1=b)
            out.append(c)
    return out


def assign_zoom(shots, P):
    toggle = 0
    for i, s in enumerate(shots):
        if s["kind"] == "b":
            s["z0"], s["z1"] = P["broll_push"]
            toggle = 0
            continue
        if i == 0:
            s["z0"], s["z1"] = P["hook_creep"]
            toggle = 1
            continue
        z = P["punch_scale"] if toggle else P["base_scale"]
        s["z0"] = s["z1"] = z
        toggle ^= 1


# ------------------------------------------------------------------ anchors (phrase -> output time)
def find_phrase(words, phrase, after=0.0):
    toks = [norm(t) for t in phrase.split() if norm(t)]
    seq = [norm(w["w"]) for w in words]
    for i in range(len(seq) - len(toks) + 1):
        if seq[i:i + len(toks)] == toks and words[i]["os"] >= after - 1e-6:
            return words[i]["os"], words[i + len(toks) - 1]["oe"]
    return None


def resolve_window(item, words, total_s):
    if "at" in item and isinstance(item["at"], str):
        hit = find_phrase(words, item["at"])
        if not hit:
            log("WARNING: phrase not found, skipping:", item["at"])
            return None
        a = hit[0]
    else:
        a = float(item.get("start", item.get("at", 0)))
    if "until" in item:
        hit = find_phrase(words, item["until"], after=a)
        b = hit[1] if hit else a + float(item.get("dur", 2.0))
    elif "end" in item:
        b = total_s if float(item["end"]) < 0 else float(item["end"])
    else:
        b = a + float(item.get("dur", 2.0))
    return max(0.0, a), min(total_s, b)


# ------------------------------------------------------------------ 5. text (ASS)
def chunk_words(words, max_words, max_chars):
    chunks, cur = [], []
    for i, w in enumerate(words):
        cand = cur + [w]
        text = " ".join(x["w"] for x in cand)
        gap = w["os"] - cur[-1]["oe"] if cur else 0
        if cur and (len(cand) > max_words or len(text) > max_chars * 2 or gap > 0.35):
            chunks.append(cur)
            cand = [w]
        cur = cand
        if re.search(r"[.!?,;:]$", w["w"]) and len(cur) >= 1:
            # punctuation closes a chunk, but avoid 1-word orphans unless it's a sentence end
            if len(cur) >= 2 or re.search(r"[.!?]$", w["w"]):
                chunks.append(cur)
                cur = []
    if cur:
        chunks.append(cur)
    return chunks


def pick_highlight(chunk, since_last, keywords, every_n):
    best, best_score = None, 0
    for i, w in enumerate(chunk):
        n = norm(w["w"])
        sc = 0
        if n in keywords:
            sc = 6
        elif re.search(r"\d", n):
            sc = 5
        elif n in POWER_WORDS:
            sc = 4
        elif i == len(chunk) - 1 and re.search(r"[.!?]$", w["w"]) and len(n) >= 4:
            sc = 2
        if sc > best_score:
            best, best_score = i, sc
    if best is None:
        return None
    if best_score >= 4 or since_last >= every_n:
        return best
    return None


NUM = {"zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
       "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16,
       "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
       "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90, "hundred": 100}


def digits(t):
    """'eighteen' -> '18', 'twenty-three' -> '23' (the reels always print numbers as digits: 8 SECONDS, 4 YEARS)."""
    m = re.match(r"^([A-Za-z]+)(?:-([A-Za-z]+))?([^A-Za-z]*)$", t)
    if not m or m.group(1).lower() not in NUM:
        return t
    a = NUM[m.group(1).lower()]
    if m.group(2):
        if m.group(2).lower() not in NUM or a < 20 or NUM[m.group(2).lower()] >= 10:
            return t
        a += NUM[m.group(2).lower()]
    if a <= 1 and not m.group(3):  # keep "one" / "zero" as words mid-sentence ("no one", "zero chance" read fine)
        return t
    return str(a) + m.group(3)


def caption_text(w, upper):
    t = w["w"]
    if upper:
        t = digits(re.sub(r"[.,;:\"“”]", "", t)).upper()
    return t


def split_lines(tokens, max_chars):
    """Balanced 1- or 2-line break. Returns lists of token indices."""
    idx = list(range(len(tokens)))
    if len(" ".join(tokens)) <= max_chars or len(tokens) < 2:
        return [idx]
    best, bi = 1e9, 1
    for i in range(1, len(tokens)):
        d = abs(len(" ".join(tokens[:i])) - len(" ".join(tokens[i:])))
        if d < best:
            best, bi = d, i
    return [idx[:bi], idx[bi:]]


def build_ass(words, cfg, style_name, highlight_mode, keywords, hook, total_s, fps, fit, mute=()):
    pal = cfg["palette"]
    C = dict(cfg["captions"][style_name])
    if fit == "letterbox":
        C.update(cap_px=38, center_y=1205, outline_px=4)
    fnt = cfg["fonts"][C["font"]]
    size = round(C["cap_px"] / fnt["cap_per_size"])
    disp = cfg["fonts"]["display"]
    HT = cfg["hook_title"]
    white, lime = ass_color(pal["white"]), ass_color(pal["lime"])
    shadow = ass_color("#000000", int(255 * (1 - C["shadow_alpha"])))
    lines = [
        "[Script Info]", "ScriptType: v4.00+", "PlayResX: 1080", "PlayResY: 1920", "WrapStyle: 2",
        "ScaledBorderAndShadow: yes", "", "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
        "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        "Style: Cap,%s,%d,%s,%s,&H00000000,%s,0,0,0,0,100,100,0,0,1,%d,%d,2,40,40,0,1"
        % (fnt["family"], size, white, white, shadow, C["outline_px"], C["shadow_px"]),
        "Style: Kicker,%s,%d,%s,%s,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,0,2,1,0,0,0,1"
        % (disp["family"], round(HT["kicker_cap_px"] / disp["cap_per_size"]), white, white),
        "Style: Head,%s,%d,%s,%s,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,0,3,1,0,0,0,1"
        % (disp["family"], round(HT["headline_cap_px"] / disp["cap_per_size"]), white, white),
        "Style: Sub,%s,%d,%s,%s,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,0,2,1,0,0,0,1"
        % (cfg["fonts"]["body"]["family"], round(30 / cfg["fonts"]["body"]["cap_per_size"]), white, white),
        "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]
    desc = 674 / 3550  # Anton descender share of the libass line box
    events = []

    # --- hook title block (kicker + headline + optional sub), bottom-anchored
    hook_end = 0.0
    if hook and hook.get("headline"):
        hs, he = 0.0, hook["end"]
        hook_end = he
        hsize = round(HT["headline_cap_px"] / disp["cap_per_size"])
        ksize = round(HT["kicker_cap_px"] / disp["cap_per_size"])
        heads = hook["headline"]
        lime_lines = set(hook.get("lime_lines", [len(heads) - 1]))
        align_left = hook.get("align", HT["align"]) == "left"
        an = 1 if align_left else 2
        x = HT["margin_x"] if align_left else 540
        base = HT["baseline_y"] - (70 if hook.get("sub") else 0)
        adv = HT["headline_cap_px"] + HT["line_gap_px"]
        for k, txt in enumerate(heads):
            bl = base - (len(heads) - 1 - k) * adv
            col = lime if k in lime_lines else white
            pop = "\\fscx%d\\fscy%d\\t(0,%d,\\fscx100\\fscy100)" % (HT["pop_from"], HT["pop_from"], HT["pop_ms"])
            st = hs + k * HT["stagger_ms"] / 1000
            events.append("Dialogue: 3,%s,%s,Head,,0,0,0,,{\\an%d\\pos(%d,%d)\\1c%s%s\\fad(0,80)}%s"
                          % (ass_time(st), ass_time(he), an, x, round(bl + desc * hsize), col, pop, txt.upper()))
        top_bl = base - (len(heads) - 1) * adv - HT["headline_cap_px"]
        if hook.get("kicker"):
            kick_lines = hook["kicker"] if isinstance(hook["kicker"], list) else [hook["kicker"]]
            arrow_h = 92 if hook.get("arrow") else 0
            kb = top_bl - HT["kicker_gap_px"] - arrow_h
            for j, kt in enumerate(reversed(kick_lines)):
                bl = kb - j * (HT["kicker_cap_px"] + 10)
                events.append("Dialogue: 3,%s,%s,Kicker,,0,0,0,,{\\an%d\\pos(%d,%d)\\fad(120,80)}%s"
                              % (ass_time(hs), ass_time(he), an, x, round(bl + desc * ksize), kt.upper()))
            if hook.get("arrow"):
                ax = x + 4 if align_left else 540 - 14
                ay = top_bl - HT["kicker_gap_px"] - arrow_h + 14
                dots = " ".join("m %d %d l %d %d %d %d %d %d" % (ax + 9, ay + i * 13, ax + 17, ay + i * 13, ax + 17, ay + i * 13 + 7, ax + 9, ay + i * 13 + 7) for i in range(5))
                tri = "m %d %d l %d %d %d %d" % (ax, ay + 66, ax + 26, ay + 66, ax + 13, ay + 84)
                events.append("Dialogue: 3,%s,%s,Kicker,,0,0,0,,{\\an7\\pos(0,0)\\1c%s\\bord0\\shad0\\fad(160,80)\\p1}%s %s{\\p0}"
                              % (ass_time(hs + 0.08), ass_time(he), lime, dots, tri))
        if hook.get("sub"):
            events.append("Dialogue: 3,%s,%s,Sub,,0,0,0,,{\\an%d\\pos(%d,%d)\\fad(120,80)}%s"
                          % (ass_time(hs + 0.15), ass_time(he), an, x, base + 86, hook["sub"]))

    # --- running captions
    cap_words = [w for w in words if hook.get("captions_during_hook") or w["os"] >= hook_end - 0.02] if hook else words
    # full-screen cards already carry the text: no captions underneath them
    cap_words = [w for w in cap_words if not any(m0 - 0.05 <= w["os"] < m1 for m0, m1 in mute)]
    chunks = chunk_words(cap_words, C["max_words"], C["max_chars"])
    upper = C["uppercase"]
    since = 99
    adv = C["cap_px"] + 24
    for ci, ch in enumerate(chunks):
        a = ch[0]["os"]
        nxt = chunks[ci + 1][0]["os"] if ci + 1 < len(chunks) else None
        b = ch[-1]["oe"] + 0.12
        if nxt is not None and nxt - ch[-1]["oe"] < 0.3:
            b = nxt
        b = max(b, a + 0.25)
        if nxt is not None:
            b = min(b, nxt)
        toks = [caption_text(w, upper) for w in ch]
        if style_name == "clean":
            body = "\\N".join(" ".join(toks[k] for k in grp) for grp in split_lines(toks, C["max_chars"]))
            events.append("Dialogue: 1,%s,%s,Cap,,0,0,0,,{\\an2\\pos(540,%d)}%s" % (ass_time(a), ass_time(b), C["center_y"] + C["cap_px"] // 2 + 16, body))
            continue
        hi = pick_highlight(ch, since, keywords, C["highlight_every_n_chunks"]) if highlight_mode == "keyword" else None
        since = 0 if hi is not None else since + 1
        line_groups = split_lines(toks, C["max_chars"])
        n_lines = len(line_groups)
        pop = "\\fscx%d\\fscy%d\\t(0,%d,\\fscx100\\fscy100)" % (C["pop_from"], C["pop_from"], C["pop_ms"])

        def render(active):
            evs = []
            for li, grp in enumerate(line_groups):
                center = C["center_y"] - (n_lines - 1) * adv / 2 + li * adv
                bl = center + C["cap_px"] / 2
                parts = []
                for k in grp:
                    on = (k == hi) if highlight_mode == "keyword" else (k == active)
                    parts.append(("{\\1c%s}%s{\\1c%s}" % (lime, toks[k], white)) if on else toks[k])
                evs.append((bl, " ".join(parts)))
            return evs

        if highlight_mode == "karaoke":
            for k, w in enumerate(ch):
                ka = a if k == 0 else w["os"]
                kb = ch[k + 1]["os"] if k + 1 < len(ch) else b
                for bl, txt in render(k):
                    events.append("Dialogue: 1,%s,%s,Cap,,0,0,0,,{\\an2\\pos(540,%d)%s}%s"
                                  % (ass_time(ka), ass_time(kb), round(bl + desc * size), pop if k == 0 else "", txt))
        else:
            for bl, txt in render(None):
                events.append("Dialogue: 1,%s,%s,Cap,,0,0,0,,{\\an2\\pos(540,%d)%s}%s" % (ass_time(a), ass_time(b), round(bl + desc * size), pop, txt))
    return "\n".join(lines + events) + "\n"


def auto_hook(words, HT):
    """Fallback hook headline when no plan is given: first sentence -> kicker + 1-3 word lime punch."""
    first = []
    for w in words:
        first.append(w)
        if re.search(r"[.!?]$", w["w"]) or w["oe"] >= HT["max_len_s"] * 1.6:
            break
    toks = [digits(re.sub(r"[.,;:!?\"]", "", w["w"])).upper() for w in first]
    end = min(max(first[-1]["oe"], 1.5), HT["max_len_s"])
    if len(toks) <= 4:
        mid = max(1, len(toks) // 2)
        return {"headline": [" ".join(toks[:mid]), " ".join(toks[mid:]) + "."], "end": end, "lime_lines": [1]}
    punch = toks[-2:] if len(" ".join(toks[-2:])) <= 14 else toks[-1:]
    kick = toks[: len(toks) - len(punch)]
    kick = kick[-8:]  # kicker is context, keep it short
    kl = [" ".join(kick[k] for k in grp) for grp in split_lines(kick, 20)]
    return {"kicker": kl, "headline": [" ".join(punch) + "."], "end": end, "lime_lines": [0], "arrow": True}


def detect_cta(words):
    tail = words[-14:]
    seq = [norm(w["w"]) for w in tail]
    for i, n in enumerate(seq[:-1]):
        if n == "dm" and i + 2 < len(seq) and seq[i + 1] == "me":
            return {"type": "dm", "keyword": seq[i + 2].upper(), "at_word": tail[i]}
        if n == "comment" and i + 1 < len(seq):
            return {"type": "comment", "keyword": seq[i + 1].upper(), "at_word": tail[i]}
    if "follow" in seq[-8:]:
        return {"type": "follow"}
    return {"type": "none"}


# ------------------------------------------------------------------ 7. grade + fit chains
def grade_chain(g):
    return ("eq=contrast={c}:saturation={s}:gamma={gm}:brightness={b},"
            "colorbalance=rs={rs:.3f}:bs={bs:.3f}:rh={rh:.3f}:bh={bh:.3f},"
            "vignette=angle={va},unsharp=5:5:{sh}").format(
        c=g["contrast"], s=g["saturation"], gm=g["gamma"], b=g["brightness"],
        rs=-g["shadows_cool"] * 0.5, bs=g["shadows_cool"], rh=g["highlights_warm"], bh=-g["highlights_warm"] * 0.5,
        va=g["vignette_angle"], sh=g["sharpen"])


def fit_chain(w, h, z0, z1, n, fps, fy, fit):
    W, H = 1080, 1920
    if fit == "letterbox" and w > h:
        bh = int(round(W * h / w / 2) * 2)
        z = z0
        sw, sh = int(round(W * z / 2) * 2), int(round(bh * z / 2) * 2)
        return ("scale=%d:%d:flags=lanczos,crop=%d:%d:%d:%d,pad=%d:%d:0:%d:black"
                % (sw, sh, W, bh, (sw - W) // 2, int((sh - bh) * fy), W, H, (H - bh) // 2))
    s = max(W / w, H / h)
    if abs(z0 - z1) < 1e-4:
        sw, sh = int(np.ceil(w * s * z0 / 2) * 2), int(np.ceil(h * s * z0 / 2) * 2)
        return "scale=%d:%d:flags=lanczos,crop=%d:%d:%d:%d" % (sw, sh, W, H, (sw - W) // 2, int((sh - H) * fy))
    # animated push: cover-fit at 2x, then zoompan back to 1080x1920 (2x pre-scale kills integer jitter)
    sw, sh = int(np.ceil(w * s * 2 / 2) * 2), int(np.ceil(h * s * 2 / 2) * 2)
    return ("scale=%d:%d:flags=lanczos,crop=%d:%d:%d:%d,"
            "zoompan=z='%.4f+(%.4f)*on/%d':x='iw/2-iw/zoom/2':y='(ih-ih/zoom)*%.3f':d=1:s=%dx%d:fps=%d"
            % (sw, sh, W * 2, H * 2, (sw - W * 2) // 2, int((sh - H * 2) * fy), z0, z1 - z0, max(n - 1, 1), fy, W, H, fps))


# ------------------------------------------------------------------ 9. render
def render_shot(i, s, a, tmp):
    out = os.path.join(tmp, "seg_%04d.mp4" % i)
    fps, n = a["fps"], s["f1"] - s["f0"]
    g = grade_chain(a["cfg"]["grade"])
    fy = a["cfg"]["pacing"]["face_anchor_y"]
    if s["kind"] == "a":
        src, info, ss = a["input"], a["info"], s["src_in"]
        inp = ["-ss", "%.4f" % ss, "-i", src]
    elif s["kind"] == "still":
        src, info = s["file"], {"w": 1080, "h": 1920}
        inp = ["-loop", "1", "-framerate", str(fps), "-i", src]
        g = "null"
    else:
        src, info = s["file"], s["info"]
        inp = (["-loop", "1", "-framerate", str(fps), "-i", src] if info["is_image"]
               else ["-ss", "%.4f" % s["b_in"], "-i", src])
        fy = 0.5
    fit = a["fit"] if s["kind"] in ("a", "b") else "fill"
    if fit == "letterbox" and s["kind"] == "b":
        s = dict(s, z1=s["z0"])  # letterboxed cutaways stay static, like the 16:9-in-9:16 reels
    chain = "fps=%d,%s,%s,setsar=1,format=yuv420p" % (fps, fit_chain(info["w"], info["h"], s["z0"], s["z1"], n, fps, fy, fit), g)
    if s["kind"] == "b" and s.get("layout") == "split":
        # B-roll on top ~65% with a feathered bottom edge; A-roll (base framing) stays visible below
        ainf = a["info"]
        inp = ["-ss", "%.4f" % s["src_in"], "-i", a["input"]] + inp + ["-loop", "1", "-i", a["split_mask"]]
        fc = ("[0:v]fps={fps},{afit},{g},setsar=1[base];"
              "[1:v]fps={fps},scale=1080:1250:force_original_aspect_ratio=increase,crop=1080:1250,{g},format=rgba[top];"
              "[2:v]format=gray,scale=1080:1250[m];[top][m]alphamerge[tm];[base][tm]overlay=0:0,format=yuv420p[v]").format(
            fps=fps, afit=fit_chain(ainf["w"], ainf["h"], 1.0, 1.0, n, fps, a["cfg"]["pacing"]["face_anchor_y"], a["fit"]), g=g)
        cmd = ["ffmpeg", "-y", "-v", "error"] + inp + ["-filter_complex", fc, "-map", "[v]"]
    else:
        cmd = ["ffmpeg", "-y", "-v", "error"] + inp + ["-vf", chain]
    cmd += ["-frames:v", str(n), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-r", str(fps), out]
    run(cmd)
    return out


def pop_variants(img):
    """3-frame pop-in for a PNG overlay: 82% -> 106% -> 100% scale about the element's centre."""
    box = img.getbbox()
    if not box:
        return [img]
    crop = img.crop(box)
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    outs = []
    for sc in (0.82, 1.06):
        im = G.blank()
        c = crop.resize((max(1, int(crop.width * sc)), max(1, int(crop.height * sc))))
        im.alpha_composite(c, (int(cx - c.width / 2), int(cy - c.height / 2)))
        outs.append(im)
    return outs + [img]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input")
    ap.add_argument("-o", "--out", default="iconic_out")
    ap.add_argument("--plan", help="overlay/hook/b-roll plan JSON (see templates/plan.example.json)")
    ap.add_argument("--broll", help="folder of B-roll clips / photos used for auto cutaways")
    ap.add_argument("--music", default="auto", help="music file, 'auto' (procedural ambient trap bed) or 'none'")
    ap.add_argument("--sfx-dir", help="folder with pop.wav whoosh.wav thud.wav tick.wav riser.wav shutter.wav overrides")
    ap.add_argument("--transcript", help="word-level transcript JSON (skips ASR)")
    ap.add_argument("--script", help="plain-text script; used with silence detection if no ASR is available")
    ap.add_argument("--whisper-model", default="small")
    ap.add_argument("--language", default=None)
    ap.add_argument("--caption-style", choices=["bold", "clean"], default=None)
    ap.add_argument("--highlight", choices=["keyword", "karaoke"], default=None)
    ap.add_argument("--keywords", default="", help="comma-separated words to force-highlight in lime")
    ap.add_argument("--fit", choices=["fill", "letterbox"], default="fill")
    ap.add_argument("--archetype", choices=["story", "single-take"], default=None,
                    help="story = cut-driven (punch-ins, B-roll, ASL ~2.6s); single-take = one locked framing, motion from graphics")
    ap.add_argument("--no-hook-title", action="store_true")
    ap.add_argument("--no-broll-auto", action="store_true")
    ap.add_argument("--cta", default=None, help="follow | none | dm:KEYWORD | comment:KEYWORD (default: plan or auto-detect)")
    ap.add_argument("--dry-run", action="store_true", help="plan + timeline exports only, no render")
    ap.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 2) // 2))
    a = ap.parse_args()

    cfg = json.load(open(os.path.join(SKILL, "config", "style.json")))
    plan = json.load(open(a.plan)) if a.plan else {}
    P, fps = cfg["pacing"], cfg["canvas"]["fps"]
    archetype = a.archetype or plan.get("archetype", "story")
    if archetype == "single-take":  # Deiu15UNcEb / DeiTZjLtIaS: no punch-ins, no forced splits, graphics carry the pace
        P.update(hook_max_shot_s=1e9, body_max_shot_s=1e9, punch_scale=1.0, hook_creep=[1.0, 1.0])
        a.no_broll_auto = True
    os.makedirs(a.out, exist_ok=True)
    tmp = os.path.join(a.out, "_work")
    os.makedirs(tmp, exist_ok=True)
    pal = G.Palette(cfg["palette"])

    # 1. ingest
    info = probe(a.input)
    if not info["has_audio"]:
        raise SystemExit("input has no audio stream")
    log("input %dx%d %.2fs" % (info["w"], info["h"], info["duration"]))
    wav16 = os.path.join(tmp, "audio16k.wav")
    run(["ffmpeg", "-y", "-v", "error", "-i", a.input, "-vn", "-ac", "1", "-ar", "16000", wav16])

    # 2. transcript
    if a.transcript:
        raw = load_transcript(a.transcript)
    else:
        try:
            if not _has_whisper():
                raise RuntimeError("faster-whisper not installed")
            raw = transcribe(wav16, a.whisper_model, a.language)
        except Exception as e:  # no ASR package, or the model could not be downloaded/loaded
            if not a.script:
                raise SystemExit("ASR unavailable (%s). pip install faster-whisper, or pass --transcript / --script." % e)
            log("ASR unavailable (%s) - aligning --script to speech regions (approximate timings)" % str(e)[:80])
            raw = script_fallback(wav16, a.script, info["duration"])
    json.dump(raw, open(os.path.join(a.out, "words_raw.json"), "w"), indent=0)
    words = clean_words(raw, P["fillers"])
    log("words: %d raw -> %d after filler/stutter removal" % (len(raw), len(words)))

    # 3. cut engine
    segs, total_f = build_segments(words, P, fps, info["duration"])
    removed = info["duration"] - total_f / fps
    log("cut: %d segments, %.2fs -> %.2fs (%.2fs dead air removed)" % (len(segs), info["duration"], total_f / fps, removed))

    # CTA resolution (may append a FOLLOW. card)
    cta = plan.get("cta", {"type": "auto"})
    if a.cta:
        t, _, kw = a.cta.partition(":")
        cta = {"type": t, "keyword": kw}
    if cta.get("type") == "auto":
        cta = detect_cta(words)
    elif cta.get("type") in ("dm", "comment") and "at" not in cta:
        spoken = detect_cta(words)  # anchor the card to where the CTA is actually said
        if spoken["type"] == cta["type"]:
            cta["at_word"] = spoken["at_word"]
            cta.setdefault("keyword", spoken["keyword"])
    follow_append = cta["type"] == "follow" and not (words and norm(words[-1]["w"]) == "follow")

    # 4. shot engine
    shots = split_shots(segs, words, P, fps)
    broll_files = []
    if a.broll and os.path.isdir(a.broll):
        broll_files = sorted(os.path.join(a.broll, f) for f in os.listdir(a.broll) if f.lower().endswith(VIDEO_EXT + IMAGE_EXT))
    binfo = {f: probe(f) for f in broll_files}
    cues = []
    cursor = {f: 0.3 for f in broll_files}
    for c in plan.get("broll", []):
        win = resolve_window(c, words, total_f / fps)
        if win and os.path.exists(c["file"]):
            binfo.setdefault(c["file"], probe(c["file"]))
            cues.append({"f0": int(win[0] * fps), "f1": int(win[1] * fps), "file": c["file"], "layout": c.get("layout", "full"),
                         "b_in": float(c.get("from", 0.3)), "info": binfo[c["file"]]})
    slots = [] if (a.no_broll_auto or plan.get("broll")) else choose_broll_slots(shots, total_f, P, fps, len(broll_files))
    suggested = []
    for k, (f0, f1) in enumerate(slots):
        if broll_files:
            f = broll_files[k % len(broll_files)]
            inf = binfo[f]
            dur = (f1 - f0) / fps
            start = cursor[f] if inf["is_image"] or cursor[f] + dur < inf["duration"] else 0.0
            cursor[f] = start + dur + 0.5
            cues.append({"f0": f0, "f1": f1, "file": f, "layout": "full", "b_in": start, "info": inf})
        else:
            suggested.append((f0, f1))
    shots = paint_broll(shots, total_f, cues, fps, min_a=int(0.45 * fps))
    for s in shots:  # B-roll keeps the A-roll source time too (split layout + EDL audio events)
        s["src_in"] = frame_to_src(s["f0"], segs, fps)
    assign_zoom(shots, P)
    if follow_append:
        card_png = os.path.join(tmp, "cta_follow.png")
        G.cta(pal, "follow").save(card_png)
        shots.append({"kind": "still", "file": card_png, "f0": total_f, "f1": total_f + int(0.7 * fps), "z0": 1.0, "z1": 1.02})
    final_f = shots[-1]["f1"]
    total_s = final_f / fps

    # 5/6. text + graphics plan
    hook = None
    if not a.no_hook_title:
        hook = dict(plan["hook"]) if plan.get("hook") else auto_hook(words, cfg["hook_title"])
        if "end" not in hook:
            hook["end"] = min(float(hook.get("dur", cfg["hook_title"]["max_len_s"])), total_s)
        if isinstance(hook.get("headline"), str):
            hook["headline"] = hook["headline"].split("|")
    capcfg = plan.get("captions", {})
    style_name = a.caption_style or capcfg.get("style", "bold")
    hl = a.highlight or capcfg.get("highlight", "keyword")
    keywords = {norm(k) for k in (a.keywords.split(",") if a.keywords else capcfg.get("keywords", [])) if norm(k)}
    if hook is not None:
        hook["captions_during_hook"] = capcfg.get("during_hook", False)

    overlays, sfx_events = [], [(0.0, "thud")]
    for k, ov in enumerate(plan.get("overlays", [])):
        win = resolve_window(ov, words, total_f / fps)  # "end": -1 = end of speech (never over the end card)
        if not win:
            continue
        t = ov["type"]
        if t == "card":
            imgs = [G.card(pal, ov.get("kicker", ""), ov.get("title", ""), ov.get("accent", "lime"), ov.get("position", "top"), ov.get("icon"), ov.get("strike", False))]
            sfx_events.append((win[0], "pop"))
        elif t == "pill":
            imgs = [G.pill(pal, ov["left"], ov["right"], ov.get("center_y", 1110))]
            sfx_events.append((win[0], "pop"))
        elif t == "checklist":
            items = [tuple(x) for x in ov["items"]]
            step = min(0.45, (win[1] - win[0]) / (len(items) + 1))
            for r in range(len(items) + 1):
                a0 = win[0] + r * step
                a1 = win[0] + (r + 1) * step if r < len(items) else win[1]
                overlays.append({"img": G.checklist(pal, ov["title"], items, r), "a": a0, "b": a1, "pop": r == 0, "type": t})
                sfx_events.append((a0, "pop" if r == 0 else "tick"))
            continue
        elif t == "rulecard":
            imgs = [G.rulecard(pal, ov["number"], ov.get("subtitle", ""), ov.get("kicker", ""))]
            sfx_events += [(win[0], "thud"), (max(0, win[0] - 0.3), "whoosh")]
        elif t == "recframe":
            imgs = [G.recframe(pal)]
        elif t == "photo":
            imgs = [G.proof_photo_frame(pal, ov["file"], ov.get("center_y", 880))]
            sfx_events.append((win[0], "shutter"))
        else:
            log("unknown overlay type", t)
            continue
        overlays.append({"img": imgs[0], "a": win[0], "b": win[1], "pop": t not in ("rulecard", "recframe"), "type": t})
    if cta["type"] in ("dm", "comment") and cta.get("keyword"):
        at = cta["at_word"]["os"] if cta.get("at_word") else max(0, (total_f / fps) - 3.0)
        if "at" in cta:
            hit = find_phrase(words, cta["at"])
            at = hit[0] if hit else at
        overlays.append({"img": G.cta(pal, cta["type"], cta["keyword"]), "a": at, "b": total_s, "pop": True, "type": "cta"})
        sfx_events += [(at, "riser"), (at, "pop")]
    if cta["type"] == "follow":
        sfx_events.append(((total_f / fps) if follow_append else words[-1]["os"], "thud"))
        if not follow_append:
            overlays.append({"img": G.cta(pal, "follow"), "a": words[-1]["os"], "b": total_s, "pop": False, "type": "cta"})
    for s in shots:
        if s["kind"] == "b" and s["f0"] > 0:
            sfx_events.append((s["f0"] / fps, "shutter" if s["info"]["is_image"] else "whoosh"))
            if not s["info"]["is_image"]:
                sfx_events[-1] = (max(0, s["f0"] / fps - 0.3), "whoosh")

    # z-order: cards < CTA < full-screen rule cards (captions burn on top of all, muted under rule cards)
    zorder = {"recframe": 0, "cta": 2, "rulecard": 3}
    overlays.sort(key=lambda o: zorder.get(o["type"], 1))
    mute = [(o["a"], o["b"]) for o in overlays if o["type"] == "rulecard" or (o["type"] == "cta" and cta["type"] == "follow")]
    ass = build_ass(words, cfg, style_name, hl, keywords, hook, total_s, fps, a.fit, mute)
    ass_path = os.path.join(a.out, "captions.ass")
    open(ass_path, "w").write(ass)

    # ---- exports (Mode B) ----
    write_exports(a, shots, words, segs, overlays, sfx_events, hook, suggested, cta, fps, total_s, info)
    if a.dry_run:
        log("dry run: exports written to", a.out)
        return

    # 9. render video segments
    split_mask = os.path.join(tmp, "split_mask.png")
    _split_mask(split_mask)
    ctx = {"input": a.input, "info": info, "cfg": cfg, "fps": fps, "fit": a.fit, "split_mask": split_mask}
    log("rendering %d shots with %d workers" % (len(shots), a.jobs))
    with ThreadPoolExecutor(a.jobs) as ex:
        segfiles = list(ex.map(lambda p: render_shot(p[0], p[1], ctx, tmp), enumerate(shots)))
    lst = os.path.join(tmp, "concat.txt")
    open(lst, "w").write("".join("file '%s'\n" % os.path.abspath(f) for f in segfiles))
    base = os.path.join(tmp, "base.mp4")
    run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", base])

    # 8. audio
    voice = build_voice(a.input, segs, fps, tmp, cfg["audio"], (final_f - total_f) / fps)
    music = build_music(a.music, total_s, tmp, cfg["audio"])
    sfx_track = SFX.build_sfx_track(sfx_events, total_s, cfg["audio"]["sfx_db"], a.sfx_dir)
    sfx_wav = os.path.join(tmp, "sfx.wav")
    SFX.write_wav(sfx_wav, sfx_track)

    # final composite
    inputs = ["-i", base, "-i", voice, "-i", sfx_wav]
    if music:
        inputs += ["-i", music]
    fc, last, idx = [], "0:v", 4 if music else 3
    if hook:
        gp = os.path.join(tmp, "grad.png")
        G.gradient(cfg["hook_title"]["gradient_alpha"], cfg["hook_title"]["gradient_from_y"]).save(gp)
        inputs += ["-loop", "1", "-framerate", str(fps), "-t", "%.3f" % hook["end"], "-i", gp]
        fc.append("[%d:v]format=rgba,fade=t=out:st=%.3f:d=0.15:alpha=1[g]" % (idx, max(0, hook["end"] - 0.15)))
        fc.append("[%s][g]overlay=0:0:eof_action=pass[v%d]" % (last, idx))
        last, idx = "v%d" % idx, idx + 1
    for k, ov in enumerate(overlays):
        frames = pop_variants(ov["img"]) if ov["pop"] else [ov["img"]]
        start_f, end_f = int(round(ov["a"] * fps)), int(round(ov["b"] * fps))
        for j, im in enumerate(frames):
            pth = os.path.join(tmp, "ov_%03d_%d.png" % (k, j))
            im.save(pth)
            # integer frame windows: pop variants get exactly one frame each, the settled image the rest
            f0 = start_f + j
            f1 = f0 + 1 if j < len(frames) - 1 else end_f
            if f1 <= f0:
                continue
            inputs += ["-loop", "1", "-framerate", str(fps), "-t", "%.4f" % ((f1 - f0 + 1) / fps), "-i", pth]
            fc.append("[%d:v]setpts=PTS-STARTPTS+%d/(%d*TB)[o%d]" % (idx, f0, fps, idx))
            fc.append("[%s][o%d]overlay=0:0:eof_action=pass:enable='between(t,%.5f,%.5f)'[v%d]"
                      % (last, idx, (f0 - 0.5) / fps, (f1 - 0.5) / fps, idx))
            last, idx = "v%d" % idx, idx + 1
    fc.append("[%s]ass=%s:fontsdir=%s,format=yuv420p[vout]" % (last, _esc(ass_path), _esc(FONT_DIR)))
    A = cfg["audio"]
    if music:
        fc.append("[1:a]asplit=2[vo][sc]")
        # measured: music -30 LUFS pre-duck -> ~-34 LUFS under speech = ~20 dB below the -14 LUFS voice
        fc.append("[3:a][sc]sidechaincompress=threshold=%s:ratio=%s:attack=15:release=350:makeup=1[mu]" % (A["duck_threshold"], A["duck_ratio"]))
        fc.append("[vo][mu][2:a]amix=inputs=3:normalize=0:duration=first,alimiter=limit=0.89:level=false[aout]")
    else:
        fc.append("[1:a][2:a]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.89:level=false[aout]")
    fcs = os.path.join(tmp, "final_filter.txt")
    open(fcs, "w").write(";\n".join(fc))
    final = os.path.join(a.out, "final.mp4")
    log("compositing overlays, captions and audio")
    run(["ffmpeg", "-y", "-v", "error"] + inputs + ["-filter_complex_script", fcs, "-map", "[vout]", "-map", "[aout]",
         "-t", "%.3f" % total_s, "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(fps),
         "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", final])
    contact(final, shots, fps, os.path.join(a.out, "contact_sheet.jpg"))
    log("done ->", final)


def _has_whisper():
    import importlib.util
    return importlib.util.find_spec("faster_whisper") is not None


def _esc(p):
    return p.replace("\\", "/").replace(":", "\\:").replace("'", "\\'").replace(",", "\\,")


def _split_mask(path):
    from PIL import Image
    col = Image.new("L", (1, 1250))
    for y in range(1250):
        col.putpixel((0, y), 255 if y < 1030 else int(255 * (1250 - y) / 220))
    col.resize((1080, 1250)).save(path)


def build_voice(src, segs, fps, tmp, A, tail_s):
    fade = 0.008
    parts, labels = [], []
    for i, sg in enumerate(segs):
        d = sg["frames"] / fps
        parts.append("[0:a]atrim=start=%.4f:end=%.4f,asetpts=PTS-STARTPTS,aresample=48000,"
                     "afade=t=in:d=%.3f,afade=t=out:st=%.4f:d=%.3f[s%d]" % (sg["src_in"], sg["src_in"] + d, fade, d - fade, fade, i))
        labels.append("[s%d]" % i)
    if tail_s > 0:
        parts.append("aevalsrc=0:d=%.4f:s=48000[tail]" % tail_s)
        labels.append("[tail]")
    parts.append("%sconcat=n=%d:v=0:a=1,aformat=channel_layouts=mono,highpass=f=80,lowpass=f=16000,"
                 "acompressor=threshold=0.1:ratio=3:attack=5:release=80:makeup=2,"
                 "loudnorm=I=%s:TP=%s:LRA=7,aresample=48000,aformat=channel_layouts=stereo[out]" % ("".join(labels), len(labels), A["voice_lufs"], A["voice_tp"]))
    script = os.path.join(tmp, "voice_filter.txt")
    open(script, "w").write(";\n".join(parts))
    out = os.path.join(tmp, "voice.wav")
    run(["ffmpeg", "-y", "-v", "error", "-i", src, "-filter_complex_script", script, "-map", "[out]", out])
    return out


def build_music(arg, total_s, tmp, A):
    if arg == "none":
        return None
    src = arg
    if arg == "auto":
        src = os.path.join(tmp, "bed.wav")
        SFX.write_wav(src, SFX.bed(total_s + 1, A["music_bpm"]))
    out = os.path.join(tmp, "music.wav")
    run(["ffmpeg", "-y", "-v", "error", "-stream_loop", "-1", "-i", src, "-t", "%.3f" % total_s,
         "-af", "loudnorm=I=-14:TP=-1,volume=%sdB,afade=t=out:st=%.3f:d=1.2,aresample=48000,aformat=channel_layouts=stereo"
         % (A["music_rel_db"], max(0, total_s - 1.2)), out])
    return out


def contact(final, shots, fps, path):
    from PIL import Image
    imgs = []
    picks = shots if len(shots) <= 24 else [shots[int(i * len(shots) / 24)] for i in range(24)]
    for s in picks:
        t = (s["f0"] + s["f1"]) / 2 / fps
        fp = path + ".tmp.png"
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", "%.3f" % t, "-i", final, "-frames:v", "1", fp])
        if os.path.exists(fp):
            imgs.append(Image.open(fp).copy())
            os.remove(fp)
    sheet = G.contact_sheet(imgs, cols=6, thumb_w=216)
    if sheet:
        sheet.save(path, quality=88)


def write_exports(a, shots, words, segs, overlays, sfx_events, hook, suggested, cta, fps, total_s, info):
    """Mode B: frame-accurate NLE blueprint (markdown table, CSV, CMX3600 EDL) + resolved plan.json."""
    def caps_in(t0, t1):
        return " ".join(w["w"] for w in words if t0 <= w["os"] < t1)

    def ov_in(t0, t1):
        return "; ".join("%s@%.2f" % (o["type"], o["a"]) for o in overlays if t0 <= o["a"] < t1)

    def sfx_in(t0, t1):
        return ", ".join("%s@%.2f" % (k, t) for t, k in sorted(sfx_events) if t0 <= t < t1)

    rows = []
    for i, s in enumerate(shots):
        t0, t1 = s["f0"] / fps, s["f1"] / fps
        if s["kind"] == "a":
            vis = "A-ROLL %d%%%s" % (round(s["z0"] * 100), (" -> %d%% creep" % round(s["z1"] * 100)) if s["z1"] != s["z0"] else "")
            src = "%.3f-%.3f" % (s["src_in"], s["src_in"] + t1 - t0)
            if any(f0 <= s["f0"] < f1 for f0, f1 in suggested):
                vis += "  [B-ROLL SLOT: cover with proof/lifestyle clip]"
        elif s["kind"] == "b":
            vis = "B-ROLL %s%s push 100->105%%" % (os.path.basename(s["file"]), " (split top 65%)" if s.get("layout") == "split" else "")
            src = "%.3f-%.3f" % (s["b_in"], s["b_in"] + t1 - t0)
        else:
            vis, src = "END CARD 'FOLLOW.'", "-"
        rows.append({"#": i + 1, "rec_in": tc(s["f0"], fps), "rec_out": tc(s["f1"], fps), "in_s": "%.3f" % t0, "out_s": "%.3f" % t1,
                     "dur_s": "%.2f" % (t1 - t0), "visual": vis, "source": src, "captions": caps_in(t0, t1),
                     "overlays": ov_in(t0, t1), "sfx": sfx_in(t0, t1)})
    with open(os.path.join(a.out, "timeline.csv"), "w", newline="") as fh:
        wr = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        wr.writeheader()
        wr.writerows(rows)
    md = ["# Iconic Elevation edit - frame-accurate timeline", "",
          "Source: `%s` (%.2fs) -> edit %.2fs @ %d fps, 1080x1920. Cut %d pauses > 0.15s, ASL %.2fs over %d shots." %
          (os.path.basename(a.input), info["duration"], total_s, fps, max(0, len(segs) - 1), total_s / max(1, len(shots)), len(shots)), ""]
    if hook:
        md.append("**Hook title (0.00-%.2fs):** kicker `%s` / headline `%s` (lime line %s) over 82%% bottom gradient, thud SFX @0.00." %
                  (hook["end"], " / ".join(hook.get("kicker", []) if isinstance(hook.get("kicker"), list) else [hook.get("kicker", "")]),
                   " / ".join(hook["headline"]), hook.get("lime_lines", [len(hook["headline"]) - 1])))
    md.append("**CTA:** %s" % (cta["type"] + (" '%s'" % cta.get("keyword") if cta.get("keyword") else "")))
    md += ["", "| # | Rec In | Rec Out | Dur | Visual cut / zoom | Source in-out (s) | Spoken / captions | Overlays | SFX |",
           "|---|---|---|---|---|---|---|---|---|"]
    for r in rows:
        md.append("| %s | %s | %s | %s | %s | %s | %s | %s | %s |" % (r["#"], r["rec_in"], r["rec_out"], r["dur_s"], r["visual"],
                                                                     r["source"], r["captions"].replace("|", "/"), r["overlays"], r["sfx"]))
    md += ["", "Grade: eq contrast 1.08 / saturation 1.14 / gamma 0.98, cool shadows +0.03 B, warm highlights +0.02 R, vignette 0.45 rad, unsharp 0.4, no grain.",
           "Mix: voice -14 LUFS (TP -1), music -30 LUFS bed ducked by sidechain to ~-34 LUFS under speech (~20 dB below voice), SFX levels per config/style.json."]
    open(os.path.join(a.out, "timeline.md"), "w").write("\n".join(md) + "\n")
    edl = ["TITLE: ICONIC_ELEVATION_EDIT", "FCM: NON-DROP FRAME", ""]
    ev = 1
    for s in shots:
        rec_in, rec_out = tc(s["f0"], fps), tc(s["f1"], fps)
        n = s["f1"] - s["f0"]
        if s["kind"] == "a":
            si = int(round(s["src_in"] * fps))
            edl.append("%03d  AX       B     C        %s %s %s %s" % (ev, tc(si, fps), tc(si + n, fps), rec_in, rec_out))
            edl.append("* FROM CLIP NAME: %s" % os.path.basename(a.input))
            edl.append("* ZOOM %d%%%s" % (round(s["z0"] * 100), " TO %d%%" % round(s["z1"] * 100) if s["z1"] != s["z0"] else ""))
        elif s["kind"] == "b":
            bi = int(round(s["b_in"] * fps))
            edl.append("%03d  BX       V     C        %s %s %s %s" % (ev, tc(bi, fps), tc(bi + n, fps), rec_in, rec_out))
            edl.append("* FROM CLIP NAME: %s" % os.path.basename(s["file"]))
            ev += 1
            si = int(round(frame_to_src(s["f0"], segs, fps) * fps))
            edl.append("%03d  AX       A     C        %s %s %s %s" % (ev, tc(si, fps), tc(si + n, fps), rec_in, rec_out))
            edl.append("* FROM CLIP NAME: %s" % os.path.basename(a.input))
        else:
            edl.append("%03d  BL       V     C        00:00:00:00 %s %s %s" % (ev, tc(n, fps), rec_in, rec_out))
            edl.append("* END CARD: FOLLOW.")
        edl.append("")
        ev += 1
    open(os.path.join(a.out, "timeline.edl"), "w").write("\n".join(edl))
    resolved = {"fps": fps, "duration_s": total_s, "hook": hook, "cta": {k: v for k, v in cta.items() if k != "at_word"},
                "shots": [{k: v for k, v in s.items() if k not in ("info",)} for s in shots],
                "overlays": [{"type": o["type"], "start": round(o["a"], 3), "end": round(o["b"], 3)} for o in overlays],
                "sfx": [{"t": round(t, 3), "kind": k} for t, k in sorted(sfx_events)],
                "segments": [{k: sg[k] for k in ("src_in", "src_out", "frames", "out_in")} for sg in segs],
                "words": [{"w": w["w"], "start": round(w["os"], 3), "end": round(w["oe"], 3)} for w in words]}
    json.dump(resolved, open(os.path.join(a.out, "plan.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
