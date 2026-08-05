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
chase too: 1320 ms → 770 ms from grade to next card.

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
- **The prefix is decided once**, when the plan first lands. Both inputs are in
  memory and neither moves under us — the record only ever gains moves we are
  about to play ourselves, never a card still ahead. Asking card by card made the
  first card of every variation wait on a read it could have had already, which
  is the run reported as shakiest.
- **The chase adapts** to what a read costs on the device, and must *serve*
  before it stops: the plan now regularly lands while our board is still in
  'shown', where applyPlan cannot serve, and returning without serving hands the
  card back to the 500 ms poll.

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

Its colour is the **ring's amber**, read off `--clo-attention` rather than
repeated in JS: one colour, one idea. It was the quiz board's green until
v0.77.0, which on Chessable's own green board image has the same lack of edge
that made the 2px green ring unreadable. The four `SHAPE_COLOR_HEX` values are
*Chessable's* annotation colours and mean other things on a board the user also
annotates, so they are only the fallback.

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
| Keys | `2` / `4`. Media keys deferred until a real ring is captured. |

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
next:   ['2'],   // → ['2', 'MediaTrackNext']
wrong:  ['4'],   // → ['4', 'MediaTrackPrevious']
repeat: [],      // → ['1', 'MediaPlayPause'] when TTS lands
```

Matched on `e.key`, swallowed on `document` in **capture** phase while the mode
is active — section 18's discipline, and for its reason: MoveTrainer2 binds
single-key shortcuts on `document` and does not skip focused controls. Only our
own two keys are swallowed; everything else still reaches the trainer, and a
press inside an `input`/`textarea`/contenteditable is ignored outright.

Section 22 (type a move) stands down entirely while this mode runs, through the
new `showGradeActive` bridge. Two things holding the keyboard over one quiz
board is not a state either of them can reason about.

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

Opt-IN, `cloShowGrade` in `chrome.storage.local`, options-page checkbox, watched
through `chrome.storage.onChanged`. Auto-play's own key is
`cloShowGradeAutoPlay`, written by the row toggle rather than the options page —
it is a per-session working preference, not a setup decision.

## 8. Blindfold-ready

`announce(text)` is the single place every user-visible statement passes through,
and `CONFIG.showGrade.showBoard` (default true) is the flag that stops anything
being drawn. A TTS build is a body for `announce` and `showBoard: false`. In
place before there is anything to speak, deliberately: retrofitting it once the
drawing calls are scattered through the driver is the expensive version.

The `repeat` key is reserved and does nothing while `announce` only writes to
the panel.

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

* Media-key bindings (§5) and TTS (§8).
* A third grade.
* A `showBoard` UI control — the flag exists, nothing sets it to false.

## 11. Confirmed working

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
5. ~~**The browse-state advance.**~~ Done, v0.74.0 — see §11.
6. **Section 22's `advance()`** — the synthetic-key finding in §4 suggests it may
   not work. Worth a direct test; it is a shipped feature and unrelated to this
   one.
