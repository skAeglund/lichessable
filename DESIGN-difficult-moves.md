# DESIGN — "Difficult moves only" (sections 13b / 13c / 13d)

A review session that stops **only on the moves the user actually finds hard**,
and passes over the variations with nothing hard in them. A second proof source
for section 13's replay, plus a skipper and a launcher.

Opt-**in** (`cloDifficultOnly`), switched from a second toggle in auto-play's own
cog menu — it is a persistent preference that changes what auto-play will play,
which is the argument the cog itself rests on (F4), and `DESIGN-ui-inventory.md`
§3 allows a row control five meanings, none of which is "a setting".

Endpoint ground-truthed live 2026-08-09 on the real account; feature verified end
to end the same day (§7).

---

## 1. Why the obvious design cannot work

The original sketch was *"hold on the difficult positions, let auto-play cover
everything else"*. **That is a no-op, and it is the whole design note.**

Section 13 only ever plays a move it has WATCHED the user answer correctly *this
session*, and `ap.record` is empty when a review session starts. With nothing
proven there is nothing to hold BACK.

So it is **two halves**, both load-bearing, both inside `evaluateAutoPlay`:

* **GRANT** — an `'easy'` verdict stands in for a session proof entirely, so the
  move is played though this session has never seen it. Nothing to expire, and no
  recorded promotion to refuse (a promoting *line* was already turned away by the
  `wanted.length > 4` test above it). **The granted move is the LINE'S own**
  (`{ uci: wanted }`): `injectMove` reads nothing but `.uci`, so a bare object and
  a record entry are interchangeable there, and the line still chooses the move
  exactly as it does on the record path.
* **VETO** — a `'hard'` verdict is checked **first** and outranks a session proof.
  A hard move answered correctly early on is still a hard move, and replaying past
  it would quietly undo the mode on exactly the moves it was turned on for.

> v0.90.0 shipped the grant as an `if` block scoping `proven` inside itself while
> the injection below still referenced it, which threw `proven is not defined` on
> the first easy move of the first live session (fixed v0.90.1). The status chip
> said "replaying known moves…" and nothing ever moved, because the throw happened
> after `setStatus` and before the timer was armed.

It also **exempts itself from the `handedOver` rule**, for section 17's
`resumeAfterHandover` reason and more so: hard moves at plies 8 and 12 mean
handing over twice, and ending the replay at the first would leave every line's
tail to be played by hand — the one thing the mode exists not to do.

## 2. The key is `(oid, mid)`, never a position

Which is why `requestOracle` carries `mid` on each ply (optional — `pagestate.js`
may answer without it, and then the mode simply has no opinion).

Chessable's record is per move-in-a-variation while a position is shared between
lines: on the test account **38 rows collapsed to 18 distinct FENs**. A position
key would make one hard move stop every line passing through it, including ones
the user plays perfectly.

`autoPlaySetHold` is unusable here for that reason **and** a second: it is section
17's exclusively, called from `applyHold()` in that tick's `finally` on EVERY
tick, so anything else writing through it is wiped twice a second.

## 3. `/practice/` only

Absence from Chessable's list means "never failed", which in a *scheduled review*
is the same as "reliable" — everything a review asks for has been learned.

In `/learn/` it would ALSO mean "never presented", and auto-playing brand-new
material would skip the teaching. `getLesson` carries a per-move SRS `level_b`
that could tell the two apart (measured: 639 ms, 7.3 KB per variation), which is a
real option if the mode is ever wanted there; the scope gate is cheaper than the
fetch, and review is what was asked for.

## 4. The source

The feed behind Chessable's own Difficult Moves page:

```
GET /ajax/difficult-moves-ajax.php?bid=<course|0>&lid=-1
```

Same origin, cookie-borne — a plain content-script fetch with **no host
permission and no JWT** (verified: the Bearer header changes nothing). Measured
34 rows / 23.5 KB / 77–141 ms, i.e. ~686 bytes per row. The DataTable behind it is
`serverSide: false`, so one GET returns everything and the paging is client-side.

### `lid=-1` IS MANDATORY

`bid` is the course picker (0 = all) and `lid` the chapter picker (−1 = all), both
server-side — and **without `lid` the server quietly returns a subset**: 34 rows
against the page's own 38, the missing 4 being two whole variations of one course.
Reproducible, and not a cache or auth artefact.

A missing row reads as "easy" here, so under-reporting is precisely the direction
this mode must not fail in. It cost a while to find: chased as a caching, then an
auth, then a pagination problem.

### Caching, and failing closed

