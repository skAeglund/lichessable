# DESIGN — "Review continuation(s)"

Status: **implemented in v0.33.0** — section 18 of `content/lichessable.js` plus
the `.clo-cr-*` block in `content/lichessable.css`. Ground-truthed live on the
test account against course **453453**, variation **70382641** ("1"), on
2026-07-26. Everything under "Findings" was observed in a running session, not
inferred.

---

## 1. What the user asked for

When a completed variation ends with one or more CLICKABLE subvariation lines in
the comment column, offer a "Review continuation(s)" button that lets those lines
be reviewed — "preferably by making moves as normal".

The variation used throughout: `1.e4 c5 2.Nf3 Nc6 3.d4 cxd4 4.Nxd4 Qb6`, whose
final comment holds two continuations:

```
5.Nb3 g6 6.Be3 Qb4+
5.c3 Nf6 6.Nxc6 bxc6
```

The course is a Black repertoire, so the user's moves in those lines are
`g6`/`Qb4+` and `Nf6`/`bxc6`.

---

## 2. Findings (all verified live)

### 2.1 Chessable's browse board is navigation-only — this is the load-bearing fact

In the post-completion browse state the board accepts **no moves**. Tried with
the extension's own `pressSquare` recipe (pointerdown/mousedown/pointerup/
mouseup/click on the source square, then the destination), which is the exact
sequence that drives the quiz board and the explore board:

| attempt | result |
| --- | --- |
| `d4b3` (legal for the side to move) | placement unchanged |
| `g7g6` | placement unchanged |

Clicking a move SPAN does navigate the board, so the board is not inert — it is
*navigation-only*. Its pieces are Chessable's React-rendered divs, so moving them
ourselves is out of the question (foreign writes into MoveTrainer2's tree, and
they would be reverted on the next render anyway).

**Therefore the quiz cannot run on Chessable's board.** It runs on ours, overlaid
on theirs. This is the whole reason section 18 contains a board widget at all.

### 2.2 The sub-move spans and their ids

Sub-line moves are `[data-testid="commentSubMove"]` spans — already in
`SELECTORS.reviewSubMoves`, used by `readReviewTurn`. Each carries an **id** of
the shape `<attachPly>.<line>.<move>`, nested for a line written inside another.
The two lines above:

```
7.0.0 "5.♘b3"   7.0.1 "g6"   7.0.2 "6.♗e3"   7.0.3 "♛b4+"
7.0.3.0.0 "5.c3"  7.0.3.0.1 "♘f6"  7.0.3.0.2 "6.♘xc6"  7.0.3.0.3 "bxc6"
```

So grouping on the id prefix up to the LAST dot yields exactly one group per
line, in DOM order.

**The leading component is NOT the mainline attach ply.** It looks like one here
— `7` alongside a comment on ply 7 of an 8-ply variation — but that is a
coincidence of this example. Ground-truthed 2026-07-26 on a comment hanging off
`10.Be2` (ply 18) whose sub-moves are `0.0.0`, `0.1.0`, `0.1.7.1.0`, …: the
leading component numbers the comment BLOCK, not the ply. The attach ply is
counted from the DOM instead (`attachPlyOf`: how many `SELECTORS.reviewMoves` are
printed before the block). Anything derived from the id prefix is wrong for every
comment that is not on the final move.

> **Correction (2026-07-27, v0.36.3).** "The leading component numbers the
> comment block" is also wrong — the numbering **restarts in every block**, so
> three commented moves each print `0.0.0`, `0.0.1`, … See §6.9: grouping on the
> id prefix alone merged them, and the group key is now scoped by the attach
> ply.

Piece letters are SVG figurines (`span.commentMove__piece[data-piece="knight"]`),
identical to the mainline's, so `quickEditSanFromEl` reads them correctly —
`textContent` alone gives `"5.b3"`, not `Nb3`.

### 2.3 The id nesting is NOT semantic — do not trust it for the branch point

