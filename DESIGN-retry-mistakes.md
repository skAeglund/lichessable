# DESIGN — "Retry all mistakes of session"

Status: **Layer 1 implemented in v0.29.0** — the mistake log (section 16) and the
retry runner (section 17) in `content/lichessable.js`, plus the extra fields
`content/pagestate.js` now reads. **Layer 2 (§3.2) landed in v0.45.0** as
section 20, but built differently from the sketch below — see the note there.
The optional difficult-moves diff backstop of §3.1 is still NOT implemented; the
drill does not read `/difficult-moves` either, but **section 13b does since
v0.90.0** — for a different question than this document imagined. It uses the
endpoint not as a backstop for the session's mistake log but as the *lifetime*
record behind "difficult moves only", where a move's accuracy and last failure
decide whether auto-play plays it or hands the board over. Two things learned
there correct §2.2 below: the `lid=-1` sentinel is **mandatory** (without it the
server silently returns a subset — 34 rows against the page's own 38), and the
row's own `accuracy` counts timeouts as mistakes, which on the test account was
65% of all recorded failures. See CLAUDE.md section 13b. Ground-truthed live on the test account
against course **453453** on 2026-07-26. Everything in "Findings" below was
observed, not inferred; everything in "Open questions" was not.

Re-verified live before implementing (same account/course, 2026-07-26): the
drawer rows (`.mt-drawer-content__variations__link`, 75 of them = the whole
course in a `/learn/` session, `oid`/`lid`/`title` attributes, present with the
drawer collapsed), an untrusted `.click()` on one switching the trainer
in-session (pushState to `/learn/<bid>/<oid>/<lid>`, plan swapped, no reload),
`ctx.lessonStudyMode`, the per-ply `mid`/`ply`/`isUserMove`/`isKey`/
`startedAsOverstudy` fields and the `progress` shape. Two facts the
implementation leans on that were newly pinned down: a fresh lesson's counters
really do start at zero (so the runner's "answered" baseline is a baseline, not
a `> 0` test), and `startedAsOverstudy` is per-ply and true on the USER's plies
of a single-variation `/learn/` session — including after a drawer switch inside
that session, which is what keeps a retry pass's own failures out of the queue.

---

## 1. What the user asked for

After a review session (or a chapter), offer an OPTIONAL retry of the moves that
were failed in that session — like Overstudy, but scoped to the failures. No SRS
involvement wanted; a plain "do those again" pass.

Two candidate routes were named: drive Chessable/the board directly, or fall
back on the **Difficult Moves** page (`/difficult-moves`), which the extension
does not touch today.

Short answer: **both are available, and better than expected.** Chessable holds
a live, per-move mistake record in the trainer's own page state, and the
Difficult Moves page is backed by a same-origin JSON endpoint that returns the
FEN *and* the correct move for every move the user has ever missed. There is no
arbitrary-FEN quiz route in Chessable, so "quiz exactly the failed move on
Chessable's own board" is not directly possible — but auto-play (section 13)
closes that gap almost completely.

---

## 2. Findings (ground truth, 2026-07-26)

### 2.1 The trainer knows exactly which moves were failed

`lessonPlan` entries (already read by `content/pagestate.js` for auto-play)
carry far more than auto-play uses. Per ply:

```
lessonPlanVersion, bid, variationId, teachIfNew, ply, mid, fullMoveNum0Based,
variant, result, sourceFen, targetFen, san, from, to, color, maxDuration,
comment…, annotation, drawings, isUserMove, isTactic, isAlternative,
isInformational, isReference, originalLevel, variationName, learnRepsSetting,
useSoftFail, softFail, isReady, isKey, studyColor, isLowestPly, isHighestPly,
studyMode, startedAsOverstudy, lessonPlanID, progress, planIdx, …
```

`progress` on a **user** ply is the live record for THIS session:

```json
{ "finished": true, "newLevel": 1, "teachTotal": 0, "teachStreak": 0,
  "attemptsTotal": 3, "quizTotal": 3, "quizCorrectStreak": 1,
  "quizCorrectTotal": 1, "quizIncorrectStreak": 0, "quizIncorrectTotal": 2,
  "quizIncorrectAttempts": ["timeUp", "timeUp"],
  "blindQuizTotal": 3, "isQuizCurrentlyInRetry": false, "retryTotal": 0,
  "maxRetry": 0, "seenTotal": 4, "reviewPointsTotal": 10,
  "overstudyPointsTotal": 0, "altOptIn": null }
```

* `quizIncorrectAttempts` holds the **actual refused SAN** (`"c5"`) or the
  literal `"timeUp"`. This is the mistake list, verbatim, with no DOM
  reconstruction and no engine involvement.
* Counters are per-lesson/session, not lifetime (a move with 10 lifetime
  attempts read `quizTotal: 3` here).
* `mid` = index among the USER's moves in the variation (0-based);
  `ply` = index in the full line. Verified: `mid 0 → ply 1 (c5)`,
  `mid 1 → ply 3 (Nc6)`, `mid 2 → ply 5 (cxd4)`.
* `sourceFen` on the same entry is the exact position before the move —
  everything a standalone quiz card needs.
* `ctx.lessonStudyMode` is `"review"` in `/practice/`, `"learn"` in `/learn/`;
  per-ply `startedAsOverstudy: true` marks an overstudy run.

Corroboration: at variation completion the trainer POSTs
`/api/v1/saveProgressAndReturnNewProgressInfo` with, per move,
`{bid, oid, mid, practiceMode, level, points, overstudyPoints, presented, ready,
overstudied, wrong: ["timeUp","timeUp"], alternativeSkipped, informational}`.
**We do not need to hook that** — the same data is readable from page state, and
hooking `fetch` would break the read-only rule `content/pagestate.js` is built on.

### 2.2 Difficult Moves is a JSON endpoint with FEN + correct move

`https://www.chessable.com/difficult-moves/` is an **mt1 iframe** page
(`/mt1/difficult-moves/`) with a client-side DataTable fed by one plain GET:

```
GET /ajax/difficult-moves-ajax.php      → { draw, recordsFiltered, recordsTotal, data: [...] }
```

Corrected 2026-08-09: it is **parameterised**, and one of the two matters.
`bid` is the course picker (`0` = all courses) and `lid` the chapter picker
(`-1` = all chapters), both applied server-side. **Omitting `lid` silently
under-reports** — 34 rows against the page's own 38 on the test account, the
missing four being two whole variations of one course, reproducible and not a
cache or auth artefact. Always send `lid=-1`. The DataTable is
`serverSide: false`, so one GET returns the lot and its paging is client-side.

Row shape:

```json
{ "name": "repeating same piece test1 (move 1)", "attempted": "7",
  "lastUpdated": "1 min ago", "lastUpdatedNum": "2026-07-25 23:53:27",
  "totalamount": "2", "accuracy": "71.43%", "openingId": "70392460",
  "moveId": "0", "color": "b",
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
  "correctMove": "c5",
  "wrongMoves": [{ "move": "timeU", "amount": 2 }],
  "bid": "453453" }
```

* `moveId` ≡ the trainer's `mid`; `fen` is the position BEFORE the move;
  `correctMove` is the course move in SAN; `wrongMoves` aggregates what was
  played instead (`"timeU"` = timed out).
* **It is live.** Before the test session: 9 rows, newest "4 days ago". One
  variation completed with three failures → 12 rows, three of them
  "1 min ago" with `lastUpdatedNum` matching the save POST.
* `lastUpdatedNum` is server local time and matches
  `sessionStats.serverStartTime_formatted` in page state, so a
  "since session start" filter is possible — but a **snapshot/diff** around the
  session (row set + `totalamount` per `openingId:moveId`) is simpler and
  needs no clock alignment.
* Same-origin, cookie-authenticated → fetchable **from a content script** with
  **no new host permission**. It must NOT be fetched from `background.js`
  (that would need a chessable.com host permission).

### 2.3 How a retry can be delivered on Chessable's own board

| Route | Behaviour | SRS |
|---|---|---|
| `/learn/<bid>/<oid>/<lid>[/w\|b]` | Real quiz of that one variation ("Quiz Black to play!", timer), `startedAsOverstudy: true` | Overstudy — no scheduling change |
| `/practice/<bid>/<oid>/<lid>` | Real quiz of that one variation, `lessonStudyMode: "review"` | Counts as a review |
| `/learn/<bid>/<oid1>,<oid2>/…` | Chessable's 404 ("ILLEGAL MOVE") | — |

So **one variation per session URL**; no multi-variation retry list exists.

The queue does not need page loads, though:

* Drawer rows are `.mt-drawer-content__variations__link` carrying `oid`, `lid`,
  `title`. A plain **untrusted `.click()`** on one switches the trainer to that
  variation in-session (pushState, new quiz starts, no reload) — verified in
  both `/learn/` and `/practice/`.
* In a `/learn/` session the drawer lists the **whole course** (75 rows across
  both chapters on the test course). In a `/practice/` session it lists only the
  session's variations, and a click there lands on `/practice/<bid>/<oid>/<lid>`
  in `lessonStudyMode: "review"` — i.e. **a real review**. Retry must therefore
  run in `/learn/`, never by clicking rows in a `/practice/` session.
* There is **no arbitrary-FEN quiz** anywhere on Chessable (Analysis/Setup
  Position are boards, not quizzes). Quizzing *only* the failed move on their
  board is impossible — but see §3.2.

### 2.4 Incidental

* MoveTrainer2's board commits moves through rAF, so a **hidden** tab never
  completes one (an automation finding, but it also means: never drive a retry
  queue in a background tab). Drawer clicks and other React handlers work fine
  while hidden.
* Chessable already re-asks a failed variation once more inside the same
  session (`isQuizCurrentlyInRetry`, `maxRetry` in `progress`). The feature is
  still worth having — it is optional, after the fact, and repeatable — but it
  should be described as "retry again", not "the only retry".

---

## 3. Proposal

Two layers. Layer 1 is the feature as asked and reuses almost everything the
extension already has. Layer 2 is the only way to drill a single move in
isolation, and is the natural home for the Difficult Moves data.

### 3.1 Layer 1 — mistake log + Chessable-native retry queue (recommended first)

**Section 16 — mistake log (top document, `isTrainerPath()`).**

* Extend `content/pagestate.js` `readLine()` (still read-only, still shape-based)
  to include per ply: `mid`, `ply`, `isUserMove`, `isKey`, `variationName`,
  `from`/`to`/`san`/`color`/`sourceFen` (already there), and a trimmed
  `progress` — `{finished, quizTotal, quizIncorrectTotal, quizIncorrectAttempts,
  softFail}` — plus context-level `lessonStudyMode`, `startedAsOverstudy`, `lid`.
  Auto-play's existing callers ignore the extra fields; nothing else changes.
* The existing 500 ms trainer tick (and the auto-play board observer, which
  already fires per frame) samples the plan and, whenever
  `quizIncorrectTotal` for a `mid` grows, upserts an entry into
  `chrome.storage.session` key `cloMistakeLog`:

  ```
  cloMistakeLog[bid][`${oid}:${mid}`] = {
    oid, lid, mid, ply, san, from, to, color, sourceFen, title,
    wrong: ["timeUp", "c5"], ts, mode: "review" | "overstudy", retried: false
  }
  ```

  Same policy as `cloAutoPlayRecord`: session area only, 12 h TTL, per course.
  A stale mistake list must never outlive the browser session.
* Overstudy runs (`startedAsOverstudy`) are recorded under `mode: "overstudy"`
  and are **not** what the "session mistakes" count shows by default — otherwise
  the retry pass itself would keep refilling the queue. A move failed *again*
  during a retry flips `retried: false` back on, so a second pass can include it.
* Backstop (optional, cheap): snapshot `/ajax/difficult-moves-ajax.php` at
  session start and diff at session end; any `openingId:moveId` whose
  `totalamount` grew that the live reader missed gets added (it carries `fen`
  and `correctMove`, enough for the queue). This covers the one race the live
  reader has — a variation completed and skipped faster than a poll.

**Section 17 — retry runner (top document).**

* UI: a third cluster on the existing body-mounted overstudy widget (same place
  the auto-play cluster lives) — `Mistakes (N)` + `Retry` + a small popup
  listing the failed moves (`variation title — 5…Nc6 — played c5 / timed out`,
  each with a checkbox). Visible during the session too, count growing live.
  Nothing is mounted inside Chessable's React tree, per the existing rule.
* Pressing Retry builds a queue of `{oid, lid, mid}` in mistake order and
  navigates **once** to `/learn/<bid>/<oid₁>/<lid>` (SRS-neutral). Subsequent
  entries are reached by `.click()` on the drawer row for that `oid` — no page
  load, and it works across chapters because the `/learn/` drawer holds the
  whole course. A queue spanning several courses needs one navigation per
  course; keep the queue per course and offer them in sequence.
* **Auto-play does the "only the failed move" part.** Retry mode forces
  auto-play on for the duration (restoring the user's `cloAutoPlayEnabled`
  afterwards) so the line replays the moves that were answered correctly this
  session and hands over exactly at the failed move — the proofs are already in
  `chrome.storage.session`, already shared per course between `/practice/` and
  `/learn/`. Where the preceding moves were also failed there is no proof and
  the user simply plays them.
* After the target `mid` is answered, the runner does **not** need the rest of
  the line: click the next queue entry's drawer row straight away
  ("replay → answer the mistake → next"). A setting can make it finish the
  variation instead. This deliberately does not touch auto-play's
  `handedOver` rule (no resuming mid-line — it was reported as jarring).

  > **"Straight away" is not straight away, and the gap is a correctness hole
  > (found and closed in v0.54.0).** Advancing on an answered move is a decision
  > only the runner makes; the trainer knows nothing about it. So the correct
  > move lands at t=0, Chessable finishes gliding the opponent's reply in at
  > t≈440 ms, and the board is then **live and asking for the next move of the
  > line** while the pass spends up to a tick noticing (`passedPly`, sampled at
  > `pollMs`) and then a beat before the drawer click. That is ~2.3 s on which
  > the trainer asks for exactly the moves "From the mistake" and "Only the
  > mistakes" promise not to ask for — and a wrong move played there is logged
  > as a new mistake, refilling the queue the pass is draining.
  >
  > The fix is to cover Chessable's board for the transition rather than to
  > chase the latency: a transparent, body-mounted shield over
  > `getReviewBoard()`, raised at *mutation* speed by an auto-play bridge
  > (`retryNoteTargetPlayed`, fired from `applyObservedMove` when a user-colour
  > move is played from the item's **last** failed position — never an earlier
  > one, or the replay of the moves between two mistakes would happen behind
  > it). Transparent because the opponent's reply underneath is the
  > confirmation that the move was accepted. Two stages, since the answer is
  > not confirmed when the shield goes up: an edge glow first (a silently dead
  > board with no cue reads as a freeze), a green "Correct move!" when
  > `driveRun` confirms. Auto-play is held off by a flag of its own
  > (`ap.retryHeld`, ORed with `ap.heldOff` in one `held()` predicate) because
  > in "Only the mistakes" `resumeAfterHandover` is still true through the gap.
  > Everything fails open on a watchdog run from the tick's `finally`: a stuck
  > shield is far worse than the gap it closes, and a *failed* retry must show
  > the glow, never the pill, and expire.
  >
  > "Whole variation" never raises it — that mode advances from the browse
  > state, where the board is not live, so the moves after the last mistake are
  > legitimately the user's to play.
* Status chip: `Retry 2/5 — <variation>` with `Skip` / `Stop`; Stop restores the
  auto-play setting and leaves the user in the current overstudy.
* Failure paths, all degrading to plain overstudy rather than to a wrong board
  state: drawer row for an `oid` missing (course drawer not loaded / variation
  suspended) → fall back to a `/learn/<bid>/<oid>/<lid>` navigation; oracle
  unreadable → no auto-play, the user plays the line by hand; `document.hidden`
  → the runner pauses (the board cannot commit moves anyway).

**Cost:** the log is small (one extra page-state read that is already happening
plus a storage upsert). The runner is a queue + drawer clicks + the existing
completion gate. No new permissions, no new hosts, no new libraries.

### 3.2 Layer 2 — "Drill" on our own board (optional, and the only true single-move retry)

> **Built in v0.45.0 as section 20, and the sketch below is superseded on three
> points.** (a) There is no board of its own: sections 18/19 had since built one
> — real piece art cloned off Chessable's board, drag and click, promotion
> picker, arrows — so the drill is a third MODE of those overlays, and a card is
> built in the very line shape their quiz plays. (b) `/difficult-moves` is not
> used and no request is made at all: the session log already carries the exact
> `sourceFen` and the course SAN, and section 16 now also stores the plies
> BEFORE the failed one (`lead`), which is what lets a card play the opponent's
> move first instead of dropping the user into a bare position. (c) The
> "accepts only the course move" trade-off below stands, unmitigated for now: a
> miss shows the move after two tries, and only a clean answer takes the mistake
> off the list, so an alternative the trainer would have accepted costs a
> re-drill rather than anything worse. Routing it into section 15's alt-check
> remains the obvious next step. The original sketch:

Chessable cannot quiz a bare FEN, so a real one-card-per-mistake drill has to be
ours. It is self-contained and cheap in dependencies:

* Cards come from either source: the session log (§3.1) or
  `/ajax/difficult-moves-ajax.php` (all-time, all courses, `fen` +
  `correctMove` + `wrongMoves` + accuracy + `lastUpdated`).
* Board: an 8×8 CSS grid with Unicode piece glyphs (zero assets, no
  Chessable markup borrowed), click-to-move, `CloSan` for legality and SAN
  (`parseFen` / `generateMoves` / `makeMove` / `moveToSan` are already there and
  node-testable). Right answer → next card; wrong → show the course move, and
  optionally the existing engine + Lichess panel for context (both already know
  how to work from a FEN).
* Zero writes to Chessable: no progress POST, no scheduling change, no stat
  pollution — which is exactly the "no SRS, just a retry" the request asks for.
* Natural extra home: the Difficult Moves page itself. The content script
  currently exits in mt1 iframes other than `/mt1/explore/` and `/mt1/analysis/`;
  allowing `/mt1/difficult-moves/` lets us add a "Drill these (N)" button next
  to their table, honouring their course/chapter filter. That page is untouched
  by the extension today and is where a user already goes looking for this.

Trade-off to be explicit about: our board accepts only the course move. The
trainer would also accept the variation's registered alternatives, which we
cannot see from `correctMove` alone — so a drill card can call "wrong" what
Chessable would accept. Mitigations: show the course move on a miss and let the
user mark the card as passed; or route "I think this is also fine" straight into
the existing section 15 alt-check flow, which already engine-checks a refused
move and can add it as an alternative.

### 3.3 What I would NOT build

* Hooking `fetch`/XHR to read `saveProgressAndReturnNewProgressInfo`. The same
  data is in page state, and `pagestate.js` is read-only by design.
* Any POST to Chessable to create a custom list/session. Their edit-form fields
  are session/CSRF-bound (see the quick-edit notes), and inventing a retry list
  server-side is exactly the kind of write this extension has avoided.
* Retrying via `/practice/<bid>/<oid>/<lid>` (a drawer click inside a review
  session). It is a real review and would change scheduling — the opposite of
  what was asked.

---

## 4. Suggested phasing

1. **Mistake log only** (§3.1 section 16) + a read-out on the widget:
   `Mistakes (3)` with a hover list. Immediately useful, and it de-risks
   everything else — one session of use shows whether the plan reader catches
   every failure (compare against the Difficult Moves diff).
2. **Retry runner** (§3.1 section 17), starting with the simplest shape:
   navigate to the first failed variation's overstudy, auto-play on, chip with
   Next/Stop, drawer-click advance.
3. **Difficult Moves drill** (§3.2), first as "drill this session's mistakes on
   our own board", then the Difficult Moves page button with its filters.

## 5. Open questions / to verify before or during implementation

* Does an overstudy run change anything schedulable? The POST carries
  `overstudied` and `overstudyPoints` separately from `points`/`level`, which
  says no, but it was not observed end-to-end. Also unknown: whether a mistake
  made during overstudy feeds the Difficult Moves stats (it plausibly does).
* ~~Is every failed move listed, or only those under some accuracy bar?~~
  **Answered 2026-08-09: there is no bar.** The listing goes up to 93.33% on the
  test account (7 rows in 90-95%), so the list is "ever failed", not "currently
  bad" — which is what lets section 13b read *absence* as "never missed".
* Does `/ajax/difficult-moves-ajax.php` cap its row count for a heavy account?
  Still unknown — the largest set observed is 38 rows / 26 KB (~686 bytes per
  row), and there are no wire pagination parameters, the DataTable being
  client-side. Extrapolating, a 1000-move account would be one ~670 KB request.
  Section 13b fetches per course (`bid`), which bounds it in practice.
* End-of-session recap: `ctx` exposes `isSessionEnd`, `recapShown` and
  `sessionStats` (aggregates: `quizUniqueTotal`, `quizUniqueFlawless` — counts,
  not identities). Worth a look for where the "Retry mistakes" entry point feels
  most natural, though the widget stays the mount point either way.
* `mid` ↔ `ply` mapping is verified for a plain line. Tactics lines that start
  mid-game renumber on the edit page (see the quick-edit notes); the mapping
  used here comes from the plan itself, so it should be immune — worth one
  check on a tactics course.
* Soft fail (`useSoftFail` / `softFail`): decide whether a soft-failed move
  counts as a mistake for the queue. `quizIncorrectAttempts` appears to be the
  authority either way.

---

## 6. The list as a session history (v0.61.0, implemented)

**Ask:** "I want the past mistakes to continue to be available during the
session, even after Retry — save the history in an expandable menu, by chapter,
and let me retry them as many times as I want."

**Nothing had to be stored that was not already stored.** `retried` was always a
flag and `ml.log` never deletes below the 12 h TTL, so the whole session was in
`chrome.storage.session` the entire time — what was missing was a way back to
it. `pending()` (the queue: not retried, not overstudy-mode) and `all()` are now
two views of one store, and the split of readers is the whole safety argument:

| Reader | View | Why |
|---|---|---|
| `Mistakes (N)` count, `reviewRowPrimary`, row `Retry`, `Drill mistakes (N)` | `pending()` | "outstanding" must keep meaning outstanding, or a pass refills its own queue |
| the popup's list, `Retry selected`, `Drill selected` | `all()` | an explicit tick is the user saying "again" |

**Three things had to change, and each was a real hole:**

1. **The door disappeared with the queue.** `syncUi` hid the cluster on
   `!pending.length`, so the moment a pass finished, the data was still there
   and nothing on screen could reach it. Now the cluster and the count live on
   `!history.length`; only `Retry` (which acts on the outstanding set) goes.
2. **The count could not just keep counting.** Amber outline means "you have N
   outstanding items" (DESIGN-ui-inventory §3.2). `Mistakes (0)` in attention
   colours claims work that is done, so with nothing outstanding the button
   reads `Mistakes (0 of 7)` and drops to the neutral outline
   (`.clo-mx-btn--quiet`) — the row's "an action away from the main task" tier.
3. **The default tick had to become per-row.** Checked = outstanding; an
   already-retried move is offered, never re-imposed. Keeping the original
   "only what the user changed is remembered" property (so a mistake logged
   while the popup is open joins the pass by itself) then needs TWO sets —
   `deselected` and `reselected` — over a derived default, not one list of what
   is ticked. It is also why `renderList`'s signature now includes each row's
   tick and `retried` state: a pass finishing under an open popup flips rows,
   and the list has to follow.

**Chapters.** Ground-truthed 2026-08-03 on course 453453: the trainer drawer is
one `.mt-drawer-content` block per chapter — an `<h3>` with the name, then the
rows, every row carrying that chapter's `lid` — and the whole thing is rendered
with the drawer CLOSED. So the name is captured at ingest beside `title`
(`readCurrentMeta` → `entry.chapter`), with a live `chapterNames()` scan as the
fallback for entries an older build logged and `Chapter <lid>` as the last
resort. Sections are ordered by the drawer, so the popup reads the way the
course does. Folding is per chapter and survives a close/open; a group's
**All/None** is what makes "go through this chapter again" one gesture, which
was the point of the request.

**Not built:** persisting history past the session (the TTL is deliberate —
§3.1's "a stale list would drill another day's moves"), and any change to what
a pass does with an entry it has already marked. Re-retrying is just `startRun`
over entries whose `retried` flag stays set; `markRetried` spares them because
they are already marked, and the pass advances on `passedPly`, which never
consulted the log.

---

# 7. Implementation notes — the log and the runner as built

§1–5 are the original design and §6 the list-as-history change. What follows is
the feature as it actually works, kept here rather than in CLAUDE.md.

## 7.1 The log's source is the trainer's OWN per-ply `progress`

`quizIncorrectAttempts` in the lesson plan — the refused SAN, or the literal
`"timeUp"`, or `"giveUp"` (section 23's honest "I don't know"), once per failed
attempt. **Not the DOM, and not a hooked `fetch`**
(`saveProgressAndReturnNewProgressInfo` carries the same data, and `pagestate.js`
is read-only by design).

Sampled ~1/s in trainer sessions, keyed on the trainer's `mid` (= difficult-moves'
`moveId`), stored in `chrome.storage.session.cloMistakeLog` per course with the
auto-play record's 12 h TTL. **Session area only** — a stale list would drill
another day's moves.

Counters are PER-LESSON, so growth is measured against what THIS document already
logged (`ml.seen`).

### The `mode` field, and why the route decides it

An entry keeps the `mode` it was FIRST seen in. Overstudy-mode entries are excluded
from the count (else the retry pass refills its own queue), while a move failed
again during its retry keeps mode `'review'` and merely gets `retried: false`
again — the sole upgrade is `'overstudy'` → the current mode, which is also what
heals an entry another tab mislabelled.

**What makes a run "overstudy" is the ROUTE, not Chessable's per-ply
`startedAsOverstudy`** (v0.35.1). That flag is true for a variation Chessable
itself counts as overstudy inside an ORDINARY `/practice/` review session too — a
card that was not due — so trusting it filed real review mistakes under
`'overstudy'` and hid them from Retry for the session. A `/practice/` ply is
therefore always `'review'`; only in `/learn/` does `startedAsOverstudy` decide.
Safe because the runner only ever drives `/learn/`.

Writes MERGE (`mergeEntry`) — every tab shares that storage area, and a background
overstudy tab used to be able to overwrite the review tab's log.

### `lead`, and why it is captured at ingest

The NEW `lead` field holds the plies before the failed move, captured in `ingest`
where the whole plan is in hand, because it is unobtainable later without loading
that variation — which is the very cost the drill (section 20) exists to avoid.

`CONFIG.retry.leadPlies` (4) is what is STORED, `CONFIG.continuation.drillLeadPlies`
(1) is what is PLAYED: the run-up length is meant to become a setting and a stored
log cannot be back-filled. An entry logged before v0.45.0 has no `lead` and simply
gets no run-up.

### Chapter grouping

`mistakeLogApi.byChapter`. The name comes off the entry's own `chapter` field,
captured at ingest beside `title`, from the drawer BLOCK the active row sits in
(`SELECTORS.reviewDrawerBlock` + `reviewDrawerChapter`, ground-truthed 2026-08-03
on course 453453, whose two chapters are two `.mt-drawer-content` blocks, both
fully rendered with the drawer CLOSED). Falls back to a live `chapterNames()` scan
for entries an older build logged, then to `Chapter <lid>`.

Section order follows the DRAWER, so the popup reads the way the course does.
Grouping on `lid` is exact — every row of a block carries its chapter's lid.

### Selection is DERIVED, not owned by the DOM

`isChecked` = `reselected` ∪ (default ∖ `deselected`), default = `isPending`. Two
sets rather than one list of what is ticked, because that is what KEEPS the
original property — a mistake logged while the popup is open joins the pass by
itself — now that the default differs per row.

It is also why `renderList`'s signature includes the tick and `retried` state: a
pass finishing under an open popup flips rows to "already gone through", and the
list has to follow. Folds survive an open (`rr.collapsed`); ticks do not — every
open starts from "the outstanding ones". A group's All/None is the point of the
whole feature: going through a chapter again must be one gesture, not one click per
move.

## 7.2 The runner

The queue is one item per VARIATION (target = the LAST failed move of the line; the
earlier ones are met on the way) and lives in
`chrome.storage.session.cloRetryRun`, because the FIRST switch is a real navigation
that destroys the document — the next one adopts the pass.

Only that one costs a load: in a `/learn/` session an untrusted `.click()` on
`SELECTORS.reviewDrawerRow` (carries `oid`/`lid`/`title`) switches variation
in-session, and the `/learn/` drawer lists the WHOLE course.

**Never click a drawer row in a `/practice/` session** — the runner would then go
on to ANSWER that variation, and ANSWERING is what reschedules it, which is the
opposite of what a retry pass is for. So it treats "right oid, wrong route" as not
yet arrived and navigates out.

> The CLICK itself reschedules nothing — measured 2026-08-09, zero `saveProgress`
> and an unchanged due count; `DESIGN-difficult-moves.md` §6 is built on exactly
> that. This rule is about what the runner does NEXT.

A browse state on the item's OWN variation is normally the previous one still
painted a beat after the switch (hence the early return), but if it OUTLASTS
`browseGraceMs` the pass is parked on a variation the trainer has finished — where
a pass that starts on the variation the previous one ended on lands (fail the last
one, press Retry again): the oid already matches so nothing switches, and its drawer
row is the ACTIVE one so clicking it does nothing. Only reloading the overstudy URL
re-quizzes it, which is why `navigateToItem` falls back to `location.reload()` when
the target URL is the one already loaded (v0.29.1).

### Ownership

`storage.session` is profile-wide, so a run is OWNED by one document (random id +
`beat` heartbeat): a navigating document hands over by nulling `owner`, a quiet
owner is takeable after `ownerStaleMs`, and the owner ends its own pass on
`pagehide` (unless `rr.handingOver`), after `awayStopMs` off the trainer path inside
the SPA, or via the `runAbandonMs` sweep for a tab that died — always restoring
`cloAutoPlayEnabled` to `run.prevAutoPlay`.

Counters that live in the RECORD must be saved to survive the per-tick reload
(`loadRun`); `rr.waits` is deliberately document-local for that reason.

### Advance = the trainer standing on a LATER PLY than the target

`mistakeLogApi.passedPly` (v0.53.3), or the variation completing.
`quizCorrectTotal` growing past the value read ON ARRIVAL (a BASELINE, not `> 0`: a
seeded counter would race the whole queue through) is kept only as a second signal.

The clock is the lesson plan's own `fen` — Chessable's current position — located
among the plies' `sourceFen`s on the four-field key, i.e. §8's ply clock, and a
quiz cannot be left behind without being answered.

**Both sides of that compare are POSITIONS** (the item carries the target's own
`sourceFen` as `targetFen`), never `mkey`: `plyKey` is `'m' + mid` and `mid` numbers
the USER's moves, not the plies — hence the runner's own `mid * 2` fallback — so a
key lookup could resolve to an EARLIER ply, and "past it" then went true exactly as
the trainer ARRIVED at the failed move. The pass advanced, `applyHold` dropped its
holds, and auto-play played the very mistake the user was being asked for: a brief
pause, then the move (v0.53.4).

Standing ON the target is answered explicitly rather than left to the index compare,
so a position repeating inside a variation — where `findIndex` resolves to the FIRST
occurrence — still cannot read as "past it".

The counter alone was NOT enough: its baseline is read on the first arrival tick,
and one reading taken a beat early (off the outgoing lesson's plan, before the
overstudy's own counters are in place) leaves the comparison one short FOR EVER, so
the pass never moved on early and the user played out the whole tail of every line
— in "Only the mistakes" that is the one thing the mode promises not to ask for.

The last position of a variation is nobody's `sourceFen`, so a target that IS the
final ply reads as "not past it" and the browse state ends that visit instead; a
repeated position resolves to its first occurrence, which can only err towards "not
yet".

`markRetried(oid, visit.at)` deliberately spares entries whose ts is NEWER than the
visit, which is what keeps a re-failed move in the list.

### Holds

Auto-play is told to hold on ALL of the item's failed positions (`autoPlaySetHold`,
compared on placement+side only because the tracker's castling can be the
home-square heuristic) — a move failed early and answered correctly later IS proven,
and would otherwise be replayed past.

`applyHold` picks that item by the oid ON SCREEN, **not** by `run.index` (v0.53.4):
auto-playing a move the user is being asked to retry is the one outcome this feature
must never produce, and hanging the hold off the queue cursor made every reason the
cursor can move on early — a clock reading a beat ahead, the switch to the next item
not having landed yet — lift the hold with the trainer still sitting on the failed
move.

The RESUME flag stays tied to the cursor: holding is about the variation on screen,
taking the board back after a mistake is about the item being driven. So is the
SHIELD TARGET.

### `cloRetryMode`

storage.local, default `'from'`, decides how much of a line the user plays:

* `'whole'` forces `cloAutoPlayEnabled` OFF for the pass and advances only on
  completion;
* `'from'` is the plain hold;
* `'only'` ALSO passes `resumeAfterHandover`, the second argument of the same
  bridge, which lifts auto-play's `vs.handedOver` rule so control comes back after
  each retried mistake (mistakes at moves 8 and 12 ⇒ auto-play 1–7, user 8,
  auto-play 9–11, user 12).

That rule exists because resuming mid-line was reported as jarring, so the lift is
scoped to the variation a pass is DRIVING (`applyHold`'s `here`) and cleared on
every other tick — never let it leak into ordinary sessions.

## 7.3 The transition shield (v0.54.0)

A correctness hole, not polish. Advancing on an answered move is the RUNNER'S
decision and the trainer knows nothing about it: the correct move lands, ~440 ms
later Chessable glides the opponent's reply in, and the board is live and asking for
the NEXT move of the line while the pass spends up to a tick noticing and then a
beat switching.

In `'from'`/`'only'` that is ~2.3 s on which the trainer asks for exactly the moves
the mode promises not to ask for, and a wrong move played there is logged as a NEW
MISTAKE — refilling the queue the pass is draining. (`'whole'` is unaffected: it
advances from the browse state, where the board is not live, so `applyHold` passes
NO target in that mode — shielding there would block the rest of the variation,
which is legitimately the user's to play.)

So a body-mounted div is pinned over `getReviewBoard()` (absolute in DOCUMENT
coordinates like every overlay here) and swallows input in CAPTURE phase.

* **Trigger** = `retryNoteTargetPlayed`, fired from `applyObservedMove` at MUTATION
  speed when a user-colour move is observed from `ap.targetKey` — the ONE hold whose
  answer advances the pass, carried by `autoPlaySetHold`'s third argument. **Never
  every hold**: with mistakes at moves 8 and 12, answering 8 must leave the board
  alone so the replay of 9–11 stays fully VISIBLE. That is the behaviour most likely
  to be got wrong. The key is placement+side, `holdKeys`' own normalisation.
* **Two stages**, because the answer is not confirmed when the shield goes up: stage
  1 claims nothing and only glows at the board edge (half a second of a silently
  dead board with no cue reads as a FREEZE); stage 2, from `driveRun`'s existing
  `passedPly` path via `confirmShield`, is a green "Correct move!" pill. The shield
  is TRANSPARENT — the reply plays underneath and stays visible, which is the
  confirmation the move was accepted — so the pill carries its own background and a
  full-surface tint is out. `cursor: default`, not `not-allowed`: this follows a
  CORRECT answer.
* **Fails open, unconditionally** — a stuck shield is far worse than the gap it
  closes. `syncShield` runs from `tick`'s FINALLY (so every early return passes
  through it) and drops on a `shieldMaxMs` cap, oid change, browse state,
  `document.hidden`, off-path and pass end; `noteDead` drops it too, since `tick`
  returns on `rr.dead` ABOVE its try/finally. A failed retry therefore raises stage
  1, never reaches stage 2, and expires, with Chessable's "Incorrect" note readable
  through the shield throughout. Accepted and deliberately unguarded: a piece
  already picked up when the shield mounts keeps its pointer capture and can still be
  dropped.
* `confirmShield` sets a `holdUntil` (= `advanceHoldMs`), the ONE exemption in that
  watchdog, and it exists for the pass's LAST item: there `advanceItem` → `nextItem`
  → `finishRun` all run in the same task, so "pass ended" fired in the same task the
  pill went up and the user's final correct answer was acknowledged by a ~100 ms
  flash. The exemption is scoped to that one reason — the cap is checked FIRST — and
  `finishRun`'s own eager drop (there so "Stop" gives the board back at once) skips a
  shield inside its hold.
* `processFrame` keeps reading frames while the shield is up (`ap.heldOff`, NOT
  `held()`): the session underneath is really playing, and the opponent's reply is
  what CONFIRMS the user's answer as a proof — skipping it would cost them the record
  for the very move they just got right. Only `evaluateAutoPlay` and `injectMove` ask
  `held()`.
* Auto-play is held by its OWN flag, `ap.retryHeld` via `autoPlayRetryHold` — never
  `ap.heldOff`, which means "an outside feature owns the board". Two owners on one
  boolean lose eventually: this shield self-clears on a watchdog, and a "Review now"
  holding at that moment would have its hold lifted with its own board still over
  Chessable's. The hold matters most in `'only'` mode, where `resumeAfterHandover` is
  still true between the move landing and `advanceItem`.
* **The switch timing is split.** `switchRetryMs` (1800) was doing two unrelated jobs
  — spacing retried switch ATTEMPTS, and giving the answer a beat on screen.
  `nextItem(holdMs)` now sets `run.switchNotBefore` and `maybeSwitch` gates on it
  separately; a shielded mid-line advance passes `advanceHoldMs` (700, long enough to
  read the pill), everything else (skips, completions) keeps the old beat.

### Ground truth (2026-08-02, course 453453, mode `'only'`)

A non-target failed move raises NOTHING; the target raises stage 1 at mutation speed
(transparent, `rgba(0,0,0,0)`, board-sized to the pixel, hit test at the board centre
returns the shield) with stage 2 ~750 ms later — i.e. the two-stage split is
load-bearing, that gap is real; the switch follows `advanceHoldMs` later and the
shield goes down on 'variation changed'; the last item holds the pill ~890 ms then
'pass ended'; a wrong answer at the target gets stage 1 only and 'lifetime cap' at
~3.3 s with the pass NOT advanced.

## 7.4 `startRun` refuses, and says so

It refuses outside the BROWSE STATE (v0.56.0) and **returns false** when it refuses,
so the popup's "Retry selected" can say why in its own status line — the widget's
`setDone` flash sits behind that popup and would never be seen from there (the same
contract as the `continuationDrill` bridge).

Retry is the DESTRUCTIVE sibling of the two mistake launchers — it SWITCHES
VARIATION, so a mid-quiz press abandons the card being answered — yet the drill was
the gated one and this went straight through.

`return true` is sent BEFORE the first `driveRun()` step, never after: the pass
exists once `rr.run` is saved, and a throw in that step must not read back to the
caller as a refusal and print a refusal sentence under a pass that is running.

## 7.5 Still not implemented

The §3.1 diff backstop. Layer 2's drill on our own board landed as section 20; the
`/difficult-moves` endpoint is read by section 13b, though for a different question
than this design imagined — not as a mistake-log backstop but as the lifetime record
behind "difficult moves only" (`DESIGN-difficult-moves.md`).
