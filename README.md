# Pursuit of Greatness

A personal growth command center: one-line tasks beside paragraph logs, three connected
visions (10-Year, 1-Year, 2026 Finish Strong), and a character that grows from recorded work.
Built from the ASCEND build kit spec. Everything is stored locally in your browser. There is
no account, server or cloud.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests
npm run e2e          # browser checks (starts a dev server and a production preview)
npm run build        # typecheck + production build in dist/
npm run build:review # sandbox-friendly build in dist-review/ (in-memory routing, relative assets)
```

Development builds accept `?now=2026-12-31T10:00:00+05:30` to simulate another moment for
checking date boundaries.

Browser checks need a Chromium: `npx playwright install chromium`, or point `PW_CHROMIUM` at one
you already have. Results, traces and screenshots land in `e2e/.results/`. The pass/fail table for
every acceptance check, hosting notes and media provenance are in
[docs/ACCEPTANCE_REPORT.md](docs/ACCEPTANCE_REPORT.md).

Settings has a **demo mode** that fills a separate database with fictional data, with a banner
while it is on. Your real data, XP and unlocks are never touched.

## Stack

React 19, TypeScript 5.9, Vite 8, React Router 7, Dexie 4 (IndexedDB, from stage 2),
Vitest 5, Playwright for screenshots and browser checks. System fonts only.

## Structure

```
src/
  app/        shell, routing, display preferences, asset helper
  date/       calendar-date math and the injectable clock
  domain/     product config and game rules (single module), plan math
  components/ shared UI (icons, progress, page parts)
  features/   today, tasks, journal, visions, calendar, character, insights, settings
  styles/     tokens and stylesheets
public/assets  optimized kit media (see "Media")
source-assets  original kit media, kept for provenance, not shipped
```

## Media

- `figure-center-loop.mp4`: the supplied character video scaled to 900 px and played
  forward then backward, because the original 5.125 s clip has a visible jump between its
  last and first frames. Muted, inline, paused offscreen or in a hidden tab. Reduced motion,
  low graphics and playback failure show `base-poster.webp` (JPEG fallback).
- `scholar.webp`, `builder.webp`, `ascendant.webp`: the kit's generated suit portraits
  (real alpha), resized to 900 px. They are static artwork. In-app motion and owner-made
  video loops arrive in stage 5.
- `public/assets/vault/`: outfit pictures (concept art and renders of the 3D model).
- `public/assets/character/outfits/`: the cut-out pictures you stand on the platform as. To add
  one, cut it from a grey-background image with
  `python3 tools/cutout-figures.py IMAGE 1 1 public/assets/character/outfits <outfit-id>`
  (a 360° sheet of 8 views: `IMAGE 4 2 public/assets/character/outfits/<outfit-id> 0 45 90 135 180 225 270 315`)
  and list the id in `src/features/character/pictures.ts`.
- `src/assets/models/subash-wardrobe.glb`: your 3D character with the first 14 outfits, shown in
  the Vault's 3D view. See [docs/3D_MODEL.md](docs/3D_MODEL.md).
- SVG icons, badges and stage art, and WAV cues: original kit assets. Fluent Emoji art and
  line-md icons are MIT. See the acceptance report for the full list.

## Build stages

All seven stages are built.

1. Foundation: shell, Today layout, character stage, empty states
2. Daily workflow: storage, tasks, journal, autosave
3. Visions: plans, goals, milestones, period direction, daily habits
4. Calendar, Journal, Insights, weekly and monthly report cards
5. Game and character: XP ledger, levels, streaks, badges, earnings ranks, equipment, the Vault
6. Reliability and settings: offline PWA, backup/restore, conflicts, AI weekly coach (free
   OpenRouter models, key kept in this browser only)
7. Verification: demo mode, browser checks, screenshots, acceptance report
