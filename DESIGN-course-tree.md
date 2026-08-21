# DESIGN — Reading a course as a tree (section 24)

Status: **BUILT (v0.125.1).** §1-§11 are the original design pass; **§12 is the
live ground truth and OVERRIDES §3.5, §5.1 and §8**, §13 is what shipped first
and what was left out, **§14 is the second pass, which overrides §3.1 about the
panel’s shape and §3.3 about a forced COLUMN**, **§15 is the third, which
REVERSES §7’s "no fetch per column" and §3.5’s exclusion of Lichess popularity**
— read §15.1 before assuming that rule is still in force anywhere — §16 is the
frontier/tabs pass, and **§17 gives a position stood on MID-RUN a column of its
own, which is the one deliberate exception to §14.2, and §17.3 is why a ply's
hover may not restore the row's reading unconditionally**. Read §12 before trusting
anything above it: four of §8’s seven questions came back with an answer the
design did not expect.

Section number: **24**, its own module (`initCourseTree`), hosted on
`/course/<bid>/` beside section 21. §6 is the argument for that home.

CLAUDE.md carries section 24's contract surface — the keys, the fold rule, the
cycle guard and the corner it shares; everything else lives here.

---

## 1) The problem

**A Chessable course is not a tree, and its UI is not a tree either.**

A course is a flat list of *variations*, each one a complete linear line from
its own `initialFEN`, grouped into chapters. Branch structure exists only
implicitly, as **shared prefixes across sibling cards**. Nothing in Chessable's
own UI reconstructs it: the trainer drawer lists variation *titles* — the
author's prose, not positions — and the only tree-shaped thing on the site is
the analysis page's move box, which is about the game you are looking at, not
about the course.

What that costs, concretely:

* `1.e4` is stored sixty times in a sixty-variation course, and shown sixty
  times. The *one* fact you want — that this is one move — is nowhere;
* standing after `3...Nf6` there is no way to see that the author covered
  exactly two replies, or eleven;
* a **transposition between two chapters is invisible by construction**. Two
  cards reaching the same position are two unrelated rows in two unrelated
  lists;
* "which of these lines is the main line" is answerable only by reading titles
  and guessing at the author's naming.

This extension has already built both halves of the answer and neither of them
lets you *browse*. Section 6c answers "standing here, what do I play" for **one
position**, live, on whatever board is in front of you. Section 21 answers
"which lines are missing" across **a whole course**, as a ranked list. Between
the single position and the whole-course report there is nothing that lets a
user walk a course's structure at their own pace — which is what "learn this
course" actually consists of before any card is ever answered.

---

## 2) What the field does (research, 2026-08-19)

### 2.1 Four display idioms, and what each is for

| Idiom | Seen in | Good at | Bad at |
| --- | --- | --- | --- |
| **Inline PGN** — variations in parentheses, indented one level | Lichess study/analysis; Chessable's own comments (section 18's clickable lines) | authoring, density, copy-paste | showing branch structure *at all*; a bushy chapter is a wall of brackets |
| **Indented outline** — file-tree, collapsible | LiChess Tools' "indented variations"; ChessBase repertoire; ChessMap's move-tree sidebar | scales, collapses, keyboard-driven, searchable | deep lines burn horizontal space; siblings drift far apart vertically |
| **Node-link graph** — nodes and edges on a canvas | Chess Graph, Chesstrie | "bird's-eye view of the whole repertoire"; branch *and merge* are drawn | detail density; pan/zoom navigation cost; does not scale past a few hundred nodes |
| **Weighted flow** — Sankey, thickness = frequency | Nate Solon's repertoire explorer | *where the mass is* — which lines you actually get, and how you score in them | says nothing about any particular line |

Verdict for our case is in §3. Two of these are dead on arrival here for
reasons that have nothing to do with taste: the graph needs a layout engine and
a canvas (plain JS, no bundler, and it has to live in a panel beside a board),
and the Sankey needs *game* data — frequencies from the user's own play — which
we do not have and which is not what a course is about anyway.

### 2.2 The finding that matters is a **data model**, not a layout

Both of the tools the repertoire-serious community rates highest —
**Chess Position Trainer** and **Chessbook** — store a repertoire as
**positions with candidate moves**, not as games with variations. CPT's own
pitch for it is that a position database gives "detection of any transposition
(even between openings), which is otherwise very hard to find". Chessbook is
built on the same base: a gap there is defined as *an opponent reply your
repertoire does not answer*, and its transposition handling exists to keep a
single decision attached to the resulting position.

That is the difference between a **tree** and a **DAG**, and it is the thing no
PGN viewer gives you, because PGN cannot express it: a PGN variation tree has
no way to say "this node and that node are the same position".

It is also the thing this extension is best placed to do, because **it already
does it** — section 6c's index and section 21's walk are both position-keyed
(§4). A course tree built on shared prefixes alone would be a *worse* answer
than the one already in the file.

### 2.3 Sticks vs bushes

Nate Solon's distinction: a line is either a **stick** (a long forced run with
few branches) or a **bush** (a short run with many branches), and the two are
completely different objects to study. A UI that renders both at the same
visual weight is lying about where the work is — twelve forced moves and one
five-way choice are not twelve units of anything and one.

This is the single most actionable idea in the research, and §3.3 is what it
turns into.

### 2.4 The literature agrees about collapsing, not about layout

The hierarchy-visualisation work (Fu et al., *Indented Tree or Graph?*; the
Bamberg hierarchy-vis survey) is consistent on two points: node-link diagrams
show nesting clearly but use screen space inefficiently and do not scale well,
while **indented trees win for interactive browsing** — and the standard fix
for size in either is *collapse by default, expand on interest*, the
file-browser pattern. Nobody claims a big tree can be shown all at once and
remain readable.

### 2.5 What Lichess power users patch in

Worth stating because it is the closest thing to a controlled experiment on the
author's own current workflow: the most-used Lichess extension (LiChess Tools)
ships, among ~100 features, exactly the three you would predict from the above
— **"indented variations — shows all variations as tree branches, not
inline"**, **transposition highlighting for the current move**, and **Ctrl-F
search over the move list**. The community's answer to Lichess studies is
"make it an outline, mark the transpositions, let me search it".

---

## 3) The decision

**Build the position-keyed DAG once, then browse it as columns.**

Primary view: **Miller columns** (the macOS Finder / Windows Explorer idiom).
Column *n* is the set of moves the course plays at the current position, one
row each; clicking a row opens column *n+1* with the replies. A breadcrumb of
the current line across the top, the board on the left following the selection.

### 3.1 Why columns and not the outline or the graph

* **It matches the question.** Nobody wants "show me 400 lines". The question
  is always *standing here, what do I play, and what else did the author
  cover* — which is section 6c's question, one position at a time. This is the
  browsable form of a thing the file already answers.
