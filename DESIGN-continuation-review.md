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
line, in DOM order. `7` is the mainline ply the comment hangs off (ply 7 = `Qb6`,
the last ply of an 8-ply variation).

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
* the mainline attach ply (reliable),

but never the branch position.

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
2. SAN per span via `quickEditSanFromEl`; an unreadable one drops the line.
3. Mainline positions from the plan: `fens[i]` = before ply *i*, `fens[n]` =
   after the last ply.
4. Candidate anchors per line, in order: **after** the attach ply, **instead of**
   it, the parent line's positions, then the rest of the mainline. Lines are
   resolved shallowest-first so a genuinely nested line can anchor inside its
   parent.
5. Accept on number match + full legality. Fallback when the number fits nothing:
   the two attach positions, legality alone. Nothing else — a line that resolves
   nowhere is **dropped** with one console line.
6. Drop lines with no move of the user's colour (there is nothing to quiz).
7. Drop lines whose **user-colour** move is annotated `?`, `??` or `?!` — authors
   use these lines to show what to avoid, so quizzing one would drill the blunder
   as repertoire. Read by `moveAnnotation()` as the trailing run of `!`/`?` on the
   span, because `quickEditSanFromEl` strips eval glyphs (the edit page's element
   ids carry none) and `Be3??` would otherwise be indistinguishable from `Be3`.
   `isBlunderAnnot` tests the **first** character, which is what separates `?!`
   (drop) from `!?` (keep) — a "contains a `?`" test would be wrong. An annotated
   **opponent** move is the premise of a line about punishing it and stays.

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
acted on a second time. It is deliberately not set when the press landed on the
already-selected square, so clicking a selected piece still deselects it. Under
`dragSlopPx` of travel a press is still a click, so nothing about click-to-move
changes. `touch-action: none` on the board keeps a finger drag from scrolling the
page instead.

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
