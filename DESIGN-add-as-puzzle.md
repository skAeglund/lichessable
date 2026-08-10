# DESIGN — "Add as puzzle" (section 19d)

Status: **built in v0.97.0** as section 19d of `content/lichessable.js` (the
analysis board), and extended in **v0.98.0** to the clickable lines Chessable
prints inside a comment — section **19e**, §6 below. Everything under "Findings"
was ground-truthed live on the test account 2026-08-11 (course **453453**
"Testing course", chapter lid 1 "sicil test"). Four variations were created
through the endpoint across the two features and read back through three
different calls, then deleted with `updateOpening&mode=del`; the course was
verified back at its original 80 each time.

The sibling feature, "Add as variation" (`DESIGN-add-as-variation.md`, section
19c), writes the analysed line **with the source variation's own plies in front
of it**. This one writes the line **alone, starting from the position the analysis
board was opened on** — which is what a puzzle is on Chessable: a variation whose
`initialFEN` is a mid-game position, quizzed from its own first move.

---

## 1. What the user asked for

> Similarly to the new "add-as-variation" feature — I want an "Add as puzzle"
> feature. It's very similar, except the start position of the variation. The
> puzzle would start from the beginning of the analysis (FromPosition FEN)
> instead of the normal start position. The destination is also more important,
> as puzzles are often located in their own chapter inside a course.

And, as a follow-up (§6, built next): the same write offered on a **clickable
line**, from the context menu Chessable already puts on one.

---

## 2. Findings (ground truth, 2026-08-11)

### 2.1 19c's endpoint cannot do it, and no field of it can be made to

`importSubvariationFromSource` takes `initialFEN` from the **source variation**,
always — verified in 19c's own testing (`DESIGN-add-as-variation.md` §2.4), where
a copy carried the source's mid-game FEN even though the line was ours from ply 1.
There is no field that overrides it, and the whole `plyNumber` mechanism exists to
splice our moves into that variation's own game. A puzzle is the opposite request.

### 2.2 The endpoint that can: `importGame`

```
POST /api/v1/importGame?uid=<uid>&bid=<target course>
Authorization: Bearer <localStorage['chessable.web.production.JWT']>
platform: web                      (no CSRF field — section 5c's auth exactly)

{ data: "<JSON string: an ARRAY, one entry per variation to create>" }

entry = { head:  { …16 PGN header keys…, fen: "<start position>" },
          color: "white" | "black",
          name:  "<title>",  orig: "<title>",
          lid:   <chapter id>,
          moves: [ …move PAIRS, see §2.3… ],
          line:  "4...Nf6 5.Nc3 a6" }

→ 200 { game: { owned: true, oids: [ 71375957 ] }, hash: "194" }
→ 500 { error: { message: "Column 'moves' cannot be null", … } }
```

This is what Chessable's own `/analysis/` **"save to course"** drawer posts, and
what PGN import posts. Read out of the minified bundle (`N(uid,bid,data)` →
`c.Z.post("/v1/importGame", {data: JSON.stringify(n)}, {params:{uid,bid}})`),
then exercised live.

**`head.fen` becomes the new variation's `initialFEN`** — that is the entire
feature. Read back through `getList`:

```
initialFEN: "r1bqkbnr/pp1ppppp/2n5/8/3NP3/8/PPP2PPP/RNBQKB1R b KQkq - 1 4"
moves:      [{san:"4...Nf6",isKey:true}, {san:"5.Nc3",isKey:true}, {san:"a6",isKey:true}]
```

**There is no `source` field.** The body names only the target, so this write
needs no ownership of — and makes no reference to — the course the line came out
of. A puzzle can therefore be lifted out of a **bought** course into one of your
own, which is exactly the case 19c §3.3 records as the one it cannot serve.

`head` is Chessable's own `Bm` constant with `fen` filled in: `event, site, date,
round, white, black, result:"*", eco, variant, annotator, plycount, eventDate,
source, sourceData, fen, setup` — every other value the empty string. Sent
verbatim; a header their client always sends is not one to start omitting.

**Never send `oid`.** With `allowDup:false` their own flow looks up an existing
variation by `head.fen + line` and sets `oid` on the entry, which makes the call
**overwrite** that variation. We never set it, so every call creates.

### 2.3 The body wants move PAIRS, not plies — and the transform is theirs

The first attempt sent the obvious per-ply array and got
`500 "Column 'moves' cannot be null"`. Their client transforms the plies into
Chessable's **storage** shape — one row per move PAIR — before posting, and
`pairPuzzleMoves` is a faithful copy of that transform:

```
row = { mid, sanW, sanB, nagW, nagB, fen, fenW, fenB, isKey,
        drawW, drawB, commentW, commentB, commentBW, commentBB,
        lastBlack, move: "5.Nc3 a6" }
