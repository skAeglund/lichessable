# DESIGN — Pinned mistakes (a mistake that outlives its session)

Status: **built in v0.103.0 — phases 1-3 of §6 — and extended in v0.104.0 with
two surfaces the design did not have (§8): the offer made right after a mistake,
and a launcher that works on any page.** Section 16b is the store, the
steps and the credit; the pin toggle and the Pinned group are in section 17's
popup; "Drill pinned (N)" and `reviewRowPrimary()`'s `'pinned'` role are in
section 20's cluster. **Phase 4 (§3.7, a clean answer in a real quiz counting
as a step) is deliberately NOT built** — see §7, which also records the hazard
found while building the rest that §5.2 did not anticipate.

**Not verified live.** Everything below the §5.1 measurement is from a source
reading plus the harness; no trainer session has run against this build. What
that leaves open is in §7.

The design proper (§1-§6) is left as it was written on 2026-08-12, against
v0.102.0, from a source reading only. §7 is what building it changed.

The feature is a fourth consumer of the section 16 mistake log and a fourth
mode-of-use of section 20's drill. It adds no new board, no new write to
Chessable, and no navigation.

---

## 1. What the user asked for

> The ability to mark a mistake as important and make it survive multiple
> sessions. If the user marks a mistake as important, it would come up in future
> session's "Drill mistake" and retry. We could set a condition, for example that
> the user have to guess correct three times in a row for it to go away.

Refined over two follow-ups:

* "three in a row" means three correct answers **in three different sittings**,
  not three passes through one queue; a wrong answer costs you progress.
* the gaps should **grow from something short** — "30min -> 4h -> 24h", Anki's
  learning-steps shape, because a quick first retry is valuable.
* it should be possible to retire a pin **before the variation's own next
  scheduled review** comes round.
* a third launcher, "Drill important mistakes", which also **acts as the
  notification** that one or more is due.

---

## 2. Findings (source reading, 2026-08-12)

### 2.1 A drill card is already fully described by a stored log entry

`ingest` writes each failed move with `sourceFen`, `san`, `color`, `lead`,
`num`, `title`, `chapter`, `oid`, `lid`, `mid`, `mkey`
([lichessable.js:12441](content/lichessable.js:12441)), and section 20's
`drillLine`/`drillPlies` build a card from exactly those, re-walking the SANs
with `sanToUci` + `fenAfterUci` and reading nothing live.

So **a mistake from three weeks ago is already a playable card.** No new capture
is needed, and — this is the part that makes persistence safe at all — the drill
navigates nothing, never touches Chessable's board, and reschedules nothing.
Whatever a pinned card does, it cannot cost the user SRS scheduling.

### 2.2 The flag cannot live on the log entry

The log is `chrome.storage.session` with a 12 h TTL, and `saveLog` prunes every
course's expired entries on every write
([lichessable.js:12358](content/lichessable.js:12358)). A pin stored there dies
with the thing it is pinning, usually overnight.

Nor may the log itself move to `storage.local` — CLAUDE.md's standing rule, and
it is right: the log is populated **automatically**, and a stale automatic list
drills moves the user never chose.

A pinned list is the opposite kind of object: **explicitly chosen, one move at a
time.** That is the whole difference, and it is what makes `storage.local` correct
here and wrong there. Worth writing down, because the two decisions look
contradictory from a distance and the next reader will try to reconcile them.

### 2.3 The retry runner would work across sessions — but must not grant credit

`navigateToItem` reaches a variation by building `/learn/<bid>/<oid>/<lid>` from
the entry's own fields
([lichessable.js:13015](content/lichessable.js:13015)) — no drawer lookup, no
session context. So a pin from another day is mechanically reachable by Retry.

It should still not **score** one:

* Retry walks whole variations. Whether the pinned move specifically was
  answered clean is derivable from `passedPly`, but muddier than the drill's own
  `!cr.attempts && !cr.hint`.
* Two credit sources let the gap be farmed by alternating them.

Retry may show pinned variations later if that turns out to be wanted. Only the
drill advances a streak.

### 2.4 No next-review date is readable today

`trimProgress` copies six fields one by one — `finished`, `quizTotal`,
`quizCorrectTotal`, `quizIncorrectTotal`, `quizIncorrectAttempts`, `softFail`
([pagestate.js:89](content/pagestate.js:89)) — and that narrowness is deliberate:
the trainer context "holds far more of the user's progress data than any
consumer has a use for". Nothing else we read (`getList`, `getHomeData`) is known
to carry scheduling either.

