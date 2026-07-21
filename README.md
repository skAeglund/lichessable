# LiChessable

Chrome extension (Manifest V3) that injects a **Lichess Database** panel on
Chessable Explore pages (`https://www.chessable.com/explore/<number>/`) and the
Analysis board (`https://www.chessable.com/analysis/`), so you can compare
Chessable course statistics against real-world Lichess games for the current
position. On wide windows (≥ 1700px) the panel occupies the empty space to the
right of Chessable's content column; on narrower windows it falls back to
sitting beneath Chessable's move table.

On the Analysis board the panel takes over the whole column to the right of
the board (Chessable's toolbar underneath stays where it is). Chessable's own
move tree is moved *into* the panel — the top section of it is literally their
move list element, so clicking moves, the right-click menus and everything
else behave exactly as before; the Lichess data and engine lines fill the rest.
Collapsing the panel with **Hide** hands the move tree back to Chessable's own
card. The panel is always visible — deliberately
independent of the **Toggle Opening Explorer** toolbar button, which Chessable
disables in some entry states (e.g. opening the page via a `?fen=` link).

The same panel also appears in **review and learn sessions** once a variation
is **completed** and the trainer enters its browse state (stepping through the
moves, reading comments). It follows whatever position is on the board —
mainline moves, clickable subvariation moves, the initial-position dot, and
the prev/next buttons all included. It never shows during an active quiz, so
it cannot spoil an answer. Because the trainer has no FEN field, the position
is reconstructed from the DOM (see Architecture notes); the panel is
fixed-positioned in the empty gutter to the left of the board (falling back to
below the board, under the Overstudy widget, on narrow windows — and below the
whole board+comments block in portrait/mobile, where the comments stack under
the board). Throughout a
review/learn session — quiz included, not just the browse state — the trainer
row is nudged sideways so the **board** rather than Chessable's board+comments
block sits horizontally centered, so the board never shifts as a variation
completes. The nudge is a pure CSS transform; Chessable's own layout is
untouched.

It also adds an **Overstudy widget** to review sessions
(`https://www.chessable.com/practice/…`): a small floating card centered
beneath the board (below the Exit/nav row; bottom-right corner as fallback)
with two buttons — overstudy **this variation** and overstudy
the **previous variation** (i.e. the one you most recently completed, after
the review queue advances). Each opens the variation's overstudy in a
**background tab**, so the running review session keeps focus. On
chessable.com, "overstudy" is simply the learn route
(`/learn/<course>/<variation>/…`) for an already-learned variation — exactly
where Chessable's own Overstudy buttons navigate. Because the session timer
would otherwise start running unseen, a learn session that boots in a
**hidden** tab gets its timer auto-paused (the extension clicks Chessable's
own pause control once it renders); switch to the tab and click the play
overlay to start.

Review sessions can also **auto-play moves you already proved this session**
(the *Auto-play* toggle on the overstudy widget, off by default, with a
Fast/Normal/Relaxed pace select). Every move you answer correctly is recorded
against its **position** for the rest of the browser session (12 h cap); when
a later variation reaches a position you've already answered — typically the
shared prefix of the next line, but any transposition counts — the extension
plays your recorded move for you and hands control back at the first move you
have *not* proven yet. Before anything is auto-played the move is verified
against that variation's actual mainline, so an updated repertoire never gets
a wrong move replayed: on any mismatch the position is left to you (and not
retried that session). Auto-played moves count as **normal correct answers** —
the move was proven earlier this session, and Chessable schedules it as
passed. Failed or timed-out moves are never auto-played, and a move is never
auto-played the first time it appears in a session. Once you've played a move
by hand in a variation, auto-play stays out for the rest of that variation —
even if a later transposition reaches a position you've already proven —
because handing control back and forth mid-line is jarring; only a
variation's opening run ever replays. A click on the board (or on the status
chip) stops auto-play for the current variation. The proven-move record is
kept per course, evaporates when the browser closes, and is deliberately
**not** persisted across days — that would silently pass genuinely-due cards
and defeat spaced repetition. Under the **Key Moves** study setting Chessable
itself already auto-plays the non-key prefix; the feature stays enabled but
simply finds nothing to do until the first quizzed move.

