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
> line check's *rule*, drag injection, hand-back behaviour) all stood
> unchanged; only the oracle's *source* changed. See CLAUDE.md section 13.
>
> **v0.55.0** then made a position hold a SET of proven moves and turned the
> old conflict guard around: the line names the move, the record only proves
> it. §2 and §3 are rewritten for that; everything else still stands.

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

## 2) Keying decision, session scope, line check

### Position-keyed (chosen)

The record is keyed on the **position**, and the value is the **set** of moves
proven there:

```
key   = piece placement + side to move + castling rights   (en passant always '-')
value = { moves: { "<uci>": { uci, promo?, seenAt, count }, … } }
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

### Line check (which move does THIS variation want here?)

*Superseded the "conflict guard" in v0.55.0. The rule below is stricter than
what it replaced; only the direction of the question changed.*

The one real corruption path: the record says the user answered `X` in this
position, but the current variation's mainline expects `Y`. Auto-playing `X`
would register a mistake ("Incorrect", verified: piece snaps back and the
move is scored wrong).

The guard is **the line, not the record, choosing the move**, using the line
oracle of §6. On a user-turn position: locate the position in the plan's own
line by content, resolve the mainline's SAN there to a UCI *on the plan's own
position* (exact castling and en passant, via `sanToUci`), and auto-play it
only if that exact move is in the position's proven set. Otherwise: no
auto-play, manual input, retried the next time a variation passes through.
The mistaken-auto-play path is designed out, not detected after the fact —
the move played is by construction the one the current variation asks for.

**Same position, two right answers.** A course regularly answers one position
two ways: two variations branching at ply 4 (2...Nc6 in one, 2...Qb6 in
another) are both correct, each in its own line. Because the question is
"is the line's move proven?" and not "does the record's move match the line?",
proving both makes both lines fully auto-playable, and neither disables the
other.

This is what the multi-move value in §2 buys, and it is why nothing is
memoised as `conflicted` any more: a mismatch is no longer a verdict about
the position (which was wrong whenever the position had a second answer), just
a statement about one variation at one moment.

Castling notation cannot bite here: both sides come from CloSan's own
generator — the record's UCI is a board diff resolved through it — so O-O is
`e1g1` on both, never the explorer's king-takes-rook `e1h1`.

If the oracle cannot be obtained (timeout, markup change), the variation
simply gets no auto-play. Manual play is always the failure mode — never a
blind move.

## 3) The session record

```js
// chrome.storage.session, key 'cloAutoPlayRecord'
{
  "<bid>": {                       // per course; different courses never cross
    "<posKey>": {                  // "<placement> <side> <castling>"
      moves: {                     // EVERY move proven here, not just the last
        "b8c6": {
          uci: "b8c6",             // observed from the board diff, not SAN-parsed
          promo: null,             // "q"|"r"|"b"|"n" for promotions (see §8)
          seenAt: 1789200000000,   // last confirmation; TTL pruning, per move
          count: 3                 // times confirmed (diagnostics only)
        },
        "d8b6": { … }              // a second variation branches here — also right
      }
    }, …
  }
}
```

Pre-v0.55.0 entries were one move per position (`{uci, promo, seenAt, count,
conflicted}`) directly under `<posKey>`. They live in `storage.session` and so
outlive the build that wrote them — an extension reload mid-session must not
cost the user their proofs — so `pruneRecordEntry` reads them as a one-move set
on the way in, dropping the dead `conflicted` flag. An old build reading a new
entry sees no `uci` and degrades to manual play, never to a wrong move.

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

**Two plies in one frame** (`findMovePair`, v0.82.0). A frame is delivered
through rAF, or the 32 ms backstop, and both are pushed out by Chessable's own
animation work, our board's render and (in section 23) the plan chase's JSON
round trip — on a mid-tier phone easily by the ~440 ms that separates a user
answer from the trainer's reply. The frame then carries the placement AFTER the
reply, `findSingleMove` matches nothing, and the tracker re-anchors. That is not
merely a lost frame: `startTracking` drops `pendingRecord`, so the user's answer
never becomes a proof, and the loss is invisible until the next variation, where
auto-play declines a move the user demonstrably knows.

So the jump is resolved rather than given up on: exactly one PAIR of legal moves
must produce the placement, and both are applied in order, so the answer is
classified, held and then confirmed by the reply that overtook it. Any ambiguity
falls through to the re-anchor, which is what the whole case did before. The
search runs only on the path that was about to re-anchor anyway (a handful of
times a session, never per frame) and costs ~900 `makeMove` calls at worst. The
rollback check still comes first, so a board that snapped BACK to a known
position is a rollback and not a pair. Spot-checked against the real generator:
e4 e5, e4 c5, a capture, an exchange, O-O as the first ply, en passant as the
first ply, a promotion as the first ply, three plies → refused, one ply → left to
`findSingleMove`.

**A proof can also be ASSERTED** (`autoPlayNoteProvenMove`, v0.82.0) — the one
write bridge into the record, and section 23's alone. Show and grade plays the
COURSE'S own move, from a position the lesson plan states exactly, so "did the
user answer this correctly" is not a question about the board at all; the veto,
the merge and the key are `confirmPendingRecord`'s unchanged. See
DESIGN-show-and-grade.md §2b. Nothing derived from the DOM may use this door.

### 4b) Auto-play loop

State machine per variation, evaluated whenever the tracker settles on a new
position with the user to move and the quiz idle:

```
on user-turn position P:
  entry = record[bid][posKey(P)]
  if !enabled or !entry                            → manual (do nothing)
  if oracle for this oid unknown                   → request oracle (§6), manual meanwhile
  if oracle failed                                 → manual for rest of variation
  wanted = uciOf(oracle.sanAt(plyOf(P)), P)        → the move THIS line asks for
  if !wanted or wanted is a promotion              → manual
  proven = entry.moves[wanted]
  if !proven or expired                            → manual (retried next time through)
  else                                             → wait speedDelay, injectMove(proven)
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
   variation's mainline SAN + `is_key` flags, used *only* to decide which move
   this line wants (the line check). Fetched lazily the first time a
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
  key `cloAutoPlayEnabled`, **on by default since v0.81.0** — the key is opt-OUT,
  so an absent value means ON and every read is `!== false`).
