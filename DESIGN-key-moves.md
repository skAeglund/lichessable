# DESIGN — Key moves vs difficult moves (section 25)

The moves you actually get **wrong** should never be the moves Chessable's
**Key Moves Only** study mode silently plays for you.

A course-page panel that reads the key range back out of the course, reads the
user's own per-move record out of Chessable's Difficult Moves feed, lists the
moves that are difficult **and** outside the range, and lowers each variation's
key range to cover them — through the existing quick-edit driver, one variation
at a time. And, once a move stops being difficult, puts the range **back** where
it came from (§7). Optionally it pools that record by POSITION rather than by
card, which is the only way to see a move that is hard in a line where it is
never even asked (§8) — and, optionally again, covers the moves the user has
barely been asked at all, which no record of difficulty can ever mention (§9).

Everything below the design was ground-truthed live on 2026-08-20, on the test
account, against courses 291847 (bought, published, White) and 453453 (the test
course, Black), the second of which had its key moves **recalculated by
Chessable that day** so no answer in it could be stale.

---

## 1. What Chessable's own feature does

`bookadmin.php?bid=<bid>&a=quality` → **Key Move Calculation** → *Auto-calculate
key moves*, with a "Move ordering method" radio whose default is **"Keep order,
mark key moves by page order"** (`reorder=keeporderbo`; the alternative is
`keeporder`, "by common position", and two options that reorder the course).
There is a second checkbox, *Recalculate and overwrite manually-set key moves*
(`overrideKeyLocked`).

It is a **server-side** POST to `bookadmin.php` in the form `#confirmQuality`.
The algorithm is not visible from the client, so §4 reconstructs it from its
output rather than from its code.

### 1.1 How a key range is stored

Per variation, **two marks at most**: a first key move and a last one. On the
edit page (`/mt1/explore/edit/<oid>/`) they live in page state as
`keyMoveLow` / `keyMoveHigh` — ids of the form `<san>_<w|b>_<moveNumber>`,
exactly the ids the quick-edit driver already matches moves by — and as an
`is_key: 0|1` flag on each entry of `allTheMoves`.

`addVariation()` serialises the whole of `allTheMoves` into `#commentsToSubmit`,
`is_key` included, so **saving a key move needs no new mechanism**: it is the
same submit the comment, alternative-move and arrows jobs already use.

`getList` reports the range **already expanded** — every ply from the low mark to
the high one carries `isKey: true` — so the two marks are recoverable from a
course listing as `indexOf(1)` and `lastIndexOf(1)`. That is the whole of the
read side.

### 1.2 The edit page's checkbox, and the bug in it

