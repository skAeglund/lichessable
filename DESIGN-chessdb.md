# DESIGN — ChessDB cloud analysis as an engine source

Status: **the EVAL COLUMN is BUILT (section 26, v0.128.0); the engine
substitution of §6 is NOT.** Investigated 2026-08-26 against the live API;
every number below is measured, not quoted. The host permission
(`https://www.chessdb.cn/*`) was added on explicit request 2026-08-27 — it is
this extension's second, after a lifetime of one.

What shipped: §7, behind `cloChessdbEval` (opt-in, panel cogwheel), on the two
requests §3.3 forces and the gate of §5. Verified in `dev/harness.html` (the
column, its two states, and the narrow/touch widths) and by
`node dev/check-chessdb.js`, which executes the real fold and the real score
bands with three controls. **NOT yet verified in a live Chessable session** —
the fetch relay through the worker and the canonicalisation against real
explorer rows still want one pair of eyes.

Also shipped (2026-08-27): `cloEngineSource` (§8) and the `syncEngine`
substitution (§6.1) — with the source on `auto` the panel's engine section is
answered from the book wherever the book knows the position, and Stockfish is
booted only where it does not.

What did NOT ship, deliberately: §6.2, the alt check. That is a standing
refusal rather than a backlog item — see the section for why.

LIVE VERIFICATION (2026-08-26/27, course 453453, Claude in Chrome): the host
permission, the worker relay, the canonicalisation and the painting are all
confirmed against real data — the start position renders 16 book evals and 4
estimates, and the preference survives an extension reload. TWO THINGS COULD
NOT BE EXERCISED THERE, both for the same documented reason (a driven tab
reports `document.hidden`, which the panel's debounce livelocks on and which
`syncEngine` gates on outright): the position-change path, and the engine
section in any form. They are covered by `dev/check-chessdb.js` instead, and
the engine substitution still wants one pair of human eyes.

The one-line version: **the Lichess explorer says how often humans play a move,
ChessDB says how good it is** — at book depth, in one 380 ms request, with no
WASM, no 108 MB vendored build and no ~300 MB of resident memory. That last
clause is the whole feature, and it is worth most on the device where the
engine is worth least.

---

## 1. Why this is interesting here

The extension already has two answers about a position, and they are the same
two answers everywhere it asks: the Lichess explorer (popularity, W/D/B, win
rates) and local Stockfish (section 5b — offscreen document, MultiPV 3, depth
30 desktop / 25 mobile).

Stockfish costs a great deal for what it returns in an OPENING position:

* the vendored pair is 108 MB (full) and the offscreen document holds ~300 MB
  resident while it runs, which is why the panel's Engine toggle is **off by
  default**;
* the mobile profile exists because a phone cannot run the full build at all —
  2 threads, 16 MB, depth 25;
* and depth 30 on a move-10 tabiya is a worse answer than the one a distributed
  cloud book already holds for that exact position.

ChessDB is that book. For the positions this extension spends nearly all of its
life in — course lines, repertoire moves, the first twenty-odd plies — it
returns a deeper answer, faster, for nothing.

It does not replace the engine. It runs out exactly where a course leaves
theory (§4), which is also where the engine starts being the only thing that
can answer.

---

## 2. The wire (verified 2026-08-26)

```
https://www.chessdb.cn/cdb.php?action=<ACTION>&board=<FEN>&json=1[&learn=0]
```

No auth, no key, no token. Docs: `/cloudbookc_api_en.html`.

### 2.1 What was confirmed live

| fact | measured |
|---|---|
| CORS | `Access-Control-Allow-Origin` **echoes the request Origin** — verified with both `chrome-extension://...` and `https://www.chessable.com`; plus `Access-Control-Allow-Credentials: true`, `Vary: Origin` |
| caching | `Cache-Control: no-cache` — we cache ourselves or not at all |
| latency | **~380 ms warm** (keep-alive; 20 consecutive requests, 376-410 ms), **~1.1-1.3 s cold** (fresh TLS) |
| rate limit | none hit: 20 rapid sequential requests, all `200`, no throttle, no backoff header |
| position key | **ignores the move counters** — the same placement queried with fullmove 1...20 answered identically, so `cacheKey`'s first-four-fields rule applies unchanged |

### 2.2 Actions

All verified returning sane data on
`r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3`:

