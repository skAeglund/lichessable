# TODO — intuition storm (section 27)

## ⚠️ RUN OF 2026-08-29 — READ THIS FIRST

Block 1 was run overnight and **all six parts landed**, on `master`, one commit
each. Nothing was reverted. Every check in CLAUDE.md's Verification section is
green (`check-storm` 467 passed, plus the nine others and `check-contracts`).

```
c988ca6  Storm one chapter of a course (v0.148.0)                         part 6
f95c6b0  Say which of the three graders answered, and drop a dial …       parts 4+5
09b9204  Ask first about the line ends real games actually reach          part 3
e498993  Print the FENs the minScored decision is about, …                part 1
3084f1a  Stop the storm walking back into your own repertoire             part 2
```

### FOR YOU TO CHECK LIVE

Nothing below was seen in a signed-in Chessable tab — the whole session ran on
`dev/check-storm.js`, `dev/harness.html` and two live probe runs. In rough order
of how likely a problem is:

1. **A chapter-scoped storm end to end** (v0.148.0). Open the tree → storm →
   stats → *Group by chapter* → open a chapter → **Storm this chapter**. Check
   that the subtitle names it, that the positions really are from that chapter,
   that *Storm again* keeps the scope, and that *Storm the whole course* drops
   it. The starvation path is the one most worth poking: pick a chapter with one
   or two lines and see whether the refusal reads as an explanation.
2. **The grading-source label** (v0.147.0). It is on the second line of the
   verdict; the engine tier should read `· by Stockfish d20`, wear no dimming
   and carry a tooltip naming the depth. The engine tier only fires where
   ChessDB can score neither the move nor its child, so it may take a few
   deliberately odd moves to see one.
3. **The reachability figure** (v0.146.0). Hover a review row: the tooltip
   should end with e.g. `· 100-999 games at the line end`. A gather pass's
   console breakdown should print a `line ends by how often they are reached:`
   table. Positions already in your store carry no figure and say
   `reach not recorded` — that is correct, not a bug.
4. **The walk re-entry stop** (v0.145.0). Look for
   `your own course answers this position` in a gather's `walks stopped on:`
   table. If it never appears on a course with transposition stubs, the index is
   not reaching the walks.

### STILL ONLY A PROBE OR A LIVE SESSION CAN ANSWER

* **Block 3** — engine-tier timing per profile. `engineTimeoutMs` 20 s and
  `gradeTimeoutMs` 30 s are still estimates, and part 4's new label makes an
  engine-graded card identifiable at a glance, which helps.
* **Block 2** — whether a `learn=1` fill-in is good enough to grade with. Part
  4 makes this legible from real use (the review now says which tier answered
  each row) but does not measure it.
* **The `minScored` decision itself.** Part 1 set it up; it is yours to take —
  see `DESIGN-intuition-storm.md` §12.7c, where the 21 FENs are written down.

---

Written 2026-08-28, after reading `DESIGN-intuition-storm.md` end to end against
`CONFIG.storm` and the module in `content/lichessable.js`.

**Ordering is by PRIORITY, not by independence** — unlike `TODO-testing-notes.md`,
whose blocks were ordered by how self-contained they were. Each block is still
meant to be pasted as-is into a future session, with pointers so the session does
not have to re-find the code.

Nothing here is implemented. Most of it is already written down somewhere in
`DESIGN-intuition-storm.md` as an open question; what this file adds is the
ranking, and the two or three places where the design doc's own estimate of the
cost is **too high** — those are blocks 1.2 and 1.3, and they are the reason
block 1 is block 1.

The reasoning for every item lives in the design-doc section named beside it.
This file does not repeat it.

---

## 1 — THE NEXT SESSION (the prompt is at the bottom of this file) — **DONE (v0.145.0–v0.148.0)**

Written to be run **overnight, unattended**, so it is ordered cheapest-and-highest-
value first and every part is independently shippable with its own version bump.
Nothing in it blocks on the author; the one item that is genuinely a judgement
(1.1) is written up as a report rather than asked about.

* **1.1** ~~prepare the `minScored` 6 → 5 decision (§12.7b)~~ — **DONE, report
  only, no version bump** (commit `e498993`). `dev/probe-storm.js` gained the
  dispute dump and the win-probability columns; both courses were run at §6.1's
  own seeds and written up as `DESIGN-intuition-storm.md` **§12.7c**, with the
  21 FENs recorded. Headline: 291847 is 10 → 25 survivors (§12.7b's 2.45x
  again), **453453 is only 23 → 29**, so the multiplier is a property of the
  course rather than of the setting. `CONFIG.storm.minScored` is UNCHANGED, as
  instructed. *Not verified: nothing to verify — no extension code changed.*