One checkbox, `#is_key`, inside `#myform`, relabelled per selected move ("Mark
e4 as a key move (learners will be tested on this position)"). Its handler is an
inline `$('#myform :checkbox').on('click', …)`:

| already marked | you check a move… | result |
| --- | --- | --- |
| nothing | anywhere | it becomes the **low** |
| a low | *later* than the low | it becomes the **high** (old high cleared) |
| a low | at or *before* the low | it becomes the new **low** (old low cleared) |

Unchecking the low promotes the high to low; unchecking the high just clears it.
Chessable also puts a `keyMove` **class** on the marked move in
`#interactivePGN`, on page load as well as on every change — and that class is
what an isolated-world driver can read, since `allTheMoves` is page state.

**"Later" is `det_current[2] > det_low[2]` on the split id — a comparison of
move numbers AS STRINGS.** So move 9 reads as later than move 10. That is
Chessable's bug, not ours, and §5 is written to never go near it.

### 1.3 A key range opens on a whole move

A mark written onto Black's `1...a6` came back stored on White's `1.h3`, and
**every** key start observed on either course is a White ply. So the range is
snapped to the start of the move pair — which is consistent with §1.2's
comparison being on move NUMBERS.

Section 25 therefore snaps its own proposal (`snapToMove`) rather than leaving
it to the server: the sentence on screen has to be what will actually happen,
and the driver's "already covered" test compares the stored mark against the ply
we ask for — unsnapped, that test would answer "no" for ever on a variation
already fixed and every re-run would rewrite it.

---

## 2. Why this is the "scan afterwards" design and not a replacement

The request was for **our own key-move calculation that takes difficult moves
into account**, with "use Chessable's and then scan for difficult moves outside
it" offered as the alternative. The alternative won. The reason is not that a
range must never be raised — §7 raises one — but **what a raise is allowed to be
computed from**:

> **A key range is only ever moved to a ply this feature can name exactly.**
> Earlier, to a difficult move that is in the user's own record. Later, only back
> to the ply this feature itself took it from. Never to an estimate, and never
> past an end mark.

A full replacement cannot have that. Replacing a range means raising a start to
wherever a *reconstruction* of Chessable's rule says it belongs — and §4 measures
that reconstruction at 85 %, with **every** one of the misses being a case where
Chessable is more generous than the rule predicts. A replacement would therefore
have quietly stopped asking for material on exactly those variations, which is
the one failure a study tool must not have. Lowering has no such exposure (the
worst case is quizzing more than needed), which is why lowering may be driven by
a computed answer and raising may not.

Chessable's own button is also free, server-side, and correct by definition. The
half it cannot do is the half that needs the learner's record.

---

## 3. The two reads

### 3.1 The course

`fetchCourse(bid, cr, false)` — section 21's shared reader, **never cached
here**: key moves are exactly what this feature changes, and a 12 h old listing
would report a fix that has already been applied.

`reduceCourse` gained a per-ply `keys` array for this. That cost a bump of
`CONFIG.coverage.cacheKey` (`cloCourseListCache` → `…2`), which sections 21 and
24 share: a listing written by an older build parses fine and is silently
missing the field, which would read as "this course has no key moves anywhere".
Changing the KEY rather than checking a version lets the old entries age out on
their own.

### 3.2 The difficult moves

`GET /ajax/difficult-moves-ajax.php?bid=<bid>&lid=-1` — section 13b's feed, same
origin and cookie-borne, no host permission and no JWT. `lid=-1` is mandatory
for 13b's reason: without it the server quietly returns a subset, and a missing
row here reads as "this move is fine".

**The accuracy rule is section 13b's and is now shared code**
(`difficultRowAccuracy`, top level): failures whose `move` is in
`CONFIG.autoPlay.difficult.ignoreWrongMoves` — i.e. `timeU`, the clock — are
dropped from **both** halves of the fraction; `giveU` deliberately still counts.
The threshold is 13b's too (`cloDifficultThreshold`, default 90, on the options
page). Nothing about what "difficult" means is re-decided in this module: two
features disagreeing about that would be worse than either being wrong.

### 3.3 Placing a row in its variation

`difficultPlyIndex(v, row)`, top level. `moveId` is the **0-based index of the
move PAIR** and `color` is which half of it, both relative to the variation's own
first move number — so a variation written `34...Bxf2 35.Kxf2` gives the row for
`35.Kxf2` a `moveId` of 34:

```
ply = (moveId − (firstMoveNo − 1)) × 2 + (color === 'b') − (startsOnBlack)
```

Verified over all 38 rows of the test account: every one placed, and every one
then agreed with the SAN at that ply. The SAN is **verified, not assumed**, and a
mismatch returns −1 — this index decides which move a key range is lowered to
cover, and covering the wrong move is worse than covering none.

It is deliberately arithmetic rather than a `walkVariation`: it needs only "which
move number is this ply and whose is it", which the start FEN answers outright.
So a course with one unplayable line still gets a full report, and an
80-variation scan costs no move generation at all.

---

## 4. Chessable's rule, reconstructed (`estimateKeyLows`)

Informational only, and behind an opt-in toggle that can **only lower** a stored
range. The rule:

1. **Coverage** is what earlier variations in page order have already shown: for
   each of them, the ply at which this variation first differs, or — when one is
   a prefix of the other — the whole of the shared run. The largest such figure
   is where this variation's new material starts.
2. Move **forward to the first ply of the learner's own colour**: that is the
   first thing they can actually be asked for.
3. Then move **back to the White half of that move pair** (§1.3).

Steps 2 and 3 together are why a White course rounds an odd divergence **up**
(5 → 6) and a Black course rounds it **down** (3 → 2). Reading it as "round to
White" alone gets one of the two courses wrong, and reading it as "round to the
learner's colour" alone gets the Black course wrong 78 times out of 79.

**Measured: 71 of 79 on the freshly-calculated course, 58 of 72 on the published
one.** Every single disagreement is a variation Chessable left key from ply 0
while the rule predicts something later — model games and annotated games, which
are evidently exempt by some attribute `getList` does not carry.

That is the **discarded** direction. A prediction later than the stored start is
never acted on, so the whole of the known error is thrown away before anything is
proposed.

### 4.1 What was tried and rejected