| action | returns |
|---|---|
| `queryall` | every legal move: `{uci, san, score, rank, note, winrate}` |
| `querypv` | `{score, depth, pv[], pvSAN[]}` — **`pvSAN` is spelled for us**, so `pvToSan` is not needed |
| `queryscore` | `{eval, ply}` |
| `querybest` / `query` | one `move` (best / weighted-random) |
| `querysearch` | candidate moves, for feeding an engine's `searchmoves` |
| `queue` / `store` | **WRITES.** Request analysis of a position / of one move |

### 2.3 Encodings that differ from what this codebase already handles

* **Scores are side-to-move**, in centipawns. `engine.js` normalises Stockfish
  to White's perspective; a CDB score needs the same normalisation at the
  boundary, not in the panel.
* **Mate is ±(30000 − distance)** — measured `29999` for a mate in 1. Same shape
  as the alt check's `mateCp ∓ distance`.
* **Tablebase entries** carry no `winrate` and a lettered note: `! (D-0000)` for
  a draw, `! (W-0004)` for a win in 4, with score `24996`.
* **CASTLING UCI IS STANDARD — `e1g1`, NOT Lichess's king-takes-rook `e1h1`.**
  This is the exact inverse of the convention section 6c's v0.48.1 rule exists
  for, and it is the most likely way to break something quietly: any code path
  that learns to expect one source's spelling and is then handed the other's
  will fall through to a wrong branch and *succeed*. Resolve through `CloSan`
  regardless of source; never compare a raw uci string across sources.
* `status` observed: `ok`, `unknown`, `invalid board`. The docs also list
  `checkmate`, `stalemate`, `nobestmove`.

### 2.4 `queue` works, and that is why we must never call it

The obscure pawn endgame `8/5k2/3p4/1p1Pp2p/pP2Pp1P/P4P1K/8/8 b - - 99 50`
answered `unknown`. One `action=queue` on it returned `ok`; **~25 minutes later
the same FEN answered `ok` with all 7 moves scored.**

That is someone's volunteer compute, spent because we asked. `queue` and `store`
are the only true writes in this API and **nothing in this extension may call
either automatically.** If they are ever exposed it must be one position, behind
an explicit press, the way section 19c's write is.

---

## 3. The three findings that shape the design

### 3.1 THERE IS NO DEPTH FIELD, and the obvious gate cannot be built

The feature as requested was "replace the engine **as long as the depth is high
enough**". No field carries that number.

| position | `queryall` note | `querypv` depth |
|---|---|---|
| start position | `20` | 49 |
| Grunfeld after 7...c5 | `05` | 34 |
| Italian after 5...d6 | `40` | 24 |

`querypv`'s `depth` **equals the PV length exactly** in every case measured
(34/34, 24/24, 49/49) — it is how far the known line runs through the graph, not
how hard anything was searched. The note's first number moves the *opposite* way
from it. Neither is comparable to `CONFIG.engine`'s depth 30, and a gate written
as `depth >= 25` against either would be a number that means nothing.

**Do not reintroduce a depth comparison against these fields.** They look like
depth, one of them is named depth, and neither is.

### 3.2 `learn` IS THE REAL SWITCH — and it is the default

`learn` defaults to **1**. It is what decides whether every legal move gets a
score or only the ones already elaborated in the book:

| position | `learn=0` | `learn=1` |
|---|---|---|
| Italian after 3.Bc4 | **2**/31 scored | **31**/31 scored |
| Najdorf after 6.Be3 | **2**/30 scored | **30**/30 scored |
| Grunfeld after 7...c5 | **1**/37 scored | **37**/37 scored |

Unscored moves come back as the literal string `"??"` in `score`, so a consumer
must type-check rather than trust the field.

**`learn=1` does NOT enqueue work and does not persist.** Checked directly:
`learn=1` on a position, then `learn=0` again, and the fill-ins were `"??"` once
more. So it is not the queue under another name, and it is the documented
default — but its numbers are computed on the spot and are of unmeasured
quality, which §3.3 is about.

### 3.3 UNDER `learn=1` YOU CANNOT TELL A BOOK MOVE FROM A FILL-IN

This is the finding that decides the whole shape. The hope was that one `learn=1`
request could carry both the coverage and the trust signal, with the `note`
separating them. It cannot:

```
Najdorf 6.Be3  —  elaborated (per learn=0):  e5(45-03)   Ng4(44-07)
                  fill-ins:                  e6(46-02)   Nc6(44-10)   h6(35-10)
```

The fill-ins score **higher** on both halves of the note than the two real book
entries. Same on the Italian. The note is worthless as a provenance signal, and
so is `rank` (every fill-in is rank 0).

