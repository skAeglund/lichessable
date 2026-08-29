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
often as the session lasts. A move can also be PINNED (section
16b), which is the one thing here that outlives the session: it comes back in
the drill after half an hour, four hours and a day, and retires itself once it
has been answered clean three times over three sittings. The offer to pin is
made in the bottom-right corner RIGHT AFTER the mistake (16c) — the moment the
user has an opinion about a move — and pins that have come round again are
launched from that same corner ON ANY CHESSABLE PAGE (16d), onto a board of our
own that needs nothing of Chessable's under it. A completed variation whose comment holds clickable
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
that page has no trainer row to host one. "Add as variation" (19c) writes the
line as a real trainable card with the source's own plies in front of it, and
"Add as puzzle" (section 19d) writes it ALONE, starting from the board's own
position — a FromPosition card — into any chapter of any course you can import
into, chosen from a picker in the panel. That same puzzle write is offered on the
CLICKABLE LINES a comment prints (section 19e), from the right-click/long-press
Chessable answers with its own "Add to Repertoire". A COURSE page
(`https://www.chessable.com/course/<bid>/`) gets TWO whole-course panels. The
COURSE TREE (section 24) walks the course into a position-keyed graph and
browses it as Miller columns — standing anywhere, what did the author cover,
how many of their lines take each move, and where do two chapters transpose
into one; forced runs are folded into a row, so a 20-ply variation is two or
three of them. An opt-in LICHESS SCAN (24b) reads the explorer for each column
on screen and answers the other half of the question — how often real games play
each of those moves, what share of them the course accounts for, and which
popular replies it never answers at all. It also SCANS FOR SPLITS (24h): the
positions the course answers with more than one of YOUR OWN moves — alternative
moves that are not registered as alternatives, so the trainer will refuse
whichever of them you happen to play — and, on request, reads each card to say
which ones will actually refuse. Read-only, keyboard-driven, with a
field that finds a line by name (24c). And "Repertoire coverage"
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
  permissions for `explorer.lichess.org`, `www.chessdb.cn` (section 26, added
  v0.128.0 on explicit request) and `lichess.org` (section 27, v0.130.0, same
  conversation — DESIGN-intuition-storm.md §10). Nothing else, keep it that way
  — a FOURTH host needs the conversation the second and third ones got. The
  third is the one whose guard does real work: that host serves the user's whole
  account, so the worker allows the single path prefix
  `https://lichess.org/game/export/` and nothing more.
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
  NEITHER browser-automation surface here will navigate to a `file://` URL, so
  measuring it from a session needs `node dev/serve.js`
  (http://127.0.0.1:8731/dev/harness.html, `Cache-Control: no-store`, which also
  spares you the stylesheet cache-bust below). Opening the file directly still
  works by hand.
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
  * `DESIGN-pinned-mistakes.md` — section 16b, and the pinned arms of 17's popup
    and 20's launcher
  * `DESIGN-quick-edit.md` — section 12, incl. §6 refreshing the host after a save
  * `DESIGN-quick-edit-arrows.md` — section 12b only
  * `DESIGN-show-and-grade.md` — sections 23 and 23b (§4 = auto-play, §14 = the
    live ground truth, §15 = what must never happen, §18 = what is still open)
  * `DESIGN-key-move-leadin.md` — section 23c (§2 = the gate, live; §3 = the loop)
  * `DESIGN-repertoire-coverage.md` — section 21
  * `DESIGN-course-tree.md` — sections 24, 24b, 24c, 24d, 24e, 24f, 24g and 24h (§12 = the LIVE
    ground truth, which overrides §3.5, §5.1 and §8; §12.7 is why `sanToUci` has a
    second pass; §15 is the Lichess scan, and §15.1 is where §7's "no fetch per
    column" is LIFTED — do not quote that rule from §7 without reading it; §17 is
    the mid-run column and the one exception to §14.2's auto-take; §19 is the
    split scan, and §19.2 is the measurement that decides its one real judgement)
  * `DESIGN-key-moves.md` — sections 25, 25b, 25c and 25d (§1 = how Chessable
    stores a key range and the bug in its own handler; §5 = the write and the two
    live driver failures it exposed in SHARED code; §7 = putting a range BACK;
    §8 = why Chessable's record is per CARD and what pooling it by position costs;
    §9 = what an SRS level means, read out of Chessable's own bundle, why "how
    often has this been answered" needs the feed AND the level, and why the
    question has to be asked of the position)
  * `DESIGN-add-as-variation.md` — section 19c (§2 = the wire, and the ten live facts)
  * `DESIGN-add-as-puzzle.md` — sections 19d and 19e (§2 = the wire, incl. the
    move-PAIR fold; §6 = the clickable-line menu and why data-fen cannot be trusted)
  * `DESIGN-chessdb.md` — section 26 (§2 = the wire; §3 = the three findings the
    design rests on, and §3.1 is a do-not-reintroduce; §5 = the gate; §6.2 = why
    the alt check is deliberately NOT on this; §10 = what is still unmeasured)
  * `DESIGN-intuition-storm.md` — section 27 (§3 = the four findings, §3.3 and
    §3.4 shape the grader; §5 = the stop and pick rules; §6 = every number in
    `CONFIG.storm`, and §6.5 is the do-not-reintroduce; §7 = the eval band; §11 =
    what it must never do; §12 = what was NOT measured; §15 = the performance
    record, whose §15.2 is the three ways a statistic is wrong and plausible;
    §16 = win probability replacing centipawns as the grade, whose §16.2 is the
    calibration against the system it replaced)
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
- `sanToUci` HAS A SECOND PASS (`sanToUciRelaxed`, v0.115.0), and it is shared
  by everything here that turns a written SAN into a move — sections 13, 18,
  19, 20, 21, 22, 23 and 24. CHESSABLE OVER-DISAMBIGUATES: course 291847 writes
  `Ndb5` in a position where only the d4 knight can LEGALLY reach b5 (the c3
  knight is pinned), so the strict spelling — and what `CloSan.moveToSan`
  produces — is `Nb5`, and an exact string compare dropped the whole line. That
  was a false "could not be replayed" in the coverage report for as long as it
  has existed; ground-truthed 2026-08-19. The pass is reached ONLY after the
  exact compare has failed, which is what makes it safe: it can turn a refusal
  into a resolution and can never change a move that already resolved. It
  resolves only when EXACTLY ONE legal move survives the written SAN's hints
  (piece, from-file, from-rank, target, promotion) and refuses otherwise —
  "never guessed at" is the one rule it must not bend. `node
  dev/check-san-relaxed.js` is the control set.
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
- Course-tree Lichess panel (section 24g, v0.126.0): the panel's FOURTH host is a
  SLOT inside the course tree's own window, so the analysis board running in
  there gets the database, the engine and the repertoire badges with no second
  UI and no second start/stop decision for the engine. `topPanelHostNow()` is
  the dispatcher and it is a STRING now (`'review' | 'variation' | 'tree'`) —
  the old boolean could not name three hosts. Three things an edit elsewhere
  can break:
  * THE BRIDGE **IS** THE HOST TEST. `courseTreePanelSlot()` (assigned by
    initCourseTree) answers a rect only while the tree has an analysis board
    open, so there is no path check here — the tree already gates itself on one,
    and the other two hosts have nothing to show on a `/course/` page anyway
    (`reviewBrowseReady()` and `isVariationPath()` are both false there).
  * IT IS `position: fixed` IN **VIEWPORT** COORDINATES, alone among the panel's
    hosts, and that does not bend section 11's ban: the ban is on anchoring a
    fixed element to SCROLLING CONTENT, and the tree's window is itself fixed, so
    its slots are viewport rects by construction. Adding `window.scrollX/Y` — as
    both other hosts must — pushes the panel off screen the moment the page
    behind is scrolled. `.clo-panel--tree` is TREBLED in the stylesheet because
    it has to beat `.clo-panel.clo-panel--review` and the ≥1700px side-mode
    media query.
  * THE CLASS IS DROPPED ON EVERY HOST CHANGE, in `topPanelTickInner`. A `--tree`
    left behind would place the NEXT host with the wrong scheme entirely, which
    on a trainer page is a panel pinned to a viewport rect of a window that has
    gone.
  `syncEngine` needed no change: its `IS_REVIEW` arm already asks only that the
  panel exists and is not hidden.
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
  * …EXCEPT WHERE THERE ARE NO WINDOWS, i.e. Android. `openDriverSurface` falls back
    to `chrome.tabs.create({active: true})` when `chrome.windows.create` is absent,
    throws, or does not answer inside `DRIVER_WINDOW_TIMEOUT_MS`. The rule above is
    about HIDDEN pages, and a FOREGROUND tab is not one — do not "restore" the
    window-only path, and above all do not make the fallback `active: false`, which
    would reintroduce the exact ~1 s clamp the popup window exists to escape.
    Ground-truthed 2026-08-10 on Lemur Browser, where the panel and the overstudy
    tab work and `chrome.windows` alone is missing. The unavoidable cost on a
    single-window browser: the requester tab is backgrounded while the driver runs,
    and Android may evict it, taking the waiting popup with it.
  * EVERY FAILURE RELAY FROM THE WORKER MUST CARRY `plyIndex`. The 'load' handler
    keys its state machine on `"<oid>#<plyIndex>"` and DROPS a result that does not
    match, so an error sent without it is an error the popup never hears — Edit and
    Arrows then hang on "Reading the current comment from Chessable…" over a failure
    they were already told about. Bitten twice: the concurrency refusal, then the
    could-not-open-a-window branch (2026-08-10).
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
    …AND A FAILED PROBE MAY NOT START ANOTHER. A failure is deliberately NOT cached
    in `rightsByBid` (that would lock the course out for the session), so "unknown"
    is also what a failure leaves behind — and `applyRightsToPopup` answered unknown
    by probing again, which re-armed the watchdog, which called it again, for ever:
    a driver window every `probeTimeoutMs` and a popup pinned on "Checking edit
    rights…" with the explanation permanently one tick away. `qe.probeFailed` is the
    latch, per popup-OPEN (reopening is the retry), mirroring section 15's
    `ac.probeFailed` — that module was fixed for this loop; this half of the shared
    cache was left in it until v0.96.0.
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
  * IT IS PLACED AGAINST THE **VISUAL** VIEWPORT, never `window.innerHeight`
    (`placeFixedPopup` + `visualViewportBox`, both top level, both shared with the
    pencil). A phone's keyboard shrinks what is VISIBLE and leaves the layout
    viewport exactly as it was, and Chrome's "Desktop site" lays the page out a
    couple of thousand CSS pixels tall — so the old innerHeight clamp parked the
    popup below anything on screen, and the popup's own autofocus then raised a
    keyboard over what was left of it. It also FOLLOWS that box for as long as it
    is open (visualViewport `resize` + `scroll`, rAF-throttled, bound ONCE per
    document — buildPopup runs again on every detach, visualViewport does not).
    Both caps are written INLINE by `placePopup` and outrank the stylesheet's
    `100vh`/fixed widths, which are the layout viewport again; the edit box keeps
    its own 40vh wherever that is the smaller of the two, so a desktop window is
    unchanged. `dev/check-popup-placement.js` executes the real helpers against
    those viewport shapes — no desktop browser and no harness page can be put
    into them.
  * THE VIEWPORT LOCK IS SHARED AND KEYED BY OWNER (`lockViewport(owner)` /
    `unlockViewport(owner)` / `viewportLocked(owner)`, hoisted to top level out of
    section 22 in v0.109.0): this popup takes one while any of its fields has
    focus, the move field takes one while it is being typed into, and the LAST
    owner to let go is what restores the page's own meta. Never let either module
    own the meta again — whichever blurred first would hand the other's zoom back
    mid-edit. `closePopup` releases ours by hand: hiding a focused field does not
    reliably fire its blur, and a lock left behind costs the user pinch-zoom on
    the whole page.
  * PROMOTION ALTERNATIVES ARE REFUSED in popup and driver — the edit board's picker
    markup is UNVERIFIED, the same reason auto-play (13), section 22 and section 23
    refuse them.
  * REFRESHING THE HOST AFTER A SAVE (12c): the variation page CAN re-read in place
    and does; THE TRAINER CANNOT (`HOSTS.review.refresh` is null) and the status line
    says so instead. The page round trip is the riskiest code in this feature — once
    the pager is clicked we are COMMITTED to a navigation, so `refreshVariationPage`
    is a try/**finally** whose finally is the one unconditional step, and FALSE MEANS
    "not refreshed", NEVER "not where you were". The popup holds its SAVING ui
    (`qe.refreshing`) only until the `render` mark — `host.refresh(onVisible)` fires
    there, which is the moment the saved text is on screen — and `restore` runs
    behind it. NEVER TIE THE POPUP TO A LATER PHASE AGAIN: `restore`'s ceiling is
    9.5 s and the gate's is 12 s, and v0.99.1's "the post-visible tail is 0.7 s" was
    a measurement of one variation in a fresh tab (13.8 s on the next one tried).
    THE `render` GATE IS `variationPageSig()` (title + every move's id and SAN) PLUS
    one proof it is the fresh render — the sibling's list seen and replaced, or a
    `getGame` landing after the way back started (`fetchWatch.fresh`). It must NOT
    go back to wanting a `variationMoveShown` marker: that marker is the page
    navigating itself to move 1, which does not happen when `returnToVariation`
    comes home by the pager (route 2, no hash) — and route 2 is what EVERY tab gets
    once `history.length` saturates at 50.
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
    returns a ROLE — `'stop' | 'queue' | 'clickables' | 'retry' | 'pinned' |
    null` — and each module applies `.clo-rowprimary` in its own `sync*`, but
    ONLY to a control that is also showing. `'pinned'` (section 16b) is LAST on
    purpose: a move failed today outranks a pin that has been waiting four
    hours. Two states answer null deliberately: mid-quiz
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
  * IT OWNS TWO BRIDGES (three counting section 16b's `pinApi`, which is a
    module of its own). `mistakeLogApi` — `pending()` (not retried, not
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
- Pinned mistakes (sections 16b-16d, v0.104.0): a mistake the user marks BY
  HAND, which outlives the session and keeps coming back in the drill until it
  has been answered clean three times over three sittings. Store, steps and
  credit are 16b; the offer made right after a mistake is 16c; the floating
  launcher is 16d. The pin toggle and the Pinned group live in section 17's
  popup, and a launcher in section 20's cluster.
  **READ `DESIGN-pinned-mistakes.md` BEFORE CHANGING ANYTHING HERE.** What
  follows is only what an edit ELSEWHERE can break.
  * `chrome.storage.SYNC` (v0.105.0), ONE ITEM PER PIN, keyed
    `cloPin:<bid>:<oid>:<mkey>` — which is the whole of the cross-device
    transport: no account of ours, no host permission, no server. THE SHAPE IS
    THE FEATURE: sync caps an ITEM at 8 KB and a record measures ~480 bytes, so
    the old single-item store fit about twenty pins and then every save failed.
    In memory it is still `{ bid: { "oid:mkey": rec } }`, THE WHOLE STORE HELD
    AT ONCE and loaded in EVERY top document (v0.104.0) — 16d shows on pages
    that have no course, and one standalone pass can hold cards from several. A
    record therefore carries its own `bid`, since `unpin` and `note` have to
    find their way home from the oid a drill card knows; where it is missing
    (v0.103.0 wrote none) the item KEY is the answer.
    A DELETION IS AN ABSENT KEY AND NOTHING ELSE — there are no tombstones — so
    the pre-v0.105.0 `cloPinnedMistakes` blob is migrated ONCE and then REMOVED
    from storage.local (`migrateLegacyStore`, after the write it was folded into
    has landed). Merging it on every load instead would put every unpinned and
    every RETIRED record back, for ever. For the same reason `save()` diffs
    against what is stored and issues ONE `set` and ONE `remove`: sync counts
    write operations (1800/hour), and a pruned or retired pin leaves by being
    absent from the write.
    A browser with no Chrome Sync behind it — every Chromium fork, i.e. the
    Android side of this — does NOT fail: storage.sync there is local storage
    under another name, so the feature behaves exactly as it did before. `AREA`
    is the one remaining hedge, for a fork missing the area altogether.
    — AND THE MISTAKE LOG STILL MUST NOT GO IN EITHER OF THESE. The two look
    contradictory from a distance: the log is filled AUTOMATICALLY, so a stale
    one drills moves nobody chose, while a pin is chosen one move at a time.
    That is the whole of the exemption and it does not generalise.
  * A RECORD IS SELF-CONTAINED, never a reference into the log — which is gone
    by the next session. It carries every field `drillLine`, `moveLabel` and the
    popup's row builder need, and is ENTRY-SHAPED so all three take one
    unchanged. It also carries `isPin: true`, which is what the popup's
    `entryKey` and `defaultChecked` branch on: a pinned move and this session's
    own failure of it are two different ROWS.
  * NO TTL AND NO PRUNING except `pinMaxTotal` (180, oldest `pinnedAt`, with a
    console line). It is GLOBAL, across every course, because so is the ceiling
    it comes from (sync allows 100 KB and 512 items in total; a fat record is
    479 bytes with its key, so 213 would fill it). It REPLACED the per-course
    cap of 200 in v0.105.0 — that number came from the store being keyed by
    course, and any per-course cap under this one could never fire.
    Writes MERGE on `lastSeenAt` and apply our own removals AFTER the merge — a
    retirement is a removal, and another tab's (or another DEVICE's) stale copy
    would otherwise put a finished pin straight back.
  * `CONFIG.retry.pinSteps` IS THE SCHEDULE AND ITS LENGTH IS THE TARGET
    (30 min → 4 h → 24 h). Derived, not declared, so the two cannot disagree.
    The 4-hour step is what makes three credits three SITTINGS; the short first
    step is what makes a LAPSE come back in half an hour rather than a day out.
  * ONLY THE DRILL CREDITS (`finishDrillCard` → `pinApi.note`). Retry
    deliberately does not: it walks whole variations, where "was this move
    answered clean" is muddier than `!cr.attempts && !cr.hint`, and two credit
    sources let the gap be farmed by alternating them. Show-and-grade's
    `cleanOverride` IS accepted, or section 23 could never advance a pin.
  * THE GAP GOVERNS SCHEDULING AND CREDIT, NEVER AVAILABILITY. A pin inside its
    window is not auto-queued but is drillable from the popup, and running it
    there simply advances nothing (`note` checks the gap BEFORE stamping
    `lastSeenAt`).
  * IT OWNS ONE BRIDGE, `pinApi`, null-safe. `all(bid)`/`due(bid)` TAKE A COURSE
    and `null` means every course: the row launcher, `reviewRowPrimary()`'s
    `'pinned'` role and the popup all pass the current bid, 16d passes null.
    `isDue`/`dueLabel`/`streakLabel`/`record`/`isPinned`/`pin`/`unpin`/`toggle`
    drive the popup and 16c, and `note()` is the ONE write the drill makes.
  * `pin(entry, bid)` NEEDS A COURSE and refuses without one — a record with no
    `bid` cannot be unpinned or retired, since both start from an oid.
  * IT WATCHES `chrome.storage.onChanged` and reloads, but NOT while a save of
    its own is pending or in flight: that picture was taken before our write.
    `save()` clears `pn.saveTimer` the moment it FIRES — a spent timer id stays
    truthy, which switched that listener off permanently in any document that
    had saved once (harmless while the store was per-profile and a tab reload
    healed it; not harmless now that the other writer can be another device).
    `dev/check-pin-store.js` covers exactly this.
  * THE ROW'S launcher stays course-scoped and browse-state gated; 16d is what
    lifts that limit, and it does it by being somewhere else entirely.
  * NOTHING IS RESCHEDULED AND CHESSABLE'S BOARD IS NEVER TOUCHED — section 20's
    guarantees are what make a list this durable safe at all.
  * A PIN MUST BE DROPPABLE IN ONE CLICK. It stores `oid` + `sourceFen` + `san`
    and never re-reads the course, while sections 12/19c/19d make editing
    variations easy — `drillLine` refuses a card whose SAN will not resolve,
    which catches ILLEGAL but not CHANGED. The visible list is the mitigation,
    not cleverness.
- "Pin this mistake?" (section 16c, v0.104.0): a small body-mounted panel in the
  BOTTOM-RIGHT CORNER of the viewport, raised the moment a new mistake-log entry
  appears, offering the pin there and then. Opt-OUT (`CONFIG.retry.pinPromptKey`
  = `cloPinPrompt`, absent = ON; options-page checkbox).
  * IT MUST NOT SWALLOW KEYS — section 18b's rule, for section 18b's reason: the
    user is still playing on Chessable's board and needs MoveTrainer2's
    single-key shortcuts. Its buttons `blurButton()` themselves instead, or the
    next space would re-fire them. `blurButton` is TOP-LEVEL now, hoisted out of
    the continuation module, and shared by all three key-passing surfaces.
  * ITS SOURCE IS THE MISTAKE LOG, never a capture of its own: section 16
    already writes an entry the instant an attempt count grows, and that entry
    is everything a pin needs. `pp.since` is stamped at init so nothing already
    in the 12 h log is offered on arrival.
  * ONE OFFER PER MOVE PER DOCUMENT (`offered` + `declined`), gone by itself
    after `pinPromptMs`. It hides while `continuationActive()`.
- The floating "Drill pinned" launcher (section 16d, v0.104.0): the same corner,
  on EVERY chessable.com page, showing whenever ANY course has a pin due —
  `pinApi.due(null)`. It is the answer to 16b's course-scoped limit.
  * NOT ON A TRAINER PATH, and that is enforced TWICE: this module hides there,
    and `openDrill` refuses a standalone pass on a trainer path whatever the
    caller says. Our board over a live quiz whose timer is running is the one
    thing this feature must never do, and the row already has the launcher for
    the browse state.
  * It calls `continuationDrill(entries, { standalone: true })`.
- Pin sync through Chessable (section 16e, v0.106.0): the transport that carries
  pinned mistakes to a device Chrome Sync cannot reach — i.e. the phone, whose
  browser is a Chromium fork with no Google sync behind it. `storage.sync` stays
  the store; this is a second transport over it.
  **READ `DESIGN-chessable-sync.md` BEFORE CHANGING ANYTHING HERE** — §4 is the
  wire, established live 2026-08-12, and every fact in it was needed. What
  follows is only what an edit ELSEWHERE can break.
  * THE PAYLOAD IS BASE32, NEVER BASE64, and this is the finding that shapes the
    feature. Chessable's comment parser rewrites move-like substrings, and
    base64's alphabet contains every letter and digit a SAN is made of — a real
    payload came back with `@@SANStart@@7a3@@SANEnd@@` spliced into it. A SAN
    needs a lowercase file letter, so RFC 4648's `A-Z2-7` cannot spell one. The
    corruption is CONTENT-DEPENDENT and silent, so a synthetic test can pass
    while the feature is broken.
  * THE CARD'S MOVE IS `--`, WHICH IS WHAT MAKES IT INFORMATIONAL — `nColor: 0`,
    never quizzed, never scheduled. Change that move and the extension starts
    putting a real SRS card in the user's course. `getList` reports it with
    `moves: []`, the signature our own walk already skips
    ([lichessable.js:3169](content/lichessable.js:3169)), so it cannot pollute
    the repertoire index or the coverage report either.
  * `oid` ON THE ENTRY IS THE ENTIRE OVERWRITE. It is the one field section 19d
    must never send (`DESIGN-add-as-puzzle.md` §2.2); here it is the store.
    Without it every push CREATES, and the store forks silently.
  * PRESENCE IS ASKED OF `getList`, NEVER OF `getLesson`: a DELETED variation
    still answers the lesson call, so a user who deletes the card by hand would
    otherwise read its ghost for ever.
  * IT NEEDS TOMBSTONES AND `storage.sync` DOES NOT (`pinGoneKey`, one item,
    aged out at `pinGoneDays`). The blob is rewritten whole, so "present
    remotely, absent locally" is ambiguous — without tombstones a retired pin
    comes back for ever, or a new one is swallowed. `noteGone` is called from
    BOTH removal paths (unpin and the retirement branch of `note`); a removal
    that skips it is a deletion that undoes itself on the next exchange.
  * IT OWNS ONE BRIDGE, `pinSyncApi`, null-safe: `touch()` (a local change wants
    a push — called from the pin store's own `scheduleSave`), `now()`, `state()`
    and — since v0.131.0 — `carrier`, which is this transport offered to a
    SECOND payload (section 27's position store; `read`/`write`/`course`/
    `encode`/`decode`/`maxBytes`). That is why `cardEntry` and `ensureSlot` take
    a card NAME. The carrier knows nothing about what it carries: the payload's
    shape, its version and its merge are the caller's business, and a caller
    must respect `course()` answering null — this is the user's own Chessable
    account and `pref.on` is their switch. It CALLS `pinApi.exportAll`/`merge`, which are pure store
    operations for exactly this reason: the transport never reaches into `pn`,
    and `dev/check-pin-store.js` keeps checking both with no network in it.
  * IT STANDS DOWN WHILE `continuationActive()` — a merge can delete the card
    being drilled.
  * IT ADOPTS A COURSE CALLED "LiChessable" (`autoName`) ON A DEVICE THAT HAS
    NEVER BEEN CONFIGURED, so a second device needs no setup. "Configured" is
    `hasOwnProperty(prefKey)`, NOT `pref.on` — switching the picker to Off writes
    `{on:false}` and that is a DECISION the auto-pick must never undo on the next
    page load. Exact name match, case- and whitespace-insensitive.
  * THE OPTIONS PAGE CANNOT TALK TO CHESSABLE (different origin, no JWT), which
    is why the content script PUBLISHES the writable course list and the last
    status into `storage.local` and watches `cloPinSyncNow` for the page's
    "Sync now". The pin LIST on that page is read straight from `storage.sync`
    and needs none of this.

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
    JS. THE HARVEST IS PERSISTED (v0.108.0, `cloBoardPieces` in storage.local,
    written by `saveBoardPieceCache` and read once per top document by
    `loadBoardPieceCache` from `start()`), because section 20's standalone pass
    opens on pages that have NO board to clone from and every piece fell back to
    `PIECE_GLYPH` there. `boardPieceLive` is what keeps a live read authoritative:
    the harvest stops at twelve SEEN, not at a full map, so cached art is replaced
    if Chessable ever changes its own. Coming back it goes through `parsePieceSvg`
    — DOMParser and `importNode`, NEVER innerHTML, plus `scrubSvgNode` — since our
    own storage is still a string of markup.
    The arrow/circle geometry is chessground's, MEASURED off a live board —
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
  * THE PANEL'S SURFACE OUTLIVES THE OFFER (the resting shell, v0.111.0, §8.6a).
    In the steady landscape slot — the mid-quiz comment column, `cr.hu.shelf` — the
    panel is held on screen EMPTY (`clo-cr-heads--idle`, children `display: none`)
    for as long as the variation still has a line to point out, so raising one
    changes only what is inside the box; `showHeadsUp` then fades the CONTENT
    (`--in-content`) instead of the panel. Three consequences elsewhere:
    `hideHeadsUp` ends in `syncHeadsUpShell()`, so `resetHeadsUp` MUST clear its
    state before hiding or the shell comes back for the variation just left;
    `showOverlays` sets `cr.active = true` BEFORE its `hideHeadsUp()`, or the shell
    is put straight back over the quiz panel it just made way for (same z-index, so
    DOM order would decide); and in that slot the panel's HEIGHT is the slot's, not
    its content's — a box that grew as the offer landed is the change the shell
    exists to remove. Portrait is untouched and still wants work of its own.
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
  APPENDED to the comment of ONE OF TWO mainline moves: the one the board was
  showing when the analysis opened (`cr.an.entry`), or THE ONE AFTER IT
  (`cr.an.entryNext`, v0.110.0 — see below). Both
  are read BEFORE the overlays go up (`analysisEntryMove` → `reviewMoveDescriptor`
  — the review ply index maps 1:1 onto the edit page),
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
  the board is live behind it. THE MOVE IT COMES BACK TO IS `addTargetMove()`,
  never `cr.an.entry`: a press may have chosen the NEXT move, and `cr.an.addTo`
  is what survives the wait — which is why `resetAnSave` spends `choose` but
  deliberately NOT `addTo`.
  AFTER WHICH MOVE (19f, v0.110.0). A line worked out here is very often an
  ALTERNATIVE to the move the variation actually plays next ("1.e4 c5 2.Nc3"
  analysed from after 1...c5 in order to show 2.Nf3), and an alternative belongs
  in the comment of the move it replaces, not of the move before it. Both moves
  name the SAME position on our board — the analysis starts where the shown move
  ends, which is where the next move is played from — so `analysisLinePgn()` and
  everything under it are UNCHANGED and the text is byte-identical either way.
  Only its home moves, which is the whole of the feature.
  * SECTION 9'S ONE-BUTTON RULE, for section 9's reason. With a next move, the
    press ASKS (`cr.an.choose`) and "Add as line" is replaced by its two answers,
    "After <cur>" / "After <next>"; at the END of a variation there is no second
    answer and the button saves on one press exactly as it always has. So the
    single-press contract above is intact wherever it was ever the only option.
  * `analysisEntryMove()` returns `{ move, next }`, and BOTH hosts must report
    `next` or the chooser silently never appears. The review host takes
    `reviewMoves[plyIndex + 1]`; the variation host takes the LIST POSITION after
    the shown element, not `id + 1` — the two agree, but only the list can say
    there is no next move.
  * ESCAPE CLOSES THE QUESTION, not the board — the nearer thing to back out of,
    the same reading Escape already has in the lead-in field. That clause sits
    ABOVE `closeReview` in the document-capture handler and is scoped to
    `cr.mode === 'analysis'`.
  * The quick-edit worker matches by plyIndex and VERIFIES san + colour, so the
    next move's descriptor rides the unchanged 'save' job. `cr.an.job` carries
    the SAN now, because `resetAnSave` spends the choice before the sentence
    reporting the save is built.
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
    §3) and, since v0.99.0, the same VOCABULARY: a `--clo-line` outline. It wore
    the header's bare text until then, on the argument that an outlined button
    among `.clo-toggle`/`.clo-engine-toggle` would be the loudest thing in a panel
    whose job is to be read — withdrawn because the author was missing the button
    entirely. A control below the discovery floor is not in the tier ranking yet.
    Still no fill and no green: its salience is being the only bordered control in
    that header. Measured at 420px: 60.7x20, one 33px line desktop, 61px under
    `html.clo-touch`; `.clo-title` is `flex: 1` and absorbs the width.
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
- ADD AS VARIATION (section 19c, v0.95.0): the analysis board's SECOND write —
  the analysed line as a real trainable variation rather than a clickable line
  inside a comment, with the source variation's own plies in front of it. Both
  hosts (19 and 19b), a second button beside "Add as line".
  **READ `DESIGN-add-as-variation.md` BEFORE CHANGING ANYTHING HERE** — the wire
  shape, the ten facts behind it (all ground-truthed live 2026-08-10) and the
  arithmetic are all there. What follows is only what an edit ELSEWHERE can break.
  * THERE IS A JSON API, and this feature is the ONE write that does not go
    through section 12's driver: `POST /api/v1/importSubvariationFromSource` on
    section 5c's JWT auth. No edit page, no popup window, no worker job, no
    rights probe, no staleness guard. Do not "unify" it with quick-edit.
  * THE SERVER SPLICES THE PREFIX, comments and ARROWS included, byte-identical.
    We send only OUR moves. Nothing here may grow code that reads, rebuilds or
    posts a prefix — a variation's arrows cannot even be read outside the edit
    page, so a hand-built copy would silently lose them.
  * `plyNumber` IS ABSOLUTE IN THE GAME, never an index in the variation, and
    that is what the top-level `pliesBefore(fen)` exists for. A tactics variation
    starting `… b - - 0 34` numbers its own first ply 68. Deriving it from OUR
    start FEN is what makes a mid-game start need no special case; deriving it
    from a move number or a ply index would splice at the wrong point.
  * TWO PRESSES, deliberately unlike "Add as line"'s one (v0.43.0): this creates
    a SCHEDULED CARD, and the sentence describing it does not fit the idle status
    line beside the other write's preview. The ARMING press is what runs every
    check, so nothing can refuse between "press again" and the write.
    `disarmAddVar` is called by anything that changes what would be written; the
    plan also carries `sig` (the line's own uci string) and is refused at both
    ends if the line moved, since the board is live behind two awaits.
  * IT WRITES TO THE COURSE THE VARIATION IS IN — nowhere else. Guarded on
    `authorUid === uid` through `chessableBooksOnce` (section 5c, memoised per
    document), the same guard section 21's writes use, NOT `isRepertoire`. The
    nominated repertoire (6c) is deliberately NOT a destination yet.
  * IT DROPS THE CACHES THAT NOW LIE — `dropCourseCache(bid)` always, and
    `dropRepertoireIndexCache()` when the target IS the nominated repertoire.
    Without the second one section 6c spends up to 12 h badging the line the user
    just added as unprepared, which reads as the badges being broken.
  * `addVarPost` DOES NOT USE `chessableApiFetch`, and must not be "tidied" into
    it: that helper throws a bare "HTTP 400", and this endpoint's refusals are
    its most useful output ("Illegal SAN at subvariation[0]='Qh8' from FEN='…'",
    a colour/parity mismatch, "116 missing plies in between"). They are relayed
    verbatim. Nothing is created on any of them.
  * The start position, which "Add as line" must refuse, is LEGAL here (relative
    ply 1, no prefix, `initialFEN` from the source), so `analysisSource()` does
    its own sub-move check rather than leaning on `cr.an.entry`.
  * "OPEN IT" (v0.95.1) OPENS A NEW TAB on BOTH hosts, never navigates this one:
    the board holds a line the user may still be working on, and in a trainer
    session leaving abandons the session — MoveTrainer2 guards an unfinished one
    with its own beforeunload dialog, so a same-tab hop would put a browser
    "Leave site?" prompt in front of a button that promised a variation. Plain
    `window.open` in a click handler (a gesture, so no popup blocker, and no
    `chrome.*`, so an orphaned script can still do it — as it can still do the
    write). `cr.an.created` is set AFTER `report()`, since every report goes
    through `resetAnSave`, and is cleared wherever the sentence naming it is:
    the button and its sentence live and die together.
- ADD AS PUZZLE (section 19d, v0.97.0): the analysis board's THIRD write — the
  analysed line as a variation that STARTS ON THE BOARD'S OWN POSITION, with none
  of the moves that led there. That is what a puzzle is on Chessable: a variation
  whose `initialFEN` is mid-game. Both hosts, a third button beside the other two.
  **READ `DESIGN-add-as-puzzle.md` BEFORE CHANGING ANYTHING HERE** — the endpoint,
  the body and the facts behind them were ground-truthed live 2026-08-11. What
  follows is only what an edit ELSEWHERE can break.
  * IT IS A DIFFERENT ENDPOINT FROM 19c AND HAS TO BE.
    `importSubvariationFromSource` takes `initialFEN` from the SOURCE variation,
    always; `POST /api/v1/importGame?uid&bid` (Chessable's own /analysis/ "save to
    course") takes `head.fen`, and THAT becomes the new variation's start. Same
    section 5c JWT auth, body `{ data: "<JSON string, an array of entries>" }`.
    NEVER send `oid` on an entry — with it the call OVERWRITES that variation.
  * THERE IS NO `source` FIELD, which is the whole reason this one is more
    capable than 19c: nothing is read from the course the line came out of, so a
    puzzle can be lifted from a BOUGHT course. It therefore has NO `authorUid`
    guard and needs none — `getImportData`'s book list already IS the writable
    set (bought courses absent), and `isImportDisabled` is the one filter.
  * THE BODY WANTS MOVE **PAIRS**, not plies (`sanW/sanB/fenW/fenB/mid/isKey/…`),
    and `pairPuzzleMoves` is a FAITHFUL COPY of their client's own fold — quirks
    included: `fen` lags by a ply, and a black-first pair's would-be `fenW` is the
    position AFTER its move. Both were confirmed against a NATIVELY created
    variation, so they are the convention, not bugs to fix. Tidying either makes
    the payload something the server has never been sent. The per-ply array alone
    is refused with `500 "Column 'moves' cannot be null"`.
  * THE TARGET COURSE'S COLOUR DECIDES WHICH SIDE IS QUIZZED whatever `color` we
    send (sent 'white' into a black course, stored 'black'). DELIBERATELY NOT
    WARNED ABOUT: a puzzle that shows the opponent's move before the first move it
    asks for is normal, so the clash is usually the intended reading.
  * `fetchImportTargets`/`importTargetsOnce` (section 5c, memoised per document
    like `chessableBooksOnce`) IS THE DESTINATION UNIVERSE: `getImportData` answers
    every importable course AND every chapter of each — `books`/`chrs`, both JSON
    STRINGS inside the JSON body — in one call. Nothing else does: `getHomeData`
    knows only a chapter COUNT and `editVariations` needs a `lid` to ask. `bid` is
    ignored by the server. Its chapters come back INTERLEAVED by lid across
    courses, so the picker sorts before it groups.
  * A CHAPTER CALLED "Puzzles" IS A DEFAULT, NEVER A GATE (`PUZZLE_CHAPTER_RE`).
    The selection falls back through: last written to (`cloPuzzleDest`,
    storage.LOCAL — a standing preference), then a "Puzzles" chapter, then the
    source variation's own, then the first. The picker is read on OPEN, which is
    safe only because it is one cached GET and raises no window — the rights probe
    beside it may still never be started that way.
  * `cr.an.addPuzzle` IS ITS OWN ARM, never shared with `cr.an.addVar`: one arm
    between two writes would let a press meant for the sentence on screen fire the
    other. Both are dropped by `resetAnSave`, `anPlay` and `anRemoveFrom`, and this
    one additionally by CHANGING THE PICKER — the destination is half of what the
    armed sentence promised.
  * IT DROPS THE SAME CACHES 19c DOES (`dropCourseCache`, and
    `dropRepertoireIndexCache` when the target IS the nominated repertoire), and
    its read-back checks the START POSITION as well as the moves (`cacheKey`, so
    normalised counters are not a failure) — a puzzle stored from the standard
    position would be a different card entirely, and a silent one.
  * `courseWritePost` is SHARED with 19c and keeps the server's own words for the
    same reason; do not route either write through `chessableApiFetch`, which
    throws a bare "HTTP 400".
  * `SELECTORS.variationTitle` (`#theOpeningTitle`) is the source variation's name
    verbatim, so naming the puzzle costs no course read. The document-capture key
    swallow exempts the picker exactly as it exempts the lead-in field: arrows and
    letters are how a `<select>` is driven.
- ADD AS PUZZLE ON A CLICKABLE LINE (section 19e, v0.98.0): 19d's write, offered
  where Chessable offers "Add to Repertoire" — right-click or long-press a
  clickable move in a comment. Both hosts. Same doc, `DESIGN-add-as-puzzle.md`
  §6; **read it before touching this**. What an edit ELSEWHERE can break:
  * CHESSABLE'S `data-fen` CANNOT SEGMENT A LINE, and trusting it fails SILENTLY.
    The variation page gives every clickable move the position after it, but
    chained BLINDLY: a comment writing two branches in one breath ("4.Qxd4 e5
    4.c3 dxc3") hands the second branch's first move the position after the FIRST
    branch whenever that is legal, which it usually is. So lines are read the way
    section 18 reads them — printed MOVE NUMBERS, through `subMoveGroups` →
    `resolveLine` → `walkLine` → `branchLines`. Never from `data-fen`.
  * THAT MACHINERY IS NOW SHARED, so a change to it lands in two features:
    `subMoveGroups(els, mainEls)` takes the mainline elements to count the attach
    ply against and reads the id from `el.id || el.dataset.index`; the
    shallowest-first resolve loop is `resolveGroups(groups, fens)`, whose ORDER is
    load-bearing (a nested line anchors on its parent, looked up in the map that
    loop builds). `fens[i]` is the position BEFORE ply i.
  * NOTHING OF OURS ENTERS THEIR PORTAL. Ours is raised by our OWN capture-phase
    `contextmenu` listener plus our own long-press timer, and theirs is only
    MEASURED (`SELECTORS.subvarMenuAnchor`) to park ours under it — so ours still
    appears where theirs is disabled, which is a variation with a custom start
    FEN, i.e. exactly the tactics course a puzzle comes from.
  * THEIR BACKDROP IS VIEWPORT-WIDE (z 12000) AND OUTLIVES THE MENU, so a second
    right-click lands on IT and `closest()` finds nothing. `clickableMoveAt` falls
    back to `elementsFromPoint`, but only when the target really is inside their
    portal. Our own surfaces sit at 12002/12003, and both close on an outside
    pointerdown BY CONTAINMENT — never `stopPropagation`, since their backdrop is
    entitled to the same event.
  * THE POPUP SWALLOWS KEYS IN BUBBLE PHASE (the quick-edit popup's discipline,
    NOT the overlays' capture-phase one): that listener is gated on a run being
    active and this popup can be open with nothing running, while MoveTrainer2's
    single-key shortcuts do not skip its `<select>`.
  * ONE PRESS WRITES, deliberately unlike 19d's two: the popup IS the description
    (line, name, destination), so an arming press would only repeat what is on
    screen — v0.43.0's argument for "Add as line".
  * IT KEEPS THE LINES SECTION 18 DROPS. `puzzleLinesOf` applies no quizzability
    filter — the user pointed at this line, so a "?" on it or a line with no move
    of their own is theirs to take. Only `truncated` is dropped; branches split.
  * `closeClickableMenus()` is called from BOTH ticks on a variation change: what
    is on screen describes a line of the variation just left.
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
  A card can also come from section 16b's PINNED list — the records are
  entry-shaped, so nothing below `duePinnedMistakes()` knows the difference —
  and `finishDrillCard` grades every card against `pinApi.note` whichever list
  it came from, above its own clean-only return, since a MISS is what resets a
  pin's streak. `openDrill` dedupes by `line.key`: the two lists overlap by
  construction (a pinned move failed again today is in both) and grading it
  twice in one pass would credit it once and then refuse the second inside its
  own window.
  STANDALONE MODE (v0.104.0, `cr.standalone`) is how 16d's launcher runs a pass
  on a page with no board of Chessable's: the SAME overlays as a modal —
  `positionStandalone` centres them in the viewport over a `.clo-cr-scrim`, and
  `applyStandaloneChrome` is the ONE place the dressing goes on and off, so no
  exit path can leave a scrim over a page with no board. Three rules:
  * `position: fixed` here, which the overlays are otherwise forbidden. The ban
    in section 11 is on anchoring a fixed element to SCROLLING CONTENT; a modal
    is anchored to the viewport, like every popup in this file. Doubled class
    (`.clo-cr-board.clo-cr-standalone`) so it outranks the base rule.
  * BOTH TICKS CHECK `cr.standalone` BEFORE ANY TEARDOWN — it is the one run
    that is not about the page it is on, so no path change, variation change or
    browse-state flip may close it. Only Exit and the last card do.
  * ORIENTATION comes from the queue's first card, not `trainerUserColor()`;
    pieces come out of the PERSISTED harvest (section 11c) — this is the mode
    that needed it, since the pages it opens on have no board to clone from —
    and fall back to `PIECE_GLYPH` only on a profile that has never had a
    Chessable board on screen while the extension was loaded.
  * SIZE IS THE VIEWPORT'S SHAPE, not the device's: `standaloneMaxPx` caps a
    LANDSCAPE window only, and in portrait the board fills the width
    (`standalonePortraitMarginPx`). Asking `wantsTouchUi()` would answer the
    wrong question twice over — a phone in Chrome's "Desktop site" lays out at
    ~980 CSS px, where the old 460px cap spent half the screen on nothing, and a
    narrow desktop window wants the same answer a phone does.
  Four launchers now, three of them browse-state gated ("Drill mistakes (N)" and
  "Drill pinned (N)" on the section-18 cluster, "Drill selected" in the mistake
  popup through the `continuationDrill` bridge, which returns FALSE when it
  cannot open so the popup can say why; 16d's is the fourth and is the only one
  that is not): our
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
  board then goes off screen mid-quiz. So `lockViewport()` — top level and
  OWNER-KEYED since v0.109.0, section 12's popup holds one too — rewrites the
  PAGE'S OWN `meta[name=viewport]` to `maximum-scale=1` for as long as the field is
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
  alternatives fetch, the audio, §15 "what must never happen" and §18 "still
  open" are all there. What follows is only what an edit ELSEWHERE can break.
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
  * A `next` PRESS THE MODE CANNOT ACT ON YET IS QUEUED, NOT DROPPED (§2g) —
    four quick taps move the line four moves on. It exists because ~950ms after
    every grade (`settleMs`, then Chessable's own round trip) the phase is
    'acting' and then 'think' with `cardReady()` false, and every press landing
    there used to vanish. Both queue points are INSIDE `doNext`, the one body a
    live press and a queued press share. Only `next` is ever queued (`wrong` is a
    verdict on the card ON SCREEN and CLEARS the queue); a queued press may never
    ask for the next variation (`queueActionable` omits the browse state, and the
    queue is dropped there and at a variation change), so a tap can never answer
    a line the user had not seen.
    `onKey` IS WRAPPED IN A TRY/CATCH like `tick`'s, and for the same reason: a
    key handler that throws is SILENT — no status, no board change, nothing the
    user sees but "the mode stopped working". v0.100.0 shipped a `ReferenceError`
    on every reveal (`isNext`, left behind by lifting the body into `doNext`),
    which `node --check` cannot see and a transcription-based simulation cannot
    execute. AN EXTRACTION IN THIS FILE IS NOT SHIPPABLE ON STATIC CHECKS ALONE.
    THE RING SENDS ONE EVENT PER TAP, ON RELEASE, NEVER WHILE HELD AND NEVER
    FASTER THAN ~200ms APART (ground-truthed 2026-08-11). So no hold, long-press
    or auto-repeat gesture is buildable on the device this mode exists for — a
    hold version was built, verified live and withdrawn. NEVER act on `e.repeat`:
    v0.81.0's rule stands unqualified.
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

- The key-move lead-in (section 23c, v0.113.0): under Study **Key Moves** the
  trainer plays the whole non-key prefix ITSELF at variation load and quizzes
  only from the first key move on — so you arrive at a position with no memory of
  how you got there. This replays those plies on OUR board, at a pace a human can
  follow, with Chessable's covered, and hands over standing on the card the
  trainer is asking. Opt-IN (`cloKeyLeadIn`), its own speed (`cloKeyLeadInSpeed`),
  both in section 23's cog.
  **READ `DESIGN-key-move-leadin.md` BEFORE CHANGING ANYTHING HERE** — §2 is the
  gate and the live ground truth it rests on; §5.1 is which plies get replayed
  (a run-up shared with the one just watched is not shown twice, and only a
  SHALLOWER branch point restarts from the beginning). What follows is only what an edit
  ELSEWHERE can break.
  * IT LIVES ON SECTION 23'S BOARD AND NOWHERE ELSE (§4). With
    show-and-grade running there is nothing to hand back to — the same board
    stops replaying and starts asking — and a board of our own (a fourth
    `cr.mode` on section 18's overlays) would put a swap at exactly the moment
    the feature exists to make smooth. If the coupling ever gets worse than
    §4's measurement, HOIST THE BOARD LAYER OUT; do not move the lead-in.
  * THE GATE IS ONE COMPARISON ON THE LESSON PLAN, and it is none of the three
    candidates the design argues from. Ground-truthed live 2026-08-19: under Key
    Moves **Chessable itself clears `isUserMove` on every ply before the first
    key move**, including plies of the user's own colour. So "a ply of the study
    colour sitting before the first `isUserMove` ply" IS the mode, known at
    plan-read time, with no settings key, no latch and no observation window —
    and false on every variation of an All Moves session for ever, which closes
    §7.1's dangerous direction by construction. THERE IS NO SETTINGS KEY
    (`simpleSettingsApiData` is byte-identical between the modes; `eq_<bid>_key`
    means the course HAS key moves BUILT), and `isKey` is a course-level
    designation identical in both — it can never be the test.
  * THE COVER IS RAISED OFF A MUTATION, NOT OFF THE POLL (v0.114.0). Their board
    first moves 81 ms after the plan swaps, and a 500 ms tick plus an async
    MAIN-world read is nowhere near that — so the next variation's first card
    flashed on screen before our board covered it. A MutationObserver on the
    trainer board AND on the drawer row holding `reviewCurrentMarker` asks for the
    read at once (`leadNudge`/`leadObserve`) — and on `SELECTORS.trainerRow`,
    which is the one that has to work: a variation change may REPLACE the board
    element, and an observer left on the old one is silent rather than wrong.
    ARMED ONLY around the transition —
    while `reviewBrowseReady()` and for `leadArmTailMs` after — so a mid-quiz board,
    which mutates on every move and can never be a variation change, asks for
    nothing. Rate-limited to `leadNudgeMs`: one animation run is one read.
  * ITS PANEL PRINTS NO MOVES (v0.114.0). The prompt line is deliberately empty —
    a move list growing there was reported as distracting, and the board beside
    it is already the whole feature. The VOICE still says each move, so the step
    calls `speak` directly rather than `announce`, which is the seam that also
    writes the panel.
  * IT NEVER RUNS AHEAD OF THE TRAINER, which is what makes it impossible for it
    to show the user the answer to a card. `leadCeiling()` is `max(k, target)`
    where `target` is the furthest the trainer has been OBSERVED to reach, never
    lowered. The design first had a PREDICTION there instead (`k'` from the
    proof record); that is the same number when everything goes right and a
    spoiler when section 13 then declines those cards. Never reinstate it.
  * IT IS A DISPLAY. Nothing is played on Chessable's board, nothing is graded,
    recorded or rescheduled. Its ONE side effect is stopping the clock, and only
    after the trainer has stood still for `leadPauseAfterMs` — a blanket pause
    would be simpler and is wrong: a paused board takes no input, so section 13
    could not inject the cards it is answering underneath and §3.1's parallel
    loop would collapse into a sequential one. Never paused in a hidden tab.
  * SECTION 13 IS DELIBERATELY NOT HELD. `autoPlayHold` means "an outside feature
    owns the board and nothing is really being played on it", and here something
    really is — that is the whole loop. Do not reach for it.
  * IT OWNS ONE BRIDGE, `keyLeadInActive`, null-safe, and FOUR modules stand down
    on it: section 22 (a move typed into a board the user cannot see), 18b's
    heads-up and 16c's pin prompt (both would draw over the replay; both HIDE
    rather than dismiss), and the continuation module's own space listener —
    which stands down for `showGradeActive()` already, for the same reason and
    with the same registration-order argument, space being this feature's BACK
    key.
  * `anchor()` RETURNS EARLY WHILE IT RUNS. It walks `sg.pos` itself, from a
    position several plies behind the trainer's, and anchoring would drag the
    board straight onto the card — the one thing the replay exists to postpone.
    `endLead` clears `sg.cardIdx` and calls `anchor()` again, so the hand-over is
    where the mode picks the card back up.
  * IT NEEDS `sg.enabled` AS WELL AS ITS OWN PREFERENCE, and that is a decision:
    it renders on this board, in this panel, behind this cog, and `syncUi` hides
    the whole `.clo-sg` group when show-and-grade is switched off. So turning
    that off turns the lead-in off with it. (§5 of the design put the two
    settings in AUTO-PLAY's cog; that would be reachable in states where they do
    nothing.)
  * `playPlyOnBoard`'s post-glide reconcile reads `sg.active || leadActive()` —
    without the second half a castling rook, an en passant capture or a promotion
    stays as the glide left it for the whole replay, since the mode is off.
  * `stop()` and `startMode()` both END a lead-in before doing anything else, and
    `stop()` does it ABOVE its `!sg.active` early return — with the mode off the
    lead-in owns the board AND the pause, and `endLead` is the only thing that
    gives either back. `pagehide` calls it for the same reason.

- Course tree (sections 24, 24b, 24c, 24d, 24e, 24f, 24g and 24h, v0.127.0): the whole course as a
  POSITION-KEYED graph, browsed as Miller columns on `/course/<bid>/`, beside
  section 21's panel and sharing its `fetchCourse` session cache — so opening
  the tree after a coverage run costs no fetch. 24b scans the LICHESS DATABASE
  as you browse (opt-in) and lists the popular moves the course never answers,
  now with a WIN RATE on every row (24f); 24c is the keyboard, the find-a-line
  field and the flip; 24g runs section 19's ANALYSIS BOARD — engine, database and
  all three writes — inside the tree's own window, on any position and on any of
  those unanswered moves; 24h lists the SPLIT POSITIONS
  and offers the alternatives check that says which cards will refuse.
  **READ `DESIGN-course-tree.md` BEFORE CHANGING ANYTHING HERE** — §12 is the
  live ground truth (measured by `dev/probe-course-tree.js` over all three
  courses on the account) and it OVERRIDES §3.5, §5.1 and §8; §15 is the third
  pass and REVERSES §7 about fetching. What follows is only what an edit
  ELSEWHERE can break.
  * IT NEVER WRITES. Editing from a tree row belongs to sections 12 / 19c / 19d,
    which already do it safely — and that includes the 24b rows naming a move the
    course is MISSING, which is the most tempting place in the file to put an
    "add it" button and still must not have one.
  * KEYED ON `cacheKey`, NOT `repKey`, AND THAT IS DELIBERATE — the two
    neighbouring features really do use two different position keys. Both sides
    of every comparison here come out of `walkVariation` and are EXACT, so
    there is no reason to accept 6c's lossy key, and a column merging two
    positions that differ in castling rights would offer moves that cannot all
    be played. Measured §12.3: ZERO positions actually collapse under `repKey`
    but not `cacheKey` on any real course, so this costs nothing — it is a free
    choice, not a bet. 6c's key is right for 6c, whose review-mode FEN is
    DOM-derived and cannot be trusted about either field.
  * `isKey` IS NOT USED AND MUST NOT BE ADDED BACK. §3.5 hoped it was the
    author's own "this is the move that matters"; §12.4 measured it at 79-99%
    of plies, so it highlights nothing. It is also the ONE field that would
    need adding to `reduceCourse`'s reduced shape — i.e. a bump of
    `CONFIG.coverage.cacheKey` and a cache-wide invalidation SHARED WITH
    SECTION 21, for a signal that is noise.
  * THE FOLD IS ON BRANCHING FACTOR 1 AND NOTHING ELSE, and it is LOSSLESS.
    93-98% of a course's positions are forced (§12.1), which is where all the
    legibility comes from. `foldShow` is a DISPLAY cap, not a fold cap — §12.2:
    a model game is one unbranched line, so folding it really does produce a
    row carrying eighty plies, and every ply of a run stays clickable so the
    board can stand inside one. The fold also stops where a VARIATION ENDS, or
    the row's "line ends" tag would name the wrong position.
  * THE GRAPH CYCLES — not theoretically: §12.5 found a back-edge in a bought
    course. Hence the visited set carried down the path, `maxDepth`, and a row
    that closes a loop being MARKED rather than expanded.
  * A COURSE HAS NO ROOT (§12.6): 291847 has 39 start positions, one covering
    34 lines and 38 covering one each. The browser opens on the commonest and
    LISTS the rest — 38 one-line tactics are not a tree.
  * A COURSE WHOSE LINES MOSTLY WILL NOT REPLAY REFUSES, with them named in the
    console. Section 21's lesson: a parse detail taken at face value once
    produced a confident "0 of 77 present · 0 missing".
  * IT FILLS THE WINDOW (v0.116.0, `inset: 16px`), unlike section 21's panel
    beside it — this is not a report read while doing something else on the
    page underneath, it is a browser you are inside of. Two consequences no
    declared number survives: HOW MANY COLUMNS and HOW BIG THE BOARD are both
    MEASURED (`columnsThatFit` off `colMinPx`, `sizeBoard` off the stage's
    height), and `window.resize` redraws rather than reflows, since a resize
    changes which columns are on screen and not just their width. A column is
    capped at 360px: with the panel maximised a lone one would otherwise be
    1500px of mostly nothing, a worse read than the 197px it replaced.
  * A COLUMN WITH ONE ROW IS TAKEN AUTOMATICALLY AND NEVER DRAWN (v0.116.0,
    `columnsFor`'s `auto`) — it is the same non-decision the fold collapses
    inside a row, one level up, and a White repertoire opens with a whole
    column containing nothing but "1.e4". Standing MID-RUN is untouched: that
    case breaks out of the walk before the auto-take is reached, and since
    v0.125.0 it gets a column of its OWN instead (below). It is why a
    column carries `prefix` (the plies leading to it) and why `goTo` navigates
    through that rather than by index into `ct.path` — the path no longer
    holds every ply the columns have walked through. `standingPlies` is what
    keeps the board and the breadcrumb on the position the leftmost DRAWN
    column is about, instead of two forced moves behind it.
  * A POSITION STOOD ON MID-RUN GETS A COLUMN OF ITS OWN (24e, v0.125.0,
    `standColumn`) — the ONE deliberate exception to the auto-take above.
    Clicking a ply inside a folded run always moved the BOARD there and stopped
    at that: the frontier stayed the branching column from before the run, so
    every word on screen — the moves, the "covers N%" chip, the gap list — was
    about a position several moves back, and 24b's scan, which only ever asks
    about a column DRAWN, never read the one the user had selected. Everything
    downstream needed no change, which is the argument for putting it here:
    `renderColumns` draws it as the frontier and so calls `wantDb` for it (one
    request per column DRAWN, §15.1 UNTOUCHED — never per ply and never per
    hover), 24d turns the branch behind it into a tab, and `activeColumn()`
    picks it up for free.
    - IT MUST NOT BE MARKED `auto`, though its shape is identical (a mid-run
      position has exactly one course move, by the fold's own definition — and
      a run never passes through a line end). `auto` means "a non-decision
      nobody asked for, walk through it"; this one was asked for by name.
      `chosen` is -1, since nothing has been decided here.
    - IT MUST FEED THE VISITED SET the plies stood through before `rowsAt` is
      called: the walk breaks BEFORE `columnsFor` adds them, so without that
      the cycle guard (§12.5) is blind to exactly the plies just walked down.
  * HOVER REDRAWS THE BOARD AND NOTHING ELSE (`setPreview`): the row's own
    position with its branching move as an arrow. Never the columns —
    rebuilding those under the pointer drops the very row being hovered, so
    the `mouseleave` never arrives and the board stays stuck on the preview.
    `mouseenter`/`mouseleave`, not pointer events: a finger has no hover, and
    a tap that both previewed and navigated would flash the board through a
    position it is about to leave.
    THE ROW AND ONE PLY OF IT ARE TWO DIFFERENT QUESTIONS (v0.124.0), and
    `setPreview`'s THIRD argument is which one is being asked. The row means
    "is this move available here" — position BEFORE, move drawn as an ARROW.
    One `.clo-ct-san` inside a folded run means "what does it look like at this
    point of the line" — position AFTER, the move TINTED like a last move,
    since an arrow for a move already played is the wrong claim. Two rules
    every caller inherits: the preview is compared through a KEY that includes
    the ply (the two readings of one row differ in nothing else, so a
    field-by-field compare would leave the board on whichever landed first),
    and a ply's own `mouseleave` must RESTORE the row's reading rather than
    clear it — `mouseenter`/`mouseleave` do not fire between an element and its
    own descendant, so entering a ply button never fires the row's leave and
    coming back out never re-fires its enter. Clearing outright there would
    leave the board blank while the pointer is still inside the row.
    …AND IT MUST RESTORE ONLY WHEN THE POINTER HAS LEFT THE RUN (v0.125.1):
    the plies are NOT adjacent — a move number and a space sit between them —
    so an unconditional restore fired at every "4." and snapped the board back
    to the run's start position with its arrow before landing on the next ply,
    i.e. reading a line left to right STUTTERED through the original position
    once per move pair. The guard is `relatedTarget` still inside the same
    `.clo-ct-line`, and between two plies the right thing to say is NOTHING:
    the last ply crossed stands until the next takes over, which is also the
    correct reading right-to-left. Leaving the run for the rest of the row
    still restores, and leaving the row still clears.
  * ONLY THE SELECTED ROW NAMES ITS VARIATIONS. A column is a few hundred px
    wide, so every link wraps onto a line of its own; a name on every row is a
    wall of prose over the moves. `maxNames` is what the INDEX remembers (all
    of them, in the count's tooltip) and `linksShown` is what a row draws.
  * THE LICHESS SCAN (24b, v0.123.0) IS ONE REQUEST PER COLUMN **DRAWN**, and
    that sentence is the entire licence for it — §15.1. §7 forbade fetching per
    column on the arithmetic that "a column is a dozen positions"; a column is
    ONE position and one explorer request answers every move of it. One request
    per ROW is still refused.
    - `wantDb` is called from `renderColumns` and NOWHERE ELSE. Not from
      `columnsFor`, which walks THROUGH auto-taken and off-screen columns — that
      would turn "per column drawn" into "per column walked". Never from a hover,
      never from inside a folded run.
    - OPT-IN, off by default (`cloTreeLichess`, storage.local), read once: this
      toggle has exactly one host, unlike the filters and the touch keys.
    - It shares `cloPopularityCache` with sections 14 and 21, `popCacheTag` and
      all — which is most of why the request count is bearable. But it RE-READS
      before it writes (`flushDbCache`): `savePopCache` writes the object whole
      and this panel holds its snapshot for a whole sitting, so saving that back
      would silently delete every position the coverage report filled meanwhile.
      Section 21's window is one RUN, which is why it has never needed this.
    - A FAILURE IS REMEMBERED in `ct.db` as `{error}`, or a rejected token is one
      request per redraw for ever. Toggling off and on is the retry.
    - `refreshColumns` IS DEFERRED AND MUST STAY THAT WAY (v0.123.1). `wantDb` is
      called from inside `renderColumns`'s own loop, and `drainDb` — though
      `async` — runs SYNCHRONOUSLY once `ct.dbCache` is loaded, because its only
      await sits behind an `if`. A cache hit therefore re-entered `renderTree`
      mid-draw and the panel showed a column twice. A re-entrancy flag is the
      wrong fix: it would have to drop the inner redraw, which is the one
      carrying the new data.
    - THE EXPLORER'S SAN IS RESOLVED THROUGH `sanToUci`, NEVER COMPARED — section
      6c's v0.48.1 lesson, unchanged: Lichess writes castling as king-takes-rook
      and Chessable over-disambiguates (§12.7), so the only stable identity for a
      move is the pair of squares. One that will not resolve is dropped.
  * WHOSE MOVE IT IS DECIDES WHAT AN UNCOVERED MOVE MEANS, and `courseSide`
    CANNOT ANSWER IT. On the opponent's move a popular uncovered reply is a hole;
    on the user's own it is a repertoire decision (1…c5 over 1…e5), and drawing
    the second as a gap paints every course red for having an opinion — section
    6c's rule, for section 6c's reason. `courseSide` is a course-wide MAJORITY
    and §12.6 measured it answering 'w' for a course holding 15 Black lines, so
    the walk counts `w`/`b` PER MOVE (two ints on an `answers` entry) and
    `positionSide` sums them; a position both colours pass through answers null
    and the distinction is simply not drawn. `dev/check-course-tree.js` asserts
    this directly, because it is the judgement here most able to be wrong
    invisibly.
    AND ON THE USER'S OWN MOVE THE GAP LIST IS DROPPED, NOT RE-WORDED
    (v0.124.0, `gapsFor`'s own `'choice'` guard). Knowing the difference and
    still printing "Played here, not in the course" under the author's own move
    was the same mistake one heading away: half a dozen moves the author chose
    not to play, listed as things the course lacks. The guard is conditional on
    the course ANSWERING the position — where it plays nothing the list is the
    only thing that can be said, so it stands. The "covers N%" chip is the same
    claim and gets the same treatment: on a user move it reads "plays N%" and
    wears none of the `--thin` alarm colouring, since a sideline repertoire is
    not 88% uncovered. Both arms are asserted in `dev/check-course-tree.js`.
  * THE KEYBOARD IS BOUND ON `document` IN CAPTURE PHASE (24c) — the panel fills
    the window and is almost never focused. It stands down for a modifier chord
    and for any focused text field, so Ctrl-F and every box on the page beneath
    still work, and it is wrapped in a try/catch for section 23's reason: a key
    handler that throws is SILENT. `goShallower` navigates through the target
    column's own `prefix`, never arithmetic on `ct.path` — the auto-take rule
    above is why.
  * THE FIND FIELD STANDS ON A LINE rather than listing it (24c): the walk keeps
    `lines` (`{oid, name, startCk, ucis}`) and a match sets `rootKey` + `path`, so
    a search result is a place to carry on browsing from. The path is REBUILT
    from `answers` at navigation time rather than stored, so it cannot disagree
    with what the columns will draw.
  * IT OWNS NO BRIDGES and is called by nothing. It READS three of section 6c's
    top-level helpers for the badges — `ensureRepertoireIndex`,
    `repertoireMovesAt`, `repertoireMoveState` — all optional and additive: with
    no repertoire nominated the rows simply carry no mark. 24b additionally reads
    the shared explorer machinery — `fetchPopularityCounts`, `popCacheTag`,
    `loadPopCache`, `savePopCache`, `sanToUci`, `fenAfterUci` — all unchanged.
    6c's unprepared-reply WARNING is still deliberately absent even now that the
    popularity IS fetched: that badge is a claim about the nominated REPERTOIRE,
    and these columns are about the course on screen. 24b's own "no answer" tag
    is the same shape of statement made about the right subject.
  * THE FRONTIER COLUMN NEVER MOVES (24d, v0.124.0). A Miller browser walks
    rightwards, and here that was its one real cost: every branch taken pushed
    the only column with an open question in it one step further right, so the
    pointer chased it across the panel and the column under it changed identity
    on each click. So a column whose question is ANSWERED collapses to a TAB
    above the columns (`ct.openCols`, `renderTabs`), and the frontier takes its
    place. Three things this rests on:
    - THE FRONTIER IS THE LAST REAL COLUMN, always drawn, and it is LAST in
      `wanted` so the `columnsThatFit()` slice — which cuts from the front —
      can never drop it. `activeColumn()` (24c) already picked the same column,
      so the keyboard needed no change.
    - A TAB IS EXPANDABLE, NOT A LABEL. Clicking one puts its column back
      beside the frontier, which is what keeps "what else could I have played
      there" one click away rather than gone. Keyed by POSITION, so it survives
      a redraw and every later arrival at the same column, and cleared wherever
      `ct.expanded` is.
    - IT IS NOT THE BREADCRUMB. That says the same moves and does the other
      thing with them — it TRUNCATES the path. A tab changes what is drawn and
      nothing about where the board stands.
    `wantDb` is still called from `renderColumns` and only for a column being
    DRAWN, so this strictly REDUCES 24b's request count; the rule is unchanged.
  * WIN RATES ON EVERY ROW (24f, v0.126.0), the course's own moves and the "no
    answer" ones alike: a 5px W/D/B strip and the MOVER's score beside it. The
    share chip says how OFTEN a move is played, this says how WELL it goes, and
    the pair is the reading the scan exists for — *the author covers this and it
    scores 49%; the reply he never answers scores 58% against him.* Four things
    it imposes on SHARED code:
    - `fetchPopularityCounts` NOW ALSO RETURNS `wdl` AND `score`, and all three
      fillers of `cloPopularityCache` write them through the shared
      `popCacheEntry(got)` — sections 14 and 21 want only "how often" and ignore
      both, but whichever of the three paid for a position, the tree can read
      its win rates back.
    - STORED AS `[white, draws]` AND NOTHING ELSE. Black is
      `counts[san] - w - d`, exactly, and `popEntryWdl`/`popEntryScore` are the
      only readers — never open-code the derivation. That is not miserliness:
      the cache keeps 3000 positions of up to 50 moves in `storage.local`, and a
      third array per move is a third of a quota nobody notices spending until a
      write starts failing.
    - NO NEW CACHE KEY, deliberately. An entry written before v0.126.0 parses
      fine and is silently missing `r`, which reads as "no result data" — a
      share is still a share, and invalidating three features' caches to add a
      decoration would be the wrong trade. Instead `drainDb` treats a hit with
      no `r` as a MISS **once** and puts the split back for everyone; the hit is
      KEPT as the fallback, so a failed re-ask costs the bar and never the row.
    - THE PERCENTAGE IS THE MOVER'S (`moverScorePct`, wins plus half the draws)
      and the BAR IS ABSOLUTE, White-left. Every row of a column is played by
      the same side, so one perspective serves the column; re-orienting the bar
      per column would make two columns unreadable against each other. The
      number is plain dim text — green would read as "this is the good move",
      the one claim a raw database figure does not make.
  * ANALYSE INSIDE THE WINDOW (24g, v0.126.0). A gap row's "analyse" — and the
    header's, on whatever position is being stood on — opens SECTION 19'S OWN
    analysis board, its panel, and the Lichess panel (above) on three empty
    slots the tree measures in its own layout. The columns are replaced while it
    runs; the breadcrumb still says where in the course this is. Nothing is
    rebuilt: the board, the drag layer, the promotion picker, the engine and all
    three writes ("Add as line", 19c, 19d) are section 19's, unchanged.
    - THE "IT NEVER WRITES" RULE ABOVE IS UNTOUCHED, and this is not a loophole.
      That rule is about the TREE: a row must not grow an "add it" button. What
      a row offers is a BOARD, and a board has always written — behind section
      19's own arming presses, its own rights probe and its own read-back.
    - IT OWNS TWO BRIDGES. `continuationTreeApi = { open(given, slot), close() }`
      (section 18's, null-safe) — `open` returns FALSE when the board could not
      be shown, the same contract `continuationDrill` has and for the same
      reason: the tree's own status line is the only place that can be read.
      `courseTreePanelSlot` is the panel's (above).
    - `openAnalysis(given)` IS HOW A HOST ANSWERS FOR ITSELF. The two original
      hosts READ the page — which move is highlighted, which variation the URL
      names — and a course page has none of that markup; it has an INDEX, which
      knows the same facts EXACTLY. So `analysisStartFen`, `analysisEntryMove`,
      `analysisSource` and `analysisSourceTitle` prefer `cr.an.given` and fall
      through to their DOM paths when it is null. Every field past `startFen` is
      optional. `playUci` is the one nothing else wants: the gap move, played as
      the line's FIRST PLY rather than made the start position — the comment an
      added line goes into hangs off the move BEFORE it, so the board must open
      where the course's own last move left off.
      …AND `given` IS NEVER TAKEN ON TRUST: `openAnalysis` keeps only an argument
      carrying a STRING `startFen`, the one field a host must supply (which is
      also what `continuationTreeApi.open` already refuses without). Both
      original hosts wire their Analyse button through `() => openAnalysis()`,
      NEVER bare — a bare listener hands argument 0 the MouseEvent, and every
      reader above then takes the `given` path with nothing in it: "Add as line"
      disabled for want of an `entry`, with NO reason on screen because an Event
      has no `entryWhy` either, "Add as variation" refusing with 24g's sentence
      about no variation reaching the position, and a puzzle named ''. Silent on
      both hosts from v0.126.0 to v0.129.0, since that wiring predates the
      parameter by ninety versions.
    - THE CHAPTER IS THE ONE THING `getList` DOES NOT SAY, and 19c's body needs
      it (`target.chapterId`). `getList` ALSO TAKES A `lid` and answers that
      chapter alone (ground-truthed 2026-08-22 on course 453453: 16 + 64 = 80),
      so `fetchVariationChapter(bid, oid, cr)` reads chapters one at a time and
      stops at the oid — memoised per document like `importTargetsOnce` beside
      it. It is resolved BEHIND the open, into the very `source` object section
      19 holds, because almost no board is opened in order to write.
      `analysisSource` refuses politely when a press beats it, and it tests for
      ABSENCE, never falsity: `lid` 0 is a real chapter ("Main Level").
    - PLACEMENT IS `cr.hostSlot` (`cr.treeSlot` until v0.130.0, when section 27
      became the second guest), a FUNCTION the tree supplies, checked before
      `cr.standalone` in `positionOverlays`. Same `position: fixed`
      (`.clo-cr-inhost`) and NO scrim — the tree's window is what hides the page,
      and a second dimming layer would darken the columns the board is being read
      against. Both continuation ticks return early on it, exactly as they do for
      a standalone drill: this run is about the COURSE, not the page under it.
    - THE TREE'S KEYBOARD (24c) STANDS DOWN while it runs. Section 18's swallow
      is a capture listener on `document` too, and `stopPropagation` does not
      silence a second listener on the SAME node — so without the stand-down the
      arrows would walk the columns underneath the board and Escape would close
      the window out from under it.
    - THE PANEL IS MOVED ON THE PRESS, not on the next poll: `openExplore` and
      `exitExplore` both call `topPanelTick()` — a plain top-level function of
      this file, the same reach the tree already has to `fetchCourse` — which
      re-asks `topPanelHostNow()`. Without it a database table sits over the
      course page for up to 500 ms after the board has gone (seen live
      2026-08-22, where a driven tab's throttling stretched it to a minute).
    - THE TEARDOWN IS NOTICED, NEVER SIGNALLED. `closeReview` nulls `cr.hostSlot`
      and the tree's own tick sees `continuationActive()` go false and puts the
      columns back — a teardown that has to remember to tell someone is one that
      will eventually forget. The tree's × closes the board FIRST, though, since
      hiding the window would otherwise leave a board floating over the page for
      up to a tick.
  * SPLIT POSITIONS (24h, v0.127.0): the positions this course answers with more
    than one of the user's OWN moves — de facto alternative moves that are not
    registered as alternatives, so the trainer will refuse whichever of them the
    user plays. A `Splits (n)` toggle in the header, an in-flow list above the
    summary, `s` on the keyboard. The scan is FREE: it is a second reading of the
    index the walk already built. **READ `DESIGN-course-tree.md` §19 BEFORE
    CHANGING IT.** Four things an edit elsewhere can break:
    - WHOSE MOVE IT IS COMES FROM THE LINE, NOT FROM `positionSide`, and this is
      the one judgement here that is wrong INVISIBLY. `positionSide` answers null
      wherever both colours pass through a position — which includes the STANDARD
      START POSITION of any course holding lines for both sides. Measured (§19.2):
      on course 291847 it finds 1 split against the per-move count's 3, and the
      two it hides are "1.e4 (26 lines) / 1.c4 (2) / 1.d4 (2)" and
      "3.d4 (18) / 3.Bb5 (2)". It is RIGHT on 453453, which is why the naive
      version would have shipped. A card only ever QUIZZES its own colour, so the
      test is per MOVE: at a position with `stm` to move, count the lines WRITTEN
      FOR `stm` (`e.w`/`e.b`, which 24b added). Hence `lines` carries `side`.
      `dev/check-course-tree.js` asserts it, `positionSide`'s null at the root
      included, so a "simplification" back to it fails loudly.
    - IT STILL NEVER WRITES. Registering an alternative already has a home
      (section 12's pencil, alt tab); a split row must not grow a button for it,
      for the same reason a 24b gap row must not grow "add it".
    - `userPly` IS THE JOIN ONTO `getLesson` and nothing else validates it — a
      card's index among its OWN colour's plies. A lesson row whose SAN does not
      match the walk's move there means the join failed, and `cardVerdict` returns
      NULL rather than reporting whatever move did land at that index.
    - THE ALTERNATIVE SANs ARE RESOLVED THROUGH CloSan, NEVER COMPARED (section
      6c's v0.48.1 lesson, and 24b's): an alternative is a string the author typed
      on the edit page and Chessable over-disambiguates (§12.7). The list itself
      is a JSON-encoded STRING, not an array (section 23's ground truth) — a
      correct field name alone still reads as empty.
    AMBER, never red: a split is not an error — a repertoire covering three first
    moves is one — so the verdict wears the row palette's "you have something
    outstanding", with the word always printed beside the colour.
  * THE BOTTOM-RIGHT CORNER OF A COURSE PAGE NOW HAS THREE OCCUPANTS: this
    launcher (stacked at `bottom: 54px`), section 21's (16px) and section 16d's
    pin dock, which shows on every page and takes 16px too. 21 and 16d already
    overlapped before this existed; the stack is why this one did not make it a
    three-way. Anything else put in that corner has to solve the whole cluster.
  * ITS NARROW SHAPE IS A `@container` QUERY, NOT `@media`, and that is what
    makes it checkable: `dev/harness.html` sizes a CARD, never the viewport, so
    a media query could never fire there. The panel's width is 880px clamped by
    `100vw`, so the two rules answer identically and only one can be measured.
    Measured live 2026-08-19 at 1920x863: the panel 1873x831, a 560px board
    beside four 314px columns; under 780px of PANEL width the board goes above
    and every column but the last is hidden (§3.1's "one column plus a
    breadcrumb"), 340x411 with no horizontal overflow; `html.clo-touch` takes
    a row from 41px to 55px.

- Key moves vs difficult moves (sections 25, 25b, 25c and 25d, v0.122.0): the moves the
  user actually gets WRONG must not be the moves Chessable's "Key Moves Only"
  study mode silently plays for them. A course-page panel (`/course/<bid>/`) reads
  the key range back out of the course, reads the per-move record out of the
  Difficult Moves feed, lists the difficult moves sitting OUTSIDE the range, and
  lowers each variation's key range to cover them through the quick-edit driver —
  and, once a move stops being difficult, puts the range BACK where it came from
  (25b). Optionally it pools that record by POSITION rather than by card (25c),
  which is the only way to see a move that is hard in a line where it is never
  even asked.
  **READ `DESIGN-key-moves.md` BEFORE CHANGING ANYTHING HERE** — §1 is how a key
  range is stored and the string-comparison bug in Chessable's own handler, §4 is
  the reconstructed page-order rule and its measured error, §5 is the write, §7 is
  the restore, §8 is the spread. What follows is only what an edit ELSEWHERE can
  break.
  * A KEY RANGE IS ONLY EVER MOVED TO A PLY THIS FEATURE CAN NAME EXACTLY.
    Earlier, to a difficult move in the user's own record; later, ONLY back to
    the ply this feature itself took it from, recorded at the time. Never to an
    estimate, and never past an end mark. That is why §4's reconstruction of
    Chessable's rule may LOWER a range and may never raise one: its whole
    measured error (15%) is "later than Chessable", and later-than-Chessable as a
    RAISE stops asking for material the user is being tested on.
  * `propose()` IS THE ONE PLACE THE DIRECTION IS DECIDED, and both callers
    (`analyse` on a fresh read, `reanalyse` when a setting changes) go through it.
    It compares `needed` — the earliest difficult move in the WHOLE variation
    minus the lead — against `ideal`, which is the recorded original for a range
    this tool has moved and simply `low` for one it has not. `min` of the two,
    snapped. Reading `needed` off `outside` instead of `hard` is the mistake to
    avoid: once a range can be raised, the difficult moves INSIDE it are exactly
    what stops it going all the way back.
  * THE BASELINE STORE IS `chrome.storage.LOCAL`, not session — the whole point is
    that it outlives the sitting in which the move was hard. `low` is written ONCE
    (a second lowering must not overwrite the original, or the range could never
    get all the way back); `setTo` is where we last put it and is the record's own
    validity check — a mark that has moved since means somebody else owns this
    range now (Chessable's own recalculation, the edit page by hand), so the
    record is DROPPED rather than acted on.
  * THE DRIVER JOB CARRIES `fromPlyIndex`, the ply the mark is expected to be on,
    and REFUSES when it is anywhere else. That guard is not optional now that the
    write moves a range in either direction: "the mark is earlier than the target"
    used to be a safe surprise to shrug off and is now a legitimate instruction.
  * TWO BUTTONS, ARMED SEPARATELY (`km.armed` is `'' | 'lower' | 'raise'`).
    Lowering only ever adds to what is quizzed and restoring only ever takes away,
    so one armed press must never mean both.
  * CHESSABLE'S RECORD IS PER CARD, NOT PER POSITION (25c), and that is the fact
    the whole feature's coverage rests on: the same move in the same position is a
    separate history in every variation that plays it, and a move in a variation's
    RUN-UP is never asked there, so it can never be recorded there at all. The
    variations most in need of a lowering are the least able to produce evidence
    for it. `poolByPosition` + `spreadByPosition` (opt-in, `cloKeyMoveSpread`) are
    the answer; measured on course 453453, it takes the panel from 5 variations to
    lower to 51.
  * `difficultRowCounts(row)` IS TOP LEVEL AND IS WHY: pooling needs the two
    numbers, not the ratio — averaging six percentages would weight a 9-attempt
    card like a 56-attempt one. `difficultRowAccuracy` is now expressed in terms
    of it, so section 13b's rule is unchanged and still stated once.
  * THE SPREAD MAY ONLY EVER ADD, and the line that guarantees it is
    `if (acc >= threshold) continue` in `spreadByPosition` — a pooled figure at or
    above the bar leaves a variation's own record completely alone. Pooling raises
    a move above the bar as readily as it drops one below it (a row at 88.9% pools
    to 93.6% on the test course), and this toggle must never WITHDRAW a lowering
    the user could already see. The `min(own, pooled)` beside it only picks the
    figure DISPLAYED when both are under the bar.
  * `analyse` IS ASYNC AND YIELDS EVERY `chunkVars`, because the spread walks every
    variation with CloSan: measured 2.0 s for 80 variations synchronously, i.e. a
    frozen tab. Only the spread path yields — without it the analysis is a few
    milliseconds and the macrotasks would cost more than the work. `respread()`
    re-derives from the CACHED course and rows, so a toggle costs no fetch.
  * THE COUNT IS PRINTED BEFORE ANYTHING CAN BE ARMED (`km.spreadEl`), because the
    spread is the one setting here that can take a press from five variations to
    seventy. A chip whose figure came from elsewhere is drawn DASHED and says so in
    its tooltip: a percentage on a card with no record would otherwise read as a
    measurement of that card.
  * `difficultRowAccuracy(row)` AND `difficultPlyIndex(v, row)` ARE TOP LEVEL AND
    SHARED with section 13b. The first is the accuracy rule — timeouts dropped
    from BOTH halves of the fraction, `giveU` still counting — and it is shared
    precisely so the two features cannot disagree about which moves are hard;
    13b's `reduceDifficultRow` calls it. The threshold is 13b's too
    (`cloDifficultThreshold`). Nothing about difficulty is re-decided in 25.
    The second returns -1 rather than a guess when the SAN at the computed ply
    does not match the row's `correctMove`: that index is what a key range gets
    lowered to cover, and covering the wrong move is worse than covering none.
  * `reduceCourse` NOW CARRIES PER-PLY `keys`, and that cost a bump of
    `CONFIG.coverage.cacheKey` (`cloCourseListCache` → `…2`) SHARED WITH SECTIONS
    21 AND 24. A listing written by an older build parses fine and is silently
    missing the field, which reads as "this course has no key moves anywhere" —
    hence a new KEY rather than a version check, so old entries age out.
    Section 24's note that `isKey` "must not be added back" was about adding it
    to the TREE, where it is noise; it is this section's whole subject.
  * A KEY RANGE OPENS ON A WHOLE MOVE (§1.3, ground-truthed): a mark written onto
    Black's 1...a6 comes back stored on White's 1.h3. So the proposal is snapped
    here (`snapToMove`) rather than left for the server — the sentence on screen
    has to be what will happen, and the driver's "already covered" test compares
    the stored mark against the ply asked for, which unsnapped would answer "no"
    for ever on a variation already fixed.
  * IT OWNS NO BRIDGES and is called by nothing. It reads `fetchCourse`,
    `dropCourseCache`, `chessableCreds`, `chessableBooksOnce`, `sideOf` and
    `popupDriverBounds`, all shared and all unchanged.
  * A MOVE THE USER HAS BARELY BEEN ASKED IS COVERED TOO (25d, opt-in
    `cloKeyMoveUnproven` — a NUMBER, 0 = off, else "answered fewer than N
    times", max 5). HOW OFTEN A MOVE HAS BEEN ANSWERED IS TWO SOURCES, and each
    covers where the other is blind: the difficult-moves feed's own
    `successes` for a move that has EVER FAILED, and `level - 3` from
    `getLesson` for one that never has. DESIGN-key-moves.md §9.2 decodes the
    level out of Chessable's own bundle and the facts are shared code's
    business: **null/0 is "no record", not level zero**; the reported value is
    the internal level PLUS 3 (min 4, cap 20); and it increments once per
    sitting from a base that a failure RESETS — so for a never-failed move
    `level - 3` is exactly the number of sittings it was answered in, and for a
    failed one it is only the streak since, which is why the feed half is not
    optional (a floor on the level alone drags back 46 variations against 25).
    A finished session posts only the plies with `isUserMove`, which under
    Study: Key Moves is exactly the key ones, so a move the range hides can
    never gain a level; overstudy is level-neutral in the same code.
  * ASKED OF THE POSITION, NEVER OF THE CARD, and this is the measurement the
    feature stands on (§9.3): per card, 56 of 65 ranges on the test course go to
    ply 0 — Key Moves Only switched off wholesale — because a card's run-up is
    unanswered BY CONSTRUCTION. Pooled by position it is 24 ranges, none at ply
    0. Counts are SUMMED across every card that plays the position, the same
    pooling 25c does and with the same key (`posMoveKey`).
  * A COURSE WITH NO RECORD AT ALL PROPOSES NOTHING (`idx.empty`). With nothing
    answered every move is under the floor and the "answer" would be every range
    at ply 0. Said in words in the panel instead.
  * `propose()` TAKES IT AS A THIRD NUMBER IN THE SAME `min`, with NO LEAD
    subtracted — the lead is context before a DIFFICULT move, this is "ask this
    move", and stacking them compounds. Everything §7 says still holds for free:
    a restore is capped at the first move with no record.
  * THE FLOOR DECIDES THE READ (§9.4). At 1 ("never at all") the question is a
    boolean and `unstudied` answers it FREE — only a PART-learned variation
    costs a `getLesson` (measured: 0 on either test course). ABOVE 1 the values
    are needed, so every variation with anything studied is read (14 here, ~12 s;
    `lessonMax` = 200 is the cap, and what it drops is `unknown` rather than
    "barely asked", so it can only leave a range alone). An index built with the
    values is `exact` and serves every floor; the cheap one serves only floor 1.
  * `reduceCourse` NOW ALSO CARRIES per-variation `unstudied` and course-level
    `keyMode`, which cost the THIRD bump of `CONFIG.coverage.cacheKey`
    (`…2` → `…3`) shared with 21 and 24. (Section 27 took a FOURTH, `…3` → `…4`,
    for per-variation `paused` + course-level `allPaused`; same rule, and only
    27 reads either.) `unstudied` is `learnMW`/`learnMB`,
    ground-truthed 80/80 as the count of that variation's user moves with no
    level (and `reviewM*` as the count currently DUE).
    `keyMode` is the user's own study mode for the course (`isKeyMode`, matching
    the per-move `default_study`); the panel STATES it and nothing branches on
    it — a range still outlives a mode switch.
  * THE FIX PASS IS SEQUENTIAL AND TWO-PRESS. One variation is one driver visit —
    a focused popup, a page load, a submit — so it is a watchable, stoppable queue
    with a local watchdog per variation (section 19's rule: the worker's job timer
    does not survive an idle restart) and a `maxWrites` cap. Section 19c's arming
    press, for section 19c's reason.
  * THE CORNER OF A COURSE PAGE NOW HOLDS FOUR THINGS: this launcher (92px),
    section 24's tree (54px), section 21's coverage (16px) and 16d's pin dock
    (16px, every page). A fifth has to solve the cluster rather than add an offset.

- ChessDB eval column (section 26, v0.128.0; side by side with Stockfish and
  colour-coded since v0.129.0): a cloud-analysis eval beside every
  move in the Lichess panel — where the explorer says how OFTEN a move is
  played, this says how GOOD it is, at book depth, with no WASM and no engine
  running. OPT-IN (`cloChessdbEval`, storage.local, absent = off; checkbox in the
  panel's own cogwheel menu, section 6b, where the panel's other preferences
  live). It is the SECOND host permission this extension has ever had.
  **READ `DESIGN-chessdb.md` BEFORE CHANGING ANYTHING HERE** — §2 is the wire,
  §3 the three findings the design rests on, §6.4 the side-by-side engine
  section, §7.1 the colour ramp and the ruling it reverses, §10 what is still
  unmeasured. What follows is only what an edit ELSEWHERE can break.
  * IT IS TWO REQUESTS PER POSITION AND THAT IS NOT WASTE (§3.2/§3.3). `learn=1`
    scores EVERY legal move but computes the unknown ones on the spot; `learn=0`
    scores only what is really in the distributed book. NOTHING INSIDE A
    `learn=1` ANSWER DISTINGUISHES THE TWO — measured, the on-the-fly fills
    routinely carry a HIGHER `note` than the real book entries beside them, and
    `rank` is 0 for both. So "is this eval trustworthy" is answerable only by
    asking twice, which is what `book` on each entry records and what
    `.clo-cdb--est` draws. Collapsing this to one request silently turns every
    estimate into a claim.
  * THERE IS NO DEPTH FIELD, and both candidates look exactly like one (§3.1).
    `querypv`'s `depth` is the PV LENGTH (34/34, 24/24, 49/49 measured) and the
    `note`'s first number moves the opposite way from it. Neither is comparable
    to `CONFIG.engine`'s depth 30. Do not write a depth gate against them.
  * THE WORKER ALLOWS `queryall` AND NOTHING ELSE (`handleChessdbFetch`,
    background.js). `queue` and `store` are this API's two WRITES — they spend a
    volunteer network's compute, ground-truthed live (a queued position came
    back analysed ~25 minutes later) — so the guard is an allow-list of one
    rather than a block-list, and nothing may reach them from a poll or a scan.
  * SCORES ARE THE MOVER'S; THE PANEL IS WHITE'S. `cdbEvalText` flips on Black's
    move, because the engine section directly above the table is normalised to
    White (in engine.js) and two conventions in one panel is one too many. This
    is the opposite call from 24f's mover-score, which has no engine beside it.
  * THREE SCORE BANDS, and a plain centipawn read is wrong in two of them: a
    mate is `30000 - distance` (mate in 1 = 29999) and a TABLEBASE result is
    ~`25000 - DTZ` (KRK win in 22 = 24978, note `(W-0022)`). Without the bands a
    rook endgame prints "+249.78" — a plausible-looking number that never
    throws. The lettered note is the authority; the numeric band is the fallback.
  * THE EXPLORER'S UCI IS RESOLVED THROUGH CloSan BEFORE THE LOOKUP, never
    compared raw — section 6c's v0.48.1 rule, from the OTHER side of the same
    trap. Lichess writes castling king-takes-rook (`e1h1`); ChessDB writes
    `e1g1`, which is what CloSan and every index in this file use. So the CDB
    map is keyed by ChessDB's own uci and each Lichess row is resolved with
    `sanToUci` into that spelling (`tr.dataset.cdbUci`). A raw compare misses
    exactly the castling rows, and SUCCEEDS everywhere else.
  * `cdbWanted()` IS A PRIVACY GATE BEFORE IT IS A BUDGET ONE. The column is
    opt-in because chessdb.cn is a SECOND third party seeing the position, so
    nothing may ask on a user who has switched nothing on. Since v0.129.0 the
    only exception is the `chessdb` SOURCE, which has nothing else to fall back
    to; `auto` was in that clause and must not go back — the companion's gate is
    `cdbCurrent()`, which requires the column, so an `auto` user with the column
    off would have every position sent twice for an answer nothing ever reads.
  * IT NEVER DELAYS THE LICHESS TABLE. `requestCdb` is fired from `refresh()`
    ABOVE the explorer cache short-circuit (so a cached position still gets its
    evals) and is deliberately NOT awaited; the cells are drawn empty and filled
    by `fillCdbEvals()` a round trip later. `state.cdbFen` is what stops a
    previous position's evals painting onto the current rows — never assume it
    equals `state.fen`, which is the whole reason `cdbCurrent()` exists.
  * COLOUR: A GREEN<->RED RAMP (v0.129.0, §7.1) — which REVERSES v0.128.0's
    "plain dim text, never green" on the author's instruction. What the old
    ruling leaves behind are the ramp's constraints, and all four are
    load-bearing: it is WHITE'S PERSPECTIVE, the same as the digits, so it says
    which SIDE is favoured and never "this is the good move" (a green "−1.5" is
    the version 24f's ruling was right about); the tone is computed IN
    `cdbEvalText` off the same `signed` value as the text, never by a second
    function reading the text back, because a colour disagreeing with the sign
    beside it is completely silent; the hues are its own (`--clo-ev-*`), never
    the accent green or `--clo-rep-risk`, since the repertoire badges are 9px
    marks one column over; and `eq` sets NOTHING, so an equal position stays
    plain dim text.
    A TONE SETS `--clo-ev-tone`, NEVER `color`. Each host reads
    `color: var(--clo-ev-tone, <its own default>)`, which is what keeps the ramp
    out of every specificity fight in the stylesheet — no doubled selector, no
    order dependence, and Stockfish's own numbers stay uncoloured by simply not
    being given a tone. `applyEvalTone(el, tone)` is the one writer.
  * IT NO LONGER REPLACES STOCKFISH UNDER `auto` (v0.129.0, §6.4). The two run
    SIDE BY SIDE: the search keeps the section's big numbers, the book is
    painted beside its lines at 11px, plus a labelled head chip carrying the
    book's OWN best (read off `cdbBestMoves(1)`, not off pv 1 — the two
    disagreeing is most of the value of showing both). `chessdb` is untouched
    and still owns the section outright; `local` still sees nothing. Four rules:
    - THE JOIN IS `pv.uci`, which `engine/engine.js` now sends beside `pv.san` —
      that san is a numbered STRING ("5.Nf3 Nc6 …") and joins onto nothing.
      Both Stockfish and ChessDB spell castling `e1g1`, so 6c's v0.48.1 trap,
      which is LICHESS's `e1h1`, is not on this path.
    - THE `cdbPending` HOLD IS NOW `chessdb`-ONLY. It existed to stop `auto`
      booting a WASM engine for the ~400 ms before the book answered; under
      `auto` Stockfish is what is being started, so there is nothing to wait for.
    - THE BOOK CAN LAND AFTER THE SEARCH (cached explorer data, engine already
      running). `state.enginePvs`/`enginePvsFen` keep the last update so
      `applyCdbAnswer` can repaint the companion, and the fen guard is what
      stops one position's lines being annotated with another's evals.
    - HIERARCHY IS THE FEATURE: 15px/600 head and 13px lines for the search,
      11px and dim for the book. A "tidy-up" that equalises them removes the
      whole point. `.clo-engine--cdb` carries the per-line column, so with no
      book the section is byte-identical to the pre-v0.129.0 one — measured 0
      overflow at 300/330/360/420 px, desktop and touch.
  * UNDER `html.clo-touch` THE GAMES COLUMN IS HIDDEN when this column is on,
    and that is a measurement, not a preference: the four-column touch table is
    already at the edge (330px panel: needs 328, has 328) and at the panel's own
    300px minimum it overflows by 11px unaided, so a fifth column does not fit.
    Games yields because % says the same thing and the exact count is kept in the
    percentage cell's tooltip. Anything added to this table has to re-measure.
  * IT ALSO ANSWERS THE ENGINE SECTION (§6.1, `cloEngineSource`:
    `auto` | `chessdb` | `local`, options page) — under `chessdb` OUTRIGHT, and
    under `auto` beside Stockfish (the bullet above; §6.4). `syncEngine`
    branches BEFORE its ordinary analyze: under `chessdb`, with the book able to
    answer, it fills the same three lines from `queryall` (already cached) plus
    one `querypv` per line, and Stockfish is never started. Four rules an edit
    elsewhere can break:
    - THE GATE IS `cdbEngineReady()`, i.e. "at least one move here is in the
      book", never a depth (§3.1). Under `chessdb` nothing is ever booted, which
      is that state's whole purpose, so an unknown position gets a sentence
      rather than a search.
    - `syncEngine` HOLDS WHILE AN ANSWER IS IN FLIGHT (`state.cdbPending`,
      compared on `cacheKey`) — SCOPED TO `chessdb` since v0.129.0, where it
      buys the promise that state exists for. The hold is released in a
      `finally`, because a hold that outlives its fetch is an engine section
      that never starts at all.
    - `applyCdbAnswer` CALLS `syncEngine()`. The source decision is not
      answerable until the answer lands — before it, `cdbEngineReady()` is
      false for want of data rather than because the book is ignorant.
    - THE EVAL COMES FROM `queryall`, NOT from the `querypv` replies. queryall
      already scored every move from the PARENT's mover perspective; taking the
      child's score instead means negating it back up a ply, which is the kind
      of arithmetic that is wrong in one case out of four and looks right in
      the other three. The pv reply is used for its `pvSAN` continuation only.
    The section is LABELLED "ChessDB" whenever it is the source, and the depth
    slot says `book · N ply line` rather than borrowing the word "depth" for a
    number that means something else entirely.
  * IT OWNS NO BRIDGES and is called by nothing. It reads `cacheKey`,
    `sanToUci`, `fenAfterUci`, `CloSan` and the panel's own `state`/`ui`, all
    unchanged.
  * EVERYTHING FAILS SOFT: an unreachable host, a rejected fetch, or a position
    ChessDB has never seen (the ordinary case off theory, and for most tactics
    courses' custom start FENs) leaves an empty column and nothing else changed.

- Intuition storm on the repertoire's frontier (section 27, v0.130.0): the
  positions your own course lines END on, carried forward by REAL games, one
  at a time against a clock — Chessable teaches a line and stops, and this asks
  what you do on the move after it stops. A move is graded for being DECENT
  rather than for matching an engine. Launched from the COURSE TREE's header
  (24), on a full-window panel of its own; the board is section 18's overlays in
  a fourth mode.
  **READ `DESIGN-intuition-storm.md` BEFORE CHANGING ANYTHING HERE** — §2 is the
  wire, §3 the four findings the whole design rests on, §5 the stop and pick
  rules, §6 the probe's measurements (every threshold in `CONFIG.storm` is one
  of them) and §7 the eval band. `dev/probe-storm.js` still runs the entire
  pipeline against the live APIs and is how any rule change is re-measured;
  `--frontiers` is the cheapest question in the file to ask of a new course.
  What follows is only what an edit ELSEWHERE can break.
  * **IT MUST NEVER CALL CHESSDB'S `queue` OR `store`, and this is the single
    most tempting place in the codebase to break that rule.** The walk stops on
    `unknown` ten to twelve times per fourteen frontiers, and "ask them to
    analyse it" is one URL parameter away; those two actions spend a VOLUNTEER
    NETWORK's compute (DESIGN-chessdb.md §2.4 — a queued position came back
    analysed ~25 minutes later), and a storm would spend it in bursts of
    hundreds. `handleChessdbFetch`'s allow-list in background.js is what makes
    them unreachable, and it must stay an allow-list.
  * IT NEVER WRITES TO THE COURSE (section 24's rule, and this feature has the
    same tempting button one line away — "add this position as a puzzle" from a
    storm card; 19d/19e already do that safely from a BOARD), never touches
    Chessable's board, and reschedules nothing.
  * NO NUMBER IT SHOWS MAY BE PRESENTED AS A BOOK EVAL. It grades on `learn=1`
    only, where a real book entry and an on-the-fly fill-in are indistinguishable
    (DESIGN-chessdb.md §3.3) — which is fine for RANKING a move against the other
    moves in the same position, and is why one request per position is enough —
    so the verdict line wears `.clo-cdb--est`, section 26's existing "computed
    for us just now" styling, and says so in its tooltip.
  * IT NEVER SHOWS THE SAME POSITION TWICE (`st.seen`, keyed `cacheKey`).
    Measured, not theoretical: duplicates arrive from two different games in the
    same run.
  * THE HOST PERMISSION IS ONE PATH PREFIX, NOT A HOST. `https://lichess.org/*`
    is the extension's third, and unlike the other two that host also serves the
    user's whole account — so `clo-fetch-game`'s guard is
    `https://lichess.org/game/export/` and nothing else, and `ALLOWED_URL_PREFIX`
    was not widened. The masters PGN path
    (`explorer.lichess.org/masters/pgn/<id>`) needs NO new permission and stays
    worth having: it is the fallback the session switches to wholesale
    (`st.mastersOnly`) the first time a game export fails. That path also needs
    the worker's `as:'text'` read — `handleExplorerFetch` called `response.json()`
    unconditionally — and deliberately does NOT require a token, since an early
    401 there would make the no-permission fallback need the very thing it
    exists to work without.
  * `fetchExplorerData` MUST KEEP `topGames:'0'`/`recentGames:'0'`. The panel
    fetches on every position change and wants nothing it will not draw; the
    storm makes its OWN explorer call with them on, and with RELAXED filters
    (`C.speeds`/`C.ratings`, never the module-level `lichessFilters`) — §6.4
    measured 5 of 14 frontiers with no games at all under the user's own bands.
  * IT DOES NOT TOUCH `cloPopularityCache`, and that is a deliberate departure
    from the design's §9. That cache is tagged with `lichessFilters` and a moves
    limit; the storm asks with different filters and `moves: '0'`, so it has
    nothing correct to write there and 24b's `flushDbCache` hazard cannot arise.
  * TWO PERSPECTIVE FLIPS, IN OPPOSITE DIRECTIONS, AND THE CHILD-NEGATION
    FALLBACK ARE THE SILENT FAILURES. `stormUserEval` reads a ChessDB score (the
    MOVER's) from the user's side and flips on WHOSE MOVE IT IS IN THE POSITION,
    never on which colour the course is for — the two are usually opposite, and
    getting it wrong inverts every frontier into a tidy column of backwards
    numbers (it did, in the probe's own `--frontiers` block; §6.5).
    `stormMoverCp` does the same for a STOCKFISH score, which engine.js has
    already normalised to WHITE — so the two conversions run opposite ways in
    one feature. And `stormMoveLoss`'s fallback is `best + childBest` because
    the child's best is the OPPONENT's; written as a subtraction it is wrong by
    twice the child's eval, which looks entirely plausible.
    `node dev/check-storm.js` executes all three.
  * GRADING HAS THREE TIERS AND THE THIRD IS NOT OPTIONAL (§3.4, §14.8). The
    position's own scored list, then one `queryall` on the position after the
    move, then TWO Stockfish searches. Measured live 2026-08-28: three answers
    in a row on course 291847 were ungradeable without the third tier, because
    §3.2's 98% coverage is a measurement over REAL continuations and the child
    of an ARBITRARY move is a position no game ever reached.
    - `engineDepth` IS A CEILING, `enginePhaseMs` IS THE LIMIT (§14.23,
      v0.149.0). A search that runs out of its budget is TAKEN at whatever depth
      it has reached, never discarded — which is what this tier used to do, and
      why it answered `No verdict` on EVERY card from v0.130.0 to v0.148.0.
      Measured live 2026-08-29: one depth-20 MultiPV-3 search took 20.7 s on the
      author's desktop, so a PAIR of them under one 20 s watchdog was
      unsatisfiable by arithmetic, and the job died holding a perfectly good
      depth-17 evaluation. The failure is silent by construction — a slow
      machine and an ignorant ChessDB both print "No verdict" — so
      `dev/check-storm.js` §10 executes the whole state machine.
      Three rules follow and each is a way the fix could be wrong:
      THE REPLY IS CAPPED AT `job.bestDepth`, what the position ACTUALLY
      reached, because a subtraction across two depths is the cross-evaluator
      mistake one size down; a pair further apart than `engineDepthSlack` is
      REFUSED (the cap means the reply can only be equal or shallower, and
      shallower FLATTERS the move played); and the depth §14.20 names is
      `Math.min` of the two, the one that ran and never the ceiling.
    - IT IS TWO SEARCHES, NEVER ONE. A loss is a SUBTRACTION, and taking
      `best(P)` from ChessDB's book while taking `best(P after m)` from
      Stockfish puts the systematic offset between two evaluators — easily wider
      than the whole `goodCp` band — straight into the verdict. For the same
      reason an engine-graded line names the ENGINE's best move and score and
      prints NO win rate, which is a book figure.
    - IT CLAIMS THE SHARED ENGINE THE WAY SECTION 15 DOES (`state.altCheckBusy`
      set with `state.engineFen` nulled first, so `syncEngine` stands down and
      sends no stop), and `endEngineJob` is the ONE place that gives it back —
      on the answer, on the timeout, on an engine error and on `endSession`. A
      leaked claim is a panel whose engine never starts again.
    - ITS WATCHDOGS ARE SECONDS, NOT MINUTES, unlike the alt check's: that one
      is a popup being read, this is a card with a clock running. There are TWO
      and the ordering is load-bearing — `enginePhaseMs` per search,
      `engineTimeoutMs` over the pair as a BACKSTOP for a worker that answers
      nothing at all, and `gradeTimeoutMs` over the whole grade with two ChessDB
      round trips in front of it. Each must outlast the one inside it or the
      inner one can never fire; `dev/check-storm.js` §10 asserts the chain.
  * THE CARD CARRIES EXACTLY ONE PLY, the position's own best move, and that is
    load-bearing rather than decorative: `startLine` ends in `step()`, and an
    EMPTY ply list reads there as "this line is already finished", so the card
    would be skipped the instant it reached the board. `tryMove`'s storm arm
    intercepts ABOVE the comparison, so that ply is never used as an answer —
    only as what makes a card a card, and as the "best" the verdict line names.
  * IT OWNS TWO BRIDGES AND IS HANDED A THIRD. `stormActive()` — the course tree
    stands down on it, by HIDING its own window (same size, same z-index; two
    full-window panels at once is a state that should not exist) and so, for
    free, by its keyboard's existing `ct.panel.hidden` guard. `stormApi`
    (`open({bid,name})`, `answer(uci,san)`, `pass()`, `close()`) — `open` returns
    FALSE when a session cannot start, the contract every launcher here has, and
    `answer`/`pass` are what section 18's `tryMove` and Skip call. And
    `continuationStormApi` (`open(card, slot)`, `next(card)`, `verdict(v)`,
    `close()`), which section 18 owns: the traffic goes BOTH ways because each
    side does something the other cannot — 18 owns the board and the panel, 27
    owns the queue, the clock and the grade.
  * `cr.treeSlot` IS NOW `cr.hostSlot` (+ `cr.hostKind`, `'tree' | 'storm' | ''`)
    and `.clo-cr-intree` IS NOW `.clo-cr-inhost`. Nothing about the mechanism
    changed — 24g's rules are unchanged and apply to both guests — only the name,
    which was about to describe one of two hosts. `positionInTree` is
    `positionInHost`.
  * THE LAUNCHER IS IN THE COURSE TREE'S HEADER, not the corner: that corner
    already holds four things (25 at 92px, 24 at 54px, 21 at 16px, 16d's pin dock
    at 16px on every page) and a fifth would have to solve the cluster rather
    than add an offset. The tree is the right host anyway — it already holds the
    reading of the course the storm's stage 0 is about.
  * THE PLY RANGE IS A USER SETTING (§14.9, `cloStormMinPly`/`cloStormMaxPly`),
    and the pure walks never learn that. `cfg()` is `CONFIG.storm` with the
    user's range folded in, built per call and handed to `stormWalkGame` /
    `stormRandomLine` — so those stay pure and `dev/check-storm.js` keeps
    executing them against a config it declares itself. The selectors show only
    when NO clock is running: changing the range mid-session would describe an
    exercise the queued positions are not from.
  * A FRONTIER WITH NO GAMES GETS AN INVENTED LINE (§6.4's 5-in-14), never a
    preferred one: `stormRandomLine` is reached only when the explorer answers
    with nothing. It picks at random among ChessDB's own top moves — within
    `randomTopCp` and at most `randomTopN` of them — and that band is what keeps
    it plausible; a uniformly random legal move reaches positions no player
    does, which is what §5.1's blunder stop keeps out of a real walk. Its
    candidates carry `invented: true` and the panel SAYS so, because "N moves
    past the line" is a claim about somebody's game and here there is none.
    The blunder stop cannot fire on this walk by construction; `decidedCp` and
    the unknown stop are what bound it.
  * `stormCandidate` AND `stormAdvance` ARE SHARED BY BOTH WALKS. That is the
    point: the two differ only in how the next move is chosen, and a second copy
    of the seven pick numbers is a second place for a rule to be subtly
    different.
  * THE REVIEW (§14.10) KEEPS EVERY ANSWERED CARD (`st.history`, capped at
    `reviewMax`) and is up INSTEAD of the stage once the clock has run out. Its
    board is section 11c's STATIC one (`.clo-cr-mini`), with the best move drawn
    in GREEN and the played one in RED where they differ — section 11c's three
    caller rules apply, and the second is the one to watch: `paintShape` takes a
    colour KEY or a CSS value and dropped anything else SILENTLY until v0.80.0.
    `dev/harness.html`'s own arrow helper now resolves the same keys, or a
    replica could not be written in the terms the code is.
    THE BEST MOVE IS HIDDEN UNTIL ASKED FOR (§14.10a, v0.132.0): a "Best move"
    button, or `b`. THREE SURFACES HIDE IT AND ALL THREE MUST AGREE — the green
    arrow, the `stormBestLine` half of the legend, and the LIST's own best
    column, which is the one that would otherwise spoil every position at once
    rather than the one being looked at. The flag is on the ITEM
    (`item.shown`), so it is per position and a position seen for the first
    time is always hidden. The user's OWN move is never hidden — the red arrow
    and `stormVerdictLine` are what make the position worth thinking about.
    IT ALSO KEEPS THE CARD THE STORM ENDED ON (§14.10c, v0.138.0). `st.history`
    is filled by `finishAnswer`, which an unanswered card never reaches, so
    `endSession` pushes `st.card` itself — FIRST, above everything that clears
    `st.card` or `st.grading`, both of which it reads — on EVERY route out. Two
    rules: `nextCard` nulls `st.card` on its board-refused path, so the review
    can never show a position nobody saw; and `stormVerdictLine` needs its
    `v.unanswered` arm ABOVE `passed`, or the ordinary branch prints "your move"
    about a card that was never answered. Nothing is scored and `storeNote` is
    deliberately NOT called — the position keeps its place in the store exactly
    as if it had never been drawn.
    …AND THE POSITION CAN BE PLAYED AGAIN (§14.10b, v0.138.0): "Try again", or
    `t`, puts a review item back on section 18's storm board — same mode, same
    single ply, same three tiers — and scores NOTHING: no points, no streak, no
    clock, no `storeNote`, no second `st.history` entry, and the row's own
    verdict (the move played under the clock) is left as it was. Four things an
    edit elsewhere can break:
    - `grade` IS NOW A DISPATCHER over `runGrade(card, uci, san, alive, finish)`
      and `gradeTiers(card, uci, alive)`. The two callers differ ONLY in those
      two arguments; a second copy of the tiers is a second place for them to
      fall out of step, and both answers would be plausible numbers.
    - THE ATTEMPT IS NUMBERED (`st.retrySeq`, bumped by `toggleRetry`,
      `retryAnother` and `endRetry`, and closed over by `alive`). A retry is
      MEANT to be repeated, so a grade still in flight from the last attempt
      would otherwise print over the position just put back — the alt check's
      `reqId` problem, and its answer.
    - IT IS EXCLUSIVE WITH `st.analysing` and each closes the other; both want
      the stage's slots, and stepping to another review row closes both.
      `panelSlot()` stays gated on `st.analysing` ALONE, so no database follows
      a retry board — its top move would name the answer (section 20's rule).
    - SECTION 18 KNOWS ONE THING ABOUT IT, `cr.stormRetry`, set by
      `open(card, slot, opts)` and cleared in `closeReview`. It changes only the
      words `syncStormUi` prints — every one of the timed ones ("No idea", "End
      storm") names a session that is over — and turns Skip into "Try another
      move", which `stormApi.pass()` routes to `retryAnother()`.
  * WHICH OF THE THREE TIERS GRADED A CARD IS SAID (§14.20, v0.147.0). §3.4's
    three sources are of wildly different strength and arrived wearing ONE
    treatment and ONE tooltip; DESIGN-chessdb.md §3.3's rule read forwards says
    three claims must not be presented as one. THREE things an edit elsewhere
    can break:
    - IT IS ON THE **SECOND** LINE (`stormBestLine`), never the verdict line —
      that one is read in about a second with a clock running (§16.3) and its
      one provenance clause ("by the engine") MOVED off it. All three sources
      are named, not only the odd one out: naming just the engine is what left
      'list' and 'child' reading as the same claim.
    - `.clo-cdb--est` IS NO LONGER UNCONDITIONAL. It means "ChessDB computed
      this for us just now" and nothing else, so it is true of both ChessDB
      tiers and FALSE of the engine — which is §3.3's rule broken the other way
      round, and how it shipped from v0.130.0. `stormEstimated(v)` is the one
      predicate BOTH display hosts read (section 18's `syncStormUi` and section
      27's `renderReview`); `stormSourceTitle(v)` is the three sentences.
    - THE DEPTH COMES OFF THE ENGINE JOB (`job.depth`, resolved once, carried
      out through `endEngineJob`'s answer), never from `CONFIG.storm.engineDepth`
      at render time — that would name a profile which may not be the one that
      ran. It does NOT ride §15's wire: that record counts bands, not sources,
      and `statsWireVersion` stays 2.
  * `stormCp`, `stormVerdictLine` AND `stormBestLine` ARE TOP LEVEL AND MUST
    STAY THERE — and since v0.147.0 so are `stormEstimated`, `stormSourceLabel`
    and `stormSourceTitle`, for the same reason and with the same reach. Section 18's panel prints that line while a card is up and
    section 27's review prints it again afterwards — two closures, so a helper
    living in either one is a `ReferenceError` in the other. `node --check`
    cannot see it and neither can a sliced check, which flattens every scope
    into one; it shipped and threw at the first teardown (2026-08-28).
    `dev/check-storm.js` §0 asserts the indentation instead.
  * THE PANEL HAS A FIFTH HOST, and it is the same placement as the fourth.
    `stormPanelSlot` is a SECOND supplier beside `courseTreePanelSlot`, both
    read through the top-level `inHostPanelSlot()`; `topPanelHostNow()` still
    answers `'tree'` for either, because the two differ only in which window
    measured the rect and a second host string would need a second placement
    branch doing exactly the same thing. The storm's third slot exists ONLY
    while the review's analysis board is up — during a card the database's top
    move would name the answer, which is section 20's reason for leaving the
    panel's ordinary stand-down in place.
  * THE POSITION STORE IS WHAT MAKES A SESSION START AT ONCE (§14.11,
    `cloStormPositions` in storage.local, `{ [bid]: { [ck]: entry } }`). Finding
    a position costs ~11 ChessDB requests and the store is where that is paid
    once instead of once per session; measured live 2026-08-28, the first card
    went from ~50 s to 3.1 s in the same tab.
    - `produceFromStore()` RUNS BEFORE THE NETWORK PATH IS CONSIDERED, and must:
      it needs no request and no await, so taking it second means every session
      opens on a frontier walk with answers already sitting in storage.
    - `stormPack`/`stormUnpack` use SHORT KEYS and keep EVERY scored move. The
      tempting saving — the top few — is invisible: `stormMoveLoss` then misses
      the user's move and falls through to a fallback that was the exception.
    - `saveStore` RE-READS BEFORE IT WRITES (24b's `flushDbCache` lesson in a
      second store): one object lives under that key and a write replaces it
      whole, so only this course's slice is ours to replace.
    - THE RETENTION RULE IS THE USER'S OWN (`stormRetain`, `storeDropOn`): a
      position answered WELL leaves, one MISSED stays and comes round again, and
      an UNGRADEABLE one stays too — it taught nothing either way, and dropping
      it spends eleven requests to meet the same silence twice.
    - …AND LEAVING THE STORE IS NOT THE SAME AS NOT COMING BACK (§14.16,
      v0.142.0). THE PRODUCER'S WALK IS DETERMINISTIC — same frontier, same
      games, same ChessDB answers, same positions — so a position dropped by the
      rule above was re-harvested by the very next pass, re-stored (the store no
      longer held it, which is the only thing `storeAdd` was checking) and
      offered again. "It is unlikely to be found again" is the exact opposite of
      true here. `stormDone(gone, ck, C, now)` is the guarantee and the
      TOMBSTONE LIST is what it reads — the same `st.gone` §14.12's merge
      already kept, asked at all THREE points a position can enter a session:
      `storeAdd` (the write), `harvestCandidates` (the offer — the one place a
      fresh walk reaches a board) and `produceFromStore` (defensively, deleting
      rather than skipping). It AGES the tombstone itself, since only
      `saveSyncMeta` prunes; a zero timestamp is "no record", never "retired at
      the epoch". `goneDays` (60) is therefore a RETIREMENT HORIZON now, not
      housekeeping.
    - THE TOMBSTONE MUST SURVIVE THE TAB. `saveSyncMeta` was called from
      `syncStore` AND NOWHERE ELSE, so on a device with no carrier course — or
      one whose pull was not due — every retirement died with the page. It is
      written at `endSession` beside `saveStore`, and capped locally at
      `goneMaxLocal` (6000, oldest out): the wire's `goneMax` is 400 and is a
      PAYLOAD bound, which as a horizon would cover about twenty sessions.
    - THE RANDOM FACTOR IS `stormPickGames`, AND IT IS NOT THE GUARANTEE.
      `harvestFrontier` took `games.slice(0, gamesPerFrontier)` and the
      explorer's answer is stable (four top games in rating order, four recent
      behind), so every frontier was asked the SAME question for ever and a
      second gather's "nothing new to store" read as the course being exhausted.
      Eight games two at a time is 28 pairs. Pure and rnd-injected,
      `stormDrawFrontier`'s shape; a partial Fisher-Yates over a COPY, index
      CLAMPED — an out-of-range pick puts `undefined` into the walk and fails
      three steps later inside `askPgn`, complaining about the explorer.
    - A GATHER WALKS MORE OF THEM (`gatherGamesPerFrontier`, 4, chosen off
      `st.gathering` in `harvestFrontier`; §14.17.3). The two numbers exist
      because the two passes pay with different things: a SESSION spends the
      user's own waiting time, a GATHER has ten times the budget and nobody
      waiting. Four of the EIGHT the explorer returns, not all — half is what
      leaves a different draw for the next pass, which is the point above. It
      needed no budget change and that is a MEASUREMENT (§6.1's ~9.8 ChessDB
      requests per frontier at two games, so ~20 at four; a 50-frontier course
      is ~1000 against `gatherMaxCdb`'s 4000, and `gatherTarget` stops a big one
      first).
    - A PASS REPORTS ITS FUNNEL, NOT JUST WHAT IT KEPT (§14.17, v0.143.0).
      `st.gathered` counts NEW stores, and three completely different passes
      produce the same "2 new" — a store already full, a course ChessDB does not
      know, and a pass with nothing to walk. So every branch that discards
      something counts it (`stormFunnelBlank`/`Bump`/`Why`, reported by
      `stormFunnelNote` in the status line and `stormFunnelLines` in the
      console). THE FOUR CANDIDATE OUTCOMES ARE EXHAUSTIVE —
      `examined === rejected + retired + dup + stored` — and that conservation
      is what `dev/check-storm.js` asserts, which is why it now executes two
      IMPURE functions (`harvestCandidates`, `storeAdd`, with `st`/`C` injected
      through `__setEnv`): the invariant lives in that function's control flow
      and nowhere else, and a fifth `continue` added there and counted nowhere
      leaves every individual number still looking plausible. `stormFunnelBump`
      and `stormFunnelWhy` are NULL-SAFE because the producer runs with no
      funnel at all. The funnel belongs to the PASS and is nulled when it
      reports, or a session's own walks would go on adding to it.
    - …AND A MISS COMES BACK AT THE **BACK** OF THE QUEUE (§14.15, v0.137.0).
      `stormStoreDraw` sorts `k` ASCENDING — unseen first, most-missed last —
      which REVERSES v0.130.0's hardest-first order; do not restore it. Because
      the rule above already drops anything answered well, every `k > 0` entry
      is a position the user has been shown and got wrong, so hardest-first
      opened every session with the same failures and starved the fresh material
      the gather pass paid ~11 requests each for. A REVERSED COMPARATOR IS
      SILENT — every position is still returned, in a plausible sequence — which
      is why `stormStoreDraw` is pure and rnd-injected (`stormDrawFrontier`'s
      shape) and `dev/check-storm.js` executes it. `stormWirePack`'s own
      `k`-descending sort is NOT the same question and stays: there it decides
      what is worth CARRYING under the byte budget, where a failure count is
      information that cannot be regenerated and a fresh position is
      interchangeable with any other.
    - A PULL, OR A GATHER PASS, MUST FEED THE SESSION IT LANDS IN (§14.13).
      Both fill the store BEHIND a `storeDraw()` that has already happened —
      the exchange is fired unawaited from `startSession`, and a gather CLEARS
      the queue — so each ends by re-drawing `st.storeQueue` and calling
      `produceFromStore()`. Re-drawing the whole store is safe and is the point:
      every key already queued is in `st.seen`, which is what that function
      filters on, so nothing incremental has to be got right. Without it a phone
      that syncs nine positions still spends a minute walking frontiers past
      them (reported live 2026-08-28).
    - THE GATHER PASS IS THE SAME `harvestFrontier`, deliberately: a second walk
      written for gathering is a second set of pick rules that will one day
      disagree about what a usable position is. It has its own request ceiling
      (`gatherMaxCdb`) because it is the burst the user asked for BY NAME, and it
      ENDS whatever session is running — `tick` returns early while it runs, so a
      session left alive underneath burns its clock with no board and no way out
      (seen live).
  * THE STORE IS CARRIED BY SECTION 16E'S TRANSPORT (§14.12) through
    `pinSyncApi.carrier` — a bridge rather than a hoist, because which course,
    the JWT, the informational-card shape, base32-not-base64 and the `oid`
    overwrite are all decided there and decided once. `cardEntry` and
    `ensureSlot` took a `name` parameter for it; nothing else in 16e changed.
    - THE MERGE IS A UNION, SO IT NEEDS TOMBSTONES. Without them a position the
      retention rule dropped comes back from the other device's snapshot on
      every exchange, for ever. `storeNote` records one on every drop whether or
      not syncing is on — it costs a timestamp and is needed the moment it is
      switched on.
    - IT IS READ-MERGE-WRITE, IN THAT ORDER. The card is a snapshot overwritten
      in place, so writing first discards whatever the other device put there.
    - THE SAN IS DROPPED ON THE WIRE and recomputed from the uci — about a third
      of the payload, and the recompute is once per exchange rather than once per
      session, which is why the LOCAL store keeps its SANs. A move whose uci will
      not resolve is DROPPED rather than carried with a blank SAN.
    - `maxWireBytes` IS MEASURED, not inherited: 162460 base32 characters written
      to a comment and read back byte-exact, still base32-clean and still
      informational (2026-08-28, course 453453; the test card was deleted and the
      course re-read to prove it). 16e's own 120000 is untouched.
  * PAUSED LINES ARE NOT STORMED (§14.14, v0.136.0), and the filter is ONE line
    in `stormFrontiers` — which is why it covers the gather pass too, both
    producers drawing from that function, so nothing paused can enter the store
    either. THE WIRE FIELD IS `paused` AND THE APP DOES NOT CALL IT THAT: read
    out of Chessable's public bundle 2026-08-28, the variation card's own test
    is `1 == e.paused` on the getList row, while the redux store renames it
    `isPaused` and `isCPaused` is optimistic post-toggle state — grepping for
    either finds the UI's name and misses the wire's. ONE FLAG, TWO WORDS:
    "PAUSED" for a pausable line and "SKIPPED" for the rest, both meaning the
    user asked not to be asked, so no second condition. The count rides back on
    the returned ARRAY (`frontiers.paused`) rather than changing the return
    type. `allVariationsPaused` is carried by `reduceCourse` as `allPaused` and
    is used ONLY to word a refusal — its relation to the per-variation flag is
    unmeasured, and a course-level flag able to HIDE lines must not be guessed
    at. NOT reached: the store, since `produceFromStore` runs before the course
    is read (§14.11's whole point) — bounded, not fixed, and §14.14 says what
    fixing it would cost.
  * …AND A WALK THAT COMES BACK INSIDE THE REPERTOIRE STOPS THERE (§14.18.4,
    v0.145.0). The same failure one ply later: a real game is free to leave the
    course at the very first move the course had an answer for, and the card
    that produces looks exactly like a good one. `stormReentered` is the
    lookup, `stormFrontiers` now carries its own continuation index out
    (`out.cont`) instead of dropping it, and both walks take it as a PARAMETER
    — never a closure over `st`, which is what keeps stage 2 executable with no
    network. THREE things an edit elsewhere can break:
    - THE TEST IS SCOPED TO THE USER'S OWN MOVE, and that is the rule's whole
      precision rather than an optimisation. The index holds every ply's
      `before`, the OPPONENT's included, so an opponent-to-move position in it
      means only that the course has a reply prepared for what the opponent is
      ABOUT to play — if they play something else the user really is
      unprepared, which is the good half of this feature. Removing the guard
      still stops walks, still looks plausible, and silently discards exactly
      those positions.
    - IT IS COVERED BY A DIFFERENT MECHANISM FROM ITS TWO NEIGHBOURS, and that
      asymmetry will look like an oversight. The paused filter (§14.14) and the
      stub filter (§14.18) live INSIDE `stormFrontiers`, so both producers get
      them for free; a walk is not inside it, so this one is threaded through
      `harvestFrontier` — the shared entry both passes reach the walks through
      — by `frontierCovered(f)`. Anything that ever walks by another route must
      pass the index itself.
    - IT IS A STOP, NOT A REJECTION, and the walk stops AT the position: the
      position itself is not offered either. It gets its own row in §14.17's
      `stops` table, so how often it fires is a number before it is an
      argument. THE STORE IS NOT RE-FILTERED — positions harvested by an older
      build age out through the retention rule and the tombstones.
  * A LINE THAT ENDS WHERE ANOTHER ONE CARRIES ON IS NOT A FRONTIER (§14.18,
    v0.144.0) — the transposition stub and the publisher's "- Introduction"
    card, which stop at a position other lines of the same repertoire play on
    from. Storming one walks a real game forward from a position the course
    already answers, so the user improvises where their own book has a move.
    Measured: 8 of 33 frontiers, 8 of 72 and 1 of 6 on the account's courses.
    Like the paused filter it is INSIDE `stormFrontiers`, so it covers the
    gather pass and the store for free, and its count rides back on the array
    (`frontiers.covered`). TWO ASYMMETRIES WITH THE SOURCE EXCLUSIONS BESIDE IT,
    and they are not oversights: a CUSTOM-FEN line and a PAUSED one can both be
    the CONTINUER though neither may be a SOURCE — those rules answer "is this
    line a usable frontier" and this index answers "does the course say anything
    else here". It is SIDE-SCOPED for the same reason the frontier's own side
    is (24h's rule): a line of the other colour moving there is the same board
    met from the other end. `walkVariation` therefore runs ABOVE every source
    test — ONE WALK, TWO USES — which costs +20% on a model-game-heavy course
    (3.59 s → 4.31 s for 81 variations in node) behind the existing `chunkVars`
    yield. NOT reached: a walk RE-ENTERING the repertoire after the frontier,
    which is a different and much larger question (§14.18.3).
  * NOTHING IS SHOWN UNTIL "Start" IS PRESSED (§14.13, v0.135.0), and the gate
    is ONE line at the top of `nextCard` (`if (!st.started) { render(); return; }`).
    Every route into the first card — `produce`'s finally, the store path in
    `startSession`, the sync refill — goes through that function, so barring it
    once bars all of them; a second gate elsewhere is how the two would come to
    disagree. The `render()` in that early return is what enables the button as
    the queue fills. The pre-roll exists because gathering is a REAL alternative
    to playing and used to be a race against the producer: the first card starts
    the clock, so a session could begin under a decision the user was still
    making. `gather`'s "end whatever is running" arm and `nextCard`'s
    `st.gathering` guard both STAY — they cover a gather pressed mid-session,
    which this does not.
  * HOW OFTEN ANYBODY REACHES A LINE END WEIGHTS THE STORE (§14.19, v0.146.0) —
    §4's other half, paid for out of a reply the storm already fetches:
    `askGames` now hangs the position's own `white + draws + black` off its
    returned array, `harvestFrontier` keeps it on the frontier, and `stormPack`
    stores it as `g`. FOUR things an edit elsewhere can break:
    - `stormStoreDraw`'S EXISTING KEYS ARE UNTOUCHED and the new term goes
      BETWEEN them: `(a.k - b.k) || (b.reach - a.reach) || (a.r - b.r)`. §14.15
      is the rule — a re-weighted comparator there is silent from the outside —
      so `k` ascending stays primary and the random term stays last. It also
      took `C` as a THIRD PARAMETER for the bucket's `reachTop`, rather than
      closing over the module-level one, which is what keeps it executable in
      `dev/check-storm.js`.
    - UNKNOWN IS THE TOP BUCKET, deliberately. Absence means "not recorded" and
      never "zero games" (§14.16's rule for an older build's entry) — and every
      position stored before v0.146.0 is unknown, so demoting them would freeze
      an existing store out of every session until it had been gathered again.
      The same rule runs the whole way down: `askGames` answers null, not 0, on
      a reply with none of the three fields, and `stormPack` writes `undefined`.
    - IT RIDES THE WIRE with NO `wireVersion` bump — it is not re-derivable on
      the far device without another explorer request, and absence is already
      read as unknown everywhere, so an old payload stays valid. The merge takes
      a figure the other device has and never overwrites one it holds; unlike
      §15's counters there is nothing to double-count, this being a property of
      the position's frontier rather than of the device.
    - IT IS REPORTED, NEVER PUT ON A LIVE CARD. Two hosts only: the gather's
      CONSOLE breakdown (a third reason table — it stays out of
      `stormFunnelNote`'s one-sentence status for that function's own reason)
      and the review row's TOOLTIP. A card has one job.
  * WALKING DEEPER IS REFUTED BY MEASUREMENT (§6.5) — `minPly` 6 left 291847's
    survivors at +1.62/+1.87/+1.08/+1.20 and tripled the cost per position,
    because a one-sided frontier HOLDS its advantage rather than dissipating it.
    Do not retry it. `spreadMaxCp` is at 300 rather than 200 for the opposite
    reason: it fired once in 54 candidates, and a value implying it does
    something would be the misleading one.

  * THE VERDICT IS WIN PROBABILITY LOST, NOT CENTIPAWNS (§16, v0.141.0), and
    there are FIVE bands. `userHiCp` admits positions up to +200 and a centipawn
    is not worth the same there as at equality — giving up 100cp from +500
    leaves you winning, and the old flat 30/70cp rule called that the same thing
    as giving up 100cp from 0. **READ DESIGN-intuition-storm.md §16 BEFORE
    TOUCHING THE GRADE**; §16.2 is the calibration table. What an edit ELSEWHERE
    can break:
    - `wpK` (0.00368208) IS LICHESS'S OWN FIT AND IS NOT A DIAL. Changing it
      re-scales every band at once and completely silently, since the verdicts
      stay plausible. `dev/check-storm.js` §3 pins it by its CONSEQUENCES — the
      curve's fixed points, and that the two scoring bands still land on the old
      `goodCp`/`decentCp` at equality (33cp and 65cp against 30 and 70, within
      5cp). That last assertion is the one that makes this a change of MEANING
      rather than of difficulty, and it is what a re-tuned constant or a
      mistyped threshold would quietly lose.
    - EVERY SCORE IS CLAMPED TO ±`wpClampCp` BEFORE THE CONVERSION, which is why
      a mate needs no band of its own: ChessDB writes one as ~30000 and the
      engine tier as `engineMateCp`, and at ±1000 the curve is already at 97.6%.
      Removing the clamp runs the arithmetic on numbers thirty times the board's
      own scale.
    - `stormMoveLoss` COMPUTES THE `wp` ITSELF, from the two scores it already
      holds, and both are certainly the mover's. A caller pairing one number
      from the book with one from somewhere else is exactly the cross-source
      mixture §3.4's two-search rule exists to prevent.
    - A PENALTY IS FLAT AND THE TEST IS THE SIGN, not a list of verdict names
      (v0.139.0's rule, restated so a sixth band cannot be given a multiplied
      penalty by accident). `finishAnswer`'s STREAK follows the same sign: it
      extends on positive points, resets on negative, and holds on zero — so
      `ok` holds it because zero points is what the middle band MEANS, and
      `unknown` holds it by the older argument.
    - A PASS IS A `blunder`. "I have no idea" costing less than a bad move would
      make passing the way to protect a streak.
    - `storeDropOn` IS THE TWO BANDS THAT SCORE (`great`, `good`). An `ok`
      answer keeps its position: nothing was gained by it.
    - THE FIVE BANDS ARE ONE COLOUR RAMP, defined ONCE in the stylesheet beside
      `.clo-st-revrow--*`, with `.clo-st-bar-*` reading the same five tokens —
      green, dim green, neutral, amber, red. Section 18's panel deliberately
      draws only TWO of them (green for the two that score, red for the two that
      cost, nothing for `ok`): that line is read in about a second with a clock
      running, so the colour answers "did that score or cost" and the WORD
      carries the degree.
    - §15's RECORD COUNTS BANDS, so this changed its shape too: `a/g/o/b/x/u`
      for `g/d/m/u`, `statsWireVersion` 2 so a version-1 payload is REFUSED
      rather than misread (every field it has is a field this one also has),
      `found` is the two bands that SCORE, and the stored loss is in TENTHS OF A
      POINT of win probability — an average over centipawns would be an average
      over a quantity whose meaning changes with the position it was measured
      in, which is the whole reason the grade stopped using them.
    - THE PICK RULES ARE STILL CENTIPAWNS (`blunderCp`, `decidedCp`,
      `spreadMinCp`, `spreadMaxCp`) and were deliberately left alone: they
      decide which positions are OFFERED, which is a different question, and
      every one is a `dev/probe-storm.js` measurement. §16.5 records the one
      place the same objection does apply — `spreadMinCp` buys ~15% less at +200
      than at equality — and why fixing it needs the probe re-run rather than an
      argument.
  * A SESSION CAN BE SCOPED TO ONE CHAPTER (§14.21, v0.148.0) — §15 named the
    worst chapter and left a whole-course storm as the only response. It is a
    FILTER, not a producer: `stormFilterStore` narrows the store and
    `stormFilterPool` the frontier pool, and nothing about how a position is
    found, graded, stored or counted changes. FOUR things an edit elsewhere can
    break:
    - FILTER THE INPUT, NEVER THE ORDER. The scope must not become a term in
      `stormStoreDraw`'s comparator — §14.15's rule, whose whole point is that a
      re-weighted comparator there is silent from the outside. `storeDraw` hands
      that function a smaller store; §14.19's reachability term is untouched.
    - `stormFilterPool` COPIES THE ARRAY'S OWN PROPERTIES, and a plain
      `.filter()` is the bug waiting there: `stormFrontiers` hangs `paused` and
      `covered` (the refusals) AND `cont` off its result, and `cont` is what
      `frontierCovered` reads for §14.18.4's walk stop — so the one-liner
      switches that stop off for every scoped session, invisibly.
    - THE POOL IS FILTERED AFTER THE WALK, never before it. The walk is what
      knows which lines end where and is also what §14.18's stub index is built
      from, so narrowing its input would change what "the course answers this
      position" means. It is also why `stormFrontiers` now records EVERY oid on
      a frontier and caps only the NAMES — that cap was always a display cap,
      and a capped oid list answers the chapter question wrongly for a frontier
      four lines converge on.
    - A NARROW FILTER CAN STARVE AND IT MUST BE SAID (`stormScopeNote`, checked
      BEFORE the existing refusals, since a scope is the only cause there the
      user chose one press ago). A stored position with no oid is EXCLUDED and
      counted, never included on the benefit of the doubt: it could be from
      anywhere. `stormAgain` KEEPS the scope and now takes an optional spec, so
      both Again listeners are wired `() => stormAgain()` — 24g's bare-listener
      trap.
  * THE PERFORMANCE RECORD (§15, v0.140.0): every graded answer counted against
    the LINE whose frontier the position came from, rolled up per CHAPTER and
    per COURSE, and carried between devices on 16e's transport. **READ
    DESIGN-intuition-storm.md §15 BEFORE CHANGING IT** — §15.2 is the three
    silent failures, §15.3 why it is a card of its own. What an edit ELSEWHERE
    can break:
    - THE COUNTERS ARE PER DEVICE (`cloStormDevice`) AND SUMMED ONLY ON READ.
      The wire merge is a UNION over a whole snapshot, so a merge that ADDS two
      devices' totals adds them again on every later exchange — while the
      numbers stay plausible and keep growing, which is what working also looks
      like. A device's own counters are monotone, so `max` on `n` is exact.
      `dev/check-storm.js` §9's "a second exchange adds nothing" is the
      assertion that catches it.
    - `unknown` IS OUT OF BOTH HALVES OF THE FRACTION. It is a verdict about
      ChessDB, not about the user — `finishAnswer` scores it nothing and holds
      the streak for exactly that reason — so counting it as a failure marks the
      user down for the book's ignorance and counting it as a success flatters
      them. A row with nothing graded reads "—", never "0%". `unanswered`
      (§14.10c) is refused outright, and a review RETRY (§14.10b) is not counted
      at all: `statNote` is called from `finishAnswer`, never from the shared
      `runGrade`.
    - AN AVERAGE LOSS IS A MEAN OVER ANSWERS, NEVER OVER LINES. `stormStatRoll`
      sums the raw `ls`/`lc` pairs and divides once; averaging a chapter's
      lines' averages weights a line answered once like one answered forty
      times.
    - IT KEYS ON THE OID, so `stormFrontiers` now carries `oids` beside `names`
      and `stormPack` stores `o`. `reduceCourse` was NOT touched — the oid was
      already in its reduced shape — so `CONFIG.coverage.cacheKey` needed no
      fifth bump. A position stored before v0.140.0 has no oid;
      `backfillStoreOids` names it from the course listing `startSession` reads
      anyway, BY NAME, and refuses a name that matches two variations — what it
      cannot name is counted under one "Line not recorded" row rather than filed
      under a guess.
    - THE CHAPTER COSTS REQUESTS AND IS BEHIND A PRESS. `getList` does not say
      which chapter a variation is in (that is why 24g's `fetchVariationChapter`
      exists), so grouping a course is up to one request per chapter — cached
      for good in `cloStormChapters`. It can only answer for a course the user
      can ADD to, `getImportData` being the only call that enumerates chapters
      and bought courses being absent from it; that refusal is said in words.
    - THE VIEW MAY NOT BE UP WHILE A CARD IS. Section 18's board is pinned to
      the STAGE's slots in document coordinates, so hiding the stage under a
      live card leaves a board floating over the table. Enforced twice — the
      settings row that holds the button is hidden while a clock runs, and
      `toggleStats` refuses on `st.card`.
    - IT IS A CARD OF ITS OWN ON THE WIRE, never a field in the position card:
      that payload is CUT to fit its budget, so a statistic folded into it would
      be dropped whenever a position list ran long, silently and after the
      requests were spent. NO TOMBSTONES, unlike that card, and that is not an
      oversight — a line leaves this record only by `stormStatsPrune`, a
      function of its own timestamp that every device applies to the same
      numbers, so the union converges by itself.

- SECTION 25 CHANGED TWO THINGS IN THE SHARED QUICK-EDIT DRIVER, and both fixes
  apply to the comment, alternative-move and arrows jobs as well
  (`quickEditSelectMoveEl`, hoisted out of `quickEditSelectMove` — which now just
  calls it and returns the textarea):
  * THE MOVE IS SELECTED BY ID AND THE CLICK IS RETRIED. Chessable rebuilds
    `#interactivePGN` shortly after the page boots, so a click on the node the
    driver was handed can land on one already DETACHED and do nothing at all.
    `moveClickTries` / `moveClickRetryMs` bound the retry; a click that keeps not
    taking is a failure to report, not a thing to keep doing.
  * THE SIDE-TO-MOVE CHECK CANNOT PROVE A SELECTION, and it was the only check
    there was. The position a click STARTS from usually already has the side the
    target move would leave behind, so it passed for a click that never happened —
    and the driver then read the fields of whatever move was selected before.
    The proof is Chessable's own `moveActive` class on the target
    (`SELECTORS.editMoveActiveClass`); the side check stays as a SECOND condition,
    being what says the BOARD followed rather than merely the list.

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

After touching section 25's proposal rule — `propose`, `snapToMove`, `plyBase`,
`plyColor`, the baseline store, 25c's `poolByPosition` / `spreadByPosition`, or
25d's `buildProvenIndex` / `fetchLessonLevels` / `feedTimesByPly`:

```
node dev/check-key-moves.js
```

Same discipline as the other checks: it EXECUTES the shipped `propose`, sliced
out by `dev/slice-source.js`, over the five steps of the scenario 25b exists for
(a range lowered to cover a difficult move, the move recovering, the range going
back) plus the partial restore, the no-baseline invariant, the lead setting, the
move-pair snap, and 25c's pooling. Both interesting cases are close to
unreachable from a live session — one needs a range this extension lowered weeks
ago, the other needs a move to have stopped being difficult since.
It also executes 25d's index against a fake `getLesson` and fake feed rows,
which is where the two-source rule and the cost rule live: a failed move is
counted from the feed rather than from its RESET level (the case the combined
predicate exists for), counts pool by position across cards, `unstudied`
answers floor 1 with no call at all, and a lesson that will not align — or a
variation past `lessonMax` — is UNKNOWN rather than "barely asked", so it can
never lower a range on no evidence. Three more controls, each failing on
exactly its own assertions: reverting `propose`'s arm (5), letting an untouched
variation count as answered (3), and dropping the feed half of the count (2).

THREE CONTROLS, each of which must fail on exactly its own assertion: 25b
reverted (fails the two raise cases), `own.acc = acc` in place of the min (fails
only the displayed-figure case), and the `acc >= threshold` guard weakened (fails
only "a comfortable pool leaves an own record below the bar alone"). The second
of those is why the first version of these checks was rewritten: it asserted the
min was what made the spread additive, and passed against a source where it was
not.

After touching section 26's ChessDB fold, its score bands or its colour ramp —
`parseCdbAnswer`, `cdbEvalText`, `cdbTone`:

```
node dev/check-chessdb.js
```

Same discipline: it EXECUTES both, sliced out by `dev/slice-source.js`, against
answers in the shape the live API returns. It also asserts the WORKER's action
allow-list, read straight out of `background.js` — `queue` and `store` are this
API's two writes and must stay unreachable, and a hidden automated tab cannot
exercise the `querypv` path at all. Every failure mode here is SILENT —
a missing band prints a mate as "+299.99" and a rook endgame as "+249.78", a
lost perspective flip inverts every Black-to-move position into a tidy column of
backwards numbers, and losing the `learn=0` half presents on-the-fly guesses as
book evals. Controls run 2026-08-27 — perspective pinned to White, the mate band
disabled, and a truthiness test in place of the `typeof score === 'number'`
check — each failing on exactly its own assertions (4, 4 and 3), the last of
those including "a score of 0 counts as book", which is the one a truthiness
bug gets wrong in both directions at once.

Since v0.129.0 it also covers the green<->red RAMP, which fails in the same
silent way and for the same reason: `cdbEvalText` returns the tone alongside the
text, so the check asserts the two AGREE across the whole score range and in
both perspectives rather than case by case — a perspective bug in one band only
is exactly what a hand-picked list of cases misses. Controls run 2026-08-27:
`cdbTone(entry.score)` in place of `cdbTone(signed)` (the tone losing the
perspective flip) fails on 8 assertions, six of them the range sweep; collapsing
the mate/tablebase steps into the ordinary ramp fails on 6.

After touching section 27's producer — `stormFrontiers`, `stormDrawFrontier`,
`stormUserEval`, `stormPgnMoves`, `stormPickReject`, `stormMoveLoss`,
`stormMoverCp`, `stormGrade`, `stormPoints`, `stormCandidate`, `stormAdvance`,
`stormWalkGame`, `stormRandomLine` or `stormCard` — or the verdict line it
prints (`stormCp`, `stormVerdictLine`, `stormBestLine`), or the position store
and its wire (`stormPack`, `stormUnpack`, `stormRetain`, `stormWirePack`,
`stormWireUnpack`, `stormWireMerge`) — — or the GRADE ITSELF (§16: `stormWinPct`, `stormWpLoss`, `stormGrade`,
`stormPoints`, `stormWp`, and `CONFIG.storm`'s `wpK`/`wpClampCp` and five
bands), whose every failure mode is a verdict that still grades every move —
or the PERFORMANCE RECORD (§15:
`stormStatApply`, `stormStatPlus`, `stormStatSum`, `stormStatRoll`,
`stormStatRate`, `stormStatLoss`, `stormStatsMerge`, `stormStatsPrune`,
`stormStatsWirePack`, `stormStatsWireUnpack`), every one of whose failure modes
is a plausible percentage — or the CHAPTER SCOPE's two filters (`stormFilterPool`,
`stormFilterStore`, §14.21, whose pool filter written as a plain `.filter()`
silently switches §14.18.4's walk stop off) — or the STORE'S DRAW ORDER
(`stormStoreDraw`, §14.15: a
reversed comparator returns every position in a plausible-looking sequence and
is otherwise undetectable from the outside) — or the REACHABILITY term beside it
(`stormReachBucket`, `stormReachLabel`, §14.19, whose UNKNOWN arm decides
whether a store written by an older build is still reachable at all) — or the RETIREMENT rule
(`stormDone`) and the random game pick (`stormPickGames`), §14.16, whose failing
case needs a position answered WELL in one session and the same frontier drawn
in the NEXT and so is close to unreachable from a live sitting — or the FUNNEL
(`stormFunnelBlank`/`Bump`/`Why`/`Note`/`Lines`, and `harvestCandidates`'s own
control flow, §14.17), whose invariant is that the four candidate outcomes
account for every examined position — or the PAUSED filter in
`stormFrontiers`
(§14.14, whose whole failure mode is silence: a course with nothing paused
answers identically either way) — or the STUB filter beside it (§14.18, whose
failure mode is the same silence, plus two asymmetries an edit is likely to
"tidy" away: a custom-FEN or paused line may be the CONTINUER though neither may
be a SOURCE) — or the WALK's own re-entry stop (`stormReentered`, §14.18.4,
whose failure mode is the same silence again and whose side-scoping guard, if
"tidied" away, still stops walks and still looks plausible) — or the ENGINE
TIER (§14.23: `stormEngineLoss`, `armEnginePhase`, `startEngineChild`,
`finishEngineJob`, `endEngineJob`, `onStormEngineUpdate`, `keepEngineBest`,
`keepEngineChild`, and the `CONFIG.storm` numbers `engineDepth`,
`enginePhaseMs`, `engineDepthSlack`, `engineTimeoutMs`, `gradeTimeoutMs`),
whose every failure mode is a tier that still runs and silently answers
"No verdict" for ever — which is exactly what it did from v0.130.0 to v0.148.0,
through a whole live verification pass, because a slow machine and an ignorant
ChessDB print the same thing: a depth above engine.js's own `PROFILES` ceiling
is CLAMPED rather than refused, each watchdog must outlast the one inside it,
and an update short of the target depth must be KEPT rather than discarded or a
budget that expires has nothing to answer with:

```
node dev/check-storm.js
```

…and after touching the verdict line it prints — `stormCp`, `stormVerdictLine`,
`stormBestLine`, or §14.20's `stormEstimated` / `stormSourceLabel` /
`stormSourceTitle`. Since v0.138.0 that includes the `v.unanswered` arm
(§14.10c), whose failure mode is the quietest one there: with the arm gone the
card the storm ended on falls through to the ordinary branch and reads "your
move", a sentence claiming an answer nobody gave. Control run 2026-08-28 — arm
removed — fails on exactly the two assertions that cover it and on no others.
Since v0.139.0 it also covers the miss PENALTY and the signed rendering.
Controls run 2026-08-28: the penalty multiplied by the streak fails on exactly
2 (both long-streak cases, and NOT the plain one — which is the point of having
all three); the penalty removed altogether fails on 3; the unconditional '+'
restored fails on exactly 1.

Same discipline: it EXECUTES them, sliced out by `dev/slice-source.js`, with no
network — the walk takes its ChessDB lookup as a PARAMETER, which is also the
only way to reach the stop rules deterministically. Four things here fail
SILENTLY and every one still produces a tidy column of plausible numbers:

* TWO PERSPECTIVE FLIPS, IN OPPOSITE DIRECTIONS. `stormUserEval` reads a
  ChessDB score (the MOVER's) from the user's side — the bug the probe's own
  `--frontiers` block shipped with (DESIGN-intuition-storm.md §6.5) — and
  `stormMoverCp` reads a Stockfish score (WHITE's, normalised in engine.js) the
  same way. Neither throws when it is backwards.
* THE CHILD-NEGATION FALLBACK (`stormMoveLoss`): a subtraction where §3.4 wants
  an addition, wrong by twice the child's eval.
* THE STOP AND PICK RULES, where a rule that never fires yields MORE positions
  and so looks like the feature working better.
* THE GRADE'S OWN (v0.141.0, §3 of that file). `wpK` is Lichess's fit and not a
  dial: a different constant re-scales every band at once while every verdict
  stays plausible, so it is pinned by its CONSEQUENCES — the curve's fixed
  points, and that the two scoring bands still land on the old 30cp/70cp at
  equality. Losing the clamp runs the arithmetic on a mate's ~30000. Writing the
  bands with `<=` puts each threshold in the band above it. And the penalty
  multiplied by the streak is v0.139.0's bug in a new shape, now guarded by the
  SIGN rather than by a list of names. Controls run 2026-08-28, each failing on
  exactly its own assertions: `wpK` at 0.002 → 5; the clamp removed → 2; the
  penalty multiplied → 3; the bands written `<=` → 2.
* THE PERFORMANCE RECORD'S THREE (v0.140.0, §9 of that file), plus a FOURTH
  since v0.141.0: `found` is the two bands that SCORE, and folding `ok` into it
  turns "how often did I find the move" into "how often was it survivable".
  Controls run 2026-08-28: `ok` folded into the numerator → 2; the loss summed
  in centipawns again → 3. A denominator
  that counts `unknown` marks the user down for ChessDB's ignorance; a merge
  that SUMS two devices' counters sums them again on every later exchange, while
  the numbers stay plausible and keep growing; and a chapter's average loss
  taken over its LINES rather than its ANSWERS weights a line answered once like
  one answered forty times. Controls run 2026-08-28, each failing on exactly its
  own assertions and no others: the denominator widened to include `unknown`
  → 2; the merge summing instead of taking the higher `n` → 5; a missing loss
  read as 0 → 3; the roll-up averaging its lines' averages → 1. The merge one is
  worth noting for its shape — it does NOT fail "the other device is added", the
  assertion that looks like the merge test; it fails "a SECOND exchange adds
  nothing", which is the only one a double-count can be seen in.
* THE MISS PENALTY BEING MULTIPLIED (v0.139.0). `stormPoints` charges
  `missPoints` (−2) FLAT and must keep doing so: the streak multiplier is a
  reward for a run, and charging it against the answer that ENDS the run makes
  one lapse after twelve right answers cost four times what the same lapse
  costs after none. The score still moves in the right direction, just by the
  wrong amount, and only on the answers hardest to reproduce on purpose — so
  the assertion that catches it is the LONG-STREAK one, never the plain
  `stormPoints('miss', 0, C)`, which a multiplied penalty passes (multiplier 1).
  `unknown` and `unanswered` stay at 0: neither is the user's doing.
  `stormVerdictLine` prints the figure SIGNED for the same change — an
  unconditional '+' renders the penalty as "+-2", which survives every numeric
  assertion about the points themselves.

Controls run 2026-08-28 — the two flips unflipped, the fallback subtracted, the
flat-position rule removed, `stormBestLine`'s same-move guard defeated, the
invented line's move band widened to every legal move, the ply floor ignored,
the store keeping only its top five moves, its invented mark lost, its
`typeof score` check weakened, the retention rule inverted, the wire's
tombstones removed, its failure-count merge dropped, an unresolvable move given
a blank SAN, and the payload budget ignored — failing on 5, 4, 3, 3, 3, 1, 1, 3,
1, 1, 3, 1, 1, 3 and 1 assertions respectively and on no others. Since v0.136.0,
dropping the PAUSED filter fails on 8 (control run 2026-08-28) — the fixture's
two paused lines are ordinary in every other respect, same colour and same
length as the surviving one, so only the flag can be what excludes them, and one
of them converges on the SURVIVING frontier, which is what catches a filter that
drops the line but still lets it add its name and its draw weight. Since
v0.137.0, restoring v0.130.0's hardest-first draw order fails on exactly the 5
assertions that cover it (control run 2026-08-28). That last
one is a bug a live session found: playing the TOP move printed it twice ("best
Nxf3+ -0.89   Nxf3+ -0.89"), which reads as a defect rather than as agreement.
Since v0.142.0 it also covers §14.16. Controls run 2026-08-28, each failing on
exactly its own assertions and no others: `stormDone` returning false always
(the guard removed) → 2; `stormDone` ignoring the horizon, i.e. a deletion
rather than a retirement → 1; `stormPickGames` returning the first `n` again
→ 1. That last assertion is written as a CONCRETE sequence rather than as "not
the first two", so a pick that ignored `rnd` entirely cannot pass it by
returning something else.
Since v0.143.0 it also covers §14.17, and that section is the one place this
file executes IMPURE code — `harvestCandidates` and `storeAdd`, with `st` and
`C` injected through `__setEnv` — because the conservation invariant lives in
that function's control flow. Controls run 2026-08-28, each failing on exactly
its own assertions: a fifth `continue` counted nowhere → 3 (one of them the sum
itself); the retired arm folded into the reject count → 4; the note losing its
"where the positions went" half → 1.

§0 of that file asserts something no assertion below it could: that the three
verdict-line helpers are declared at TOP LEVEL. Slicing flattens every scope
into one, so nothing else there can tell a helper section 18 can reach from one
it cannot — and both sections print that line.

Note that `stormPgnMoves` reads its comment pattern out of `PGN_COMMENT_RE`
rather than a regex literal, and must keep doing so: `dev/slice-source.js`
matches braces and counts the ones inside a regex literal, so `/\{[^}]*\}/`
truncates that slice three lines in — silently, since a half-function is still
something `new Function` will accept.

After touching `sanToUci` — or `sanToUciRelaxed`, the second pass beside it:

```
node dev/check-san-relaxed.js
```

CHESSABLE OVER-DISAMBIGUATES, and an exact SAN compare drops the line SILENTLY.
Ground-truthed 2026-08-19 (course 291847, "Scotch 4...Qh4?!"): it writes `Ndb5`
where only the d4 knight can LEGALLY reach b5 — the c3 knight is pinned — so
the strict spelling, and what `CloSan.moveToSan` produces, is `Nb5`. That was a
false "could not be replayed" in the coverage report (21) for as long as it has
existed. The relaxed pass runs ONLY after the exact compare has failed, so it
can turn a refusal into a resolution and can never change a move that already
resolved; it resolves only when exactly one legal move survives the written
SAN's hints, and refuses otherwise. The controls are the point of the file.

After touching section 24's walk, fold or columns — `buildCourseTree`,
`foldFrom`, `rowsAt`, `standColumn`, `columnsFor` — or 24b/24c's `positionSide`,
`gapKind`, `dbMovesFor`, `gapsFor` or `pathOfLine`, or 24f's shared
`popEntryWdl` / `popEntryScore` / `moverScorePct`, or 24h's `findSplits` /
`cardVerdict` / `groupVerdict` / `parseAltList`:

```
node dev/check-course-tree.js
```

Same discipline: it EXECUTES them, sliced out by `dev/slice-source.js`, over a
live `getList` dump of the account's courses. The dump (`dev/tmp-courses.json`)
is GITIGNORED — course content is not ours to redistribute — and the recipe for
remaking it in one console call is in the header of `dev/probe-course-tree.js`;
without it the check exits 2 and says so. It has to be a real course: the fold's
eighty-ply run and the position graph's back-edge both occur only on the bought
one. Run a control (`CLO_SRC` at a copy with the change reverted) and confirm it
FAILS — removing the fold's line-end stop and the cycle guard is caught by
exactly the three assertions that cover them, and reverting `columnsFor`'s
mid-run arm (24e) by exactly the five that cover the standing column. Those five
are written to REPORT rather than throw when there is no third column, since
that is precisely the control's shape.

It also covers 24f against a hand-built cache entry, which is the only way to
reach the three things there that fail SILENTLY — a missing win rate looks
exactly like a position with no data: that BLACK is derived from the move's own
total rather than stored (a control returning the draws instead fails on exactly
the four assertions that cover it), that a gap row carries the split of the move
it names, and that an entry written before the split still answers SHARES and
simply draws no bar.

It also covers 24h, whose one real judgement — whose move it is — is wrong
INVISIBLY if taken from `positionSide`: the assertions name the two splits that
reading hides on course 291847 AND that `positionSide` answers null at the root,
so a control reverting to it fails on exactly four assertions and still passes
every 453453 case, which is the whole point. Plus that every card named is a line
written for the side to move, and that each card's `userPly` really does index
its own move — the join onto `getLesson`, and the other thing here that would be
wrong with full confidence. The alternatives verdict is covered against a
SYNTHETIC `ct.alts` (a course where the user has registered one is not
reproducible): an over-disambiguated spelling still resolves, an unresolvable one
is dropped rather than guessed at, and a lesson that will not align claims
nothing. Controls run 2026-08-26 — `positionSide`, a raw SAN compare, and the
alignment check removed — each failing on exactly its own assertions.

It also covers 24b and 24c against a FAKE explorer answer, which is the only way
to reach the three things there that can be wrong invisibly: that `positionSide`
answers null on a mixed course rather than taking `courseSide`'s majority (a
control that falls back to it fails on exactly that one assertion), that the
explorer's SAN is resolved through CloSan rather than compared — castling is the
case, and a raw-compare control fails four assertions — and that a move under
`gapMinShare` is not called a gap. Plus that every indexed line rebuilds into a
contiguous path, which is what the find field stands on.

After touching section 18's line reading — `walkLine`, `branchLines`,
`quizzableLines`, `dropAmbiguous`, `mergeUserAlternatives`, or `tryMove`'s
alternative arm:

```
node dev/check-continuation-lines.js
```

It EXECUTES those functions, sliced out of `content/lichessable.js` by brace
matching (`dev/slice-source.js`) and run against the real `engine/san.js` — so
it cannot drift from the source, and a rename breaks the slice loudly. This
exists because that arm has shipped broken twice on a class `node --check`
cannot see: v0.67.0's `applyMove(played)` with no resolved `mv` threw on EVERY
alternative for six weeks, and v0.100.0's stranded `isNext` did the same in
section 23. To run a control, point `CLO_SRC` at a copy with the change
reverted and confirm it FAILS — an early version of that control silently read
the good source and passed against a copy that still had the bug.

After touching the popup placement helpers — `visualViewportBox`,
`placeFixedPopup` — or the quick-edit popup's own `placePopup`:

```
node dev/check-popup-placement.js
```

Same discipline again: it EXECUTES both helpers, sliced out by
`dev/slice-source.js`, against the viewport shapes a phone presents and a
desktop cannot be put into — a "Desktop site" layout viewport thousands of CSS
pixels tall, an on-screen keyboard, a pinch-zoom offset. Every case passes on a
full-size window with the pre-fix arithmetic, which is why the check exists.
Run a control (`CLO_SRC` at a copy with the change reverted) and confirm it
FAILS — the first control run of this very file came back green because a NaN
loses every comparison, which is now asserted against.

After touching section 16b's store — `load`, `save`, `migrateLegacyStore`,
`indexItems`, `itemKey` or the caps:

```
node dev/check-pin-store.js
```

Same discipline as the check above: it EXECUTES the real `initPinnedMistakes`,
sliced out by `dev/slice-source.js`, against a fake `chrome.storage` with TWO
devices sharing one sync area — migration off the pre-v0.105.0 blob, the write
diff, deletion-by-absent-key, the global cap, retirement, and that a device
still hears about the other one after saving itself. Run a control (`CLO_SRC`
pointed at a copy with the change reverted) and confirm it FAILS.

After touching section 23's auto-play walk — `computePrefix`, `cardIsProven`, or
`sg.firstCard` where `anchor` sets it:

```
node dev/check-prefix-walk.js
```

Same discipline again, and it pins a property rather than a bug. Under Study:
Key Moves the trainer plays every user ply before the first key move itself —
but Chessable ALSO clears `isUserMove` on those plies, so the walk never sees
them and its first considered ply is the first card in BOTH study modes. That is
what this file asserts, in the plan shape Chessable actually serves; the
v0.112.0 change it was written for turned out to be a no-op
(DESIGN-show-and-grade.md §4.6). What DOES change an answer is `cardIsProven`'s
`cardIdx < firstCard` guard, and a control run against the pre-v0.112.0 source
fails on exactly those two cases and passes every walk case.

After touching section 23c's shared-run-up rule — `maybeStartLead`,
`leadCommonPlies`, `noteLeadShown`, `leadGoto`:

```
node dev/check-lead-runup.js
```

Same discipline: it EXECUTES them, sliced out by `dev/slice-source.js`, over a
seven-variation chapter — the replay opening at the first ply that differs from
the one just watched, a shallower branch point sending it back to the start
ONCE, a skipped run-up leaving the branch point alone, and a replay cut short
counting only what was shown. Every interesting case is the third or fourth
variation in a sequence, which is why a live session is a poor way to check it.
Run a control (`CLO_SRC` at a copy with the rule reverted) and confirm it FAILS.

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

## Reaching a live Chessable session (THE ONLY WAY)

**Claude in Chrome, always — the user's own Chrome.** It is the only browser that
has the Chessable session AND the unpacked extension loaded, which are both
required: without the session every page redirects to the logged-out home, and
without the extension there is nothing of ours to test.

* Its tools are a SEPARATE, DEFERRED family, `mcp__claude-in-chrome__*`. They must
  be fetched with ToolSearch before they can be called (one call, comma-separated:
  `select:mcp__claude-in-chrome__tabs_context_mcp,…navigate,…javascript_tool,…computer`).
  Then `tabs_context_mcp{createIfEmpty:true}` before anything else.
* **NEVER use Claude Code's own Browser pane (`mcp__Claude_Browser__*` /
  `preview_start`) for Chessable.** It is a different browser — a separate profile
  with no Chessable cookies and no extension — and it looks like a login problem
  rather than the wrong tool. A whole session was lost to this on 2026-08-10: the
  pane was driven, `/course/<bid>/` kept redirecting to the marketing home page,
  and the conclusion drawn was "the user is not logged in".
* If the Chrome tools are missing, or `tabs_context_mcp` shows nothing, or a page
  loads logged-out: **STOP AND ASK THE USER** to check that Claude in Chrome is
  enabled, that the side panel is signed in to the same account, and that Chrome is
  logged in to Chessable. Do not fall back to another browser, and do not spend
  turns diagnosing it — one question settles it.
* It is fine to read Chessable's PUBLIC minified bundle from any browser (that is
  how `importSubvariationFromSource` and `importGame` were found), but every call
  that needs auth, and every test of our own UI, needs the Chrome above.
* The test account is a test account: writes are allowed, and are expected to be
  undone afterwards (`updateOpening&mode=del`) with a re-read to prove it. However,
  it is not critical to undo changes if it would be expensive (in tokens). 
  The SRS or review progress doesn't matter on this test user.

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

- Ask for, log, or store the actual `lip_` token value anywhere TRACKED in the
  repo. The one sanctioned home is `local-token.json` — gitignored, seeded into
  `chrome.storage.local` by `seedTokenFromLocalFile` in background.js on install,
  on startup and on every worker wake, and NEVER overwriting a token already
  stored. A missing file is the ordinary case and behaves exactly as before it
  existed (the options page asks). The rule is about git history and packed
  .crx files, not about the token's scope: a secret committed once is in every
  clone for ever. Do not print the value in a log line either.
- Add permissions, hosts, or libraries without explicit discussion.
- Fix Chessable-markup breakage anywhere except `SELECTORS`.