So "retire before the next scheduled review" **cannot be enforced** without
widening a read that file exists to keep narrow. It is instead a target the
numbers satisfy: see §3.2, and §3.7 for the better answer to the case where the
review lands first anyway.

### 2.5 The row already has a "there is something to do next" mechanism

`reviewRowPrimary()` returns a role — `'stop' | 'queue' | 'clickables' |
'retry' | null` — and each module applies `.clo-rowprimary` in its own `sync*`
([lichessable.js:4669](content/lichessable.js:4669)).

This matters because the obvious design for "a button that tells you something
is due" is **forbidden** by the row's colour rules: *amber outline means "you
have N outstanding items" and NEVER launches anything*. A control that both
announces a count and launches cannot be amber — both drill buttons already
moved off amber for exactly this reason. The primary fill is the mechanism that
already exists for the notification job.

---

## 3. Design

### 3.1 The store

`chrome.storage.local`, key `cloPinnedMistakes`:

```
{ [bid]: { "<oid>:<mkey>": {
    oid, lid, mid, mkey,          // identity
    san, color, sourceFen, lead,  // everything drillLine needs
    num, title, chapter,          // everything the list needs to name it
    streak,                       // 0..pinSteps.length
    lastSeenAt,                   // any drill encounter, pass or fail
    pinnedAt,
} } }
```

**Self-contained, never a reference into the log.** That is the point: it must
produce a card in a session where the log is empty, which is every session after
the first.

No TTL — the user chose these. A cap instead (`pinMaxPerCourse`, say 200), oldest
`pinnedAt` dropped, with one console line. Local survives an extension reload but
not an extension removal; that is accepted (see §5).

### 3.2 The steps

```js
CONFIG.retry.pinKey   = 'cloPinnedMistakes';
CONFIG.retry.pinSteps = [30 * 60e3, 4 * 3600e3, 24 * 3600e3];  // gap = pinSteps[streak]
```

`pinStreakTarget` is `pinSteps.length`, derived rather than declared, so the two
cannot disagree.

`lastSeenAt` is stamped **at pin time** — the failure that created the pin is
encounter zero. So the chain is:

| streak | waits | then |
| --- | --- | --- |
| 0 | 30 min from the failure | first drill |
| 1 | 4 h | second |
| 2 | 24 h | third, then retired (record deleted) |

Minimum ~28.5 h, three clean answers, three sittings. **The 4 h step is what
makes it three sittings** — the chain cannot complete in one, whatever the user
does, which is the failure mode a flat short gap would have had.

A miss anywhere sets `streak = 0`: back to the 30-minute step, Anki's lapse
behaviour. This is also why the short first step matters beyond "a quick first
retry" — a *failed* pin comes back in half an hour rather than being pushed a day
out, which a single long gap would have done.

Growing steps do not conflict with Chessable's own scheduling: nothing here is
rescheduled, nothing is written back, and the whole chain is shorter than any
real next-review interval except a same-day re-quiz.

### 3.3 What earns a credit

The hook is one branch in `finishDrillCard`
([lichessable.js:18017](content/lichessable.js:18017)), which already computes
`clean` as `!cr.attempts && !cr.hint`:

```
clean, gap elapsed     =>  streak++, lastSeenAt = now
clean, inside the gap  =>  lastSeenAt = now   (no credit)
not clean              =>  streak = 0, lastSeenAt = now
streak >= steps.length =>  unpin (delete the record)
```

The gap is checked **before** the stamp, so a card that was auto-queued always
credits, and a card drilled on request inside its window runs normally and
simply advances nothing.

`finishDrillCard` already accepts show-and-grade's `cleanOverride` (section 23:
the user *says* whether they knew it). **Accept it for pin credit too.** A
self-report is softer evidence than a demonstrated move, but refusing it would
make section 23 unable to advance a pin at all, which is the worse outcome for a
mode whose entire purpose is a session played without moving a piece.

### 3.4 Seeding the queue, and dedupe

The launcher queues pinned records for the current `bid` whose gap has elapsed.
A pin inside its window is **not** auto-queued but **is** drillable on request
via the popup's existing "Drill selected" (the `continuationDrill` bridge already
takes an explicit selection). The gap governs *scheduling and credit*, never
*availability* — a feature whose premise is "I want to see this move" must never
refuse to show it.

A pin that was also failed in the current session exists in both lists. Dedupe on
`oid:mkey` when seeding and keep the **session** entry — it carries the fresh
`wrong` data the popup shows — and let its answer credit the pin.