`7.0.3.0.0` ("5.c3") *looks* like a continuation of `7.0.3` ("Qb4+"). It is not.
Clicked live, the resulting board had the knight still on **d4** and the black
queen on **b6** — i.e. it branches from the MAINLINE after `Qb6`, exactly like
the first line. Both lines print "5." because both are White's 5th move.

Chessable nests the second line inside the first line's last move as an artifact
of how the comment was parsed. The id therefore gives us:

* the grouping (reliable), and
* the **branch index** — the parent move a nested line is written against
  (`0.1.7.1` = an alternative to move 7 of line `0.1`), which is a strong
  candidate but not a guarantee, per the above,

but never the branch position itself, and not the attach ply either (§2.2).

### 2.4 The lesson plan is still readable in the browse state

`readLessonLine()` (the auto-play line oracle, `content/pagestate.js`) answers
normally after a variation is completed, with the full plan: per ply `san`,
`from`, `to`, `sourceFen`, `targetFen`, `progress`. The `sourceFen`s are exact —
real castling rights and en passant, unlike `readReviewFen`'s approximations.

That makes every mainline position of the variation available exactly, which is
what the anchoring below stands on.

### 2.5 Anchor by printed number + legality — verified end to end

For each line: take the first move's printed number and colour
(`parseMoveNumber`), and try candidate positions in confidence order. A candidate
is accepted only when its side-to-move and fullmove match AND every SAN in the
line resolves to a legal move from it (`sanToUci` + `fenAfterUci`, i.e. CloSan).

Run offline through `engine/san.js` on the live data:

```
anchor after Qb6: r1b1kbnr/pp1ppppp/1qn5/8/3NP3/8/PPP2PPP/RNBQKB1R w KQkq - 2 5
A  all legal  Nb3=d4b3 g6=g7g6 Be3=c1e3 Qb4+=b6b4   matches board truth: true
B  all legal  c3=c2c3 Nf6=g8f6 Nxc6=d4c6 bxc6=b7c6  matches board truth: true
```

"matches board truth" = the simulated final placement equals, square for square,
what Chessable's own board showed when the line's last move was clicked. So the
derived FENs are not an approximation; they are the same positions.

### 2.6 Piece art can be borrowed with no assets

Board pieces are **inline `<svg>`** inside `.piece-417db` divs (no background
images, no `<img>`, no `<defs>`/id references — just `<g><path>×4`). Cloning the
node gives our board Chessable's exact pieces: no vendored art, no licence
question, and no `innerHTML` (a `cloneNode(true)` of a live node, never a string).

---

## 3. Design as built

### 3.1 Discovery (`scanContinuations`)

Browse state only, re-run when the sub-move list's id signature changes.

1. Group the spans by id prefix (DOM order preserved).
2. SAN per span via `quickEditSanFromEl`. An unreadable one (Chessable writes
   null moves as `18.--`) TRUNCATES the group at that point instead of dropping
   it: the moves before it are still positions the lines written inside it need.
3. Mainline positions from the plan: `fens[i]` = before ply *i*, `fens[n]` =
   after the last ply. Attach ply from the DOM (`attachPlyOf`), never from the id.
4. Candidate anchors per line, in order: the parent line's position at the
   **branch index**, then **after** that parent move, then **after** the attach
   ply, **instead of** it, the parent's other positions, then the rest of the
   mainline. Lines are resolved shallowest-first so a nested line can anchor
   inside its parent.
5. Accept on **every** move's number matching the position it is played from,
   plus full legality (`walkLine`). Nothing looser — a line that resolves nowhere
   is **dropped** with one console line. A legality-only fallback over the attach
   positions existed until v0.34.1 and is exactly what quizzed a `12.Be3 Rb7`
   sideline on the mainline position 8 plies away, where both moves happened to
   be legal: with the parent line unresolvable, the fallback was all that was
   left, and it answered confidently and wrongly.
6. A group that needed a **rewind** to walk (`branched`) or that was
   **truncated** is kept in `resolved` — its positions place the nested lines —
   but is not quizzed. See §3.1.1.
