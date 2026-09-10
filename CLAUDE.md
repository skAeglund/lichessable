# CLAUDE.md — LiChessable

Personal Chrome extension (Manifest V3), loaded unpacked, for one user against
Chessable. Two things it does, and everything else hangs off them: it puts a
**Lichess Database panel** beside the position wherever Chessable shows one, and
it adds **practice and editing** the site does not have — drilling the moves you
got wrong, quizzing the lines an author only wrote about, and writing back into
your own courses through Chessable's own edit page.

Currently working (v0.18.x).

**Where it runs.** `/explore/<id>/` and `/analysis/` (inside the same-origin mt1
iframe), `/practice/…` and `/learn/…` (MoveTrainer2, one top document, identical
markup), `/variation/<id>/`, and `/course/<bid>/`.

**The map.** Section numbers are how this file refers to itself; each is a
bullet under Key mechanics, and the feature-sized ones name a `DESIGN-*.md` to
read first.

| § | |
|---|---|
| 5b, 5c | local Stockfish (offscreen doc, worker is the hub); the shared Chessable JWT calls |
| 6, 6b, 6c, 6d | the panel's fetch/cache; its filters and cogwheel; repertoire badges on every move row, and opening the lines behind them |
| 9 | the Overstudy widget on the trainer row |
| 11, 11b, 11c | the panel's hosts — review, `/variation/`, and the shared static board layer |
| 12, 12b, 12c | quick-edit: the pencil, its four tabs, the driver, arrows, refreshing the host |
| 13, 13b-d | auto-play of moves already answered this session; "difficult moves only" |
| 15 | wrong-guess alt check: engine-check a refused move, add it as an alternative |
| 16, 16b-e | the mistake log; pinned mistakes, their prompt, launcher and sync |
| 17 | the retry runner — failed variations walked again as overstudy |
| 18, 18b, 18c | clickable-line review; the mid-quiz heads-up; important lines |
| 19, 19b-e | the analysis board; on `/variation/`; add as line / variation / puzzle |
| 20 | the mistake drill — failed moves, one card each, on our own board |
| 21 | repertoire coverage: what this course has that your repertoire lacks |
| 22 | type a move: answer the live card from the keyboard |
| 23, 23b, 23c | show and grade (two keys, no move); speech and blindfold; the key-move lead-in |
| 24, 24b-h | the course tree; the Lichess scan; splits; an analysis board inside it |
| 25, 25b-d | key moves vs difficult moves — lower a key range to cover what you get wrong |
| 26 | the ChessDB eval column, and ChessDB as an engine source |
| 27 | intuition storm: the positions your lines END on, graded for being decent |
| 29, 29.2-.5 | puzzles from the games that played your lines; collecting a course |

## Structure

- `manifest.json` — MV3. Permissions: `storage` + `unlimitedStorage` +
  `offscreen` + host
  permissions for `explorer.lichess.org`, `www.chessdb.cn` (section 26, added
  v0.128.0 on explicit request), `lichess.org` (section 27, v0.130.0, same
  conversation — DESIGN-intuition-storm.md §10) and
  `skaeglund.github.io/puzzle-explorer-data/*` (section 29, v0.171.0, on
  explicit request — DESIGN-storm-puzzles.md §9). Nothing else, keep it that way
  — a FIFTH host needs the conversation the second, third and fourth ones got.
  TWO of them have guards that do real work, for opposite reasons. The THIRD
  host serves the user's whole account, so the worker allows the single path
  prefix `https://lichess.org/game/export/` and nothing more. The FOURTH is
  harmless by comparison — static CC0 JSON, no account, no writable endpoint —
  and has the TIGHTEST guard anyway, because there it costs nothing: the content
  script names a PATH and never a url, so nothing on that side can name a host
  at all, and the manifest asks for the path prefix rather than the host.
  `unlimitedStorage` (v0.172.0) belongs to section 29.2 and nothing else: it
  lifts `storage.local`'s 10 MB cap, which `puzzleCandMax`/`puzzleArchiveMax`
  (40000 each) need, and it marks the extension origin's storage PERSISTENT so
  the puzzle body archive is not evicted under disk pressure. It is a
  permission, not a host permission, and no other feature relies on it.
  The CSP (`wasm-unsafe-eval`) and COOP/COEP keys exist solely so the
  offscreen document can compile WASM and use SharedArrayBuffer (engine
  threads) — do not remove them.
