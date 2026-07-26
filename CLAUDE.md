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
variation (for courses you can edit) by driving Chessable's own edit page in a
small focused popup window; the same pencil works on standalone variation pages
(`/variation/<id>/`), which also get the full Lichess panel (section 11b).
Trainer sessions (/practice/ and /learn/ alike) can also auto-play moves the
user already answered correctly earlier the same session (section 13; opt-in
toggle on the overstudy widget). A wrong quiz answer offers an
engine check of the refused move and one-click addition as an accepted
alternative (section 15). Every move failed in a session is logged from the
trainer's own per-move quiz record (section 16) and a "Retry" button walks
those variations again as overstudy, with auto-play covering the moves already
answered (section 17).
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
  2 threads/16 MB, both depth 25, MultiPV 3, no movetime cap) + `san.js`
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
- Fetches carry a sequence number; stale responses are cached but not
  rendered. LRU cache: 200 positions, keyed on the first four FEN fields
  (so move-counter-only differences share entries).
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
  initial position). Castling is a home-square heuristic and en passant is
  always "-" — accepted approximations. Mid-animation frames are skipped by
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
  list) whose popup has TWO TABS: append a PGN comment to the variation
  (mode 'save'), or add an ALTERNATIVE MOVE the trainer should also accept
  (mode 'alt'). TWO host pages,
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
  ALT-MOVE mode (`driveQuickEditAltMove`; ground-truthed live 2026-07-22):
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
  already listed on arrival short-circuits to success (it was saved before).
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
- Auto-play (section 13; design + live ground-truthing in DESIGN-autoplay.md):
  records every move the user answers correctly during a review session and
  replays it when a later variation (or transposition) reaches the same
  position, handing back at the first unproven move. Keyed on POSITION
  (placement + side + castling, en passant dropped), per course, in
  `chrome.storage.session` with a 12 h TTL — deliberately never
  `storage.local`, or stale proofs would auto-pass genuinely-due cards.
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
  prefix) and never recorded. Before ANY injection the recorded move's SAN
  (CloSan) must equal the variation mainline's SAN at that ply — the mainline
  comes from the LINE ORACLE: MoveTrainer2's own `lessonPlan`, read out of
  page state by `content/pagestate.js` (see below). Mismatch ⇒ entry marked
  `conflicted` for the session, manual play; any other uncertainty (plan
  unreadable, promotion recorded — trainer picker markup UNVERIFIED, drag not
  accepted within 2.5 s, ply untrusted after losing track) also degrades to
  manual, never a blind move. Injection CLICKS the move — `pressSquare` on
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
  default, speed `cloAutoPlaySpeed`, status chip).
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
  - `noteDeadContext(err)`: after an extension reload, every `chrome.*` call in
    the still-running content script throws "Extension context invalidated".
    Such an orphan holds a record it can neither refresh nor save and could
    still drive drags off it, so the module STANDS DOWN on the first such error
    (auto-play off, observer disconnected, poll cleared, `ap.contextDead` gates
    `tick`/`processFrame`/`evaluateAutoPlay`) and logs one line telling the user
    to reload the page. Reloading the extension alone never revives a tab.
  - `logHandback(reason)` prints one console line per (position, reason) pair
    whenever auto-play declines to replay — no-record, conflicted, expired,
    promotion, oracle failed/pending, ply not found in the line,
    illegal SAN — since a silent no-op is otherwise indistinguishable from a
    bug. Debug-only DOM hook: dispatching a `clo-debug` event on `document`
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
  retry keeps mode 'review' and merely gets `retried: false` again. Writes
  MERGE (`mergeEntry`) — every tab shares that storage area, and a background
  overstudy tab used to be able to overwrite the review tab's log.
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
  `cloAutoPlayEnabled` to `run.prevAutoPlay`. Advance = the target's
  `quizCorrectTotal` growing past the value read ON ARRIVAL (a BASELINE, not
  `> 0`: a seeded counter would race the whole queue through) or the variation
  completing; `markRetried(oid, visit.at)` deliberately spares entries whose
  ts is NEWER than the visit, which is what keeps a re-failed move in the
  list. Auto-play is told to hold on ALL of the item's failed positions
  (`autoPlaySetHold`, compared on placement+side only because the tracker's
  castling can be the home-square heuristic) — a move failed early and
  answered correctly later IS proven, and would otherwise be replayed past.
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

Manual test loop (user does this; end implementation turns by reminding them):
reload the extension at `chrome://extensions` (↻ on the card), then reload the
Chessable tab. Logs appear in the mt1 IFRAME's console context — filter the
console for `[CLO]`.

## Never

- Ask for, log, or store the actual `lip_` token value anywhere in the repo.
- Add permissions, hosts, or libraries without explicit discussion.
- Fix Chessable-markup breakage anywhere except `SELECTORS`.
