# DESIGN — Show and grade (section 23)

Status: **working.** The ground truth in §4 was established live on 2026-08-04.
The core loop (§2, §2a) was confirmed by the user in a real review session at
v0.70.0 — including the "I knew it" injection path, which had been the one thing
everything else rested on. Auto-play (§2b) and the no-flicker change (§2c) landed
in v0.71.0 and are **not yet confirmed live**; see §11.

## 1. What it is

An Anki-style *show and grade* mode for `/practice/` review sessions: the user
never makes a move. They watch, think, press a button to reveal the answer, then
press one of two buttons to say whether they knew it. The extension answers
Chessable on their behalf and grades the card accordingly.

The point is **studying with a Bluetooth ring** — two buttons and no board
interaction, so a session can be run with the phone or laptop out of reach. It
is also the groundwork for blindfold training with TTS, which is why §8 exists.

## 2. The loop

For a card where the user plays Black:

**TWO presses per card, and EVERY press shows a move.** That is the governing
rule (v0.70.0); it is what a ring is actually pressing, and a press that
displays nothing is a wasted one.

| Phase | Press | What is SHOWN | What else happens |
|---|---|---|---|
| `think` | `2` | **your move**, played on our board | — |
| `think` | `4` | **your move**, played on our board | the card is remembered as failed |
| `shown` | `2` | **the opponent's reply** | the card is graded — known, or failed if `4` was used above |
| `shown` | `4` | **the opponent's reply** | the card is graded as failed |
| `browse` | `2` | the next variation | — |

So both keys have the same shape: **first press reveals, second press advances.**
`4` at the `think` stage does not cost a press of its own — the card is lost
either way and the user still wants to see the move, so the verdict is
remembered (`sg.markedUnknown`) and applied by the press that advances.

Three things this buys:

* **The move is played, not just pointed at.** The arrow says *which* move; the
  glide says what the position now *looks like*, which is the more useful of the
  two for a mode aimed at blindfold practice. Both, not either.
* **The opponent's reply is never lost.** It is the one move in the cycle the
  user does not choose, and it is now what the grading press displays — so it
  cannot slide past unnoticed, which matters more once the board is off and
  `announce()` is the only channel.
* **The grade is free.** It rides on the press that was going to happen anyway.

`advanceAfterGrade()` runs the moment the key is pressed, NOT when the Chessable
act finishes: the reply comes from the plan, so there is nothing to wait for, and
a press that showed no move until Chessable caught up is exactly the wasted press
this shape removes.

**Simulated over whole variations** (5 cases — user as Black and as White, a
card marked wrong at the think stage, a variation ending on the user's move, and
a line with castling and a capture): exactly two presses per card, no press
showing nothing, and the sequence of moves shown equal to the plan's own move
sequence.

**Our board runs at the user's pace and is deliberately NOT slaved to the
trainer's position.** Between the grade and the reply press the trainer is one or
two plies ahead; that is normal, not a desync. Two rules keep it honest:

* `anchor()` only ever runs from `think`, and never while `awaitingFen` is set
  (the trainer still standing on the card we just answered). Without the first
  rule a re-anchor would undo the move the user asked to see; without the
  second, a user pressing quickly gets dragged *back* onto a card already graded.
* `cardReady()` gates both grades: the trainer must actually be standing on the
  card our board is showing. What our board shows is not evidence about what the
  trainer is asking, and grading the wrong card is the one mistake here that
  costs a real scheduled move.
* `failAct()` is the recovery, and it is needed precisely BECAUSE the board
  advances on the press: an act that then cannot be carried out leaves our board
  a card ahead of Chessable, where `cardReady()` would refuse every later grade
  for the rest of the session — the trainer never moves, so `awaitingFen` would
  never clear on its own. It drops the wait and forces `anchor()` to re-derive
  the card from wherever the trainer actually is.

## 2a. Animation

`.clo-cr-piece` already carries `transition: transform 180ms ease-out` — the
continuation board's, matched to MoveTrainer2's own ~200 ms click-move glide,
i.e. Chessable's fastest. So the board inherits the animation and the only thing
needed was to stop destroying pieces: `playPlyOnBoard()` **moves the existing
element** (the continuation board's `applyMove` pattern) instead of letting
`reconcile()` remove-and-recreate it, which has nothing to transition from and
teleports. `CONFIG.showGrade.animMs` (180) is the delay before the reconcile
that makes the DOM authoritative, so it must never be shorter than the CSS
transition or the glide is cut off mid-flight.

Only the primary piece is glided; castling rooks, en passant and promotions come
out right because the reconcile afterwards is what is actually authoritative —
the same best-effort split the continuation board uses.

**Spot-checked against the real CloSan generator** (25 landings over 6 lines:
the live variation "4" line, both castles, en passant, promotion, rook
disambiguation, a capture chain). Every position our board walks to equals the
plan's own next `sourceFen`, which is what keeps our board and the trainer
describing the same position.

## 2b. Auto-play (v0.71.0, made to actually work in v0.73.0)

**It did not work at all as shipped in v0.71.0, and the cause is worth keeping.**
The mode held section 13 off with `autoPlayHold(true)` — `ap.heldOff` — and
`processFrame` **returns on that flag**. That flag means "an outside feature owns
the board and nothing is really being played on it" (18b's mid-quiz review, a
drill), so for the mode's entire duration the tracker observed nothing: no move
was classified, no `pendingRecord` was set, no proof was ever recorded. Auto-play
then consulted an empty record and could never fire. Nothing about the auto-play
code itself was wrong.

Under show-and-grade the session underneath **is** really being played — we press
its squares, it animates, it replies — so those frames are real moves and reading
them is the entire point. It now uses its own flag, `ap.sgHeld` via
`autoPlayShowGradeHold`, which is ORed into `held()` (so section 13's *injection*
is still blocked throughout) but which `processFrame` does not check. This is the
same reasoning and the same fix as section 17's transition shield, and the
comment sitting directly above `if (ap.heldOff) return;` had already spelled it
out.

Two smaller things the debugging turned up, both fixed:

* `startMode()` did not check `sg.enabled`, so anything reaching the button other
  than a human — the group is `display:none` when the preference is off — started
  a mode that `tick()` stopped on its next pass.
* `tick()`'s three bail conditions all logged **"another board opened"**, which is
  simply wrong for two of them and sends you looking in the wrong module. They
  now name the actual reason.

`noteAutoSkip()` was added for the same reason section 13 keeps `logHandback`: a
silent no-op is indistinguishable from a bug, so auto-play now says once per card
why it passed — "you have taken this variation over", "a retry pass is asking for
this move", "not answered correctly yet this session".

### What it does

Replays the cards the user has already answered correctly **this session**, so a
session gets to the new material instead of re-proving a shared prefix. Its own
toggle on the row (`cloShowGradeAutoPlay`), and section 13's is untouched — that
one is held off for the whole mode anyway, since it drives Chessable's board and
this mode must be the only writer of it.

The record itself stays section 13's; section 23 only asks, through a new
read-only bridge `autoPlayIsProven(fen, uci)`. The key is `posKeyOf`'s
(placement + side + castling) and the FEN handed in is the lesson plan's own
`sourceFen`, which is exact — so this needs none of the tracker's heuristics.
It fills up by itself during a show-and-grade session, because "I knew it"
already calls `autoPlayNoteTypedMove`.

An auto-played card runs the *same two steps a press would*: `reveal()`, a beat
to look at it, then `gradeKnown()`. No second code path for the board or the
grade to drift down.

**WHY IT DOES NOT RUN AHEAD OF CHESSABLE.** The obvious idea is to let our board
replay the line at its own pace and let the real one catch up. It does not work,
and the reason is worth writing down because it will be proposed again: every
card still has to be **graded on Chessable, in order, and only while Chessable is
actually standing on it** (`cardReady`). Running ahead means holding a queue of
ungraded cards, where one failed act mis-files every card behind it — and the
moment the replay reaches an unproven move the user has to wait for Chessable
anyway, so the board would be showing move 12 while the trainer is on move 4 and
the first thing the user does is sit and wait. The gain is nothing; the failure
mode is grading the wrong card. So it advances ONE card at a time, gated on
`cardReady()`, and the cycle's floor is Chessable's own exactly as section 13's
is.

**…but the floor was never what made it slow (v0.74.0).** Reported as "really
inconsistent and slow compared to the regular auto-playing", with "use the
Chessable board for auto-play and transition into our board when it ends"
offered as the way out. Measured before deciding — live 2026-08-04, course
453453, overstudy of 70382663, seven fully proven cards, a flat **2494–2505 ms
per card**:

| term | ms | |
|---|---|---|
| reveal beat | 420 | deliberate |
| advance beat | 395 | deliberate |
| resume + `settleMs` | 410 | **dead** |
| Chessable (our move + its reply) | 551 | irreducible |
| waiting for the 500 ms poll to notice the new card | 718 | **dead** |

1128 ms of every 2499 was our own waiting, so the rearchitecture would have
bought nothing that removing the dead time did not. Three fixes: **serve off the
plan read rather than the next tick** (`serveCard`, called from `applyPlan` too —
`refreshPlan` is async, so the tick that starts a read cannot use its answer);
**chase the plan** while an act is outstanding (`startChase`, every `chaseMs`,
bounded — a plan read is a whole-variation JSON round trip through the MAIN
world); and **do not pause a clock auto-play is about to hand straight back**
(`willAutoPlay()`, plus `resumeAndSettle` waiting only when it actually resumed).
The clock exists to protect *thinking* time, and auto-play does not think.

Beats then trimmed 420/380 → 260/240, on the same evidence: they are now ~60% of
what is left rather than a rounding error on dead time, and both stay clear of
`animMs` (180) so each move is still a visible glide. Re-measured, same
variation: **657–876 ms per card**, no pause/resume at all, 100 % accuracy,
Chessable's own timer for the variation 1 min → 15 sec. Manual play got the
chase too — the same 718 ms of dead time sat between a human's grade and the next
card: 1320 ms → 770 ms from grade to next card.

### …and then overlapped, one card deep (v0.75.0)

The proposal on the table was to hand the replay to **section 13** — let regular
auto-play drive Chessable's board and transition into ours when it hands back.
Refused, on the report itself: section 13 is what is shaky on mobile, so adopting
it adopts the problem. It would also put two writers on Chessable's board with a
handoff (the thing the three hold flags exist to prevent, and which this module
got wrong once already, v0.71 → v0.73), and cost the blindfold seam its clock for
the whole prefix.