entry.line = rows.map(r => r.move).join(" ").replace(/\. /, ".").trim()
```

Per ply, before the fold (their `Be`):

```
mid   = Math.floor((i + startsBlack) / 2)     i = 0-based ply in OUR line
move  = fullmove number of the position it is played from   (their ch(fen))
color = 'w' | 'b';  f1 = position before;  f2 = position after
key   = true for every ply — a puzzle is all solution, no run-up
```

Two of the transform's results **look like bugs and are not ours to fix**:

* **`fen` lags by a ply** — pair *k* is given pair *k−1*'s black-move position.
  Checked against a natively created variation (70382641) through `getLesson`:
  its `move_fen` for mid 1 is the position after 1.e4, not after 1...c5. So the
  lag **is** the convention.
* a black-first pair reports its `c` (would-be `fenW`) as the position *after*
  its move. Also theirs, also harmless — `fenW` is blanked for that pair anyway.

Reproducing what their client produces is the whole reason to trust this write.
"Tidying" either one makes our payload something the server has never been sent.

The `.replace(/\. /, ".")` is un-anchored and **not** global on purpose: it turns
`"4... Nf6"` into `"4...Nf6"`, and the only ellipsis a line can have is its first
pair's.

### 2.4 What the write decides, and what it does not

* **`initialFEN` is ours** (§2.2) — the point of the feature.
* **`lid` is honoured**: the puzzle landed in chapter 1, confirmed through
  `editVariations?bid&lid=1`.
* **`isKey` is honoured**: `keyMoves: [0, 1]`, i.e. every pair trainable.
* **`name` is stored verbatim**, and `orig` is sent equal to it (their client
  uses `orig` to group entries into chapters when importing several at once).
* **`color` is NOT honoured — the target course's colour wins.** Sent
  `color:"white"` into the black test course; the variation came back
  `color:"black"` and `getLesson` reported `studyCol:"black"`. Same behaviour as
  19c §2.4. Deliberately **not** warned about (decided with the user
  2026-08-11): a puzzle that shows the opponent's move before the first move it
  asks for is normal, so the "clash" is usually the intended reading.
* Nothing deduplicates, as everywhere else in Chessable.

### 2.5 One call gives every destination there is

```
GET /api/v1/getImportData?uid=<uid>&bid=<anything>
→ { game: { books: "<JSON STRING>", chrs: "<JSON STRING>" } }

books = [{bid, color, name, thumbnail, isRepertoire, isImportDisabled}, …]
chrs  = [{bid, lid, name}, …]        ← EVERY chapter of every listed course
```

This is what Chessable's own import-destination modal reads, and it is the only
call that answers both halves of "where does this go": `getHomeData` knows the
courses but only their chapter *count*, and `editVariations` knows one chapter at
a time and needs its `lid` to ask for it. Both fields are **JSON strings inside
the JSON body** and need parsing a second time.

`bid` is **ignored** — the same answer with none, with `0`, and with a bought
course's id. It is sent anyway because their client sends it.

`books` is **already the writable set**: the test account's two authored courses,
with the bought ones absent. So section 21's `authorUid` guard is not needed on
top of it — and would be wrong here, since this write has no source course to
own. `isImportDisabled` is honoured as the one filter.

### 2.6 The source variation's title is on the page

`#theOpeningTitle` (`.variation-header__title`) on `/variation/<oid>/` holds the
variation's `name` **character for character** — checked against the stored value
on 70382641. In the trainer the drawer row's `title` attribute already carries it
(section 9 reads it the same way). So naming the puzzle after where it came from
costs no course read at all; a 180 KB `getList` to learn a title the page is
showing would be absurd.

---

## 3. Design

### 3.1 Where it lives

Section **19d**, inside the analysis board (sections 19 and 19b), beside "Add as
line" and "Add as variation". No new host, no new module, no worker involvement —
a `fetch` from the content script, so no driver window, no job cap, no rights
probe. It shares 19c's `courseWritePost` (which keeps the server's own words) and
19c's `noteCreatedVariation` / "Open it" button unchanged.

