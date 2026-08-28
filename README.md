# LiChessable

Personal Chrome extension (Manifest V3), loaded unpacked. It injects a **Lichess
Database** panel into Chessable — Explore pages, the Analysis board, trainer
sessions and standalone variation pages — so course statistics can be compared
against real Lichess games for the current position, and adds a set of study
tools on top of Chessable's MoveTrainer: auto-play of already-proven moves,
mistake retry and drilling, clickable-line review, a free-play analysis board,
repertoire coverage, typed move entry, and a two-key "show and grade" review mode
that can be driven from a Bluetooth ring.

**This file is the operational reference — install, reload, engine vendoring,
permissions, known limitations. It deliberately does NOT describe how the
features work.**

That lives in two places, both kept current:

* `CLAUDE.md` — the contract surface: every name by which one part of the code
  reaches into another, the anti-repair notes, and the constraints each feature
  imposes on shared code.
* `DESIGN-*.md` — one document per feature, holding the loop, the measurements,
  the version history and the live ground-truthing.

If this project is ever made public, a user-facing README should be written from
those documents at that point. Do not narrate features back into this file: it
had no reader, and every functional change was paying 30–80 lines of prose for
it.

## Features, and where each is documented

| Feature | Sections | Document |
|---|---|---|
| Lichess database panel (explore / analysis / review / variation page) | 5–11b | `CLAUDE.md` |
| Database filters, repertoire badges | 6b, 6c | `CLAUDE.md` |
| Local Stockfish engine | 5b | `CLAUDE.md`, plus **Local engine** below |
| Quick-edit: comments, alternatives, rights | 12, 12c | `DESIGN-quick-edit.md` |
| Quick-edit: arrows and circles | 12b | `DESIGN-quick-edit-arrows.md` |
| Auto-play already-mastered moves | 13 | `DESIGN-autoplay.md` |
| Difficult moves only, variation skipping | 13b–13d | `DESIGN-difficult-moves.md` |
| Chapter sort | 14 | `CLAUDE.md` |
| Wrong-guess engine check | 15 | `CLAUDE.md` |
| Mistake log and retry runner | 16, 17 | `DESIGN-retry-mistakes.md` |
| Pinned mistakes (kept across sessions) | 16b | `DESIGN-pinned-mistakes.md` |
| Clickable-line review, mid-quiz heads-up, important lines | 18, 18b, 18c | `DESIGN-continuation-review.md` |
| Analysis board (trainer and variation page) | 19, 19b | `CLAUDE.md` |
| Analysis board: "Add as variation" | 19c | `DESIGN-add-as-variation.md` |
| Mistake drill | 20 | `CLAUDE.md` |
| Repertoire coverage | 21 | `DESIGN-repertoire-coverage.md` |
| Type a move | 22 | `CLAUDE.md` |
| Show and grade, audio and blindfold | 23, 23b | `DESIGN-show-and-grade.md` |
| Course tree (a course as positions, browsed as columns) | 24 | `DESIGN-course-tree.md` |
| Key moves vs difficult moves | 25 | `DESIGN-key-moves.md` |
| Intuition storm on the repertoire's frontier | 27 | `DESIGN-intuition-storm.md` |
| Every control by host and state, and the colour rules | — | `DESIGN-ui-inventory.md` |

## Folder structure