There is a structural reason to prefer ours, too. The two replays fail
differently: section 13 is **observation-driven** — board mutation → rAF →
decide, the chain that runs 100–300 ms late on a phone, over a board DOM that can
hold stale duplicate pieces after a rollback — while this one is **plan-driven**,
taking its moves from data already in memory and never needing to see a frame to
know what comes next. One fewer failure mode, and it is the one that bites on
mobile. *Not measured on a phone; the argument is structural.*

What replaced it is a **one-card-deep overlap**:

- **The press goes out at the reveal**, auto path only. Exactly as safe —
  `reveal()` only runs with `cardReady()` true — and in auto-play there is no
  decision between the two moments to lose, the verdict being "correct" by
  construction. Chessable's ~350 ms then runs *under* the beat we were showing
  anyway: `reveal + advance + Chessable` → `reveal + max(advance, Chessable)`.
  The manual path keeps its press at the grade, and must.
- **One card is all the depth worth having.** Our pace and Chessable's are within
  a beat of each other, so a deeper buffer holds verdicts it cannot apply any
  sooner while making a failed act mis-file everything behind it. A buffer is
  safe for *auto-play's* verdicts (known-correct, deterministic prefix) and never
  for the *user's* — that distinction is the whole argument, and it is why there
  is no queue, no sync barrier and no rewind policy.
- **The prefix is decided when the plan first lands**, because both inputs are in
  memory and asking card by card made the first card of every variation wait on a
  read it could have had already, which is the run reported as shakiest. It is
  **no longer decided *once*** (v0.81.0): the justification for never asking
  again was that "the record only ever gains moves we are about to play
  ourselves, never a card still ahead", and that is false — it also gains the
  *previous* variation's answers, the last of which is committed by section 13's
  own 500 ms poll, a different timer from this read. A proof landing on the wrong
  side of that race was invisible for the whole of the next variation, i.e.
  auto-play one variation late. `cardIsProven` re-walks at any card the standing
  answer does not reach, at most once per card; it can only extend the prefix,
  and `handedOver` is what enforces the opening-run rule regardless.
- **The chase adapts** to what a read costs on the device, and must *serve*
  before it stops: the plan now regularly lands while our board is still in
  'shown', where applyPlan cannot serve, and returning without serving hands the
  card back to the 500 ms poll. `chaseInterval` never asks again inside twice
  what the last read actually cost, floored at `chaseMs` (110 ms — right on a
  desktop, and on a phone a fixed interval that short would just queue reads
  behind each other and add to the jank it exists to see through) and capped at
  `chaseMaxIntervalMs`; the chase itself stops at `chaseMaxMs`. A fixed interval
  would just queue reads behind each other on a phone and add to the jank it
  exists to see through.

Expected ≈ 610 ms/card against a ~500 ms floor set by the beats themselves.

### Four follow-ups from using it (v0.76.0)

All four came out of a real session rather than a measurement.

**The arrow is a "your turn to grade" marker** (removed in v0.76.0, restored with
a rule in v0.77.0). Removing it was right about the fact and wrong about the job.
As a statement of *which* move it was, it is the same thing a third time — the
move is played on this board and its two squares are tinted. What it earns its
place doing is marking the moment the board has stopped and is waiting for you.

So it is **suppressed during auto-play**, where the card grades itself a beat
later and there is no decision to point at. The test is `sg.autoGrading` rather
than the phase, because an auto card sits in exactly the same `'shown'` phase a
manual one does; `autoReveal` sets that flag *before* calling `reveal`, so the
first paint already knows.

Its colour was to be the **ring's amber**, read off `--clo-attention`: one
colour, one idea, on the theory that green vanished against Chessable's own
green board image.

**That theory got tested by accident and lost** (v0.80.1). `paintShape` was
silently dropping the resolved custom property, so from v0.77.0 to v0.80.0 the
arrow rendered the stylesheet's green regardless of what the code said. When the
fix finally made it amber, the verdict was immediate: the amber blends into the
board — the very complaint green was supposed to have. So it goes back to green,
by passing no colour argument at all, and three releases of unwitting field
testing beat the argument. **The ring stays amber**: it is not on the board
image, and it is what says this board takes no input.

**A 4px ring plus a 1px dark edge.** At 2px, against the board image it now
wears, amber sat on a busy green border and read as part of the board. Thicker
rather than a new colour, because the colour is carrying meaning: amber is *this
board takes no input*, against the green of the drill and the line quiz, which
do. The dark outer ring is what makes it read as a ring on a light theme too.

**Chessable's per-move clock is hidden** while the mode runs. It flickers — the
clock is paused and resumed around each card — and it cannot say anything the
user can act on, since running out of time is exactly what the pausing makes
impossible. `visibility`, never `display`: the bar lives in the board footer, so
taking it out of flow would move the footer and everything anchored below the
widget. Restored in `stop()`, the one path every exit takes.

**Both speeds are user settings**, behind a cog. `cloShowGradePace` chooses a
`{reveal, advance}` pair, `cloShowGradeAnim` the glide. The measurement said what
was *wasted*, not what is comfortable — "may even be a bit too fast" is an answer
only the person watching can give.

The glide is deliberately **one number driving two things**: the CSS transition
(as `--clo-sg-anim` on the board element, leaving `.clo-cr-piece`'s shared 180 ms
rule alone for the other three boards) and the delay before the DOM is
reconciled, which must never be shorter than the transition or the animation is
cut off mid-flight. And `advanceMs()` is floored at the glide, because the two
settings are independent: a brisk pace with a slow animation would play the reply
while your own move was still sliding, reading as one blurred movement rather
than two moves.

### The settle floor (v0.78.0) — reported from a phone

**"Auto-play doesn't work at all — not a single move is auto-played."** Then, a
minute later: switching the pace to *Relaxed* made it work. That second sentence
is the whole diagnosis, because Relaxed (700 ms) is the one pace whose `reveal`
beat clears ~450 ms on its own — and ~450 ms is section 13's own measured figure
for how long a single animated trainer move owns the board. Its `settle` values
(500/700/900) exist for exactly this and are documented as "keep it above
~450 ms: a lower floor could let an injection land mid-burst".

The mechanism, end to end:

1. Card 0 of a variation. The trainer has just set the board up and auto-played
   its own opening plies; the lesson plan reports the card as current *while the
   board is still animating* (the plan swaps ~90 ms before a move animates).
2. The chase serves the card at once, and `reveal` ms later — 150 / 260 / 420 /
   700 by pace — auto-play presses.
3. A press landing inside Chessable's animation is **swallowed**. This mode
   deliberately verifies nothing afterwards: a refused move leaves the position
   exactly as it was, so a board diff cannot tell a swallowed press from a wrong
   answer.
4. The trainer never moves on, `awaitingFen` never clears, our board is a card
   ahead, and the user presses a key to get things going.
5. `handedOver` — auto-play only ever replays a variation's *opening* run, so
   that one press costs it the rest of the variation.

One swallowed press per variation is therefore literally "not a single move".

**It was v0.74.0's doing, and invisible in the change that caused it.** Auto-play
used to pause the clock like every other card, so `resumeAndSettle` bought every
press 400 ms. Dropping that pause was right — 410 ms of measured dead time — and
dropped the accidental floor with it, leaving `reveal` as the entire wait. A
desktop absorbed the difference; a phone did not.

`settleBoard()` puts the floor back explicitly, in `pressCourseMove` (the one
place this mode writes to the session, so the manual path gets it too) and
*after* `resumeAndSettle`: the two answer different questions — is the board live
at all, versus has it stopped moving.

### …and the first attempt at it was worse than the bug (v0.78.1)

v0.78.0 shipped this floor as a **loop waiting for the board to go quiet**, keyed
on the last board *mutation*. Reported the same evening: "now it actually stopped
working completely, even with relaxed". It had.

A quiet-loop never finishes on a live board. The per-move clock is *running*
during an auto-played card — `maintainPause` skips pausing those deliberately —
so its bar, plus React reconciling the board subtree, re-armed the floor
indefinitely. Every press then paid the full 1500 ms cap on top of the 400 ms
resume; further key presses were swallowed by the `'acting'` phase while it
waited; and that per-move clock is short enough that cards began recording
`timeUp`, which grades them **wrong**. A fix for "the first press of a variation
is swallowed" had turned into "every press is late and some are marked failed".

The correction is to stop inventing and copy section 13, which works on the same
device, on all three counts:

1. **One delay, computed once**, never a loop. At most `pressFloorMs`.
2. **The last observed *move*** (`vs.lastMoveAt`, stamped from the mutation
   itself via `frameTime`), never `ap.mutationAt`. A mutation is any render; a
   move is a move.
3. **The first press of a variation only** (`sg.actedOnce`, reset on the
   variation change) — section 13's own condition, "nothing observed yet this
   variation, or the trainer drove the last user-colour move", and the only
   place the race is. Mid-variation our press follows the opponent's reply,
   chess gives the trainer no second move to race us with, and section 13 has
   always injected there with no floor at all.

So the cost is bounded by `pressFloorMs` **once per variation**, every unknown —
no tracker, a throw, a stale stamp — resolves to *not* waiting, and setting
`pressFloorMs` to 0 disables it outright. The lesson is the ordinary one: the
mechanism that already survives this device was sitting right there, and the
part I changed about it is the part that broke.

### Wearing Chessable's own board

Our board covers theirs for a whole session, so a palette of our own reads as
"something has taken over the page" — the opposite of the continuation quiz,
whose colours are deliberately ours because there *this is a different board* is
the message. Hence `.clo-sg-board--themed`, never a change to the shared
`.clo-cr-sq--light/--dark`.

Ground truth (2026-08-05): every `.square-55d63` computes to a **transparent**
background. The checkers are a themed background **image**
(`Green.<hash>.png`) on an ancestor two levels up, `background-size: cover`. So
there is no square colour to read — and the class carrying it names the *theme*,
which is why `boardThemeEl()` walks ancestors rather than matching a selector: a
selector would only ever work for one theme. Copying the image follows the user's
own theme for free. `100% 100%` rather than `cover` so our 8×8 maps exactly onto
the image's, and `positionBoard` measures the *theme* element — inset a couple of
px inside the board container by their border — so our grid lines up with the
checkers being borrowed. The **amber ring stays**: it is what says this board
takes no input, in the same place as two boards that do.

**Hand-back is section 13's rule**: only a variation's OPENING run is ever
replayed, never a jump back in after the user has taken a card themselves
(`sg.handedOver`, set in `onKey` and deliberately NOT in `reveal()`, which
auto-play itself calls). Reset per variation.

