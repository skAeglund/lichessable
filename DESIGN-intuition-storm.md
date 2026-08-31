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

| loss vs best | verdict | points | effect |
|---|---|---|---|
| ≤ 30cp | **good** | +3 × multiplier | streak +1 |
| ≤ 70cp | **decent** | +1 × multiplier | streak +1 |
| > 70cp | **miss** | **−2, flat** | streak reset |
| ungradeable | **unknown** | 0 | streak held |
| never answered (§14.10c) | **unanswered** | 0 | — |

The premise of the whole feature is in the first two rows: **a move within
30cp of best is a good move, full stop.** Reward only the engine's first choice
and this becomes an engine-agreement trainer, which is a different — and much
less useful — exercise. The numbers are guesses and should be tuned the way §6
tuned the others.

`decentCp` was **80 until v0.139.0** and is now 70, and **a miss costs −2**
where it used to cost nothing (both the author's own call). Three notes on the
penalty:

* **It is FLAT, never multiplied.** The streak multiplier is a reward for a run;
  charging it against the answer that ENDS the run would make one lapse after
  twelve right answers cost four times what the same lapse costs after none —
  punishing the streak rather than the mistake, and giving a long streak a
  reason to be protected by passing. (Passing is itself a miss, so that door is
  shut either way.) The failure mode is invisible from outside: the score still
  moves in the right direction, just by the wrong amount, and only on the
  answers hardest to reproduce on purpose — hence
  `dev/check-storm.js`'s "costs exactly the same on a long streak", which is
  the only one of the three point assertions a multiplied penalty fails.
* **The session score can go negative**, deliberately. Flooring it at zero makes
  every miss after the first free, which is the opposite of what a penalty is
  for. `missPoints: 0` is the way back to Puzzle Storm's shape.
* **`unknown` and `unanswered` are still 0.** Neither is the user's doing, and
  charging for a position ChessDB cannot score is the one unfair verdict
  available here — the same argument that already keeps `unknown` out of the
  streak reset.

One rendering consequence, and it survives every numeric assertion:
`stormVerdictLine` prints the figure SIGNED now. The old unconditional `'+'`
rendered the penalty as `"+-2"`.

After each answer, briefly: the user's move with its rank and loss, the best
move, and ChessDB's `winrate` for both. The clock is running, so this is one
line, not a panel.

### 8.1a Grading depth, and what it costs now the clock is paused

Grading has three tiers (§3.4) and **only the third has a depth at all**:

| tier | source | depth |
|---|---|---|
| the position's own scored list | ChessDB `learn=1` | none exists (DESIGN-chessdb.md §3.1) |
| one `queryall` on the child | ChessDB `learn=1` | none exists |
| two Stockfish searches | the vendored engine | `engineDepth` |

So most cards are graded by a source of unmeasured strength — DESIGN-chessdb.md
§10.1 / §12.3, still open, and sharper since §12.7b measured that tier 1 scores
exactly the ~5 moves whose CHILD is in the graph.

**`engineDepth` was a flat 14 and is now 20 desktop / 18 mobile** (v0.134.0, on
the author's instruction: *correct results are more important than low wait
time*). The original 14 was chosen when the session clock RAN during the grade,
so every second of search was stolen from solving. v0.133.0 paused the clock for
exactly this wait (§8.2), which removes the whole argument for searching
shallow. What is left is a user watching a held board, and a wrong verdict costs
more than a slow one — especially here, this being the tier reached only where
ChessDB could not answer at all, i.e. the least-informed grade in the feature.

For scale, the other engine users in this extension: the panel searches to 30
(desktop) / 25 (mobile), the alt check to 20 with a two-minute watchdog. Both
new values sit under the profile ceilings, so engine.js's
`Math.min(pendingDepth, prof.depth)` passes them through rather than clamping.

**THE WATCHDOGS HAD TO MOVE WITH IT, and this is the part that would fail
silently.** `engineTimeoutMs` is armed once when the job is created and is never
re-armed between phases, so one timer covers BOTH searches; at the old 6 s a
depth-20 pair would simply never land, and the tier would degrade to "No
verdict" every single time — strictly worse than searching shallow, because it
then grades nothing at all. `gradeTimeoutMs` must in turn stay comfortably above
`engineTimeoutMs`, or it fires first and the engine watchdog can never matter.

```
            was      now
engineDepth       14   20 desktop / 18 mobile
engineTimeoutMs  6 s   20 s     (one timer, both searches)
gradeTimeoutMs   9 s   30 s     (armed before the ChessDB tiers too)
```

**MEASURED 2026-08-29 — §14.24**, which supersedes the paragraph below on two
points and confirms the rest. `enginePhaseMs` (which replaced `engineTimeoutMs`
as the operative limit in v0.149.0) is spent in full on nearly every DESKTOP
card and on none of the mobile ones; the watchdog fires never, and
`engineDepthSlack` refused 0 of 48 pairs. **The expectation that mobile is the
profile with no margin is wrong** — the lite build on two threads is three times
faster than the full build on four, and it is `engineDepth.desktop` 20 that is
reached once in twelve. `CONFIG.storm` is unchanged; §14.24.3 is the grid to
move a number from.

⚠️ **THE TWO TIMEOUTS ARE ESTIMATES, NOT MEASUREMENTS.** Depth is roughly
exponential in nodes, and 14 → 20 is six plies; the figures above assume a
depth-20 pair lands in a few seconds on the full build with 4 threads and a
depth-18 pair in under ~20 s on the lite build with 2. Neither has been timed on
real storm positions, and the mobile side is the one with no margin. **What to
measure:** wall time for `stormEngineLoss` per profile over a session's worth of
fallback grades, and how often the watchdog fires. If it fires at all often on
mobile, the fix is a lower mobile depth rather than a longer timeout — a board
held for 20 s is already at the edge of what a paused clock excuses.

### 8.2 The clock

Puzzle Storm's shape: one session clock, a streak multiplier, a miss resets the
streak. Whether a miss also costs time is a tuning question, not a design one.
The session ends on the clock, and the score is points.

**Three minutes** (`sessionMs`, lowered from five in v0.132.0 on the author's own
call): five was long enough that the last stretch was answered tired, and §14.10
is where the value mostly is anyway — a shorter clock puts more of the sitting
there. Nothing is derived from the number: `maxPositions` and `cdbMaxPerSession`
sit far above what a session of any length reaches, and `reviewMax` is a memory
bound, so it is safe to move again.

**IT ONLY RUNS WHILE THE USER IS BEING ASKED SOMETHING** (v0.133.0, on the
author's instruction). `solving()` is the predicate — a card up, no verdict
line, not grading, not gathering — and the clock tick charges time only while
it holds. Everything else on this board is the user WAITING:

| state | typical cost | who is waiting |
|---|---|---|
| `st.grading` | up to `gradeTimeoutMs` 9 s | the board is held SHUT by §18 |
| `st.verdict` | `verdictMs` 2.6 s per card | the verdict line is being read |
| no `st.card` | a producer round trip | the next position is being fetched |
| `st.gathering` | minutes | the store is being filled |

Grading is what forced it. Section 18 holds the board shut from the moment the
move is played until a verdict lands, so up to 9 seconds of a 180-second
session were not merely unspent but **unspendable**, and a session was partly a
measure of how fast ChessDB answered. With ChessDB's own latency measured in
hundreds of ms and the engine tier capped at 6 s, that was real.

**A DEADLINE THAT SLIDES, not a countdown that is decremented.** `paintClock`
and the expiry test both already read `st.endsAt`, so pushing it forward by the
time spent waiting pauses the clock in both at once; a second "remaining"
counter is the version where the display and the expiry disagree. The tick that
straddles a transition attributes its whole `dt` to whichever state it lands
in, so each transition is up to `tickMs` (200 ms) out — opposite in sign in the
two directions and equally likely, so it cancels rather than accumulating.

**Two consequences worth knowing:**

* **A three-minute session now yields noticeably more cards** — roughly 2.6 s
  per answer comes back from the verdict line alone, plus whatever grading and
  production cost. The number is unchanged and still safe to move (nothing is
  derived from it), but it no longer means the same amount of screen time.
* **THE CLOCK CAN NO LONGER EXPIRE MID-GRADE**, which closes a real hole for
  free. `endSession` used to be reachable while a grade was in flight; the
  verdict then landed on `st.card === null`, fell through `gradeInner`'s own
  guard and was DISCARDED — costing no points (an ungraded card scores 0
  either way) but leaving the position out of `st.history`, so the one card
  most in mind was the one missing from the review that opens on it. The clock
  no longer ticks while `st.grading`, so it cannot end a session there. Exit
  and a closed board still can — and since v0.138.0 they no longer discard
  either: §14.10c keeps whatever card is on the board on EVERY route out, and
  `st.lastPlayed` is what lets the review name the move that was being graded.

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
   (§6.3). Twenty FENs and a human. The probe already prints them — and since
   2026-08-29 it prints the `minScored` ones too, which is the same shape of
   question with a larger prize; see §12.7c, where those twenty are recorded in
   this document so the look does not need a re-run. This entry is the one
   still outstanding.
2. **Where the §7 stage-0 cap goes** — +100 or +200. Not a measurement; a
   decision about which exercise is wanted. Option 3 is now closed (§6.5).
3. **Whether a `learn=1` fill-in score is good enough to grade a move** — asked
   and **ANSWERED 2026-08-29, YES**, see §12.3b. This is DESIGN-chessdb.md
   §10.1's open question arriving from a second direction, and it matters more
   here: there it decorates a column, here it decides whether the user was
   right. The probe to run was 20 positions, fill-in score vs a local search,
   report the spread; `dev/probe-cdb-quality.js` is that probe.
3b. **The run** (2026-08-29). §12.3 is the feature's core claim: tier 1 of §3.4
   grades most cards straight out of `queryall(P, learn=1)`, and §12.7b
   established that that list is exactly the moves whose CHILD is in ChessDB's
   graph — a game-derived number of unmeasured strength, not a search. If it is
   wrong by more than a band width often enough, §16's five bands are measuring
   the wrong thing and no amount of interface work matters.

   ```
   node dev/probe-storm.js --bid 453453 --n 16 --seed 7 --dump-fens dev/tmp-storm-fens-453453b.json
   node dev/probe-storm.js --bid 453453 --n  8 --seed 1 --dump-fens dev/tmp-storm-fens.json
   node dev/probe-storm.js --bid 291847 --n  8 --seed 1 --dump-fens dev/tmp-storm-fens-291847.json
   node dev/probe-cdb-quality.js --fens <the three, merged and deduped> --n 22 \
       --depth 24 --capms 120000 --moves 10 --threads 6 --build full
   ```

   **22 storm SURVIVOR positions** (20 from 453453, 2 from 291847 — the
   composition is the pipeline's, not a choice: §12.7c's 10-vs-23 is why the
   bought course contributes so few), **174 moves**, ChessDB `learn=1` against
   the vendored Stockfish 18 full build at 6 threads, MultiPV over the sampled
   moves. Depth reached 19-23, median 20.

   **The headline.**

   ```
   |ChessDB - engine|, cp   <25: 125 (72%)   <50: 32 (18%)   <100: 17 (10%)   100+: 0 (0%)
     in book         n= 23  <25:  15 (65%)   <50:  5 (22%)   <100:  3 (13%)
     fill-in         n=151  <25: 110 (73%)   <50: 27 (18%)   <100: 14 ( 9%)

   VERDICT BAND (stormGrade of the same move, both sides)
     same band           122   70%
     one band out         45   26%
     two bands or more     7    4%

   collapsed to what the answer DOES (scores / nothing / costs)
     same outcome        129   74%
     scores <-> costs      3

   ChessDB's best move == the engine's best of the set:  18 of 22
   ```

   **Four findings, in order of how much they decide.**

   * **THE DANGEROUS DIRECTION IS EMPTY.** Not one of the 174 moves was scored
     `great`/`good` by ChessDB and called `bad`/`blunder` by the engine. The
     three sign reversals all run the other way — a move graded a mistake that
     the engine likes. **The feature never tells the user a bad move was the
     move**, which is the only failure that would make it actively harmful.
   * **AND THE ERROR IS BIASED THAT WAY THROUGHOUT.** Of the 52 band
     disagreements, **42 are ChessDB being HARSHER** than the engine and 10
     more lenient. A grade that is occasionally too strict is the one to have.
   * **THE FILL-INS ARE NOT THE WEAK HALF** — they are marginally the better
     one (73% within 25cp against the book's 65%, n=151 vs 23). So
     DESIGN-chessdb.md §3.3's rule — never *present* a fill-in as a book eval —
     stands as a rule about honesty, not about accuracy, and §14.20's label
     naming the tier is the right shape of answer to it. **Nothing here argues
     for a `learn=0` gate on the grade.**
   * **THE ERROR IS PER-MOVE NOISE, NOT A PER-POSITION OFFSET.** The obvious
     tidy explanation — every move of a position read the same amount too high,
     so the loss (a difference) cancels it — is **wrong**: the median
     per-position offset is 0cp (range −72 to +10), and removing each
     position's own offset moves the <25cp figure only from 72% to 74%. So
     ChessDB is not "a poor evaluator that still ranks well". It is a
     reasonable evaluator, move by move, with a spread of about 20cp.

   **Where it does go wrong, it goes wrong at the anchor.** The clearest case,
   position 8 of the run (`r1b1kb1r/pp1ppppp/1qn2n2/8/4P3/1NN5/PPP2PPP/R1BQKB1R
   b KQkq - 4 6`): every one of its ten moves is within 67cp and most within
   25, but ChessDB reads its own top move `e6` at −19 where the engine reads
   −79, and that 60cp of optimism about the BEST move is subtracted from every
   other move's loss — so seven of the ten land a band low, all in the harsh
   direction. Across the whole run the top-ranked move's error (median 19cp) is
   not much worse than any other move's (median 12cp); it simply costs more,
   because it is the one number every verdict in the position is measured
   against.

   **In the units the verdict is stated in** (§16), the two sources disagree by
   a median of 1.72 points of win probability, p90 5.17, max 9.18 — against
   band widths of 3, 3, 4 and 10. That is the honest statement of the noise:
   roughly half a band typically, a whole band at the tenth percentile. Only 3
   of the 52 band disagreements are a threshold straddle (the two losses within
   1 wp point of each other); the rest are real differences of about that size.

   **THREE DEPARTURES FROM §12.3'S SPECIFICATION**, each a decision:

   1. **Depth 19-23, not 30.** Measured on the author's desktop, MultiPV-8
      depth 24 alone is 220 s and depth 30 is tens of minutes *per position*;
      22 of those is not a probe. So the budget is a wall clock and the depth
      reached is REPORTED — v0.149.0's own rule for the shipped engine tier
      (§14.23), arrived at here for the same reason. A depth-20 Stockfish 18 is
      not the binding constraint on an answer whose resolution is a 33cp band.
   2. **The moves sampled are a SPREAD over ChessDB's own scored list**, not
      "the top 8 plus a few plausible developing and capturing moves". §12.7b
      is why: `learn=1` scores exactly the moves whose child is in the graph, so
      a plausible developing move is very often not in the list at all — and a
      move ChessDB does not score is not tier 1's business, it falls to tier 2
      or 3. The population this question is about is precisely ChessDB's scored
      list, and the sample takes its top four plus the rest evenly spaced down
      to the worst move it names, so the bad moves a human actually plays are
      in it.
   3. **The metric is bands as well as centipawns.** §12.3 asked for the
      spread; the spread does not by itself say whether the feature is sound,
      because a band is a band regardless of how wide the error is inside it.
      Both are reported, and the collapse to scores/nothing/costs is the one to
      argue from.

   ⚠️ **AND §12.3c REOPENED ONE CORNER OF IT (2026-08-30, §23.1) — READ THAT
   BEFORE QUOTING THIS BLOCK.** Everything above stands; what it did not ask is
   whether the error is spread evenly over a position or concentrated on the ONE
   number every verdict is measured against. It is concentrated: ChessDB's own
   top move is over-scored by a median 11cp relative to the rest of the same
   position, 14 positions to 1, a depth-30 search does not move towards it, and
   that alone accounts for 70 of 100 band disagreements. The grade moved to
   Stockfish in v0.158.0. The "harsher, never flattering" finding below is
   exactly what an inflated ceiling produces, so the two readings agree — this
   block simply attributed it to noise.

   **What this closes and what it does not.** It closes §12.3: the grade is
   sound enough, the bands are not measuring the wrong thing, and **nothing
   should be widened** — TODO-storm.md block 2 said explicitly that if fill-ins
   were poor the answer would be to reach the engine tier more often, and they
   are not poor. What it does not answer: the sample is 22 positions from
   effectively one course, the engine reference is restricted to the sampled
   moves (so where the true best lies outside them, every engine loss is
   understated by the same amount, biasing the report TOWARDS agreement), and
   nothing here says anything about tier 2 (`best(P) + best(P after m)`), which
   is a different arithmetic on the same data.
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
7b. **Whether ChessDB's `queue` would recover the yield an overnight gather
   loses** — asked and ANSWERED 2026-08-28. **NO. Do not build it.**
   `dev/probe-chessdb-queue.js`, 29 positions on course 291847, queued vs
   control, read back after 48 minutes.

   ```
   KIND     ARM      n    scored: baseline -> +48min     reached minScored 6
   unknown  queued   5    0.0 -> 5.0                     0
   unknown  control  4    0.0 -> 1.0                     0
   thin     queued  10    3.7 -> 5.1                     1
   thin     control 10    3.1 -> 5.0                     0

   final scored counts, all 29:  1 1 1 1  5 5 5 ... 5 5 5  6
   learn=0 (the real book), all 29:  1
   ```

   **THE CEILING IS FIVE, AND `minScored` IS SIX.** 25 of 29 positions landed
   on exactly 5 scored moves. That is not a distribution, it is a stop.

   **AND THE REASON IS STRUCTURAL, NOT A MATTER OF WAITING LONGER** — which is
   the first thing to check, since §2.4's 25-minute success was a SEVEN-legal-
   move pawn endgame and these positions have 19-48. Re-read at 76 minutes,
   then probed child by child (`--children`):

   ```
   at 76 min:  unknown queued 0 -> 5.0     unknown control 0 -> 5.0
               thin    queued 3.7 -> 5.1   thin    control 3.1 -> 5.0
               learn=0 (the real book), all 29: still 1

   one position, every child probed with learn=0:
     legal moves 43   children in the book 5   parent scores 5
     known child AND scored 5 | known not scored 0 | scored but unknown 0
   ```

   **`learn=1` SCORES EXACTLY THE MOVES WHOSE CHILD IS IN THE GRAPH.** A
   perfect 1:1 on all 43. So the width of the answer is a property of the
   CHILDREN, and `action=queue` on the parent cannot change it at any
   timescale — widening one position means queueing its ~38 unknown children,
   and a 200-position gather would be ~7600 writes. ChessDB's graph is
   game-derived: at this depth only a handful of continuations have ever been
   played, and that is a shape, not an analysis budget you can buy.

   The 76-minute read also kills the acceleration argument: the CONTROL arm
   caught up from 1.0 to 5.0 with no write at all. Queueing reached the same
   endpoint sooner and nothing more — and the book never moved off 1 in either
   arm, which is what says the queue work had not landed even at 76 minutes.

   ⚠️ I FIRST CONCLUDED THIS AT 48 MINUTES ON THE WRONG EVIDENCE — "only 1 of
   29 cleared the bar" — with `learn=0` sitting at 1 in both arms, which was
   the plain sign that the queue had not finished. The conclusion survived; the
   reasoning did not. Anyone revisiting this should re-run `--children` rather
   than trust the headline.

   **For `thin` the queue is noise**, at 48 and at 76 minutes alike: both arms
   converged on the same five and the CONTROL arm widened MORE positions than
   the queued one (5 vs 4).

   ⚠️ **INCIDENTAL, AND IT REVISES DESIGN-chessdb.md §3.4.** That section says
   *"`unknown` stays unknown"*, measured over minutes. Over 48 minutes it does
   not: all four CONTROL positions — never written to — went from `unknown` to
   answering `ok` with one scored move. A plain `queryall` read appears to be
   enough to put a position into the graph. That is not licence to poll (it is
   still someone's compute, arrived at by a side door), but it does mean the
   storm's own gather pass ALREADY does everything queueing would do for the
   `thin` class, for free, and this is worth re-measuring before anyone
   proposes queueing again.

   **What to do instead — `minScored` is off by one.** `stormCandidate` reads
   the fifth move as `scored[Math.min(4, scored.length - 1)]`, so `spread5` is
   EXACT at five scored moves; the filter demands six and consumes five. It
   sits exactly one above the ceiling measured here. GRID RE-RUN 2026-08-28,
   same seed and params as §6.1 (`--bid 291847 --n 14 --maxply 16 --seed 7`),
   both thresholds over the SAME candidate set in one run:

   ```
   moves ChessDB scored, per candidate (74 candidates):
     1:3   5:33   6:5  7:5  8:5  9:7  10:2  11:4  13:1  14:3  15:1  18:1  19:2  22:1  27:1

   survivors     minScored=6            minScored=5
     min5= 30      23  23  24  24         42  42  43  43
     min5= 60      11  11  12  12         27  27  28  28     <- shipped bands
     min5=100       7   7   8   8         19  19  20  20
   ```

   **At the shipped bands it is 11 -> 27 survivors, 2.45x, for nothing.** No
   requests, no writes, no third party. Queueing, for comparison, got 1 of 29
   positions over the bar.

   THE DISTRIBUTION IS THE ARGUMENT, not the multiplier. Candidates score 1,
   then FIVE, then a smooth tail from 6 up — **there is no 2, 3 or 4.** Five is
   a quantum ChessDB stops on, 33 of 74 candidates sit exactly on it, and the
   filter is set one above it. That is why "too few moves scored" is now 32 of
   74 rejections (43%), up from 16 of 54: as positions get elaborated — by
   time, and by our own reads — they pile up ON the bar rather than over it.

   Two other things moved in the same run, both consistent with the database
   having grown since §6.1: the `unknown` walk stop fell from 11 to 6, and
   `max plies reached` appeared (3) because walks now run further.

   STILL A HUMAN JUDGEMENT, and §6.3's standing one: the grid says how MANY,
   never how GOOD. A five-move list is enough to compute `spread5` exactly and
   §3.4 makes grading total regardless, so nothing is being approximated — but
   whether a position whose fifth-best move is the last one ChessDB will name
   is a position worth being asked is twenty FENs and a human. NOT CHANGED in
   `CONFIG.storm` pending that look.

   Caveats on the above: n=29, one course, one 48-minute window, and the
   control arm's movement means "queue" and "read, then wait" cannot be fully
   separated for the `thin` class. None of that changes the ceiling, which is
   the load-bearing number and is unambiguous.

   The framing that makes it worth asking at all: §2.4's objection to `queue`
   is *"25-minute turnaround, and bursts of hundreds"*, and a gather pass left
   running overnight defeats the first half of that. §6.2 says the binding
   constraint on yield is ChessDB's elaboration, not chess — so this is the
   one lever that moves the number.

   It splits into TWO questions and only one of them is already answered:

   * **UNKNOWN** (11 of 18 walk stops). §2.4 ground-truthed n=1: queued, and
     ~25 minutes later fully scored. Very likely recoverable.
   * **THIN** — `minScored` rejecting a position ChessDB *does* know because
     `learn=1` returned a short list (§3.3's 36/36 decaying to 6/6). **16 of
     54 rejections, the joint-largest single reason, and completely
     unmeasured.** Whether `queue` WIDENS a thin list or only deepens the
     scores already in it is the difference between a ~20% yield bump and
     close to a doubling.

   The probe collects both kinds under the storm's own stop rules — so the
   sample is the storm's real losses, not a synthetic one — and splits them
   into a QUEUED and a CONTROL arm, alternating within each kind so the arms
   match on depth. **The control arm is not a nicety**: `learn=1` fill-ins are
   computed on the spot and do not persist (DESIGN-chessdb.md §3.2), and the
   book grows from everybody else's traffic anyway, so "I queued it and later
   it was better" is not evidence.

   ⚠️ It is the only file in this repository that writes to a third party. Dry
   run is the default, `--queue` is required to send, each arm is capped at
   10, and the calls are one per 1.1 s. If this ever becomes a feature it
   stays behind an explicit press with its own cap, and `handleChessdbFetch`'s
   allow-list is what keeps it out of every automatic path meanwhile.

   Both bullets this entry originally carried — queue by shallowness, and
   gather → queue → sleep → re-gather — are moot: there is nothing worth
   scheduling. They are left out rather than left in, so nobody builds the
   plumbing for a lever that does not move.
7c. **The twenty FENs, set up so the decision can be taken from this document**
   (2026-08-29). §12.7b ends on "still a human judgement, and it wants twenty
   FENs and a human". `dev/probe-storm.js` now prints exactly those FENs, and
   this section is the run. **`CONFIG.storm.minScored` is UNCHANGED at 6** —
   nothing here is a decision, it is the material for one.

   Same seeds and parameters as §6.1, so the numbers are comparable:

   ```
   node dev/probe-storm.js --bid 291847 --n 14 --maxply 16 --seed 7
   node dev/probe-storm.js --bid 453453 --n 12 --maxply 16 --seed 3
   ```

   **The headline, at the shipped bands (`spreadMinCp` 60, `spreadMaxCp` 300):**

   ```
   course    candidates   minScored 6   minScored 5   in dispute
   291847        71           10            25            15
   453453        73           23            29             6
                                                          --
                                                          21
   ```

   291847 is §12.7b's 2.45x again (2.5x here; the database has moved and the
   absolute counts are 10/25 rather than 11/27). **453453 is not** — 1.26x —
   and that is the first thing this run adds. The multiplier is a property of
   the course, not of the setting, so "2.45x for nothing" is the best case
   rather than the expected one.

   The scored-move distributions say why:

   ```
   291847  1:3  3:1  5:31  6:3  7:5  8:5  9:7 10:2 11:4 13:1 14:3 15:1 ...
   453453  1:6  4:1  5:20  6:7  7:3  8:4  9:4 10:1 11:2 12:1 13:2 14:2 16:3 17:5 ...
   ```

   §12.7b's "there is no 2, 3 or 4" survives with one instance each (a 3 and a
   4 across 144 candidates). **The pile on exactly 5 is still the whole story**
   — 31 of 71 and 20 of 73 — and it is still sitting one below the filter.

   **Where the disputed positions sit is course-shaped, and this is the second
   thing the run adds.** On 291847 the fifteen are markedly DEEPER than the
   ones already admitted (plies past the line: 4, 4, 4, 5, 10, 10, 12, 12, 12,
   12, 14, 14, 14, 16, 16 — median 12, against a survivor sample clustered at
   2-6). On 453453 the six are SHALLOWER than its survivors (2, 2, 4, 4, 6, 12
   against 4-12). So `minScored` 6 is *not* reliably a disguised depth filter,
   which was the tidy explanation to expect from §3.3's thinning scored set. It
   behaves that way on the bought course and the other way on the repertoire.

   **What each answer costs and buys.** Keeping 6 buys one thing: every
   position offered has a scored list with at least one move BELOW the fifth,
   so `spread5` is a cut through a list that has not run out — the "there must
   be something to get wrong" claim is made about a ranking with a floor under
   it. Moving to 5 buys 2.5x the material on a course like 291847 and about a
   quarter more on one like 453453, for no requests, no writes and no third
   party, and it costs that floor: on every one of the 21 positions below, the
   fifth-best move is the last one ChessDB will name, so what lies beneath it
   is unknown rather than bad. Grading is unaffected either way — §3.4 makes it
   total, and a move outside a five-long list falls to tier 2 or tier 3 exactly
   as it does outside a twenty-long one.

   **The twenty-one FENs.** Each entry is: plies past the course's own line,
   the eval from the user's side, `spread2`/`spread5` in centipawns and then in
   points of win probability, the source line and game, and ChessDB's five
   scored moves.

   *291847 — Intermediate Starter Kit (White to prepare in all fifteen):*

   ```
   +14  +1.85  s2  31  s5  63  (wp 2.59 / 5.36)   Scotch 4...Bc5 #2  6NbEYaOE
        r2qr2k/1pp2ppp/2np4/p1n3P1/4P3/PPN1QP2/1PK4P/3R1B1R w - - 3 17
        h4 +1.85   Kb1 +1.54   Bb5 +1.54   Be2 +1.42   Nb5 +1.22
   +12  +0.97  s2  54  s5  97  (wp 4.89 / 8.84)   Scotch 4...Bc5 #2  9AQmidus
        r2qr1k1/1pp2ppp/3pb3/p3n3/3RP1PP/2N2P2/PPP1Q3/2K2B1R w - - 1 16
        g5 +0.97   Qe3 +0.43   Qd1 +0.33   f4 +0.15   Qf2 +0.00
   +14  +1.35  s2  40  s5  76  (wp 3.52 / 6.77)   Scotch 4...Bc5 #2  9AQmidus
        r3r1k1/1pp1qppp/3pb3/p3n1P1/3RP2P/2N2P2/PPP1Q3/2K2B1R w - - 1 17
        f4 +1.35   a3 +0.95   Qg2 +0.89   Qe3 +0.67   Qd1 +0.59
   + 4  +1.74  s2  12  s5 323  (wp 1.01 / 28.87)  Scotch 4...Qh4?!   PvKZjLxd
        r1bk2nr/1ppp1ppp/p1n5/1N2q3/8/2P2B2/P1P2PPP/R1BQ1RK1 w - - 2 11
        Bxc6 +1.74   Nd4 +1.62   Na3 -0.03   Re1 -1.14   Nxc7 -1.49
   +12  +0.00  s2  96  s5 115  (wp 8.75 / 10.43)  Scotch 4...Qh4?!   PvKZjLxd
        r1bk3r/1pp1nppp/p2p1q2/4n3/3N4/B1P2B2/P1P1QPPP/R3R1K1 w - - 2 15
        Be4 +0.00   Rad1 -0.96   Rab1 -1.01   Qd2 -1.01   h3 -1.15
   +14  +0.00  s2  26  s5  82  (wp 2.39 / 7.49)   Scotch 4...Qh4?!   PvKZjLxd
        r1bkr3/1pp1nppp/p2p1q2/4n3/3NB3/B1P5/P1P1QPPP/R3R1K1 w - - 4 16
        Rad1 +0.00   c4 -0.26   Bb2 -0.47   Rab1 -0.53   h3 -0.82
   +16  +1.14  s2 139  s5 170  (wp 12.64 / 15.48) Scotch 4...Qh4?!   PvKZjLxd
        r2kr3/1ppbnppp/p2p1q2/4n3/3NB3/B1P5/P1P1QPPP/3RR1K1 w - - 6 17
        Bxb7 +1.14   c4 -0.25   Rb1 -0.39   g3 -0.48   Bc1 -0.56
   + 5  -0.36  s2 104  s5 343  (wp 9.30 / 26.84)  Mamedov-Salimova Intro  zPgoJ0kl
        2rqr1k1/pb2bppp/1p2pn2/2P5/3P4/PnN2NP1/1B2QPBP/2RR2K1 w - - 1 18
        Rc2 -0.36   Rb1 -1.40   Nb5 -3.21   Qc2 -3.37   Qb5 -3.79
   +10  +0.75  s2  50  s5 166  (wp 4.56 / 15.16)  Scotch 4...Bc5 #7  GbIH0Ell
        r2q1rk1/1p3p2/1b2b2p/p2Q2p1/P7/1P4B1/1P3PPP/2KR1B1R w - - 1 18
        Qe4 +0.75   Qb5 +0.25   Qf3 +0.00   Qxd8 -0.10   Qxb7 -0.91
   +12  +0.00  s2   8  s5 229  (wp 0.74 / 19.91)  Scotch 4...Bc5 #7  GbIH0Ell
        r2r2k1/1p3p2/1b2b2p/p5p1/P7/1P4B1/1P3PPP/2KR1B1R w - - 0 19
        Bc4 +0.00   Rxd8+ -0.08   Be2 -1.02   Bb5 -1.75   h4 -2.29
   + 4  +0.62  s2  62  s5 542  (wp 5.68 / 41.10)  Scotch 4...Bc5 #5  m3spn1A1
        r2qr2k/ppp2p1p/1bnp1p2/3b4/4P1Q1/1N6/PPP2PPP/2KR1B1R w - - 2 14
        exd5 +0.62   Rxd5 +0.00   f4 -4.06   Qh4 -4.40   Nd4 -4.80
   + 4  +1.50  s2  21  s5 127  (wp 1.81 / 11.35)  Scotch 4...Bc5 #5  JqQuOcnq
        r2q2k1/ppp2p1p/1bnp1p2/3Pr2Q/8/1N6/PPP2PPP/2KR1B1R w - - 1 14
        Qg4+ +1.50   Qf3 +1.29   Qh3 +1.27   Qh4 +0.48   Qh6 +0.23
   +10  -0.05  s2  99  s5 198  (wp 9.00 / 17.40)  Scotch 4...Bc5 #8  Mb5v6ewY
        r3r1k1/bpp1qpp1/3pbn1p/p3n3/N3P1PB/1N3P2/PPP4P/1K1RQB1R w - - 3 16
        Be2 -0.05   f4 -1.04   Bg2 -1.22   Nd2 -1.29   Qe2 -2.03
   +12  +0.01  s2  42  s5 225  (wp 3.86 / 19.62)  Scotch 4...Bc5 #8  Mb5v6ewY
        r3r1k1/bpp1qpp1/3pbnnp/p7/N3P1PB/1N3P2/PPP1B2P/1K1RQ2R w - - 5 17
        Bg3 +0.01   Bf2 -0.41   Bxf6 -0.90   g5 -1.72   Nd4 -2.24
   +16  +1.26  s2   2  s5  90  (wp 0.17 / 8.09)   Scotch 4...Bc5 #8  Mb5v6ewY
        r3r1k1/bpp1qpp1/3pb1np/p3n3/N3P1PP/1N3PB1/PPP1B3/1K1RQ2R w - - 1 19
        Nd4 +1.26   h5 +1.24   Nc3 +1.01   Qf1 +0.75   Qd2 +0.36
   ```

   *453453 — Testing course (Black to prepare in all six):*

   ```
   +12  -0.26  s2  12  s5 110  (wp 1.10 / 9.87)   Introduction - Why Godiva  PSF77OhP
        r1b1k2r/ppqpppbp/2n2np1/8/4PP2/1NP1BB2/PP1N2PP/R2QK2R b KQkq - 4 11
        d6 -0.26   O-O -0.38   h5 -0.86   e5 -0.97   e6 -1.36
   + 2  +1.10  s2   8  s5 184  (wp 0.71 / 16.76)  1) 6.Be3 Mainline 8.Qd  3EGDxvPY
        r1b1k1nr/pp1ppp1p/2n3p1/8/8/1NP1B2q/P1PQBP1P/2KR2R1 b kq - 3 12
        d6 +1.10   Nf6 +1.02   h5 -0.33   Qxh2 -0.34   Qe6 -0.74
   + 2  (the SAME position, reached from a second game DcDiB4SH — a session's
        own `st.seen` would offer it once; it is listed twice here only because
        the probe reports per walk)
   + 4  -0.13  s2   5  s5 100  (wp 0.46 / 9.06)   1) 6.Be3 Mainline 8.Qd  B7spQPYu
        r1b1k2r/pp1ppp1p/2n2npB/8/q7/1NP2P2/P1PQ2PP/3RKB1R b Kkq - 2 12
        Nd8 -0.13   Rg8 -0.18   d5 -0.53   Qh4+ -1.11   Ne5 -1.13
   + 6  +1.06  s2  61  s5  72  (wp 5.50 / 6.51)   Quickstarter Odds & Ends  R36g0H6o
        r2q1rk1/1p2ppbp/p1npbnp1/8/3BP3/N1PBN3/PP3PPP/R2Q1RK1 b - - 1 15
        Nxd4 +1.06   Rc8 +0.45   Rb8 +0.39   Bc8 +0.37   b5 +0.34
   + 4  +1.16  s2  41  s5  68  (wp 3.66 / 6.11)   Quickstarter Rossolimo   DrKUYYHx
        r1b2rk1/1pq2ppp/p2bpn2/2p1N3/3P1B2/2P3N1/PP3PPP/R2Q1RK1 b - - 2 13
        Nd5 +1.16   cxd4 +0.75   c4 +0.63   b5 +0.60   a5 +0.48
   ```

   Reading them without a board, two patterns stand out and both argue the same
   way. Several have an enormous `spread5` (323, 343, 542) — the fifth-best
   move is a plain error and the choice is unambiguously real. The rest sit at
   63-230, which is the band the shipped setting was chosen for. **Not one of
   the 21 is a position where the five scored moves are indistinguishable**;
   that failure shape is caught by `spreadMinCp`, which runs before `minScored`
   has anything to say. The question left for a human is narrower than §12.7b
   implied: not "are these good positions" but "is a five-move ranking enough
   to be asked to beat".
7d. **§16.5, answered off the same run: `spreadMinCp` in win probability.**
   The grade moved to win-probability lost in v0.141.0 and the pick rules
   stayed in centipawns, so the open question was whether "there must be
   something to get wrong" is a weaker demand on a one-sided position than on a
   level one. **It is, and the effect is real but small.**

   ```
   spreadMinCp 60  =  5.50 wp at 0.00
                   =  4.64 wp at +2.00   - 16% less demanded at the band top
   ```

   The two spreads over every candidate, in both units:

   ```
                     p10    p25   median   p75    p90
   291847  s5 cp      19     46      86    198    487
           s5 wp    1.74   3.96    7.52  17.40  35.37
   453453  s5 cp      16     31      68    112    253
           s5 wp    1.47   2.85    6.11   9.87  19.26
   ```

   And the yield, restating the rule in wp at the equivalent-at-equality
   thresholds (30cp = 2.76 wp, 60cp = 5.50 wp, 100cp = 9.10 wp), same
   candidates, `spreadMaxCp` 300:

   ```
                   minScored 6            minScored 5
                  cp     wp              cp     wp
   291847  30     22     22              40     38
           60     10     10              25     24
          100      6      5              16     15
   453453  30     31     31              44     44
           60     23     23              29     29
          100     12     12              16     15
   ```

   **At the shipped threshold the two rules are identical on both courses** (10
   and 10, 23 and 23), and the largest divergence anywhere in the grid is two
   positions out of 71. So the objection is sound — the cp rule really does ask
   less at +2.00 — and the yield consequence at the settings in use is nil.
   Restating `spreadMinCp` in wp is therefore a change worth making for saying
   what is meant, not for what it does, and it should not be bundled with a
   `minScored` change whose effect is an order of magnitude larger.
   `blunderCp` and `decidedCp` stay in centipawns for §16.5's own reason: they
   are about whether the game is still a game, not about what a move is worth.

   Caveats on both entries: one run each, two courses, and the candidate sets
   are the same walks §6.1 measured — so this says nothing about a course
   shaped unlike either of these. Neither entry changed a single line of the
   extension.
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

`--dump-fens <path>` writes the run's SURVIVORS to JSON, which is the input to
`dev/probe-cdb-quality.js` (§12.3b) — the one probe here that needs an engine as
well as the two APIs. It drives the vendored WASM Stockfish from node, and three
things about doing that are in its header rather than here: `locateFile` must
answer by extension (it is asked for `stockfish.worker.js` too), output arrives
on `listener` and not on `print`, and **the glue does a bare `fetch = null`** on
node, so any HTTP client used after the engine boots must have been captured
before it.

```bash
node dev/probe-storm.js --bid 453453 --n 16 --seed 7 --dump-fens dev/tmp-storm-fens.json
node dev/probe-cdb-quality.js --n 22 --depth 24 --capms 120000 --moves 10 --build full
```

### 13.1 The anchor probes (§23.1, 2026-08-30)

Three more, all offline once the FENs are dumped. `dev/merge-fens.js` folds
several survivor dumps into one deduped set — the walk is deterministic
(§14.16), so a fresh seed on the same course adds only about half as many new
positions as it returns.

```bash
node dev/merge-fens.js dev/tmp-qfens-all.json dev/tmp-storm-fens*.json dev/tmp-qfens-*.json
node dev/probe-cdb-quality.js --fens dev/tmp-qfens-all.json --n 50     --depth 24 --capms 120000 --moves 10 --threads 6 --build full     --dump dev/tmp-anchor-pass1.json
node dev/anchor-report.js dev/tmp-anchor-pass1.json [more.json ...]
node dev/probe-anchor-depth.js dev/tmp-anchor-pass1.json --min 25 --depth 30     --capms 240000 --threads 6 --build full
```

`--dump` is what makes the follow-up questions free: every per-move row and
per-position anchor figure is written out, so `anchor-report.js` and any new
question can be re-asked without another engine run. `probe-anchor-depth.js` is
the one that separates "ChessDB is wrong" from "the reference is shallow", and
it is affordable only because it is restricted to the two or three moves the
anchor question is about.

And the cost curve behind §23.2, which is a timing measurement and so runs on
`CONFIG.engine`'s DESKTOP profile rather than on the machine's core count:

```bash
node dev/probe-gather-cost.js --fens dev/tmp-qfens-all.json --n 8     --cells 8x20,8x24,16x20,0x18,0x20 --single 20,24 --threads 4 --capms 180000
```

`0` as a MultiPV means every legal move. Note that a wide search's answer is ONE
iteration and not the union of several (§23.5) — the probe hit that bug in its
own smoke test and reported "MultiPV 8, 12 moves, reached depth 1".

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

**And every position is kept** — every one answered, and (since v0.138.0,
§14.10c) the one the storm ended ON, which is the position most in mind and was
the only one the review could not show. A timed exercise is one you cannot think
during, so the thinking has to be available after it: the clock running out
raises a review — the position, the move you found, the move there was, and the
loss — walked with the arrows or by clicking, with section 19's analysis board
one press away on any of them, and (§14.10b) the position itself playable again.

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

#### 14.10a The best move waits to be asked for (v0.132.0)

The review opened with the answer already on it — the green arrow drawn, the best
move named in the legend, and the best move of **every** position sitting in the
list's third column. So the one part of this feature with no clock on it handed
its answer over before the user had looked at the position, which is the opposite
of what a review is for: four seconds was all the card allowed, and the thinking
was supposed to happen here.

So the best move is **hidden until a `Best move` button is pressed** (or `b`),
and that is the whole change. Four notes:

* **The flag is on the ITEM, not on the module** (`item.shown`), so it is per
  position: stepping away and back keeps the answer where it was left, and a
  position arrived at for the first time is always hidden. A mixed list — some
  revealed, most not — is therefore the ordinary state, which is what
  `dev/harness.html` now draws.
* **Three surfaces hide it and all three have to agree**, or the one that does
  not is the only one anybody reads: the board's green arrow, the
  `stormBestLine` half of the legend, and the list's own best column. The list is
  the one that would otherwise spoil the *whole* review rather than one card.
* **The user's own move is never hidden** — not the red arrow, not the verdict
  line. It is theirs, they have already seen it, and "#4 of 31 · 42cp behind" is
  precisely what makes the position worth thinking about; a review that hid
  whether the move was even wrong would be a list of positions with no question
  in it. The one thing that leaks is agreement: play the top move and the verdict
  line says so, so there is nothing left to hide.
* **Neutral, and first in the row.** Hiding an answer is only worth doing if
  asking for it is one press away, and `.clo-st-analyse`'s neutral outline is the
  right tier — a filled button labelled "Best move" is an invitation to press it
  before looking at the board. It toggles back ("Hide best move"), which costs
  nothing and makes the reveal recoverable. `b` rather than space or Enter: both
  of those are how a focused button in this window is pressed, and the review's
  rows are buttons.

Measured in the harness at a 420 px card: the action row goes from one line of
three buttons to two lines of four (29 px to 64 px), which the review's list —
`flex: 1` over a scroll container — absorbs. The masked cell is `'…'` and not
`'?'`, which that column already means ("the position could not be scored"); the
faint/dim colour difference is #8a8a8a against #949494, i.e. a nudge, so the
glyph is the signal.

#### 14.10b Playing the position again (v0.138.0)

A review that can only be READ is half of what the review is for. Four seconds
was all the card allowed; the point of the list afterwards is that the thinking
finally has somewhere to go — and until now the only thing that could be *done*
with a position was to reveal its answer, which ends the thinking rather than
housing it.

So **"Try again" puts the position back on section 18's storm board** — the same
board, the same `cr.mode = 'storm'`, the same single ply, the same three grading
tiers — and lands the answer nowhere near the session.

* **Nothing is scored and nothing is recorded.** No points, no streak, no clock
  (it stopped when the session ended), no `storeNote`, and no second
  `st.history` entry. The history is the record of the TIMED session, and a move
  found at leisure afterwards is not one of its answers — which is also why the
  row's own verdict, the move actually played under the clock, is left exactly
  as it was. The panel says `· nothing is scored` under the prompt rather than
  leaving the user to infer it from a clock they cannot see.
* **ONE definition of what a move is worth.** `grade` split into `runGrade`
  (watchdog, fail-open, verdict shape) and `gradeTiers` (§3.4's three sources),
  with the two callers differing only in `alive()` and `finish()`. A second copy
  of the tiers is a second place for them to fall out of step, which is the one
  way this feature could come to grade two identical moves differently — and it
  would do it silently, since both answers are plausible numbers.
* **The attempt is numbered** (`st.retrySeq`). A retry is meant to be repeated —
  "Try another move" puts the position back — and a grade still in flight from
  the previous attempt would otherwise print its verdict over the position that
  has just been reset. Same job as the alt check's `reqId` prefix, for the same
  reason: the answer carries no identity of its own.
* **The board is shut behind a verdict, exactly as a card's is.** The move
  played is still ON the board, so a second try has to be a fresh card rather
  than a second move on the same one; `continuationStormApi.next(card)` is what
  does it, and it is already the timed loop's own "here is the next one".
* **Exclusive with `analysing`, and each closes the other.** Both want the
  stage's slots and section 18 runs one board at a time; pressing the second is
  an unambiguous request for it, so refusing would be pedantry. Stepping to
  another review row closes both, since each describes the position being left.
* **No database beside it.** `panelSlot()` stays gated on `st.analysing`, so the
  Lichess panel does not follow a retry board — the database's top move would
  name the answer, which is section 20's rule for the drill and the card's own.
* **Neutral, and first in the row.** The three neutral buttons all act on THIS
  position and the green pair at the end acts on the session; within the three,
  trying again is what happens *before* the answer is revealed. `t`, for the
  reason `b` is `b` (§14.10a): space and Enter are how a focused button in this
  window is pressed, and the review's rows are buttons.

Measured in the harness, review card at a 420 px panel: the action row is
**unchanged at 64 px / two lines** — the fifth button fits the space the fourth
left. It costs a third line (99 px) only at a 340 px panel, which the list's
`flex: 1` absorbs, and there is no horizontal overflow at 880 / 700 / 600 / 420 /
340 px, desktop or `html.clo-touch`.

#### 14.10c The position the clock stopped you on (v0.138.0)

`st.history` is filled by `finishAnswer`, which an unanswered card never
reaches — so the one position guaranteed to be in mind when the storm ends was
the one position the review could not show, and its best move was simply gone.
The review then opened on the *second* most interesting position of the session.

So **`endSession` keeps whatever card is on the board**, before anything else it
does clears it:

* **Every route out**, not only the clock. "I stopped on a position I could not
  solve" is the same wish as "the clock stopped me on one", so End storm and the
  board being closed keep it too. The one exclusion is a card that never reached
  a board — `nextCard` nulls `st.card` on its board-refused path, so the review
  cannot show a position the user has not seen.
* **A verdict shape of its own**, `{ verdict: 'unanswered', unanswered: true }`,
  and `stormVerdictLine` needs an arm for it ABOVE `passed`. Without one it falls
  through to the ordinary branch and prints **"your move"** — a sentence claiming
  an answer that was never given. `dev/check-storm.js` pins both wordings; the
  control (arm removed) fails on exactly those two assertions.
* **Nothing is scored, and deliberately no `storeNote`**: the position keeps its
  place in the store exactly as if it had never been drawn, which is right — it
  taught nothing either way, the same reading §14.11's retention rule already
  gives an ungradeable answer.
* **A card abandoned MID-GRADE names its move.** The clock can no longer expire
  there (§8.2), but Exit and a closed board still can, and `st.lastPlayed` costs
  a two-field object to keep the review honest about it. `endSession` reads it
  before dropping `st.grading`, which is why the push is the first thing in that
  function.
* Its row wears the same neutral edge `unknown` does — both mean "nothing was
  decided here" — and what tells them apart is the move column, which reads "—".

Everything else follows for free: `revMoves` finds the card's own `bestSan`, so
`Best move` works on it, and §14.10b's `Try again` is the obvious thing to do
with a position you ran out of time on.

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

### 14.13 The pre-roll is a decision, not a wait (v0.135.0)

Two things reported from a phone on 2026-08-28, one of which turned out to be a
bug and the other of which was the feature working exactly as designed and being
wrong anyway.

**The bug: a pull that landed in a session it could not feed.** §14.12's
exchange is fired from `startSession` and deliberately not awaited — the store's
whole promise is that a session opens without waiting for a network. But
`st.storeQueue = storeDraw()` runs on the line after it, so by the time nine
positions arrive from the other device the store has ALREADY been drawn from,
and nothing draws it again. The panel said *"9 taken from another device"* and
then walked frontiers at ~11 ChessDB requests a position for the better part of
a minute, with nine graded positions sitting in `storage.local`.

The fix is three lines in `syncStore` and the only thing worth recording about
it is why re-drawing the WHOLE store is safe: every key already queued is in
`st.seen`, which is what `produceFromStore` filters on, so a re-draw cannot
offer a position twice. There is no incremental bookkeeping to get wrong.

The same hole existed after a **gather** pass. Gathering owns the pool and
clears the queue (`gather()`'s pre-roll arm), and nothing refilled it when the
pass ended — so the session it interrupted was left with an empty queue and no
producer running. Invisible before, because there was nothing on screen whose
state depended on it; with a Start button it is a button that never lights up.
Same three lines, in `gather`'s `finally`.

**The design error: the storm started itself.** The first card opened the
moment the producer had one, and opening the first card starts the clock. So
the pre-roll — the seconds in which a user decides whether to play or to spend
the sitting filling the store instead — was a race against the producer, and
`gather()` had to carry a whole arm (`if (st.endsAt && !st.over) endSession(…)`)
for the case where it lost. `nextCard` had a matching one (`if (st.gathering)
return;`). Two guards, in two functions, patching one missing state.

So there is now a **Start** button and `st.started`, and the gate is a single
`if (!st.started) { render(); return; }` at the top of `nextCard`. That is
deliberately the ONLY gate: `produce`'s `finally`, the store path in
`startSession` and the sync refill above all reach the first card through that
one function, so barring it once bars every route. The `render()` inside the
early return is what enables the button as the queue fills — the button's own
enabled state is `st.queue.length > 0` and nothing else.

* **It is a FILL, and the only one in this window.** The row palette's "the one
  thing to do next" (DESIGN-ui-inventory §3). Gather keeps its green outline
  precisely because the two are now a real choice and only one of them is the
  storm.
* **Disabled it stays a fill** rather than degrading to an outline. What changes
  while the producer works is whether it can be pressed, not what it is; a
  control that changes shape as it becomes available reads as two buttons.
* **It is hidden once spent** (`st.started || st.over || st.gathering`). During
  a session it would have nothing to do, and after one the summary's own "Storm
  again" is the way back.
* **The two old guards stay.** They are not made redundant by this — a gather
  pressed mid-session still has to end it, and `nextCard` still must show
  nothing while one runs. What the Start button removes is the case where the
  user never got to make the choice at all.

Everything before the press is untimed, however long it takes: the clock is
started by `nextCard` on the card it shows, and nothing else touches `st.endsAt`.

### 14.14 Paused lines are not stormed (v0.136.0)

A line the user has **paused** is one they have told Chessable not to prompt
them about. Asking what they would play the move *after* it is the same
question one ply later, so the frontier walk skips it.

**The field is `paused`, on a `getList` row, and it is not called what the app
calls it.** Read out of the public bundle on 2026-08-28 (`main.765ca592.234.js`,
no login needed — the same route `importSubvariationFromSource` and `importGame`
were found by):

* the variation card's own test is **`var a = 1 == e.paused`**, where `e` is the
  getList row — so the wire field is `paused`, an integer, compared loosely
  against 1. `reduceCourse` reads `Number(v.paused) === 1`, which agrees with it
  on `1`, `"1"` and `true` and disagrees on nothing Chessable itself accepts;
* the redux store **renames it `isPaused`**, and `isCPaused` is a third name —
  optimistic local state after the toggle. Grepping for either would have found
  the UI's name and missed the wire's;
* **one flag, two words.** The tooltip reads *"PAUSED (you will not be prompted
  to review this)"* when `isPausable`, and *"SKIPPED (you marked this as known
  or as a line to skip)"* when not. Both are the user asking not to be asked, so
  no second condition is needed;
* the `list` object also carries **`allVariationsPaused`** and
  `allChaptersPaused` beside the `isKeyMode` §25d already reads. `reduceCourse`
  carries the first as `allPaused` and section 27 uses it **only to word a
  refusal**. Its relationship to the per-variation flag was NOT established, and
  a course-level flag that can HIDE lines must not be guessed at. If it is ever
  measured, that is the moment to make it a filter.

Not established, deliberately: `isPausable` (which of the two words a line gets),
whether a paused CHAPTER sets the flag on its variations, and the endpoint the
toggle posts to — none of them change what this filter does.

**Where the filter is.** One line in `stormFrontiers`, above the walk, and it
therefore covers **both** producers: a session's pool and the gather pass draw
from the same function, so nothing paused can enter the store either. The count
rides back on the returned array as `frontiers.paused` rather than changing the
return type — every caller wants the pool, and exactly one wants this number.

**Why the count exists at all.** Every other reason a course yields no frontiers
is a property of the course and nothing the user can act on ("every line starts
from a custom position"). A paused line is a decision they made and can unmake,
and telling them their course is unsuitable instead would be a false answer to a
question they could have fixed in one click.

**The one thing it does not reach: the store.** `produceFromStore` runs *before*
the course is read — that is §14.11's whole point, and what makes the first card
arrive in ~3 s — so positions gathered from a line that has been paused *since*
still come up. Bounded rather than fixed: nothing paused is ever added, and the
retention rule (`stormRetain`) drops a position once it is answered well. Fixing
it properly means storing the frontier's own `cacheKey` on each entry (`r`,
alongside `n`) and filtering the queue once the pool lands — additive on the
wire, so no `wireVersion` bump, since an entry without it is simply unfiltered.
Deliberately not built yet: it is a store- and wire-shape change for a case that
decays on its own.

**Cost elsewhere:** `CONFIG.coverage.cacheKey` bumped a fourth time
(`cloCourseListCache3` → `…4`), shared with sections 21, 24 and 25. A listing
written by an older build parses fine and is silently missing `paused`, which
reads as "nothing here is paused" — the same failure §25d's bump avoided, and a
new key rather than a version check so old entries age out. **Only section 27
reads the field**; whether the coverage report and the course tree should also
honour it is a separate question with a different answer in each case.

### 14.15 Misses go to the BACK of the queue (v0.137.0)

Two halves of one question, and the first was already right.

**A position answered well leaves the store.** `storeDropOn: ['good','decent']`
— `stormRetain` deletes it and `storeNote` leaves a tombstone so §14.12's union
merge cannot resurrect it from the other device. A **miss** stays and its `k`
is incremented; an **ungradeable** answer stays too, because nothing was learned
either way and dropping it would spend eleven requests to meet the same silence
twice.

**What changes is the order they come back in.** `stormStoreDraw` sorted
`k` DESCENDING — hardest first — on the note "a position missed twice before is
the one most worth asking again". That is the SRS argument, and this store is
not an SRS queue. Two consequences it had:

* **the head of the queue was a fixed set of failures.** Because the retention
  rule already drops anything answered well, every entry with `k > 0` is by
  construction a position the user has been shown and got wrong. Hardest-first
  therefore opened *every* session with the same handful, in the same order, for
  as long as they kept failing — and a three-minute session is perhaps twenty
  cards;
* **and it starved the fresh ones.** A gather pass stores hundreds of positions
  at ~11 ChessDB requests each. With the misses in front, the material those
  requests were spent on could go a long time unseen.

So the comparator is `(a.k - b.k) || (a.r - b.r)`: **unseen first, then misses,
most-missed last**, shuffled within a tier so two sessions running are not
identical. A miss is not lost, it is queued behind the new material — which also
makes the tail of a long session the harder half, which is the right shape for a
timed exercise.

An entry with **no `k` at all** (v0.130.0 wrote one, and the wire's
`stormWireUnpack` defaults it) sorts as never-missed rather than as infinitely
hard — `k || 0`, already there, but now it decides the opposite end of the
queue, so it is asserted.

**`storeDraw` became pure** (`stormStoreDraw(store, rnd)`, `stormDrawFrontier`'s
shape and for its reason) so `dev/check-storm.js` can execute the comparator.
That is not ceremony: **a reversed sort is completely silent.** It returns every
position, in a sequence that still looks deliberate, and the only way to notice
from the outside is to remember which positions a previous session asked. The
control — the v0.130.0 comparator restored — fails on exactly the five
assertions that cover the order and on no others (2026-08-28).

**The wire's truncation order is NOT the same question and is deliberately left
alone.** `stormWirePack` still sorts `k` descending before it fills the byte
budget, because there the question is which positions are worth *carrying*: a
failure count records something the other device learned and cannot be
regenerated, while one fresh position is interchangeable with any other. Do not
"align" the two — they are asking different things of the same field.

### 14.16 A position answered well does not come back (v0.142.0)

Reported live: *the same positions keep turning up in session after session,
including ones I have already got right.*

§14.15 says the retention rule already handles this — "a position answered well
**leaves the store**". It does. **Leaving the store is not the same thing as not
coming back**, and that gap is the whole of this bug.

#### 14.16.1 Why it came back — the producer is deterministic

A session's cards come from two places, and the store is only one of them.
When the store cannot fill the queue, `produce` walks frontiers, and that walk
has **no randomness in it at all** past the frontier draw:

* `stormDrawFrontier` is random-weighted, but it draws from the *whole* pool
  and a gather pass drains it — so over a course, every frontier is walked;
* `askGames` returns the explorer's four **top** games (rating order, stable
  for months) followed by four recent ones, and `harvestFrontier` took
  `games.slice(0, gamesPerFrontier)` — **always the same two**;
* `stormWalkGame` is a pure function of the frontier, the game and ChessDB's
  answers. Same inputs, same positions;
* `stormCandidate` and the pick rules are likewise pure.

So the question *"is it low-likelihood that a completed position is found again
by the next gather?"* has the opposite answer to the one it invites: **it is
close to certain**. The same frontier plus the same two games reproduces the
same candidate list exactly. `storeAdd` refused a position the store already
held — which is precisely the check that stops working the moment the retention
rule removes it.

Worse, nothing downstream noticed: `st.seen` is per SESSION, so it deduplicates
within a run and says nothing about the last one.

#### 14.16.2 The guarantee: the tombstone list is the DONE list

The record needed already existed. `storeNote` writes a **tombstone**
(`st.gone[ck] = Date.now()`) for every position the retention rule drops, and it
does so whether or not syncing is on. Until now that list was read in exactly
one place — §14.12's union merge, to stop the other device resurrecting the
position. It is the same fact, and it answers the same question, so it is now
asked wherever a position can enter a session:

* **`storeAdd`** — the one write into the store, so the rule's home;
* **`harvestCandidates`** — the offer, which is a different question from the
  write and is the one place a fresh walk can put a retired position on a board;
* **`produceFromStore`** — defensively, for a store written before this change
  or merged from a device that had not yet heard about the answer. It **deletes**
  rather than skips: the slot is worth more to a position nobody has answered.

`stormDone(gone, ck, C, now)` is the predicate, pure so `dev/check-storm.js` can
execute it — and it must be, because the failing case needs a position answered
*well* in one session and the same frontier drawn in the *next*, which is close
to unreachable from a live sitting.

**It ages the tombstone itself** rather than trusting the list to have been
pruned: `loadSyncMeta` reads back whatever storage holds and only `saveSyncMeta`
prunes, so a session that never wrote would otherwise retire positions against a
list with no bound on its age.

**A retirement, not a deletion.** `goneDays` (60) stops being pure housekeeping
and becomes the horizon: long enough that the position is a genuinely fresh
question when it returns, short enough that a frontier's material is not spent
for ever. A zero timestamp reads as *no record*, not as "retired at the epoch" —
the truthiness trap DESIGN-key-moves.md §9.2 is about, which here would retire a
position permanently instead of never.

#### 14.16.3 The tombstone had to start surviving the tab

`saveSyncMeta` was called from **`syncStore` and nowhere else**. On a device
with no carrier course — or simply one whose pull was not due — every tombstone
died with the page. That was survivable while the list only fed a merge that
would not happen anyway; it is not survivable now that the list is what retires
a position. It is written at `endSession`, beside `saveStore`, on the same
argument and at the same moment.

It also gained a **local cap**, `goneMaxLocal` (6000, oldest out). The wire's
`goneMax` is 400 and is a *payload* bound; as a retirement horizon it would
cover barely twenty sessions of answers, which is exactly the span the guarantee
has to outlive. 6000 tombstones is ~270 KB, against a 10 MB quota shared with
every other feature here — and what the cap drops is the oldest retirement,
which is the one nearest to being worth asking again anyway.

#### 14.16.4 The random factor, and what it is not

The second half of the request, and it is worth being exact about which problem
it solves. **It is not the guarantee** — `stormPickGames(games, n, rnd)` can
only make a repeat less likely, and "less likely" is not an answer to "this
should not come back". `stormDone` is the answer.

What it buys is **depth**. With the first two games walked for ever, a frontier
had one fixed set of candidates; once those were retired the frontier was spent,
and a second gather over the course reported *"nothing new to store"* — which
read as the course being exhausted when in truth nothing had asked it anything
else. Eight games taken two at a time is 28 pairs, so the same pool goes on
yielding material well past the first pass.

A partial Fisher-Yates over a **copy** (the caller's array is untouched, and no
game is walked twice in one pass), rnd-injected in `stormDrawFrontier`'s shape
and for its reason. It clamps the index rather than trusting `rnd()` to be in
`[0,1)`: an out-of-range pick would put `undefined` into the walk, which fails
three steps later inside `askPgn` with a message about the explorer.

**Cost**: a frontier whose material is now entirely retired still spends its
~11 ChessDB lookups discovering that. That is bounded (`storeAdd` refuses, so
nothing is stored and the gather says so) and it is the price of the walk being
stateless; the random pick is what makes it rare, since a different pair of
games usually reaches somewhere new.

#### 14.16.5 What was NOT done

* **The store is not consulted before a frontier is walked.** Skipping a
  frontier whose candidates are all retired would need the candidate list before
  the walk, which is the walk. Measured cost is one wasted frontier's requests,
  occasionally.
* ~~**`sampleFrontiers: 30` is still dead config**~~ — **DELETED in v0.147.0.**
  It had been unread since the pool became the whole frontier list, and was left
  in place at the time only because it was a behavioural change's neighbour. A
  number that looks like a dial and is not is the kind of thing that gets tuned;
  the whole point of `CONFIG.storm`'s opening comment is that every number in it
  was measured, and one that changes nothing makes that claim false.
* **No per-position "asked N times" counter beyond `k`.** `k` counts failures,
  which is what the draw order needs; how often a position has been *seen* is a
  different question and nothing asks it yet.

### 14.17 What a pass actually did (v0.143.0)

Reported live, one exchange after §14.16: *"Stored 2 new position(s) — 41 ready
on this course"*, and the expectation behind it was roughly one new position per
viable line. Answering *"is that working?"* took a source read, which is the
defect.

**The number reported was the one least able to answer the question.** `st.gathered`
counts positions **newly stored**, and three completely different passes produce
the same "2":

* a course whose store is already full — the pass worked perfectly and had
  nothing to add;
* a course ChessDB barely knows — 27 of 54 rejections and 11 of 18 walk stops
  were the database running out (§6.2), and none of that was visible;
* a pass that genuinely had almost nothing to walk — every line paused, or the
  stage-0 eval band dropping them.

#### 14.17.1 The funnel

Every branch that discards something now counts it. `stormFunnelBlank()` holds
frontier-level counters (`frontiers`, `unscored`, `offBand`, `noGames`, `games`,
`gamesFailed`), candidate-level ones (`examined`, `rejected`, `retired`, `dup`,
`stored`) and two reason tables — `why` (first failing pick rule) and `stops`
(where each walk ended), which are the two tables `dev/probe-storm.js` prints
and which nothing inside the extension had.

**The four candidate outcomes are exhaustive**: `examined === rejected + retired
+ dup + stored`. That conservation is the property `dev/check-storm.js` asserts,
and it is why that file now executes two *impure* functions (`harvestCandidates`
and `storeAdd`, with `st` and `C` injected through `__setEnv`) — the invariant
lives in that function's control flow and nowhere else. The way it drifts is a
fifth `continue` added there and counted nowhere, after which the totals stop
adding up while every individual number still looks entirely plausible. The
control — exactly that omission — fails on 3 assertions, one of them the sum
(2026-08-28).

`stormFunnelBump` and `stormFunnelWhy` are **null-safe**, because the producer
runs with no funnel at all: a session's `harvestFrontier` calls go through the
same code and count nothing. Without that, every call site needs a guard.

#### 14.17.2 Where it is reported

* **While running** — `setGatherNote` gained the examined count: *"2 stored of
  210 examined"*. "0 stored" over a growing examined count is a pass working on
  a full store; "0 stored, 0 examined" is a pass finding nothing, and those two
  used to read identically.
* **At the end** — the status line keeps the store as its headline (that is what
  a session draws on) and adds two sentences: what was walked, and where the
  positions went. Measured in `dev/harness.html` at 13px: **1851x19 (one line)**
  at the panel's real full-window width of 1873px, 858x34 at the harness's 880,
  538x49 at 560, and 358x79 at 380 — with `html.clo-touch` at 15px, 1851x21 /
  858x55 / 538x72 / 358x106. No horizontal overflow at any width and no vertical
  overflow of the body. The worst case, a phone in portrait, is five lines of a
  status that is only ever on screen with the stage empty and no clock running.
* **The reason tables go to the console**, not the status line — a dozen lines,
  sorted biggest first, so the binding constraint is the first one read. The
  status line has to fit; this is what you look at when it says something
  surprising.

#### 14.17.3 …and a gather now walks more games

`gamesPerFrontier: 2` was one number doing two jobs. A **session** spends the
user's own waiting time — ~11 ChessDB lookups per usable position, while a card
is wanted — so it takes the cheapest sample that works. A **gather** is the burst
nobody is waiting for, with `gatherMaxCdb` an order of magnitude larger, and its
whole job is to leave the store deep enough that sessions never walk anything.

So `gatherGamesPerFrontier: 4`, chosen in `harvestFrontier` off `st.gathering`.
**Four of the eight** the explorer returns (4 top + 4 recent), deliberately not
all of them: taking half leaves genuinely different draws for the next pass,
which is what §14.16's `stormPickGames` is for. On the masters fallback there
are only 4 to begin with, so a gather takes them all — correct, since that path
has no deeper pool to save.

**Cost**: §6.1's 14-frontier run spent 137 ChessDB requests at two games, ~9.8
per frontier, so ~20 at four. A 50-frontier course is ~1000 against
`gatherMaxCdb`'s 4000, and `gatherTarget` (200 positions) is what actually stops
a large course first. Nothing needed raising, which is the check worth recording
— the reason to leave a budget alone is that it was measured, not that nothing
complained.

#### 14.17.4 What was NOT done

* **No per-frontier detail in the UI.** Which *lines* were unscored or off-band
  is a per-line question and would be a table; the console already names each
  one as it is skipped (`storm: skipping <line> — frontier eval …`).
* **The funnel is not kept.** It belongs to the pass, is reported at its end and
  is nulled there — a record of gathering over time is a different feature, and
  §15's is the record that was worth building.
* **The producer does not report one.** A session's walks count nothing: the
  user is looking at a card, and the one thing they might want to know — that
  the store is empty and it is walking — the note already says.

### 14.18 A line that ends where another one carries on (v0.144.0)

Reported by the author: *some variations exist only to show a transposition and
end early, at a position other variations continue from.* Storm one of those and
the walk carries it forward with somebody's real game — which is free to leave
the repertoire at the very first move the repertoire had an answer for. The user
is then asked to improvise in a position their own course covers, having been
shown a continuation it never plays. It is the one failure of stage 0 that
produces a card looking exactly like a good one.

#### 14.18.1 It is common, and it is two different shapes

Measured over the account's three courses (`dev/tmp-courses.json`, 2026-08-28):

| course | frontiers before | line ends that sit inside another line |
|---|---|---|
| 291847 Intermediate Starter Kit | 33 | **8** |
| 453453 Testing course | 72 | **8** |
| 455941 Testing Repertoire | 6 | **1** |

A quarter of the first course's frontiers, and every one of those eight is the
same publisher idiom: an `… - Introduction` card ending on the position where
both the `… - Improving Our Position` card (whose custom start FEN *is* that
position) and the full annotated game pick the play up. 453453's eight are the
plain repertoire shape — `Sicilian: 2...Nc6 3.d4` stopping on 6...Bg7 while
three other cards play 7.Be3 there.

#### 14.18.2 The rule

`stormFrontiers` now builds a second index as it walks: `cont`, the positions
each side's lines play a move **from** — every position of every line except the
one it ends on. A frontier whose own `cacheKey` is in `cont[side]` is dropped and
counted (`out.covered`, reported the way `out.paused` is, §14.14).

Three decisions, and the two asymmetries are the interesting ones:

* **Scoped to the frontier's own side.** A Black line playing a move in that
  position says nothing about whether the WHITE repertoire continues there — it
  is the same board met from the other end. On these courses side-scoping,
  colour-agnostic and source-only all answer identically (8/8/1 each), so this
  costs nothing measurable and is chosen for being the statement that is true.
* **A custom-FEN line cannot be a SOURCE but can be a CONTINUER**, and a
  **paused** one can too. The exclusions above answer "is this line a usable
  frontier"; this index answers "does this course say anything else here", which
  is a different question. The user paused a line; they did not say their
  repertoire stops there. (On 291847 the eight stubs are caught either way — the
  full game continues past them as well as the puzzle card — so this is
  reasoning, not a measurement.)
* **One walk, two uses.** `walkVariation` moved above every source test, so the
  second use can see the lines the first is not allowed to take. Cost of walking
  the lines that used to be skipped early, measured over three runs each: 291847
  3.59 s → 4.31 s, 453453 4.67 s → 4.84 s, 455941 0.21 s → 0.22 s. The +20% on
  the first is its 83- and 128-ply model games; it is behind the existing
  `chunkVars` yield, so it is not a frozen tab either way.

#### 14.18.3 What it does NOT do

* ~~**It does not stop a WALK re-entering the repertoire.**~~ **Built in
  v0.145.0 — §14.18.4.** The estimate here ("a much larger question: every
  position of the course against every step of every walk") was wrong by the
  cost of one property lookup: the index that answers it is the one §14.18.2
  already builds and then throws away.
* **It does not look at the store.** §14.11's positions were harvested by an
  earlier build and are not re-filtered — the retention rule and §14.16's
  tombstones age them out. A device gathering afresh never adds another.

#### 14.18.4 …and now the walk too (v0.145.0)

`stormFrontiers` builds `cont` and drops it on return. Carrying it out
(`out.cont`, beside `out.paused` and `out.covered`) makes the second half of the
rule a set lookup per ply, and `stormReentered` is that lookup:

```js
function stormReentered(covered, pos, fen, userSide) {
  if (!covered || !pos || pos.side !== userSide) return false;
  return covered.has(cacheKey(fen));
}
```

Four things about it are decisions rather than mechanics.

**It is a STOP, not a candidate rejection, and the walk stops AT the position.**
Everything past a position the course answers is past the point where the user
was on their own — the game may have played the course's own move there, or
something the course was equally ready for, and either way the line has stopped
being "what happens after your book runs out". So the position itself is not
offered and neither is anything beyond it.

**The test is scoped to the USER's own move, and that is the whole precision of
it.** `cont[side]` holds `before` for every ply of that side's lines, the
opponent's included — a White repertoire's index contains Black-to-move
positions, because a White line records what it expects Black to play. An
opponent-to-move position in the index therefore means only that the course has
a reply *prepared for what the opponent is about to play*. If the opponent plays
something else, the position the user then faces is genuinely unprepared, and is
exactly what this feature exists to ask about. Stopping there would throw away
the good half of the rule. A position with the USER to move that appears in the
index is a different thing entirely: their own course plays a move from it, so
there is nothing to improvise.

Nothing had to change in how `cont` is built for this: a user-to-move position
in `cont[side]` is by construction one that a ply of that side's own colour was
played from.

**Both walks take it, and the invented one is not a formality.**
`stormRandomLine` picks among ChessDB's own best moves, which is precisely the
play a repertoire is written to meet — so it re-enters the course *more* readily
than a random human game does, not less.

**It is handed in, never closed over.** `stormWalkGame(…, covered)` and
`stormRandomLine(…, covered)` keep the property that made them checkable at all:
`dev/check-storm.js` executes the whole of stage 2 with no network and no module
state.

##### The coverage asymmetry, which a later edit will want to tidy

§14.14's paused filter and §14.18.2's stub filter both live **inside**
`stormFrontiers`, so a session and a gather pass got them for free — both
producers draw their pool from that one function. **A walk is not inside it.**
So this rule is covered by being threaded through `harvestFrontier`, which is
the shared entry both passes reach the walks through, via `frontierCovered(f)`
reading `st.pool.cont`. Anything that ever walks by another route has to pass
the index itself. That is the asymmetry; it is not an oversight, and the two
halves of §14.18 really are covered by two different mechanisms.

##### Its own funnel row

The stop reason is the string `your own course answers this position`, which
`stormFunnelWhy(fn, 'stops', …)` files under its own key — so **how often it
fires is a number before it is an argument** (§14.17). On a stub-heavy course
this is expected to be a visible fraction of walk stops; nothing has been
measured live yet, and that is on the list.

##### The store is not re-filtered

Unchanged from the bullet above, and now true of both halves: positions
harvested by an earlier build stay until the retention rule and §14.16's
tombstones age them out. Re-filtering the store would need the course read
before `produceFromStore` runs, which is exactly the ordering §14.11 exists to
avoid.

##### The checks

`dev/check-storm.js` §7 executes it. The failure mode is silence — a course
whose walks never re-enter answers identically either way — so the fixture has
to actually re-enter, and it reaches the position **by another move order**
(1.e4 e5 2.Nf3 a6 3.Bb5 Nc6 4.Ba4 arrives at the position after 3...a6 of the
main order without ever standing on the Ruy frontier), or §14.18.2 would have
dropped the frontier before the walk began.

Controls run 2026-08-29, each failing on exactly its own assertions and no
others:

| control | fails |
|---|---|
| `stormReentered` returning false always (the rule reverted) | **5** |
| …with the `pos.side !== userSide` guard removed (the "tidy") | **3** |

The second is the one worth having: it still stops walks, it still looks
entirely plausible, and it silently discards the positions where the opponent
left the book first.


### 14.19 How often anybody reaches the line end (v0.146.0)

§4 stage 0 says the sample should be weighted two ways: by how many variations
converge on a frontier, and by **how likely the line is to be reached at all** —
*"storming the frontier of a line you meet twice a year is a wasted rep"*.
`stormDrawFrontier` has always done the first (`f.n`) and its own comment records
the second as deliberately not built, because section 21's reachability ranking
is a product over the opponent plies' Lichess shares, i.e. one explorer request
per distinct position of every line.

**The cheap half was already paid for.** `askGames` fetches the explorer AT the
frontier and kept only the game list; the same reply carries the position's own
`white` / `draws` / `black`, which is exactly "how often does anybody reach this
line end". Verified before anything was built on it (2026-08-29, `curl`, the
storm's own parameters including `moves: '0'`):

```
lichess   keys: black draws moves opening recentGames topGames white
          white/draws/black: 77701287 6553430 67547406      moves len: 0
masters   keys: black draws moves opening topGames white
          white/draws/black: 46418 85714 29902
```

Both paths, and a deep frontier answers `1 0 0` rather than omitting the fields.
No second request was improvised to get them; that is the cost §4 declined to
pay and it is still not paid.

#### 14.19.1 It weights the STORE, not the pool draw

The figure arrives one request **after** `stormDrawFrontier` has already chosen,
so it cannot bias the pool draw on the pass that discovers it. That is fine,
because the pool draw is no longer where a session gets its positions: since
§14.11 a session draws from the STORE and only falls through to walking. So the
figure is stored on the entry and read by `stormStoreDraw`.

**`stormStoreDraw`'s existing keys are untouched.** §14.15 is explicit that a
re-weighted comparator there is silent from the outside — every position still
comes back, in a plausible-looking sequence — so reachability goes in as a
separate term with the old ones in their old places:

```js
out.sort((a, b) => (a.k - b.k) || (b.reach - a.reach) || (a.r - b.r));
```

`k` ascending stays the primary key (unseen before most-missed), the random term
stays last so equal positions still come round in a different order every
session, and all this adds is: *among positions nobody has answered, ask first
about the line ends real games actually reach.* The assertion that catches a term
inserted in front of `k` is "a much-played position already missed twice stays
behind every unseen one", and nothing else would.

#### 14.19.2 A bucket, and what UNKNOWN means

`stormReachBucket` is `floor(log10(games))` clamped to `reachTop` (4), so five
buckets: under ten, tens, hundreds, thousands, ten thousand and over.

**A bucket and not the count**, because the count would make the draw fully
deterministic inside a failure-count group and take away the variety the random
term exists for. The question is "twice a year or twice a week", which an order
of magnitude states exactly and a raw integer overstates.

**UNKNOWN IS THE TOP BUCKET, and that is a decision.** §14.16's rule for a field
an older build did not write is that absence means "not known" and never zero —
here that matters twice over:

* demoting an unknown position would be inventing a fact about it;
* and *every* position stored before v0.146.0 is unknown, so demoting them would
  freeze an existing store out of every session until it had been gathered
  again. At the top they tie with the most reachable and fall through to the
  random term, which is exactly the behaviour they had before this existed.

The same absence-is-not-zero rule runs all the way down: `askGames` answers
`null` when the reply carries none of the three fields, `harvestFrontier` leaves
`f.games` unset on a failed lookup, and `stormPack` writes `undefined` rather
than `0`.

#### 14.19.3 It rides the wire, with no version bump

Pre-decided and worth stating: the figure **is** carried between devices
(`stormWirePack`/`Unpack`), as an optional field and with `wireVersion`
unchanged. Two reasons — it is not re-derivable on the far device without another
explorer request, which is the whole cost this exists to avoid paying twice; and
absence is already handled as "not known" by every reader, so an old payload and
a new one are both valid and a bump would refuse perfectly good cards.

The merge takes a figure the other device has and this one lacks, and never
overwrites one it already has. Unlike §15's counters there is nothing to
double-count: this is a property of the position's frontier, not of the device,
so the two can only disagree by one of them not knowing. ~8 bytes an entry
against a 162 KB budget.

#### 14.19.4 Reported, never on a live card

A frontier's popularity is not a spoiler — it says nothing about the position or
the move — but **a card has one job**, so it appears in exactly two places:

* the **gather's console breakdown**, as a third reason table
  (`stormFunnelWhy(fn, 'reach', …)`), which answers a question the other four
  numbers cannot: whether a pass spent its budget on line ends real games reach
  or on ones nobody plays. It stays out of `stormFunnelNote`'s one-sentence
  status line for that function's own stated reason — a reason table is a dozen
  lines and the sentence has to fit four numbers.
* the **review row's tooltip**, beside the line name and the centipawn figure.
  A tooltip and not a column: the row is read for four things and this is not
  one of them.

#### 14.19.5 The checks, and what was not done

`dev/check-storm.js` covers the bucket, the draw order, the pack and the wire.
Controls run 2026-08-29, each failing on exactly its own assertions and no
others:

| control | fails |
|---|---|
| UNKNOWN read as bucket 0 instead of the top | **4** |
| reachability sorted in FRONT of the failure count | **1** |
| the figure dropped from the wire | **2** |
| a missing figure stored as `0` rather than left unset | **1** |

The second is the §14.15 failure in a new shape and the one worth having: it
still returns every position, in a plausible order.

**Not done, deliberately:** the pool draw itself is still weighted by `f.n`
alone. Weighting it by reachability would need the figure before the frontier is
chosen, i.e. an explorer request per frontier up front — which is §4's expensive
half wearing a cheaper hat. **And nothing is re-gathered:** the store's existing
positions carry no figure and simply keep their old place in the queue until
they age out or are answered.


### 14.20 Which tier graded the card (v0.147.0)

§3.4 has three grading sources and §14.8 is why the third is not optional. They
are of wildly different strength — the position's own ChessDB list, one more
`queryall` on the position after the move, and two Stockfish searches at depth
20/18 — and until now they arrived at the user wearing **one treatment and one
tooltip**: every verdict line got `.clo-cdb--est` and the sentence about
`learn=1` fill-ins, whatever had produced it.

DESIGN-chessdb.md §3.3's standing rule is that a fill-in must never be presented
as a book eval. Read forwards, the same rule says three claims should not be
presented as one — and in one direction it was being broken already, since the
engine tier is the one source `.clo-cdb--est` is simply false of.

The tier was already known inside `gradeTiers` and already rode out on the
verdict as `source`. This is mostly a display change.

#### 14.20.1 It goes on the SECOND line

`stormVerdictLine` is read in about a second with a clock running (§16.3) and
was **not** lengthened; the one clause it did carry — `by the engine` — moved
off it. `stormBestLine` is the host, because that is the line the provenance is
*about*: it already carries the best move, both evaluations and the win rates.

```
Nxh2 · 13% of the game · −1
best Qf3 +0.32   Nxh2 −1.08   · by Stockfish d20
```

`stormSourceLabel` is three short strings and no more:

| source | label | what it claims |
|---|---|---|
| `list` | `ChessDB’s ranking here` | this position's own scored list — what every pick rule in §5.2 was measured against |
| `child` | `scored one move on` | one more request, about a position no game may ever have reached (§14.8) |
| `engine` | `by Stockfish d20` | two searches of our own, both sides of the subtraction from one evaluator |

**All three are named, not only the odd one out.** Naming just the engine is
what left `list` and `child` reading as the same claim, which is the thing this
section exists to stop.

The depth comes off the engine JOB (`job.depth`, resolved once when the job was
created for the reason that two answers could disagree) and is carried out
through `endEngineJob`'s answer. Quoting `CONFIG.storm.engineDepth` at render
time would name a profile that may not be the one that ran.

#### 14.20.2 `.clo-cdb--est` stops being unconditional

It means *"ChessDB computed this for us just now"* and nothing else — true of
both ChessDB tiers, false of the engine. `stormEstimated(v)` is that one
predicate and **both display hosts read it**: section 18's panel
(`syncStormUi`) and section 27's review (`renderReview`). The engine row wears
no dimming and gets its own tooltip naming the depth.

`stormSourceTitle(v)` is the three sentences. They are three because the
explanations really are different — a fill-in inside the list, a lookup one ply
on, and a local search — and a tooltip is the one place there is room to say so.

Both helpers are **top level**, with `stormCp` / `stormWp` / `stormVerdictLine`
/ `stormBestLine`, for §14.7's reason: two closures print this. `dev/check-storm
.js` §0 now asserts the indentation of all seven.

#### 14.20.3 What it cost in the panel

Measured in `dev/harness.html` (the replicas are hand-written and do not update
themselves, so a fifth storm-verdict card was added for the engine tier).
`.clo-cr-progress`, width × height, and the panel's own height under it:

| width | source | desktop | `html.clo-touch` |
|---|---|---|---|
| 300 | list, two moves | 266×32 · panel 172 | 266×38 · panel 208 |
| 300 | list, top move only | 246×16 · panel 156 | 266×38 · panel 208 |
| 300 | child | 266×32 · panel 172 | 266×38 · panel 208 |
| 300 | engine | 252×16 · panel 134 | 266×38 · panel 181 |
| 360 | list, two moves | 326×32 · panel 150 | 326×38 · panel 208 |
| 360 | engine | 252×16 · panel 134 | 294×19 · panel 162 |
| 880 | list, two moves | 340×16 · panel 134 | 397×19 · panel 162 |
| 880 | engine | 252×16 · panel 134 | 294×19 · panel 162 |
| 320 | every one of the five | ≤286×32 · panel ≤150 | ≤286×38 · panel ≤208 |

**Horizontal overflow is 0 at every width in both modes.** The cost is one
wrapped line at the panel's own 300px minimum — 16px of progress row and 16px of
panel — which is gone by 360px on the widest label and by 880px on all of them.
The verdict line above is unchanged at every width, which is the property that
mattered.

(`window.innerWidth` reads 0 in the harness's own frame, so "the panel's full
window width" is represented here by the 880px row; the storm's panel is wider
than that in its own window, where every label is on one line.)

#### 14.20.4 What it does NOT do

* **It does not ride §15's wire.** That record counts BANDS, not sources, and
  `statsWireVersion` stays 2. A source is a fact about one answer; the record is
  a fact about a line.
* **It is not on the live prompt.** See §14.20.1 — one line, one second.
* **It says nothing about whether a fill-in is good enough to grade with.** That
  is §12.3, still open and still a probe. What this buys is that the answer will
  be legible from real use as well as from a probe run, since a session's review
  now says which tier produced each verdict.


### 14.21 Storm one chapter (v0.148.0)

§15 built the answer to *which part of my repertoire do I not understand one move
past the book* — and left nothing to do with it. The stats table names the worst
chapter and the only available response was another whole-course storm.

**It is a filter, not a producer.** Nothing about how a position is found,
graded, stored or counted changes; two pure functions narrow what the session
draws on, and everything downstream is untouched.

#### 14.21.1 Where the scope is applied

Two places, and the first is the one that matters:

* **the STORE**, because §14.11 is why a session opens at once. `storeDraw`
  hands `stormStoreDraw` a smaller store rather than a new sort key —
  **filter the input, keep the order.** §14.15 is explicit that a re-weighted
  comparator there is silent from the outside, and "positions from this
  chapter first" is exactly the kind of term that would look like it was
  working.
* **the frontier POOL**, after `stormFrontiers` has walked the whole course.
  Filtering its INPUT would be wrong twice over: the walk is what knows which
  lines end where, and it is also what §14.18's stub index is built from, so a
  narrowed input would change what *"the course answers this position"* means.

A gather pass started inside a scoped session inherits the scope, for free —
both producers draw from `st.pool` — and that is the right reading anyway.

#### 14.21.2 Three things the filters had to get right

**Every oid, not the first three.** `stormFrontiers` pushed `oids` alongside
`names` under a cap of three. That cap was always a DISPLAY cap — three names is
what a card can print — and the scope asks *"does any line ending here belong to
that chapter"*, which a capped list answers **wrongly and silently** for a
frontier four lines converge on. The two are now pushed separately; `oids[0]`,
which §15 counts against, is unchanged.

**The pool array's own properties are carried across.** A plain `.filter()`
returns a bare array, and `stormFrontiers` hangs three things off its result:
`paused` and `covered` word the refusals (§14.14, §14.18), and **`cont` is what
`frontierCovered` reads for §14.18.4's walk stop**. So the obvious one-liner
would have switched that stop off for every chapter-scoped session, invisibly,
three days after it was written. `stormFilterPool` copies all three and adds
`dropped`.

**A stored position with no oid is EXCLUDED.** Those are entries written before
v0.140.0 whose `backfillStoreOids` name matched two variations or none — they
could be from anywhere, and offering them under a heading naming a chapter is a
claim the session cannot support. They are counted (`unattributed`) so the note
can say where they went, rather than leaving the user with a short session and
no reason.

#### 14.21.3 A narrow filter can starve, and that is SAID

The failure this feature can produce is a session that looks like a slow
producer and is actually a scope with nothing in it — a chapter whose three
lines' positions have all been retired (§14.16), or whose line ends were all
dropped by the ordinary rules.

`stormScopeNote` is `stormFunnelNote`'s vocabulary (§14.17.2) applied to that:
it tells apart a chapter whose line ends were excluded, one whose stored
positions belong elsewhere, and one whose positions cannot be attributed at all.
It is checked **before** the existing refusals in `startSession`, because a
scope is the only cause there that the user chose one press ago — the sentences
below it would otherwise tell them their course is unsuitable.

One case falls back rather than refusing: a `lid` that resolves to no lines at
all (possible after `stormStatsPrune` has aged the record out under a
`stormAgain`) drops the scope, says so, and storms the whole course. A session
with an empty filter would look like a slow producer for ever.

#### 14.21.4 The surface

* **Under an OPEN chapter group in the stats view**, never on its head row. The
  head is itself a `<button>` and a button inside a button is not markup — and
  restarting a session is not something to hang off a fold.
* **A group with no `lid`** ("Not in a chapter") cannot be scoped to, since the
  scope *is* a lid.
* **The way out is a row of its own** above the chapters, shown only while a
  scope is active — widest scope first, the same order as "Your repertoires"
  above "This course".
* **`stormAgain` keeps the scope** unless one is handed in. "Storm again" after
  a chapter storm means the same chapter; the stats rows are where a different
  one, the whole course included, is chosen. Both existing Again buttons were
  rewired to `() => stormAgain()`: it now takes an optional argument, and a bare
  listener would hand argument 0 the MouseEvent — 24g's own trap, which was
  silent on both analysis hosts for ninety versions.
* **The window's subtitle names it** (`Intermediate Starter Kit › The Scotch`),
  because the scope is part of what the session *is* rather than a status
  another message overwrites.

Neutral outline (`.clo-st-scope`), deliberately not `.clo-st-gather`'s green:
DESIGN-ui-inventory §3's rule is that green outline is an ordinary action, and
the green in this window is spent on *storm* and *gather*, which are what the
window is for. There is one of these under every open chapter, so a green row of
them would shout over the table they are read against. Its metrics are
`.clo-st-sync`'s to the pixel — two controls that look the same and measure 22px
against 24px read as a mistake.

Measured in `dev/harness.html` at panel widths 880 / 560 / 360, desktop and
`html.clo-touch`:

| | desktop | touch |
|---|---|---|
| scope button | 152×24 (whole course) · 123×24 (chapter) | 177×32 · 144×32 |
| `.clo-st-sync` beside it | 53×24 | 61×32 |
| scope rows | 36 / 26 / 36 px | 44 / 27 / 44 px, 67 at 360 (the wide row wraps) |
| body overflow-x | 0 at every width | 0 at every width |
| head overflow-x with the chapter in the subtitle | 0 | 0 |

#### 14.21.5 What it does NOT do

* **It does not touch the record.** `statNote` counts against the line, as
  before; a chapter total is still a roll-up of its lines (§15.1).
* **It does not re-weight anything.** §14.15's draw order is untouched and
  §14.19's reachability term is untouched; the scope only removes candidates.
* **It cannot answer for a bought course.** Chapters come from `getImportData`
  and bought courses are absent from it (§15.4), so those courses list flat and
  have no scope buttons at all. That refusal was already stated in words.
* **It has no live verification.** Everything here is the harness and
  `dev/check-storm.js`; a real chapter-scoped session needs a signed-in tab.


### 14.22 The live run of 2026-08-29, and the one thing it broke

Everything v0.145.0-v0.148.0 shipped was checked in a signed-in tab, on both
courses. **Four of the five parts behave exactly as designed; the fifth could not
be exercised, because the ENGINE TIER does not produce a verdict at all** — see
§14.22.4, which is a defect this run found rather than one it introduced.

#### 14.22.1 What passed

**§14.21, the chapter scope — verified end to end** on 453453. Nine passes were
recorded to fill §15's table, *Group by chapter* placed 5 lines in 2 chapters,
and the *sicil test* group's fold carried the launcher under it:

* the subtitle read `Testing course › sicil test`;
* six consecutive cards came from that chapter's own three lines and from
  nothing else — the unscoped run before it had freely offered
  `Sicilian: 2...Nc6 3.d4`, `test alternative2`, `1` and `4`, and not one of
  those reappeared;
* the scoped pool ran out and said so (*"Looking for positions… (0 lines
  left)"*) rather than hanging;
* **Storm again kept the scope**, the current chapter's row read *"This is the
  chapter you are storming."* instead of offering a button, `Not in a chapter`
  had no button at all, and **Storm the whole course dropped it** (subtitle back
  to `Testing course`).

**§14.19, reachability — verified in both hosts.** The gather's console
breakdown printed the new table with the whole ramp:

```
line ends by how often they are reached:
    11  10-99 games at the line end          5  10000-99999 games at the line end
     8  reach not recorded                   4  100-999 games at the line end
     5  1000-9999 games at the line end      3  1 game(s) at the line end
```

…and a review row's tooltip on a freshly gathered position read
`Scotch 4...Nxd4?! #2 · 10000-99999 games at the line end`. **The
absence-is-not-zero rule was exercised for real**: on the first pass the
explorer answered `HTTP 429` at eight frontiers, and all eight came back as
`reach not recorded` rather than as "0 games" — which is the whole of §14.19.2,
tested by an outage instead of by a fixture.

**§14.20's label — verified for both ChessDB tiers.** An answered card's second
line read `best Nf6 -0.20   · ChessDB’s ranking here`, with the verdict line
above it carrying no source clause, the legend wearing `.clo-cdb--est` and the
ChessDB tooltip behind it. A verdict with NO source (an ungraded card) printed
`best Bf3 +1.62` and claimed nothing, which is the assertion this file makes
about `stormSourceLabel({})`. The playing-the-top-move-once fix also still
holds: `Nf6 · the top move · level with the best · +2` over a second line naming
Nf6 once.

**§14.18's stub filter** reported 8 excluded line ends on 453453 and 9 on
291847, against the 8 and 8 measured offline — i.e. it is doing on a live course
exactly what the fixture says.

#### 14.22.2 §14.18.4 fired zero times in 123 walks

Two gather passes walked **67 real games on 453453 and 56 on 291847**, and the
`walks stopped on:` tables account for every one of them without the re-entry
stop appearing once:

```
453453   36 ply limit · 19 unknown · 6 opponent erred · 5 you erred · 1 game ended   = 67
291847   28 ply limit · 13 unknown · 6 opponent erred · 5 you erred                  = 52 (+4 unusable)
```

**This is most likely a true negative rather than a broken rule.** A frontier is
by v0.144.0 a position no line of the repertoire continues from; for the stop to
fire, a real game leaving that leaf has to transpose back onto a position the
same repertoire plays a move from, with the user to move. On a single-repertoire
course that is genuinely rare.

But it is worth being precise about what has and has not been shown. The index
is demonstrably BUILT correctly — the stub filter, which reads the same `cont`,
excluded 8 and 9 line ends on the two courses. What live evidence cannot
separate is "the rule never fired" from "the index never arrived", since
`frontierCovered` returning null produces an identical, silent result. That is
the failure mode §14.18.4 was written to warn about, and the assertions in
`dev/check-storm.js` are what cover it.

**If it ever needs settling:** one temporary `log()` in `frontierCovered`
reporting `covered && covered.size` answers it in one gather pass. Not added —
a debug line in a shipped hot path is worse than the doubt.

#### 14.22.3 Two smaller observations, neither acted on

* **A gather pass can rate-limit the explorer.** The first pass on 453453 hit
  `HTTP 429` on every frontier that had games, so all 62 line ends fell through
  to the invented-line path and the pass stored 1 position for 86 ChessDB
  requests. A second pass minutes later walked 67 games and stored 16. Note that
  `st.mastersOnly` does NOT catch this: it flips on a PGN failure, not an
  explorer one, so a 429 storm has no fallback and simply degrades to invented
  lines. Worth a rule of its own if it recurs; one observation is not a
  measurement.
* **"N position(s) ready" is not scope-aware.** Under a chapter scope the
  readiness figure still counts the whole store (19), while the session will
  only draw on that chapter's share. Cosmetic, and the honest fix is
  `stormFilterStore`'s own count — which `storeDraw` already computes into
  `st.storeCut`.

#### 14.22.4 THE ENGINE TIER RETURNS NO VERDICT — a live defect

**§3.4's third source did not produce a single verdict, on two positions, with a
demonstrably working engine.** This is the tier §14.8 says is not optional.

Reproduction, twice, on 291847:

| position | move played | outcome | elapsed |
|---|---|---|---|
| Scotch 4...Qh4?!, +2 past the line | `Bh6` (hangs the bishop) | `No verdict` | ~12 s |
| Scotch 4...Nxd4?! #2, +6 past | `Ba6` (hangs the bishop) | `No verdict` | ~14 s |

Both moves are exactly what tier 3 exists for: outside ChessDB's scored list,
with a child position no game has reached. The same position was also re-run
through the review's *Try again* (§14.10b), with the same result — so it is not
a clock or a session-state effect.

**It is not a timeout.** `engineTimeoutMs` is 20 s and `gradeTimeoutMs` 30 s;
both grades resolved in 12-14 s. Whatever `stormEngineLoss` did, it answered
`null` early rather than being cut off.

**It is not a missing engine.** `engine/vendor/` holds both Stockfish 18 pairs,
and the panel's own Engine toggle, opened on 24g's analysis board on the same
page moments later, reached **depth 18 with three PV lines and the ChessDB
companion column** in seconds. Booting the engine FIRST and then storming made
no difference — the second reproduction above was run that way.

**No warning was logged.** `pingEngineIfSilent`'s "engine silent after analyze"
never fired, which says something answered inside 3 s.

**It is not a regression from this work.** The whole diff over
v0.145.0-v0.148.0 touches that path in exactly two places, both on the SUCCESS
branch that was never reached: `endEngineJob`'s answer gained `depth: job.depth`
and `gradeTiers`'s engine arm gained `depth: eng.depth`. Everything else in
`stormEngineLoss`, `onStormEngineUpdate` and `endEngineJob` is byte-identical to
v0.144.0.

**Where to start looking**, in order of suspicion:

1. `onStormEngineUpdate`'s acceptance test, `msg.done || msg.depth >= job.depth`
   — `job.depth` is `C.engineDepth[engineProfile()]` (20 desktop), and if the
   updates arrive tagged with a depth that never reaches it and `done` never
   comes, the job dies on its watchdog. That would be 20 s, not 12, so this
   fits only if something else resolves first.
2. `stormMoverCp` returning null for one of the two searches — the explicit
   `typeof job.best !== 'number' || typeof childBest !== 'number'` guard calls
   `endEngineJob(job, null)`, which is an EARLY null and matches the timing. A
   pv carrying neither `cp` nor `mate` would do it.
3. The reqId prefix match (`msg.reqId.startsWith(job.reqId + ':')`) silently
   dropping every update, leaving the job to its watchdog — again 20 s, so less
   likely.

This makes TODO block 3 (§8.1a's engine-tier timing) both more urgent and
differently shaped: there is no point timing a tier that is not answering.
**Fix it before measuring it.**

**ANSWERED AND FIXED in v0.149.0 — §14.23. It was suspicion 1**, and the
timings in the table above were the one part of this report that pointed the
wrong way: instrumented, the job runs its watchdog out in full.


### 14.23 The engine tier, fixed (v0.149.0)

§14.22.4's defect, diagnosed by making every silent exit of the tier say which
one it was, then reproduced live on course 291847.

#### 14.23.1 What it actually was

One console line settles it:

```
storm: engine tier gave up — st1787985550174-1 ended in phase best after
20708 ms · 0 update(s) taken, 8 too shallow (deepest 17 of 20), 0 with no pv,
0 for another request
```

**Eight updates arrived, every one of them was thrown away, and the job died
still in its FIRST phase.** So it was §14.22.4's first suspicion —
`msg.done || msg.depth >= job.depth` — but not in the shape that paragraph
guessed at. Nothing was wrong with the tagging, the relay or the perspective:
the search was simply still working. Depth-20 MultiPV-3 on this machine takes
longer than 20 s, and the tier needs **two** such searches under **one**
20 s watchdog. It was unsatisfiable by arithmetic, for every position, on every
card, from v0.130.0 to v0.148.0.

The half that makes it a defect rather than a mis-set number is the discard: an
update short of the target depth was dropped, so when the watchdog fired the job
was holding a perfectly good depth-17 evaluation of the position and answered
`null` anyway.

#### 14.23.2 The fix

`engineDepth` becomes a CEILING and `enginePhaseMs` (8000) becomes the real
limit — a budget **per search**, after which the search is TAKEN at whatever
depth it has reached. §8.1a's own note is the whole argument: *a fallback that
always times out is strictly worse than a shallow one, because it degrades to
"No verdict" and grades nothing at all.*

Three rules come with it, and each is a way the change could have been wrong:

* **THE REPLY IS CAPPED AT WHAT THE POSITION ACTUALLY REACHED**
  (`job.childTarget = job.bestDepth`). A loss is a subtraction (§3.4), so the
  two sides must be of the same strength; asking the reply for depth 20 when
  the position itself managed 15 both costs longer and puts the difference
  between two depths straight into the verdict. It is the same mistake as
  mixing two evaluators, one size down.
* **A PAIR TOO FAR APART IS REFUSED** (`engineDepthSlack`, 3). The cap above
  means the reply can only come back EQUAL or SHALLOWER, and shallower
  *flatters* the move played — the opponent's resources are what a deeper
  search finds. This bounds the case where even the lowered target was not
  reached in budget. A JUDGEMENT, not a measurement: what it is traded against
  is the `No verdict` the whole change removes, so it is deliberately loose
  rather than tight.
* **THE DEPTH §14.20 NAMES IS NOW THE ONE THAT RAN** —
  `Math.min(bestDepth, childDepth)`, the weaker of the two, since that is what
  the comparison is worth. CLAUDE.md's rule ("off the job, never from
  `CONFIG.storm.engineDepth`") is unchanged and now buys more than it did: the
  ceiling is usually not what happened.

`engineTimeoutMs` (20 s) survives as a BACKSTOP for the shapes of failure a
phase budget cannot see — a worker that answers nothing at all. It has to stay
above two phase budgets or it fires first and the phase budget can never matter,
and `gradeTimeoutMs` still has to stay above IT, with two ChessDB round trips in
front of both. 8000 is chosen from that chain: 16 s for the pair leaves 14 s of
the 30 s grade budget for the fetches.

#### 14.23.3 Measured, live, 2026-08-29

Same course, same shape of move — a deliberately hanging piece, twice:

| | before (v0.148.0) | after (v0.149.0) |
|---|---|---|
| outcome | `No verdict` | `Blunder`, −34% and −42% of the game |
| elapsed | 20.7 s (watchdog) | 9.3 s |
| depth used | none — discarded at 17 | 12, both searches |

```
storm: engine tier taking the position at depth 12 — it did not reach 20 within 8000 ms
storm: engine tier answered — … ended in phase child after 9344 ms ·
position depth 12 of 20, reply depth 12 · 0 update(s) with no pv, 0 for another request
storm: graded c1h6 by engine
```

§14.20's tooltip reads *"…graded by two local Stockfish searches to depth 12"*,
i.e. the depth that ran, and the row does NOT wear `.clo-cdb--est`. Both review
rows carry a real win-probability loss where they would have carried `?`.

Note the second search: capped at 12 rather than 20, it finished in ~1.3 s. The
adaptive cap is most of why the pair now costs half of what one search used to.

#### 14.23.4 Why it is executed rather than eyeballed

`dev/check-storm.js` §10 drives the whole state machine — `stormEngineLoss`,
`armEnginePhase`, `startEngineChild`, `finishEngineJob`, `endEngineJob`,
`onStormEngineUpdate` and the two `keepEngine*` helpers, sliced out and fed
updates in `engine/engine.js`'s own shape with the budgets shrunk to
milliseconds. It is the second place in that file to execute IMPURE code
(§14.17's funnel is the first) and for the same reason: **the property lives in
the control flow and nowhere else.**

It also cannot be seen from outside. A slow machine and an ignorant ChessDB
produce the identical output — "No verdict" — whether this works or not, which
is exactly how it survived four releases and a live verification pass.

Controls run 2026-08-29, each failing on exactly its own assertions and no
others:

* v0.148.0's discard rule restored (an update below the target thrown away)
  → **5 fail**, all five the budget-expiry case;
* the reply asked for the ceiling instead of the depth the position reached
  → **1 fail**;
* the `engineDepthSlack` guard defeated → **1 fail** (a depth-18 position
  subtracted from a depth-10 reply, which returns a plausible number).

#### 14.23.5 What this does NOT settle

**Block 3 (§8.1a) was unblocked by this and has since been DONE — §14.24.**
What follows is the brief it was run against; the answers are there, and the
headline is that the profile at risk is the DESKTOP one.

**Block 3 (§8.1a) is now unblocked and still owed.** `enginePhaseMs` 8000 is
an estimate exactly as `engineTimeoutMs` 20000 was — but it now fails SOFT (a
shallower verdict) rather than hard (no verdict at all), which is the whole
difference. What wants measuring over a session's worth of fallback grades:

* the depth each profile reaches in the budget — one desktop position reached
  12, and one is not a measurement;
* how often `engineDepthSlack` refuses a pair, which should be near never;
* **mobile**, on the lite build's 2 threads, where the depth reached may be low
  enough that the verdict is not worth the 16 s. §8.2's ceiling on a held board
  is the constraint, and the answer there may be a shorter phase rather than a
  longer one.

Two things the diagnosis ruled out and that nothing needs to look at again: the
reqId tagging (`0 for another request` on every run) and the pv shape
(`0 with no pv`).


### 14.24 The engine tier, timed (block 3, 2026-08-29)

§14.23.5 left three questions and TODO-storm.md block 3 is them: *what depth
does each profile reach in `enginePhaseMs`, how often does `engineDepthSlack`
refuse a pair, and is mobile the one with no margin?* They are answerable now
only because v0.149.0 made the tier fail SOFT — before it, every profile
"reached" nothing at all and the honest answer to all three was `No verdict`.

`dev/probe-engine-tier.js` is the measurement. It drives **the shipped state
machine** — `stormEngineLoss`, `armEnginePhase`, `startEngineChild`,
`finishEngineJob`, `endEngineJob`, `onStormEngineUpdate` and both `keepEngine*`
helpers, sliced out by `dev/slice-source.js` exactly as `dev/check-storm.js` §10
executes them — against a **real vendored Stockfish** in node, with the budgets
read out of `CONFIG.storm` and the sizing read out of `engine/engine.js`'s own
`PROFILES`. Nothing in it is transcribed, so it cannot answer about a tier
nobody ships.

#### 14.24.1 What it measures, and the four things that make it faithful

* **`engine/engine.js`'s protocol, not "a Stockfish".** Updates are coalesced
  into one per `THROTTLE_MS` window, so the depth the tier SEES lags the depth
  the engine has printed by up to 400 ms — reading the raw info lines would
  over-report what the tier gets. An analyze arriving mid-search sends `stop`
  and waits for the `bestmove` FENCE, and that wait is part of the pair's wall
  clock; it is paid on nearly every position, because phase 1 usually ends on
  its budget rather than on its ceiling. A per-request depth only ever LOWERS
  the profile depth.
* **THE UPDATE IS DELIVERED ASYNCHRONOUSLY**, and that is fidelity rather than
  tidiness. In the extension an update crosses a Worker boundary, then the
  service worker, then `chrome.tabs.sendMessage`, so the tier's reaction — which
  is another UCI command — can never re-enter the engine from inside its own
  output callback. Delivered synchronously it does exactly that, and the
  vendored build silently drops the `go` that follows: measured while building
  this probe, the reply search was started and never produced one info line, and
  nothing threw.
* **The move graded is a RANDOM LEGAL one, seeded.** That is the population
  §14.8 describes: this tier is reached precisely where ChessDB knows neither
  the move nor its child, i.e. for arbitrary human moves. A move out of the book
  is one the tier is never asked about.
* **The positions are storm survivors** — `dev/tmp-storm-fens-all.json`, the
  same dump §12.3b used, 12 of them, seed 11 so both profiles are asked the
  identical question.

#### 14.24.2 The numbers

Author's machine, an i7-1065G7 (4 cores / 8 threads, a 15 W laptop part), node
24. Twelve positions each; every row answered.

| profile | build / threads | ceiling | phase | pair mean | pair max | position depth | reached the ceiling |
|---|---|---|---|---|---|---|---|
| **desktop** (shipped) | full / 4 | 20 | 8000 | **14.1 s** | 16.0 s | mean 18.0 (16-20) | **1 of 12** |
| desktop | full / 4 | 18 | 8000 | 11.7 s | 15.3 s | mean 17.8 (16-18) | 11 of 12 |
| desktop | full / 4 | 20 | 5000 | 8.4 s | 10.0 s | mean 16.4 (14-19) | 0 of 12 |
| **mobile** (shipped) | lite / 2 | 18 | 8000 | **5.2 s** | 7.3 s | **18.0, every one** | 12 of 12 |

* **`engineDepthSlack` refused nothing: 0 of 48 pairs**, across all four
  configurations. The largest gap seen was 3, at the limit and inside it; 40 of
  48 pairs had a gap of 0 or 1. The cap introduced in v0.149.0 (`childTarget =
  bestDepth`) is what makes that true, and it is doing its job.
* **`engineTimeoutMs`'s 20 s backstop fired 0 times**, as it should: with a
  per-search budget of 8000 the pair's arithmetic ceiling is ~16 s plus two
  fences, and the worst pair measured was 16.0 s.
* **`gradeTimeoutMs` has 14 s of headroom** in the worst shipped case, for two
  ChessDB round trips that cost a few hundred milliseconds. The chain
  (§14.23.2) holds with room.

#### 14.24.3 The finding: it is DESKTOP that has no margin, not mobile

§14.23.5 expected mobile on two threads to be the profile at risk. It is the
opposite, and by a factor of nearly three: on one machine, the lite build at two
threads reaches its full ceiling of 18 on every position in ~5 s, while the full
build at four threads spends its entire budget on eleven positions in twelve and
still averages depth 18.

Two things follow, and only the first is about the profiles:

1. **`engineDepth.desktop` 20 is very nearly decorative.** It was reached once
   in twelve. What actually decides the desktop verdict's depth is
   `enginePhaseMs`, exactly as §14.23.2 intended — but that means the ceiling is
   not buying the extra strength it names, it is buying 2.4 s per card of budget
   spent reaching for it. Lowering it to 18 costs **0.2 ply of mean depth** and
   saves **17% of the pair's wall clock**, and the grid row above is the whole
   evidence for it.
2. **The full build is the expensive half of the desktop profile**, not the
   thread count. Same machine, same target depth of 18: lite/2 does it in 5.2 s,
   full/4 in 11.7 s. That is a fact about NNUE evaluation cost, and it is the
   reason a "stronger" profile is the slow one here.

**Nothing in `CONFIG.storm` was changed on the strength of this**, for §12.7c's
reason: it is one machine, and the numbers a shipped constant is moved on should
be the author's to move. The grid is written down so that it is a number to
move rather than a measurement to re-run. The change with the best ratio is
`engineDepth.desktop` 20 → 18; the change with the largest effect is
`enginePhaseMs` 8000 → 5000, which takes the pair to 8.4 s at a cost of 1.6 ply.

#### 14.24.4 What it does not settle, and the direction of its error

* **It is not a phone.** `--profile mobile` runs the lite build on two threads
  on a laptop CPU: the build-and-threads half of the profile, and not the
  device. §14.23.5's third bullet stays open and needs a phone to close.
* **It is node, not the extension's offscreen document, and it flatters the
  extension.** §14.23.3's live figures — depth 12 in 9.3 s, in a browser, on the
  same author's machine — are both shallower AND slower per ply than anything
  here. So this probe is an UPPER bound on depth and a LOWER bound on time, and
  the conclusion it supports is only made stronger by that: if the desktop
  ceiling of 20 is out of reach in node, it is further out of reach where it
  runs.
* **A card is held for 14 s on the shipped desktop profile** and §8.2 puts the
  edge of what a paused clock excuses at 20 s. That is not a defect and it is
  not comfortable either; it is the number a shorter phase would buy back.
* **Twelve positions from two courses.** The spread of depths (16-20) is wide
  enough that a different dozen would move the means; it is not wide enough to
  make a ceiling reached once in twelve look reachable.


## 15. The performance record (v0.140.0)

A storm ends with a score, and a score is forgotten by the next one. The
question the exercise is actually asking — *which part of my repertoire do I
not understand one move past the book* — was never answered anywhere, because
nothing outlived the session.

So every graded answer is counted against the LINE whose frontier the position
came from, kept in `chrome.storage.local`, rolled up per CHAPTER and per COURSE,
and carried between devices on section 16e's transport. Two figures per row:

* **found** — how often a good or decent move was played;
* **avg loss** — the mean centipawn loss of the moves that could be graded.

They are different questions and the interesting case is where they disagree. A
chapter you nearly always half-solve reads 90% / −40cp; one you either see or
blunder reads 60% / −25cp. Neither number alone separates those.

### 15.1 What is counted, and against what

The unit is the **line end**, not the position: `st.card.storm.oid` is the
variation whose frontier the position is past, and that is the only thing here
that is not free. Three consequences:

* **`stormFrontiers` now keeps `oids` beside `names`.** The name was already
  kept (it is what a card is labelled with); a name is not unique, can be
  edited, and cannot be resolved to a chapter, so the oid is what the record is
  keyed on. Where several variations end on one frontier, the answer is counted
  against the FIRST — which is the one whose name the card was showing, so the
  attribution is the one the user saw.
* **`stormPack` gains `o`.** A stored position is drawn months after it was
  found, so the oid has to survive in the store. Entries written before this
  version have none; `backfillStoreOids` fills them in from the course listing
  that `startSession` reads anyway, BY NAME, and refuses a name that matches two
  variations. What it cannot name is counted under one "Line not recorded" row
  rather than filed under a guess.
* **A review retry (§14.10b) is not counted**, for the same reason it scores no
  points: it was answered at leisure. `statNote` is called from `finishAnswer`
  and not from `runGrade`, which both paths share.

`unanswered` (§14.10c) is refused outright. It is in the review because it is
the position most in mind; counting it would mark the user down for the clock.

### 15.2 The three things that fail silently

All of these produce plausible numbers when they are wrong, which is why
`dev/check-storm.js` §9 executes them (45 assertions; four controls, each
failing on exactly its own — the rate's denominator on 2, the merge on 5, the
missing-loss rule on 3, the roll-up on 1).

**The denominator.** `unknown` is a verdict about ChessDB and not about the
user — `finishAnswer` already scores it nothing and holds the streak for exactly
that reason. Counted as a failure it marks the user down for the book's
ignorance; counted as a success it flatters them. It is out of BOTH halves of
the fraction, out of the bar, and named only in the bar's tooltip. A row with
nothing else on it reads "—", not "0%": an absence of a score is not a bad one.

**The merge.** These are counters and the wire merge is a union over a whole
snapshot, so *summing* two devices' totals sums them again on the next exchange,
and again after that — while the numbers stay plausible and keep growing, which
is also what working looks like. So the record is kept **per device**
(`cloStormDevice`, one random id made once) and summed only on READ. A device's
own counters increase monotonically, so the record with the higher `n` is simply
the later one and `max` is exact however often two devices meet. The assertion
that catches a summing merge is *"a second exchange adds nothing"*.

**The roll-up.** A chapter's average loss is a mean over ANSWERS, never over its
lines: one line answered once at 200cp beside one answered nine times at 0cp is
20cp per answer and 100cp per line, and only the first is the chapter's figure.
`stormStatRoll` sums the raw `ls`/`lc` pairs and divides once.

### 15.3 The wire is a card of its own

Section 16e's transport again, through `pinSyncApi.carrier`, and deliberately
**not** folded into the position card. That payload is CUT to fit its budget
(`stormWirePack` drops positions until it fits), so a statistic carried inside
it would be dropped whenever a position list ran long — silently, and after the
requests that produced it had been spent. It also carries ONE course's positions
while the record is about every course.

`statsMaxWireBytes` is 60000 base32 characters against §14.12's measured ceiling
of 162460; a line is ~80 bytes with its devices, so that is several thousand.

**No tombstones**, unlike the position card, and the difference is worth stating:
a position leaves the position store by the *retention rule*, which one device
can apply and another not, so "absent here, present there" is ambiguous. A line
leaves this record only by `stormStatsPrune`, which is a function of the
record's own timestamp and which every device applies to the same numbers — so
a union merge converges by itself. A resurrection would in any case be harmless,
the record still being true, where a resurrected POSITION is one the user has
already learned.

An exchange happens on the stats view's own button, and behind the session's
existing auto-pull — `syncStore(...).then(() => syncStats(...))`, in that order
rather than at once, because both read the sync course and write a card, and two
exchanges racing over one course listing is a needless way to find out whether
that is safe.

### 15.4 Chapters cost requests, so they are behind a press

**`getList` does not say which chapter a variation is in.** That is why
`fetchVariationChapter` (24g's, shared and unchanged) exists: it reads chapters
one at a time and stops at the oid. Grouping a whole course therefore costs up
to one request per chapter, so it is a button — *Group by chapter* — and the
answer is cached for good in `cloStormChapters`, keyed by course. Until it is
pressed the lines are listed flat, which is a complete answer to the second half
of the question in its own right.

**It can only answer for a course the user can add to.** `getImportData` is the
only call that enumerates a course's chapters and bought courses are absent from
it (19d's `fetchImportTargets`), so for those the refusal says so in words
rather than leaving an empty list. Grouping a bought course would need the
chapter list off the course page's own DOM, i.e. a new Chessable selector; not
built, and noted here rather than attempted.

### 15.5 The view

A FOURTH thing the storm window's body can show, up instead of the stage, the
review and the summary, on `s` or the settings row's *Stats* button. It is
reachable only where no clock is running — the ply selectors' rule (§14.9), for
a harder reason than theirs: section 18's board is pinned to the STAGE's slots
in document coordinates, so hiding the stage under a live card would leave a
board floating over the table. `toggleStats` refuses that itself as well, since
the settings row is not the only way in.

Two tables, because two questions were asked. **Your repertoires** is every
course with anything recorded; **This course** is by chapter, foldable, with the
lines under each. Both sorted **worst first** — a table of statistics whose top
row is your best line answers nothing — and the course being stormed is MARKED
rather than moved, since pulling it out of that order would break the only thing
the sort is for. Every row carries its answer count: a 0% built on one answer is
not the claim a 0% built on twenty is, and no threshold hides the thin rows,
because which of them to believe is a judgement the count is enough to make.

The strip is good / decent / missed in the review rows' own three colours
(`--clo-accent`, `--clo-attention`, `--clo-danger`) — a fourth palette for the
same three verdicts is how two halves of one feature come to disagree about what
amber means. Under 700px of panel width the strip is what goes, not a number:
the percentage says the same thing less precisely, and the numbers are what the
table is read for. Measured in `dev/harness.html` at 880px and 360px, desktop
and `html.clo-touch`: no overflow in any of the four, rows 23px and 31px.

### 15.6 What was NOT measured

* **Whether the figures are stable enough to act on.** A three-minute session
  answers about a dozen positions and a course has dozens of line ends, so a
  chapter's percentage is built on a handful of answers for a long time. The
  count column is the mitigation; whether a "seen fewer than N times" fold would
  be better is a question for somebody who has used it for a month.
* **The exchange end to end**, exactly as §14.12 left it: it needs a course
  chosen for syncing on the options page, which the browser tooling cannot
  reach. The pack, the merge and the unpack are executed by the check; the POST
  is 16e's own, already proved with a second card.
* **The cost of `Group by chapter` on a large course.** It is one `getList` per
  chapter, and the largest course on the test account has few; a fifty-chapter
  course has not been tried.
* **Nothing here is graded a second time.** The record stores the verdict the
  session produced, so a change to `stormGrade`'s bands makes old rows and new
  rows subtly different claims. Not versioned, because the bands have not moved
  since v0.130.0 and a re-grade is impossible anyway — the scored list is not
  kept per answer.

## 16. Win probability, not centipawns (v0.141.0)

§8.1's verdict was a flat centipawn loss: within 30cp of the best move, good;
within 70cp, decent; past that, a miss. That was wrong for a reason built into
this feature's own stage 0, and the author named it: **`userHiCp` admits
positions up to +200**, and a centipawn is not worth the same there as it is at
equality. Giving up 100cp from +500 leaves you winning; giving up 100cp from 0
does not. The old rule called both the same thing.

So the grade is now **how much winning probability a move gives up against the
best one**, and there are five bands rather than three.

### 16.1 The conversion

Lichess's own fit over real games, in `stormWinPct`:

```
Win% = 50 + 50 * (2 / (1 + exp(-k * cp)) - 1)      k = 0.00368208
```

`k` is theirs and is **not a dial**: changing it re-scales every band at once
and silently, since the verdicts stay entirely plausible. `dev/check-storm.js`
pins it by its consequences rather than by its value — the curve is 50% at
equality, symmetric, under 90% at +500 and over 97% at +1000.

Evaluations are **clamped to ±`wpClampCp` (1000) first**, which is what keeps a
mate score from needing a band of its own: ChessDB writes one as ~30000 and the
engine tier as `engineMateCp`, and at ±1000 the curve is already at 97.6%. It
changes no ordinary verdict — within the storm's own eval band nothing comes
near it — and it has one pleasant consequence worth stating: preferring mate in
5 to mate in 3 now costs exactly nothing, while missing the mate for a modest
edge is a blunder. Both are asserted.

The loss is **floored at 0**. A move scoring better than the book's own "best"
is the book being imprecise, not a bonus to be handed out.

### 16.2 The bands, and why these numbers

The author's, unchanged, with the points they came with:

| band | win probability given up | points |
| --- | --- | --- |
| great | < 3% | +2 |
| good | 3–6% | +1 |
| ok (inaccuracy) | 6–10% | 0 |
| bad (mistake) | 10–20% | −1 |
| blunder | ≥ 20% | −2 |

They needed no adjustment, which is the useful finding. **At an equal position
the two scoring bands land almost exactly where the old flat ones did:**

| base eval | 3% | 6% | 10% | 20% |
| --- | --- | --- | --- | --- |
| 0cp | 33cp | 65cp | 110cp | 230cp |
| +200 | 36cp | 71cp | 117cp | 226cp |
| +500 | 63cp | 118cp | 182cp | 316cp |

— against the old `goodCp` 30 and `decentCp` 70. So this is a change of
**meaning** rather than of difficulty at equality, and the tolerance widens
exactly where the old system was wrong. That property is asserted directly
(`dev/check-storm.js` §3 solves the curve for the band boundary and compares it
against 30 and 70 within 5cp), because it is what a re-tuned `wpK` or a
mistyped threshold would quietly lose.

The old system's real defect shows up in the middle: at equality a 71cp
inaccuracy scored the same **−2** as hanging a queen. That cliff is what the
`ok` band removes.

### 16.3 What five bands changed elsewhere

* **`stormPoints` tests the SIGN, not the name.** A penalty is flat and is never
  multiplied — v0.139.0's rule, unchanged in substance — but the test is now
  `base < 0` rather than a list of verdicts, so a band added later cannot be
  given a multiplied penalty by accident.
* **`finishAnswer`'s streak follows the sign of the points earned**, for the
  same reason: one rule for five bands. A move that scored extends the run, one
  that cost ends it, and one worth nothing does neither. So `ok` holds the
  streak because zero points is what the middle band MEANS, and `unknown` holds
  it by the older argument — it is not the user's doing.
* **A pass is a `blunder`.** "I have no idea" costing less than a bad move would
  make passing the way to protect a streak, which is the one incentive this
  scoring must not create. Same cost it had when the only bad band was `miss`.
* **`storeDropOn` is the two bands that SCORE.** An `ok` answer keeps its
  position in the store: nothing was gained by it, and a move you can improve on
  is one worth meeting again.
* **The verdict line prints probability**, not "42cp behind" — a number the
  reader has to place against an evaluation they were not shown. `stormWp` gives
  one decimal under ten points and none above, because "23.4%" is a precision
  the figure does not have and the difference between 23% and 24% changes no
  verdict. The centipawn pair is still on the line below it. A loss under 0.05
  reads "level with the best" rather than "0.0% of the game", which would be a
  claim of imprecision about a move that was simply the best one.
* **The panel gets two treatments for five bands**, deliberately: it is read in
  about a second with a clock running, so the colour answers "did that score or
  cost" and the WORD carries the degree. "Inaccuracy", "Mistake" and "Blunder"
  are what every annotated game already calls these three amounts, so they need
  no explaining.
* **The review's row edges and the stats bar are one five-step ramp** — green,
  dim green, neutral, amber, red — defined once in the stylesheet, with the bar
  reading the same five tokens. Measured in the harness: six distinct edge
  colours, the bar segments identical to the edges, and no overflow at 1400px or
  360px in either density.

### 16.4 What it did to the performance record (§15)

The record counts bands, so five bands is a different record: `a/g/o/b/x/u`
replaces `g/d/m/u`, and `statsWireVersion` goes to **2** so a version-1 payload
is refused rather than misread — every field it has is a field this one also
has, which is exactly the shape of corruption that would be read without
complaint.

Two derived figures changed with it:

* **`found` is the two bands that SCORE**, not "everything that was not a
  miss". An inaccuracy is not a move found; it is "no, but it did not matter
  much", which is what the average beside it is for. Quietly folding `ok` in
  would turn the column into "how often was it survivable".
* **the average loss is in points of win probability**, stored as tenths so the
  record stays integral. An average over centipawns would have been an average
  over a quantity whose meaning changes with the position it was measured in —
  the whole reason the grade stopped using them.

### 16.5 What was NOT changed, and one open question

**The pick rules are still centipawns** — `blunderCp`, `decidedCp`,
`spreadMinCp`, `spreadMaxCp`. Those decide which positions are OFFERED, which is
a different question from what a move is worth, and every one of them is a
number `dev/probe-storm.js` measured against real courses (§6). Changing them
changes the yield and needs that probe re-run, not an argument.

But the same objection does apply to one of them, and it should be recorded
rather than discovered: **`spreadMinCp` (best − 5th ≥ 60cp) is the rule that
says "there must be something to get wrong"**, and 60cp buys less at +200 than
it does at equality — by the table above, about 15% less. So the filter admits
positions that are, in the terms the grade now uses, flatter than intended.

**MEASURED 2026-08-29, and the answer is §12.7d.** `dev/probe-storm.js` now
prints both spreads in win probability as well as centipawns, and a second
tuning grid with the rule restated in wp. The conversion is 60cp = 5.50 wp at
equality and 4.64 wp at +2.00, i.e. **16% less demanded at the band top** — so
the objection above is exactly right. The yield consequence is nil: at the
shipped threshold the two rules admit the identical number of positions on both
courses (10 and 10, 23 and 23), and the largest divergence anywhere in the grid
is two positions out of 71. Restating the rule in wp is therefore worth doing
for saying what is meant, and is not a tuning change; it should not be bundled
with a `minScored` change, whose effect is an order of magnitude larger.

**Nothing is re-graded.** The record stores the verdict the session produced, so
rows written before this change are a different claim from rows written after.
There is no re-grade available — the scored list is not kept per answer — and
the record itself is one version old (§15 shipped in v0.140.0), so in practice
there is nothing to reconcile. On a record with real history there would be, and
the honest answer would still be to leave it: a verdict is a statement about
what the grader said at the time.

---

## 17. The set: no clock, and no mistake left behind (v0.150.0)

A second exercise on the same material, and a different question. The storm asks
*what do you play in four seconds*; the set asks *can you still not find this
one*, and refuses to move on until you can.

Asked for by the author 2026-08-29: **unlimited time, and a mistake must be
retried or analysed rather than passed.** The structure below — a fixed set
cleared rather than an endless run, a second pass, and a cap of three blind
attempts — was chosen with them and is recorded here as the shape that shipped.

### 17.1 Why a SET rather than an endless run or a survival mode

Three shapes were on the table and the material chose between them.

**Endless was refused because the supply cannot keep the promise.** Finding a
position costs ~11 ChessDB requests (§6.1); a session draws from the store
(§14.11) and `nextCard` already ends cleanly when the queue empties. So an
"endless" run ends when the store runs out — its length decided by network
economics rather than by the user — and it has no finish line, which is exactly
what a mode with no clock most needs.

**Survival was refused because it contradicts the request.** Lives are a clock
by another name: they re-import the punishment the clock was providing, which is
the thing being removed. And they are incoherent beside forced correction — a
mistake cannot both cost a life and be required to be repaired. (Punishment is
also already answered: §16's five bands and the flat `missPoints` are the
storm's version, and they belong there.)

**The set is what the cost profile actually wants.** Re-asking a position
already in hand is the CHEAP operation here — §3.4's first tier grades off the
card's own scored list and costs no request at all — while a new position is the
expensive one. A mode built on repetition of the same position therefore inverts
this feature's economics in the user's favour, which no amount of arguing about
motivation would have.

### 17.2 The loop

One session is up to `setSize` (12) positions — one storm's worth of material,
so the two modes spend the store at the same rate and none of the producer's
ceilings needed a second value.

| the answer | what happens |
|---|---|
| `great` / `good` | resolved. The verdict prints with the best move, and the next position follows after `verdictMs`. |
| `unknown` | resolved. See below — this is the arm that is not `!clean`. |
| `ok` / `bad` / `blunder` | **HELD.** Nothing is scheduled and nothing advances. |

A held card offers two doors, and they differ in whether the answer comes with
them: **Try again** (up to `setRetryMax`, the best move still hidden) and **Show
the move**. Once the move is out, the two become **Next position** and
**Analyse**, which are the only two things left to do with a position whose
answer is known.

Then **the second pass**: every position not found first time is asked again, in
order, with nothing carried over. It is announced in the window's SUBTITLE
(`Course › second pass`) rather than through `setNote` — the note is cleared by
`produce`'s own finally, which `showCard` reaches one statement later, so an
announcement made there is wiped before it can be read. The subtitle is redrawn
every tick and is where the rest of what a session IS already lives (§14.21). There is no third — after a reveal the answer
is known, so a third pass would measure how long the user's short-term memory is
rather than whether they can read the position.

The score is not points. It is **how many were found first time**, which measures
the same thing every session however long it took — the one figure two sittings
can be compared on, where a point total mostly measures how many cards a clock
allowed through.

### 17.3 The one mechanical thing this rests on

**The best move is off the panel while a position is held and the answer has not
been asked for.** `stormBestLine` names the move, and a "try again" offered
underneath the move to play is a lookup, not an exercise.

This is §14.10a's rule moved from the review onto a live card, and it inherits
that rule's split exactly: the line ABOVE — the user's own move, its rank, and
how much of the game it gave up — **stays**. It is theirs, they have already seen
it, and "#6 of 31 · 13% of the game" is precisely what makes the position worth a
second attempt. A card that hid whether the move was even wrong would be a board
with no question on it.

It also inherits the *number* of surfaces that have to agree. Here there are
two rather than §14.10a's three — the panel's second line, and
`.clo-cdb--est` on it, which is a claim about where a number came from and must
not be worn by an instruction.

### 17.4 `unknown` is settled, and is not clean

`stormSetHeld` is deliberately not `!stormSetClean`, and this is the arm most
likely to be "tidied" away. An ungradeable answer is a verdict about ChessDB, not
about the user: there is no mistake to correct and no best move to reveal, so a
hold on one could never be satisfied — the user would be trapped on a position
with two doors, neither of which leads anywhere. §15's record excludes `unknown`
from both halves of its fraction for the same reason, and §16 scores it nothing.

### 17.5 The cap of three, which is not a difficulty dial

With ~30 legal moves and a first grading tier that costs no request, unlimited
hidden retries can be **searched** rather than thought about — and a mode that
allows that will get it at eleven at night. `setRetryMax: 3` is "think, think
again, then look".

Nothing enforces this beyond the button disappearing; it is not a security
boundary and does not need to be. It is a default that makes the honest use the
easy one.

### 17.6 What it writes, and what it deliberately does not

> **Superseded in part by §21 (v0.154.0).** The first paragraph below is no
> longer true: a set's first look at a position IS counted now, and §21 is the
> argument for why — the rule as written left somebody who plays sets with a
> record of nothing. Everything else here stands, and §21 is built on the second
> paragraph rather than against it.

**Nothing goes into §15's performance record.** That record counts how a
repertoire is read under the storm's own conditions — four seconds, one attempt —
and an unhurried answer with three attempts behind it is not that measurement.
§15.2's discipline is that one record with two meanings stops meaning either;
this is that rule applied before it could be broken rather than after.

**The store IS written**, and on the first answer of the first round only. §14.11's
retention rule answers "has this position taught what it can", and an unhurried
FIRST answer settles that exactly as a hurried one does — the two questions have
different subjects, and only one of them is about the clock. A retry is played
with the last attempt's verdict on screen and the second pass minutes after being
shown the move; neither is evidence about anything.

`setCleanOn` and `storeDropOn` therefore have the same membership and are written
out twice. That is on purpose: they answer "may we move on" and "has this taught
what it can", and a later change to one must be a deliberate change to the other.
`dev/check-storm.js` §11 asserts they still agree, so the duplication cannot
silently become a divergence.

### 17.7 What it cost

Almost nothing new, which was the argument for putting it here rather than
building a second exercise:

* **The grader** is `runGrade`/`gradeTiers` unchanged — the split §14.10b made,
  used a third time. The two callers differ only in `finish`.
* **The board** is section 18's storm mode unchanged. A held card is a verdict
  the session has not accepted yet (`cr.stormHold`), and the board is already
  shut behind a verdict; "try again" is `continuationStormApi.next(sameCard)`,
  which is the timed loop's own "here is the next one".
* **The two doors** are the two action buttons the panel already has. `hint` was
  hidden in storm mode (it would name the answer) and is now "Show the move" /
  "Analyse"; `skip` already meant two different things and now means three.
* **The analysis board** is section 19's, on the live card, in the set's own
  slots — `continuationStormApi.analyse`, which §14.10 built for the review.
* **The review afterwards** is §14.10's, unchanged, with the set's result line in
  its head and each row's outcome in its tooltip.

New: `CONFIG.storm`'s four values, ~250 lines in section 27, one CSS rule, and
the four pure rules `dev/check-storm.js` §11 executes.

### 17.8 A defect found on the way

`nextCard` did not clear `st.card` before deciding what to show next, so on the
path where the queue is empty and the producer is exhausted, `endSession`'s
§14.10c push saw the card just ANSWERED still sitting there and added it to the
history a second time — as `unanswered`. Every storm that ran out of positions
showed its last position twice in the review, the second time claiming it had
never been answered. Fixed with the clear, which the set needed anyway.

### 17.9 What was measured, and what was not

**Measured** (`dev/harness.html`, stylesheet cache busted, 2026-08-29):

* The mode selector is 125px and costs the settings row **24px → 54px in two of
  its seven states** (the two widest: a "Gather"/"Stop gathering" row carrying
  the ready count). Zero horizontal overflow in all seven, at 880 / 700 / 560 /
  420px and under `html.clo-touch` (32px → 70px there). The row is shown only
  when nothing is timed, and what sits under it is the review's list, which is
  `flex: 1`. Shortening the labels does not help: with the selector at 63px those
  two rows still wrap, so the row was already at capacity and any control costs
  the line.
* The held panel at 300px is **150px with a one-line action row** — shorter than
  the answered panel beside it (172px), because the masked line is one line where
  `stormBestLine` is two. No overflow at 300 or 260px, desktop or touch; the
  three-button row wraps to two lines under touch and at 260px desktop.

### 17.9a VERIFIED LIVE, 2026-08-29

Course 453453, signed-in Chrome, v0.150.0 confirmed in the startup log. **Every
behavioural claim in §17.2-17.6 was exercised and passed**, and no console error
was raised at any point.

**The hold.** `Qh4??` (hanging the queen to `Nxh4`) graded **`Blunder · 42% of
the game`**, and the card did not advance. The second line read *"Play it again —
2 attempts left, then the move is shown"* — i.e. **`stormBestLine` was off the
panel**, which is §17.3 — while the line above kept the user's own move and its
loss. Buttons: `Show the move` / `Try again (2)` / `End set`.

**Try again.** Put the position back exactly: queen returned to d8, h4 empty, 32
pieces, panel back to `Find a good move`, board accepting input. The counter
decremented `(2)` → `(1)` with correct singular/plural on the line above.

**The cap.** After the third blunder (`Qf6??`) the line read *"No attempts left —
show the move to move on"* and **`Try again` was hidden**, leaving only
`Show the move`.

**The reveal.** `best Bg7 -0.22   Qf6 -5.66   · by Stockfish d19`, with NO
`.clo-cdb--est` and the engine tooltip — §14.20's rule holding on this panel too.
Buttons became `Analyse` / `Next position`. (This also exercised §14.23's engine
tier for real, on a position ChessDB could score neither side of.)

**Analyse, and the teardown.** The analysis board opened on the LIVE held card
with the database (`Bg7 92% · 517 games`), the engine and all three writes.
Closing it with **section 19's OWN Exit** — the path the set's ticker has to
NOTICE rather than be told about — put the held card's board back with its
verdict, its revealed best line and both doors intact, and hid the db slot again.
Nothing was scored: the tally stayed `0 / 12`.

**"No idea".** In a set it is a request for the answer, as designed: verdict line
`Passed — no answer given`, best move revealed at once, revealed-pair buttons,
nothing scored.

**The second pass.** Run at `setSize: 2` (temporarily, then reverted). Round 1
asked two positions; the subtitle then became `Testing course › second pass` and
the SAME two positions were re-asked in order — identified by their best-move
lines, `best Nf6 +1.40` then `best d6 -0.14` — after which the session **ended by
itself**, the review opened, the subtitle dropped the round, and the clock froze.
Result line: `0 of 2 first time · 2 shown · 0 of 2 on the second pass`, with each
row's tooltip carrying `shown, missed again on the second pass`. Answering the
second pass correctly (playing the `Nf6` that had been shown) resolved the card
and moved on, so the clean path works there too.

**The storm is unharmed.** Same build: clock counting DOWN from 3:00, `0 pts` /
`streak 0`, `End storm`, and `No idea` scoring `Blunder −2 pts` with the best
move printed immediately and an automatic advance after `verdictMs`. No hold, no
extra buttons.

**Two things the session changed:**

* `saveStormMode` called only `syncSettings`, so picking the set left **`3:00`
  and `0 pts`** in the header — a clock and a score belonging to the other mode —
  until the first card. It calls `render()` now.
* One thing that looked like a defect and was not: a "third card" apparently
  appearing in a two-position set. The probe was reading a **hidden, stale**
  `.clo-cr-panel` — `offsetParent` is null for the `position: fixed` panel, so
  the visibility test was inverted. Recorded because the next person to drive
  this window from automation will write the same probe: test
  `getBoundingClientRect().width > 0`, never `offsetParent`.

### 17.9b Still open after the live run

* **`setSize: 12` and `setRetryMax: 3` are still guesses.** Both were exercised
  but neither was JUDGED — that needs sittings, not a test.
* Whether the second pass should re-arm the hold on a miss (§17.10).

### 17.10 Open

* **The review does not show the outcome in a column**, only in the row's
  tooltip and the head's totals. "Which ones did I have to be shown" is the
  takeaway of a set and probably wants the column — which means re-measuring the
  five-column grid §14.10 measured.
* **A mistake in the second pass ends the position anyway** (`missed`), because
  there is no third pass. Whether that should instead re-arm the hold is a
  question for somebody who has run twenty sets.
* **The set does not know about §16b's pinned mistakes.** A position missed twice
  in one set is exactly what that store is for, and the two have never been
  introduced.

---

## 18. Four things asked for after the set shipped (v0.151.0)

Four requests from the author, made together on 2026-08-30 after the first
sittings with §17's set. None of them changes the pipeline: the producer, the
store, the wire, the three grading tiers and the grade itself are untouched.

### 18.1 The verdict pause is two numbers now

**The ask:** "speed up the transition to next position after a good enough
move."

`verdictMs` (2600) was one figure for every verdict, and the pause exists for
`stormBestLine` — the SECOND line, which names the move that should have been
played, says how much the one played gave up, and (since §14.20) says which tier
decided. After an answer that SCORED there is nothing there to take in: the move
was the move. 2.6 s of reading time for a line that says "you played the best
move" is dead time in an exercise whose whole point is rhythm.

So `verdictFastMs: 1200` beside it, and **the test is the sign of the points** —
§16's own rule for the streak, applied to the pacing. That matters more than the
number: a list of verdict names would have to be revisited every time a band is
added, and §16 has already added two. One rule, five bands, and a sixth would be
covered by construction.

In a SET there are no points, so the equivalent question is `stormSetClean` —
and there the fast beat is very nearly the only one that can be reached, since a
verdict that is *not* clean holds the position and schedules nothing at all. The
slow branch is left in place for a position resolved some other way.

1200 rather than 0 or `verdictMs / 2`: a verdict that flashes is a verdict nobody
sees, and "Great move · +2" with a streak on it is worth the beat it takes to
read. `dev/check-storm.js` §12 pins `verdictFastMs < verdictMs` and
`verdictFastMs >= 800` — the two ways this fails silently, one of which inverts
the rule while every card still advances.

### 18.2 A background top-up (§14.24 in the code)

**The ask:** "add background gathering of positions wherever it makes sense. For
example when having the Storm panel open, there's no drawback of gathering
positions in the background, right?"

Mostly right, and the exceptions are exactly what `backfillOk()` is made of.
There were four real ones, and each is a way this could have cost the user
something:

1. **The request budget.** `askCdb` sets `st.exhausted` when the SESSION's cap is
   reached, and `st.exhausted` is what ends a session with *out of positions*. A
   background walk sharing that counter would end the session the user is in the
   middle of, over requests they never asked for. So it counts separately
   (`st.backfillCdb` against `backfillMaxCdb`, per WINDOW) while still adding to
   `st.cdbCount`, which is the honest total the summary prints.
2. **The pool.** `stormDrawFrontier` is destructive, so a background walk really
   can take the frontier the producer was about to need. Hence the queue clause:
   during a started session the pass runs only while `st.queue.length >=
   queueTarget`, i.e. only while the producer has stopped of its own accord. And
   everything it finds goes into the STORE, which `produceFromStore` draws from
   first — so the material is not lost, it changes hands.
3. **`st.seen`.** This is the one that would have been invisible.
   `harvestCandidates` marks every candidate seen, and `produceFromStore` filters
   on exactly that set — so a background find would have put a position in the
   store and in the same breath made the running session unable to draw it. The
   pass therefore stops at a `continue` placed AFTER the store write and after
   all four funnel counters, so §14.17's conservation is untouched.
4. **The shared pacer.** `pace('lastCdbAt', cdbGapMs)` is global, and a grade is
   up to three ChessDB round trips the user is watching. So the pass never runs
   while `solving()` or while `st.grading`.

What is left is most of the time the window is open: the pre-roll, the pause
after a verdict, a held set card being thought about, and the whole review. One
line end per pass, `backfillGapMs` between them, re-asking `backfillOk()` each
time — deliberately not a loop of its own, so a press of Start gets its bandwidth
back within one line end rather than at the end of a burst.

**It is the same `harvestFrontier`**, for §14.17.3's reason: a third walk written
for this would be a third set of pick rules to disagree with the other two. It
takes the gather pass's `gatherGamesPerFrontier` for the same reason that pass
does — nobody is waiting on it.

**`st.over` had to stop meaning "stop".** `harvestFrontier`'s games loop breaks on
`!st.running || st.over`, and `st.over` is true for the whole review, which is the
longest stretch a window is open and the single state this feature exists for. It
now breaks on `st.over && !st.backfilling`.

**`storeOnly` IS AN ARGUMENT, NOT `st.backfilling`,** in `harvestFrontier`,
`harvestCandidates` and `storeAdd` — and that was found by re-reading rather than
by a test, which is the shape to remember. `backfillOk()` refuses while
`st.producing`, but a background walk is a sequence of awaits and `showCard`
starts a producer inside one, so the two really can overlap. Read off the flag,
the PRODUCER's own harvest would then return no cards at all while a background
pass happened to be in flight — and, finding none, would go on drawing frontiers
until the pool was gone. Per call, that cannot arise. The same argument makes
`storeAdd`'s bid guard and the `backfillStored` counter per-call. `askCdb`'s
budget branch is the one that stays coarse: threading a parameter through
`askGames` and `askPgn` buys only the overlap case, and there the flag fails safe
in both directions.

**It can outlive its own window**, by up to one line end — the break above only
fires between games — and in that gap the storm can be reopened on ANOTHER
course, whose slice `st.store` now is. A position from the old course written into
it would be silent and permanent, so the pass carries `st.backfillBid` and
`storeAdd` refuses when it no longer matches.

**Bounded, and switchable off.** It spends ChessDB's volunteer compute and
Lichess's bandwidth, and a window left open all evening would otherwise walk a
whole course without anybody deciding to. `backfillStore` (60) is the real stop —
past that no session is waiting on anything and there is nothing left to buy —
with `backfillMaxCdb` (1200 per window) as the backstop. `cloStormBackfill` is
opt-OUT, the `cloLineHeadsUp` shape, on a neutral toggle in the settings row whose
LABEL carries the state.

**It says one word and no more.** The only sign it gives is `· filling…` on the
"N position(s) ready" line, with what it has found in that line's tooltip. It
deliberately does not touch `setNote` or `setStatus`: both belong to things the
user is waiting on, and a pass nobody asked for must not put a sentence over the
review they are reading. A failure is a console line and a stand-down for the
rest of the window.

### 18.3 A set of six

**The ask:** "lower the amount of positions in a set. Maybe 6 is enough."

`setSize: 12` came from §8.2's "a 3-minute storm answers about a dozen", which
turns out to be the wrong comparison: a storm's twelve are twelve positions
SHOWN, and a set's are twelve positions CLEARED, each of which may take three
attempts, a reveal and a second pass. Six is already the longer sitting of the
two. Nothing is derived from the number — `queueTarget`, `maxPositions` and
`cdbMaxPerSession` all sit far above what either mode reaches — so this is a free
change. §17.9b listed it as a guess that needed sittings rather than a test; the
sittings happened.

`dev/check-storm.js`'s bound moved with it (4..12, was 6..30), which is the point
of having the bound at all: it is a statement about what the mode IS, and it
should be re-argued when it changes rather than left wide enough to admit
anything.

### 18.4 Analyse wherever a position is being played again

**The ask:** "have 'Analyze this position' available whenever the user is
retrying a move (during and after run)."

Two states, and one of them had no way in at all:

* **The review's retry** (§14.10b). `st.retry` and `st.analysing` are exclusive —
  both want the stage's slots — and `render()` hides the whole review while either
  is up. So the button that opens the analysis board was on a surface that is not
  on screen while you are retrying: the way to a board was to press *Back to the
  review* first. That is the state most in need of one.
* **A held set card** (§17). Analyse was on `hint`, and only after a reveal.

Both are answered by the SAME button, and it is `browseBtn` — which in storm mode
has never been anything, there being no line to navigate. So no fifth control, and
Analyse does not move under the pointer as a hold goes from blind to revealed.
`stormApi.analyse()` is the dispatcher, and the dispatch belongs in section 27
because which board to open is entirely that module's state: `toggleAnalyse` for a
review row, `setAnalyse` for a held card.

**A blind hold gets it too, and the reveal is not skipped.** §17's own rule stands:
the board arrives with the engine and the database beside it, both of which name
the move within a second, so "analyse blind" is not a state that exists and the
honest version is to make the reveal explicit and counted. The tooltip says so.

**Never during a live timed card.** The panel then holds a question, and a database
whose top row is the answer is section 20's rule rather than a convenience to weigh
up. `syncStormUi` shows the button on `hold || retry` and on nothing else.

**Measured** in `dev/harness.html` at a 300px panel: the blind hold with attempts
left goes from three buttons on one row (26px) to four on two (58px) — 63 + 104 +
86 + 61 px of button against 266px of row, so four of these labels cannot fit
however they are worded. No horizontal overflow in any state. Accepted rather than
fixed: `.clo-cr-actions` wraps by design, the panel is a tall column beside the
board, and the alternative is a state that lacks the thing the request was about.
The settings row's own natural width went from ~996px to ~1130px, so it wraps to
two lines on a window narrower than about 1160 rather than about 1030; the panel
is `inset: 16px`, so this is a 1152-wide screen and not a 1366 or a 1920.

### 18.5 What was NOT verified

None of this has been through a live session — it is syntax-checked,
`dev/check-storm.js` passes at 532 with two fresh controls, and the button and row
geometry are harness measurements. Three things only a live sitting can answer:

* whether `verdictFastMs` at 1200 reads as brisk or as clipped;
* whether the background pass is actually invisible in use — in particular
  whether the shared ChessDB pacer makes the first card after a verdict feel
  slower, which the `solving()`/`st.grading` gates are supposed to prevent but
  which no test here can see;
* whether four buttons on two rows in the blind hold reads badly enough to want
  the Analyse door only after a reveal after all.

---

## 19. Uncovered responses: the other gap in a repertoire (v0.152.0)

Everything above storms the **frontier** — the position a course line ends on.
This is a second SOURCE for the same machine, and it asks about the other place
a repertoire runs out:

> The course reaches a position, answers the two most common replies, and says
> nothing about the third. What do you play against the third?

Chessable teaches a line and stops; §1's whole argument. But it also teaches a
line and covers only *part* of what the opponent may do at each point along it —
and that gap is invisible, because the line still continues past it. You never
meet it in the trainer, by construction: the trainer only ever plays the replies
the course contains.

### 19.1 Why it belongs here rather than in section 24b

Section 24b already **lists** these moves, on the course tree: "played here, not
in the course", with a share and a win rate. Section 21 offers to **add** the
missing lines. Neither answers the question this does, which is *can you
actually play the position that reply leads to* — and for most gaps that is the
cheaper answer. A repertoire cannot cover everything; what matters is whether
the uncovered half is somewhere you can think.

So it is a third thing to do with a gap, and it is the storm's own question
asked at a different place on the board. Everything the storm already has — the
grading tiers, the eval band, the pick rules, the board, the clock, the set, the
store, the wire, the review — applies unchanged.

### 19.2 The pipeline, and what it costs

Stage 0 and stage 1 are replaced; stages 2 to 4 do not exist here, and 5 (the
grade) is untouched.

**0 — the decision points.** Walk the course (the same `walkVariation` over the
same cached `fetchCourse`) and keep every position where the **opponent** is to
move that one of the user's lines plays a move from, with the set of moves it
plays there. `stormDecisions`.

**1 — the gaps.** One explorer request per decision point, `moves=30`, the
storm's own relaxed filters. Every reply not in the covered set, over both
floors, most popular first, capped at four. `stormUncoveredMoves`.

**the card.** The position after that reply. One `queryall` on it, then the
ordinary pick rules (`stormCandidate` / `stormPickReject`) and the ordinary
card (`stormCard`).

So a usable position costs **one explorer request (shared by every gap at that
position) and one ChessDB lookup**, against the frontier source's measured ~11
(§6.1). That is not the point of the feature but it is a pleasant consequence:
the store fills perhaps five times faster, and the background top-up (§14.24)
reaches its ceiling in a fraction of the time.

**It needs no game and no PGN,** so this source never touches the `lichess.org`
host permission (§14.1) — only `explorer.lichess.org`, which the extension has
read since the beginning. A user who refused that permission has a fully working
storm on this source.

### 19.3 Priority is the reply's own game count, and it is free

The instruction was "higher probability moves should be prioritised". The
explorer's reply already carries, per move, `white + draws + black`, and at the
position `white + draws + black` again — so a reply's own count *is*
`P(reach the position) × P(play the reply) × N`, i.e. proportional to how often
the user will actually face it. Nothing has to be estimated and nothing extra
has to be fetched.

It is applied twice, and neither is a new mechanism:

* **within a decision point**, `stormUncoveredMoves` sorts by it and
  `harvestUncovered` walks that order, so a session cut short by the clock has
  spent itself on the biggest gaps;
* **across sessions**, `stormPack` files the position's `g` — §14.19's
  reachability figure — as the **reply's** count rather than the decision
  point's. That is the same quantity measured one ply lower down, so
  `stormReachBucket` and `stormStoreDraw`'s existing "unseen first, then most
  reachable" order need no change at all and a stored gap comes back in
  popularity order for free.

Section 21's full conditional ranking (a product over the opponent plies' shares,
one request per ply) is still not paid for, exactly as §4 decided for the
frontier draw. The pool draw stays `n`-weighted — how many of the user's own
lines pass through the position — which correlates with depth and so prefers the
early, common decision points.

### 19.4 The two floors

`uncMinShare` (3%, a user setting) and `uncMinGames` (20, a constant). They are
not one rule twice:

* a **share** is what makes a reply worth preparing for. It means the same thing
  on move 3 and on move 15, which an absolute count does not.
* an **absolute count** is what makes the share mean anything. Three per cent of
  forty games is one game, i.e. a spelling mistake rather than a reply.

The share is the setting because "the third most common move" and "anything
anybody has ever played" are two different exercises, and which is wanted is a
judgement (§14.9's argument for the ply range, which this replaces in the
settings row — a ply range is meaningless here, an uncovered position being
always exactly one ply past the reply).

`uncMaxPerPosition` (4) is the third bound and a different kind: a position with
fourteen uncovered replies is one the course barely covers at all, and storming
all fourteen would spend a session inside a single decision point.

### 19.5 What the covered set includes, and what may be a source

The asymmetry §14.18 established, in its second home, and it reads the same way:

|  | may be a SOURCE | counts as COVERAGE |
|---|---|---|
| an ordinary line | yes | yes |
| a PAUSED line | no | **yes** |
| a CUSTOM-FEN line (tactics, model game) | no | **yes** |
| a line whose colour the course does not state | no | no |

"Does this course answer this reply" and "is this line one to storm from" are
different questions. A paused line answering 1...c6 is still the course
answering 1...c6, and asking what the user plays there would be asking about a
move their own book has.

And the reply's **child** is checked against §14.18.4's continuation index as
well, which catches the case the covered set cannot: the course may answer the
position that reply leads to by another **move order**. Free — the index was
built by the same walk that found the decision point.

### 19.6 Whose move it is, again

A decision point is an **opponent**-to-move position, and that is the rule this
feature would be worthless without. On the user's own move an uncovered popular
choice is a repertoire DECISION (1...c5 over 1...e5) — section 6c's rule, 24b's
reason. Drop the guard and the storm starts asking the user to improvise against
the lines they deliberately chose not to play, which reads as the course being
full of holes.

Whose move it is comes from the **line** (`sideOf(v.color)`), never from
`courseSide` — 24h's rule, for 24h's reason.

### 19.7 One store, two sources

They share everything storage-shaped: one `cloStormPositions` key, one course
slice, one retention rule, one tombstone list, one wire card, one `storeMax`.
An entry carries `u: 1` and its share `sh`; absence means "a frontier position",
which is what every entry written before v0.152.0 is — so nothing needed
migrating and no cache key needed bumping.

`stormFilterSource` narrows the store to one source, and it is a **filter on the
input** rather than a term in `stormStoreDraw`'s comparator: §14.15 is explicit
that a reordering there is silent from the outside, and it composes with
§14.21's chapter scope the same way.

`storeCount()` — the chip beside Start, the background pass's ceiling, the
summary — is source-scoped, because every one of its readers is asking "how many
are ready for the exercise I am about to do". `storeTotal()` is the wire's, which
carries both.

### 19.8 Two records, and the tab

"It can have its own stats tab", and the reason it must is §15's own: *which
part of my repertoire do I not understand* is the question, and

> how often do I find a decent move one move past my book

and

> how often do I find one against a reply my book never answers

are two different answers about the same chapter. A merged figure would hide
exactly the interesting case — a chapter that is solid past its own line ends
and hopeless against what it does not cover.

So a course record grows a second map, `ulines`, beside `lines`. Everything that
iterates one now iterates `STAT_MAPS`, the cap in `stormStatsPrune` is **per
map** (a long uncovered record must not delete a frontier line's history), and
the stats view gets two tabs, opening on the record for the source being
stormed.

The wire needed **no version bump**: `statsWireVersion` stays 2, `lines` is
still `lines`, and a payload with no `ulines` is a device that has answered no
uncovered positions — which is true. An older build reading a newer payload
ignores the map it does not know and, because `stormStatsMerge` only ever adds,
never deletes the newer device's copy of it.

### 19.9 What is shared, which is nearly all of it

Two one-line dispatchers, `poolFor` and `harvestOne`, are the whole of the seam.
Unchanged and unaware of the source: the producer, the gather pass, the
background top-up, the queue, `st.seen`, section 18's board, all three grading
tiers, the win-probability bands, the streak, the set (§17), the retention rule,
the tombstones, the store's wire, the review, the retry, the analysis board, the
chapter scope, and §15's counters.

Changed for wording only: the panel's second line (`stormGapNote`, top level for
§14.7's reason — section 18 prints it live and section 27's review prints it
afterwards), the review row's tooltip, the subtitle, the funnel's two nouns, the
summary's cost line, and the refusals.

### 19.10 The settings row

`Mode` then `Source` then the setting that belongs to the source — the ply range
for the frontier, the share floor for this one, never both. Changing the SOURCE
during the pre-roll **restarts** the session, because the pool, the queue and the
store draw are all of the other kind; that costs no fetch, the course listing
being in the session cache. Changing the share floor does not: it decides what a
HARVEST offers, and everything already found was found under whichever floor was
in force then. Said in the tooltip rather than implied.

### 19.11 What was measured, and what was not

**Executed** (`node dev/check-storm.js`, §13, and four controls each failing on
exactly its own assertions): the opponent-to-move rule, the castling spelling,
the popularity order, the two floors, the cap, an unresolvable SAN, the
paused/custom-FEN asymmetry in both directions, the continuation index riding
out, the store split, the pack/unpack round trip including the reach figure, the
wire round trip and an old payload's absence of `u`, the two records not being
pooled, the per-map cap, and the panel's two sentences.

**Measured in the harness** (`node dev/serve.js`, 2026-08-30). The settings row
is 858px wide in the harness card and 52px tall on BOTH sources with no
horizontal overflow — against 54px for the pre-v0.152.0 row, i.e. the row
already wrapped to two lines and the wrap point simply moved. Under
`html.clo-touch` it is 68px on both, and at a 316px row (a 420px viewport) 160px
on both, still with no overflow of its own. The stats header with its two tabs
is 29px desktop, 82px touch, 84px at 420px, no overflow; the tab pair is 211px.

**Not measured.** No live run yet. In particular:

* **the yield per decision point.** A repertoire's own positions are far more
  likely to be inside ChessDB's book than a frontier's continuations are (§3.2's
  98% is over real continuations, and these positions are one ply off a main
  line), so the `unknown` rate should be much lower — but that is an argument,
  not a number.
* **how many decision points a real course has, and how many have a gap at 3%.**
  Both are one `--frontiers`-shaped probe away and neither is known.
* **whether the pick rules reject differently here.** The eval band is applied to
  the CANDIDATE rather than at stage 0 (there is no cheap stage-0 eval to reject
  a whole line with — one explorer request already answers every gap at the
  position), and a position one ply out of a book line is flatter than one eight
  moves past a frontier, so `spreadMinCp` may bite harder. §12.1's open question
  in a new place.
* **the shallow end.** At the start position a Black repertoire's uncovered
  replies are 1.c4, 1.Nf3 and so on — real gaps, and the pick rules ought to
  reject most of them for flatness. Ought.

---

## 20. The opponent's move in front of the analysis board (v0.153.0)

Asked for after §19 shipped: *when analysing a position, it would be nice if the
previous move (the opponent's) was included — this way, when using "Add as
puzzle/variation", that move is part of the variation. It also gets easier to
see the connection to the repertoire.*

### 20.1 What a storm card is missing

A storm card is a middlegame position with no moves in front of it. The board
already **tints** the squares of the move that led there (`applyStormArrival`,
and the review's mini board does the same) — that was §14.10's answer to "a card
has to be readable in about a second" and it is enough while the clock is
running. It is not enough once the position is being worked on:

* **The write.** "Add as puzzle" (19d) writes the analysis board's start
  position as the new variation's `initialFEN` and our moves after it. Opened on
  the card's own position, that card begins *after* the opponent's move — so the
  puzzle asks "what do you play here" with the thing being answered off screen.
  With the move in front of it the puzzle reads the way every human-written one
  does: the opponent plays, you answer.
* **The reading.** A position eight plies past a line end is hard to place. The
  move that produced it is most of what ties it back to the repertoire, and in
  the analysis board's own move list it is *written down* rather than being two
  tinted squares.

"Add as variation" (19c) still refuses on a storm position — it needs a `source`
variation to splice onto and a storm position belongs to none — so the write
this actually changes is the puzzle. That is not a reason to leave it: the
puzzle is the write the user named, and it is the one that works here.

### 20.2 It is 24g's mechanism, not a new one

The course tree already opens the analysis board one ply behind and plays a move
in: `openAnalysis`'s `playUci`, for exactly the same reason —

> The move the board was opened ON, played as the line's first ply. Not a
> different start position: the comment an added line goes into hangs off the
> move BEFORE it, so the start must stay where the course's own last move left
> off and this one has to be part of the line.

So the whole of this feature on the section 19 side is two fields in the `given`
object, and section 19 needed no change at all.

### 20.3 The one thing that had to be plumbed

`stormAdvance` already returns `arrived: { san, uci }` — the move that led to
the position. What it did not carry is **the position that move was played
from**, and that is the one field of an arrival which cannot be recomputed
later: a capture loses the captured piece, so a FEN cannot be un-played.

Four places fill it in, and all four were free:

| where | source of the `before` |
|---|---|
| `stormAdvance` | the `fen` it was handed — every ply of both walks |
| `stormWalkGame`'s fast-forward | a new `lastFen`, the one ply the walk plays *before* the loop begins |
| `stormFrontiers` | `walkVariation`'s last ply already carries `before` |
| `stormDecisions` / `harvestUncovered` | `stormAdvance` again, from the decision point |

The second is the interesting one. The ply that *arrives at* the frontier is
played in the fast-forward that finds the frontier in the game, not in the walk
proper — so it is the one `before` a naive implementation loses, and it is the
one that matters most, since the frontier's own card is the first the user sees.

### 20.4 The store, and what it costs on the wire

`a` grew a third element. Locally that is ~60 bytes on a ~700-byte entry and
nobody notices.

On the **wire** it is ~60 of an entry's ~450 characters, so an exchange carries
about an eighth fewer positions. It rides anyway, for §14.19's reason and at a
higher price: it is not re-derivable on the far device, and the alternative —
stripping it — is a device that received its positions by sync quietly getting a
different feature from the one that gathered them. The budget check is on the
encoded size, so the cost is *fewer positions carried*, never a failed exchange.

No `wireVersion` bump. A payload written before v0.153.0 has a two-element `a`,
which `stormUnpack` already reads as "not known" — and an entry with no lead-in
simply opens the board on the card's own position, exactly as every entry did
until now.

### 20.5 The lead-in is proven before it is taken

`analysisGiven(card)` does not trust the stored field. The move must resolve on
the earlier position **and** the resulting position must be this card's own
(compared on `cacheKey`); anything else falls back to the card position with one
console line.

That is not defensiveness for its own sake. `before` is a *stored* field: the
store outlives builds, is merged from other devices, and is the one input here
that a future change to `stormPack` could put out of step with `f`. A mismatched
one opens the board **a ply short with the wrong side to move** — a board that
looks entirely plausible and is about a position the user never saw. It is this
feature's one silent failure and it costs two lines to make impossible.

### 20.6 What was measured

**Executed** (`node dev/check-storm.js`, 610 assertions): that every position
both walks offer carries a `before` which, with its move played, really lands on
that position; that the frontier's own arriving ply carries one too; that
`stormAdvance` names the position it played from; that the store round trip
keeps it and that a pre-v0.153.0 two-element `a` — and one with an empty third
element — read as *no lead-in* rather than as an empty-string FEN; and that it
survives the wire pack, the unpack, and still reaches the position afterwards.

**Five controls, run 2026-08-30**, each failing on exactly its own assertions
and no others:

| control | fails |
|---|---|
| `stormAdvance` loses `before` | 5 |
| the fast-forward forgets `lastFen` | 1 |
| `stormPack` drops the third element | 2 |
| `stormFrontiers` forgets `lastFen` | 1 |
| the wire strips the third element | 3 |

The second and fourth are worth their single assertions: each is the *first*
card of a whole class of session (a real-game walk's frontier, an invented
line's), and each is invisible from everywhere else — the other cards of the
same session are fine.

**Not measured.** No live run. In particular: what the puzzle written from a
lead-in board actually looks like in the course (19d's move-**pair** fold now
starts on a black-first pair whenever the user is White — which is a shape the
fold already handles and CLAUDE.md already calls normal, but "already handled"
is an argument), and whether the analysis board's own move list numbering reads
right when the line starts on the opponent's move (`renderMoveList` has the
ellipsis form for exactly this and it is used by both existing hosts).

---

## 21. A set's answers go into the record (v0.154.0)

Reported: *I played a set of uncovered replies — but it never showed up in
stats.*

Not a defect in §19's plumbing: the uncovered record (`ulines`) is written,
merged, pruned, carried and rendered exactly as the frontier one is. The cause is
§17.6, one line up from the store write it sits beside — **a set wrote nothing to
§15's record at all**, on the argument that a record counting four-second answers
must not also count unhurried ones.

### 21.1 The rule was right about the risk and wrong about the cost

§15.2's discipline is real: a percentage that mixes two conditions without saying
so means neither. But the price of keeping it was not the one §17.6 assumed.

* **The set is not a footnote.** It is one of the two exercises the window
  offers, chosen from a selector in the same row as the source. Somebody whose
  practice is sets has an empty record — a feature that measures nothing, on
  material they have been through.
* **The argument shrinks under inspection.** §17.6 objects to "an unhurried
  answer with three attempts behind it". Restricted to the FIRST attempt of the
  FIRST round, there are no attempts behind it, and the difference reduces to the
  clock alone. §17.6's own second paragraph already says this about the store:
  *"an unhurried FIRST answer settles that exactly as a hurried one does — the
  two questions have different subjects, and only one of them is about the
  clock."* The record's subject is "did I find a decent move here", which is not
  about the clock either.
* **The scoring rule is identical.** Both loops grade through `runGrade` /
  `gradeTiers` and land in §16's same five bands. What differs is the condition,
  not the arithmetic — which is a thing to *label*, not a reason to keep two
  records.

### 21.2 What was rejected

**A parallel counter map (`sv` beside `dv`).** The honest separation, and it
touches `stormStatSum`, `stormStatRoll`, `stormStatsMerge`, `stormStatsPrune`,
`stormStatsWirePack`, `stormStatsWireUnpack` and every reader of the table — each
of which is somewhere a mistake would be a plausible number. It also produces two
half-empty tables, which answers "which chapter am I weak on" *worse* than one
that is full, and would need a mode selector beside the two source tabs: six
states of a panel that had two.

**Silent mixing.** Recording set answers into the counters and saying nothing.
Cheapest, and exactly what §15.2 forbids.

### 21.3 What it is: one integer, and it is a label

`stormStatBlank` gains `s` — *how many of `n` were answered without a clock*.

```
{ n, a, g, o, b, x, u, ls, lc, s, t }
```

It follows every rule the counters beside it already follow: per device, summed
on read, `stormStatPlus`'d when records fold together, replaced wholesale by the
merge's `max` on `n`, forced to a number by the wire unpack.

**It is never a term.** Nothing divides by it. `stormStatRate` and
`stormStatLoss` are byte-identical with and without it, and
`dev/check-storm.js` asserts that directly — a rate that moved when an answer was
unhurried would be the one way this change could quietly alter a figure it is
only supposed to describe.

### 21.4 What a set records, and what it still does not

The two write points are **the two places that already write the store**, under
the same guard:

| where | when |
|---|---|
| `finishSetAnswer` | `entry.attempts === 1 && st.round === 1` — the first blind attempt |
| `setGiveUp` | `entry.attempts === 0 && st.round === 1` — "no idea", before any attempt |

That is a rule worth stating as one sentence: **the set records exactly what the
store records, and for the same reason** — it is the one thing that happens to a
position which is evidence about whether the move was known. A retry, the second
pass and a reveal are not evidence about anything, and none of them reaches
`statNote`.

A pass is counted in the worst band, as it is in the timed loop. "I have no idea"
is the most informative thing this record can be told about a position, and a
pass that cost nothing would make it the cheap way to keep a record clean.

**A review retry (§14.10b) is still not counted**, and that is a different case
rather than an inconsistency: it is a position played again with the answer
already on screen. `statNote` is called from `finishAnswer` and the two set
points, never from the shared `runGrade`.

### 21.5 Where it shows

Two places, because a tooltip alone is no answer on a touch device:

* **Above the tables**, one faint line rolled up over every course on screen —
  *"12 of 40 answered in a set, without a clock; 28 against the storm's own four
  seconds."* It is a caveat about the meaning of every figure below it, so it
  goes before the first of them and not after the last.
* **On each row's `n` cell**, the same sentence for that row — a course, a
  chapter or a line can be entirely one condition while the panel as a whole is a
  mixture, and that is precisely when the caveat above is least use.

`statUnhurriedNote` is the one writer of both, and it answers `''` when every
answer was timed — so a record with no sets in it is byte-identical to the
pre-v0.154.0 panel.

The caveat wears `.clo-st-scopenote`'s vocabulary (faint, 12px) rather than
amber: nothing is outstanding and nothing is wrong. The numbers are simply saying
how they were made.

### 21.6 The wire

`s` rides with **no `statsWireVersion` bump**, which is §19's precedent applied
unchanged: a payload written before v0.154.0 has no `s`, that reads as `0`, and
`0` means *all of these were timed* — true of every answer any earlier build ever
counted.

The other direction is safe by the merge's own rule. An older device re-packing a
newer one's record drops `s`, but a device only ever writes its own counters and
they only grow, so `theirs.n > ours.n` is never true of a round trip through
somebody else's card: the copy that comes back cannot displace the original.

### 21.7 What was measured

**Executed** (`node dev/check-storm.js`, 624 assertions): that a timed answer
does not increment `s` and a set answer does; that `n` is unaffected; that
`stormStatRate` and `stormStatLoss` return *identical* values for a record whose
answers were unhurried and one whose were not; that `s` sums through
`stormStatPlus`; the three shapes of `statUnhurriedNote`'s sentence; and that `s`
survives the wire while a payload without one reads as all-timed.

**Four controls, run 2026-08-30**, each failing on exactly its own assertions:

| control | fails |
|---|---|
| `stormStatApply` ignores the flag | 2 |
| `stormStatPlus` does not sum `s` | 1 |
| the wire unpack drops `s` | 2 |
| `s` is added to `stormStatRate`'s denominator | 1 |

The last is the one worth having. It is the only way this change could make a
number wrong rather than absent, and it is invisible from the outside — every
percentage would still be a percentage, and still move in the right direction.

**Measured in the harness** (`node dev/serve.js`, 2026-08-30). The caveat is
400x28 desktop / 434x30 under `html.clo-touch` — two lines, clamped by
`max-width: 60ch` — and it costs the LIST, not the panel: the stats body is a
`flex: 1` scroll container, so hiding the line changes its height and nothing
else. Zero horizontal overflow in all eight states measured (858 / 700 / 560 /
420px of panel, desktop and touch).

### 21.8 VERIFIED LIVE, 2026-08-30

Course 453453, set of six on the uncovered source, both write points exercised in
one session.

**Before:** the Uncovered replies tab read *"Nothing recorded yet on this
source"* — the report reproduced exactly.

**The session:** one card passed on ("No idea" → `setGiveUp`, graded `blunder`),
one answered with a real move on our own board (…Nf6 → `finishSetAnswer`, graded
`ok`, "Inaccuracy · #5 of 10 · 7.0% of the game").

**After:**

```
Uncovered replies
All 2 answered in a set, without a clock.
Course                found   avg lost   n
Testing course          0%       7.0%    2
```

Four things that could only be seen here: the answers land in `ulines` and not in
`lines`; `found` is 0% because neither band scores, which is the intended
reading and not an absence of data; `avg lost` is 7.0% — the Nf6 answer alone,
the pass having no loss to sum, which is `stormStatApply`'s "only ever summed
where there is one" doing its job; and the caveat renders in both hosts, above
the tables and in each row's `n` tooltip.

**Noticed, not changed.** Pressing Stats in the same beat as "End set" did
nothing, and a press a moment later worked. `endSession` clears `st.card`
synchronously, so this is a race with the teardown render rather than
`toggleStats`'s guard, and it predates this change.

---

## 22. Clearing the gathered positions (v0.155.0)

Asked after §20 shipped: *will the analyse-with-the-prior-move work on positions
gathered before the fix? If not, is there a way to clear gathered positions? If
not, add one.*

**No, it will not.** §20's `before` is a stored field and it is the one thing
about an arrival that cannot be recomputed — a capture loses the captured piece,
so a FEN cannot be un-played. An entry written before v0.153.0 has a two-element
`a`, `stormUnpack` reads that as "not known", and `analysisGiven` falls back to
the card's own position. It fails softly and correctly; it just does not do the
new thing.

And nothing else fixes it. The store's own retention rule drops a position only
when it is answered WELL, the producer serves the store before it walks anything
(§14.11), and §14.16's tombstones are about retirement rather than shape. A
position gathered in August is served in October exactly as it was written.

### 22.1 Why a button rather than a migration

**Dropping the shapeless entries at load** was the first idea and is wrong: it
is a silent deletion of ~11 ChessDB requests a position, unasked, for a feature
the user may not care about. Worse, §14.16's determinism means they would be
re-harvested by the next pass — so the cost is paid whether or not anyone wanted
it, and the only visible sign is a session that suddenly has nothing ready.

**A blunt clear is the honest shape.** The store is expensive, the decision to
throw it away is a real one with a real price, and the user is the only one who
can weigh it. That is what an armed button is for.

It is also the answer to a question larger than §20. A stored position keeps the
shape it was written in, and the fields a later build adds it does not have.
§14.19's reachability figure was the same story (mitigated by reading absence as
"unknown"), §19's `u` the same again, §20's `before` the third. This is the first
one that could not be papered over, and it is the last time it needs its own
argument: there is a way to start again now.

### 22.2 What it does, and the three things it does not

`clearStore()` empties this course's slice of `cloStormPositions` and writes it
back. That is all.

| left alone | why |
|---|---|
| the tombstones (§14.16) | they record positions answered WELL, which is knowledge and not gathered material. Keeping them is what stops a re-gather walking the user back through everything they have already learned. |
| the performance record (§15) | a third subject again — how the repertoire was READ. Throwing away the positions must not throw away what they taught. |
| every other course | one store, keyed by `bid`, and the window is about one course. |

**Both sources**, because there is one store. The ready chip beside the button is
source-scoped and would report a clear as partial, so the button's own sentences
carry `storeTotal()` and say "both sources" in as many words.

**Refused while a gather is running**, in words rather than by stopping it: that
pass writes into the very object this empties, and "cleared, then re-filled by
the thing you had already started" is a state nobody asked for. The BACKGROUND
top-up (§14.24) is deliberately not refused — it is not something the user just
started, and what it puts back is written in the current shape, which is the
point of clearing.

### 22.3 The control

Two presses, section 13's shape: `Clear positions` → `Clear positions?` →
cleared, with `clearArmMs` (4 s) and the arm dropped by anything that takes the
button off screen — a confirm the user can neither complete nor see they owe is
section 9's own rule.

Neutral outline, `.clo-st-sync`'s vocabulary. The green in this window is spent
on "storm" and "gather", the two things it is FOR, and this is the opposite of
both. The armed state is the only time it is coloured, and then it is amber —
`--clo-attention`, "you have something outstanding", which a confirm waiting for
its second press is. Never red: nothing is wrong.

`saveStore` now DELETES an empty slice rather than writing `{}`. Only a clear (or
a course whose every position aged out) can produce one, and in both cases the
honest record is that the course has nothing stored — not that it has a store
containing nothing.

### 22.4 What was measured

**In the harness** (`node dev/serve.js`, stylesheet cache busted, 2026-08-30),
across all seven settings-row replicas and eight width/touch combinations:

| panel width | without | with | 
|---|---|---|
| 858px desktop | 52,54,52,54,52,52,52 | identical |
| 858px touch | 68 ×7 | identical |
| 700px desktop | 52 ×7 | 82 on two |
| 560px desktop | 80 ×7 | 110 on three |
| 420px desktop | 110 ×7 | identical |

Zero horizontal overflow in every state. So it costs **nothing at the width the
window actually is** — it is `inset: 16px`, so on a desktop the row has 858px and
more — and one wrapped line at intermediate widths, which is §17.9's finding that
this row is at capacity and any control costs the line. The armed button is 112px
against 105px idle, so the confirm does not reflow the row.

### 22.5 VERIFIED LIVE, 2026-08-30

Course 453453, and it closed §20's live gap as well.

* The button read *"Throw away the 48 position(s) gathered for this course, both
  sources…"* with 13 ready on the current source — the two numbers doing exactly
  what they are for.
* One press armed it: `Clear positions?`, `rgb(217,169,66)`.
* The second cleared it: *"49 stored position(s) cleared…"* — 49 rather than 48
  because the session's own producer had stored one more while the button was
  armed.
* It PERSISTED: closing and reopening the storm logged `store holds 1
  position(s) for 453453` against `48` on the open before it, so the write went
  to `chrome.storage.local` and not merely to `st.store`.
* The 1 was a position the producer found after the clear — and starting a set on
  it, passing, and pressing Analyse opened section 19's board reading **"Move 1
  of 1 · 8.Nf3"**, with `8.Nf3` in the move list and Black to play. That is §20
  working end to end on a freshly gathered position, which is the whole reason
  this button exists.

**Not verified.** The write that follows — whether "Add as puzzle" from that
board produces a course variation starting on the position before 8.Nf3. The
move list IS what 19d writes, so this is sound by construction, but it is not a
measurement.

### 22.6 A clear has to be SYNCED (v0.156.0)

Reported straight after §22 shipped: *if you clear positions then sync, it seems
to reset the clear.*

It did, and the reason is §14.12's own, one step along. **A cleared position
leaves no tombstone** — deliberately, since a tombstone here means RETIRED
(§14.16) and would block the very re-gather a clear is asking for — so it is
simply ABSENT. And absent is exactly what a union merge fills in from the other
device:

```
for (const ck of Object.keys(remote)) {
  if (gone[ck]) continue;
  if (!local[ck]) { local[ck] = remote[ck]; added++; }   // ← the clear, undone
}
```

Clearing and then syncing is the ordinary sequence, not a corner, so the button
shipped able to be silently reversed by the next exchange.

#### The mark, not 48 tombstones

The tempting fix is to tombstone everything cleared. It is wrong for the reason
above: `stormDone` reads that list as a RETIREMENT HORIZON of `goneDays` (60),
so the positions the user cleared in order to have them gathered again would
become the positions that cannot be gathered again for two months. It is also
the wrong shape — a clear is one act, not N.

So: **a per-course high-water timestamp**, `st.clearedAt`, living in the same
per-course record as the tombstones (`cl`) because it answers the same question
about a different kind of absence. `clearStore` stamps it and SAVES it there and
then — a clear the tab does not outlive would otherwise be a clear that never
happened anywhere else.

#### It is applied in BOTH directions, and that is the feature

```
const cleared = Math.max(localCleared, remoteCleared);
// a LOCAL entry older than the mark is dropped   → the clear propagates
// a REMOTE entry older than the mark is not taken → the clear holds here
```

One direction alone would only defend the device that pressed the button; the
other device would keep its pre-clear positions, keep serving them in its own
sessions, and keep offering them across (harmlessly, but for ever). Merged by
`max` and taken back into `st.clearedAt`, so the mark is learned once rather
than re-argued on every exchange.

An entry's `t` is its original gather time and survives the wire unchanged
(`stormWireUnpack` keeps `e.t`), so this compares like with like.

`wiped` is counted apart from `dropped`: the sync's sentence reads the latter as
"already learned elsewhere", and "thrown away on purpose" is not that news.

#### What it costs

**Clock skew.** A position gathered on a device whose clock is behind, moments
after a clear on one whose clock is ahead, is dropped and gathered again. That is
a handful of requests at worst, and the alternative — a counter — needs an
authority neither device has.

**Everything gathered before the clear, everywhere.** That is the intended
reading rather than a cost: the user cleared because positions written in the old
shape are stale, and positions written in the old shape are precisely those with
`t < clearedAt` on every device.

No `wireVersion` bump. A payload with no `cl` reads as 0, i.e. "nothing has been
cleared" — true of every payload written before v0.156.0, and valid in both
directions. `stormWirePack` sets it before the budget loop so its bytes are
inside every measurement.

#### What was measured

**Executed** (`node dev/check-storm.js`, 639 assertions): the reported bug itself
(a position cleared here does not come back from the other device, while one
gathered since the clear does); the other direction (a clear on the other device
drops this one's pre-clear positions, counted as `wiped` and never as `dropped`);
`max` in both orders; a tombstone still winning over a newer-than-the-mark
position; the mark riding the wire and coming back; and a payload with no mark
behaving byte-identically to the pre-v0.156.0 merge.

**Three controls, run 2026-08-30**, each failing on exactly its own assertions:

| control | fails |
|---|---|
| the merge ignores the mark (the bug as reported) | 7 |
| only the remote side is filtered (defends, does not propagate) | 2 |
| the mark does not ride the wire | 2 |

**NOT verified live.** The carrier course for syncing is not chosen on this
profile — the Sync button answers *"Choose a course for syncing on the options
page first"* — and setting one up writes a new informational card into one of the
user's own courses, which is their choice to make and not a test fixture. So the
merge is proven by execution and the plumbing around it (`st.clearedAt` through
load, save, pack and `syncStore`) is not.

**Already-restored positions are not repaired retroactively.** Anyone whose clear
was undone by a sync before this fix has those positions back in their store;
clearing again is what removes them, and this time it holds.

---

## 23. Stockfish scores the position at gather time (v0.158.0)

**The grade stops coming from ChessDB.** §12.3b asked whether a `learn=1` score
was good enough to grade with and answered "yes, and nothing should be widened".
§12.3c — below — asked a sharper question of the same data and found the one
place where it is not: the number every verdict in a position is measured
against.

### 23.1 §12.3c — the anchor, measured (2026-08-30)

`dev/probe-cdb-quality.js` gained the arithmetic; `dev/anchor-report.js` reads
several engine passes as one sample; `dev/probe-anchor-depth.js` is the
re-search that settles which source is wrong. **50 storm survivor positions,
387 moves**, Stockfish 18 full build at 4-6 threads, depth 18-24 (median 23).

A verdict is `loss(m) = best(P) − score(m)`, so an error on `best(P)` is paid by
every other move in the position while an error spread evenly over the whole
position cancels. The statistic that isolates it:

```
excess = (cdb − eng) on ChessDB's own top move
       − median (cdb − eng) over the other moves sampled there
```

offset-free by construction, and a different question from the residual §12.3b
already reported.

```
signed, ChessDB − engine (+ = ChessDB more optimistic)
  ceiling gap  best vs best   median   +4   p75  +22   max  +48
  error on ChessDB's top move median   +8   p75  +24   max  +55
  error on every other move   median   −4   p75   +3   min  −81
  EXCESS = top − rest         median  +11   p75  +26   max +105

  anchor optimistic by  >=25cp 14/50   >=50cp 5/50   >=100cp 1/50
  anchor pessimistic by >=25cp  1/50   >=50cp 0/50   >=100cp 0/50
```

**Fourteen to one.** Not noise about the anchor — a bias, and generous to
nothing else in the same position.

**What it costs.** Correcting the anchor alone, keeping every one of ChessDB's
own move scores:

```
VERDICT BAND        as shipped     anchor corrected
  same band          287  74%        342  88%
  same outcome       313  81%        349  90%
  of 100 disagreements the anchor alone explains 70   (breaks 15 that were right)

  engine says great/good, ChessDB says ok or worse:  27  (7%)  — 18 restored
```

So ChessDB's per-move scores are fine and the ceiling they are measured against
is not.

**Three findings, and each closes a reading of the first one.**

1. **The mechanism is a winner's curse.**
   `rho(moves ChessDB scored, excess) = 0.559`, and the buckets are monotone:

   ```
   moves ChessDB scored   pos   median excess   bands agree
     6-9                   36        +3            78%
     10-14                  7       +16            77%
     15+                    7       +50            57%

   ChessDB and engine agree on best move   41 pos   median excess  +5
   they disagree                            9 pos   median excess +26
   ```

   The anchor is a *max over noisy estimates*, so whichever move's score is most
   inflated is the one that ends up on top, and more candidates means a higher
   max. The bias therefore has to be positive, has to grow with the candidate
   count, and has to be worst where the two sources disagree about the best
   move. All three hold. **It is structural in a min-maxed graph and cannot be
   tuned away.**

2. **The bias is ChessDB's, not the arithmetic's.** A max is inflated whoever
   computes it, so selecting the anchor by the ENGINE and running identical
   arithmetic is the falsification test:

   ```
   excess, ChessDB-selected anchor   median  +12   p75  +26   >=25cp: 14/50
   excess, engine-selected  anchor   median   −4   p75   +5   >=25cp:  2/50
   ```

   Near zero, slightly negative — the signature of `ChessDB = engine + noise`
   rather than of two comparably noisy evaluators.

3. **Depth does not rescue it.** The 15 positions with |excess| ≥ 25, re-searched
   at **depth 30** restricted to the two or three moves the question is about:

   ```
   median gap on ChessDB's top move, depth ~23:  26cp
   median gap on the same move,      depth 30:   24cp
   median movement of the engine's own eval:     −1cp   (+ = towards ChessDB)
   agrees with ChessDB MORE in 6 of 15, LESS in 7;  moved >=20cp towards it: 1
   ```

   A coin flip and no drift — and the worst cases are the ones that move least:
   `Nf6 cdb −19 / d23 −74 / d30 −74`, `Bb4 cdb −11 / d23 −63 / d30 −74`. Six more
   plies and Stockfish is where it was.

**What this does NOT overturn.** §12.3b stands everywhere else: 78% of moves
within 25cp, the fill-ins still marginally better than the book entries, and the
dangerous direction still empty — **zero** moves scored good by ChessDB that the
engine calls a mistake or blunder. The failure is harshness, not flattery, which
is why this was worth fixing rather than urgent.

### 23.2 The cost, measured (2026-08-30)

`dev/probe-gather-cost.js`, on `CONFIG.engine`'s own DESKTOP profile — 4 threads,
64MB hash, not the machine's core count:

8 storm survivor positions, median **37 legal moves** each:

```
cell          median      p90      8h yield
  8PV d20      41.5s     48.3s        694
 12PV d20      59.9s     72.4s        481   (the shipped width)
 16PV d20     103.2s    114.2s        279
 allPV d18     70.3s     82.6s        410
 allPV d20    180.1s+   180.1s+       160   (did not finish inside the cap)
  8PV d24     140.5s    159.2s        205
  1 move d20    4.3s   max 6.8s        —
  1 move d24   19.1s  max 23.8s        —
```

⚠️ The AGREEMENT half of that run is missing and the table printed `n=0` for
every cell: `search()` returns a Map of uci -> cp since the per-depth rewrite of
§23.5, and the caller was still reading `.cp` off it, so every score was
`undefined`. Fixed 2026-08-30; the timings above are from the run that had it
and are unaffected. **So how much a verdict actually moves between depth 18, 20
and 24 has NOT been measured** — depth 20 was chosen because it is the depth
this feature has graded at since v0.134.0, not because the cheaper cell was
shown to agree with the dearer one.

**12 is where the curve is still flat** — 50% more moves than 8 for 44% more
time, where 16 costs 149% more than 8 — and 481 positions a night is more than
`storeMax` 900 needs in two sittings.

Two things decide the design. **Depth 24 costs 3x depth 20**, and the storm has
graded its own third tier at depth 20 since v0.134.0 — so depth 20 is the
existing standard rather than a new one. And **a move outside the stored list
costs 3.7 s, not a refusal**, so the width buys latency rather than coverage of
the verdict.

### 23.3 What was built

A gather now has **two phases**: the walk (unchanged, network-bound, bounded by
`gatherTarget`) and a **deepen pass** that replaces a stored position's ChessDB
list with a Stockfish one. One position is deepened between frontiers so a pass
stopped early leaves positions that are ready to play; the second phase then
runs until the store has none left, which is the half meant to be left running.

**It is a second pass over the store, not a step inside `storeAdd`.** That is a
decision: `storeAdd` is synchronous and returns the boolean §14.17's funnel
counts, and its four outcomes must account for every candidate examined —
threading a 50-second search through it would make that invariant depend on an
engine. Separating them also upgrades the positions ALREADY stored rather than
stranding them, interleaves network work with CPU work, and leaves a coherent
store at every moment.

**A position that has not been deepened is still perfectly usable.** It grades
exactly as it did before this existed and says so. So nothing waits for the pass
and it never has to finish.

**The tiers change shape rather than growing one.**

| stored list | move in it | move not in it |
|---|---|---|
| ChessDB (`d` absent) | tier 1, as before | ChessDB child, then two searches |
| Stockfish (`d` set) | tier 1, exact | **one** search of the reply |

Two consequences worth stating on their own:

* **ChessDB's child tier is unreachable on a Stockfish list, and that is not an
  optimisation.** `best(P)` from Stockfish minus `best(P after m)` from ChessDB
  is precisely the cross-evaluator subtraction §3.4 forbids, and the offset it
  would inject is the same size as the bias measured above.
* **The engine tier halves.** It exists as two searches because it knows neither
  side; with a stored anchor at a known depth it is one search of the reply,
  capped at that same depth — same evaluator, same depth, by construction. That
  also removes §14.23's unsatisfiable arithmetic, where two searches had to fit
  inside one budget.

**ChessDB keeps everything it is good at.** The walk's stop rules, the pick
rules, `minScored`, the uncovered-reply source: all coarse questions about
whether a position is INTERESTING, asked ~11 times per position at 380 ms and
unaffordable any other way. Every yield number in §6 is untouched.

### 23.4 The list's depth is the whole compatibility story

`d` on a stored entry means "`m` is a Stockfish list searched to this depth".
**Its absence means ChessDB's list**, which is exactly what every entry written
before v0.158.0 holds — so no cache key moved, nothing migrates, and §22's Clear
is not needed. It rides the wire for the reason `g` and `a[2]` do and with no
`wireVersion` bump: absence is already meaningful in both directions.

It **must** ride, and it is the one field here worth crossing devices for at all:
the search costs tens of seconds of CPU and a phone cannot run it, so a desktop
that has deepened a position is the only way that phone will ever grade it with
an engine. The merge therefore takes the deeper list — **with its moves**, since
a depth without the scores it was measured on is a lie about every number in the
entry — and never lets a shallower one displace a deeper one, or a device that
has done the work loses it to one that has not.

### 23.5 One iteration, never the union of several

`latest.pvs` in `engine/engine.js` is cumulative across iterations, so a wide
search ended early — by a budget, by a stop — flushes lines from TWO different
depths. A scored list whose moves were searched to different depths puts a
cross-depth difference into every verdict computed from it, invisibly, exactly
as §3.4's cross-evaluator mixture would, and `msg.depth` cannot show it (it is
multipv 1's).

So `pv.depth` was added, updates are collected per depth, and the answer is the
**deepest complete iteration** — which is also what drops the partial iteration
a stop interrupts. `dev/probe-gather-cost.js` hit the same bug from the other
side during its smoke test and reported "MultiPV 8, 12 moves, reached depth 1";
that is what this looks like when it is visible, and on a stored list it would
not have been.

### 23.5a Live verification (2026-08-31, course 453453, Claude in Chrome)

Driven through a real gather and three sets. What the console showed:

* **Per-request MultiPV reaches the worker.** `sl…-1 ended in phase list after
  36307 ms · position depth 20 of 20` — a wide search, tagged `sl`, at the
  requested depth. The worker rebuilds the analyze message field by field, so
  `multipv`/`sanPlies` had to be added there too; without that fix it would have
  stored three-move lists in silence.
* **The budget takes the deepest complete iteration rather than discarding it**
  (§14.23's rule on the new path): `deepen taking <fen> at its deepest complete
  iteration — it did not reach depth 20 within 120000 ms`, followed by
  `answered … position depth 18 of 20`. In the browser at 4 threads a 12PV
  search regularly wants more than 120 s, against 59.9 s median in node — so
  this budget does real work, and §23.2's figures are a floor.
* **The store is written and upgraded in place**: `1 of 4 … now carry an engine
  list` → `2 of 10` → `4 of 10`, across three passes.
* **Stopping the pass stops the search inside it**: `gave up — sl…-2 ended in
  phase list after 69650 ms`, on the press.
* **The legacy path is unchanged**: `graded d7d5 by list`, the panel reading
  "· ChessDB's ranking here" with `.clo-cdb--est` set.
* **The engine tier still works**: `by Stockfish d18`/`d19`, `est` false.
* **AND IT HALVES ON A DEEPENED POSITION.** `st…-1 ended in phase child after
  8002 ms · position depth 19 of 20, reply depth 17` — one 8 s phase budget,
  entered directly in `child`, the position's depth 19 coming from the store.
  The equivalent grade on an undeepened position logged 16002 ms and both
  phases.

That last one exposed a wording bug: the engine tier's tooltip said "two local
Stockfish searches" when only one had run. `oneSearch` now rides the verdict and
`stormSourceTitle` has a sentence for each, asserted with a control.

NOT observed: a move that lands INSIDE a stored Stockfish list (`sflist`). Four
of ten positions carried one and every move played fell outside it — which is
itself a small datum about a 12-move list. The three lines that produce it are
covered by `dev/check-storm.js` §14.

### 23.6 What is NOT done

* **The background top-up (§18.2) does not deepen.** It runs while a review is
  up, and a 50-second search started there would hold the engine claim that a
  review retry's own grade needs — which would fail as "the engine is already
  claimed", i.e. a silently ungraded retry. Positions it finds are deepened by
  the next gather.
* **The width is 12 and the case for it is latency, not correctness.** Every
  measured cell grades correctly; a narrower list simply reaches the one-search
  path more often. `allPV @ d18` costs about the same as `12PV @ d20` and would
  make grading free on every device for ever, at two plies of depth — an open
  trade, and §12's kind of question rather than a decision to take here.
* **Nothing is re-measured on a mobile profile.** A single search at 2 threads
  on the lite build is certainly slower than the desktop's 3.7 s, and how much
  slower is what decides whether the width should differ per device.
* **Whether the pick rules should move too.** `minScored`, `spreadMinCp` and
  `spread5` are still ChessDB's, and they decide which positions are OFFERED —
  a different question from how a move is graded, and every one of them is a
  §6 measurement that would have to be re-run.

### 23.7 One depth for every device, and no truncation (v0.159.0)

v0.158.0 shipped the deepen pass with `armEnginePhase`'s rule borrowed whole
from the GRADING tier: a per-position budget (`deepenPhaseMs` 120 s) after which
the search was **taken** at its deepest complete iteration, and a depth target
that differed per profile (20 desktop, 18 mobile). Both are wrong here, and the
reason is the same for both.

**A stored list is a STANDARD, not an answer.** The grading tier's budget rule
is right because a user is watching a clock: a depth-17 evaluation delivered now
beats a depth-20 one delivered after the card is gone, and the answer is used
once and discarded. This list is used for as long as the position is in the
store, is what every later grade of that position is measured against, and
crosses devices on §14.12's wire. Nothing downstream can see how deep it is
except `d` — so a truncated list is not a cheaper version of the answer, it is a
**different one wearing the same field**. The two failure modes it produces are
both silent:

* a depth-13 list from a slow phone sitting beside depth-20 lists from a desktop
  in one store, with §16's bands applied identically to both;
* the same position graded differently on two devices, with neither able to say
  why.

So: **`deepenDepth` is a scalar 20**, and a search that does not reach a complete
iteration at it is **abandoned**, not stored. It is below both `PROFILES`
ceilings (30 desktop, 25 mobile), so engine.js's `Math.min(pendingDepth,
prof.depth)` never lowers it and a phone really does search to 20 — what a phone
pays is TIME.

**And time is what stops being budgeted.** There is no total cap. What replaces
it is a PROGRESS watchdog (`deepenStallMs`, 20 min): a search is cut only when
it has stopped producing iterations, never for being slow. On the lite build's
two threads a single depth-19 → 20 iteration can take many minutes on a sharp
middlegame position, and cutting that is exactly the truncation this removes.
`job.bestDepth` advances at the START of every iteration (multipv 1 lands
first), so the gap between advances IS one iteration — the right granularity,
and it is re-armed on the advance rather than on every update, or a search
re-flushing the same iteration would look like progress for ever.

The lower half of the safety story is engine.js's own `SEARCH_SILENCE_MS` (15 s
with no output at all ⇒ respawn), which sees every worker LINE including the
`currmove` chatter this side never hears about. So a dead worker is caught there
in seconds and the stall watchdog only has to cover the shape that one cannot
see: a worker that is alive, answering, and getting nowhere. `stopGather` is
always the escape hatch, and it already kills the search it is inside.

#### 23.7.1 Two things the strict rule cost

**The completion trigger had to move.** It was `job.bestDepth >= job.depth` —
multipv 1's depth, which bumps at the START of an iteration. Under the old
lenient rule that was harmless: the search ended and `finishEngineList` fell back
to the last whole iteration. Under the strict one it would have ended every
search one line into the target iteration and then refused the position for
being one short — i.e. the feature would have stored nothing at all, on every
device, while looking like it was working. It is now the deepest COMPLETE
iteration (`deepestCompleteList`), which is both the trigger and the answer.

**A finished search may be narrower than an earlier iteration.** engine.js's
parser drops a line whose score came back `lowerbound`/`upperbound`, so the last
iteration can carry eleven of twelve moves while the one before it carries all
twelve. Refusing that throws away a completed depth-20 search over one missing
line — many minutes of a phone's work. So `deepenPickDepth` relaxes **width**,
and only once the engine has stopped (`ended`, i.e. a `bestmove` flush), never
depth: `deepenMinMoves` is the floor and the target is still the target. It is
unreachable while a search is running, so nothing is ever cut short to get there.

The whole rule is one pure function, `deepenPickDepth(job, ended, C)`, separated
from `finishEngineList` for exactly that reason — see §14 of the verification
list. Controls run 2026-08-31, each failing on exactly its own assertions and no
others: the pre-v0.159.0 rule (take the deepest complete iteration, whatever it
is) → 7; the width test dropped, so an iteration in flight counts as complete →
5; `deepenDepth` restored as a per-profile map → the config read throws.

#### 23.7.2 A list below the standard counts as not done

`undeepened`'s test was `e.d > 0` — *does this entry carry an engine list at
all* — which was the right question while the depth could legitimately vary by
device, and is exactly the wrong one now. A depth-18 list written by a phone
before this rule existed would otherwise be the one thing a gather pass can
never fix: it is not ChessDB's, so nothing re-scores it, and the only route to
depth 20 would be another device happening to deepen the same position and the
merge preferring it.

So the test is `e.d >= deepenDepth`, and `>=` rather than `===` because a search
may overshoot (the profile ceilings are 30 and 25) and a deeper list is not
something to redo. `deepenedCount` uses the same comparison, so the two halves
of the end-of-pass line cannot disagree about what is outstanding — which is
also why that line stopped saying "still on ChessDB": a below-standard entry is
not on ChessDB, it is simply not finished.

The consequence for an existing store is that the next gather **upgrades it in
place**. Nothing needs clearing, and the miss counts, reachability figures and
arrivals on those entries are untouched — `deepenOne` overwrites `m` and `d` and
nothing else.

#### 23.7.3 What it costs, and what it does not

A position that cannot reach depth 20 is **refused**, and refused positions keep
whatever list they already have — a ChessDB one, or none — and are offered again
by the next gather pass (`st.deepenFailed` is per-pass and in memory). So the
worst case is a phone that gathers all night and stores nothing, which is
visible: the end-of-pass line says how many of the store carry an engine list,
and every refusal names its position and the depth it reached.

The progress note gained the **elapsed time on the current position**, and the
tick stopped painting the gather note over it. Both are consequences of removing
the cap: a search with no ceiling that is getting nowhere looks exactly like one
that is nearly finished, and the elapsed figure is the only thing on screen that
separates them. The old code called `setGatherNote()` on every poll while
`st.gathering`, which repainted over `setDeepenNote` — tolerable at a two-minute
cap and not at all now.

**Not measured:** how long depth 20 at 12 PV actually takes on the lite build's
two threads. §23.6's third bullet is unchanged and is now the question that
decides whether a phone should gather at all — the honest advice until it is
answered is to gather on the desktop and let §14.12's wire carry the lists over,
which is what that field exists for.

## 24. The screen stays on while a gather runs (v0.161.0)

**Asked for directly, 2026-08-31: "when gathering positions on mobile, is there
any way we can keep the screen active?"** There is, and it needs nothing this
project has to have a conversation about.

### 24.1 Why the gather in particular

A gather is the one pass here with nobody touching anything. It walks frontiers
for minutes, and since §23 it then sits on a Stockfish search for tens of
seconds a position, writing after each one. It is explicitly the pass a user
"leaves running and walks away from" — that sentence is already in the code, as
the reason the sync push at the end happens unasked.

On a phone that is exactly the shape of a pass the screen timeout kills. A
hidden Android tab has every timer clamped to ~1 s (the same clamp section 12's
driver popup exists to escape, and the same one that livelocks the Lichess panel
under automation), and may be discarded outright under memory pressure. So the
hour the user thought they were spending buys whatever had been written to the
store before the screen went off — which, because `saveStore()` runs after every
position, is not nothing, but is not what they asked for either.

### 24.2 The mechanism, and why it is this one

`navigator.wakeLock.request('screen')`. It is a plain DOM API, reachable from a
content script like any other, and it costs **no manifest permission** — which
is the whole reason it is the answer. The alternatives all do cost one, or worse:
a looping silent `<video>` is a hack that browsers keep tightening, and an alarm
or a service-worker keepalive does not keep a SCREEN on at all, which is the
thing being asked for.

chessable.com is https, so the secure-context requirement is met.

### 24.3 Three ways it can be unavailable, all fail-soft

The pass runs exactly as it did before in every one of them, and says one line
in the console:

* **No API at all.** Every Chromium fork is a candidate — the Android side of
  this project is a fork, and that is where `chrome.windows` turned out to be
  missing (section 12's `openDriverSurface` fallback, ground-truthed on Lemur
  2026-08-10). Guarded by feature-testing `navigator.wakeLock.request`, not by a
  browser test.
* **A Permissions-Policy header from Chessable.** The feature's default
  allowlist is `self`, so a top-level chessable.com document is allowed as
  things stand; a header could withdraw that at any time and the request would
  reject with `NotAllowedError`.
* **A request made while the document is hidden**, which rejects by spec.

None of the three is a `warn`. All are ordinary, and none costs the pass
anything.

### 24.4 The rule that makes it actually work

**The browser drops the lock whenever the document goes hidden, and never puts
it back by itself.** This is the part an implementation gets wrong: without a
`visibilitychange` listener re-requesting it, one glance at another app ends the
lock for the rest of the pass — and from the outside that is indistinguishable
from the feature not working at all.

So `wakeWanted` is the INTENTION and the listener is what re-states it.
`takeWakeLock()` is a no-op unless a gather is still running, so the listener
needs no condition of its own beyond `!document.hidden`.

### 24.5 Scoped to this pass alone

Not a timed session: someone is watching that one and touching the screen, and a
storm is bounded by its own clock anyway.

And above all **not §14.24's background top-up.** That pass runs in the window's
dead time, counts its requests separately so it cannot end the session the user
is in, and yields to everything — holding a phone awake for a quiet trickle is
the opposite of what it is for.

### 24.6 What it does not do

It is a screen-timeout fix and nothing more. It does not stop Android evicting
the tab under memory pressure, and on some devices the screen still dims (the
spec leaves dimming to the implementation). If a gather has to survive being
backgrounded, that is a different and much larger question — and the store being
written after every position is the answer that already exists for it.

### 24.7 What is not verified

The live phone. Everything here was checked on the desktop build; what a live
Android session has to answer is whether the lock is granted on the user's own
browser at all (24.3's first two cases), and whether the screen genuinely stays
on for the length of a real pass rather than dimming to nothing.

---

## 25. Transpositions: the coverage key, and the store that outlives the course (v0.162.0)

Reported after §19 had been played for a while:

> There's an issue with intuition storm — uncovered responses: transpositions. A
> specific move order might not be covered, but the position might have
> transposed into a covered position. We need to avoid these positions.

§14.18.4's rule was already meant to answer exactly this — `stormReentered` asks,
of the board one ply past an unanswered reply, whether the course plays a move
from it. Two things were wrong with it, and neither is visible from the outside:
a card whose position the repertoire covers looks exactly like a card whose
position it does not.

### 25.1 The key could not see a transposition

The index and the lookup were both `cacheKey` — placement, side, castling **and
en passant**. And a transposition is *precisely* the case where the last move
differs:

```
1.e4 e6 2.d4 c5   ->  ... /3PP3/8/PPP2PPP/RNBQKBNR w KQkq c6 0 3
1.e4 c5 2.d4 e6   ->  ... /3PP3/8/PPP2PPP/RNBQKBNR w KQkq -  0 3
```

Same board, same rights, same side to move. The double pawn push is the last move
in one order and the move before it in the other, so one FEN carries an ep square
and the other does not — and `cacheKey` calls them two positions. So a repertoire
holding both a French and an e6-Sicilian was asked "what do you play against
2...c5?" about a board it answers with 3.Nf3.

`stormCoverKey` is placement + side + castling, en passant dropped, and it is the
only key the continuation index is built or read with. Everything else stays
`cacheKey`: the store key, a frontier's identity, `st.seen`. This is not "what
position is this", it is "does the course say anything here".

**Castling stays.** A king that has moved and come home leaves the same placement
and a genuinely different position — section 11's reasoning about the review FEN,
in the one place here where the FEN is exact enough to act on. Only the field that
records the *previous move* is dropped.

**The cost is one-sided and stated.** A position whose only difference from a
covered one is an *available* en passant capture now reads as covered and is not
offered. That is the direction to be wrong in: the complaint is positions offered
that should not have been.

Measured (`dev/probe-transpositions.js`, 2026-08-31, over all three courses on the
account, every legal reply at every decision point):

| course | replies examined | caught by `cacheKey` | caught only by `stormCoverKey` |
|---|---|---|---|
| 291847 | 11314 | 4 | **1** |
| 453453 | 8159 | 2 | **1** |
| 455941 | 978 | 0 | 0 |

So the exact key was missing between a fifth and a third of the transpositions it
was there to catch. Small in absolute terms — and the storm only ever offers the
*popular* replies, so the live figure is smaller still — but it is a card the user
cannot tell from a real one, which is the whole reason this is worth a key of its
own rather than a note.

The same probe answers the other half of the question and answers it "no": zero
decision points on any of the three courses are **split** by ep alone, so two
routes to one board always did share a covered set. `byPos` therefore keeps
`cacheKey` for identity, and §12.3's measurement about the course tree holds here
too.

### 25.2 The store is dealt from before the course is read

The bigger half, and it is structural. §14.11's whole point is that
`produceFromStore` runs **before** the course listing arrives, so a stored position
is offered with **no coverage test at all** — the harvest's check applies to
positions found *now*, and the store is full of positions found weeks ago by a
gather pass, possibly on another device.

That would be tolerable if a repertoire were fixed. It is not, and the reason it
grows is *this feature*: the user is shown a gap, goes away, adds the line — and
the storm keeps asking them the same question for ever, because the position is
still sitting in the store. The positions most likely to be covered by now are
exactly the ones already acted on.

`dropCoveredStored()` is the sweep. It runs the moment the course has been read
and the pool exists — from `startSession` (after `st.pool = frontiers`) and from
`gather` (before a single request is spent, and before the deepen pass puts tens
of seconds of Stockfish into a position that is about to go).

* **One rule, both sources.** A frontier position is a board a real game walked to
  and an uncovered one is a board one reply past a decision point; the question
  asked of each is the same — does the course now play a move from it, on this
  position's own side? That is `stormReentered` with the walk taken out.
* **A plain deletion, never a tombstone.** §14.16's list means "answered well,
  retired for sixty days". This position was never answered and taught nothing.
  If the lines come out again it is re-harvested by the ordinary walk, which now
  applies the same rule at the same key — so the two cannot disagree.
* **It sweeps what was already dealt.** `st.storeQueue` and `st.queue` are filtered
  by the same keys; `st.seen` is deliberately left alone, since those keys should
  stay unaskable for the rest of the session, which is what it is for.
* **It does not touch `st.card`.** Nothing is shown before Start (§14.13) and
  `gather` has already ended whatever was running, so the only path that beats the
  sweep is a Start pressed during the course fetch. Taking the board out from
  under a card whose clock is running is a worse answer than one stale position.
* **No write of its own.** `storeDirty` is set and the existing flush carries it.
  A tab closed in between simply sweeps again next time.
* **No pool, no sweep.** Where the course could not be read at all the session
  still plays its stored positions (`startSession`'s own "not fatal where the store
  has positions" branch); a rule applied against nothing is worth less than the
  store.

### 25.3 What was checked

`dev/check-storm.js` §16, twenty assertions, and the fixture is a real
transposition rather than a hand-built pair of FENs — the two lines above, walked
by the shipped `stormDecisions`. Controls run 2026-08-31, each failing on exactly
its own assertions and no others:

* `stormCoverKey` reverted to four fields -> **8** (three about the key, five about
  the sweep, which then finds nothing to do)
* `dropCoveredStored` returning 0 -> **5**
* the sweep's side guard removed, so a position is dropped when either colour
  answers it -> **2** (and note the second: a record with no `c` must stay, because
  a sweep that guessed whose move it is would delete positions on a coin toss)

The whole pre-existing suite passes unchanged at both keys, which is the other
thing worth knowing: nothing outside this rule depended on the coverage index
being exact.

### 25.4 What is not measured

**How many stored positions a real store loses on the first sweep.** It is the
number that would say how big the complaint actually was, and it cannot be got at
offline — it needs the author's own store and a course read. The console line
naming the count is where it will show up on the first live run.

**Whether a walk should stop at a transposition the course answers later.** The
uncovered source is one ply deep by construction, so this only concerns the
frontier walk, where §14.18.4 already stops at the first covered position. A walk
that leaves the book and comes back three moves on is not stopped and probably
should not be — the improvising happened.

### 23.8 The deepened half is dealt first (v0.163.0)

Reported by the author, 2026-08-31: *"I did some testing after I had gathered a
bunch of positions, but when I started the storm all I got was ChessDB
evaluations."*

Nothing was broken. §23.3 built the deepen pass as a **preference over the
store**, not a property of it: a gather deepens one position between frontiers
and then works through the rest, so a store is normally only *partly* deepened —
§23.5a's own live run went `1 of 4` → `2 of 10` → `4 of 10` across three passes.
The draw order knew nothing about it, so a session dealt from the whole store at
random and a store 40% deepened opened on a ChessDB verdict three times in five.
Which is precisely what the author saw, and there was nothing on screen to
distinguish it from the pass having done nothing at all.

§23.3 says a position that has not been deepened is *"still perfectly usable"*
and that *"nothing waits for the pass"*. Both stay true. What was missing is that
the two are not equally *valuable*: one costs tens of seconds of CPU and grades
against a real search, the other is ChessDB's ranking with the bias §23.1
measured. When only one of them can go first, it should be the one that was paid
for.

**A term in `stormStoreDraw`, second of four.** §23.3 recorded the pass as
"deliberately NOT a filter or a term in `stormStoreDraw`", on §14.15's argument
(a re-weighted comparator there is silent) and §14.21's (filter the input, never
the order). The first still applies and is answered the way §14.19's own term
answered it — the function is pure and rnd-injected, and `dev/check-storm.js`
executes it, with four controls below. The second does not apply at all: §14.21
is about a *scope*, which is a narrowing and belongs on the input. This is a
preference among positions that are all wanted, which is exactly what an order
is for. A filter here would be the wrong shape twice over — it would strand an
undeepened store with nothing to play.

```
(a.k - b.k) || (b.deep - a.deep) || (b.reach - a.reach) || (a.r - b.r)
```

**Never above `k`.** §14.15 is a rule about starvation, and this term put in
front of it reintroduces exactly that: a deepened position missed twice would
open every session ahead of everything unseen, for as long as it kept being got
wrong — v0.130.0's hardest-first order, arriving by a different door. The
retention rule is what keeps the deepened set churning (a position answered well
leaves the store), and that only works if unseen positions still come first.

**Above `reach`.** §14.19 asks how often anybody *meets* the position; this asks
how well the answer can be *graded*. Both are real, and the request settles the
tie: the CPU has already been spent on one of them.

**A boolean, and `d > 0`.** Not the depth itself — a raw depth in the comparator
would make the order deterministic inside the group and take away the variety the
random term exists for, which is §14.19's own argument for a bucket rather than a
count, one field over. And `d > 0` rather than `undeepened`'s `d >= deepenDepth`:
those answer different questions. That one asks whether a list is up to the
standard the pass writes, which is right for deciding what to **search** (§23.7);
this asks whether the position will grade with an **engine**, which a depth-18
list from an older build does just as much as a depth-20 one. Using the stricter
test here would sort a perfectly engine-scored position back in among ChessDB's.

**And it is said on screen.** The ready chip now reads `10 position(s) ready · 4
engine-scored`, with the fraction and what it means in its tooltip. The ordering
alone is invisible — a gather that walked plenty and deepened few looks exactly
like one that deepened plenty — and the whole complaint above was a user with no
way to tell the two apart. The clause is printed only when the count is non-zero:
on a store the pass has never touched, "· 0 engine-scored" would be a reproach
for a pass that may simply not have been run yet. `storeScored()` is
source-scoped for `storeCount()`'s reason — it is a fraction *of* that number and
the two must be about the same set.

#### 23.8.1 Controls (2026-08-31)

Every failure here is the family's usual silence: the term dropped, or placed
wrongly, still returns every position in a plausible sequence and the session
simply grades by ChessDB while looking exactly as it should. Each control fails
on exactly its own assertions and no others:

| control | fails |
|---|---|
| the term dropped altogether | **3** |
| the term put in front of `k` | **1** (`the failure count still outranks it`) |
| `d >= deepenDepth` in place of `d > 0` | **2** |
| the term put below `reach` | **2** |

The fixture's deepened entry carries `g: 3` **deliberately**. With no figure it
would read as UNKNOWN, which §14.19 puts in the *top* reach bucket — it would
then tie with the reachable undeepened entry and the deepened term would decide
by default, so the assertion about where the term sits would pass however it was
placed. The first draft of this block had that bug and its fourth control came
back green.

#### 23.8.2 What is not done

**The deepened count is not a gate on Start.** A session on a wholly undeepened
store is a legitimate thing to want — it is what every session before v0.158.0
was — and the chip now says what it will be.

**The background top-up (§18.2) still does not deepen**, for §23.6's reason, so
positions it finds sort behind until the next gather reaches them.