7. Drop lines with no move of the user's colour (there is nothing to quiz).
7b. **Leave out lines already in the course** (`tagLinesInCourse`). A clickable
   line can be added to the repertoire as a real variation, and then it is
   reviewed there — quizzing it here too means drilling it twice in a session.
   Ground truth (2026-07-26): Chessable's own "Find position in course" page is
   an SPA shell (4.7 KB of HTML, no results in it — scraping it does not work);
   the call it makes is
   `GET /api/v1/getList?uid&bid&fen` with the session JWT as a Bearer token,
   answering `{ list: { data: [ { id, name, moves, … } ], fens: [ … ] } }`,
   where `data` holds every variation of that course containing the position.
   A non-empty `data` is the answer; `data[0].name` is the title to name in the
   log. `uid` is required (400 without it) and lives in localStorage next to the
   JWT. The FEN goes in with `/` → `;`; the server ignores the move counters and
   the en-passant square but matches the side to move, so the four-field
   `cacheKey` is both the query and the cache key. The position checked is the
   one AFTER the line's last move. A miss costs ~0 KB, a hit ~180 KB (the
   payload inlines every matching variation), so answers are cached per
   course+position in `chrome.storage.session` for 12 h. Every failure mode —
   no credentials, HTTP error, timeout, unexpected shape — leaves the line
   quizzable.
   Verified against the test course: `5.Nb3 g6 6.Be3 Qb4+` → "Sicilian: 2...Nc6
   3.d4" (39 variations pass through it), `5.c3 Nf6 6.Nxc6 bxc6` → "gonfreecss
   vs. Quickstarter Guide - Odds & Ends || 5. c3 #2", while the two lines
   nested inside variation 70689219's comment (`12.Be2 …`, `12.Be3 Rb7!`) are
   correctly NOT in the course.
   One request per uncached line, so this is also the only network the feature
   does; it runs last in the scan, after everything else has resolved.
8. **One position, one answer** (`dropAmbiguous`). Collect every USER ply of
   every surviving line, keyed on the position it is played from (first four FEN
   fields, so transpositions count), seeded with the mainline's own user plies.
   A position holding two different answers drops **every** line that asks there
   — both sides of the clash, since nothing here can know which move is the
   repertoire; the author decides that by editing the comment. Opponent plies
   are not collected: two lines with different replies to one position is the
   normal "and if he plays this instead" case. Checked offline against the real
   move generator (five cases: user clash, opponent-only difference, clash with
   the mainline, agreement with the mainline, clash deeper in two lines), and
   live: variation 70382641's two lines share a branch position and both stay.
7. Drop lines whose **user-colour** move is annotated `?`, `??` or `?!` — authors
   use these lines to show what to avoid, so quizzing one would drill the blunder
   as repertoire. Read by `moveAnnotation()` as the trailing run of `!`/`?` on the
   span, because `quickEditSanFromEl` strips eval glyphs (the edit page's element
   ids carry none) and `Be3??` would otherwise be indistinguishable from `Be3`.
   `isBlunderAnnot` tests the **first** character, which is what separates `?!`
   (drop) from `!?` (keep) — a "contains a `?`" test would be wrong. An annotated
   **opponent** move is the premise of a line about punishing it and stays.

#### 3.1.1 A comment line is often not a line

Authors write several branches in one breath, and Chessable makes every move of
that one clickable group. From the test course (variation 70689219), group `0.1`:

```
10.dxe6 10...fxe6 11.Bd3 d5 10...dxe6 11.Qxd8 Rxd8 12.Bb5 12...Bb7 13.Nd2 … 18.--
                           ^^^^^^^^^^ back to move 10, a second branch
```

`walkLine` plays such a group by **rewinding**: a move whose printed number names
an earlier position is played from the latest position in this group's own walk
that both matches the number and makes the SAN legal. The group is then flagged
`branched` and never quizzed — playing it straight through would ask for moves
from positions the author never joined up — but its positions are recorded.