**Simulated** (5 cases): nothing proven → every card manual; a proven prefix →
auto-play stops at the first new move; all proven → the whole variation replays;
only the MIDDLE proven → no auto-play at all, which is the opening-run rule; and
a position proven again after a hand-back → still manual.

**Two presses that were not hand-overs and were counted as one** (v0.81.0). Both
reported as "it takes at least one extra variation before auto-play kicks in".

- ***next* on a card auto-play has already claimed** means "get on with it", not
  "I'll take over". A pending `sg.autoTimer` *is* `maybeAutoPlay` having decided
  this exact card is proven and being about to reveal it and grade it correct —
  which is what the press is asking for too. The reveal beat is 260 ms at the
  default pace, comfortably inside the rhythm of someone pressing a ring
  steadily, so agreeing with auto-play cost the whole rest of the line and the
  feature appeared to work only on a variation the user happened to sit out.
  That press now clears the timer and calls `autoReveal()` at once. ***wrong* is
  still a hand-over** and must be: it contradicts the very proof the card was
  picked on.
- **Auto-repeat is not a press** (`e.repeat`) — swallowed like any of our keys,
  since the trainer must not see it either, but never acted on. Held keys fire
  keydown every ~30 ms past the repeat delay, and the *advance* press is the one
  held longest, so the repeats landed in the next variation's 'think' phase and
  took it over before its first card had been served.

### …and it still did not work on a phone (v0.82.0)

Same report, same session, one device apart: v0.81.0 cured it on a PC and changed
nothing on a mid-tier Android. That is the diagnosis, not a complication — every
one of the remaining causes is a RACE, and the machine is the only variable a
race has. Four of them, plus one that costs proofs rather than presses.

**HAND-OVER MEANS "THE USER ANSWERED A CARD THEMSELVES".** That is the definition
the code now implements, and each of the three fixes below is a press that did not
meet it and was counted as one anyway. They compound: any single one of them ends
the replay for the rest of the variation, which is what "one extra variation"
looks like from the outside.

1. **A press with no card to show cost the whole variation.** Between a variation
   change and the first card being served, `cardPly()` is null — the plan read has
   not landed, or the trainer is still auto-playing its own opening plies — and a
   press there set `handedOver` and then fell straight out of `reveal()`, drawing
   nothing. A few hundred ms on a desktop; most of a second on a phone, at the
   start of every variation, which is exactly where a steady presser is pressing.
   It now costs nothing (and says "Waiting for the board…"). The same guard is
   applied to `reveal()` REFUSING — it puts itself back in 'think', and the
   hand-over is now RESTORED rather than left set, since an earlier card of the
   variation may have handed over for real.
2. **The exemption asked the wrong question.** v0.81.0 tested whether the reveal
   TIMER was already pending, which is the same question as "would auto-play take
   this card" only on a machine that has already *served* it — and serving is
   itself what runs late on a phone, since it waits on an async plan read that
   costs real time there. So the press regularly arrived while the answer was
   still "auto-play has not been asked yet", and the exemption did not fire. It
   now asks `willAutoPlay()`, the condition `maybeAutoPlay` itself acts on, so it
   agrees with auto-play by construction instead of by winning a race.
3. **The SECOND press had the same hole, and it is the likelier of the two.**
   Pressing *next* while auto-play had already pressed the card set `handedOver`
   on the reasoning that "the window is shorter than a human reaction". It is not:
   that window is auto-play's ADVANCE BEAT — 240 ms on the fast pace, 620 ms on
   the relaxed one — plus, on card 0, up to `pressFloorMs` (550) of settle inside
   `autoPress`. So a user meeting auto-play halfway through its very first
   replayed card ended the replay for everything after it. *next* there is now
   agreement; only *wrong* takes the line back.

   The hand-over that press was doing the job of has moved to where it belongs:
   the **grade** press (gated on `cardReady()`, the same condition both grades bail
   on, so a grade refused for being early still costs nothing). That also settles
   the one case the reveal deliberately leaves open — our board may legitimately
   be a card AHEAD of Chessable, and there `willAutoPlay()` cannot tell agreement
   from override, because `cardReady()` is false either way.

**And the proofs themselves stopped depending on the board.** Section 13 learns a
proof by WATCHING: a user-colour move seen as exactly one legal step from the
tracked position, held as `pendingRecord` until the opponent's reply confirms it.
On a phone that chain has three ways to break inside the same half second — the
mutation → rAF/32 ms → `processFrame` hop can arrive *after* the reply has also
landed (two plies on, `findSingleMove` matches nothing, the tracker re-anchors and
`startTracking` throws the pending answer away); a mid-animation snapshot is
unreadable; the confirming reply has to be observed as its own frame. Losing the
answer is invisible until the next variation, where auto-play then declines a move
the user demonstrably knows.

Under this mode none of that uncertainty exists: the move played is the COURSE'S
OWN, taken from the lesson plan, pressed by us, from a position the plan states
exactly. So section 23 ASSERTS the proof through a new write bridge,
`autoPlayNoteProvenMove(fen, uci)` — the same merge, the same key and the same
move-note veto as `confirmPendingRecord`, differing only in where the fact comes
from. `sg.proof` is armed in `pressCourseMove` (so BOTH the manual "I knew it" and
auto-play's own press arm it, and `gradeUnknown`, which never goes through there,
cannot) and committed **only on the trainer's own evidence that the card was
taken**: its fen moved off the position we answered, or the variation completed.
A press can be swallowed whole and this mode verifies nothing afterwards, so every
other exit — `failAct`, the "never moved on" watchdog, a variation change, `stop`
— DROPS it. It also happens to give the last card of a variation a proof directly,
the one answer no opponent reply ever confirms and which section 13 needs three
separate mechanisms to catch.

Section 13 got the matching repair on its own side (`findMovePair`): a frame that
arrives a whole reply late now has BOTH plies applied instead of re-anchoring, so
the user's answer is still classified, held and confirmed. Exactly one pair of
legal moves must produce the placement; any ambiguity falls through to the
re-anchor, which is what happened to the whole case before. Spot-checked against
the real generator (e4 e5, e4 c5, a capture, an exchange, O-O first, en passant
first, a promotion first, three plies → refused, one ply → left to
`findSingleMove`).

**And the dead half second at each variation change is gone.** `advance()` now
starts the plan chase, which had been left on the 500 ms poll: loading the next
variation is an act like any other, and the first card of every variation was
waiting a whole tick plus a read before it could be served — dead board at the
exact moment the user is pressing for the next card. `sg.advancing` keeps tick's
browse branch from killing that chase while the browse state outlives the press by
a few hundred ms.

That chase made two guards necessary, both because the plan is now read while the
completed variation's block is still up: `applyPlan` does not re-anchor in the
browse state, and `onKey` routes on `reviewBrowseReady()` as well as on
`sg.phase` — the plan swaps ~90 ms before the new variation's first move
animates, so `anchor()` can reach card 0 a beat before that block comes down, and
a press taken as a card there would be graded against a board that is not live
yet.