* **1.2** ~~stop a WALK re-entering the repertoire (§14.18.3)~~ — **DONE
  (v0.145.0)**, §14.18.4. The estimate in §14.18.3 was wrong by the cost of one
  property lookup, exactly as this file predicted. Controls: the rule reverted
  → 5 failures, the side-scoping guard removed → 3. *Not verified live: how
  often it actually fires. Its funnel row is `your own course answers this
  position`.*
* **1.3** ~~weight frontiers by real reachability (§4 stage 0)~~ — **DONE
  (v0.146.0)**, §14.19. The totals ARE in the reply (verified by `curl` first,
  on both the lichess and the masters path, with the storm's own `moves: '0'`),
  so the part went ahead. Four controls, 4/1/2/1. *Not verified live: the
  tooltip and the gather's new table.*
* **1.4** ~~say which tier graded the card~~ — **DONE (v0.147.0)**, §14.20.
  Four controls, 1/4/4/1. Harness measured at 300/320/360/880 px in both UI
  modes: overflow 0 everywhere, one wrapped line at the 300px minimum.
* **1.5** ~~delete `sampleFrontiers`~~ — **DONE (v0.147.0)**, folded into part
  4's commit as instructed.
* **1.6** ~~STRETCH: storm a chapter~~ — **DONE (v0.148.0)**, §14.21. Not
  reverted: the gate (parts 1–5 committed, every check green, context to spare)
  was met, and it finished to the same standard — two pure filters, three
  controls (3/4/3), harness replicas updated and measured. **It is still the
  part most worth your eye**, since none of it has been seen in a live session.

---

## 2 Measure whether a `learn=1` fill-in is good enough to grade a move

§12.3, and it is the feature's core claim. Most cards are graded by tier 1, and
§12.7b established that tier 1 scores exactly the ~5 moves whose CHILD is in
ChessDB's graph — so the grade for a human's arbitrary move is very often a
number computed on the spot by a source of unmeasured strength.

**Rank this above every UX item below.** If the spread is wide, §16's five bands
are measuring the wrong thing and no amount of interface work matters.

> The probe is already specified in `DESIGN-intuition-storm.md` §12.3: **20
> positions, ChessDB `learn=1` fill-in score vs the local engine at depth 30,
> report the spread.**
>
> Build it as a mode of `dev/probe-storm.js` (or a `dev/probe-cdb-quality.js`
> beside it) rather than a new pipeline: the walk already produces exactly the
> positions in question, and `cdbScored(fen, 1)` is already in that file. The
> engine half cannot run in node — `engine/` is a WASM offscreen document — so
> either shell out to a local Stockfish binary if one is available, or dump the
> FENs plus the fill-in scores and drive the comparison from the extension's own
> engine in a live session.
>
> Report the DISTRIBUTION of |fill-in − engine| per move, not a mean: what
> matters is how often it is wrong by more than a band width (§16.2 — 33cp at
> equality is the `great`/`good` boundary), not the average error.
>
> Sample the moves a HUMAN would play, not the whole legal list. §14.8 is
> explicit that the probe cannot ask this by walking real games, where the move
> is known by construction; take the top ~8 by ChessDB rank plus a few plausible
> developing and capturing moves.
>
> If fill-ins turn out to be poor, the answer is NOT to widen the bands — it is
> to reach the engine tier more often, which is a `gradeTiers` change and wants
> §8.1a's timing (block 3) done first.

---

## 3 Time the engine tier per profile

§8.1a, and the doc flags it in capitals: `engineTimeoutMs` 20 s and
`gradeTimeoutMs` 30 s are **estimates, not measurements**, chosen when
`engineDepth` went from a flat 14 to 20 desktop / 18 mobile in v0.134.0.

The failure is silent and total: a watchdog that fires degrades the tier to
"No verdict" every single time, which is strictly worse than searching shallow
because it then grades nothing at all. It is also the tier reached only where
ChessDB said nothing — the least-informed grade in the feature.

> Measure **wall time for `stormEngineLoss` per engine profile** over a session's
> worth of fallback grades, and **how often the watchdog fires**.
>
> `stormEngineLoss` is two searches under ONE watchdog (`engineTimeoutMs` is
> armed when the job is created and never re-armed between phases), so time the
> PAIR, not a search. `endEngineJob` is the one place the engine is given back —
> log there.
>
> Mobile at depth 18 on the lite build's 2 threads is the one with no margin.
> **If it fires at all often on mobile the fix is a lower mobile depth, not a
> longer timeout** — a board held for 20 s is already at the edge of what a
> paused clock excuses (§8.2).
>
> Keep `gradeTimeoutMs` comfortably above `engineTimeoutMs` whatever changes: it
> is armed BEFORE the two ChessDB round trips, so if it fires first the engine
> watchdog can never matter.

---

## 4 Say which tier graded the card — **DONE (v0.147.0)**

> Landed as part of block 1 (commit `f95c6b0`), written up as
> `DESIGN-intuition-storm.md` §14.20. The label is on the SECOND line, all
> three sources are named rather than only the engine, `.clo-cdb--est` is no
> longer unconditional, and the engine tier's depth comes off the job that
> ran. **Not verified live.**

Three sources of wildly different strength produce one verdict line, and every
one of them wears `.clo-cdb--est` regardless. Book / computed-on-the-spot /
engine-at-depth-20 are three different claims, and this codebase's own standard
(§3.3: never present a fill-in as a book eval) argues for telling them apart.

Cheap — the tier is known inside `gradeTiers`, which already returns the verdict
object the line is built from.

> Carry the grading SOURCE on the verdict and show it, in `stormVerdictLine` /
> `stormBestLine` (both top level — §14.7's live failure is why, and
> `dev/check-storm.js` §0 asserts the indentation).
>
> Three states, and the wording matters more than the mechanism: the position's
> own scored list, one `queryall` on the child, and the engine. An engine-graded
> line ALREADY names the engine's best move and prints no win rate (§14.8) — so
> half of this is a label on a distinction the code draws today.
>
> `.clo-cdb--est` should stop being unconditional: it means "computed for us just
> now", which is true of tiers 1 and 2 and NOT of the engine tier.
>
> It also makes block 2's answer legible from real use rather than only from a
> probe, which is the argument for doing it even if the probe says fill-ins are
> fine.

---

## 5 Storm a chapter, or the worst lines from the performance record — **DONE in part (v0.148.0)**

> "Storm this chapter" landed as block 1's stretch item (commit `c988ca6`),
> written up as `DESIGN-intuition-storm.md` §14.21. It is a filter on the
> store and on the frontier pool, exactly as this block specified; the store
> is filtered first, `stormStoreDraw`'s comparator is untouched, and a
> starved scope is SAID (`stormScopeNote`). **Not verified live.**
>
> **"Storm the worst N lines" is NOT done.** The join is the same one, so it
> is a second filter beside `stormFilterStore`'s — but it needs a rule for
> what "worst" means when a line has three answers, which is §15.6's open
> question and not something to guess at.

§15 built the answer to *which part of my repertoire do I not understand one move
past the book* — and there is nothing to do with it. The stats table names the
worst chapter and the only available response is another whole-course storm.

This is the largest genuine **feature gap** in section 27, as opposed to a tuning
question.

> "Storm this chapter" from a stats row, and/or "storm the worst N lines".
>
> The join already exists: the store carries the oid as `o` since v0.140.0
> (`stormPack`), `st.card.storm.oid` is what `statNote` counts against, and
> `resolveChapters` already maps oid to chapter (cached in `cloStormChapters`,
> one `getList` per chapter, deliberately not synced).
>
> It is a FILTER ON THE FRONTIER POOL plus a filter on `produceFromStore`, not a
> new producer. `stormFrontiers` returns the pool with `oids` on each entry.
>
> Two things to get right:
> * **the store is the fast path** (§14.11 — the first card went from ~50 s to
>   3.1 s), so a filtered session must filter the STORE first and only fall
>   through to walking frontiers for the chosen lines;
> * **a narrow filter can starve** — a chapter whose three lines' positions are
>   all retired (§14.16) has nothing to offer, and that has to be SAID rather
>   than looking like a slow producer. `stormFunnelNote`'s vocabulary is the
>   model.
>
> Do NOT change `stormStoreDraw`'s comparator to bias by chapter — §14.15 is
> explicit that a reversed or re-weighted comparator there is completely silent
> from the outside. Filter the input, keep the order.

---

## 6 Let the user rate a position in the review

§12.1 (`spreadMinCp` 30 vs 60) and §12.7b (`minScored` 5 vs 6) are both blocked
on the same thing: *twenty FENs and a human*. A thumbs-down in the review
collects exactly that judgement as a by-product of playing, from real positions
rather than a probe dump.

> A "this wasn't worth asking" control on a review row (§14.10's list — `revItem`,
> `renderReviewList`).
>
> Store the vote WITH the pick numbers that admitted the position — `spread2`,
> `spread5`, `nScored`, `evalUser`, `plyPast`, `invented` — or the vote answers
> nothing. Those are on the candidate already and mostly in the store entry
> (`stormPack`'s short keys).
>
> Feed it into the retention rule as a third input beside the verdict
> (`stormRetain` / `storeDropOn`): a position the user says is not worth asking
> should leave and be tombstoned (`stormDone`), whatever it was graded.
>
> Keep it OFF the live card. A rating control during a clock is a second decision
> per position, and this exercise has one.
>
> The counters belong with the position, not on §15's wire — that payload is cut
> to fit a budget (§15.3), and a vote dropped because a position list ran long is
> a vote lost silently.

---

## 7 Express `spreadMinCp` in win probability — **MEASURED, not changed**

> Answered by block 1 part 1 and written up as §12.7d (and folded back into
> §16.5): 60cp is **5.50 wp at equality and 4.64 wp at +2.00, i.e. 16% less
> demanded at the band top** — so the objection is sound. The yield
> consequence is nil: at the shipped threshold the cp and wp rules admit the
> identical number of positions on BOTH courses, and the largest divergence
> anywhere in the grid is two positions out of 71. So this is now a change
> worth making for saying what is meant, not for what it does — and it should
> not be bundled with a `minScored` change, whose effect is an order of
> magnitude larger. `CONFIG.storm` unchanged.

§16.5, the design doc's own open question, recorded there rather than discovered.
The grade moved to win-probability lost in v0.141.0; the pick rules are still
centipawns, so "there must be something to get wrong" buys about **15% less at
+200 than at equality** — the filter admits positions that are, in the terms the
grade now uses, flatter than intended.

Bounded (the frontier band stops at +200, where the effect is small), and fixing
it means re-running the probe for yield, not arguing.

> **Bundles with block 1.1 — one probe run answers both**, which is why 1.1's
> prompt already asks for the win-probability spread column. If block 1 shipped,
> this is a `CONFIG.storm` change plus assertions, not a measurement.
>
> `stormWpLoss(bestCp, playedCp, C)` is the conversion and is already sliced into
> `dev/check-storm.js`. The pick rule wants the same arithmetic on `best − 5th`
> rather than on `best − played`.
>
> Keep `blunderCp` and `decidedCp` in centipawns — those are about whether the
> GAME is still a game, not about what a move is worth, and §16.5 leaves them
> alone deliberately.

---

## 8 Gather while the review is up

Gathering is the whole cost of the feature (~11 ChessDB requests per usable
position) and it is currently a mode you choose *instead of* playing. The review
after a session is minutes of reading with an idle network and no clock — the one
stretch where a burst costs the user nothing.

> Guard rails already exist: `gatherMaxCdb`, `gatherTarget`, and the pacing gaps
> (`cdbGapMs`, `explorerGapMs`, `pgnGapMs`) in `pace()`.
>
> The care needed: **`st.gathering` currently ENDS whatever session is running**
> (`gather`'s own arm, and `nextCard` returns early on it — both deliberate,
> §14.13, because a session left alive underneath burns its clock with no board
> and no way out). A review-time gather needs its own quieter flag rather than
> reusing that one.
>
> It must stop the moment the user presses "Storm again" (`stormAgain`), or opens
> an analysis board or a retry from a review row — those are the user asking for
> the network back.
>
> Report it the way §14.17.2 does, in the status line: a silent background burst
> is exactly what §11's politeness rules are about.

---

## 9 Storm beyond one course page

The launcher is the course tree's header on `/course/<bid>/` (`ct.stormBtn`,
"this header being its only way in"), so a storm is per-course by construction —
while the store, the stats and the sync are all keyed by `bid` and would compose.

Most valuable on the phone, which is precisely where the sync exists so you never
spend eleven ChessDB lookups per position.

> A "storm my whole repertoire" pass is a POOL UNION over several bids, plus a
> `produceFromStore` that draws across them.
>
> The corner of a course page already holds four things (25 at 92px, 24 at 54px,
> 21 at 16px, 16d's pin dock on every page) — CLAUDE.md's rule is that a fifth
> has to solve the cluster rather than add an offset. So the ENTRY POINT is the
> problem, not the pool: section 16d's floating pin dock is the only precedent
> for a launcher that works on any page, and it took a whole section.
>
> Every card must then name the COURSE it came from — `st.card.storm.from` is the
> variation name today and is ambiguous across courses.
>
> `statNote` / `courseStats(bid)` are per course already, so the record needs no
> change; the VIEW would need a course column.

---

## 10 A no-clock practice mode

The retry board (§14.10b) and the review already provide most of the machinery; a
clockless run is a small variation on `solving()` and suits a different mood than
a storm. Cheap, low risk, genuinely different exercise.

> `solving()` is the predicate the clock charges against, and `startClock` /
> `paintClock` / `st.endsAt` are the whole clock. A practice mode is "never arm
> `st.endsAt`", plus `syncStormUi` wording, plus an end condition (the queue runs
> out, or a press).
>
> Decide explicitly whether it SCORES and whether it feeds §15's record. The
> retry board's answer is "nothing is scored, nothing is recorded, the row's own
> verdict is left as it was" — copy that unless there is a reason not to, since
> two scoring rules for one exercise is how a record stops meaning one thing.
>
> `storeNote` / retention is the harder call: a practice answer that drops a
> position from the store spends material with no score attached.

---

## 11 Small and cheap

* ~~**`sampleFrontiers: 30` is dead config** (§14.16.5)~~ — **DELETED
  (v0.147.0)**, folded into part 4's commit as block 1 instructed.
* **`missPenaltyMs: 0`** (§8.2) — "whether a miss also costs time is a tuning
  question, not a design one. It costs none until somebody measures that it
  should." Leave it until there are fifty sessions to look at.
* **A "seen fewer than N times" fold on the stats table** (§15.6) — a three-minute
  session answers about a dozen positions and a course has dozens of line ends,
  so a chapter's percentage sits on a handful of answers for a long time. The
  count column is the mitigation today; whether a fold is better is a question
  for somebody who has used it for a month.

---

## 12 Smaller than they look

* **Pin a badly-missed storm position (§12.6) — mostly obsolete.** When that item
  was written, nothing brought a missed position back. `storeDropOn` plus
  §14.16's tombstones now do exactly that, with a 60-day retirement horizon
  (`goneDays`). The remaining delta is drilling a storm position INSIDE a trainer
  session, which needs a synthetic record kind in a store that syncs across
  devices (section 16b, `pinApi`). A much smaller prize than §12.6 implies —
  record that in the design doc rather than build it.
* **Bulk PGN export (§12.5).** `POST /api/games/export/_ids` is entirely
  unverified — not read in the docs, not called, not shaped. PGNs are already
  "the cheapest thing here" and are cached per game id (`pgnCacheMax`). Research
  with a small payoff; do it only if §9's cost profile changes.

---

## Do not revisit

Both are refuted by measurement, and both are the kind of idea that comes back
because it sounds right:

* **Walking deeper** (`minPly` 6) — §6.5. Survivors barely moved (four of five
  still over +1.0) and the cost per usable position nearly TRIPLED, because a
  one-sided frontier HOLDS its advantage rather than dissipating it. The walk
  stops precisely when somebody stops playing well, which is why it cannot work.
* **ChessDB `queue` / `store`** — §12.7b, measured over 48 and 76 minutes with a
  control arm. **The ceiling is five scored moves and it is structural**:
  `learn=1` scores exactly the moves whose child is in the graph (43 of 43, a
  perfect 1:1), so widening one position means queueing its ~38 unknown children.
  It is also a hard rule in CLAUDE.md and in §11, enforced by
  `handleChessdbFetch`'s allow-list. The answer to the yield question is
  `minScored`, which is block 1.1.

---

## Block 1 — the prompt (overnight, unattended)

Paste everything below the rule into a new session.

---

**OVERNIGHT SESSION — the intuition storm (section 27 of
`content/lichessable.js`). I am asleep. Work autonomously until you run out of
work or context. Nothing below needs an answer from me: where a judgement is
genuinely mine, the instruction says what to do instead of asking.**

Read `DESIGN-intuition-storm.md` before touching anything — §4 stage 0, §5,
§12.7b, §14.10, §14.16, §14.17, §14.18 and §16 are the sections this lands in —
and CLAUDE.md's section 27 bullets, which are the contract surface.

### Ground rules for this session

1. **Never stop to ask.** Every judgement call below is pre-decided. If you meet
   one that is not, take the option that changes the least behaviour, implement
   it, and write the alternative into the design doc as a recorded decision with
   your reasoning. Then carry on.
2. **Commit after every part**, directly on `master` as this repo's history does
   — do not branch and do not push. One part, one commit, in the repo's own
   message style: an imperative sentence naming the behaviour, plus the version,
   e.g. `Stop the storm walking back into your own repertoire (v0.145.0)`.
   Partial work has to survive.
3. **Never commit a broken tree.** Before each commit run `node --check` on every
   file touched, `node dev/check-storm.js`, `py dev/check-contracts.py`, and
   anything else CLAUDE.md's Verification section lists for what you touched. If
   a check fails and you cannot fix it properly within a few attempts, revert
   that part (`git checkout -- <files>`), record why, and move to the next one.
   **A reverted part is a good outcome; a committed half-part is not.**
4. **Each part is independently shippable and bumps `manifest.json` itself.** If
   you only get through two, the two that landed must be complete — code, checks,
   `DESIGN-intuition-storm.md`, CLAUDE.md.
5. **Browsers.** You MAY use Claude Code's own Browser pane for `dev/harness.html`
   — run `node dev/serve.js` and open
   `http://127.0.0.1:8731/dev/harness.html`; it needs no Chessable, no extension
   and no account, and it serves `Cache-Control: no-store` so the stylesheet
   cache-bust problem does not arise. You may **NOT** use Claude in Chrome: a live
   Chessable session needs me, and I am asleep. So the harness is your only visual
   measurement, and anything needing a live trainer or a live storm goes on the
   "for me to check" list instead of being attempted.
6. **The rules that must not break**, from CLAUDE.md section 27 and §11 of the
   design doc: never call ChessDB's `queue` or `store` (`handleChessdbFetch`'s
   allow-list in background.js stays an allow-list of one); never write to the
   course; never touch Chessable's board; never present a `learn=1` fill-in as a
   book eval; never show the same position twice in a session.