### 3.2 Every field, and where it comes from

The board already knows all of it:

```
head.fen  = cr.an.startFen                — the position the board opened on
color     = side to move there            (the course's colour wins anyway, §2.4)
ply i     → { san: cr.an.moves[i].san, color, f1, f2,
              mid: floor((i + startsBlack)/2), move: fullmove(f1), key: true }
lid, bid  = the destination picker's choice
name      = "<source variation title> — puzzle from <n>.<san>"
```

Every position is ours: `cr.an.startFen` is what the board opened on and each
later FEN came from `fenAfterUci`, so castling rights, en passant and both
counters are exact. **No SAN is sent that we did not resolve ourselves** — 19c's
rule, for 19c's reason.

There is **no ply cross-check** here, and none is needed: 19c has to line its
moves up against a source variation it is splicing into, whereas a puzzle starts
where the board does. The position *is* the answer to "where does this go", and
it is one we built.

### 3.3 Destination: a picker, defaulting well

Decided with the user 2026-08-11: **any chapter of any course you can import
into**, from §2.5's one cached call — not "this course only", and not the
"only offer it when a chapter is called Puzzles" rule the note floated. Since the
write has no source, cross-course costs nothing and is the case worth having.

A native `<select>` between the lead-in field and the controls, grouped by course
with `<optgroup>`. Native because its options are chapter names from another site
— exactly the text a hand-drawn popover would have to size itself around — and
the browser's own list scrolls and type-searches for free.

Default selection, best answer first:

1. **the chapter last written to**, if it still exists — the user has already
   answered this question and the answer does not change per board. Stored in
   `chrome.storage.local` as `cloPuzzleDest` (`"<bid>:<lid>"`), a standing
   preference, so `local` rather than `session`;
2. a chapter actually **called "Puzzles"** (`/^\s*puzzles?\s*$/i`), preferring
   one in this course. The note's idea, kept as a *default* rather than a gate:
   a guess about where puzzles live is a fine opening bid and a terrible rule
   about whether the feature exists;
3. the **source variation's own chapter** — where 19c would put it;
4. the first chapter there is.

It is read on **open**, not on the first press, because the picker is half of
what the arming press promises and has to be settled before anything is pressed.
That is safe here and would not be for a rights probe: this is one cached GET and
raises no window.

Changing the picker **disarms** a pending confirm, exactly as changing the line
does — it changes what the sentence on screen promised.

### 3.4 Two presses, and one arm each

Same shape as 19c and for the same reason: what this creates is a scheduled card,
and the sentence describing it (name, course, chapter, length) does not fit
anywhere but the status line.

```
press 1 →  Creates "1 — puzzle from 4...Nf6" in Testing course › Puzzles,
           starting from the position on this board — 3 moves. Press again to confirm.
press 2 →  Adding to "Testing course"…
       →   Added as a puzzle in Testing course › Puzzles: "…" (Nf6 Nc3 a6).
```

`cr.an.addPuzzle` is its **own** arm, never shared with `cr.an.addVar`: the two
writes describe different things, and one arm between them would let a press
meant for the sentence on screen fire the other write. Both are dropped by
`resetAnSave`, `anPlay` and `anRemoveFrom`, and both expire after `addVarArmMs`
(30 s — 19c measured 10 s expiring mid-read).

### 3.5 The name

`"<source variation title> — puzzle from <n>.<san>"`, e.g.
*"Sicilian: 2...Nc6 3.d4 — puzzle from 4...Qxd4"*. The title is not decoration: a
puzzle's own moves say nothing about which line produced it, and its start
position is a diagram no list can print. Not editable, for 19c §3.4's reason —
one shared text field whose meaning depends on which button is pressed is the
silent mode this project's docs argue against — and renaming is one click away in
Chessable.

### 3.6 Guards, and what to invalidate afterwards

* **the destination is what the picker says**, and the picker only ever offers
  courses `getImportData` listed as importable (§2.5);
* **arm before fire**, and the plan carries the line's own signature
  (`anLineSig()`), checked at both ends — the board is live behind two awaits;
* **re-read rather than trust our model**: `getList` on the target afterwards,
  and the check covers the **start position** as well as the moves
  (`cacheKey`-compared, so Chessable normalising the counters is not a failure).
  A puzzle stored from the standard position instead of ours would be a
  different card entirely, and a silent one;