That is not a nicety: the two lines written inside it (`0.1.7.0` = `12.Be2 Bb7
13.Nd2 Nc6`, `0.1.7.1` = `12.Be3 Rb7!`) branch off `12.Bb5`, a position that
exists **only inside this unquizzable group**. Verified live 2026-07-26: with the
rewind both resolve onto the position after `10.dxe6 dxe6 11.Qxd8 Rxd8`, matching
Chessable's own board square for square, where before the fix one was skipped and
the other (in the course this was reported from) was quizzed on the mainline.

### 3.2 Scope picker

A line is flagged `fromFinal` when its `startFen` is the position after the last
mainline ply (`fens[fens.length - 1]` — a string compare, exact because both
sides come out of the same array). Continuations after the final position are the
ordinary case; a line branching off earlier revisits a move already answered in
the variation, which the user may not want.

So when a variation has **both** kinds, the launcher opens the picker instead of a
quiz: *All continuations (n)* / *Final continuations (m)* / *Cancel*. Only one kind
present ⇒ nothing to ask, and it starts immediately.

`cr.lines` is everything discovered (launcher label, picker counts); `cr.queue` is
what the run plays. `startLine`, `nextLine` and `syncUi` index the **queue**.

### 3.3 The two overlays

Body-mounted, `position: absolute` in DOCUMENT coordinates (`setInlinePx`), never
`fixed` — the same discipline as the review panel and the overstudy widget.

* **Board** (`.clo-cr-board`), pinned on Chessable's board rect. 64 of our square
  divs in an 8-column grid, pieces in a separate layer at 12.5% with a
  `translate` in multiples of 100% of their own size, so a resize needs no JS.
  Oriented bottom = user colour (`boardBottomColor` on their board). Legal-target
  markers are copied from their live rules, not approximated: a **33%** dot
  (`rgba(0,0,0,.3)` at `opacity .7` = effective `.21`) on an empty square, and on
  an occupied one their ring,
  `radial-gradient(transparent 0, transparent 79%, rgba(0,0,0,.21) 80%)`. The
  board colour is ours; the move affordances are theirs.
* **Panel** (`.clo-cr-panel`), **covering the comment column**
  (`SELECTORS.reviewCommentBox`). This is not decoration: the lines being quizzed
  are printed there in plain sight. It carries the prompt, Hint, Skip line, Exit.
  With no comment column to cover it parks below the board and sizes itself.

Nothing of ours enters Chessable's DOM; nothing of theirs is written to.

### 3.4 Quiz flow

One line at a time, auto-advancing to the next. Opponent plies are played for the
user after a pause borrowed from auto-play's speed preset (floor
`opponentMinMs`); user plies wait for input.

Input is **both** click-source-then-target and **drag and drop**. The drag layer
sits on top of the click path rather than replacing it: `pointerdown` only ever
picks a piece up (which is the same selection a click would make), the pointer is
captured on the grid so the drop square is resolved *geometrically* rather than
from the event target, and `cr.swallowClick` keeps the trailing click from being
acted on a second time. Under
`dragSlopPx` of travel a press is still a click, so nothing about click-to-move
changes. `touch-action: none` on the board keeps a finger drag from scrolling the
page instead.

**Deselecting** — pressing the piece that is already selected — is done by
`onDragEnd`, not by the click path, and that is not a detail: `setPointerCapture`
retargets the whole compatibility sequence (mousedown/mouseup, and therefore the
click) to the GRID, so after a pick-up the click never reaches a `[data-sq]`
element and the delegated handler cannot see which square it was. Ground-truthed
live 2026-07-26 — this is why clicking a selected piece did nothing at all before
v0.34.0. `swallowClick` is now set on every pick-up, since that click is either
ours already or lands somewhere it must not be acted on.

**Right button draws**, as everywhere else in chess: drag = arrow, click = circle,
the same shape again removes it. One `<svg>` over the piece layer, in board units
(`viewBox 0 0 8 8`) like every other bit of geometry here, `pointer-events: none`
so the grid keeps owning input, and `contextmenu` prevented on the board.
Drawing is allowed while the opponent's reply is in flight — an annotation is
never a quiz answer — and the shapes are scratch work: any ordinary press on the
board and every move clears them. Single colour on purpose; there is no shape
state to persist and nothing to legend.