7. **Live API use is read-only and paced.** Part 1 runs the probe twice. Do not
   loop it, do not raise its request budget, and if the network fails, record that
   and move on — no part below depends on part 1's numbers.
8. **Stop cleanly when context runs low.** Finish or revert the part in hand,
   commit, write the report, end. Do not start a part you cannot finish.
9. **The report is the last thing you do.** Update this file (`TODO-storm.md`) in
   its own convention — mark each block `DONE (vX.Y.Z)` with a short note of what
   landed and what is NOT verified — and collect everything I have to check live
   into one list at the top. Say the same in your final message, briefly.

### Part 1 — the `minScored` measurement (report only, no behaviour change)

§12.7b measured `minScored` 6 → 5 at **11 → 27 survivors** on the shipped bands —
2.45x, for no requests, no writes and no third party — and deliberately did not
change it, pending "twenty FENs and a human". This part sets that look up so I
can take the decision from the document without re-running anything.

Two additions to `dev/probe-storm.js`; no change to the extension.

**(a) Dump the survivors that appear ONLY at `minScored=5`** — admitted by
`rejectAt(c, lo, hi, 5)` and rejected by `rejectAt(c, lo, hi, 6)` at the shipped
bands (`spreadMinCp` 60, `spreadMaxCp` 300). Those are exactly the positions in
dispute; the existing "sample survivors" block prints the first 8 under the
shipped rules, which are the ones NOT in dispute. Print at least 20, in the same
shape (ply past the line, `evalUser`, `spread2`/`spread5`, `nScored`, the FEN, the
top moves, the source line and game) so each FEN can be pasted into a board.