```
lichessable/
├── manifest.json            Manifest V3 definition
├── background.js            Service worker: authenticated explorer fetches
│                            + engine message hub + quick-edit tab driver hub
├── content/
│   ├── lichessable.js       Panel logic (mt1 iframe) + review overstudy widget,
│   │                        quick-edit UI, review auto-play, the mistake
│   │                        log / retry runner and continuation review
│   │                        (top document)
│   ├── pagestate.js         MAIN-world reader: the trainer's own lesson plan —
│   │                        the auto-play line oracle AND each move's live quiz
│   │                        record (the mistake log's source), read-only
│   └── lichessable.css      Panel styling (namespaced under .clo-)
├── engine/
│   ├── offscreen.html       Offscreen document hosting the engine
│   ├── engine.js            UCI controller (worker lifecycle, MultiPV parsing)
│   ├── san.js               Self-contained UCI→SAN converter + move generator
│   │                        (also loaded as a content script: review auto-play
│   │                        uses it to track the board and verify moves)
│   └── vendor/              Stockfish WASM builds (full + lite) — NOT in git; see below
├── options/
│   ├── options.html         Settings page: Lichess API token entry + test
│   ├── options.js
│   └── options.css
├── icons/
│   ├── icon16.png           Simple generated placeholder icons —
│   ├── icon48.png           feel free to replace or delete them
│   └── icon128.png          (remove the "icons" block from the manifest if deleted)
├── dev/
│   └── harness.html         UI harness — every panel, widget, popup and board
│                            on one page, styled by the REAL lichessable.css.
│                            Not referenced by the manifest; see below.
└── README.md
```

## UI harness (dev only)

Open `dev/harness.html` in any browser — no extension, no Chessable, no server.
It loads `content/lichessable.css` directly and renders a static replica of
every `.clo-` surface: the Lichess panel in each of its states, the overstudy
widget with all four clusters attached — plus cards showing the row in each of
the states §3.1 of the design doc assigns a primary to, its collapsed mid-quiz
states, the Overstudy chooser and the auto-play popover — the quick-edit popup's
four tabs, the alt-check chip and its three verdict bands, the continuation quiz
board and panel, the mid-quiz heads-up, the analysis panel, the mistake popup and
retry shield, and the coverage report.

It exists because most of these surfaces are otherwise reachable only by
reloading the extension, loading a course and completing a variation — minutes
per look. Here a restyle is a browser refresh.

Toolbar: **touch sizing** toggles `html.clo-touch` (the same class
`applyTouchUiClass()` sets, so the mobile type/tap-target rules are exercised
for real), **backdrop** switches between Chessable's page colour and a light
one, **width** narrows the page to check wrapping.

Because it loads the real stylesheet, computed styles and element rectangles in
the harness are the real thing — `getBoundingClientRect()` across a set of
states is how the v0.57.0 status-line reflow was both found and confirmed fixed,
and how v0.58.0's group order, "exactly one filled control per state" and
empty-group collapse were each checked as a number rather than a look.

It is also how v0.59.0's colour-token extraction was *proved* rather than
assumed: snapshot every element's computed colours (plus its `::before` and
`::after`) before the substitution and after, and diff. 1711 rows, 0
differences. For a mechanical change across 292 call sites that is the only
honest form of "no visual change".

**The stylesheet caches hard over `file://`.** After editing
`content/lichessable.css`, a plain page reload will often keep serving the OLD
CSS. Bust it from the console:

```js
const l = document.querySelector('link[rel=stylesheet]');
l.href = l.href.split('?')[0] + '?v=' + Date.now();
```

Two things to know:

- **The replicas are hand-written**, derived from the builder functions in
  `content/lichessable.js`. Nothing imports them — those functions are wired
  to `chrome.*`, Chessable's DOM and module state. So markup changes in the
  content script do **not** reach the harness by themselves; update it
  alongside. The board renderer in the page deliberately mirrors section 11c's
  geometry (percentage squares, pieces translated in multiples of their own
  size, shapes in board units on a `viewBox="0 0 8 8"`) and pieces fall back to
  Unicode glyphs, since the real ones are cloned off Chessable's live board.
- **One CSS override exists**, `.hx-stage > .hx-pos`, which neutralises the
  absolute/fixed positioning the content script sets inline so surfaces lay out
  in flow. It is scoped to the outermost element of each replica — no inner
  layout is touched, so anything that looks wrong inside a card is wrong for
  real. Everything else in the harness is namespaced `hx-` and cannot collide
  with `.clo-`.

`pack-and-push.ps1` packs the whole extension directory, so this file rides
along in the `.crx`. It is inert (nothing references it, no permissions, no
`chrome.*`) and a few tens of KB; delete `dev/` before packing if that matters.

## Install (load unpacked)

