# DESIGN — the key-move lead-in (section 23c)

Status: **built (v0.114.0) and run live**, except with show-and-grade itself
running — §9 is what a real session showed and §10 is what still needs a human.
Lives inside section 23's module (`initShowGrade`); §4 is the argument for that
home and is the one structural decision here.

---

## 1. What it is

Under Chessable's **Study: Key Moves** setting the trainer plays the whole
non-key prefix ITSELF at variation load and quizzes only from the first key move
on. That is the mode's value and also its cost: **you arrive at a position with
no memory of how you got there**, and the first thing asked of you is a move in a
position you have not oriented yourself in.

So: replay those plies on our own board, at a pace a human can follow, with
Chessable's board covered, and hand over standing on the card the trainer is
asking.

Two properties make it cheap and safe, and everything else follows from them:

* **It is a DISPLAY.** Nothing is played on Chessable's board, nothing is
  graded, recorded or rescheduled. Its one side effect is stopping the clock
  (§3.3). It cannot cost the user a card, because it never touches one.
* **It is not a quiz and must never look like one.** The user is being shown
  something, not asked. That is why it uncovers by itself rather than waiting for
  a press.

Opt-IN: `cloKeyLeadIn`, with `cloKeyLeadInSpeed`, both in section 23's cog.

---

## 2. THE GATE — one comparison on the lesson plan

**Ground truth, live 2026-08-19, course 453453, confirmed three times and in both
directions on the same variation.**

Under Study: Key Moves, **Chessable itself clears `isUserMove` on every ply
before the first key move — including plies of the user's own colour.** The same
variation (70382668) read twice with nothing changed but the Study dropdown
(`*` = `isUserMove`, `!` = `isKey`):

```
Key Moves   0e4  1c5   2Nf3  3Nc6  4Bb5! 5*d5! 6exd5! 7*Qxd5! …   firstUserPly 5
All Moves   0e4  1*c5  2Nf3  3*Nc6 4Bb5  5*d5  6exd5  7*Qxd5  …   firstUserPly 1
```

So the gate is: **a ply of the study colour sitting before the first `isUserMove`
ply** (`leadPrefixOf`, which reads the colour off the first user ply itself and
needs nothing from the DOM). `k` is then simply `firstUserPly`.

Why this is strictly better than anything else proposed:

* it is known **at plan-read time**, before anything animates;
* it is true of the **session as run**, not of the course as configured;
* in an All Moves session it is false on every variation **for ever**, which
  closes §7.1's dangerous direction by construction.

**Three dead ends, all checked — do not look again:**

| Candidate | Verdict |
| --- | --- |
| a settings key beside `eq_<bid>_<colour>_alternative` | **does not exist.** `simpleSettingsApiData` is byte-identical between the two modes apart from `last_oid`. `eq_453453_key: "1"` is present in **both** — it means the course HAS key moves built (Owner Options → "Build Key Moves"), not that this session uses them. |
| `isKey` on the plies | identical in both modes. It is a course-level designation and **can never be the test**. |
| observing the handover (`firstCard > firstUserPly`) | **cannot ever be true**, in either mode: Chessable has taken the prefix plies out of `isUserMove` before we see the plan, so the first card IS the first user ply. Observed `trainerAtPly === firstUserPly` in every reading taken. |

**Key moves are always a SUFFIX.** Read off `GET /api/v1/getList?uid&bid=453453`
(`moves[].isKey`): of **80 variations, 0** have a non-key move after a key one.
76 are all-key; 4 carry a non-key prefix — 70382668, 70382663, 70382657, 70382659.
So `k` is a genuine prefix boundary and the loop never has to deal with a
trainer-played move in the MIDDLE of a line. One course is evidence and not
proof, but it matches the mode's semantics (`isLimitedByDepth` sits beside
`isKey` on the same payload).

---

## 3. The loop