**(b) Add a win-probability column** to the same output: `best − 5th` expressed as
win probability given up, through the shipped `stormWinPct` / `stormWpLoss`. Slice
them out with `dev/slice-source.js` the way the probe already slices `sanToUci`,
so they cannot drift. That answers §16.5 — whether `spreadMinCp` 60 is a different
filter at +200 than at equality — off a run I am paying for anyway. Print the
distribution of the wp-spread beside the existing centipawn one, and add a grid
row for a wp-based `spreadMin` so the yield effect is visible.

Run it on both courses with §6.1's own seeds, so the numbers are comparable:

```
node dev/probe-storm.js --bid 291847 --n 14 --maxply 16 --seed 7
node dev/probe-storm.js --bid 453453 --n 12 --maxply 16 --seed 3
```

`dev/tmp-courses.json` and `local-token.json` are both present, so this runs.

**Do NOT change `CONFIG.storm.minScored` or `spreadMinCp`.** Instead write the
finding up as a new subsection under §12.7b of `DESIGN-intuition-storm.md`, with
the twenty FENs recorded in it, the two distributions, and a one-paragraph
statement of what each answer costs and buys — so the decision is a number I move,
not a measurement I re-run. No `manifest.json` bump: a probe and a document are
not a functional change.

### Part 2 — stop a WALK re-entering the repertoire (v0.145.0)