* **Chapter scoping.** Chessable compares within the CHAPTER: 64 of 72 exact with
  chapter scoping against 62 without, on the published course. Chapter membership
  costs one `getList` per chapter (~180 KB each) and this module will not spend
  it; whole-book scope can only ever produce a LATER start, which is discarded
  anyway.
* **Prefix variations not counting.** They do on one course and appear not to on
  the other; counting them scored better on the freshly-calculated one (71 vs 67)
  and worse on the published one (58 vs 62), the same total either way. Counting
  them is also what the intuition says — those plies have been shown.

---

## 5. The write (`mode: 'key'`)

A sixth quick-edit driver mode. No new worker path, no new save mechanism, no
JSON API (§1.1).

```
select the move that currently holds the mark  → uncheck  → nothing is marked
select the target move                         → check    → it becomes the low
submit (the shared #submitButton → swal confirm path)
```

**Taking the old mark off FIRST is the whole trick.** It leaves the handler in
its "nothing marked" branch, which is the one path through §1.2 that compares
nothing — so Chessable's string comparison of move numbers can never fire and
can never turn our new START mark into an END one.

Three refusals, all of which report a sentence rather than guessing:

* **Two marks already** (a first AND a last key move). Lowering the start would
  mean taking the end off and putting it back, and putting it back goes straight
  through the string comparison. Refused; the user is told to do that one on
  Chessable's edit page.
* **No mark at all.** That is not "the range starts at ply 0" — it is a variation
  whose key moves were never set, where every move is quizzed already. Marking
  one would START the range there and take everything before it out.
* **The mark is already at or before the target.** Returns `'already'`, and
  **nothing is submitted** — which is what makes re-running a pass over a course
  it has already fixed free.

### 5.1 Two live failures, and what they cost

Both were fixed in the shared `quickEditSelectMoveEl`, so both fixes apply to the
comment, alternative-move and arrows drivers as well.

* **The move element is REPLACED.** Chessable rebuilds `#interactivePGN` shortly
  after the page boots, so a click on the node the driver was handed can land on
  one already detached and do nothing at all. Selection is now **by id**, with the
  click retried (`moveClickTries`, `moveClickRetryMs`) until it takes.
* **The side-to-move check cannot prove a selection.** It was the only check the
  driver had, and the position a click STARTS from usually already has the side
  the target move would leave behind — so it passed for a click that never
  happened, and the driver then read `#is_key` for whatever move was selected
  before. The proof is now Chessable's own `moveActive` class on the target,
  with the side check kept as a second condition (it is what says the BOARD
  followed, not merely the list).
* **`#is_key` is re-queried after every selection**, never held: the same rebuild
  detaches it, and clicking a detached checkbox toggles nothing and fires no
  handler.

### 5.2 The queue

