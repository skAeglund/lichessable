# TODO — Maia: a human-move model (proposed section 28)

**Status: NOTHING IS BUILT. This file is a prompt, not a report.** It was written
2026-08-31 from an investigation session; no extension code was touched and no
version was bumped. The prompt is at the bottom — paste everything below the rule
into a new session.

---

## The idea, and why it is not just a nicer version of something we have

The intuition storm's invented-line fallback (§14.10, `stormRandomLine`) walks a
frontier the explorer has no games at by picking among **ChessDB's own top moves
within `randomTopCp`** — i.e. an *engine-approved* line.
`DESIGN-intuition-storm.md` §14.18.4 already concedes the consequence in as many
words:

> picks among ChessDB's own best moves, which is precisely the play a repertoire
> is written to meet, so it walks back into the course **more** readily than a
> random human game does.

So the invented walk is off-distribution in a named, already-documented
direction: it reaches positions too clean for both sides, and it answers *"what
do humans do when the book stops"* with *"what an engine does"*.

**There is no second tool for this.** The explorer knows what is **played** (and
thins to nothing past ~ply 12); ChessDB knows what is **good**; Stockfish knows
what is **good, deeply**. Nothing in this extension knows what is **likely**.
Maia is the only source that answers for a position nobody has played, which is
the definition of the frontier this fallback exists for.

**It is nearly free at runtime.** A 5M-parameter transformer over 64 square
tokens is single-digit milliseconds. The walk is network-bound — ~380 ms per
ChessDB request, ~11 per position (§6.1) — so Maia is about three orders of
magnitude cheaper than the call it would sit beside.

### The priority is probably NOT the storm

Ranked by what the answer is worth:

1. **A column in the Lichess panel: "what will they actually play here".** It
   composes with the repertoire badges (section 6c) — a move Maia rates highly
   **and** that carries no badge is exactly the hole worth filling. That reading
   does not exist anywhere in the extension today, and unlike the explorer it
   does not die at depth.
