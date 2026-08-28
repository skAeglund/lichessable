# DESIGN — Intuition storm on the repertoire's frontier

Status: **BUILT as section 27, v0.130.0.** What is here is the design and the
measurements; §14 is what shipped, what changed on the way, and what is still
unverified. `dev/probe-storm.js` remains the way to re-measure any rule change,
and `node dev/check-storm.js` executes the shipped producer with no network.
Every number in §3 and §6 is measured, 2026-08-27, not quoted.

Four rulings taken 2026-08-27, all by the author:

1. **`https://lichess.org/*` is approved** as this extension's THIRD host
   permission (§10). It is now in the manifest, guarded down to the single path
   prefix `https://lichess.org/game/export/` (§14.1).
2. **The format is a storm**: a session clock, a streak, pressure as part of
   the exercise.
3. **The probe comes before the UI.** It did. §6 is why that was right — and
   §6.5, which refuted this document's own preferred answer to §7 for the cost
   of two probe runs and no code.
4. **§7's stage-0 cap is +200, not +100.** Asked directly and answered: keeping
   the "you are clearly better, do not spoil it" frontiers is wanted, because
   that is a real repertoire skill. It is `CONFIG.storm.userHiCp`, so the other
   answer is one number away.

The one-line version: **Chessable teaches you a line and stops; this asks what
you do on the move after it stops.** Positions come from real games that
continued past the end of one of your own course variations, and a move is
rewarded for being decent rather than for being the engine's first choice.

The model is qchess.net's *Intuition Storm*. What is different here is where
the positions come from: not random middlegames, but the positions your own
repertoire hands you and then abandons. The name is undecided — "Intuition
Storm" is theirs, and "frontier" is the word this document uses for the thing
that is actually new.

---

## 1. Why this belongs in this codebase

Almost every part already exists, and the parts that exist are the expensive
ones.

| the storm needs | what answers it | section |
|---|---|---|
| every position where a line ends | `buildCourseTree`'s `ends` map + `fens` | 24 |
| which side that line is for | `lines[].side` (per-line, never `courseSide`) | 24h |
| how likely you are to reach it | the coverage ranking | 21 |
| real games from a position | the explorer, `topGames`/`recentGames` | 5 |
| a score for every legal move | ChessDB `queryall` | 26 |
| a board that takes input | the shared board layer | 11c |
| a card loop that asks for one move | `cr.mode = 'drill'` | 20 |
| a full-window host on a course page | the tree's window | 24 |

The genuinely new code is: the frontier picker, the game walk, the position
filter, the grader and the storm's own panel. Everything else is reuse, and the
reuse is not a stretch in any of the eight rows above.

There is also a reason this is worth doing at all beyond novelty. Section 21
answers *which lines are missing from my repertoire*, section 24b answers
*which replies does the course never cover*. Both are questions about the book.
This is the first thing here that asks a question about the **player**: past the
last move anyone prepared, are your hands any good?

---

## 2. The wire (verified live 2026-08-27)

### 2.1 The explorer names games and never their moves

`explorer.lichess.org/lichess` returns `topGames` and `recentGames`, each entry
carrying `id`, `uci`, `winner`, `speed`, `mode`, both players' `name`/`rating`,
`year`, `month`. **No moves.** Caps, measured by asking for 15:

| database | `topGames` | `recentGames` |
|---|---|---|
| `/lichess` | 4 | 4 |
| `/masters` | 15 | — |

`fetchExplorerData` currently sends `topGames: '0', recentGames: '0'` to keep
the payload small ([lichessable.js:2300](content/lichessable.js:2300)). Turning
them on for this feature's own calls is a parameter, not a change — but note
those two fields must stay `0` on the panel's own path, which fetches on every
position change and wants nothing it will not draw.

### 2.2 Master game PGNs are on the host we already have

```
GET https://explorer.lichess.org/masters/pgn/boLujJkB   →  200, full PGN
```

**Unauthenticated, existing host permission.** Verified against a real id from a
`/masters` response. There is no equivalent for the `lichess` database — all
three plausible spellings 404:

```
/lichess/pgn/<id>   404
/player/pgn/<id>    404
/pgn/<id>           404
```

So the split is exact: **master games cost nothing, everybody-else games cost a
host permission.** That is what §10 is about, and it is why the masters path is
worth keeping even after the permission lands — it is the fallback that works
when the permission is refused, revoked, or the endpoint is down.

### 2.3 `lichess.org/game/export/<id>`

Returns the full PGN. `?evals=true` adds `[%eval …]` per ply **where the game
has server-side computer analysis**, which is the trap in §3.2.

---

## 3. The findings that shape the design

### 3.1 Lichess's own evals are not a shortcut, and the first sample lies

The attractive idea: fetch the game with `evals=true` and get an eval curve for
free — balance, blunders, everything, at zero compute.

The first three games sampled all carried evals (40, 96, 55 plies). That was a
bad sample: they were rapid games between the same two 2800s, and strong players
request analysis. A proper sample from one position — the 4 `topGames` and 4
`recentGames` at a Najdorf position ~12 plies in:

| game | ratings | speed | `%eval` plies |
|---|---|---|---|
| DST7LbuE | 2565/2637 | blitz | 50 |
| yct5a94v | 2097/2189 | classical | **0** |
| WZnhyHse | 2235/2246 | rapid | **0** |
| ugFL6xiq | 1360/1345 | bullet | 44 |
| quSImnfe | 1354/1304 | bullet | **0** |
| 8wsySmt0 | 2196/2153 | bullet | **0** |
| IQUBLW9c | 2442/2329 | bullet | **0** |