```
variation loads, gate says k > 0
  |- cover: our board on the variation's START position
  |- replay plies 0 … k-1 at our own pace
  |     …meanwhile, underneath and untouched:
  |       Chessable plays its own non-key prefix
  |       section 13 answers whatever cards it can, exactly as it always does
  |- keep going while the trainer is further on than we are (§3.1)
  |- hand over when we have caught up AND the trainer is at k
```

### 3.1 The ceiling is an OBSERVATION, never a prediction

`leadCeiling() = max(k, target)`, where `target` is the furthest the trainer has
been **seen** to reach (`leadTrainerIdx()` — the plan's own `sourceFen` located
against `ctx.fen`; monotone, so a repetition cannot lower it).

The obvious design, and the one this replaced, is to replay to `k'` — the first
card auto-play may not take, from section 13's proof record. **That is a spoiler
waiting to happen.** The record says which cards section 13 *could* replay, not
which it *will*: it declines for reasons the record cannot see (its own toggle
off, `handedOver`, a retry-pass hold, an injection swallowed by an animation).
Every one of those leaves the same wreckage — our board has shown the user the
moves for cards `k … k'-1`, we uncover, and the trainer asks for those very
cards, which they then "answer" from a display. §7.4 forbids this feature
affecting a card, and a shown answer is exactly that at one remove.

Observing costs nothing and cannot be wrong: **every ply replayed is one the
trainer has already played** — part of the non-key prefix, which is never a card,
or a card section 13 has already answered underneath. The parallelism is intact
and now free.

### 3.2 The hand-over

`idx >= ceiling` **and** `target >= k`. The second half matters: uncovering while
the trainer is still animating its own prefix shows the user the tail of the
thing this exists to cover. If the trainer never arrives, `leadWaitMs` (3 s) ends
the wait with one line naming both positions — §7.5's rule, and the whole of it.

**Two endings**, which is what §4 rests on:

* show-and-grade **off** — the board comes down, and Chessable's underneath is
  showing the same position, so the swap reads as one continuous board;
* show-and-grade **on** — there is no uncover at all. The same board stops
  replaying and starts asking: `endLead` clears `sg.cardIdx` and re-`anchor()`s,
  which is the same path a variation change already takes.

### 3.3 The clock

The trainer's per-move timer is running on whatever card it is standing on, and
the pause is **observed rather than assumed**: while its own fen is still
changing it is being answered, and when it has sat on one position for
`leadPauseAfterMs` (1.5 s) it is waiting for a user who cannot see the board.

A blanket pause for the whole lead-in would be simpler and is **wrong**: a paused
board takes no input, so section 13 could not inject the cards it is answering
underneath, and the parallel loop above would quietly collapse into a sequential
one — the same moves twice, with nothing anywhere to say why.

Never in a hidden tab: pausing is this feature's one side effect, and a
background overstudy tab is paused by section 9 already.

### 3.4 It fails open, always

`leadMaxMs` (45 s) is the watchdog; `endLead` resumes the timer first and is
called from `stop()`, `startMode()`, `pagehide`, a variation change, a
stand-down, an unresolvable SAN and an unreadable start position. **Covered is
the worse state** — the user looking at a board that is no longer about anything,
over a card they cannot see. Never correct the trainer, never inject, never
re-derive: a display that is wrong gets out of the way.

---

## 4. Where it lives: section 23's board

**It renders on `SG_BOARD_ID` and therefore lives inside section 23's module.**
The feature has two situations that pull in opposite directions:

* show-and-grade **off** — raise a board, replay, hand the screen back;
* show-and-grade **on** — there is nothing to hand back to. That mode already
  owns the board for the whole variation, so this is a *prelude* to it and the
  transition is no transition at all.