2. **§19's uncovered-response ranking.** That source prioritises by explorer game
   count (`stormPack`'s `g`), which has the same depth problem. Maia ranks where
   the explorer cannot.
3. **The invented walk** — the thing originally asked for.

## What was verified about the model, 2026-08-31

Web only; nothing run locally.

* **Maia-3 exists and covers above 2000.** [CSSLab/maia3](https://github.com/CSSLab/maia3),
  paper at `arxiv.org/abs/2605.19091`. Conditioned on **both** player and
  opponent Elo; the Maia family targets the Lichess scale to ~2600. (maia-1
  capped at 1900, which is why this one matters.)
* **Sizes: 3M / 5M / 23M / 79M parameters**, 57.1% human move-match on the
  headline model. [Maia3-5M](https://huggingface.co/UofTCSSLab/Maia3-5M) is the
  candidate here: ~20 MB fp32, ~10 MB fp16, ~5 MB int8.
* **The "tightness" knob is `TopP` (nucleus threshold) and `Temperature`**, both
  exposed, with `Temperature: 0` = argmax. `MultiPV` too. **We write the sampler
  ourselves, so this knob is ours for free regardless of which model is used** —
  it was never a reason to need a particular version.
* **Architecture: a transformer with board squares as tokens.** NOT maia-1's lc0
  CNN. So a hand-written forward pass is attention + layernorm, not conv — more
  work, and more places for a silent encoding error.
* **PyTorch `.pt` only. No ONNX export is shipped.** This is the single largest
  integration cost and it is what stage 1 has to settle.
* Licence: the paper is CC BY 4.0; the code/weights licence is stated in the repo
  and was **not** read. Stage 1 reads it.

## The rules this must not break

Straight from CLAUDE.md's hard constraints, and each one is load-bearing here:

* **No new host permission.** A remote inference API would be a fourth host and
  is refused outright — `lichess.org` needed the conversation it got, and this
  would additionally send the user's own repertoire positions to a new third
  party. The model is **vendored**, exactly as Stockfish is: `engine/vendor/` is
  already gitignored, downloaded by hand, documented in README's operational
  section.
* **No bundler, no npm, no frameworks, no remote code.** A hand-written forward
  pass satisfies this outright. `onnxruntime-web` is a vendored library and is a
  real judgement call, not an automatic no — stage 1 decides, and records why.
* **Never parse a checkpoint format in the extension.** The `.pt` (or ONNX) is
  converted **offline, once** into a dumb flat binary the loader reads in ~30
  lines.
* **It changes nothing about the grade.** §23's Stockfish stays the storm's
  grader. "Was that the human move?" is a *different exercise* and would collide
  with §16's win-probability bands. Explicitly out of scope; if it becomes
  tempting, write it down and do not build it.
* **`invented` stays `invented`.** Maia does not create games. It changes what
  the label *means*, and whether that produces *better exercises* is a
  measurement (stage 5), not an argument.

---

## The prompt

Paste everything below the rule into a new session.

---

**MAIA — a human-move model for LiChessable. This is a multi-stage build and the
early stages are pure offline work with no browser and no account. Read this
whole file first, then `DESIGN-intuition-storm.md` §5, §6.4, §14.10, §14.18.4 and
§19, and CLAUDE.md's section 26 (ChessDB — the closest precedent for a second
opinion column) and section 27 bullets.**

### Ground rules

1. **Stages 0 and 1 are gates.** Do not start stage 2 until stage 1 has answered
   its questions in writing. If stage 0 says the invented path is a rounding
   error, say so and propose reordering to the panel use (which does not depend
   on stage 0 at all) rather than pressing on.
2. **Where a judgement is genuinely mine, take the option that changes the least
   behaviour, implement it, and record the alternative in the design doc with
   your reasoning.** Do not stall waiting for me.
3. **Commit after every stage**, directly on `master` as this repo's history
   does — do not branch, do not push. One stage, one commit, in the repo's
   message style: an imperative sentence naming the behaviour plus the version
   where there is one, e.g. `Read the human move out of Maia (v0.164.0)`.
4. **Never commit a broken tree.** Before each commit run `node --check` on every
   file touched, the new `node dev/check-maia.js`, `py dev/check-contracts.py`,
   and everything else CLAUDE.md's Verification section lists for what you
   touched. If a check fails and you cannot fix it properly, revert that stage
   (`git checkout -- <files>`), record why, and stop. **A reverted stage is a
   good outcome; a committed half-stage is not.**
5. **Version bumps only on functional change.** Stages 0-2 touch no extension
   code and bump nothing.
6. **Browsers.** `dev/harness.html` via `node dev/serve.js`
   (`http://127.0.0.1:8731/dev/harness.html`) is fair game and needs no account.
   **Claude in Chrome is the only way to reach a live Chessable session** — see
   CLAUDE.md's "Reaching a live Chessable session"; never the Browser pane. If I
   am not here, put anything needing it on a "for me to check" list.
7. **Live API use is read-only and paced.** Nothing here may call ChessDB's
   `queue` or `store`; `handleChessdbFetch`'s allow-list in `background.js` stays
   an allow-list of one.
8. **The report is the last thing you do.** Update this file in its own
   convention — mark each stage `DONE (vX.Y.Z)` with what landed and what is NOT
   verified — and collect everything only a live session can settle into one list
   at the top.

### Names, decided now so nothing dithers

| thing | name |
|---|---|
| pure model code | `engine/maia.js` (the `engine/san.js` pattern: no `chrome.*`, node-requireable) |
| weights | `engine/vendor/maia3-5m.bin` (dir already gitignored) |
| offline converter | `dev/convert-maia.py` |
| golden check | `dev/check-maia.js` |
| golden fixture | `dev/maia-golden.json` — **committed** |
| worker messages | `clo-maia-*`, `target: sw / offscreen`, mirroring `clo-engine-*` |
| config | `CONFIG.maia` |
| settings | `cloMaiaEnabled`, `cloMaiaElo`, `cloMaiaTemp`, `cloMaiaTopP` |
| storm switch | `CONFIG.storm.randomSource`: `cdb` or `maia`, default `cdb` |
| bridge | `maiaApi`, null-safe |

**`maiaApi` is a cross-module bridge, so `dev/check-contracts.py` will fail until
it is named in CLAUDE.md.** That is the check working; add the entry in the same
commit.

---

### Stage 0 — how much does the invented path actually matter? (no code)

**Needs a live signed-in Chrome tab, so it needs me.** `stormFunnelBlank` already
counts `noGames` and `stormFunnelLines` already prints it. Run a gather pass on
both courses (453453 and 291847) and read the number.

* §6.4 measured 5 of 14 frontiers with no games *even with the filters relaxed*,
  but that is one probe on a sample.
* §14.22.3 records a 429 storm sending **every** frontier down this path — 86
  ChessDB requests for 1 stored position. Note whether that recurs.
* Report `noGames / frontiers` per course, and the `stops` table for the invented
  walks.

**Acceptance:** a number in this file. If it is under ~10%, say plainly that the
storm use is a nice-to-have and the panel use should lead.

---

### Stage 1 — pin the model (no extension code)

Answer all of these **in writing** in a new `DESIGN-maia.md` before writing any
inference code:

1. **Which size.** 5M is the working assumption. Confirm parameter count, file
   size, and layer shapes.
2. **The weights licence**, from the repo — not the paper's CC BY 4.0.
3. **The exact input tokenisation**: how the 64 square tokens are formed, the
   piece vocabulary, how side-to-move / castling / en passant / rating
   conditioning enter, and **whether any history is required** (the storm's walk
   has history available; the panel generally does not).
4. **The move vocabulary and decode**: size, ordering, how promotions and
   castling are spelled. **Castling is the known trap** — CLAUDE.md section 6c's
   v0.48.1 rule: Lichess writes king-takes-rook (`e1h1`), CloSan and ChessDB
   write `e1g1`. Whatever Maia writes, it is resolved through `sanToUci` /
   CloSan and **never compared raw**.
5. **Whether `torch.onnx.export` produces a clean static graph**, and therefore
   whether the forward pass is hand-written or run under a vendored
   `onnxruntime-web`. **Recommendation: hand-written**, because a 64-token
   transformer is ~400 lines and it satisfies the no-library constraint outright.
   If you choose ort-web, justify it against that constraint in the design doc.
6. **Whether PyTorch is installed on this machine at all** (`py -c "import
   torch"`). If not, stage 2 is blocked on me installing it — say so and stop.

**Acceptance:** `DESIGN-maia.md` exists with §1 answering all six. No code.

---

### Stage 2 — the converter and the golden fixture (offline only)

`dev/convert-maia.py`: `.pt` → `engine/vendor/maia3-5m.bin`. A header (magic,
version, dtype, layer shapes) then flat arrays. Fold anything foldable offline.
Quantisation is a later optimisation — **start fp32 and make it correct**.

`dev/maia-golden.json`: from the **reference implementation**, `(fen, playerElo,
opponentElo)` → top-5 moves with probabilities, ~40 positions across the opening,
middlegame and endgame, plus deliberate awkward cases: castling available both
sides, an en passant capture available, a promotion, and a position with one
legal move.

**Use PUBLIC positions — standard openings and constructed FENs, never anything
walked out of a course.** That is what lets this fixture be committed, unlike
`dev/tmp-courses.json` and the storm FEN dumps, which are gitignored precisely
because course content is not ours to redistribute.

**Acceptance:** the fixture is committed; the `.bin` is not (gitignored). No
extension code. No version bump.

---

### Stage 3 — `engine/maia.js`, and the check that makes it trustworthy

Pure, node-requireable, no `chrome.*`. Input encoding, forward pass, move decode,
and the sampler (temperature + top-p — **this is the "tightness"**, and we own
it).

`node dev/check-maia.js` reproduces `dev/maia-golden.json` within tolerance.

**THIS IS THE STAGE THAT MATTERS MOST, and here is why.** The failure class is a
mistaken square order, side-to-move convention, rating encoding or move decode —
each of which yields **plausible legal moves that are not Maia's**, forever, with
nothing in the console. That is the same shape as the two perspective flips in
§6.5, the castling uci in 6c v0.48.1, and `paintShape`'s silently-dropped colour
key. A model that is subtly wrong is indistinguishable from one that is right.

So: **the check passes before a single line is wired to anything**, and it
asserts probabilities and ordering, not merely "a legal move came back". Include
a control — perturb the square order in a copy and confirm the check fails.

**Acceptance:** check green, plus one control run recorded. Still no extension
wiring, but this stage does bump a version if `engine/maia.js` ships.

---

### Stage 4 — the offscreen worker

`clo-maia-*` mirroring the `clo-engine-*` hub: the service worker is the message
hub, because an offscreen document's `runtime.sendMessage` never reaches content
scripts (CLAUDE.md, section 5b).

**It must NOT touch the Stockfish claim.** Separate worker, separate lifecycle,
never `state.altCheckBusy`. Otherwise §23's deepen pass, §18.2's background
top-up and the walk contend for one engine — and the symptom would be a silently
ungraded retry, which §23 already warns about.

Memory is a non-issue (~20 MB against Stockfish's ~300 MB) but keep the idle
close.

**Acceptance:** a FEN in, ranked human moves out, from a content script, with the
panel's engine unaffected while a search runs.

---

### Stage 5 — wire it to the walk, then MEASURE

`stormRandomLine`'s move source becomes a **parameter**, exactly as `ask` and
`rnd` already are. That is the whole seam, and it is what keeps
`dev/check-storm.js` executing stage 2 of the storm **with no network and no
model**. Do not close over module state.

Keep the ChessDB path; `CONFIG.storm.randomSource` chooses, default `cdb`.

Then measure with `dev/probe-storm.js`: same seeds, both sources, and compare
**survivor rate, eval spread, stop-reason table, and re-entry rate** (§14.18.4's
stop should fire *less* with Maia — that is the prediction, so it is the test).
Dump 20 FENs of each for a human look, which is §12.1's outstanding question
anyway.

**Acceptance:** the comparison table in `DESIGN-maia.md`. Flip the default to
`maia` **only if the numbers say so** — and if they do not, that is a finding
worth the whole stage, not a failure.

---

### Stage 6 — the panel column

**There is a hard constraint here and it is measured, not aesthetic.** CLAUDE.md
section 26: under `html.clo-touch` the games column is *already* hidden when
ChessDB's column is on, and at the panel's own 300px minimum the table overflows
by 11px unaided. **A fifth column does not fit.** So it displaces something or
lives behind a toggle, and **anything added to this table has to re-measure** —
in `dev/harness.html`, at 300/330/360/420px, desktop and touch, with the
stylesheet cache-bust CLAUDE.md's Verification section describes.

Settings go in the panel's own cogwheel menu (section 6b), where the panel's
other preferences live — including the Elo, which is the one setting a user will
actually want to change.

**Opt-in**, like ChessDB's column. Not for privacy this time (nothing leaves the
machine, which is worth saying in the design doc) but because it is a fifth
opinion in a table already carrying four.

**Acceptance:** measurements in the design doc, not "looks fine".

---

### Stage 7 — §19's uncovered-response ranking

Only if 5 and 6 pay off. `stormPack`'s `g` (the reply's own game count) is the
current priority; Maia's probability is the candidate replacement **where the
explorer has too few games to rank**. Read §14.19 and §19.3 first — the
reachability bucket and the draw order are deliberately arranged, and §14.15's
rule stands: **filter the input, never re-weight `stormStoreDraw`**, because a
reversed comparator there is silent from the outside.

---

### When you are done

Write the report (ground rule 8). Say what landed, what was reverted and why,
what the measurements said, and the single list of things only a live session can
settle.