- **Speed select** (Fast / Normal / Relaxed, `cloAutoPlaySpeed`, **Fast** by
  default since v0.81.0).
- A small status chip while acting: `▶ replaying known moves… (click to
  stop)` — clicking it (or any user mousedown on the board) cancels
  auto-play for the current variation and hands control back instantly.
  Also shown briefly: `✋ new move — your turn` on handback. (A `⚠ line
  differs here — manual` chip existed for the old conflict verdict; v0.55.0
  dropped it with the verdict — a line whose move is not proven yet is an
  ordinary hand-back, and saying more would be noise.) All text via
  `textContent`, styles namespaced `.clo-`.

States: disabled (nothing rendered beyond the toggle), armed (toggle on, no
match yet), verifying (oracle in flight), replaying, handed-back.

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
- **Same position, more than one right move**: §2 line check. Each variation
  replays the move its own line asks for; a position is auto-playable in as
  many lines as the user has answered it in, and unproven answers are simply
  handed back, never held against the position.
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

---

# 12) Implementation notes since the original design

Everything above describes the feature as first designed. What follows is what
changed while it was built and used — kept here rather than in CLAUDE.md, which
carries only the contract surface and the anti-repair notes.

**"Difficult moves only" (13b/13c/13d) has its own document:
`DESIGN-difficult-moves.md`.**

## 12.1 A position holds a SET of proven moves (v0.55.0)

`{ moves: { <uci>: { uci, promo, seenAt, count } } }`. A course regularly answers
one position two ways — two variations branching at ply 4, 2…Nc6 in one and
2…Qb6 in another — and both are right, each in its own line.

`confirmPendingRecord` therefore **merges** a proof in beside the others;
replacing was what made proving the second cost the user the first.

`pruneRecordEntry` is the single door into `ap.record` (load, cross-course save
prune) so everything else may assume `entry.moves`, and it doubles as the upgrade
path for pre-v0.55 single-move entries, which outlive their build in
`storage.session` — an extension reload mid-session must not cost the user their
proofs. An OLD build reading a new entry finds no `uci` and degrades to manual
play, never to a wrong move.

## 12.2 THE LINE CHOOSES THE MOVE, THE RECORD ONLY PROVES IT (v0.55.0)

It was the other way round. `evaluateAutoPlay` locates the position in the line
oracle, resolves the mainline's SAN there to a uci through `sanToUci` **on the
plan's own position** (exact castling and en passant), and injects only if THAT
move is in the position's proven set.

Asking it this way round is the whole of the multi-answer support: neither branch
of a shared position can disable the other, because the move played comes from the
variation being played and never from a record that has no idea which line it is
in. So there is nothing to memoise as "conflicted" — that flag and its
`⚠ line differs here` chip are **gone**, and an unproven line move is an ordinary
hand-back, retried next time a variation passes through, rather than a verdict for
the session.