A board of our own (a fourth `cr.mode` on section 18's overlays) gets the first
right and the second badly wrong: two of our boards over one of theirs, with a
swap at exactly the moment the feature exists to make smooth. **If the coupling
ever gets worse, hoist section 23's board layer out — do not move the lead-in.**

It did not get worse. Measured against the source and confirmed by the build: the
coupling is in the LIFECYCLE, not the board layer. `buildBoard`, `buildGrid`,
`setBoardVisible`, `hideBoard`, `positionBoard`, `applyBoardTheme`, `reconcile`,
`render` and `paintSquares` read neither `sg.active` nor `sg.phase`. What it cost:

* `sg.lead` plus a `leadTick()` where `tick()` returns on `!sg.active`;
* `playPlyOnBoard`'s one line becoming `sg.active || leadActive()` — without it
  the post-glide reconcile never runs with the mode off, so a castling rook, an
  en passant capture or a promotion stays as the glide left it;
* `anchor()` returning early while a lead-in runs (it would drag the board onto
  the card, which is the one thing the replay exists to postpone);
* `stop()` and `startMode()` ending a lead-in first, `stop()` **above** its
  `!sg.active` early return — with the mode off the lead-in owns the board AND
  the pause, and `endLead` is the only thing that gives either back;
* a controls row on the panel.

**`sg.phase` gains nothing.** The lead-in is `sg.lead.active`, checked by `tick()`
before it enters the phase machine at all — not a `'lead'` phase and not a flag
beside `'think'`. `sg.phase` is the state of a CARD being answered and every one
of its values is about a press on that card; the lead-in is about no card. A
phase would have put a clause in `doNext`, `serveCard`, `maintainPause`,
`syncPanel` and both watchdogs.

---

## 5. Settings, UI, keys

**The two settings live in section 23's cog**, not auto-play's. `leadWatching()`
requires `sg.enabled`, so behind section 13's cog they would be reachable, and
settable, in states where they do nothing.

**The consequence is a real constraint: turning show-and-grade off in the options
turns the lead-in off with it.** It renders on that board, in that panel, behind
that cog, and `syncUi` hides the whole `.clo-sg` group when the preference is
off. `cloShowGrade` is opt-OUT (absent = on), so this costs nothing to anyone who
has not deliberately switched the mode off — and someone who has, has said they
do not want that board. If it ever needs undoing, the change is an options-page
checkbox for `cloKeyLeadIn` plus dropping `sg.enabled` from `leadWatching`, not a
second home for the cog.

**The keys are show-and-grade's own**, rather than a second vocabulary for a mode
driven from a four-button ring: `next` steps forward (and at the end hands over,
which is what the press means there anyway), `alts` (space) steps back, `wrong`
skips. Any of the three also stops the replay running ITSELF — a user who has
reached for a key is driving, and a board that keeps moving under them is the
thing they reached for the key to stop.

**Buttons `‹` / `›` / Skip on our own panel**, neutral outline. Nothing here is
"the one thing to do next", the replay already is, and nothing goes on the
trainer row: under DESIGN-ui-inventory §3 this feature has no control that acts
on the session.

**The panel prints no moves.** It grew a move list as the replay went, and that
was reported as distracting — the moves are on the board beside it, which is the
whole feature, so the line was the same fact twice, one of them reflowing every
few hundred ms. The title says what the panel is; the counter in the keys line
says where in the run-up you are, and it changes by one character. **The voice is
unchanged**: `leadStep` calls `speak` directly rather than through `announce`,
which is the seam that also writes the panel, so section 23b's setting still
decides whether the moves are read out.

**Blindfold suppresses it entirely** — a blindfold session that opens by showing
you the position it starts from defeats itself.

**An identical prefix is not replayed twice running** (`sg.leadLastSig`, the
prefix's own SAN string). Courses in key-moves mode share prefixes constantly,
and watching the same six plies ten times running is its own disorientation. A
*changed* prefix is replayed, however small the change. Per DOCUMENT, so it
covers a session and not a navigation.

---

## 6. Timing: the cover is raised off a MUTATION, not off the poll

Reported from a real session: **the next variation's first card flashed on
Chessable's board before our board covered it.**

The arithmetic, and it is not close:

| clock | value | where |
| --- | --- | --- |
| their board's first mutation after the plan swaps | **81 ms** | live, measured |
| `ctx.fen` first names a user ply | 140 ms | live, measured (an all-key variation; a key-prefix one is strictly later) |
| section 23's tick, and every other trainer module's | 500 ms | `pollMs` |
| a plan read, as the module itself estimates it | 110–400 ms | `chaseMs` … `chaseMaxIntervalMs` |

A variation change is noticed on a tick, which then STARTS an async read; the
answer lands on a later turn of the event loop. So the honest figure off the poll
is *(0…500) + read* against an 81 ms deadline — **not fixable by turning the poll
down**, since the read's own round trip is already over it.

So the page asks for the read instead: a `MutationObserver` on three things, all
of which change at React-render speed.

* **`SELECTORS.trainerRow`** — the one that has to work. A variation change may
  REPLACE the board element outright, and an observer left on the old one is
  silent rather than wrong, which is the worst way for the flash to come back.
  Its subtree covers the board being rebuilt AND the completed variation's
  comment column being torn down.
* the trainer **board** (narrower, and its piece transforms are attribute
  changes, so `attributes: true` is wanted here and nowhere else);
* the **drawer row** holding `#currentStudyingVariation` (the marker leaving it).

**Armed only around the transition** — while `reviewBrowseReady()` and
`leadArmTailMs` (2.5 s) after — and rate-limited to `leadNudgeMs` (120 ms).
Mid-quiz their board mutates on every move and none of it can be a variation
change, so nothing is asked; one animation run costs one read. Verified live:
hammering their board with mutations mid-quiz changed the plan-read rate not at
all (5.19/s → 5.0/s, baseline either way).

**What was NOT built, and why it is worse.** A session latch plus a pre-emptive
blank cover raised before the plan is read: 76 of course 453453's 80 variations
are all-key, so that flashes a dark board on nearly every variation to save a
flash on four. The only version worth building is one that knows the gate IN
ADVANCE — a course-level `oid → prefix length` index off `getList`, which also
carries `initialFEN` and the SAN list, so the replay could start before the plan
read lands at all. That is real work and its value is unknown until this fix has
been lived with.

---

## 7. What must never happen

1. **It must never fire in an All Moves session.** It would cover a live card.
   §2's gate is the whole of this, and it cannot be wrong in that direction.
2. **It must never leave the session paused.** §3.4.
3. **It must never play a move on Chessable's board.** Not the prefix, not a
   card, not a "correction". If the trainer is somewhere our board is not, the
   answer is to uncover.
4. **It must never grade, record or reschedule anything.** No proof is written
   from a replayed move: nothing was answered. (Section 13's record can only be
   written through `autoPlayNoteProvenMove`, whose contract is that the caller
   knows the move was *right and played*; a shown move is neither.) §3.1 is this
   rule reaching one step further, to a move merely SHOWN.
5. **It must never delay the first card the user has to answer.** The uncover
   waits for the trainer, never the other way round.

**Section 13 is deliberately NOT held.** `autoPlayHold` means "an outside feature
owns the board and nothing is really being played on it", and here something
really is — that is the whole loop. Do not reach for it.

**Everything else stands down**, through the null-safe `keyLeadInActive` bridge:
section 22 (a move typed into a board the user cannot see), 18b's heads-up and
16c's pin prompt (both would draw over the replay; both HIDE rather than
dismiss), and the continuation module's own space listener — which stands down
for `showGradeActive()` already, for the same reason and with the same
registration-order argument, space being this feature's BACK key. Sections
18/19/20 cannot be up at the same time: whichever is already active wins and the
lead-in simply does not fire.

---

## 8. Rejected — do not re-propose

* **A fourth `cr.mode` on section 18's overlays** — §4.
* **Predicting `k'` from the proof record** — §3.1. It is the same number when
  everything goes right and a spoiler when it does not.
* **Holding section 13 off for the whole lead-in** — the sequential version.
  Simpler, and it shows the user the same moves twice: once on our board, then
  again on theirs.
* **Driving Chessable's board through the prefix ourselves** — pointless (the
  trainer already plays it) and it would put an injection where none is needed.
