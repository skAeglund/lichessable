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
Bluetooth ring, and the groundwork for blindfold practice with TTS.
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
  (section 16) in ONE read; the mistake-log fields are all optional, so a plan
  that stops carrying them must still yield a usable line. Keep it free of
  `chrome.*` — a MAIN-world content script has no extension APIs.
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
- `DESIGN-ui-inventory.md` — every control by host and state, what competes with
  what, the agreed visual hierarchy, and the remaining change list. Read it
  before adding a control to the overstudy row or picking a colour for one; §3
  is the ruling on which tier a new button belongs to.
- `README.md` — living documentation; update it alongside functional changes.

## Hard constraints

- Plain JS/HTML/CSS only. No bundler, no npm, no frameworks, no remote code.
- Every Chessable selector lives ONLY in the `SELECTORS` object at the top of
  `content/lichessable.js`; Lichess API settings ONLY in `CONFIG.lichess`.
  Chessable's markup is fragile third-party internals — never scatter
  selectors through the code.
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
- Quick-edit (section 12 in lichessable.js): hovering a mainline move
  shows a body-mounted pencil (singleton, NOT inserted into Chessable's move
  list) whose popup has FOUR TABS: append a PGN comment to the variation
  (mode 'save'), EDIT that comment as a whole (mode 'edit', v0.39.0 — see the
  own paragraph below), edit the move's ARROWS (mode 'shapes', v0.52.0 —
  section 12b below), or add ALTERNATIVE MOVES the trainer should also accept
  (mode 'alt'; a LIST, added in one visit — see below). TWO host pages,
  behind a `HOSTS` adapter in `initQuickEditUi`; they differ ONLY in move
  lookup, ply mapping, oid source and rights signal — popup, save round-trip and
  the entire edit-page driver are shared:
  (a) review browse state (`commentMove` spans; ply = index in that list; rights
  probed lazily on popup open), and (b) the standalone variation page `/variation/<oid>/`
  (top document, no mt1 iframe, wholly different markup:
  `#theOpeningMoves > span > .whiteMove|.blackMove`, where the move div's id IS
  the 0-based ply index and its class is the colour, so NO move-number parsing
  happens there; oid from the URL; rights = presence of the "Edit Variation"
  link, which Chessable renders only for editable courses, so no probe tab is
  opened). BOTH hosts draw a piece move's letter as an SVG FIGURINE child
  (span `data-piece="knight"` …) — `textContent` of "♘c6" is just "c6", so
  SAN must come from `quickEditSanFromEl` (letter re-attached after the
  number prefix is stripped), never from bare textContent. Verified live that both hosts' ply indices map 1:1 onto the edit
  page's `#interactivePGN` order. There is NO JSON API — several of Chessable's edit-form POST fields
  are session/CSRF-bound and opaque — so the ONLY safe path is to DRIVE
  Chessable's own edit page: `background.js` opens `/explore/edit/<oid>/` in a
  SMALL FOCUSED POPUP WINDOW (`chrome.windows.create focused:true`, ~260×180,
  placed right BESIDE the quick-edit popup — the requester computes screen
  bounds in `driverWindowBounds()` and sends them as `msg.win`; bottom-right
  parking when absent). ALWAYS that popup, NEVER a background tab (v0.28.0
  removed the tab fallback: `openDriverWindow` just retries once without
  bounds) — a hidden tab clamps every timer, ours AND Chessable's
  boot/animations/dialogs, to ~1 s, which stretched a save from ~4-5 s to
  ~13-20 s, i.e. right into the worker's job timeout; focused:false was tried
  and saved NOTHING: the window opens occluded behind a maximized browser and
  is throttled the same.
  The popup's TOP document covers itself with an opaque "Saving…" shield
  (`maybeMountQuickEditShield`, worker msg `clo-quick-edit-is-driver`) that
  also swallows all keystrokes in capture phase — the window has real focus,
  so typing would otherwise reach the edit page's own shortcuts. The driver
  in that tab's mt1 edit iframe (`IS_EDIT_PAGE`)
  clicks the target move by POSITION (the Nth `#interactivePGN div[id]`),
  appends to `#moveComment` (React-controlled: native value setter + dispatched
  `input` event, NOT a bare `.value =`), sets `#specificAltMove` ("For This
  Variation Only"), clicks `#submitButton`, and MUST also click the SweetAlert2
  confirm (`.swal2-confirm`) — `addVariation()` only serialises + POSTs the
  whole variation after that dialog is confirmed.
  BOTH modes gate on `quickEditWaitBoardReady` FIRST (`#inputFEN` parseable and
  unchanged for `boardStableMs`) and then VERIFY the move click landed (side to
  move = opponent of the move's colour). The comment flow used to skip both and
  submit ~150 ms after `#interactivePGN` merely existed — that was the
  "popup spins until timeout" bug (v0.28.0): on a half-booted page
  `addVariation()` throws inside Chessable's own confirm handler and POSTs
  NOTHING, so there is no navigation, no dialog and nothing for the driver to
  report; the same unlanded click also let a comment be appended to whatever
  move happened to be selected. After the confirm click the driver keeps a
  `postSubmitTimeoutMs` watch (a successful POST navigates it away mid-await,
  so that code only ever runs on the stall path) and reports the stall — or a
  late dialog's text — itself. The worker never re-hands a job in phase
  'submitted': a failed POST reloads the edit page, and a second drive would
  append the same comment TWICE. CRUCIAL: match the move by its
  0-based ply INDEX in the move list, NOT by absolute number — the edit page
  renumbers every variation from move 1 (a tactics puzzle shown as "25. Qc2!" in
  review is `Qc2_w_1` on the edit page), while review keeps the source game's
  numbering. The review `commentMove` list and `#interactivePGN` are the same
  mainline in the same order, so index N ↔ index N; the driver still verifies
  SAN+colour against the element id (`{san}_{w|b}_{n}`; ids KEEP `+`/`#` but
  STRIP eval glyphs, hence `quickEditSan`). Colour comes from `turnFromLine`.
  Success is detected when the POST lands the iframe on
  `/mt1/explore/?edit=<oid>` (query form; a failed reload returns to the path
  form). Message hub in background.js (`clo-quick-edit-run`/`-claim`/
  `-submitting`/`-landing`/`-result`), one job at a time, job in
  `chrome.storage.session`, 25 s hard timeout, popup window closed on finish
  (removing its only tab closes the window). Edit
  rights are per-COURSE and TRI-STATE (`host.rights()`: true/false/null-unknown),
  probed LAZILY: the pencil shows while rights are unknown, and the probe tab
  only opens from `applyRightsToPopup()` when a popup opens on an unprobed
  course — Save stays disabled until the probe confirms `canEdit` (result
  cached per `bid` per session; only an `ok:true` probe is cached, so a
  timeout retries on the next popup). A known-uneditable course hides the
  pencil. NOTHING about a probe may fail silently (v0.28.1): `probeRights`
  RETURNS false when it cannot start one (unreadable bid/oid), and a probe
  whose result never arrives is settled locally by a `probeTimeoutMs`
  watchdog — otherwise the bid stays in `qe.probing` and BOTH popups (they
  share this cache) sit on "Checking edit rights…" for the rest of the
  session with no retry. The alt-check hears about a watchdog give-up through
  the `altCheckProbeSettled` bridge, since its own knowledge of probes comes
  only from `clo-quick-edit-result` messages. On the worker side
  `getQuickEditJob` reaps a job older than twice the cap and re-arms the
  timeout when it has none: `quickEditTimer` does not survive a worker
  idle-restart, and an orphaned job refused every later quick-edit with
  "another quick-edit is in progress" for the whole browser session. Append convention
  (`CONFIG.quickEdit.commentJoin`) and the exact stored wrapper (`( { … } )`)
  are the one thing to confirm in a manual save test.
  EDIT MODE (v0.39.0) is TWO visits to the edit page, and that is not an
  implementation detail waiting to be optimised away. The comment as RENDERED
  in the review column is not the text Chessable stores — clickable lines are
  figurine spans, prose is markup — so filling the editor from the DOM and
  saving it back would rewrite the stored comment from a RECONSTRUCTION,
  destroying exactly the clickable lines section 18 quizzes. Never prefill that
  box from the DOM or from the lesson plan's parsed `comment` JSON. So opening
  the Edit tab runs a READ job (`mode:'load'`): the same driver window, the same
  `quickEditSelectMove` gate (board ready + move click + side-to-move
  verification, extracted from the comment driver and now shared by read and
  write), but it reports `#moveComment`'s raw value and submits NOTHING. The
  save (`mode:'edit'`) carries the new text AND `baseText` — the text the editor
  was filled from — and `driveQuickEditComment` REFUSES to write when the stored
  comment no longer matches it (compared through `quickEditNormalizeText`: line
  endings and trailing blanks survive neither React nor a form POST intact).
  Read and write are separate visits, and silently clobbering a comment that
  moved in between is the one failure of this feature that loses the user's
  work. Reads are cached in `qe.comments` per `"<oid>#<plyIndex>"` and DROPPED
  on any successful save to that ply (never updated to the text we sent —
  Chessable is what decides what got stored). The result relay carries
  `plyIndex` for exactly this keying. A 'load' also answers the RIGHTS question
  on its way past (no edit form ⇒ `canEdit:false`, reported as a successful read
  rather than as an error, so the shared cache still learns it), which is why
  the Edit tab never starts a probe of its own — the worker runs ONE job at a
  time, so a probe fired beside a read would be refused and read as a rights
  failure. `applyRightsToPopup` therefore hands over to `syncEditUi` in edit
  mode, and suppresses its own probe on the other tabs while a read is in
  flight. An empty edit DELETES the comment, so Save arms first
  ("Delete comment", auto-play's Clear pattern). Only "Comments After" is
  reachable: a `comment_before` block is a different field on the edit form and
  is NOT editable this way.
  ARROWS MODE (section 12b, `mode:'shapes'`, v0.52.0; ground truth in
  DESIGN-quick-edit-arrows.md, verified end to end 2026-08-01 on both hosts):
  arrows and circles are a PER-MOVE FIELD of the variation, beside the comment —
  `allTheMoves['<san>_<w|b>_<n>'].drawing`, entries
  `{object:'arrow'|'circle', start, end, color:'g'|'r'|'b'|'y', move:'4b',
  index:'arrow_d4b3'}`. NOT in the comment text, NOT a PGN `[%cal]`. THE SAVE
  NEEDED NO NEW MECHANISM: `addVariation()` posts `JSON.stringify(allTheMoves)`
  as `#commentsToSubmit`, so the comment driver's own submit already carries
  every move's shapes — which is also why quick-edit has never damaged a
  variation's arrows. The `index` IS the identity: same squares in a new colour
  REPLACES, same colour is a NO-OP on Chessable's board (not a toggle; ours
  toggles, which is the nicer rule and cannot disagree since we replace the set
  as a whole).
  READ = the same `mode:'load'` visit the Edit tab already makes (one trip
  answers both tabs AND the rights question; a second window for the arrows
  would be pure cost — hence `qe.reads` holding `{text, shapes}` and
  `readingMode()` covering both tabs). Taken off the edit page's drawing layer:
  `SELECTORS.editDrawings`, class `arrow_d4b3`/`circle_b4` + the `stroke` hex.
  `getAttribute('class')`, never `.className` — on an SVG element that is an
  SVGAnimatedString.
  WRITE = Chessable's own gestures, delegated from `#board` onto
  `.square-55d63`: right-button mousedown→mousemove→mouseup adds a shape (same
  square = circle), MIDDLE click clears every shape on the move, LEFT click
  undoes the last. Colour from the modifier on those same events: shift g,
  ctrl r, alt y, none b. Plain synthetic MouseEvents on the SQUARE element
  drive all of it.
  `quickEditPrimeShapes` exists for a quirk of THEIR code: mousedown draws a
  preview CIRCLE on the source square, and the branch taken on the FIRST arrow
  of a document's life is `null == n ? l.add(line) : (l.clear(), l.add(line))`
  — so that preview survives and the commit moves it into the drawing layer as
  a `circle_<from>` that is in the SVG but NOT in turnArray. One throwaway
  arrow before the clear puts the layer in the state every later shape assumes.
  Without it the verification below fails on every first save.
  The write is VERIFIED against the board before anything is submitted
  (`sameShapes(after, want)`): a course with `can_add_arrows` false would
  otherwise swallow every press and save an EMPTY set over the user's
  annotations without a word. `baseShapes` is the comment flow's staleness
  guard, for the same reason it has one.
  DRAWING HAPPENS ON OUR OWN BOARD, inside the popup — Chessable's drawing code
  exists ONLY in the mt1 edit page; `/variation/` and the trainer board are a
  different React renderer that only PAINTS `svg#drawings` (children carrying
  `data-start`/`data-end`/`data-color`, indices 0-based FROM a8), with no input
  path and no flag to flip. That board is section 11c's, shared with the
  continuation overlay — geometry, cloned piece SVGs and shape drawing are
  written once. Its POSITION is the one AFTER the move: `reviewPlan.fens[ply+1]`
  where the lesson plan has it (exact and free), else `pressAndReadFen` presses
  the move (navigating the host board, the click the user would make) and reads
  `readFen()` back, verified by side to move.
  A READ QUEUES BEHIND A RIGHTS PROBE rather than racing it (`state 'waiting'`):
  the popup opens on a non-reading tab, which is what STARTS the probe, and the
  worker runs one job at a time — so a read fired beside it was refused, and the
  refusal carried no `plyIndex`, so it matched no key and the tab sat on
  "Reading…" for ever. Both halves fixed (the worker now echoes `plyIndex` on a
  refusal); `onResult`'s probe branch and the probe watchdog both release a
  waiting read.
  REFRESHING THE HOST AFTER A SAVE (section 12c, v0.53.x): our write goes to
  the SERVER, not to the copy Chessable is rendering from, so both hosts keep
  showing the old comment and the old arrows until they re-read.
  * The VARIATION PAGE can be made to re-read IN PLACE, and is
    (`host.refresh` → `refreshVariationPage`). It fetches its whole chapter
    ONCE at load (`getOpeningsForBookLevelInCorrectOrder`) and never again while
    you navigate moves — only `getCommentsByFEN` per position — but its own
    variation PAGER (`#variation-btn-next-variation` / `-prev-`, stable ids, so
    no language-dependent text matching) is a real router navigation that
    refetches `getGame` + the chapter. Step to a sibling, then `history.back()`.
    Ground-truthed 2026-08-01 that `performance.getEntriesByType('navigation')
    .length` stays at 1 throughout: no document reload, so nothing of ours is
    torn down either. A chapter of one has both buttons disabled —
    `refreshVariationPage` returns false and the popup says "reload the page to
    see it" rather than implying the page is current.
    COMING BACK IS THE WHOLE RISK OF THIS FEATURE, and v0.60.1 rewrote it after
    saves were reported to sometimes leave the user on a completely different
    variation. Once the pager is clicked we are COMMITTED to a navigation, and
    the original code returned false on every unhappy path — leaving the user
    standing on the SIBLING while the popup said "Saved — reload the page to see
    it", i.e. reading a stranger's variation and being told it was theirs. So:
    - `refreshVariationPage` is a try/**finally**, and the finally is the one
      unconditional step: if the page is on a sibling variation and the routes
      home have not already been walked, it walks them. Every timeout and every
      throw passes through it. FALSE NOW MEANS "not refreshed", NEVER "not where
      you were".
    - THE URL FLIP IS NOT THE LANDING (v0.62.1, and the last way this stranded
      people). The router calls `pushState` SYNCHRONOUSLY on the click and only
      then fetches what it navigated for, so `siblingVariation(oid)` goes true
      within a millisecond or two — and the old code went straight home on it.
      Measured live 2026-08-03: pushState at t+0, our `history.back()` at
      t+158 ms, the sibling's `/api/v1/getGame` finishing at t+792 ms — i.e. we
      reliably stepped back off a route that had not resolved yet, leaving it to
      commit AFTERWARDS with our one repair already spent and the `homeTried`
      exemption below stopping the finally from making another. It is also what
      the round trip EXISTS for: that fetch is the chapter re-read. So
      `watchVariationFetch()` (a PerformanceObserver on 'resource', armed BEFORE
      the click — `window.fetch` belongs to the page world and an isolated
      content script cannot patch it, but the performance timeline is shared and
      an entry means the response is COMPLETE) gates the step back on
      `refreshGameApi` landing, capped at `refreshSettleMs` for a sibling served
      from cache, plus `refreshLandMs` for the router to commit. Same wait on the
      late-departure path, which owns the observer once it takes over the guard.
      After the fix: flip at t+0, sibling `getGame` at t+792 ms, home at
      t+2.1 s, our own `getGame` at t+2.6 s.
    - the departure test is `siblingVariation(oid)` — a DIFFERENT VARIATION page
      — never `!onVariation(oid)`. A pager click can land nowhere else, so any
      other route is one the USER took while we waited (a link, their own Back),
      and firing `history.back()` on top of that dragged them out of wherever
      they had just gone. That was the second way to end up somewhere else.
    - `returnToVariation` has THREE routes, cheapest first. (1) `history.back()`
      — but ONLY when the click really pushed, tested with `history.length`
      before/after: on a router that REPLACED instead, back() takes the user a
      step further away rather than home. (`history.length` saturates at 50 in
      Chrome, where a push stops growing it; that reads as "replaced" and simply
      takes route 2, which works either way.) (2) The OPPOSITE pager button.
      CLAUDE.md used to reject it outright because it is disabled at the ends of
      a chapter — true in general, and irrelevant here: on the sibling we just
      stepped to, our own variation is on the other side of that button, so it
      is always enabled. (3) `location.assign` back to the URL we started on. It
      costs a document load, and so the popup — but the user lands on their own
      variation with the save showing, which beats every alternative left.
    - a click that misses `refreshLeaveMs` has NOT been cancelled — a slow
      chapter fetch just lands later, by which time the function, its finally
      and the popup's status line have all settled. That is the plainest way
      this used to strand the user, and the finally cannot see it. So
      `watchLateDeparture` outlives the refresh (`refreshLateMs`, 10 s) and is
      deliberately NOT awaited: the popup has already been told, truthfully,
      that the refresh did not happen, and "do not leave them on someone else's
      variation" has no business holding that status line open.
    - `qe.refreshBusy` makes it non-reentrant: two round trips would each step
      the pager and each undo one entry, which does not compose. The late watch
      KEEPS that flag (the refresh's own finally skips clearing it when
      `watching`) and clears it when it settles.
    - `refreshHomeMs` (5 s) is per ROUTE, deliberately short — a URL flip, not a
      render. Three `refreshBackMs`-length waits in a row would leave the user
      on a stranger's variation for the best part of a minute.
    RESTORING THE SHOWN MOVE is the whole difficulty, and both halves are
    load-bearing. Being back on the URL is NOT being back on the page: React
    keeps the sibling's move list mounted for ~1 s while the refetch lands and
    REUSES the very nodes (verified — element identity is no signal at all), so
    a press issued then lands on the outgoing render and the page's own
    navigation to move 1 silently undoes it, while our verify saw it succeed.
    Hence (a) the wait for a composite the sibling cannot satisfy — our path,
    our move COUNT, and a `variationMoveShown` marker, which only appears once
    the fresh variation has rendered and navigated to its own first move — and
    (b) `restoreShownMove`, which presses, confirms, and then requires the move
    to STILL be shown `refreshHoldMs` later, retrying otherwise.
  * The TRAINER cannot, and `HOSTS.review.refresh` is null. It re-reads a
    variation only by fetching `/api/v1/getLesson`, which happens when you
    SWITCH variation — and switching back re-QUIZZES it, i.e. costs the browse
    state the pencil lives in. The alternatives are worse: the comment column
    and `svg#drawings` render from the lesson plan in page state, so updating
    them in place would need a MAIN-world write (pagestate.js is read-only by
    design) or our nodes inside Chessable's DOM (which React would wipe). So the
    status line says it instead: "Saved. Chessable shows it next time you open
    this variation."
  The popup stays in its SAVING ui through a refresh (`qe.refreshing`): the
  loaded copy is stale by then (the read was dropped), so a second Save would
  write it back and be refused by the driver's own staleness guard. `tick` skips
  its not-ready close while that flag is set — the sibling's render passes
  through a moment with no move list — and `closePopup` clears it, since Escape
  can close the popup mid-refresh and a stuck flag would stop tick closing it
  ever again.
  Touch has no hover, so after a TAP on a move (`pointerout` with
  `pointerType 'touch'`) the pencil lingers `touchPencilMs` (~4 s) instead of
  the 200 ms mouse hide — tap move (which also navigates the board there),
  then tap the lingering pencil. Any scroll hides the pencil immediately
  (it is fixed-positioned from the move's rect at show time and would float
  over the wrong move).
  The popup MUST swallow `keydown`/`keypress`/`keyup` (bubble phase,
  `stopPropagation`) — MoveTrainer2 binds single-key shortcuts ("n" = next
  variation, space, …) on `document` and does NOT skip them while a text field
  has focus, so without this, typing a comment drives the trainer. Bubble phase
  is enough (verified live); the default action still inserts the character, and
  Escape closes the popup.
  ALT-MOVE mode (`driveQuickEditAltMoves`; ground-truthed live 2026-07-22):
  Chessable stores alternatives per move as `alt_white`/`alt_black` SAN arrays
  (plus parallel `specific_alt_*` booleans) in its page-state `allTheMoves`,
  keyed by the SAME `{san}_{w|b}_{n}` ids as `#interactivePGN` — but the driver
  never touches page state; it drives the UI: click the target move, click the
  `Add New Alternative Move` link (`SELECTORS.editAltAddLink`), confirm the
  SweetAlert ("The next move you make on the board will be added as an
  alternative") — the edit board then steps BACK one move (its `#inputFEN`
  changes; that FEN is what the typed SAN is resolved against with CloSan,
  `quickEditResolveSan`) — set `#specificAltMove` BEFORE the move (pushAltMove
  reads it at store time), then PLAY the alternative with the ordinary
  `pressSquare` click recipe (the edit board has the standard `square-55d63` /
  `e4-<uuid>` markup, so `SELECTORS.boardSquare` matches). Chessable validates
  everything itself — board legality, duplicate, same-as-mainline — and lists
  the move in `#altMoves` (`quickEditAltListed` = the isolated-world success
  check; on timeout the open dialog's text is relayed as the error). An alt
  already listed on arrival short-circuits to success (it was saved before) —
  but that list RENDERS A BEAT AFTER the board reaches the move, so it is waited
  for once per job (`quickEditAwaitAltList`, capped at `altListRenderMs`) before
  anything is read from it. An empty `#altMoves` means both "no alternatives"
  and "not rendered yet" and nothing distinguishes them, so a move with none
  pays the cap; reading it too early offers the move to Chessable again and gets
  "It's there already", which for a LIST fails every move in it (observed live
  2026-08-03).
  SEVERAL ALTERNATIVES AT ONCE (v0.62.0): the wire field is `altSans`, a LIST
  ("Nc6, d5, a6" in the popup, split on whitespace/commas; a bare move number
  token is dropped so a pasted "3. Nc6" works), and the driver adds them in ONE
  visit under ONE submit — the form POSTs the whole variation, so the second
  alternative costs another arm-and-play round and nothing more.
  `driveQuickEditAltMoves` owns the board-ready gate, the ONE move selection and
  the loop; `addOneQuickEditAltMove` is the unchanged per-move flow. THE ONE NEW
  FACT: Chessable's flow leaves the board on the ALTERNATIVE'S OWN POSITION, so
  every round after the first re-clicks the mainline move and requires the
  BYTE-IDENTICAL `fenBefore` back — side to move cannot tell the two apart, both
  being the opponent's. Nothing is written until the submit, so a refusal
  halfway through leaves the variation untouched, and the error says so ("…
  — none of the alternatives were saved"). The worker's blind cap grows with the
  list (`quickEditJobCap`, +8 s per extra move): force-failing a job whose
  driver is still working, and closing its window, is the one thing that cap
  must never do. `altSan` (singular) survives ONLY as `quickEditAltSans`'
  fallback, for a job already in `storage.session` when the extension reloads;
  the alt check (section 15) sends `altSans: [san]` like everything else.
  Dialog waits go through `quickEditOpenConfirm` (scoped to
  `.swal2-container.swal2-shown`) because several SweetAlerts open and close in
  one alt job — a stale hidden confirm button must never be clicked; submit and
  landing detection are then the comment flow's unchanged. ALL waits are
  `quickEditWaitUntil`, which is MutationObserver-driven with the interval as
  backstop: a hidden tab clamps setInterval/setTimeout to ~1 s, so a chain of
  polled waits cost 15-20 s there (vs 4-5 s focused) until the waits were made
  observer-based — never add a plain fixed delay to this driver. Promotion
  alternatives are REFUSED in popup and driver (edit-board picker unverified).
  The alt tab is DISABLED on opponent moves (always a misclick — the trainer
  plays those itself): the user's colour is the board's bottom side
  (`host.userColor()`, via `boardBottomColor`; Chessable orients both hosts'
  boards to the course colour), permissive while the board is mid-render with
  a re-check in doSave.
  While the popup's alt tab is open, clicking a Lichess panel move row
  prefills the SAN input (both hosts are review documents, where rows carry no
  `dataset.uci`, so nothing competes).
  `readQuickEditBid`/`readQuickEditOid` parse trainer URLs through the ONE
  module-level `TRAINER_URL_RE` (`/(practice|learn)/<bid>[/<oid>][/<lid>]` —
  everything after the course id OPTIONAL), so rights probing and the
  alt-check (section 15) work in learn sessions and overstudy tabs alike.
  They used to carry a private, stricter pair of regexes whose /learn/ form
  demanded a variation id the live session URL does not always have: the bid
  read as null, `probeRights` refused to start, and both popups hung on
  "Checking edit rights…" (v0.28.2). Never re-duplicate that regex. `initQuickEditUi` exports `quickEditApi = { rightsFor(bid),
  probe(bid, oid, win) }` (module-level variable) — the alt check shares the
  per-course rights cache and the lazy probe through it; the cache itself
  stays in the qe closure, and probe results reach quick-edit's
  `clo-quick-edit-result` listener FIRST (registration order: initQuickEditUi
  runs before initAltCheck in start()), so the cache is warm when the
  alt-check's own listener reads it. `driverWindowBounds` is now a thin
  wrapper over the hoisted `popupDriverBounds(anchorEl)`, shared with the
  alt-check popup.
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
  FIVE modules append to `.clo-review`
  — section 9 (overstudy), 13 (auto-play), 16/17 (mistakes/retry), 18-20
  (continuation/analysis/drill), 22 (type a move) — and each one used to pick its
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
- Auto-play (section 13; design + live ground-truthing in DESIGN-autoplay.md):
  records every move the user answers correctly during a review session and
  replays it when a later variation (or transposition) reaches the same
  position, handing back at the first unproven move. Keyed on POSITION
  (placement + side + castling, en passant dropped), per course, in
  `chrome.storage.session` with a 12 h TTL — deliberately never
  `storage.local`, or stale proofs would auto-pass genuinely-due cards.
  A POSITION HOLDS A SET OF PROVEN MOVES, not one (`{moves: {<uci>: {uci,
  promo, seenAt, count}}}`, v0.55.0): a course regularly answers one position
  two ways — two variations branching at ply 4, 2...Nc6 in one and 2...Qb6 in
  another — and both are right, each in its own line. `confirmPendingRecord`
  therefore MERGES a proof in beside the others; replacing was what made
  proving the second cost the user the first. `pruneRecordEntry` is the single
  door into `ap.record` (load, cross-course save prune) so everything else may
  assume `entry.moves`, and it doubles as the upgrade path for pre-v0.55
  single-move entries, which outlive their build in `storage.session` — an
  extension reload mid-session must not cost the user their proofs. An OLD
  build reading a new entry finds no `uci` and degrades to manual play, never
  to a wrong move.
  background.js calls `chrome.storage.session.setAccessLevel` at startup so
  the content script can read that area (content sends `clo-ping` first to
  guarantee the worker has run). The tracker does NOT use `readReviewFen`:
  a MutationObserver on the board (rAF-coalesced) yields placement snapshots,
  and the unique CloSan legal move producing the new placement advances an
  authoritative position object (real castling rights; ply count = oracle
  index; user colour = board orientation; mid-animation frames fail the
  one-king-per-side check exactly like readReviewFen). Classification is
  colour + provenance: opponent colour ⇒ trainer's; ours ⇒ matches
  `vs.injected`; user colour + recent TRUSTED pointer input on the board ⇒
  genuine answer (recorded when the opponent replies or the variation
  completes, vetoed if `trainerMoveNote` reads Incorrect/Time's up); user
  colour with no pointer input ⇒ trainer-played (solution replay, Key-Moves
  prefix) and never recorded. THE LINE CHOOSES THE MOVE, THE RECORD ONLY
  PROVES IT (v0.55.0, was the other way round): `evaluateAutoPlay` locates the
  position in the LINE ORACLE — MoveTrainer2's own `lessonPlan`, read out of
  page state by `content/pagestate.js` (see below) — resolves the mainline's
  SAN there to a uci through `sanToUci` ON THE PLAN'S OWN POSITION (exact
  castling and en passant), and injects only if THAT move is in the position's
  proven set. Asking it this way round is the whole of the multi-answer
  support: neither branch of a shared position can disable the other, because
  the move played comes from the variation being played and never from a
  record that has no idea which line it is in. So there is nothing to memoise
  as "conflicted" any more — that flag and its `⚠ line differs here` chip are
  GONE, and an unproven line move is an ordinary hand-back, retried the next
  time a variation passes through, rather than a verdict for the session.
  Castling notation cannot bite: both sides are CloSan's own generator (the
  record's uci is a board diff resolved through it), so O-O is "e1g1" on both
  and never the explorer's "e1h1". A promoting line move is refused by
  LENGTH (`sanToUci` appends the piece, so it could never match a stored
  4-char uci anyway) with its own message rather than reading as unproven.
  Any other uncertainty (plan unreadable, promotion recorded — trainer picker
  markup UNVERIFIED, drag not accepted within 2.5 s, ply untrusted after
  losing track) also degrades to manual, never a blind move. Injection CLICKS the move — `pressSquare` on
  the source then the target, the explore panel's recipe unchanged, both
  presses in the SAME task (an older note here claimed click-click does not
  work on the trainer board; it does, on quiet moves and captures alike, and
  a DRAG is what should be avoided). `pressSquare` picks its event flavour
  (mouse sequence vs. synthesised finger tap) from the human's own trusted
  `pointerType`, never from `navigator.maxTouchPoints` — a touchscreen laptop
  is touch-capable while being driven with a mouse, and tapping such a board
  left MoveTrainer2 with a stale selection, so the piece of the last injected
  move could not be picked up (v0.18.8 regression, fixed in v0.18.9).
  Both halves are load-bearing and were
  ground-truthed live: click-move is the path MoveTrainer2 ANIMATES — it
  tints both squares yellow and glides the piece with the same ~200 ms tween
  its own replies use, whereas mousedown-here/mouseup-there reads as a drag
  and redraws instantly (replays used to teleport). Same-task is what keeps
  the SELECTION invisible: the grey pickup tint and the legal-move dots come
  from React state and never get a frame to paint. Injection is
  delayed by the speed setting and by a settle floor whenever the
  trainer itself might still be auto-playing (variation start, Key-Moves
  prefix) so the two never race — but NOT merely because the opponent just
  replied, which is the ordinary variation-start case and needs no floor at
  all (`vs.trainerDrove` starts FALSE and means strictly "a user-colour move
  was trainer-played"; a `true` default used to cost 700 ms per variation).
  Variation changes are picked up by `syncVariation()`, called from the
  500 ms tick AND from every board frame, so a new variation is recognised
  as soon as the board resets rather than up to 500 ms later; it ignores a
  falsy oid so a mid-re-render blink cannot reset tracking.
  A trusted pointerdown on the board or a
  click on the status chip cancels the variation; `document.hidden` pauses
  everything. Once the user plays a move by hand in a variation
  (`vs.handedOver`), auto-play never resumes later in that SAME variation even
  if a transposition reaches a proven position again — jumping back in mid-line
  was reported as jarring; only a variation's opening run ever replays. UI = a
  cluster appended to the overstudy widget (toggle `cloAutoPlayEnabled` off by
  default, speed `cloAutoPlaySpeed`, a "Clear" button, status chip).
  THE STATUS CHIP IS NOT IN THAT CLUSTER (v0.57.0) — it is appended to the
  widget's own `.clo-review-status` line through `reviewStatusHost()`, and so is
  the retry pass's (section 17). Inline among the controls, every message
  re-laid-out the row: measured, swapping one auto-play message for another moved
  "Drill mistakes" 77px across and 32px DOWN, threw "Retry" 467px as the row
  re-wrapped, and changed the widget's height 75→107px — which moves the Lichess
  panel, the alt-check chip and the heads-up, since all three anchor below this
  widget. The line is `order: 99; flex: 0 0 100%`, so it sits after every cluster
  on a line of its own. `order`/`flex-basis` apply to flex ITEMS, i.e. direct
  children of `.clo-review`, which is why the two elements had to be RE-PARENTED
  rather than nudged with CSS where they sat. Its children carry an explicit
  `line-height` because the messages are emoji-prefixed (▶ ✋ 🧹 ⚠) and the
  differing ascents grew and shrank the line box by 2px per message, which the
  panel below followed. `reviewStatusHost()` creates the row on demand (a widget
  from an older build, or one re-mounted by a React re-render, grows it again
  rather than swallowing every message for the session) and each `ensureUi` drops
  a stale copy of ITS OWN status first — a cluster can be rebuilt without the
  widget being re-mounted, and the status no longer goes away with it.
  `clearRecord()` drops the CURRENT course's proofs from `ap.record` and from
  `storage.session` — it must cancel `ap.saveTimer` first, or the debounced
  `saveRecord` would write the old in-memory record straight back — and calls
  `stopReplaying()`, since a replay in flight was decided on what it just
  dropped. The button arms on the first click and disarms after `clearArmMs`:
  one misclick would otherwise cost a whole session's proofs. A re-mount of
  the cluster resets that armed state.
  Scope is BOTH trainer routes (`isTrainerPath()`: /practice/ and /learn/) —
  recording, injection and the widget cluster work identically in learn
  sessions and overstudy tabs; proofs are shared per course through
  `chrome.storage.session`, so a move proven in review auto-plays in an
  overstudy of the same line and vice versa (toggle-gated, off by default;
  `document.hidden` keeps a background overstudy tab inert). During the two
  presses `<html>` carries `clo-injecting`; its CSS is now only a BACKSTOP for
  the case where the trainer slips a render between them — the square tints
  (`highlight-legal-mt2`/`highlight-hover-mt2`, partly inline ⇒ `!important`)
  and the target markers, which are CHILD divs `legal-square-dot-mt2` /
  `legal-square-capture-mt2` and NOT a `::before` (an earlier `::before` rule
  matched nothing). That CSS must never touch `.piece-417db`: the element that
  ANIMATES any move, Chessable's own replies included, is a `.piece-417db`
  parked on `document.body` for the glide, so hiding it would break the very
  animation the injection borrows. A speed preset is a `{move, settle}` pair,
  both counted from the last board change: `move` is the ordinary pause before
  a replay (the same clock the trainer answers on — ~480 ms measured live) and
  `settle` replaces it whenever the trainer may still be auto-playing
  (variation setup, Key-Moves prefix, solution replay), so it is the wait at a
  variation's START. Keep `settle` above ~450 ms — that is how long one
  animated trainer move occupies the board. The rest of a replay's cycle is
  Chessable's and cannot be tuned: ~440 ms for our move to land, ~480 ms for
  the reply. `vs.lastMoveAt` — the origin of both clocks — is stamped in the
  MUTATION callback (`frameTime()`, from `ap.mutationAt`), not when
  processFrame gets to run, and `evaluateAutoPlay` subtracts the already
  elapsed time from BOTH waits (v0.30.1). Never re-anchor a wait on
  `Date.now()` at evaluation time: on a phone the mutation→rAF→timer chain runs
  100-300 ms late and every re-entry (injectMove's bail-out, the 500 ms poll
  catching a frame the observer path missed) then charged a whole extra `move`
  pause on top of the wait already served — that is what made some mobile
  replays a second slower than the rest. For the same reason a board mutation
  schedules a rAF AND a `frameFallbackMs` (32 ms) timer, first one through
  wins: rAF runs only while the document RENDERS, and in a hidden tab it never
  ran at all while the pending flag swallowed every later mutation. The oracle
  back-off (`oracleRetryMs`) also owns a real timer now — waiting for the next
  poll to notice it had expired cost up to 500 ms per retry, and a first read
  losing the race against the trainer's ~90 ms plan swap is routine on mobile.
  - LINE ORACLE = `content/pagestate.js`, the extension's ONLY MAIN-world
    content script. React fibers are page-world expandos, invisible to an
    isolated content script, so the plan cannot be read any other way. It is
    READ-only: no page state written, no page function called, nothing put on
    `window`. Protocol: isolated world dispatches `clo-ps-req` on `document`,
    gets one `clo-ps-res` back whose `detail` is a JSON STRING (live objects
    would not cross the world boundary); `readLessonLine()` wraps that with a
    timeout so every caller sees one shape. Search is by SHAPE — a context
    object owning an array `lessonPlan` — because component names in the
    bundle are minified; the PROPERTY names (`lessonPlan`, `san`, `sourceFen`,
    `color`, `variationId`) come from Chessable's API payload and are not.
    Ground-truthed live: the plan holds per ply `san`/`from`/`to`/`sourceFen`/
    `targetFen`, swaps to the next variation ~90 ms BEFORE its first move
    animates, and a whole variation runs with ZERO network requests. So
    `requestOracle()` needs no fetch, no cache, no prefetch and no simulation:
    `vs.oracleSim[i].pos` is `CloSan.parseFen(plan[i].sourceFen)` — exact
    castling and en passant, tactics lines starting mid-game included. It
    still aligns by POSITION, not ply index, so transpositions and a late
    tracker anchor both work. A read for the WRONG oid (trainer mid-swap) or
    an unusable plan retries `oracleMaxTries` times behind `oracleRetryMs`,
    then the variation goes manual.
  - An injected move is normally closed out by OBSERVING it (`kind:'injected'`),
    but that is not the only evidence it landed, and treating it as such caused
    false "injected move did not land" handbacks on real courses. The tracker
    can lose the thread across an injection — the trainer bursting several plies
    (Key-Moves prefix, a variation that starts mid-line) re-anchors us and
    `startTracking()` clears the history our own move would have matched
    against — so no 'injected' frame is ever attributed even though the drag
    worked. The verify timer therefore asks the BOARD: it stores
    `vs.injected.beforeKey` (the placement the drag was meant to change) and
    only hands back when the placement is still IDENTICAL to it. A changed (or
    unreadable) board means the move went through untracked: clear
    `vs.injected`, no `manualHold`, re-enter `evaluateAutoPlay()`. Keeping the
    still-identical case strict is what stops a refused drag from looping.
  - THE LINE-ENDING MOVE NEEDS ITS OWN READ (`observeFinalFrame`, v0.53.3).
    `processFrame` bails on `reviewBrowseReady()` — browse navigation is not
    play — but the frame carrying a variation's LAST move arrives with the
    completion block already rendered (MoveTrainer2 answers that move and
    completes the lesson in one state transition; our mutation callback runs
    after that commit), so the move was never observed, never became a
    `pendingRecord`, and `confirmPendingRecord('variation completed')` — which
    exists for exactly this move, since no opponent reply follows it — had
    nothing to confirm. The last move of a line therefore never earned a proof.
    Invisible until a session plays the same line TWICE, which is what a retry
    pass does: auto-play replayed the whole variation and then handed back on
    its very last move, every time. So `tick`'s browse branch takes one board
    read before suspending. Observation only — no `evaluateAutoPlay` (the
    tracker is suspended on the next line) and no wrong-guess capture (the
    variation is over) — and a frame that is not exactly one legal move on is
    left alone, since the browse board may already have been navigated.
  - `noteDeadContext(err)`: after an extension reload, every `chrome.*` call in
    the still-running content script throws "Extension context invalidated".
    Such an orphan holds a record it can neither refresh nor save and could
    still drive drags off it, so the module STANDS DOWN on the first such error
    (auto-play off, observer disconnected, poll cleared, `ap.contextDead` gates
    `tick`/`processFrame`/`evaluateAutoPlay`) and logs one line telling the user
    to reload the page. Reloading the extension alone never revives a tab.
  - `logHandback(reason)` prints one console line per (position, reason) pair
    whenever auto-play declines to replay — no-record, the line's move not
    proven yet (named in the message: "the line plays Qb6 here"), expired,
    promotion, oracle failed/pending, ply not found in the line,
    unresolvable SAN — since a silent no-op is otherwise indistinguishable
    from a bug. Debug-only DOM hook: dispatching a `clo-debug` event on `document`
    dumps a summary (record/cache key counts, no move data) onto
    `documentElement[data-clo-session]` — storage areas aren't otherwise
    visible from the page.
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
- Mistake log (section 16) + retry runner (section 17); design and ground truth
  in DESIGN-retry-mistakes.md. The log's source is MoveTrainer2's OWN per-ply
  `progress` in the lesson plan (`quizIncorrectAttempts` = the refused SAN, or
  the literal `"timeUp"`, once per failed attempt) — NOT the DOM, NOT a hooked
  `fetch` (`saveProgressAndReturnNewProgressInfo` carries the same data, and
  pagestate.js is read-only by design). Sampled ~1/s in trainer sessions,
  keyed on the trainer's `mid` (= difficult-moves' `moveId`), stored in
  `chrome.storage.session.cloMistakeLog` per course with the auto-play
  record's 12 h TTL — session area only, or a stale list would drill another
  day's moves. Counters are PER-LESSON, so growth is measured against what
  THIS document already logged (`ml.seen`), and an entry keeps the `mode` it
  was FIRST seen in: overstudy-mode entries are excluded from the count (else
  the retry pass refills its own queue), while a move failed again during its
  retry keeps mode 'review' and merely gets `retried: false` again — the sole
  upgrade is 'overstudy' → the current mode, which is also what heals an entry
  another tab mislabelled. What makes a run "overstudy" is the ROUTE, NOT
  Chessable's per-ply `startedAsOverstudy` (v0.35.1): that flag is true for a
  variation Chessable itself counts as overstudy inside an ORDINARY /practice/
  review session too — a card that was not due — so trusting it filed real
  review mistakes under 'overstudy' and hid them from Retry for the session.
  A /practice/ ply is therefore always 'review'; only in /learn/ does
  `startedAsOverstudy` decide. Safe because the runner only ever drives
  /learn/ (it refuses to work inside a /practice/ session — that would
  reschedule real cards).
  `startRun` ALSO refuses outside the BROWSE STATE (v0.56.0) and RETURNS FALSE
  when it refuses, so the popup's "Retry selected" can say why in its own status
  line — the widget's `setDone` flash sits behind that popup and would never be
  seen from there (the same contract as the `continuationDrill` bridge next to
  it). Retry is the DESTRUCTIVE sibling of the two mistake launchers — it
  SWITCHES VARIATION, so a mid-quiz press abandons the card being answered — yet
  the drill was the gated one and this went straight through. `return true` is
  sent BEFORE the first `driveRun()` step, never after: the pass exists once
  `rr.run` is saved, and a throw in that step must not read back to the caller
  as a refusal and print a refusal sentence under a pass that is running. Writes
  MERGE (`mergeEntry`) — every tab shares that storage area, and a background
  overstudy tab used to be able to overwrite the review tab's log.
  THE LOG IS A HISTORY, AND SINCE v0.61.0 THE POPUP SHOWS IT AS ONE. Nothing was
  ever deleted from `ml.log` short of the TTL — `retried` is a flag — so
  `pending()` (not retried, not overstudy-mode; now expressed as
  `allEntries().filter(isPending)`) and `all()` are two VIEWS of one store. The
  count, `reviewRowPrimary`, the row's Retry and section 20's launcher keep
  reading `pending()`; only the popup reads `all()`. What that fixes: a finished
  pass emptied `pending()`, `syncUi` hid the whole cluster on `!pending.length`,
  and the session's mistakes became unreachable — the data was there and the
  door was gone. Now `root`/`count` hide on `!history.length`, the count says
  `Mistakes (0 of 7)` (it always means OUTSTANDING — never a bare "(0)", which
  reads like an empty button) and wears `clo-mx-btn--quiet`, since AMBER MEANS
  "N OUTSTANDING" (§3.2) and must not claim work that is done. Retry itself
  still goes: it acts on the outstanding set, and a second pass is a choice made
  in the popup.
  GROUPED BY CHAPTER, foldable, via `mistakeLogApi.byChapter` — the name comes
  off the entry's own `chapter` field (captured at ingest beside `title`, from
  the drawer BLOCK the active row sits in: `SELECTORS.reviewDrawerBlock` +
  `reviewDrawerChapter`, ground-truthed 2026-08-03 on course 453453, whose two
  chapters are two `.mt-drawer-content` blocks, both fully rendered with the
  drawer CLOSED), falling back to a live `chapterNames()` scan for entries an
  older build logged, then to `Chapter <lid>`. Section order follows the DRAWER,
  so the popup reads the way the course does. Grouping on `lid` is exact — every
  row of a block carries its chapter's lid.
  SELECTION IS DERIVED, NOT OWNED BY THE DOM (`isChecked` = `reselected` ∪
  (default ∖ `deselected`), default = `isPending`). Two sets rather than one
  list of what is ticked, because that is what KEEPS the original property — a
  mistake logged while the popup is open joins the pass by itself — now that the
  default differs per row. It is also why `renderList`'s signature includes the
  tick and `retried` state: a pass finishing under an open popup flips rows to
  "already gone through", and the list has to follow. Folds survive an open
  (`rr.collapsed`); ticks do not — every open starts from "the outstanding ones".
  A group's All/None is the point of the whole feature: going through a chapter
  again must be one gesture, not one click per move.
  The runner's queue is one item per VARIATION (target = the LAST failed move
  of the line; the earlier ones are met on the way) and lives in
  `chrome.storage.session.cloRetryRun` because the FIRST switch is a real
  navigation that destroys the document — the next one adopts the pass. Only
  that one costs a load: in a `/learn/` session an untrusted `.click()` on
  `SELECTORS.reviewDrawerRow` (carries `oid`/`lid`/`title`) switches variation
  in-session, and the /learn/ drawer lists the WHOLE course. NEVER click a
  drawer row in a `/practice/` session — that starts a real REVIEW and
  reschedules the card, so the runner treats "right oid, wrong route" as not
  yet arrived and navigates out. A browse state on the item's OWN variation is
  normally the previous one still painted a beat after the switch (hence the
  early return), but if it OUTLASTS `browseGraceMs` the pass is parked on a
  variation the trainer has finished — where a pass that starts on the
  variation the previous one ended on lands (fail the last one, press Retry
  again): the oid already matches so nothing switches, and its drawer row is
  the ACTIVE one so clicking it does nothing. Only reloading the overstudy URL
  re-quizzes it, which is why `navigateToItem` falls back to
  `location.reload()` when the target URL is the one already loaded (v0.29.1). `storage.session` is profile-wide, so a run
  is OWNED by one document (random id + `beat` heartbeat): a navigating
  document hands over by nulling `owner`, a quiet owner is takeable after
  `ownerStaleMs`, and the owner ends its own pass on `pagehide` (unless
  `rr.handingOver`), after `awayStopMs` off the trainer path inside the SPA,
  or via the `runAbandonMs` sweep for a tab that died — always restoring
  `cloAutoPlayEnabled` to `run.prevAutoPlay`. ADVANCE = THE TRAINER STANDING
  ON A LATER PLY OF THE LINE THAN THE TARGET (`mistakeLogApi.passedPly`,
  v0.53.3), or the variation completing; `quizCorrectTotal` growing past the
  value read ON ARRIVAL (a BASELINE, not `> 0`: a seeded counter would race the
  whole queue through) is kept only as a second signal. The clock is the lesson
  plan's own `fen` — Chessable's current position — located among the plies'
  `sourceFen`s on the four-field key, i.e. section 18b's ply clock, and a quiz
  cannot be left behind without being answered. BOTH SIDES OF THAT COMPARE ARE
  POSITIONS (the item carries the target's own `sourceFen` as `targetFen`),
  never `mkey`: `plyKey` is `'m' + mid` and `mid` numbers the USER's moves, not
  the plies — hence the runner's own `mid * 2` fallback — so a key lookup could
  resolve to an EARLIER ply, and "past it" then went true exactly as the trainer
  ARRIVED at the failed move. The pass advanced, `applyHold` dropped its holds,
  and auto-play played the very mistake the user was being asked for: a brief
  pause, then the move (v0.53.4). Standing ON the target is answered explicitly
  rather than left to the index compare, so a position repeating inside a
  variation — where `findIndex` resolves to the FIRST occurrence — still cannot
  read as "past it". The counter alone was NOT
  enough: its baseline is read on the first arrival tick, and one reading taken
  a beat early (off the outgoing lesson's plan, before the overstudy's own
  counters are in place) leaves the comparison one short FOR EVER, so the pass
  never moved on early and the user played out the whole tail of every line —
  in "Only the mistakes" that is the one thing the mode promises not to ask
  for. The last position of a variation is nobody's `sourceFen`, so a target
  that IS the final ply reads as "not past it" and the browse state ends that
  visit instead; a repeated position resolves to its first occurrence, which
  can only err towards "not yet". `markRetried(oid, visit.at)` deliberately spares entries whose
  ts is NEWER than the visit, which is what keeps a re-failed move in the
  list. Auto-play is told to hold on ALL of the item's failed positions
  (`autoPlaySetHold`, compared on placement+side only because the tracker's
  castling can be the home-square heuristic) — a move failed early and
  answered correctly later IS proven, and would otherwise be replayed past.
  `applyHold` picks that item by the oid ON SCREEN, NOT by `run.index`
  (v0.53.4): auto-playing a move the user is being asked to retry is the one
  outcome this feature must never produce, and hanging the hold off the queue
  cursor made every reason the cursor can move on early — a clock reading a beat
  ahead, the switch to the next item not having landed yet — lift the hold with
  the trainer still sitting on the failed move. The RESUME flag stays tied to
  the cursor: holding is about the variation on screen, taking the board back
  after a mistake is about the item being driven. So is the SHIELD TARGET.
  THE TRANSITION IS SHIELDED (v0.54.0), and this is a correctness hole, not
  polish. Advancing on an answered move is the RUNNER'S decision and the trainer
  knows nothing about it: the correct move lands, ~440 ms later Chessable glides
  the opponent's reply in, and the board is live and asking for the NEXT move of
  the line while the pass spends up to a tick noticing and then a beat
  switching. In 'from'/'only' that is ~2.3 s on which the trainer asks for
  exactly the moves the mode promises not to ask for, and a wrong move played
  there is logged as a NEW MISTAKE — refilling the queue the pass is draining.
  ('whole' is unaffected: it advances from the browse state, where the board is
  not live, so `applyHold` passes NO target in that mode — shielding there would
  block the rest of the variation, which is legitimately the user's to play.)
  So a body-mounted div is pinned over `getReviewBoard()` (absolute in DOCUMENT
  coordinates like every overlay here) and swallows input in CAPTURE phase.
  * TRIGGER = `retryNoteTargetPlayed`, fired from `applyObservedMove` at
    MUTATION speed when a user-colour move is observed from `ap.targetKey` —
    the ONE hold whose answer advances the pass, carried by
    `autoPlaySetHold`'s third argument. Never every hold: with mistakes at
    moves 8 and 12, answering 8 must leave the board alone so the replay of
    9-11 stays fully VISIBLE. That is the behaviour most likely to be got
    wrong. The key is placement+side, `holdKeys`' own normalisation (the
    tracker's castling can be the home-square heuristic).
  * TWO STAGES, because the answer is not confirmed when the shield goes up:
    stage 1 claims nothing and only glows at the board edge (half a second of a
    silently dead board with no cue reads as a FREEZE); stage 2, from
    `driveRun`'s existing `passedPly` path via `confirmShield`, is a green
    "Correct move!" pill. The shield is TRANSPARENT — the reply plays
    underneath and stays visible, which is the confirmation the move was
    accepted, and hiding it buys nothing once input is blocked — so the pill
    carries its own background and a full-surface tint is out. `cursor:
    default`, not `not-allowed`: this follows a CORRECT answer.
  * FAILS OPEN, unconditionally — a stuck shield is far worse than the gap it
    closes. `syncShield` runs from `tick`'s FINALLY (so every early return
    passes through it) and drops on a `shieldMaxMs` cap, oid change, browse
    state, `document.hidden`, off-path and pass end; `noteDead` drops it too,
    since `tick` returns on `rr.dead` ABOVE its try/finally. A failed retry
    therefore raises stage 1, never reaches stage 2, and expires, with
    Chessable's "Incorrect" note readable through the shield throughout.
    Accepted and deliberately unguarded: a piece already picked up when the
    shield mounts keeps its pointer capture and can still be dropped.
  * `confirmShield` sets a `holdUntil` (= `advanceHoldMs`), the ONE exemption in
    that watchdog, and it exists for the pass's LAST item: there `advanceItem`
    → `nextItem` → `finishRun` all run in the same task, so "pass ended" fired
    in the same task the pill went up and the user's final correct answer was
    acknowledged by a ~100 ms flash (measured live, v0.54.0). The exemption is
    scoped to that one reason — the cap is checked FIRST, so nothing can outlive
    it — and `finishRun`'s own eager drop (there so "Stop" gives the board back
    at once) skips a shield inside its hold.
  * GROUND-TRUTHED END TO END 2026-08-02 on course 453453, mode 'only': a
    non-target failed move raises NOTHING; the target raises stage 1 at mutation
    speed (transparent, `rgba(0,0,0,0)`, board-sized to the pixel, hit test at
    the board centre returns the shield) with stage 2 ~750 ms later — i.e. the
    two-stage split is load-bearing, that gap is real; the switch follows
    `advanceHoldMs` later and the shield goes down on 'variation changed'; the
    last item holds the pill ~890 ms then 'pass ended'; a wrong answer at the
    target gets stage 1 only and 'lifetime cap' at ~3.3 s with the pass NOT
    advanced.
  * `processFrame` keeps reading frames while the shield is up (`ap.heldOff`,
    NOT `held()`): the session underneath is really playing, and the opponent's
    reply is what CONFIRMS the user's answer as a proof — skipping it would
    cost them the record for the very move they just got right. Only
    `evaluateAutoPlay` and `injectMove` ask `held()`.
  * AUTO-PLAY IS HELD BY ITS OWN FLAG, `ap.retryHeld` via `autoPlayRetryHold` —
    never `ap.heldOff`, which means "an outside feature owns the board" (18b's
    review, a drill). Two owners on one boolean lose eventually: this shield
    self-clears on a watchdog, and a "Review now" holding at that moment would
    have its hold lifted with its own board still over Chessable's. The two are
    ORed in ONE predicate, `held()`. The hold matters most in 'only' mode,
    where `resumeAfterHandover` is still true between the move landing and
    `advanceItem`, so auto-play would otherwise inject the next proven move
    into the transition.
  * THE SWITCH TIMING IS SPLIT. `switchRetryMs` (1800) was doing two unrelated
    jobs — spacing retried switch ATTEMPTS, and giving the answer a beat on
    screen. `nextItem(holdMs)` now sets `run.switchNotBefore` and `maybeSwitch`
    gates on it separately; a shielded mid-line advance passes
    `advanceHoldMs` (700, long enough to read the pill), everything else
    (skips, completions — including a completion with the shield up, which the
    same tick's watchdog is about to drop) keeps the old beat.
  `cloRetryMode` (storage.local, default 'from') decides how much of a line the
  user plays: 'whole' forces `cloAutoPlayEnabled` OFF for the pass and advances
  only on completion; 'from' is the plain hold; 'only' ALSO passes
  `resumeAfterHandover`, the second argument of the same bridge, which lifts
  auto-play's `vs.handedOver` rule so control comes back after each retried
  mistake (mistakes at moves 8 and 12 ⇒ auto-play 1-7, user 8, auto-play 9-11,
  user 12). That rule exists because resuming mid-line was reported as jarring,
  so the lift is scoped to the variation a pass is DRIVING (`applyHold`'s
  `here`) and cleared on every other tick — never let it leak into ordinary
  sessions.
  Counters that live in the RECORD must be saved to survive the per-tick
  reload (`loadRun`); `rr.waits` is deliberately document-local for that
  reason. Layer 2 of the design (a drill on our own board, and the
  `/difficult-moves` JSON endpoint) is NOT implemented.
- Continuation review (section 18; design + ground truth in
  DESIGN-continuation-review.md): quizzes the clickable subvariation lines a
  completed variation ends with — opponent plies auto-played, the USER'S OWN
  COLOUR asked for, lines run in sequence. THE fact everything else follows
  from: Chessable's browse board is NAVIGATION-ONLY. Ground-truthed with the
  extension's own `pressSquare` recipe — a legal move changes no piece, on any
  square pair — so the quiz cannot run there, and moving their React-rendered
  `[data-piece]` divs is out of the question. Two body-mounted overlays instead,
  absolute in DOCUMENT coordinates (never `fixed`, same reasoning as section
  11): OUR board pinned on theirs (64 of our square divs; pieces are their live
  `<svg>` nodes CLONED — `cloneNode(true)`, never innerHTML, no vendored art —
  with a Unicode glyph fallback; geometry is
  ALL percentages, squares in an 8-col grid and pieces at 12.5% translated in
  multiples of 100% of their own size, so a resize needs no JS. All of that —
  `fillBoardGrid`, `boardVisualPos`, `boardSquareAt`, `harvestBoardPieces`,
  `makeBoardPiece`, `boardShapeArrow`/`boardShapeCircle`, `BOARD_SHAPE`,
  `SHAPE_COLOR_HEX` — lives in SECTION 11c at top level, because the quick-edit
  arrows editor (12b) draws the same board inside a popup; the functions here
  are thin wrappers passing `boardView()`, declared as `function`s so the
  definitions above them can call them. A shape's optional `color` is applied as
  an inline STYLE, never a presentation attribute — `.clo-cr-shape`'s CSS
  `stroke` outranks an attribute of the same name, so every arrow would come out
  green — and on EXACTLY ONE property per element, matching what those classes
  do: `stroke` for the shaft and the ring, `fill` for the arrow HEAD, which the
  CSS also gives `stroke: none`. Colouring the head's stroke as well overrides
  that none, and nothing sets `stroke-width` on a head, so it falls back to
  SVG's default of 1 — which in a `viewBox="0 0 8 8"` is one whole SQUARE of
  outline, i.e. an arrow tip several times its intended size, v0.52.1. The
  polygon's `getBoundingClientRect()` does NOT show it: a bbox excludes stroke,
  so this measured correct while looking wrong),
  and OUR panel
  COVERING `SELECTORS.reviewCommentBox` — not decoration: the lines being
  quizzed are printed there, so covering them IS the quiz. Nothing of ours ever
  enters Chessable's DOM.
  Lines come from `SELECTORS.reviewSubMoves` grouped by the id prefix up to the
  last dot (`0.1.7.1.0`…`0.1.7.1.1` = one line) — but that prefix is NOT unique
  on its own: EVERY comment block restarts the numbering, so a variation with
  three commented moves prints `0.0.0`, `0.0.1` three times over
  (ground-truthed 2026-07-27; the note below about the leading component
  numbering the block was wrong). Grouping on the id alone welded three
  separate lines into one 8-move line that fitted nowhere and dropped all of
  them — i.e. "Review clickables" was broken for ANY variation with more than
  one commented move (fixed v0.36.3). The group key is therefore
  `attachPly + '|' + idPrefix`: two lines of ONE comment share the attach ply,
  so a nested line still finds its parent, while lines hanging off different
  moves never collide. Read the id for the GROUPING and the BRANCH INDEX only —
  both other readings of it are wrong:
  * the leading component is NOT the mainline attach ply (ground-truthed
    2026-07-26: a comment hanging off 10.Be2, ply 18, gives every one of its
    sub-moves an id starting `0.`). The attach ply is COUNTED FROM THE DOM
    instead — `attachPlyOf`, the number of `SELECTORS.reviewMoves` printed
    before the block.
  * the nesting is not always semantic either — ground-truthed earlier,
    `7.0.3.0.*` looked nested under the first line's last move yet its board
    showed it branching from the MAINLINE. So the parent's branch position is
    the FIRST candidate, never an assumption.
  Positions come from the LINE ORACLE (`readLessonLine()` still
  answers in the browse state — verified): candidate anchors are the parent
  line's position at the branch index, then after it, then the position AFTER
  the attach ply, then instead of it, then the parent's other positions and the
  rest of the mainline. A candidate is accepted only when EVERY move's printed
  number+colour (`parseMoveNumber`) matches the position it would be played from
  AND every SAN resolves legally (`sanToUci` + `fenAfterUci`). Lines resolve
  shallowest-first so a nested line can anchor inside its parent. There is
  deliberately NO looser pass: v0.34.1 removed a legality-only fallback over the
  attach positions that had quizzed a `12.Be3 Rb7` sideline on the MAINLINE
  position 8 plies away (both moves happened to be legal there) — a line whose
  numbers fit nothing we can reconstruct is DROPPED, like one that fits nowhere
  or has no user-colour ply. Never guessed at.
  ALREADY IN THE COURSE (`tagLinesInCourse`, v0.35.0): Chessable lets the user
  add a clickable line to the repertoire as a real variation (their own
  right-click on the line), which the user then reviews normally — so quizzing
  it here too drills it TWICE in one session. Such lines are tagged
  (`line.inCourse`) and left out: `freshLines()` is what the launcher counts,
  what `openReview` runs and what the scope picker filters, while `cr.lines`
  keeps everything so the tooltip can say how many were left out. The answer
  comes from the endpoint behind Chessable's own "Find position in course":
  `GET /api/v1/getList?uid&bid&fen` with the JWT Bearer header (`CONFIG.
  chessableApi`, shared with the chapter sort; `uid` comes from localStorage and
  is REQUIRED — 400 without it) → `{ list: { data: [ {id, name, moves, …} ] } }`,
  where a non-empty `data` IS the answer and `name` is the variation's title.
  The page behind that URL is an SPA shell whose HTML contains NOTHING (4.7 KB,
  no cards — do not try to scrape it). Query FEN = the four-field `cacheKey`
  with "/" → ";": the server ignores the move counters and even the en-passant
  field but DOES match the side to move. The position checked is the one AFTER
  the line's last move, i.e. reaching it means the whole line was played.
  Answers are cached per course+position in `chrome.storage.session`
  (`cloCourseFenCache`, 12 h) because a hit downloads ~180 KB (a miss ~0) and a
  session completes the same variation repeatedly. EVERYTHING here fails OPEN —
  no credentials, HTTP error, timeout, unexpected shape, unreadable bid — the
  line simply stays quizzable, since losing a line to a network hiccup is worse
  than drilling one twice.
  ONE POSITION, ONE ANSWER — UNLESS THE ANSWERS ARE THE SAME LINE FORKING
  (`dropAmbiguous`, v0.34.2; combining added v0.67.0). Authors offer
  alternatives for their own side all the time ("10...fxe6 … 10...dxe6 …"), and
  a quiz cannot ask those one after the other — the user would see the same
  board twice and be marked wrong for a move the author also recommends. So
  every USER ply of every
  quizzable line is collected per position (`cacheKey`, i.e. the first four FEN
  fields, so a transposition into a disputed position counts too) and a position
  with two different answers is CONTESTED. OPPONENT plies are
  deliberately NOT collected: two lines showing different replies to one
  position is the ordinary "and if he plays this instead" case (verified live —
  variation 70382641's two lines branch from the same position and both stay).
  A contested position is then resolved ONE of three ways:
  * COMBINED (`mergeUserAlternatives`) when the clashing lines are the SAME LINE
    up to the disputed move — which is exactly what an author writing "or you
    can play…" produces. They become ONE line accepting EITHER answer, which
    then carries on down whichever was actually played. It counts as one line in
    the launcher and costs one pass; the branch not taken is not drilled this
    time, which is the point of combining rather than asking twice (the author's
    call, 2026-08-04).
  * DROPPED when the MAINLINE answers the position differently. There is no
    second line to combine with — only the game the user has just played — and
    being asked to unlearn it a minute later is the trap this pass exists for.
    Deliberately kept as a drop rather than "accept both" (same call).
  * DROPPED when it is not a clean divergence: lines meeting at a position by
    different routes (a transposition), or disagreeing at more than one point.
    "Either move here, then carry on accordingly" is not a true description of
    those, and forcing them into that shape would quiz a board the author never
    joined up. `mergeUserAlternatives` REFUSES rather than approximates —
    identical startFen, identical uci prefix, one shared divergence index, at
    least two lines — and the caller falls back to the old drop.
  A line whose USER move carries "?", "??" or "?!" never reaches this pass at
  all (`quizzableLines` drops it first), so a combined line can never offer a
  move the author marked as a mistake. That was the stated condition for
  combining and it is satisfied structurally, not by a second test here.
  ONE FORK PER LINE is all the run side supports, so a line already combined (or
  dropped) at an EARLIER disagreement makes every other line at a later contested
  position take the safe answer — `settled` in the loop. Without that guard a
  position whose only remaining asker had already been folded elsewhere would
  "merge" a group of one and let a real clash through.
  THE COMBINED LINE IS THE FIRST OF THE GROUP with `alts` hung on the disputed
  ply, each alternative carrying its own continuation and a `src` back to the
  line it was printed in. The primary path stays exactly where it was, so
  everything that does not know about alternatives — labels, `importantLine`,
  the heads-up's mini board — keeps working untouched. The label shows the fork
  ("O-O b5/Qc7 Bb3") so a log line says the pair was combined rather than one of
  them lost.
  AT RUN TIME THE PATH IS RUN STATE, NEVER THE LINE (`cr.path` / `linePath()`).
  `startLine` sets it to the line's own plies and `tryMove` re-paths on taking an
  alternative — prefix + the answer given + that answer's continuation. It must
  not live on the line: the same combined line has to be playable the other way
  in a later run. `step`, `currentPly` and `syncUi` all read the PATH, since
  taking an alternative can make the rest a different length.
  `navigateToLineEnd` takes the path too and follows the last ply's `src`: a
  combined path crosses from one printed comment line into another at the fork,
  and without it Chessable's board would be left on the branch the user did not
  take. Ground-truthed live 2026-08-04 on variation 71087636 with
  `(7.O-O b5 8.Bb3) or (7.O-O Qc7 8.a3)`: both readers logged the combine, the
  launcher went 2 → 3, the prompt read "Black to play — either move", and playing
  the NON-primary Qc7 finished the line and left the board on **a3** — the
  alternative's own continuation, not the primary's Bb3.
  The hint names every accepted answer ("Play b5 or Qc7"); the ordinary prompt
  says "— either move" before the user has to guess that the move they were
  about to play is also right.
  ONE THING THE ORDER COSTS: `tagLinesInCourse` runs AFTER this pass, so a
  combined line is checked for "already in the course" by its PRIMARY ending
  only, and a member that was already added as a real variation no longer drops
  out on its own. Fail-open, like everything else in that check — the line stays
  quizzable — but it is why the count can differ by one from what a pre-merge
  tagging would give.
  WHAT MAKES A MOVE CLICKABLE — ground-truthed 2026-08-04 on course 453453 by
  writing three comments and reading back what Chessable rendered, because the
  answer decides which of the two shapes below the reader ever meets:
  * PARENTHESES DO. Text OUTSIDE them is prose, however move-like it looks:
    `Branch test: 5.Nb3 (5.Nc3 Qxb2) 5...Nf6` rendered ONE clickable group,
    `5.Nc3 Qxb2` — "5.Nb3" and "5...Nf6" stayed plain text. So section 19's
    "Add as line" wrapping its output in parentheses is not decoration, and a
    comment written without them is not quizzable at all.
  * PARENTHESES NEST, exactly as PGN does.
    `Branch test: (5.Nb3 (5.Nc3 Qxb2) 5...Nf6)` gave ids `7.0.0` + `7.0.1` for
    the outer line and `7.0.0.0.0` + `7.0.0.0.1` for the inner — TWO groups,
    which `subMoveGroups` already separates and which have always resolved. So
    the user's own example, `1.e4 (1.d4 d5) 1...c5`, was never the broken case.
  * THE BROKEN CASE IS SEVERAL BRANCHES INSIDE ONE PAIR OF PARENTHESES.
    `Flat branch test: (4.Qxd4 e5 4.c3 dxc3)` gave ONE group — `5.0.0` `5.0.1`
    `5.0.2` — whose third move rewinds. That is what `branched` means and what
    was dropped whole.
  A comment line is therefore often not a line: authors write several branches in
  one breath ("10.dxe6 fxe6 11.Bd3 d5 10...dxe6 11.Qxd8 …") and Chessable makes
  every move of that a clickable
  sub-move in the SAME group. SINCE v0.66.0 EACH BRANCH IS ITS OWN LINE, and
  `walkLine` is what cuts them apart: it SEGMENTS as it walks, playing each move
  from the first of
  (1) where the current segment left off — no branch;
  (2) the END of a segment left open earlier ⇒ a variation closed, so RESUME it,
      scanned NEWEST-FIRST so nesting closes innermost-first;
  (3) a position already played FROM ⇒ a new branch off an earlier move.
  RULE 2 IS THE ONE THAT WAS MISSING and it is not a nicety: the position after
  1.e4 is not in `before` at all until something is played from it, so the old
  scan of `before` alone could only ever find the position inside the SIDELINE —
  "1...c5" was anchored after 1.d4, i.e. quizzed as an answer to the wrong move.
  It is a REFINEMENT, not a looser pass: every candidate is a position this very
  line stood on, and `moveFits` still checks the printed move number of EVERY
  move as well as legality. Spot-checked against the real `walkLine` in a
  headless harness before anything was written down, then GROUND-TRUTHED LIVE
  2026-08-04 (course 453453, overstudy of 70382641, comment
  `Flat branch test: (4.Qxd4 e5 4.c3 dxc3)` on 3...cxd4) on BOTH readers:
  * DOM/browse — `continuation: line 5|5.0 (Qxd4 e5 c3) writes 2 branches in one
    line — 1 of them quizzable`, `line 5|5.0#1 (c3) has no move for the user —
    skipped`, then `5 line(s) ready — h3 Nc6 | c3! d5 | Qxd4 e5 | Nb3 Nf6 |
    Nc3 Qxb2` and a launcher reading "Review clickables (5)". Before the change
    that group contributed nothing, so it was 4.
  * PLAN/heads-up — the panel raised BOTH branching moves at 3...cxd4 ("Qxd4",
    "c3"), and "Review now" ran `starting 2 line(s) now — Qxd4 e5 | c3 dxc3`,
    played to `all lines done`. The two readers legitimately disagree on the
    second branch: the DOM stops making moves clickable after `4.c3` while the
    server's own comment JSON still carries `dxc3`, so the plan reader has a user
    move there and the DOM reader does not. Both answers are right about what
    their source says — which is why `quizzableLines` judges each branch on its
    own rather than the group as a whole.
  Note also: the browse-state gates need a CLEAN completion. A run that ends in
  "Time's up" renders the move list and the clickable lines but NO
  `practiceProgress` block, so `reviewBrowseReady()` stays false and the launcher
  never appears — which under automation (where the clamped timers make "Time's
  up" the default outcome) reads exactly like a broken scan.
  `branched` now means `segments.length > 1` (equivalent to the old "a rewind
  happened" — a rewind can only create or resume, both of which need a second
  segment). The entry keeps the WHOLE run in `plies`/`before` and ADDS
  `branches`, because the lines written INSIDE it are anchored by their index in
  the run; `quizzableLines` — ONE filter now, shared by the DOM scanner and the
  lesson-plan reader, which had drifting copies of the same three rules — offers
  the branches instead of the run and judges each on its own (no user-colour
  move, or a "?" on one, drops that branch and leaves the others).
  Each branch carries `moveIdx`, its plies' indices in the ORIGINAL run: a
  branch's printed spans are NOT contiguous, so `lineSpans` (and through it
  `navigateToLineEnd`) cannot find the move to click without them — it maps ply n
  through `moveIdx` and returns the spans FOR THAT LINE, not the whole group.
  A group with a move we cannot read (Chessable writes null moves as `18.--`) is
  `truncated` and is still dropped WHOLE — its last branch stops mid-line — but,
  like every unquizzable group, it is still stored in `resolved`, because its
  positions are the ONLY way to place the lines written inside it (that is what
  makes the `12.Be3` line above resolvable at all: its anchor exists only inside
  its unquizzable parent). Also dropped: a line whose USER-colour move is annotated
  "?", "??" or "?!" — authors use these lines to show what NOT to play, and
  quizzing one would drill the blunder as repertoire. `quickEditSanFromEl`
  STRIPS eval glyphs (the edit page's ids carry none), so `moveAnnotation()`
  reads them separately as the trailing run of `!`/`?` on the span (never inside
  SAN, so unambiguous), with the next sibling as a fallback in case Chessable
  emits the glyph outside the span. `isBlunderAnnot` tests the FIRST character —
  that is what separates "?!" (drop) from "!?" (keep), so never use a "contains
  a ?" test. An annotated OPPONENT move is the PREMISE of a line about punishing
  it and stays quizzable. Verified end to end: both lines of the test comment
  reproduced Chessable's own board square for square.
  SCOPE PICKER: a line's `fromFinal` flag is `startFen === fens[fens.length-1]`
  (string compare is exact — both sides come from the same `fens` array). When a
  variation has BOTH kinds, pressing the launcher shows "All continuations (n)" /
  "Final continuations (m)" / Cancel instead of starting: continuing from where
  the variation ended is the ordinary case, while an earlier branch revisits a
  move already answered. Only ONE kind ⇒ no picker, straight into the quiz.
  `cr.lines` is everything DISCOVERED (drives the launcher label and the picker
  counts); `cr.queue` is what the current run plays — `startLine`/`nextLine`/
  `syncUi` all index the queue, never `lines`. The board stays HIDDEN behind the
  picker: there is no single position to preview, and `syncUi` early-returns on
  `!cr.line` so the picker's text is not overwritten.
  Input is click-then-click AND drag-and-drop. The drag layer sits ON TOP of the
  click path, which is unchanged: `pointerdown` only ever picks a piece up (the
  same selection a click makes), the pointer is CAPTURED on the grid so the drop
  square is resolved GEOMETRICALLY (every captured move/up event targets the grid,
  not a square), and `cr.swallowClick` stops the trailing click being acted on
  twice. That flag is cleared on EVERY pointerdown before any bail-out — a
  sequence ending without the expected click would otherwise eat a later real
  one — and is otherwise SET on every pick-up.
  Under `dragSlopPx` travel a press stays a click. `touch-action: none` on the
  board (not `manipulation`) keeps a finger drag from scrolling the page.
  DESELECT (pressing the already-selected piece) is done by `onDragEnd` from
  `drag.wasSel`, NOT by the click path: `setPointerCapture` retargets the whole
  compatibility sequence — mousedown/mouseup, hence the CLICK — to the GRID, so
  after a pick-up the click never reaches a `[data-sq]` element and `onSquare`
  is never called. Ground-truthed live 2026-07-26; that is why clicking a
  selected piece did nothing before v0.34.0. Never move that deselect back into
  the click handler.
  RIGHT BUTTON DRAWS: drag = arrow, click = circle, same shape again removes it
  (`cr.shapes`, the in-flight one `cr.shape`). ONE `<svg>` over the piece layer,
  geometry in BOARD UNITS (`viewBox 0 0 8 8` + `visualPos`) like the squares and
  pieces, so a resize needs no JS; `pointer-events: none` keeps input on the
  grid and `contextmenu` is prevented on the board element. Drawing is allowed
  while `cr.busy` (an annotation is never a quiz answer); shapes are scratch
  work, cleared by ANY ordinary press on the board (before the busy bail-out)
  and by every move — nothing about them is persisted, and one colour is the
  whole design.
  Legal-target markers are COPIED from Chessable's live rules rather than
  approximated (33% dot at effective alpha .21; their radial-gradient ring on a
  capture) — the square colour is ours on purpose, the affordances are theirs.
  A refused move needs NO rollback — our position only ever advances on the
  correct move. Two misses spell the answer out (`wrongHintAfter`).
  ENDING A REVIEW LEAVES THEIR BOARD ON THE LINE (v0.38.0): `closeReview(why,
  navEnd)` — true only for a user-driven end (finished, Exit, Escape; NEVER a
  teardown the trainer forced, where the variation it would click in has gone) —
  presses the line's last PLAYED sub-move span, so the review panel (whose FEN
  comes off that board) is already showing the line's final position when the
  overlays come down. Ground-truthed 2026-07-27: a bare `.click()` on a
  `commentSubMove` span does NOTHING; it needs `pressSquare`'s pointer+mouse
  sequence, exactly like a board square. The span is found by matching the
  line's SAN sequence against freshly grouped spans (`lineSpans` over
  `subMoveGroups`, extracted from collectLines) — NOT by an element stored on
  the line: a queued line (18b) came from the plan and never had one, and the
  comment re-renders freely. `cr.plyIdx` caps the index, so an early exit lands
  on the last move the user was SHOWN, and `played <= 0` navigates nothing.
  AUTO-START (`autoKey` = `cloAutoReviewClickables`, storage.local, opt-IN):
  `maybeAutoStart` runs `beginRun(freshLines())` from the tick once the lines
  are ready — launcher and picker skipped, the setting IS the answer to "which
  lines?". Armed once per variation (`cr.autoRan`, which `beginRun` sets for ANY
  run, so exiting never drops the user straight back in), and it stands down
  while `retryRunActive()` (section 17's bridge): that pass navigates between
  variations itself and would tear a just-opened quiz down. Keys are
  swallowed on `document` in CAPTURE phase while active (not bubble like the qe
  popup): our overlays are rarely focused, and MoveTrainer2's single-key
  shortcuts ("n" = next variation) ignore focus, so one keypress would end the
  quiz. The review panel stands down through the `continuationActive` bridge —
  its FEN is read off the board we are covering. Auto-play and the alt check are
  inert by construction (they watch Chessable's board, which we never touch);
  nothing is recorded as proven and nothing is rescheduled — this is practice,
  not review.
- Mid-quiz heads-up (section 18b, v0.36.0): the SECOND way into section 18's
  review, and the answer to "the user has no idea where the lines start". While
  a variation is being played — i.e. OUTSIDE the browse gates the launcher
  needs — a small body-mounted panel is raised the moment the comment column
  prints a clickable line branching at the position the user is standing on:
  "The opponent can also respond with:", that position on a MINI BOARD with an
  arrow per line, the branching move, and "Review on variation end". ONLY that
  first ply is printed — the rest of the line is what the review will ask for,
  and half of it is the user's own moves, so printing it would answer the very
  quiz the panel is offering.
  THE SOURCE IS THE LESSON PLAN, NOT THE DOM — ground-truthed 2026-07-27 on
  /practice/453453/70382641/0/b by playing the variation through with a
  MutationObserver watching: a quiz renders NO `commentMove`, NO
  `commentSubMove` and not even a `commentScrollContainer`. The comment column
  says "Quiz — Black to play!" and nothing else, before and after every answer;
  everything the browse scanner reads is created only when the variation
  completes. (v0.36.0 read the DOM and therefore never showed anything.)
  Each ply's `comment` is a JSON STRING carried in the plan and passed through
  verbatim by pagestate.js: `{ before, after, data:[{key:'V', val:[{key:'S',
  val:'5.Nb3'}, …, {key:'C', val:'<br/>'}, {key:'V', val:[…]}]}] }` — 'V' a
  line, 'S' a clickable move, 'C' prose, a 'V' inside a 'V' the nesting the DOM
  ids spell "7.0.3.0". That yields the grouping, the nesting, the branch index
  (the count of 'S' siblings before a nested 'V', minus one — verified to equal
  the DOM's) and, which the DOM never had, the EXACT positions the comment
  hangs between. `after` is tried first (a line carrying on past the ply),
  then `before` (one offering an alternative TO it); both occur in the same
  variation. Anchoring itself is unchanged — `walkLine`, printed number plus
  legality. The browse-state scanner stays on the DOM: it works, and the two
  agree on `lineSig`, which is all the hand-over needs.
  The mini board reuses `fillGrid`/`makePiece`/`placeAt`/`shapeArrow` — the
  quiz board's own geometry, cloned piece SVGs and arrows — so the two boards
  cannot drift apart. Three rules, all load-bearing:
  * ONLY lines whose FIRST ply is the OPPONENT'S — EXCEPT at the final
    position. A line starting with a move of the user's colour branches where
    the trainer is about to ASK them for a move, so raising it hands over the
    answer; at the FINAL position the variation is over and there is nothing
    left to give away, so a continuation of the user's own colour is offered
    there too (`startPly < finalPly` is the whole test). The wording follows:
    "The opponent can also respond with:" mid-variation, "From here the
    opponent can play:" / "You can also carry on with:" at the end.
  * ONLY lines anchored on a MAINLINE position (`fens.indexOf(startFen) >= 0`)
    are RAISED. A line anchored inside another comment line branches from a
    position the user never plays through, so there is no moment at which to
    raise it. BUT IT IS STILL CARRIED (`linesInside`, `groupLines`, v0.66.1 —
    reported and reproduced live on variation 71087636 with the comment
    `(6.O-O! fxe4 7.Nxe4 (7.Ne5 d6 and Black is better.) 7...d5 …)`, where the
    console read `2 clickable line(s) …, 1 can be pointed out`). That rule was
    right about when to SHOW such a line and wrong about what to do with it: the
    author wrote `(7.Ne5 d6)` as an alternative to a move of the very line being
    pointed out, so it is part of the SAME offer, and dropping it made
    "Review on variation end" and "Review now" quietly review half of what the
    comment says. The browse-state launcher never had the problem — it has no
    mainline rule and always offered both, which is why this looked like a
    branching bug rather than a heads-up one.
    CARRIED, NOT PRINTED: the panel's rows are the alternatives at THIS position
    and a move branching four plies later is not one, so `showHeadsUp` adds a
    quiet "+n line(s) written inside" row instead and the mini board's arrows
    stay `group.lines` only. `armHeadsUp`/`reviewNow`/the "already armed" test
    take `groupLines(group)` = `lines` + `inside`; `headsUpScan` extends the
    `tagLinesInCourse` candidates the same way, since a carried line that is
    already in the course must be able to drop out for the same reason a raised
    one is.
    THE RELATION IS DERIVED FROM POSITIONS, never from the comment keys, so it
    holds for both readers with no key surgery: a line is inside another when it
    starts on a position that other line REACHES. Its own start position is
    deliberately NOT in that set — a line starting where the host starts is a
    SIBLING, and at the root those are raised in their own right; including it
    would duplicate them into the queue. Exact string compare, like the mainline
    test: `resolveCommentLine` anchors a nested line on one of its parent's own
    FENs, so the two are the same string and not merely the same position.
  * The clock is the plan's own `fen` (Chessable's current position) located in
    the plan's `sourceFen`s — `pollHeadsUpPly`, asynchronous, so at most one
    tick stale, which is the right lag (the panel must not blink out on the
    frame a piece lands). A line branching at mainline ply k goes up when the
    trainer reaches ply k and comes down at k+2: the OPPONENT'S reply (ply k)
    leaves it standing, the USER'S next move (ply k+1) takes it away. That is
    the asked-for "it disappears when you move".
    NEVER derive this clock from the board DOM. Ground-truthed 2026-07-27: after
    a rolled-back wrong answer the board held a stale DUPLICATE piece (a knight
    on b8 AND c6) for far longer than an animation, which no one-king-per-side
    check catches; the derived placement then matched no plan position at all
    and the clock simply stopped, leaving the panel up over a position the user
    had left several moves earlier.
  A first move that merely transposes back into the variation (`cacheKey` of
  its post-FEN equals the mainline's next position) is not an alternative and
  is dropped. `tagLinesInCourse` is AWAITED before `cr.hu.lines` is assigned,
  so no line is ever raised untagged; it runs for the CANDIDATES only (network
  round trip, and nothing else could be raised anyway).
  RUNS IN THE BROWSE STATE TOO (v0.37.0), for the lines that carry on from the
  FINAL position — those branch where the variation ends, so there is no
  earlier moment at which to raise them. `tick` therefore calls `headsUpTick`
  in BOTH branches (browse only while `!cr.active`, or it would fight the quiz
  overlays it is about to be replaced by).
  THE QUEUE IS NEVER STARTED AUTOMATICALLY (v0.37.0): a filled
  "Review queued lines (n)" button (`cr.queueBtn`, ahead of the plain launcher
  in the same cluster) calls `runQueued`. Landing in a quiz nobody asked for is
  jarring, and the final continuations are only offered once the variation ENDS
  — so the user must have a moment to add those to the queue before anything
  starts. The button only shows in the browse state: our board overlays
  Chessable's, so running mid-quiz would cover a live quiz board. `beginRun`
  clears the queue, whichever way the run started (the launcher's set contains
  it), so the button cannot linger after the lines have been played.
  While it shows, the plain "Review clickable(s)" launcher is HIDDEN
  (`show = … && !showQueue`): a user who picked lines by hand has already said
  which ones they want, so "all of them" beside it is noise and the two green
  buttons compete. It comes back the moment the queue is spent or the variation
  changes — which is also the only way to abandon a queue.
  THE QUEUE IS THE RESOLVED LINES THEMSELVES (`cr.hu.armed`: lineSig → line),
  handed straight to `beginRun`, skipping the All/Final picker (the user
  already chose). It used to store only the NAMES and look them up again in the
  browse scanner's `freshLines()`, which meant a line could be offered mid-quiz
  and then silently withdrawn at the end ("the line(s) queued during the quiz
  are no longer offered", v0.36.6). The two readers are ALLOWED to differ: the
  DOM one has a wider anchor set (the whole mainline, not just the comment's own
  two positions), counts the attach ply from printed moves rather than from the
  plan, and never sees a `comment_before` block as its own — any of which can
  land the same line on a different startFen, changing its lineSig. Nothing
  about a queued line needs re-deriving anyway: it was resolved against the
  plan's exact positions, `walkLine` proved every SAN legal, and every
  condition above was applied before it was ever raised. Never reintroduce a
  cross-reader lookup here.
  Queueing a line HIDES the panel after `headsUpQueuedHideMs` (v0.38.0): its
  work is done and it sits over the gutter — or, on a phone, over the comment
  column. `armHeadsUp` already adds the group to `seen`, so the next tick cannot
  raise it again; the timer is cleared by `hideHeadsUp`.
  "REVIEW NOW" (v0.51.0) is the panel's SECOND button and the only run that
  lives OUTSIDE the browse state. `reviewNow` plays the SHOWN GROUP on the spot:
  `beginRun(lines, spot=true)`, whose `spot` arm keeps everything else as it was
  (only the played lines leave `cr.hu.armed`, `cr.autoRan` is NOT set, the
  auto-start stays armed for the variation's other lines) and sets
  `cr.midQuiz = spot && !reviewBrowseReady()`. That flag is what `tick` checks
  before its "left the browse state" teardown — every OTHER active review must
  still die there, since outside the browse gates it means the trainer moved on
  underneath us; this one was opened over a live quiz deliberately. Mid-quiz the
  panel placement needs no special case either: `positionOverlays` falls back
  from `reviewCommentBox` (a live quiz renders NO `commentScrollContainer` —
  same fact section 18b is built on) to `reviewCommentCol`, the column that
  holds it, so the panel lands exactly where it does in the browse state.
  THE TRAINER IS PUT ON HOLD for the duration (`holdTrainer` / `releaseTrainer`,
  the latter called from `closeReview` on EVERY close, so a run torn down by a
  variation change cannot leave the session paused):
  * the session TIMER is paused, or the minute spent in a sideline is charged to
    the card being answered. Ground-truthed live 2026-08-01: pausing is a plain
    `.click()` on `trainerPauseButton()` (the footer control section 10 has
    always used), while the play overlay that replaces the board
    (`SELECTORS.trainerPlayOverlay`) needs the full `pressSquare` pointer
    sequence — a bare `.click()` on it does NOTHING, exactly like a board
    square. Pausing leaves the board element and every `[data-piece]` in place
    (the pieces merely go to opacity 0), so the overlays measure and clone off
    it as usual, and the quiz position is untouched: resuming puts the trainer
    back exactly where it stood. A session paused by SOMEONE ELSE (section 10's
    background-tab auto-pause) is left alone by `pauseTrainerTimer` and so never
    becomes ours to resume.
  * the control is NOT always on screen — Chessable empties the board footer in
    the study/transition states between quizzes, which is exactly when the
    heads-up can be up (seen live) — so `maintainTrainerHold()` retries once per
    tick while the run is active instead of giving up on the one press.
  * AUTO-PLAY is held off through `autoPlayHold(true)`: our board covers theirs
    and the session is paused, so an injection would be a move played into a
    board nobody can see. It gates `evaluateAutoPlay` AND `processFrame` (the
    pause/resume repaints are Chessable's frames, not moves, and reading them
    only costs the tracker its thread); release re-enters the loop at once.
    `ap.heldOff` is THIS reason only — section 17's transition shield has its
    own flag and the two are ORed in `held()`, so neither can release the
    other's hold. `processFrame` reads `ap.heldOff` DIRECTLY for that reason:
    under the shield the trainer really is playing.
  `releaseTrainer` resumes the timer BEFORE releasing auto-play, for that same
  reason. Exit reads "Back to the quiz" in this mode (`syncUi`) — leaving is not
  "give the board back and be done" but "go back to the card I was in the middle
  of", and the timer restarting is the half the user cannot see.
  HIDDEN WHILE AUTO-PLAY REPLAYS (v0.51.0): `headsUpTick` returns early on
  `autoPlayReplaying()` — during the opening replay the positions go past at
  auto-play's own speed, so a panel raised on one of them either flashes by
  unread or, worse, stands over a position the replay has long left. HIDDEN, not
  dismissed: the group stays out of `seen`, so whatever is still branching where
  auto-play hands back is raised the moment it does. The scan and the ply clock
  keep running, so nothing is missed by waiting. The bridge answers
  `injected || injectTimer`, else a move injected within `replayQuietMs`
  (1.5 s) — the quiet window exists because NOTHING else marks the gap between
  one replayed move landing and the trainer's reply, and `maybeHandback` clears
  `vs.replayAt` so a real handback shows the panel immediately rather than
  waiting the window out. Verified live that with auto-play merely ENABLED (the
  common case) the panel still appears: every guard above is false until a move
  is actually injected.
  PLACEMENT — IN THE BROWSE STATE IT COVERS THE COMMENT (v0.60.0), for the same
  reason the QUIZ panel always has: the lines it is offering to quiz are PRINTED
  THERE. A completed variation's comment regularly ends with the whole line
  written out ("If white goes for the doubled pawns: 7.Bxc6+! bxc6 8.O-O Bg4
  9.h3 Bh5 10.d3 Rg8 11.Bf4 Qd5"), so a heads-up that offers that line while
  leaving it on screen has handed over every answer before the user presses
  anything. `placeHeadsUp` therefore prefers `SELECTORS.reviewCommentBox` —
  the comment's own SCROLL CONTAINER, which a live quiz does not render at all
  (18b is built on that fact) — so the rule is self-limiting: container present
  ⇒ browse ⇒ cover it. The whole container, not its top: the clickable lines are
  usually the LAST thing in a long comment.
  MID-QUIZ IT NOW FALLS BACK TO THE COLUMN (v0.63.0) — `reviewCommentCol`, the
  same chain `positionOverlays` has always used for "Review now". CLAUDE.md used
  to refuse this on the grounds that Chessable's own "Quiz — White to play!" was
  worth leaving readable, this panel being unsolicited where "Review now" is
  asked for. Overruled on the evidence: that column prints ONE sentence and is
  then empty for the whole card, the board says whose move it is anyway, and the
  room is what the mini board grows into — 176px in the gutter against 317px over
  a 455px column. TWO DIFFERENCES from the spoiler branch, both deliberate:
  * the column is SIZE-GATED (`headsUpCoverMinPx`, 300) and the box is not.
    Covering the box is a SPOILER decision — the answers are printed in it, so it
    is taken at any size, overflow and all. Covering the column buys room and
    hides nothing, so a column too short to hold the panel is not worth taking:
    the content-sized placements below it are better.
  * the panel keeps its CONTENT HEIGHT over a column, and is stretched to the
    box. Over a column it is the WIDTH that limits the board (a trainer column
    runs 600px+), so a fixed height would leave the panel half empty for nothing
    — where over the comment box filling it IS the point.
  This also retired the old preference, the
  gutter LEFT of the board, whose comment read "which during a quiz is empty:
  the review panel only ever shows in the browse state" — true when written, and
  falsified by v0.37.0 extending this panel INTO the browse state, where the
  review panel is in that gutter: it covered the Lichess move table (which
  spoils nothing) and left the comment showing (which spoils everything).
  Ground-truthed live 2026-08-03: mid-quiz `[406,113,300,304]` content-sized and
  no scroll container (the placement v0.63.0 replaced); browse `[1226,161,506,385]`
  against a comment box of exactly `[1226,161,506,385]`, opaque, with the Lichess
  panel at `[286,113,420]` no longer overlapped.
  In a STACKED layout (portrait) while the quiz is LIVE placement stops at the
  board's own FOOTER instead of also clearing the overstudy widget and the whole
  trainer row (`coverComment` = stacked && `!reviewBrowseReady()`): down there
  Chessable prints nothing but "Quiz — White to play!", while our panel would
  otherwise be a scroll away from the board it is talking about. Since v0.63.0
  that is the SHORT-column case only — a stacked column tall enough is covered
  like any other.
  COVERING ALSO SIZES THE MINI BOARD (`fitHeadsUpMini`, v0.63.0). Everywhere else
  the panel wraps around a `headsUpMiniPx` board; over the comment box the panel
  has a BOX (~506x385 live), and a 176px board in that leaves the only thing
  worth looking at as the smallest part of the panel. So the board takes whatever
  the rest leaves — MEASURED, never estimated (the lead sentence, the number of
  move rows, the queued note and the arm button's presence all vary in height,
  and this must never push the buttons out of a panel that cannot scroll):
  collapse the board, let the panel size to content for one synchronous read,
  restore. The BODY's height comes back off (`rest` is everything OUTSIDE it) —
  the move rows sit BESIDE the board and are absorbed by it, only
  `headsUpMovesColPx` of WIDTH is theirs. That is not a detail: counting them as
  height instead (i.e. dropping them below the board, which at that width looks
  like the tidier layout) measured 207px of edge against 261 in the harness.
  `headsUpMiniPx` is the FLOOR, so a box too small to fit the fit is left exactly
  as it was. Measured in the harness: 261px over a 506x385 comment box (height-
  bound), 317px over a 455px-wide column (width-bound). The measurement needs a laid-out panel, so it bails while
  `hidden` and `showHeadsUp` calls again after unhiding, and it is cached against
  everything that can change the answer because `placeHeadsUp` runs on every
  scroll event and this forces two reflows. The glyph piece fallback is the one
  thing on that board NOT sized in percentages, so `sizeHeadsUpMini` sets a
  font-size on the board element and the stylesheet inherits it.
  AT THE FINAL POSITION WITH AN EMPTY QUEUE THERE IS NO ARM BUTTON (v0.63.0):
  "Add to review queue" beside "Review now" then offers a second button to go and
  find in exchange for nothing — the variation is over, so the wait it names has
  already happened. `cr.hu.armed.size` is the test, not `group.final` alone:
  once anything IS queued, adding to a set that will be played in one go is a
  real choice and the button comes back. Mid-variation it always stands.
  Unlike the quiz panel this one must NOT
  swallow keys — the user is still playing on Chessable's board and needs
  MoveTrainer2's shortcuts — so its buttons `blur()` themselves after a press
  instead, or the next space would re-fire them. Opt-OUT setting
  `cloLineHeadsUp` (storage.local, absent = ON), watched through
  `chrome.storage.onChanged` so a change lands in open trainer tabs. TWO
  controls write it: the options-page checkbox, and the panel's own "Turn off"
  — the setting has to be reachable from inside the session, since the options
  page is another tab and the panel's moment has passed by the time anyone gets
  there. That one arms on the first click and disarms after `headsUpOffArmMs`
  (auto-play's "Clear" pattern): a misclick would otherwise cost the feature
  for the rest of time, with the options page the only way back.
  `turnHeadsUpOff` sets the local flag and hides the panel BEFORE the write, so
  an orphaned content script still obeys the press.
  Deliberately NOT gated on `document.hidden` (auto-play is, because it DRIVES
  the board; this panel only reads and renders, and is invisible in a hidden
  document anyway — the guard bought nothing and made the feature impossible to
  verify under automation, where a driven tab always reports itself hidden).
  The scan runs ONCE per variation (the plan holds every comment from the first
  frame) and only after `getReviewBoard()` exists — before that there are no
  React fibers to walk, and a small retry budget was otherwise spent entirely
  on "no fiber root" during the cold boot, permanently skipping the variation
  (v0.36.2). Budget is `headsUpScanTries` (~30 s at the 500 ms tick).
  Wiped by `resetHeadsUp` on every variation change and on leaving the trainer
  path.
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

- Show and grade (section 23, v0.71.0; design + the whole live read in
  DESIGN-show-and-grade.md): a `/practice/` REVIEW card answered with two keys
  and no move — the mode that makes a session studiable from a Bluetooth ring,
  and the seam for blindfold practice. Opt-IN (`cloShowGrade`, storage.local).
  IMPLEMENTED BUT NOT YET VERIFIED LIVE — §11 of the design doc is the list, and
  the injection in the "I knew it" path is the item everything else rests on.
  THE FEATURE IS MOSTLY A CONSEQUENCE OF ONE GROUND TRUTH (2026-08-04, course
  453453): CHESSABLE ALREADY HAS THE "MARK THIS WRONG" CONTROL, and it is ONE
  footer button that MUTATES. In a live quiz the footer is [Hint `.fa-bell`,
  Pause `.fa-pause`]; the first press circles the piece to move and turns the
  button into "I don't know"; the SECOND press PLAYS the move and records
  `quizIncorrectAttempts: ["giveUp"]` + `quizTotal 1` + `quizIncorrectTotal 1`.
  Pressing Hint ALONE records NOTHING — every counter read identical before and
  after — so the first press is free and the second is the whole grade.
  * `"giveUp"` is a THIRD literal beside `"timeUp"` and a real SAN. The mistake
    log (16) reads that array, so these failures join the session's list with no
    bridge of our own; the only change needed was `wrongLabel`, which would
    otherwise have rendered "played giveUp". It says "not known" — the user is
    ANSWERING honestly in this mode, not surrendering.
  * SO THERE IS NO WRONG-MOVE INJECTION ANYWHERE, which was the original design
    and its one real hazard: a legal wrong move Chessable happens to ACCEPT
    grades a failure as a PASS. Gone, along with the open question of whether
    the lesson plan carries `alt_white`/`alt_black`. Do not reintroduce it.
  * The give-up PLAYS the move itself and parks the trainer in a study state
    ("Study this move…") whose control is `SELECTORS.trainerNextBtn`
    (`[data-testid="nextMovesButton"]`, so no label matching) and takes a plain
    untrusted `.click()`. Only the "I knew it" path ever presses the BOARD.
  THE TIMER IS PAUSED WHILE THE USER THINKS, and that is correctness, not
  courtesy: the per-move clock is short, a card that runs out records
  `["timeUp"]` and plays the move — so a move the user KNEW is graded wrong.
  (Observed exactly that twice during the ground-truthing, by being slower than
  the clock.) Section 18b's mechanism unchanged; verified here that a pause
  survives the thinking with no timeUp, and that the hint/give-up button stays
  rendered AND clickable while paused (only "Pause timer" is replaced).
  TWO TRAPS, both found by falling into them:
  * PRESSING THE BOARD WHILE PAUSED RESUMES THE SESSION AND THE PRESS IS
    CONSUMED. Hence `resumeAndSettle()` — resume, wait `settleMs`, then press —
    which nothing in this module may skip.
  * A REAL `n` keypress advanced the study state; a SYNTHETIC `KeyboardEvent`
    did NOT. One observation in one state, but it is the first direct evidence
    about section 22's `advance()`, which this file already flags as unverified.
    Section 23 therefore prefers the BUTTON and keeps the key dispatch as a
    fallback only — and section 22's own use of it wants re-testing.
  ARCHITECTURE: it is NOT a `cr.mode`. The continuation module's
  `startLine`/`step`/`tryMove` walk a STORED line; this follows the LIVE
  trainer, so sharing that driver would have meant bending it. What IS shared is
  section 11c's primitives (`fillBoardGrid`, `harvestBoardPieces`,
  `makeBoardPiece`, `boardVisualPos`, `boardShapeArrow`) and the `.clo-cr-*`
  board CSS — which is what they were hoisted to top level for. The board takes
  NO input (`pointer-events: none`, and no square handlers are bound at all): the
  card is answered with two keys, and a board that could also be clicked would be
  a second, undocumented way to answer it. Its ring is AMBER, not the quiz's
  green — it sits in exactly the same place as the drill and the line quiz and
  never accepts a move, and the ring is what says so at a glance.
  TWO PRESSES PER CARD, AND EVERY PRESS SHOWS A MOVE (v0.70.0). That is the
  governing rule — it is what a ring is actually pressing, and a press that
  displays nothing is a wasted one. First press: YOUR move, played on our board
  (animated) with the arrow — the arrow says WHICH move, the glide says what the
  position now LOOKS like, and the second is the more useful for a mode aimed at
  blindfold practice. Second press: THE OPPONENT'S REPLY, which is also what
  GRADES the card. The grade rides on a press that was going to happen anyway, so
  it costs nothing, and the reply — the one move the user does not choose — can
  never slide past unnoticed.
  BOTH KEYS HAVE THAT SAME SHAPE. "Wrong" pressed at the THINK stage does NOT
  cost a press of its own: the card is lost either way and the user still wants
  to see the move, so the verdict is remembered (`sg.markedUnknown`, cleared by
  `anchor`/`leaveActing`/`startMode`) and applied by the press that advances.
  v0.69.0 had a third press — grade, THEN reply — which is the wasted press this
  replaced; do not reintroduce it.
  `advanceAfterGrade()` runs the MOMENT the key is pressed, not when the
  Chessable act finishes: the reply comes from the plan, so there is nothing to
  wait for. That is also why `failAct()` exists — an act that cannot be carried
  out leaves our board a card AHEAD of Chessable, where `cardReady()` would
  refuse every later grade for the rest of the session (the trainer never moves,
  so `awaitingFen` never clears), so it drops the wait and forces `anchor()` to
  re-derive the card from wherever the trainer actually is.
  Simulated over whole variations before anything was written down (5 cases: user
  as Black and as White, a card marked wrong at the think stage, a variation
  ending on the user's move, a line with castling and a capture) — exactly two
  presses per card, no press showing nothing, and the moves shown equal to the
  plan's own sequence.
  SO OUR BOARD WALKS THE PLAN AT THE USER'S PACE and is NOT slaved to the
  trainer's fen (`sg.plies`/`sg.cursor`/`sg.cardIdx`). Between the grade and the
  reply press the trainer is one or two plies AHEAD; that is normal, not a
  desync. Two rules keep it honest, and both were needed:
  * `anchor()` runs ONLY from 'think', and NEVER while `awaitingFen` is set (the
    trainer still standing on the card we just answered). Without the first, a
    re-anchor yanks the board forward past the move the user asked to see;
    without the second, a user who presses the reply key quickly is dragged BACK
    onto the card they have already graded.
  * `cardReady()` gates BOTH grades — the trainer must actually be standing on
    the card our board shows. What our board shows is NOT evidence about what the
    trainer is asking, and grading the wrong card is the one mistake here that
    costs a real scheduled move.
  ANIMATION: `.clo-cr-piece` already has `transition: transform 180ms ease-out`
  (the continuation board's, matched to MoveTrainer2's own ~200ms click-move
  glide, i.e. Chessable's fastest), so the board inherits it and the only thing
  needed was to stop DESTROYING pieces — `playPlyOnBoard` MOVES the existing
  element (applyMove's pattern) where a plain `reconcile()` removes and recreates
  it, which has nothing to transition from and teleports.
  `CONFIG.showGrade.animMs` (180) is the delay before the authoritative
  reconcile and must never be SHORTER than the CSS transition.
  The walk was spot-checked against the real CloSan generator before any of this
  was written down (25 landings over 6 lines — the live variation "4", both
  castles, en passant, promotion, rook disambiguation, a capture chain): every
  position our board reaches equals the plan's own next `sourceFen`.
  IT HOLDS SECTION 13 OFF THROUGH ITS OWN FLAG, `ap.sgHeld` via
  `autoPlayShowGradeHold` — NEVER `autoPlayHold`/`heldOff`, and this is the whole
  reason its auto-play did not work at all in v0.71.0 (fixed v0.73.0).
  `processFrame` returns on `ap.heldOff` (that flag means "an outside feature
  owns the board and nothing is really being played on it" — 18b's review, a
  drill), so for the mode's whole duration the TRACKER OBSERVED NOTHING: no move
  was ever classified, no `pendingRecord` was ever set, no proof was ever
  recorded — and this mode's own auto-play then consulted an empty record and
  could never fire. Under show-and-grade the session underneath IS really being
  played (we press its squares, it animates, it replies), so those frames are
  real moves and reading them is the entire point. Same reasoning, and the same
  fix, as section 17's transition shield — which is why the comment above
  `if (ap.heldOff) return;` already spelled it out. THREE flags now, ORed in
  `held()`, which is what still blocks section 13's INJECTION throughout.
  ITS OWN AUTO-PLAY (v0.71.0), toggle on the row (`cloShowGradeAutoPlay`),
  independent of section 13's — which is held off for the whole mode anyway,
  since it drives Chessable's board and this mode must be the only writer of it.
  The RECORD stays section 13's; section 23 only asks, through the read-only
  bridge `autoPlayIsProven(fen, uci)` (key = `posKeyOf`, and the FEN handed in is
  the plan's own exact `sourceFen`, so no heuristics). It fills by itself during
  a session, because "I knew it" already calls `autoPlayNoteTypedMove`. An
  auto-played card runs the SAME TWO STEPS a press would — `reveal()`, a beat,
  `gradeKnown()` — so there is no second code path for the board or the grade to
  drift down.
  IT DOES NOT RUN AHEAD OF CHESSABLE, and this will be proposed again, so: every
  card must still be GRADED on Chessable, IN ORDER, and only while Chessable is
  standing on it (`cardReady`). Running ahead means a queue of ungraded cards
  where one failed act mis-files every card behind it — and the moment the replay
  reaches an unproven move the user waits for Chessable anyway, so the board
  would show move 12 with the trainer on move 4 and the first thing the user does
  is sit and wait. Gain nothing, risk grading the wrong card. ONE card at a time,
  gated on `cardReady()`; the floor is Chessable's own (~440ms + ~480ms) exactly
  as section 13's is.
  HAND-BACK IS SECTION 13'S RULE: only a variation's OPENING run is replayed,
  never a jump back in after the user has taken a card (`sg.handedOver`, set in
  `onKey` and deliberately NOT in `reveal()`, which auto-play itself calls).
  Simulated over 5 cases: nothing proven, a proven prefix (hands back at the
  first new move), all proven, only the MIDDLE proven (⇒ no auto-play at all —
  the opening-run rule), and proven-again-after-a-hand-back (⇒ still manual).
  NO FLICKER AT A VARIATION CHANGE (v0.71.0): the board used to keep showing the
  position the PREVIOUS variation ended on until the trainer settled, then jump.
  `applyPlan` nulls `sg.pos` on a variation change and
  `setBoardVisible(Boolean(sg.pos))` hides both overlays until `anchor()` fills
  it in — ONE condition, not a flag to keep in step. The overlays are HIDDEN, not
  torn down (a removed board must be rebuilt, pieces and all — a second flicker
  on top of the one this removes; `hideBoard()`'s removal is now `stop()`'s
  alone), and they are BORN HIDDEN in `buildBoard()`, since a board is only ever
  built before it has a position and an empty 8x8 for a frame is the same
  flicker at the other end.
  IT COVERS BOTH MISTAKE FLOWS (v0.72.0), and they needed opposite amounts of
  work — the retry pass is an ordinary trainer session on another ROUTE, the
  drill is our own board with no Chessable in it at all.
  * RETRY (17): `onPractice()` became `inSession()` = `isTrainerPath()`. Both
    routes render identical MoveTrainer2 markup, so plan, pause, give-up and
    injection all work unchanged; the /practice/-only rule was about where
    GRADING means something, and a retry pass is exactly where the interaction is
    wanted and the grading deliberately changes nothing. Also brings the mode to
    overstudy tabs and first-time learning. TWO CONFLICTS, both real:
    - AUTO-PLAY MUST NOT REPLAY THE MOVE BEING RETRIED. That move is very often
      ALSO proven — the user answered it correctly later in the session, which is
      why it is in the record — so without a check our auto-play plays the one
      move the whole pass is asking for. New read-only bridge
      `autoPlayIsHeld(fen)` reads section 17's own `autoPlaySetHold` list;
      `cardIsProven()` asks it first. Key shape is `holdKeys`' (placement+side,
      no castling) for holdKeys' own reason.
    - `advance()` REFUSES while `retryRunActive()`: the pass has a queue and
      navigates itself, so our "next variation" would take the user off its route.
    CONSEQUENCE, not a conflict, and intended: this mode holds section 13's
    auto-play off for its whole duration, so in a retry pass the run-up is
    replayed by OUR auto-play (the hold check lands it in the same place). With
    the Auto toggle off the user presses through the run-up, which is what
    "every card waits for you" means.
  * DRILL (20): a drill grades only OUR OWN mistake list — nothing sent to
    Chessable, nothing rescheduled, no timer, no card to keep in step — so it is
    the two keys and nothing else, in the continuation module's existing
    capture-phase listener. First press `applyMove`s the card's move; second
    press is the verdict, then `nextLine()`. `finishDrillCard(cleanOverride)`
    gained one optional argument: show-and-grade's verdict is AUTHORITATIVE and
    overrides the "no miss, no hint" test, because nothing was missed or hinted —
    the move was shown, and the user saying they knew it is the only evidence
    there is. ADDITIVE: the board still takes a played move, so the keys are a
    second way to answer rather than a mode to be in. Gated on
    `showGradeEnabled()` — the PREFERENCE, not a running session, since a drill
    is not a trainer session and the row's button does not apply to it.
  The POSITION is the trainer's own `ctx.fen` through `readLessonLine()` —
  section 18b's rule for section 18b's reason. Playing is auto-play's recipe plus
  `autoPlayNoteTypedMove`, without which the move is filed as trainer-played and
  never remembered as proven. Promotions refused with a sentence.
  KEYS are `CONFIG.showGrade.keys`, a set of ARRAYS so a second spelling is an
  entry rather than a code change; swallowed on `document` in CAPTURE phase
  (section 18's discipline — MoveTrainer2 binds single-key shortcuts there and
  does not skip focused controls), OUR TWO ONLY, and never inside an input.
  Media keys are deliberately NOT wired: on most platforms they never reach a
  page as key events at all (the OS routes them to the media session, claimable
  only by playing audio), and no real ring has been captured yet.
  Section 22 stands down through the new `showGradeActive` bridge — two things
  holding the keyboard over one quiz board is not a state either can reason
  about. Auto-play is held for the duration; `continuationActive()` stops this
  mode, since those own the board.
  `stop()` FAILS OPEN, TIMER FIRST, on every exit path (toggle, preference off,
  leaving /practice/, another board opening, `pagehide`): a session left paused
  with our board down is the worst thing this mode can leave behind. `acting` is
  watchdogged to `actMaxMs`, checked before any other early return in `tick()`.
  BLINDFOLD SEAM: every user-visible statement goes through `announce(text)` and
  `CONFIG.showGrade.showBoard` (default true) stops anything being drawn. In
  place before there is anything to speak, deliberately — retrofitting it once
  the drawing calls are scattered through the driver is the expensive version.
  ROW: `.clo-sg` at `order: 2`, beside the move field (both act on the card being
  answered); mistakes/practice/overstudy/settings each shifted up one. Green
  OUTLINE idle, and `.clo-rowprimary` while running, when it reads "Stop" — a
  mode that owns the session must not make its exit a hunt. A FOURTH
  collapsed-mid-quiz exception in the established idiom,
  `.clo-review--collapsed .clo-sg:has(> .clo-rowprimary)`, reading the module's
  own state rather than a new flag, at (0,4,0). Measured in the harness: browse
  row 38px, collapsed-while-running 38px, +26px with a status line — the same
  figures the move field gives.

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