A refused move is simply **not applied** — there is nothing to roll back, since
our position only ever advances on the correct move. Two misses on one ply and
the answer is spelled out in the prompt and highlighted on the board, mirroring
what Chessable does. Promotions get our own four-piece picker.

### 3.5 Interaction with the rest of the extension

* **Review panel (§11)** stands down while a quiz runs, via the
  `continuationActive` bridge: its FEN comes from Chessable's board, which our
  overlay covers, so it would otherwise show a position nobody can see.
* **Keys are swallowed** on `document` in capture phase while active.
  MoveTrainer2 binds single-key shortcuts ("n" = next variation) on `document`
  and ignores what has focus; one keypress would otherwise tear the quiz down.
  Modified keys (Ctrl/Meta/Alt) pass through; Escape exits.
* **Auto-play (§13)** and the **alt check (§15)** are inert by construction: they
  watch Chessable's board, which we never touch.
* The quiz closes on variation change, on leaving the browse state, on Exit,
  Escape and `pagehide`.

---

## 4. Deliberately not done

* **Quizzing both colours.** The user answers their own colour, exactly as the
  trainer does. A line with no user-colour move is dropped rather than turned
  into a step-through.
* **Any writing back to Chessable.** Continuation review is read-only: it never
  records a proof for auto-play, never touches the SRS, and never reports a
  result. It is practice, not review.
* **A line picker.** Lines run in sequence; "Skip line" moves on.

---

## 5. Open questions (not verified)

* A subvariation attached MID-mainline (all lines seen so far hang off the last
  ply). The anchoring handles it by construction — the attach ply comes from the
  id and both the before/after positions are tried — but it has not been seen
  live.
* A nested line that is a genuine continuation of its parent rather than a
  sibling. Also handled by construction (parent positions are candidates, and the
  printed number discriminates), also unseen.
* A promotion inside a continuation line, and therefore the promotion picker.
* Lines whose numbering Chessable renumbers away from the source game's (the
  fallback pass exists for exactly this, and logs when it fires).
* **How Chessable renders a `?`/`??`/`?!` glyph in a comment move.** The test
  comment has none. `moveAnnotation()` assumes plain text inside the move span
  (with the next sibling as a fallback), which is what the mainline move ids
  imply — they strip glyphs, so something must be carrying them. If Chessable
  instead renders a NAG as a badge or an entity (`⁇`), the read returns '' and the
  line is kept: the failure is silent and in the unsafe direction, so this is the
  first thing to check on a course that annotates its continuations.

---

## 6. Layer 2 — the mid-quiz heads-up ("18b", v0.36.0)

### 6.1 The problem

Everything above only starts once the variation is **over**. By then the user
has played eight moves past the position each line branches from, and the
launcher's label (`Review clickables (2)`) says nothing about *where*. The user
asked to be shown the branch **when they are standing on it**, and to decide
there.

### 6.2 What it does

While a variation is being played — outside the browse gates, which is the one
state section 18 previously ignored — a small body-mounted panel is raised the
moment the comment column prints a clickable line branching at the position
currently reached:

```
CLICKABLE LINE          [Turn off] ×
The opponent can also respond with:
┌──────────┐  5.c3
│   mini   │
│  board   │
└──────────┘
[ Review on variation end ]
```

The mini board shows the **branch position** with one arrow per line's first
move (plus the last-move tint on both its squares — a one-square arrow barely
registers at 176 px). Pressing the button queues those lines. Ignoring it costs
nothing: it comes down by itself when the user plays their next move.

**It runs in the browse state too** (v0.37.0), for the lines that carry on from
the **final** position. Those branch exactly where the variation stops, so there
is no earlier moment at which to raise them — and once the variation is over the
spoiler rule lapses, so a continuation of the user's *own* colour is offered
there as well (`startPly < finalPly` is the whole test). The wording and the
button follow: *"From here the opponent can play:"* / *"You can also carry on
with:"*, and **Add to review queue** rather than *Review on variation end* —
there is no variation end left to wait for.