v0.144.0 stopped the storm asking about lines that END where another line carries
on. A walk can still be carried forward by a real game into a position the course
DOES answer, and the user is then asked to improvise where their own book has a
move — the same failure one ply later, and §14.18 calls that shape "the one
failure of stage 0 that produces a card looking exactly like a good one".

§14.18.3 files this as "a much larger question (every position of the course
against every step of every walk)". **It is cheaper than that.** `stormFrontiers`
already builds `cont = { w: Set, b: Set }` — every position the course plays a
move FROM, per side — and drops it on return. Carry it out, and a walk step is a
set lookup.

Pre-decided, so you do not have to weigh them:

* It is a **stop rule** (§5.1), not a candidate rejection, and the walk stops **at**
  that position — the position itself is not offered. Everything past a position
  the course answers is past the point where the user was on their own.
* It gets **its own funnel reason** so the count says how often it fires before
  anyone argues about the rule — `stormFunnelBlank`'s `stops` table, and
  `stormFunnelWhy`.
* `stormWalkGame` and `stormRandomLine` **stay pure**. They take their ChessDB
  lookup as a parameter, which is what lets `dev/check-storm.js` execute them; the
  covered-position set is another parameter, never a closure over `st`.
* It covers **both walks and the gather pass as well as a session**.
  `harvestFrontier` is the shared entry. The paused and stub filters got this for
  free by living inside `stormFrontiers` (§14.14, §14.18) and this one cannot, so
  say in the doc how it is covered instead — that asymmetry is exactly the kind of
  thing a later edit will "tidy".