**2 of 7.** Nothing may depend on this. It is worth requesting anyway — it costs
one query parameter and is a free confirmation where it lands — but it can never
be the source of a verdict.

`api/cloud-eval` fails the same way and for the same reason. Walking the most
popular move from three post-book positions, it answered every ply of the QGD
and Italian mainlines (depth 15-54) and went `MISS` from ply 5 onward in a
Najdorf line the moment the position dropped to ~51 games. It covers what people
have already looked at, which is the opposite of what this feature is for.

### 3.2 ChessDB is the scorer

Coverage over **real game continuations** — 4 games, 2 frontiers, 12 plies each:

```
47 of 48 positions answered  (98%)
```

That is the measurement the architecture rests on, and it is deliberately not
the walk-the-most-popular-move measurement, which is optimistic by construction:
the popular path is exactly the path ChessDB has already been asked about.

`queryall` returns, per move: `uci`, `san`, `score` (mover's perspective),
`rank`, `note`, `winrate`. One request scores an entire position. That is
precisely the intuition-storm grading primitive — the user plays a move, you
look it up, you know its rank and its centipawn loss — with no search and no
WASM.

### 3.3 `learn=1` is the only usable mode, and its scored set thins with depth

`learn=0` lists every legal move and scores only the ones really in the book:

```
Scotch-gambit position:  29 moves listed, 1 scored, 28 as "??" / rank 0
1.e4 e5 2.Nf3 d5:        28 moves listed, 1 scored
```

Useless for grading a human's arbitrary choice. `learn=1` scores everything it
returns — but **what it returns shrinks**. Walking two real games from a
repertoire frontier, counting scored/listed:

| ply past frontier | Italian (2986/2974) | QGD (2203/2202) |
|---|---|---|
| 1 | 36/36 | 9/9 |
| 5 | 38/38 | 45/45 |
| 10 | 14/14 | 29/29 |
| 13 | 6/6 | 5/5 |
| 14 | 6/6 | 5/5 |

(The `learn=0` column across the same 28 positions never exceeded 5 scored.)

Two consequences, and they are the ones that shape §5:

* `minScored` is a real filter, not a formality — §6 measures it rejecting as
  many candidate positions as any chess rule.
* the deeper the walk, the less ChessDB can grade, which puts a natural ceiling
  on `maxPly` that no chess argument would have found.

**DESIGN-chessdb.md §3.3's rule still stands**: under `learn=1` a book entry and
a fill-in are indistinguishable, and the only honest confidence signal is a
second `learn=0` request. This feature does not need that signal — it is grading
a human's move against other moves in the same position, where a uniformly
shallow answer is still a fair ranking — but it must never *present* a fill-in
score as a book eval. Where a number is shown to the user it carries whatever
`.clo-cdb--est` already means.

### 3.4 A move's score is its child's negated best

The gap in §3.3 has a complete fix, and it is just minimax:

```
loss(m) = best(P) − score(m)                    when m is in P's scored list
        = best(P) + best(P after m)             otherwise, one more request
```

`best(P after m)` is from the opponent's perspective; negating it gives the move's
own value. ChessDB answers 98% of real continuations (§3.2), so the fallback
usually lands; where it does not, the vendored Stockfish takes one search of one
position — affordable precisely because the user is already waiting for a
verdict, which is the one moment in this feature where latency is free.

That makes grading **total**: every legal move the user can play gets a number.
It also means `minScored` exists only to establish the position's *spread*, not
to contain the user's answer — so it can be relaxed further than §6's setting
if spread is measured some other way.

---

## 4. The pipeline

Five stages. Stages 0-1 are per session; 2-4 are per position and run in the
producer described in §8.3.

**0 — the frontier set.** Walk the course (or the nominated repertoire) into the
FEN each variation ends on. On a `/course/` page `buildCourseTree` has already
done it: `ends` is a `cacheKey → {n, lines}` map and `fens` gives the exact FEN.
After a tree or coverage run this costs no fetch at all.

Two exclusions, both measured in §6:

* **a variation with a custom start FEN can never be a source.** Tactics puzzles
  and model-game fragments end on positions no real game passes through, and
  paying an explorer request each to discover that is waste. Filter on
  `cacheKey(v.fen) !== cacheKey(START_FEN)` before sampling.
* variations under ~4 plies — there is no repertoire to be at the frontier of.

Then **score each surviving frontier and apply the eval band here** (§7): one
`queryall` per frontier, rejecting a whole line for one request rather than
discovering the same fact 11-29 requests later. This is also the natural place
to weight the sample, since ranking and filtering want the same pass.

Do not sample uniformly. Weight by how likely the line is to be reached
(section 21's ranking: the product of the opponent plies' Lichess shares) and by
how many variations converge on the frontier (`ends[].n`). Storming the frontier
of a line you meet twice a year is a wasted rep.

**1 — the continuation.** Ask the explorer for `topGames` + `recentGames` at the
frontier, fetch two of those PGNs, and walk each forward. Master PGNs (§2.2)
where the position has master games; `lichess.org` otherwise.

**2 — the walk.** One `queryall&learn=1` per ply. That single request serves
three jobs at once: the position's eval, its spread, and — because the parent's
list contains the move the game actually played — whether the player just erred.
**The blunder test is free.** No extra request, ever.

**3 — the filter.** §5.

**4 — grading.** §3.4, plus the report: rank, cp loss, the best move, and
ChessDB's `winrate` for both, which is more legible to a human than centipawns.

---

## 5. The rules

They are two different questions and the probe keeps them apart, because they
fail for different reasons and the counts want reading separately.

### 5.1 Stop the walk

| rule | why |
|---|---|
| ChessDB answers `unknown` | nothing past here can be graded, so nothing past here is usable |
| \|eval\| > `decidedCp` (250) | the game is over; "find the good move" has no meaning |
| the side to move erred by ≥ `blunderCp` (150) | free from the parent's list; see below |
| the game ends | — |
| `maxPly` reached | 16; §3.3 is the real ceiling, not this |

**The blunder stop is the author's own condition 2 and it stops on BOTH sides,
not just the user's.** After the opponent blunders you are in a convert-a-winning-
position exercise, which is a different skill and is already excluded by
`decidedCp` one ply later anyway. Stopping on the user's colour is the rule that
matters: past their mistake the position is one that good play would not have
produced, so nothing beyond it is a position the repertoire leads to.

### 5.2 Offer the position

| rule | setting | notes |
|---|---|---|
| the user is to move | — | from `lines[].side`, never `courseSide` (24h) |
| ply ≥ `minPly` | 2 | never offer a position still inside the course's own line |
| eval in `[userLoCp, userHiCp]` | −100 … +200 | a BACKSTOP since §7 — the band's real home is stage 0 |
| enough moves scored | `minScored` 6 | §3.3; relaxable per §3.4 |
| not in check | — | check narrows the choice to almost nothing |
| not a forced recapture | — | previous move captured on X and the best move recaptures on X |
| `best − 5th ≥ spreadMinCp` | 60 | there must be something to get wrong |
| `best − 2nd ≤ spreadMaxCp` | 200 | it must not be a single-move tactic |

**The two spread rules are the whole idea, and the second one turns out to be
nearly dead weight** (§6.2). The first is what separates this from an
engine-agreement trainer: a position where all 37 moves score within 1cp — one
was hit live while probing — awards and punishes nothing, and offering it is
worse than offering nothing, because the user learns that their judgement is not
what is being measured.

**And the spread filter is what licenses a flat cp-loss threshold in the
scoring.** Normalising the award by the position's difficulty is the obvious
alternative and it is the wrong one: a scoring function nobody can hold in their
head during a timed session is a scoring function nobody trusts. Do the
normalising in the *filter*, once, and let the score itself stay legible.

---

## 6. What the probe measured

```bash
node dev/probe-storm.js --bid 291847 --n 14 --maxply 16 --seed 7
node dev/probe-storm.js --bid 453453 --n 12 --maxply 16 --seed 3
```

It runs the real `sanToUci` (sliced out by `dev/slice-source.js`, so it cannot
drift) over `dev/tmp-courses.json`, and calls the three live APIs. It reports
distributions rather than a verdict, because the bands in §5 are exactly what it
exists to turn from guesses into numbers.

### 6.1 The headline

Course 291847 — 14 frontiers sampled of 33 eligible, 2 games each:

```
candidate positions examined: 54    SURVIVORS: 12  (22%)
requests: {"explorer":14,"pgn":18,"cdb":137}
frontiers with no explorer games: 5
```

**~11 ChessDB requests per usable position.** A 20-position session is therefore
about 230 ChessDB requests, ~25 explorer and ~30 PGN — see §9.

### 6.2 Why candidates were rejected (first failing rule)

```
  16  too few moves scored to rank an answer
  16  flat — nothing to get wrong
   5  user is already winning
   2  forced recapture
   2  user is losing
   1  one move only — a tactic, not intuition
```

And where the walk stopped:

```
  11  ChessDB has no score here
   3  opponent blunder
   3  position already decided
   1  user-side blunder
```

**The binding constraint is ChessDB's elaboration, not chess.** 27 of 54
rejections and 11 of 18 stops are the database running out. The four chess rules
that were argued about hardest — losing, winning, recapture, check — account for
9 rejections between them.

**`spreadMaxCp` is dead weight.** It fired once in 54 candidates, and the tuning
grid is byte-identical from 150 to infinity on *both* courses. `best − 2nd` has a
median of 15cp and a p90 of 155. Post-book positions from a repertoire frontier
essentially never have one forced move, which in hindsight is obvious — a
position with one move in it is a position an author would have kept teaching.
Raise it to 300 or delete the rule; do not leave it at a value that implies it is
doing something.

### 6.3 The spread distributions, and the only dial that matters

```
291847   best-2nd : p10   0  p25  6  median 15  p75  55  p90 155
         best-5th : p10  14  p25 43  median 86  p75 178  p90 398
453453   best-2nd : p10   1  p25  6  median 18  p75  59  p90 109
         best-5th : p10  20  p25 36  median 78  p75 113  p90 272
```

Survivors by band (rows `spreadMinCp`, columns `spreadMaxCp`):

```
291847        150   200   300   inf          453453        150   200   300   inf
  min5= 30     21    21    22    22            min5= 30     28    28    28    28
  min5= 60     12    12    13    13            min5= 60     20    20    20    20
  min5=100      8     8     9     9            min5=100     12    12    12    12
```

`spreadMinCp` 30 roughly doubles the yield over 60. Whether the extra positions
are *good* positions is not something the probe can answer — it is a judgement
about the exercise, and it wants a human looking at twenty of them. That is the
next measurement, and it is cheap: the probe already prints FENs and top-5 lists.

(The candidate total for the 453453 run was lost to output truncation; only its
grid and distributions were captured. Re-run it if the ratio matters.)

### 6.4 Confirmed incidentally

* **Dedupe by `cacheKey` is required.** The same position arrived twice from two
  different games in *both* runs. A storm that shows a position twice in one
  session is a storm that looks broken.
* **Over half of a bought course's frontiers are unusable by construction.**
  291847 has 71 distinct frontier positions and **38 of them come from
  custom-FEN variations** — tactics puzzles and annotated model-game fragments,
  which no real game passes through. 33 are eligible. (453453, a hand-built
  course, has 0 of 72.) Excluding these before sampling is not an optimisation:
  it is more than half the explorer requests on a course of that shape.
* **5 of 14 frontiers had no explorer games at all**, after custom-FEN
  variations were already excluded. The probe inherits the user's own
  `lichessFilters` rating and speed bands, and at frontier depth those are
  expensive. The storm should almost certainly relax them — this is the one
  place in the extension where "any human game at all" is a better question than
  "a game at my rating".

---

### 6.5 minPly 6, and where the advantage actually comes from

Run 2026-08-27, same seeds as §6.1 so the same frontiers are drawn:

| | 291847 | 453453 |
|---|---|---|
| candidates | 54 → **30** | ? → **33** |
| survivors | 12 → **5** (22% → 17%) | 20 → **17** (52%) |
| ChessDB per survivor | 11 → **29** | **8** |
| survivor evals | +1.62 +1.87 +1.08 +1.20 −0.04 | −0.32 … +0.84 |

**Walking deeper does not work, and on the wrong course it costs three times as
much.** 291847's survivors barely moved — four of five are still over +1.0 — and
the cost per usable position nearly tripled, because the walk pays the same
ChessDB requests for plies 1-5 and then throws them away. `minScored` also
rejects a larger share (11 of 30 vs 16 of 54), which is §3.3 arriving on
schedule: the deeper the walk the less ChessDB will grade.

**Where the advantage comes from — `--frontiers`.** One `queryall` per frontier,
no games fetched, user's perspective (291847, 26 of 33 scored, 7 unknown):

```
p10 0   p25 8   median 39   p75 80   p90 188
inside the [-100, +200] band: 23 of 26 (88%)
most one-sided:  +299.58  +5.73  +2.09  +1.88  +1.86  +1.16
```

So §7's diagnosis was right and the cause is **inherited, not accumulated**. The
top of that list is the Scotch chapter, and one trajectory shows what happens to
it — frontier `Scotch 4...Qh4?!` at **+1.16**, then eight plies of a real game:

```
+1.16  +1.62  +1.62  +1.74  +1.62  +1.62  +1.62  +1.62  +0.51
```

The walk does not dissipate an advantage; it *holds* it, because the walk stops
precisely when somebody stops playing well (§5.1). A one-sided frontier yields
one-sided positions however far you go, which is why option 3 could never have
worked.

⚠️ The first run of `--frontiers` reported the mirror image of this
(median −20, nothing above +0.80) because it flipped the score on **which colour
the course is for** instead of on **whose move it is in the frontier position**.
Those are usually opposite — a White line ending after White's move leaves Black
to move — so every frontier came out negated. The walk's own `evalUser` had it
right; only the new block was wrong. Fixed, and the fix is the reason this
paragraph is here rather than a silent correction: it is the exact class of bug
§7's whole argument would have been built on.

---

## 7. THE EVAL BAND — resolved, and it moves to stage 0

The author's condition was *the position shouldn't be losing for the user*. The
measurement says that is not the binding constraint; the opposite is.

Every surviving position on course 291847, at `minPly` 2:

```
+1.30  +1.62  +1.62  +1.65  +1.87  +1.88  +1.88  +1.08
```

**A course variation ends where the author has achieved something** — that is
what makes it a line worth teaching — and §6.5 measures the consequence
directly: 291847's frontier evals run to a median of +0.39 and a p75 of +0.80,
with the Scotch chapter's four frontiers at +1.16, +1.86, +1.88 and +2.09. The
game then holds that advantage rather than dissipating it. Course 453453 does
not do this (survivors −0.38 … +0.84), so it is a property of the course, not of
the pipeline.

Of the three answers this document originally offered, **option 3 (walk deeper)
is refuted** by §6.5 — it moved nothing and tripled the cost. What is left is
option 1 (keep it: "you are better, do not spoil it" is a real repertoire skill)
or option 2 (tighten `userHiCp`), and option 2 has a much better home than the
one first proposed:

**Apply the eval band at STAGE 0, per frontier, before any game is fetched.**

* it is **one `queryall` per frontier**, and stage 0 already has every frontier
  FEN in hand from `buildCourseTree`;
* it rejects a whole *line* for one request, instead of discovering the same
  fact after 11-29 requests per position (§6.1, §6.5);
* on 291847 a cap of +100 removes exactly the four Scotch frontiers that
  produced almost every one-sided survivor, and keeps roughly 20 of 26 scored
  frontiers — so it is a scalpel, not the wholesale cut option 2 looked like
  when the band lived at stage 3;
* it composes with the frontier ranking of §4 stage 0, which is already a
  weighting step and now has a second criterion to weight by.

The stage-3 band stays as a backstop — a game can still wander out of the band
even from a balanced frontier — but it stops being the thing doing the work.

**What is still the author's call** is where to put the cap: +100 (drop the
"convert an advantage" lines) or +200 (keep them). That is a question about which
exercise is wanted, and it is not answerable by measurement. The 7 frontiers
ChessDB cannot score are a separate small decision — offer them unfiltered, or
skip them.