One variation, one driver visit — a focused popup window, a page load, a submit.
Strictly sequential, because the worker runs one job at a time, and that is also
what makes it watchable and stoppable. Two presses to fire (section 19c's rule:
the arming press is what names the number, so nothing can change between the
sentence and the write), a local watchdog per variation (section 19's rule: the
worker's own job timer does not survive an idle restart), a Stop button, and a
cap of `maxWrites`.

Afterwards the course cache is dropped and the course re-read, rather than
trusting our own model of what was written — section 21's discipline. The
outcome line is carried across that re-read (`km.carryStatus`), or "4 changed"
would vanish the moment the list empties and leave no confirmation that anything
happened.

---

## 6. Live verification, 2026-08-20

On course 453453, after Chessable's own *Auto-calculate key moves* had just run
(68 of 79 variations then had a key start later than ply 0):

* the scan reported **80 variations, 16 difficult moves below 90 %, 5 to fix**,
  matching a hand-written prototype run against the same two endpoints;
* one variation was fixed on its own (`repeating same piece test3`, key start
  `4.Rh2` → `1.h3`), then the remaining four as a batch;
* an independent re-read of `getList` + the feed afterwards found **16 difficult
  moves, 0 outside their key range**.

---

## 7. Putting a range back (25b)

The scenario, in the user's own words:

1. variation A's key moves are pulled back to cover difficult move B
2. the user reviews A many times
3. B is no longer difficult (at or above the threshold)
4. the user scans again
5. B should no longer hold the key moves back

Without this the tool is a ratchet: every range it touches stays pulled back for
ever, and a course slowly loses the whole point of Key Moves Only.

### 7.1 The baseline store

`cloKeyMoveBaseline` in **chrome.storage.local** — one record per variation this
panel has moved, `{ low, setTo, name, at }` keyed `"<bid>:<oid>"`. Local and not
session, deliberately: the entire point is that it outlives the sitting in which
the move was hard.

* **`low` is written once.** It is the range's ORIGINAL start. Lowering the same
  variation a second time (another move became difficult) must not overwrite it
  with the intermediate value, or the range could never get all the way back.
* **`setTo` is where we last put it**, and it is the record's own validity check.
  If the mark is no longer there when the next scan runs, somebody else owns this
  range now — Chessable's own recalculation, or the edit page by hand — and the
  record is **dropped**, not acted on. That is also the second route to the
  user's scenario: re-running *Auto-calculate key moves* resets every range and
  invalidates every record, and the next scan simply re-lowers whatever is still
  difficult.
* Capped at `baselineMax` (400) by oldest `at`; a record is ~70 bytes.

### 7.2 `propose()` — the one place the direction is decided

Two numbers meet, and the direction falls out of which one wins:

* **`needed`** — how far back DIFFICULTY says the range has to reach: the
  earliest difficult move **in the whole variation**, minus the lead. Not merely
  the ones currently outside the range. Once a range can be raised, the difficult
  moves presently *inside* it are exactly what stops it going all the way back,
  so they have to be in the comparison. With no baseline the two readings are
  identical — anything at or after `low` loses to `low` in the `min` below —
  which is why lowering behaves exactly as it did before this existed.
* **`ideal`** — where the range would sit with no difficulty pressure at all.
  `low` for a range this tool has never touched, so such a range can still only
  ever be lowered; the recorded original for one it has.

`want = snapToMove(min(ideal, needed))`, and then `want < low` is a lower,
`want > low` is a raise, `want === low` is nothing. A **partial** raise falls out
for free: B recovered but C, deeper in the same variation, has not, so the range
comes back as far as C and the record is kept for later.

`dev/check-key-moves.js` executes the shipped `propose` over all of this,
including the five steps above. A control run against the pre-25b source fails on
exactly the two raise cases and passes every lowering case.

### 7.3 The write is the same recipe

Chessable's handler makes a checked move the HIGH mark when it is "later than the
low" — decided by §1.2's comparison of move numbers as strings. The driver never
goes near that branch: it takes the existing mark **off** first, which leaves the
handler in its "nothing marked" state, where a later move becomes the LOW like
any other. Verified by hand on the edit page (2026-08-20): with nothing marked,
checking `Rh2_w_4` while the range had been at `h3_w_1` set `keyMoveLow` to
`Rh2_w_4` and left `keyMoveHigh` empty.

So raising costs the driver nothing except dropping one assumption:
`lowIdx <= plyIndex ⇒ 'already'` becomes `lowIdx === plyIndex ⇒ 'already'`, plus
a staleness guard — the job carries **`fromPlyIndex`**, the ply the mark is
expected to be on, and the driver refuses when it is anywhere else. That guard is
new because it has to be: "the mark is earlier than the target" used to be a safe
surprise to shrug off, and now it is a legitimate instruction.

### 7.4 Two buttons, armed separately

Lowering only ever adds to what is quizzed; restoring only ever takes away. One
armed press must never mean both, so they are two controls with two arming
states: **Lower key moves (N)** in the panel's green, **Restore key moves (N)** in
a neutral outline (DESIGN-ui-inventory §3's "an action away from the main task").
A restorable row is marked "can go back" in dim text with a rule down its left
edge — deliberately not amber, which here means "you have an outstanding item",
and a range that can go back is the opposite: a piece of work that is finished.

### 7.5 Live verification, 2026-08-20

Round trip on course 453453, driven entirely through the panel:

* `test alternative2`, key range at `2.Nf3`, difficult move `2...Qb6` at 71.4 %;
* the lead set to "2 plies earlier" → the range lowered to `1.e4`, baseline
  recorded;
* the lead set back to "the difficult move" → the panel offered
  *"→ move the key moves back to 2.Nf3 — where they were before this lowered
  them"*, with the Lower button hidden and Restore showing 1;
* one restore run → `getList` came back `0-0-1-1-1-1`, i.e. the range starting at
  `2.Nf3` again, and the record cleared (nothing left to restore).

## 8. Difficulty by position (25c)

**Chessable's record is per CARD, not per position.** A variation is its own
MoveTrainer card with its own history, so `1...c5` in variation A and `1...c5`
in variation B are two unrelated records. On the test course: 30 feed rows
collapse to **19** distinct (position, move) pairs, and `1...c5` alone is played
by **74** variations, has **6** rows, and 68 variations with no record of it at
all.

A variation can be silent about a move it plays for three reasons, and the third
is the one that matters:

1. it was never failed there — the feed only lists moves that have failed at
   least once, so no row exists;
2. it was failed but stayed at or above the bar;
3. **it is never asked there.** Under Key Moves Only a move in a variation's
   run-up is played *for* the user, so it cannot fail, so it cannot be recorded.

Measured: of the 74 variations playing `1...c5`, only **9** currently quiz it —
**65** have it in the run-up, and 5 of the 6 existing rows belong to variations
where it is now in the run-up, i.e. frozen history. So the variations this
feature most needs to fix are structurally the least able to produce the
evidence for it. That is the gap 25c closes.

Opt-**in** (`cloKeyMoveSpread`, absent = off).

### 8.1 Pooled, not averaged

`poolByPosition` groups every row — not only the ones below the bar — by
`cacheKey(fen) + '|' + san`, summing `successes` and `counted` from
`difficultRowCounts`. That helper exists for exactly this: averaging the six
percentages for `1...c5` would weight a 9-attempt card the same as a 56-attempt
one.

The six rows for `1...c5`, timeouts already excluded, run 88.9-100 % and pool to
**93.6 % over 94 attempts** — which is a far better estimate than any one of
them, and above the bar where one of them is below it. (Chessable's own accuracy
column shows 66.7-92.3 % for the same rows, because it counts timeouts; §3.2.)

### 8.2 It can only ever ADD

The line that guarantees it is `if (acc >= threshold) continue` in
`spreadByPosition`: **a pooled figure at or above the bar leaves the variation's
own record completely alone.** Pooling raises a move above the bar as readily as
it drops one below it, and a checkbox called "treat a move as difficult
everywhere it occurs" must never quietly withdraw a lowering the user could
already see.

`min(own, pooled)` beside it is a smaller matter and only decides the figure
*displayed* when both are under the bar — either way the move is in `hard` and
the proposal is identical. The worse of the two is shown because it is the one
that argues for the range being where it is.

Both are pinned by `dev/check-key-moves.js`, and each has a control that fails on
exactly its own assertion.

### 8.3 Positions are walked, not read

`walkVariation` from each variation's own start — section 21's rule, for section
21's reason. Ground-truthed 2026-08-20: the feed's own `fen` **is** the
four-field position before the move, and it agreed with the course's per-ply
positions on all 30 rows. A variation whose SANs will not replay keeps its own
records only and is counted, so the panel can say how many.

`getList` does also return a `fens` array (1584 entries for 80 variations, free
in a payload already fetched), and it agrees. It is deliberately not used:
section 21 established that positions are walked so that castling and en passant
are exact on a course the user has edited, and carrying `fens` through
`reduceCourse` would mean a second bump of the shared session-cache key in one
release.

### 8.4 The cost, and the count before arming

The walk is the one part of this module expensive enough to be felt: **2.0 s for
80 variations, synchronously** — a frozen tab — and a 500-line repertoire would
be six times that. So `analyse` is async and yields every `chunkVars` (20)
variations, reporting progress. Measured after: the toggle's own handler is
**7 ms** and the longest main-thread block during the walk is **17 ms**, i.e.
one frame.

The blast radius is the real hazard, not the CPU. On the test course the spread
takes the panel from **5 variations to lower** to **51**, from 11 pooled
positions adding 152 moves across 63 variations. `1...c5` is ply 1, so covering
it means starting those ranges at ply 0 — which is Key Moves Only switched off
for those lines. So the panel prints its own line, above the options and in the
attention amber, **before** anything can be armed:

> Spread by position: 11 position(s) below the bar, adding 152 move(s) across 63
> variation(s)

…and the ordinary two-press arming still names the number it would write. A
chip whose figure came from elsewhere is drawn **dashed** and says so in its
tooltip ("This variation has no record of this move. 86.7 % is pooled over 2
record(s) of the same position elsewhere in the course."), because a percentage
on a card that has no record would otherwise read as a measurement of it.

### 8.5 Live verification, 2026-08-20

Course 453453, spread off → **0 to lower**; spread on → **51 to lower**, with the
count line as above. The first row is exactly the case this exists for:

> gonfreecss vs. 1) 6. Be3 — Mainline · 3 outside · key moves start 10.Bd3 ·
> `2...Nc6 86.7%` `3...cxd4 89.7%` `6...Qb4+ 88.9%` → start the key moves at
> 2.Nf3

None of those three has a record in that variation; all three are pooled from
elsewhere. One lowering was run from it and `getList` came back with the range
starting at ply 2.

## 9. Never asked (25d)

**A move that has never been asked cannot be judged.** The scan above only ever
argues from the Difficult Moves feed, and a move outside a key range under Key
Moves Only can never appear in it — it is played *for* the user, so it cannot
fail, so it has no row. §8 closes half of that gap by pooling the record of a
POSITION across cards. This closes the other half: a position the user has never
been asked **anywhere** in the course, about which no amount of pooling can
produce evidence.

Opt-**in** (`cloKeyMoveUnproven`, absent = off), and it composes with everything
above rather than replacing it: it is a third number in `propose()`'s `min`.

### 9.1 The signal, and why it is not the feed

The feed alone cannot answer it — it is half of the answer, and this is the
half it cannot supply:

1. It lists a move only once it has **failed at least once**
   (`DESIGN-difficult-moves.md` §6.3), so the moves in question have no row.
2. For a row that does exist, an attempts FLOOR is degenerate. With `f >= 1`
   real (non-timeout) failures and `s` successes, `difficultRowCounts` gives
   `counted = s + f` and `acc = s/(s+f)`, so `acc >= 90 %` forces `s >= 9f` and
   hence `counted >= 10`. At any floor <= 10 a move with a genuine failure is
   *already* below the accuracy bar. Measured live on 453453 (30 rows,
   threshold 90, floor 7): 2 rows were caught by the floor alone, and both were
   all-timeout cards. A two-move accidental class is not a feature.

The signal is the per-move **SRS level** from `getLesson` — section 13b's
"barely learned" guard reads the same field for a neighbouring question. What
was missing until now is what the number MEANS, which is settled below.

### 9.2 What a level is (Chessable's own code, 2026-08-20)

Read out of the site bundle (`static/js/main.*.js`), not inferred:

```js
// what a finished session POSTs, one entry per ply
x = lessonPlan
      .filter(e => (e.isUserMove === true || e.isInformational === true)
                   && !e.isDeleted && !e.isSuspended)
      .map(e => ({ bid, oid: e.variationId, mid: e.mid, practiceMode: e.color,
                   level: e.progress.newLevel > 0 ? e.progress.newLevel + 3 : 0,
                   presented: e.progress.attemptsTotal,
                   wrong: e.progress.quizIncorrectAttempts, ... }))

// how the new level is decided
newLevel = Math.min(17, (progress.quizIncorrectTotal > 0 ? 0 : originalLevel)
                        + levelUpFromNewBase)      // 0 when overstudying,
                                                   // else 1 if quizCorrectStreak > 0

// and what makes a ply a user move in the first place
isUserMove = (studyCol === plyColor || studyCol === 'both')
          && (default_study === 'key' ? isKey : default_study === 'all')
```

Four facts fall out, and all four are load-bearing:

* **`getLesson`'s `level` / `level_b` is `newLevel + 3`**, which is why the
  smallest value ever seen on a real course is 4 and the cap is 20. The reverse
  direction is in the same bundle (`originalLevel: level_origin > 3 ?
  level_origin - 3 : 0`). `level_origin` / `level_origin_b` are byte-identical
  to `level` / `level_b` on all 830 plies measured — no extra information.
* **null / 0 means the move has never completed a session as a user move.** It
  is not "level zero", it is no record.
* **For a move that has never failed, `level - 3` IS the number of sittings
  the user has answered it in.** The reset branch (`quizIncorrectTotal > 0`)
  never fires for such a move, so the level increments once per sitting from 0
  and nothing else touches it. That is the count for exactly the class the feed
  is blind to, and it is why the two sources compose.
* **For a move that HAS failed it is only the streak since that failure**, which
  is where the feed takes over: joined against it on all 30 rows, level 5 with
  56 attempts, level 4 with 4, level 5 with 83. A floor on the LEVEL ALONE
  therefore drags back moves the record can vouch for — measured at 46
  variations against the combined rule's 25 (§9.3). Hence:

  ```
  timesAnswered(ply) = feed row ? difficultRowCounts(row).successes : max(0, level - 3)
  ```

  The two halves are not quite the same unit — the feed counts PRESENTATIONS and
  a level counts SITTINGS, so the feed half is the more generous one. That is
  the safe direction: it can only leave a move OUT of this rule, and a move the
  feed knows about is one section 25's own accuracy test already reads.
* **A move Key Moves Only hides cannot gain one.** Under `default_study: 'key'`
  a non-key ply is not a user move, the save filters on exactly that, so it is
  never sent and its level never moves. (Overstudy is level-neutral for a
  different reason in the same code: `levelUpFromNewBase` is 0 there.)

Two free course-level fields turned up beside it, both in the `getList` this
module already fetches:

* **`isKeyMode`** (and the per-move `default_study`) is the user's own study
  mode for that course — `false` / `'all'` on 453453, `true` / `'key'` on
  291847. So "are these key ranges hiding anything at all" is answerable, which
  is what the panel's own line now says. (`default_review` sits on every row and
  appears nowhere in the bundle; ignore it.)
* **`learnMW` / `learnMB` is the number of that variation's user moves with NO
  level, and `reviewMW` / `reviewMB` the number currently DUE** (`readyW` /
  `readyB`). Verified 80/80 on 453453 against the per-move data. That is what
  makes the read cheap — §9.4.

### 9.3 Per card is degenerate; per POSITION is not

This is the measurement the feature stands on. Course 453453, 79 variations with
moves, 830 user plies, 306 distinct (position, move) pairs, of which **55 have
ever been answered**. The key ranges as they stand ask for **417 of the 830**.

| rule | variations lowered | to ply 0 | user moves added |
| --- | --- | --- | --- |
| unanswered **in this card** | 56 of 65 | **all 56** | +400 (98 % of the course) |
| unanswered **anywhere** (pooled) | 24 of 65 | none | +66 |
| answered fewer than 5 times, pooled | 25 of 65 | none | +70 |
| …the same floor on the LEVEL ALONE | 46 of 65 | none | +180 |

The per-card reading is exactly the failure this direction was expected to have:
every range to ply 0, i.e. Key Moves Only switched off wholesale. It fails for a
structural reason — a card's run-up is unanswered *by construction* — and the fix
is the one §8 already made for difficulty: **ask the question of the position,
not of the card.** A move the user answers in variation A is a move they have
been asked; that variation B has never quizzed it says nothing about them.
Counts are therefore SUMMED across every card that plays the position, the same
pooling §8.1 does and for the same reason.

The last two rows are the argument for reading both sources rather than the
level alone. Raising the floor from "never asked" to "fewer than 5 times" costs
**one variation and four user moves** on this course, because the moves it newly
catches are nearly all inside ranges that were already coming back — while the
same floor on the level by itself catches every move that has failed once since,
however well known it now is. The whole ladder, live:

| floor | positions under it | variations pulled back |
| --- | --- | --- |
| never at all | 251 of 306 | 24 |
| fewer than 2 | 260 | 25 |
| fewer than 3 | 263 | 25 |
| fewer than 4 | 267 | 25 |
| fewer than 5 | 271 | 25 |

A course dominated by material never studied at all (82 % of positions here)
will always look like this; one studied throughout is where the floor starts to
matter, and no such course exists on the test account to measure.

### 9.4 The read, and what it costs

`getLesson` is one call per variation — 6.7 KB and ~456 ms each, 80 of them in
7.3 s at concurrency 4. That is affordable on this course and would not be on a
500-line repertoire, so **the floor decides the read**:

* **"Never asked" is a boolean question**, and `learnM*` answers it for free:
  0 means every user ply of that variation has a level (so each has been
  answered at least once), its own user-ply count means none has. Only a
  PART-learned variation needs the detail. On 453453 that is **0 calls** (14
  variations fully studied, 65 untouched, none mixed), and the same on 291847.
* **Any floor above it needs the VALUES**, so every variation with anything
  studied is read: 14 calls and ~12 s here, `lessonMax` (200) calls at worst.
  What the cap drops is `unknown` — never "barely asked" — so it can only ever
  leave a range alone.

An index built with the values is `exact` and answers every floor, so walking up
and down the ladder costs one read, not one per step. The cheap index is kept
only for the floor it was built for.

`reduceCourse` therefore gained a per-variation `unstudied` and a course-level
`keyMode`, which cost the third bump of `CONFIG.coverage.cacheKey`
(`...2` -> `...3`), shared with §21 and §24 — same reason as the first: an older
listing parses fine and is silently missing the field, which would read as
"nothing here has ever been studied".

### 9.5 The rule, and the two guards

`propose()` gains one more number in the same `min`: the earliest user ply of
the variation whose (position, move) has been answered fewer than `floor` times
anywhere in the course, snapped to its move pair. **No lead is subtracted** —
the lead exists to give context BEFORE a difficult move, whereas the whole of
this pressure is "ask this move", and stacking the two would compound.

The floor is a setting (0 = off, 1 = "never at all", up to 5) rather than a
checkbox, because §9.3 shows the two ends of it are different questions and the
cost of the read differs between them. It is stored as a NUMBER; `true` is what
the very first build wrote and reads as 1.

Because it is in the `min` and not a proposal of its own, everything §7 says
still holds: a range can be restored only as far as its earliest under-asked
move, and a range this tool has never touched can still only be lowered.

* **A course with no record at all is refused.** With nothing answered every
  move is under the floor and the answer would be "pull every range to ply 0" —
  which is not an answer, it is the mode switched off (291847: `studied: 0`).
  The panel says so, and the pressure is not applied.
* **The count is printed before anything can be armed**, §8.4's rule and for
  §8.4's reason: this is the second toggle here that can take a press from five
  variations to fifty.

### 9.6 Live verification, 2026-08-21

Course 453453, through the panel, on the build that ships this:

* floor off — *"80 variation(s) · 16 difficult move(s) below 90 % · 0 to lower"*,
  i.e. §6's state, unchanged;
* the summary also now reads **"studied as ALL MOVES — these ranges hide nothing
  today"**, which is `isKeyMode` arriving through `reduceCourse`;
* every step of the ladder in §9.3's second table, matching the figures computed
  independently against the same three endpoints, to the position;
* "never at all" made no `getLesson` call; the first floor above it read the 14
  studied variations in ~12 s and every later step reused that index;
* a row reads *"key moves start 5.Bb5 · `3...Nh6 asked 1×` → start the key moves
  at 3.f4"*, and the chip's tooltip names the pooled count and how many moves in
  that variation are under the floor;
* back to off ⇒ 0 to lower and the line hidden.

The WRITE is deliberately not re-verified: it is §5's driver with a different
integer for the target ply, and §7.5 already ran that loop end to end.

### 9.7 The loop it closes

With Key Moves Only on, a move outside the range is never asked, so its count
never grows and the scan keeps offering to cover it. Once covered it is asked,
its level climbs, and §7's restore can put the range back — held only by
whatever is still difficult. So the pair reads as one rule: **every move is
asked N times before Key Moves Only is allowed to hide it.**

## 10. Still open

* **The end mark.** A variation with both marks is refused (§5). Handling it means
  either working around §1.2's string comparison or finding a write path that
  does not go through that handler.
* **Chapter scoping for §4's estimate**, if a cheap way to learn chapter
  membership turns up. `getList?bid&lid=<lid>` answers per chapter but at a full
  listing's cost each.
* **The model-game exemption.** 22 variations across two courses are key from ply
  0 where the rule says otherwise, and nothing in `getList` distinguishes them.
* **A trainer-side view.** The panel is the course page's; the same answer would
  be useful as a mark in the drawer during a session.
* Whether a difficult move in the run-up should instead be split out as its own
  variation (section 19d already writes puzzles), which would cover it without
  lengthening what Key Moves Only asks for.
* **A range lowered before 25b existed has no baseline** and can only be restored
  by re-running Chessable's own calculation (§7.1). Nothing can be done about
  that retrospectively — the ply it came from was not written down.
* Whether a restore should be offered automatically at all, or only once a move
  has been comfortably above the threshold for some time. As it stands a move
  hovering either side of 90 % can be lowered and restored in alternate weeks,
  which costs two driver visits and changes nothing the user asked for.
* **The never-asked rule (§9) has no budget either**, for the same reason and
  with the same two brakes (the count line and the arming press). A ranking, a
  minimum ply, or a cap on how many variations one scan may lower would suit
  both. Measured on the test course it is 24 variations and +66 user moves,
  which needs no brake; a course studied under Key Moves Only from the start
  would be larger, and no such course exists on the test account to measure.
* **Whether a restore should also require the move to have been asked N times**
  rather than once. §9.2 says the level can express it (a floor of 5 is "two
  clean sittings"), and §9.3 measures that floor at +180 user moves rather than
  +66 — a different feature, deliberately not built.
* **The spread has no depth or count limit** (§8.4). A difficult move on ply 1
  pulls every line that plays it back to ply 0, and on the test course that is 51
  of 79 variations. A minimum ply, a cap on how many variations one position may
  drag, or ranking by how much each lowering would add, are all plausible and
  none is built — the count line and the arming press are the only brakes.
* A pooled position is only as good as its rows. A move recorded once, failed
  once, pools to 0 % and would spread that verdict everywhere; a minimum-attempts
  floor before a position is allowed to spread is probably wanted.