`markDone`/`retried` ([lichessable.js:12561](content/lichessable.js:12561)) is
unchanged and stays session-scoped. Pinned-ness is a separate axis; the two lists
must not try to represent each other.

### 3.5 The launcher, and the notification

A third launcher on the section-18 cluster, **green outline** like its siblings
(§2.5), label carrying the count: `Drill pinned (2)`.

The notification is `reviewRowPrimary()`, with `'pinned'` added **last**:

```js
    const pending = (mistakeLogApi && mistakeLogApi.pending()) || [];
    if (pending.length) return 'retry';
    if (pinApi && pinApi.due().length) return 'pinned';
    return null;
```

Below `'retry'` on purpose: a move failed **today** outranks a pin that has been
waiting four hours. When pins come due and nothing else is outstanding, the
button fills green — "there is something to do next", said in the vocabulary the
row already has, with no sixth colour invented. Pins falling due mid-session need
nothing extra: the row recomputes every tick and the gap check is a timestamp
compare.

Two limits to state rather than paper over:

* **Course-scoped and browse-state only.** The row needs a `bid` and the drill
  needs the browse state, so you learn about pins in course A only while
  studying course A, between variations. There is no background surface to put a
  notification on and none should be invented.
* **This makes a fourth launcher on that cluster.** The browse row was
  ground-truthed at 473x38 with exactly one filled control. Measure in
  `dev/harness.html` before committing (§5).

### 3.6 Where the pin toggle lives

On the mistake popup's per-entry row, beside the move and the wrong label
([lichessable.js:13587](content/lichessable.js:13587)) — the only place an entry
is listed individually. Not the trainer row: pinning is per-move, and that row is
per-session.

The popup grows a **Pinned** group above the chapter groups, listing every pin
for the course with its streak and its next-due time, each row unpinnable in one
click. That list is also the answer to course drift (§4).

### 3.7 Phase two — a clean answer in a REAL quiz counts as a step

The case §2.4 could not enforce has a better answer than racing it: if the
variation comes up for genuine review before the pin retires and the user
answers the pinned move clean, **that satisfies a step.** It is the strongest
evidence available — real card, real SRS context, no run-up and no scaffolding —
and it turns the scheduling conflict into the feature working *with* Chessable
instead of ahead of it.

It is nearly free to detect: the log already samples `progress` every 500 ms, and
`passedPly` ([lichessable.js:12663](content/lichessable.js:12663)) already answers
"the trainer has moved past this ply". A clean answer is `quizIncorrectAttempts`
still empty at the moment `passedPly` goes true.

The same gap check applies — a card re-quizzed five minutes after pinning must
not credit. Build it second; the feature is complete and useful without it.

---

## 4. What must never happen

* **The pin is never a flag on a log entry** (§2.2). It dies with the TTL.
* **The log itself never moves to `storage.local`.** The exemption argued here is
  for an explicitly chosen list, and does not generalise.
* **No amber on a launching control** (§2.5). The count goes in the label; the
  urgency goes through `reviewRowPrimary()`.
* **Nothing is rescheduled and Chessable's board is never touched.** Section 20's
  guarantees are what make a persistent list safe; a pinned card that acquired
  either would be a different and much more dangerous feature.
* **The gap never blocks a requested drill** (§3.4).
* **A pin must be droppable in one click.** A pin stores `oid` + `sourceFen` +
  `san` and never re-reads the course, while this extension itself makes editing
  variations easy (sections 12, 19c, 19d). An edited line leaves a pin quizzing a
  move the course no longer plays, indefinitely and silently. `drillLine` already
  refuses cards whose SAN will not resolve, which catches *illegal* but not
  *changed*. The mitigation is the visible list in §3.6, not cleverness.

---

## 5. Open questions

1. **Row width.** Does a fourth launcher wrap the browse row at 473 px, and under
   `html.clo-touch`? Measurable in `dev/harness.html` with no live session. If it
   wraps, the fallback is not obvious — folding pins into the existing drill count
   muddies a number that currently means exactly "failed this session".
2. **Is §3.7's real-quiz credit reliably detectable**, or does the sample race the
   trainer's own write to `progress`? Needs a live session.
3. **Cap and pruning.** Is 200/course right, and should a retired pin leave any
   trace (so re-pinning is one click and the user can see it worked), or vanish?
