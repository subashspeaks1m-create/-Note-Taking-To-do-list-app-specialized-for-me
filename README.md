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

## Books: turn a book into behavior change

Open **Books** (in the rail, or **More** on mobile) and upload a book as a PDF, or as a .txt or .md file.
The text is read on your device with pdf.js. When you click **Analyze**, Claude produces:

- **Summary**: the book in one sentence, the big idea, a full summary, chapter-by-chapter notes,
  key concepts, verbatim quotes with page numbers, and caveats.
- **Mind map**: an interactive two-sided map you can fold, drag and zoom, plus an outline view.
- **Insights**: the ideas that most change behavior, each with a from → to shift, one action,
  an if-then plan, the likely obstacle and a reflection question. Also an identity statement, a
  keystone habit, and lists of what to start, stop and keep doing.
- **7-day and 30-day roadmaps**: dated daily checklists with evening check-ins. Today's actions
  from every active plan also appear at the top of the Books page.

Add your Claude API key under **Settings → Book analysis**. The key stays in this browser and
requests go straight to Anthropic. Before analyzing you can set your goal for the book (it shapes
the insights and plans) and the page range, and you see an estimated token count and cost. The
book is sent once and cached, so the later sections cost less. Scanned PDFs without a text layer
are sent as page images (up to 22 MB and 600 pages). Everything can be exported as Markdown.

## Stack

React 19, TypeScript 5.9, Vite 8, React Router 7, Dexie 4 (IndexedDB, from stage 2),
Anthropic TypeScript SDK and pdf.js (Books), Vitest 5, Playwright for screenshots and browser checks. System fonts only.

## Structure

```
src/
  app/        shell, routing, display preferences, asset helper
  date/       calendar-date math and the injectable clock
  domain/     product config and game rules (single module), plan math
  components/ shared UI (icons, progress, page parts)
  features/   today, tasks, journal, visions, calendar, character, insights, books, settings
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