**Nothing starts by itself** (v0.37.0). A filled **Review queued lines (n)**
button appears next to the plain launcher once the variation is over, and
`runQueued()` is what hands the queue to `beginRun()`. Two reasons: being
dropped into a quiz you did not ask for is jarring, and the final continuations
are only offered *after* the variation ends — so the user needs a moment to add
those to the queue before anything starts. The button only shows in the browse
state (our board overlays Chessable's; running mid-quiz would cover a live quiz
board), and `beginRun` clears the queue whichever way the run began, so it
cannot linger after the lines have been played.

While it is up, **"Review clickable(s)" is hidden**. Someone who picked lines by
hand has already answered "which ones?", so offering "all of them" beside it is
noise and the two green buttons compete for the same moment. The launcher
returns as soon as the queue is spent or the variation changes — which is also
the only way to abandon a queue, deliberately: there is no "clear queue"
control, because the queue is cheap to spend and wiped at every variation.

**Only the branching move is printed.** The rest of the line is exactly what the
review is about to ask for, and half of it is the user's own moves — spelling it
out here would answer the quiz this panel exists to offer. (First cut printed
the whole line; caught in review before testing.)

**"Turn off" is on the panel.** The options-page checkbox is the canonical
control, but it is in another tab, and by the time anyone gets there the panel's
moment has passed — the setting has to be reachable at the instant it is being
annoying. It arms on the first click and disarms after `headsUpOffArmMs`, the
same two-click shape as auto-play's "Clear": one misclick would otherwise cost
the feature for good, with the options page the only way back.
`turnHeadsUpOff()` sets the local flag and hides the panel *before* attempting
the write, so an orphaned content script (extension reloaded, page not) still
obeys the press for the rest of the session.

### 6.3 What is shared, and what is new

`scanContinuations` was split. The reading, anchoring, walking, blunder/ambiguity
filtering — all of it — is now `collectLines(oid)`, returning
`{ lines, fens, userColor }` or `{ retry }`, and **both** callers use it. The
mini board is not a second board implementation either: `fillGrid`, `makePiece`,
`placeAt` and `shapeArrow` are the quiz board's own, so orientation, square
colours, piece art and arrow geometry cannot drift apart.

New: the raise/drop decision, the panel, and the arming.

### 6.4 The three rules

| rule | why |
| --- | --- |
| Only lines whose **first ply is the opponent's**, *except at the final position* | A line starting with a move of the user's colour branches at a position the trainer is about to ask *them* for a move from. Raising it hands over the answer, or an alternative to it. This is also why the wording is "the opponent can also respond with". At the final position the variation is over, so the rule lapses and either colour is offered. |
| Only lines anchored on a **mainline** position (`fens.indexOf(startFen) >= 0`) | A line anchored inside another comment line branches from a position the user never plays through — there is no moment at which to raise it. |
| The clock is `printedPlies()` (`SELECTORS.reviewMoves` in the comment column) | The same count `attachPlyOf` already trusts. A line branching at mainline ply *k* goes up at *k* printed moves and comes down at *k+2*: the opponent's reply (ply *k*) leaves it standing, the **user's** next move (ply *k+1*) takes it away. That is "it disappears when you move", expressed in a clock this section already depends on. |

Also dropped: a first move whose post-position is (on `cacheKey`) the one the
variation itself goes to — nothing "also" about it.

### 6.5 The queue carries the lines, not their names (v0.36.6)

`cr.hu.armed` maps `lineSig` → **the resolved line object**, and `openArmed`
hands those objects straight to `beginRun`.

The first cut stored only the signatures and looked them up again in the browse
scanner's `freshLines()`. That produced the intermittent

```
continuation: the line(s) queued during the quiz are no longer offered — not opening
```

The two readers are **allowed** to disagree about where a line sits, and each
difference changes `startFen` and therefore the signature:

