# DESIGN — puzzles from the games that played your lines (section 29, v0.172.0)

**Read this before changing anything in section 29.** CLAUDE.md carries only
what an edit elsewhere can break; the loop, the measurements and the reasoning
are here.

A tactic from a real game that went through one of your course's own positions,
dealt instead of an ordinary storm card some fraction of the time. Source data
is the published `puzzle-explorer-data` set — every Lichess puzzle joined back
to the game it came from, with that game's whole mainline indexed, so a position
can be asked "show me puzzles from games that passed through here".

Companion reference: `PUZZLE-DATA-INTEGRATION.md` (the dataset's own guide) and
`content/puzzles.js` (the primitives, mirrored from upstream).

---

## 1. Why this belongs in the storm

The storm asks *what do you play when the book runs out*. This asks *what do you
play when the game your book prepared you for turns sharp* — the same
repertoire, one layer along. It reuses:

* section 18's board, its drag layer, its promotion picker and — crucially —
  its ordinary **quiz** path, which already walks a multi-ply line and auto-plays
  the opponent's replies;
* section 27's queue, clock, scoring, review, retention rule, tombstones,
  chapter and FEN scopes, and §16e's transport;
* the one walk of the course that §14.18, §14.18.4, §19 and §28 already make.

What it does **not** reuse is the grade, and that is the central decision (§2).

---

## 2. A puzzle is answered, not graded

Every other card in the storm is a position with **no right answer**, judged by
how much win probability the move gave up (§16). A Lichess puzzle has a
**solution**. So:

* `tryMove`'s storm arm (`cr.mode === 'storm'`) intercepts above the comparison
  and hands the move to the grader. A puzzle card uses `cr.mode === 'puzzle'`
  and falls through to the ordinary quiz comparison instead.
* No ChessDB request, no engine search, no round trip. The solution came out of
  the store with the card, so "was that right" is known before the piece lands.
* **This must never be "unified" with the graded path.** A tactic scored
  "decent" for a move that is not the win is exactly the wrong answer, and
  §3.4's three-tier grader would give precisely that.

The verdict is still a **band**, so everything downstream is unchanged:
`stormPoints` scores it, §16's sign rule drives the streak, the retention rule
retires it, §15's record counts it. Solved is `great` and a miss is `blunder`.
A puzzle has no middle band, which is the honest shape of the question.

### 2.1 What section 18 needed

Four edits, and no new board:

| where | change |
|---|---|
| `continuationStormApi.open`/`next` | `cr.mode = card.puzzle ? 'puzzle' : 'storm'` — **the card says which**, so no flag can disagree with it |
| `step()`'s line-done arm | tell section 27 and **stop** — see below |
| `tryMove`'s refusal arm | first wrong move ends the card (storm) or raises §17's hold (set) |
| `syncUi`'s dispatch | a `syncPuzzleUi()` arm beside `syncStormUi()` |

`moverColor()`, the drag layer, the promotion picker, `closeReview` and
`positionOverlays` needed **nothing**. `closeReview` already gates
`navigateToLineEnd` on `wasQuiz = cr.mode === 'quiz'`, so a puzzle skips it.

**`step()` must not fall through to `nextLine`.** A storm hands cards in one at
a time — `cr.queue` holds exactly the card on the board — so `nextLine` finds
nothing after it and calls `finish()`, which tears the overlays down and ends
the session on the first puzzle solved. Section 27 owns the queue and the pause
between cards, as it does for a graded position.

`isStormMode()` is the predicate every test meaning *"section 27 is driving this
board"* has to use now. Where a test really means *"a GRADED card"* it stays
`cr.mode === 'storm'` — `tryMove`'s intercept and `moverColor`'s answer are both
of that kind.

---

## 3. The anchor band — the measurement the feature rests on

An **anchor** is a position of the user's own course that a puzzle may be looked
up from. Which positions qualify is the whole question, and the first draft of
this design got it wrong.

Measured 2026-09-01 on a 38-ply line of course 453453, walking its own
positions and counting the puzzles indexed at each:

| anchor ply | 2 | 4 | 6 | 8 | **10** | 12 | 14 | 16 | 18 | 20 | 22 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| puzzles listed | 1434 | 1422 | 1451 | 1322 | **33** | 10 | 37 | 8 | 8 | 3 | 1 |

There is a **cliff between ply 8 and ply 10**. Below it, a "match" means the
game shared an opening; above it, the game really played the line. That is the
floor, and it is the feature.

Two things the first draft assumed and the data refuted:

* **Deeper does not dominate shallower.** `fenPositionKey` collapses
  transpositions, so ply 14 (37 puzzles) carries games that never occupied this
  line's ply 12 (10 puzzles); and §10.2's 2000-per-position rating cap
  truncates shallow lists, so a game present deep can be cut out shallow. A
  band union really does add matches.
* **One anchor per line is far too thin.** The deepest ply-≤22 anchor on that
  line yields exactly **1** puzzle. The ply 10–16 band yields ~80.

### 3.1 Why the ceiling was 16 — and why it is 24 now

> **SUPERSEDED IN v0.173.0.** Everything below is still the right measurement and
> the wrong conclusion. The ceiling was a BUDGET decision, and §12.1 removed the
> budget: a full course scan is seconds, so "these anchors cost a shard and
> return nothing" stopped being a reason to refuse to ask. The default band is
> now **12-24** with a selector beside the percentage, and 24 sits deliberately
> above the current publish threshold of 22 so the band widens by itself when the
> dataset does. The FLOOR is untouched in kind — it is the one part of this that
> is a quality rule — and moved 10 → 12, a step inside the measured cliff.

Band sizing across all three courses on the account (colour-filtered):

| band | 291847 | 453453 | 455941 |
|---|---|---|---|
| ply 8–22 | 377 shards → 15214 | 374 → 5554 | 58 → 670 |
| ply 10–22 | 322 → 11124 | 341 → 2077 | 50 → 116 |
| **ply 10–16** | **182 → 10923** | **161 → 2071** | **32 → 116** |
| ply 12–22 | 270 → 5940 | 301 → 970 | 41 → 25 |

**Ply 10–16 captures ~99% of the yield at half the shard cost.** Positions past
ply 16 are so specific that almost no game reaches them: they cost a ~0.9 MB
shard and return nothing. The ceiling is a budget decision, not a quality one.

Dropping the floor from 10 to 8 multiplies 455941's haul by 5.8×, and all of the
increase is the generic junk.

### 3.2 Three rules in `stormAnchorAdd`

* **Band membership is decided by a position's SHALLOWEST ply anywhere in the
  course.** If any line reaches a position at ply 6, it is a generic position
  however deep another line gets to it. Written per line instead, this still
  produces a plausible anchor set with the generic positions quietly back in it.
* **Ply is absolute in the game** (`pliesBefore`, 19c's), never an index into
  the line. A variation with a custom start FEN begins mid-game, and numbering
  its first position 0 would put a ply-40 tactics position inside the band. It
  also means such lines fall out by themselves.
* **Side comes from the LINE** (24h's rule). `m[2]` is the colour that SOLVES a
  puzzle, and a Caro-Kann studied as Black sits on white-to-move positions for
  half of every line. A position both colours reach keeps both.

The ceiling is additionally clamped to the live
`meta.filterStats.maxEmissionPly` — **never** a hardcoded 22. Positions deeper
than that threshold are not in the index at all (a hard cliff, not a taper), but
it is a publish setting a republish can raise, and a hardcoded copy would leave
the band permanently narrower than the data allows with nothing saying so.

### 3.3 What is deliberately NOT filtered

The puzzle's **own** start ply (`m[4]`). Measured, the median puzzle from these
games begins around ply 55 — a start-ply band keeps only tactics inside the
opening itself and throws away ~95% of the supply. What matters is that the GAME
played the line, which is `m[3]`.

So the card's wording says *"from a game that played it 14 plies in"* and never
implies the tactic is in the opening.

---

## 4. Two stages, because the two costs are different problems

> **§12 REVISES EVERY NUMBER BELOW.** The per-fetch costs quoted here are the
> PARSED sizes, not the wire sizes — measured, a stage-A shard is 330 KB gzipped
> and 10 ms to parse, so "roughly twenty legs of an overnight round" describes a
> six-second job. Read §12 before quoting anything in this section as a cost.

| | fetches | per course, band 10–16 | how often |
|---|---|---|---|
| **A. anchors → candidates** | index shards, ~320 KB gz / ~0.9 MB parsed | 136 / 161 / 32 shards | **once** |
| **B. candidates → ready** | one body shard per puzzle, ~331 KB | ~40 MB for 120 puzzles | a trickle |

Stage A yields thousands of candidate index entries at ~40 bytes each. Stage B
turns a bounded number into playable cards with bodies. Puzzle ids hash across
all 4096 body shards, so **one body fetch per puzzle** — no batching helps.

Splitting them buys two things: stage A is a one-off recorded in `store.a` and
never re-bought, and stage B is small enough to run in §14.24's background
top-up, which stage A must never do.

Both are bounded per gather leg (`puzzleShardsPerPass`, `puzzleBodiesPerPass`,
and smaller `cyclePuzzle*` numbers for a round's leg), so a course is covered
over roughly twenty legs of an overnight round.

**Selection at an anchor**: colour filter, `m[3]` band, rating band, drop
anything already stored or tombstoned, then **pick at random among survivors** —
never top-rated first. §10.2's build cap keeps the top 2000 BY RATING at popular
positions, so "highest rating" is the dataset's own truncation bias, not a
quality signal; taking the top serves a diet of 2900s.

`puzzlesPerAnchor` (8) caps what one anchor contributes: the ply 10–16 band on
291847 found 10923 puzzles at 117 positions, heavily concentrated.

### 4.0 Where the stages sit in a pass — and the v0.171.0 defect (fixed v0.171.1)

**The stages run FIRST in a gather leg, before a single frontier is walked.**
They were LAST from v0.171.0, on the argument that they compete for nothing the
walk wants — no ChessDB request, no engine, no explorer — so there is no reason
to interleave them. That argument is correct and it is also the argument for not
putting them last, which is what was missed.

Sitting after the walk they were guarded on `st.gathering` and the leg's clock,
i.e. on the pass **not having ended** — and both of the ways a real pass ends
clear exactly those:

* a hand-pressed gather walks up to `gatherTarget` (200) frontiers with a
  depth-20 MultiPV-12 search after each one (§26.4 measured a single such search
  at 207 s without finishing), so it is **stopped**, never finished, and
  `stopGather` clears `st.gathering`;
* a round's leg is bounded by `cycleLegMs` (10 min) against 33–72 frontiers,
  so it **times out**, and `Date.now() < until` is false by the time the block
  is reached.

So the stages almost never ran, on either route. Reported live 2026-09-01:
puzzles set to 100%, gathered by hand and by round, and not one index shard was
ever fetched. The failure is silent in the worst way this feature has — an empty
store looks exactly like a dataset with nothing for the course, and the gather's
own puzzle log line is skipped too, because it is guarded on
`pz.shardsFetched || pz.bodiesFetched`.

Going first is cheap precisely because both stages are bounded per pass: a leg
buys at most `puzzleShardsPerPass` shards and `puzzleBodiesPerPass` bodies
(4 and 6 under a round), so a pass stopped in its opening seconds has spent
eight fetches on the thing the user switched on by name.

Two more things the same report exposed, both in the same commit:

* **`pz.store` did not switch with the course in a round.** `cycleSwitch`
  reset every position-side field and left the puzzle slice alone, while
  `savePuzzleStore` writes it back under `st.bid` — so a leg that changed
  courses filed the new course's anchors, candidates and tombstones into the old
  course's slice. §27b's contamination one store over, and just as silent: every
  number stays plausible and the puzzles are simply about the wrong repertoire.
* **The puzzle queue was not refilled after a pass.** §14.13's rule — a pass
  must feed the session it lands in — was applied to `st.storeQueue` and not to
  `pz.queue`, which is drawn once in `startSession`. So a gather could buy a
  dozen puzzles and the session that asked for them would still deal none.

### 4.1 Live end-to-end, 2026-09-01

`node dev/probe-puzzles.js --bid 453453 --max 40`:

```
variations walked        79   (4 never reach ply 10)
anchors, ply 10-16      163
anchors probed           40   in 40 index shard(s)
...with any puzzle       24   (60%)
puzzles, colour-filtered 125
rating  min/median/max   1002 / 1650 / 2913
puzzle start ply p10/50/90  39 / 53 / 73
```

Note the rating median (1650) against the unbanded whole-course probe's 2252:
the `m[3]` band is what removes the shallow, rating-capped anchors.

---

## 5. The store

`cloStormPuzzles` = `{ [bid]: { c, r, a, g } }` — candidates, ready, anchors
scanned, tombstones. A **parallel slice**, not a third entry kind in
`cloStormPositions`: that object is keyed on `cacheKey(fen)` and every reader
(`stormUnpack`, `stormStoreDraw`, `dropCoveredStored`, `stormWirePack`,
`backfillStoreOids`, `stormFilterSource`) assumes a position shape. A
discriminator inside it would put a branch in a dozen functions §14 is emphatic
must stay pure and executable.

* **Retention** mirrors §14.11 exactly: solved leaves (with a tombstone), missed
  stays and `k++`. `puzzleDropOn` and `storeDropOn` have the same membership and
  are written out twice, so a change to either is a deliberate change to both.
* **Tombstones** are not optional. Stage A is deterministic given an anchor, so
  a solved puzzle found again at the same position would be re-bought and
  re-offered — absence alone is not retirement (§14.16's rule, second home).
* **Draw order** is `stormPuzzleDraw`: `k` ascending, unseen first, random
  tie-break. §14.15's rule unchanged, and a reversed comparator here is silent
  from the outside. Rating is **not** a term — it is a property of the puzzle
  rather than of this user's history with it.
* Shards are cached **in memory only** and capped at two. ~0.9 MB parsed against
  a 10 MB `storage.local` quota shared with every other feature here.

---

## 6. The wire

A **card of its own** (`stormPuzzleCardName(bid)`), on §15.3's rule: the
position payload is CUT to fit its budget, so a puzzle folded into it would be
dropped whenever a position list ran long — silently, after the ~331 KB fetch
was paid for.

**Only the ready list travels.** Candidates are index tuples any machine with
the dataset can regenerate and would eat the budget; a ready puzzle is what a
phone genuinely cannot produce. So the desktop does both stages and the phone
consumes — which is the whole reason this is affordable on a phone.

Read → merge → write, in that order (`syncStore`'s rule: the card is a snapshot
overwritten in place). §27b's `stormWireForeign` is reused **verbatim** rather
than copied — which is why `stormPuzzleWireUnpack` must return `bid`, not `b`.
Named `b`, that guard answered "not foreign" for every card of every course,
silently; caught by `dev/check-storm.js` §29c.

`k` merges upwards (both devices' misses are real). Tombstones apply after the
union, in both directions.

---

## 7. Scoring and the record

Solved → `great`'s points; wrong move or pass → `blunder`'s. The streak follows
§16's sign rule with no new clause. A miss costs `missPenaltyMs`; a puzzle does
**not** extend the clock.

§15 gains a third map, **`plines`**, beside `lines`/`ulines`. A puzzle is
answered and a position is graded, and the two bands mean different things —
"found the win" against "gave up 40% of the game" — so pooling them would make
one percentage out of two questions. `statsWireVersion` stays **2** (§19's
precedent: an absent map is a device that has answered no puzzles).

`cardLineRef(card)` is the join: a puzzle has no `storm` block at all, so a
reader that looks there finds nothing and the third map stays empty for ever
while looking implemented.

Answers are counted against the **anchor's** line, carried on the candidate and
then the ready entry — a puzzle body knows nothing about this course.

### 7.1 In a set

A set is arguably the better host: no clock, and §17's hold already means *"you
did not find it — play it again, or be shown it"*, which is exactly what a
failed tactic wants. `stormSetHeld` is true of `blunder`, so the ordinary set
path offers "try again" and "show the move" with no new mechanism.

One ordering rule: in `pass()`, the **set arm comes before the puzzle arm**.
Routed the other way, "no idea" on a set's puzzle produces a `blunder` verdict
which holds it **blind** — offering "try again" to somebody who has just said
they have no idea, with the solution still hidden. The set's own give-up
reveals, which is what the press means.

---

## 8. What this must never do

* **Never write to the course** (section 24's rule, and §11's). This feature has
  the tempting button one line away — "add this puzzle to my course" from a
  card. 19d/19e already do that safely, *from a board*.
* **Never fetch a shard from a poll, a panel refresh, or a scan.** Only a
  gather leg or a deal.
* **Never present a stored puzzle's `fen` as anything but the solver's
  position.** Do not re-apply `moves[0]` as an opponent move (§12.7 of the
  integration guide); the raw Lichess CSV differs and this is where it trips.
* **Never cache a shard in `storage.local`.**
* **Never ask the dataset anything on a profile that has not switched puzzles
  on.** It is a third party seeing the user's repertoire positions — section
  26's gate, for section 26's reason. `puzzlePctKey` absent is 0.

---

## 9. The host permission

`https://skaeglund.github.io/puzzle-explorer-data/*` — the extension's fourth,
and the least of the four: a GitHub Pages site serving static CC0 JSON, no
account behind it, no auth, no endpoint that could write anything.

The guard is nevertheless the **tightest** of the four, because here it costs
nothing: the content script names a **path**, never a url, so no argument on
that side can name a host at all. The path is then matched against an allow-list
of three shapes (`PUZZLE_PATH_RE`), in `handleChessdbFetch`'s discipline.

`raw.githubusercontent.com` is deliberately **not** added. The integration guide
offers it as a mirror; a second host permission for a fallback nothing needs is
not a trade worth making.

No token is ever sent: this host has no notion of the user, so the Lichess
bearer would be a leak with no purpose.

---

## 10. Verification

```
node dev/check-puzzles.js      # the mirrored primitives
node dev/check-storm.js        # §29, §29b, §29c
node dev/probe-puzzles.js --bands
```

`dev/check-puzzles.js` requires `content/puzzles.js` directly (it is a module in
its own right, `engine/san.js`'s idiom). Five controls, each failing on exactly
its own assertions — and note that **both** en-passant controls are needed:
"always strip" passes the 1.e4 case and fails only the capturable one, "never
strip" does the reverse. The pair is what pins the rule.

`dev/check-storm.js` §29/§29b/§29c: 18 controls, recorded in that file's header.
Two lessons worth repeating:

* the zero-tombstone assertion had to be asked **near the epoch**. At the far
  clock a zero timestamp is millennia past the horizon, so it reads "not
  retired" whether the entry is tested or merely the map — the first version
  passed for the wrong reason and covered nothing.
* one control was a **no-op** ("the wire pack carries candidates too"): the
  mutation changed the key list but the `.map()` still read `store.r`, so the
  filter dropped it anyway. A control that does not change behaviour proves
  nothing.

---

## 11. Still open

* **Not measured**: how a real session feels with puzzles mixed in — the
  percentage default (0) and the choices (10/25/50/75/100) are a guess about
  taste, not a measurement.
* **Not built**: §23's two keys (show-and-grade) do not cover `'puzzle'` mode,
  so a puzzle cannot be answered from a Bluetooth ring. The gate is one clause
  at `cr.mode === 'drill' || cr.mode === 'quiz'`; what it needs is a decision
  about what "I knew that" means for a multi-move tactic.
* **Not built**: the blunder that made the position is **tinted** but not
  animated. Puzzle sites animate it; the storm's own §20 argument (a clock is
  running) says tint, and a set — which has no clock — might reasonably differ.
* **Unbounded in one place**: a course with no anchors in band gets no puzzles
  and says so only in the selector's tooltip. A course of six short lines is
  near the floor of what works (455941: 32 shards, 116 puzzles).

---

## 12. Collecting once — §29.2 (v0.172.0)

The bounded, overnight shape of §4 was right about the mechanism and wrong about
the price. Everything below is measured; nothing about the anchor band, the
grade, the store's semantics, the wire or the review changed.

### 12.1 The measurement that reframed it

`dev/probe-puzzle-collect.js`, live against the published set, 2026-09-02:

| | value |
|---|---|
| index shard | **330 KB gzipped** / 0.97 MB parsed / ~6900 positions / ~10 ms to parse |
| body shard | **85 KB gzipped** / 345 KB raw / **942 bodies** |
| index scan, 182 shards, concurrency 8 | **~6–17 s** |
| whole 4096-shard body corpus | **~85 s** |

§4 priced a stage-A shard at "~0.9 MB" and a stage-B fetch at "~331 KB". Both
are the **parsed / decompressed** figures. On the wire they are 330 KB and
85 KB, and the parse — the thing that sounded expensive — is ten milliseconds.

So `puzzleShardsPerPass: 8` was sized against a cost roughly 3× the real one,
and "roughly twenty legs of an overnight round to cover one course" described a
job that takes about six seconds.

### 12.2 One fetch per body shard, not per puzzle

The second finding is upstream's, and it was sitting in
`skAeglund/puzzle-explorer` the whole time (`Offline.groupByShard`,
`downloadRepertoireOffline`). Puzzle ids hash across all 4096 body shards, so
asking for one puzzle at a time **throws away the other 941 bodies in the shard
it just paid for**. Grouped, the cost is the number of *distinct* shards the
wanted ids touch:

```
3142 puzzles  ->  2200 distinct shards   (30% fewer fetches)
```

and it follows `4096 · (1 − e^(−N/4096))`, so the saving grows with the haul:
65% at 10 923 puzzles, and it can never exceed 4096 fetches however many are
wanted. Grouping is done in the **worker**, which also means a body crosses the
message boundary once.

### 12.3 Where everything now lives

`puzzlecache.js`, loaded into the service worker by `importScripts`. **Not** the
content script: a content script's IndexedDB belongs to `www.chessable.com` —
a third party's origin, cleared by their "clear site data", and no place for
hundreds of megabytes of ours.

| store | bound | why |
|---|---|---|
| `indexShards` | LRU 300 (~290 MB) | a working set; a course scan is 182 |
| `bodyShards` | LRU 64 (~22 MB) | only ever pays *inside* one run |
| `bodies` | **unbounded** | **the artifact** — ~420 B each, keyed by puzzle id |
| `meta` | one row | the build stamp |

`bodies` is the feature. A course's entire haul is a few megabytes and never has
to be bought again, which is what makes collection a one-off. It is deliberately
**not** dropped by `cloPzCheckBuild`: a republish rewrites shard *contents* at
stable urls, so the two caches are stale, but a position and a solution are not.
Throwing away thousands of bodies because the publisher re-ran a filter would
cost the whole collection on every republish. An id the new build no longer
emits simply stops being asked for.

Shards are stored as **text**, not parsed JSON: structured-cloning a 6900-key
object in and out of IDB costs more than the 10 ms parse it saves, and text is
far smaller on disk.

### 12.4 The three worker messages

`clo-fetch-puzzles` survives for `meta.json`. Beside it:

* `clo-puzzle-index { shard, keys }` → **only the entries for those keys**. The
  shard never enters the content script. At collect scale this removes 182
  megabyte structured clones from a six-second job.
* `clo-puzzle-bodies { shard, ids }` → only those bodies, **archived on the way
  past**.
* `clo-puzzle-archive { op, … }` → `get` / `have` / `count` / `del` / `build` /
  `clearShards` / `clearAll`. It never fetches.

Both shard handlers take a shard **name** matched against `PUZZLE_SHARD_RE`
(`/^[0-9a-f]{3}$/`) and build the path themselves, so §9's "the caller cannot
name a host" guard is preserved exactly — it is in fact tighter, since a name is
narrower than a path.

### 12.5 The store gained one map

`cloStormPuzzles[bid]` is now `{ c, r, a, g, p }`.

`p` is the **light durable record**, ~60 bytes: the anchor's line, the anchor
depth, the rating, and `k`. It exists because `r` holds whole bodies and lives in
`storage.local`, which `savePuzzleStore` rewrites *whole* — ten thousand ready
entries would put a multi-megabyte round trip on every sync and every course
switch. So `r` is now explicitly **a working set** (`puzzleReadyMax: 500`), the
bodies live in the archive, and `refillReady()` tops it up from IDB with no
network at all.

Three rules:

* **`stormPuzzleArchived` speaks the CANDIDATE's field names.** `refillReady`
  hands the record straight back to `stormPuzzleReady` as its second argument,
  which reads `cand.r`/`o`/`n`/`p`. Rename `p` to `ap` there and every rehydrated
  puzzle comes back with no anchor depth and no line — §7's third stats map then
  fills up under one blank oid while looking implemented.
* **`k` has one writer**, `notePuzzle`, which mirrors it into both. A miss count
  living only in `r` would reset every time the working set was trimmed.
* **An archive miss is not a corruption.** The light record can outlive the body
  (storage cleared, IDB evicted), so `refillReady` puts that id back to being a
  *candidate* — which is exactly what it then is: known to match, body not held.

`p` absent is every store written before v0.172.0, read as "nothing archived",
which is true of them. Nothing migrates.

### 12.6 The prune order, which the probe exposed

`prunePuzzleStore` cut by age. Both stages walk anchors **deepest first**,
because depth is the quality signal the whole feature rests on (§3: below the
floor a "match" means the game merely shared an opening) — so under an
age-ordered cut, "oldest first" *is* "deepest first". An unlimited collect would
have spent its budget on the shallow generic anchors and then pruned away
exactly the evidence the band exists to find.

So `c` and `p` are now cut **shallowest first** (`byDepth`), and
`puzzleCollectPerAnchor` is **200 rather than 0** for the same reason: seven
anchors of one Najdorf line match 3142 puzzles, so a 163-anchor course runs to
tens of thousands and meets `puzzleCandMax`. 200 × 163 sits under the cap, and
after dedup across overlapping anchors it is not meaningfully short of
everything. 0 ("take the lot") is still supported by the code.

### 12.7 The control, and what it is not

"Collect puzzles", beside Gather, green outline — it *is* the pass that fills the
store, for the other kind of card. **Two presses** (19c's rule): this is the one
control here that can spend a few hundred megabytes of somebody's connection, and
the arming press is what puts that on screen first.

**It is not a gather and does not set `filling()`.** It walks no frontier, spends
no ChessDB request, starts no engine and stores no position, so nothing that
stands down for a gather has any reason to stand down for it. Two couplings it
does need: it refuses *while* a gather runs (both write the puzzle store, and
`savePuzzleStore` replaces this course's slice whole), and `startStorm` refuses
while it runs — not for a resource reason but because `syncSettings` hides the
whole settings row once `st.started`, which would take the collect's own Stop
button off screen while it went on fetching.

It saves **between** the stages, not only at the end: stage B is the long half
and a tab closed inside it must not throw away the scan.

### 12.8 What did not change

The anchor band and its floor (§3), the two-stage split (§4), the retention rule
and tombstones (§5), the wire (§6), scoring and the record (§7), the set (§7.1),
every prohibition in §8, and the host permission's guard (§9). The incremental
per-leg path still exists and still runs inside an overnight round; the collect
is a second caller of the same two functions with a different limit.

One parameter changed meaning: **`puzzleBodiesPerPass` counts SHARDS, not
puzzles**, since stage B groups. And `puzzleGapMs` is **0** — it was a trickle
rate for a host we were being careful with, and this one is a GitHub Pages site
serving static CC0 JSON with no account, no compute and no writable endpoint,
against 100 GB/month of allowance. Unlike ChessDB (a volunteer network) and
Lichess there is nothing here a pause protects. Kept as a setting rather than
deleted.

### 12.9 Verification

```
node dev/check-storm.js            # §29d: the archive record and its draw
node dev/probe-puzzle-collect.js   # both stages, live, no auth needed
```

`dev/check-storm.js` §29d, four controls run 2026-09-02, each failing on exactly
its own assertions and no others: `stormPuzzleArchived` renaming the anchor depth
`ap` → 2; the draw dropping its already-loaded exclusion → 3; dropping its
retirement exclusion → 3; the comparator reversed (§14.15's rule in its third
home) → 2.

`dev/probe-puzzle-collect.js` takes a **line**, not a course, so it needs no
Chessable session: it walks the line, filters to the band, fetches the index
shards, groups the matched ids by body shard and reports the grouping saving —
and it replays every body it extracts, which is what `stormPuzzlePlies` asks
before one is ever stored. 78 of 78 replayed cleanly on the first run.

### 12.10 Still open

* **`unlimitedStorage` is now requested.** It lifts `storage.local`'s 10 MB cap
  (which `puzzleCandMax: 40000` and `puzzleArchiveMax: 40000` need) and marks the
  extension origin's storage persistent, so the archive is not evicted under
  disk pressure. It is a permission, not a host permission, and nothing outside
  section 29 relies on it.
* **The archive has no UI.** `clearShards` and `clearAll` exist in the worker and
  nothing presses them; `pz.archived` is reported in the collect button's
  tooltip only. A profile that has collected several courses will hold a few
  hundred megabytes of shard cache with no way to see or reclaim it short of
  removing the extension.
* **A wire-received puzzle is not archived.** `stormPuzzleWireMerge` adds ready
  entries whose bodies were never fetched here, so if the working set trims them
  they are gone rather than rehydratable. Harmless at `puzzleReadyMax: 500`
  against a ~250-entry payload, and the fix is a reverse body mapping nobody
  needs yet.
* **Not measured**: a full collect on a real course, end to end, in the browser.
  The probe measures both stages against the live dataset but drives them from a
  line rather than from a course walk, and it does not exercise IndexedDB at all.

---

## 13. The disguise — §29.4 (v0.174.0)

**A card must not say which kind of card it is until a move has been played.**

### 13.1 Why

Knowing a tactic is there is most of finding it. The two card kinds ask
genuinely different questions — a graded position has no right answer and is
judged by how much of the game the move gave up (§16 of
`DESIGN-intuition-storm.md`), while a puzzle has a win sitting in it — and the
whole value of mixing them is that the user does not know which question they
are being asked. A panel reading "Find the win — move 1 of 3 · a game 14 plies
in · 1834 rated" has answered the harder half before the board has been looked
at: there is something here, it is worth 1834 points of rating, and it takes
three moves.

That was the shape it shipped in (v0.171.0). Reported by the author 2026-09-03.

### 13.2 What was leaking

Six things, all in `syncPuzzleUi`:

| Leak | Was | Now |
| --- | --- | --- |
| Title | `Find the win`, or `Find the win — move 1 of 3` | `Find a good move` |
| Busy suffix | ` — …` | ` — checking…`, the graded card's own |
| Game depth | `a game 14 plies in` | withheld until the verdict |
| Rating | `1834 rated` | withheld until the verdict |
| Themes | tooltip, always | withheld until the verdict |
| Set's "No idea" | `Show me the solution` | `Show me the move` |

The themes are the worst of the six and the easiest to miss: `Mate in 3` *is*
the answer, and it was one hover away on every live card.

### 13.3 What it costs the graded card

A puzzle cannot truthfully print the one sentence a graded card shows before an
answer — `N moves past the line`. Its position is a real game's middlegame,
thirty or forty plies past the book, not a walk of `maxPly` from a line end; a
card claiming "43 moves past the line" is a tell in its own right and a lie
besides. So the only way for the two to read alike is for **neither** to say it,
and the graded card gives the sentence up while puzzles are in play. It is
withheld rather than lost: the verdict line replaces it about a second later,
and the review row afterwards prints all of it.

Both kinds therefore show, before an answer, **exactly the line name and
nothing else**.

On the UNCOVERED source (§19 of `DESIGN-intuition-storm.md`) the sentence given
up is the more painful of the two — `after 3…Nf6 (7%), which your course does
not answer` is most of what that exercise is asking. It goes for the same
reason and there is no way round it: a puzzle has no gap note, so keeping it
would make "no gap note" mean "this is a puzzle" on every card of such a
session. The reply is still on the board, tinted as the arriving move, and the
review row's tooltip names it.

### 13.4 When it is in force

`puzzlesInPlay()`, asked ONCE per card in `showCard` and written onto the card
as `disguise`:

```js
Boolean(pz.on) && (pz.queue.length > 0 || pz.seen.size > 0)
```

* **Asked, not assumed.** With puzzles off, or with none available on this
  course, the graded card keeps its sentence exactly as it always had it. The
  cost is paid only where there is something to hide.
* **`seen` as well as `queue`**, because a set's second pass re-asks puzzles out
  of `st.set` rather than out of the queue, which by then is regularly empty —
  i.e. the cards that have already beaten the user once are exactly the ones
  that would have come back wearing their rating.
* **On the card, not on the session.** A session-wide flag would be re-asked at
  render time, which is where a card already dealt picks up a later answer than
  the one it was dealt under.

### 13.5 When it closes

On the first move, and it has to: a wrong move ends the card with a verdict, and
a *right* one is answered by the opponent rather than by a verdict — which is
itself the reveal. Pretending past that point would cost the user "move 2 of 3"
for nothing. `hush` in `syncPuzzleUi` is therefore
`disguise && !v && !hold && !cr.stormRetry && asked === 0`.

A RETRY board (§14.10b) is never disguised on either side: it is opened from the
review, where the card has already been answered and described in full.

### 13.6 What is NOT disguised, and cannot be

**The board.** A puzzle is a middlegame or an endgame; a graded card is an
opening position a few plies past the book. Anyone who has played two of each
can tell them apart at a glance, and no wording fixes that. What the disguise
buys is that the *position* is the only evidence — which is the same evidence a
real game gives, and the reason it is worth buying at all.

Also visible after the fact: a puzzle answers instantly while a graded card
takes a grading round trip. That is after the move, where the disguise has
already closed.

### 13.7 What the review says instead

Nothing is withheld once the session is over — the review row prints the line,
the game depth, the rating and the themes, and §14.10a's `item.shown` gate is
what holds the SOLUTION back until it is asked for, exactly as it holds a graded
card's best move back.

One thing changed there with this pass: a puzzle row's LOSS column used to read
`?`. That glyph means "the position could not be scored" — it is the whole of
§14.10a's argument for using `…` rather than `?` in the column beside it — and
saying it about a card that is *answered* rather than graded reports a grading
failure that never happened. A puzzle row now reads `—`, the move column's own
convention for "there is no such thing here".

### 13.8 Verification

`dev/check-storm.js` §29e executes `puzzlesInPlay` (impure — `__setPz` supplies
`pz`, the funnel's own idiom). Both ways of being wrong are quiet:
under-disguising leaks only on the cards that *are* tactics, which at 10% is one
card in ten; over-disguising silently costs every graded card the sentence that
says where it is. Controls run 2026-09-03, each failing on exactly its own
assertion and no others: reduced to `Boolean(pz.on)` → 1; the `seen` clause
dropped → 1.
