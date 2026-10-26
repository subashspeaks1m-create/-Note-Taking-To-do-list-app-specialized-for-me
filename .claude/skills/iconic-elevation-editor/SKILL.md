---
name: iconic-elevation-editor
description: Edit raw talking-head footage into a finished 9:16 reel in the exact @iconic_elevation Instagram style (football-career creator). The style is Anton captions with lime #BCF148 keywords, a kicker+headline hook block, alternating 100/115% jump-cut punch-ins, dead air cut above 0.15 s, proof B-roll at 0.9 s, frosted HUD cards, two-tone pills, numbered rule cards, ambient-trap bed ducked ~20 dB, and a thud/whoosh/pop SFX matrix. Use whenever the user gives a talking-head video, audio or transcript and asks to "edit this", "apply the Iconic Elevation style", or "make it like iconic_elevation", or invokes this skill. Outputs a rendered final.mp4 (Mode A) plus a frame-accurate timeline table, CSV and CMX3600 EDL for Premiere, Resolve or CapCut (Mode B).
---

# Iconic Elevation Editor

The style spec lives in `references/style-bible.md`. Its six pillars are visual, typography, pacing, graphics, audio and hook, and every number in them is measured or cross-checked. All tunable constants are in `config/style.json`. Read the bible once before the first edit in a session.

## Requirements

- `ffmpeg` built with libass (`ffmpeg -filters | grep -w ass`). Linux distro builds and Homebrew `ffmpeg` both qualify.
- Python 3.9+ with `pip install -r requirements.txt` (numpy, pillow, faster-whisper).
- Fonts are bundled in `assets/fonts` (Anton, Inter, both under OFL), so nothing needs installing system-wide.
- The faster-whisper model downloads from Hugging Face on first use. Offline, pass `--transcript words.json` or `--script script.txt`.

`S` below is the path to this skill folder.

## Workflow (follow every time)

### 1. Ingest + plan pass (fast, no render)
```bash
python S/scripts/iconic_edit.py RAW.mp4 -o OUT --dry-run [--broll BROLL_DIR]
```
This transcribes with word timestamps, drops fillers and stutters, and cuts every pause longer than 0.15 s. It then builds the shot list and writes:
- `OUT/plan.json`, with the cleaned word list including output-timeline times
- `OUT/timeline.md`

Read `OUT/plan.json` `words` and `OUT/timeline.md` before writing the plan.

### 2. Write the edit plan (`OUT/edit_plan.json`)
Copy `templates/plan.example.json` and fill it in from the transcript. Everything anchors to spoken phrases with `"at": "<words as spoken>"`, so the plan survives re-cuts. The creative rules come from the bible:

- **Archetype.** Pick one:
  - `"story"` (default): cut-driven, 115% punch-ins, B-roll.
  - `"single-take"`: a seated desk or press-wall talk where the motion comes from graphics only.
- **Hook** (first 1.5–3.0 s):
  - `kicker`: 1–2 short lines of context, ≤ 22 chars each. Example: `SCOUTED BY A TOP ENGLISH CLUB.`
  - `headline`: 1–3 lines of ≤ 12 chars, the shock or punch, ending with a period. Example: `TRAFFICKED` / `IN TURKEY.`
  - `lime_lines`: the punch line, usually the last.
  - `arrow: true` when the kicker leads into the headline. Optional `sub`: sentence-case Inter line ending with `↓`.
  - Write numbers as digits.
- **Captions:**
  - Use `bold` (Anton, uppercase, 1–4 words, lime keyword) by default.
  - Use `clean` only for long confessional storytelling (the viral DXc1R1GjFR_ look).
  - Use `highlight: "karaoke"` only when the talk is very fast. Otherwise use `keyword`.
  - Put the 3–6 words that carry the stakes in `keywords`: outcomes, money, time, the CTA word.
- **Graphics cadence:** one new overlay every **3–5 s** after the hook. Never two pops within 1 s.
  - `card`: section header (`position: top`) or side badge (`upper-right`) with `icon` set to one of chat, check, x, bolt, trend, clock or people. Use `strike: true` for "IT'S NOT ~~X~~".
  - `pill`: a two-word contrast that lands as a punchline, e.g. `GOOD` + `ENOUGH?` or `RIGHT` + `PLACE`.
  - `checklist`: any list of 2–4 items. Use `x` for wrong, `check` for right, `strike` to cross out.
  - `rulecard`: every numbered rule or step (`01`, `02` …), 0.8–1.2 s, captions auto-muted.
  - `photo`: a proof photo inset with lime focus brackets. `recframe` gives the "behind the scenes" REC look.
