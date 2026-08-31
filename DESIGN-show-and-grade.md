# DESIGN — Show and grade (section 23, 23b, 23c)

Status: **working**, and confirmed live in real review sessions. §14 is the
ground truth everything rests on (2026-08-04); §17 lists what has been seen
working and §18 what has not.

Section 23c, the **key-move lead-in**, has its own document —
`DESIGN-key-move-leadin.md`. It lives inside this module and renders on this
board, but nothing in this file depends on it.

---

## 1. What it is

An Anki-style *show and grade* mode for trainer sessions: the user never makes a
move. They watch, think, press one key to reveal the answer, then press one of
two keys to say whether they knew it. The extension answers Chessable on their
behalf and grades the card accordingly.

The point is **studying from a Bluetooth ring** — two keys and no board
interaction, so a session can be run with the screen out of reach. That is also
why §12 (audio and blindfold) exists: the mode was built with a seam for it.

---

## 2. The loop

**TWO presses per card, and EVERY press shows a move.** That is the governing
rule; it is what a ring is actually pressing, and a press that displays nothing
is a wasted one.

| Phase | Press | What is SHOWN | What else happens |
|---|---|---|---|
| `think` | `2` | **your move**, played on our board | — |
| `think` | `4` | **your move**, played on our board | the card is remembered as failed |
| `shown` | `2` | **the opponent's reply** | the card is graded — known, or failed if `4` was used above |
| `shown` | `4` | **the opponent's reply** | the card is graded as failed |
| `browse` | `2` | the next variation | — |

Both keys have the same shape: **first press reveals, second press advances.**
`4` at the `think` stage costs no press of its own — the card is lost either way
and the user still wants to see the move, so the verdict is remembered
(`sg.markedUnknown`) and applied by the press that advances.

A **third press** for the grade is what v0.69.0 had and what this replaced. Do
not reintroduce it.

Three things this shape buys:

* **The move is played, not just pointed at.** The arrow says *which* move; the
  glide says what the position now *looks like* — the more useful of the two for
  a mode aimed at blindfold practice. Both, not either.
* **The opponent's reply is never lost.** It is the one move in the cycle the
  user does not choose, and it is what the grading press displays.
* **The grade is free.** It rides on the press that was going to happen anyway.

`advanceAfterGrade()` runs the moment the key is pressed, NOT when the Chessable
act finishes: the reply comes from the plan, so there is nothing to wait for.

### Our board runs at the user's pace and is NOT slaved to the trainer

Between the grade and the reply press the trainer is one or two plies behind;
that is normal, not a desync. Three rules keep it honest:

* **`anchor()` only ever runs from `think`**, never while `awaitingFen` is set
  (the trainer still standing on the card we just answered) and never in the
  browse state. Without the first rule a re-anchor undoes the move the user asked
  to see; without the second, a user pressing quickly is dragged *back* onto a
  card already graded.
* **`cardReady()` gates both grades**: the trainer must actually be standing on
  the card our board is showing. What our board shows is not evidence about what
  the trainer is asking, and grading the wrong card is the one mistake here that
  costs a real scheduled move.
* **`failAct()` is the recovery**, and it is needed precisely BECAUSE the board
  advances on the press: an act that then cannot be carried out leaves our board
  a card ahead, where `cardReady()` would refuse every later grade for the rest
  of the session — the trainer never moves, so `awaitingFen` never clears on its
  own. A second watchdog in `tick()` (`actMaxMs`) covers the case where the act
  finished cleanly and still changed nothing, which is what a press swallowed by
  a paused board does.

### It does not run ahead of Chessable, and this will be proposed again

Every card is graded on Chessable, **in order**, and only while Chessable is
standing on it. Running ahead means holding a queue of ungraded cards where one
failed act mis-files every card behind it — and the moment the replay reaches an
unproven move the user waits for Chessable anyway, so the board would show move
12 while the trainer is on move 4. The gain is nothing; the failure mode is
grading the wrong card.

---

## 3. Animation

`.clo-cr-piece` already carries `transition: transform 180ms ease-out` — the
continuation board's, matched to MoveTrainer2's own ~200 ms click-move glide. So
the board inherits the animation and the only thing needed was to stop destroying
pieces: `playPlyOnBoard()` **moves the existing element** instead of letting
`reconcile()` remove-and-recreate it, which has nothing to transition from and
teleports.

`animMs()` is the delay before the reconcile that makes the DOM authoritative,
and **must never be shorter than the CSS transition** or the glide is cut off
mid-flight — which is why the glide setting drives both from one number
(`--clo-sg-anim` on the board element, leaving `.clo-cr-piece`'s shared 180 ms
rule alone for the other three boards). `advanceMs()` is floored at the glide:
the two settings are independent, and a brisk pace with a slow animation plays
the reply while your own move is still sliding.

Only the primary piece is glided; castling rooks, en passant and promotions come
out right because the reconcile afterwards is authoritative — the same
best-effort split the continuation board uses. Spot-checked against the real
CloSan generator over 25 landings (both castles, en passant, promotion, rook
disambiguation, a capture chain): every position our board walks to equals the
plan's own next `sourceFen`.

---

## 4. Auto-play (this mode's own)

Replays the cards the user has already answered correctly **this session**, so a
session gets to the new material instead of re-proving a shared prefix. Its own
toggle on the row (`cloShowGradeAutoPlay`, **opt-OUT since v0.160.0**, absent =
ON — it can only ever replay a card the user has ALREADY got right this
sitting, and §13's record is `storage.session` with a 12 h TTL, so on a fresh
session it has nothing to replay and does nothing; what it cannot do is answer
an unproven card, which is what would make a default-on setting cost the user
scheduling); the record itself stays section 13's
and this only asks, through `autoPlayIsProven(fen, uci)`. The FEN handed in is
always the lesson plan's own `sourceFen`, which is exact — so this needs none of
the tracker's heuristics.

An auto-played card runs the *same two steps a press would*: `reveal()`, a beat,
then `gradeKnown()`. No second code path for the board or the grade to drift down.

### 4.1 It uses `ap.sgHeld`, never `ap.heldOff` — the v0.71.0 bug

As shipped it held section 13 off with `autoPlayHold(true)`, and **`processFrame`
returns on that flag**. So for the mode's entire duration the tracker observed
nothing: no move classified, no `pendingRecord` set, no proof ever recorded.
Auto-play then consulted an empty record and could never fire. Nothing about the
auto-play code itself was wrong.