ONE fetch per course per session, cached in `chrome.storage.session`
(`cloDifficultMoves`, the auto-play record's own 12 h TTL) so a mid-session
refetch cannot move the goalposts under a running replay.

**FAILS CLOSED**, which is the opposite of nearly everything else in this project:
an unreadable list leaves `rows` null and the verdict grants NOTHING, degrading to
ordinary auto-play. Failing open would mean "we could not check, so play it
anyway" — auto-playing the moves the user is worst at.

## 5. The accuracy is RE-COMPUTED

Not read off the row's own `accuracy`. Chessable counts a **timeout** as a
mistake, and 65 % of the test account's failures were `timeU` — the clock rather
than the move. Section 23 pauses that clock, so history and future do not measure
the same thing.

Excluding timeouts needs both halves of the fraction to drop those attempts, which
the data supports exactly: `sum(wrongMoves.amount) === totalamount` held on all 38
rows.

It is **not** a rounding decision — it moved 13 of 38 rows a bucket, took the
≥ 90 % set from 7 to 18, and 8 rows whose every failure was a timeout became
100 %.

`giveU` — section 23's honest "I don't know" — deliberately still **counts**: it is
a statement about the move, and the purest difficulty signal there is.

Both numbers are settings on the options page (`cloDifficultThreshold` 90,
`cloDifficultRecentDays` 7): below the bar is hard, and so is anything missed
inside the window whatever its lifetime figure says (0 = accuracy alone). Every
read goes through `numberPref`, so a value from an older build degrades to the
default rather than putting `NaN` into the decision.

`lastUpdatedNum` is the SERVER's local time, parsed as the browser's: the window is
measured in DAYS, so a few hours of skew cannot change a verdict and aligning the
two clocks would buy nothing.

Spot-checked against the REAL source (evaluated out of the file, not copied) over
27 cases on 29 real rows, including the one that matters structurally — the same
move 1…c5 in two variations returning `'hard'` and `'easy'`. The 16 timeout-free
rows reproduce Chessable's own percentage to the hundredth, which is what shows
the re-score is that formula generalised and not a different one.

---

## 6. Skipping whole variations (section 13c, v0.91.0)

The mode's other half, and the one that makes it **honest**.

Auto-playing a variation with nothing difficult in it marks every move passed and
**reschedules** it — recall asserted from history rather than tested, which is the
one thing a review exists to do. So such a variation is passed over instead and
stays due for an ordinary session.

Not an edge case: on course 453453 only 12 of 80 variations hold any move ever
missed (9 hard at the default 90 % / 7 d), so this is MOST of a session. It is also
what makes the mode a **prioritiser** rather than a way to get through a queue
faster.

### Ground truth (2026-08-09, a real 14-card `/practice/` session)

The third point is the entire safety of the feature:

* the `/practice/` drawer lists EXACTLY that session's due variations, each
  carrying `oid` and `lid` (14 rows for a 14-card session);
* a plain untrusted `.click()` on a row switches the trainer in-session —
  `pushState` to `/practice/<bid>/<oid>/<lid>`, **no document load**, so this whole
  module is document-local and needs none of section 17's storage-backed
  ownership;
* **leaving a served card unanswered posts NOTHING.** Only `getReview` and
  `getRating` fired; the course's due count stayed at 14 and a fresh session served
  the skipped variation first again. Re-confirmed after the feature itself ran:
  zero `saveProgress` calls across a session including a skip.

**This corrects the note by the retry runner**, which says a drawer click in
`/practice/` "starts a real REVIEW of the variation and would change its
scheduling". The CLICK reschedules nothing; **answering** does, at completion.
Section 17's rule still stands — a retry pass would go on to ANSWER the variation,
which does reschedule — but the mechanism is not what was written.

### The runner

`difficultHardOids()` (memoised, dropped whenever the threshold, the window, the
rows or the course change) is the **feed only**, never the level guard of §6.3: a
variation whose moves are merely NEW is one to leave for an ordinary review, which
is exactly what "skip newly learned variations" asks for — so being new must not
become a reason to VISIT one.

`maybeSkipEasyVariation` judges each oid ONCE (`decided`), after `skipSettleMs` —
the drawer's active row flips a beat before the board is ready, and clicking on
during that is how a switch gets lost — and NEVER abandons a card the user has
started answering (`handedOver` / `pendingRecord` both stand it down). It walks
Chessable's own drawer order from the current row, wrapping once; when nothing
difficult is left it stands down with a count of what stays due rather than
looping. `skipMaxClicks` is the runaway guard.

### 6.1 Two ways the grant escaped its scope (v0.92.0)

Both reported as "several variations auto-played fully inside this mode", both
fixed in `difficultVerdict`:

* **The grant was not scoped to the variations the mode opens** — the one that
  produced FULL auto-play. `maybeSkipEasyVariation` marks a variation `decided`
  *without* skipping on three paths: nothing difficult left to move to
  (`dm.done`), the runner already stood down, or the card already touched
  (`handedOver` / `pendingRecord`). On all three the variation is by definition
  easy, so every move read `'easy'` and it played itself out in full — and since
  `dm.done` latches, that was EVERY remaining variation once the session ran out of
  difficult ones. `variationWorthVisiting(oid)` is now the first thing the verdict
  asks, and a variation the mode did not deliberately open gets **no opinion**; the
  ordinary session-record path decides it, exactly as with the mode off.
  *The fix belongs in the verdict and not in the skipper:* the skipper has
  legitimate reasons not to skip, and every one of them was a reason not to GRANT
  either.
* **Difficulty did not travel with the position.** Chessable's record is per
  (variation, move), so a move failed in variation A carries no row under variation
  B — and a course answering one position from several lines (38 rows over 18
  positions) replayed in B the very move it handed over in A. Diagnosed correctly
  from the outside as shared difficult moves. `difficultHardPositions()` keys the
  veto on the row's own `fen`, four fields, so a transposition counts too; the call
  site passes the PLAN's exact `sourceFen`, never a reconstruction. It can only
  ever ADD hand-overs. `reduceDifficultRow` therefore stores `pk`, which is why the
  session cache carries `cacheVersion` — a v1 entry parses fine and is quietly
  missing that field, which would have re-disabled the veto for up to 12 h after
  the upgrade.

### 6.2 The interlock is load-bearing

`difficultSkipPending()` stops `evaluateAutoPlay` acting on an unjudged variation.
Auto-play's settle floor (500–900 ms) and the skipper's are close enough to race,
and losing that race means playing a move into a card we are about to leave
unanswered — i.e. recording an answer to a card the user never saw.

It cannot latch: once `decided` holds the oid, or the runner is done, it is false
for good.

### 6.3 The barely-learned guard

`minLevel` (default 3) answers "skip newly learned moves".

There is NO attempt count for a move that has never failed — the feed carries
`attempted` only for moves that have — so the SRS level from `getLesson` is the
signal, which is what Chessable itself uses to decide how long a move may be left.

Per variation, cached per oid, **never awaited**, and a null level means **no
opinion** rather than a low one: reading unknown as low would make every move hard
for the first second of every variation. The course's colour picks the column
(`level_b` on a Black course, with `level` null throughout — measured), taken from
the tracker's own `vs.userColor`. Fails closed like the feed.

`getList` also carries per-variation `isNew` (never studied) and `nHard` — which
decodes as the **sum of lifetime failures** across the variation, not a count of
hard moves (70382657 = 1+4+1+67 = 73). Neither is used: the feed grouped by
`openingId` already answers the question, and `isNew` was true for only 2 of 80.

### 6.4 "Nothing difficult left" is a NOTICE, not a log line (v0.93.0)

It is the one message this mode produces that the user has to **act** on — every
remaining variation is still due, and playing them out now reschedules the very
cards the mode was preserving.

It was going through `setStatus`, i.e. AUTO-PLAY's chip, which the next
`evaluateAutoPlay` overwrites ("▶ replaying known moves…", or "" from
`injectMove`). So it flashed up and was gone — and it only rendered at all while
auto-play was enabled.

`syncDifficultNote` gives it an element of its own (`.clo-dm-note`) that nothing
else writes, re-asserted from `tick` every 500 ms so a React re-render cannot
swallow it. It goes on `reviewStatusHost()` and **not** in a `.clo-review-grp`:
this state arrives MID-QUIZ, where the row is collapsed and groups are hidden, and
the status line is not a group — so it needs no fourth collapse exception.

Dismissible (it is a statement, not a control), and it says the CONSEQUENCE rather
than just the fact, because "leave the session to keep them due" is the entire
reason for telling the user at all. `leftCount` is a SNAPSHOT taken when the runner
stood down.

Measured in the harness: 503×24 on one line beside auto-play's chip, both on a
797×70 row; 503×54 under `html.clo-touch`, where the explicit `line-height` stops
the wrapped lines overlapping.

---

## 7. The launcher (section 13d)

On the COURSE page, under Chessable's own Review button, because that is where the
decision is made: "review these 14" or "review only the ones I find hard".

It sets the preference and follows THEIR OWN Review link — no session URL of ours.
The count is the same feed, re-scored with the user's own settings, and it warms
the session's cache on the way past.

Measured live: theirs 239×47 at [1183,168], ours 239×40 at [1183,223], an 8 px gap,
width matched by JS. Deliberately **not** their green — directly beneath their
primary button, a second green one of the same size reads as a rival for the same
action rather than a narrower version of it, so it takes the ordinary outlined
weight (`DESIGN-ui-inventory.md` §3).

### Verified end to end (2026-08-09, v0.91.0, course 453453)

* launcher read "Difficult moves 9";
* the session opened on 70448242, correctly NOT skipped (75 %);
* hand-navigating to 71049341, which has no rows at all, logged
  `difficult-only: skipping 71049341 (nothing difficult in it) → 70382641` within
  ~1 s and landed there;
* **zero `saveProgress` for the whole session**;
* the course still read "Review 14" afterwards.

## 8. CSS

The switch REUSES `.clo-ap-toggle`'s rules rather than inventing a look — both are
booleans in the same menu, and only the order says which is subordinate (`syncUi`
hides 13b entirely with auto-play off, since it has nothing to modify there).

`white-space: nowrap` on that shared rule is **load-bearing**, the trick
`.clo-move` needs for its own reason: the menu is a fixed popover with no width, so
it shrink-wraps to its widest item, but an inline-flex button's label can shrink
below its own max-content — the menu sized to "Auto-play" and wrapped the new label
onto a second line. Fixing it also un-wrapped "Auto-play" itself, which had been
rendering on two lines.

Measured in the harness: 118×102 before, 170×132 with the switch (224×193 under
`html.clo-touch`), every item one 24 px line; `openMenu` already clamps both axes,
so the extra 52 px of width needed nothing.