* **Side scoping is §14.18's, unchanged**: a line of the other colour passing
  through says nothing about whether THIS repertoire continues.
* The store holds positions harvested by earlier builds and is **not** re-filtered
  — §14.18.3's own note about itself. State that; the retention rule and the
  tombstones age them out.

Assertions in `dev/check-storm.js`, plus a control. The failure mode is silence,
exactly as §14.14's was — a course whose walks never re-enter answers identically
either way — so the fixture needs a walk that DOES re-enter, and the control (the
rule reverted) must fail on exactly the assertions covering it and no others.
Report the control's number in the commit message body or the doc.

### Part 3 — weight frontiers by real reachability (v0.146.0)

`stormDrawFrontier` weights by `f.n`, how many variations end there, and its own
comment records the other half of §4's instruction as deliberately not built,
because section 21's reachability ranking is one explorer request per distinct
position of every line.

**The cheap half is already paid for.** `askGames` fetches the explorer AT the
frontier and keeps only the game list; the same reply carries the position's own
`white` / `draws` / `black` totals — how often anybody reaches this frontier at
all, which is precisely §4's "storming the frontier of a line you meet twice a
year is a wasted rep".

* **Verify that with one curl before building on it.** `moves: '0'` is what the
  storm sends and I do not want the totals assumed. **If they are not in that
  reply, skip this part entirely** — record it in the report and move to part 4.
  Do NOT improvise a second request per frontier to get them; that is the cost
  §4 declined to pay and it is not yours to re-decide at 3am.