Under this mode the session underneath **is** really being played — we press its
squares, it animates, it replies — so those frames are real moves and reading
them is the entire point. `ap.sgHeld` (via `autoPlayShowGradeHold`) is ORed into
`held()`, so section 13's *injection* is still blocked, but `processFrame` does
not check it. Three hold flags now, never to be collapsed.

### 4.2 The pacing, measured

Reported as "really inconsistent and slow". Measured before deciding — live
2026-08-04, course 453453, seven fully proven cards, a flat **2494–2505 ms per
card**:

| term | ms | |
|---|---|---|
| reveal beat | 420 | deliberate |
| advance beat | 395 | deliberate |
| resume + `settleMs` | 410 | **dead** |
| Chessable (our move + its reply) | 551 | irreducible |
| waiting for the 500 ms poll to notice the new card | 718 | **dead** |

1128 ms of every 2499 was our own waiting. Three fixes, all still load-bearing:

* **serve off the plan read, not the next tick** (`serveCard`, called from
  `applyPlan` too — `refreshPlan` is async, so the tick that starts a read cannot
  use its answer);
* **chase the plan** while an act is outstanding (`startChase`). The interval
  ADAPTS to what a read costs on the device — never asking again inside twice the
  last read, floored at `chaseMs` (110) and capped at `chaseMaxIntervalMs` — and
  the chase must *serve* before it stops, since the plan now regularly lands
  while our board is in `'shown'`, where `applyPlan` cannot serve;
* **do not pause a clock auto-play is about to hand straight back**
  (`willAutoPlay()`). The clock protects *thinking* time, and auto-play does not
  think.

Beats then trimmed 420/380 → 260/240, and re-measured on the same variation:
**657–876 ms per card**, no pause/resume at all, 100 % accuracy. Manual play got
the chase too: 1320 ms → 770 ms from grade to next card. Both beats are user
settings (`cloShowGradePace`) — the measurement says what is *wasted*, not what
is comfortable.

**Overlapped one card deep** (v0.75.0): on the auto path the press goes out at
the **reveal**, so Chessable's ~350 ms runs under a beat we were showing anyway.
Exactly as safe — `reveal()` only runs with `cardReady()` true, and the verdict
is "correct" by construction. **The manual path keeps its press at the grade, and
must.** One card is all the depth worth having: a buffer is safe for auto-play's
verdicts and never for the user's, which is why there is no queue of verdicts, no
sync barrier and no rewind policy.

*Rejected: handing the replay to section 13.* It is what is shaky on mobile, so
adopting it adopts the problem; it would put two writers on Chessable's board
with a handoff; and it would cost the blindfold seam its clock for the whole
prefix. There is a structural reason too — section 13 is **observation-driven**
(board mutation → rAF → decide, over a DOM that can hold stale duplicate pieces
after a rollback) while this is **plan-driven**, taking its moves from data in
memory and never needing to see a frame.

**The prefix is decided when the plan first lands**, because both inputs are
already in memory and asking card by card made the first card of every variation
wait on a read it could have had. It is **not decided once**: `cardIsProven`
re-walks at any card the standing answer does not reach (at most once per card,
`sg.prefixAt`), because the record also gains the *previous* variation's answers,
the last of which is committed by section 13's own 500 ms poll — a different
timer from this read, and a proof landing on the wrong side of that race was
invisible for a whole variation. The re-walk can only ever EXTEND; `handedOver`
is what enforces the opening-run rule.

### 4.3 The settle floor — reported from a phone

**"Auto-play doesn't work at all — not a single move is auto-played."** Then:
switching the pace to *Relaxed* made it work. That second sentence is the whole
diagnosis, because Relaxed (700 ms) is the one pace whose `reveal` beat clears
~450 ms on its own — section 13's measured figure for how long one animated
trainer move owns the board.

1. Card 0 of a variation. The trainer has just set the board up and auto-played
   its own opening plies; the plan reports the card as current *while the board
   is still animating* (it swaps ~90 ms before a move animates).
2. The chase serves the card at once, and `reveal` ms later auto-play presses.
3. A press landing inside Chessable's animation is **swallowed**. This mode
   deliberately verifies nothing afterwards: a refused move leaves the position
   exactly as it was, so a board diff cannot tell a swallowed press from a wrong
   answer.
4. The trainer never moves on, our board is a card ahead, and the user presses a
   key to get things going — which under `handedOver` costs auto-play the rest of
   the variation. One swallowed press per variation is "not a single move".

It was v0.74.0's doing and invisible in the change that caused it: dropping the
pause (rightly — 410 ms of measured dead time) dropped an accidental 400 ms floor
with it. `pressFloorMs` (550) puts it back explicitly, in `pressCourseMove` so
the manual path gets it too, and *after* `resumeAndSettle` — the two answer
different questions (is the board live at all, versus has it stopped moving).

**Three rules, copied from section 13 rather than invented** (v0.78.0 shipped
this as a LOOP waiting for the board to go quiet, and that was strictly worse
than the bug: a quiet-loop never finishes on a live board, since the per-move
clock's bar and React reconciling the subtree re-arm it indefinitely. Every press
then paid the full cap, later presses were swallowed by `'acting'`, and cards
began recording `timeUp`, which grades them **wrong**):

1. **One delay, computed once**, never a loop. At most `pressFloorMs`; 0 disables.
2. **The last observed MOVE** (`autoPlayBoardQuietMs`), never a mutation. A
   mutation is any render; a move is a move. `Infinity` means "no reason to wait".
3. **The first press of a variation only** (`sg.actedOnce`) — section 13's own
   condition, and the only place the race is. Mid-variation our press follows the
   opponent's reply and chess gives the trainer no second move to race us with.

### 4.4 Hand-over means "the user answered a card themselves"

That is the definition the code implements, and getting it wrong is what made the
feature appear to need "at least one extra variation before auto-play kicks in".
Every case below is a press that did not meet the definition and was counted as
one anyway; they compound, since any single one ends the replay for the rest of
the variation.

* **A press with no card to show costs nothing.** Between a variation change and
  the first card being served, `cardPly()` is null — a few hundred ms on a
  desktop, most of a second on a phone, at the start of every variation, which is
  exactly where a steady presser is pressing. Same guard for `reveal()` REFUSING:
  it puts itself back in `'think'`, and the hand-over is RESTORED rather than
  cleared, since an earlier card may have handed over for real.
* **`next` on a card auto-play would take is "get on with it", not "I'll take
  over".** Asked as `willAutoPlay()` — the condition `maybeAutoPlay` itself acts
  on — so it agrees by construction rather than by winning a race. (v0.81.0 asked
  whether the reveal TIMER was pending, which is the same question only on a
  machine that has already *served* the card, and serving is what runs late on a
  phone.)
