# DESIGN — "Which variations of this course are missing from my repertoire?"

Status: **implemented and verified live in v0.46.5** as section 21 of
`content/lichessable.js` — read, ranking, add and duplicate-removal all
exercised end to end on the test account 2026-07-29, and the repertoire
restored to its original single variation afterwards. Ground-truthed live on the test account
2026-07-29 against source course **453453** ("Testing course", 77 variations,
Black) and target course **455941** ("Testing Repertoire", 1 variation added
from it). Everything under "Findings" was observed — including the writes,
which were executed and then undone; everything under "Open questions" was not.

Two things changed while building it, both found by testing the tree walk
(§3.1) rather than reasoned about up front, and both now in the code:

* the severity table needed **four** rows, not two. What decides a divergence is
  what the repertoire *has* at that position, not only whose move it is:
  nothing at all is a **hole** (our move) or a **line ends** (theirs — whatever
  they play, our next move is unprepared); a *different* move is an
  **alternative** (ours, a deliberate choice, not a gap) or an **unmet option**
  (theirs). Without the two new rows a repertoire that merely recommends
  something else reads as a hole, and one that simply stops reads as "you may
  never be asked" — the opposite of true;
* "transpositions are covered" means less than it sounds. A course line reaching
  the repertoire's positions by another *move order* is still reported, at the
  first move the repertoire has no answer to: against an 1.e4 repertoire, a line
  starting 1.Nf3 is a real gap however it transposes on move 3. What the walk
  actually buys is the *other* case in §3.1 — the same line already present
  under a different name, from another course, or edited since.

Four more things came out of testing it against the live site, all now fixed in
the code and folded into the sections below:

* **`getList`'s `moves[].san` carries the move number** — the array reads
  `["1.e4", "c5", "2.Nf3", …]`, not `["e4", "c5", …]`. Taking §2.4 at face value
  made 76 of 77 lines "unplayable" and produced a confident **"0 of 77 present ·
  0 missing"**. The number is stripped now, and a run where most lines fail to
  replay is refused outright with the offending lines named in the console — a
  systematic parse failure must never come back looking like an answer;
* **the `duplicateVariationsToRepertoire` body is now captured exactly** (§2.1);
  `targetCourse` is an **object**, which is why it is not called
  `targetCourseId`. A bare number gets `403 UNAUTHORIZED`;
* **a line whose start position the repertoire never reaches cannot be ranked.**
  There are no opponent plies before its divergence to multiply, so the walk
  handed every tactics puzzle P = 1 and a perfect score of 1.0000, sorting the
  lines we know least about to the top. They now read "—" and say why;
* **the target repertoire must be read fresh on every run**, never from the
  session cache. It is the side that changes — through our own writes and
  through Chessable's own add flow in another tab — and a cached read reported
  "0 duplicated" about a repertoire that had just gained a duplicate. The source
  course, which is big and static, is still cached.

A **cross-colour comparison** is also flagged now: a White course against a
Black repertoire produces a full report in which every line diverges at ply 0
on our own first move and scores a perfect 1.0. It is not refused ("none of
these are in there" is still true) but the panel says the ranking means nothing.

Decisions already taken with the user (2026-07-29):

* the feature **writes** as well as reads — finding the gaps and adding them
  are one press apart;
* matching is **position-tree coverage**, not a variation-list diff;
* ranking is **Lichess reachability probability**, with **divergence depth as a
  second signal that meaningfully moves the order**.

---

## 1. What the user asked for

Chessable's "Add to Repertoire" copies variations out of any course (bought
ones included) into one of the user's own courses, which is then what they
actually train. The feature has no ledger: after adding 90 of a course's 100
variations there is no way to see which 10 are left, short of comparing two
lists of move sequences by hand.

Asked for, in order:

1. a "find the missing variations" mode;
2. then, ranking those by how likely the user is to actually face them —
   Lichess database probability, and any other usable measure of importance.

---

## 2. Findings (ground truth, 2026-07-29)

### 2.1 The add flow, and the two calls it makes

Course page → **Add to Repertoire** → step 1 pick chapters → step 2 pick
variations (every variation of every chapter is listed, with checkboxes and a
separate "Informational Variations" bucket) → step 3 pick an existing
repertoire or create one. Nowhere in those three steps is there any indication
of what is **already** in the target. That is the whole gap.

Pressing the final button fires, in order:

```
POST /api/v1/checkVariationDuplicatesInCourse
     {oids:[…], sourceCourseId:"453453", targetCourseId:455941}
  → {duplicatedChapters: [], hash: "185"}

POST /api/v1/duplicateVariationsToRepertoire
     {variations:[{oid: 70382641, chapterName: "Main Level"}, …],
      sourceCourseId: "453453",
      targetCourse: {courseId: 455941, chapterId: null}}
  → {success: true, hash: "185"}
```

