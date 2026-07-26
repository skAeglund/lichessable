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