* **`next` during auto-play's ADVANCE BEAT is agreement too.** That window is
  240 ms on the fast pace and 620 ms on the relaxed one, plus up to
  `pressFloorMs` on card 0 — squarely inside the rhythm of someone pressing a
  ring steadily, not "shorter than a human reaction".
* **`wrong` is always a hand-over** and must be: it contradicts the very proof
  the card was picked on.
* **The decision belongs to the GRADE press** where the reveal cannot make it —
  our board may legitimately be a card AHEAD, and there `willAutoPlay()` cannot
  tell agreement from override because `cardReady()` is false either way.
* **Auto-repeat is not a press** (`e.repeat`). Swallowed like any of our keys,
  never acted on.

`noteHandover()` prints one line per variation naming the press that ended a
replay; `noteAutoSkip()` names why a card was passed on. Both exist because the
complaint comes from a device nobody debugging it can hold.

### 4.5 Proofs are ASSERTED here, not observed

Section 13 learns a proof by WATCHING, and on a phone that chain has three ways
to break inside the same half second — the mutation → rAF → `processFrame` hop
can arrive after the reply has *also* landed, a mid-animation snapshot is
unreadable, and the confirming reply has to be observed as its own frame. Losing
the answer is invisible until the next variation.

Under this mode none of that uncertainty exists: the move played is the COURSE'S
OWN, taken from the plan, pressed by us, from a position the plan states exactly.
So section 23 asserts it through `autoPlayNoteProvenMove(fen, uci)` — the same
merge, key and veto as `confirmPendingRecord`, differing only in where the fact
comes from.

`sg.proof` is armed in `pressCourseMove` (so both the manual "I knew it" and
auto-play's press arm it, and `gradeUnknown`, which never goes through there,
cannot) and committed **only on the trainer's own evidence that the card was
taken** — its fen moved off the position we answered, or the variation completed.
A press can be swallowed whole and this mode verifies nothing afterwards, so
every other exit (`failAct`, the watchdog, a variation change, `stop`) DROPS it.
It also gives the last card of a variation a proof directly, the one answer no
opponent reply ever confirms.

Section 13 got the matching repair (`findMovePair`): a frame arriving a whole
reply late now has BOTH plies applied instead of re-anchoring. Exactly one pair
of legal moves must produce the placement; any ambiguity falls through.

### 4.6 Key Moves: v0.112.0 is a no-op, and the story around it was wrong

Recorded because the claim is plausible and will be made again. It was believed
that under Study: Key Moves the pre-key user plies sat in `computePrefix`'s walk
unproven and stopped it dead, switching this mode's auto-play off for the whole
session. **They do not.** Chessable clears `isUserMove` on the whole non-key
prefix itself, including plies of the user's own colour, and `pagestate.js` takes
that flag straight off the plan — so the walk never sees them, and `start = 0`
and `start = sg.firstCard` produce the identical walk. Ground-truthed live
2026-08-19; the readings are in `DESIGN-key-move-leadin.md` §2.

What was kept, and why: `cardIsProven`'s `sg.cardIdx < sg.firstCard` guard is a
real, separate protection — a trainer standing on a card BEFORE its own first one
(a repetition walking backwards) gets no auto-play rather than a free pass.
`dev/check-prefix-walk.js` executes both functions against the plan shape
Chessable actually serves; its control run against the pre-v0.112.0 source fails
on exactly those guard cases and passes every walk case, which is the finding
demonstrated rather than argued.

---

## 5. The board

**It wears Chessable's own.** Our board covers theirs for a whole session, so a
palette of our own reads as "something has taken over the page" — the opposite of
the continuation quiz, whose colours are deliberately ours because *this is a
different board* is the message there. Hence `.clo-sg-board--themed`, never a
change to the shared `.clo-cr-sq--light/--dark`.

Ground truth (2026-08-05): every `.square-55d63` computes to a **transparent**
background. The checkers are a themed background **image** on an ancestor two
levels up, `background-size: cover`. So there is no square colour to read, and
`boardThemeEl()` walks ancestors rather than matching a selector — a selector
would only ever work for one theme. `100% 100%` rather than `cover` so our 8×8
maps exactly onto the image's, and `positionBoard` measures the *theme* element
(inset a couple of px inside the board container by their border) so our grid
lines up with the checkers being borrowed.

**The amber ring stays** — 4 px plus a 1 px dark edge. It is what says this board
takes no input, in the same place as the drill and the line quiz, which do. At
2 px it sat on a busy green border and read as part of the board. Colour is
carrying meaning here, so it is thicker rather than a new colour.

**The arrow is a "your turn to grade" marker**, not a description of the move —
the move is played on this board and its two squares are tinted, so as a
statement of *which* move it was it is the same fact a third time. It is
therefore **suppressed during auto-play** (`sg.autoGrading`, set before `reveal`
so the first paint knows), where the card grades itself a beat later and there is
no decision to point at.