| | plan reader (§6.3) | DOM reader (§2.5) |
| --- | --- | --- |
| anchor candidates | the comment's own `before`/`after`, then the parent line's | those *plus the whole mainline* whenever a move number is printed |
| attach ply | the plan index the comment hangs on | counted from printed `commentMove`s |
| `comment_before` | its own block, keyed `<i>b` | not distinguished from the after-comment |

So a lookup across the two is a coin toss on any variation where those diverge.
It is also unnecessary: a queued line was resolved against the plan's **exact**
positions, `walkLine` proved every SAN legal from the position it would be
played from, and every condition — opponent to move, mainline anchor, not
already in the course, no blunder annotation, one answer per position — was
applied *before* it was ever raised. There is nothing left to re-check.

`openReview` also marks the queue consumed, or closing a hand-opened review
would immediately restart the armed subset.

### 6.6 Keys

Unlike the quiz panel, this one deliberately does **not** swallow keystrokes:
the user is still playing on Chessable's board and needs MoveTrainer2's
shortcuts. The cost is that a button left focused would also fire on the next
space, so both buttons `blur()` themselves after a press.

### 6.7 Setting

`cloLineHeadsUp` in `chrome.storage.local`, **opt-out** — absent means on, only
an explicit `false` turns it off. Two controls write it: the options-page
checkbox and the panel's own "Turn off". Both are watched via
`chrome.storage.onChanged`, so a change lands in every open trainer tab without
a reload. Turning it off leaves the end-of-variation launcher untouched, and
costs nothing while off — `headsUpTick()` returns before it scans anything.

### 6.8 The assumption that was wrong, and what replaced it (v0.36.1–.5)

v0.36.0 read the lines from the DOM, on the assumption that Chessable prints
`commentMove`/`commentSubMove` spans progressively during a quiz. **It does
not.** Ground-truthed 2026-07-27 on `/practice/453453/70382641/0/b`, playing the
variation through with a MutationObserver on `document.body`:

| state | `commentMove` | `commentSubMove` | `commentScrollContainer` |
| --- | --- | --- | --- |
| quiz, before an answer | 0 | 0 | 0 |
| quiz, after a correct answer | 0 | 0 | 0 |
| quiz, after the opponent's reply | 0 | 0 | 0 |
| "study this move" (after a failure) | 0 | 8 | 0 |
| browse (variation complete) | 8 | 12 | 1 |

The comment column shows `Quiz — Black to play!` and nothing else for the whole
variation. So the panel had nothing to read and never appeared — exactly the
symptom reported.

**The lesson plan carries it instead, and better.** `plan[i].comment` is a JSON
string (§6.2 above shows the shape), present for every ply from the first frame,
with the exact `before`/`after` FENs. `pagestate.js` now passes `comment`,
`comment_before` and `ctx.fen` through verbatim; parsing lives in the isolated
world (`commentGroups` → `parseCommentMove` → `resolveCommentLine` → `planLines`).

Verified offline against the plan captured live from that variation — the real
functions, sliced out of `content/lichessable.js` rather than copied:

```
mainline positions: 9
quizzable lines: 4
  "h3 Nc6"            startPly=2  firstColor=w  raisable   (anchored on `before`)
  "c3 d5"             startPly=4  firstColor=w  raisable   (anchored on `before`)
  "Nb3 g6 Be3 Qb4+"   startPly=8  firstColor=w  raisable   (anchored on `after`)
  "c3 Nf6 Nxc6 bxc6"  startPly=8  firstColor=w  raisable   (anchored on `after`)
```

Both anchor kinds occur in one variation, discriminated by the printed move
number exactly as designed.

### 6.9 Two further bugs found while debugging

**Sub-move ids are not unique across comment blocks** (fixed v0.36.3). Every
block restarts its numbering, so the three commented moves of the test variation
each printed `0.0.0`, `0.0.1`, …:

```
0.0.0 -> 2.h3    0.0.1 -> c6      (comment on ply 2)
0.0.0 -> 3.c3    0.0.1 -> d5      (comment on ply 4)
0.0.0 -> 5.b3    0.0.1 -> g6  …   (comment on ply 7)
0.0.3.0.0 -> 5.c3 …               (nested in the ply-7 comment)
```