* The figure arrives one request AFTER the draw, so it cannot weight the pool draw
  on the first pass. **Weight the STORE**, which is what a session draws from now
  (§14.11): keep it on the entry and let it inform which position is offered.
* **Do not touch `stormStoreDraw`'s comparator.** §14.15 is explicit that a
  reversed or re-weighted comparator there is silent from the outside — every
  position still comes back, in a plausible order. Reachability goes in as a
  separate, asserted term, and unseen-before-most-missed stays the primary key.
* The store gains a field: a short key in `stormPack`, and **missing means "no
  reachability data", never "zero games"** (§14.16's rule for an entry written by
  an older build). Pre-decided: **it does ride the wire** — it is not re-derivable
  without another request — as an optional field, with **no `wireVersion` bump**,
  because absence is already handled as unknown. Say that in the doc.
* **Report it; do not put it on a live card.** A frontier's popularity is not a
  spoiler, but a card has one job. The gather's funnel report (§14.17.2) and the
  review row are the right hosts.

### Part 4 — say which tier graded the card (v0.147.0)

Three grading sources of wildly different strength (§3.4, §14.8) produce one
verdict line, and all three wear `.clo-cdb--est` regardless. Book /
computed-on-the-spot / engine-at-depth-20 are three different claims, and §3.3's
standing rule — never present a fill-in as a book eval — argues for telling them
apart. The tier is already known inside `gradeTiers`.