The move list auto-play checks against is the trainer's own: MoveTrainer2
already holds the current variation's full line in memory before it plays the
first move, so nothing is fetched, cached or waited for.

You can also **quick-edit a move's comment**: hover a mainline move and a small
pencil appears; its popup lets you type a note and append it as a PGN comment
after that move (with the same "For this variation only" toggle Chessable's
editor has). This works in two places — the completed-variation browse state
during review, and any standalone **variation page**
(`/variation/<id>/`). It only shows for courses you can edit, and it works by
driving Chessable's own edit page in a background tab — see "Quick-edit
comment" under Architecture notes.

The panel can also run **optional local Stockfish analysis** (eval + top 3
lines in SAN) for the current position — see "Local engine (optional)" below.

Plain JS/HTML/CSS. No bundler, no npm, no frameworks, no remote code. (The
optional engine is a vendored Stockfish WASM build, downloaded manually.)

## Folder structure

```
lichessable/
├── manifest.json            Manifest V3 definition
├── background.js            Service worker: authenticated explorer fetches
│                            + engine message hub + quick-edit tab driver hub
├── content/
│   ├── lichessable.js       Panel logic (mt1 iframe) + review overstudy widget,
│   │                        quick-edit UI and review auto-play (top document)
│   ├── pagestate.js         MAIN-world reader: the trainer's own lesson plan
│   │                        (the auto-play line oracle), read-only
│   └── lichessable.css      Panel styling (namespaced under .clo-)
├── engine/
│   ├── offscreen.html       Offscreen document hosting the engine
│   ├── engine.js            UCI controller (worker lifecycle, MultiPV parsing)
│   ├── san.js               Self-contained UCI→SAN converter + move generator
│   │                        (also loaded as a content script: review auto-play
│   │                        uses it to track the board and verify moves)
│   └── vendor/              Stockfish WASM build — NOT in git; see below
├── options/
│   ├── options.html         Settings page: Lichess API token entry + test
│   ├── options.js
│   └── options.css
├── icons/
│   ├── icon16.png           Simple generated placeholder icons —
│   ├── icon48.png           feel free to replace or delete them
│   └── icon128.png          (remove the "icons" block from the manifest if deleted)
└── README.md
```

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
6. Open an Explore page, e.g. `https://www.chessable.com/explore/287495/`,
   or the Analysis board, `https://www.chessable.com/analysis/`. The
   "Lichess Database" panel appears to the right of Chessable's content
   (or under their move table / notation area, if the window is narrower
   than 1700px).
7. After editing any file: click the ↻ reload icon on the extension's card in
   `chrome://extensions`, then reload the Chessable tab.

## Debugging

- All logs are prefixed `[CLO]`.
- The script runs inside the **mt1 iframe**, so in DevTools either select the
  `mt1/explore` frame in the console context dropdown, or just filter the
  console for `[CLO]` (the default "top" context still shows iframe logs in
  current Chrome, but the frame context is needed if you want to poke at the
  panel from the console).

## Architecture notes

- **Frame targeting** — the manifest injects into all `www.chessable.com`
  frames (`"all_frames": true`); iframes exit immediately unless
  `location.pathname` starts with `/mt1/explore/` or `/mt1/analysis/`
  (both pages render the same widgets inside the same mt1 iframe app).
  The **top document never exits**: it runs the lightweight review watcher
  below, because chessable.com navigates SPA-style (`pushState`) — a review
  session can be reached from any page without a load, so the script must
  already be resident.
