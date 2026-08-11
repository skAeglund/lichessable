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

---

# 7. Implementation notes since the original design

Sections 1–5 describe the feature as first designed and §6 the mid-quiz heads-up.
What follows is everything that changed while it was built and used — kept here
rather than in CLAUDE.md, which carries only the contract surface and the
anti-repair notes.

## 7.1 The board and its shapes (section 11c)

The board primitives — `fillBoardGrid`, `boardVisualPos`, `boardSquareAt`,
`harvestBoardPieces`, `makeBoardPiece`, `boardShapeArrow` / `boardShapeCircle`,
`BOARD_SHAPE`, `SHAPE_COLOR_HEX` — live at TOP LEVEL in section 11c, because the
quick-edit arrows editor (12b), the drill (20) and section 23's board all draw the
same board. The functions inside section 18 are thin wrappers passing
`boardView()`, declared as `function`s so the definitions above them can call them.

Pieces are Chessable's own live `<svg>` nodes CLONED (`cloneNode(true)`, never
innerHTML, no vendored art) with a Unicode glyph fallback. Geometry is ALL
percentages — squares in an 8-col grid, pieces at 12.5 % translated in multiples of
100 % of their own size — so a resize needs no JS.

### Why a shape's colour is an inline STYLE

Never a presentation attribute: `.clo-cr-shape`'s CSS `stroke` outranks an
attribute of the same name, so every arrow would come out green. And on EXACTLY
ONE property per element, matching what those classes do — `stroke` for the shaft
and the ring, `fill` for the arrow HEAD, which the CSS also gives `stroke: none`.

Colouring the head's stroke as well overrides that `none`, and nothing sets
`stroke-width` on a head, so it falls back to SVG's default of 1 — which in a
`viewBox="0 0 8 8"` is one whole SQUARE of outline, i.e. an arrow tip several times
its intended size (v0.52.1). The polygon's `getBoundingClientRect()` does NOT show
it: a bbox excludes stroke, so this measured correct while looking wrong.

### The arrow geometry is chessground's, MEASURED (v0.86.0)

Read off a live lichess.org analysis board on 2026-08-09 by drawing four shapes
with synthetic right-button mouse events and reading the `svg.cg-shapes` it
produced — **not** taken from chessground's source. Their overlay is
`viewBox="-4 -4 8 8"`, board units like ours, so the numbers transfer directly.

Two rules, and ours broke both:

* the shaft starts **on** the source square's CENTRE (we started 0.26 out of it);
* it stops exactly **one stroke-width** short of the destination centre, where the
  head puts its TIP (we overshot the centre by 0.06).

The shortening is a flat one stroke-width in every case — confirmed on e2–e4,
d1–d8, b1–c3 and, notably, UNCHANGED when the destination square is OCCUPIED:
there is no special case for a piece standing on it.

`markerUnits` is absent from their marker, so it defaults to `strokeWidth` and the
head is 3 stroke-widths long by 4 wide — i.e. 0.625 wide against the 0.44 we had,
which is most of why ours read as a thin dart rather than an arrow. `refX=2.05` of
3 puts their tip 0.05 of a stroke-width short of the centre; we put it ON the
centre, a 0.6 px difference on a 616 px board, and say so rather than carrying the
artefact.

Kept as line + polygon rather than adopting their `<marker>`: `paintShape` colours
the two independently, and a marker needs a per-colour `<defs>` entry with a unique
id in every document that draws one, the quick-edit popup included.