1. Put this folder somewhere permanent (Chrome loads it from disk every start).
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (toggle, top right).
4. Click **Load unpacked** and select the `lichessable` folder (the one
   containing `manifest.json`).
5. **Set up the Lichess API token** (required since early 2026 — Lichess
   locked the opening explorer behind authentication after DDoS attacks):
   1. On the LiChessable card in `chrome://extensions`, click **Details** →
      **Extension options**.
   2. Follow the link to create a personal access token on lichess.org
      (log in, leave **all scope checkboxes unchecked**, click Create).
   3. Copy the token (starts with `lip_`), paste it into the options page,
      click **Test** (should say "Token works ✓"), then **Save**.
   *Skipping step 5 on a second profile:* create a file called
   `local-token.json` beside `manifest.json` holding
   `{"lichessToken": "lip_..."}`. The worker seeds it into extension storage on
   load, so the options page needs no visit. It is **gitignored** and must stay
   that way — a token committed once lives in every clone and in every packed
   `.crx`. It never overwrites a token already saved, so pasting a new one in
   the options page always wins; to rotate, edit the file and clear the field.
6. Open an Explore page, e.g. `https://www.chessable.com/explore/287495/`,
   or the Analysis board, `https://www.chessable.com/analysis/`. The
   "Lichess Database" panel appears to the right of Chessable's content
   (or under their move table / notation area, if the window is narrower
   than 1700px).
7. After editing any file: click the ↻ reload icon on the extension's card in
   `chrome://extensions`, then reload the Chessable tab.

## Reloading the extension

Content scripts are **cached by Chrome**: after editing any file, reloading the
Chessable tab still runs the OLD code. The extension itself has to be reloaded
first. Two ways:

- **By hand** — the ↻ icon on the extension's card in `chrome://extensions`.
- **From a page / from automation** — dispatch a `clo-dev-reload` DOM event on
  any Chessable tab:

  ```js
  document.dispatchEvent(new Event('clo-dev-reload'))
  ```

  The content script relays it to the service worker, which calls
  `chrome.runtime.reload()` (that API does not exist in content scripts, hence
  the relay). Then reload the Chessable tab to pick up the new content script.

**Confirm it took effect.** The content script logs its build on startup —
`[CLO] v0.33.2 (top)` — and the options page shows the loaded version at the
bottom. Both read `chrome.runtime.getManifest()`, which reflects the build
Chrome has *in memory*, not the one on disk. If the version still shows the old
number after a reload, the reload did not happen. Bumping the version in
`manifest.json` (which every functional change does anyway) makes this an
unambiguous check.

Two things that do **not** work, both verified 2026-07-26 — don't rediscover
them:

- **`chrome://extensions` cannot be automated.** Neither CDP nor an extension
  can script a `chrome://` page, and synthetic keyboard automation of the UI is
  blocked too.
- **A reload hook on the options page never fires.** Extension pages *are*
  re-read from disk on every load, so a `location.hash` hook there looks like a
  clean lever — but an options page opened programmatically lands in a
  background tab, and Chrome defers loading those indefinitely (measured: still
  unloaded after 4 minutes, hash untouched, `last_update_time` unchanged). It
  also loops: `chrome.runtime.reload()` tears the page down, Chrome re-loads the
  tab at the same URL, and the hook fires again — a perpetually reloading
  extension injects no content scripts at all.

A caveat on the relay: it only works if the *currently loaded* extension already
contains it. If the loaded build predates it, or the content script is broken
enough not to run, the ↻ button is the only way back.

## Debugging

- All logs are prefixed `[CLO]`.
- The script runs inside the **mt1 iframe**, so in DevTools either select the
  `mt1/explore` frame in the console context dropdown, or just filter the
  console for `[CLO]` (the default "top" context still shows iframe logs in
  current Chrome, but the frame context is needed if you want to poke at the
  panel from the console).

## Local engine (optional)

An **Engine** button in the panel header (all three modes: Explore, Analysis,
review browse) toggles local Stockfish analysis of the current position:
evaluation, search depth, and the top 3 lines (MultiPV 3) in SAN. Off by
default; the choice persists across sessions and tabs.

