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
npm run build        # typecheck + production build in dist/
npm run build:review # sandbox-friendly build in dist-review/ (in-memory routing, relative assets)
```

Development builds accept `?now=2026-12-31T10:00:00+05:30` to simulate another moment for
checking date boundaries.

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
- SVG icons, badges and stage art, and WAV cues: original kit assets.

## Build stages

1. Foundation: shell, Today layout, character stage, empty states (done)
2. Daily workflow: storage, tasks, journal, autosave
3. Visions: plans, goals, milestones, period direction
4. Calendar, Journal, Insights
5. Game and character: XP ledger, levels, streaks, badges, suits
6. Reliability and settings: offline PWA, backup/restore, conflicts
7. Verification: acceptance table, tests, screenshots