* **Transpositions become free rather than special.** Columns are keyed by
  *position*, so two chapters arriving at the same position are one column,
  with no merge logic and no edge crossing a layout. A graph has to *draw* the
  merge; an outline has to duplicate the subtree or lie. A column browser
  simply has one column, and the "reached from N lines" count in it is the
  whole of the transposition UI.
* **Fixed screen cost regardless of depth.** Twenty plies deep is still three
  visible columns and a breadcrumb.
* **No layout engine, no canvas, no bundler.** A flex row of scrollable lists.
* **It degrades to a phone** as one column plus a back breadcrumb — the same
  interaction, not a different mode. (`html.clo-touch` already exists; this
  must be measured in `dev/harness.html` before it is believed.)

### 3.2 The outline is the *secondary* view, and still worth having

Columns are bad at exactly one thing: reading a chapter linearly, and Ctrl-F.
So the second view is the indented outline of §2.1 over one chapter, with the
same folding as §3.3. It is cheap once the DAG exists, and it is the thing
LiChess Tools users are actually asking for. **Not v1**, but the data model
must not preclude it — which it does not, since an outline is a depth-first
walk of the same structure.

### 3.3 Fold the forced runs — this is where the legibility comes from

A position with **one** continuation is not a decision. Chain it into the row
above: a row reads `3.Nf3 Nc6 4.Bb5` and a new column opens only where the
course actually branches. Direct application of §2.3, and it is what turns a
20-ply variation into two or three rows.

Two rules for the fold, both of which decide whether it helps or misleads:

* **fold only on branching factor 1**, never on "the other moves look
  unimportant". The fold must be lossless;
* **a folded run is still clickable per ply** (the board has to be able to
  stand inside one), so the fold is a rendering of the run, not a discarding
  of it.

### 3.4 Weight every row

How many of the course's variations pass through this move, as a count and a
bar. That is the Sankey insight (§2.1) without needing game data: at a glance
the main line is fat and the sideline is thin, and a bush is visibly a bush.
`n` already exists in the index (§4).

### 3.5 What a row carries

The tree is the frame; the value is what can be hung on it, all of which this
extension already computes:

* the move, its weight (§3.4), and how many source variations reach the
  position (the transposition count);
* **repertoire badges (6c)** — in / transposition / not covered / risk;
* **this session's failures (16)** and **pinned mistakes (16b)** — a course
  tree that shows *which branches you keep getting wrong* is something no other
  tool can do, because nobody else has both halves;
* **coverage severity (21)** where a report has been run;
* `isKey` (§4.2), if it is populated — an author's own "this is the move that
  matters".

Deliberately **not** on a row in v1: Lichess popularity. It is one explorer
request per position and a column is a dozen positions the moment it opens;
§7's "never fetch per column" rule outranks it. The panel beside the board
already answers it for the position you are standing on.

**REVERSED in v0.123.0 (§15).** The arithmetic above is wrong: a column is one
POSITION, not a dozen, and one explorer request answers every move of it. What
was being priced was one request per ROW, which is still refused.

---

## 4) The data — most of which exists

### 4.1 `buildRepertoireIndex` already *is* the graph

[content/lichessable.js:3207](content/lichessable.js:3207) walks a whole course
into:

```
answers : repKey → Map(uci → { san, n, names[] })
seen    : Set(repKey)          // every position the course passes through
ends    : [repKey]             // line ends, minus the answers' own keys
```

Position-keyed, transposition-merged, `n` is §3.4's weight and `names` is the
source-variation list. That is §3's structure, built and cached today.

What it does **not** carry, and a browser needs: **depth** (to order columns
and cap a cycle), **parent links** (for the breadcrumb — though the browser can
keep its own path), the **oid** behind each branch (to open the variation, or
hand it to sections 12 / 19d), `isKey`, and chapter.

**Do not extend that index in place.** It is cached in `chrome.storage.session`
under `CONFIG.repertoire.indexVersion`, and it is read by the badges in *every*
document including the mt1 iframe. A shape change there costs 6c a version bump
and a cache-wide invalidation, for a feature 6c does not use. Build a second
walk, `buildCourseTree`, beside it, sharing `fetchCourse` and `walkVariation`.

### 4.2 What `getList` gives, and what it does not

Established for section 21 (DESIGN-repertoire-coverage.md §2.4), not re-checked
here:

* one call per course, ~180 KB for 77 variations, and it **works on a course
  the user does not own** — so a bought course is a usable source, which is the
  case that matters most for this feature;
* `moves[].san` **carries the move number** (`["1.e4", "c5", "2.Nf3", …]`);
  `sanOfMove` already strips it;
* `moves[].isKey` exists on the raw payload. `reduceCourse` **drops it** — if
  §3.5 wants it, that is a field to add to the reduced shape, and therefore a
  cache-shape change of its own (`CONFIG.coverage.cacheKey`);
* `initialFEN` is real — a tactics course starts mid-game, so every walk starts
  from it;