---

## 8. The storm itself

### 8.1 The verdict

Flat centipawn-loss bands, licensed by §5.2's spread filter:

| loss vs best | verdict | effect |
|---|---|---|
| ≤ 30cp | **good** | full points, streak +1 |
| ≤ 80cp | **decent** | points, streak held |
| > 80cp | **miss** | streak reset |

The premise of the whole feature is in the first two rows: **a move within
30cp of best is a good move, full stop.** Reward only the engine's first choice
and this becomes an engine-agreement trainer, which is a different — and much
less useful — exercise. The numbers are guesses and should be tuned the way §6
tuned the others.

After each answer, briefly: the user's move with its rank and loss, the best
move, and ChessDB's `winrate` for both. The clock is running, so this is one
line, not a panel.

### 8.2 The clock

Puzzle Storm's shape: one session clock, a streak multiplier, a miss resets the
streak. Whether a miss also costs time is a tuning question, not a design one.
The session ends on the clock, and the score is points.

### 8.3 The producer

The author's instinct — start on two positions and fill the rest in while the
user thinks — is right, and §6.1 says how right: ~11 ChessDB requests per usable
position, ~1s of politeness-spaced network each.

**The producer's unit is a FRONTIER, not a position.** One frontier yields two
game walks and, on the measured rate, one to three survivors — which is the only
reason 11 requests per position is affordable. Harvest all of a frontier's
survivors onto the queue at once.