**Setup (one-time):** the engine binaries are not in the repo. From
<https://github.com/nmrugg/stockfish.js/releases/tag/v18.0.0> download the
multi-threaded NNUE build pair(s) you want into `engine/vendor/` (keep the
filenames — the loader derives each `.wasm` path from its `.js` name), then
reload the extension:

- **Full** (108 MB, the pair with **no** `lite`/`single`/`asm` suffix) —
  used on desktop-class machines:
  - <https://github.com/nmrugg/stockfish.js/releases/download/v18.0.0/stockfish-18.js>
  - <https://github.com/nmrugg/stockfish.js/releases/download/v18.0.0/stockfish-18.wasm>
- **Lite** (~7 MB, smaller NNUE net) — used on low-power devices:
  - <https://github.com/nmrugg/stockfish.js/releases/download/v18.0.0/stockfish-18-lite.js>
  - <https://github.com/nmrugg/stockfish.js/releases/download/v18.0.0/stockfish-18-lite.wasm>

**Which build runs:** each analyze request carries a profile computed in the
content script. By default (**Auto** on the options page) a low-power device —
`navigator.userAgentData.mobile`, ≤ 4 GB `deviceMemory`, or ≤ 4
`hardwareConcurrency` — gets the lite profile, everything else the full one;
the options page's **Engine build** setting (Auto / Full / Lite) overrides the
detection, taking effect immediately, mid-search included. If the selected
build's files are missing from `engine/vendor/` the panel says so ("… engine
files missing — see README") and the status error names the exact file — there
is deliberately **no silent fallback** to the other build.

