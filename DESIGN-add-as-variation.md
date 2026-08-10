# DESIGN — "Add as variation" (section 19c)

Status: **built in v0.95.0** as section 19c of `content/lichessable.js`, one
destination (§3.3). Everything under "Findings" was ground-truthed live
on the test account 2026-08-10 (source courses **453453** "Testing course" and
**291847** "Intermediate Starter Kit" — a *bought* course, authorUid 5049 — into
target **455941** "Testing Repertoire"). Eight variations were created through the
endpoint and then deleted with `updateOpening&mode=del`; the repertoire was verified
back at its original six by name. Everything under "Open questions" was not tested.

The task note guessed this would be another driven flow like section 12. **It is
not.** There is a JSON API that does the whole job, including the part the note
expected to be hardest, and it is the same JWT-only same-origin auth as section 5c.

---

## 1. What the user asked for

> In our analysis. Add option "Add as variation" to course, if started from a
> specific variation it should include those moves + comments etc.

So: beside section 19's **"Add as line"** (which appends our analysed moves as a
clickable line inside the entry move's *comment*), a second write that makes the
analysed line a **real variation** — its own trainable item, with the source
variation's moves up to the entry point in front of it.

---

## 2. Findings (ground truth, 2026-08-10)

### 2.1 The endpoint

```
POST /api/v1/importSubvariationFromSource
Authorization: Bearer <localStorage['chessable.web.production.JWT']>
platform: web                       (no CSRF field — section 5c's auth exactly)

{ source:       { courseId, variationId },
  target:       { courseId, chapterId },
  subvariation: [ { san, plyNumber, color:'W'|'B',
                    comment?, commentBefore?, nag? }, … ],
  name:         "<title>" }

→ 200 { game: { owned: true, oids: [ 71334625 ] }, hash: "193" }
→ 400 { error: { message: "Illegal SAN at subvariation[0]='Qh8' from FEN='…'" } }
→ 403 { error: { code: "BOOK_NOT_OWNED",
                 userFriendlyErrorMessage: "You do not own the source course" } }
```

This is what Chessable's **own** "add this clickable line to my repertoire" posts —
the context menu on a subvariation in MoveTrainer and on `/variation/<oid>/`
(`enableSubvariationContextMenu` → `handleSubvariationAddToRepertoire` → `Xpe` builds
`sourceImportRequest`, and the destination modal adds `target` and `name`). Field
names, the `'W'|'B'` casing and the `{courseId, chapterId}` object shape were read
out of the minified bundle and then all exercised live.

There is a second, more general creator — `POST /api/v1/importGame?uid&bid` with
`{data: JSON.stringify([{head:{…pgn headers, fen}, color, name, lid, moves:[{san,
color, mid, move, f1, f2, comment, commentB, draws, nag, key}]}])}`, which is what
PGN import and the `/analysis/` page's own "Save to course" drawer use. **We do not
need it**, and should not use it: it would make us responsible for constructing
every FEN, move number and drawing blob, and a variation carrying an `oid` there
**overwrites** that variation (the save-to-course path matches `head.fen + line`
with `allowDup:false`). Recorded here only so nobody has to find it again.

### 2.2 The server splices the prefix — we send only our own moves

`plyNumber` is **absolute in the GAME**, and the server copies the source
variation's own plies in front of ours:

| test | source | first `plyNumber` | result |
|---|---|---|---|
| A | 70382641 (8 plies) | 3 | `1.e4 c5 2.h3 Nc6` |
| B | 70382641 | 7 | `1.e4 c5 2.Nf3 Nc6 3.d4 cxd4 4.Qxd4 Nf6` |
| C | 70382641 | 9 = one past its last ply | `…4.Nxd4 Qb6 5.Nb3 g6` (pure continuation) |
| D | 70382641 | 1 | `1.d4 d5` — no prefix at all |
| E | 48449404, a **bought** course | 5 | `1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6` |
| H | 70455201 (26 plies) | 17 | 16-ply prefix + our two moves |