**The exact add body was captured 2026-07-29** by hooking `fetch`, driving
Chessable's own three-step flow to its final button and *blocking* the request,
so the shape was read without writing anything. Two details the bundle alone did
not give:

* `targetCourse` is an **object**, `{courseId, chapterId}` — *that* is why it is
  not called `targetCourseId` like the check call's field. Passing the bare
  number `455941` returns **`403 {"code":"UNAUTHORIZED"}`**, which reads like an
  auth problem and is not one: the same headers get `200` on the check call.
* `chapterId: null` is what the UI sends when the user picks a *repertoire*
  rather than a chapter inside it, and means "file these under a chapter called
  `chapterName`". Passing a real chapter id is presumably how it merges into an
  existing chapter — untested, and the reason §4's chapter question is now a
  question about `chapterId`, not about `chapterName`.

`oid` is a number, `sourceCourseId` a string. The `hash` in every response is a
constant (`"185"` in all of them, including errors), not a per-request token —
more evidence the check call hands out nothing the add needs.

Both are same-origin, `Authorization: Bearer <localStorage
['chessable.web.production.JWT']>` + `platform: web`, **no CSRF token** — i.e.
the same auth as `getList` and `saveOrder`, drivable with a plain `fetch` from
the content script. (Contrast the variation-comment edit form, which is
session/CSRF-bound and forces the edit-page-driving hack of section 12.)

**`checkVariationDuplicatesInCourse` is NOT the answer to this feature.** It
was the obvious candidate and it is not: called by hand with all 77 source oids
against a target that *already contained all 77*, it still returned
`duplicatedChapters: []`. Called with the single oid that was demonstrably
already there — same empty answer. Whatever it detects, it is not variation
membership. Do not build on it.