**How it runs:** the engine loads in an MV3 *offscreen document*
(`engine/offscreen.html`) — the only extension context that can both run WASM
(`wasm-unsafe-eval` CSP) and get `SharedArrayBuffer` for the multi-threaded
pthread build (via the manifest's COOP/COEP keys). The service worker is the
message hub: content scripts request analysis (`clo-engine-analyze`), the
offscreen engine streams throttled updates back, and the worker relays them to
the requesting tab/frame (offscreen documents cannot message content scripts
directly). Search sizing comes from the `PROFILES` table at the top of
`engine/engine.js`: both profiles self-terminate at a fixed depth (CPUs idle
after) — the desktop profile runs `go depth 30` with the full build at
4 threads / 64 MB hash, the mobile profile `go depth 25` with the lite build
at 2 threads / 16 MB hash
(MultiPV 3 in both; a profile's `movetime` can additionally cap the search
wall-clock, currently unused). Scores are always shown from White's
perspective.

**Resource notes:** expect roughly 250–400 MB of memory while the full engine
is enabled, roughly 60–120 MB for the lite profile (check Chrome's task
manager, Shift+Esc). Turning the toggle off
closes the offscreen document and frees it immediately; an idle engine also
self-closes after 5 minutes. The search stops automatically when the tab is
hidden, the panel is collapsed, or a review session leaves its browse state.
If the multi-threaded build fails to start (a clear `[CLO]` error appears in
the offscreen console: `chrome://extensions` → LiChessable → *Inspect views:
offscreen.html*), drop in the `-single` build pair from the same release as a
fallback — same protocol, one thread, no SharedArrayBuffer requirement.

## Data source (Lichess opening explorer)

The extension calls `https://explorer.lichess.org/lichess` — note **.org**:
the old `explorer.lichess.ovh` host now returns 401. Since early 2026 the
explorer requires authentication (any personal access token, no scopes),
after Lichess was unable to defend anonymous requests against DDoS.

**How auth works here:** the content script builds the request URL and sends
it to the background service worker (`background.js`), which attaches
`Authorization: Bearer <token>` and performs the fetch. The worker's
`host_permissions` entry makes its fetches CORS-exempt, so no preflight
concerns; the token itself never enters the Chessable page context. The token
is stored in `chrome.storage.local` (key `lichessToken`) and is entered/tested
on the extension's options page.

Query defaults (all in `CONFIG.lichess` at the top of the content script):

- **Ratings:** 1600+ (Lichess buckets 1600, 1800, 2000, 2200, 2500)
- **Speeds:** blitz, rapid, classical, correspondence ("blitz and slower")
- **Moves:** up to 20 candidates; `topGames`/`recentGames` are 0 to keep
  payloads small.
- Ratings and speeds are the two the **user can change**, in the panel's
  settings menu (the header cogwheel). `CONFIG.lichess.defaultSpeeds` /
  `defaultRatings` are only the starting point; the live values are the module
  -level `lichessFilters` object, which every explorer request reads. They are
  persisted in `chrome.storage.local` under `cloLichessFilters` and re-applied
  from `chrome.storage.onChanged` in every document — the panel runs in the
  mt1 iframe on Explore/Analysis but in the top document during review, so a
  change made in one has to reach the other through storage anyway. Values the
  explorer doesn't know are dropped on read, and a dimension can never end up
  empty (it would return nothing at all): an unusable stored set falls back to
  the defaults.
- The response's `opening` field (ECO + name) is shown above the summary bar,
  and each move's `averageRating` appears as a tooltip on the move cell.

Network behavior:

- **Cache** — in-memory LRU (200 positions) keyed on the first four FEN
  fields, so transpositions that differ only in move counters share an entry.
  Stepping back and forth through a line never re-hits the API. Responses that
  arrive after you've already moved on are still cached for their position.
  Changing the filters empties it (and the alt-check's own win-rate cache) —
  every entry in it was fetched under the old ones. The chapter sort's
  persistent popularity cache needs no clearing: its entries are tagged with
  the filters they were fetched with, so they simply miss.
- **429 handling** — on a rate limit the panel shows a notice, requests pause
  for ~61 s (Lichess asks for a full minute after a 429), then the current
  position retries automatically. Cached positions keep rendering during the
  pause.
- **401 handling** — the panel explains that a token is needed (or was
  rejected) and shows a button that opens the options page. Saving a token
  there retries the current position immediately, no reload needed.

`USE_STUB_DATA` still exists — flip it to `true` to develop the UI against
mock data (marked with the yellow "stub data" badge) without touching the API.

## Permissions rationale

- `storage` — remembers the show/hide, database-filter, engine and auto-play
  preferences and holds the Lichess API token; `storage.session` carries the engine's reply
  routing and the tab-driver jobs across service-worker restarts, plus the
  auto-play session record (the worker calls
  `setAccessLevel('TRUSTED_AND_UNTRUSTED_CONTEXTS')` so the content script
  can read them — an API call, not a permission).
- `offscreen` — hosts the optional Stockfish engine in an offscreen document
  (the service worker cannot run a persistent WASM engine; content scripts
  are subject to the page's CSP). The manifest's `wasm-unsafe-eval` CSP and
  COOP/COEP keys exist solely for this: they enable WASM compilation and
  `SharedArrayBuffer` (multi-threading) on the extension's own pages.
- `host_permissions` for `https://explorer.lichess.org/*` — lets the
  background service worker (and the options page's Test button) call the
  explorer with the Authorization header, exempt from CORS. This became
  necessary when Lichess put the explorer behind authentication; before that,
  a plain content-script fetch was enough. The same host also serves master
  game PGNs (`/masters/pgn/<id>`), which need no token; the worker's `as:'text'`
  path reads those, and a missing token is not fatal there.
- `host_permissions` for `https://www.chessdb.cn/*` — the ChessDB cloud
  analysis book (`DESIGN-chessdb.md`), which answers "how good is this move"
  beside the explorer's "how often is it played". Read-only twice over: the
  worker refuses any URL on that host whose action is not `queryall` or
  `querypv`, an allow-list rather than a block-list, because the API's `queue`
  and `store` actions spend a volunteer network's compute. The eval column
  itself is opt-in (panel cogwheel) — nothing is sent to a third party for a
  user who has not switched it on.
- `host_permissions` for `https://lichess.org/*` — one endpoint only:
  `https://lichess.org/game/export/<id>`, the PGN of a game the intuition
  storm (`DESIGN-intuition-storm.md`) is walking past one of your course
  lines' end positions. This host is the one that needs its guard read
  carefully, because unlike the two above it also serves the user's entire
  account, so the worker's allow-list is that **single path prefix** and
  nothing else. Manifest match patterns cannot express a path prefix for
  `host_permissions` in a way that is worth relying on, so the guard is in
  `handleGameFetch` and is a plain `startsWith` on the whole URL. The token is
  sent for the higher rate limit, and the guard is what keeps it from reaching
  any other path.
- Nothing else: no tabs permission, no scripting, no access beyond
  chessable.com (content script) and those three hosts (worker). The chapter
  sort calls Chessable's own API, and so do the two features that keep a blob
  in a course of your own — the pinned-mistake sync and the intuition storm's
  position store — but that is same-origin with the page the content script
  already runs in, so it needs no host permission either. Note the
  overstudy widget's and the quick-edit feature's `chrome.tabs.create` /
  `chrome.tabs.remove` / `chrome.tabs.sendMessage` calls do **not** require the
  `tabs` permission — that permission only gates reading tab metadata.

## Known behavior / limitations

- If a Lichess fetch fails with an ordinary error, the error state stays until
  the position changes (no retry loop, to avoid hammering the API). A 429 is
  the exception: it retries once automatically after the ~61 s cooldown.
- On Explore the panel lives inside Chessable's `.nextMovesContainer` in the
  DOM; on Analysis it is that container's next sibling (see below). On Explore
  the side placement is pure CSS (absolute positioning against the container,
  which `mountPanel` makes `position: relative`). Chessable centers a 940px
  content block, so the side-mode geometry (`50vw ± …` in the media query) is
  derived from that width — if Chessable changes their column width, those two
  CSS constants are the thing to retune.
- In side mode the panel caps its height at the viewport and scrolls the move
  list internally.
- On the Analysis board, Chessable's `.nextMovesContainer` is shown only
  while the Opening Explorer toggle is active — and that toggle is disabled
  in some entry states (e.g. `?fen=` deep links). The panel therefore mounts
  as the container's next sibling in the fixed-height column and is always
  visible. From there `positionAnalysisPanel()` pins it (absolute, against
  that column — `mountPanel` makes it `position: relative`) over the full
  column height minus Chessable's toolbar row, recomputed on the 500 ms poll
  and on resize.
- The move tree inside the panel is not a copy: `adoptAnalysisMoves()` moves
  Chessable's own `.movesContainer` element into the panel's `.clo-moves`
  host, so every handler of theirs (click-to-navigate, both right-click
  menus, promote/delete branch) keeps working untouched. The node is put back
  where it came from whenever the panel is re-mounted, collapsed via **Hide**,
  or the page is left, and re-adopted on the poll if their app re-renders.
- Auto-play is conservative by design: positions whose recorded move is a
  promotion are handed back to you (the trainer's promotion picker markup is
  unverified), a "stop for text" gate swallows the drag and the position falls
  back to manual, and after a wrong answer snaps back you retry that move
  yourself. Auto-play pauses while the tab is hidden. Records are per browser
  session (12 h cap) — never across days, and **Clear** drops the current
  course's on the spot (a pending record write is cancelled with it, so the
  old record cannot come back).
- A retry pass is a queue of whole variations, not of bare moves: Chessable has
  no arbitrary-FEN quiz and no multi-variation session URL, so each failed move
  is met inside its own line (auto-play covers the moves before it). A pass
  runs in the tab that started it, pauses while that tab is hidden, and ends if
  you leave the trainer. Mistakes are listed for the course you are currently
  in — a session across two courses gives you one list per course.
- The mistake **drill** is the other way round, and its limits follow from that:
  it never touches Chessable, so nothing you do there is recorded, rescheduled
  or visible to the course — it is practice, and a clean answer only marks the
  move off *our* list. It is offered on a finished variation, since it needs a
  board to lay itself over. Only one opponent move of run-up is played for now;
  the log stores more, so a "how much run-up?" setting can be added without
  losing anything already recorded.
- All class names Chessable-side are treated as fragile; see `SELECTORS`.