* **Waiting for a press to uncover** — makes a display into a quiz.
* **Blocking Chessable's own prefix auto-play** — not ours to stop, and not
  necessary: covering it is the entire trick.
* **A "show me the lead-up again" control mid-quiz** — deferred, not rejected.
  It is the expensive one (covering a live card, i.e. 18b's "Review now"
  hazards) and nothing else depends on it.

---

## 9. GROUND TRUTH — the build, live (2026-08-19, course 453453, `/learn/`)

Claude in Chrome, three variations with a non-key prefix, Study flipped to Key
Moves Only for the run and back to All Moves after. **The driven tab reports
`document.hidden` throughout**, which decides what could and could not be seen.

| what | reading |
| --- | --- |
| the gate firing | `key-move lead-in: replaying 5 ply/plies the trainer played for you — e4 c5 Nf3 Nc6 Bb5`; also `3 … e4 c5 Nc3` and `5 … e4 c5 Bc4 e6 Nf3` |
| how soon, off a page load | `show-and-grade watcher active` 13:15:49 → `replaying 3 ply/plies` 13:15:50 |
| our board | `[700, 115]` 521 px against their theme element's `[698, 113]` 525 px — pinned to the pixel, 32 pieces cloned |
| the panel | title *The moves that led here*, prompt empty, keys *2 — next move · 3 / Space — back · 4 — skip (2 of 3)*, `‹` disabled at 0 |
| the hand-over (mode OFF) | board REMOVED, trainer standing on ply 3 — exactly where our replay ended |
| **the parallelism** | `auto-play: observed b1c3 (opponent)` logged **while our board was up**: their prefix was still animating under the cover and section 13's tracker kept reading it |
| the keys | `2` forward, `3` back (2 → 1), `4` skips; and after a press the replay does **not** advance on its own 1.5 s later — the manual latch holds |
| **the negative** | Study back to All Moves, same variation, our board never appeared across ~5 s of sampling and no log line |