The browse scanner grouped on the id prefix alone and therefore welded three
separate lines into one 8-move "line" that fitted nowhere:

```
continuation: no position fits line 0.0 (h3 Nc6 c3 d5 Nb3 g6 Be3 Qb4+) — line skipped
```

This is a **pre-existing** bug in §2.2's model, not one the heads-up introduced:
"Review clickables" silently lost every line of any variation with more than one
commented move. The group key is now `attachPly + '|' + idPrefix` — two lines of
one comment share the attach ply (so a nested line still finds its parent) while
lines hanging off different moves never collide.

**The board DOM is not a usable ply clock** (fixed v0.36.5). The first cut
located the live position by reading the placement off the board. After a
rolled-back wrong answer the board held a **stale duplicate piece** — a knight on
b8 *and* c6, three black knights on the board — for far longer than an
animation, which the one-king-per-side check does not catch. The derived
placement then matched no plan position, the clock stopped, and the panel stayed
up over a position the user had left several moves earlier. `ctx.fen` had it
right throughout, so the clock now comes from there (`pollHeadsUpPly`,
asynchronous, at most one tick stale).

Two smaller ones: the retry budget was being spent entirely on "no fiber root"
during the cold boot, permanently skipping the variation (now waits for
`getReviewBoard()` and allows ~30 s); and the `document.hidden` guard, copied
from auto-play, was dropped — auto-play needs it because it *drives* the board,
while this panel only reads and renders and is invisible in a hidden document
anyway, so the guard bought nothing and made the feature impossible to verify
under automation.

### 6.10 Verified live, and what is not

Verified on the running extension (v0.36.5), `/practice/` and `/learn/`:

* the scan reads all four lines, excludes the two already in the course, and
  reports the two raisable ones;
* the panel appears the moment the user reaches the branch position, with the
  right mini board, orientation and arrow (h2–h3 on a board flipped for Black);
* it survives the opponent's reply and comes down when the user moves on — and
  the *next* line (`3.c3`) is raised at its own moment;
* **Review on variation end** arms and reports "Queued for the end of this
  variation."

**The hand-over is verified too** (v0.37.1, `/learn/453453/70382641/0/b`, driven
to completion): `h3 Nc6` raised at ply 2 → queued → variation played out →
browse state → **Review queued line** → the quiz ran that line on our board
("CONTINUATION / Black to play / Move 2 of 2") → answered → all overlays closed
and the queue button gone. Console:

```
heads-up: 4 clickable line(s) in this variation, 2 can be pointed out (2 already in the course) — h3 Nc6 | c3 d5
continuation: queued — h3 Nc6
continuation: line 7|7.0 (Nb3 g6 Be3 Qb4+) is already in this course …
continuation: 2 line(s) ready — h3 Nc6 | c3 d5 (2 more already in the course)
continuation review: starting the 1 queued line(s)
continuation review: started, 1 of 2 line(s)
continuation review: all lines done
```

That run also confirms §6.9's grouping fix from the other side: the browse
scanner now reports **2** lines (`h3 Nc6 | c3 d5`, keys `7|7.0`) where before it
merged them and offered none.

Re-verified at v0.37.2 with the launcher now hidden behind the queue button:
browse state showed `clo-cr-queue => Review queued line` /
`clo-cr-open => (hidden)`; after the queued line was played out the pair flipped
to `clo-cr-queue => (hidden)` / `clo-cr-open => Review clickables (2)`.

Still unverified: the **final-position** panel on a live board. The test
variation's two final continuations are both already in the course, so they are
correctly filtered out and nothing is raised there; the raise timing itself is
verified offline (§6.8's harness, ply 8 → both lines, one panel).

### 6.11 Not done

* **"Review now"** (interrupting the variation to play the line immediately).
  Deliberately deferred: it means suspending a live quiz, and "review on
  variation end" answers the same need without touching the trainer's state.
