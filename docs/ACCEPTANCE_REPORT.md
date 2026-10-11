# Acceptance report

Checked against the kit's `docs/ACCEPTANCE.md` (32 checks) on 2026-10-11.
Every result below comes from a test that was actually run, named so it can be re-run.

- **Browser checks** (Playwright, Chromium 141, Asia/Kolkata, clock fixed to Oct 10 2026 10:00 unless noted): `npm run e2e`. 43 tests in 7 files in `e2e/`, all passing in one full run (about 15 minutes).
- **Unit checks** (Vitest + fake IndexedDB): `npm test`. 174 tests in 20 files.
- **Build checks**: `npm run build` (runs `tsc -b`), `npx eslint .`.

Result: **29 pass, 3 pass with a noted gap, 0 fail.** One check (#22) was changed on purpose by Prem's decisions and is reported against the new rule.

## Results

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Learning + Doing tasks keep order and category after reload, no XP | Pass | e2e `daily #1` |
| 2 | Standard Learning completion = 20 XP, completion time stored, linked draft opens | Pass | e2e `daily #2` |
| 3 | Three-paragraph documented log survives reload, one 5 XP documentation source | Pass | e2e `daily #3` |
| 4 | Ten edits and ten complete/reopen cycles add no extra XP | Pass | e2e `daily #4`; unit `tasks: cannot farm or inflate rewards` |
| 5 | Standalone Doing log and reflection persist and are searchable; only documented reflection earns | Pass | e2e `daily #5` |
| 6 | Switching routes while typing loses nothing; simulated storage failure says "Save failed" and keeps the text | Pass | e2e `daily #6` (every IndexedDB write made to throw) |
| 7 | Delete + undo restores task and rewards; deleting a documented log reverses only its bonus | Pass | e2e `daily #7` |
| 8 | At midnight the open draft stays on its day and the new day is offered | Pass | e2e `daily #8` (clock run from 23:59:20) |
| 9 | Move Oct 10 → Oct 11 keeps id, original date, move history, no new reward | Pass | e2e `daily #9` |
| 10 | Pasting three lines previews and creates exactly three tasks | Pass | e2e `daily #10`; unit `makes one task per nonblank line` |
| 11 | Plans keep exact original ranges, also when opened in a later year | Pass | e2e `vision #11` (second tab at 2027-03-01) |
| 12 | Countdown: Oct 10 = 82, Oct 11 = 81, Dec 31 = Final day, Jan 1 = ended, never negative | Pass | e2e `vision #12` ×4; unit `sprint countdown` |
| 13 | Day, week and month direction never overwrite another period; old wording recoverable | Pass | e2e `vision #13` (next day, history kept); unit `keeps old direction wordings` |
| 14 | Goal → milestone → linked task: only the linked goal moves; a task linked through two sub-goals counts once | Pass | unit `goal board (acceptance #14)` |
| 15 | Numeric 5/10 = 50%, milestones 1 of 1+3 = 25%, no linked tasks = no measurement, manual only on explicit update | Pass | unit `goal progress` ×4 |
| 16 | Calendar shows journal-only, task-only, future and completed days and opens each | Pass | e2e `vision #16` |
| 17 | Daily series makes one occurrence per date; regeneration makes no duplicates; editing one leaves others | Pass | unit `recurrence` ×4, `recurrence regeneration never duplicates`, `editing one occurrence` |
| 18 | Date math across a DST change; Kolkata completion date survives a later time zone change | Pass | unit `handles a DST transition`, `time zone change (acceptance #18)` |
| 19 | Level thresholds 0/100/300/600/1000/1500; 299 = L2, 300 = L3; no double counting | Pass | unit `levels` ×3 |
| 20 | One documentation bonus per task, one reflection bonus per day, 200/day/track completion cap | Pass | unit `pays one documentation bonus…`, `pays a documented reflection once per day`, `caps completion XP at 200…` |
| 21 | Reversing a capped source refills deterministically; changing effort can't inflate a frozen reward | Pass | unit `caps … refills from the next task`, `changing effort after completion cannot raise the reward` |
| 22 | Rank unlocks, locked items can't equip, unlocks persist, demo doesn't touch real unlocks | Pass (rule changed by Prem) | Prem chose: rank forms come from logged earnings ($100K/$1M/$100M/$1B) and all 14 outfits are open from day one. Unit `character`, `wardrobe`, `unlocks and chests`, `vault`; e2e `Demo mode … leaves real data untouched` |
| 23 | Character video keeps proportions with a still fallback; suit pictures labeled static | Pass | e2e `character #23`. Suit pictures are labeled "Concept picture" in the Vault |
| 24 | Playback failure, missing asset, reduced motion, hidden page and offscreen all fall back; no automatic sound | Pass | e2e `character #24` ×2 (all portrait files blocked, `visibilitychange`, scrolled offscreen, sound setting off by default) |
| 25 | Streak: yesterday ends a 7-day run → still 7 today; opening the app gives nothing; future evidence doesn't count | Pass | unit `streaks` ×3, `stats: keeps the streak alive in the morning` |
| 26 | Backup → empty profile → restore brings back records, links, XP, periods; merging again duplicates nothing | Pass | e2e `reliability #26` |
| 27 | Corrupt file and newer schema refused before any change; replace needs explicit choice | Pass | e2e `reliability #27`; unit `backup` |
| 28 | Offline reload opens Today, date navigation, journal, visions, art and settings | Pass | e2e `offline #28` against the production build with its service worker |
| 29 | Two tabs editing one entry never silently drop a draft; an app update doesn't wipe unsaved text | Pass with gap | e2e `reliability #29` (conflict shown, "Keep mine" saves, other text kept in history). The update case is by design (a new version waits for you to choose Reload) but was not run in a browser |
| 30 | Keyboard-only add, complete, write, calendar, dialog, navigation; labels, focus, contrast, zoom, screen reader | Pass with gap | e2e `reliability #30` (every visible control has a name, Escape returns focus). Contrast and screen-reader speech were not measured by a tool; 200% zoom is covered by the 768 px and 390 px layout checks (inferred) |
| 31 | Desktop and phone screenshots: empty, demo, long paragraph, locked rank, storage error, reduced motion; no overlap | Pass with gap | e2e `screenshots` ×14 at 1440/1024/768/390, each checks nothing runs off the side. Shots saved to `e2e/.results/screens/`. Overlap between cards was checked by eye on a sample, not by tool |
| 32 | Build, typecheck and lint pass; this report; docs below | Pass | `npm run build`, `tsc -b`, `eslint .` all clean |

## Defects found and fixed during this pass

- Demo data was added twice on first start in development (React runs start-up effects twice). Seeding now shares one run (`seedDemo`, unit `seeds once when start-up asks twice`).
- In development, the page took focus on first load, so the first Tab skipped "Skip to content". Focus now moves only when the route really changes.

## Known limitations

- **3D model:** your Blender wardrobe is in the Vault and on the Character page (see `docs/3D_MODEL.md`). Likeness is approximate, and phone frame rate hasn't been measured on a real device.
- **Video codec:** the test browser (open-source Chromium) can't play H.264, so playback rules were tested with a VP9 copy of the same loop (`e2e/fixtures/portrait-test.webm`). Chrome, Edge and Safari play the MP4; a browser without H.264 shows the still frame.
- **AI coach:** tested against a stand-in for OpenRouter, never with a real key. Free models come and go; "Best free model" tries several and then OpenRouter's live free list.
- **Not tested:** iPhone Safari, Firefox, real screen readers, real installs to a home screen.
- **Data lives in this browser only.** Clearing site data, private windows, or the browser evicting storage removes it. Download a backup regularly. There is no sync between devices.

## Hosting notes

- **SPA routing fallback:** every unknown path must serve `index.html` (for example Netlify `/* /index.html 200`, Vercel rewrite of `/(.*)` to `/index.html`, nginx `try_files $uri /index.html`). Offline, the service worker already does this.
- **PWA needs HTTPS** (or `localhost`) for install and offline. Plain `http://` on another address works as a normal site without offline.
- **Each address is a separate store.** `localhost:5173`, `localhost:4173` and your real domain each keep their own data. Move data between them with Settings → Backup.
- **Backups** are one JSON file with a schema version. Journal text is included; your OpenRouter key never is. Restore refuses broken files and newer schemas before changing anything.
- **Offline cache** holds the app, icons and stills (files up to 4 MB). The character clip and 3D models are cached the first time they play.

## Package versions

React 19.3, React Router 7.18, Dexie 4.4 (+ dexie-react-hooks 4.4), TipTap 3.31, Three.js 0.180, Vite 8.3, vite-plugin-pwa 2.0, TypeScript 5.9, Vitest 5.0, Playwright 1.64, ESLint 9.39, fake-indexeddb 6.2, jsdom 29.1.

## Media provenance

- `public/assets/character/`: your supplied character video (scaled, looped forward and back) and its still frames; Scholar, Builder and Ascendant portraits from the Ascend kit (generated, static).
- `public/assets/vault/`: outfit concept pictures from the Vision Full Body kit's generated reference art, plus six renders of the 3D model from the Realism Wardrobe v6 kit (static).
- `src/assets/models/subash-wardrobe.glb`: web copy of the Realism Wardrobe v6 Blender file; MakeHuman/MPFB (CC0), Elvaerwyn (CC-BY), credits in `docs/3D_MODEL.md`.
- `public/assets/art/`: Microsoft Fluent Emoji (MIT). Self-drawing nav icons: line-md 1.2.16 (MIT).
- `public/assets/ui/`, `public/assets/audio/`: original Ascend kit assets. The WAV cues are shipped but the app's chimes are synthesized in code and off by default.
- `e2e/fixtures/portrait-test.webm`: a 3-second VP9 copy of the character loop, for tests only.