Its colour is **green, by passing no colour argument at all**. It was to be the
ring's amber; `paintShape` was silently dropping the resolved custom property, so
from v0.77.0 to v0.80.0 it rendered green regardless — and when the fix finally
made it amber, the verdict was immediate: amber blends into the board, the very
complaint green was supposed to have. Three releases of unwitting field testing
beat the argument. (`paintShape` now takes a colour KEY or a CSS VALUE; the
silent drop had also been rendering §7's alternative arrows green.)

**No flicker at a variation change.** `applyPlan` nulls `sg.pos`, and
`setBoardVisible(Boolean(sg.pos))` hides both overlays until `anchor()` has
filled it in — one condition, not a flag to keep in step. The overlays are
**hidden, not torn down** (a removed board has to be rebuilt, pieces and all,
which is a second flicker on top of the one this removes) and they are **born
hidden** in `buildBoard()`.

**Chessable's per-move clock is hidden** while the mode runs (`applyTimerBar`).
It flickers as the clock is paused and resumed around each card, and it cannot
say anything the user can act on, since running out of time is exactly what the
pausing makes impossible. **`visibility`, never `display`:** the bar is inside
the board footer, so taking it out of flow moves everything anchored below the
widget. Re-applied every tick (a React re-render drops our inline style) and
restored in `stop()`.

---

## 6. Queueing the `next` key

A `next` press the mode cannot act on **yet** is remembered and spent the moment
it can be. Tap four times and the line goes four moves on.

**It fixes a real drop, not a rhythm.** After every grade there is a window of
roughly 950 ms in which every press was thrown away: `settleMs` (400) on the way
out of the pause, then Chessable's own ~550 ms to take the move and reply. For
that whole time the phase is `'acting'` and then `'think'` with `cardReady()`
still false. Someone tapping steadily at 200–250 ms lost about **four presses per
card**, which is most of what "it doesn't respond" feels like.

Both queue points are **inside `doNext`**, the one body a live press and a queued
press share — `'acting'`, and `'shown'` with `!cardReady()`, which follows every
single grade. The `'think'`-with-no-card window queues too.

Four rules:

* **Only `next` is ever queued.** `wrong` is a verdict on the card *on screen*,
  and applied to a later card it would fail a move the user never saw. It also
  CLEARS the queue: someone saying "I didn't know this one" has stopped blasting.
* **A queued press can never ask for the next variation.** `queueActionable`
  omits the browse state, and the queue is dropped there and at a variation
  change. So a tap can never answer a line the user had not seen.
* **It expires** (`queueTtlMs`, 3 s) and is dropped by `failAct`, the watchdog
  and `stop()`.
* **It drains one at a time, never inside `advanceMs()` of the last.** Two spent
  in one pass would show your move and the opponent's reply in the same frame,
  and a move shown for no time is not shown.

`pumpQueue` is called from `applyPlan` (the chase reads every ~110 ms, so a press
waiting on `cardReady()` is spent within a beat) and from `tick`, **above** the
`'think'` gate so it covers `'shown'`. The panel says what is owed (`· 3
queued`): without it a tap remembered and a tap dropped look identical.

### The ring's hardware, and the rule it settles

v0.100.0 was first built as **hold `next` to play through the variation**. It
worked — confirmed live — and was then abandoned on a hardware finding that is
the part worth keeping:

> **The Bluetooth ring this mode exists for sends one event per tap, on RELEASE,
> never while held, and never faster than ~200 ms apart.**

So there is no key-down state to observe at all: a long press is *swallowed by
the ring* rather than merely undetectable, and every hold-shaped gesture —
including a long-press fallback — is unbuildable on the one device that matters.

**Do not reach for `e.repeat` again.** The rule that a repeat is never a press
stands unqualified, and the one design that had an argument for bending it has
been withdrawn for reasons unrelated to that argument. Also rejected: a
double-tap latch on `next` (the reveal→grade rhythm and the deliberate trigger
are the same gesture) and `1` as a play-through toggle (`1` is the TTS "say that
again" key, which is what a blindfold ring user reaches for).

### A `ReferenceError` shipped on every reveal, and what it earns

`isNext` was a local `const` in `onKey`; lifting the think/shown body out into
`doNext` left the auto-play exemption still reading it, so **every `next` press
at the think stage threw** before it could reveal. Three standing lessons:

* **`node --check` cannot see it.** A free identifier is a runtime error.
* **A transcription-based simulation cannot see it either** — it re-writes the
  logic rather than executing the file, so 24 assertions passed against code that
  was never run. Simulations prove the *design*; they say nothing about the
  *source*.
* **A throwing key handler is SILENT** — no status, no board change, nothing but
  "it stopped working". `onKey` is now wrapped in the same one-line-per-message
  try/catch `tick` has.

**The rule: an EXTRACTION in this file is not shippable on static checks alone.**
Moving a body into a new function is the refactor most likely to strand an
identifier; re-read the moved body for names that were locals of the old scope,
then verify live.

---

## 7. "Was my move also right?" — the alternatives key

The move shown is not always the move you had in mind, and the course often
accepts both. `3` — **or the space bar** — pressed once the move is on screen
draws every accepted alternative and names it. It is **not** wrong-move
injection: the set is *read*, and the move the grade presses is still the
course's own.

### Where they actually live (ground truth, 2026-08-05)

v0.79.0 assumed the accepted set was in page state, on the reasoning that
MoveTrainer2 accepts an alternative with no network request so it must already
know them. The reasoning was fine and the conclusion was wrong — it reported "no
alternatives" on a variation with seven.

| source | carries alternatives? |
| --- | --- |
| `ctx.lessonPlan` (what pagestate.js reads) | **no alt field of any kind** |
| `ctx.lessonData.moves` | **no alt field of any kind** |
| `/api/v1/getLesson` (what the plan is built *from*) | **yes** — `alt_black: "[\"d5\"]"` |
| edit page `allTheMoves` | yes — already parsed |

So the trainer *strips* them building its plan, and it is a fetch or nothing.
`getLesson?uid&oid&bid` returns `lesson.moves[]`, **one entry per full move**
keyed by `mid`, with `move_white`/`move_black` and `alt_white`/`alt_black`. Our
plies carry `mid` and `color`, so the join (`altKeyOf`) is exact and never
matches on SAN. **The alt value is a JSON-encoded STRING**, `null` for none — not
an array, which is why a correct field name alone would still have read as empty.

One fetch per variation, started when the plan lands so the key is instant, and
cached per oid. Fails soft everywhere; "could not read them" stays a different
sentence from "there are none".

**The setting is part of the answer.** `simpleSettingsApiData` holds
`eq_<bid>_<white|black>_alternative`, and on the test course it was `"0"` for the
colour being studied. With it off, Chessable never ships the accepted set to the
trainer at all — which is both why the plan is empty and why one of the user's
*own added* alternatives would still be marked wrong in review. So the wording
carries two measured facts and no claim about what the trainer would do:
**"Also accepted: d5"** when on, **"Course lists: d5 (alternatives are off for
this course)"** when off.

### Rules

* **After the reveal, never before.** At the think stage a set of arrows over the
  accepted moves is the quiz handed over.
* **It grades nothing, and does not clear a verdict already given.** Clearing
  `markedUnknown` would make the very next `next` press — which after a
  think-stage "wrong" means only *advance* — silently grade the card correct. A
  false proof is worse than the wrinkle it fixes, and the natural order asks
  first anyway.
* **Blue arrows.** Not green (what the main arrow stopped being), not amber
  (which means "waiting for you to grade").
* **The SAN list is not decoration.** The arrows are drawn on the board as it
  stands *after* the course move, so where an alternative moves the same piece
  (Nf3 against Ne2) its source square is now empty. The list is what reads then —
  and it is the whole output under `showBoard: false`.
* **An unresolvable SAN is still listed.** "Chessable says Bc4, we cannot draw
  it" beats silence.

Move numbers and eval glyphs are stripped for the resolve and kept for the
display — §21's `getList` carries numbers, the edit page's arrays do not, and one
regex covers both.

---

## 8. Mistake repetitions have no reply

Chessable's own re-ask takes you back to a move you failed once the variation is
finished, and asks for **that move on its own**. Nothing follows it, so the reply
our board played after the corrected mistake was a move the trainer would never
make — followed by the board jumping to wherever it actually went.

**It is asked of our own board, not of the lesson plan.** `sg.reached` is the
high-water mark of `sg.cursor` for the variation; the reply to card *i* is ply
*i+1*, so it has been shown iff the cursor ever reached *i+2*:

```js
const isRepeat = () => sg.cardIdx >= 0 && sg.reached > sg.cardIdx + 1;
```

That is a **direct observation of the trainer having gone back**, chosen over
`progress.isQuizCurrentlyInRetry` because that is a name we would be guessing at,
it is not copied out by `pagestate.js`, and confirming what it means needs the
same live session that would confirm this does. It is also right under *either*
shape the repetition's plan might take, and costs nothing in the MAIN world.

`unwalkCard()` is the one thing that lowers the mark, and it is needed: on the
manual path `advanceAfterGrade` runs on the **press**, ahead of the act, so an
act that did not land leaves a reply shown and counted for a card the trainer
will ask again — which would read as a repetition and withhold the real reply.

**Known false positive, accepted:** a position repeating inside a variation
anchors on its FIRST occurrence (`findIndex`, section 17's own hazard). The card
is mis-anchored there whatever this returns.

**It stays a two-press card.** The second press keeps its other job — the
verdict, given *after* the move has been seen, which matters more on a move
already failed once than anywhere else. So the rule *every press shows a move* is
bent here, deliberately, and the wording carries the difference:

| where | ordinary card | repetition |
| --- | --- | --- |
| think prompt | `Your move` | `Your move — repeat` |
| shown, marked unknown | `2 — the opponent's reply (marked as not known)` | `2 — on to the next card (marked as not known)` |
| after the grade | `Opponent played <san>` | `Repeat — no reply follows` |

`sg.cardIdx` goes to `-1` on a repeat so `anchor()` can re-derive — including
when the answer is that very card again, which its "already here" short-circuit
would otherwise refuse.

---

## 9. The other three hosts

`inSession()` is `isTrainerPath()`: both routes render identical MoveTrainer2
markup, and the old `/practice/`-only rule was about where *grading* means
something — a retry pass is precisely a case where the interaction is wanted and
the grading deliberately changes nothing.

**The retry pass (section 17), `/learn/`** — two real conflicts:

* **Auto-play must not replay the move being retried.** That move is very often
  ALSO proven — the user answered it correctly later in the session, which is why
  it is in the record at all. Section 17 marks those positions through
  `autoPlaySetHold`; `cardIsProven()` asks through `autoPlayIsHeld(fen)`, keyed
  placement + side like `holdKeys`.
* **The browse-state advance must not fight the runner.** It has a queue and
  navigates itself, so `advance()` refuses while `retryRunActive()` and says why.

A consequence rather than a conflict: this mode holds section 13 off for its
whole duration, so in a retry pass the run-up is replayed by **our** auto-play,
which lands in the same place since our hold check is the pass's own hold list.

**The drill (section 20)** — our own board, nothing sent to Chessable, nothing
rescheduled, no timer and no card to keep in step with. So it is the two keys and
nothing else, in the continuation module's existing capture-phase listener.
`finishDrillCard(cleanOverride)` takes the verdict as **authoritative**: nothing
was missed or hinted, the move was simply shown, so the user saying they knew it
is the only evidence there is. Gated on `showGradeEnabled()` — the preference,
not a running session — and **additive**: the board still takes a played move, so
the keys are a second way to answer rather than a mode to be in.

**The clickable-line quiz (section 18)** — the same listener and the same two
presses (`showGradeKey` serves both hosts). The two differ in exactly one thing,
and it is structural: a **drill card ENDS** on the move asked for, so its verdict
is followed by `nextLine()`; a **clickable line CARRIES ON**, so its verdict is
followed by `step()`, which plays the opponent's reply and stops at the next move
asked for. That reply is the second press's own move to look at.

A clickable line reschedules nothing, so the verdict has only THIS RUN to act on:
a line holding a move the user did not know is pushed back onto `cr.queue`, i.e.
comes round again at the end. **Once per line** (`cr.sgAgain`) — a repeat that
can re-queue itself is a run with no end. The ALTERNATIVES key is deliberately
**not** bound there: the accepted set is already on the ply and named in the
prompt, so a press to ask a question already answered on screen is the wasted
press §2 removed. Not while `cr.browse`, and a hand-played line is never
re-queued: playing the move correctly IS knowing it.

---

## 10. Keys

`CONFIG.showGrade.keys` is a set of ARRAYS, so a second spelling of the same
intention is one entry rather than a code change:

```
next:   ['2'],       // → ['2', 'MediaTrackNext']
wrong:  ['4'],       // → ['4', 'MediaTrackPrevious']
alts:   ['3', ' '],  // the ring's fourth button sends a space
repeat: ['1'],       // "say that again" — only ours while the audio is on
```

Matched on `e.key`, swallowed on `document` in **capture** phase while the mode
is active — section 18's discipline, and for its reason: MoveTrainer2 binds
single-key shortcuts on `document` and does not skip focused controls. **Only the
keys we are going to ACT on are swallowed**; everything else still reaches the
trainer, and a press inside an `input`/`textarea`/contenteditable is ignored.

Space is safe to take only because of where these listeners are — capture phase,
`preventDefault` + `stopPropagation` on all three event types — so it cannot
scroll the page, re-fire a focused button or reach MoveTrainer2's shortcuts while
the mode runs; outside the mode it is not bound at all.

`keyName` maps a binding to a READABLE name. `KeyboardEvent.key` is the right
thing to match on and the wrong thing to print: a space's name is invisible,
which in a panel whose whole job is to say which key does what is the message
lost.

**The `next` key also STARTS the mode.** A ring has four buttons and no way to
press one on a web page, so needing a mouse click to *begin* was the one gap in
"a whole session without letting go". Gated on exactly what the button is gated
on, swallowed only when it is going to act, and the press is spent on starting —
it does **not** also reveal the first card.

**SPACE also takes the heads-up's "Review now", and the two DO overlap.** Section
18b's panel is clocked on the TRAINER's position, and the trainer does not move
until the card is graded, so a panel raised at the card's own position is still
standing through the reveal. Resolved by priority: inside `'shown'` (and not
`autoGrading`) the press means **alternatives**; everywhere else `onKey` hands it
to `continuationReviewNow`, which takes the offer if a panel is up and answers
false otherwise. The continuation module's own space listener STANDS DOWN on
`showGradeActive()`, and that is load-bearing rather than tidy: `start()` runs
`initContinuationReview` BEFORE `initShowGrade`, so as the earlier capture-phase
listener it would otherwise swallow space before this mode ever saw it.

**Media keys are still unresolved.** On most platforms they never reach a page as
key events — the OS routes them to the media session, which a page can only claim
by playing audio. Until a real ring is captured, only the digits are bound.

---

## 11. The timer

Per-card cycle: opponent's move lands → `maintainPause()` → user thinks and
reveals → user grades → `resumeAndSettle()` → act → trainer replies → pause again.

`maintainPause()` retries once per tick rather than giving up on one press,
because Chessable empties the board footer in the transition states between
quizzes — section 18b's lesson, and the pause control is exactly what is missing
there.

`stop()` **fails open, timer first**: a session left paused with our board down
is the worst thing this mode can leave behind, and every other step is cosmetic
beside it. It runs from the toggle, from the preference being turned off, from
leaving the trainer path, from another board opening, and from `pagehide`.

---

## 12. Audio and blindfold (section 23b)

`announce(text)` was the single place every user-visible statement passed
through, put there before there was anything to speak — and this is the update
that cashed it in. **The driver did not move**: `announce` gained two arguments
(`speech`, `isMove`) and everything else is new code beside it.

**Three settings, all `storage.local`, all opt-IN, deliberately independent**:
`cloShowGradeAudio` (the moves are read out), `cloShowGradeBlindfold` (the pieces
come off our board), `cloShowGradeRate`. The `storage.onChanged` listener never
writes back (`applyBlindfold` is the write-free half of `setBlindfold`): Chrome
fires that listener for a write of an *unchanged* value too, so two open trainer
tabs would ping-pong for ever.

### Blindfold hides the PIECES, not the board

The obvious reading — "do not draw our board" — is exactly wrong: **our board is
what covers Chessable's**, so not drawing it leaves their position on screen,
i.e. blindfold practice with the answer in front of you. `reconcile()` is the one
place the setting changes anything; the board, its theme, its ring, the panel,
the last-move tint and the arrows all stay. Those say *which move was just
played*, which the mode announces in words anyway. It is the POSITION that is
hidden — which is also why there is no coupling to the audio in either direction.

`announceRunUp()` — once per variation — is blindfold's one extra statement and
not a nicety: a variation usually starts several plies in, those plies are played
by the *trainer*, and nothing announces them, so a blindfold player would have no
position at all. Suppressed when the pieces are shown, and honest about a
variation that does not start from the initial position (*"From a set position"*
— reading a placement out square by square is a bigger feature).

### The engine, measured (2026-08-09, Windows Chrome, six local SAPI voices)

Web Speech API (`speechSynthesis`), never `chrome.tts` — that wants a manifest
permission, and this extension does not add those without asking.

| Measured | Consequence in the code |
|---|---|
| `getVoices()` returns **0** on the first synchronous call, 6 after ~600 ms | `pickVoice()` is lazy and caches only a non-empty answer; one resolved at init would be null for the session |
| ~200 ms `speak()` → `onstart` warm, ~580–670 ms cold | the audio trails the board by up to half a second and nothing can fix that |
| a move phrase is ~1.7 s at rate 1 | the rate is a user setting, and `afterBeat` exists |
| `cancel()` drops the queue **silently** and lets an immediately following `speak()` start normally | one-step "interrupt and say this instead" |

**A move interrupts; everything else queues.** A replay faster than speech must
not build an unbounded backlog.

**`afterBeat` holds auto-play's beats open while a sentence is still running.**
Without it the audio is useless in exactly the place it matters most: at the fast
pace the beats are 260 and 240 ms against a phrase of over a second, and since
moves interrupt you would hear one syllable of each. It only ever *lengthens* a
beat, only while the audio is on, capped at `speechWaitMs` so a stuck engine
costs one beat rather than the replay — and it keeps `sg.autoTimer` set
throughout, because that flag is what tells `onKey` and `tick` that auto-play has
claimed the card.

### The voice says less than the panel

`announce` speaks **nothing without an explicit `speech` argument**. There is no
fallback to the written text, and that inversion is the design.

| Statement | Panel | Voice |
|---|---|---|
| `Your move` / `Your move — repeat` | yes | **no** — the board has stopped, the arrow is up, the prompt is right there |
| your move revealed | `e6` | *"E6"* |
| the opponent's reply | `Opponent played Bc4` | *"Bishop C4"* — the prefix is two words the press itself already said |
| a repetition's second press | `Repeat — no reply follows` | *"No reply — next card"*: the one press that shows no move, so silence would read as a dead key |
| the variation ending | row status, with a count | *"Variation completed"* / *"…with mistakes"* |
| the alternatives key | the list | the list, and both failure lines — the user pressed a key to ask |

A new announce is silent until someone decides it is worth hearing.

**The verdict is Chessable's own count**, not a tally of ours
(`progress.quizIncorrectAttempts` / `quizIncorrectTotal` per ply), so it includes
a `timeUp`, a move failed before the mode was started, and Chessable's own
repetitions — none of which a flag set in `gradeUnknown` would know about. It may
only be said **off a fresh plan read** (`announceCompletion` is called from
`applyPlan`, below the newVariation return so it can never describe the *next*
variation's plan): the final card's failure reaches the record *after* the read
taken while it was still being answered. It also writes the row's status line,
since the browse branch has already taken both overlays down. A run ending in
"Time's up" renders no `practiceProgress` block, so there is no verdict.

### `sanSpeech`

SAN is written for the eye and every part of it is a trap for a voice, so it is
parsed rather than patched: `Nxf7+` → *"Knight takes F7, check"*, `O-O-O` →
*"castles long"*, `Nbd2` → *"Knight from B to D2"* (the "to" only when
disambiguated), `exd8=Q` → *"Pawn E takes D8, promotes to Queen"*, named as a
pawn so the sentence does not open on a single letter. Squares are **one
uppercase token** ("F3"): a lone lower-case file letter is the one thing an
engine reliably mispronounces ("a" as the article).

Pure, and spot-checked over 28 cases against the real source — but
**pronunciation is the one thing no measurement here can check.** It needs an
ear, and anything that reads wrong is a change to that one function.

**`1` re-reads the last MOVE** (`sg.lastMoveSpeech`), not the last utterance: the
most recent statement is regularly "Your move" or an alternatives list. Handled
*before* the phase gate in `onKey` — it grades nothing and touches no state, so
it is safe even mid-act — and swallowed only while the audio is on.

### A refused utterance is not a thrown one

`speak()` returns quietly and the failure arrives on the utterance's own
`onerror`, so a `try/catch` around `speak()` catches nothing and the entire
feature can be silent with an empty console.

Ground-truthed 2026-08-09 on chessable.com: in a document driven only by
synthetic clicks, every utterance came back **`not-allowed` at `error@0`**; one
real click anywhere, and the same probe read `start@168`. It is Chrome's autoplay
gate — and **not** a simple per-document activation rule, because a later
document of the same origin spoke with no gesture at all. So: speech *may* be
refused while the page has had no real interaction. Ordinary use never meets it,
since the mode is started by a click or a key press and both are activations;
`noteSpeechError` reports it once per kind because the failure is otherwise
invisible. `canceled`/`interrupted` are our own doing and never reported.

**Fails soft everywhere:** `sg.speechDead` stands the audio down for the page
after one throw; `stop()` and `pagehide` cancel (speech outlives a page unload
otherwise); a browser with no engine says so in the status line; a SAN that will
not parse is spoken as it stands rather than dropped.

---

## 13. Architecture

**It is NOT a `cr.mode`.** The continuation module's `startLine`/`step`/`tryMove`
walk a stored line; this follows the live trainer, so sharing that driver would
have meant bending it rather than reusing it. The board reuses section 11c's
primitives, which is what they were hoisted to top level for, plus the
continuation board's CSS wholesale — with two deliberate differences:
`pointer-events: none` (a board that could also be clicked would be a second,
undocumented way to answer a card) and the amber ring.

**The position is the trainer's own `ctx.fen`** through `readLessonLine()` —
section 18b's rule, for section 18b's reason (the board DOM can hold a stale
duplicate piece after a rolled-back wrong answer). Exact, so castling and en
passant need none of `readReviewFen`'s heuristics.

**Playing the correct move is auto-play's recipe**, plus
`autoPlayNoteTypedMove(from, to)` so the tracker files it as a human answer —
without which the move is never remembered as proven and a refused one gets no
alt check. Promotions are refused with a sentence (Chessable's picker markup is
unverified; auto-play and section 22 refuse them for the same reason).

| Function | Does |
|---|---|
| `computePrefix` / `plyIsProven` / `cardIsProven` | how far auto-play may replay, off each ply's own `sourceFen` rather than the live board — so a promotion *ends* the prefix instead of being refused at the last moment. See §4.2 for the re-walk. |
| `enterActing` / `markActed` | `markActed` was split OUT so the auto path's early press does not change the phase — `'shown'` is *the move being looked at*. `sg.pressed`/`sg.pressing` stop a key press opening a SECOND act on a card already answered; `failAct` forces `'think'`, since an early press fails from `'shown'`, which nothing else moves on. |
| `serveCard` / `chaseStep` / `finishAutoCard` | the per-card work, called from `applyPlan` as well as `tick`. `chaseStep` must *serve* before it stops. |
| `sg.plies` / `sg.cursor` / `sg.cardIdx` / `sg.reached` | our board's own walk of the plan. `sg.awaitingSince` is the watchdog stamp behind `actMaxMs`. |
| `C.paces` / `C.anims` and their lookups | every read goes through a lookup with a fallback, never raw: a value from an older build must degrade to the default rather than put `undefined` into a `setTimeout`. |

**Interaction with the rest of the file:**

| Feature | What happens |
|---|---|
| Auto-play (13) | Held via `autoPlayShowGradeHold` (`ap.sgHeld`) for the duration — §4.1. |
| Type a move (22) | Stands down on `showGradeActive()`. |
| Continuation / drill / analysis (18–20) | Their `continuationActive()` stops this mode. |
| Mistake log (16) | Picks up `"giveUp"` on its own cadence; renders "not known". |
| The key-move lead-in (23c) | Runs on this board and this panel; see its own document. |

**The trainer row** (`.clo-sg`): `order: 2`, beside section 22's move field —
both act on the card being answered. Green **outline** idle; `.clo-rowprimary`
while running, when it reads "Stop", because a mode that owns the session must
not make its exit a hunt. A fourth collapsed-mid-quiz exception in the
established idiom, `.clo-review--collapsed .clo-sg:has(> .clo-rowprimary)`,
reading the module's own state rather than a new flag, at (0,4,0) — strictly
narrower than the rule it bends. Beside it the **Auto** toggle, neutral outline,
shown only while running, carrying its own state in the class and in words in its
tooltip; never a fill, which is reserved for the one thing to do next. Measured
in the harness: browse row 38 px, collapsed-while-running 38 px, +26 px with a
status line; the Auto toggle adds 41 px of width and no height.

**Opt-OUT** (absent = ON; only an explicit `false` is stored as off):
`cloShowGrade`, options-page checkbox, watched through `chrome.storage.onChanged`.
It was opt-IN on the grounds that the mode takes two keys off MoveTrainer2 and
answers real SRS cards — but none of that happens until the row's own button is
pressed, so the preference only decides whether that button is offered.

---

## 14. GROUND TRUTH (live, 2026-08-04)

`/practice/` review session, course 453453, variation "4" (oid 70382663), read
through `readLessonLine()` before and after each action.

**Chessable already has the control this feature needs, and it is one button that
mutates.**

| Press | What happens | `progress` after |
|---|---|---|
| — | live quiz, footer = [Hint `.fa-bell`, Pause timer `.fa-pause`] | all counters 0 |
| Hint | circles the piece to move; the button becomes **"I don't know"** | **unchanged — a hint is free** |
| I don't know | **plays the move**, then parks in a study state | `quizTotal 1`, `quizIncorrectTotal 1`, `quizIncorrectAttempts: ["giveUp"]`, `softFail false` |
| Next | trainer plays its reply and asks the next card | — |

So:

* **`"giveUp"` is a third literal** beside `"timeUp"` and a real SAN. The mistake
  log (section 16) reads `quizIncorrectAttempts` directly, so these failures join
  the session's list with no bridge of our own — the only change needed was
  `wrongLabel`, which would otherwise have rendered "played giveUp".
* **Wrong-move injection is not needed at all.** That was the original plan and
  its one real hazard: a legal wrong move that Chessable happens to *accept*
  grades a failure as a pass. The whole risk is gone.
* The give-up **plays the move itself**, so only "I knew it" presses the board.
* The study state's control is `[data-testid="nextMovesButton"]` and takes a
  plain untrusted `.click()`.

**The timer.** Pausing is a `.click()` on the `.fa-pause` footer button;
`.play-button--board` appears; the pause **survived 5 s of thinking with no
`timeUp` recorded**; resuming needs the full `pressSquare` pointer sequence. The
hint/give-up button **stays rendered and clickable while paused**.

**Two traps, both found by falling into them.**

* **Pressing the board while paused resumes the session and the press is
  CONSUMED.** So every act resumes first, waits `settleMs`, and only then
  presses. This is why `resumeAndSettle()` exists and why nothing may skip it.
* **The per-move clock is shorter than it feels.** Two cards recorded
  `["timeUp"]` during the session and Chessable played the move itself — the
  exact failure the pause exists to prevent, and not a theoretical risk.

**Synthetic keys are state-dependent.** A real `n` keypress advanced the study
state; a synthetic `KeyboardEvent` did not. But in the **browse** state the
synthetic `n` on `document` is what moved the session on (there is no
`nextMovesButton` there, so `advance()` fell through to it). Section 23 therefore
prefers the BUTTON and keeps the key dispatch as a fallback — and section 22's
own `advance()` should be re-tested for the states where a real control exists.

---

## 15. What must never happen

* **A failure graded as a pass.** The give-up path makes this structurally
  impossible — nothing legal-but-wrong is ever played. **No wrong-move injection,
  ever.**
* **The session left paused with our board down.** `stop()` resumes the timer
  first, unconditionally, on every exit path.
* **A card answered without the user grading it.** `acting` is only ever entered
  from a key press (or auto-play, which is the user's own standing consent).
* **Running ahead of Chessable** — §2.
* **A third press per card** — §2.

---

## 16. What is NOT built

* Media-key bindings (§10).
* A third grade ("hard").
* Reading a **placement** out (blindfold on a course that starts mid-game: the
  run-up says "From a set position" instead).
* Speech in the drill and the clickable-line quiz — those are the continuation
  board's own panels, not this mode's `announce`.
* A voice picker. `pickVoice()` takes the first English one it is offered;
  `CONFIG.showGrade.speechLang` is the only lever.

---

## 17. Confirmed working live

* **The core loop** (user-confirmed, v0.70.0): the two-press cycle, the reveal
  with its glide, **the "I knew it" injection path** — the one thing everything
  else rested on — the give-up path, the timer pause, and `giveUpButton()`'s
  find-by-exclusion.
* **Auto-play end to end** (v0.74.0, course 453453): all seven cards of a
  previously-proven variation recognised, revealed, graded and played without a
  press; 100 % accuracy; the console shows the tracker picking each one back up,
  so the record round-trips through a real session. With the extension reloaded
  (which clears `storage.session`), every card correctly declines.
* **The browse-state advance** (v0.74.0) — see §14 on synthetic keys.
* **Audio and blindfold end to end** (v0.89.1): the cog rows and tooltip; `1`
  re-reading the last move (one 1.68 s utterance per press); exactly one
  utterance on the grade press (1455 ms — the bare move, since "Opponent played…"
  measures ~2.2 s); `Your move` speaking nothing; a repetition's panel line
  spoken; the verdict in the panel *and* the row status, counting a `timeUp` from
  before the mode was started (the argument for reading Chessable's record rather
  than a flag of ours, confirmed by accident); blindfold showing 0 pieces over
  their 29, board-for-board; the run-up as one 2.57 s utterance; auto-play + audio
  giving one utterance per replayed move with `afterBeat` holding each beat; and
  `stop()` leaving the session running with the timer bar restored.
* **The press queue** (v0.100.1, user-confirmed from the ring): tapping `next`
  several times in quick succession moves the line on by that many moves.
* **Auto-play in a Key Moves session** (2026-08-19): `4 of 4 card(s) proven this
  session`, then the whole variation replayed unaided to *Completed, 100 %* —
  §4.6.

---

## 18. Still open

* **The hand-back at the first unproven move.** Every card of every variation
  tested so far was proven, so the replay has never had to stop mid-line. Wanted
  with it: that the clock is paused there.
* **The v0.75.0 overlap re-measured.** Traced and syntax-checked, and the theme
  copy was confirmed live, but the per-card cycle was not re-measured after the
  change (expected ~610 ms), nor that a card is still graded exactly once.
* **A retry pass driven from the two keys**, and in particular that auto-play
  stops at the held move rather than playing it. Also how section 17's transition
  shield and our board interact — our presses are dispatched directly on the
  square elements rather than hit-tested through it, so it *should* be
  irrelevant, but that is reasoning.
* **The drill's two keys** — that the first press shows the move and the second
  marks it, and that a card answered `4` really does stay on the list.
* **`pressFloorMs` (550) on the device that reported the bug.** Argued from
  section 13's measured ~450 ms, never measured on a phone; the original report's
  hedge ("Relaxed started working, not sure if 100 %") hints that an animation
  there can outlast even that.
* **The v0.82.0 phone fixes.** None seen in a session; all reasoned from the
  code. The discriminators are already in the console, one line per card:
  `variation taken over at the <press>`, `two plies in one frame — catching up`,
  `recorded <uci> (show and grade played it)`, and `N of M card(s) proven this
  session` on the second variation of a session whose first was answered
  perfectly — it should name the shared prefix.
* **Mistake repetitions (§8) — the whole premise.** `isRepeat()` assumes the
  repetition runs on the SAME lesson plan with the trainer's fen back on the
  failed ply's `sourceFen`. One console line settles it: `repeat of <san> — no
  reply to show`, once per repetition. If it never appears while a repetition is
  on screen, the repetition is not anchoring back onto the same plies, and the
  next thing to read is what `readLessonLine()` returns in that state.
* **The queue's numbers.** `maxQueued` (8) and `queueTtlMs` (3 s) were argued,
  never felt; the TTL has never been *seen* firing. Also unmeasured: that the
  drain is visibly paced at every one of the four paces, and what the ring's
  ~200 ms floor does to the real ceiling on "progress N moves".
* **Two alternatives drawing two arrows** (§7). The test card had one; the
  `mid`+colour join and the 7-on-6 count are both verified. Also the wording with
  the course setting **on**, which no course tested has.
* **A voice that reads `sanSpeech` well.** Needs an ear, not a measurement.