**Diagnostic**: `noteHandover()` prints one line per variation naming the press
that ended a replay ("reveal press", "grade press", "\"wrong\" on an auto-played
card"). `noteAutoSkip` could only say the variation had been taken over, never by
what — which is the whole question when the complaint comes from a device nobody
debugging it can hold.

## 2c. No flicker at a variation change

The board used to keep showing the position the *previous* variation ended on
for however many ticks the trainer took to settle, then jump. `applyPlan` now
nulls `sg.pos` on a variation change and `setBoardVisible(Boolean(sg.pos))`
hides both overlays until `anchor()` has filled it in again — one condition, not
a flag to keep in step.

Two supporting details: the overlays are **hidden, not torn down** (a removed
board has to be rebuilt, pieces and all, which is a second flicker on top of the
one this removes), and they are **born hidden** in `buildBoard()`, since a board
is only ever built before it has a position to show and an empty 8×8 appearing
for a frame is the same flicker at the other end.

## 2d. Mistake retry and drill (v0.72.0)

The mode now covers both ways of going through a session's mistakes. They needed
opposite amounts of work, and the reason is worth stating: the **retry pass** is
an ordinary trainer session on a different route, so it needed the route gate
opened and two conflicts resolved; the **drill** is our own board with no
Chessable involvement at all, so it needed only the two keys.

### The retry pass (section 17) — `/learn/`

`onPractice()` became `inSession()` = `isTrainerPath()`. Both routes render the
identical MoveTrainer2 markup, so the lesson plan, the pause control, the give-up
button and the injection all work unchanged. The old `/practice/`-only rule was
about where *grading* means something — and a retry pass is precisely a case
where the interaction is wanted and the grading deliberately changes nothing.
This also brings the mode to overstudy tabs and first-time learning.

Two conflicts, both real:

* **Auto-play must not replay the move being retried.** That move is very often
  ALSO proven — the user answered it correctly later in the session, which is why
  it is in the record at all — so without a check our auto-play would cheerfully
  play the one move the whole pass is asking for. Section 17 already marks those
  positions through `autoPlaySetHold`; the new read-only bridge
  `autoPlayIsHeld(fen)` is how `cardIsProven()` asks. Same key shape as
  `holdKeys` (placement + side, no castling), for `holdKeys`' own reason.
* **The browse-state advance must not fight the runner.** Section 17 has a queue
  and navigates to the next variation itself, so a "next variation" of ours would
  take the user off its route and the pass would have to drag them back.
  `advance()` refuses while `retryRunActive()` and says why.

One interaction is a consequence rather than a conflict, and is the intended
behaviour: this mode holds section 13's auto-play off for its whole duration, so
in a retry pass the run-up is replayed by **our** auto-play (§2b) rather than by
section 13's — which lands in the same place, since our hold check is the pass's
own hold list. With the Auto toggle off, the user presses through the run-up,
which is exactly what "every card waits for you" means.

### The drill (section 20) — our own board

Much simpler: a drill grades only our own mistake list. Nothing is sent to
Chessable, nothing is rescheduled, there is no timer to pause and no card to keep
in step with. So it is the two keys and nothing else, handled in the continuation
module's existing capture-phase listener:

* first press — `applyMove` the card's move on the drill board;
* second press — the verdict, then `nextLine()`.

`finishDrillCard(cleanOverride)` gained one optional argument. Show-and-grade's
verdict is **authoritative** and overrides the usual "no miss, no hint" test:
nothing was missed or hinted, the move was simply shown, so the user saying they
knew it is the only evidence there is.

It is **additive** — the board still takes a played move, so the keys are a
second way to answer a card rather than a mode to be in. Gated on
`showGradeEnabled()`, the preference rather than a running session, since a drill
is not a trainer session and the row's Show & grade button does not apply to it.

### The clickable-line quiz (section 18) — v0.85.0

The same listener and the same two presses, which is why `drillShowGradeKey` was
renamed `showGradeKey`: it now serves both hosts. What made this cheap is what
made the drill cheap — **neither host grades Chessable**, so there is no card to
keep in step with and no scheduled move to get wrong.

The two hosts differ in exactly ONE thing, and it is structural rather than a
setting:

* a **drill card ENDS** on the move being asked for, so its verdict is followed
  by `nextLine()`;
* a **clickable line CARRIES ON**, so its verdict is followed by `step()` —
  which plays the opponent's reply and stops at the next move asked for.

That reply is the second press's own move to look at, which is the rule the whole
mode rests on: *no press that shows nothing*. It is why `step()` is the right call
rather than a bespoke advance — the pause before the reply is the module's own,
the same one a hand-played move gets.

**What the verdict does** was the open question. A clickable line reschedules
nothing and records nothing — its defining property — so the verdict has only
THIS RUN to act on. A line holding a move the user did not know is pushed back
onto `cr.queue` (`requeueLine`), i.e. it comes round again at the end. That is
the same *shape* the drill's verdict has ("does this leave the list?"), scoped to
something that does not outlive the run, and it is what stops the second key
being a press for nothing.

**Once per line** (`cr.sgAgain`, keyed on `line.key`, cleared by `beginRun` and
`closeReview`): a repeat that can re-queue itself is a run with no end, and the
user has already said they did not know it — saying so twice must not cost them
the exit. The queued entry is a shallow COPY carrying `sgRepeat`, so the title
can say "· again"; the two passes are otherwise indistinguishable, the queue
being an array that is still growing. Everything the copy is read for (`plies`,
`moveIdx`, `startFen`, `label`, `key`) is on it, and nothing compares lines by
identity.

**Combined lines**: the reveal plays the line's OWN move and NAMES the rest
(`ply.alts` in the prompt — "O-O (or Qc7)"), which is exactly what browse mode
does and for the same reason. So the ALTERNATIVES key is deliberately **not**
bound in this module: the accepted set is already on the ply, where a review
session has to fetch `getLesson` for it — a press to ask a question already
answered on screen is the wasted press v0.70.0 removed.

**The timer needs nothing.** `holdTrainer()` is called from `reviewNow` and
nowhere else, i.e. from exactly the runs that happen mid-quiz with a live card
being timed; a browse-state run has no card to charge. So the two keys make a run
slower without making it cost anything.

**Not** while `cr.browse` — nothing is being asked for there and the walk owns the
keyboard. A hand-played line is never re-queued (and a hinted one is not either):
the verdict exists only on the key path, and playing the move correctly IS
knowing it.

## 2g. Queueing the `next` key (v0.100.0)

*"Make it possible to queue multiple Correct/Next if the user sends multiple 2
within a short time. So 4 quick 2s → progress 4 moves."*

A `next` press the mode cannot act on **yet** is remembered and spent the moment
it can be, instead of being discarded. Tap four times and the line goes four
moves on.

### It fixes a real drop, not a rhythm

This reads like a convenience and is not. **After every grade there is a window
of roughly 950 ms in which every press was thrown away**: `settleMs` (400) on the
way out of the pause, then Chessable's own ~550 ms to take the move and reply.
For that whole time the phase is `'acting'` and then `'think'` with `cardReady()`
still false, and both paths ended in `setStatus('Waiting for the board…')` with
the press gone. Someone tapping steadily at 200–250 ms lost about **four presses
per card**, which is most of what "it doesn't respond" feels like.

There are exactly two such points, and the queue is placed at both — inside
`doNext`, not around it:

* **`'acting'`** — an act owns the mode for that ~950 ms. Caught in `onKey`.
* **`'shown'` with `!cardReady()`** — our board is already showing the move while
  the trainer is still animating the card *before* it. This one follows **every
  single grade**, so it is the common case rather than the edge one.

The third bail (`'think'` with no `cardPly()` — a variation change, or the
trainer still playing its own opening plies) queues too. v0.82.0 made that press
cost *nothing*; it was still thrown away.

### Two presses make one card, so four taps are four moves

That is not a coincidence to be tidied — it is the mode's governing rule
(§2) holding: one press shows your move, the next shows the opponent's reply and
grades. So "4 quick taps → 4 moves shown → 2 cards graded" is the existing shape,
and the queue adds no new arithmetic.

### Why this is safe where a latch was not

**Every queued press is still a real press.** The count is bounded by the user's
own taps, nothing runs that they did not ask for, and there is no state to
forget. That is the whole difference from the hold-to-play-through gesture tried
first and abandoned (below), and it is why this needs none of that gesture's
apparatus — no latch, no idle watchdog, no engage/disengage.

Four rules do the rest:

* **Only `next` is ever queued.** `wrong` is a verdict on the card *on screen*,
  and a verdict applied to a later card would fail a move the user never saw. It
  is also what CLEARS the queue: someone saying "I didn't know this one" has
  stopped blasting. `alts` asks about the move in front of them and means nothing
  deferred.
* **A queued press can never ask for the next variation.** `queueActionable`
  deliberately omits the browse state, and the queue is dropped when the
  variation ends (tick's browse branch) and at a variation change (`applyPlan`).
  So a tap can never act on a line the user had not seen — the one rule worth
  carrying over from the abandoned gesture.
* **It expires** (`queueTtlMs`, 3 s) and is dropped outright by `failAct`, the
  "never moved on" watchdog and `stop()`. A press stranded by an act that did not
  land must not fire later against a board that has been re-derived under it.
* **It drains one at a time and never inside `advanceMs()` of the last.** Two
  spent in one pass would show your move and the opponent's reply in the same
  frame, and a move shown for no time is not shown. So it drains at the mode's
  own advance beat — already a user setting — and Chessable's round trip paces it
  from there.

`pumpQueue` is called from `applyPlan` and from `tick`, and the first is the one
that matters: the plan chase reads every ~110 ms while an act is outstanding, so
a press waiting on `cardReady()` is spent within a beat of the trainer catching
up rather than on the next 500 ms poll. The `tick` call sits **above** the
`'think'` gate so it covers `'shown'`, which is where a queued press most often
waits.

The panel says what is owed (`· 3 queued`). Without it a tap that was remembered
and a tap that was dropped look identical until the move appears, which is
exactly the uncertainty this removes — and it is the only place `maxQueued` is
legible.

### The hold gesture that this replaced

v0.100.0 was first built as **hold `next` to play through the variation**, and it
worked: confirmed live on 2026-08-11 (five cards from one hold with Auto off and
nothing proven, the release stopping it within one card, and a key held 6.5 s past
the end of a variation advancing nothing). It was then abandoned on a hardware
finding, and the finding is the part worth keeping:

**The Bluetooth ring this mode exists for sends one event per tap, on RELEASE,
never while held, and never faster than ~200 ms apart.** So there is no key-down
state to observe at all — no auto-repeat, and a long press is *swallowed by the
ring* rather than merely undetectable. Every hold-shaped gesture is therefore
unbuildable on the one device that matters, and so is the long-press fallback.

**Do not reach for `e.repeat` again.** v0.81.0's rule — a repeat is never a press
— stands unqualified, and the one design that had an argument for bending it has
been withdrawn for reasons that have nothing to do with the argument.

What was considered and rejected in its place, before the queue was proposed: a
**double-tap latch** on `next` (the natural reveal→grade rhythm and the
deliberate trigger are the same gesture, so a mis-fire would play a variation the
user was only reading) and **`1` as a play-through toggle** (free while the audio
is off, but `1` is the TTS "say that again" key, which is precisely what a
blindfold ring user reaches for). The queue is better than both because it is not
a mode at all.

### v0.100.0 shipped a `ReferenceError` on every reveal (fixed in v0.100.1)

Reported as *"show and grade has stopped working completely — pressing 2 enters
the mode but the correct move is never shown."* It had.

`isNext` was a local `const` in `onKey`. Lifting the think/shown body out into
`doNext` left the auto-play agreement exemption still reading it, so **every
`next` press at the think stage threw** before it could reveal. `doNext` now
derives it (`const isNext = !isWrong` — exact, since `onKey` only reaches it for
those two keys and a queued press is always a `next`).

Three things let a one-word fault ship, and each has a standing lesson:

* **`node --check` cannot see it.** It checks syntax; a free identifier is a
  runtime `ReferenceError`. Nothing in this repo's verification block catches
  this class.
* **A transcription-based simulation cannot see it either** — it re-writes the
  logic rather than executing the file, so the 24 assertions passed against code
  that was never run. Simulations prove the *design*; they say nothing about the
  *source*. Do not let a green simulation stand in for a live run of an edit to
  working code.
* **A throwing key handler is SILENT.** No status, no board change, no visible
  log — the press just does nothing. `onKey` is now wrapped in the same
  one-line-per-distinct-message try/catch `tick` has, and for the reason tick's
  comment already gives: the failure mode is otherwise invisible from the
  outside.

**The rule this earns: an EXTRACTION in this file is not shippable on static
checks alone.** Moving a body into a new function is the refactor most likely to
strand an identifier, and the only cheap mechanical guard is to re-read the moved
body for names that were locals of the old scope before running anything. Do that
first; then verify live.

### Simulated (24 assertions, all passing)

Transcribed bookkeeping with a stepped clock and Chessable's two real delays
(`settleMs` 400, then 550 ms to reply). Nine sequences: four taps at the ring's
own 200 ms floor giving four moves and two cards; the same four taps under the
OLD code, which loses one (the control case); six taps checking no two moves
share a frame; a tap during an act; `wrong` clearing the queue; a short line
over-tapped by four, where the surplus is dropped at the boundary and never calls
`advance()`; expiry; the cap; no card graded twice or out of order; and a single
tap behaving exactly as it did before.

## 3. Decisions taken (2026-08-04)

| Question | Answer |
|---|---|
| Route | `/practice/` review only. Not `/learn/`, not overstudy. |
| Grades | Binary. A third grade ("hard") is a possible later update. |
| Failure signal | **Chessable's own "I don't know"** — see §4. No wrong-move injection anywhere in the feature. |
| Timer | Paused while the user thinks. |
| Run-up at variation start | Only the last opponent move is announced. |
| End of variation | **Next** advances to the next variation. |
| Entering the mode | A button on the trainer row; one tap at the start. |
| Our mistake log | Rendered "not known" — `wrongLabel` learned the word. |
| Blindfold-ready | Yes — `announce()` + `CONFIG.showGrade.showBoard`. |
| Keys | `2` / `4`, plus `3` **or space** for the alternatives (v0.79.0, §2e). `1` earmarked for `repeat` (TTS). Media keys deferred until a real ring is captured. |

## 2e. "Was my move also right?" — the alternatives key (v0.79.0)

*Entry point: `showAlternatives()`. The verdict it must never touch is
`sg.markedUnknown`, which is cleared by `anchor()`, `leaveActing()` and
`startMode()` and by nothing else.*

The move shown is not always the move you had in mind, and the course often
accepts both. Grading that as a failure is simply wrong, so `3` — **or the space
bar** — pressed once the move is on screen, draws every accepted alternative on
the board and names it.

**Space is the ring's key, not a convenience.** The first hardware this mode has
been driven from sends `1`, `2`, `4` and `" "`, and which button is which is
decided by where they sit on the ring. Taking space is safe only because of where
these listeners already are — capture phase on `document`, with `preventDefault`
and `stopPropagation` on all three event types before anything else sees them —
so while the mode runs it cannot scroll the page, re-fire a focused button, or
reach MoveTrainer2's own shortcuts. Outside the mode it is not bound at all.
`1` is **earmarked** for `repeat`, the TTS "say that again"; nothing else may
take it.

That also forced `keyName` to grow a label map. `KeyboardEvent.key` is the right
thing to match on and the wrong thing to print: a space's name is invisible,
which in a panel whose entire job is to say which key does what would be the
message lost.

**What it is not.** It is not the wrong-move injection §4 removed. Nothing is
played on Chessable to find out whether it would be accepted; the set is *read*,
and the move the grade presses is still the course's own.

### Where they actually live (ground truth, 2026-08-05)

v0.79.0 assumed the accepted set was in page state, on the reasoning that
MoveTrainer2 accepts an alternative with no network request so it must already
know them. The reasoning was fine and the conclusion was wrong — it reported
"no alternatives" on a variation with seven. Measured on course 453453,
variation 71087636, whose alternatives were first confirmed to exist by reading
the edit page's own `allTheMoves`:

| source | carries alternatives? |
|---|---|
| `ctx.lessonPlan` (what pagestate.js reads) | **no alt field of any kind** |
| `ctx.lessonData.moves` | **no alt field of any kind** |
| `/api/v1/getLesson` (what the plan is built *from*) | **yes** — `alt_black: "[\"d5\"]"` |
| edit page `allTheMoves` | yes — `alt_black: ["d5"]` (already parsed) |

So the trainer *strips* them building its plan, and it is a fetch or nothing.

`getLesson?uid&oid&bid` returns `lesson.moves[]`, **one entry per full move**
keyed by `mid`, with `move_white`/`move_black` (the SAN) and `alt_white`/
`alt_black`. Our plies carry `mid` and `color`, so the join is exact and never
matches on SAN.

**The alt value is a JSON-encoded string** — `"[\"d5\"]"`, `null` for none — not
an array. That is why a correct field name alone would still have read as empty,
and `parseAltField` accepts either shape.

One fetch per variation, started when the plan lands so the key is instant, and
cached per oid so a retry pass does not pay twice. Fails soft everywhere;
"could not read them" stays a different sentence from "there are none".

### The setting is part of the answer

`simpleSettingsApiData` holds `eq_<bid>_<white|black>_alternative`, and on the
test course it was `"0"` for Black — the colour being studied. With it off,
Chessable never ships the accepted set to the trainer at all, which is both why
the plan is empty and why one of the user's *own added* alternatives would still
be marked wrong in review.

pagestate's `readAltSetting` reads it (no fetch — it is already in the context)
and the wording follows: **"Also accepted: d5"** when on, **"Course lists: d5
(alternatives are off for this course)"** when off. Two measured facts, with no
claim about what the trainer would do with a move it has never been told about.

### A colour argument must be a key or a CSS value

`paintShape` (§11c) took only Chessable's four colour **keys**; anything else was
dropped silently and the shape fell back to the stylesheet's green — exactly the
colour the caller passed an argument to avoid. Two consequences, both measured:
these alternative arrows came out green, and, older and quieter, **v0.77.0's
amber "your turn to grade" arrow had been rendering `rgb(21,120,27)` since the
day it shipped**, because `arrowHex()` returns a resolved custom property and not
a key. Fixed to accept either; verified live that the two arrows now render
`rgb(217,169,66)` and `rgb(26,99,201)`.

### Rules

* **After the reveal, never before.** At the think stage a set of arrows over
  the accepted moves is the quiz handed over.
* **It grades nothing, and does not clear a verdict already given.** Clearing
  `markedUnknown` would make the very next `next` press — which after a
  think-stage "wrong" means only *advance* — silently grade the card correct.
  A false proof is worse than the wrinkle it fixes (auto-play reads the same
  record), and the natural order asks first anyway.
* **Blue arrows.** Not green: green is what the main arrow *stopped* being in
  v0.77.0 because it vanished against Chessable's own board image. Not amber:
  that means "waiting for you to grade".
* **The SAN list is not decoration.** The arrows are drawn on the board as it
  stands *after* the course move, so where an alternative moves the same piece
  (Nf3 against Ne2) its source square is now empty. The list is what reads then
  — and it is the whole output under `showBoard: false`, since everything goes
  through `announce`.
* **An unresolvable SAN is still listed.** "Chessable says Bc4, we cannot draw
  it" beats silence.

Move numbers and eval glyphs are stripped for the resolve and kept for the
display — §21's `getList` carries numbers, the edit page's arrays do not, and one
regex covers both. Spot-checked against the real generator before writing any of
this down: `3. e4`→e2e4, `d4!`→d2d4, `O-O`→e1g1, `exf6`→e5f6 (en passant),
`a8=Q`→a7a8q, garbage→unresolved.

## 2f. Mistake repetitions have no reply (v0.83.0)

Reported: *"during Chessable's mistake repetitions that happen after you make a
mistake and then finish the review — our board shows the opponent's next move
after our mistake was corrected (not necessary)."*

Chessable's own re-ask takes you back to a move you failed once the variation is
finished, and asks for **that move on its own**. Nothing follows it, so the reply
our board played after the corrected mistake was a move the trainer would never
make — followed by the board jumping to wherever it actually went.

### It is asked of our own board, not of the lesson plan

`sg.reached` is the high-water mark of `sg.cursor` for the variation. The reply
to card *i* is ply *i+1*, so it has already been shown iff the cursor ever
reached *i+2*:

```js
const isRepeat = () => sg.cardIdx >= 0 && sg.reached > sg.cardIdx + 1;
```

That is a **direct observation of the trainer having gone back**, and it was
chosen over the obvious plan field for three reasons:

* `progress.isQuizCurrentlyInRetry` (DESIGN-retry-mistakes.md §2.1) is a *name*
  we would be guessing at, it is not currently copied out by
  `content/pagestate.js`, and confirming what it means needs the same live
  session that would confirm this does.
* it is right under **either** shape the repetition's plan might take. If that
  plan turns out to carry no following ply at all, `advanceAfterGrade` already
  returned early and this is simply inert.
* it costs nothing in the MAIN world.

`unwalkCard()` is the one thing that lowers the mark, and it is needed: on the
manual path `advanceAfterGrade` runs on the **press**, ahead of the act, so an
act that did not land (`failAct`, the "never moved on" watchdog) leaves a reply
shown and counted for a card the trainer will ask again — which would read as a
repetition and withhold the real reply.

**Known false positive, accepted:** a position repeating inside a variation
anchors on its FIRST occurrence (`findIndex`, section 17's own hazard). The card
is mis-anchored there whatever this returns; withholding one reply is a minor
extra symptom, and the board re-anchors on the next card.

### It stays a two-press card

The second press keeps its other job: it is the verdict, given **after** the move
has been seen, which is the whole reason the two presses are split and matters
more on a move already failed once than anywhere else. A one-press card would
force the verdict before seeing the answer. So the rule *every press shows a
move* is bent here, deliberately, and the wording carries the difference:

| where | ordinary card | repetition |
| --- | --- | --- |
| think prompt | `Your move` | `Your move — repeat` |
| shown, marked unknown | `2 — the opponent's reply (marked as not known)` | `2 — on to the next card (marked as not known)` |
| after the grade | `Opponent played <san>` | `Repeat — no reply follows` |

The other `shown` line (`2 — I knew it · 4 — I didn't know`) promises nothing
about what follows and is left alone. `sg.cardIdx` goes to `-1` on a repeat, so
`anchor()` can re-derive — including when the answer is that very card again,
which its "already here" short-circuit would otherwise refuse.

### Simulated, not observed

Six sequences, against a transcription of the edited bookkeeping: a normal pass
(every reply shown); a repetition of an earlier card; two repetitions in a row;
the same card repeated twice; a repetition of the LAST user card, where a reply
genuinely does exist in the plan; and a failed act followed by the same card
being re-asked (reply shown again — no false repeat). Panel strings measured in
the harness at the ground-truthed 506px comment-box width: one line each, 27px
prompt / 16px keys, identical to the strings they replace.

**Not verified live** — see §12.8.

## 4. GROUND TRUTH (live, 2026-08-04)

`/practice/` review session, course 453453, variation "4" (oid 70382663), read
through `readLessonLine()` before and after each action.

**Chessable already has the control this feature needs, and it is one button
that mutates.**

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
  grades a failure as a pass. The whole risk is gone, along with the question of
  whether the lesson plan carries `alt_white`/`alt_black`.
* The give-up **plays the move itself**, so 5b needs no injection either. Only
  5a ("I knew it") presses the board.
* The study state's control is `[data-testid="nextMovesButton"]` and takes a
  plain untrusted `.click()`.

**The timer.** Pausing is a `.click()` on the `.fa-pause` footer button;
`.play-button--board` appears; the pause **survived 5 s of thinking with no
`timeUp` recorded**; resuming needs the full `pressSquare` pointer sequence.
The hint/give-up button **stays rendered and clickable while paused** — only
"Pause timer" is replaced. Section 18b's mechanism, unchanged.

**Two traps, both found by falling into them.**

* **Pressing the board while paused resumes the session and the press is
  CONSUMED.** So every act resumes first, waits `settleMs`, and only then
  presses. This is why `resumeAndSettle()` exists and why nothing may skip it.
* **The per-move clock is shorter than it feels.** During the session I was
  slower than it twice; both cards recorded `["timeUp"]` and Chessable played
  the move itself. That is the exact failure the pause exists to prevent, and it
  is worth knowing that it is not a theoretical risk.

**A real `n` keypress advanced the study state; a synthetic `KeyboardEvent` did
not.** Only one observation, in one state, but it is the first direct evidence
about section 22's `advance()`, which CLAUDE.md already flags as needing live
verification. Section 23 therefore prefers the BUTTON and keeps the key
dispatch only as a fallback — and section 22's own use of it should be re-tested
(§11).

## 5. Keys

`CONFIG.showGrade.keys` is a set of ARRAYS, so a second spelling of the same
intention is one entry rather than a code change:

```
next:   ['2'],       // → ['2', 'MediaTrackNext']
wrong:  ['4'],       // → ['4', 'MediaTrackPrevious']
alts:   ['3', ' '],  // the ring's fourth button sends a space
repeat: ['1'],       // "say that again" (§8) — only ours while the audio is on
```

Matched on `e.key`, swallowed on `document` in **capture** phase while the mode
is active — section 18's discipline, and for its reason: MoveTrainer2 binds
single-key shortcuts on `document` and does not skip focused controls. Only the
keys we are going to ACT on are swallowed — which is why `repeat` is ours only
while the audio is on — and everything else still reaches the trainer; a press
inside an `input`/`textarea`/contenteditable is ignored outright.

Section 22 (type a move) stands down entirely while this mode runs, through the
new `showGradeActive` bridge. Two things holding the keyboard over one quiz
board is not a state either of them can reason about.

`keyName` maps a binding to a READABLE name (`KEY_LABEL`). `KeyboardEvent.key` is
the right thing to match on and the wrong thing to print — a space's name is
invisible, which in a panel whose whole job is to say which key does what is the
message lost. Anything unmapped prints as itself, so a new digit needs no entry.

### The `next` key also STARTS the mode (v0.87.0)

`onKey` no longer returns on `!sg.active`; it routes to `maybeStartFromKey`
instead, and `2` does what the row's button does. The reason is the reason the
mode exists: a ring has four buttons and no way to press one on a web page, so
needing a mouse click to *begin* was the one gap in "a whole session without
letting go of it".

Gated on exactly what the button is gated on (`sg.enabled` + `inSession()`, with
`continuationActive()` as belt-and-braces), and the key is swallowed ONLY when it
is going to act — outside the mode these belong to MoveTrainer2. The press is
spent on starting and does **not** also reveal the first card: there is no board
on screen when it lands, and a key that means two things depending on state is
what this mode avoids everywhere else.

### SPACE also takes the heads-up's "Review now" — and the two DO overlap

The assumption that they could not is wrong and worth spelling out. Section 18b's
panel is clocked on the TRAINER's position, and the trainer does not move until
the card is graded, so a panel raised at the card's own position is still standing
all the way through the reveal — i.e. through exactly the `'shown'` window where
the alternatives key is live. `headsUpTick` has no stand-down for this mode
either.

Resolved by priority rather than by hoping:

* inside `'shown'` (and not `autoGrading`) the press means **alternatives**,
  because it is about the card being answered right now;
* everywhere else `onKey` hands it to `continuationReviewNow`, the null-safe
  bridge, which takes the offer if a panel is up and answers false otherwise.

The continuation module owns the same key when the mode is NOT running, in a
listener of its own — the existing one is gated on `cr.active`, and a heads-up is
not an active review. That listener STANDS DOWN on `showGradeActive()`, and that
is load-bearing rather than tidy: `start()` runs `initContinuationReview` BEFORE
`initShowGrade`, so as the earlier capture-phase listener it would otherwise
swallow space before section 23 ever saw it. Both listeners test for a panel
BEFORE swallowing, since MoveTrainer2 binds space itself and with nothing on
screen that shortcut is still the user's.

Space is safe to take only because of where these listeners are — capture phase on
`document`, `preventDefault` + `stopPropagation` on all three event types before
anything else sees them — so it cannot scroll the page, re-fire a focused button
or reach MoveTrainer2's own shortcuts while the mode runs, and outside the mode it
is not bound at all.

### The trainer row (`.clo-sg`)

`DESIGN-ui-inventory.md` has no entry for this mode, so the row rules live here.

`.clo-sg` sits at `order: 2`, beside section 22's move field — both act on the
card being answered — with mistakes / practice / overstudy / settings each shifted
up one. Green **outline** idle, and `.clo-rowprimary` while running, when it reads
"Stop": a mode that owns the session must not make its exit a hunt.

A FOURTH collapsed-mid-quiz exception in the established idiom,
`.clo-review--collapsed .clo-sg:has(> .clo-rowprimary)`, reading the module's own
state rather than a new flag, at specificity (0,4,0) — strictly narrower than the
rule it bends, exactly like the `.clo-mx` and `.clo-tm` exceptions. Measured in
the harness: browse row 38 px, collapsed-while-running 38 px, +26 px with a status
line — the same figures the move field gives.

**Media keys are still unresolved.** On most platforms they never reach a page
as key events — the OS routes them to the media session, which a page can only
claim by playing audio. Until a real ring is captured, only the digits are
bound. If the media-session route is needed, the silent-audio element is also
what a TTS build would want, so it is not wasted work.

## 6. The timer, in code

Per-card cycle: opponent's move lands → `maintainPause()` → user thinks and
reveals → user grades → `resumeAndSettle()` → act → trainer replies → pause
again.

`maintainPause()` retries once per tick rather than giving up on one press,
because Chessable empties the board footer in the transition states between
quizzes — section 18b's lesson, and the pause control is exactly what is missing
there.

`stop()` **fails open, timer first**: a session left paused with our board down
is the worst thing this mode can leave behind, and every other step is cosmetic
beside it. It runs from the toggle, from the preference being turned off, from
leaving `/practice/`, from another board opening, and from `pagehide`.

`phase === 'acting'` is watchdogged to `actMaxMs`, checked before any other
early return in `tick()`.

## 7. Architecture

**Entry points not named elsewhere in this doc:**

| Function | Does |
|---|---|
| `computePrefix` / `plyIsProven` | decides the auto-played prefix when the variation's plan first lands, reading each ply's own `sourceFen` rather than the live board — so a promotion *ends* the prefix instead of being refused at the last moment. `cardIsProven` re-walks when the cursor runs out of prefix (at most once per card, `sg.prefixAt`), because the record also gains the *previous* variation's answers and a proof landing late was otherwise invisible for a whole variation. It can only ever extend. |
| `applyTimerBar` | hides Chessable's per-move clock (`SELECTORS.trainerTimerBar`) for the mode's duration — it flickers as the clock is paused and resumed around each card, and cannot tell the user anything they can act on. **`visibility`, never `display`:** the bar is inside the board footer, so taking it out of flow moves everything anchored below the widget. Re-applied every tick (a React re-render drops our inline style) and restored in `stop()`. |
| `applyBoardTheme` | copies Chessable's own board image onto ours (`.clo-sg-board--themed`). Every `.square-55d63` computes to a *transparent* background — the checkers are a themed background **image** on an ancestor two levels up — so there is no square colour to read, and `boardThemeEl()` walks ancestors rather than matching a selector, which would only ever work for one theme. `100% 100%` rather than `cover`, and `positionBoard` measures the *theme* element so our grid lines up with the checkers being borrowed. |
| `altKeyOf` | joins a ply to its `getLesson` entry on `mid` + `color`, never on SAN. |
| `enterActing` / `markActed` | `markActed` was split OUT of `enterActing` because the auto path's early press must not change the phase — `'shown'` is *the move being looked at*. `sg.pressed` / `sg.pressing` are what stop a key press opening a SECOND act on a card already answered, and `failAct` forces `'think'`, since an early press fails from `'shown'`, which nothing else moves on. |
| `serveCard` / `chaseStep` / `finishAutoCard` | the per-card work, called from `applyPlan` as well as `tick` so a card is not held back until the next 500 ms poll. `chaseStep` must *serve* before it stops. |
| `sg.plies` / `sg.cursor` / `sg.cardIdx` | our board's own walk of the plan. `sg.awaitingSince` is the watchdog stamp behind `actMaxMs`. |
| `C.paces` / `C.anims`, `paceOf` / `animMs` | the pace and glide settings tables and their lookups. Every read goes through the lookup with a fallback, never raw: a value from an older build must degrade to the default rather than put `undefined` into a `setTimeout`. |

**Section 23 in `content/lichessable.js`**, top document, gated on
`location.pathname.startsWith(CONFIG.review.pathPrefix)` evaluated per tick —
never on the load-time path (SPA activation rule).

**The board** reuses section 11c's primitives (`fillBoardGrid`,
`harvestBoardPieces`, `makeBoardPiece`, `boardVisualPos`, `boardShapeArrow`) and
the continuation board's CSS wholesale, because it *is* that board. Two
deliberate differences: `pointer-events: none` (the card is answered with two
keys, and a board that could also be clicked would be a second, undocumented way
to answer it) and an **amber** ring rather than the quiz's green, since it sits
in exactly the same place as the drill and the clickable-line quiz and never
accepts a move.

It is **not** a `cr.mode`. The continuation module's `startLine`/`step`/`tryMove`
walk a stored line; this follows the live trainer, so sharing that driver would
have meant bending it rather than reusing it. The primitives are the shared part,
which is what they were hoisted to top level for.

**The position is the trainer's own `ctx.fen`** through `readLessonLine()` —
section 18b's rule, for section 18b's reason (the board DOM can hold a stale
duplicate piece after a rolled-back wrong answer). Exact, so castling and en
passant need none of `readReviewFen`'s heuristics.

**Playing the correct move is auto-play's recipe**, plus
`autoPlayNoteTypedMove(from, to)` so the tracker files it as a human answer —
without which the move is never remembered as proven and a refused one gets no
alt check. Promotions are refused with a sentence (Chessable's picker markup is
unverified; auto-play and section 22 refuse them for the same reason).

**Interaction with the rest of the file:**

| Feature | What happens |
|---|---|
| Auto-play (13) | Held via `autoPlayHold(true)` for the duration. |
| Type a move (22) | Stands down on `showGradeActive()`. |
| Continuation / drill / analysis (18–20) | Their `continuationActive()` stops this mode. |
| Mistake log (16) | Picks up `"giveUp"` on its own cadence; renders "not known". |

**UI** — one group on the trainer row (`.clo-sg`, `order: 2`, beside the move
field, since both act on the card being answered; mistakes/practice/overstudy/
settings each shifted up one). Green outline when idle (an ordinary action,
§3.2); while running it becomes **Stop** and takes `.clo-rowprimary`, because a
mode that owns the session must not make its exit a hunt. A fourth
collapsed-mid-quiz exception was added in the established idiom —
`.clo-review--collapsed .clo-sg:has(> .clo-rowprimary)` — reading the module's
own state rather than a new flag, at (0,4,0) so it is strictly narrower than the
rule it bends.

Beside it, the **Auto** toggle (§2b) — neutral outline, shown only while the mode
is running, and it carries its own state in the class and in words in its
tooltip. Never a fill: §3.2 reserves that for the one thing to do next, and this
is a preference. Measured in the harness: it adds 41px of width and **no** row
height (38px collapsed, unchanged).

**Opt-OUT since v0.81.0** (absent = ON; only an explicit `false` is stored as
off): `cloShowGrade` in `chrome.storage.local`, options-page checkbox, watched
through `chrome.storage.onChanged`. It was opt-IN on the grounds that the mode
takes two keys off MoveTrainer2 for a whole session and answers real SRS cards —
but none of that happens until the row's own button is pressed, so the preference
only ever decides whether that button is offered. Auto-play's own key is
`cloShowGradeAutoPlay`, written by the row toggle rather than the options page —
it is a per-session working preference, not a setup decision.

## 8. Audio and blindfold (section 23b, v0.88.0)

`announce(text)` was the single place every user-visible statement passed
through, put there before there was anything to speak — and this is the update
that cashed it in. **The driver did not move.** `announce` gained two arguments
(`speech`, `isMove`), the seven callers that mention a move pass a spoken form,
and everything else here is new code beside it.

### Two settings, not one

Both in the same cog as the speeds, both `storage.local`, both opt-IN, and
deliberately **independent**:

* `cloShowGradeAudio` — the moves are read out loud.
* `cloShowGradeBlindfold` — the **pieces** come off our board.
* `cloShowGradeRate` — how fast it reads (`C.rates`, default *quick* ×1.4).

The `storage.onChanged` listener never writes back (`applyBlindfold` is the
write-free half of `setBlindfold`): Chrome fires that listener for a write of an
*unchanged* value too, so two open trainer tabs would ping-pong for ever.

### Blindfold hides the PIECES, not the board

The obvious reading — "do not draw our board" — is exactly wrong: **our board is
what covers Chessable's**, so not drawing it leaves their position on screen,
i.e. blindfold practice with the answer in front of you. So `reconcile()` is the
one place the setting changes anything (remove every piece, return), and the
board, its theme, its amber ring, the panel, the last-move tint and the arrows
all stay.

Those all say *which move was just played*, which the mode announces in words
anyway. It is the **position** that is hidden. That is also why there is no
coupling to the audio in either direction: with the panel still drawn, blindfold
works silently, with the moves read off it as text.

`announceRunUp()` — once per variation (`sg.runUpSaid`, cleared on the variation
change alongside `sg.lastMoveSpeech`) — is blindfold's one extra statement and not a nicety: a
variation usually starts several plies in, those plies are played by the
*trainer*, and nothing announces them — so a blindfold player would have no
position at all. Read once per variation, marked as a MOVE so `repeat` re-reads
the line, suppressed when the pieces are shown, and honest about a variation that
does not start from the initial position (*"From a set position"* — reading a
placement out square by square is a bigger feature).

### The engine, measured (2026-08-09, Windows Chrome, six local SAPI voices)

Web Speech API (`speechSynthesis`), never `chrome.tts` — that wants a manifest
permission, and this extension does not add those without asking.

| Measured | Consequence in the code |
|---|---|
| `getVoices()` returns **0** on the first synchronous call, 6 after ~600 ms | `pickVoice()` is lazy and caches only a non-empty answer; one resolved at init would be null for the session |
| ~200 ms `speak()` → `onstart` warm, ~580–670 ms cold | the audio trails the board by up to half a second and nothing can fix that; every announce speaks as early as it can |
| a move phrase is ~1.7 s at rate 1 | the rate is a user setting, and `afterBeat` exists |
| `cancel()` drops the queue **silently** (a queued utterance fires no event) and lets an immediately following `speak()` start normally | one-step "interrupt and say this instead" |

**A move interrupts, everything else queues.** A replay faster than speech must
not build an unbounded backlog, so each new move cancels what is left — the same
latest-wins discipline the engine and the explorer fetches use — while a statement
that is not a move queues behind whatever is being said.

### The voice says less than the panel (v0.89.0)

`announce` speaks **nothing without an explicit `speech` argument**. There is no
fallback to the written text, and that inversion is the design: the panel and the
voice want different things, and the voice wants less.

| Statement | Panel | Voice |
|---|---|---|
| `Your move` / `Your move — repeat` | yes | **no** — the board has stopped, the arrow is up, and the prompt is right there |
| your move revealed | `e6` | *"E6"* |
| the opponent's reply | `Opponent played Bc4` | *"Bishop C4"* — the prefix is two words the press itself already said |
| a repetition's second press | `Repeat — no reply follows` | *"No reply — next card"*: the one press that shows no move, so silence would read as a dead key |
| the variation ending | row status, with a count | *"Variation completed"* / *"…with mistakes"* |
| the alternatives key | the list | the list, and both failure lines — the user pressed a key to ask |

A new announce is silent until someone decides it is worth hearing.

**The verdict is Chessable's own count**, not a tally of ours:
`progress.quizIncorrectAttempts` / `quizIncorrectTotal` per ply — section 16's
field — so it includes a `timeUp`, a move failed before the mode was started, and
Chessable's own repetitions, none of which a flag set in `gradeUnknown` would know
about.

It may only be said **off a fresh plan read**, which is why `announceCompletion`
is called from `applyPlan` (below the newVariation return, so it can never
describe the *next* variation's plan — that swaps in ~90 ms early) and tick's
browse branch keeps asking for reads until it has spoken. The final card's failure
reaches the record *after* the read taken while it was still being answered, so a
cached count would say "completed" about a line that ended on a mistake.

It also writes the **row's status line**, with the number of moves missed: the
browse branch has already taken both overlays down, so without that the verdict
would exist only in the audio. Cleared at the next variation change.

A run that ends in **"Time's up"** renders no `practiceProgress` block, so
`reviewBrowseReady()` never goes true and there is no verdict — the same
browse-state gate everything else here sits behind.

**`afterBeat` holds auto-play's beats open while a sentence is still running.**
Without it the audio is useless in exactly the place it matters most (listening to
a proven prefix go past blindfold): at the fast pace the beats are 260 and 240 ms
against a phrase of over a second, and since moves interrupt you would hear one
syllable of each. It only ever *lengthens* a beat, only while the audio is on,
capped at `speechWaitMs` past the beat so a stuck engine costs one beat rather
than the replay — and it keeps `sg.autoTimer` set throughout, because that flag is
what tells `onKey` and `tick` that auto-play has claimed the card.

### `sanSpeech`

SAN is written for the eye and every part of it is a trap for a voice, so it is
parsed rather than patched: `Nxf7+` → *"Knight takes F7, check"*, `O-O-O` →
*"castles long"*, `Nbd2` → *"Knight from B to D2"* (the "to" only when
disambiguated — "takes" is already the word between the halves), `exd8=Q` →
*"Pawn E takes D8, promotes to Queen"*, named as a pawn so the sentence does not
open on a single letter.

Squares are **one uppercase token** ("F3"): a lone lower-case file letter is the
one thing an engine reliably mispronounces ("a" as the article). Pure, and
spot-checked over 28 cases by evaluating the real source out of the file — but
**pronunciation is the one thing no measurement here can check.** It needs an ear.
Anything that reads wrong is a change to that one function and nowhere else.

### `1` — "say that again"

The key that was earmarked for this. It re-reads the **last move**
(`sg.lastMoveSpeech`), not the last utterance: the most recent statement is
regularly "Your move" or an alternatives list, which nobody presses this for. At
the think stage the last move spoken is the opponent's reply that led here —
exactly the one a blindfold player loses.

Handled *before* the phase gate in `onKey` (it grades nothing and touches no
state, so it is safe even mid-act), and swallowed **only while the audio is on**:
with nothing to re-read the key is MoveTrainer2's.

### A refused utterance is not a thrown one (v0.89.1)

`speak()` returns quietly and the failure arrives on the utterance's own
`onerror`, so a `try/catch` around `speak()` — which is what v0.88.0 shipped —
catches nothing and the entire feature can be silent with an empty console.

Ground-truthed 2026-08-09 on chessable.com: in a document driven only by
synthetic clicks, every utterance came back **`not-allowed` at `error@0`**; one
real click anywhere, and the same probe read `start@168`. It is Chrome's autoplay
gate — and **not** a simple per-document activation rule, because a later document
of the same origin spoke with no gesture at all (the origin's engagement score
having risen in between). So the honest statement is: speech *may* be refused
while the page has had no real interaction.

Ordinary use never meets it, since the mode is started by a click on the row or by
a key press and both are activations. The reporting exists because the failure is
otherwise invisible: `noteSpeechError` says it once per kind, puts a sentence in
the row's status line for `not-allowed`, and a successful `onstart` clears both.
`canceled`/`interrupted` are our own doing — every move interrupts the queue — and
are never reported.

### Fails soft, everywhere

`sg.speechDead` stands the audio down for the page after one throw, with one
warning; `stop()` and `pagehide` cancel (speech outlives a page unload
otherwise); a browser with no engine says so in the status line; a SAN that will
not parse is spoken as it stands rather than dropped.

**Not spoken:** the two keys in the drill and in the clickable-line quiz. Those
are the continuation board's own panels, not this mode's `announce`.

### The cog menu, measured

In the harness: the menu is 213×144 (262×214 under `html.clo-touch`, where the
checkbox goes 13→18 px), and the three-item keys line fits one line from 372 px —
the live comment box is 506 px.

## 9. What must never happen

* A failure graded as a pass. The give-up path makes this structurally
  impossible now — nothing legal-but-wrong is ever played.
* The session left paused with our board down. `stop()` resumes the timer first,
  unconditionally, on every exit path.
* A card answered without the user grading it. `acting` is only ever entered
  from a key press.
* Auto-play injecting into a card this mode is presenting. One hold, taken in
  `startMode()` and released in `stop()`.

## 10. What is NOT built

* Media-key bindings (§5).
* A third grade.
* Reading a **placement** out (blindfold on a course that starts mid-game, §8:
  the run-up says "From a set position" instead).
* Speech in the drill and the clickable-line quiz (§8).
* A voice picker. `pickVoice()` takes the first English one it is offered;
  `CONFIG.showGrade.speechLang` is the only lever.

## 11. Confirmed working

**The press queue (§2g), v0.100.1, 2026-08-11** — confirmed by the user in a real
session driven from the ring: tapping `next` several times in quick succession
now moves the line on by that many moves instead of losing the presses to the
~950 ms an act owns. That is the whole of what the feature claims. The numbers
around it (`maxQueued`, `queueTtlMs`, the pacing at pace settings other than the
default) are argued rather than felt — see §12.9.

**The audio and blindfold, end to end (v0.89.1, 2026-08-09)** — course 453453,
`/learn/` overstudy of 70382641 plus an in-session switch to 71087636, i.e. the
routes that reschedule nothing. Driven with synthetic key events, with
`speechSynthesis.speaking` transitions recorded from the page world: the queue
state *is* visible across the world boundary, which is what makes the audio
observable at all — the utterance **text** is not, so the evidence for what was
said is one utterance of the right length in the right place.

| Checked | Result |
|---|---|
| the three new cog rows | present, and the cog's tooltip states both settings |
| `1` re-reads the last move | one 1.68 s utterance per press |
| the grade press | **exactly one** utterance, 1455 ms — the bare move ("Opponent played …" measures ~2.2 s) |
| `Your move` | **no** utterance at all, panel unchanged |
| a mistake repetition | `Repeat — no reply follows` in the panel, and it spoke |
| the verdict | `Variation completed with mistakes (2)` in the panel **and** the row status |
| …counting what? | one of those two was a `timeUp` from before the mode was started — the argument for reading Chessable's record rather than a flag of ours, confirmed by accident |
| blindfold | 0 pieces on our board over their 29, board-for-board (662,115,594 against 660,113,599) |
| the run-up | one 2.57 s utterance at a fresh variation's first card, before any press |
| auto-play + audio | one utterance per replayed move, 41–129 ms between them (`afterBeat` holding each beat for the sentence), handing back at the first unproven move |
| `stop()` | board and panel removed, timer bar visibility restored, session left running |

**Not** seen on screen: `noteSpeechError`'s own message. The `not-allowed`
refusal it exists for was reproduced once (before any real interaction with the
origin) and then could not be reproduced again — see §8.

The whole core loop, in a real review session (user-confirmed at v0.70.0): the
two-press cycle, the reveal with its glide, **the "I knew it" injection path**
(which had been the one thing everything else rested on — my page-world
reproduction of `pressSquare` had failed during the ground-truthing, and that
turned out to be an artefact of the reproduction, not of the shipped recipe),
the give-up path, the timer pause, and `giveUpButton()`'s find-by-exclusion.

**Auto-play, end to end (v0.74.0, 2026-08-04)** — course 453453, overstudy of
70382663, a variation proven earlier in the same session. All seven cards were
recognised from section 13's record, revealed, graded and played without a
press; Chessable recorded 100 % accuracy and the console shows the tracker
picking each one back up (`auto-play: recorded c7c5 (opponent replied)` …), so
the record round-trips through a real session rather than only through the
simulation. Also confirmed: with the extension reloaded — which clears
`chrome.storage.session` and therefore the proofs — every card correctly
declines with `auto-play passed on c5 — not answered correctly yet this session`.

**The browse-state advance** — `advance()` works there, via its *fallback*: the
browse state renders no `[data-testid="nextMovesButton"]`, so `nextButton()` is
null and the synthetic `n` on `document` is what moved the session on. That is
the first evidence that MoveTrainer2 *does* accept a synthetic key here, against
the §4 finding that it did not in the study state — so the answer is
state-dependent, and §12.6's doubt about section 22's `advance()` stands for the
states where a real control exists.

## 12. Still to verify live

1. ~~**Auto-play (§2b)** — that a proven card is recognised, replayed and
   graded without a press.~~ Done, v0.74.0 — see §11. What is still *not*
   observed is the **hand-back** at the first unproven move: every card of the
   test variation was proven, so the replay never had to stop mid-line.
1c. **The v0.75.0 overlap, end to end.** Syntax-checked and traced, and the
   theme copy was confirmed live (`clo-sg-board--themed`, the right image,
   `100% 100%`, squares transparent) — but the replay itself was NOT re-measured
   after the change: the test window went occluded, and `tick()` returns on
   `document.hidden`, so the mode simply stops under automation. Wanted: the
   per-card cycle (expected ~610 ms), that a card is still graded exactly once,
   the prefix log line naming the right count, that hand-back at an unproven move
   still pauses the clock, and that our grid lines up with their checkers.
1a. **A retry pass driven from the two keys (§2d)** — end to end, and in
   particular that auto-play stops at the held move rather than playing it. Also
   unverified: how section 17's **transition shield** (v0.54.0) and our board
   interact. The shield pins an overlay over Chessable's board when the target
   move is answered; our board is over the same place, and our presses are
   dispatched directly on the square elements rather than hit-tested through it,
   so it *should* be irrelevant — but that is reasoning, not an observation.
1b. **The drill's two keys (§2d)** — that the first press shows the move and the
   second marks it, and that a card answered `4` really does stay on the list.
2. **The no-flicker change (§2c)** — that the board really does stay dark across
   a variation change rather than showing the previous position, and that it
   comes back promptly rather than lingering blank.
3. **`autoRevealMs` / `autoAdvanceMs`** — 260/240 since v0.74.0, chosen against
   a measurement rather than by feel, but the *comfort* of that rhythm is still
   a judgement nobody has made in a real study session.
4. **`settleMs` / `stepMs`** — still guesses. `settleMs` now only ever runs on
   the manual path, since auto-play no longer pauses.
4a. **`pressFloorMs` (550) on the device that reported the bug.** The value is
   argued from section 13's measured ~450 ms; it has not been measured on a
   phone, and the original report's hedge — Relaxed (700 ms) "started working,
   not sure if 100%" — hints that an animation there can outlast even that.
   Wanted from a live phone session: the `holding the first press N ms — the
   board changed M ms ago` line (is M plausible, i.e. is the tracker's clock
   even live in this mode?), and whether card 0 of a variation is now replayed
   on the *fast* pace. If it still is not, the next suspect is not the floor but
   `cardIsProven` — `noteAutoSkip` names the reason in one line per card, and
   "not answered correctly yet this session" would mean proofs are not being
   recorded at all, which is a different bug in a different section.
4c. **The v0.82.0 phone fixes.** None seen in a session either; all reasoned from
   the code, syntax-checked, and `findMovePair` spot-checked against the real
   generator. What to read in a phone session, in order of what it would settle:
   `show-and-grade: variation taken over at the <press>` — if this appears at all
   on a variation the user answered perfectly last time, a press is still doing
   it and the message names which one. `auto-play: two plies in one frame —
   catching up` — the tracker really was arriving a reply late on that device, and
   the observed path was losing proofs. `auto-play: recorded <uci> (show and grade
   played it)` — the asserted proof landing where the observed one did not (it is
   only printed when the move was NOT already in the record, so it appearing at
   all is the interesting part). And, still, `show-and-grade: N of M card(s)
   proven this session` on the second variation of a session whose first was
   answered perfectly: it should name the shared prefix.
4b. **The v0.81.0 hand-over fixes, and whether they were the whole of it.**
   Answered in part: they were not — they cured a PC and left a phone exactly as
   it was, which is what v0.82.0 is. All
   three changes (the *next*-while-claimed press, `e.repeat`, and the prefix
   re-walk) are reasoned from the code and syntax-checked; none has been seen in
   a session. The discriminator is already in the console, one line per card:
   `show-and-grade: auto-play passed on <san> — you have taken this variation
   over` means a press did it (the first two fixes), `— not answered correctly
   yet this session` means the proof is not in the record (the third, or a
   recording bug in section 13), and no line at all with a replay that still does
   not happen means the card was never served. Also worth reading in the same
   session: `show-and-grade: N of M card(s) proven this session` on the second
   variation of a session whose first was answered perfectly — it should name the
   shared prefix, and if it says 0 the problem is upstream of everything here.
5. ~~**The browse-state advance.**~~ Done, v0.74.0 — see §11.
6. **Section 22's `advance()`** — the synthetic-key finding in §4 suggests it may
   not work. Worth a direct test; it is a shipped feature and unrelated to this
   one.
7. ~~**The alternatives key (§2e) — does the lesson plan carry them at all?**~~
   Answered 2026-08-05: no, and the fetch that replaces it is verified end to
   end — see §2e. What is still NOT observed: a move with **two** alternatives
   drawing two arrows (the test card had one; confirming a second would have
   meant grading a real review card, which the mapping does not justify — the
   `mid`+colour join and the 7-on-6 count are both verified), and the wording
   with the course setting **on**, which no course tested has.
9. **The press queue (§2g)** — the core loop is **user-confirmed working**
   (2026-08-11, v0.100.1: *"the queueing works pretty good"*), in a real session
   with the ring. What that does NOT cover, none of it measured by anyone:
   * whether `maxQueued` (8) and `queueTtlMs` (3 s) are the right numbers. Both
     were argued, neither was felt. The TTL in particular has never been *seen*
     firing — a press stranded by an act that did not land.
   * that **over-tapping at the end of a variation** drops the surplus rather
     than advancing — simulated (case 5), and the one rule here whose failure
     would be quiet and would answer cards in a line the user had not seen.
   * that the drain is visibly paced (no two moves in one frame) at every one of
     the four `paces`, not just the default.
   * what the ring's ~200 ms floor does to the ceiling: how many deliberate taps
     actually arrive before the hardware starts dropping them, which is the real
     bound on "progress N moves" regardless of `maxQueued`.
8. **Mistake repetitions (§2f) — the whole premise.** `isRepeat()` assumes the
   repetition runs on the SAME lesson plan, with the trainer's own `fen` back on
   the failed ply's `sourceFen`, so `anchor()` lands on a card our board has
   already walked past. Nothing about that was observed: Claude in Chrome was not
   connected when it was written, and it is reasoned from `progress`'s own
   `isQuizCurrentlyInRetry` / `maxRetry` fields (DESIGN-retry-mistakes.md §2.1)
   existing per ply of that plan. One console line settles it — `show-and-grade:
   repeat of <san> — no reply to show`, printed once per repetition. If it never
   appears while a repetition is on screen, the repetition is not anchoring back
   onto the same plies, and the next thing to read is what `readLessonLine()`
   actually returns in that state (`plies.length`, whether the card ply has a
   following ply, and `progress.isQuizCurrentlyInRetry` — which
   `content/pagestate.js` does NOT currently copy out). If it appears on an
   ORDINARY card, `sg.reached` is being left high by something other than a real
   walk and `unwalkCard()` is the place to look.
