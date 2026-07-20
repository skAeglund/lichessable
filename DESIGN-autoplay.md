# Design: auto-play already-mastered moves in review

Status: IMPLEMENTED in v0.16.0 (content section 13 + line-oracle hub in
background.js) following this design. Everything marked *verified* below was
ground-truthed live on the throwaway Testing course
(`https://www.chessable.com/course/453453/0/`, bid 453453) on 2026-07-20.

> **SUPERSEDED IN v0.18.0 — the line oracle (§6, §4e) no longer exists as
> designed here.** Everything below about fetching `/variation/<oid>/` in a
> hidden tab, the `clo-line-oracle-*` message flow, the persistent oracle
> cache, passive prefetch and the **Prepare course** button was removed. It
> turned out MoveTrainer2 already holds the whole current variation in page
> state: its state-machine context carries a `lessonPlan` array with, per ply,
> `san`, `from`, `to` and the FULL `sourceFen`/`targetFen`. Verified live
> 2026-07-21: the plan swaps to the next variation ~90 ms BEFORE that
> variation's first move animates, and a whole variation replays with ZERO
> network requests. `content/pagestate.js` (the extension's only MAIN-world
> script — React fibers are page-world state) reads it over a `clo-ps-req` /
> `clo-ps-res` CustomEvent pair. Consequences: no fetch, no tab, no cache, no
> prefetch, no waiting; and no SAN re-simulation either, since each ply's
> position is parsed straight from its own `sourceFen` — so the "line does not
> replay from a known start" and ambiguity bail-outs are gone too. The
> DECISIONS in §1–§5 and §7–§9 (what gets recorded, position keying, the
> conflict guard's *rule*, drag injection, hand-back behaviour) all stand
> unchanged; only the oracle's *source* changed. See CLAUDE.md section 13.

---

## 1) Feature definition & scope

Within one review session, record every move the user answers correctly. When
the trainer later reaches a position the user has already proven **this
session** — typically the shared prefix of the next variation, but any
transposition into a known position counts — the extension plays the recorded
move itself, lets it register as a normal correct answer, and hands control
back at the first position the user has NOT yet proven. The first occurrence
of every move is always played by hand; only repeats auto-play.

This targets Chessable's known weakness: it schedules per *variation-move*,
not per position, so a course whose lines share a long prefix re-drills that
prefix once per variation, every session.

The feature runs on the **All Moves** study setting. Under **Key Moves**,
Chessable itself already auto-plays the non-key prefix (verified, section 5),
so the feature is largely redundant there — it stays enabled but will simply
find nothing to do until the first quizzed move.

**Fallback design ("start from ply X")** — auto-play the first X plies of
every variation unconditionally. Rejected as the shipped feature: it is
strictly weaker (no transposition handling, no per-line adaptivity, X is a
global guess), it can skip moves the user never proved (violating the "answer
every move correctly at least once" bar), and it collides with Key Moves
(double skipping). It also turns out not to be simpler: the hard part — the
auto-play driver — is identical, and the recording layer the primary design
adds on top is small. The recording/matching layer proved feasible live, so
the fallback is dropped from scope. (A user who wants exactly that behaviour
already has a native approximation: Key Moves + the owner-side "Automatically
choose key moves … by common position" builder.)

## 2) Keying decision, session scope, conflict guard

### Position-keyed (chosen)

The record is keyed on the **position**, and the value is the move played:

```
key   = piece placement + side to move + castling rights   (en passant always '-')
value = { uci, promo?, seenAt, count }
```

This is the same normalization the panel's explorer cache already uses
(`cacheKey`: first FEN fields, move counters dropped) minus the en-passant
field, which the DOM cannot supply (accepted approximation, see §8).

Rationale:

- *Feasibility is confirmed.* The quiz board is the **same DOM** the
  browse-state FEN reconstruction already reads: `.square-e4`-classed squares
  containing `[data-piece]` divs inside `[data-testid="boardContainer"]`
  (verified mid-quiz repeatedly). Only the side-to-move source differs — the
  browse state parses the comment-panel move list, which is empty mid-quiz —
  and §4's move tracker supplies that exactly instead of parsing anything.
- *Transpositions come free.* A position reached by a different move order
  still hits the record. Ply-index keying loses exactly the cases this
  feature exists for.
- *Ply-index keying is also more fragile in practice*: verified live that a
  failed variation **restarts mid-session and re-quizzes an arbitrary subset**
  of its moves (only the unbanked ones — the trainer jumped straight from the
  one re-answered move to "Completed"). A ply cursor has to model all of
  that; a position lookup simply does not care how the trainer got there.

### Session scope

Records live in `chrome.storage.session` (cleared when the browser closes,
survives SPA re-renders, page reloads, and service-worker restarts), under one
key per course, and every entry carries a timestamp. Entries older than
`CONFIG.autoPlay.recordTtlMs` (default 12 h) are ignored and pruned. So
"proven" never leaks across days even if the browser stays open, and a due
card can never be auto-passed by a stale proof. No `storage.local`
persistence, deliberately — persisting across days would silently pass
genuinely-due cards and defeat spaced repetition.

Note: content scripts cannot read `storage.session` by default; the worker
must call `chrome.storage.session.setAccessLevel('TRUSTED_AND_UNTRUSTED_CONTEXTS')`
once at startup. One line in background.js, no new permissions.

### Conflict guard (same position, different expected move)

The one real corruption path: the record says the user answered `X` in this
position, but the current variation's mainline expects `Y` (e.g. an updated
repertoire where old and new lines coexist in the rotation). Auto-playing `X`
would register a mistake ("Incorrect", verified: piece snaps back and the
move is scored wrong).

The guard is **verification against the variation's actual line before any
auto-play**, using the line oracle of §6: when a variation's first user-turn
position hits the record, the extension fetches that variation's mainline
(SAN per ply) once, and from then on only auto-plays a recorded move whose
SAN — computed from the recorded UCI via the existing pure `engine/san.js` —
equals the oracle's SAN at that ply. Mismatch ⇒ no auto-play, manual input,
and the FEN is marked `conflicted` for the rest of the session so later
variations do not retry it. The mistaken-auto-play path is therefore designed
out, not merely detected after the fact.

If the oracle cannot be obtained (timeout, markup change), the variation
simply gets no auto-play. Manual play is always the failure mode — never a
blind move.

## 3) The session record

```js
// chrome.storage.session, key 'cloAutoPlayRecord'
{
  "<bid>": {                       // per course; different courses never cross
    "<posKey>": {                  // "<placement> <side> <castling>"
      uci: "e7e6",                 // observed from the board diff, not SAN-parsed
      promo: null,                 // "q"|"r"|"b"|"n" for promotions (see §8)
      seenAt: 1789200000000,       // last confirmation; TTL pruning
      count: 3,                    // times confirmed (diagnostics only)
      conflicted: false            // true ⇒ never auto-play this position again
    }, …
  }
}
```

- **Population**: §4's move tracker watches the quiz board. A user-side move
  that the trainer accepts is recorded; acceptance is signalled by the
  opponent's reply landing / the variation completing, corroborated by
  `moveNotification` ≠ "Incorrect"/"Time's up" (verified signals). Moves the
  trainer plays *itself* (solution replays after "Time's up", Key-Moves
  prefix auto-plays, our own auto-plays) are recognised by the tracker (no
  preceding synthetic or user pointer input on our side of the board) and are
  **not** recorded — only genuinely answered moves count, so an auto-pass can
  never chain off a shown solution. Our own auto-played moves only refresh
  `seenAt` of entries that already exist.
- **New-variation detection**: the drawer row carrying
  `#currentStudyingVariation` exposes `oid`/`lid`/`title` as attributes
  mid-quiz (verified — same source the overstudy widget polls at 500 ms). An
  `oid` change resets the per-variation state machine (§4). A board reset to
  the variation's starting position with the same `oid` (verified: failed
  variations restart mid-session) resets it too.
- **Durability**: the record survives SPA re-renders trivially (the top
  document's content script never reloads during a session) and reloads /
  worker restarts via `storage.session`. Writes are debounced (one `set` per
  answered move is fine; a review session is tens of moves, not thousands).

## 4) Mechanism

All of this runs in the existing top-document content script (a new section
13, sibling of the overstudy watcher), because review is MoveTrainer2 in the
top document. The service worker is involved only for the line oracle.

### 4a) Board move tracker (replaces FEN polling for the quiz)

A `MutationObserver` on the board container (childList+subtree, the same
node `readReviewFen` reads) coalesces mutations per animation frame into
board snapshots (`square → piece` map, exactly `readReviewFen`'s loop).
Diffing consecutive snapshots yields moves: one piece vanishing from `from`
and appearing on `to` (plus rook hop = castling, pawn-to-last-rank piece
change = promotion, ep = pawn diagonal to empty square). Mid-animation frames
(piece on two squares / missing king) are skipped exactly as
`readReviewFen` skips them today (verified those transient frames occur).

The tracker maintains the authoritative game state for the current
variation: position (from the observed initial position + applied moves) and
side to move. That gives a **full, exact FEN mid-quiz** — placement from the
DOM, turn from the move count — without parsing any move list. Castling
rights are tracked properly (king/rook moves observed), en passant stays
`'-'` in the *key* by normalization.

The tracker classifies each observed move:

- opponent-side move ⇒ trainer played it; update state.
- user-side move that we did not inject ⇒ user answered; if not reverted
  (wrong moves visibly snap back — verified) and `moveNotification` did not
  read "Incorrect"/"Time's up", record it (§3).
- user-side move we injected ⇒ auto-play bookkeeping (below).

### 4b) Auto-play loop

State machine per variation, evaluated whenever the tracker settles on a new
position with the user to move and the quiz idle:

```
on user-turn position P:
  entry = record[bid][posKey(P)]
  if !enabled or !entry or entry.conflicted        → manual (do nothing)
  if oracle for this oid unknown                   → request oracle (§6), manual meanwhile
  if oracle failed                                 → manual for rest of variation
  if san(entry.uci, P) !== oracle.sanAt(plyOf(P))  → mark conflicted, manual
  else                                             → wait speedDelay, injectDrag(entry)
```

The loop naturally hands control back at the first unproven position: the
lookup misses, nothing happens, the trainer sits waiting for the user as
usual. It also naturally *resumes* if a later position hits the record again
(transposition mid-line), and covers mid-session variation restarts for free.

`plyOf(P)` — the tracker knows how many moves have been played from the
variation's initial position; the oracle indexes its SAN list the same way.
For a transposition where ply order differs the count still matches (same
number of plies from the same initial position; different ORDER is fine, and
if the variation starts from a non-initial position — tactics — ply 0 is the
oracle's first move div, whose 0-based ids are exactly this index, verified
markup).

### 4c) Injecting a move — the drag sequence

**Verified: the explore-page `playMove` click-click sequence does NOT work on
the trainer board.** The quiz board accepts a synthetic **drag**:

```
mousedown(source square el, {buttons:1})   // .square-e4-classed div
  ~20 ms
mousemove(document, at target center, {buttons:1})
  ~20 ms
mouseup(target square el) + mouseup(document)
```

Live results: accepted in 0–1 ms, every time, across ~20 moves including
captures and a check; same-tick event bursts (no inter-event delay) are
unreliable — keep the ≥15 ms gaps. This becomes a sibling helper to
`playMove` (`dragMove(fromEl, toEl)`), reusing square lookup via a new
`SELECTORS`-driven resolver on the review board.

### 4d) Speed

Verified timing: acceptance is instant; the *floor* is Chessable's own
opponent-reply animation, ~220–480 ms per reply (4 user moves in 1.35 s went
through cleanly, no waiting for animations to settle needed — the next drag
can fire the moment the opponent's piece appears in the DOM). So:

- **"Instant position" is not achievable** — we cannot make the trainer reply
  faster; ~2 moves/second is the hard ceiling.
- The speed setting is therefore an *additional pause before each auto-played
  move*: `Fast` = 0 ms (ceiling pace, a 10-ply prefix ≈ 2–3 s), `Normal` =
  400 ms, `Relaxed` = 900 ms (watchable). Config in
  `CONFIG.autoPlay.speeds`.

The per-move quiz timer (~10–20 s, verified it exists and fails moves on
expiry) is never a risk at any of these speeds; the oracle fetch (~2–4 s,
once per variation) happens while the user could also just play, and the
timer restarts per quiz move.

### 4e) Background message flow (line oracle only)

Mirrors the quick-edit job pattern (one job at a time, job in
`chrome.storage.session`, hidden tab, hard timeout, tab closed on finish):

```
content → worker: { type:'clo-line-oracle-run', oid, bid }
worker: tabs.create('https://www.chessable.com/variation/<oid>/', {active:false})
variation-page content script (new IS_VARIATION_PAGE branch):
        → worker: { type:'clo-line-oracle-claim', oid }   // am I a job tab?
        (waits for #theOpeningMoves to render, then)
        → worker: { type:'clo-line-oracle-result', oid, ok:true,
                    line:[ {san:'Nc6', color:'b', key:true}, … ] }
worker → requesting tab: relays result, closes hidden tab, clears job
```

SAN on that page: the move div's text lacks the piece letter (it is an SVG
figurine), but the figurine span carries `data-piece="knight"` etc.
(verified), so full SAN is `pieceLetter(data-piece) + textContent`, and the
`is_key` class comes along free. Results are cached per `oid` in
`storage.session` for the day (lines do not change mid-session; a course
edit invalidates by TTL). Only variations that actually hit the record ever
open an oracle tab, so tab churn is bounded by usefulness.

## 5) Observed SR behaviour of auto-played moves (test account)

- A **fully synthetically answered variation registered exactly like a
  hand-played one**: 100% accuracy, normal +XP per move, "Completed" stats
  block, and the same course-page state afterwards as the user's genuine
  100% hand-played variation. There is no distinction anywhere — Chessable
  sees pointer events and scores a correct answer. This is the intended
  semantics: auto-pass = normal pass, interval grows as if answered.
- Mistakes behave independently per move: "Incorrect" (snap-back, retry per
  the retry settings), "Time's up" (solution shown, move failed, session
  advances, variation restarts later re-quizzing only unbanked moves).
  Variations with any mistake got flagged "Difficult" on the course page;
  clean ones did not.
- Progress is saved per *variation completion*
  (`POST /api/v1/saveProgressAndReturnNewProgressInfo` fires once, at
  completion — not per move). Abandoning mid-variation loses that
  variation's answers on Chessable's side; our record keeps them (they were
  still proven), which is correct — the re-quiz will auto-play them.
- Key Moves (per-course setting, Course Settings → Study; **not** in the
  trainer settings gear): with key moves designated, the trainer itself
  auto-plays the entire non-key prefix at variation load and quizzes every
  move from the first key move onward. With none designated, Key Moves
  behaves as All Moves (every move quizzed — verified on this course before
  designation). "What counts as a passed move" under Key Moves is therefore:
  key moves are quizzed and scored; the auto-played prefix is not asked.

**Surfaced to the user** (README + options-page blurb + tooltip on the
toggle): *"Auto-played moves count as normal correct answers — the move was
proven earlier this session, and Chessable schedules it as passed. Failed or
timed-out moves are never auto-played, and a move is never auto-played the
first time it appears in a session."*

## 6) Move-data source

Two sources, used for different things:

1. **The board itself** (primary, free): every move — the user's and the
   trainer's — is observed as a square diff by the tracker. This is where
   the record's UCI comes from; no SAN parsing, no move list, no API.
2. **The line oracle** `/variation/<oid>/` (on demand, hidden tab): the
   variation's mainline SAN + `is_key` flags, used *only* to verify a
   candidate auto-play (conflict guard). Fetched lazily the first time a
   variation hits the record, cached per session.

Explicitly rejected: Chessable's JSON API. The trainer uses
`GET /api/v1/getReview?uid&bid&lid&oid` (it even prefetches the next
variation at completion — observed), but a plain same-origin fetch returns
`401 {"Token not found"}` (verified): the calls are token-bound the same way
the edit-form POSTs are. Consistent with the repo rule — drive their UI,
never their private API. A `fetch()` of the variation page HTML is also
useless (SPA shell, 4 KB, no moves — verified); the oracle must be a real
rendered page, hence the hidden tab.

## 7) UI

Extends the existing body-mounted overstudy widget (`clo-review`) — already a
singleton, positioned under the board for the whole trainer session, never
inside Chessable's React tree — with one new cluster:

- **Auto-play toggle** (`aria-pressed`, persisted in `chrome.storage.local`
  key `cloAutoPlayEnabled`, **off by default**).
- **Speed select** (Fast / Normal / Relaxed, `cloAutoPlaySpeed`).
- A small status chip while acting: `▶ replaying known moves… (click to
  stop)` — clicking it (or any user mousedown on the board) cancels
  auto-play for the current variation and hands control back instantly.
  Also shown briefly: `✋ new move — your turn` on handback, and
  `⚠ line differs here — manual` on a conflict. All text via
  `textContent`, styles namespaced `.clo-`.

States: disabled (nothing rendered beyond the toggle), armed (toggle on, no
match yet), verifying (oracle in flight), replaying, handed-back, conflict.

## 8) Edge cases

- **Promotions**: recorded as `{uci, promo}`. The drag lands the pawn and
  Chessable's picker opens (explore behaviour; picker markup on the trainer
  board is UNVERIFIED — no promotion lines in the test course). Until the
  picker selector is ground-truthed, positions whose recorded move is a
  promotion are simply not auto-played (hand back). Safe default, tiny cost.
- **Subvariations**: reviews quiz the mainline only (verified none of the
  test subvariations were quizzed). The tracker follows whatever the trainer
  does; subvariation content never enters the record.
- **Comment/text gates** ("Stop for text" settings): a text stop shows a
  `Next` button instead of accepting moves. The tracker sees no user-turn
  quiz state, so auto-play just waits; the user clicks Next as normal.
  We never click Chessable's Next for them (conservative; revisit if it
  proves annoying).
- **Mid-animation frames**: skipped by snapshot sanity checks (exactly one
  king per side, no duplicated piece), same as `readReviewFen` today.
- **Very short lines / lines with nothing known**: lookup misses at ply 0,
  feature is inert. Zero cost.
- **Transpositions**: handled by keying; ply for the oracle check comes from
  move count, which transpositions preserve.
- **Same position, different move**: §2 conflict guard; never auto-played,
  marked `conflicted` for the session.
- **Session end / summary screen**: drawer marker disappears (existing
  overstudy watcher already handles this state); tracker disarms.
- **Tab hidden / occluded**: auto-play pauses while `document.hidden`
  (mirrors `syncEngine`; also, all timing above was measured on a visible
  tab — background-tab throttling of Chessable's own animations is untested).
- **Paused session**: pausing empties the board and input is void (verified).
  Observed triggers during testing: most likely the window losing focus
  (Chessable appears to auto-pause the review then — the user tabbed out
  during the run); possibly also "Time up action: stop timer" (not cleanly
  attributed). Either way the empty-board snapshot fails the king sanity
  check, so the tracker freezes until resume — no special casing needed,
  and the focus-pause behaviour independently justifies pausing auto-play
  while `document.hidden`.
- **The quiz timer**: auto-play at any speed finishes a move in well under a
  timer period. A timer expiry during *manual* play looks like a
  trainer-played solution move (note "Time's up") and is never recorded.
- **Key Moves interplay**: Chessable's own prefix auto-play appears to the
  tracker as trainer-played moves (not recorded, not interfered with); our
  auto-play only ever acts on a waiting quiz, so the two never race. The
  dropped fallback design would have collided here; the primary does not.
- **Multiple review tabs on the same course**: the record is shared
  (storage.session is extension-global); last-writer-wins per position is
  benign (both writers record correct answers). The oracle job queue is
  one-at-a-time like quick-edit.

## 9) New SELECTORS / fragility

New entries (all trainer/top-document; everything else reuses existing ones —
`board`, `reviewBoardWrap`, `reviewSquare`, `reviewPiece`,
`reviewCurrentMarker`, `reviewRowVidAttr/ListAttr`, `variationMoves`):

```js
trainerMoveNote:   '[data-testid="moveNotification"]', // "Incorrect" / "Time's up" / "XP"
variationKeyClass: 'is_key',                           // key-move marker on variationMoves divs
variationPieceGlyph: '.commentMove__piece[data-piece]',// figurine span → SAN piece letter
```

Fragile points, in order of risk:

1. **The drag recipe** — an input-handling change on Chessable's side breaks
   auto-play outright (fails safe: moves just don't happen, user plays on).
   The 15 ms inter-event gaps are load-bearing; verified same-tick bursts
   misbehave.
2. **`moveNotification` strings** — used only as a *veto* on recording;
   if the testid or wording changes, worst case is over-cautious
   non-recording, never a wrong record (opponent-reply confirmation is the
   primary signal).
3. **`is_key` / figurine markup on the variation page** — breaks the oracle
   ⇒ auto-play silently stops (manual play). Already partially load-bearing
   for quick-edit, so breakage would be noticed.
4. Timer/retry/"Time up action" behaviours are user-configurable; the design
   deliberately depends on none of them.

## 10) Permissions

**None needed.** Confirmed against everything used: board observation and
drags are DOM-only; `chrome.storage.session` needs no permission beyond the
existing `storage`; the oracle tab uses `tabs.create/remove/sendMessage`,
which need no `"tabs"` permission (established by the overstudy/quick-edit
features); no new hosts (chessable.com pages are where content scripts
already run); no remote code. `setAccessLevel` for storage.session is an
API call, not a permission.

## 11) Open questions / not confirmed live

1. **Promotion picker on the trainer board** — never seen (no promotion in
   the test course). Until verified, promotion moves hand back (§8).
2. **Timer length & scaling** — per-move timer duration was not measured
   precisely (~10–20 s observed indirectly); irrelevant at auto-play speeds
   but worth knowing for the status UI.
3. **Accuracy accounting details** — the "Completed" accuracy percentages
   did not always match a naive per-move count (e.g. one 75% where 80% was
   expected). Does not affect the design (we never *cause* mistakes), but
   the README claim about accuracy should stay vague.
4. **`saveProgress` batching** — observed firing at variation completion;
   not proven that *no* per-move saves exist in other course types.
5. **Non-owned courses**: the oracle page and `is_key` markup were verified
   on an owned course only; the repo's quick-edit work verified
   `#theOpeningMoves` on other courses, but `is_key` there is unconfirmed
   (harmless — it is informational, not load-bearing).
6. **Background-tab behaviour**: all timings measured on a visible tab;
   auto-play is paused while hidden partly for this reason.
7. **Tactics-style variations starting mid-game**: ply mapping logic is
   designed for it (0-based ids, verified markup) but not exercised live in
   a review.
8. **"Quiz speed" user setting** (trainer settings → Piece animation): its
   effect on the ~220–480 ms reply latency was not measured; if `Fast`
   shortens replies, the auto-play ceiling improves for free.
9. **What exactly pauses the session** — the pause overlay seen mid-test was
   probably Chessable auto-pausing on window blur (the user tabbed out), not
   the "stop timer" setting as first assumed. Worth one deliberate check:
   blur the window mid-quiz and confirm the pause + that resume restarts the
   variation (a restart was observed after that pause; if blur⇒pause⇒restart
   is real, it strengthens the case for freezing auto-play on `document.hidden`).