4. **Backup.** This would be the first store in the extension whose loss the user
   would feel — everything else in `storage.local` is a scalar preference. An
   export is probably over-engineering for a solo project, but it is a real
   difference in kind and should be a decision rather than an oversight.
5. **Should a pin be visible from the course page** (section 21's host), where
   there is room for a real list? Out of scope here; noted because it is the one
   surface that could answer the "course-scoped notification" limit in §3.5.

---

## 6. Phasing

1. Store + pin toggle in the popup + the Pinned group (§3.1, §3.6). Nothing
   drills yet; pins accumulate and are visible.
2. Steps, credit and retirement in `finishDrillCard` (§3.2, §3.3), seeded through
   the popup's existing "Drill selected".
3. The launcher and `reviewRowPrimary`'s `'pinned'` role (§3.5), after the
   harness measurement in §5.1.
4. Real-quiz credit (§3.7).

Each phase is independently useful and independently revertible, and only 3
touches shared row code.

---

## 7. What building it changed (v0.103.0)

Written after the fact. §1-§6 above are the design as proposed; this is the
delta, and it is the part to trust where the two disagree.

### 7.1 §5.1 answered: the fourth launcher does not wrap the row where it matters

Measured in `dev/harness.html` at the real stylesheet (the link had to be
inlined into a scratch copy — a `file://` harness loaded through the preview
pane does not fetch its relative stylesheet, and every measurement is silently
of unstyled markup if you skip that check).

Row heights with and without the pinned launcher, at fixed widths:

| width | mistakes only | + pinned | lines available | + pinned |
| --- | --- | --- | --- | --- |
| 900 | 38 | 38 | 38 | 38 |
| 700 | 38 | 38 | 70 | 70 |
| 560 | 70 | 70 | 70 | 70 |
| **473** | **70** | **70** | 70 | 102 |
| 380 | 70 | 102 | 102 | 130 |

Under `html.clo-touch`: 473 → mistakes 114 → 166, lines 184 → 202.

So at the ground-truthed 473 px browse width it costs **nothing** in the state
where a pin can actually be the primary — nothing else outstanding — and one
wrapped line where clickable lines are on offer as well. The fallback §5.1
worried about (folding pins into the drill count, muddying a number that means
exactly "failed this session") is not needed.

The state's own natural width is 392x38 — narrower than the mistakes-only row
it replaces, because it is one launcher rather than three controls.

### 7.2 The pin record is entry-SHAPED, and that is what made it cheap

`drillLine`, `moveLabel`, `wrongLabel` and the popup's row builder all take a
mistake-log entry. A pin record carries the same field names, so all four take
one unchanged and section 20 needed no branch: `duePinnedMistakes()` returns
cards, and nothing below it knows which list they came from.

The one field that is new is `isPin: true`, and it exists for the popup, not the
drill: `entryKey` prefixes a pin row's selection key (a pinned move and this
session's own failure of it are two different rows, and ticking one must not
tick the other) and `defaultChecked` branches on it (due ⇒ ticked, rather than
outstanding ⇒ ticked).

### 7.3 The two lists overlap, so the drill dedupes

§3.4 called for dedupe when seeding. It is done in `openDrill` on `line.key`
rather than in the seeder, because both launchers and the popup's "Drill
selected" can all produce an overlapping list. Without it the same move is asked
for twice in one pass and graded twice — the second time inside its own window,
which credits nothing but does stamp `lastSeenAt` and so pushes the next
encounter out.

`duePinnedMistakes()` still prefers the SESSION entry where there is one, as
§3.4 asked: it carries this session's own `wrong` data for the popup and a
`lead` from the variation as it is now.

### 7.4 Retry refuses pinned rows, and says so

§2.3 ruled that only the drill advances a streak. That leaves the popup with
rows Retry cannot take, so `chosenEntries(withPins)` is parameterised: the drill
passes `true`, Retry `false`. Ticking only pins and pressing Retry gets a
sentence rather than "Nothing selected", which would be a lie about it.

### 7.5 A drill card says when it is pinned

Not in the design, added while building: the card's title reads "Pinned mistake"
and its progress line carries "streak 1/3". The answer about to be given
advances or resets a chain, and a user who does not know that cannot decide to
take it seriously.

### 7.6 Why §3.7 (real-quiz credit) is not built

§5.2 asked whether the detection races the trainer's own write to `progress`.
Reading the code, that particular race looks benign — `quizIncorrectAttempts` is
cumulative per lesson and is not cleared, so a wrong attempt is still there at
the sample where `passedPly` first goes true. The problem is a different one,
and §5.2 did not name it:

