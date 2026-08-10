# CLAUDE.md — LiChessable

Personal Chrome extension (Manifest V3), loaded unpacked. Injects a "Lichess
Database" panel beneath Chessable's move table on Explore pages
(`https://www.chessable.com/explore/<id>/`) and the Analysis board
(`https://www.chessable.com/analysis/`, as sibling after the Opening
Explorer container — always visible, since Chessable's explorer toggle is
sometimes disabled — the panel fills the whole column right of the board and
ADOPTS Chessable's own move tree into its top section)
so course statistics can be compared against real Lichess games for the
current position. Also adds an "Overstudy" widget to trainer sessions — review
(`https://www.chessable.com/practice/…`) AND learn
(`https://www.chessable.com/learn/…`, same MoveTrainer2 app, identical markup):
two buttons (current / previous
variation) that open the variation's overstudy in a background tab. In those
trainer sessions the Lichess panel also appears once a variation is completed
(browse state), following the board via a DOM-derived FEN. In that same browse
state, hovering a mainline move shows a pencil that appends a PGN comment to the
variation, EDITS that comment as a whole, or edits the move's ARROWS AND
CIRCLES on a board of our own (section 12b) — all for courses you can edit, all
by driving Chessable's own edit page in a
small focused popup window; the same pencil works on standalone variation pages
(`/variation/<id>/`), which also get the full Lichess panel (section 11b).
Trainer sessions (/practice/ and /learn/ alike) can also auto-play moves the
user already answered correctly earlier the same session (section 13; opt-in
toggle on the overstudy widget). A wrong quiz answer offers an
engine check of the refused move and one-click addition as an accepted
alternative (section 15). Every move failed in a session is logged from the
trainer's own per-move quiz record (section 16) and a "Retry" button walks
those variations again as overstudy, with auto-play covering the moves already
answered (section 17); "Drill mistakes" is the fast alternative to that pass —
the same failed moves asked for on OUR OWN board, one card each, with no
navigation and nothing rescheduled (section 20). The "Mistakes" list behind both
is the WHOLE session's history, grouped by chapter and foldable: a move already
gone through stays in it, dimmed and unticked, and can be retried or drilled as
often as the session lasts. A completed variation whose comment holds clickable
subvariation lines offers "Review clickable(s)" — the button is deliberately not
named after "continuations", since a line branching off earlier in the variation
continues nothing — which quizzes those lines on
OUR OWN board overlaid on Chessable's — theirs is navigation-only (section 18).
A comment writing several branches as one run of clickable moves
("1.e4 (1.d4 d5) 1...c5") yields ONE LINE PER BRANCH, all of them quizzable
(v0.66.0; before that the whole run was dropped);
an opt-in setting starts that review by itself, and ending it leaves THEIR board
on the position the line reached. A "!" on such a line's FIRST move marks it
IMPORTANT and every host of it — launcher, mid-quiz heads-up, quiz panel — turns
amber and says so (section 18c). That same board doubles as a free-play
ANALYSIS board (section 19): "Analyse" on the widget lets any legal move be
played for either side from the completed position, with the Lichess panel and
the engine following OUR board instead of Chessable's, and "Add as line" writes
the line worked out there back into the course as a clickable line in the
comment of the move it was opened on; it opens on the standalone variation page
too (section 19b), from an "Analyse" button in the Lichess panel's own header —
that page has no trainer row to host one. A COURSE page
(`https://www.chessable.com/course/<bid>/`) gets a "Repertoire coverage" panel
(section 21): it walks the course's move tree against one of the user's own
courses, lists the variations that are missing ranked by how likely the user is
to face them, flags the lines their repertoire holds twice, and writes both
answers back — adding the ticked lines through Chessable's own add call and
deleting the surplus copies. The panel itself also BADGES the moves one of the
user's own courses already plays (section 6c) — nominate a repertoire in the
panel's cogwheel menu and every host of the panel marks what is prepared.
A live quiz can also be answered BY TYPING (section 22): an opt-in field on the
trainer row plays what you write on Chessable's own board, on sight, with no
Enter for anything but O-O — and, once the variation is over, Enter on the same
field asks for the next one, so a whole session can be played without letting go
of the keyboard. A review session can also be answered WITHOUT PLAYING AT ALL
(section 23, "show and grade"): the opponent's move is shown on OUR board, one
key reveals the answer and a second key says whether it was known — the move is
then played for the user, or marked wrong through Chessable's OWN "I don't know"
control and played. Two keys for a whole session, so it can be studied from a
Bluetooth ring. That mode also READS THE MOVES OUT (section 23b): the browser's
own speech engine, SAN spelled into words, `1` to hear the last move again, and a
BLINDFOLD setting that takes the pieces off our board — the board itself has to
stay, since it is what covers Chessable's own.
Currently working (v0.18.x).

## Structure

- `manifest.json` — MV3. Permissions: `storage` + `offscreen` + host
  permission for `explorer.lichess.org`. Nothing else, keep it that way.
  The CSP (`wasm-unsafe-eval`) and COOP/COEP keys exist solely so the
  offscreen document can compile WASM and use SharedArrayBuffer (engine
  threads) — do not remove them.
- `content/lichessable.js` — the main content script (`engine/san.js` is
  loaded before it in every frame: pure, no `chrome.*`, and section 13 needs
  its move generator). The panel runs inside
  Chessable's same-origin mt1 iframe (`all_frames: true`; other iframes exit
  unless `location.pathname` starts with `/mt1/explore/` or
  `/mt1/analysis/`). The TOP document never exits — it runs the review
  overstudy watcher (chessable.com navigates SPA-style, so `/practice/…` can
  be reached from any page without a load).
- `content/pagestate.js` — the ONLY MAIN-world script (`world: "MAIN"`, top
  frame only). Read-only fiber walk that hands auto-play the trainer's own
  lesson plan (section 13) and the mistake log each user ply's live `progress`
  (section 16) in ONE read — plus each ply's clickable-line `comment` (18b) and
  its accepted ALTERNATIVES (`readAlts`, section 23). Everything past the first
  two is OPTIONAL, so a plan that stops carrying any of it must still yield a
  usable line. Fields are copied out one by one on purpose: the context holds
  far more of the user's progress data than any consumer has a use for. Keep it
  free of `chrome.*` — a MAIN-world content script has no extension APIs.
- `content/lichessable.css` — panel styles, all namespaced `.clo-`.
- `background.js` — service worker; does the authenticated explorer fetch,
  opens overstudy tabs, and is the engine message hub. Message types:
  `clo-fetch-explorer`, `clo-open-options`, `clo-open-overstudy`, and the
  `clo-engine-*` family (all engine messages carry `target: 'sw'|'offscreen'`).
- `engine/` — optional local Stockfish (panel-header "Engine" toggle, off by
  default). `offscreen.html` + `engine.js` (UCI controller; `PROFILES` table
  at top: desktop = full build 4 threads/64 MB, mobile = lite build
  2 threads/16 MB, depth 30 desktop / 25 mobile, MultiPV 3, no movetime
  cap) + `san.js`
  (pure UCI→SAN converter, node-testable, no `chrome.*`). The profile is
  computed in the CONTENT script (`engineProfile()`; the offscreen doc can't
  see the tab's device) and rides on every `clo-engine-analyze`; Auto
  detection (userAgentData.mobile / deviceMemory ≤ 4 / hardwareConcurrency
  ≤ 4) is overridable via the options page's `cloEngineBuild` (auto/full/
  lite). A profile mismatch reboots the worker on the other build through the
  normal lifecycle (`startPending`); a missing vendored pair fails with a
  `missing-build (...)` status error naming the file — deliberately NO
  fallback to the other build. `engine/vendor/` holds both Stockfish 18
  multi-threaded WASM pairs (`stockfish-18.js` + `.wasm`, 108 MB;
  `stockfish-18-lite.js` + `.wasm`, ~7 MB) — gitignored, downloaded manually
  per README.
- `options/` — Lichess API token entry + Test button.
- `dev/harness.html` — UI harness. Open it in any browser (no extension, no
  Chessable, no server): it loads the REAL `content/lichessable.css` and renders
  a static replica of every `.clo-` surface, with toggles for `html.clo-touch`,
  backdrop and width. **Use it before touching panel/widget/popup styling** —
  most of these surfaces are otherwise reachable only by reloading the extension,
  loading a course and completing a variation. The replicas are hand-written
  from the builder functions and do NOT update themselves: change markup in
  `lichessable.js`, change it here too. Not referenced by the manifest; it does
  ride along in a `pack-and-push` .crx (inert, a few tens of KB).
- `dev/check-contracts.py` — asserts every cross-module bridge in
  `content/lichessable.js` is named in CLAUDE.md. Run it after ANY edit to this
  file (see Verification).
- `DESIGN-*.md` — ONE PER FEATURE, and each is the required reading its section in
  Key mechanics points at. They hold the loop, the measurements, the version
  history and the live ground-truthing; this file holds only what an edit
  elsewhere can break.
  * `DESIGN-autoplay.md` — section 13 (§12 = everything since the original design)
  * `DESIGN-difficult-moves.md` — sections 13b/13c/13d
  * `DESIGN-continuation-review.md` — section 18 (§7) and the heads-up 18b (§6, §8)
  * `DESIGN-retry-mistakes.md` — sections 16/17 (§7 = the log and runner as built)
  * `DESIGN-quick-edit.md` — section 12, incl. §6 refreshing the host after a save
  * `DESIGN-quick-edit-arrows.md` — section 12b only
  * `DESIGN-show-and-grade.md` — sections 23 and 23b
  * `DESIGN-repertoire-coverage.md` — section 21
- `DESIGN-ui-inventory.md` — every control by host and state, what competes with
  what, the agreed visual hierarchy, and the remaining change list. Read it
  before adding a control to the overstudy row or picking a colour for one; §3
  is the ruling on which tier a new button belongs to.