Castling notation cannot bite: both sides are CloSan's own generator (the record's
uci is a board diff resolved through it), so O-O is `e1g1` on both and never the
explorer's `e1h1`. A promoting line move is refused by LENGTH (`sanToUci` appends
the piece, so it could never match a stored 4-char uci) with its own message rather
than reading as unproven.

## 12.3 The line oracle — `content/pagestate.js`

The extension's ONLY MAIN-world content script. React fibers are page-world
expandos, invisible to an isolated content script, so the plan cannot be read any
other way. READ-only: no page state written, no page function called, nothing put
on `window`.

Protocol: the isolated world dispatches `clo-ps-req` on `document` and gets one
`clo-ps-res` back whose `detail` is a **JSON string** (live objects would not cross
the world boundary); `readLessonLine()` wraps that with a timeout so every caller
sees one shape.

Search is by **shape** — a context object owning an array `lessonPlan` — because
component names in the bundle are minified; the PROPERTY names (`lessonPlan`,
`san`, `sourceFen`, `color`, `variationId`) come from Chessable's API payload and
are not.

Ground-truthed: the plan holds per ply `san`/`from`/`to`/`sourceFen`/`targetFen`,
swaps to the next variation ~90 ms BEFORE its first move animates, and a whole
variation runs with ZERO network requests. So `requestOracle()` needs no fetch, no
cache, no prefetch and no simulation: `vs.oracleSim[i].pos` is
`CloSan.parseFen(plan[i].sourceFen)` — exact, tactics lines starting mid-game
included. It still aligns by POSITION, not ply index, so transpositions and a late
tracker anchor both work. A read for the WRONG oid (trainer mid-swap) or an
unusable plan retries `oracleMaxTries` times behind `oracleRetryMs`, then the
variation goes manual.

## 12.4 The injection recipe

Injection **clicks** the move — `pressSquare` on the source then the target, the
explore panel's recipe unchanged, both presses in the **same task**. (An older note
claimed click-click does not work on the trainer board; it does, on quiet moves and
captures alike, and a DRAG is what should be avoided.)

Both halves are load-bearing and were ground-truthed live: click-move is the path
MoveTrainer2 **animates** — it tints both squares yellow and glides the piece with
the same ~200 ms tween its own replies use, whereas mousedown-here/mouseup-there
reads as a drag and redraws instantly (replays used to teleport). Same-task is what
keeps the SELECTION invisible: the grey pickup tint and the legal-move dots come
from React state and never get a frame to paint.

`pressSquare` picks its event flavour (mouse sequence vs. synthesised finger tap)
from the human's own trusted `pointerType`, **never** from
`navigator.maxTouchPoints` — a touchscreen laptop is touch-capable while being
driven with a mouse, and tapping such a board left MoveTrainer2 with a stale
selection, so the piece of the last injected move could not be picked up (v0.18.8
regression, fixed v0.18.9).

During the two presses `<html>` carries `clo-injecting`; its CSS is now only a
**backstop** for the case where the trainer slips a render between them — the
square tints (`highlight-legal-mt2` / `highlight-hover-mt2`, partly inline ⇒
`!important`) and the target markers, which are CHILD divs `legal-square-dot-mt2` /
`legal-square-capture-mt2` and NOT a `::before` (an earlier `::before` rule matched
nothing). **That CSS must never touch `.piece-417db`:** the element that animates
any move, Chessable's own replies included, is a `.piece-417db` parked on
`document.body` for the glide, so hiding it would break the very animation the
injection borrows.

## 12.5 The two clocks, and why they are stamped where they are

A speed preset is a `{move, settle}` pair, both counted from the last board change.
`move` is the ordinary pause before a replay (the same clock the trainer answers
on — ~480 ms measured live); `settle` replaces it whenever the trainer may still be
auto-playing (variation setup, Key-Moves prefix, solution replay), so it is the
wait at a variation's START. **Keep `settle` above ~450 ms** — that is how long one
animated trainer move occupies the board. The rest of a replay's cycle is
Chessable's and cannot be tuned: ~440 ms for our move to land, ~480 ms for the
reply.

`vs.lastMoveAt` — the origin of both clocks — is stamped in the **mutation
callback** (`frameTime()`, from `ap.mutationAt`), not when `processFrame` gets to
run, and `evaluateAutoPlay` subtracts the already-elapsed time from BOTH waits
(v0.30.1). **Never re-anchor a wait on `Date.now()` at evaluation time:** on a
phone the mutation→rAF→timer chain runs 100–300 ms late, and every re-entry
(`injectMove`'s bail-out, the 500 ms poll catching a frame the observer path
missed) then charged a whole extra `move` pause on top of the wait already served —
that is what made some mobile replays a second slower than the rest.