- **Review overstudy widget** — review sessions (`/practice/…`) render in the
  top document (MoveTrainer2 — no mt1 iframe, no `#inputFEN`). The review URL
  stays **constant** for the whole session (`/practice/<course>/0/<listId>`);
  the variation id never appears in it. The watcher instead polls the DOM
  every 500 ms: the active drawer row (parent of the
  `#currentStudyingVariation` marker) exposes the variation id, list id, and
  name as plain `oid`/`lid`/`title` attributes, with the panel header's
  `/variation/<id>/` title link as fallback. Current/previous variation are
  tracked from that. The widget mounts on `document.body` (never inside
  Chessable's React tree, where foreign children can crash reconciliation)
  and re-mounts if an app re-render removes it. Clicking a button builds
  `/learn/<course>/<variation>/<listId>` — the same route Chessable's own
  Overstudy buttons use — and messages the worker (`clo-open-overstudy`),
  which validates the URL shape and opens it via
  `chrome.tabs.create({ active: false })`.
- **Review-mode panel** — in the trainer's post-completion browse state
  (detected by the `practiceProgress` "Completed" block plus the
  `commentMove` move list) the panel mounts on `document.body`,
  fixed-positioned in the gutter left of the board — or beneath it (below the
  overstudy widget) when that gutter is narrower than
  `CONFIG.review.panelMinWidth`, dropping below the entire trainer row when
  the comment column is stacked under the board (portrait/mobile; detected by
  the progress block sitting under, not beside, the board) — while
  `centerReviewBoard()` (independent of
  the panel: it runs for the whole session) translates `.row-practice` so the
  board itself is viewport-centered, and the
  same 500 ms tick doubles as its watchdog. With no `#inputFEN` in the top
  document, the FEN is rebuilt from the DOM: piece placement from the board
  squares' `[data-piece]` divs, side to move + move number by parsing the SAN
  numbering around the currently shown move (`commentMove_shownOnBoard`, or
  `commentSubMove_shownOnBoard` when a clickable subvariation move is on the
  board; neither marker = the variation's initial position). Two deliberate
  approximations, both fine for explorer statistics: castling rights are
  inferred from king/rook standing on their home squares (over-grants after a
  piece moves away and back), and the en-passant field is always `-`. Frames
  where the board is mid-animation (a piece momentarily on two squares) are
  skipped by requiring exactly one king per side. Move rows are **not**
  clickable here — the trainer's board is not free-play.
- **Background-tab auto-pause** — a `/learn/…` session that boots while its
  document is hidden (i.e. any background tab, which is what the overstudy
  buttons create) gets its move timer paused: the script polls for the
  trainer's pause-timer footer control (`SELECTORS.trainerIconBtn` containing
  `SELECTORS.trainerPauseIcon`) and clicks it once. If the tab becomes
  visible before the control appears, it backs off. Resuming is Chessable's
  native play overlay on the board.
- **Quick-edit comment** — hovering a mainline move shows a pencil (a
  body-mounted singleton, never inserted into Chessable's move list) whose popup
  appends a PGN comment to the variation. It runs on two host pages behind a
  small adapter: the completed-variation browse state (moves are `commentMove`
  spans; ply = index in that list; edit rights probed lazily on popup open) and the
  standalone variation page (moves live in `#theOpeningMoves`, where each move
  div's id already *is* its 0-based ply index and its class gives the colour;
  the variation id comes from the URL and edit rights are simply whether
  Chessable rendered the "Edit Variation" link, so no probe tab is needed).
  There is no JSON API for this, and several of Chessable's edit-form
  POST fields are session/CSRF-bound and opaque, so the only safe path is to
  drive Chessable's **own edit page**: the worker opens `/explore/edit/<oid>/`
  in a background tab (`clo-quick-edit-run`), and the driver there clicks the
  target move by its position in `#interactivePGN` (matched by ply index, since
  the edit page renumbers each variation from move 1 while review keeps the
  source game's numbering), appends to the "Comments After" textarea,
  sets the "For This Variation Only" checkbox, clicks "Update variation", and
  confirms Chessable's SweetAlert dialog — which is what actually submits the
  full-variation form. Success is detected when the POST lands the iframe on
  `/mt1/explore/?edit=<oid>`; the worker then relays the result to the review
  tab and closes the background tab. Edit rights are a per-course property,
  probed lazily: the pencil shows without knowing them, and only opening the
  comment popup while rights are still unknown runs the probe (one throwaway
  background tab, result cached per course per session) — the popup's Save
  button stays disabled until the probe confirms edit rights, and a course
  confirmed uneditable hides the pencil from then on. So no tab ever opens
  unless you actually try to comment. The move rows themselves are read only;
  nothing in Chessable's DOM is mutated.
- **Review auto-play** — runs entirely in the top document alongside the
  overstudy watcher. A `MutationObserver` on the trainer board coalesces
  mutations per animation frame into placement snapshots (the same
  `[data-piece]` reads the review panel uses); consecutive snapshots are
  diffed by asking the bundled move generator (`engine/san.js`, loaded as a
  content script) for the unique legal move that produces the new placement —
  castling, en passant and promotions all come out of the same comparison,
  and the resulting position object is the authoritative game state (true
  castling rights, side to move, ply count; the student's colour comes from
  the board orientation). Moves are classified by colour and provenance:
  opponent-colour ⇒ the trainer's; user-colour injected by us ⇒ bookkeeping;
  user-colour with recent *trusted* pointer input on the board ⇒ a genuine
  answer, recorded once the opponent replies or the variation completes
  (vetoed if the move notification reads "Incorrect"/"Time's up");
  user-colour with no pointer input ⇒ trainer-played (solution replays,
  Key-Moves prefixes) and never recorded. The record lives in
  `chrome.storage.session` keyed on placement+side+castling per course, so
  transpositions hit and nothing survives a browser restart. Before any
  auto-play the recorded move is checked against the variation's mainline,
  supplied by the **line oracle**: MoveTrainer2's own `lessonPlan`, which
  carries each ply's SAN and full source FEN and is already in memory before
  the variation's first move animates. React fibers are page-world state, so
  `content/pagestate.js` — the extension's only MAIN-world script, read-only
  and matched by shape rather than by minified component names — hands it to
  the content script over a `CustomEvent` pair. Nothing is fetched or cached.
  Any mismatch, unreadable plan,
  promotion, lost board tracking or unaccepted drag degrades to manual play —
  never a blind move. The move is **clicked** — one synthetic press on the
  source square and one on the target, back to back — only after the board has
  sat quiet long enough that Chessable's own auto-plays can't race it, and
  paused whenever the tab is hidden. Clicking rather than dragging is what
  makes a replayed move look like one the trainer played: Chessable animates
  click-moves, gliding the piece across with the same tween it uses for its own
  replies, while a drag would redraw the board instantly. Sending both presses
  in one go also means the selection — the grey pickup tint and the legal-move
  dots — never gets a frame to appear. The speed setting controls two waits:
  the pause before each replayed move (*Normal* is tuned to the ~480 ms the
  trainer itself waits before answering) and the longer quiet period required
  before the first move of a variation, while Chessable may still be setting
  the position up. The rest of the cycle belongs to Chessable — roughly 440 ms
  for the move to animate onto the board and 480 ms for its reply — so a
  replayed move takes about a second end to end even on *Fast*.
- **Selectors** — every Chessable selector (`#inputFEN`, `#nextMovesBit`,
  `.nextMovesTable`, `.nextMovesContainer`, `.chessboard-63f37`) is
  centralized in the `SELECTORS` object at the top of `lichessable.js`.
  If Chessable changes their markup, edit only that object.
- **Boot** — waits for the async app via MutationObserver + a 250 ms fallback
  poll, with a 25 s timeout.
- **Position detection** — three overlapping mechanisms, debounced by 300 ms:
  `input`/`change` events on `#inputFEN`, mutations of the `#nextMovesBit`
  tbody, and a 500 ms poll of the input's value (the value is written
  programmatically without events).
- **Self-healing** — the same 500 ms poll re-mounts the panel and re-attaches
  listeners/observers if the app re-renders its DOM (SPA-style navigation
  between explore pages). All re-attachment is idempotent, so there are never
  duplicate panels or leaked observers.
- **Click to play** — clicking a move row plays that move on Chessable's
  board, by simulating click-click input (a full pointer/mouse press sequence
  on the source square, then the destination square — squares carry
  orientation-independent ids like `e4-<uuid>`). Chessable handles it exactly
  like a user move, and the resulting FEN change triggers the panel's normal
  refresh. Promotion moves open Chessable's own promotion picker; pick the
  piece there. On a touch device (an Android phone/tablet, including Chrome's
  "Desktop site" mode) the same helper instead replays a real finger tap —
  pointer(touch) + touch events + the compatibility click — since the board's
  live handlers there are the touch ones and a mouse-only sequence reaches
  nothing; a pure-mouse desktop keeps the unchanged mouse sequence. The move
  injection used by auto-play shares this helper, so it works on mobile too.
- **Stale responses** — each fetch carries a sequence number; responses for
  positions you've already left are not rendered (though still cached).
- **Toggle** — Hide/Show collapses the panel body (header stays so you can
  re-open it); the choice persists in `chrome.storage.local` under
  `lichessableHidden`.

## Local engine (optional)

An **Engine** button in the panel header (all three modes: Explore, Analysis,
review browse) toggles local Stockfish analysis of the current position:
evaluation, search depth, and the top 3 lines (MultiPV 3) in SAN. Off by
default; the choice persists across sessions and tabs.

**Setup (one-time):** the engine binary is not in the repo (108 MB). From
<https://github.com/nmrugg/stockfish.js/releases/tag/v18.0.0> download the two
multi-threaded NNUE build files — the pair with **no** `lite`/`single`/`asm`
suffix:

- `stockfish-18.js`
- `stockfish-18.wasm`

and put both in `engine/vendor/` (keep the filenames — the loader derives the
`.wasm` path from its own name). Reload the extension.

**How it runs:** the engine loads in an MV3 *offscreen document*
(`engine/offscreen.html`) — the only extension context that can both run WASM
(`wasm-unsafe-eval` CSP) and get `SharedArrayBuffer` for the multi-threaded
pthread build (via the manifest's COOP/COEP keys). The service worker is the
message hub: content scripts request analysis (`clo-engine-analyze`), the
offscreen engine streams throttled updates back, and the worker relays them to
the requesting tab/frame (offscreen documents cannot message content scripts
directly). Searches run `go depth 24` with 4 threads / 64 MB hash (constants
at the top of `engine/engine.js`), so the CPUs go idle once a position is
fully searched. Scores are always shown from White's perspective.

**Resource notes:** expect roughly 250–400 MB of memory while the engine is
enabled (check Chrome's task manager, Shift+Esc). Turning the toggle off
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
- The response's `opening` field (ECO + name) is shown above the summary bar,
  and each move's `averageRating` appears as a tooltip on the move cell.

Network behavior:

- **Cache** — in-memory LRU (200 positions) keyed on the first four FEN
  fields, so transpositions that differ only in move counters share an entry.
  Stepping back and forth through a line never re-hits the API. Responses that
  arrive after you've already moved on are still cached for their position.
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

- `storage` — remembers the show/hide, engine and auto-play preferences and
  holds the Lichess API token; `storage.session` carries the engine's reply
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
  a plain content-script fetch was enough.
- Nothing else: no tabs permission, no scripting, no access beyond
  chessable.com (content script) and explorer.lichess.org (worker). Note the
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
  session (12 h cap) — never across days.
- All class names Chessable-side are treated as fragile; see `SELECTORS`.