**One artefact, not a defect:** a hidden tab clamps `setTimeout` to ~1 s, so the
520 ms Normal preset measured ~1 s a ply. A visible tab is not clamped. (The
replay has its own timer for exactly this reason — paced off the 500 ms poll,
every preset would round up to a whole multiple of it.)

---

## 10. Still open

`tick()` returns on `document.hidden` **before** `refreshPlan()`, and a driven
tab is always hidden (sampled ten times over four seconds after a `navigate`:
`hidden` every time). So with the mode RUNNING it never reads a plan and never
serves a card — the first three below need a visible tab, i.e. a human.

1. **The hand-over with show-and-grade running** (§3.2). The flagship case, and
   the only path through `endLead`'s `anchor()` arm. Read `key-move lead-in: the
   run-up is done` and then check the board is STILL up and showing the card.
2. **The clock** (§3.3). That `pauseTrainerTimer` behaves this early in a
   variation and that the resume puts the card back as it was. Our pause is gated
   on `!document.hidden`, so it is unreachable under automation by construction.
3. **The identical-prefix rule** (§5). Needs two variations sharing a run-up
   inside ONE session — `sg.leadLastSig` is per document, so navigating between
   variations cannot show it.
4. **Section 13 actually INJECTING under the cover.** §9 saw its tracker READ the
   board there, which is the harder half; nothing was proven in a fresh session
   so no injection was due. Wanted: a second pass over an answered variation.
5. **A key-moves variation entered by a mistake repetition.** `k` is meaningless
   there; the expectation is that `leadPrefixOf` still answers from the plan and
   the monotone `target` keeps the replay from following the trainer backwards.
6. **How much of their prefix still leaks past** after §6's fix — the number that
   decides whether §6's `getList` index is worth building.