For the same reason a board mutation schedules a rAF **and** a `frameFallbackMs`
(32 ms) timer, first one through wins: rAF runs only while the document RENDERS,
and in a hidden tab it never ran at all while the pending flag swallowed every
later mutation. The oracle back-off (`oracleRetryMs`) also owns a real timer —
waiting for the next poll to notice it had expired cost up to 500 ms per retry, and
a first read losing the race against the trainer's ~90 ms plan swap is routine on
mobile.

`vs.trainerDrove` starts **false** and means strictly "a user-colour move was
trainer-played"; a `true` default used to cost 700 ms per variation, because the
opponent merely having replied is the ordinary variation-start case and needs no
floor at all.

`syncVariation()` is called from the 500 ms tick AND from every board frame, so a
new variation is recognised as soon as the board resets rather than up to 500 ms
later; it ignores a falsy oid so a mid-re-render blink cannot reset tracking.

## 12.6 Four ways a proof gets lost, and what fixed each

**An injected move is not only closed out by OBSERVING it.** Treating it that way
caused false "injected move did not land" hand-backs on real courses: the tracker
can lose the thread across an injection — the trainer bursting several plies
(Key-Moves prefix, a variation starting mid-line) re-anchors us and
`startTracking()` clears the history our own move would have matched against. The
verify timer (`vs.verifyTimer`, `injectVerifyMs` — 2.5 s, after which the position
goes manual) therefore asks the **board**: it stores `vs.injected.beforeKey` (the
placement the drag was meant to change) and only hands back when the placement is
still IDENTICAL to it. A changed (or unreadable) board means the move went through
untracked: clear `vs.injected`, no `manualHold`, re-enter `evaluateAutoPlay()`.
Keeping the still-identical case strict is what stops a refused drag looping.

**The line-ending move needs its own read** (`observeFinalFrame`, v0.53.3).
`processFrame` bails on `reviewBrowseReady()` — browse navigation is not play — but
the frame carrying a variation's LAST move arrives with the completion block
already rendered (MoveTrainer2 answers that move and completes the lesson in one
state transition; our mutation callback runs after that commit). So the move was
never observed, never became a `pendingRecord`, and
`confirmPendingRecord('variation completed')` — which exists for exactly this move,
since no opponent reply follows it — had nothing to confirm. The last move of a
line therefore never earned a proof. Invisible until a session plays the same line
TWICE, which is what a retry pass does: auto-play replayed the whole variation and
then handed back on its very last move, every time. So `tick`'s browse branch takes
one board read before suspending. **Observation only** — no `evaluateAutoPlay` (the
tracker is suspended on the next line) and no wrong-guess capture (the variation is
over) — and a frame that is not exactly one legal move on is left alone, since the
browse board may already have been navigated.

**…and the answer is also committed on the way out** (`resetVariation`, v0.81.0).
That read is on the 500 ms poll, and `syncVariation()` — which detects the
variation change and replaces `ap.vs` wholesale — runs BEFORE the browse branch on
that same tick AND on every board frame. So the instant the drawer's active row
flips, the still-uncommitted last answer goes with the rest of the per-variation
state. Same for a run that ends with NO browse state at all (a "Time's up" finish
renders no `practiceProgress` block, so `reviewBrowseReady()` never goes true) and
for leaving the trainer path mid-line. `resetVariation` therefore calls
`confirmPendingRecord('variation changed')` first.

> **Safe, for a reason worth writing down:** a pending record only ever survives a
> move the board ACCEPTED AND KEPT. `rollbackTo` clears both it and the pointer
> credit when a guess is taken back, and a refused move usually never commits to
> the DOM at all, so there is nothing to roll back and nothing pending. It is also
> why a trainer solution replay after "Time's up" cannot sneak through:
> `rollbackTo` has already zeroed `ap.lastPointerAt`, so that move is classified
> `'trainer'` and never becomes pending.

**A frame that arrives a whole reply late carries two plies, and is not a lost
thread** (`findMovePair`, v0.82.0). A user answer and the trainer's reply are
~440 ms apart, which is comfortable on a desktop and not on a phone: the frame is
delivered through rAF (or the 32 ms backstop) and both are pushed out by
Chessable's animation, our own board's render and — under section 23 — the plan
chase's JSON round trip. The placement then jumps two plies, `findSingleMove`
matches nothing, and the tracker used to RE-ANCHOR, which calls `startTracking` and
so **throws the pending answer away**: the move never became a proof, invisibly,
until the next variation declined a move the user demonstrably knows. So the jump
is resolved instead — exactly one PAIR of legal moves must produce the placement,
both applied in order, and any ambiguity still falls through to the re-anchor
(which is what the whole case did before). Only on the path that was about to
re-anchor anyway, so ~900 `makeMove` calls a handful of times a session and never
per frame; the `vs.history` rollback check still comes FIRST, so a board that
snapped BACK is a rollback and not a pair. Spot-checked against the real generator.