COLOURS ARE UNCHANGED — the shape was copied, not the palette — except `opacity`,
which was 0.72 and is now the 1 they actually render; that softening was the other
half of the difference. The circle is theirs too (r 0.46875 with a 0.0625 stroke,
outer edge flush with the square's boundary); ours inset `r` by half the stroke,
drawing a smaller ring.

## 7.2 Reading the lines out of the DOM

Lines come from `SELECTORS.reviewSubMoves` grouped by the id prefix up to the last
dot (`0.1.7.1.0` … `0.1.7.1.1` = one line) — **but that prefix is not unique on its
own**: EVERY comment block restarts the numbering, so a variation with three
commented moves prints `0.0.0`, `0.0.1` three times over (ground-truthed
2026-07-27).

Grouping on the id alone welded three separate lines into one 8-move line that
fitted nowhere and dropped all of them — i.e. "Review clickables" was broken for
ANY variation with more than one commented move (fixed v0.36.3). The group key is
therefore `attachPly + '|' + idPrefix`: two lines of ONE comment share the attach
ply, so a nested line still finds its parent, while lines hanging off different
moves never collide.

**Read the id for the GROUPING and the BRANCH INDEX only** — both other readings
are wrong:

* the leading component is NOT the mainline attach ply (ground-truthed 2026-07-26:
  a comment hanging off 10.Be2, ply 18, gives every one of its sub-moves an id
  starting `0.`). The attach ply is COUNTED FROM THE DOM instead — `attachPlyOf`,
  the number of `SELECTORS.reviewMoves` printed before the block.
* the nesting is not always semantic either — `7.0.3.0.*` looked nested under the
  first line's last move yet its board showed it branching from the MAINLINE. So
  the parent's branch position is the FIRST candidate, never an assumption.

### Anchoring

Positions come from the line oracle (`readLessonLine()` still answers in the browse
state — verified). Candidate anchors, in order: the parent line's position at the
branch index, then after it, then the position AFTER the attach ply, then instead
of it, then the parent's other positions, then the rest of the mainline.

A candidate is accepted only when EVERY move's printed number + colour
(`parseMoveNumber`) matches the position it would be played from AND every SAN
resolves legally (`sanToUci` + `fenAfterUci`). Lines resolve shallowest-first so a
nested line can anchor inside its parent.

There is deliberately **no looser pass**: v0.34.1 removed a legality-only fallback
over the attach positions that had quizzed a `12.Be3 Rb7` sideline on the MAINLINE
position 8 plies away (both moves happened to be legal there). A line whose numbers
fit nothing we can reconstruct is DROPPED, like one that fits nowhere or has no
user-colour ply. Never guessed at.

## 7.3 What makes a move clickable (ground truth, 2026-08-04)

Established on course 453453 by writing three comments and reading back what
Chessable rendered, because the answer decides which shape the reader ever meets:

* **Parentheses do.** Text outside them is prose, however move-like it looks:
  `Branch test: 5.Nb3 (5.Nc3 Qxb2) 5...Nf6` rendered ONE clickable group,
  `5.Nc3 Qxb2` — "5.Nb3" and "5...Nf6" stayed plain text. So section 19's "Add as
  line" wrapping its output in parentheses is not decoration, and a comment written
  without them is not quizzable at all.
* **Parentheses nest, exactly as PGN does.**
  `Branch test: (5.Nb3 (5.Nc3 Qxb2) 5...Nf6)` gave ids `7.0.0` + `7.0.1` for the
  outer line and `7.0.0.0.0` + `7.0.0.0.1` for the inner — TWO groups, which
  `subMoveGroups` already separates and which have always resolved. So the user's
  own example, `1.e4 (1.d4 d5) 1...c5`, was never the broken case.
* **The broken case is several branches inside ONE pair of parentheses.**
  `Flat branch test: (4.Qxd4 e5 4.c3 dxc3)` gave ONE group — `5.0.0` `5.0.1`
  `5.0.2` — whose third move rewinds. That is what `branched` means, and what was
  dropped whole.

## 7.4 Each branch is its own line (v0.66.0)

Authors write several branches in one breath ("10.dxe6 fxe6 11.Bd3 d5 10…dxe6
11.Qxd8 …") and Chessable makes every move of that a clickable sub-move in the SAME
group.

`walkLine` cuts them apart: it SEGMENTS as it walks, playing each move from the
first of

1. where the current segment left off — no branch;
2. the END of a segment left open earlier ⇒ a variation closed, so RESUME it,
   scanned NEWEST-FIRST so nesting closes innermost-first;
3. a position already played FROM ⇒ a new branch off an earlier move.

**Rule 2 is the one that was missing**, and it is not a nicety: the position after
1.e4 is not in `before` at all until something is played from it, so the old scan
of `before` alone could only ever find the position inside the SIDELINE — "1…c5"
was anchored after 1.d4, i.e. quizzed as an answer to the wrong move.

It is a REFINEMENT, not a looser pass: every candidate is a position this very line
stood on, and `moveFits` still checks the printed move number of EVERY move as well
as legality. Spot-checked against the real `walkLine` in a headless harness before
anything was written down, then ground-truthed live 2026-08-04 (course 453453,
overstudy of 70382641, comment `Flat branch test: (4.Qxd4 e5 4.c3 dxc3)` on
3…cxd4) on BOTH readers:

* **DOM/browse** — `continuation: line 5|5.0 (Qxd4 e5 c3) writes 2 branches in one
  line — 1 of them quizzable`, `line 5|5.0#1 (c3) has no move for the user —
  skipped`, then `5 line(s) ready — h3 Nc6 | c3! d5 | Qxd4 e5 | Nb3 Nf6 |
  Nc3 Qxb2` and a launcher reading "Review clickables (5)". Before the change that
  group contributed nothing, so it was 4.
* **PLAN/heads-up** — the panel raised BOTH branching moves at 3…cxd4 ("Qxd4",
  "c3"), and "Review now" ran `starting 2 line(s) now — Qxd4 e5 | c3 dxc3`, played
  to `all lines done`.

The two readers legitimately disagree on the second branch: the DOM stops making
moves clickable after `4.c3` while the server's own comment JSON still carries
`dxc3`, so the plan reader has a user move there and the DOM reader does not. Both
are right about what their source says — which is why `quizzableLines` judges each
branch on its own rather than the group as a whole.

`branched` now means `segments.length > 1` (equivalent to the old "a rewind
happened" — a rewind can only create or resume, both of which need a second
segment). The entry keeps the WHOLE run in `plies`/`before` and ADDS `branches`,
because the lines written INSIDE it are anchored by their index in the run.

`quizzableLines` is ONE filter, shared by the DOM scanner and the lesson-plan
reader, which had drifting copies of the same three rules.

Each branch carries `moveIdx`, its plies' indices in the ORIGINAL run: a branch's
printed spans are NOT contiguous, so `lineSpans` (and through it
`navigateToLineEnd`) cannot find the move to click without them.

A group with a move we cannot read (Chessable writes null moves as `18.--`) is
`truncated` and is still dropped WHOLE — but, like every unquizzable group, it is
still stored in `resolved`, because its positions are the ONLY way to place the
lines written inside it.

### Annotations

A line whose USER-colour move is annotated "?", "??" or "?!" is dropped — authors
use these lines to show what NOT to play, and quizzing one would drill the blunder
as repertoire. `quickEditSanFromEl` STRIPS eval glyphs (the edit page's ids carry
none), so `moveAnnotation()` reads them separately as the trailing run of `!`/`?`
on the span (never inside SAN, so unambiguous), with the next sibling as a fallback
in case Chessable emits the glyph outside the span.

`isBlunderAnnot` tests the **first character** — that is what separates "?!" (drop)
from "!?" (keep), so never use a "contains a ?" test. An annotated OPPONENT move is
the PREMISE of a line about punishing it and stays quizzable.

## 7.5 Already in the course (`tagLinesInCourse`, v0.35.0)

Chessable lets the user add a clickable line to the repertoire as a real variation
(their own right-click on the line), which they then review normally — so quizzing
it here too drills it TWICE in one session. Such lines are tagged (`line.inCourse`)
and left out: `freshLines()` is what the launcher counts, what `openReview` runs and
what the scope picker filters, while `cr.lines` keeps everything so the tooltip can
say how many were left out.

The answer comes from the endpoint behind Chessable's own "Find position in
course": `GET /api/v1/getList?uid&bid&fen` with the JWT Bearer header
(`CONFIG.chessableApi`, shared with the chapter sort; `uid` comes from
localStorage and is REQUIRED — 400 without it) →
`{ list: { data: [ {id, name, moves, …} ] } }`, where a non-empty `data` IS the
answer and `name` is the variation's title. The page behind that URL is an SPA
shell whose HTML contains NOTHING (4.7 KB, no cards — do not try to scrape it).

Query FEN = the four-field `cacheKey` with `/` → `;`: the server ignores the move
counters and even the en-passant field but DOES match the side to move. The
position checked is the one AFTER the line's last move, i.e. reaching it means the
whole line was played.

Answers are cached per course+position in `chrome.storage.session`
(`cloCourseFenCache`, 12 h) because a hit downloads ~180 KB (a miss ~0) and a
session completes the same variation repeatedly.

EVERYTHING here fails **open** — no credentials, HTTP error, timeout, unexpected
shape, unreadable bid — the line simply stays quizzable, since losing a line to a
network hiccup is worse than drilling one twice.

## 7.6 One position, one answer — unless the answers are the same line forking

(`dropAmbiguous`, v0.34.2; combining added v0.67.0.)

Authors offer alternatives for their own side all the time ("10…fxe6 … 10…dxe6 …"),
and a quiz cannot ask those one after the other — the user would see the same board
twice and be marked wrong for a move the author also recommends.

So every USER ply of every quizzable line is collected per position (`cacheKey`, so
a transposition into a disputed position counts too) and a position with two
different answers is CONTESTED. **Opponent plies are deliberately not collected**:
two lines showing different replies to one position is the ordinary "and if he
plays this instead" case (verified live — variation 70382641's two lines branch
from the same position and both stay).

A contested position is resolved one of three ways:

* **COMBINED** (`mergeUserAlternatives`) when the clashing lines are the SAME LINE
  up to the disputed move — exactly what an author writing "or you can play…"
  produces. They become ONE line accepting EITHER answer, which then carries on
  down whichever was actually played. It counts as one line in the launcher and
  costs one pass; the branch not taken is not drilled this time, which is the point
  of combining rather than asking twice (the author's call, 2026-08-04).
* **DROPPED** when the MAINLINE answers the position differently. There is no
  second line to combine with — only the game the user has just played — and being
  asked to unlearn it a minute later is the trap this pass exists for.
* **DROPPED** when it is not a clean divergence: lines meeting at a position by
  different routes (a transposition), or disagreeing at more than one point.
  "Either move here, then carry on accordingly" is not a true description of those.
  `mergeUserAlternatives` REFUSES rather than approximates — a shared road up to
  the fork, a genuinely different move there, at least two lines — and the caller
  falls back to the drop. What "shared road" means was widened in v0.101.0; see
  §7.6a.

A line whose USER move carries "?", "??" or "?!" never reaches this pass at all
(`quizzableLines` drops it first), so a combined line can never offer a move the
author marked as a mistake. That was the stated condition for combining and it is
satisfied structurally, not by a second test.

**One fork per line** is all the run side supports, so a line already combined (or
dropped) at an EARLIER disagreement makes every other line at a later contested
position take the safe answer — `settled` in the loop. Without that guard a
position whose only remaining asker had already been folded elsewhere would "merge"
a group of one and let a real clash through.

The combined line is the member of the group that walked the MOST of the shared
road, with `alts` hung on the disputed ply, each alternative carrying its own
continuation and a `src` back to the line it was printed in. That is the FIRST of
the group whenever they all fork at the same index — i.e. in every case this
handled before v0.101.0, where ties keep the first — and §7.6a is the case where
it is not. The primary path stays exactly where it was, so everything that does
not know about alternatives — labels, `importantLine`, the heads-up's mini board —
keeps working untouched. The label shows the fork ("O-O b5/Qc7 Bb3") so a log line
says the pair was combined rather than one of them lost.

**At run time the path is RUN STATE, never the line** (`cr.path` / `linePath()`).
`startLine` sets it to the line's own plies and `tryMove` re-paths on taking an
alternative — prefix + the answer given + that answer's continuation. It must not
live on the line: the same combined line has to be playable the other way in a
later run. `step`, `currentPly` and `syncUi` all read the PATH, since taking an
alternative can make the rest a different length. `navigateToLineEnd` takes the
path too and follows the last ply's `src`: a combined path crosses from one printed
comment line into another at the fork.

Ground-truthed live 2026-08-04 on variation 71087636 with
`(7.O-O b5 8.Bb3) or (7.O-O Qc7 8.a3)`: both readers logged the combine, the
launcher went 2 → 3, and the prompt read "Black to play — either move".

> **The last claim of that run was WRONG and stood for six weeks.** It also said
> that playing the NON-primary Qc7 "finished the line and left the board on a3".
> It cannot have: `tryMove`'s alternative arm passed `applyMove` a ply with no
> resolved `mv`, and `applyMove` reads `ply.mv` on its FIRST line — it has done
> since v0.33.0, while the arm shipped in v0.67.0 and `git log -S` confirms it
> never carried one. Playing an alternative has therefore ALWAYS thrown. Fixed in
> v0.101.1; the bug and its symptoms are in §7.6a.
>
> Everything else in that run is a pre-move observation and stands. The lesson is
> the narrower one: **the run verified the OFFER, and the write-up claimed the
> ANSWER.** A verification note must not describe a step past the last one
> actually observed — and when the observed steps all pass, that is exactly when
> the unobserved one gets written down as if it had.

The hint names every accepted answer ("Play b5 or Qc7"); the ordinary prompt says
"— either move" before the user has to guess that the move they were about to play
is also right.

**One thing the order costs:** `tagLinesInCourse` runs AFTER this pass, so a
combined line is checked for "already in the course" by its PRIMARY ending only,
and a member that was already added as a real variation no longer drops out on its
own. Fail-open like the rest of that check, but it is why the count can differ by
one from what a pre-merge tagging would give.

## 7.6a The alternative is usually written in SHORTHAND (v0.101.0)

Reported as *"Alternative clickable lines doesn't work fully:
`(15. Nxd4 cxd4 16. b3 Qf5 alt. 16...Rfe8)` for example"* — and the answer is that
**BOTH lines were dropped**, so a comment written the commonest way lost every line
it held. The user saw nothing at all, with only a console line to say why.

### What actually happened

Authors do not repeat the road they have just printed. The second answer is spelled
out from the FORK — "16...Rfe8", not "15.Nxd4 cxd4 16.b3 Rfe8" — so `walkLine`'s
rule 3 duly makes it a branch of its own (§7.4), starting where the first branch was
standing, with the disputed move at ITS ply 0 rather than at the base line's ply 3.

`mergeUserAlternatives` then refused on two guards at once: a different `startFen`
("met by different routes") and a different fork index. Refusal falls through to the
drop, and the drop takes **every** line in the group — so the pair annihilated each
other. Both guards were doing their job as written; what was wrong was that they
described only the case where both branches are written out in full, which is the
rarer of the two.

### The widening

Members no longer have to fork at the same INDEX. What they must still share is the
ROAD:

* a member spelling it out in full is matched ply for ply from the same `startFen`,
  **exactly as before** — that path is untouched;
* one written in shorthand spells out only its tail, so its plies are matched
  **backwards from the fork** and its `startFen` must be a position the base line
  actually stands on there (`cacheKey(base.before[at - a.at])`).

Nothing is ever inherited that the base did not itself walk, which is what keeps a
genuine transposition refused: that has no shared road in either direction. The
backwards comparison is the same comparison as the old forwards one when the indices
are equal, term for term — it is a generalisation, not a replacement.

Three consequences worth knowing:

* **the base becomes the member with the largest `at`**, not `group[0]`. A shorthand
  branch's plies BEGIN at the fork, so taking it as the base would throw the shared
  road away and label the line "Rfe8/Qf5". Ties keep the first, so every pre-v0.101.0
  case picks exactly the line it used to.
* **`alts[].plies` slices from the alternative's OWN index** (`a.at + 1`, was
  `at + 1`), and `src.at` is its own index too. With equal indices these are the
  same expression; with a shorthand branch the old one silently sliced past the end
  and would have dropped the alternative's continuation.
* **the caller finds the base by key** rather than assuming `open[0]`.

The partial case falls out for free: an author who repeats one move before forking
("16.b3 Qf5 16.b3 Rfe8") gives `a.at = 1` against the base's 3, and the backwards
walk plus the `startFen` check confirm the repeated move really is the same one.

### Verified

Nine cases against the REAL `walkLine` / `branchLines` / `quizzableLines` /
`dropAmbiguous` / `mergeUserAlternatives`, sliced out of `content/lichessable.js`
by brace matching and run against the real `CloSan` — not transcribed, per the rule
in CLAUDE.md that an extraction in this file is not shippable on static checks
alone. The suite covers: the reported case; a shorthand branch WITH a continuation;
the partial shorthand; the pre-existing full-form pair (unchanged, base still the
first); order independence; a transposition still refused; the mainline clash still
refused; a "?" on the shorthand branch still dropping only that branch; and a WHITE
user, for whom the fork is an opponent choice and there is nothing to combine.

**Ground-truthed live 2026-08-11** on variation 70382641 (test course 453453). The
comment `(2. h3 Nc6 alt. 2...e6)` was written onto `Nf3_w_2` through Chessable's own
edit page and the rendered result read back off `/variation/70382641/`:

* **"alt." is PROSE between the spans**, not a move — the group's `textContent`
  reads `"2.h3c6 alt.2...e6"`;
* all three moves are clickable spans in **one group** (ids `2.0.0`, `2.0.1`,
  `2.0.2`), so the branch split is `walkLine`'s job and not the DOM reader's;
* the printed numbers are `"2."` / (none) / `"2..."`, which is exactly what makes
  the third move rewind to the fork.

Feeding those live spans through the real functions gives two branches — `h3 Nc6`
and `e6` — combined into one line `h3 Nc6/e6` forking at ply 1, and the fork
position the walk derives matches the `data-fen` Chessable itself put on the `2.h3`
span. The test comment was restored to `(2. h3 Nc6)` afterwards and the group
confirmed back at two spans.

### The alternative arm had never worked (v0.101.1)

Reported within the hour, on `(4.d4 cxd4 5.Nxd4 g6 or 5...Nxd4)`:

```
lichessable.js:15215 Uncaught TypeError: Cannot read properties of undefined (reading 'from')
```

…with the board frozen mid-trade, the knight still on d4.

`applyMove(ply)` reads `ply.mv` — a RESOLVED CloSan move — on its first line, and
has since v0.33.0. Every caller gets one from `currentPly()`, which attaches it per
position (a line's stored plies carry no `mv`, and must not: it is only valid for
one position). The alternative arm built its `played` ply out of the alt record's
named fields and passed it bare, so `mv` was `undefined`. **Since v0.67.0, playing
an alternative has always thrown** — confirmed by `git log -S`, which shows the call
introduced there and never carrying an `mv`.

The fix is one term: `applyMove({ ...played, mv })`. In `tryMove` the parameter `mv`
IS that move — `uci` was derived from it, and `uci === alt.uci` is the branch's own
condition — so nothing has to be re-resolved.

Two things worth keeping:

* **the frozen board is diagnostic, not incidental.** `cr.path` is reassigned
  BEFORE `applyMove`, so the throw left the path advanced and the position and
  board untouched. Any report of "it stopped without moving the piece" in this
  module should send you to whatever ran between the state write and the paint.
* **v0.101.0 did not cause this; it made it REACHABLE.** The arm needs a combined
  line, and until the shorthand widening the only combinable shape was the rare
  full-form pair. A latent bug behind a rare path became a certain bug behind a
  common one on the same day — which is the ordinary way a widening finds things,
  and an argument for exercising the path a widening opens, not just the widening.

**Now executed, not just checked.** `altplay.js` slices the REAL `tryMove` and runs
it against the real `CloSan` with the DOM-facing calls stubbed and recorded, on the
reported line: no exception, the ALTERNATIVE applied (not the primary), `plyIdx`
past the fork, the path re-pathed, no wrong-guess counted, and the primary answer
still playing from a fresh state. **The control matters more than the suite** — with
the fix reverted in a copy of the source it reproduces the reported message exactly
and 4 of 8 checks fail. An earlier version of that control passed against the broken
copy because the harness overwrote `CLO_SRC` and silently read the good file; a
control that cannot fail proves nothing, so check it fails before trusting it.

**Still not verified live: the combined line being played in a real session.** That
needs a trainer browse state, which means completing a variation, and driving
MoveTrainer2 from automation has already lost to the per-move clock more than once
in this project (see `DESIGN-add-as-variation.md` §3b). What is left to watch is
`navigateToLineEnd` landing on the right printed span after an alternative — it
follows `src.at`, which for a shorthand alternative indexes into the BRANCH's own
`moveIdx`, not the base line's.

## 7.7 Input

Click-then-click **and** drag-and-drop. The drag layer sits ON TOP of the click
path, which is unchanged: `pointerdown` only ever picks a piece up (the same
selection a click makes), the pointer is CAPTURED on the grid so the drop square is
resolved GEOMETRICALLY (every captured move/up event targets the grid, not a
square), and `cr.swallowClick` stops the trailing click being acted on twice. That
flag is cleared on EVERY pointerdown before any bail-out — a sequence ending
without the expected click would otherwise eat a later real one — and is otherwise
SET on every pick-up.

Under `dragSlopPx` travel a press stays a click. `touch-action: none` on the board
(not `manipulation`) keeps a finger drag from scrolling the page.

**DESELECT** (pressing the already-selected piece) is done by `onDragEnd` from
`drag.wasSel`, NOT by the click path: `setPointerCapture` retargets the whole
compatibility sequence — mousedown/mouseup, hence the CLICK — to the GRID, so after
a pick-up the click never reaches a `[data-sq]` element and `onSquare` is never
called. Ground-truthed live 2026-07-26; that is why clicking a selected piece did
nothing before v0.34.0. **Never move that deselect back into the click handler.**

**Right button draws:** drag = arrow, click = circle, same shape again removes it
(`cr.shapes`, the in-flight one `cr.shape`). ONE `<svg>` over the piece layer,
geometry in BOARD UNITS like the squares and pieces, so a resize needs no JS;
`pointer-events: none` keeps input on the grid and `contextmenu` is prevented on
the board element. Drawing is allowed while `cr.busy` (an annotation is never a
quiz answer); shapes are scratch work, cleared by ANY ordinary press on the board
(before the busy bail-out) and by every move — nothing is persisted, and one colour
is the whole design.

Legal-target markers are COPIED from Chessable's live rules rather than
approximated (33 % dot at effective alpha .21; their radial-gradient ring on a
capture) — the square colour is ours on purpose, the affordances are theirs.

A refused move needs NO rollback — our position only ever advances on the correct
move. Two misses spell the answer out (`wrongHintAfter`).

## 7.8 Walking a line instead of being asked for it ("Navigate", v0.84.0)

`cr.browse` is a FLAG INSIDE the quiz, deliberately not a fourth `cr.mode`. It is
the same run — same queue, same line, same `cr.path` — and everything that branches
on `cr.mode` (`closeReview`'s `navigateToLineEnd`, the `--important` class, the
drill's card bookkeeping) must keep reading `'quiz'`; a mode of its own would have
had to duplicate every one of those branches to arrive back where it started.

Only TWO things change: `moverColor()` returns null (so the click and drag paths
accept nothing, with no knowledge of browse in either) and `step()` is not driving
— `startLine` skips it, which is what keeps the flag alive across a line change.

`browseGoto(i)` is `anGoto`'s shape: every ply ALREADY carries the position after
it (`fen`, from `walkLine`/`drillPlies` via `fenAfterUci`), so a jump is one
`parseFen` and is exact, where replaying the moves would only be as good as the
replay. The one step FORWARD is special-cased through `applyMove` — that is what
GLIDES the piece; a rebuild teleports it.

Leaving browse resumes the quiz FROM WHERE THE BOARD STANDS rather than restarting
the line: `cr.pos` and `cr.plyIdx` are already consistent, so `step()` needs no
help, and "walk to the interesting move, then be asked from there" is the gesture
worth having. Per RUN, not a preference (`beginRun` and `closeReview` both clear
it) — the launcher was pressed to be quizzed.

The move list is the analysis board's, extracted as `renderMoveList(moves, idx,
startFen, emptyText)`: both are "a straight line of moves with a cursor in it", and
the numbering — continuing the source game, with the leading "…" when the line
starts on Black's move — is exactly what a second copy would get wrong. Items need
nothing but `san`. The keys are the analysis board's too (arrows/Home/End), which
were free: that handler returns on any mode but `'analysis'`.

NOT offered on a drill card: its whole content IS the move being asked for, so
"navigate" there is just the answer — and section 23's two keys already reveal that
one. Hint is hidden while browsing, and "Skip line" reads "Next line", since
walking to the end of a line does not move on by itself.

Measured in the harness: the 4-button quiz row fits one line from 276 px (368 px
under `html.clo-touch`) and wraps below that; the browse panel keeps its controls
on screen with a 20-ply line at the live comment box's 506×385, the list scrolling
inside `flex: 1 1 auto`.

## 7.9 The scope picker, ending a review, and auto-start

**Scope picker.** A line's `fromFinal` flag is `startFen === fens[fens.length-1]`
(string compare is exact — both sides come from the same `fens` array). When a
variation has BOTH kinds, pressing the launcher shows "All continuations (n)" /
"Final continuations (m)" / Cancel instead of starting: continuing from where the
variation ended is the ordinary case, while an earlier branch revisits a move
already answered. Only ONE kind ⇒ no picker, straight into the quiz.

`cr.lines` is everything DISCOVERED (drives the launcher label and the picker
counts); `cr.queue` is what the current run plays — `startLine`/`nextLine`/`syncUi`
all index the queue, never `lines`. The board stays HIDDEN behind the picker: there
is no single position to preview, and `syncUi` early-returns on `!cr.line` so the
picker's text is not overwritten.

**Ending a review leaves their board on the line** (v0.38.0). `closeReview(why,
navEnd)` — `navEnd` true only for a user-driven end (finished, Exit, Escape; NEVER
a teardown the trainer forced, where the variation it would click in has gone) —
presses the line's last PLAYED sub-move span, so the review panel (whose FEN comes
off that board) is already showing the line's final position when the overlays come
down.

Ground-truthed 2026-07-27: a bare `.click()` on a `commentSubMove` span does
NOTHING; it needs `pressSquare`'s pointer+mouse sequence, exactly like a board
square. The span is found by matching the line's SAN sequence against freshly
grouped spans (`lineSpans` over `subMoveGroups`) — NOT by an element stored on the
line: a queued line (§6) came from the plan and never had one, and the comment
re-renders freely. `cr.plyIdx` caps the index, so an early exit lands on the last
move the user was SHOWN, and `played <= 0` navigates nothing.

**Auto-start** (`autoKey` = `cloAutoReviewClickables`, storage.local, opt-IN):
`maybeAutoStart` runs `beginRun(freshLines())` from the tick once the lines are
ready — launcher and picker skipped, the setting IS the answer to "which lines?".
Armed once per variation (`cr.autoRan`, which `beginRun` sets for ANY run, so
exiting never drops the user straight back in), and it stands down while
`retryRunActive()`: that pass navigates between variations itself and would tear a
just-opened quiz down.

## 7.10 A note on verifying this feature

The browse-state gates need a CLEAN completion. A run that ends in "Time's up"
renders the move list and the clickable lines but NO `practiceProgress` block, so
`reviewBrowseReady()` stays false and the launcher never appears — which under
automation (where the clamped timers make "Time's up" the default outcome) reads
exactly like a broken scan.

---

# 8. The heads-up since §6 — everything added after v0.36.0

§6 describes the panel as first built. What follows is what it became.

## 8.1 The source is the LESSON PLAN, not the DOM

Ground-truthed 2026-07-27 on `/practice/453453/70382641/0/b` by playing the
variation through with a MutationObserver watching: **a quiz renders NO
`commentMove`, NO `commentSubMove`, and not even a `commentScrollContainer`.** The
comment column says "Quiz — Black to play!" and nothing else, before and after
every answer. Everything the browse scanner reads is created only when the
variation completes. (v0.36.0 read the DOM and therefore never showed anything.)

Each ply's `comment` is a JSON STRING carried in the plan and passed through
verbatim by `pagestate.js`:

```
{ before, after, data:[ {key:'V', val:[ {key:'S', val:'5.Nb3'}, …,
                                        {key:'C', val:'<br/>'},
                                        {key:'V', val:[…]} ]} ] }
```

`'V'` a line, `'S'` a clickable move, `'C'` prose, a `'V'` inside a `'V'` the
nesting the DOM ids spell "7.0.3.0". That yields the grouping, the nesting, the
branch index (the count of `'S'` siblings before a nested `'V'`, minus one —
verified to equal the DOM's) and, which the DOM never had, the EXACT positions the
comment hangs between. `after` is tried first (a line carrying on past the ply),
then `before` (one offering an alternative TO it); both occur in the same
variation.

Anchoring itself is unchanged — `walkLine`, printed number plus legality. The
browse-state scanner stays on the DOM: it works, and the two agree on `lineSig`,
which is all the hand-over needs.

The mini board reuses the quiz board's own geometry, cloned piece SVGs and arrows,
so the two boards cannot drift apart.

## 8.2 Three rules about which lines are raised

* **Only lines whose FIRST ply is the OPPONENT'S — except at the final position.**
  A line starting with a move of the user's colour branches where the trainer is
  about to ASK them for a move, so raising it hands over the answer. At the FINAL
  position the variation is over and there is nothing left to give away, so a
  continuation of the user's own colour is offered there too (`startPly <
  finalPly` is the whole test). The wording follows: "The opponent can also respond
  with:" mid-variation, "From here the opponent can play:" / "You can also carry on
  with:" at the end.
* **Only lines anchored on a MAINLINE position are RAISED** — a line anchored
  inside another comment line branches from a position the user never plays
  through, so there is no moment at which to raise it. **But it is still CARRIED**
  (`linesInside`, `groupLines`, v0.66.1 — reported and reproduced live on variation
  71087636 with `(6.O-O! fxe4 7.Nxe4 (7.Ne5 d6 and Black is better.) 7...d5 …)`,
  where the console read `2 clickable line(s) …, 1 can be pointed out`). That rule
  was right about when to SHOW such a line and wrong about what to do with it: the
  author wrote `(7.Ne5 d6)` as an alternative to a move of the very line being
  pointed out, so it is part of the SAME offer, and dropping it made "Review on
  variation end" and "Review now" quietly review half of what the comment says. The
  browse-state launcher never had the problem — it has no mainline rule.
  **Carried, not printed:** the panel's rows are the alternatives at THIS position
  and a move branching four plies later is not one, so `showHeadsUp` adds a quiet
  "+n line(s) written inside" row instead and the mini board's arrows stay
  `group.lines` only. `armHeadsUp`/`reviewNow`/the "already armed" test take
  `groupLines(group)` = `lines` + `inside`; `headsUpScan` extends the
  `tagLinesInCourse` candidates the same way.
  The relation is DERIVED FROM POSITIONS, never from the comment keys, so it holds
  for both readers with no key surgery: a line is inside another when it starts on
  a position that other line REACHES. Its own start position is deliberately NOT in
  that set — a line starting where the host starts is a SIBLING, and at the root
  those are raised in their own right; including it would duplicate them into the
  queue.
* **The clock is the plan's own `fen`** located in the plan's `sourceFen`s
  (`pollHeadsUpPly`, asynchronous, so at most one tick stale — the right lag, since
  the panel must not blink out on the frame a piece lands). A line branching at
  mainline ply k goes up when the trainer reaches ply k and comes down at k+2: the
  OPPONENT'S reply (ply k) leaves it standing, the USER'S next move (ply k+1) takes
  it away. That is the asked-for "it disappears when you move".
  **Never derive this clock from the board DOM.** Ground-truthed 2026-07-27: after
  a rolled-back wrong answer the board held a stale DUPLICATE piece (a knight on b8
  AND c6) for far longer than an animation, which no one-king-per-side check
  catches; the derived placement then matched no plan position at all and the clock
  simply stopped, leaving the panel up over a position the user had left several
  moves earlier.

A first move that merely transposes back into the variation (`cacheKey` of its
post-FEN equals the mainline's next position) is not an alternative and is dropped.
`tagLinesInCourse` is AWAITED before `cr.hu.lines` is assigned, so no line is ever
raised untagged; it runs for the CANDIDATES only.

The scan runs ONCE per variation (the plan holds every comment from the first
frame) and only after `getReviewBoard()` exists — before that there are no React
fibers to walk, and a small retry budget was otherwise spent entirely on "no fiber
root" during the cold boot, permanently skipping the variation (v0.36.2). Budget is
`headsUpScanTries` (~30 s at the 500 ms tick). Wiped by `resetHeadsUp` on every
variation change and on leaving the trainer path.

## 8.3 It runs in the browse state too (v0.37.0), and the queue is never auto-started

Lines that carry on from the FINAL position branch where the variation ends, so
there is no earlier moment at which to raise them. `tick` therefore calls
`headsUpTick` in BOTH branches (browse only while `!cr.active`, or it would fight
the quiz overlays it is about to be replaced by).

**The queue is never started automatically.** A filled "Review queued lines (n)"
button (`cr.queueBtn`, ahead of the plain launcher in the same cluster) calls
`runQueued`. Landing in a quiz nobody asked for is jarring, and the final
continuations are only offered once the variation ENDS — so the user must have a
moment to add those to the queue before anything starts. The button only shows in
the browse state: our board overlays Chessable's, so running mid-quiz would cover a
live quiz board. `beginRun` clears the queue, whichever way the run started.

While it shows, the plain "Review clickable(s)" launcher is HIDDEN: a user who
picked lines by hand has already said which ones they want, so "all of them" beside
it is noise and the two green buttons compete. It comes back the moment the queue is
spent or the variation changes — which is also the only way to abandon a queue.

**The queue is the RESOLVED LINES themselves** (`cr.hu.armed`: lineSig → line),
handed straight to `beginRun`, skipping the All/Final picker (the user already
chose). It used to store only the NAMES and look them up again in the browse
scanner's `freshLines()`, which meant a line could be offered mid-quiz and then
silently withdrawn at the end ("the line(s) queued during the quiz are no longer
offered", v0.36.6).

The two readers are ALLOWED to differ: the DOM one has a wider anchor set (the
whole mainline, not just the comment's own two positions), counts the attach ply
from printed moves rather than from the plan, and never sees a `comment_before`
block as its own — any of which can land the same line on a different startFen,
changing its lineSig. Nothing about a queued line needs re-deriving anyway: it was
resolved against the plan's exact positions, `walkLine` proved every SAN legal, and
every condition above was applied before it was ever raised. **Never reintroduce a
cross-reader lookup here.**

Queueing a line HIDES the panel after `headsUpQueuedHideMs` (v0.38.0): its work is
done and it sits over the gutter — or, on a phone, over the comment column.
`armHeadsUp` already adds the group to `seen`, so the next tick cannot raise it
again; the timer is cleared by `hideHeadsUp`.

At the final position with an EMPTY queue there is no arm button (v0.63.0): "Add to
review queue" beside "Review now" then offers a second button to go and find in
exchange for nothing — the variation is over, so the wait it names has already
happened. `cr.hu.armed.size` is the test, not `group.final` alone: once anything IS
queued, adding to a set that will be played in one go is a real choice and the
button comes back. Mid-variation it always stands.

## 8.4 "Review now" (v0.51.0) and holding the trainer

The panel's SECOND button, and the only run that lives OUTSIDE the browse state.
`reviewNow` plays the SHOWN GROUP on the spot: `beginRun(lines, spot=true)`, whose
`spot` arm keeps everything else as it was (only the played lines leave
`cr.hu.armed`, `cr.autoRan` is NOT set, so the auto-start stays armed for the
variation's other lines) and sets `cr.midQuiz = spot && !reviewBrowseReady()`.

That flag is what `tick` checks before its "left the browse state" teardown — every
OTHER active review must still die there, since outside the browse gates it means
the trainer moved on underneath us; this one was opened over a live quiz
deliberately. Mid-quiz the panel placement needs no special case either:
`positionOverlays` falls back from `reviewCommentBox` (a live quiz renders NO
scroll container — §8.1's fact) to `reviewCommentCol`.

**The trainer is put on hold for the duration** (`holdTrainer` / `releaseTrainer`,
the latter called from `closeReview` on EVERY close, so a run torn down by a
variation change cannot leave the session paused):

* the session TIMER is paused, or the minute spent in a sideline is charged to the
  card being answered. Ground-truthed live 2026-08-01: pausing is a plain `.click()`
  on `trainerPauseButton()`, while the play overlay that replaces the board
  (`SELECTORS.trainerPlayOverlay`) needs the full `pressSquare` pointer sequence — a
  bare `.click()` on it does NOTHING, exactly like a board square. Pausing leaves
  the board element and every `[data-piece]` in place (the pieces merely go to
  opacity 0), so the overlays measure and clone off it as usual, and the quiz
  position is untouched. A session paused by SOMEONE ELSE (section 10's
  background-tab auto-pause) is left alone by `pauseTrainerTimer` and so never
  becomes ours to resume.
* the control is NOT always on screen — Chessable empties the board footer in the
  study/transition states between quizzes, which is exactly when the heads-up can be
  up — so `maintainTrainerHold()` retries once per tick while the run is active
  instead of giving up on the one press.
* AUTO-PLAY is held off through `autoPlayHold(true)`: our board covers theirs and
  the session is paused, so an injection would be a move played into a board nobody
  can see. Release re-enters the loop at once. `releaseTrainer` resumes the timer
  BEFORE releasing auto-play, for that same reason.

Exit reads "Back to the quiz" in this mode — leaving is not "give the board back
and be done" but "go back to the card I was in the middle of", and the timer
restarting is the half the user cannot see.

**Hidden while auto-play replays.** `headsUpTick` returns early on
`autoPlayReplaying()` — during the opening replay the positions go past at
auto-play's own speed, so a panel raised on one of them either flashes by unread
or, worse, stands over a position the replay has long left. HIDDEN, not dismissed:
the group stays out of `seen`, so whatever is still branching where auto-play hands
back is raised the moment it does. The bridge answers `injected || injectTimer`,
else a move injected within `replayQuietMs` (1.5 s) — the quiet window exists
because NOTHING else marks the gap between one replayed move landing and the
trainer's reply, and `maybeHandback` clears `vs.replayAt` so a real handback shows
the panel immediately. Verified live that with auto-play merely ENABLED (the common
case) the panel still appears.

## 8.5 Placement

**In the browse state it COVERS the comment** (v0.60.0), for the same reason the
QUIZ panel always has: the lines it is offering to quiz are PRINTED THERE. A
completed variation's comment regularly ends with the whole line written out ("If
white goes for the doubled pawns: 7.Bxc6+! bxc6 8.O-O Bg4 9.h3 Bh5 10.d3 Rg8
11.Bf4 Qd5"), so a heads-up that offers that line while leaving it on screen has
handed over every answer before the user presses anything.

`placeHeadsUp` therefore prefers `SELECTORS.reviewCommentBox` — the comment's own
SCROLL CONTAINER, which a live quiz does not render at all — so the rule is
self-limiting: container present ⇒ browse ⇒ cover it. The whole container, not its
top: the clickable lines are usually the LAST thing in a long comment.

**Mid-quiz it falls back to the COLUMN** (v0.63.0), `reviewCommentCol`. CLAUDE.md
used to refuse this on the grounds that Chessable's own "Quiz — White to play!" was
worth leaving readable, this panel being unsolicited where "Review now" is asked
for. Overruled on the evidence: that column prints ONE sentence and is then empty
for the whole card, the board says whose move it is anyway, and the room is what the
mini board grows into — 176 px in the gutter against 317 px over a 455 px column.

Two differences from the spoiler branch, both deliberate:

* the column is SIZE-GATED (`headsUpCoverMinPx`, 300) and the box is not. Covering
  the box is a SPOILER decision — the answers are printed in it, so it is taken at
  any size, overflow and all. Covering the column buys room and hides nothing, so a
  column too short to hold the panel is not worth taking.
* the panel keeps its CONTENT HEIGHT over a column and is stretched to the box. Over
  a column it is the WIDTH that limits the board (a trainer column runs 600 px+), so
  a fixed height would leave the panel half empty for nothing.

This retired the old preference, the gutter LEFT of the board, whose comment read
"which during a quiz is empty: the review panel only ever shows in the browse
state" — true when written, and falsified by v0.37.0 extending this panel INTO the
browse state, where the review panel is in that gutter: it covered the Lichess move
table (which spoils nothing) and left the comment showing (which spoils
everything).

Ground-truthed live 2026-08-03: mid-quiz `[406,113,300,304]` content-sized and no
scroll container; browse `[1226,161,506,385]` against a comment box of exactly
`[1226,161,506,385]`, opaque, with the Lichess panel at `[286,113,420]` no longer
overlapped.

In a STACKED layout (portrait) while the quiz is LIVE, placement stops at the
board's own FOOTER instead of also clearing the overstudy widget and the whole
trainer row (`coverComment` = stacked && `!reviewBrowseReady()`): down there
Chessable prints nothing but "Quiz — White to play!", while our panel would
otherwise be a scroll away from the board it is talking about. Since v0.63.0 that
is the SHORT-column case only.

### Sizing the mini board

`fitHeadsUpMini` (v0.63.0). Everywhere else the panel wraps around a
`headsUpMiniPx` board; over the comment box the panel has a BOX (~506×385 live), and
a 176 px board in that leaves the only thing worth looking at as the smallest part
of the panel. So the board takes whatever the rest leaves — **measured, never
estimated** (the lead sentence, the number of move rows, the queued note and the arm
button's presence all vary in height, and this must never push the buttons out of a
panel that cannot scroll): collapse the board, let the panel size to content for one
synchronous read, restore.

The BODY's height comes back off (`rest` is everything OUTSIDE it) — the move rows
sit BESIDE the board and are absorbed by it, only `headsUpMovesColPx` of WIDTH is
theirs. That is not a detail: counting them as height instead (i.e. dropping them
below the board, which at that width looks like the tidier layout) measured 207 px
of edge against 261 in the harness.

`headsUpMiniPx` is the FLOOR, so a box too small to fit the fit is left exactly as
it was. Measured: 261 px over a 506×385 comment box (height-bound), 317 px over a
455 px-wide column (width-bound). The measurement needs a laid-out panel, so it
bails while `hidden` and `showHeadsUp` calls again after unhiding, and it is cached
against everything that can change the answer because `placeHeadsUp` runs on every
scroll event and this forces two reflows. The glyph piece fallback is the one thing
on that board NOT sized in percentages, so `sizeHeadsUpMini` sets a font-size on the
board element and the stylesheet inherits it.

## 8.6 Quiet at rest (v0.84.0), darker rather than transparent (v0.87.0)

This panel RAISES ITSELF — nobody asked for it — beside a board the user is being
quizzed on, and at full strength it competes with the card being answered; it was
reported as "somewhat annoying". So it rests dimmed and comes up on hover, because
NOTICING it and READING it are different acts and only the second is deliberate.
`:focus-within` is in the same rule as `:hover`: both buttons are keyboard-reachable,
and a panel still dim while one of them has focus is at its least readable exactly
when it is about to be pressed.

`filter: brightness(var(--clo-heads-rest))` on an opaque surface, where v0.84–0.86
used `opacity`. Opacity was the wrong property twice over, and the whole tangle it
created is now GONE:

* it made the panel TRANSLUCENT, so whatever sat under it showed through — muddy
  over Chessable's UI, and outright dangerous over the comment box, where what shows
  through is the answers to the very lines being offered. So that placement needed
  an exemption…
* …and the exemption needed `!important` to outrank the TOUCH rule, which itself
  existed only because a phone has no hover to lift the dimming with — two releases
  of exemptions (v0.84.0 exempted touch outright, v0.85.0 rested it higher instead)
  that were both about opacity and neither about touch.

An opaque panel raises none of that: the resting dim is now the SAME in every
placement and on every device. Measured in the harness: ordinary
`brightness(0.78)`, IMPORTANT `0.92` — an author's "!" is the whole reason a line is
worth interrupting for, so its mark (18c) must read THROUGH the dimming rather than
be the first casualty of it — and `brightness(1)` on hover/focus, with `opacity`
staying 1 throughout.

It FADES IN over 0.5 s (`@keyframes clo-heads-in`, class `.clo-cr-heads--in`). An
ANIMATION, not a transition, because the element is REUSED — `showHeadsUp` unhides
it rather than creating it, so there is no property change for a transition to run
from; that function restarts the animation by removing the class, forcing a reflow
(`void el.offsetWidth`) and adding it back. Without the reflow the browser coalesces
the pair and nothing restarts.

`.clo-cr-heads--cover` SURVIVES, for the fade and nothing else: a fade IS opacity by
definition, so over the comment box it would make the clickable lines legible for
half a second — which is what that placement exists to prevent. There the panel
simply appears, at once and fully opaque. Set by `placeHeadsUp`, the only code that
knows which placement it took, and only for the SPOILER — never for the mid-quiz
COLUMN, which prints one sentence and hides nothing.

> **Note for measuring this:** the dim carries a 120 ms transition, and
> `getComputedStyle` returns the ANIMATING value — in a browser pane that is not
> compositing frames the transition never advances at all, so a probe reads the
> resting value for ever and the rule looks dead. Set `transition: none` on the
> element before reading (that is how the figures above were taken).

## 8.7 Keys, and the setting

Unlike the quiz panel this one must **not** swallow keys — the user is still playing
on Chessable's board and needs MoveTrainer2's shortcuts — so its buttons `blur()`
themselves after a press instead, or the next space would re-fire them.

Opt-OUT setting `cloLineHeadsUp` (storage.local, absent = ON), watched through
`chrome.storage.onChanged` so a change lands in open trainer tabs. TWO controls
write it: the options-page checkbox, and the panel's own "Turn off" — the setting
has to be reachable from inside the session, since the options page is another tab
and the panel's moment has passed by the time anyone gets there. That one arms on
the first click and disarms after `headsUpOffArmMs` (auto-play's "Clear" pattern): a
misclick would otherwise cost the feature for the rest of time, with the options page
the only way back. `turnHeadsUpOff` sets the local flag and hides the panel BEFORE
the write, so an orphaned content script still obeys the press.

Deliberately NOT gated on `document.hidden`: auto-play is, because it DRIVES the
board; this panel only reads and renders, and is invisible in a hidden document
anyway — the guard bought nothing and made the feature impossible to verify under
automation, where a driven tab always reports itself hidden.