- `content/puzzles.js` — the Puzzle Explorer dataset's primitives (section 29):
  the position key, the shard hash, the theme vocabulary and the filters. Loaded
  before `content/lichessable.js` in every frame, requireable from node
  (`engine/san.js`'s idiom, and `dev/check-puzzles.js` executes it). Pure: no
  `chrome.*`, no fetching — the fetch goes through the worker. IT IS A MIRROR OF
  A PUBLISHED DATASET'S OWN CODE, not code to improve; see CLAUDE.md's section 29
  entry for the three things in it that cannot be changed on this side alone.
- `puzzlecache.js` — the Puzzle Explorer dataset's IndexedDB (section 29.2):
  two LRU shard caches and the DURABLE, unbounded body archive that makes
  collecting a course a one-off. Loaded into the SERVICE WORKER by
  background.js's `importScripts` — background.js is a CLASSIC worker (no
  `"type": "module"`), which is what makes that the load path. IT MUST STAY IN
  THE WORKER: a content script's IndexedDB belongs to `www.chessable.com`, a
  third party's origin, cleared by their "clear site data" and no place for
  hundreds of megabytes of ours. Best-effort throughout — every operation
  degrades to a no-op and a null, because a cache that can break the feature it
  accelerates is worse than none.
  TWO THINGS OUTSIDE IT KNOW IT EXISTS, and both were learned the hard way in
  v0.172.1. `importScripts` in background.js is GUARDED, because an
  importScripts that throws aborts the WHOLE worker script — the explorer
  fetch, the engine hub, the quick-edit driver and the overstudy opener all die
  for want of a CACHE. And `pack-mobile.ps1` now scans the worker for its own
  `importScripts()` calls: that script derives its file list from the manifest
  and from HTML `<script src>`, so a module reached this way was invisible to
  it and the v0.172.0 mobile zip shipped background.js WITHOUT puzzlecache.js.
  Anything else ever added to the worker by importScripts inherits both.
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
- `options/` — Lichess API token entry + Test button. NO NATIVE `<select>` LIVES HERE, and that is not a style choice: Android never opens a select
  popup on this page, so every dropdown setting was unreachable from the
  phone — "Auto" included, which is the one value a phone must change
  (engine-build detection reads it as a desktop and asks for the full
  Stockfish build). `<clo-pick>` at the top of `options.js` is a radio group
  wearing the `<select>` API its consumers already use (`.value`, a `change`
  event), so nothing else changed; `renderSync` is the one caller that builds
  its list at runtime and calls `setOptions()`. The manifest's `open_in_tab`
  and the page's `color-scheme: light` are the same repair: the embedded
  extensions-UI dialog is where the popup fails, and a page declaring a text
  colour and no background is dark-on-dark under Chrome's Android auto-dark.
  Any `<select>` added here is a control the phone cannot use.
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
- `DESIGN-*.md` — ONE PER FEATURE, and each is the required reading its section
  in Key mechanics points at. They hold the loop, the measurements, the version
  history and the live ground-truthing; this file holds only what an edit
  elsewhere can break. Each section's own READ gate says which § covers what;
  this is the reverse lookup.

  | doc | sections |
  |---|---|
  | `DESIGN-autoplay.md` | 13 |
  | `DESIGN-difficult-moves.md` | 13b, 13c, 13d |
  | `DESIGN-quick-edit.md` | 12, 12c |
  | `DESIGN-quick-edit-arrows.md` | 12b only |
  | `DESIGN-retry-mistakes.md` | 16, 17 |
  | `DESIGN-pinned-mistakes.md` | 16b-16d, and the pinned arms of 17's popup and 20's launcher |
  | `DESIGN-chessable-sync.md` | 16e |
  | `DESIGN-continuation-review.md` | 18, and 18b at §8 |
  | `DESIGN-add-as-variation.md` | 19c, 19g |
  | `DESIGN-add-as-puzzle.md` | 19d, 19e |
  | `DESIGN-repertoire-coverage.md` | 21 |
  | `DESIGN-show-and-grade.md` | 23, 23b |
  | `DESIGN-key-move-leadin.md` | 23c |
  | `DESIGN-course-tree.md` | 24, 24b-24h |
  | `DESIGN-key-moves.md` | 25, 25b-25d |
  | `DESIGN-chessdb.md` | 26 |
  | `DESIGN-intuition-storm.md` | 27 |
  | `DESIGN-storm-puzzles.md` | 29, 29.2-29.5 |

  FOUR OF THEM CARRY A WARNING ABOUT THEIR OWN EARLIER TEXT, and a rule quoted
  out of one without reading the later § is a rule quoted wrong:
  `DESIGN-course-tree.md` §12 overrides §3.5, §5.1 and §8, and §15.1 LIFTS §7's
  "no fetch per column"; `DESIGN-storm-puzzles.md` §3.1 is superseded by §12.1;
  `DESIGN-intuition-storm.md` §16 replaces centipawns with win probability
  throughout, and §23.8, §26 and §30a each reverse a rule stated earlier in it;
  `DESIGN-add-as-variation.md` §7 lifts §3.3's "one destination, no chooser" for
  a source course the user cannot edit (§5's first open question is still open,
  and §7.2 is why the picker is built so that it stays that way).

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
- Repertoire badges (section 6c): UP TO TWO of the user's Chessable courses are
  nominated as repertoires (two pickers in the SETTINGS MENU, 6b — the panel's
  preferences belong with the panel's other preferences), each read through the
  shared `getList` and walked into a position → moves index; every panel move
  row either of them plays gets a badge. READ-ONLY, and a different question
  from section 21: that one asks "which lines of the course I am looking at are
  missing from my repertoire" and WRITES them back; this one asks "standing
  here, what do I play".
  TWO SLOTS, NOT N (v0.187.0), and the number is a COLOUR budget, not a data
  one: the asked-for case is a White course and a Black one, and a third would
  need a hue that is neither identity hue, nor the warning's red, nor the
  lichess green the rest of the panel accents with — there is none left that
  survives being a 9px mark. `reps` is the array of slot objects (`{ i, bid,
  name, index, loading, error }`), `repUi` what they share (the ONE course
  listing, the pref-loaded flag, `linePlayable`). EVERYTHING OUTSIDE 6c ASKS
  THROUGH FOUR HELPERS and never touches `reps` — `repActive()` (nominated
  slots, in order), `repAnyBid()`, `repAnyPending()` (a nominated slot whose
  index has not landed — the tree's "still loading") and `repUsesCourse(bid)`
  (19c/19d's cache drop). `ensureRepertoireIndexes(force)` is the loader every
  outside caller wants; `ensureRepertoireIndex(slot, force)` is one slot's, and
  the plural runs them SEQUENTIALLY — two walks of a few hundred thousand
  CloSan calls interleaved on the main thread make both slower than either
  alone, and the index cache is read-modify-write, which two flights landing
  together can lose a lap of.
  THE PREF AND THE CACHE BOTH CHANGED SHAPE, and only one of them migrates.
  `cloRepertoire` is now `[{bid,name}|null, {bid,name}|null]` and
  `applyRepertoirePref` STILL READS the old single `{bid,name}` — one line,
  because a profile that has ever set a repertoire has that shape stored. The
  session cache is ONE OBJECT KEYED BY BID and its key moved with it
  (`cloRepertoireIndex` → `…Index2`) rather than growing a migration: that area
  dies with the browsing session, so an entry from an older build costs one
  rebuild, once. `writeRepertoireIndexCache` READS BEFORE IT WRITES and PRUNES
  to the nominated slots — 24b's `flushDbCache` hazard in a smaller pond (a
  plain `set` would delete the other slot's index), and the prune is what caps
  the object at two, `maxIndexPositions` being a PER-INDEX guard written when
  there could only be one. `dropRepertoireIndexCache(bid)` drops one entry;
  with no argument, the lot.
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
  The THIRD verdict is the unprepared-reply WARNING (red triangle), and it is
  both COMPARATIVE and MERGED — which is why `repertoireRowStates(fen, moves,
  positionGames)` decides the whole move list at once, returning one
  `{ marks: [state|null per slot], risk }` per row, and why `repertoireBadge`
  and `repertoireRiskBadge` take pre-computed states instead of a `(fen, uci)`
  pair. MERGED IS THE WHOLE REASON RED IS STILL FREE: "you have no answer to
  this" is FALSE if EITHER course answers it, so the threshold is the most
  popular move covered by ANY slot, a move marked by any slot is silenced, and
  the triangle names no course. FOUR silences, each of which would otherwise
  turn the table red:
  * OUR MOVE — only the opponent's options are a risk; preferring a less popular
    line is a repertoire DECISION (1...c5 over 1...e5), not a gap. Whose move it
    is comes from `ix.side` (`courseSide`, hoisted to 5c beside `sideOf`); a
    course that does not say which side it is for NEVER fires the warning rather
    than risk inverting it. Asked of every slot that COVERS this position, and
    ONE saying "mine" is enough — with a White course and a Black one, every
    position belongs to one of them and the other has no standing to call it
    the opponent's.
  * NOTHING COVERED HERE — no covered move means no threshold to beat, and the
    lines already say the repertoire does not reach / stops here.
  * ALREADY BADGED — a transposition is answered, so it is not a gap however
    popular (`if (out[i].marks.some(Boolean) || …) continue`): a ring beats red,
    by request.
  * BELOW `riskMinGames` (50, section 21's floor) for the POSITION — deep in a
    line "more popular" is regularly 3 games against 2.
  COLOUR IS IDENTITY AND SHAPE IS THE KIND (v0.187.0 inverted this, and it is
  the one thing a second course actually changed here). Colour used to carry
  the kind — blue 'in', orange 'transposes' — with shape reinforcing it; two
  courses make "whose?" the question a hue has to answer, and the swap was safe
  only because the shapes were already drawn to stand alone ("same outer
  diameter, so only the fill distinguishes them"). So: FILLED CIRCLE = this
  course plays it here, HOLLOW RING = it transposes into this course, TRIANGLE
  = the merged warning. BLUE first (Chessable's own) and ORANGE second — never
  the lichess green the rest of the panel accents with, since green in a move
  table reads as a VERDICT ("this is the good move"), which is the one thing
  these marks do not mean; and blue+orange is the pair that survives a
  red-green deficiency. RED belongs to the WARNING ALONE, which the merge is
  what buys. Tokens `--clo-rep-a`, `--clo-rep-b`, `--clo-rep-risk` at the top
  of the 6c block; every surface reads its hue through `--clo-rep-hue` /
  `--clo-rep-hue-soft`, set by a `--a`/`--b` class (section 26's
  `--clo-ev-tone` idiom), so a re-tint never enters a specificity fight and a
  mark drawn before any slot is known falls back to slot 0's.
  THE COST FALLS ON THE SINGLE-REPERTOIRE USER, whose transposition ring used to
  be a different HUE from the filled dot and is now the same one. Three things
  repay it and none may be quietly removed: 2px of ring on a 9px `content-box`
  makes the outer diameter 13px against the filled mark's 9px (the CSS comment
  claiming they match has always been wrong, and the difference is now doing
  work — do NOT "fix" it to `border-box`), the row tint's STRENGTH says it
  again, and the summary line above says it in words.
  The marks are DRAWN (an empty span sized in CSS), never "●"/"○"/"▲" glyphs:
  those differ in size and baseline per font, and marks that must be told apart
  at a glance need exact geometry. The TRIANGLE is a `clip-path` on the same
  box, NOT the border-triangle trick, so the width/height sizing rules (and the
  `html.clo-touch` override) keep working on it — and its being a different
  SHAPE is load-bearing now rather than belt-and-braces, both identity hues
  being circles.
  THE WHOLE ROW is tinted (a 9px mark is easy to miss in a twelve-row table),
  set on the `td`s and NOT on the `tr`: `.clo-table tr:hover td` paints a
  background on the cell, which would cover one sitting on the row, so every
  tint rule is written to outrank it. A row can be answered by BOTH courses and
  a background can say only one thing, so `repRowTint` splits it: HUE is
  identity (the first slot with something to say) and STRENGTH is the kind —
  `--weak` is a row whose best answer anywhere is a transposition, which is the
  distinction this tint was already drawn with. An 'in' from either slot
  outranks a 'transposes' from either. The four `--a`/`--b` × `--weak`
  combinations resolve by SPECIFICITY alone, so their order in the file is free.
  `.clo-move` is `white-space: nowrap` because its `width: 3.5em` is only a
  suggestion to the auto table layout and the badges otherwise wrapped under the
  move.
  A SECOND MARK IS 15-22px OF INTRINSIC MOVE-COLUMN WIDTH, which is the one
  measurement this feature cost — section 26 left this table at its edge on
  purpose. `.clo-move:has(.clo-rep-badge + .clo-rep-badge)` tightens both marks
  (margins, and the ring to `border-box` HERE AND NOWHERE ELSE — doubled, the
  two differ by hue, so shape can give up the size cue). Measured in
  `dev/harness.html` at the panel's 300px minimum with the eval column on, as
  `body.clientWidth - table.scrollWidth`, one badge → two: touch (Games hidden)
  Bb5+ 24→23, Raxe1+ 12→4, exd8=Q+ 2→−6; desktop (Games shown) Bb5+ 14→4,
  Raxe1+ 0→−10, exd8=Q+ −8→−18. At 330px every case fits with 20px spare, and
  where it does not fit `.clo-body` is `overflow: auto` so the table SCROLLS
  rather than clipping — the same failure the eval column already had at 300px,
  not a new kind. ANYTHING ELSE ADDED TO THIS CELL HAS TO RE-MEASURE.
  `CONFIG.repertoire.indexVersion` is checked on every cache read: an index
  written by an older build parses fine and is quietly missing whatever field
  was added (v2 added `side`, without which the warning silently never fires).
  Bump it whenever the index gains a field.
  ONE SUMMARY LINE PER NOMINATED COURSE above the table, each carrying the two
  answers a badge cannot: the move that repertoire plays INSTEAD (regularly
  outside Lichess's top dozen, so there is no row to badge at all) and "reaches
  this position but stops here" vs "does not reach this position". `.clo-rep`
  is now the COLUMN and `.clo-rep-line` is the wrapping flex row it used to be,
  so everything inside a line (including "study from here ↗", written to drop
  to its own line in a narrow panel) lays out exactly as before. Each line
  opens with a `.clo-rep-dot` in its own hue — the LEGEND, drawn even with one
  course nominated, because it is the only way a badge's colour can be read
  without hovering it. They sit OUTSIDE everything `showStatus()` hides,
  deliberately: a position with no Lichess games is exactly where they are the
  only thing the panel can still answer. Its move chips PLAY the move where
  a board accepts one — Chessable's own board outside review, and inside review
  only OUR analysis board (section 19, through the `continuationAnalysisPlay`
  bridge); the trainer's browse board and the variation page accept nothing.
  That answer flips WITHOUT the position changing (opening the analysis board
  keeps the board where it was, so `refresh()` short-circuits on
  `fen === state.fen`), so `syncRepertoireLine()` on the top-panel tick compares
  `repUi.linePlayable` and redraws only on a flip — redrawing every 500 ms would
  kill a tooltip mid-hover.
  The walk YIELDS every `chunkVars` variations (a 500-line repertoire is a few
  hundred thousand CloSan calls and must not freeze the page) and the built
  index is cached in `chrome.storage.session` (12 h, one entry per nominated
  course). `seen` is not stored: it is the answers' own keys plus the line-END
  positions, so only those go in. `state.lastData` exists so the rows
  drawn before the index landed can be re-badged.
  THE EXPLORER'S UCI IS RESOLVED THROUGH CloSan, NEVER COMPARED RAW
  (`repertoireMoveState`, v0.48.1). Lichess writes castling as KING TAKES ROOK
  ("e1h1"); CloSan's generator — and so the index — uses "e1g1". Everything else
  that consumes a uci copes because `CloSan.uciToMove` normalizes the pair
  internally, but a string lookup in `answers` does not: every castling move
  fell through to the transposition arm, which then SUCCEEDED (the repertoire
  does reach the position after its own castling move), so "O-O" was drawn as a
  ring while the summary line above it said the repertoire plays O-O. It also
  kept a covered castling move out of the red threshold, which can invent a
  warning. Section 21 is unaffected — it compares walk output against walk
  output, both canonical; the mismatch only exists where Lichess's uci meets our
  index. Ground-truthed 2026-08-01.
  THE MOVE CELL IS NO LONGER ONLY SAN — the badges are children of it, so both
  existing readers (the analysis board's `onPanelMoveClick` and the quick-edit
  popup's alt-move prefill) read `tdMove.dataset.san`, never `textContent`,
  which now says "Nf3●●".
  THE TWO SLOTS NEVER OFFER THE SAME COURSE: `fillRepertoireOptions` filters
  the other slot's bid out of each dropdown. One course in both would badge
  every row twice and make the two hues say the same thing, and refusing the
  choice is quieter than rearranging the other slot behind the user.
  Everything fails soft, PER SLOT: no session, an HTTP error, an unreadable
  course — that slot's badges simply do not appear, its own note under its own
  dropdown says why, and the other slot is unaffected.
- OPENING THE LINES BEHIND A BADGE (section 6d, v0.186.0): a badge says one of
  the repertoires plays this and its summary line says what it plays; neither
  says WHICH LINE, and until now the panel could not take the user to one. Chessable's
  own "Study from this position" is a plain URL —
  `/course/<bid>/fen/<four-field FEN, "/" → ";">/`, ground-truthed 2026-09-08 and
  recorded at `CONFIG.repertoire.studyPath` — answering the COURSE page filtered
  to the variations that pass through one position, each with its title, its
  moves and its own Review button. So this is one link builder and two press
  handlers: NO endpoint, NO index field, NO `indexVersion` bump, and nothing
  written anywhere.
  * IT IS TOLERANT OF EXACTLY WHAT `repKey` IS. The server IGNORES castling and
    en passant and MATCHES the side to move (measured: `KQkq` and `-` both
    answered the same 50 variations, `b` for a white-to-move position answered
    none) — which is why a REVIEW-mode FEN, whose castling is a home-square guess
    and whose en passant is always "-", still names the right page. The FEN is
    escaped BY HAND: `encodeURIComponent` would turn the ";" separators into
    "%3B", a shape Chessable has never been sent.
  * A BADGE OPENS THE POSITION **AFTER** ITS MOVE, which is what makes it "the
    lines that play this from here" — and is the only way to ask the TRANSPOSITION
    badge its own question, "which of my lines reach this?". So
    `repertoireMoveState(slot, pos, answers, uci)` returns `after`, computed for
    the 'in' arm as well as the transposition test that used to be its only
    caller. It also carries `slot`, since the link is to THAT course's page
    (`repertoireStudyUrl(slot, fen)`). The warning triangle is deliberately NOT
    openable — and cannot be, being the merged verdict of both: a move NEITHER
    repertoire answers has no lines to open, and no one course to open them in.
  * THE TWO OPENABLE BADGES ARE `<button>`s, and the UA reset that allows that
    sits at the TOP of `.clo-rep-badge` — ABOVE the modifiers, so `--transposes`'s
    border and `--in`/`--risk`'s background still win by source order at equal
    specificity, a reset written after them flattening the hollow ring into an
    invisible 9px box. `box-sizing: content-box` is the load-bearing line: Chrome
    makes a button `border-box`, which would quietly shrink that 2px ring inside
    the 9px it exists to surround. The click `stopPropagation`s — outside review
    the whole ROW plays its move (`onMoveRowClick`) and this mark is inside it.
  * NEW TAB, ALWAYS. `window.open` from the click handler (a gesture, so no popup
    blocker, and no `chrome.*`, so an orphaned script can still do it — section
    19c's "Open it" precedent). Every host of this panel is something the user is
    in the middle of, and in the trainer leaving abandons the session behind
    MoveTrainer2's own "Leave site?" dialog.
  * THE SUMMARY LINE'S "study from here ↗" IS DRAWN ONLY WHERE THE REPERTOIRE
    REACHES THE POSITION. Anywhere else the destination is Chessable's own "Oops!
    No variations found", and a link whose only possible answer is "nothing" is
    worse than no link. It wears the `.clo-rep-hint` vocabulary, never the move
    chip's: a blue chip in that line means "a move your repertoire plays", and an
    action dressed as one reads as a seventh move.
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
- Review-mode Lichess panel (top document): shows only in a trainer state
  where no card is being answered — `reviewPanelReady()`, i.e. the
  post-completion browse state (`practiceProgress` "Completed" block +
  `commentMove` list) OR read mode (11d) — so it can never spoil an active
  quiz. THE PANEL IS THE ONLY CALLER OF THAT FUNCTION; every other
  `reviewBrowseReady()` in the file is about a FINISHED variation. No
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
- READ MODE (section 11d, v0.185.0): the book icon in the trainer's card
  header replaces the quiz with the variation printed out in full, and the
  panel follows the board there exactly as it does after completion. It cost a
  selector, a predicate and one word in `reviewPanelTick`, because READ MODE
  RENDERS THE BROWSE STATE'S OWN MARKUP — ground-truthed live 2026-09-08 on a
  /learn/ session of course 453453: `commentScrollContainer`, `commentMove` /
  `commentMove_shownOnBoard` and the prev/next position buttons all appear,
  the timer bar, the pause control and the hint button all go, and the lesson
  plan answers as usual, so `readReviewFen`, `syncReviewPlan` and
  `positionReviewPanel` needed nothing. Both trainer routes, since both render
  the same markup.
  * THE BUTTON IS PRESENT IN EVERY TRAINER STATE — the CLASS is the state
    (`SELECTORS.reviewReadMode`, `.read-only-active`). Testing for the button
    would show the panel over a live quiz, which is the one thing this gate
    exists to prevent.
  * `readModeActive()` ALSO WANTS THE MOVE LIST, and not as belt-and-braces:
    the class is on for a frame or two before the comment column renders, and
    in those frames there is no shown move to read a position off.
  * NOTHING ELSE MOVES. Read mode finishes no variation — nothing is graded,
    recorded or rescheduled — so the row's launchers, the retry pass, the drill
    and the clickable-line quiz keep the browse gate they had, and the row
    stays collapsed (`collapseAuto` is `!reviewBrowseReady()`). Only the
    database, and with it the engine (whose `IS_REVIEW` arm asks only that the
    panel is showing), follow the board.
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
  **READ `DESIGN-quick-edit.md` BEFORE CHANGING ANYTHING INSIDE THIS MODULE** —
  the driver, the host adapter, the two-visit edit flow, the alt-move recipe,
  rights probing, and §6 refreshing the host after a save. Arrows have their own
  doc, `DESIGN-quick-edit-arrows.md`. THE DRIVER IS SHARED: sections 15, 19, 19b
  and 25 all send jobs through it, so what follows is only what an edit
  ELSEWHERE can break.
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
    Ground-truthed on Lemur Browser, where the panel and the overstudy tab work and
    `chrome.windows` alone is missing.
  * EVERY FAILURE RELAY FROM THE WORKER MUST CARRY `plyIndex`. The 'load' handler
    keys its state machine on `"<oid>#<plyIndex>"` and DROPS a result that does not
    match, so an error sent without it is an error the popup never hears — Edit and
    Arrows then hang on "Reading the current comment from Chessable…" over a failure
    they were already told about. Bitten twice: the concurrency refusal, then the
    could-not-open-a-window branch.
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
    is also what a failure leaves behind — and answering unknown by probing again
    re-arms the watchdog, which calls it again, for ever. `qe.probeFailed` is the
    latch, per popup-OPEN (reopening is the retry), mirroring section 15's
    `ac.probeFailed`.
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
    couple of thousand CSS pixels tall. It also FOLLOWS that box for as long as it
    is open (visualViewport `resize` + `scroll`, rAF-throttled, bound ONCE per
    document — buildPopup runs again on every detach, visualViewport does not).
    Both caps are written INLINE by `placePopup` and outrank the stylesheet's
    `100vh`/fixed widths, which are the layout viewport again.
    `dev/check-popup-placement.js` executes the real helpers against those viewport
    shapes — no desktop browser and no harness page can be put into them.
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
  * REFRESHING THE HOST AFTER A SAVE (12c, §6): the variation page CAN re-read in
    place and does; THE TRAINER CANNOT (`HOSTS.review.refresh` is null) and the
    status line says so instead. The page round trip is the riskiest code in this
    feature — once the pager is clicked we are COMMITTED to a navigation, so
    `refreshVariationPage` is a try/**finally** whose finally is the one
    unconditional step, and FALSE MEANS "not refreshed", NEVER "not where you
    were". The popup holds its SAVING ui (`qe.refreshing`) only until the `render`
    mark, which is the moment the saved text is on screen; NEVER TIE THE POPUP TO A
    LATER PHASE AGAIN. And THE `render` GATE MUST NOT go back to wanting a
    `variationMoveShown` marker: that marker is the page navigating itself to move
    1, which does not happen when `returnToVariation` comes home by the pager
    (route 2, no hash) — and route 2 is what EVERY tab gets once `history.length`
    saturates at 50.
  * SECTION 25 CHANGED TWO THINGS IN THIS DRIVER, and both fixes apply to the
    comment, alternative-move and arrows jobs as well (`quickEditSelectMoveEl`,
    hoisted out of `quickEditSelectMove` — which now just calls it and returns the
    textarea). THE MOVE IS SELECTED BY ID AND THE CLICK IS RETRIED: Chessable
    rebuilds `#interactivePGN` shortly after the page boots, so a click on the node
    the driver was handed can land on one already DETACHED and do nothing at all;
    `moveClickTries` / `moveClickRetryMs` bound the retry, and a click that keeps
    not taking is a failure to report rather than a thing to keep doing. And THE
    SIDE-TO-MOVE CHECK CANNOT PROVE A SELECTION, which was the only check there
    was: the position a click STARTS from usually already has the side the target
    move would leave behind, so it passed for a click that never happened, and the
    driver then read the fields of whatever move was selected before. The proof is
    Chessable's own `moveActive` class on the target
    (`SELECTORS.editMoveActiveClass`); the side check stays as a SECOND condition,
    being what says the BOARD followed rather than merely the list.
- THE CORNER DOCK (v0.183.0) is the ONE home for every floating launcher in the
  bottom-right of a chessable.com page: `cornerDock()` (top level, beside
  `blurButton`) body-mounts `.clo-dock`, a flex column, and five modules append
  to it — 25's "Key moves", 24's "Course tree", 21's "Repertoire coverage",
  27's "Intuition storm" and 16d's pin dock. It replaced four hardcoded
  `position: fixed` offsets (92 / 54 / 16, and the pin dock ALSO at 16 on every
  page, so on a course page it sat ON TOP of the coverage launcher — the bug
  this fixes, reported live). Section 27 had no corner launcher at all for the
  same reason and was reachable only from inside the course tree.
  * THE SEQUENCE IS A BLOCK OF `order` DECLARATIONS in the stylesheet, the
    TRAINER ROW's discipline and for its reason: a module may keep appending
    whenever it boots and still land in its own slot. NEVER add an offset here
    again — a hidden launcher takes its own space with it (a `display: none`
    child is not a flex item), so no module has to know what the others do.
  * ONE SIZE, SET ONCE: `.clo-dock .clo-dock-btn`, DOUBLED so it beats every
    launcher's own single-class base rule without any of them knowing it exists
    (`.clo-review .clo-rowprimary`'s trick). Every launcher carries the
    `clo-dock-btn` class in addition to its own. Measured: 42px rows desktop,
    56px under `html.clo-touch` (`html.clo-touch .clo-dock .clo-dock-btn`,
    trebled, which is what outranks both). The per-launcher touch rules were
    removed — they each said something slightly different.
  * TWO TIERS, AND THIS REVERSES 21's OLD RULING that its launcher is "the one
    filled green thing in this corner". Filled green (`--primary`) = the two
    controls that PRACTISE, the pinned drill and the storm, and they sit LOWEST
    — nearest the thumb. Neutral outline = the three that open a REPORT about
    the course. Both greens are one claim about two halves of one activity, so
    this is not two primaries competing (DESIGN-ui-inventory §3).
  * z-index 99990, BELOW our own board (100000) and below every panel these
    launchers open (99999) — so an open report covers its own launcher whatever
    that module's `render()` forgets. `pointer-events: none` on the column with
    `auto` on its children, or the gaps between buttons swallow clicks meant for
    the page underneath.
  * 16c's "Pin this mistake?" is DELIBERATELY NOT in it: that panel is
    trainer-only, where every dock item hides, so it keeps its own fixed
    positioning and the corner to itself.
  * Self-healing with no new watcher: each module's own `mount()` already tests
    `launcher.isConnected`, and a rebuild comes back through `cornerDock()`.
  * `dev/harness.html` renders the whole column ("THE CORNER DOCK, all five
    occupants") — the replica does NOT update itself, so a launcher added here
    is a launcher added there.
- The TRAINER ROW is shared, and since v0.58.0 it has rules of its own that no
  module may decide locally. SIX modules append to `.clo-review` — section 9
  (overstudy), 13 (auto-play), 16/17 (mistakes/retry), 18-20
  (continuation/analysis/drill), 22 (type a move), 23 (show and grade) — and
  each used to pick its own colour and land wherever `start()` happened to put
  it, so weight encoded WHICH MODULE built a control and order encoded the BOOT
  SEQUENCE. **READ `DESIGN-ui-inventory.md` BEFORE ADDING A CONTROL HERE OR
  PICKING A COLOUR FOR ONE** — it is the whole argument, §3 is the tier ruling,
  and `dev/harness.html` renders every state with its measurements.
  * GROUPS. Every cluster carries `.clo-review-grp`, which owns the layout, the
    8px inset and the `1px #3d3a36` rule; a block of `order` declarations at the
    top of the row's stylesheet decides the sequence (title 0, TYPE A MOVE 1,
    mistakes 2, practice 3, overstudy 4, settings 5, status 99 — the field is
    first because it is the only thing here that acts on the card being
    answered). So a module may keep appending whenever it boots and still land
    in its own group — that is the point, not a nicety.
    `.clo-review-grp:not(:has(> *:not([hidden])))` hides a group whose every
    child is hidden, so a group that empties takes its separator with it and no
    module has to tell the row it has nothing to show. The overstudy pair got a
    wrapper (`.clo-os`) for this.
  * ONE PRIMARY. `reviewRowPrimary()` (top level, beside `reviewStatusHost()`)
    returns a ROLE — `'stop' | 'queue' | 'clickables' | 'retry' | 'pinned' |
    null` — and each module applies `.clo-rowprimary` in its own `sync*`, but
    ONLY to a control that is also showing. `'pinned'` (16b) is LAST on purpose:
    a move failed today outranks a pin that has been waiting four hours. Two
    states answer null deliberately: mid-quiz (nothing here acts on the card
    being answered) and a clean browse state with nothing outstanding. A named
    control that is HIDDEN fills nothing, which is why the function needs no
    clause about our own overlays — during a quiz/drill/analysis the practice
    launchers are hidden by their own sync and the row goes quiet by itself.
    Inputs cross module boundaries through the usual null-safe bridges:
    `retryRunActive()`, `mistakeLogApi.pending()`, `continuationLineCounts()`.
    The treatment is a MODIFIER (`.clo-review .clo-rowprimary`, nested so it
    beats every single-class base rule without any of them knowing it exists)
    and carries its own border, padding and radius, because the primary can land
    on a control that has none — "Stop" is `.clo-mx-mini`, bare text.
    `html.clo-touch .clo-review .clo-rowprimary` restores the row's tap padding.
  * COLOUR MEANS ONE THING EACH. Filled green = the one primary. Green outline =
    an ordinary action, which is what every practice launcher wears (including
    both drill buttons, which used to be amber). AMBER OUTLINE = "you have N
    outstanding items" and NEVER launches anything — `.clo-mx-btn` alone. Amber
    RING = section 18c's "an author marked this important", on both launchers,
    never an outline — and a launcher really can wear `clo-rowprimary` AND
    `clo-cr-open--important` at once, green fill plus amber ring COMPOSING,
    which is why 18c's mark had to stop being a border recolour. Amber TEXT (no
    border) = the status line. Neutral outline = an action away from the main
    task (Analyse, Overstudy). Adding a control means picking one of those, not
    inventing a sixth. The ONE exemption is section 22's move field, and only
    because it is not an action at all: a text input looks like the inset well
    every other text field here uses and goes green at the BORDER on focus,
    which says "the keyboard is going here" without claiming to be the thing to
    press — and `reviewRowPrimary()` is untouched for the same reason, the
    primary fill being a claim about a BUTTON.
    The palette itself is 16 `:root` TOKENS at the top of the stylesheet, named
    by role (`--clo-accent`, `--clo-attention`, `--clo-text-dim` …) — but
    `--clo-rep-*` (6c) and `--clo-cr-important` (18c) deliberately stay beside
    their own rules, because each carries paragraphs of argument about why that
    exact colour.
  * COLLAPSED MID-QUIZ (§3.3). Outside the browse state the row goes down to its
    label plus whatever is actively RUNNING. Three CSS rules do it —
    `.clo-review--collapsed .clo-review-grp { display: none }` and two
    exceptions, `.clo-mx:has(> .clo-mx-mini:not([hidden]))` and
    `.clo-tm:has(> .clo-tm-input:not([hidden]))`. Both READ the owning module's
    own gates rather than adding a flag: while a pass runs, `count` and `retry`
    are hidden and Skip/Stop are not, so "this group has a visible mini" IS "a
    pass is running"; the move field is hidden by section 22 whenever there is
    no live quiz, so "this group has a visible input" IS "a quiz is asking for a
    move". Neither can drift. Auto-play's status chip needs no rule — it lives
    on `.clo-review-status`, which is not a group.
    THE `:has()` IS LOAD-BEARING IN BOTH, not decoration: `.clo-review-grp[hidden]`
    and the empty-group rule both sit at (0,2,0), which a plain
    `.clo-review--collapsed .clo-tm` would only TIE — and later-wins would then
    show a group whose every child is hidden. Matching on the child's state
    takes the exception to (0,4,0), i.e. strictly narrower than the rule it
    bends.
    State is section 9's: `collapseAuto` (what `reviewBrowseReady()` asks for)
    and `collapseManual` (the user overriding it, DROPPED the moment the state
    flips, and never persisted — a sticky collapse costs the browse-state
    launchers for the rest of the session with no clue why). Collapsing closes
    the overstudy chooser and calls `autoPlayCloseSettings`, which shuts the cog
    popover AND disarms a pending "Clear?": a confirm hidden between its two
    clicks is one the user can neither complete nor see they owe.
  * ONE OVERSTUDY BUTTON: with a distinct previous variation it raises
    `.clo-os-menu` (which is also where the variation TITLES live), otherwise it
    opens the only answer there is. `previousEntry()` keeps the same-oid guard
    that in-session back-navigation needs.
  * AUTO-PLAY'S SETTINGS ARE BEHIND A COG, and the cog CARRIES THE STATE
    (`.clo-ap-cog--on` plus the answer in words in its tooltip) — that is the
    one thing hiding a toggle costs. NEVER A FILL: it is a setting, and a fill
    means "the one thing to do next".
  * BOTH POPOVERS (`.clo-os-menu`, `.clo-ap-menu`) ARE BODY-MOUNTED and fixed,
    placed once from their trigger's rect, like every other popup here. Inside
    the row they would change the widget's height, which the Lichess panel, the
    alt-check chip and the heads-up all follow. Both swallow
    keydown/keypress/keyup (MoveTrainer2 binds single-key shortcuts on
    `document` and does not skip them for a focused control), close on an
    outside pointerdown in CAPTURE phase BY CONTAINMENT — never
    `stopPropagation`, the trainer underneath is entitled to the event — and are
    dismissed rather than chased on resize.
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
    …AND ON A FOCUSED `INPUT`/`TEXTAREA`/`SELECT`/contentEditable, ASKED OF THE
    ELEMENT'S KIND AND NOT ITS IDENTITY (§28c, v0.182.0), ABOVE the
    `stopPropagation` rather than below it. It used to name two elements —
    section 19's lead-in field and 19d's picker — which was enough for ninety
    versions because they were the only fields this board had ever been opened
    beside; §28b opens it from the STORM's position box, and A HOST'S FIELD
    CANNOT BE NAMED HERE. Both halves matter and the second is the subtle one:
    `stopPropagation` does not stop the DEFAULT action (so characters always
    arrived) but it DOES stop the event reaching the field's OWN listeners, so a
    stand-down that only skipped the shortcuts left a field that types and
    cannot commit. THE TRAINER IS COVERED BY THE FIELDS THEMSELVES — the new
    top-level `swallowKeysOn(el)` (a bubble-phase `stopPropagation`, beside
    `blurButton`) is on `anPrefix` and `anDest`, which is section 22's and the
    quick-edit popup's discipline. Anything that ever puts a field of its own
    under this board inherits that: a capture swallow is for a RUN, a bubble one
    is for an ELEMENT.
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
  analysis closing and the next opening. The document-capture key swallow (below)
  STANDS DOWN COMPLETELY while any text field or selector has focus (§28c) — or
  typing "f" would flip the board and an arrow would walk the move list instead
  of the caret; Escape blurs the field rather than closing the board on a
  half-typed sentence. So THIS FIELD SWALLOWS FOR THE TRAINER ITSELF, in bubble
  phase (`swallowKeysOn`), which is what that handler used to do for it. The text is
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
  * IT WRITES TO THE COURSE THE VARIATION IS IN whenever that is a course the
    user CREATED — guarded on `authorUid === uid` through `chessableBooksOnce`
    (section 5c, memoised per document), the same guard section 21's writes use,
    NOT `isRepertoire`. Where it is not, the destination is CHOSEN (19g, below).
  * IT DROPS THE CACHES THAT NOW LIE — `dropCourseCache(dest.bid)` always, and
    `dropRepertoireIndexCache()` when the target IS the nominated repertoire.
    Without the second one section 6c spends up to 12 h badging the line the user
    just added as unprepared, which reads as the badges being broken. BOTH TAKE
    THE DESTINATION, never the source: with 19g they are regularly two different
    courses, and the repertoire is the likeliest destination of all.
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
- …AND WHERE IT GOES, WHEN THE SOURCE COURSE IS NOT YOURS (section 19g,
  v0.188.0): a picker of every chapter of every course the user CREATED, shown
  in the analysis panel above 19d's, and the answer to §3.3's one unserved case
  — "I am studying a bought course and want this line in what I actually train".
  Same endpoint, same body, same two presses: only `target` moves.
  `DESIGN-add-as-variation.md` §7. What an edit ELSEWHERE can break:
  * THE ENDPOINT ALREADY ALLOWED IT AND OUR GUARD DID NOT. The SOURCE need only
    be OWNED (§2.4, test E: a bought course spliced into an authored one), and
    the server splices its prefix — comments and arrows included — whichever
    course it writes to. So `expect`, `analysisVarPlies` and the ply cross-check
    are all UNCHANGED; nothing about the line depends on the destination.
  * IT IS SHOWN ONLY WHERE THE DESTINATION IS A REAL QUESTION (`varDestNeeded`
    → `analysisSourceBid`, memoised per board in `cr.an.srcBid`). A course the
    user created still writes beside its source with NO chooser, which is what
    §3.3 decided: a sibling variation belongs next to the variation it branches
    off, and a choice nobody has to make is one more thing to read before every
    press.
  * ITS LIST IS AN INTERSECTION, `getImportData` ∩ `authorUid === uid`. 19d does
    without the second because `importGame` names no source and its book list is
    already the writable set; THIS endpoint's behaviour on a target the user did
    not author is untested (§5), and an untested 403 is not a thing to offer.
  * `analysisSource()` NO LONGER REFUSES FOR A MISSING CHAPTER, and 24g is why:
    `fetchVariationChapter` can only see chapters of courses the user can import
    into, so on a bought course it answers null FOR EVER — which is exactly the
    case this feature exists for. The refusal moved into `prepareAddVariation`,
    on the one branch that needs a chapter. `lid` 0 is a real chapter, so both
    ends test for ABSENCE, never falsity.
  * ITS `<select>` NAMES THE COURSE IN EVERY OPTION and has no `<optgroup>`,
    unlike 19d's: a collapsed select shows the option and not its group, and the
    one fact this feature is about is which course the line is leaving for. Both
    pickers gained a CAPTION for the same reason — two bare selects in one panel
    with three "Add as …" buttons is a guess.
  * THE PREFERENCE IS ITS OWN KEY (`cloVarDest`, storage.local, written only on
    a successful write). "Where do lines out of bought courses go" and "where do
    my puzzles go" (`cloPuzzleDest`) are two questions; one key would have each
    write moving the other's default. `readStoredKey`/`writeStoredKey` are the
    shared pair.
  * THE COLOUR CLASH IS STATED, NEVER REFUSED (`sideNoteFor`). The TARGET
    course's colour wins whatever we send (§2.4), and 19d says nothing about the
    same clash — the difference is that a puzzle's destination is always chosen,
    so its course has just been read, while this sentence is the only place a
    line leaving its course is described.
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
    swallow stands down for the picker exactly as it does for the lead-in field:
    arrows and letters are how a `<select>` is driven. Since §28c that is a test
    on the element's KIND, and the picker carries `swallowKeysOn` for the
    trainer's sake — see section 18's bullet.
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
    section 18b's ply clock source, and NEVER a placement read off the board —
    18b's rule, for 18b's reason, which is stated there. It is also EXACT — castling rights and en passant
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
  is stored, the `cloLineHeadsUp` shape).
  **READ `DESIGN-show-and-grade.md` BEFORE CHANGING ANYTHING INSIDE THIS MODE.**
  The loop, the pacing and its measurements, §2g the press queue, §4 the
  auto-play prefix, the alternatives fetch, the audio, §15 "what must never
  happen" and §18 "still open" are all there. What follows is only what an edit
  ELSEWHERE can break.
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
  * A `next` PRESS THE MODE CANNOT ACT ON YET IS QUEUED, NOT DROPPED (§2g). Both
    queue points are INSIDE `doNext`, the one body a live press and a queued
    press share. Only `next` is ever queued (`wrong` is a verdict on the card ON
    SCREEN and CLEARS the queue); a queued press may never ask for the next
    variation (`queueActionable` omits the browse state, and the queue is dropped
    there and at a variation change), so a tap can never answer a line the user
    had not seen.
    `onKey` IS WRAPPED IN A TRY/CATCH like `tick`'s, and for the same reason: a
    key handler that throws is SILENT — no status, no board change, nothing the
    user sees but "the mode stopped working". v0.100.0 shipped a `ReferenceError`
    on every reveal, left behind by lifting a body into `doNext`; see ##
    Verification's rule that an extraction in this file is not shippable on
    static checks alone.
    THE RING SENDS ONE EVENT PER TAP, ON RELEASE, NEVER WHILE HELD AND NEVER
    FASTER THAN ~200ms APART. So no hold, long-press or auto-repeat gesture is
    buildable on the device this mode exists for — a hold version was built,
    verified live and withdrawn. NEVER act on `e.repeat`.
  * TWO PRESSES PER CARD, AND EVERY PRESS SHOWS A MOVE — the governing rule, and
    the one a "tidier" state machine breaks. The first press plays YOUR move on
    our board; the second shows the OPPONENT'S REPLY and is also what GRADES the
    card, so the grade rides on a press that was going to happen anyway. v0.69.0
    had a THIRD press (grade, then reply) and that is the wasted press this
    replaced: DO NOT REINTRODUCE IT. "Wrong" pressed at the think stage costs no
    press of its own — the verdict is remembered (`sg.markedUnknown`) and applied
    by the press that advances.
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
  trainer is asking. OPT-OUT (`cloKeyLeadIn`, absent = ON), at the FASTEST of its
  three speeds (`cloKeyLeadInSpeed`, default `brisk`), both in section 23's cog.
  **READ `DESIGN-key-move-leadin.md` BEFORE CHANGING ANYTHING INSIDE THIS
  MODULE** — §2 is the gate and the live ground truth it rests on, §3 the loop,
  §5.1 which plies get replayed (a run-up shared with the one just watched is not
  shown twice, and only a SHALLOWER branch point restarts from the beginning).
  What follows is only what an edit ELSEWHERE can break.
  * IT LIVES ON SECTION 23'S BOARD AND NOWHERE ELSE (§4). With show-and-grade
    running there is nothing to hand back to — the same board stops replaying and
    starts asking — and a board of our own (a fourth `cr.mode` on section 18's
    overlays) would put a swap at exactly the moment the feature exists to make
    smooth. If the coupling ever gets worse than §4's measurement, HOIST THE
    BOARD LAYER OUT; do not move the lead-in.
  * THE GATE IS ONE COMPARISON ON THE LESSON PLAN, and it is none of the three
    candidates the design argues from: under Key Moves **Chessable itself clears
    `isUserMove` on every ply before the first key move**, including plies of the
    user's own colour. So "a ply of the study colour sitting before the first
    `isUserMove` ply" IS the mode, known at plan-read time, with no settings key,
    no latch and no observation window — and false on every variation of an All
    Moves session for ever, which is also why defaulting the feature ON costs a
    user who does not study Key Moves nothing. THERE IS NO SETTINGS KEY
    (`simpleSettingsApiData` is byte-identical between the modes; `eq_<bid>_key`
    means the course HAS key moves BUILT), and `isKey` is a course-level
    designation identical in both — it can never be the test.
  * THE COVER IS RAISED OFF A MUTATION, NOT OFF THE POLL. Their board first moves
    81 ms after the plan swaps, and a 500 ms tick plus an async MAIN-world read
    is nowhere near that — so the next variation's first card flashed on screen
    before our board covered it. A MutationObserver on the trainer board AND on
    the drawer row holding `reviewCurrentMarker` asks for the read at once
    (`leadNudge`/`leadObserve`) — and on `SELECTORS.trainerRow`, which is the one
    that HAS to work: a variation change may REPLACE the board element, and an
    observer left on the old one is silent rather than wrong. ARMED ONLY around
    the transition (while `reviewBrowseReady()` and for `leadArmTailMs` after), so
    a mid-quiz board, which mutates on every move and can never be a variation
    change, asks for nothing.
  * IT NEVER RUNS AHEAD OF THE TRAINER, which is what makes it impossible for it
    to show the user the answer to a card. `leadCeiling()` is `max(k, target)`
    where `target` is the furthest the trainer has been OBSERVED to reach, never
    lowered. The design first had a PREDICTION there instead (`k'` from the proof
    record); that is the same number when everything goes right and a spoiler when
    section 13 then declines those cards. Never reinstate it.
  * IT IS A DISPLAY. Nothing is played on Chessable's board, nothing is graded,
    recorded or rescheduled. Its ONE side effect is stopping the clock, and only
    after the trainer has stood still for `leadPauseAfterMs` — a blanket pause
    would be simpler and is wrong: a paused board takes no input, so section 13
    could not inject the cards it is answering underneath and §3.1's parallel loop
    would collapse into a sequential one. Never paused in a hidden tab.
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
    the whole `.clo-sg` group when show-and-grade is switched off. So turning that
    off turns the lead-in off with it.
  * `playPlyOnBoard`'s post-glide reconcile reads `sg.active || leadActive()` —
    without the second half a castling rook, an en passant capture or a promotion
    stays as the glide left it for the whole replay, since the mode is off.
  * `stop()` and `startMode()` both END a lead-in before doing anything else, and
    `stop()` does it ABOVE its `!sg.active` early return — with the mode off the
    lead-in owns the board AND the pause, and `endLead` is the only thing that
    gives either back. `pagehide` calls it for the same reason.
  * ITS PANEL PRINTS NO MOVES: the prompt line is deliberately empty, since a
    move list growing there was reported as distracting and the board beside it
    is already the whole feature. The VOICE still says each move, so the step
    calls `speak` directly rather than `announce`, which is the seam that also
    writes the panel.
- Course tree (sections 24, 24b, 24c, 24d, 24e, 24f, 24g and 24h, v0.127.0): the
  whole course as a POSITION-KEYED graph, browsed as Miller columns on
  `/course/<bid>/`, beside section 21's panel and sharing its `fetchCourse`
  session cache — so opening the tree after a coverage run costs no fetch. 24b
  scans the LICHESS DATABASE as you browse (opt-in) and lists the popular moves
  the course never answers, now with a WIN RATE on every row (24f); 24c is the
  keyboard, the find-a-line field and the flip; 24d keeps the frontier column
  still; 24e gives a position stood on mid-run a column of its own; 24g runs
  section 19's ANALYSIS BOARD — engine, database and all three writes — inside
  the tree's own window; 24h lists the SPLIT POSITIONS and offers the
  alternatives check that says which cards will refuse.
  **READ `DESIGN-course-tree.md` BEFORE CHANGING ANYTHING INSIDE THIS MODULE.**
  It holds the walk, the fold, the columns, the measurements and the version
  history. §12 is the LIVE GROUND TRUTH (measured by `dev/probe-course-tree.js`
  over all three courses on the account) and it OVERRIDES §3.5, §5.1 and §8;
  §15 is the Lichess scan and REVERSES §7 about fetching. Where else to look:
  §5 + §12.1 the fold · §12.5 the cycle · §12.6 no root, and `courseSide`'s
  majority · §14 the window and its measured columns · §14.3 the hover preview ·
  §15.1 one request per column DRAWN · §16 the gap list and its two arms ·
  §16.3 the frontier column and the tabs · §17 the mid-run column · §18 the win
  rates · §19 the split scan, whose §19.2 is the measurement deciding its one
  real judgement. What follows is only what an edit ELSEWHERE can break.
  * IT NEVER WRITES. Editing from a tree row belongs to sections 12 / 19c / 19d,
    which already do it safely — and that includes the 24b rows naming a move the
    course is MISSING and 24h's split rows, which are the two most tempting
    places in the file to put an "add it" button and still must not have one.
    24g is not a loophole: what a row offers there is a BOARD, and a board has
    always written, behind section 19's own arming presses, rights probe and
    read-back.
  * `isKey` IS NOT USED AND MUST NOT BE ADDED BACK. §3.5 hoped it was the
    author's own "this is the move that matters"; §12.4 measured it at 79-99%
    of plies, so it highlights nothing. It is also the ONE field that would
    need adding to `reduceCourse`'s reduced shape — i.e. a bump of
    `CONFIG.coverage.cacheKey` and a cache-wide invalidation SHARED WITH
    SECTIONS 21, 25 AND 27, for a signal that is noise. (Section 25 is the
    exception that proves it: `keys` is that section's whole subject, and adding
    it cost exactly that bump.)
  * KEYED ON `cacheKey`, NOT `repKey`, AND THAT IS DELIBERATE — the two
    neighbouring features really do use two different position keys. Both sides
    of every comparison here come out of `walkVariation` and are EXACT, so there
    is no reason to accept 6c's lossy key. Measured §12.3: ZERO positions
    actually collapse under `repKey` but not `cacheKey` on any real course, so
    this costs nothing — a free choice, not a bet. 6c's key is right for 6c,
    whose review-mode FEN is DOM-derived and cannot be trusted about either
    field; section 27's `stormCoverKey` is a third, right for its own question.
  * WHOSE MOVE IT IS DECIDES WHAT AN UNCOVERED MOVE MEANS, and `courseSide`
    CANNOT ANSWER IT. On the opponent's move a popular uncovered reply is a
    hole; on the user's own it is a repertoire decision (1…c5 over 1…e5), and
    drawing the second as a gap paints every course red for having an opinion —
    section 6c's rule, for section 6c's reason, and section 27's §19 inherits it
    again. `courseSide` is a course-wide MAJORITY and §12.6 measured it
    answering 'w' for a course holding 15 Black lines, so the walk counts `w`/`b`
    PER MOVE (two ints on an `answers` entry) and `positionSide` sums them; a
    position both colours pass through answers NULL and the distinction is
    simply not drawn. 24h needs a THIRD reading again — per MOVE off the LINE's
    own side, since `positionSide`'s null at the standard start position hides
    real splits (§19.2). `dev/check-course-tree.js` asserts all of it, because
    this is the judgement here most able to be wrong invisibly.
  * EVERY SAN FROM OUTSIDE IS RESOLVED THROUGH `sanToUci`, NEVER COMPARED —
    section 6c's v0.48.1 lesson, in three homes here: 24b's explorer moves
    (Lichess writes castling king-takes-rook), 24h's registered alternatives (a
    string the author typed, and Chessable over-disambiguates, §12.7), and the
    walk itself. One that will not resolve is DROPPED, never guessed at. 24h's
    alt list is additionally a JSON-encoded STRING and not an array (section
    23's ground truth) — a correct field name alone still reads as empty.
  * THE LICHESS SCAN IS ONE REQUEST PER COLUMN **DRAWN** (24b), and that
    sentence is the entire licence for it (§15.1). `wantDb` is called from
    `renderColumns` and NOWHERE ELSE — not from `columnsFor`, which walks
    THROUGH auto-taken and off-screen columns, never from a hover, never from
    inside a folded run, and never per ROW. Opt-IN, off by default
    (`cloTreeLichess`, storage.local), read once: this toggle has exactly one
    host, unlike the filters and the touch keys. A failure is REMEMBERED in
    `ct.db` as `{error}`, or a rejected token is one request per redraw for
    ever; toggling off and on is the retry.
  * IT SHARES `cloPopularityCache` WITH SECTIONS 14 AND 21, and imposes three
    things on that shared code:
    - IT RE-READS BEFORE IT WRITES (`flushDbCache`). `savePopCache` writes the
      object whole and this panel holds its snapshot for a whole sitting, so
      saving that back would silently delete every position the coverage report
      filled meanwhile. Section 21's window is one RUN, which is why it has
      never needed this. (The rule now has four homes; see 27's store, 28's
      presets and 30b's window.)
    - `fetchPopularityCounts` ALSO RETURNS `wdl` AND `score` (24f), and all
      three fillers of the cache write them through the shared
      `popCacheEntry(got)` — sections 14 and 21 want only "how often" and ignore
      both, but whichever of the three paid for a position, the tree can read
      its win rates back. STORED AS `[white, draws]` AND NOTHING ELSE: Black is
      `counts[san] - w - d`, exactly, and `popEntryWdl`/`popEntryScore` are the
      only readers — never open-code that derivation. Not miserliness: the cache
      keeps 3000 positions of up to 50 moves in `storage.local`, and a third
      array per move is a third of a quota nobody notices spending until a write
      starts failing.
    - NO NEW CACHE KEY, deliberately. An entry written before v0.126.0 parses
      fine and is silently missing `r`, which reads as "no result data" — a
      share is still a share, and invalidating three features' caches to add a
      decoration would be the wrong trade. Instead `drainDb` treats a hit with
      no `r` as a MISS **once** and puts the split back for everyone; the hit is
      KEPT as the fallback, so a failed re-ask costs the bar and never the row.
  * `refreshColumns` IS DEFERRED AND MUST STAY THAT WAY. `wantDb` is called from
    inside `renderColumns`'s own loop, and `drainDb` — though `async` — runs
    SYNCHRONOUSLY once `ct.dbCache` is loaded, because its only await sits
    behind an `if`. A cache hit therefore re-entered `renderTree` mid-draw and
    the panel showed a column twice. A re-entrancy flag is the WRONG fix: it
    would have to drop the inner redraw, which is the one carrying the new data.
  * THE KEYBOARD IS BOUND ON `document` IN CAPTURE PHASE (24c) — the panel fills
    the window and is almost never focused. It stands down for a modifier chord
    and for any focused text field, so Ctrl-F and every box on the page beneath
    still work, and it is wrapped in a try/catch for section 23's reason: a key
    handler that throws is SILENT. IT ALSO STANDS DOWN WHILE 24g's BOARD RUNS —
    section 18's swallow is a capture listener on `document` too, and
    `stopPropagation` does not silence a second listener on the SAME node, so
    without it the arrows would walk the columns underneath the board and Escape
    would close the window out from under it.
  * IT OWNS TWO BRIDGES, both 24g's and both null-safe.
    `continuationTreeApi = { open(given, slot), close() }` — section 18's, whose
    `open` returns FALSE when the board could not be shown, the same contract
    `continuationDrill` has and for the same reason: the tree's own status line
    is the only place that can be read. And `courseTreePanelSlot`, the panel's
    fourth host (see the Key mechanics entry; section 27's `stormPanelSlot` is
    the fifth, and both are read through `inHostPanelSlot()`).
  * IT READS, all optional and additive: section 6c's `ensureRepertoireIndexes`
    / `repertoireAnswersAt` / `repertoireMoveState` for the badges — with no
    repertoire nominated the rows simply carry no mark. `col.repAnswers` is now
    ONE ANSWER MAP PER SLOT and `badgesFor` returns a fragment of up to two
    marks, wearing 6c's own hue-and-shape vocabulary (`.clo-ct-badge--a/--b`
    set the same `--clo-rep-hue` the panel's do) — and the shared explorer
    machinery `fetchPopularityCounts` / `popCacheTag` / `loadPopCache` /
    `savePopCache` / `sanToUci` / `fenAfterUci`, all unchanged. 6c's
    unprepared-reply WARNING is still deliberately absent even now that the
    popularity IS fetched: that badge is a claim about the nominated
    REPERTOIRE, and these columns are about the course on screen. 24b's own "no
    answer" tag is the same shape of statement made about the right subject.
  * `openAnalysis(given)` IS HOW A HOST ANSWERS FOR ITSELF (24g), and it is a
    contract on SECTION 19. The two original hosts READ the page — which move is
    highlighted, which variation the URL names — and a course page has none of
    that markup; it has an INDEX, which knows the same facts EXACTLY. So
    `analysisStartFen`, `analysisEntryMove`, `analysisSource` and
    `analysisSourceTitle` prefer `cr.an.given` and fall through to their DOM
    paths when it is null; every field past `startFen` is optional. `playUci` is
    the one nothing else wants: the gap move played as the line's FIRST PLY
    rather than made the start position, since the comment an added line goes
    into hangs off the move BEFORE it.
    …AND `given` IS NEVER TAKEN ON TRUST: `openAnalysis` keeps only an argument
    carrying a STRING `startFen`, the one field a host must supply (which is
    also what `continuationTreeApi.open` already refuses without). BOTH ORIGINAL
    HOSTS MUST WIRE THEIR ANALYSE BUTTON THROUGH `() => openAnalysis()`, NEVER
    BARE — a bare listener hands argument 0 the MouseEvent, and every reader
    above then takes the `given` path with nothing in it: "Add as line" disabled
    for want of an `entry`, with NO reason on screen because an Event has no
    `entryWhy` either, "Add as variation" refusing with 24g's sentence about no
    variation reaching the position, and a puzzle named ''. Silent on both hosts
    from v0.126.0 to v0.129.0, since that wiring predates the parameter by
    ninety versions.
  * THE CHAPTER IS THE ONE THING `getList` DOES NOT SAY, and 19c's body needs it
    (`target.chapterId`). `getList` ALSO TAKES A `lid` and answers that chapter
    alone (ground-truthed 2026-08-22 on course 453453: 16 + 64 = 80), so
    `fetchVariationChapter(bid, oid, cr)` reads chapters one at a time and stops
    at the oid — memoised per document like `importTargetsOnce` beside it. It is
    resolved BEHIND the open, into the very `source` object section 19 holds,
    because almost no board is opened in order to write. `analysisSource`
    refuses politely when a press beats it, and it tests for ABSENCE, never
    falsity: `lid` 0 is a real chapter ("Main Level"). Section 27's §15 uses the
    same helper for the same reason.
  * PLACEMENT IS `cr.hostSlot` (`cr.treeSlot` until v0.130.0, when section 27
    became the second guest), a FUNCTION the tree supplies, checked before
    `cr.standalone` in `positionOverlays`. Same `position: fixed`
    (`.clo-cr-inhost`) and NO scrim — the tree's window is what hides the page,
    and a second dimming layer would darken the columns the board is being read
    against. Both continuation ticks return early on it, exactly as they do for
    a standalone drill: this run is about the COURSE, not the page under it.
  * THE PANEL IS MOVED ON THE PRESS, not on the next poll: `openExplore` and
    `exitExplore` both call `topPanelTick()` — a plain top-level function of this
    file, the same reach the tree already has to `fetchCourse` — which re-asks
    `topPanelHostNow()`. Without it a database table sits over the course page
    for up to 500 ms after the board has gone (seen live, and a driven tab's
    throttling stretched it to a minute).
  * THE TEARDOWN IS NOTICED, NEVER SIGNALLED. `closeReview` nulls `cr.hostSlot`
    and the tree's own tick sees `continuationActive()` go false and puts the
    columns back — a teardown that has to remember to tell someone is one that
    will eventually forget. The tree's × closes the board FIRST, though, since
    hiding the window would otherwise leave a board floating over the page for
    up to a tick. (Section 28b's set-up board inherits this discipline.)
  * ITS LAUNCHER IS A DOCK ITEM (see THE CORNER DOCK in Key mechanics). It used
    to be `position: fixed` at `bottom: 54px`, one of four hardcoded offsets in
    that corner; it now appends to `cornerDock()` and picks an `order`.
  * ITS NARROW SHAPE IS A `@container` QUERY, NOT `@media`, and that is what
    makes it checkable: `dev/harness.html` sizes a CARD, never the viewport, so
    a media query could never fire there. The panel's width is 880px clamped by
    `100vw`, so the two rules answer identically and only one can be measured.
    (Section 27's window took the same rule, and its `size` container is what
    lets an `orientation` clause work at all.)
  * A COURSE WHOSE LINES MOSTLY WILL NOT REPLAY REFUSES, with them named in the
    console. Section 21's lesson: a parse detail taken at face value once
    produced a confident "0 of 77 present · 0 missing".
- Key moves vs difficult moves (sections 25, 25b, 25c and 25d, v0.122.0): the
  moves the user actually gets WRONG must not be the moves Chessable's "Key
  Moves Only" study mode silently plays for them. A course-page panel
  (`/course/<bid>/`) reads the key range back out of the course, reads the
  per-move record out of the Difficult Moves feed, lists the difficult moves
  sitting OUTSIDE the range, and lowers each variation's key range to cover them
  through the quick-edit driver — and, once a move stops being difficult, puts
  the range BACK where it came from (25b). Optionally it pools that record by
  POSITION rather than by card (25c), which is the only way to see a move that
  is hard in a line where it is never even asked; 25d covers a move the user has
  barely been ASKED as well.
  **READ `DESIGN-key-moves.md` BEFORE CHANGING ANYTHING INSIDE THIS MODULE.**
  §1 is how a key range is stored and the string-comparison bug in Chessable's
  own handler · §4 the reconstructed page-order rule and its measured error ·
  §5 the write · §7 the restore, §7.1 the baseline store, §7.2 `propose()` and
  §7.4 the two arming states · §8 the spread, §8.1 pooled-not-averaged and §8.2
  add-only · §9 never-asked, §9.2 what a LEVEL is (read out of Chessable's own
  bundle: null/0 is "no record" and not level zero, the reported value is the
  internal level PLUS 3, and a failure RESETS the base), §9.3 why the question
  must be asked of the POSITION, §9.4 the read and its cost. What follows is
  only what an edit ELSEWHERE can break.
  * A KEY RANGE IS ONLY EVER MOVED TO A PLY THIS FEATURE CAN NAME EXACTLY.
    Earlier, to a difficult move in the user's own record; later, ONLY back to
    the ply this feature itself took it from, recorded at the time. Never to an
    estimate, and never past an end mark. That is why §4's reconstruction of
    Chessable's rule may LOWER a range and may never raise one: its whole
    measured error is "later than Chessable", and later-than-Chessable as a
    RAISE stops asking for material the user is being tested on.
  * THE DRIVER JOB CARRIES `fromPlyIndex`, the ply the mark is expected to be on,
    and REFUSES when it is anywhere else — a constraint on the SHARED quick-edit
    driver (section 12). That guard is not optional now that the write moves a
    range in either direction: "the mark is earlier than the target" used to be a
    safe surprise to shrug off and is now a legitimate instruction.
  * `difficultRowAccuracy(row)`, `difficultRowCounts(row)` AND
    `difficultPlyIndex(v, row)` ARE TOP LEVEL AND SHARED WITH SECTION 13b.
    `difficultRowAccuracy` is the accuracy rule — timeouts dropped from BOTH
    halves of the fraction, `giveU` still counting — and it is shared precisely
    so the two features cannot disagree about which moves are hard; 13b's
    `reduceDifficultRow` calls it, and the threshold is 13b's too
    (`cloDifficultThreshold`). NOTHING ABOUT DIFFICULTY IS RE-DECIDED IN 25.
    `difficultRowCounts` exists because pooling needs the two NUMBERS and not the
    ratio — averaging six percentages would weight a 9-attempt card like a
    56-attempt one — and `difficultRowAccuracy` is expressed in terms of it, so
    13b's rule is still stated once. `difficultPlyIndex` returns -1 rather than a
    guess when the SAN at the computed ply does not match the row's
    `correctMove`: that index is what a key range gets lowered to cover, and
    covering the wrong move is worse than covering none.
  * `reduceCourse` CARRIES THREE THINGS FOR IT, and each cost a bump of
    `CONFIG.coverage.cacheKey` SHARED WITH SECTIONS 21, 24 AND 27 — a listing
    written by an older build parses fine and is silently missing the field,
    hence a new KEY rather than a version check, so old entries age out. The
    bumps, in order: per-ply `keys` (`cloCourseListCache` → `…2`); then
    per-variation `unstudied` and course-level `keyMode` (`…2` → `…3`); then
    section 27's per-variation `paused` and course-level `allPaused`
    (`…3` → `…4`, and only 27 reads either). `unstudied` is `learnMW`/`learnMB`,
    ground-truthed 80/80 as the count of that variation's user moves with no
    level (`reviewM*` is the count currently DUE); `keyMode` is the user's own
    study mode for the course (`isKeyMode`, matching the per-move
    `default_study`) and the panel STATES it while nothing branches on it — a
    range still outlives a mode switch. Section 24's note that `isKey` "must not
    be added back" was about adding it to the TREE, where it is noise; here it
    is the whole subject.
  * `analyse` IS ASYNC AND YIELDS EVERY `chunkVars`, because the spread walks
    every variation with CloSan — measured 2.0 s for 80 variations
    synchronously, i.e. a frozen tab. ONLY the spread path yields: without it
    the analysis is a few milliseconds and the macrotasks would cost more than
    the work.
  * THE FIX PASS IS SEQUENTIAL AND TWO-PRESS. One variation is one driver visit
    — a focused popup, a page load, a submit — so it is a watchable, stoppable
    queue with a local watchdog per variation (section 19's rule: the worker's
    job timer does not survive an idle restart) and a `maxWrites` cap. Section
    19c's arming press, for section 19c's reason.
  * IT OWNS NO BRIDGES and is called by nothing. It reads `fetchCourse`,
    `dropCourseCache`, `chessableCreds`, `chessableBooksOnce`, `sideOf` and
    `popupDriverBounds`, all shared and all unchanged.
  * ITS LAUNCHER IS A DOCK ITEM (THE CORNER DOCK, in Key mechanics) — it was the
    top of the four-offset stack, at 92px.
- ChessDB eval column (section 26, v0.128.0; side by side with Stockfish and
  colour-coded since v0.129.0): a cloud-analysis eval beside every move in the
  Lichess panel — where the explorer says how OFTEN a move is played, this says
  how GOOD it is, at book depth, with no WASM and no engine running. OPT-IN
  (`cloChessdbEval`, storage.local, absent = off; checkbox in the panel's own
  cogwheel menu, section 6b). It is the SECOND host permission this extension
  has ever had.
  **READ `DESIGN-chessdb.md` BEFORE CHANGING ANYTHING INSIDE THIS MODULE.**
  §2 the wire and §2.3 the encodings · §2.4 why `queue` must never be called ·
  §3 the three findings the design rests on: §3.1 THERE IS NO DEPTH FIELD and
  both candidates look exactly like one, §3.2/§3.3 why it is TWO requests per
  position and nothing inside a `learn=1` answer distinguishes a book entry from
  an on-the-fly fill-in, §3.4 `unknown` · §4 coverage · §5 the gate · §6.1 the
  engine section and §6.4 the side-by-side layout with its measurements · §7 the
  column's three inherited constraints and §7.1 the colour ruling it reverses ·
  §10 what is still unmeasured. What follows is only what an edit ELSEWHERE can
  break.
  * THE WORKER ALLOWS `queryall` AND NOTHING ELSE (`handleChessdbFetch`,
    background.js). `queue` and `store` are this API's two WRITES — they spend a
    volunteer network's compute, ground-truthed live (a queued position came back
    analysed ~25 minutes later) — so the guard is an ALLOW-LIST OF ONE rather
    than a block-list, and nothing may reach them from a poll or a scan. Section
    27 leans on this: its walk stops on `unknown` constantly and "ask them to
    analyse it" is one URL parameter away.
  * `cdbWanted()` IS A PRIVACY GATE BEFORE IT IS A BUDGET ONE. The column is
    opt-in because chessdb.cn is a SECOND third party seeing the position, so
    nothing may ask on a user who has switched nothing on. Since v0.129.0 the
    only exception is the `chessdb` SOURCE, which has nothing else to fall back
    to; `auto` was in that clause and MUST NOT go back — the companion's gate is
    `cdbCurrent()`, which requires the column, so an `auto` user with the column
    off would have every position sent twice for an answer nothing ever reads.
  * IT NEVER DELAYS THE LICHESS TABLE. `requestCdb` is fired from `refresh()`
    ABOVE the explorer cache short-circuit (so a cached position still gets its
    evals) and is deliberately NOT awaited; the cells are drawn empty and filled
    by `fillCdbEvals()` a round trip later. `state.cdbFen` is what stops a
    previous position's evals painting onto the current rows — never assume it
    equals `state.fen`, which is the whole reason `cdbCurrent()` exists.
  * THE EXPLORER'S UCI IS RESOLVED THROUGH CloSan BEFORE THE LOOKUP, never
    compared raw — section 6c's v0.48.1 rule, from the OTHER side of the same
    trap. Lichess writes castling KING-TAKES-ROOK (`e1h1`); ChessDB writes
    `e1g1`, which is what CloSan and every index in this file use. So the CDB map
    is keyed by ChessDB's own uci and each Lichess row is resolved with
    `sanToUci` into that spelling (`tr.dataset.cdbUci`). A raw compare misses
    exactly the castling rows, and SUCCEEDS everywhere else.
  * SCORES ARE THE MOVER'S; THE PANEL IS WHITE'S. `cdbEvalText` flips on Black's
    move, because the engine section directly above the table is normalised to
    White (in engine.js) and two conventions in one panel is one too many. This
    is the opposite call from 24f's mover-score, which has no engine beside it.
    THREE SCORE BANDS, and a plain centipawn read is wrong in two of them: a mate
    is `30000 - distance` and a TABLEBASE result is ~`25000 - DTZ`, so without
    the bands a rook endgame prints "+249.78" — a plausible-looking number that
    never throws. The lettered note is the authority; the numeric band is the
    fallback.
  * A TONE SETS `--clo-ev-tone`, NEVER `color`. Each host reads
    `color: var(--clo-ev-tone, <its own default>)`, which is what keeps the
    green<->red ramp out of every specificity fight in the stylesheet — no
    doubled selector, no order dependence, and Stockfish's own numbers stay
    uncoloured by simply not being given a tone. `applyEvalTone(el, tone)` is the
    one writer. Four constraints on the ramp itself, all load-bearing: it is
    WHITE'S PERSPECTIVE, the same as the digits, so it says which SIDE is
    favoured and never "this is the good move" (a green "−1.5" is the version
    24f's ruling was right about); the tone is computed IN `cdbEvalText` off the
    same `signed` value as the text, never by a second function reading the text
    back, because a colour disagreeing with the sign beside it is completely
    silent; the hues are its own (`--clo-ev-*`), never the accent green or
    `--clo-rep-risk`, since the repertoire badges are 9px marks one column over;
    and `eq` sets NOTHING, so an equal position stays plain dim text.
  * UNDER `html.clo-touch` THE GAMES COLUMN IS HIDDEN when this column is on, and
    that is a MEASUREMENT, not a preference: the four-column touch table is
    already at the edge (330px panel: needs 328, has 328) and at the panel's own
    300px minimum it overflows by 11px unaided, so a fifth column does not fit.
    Games yields because % says the same thing and the exact count is kept in the
    percentage cell's tooltip. ANYTHING ADDED TO THIS TABLE HAS TO RE-MEASURE.
  * IT ALSO ANSWERS THE ENGINE SECTION (§6.1, `cloEngineSource`:
    `auto` | `chessdb` | `local`, options page) — under `chessdb` OUTRIGHT, and
    under `auto` BESIDE Stockfish (§6.4). `syncEngine` branches BEFORE its
    ordinary analyze, and four rules an edit elsewhere can break:
    - THE GATE IS `cdbEngineReady()`, i.e. "at least one move here is in the
      book", never a depth (§3.1). Under `chessdb` nothing is ever booted, which
      is that state's whole purpose, so an unknown position gets a sentence
      rather than a search.
    - `syncEngine` HOLDS WHILE AN ANSWER IS IN FLIGHT (`state.cdbPending`,
      compared on `cacheKey`) — SCOPED TO `chessdb` since v0.129.0, where it buys
      the promise that state exists for. The hold is released in a `finally`,
      because a hold that outlives its fetch is an engine section that never
      starts at all.
    - `applyCdbAnswer` CALLS `syncEngine()`. The source decision is not
      answerable until the answer lands — before it, `cdbEngineReady()` is false
      for want of data rather than because the book is ignorant. That function
      also repaints the companion, since the book can land AFTER the search
      (cached explorer data, engine already running); `state.enginePvs` /
      `enginePvsFen` keep the last update, and the fen guard is what stops one
      position's lines being annotated with another's evals.
    - THE EVAL COMES FROM `queryall`, NOT from the `querypv` replies. queryall
      already scored every move from the PARENT's mover perspective; taking the
      child's score instead means negating it back up a ply, which is the kind of
      arithmetic that is wrong in one case out of four and looks right in the
      other three. The pv reply is used for its `pvSAN` continuation only.
    THE JOIN TO STOCKFISH IS `pv.uci`, which `engine/engine.js` sends beside
    `pv.san` — that san is a numbered STRING ("5.Nf3 Nc6 …") and joins onto
    nothing. Both engines spell castling `e1g1`, so 6c's trap is not on this
    path. The section is LABELLED "ChessDB" whenever it is the source, and the
    depth slot says `book · N ply line` rather than borrowing the word "depth"
    for a number that means something else entirely.
  * IT OWNS NO BRIDGES and is called by nothing. It reads `cacheKey`, `sanToUci`,
    `fenAfterUci`, `CloSan` and the panel's own `state`/`ui`, all unchanged.
  * EVERYTHING FAILS SOFT: an unreachable host, a rejected fetch, or a position
    ChessDB has never seen (the ordinary case off theory, and for most tactics
    courses' custom start FENs) leaves an empty column and nothing else changed.
- Intuition storm on the repertoire's frontier (section 27, v0.130.0): the
  positions your own course lines END on, carried forward by REAL games — or,
  on the SECOND SOURCE (§19, "uncovered responses"), the position after a
  popular reply the course never answers at a position it answers OTHER replies
  at, most played first — one at a time against a clock; or, in the SET mode
  (§17), with no clock at all and no mistake left behind; and, since §28,
  narrowable to the part of the course that comes after a POSITION you name,
  gathering included. Chessable teaches a line and stops, and this asks what you
  do on the move after it stops. A move is graded for being DECENT rather than
  for matching an engine. Launched from the CORNER DOCK and from the COURSE
  TREE's header (24), on a full-window panel of its own; the board is section
  18's overlays in a fourth mode.
  **READ `DESIGN-intuition-storm.md` BEFORE CHANGING ANYTHING INSIDE THIS
  MODULE.** It is 400 KB and it is the whole feature: the loop, the pipeline,
  every threshold's measurement, the version history, the live ground-truthing
  and the control runs. Nothing of that is repeated here, and almost every rule
  in it fails SILENTLY — a wrong comparator still returns every position, a
  wrong perspective still prints a plausible number, a filter that never fires
  still yields cards. Where to look:
  * THE PIPELINE — §2 the wire · §3 the four findings the whole design rests on
    (§3.4's one-evaluator rule above all) · §5 the stop and pick rules · §6 the
    probe's measurements, which is where EVERY threshold in `CONFIG.storm` comes
    from (§6.5 refutes walking deeper; do not retry `minPly` 6) · §7 the eval
    band · §14.5 the producer · §14.9 the ply range · §14.13 the pre-roll ·
    §14.14 paused lines · §14.18 + §14.18.4 the stub filter and the walk stop ·
    §19 the second source · §25 the coverage key and the stored-position sweep.
  * THE GRADE — §14.8 + §14.23 + §14.24 the three tiers and the engine one's
    budgets · §14.20 which tier graded a card · §16 win probability and the five
    bands (§16.2 the calibration) · §23 Stockfish scoring at gather time, §23.7
    the one depth standard for every device · §26 the walk's own scorer.
  * THE STORE — §14.11 what it is and why `produceFromStore` runs first · §14.15
    /§14.19/§23.8 the draw order, term by term · §14.16 retirement and the
    tombstones · §14.17 the funnel and its conservation invariant · §14.21 +
    §28 the chapter and position scopes · §22 clearing it · §30/§30a/§30b the
    line spread and the window that outlives a session.
  * THE WIRE — §14.12 the transport · §14.25 + §15.7 the end-of-session pushes ·
    §27b one card per course, and §27b.3 the chapter they live in · §28b.4 the
    fourth card.
  * THE REST — §8 the storm itself · §14.10 the review, §14.10a the hidden best
    move, §14.10b Try again, §14.10c the card it ended on · §15 + §21 the
    performance record · §17 the set · §18 the four post-set changes · §20 the
    lead-in ply · §24 the wake lock · §27 the round · §28b/§28c the saved
    positions · §31 the upright stage.
  `dev/probe-storm.js` runs the entire pipeline against the live APIs and is how
  any rule change is re-measured; `--frontiers` is the cheapest question in the
  file to ask of a new course. `node dev/check-storm.js` executes the pure rules
  and two impure ones. What follows is ONLY what an edit ELSEWHERE can break.
  * IT OWNS THREE BRIDGES AND IS HANDED A FOURTH, all null-safe. `stormActive()`
    — the course tree stands down on it by HIDING its own window (same size,
    same z-index; two full-window panels at once is a state that should not
    exist) and so, for free, by its keyboard's existing `ct.panel.hidden` guard.
    `stormApi` (`open({bid,name})`, `answer(uci,san)`, `pass()`, `close()`, plus
    §17's `isSet`/`retry`/`reveal`/`advance`/`analyse` and section 29's
    `puzzleSolved`/`puzzleFailed`) — `open` returns FALSE when a session cannot
    start, the contract every launcher here has, and `answer`/`pass` are what
    section 18's `tryMove` and Skip call. `stormPanelSlot` is the panel's fifth
    host (below). And `continuationStormApi` (`open(card, slot, opts)`,
    `next(card)`, `verdict(v)`, `analyse(given, slots)`, `close()`), which
    section 18 owns: the traffic goes BOTH ways because each side does something
    the other cannot — 18 owns the board and the panel, 27 owns the queue, the
    clock and the grade. Section 18 knows exactly two things about a session,
    `cr.stormRetry` (§14.10b) and `cr.stormHold` (§17), and both change only the
    words `syncStormUi` prints, and both are cleared in `closeReview`. It CALLS
    `pinSyncApi.carrier` (16e) for all four of its cards, and reads
    `continuationActive()`.
  * THE PANEL HAS A FIFTH HOST, and it is the same placement as the fourth.
    `stormPanelSlot` is a SECOND supplier beside `courseTreePanelSlot`, both
    read through the top-level `inHostPanelSlot()`; `topPanelHostNow()` still
    answers `'tree'` for either, because the two differ only in which window
    measured the rect and a second host string would need a second placement
    branch doing exactly the same thing. That slot exists ONLY while the
    review's analysis board or §28b's set-up board is up — during a card the
    database's top move would name the answer, which is section 20's reason for
    leaving the panel's ordinary stand-down in place. `panelSlot()`/`dbSlot`
    read `st.analysing || st.fenBoard` and NEVER a retry board (§14.10b).
  * `cr.treeSlot` IS `cr.hostSlot` (+ `cr.hostKind`, `'tree' | 'storm' | ''`),
    `.clo-cr-intree` IS `.clo-cr-inhost` and `positionInTree` is
    `positionInHost`. Nothing about the mechanism changed — 24g's rules are
    unchanged and apply to both guests — only the name.
  * IT HAS TWO LAUNCHERS (v0.183.0): one in the CORNER DOCK (Key mechanics) and
    the course tree's own, which it had alone until the dock existed. THE DOCK
    ONE NEEDS NOTHING OF THE TREE'S: `startSession` reads the course listing
    itself and §14.11's store usually answers before that lands, which is what
    makes one click honest. `syncLauncher` is called from the TOP of `tick`,
    ABOVE its `!st.running` return — the launcher's whole job is to exist while
    no session does — and hides on `st.running` (the window covers the page) and
    on `continuationActive()` (a board of ours is up, so `open` would refuse; a
    control that cannot act must not be on screen to be pressed).
    `st.launchBid` is read off the url every tick and is deliberately NOT
    `st.bid`, which is the course a SESSION is about.
  * **IT MUST NEVER CALL CHESSDB'S `queue` OR `store`, and this is the single
    most tempting place in the codebase to break that rule** — see section 26's
    allow-list bullet, which is the guard, and why this feature is what it is
    guarding against. A storm would spend that volunteer compute in bursts of
    hundreds.
  * IT NEVER WRITES TO THE COURSE (section 24's rule, and this feature has the
    same tempting button one line away — "add this position as a puzzle" from a
    storm card; 19d/19e already do that safely from a BOARD), never touches
    Chessable's board, and reschedules nothing.
  * NO NUMBER IT SHOWS MAY BE PRESENTED AS A BOOK EVAL. It grades on `learn=1`
    only, where a real book entry and an on-the-fly fill-in are
    indistinguishable (DESIGN-chessdb.md §3.3) — which is fine for RANKING a
    move against the other moves in the same position, and is why one request
    per position is enough — so a ChessDB-graded verdict wears `.clo-cdb--est`,
    section 26's existing "computed for us just now" styling. `stormEstimated(v)`
    is the ONE predicate both display hosts read (section 18's `syncStormUi` and
    section 27's `renderReview`) and it is FALSE for both ENGINE sources and for
    a PUZZLE (§14.20; section 29) — that class is a claim about where a number
    came from, and §3.3's rule broken in either direction is silent.
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
    exists to work without. §19's second source needs neither game nor PGN and
    so never touches this permission: `askMoves` reads `explorer.lichess.org`
    only, and must not be "unified" with `askGames`, whose parameters are its
    exact opposite (`moves` on, `topGames`/`recentGames` off).
  * `fetchExplorerData` MUST KEEP `topGames:'0'`/`recentGames:'0'`. The panel
    fetches on every position change and wants nothing it will not draw; the
    storm makes its OWN explorer call with them on, and with RELAXED filters
    (`C.speeds`/`C.ratings`, never the module-level `lichessFilters`) — §6.4
    measured 5 of 14 frontiers with no games at all under the user's own bands.
  * IT DOES NOT TOUCH `cloPopularityCache`, and that is a deliberate departure
    from the design's §9. That cache is tagged with `lichessFilters` and a moves
    limit; the storm asks with different filters and `moves: '0'`, so it has
    nothing correct to write there and 24b's `flushDbCache` hazard cannot arise.
  * IT CLAIMS THE SHARED ENGINE THE WAY SECTION 15 DOES (`state.altCheckBusy`
    set with `state.engineFen` nulled first, so `syncEngine` stands down and
    sends no stop), and `endEngineJob` is the ONE place that gives it back — on
    the answer, on the timeout, on an engine error and on `endSession`. A leaked
    claim is a panel whose engine never starts again. FOUR passes want that one
    `st.eng` slot — the GRADE (§14.23), the DEEPEN pass (§23.7), the WALK's own
    scorer (§26) and §18.2's BACKGROUND top-up — and the last three all YIELD to
    the grade, standing down on `st.grading`, `solving()` and `st.eng`, because
    the grade's own bail is "the engine is already claimed" answered as
    `No verdict`, which is silent.
  * THE WORKER REBUILDS THE ANALYZE MESSAGE FIELD BY FIELD
    (`handleEngineAnalyze`, background.js), so a per-request engine option added
    at either end and not added THERE is dropped in silence — the search still
    runs, at the previous request's width. That is how a 12-move list would have
    been stored as three, with nothing in the console.
  * `stormCp`, `stormVerdictLine`, `stormBestLine`, `stormEstimated`,
    `stormSourceLabel`, `stormSourceTitle`, `stormSharePct`, `stormGapNote` AND
    §29's `stormPuzzleReviewLine` ARE TOP LEVEL AND MUST STAY THERE. Section
    18's panel prints those lines while a card is up and section 27's review
    prints them again afterwards — two closures, so a helper living in either
    one is a `ReferenceError` in the other. `node --check` cannot see it and
    neither can a sliced check, which flattens every scope into one.
    `dev/check-storm.js` §0 asserts the indentation instead.
  * THE CARD CARRIES EXACTLY ONE PLY, the position's own best move, and that is
    load-bearing rather than decorative: section 18's `startLine` ends in
    `step()`, and an EMPTY ply list reads there as "this line is already
    finished", so the card would be skipped the instant it reached the board.
    `tryMove`'s storm arm intercepts ABOVE the comparison, so that ply is never
    used as an answer — only as what makes a card a card, and as the "best" the
    verdict line names.
  * THE REVIEW'S BOARDS ARE SECTION 11c's STATIC ONE (`.clo-cr-mini`), best move
    GREEN and played move RED — so section 11c's three caller rules apply, and
    the second is the one to watch: `paintShape` takes a colour KEY or a CSS
    value and dropped anything else SILENTLY until v0.80.0.
    `dev/harness.html`'s own arrow helper resolves the same keys, or a replica
    could not be written in the terms the code is. That board's GLYPH FALLBACK
    is sized off the SQUARE, not the board — `.clo-cr-mini .clo-cr-piece--glyph`
    is `font-size: inherit`, so the board's own `font-size` IS the piece's type
    size (board/10, the convention every other host uses); set to the board's
    size instead it draws a 44px glyph in a 6px box, a
    smear that passes every rect assertion and that a live session never shows,
    real pieces being cloned SVGs sized in per cent.
  * FOUR PIECES OF SHARED CODE CARRY SOMETHING FOR IT, and each is invisible
    from the other end. `reduceCourse` carries per-variation `paused` and
    course-level `allPaused` (§14.14; the WIRE field is `paused` and the app
    calls it `isPaused`, so grepping for the UI's name misses it) — and it
    needed NO `CONFIG.coverage.cacheKey` bump for §15's oid, which was already
    in the reduced shape. `walkVariation` runs ABOVE every source test in
    `stormFrontiers` — ONE WALK, TWO USES (§14.18) — behind the existing
    `chunkVars` yield. 16e's `cardEntry`/`ensureSlot`/`carrier.write` took a
    card NAME and a CHAPTER parameter for §27b — the chapter resolved by NAME
    through the memoised `importTargetsOnce`, because a lid is per course —
    with three rules in that shared code: `lid` is honoured at CREATE and
    IGNORED ON OVERWRITE, so a card moved by hand stays moved and a failed
    resolve can only put a NEW card in Main Level; `ensureSlot` still asks
    `getList` WITH NO CHAPTER, which answers the whole course, so a card is
    found wherever it lives and the move needed no migration; and a failed
    resolve is NOT memoised — "no such chapter" is a real answer worth
    remembering, a thrown read is a fact about this minute. There is NO
    create-a-chapter call anywhere in this codebase. And any card added to that
    carrier must DECODE the way `syncStats`/`syncStore` do (§28b.5): `read`
    answers the comment VERBATIM in base32, so handing it straight to an
    unpacker leaves the version `undefined` and the exchange is silently
    PUSH-ONLY.
  * TWO PERSPECTIVE FLIPS, IN OPPOSITE DIRECTIONS, AND THE CHILD-NEGATION
    FALLBACK ARE THE SILENT FAILURES. `stormUserEval` reads a ChessDB score (the
    MOVER's) from the user's side and flips on WHOSE MOVE IT IS IN THE POSITION,
    never on which colour the course is for — the two are usually opposite, and
    getting it wrong inverts every frontier into a tidy column of backwards
    numbers. `stormMoverCp` does the same for a STOCKFISH score, which engine.js
    has already normalised to WHITE — so the two conversions run opposite ways
    in one feature. And `stormMoveLoss`'s fallback is `best + childBest` because
    the child's best is the OPPONENT's; written as a subtraction it is wrong by
    twice the child's eval, which looks entirely plausible.
  * A LOSS IS A SUBTRACTION, SO BOTH SIDES MUST COME FROM ONE EVALUATOR AT ONE
    DEPTH (§3.4) — the rule the whole grade hangs off, and the one an
    "optimisation" reaches for first. Four consequences, none of them tidyable:
    the engine tier is TWO searches unless a stored list already supplies the
    anchor; CHESSDB'S CHILD TIER IS UNREACHABLE ON A STOCKFISH LIST; a
    position's scored list is always ENTIRELY one source, which is what keeps
    `spread2`, `spread5` and `randomTopCp` comparing within one list; and an
    engine-graded line names the ENGINE's best move and score and prints NO win
    rate, which is a book figure.
  * `d` ON A STORED ENTRY IS THE WHOLE COMPATIBILITY STORY (§23): >0 means the
    move list is Stockfish's at that depth, ABSENT means ChessDB's — which is
    what every entry written before v0.158.0 holds. So no cache key moved and
    nothing migrates, and it rides the wire with NO `wireVersion` bump (`g`,
    `o`, `u`, `cl` and §20's third `a` element are the same shape: optional,
    absence read as "not recorded"). It MUST ride: a phone cannot run the
    search, so a desktop that deepened a position is the only way that phone
    ever grades it with an engine.
  * ITS KEYBOARD STANDS DOWN FOR A FOCUSED FIELD (§28.7). `onKey` is a
    `document` listener in CAPTURE phase that calls `preventDefault`, so without
    it an `s` typed anywhere in this window opens the stats table INSTEAD of
    inserting a letter and `b`/`t`/the arrows walk the review underneath. It
    returns for `INPUT`/`TEXTAREA`/`SELECT`, with Escape BLURRING rather than
    closing the window (24c's rule; 19d's for the `<select>` half, arrows and
    letters being how a selector is driven).
  * `.clo-st` IS A `size` CONTAINER, NOT AN `inline-size` ONE (§31), and that is
    the stacked stage's whole life support: it fires on `(max-width: 700px) or
    (orientation: portrait)`, and `orientation` is an answer about the block
    axis, so against an inline-size container that clause never matches and the
    stacked shape goes on firing at 700px and nowhere else, with nothing in the
    console. Safe here for the tree's reason — this window is `position: fixed`
    with `inset: 16px`, so neither dimension has ever come from its contents. A
    `dev/harness.html` replica added without an explicit inline HEIGHT will
    collapse under it, and every other size question in this window is a
    `@container` query for the same reason.
  * IT NEVER SHOWS THE SAME POSITION TWICE (`st.seen`, keyed `cacheKey`).
    Measured, not theoretical: duplicates arrive from two different games in the
    same run.
  * §19's SECOND SOURCE INHERITS TWO RULES FROM ELSEWHERE IN THIS FILE, and both
    fail by yielding a plausible session made of the wrong positions. A DECISION
    POINT IS AN **OPPONENT**-TO-MOVE POSITION: on the user's own move an
    uncovered popular choice is a repertoire DECISION (1…c5 over 1…e5) — section
    6c's rule, 24b's reason — so dropping the guard asks the user to improvise
    against lines they chose not to play and reads as the course being full of
    holes, and whose move it is comes from the LINE, never `courseSide` (24h).
    And THE EXPLORER'S UCI IS RESOLVED THROUGH CloSan, NEVER COMPARED against
    the covered set — section 6c's v0.48.1 trap from the other side, and here it
    misses exactly the CASTLING replies and succeeds on everything else, so the
    storm asks "what do you play against O-O?" about a position the course
    answers. §15's CHAPTER grouping has a shared-code cost of its own: `getList`
    does not say which chapter a variation is in (that is why 24g's
    `fetchVariationChapter` exists), so it is up to one request per chapter,
    behind a press, cached in `cloStormChapters` — and it can only answer for a
    course the user can ADD to, `getImportData` being the only call that
    enumerates chapters and bought courses being absent from it.
  * WHAT LOOKS LIKE A BUG HERE AND MUST NOT BE "FIXED", each argued in full at
    the § named: `k` ASCENDING in `stormStoreDraw` — unseen first, most-missed
    last; hardest-first was v0.130.0's order and starved the fresh material
    (§14.15). `stormWirePack`'s own `k`-DESCENDING sort, which is NOT the same
    question and stays (§14.15). UNKNOWN as the TOP reachability bucket, absence
    meaning "not recorded" and never "zero games" (§14.19). AN UNDEEPENED
    POSITION IS NEVER FILTERED OUT, only dealt later (§23, §23.8). A PAYLOAD
    THAT DOES NOT SAY WHICH COURSE IT IS FOR IS NOT FOREIGN, and the
    pre-v0.166.0 card is left in place rather than deleted (§27b). THE PICK
    RULES ARE STILL CENTIPAWNS while the grade is win probability, because they
    answer a different question (§16.5). `setCleanOn` and `storeDropOn` are
    WRITTEN OUT TWICE with the same membership (§16, §17). `stormSetHeld` is
    deliberately NOT `!stormSetClean` (§17.4). And `kind` stays `'list'` for
    both passes that share `stormEngineList`; `job.walk` is what tells them
    apart (§26.8).
  * FOUR RULES INSIDE THE MODULE ARE NAMED HERE ONLY BECAUSE A "TIDY-UP" FROM
    OUTSIDE REACHES THEM. Every comparator here (`stormStoreDraw`,
    `stormPuzzleDraw`) is PURE and rnd-injected precisely because a reversed one
    is undetectable from the outside, and a SCOPE filters the INPUT and must
    never become a term in one (§14.15, §14.21). `stormFilterPool` COPIES the
    pool array's own properties — `paused`, `covered`, `cont`, `through`,
    `throughAll`, `fenKeys` — so a plain `.filter()` silently switches
    §14.18.4's walk stop off. `st.dealtLines` is read by THREE deal points, a
    puzzle counting as the same repetition as a graded position (§30). And
    `stormLineKey` falls back to `oid || name` while §15's RECORD must never do
    so, the two asking different questions — which line to FILE an answer under,
    where a guess is a lie, against whether two cards are from the same line
    end, where being wrong merely DEFERS a card (§30a).

- Puzzles from the games that played your lines (section 29, v0.171.0): a
  tactic from a real game that went through one of the course's own positions,
  dealt instead of an ordinary storm card some fraction of the time. Source is
  the published `puzzle-explorer-data` set, through the extension's FOURTH host
  permission. Opt-IN and a PER CENT (`cloStormPuzzlePct`, absent = 0), in the
  pre-roll row beside the mode and the source, with the anchor BAND beside it
  (29.3).
  **READ `DESIGN-storm-puzzles.md` BEFORE CHANGING ANYTHING INSIDE THIS
  MODULE.** §2 is why a puzzle is ANSWERED and never graded, and §2.1 the four
  edits section 18 needed; §3 the anchor band, which is the measurement the
  whole feature rests on and the thing the first draft got wrong, and §3.1a the
  band as a setting; §4 the two gather stages and why they are split, §4.0 where
  they sit in a pass; §5 the store; §6 the wire; §7 scoring and §7.1 the set;
  §8 what it must never do; §12 collecting once (29.2); §13 the disguise (29.4);
  §15 the display surfaces and the five times they were forgotten. What follows
  is only what an edit ELSEWHERE can break.
  * A PUZZLE IS ANSWERED, NOT GRADED, and the two must never be "unified". A
    storm position has no right answer and is judged by how much of the game the
    move gave up (§16); a Lichess puzzle has a SOLUTION, so it is played by
    section 18's ordinary QUIZ path — which already walks a multi-ply line and
    auto-plays the opponent's replies. No ChessDB request, no engine search, no
    round trip. Routed through §3.4's three tiers instead, a tactic would be
    graded "decent" for a move that is not the win, which is the one answer it
    must not give.
  * THE CARD SAYS WHICH MODE IT IS. `continuationStormApi.open`/`next` read
    `card.puzzle ? 'puzzle' : 'storm'`, so no flag can disagree with a card —
    and a storm deals both kinds from one queue, so consecutive cards regularly
    differ. `isStormMode()` is the predicate for "section 27 is driving this
    board"; where a test really means "a GRADED card" it stays
    `cr.mode === 'storm'` (`tryMove`'s intercept and `moverColor`'s answer are
    both of that kind, a puzzle being played by the quiz path).
  * `step()`'S LINE-DONE ARM MUST NOT FALL THROUGH TO `nextLine`. A storm hands
    cards in ONE AT A TIME — `cr.queue` holds exactly the card on the board — so
    `nextLine` finds nothing after it and calls `finish()`, which tears the
    overlays down and ends the session on the first puzzle solved. Section 27
    owns the queue and the pause between cards, as it does for a position.
  * IN `pass()` THE SET ARM COMES BEFORE THE PUZZLE ARM. Routed the other way,
    "no idea" on a set's puzzle produces a `blunder` verdict which
    `stormSetHeld` holds BLIND — offering "try again" to somebody who has just
    said they have no idea, with the solution still hidden.
  * THE ANCHOR BAND IS A FLOOR AND A CEILING, AND THE FLOOR IS THE FEATURE
    (§3): below it a "match" means only that the game shared an opening. THREE
    rules in `stormAnchorAdd` — band membership is decided by a position's
    SHALLOWEST ply anywhere in the course (per line, it still produces a
    plausible anchor set with the generic positions quietly back in it); ply is
    ABSOLUTE in the game (`pliesBefore`), never an index into the line, or a
    custom-FEN tactics line numbers its first position 0; and side comes from
    the LINE (24h's rule), `m[2]` being the colour that SOLVES a puzzle.
  * THE PUZZLE'S OWN START PLY IS DELIBERATELY UNFILTERED. That is a different
    question and the answer is no: the median puzzle from these games begins
    around ply 55, so a start-ply band keeps only tactics inside the opening and
    throws away ~95% of the supply. What matters is that the GAME played the
    line, which is `m[3]`. Every host says so in those words and never implies
    the tactic itself is in the opening.
  * PICKED AT RANDOM AMONG SURVIVORS, never top-rated first: the build keeps at
    most 2000 puzzles per position BY RATING, so "highest rating" is the
    dataset's own truncation bias and would serve a diet of 2900s.
  * ITS STORE IS A PARALLEL SLICE (`cloStormPuzzles`), not a third entry kind in
    `cloStormPositions`. That object is keyed on `cacheKey(fen)` and every
    reader — `stormUnpack`, `stormStoreDraw`, `dropCoveredStored`,
    `stormWirePack`, `backfillStoreOids`, `stormFilterSource` — assumes a
    position shape; a discriminator inside it would put a branch in a dozen
    functions §14 is emphatic must stay pure and executable.
  * EACH KIND OF CARD TO ITS OWN STORE. `storeNote` is NOT called for a puzzle:
    its FEN keyed into the POSITION store can — rarely, but a puzzle IS found
    from a game that played these lines — collide with a real stored position
    and retire it for an answer that was never about it. `notePuzzle` is the
    puzzle half, and `puzzleDropOn`/`storeDropOn` are written out twice so a
    change to either is a deliberate change to both.
  * TOMBSTONES ARE NOT OPTIONAL (§14.16's rule, second home). Stage A is
    deterministic given an anchor, so a solved puzzle found again at the same
    position would be re-bought and re-offered — absence alone is not
    retirement.
  * ITS WIRE IS A CARD OF ITS OWN (§15.3's rule): the position payload is CUT to
    fit its budget, so a puzzle folded into it would be dropped whenever a
    position list ran long, silently and after the body fetch was paid for.
    ONLY THE READY LIST TRAVELS — candidates are regenerable and would eat the
    budget, while a ready puzzle is what a phone cannot produce. §27b's
    `stormWireForeign` is reused VERBATIM, which is why
    `stormPuzzleWireUnpack` must return `bid` and not `b`: named `b` it answered
    "not foreign" for every card of every course, silently. And it must DECODE
    the way `syncStats`/`syncStore` do (§28b.5) — `carrier.read` answers base32
    verbatim, and handing that straight to the unpacker made the exchange
    silently PUSH-ONLY from v0.171.0 to v0.181.0.
  * §15 GAINS A THIRD MAP, `plines`. A puzzle is answered and a position is
    graded, and the two bands mean different things, so pooling them makes one
    percentage out of two questions. `statsWireVersion` stays 2 (§19's
    precedent). `cardLineRef` is the join — a puzzle has NO `storm` block, so a
    reader that looks there finds nothing and the map stays empty for ever while
    looking implemented. Answers are counted against the ANCHOR's line.
  * EITHER QUEUE IS A CARD (`haveAnyCard`). Puzzles live in `pz.queue` and
    positions in `st.queue`, and `nextCard` draws
    `puzzlePick() || st.queue.shift()` — so a ready puzzle is dealable on its
    own, and BOTH Start guards must read the one predicate or they disagree and
    the bug wears two faces.
  * THE FOUR PLACES THAT DESCRIBE A CARD MUST EACH TAKE THE PUZZLE ARM FIRST,
    and every one of them shipped broken because a graded card and a puzzle look
    identical until something dereferences `card.storm` (§15).
    `stormPuzzleReviewLine` is TOP LEVEL beside the other three verdict-line
    helpers, for their reason; §14.20's `stormEstimated` / `stormSourceLabel` /
    `stormSourceTitle` each test `v.puzzle` first, or they answer as if ChessDB
    had scored a card it never touched; `applyStormArrival` tints the blunder
    from the CARD and not from `storm`; and `syncPuzzleUi`'s reveal gate is
    `hold.revealed` AND NOTHING ELSE, §17's masking rule applied to a solution.
    A puzzle row's loss column is `—`, never `?`, which means "could not be
    scored" and reports a grading failure that never happened.
  * THE COLLECT BUTTON IS FILLED WHILE THIS COURSE HOLDS NOTHING (29.5,
    v0.184.0, on request) — the ONE exception in that window to
    DESIGN-ui-inventory §3's "one primary and Start is it", and not a slip to
    tidy away: the two fills are never competing invitations, since with nothing
    collected this is the press that comes first and the fill goes out for ever
    the moment it has been made. "Collected" is `puzzleHeldCount()` — ready PLUS
    ARCHIVED, never candidates, or a store trimmed back to `puzzleReadyMax`
    would ask to be collected again. The three modifiers of that one button
    (fresh, armed, running) are made EXCLUSIVE IN `syncSettings`, not by
    stylesheet order — all three are of equal weight as selectors. The third
    state a fill cannot express, a course scanned in full with no puzzles in the
    band, is said in words in the tooltip off `puzzleScannedCount()`.
  * A CARD MUST NOT SAY WHICH KIND IT IS UNTIL A MOVE HAS BEEN PLAYED (29.4,
    §13). Knowing a tactic is THERE is most of finding it, and "Mate in 3" IS
    the answer — so until the first move both panels print the LINE NAME and
    nothing else. THE COST FALLS ON THE GRADED CARD, which is what makes the
    rule symmetrical rather than a puzzle-only tidy-up: a puzzle cannot
    truthfully print "N moves past the line", so the only way for the two to
    read alike is for NEITHER to say it — and on §19's uncovered source that
    costs `stormGapNote` too, the more painful of the two, since keeping it
    would make its ABSENCE mean "this is a puzzle" on every card. `puzzlesInPlay()`
    is ASKED, not assumed, and written onto the card (`card.disguise`) in
    `showCard`, the one point every card passes through on its way to a board.
    It closes on the first move, and a RETRY board is never disguised. THE BOARD
    IS NOT DISGUISED AND CANNOT BE — what this buys is that the POSITION is the
    only evidence, which is the same evidence a real game gives.
  * IT OWNS NO BRIDGE. `stormApi` grew two members (`puzzleSolved`,
    `puzzleFailed`), called from section 18's quiz path.
  * NOTHING MAY BE FETCHED ON A PROFILE THAT HAS NOT SWITCHED IT ON. It is a
    third party seeing the user's repertoire positions — section 26's gate, for
    section 26's reason. The gather stages check `pz.on` before a single
    request; the store is still LOADED regardless, since a wire exchange can
    land on a session that is dealing none.
  * THE TWO GATHER STAGES RUN FIRST IN A GATHER PASS, before the frontier walk.
    Moving them back after it does not make the feature slower, it makes it
    UNREACHABLE, and silently: guarded there on `st.gathering` and the leg's
    clock, they are skipped by exactly the two ways a real pass ends — a hand
    gather is STOPPED and a round's leg TIMES OUT on `cycleLegMs`. An empty
    puzzle store is also what a course with no puzzles looks like. Two rules the
    same report exposed: `pz.store` must SWITCH WITH THE COURSE in `cycleSwitch`
    (it is written back under `st.bid`, so a round filed one course's anchors,
    candidates and tombstones into another course's slice — §27b's
    contamination one store over), and `fillPuzzleQueue()` must be called after
    a pass, which is §14.13's rule applied to this queue.
  * ONLY STAGE B IS SMALL ENOUGH FOR §18.2's BACKGROUND TOP-UP; stage A —
    anchors to candidates, index-shard bound and a ONE-OFF recorded in
    `store.a` — must never run there.
  * IT MUST NEVER WRITE TO THE COURSE (section 24's rule, and §11's), and this
    feature has the tempting button one line away: "add this puzzle to my
    course" from a card. 19d/19e already do that safely, from a BOARD.
- COLLECTING A COURSE ONCE (section 29.2, v0.172.0): "Collect puzzles" runs both
  gather stages to completion in one press instead of a slice per overnight leg.
  Nothing about the anchor band, the grade, the store's semantics, the wire or
  the review changed. **READ `DESIGN-storm-puzzles.md` §12 BEFORE CHANGING
  ANYTHING HERE** — §12.1 is the measurement that reframed it and §12.6 is the
  ordering defect it exposed. What follows is only what an edit ELSEWHERE can
  break.
  * §4'S PER-FETCH COSTS ARE THE **PARSED** SIZES AND §12.1 REPLACES THEM with
    the gzipped ones, which are several times smaller. DO NOT RE-DERIVE A BUDGET
    FROM §4 — a full course scan is seconds, which is the premise this feature
    and §3.1a's band rest on.
  * THE SHARD NEVER ENTERS THE CONTENT SCRIPT. `clo-puzzle-index` takes a shard
    NAME plus the position keys wanted and the worker answers with only those
    entries; `clo-puzzle-bodies` does the same for ids AND archives what it
    extracted on the way past, so a body crosses the boundary once. Returning a
    shard whole would structured-clone a megabyte 182 times per course.
    `clo-fetch-puzzles` survives for `meta.json` alone.
  * THE PATH GUARD IS UNCHANGED AND IN FACT TIGHTER. Both new handlers take a
    shard name matched against `PUZZLE_SHARD_RE` (`/^[0-9a-f]{3}$/`) and build
    the path themselves, so §9's "no argument on this side can name a host"
    still holds. `clo-puzzle-archive` never fetches at all.
  * ONE FETCH PER BODY **SHARD**, NEVER PER PUZZLE — upstream's
    `Offline.groupByShard`, and the economy the whole feature rests on. Ids hash
    across all 4096 shards, so per-puzzle fetching discards the other 941 bodies
    each time. Grouped, the cost is the DISTINCT shards the ids touch and can
    never exceed 4096 however many are wanted. `puzzleBodiesPerPass` therefore
    COUNTS SHARDS since v0.172.0, not puzzles.
  * AN EXPLICIT 0 MEANS "ALL", ABSENT MEANS THE LEG'S DEFAULT, in both stages.
    The distinction is load-bearing and silent if lost: a hand-pressed gather
    passes no shard limit, so reading "falsy" as "all" would turn every ordinary
    gather leg into a full course scan with nothing saying so.
  * `store.p` IS THE LIGHT DURABLE RECORD and `r` IS NOW ONLY A WORKING SET.
    `r` holds whole bodies in `storage.local`, which `savePuzzleStore` rewrites
    WHOLE — ten thousand of them would put a multi-megabyte round trip on every
    sync and every course switch. The bodies live in the worker's archive and
    `refillReady()` tops `r` up from there with NO NETWORK. Three rules:
    `stormPuzzleArchived` speaks the CANDIDATE's field names (`p`, not `ap`),
    because `refillReady` hands the record straight back to `stormPuzzleReady`
    — rename it and every rehydrated puzzle loses its anchor line and §15's
    third stats map fills under one blank oid while looking implemented; `k` has
    ONE writer, `notePuzzle`, which mirrors it into both; and an archive MISS is
    not a corruption — the id goes back to being a CANDIDATE, which is exactly
    what it is. `p` absent is every store written before v0.172.0 and reads as
    "nothing archived", so nothing migrates.
  * THE ARCHIVE SURVIVES A REPUBLISH AND THE SHARD CACHES DO NOT
    (`cloPzCheckBuild`). Contents change at stable urls, so the caches are
    stale; a position and a solution are not, and dropping thousands of bodies
    on every republish is exactly what collecting once exists to avoid.
  * THE PRUNE IS SHALLOWEST-FIRST, NOT OLDEST-FIRST, and reversing it is silent.
    Both stages walk anchors DEEPEST first because depth is §3's quality signal,
    so an age-ordered cut IS a depth-ordered cut running backwards — it discards
    the strongest evidence and keeps the most generic. Same reason
    `puzzleCollectPerAnchor` is 200 rather than 0: seven anchors of one line
    match 3142 puzzles, so an unlimited collect meets `puzzleCandMax` and the
    cap decides what survives.
  * `fillPuzzleQueue` IS ASYNC NOW (for the archive read) and four of its five
    callers await it. `nextPuzzleCard` STAYS SYNC and must: `nextCard` is sync,
    reached from timers and from `produce`'s finally, and making that path async
    would ripple through every one of them.
  * IT IS NOT A GATHER AND MUST NOT SET `filling()` — it walks no frontier,
    spends no ChessDB request, starts no engine and stores no position. Two
    couplings it does need: it refuses WHILE a gather runs (both write the
    puzzle store, which is replaced whole), and `startStorm` refuses while it
    runs — not for a resource reason but because `syncSettings` hides the whole
    settings row once `st.started`, which would take its own Stop button off
    screen while it went on fetching.
  * `puzzleGapMs` IS 0 DELIBERATELY. It was a trickle rate for a host we were
    being careful with; this one is a GitHub Pages site serving static CC0 JSON
    with no account, no compute and no writable endpoint, against 100 GB/month
    of allowance. Unlike ChessDB (a volunteer network, §9) and Lichess there is
    nothing here a pause protects.
  * IT OWNS NO BRIDGE and is called by nothing.

- THE FOURTH HOST PERMISSION (section 29): `skaeglund.github.io/puzzle-explorer-data/*`,
  a GitHub Pages site serving static CC0 JSON — no account, no auth, no endpoint
  that could write. Its guard is nevertheless the TIGHTEST of the four because
  here it costs nothing: the content script names a PATH, never a url, so no
  argument on that side can name a host at all, and `PUZZLE_PATH_RE` is an
  allow-list of three shapes in `handleChessdbFetch`'s discipline. No token is
  ever sent — this host has no notion of the user, so the Lichess bearer would
  be a leak with no purpose. `raw.githubusercontent.com` is DELIBERATELY absent:
  the integration guide offers it as a mirror, and a second host permission for
  a fallback nothing needs is not a trade worth making. A 404 on an index shard
  is "no puzzles here", not an error.

- `content/puzzles.js` IS A MIRROR, NOT CODE TO IMPROVE, and that is why it is a
  file of its own rather than a block in lichessable.js. Loaded by the manifest
  before it, requireable from node (`engine/san.js`'s idiom), no `chrome.*` and
  no fetching. Three things in it are shared with a published 60-million-entry
  dataset and cannot be changed on this side alone: `fenPositionKey` must stay
  byte-identical to upstream (its EN-PASSANT normalisation above all — drop it
  and every position after a double pawn push misses, silently); `THEME_LIST` is
  APPEND-ONLY, a theme's code being its array index; and `SHARD_HEX_LEN` is 3.
  One rule reads like a bug and is not: A MISSING TUPLE FIELD PASSES EVERY
  FILTER, so older shards keep working — branch on field PRESENCE, never on a
  schema version, there isn't one. Themes are the single exception: `undefined`
  PASSES and `[]` DROPS, and collapsing them is wrong in both directions at once.

## Verification (no automated tests)

```
node --check content/lichessable.js
node --check content/puzzles.js
node --check content/pagestate.js
node --check background.js
node --check options/options.js
node --check engine/engine.js
node --check engine/san.js
python3 -c "import json; json.load(open('manifest.json'))"
```

EVERY `dev/check-*.js` HERE WORKS THE SAME WAY, and the shape is the point: it
EXECUTES the shipped function, sliced out of the source by
`dev/slice-source.js`, so it cannot drift from what runs. To run a CONTROL,
point `CLO_SRC` at a copy with the change reverted and confirm it FAILS —
never that the check passes. **Each script's own header records what its
controls were and what each one broke**; those records are measurements and
they live there, not here. Two lessons from them belong with the method rather
than with any one script: an early control of `check-continuation-lines.js`
silently read the GOOD source and passed against a copy that still had the bug,
and the first control run of `check-popup-placement.js` came back green because
a NaN loses every comparison. A control that does not fail has proved nothing.

`dev/probe-*.js` is the other half — those run against the LIVE APIs and are how
a measurement is re-taken rather than re-quoted. Each names in its own header
which § of which design doc rests on it.

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

After touching section 25's proposal rule — `propose`, `snapToMove`, `plyBase`,
`plyColor`, the baseline store, 25c's `poolByPosition` / `spreadByPosition`, or
25d's `buildProvenIndex` / `fetchLessonLevels` / `feedTimesByPly`:

```
node dev/check-key-moves.js
```

Both interesting cases are close to unreachable from a live session — one needs
a range this extension lowered weeks ago, the other needs a move to have stopped
being difficult since.

After touching section 26's ChessDB fold, its score bands or its colour ramp —
`parseCdbAnswer`, `cdbEvalText`, `cdbTone`:

```
node dev/check-chessdb.js
```

Every failure mode here is SILENT: a missing band prints a mate as "+299.99" and
a rook endgame as "+249.78", a lost perspective flip inverts every
Black-to-move position into a tidy column of backwards numbers, and losing the
`learn=0` half presents on-the-fly guesses as book evals. It also asserts the
WORKER's action allow-list out of `background.js` — `queue` and `store` must
stay unreachable — which a hidden automated tab cannot exercise at all.

After touching section 6c's two slots — `repertoireRowStates`, `repRowTint`,
`repertoireMoveState`, `repertoireOpponentToMove` or `applyRepertoirePref`:

```
node dev/check-repertoire.js
```

Every judgement the SECOND slot added is silent when it is wrong, and three of
them produce a perfectly plausible table. The MERGE above all: the warning means
"neither of them answers this", so computed per slot a White course and a Black
one flag each other's positions — a red triangle on the main line of a course
that answers it perfectly well. Its subtle half is which slots get a vote on
whose move it is (only those that COVER the position, and one saying "mine" is
enough), which is the difference between a quiet table and one that flags the
user's own repertoire decisions. The file's header records all seven controls;
each was run and each fails it.

After touching `content/puzzles.js` — the position key, the shard hash, the
theme vocabulary or the filters:

```
node dev/check-puzzles.js
```

It REQUIRES that file rather than slicing it (it is a module in its own right,
`engine/san.js`'s idiom); point `CLO_PUZZLES` at a copy to run a control. Every
failure mode in it is SILENT — it returns "no puzzles at this position", which
is also the correct answer for most positions, so a broken key derivation and
an empty opening are the same observation from the outside. The EN-PASSANT
normalisation is the one the dataset's own guide calls "the single most likely
integration bug": miss it and every position after a double pawn push returns
nothing, and BOTH ep controls are needed — "always strip" passes the 1.e4 case
and fails only the capturable one, "never strip" does the reverse.

After touching section 27 or section 29 in almost any way:

```
node dev/check-storm.js
```

That file's header is the map of what it covers and why, section by section,
and it is where every one of its ~60 control runs is recorded. Run it after
touching any of:

* THE PRODUCER — `stormFrontiers`, `stormDrawFrontier`, `stormUserEval`,
  `stormPgnMoves`, `stormPickReject`, `stormMoveLoss`, `stormMoverCp`,
  `stormGrade`, `stormPoints`, `stormCandidate`, `stormAdvance`,
  `stormWalkGame`, `stormRandomLine`, `stormCard`.
* THE GRADE — §16's `stormWinPct` / `stormWpLoss` / `stormWp` and `CONFIG.storm`'s
  `wpK` / `wpClampCp` and five bands; §14.23's engine tier (`stormEngineLoss`,
  `armEnginePhase`, `startEngineChild`, `finishEngineJob`, `endEngineJob`,
  `onStormEngineUpdate`, `keepEngineBest`, `keepEngineChild`, `engineDepth`,
  `enginePhaseMs`, `engineDepthSlack`, `engineTimeoutMs`, `gradeTimeoutMs`);
  §23's stored Stockfish list (`d` in the pack, the wire and the merge, and
  `stormEstimated` / `stormSourceLabel` / `stormSourceTitle` / `stormBestLine`'s
  handling of `sflist`); §23.7's depth rule (`deepenPickDepth`,
  `deepestCompleteList`, `armDeepenStall`, `deepenDepth` / `deepenStallMs` /
  `deepenMinMoves`); §26's walk scorer (`askScores`, `walkScorer`,
  `askEngineScores`, `stormCandidate`'s `listDepth`, `walkDepth` /
  `walkMultipv` / `walkSource` / `gatherWalkSource` / `inventedWalkSource` /
  `walkEngineMax`).
* THE STORE AND ITS WIRE — `stormPack`, `stormUnpack`, `stormRetain`,
  `stormWirePack`, `stormWireUnpack`, `stormWireMerge`, §22.6's `clearedAt`
  high-water mark, §20's lead-in (`stormAdvance`'s `before`, `stormWalkGame`'s
  and `stormFrontiers`'s `lastFen`, the third element of `a`, `analysisGiven`),
  §14.15's `stormStoreDraw`, §14.19's `stormReachBucket` / `stormReachLabel`,
  §23.8's `storeScored`, §14.16's `stormDone` and `stormPickGames`, §14.17's
  `stormFunnelBlank` / `Bump` / `Why` / `Note` / `Lines` and
  `harvestCandidates`'s own control flow, §14.25's `pushStoreAfterSession` /
  `noteStoreChanged` / `storeChanged` / `resetStoreDebt` and `syncStore`'s early
  capture and mid-flight course guard, §27b's `stormCardName` and
  `stormWireForeign`.
* THE FILTERS — §14.14's paused filter, §14.18's stub filter, §14.18.4's
  `stormReentered`, §14.21 + §28's `stormFilterPool` / `stormFilterStore` /
  `stormFenKey` / `stormLineThrough` / `stormLineKeys` / `stormNoteLineKeys` and
  `stormScope`'s own resolve, §25's `stormCoverKey` and `dropCoveredStored`,
  §19's `stormDecisions` / `stormUncoveredMoves` / `stormFilterSource` /
  `statMapOf` / `STAT_MAPS` / `stormSharePct` / `stormGapNote` and
  `uncMinShare` / `uncMinGames` / `uncMaxPerPosition`.
* THE RECORD — §15's `stormStatApply` / `Plus` / `Sum` / `Roll` / `Rate` /
  `Loss` / `stormStatsMerge` / `stormStatsPrune` / `stormStatsWirePack` /
  `WireUnpack`, §21's `s` counter and `statUnhurriedNote`, §15.7's
  `pushStatsAfterSession` and `syncStats`'s queue and debt clearing.
* THE REST — the verdict line (`stormCp`, `stormVerdictLine`, `stormBestLine`,
  and §14.10c's `v.unanswered` arm); §17's `stormSetClean` / `stormSetHeld` /
  `stormSetOutcome` / `stormSetTally` and `setCleanOn` / `setRetryMax` /
  `setSize`; §18's `verdictFastMs` / `verdictMs` / `backfillMaxCdb` /
  `backfillStore` / `backfillGapMs`; §28b's fourth card (`stormFenCardName` /
  `stormFenWirePack` / `stormFenWireUnpack` / `stormFenMerge`); §30/§30a/§30b's
  `takeStoreItem` / `takeQueued` / `takeQueuedPuzzle` / `queuedOrDealt` /
  `stormLineKey` / `cardLineKey` / `backfillStoreOids` / `recentList` /
  `lineRecent` / `noteRecentLine` / `loadRecentLines` / `saveRecentLines` and
  `queueSpread` / `recentLines` / `recentKey`; 29.4's disguise (`puzzlesInPlay`,
  `card.disguise`, the `hush` arms); and section 29's own half
  (`stormAnchorAdd`, `stormFilterAnchors`, `stormPuzzleCand` / `Ready` /
  `Plies` / `UserPlies` / `Retain` / `Draw` / `Done` / `Archived` /
  `ArchiveDraw`, `cardLineRef`, `refillReady`, `takeCandidatesAt`,
  `gatherPuzzleCandidates`, `gatherPuzzleBodies`, `collectPuzzles`,
  `prunePuzzleStore`'s `byDepth`, and the wire's `stormPuzzleCardName` /
  `WirePack` / `WireUnpack` / `WireMerge`).

Four things about that file an edit elsewhere can break:

* §0 ASSERTS THE INDENTATION of the verdict-line helpers, which no assertion
  below it could: slicing flattens every scope into one, so nothing else there
  can tell a helper section 18 can reach from one it cannot — and both sections
  print that line.
* IT EXECUTES TWO IMPURE FUNCTIONS (`harvestCandidates` and `storeAdd`, with
  `st`/`C` injected through `__setEnv`; `__setPz` supplies `pz`), because
  §14.17's conservation invariant lives in that function's control flow and
  nowhere else.
* `stormPgnMoves` READS ITS COMMENT PATTERN OUT OF `PGN_COMMENT_RE` rather than
  a regex literal, and must keep doing so: `dev/slice-source.js` matches braces
  and counts the ones inside a regex literal, so `/\{[^}]*\}/` truncates that
  slice three lines in — silently, since a half-function is still something
  `new Function` will accept.
* THE CHECK'S HAND-BUILT `C` MUST LEARN EVERY STRING SETTING IT ASSERTS ON.
  It is built from NUMERIC config fields, so a string reads `undefined` and a
  version test compares `undefined` with `undefined` and PASSES — §27b's own
  vacuous shape, caught once already. Anything asserted needs `str()` and an
  assertion an absent value cannot satisfy.
* A CHECK THAT EXECUTES A RULE PROVES THE RULE, NOT THE PATH. §30's puzzle third
  passed for three versions over a function nothing called; two source-text
  assertions now cover the call.

§27's ROUND adds nothing to that file, deliberately: it is orchestration —
`gatherRound` / `runRound` / `cycleSwitch` / `cycleGoHome` / `filling` — and it
holds no rule a pure function could execute. What it DOES hold is a list of
gates that must all read `filling()` rather than `st.gathering`, which is a
grep and not an assertion:

```bash
grep -n "st\.gathering" content/lichessable.js
```

Every survivor must be inside the gather pass itself, its own note/label, or
`filling`. One left behind elsewhere is a card put on a board during a pass
nobody is watching — and it would look exactly like the round working.

After touching section 29.2's collect — `gatherPuzzleCandidates`,
`gatherPuzzleBodies`, `takeCandidatesAt`, `stormPuzzleArchived`,
`stormPuzzleArchiveDraw`, `refillReady`, `collectPuzzles`, `prunePuzzleStore`'s
`byDepth`, or the worker's `handlePuzzleIndex`/`handlePuzzleBodies`/
`handlePuzzleArchive` and `puzzlecache.js`:

```
node dev/check-storm.js            # §29d
node dev/probe-puzzle-collect.js   # both stages, live, no Chessable session
```

`dev/probe-puzzle-collect.js` runs BOTH stages against the live dataset from a
LINE rather than a course, so it needs no Chessable session, and it replays
every body it extracts — which is what `stormPuzzlePlies` asks before one is
ever stored. It is how §12.1's per-fetch costs and §12.2's grouping saving are
re-measured; both are the kind of number that is quoted for years after the
thing it described has changed.

`dev/probe-puzzles.js` is the measurement §3 rests on and the cheapest question
to ask of a new course: it slices the shipped `stormAnchorAdd`, runs it against
the live dataset, and reports how many anchors a band produces, what they cost
in index shards and how many puzzles come back. `--bands` is the floor/ceiling
sweep and needs no network at all. `dev/probe-nogames-cdb.js` is the same for
§26 — how far a walk gets past a frontier with games against one without — and
it forces the random line length to `maxPly` on purpose, since a walk that ran
out of its own dice roll is otherwise indistinguishable from one that ran out of
ChessDB.

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

It runs over a live `getList` dump of the account's courses
(`dev/tmp-courses.json`, GITIGNORED — course content is not ours to
redistribute; the recipe for remaking it in one console call is in the header of
`dev/probe-course-tree.js`, and without it the check exits 2 and says so). It
has to be a real course: the fold's eighty-ply run and the position graph's
back-edge both occur only on the bought one. 24b, 24f and 24h are covered
against a FAKE explorer answer, a hand-built cache entry and a SYNTHETIC
`ct.alts` respectively — each being the only way to reach a judgement that is
otherwise wrong INVISIBLY.

After touching section 18's line reading — `walkLine`, `branchLines`,
`quizzableLines`, `dropAmbiguous`, `mergeUserAlternatives`, or `tryMove`'s
alternative arm:

```
node dev/check-continuation-lines.js
```

This exists because that arm has shipped broken twice on a class `node --check`
cannot see: v0.67.0's `applyMove(played)` with no resolved `mv` threw on EVERY
alternative for six weeks, and v0.100.0's stranded `isNext` did the same in
section 23. AN EXTRACTION IN THIS FILE IS NOT SHIPPABLE ON STATIC CHECKS ALONE.

After touching the popup placement helpers — `visualViewportBox`,
`placeFixedPopup` — or the quick-edit popup's own `placePopup`:

```
node dev/check-popup-placement.js
```

It executes both against the viewport shapes a phone presents and a desktop
cannot be put into — a "Desktop site" layout viewport thousands of CSS pixels
tall, an on-screen keyboard, a pinch-zoom offset. Every case passes on a
full-size window with the pre-fix arithmetic, which is why the check exists.

After touching section 16b's store — `load`, `save`, `migrateLegacyStore`,
`indexItems`, `itemKey` or the caps:

```
node dev/check-pin-store.js
```

It executes the real `initPinnedMistakes` against a fake `chrome.storage` with
TWO devices sharing one sync area — migration off the pre-v0.105.0 blob, the
write diff, deletion-by-absent-key, the global cap, retirement, and that a
device still hears about the other one after saving itself.

After touching section 23's auto-play walk — `computePrefix`, `cardIsProven`, or
`sg.firstCard` where `anchor` sets it:

```
node dev/check-prefix-walk.js
```

It pins a property rather than a bug. Under Study: Key Moves the trainer plays
every user ply before the first key move itself — but Chessable ALSO clears
`isUserMove` on those plies, so the walk never sees them and its first
considered ply is the first card in BOTH study modes. That is what this file
asserts, in the plan shape Chessable actually serves; the v0.112.0 change it was
written for turned out to be a no-op (DESIGN-show-and-grade.md §4.6). What DOES
change an answer is `cardIsProven`'s `cardIdx < firstCard` guard.

After touching section 23c's shared-run-up rule — `maybeStartLead`,
`leadCommonPlies`, `noteLeadShown`, `leadGoto`:

```
node dev/check-lead-runup.js
```

Every interesting case is the third or fourth variation in a sequence, which is
why a live session is a poor way to check it.

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
- **From automation, read `document.documentElement.dataset.cloVersion`.** That
  log line is written from the ISOLATED world, whose console a driven browser
  cannot read — `read_console_messages` returns only page-world messages, so the
  check above is unusable from a session and two of v0.176.0's runs were
  inconclusive for exactly that reason. The same string is stamped on `<html>`
  at startup (beside the `clo-touch` class), and nothing of ours reads it back.
  A `chrome-extension://` URL is not an alternative: `navigate` prefixes
  `https://` to it.
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