"Absolute in the game" is not the same as "index in the variation", and a mid-game
source is what shows the difference. Probed against 49865012, whose `initialFEN` is
`3r2k1/2R3bp/2P1p1p1/p7/6P1/4B3/1r3PP1/2R3K1 b - - 0 34`:

```
plyNumber 1 …  9  → 400 "plyNumber (N) is before the source variation start
                         (opening.FEN already has 67 plies played)."
plyNumber 68       → the initialFEN itself      (= the variation's own first ply)
plyNumber 70       → after two plies of it
plyNumber 200      → 400 "Subvariation starts at relative ply 133 (absolute 200,
                         source starts at 67 plies played) but source mainline only
                         has 16 plies — 116 missing plies in between."
```

So:

```
pliesBefore(fen)  = 2 * (fullmove - 1) + (side === 'b' ? 1 : 0)
plyNumber         = pliesBefore(source.initialFEN) + relativePly      (1-based)
1 ≤ relativePly ≤ sourceMainlinePlies + 1
color             = the side to move at that ply — VALIDATED by the server
```

For a standard-start variation `pliesBefore` is 0, which is why every early test
worked with a plain ply index.

**The illegal-SAN error echoes the FEN the server resolved to, so it is a free
read-only probe of these semantics — no write, no cleanup.** That is how the table
above was produced. Keep the trick: it is the cheapest oracle this endpoint has.