* **drop the caches that now lie**: section 5c's reduced-course cache for the
  target, and section 6c's repertoire index if the target *is* the nominated
  repertoire — otherwise the panel spends up to 12 h badging the position the
  user just prepared as unprepared.

### 3.7 What it costs the panel

Measured in `dev/harness.html` at the live 488px panel width (454px of content):

* the select is a 30px row of its own, and takes the `margin-top: auto` that
  kept the field/controls/status cluster pinned to the bottom — the `+` rules in
  the stylesheet hand it back to whichever of the two is shown first;
* the action row **still fits on one line** with five buttons (Add as line, Add
  as variation, Add as puzzle, Flip, Exit);
* with **"Open it"** as well — only after a create — it wraps, *Exit* alone
  dropping to a second line: 32px → 64px. Accepted rather than designed around:
  it is a transient state, the panel has the vertical room, and shortening a
  label to avoid it would cost the vocabulary the three writes share.

---

## 4. What must never happen

* **Never send `oid` to `importGame`** (§2.2) — it overwrites.
* **Never "tidy" `pairPuzzleMoves`** (§2.3). Its two odd results are Chessable's
  own, verified against a natively created variation.
* **Never send a SAN we have not resolved ourselves.** Every one of
  `cr.an.moves` came out of `CloSan.moveToSan` on our own position.
* **Never write without arming**, and never arm on anything but the user's press.
* **Never share an arm with 19c.**
* **Never let the "Puzzles" chapter guess become a gate.** It is a default
  selection; the feature is offered wherever there is a course to write to.

---

## 5. Verified live (2026-08-11, before the build)

On the test account, through the same JWT auth the extension uses:

* **a black-to-move puzzle** — `head.fen` = the position after
  `1.e4 c5 2.Nf3 Nc6 3.d4 cxd4 4.Nxd4`, line `4...Nf6 5.Nc3 a6`, `lid: 1` →
  oid 71375957, `initialFEN` exactly as sent, three key moves, in chapter 1;
* **a white-to-move puzzle** in the same (black) course → oid 71375959, stored
  `color: "black"`, `studyCol: "black"` (§2.4);
* the per-ply payload → `500 "Column 'moves' cannot be null"`, which is what
  found §2.3;
* both deleted with `updateOpening&mode=del`; `getList` back to 80 variations.

### 5b. The built feature, end to end (2026-08-11, v0.97.0)

On the **variation-page host (19b)**, `/variation/70455201/` → step to `3...cxd4`
→ Analyse → play `4.Nxd4 Qb6` on our board → press once → *"Creates "gonfreecss
vs. Quickstarter Guide - Odds & Ends || 5. Nxc6 dxc6 — puzzle from 4.Nxd4" in
Testing course › sicil test, starting from the position on this board — 2 moves.
Press again to confirm."* → press again → *"Added as a puzzle in Testing course ›
sicil test: "…" (Nxd4 Qb6)."*

Read back through `getList`, variation 71383887 was:

* `initialFEN: "r1bqkbnr/pp1ppppp/2n5/8/3pP3/5N2/PPP2PPP/RNBQKB1R w KQkq - 0 4"`
  — the board's own position, castling rights and all, **not** the source's;
* `moves: ["4.Nxd4", "Qb6"]`, both `isKey`, and nothing in front of them;
* in **chapter lid 1**, the chapter the picker was showing;
* `color: "black"`, the target course's (§2.4).

Also verified live in the same run:

* **the picker populated and grouped correctly** — two `<optgroup>`s, six
  chapters, defaulting to the source variation's own chapter (rule 3: no stored
  choice yet and no chapter called "Puzzles");
* **changing the picker disarms**: armed, changed the destination, the sentence
  went back to the idle preview and the button back to "Add as puzzle"; pressing
  again re-armed with the NEW destination named in the sentence;
* **cross-course, and the destination memory** — the second write went from a
  variation in course 453453 into *Testing Repertoire › Main Level* (455941),
  which is the case 19c cannot do at all; closing and reopening the board then
  brought the picker back on `455941:0`, i.e. `cloPuzzleDest` was written and
  read;
* both created variations deleted with `updateOpening&mode=del`, the courses
  confirmed back at 80 and 6.