## 12.7 A proof may also be ASSERTED (v0.82.0)

`autoPlayNoteProvenMove(fen, uci)` — the one WRITE bridge into the record, and
section 23 is the only caller. Everything else learns a proof by WATCHING the
board, which is right for a move the user played and pointless for one WE played
from a position the lesson plan states exactly: show and grade presses the COURSE'S
OWN move, so "was this answered correctly" is not a question about the board at
all.

The veto (`readMoveNote`), the merge into `entry.moves` and the key are
`confirmPendingRecord`'s, unchanged — a move recorded this way is indistinguishable
from one recorded that way. **Not a general back door:** the caller must know the
exact FEN the move was played from AND know it was right, so nothing derived from
the DOM qualifies.

## 12.8 On by default since v0.81.0 — and the key is OPT-OUT

Absent means ON, so every read is `!== false` and never `Boolean(...)`. There are
**four readers and they must agree** — the pref load, the `storage.onChanged`
listener, and section 17's `prevAutoPlay` (which SAVES the user's setting to put it
back when a pass ends; reading an absent value as `false` there would switch
auto-play off for the rest of the session at the end of every pass).

`ap.enabled` still initialises to `false`: that is what an unreadable pref read
leaves behind, and it lasts only until the read lands.

## 12.9 The status chip is not in the cluster (v0.57.0)

It is appended to the widget's own `.clo-review-status` line through
`reviewStatusHost()`, and so is the retry pass's (section 17).

Inline among the controls, every message re-laid-out the row: measured, swapping
one auto-play message for another moved "Drill mistakes" 77 px across and 32 px
DOWN, threw "Retry" 467 px as the row re-wrapped, and changed the widget's height
75→107 px — which moves the Lichess panel, the alt-check chip and the heads-up,
since all three anchor below this widget.

The line is `order: 99; flex: 0 0 100%`, so it sits after every cluster on a line
of its own. `order`/`flex-basis` apply to flex ITEMS, i.e. direct children of
`.clo-review`, which is why the two elements had to be **re-parented** rather than
nudged with CSS where they sat. Its children carry an explicit `line-height`
because the messages are emoji-prefixed (▶ ✋ 🧹 ⚠) and the differing ascents grew
and shrank the line box by 2 px per message, which the panel below followed.

`reviewStatusHost()` creates the row on demand (a widget from an older build, or
one re-mounted by a React re-render, grows it again rather than swallowing every
message for the session) and each `ensureUi` drops a stale copy of ITS OWN status
first — a cluster can be rebuilt without the widget being re-mounted, and the
status no longer goes away with it.

## 12.10 `clearRecord()` ordering

Drops the CURRENT course's proofs from `ap.record` and from `storage.session`. It
**must cancel `ap.saveTimer` first**, or the debounced `saveRecord` would write the
old in-memory record straight back — and it calls `stopReplaying()`, since a replay
in flight was decided on what it just dropped.

The button arms on the first click and disarms after `clearArmMs`: one misclick
would otherwise cost a whole session's proofs. A re-mount of the cluster resets
that armed state.

## 12.11 Storage access, orphaned scripts, diagnostics

`background.js` calls `chrome.storage.session.setAccessLevel` at startup so the
content script can read that area (content sends `clo-ping` first to guarantee the
worker has run).

`noteDeadContext(err)`: after an extension reload, every `chrome.*` call in the
still-running content script throws "Extension context invalidated". Such an orphan
holds a record it can neither refresh nor save and could still drive drags off it,
so the module **stands down** on the first such error (auto-play off, observer
disconnected, poll cleared, `ap.contextDead` gates
`tick`/`processFrame`/`evaluateAutoPlay`) and logs one line telling the user to
reload the page. Reloading the extension alone never revives a tab.

`logHandback(reason)` prints one console line per (position, reason) pair whenever
auto-play declines to replay — no-record, the line's move not proven yet (named in
the message: "the line plays Qb6 here"), expired, promotion, oracle failed/pending,
ply not found in the line, unresolvable SAN — since a silent no-op is otherwise
indistinguishable from a bug.

Debug-only DOM hook: dispatching a `clo-debug` event on `document` dumps a summary
(record/cache key counts, no move data) onto `documentElement[data-clo-session]` —
storage areas are not otherwise visible from the page.