The `duplicateVariationsToRepertoire` field names were read out of the minified
bundle (`variations`, `sourceCourseId`, `targetCourse` — note the last one is
*not* `targetCourseId`, unlike the check call's). The body was captured live at
2000 chars and truncated before its tail, so **the exact top-level shape still
needs one confirming hand-built call** before anything ships.

### 2.2 The copy keeps no back-reference

A variation added to a repertoire is a brand-new oid with `bid` = the target
course. It preserves `name`, the `moves` array (SAN byte-identical, `isKey`
flags included), `color` and `initialFEN`. It carries **nothing** identifying
the course or variation it came from.

So membership can only ever be decided from the moves themselves. Verified by
diffing the joined SAN of both courses: after adding all 77, exactly 0 were
"missing" and 71 lines appeared more than once — the match is exact and
reliable.

### 2.3 Chessable does not deduplicate, at all

Adding the same course twice took the repertoire 1 → 78 → 155 variations, with
71 lines present three times over. Each add also created a **new chapter per
source chapter**: the target went from 1 chapter to 5, three of them named
"Main Level" and two "sicil test". No merge, no warning.

So "which are missing" and "which did I add twice" are the same missing
feature, and a repertoire that has been topped up a few times is already dirty.

### 2.4 One call per course gives us everything

`GET /api/v1/getList?uid=<uid>&bid=<bid>` (already implemented in the extension
as `courseSearchUrl`/`fetchCourseFen`, section 18, minus the `fen` param) →

```
{ list: { name, owned, data: [ {id, bid, name, moves:[{san,isKey,…}], color,
                               type, initialFEN, isImportant, isBookmarked,
                               ecoCode, paused, …} ],
          fens: [ {oid, move, fen} ], … } }
```

**`moves[].san` carries the move number** on every White ply — the array reads
`["1.e4", "c5", "2.Nf3", "Nc6", …]`, one ply per entry, same convention as the
PGN-ish `moves` *string* that `editVariations` returns. Strip `/^\d+\.+/` before
handing it to a SAN parser. (Missed on the first pass and worth stating loudly:
every line then failed to replay, and the report said "0 of 77 present · 0
missing" with a footnote rather than an error.)

`getList` also works on a course the user does **not** own — verified on 291847,
81 variations, `data[].moves` fully populated — so a bought course is a usable
source. That closes one of §4's questions.

77 variations → 1563 fens → ~180 KB. `data[].moves[].san` is the full line;
`fens` holds the position after each ply *except the last* (an 8-ply variation
yields 7 entries, `move` 0 = after ply 1). Since we can walk SAN ourselves with
`sanToUci`/`fenAfterUci`, `fens` is a cross-check, not a dependency — and
walking it ourselves is what makes en passant and castling rights exact.

`getList` has **no chapter field**. Chapter grouping, if wanted, costs one
`GET /api/v1/editVariations?bid&lid&includeDeleted=0&locale=en` per chapter
(`chapterCount` comes from home data); that response also carries
`course.color`, the repertoire side.

### 2.5 Enumerating the user's repertoires

`GET /api/v1/getHomeData?uid=<uid>&sortBookRowsBy=alphabetically&userLanguageShort=en`
→ `homeData.booksList[]` with `bid, name, author, authorUid, chapterCount,
openingsNum, bookType, isRepertoire, …`. This is live; the
`chessable.web.production.HOME_DATA` localStorage blob has the same shape but
is a **stale cache** (it still claimed 1 opening for a course that had 155).

`isRepertoire` does **not** mean "is a repertoire container": it was `true` for
the *source* course and `false` for the actual repertoire. Do not filter on it.
The usable filter is `authorUid` === the user's own uid, i.e. the courses the
user created — which is also exactly the set the add flow's step 3 offers.

### 2.6 Deleting

`GET /api/v1/updateOpening?uid=<uid>&oid=<oid>&mode=del&val=1` →
`{"data":{"owned":true}}`. One GET per variation; 140 of them ran clean at 6
concurrent. This is what the edit page's bulk "Delete" does (it also demands
the word "delete" typed into a SweetAlert first — ours must have its own
confirm). Chapters are *not* removed by emptying them: four empty chapters
survived the cleanup.

### 2.7 Edge cases already visible in one small test course

* one variation has an **empty `moves` array** (the informational `1.--` card)
  and a non-standard `initialFEN` (`… w - - 0 1`, no castling rights);
* `initialFEN` is a real field — a tactics course starts mid-game, so the SAN
  walk must start from it and not from the standard position;
* `color` was `black` on all 77 here, but per-variation `color` has been seen
  as `both` elsewhere (see `chessable-variation-order-api`), so "which side is
  the opponent" needs the course color as a fallback, not the variation's.

---

## 3. Design

### 3.1 Coverage is a tree question, not a list question

Exact-line matching works today (§2.2) and is a dozen lines of code, but it is
wrong in three ordinary situations:

* the same line was added from a **different course** — different name, same
  moves, and the exact-line key still matches, but a *deeper or shallower* copy
  does not;
* the user **edited** the copy (section 12's own pencil can extend a line);
* a **transposition** covers the position by another route.

In all three the report would cry "missing" about something already trained,
which is the one failure that kills trust in a coverage report.

So: build both trees from SAN, keyed on `cacheKey(fen)` (the four-field key the
extension already uses everywhere), and walk each source variation against the
repertoire tree to its **first divergence**:

| divergence at | meaning | severity |
|---|---|---|
| a **user-colour** ply the repertoire cannot answer at that position | a **hole** — over the board you are guessing | high |
| an **opponent** ply the repertoire's tree does not branch on | an **unmet option** — you may simply never be asked | medium |
| nowhere (every position covered) | effectively present even if the SAN string differs | none |

Exact-line matching survives as (a) a fast path that skips the walk for lines
present verbatim, and (b) the **duplicate detector** — same key twice in the
repertoire is §2.3, reported and one-press fixable.

### 3.2 Ranking

Primary signal, per the user: **Lichess reachability probability**.

```
P = Π over the OPPONENT plies from the course root to the divergence point
      of   games(move) / games(position)
```

using the panel's own `lichessFilters` (the user's ratings/speeds, already a
setting). The user's own plies contribute a factor of 1 — they are a choice,
not a risk. Reported **conditional on reaching the course's root position**
(the deepest position common to all its variations, e.g. after `1.e4 c5`), so
the number reads "12% of your Sicilians" rather than "0.4% of your games".
Show the unconditional figure too, in a second column.

Two economies make this cheap: the walk stops at the **divergence point**, not
the end of the line, and the tree's shared prefixes collapse to a handful of
distinct positions. A ten-gap report is on the order of 20–40 explorer calls,
LRU-cached exactly like the panel's `fenCache`. Where the total game count at a
position falls under a floor (~50) the walk **stops and the estimate is marked
truncated** rather than multiplying noise into a fake precision.

Second signal: **divergence depth**, which the user asked to matter
meaningfully. A hole at ply 4 leaves you improvising out of the opening; a hole
at ply 24 leaves you improvising in a position you at least know. Note the
double-counting risk — P already decays with depth, since every opponent ply
multiplies by something under 1 — so the discount must be gentle, visible and
tunable:

```
score = P_cond × exp(−d / D)          d = divergence ply, D default 16
```

i.e. a gap 16 plies deep is worth ~37% of an equally likely gap at the root.
`D` is a setting; `P_cond`, `d` and `score` are all columns, so the sort is
auditable and the user can sort by raw probability instead.

Not chosen for v1, but cheap to add later and worth keeping in mind: grouping
gaps by their shared divergence point and summing (five missing lines behind
one unanswered `3.Bb5` are *one* thing to fix), and the course's own
`isImportant`/`isKey` flags.

### 3.3 Writing back

* **Add selected** → `duplicateVariationsToRepertoire`, one call, oids batched.
  Confirm dialog naming the count and the target course. Given §2.3, we choose
  the `chapterName` deliberately — reusing an existing chapter title merges
  into it instead of spawning yet another "Main Level"; **unverified whether
  passing an existing title merges or creates a duplicate-named chapter**
  (§4).
* **Remove duplicates** → `updateOpening&mode=del` per surplus oid, keeping the
  oldest of each group (lowest oid). Destructive and irreversible from our
  side, so: type-to-confirm, and never offered without a preview list.
* Both are refused outright when the target is not authored by the user
  (`authorUid`), and both re-fetch `getList` afterwards rather than trusting
  our own model of what we just wrote.

### 3.4 Where it lives

A panel on `/course/<bid>/`. That is a **new host** for the extension but needs
**no new permissions**: the content script already matches every
`https://www.chessable.com/*` page, and all four endpoints are same-origin.

The course page is a React SPA reached by `pushState`, so it obeys the SPA rule
from CLAUDE.md verbatim: start the module unconditionally from `start()`, gate
it on the **current** URL from its own 500 ms poll, never on the load-time
path. The panel mounts on `document.body`, absolute in document coordinates,
like the review panel.

Flow: repertoire dropdown (from §2.5, remembered per source course in
`chrome.storage.local`) → "Check coverage" → summary line ("66 of 77 present ·
11 missing · 3 duplicated") → the ranked gap list, each row showing the line
with its divergence move marked, severity, P, depth and score, linking to
`/variation/<oid>/` → checkboxes + the two write actions.

Course JSON caches in `chrome.storage.session` beside `cloCourseFenCache` (180
KB per course, and the analysis is re-run often while the user works through
the list). The Lichess pass is incremental and resumable with a progress line —
on a 500-variation course it is the only slow part, and the existing 429
cooldown + single-retry policy applies unchanged.

### 3.5 Falls out for free

The same tree overlay with **no source course** answers two more questions the
user has not asked for yet: the repertoire's own internal duplicates and orphan
chapters, and — run against the Lichess explorer alone rather than against
another course — which opponent moves the repertoire has **no answer to at
all**, ranked by the same probability. That is the general form of this
feature, and the data model here should not make it awkward.

---

## 4. Open questions

**Closed by the 2026-07-29 implementation pass:**

* ~~the exact `duplicateVariationsToRepertoire` body~~ — captured in full (§2.1)
  and exercised: one variation added through the panel, verified present in the
  target, then removed again;
* ~~whether the server rejects an add we should have pre-checked~~ — it does
  not. `checkVariationDuplicatesInCourse` was never called and the add returned
  `{success:true}`; adding a line the target *already held* also succeeded,
  storing it twice, which is §2.3 again and is what the duplicate detector is
  for;
* ~~how a bought course behaves as a source~~ — `getList` on a course the user
  does not own returns `data[].moves` in full (§2.4);
* ~~`updateOpening&mode=del`~~ — verified through the panel: returns
  `{"data":{"owned":true}}`, and the deleted variation is gone from `getList`.

**Still not verified:**

* whether passing an existing **`chapterId`** merges into that chapter — the
  question the captured body reframes. `chapterId: null` (what the UI sends when
  a repertoire rather than a chapter is picked) always files under a chapter
  named `chapterName`; whether that *creates* one every time, or reuses one of
  that name, was not measured;
* whether deleting via `updateOpening&mode=del` is recoverable through the
  course page's "Show Deleted" (it exists; its scope is unknown);
* whether any course names two different variations with the same line (which
  would make the duplicate detector's "keep the lowest oid" rule wrong);
* performance of the tree walk on a 500+ variation course — the largest tested
  is 81 variations (course 291847), which was instant; the Lichess pass over
  course 453453 was 4 explorer requests for 75 gaps, so the walk, not the
  network, is what would have to be measured.

## 5. Non-goals

* Reconciling *comments*, alternatives or annotations between course and
  repertoire copies — only the move tree is compared.
* Any use of `checkVariationDuplicatesInCourse` (§2.1).
* Touching Chessable's own add-to-repertoire UI. Our panel is separate and
  reads nothing out of it.