The colour check has its own message ("… but the side-to-move at this position is
'B' … The prefix likely landed at the wrong parity"), and an illegal SAN or a bad
`plyNumber` **creates nothing**.

### 2.3 The copied prefix is byte-identical, comments and arrows included

Test H spliced at ply 17 of 70455201, whose first 16 plies carry eight comments and
three sets of drawings. Read back through `getLesson`, the new variation's prefix
matched the source pair for pair:

* `comment_white` / `comment_black` — the stored comment JSON verbatim,
  `{"before":…,"after":…,"data":[…]}`, **including nested clickable lines**
  (`{"key":"V","val":[{"key":"S","val":"2.h3"},…]}`);
* `drawing_white` / `drawing_black` — verbatim, e.g.
  `[{"object":"circle","start":"d4","color":"r","move":"4b","index":"circle_d4"}]`
  and the two arrows on `7b`;
* `annotation_*`, `isKey` (every pair trainable), `comment_before_*`.

So the answer to "what happens to the source variation's per-move comments and
arrows on the copied prefix" is: **Chessable copies them, and we neither send nor
reconstruct anything.** Worth stating plainly because it has a consequence the
feature should own rather than be surprised by: the new variation's prefix carries
the source's clickable lines, so **section 18 will offer those lines in the new
variation too**, and an 18c "!" stays important there. That is correct — the copy is
a genuine sibling of the source, not a stripped one.

Our *own* plies' optional fields round-trip too: `comment` and `commentBefore` come
back as Chessable's `{before, after, data:[{key:'C',val}]}` with the FENs computed
server-side, and `nag: 1` became `annotation_white: 1`.

### 2.4 The rest of what a write decides

* **`initialFEN` comes from the SOURCE variation**, never from our line — verified
  with a source whose FEN is `… w - - 0 1`: the copy carried that FEN even though
  the line was ours from ply 1. Right for us (we branch *inside* that variation),
  and the reason a tactics course works at all.
* **Colour follows the TARGET course.** A `color: "white"` source variation in a
  bought course came out `"black"` in the black repertoire.
* **The source must be OWNED, not authored.** A bought course is a valid source
  (test E). Omitting `source` gives 403 `BOOK_NOT_OWNED`.
* **`chapterId: null` is accepted** and files the variation in `lid` 0, creating no
  chapter — checked through `editVariations` per chapter. Chessable's own modal
  requires a non-null `chapterId`; the API does not.
* `name` is stored verbatim.
* Nothing deduplicates. Two identical imports make two variations, as everywhere
  else in Chessable (DESIGN-repertoire-coverage §2.3).

### 2.5 Both hosts can name the source

* **Trainer** — `readQuickEditBid()` for `source.courseId`, `readQuickEditOid()` for
  `variationId`, and the drawer row's `lid` (`SELECTORS.reviewRowListAttr`) for the
  source chapter.
* **`/variation/<oid>/`** — the oid is in the URL, and the page carries
  `a[href^="/course/"]` links including **`/course/453453/1`, i.e. bid *and* lid**
  (verified live on 70455201, which is in chapter 1). That closes section 19b's "the
  variation host reports NO `bid`" limitation *for this feature*; `variationEditRights()`
  stays the rights signal for everything else.
* Incidental, verified while looking: the variation page's move divs carry
  `data-mid`, `data-fen` (the position AFTER the move), `data-san`, `data-move` and
  `data-index` beside the id. Nothing here needs them; noted so they are not
  rediscovered.

---

## 3. Design

### 3.1 Where it lives

Section **19c**, inside the analysis board (sections 19 and 19b), beside "Add as
line". No new host, no new module, no new message type, **no worker involvement at
all** — this is a `fetch` from the content script, so there is no driver window, no
job cap, no 25 s timeout and no rights probe.

### 3.2 Every field, and where it comes from

Our own board already knows everything:

```
startFen  = cr.an.startFen              — the position after the entry move
base      = pliesBefore(startFen)       — 2*(fullmove-1) + (side==='b')
ply i     → { san:  cr.an.moves[i].san,
              plyNumber: base + i + 1,
              color: (side to move at cr.an.moves[i-1].fen ?? startFen) === 'w' ? 'W' : 'B' }
```

`base + 1` is our first move because `startFen` *is* the position after `base`
plies. No move numbers are parsed, no ply index is arithmetic'd against a source
length, and a mid-game `initialFEN` needs no special case — which is the whole
reason to derive it from the FEN rather than from `entry.plyIndex`.

**One cross-check, when it is free.** `entry.plyIndex` is an independent measure of
the same thing, so where the source variation's `initialFEN` is already in the
section 5c course cache:

```
assert  base - pliesBefore(source.initialFEN)  ===  entry.plyIndex + 1
```

A mismatch means one of the two is wrong, and the cost of firing anyway is the one
genuinely bad outcome this feature has: **a variation silently spliced at the wrong
point.** The server catches most of those (parity, then legality) but not all — two
plies out in a quiet position can be legal for the same side. So a mismatch refuses,
with the numbers in the message. When the source course is not cached the assert is
skipped rather than a 180 KB `getList` being fetched for it; the server's own checks
remain.

### 3.3 Destination and chapter

**This course, in the source variation's own chapter. One destination, no chooser**
(decided with the user 2026-08-10). It needs `authorUid === uid` — section 21's
guard, read through `chessableBooksOnce`, never `isRepertoire` — and the chapter
comes from the drawer row's `lid` in the trainer and from the page's own
`/course/<bid>/<lid>` link on the variation page.

`chapterId` is always sent explicitly, never `null`: null is accepted and lands in
`lid` 0, but that is a fact about today's server, and we know which chapter we mean.

The destination that is **not** built, and what it would cost: **the nominated
repertoire** (section 6c's picker) — "I am studying a bought course and want this
line in what I actually train". It is the only case this feature cannot serve, and
the endpoint already allows it (the source need only be OWNED, §2.4). What it needs
is a chooser and a second answer to "which chapter", which is why it is not in v1;
the arm sentence already names the destination in full, so adding one later changes
that sentence and nothing else. Until then, a course the user did not create refuses
with a sentence saying so and pointing at "Add as line".

### 3.4 The name

Chessable's own convention, which its context menu builds with the branch move:
`"<source variation name> <n>.<san>"` / `"<n>...<san>"`. So ours is the source
variation's title plus the **first move of our line**:

```
"Sicilian: 2...Nc6 3.d4" + " 4.Qxd4"  →  "Sicilian: 2...Nc6 3.d4 4.Qxd4"
```

**Not editable in v1**, and that is a decision rather than an omission: the panel
already has one text field (Add-as-line's comment lead-in, `cr.addPrefix`), and a
second field whose meaning depends on which button is pressed is exactly the kind of
silent mode this project's docs argue against. The name is shown in the arm sentence
before anything is written, and renaming is one click away in Chessable. If it turns
out to matter, the honest fix is a second field with its own label and its own
stored string (`cr.addVarName`), never a shared one.

### 3.5 One button, two presses

"Add as line" is deliberately ONE press (v0.43.0): its preview is on screen while
the button is idle, and the write is recoverable through the pencil's Edit tab.
**"Add as variation" arms first**, for two reasons that do not apply to a comment:
what it creates is a **scheduled card** the user will be quizzed on, and the sentence
that describes it is far too long to sit in the idle status line beside the other
preview. So:

```
press 1 →  Creates "Sicilian: 2...Nc6 3.d4 4.Qxd4" in Testing Repertoire › Main Level:
           4 moves after 3...cxd4. Press again to confirm.
press 2 →  Added as a variation in Testing Repertoire › Main Level.  (+ the line read back)
```

Armed state expires like auto-play's "Clear?" and is dropped by any change to the
line, the destination or the shown move. The button `blur()`s itself after a press,
as every other button here does, or space would fire the second press for free.

The **start position** case, which Add-as-line has to refuse ("no move to comment
on"), is legal here: `relativePly 1`, prefix empty, `initialFEN` from the source.
Add-as-variation is strictly more capable, and `analysisEntryMove()`'s refusals need
re-reading with that in mind — a shown SUB-move stays refused (we would not know
which mainline ply our line continues), but "the board is on the starting position"
does not.

### 3.6 Guards, and what to invalidate afterwards

Section 21's discipline, unchanged:

* **destination authored by the user** (`authorUid === uid` from `fetchChessableBooks`),
  never `isRepertoire`;
* **arm before fire** (§3.5);
* **re-read rather than trust our model**: `getList` on the target after the write,
  confirm the returned oid is there with the moves we expect, and put the *actual*
  line in the status line. A 200 with an unexpected line is reported as a failure.

And one thing §21 does not have to think about, because it writes into a course
nobody is looking at:

* **drop the caches that now lie.** The section 5c reduced-course cache for the
  target bid, and — if the target *is* the nominated repertoire — section 6c's
  built index (`CONFIG.repertoire`, `chrome.storage.session`). Otherwise the panel
  keeps saying "not prepared" about the line the user just prepared, for up to 12 h,
  which reads as the badge feature being broken.

### 3.7 Failure messages

The server's errors are unusually good and they are already sentences; relay them
rather than replacing them with "Save failed". Only three need our own words:

* 403 `BOOK_NOT_OWNED` → "You don't own the course this line comes from." (Should be
  unreachable: we are reading it.)
* no destination → "Choose a course to add it to" / "Nominate a repertoire in the
  panel's settings first."
* a network failure → "Could not reach Chessable — the line is still here, you can
  retry." (Nothing was written; unlike the quick-edit driver there is no
  half-committed state to reason about.)

---

## 3b. Verified live (2026-08-10, v0.95.0)

On the **variation-page host (19b)**, end to end, and this is the whole feature
working: `/variation/70455201/` → step to `3...cxd4` → Analyse → play `4.Qxd4 Nf6`
on our board → press once → *"Creates "gonfreecss vs. Quickstarter Guide - Odds &
Ends || 5. Nxc6 dxc6 4.Qxd4" in Testing course, in this variation's own chapter — 2
moves after cxd4. Press again to confirm."* → press again → *"Adding to "Testing
course"…"* → *"Added as a variation: "…" (e4 c5 Nf3 Nc6 d4 cxd4 Qxd4 Nf6)."*

Read back through the API, variation 71335542 was:

* `1.e4 c5 2.Nf3 Nc6 3.d4 cxd4 4.Qxd4 Nf6` — the source's six plies, then ours;
* in **chapter lid 1**, the source variation's own chapter;
* `color: black`, the target course's;
* prefix comments intact — 643 bytes on `Nc6`, 263 on `d4`, the source's own
  lengths, the clickable line inside them included.

Then deleted; the course was confirmed back at 80 variations.

Also verified live:

* **the refusal on a course the user did not create** — the same flow on
  `/variation/48449404/` (course 291847, a bought one) answers *"You did not create
  "Intermediate Starter Kit", so Chessable will not let you add a variation to it.
  "Add as line" works on courses you can edit."* Nothing written, and the button is
  deliberately live rather than greyed so the press can say that.
* **the trainer host's own readers** (19) — in a live `/learn/453453/70455201/1`
  session the marker row carries `oid=70455201 lid=1` and the URL gives bid
  `453453`, i.e. exactly what `trainerCourseIds()` reads, and lid 1 is that
  variation's real chapter.
* **the arm window was too short.** 10 s expired while the sentence was still being
  read, and a re-press then silently re-armed instead of writing — indistinguishable
  from "nothing happened", since the re-arm reprints the same sentence. Now 30 s
  (`addVarArmMs`). Nothing lurks behind the longer window: any change to the line
  disarms, and the write re-checks `plan.sig`.

**NOT yet verified: the trainer host end to end.** Reaching the browse state means
completing a variation, and driving MoveTrainer2's study/quiz cycle from automation
fought the per-move clock; the attempt was abandoned rather than left half-done on a
live SRS card. What is untested there is only the *composition* — `analysisSource()`'s
trainer branch (readers verified above) feeding a write whose every other step is
host-independent and verified on the variation page. The one thing to watch on the
first real run is the cross-check in §3.2: it compares `pliesBefore(readReviewFen())`
against `entry.plyIndex + 1`, and on that host `readReviewFen()` is the DOM/plan
reconstruction rather than a real `#inputFEN`. If it is ever wrong, the feature
refuses and says so — it does not write.

## 4. What must never happen

* **Never derive `plyNumber` from a move NUMBER**, and never from `entry.plyIndex`
  alone. It is `pliesBefore(fen) + relative ply`, and a tactics variation starting at
  move 34 makes those three quantities differ by 67.
* **Never send a SAN we have not resolved ourselves.** Every one of `cr.an.moves`
  came out of `CloSan.moveToSan` on our own position, so they are exact by
  construction; anything DOM-derived is not, and the failure mode is a variation
  spliced from a move the user did not play.
* **Never send `oid` to `importGame`** — or use `importGame` at all (§2.1). It
  overwrites.
* **Never write without arming**, and never arm on anything but the user's press.
* **No wrong-prefix write.** If the two ply measures disagree, refuse (§3.2).

---

## 5. Open questions

* Whether the endpoint refuses a **target course the user does not author** (a bought
  course). Deliberately not tested — writing into a bought course to find out is not
  worth it, and our own `authorUid` guard makes it moot.
* The `nag` code table beyond `1` → `!`. Our analysed lines carry no annotations, so
  nothing depends on it yet.
* Whether `name` has a length limit or is sanitised.
* What colour the copy gets when the **target course is `color: "both"`** (both test
  courses are black).
* Whether Chessable's own context menu is reachable on a **mainline** move (ours is
  the analysis board, so this only matters if we ever want to mirror their UI).
* Incidental find worth its own look one day: the destination modal reads a course
  list whose chapters carry **`duplicatedOids`** — i.e. Chessable now exposes
  per-chapter duplicate detection, which is the question
  `checkVariationDuplicatesInCourse` failed to answer for section 21.

## 6. Non-goals

* Reconciling anything after the fact — no back-reference is stored (§2.2 of
  DESIGN-repertoire-coverage), and the copy is independent from the moment it exists.
* Editing or deleting the created variation from our UI. `updateOpening&mode=del`
  exists and section 21 uses it; the analysis panel is not where that belongs.
* Adding a clickable line, a drill card or a mistake as a variation. Same endpoint
  would do it; different feature, and the analysis board is what the note asked for.
* Touching "Add as line". Both writes stay: a comment line lives *inside* the source
  variation, a variation is a new trainable item, and the user picks which they meant.