**Still to verify live:** the **trainer host (19)** end to end — untested for the
same reason as 19c's (reaching the browse state means completing a variation, and
driving MoveTrainer2's quiz cycle from automation fights the per-move clock).
What is untested there is only where the source ids and the title come from
(`trainerCourseIds`, the drawer row's `title`), and neither is load-bearing here:
the destination comes from the picker, and a missing title only shortens the name.
Also unverified: that the created puzzle *presents* as one in a trainer session.

---

---

## 6. On a CLICKABLE LINE (section 19e, v0.98.0)

The same write, offered where Chessable itself offers **"Add to Repertoire"**:
right-click (or long-press) a clickable move printed inside a comment, and take
that whole line as a puzzle starting from the position it branches at. Both
hosts — the trainer's browse state and `/variation/<oid>/`.

### 6.1 Their menu, and why ours is not attached to it

Read out of the bundle and measured live 2026-08-11 on `/variation/70382641/`:

```
createPortal(<div class="subvariation-context-menu__backdrop">      z-index 12000, WHOLE VIEWPORT
             <div class="subvariation-context-menu__anchor"          z-index 12001, position: fixed
                  style="left:…px; top:…px">
               <div class="ui23-contextMenuMini" data-testid="subvariation-context-menu">
                 [ subvariation-add-to-repertoire ]  "Add to Repertoire"
             …, document.body)
```

Their trigger spans carry `class="subvariation-context-menu__trigger"` in BOTH
hosts, and the enabling flag is per move (`enabled: !customStartFen` in the
trainer's renderer) — so **their item is disabled exactly for a variation with a
custom start FEN**, which is the tactics course a puzzle is most likely to come
from.

So ours is raised by **our own gesture watcher**, not by hooking theirs: a
capture-phase `contextmenu` listener plus our own long-press timer for touch.
Theirs is only ever *measured*, to park ours directly underneath. Nothing of ours
enters their portal, and nothing is prevented or stopped — the gesture belongs to
Chessable as much as to us, and both menus may answer it.

**The backdrop is the trap.** It covers the whole viewport and outlives the menu
in some states, so a *second* right-click lands on the backdrop and `closest()`
finds nothing — the gesture looks like a click on empty space. `clickableMoveAt`
therefore falls back to `document.elementsFromPoint`, but *only* when the target
really is inside their portal, so "nothing here" stays cheap everywhere else.
Verified live: a `contextmenu` dispatched at the backdrop, over another move,
found that move and described its line.

### 6.2 Chessable's `data-fen` cannot segment a line — the finding that shaped this

On the variation page every clickable move carries `data-fen` (the position AFTER
it), `data-san`, `data-index` and `data-mid`. It is tempting to read a line
straight off those, and verify each step against the next `data-fen`.

**It does not work, and it fails silently.** Their `data-fen` is chained
*blindly*: a comment writing two branches in one breath —

```
Flat branch test:  4.Qxd4 e5 4.c3 dxc3
```

— gives `4.c3` the position after **e5**, because c2–c3 happens to be legal
there. Ground-truthed on 70382641, where span `5.0.2` (`4.c3`) carries
`r1bqkbnr/pp1p1ppp/2n5/4p3/3QP3/2P2N2/PP3PPP/RNB1KB1R b KQkq - 0 5`. A reader
trusting that would make a puzzle out of a position the author never wrote — the
exact failure v0.34.1 removed a legality-only fallback for.

So the lines are read the way **section 18** reads them, through the printed move
NUMBERS: `subMoveGroups` → `resolveLine` → `walkLine` → `branchLines`. Three
small changes made those host-agnostic rather than trainer-only:

* `subMoveGroups(els, mainEls)` takes the mainline elements to count the attach
  ply against, and reads the id from `el.id || el.dataset.index`;
* the shallowest-first resolve loop became `resolveGroups(groups, fens)`, shared
  with `collectLines`;
* the variation page supplies its own `fens` array (§6.3).

Verified live: clicking `4.c3` in that flat branch yields a **one-move** line
starting from the position after `3...cxd4` — not a continuation of the `Qxd4 e5`
branch. `branchLines` gives each branch its own `moveIdx` (the indices of its
moves within the group), which is how the clicked span picks the branch it was
actually printed in.

### 6.3 Where each host's positions come from

* **Trainer** — the lesson plan, exactly as section 18: `readLessonLine()` →
  `mainlineFens(plan)`.
* **Variation page** — `fens[i+1]` is the mainline move div's own `data-fen`,
  which for the MAINLINE is exact (the blind-chaining problem is a property of
  branches inside a comment; the mainline has none). `fens[0]` is the variation's
  `initialFEN`, which the page shows nowhere, so it comes from the section 5c
  course cache (`fetchCourse(bid, cr, true)`, memoised per oid). When that read
  fails we fall back to the standard position and log it — harmless rather than
  dangerous, because `walkLine` checks the printed NUMBER of every move as well
  as its legality, so a wrong start does not fit a line, it merely fails to
  resolve one.

### 6.4 No quizzability filter

Section 18 drops a line with no move of the user's own, and one whose user-colour
move is annotated "?" — both right for a quiz that runs by itself. Here the user
*pointed at this line*, so `puzzleLinesOf` keeps them: only `truncated` (a move
we could not read at all) is dropped, and branches still split.

### 6.5 One press, in a popup

The menu item opens a popup carrying the line, the name that would be created,
the destination picker (the same one the analysis panel has, sharing `pz.sel` —
"where do my puzzles go" is one question with one answer) and a status line.

**One press writes**, unlike 19d's two. The popup *is* the description — name,
destination and line are all on screen before anything is pressed — which is
v0.43.0's argument for "Add as line" being a single press. An arming press would
only repeat what is already visible. "Open it" appears once there is an oid, in a
new tab, for §3.5b's reasons.

The popup swallows `keydown`/`keypress`/`keyup` in **bubble** phase, like the
quick-edit popup: MoveTrainer2 binds single-key shortcuts on `document` without
skipping a focused control, so "n" typed at its `<select>` would send the trainer
to the next variation. Our own overlays' capture-phase swallow does not cover
this — that one is gated on a run being active, and this popup can be open with
nothing running.

Both surfaces close on an outside pointerdown **by containment, never with
stopPropagation** (their backdrop is entitled to the same event), on Escape, on
scroll/resize — dismissed rather than chased, like every other popover here — and
on a variation change, through `closeClickableMenus()` in both ticks.

### 6.6 Verified live (2026-08-11, v0.98.0)

On `/variation/70382641/`, course 453453:

* **the menu lands under theirs** — ours measured at (874, 301), theirs at
  (873.5, 263) 160×34, i.e. left-aligned and 4px below its bottom edge;
* **a straightforward line**: right-click `3.c3!` → popup reads *"c3! d5"*,
  *"Creates "1 — puzzle from 3.c3" — 2 moves from this position."* → one press →
  variation 71385948 with `initialFEN` = the position after `2...Nc6`, i.e. where
  the line branches (it is the alternative to the mainline's `3.d4`), moves
  `["3.c3","d5"]`;
* **the flat branch** (§6.2): right-click `4.c3` → a one-move line → variation
  71385952 with `initialFEN` = the position after `3...cxd4`. Chessable's own
  `data-fen` for that span says the position after `4...e5`;
* **the backdrop fallback** (§6.1);
* both deleted afterwards, the course confirmed back at 80.

**NOT verified: the gesture from a trusted right-click.** One real right-click
did raise Chessable's menu at the start of the session, but after that the
automation stopped delivering pointer events to the page entirely (zero
`pointerdown`, zero `contextmenu` at a listener installed to count them — a stuck
OS-level menu, not a page state). Everything above was driven with a dispatched
`contextmenu`, which reaches the identical listener — ours is bound to the same
event Chessable's own menu is bound to, and both answered the dispatched one
together. **The touch long-press path is untested altogether**, as is the whole
of the trainer host (reaching the browse state means completing a variation).

## 7. Not built here

* Editing or deleting the created puzzle from our UI (19c §6's non-goal, same
  reasoning).
* A "make this a tactic" flag. `isTactic` came back `false` and there is an
  `updateOpening` mode family that might set it; nothing depends on it, and a
  FromPosition variation is what the user described.
* Taking a clickable line from the *middle* — the clicked move picks the branch,
  and the puzzle is the whole of it. Starting at the clicked move instead would
  be a second meaning for the same gesture.

## 8. Open questions

* Whether `color` is honoured when the target course is `color: "both"` (both
  test courses are black).
* Whether `name` has a length limit or is sanitised.
* What `nag` codes mean beyond 19c's `1` → `!`. Our analysed lines carry no
  annotations.
* Whether an entry may carry `comment`/`commentB` usefully — the fields exist per
  ply and are folded into `commentW`/`commentBW`; nothing here sends one yet, and
  a lead-in on the puzzle's first move is the obvious next thing to want.
