# DESIGN — "Retry all mistakes of session"

Status: **Layer 1 implemented in v0.29.0** — the mistake log (section 16) and the
retry runner (section 17) in `content/lichessable.js`, plus the extra fields
`content/pagestate.js` now reads. Layer 2 (§3.2, a drill on our own board fed by
`/difficult-moves`) is NOT implemented, and neither is the optional
difficult-moves diff backstop of §3.1. Ground-truthed live on the test account
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

Row shape (all courses at once, no parameters):

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
* Does `/ajax/difficult-moves-ajax.php` cap its row count for a heavy account
  (the test account returned 9 → 12 rows, no pagination parameters)? And is
  every failed move listed, or only those under some accuracy bar? Every move
  failed in the test session appeared, including one at 91.67% lifetime
  accuracy.
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