* an **empty `moves` array** is a legitimate card (the informational `1.--`
  one, which is also section 16e's sync carrier). Skipped, as everywhere else;
* **there is no chapter field.** Grouping by chapter costs one
  `editVariations` call per chapter. §8 asks whether that is worth it; the
  column browser does not need it, and the outline (§3.2) does.

### 4.3 The walk

`walkVariation` already gives exact positions per ply via `CloSan` +
`sanToUci` + `fenAfterUci` — which is what makes castling and en passant right,
and is the only thing that works on a course the user has edited. It **returns
null rather than guessing** on an unresolvable SAN, which is the behaviour §7
depends on.

Chunking: `REP.chunkVars` yields every N variations because a 500-line course
is a few hundred thousand `CloSan` calls. The same rule applies here — and
unlike 6c's index, this walk runs while the user is watching, so it needs a
progress line, not just an eventual answer.

---

## 5) The two hazards

### 5.1 `repKey` merges more than a browser should merge

`repKey` is **placement + side to move only** — castling rights and en passant
deliberately dropped, for reasons CLAUDE.md argues at length under 6c (in
review, the panel's FEN is DOM-derived and its castling is a heuristic, so
keying on all four fields would drop the badges after every rook move).

That trade is right for badging and **wrong for a browser**, where both sides
of the comparison come from `walkVariation` and are therefore exact. Two
positions differing only in castling rights are two different positions, and a
tree that merges them shows a column of moves that cannot all be played.

**Use `cacheKey`** — the four-field key section 21's walk already uses — and
say so in the code beside the key, because two neighbouring features using two
different position keys will otherwise read as an inconsistency someone will
"fix".

### 5.2 A position-keyed graph can cycle

A tree walk terminates. A DAG keyed on positions is **not acyclic** in general
— a repetition, or a knight going out and back, closes a loop, and a column
browser following it recurses for ever. Needs an explicit visited set along the
current path plus a depth cap, and a decision about what a row that closes a
loop should *say* (probably: it is a transposition, mark it as one and let the
click go there — which is the same UI as §3.1's merge).

Neither existing consumer hits this: 6c only ever looks up one position, and 21
walks source lines that are themselves finite.

---

## 6) Where it lives

**`/course/<bid>/`, as a second panel beside section 21's**, body-mounted and
fixed, gating itself on the current URL from its own 500 ms poll — the shape
`initCoverage` already has, for the reason it has it (a course page is reached
by `pushState`).

Why there and not in the trainer:

* it is a **whole-course** view, and that is the only page that is about a
  whole course;
* section 21 already fetches and caches the course on that page, so opening the
  tree after a coverage run costs **zero fetches** — same `fetchCourse`, same
  12 h `chrome.storage.session` entry;
* the trainer's screen is fully spoken for (DESIGN-ui-inventory.md), and a tree
  during a session is a spoiler for the card being answered.

Deliberately **not** a second host in v1. The obvious later one is the Lichess
panel's own header on `/variation/<oid>/` ("show me where this line sits"),
which is a different feature and can reuse the same walk.

---

## 7) What must never happen

* **It never writes.** Read-only, top to bottom. Editing from a tree row is
  tempting and belongs to sections 12 / 19c / 19d, which already do it safely.
* **Nothing of ours enters Chessable's DOM.** Body-mounted, like every other
  surface here.
* **No fetch per column.** The whole course is one call, already cached. A
  browser that fetches as you click is a browser that rate-limits the user out
  of their own course. **LIFTED IN v0.123.0 — see §15.1.** A column is ONE
  position and one explorer request answers all of it, which is what makes the
  scan two to four requests a click rather than a dozen. Everything else in this
  list still holds, including "it never writes".
* **It must not freeze the page.** Yield every `chunkVars`, as 6c does.
* **An unresolvable line is dropped and COUNTED, never guessed at.** Section
  21's lesson (DESIGN-repertoire-coverage.md, opening section): taking a parse
  detail at face value made 76 of 77 lines unplayable and produced a confident
  **"0 of 77 present · 0 missing"**. If most of a course fails to replay, the
  tree must **refuse**, with the offending lines named — a systematic parse
  failure must never come back looking like an answer.
* **Never claim a merge that is not one** (§5.1). A wrongly merged column is
  the one failure of this feature that is both invisible and actively
  misleading.

---

## 8) To verify live, BEFORE the code is trusted

1. **How bushy is a real course?** Max branching factor, node count and walk
   time for the biggest course on the account. If a typical column is two rows
   deep and 90% of the tree is stick, §3.3's fold is the whole feature and the
   columns are nearly free; if columns routinely run to 15 rows, they need
   sorting and a scroll design.
2. **Do sibling variations actually share exact prefixes?** They should — same
   author, same moves — but an edited or re-imported line could differ in a
   field `cacheKey` compares. Measure how many positions merge under `repKey`
   but *not* under `cacheKey`: that number is the size of the §5.1 trade.
3. **Is `isKey` populated** on a real course, and does it mean what §3.5 hopes?
4. **Does a cycle actually occur** in a real course (§5.2), or is the guard
   purely theoretical? Either answer is fine; the guard ships regardless.
5. **What does a `color: 'both'` variation do** to a column's side-to-move
   labelling? `courseSide` is the existing fallback; check it is enough.
6. **Chapter grouping**: is one `editVariations` per chapter fast enough to be
   worth it, and does the response's `course.color` agree with `courseSide`?
7. **`html.clo-touch` in `dev/harness.html`** — a three-column browser at phone
   width, and the one-column-plus-breadcrumb degradation. Measure; do not
   eyeball.

---

## 9) Rejected

* **A node-link graph on a canvas.** The prettiest demos in the field
  (Chess Graph, Chesstrie) and the wrong tool here: a layout engine, pan/zoom
  as the primary navigation, poor detail density, and it does not fit beside a
  board. §2.4's literature says it does not scale, and our courses are big.
* **A Sankey / weighted flow.** Needs the user's own game frequencies. We have
  Lichess popularity per position, which is a *different* claim (what the world
  plays, not what you meet), and §7 forbids fetching it per column anyway.
* **Extending `buildRepertoireIndex`'s cached shape** (§4.1).
* **Building the tree from shared SAN prefixes.** Simpler, and it throws away
  the one thing (§2.2) that makes this better than a PGN viewer.
* **A tree in the trainer** (§6).

---

## 10) Non-goals

* editing, adding or deleting from the tree — sections 12 / 19c / 19d;
* merging several courses into one tree — that is section 21's question, asked
  the other way round;
* training from the tree. It is a reading surface. Section 20's drill and
  section 18's quiz are how a position becomes a question, and either could be
  launched *from* a row later — but not in v1, and not before §8.

---

## 11) Sources (2026-08-19)

* LiChess Tools — <https://github.com/Siderite/lichessTools/blob/stable/README.md>
* Chess Position Trainer, "Chess Position vs. Chess Game Database" —
  <https://www.chesspositiontrainer.com/index.php/en/features/79-features/78-chess-game-database>
* Chessbook — <https://chessbook.com/>
* Chess Graph — <https://www.chessgraph.net/>
* Chesstrie — <https://www.chesstrie.com/>
* ChessMap — <https://github.com/NellowTCS/ChessMap>
* Nate Solon, "Chess Repertoire Explorer" (Sankey) —
  <https://natesolon.github.io/blog/tree>
* Nate Solon, "Sticks vs. bushes" — <https://www.zwischenzug.gg/p/sticks-vs-bushes>
* Fu et al., "Indented Tree or Graph? A Usability Study of Ontology
  Visualization Techniques" — <https://chisel.cs.uvic.ca/pubs/fu-ISWC2013.pdf>
* "Effective Visualization of Hierarchies" (Bamberg) —
  <https://vis-uni-bamberg.github.io/hierarchy-vis/>

---

## 12) LIVE GROUND TRUTH (2026-08-19) — this OVERRIDES §3.5, §5.1 and §8

Measured with `dev/probe-course-tree.js`, which runs the REAL `engine/san.js`
and a faithful copy of `walkVariation` over a `getList` dump of all three
courses on the account. **Read this before §8**: four of its seven questions
came back with an answer the design did not expect, and two of them change what
v1 builds.

| Course | vars | plies | distinct positions | walk |
| --- | --- | --- | --- | --- |
| 291847 Intermediate Starter Kit (bought) | 81 (9 informational, 1 unplayable) | 1745 | 1109 | 1.2 s |
| 453453 Testing course | 80 (1 informational) | 1661 | 546 | 1.2 s |
| 455941 Testing Repertoire | 6 | 104 | 74 | 0.06 s |

### 12.1 §8.1 — a course is almost all stick (CONFIRMS §3.3)

Branching factor over every position with at least one continuation:

| Course | bf=1 | bf=2 | 3 | 4 | 5 | 9 | max |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 291847 | 1091 (98%) | 13 | 3 | 2 | — | — | **4** |
| 453453 | 509 (93%) | 23 | 7 | 4 | 2 | 1 | **9** |
| 455941 | 71 (96%) | 2 | 1 | — | — | — | **3** |

**93–98% of positions are forced.** A column is two to five rows; the worst
seen anywhere is nine. So §3.3's fold is indeed the whole feature, columns are
nearly free, and **they need no sorting design and no scroll design** — a
column fits on a phone without either. §3.1's "fixed screen cost" holds.

### 12.2 The fold as specified is TOO GREEDY — and this is the one thing v1 must get right

A model game is a single unbranched line, so folding on bf=1 produces **one row
carrying eighty plies**:

```
column 1: 4 row(s) —
  e4 [27]
  | Nf3 Nf6 c4 c5 g3 Nc6 Bg2 d6 d4 cxd4 … Qg5+ [2]      ← 80 plies, one row
  | d4 e6 Nf3 f5 e3 Nf6 Be2 d5 O-O Bd6 … Rxb7 [2]       ← 96 plies, one row
```

The fold is still *correct* (§3.3's losslessness holds — bf really is 1 the
whole way), and it is still the right rule. What is missing is that **a row has
a display cap**: show `CONFIG.courseTree.foldShow` plies and then `…+72 more`,
with the run expandable in place. The run stays clickable per ply either way,
which §3.3 already required.

### 12.3 §8.2 — `repKey` merges NOTHING extra on a real course

Positions that collapse under `repKey` (placement+side) but not under
`cacheKey` (placement+side+castling+ep): **0, 0 and 0**, out of 1109, 546 and
74 positions.

So §5.1's trade is currently of size zero, and using `cacheKey` costs nothing
and risks nothing. Build on `cacheKey` as §5.1 says — not because the merge was
observed to bite, but because the two sides of *this* comparison are exact and
there is no reason to accept a lossy key. The measurement is what makes that a
free choice rather than a bet.

### 12.4 §8.3 — `isKey` is NEAR-UNIVERSAL, so it is NOT a signal. §3.5 is wrong about it

| Course | plies flagged `isKey` | on how many variations |
| --- | --- | --- |
| 291847 | 1381 / 1745 (**79%**) | 71 of 71 playable |
| 453453 | 1649 / 1661 (**99%**) | 79 of 79 |
| 455941 | 100 / 104 (**96%**) | 6 of 6 |

§3.5 hoped `isKey` was "an author's own *this is the move that matters*". It is
not — it is what Study Key Moves quizzes, and a course marks nearly everything.
Highlighting 79% of a tree highlights nothing.

**Dropped from v1**, and that is a saving rather than a loss: it was the one
row field that needed a new field in `reduceCourse`'s reduced shape, and so a
bump of `CONFIG.coverage.cacheKey` and a cache-wide invalidation shared with
section 21. **The course cache shape is now unchanged by this feature.**

### 12.5 §8.4 — a cycle DOES occur, in a bought course

DFS over the position graph of 291847 found **one back-edge into the live path**
(deepest stack 125). 453453 and 455941: none.

So §5.2 is real, not theoretical, and on the course a user is most likely to
open first. The guard ships as specified: a visited set along the current path,
a depth cap, and a row that closes a loop is drawn as the transposition it is.

### 12.6 §8.5 — no `color: 'both'`, but a course has MANY ROOTS

Colours seen: `{white: 66, black: 15}` on 291847, `{black: 80}` on 453453,
`{black: 6}` on 455941. No `'both'`, so `courseSide` is not stressed — but note
291847 is genuinely mixed, so **`courseSide` answers 'w' for a course with 15
Black lines in it**. Side-to-move is read off the position's own FEN and needs
none of this; only a repertoire badge (6c) needs "whose move is this", and it
should take the *variation's* colour where it has one.

The bigger finding, which §4 does not mention at all:

```
291847: 39 distinct start positions
        the standard start covers 34 lines
        the other 38 cover exactly ONE line each   (tactics, mid-game FENs)
453453: 1        455941: 1
```

**A course does not have a root.** v1 therefore opens on the commonest start
position and lists the rest as their own entries — 38 one-line tactics are not
a tree and must not pretend to be one.

### 12.7 A REAL BUG FOUND, and it is section 21's too

291847's "Scotch 4...Qh4?!" replays as unplayable at ply 13:

```
r1b1k1nr/pppp1ppp/2n5/8/1b1Nq3/2N5/PPP1BPPP/R1BQK2R w KQkq - 0 7   Ndb5
```

Chessable writes **`Ndb5`**. Only one knight can *legally* reach b5 — the c3
knight is pinned by the bishop on b4 — so the strictly correct SAN is `Nb5`,
which is what `CloSan.moveToSan` produces, and `sanToUci`'s exact string
compare then fails and the whole line is dropped.

**Chessable over-disambiguates against pseudo-legal rivals.** That is a
convention difference, not a corrupt line, and it silently costs section 21 a
line reported as "could not be replayed" today.

Fixed in `sanToUci` as a SECOND PASS that only ever runs when the exact compare
has already failed — so it can turn a refusal into a resolution and can never
change a move that already resolved. It parses the written SAN into
(piece, from-file?, from-rank?, target, promotion), filters the legal moves by
whichever hints are present, and **resolves only when exactly one survives**.
§7's "never guessed at" is intact: an ambiguous relaxed match still refuses.

### 12.8 What is still unverified

* §8.6 chapter grouping — not needed by the column browser, untouched;
* §8.7 `html.clo-touch` in the harness — done at the end of the build, not here;
* walk cost on a 500-variation course. 1.2 s for 80 variations in node says a
  500-line course is ~8 s, which is why the walk yields and reports progress.

---

## 13) What shipped (v0.115.0)

`initCourseTree` in `content/lichessable.js`, ~700 lines including its comment
block; the styles are one block in `content/lichessable.css`; the harness
replica is `#s-ct` in `dev/harness.html`; the checks are
`dev/check-course-tree.js` (walk/fold/columns) and `dev/check-san-relaxed.js`
(§12.7's fix). `dev/probe-course-tree.js` is the measurement pass §12 is written
from and stays runnable.

### 13.1 As designed

* the position-keyed walk (§3, §4), on `cacheKey` (§5.1 as amended by §12.3),
  built by `buildCourseTree` beside `buildRepertoireIndex` rather than in it;
* Miller columns with a breadcrumb, the board on the left following the
  selection, three columns on screen and the rest carried by the crumb (§3.1);
* the fold on branching factor 1, lossless, every ply clickable, with a display
  cap and "+N more" (§3.3 as amended by §12.2);
* the weight bar and count (§3.4);
* the cycle guard, a visited set per path plus `maxDepth`, and a row that closes
  a loop marked "repeats" (§5.2, confirmed real by §12.5);
* the many-roots list (§12.6);
* the refusal on a course that will not replay (§7);
* repertoire badges from section 6c (§3.5), read-only and optional;
* the phone shape, one column plus the breadcrumb (§3.1) — as a `@container`
  query, so `dev/harness.html` can actually measure it.

### 13.2 Deliberately not built

* **`isKey` on a row.** §12.4 measured it at 79-99% of plies. Dropping it is
  what keeps `reduceCourse`'s shape — and so section 21's cache — untouched.
* **The unprepared-reply WARNING** (6c's third badge). It is comparative on
  Lichess popularity, and §7 forbids fetching that per column. The two positive
  badges cost nothing, being pure lookups in an index already in memory.
* **This session's failures (16) and pinned mistakes (16b) on a row**, from
  §3.5. Both are keyed by `(oid, mkey)` inside a trainer session and the tree is
  a course page; the join is real but it is a second feature, not a field.
* **Coverage severity (21) on a row**, same reason — it needs a report to have
  been run, and the two panels do not talk.
* **The indented outline** (§3.2). Still cheap now the DAG exists, still not v1.
* **Chapter grouping** (§8.6). The column browser never needed it; the outline
  will.

### 13.3 Measured on the finished thing (2026-08-19, live)

Desktop 880x474, three 197px columns beside a 240px board; under 780px of panel
width the board goes above and one column remains, 340x411 with no horizontal
overflow; `html.clo-touch` takes a row from 41px to 55px and the launcher from
98x31 to 112x37. On course 291847: 72 lines, 1118 positions, 39 starts, four
rows in the root column, board drawn from the PERSISTED piece harvest with no
glyph fallback (the page has no board of Chessable's to clone from). On 453453
with "Testing Repertoire" nominated, the badges mark exactly 1.e4 c5, 2.Nf3,
2.Nc3 and 2.Bc4 and nothing else, which is that repertoire's whole content.

### 13.4 The two things the first build got wrong

Every row printed up to six variation names, and at ~200px a name takes a line
of its own — so six of them buried the moves the row exists to show. Fixed by
splitting the cap in two: `maxNames` is what the INDEX remembers (all of them,
in the count's tooltip) and `linksShown` is what a ROW draws. Only visible on a
real course; the harness replica would have shown it too, had it been written
with six.


Second: a tactic’s row read **`24.Rc4`** and stopped, with nothing saying why.
The fold was RIGHT — one of the three lines playing Rc4 finishes immediately
after it, and stopping there is the rule that keeps the “line ends” tag attached
to the correct position — but the tag was only drawn where NOTHING continues, so
in the one case where the stop needs explaining it was silent. The tag is now
drawn whenever a variation finishes at a position, counts them (`ends` carries
`n` as well as its capped name list) and says “though others play on” in the
tooltip when the course does. A one-ply row with no explanation reads as a bug.

---

## 14) Second pass (v0.116.0) — four changes from using it

All four came out of looking at the thing on a real course, which is why none of
them is in §1-§11. Each is small; together they change what the panel is.

### 14.1 It fills the window

`inset: 16px` rather than 880px in a corner. §6 put it beside section 21's panel
and inherited that panel's shape, which was wrong: coverage is a report you read
while the course page is still doing something behind it, and this is a browser
you are *inside of*. Nothing on the page underneath is relevant while it is open.

Two numbers stop being declarable the moment the panel is the window:

* **how many columns** — `columnsThatFit()` divides the measured stage width by
  `colMinPx` (210), capped at `maxColumns` (8, a ceiling rather than a layout);
* **how big the board** — `sizeBoard()` clamps the stage's measured HEIGHT into
  `[boardMinPx, boardMaxPx]` (220-560). The board is square, so the stage's
  height is what limits it. Live at 1920x863: a 560px board beside four 314px
  columns.

`window.resize` therefore REDRAWS rather than reflows — a resize changes which
columns are on screen, not just how wide they are.

And a column is capped at **360px**. With the panel maximised, `flex: 1` gave a
lone column 1521px of mostly nothing, which is a worse read than the 197px it
replaced. The leftover space belongs to the board.

### 14.2 A column with one row is never drawn

A column offering one move is not a decision — it is the same non-decision §3.3
already collapses inside a row, one level up — and a White repertoire opens with
a whole column containing nothing but "1.e4". `columnsFor` now takes such a
column automatically, marks it `auto`, and `renderColumns` skips it; the
breadcrumb carries its moves.

This is the change with the most consequences, all of them in navigation:

* a column carries **`prefix`**, the plies leading to it, because a later
  column's plies stopped being an index into `ct.path` the moment forced columns
  are walked through without the path holding them. `goTo(col, row, take)` is
  `col.prefix.concat(...)` — no arithmetic on an index that can lie;
* **`standingPlies(cols)`** is what the board and the breadcrumb read: the path
  when the user has chosen one, otherwise whatever the auto-take walked through.
  Without it the board would sit two forced moves behind the leftmost column
  actually on screen, and the breadcrumb would say "start" over a position three
  plies in;
* **standing mid-run is untouched.** That case breaks out of the walk *above*
  the auto-take, so a ply picked out of a folded run is still a place you can
  stand. `dev/check-course-tree.js` asserts both halves, and a control with the
  auto-take disabled fails on exactly the five assertions that cover it.

Course 455941 is the live case: it opens "1.e4 c5" and nothing else.

### 14.3 Hovering a row previews it

The row's own position on the board, with its branching move drawn as an arrow.
The position **before** the move on purpose: an arrow is a claim about a move
being available *here*, and holding the position still is what lets two
candidates in one column be compared by moving the pointer between them.

**Only the board redraws** (`setPreview`). Rebuilding the columns under the
pointer would drop the very row being hovered, so its `mouseleave` would never
arrive and the board would stay stuck on the preview. `mouseenter`/`mouseleave`
rather than pointer events: a finger has no hover, and a tap that both previewed
and navigated would flash the board through a position it is about to leave.

The hover arrow and the last-move tint are deliberately different treatments —
one is a move not yet made, the other a move already played.

### 14.4 Only the selected row names its variations

§13.4 had already cut six names to one. One per row was still a name on every
row, and at a few hundred px each takes a line of its own — a column of prose
over the moves the rows exist to show. The name only becomes the question once a
branch has been chosen, so it is drawn only on the row the path took. Every
row's names are still one hover away, in the count's tooltip.

### 14.5 Measured on the second pass (live, 1920x863)

| | |
| --- | --- |
| panel | 1873x831 (`inset: 16px`) |
| board | 560x560 (`boardMaxPx`), 338 on a 360px panel (`max-width: 100%`) |
| columns | four at 314px on 291847; one at 360px (the cap) on 455941 |
| a column's height | its content — 181px for three rows, not the stage's 701px |
| forced opening | 455941's "1.e4 c5" column gone, carried by the breadcrumb |
| links | one, on the selected row only |
| horizontal overflow | none, wide or narrow |

Columns HUG their content rather than stretching. A Finder column browser
stretches them; §12.1 says a column here is two to five rows, so stretching
leaves most of a maximised panel as empty column. `max-height: 100%` is the
safety valve for the nine-row worst case.

---

## 15) Third pass (v0.123.0) — the Lichess scan (24b) and the browsing controls (24c)

Two changes, one of which **reverses a rule §3.5 and §7 stated flatly**. That is
the important part of this section: read §15.1 before assuming the old rule is
still in force anywhere.

### 15.1 "No fetch per column" is lifted, and exactly how far

§3.5 kept Lichess popularity off a row, and §7 said:

> **No fetch per column.** The whole course is one call, already cached. A
> browser that fetches as you click is a browser that rate-limits the user out
> of their own course.

The rule was right about the **cost** and silent about the **value**, and the
value turns out to be the single most useful thing this panel can show: *the
author covered these three moves — here is what the other 40% of games play.*
A course tree without it answers "what did the author write"; with it, it
answers "what did the author MISS", which is the question a repertoire owner
actually has.

What makes it affordable is one fact the original rule did not use:

> **A COLUMN IS ONE POSITION, and one explorer request answers every move of a
> position.**

So the price is **one request per column DRAWN** — at most `maxColumns` (8), in
practice two to four, and most of those already sitting in the `cloPopularityCache`
that sections 14 and 21 fill and share. §3.5's fear was one request per *row*,
which would have been a dozen per click; that version is still refused.

Everything in the implementation follows from that being the only justification,
and each of these is load-bearing rather than polite:

* **opt-in, off by default** (`cloTreeLichess`, storage.local). Opening a tree is
  not asking for network traffic;
* **only DRAWN columns**. Never a row, never a hover, never the plies inside a
  folded run, and never a column the breadcrumb is carrying. The call sits in
  `renderColumns`, not in `columnsFor` — the walk goes *through* auto-taken and
  off-screen columns, and asking about those would turn "per column drawn" into
  "per column walked";
* **one at a time**, `requestGapMs` apart, section 21's 429 cooldown and single
  retry;
* **a failure is remembered** (`ct.db` holds `{error}`), or a rejected token
  would be one request per redraw for ever. Switching the toggle off and on is
  the retry;
* **`ct.dbSeq` fences staleness.** A course switch bumps it and everything in
  flight is dropped rather than written into a tree it is not about.

### 15.2 The three things a scanned column says

1. **A share chip on each row** — how often real games play that move. On the
   row's FIRST move only: the rest of a folded run is forced, so its share is
   the first one's by construction.
2. **`covers N%` in the column head** — the games the course's answers account
   for, summed over **every** answer at the position rather than over the rows
   drawn (`maxRows` is a runaway guard, and a coverage figure that quietly
   ignored the rows past it would be wrong rather than capped). This is the one
   number the whole feature exists to produce.
3. **A block of the moves the course does not play**, over `gapMinShare`, capped
   at `gapMaxRows`, commonest first, UNDER the course's own rows and never
   merged into their sort — a row that leads nowhere sitting between two that do
   would read as a branch.

Gap rows are deliberately **not navigable**. There is no subtree behind one,
because the author never wrote one. Hovering puts it on the board (§14.3's arrow,
unchanged) and a link opens the position it leads to on Lichess. Nothing is
offered that would WRITE — §7 stands, and sections 19c/19d are where adding a
line safely already lives.

### 15.3 Whose move it is decides what a gap MEANS — and `courseSide` cannot answer it

Section 6c's rule, for section 6c's reason: on the **opponent's** move an
uncovered popular reply is a hole the user will meet; on their **own** move it is
a repertoire decision (1…c5 over 1…e5). Drawing the second as a gap would paint
every course red for having an opinion.

`courseSide` cannot be the source, and §12.6 is why: it is a course-wide
**majority**, and it answers `'w'` for course 291847, which holds fifteen Black
lines. So the walk now counts, **per move**, how many lines of each colour play
it (two ints on an `answers` entry), and `positionSide` sums them over the
position's own moves. A position both colours pass through answers `null` and the
distinction is simply not drawn — the fail-soft arm, and it fires on a real
course.

This is the judgement in the whole feature most able to be wrong without anyone
noticing, which is why `dev/check-course-tree.js` asserts it directly and a
control (`positionSide` falling back to `courseSide`) fails on exactly the
assertion that covers it.

### 15.4 The explorer's SAN is resolved, never compared

`repertoireMoveState` learned this in v0.48.1 and the lesson transfers whole:
Lichess writes castling as king-takes-rook, Chessable over-disambiguates
(§12.7), and the only stable identity for a move is the pair of squares. Every
explorer SAN goes through `sanToUci` against the column's own position, and one
that will not resolve is dropped rather than guessed at. Memoised on the entry,
since a position's answer never changes and this is ~50 `moveToSan` sweeps.

A control that compares the raw SAN fails four assertions, including the
castling one.

### 15.5 The shared cache is RE-READ before it is written

`savePopCache` writes the object whole, and this panel keeps its read open for as
long as it is on screen — minutes, during which the coverage report on the same
page can fill hundreds of positions of its own. Saving our snapshot back would
delete every one of them silently, and the only symptom would be section 21
re-fetching what it had already paid for. `flushDbCache` therefore loads fresh,
merges only the entries WE added, and saves that. Section 21's own window is one
run rather than one sitting, which is why it has never needed this.

### 15.5a A REDRAW MUST NOT HAPPEN INSIDE A DRAW (found live, v0.123.1)

The panel drew the same column twice, and only on the SECOND course opened in a
session. `renderColumns` calls `wantDb` from inside its own loop over the
columns; `wantDb` starts `drainDb`; and an `async` function runs synchronously
up to its first EXECUTED await. Once `ct.dbCache` is loaded the
`await loadPopCache()` is skipped by its own `if`, so a position already in the
cache was answered with no yield at all — putting a whole `renderTree` inside
`renderColumns`'s loop. The inner one cleared the host and drew every column;
the outer one then carried on appending its own.

`refreshColumns` is therefore DEFERRED (`setTimeout(0)`, coalesced) rather than
guarded by a re-entrancy flag: a flag would have to drop the inner redraw, and
that redraw is the one carrying the new data.

Worth stating as a class, not an incident: **an async function is not
asynchronous.** Every await in this file that sits behind an `if` is a place the
same shape can recur.

### 15.6 The keyboard (24c)

A Miller-column browser is a keyboard object — Finder's is, Explorer's is — and
this one shipped pure mouse. `↑↓` pick a branch in the frontier column, `←→` move
in depth, `Home` returns to the start, `f` flips, `/` focuses the find field,
`Esc` closes. Bound on `document` in **capture** phase (section 18's overlays'
discipline: the panel fills the window and is almost never the focused element),
standing down for a modifier chord and for any focused text field, so the
browser's own Ctrl-F and every box on the page underneath are untouched. The
handler is wrapped in a try/catch for section 23's reason: a key handler that
throws is *silent*.

`goShallower` goes through the target column's own `prefix`, never arithmetic on
`ct.path` — §14.2's rule, and the reason it exists.

The shortcuts say so themselves, in one dim line under the summary. A shortcut
nobody is told about is a shortcut nobody uses, and the tooltips only reach a
pointer.

### 15.7 Finding a line by name (24c)

§2.5's third patch-in, and the one thing columns are worse at than an outline.
The walk now keeps `lines` — `{ oid, name, startCk, ucis }` per variation — and a
match **stands on** the line: `rootKey` and `path` are set and everything else
follows as if the user had clicked their way there, so a search result is a place
to carry on browsing from rather than a dead end. The path is rebuilt from
`answers` at navigation time rather than stored, precisely so it cannot disagree
with what the columns will draw.

Not the indented outline of §3.2, which is still not built and still cheap.

### 15.8 Measured on the third pass (harness, replica at 880px)

| | |
| --- | --- |
| header | 878x39, no wrap, five controls beside the title |
| find field | 210x24 (34px and 16px type under `html.clo-touch`, section 22's anti-zoom rule) |
| key hint | one 12px line |
| a row | 59px normal, 49px for a gap, in a 197px column |
| gap heading band | 18px |
| `covers N%` / share chips | 57x12 / 28x12 |
| horizontal overflow | none |
| at 380px panel width | header wraps to 71px with the find field on its own line, one column, no overflow |
| under `html.clo-touch` | row 55px, gap row 62px, toggle 73x32, still no overflow |

### 15.9 Still not built

Everything in §13.2 except the two items §15 delivers, plus:

* **the tree's own gaps fed into section 21's report.** The two panels still do
  not talk, and this is now the obvious join: 21 ranks the gaps between two
  COURSES, 24b shows the gaps between a course and the WORLD. Same explorer
  cache, same walk, different question;
* **a gap row launching anything.** §7 and §10 both hold: it is a reading
  surface, and 19c/19d already add a line safely from a board.

---

## 16) Fourth pass (v0.124.0) — three changes from using it, all about the pointer

Three complaints from a real browse of course 453453, each of which turned out to
be the same shape of problem: the panel answering a slightly different question
from the one the pointer was asking.

### 16.1 Hovering ONE move of a run (24)

§14.3 gave the ROW a hover: the position BEFORE its branching move, with that
move drawn as an arrow. That is right for the row, and it is what lets two
candidates in a column be compared by moving the pointer between them.

It is the wrong answer for a *ply inside a folded run*. §12.1 says 93-98% of a
course's positions are forced, and the whole reason the fold exists is that a
20-ply variation is two or three ROWS — so most of the moves on screen are
`.clo-ct-san` buttons inside a run, and pointing at the eleventh of them and
being shown the position before the FIRST is not an answer to anything. What the
pointer is asking there is "what does it look like at this point of the line".

So `setPreview` grew a third argument, the ply:

| pointing at | position shown | the move |
|---|---|---|
| the row | BEFORE its first move | drawn as an ARROW — a claim about a move available here |
| one ply of the run | AFTER that ply | TINTED, exactly like the last move — a move already played |

The two treatments were already in `renderBoard` for exactly this distinction
(§14.3's own note: "an arrow at this size is thin and a one-square move barely
registers"); the ply reading simply reuses the tint arm with the hovered ply
standing in for the last one.

**Two things this cost, both of them the kind that fails quietly:**

* `mouseenter`/`mouseleave` do NOT fire between an element and its own
  descendant. Entering a ply button therefore never fires the row's `mouseleave`,
  and coming back out of it never re-fires the row's `mouseenter`. So the ply's
  own leave handler must *restore the row's reading*, not clear it — clearing
  would blank the board while the pointer is still inside the row. Leaving the
  row entirely then still clears, through the row's own listener and the host's
  safety net, in that order.
* The two readings of one row differ in NOTHING but that third argument, so
  `setPreview`'s "is this the same preview" test had to start including it. A
  field-by-field compare on `{ck, uci}` says "same" and leaves the board on
  whichever of the two landed first. It is compared through a composed key now.

### 16.2 A gap list is meaningless on your own move (24b)

§15.3 established that whose move it is decides what an uncovered move MEANS, and
built `gapKind` to say so. What it then did with the answer was change the
HEADING — "Played here, not answered" against "Played here, not in the course" —
and print the same list either way.

That is the same mistake one step further on. On the user's own move the list is
half a dozen moves *the author chose not to play*, printed underneath the move
the author did play, under a heading saying the course does not have them. A
Najdorf repertoire is not missing 1…e5. §15.3's own argument — "drawing the
second as a gap paints every course red for having an opinion" — applies to the
list, not merely to its title.

So on a `'choice'` column the list is DROPPED. The guard is conditional on the
course actually answering the position: where it plays nothing here, "what do
people play from this position" really is the only thing that can be said, and
the list stands. (In practice a *drawn* column always has answers — `columnsFor`
stops walking where there are none — so the condition is documentation of the
rule rather than a live branch. It is written out anyway, because the rule is
what a later change would violate.)

The "covers N%" chip is the same claim in a smaller space and gets the same
treatment: on a user move it reads **"plays N%"** and wears none of the `--thin`
alarm colouring. Same number, different word. "Covers 12%" is a verdict; "plays
12%" is a fact about how fashionable the author's choice is, which is genuinely
interesting and is not a hole.

`dev/check-course-tree.js` asserts BOTH arms — nothing listed on the user's move
however popular, and the opponent's move still listing them. A control with the
guard removed fails on exactly the first.

### 16.3 The frontier column never moves (24d)

A Miller-column browser walks rightwards. That is its defining property and here
it was its one real cost: the *frontier* — the column with the open question in
it, the only one you are ever about to click — moved one step right on every
click, so the pointer chased it across the panel, and the column sitting under
the pointer changed identity each time.

§14.2 had already removed one class of this (a column with one row is not a
decision and is never drawn). This removes the rest: **a column whose question is
answered collapses into a TAB above the columns**, and the frontier takes its
place. Standing anywhere, the thing to read is at the same x.

A tab is expandable, not a label. Clicking one puts its column back on screen
beside the frontier, which is what keeps "what else could I have played there"
one click away instead of gone. `ct.openCols` is keyed by POSITION, so an opened
column stays open across a redraw and across every later arrival at the same
position, and it is cleared wherever `ct.expanded` is.

It is not the breadcrumb, which says the same moves and does the other thing with
them: the breadcrumb TRUNCATES the path back to a ply. A tab changes what is
drawn and nothing about where the board stands.

Three consequences worth writing down:

* The frontier is the last real column and is LAST in the list handed to the
  `columnsThatFit()` slice, which cuts from the front — so no width, however
  narrow, can drop it. `activeColumn()` (24c) already picked that same column, so
  the keyboard needed no change at all.
* `wantDb` is still called from `renderColumns` and only for a column being
  DRAWN, so §15.1's licence is untouched — and since fewer columns are drawn,
  this strictly REDUCES the scan's request count.
* The tabs need the columns to live inside a wrapper (`.clo-ct-colswrap`), since
  the stage is a row — board, then this — and this is a column: tabs, then the
  columns. `.clo-ct-cols` gained `min-height: 0` so `.clo-ct-col`'s `max-height:
  100%` still resolves against a definite height.

### 16.4 What was deliberately not done

* **Hovering a TAB does preview its move, but clicking one does not navigate.**
  Navigating is the breadcrumb's job and the tab is a display control; one
  control doing both would make the difference between them unlearnable.
* **The gap rows were not made navigable on a `'choice'` column instead of
  hidden.** There is still no subtree behind them (§15.2), and a list of moves
  you can hover but never enter is a worse answer than no list.
* **No number was declared for how many tabs fit.** They wrap, which is what a
  row of short labels should do; a deep path is a second line of tabs, not a
  scroller.

---

## 17. Fourth pass (v0.125.0): a position stood on mid-run is a position

Clicking a move inside a folded run has been possible since the first build —
§3.3 called it "the board can stand inside a run", and it has always done
exactly that: the board moved, the breadcrumb grew, and *nothing else on screen
changed*.

That is the whole of the bug. The columns are what the panel SAYS; the board is
only what it shows. Standing on 8…Nbd7 in the middle of a nine-ply run, the
frontier column was still the branching position from before the run — "Black to
move", its moves, its coverage figure, its gap list — all of it about a position
five moves back. And because §15.1's licence is *one request per column DRAWN*,
the Lichess scan asked about that column and never about the one the user had
selected. So the single question standing there is for — **what do real games
play from HERE, and did the author answer it** — was the one question the
browser could not answer.

### 17.1 The fix

`columnsFor` used to `break` when the path held only part of a row's run. It now
builds one more column first (`standColumn`) and then breaks. The column is the
standing position, its rows, and the plies stood through as its `prefix`.

Everything downstream needed no change at all, which is the argument that this
is the right place for it:

* `renderColumns` draws it as the frontier, so `wantDb` is called for it — the
  scan reads the standing position because it is now a column ON SCREEN, not
  because anything about the scan's rule was relaxed. §15.1 is untouched.
* 24d turns the branching column behind it into a TAB, exactly as it does for a
  row taken whole, so the frontier is still at the same x and the alternatives at
  the branch are still one click away.
* `activeColumn()` picks it up for free, so ↑↓ pick the continuation and ← goes
  back to the branch.
* The board and breadcrumb are unaffected — `standingPlies` reads `ct.path`,
  which was already right. This never was a board bug.

### 17.2 Three things it rests on

* **A mid-run position has exactly ONE course move**, by the fold's own
  definition — branching factor 1, and `foldFrom` stops at a line end, so a run
  never passes through one. The column therefore always has one row, which is
  the shape §14.2 collapses automatically.
* **…so it must NOT be marked `auto`.** That flag means "a non-decision nobody
  asked for, walk through it"; this one was asked for by name, and it is the
  only thing on screen about the position the user selected. It is the one
  deliberate exception to §14.2, and it is not really an exception at all —
  §14.2 is about columns the WALK invented, not about where the path ends.
* **`chosen` is -1.** Nothing has been decided at this position, which is what
  makes every frontier-shaped consumer treat it correctly with no special case.

The visited set has to be fed the plies stood through before `rowsAt` is called
on the standing position: the walk breaks before `columnsFor` adds them, so
without that the cycle guard (§12.5) is blind to exactly the plies just walked
down.

### 17.3 Reading a run left to right must not stutter (v0.125.1)

The run's plies are not adjacent: a move number and a space sit between them.
§16's ply hover restored the ROW's reading on every `mouseleave`, so dragging
the pointer along `3.d5 b5 4.cxb5 a6 5.bxa6` snapped the board all the way back
to the run's start position — arrow and all — at every "4.", and then landed on
the next ply. Once per move pair, the line being read flashed back to where it
started.

**Between two plies there is nothing to say, and saying nothing is the fix.** The
ply's leave now returns early when `relatedTarget` is still inside the same
`.clo-ct-line`, so the last ply crossed stands until the next one takes over.
That is also the right reading in the other direction — the board always shows
the position belonging to the nearest move already crossed — and it needs no
timer, no latch and no state: the DOM already knows where the pointer went.

The two other exits are unchanged and are what makes the guard precise rather
than a suppression: leaving the run for the rest of the ROW (the meta line, the
bar) restores the row's reading, and leaving the row clears it.

Verified live 2026-08-21 on course 453453 by dispatching the real handlers with
an explicit `relatedTarget` and reading the board back — the discriminating
evidence being that the SAME event with a relatedTarget outside the line still
restores the arrow:

| pointer goes | arrow | tinted squares |
|---|---|---|
| into the row | 1 | — |
| onto `d4` | 0 | d2, d4 |
| across `"2."` | 0 | d2, d4 *(unchanged — was the stutter)* |
| onto `Nf6` | 0 | g8, f6 |
| across `"3."` | 0 | g8, f6 |
| onto `c4` | 0 | c2, c4 |
| out of the run into the meta line | 1 | — |
| out of the row | 0 | — |

### 17.4 What was deliberately not done

* **No new label on the column.** The head reads "White to move · 1 move" plus
  the coverage chip, which is true and is the same vocabulary every other column
  uses. A "you are inside a line" tag would be the panel explaining its own
  mechanics rather than the course.
* **The row does not name its variations** (`isOn` is false with nothing
  chosen). Correct: the names belong to a branch that has been chosen, and the
  count's tooltip still carries them.
* **No request is made per PLY.** Hovering a ply of a run still fetches nothing
  and never will — §15.1's rule is per column drawn, and standing on a ply is
  what promotes it to one.