Pre-decided:

* The verdict carries a **source** field with exactly three values: the position's
  own scored list, one `queryall` on the child, and the engine.
* It is printed on the **second** line (`stormBestLine`, which already carries the
  best move and the win rate), not the verdict line — that one is read in about a
  second with a clock running (§16.3) and is not to be lengthened.
* **`.clo-cdb--est` stops being unconditional**: it means "ChessDB computed this
  for us just now", which is true of the two ChessDB tiers and false of the
  engine. The engine tier gets its own treatment and a title naming the depth.
* `stormVerdictLine` and `stormBestLine` **stay top level** — §14.7's live failure,
  and `dev/check-storm.js` §0 asserts the indentation. Do not move them while
  editing them.
* The source rides `st.history` so the review prints the same line the card did
  (§14.10's third bullet). It does **not** ride §15's wire: that record counts
  bands, not sources, and `statsWireVersion` stays 2.
* Add assertions rather than editing existing ones — in particular do not disturb
  the `v.unanswered` arm (§14.10c) or the signed-points rendering (v0.139.0).

This part changes rendering, so `dev/harness.html`'s `.clo-st-` / `.clo-cr-panel`
replicas must be updated to match (CLAUDE.md: the replicas are hand-written and do
NOT update themselves) and **measured** at the panel's full-window width, at 880px,
at 360px, and under `html.clo-touch`. Report rects, not "looks fine".

### Part 5 — delete `sampleFrontiers` (fold into part 4's commit)

`CONFIG.storm.sampleFrontiers: 30` has been unread since the pool became the whole
frontier list (§14.16.5), and was left in place at the time only because it was a
behavioural change's neighbour. A number that looks like a dial and is not is the
kind of thing that gets tuned. Delete it and say so in §14.16.5.

### Part 6 — STRETCH: storm a chapter (v0.148.0)

**Gated.** Only start this if parts 1–5 are committed, every check is green, and
you have plenty of context left. If you start it and it is not finished to the
same standard as the rest, **revert it** and say so — this one benefits from my
eye and a half-built version is worse than none.

§15 built the answer to *which part of my repertoire do I not understand one move
past the book* and there is nothing to do with it: the stats table names the worst
chapter and the only response available is another whole-course storm.

* "Storm this chapter" from a stats row. The join exists: the store carries the
  oid as `o` (`stormPack`), `st.card.storm.oid` is what `statNote` counts against,
  and `resolveChapters` maps oid to chapter (`cloStormChapters`).
* It is a **filter on the frontier pool plus a filter on `produceFromStore`**, not
  a new producer. `stormFrontiers` returns the pool with `oids` on each entry.
* **The store is the fast path** (§14.11 — the first card went from ~50 s to
  3.1 s), so filter the store first and only fall through to walking frontiers for
  the chosen lines.
* **A narrow filter can starve**: a chapter whose lines' positions are all retired
  (§14.16) has nothing to offer, and that must be SAID rather than looking like a
  slow producer. `stormFunnelNote`'s vocabulary is the model.
* Again: do not re-weight `stormStoreDraw`. Filter the input, keep the order.

### When you are done

Write the report (ground rule 9). It matters more than usual tonight, because I
will read it before I look at any code: what landed, what was reverted and why,
what the probe said, and the single list of things only a live session can settle
— which at minimum already includes §8.1a's engine-tier timing (block 3) and
§12.3's fill-in quality (block 2), neither of which is in scope here.