**Auto-play would grant the credit.** Section 13 replays every move already
answered correctly this session, and a pinned move very often is one — it was
failed in an earlier session, not this one. Its ply then goes past with
`quizIncorrectAttempts` empty and nothing the sampler can see distinguishes "the
user answered it" from "the extension played it". Section 17's retry pass makes
this the normal case rather than an edge one, since `only` mode exists precisely
to auto-play everything the user has proven.

Closing that needs something the current reads do not carry — a per-ply record
of who moved, which is auto-play's `applyObservedMove` and not the 900 ms plan
sample. It is buildable, it is not free, and it is not needed for the feature to
work. So: unbuilt, with the reason written down rather than the open question
left as it was.

### 7.7 Still open

* **Nothing has run in a live session.** The store, the steps, the credit hook
  and both list surfaces are source-correct and harness-measured; the trainer
  has not been in front of them.
* §5.3 (cap and pruning) is answered by decision, not evidence: 200 per course,
  oldest `pinnedAt` dropped with a console line, and a retired pin leaves **no**
  trace — re-pinning is one click from the same list the mistake is still in.
* §5.4 (backup) is unanswered and remains a real difference in kind: this is the
  first store in the extension whose loss the user would feel.
* §5.5 (a pins surface on the course page) is untouched.

---

## 8. Two surfaces added on request (v0.104.0)

The v0.103.0 build was tested through one retry and worked. Both changes below
came out of that first use, and both attack the same finding: **the pinned list
was only reachable from places the user was not looking.**

### 8.1 The pin is offered where the opinion is formed (16c)

A toggle in a list is the right place to MANAGE pins and the wrong place to
CREATE one. The moment a user has an opinion about a move is the moment they get
it wrong — not later, between variations, in a popup they have to remember to
open. So a small panel is raised in the bottom-right corner naming the move they
just failed, with one button.

It costs no new capture: section 16 already writes a log entry the instant an
attempt count grows, and that entry is everything `pinApi.pin` needs. This
module only watches for one it has not offered yet.

Three restraints, each copied from a surface that had the same problem:

* **It does not swallow keys** — section 18b's heads-up rule. The user is still
  playing on Chessable's board. Its buttons `blur()` themselves, and
  `blurButton` was hoisted to top level for the third caller.
* **It does not nag.** One offer per move per document, dismissed is dismissed,
  and an unanswered one goes away after 30 s. Nothing already in the 12 h log
  when the page loaded is ever offered — being met on arrival by an offer about
  an hour-old mistake is exactly the nagging this avoids.
* **It is opt-out** (`cloPinPrompt`, options-page checkbox).

Measured: 268x155 desktop, 300x192 under `html.clo-touch`.

### 8.2 The launcher left the trainer row (16d)

§3.5 named the limit honestly and then accepted it: "you learn about pins in
course A only while studying course A, between variations. There is no
background surface to put a notification on and none should be invented." The
first half was right; the second was wrong, and the corner 16c had just claimed
IS that surface.

So: a dock in the same corner, on every chessable.com page, showing when ANY
course has a pin due (`pinApi.due(null)`). That forced two changes:

* **The store is now profile-wide and loads in every top document.** It was one
  course at a time, switched on the trainer's `bid`. Records gained a `bid` of
  their own, because `unpin` and `note` have to find their way home from the oid
  a drill card knows, and a v0.103.0 record has none — `load` fills it in from
  the map it was stored under.
* **The drill gained a standalone mode.** A launcher that cannot act on the page
  it is shown on is a dead control, and the drill's board is pinned onto
  Chessable's. `cr.standalone` runs the same overlays as a modal instead:
  centred in the viewport over a scrim, sized from the window, orientation from
  the queue's first card rather than from a board that is not there.

**Not on a trainer path, enforced twice** — the dock hides there and `openDrill`
refuses a standalone pass there regardless of the caller. Our board over a live
quiz whose timer is running is the one thing this feature must never do, and the
row's own launcher already covers the browse state. So the two never compete.

Known limitation, accepted: `boardPieceSvg` is filled by cloning Chessable's own
live piece SVGs, so a standalone drill opened in a tab that has never shown a
board falls back to `PIECE_GLYPH` unicode pieces. Persisting third-party markup
to make that prettier is not worth it.

### 8.3 Still not verified live

Same caveat as §7.7, now covering more: the prompt, the dock, the profile-wide
store and the standalone board are source-correct and harness-measured. None of
them has been in front of a trainer.