**The only honest confidence signal is a second request with `learn=0`:** a real
number there means "this entry is in the distributed book"; `"??"` means "we
made you a number just now". Eval-on-every-move and a trust gate are therefore
**two requests**, ~400 ms in parallel. There is no one-request version, and
`showall=1` does not help (it returned the identical 37 moves).

### 3.4 `unknown` stays unknown

`learn=1` only fills in moves for positions **already in the graph**. It does not
create the position.

| position | `learn=0` | `learn=1` |
|---|---|---|
| contrived mate-in-2 | `unknown` | `unknown` |
| Italian mainline, ply 24 | `unknown` | `unknown` |

Which means **Chessable tactics courses are largely out of scope** — their custom
mid-game `initialFEN`s are exactly the positions CDB has never seen. Anything
built on this must degrade to today's behaviour in silence.

---

## 4. Coverage — where it runs out

Five lines walked ply by ply, `learn=0`, 24 plies each:

| line | known through |
|---|---|
| Najdorf English Attack | **all 24 plies** |
| Grunfeld mainline | **all 24 plies** |
| Offbeat Italian (a6/h6/Nf1 shuffle) | **all 24 plies** |
| Italian mainline | 23 plies, `unknown` at 24 |
| Evans Gambit, with an invented bad move at ply 19 | 19 plies, then `unknown` for the rest |

The reading: **CDB does not run out at a depth, it runs out at a QUALITY.** An
offbeat but sane line stayed known for all 24 plies; a line where a genuinely bad
move was played fell off a cliff and never recovered. Course lines are, by
construction, sane. This is the single most encouraging measurement here.

But `status: ok` is **not** the same as "well analysed" — a mainline Grunfeld
position returned its best move at note `(05-01)`, and a plausible middlegame
gave `best=Re1` at `(02-00)`. Which is only §3.3 again from the other side: the
provenance question has to be *asked* of `learn=0`, never inferred.

---

## 5. The gate

Given §3.1 the gate cannot be a depth. It is:

> **A CDB answer may replace the engine for a move only when a `learn=0` query
> returns a numeric score for that move.**

Binary, cheap, and it means something. Everything else — the note, the rank, the
PV length — is presentation.

Corollary, written down because it will be proposed: a fill-in score is not "a
slightly worse eval", it is a number of unmeasured provenance. It has **not**
been validated against the vendored Stockfish (§10.1). Until it has, it may be
shown, dimmed and marked, and may not drive a verdict.

---

## 6. Where it would go

There are exactly **two** consumers of the engine in the content script, which is
what makes "all instances" a tractable request.

### 6.1 `syncEngine()` ([lichessable.js:4515](content/lichessable.js:4515)) — YES

The panel's own search, serving all four panel hosts (review, variation, analysis,
tree). One `clo-engine-analyze`, no `reqId`, no depth cap.

Substitution is clean:

* score and best move: `queryall` (already fetched for the eval column, §7);
* the line: `querypv`, whose `pvSAN` arrives pre-spelled;
* **MultiPV 3 costs three requests** — root, plus `querypv` on the positions after
  the 2nd and 3rd moves. Parallel, so ~400 ms, but it is three, not one.

Two wrinkles the UI has to answer:

* **The depth readout has nothing to show.** Print "book", or the PV length
  labelled as what it is, but never a bare number in the slot where Stockfish's
  depth used to be — that slot has meant one thing for the panel's whole life.
* The engine is off by default because of its cost. A CDB source has no such cost,
  so "is analysis on by default when the source is CDB" is a real decision, not an
  implementation detail. It changes what the panel is.

### 6.2 The alt check (`beginCheck`, [lichessable.js:13085](content/lichessable.js:13085)) — NO

Keep this on Stockfish, and it is not a close call.

The verdict there is a **subtraction**: the course move's eval minus the refused
guess's, against thresholds of 0.2 and 0.4 pawns. And the two operands have
systematically different provenance —

* the course move is book (it is theory; that is what a course is),
* **the refused move never is**, because nobody elaborates blunders.

So CDB would have the alt check subtract a shallow fill-in from a depth-40 book
entry and read the difference to two decimal places. That is worse than either
source used alone, and it fails in the direction that costs the user real
scheduling: telling them a refused move is "as good as the course move" when it
drops a piece.

If it is ever wanted here, the rule is **both operands elaborated, or fall
back** — which in practice means falling back nearly always, so the honest
version is to leave it alone.

### 6.3 What that means for the setting's promise

In practice "prefer chessdb" reads: *the panel and the analysis board use the
cloud database; the alt check still boots Stockfish.* The options page should say
so rather than promise a swap it does not perform.

