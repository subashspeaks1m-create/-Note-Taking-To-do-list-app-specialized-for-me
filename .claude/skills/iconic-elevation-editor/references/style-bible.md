# @iconic_elevation — Forensic Style Bible

Analysed on 2026-10-26. Sample: the 12 reels on the first page of the Reels tab (2 pinned plus the 10 newest, posted 2026-04-22 to 2026-10-24). That gives 11 distinct analyses, because DehFkogO97C's analysis came back as a duplicate of DehqSKWNJAr.

## Provenance (read first)

| Source | What it gave | Accuracy |
|---|---|---|
| **Measured by pixel analysis** on 12 reel covers + 12 mid-reel frames | accent hex, white hex, caption/headline Y-bands, cap heights, font match, tonal stats | exact within JPEG noise |
| **Font overlay test** (Anton, Bebas Neue, Oswald 600/700 and Inter ExtraBold rendered against the "TRAFFICKED IN TURKEY." cover) | display-font match → **Anton** | visual match |
| **AI scene-by-scene watch** of each reel (vidIQ short-form watcher, prompted for a forensic edit breakdown) | shot lists to 0.1 s, punch-in %, graphics inventory, SFX timestamps, music genre/BPM, captions behaviour | estimates; cross-checked across reels, and where they contradicted the pixels the **pixels won** (e.g. the watcher's lime hexes ranged #4EFA24–#D2FB3F; measured is #BCF148) |
| **Loudness measurement** (EBU R128) of the skill's own renders | mix targets verified | exact |

Instagram itself blocks this environment's network, so the raw MP4s could not be downloaded and frame-stepped locally. Everything below is either measured or agreed across several independent reel analyses. Single-reel claims are flagged.

---

## Pillar 1 — Visual & colour DNA

**Grade = clean commercial Rec.709 with extra punch. No film emulation.**

| Parameter | Value | Evidence |
|---|---|---|
| Contrast | medium-high (eq contrast ≈ 1.08) | all 11 analyses; measured cover luminance p5 0–39, p95 178–246 |
| Saturation | boosted on pitch greens and stadium reds (≈ 1.14) | 9/11 analyses; mean cover saturation 0.24–0.37 |
| White balance | neutral → slightly cool daylight; warm skin preserved | 8/11 |
| Shadows / highlights | cool shadows (+B), warm highlights (+R), *subtle* (teal/orange in dusk-stadium A-roll) | De251QQNRYj, DehqSKWNJAr |
| Vignette | subtle edge vignette (≈ 0.45 rad) | 7/11 |
| Grain / halation / light leaks | **none**: "clean digital, zero film grain" | 11/11 |
| Depth of field | shallow (f/1.8–2.8 look) on outdoor A-roll | DehqSKWNJAr, DehFkogO97C |
| Locations (A-roll) | real pro stadiums, pitches, press-conference sponsor walls, desks | all |
| Framing | 9:16, medium (waist-up) A-roll, subject centred, eyes ≈ 33–38 % from top | covers |
| Exception | one reel is a 16:9 landscape take letterboxed in 9:16 with black bars, captions inside the picture's bottom edge (Demvr5Ouxvk) | cover |

### Palette (hex)

| Token | Hex | Use |
|---|---|---|
| **Lime (brand accent)** | **#BCF148** | keyword highlight, headline punch line, numbers, icons, progress bars. Median of 13,500 pixels across 10 covers; per-cover medians #B8FA47–#CDE64E |
| White | #FFFFFF (renders ≈ #F4F3EF) | base text |
| Card black | #121212 @ 75 % | frosted UI cards |
| Pill dark | #1A1A1A | left half of two-tone pills |
| Ink | #0B0B0B | text on lime |
| Negative red | #FF3B30 | ✕ marks, strike-through (`~~FOOTBALL~~`), "CASH COW" badge |
| Rule-card glow | #12280A radial on #000000 | full-screen numbered cards |

## Pillar 2 — Typography & caption architecture

### Display font: **Anton** (open-source match; the creator's likely tool font is "The Bold Font"/Anton-class)
Heavy, ultra-condensed grotesque, ALL CAPS, default tracking, very tight leading. Headlines **end with a period** ("IN TURKEY.", "NOBODY FILMS.", "GAME TOO.", "GOOD.").

### Body font: **Inter SemiBold** (open-source match)
Sentence-case sub-lines ("What to reply when a club shows interest ↓", "Unguided enthusiasm gets kids fooled.") and the "clean" caption variant.

### Measured geometry (1080×1920)

| Element | Cap height | Y position | Notes |
|---|---|---|---|
| Hook **headline** | 5.8–7.8 % → **≈124 px** | lines in the 62–85 % band, last baseline ≈ 1610 px | 1–3 lines, inter-line gap ≈ 15–30 px |
| Hook **kicker** (subhead above headline) | 2.5–2.8 % → **≈50 px** | directly above headline, gap ≈ 34 px | white Anton caps; optional lime dotted ↓ arrow between kicker and headline |
| Hook sub-line | ≈ 30 px | below headline | Inter SemiBold, sentence case, often ends with ↓ |
| Running captions (bold) | ≈ 4 % → **74 px** | centre ≈ **1340 px (70 %)**; measured 64–72 % | 1–4 words, max ~18 chars/line, 2 lines max |
| Running captions (clean) | ≈ 44 px | centre ≈ 1530 px (80 %) | sentence case, 3–8 words (only the viral DXc1R1GjFR_) |
| Letterbox captions | ≈ 38 px | inside the picture's bottom edge ≈ 1205 px | Demvr5Ouxvk |
| Top header / badge | kicker 30 px, title 64 px | 7.5–12 % from top, or upper-right 25–35 % | inside frosted card |

Alignment is **left at x = 88 px** for editorial hook blocks (3 of 7 covers) and **centred** for the rest.

### Animation & emphasis
- Chunks: **1–4 words** (10/11 reels), synced to speech, hard replace between chunks.
- Pop: **105 % → 100 % in ≈2 frames (70 ms)** per chunk. The hook headline uses 108 % → 100 % over 100 ms, staggered 80 ms per line.
- Highlight: **one lime word per chunk**, roughly every second chunk. Targets are numbers, stakes/outcome words (SIGNED, YEARS, WEIGHT, PATHWAY) and the sentence's last word. 3/11 reels do word-by-word karaoke (the active word turns lime).
- Stroke: thin black outline (≈3 px) plus soft drop shadow (≈4 px, 60 %). Not the thick meme stroke.
- Numbers are always digits: "8 SECONDS", "4 YEARS → 8 MONTHS", "16–23".

## Pillar 3 — Pacing, cuts & camera movement

Two archetypes appear on the page:

| Archetype | Reels | ASL | Signature |
|---|---|---|---|
| **Story (cut-driven)** | DXc1R1GjFR_, DeU4OWNOUPa, De3VPYLNwyv, De251QQNRYj, Deh4AJZNzN0, DehqSKWNJAr, DegKJNNNl32 | **2.07–3.41 s** (median ≈ 2.65 s) | alternating 100 % ↔ 115 % jump-cut punch-ins, B-roll cutaways |
| **Single-take (graphic-driven)** | Deiu15UNcEb, DeiTZjLtIaS, DemvnPZO3cA | 7–15 s | locked framing, motion carried by headers/badges/pills changing every 3–6 s |

### Per-reel measurements

| Reel | Dur | Shots | ASL | Non-A-roll share | First cut | Punch-ins |
|---|---|---|---|---|---|---|
| DXc1R1GjFR_ (152.6K plays) | 69.0 s | 26 | 2.65 s | 24 % B-roll | 0.9 s → proof B-roll | 7 × 115 % |
| DeU4OWNOUPa | 49.5 s | 17 | 2.91 s | 39 % B-roll/graphic | 0.9 s → proof photo | 2 × 115 % |
| De3VPYLNwyv | 35.2 s | 17 | 2.07 s | 33 % (4 rule cards + B-roll) | 2.6 s | 115–120 % |
| De251QQNRYj | 56.9 s | 23 | 2.47 s | 61 % B-roll | 2.8 s (opens on B-roll) | none |
| Deh4AJZNzN0 | 25.4 s | 8 | 3.18 s | 33 % feathered photo overlays | 3.5 s | 112 % |
| DehqSKWNJAr | 37.5 s | 11 | 3.41 s | 19 % split-screen B-roll | 3.4 s | 5 × 115 % |
| DegKJNNNl32 | 37.3 s | 8 | 4.66 s | 25 % split-screen | 5.8 s | 2 × 115 % |
| DemvnPZO3cA / Demvr5Ouxvk | 27.2 s | 7 | 3.89 s | 0 % | 1.8 s (axis flip) | 125 % once |
| Deiu15UNcEb | 43.8 s | 3 | single take | 15 % | 37 s | none |
| DeiTZjLtIaS | 64.5 s | 6 | single take | 14 % split | 20.9 s | none |

### Rules extracted
- **Cut type:** hard cuts in roughly 98 % of transitions. No whip-pans, glitches or flash frames. A rare 0.2 s cross-dissolve appears only in the single-take desk reels.
- **Dead air:** every breath and pause is removed. The analyses put the threshold at >80 ms, >120 ms and >150 ms; the skill uses **>0.15 s**, with 40 ms pre-roll and 60 ms post-roll.
- **Punch-in system:** each jump cut alternates base 100 % and **115 %** (range 112–125 %), with the face kept fixed at about 38 % from the top. After a B-roll the next A-roll shot returns to 100 %.
- **Shot length:** hook shots ≤ 1.7 s, body shots ≤ 3.2 s. A "visual change event" (cut, punch, graphic pop) lands every **1.2–2.5 s**.
- **Slow creep:** 100 → 103 % on the opening A-roll shot; B-roll gets a slow push from 100 to 105 %.
- **Speed ramps / camera shake:** none.
- **B-roll:** football proof (training drills, matches, signings, jersey photos, player portraits). Its audio is muted while the voice continues. Typical length is **0.9–2.6 s**. The signature move is a **"proof flash" at 0.9 s** (a photo or clip proving the claim) in the two best performers.
- **B-roll layouts:** full-screen cut, **split** (B-roll on the top 60–70 % with a feathered edge, A-roll below), feathered photo overlay, and a centred proof-photo inset with lime focus brackets.

## Pillar 4 — Overlays, VFX & motion graphics

Design language: **iOS dark-mode HUD**. Rounded rectangles (r ≈ 28 px), #121212 at 75 %, a 1 px white hairline at 12 %, soft drop shadow, lime line icons and Anton text.

| Element | Seen in | Spec |
|---|---|---|
| Hook block (kicker → lime dotted arrow → 1–3 line headline, last line lime, period) + bottom gradient | 7/12 covers | gradient from 50 % height to 82 % black at the bottom |
| Top header tracker (kicker plus title in a frosted card, updates per section) | Deiu15UNcEb, DeiTZjLtIaS, Deh4AJZNzN0, DegKJNNNl32 | 7.5–12 % from top |
| Side badge with icon (moon, people, chat, bolt, trophy) | DehqSKWNJAr, DegKJNNNl32 | upper-right, 25–35 % |
| **Two-tone pill**: `GOOD` (white on #1A1A1A) + `ENOUGH?` (ink on lime) | DemvnPZO3cA ×5 | spring pop 0 → 105 → 100 % |
| Checklist card (✕ red / ✔ lime, rows revealed one at a time with ticks) | DeU4OWNOUPa, De251QQNRYj | chest area |
| Full-screen **rule card** (black, #12280A radial glow, giant lime "01", white subtitle) | De3VPYLNwyv ×4 | thud + whoosh |
| UI mock-ups: video player with lime progress bar, slow-mo speed chip, waveform, iMessage bubble, Transfermarkt table, range slider, flip-calendar counter, bezier route chart | De3VPYLNwyv, DeU4OWNOUPa, Deiu15UNcEb, De251QQNRYj | bespoke per reel |
| REC viewfinder corners + red dot | Deh4AJZNzN0 | whole reel |
| Logo blur (mosaic over a club crest) to build curiosity | DXc1R1GjFR_ hook | 0–0.9 s |
| CTA keyword card (chat icon + "DM ME / 'PATHWAY'") | De251QQNRYj, DehqSKWNJAr, DegKJNNNl32 | last ~3 s |
| "FOLLOW." black end card | DeU4OWNOUPa | final 0.6 s, word spoken simultaneously |

Not used: light leaks, film burns, dust, lens flares, glitch, progress bars along the frame edge.

## Pillar 5 — Audio & sound design

| Layer | Spec |
|---|---|
| Voice | clean lav. Target **−14 LUFS integrated, −1 dBTP** (verified on renders) |
| Music | dark **ambient trap / cinematic hip-hop**: 808 sub, tight hats, minor synth pad. Estimated **85–140 BPM, median ≈ 118** (some half-time drill). Bed sits **≈ 20 dB under the voice** (estimates −18 to −22 dB). Verified: −30 LUFS pre-duck → −33.8 LUFS ducked |
| Diegetic | ball kicks and catches kept under the mix (DemvnPZO3cA) |

### SFX matrix

| Trigger | SFX | Level (rel. 0 dBFS peak sample) |
|---|---|---|
| Frame 0 of the hook | sub **thud** / bass impact | −11 dB |
| B-roll / split entry | low **whoosh**, peak on the cut (starts 0.3 s early) | −18 dB |
| Proof photo | camera **shutter** | −18 dB |
| UI card / badge / pill appears | digital **pop** | −16 dB |
| Checklist row / timeline node | soft **tick** | −20 dB |
| Full-screen rule card | thud + whoosh | −11 / −18 dB |
| ~1 s before the CTA | **riser** ending on the CTA | −20 dB |
| "FOLLOW." card | thud | −11 dB |
| Captions, punch-ins | **no SFX** (the viral reel is SFX-minimal) | — |

## Pillar 6 — Hook & retention formula

**0–3 s hook = disruption stack:**
1. **Verbal:** a high-stakes contrarian or conflict line in the first sentence. Examples: "A club offered to sign my player. I turned it down, and he wanted to kill me." / "At 18… I tore it up myself." / "This player paid 4 years for academy and got nowhere." / "There's a specific kind of tired only unsigned players know." / "If you're a parent funding your kid's football…"
2. **Visual:** the kicker + headline block on frame 0, with the punch word in lime and a period at the end. Or a censor blur on a crest.
3. **Proof cut at about 0.9 s:** a photo or clip that makes the claim real.
4. **Audio:** a sub thud on frame 0.

**Retention loop every 3–5 s:** a new header or badge, a punch-in, a numbered rule card ("01/02/03") or an open loop ("the actual reason…"). Structure: Problem → failure → counter-intuitive decision → payoff.

**Ending:** one of three, in order of frequency:
1. A **keyword DM/comment CTA** ("DM me 'WEIGHT'", "Comment PARENTS", "DM me 'PATHWAY'") shown on a lime keyword card.
2. A **"FOLLOW."** black end card.
3. An **abrupt cut on the strongest line**, which loops back into the hook.

No outro music swell, no logo sting.
