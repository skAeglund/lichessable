# CLAUDE.md — LiChessable

Personal Chrome extension (Manifest V3), loaded unpacked. Injects a "Lichess
Database" panel beneath Chessable's move table on Explore pages
(`https://www.chessable.com/explore/<id>/`) and the Analysis board
(`https://www.chessable.com/analysis/`, as sibling after the Opening
Explorer container — always visible, since Chessable's explorer toggle is
sometimes disabled — the panel fills the whole column right of the board and
ADOPTS Chessable's own move tree into its top section)
so course statistics can be compared against real Lichess games for the
current position. Also adds an "Overstudy" widget to review sessions
(`https://www.chessable.com/practice/…`): two buttons (current / previous
variation) that open the variation's overstudy in a background tab. In those
trainer sessions the Lichess panel also appears once a variation is completed
(browse state), following the board via a DOM-derived FEN. In that same browse
state, hovering a mainline move shows a pencil that appends a PGN comment to the
variation (for courses you can edit) by driving Chessable's own edit page in a
background tab.
Currently working (v0.11.x).

## Structure

- `manifest.json` — MV3. Permissions: `storage` + `offscreen` + host
  permission for `explorer.lichess.org`. Nothing else, keep it that way.
  The CSP (`wasm-unsafe-eval`) and COOP/COEP keys exist solely so the
  offscreen document can compile WASM and use SharedArrayBuffer (engine
  threads) — do not remove them.
- `content/lichessable.js` — the only content script. The panel runs inside
  Chessable's same-origin mt1 iframe (`all_frames: true`; other iframes exit
  unless `location.pathname` starts with `/mt1/explore/` or
  `/mt1/analysis/`). The TOP document never exits — it runs the review
  overstudy watcher (chessable.com navigates SPA-style, so `/practice/…` can
  be reached from any page without a load).
- `content/lichessable.css` — panel styles, all namespaced `.clo-`.
- `background.js` — service worker; does the authenticated explorer fetch,
  opens overstudy tabs, and is the engine message hub. Message types:
  `clo-fetch-explorer`, `clo-open-options`, `clo-open-overstudy`, and the
  `clo-engine-*` family (all engine messages carry `target: 'sw'|'offscreen'`).
- `engine/` — optional local Stockfish (panel-header "Engine" toggle, off by
  default). `offscreen.html` + `engine.js` (UCI controller, sizing constants
  at top) + `san.js` (pure UCI→SAN converter, node-testable, no `chrome.*`).
  `engine/vendor/` holds the Stockfish 18 multi-threaded WASM build
  (`stockfish-18.js` + `.wasm`) — gitignored (108 MB), downloaded manually
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
- Review mode (`/practice/…`) is MoveTrainer2 in the TOP document — no mt1
  iframe, no `#inputFEN`, none of the explore widgets. The review URL is
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
  (fixed; preferred spot is the gutter LEFT of the board, top-aligned, falling
  back to under the board/overstudy widget when that gutter is narrower than
  `CONFIG.review.panelMinWidth`). Chessable centers the whole trainer row
  (board + comment column), so `centerReviewBoard()` puts a `translateX` on
  `SELECTORS.trainerRow` to center the BOARD instead — transform only (never a
  layout property), clamped so the comment column stays on screen. It runs on
  every tick of the WHOLE trainer session, quiz included, so the board never
  jumps when a variation completes; the applied offset is read back off the
  element, so a React re-render just re-centers from zero. The panel reuses
  ALL of the explore
  fetch/cache/render machinery via `IS_REVIEW` branches; move rows are not
  clickable in this mode.
- A `/learn/…` session booting in a hidden document (= background overstudy
  tab) auto-pauses its timer by clicking Chessable's pause control
  (`SELECTORS.trainerIconBtn` + `trainerPauseIcon`); backs off if the tab is
  focused first. Resume = Chessable's own play overlay.
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
  perspective in engine.js, not in the panel.
- Quick-edit comment (section 12 in lichessable.js): hovering a mainline move
  shows a body-mounted pencil (singleton, NOT inserted into Chessable's move
  list) whose popup appends a PGN comment to the variation. TWO host pages,
  behind a `HOSTS` adapter in `initQuickEditUi`; they differ ONLY in move
  lookup, ply mapping, oid source and rights signal — popup, save round-trip and
  the entire edit-page driver are shared:
  (a) review browse state (`commentMove` spans; ply = index in that list; rights
  probed per course), and (b) the standalone variation page `/variation/<oid>/`
  (top document, no mt1 iframe, wholly different markup:
  `#theOpeningMoves > span > .whiteMove|.blackMove`, where the move div's id IS
  the 0-based ply index and its class is the colour, so NO move-number parsing
  happens there; oid from the URL; rights = presence of the "Edit Variation"
  link, which Chessable renders only for editable courses, so no probe tab is
  opened). Verified live that both hosts' ply indices map 1:1 onto the edit
  page's `#interactivePGN` order. There is NO JSON API — several of Chessable's edit-form POST fields
  are session/CSRF-bound and opaque — so the ONLY safe path is to DRIVE
  Chessable's own edit page: `background.js` opens `/explore/edit/<oid>/`
  `active:false`, and the driver in that tab's mt1 edit iframe (`IS_EDIT_PAGE`)
  clicks the target move by POSITION (the Nth `#interactivePGN div[id]`),
  appends to `#moveComment` (React-controlled: native value setter + dispatched
  `input` event, NOT a bare `.value =`), sets `#specificAltMove` ("For This
  Variation Only"), clicks `#submitButton`, and MUST also click the SweetAlert2
  confirm (`.swal2-confirm`) — `addVariation()` only serialises + POSTs the
  whole variation after that dialog is confirmed. CRUCIAL: match the move by its
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
  `chrome.storage.session`, 25 s hard timeout, hidden tab closed on finish. Edit
  rights are per-COURSE: probed once per `bid` per session (one throwaway tab)
  and cached; the pencil only appears when `canEdit` is true. Append convention
  (`CONFIG.quickEdit.commentJoin`) and the exact stored wrapper (`( { … } )`)
  are the one thing to confirm in a manual save test.
  The popup MUST swallow `keydown`/`keypress`/`keyup` (bubble phase,
  `stopPropagation`) — MoveTrainer2 binds single-key shortcuts ("n" = next
  variation, space, …) on `document` and does NOT skip them while a text field
  has focus, so without this, typing a comment drives the trainer. Bubble phase
  is enough (verified live); the default action still inserts the character, and
  Escape closes the popup.

## Verification (no automated tests)

```
node --check content/lichessable.js
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