Keep 2-3 ready. Refill whenever the queue drops below that and the user is
thinking. Nothing about the storm may block on the producer: an empty queue ends
the session cleanly rather than stalling on a spinner.

### 8.4 Where it lives

A full-window panel on `/course/<bid>/`, the shape section 24 uses (`inset: 16px`)
— this is something you are inside of, not a report read while doing something
else on the page underneath.

**The launcher goes in the course tree's header, not the corner.** That corner
already holds four things (24's own note: the tree at 54px, coverage at 16px, the
key-moves panel at 92px, and 16d's pin dock on every page). A fifth has to solve
the cluster rather than add an offset — and the tree is the right host anyway,
since it already holds the index the storm's stage 0 needs.

### 8.5 The board should be a fourth `cr.mode`

Not a board of its own. A storm card *is* a drill card (section 20) with a graded
answer instead of a binary one: same run-up, same "play one move", same
positions-from-elsewhere. And section 19 already established the branch —
`tryMove` calls `anPlay` in analysis mode instead of comparing against the line,
and `onSquare`/`onDragStart` ask `moverColor()`. A storm mode branches `tryMove`
to `stormPlay` and changes nothing else.

That means it inherits section 11c's rules wholesale, and section 11c is now
shared by **five** features rather than four. The three caller rules in CLAUDE.md
apply unchanged, in particular that a shape's colour is an inline style on
exactly one property and that `paintShape` takes a colour key or a CSS value.

The persisted piece harvest (`cloBoardPieces`) matters here for the same reason
it mattered for section 20's standalone pass: a course page has no Chessable
board to clone art from.

---

## 9. Costs and politeness

A 20-position session, at the measured rate: **~230 ChessDB, ~25 explorer, ~30
game exports.**

* **The explorer half is nearly free** — `cloPopularityCache` is already shared
  by sections 14, 21 and 24b, and the storm both draws on it and fills it. It
  must re-read before it writes (24b's `flushDbCache` lesson: `savePopCache`
  writes the object whole, and a panel holding a stale snapshot silently deletes
  every position another feature filled meanwhile).
* **ChessDB needs a cache of its own** and a per-session cap. `queryall&learn=1`
  does not enqueue work (DESIGN-chessdb.md §3.2, checked directly), but 230
  requests at a volunteer network is not a read to make casually, and the number
  grows linearly with session length.
* **Game PGNs are the cheapest thing here** and should be cached per game id for
  the session — the same game is regularly the top game at several frontiers of
  the same course.

---

## 10. The host permission

Approved 2026-08-27. It is this extension's third, and the bar CLAUDE.md sets is
the conversation the second one got — which this document is.

What it buys, exactly: §2.2 measured that master game PGNs need **no** new
permission and everybody-else games need one. Masters-only would work and would
be worse in a specific way — a repertoire's frontier at club level is often a
position no master has ever reached, and the games that *are* there are between
players whose problems are not the user's.

What it must look like:

* `"https://lichess.org/*"` in `host_permissions`, and the README's permissions
  rationale updated alongside it.
* a **`clo-fetch-game`** message type in the worker with its own guard, built the
  way `handleChessdbFetch` is: an allow-list, not a block-list. `queryall` is
  allowed there and nothing else; here the allow-list is the single path prefix
  `https://lichess.org/game/export/` and nothing else. `lichess.org` hosts the
  user's entire account — this guard is doing considerably more work than the
  chessdb one.
* the token already in `chrome.storage.local` may be sent for the higher rate
  limit. **It must not be sent to any path outside the allow-list**, which the
  guard above gives for free.

---

## 11. What this must never do

* **It never writes to the course.** Section 24's rule, for section 24's reason,
  and this feature has the same tempting button one line away — "add this
  position as a puzzle" from a storm card. Sections 19d/19e already do that
  safely from a board; a storm card must not grow its own.
* **It never touches Chessable's board and never reschedules anything.** Section
  20's guarantees are what make a list of positions from outside the course safe
  to drill at all.
* **It never calls ChessDB's `queue` or `store`.** DESIGN-chessdb.md §2.4. This
  is the single most tempting place in the codebase to break that rule — the walk
  stops on `unknown` eleven times in fourteen frontiers, and "ask them to analyse
  it" is one parameter away. Those two actions spend a volunteer network's
  compute, and a storm session would spend it in bursts of hundreds.
* **It never presents a `learn=1` fill-in as a book eval** (§3.3).
* **It never shows the same position twice in a session** (§6.4).

---

## 12. Open — what was NOT measured

1. **Whether `spreadMinCp` 30 produces *good* positions or merely more of them**
   (§6.3). Twenty FENs and a human. The probe already prints them.
2. **Where the §7 stage-0 cap goes** — +100 or +200. Not a measurement; a
   decision about which exercise is wanted. Option 3 is now closed (§6.5).
3. **Whether a `learn=1` fill-in score is good enough to grade a move.** This is
   DESIGN-chessdb.md §10.1's open question arriving from a second direction, and
   it matters more here: there it decorates a column, here it decides whether the
   user was right. The probe to run is the same one — 20 positions, fill-in score
   vs local depth 30, report the spread.
4. **Whether relaxing `lichessFilters` recovers the 5-in-14 frontiers with no
   games** (§6.4), and what it costs in position quality.
5. **The bulk export endpoint.** Lichess is believed to expose a
   `POST /api/games/export/_ids` taking many ids in one request, which would
   collapse the PGN half of §9 to almost nothing. **Entirely unverified** — not
   read in the docs, not called, not shaped, not counted here.
6. **Whether a badly-missed storm position could be pinned** (section 16b) and
   come back in the drill. Attractive, and not free: a pin record is anchored on
   `bid` + `oid` + `sourceFen`, and a storm position has a `bid` and a FEN but no
   variation it belongs to. It would need a synthetic record kind, and that is a
   change to a store that syncs across devices — not something to bolt on.
7. **Rate limits on any of the three APIs under storm-shaped bursts.** Nothing
   was hit; nothing was pushed either.
8. **CLAUDE.md's contract surface.** When this is built it takes a section number
   and a bullet, and `py dev/check-contracts.py` will want every bridge named.
   None exist yet, so there is nothing to add — but the storm will almost
   certainly own at least a `stormActive()` for the modules that must stand down
   under an overlay, exactly as `continuationActive()` is used today.

---

## 13. Reproducing

The probe needs `dev/tmp-courses.json` (gitignored — recipe in the header of
`dev/probe-course-tree.js`) and `local-token.json` for the explorer's Bearer
token. It exits 2 with a sentence if either is missing.

```bash
node dev/probe-storm.js --bid 291847 --n 14 --maxply 16 --seed 7
node dev/probe-storm.js --bid 291847 --frontiers          # §6.5, no games fetched
```

`--minply` and `--frontiers` are what §6.5 was measured with. `--frontiers`
ignores `--n` and scores every eligible frontier, one request each, which makes
it the cheapest question in this file to ask of a new course.

`--seed` makes the frontier sample reproducible; changing it is how to check
that a number is not an artefact of which fourteen lines were drawn.

The three wire facts of §2 need no extension, no Chessable and no browser:

```bash
curl -s "https://explorer.lichess.org/masters/pgn/boLujJkB"
```

That one is the whole of §2.2 — a 200 and a PGN means master games are reachable
on a host permission this extension has had since the beginning.

---

## 14. What shipped (v0.130.0)

The pipeline is §4's, unchanged, and every threshold in `CONFIG.storm` is one of
§6's measurements with the section number beside it. What follows is only what
is NOT in this document above.

### 14.1 The permission is a path prefix, not a host

`https://lichess.org/*` is in `host_permissions` because a match pattern's path
is not something to lean on, but the worker's guard is
`url.startsWith('https://lichess.org/game/export/')` and nothing else —
`handleGameFetch`, built the way `handleChessdbFetch` is, an allow-list rather
than a block-list. `ALLOWED_URL_PREFIX` was NOT widened.

Two things §2 did not say that the implementation found:

* **`handleExplorerFetch` called `response.json()` unconditionally**, so
  `explorer.lichess.org/masters/pgn/<id>` — which passes the existing prefix
  guard — came back as a parse error rather than a PGN. It now takes an
  `as: 'text'` read.
* **That path must not require a token.** The worker's early 401 exists to raise
  the panel's "paste a token" prompt; applied here it would make the
  no-permission fallback need the very thing it exists to work without. A text
  read sends the token when there is one and proceeds without it when there is
  not.

The masters path is therefore a live fallback rather than a note: the first time
a game export fails, `st.mastersOnly` switches the rest of the session over,
because the likeliest cause is a fact about the session (the permission absent or
withdrawn) rather than about that one game.

### 14.2 Two departures from this document

* **§9's "the storm both draws on and fills `cloPopularityCache`" is not built,
  and should not be.** That cache is tagged with the panel's own
  `lichessFilters` and a moves limit; the storm asks with RELAXED filters (§6.4)
  and `moves: '0'`. It has nothing correct to write there, so 24b's
  `flushDbCache` hazard cannot arise — the safer answer than re-reading before
  writing.
* **§4's "weight by section 21's ranking" is half built.** `stormDrawFrontier`
  weights by `ends[].n`, which is free. The reachability product is one explorer
  request per distinct position of every line — section 21's own cost, and it
  belongs behind section 21's own arming rather than in front of a storm's first
  card.

### 14.3 The card is one ply, and that is load-bearing

A storm card is section 18's `cr.line` shape carrying exactly ONE ply: the
position's own best move. Not decoration — `startLine` ends in `step()`, and an
EMPTY ply list reads there as "this line is already finished", so the card would
be skipped the instant it reached the board. `tryMove`'s storm arm intercepts
above the comparison, so the ply is never used as an ANSWER; it is what makes a
card a card, and the "best" the verdict line names at no extra lookup.

No run-up is played. A drill card animates the opponent's previous move
(`drillLeadPlies`), which is ~350 ms of a card; here the clock is running, so the
move that led to the position is TINTED instead — the same information,
instantly, and `applyStormArrival` is the whole of it.

### 14.4 `cr.treeSlot` became `cr.hostSlot`

24g's slot mechanism now has two guests, so the field is `cr.hostSlot` with a
`cr.hostKind` (`'tree' | 'storm' | ''`) beside it, and `.clo-cr-intree` is
`.clo-cr-inhost`. Nothing about the mechanism changed; 24g's three rules apply
to both.

### 14.5 The producer, as built

Its unit is a frontier (§8.3). One frontier costs a stage-0 `queryall`, one
explorer call and two game fetches, and yields one to three usable positions —
which is the only reason ~11 ChessDB requests per position is affordable. The
loop keeps `queueTarget` (3) ready and refills while the user thinks; an empty
queue with the pool spent ENDS the session cleanly, and nothing about the storm
blocks on it.

Two guards §9 asked for: an in-memory ChessDB cache that also caches the MISSES
(a position it has never seen is the ordinary case off theory), and a
per-session cap (`cdbMaxPerSession`) that is a promise rather than a performance
guard — a session's burst has a ceiling however long it is left running. The
summary prints what was spent, which is the other half of not making it
invisible.

### 14.6 The privacy gate is the press

Section 26's `cdbWanted()` is deliberately not consulted. That gate exists so
nothing sends a position to a second third party for a user who has switched
nothing on; here the switch IS the press — the launcher names both services in
its tooltip and the feature cannot do anything at all without them. Requiring
the eval column's own preference as well would refuse the thing the user just
asked for.

### 14.7 What is verified, and what is not

Verified with no browser: `node dev/check-storm.js` (92 assertions over the real
producer, sliced; three controls each failing on exactly their own assertions),
`node dev/check-course-tree.js` and the rest of the suite unchanged,
`py dev/check-contracts.py`, and every `.clo-st-` surface measured in
`dev/harness.html` at 880px, 360px and under `html.clo-touch` — no overflow in
any of them, and the narrow layout's board/panel split had to be re-shaped after
the first measurement showed the panel at 2px.

Verified against the live wire: both PGN endpoints answer 200 with
`application/x-chess-pgn`.

**Not yet verified in a live session:** a whole storm end to end — the producer's
timing under real network latency, the board handing over between cards, and
whether ~11 ChessDB requests per position feels like a pause or not. §12's list
is otherwise unchanged.

### 14.8 §3.4's third tier is not optional, and the live run is why

Three answers in a row on course 291847 came back **"No verdict"** — neither the
position's scored list nor the child had anything to say. The reason is in §3.2
and was read too optimistically here: 98% coverage was measured over **real game
continuations**, and the child of an *arbitrary* move is a position no game ever
reached. A human plays plausible moves, so the true rate is somewhere between
this and 98% and has not been measured — but three in a row is what a user would
see, and it reads as broken.

So the tier §3.4 names in one clause is built:

* **Two searches, not one.** A loss is a subtraction, and mixing `best(P)` from
  ChessDB's book with `best(P after m)` from Stockfish puts the systematic
  offset between two evaluators — easily wider than the whole 30cp `goodCp`
  band — straight into the verdict. Both sides come from the same engine or the
  answer is refused. For the same reason an engine-graded line names the
  **engine's** best move and score, and prints no win rate: a win rate is a book
  figure.
* **It is the second perspective flip in this feature, running the other way.**
  `engine/engine.js` normalises to White; ChessDB is the mover's.
  `stormMoverCp` is the conversion, and `dev/check-storm.js` §10 asserts it as a
  relation (the two readings of one score are opposite) rather than case by
  case.
* **Seconds, not minutes.** The alt check's watchdog is two minutes because it
  is a popup being read; this is a card with a clock running, so
  `engineTimeoutMs` is 6 s at depth 14 and a search that has not landed
  degrades to "No verdict" — which scores nothing and holds the streak, because
  it is not the user's fault and not an achievement either.
* **The claim is section 15's**, and `endEngineJob` is the one place that gives
  the engine back: on the answer, the timeout, an engine error, and
  `endSession`. A leaked `state.altCheckBusy` is a panel whose engine never
  starts again.

Still open, and now sharper than §12.3: **how often the child is unknown for a
move a HUMAN would actually play.** The probe cannot ask that — it walks real
games, where by construction the move is known.

### 14.9 The ply range is a setting

`minPly`/`maxPly` are `cloStormMinPly`/`cloStormMaxPly` in storage.local, edited
in the storm's own window. "One move after the variation ends" and "eight moves
after" are different exercises, and which is wanted is a judgement rather than a
measurement — so it is a dial and the probe's numbers are the defaults.

The pure walks never learn a setting exists: `cfg()` is `CONFIG.storm` with the
range folded in, built per call, so `dev/check-storm.js` goes on executing them
against a config it declares itself. The selectors show only when no clock is
running — before the first card and after the last — because changing the range
mid-session describes an exercise the queued positions are not from, and those
are also the two moments the user is waiting rather than playing.

### 14.10 The review, and the invented line

**A frontier with no games gets one anyway.** §6.4 measured 5 of 14 with nothing
in the explorer even with the filters relaxed. `stormRandomLine` is the same walk
with a different move source: at random among ChessDB's own top moves, within
`randomTopCp` and at most `randomTopN` of them. That band is the whole of what
keeps it plausible — a uniformly random legal move reaches positions no player
does, which is what §5.1's blunder stop keeps out of a real walk. Two things
follow and are worth stating rather than discovering: the blunder stop cannot
fire here (nothing plays a blunder), so `decidedCp` and the unknown stop are what
bound it; and a candidate from here is MARKED `invented`, because "8 moves past
the line" is a claim about somebody's game and here there is no game.

**And every answered position is kept.** A timed exercise is one you cannot think
during, so the thinking has to be available after it: the clock running out
raises a review — the position, the move you found, the move there was, and the
loss — walked with the arrows or by clicking, with section 19's analysis board
one press away on any of them.

Three things it rests on:

* **The board is section 11c's static one**, not section 18's playable one:
  nothing on it is answered, and two arrows are all it has to say. Green for the
  best move, red for yours, and only where they differ — two arrows on one pair
  of squares is a thicker arrow, not a second claim.
* **The verdict line is the same line the card printed**, from the same three
  helpers — which is why they had to move to top level (§14.7's live failure).
* **The analysis board brings the panel with it.** `stormPanelSlot` is a second
  supplier of the slot `positionTreePanel` places into, so the database, the
  engine and the repertoire badges arrive with no new UI. That third slot exists
  only while the board does: during a card the database's top move would name
  the answer.

### 14.11 The gathering is separable, and the store is the point

The expensive half of this feature is FINDING a position — ~11 ChessDB requests
each (§6.1) — and it was being paid at the worst possible moment, while the user
waited for a card. So it is separated: **Gather positions** runs the same
producer with nothing on the other end of it, writes what it finds into a store,
and shows a count. A session then opens on what is already there.

Measured live 2026-08-28, same tab, same course: **the first card went from ~50 s
to 3.1 s**, and the 3.1 s is a `storage.local` read and a clamped poll, not
network.

* **`chrome.storage.local`, keyed by course**, with short keys and every scored
  move kept. The tempting saving is the top few moves; it is also invisible,
  because `stormMoveLoss` then misses the user's own move and falls through to a
  fallback that was supposed to be the exception. ~700 bytes a position, so
  `storeMax` of 900 is about 0.6 MB per course, in a 10 MB quota shared with
  every other feature here. No `unlimitedStorage` permission is asked for.
* **The retention rule is the user's own**: answered well, it leaves; missed, it
  stays and comes round again — and it sorts ahead of a position never seen,
  because it is the one they have proved they want back. An UNGRADEABLE answer
  keeps it too: nothing was learned either way, and dropping it spends eleven
  requests to meet the same silence twice.
* **The gather pass is the same `harvestFrontier`.** A second walk written for
  gathering is a second set of pick rules that will one day disagree about what a
  usable position is. It saves as it goes, because it is meant to be left
  running.

### 14.12 Carrying it between devices

Section 16e already proved this wire for the pinned mistakes: an informational
card in the user's own course, `--` as its move so it is never quizzed, base32
because Chessable's comment parser rewrites anything that spells a SAN, and an
`oid` on the write so it overwrites in place. The store rides the same transport
through `pinSyncApi.carrier`.

**A bridge rather than a hoist**, and that is the decision worth recording:
which course, the JWT, the card shape, the encoding and the overwrite are all
decided in 16e and decided once, and a copy of any of them is a copy that will
one day disagree. What 16e gave up for it is two parameters — `cardEntry` and
`ensureSlot` take a card name.

Three things the payload has to get right, and all three fail quietly:

* **The merge is a union over a whole snapshot, so it needs tombstones.**
  Without them a position the retention rule dropped comes back from the other
  device's copy on every exchange, for ever. `storeNote` records one on every
  drop whether or not syncing is on — it costs a timestamp, and it is needed the
  moment it IS switched on.
* **Read, merge, write, in that order.** The card is overwritten in place;
  writing first discards whatever the other device put there since.
* **The SAN is dropped on the wire** and recomputed from the uci — about a third
  of the payload, once per exchange rather than once per session. A move whose
  uci will not resolve is dropped rather than carried with a blank SAN, because
  the verdict line names moves and a blank one there reads as a defect.

**The ceiling is measured, not inherited.** 16e's §4.3 proved 128 KB with a
ladder and its own constant stops at 120000. For this payload: **162460 base32
characters written to a comment and read back BYTE-EXACT**, still base32-clean,
still `moves: []` in `getList`, still one card (2026-08-28, test account, course
453453; the card was deleted afterwards with `updateOpening&mode=del&val=1` and
the course re-read to prove it — 80 variations, none left). `maxWireBytes` is
150000, which keeps a margin and is about 190 positions.

**Not yet verified live:** the exchange end to end. It needs a course chosen for
syncing on the options page, which this session could not reach — the browser
tooling refuses `chrome-extension://` URLs. What WAS verified on the wire is the
part that is new: a second informational card of the storm's own name, created,
overwritten in place at 162 KB, read back byte-exact, and deleted.