- `README.md` — OPERATIONAL reference only: install, reloading the extension,
  engine vendoring, permissions rationale, known limitations, plus an index of
  which document covers which feature. **Do NOT narrate features into it.** It has
  no reader — this is a solo local project — and the standing "update it alongside
  functional changes" rule was costing 30-80 lines of user-facing prose per
  functional commit for nobody. The mechanism belongs in the `DESIGN-*.md` docs and
  the contract surface here; if the project is ever published, a real README gets
  written from those in one pass, and it will be better than one accreted 50 lines
  at a time. Its operational sections ARE referenced from code and config
  (`.gitignore`, `options/options.html`, and this file's reload section) — keep
  those working.

## Hard constraints

- Plain JS/HTML/CSS only. No bundler, no npm, no frameworks, no remote code.
- Every Chessable selector lives ONLY in the `SELECTORS` object at the top of
  `content/lichessable.js`; Lichess API settings ONLY in `CONFIG.lichess`.
  Chessable's markup is fragile third-party internals — never scatter
  selectors through the code.
- WHAT BELONGS IN THIS FILE. CLAUDE.md is loaded into EVERY session; the
  `DESIGN-*.md` docs are not. So its job is NOT to explain a feature — it is to
  stop an edit made SOMEWHERE ELSE breaking one, and to say when to go and read
  more. Three things earn a place: (1) the CONTRACT SURFACE, i.e. every name by
  which one section reaches into another; (2) ANTI-REPAIR notes — things that
  look like bugs and must not be "fixed"; (3) a constraint this feature imposes
  on SHARED code, written where the edit would happen (`paintShape`'s colour
  rule belongs beside `paintShape`, not in the section that got bitten by it).
  Everything else — the loop, the measurements, the version history, the live
  ground-truthing — goes in the feature's design doc behind a "read this first"
  gate. Volume is not safety: an invariant buried in paragraph 14 of a 900-line
  bullet reads with the same weight as a timing table, which is how the critical
  ones get skimmed. `py dev/check-contracts.py` enforces (1) mechanically.
- All console output prefixed `[CLO]`.
- No inline event handlers. Remote/dynamic text via `textContent`, never
  `innerHTML` (the static panel skeleton is the sole innerHTML use).
- Bump `manifest.json` version on functional changes.

## Key mechanics (don't accidentally break)

- SPA activation (v0.27.1): chessable.com navigates by `pushState`, so ONE top
  document is the home page, then a course, then `/variation/<id>/`, then a
  trainer session — the content script runs once, at the tab's first load.
  Therefore `start()` starts EVERY top-document module on EVERY page and each
  one gates itself on the CURRENT url from its own 500 ms poll
  (`isTrainerPath()`, `isVariationPath()`, the chapter regex). Never branch a
  top-document feature on the load-time path: that is exactly what made the
  variation page's panel and pencil need a manual reload. The panel has ONE
  watcher (`initTopPanel` → `topPanelTick`) that dispatches to
  `reviewPanelTick` or `variationPanelTick` per tick and drops the stale
  fen/anchor/engine search when the mode flips; `positionTopPanel` dispatches
  the same way, and quick-edit re-picks its `HOSTS` entry (`syncHost`) on every
  tick and hover. Only the iframe-vs-top-document split (`IS_FRAME_APP`,
  `IS_ANALYSIS`, `IS_EDIT_PAGE`, `IS_REVIEW`) is still load-time — an iframe
  document really is created per app page.
- `#inputFEN` (inside the iframe) is the single source of truth for the
  position. Its value changes programmatically WITHOUT events — hence the
  triple detection: input events + MutationObserver on `#nextMovesBit` +
  500 ms poll, all debounced 300 ms.
- The 500 ms poll is also a self-healing watchdog: re-mounts the panel and
  re-binds listeners after SPA-style re-renders. All healing is idempotent.
  `topPanelTick` wraps its body in a try/catch that logs one line per distinct
  message: the interval survives a throw, so without it every tick would die at
  the same statement and the panel would simply freeze on its last position
  with nothing in the console — the one failure mode of this poll that is
  invisible from the outside.
- Fetches carry a sequence number; stale responses are cached but not
  rendered. LRU cache: 200 positions, keyed on the first four FEN fields
  (so move-counter-only differences share entries).
- Database filters (section 6b): ratings and speeds are USER settings, edited
  in the panel header's cogwheel menu — which also holds the repertoire picker
  (6c), first row, with a rule under it so it never reads as a filter the
  menu's "Reset" would put back. `CONFIG.lichess.defaultSpeeds/
  defaultRatings` are only defaults — the live values are the module-level
  `lichessFilters`, which is what `fetchExplorerData` and the chapter sort's
  `popCacheTag` read. Persisted in `chrome.storage.local` (`cloLichessFilters`)
  and re-applied from `chrome.storage.onChanged` in EVERY document, because the
  panel is in the mt1 iframe on Explore/Analysis and in the top document in
  review. `normalizeFilters` drops unknown values and never yields an empty
  dimension (the explorer would return nothing), the chip UI refuses the click
  that would empty one, and `applyFilters` clears both in-memory explorer
  caches (`fenCache`, and the alt-check's `acDbCache` via the
  `altCheckDropDbCache` bridge) — the chapter sort's storage cache is
  filter-tagged and just misses. The menu is an in-flow block at the top of
  `.clo-body`, NOT a floating popover: `.clo-panel` is `overflow: hidden` and
  the analysis/review panel is a sized overlay whose body is the scroll
  container.
- Repertoire badges (section 6c): one of the user's Chessable courses is
  nominated as THE repertoire (picker in the SETTINGS MENU, 6b — the panel's
  preference belongs with the panel's other preferences), read through the
  shared `getList` and walked into a position → moves index; every panel move
  row the repertoire plays gets a badge. READ-ONLY, and a different question
  from section 21: that one asks "which lines of the course I am looking at are
  missing from my repertoire" and WRITES them back; this one asks "standing
  here, what do I play".
  Section 5c is what makes it possible: `chessableCreds/Headers/ApiFetch/ApiUrl`,
  `fetchChessableBooks`, `reduceCourse`, `fetchCourse` + the course cache and
  `walkVariation` were HOISTED out of `initCoverage`, which only ever runs in
  the TOP document on `/course/` pages — the panel also lives in the mt1 iframe
  (same origin, so the same localStorage JWT). The two WRITES stayed inside
  initCoverage, behind its arming and its "is this course yours" guard.
  THE KEY IS PLACEMENT + SIDE TO MOVE (`repKey`), NOT `cacheKey`. In review the
  panel's FEN is rebuilt from the DOM, where — off the mainline, i.e. wherever
  the lesson plan cannot answer — castling is a home-square heuristic
  and en passant is always "-", while the walk computes both exactly — keying on
  all four fields would silently drop the badges after every double pawn push
  and most rook moves. Section 20's holds compare on the same two fields for the
  same reason. Cost: two positions differing only in castling/ep collapse into
  one, which at worst badges a move that is in the repertoire one board-state
  away. It is also what makes the TRANSPOSITION badge work (hollow ring: the
  repertoire does not play this move here, but the position after it is in its
  `seen` set) — the one thing an exact-line answer always gets wrong.
  The FOURTH verdict is the unprepared-reply WARNING (red triangle), and it is
  COMPARATIVE — which is why `repertoireRowStates(fen, moves, positionGames)`
  decides the whole move list at once and `repertoireBadge` takes a
  pre-computed state instead of a `(fen, uci)` pair. A move is 'risk' when it is
  played MORE OFTEN than the most popular move the repertoire covers here. FOUR
  silences, each of which would otherwise turn the table red:
  * OUR MOVE — only the opponent's options are a risk; preferring a less popular
    line is a repertoire DECISION (1...c5 over 1...e5), not a gap. Whose move it
    is comes from `ix.side` (`courseSide`, hoisted to 5c beside `sideOf`); a
    course that does not say which side it is for NEVER fires the warning rather
    than risk inverting it.
  * NOTHING COVERED HERE — no covered move means no threshold to beat, and the
    summary line already says the repertoire does not reach / stops here.
  * ALREADY BADGED — a transposition is answered, so it is not a gap however
    popular (`if (out[i] || …) continue`): orange beats red, by request.
  * BELOW `riskMinGames` (50, section 21's floor) for the POSITION — deep in a
    line "more popular" is regularly 3 games against 2.
  COLOUR IS LOAD-BEARING, not decoration: BLUE (Chessable's own) for "in your
  repertoire", never the lichess green the rest of the panel accents with —
  green in a move table reads as a VERDICT ("this is the good move"), which is
  the one thing the badge does not mean. ORANGE for a transposition, because it
  is a different KIND of answer, not a weaker version of the same one. RED for
  the warning. All three are CSS variables (`--clo-rep-in`, `--clo-rep-trans`,
  `--clo-rep-risk`) at the top of the 6c block.
  The marks are DRAWN (an empty span sized in CSS), never "●"/"○"/"▲" glyphs:
  those differ in size and baseline per font, and three marks that must be told
  apart at a glance need exact geometry. The hollow one is a BORDER, so both
  circles share an outer diameter and a column stays aligned; the TRIANGLE is a
  `clip-path` on the same box, NOT the border-triangle trick, so the width/height
  sizing rules (and the `html.clo-touch` override) keep working on it. Shape,
  not just a third colour: the warning is the only badge meaning "act on this",
  and a red/blue pair is exactly what a colour deficiency helps least with.
  The WHOLE ROW is tinted from the same answer (a 9px mark is easy to miss in a
  twelve-row table), set on the `td`s and NOT on the `tr`: `.clo-table tr:hover
  td` paints a background on the cell, which would cover one sitting on the row,
  so all six tint rules are written to outrank it. `.clo-move` is
  `white-space: nowrap` because its `width: 3.5em` is only a suggestion to the
  auto table layout and the badge otherwise wrapped under the move.
  `CONFIG.repertoire.indexVersion` is checked on every cache read: an index
  written by an older build parses fine and is quietly missing whatever field
  was added (v2 added `side`, without which the warning silently never fires).
  Bump it whenever the index gains a field.
  The SUMMARY LINE above the table carries the two answers a badge cannot: the
  move the repertoire plays INSTEAD (regularly outside Lichess's top dozen, so
  there is no row to badge at all) and "reaches this position but stops here" vs
  "does not reach this position". It sits OUTSIDE everything `showStatus()`
  hides, deliberately: a position with no Lichess games is exactly where it is
  the only thing the panel can still answer. Its move chips PLAY the move where
  a board accepts one — Chessable's own board outside review, and inside review
  only OUR analysis board (section 19, through the `continuationAnalysisPlay`
  bridge); the trainer's browse board and the variation page accept nothing.
  That answer flips WITHOUT the position changing (opening the analysis board
  keeps the board where it was, so `refresh()` short-circuits on
  `fen === state.fen`), so `syncRepertoireLine()` on the top-panel tick compares
  `rep.linePlayable` and redraws only on a flip — redrawing every 500 ms would
  kill a tooltip mid-hover.
  The walk YIELDS every `chunkVars` variations (a 500-line repertoire is a few
  hundred thousand CloSan calls and must not freeze the page) and the built
  index is cached in `chrome.storage.session` (12 h, ONE repertoire — there is
  only one selected). `seen` is not stored: it is the answers' own keys plus the
  line-END positions, so only those go in. `state.lastData` exists so the rows
  drawn before the index landed can be re-badged.
  THE EXPLORER'S UCI IS RESOLVED THROUGH CloSan, NEVER COMPARED RAW
  (`repertoireMoveState`, v0.48.1). Lichess writes castling as KING TAKES ROOK
  ("e1h1"); CloSan's generator — and so the index — uses "e1g1". Everything else
  that consumes a uci copes because `CloSan.uciToMove` normalizes the pair
  internally, but a string lookup in `answers` does not: every castling move
  fell through to the transposition arm, which then SUCCEEDED (the repertoire
  does reach the position after its own castling move), so "O-O" was painted
  orange while the summary line above it said the repertoire plays O-O. It also
  kept a covered castling move out of the red threshold, which can invent a
  warning. Section 21 is unaffected — it compares walk output against walk
  output, both canonical; the mismatch only exists where Lichess's uci meets our
  index. Ground-truthed 2026-08-01.
  THE MOVE CELL IS NO LONGER ONLY SAN — the badge is a child of it, so both
  existing readers (the analysis board's `onPanelMoveClick` and the quick-edit
  popup's alt-move prefill) read `tdMove.dataset.san`, never `textContent`,
  which now says "Nf3●".
  Everything fails soft: no session, an HTTP error, an unreadable course — the
  badges simply do not appear and the menu says why.
- The Lichess opening explorer requires a Bearer token since early 2026 and
  lives at `explorer.lichess.org` (`explorer.lichess.ovh` now 401s). Token:
  `chrome.storage.local` key `lichessToken` — the string is duplicated in
  content script, worker, and options.js; keep all three in sync.
- 429 → 61 s cooldown, then one auto-retry. 401 → in-panel settings prompt.
  Saving a token in options triggers a retry via `chrome.storage.onChanged`.
- Clicking a panel move row plays it on the board: synthetic
  pointer+mouse+click sequences on the source then destination square
  (`playMove`/`pressSquare`). Square ids (`e4-<uuid>`) are matched via
  `SELECTORS.boardSquare`. A plain `.click()` is NOT enough for Chessable's
  handlers — keep the full event sequence.
- Analysis-page placement: the panel's DOM home stays the sibling slot after
  `.nextMovesContainer` (inside `.row-analysis__col1`, which `mountPanel`
  makes `position: relative`), but `positionAnalysisPanel()` then pins it as
  an absolute overlay filling the WHOLE column: top 0, height = column height
  minus `SELECTORS.analysisControls` (Chessable's toolbar stays uncovered),
  floored at `CONFIG.analysis.panelMinHeight`, `auto` while collapsed.
  Recomputed on the FEN poll, on resize and in `applyHidden`. The doubled-class
  CSS rule `.clo-panel.clo-panel--analysis` is what beats the ≥1700px side-mode
  media query — keep it doubled.
- Analysis move tree: the panel does NOT re-implement it. `adoptAnalysisMoves()`
  MOVES Chessable's own `SELECTORS.analysisMovesBox` node into the panel's
  `.clo-moves` host, so click-to-navigate, both right-click menus and every
  other handler keep working because it is still their element (verified live:
  Vue survives the move and clicks still navigate). Rules: never insert
  anything of ours into that subtree; `analysisMovesHome` remembers
  `{node,parent,next}` in a VARIABLE (not via the panel — a detached panel must
  not take their list with it); `releaseAnalysisMoves()` puts it back on
  remount, on collapse ("Hide" = Chessable gets its UI back) and on `pagehide`;
  re-adoption on the poll heals re-renders. Their `.movesContainer` does NOT
  stretch as a flex item, and their stylesheet outranks ours on their own
  element — so its height CANNOT come from lichessable.css.
  `sizeAnalysisMovesHost()` sets host and box height INLINE to the moves'
  natural height (measured by briefly setting `height: auto` and reading
  `scrollHeight`), clamped between `CONFIG.analysis.movesMinHeight` and
  `movesMaxFraction` of the panel; `releaseAnalysisMoves()` clears those
  inline styles again. Their context menus compute their
  own coordinates — if placement ever looks off, that math (not the adoption)
  is the suspect.
- Trainer mode (`/practice/…` AND `/learn/…` — `isTrainerPath()`) is
  MoveTrainer2 in the TOP document — no mt1
  iframe, no `#inputFEN`, none of the explore widgets. Both routes render the
  IDENTICAL markup (drawer + marker, `.row-practice`, header title link,
  board, footer — ground-truthed live on a /learn/ session 2026-07-23), so
  every trainer feature (widget, panel, quick-edit, auto-play, alt check)
  treats them the same; a /learn/ session URL is `/learn/<course>/0/<listId>`
  while a single-variation overstudy tab is `/learn/<course>/<oid>/<lid>`.
  The review URL is
  CONSTANT for the whole session (`/practice/<course>/0/<listId>`) — the
  variation id is NEVER in it (ground-truthed by hooking `replaceState`
  through a live session; do not resurrect URL-swap approaches). The current
  variation comes from the DOM instead, polled at 500 ms: the active drawer
  row (parent of the `#currentStudyingVariation` marker div) carries `oid`
  (variation id), `lid` (list id), and `title` as plain attributes; fallback
  is the panel header's title link to `/variation/<oid>/`. Overstudy = the
  `/learn/…` route: Chessable's own Overstudy buttons navigate to
  `/learn/<course>/<oid>/<lid>[/w|b]` (color suffix optional — verified), so
  the widget builds that URL and the worker validates it (`OVERSTUDY_URL_RE`)
  and opens it `active: false`. The widget mounts on `document.body` — NEVER
  inside Chessable's React tree (foreign children can crash reconciliation).
- Review-mode Lichess panel (top document): shows ONLY in the trainer's
  post-completion browse state — gated on the `practiceProgress` "Completed"
  block + `commentMove` list, so it can never spoil an active quiz. No
  `#inputFEN` exists there; the FEN is rebuilt from the DOM each 500 ms tick:
  placement from `[data-piece]` divs in the board squares, side to move +
  fullmove parsed from the SAN numbering around the currently shown move
  (`commentMove_shownOnBoard` / `commentSubMove_shownOnBoard`; neither =
  initial position). CASTLING RIGHTS ARE HISTORY, WHICH A BOARD CANNOT SHOW
  (v0.51.1): a king that walked back home (6...Qxd1+ 7.Kxd1 O-O-O+ 8.Ke1) leaves
  a placement indistinguishable from one it never left, so the home-square
  heuristic granted White "KQ" and the ENGINE offered O-O-O in a position where
  castling is illegal — its whole line hung off an impossible move. So the
  placement read off the board is LOOKED UP in the trainer's own lesson plan
  (`reviewPlan` / `syncReviewPlan`, refreshed once per variation from
  `reviewPanelTick` since the read is async and `readReviewFen` is not), whose
  per-ply `sourceFen` carries exact rights, en passant and move numbers, and the
  plan's FEN is returned VERBATIM on a hit — so every MAINLINE position is exact,
  at no cost (pagestate.js answers from memory; nothing is fetched or simulated).
  Keyed on PLACEMENT + SIDE ONLY — the rest of that FEN is what the lookup exists
  to supply — and a placement repeating within the variation is poisoned unless
  both occurrences agree on the first four fields. A position INSIDE a comment
  line is not on the mainline and still falls back to the heuristic, with its
  rights intersected against the mainline position the comment hangs off
  (`boundReviewCastling` + the hoisted `attachPlyOf`): rights only ever shrink,
  so that can REMOVE an invented right and never grant one. `mainlineFens` and
  `attachPlyOf` were hoisted out of the continuation module (section 18) for
  this. En passant is still always "-" off the mainline.
  Mid-animation frames are skipped by
  requiring exactly one king per side. The panel mounts on `document.body`
  (`position: absolute` in DOCUMENT coordinates — viewport rect + scroll
  offset — NEVER fixed: a fixed element anchored to scrolling content chases
  the page from scroll events, which lag the compositor on mobile and made
  the panel visibly pop up and down; the overstudy widget is absolute for the
  same reason. `setInlinePx` writes a style only when its value actually
  changed, so the scroll listeners — kept as a safety net for inner scroll
  containers — are no-ops while the document itself scrolls, and the height
  cap is scroll-independent. Preferred spot is the gutter LEFT of the board,
  top-aligned, falling back to under the board/overstudy widget when that
  gutter is narrower than `CONFIG.review.panelMinWidth`; when the comment
  column is STACKED under the board — portrait/mobile, `stackedTrainerLayout`:
  the progress block sitting under, not beside, the board, or, outside the
  browse state where that block doesn't exist, less than
  `CONFIG.review.stackedMinSide` free width beside the board — the OVERSTUDY
  WIDGET drops below the entire trainer row (its usual below-the-footer spot
  is occupied by Chessable's comment header there) and the panel below the
  widget, so neither covers Chessable's UI, with width and left clamped into
  the viewport. Anti-bounce (`holdReviewPanelTop`): at a variation transition
  the trainer row collapses a couple of renders BEFORE the browse gates flip
  false, which yanked the still-shown panel up for a tick — an UPWARD move of
  the fallback anchor is applied only after persisting `holdUpMs`; downward
  moves apply immediately, and the hold resets on hide/gutter so a fresh show
  never fights it). Chessable centers the whole trainer row
  (board + comment column), so `centerReviewBoard()` puts a `translateX` on
  `SELECTORS.trainerRow` to center the BOARD instead — transform only (never a
  layout property), clamped so the comment column stays on screen. It runs on
  every tick of the WHOLE trainer session, quiz included, so the board never
  jumps when a variation completes; the applied offset is read back off the
  element, so a React re-render just re-centers from zero. The panel reuses
  ALL of the explore
  fetch/cache/render machinery via `IS_REVIEW` branches; move rows are not
  clickable in this mode.
- Variation-page Lichess panel (section 11b): the standalone
  `/variation/<id>/` page is the panel's THIRD host — also a React top
  document (mountPanel body-mounts it with the `--review` class), but the
  page has a real readonly `#inputFEN` that Chessable rewrites on every move
  navigation (verified live), so `readFen()` takes the ordinary input path
  there (`IS_REVIEW && !isVariationPath()` gates the DOM reconstruction) and
  NONE of the trainer machinery (browse gates, board centering, anchor hold)
  runs. `positionVariationPanel()` reuses the `CONFIG.review` thresholds:
  gutter left of the board, else below the ENTIRE page content
  (`SELECTORS.variationContent` = `#bodyContainer` — unlike the trainer, real
  content sits under the board: FEN row, Review box, Comments). A
  `hashchange` listener (navigation rewrites `#/<move>/<side>`) supplements
  the 500 ms tick. Move rows stay non-clickable — free-play injection on this
  board is UNVERIFIED.
- A `/learn/…` session booting in a hidden document (= background overstudy
  tab) auto-pauses its timer by clicking Chessable's pause control
  (`SELECTORS.trainerIconBtn` + `trainerPauseIcon`); backs off if the tab is
  focused first. Resume = Chessable's own play overlay.
- Touch-sized UI: `applyTouchUiClass()` (next to `useTouchInput`) toggles
  `clo-touch` on `<html>` in EVERY document the script runs in (mt1 iframe for
  the panel, top document for the widgets); one block at the END of
  lichessable.css hangs all the larger type/tap-target rules off
  `html.clo-touch ...`, whose specificity is what beats the ≥1700px
  side-mode media query. The detection is deliberately NOT `useTouchInput()`:
  that one picks the event flavour for injected moves and is load-bearing, so
  it stays as it is. Chrome's "Desktop site" rewrites `navigator.userAgent`,
  reports the UA-CH `mobile` hint as false and forces a ~980 CSS px layout
  viewport, so UA sniffing and width checks all read a phone as a desktop —
  the only usable signals are `(pointer: coarse)` (the PRIMARY pointer, so a
  touchscreen laptop with a mouse still reads fine) as the opening guess, and
  the human's own trusted `pointerType`, which settles it on their first tap.
  Only type sizes and padding change; nothing here touches a dimension the JS
  measures.
  ONCE A TOUCH DEVICE, ALWAYS A TOUCH DEVICE (v0.64.0). Both signals above are
  about the pointer IN USE, and a phone driven from a PC — scrcpy, an OTG or
  Bluetooth mouse, DeX — hands Android a REAL mouse: hover events with
  `pointerType 'mouse'` and a primary pointer that is no longer coarse. So both
  said "desktop" while the user was looking at a five-inch screen, and the whole
  UI shrank the moment the mouse moved. The device has not changed, so the
  answer must not either: touch evidence LATCHES into `touchDevice`, persisted
  as `cloTouchDevice` in `chrome.storage.local` and NEVER cleared automatically.
  Evidence is anything that can only be true of a touch device — a trusted touch
  pointer event, a coarse PRIMARY pointer, or touch points with no fine pointer
  available at all — and a phone has almost always produced one of those long
  before a PC is ever plugged into it. Storage is per browser PROFILE, and the
  phone's browser is not the PC's, so the latch cannot leak between machines.
  `cloTouchUi` (options page, `auto`/`touch`/`desktop`, same shape as
  `cloEngineBuild`) answers the two cases detection cannot: a false latch (a
  touchscreen laptop poked once with a finger stays large — the price of the
  latch, and 'desktop' is the way back) and a phone whose profile has genuinely
  never been touched, because the mouse was attached before its first page load.
  Both keys are watched through `chrome.storage.onChanged` in every document,
  since the panel is in the mt1 iframe and the widgets in the top one.
  `useTouchInput()` is deliberately NOT latched: it asks which events the board's
  live handlers are listening for, and a phone genuinely being driven by a mouse
  really does answer its mouse ones. It does now learn from PRESSES ONLY
  (`observedPressType`, set by pointerdown/pointerup; `observedPointerType` still
  takes hovers, for the UI question) — a phone can be HOVERED by a mouse while
  its taps still arrive as touch (scrcpy's sdk mouse mode injects clicks into the
  touchscreen but forwards hover as a mouse; a stylus over a tablet is the same
  shape), and a hover deciding the injection flavour would send our synthesised
  taps down the mouse path, which those handlers never hear.
- Engine (section 5b in lichessable.js): Stockfish runs in the offscreen
  document; the SERVICE WORKER is the mandatory hub — an offscreen document's
  `runtime.sendMessage` never reaches content scripts, so replies are relayed
  via `chrome.tabs.sendMessage(tabId, msg, {frameId})` using a target stored
  in `chrome.storage.session` (survives SW idle-restarts). Latest-position-
  wins: a new analyze during a search sends `stop` and DISCARDS all engine
  output until the `bestmove` fence (UCI info lines carry no request id —
  never render across that fence). Content side drops updates whose `fen` ≠
  `state.fen`. `syncEngine()` is the single start/stop decision point; the
  engine stops on hidden tab / collapsed panel / leaving review browse state,
  and toggling OFF closes the offscreen document (frees ~300 MB; it also
  self-closes after 5 idle minutes). Scores are normalized to White's
  perspective in engine.js, not in the panel. An analyze may carry an optional
  `reqId` (echoed verbatim on that search's updates — the ONLY per-request
  correlation, since UCI info lines have none; panel analyzes stay tag-free
  and their updates byte-identical) and an optional `depth` cap (never above
  the profile depth) — both ride the pending→current lifecycle in engine.js
  and survive a crash respawn. Used by the alt check (section 15), whose
  `state.altCheckBusy` makes `syncEngine` stand down while it owns the engine
  (it nulls `state.engineFen` first, so the stand-down sends no stop either).
- Quick-edit (section 12): hovering a mainline move shows a body-mounted pencil
  (singleton, NEVER inserted into Chessable's move list) whose popup has FOUR TABS —
  append a PGN comment to the variation ('save'), EDIT that comment as a whole
  ('edit'), edit the move's ARROWS and circles ('shapes', section 12b), or add
  ALTERNATIVE MOVES the trainer should also accept ('alt', a LIST added in one
  visit). Two hosts behind a `HOSTS` adapter: the review browse state and the
  standalone `/variation/<oid>/` page.
  **READ `DESIGN-quick-edit.md` BEFORE CHANGING ANYTHING HERE** — the driver, the
  host adapter, the two-visit edit flow, the alt-move recipe, rights probing and §6
  refreshing the host after a save. Arrows have their own doc,
  `DESIGN-quick-edit-arrows.md`. What follows is only what an edit ELSEWHERE can
  break.
  * THERE IS NO JSON API. Several of the edit form's POST fields are session/CSRF
    bound and opaque, so the ONLY safe path is to DRIVE Chessable's own edit page in
    a SMALL FOCUSED POPUP WINDOW — never a background tab, which clamps every timer
    (ours AND Chessable's) to ~1 s and pushes a save into the worker's job timeout.
    All waits are `quickEditWaitUntil`, MutationObserver-driven with the interval as
    backstop: NEVER add a plain fixed delay to that driver.
  * MATCH THE MOVE BY ITS 0-BASED PLY INDEX, NEVER BY ABSOLUTE NUMBER. The edit page
    renumbers every variation from move 1 — a tactics puzzle shown as "25. Qc2!" in
    review is `Qc2_w_1` there — while review keeps the source game's numbering.
    Verified live that both hosts' ply indices map 1:1 onto `#interactivePGN`.
  * SAN MUST COME FROM `quickEditSanFromEl`, never bare `textContent`: BOTH hosts
    draw a piece move's letter as an SVG FIGURINE child, so `textContent` of "♘c6"
    is just "c6". `quickEditSan` additionally strips eval glyphs (the edit page's ids
    carry none) — which is why section 18's `moveAnnotation()` has to read them
    separately.
  * NEVER PREFILL THE EDIT BOX FROM THE DOM, or from the lesson plan's parsed
    `comment` JSON. The comment as RENDERED is not the text Chessable stores —
    clickable lines are figurine spans, prose is markup — so saving a reconstruction
    back would destroy exactly the clickable lines section 18 quizzes. Hence edit
    mode is TWO VISITS (a read job, then a write carrying `baseText`), and the driver
    REFUSES to write when the stored comment no longer matches what the editor was
    filled from. That is the one failure of this feature that loses the user's work.
  * THE SUBMIT ALREADY CARRIES EVERY MOVE'S SHAPES. `addVariation()` POSTs
    `JSON.stringify(allTheMoves)` as `#commentsToSubmit`, so the comment driver's own
    submit serialises the whole variation — which is why quick-edit has never damaged
    a variation's arrows, and why the arrows tab needed no new save mechanism.
  * `quickEditApi = { rightsFor(bid), probe(bid, oid, win) }` IS THE SHARED RIGHTS
    CACHE, used by the alt check (15) and the analysis board's "Add as line" (19).
    Rights are per-COURSE and TRI-STATE, probed LAZILY — a probe opens a focused
    driver window, so nothing may probe merely because a board opened. Probe results
    reach quick-edit's own listener FIRST (`initQuickEditUi` runs before
    `initAltCheck` in `start()`), so the cache is warm when the others read it.
    NOTHING ABOUT A PROBE MAY FAIL SILENTLY: `probeRights` returns false when it
    cannot start one, a probe whose result never arrives is settled by a watchdog,
    and the alt check hears about that give-up through the `altCheckProbeSettled`
    bridge — otherwise both popups sit on "Checking edit rights…" for the session.
    `variationEditRights()` is top-level and shared with 19b: that page renders its
    "Edit Variation" link only for an editable course, so the answer is never null and
    no probe is needed — load-bearing, since the variation host reports NO `bid`.
  * `readQuickEditBid`/`readQuickEditOid` PARSE THROUGH THE ONE MODULE-LEVEL
    `TRAINER_URL_RE` (everything after the course id OPTIONAL). They used to carry a
    private, stricter pair whose /learn/ form demanded a variation id the live session
    URL does not always have, so the bid read as null and both popups hung. NEVER
    RE-DUPLICATE THAT REGEX.
  * THE POPUP MUST SWALLOW `keydown`/`keypress`/`keyup` in BUBBLE phase (not capture,
    unlike our board overlays): MoveTrainer2 binds single-key shortcuts on `document`
    and does not skip focused text fields, so typing a comment would otherwise drive
    the trainer. The default action still inserts the character; Escape closes.
  * PROMOTION ALTERNATIVES ARE REFUSED in popup and driver — the edit board's picker
    markup is UNVERIFIED, the same reason auto-play (13), section 22 and section 23
    refuse them.
  * REFRESHING THE HOST AFTER A SAVE (12c): the variation page CAN re-read in place
    and does; THE TRAINER CANNOT (`HOSTS.review.refresh` is null) and the status line
    says so instead. The page round trip is the riskiest code in this feature — once
    the pager is clicked we are COMMITTED to a navigation, so `refreshVariationPage`
    is a try/**finally** whose finally is the one unconditional step, and FALSE MEANS
    "not refreshed", NEVER "not where you were". While a refresh runs the popup stays
    in its SAVING ui (`qe.refreshing`), since the loaded copy is stale and a second
    Save would be refused by the staleness guard.
- The TRAINER ROW is shared, and since v0.58.0 it has rules of its own that no
  module may decide locally (DESIGN-ui-inventory.md is the whole argument;
  `dev/harness.html` renders every state). Ground-truthed live 2026-08-03 on
  course 453453 (overstudy of 70382641 — the route that reschedules nothing):
  collapsed 107x29 label-only mid-quiz, expanded with NOTHING filled, the browse
  row 473x38 with exactly one filled control, the manual collapse override
  DROPPED at the state flip, and the chooser/cog popovers leaving the widget
  height untouched. The one thing only a live run could show: a launcher wearing
  `clo-rowprimary` AND `clo-cr-open--important` at once — green fill plus amber
  ring, composing — which is why 18c's mark had to stop being a border recolour.
  SIX modules append to `.clo-review`
  — section 9 (overstudy), 13 (auto-play), 16/17 (mistakes/retry), 18-20
  (continuation/analysis/drill), 22 (type a move), 23 (show and grade) — and each
  one used to pick its
  own colour and
  land wherever `start()` happened to put it, so weight encoded WHICH MODULE
  built a control and order encoded the BOOT SEQUENCE.
  * GROUPS. Every cluster carries `.clo-review-grp`, which owns the layout, the
    8px inset and the `1px #3d3a36` rule; a block of `order` declarations at the
    top of the row's stylesheet decides the sequence (title 0, TYPE A MOVE 1,
    mistakes 2, practice 3, overstudy 4, settings 5, status 99 — the field is
    first because it is the only thing here that acts on the card being
    answered). So a module may keep
    appending whenever it boots and still land in its own group — that is the
    point, not a nicety. `.clo-review-grp:not(:has(> *:not([hidden])))` hides a
    group whose every child is hidden, so a group that empties takes its
    separator with it and no module has to tell the row it has nothing to show.
    The overstudy pair got a wrapper (`.clo-os`) for this; it used to be two
    loose children of the row.
  * ONE PRIMARY. `reviewRowPrimary()` (top level, beside `reviewStatusHost()`)
    returns a ROLE — `'stop' | 'queue' | 'clickables' | 'retry' | null` — and
    each module applies `.clo-rowprimary` in its own `sync*`, but ONLY to a
    control that is also showing. Two states answer null deliberately: mid-quiz
    (nothing in this row acts on the card being answered) and a clean browse
    state with nothing outstanding. A named control that is HIDDEN fills
    nothing, which is why the function needs no clause about our own overlays —
    during a quiz/drill/analysis the practice launchers are hidden by their own
    sync and the row goes quiet by itself. Inputs cross module boundaries
    through the usual null-safe bridges: `retryRunActive()`,
    `mistakeLogApi.pending()`, `continuationLineCounts()`.
    The treatment is a MODIFIER (`.clo-review .clo-rowprimary`, nested so it
    beats every single-class base rule without any of them knowing it exists)
    and carries its own border, padding and radius, because the primary can land
    on a control that has none — "Stop" is `.clo-mx-mini`, bare text.
    `html.clo-touch .clo-review .clo-rowprimary` restores the row's tap padding.
  * COLOUR MEANS ONE THING EACH. Filled green = the one primary. Green outline =
    an ordinary action, which is what every practice launcher wears (including
    both drill buttons, which used to be amber). AMBER OUTLINE = "you have N
    outstanding items" and NEVER launches anything — `.clo-mx-btn` alone. Amber
    RING = section 18c's "an author marked this important", on both launchers
    now, never an outline. Amber TEXT (no border) = the status line. Neutral
    outline = an action away from the main task (Analyse, Overstudy).
    Adding a control to this row means picking one of those, not inventing a
    sixth; §3 of the design doc is the ruling. The ONE exemption is section 22's
    move field, and only because it is not an action at all: a text input looks
    like the inset well every other text field here uses and goes green at the
    BORDER on focus, which says "the keyboard is going here" without claiming to
    be the thing to press. `reviewRowPrimary()` is untouched for the same reason
    — the primary fill is a claim about a BUTTON, and a field cannot be it.
    The palette itself is 16 `:root`
    TOKENS at the top of the stylesheet (v0.59.0), named by role
    (`--clo-accent`, `--clo-attention`, `--clo-text-dim` …) — but `--clo-rep-*`
    (6c) and `--clo-cr-important` (18c) deliberately stay beside their own rules,
    because each carries paragraphs of argument about why that exact colour.
  * COLLAPSED MID-QUIZ (v0.59.0, §3.3). Outside the browse state the row goes
    down to its label plus whatever is actively RUNNING. Three CSS rules do it —
    `.clo-review--collapsed .clo-review-grp { display: none }` and two exceptions,
    `.clo-mx:has(> .clo-mx-mini:not([hidden]))` and
    `.clo-tm:has(> .clo-tm-input:not([hidden]))`. Both READ the owning module's
    own gates rather than adding a flag: while a pass runs, `count` and
    `retry` are hidden and Skip/Stop are not, so "this group has a visible mini"
    IS "a pass is running"; the move field is hidden by section 22 whenever there
    is no live quiz, so "this group has a visible input" IS "a quiz is asking for
    a move". Neither can drift. Auto-play's status chip
    needs no rule — it lives on `.clo-review-status`, which is not a group.
    The `:has()` is LOAD-BEARING in both, not decoration: `.clo-review-grp[hidden]`
    and the empty-group rule both sit at (0,2,0), which a plain
    `.clo-review--collapsed .clo-tm` would only TIE — and later-wins would then
    show a group whose every child is hidden. Matching on the child's state takes
    the exception to (0,4,0), i.e. strictly narrower than the rule it bends.
    Measured in the harness: label-only 29px, with the move field 38px, and 58px
    under `html.clo-touch`.
    State is section 9's: `collapseAuto` (what `reviewBrowseReady()` asks for)
    and `collapseManual` (the user overriding it, DROPPED the moment the state
    flips, and never persisted — a sticky collapse costs the browse-state
    launchers for the rest of the session with no clue why). Collapsing closes
    the overstudy chooser and calls `autoPlayCloseSettings`, which shuts the cog
    popover AND disarms a pending "Clear?": a confirm hidden between its two
    clicks is one the user can neither complete nor see they owe.
  * ONE OVERSTUDY BUTTON (v0.59.0). "This variation" / "Previous variation" were
    one intention split in two, and the second is unavailable for the whole
    first variation of every session — a permanently-dead control describing a
    choice that usually is not one. Now one button: with a distinct previous
    variation it raises `.clo-os-menu` (which is also where the variation TITLES
    finally live, instead of in a tooltip), otherwise it opens the only answer
    there is. `previousEntry()` keeps the same-oid guard that in-session
    back-navigation needs.
  * AUTO-PLAY'S SETTINGS ARE BEHIND A COG (v0.59.0, F4). Toggle, speed and Clear
    are persistent preferences and everything else in the row acts on the current
    variation or session; the panel had already solved this with `.clo-cog`. The
    cog CARRIES THE STATE — `.clo-ap-cog--on` plus the answer in words in its
    tooltip — because that is the one thing hiding a toggle costs. Never a fill:
    it is a setting, and a fill means "the one thing to do next".
  * Both popovers (`.clo-os-menu`, `.clo-ap-menu`) are BODY-MOUNTED and fixed,
    placed once from their trigger's rect, like every other popup here. Inside
    the row they would change the widget's height, which the Lichess panel, the
    alt-check chip and the heads-up all follow. Both swallow keydown/keypress/
    keyup (MoveTrainer2 binds single-key shortcuts on `document` and does not
    skip them for a focused control), close on an outside pointerdown in CAPTURE
    phase by containment — never `stopPropagation`, the trainer underneath is
    entitled to the event — and are dismissed rather than chased on resize.
- Auto-play (section 13): records every move the user answers correctly during a
  trainer session and replays it when a later variation (or a transposition)
  reaches the same position, handing back at the first unproven move. Scope is
  BOTH trainer routes (`isTrainerPath()`); proofs are shared per course. ON by
  default at the 'fast' speed.
  **READ `DESIGN-autoplay.md` BEFORE CHANGING ANYTHING INSIDE THIS MODULE** — the
  keying decision, the tracker, the injection recipe and its measured clocks, the
  line oracle, and §12 "implementation notes since the original design" (which is
  where every post-v0.30 fix lives) are all there. "Difficult moves only"
  (13b/13c/13d) has its OWN doc, `DESIGN-difficult-moves.md`. What follows is only
  what an edit ELSEWHERE can break.
  * THE RECORD IS `chrome.storage.session`, 12 h TTL, NEVER `storage.local` —
    stale proofs would auto-pass genuinely-due cards, which is the one way this
    feature can cost the user real scheduling. Keyed on POSITION (placement + side
    + castling, en passant dropped), per course; a position holds a SET of proven
    moves, since a course regularly answers one position two ways and both are
    right.
  * THE LINE CHOOSES THE MOVE, THE RECORD ONLY PROVES IT. `evaluateAutoPlay`
    resolves the MAINLINE's SAN on the plan's own position and injects only if
    THAT move is in the proven set — never the other way round. Everything about
    multi-answer positions follows from this, so do not invert it.
  * ONLY A VARIATION'S OPENING RUN IS EVER REPLAYED (`vs.handedOver`): once the
    user plays a move by hand, auto-play does not resume later in that SAME
    variation even if a transposition reaches a proven position again — resuming
    mid-line was reported as jarring. Sections 17 (`resumeAfterHandover`) and 13b
    each lift this deliberately, scoped to what they are driving; never let a lift
    leak into ordinary sessions.
  * THREE HOLD FLAGS, ORed IN `held()` — NEVER COLLAPSE THEM. `ap.heldOff`
    (section 18b's mid-quiz review / an analysis board: an outside feature owns
    the board and nothing is really being played on it), `ap.retryHeld` (section
    17's transition shield) and `ap.sgHeld` (section 23). Two owners on one
    boolean lose eventually — a self-clearing watchdog would lift someone else's
    hold. `processFrame` reads `ap.heldOff` DIRECTLY and not `held()`, because
    under the other two the session really IS being played and those frames are
    real moves: routing section 23 through `heldOff` meant the tracker observed
    nothing all session and no proof was ever recorded.
  * BRIDGES IT OWNS, all null-safe: `autoPlayHold`, `autoPlayRetryHold`,
    `autoPlayShowGradeHold` (the three above), `autoPlaySetHold` — section 17's
    EXCLUSIVELY, rewritten from `applyHold()` on every tick, so anything else
    writing through it is wiped twice a second — `autoPlayIsProven` /
    `autoPlayIsHeld` (read), `autoPlayNoteProvenMove` (the ONE write bridge into
    the record; the caller must know the exact FEN AND that the move was right, so
    nothing DOM-derived qualifies), `autoPlayNoteTypedMove` (section 22 asserts a
    human typed a move, so it is filed as an answer rather than as trainer-played),
    `autoPlayBoardQuietMs` (`Infinity` when unknown = "no reason to wait"),
    `autoPlayReplaying` and `autoPlayCloseSettings`.
  * INJECTION IS `pressSquare` ON THE TWO SQUARES IN THE SAME TASK — the recipe
    sections 22 and 23 also use. Click-move is the path MoveTrainer2 ANIMATES; a
    drag redraws instantly and replays teleport. Same-task is what keeps the
    selection invisible. The event flavour comes from the human's own trusted
    `pointerType`, NEVER `navigator.maxTouchPoints`. PROMOTIONS ARE REFUSED
    everywhere (the trainer's picker markup is UNVERIFIED) — never half-play one.
  * `clo-injecting`'s CSS MUST NEVER TOUCH `.piece-417db`. The element that
    animates any move — Chessable's own replies included — is a `.piece-417db`
    parked on `document.body` for the glide, so hiding it breaks the very
    animation the injection borrows.
  * KEEP A SPEED PRESET'S `settle` ABOVE ~450 ms: that is how long ONE animated
    trainer move occupies the board, and it is the figure section 23's
    `pressFloorMs` is derived from. A press landing inside that animation is
    swallowed.
  * THE LINE ORACLE IS `content/pagestate.js`, the extension's ONLY MAIN-world
    script, and it is READ-ONLY: no page state written, no page function called,
    nothing put on `window`. React fibers are page-world expandos, so the plan
    cannot be read any other way. It answers a JSON STRING over
    `clo-ps-req`/`clo-ps-res` (live objects do not cross the world boundary), and
    every consumer past the first two fields must still work when the plan carries
    none of them.
  * DIFFICULT MOVES ONLY (13b) FAILS CLOSED — the opposite of nearly everything
    else here. An unreadable feed grants NOTHING and degrades to ordinary
    auto-play; failing open would mean auto-playing the moves the user is worst
    at. `/practice/` only, keyed `(oid, mid)` and never a position, and the
    verdict gives NO opinion on a variation the mode did not itself open.
  * `noteDeadContext(err)`: after an extension reload every `chrome.*` call in the
    still-running content script throws. Such an orphan holds a record it can
    neither refresh nor save and could still drive presses off it, so the module
    STANDS DOWN on the first such error and says so. Reloading the extension alone
    never revives a tab.
- Wrong-guess alt check (section 15; /practice/ AND /learn/): capture is
  TWO paths, and the POINTER path is the primary one — ground-truthed live
  2026-07-23: a refused move usually NEVER commits to the board DOM (review
  mode, and every non-final learn attempt, animates the piece straight back),
  so the board observer sees nothing and no rollback ever fires for it.
  `maybeCaptureRefusedGuess` (every frame AND every 500 ms tick — needs no
  rAF, so hidden tabs work too) therefore reconstructs the guess from the
  user's own trusted input: `ap.recentSquares` keeps the last few board
  squares under trusted pointerdown/pointerup (geometric hit test via
  `elementsFromPoint` — during a drag the event target is the floating
  piece), consecutive same-square events collapsed; while the Incorrect note
  is live (or within `noteGraceMs` of `vs.incorrectNoteAt`, stamped
  unconditionally now) and the tracked position still has the USER to move,
  the last two distinct squares are the refused from→to. Legality on the
  oracle position is the garbage filter (a deselection click never forms a
  legal user-colour move — that bail is deliberately silent). The rollback
  path in `rollbackTo` still covers a COMMITTED-then-retracted move (learn
  final attempt): pending answer + Incorrect note, with the pre-guess
  position looked up by `pending.posKey` in `vs.history` — NOT by requiring
  the rollback to land exactly one ply back (the trainer sometimes rewinds
  further and replays the opponent move). Both paths dedupe through
  `vs.lastOfferKey` (placement+side+uci; cleared on transient oracle
  failures so a retry can still offer). "Time's up" is deliberately NOT
  captured; promotion guesses are refused with one console line.
  `captureWrongGuess` drives the oracle itself if needed, locates the
  pre-guess position in `vs.oracleSim` by placement+side, and hands section
  15 an offer built ENTIRELY from the plan: the exact `sourceFen` (kept
  verbatim on sim entries as `.fen` — the tracker's own position has
  approximate castling and must NOT be serialized for the engine), the
  lesson-plan index as the edit driver's `plyIndex`, the mainline SAN/colour,
  and `coursePostFen` — the position AFTER the mainline ply (the next sim
  entry's fen; for the variation's final ply derived via `sanToUci` +
  `fenAfterUci`, both top-level helpers shared with the popup).
  The chip is body-mounted, absolute in document coords under the
  board/footer/widget; it hides on dismiss (×), oid change, path leave, or an
  opponent reply that confirms a PENDING USER answer (`altCheckOnAdvance` —
  the user genuinely moved past the failed move; the pending gate matters
  because learn mode DEMONSTRATES after a failure — solution replay plus
  sometimes the opponent's reply, all trainer-driven with no pending record —
  and those must not dismiss the chip the moment it shows). An orphaned
  content script (extension reloaded, page not) can still capture and show
  the chip but no chrome.* flow can run — `extensionAlive()` gates openPopup
  and doAdd with a "reload this page" status instead of hanging on
  "Analyzing…". The popup compares the guess against the COURSE MOVE, not
  the engine best: it searches `coursePostFen` then the guess's post-FEN
  (both built by `fenAfterUci`; halfmove reset on pawn move/capture) to
  `CONFIG.altCheck.targetDepth`, matching updates by `reqId` prefix
  (`ac<ts>-<n>:pre|:post` — pre = course move) — accepted only in the
  matching phase, so a late stray pre update cannot corrupt the guess eval.
  Verdict = mover-perspective pawn loss vs the course move, clamped at 0 (a
  guess that evals better reads "as good as the course move"; mates mapped
  to ±mateCp∓distance): green < 0.2, yellow ≤ 0.4, red above — red needs a
  second "Add anyway" click. Each row also shows the move's Lichess score
  ("54% · 1.2k", mover-perspective, from ONE explorer fetch of `preFen` with
  the deeper `dbMovesLimit` — a refused move is often too rare for the
  panel's move limit; cached in `acDbCache`, failures just leave the cells
  empty). Rights via `quickEditApi`, but a probe is launched at most ONCE
  per popup-open (`ac.probeStarted`) and a FAILED probe sets
  `ac.probeFailed` → status "Could not check edit rights — close and reopen
  to retry" — applyAcRights must NEVER silently re-probe in a loop (each
  probe opens a focused driver window, and the old loop left the popup stuck
  on "Checking edit rights…" forever when a probe timed out).
  Add = the UNCHANGED quick-edit alt job (`mode:'alt'`), rights via
  `quickEditApi`; the qe module's own result handler ignores it (its popup is
  hidden) and vice versa (`ac.phase === 'saving'` + oid guard). The popup
  swallows keys bubble-phase like the qe popup. The engine is booted on
  demand regardless of `cloEngineEnabled` and released the moment both evals
  land (`releaseEngine`: stop + `state.engineFen = null` + `syncEngine()` so
  a browse-state panel search resumes by itself); no shutdown is sent — the
  offscreen document's own 5-minute idle close reclaims the memory.
- Mistake log (section 16) + retry runner (section 17): every move failed in a
  session is logged from the trainer's own per-ply quiz record, and "Retry" walks
  those variations again as overstudy. The list behind it is the WHOLE session's
  history, grouped by chapter and foldable — a move already gone through stays in
  it, dimmed and unticked, and can be retried or drilled as often as the session
  lasts.
  **READ `DESIGN-retry-mistakes.md` BEFORE CHANGING ANYTHING HERE** — §1-5 the
  original design, §6 the list-as-history change, §7 the log and runner as built
  (the ply clock, the holds, the transition shield, ownership). What follows is only
  what an edit ELSEWHERE can break.
  * THE SOURCE IS THE TRAINER'S OWN `progress`, read out of the lesson plan —
    `quizIncorrectAttempts`, holding the refused SAN or the literal `"timeUp"` or
    `"giveUp"`. NOT the DOM and NOT a hooked `fetch`: `pagestate.js` is read-only by
    design. Section 23's give-up therefore joins this list with no bridge of its own,
    which is why `wrongLabel` has to know all three shapes.
  * `chrome.storage.session`, 12 h TTL, never `storage.local` — a stale list would
    drill another day's moves. Writes MERGE (`mergeEntry`): every tab shares that
    area, and a background overstudy tab used to overwrite the review tab's log.
  * THE RUNNER ONLY EVER DRIVES `/learn/`. NEVER click a drawer row in a
    `/practice/` session: the runner would go on to ANSWER that variation, and
    ANSWERING is what reschedules it — the opposite of what a retry pass is for. (The
    CLICK itself reschedules nothing, measured 2026-08-09; section 13c is built on
    exactly that. This rule is about what the runner does NEXT.)
  * IT OWNS TWO BRIDGES. `mistakeLogApi` — `pending()` (not retried, not
    overstudy-mode) drives the count, `reviewRowPrimary()`, the row's Retry and
    section 20's launcher, while `all()` drives the popup; plus `markDone`, which
    section 20's drill calls so the two launchers share ONE list and cannot disagree
    about what is outstanding, `passedPly` and `byChapter`. And `retryRunActive`,
    which several modules stand down on: section 18's auto-start (that pass navigates
    between variations itself and would tear a just-opened quiz down) and section
    22/23's `advance()` (the pass has a queue and drives its own route).
  * `retryNoteTargetPlayed` IS FIRED FROM `applyObservedMove` AT MUTATION SPEED, for
    the ONE hold whose answer advances the pass — never every hold. With mistakes at
    moves 8 and 12, answering 8 must leave the board alone so the replay of 9-11
    stays fully VISIBLE; that is the behaviour most likely to be got wrong.
  * `autoPlaySetHold` IS THIS MODULE'S EXCLUSIVELY. It is rewritten from
    `applyHold()` in every tick's `finally`, so anything else writing through it is
    wiped twice a second — and `applyHold` picks its item by the oid ON SCREEN, never
    by the queue cursor, because auto-playing a move the user is being asked to retry
    is the one outcome this feature must never produce.
  * AUTO-PLAY IS HELD BY `ap.retryHeld` VIA `autoPlayRetryHold`, never `ap.heldOff`.
    Under this shield the session underneath really IS playing, and the opponent's
    reply is what confirms the user's answer as a proof — so `processFrame` must keep
    reading frames. The three hold flags are ORed in `held()` and none may release
    another's: this one self-clears on a watchdog.
  * THE SHIELD FAILS OPEN, UNCONDITIONALLY — a stuck shield is far worse than the
    gap it closes. `syncShield` runs from `tick`'s FINALLY so every early return
    passes through it, and it drops on a lifetime cap, oid change, browse state,
    hidden tab, off-path and pass end.
  * `startRun` REFUSES outside the browse state and RETURNS FALSE when it does, so
    the popup can say why in its own status line — a widget flash behind that popup
    would never be seen. Same contract as `continuationDrill`. `return true` is sent
    BEFORE the first `driveRun()` step, so a throw there cannot read back as a
    refusal.
  * `cloRetryMode` ('whole' / 'from' / 'only') decides how much of a line the user
    plays; 'only' lifts auto-play's `handedOver` rule through `resumeAfterHandover`,
    scoped to the variation the pass is DRIVING and cleared on every other tick.
    Never let that lift leak into an ordinary session.
- Continuation review (section 18): quizzes the clickable subvariation lines a
  completed variation ends with — opponent plies auto-played, the USER'S OWN COLOUR
  asked for, lines run in sequence. Nothing is recorded as proven and nothing is
  rescheduled: this is practice, not review.
  **READ `DESIGN-continuation-review.md` BEFORE CHANGING ANYTHING INSIDE THIS
  MODULE** — §1-5 the original design, §6 the mid-quiz heads-up (18b), §7 every
  change since (branch segmentation, combining, browse mode, the arrow geometry,
  the "already in the course" check, the drag layer, auto-start). What follows is
  only what an edit ELSEWHERE can break.
  * THE FACT EVERYTHING FOLLOWS FROM: CHESSABLE'S BROWSE BOARD IS
    NAVIGATION-ONLY. Ground-truthed with the extension's own `pressSquare` recipe
    — a legal move changes no piece, on any square pair — so a quiz cannot run
    there, and moving their React-rendered `[data-piece]` divs is out of the
    question. Hence TWO BODY-MOUNTED OVERLAYS, absolute in DOCUMENT coordinates
    (never `fixed`, section 11's reasoning): our board pinned on theirs, and our
    panel COVERING `SELECTORS.reviewCommentBox` — not decoration, since the lines
    being quizzed are PRINTED there, so covering them IS the quiz. NOTHING OF OURS
    EVER ENTERS CHESSABLE'S DOM.
  * SECTION 11c IS SHARED BY FOUR FEATURES — the line quiz, the drill (20),
    section 23's board and the quick-edit arrows editor (12b) — so a change to
    `fillBoardGrid`, `boardVisualPos`, `boardSquareAt`, `harvestBoardPieces`,
    `makeBoardPiece`, `boardShapeArrow`/`boardShapeCircle`, `BOARD_SHAPE`,
    `SHAPE_COLOR_HEX` or `paintShape` lands in four places at once. Three rules for
    every caller:
    - A SHAPE'S COLOUR IS AN INLINE STYLE, never a presentation attribute
      (`.clo-cr-shape`'s CSS `stroke` outranks an attribute of the same name, so
      every arrow would come out green), and on EXACTLY ONE property per element:
      `stroke` for the shaft and the ring, `fill` for the HEAD, which the CSS also
      gives `stroke: none`. Colouring the head's stroke overrides that none, and
      nothing sets `stroke-width` on a head, so it falls back to SVG's default of
      1 — one whole SQUARE of outline in a `viewBox="0 0 8 8"`. A bbox excludes
      stroke, so that measured correct while looking wrong.
    - `paintShape`'s colour argument must be a COLOUR KEY (`'g'|'r'|'b'|'y'`) or a
      CSS VALUE. It took only the keys until v0.80.0 and dropped anything else
      SILENTLY, falling back to the stylesheet's green — i.e. to exactly the colour
      the caller passed an argument to avoid. It rendered two features' arrows in
      the wrong colour for three releases, invisibly, because nothing errored.
    - `boardShapeArrow`'s `headScale` DEFAULTS TO 1 and must keep doing so. Only
      section 23 passes anything else (0.75); the quick-edit editor above all needs
      the full-weight shape, since what it draws is meant to be what Chessable
      renders after the save. Same for `.clo-cr-shape`: section 23 scopes its own
      opacity through `.clo-sg-arrow` rather than touching that shared class.
    Pieces are Chessable's own live `<svg>` nodes CLONED (`cloneNode(true)`, never
    innerHTML, no vendored art); geometry is ALL percentages, so a resize needs no
    JS. The arrow/circle geometry is chessground's, MEASURED off a live board —
    and `dev/harness.html` keeps its OWN copy of those numbers and does not update
    itself, so CHANGE ONE, CHANGE BOTH.
  * A LINE WHOSE NUMBERS FIT NOTHING WE CAN RECONSTRUCT IS DROPPED, never guessed
    at. v0.34.1 removed a legality-only fallback that had quizzed a sideline on a
    mainline position 8 plies away because both moves happened to be legal there.
    Same for a line annotated "?"/"??"/"?!" on the USER'S colour — authors write
    those to show what NOT to play, and `isBlunderAnnot` tests the FIRST character,
    so never use a "contains a ?" test ("!?" is kept, "?!" is dropped).
  * IT OWNS FIVE BRIDGES, all null-safe: `continuationActive` (the review panel and
    section 22 stand down on it — our board covers the one their FEN is read off),
    `continuationAnalysisFen` and `continuationAnalysisPlay` (section 19's board is
    a MODE of this one, so the panel and the repertoire chips follow it),
    `continuationLineCounts` (`reviewRowPrimary()` asks what is outstanding) and
    `continuationDrill` / `continuationReviewNow`, which RETURN FALSE when they
    cannot act so the caller can say why — a popup's own status line is the only
    place that message can be read.
  * KEYS ARE SWALLOWED ON `document` IN CAPTURE PHASE while a run is active (not
    bubble, unlike the quick-edit popup): our overlays are rarely focused, and
    MoveTrainer2's single-key shortcuts ("n" = next variation) ignore focus, so one
    keypress would end the quiz. That listener STANDS DOWN on `showGradeActive()`,
    which is load-bearing rather than tidy — `start()` registers this one FIRST, so
    it would otherwise swallow space before section 23 ever saw it.
  * AUTO-PLAY AND THE ALT CHECK ARE INERT BY CONSTRUCTION here: they watch
    Chessable's board, which a quiz never touches. Only "Review now" (18b), which
    runs mid-quiz, has to hold anything off.
- Mid-quiz heads-up (section 18b): the SECOND way into section 18's review, and the
  answer to "the user has no idea where the lines start". While a variation is being
  played — i.e. OUTSIDE the browse gates the launcher needs — a small body-mounted
  panel is raised the moment the comment column prints a clickable line branching at
  the position the user is standing on, offering "Review on variation end" and
  "Review now". Opt-OUT (`cloLineHeadsUp`, absent = ON).
  **READ `DESIGN-continuation-review.md` §8 BEFORE CHANGING ANYTHING HERE** — the
  plan-reading, the three raise rules, the queue, the trainer hold, the placement
  and its measurements, and the resting dim are all there. What follows is only what
  an edit ELSEWHERE can break.
  * ONLY THE FIRST PLY IS EVER PRINTED. The rest of the line is what the review will
    ask for, and half of it is the user's own moves — printing it would answer the
    very quiz the panel is offering. For the same reason a line whose FIRST ply is
    the USER'S colour is not raised mid-variation: it branches where the trainer is
    about to ask them for a move. At the FINAL position that no longer applies and
    such a line IS offered.
  * THE SOURCE IS THE LESSON PLAN, NOT THE DOM. A quiz renders NO `commentMove`, NO
    `commentSubMove` and not even a `commentScrollContainer` — everything the browse
    scanner reads is created only when the variation completes. That is also why the
    panel's own placement can key off the scroll container's presence to tell browse
    from quiz.
  * NEVER DERIVE ITS PLY CLOCK FROM THE BOARD DOM. After a rolled-back wrong answer
    that board can hold a stale DUPLICATE piece for far longer than an animation,
    which no one-king-per-side check catches; the derived placement then matches no
    plan position and the clock simply stops, leaving the panel up over a position
    the user left several moves ago. The clock is the plan's own `fen` located among
    the plies' `sourceFen`s — the same read section 22 uses, for the same reason.
  * IT MUST NOT SWALLOW KEYS, unlike every other overlay here: the user is still
    playing on Chessable's board and needs MoveTrainer2's shortcuts. Its buttons
    `blur()` themselves after a press instead, or the next space would re-fire them.
    SPACE reaches it through section 23's `continuationReviewNow` bridge, or through
    the continuation module's own listener when that mode is not running.
  * "REVIEW NOW" IS THE ONLY RUN THAT LIVES OUTSIDE THE BROWSE STATE, and it PUTS
    THE TRAINER ON HOLD for the duration — the session timer paused (or the minute
    spent in a sideline is charged to the card being answered) and auto-play held
    off through `autoPlayHold`, since our board covers theirs and an injection would
    be a move played into a board nobody can see. `releaseTrainer` is called from
    `closeReview` on EVERY close, so a run torn down by a variation change cannot
    leave the session paused, and it resumes the timer BEFORE releasing auto-play.
    `cr.midQuiz` is what exempts this one run from `tick`'s "left the browse state"
    teardown; every other active review must still die there.
  * THE QUEUE IS NEVER STARTED AUTOMATICALLY — landing in a quiz nobody asked for is
    jarring, and the final continuations are only offered once the variation ENDS, so
    the user must have a moment to add those before anything starts. It holds the
    RESOLVED LINES themselves, never their names: the two readers legitimately
    disagree about a line's `lineSig`, so a cross-reader lookup silently withdrew
    lines that had been offered mid-quiz. NEVER REINTRODUCE ONE.
  * HIDDEN WHILE AUTO-PLAY REPLAYS (`autoPlayReplaying()`), because the positions go
    past at auto-play's own speed. HIDDEN, not dismissed: the group stays out of
    `seen`, so whatever is branching where auto-play hands back is raised the moment
    it does.
  * DELIBERATELY NOT GATED ON `document.hidden` — auto-play is, because it DRIVES
    the board; this panel only reads and renders, and the guard made the feature
    impossible to verify under automation, where a driven tab always reports itself
    hidden.
- Important lines (section 18c, v0.49.0): a clickable line whose FIRST move
  carries a "!" ("3.c3! d5") is one the author is pointing at, and every host of
  it says so. Almost no new reading: `moveAnnotation` (DOM) and
  `parseCommentMove` (plan) have ALWAYS split the trailing `!`/`?` run off a
  clickable move and kept it on the ply — that is how a line asking the user for
  a "??" gets dropped — so `importantLine` is `isStrongAnnot(plies[0].annot)`,
  the mirror of `isBlunderAnnot`, FIRST CHARACTER only ("!?" important, "?!"
  blunder). Ground-truthed live 2026-08-01 on course 453453 that the glyph
  survives into BOTH readers untouched: the DOM span reads "3.c3!" and the plan's
  comment JSON carries `{"key":"S","val":"3.c3!"}`.
  THE FIRST PLY, never "any ply in the line": the opening move is what NAMES a
  line — it is what the heads-up prints, what the launcher counts and what the
  user chooses by — while a "!" deeper in praises that move, an ordinary thing
  for an author to write about a line they think nothing special of as a whole.
  AMBER (`--clo-cr-important`), and neither of the two colours already in use:
  green is this feature's ordinary accent (prompt, launcher, branching move), so
  an important line drawn in green would be invisible among them, and red is Exit
  plus the repertoire panel's "you have no answer to this". The colour is never
  alone — every host also says the WORD "Important", since a colour-only signal
  is the one thing a colour deficiency helps least with.
  Three hosts: the launcher (`clo-cr-open--important`, a RING on the filled queue
  button since an amber fill would read as a different button, and a sentence
  from `importantNote` on both tooltips), the heads-up
  (`clo-cr-heads--important` when ANY line of the group is marked — the group is
  raised and queued as one unit — plus `clo-cr-heads__move--important` on the
  marked rows inside a mixed one), and the quiz panel
  (`clo-cr-panel--important`, title "Important continuation n of m"). The quiz
  panel's class is toggled in `syncUi`, NOT in `startLine`: the scope picker (no
  line yet), the analysis board and a drill card must all CLEAR it, and each is
  reached by a different path.
  NOTHING about which lines are offered, queued, dropped or ordered changes —
  the mark is a highlight, not a filter. Drill cards (section 20) build plies
  from the mistake log, which has no annotations, so they are never important;
  that is correct, a failed move is not a line an author marked.
- Analysis board (section 19, v0.40.0): the SAME overlay pair as section 18 in a
  second MODE (`cr.mode`), never a board of its own — the whole point is that
  the quiz already solved "Chessable's browse board accepts no input", and a
  copy would drift. Only three input gates branch, all defaulting to the quiz:
  `onSquare` and `onDragStart` ask `moverColor()` (analysis = whoever is to
  move; quiz = the ply being asked for) and `tryMove` calls `anPlay` instead of
  comparing against the line. Everything else — grid, drag layer, promotion
  picker, arrows, `positionOverlays`, `closeReview` — is shared and unchanged.
  Board ORIENTATION moved out of `cr.userColor` into `cr.view` (`boardView()`,
  read by `visualPos`/`fillGrid`/`dragSquareAt`/`buildGrid`): Flip must never
  touch `cr.userColor`, which is what the quiz means by "the colour whose moves
  are asked for", and `startLine` resets `cr.view` so a flip never leaks into a
  quiz. History is ONE line of `{uci, san, fen}` (`cr.an`), the fen from the
  top-level `fenAfterUci` (exact castling/ep/halfmove); playing after stepping
  back truncates, which is the whole "no variation tree" decision.
  `anRemoveFrom` ("Remove from here", Backspace/Delete, v0.44.0) is that same
  truncation with nothing played in place: it drops the move at `cr.an.idx` AND
  everything after it, then `anGoto(idx - 1)` — one call that repaints,
  re-renders the list, refreshes the panel and lands on the position the
  replacement move would be played from. Removing is a change to the line, so it
  clears a finished save's message exactly as `anPlay` does and the Add preview
  follows.
  THE PANEL FOLLOWS OUR BOARD through a second null-safe bridge,
  `continuationAnalysisFen` — `readFen()` prefers it over `readReviewFen()` and
  `reviewPanelTick` skips its `continuationActive` stand-down while it is
  non-null, which is all it takes for the database, the opening name and
  `syncEngine` to describe our position. A database ROW click plays that move
  (`onPanelMoveClick`): review rows carry no `dataset.uci` (click-to-play there
  would drive Chessable's board, which does not work), so the SAN is resolved
  with `sanToUci` against `cr.pos`; it stands down while the quick-edit popup is
  open, which reads the same clicks for its alt tab. The START position is
  `analysisStartFen()`, which in the trainer is `readReviewFen()`, so it inherits
  whatever that can answer — exact on the
  mainline (the lesson plan's own FEN), home-square castling and en passant "-"
  inside a comment line — and every position after it is exact. `positionReviewPanel`'s below-the-board fallback now also clears
  `CR_PANEL_ID`, for the stacked layout where both park under the board.
  PLAYING writes nothing: no proofs, no rescheduling, and Chessable's board is
  never touched — so `closeReview` skips `navigateToLineEnd` in this mode and
  leaving is just hiding the overlays.
  ADD AS LINE (v0.41.0) is the one write, and it is the UNCHANGED quick-edit
  'save' job (section 12) — no new driver, no new message type. The line is
  written out as numbered SAN from its own start position (`analysisLinePgn`;
  ellipsis form when Black moves first, since that is what Chessable's authors
  write and what its parser turns into clickable moves), wrapped in PARENTHESES
  and preceded by the user's optional lead-in — `analysisCommentText`, e.g.
  "An example continuation: (12.Be3 Rb7 13.Nc3)"; the parentheses are how
  Chessable writes a line inside a comment and are NOT decoration. The lead-in
  is typed into a field in the panel and lives on `cr.addPrefix`, OUTSIDE
  `cr.an`: it is the user's wording, not the board's state, so it survives one
  analysis closing and the next opening. The document-capture key swallow (below) SKIPS its own
  board shortcuts while that field has focus, or typing "f" would flip the board
  and an arrow would walk the move list instead of the caret; Escape blurs the
  field rather than closing the board on a half-typed sentence. The text is
  APPENDED to the comment of the move the board was showing when the analysis
  opened. That move
  is read BEFORE the overlays go up (`analysisEntryMove` → `reviewMoveDescriptor`
  — the review ply index maps 1:1 onto the edit page) and stored on `cr.an.entry`,
  because the line's numbers only name real positions relative to THAT move. A
  shown SUB-move is REFUSED: the board is then inside a comment line, so the
  position our moves continue from is not where any mainline comment hangs, and
  the numbers would name positions the author never joined up. Every refusal
  carries a sentence (`entryWhy`) for the panel's status line — a greyed-out
  button with no reason is the one outcome a user cannot act on. Rights come
  from `quickEditApi` (shared per-course cache + lazy probe), probed on the FIRST
  PRESS and never on open: a probe opens a focused driver window, which nobody
  asked for by opening an analysis board. That press MEANT save, so the probe is
  a detour: `cr.an.pending` holds the composed text and
  `onAnalysisQuickEditResult` sends it once rights come back — but only while
  text, oid and plyIndex still match, since a probe window is up for seconds and
  the board is live behind it.
  ONE PRESS SAVES (v0.43.0). The arming press this started with was removed on
  request; what replaces it is that the status line shows `analysisPreview()` —
  the EXACT text a press would append — for as long as the button is idle. So
  the preview a confirm would have offered is on screen BEFORE the press instead
  of after it, and the write stays recoverable through the pencil's Edit tab.
  Any change to the line or the lead-in clears a finished save's message so the
  preview comes back (`anPlay`, the prefix field's input listener); the button
  also `blur()`s itself, or space/Enter would append the same line twice.
  Probe AND save each get a local watchdog
  (`addRightsWaitMs` / `addWaitMs`): the worker's 25 s job timer does not survive
  an idle restart, and quick-edit's own probe watchdog only unsticks ITS popup
  and the alt check's. Results ride the shared `clo-quick-edit-result` message —
  three listeners now, each ignoring what is not its own (ours: mode 'save',
  matching oid AND plyIndex). The whole move list is written, not the part shown:
  playing after stepping back truncates, so the list IS the line. Chessable's
  comment column behind our overlay keeps the OLD text until the trainer redraws
  the variation, so the status line is the entire confirmation.
- THE ANALYSIS BOARD ON A VARIATION PAGE (section 19b, v0.66.0; ground-truthed
  end to end 2026-08-04 on /variation/70382641/): the `/variation/<oid>/` page is
  the analysis board's SECOND host, and it cost a `tick` branch plus three
  host-dependent reads because the module already runs in every top document and
  the page's board is the STANDARD chessboard.js markup the trainer's is —
  measured live: `.chessboard-63f37` 452px with no `[data-testid=boardContainer]`
  wrapper (so `getReviewBoard()`'s document fallback finds it), 64
  `.square-55d63` carrying `square-e4` classes AND `e4-<uuid>` ids, and
  `div.piece-417db[data-piece=wR]` with an `<svg>` child, so `harvestBoardPieces`
  and `trainerUserColor` work unchanged.
  ONLY THE ANALYSIS BOARD. `variationTick` is deliberately not a smaller copy of
  the trainer tick: the clickable-line quiz, the heads-up, the drill and the
  retry pass all belong to a SESSION. It reuses `cr.oid` for the page's own
  variation id, which buys the "variation changed" teardown for free — the page's
  pager navigates with NO document load (section 12c), so an open board must not
  survive into the next variation. Verified live: pager click ⇒ 'analysis board:
  variation changed' and the launcher back on the new one.
  * `analysisStartFen()` reads the page's own readonly `#inputFEN` here (section
    11b — it is kept current on every move navigation), so EVERY start position
    is exact, castling and en passant included, even inside a comment line where
    the trainer host must fall back to the home-square heuristic. NOT `readFen()`:
    that prefers OUR board, which is the thing being opened.
  * `readFen()` now asks `continuationAnalysisFen()` FIRST on both review hosts,
    above the `isVariationPath()` split — otherwise the input read below it wins
    and the panel sits on the move Chessable's board was left on.
  * `analysisEntryMove()` splits into `reviewEntryMove` / `variationEntryMove`.
    Here the shown move's id IS its 0-based ply index and its class is the colour
    (`variationMoveDescriptor`, quick-edit's own). `variationMoveShown` is NOT
    scoped to the mainline — a clickable move inside a comment wears the same
    highlight class — so membership of the `variationMoves` list is what refuses
    one, for the review host's reason: our line would continue from a position no
    mainline comment hangs at.
  * `positionOverlays()` covers `SELECTORS.variationMovesBox` (`#theOpeningMoves`)
    when neither comment selector matches. Measured live: it is 488x489 at
    [948,195], i.e. exactly the trainer's comment-column slot right of the board
    inside `.grid-variation`, and our panel lands on it to the pixel.
  * EDIT RIGHTS NEED NO PROBE and must not start one. `variationEditRights()` was
    hoisted to top level out of quick-edit's `HOSTS.variation` and is now shared:
    the page renders its "Edit Variation" link only for a course the user can
    edit, so the answer is never null. That is load-bearing rather than an
    optimisation — the variation host reports NO `bid`, so `quickEditApi.rightsFor('')`
    would answer "unknown" and open a driver window for a question already
    answered on screen.
  * THE LAUNCHER IS IN THE LICHESS PANEL'S HEADER (`CR_VARBTN_ID`,
    `.clo-cr-analyse-head`), because this page has no trainer row and the panel is
    the surface the board is ABOUT — it is what follows our position once the
    board is open. Same TIER as the row's Analyse (neutral, DESIGN-ui-inventory
    §3), different vocabulary: every control in that header is bare text, and an
    outlined button among them would be the loudest thing in a panel whose job is
    to be read. Measured live at 420px: title ends at 278, Analyse 286-337,
    Engine 345-390, cog 398-417, Hide 425-458 — one 38px line.
  * `tick` calls `hideVariationButton()` on EVERY non-variation tick, not just
    from `syncButton`: the panel ELEMENT survives the SPA hop into a trainer
    session (`reviewPanelTick` only re-mounts a DETACHED panel), and the mid-quiz
    branch returns without reaching `syncButton` at all — so the button would
    otherwise still be sitting in the trainer's panel header.
  * After a save the page keeps showing the old comment. `refreshVariationPage`
    (12c) COULD re-read in place and is deliberately not called: it pages away
    and back with our board still up, and every hazard in that function's own
    notes would apply with an overlay over the board. The status line says
    "Reload the page to see it" instead.
- Mistake drill (section 20, v0.45.0; verified live 2026-07-29): the fast
  alternative to the retry pass —
  the session's failed MOVES, one card each, instead of their whole variations.
  It is a THIRD MODE of section 18's overlays (`cr.mode = 'drill'`), never a
  board of its own: a card is built in exactly the `cr.line` shape the quiz
  plays, so `startLine`/`step`/`tryMove`, the drag layer, the promotion picker,
  the arrows and `positionOverlays` are the quiz's and UNCHANGED. What the mode
  actually costs is the wording in `syncUi`, two launchers, and the rules below.
  Nothing navigates, nothing loads, Chessable's board is never touched and
  nothing is rescheduled.
  Everything a card needs was already in the log: `sourceFen` is the exact
  position before the failed move (lesson plan, so castling and en passant are
  real), `san` is the course move, and the NEW `lead` field (section 16) holds
  the plies before it — captured in `ingest`, where the whole plan is in hand,
  because it is unobtainable later without loading that variation, which is the
  very cost this feature exists to avoid. `CONFIG.retry.leadPlies` (4) is what
  is STORED, `CONFIG.continuation.drillLeadPlies` (1) is what is PLAYED: the
  run-up length is meant to become a setting and a stored log cannot be
  back-filled. An entry logged before v0.45.0 has no `lead` and simply gets no
  run-up.
  Two rules, both load-bearing:
  * the run-up ply is played ONLY if it is the OPPONENT'S. A user-colour ply
    would be ASKED FOR by `step()` — the drill would quiz a move the user never
    failed. Future modes wanting more run-up need a per-ply "auto" flag in
    `step()`, not a bigger `drillLeadPlies`.
  * a mistake leaves the pending list only on a CLEAN answer — no miss, no hint
    (`finishDrillCard`, called from `step()`'s line-done branch, which is
    reachable only by the correct move being played; "Skip move" goes straight
    to `nextLine` and so marks nothing, deliberately). It sets the SAME
    `retried` flag the runner does (`mistakeLogApi.markDone(oid, mkey)`), so the
    drill and Retry share one list and cannot disagree about what is
    outstanding.
  `drillLine` refuses rather than guesses: a card whose SANs do not resolve is
  dropped with one console line, and a card whose run-up does not resolve falls
  back to the failed move alone. `drillPlies` walks with `sanToUci` +
  `fenAfterUci`, the same step `walkLine` takes, so both kinds of card carry
  identical ply objects. A drill line carries `userColor` (a queue spans a whole
  session and can mix colours; the board's orientation is only the last
  variation's) — `startLine` applies it, and clickable lines, which carry none,
  are unaffected. `closeReview` skips `navigateToLineEnd` for anything but a
  quiz: a drill's positions come from the log, and the comment column holds
  nothing matching them.
  Both launchers are browse-state gated ("Drill mistakes (N)" on the section-18
  cluster, "Drill selected" in the mistake popup through the `continuationDrill`
  bridge, which returns FALSE when it cannot open so the popup can say why): our
  board overlays Chessable's, so offering this mid-quiz would cover a live quiz
  board. The gate lives in `openDrill` itself, NOT only in `syncButton` — the
  popup is reachable mid-quiz, and the watchdog closes any active overlay the
  moment the browse gates go false, so a drill started there flashed up and was
  torn down on the next tick, leaving no board AND no message (seen live,
  v0.45.1). The Lichess panel keeps its ordinary stand-down (active overlay, no
  analysis FEN) — here that is the point, since the database's top move would
  name the answer.
  `closeReview` also clears `cr.busy` now. Exit is live during an opponent's
  move and during the finished-line pause, only `step()` ever cleared it, and a
  drill has an opponent move on nearly every card — so a stale `true` left the
  NEXT run's board refusing every press.
- Type a move (section 22, v0.65.0): a text field on the trainer row that answers
  the LIVE CARD — type "Nc3" and it is played on Chessable's own board. OPT-IN
  (`cloTextMove`, storage.local, absent = off; options-page checkbox, watched
  through `chrome.storage.onChanged`), and the reason it must be is real: the
  field takes the keyboard, and MoveTrainer2 binds single-key shortcuts ("n" =
  next variation) on `document` without skipping focused fields — so while it has
  focus those shortcuts go to the field. It therefore swallows keydown/keypress/
  keyup on ITSELF in bubble phase (the quick-edit popup's discipline, and bubble
  is enough), and Escape BLURS rather than closing anything: the trainer gets its
  shortcuts back until the next move, and the field is still there.
  Almost NOTHING here is new — that is the point of where it was put:
  * THE POSITION IS THE TRAINER'S OWN `ctx.fen`, through `readLessonLine()` —
    section 18b's ply clock source, for section 18b's reason. NEVER a placement
    read off the board: after a rolled-back wrong answer that board can hold a
    stale DUPLICATE piece for far longer than an animation (ground-truthed
    2026-07-27), which no one-king-per-side check catches, and a FEN derived from
    it then matches nothing. It is also EXACT — castling rights and en passant
    included — so "O-O" and "exd6" resolve without any of `readReviewFen`'s
    heuristics. Re-read every tick; a changed FEN CLEARS the field, deliberately:
    a move typed in full for the previous position must never be carried over and
    fired at a board the user has not looked at yet. No type-ahead.
  * PLAYING IS AUTO-PLAY'S INJECTION RECIPE, verbatim — `pressSquare` on the two
    squares in the SAME task (the path MoveTrainer2 ANIMATES; see section 13),
    with `clo-injecting` as the same backstop. Promotions are REFUSED with a
    sentence, not half-played: the two presses would open Chessable's own
    promotion picker, whose markup is UNVERIFIED — auto-play refuses them for
    exactly this reason.
  * NOTHING IS VERIFIED AFTERWARDS, and that is a decision rather than an
    omission. A REFUSED MOVE LEAVES THE POSITION EXACTLY AS IT WAS, so auto-play's
    "is the placement still `beforeKey`?" test — which is sound for a move it
    knows to be correct — cannot here tell a press that never landed from a wrong
    answer. Chessable says which it was, in its own words, directly above the
    board. Do not add a board-diff check to this path.
  * `autoPlayNoteTypedMove(from, to)` IS THE ONE NEW MECHANISM, and it is
    load-bearing twice over. Our presses are synthetic, so without it
    `applyObservedMove` classifies a typed move as 'trainer' (user colour, no
    pointer credit — the solution-replay arm): it would never become a
    `pendingRecord`, so a move answered by typing would NOT be remembered as
    proven and would be handed back on every later pass through that position;
    and `ap.recentSquares` would stay empty, so the alt check's POINTER path
    (section 15, the primary one) could not name a refused typed guess and the
    engine-check offer would silently never appear. The bridge stamps
    `ap.lastPointerAt` and pushes the two squares IN ORDER (the alt check reads
    the last two distinct entries as from→to) through the hoisted `noteSquare`.
    Deliberately NOT a synthetic pointer EVENT: `onTrustedPointer` refuses those
    on purpose, so our own injections can never vouch for themselves — and the
    fact being asserted is that a HUMAN typed the move, not that a pointer moved.
  THE RESOLVER runs on every keystroke and plays on sight when the text can only
  mean ONE legal move AND nothing longer starts with it. Order: exact-case SAN,
  then case-insensitive SAN, then UCI, then a piece move with its disambiguation
  left out; more than one match at any step is REFUSED with both named, never
  guessed at. Case is honoured before it is ignored because "bxc3" and "Bxc3" are
  two different moves. The "nothing longer" clause has exactly ONE real case —
  O-O is a legal move and the first three characters of O-O-O — and there, and
  only there, Enter commits; the uci spelling "e1g1" has no such problem and
  castles on sight. NO IDLE TIMER: a wrong move here is scored against a real SRS
  card, so "they have probably stopped typing" is not a good enough reason to
  play one. The resolver is pure and was spot-checked against the real CloSan
  generator (33 cases: start position, both castles, two knights to d2, en
  passant, promotion, bxc3/Bxc3, Rae2/Rhe2, uci prefixes) before any of the above
  was written down — four of the first FENs were wrong, not the code.
  FOCUS is taken by itself when a quiz is asking for the user's move and nothing
  else holds it, so a move needs no click first — but NEVER on a touch device
  (`wantsTouchUi()`), with the ONE exemption below: a phone would otherwise throw
  its on-screen keyboard over half the board unasked.
  THE PAGE MUST NOT ZOOM (v0.65.1). `html.clo-touch`'s 16px was only half the
  cure — it answers the "this text is too small to edit" trigger, and mobile
  Chrome and Safari scale the WHOLE PAGE up around a focused field ANYWAY
  whenever the layout viewport is wider than the screen (Chrome's "Desktop site",
  which section 6's touch latch exists because of, guarantees exactly that). The
  board then goes off screen mid-quiz. So `lockViewport()` rewrites the PAGE'S
  OWN `meta[name=viewport]` to `maximum-scale=1` for as long as the field is
  being typed into and `unlockViewport()` restores the original string verbatim,
  so pinch-zoom is the user's again the moment they are done. Armed on
  POINTERDOWN as well as on focus — iOS decides the zoom as part of the focus and
  a meta written from the focus handler can be one beat late — and released on
  blur, on `hide()` and on pagehide. Touch only, and a page with NO viewport meta
  is left alone: adding one would relayout the whole site. Existing
  `maximum-scale`/`minimum-scale`/`user-scalable` tokens are STRIPPED rather than
  appended to (a duplicated key is not reliably last-one-wins across engines);
  `user-scalable=no` is deliberately not sent — Chrome ignores it and it is an
  accessibility anti-pattern.
  IT NO LONGER STANDS DOWN IN THE BROWSE STATE (v0.65.1) — it changes JOB. The
  old stand-down was right about the facts (no card, and that board takes no
  moves at all, section 18's founding ground truth) and wrong about the cost:
  hiding the field CLOSES A PHONE'S KEYBOARD, so every variation cost a tap on
  the field before the first move could be typed, which is most of the feature.
  So `setBrowse(true)` keeps the field, empty and inert, and gives it exactly one
  key: ENTER ASKS FOR THE NEXT VARIATION. There is no control of ours to press
  and no selector of Chessable's for one, so `advance()` sends the trainer its
  OWN shortcut — `CONFIG.textMove.advanceKey` ('n'), re-dispatched as
  keydown/keypress/keyup on `document`, which is where MoveTrainer2 binds it and
  why it ignores focus in the first place. Our field swallows the real keys, so
  the dispatch cannot loop back in. Rate-limited by `advanceMs` against a double
  Enter. NEEDS A LIVE VERIFICATION that a synthetic key event is accepted there;
  every other synthetic input in this extension is pointer/mouse.
  IN THAT STATE THE KEY SWALLOW INVERTS: everything but Enter and Escape falls
  THROUGH to the trainer. The field takes no moves there (`onType` clears what is
  typed), so swallowing "n", space and the arrows would cost the user Chessable's
  own browsing shortcuts for the whole post-completion state and buy nothing.
  `setBrowse` only ever acts on a CHANGE — it is called every tick and rewriting
  the value would eat a half-typed move.
  THE KEYBOARD SURVIVES THE VARIATION CHANGE, which is the touch exemption:
  `advance()` stamps `tm.carryAt`, and `maybeFocus` honours a carry younger than
  `carryFocusMs` even on a phone. That is the one case where a keyboard is not an
  ambush — it was already up, and the user pressed Enter with it. It is a
  ONE-SHOT: spent when it focuses, and spent by `tick`'s LIVE branch as soon as a
  live card holds the field (never by the browse branch, where a field that loses
  focus mid-transition must still get it back). After that a blur is the user
  tapping something else, and taking focus back would be the ambush.
  The browse hint is shown ONLY while the field holds the keyboard: measured in
  the harness it costs the browse row 26px (38 → 64) and the Lichess panel
  anchors below the widget, so a line standing there for the whole browse state
  would move the panel for a key nobody can press without focusing first. At
  473px (the ground-truthed browse row width) and above the FIELD itself adds no
  height at all; only at ~380px does it force a wrap.
  Still stands down entirely while `continuationActive()` (our own board covering
  theirs: a clickable-line quiz, a drill, the analysis board, all of which have
  their own input, and whose key swallow is in CAPTURE phase). Commits are
  refused while `autoPlayReplaying()` — two move sources pressing squares at once
  is not something MoveTrainer2 has to cope with — with the reason in the status
  line.
- Repertoire coverage (section 21, v0.46.5; ground truth and every endpoint in
  DESIGN-repertoire-coverage.md; read, ranking, add and duplicate-removal all
  verified live 2026-07-29): answers "which of this
  course's variations are still missing from my repertoire?", on a course page,
  and adds them. Four same-origin JWT-only endpoints, the same auth as the
  chapter sort: `getHomeData` (the user's courses), `getList` (a course's
  variations), `duplicateVariationsToRepertoire` (add) and
  `updateOpening&mode=del` (delete). `checkVariationDuplicatesInCourse` is
  DELIBERATELY unused and must stay that way — called with all 77 source oids
  against a target that already held all 77 it still answered
  `duplicatedChapters: []`, so whatever it detects it is not membership.
  MATCHING IS THE POSITION TREE, never a variation-list diff. Chessable's copy
  keeps NO back-reference (a new oid carrying only name/moves/color/initialFEN),
  so membership can only come from the moves — and exact-SAN matching, which
  does work today, cries "missing" about a line added from another course, one
  the user edited, or one covered by a transposition. Both courses are walked
  into positions keyed on `cacheKey` and each source variation is walked to its
  FIRST DIVERGENCE. Severity is decided by what the repertoire HAS at that
  position, not merely by whose move it is: nothing at all ⇒ 'hole' (our move)
  or 'ends' (theirs, i.e. the repertoire line stops — whatever they play, our
  next move is unprepared); a different move ⇒ 'alternative' (ours) or 'unmet'
  (theirs). The design's table had only 'hole' and 'unmet'; the other two came
  out of testing the walk, and WITHOUT them a repertoire that merely recommends
  something else reads as a hole and one that simply stops reads as "you may
  never be asked", which is the opposite of true. A line reaching our positions
  by another MOVE ORDER is still reported, at the first move we cannot answer —
  that is correct, not a miss: nothing prepared against 1.Nf3 stays a gap
  however it transposes on move 3.
  Positions are WALKED with CloSan from each variation's own `initialFEN`, never
  taken from `getList`'s `fens` array — that is what makes castling and en
  passant exact, and the only thing that works on a copy the user edited. A line
  whose SAN does not resolve is reported unplayable, never half-inserted.
  RANKING is the product of the OPPONENT plies' Lichess shares to the divergence
  (our own plies are a choice, not a risk, so they count 1), the divergence ply
  itself included only when it IS an opponent option ('unmet'); reported
  conditional on the course's own root position (the deepest position all its
  variations share) with the unconditional figure in a second column, and
  truncated with a "~" wherever a position falls under `minGames` rather than
  multiplying noise into a fake precision. `score = P_cond × exp(−d/D)`, D a
  panel setting, every term a column so the sort is auditable.
  ONE explorer request per DISTINCT position, cached in the SAME
  `cloPopularityCache` the chapter sort fills — which is why `popCacheTag`,
  `loadPopCache`, `savePopCache` and `fetchPopularityCounts` were hoisted to
  top level, why entries are keyed on `cacheKey(fen)` rather than the full FEN
  (the explorer's answer does not depend on the move counters), and why BOTH
  features now ask for `CONFIG.lichess.bulkMovesLimit` (50): a course's sideline
  is regularly outside the panel's top 20, where a truncated list would score it
  "never played" rather than "not asked for".
  Course listings cache in `chrome.storage.session` REDUCED to
  oid/name/SAN/colour/start-FEN (the raw payload is ~180 KB per course), 12 h,
  dropped for the target after any write. WRITES are guarded three ways: the
  destination must be authored by the user (`authorUid` — NOT `isRepertoire`,
  which was true for the source course and false for the actual repertoire), it
  must be the course the on-screen report was computed against, and Add arms
  before it fires; delete additionally wants "delete" typed. Both re-read the
  course afterwards rather than trusting our model of what we wrote.
  The panel is body-mounted and fixed, and `render()` (every 500 ms tick) does
  visibility and buttons ONLY — `renderReport()` is what redraws the list, or
  the poll would fight the user's scroll position and their focus in a checkbox.
  FOUR THINGS THE LIVE TEST CHANGED, none of them guessable from the design:
  * `getList`'s `moves[].san` CARRIES THE MOVE NUMBER — the array is
    ["1.e4","c5","2.Nf3",…], one ply per entry, the same convention as
    editVariations' PGN-ish STRING. `sanOfMove` strips `/^\d+\.+/`. Taking the
    design's §2.4 at face value made 76 of 77 lines unplayable and produced a
    confident "0 of 77 present · 0 missing" — so a run where the unplayable
    lines OUTNUMBER the playable ones now THROWS, with the offending lines named
    in the console. A systematic parse failure must never come back as an answer.
  * the add body's `targetCourse` is an OBJECT, `{courseId, chapterId}` — which
    is exactly why it is not called `targetCourseId` like the check call's field.
    A bare number returns 403 UNAUTHORIZED, which reads like an auth failure and
    is not one (the same headers get 200 on the check call). Captured by hooking
    `fetch`, driving Chessable's own flow to its last button and BLOCKING the
    request — the way to read a write's shape without performing it. `chapterId:
    null` is what the UI itself sends when a repertoire rather than a chapter is
    picked, so we send exactly that.
  * a gap whose line starts from a position the repertoire NEVER REACHES cannot
    be ranked: no opponent plies precede its divergence, so the product is empty
    and every tactics puzzle scored P = 1 and 1.0000, sorting the lines we know
    least about to the top. `rankable` excludes severity 'unreachable'; they read
    "—" and the summary says why.
  * the TARGET repertoire is read FRESH every run (`fetchCourse(..., false)`),
    only the source is cached. The target is the side that changes — our writes
    AND Chessable's own add flow in another tab — and a cached read reported
    "0 duplicated" about a repertoire that had just gained a duplicate.
  Also flagged: a cross-colour comparison (White course vs Black repertoire)
  diverges at ply 0 on our own first move for every line and scores a perfect
  1.0, so `colorClash` prints a warning above the list. Not refused — "none of
  these are in there" is still a true answer.
  STILL OPEN (§4 of the design): whether passing a real `chapterId` merges into
  that chapter; whether `mode=del` is recoverable through the course page's
  "Show Deleted"; and the tree walk's cost on a 500+ variation course (largest
  tested is 81).

- Show and grade (section 23): a REVIEW card answered with TWO KEYS and no move
  — the mode that makes a session studiable from a Bluetooth ring, and the seam
  for blindfold practice (23b: the browser's own speech engine, and a board with
  the pieces taken off). While it runs it OWNS Chessable's board and is the only
  writer of it. `cloShowGrade` is OPT-OUT (absent = ON; only an explicit `false`
  is stored, the `cloLineHeadsUp` shape) — nothing happens until the row's button
  or the `next` key starts it, so the preference only decides whether that is
  offered.
  **READ `DESIGN-show-and-grade.md` BEFORE CHANGING ANYTHING INSIDE THIS MODE.**
  The loop, the pacing and its measurements, the auto-play prefix, the
  alternatives fetch, the audio, §9 "what must never happen" and §12 "still to
  verify live" are all there. What follows is only what an edit ELSEWHERE can
  break.
  * NO WRONG-MOVE INJECTION, EVER — do not reintroduce it. A legal wrong move
    Chessable happens to ACCEPT would grade a failure as a PASS. Failure goes
    through Chessable's OWN "I don't know" (one footer button that MUTATES after
    the hint press, which by itself records nothing), producing
    `quizIncorrectAttempts: ["giveUp"]` — a THIRD literal beside `"timeUp"` and a
    real SAN, which the mistake log (16) already reads with no bridge of ours.
  * BRIDGES IT OWNS. `showGradeActive` — section 22 stands down on it, and so
    does the continuation module's own space-key listener, which matters because
    `start()` registers that one FIRST and it would otherwise swallow the key in
    capture phase before this mode saw it. `showGradeEnabled` — the PREFERENCE,
    not a running session, and it is what gates the same two keys inside the
    drill and the clickable-line quiz, neither of which grades Chessable at all.
  * BRIDGES IT CALLS, and what each must keep promising:
    `autoPlayShowGradeHold` — this mode's OWN hold flag (`ap.sgHeld`), NEVER
    `autoPlayHold`/`heldOff`. `processFrame` returns on `heldOff`, so routing it
    there means the tracker observes nothing all session: no move classified, no
    proof recorded, and this mode's own auto-play then consults an empty record
    for ever. THREE flags now, ORed in `held()` — never collapse them.
    `autoPlayIsProven(fen, uci)` and `autoPlayNoteProvenMove` — read and write of
    section 13's record; the FEN handed in is always the plan's exact `sourceFen`,
    never a reconstruction.
    `autoPlayIsHeld(fen)` — section 17's hold list, keyed placement+side like
    `holdKeys`. Without it a retry pass auto-plays the very move it is asking the
    user to retry, that move very often being proven from earlier in the session.
    `autoPlayBoardQuietMs()` — answers `Infinity` when it has no answer, and
    every caller MUST read that as "no reason to wait": it may only ever ADD a
    delay, never remove one.
    `continuationReviewNow` — SPACE is shared with the heads-up's "Review now",
    and the two DO overlap; resolved by PRIORITY (inside 'shown' the press means
    alternatives, everywhere else it goes here), never by assuming they cannot.
  * TWO PRESSES PER CARD, AND EVERY PRESS SHOWS A MOVE — the governing rule, and
    the one a "tidier" state machine breaks. The first press plays YOUR move on our
    board; the second shows the OPPONENT'S REPLY and is also what GRADES the card,
    so the grade rides on a press that was going to happen anyway. v0.69.0 had a
    THIRD press (grade, then reply) and that is the wasted press this replaced: DO
    NOT REINTRODUCE IT. "Wrong" pressed at the think stage costs no press of its
    own — the verdict is remembered (`sg.markedUnknown`) and applied by the press
    that advances.
  * `stop()` FAILS OPEN, TIMER FIRST, on every exit path. The mode PAUSES
    Chessable's per-move clock while the user thinks — a card that runs out
    records `["timeUp"]` and plays the move, so a move the user KNEW is graded
    wrong — and a session left paused with our board down is the worst thing this
    mode can leave behind.
  * IT DOES NOT RUN AHEAD OF CHESSABLE, and this will be proposed again. Every
    card is graded on Chessable, IN ORDER, gated on `cardReady()`. Running ahead
    means a queue of ungraded cards where one failed act mis-files every card
    behind it, and the replay would wait at the first unproven move anyway.
  * BLINDFOLD TAKES THE PIECES OFF, NOT THE BOARD — reading it the other way
    round is the trap: our board is what COVERS Chessable's, so not drawing it
    leaves their position on screen. `reconcile()` is the one place that setting
    changes anything.
  * It appends `.clo-sg` to the trainer row at `order: 2` (see the TRAINER ROW
    rules above; green outline idle, `.clo-rowprimary` while running, and a
    fourth collapsed-mid-quiz exception at (0,4,0)).

## Verification (no automated tests)

```
node --check content/lichessable.js
node --check content/pagestate.js
node --check background.js
node --check options/options.js
node --check engine/engine.js
node --check engine/san.js
python3 -c "import json; json.load(open('manifest.json'))"
```

After ANY edit to CLAUDE.md, and after adding or removing a cross-module bridge:

```
py dev/check-contracts.py
```

It discovers every module-level bridge in `content/lichessable.js` (the
`let x = null;` idiom, assigned a function or object by the owning section's
init) and fails if one is not named in CLAUDE.md, or if CLAUDE.md still calls
something a bridge that no longer exists. That is the one property a
condensation must never lose: those names are how an edit in one section
reaches into another, and they are exactly what a reader of the always-loaded
file needs in order to know they should go and read a design doc.

`engine/san.js` is pure and requireable from node — spot-check SAN output
(castling, disambiguation, promotion, en passant, mate `#`) directly when
touching it.

UI/CSS changes are checkable WITHOUT a live session: open `dev/harness.html`
and measure. It loads the real stylesheet, so computed styles and element rects
there are the real thing — `getBoundingClientRect()` across a set of states is
how the status-line reflow (v0.57.0) was both diagnosed and confirmed fixed.
Prefer a measurement over an assertion; "looks fine" is not a result.
NOTE: browsers cache the stylesheet hard over `file://` — after editing
`lichessable.css`, bust it (`link.href = link.href.split('?')[0] + '?v=' +
Date.now()`) or the harness will keep showing the OLD CSS and every measurement
will be of the previous build. A plain reload is not enough.

What the harness CANNOT answer: anything that depends on Chessable's own DOM,
on trainer state, or on timing — placement/anchoring, the browse-state gates,
board adoption, and every JS behaviour change. Those still need a live session
and an extension reload.

A DRIVEN TAB REPORTS ITSELF `document.hidden` (the same fact section 18b's
heads-up gave up its hidden-tab guard over), and Chrome then clamps EVERY timer
in it to ~1 s. THE LICHESS PANEL THEREFORE NEVER FETCHES IN AN AUTOMATED TAB and
this looks exactly like a bug you have just introduced: the panel mounts, is
positioned correctly, `readFen()` returns a good FEN — and no "position:" line is
ever logged. The cause is a livelock between two clamped timers, not the panel:
the 500 ms poll (`CONFIG.review.pollMs`) calls `scheduleRefresh()`, whose 300 ms
debounce (`CONFIG.debounceMs`) is clamped to 1 s as well, so the next tick clears
it before it can fire, for ever. Diagnosed 2026-08-04 after it was mistaken twice
for a regression. It is harmless in a real, visible tab — and a hidden tab not
fetching is the behaviour you would want anyway — so DO NOT "fix" it. To see the
panel populate under automation, front the tab (a `navigate` call does) and read
back within the moment it is visible, or drive the position change and check the
DOM rather than waiting on the poll. Everything that does NOT go through this
debounce — the overlays, the launchers, the continuation module's own tick —
works normally in a hidden tab, which is why the analysis board could be verified
end to end while the panel behind it sat idle.

## Reloading the extension (READ THIS BEFORE TESTING)

Chrome caches content scripts. A page reload alone runs the OLD code — the
extension must be reloaded first. Full details and the two dead ends in
README, "Reloading the extension".

- **The lever that works from automation** (verified end to end 2026-07-26):
  dispatch `clo-dev-reload` as a DOM event on any Chessable tab
  (`document.dispatchEvent(new Event('clo-dev-reload'))`). The content script
  relays it to the worker, which calls `chrome.runtime.reload()`. Then reload
  the Chessable tab. Works through Claude in Chrome's `javascript_tool` — the
  event crosses from the page world into the content script's isolated world.
- **It only works if the LOADED build already has the relay.** If the loaded
  build predates it, or lichessable.js is broken enough not to run, only the
  user can fix it from `chrome://extensions`.
- **Always verify, never assume.** The content script logs `[CLO] v<version>`
  on startup and the options page shows the loaded version; both read the
  loaded manifest, so an unchanged version means the reload did NOT happen.
  Bump `manifest.json` first and that check is unambiguous.
- **`chrome://extensions` is NOT scriptable** and an options-page reload hook
  never fires (background tabs are never loaded). Both verified 2026-07-26 —
  do not retry them.

**If a reload is needed and you cannot do it yourself, say so LOUDLY.** End the
turn with a line of exactly this form, on its own, as the last thing in the
message — never buried in a paragraph:

> ⚠️ **EXTENSION RELOAD REQUIRED** — click ↻ on the LiChessable card in
> `chrome://extensions`, then reload the Chessable tab.

Do the same whenever a change cannot be verified without the user. Never report
a change as working when it has only been syntax-checked.

Manual test loop: reload the extension (see above), then reload the Chessable
tab. Logs appear in the mt1 IFRAME's console context — filter the console for
`[CLO]`.

## Never

- Ask for, log, or store the actual `lip_` token value anywhere in the repo.
- Add permissions, hosts, or libraries without explicit discussion.
- Fix Chessable-markup breakage anywhere except `SELECTORS`.