---

## 7. The eval column in the Lichess panel

Wanted: a CDB eval on **every** move row, in every host of the panel.

Costs one `learn=1` request per position, on a panel that already fetches per
position — so the budget is the same shape as the explorer fetch it sits beside,
and the same `fenCache` / `cacheKey` machinery applies (§2.1: counters do not
matter). Add a `learn=0` companion only where the trust marking is wanted.

Three constraints it inherits:

* **COLOUR.** An eval is a **verdict**, and this table has spent more design
  capital on colour meaning one thing each than on anything else in the file
  (green = the lichess accent, blue/orange/red = the repertoire badges' three
  verdicts). The eval must be **plain dim text** — exactly the ruling 24f already
  made for the mover-score: *green would read as "this is the good move", the one
  claim a raw database figure does not make.* A CDB score makes a stronger claim
  than a win rate, which makes the temptation worse and the rule more necessary.
* **THE MOVE CELL IS ALREADY CROWDED.** `.clo-move` carries SAN plus a badge child
  and is `white-space: nowrap` for that reason; two readers take
  `tdMove.dataset.san` rather than `textContent`. An eval belongs in a **column of
  its own**, never appended to that cell.
* **SPOILERS.** The panel already stands down during quizzes and drills because
  "the database's top move would name the answer" (section 20). An eval column
  makes the panel a stronger answer key — the existing gates still cover it, but
  they stop being incidental and become load-bearing.

---

## 8. The setting

Not a boolean. **`cloEngineSource: 'auto' | 'chessdb' | 'local'`**, options page,
watched through `chrome.storage.onChanged` in every document (the panel is in the
mt1 iframe on Explore/Analysis and in the top document everywhere else) — the same
shape as `cloEngineBuild` and `cloTouchUi` beside it.

Three states because **"local only" is a real preference**, not a fallback: the
host is in China, and a user on a slow, filtered or offline network wants the
engine they already have rather than a 1.1 s timeout per position. `auto` = CDB
when §5's gate passes, Stockfish otherwise. `chessdb` = never boot the engine
(accepting no answer off-book). `local` = today.

Default `auto` is defensible only if the fallback is genuinely silent.

---

## 9. Costs

| | |
|---|---|
| **host permission** | `https://www.chessdb.cn/*` — a second host, after a lifetime of exactly one. **The user's decision, and the reason this document exists.** |
| **a second third party** | Positions already go to Lichess, so it is not a new *kind* of exposure — but what the user is studying would be visible to a second, unauthenticated party. |
| **no SLA** | A volunteer project run by one person. Every path must degrade to today's behaviour with a console line and no visible failure. |
| **latency** | ~380 ms warm, ~1.1 s cold. Fine per position and per column; **never** per row or per hover — 24b's rule, unchanged. |
| **offline** | Stockfish works on a plane. This does not. Another reason `local` must stay reachable. |
| **the castling trap** | §2.3. The one thing here that would break quietly. |

---

## 10. Open — what was NOT measured

1. **Whether a `learn=1` fill-in score is any good.** Not validated against the
   vendored Stockfish. This is the one measurement that would widen the feature —
   it is what stands between §6.2's refusal and using CDB in the alt check — and
   it is the obvious next probe: 20 positions, fill-in score vs local depth 30,
   report the spread.
2. **Reachability and latency from the phone**, which is the device the feature is
   worth most on (§1) and the one it was not measured from.
3. **Any rate limit above 20 requests.** A course-tree scan is bursty; nothing was
   found, but nothing was pushed either.
4. **Whether `queryall` is stable enough to cache for 12 h** the way
   `cloPopularityCache` is, or whether a book that grows continuously wants a
   shorter life.

---

## 11. Reproducing the probes

All of it is plain HTTP: no extension, no Chessable, no browser.

```bash
curl -s "https://www.chessdb.cn/cdb.php?action=queryall&learn=0&json=1&board=r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R%20b%20KQkq%20-%203%203"
```

The `learn=0` / `learn=1` split of §3.2 is the one number that matters, and it is
two requests plus a count of how many `score` fields came back as numbers rather
than as `"??"`.

The coverage walk of §4 used `engine/san.js` directly — it is pure and
node-requireable, so a line can be walked to FENs with `parseFen` /
`generateMoves` / `moveToSan(pos, uci)` / `makeMove` / `fenFromPos`, and each
position handed to `queryall`. Note that `moveToSan` takes a **uci string**, not
the move object `generateMoves` yields; build it with
``FILES[sq & 7] + ((sq >> 3) + 1)``.
