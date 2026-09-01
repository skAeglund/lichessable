# DESIGN — puzzles from the games that played your lines (section 29, v0.171.0)

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

### 3.1 Why the ceiling is 16

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