- **B-roll:**
  - The proof clip or photo for the hook's claim goes at about **0.9 s**.
  - Then cover about 30% of the body with 0.9–2.6 s cutaways on the nouns being described.
  - `layout: "split"` keeps the speaker visible below a feathered top panel.
  - Without footage, leave `broll` empty. Auto mode marks the slots as `[B-ROLL SLOT]` in the timeline.
- **CTA:**
  - If the speaker says "DM me X" or "comment X", use `{"type":"dm"|"comment","keyword":"X"}`. The card anchors to the spoken words automatically.
  - If they say "follow", use `{"type":"follow"}` for the black `FOLLOW.` end card.
  - Otherwise use `"none"`, and the reel ends on the strongest line.

### 3. Render (Mode A)
```bash
python S/scripts/iconic_edit.py RAW.mp4 -o OUT --plan OUT/edit_plan.json [--broll DIR] [--music track.mp3|auto|none] [--sfx-dir DIR] [--fit letterbox]
```
- Use `--music auto` for the procedural ambient-trap bed at 118 BPM. Prefer a licensed track the user supplies, since it is mixed to the same −20 dB target.
- Use `--fit letterbox` for 16:9 sources that should stay 16:9 inside 9:16, as in Demvr5Ouxvk.
- Reuse `--transcript OUT/words_raw.json` on re-renders to skip ASR.

### 4. QA before delivering (mandatory)
1. Open `OUT/contact_sheet.jpg`, which shows one frame per shot. Check that:
   - captions never cover the face
   - cards sit on the chest or top
   - the hook block reads cleanly
   - punch-ins alternate
   - no caption sits under a rule card
2. Spot-check any overlay you doubt by extracting frames with `ffmpeg -ss T -i OUT/final.mp4 -frames:v 1 f.png`.
3. Fix the plan and re-render. Only tweak `config/style.json` when the footage itself demands it, for example `face_anchor_y` for unusual framing.

### 5. Deliver both modes
- **Mode A:** `OUT/final.mp4`, 1080×1920, 30 fps, H.264 CRF 18, AAC 192k, −14 LUFS.
- **Mode B:**
  - `OUT/timeline.md`: a `Rec In | Rec Out | Dur | Visual cut/zoom | Source in-out | Spoken/captions | Overlays | SFX` table at 30 fps timecode.
  - `OUT/timeline.csv`
  - `OUT/timeline.edl`: CMX3600, importable in Premiere and Resolve. Zoom is noted as `* ZOOM 115%` comments.
  - `OUT/captions.ass`: styled subtitles, importable in Resolve or Aegisub.

Report the before and after duration, how much dead air was cut, the ASL, and anything the footage forced you to change.

## What the engine does automatically (no plan needed)
- Filler and stutter removal; pause cutting above 0.15 s (40 ms in, 60 ms out); 8 ms splice fades.
- Shot splitting at sentence starts or power words: hook ≤ 1.7 s, body ≤ 3.2 s. The 100% ↔ 115% punch alternates with the face held at 38%. The opening shot creeps 100 → 103%.
- B-roll from `--broll`: a proof flash at 0.9 s, then every third body shot up to 30% coverage, each with a 100 → 105% push and a whoosh or shutter.
- An auto hook headline from the first sentence. This is weaker than a written one, so always write it in step 2.
- CTA detection ("DM me X", "comment X", "follow").
- Grade: contrast 1.08, saturation 1.14, gamma 0.98, cool shadows, warm highlights, vignette 0.45, unsharp 0.4, no grain.
- Mix: voice −14 LUFS; bed −30 LUFS, sidechain-ducked to about −34 LUFS; SFX per the matrix; limiter at −1 dBTP.

## Files
- `scripts/iconic_edit.py`: the full pipeline (CLI). `--help` lists every flag.
- `scripts/graphics.py`: overlay renderers (cards, pills, checklists, rule cards, CTA, REC frame, proof photo).
- `scripts/sfx_synth.py`: procedural SFX and music bed. Override any SFX by dropping `pop|tick|whoosh|thud|riser|shutter.wav` into `--sfx-dir`.
- `scripts/make_test_clip.py`: offline regression clip (flite TTS + fillers + pauses). Run it and render it with `templates/plan.example.json` after changing the engine.
- `config/style.json`: every constant (palette, sizes, pacing, grade, mix).
- `references/style-bible.md`: the forensic analysis and its evidence.

## Known limits (say so when relevant)
- Bespoke one-off UI mock-ups seen on the page are not templated. These are the iMessage bubble, the Transfermarkt table, range slider, flip calendar and bezier route chart. Build them as a PNG and add a `photo`-type overlay, or describe them in the Mode B table for a human editor.
- Backdrop blur on cards is approximated with 75% opacity.
- Face position is assumed, not detected. Adjust `pacing.face_anchor_y` if the speaker sits unusually high or low in frame.
- The `--script` fallback (no ASR) aligns words approximately; use real ASR for frame-tight karaoke.
