# Arrows in quick-edit — ground truth and design

Ground-truthed live 2026-08-01 on variation 70382641 (course 453453), a
full add → save → clear → restore round trip through Chessable's own edit
page. Every claim below was observed, not inferred.

## 1. How Chessable stores arrows

Arrows and circles are a **per-move field of the variation**, sitting right
beside the comment — not part of the comment text, and not a PGN `[%cal …]`
annotation.

On the edit page (`/mt1/explore/edit/<oid>/`) page state carries:

```js
allTheMoves['Qb6_b_4'] = {
  comment: '(5. Nb3 g6 6. Be3 Qb4+)\n(5. c3! Nf6 6. Nxc6 bxc6)',
  drawing: [
    { object: 'arrow',  start: 'd4', end: 'b3', color: 'b', move: '4b', index: 'arrow_d4b3' },
    { object: 'circle', start: 'b4',            color: 'y', move: '4b', index: 'circle_b4'  },
    …
  ],
  comment_before_white: '', comment_before_black: '',
  annotation_white: '', annotation_black: '0',
  fen: 'r1b1kbnr/pp1ppppp/1qn5/8/3NP3/8/PPP2PPP/RNBQKB1R w KQkq - 1 5',
  is_key: 0,
}
```

* `object` — `'arrow'` or `'circle'`.
* `start` / `end` — algebraic squares; `end` is absent on a circle.
* `color` — `g` green, `r` red, `b` blue, `y` yellow
  (`mapColorCodeToHexValue` = `#77b55a` / `#e02828` / `#1A63C9` / `#ff0`).
* `move` — `<fullmove digit><colour>`, e.g. `"4b"`. Derived by Chessable from
  the board FEN at draw time; we never compute it.
* `index` — `'arrow_' + start + end` or `'circle_' + start`. **This is the
  identity of a shape**: redrawing the same squares in a different colour
  REPLACES it, redrawing it in the same colour is a no-op (verified — it is
  not a toggle).

The live array for the selected move is the module-level `turnArray`;
`pgnMoveClicked` points it at `allTheMoves[move].drawing`, and
`saveLastMovesDetails()` writes it back (`… .drawing = turnArray`, or `null`
when empty). Drawings on the *starting position* go to `openingTurnArray`.

**The save needs no new mechanism.** `addVariation()` does
`$('#commentsToSubmit').val(JSON.stringify(allTheMoves))` — the same POST the
quick-edit comment driver already performs carries every move's `drawing`
along with every comment. That is also why the existing comment driver has
never damaged arrows: it round-trips them untouched.

Subvariation drawings (`saveSubvarDrawing` / `serializeSubvariationDrawings` /
`subvarFocused`) are `undefined` on this edit page — shapes attach to
MAINLINE moves only, which is exactly the pencil's scope.

## 2. Drawing them from a driver (the write path)

`init()` in the edit iframe installs jQuery handlers on `#board`, delegated to
`.square-55d63, .piece-417db`, guarded by `can_add_arrows` (true for a course
you can edit):

| gesture | `e.button` | effect |
| --- | --- | --- |
| right press → drag → release | 2 | add/replace one shape |
| middle click | 1 | **clear every shape on this move** (`turnArray = []`) |
| left click on a square (no piece being dragged) | 0 | **undo the last shape** |

Colour comes from the modifier on the SAME events:
`shift → g`, `ctrl → r`, `alt → y`, none → `b`.

All of this is drivable with ordinary synthetic `MouseEvent`s dispatched on
the SQUARE element (`#<sq>-<uuid>`, also `[data-square]`) — verified:
`mousedown` on the source, `mousemove` on the target, `mouseup` on the target,
all with `button: 2, buttons: 2` and the colour modifier. Press and release on
the SAME square makes a circle. Dispatching on the square works whether or not
a piece sits on it.

So the whole edit is: **middle-click once to clear, then draw the wanted set,
then submit** — the "replace it as a whole" model the comment Edit tab already
uses. Verified end to end: the eight original shapes were cleared and redrawn
byte-identically, saved, and re-read from a fresh page load.

## 3. Reading them back (the load path)

Two independent sources, both usable from an ISOLATED-world content script:

* **Edit page DOM** — the SVG.js layer inside `#board svg` renders one element
  per shape with `class="arrow_d4b3"` / `class="circle_b4"` and
  `stroke="#1a63c9"`. Class → squares, stroke hex → colour code. This is what
  the existing `mode: 'load'` job should report alongside `#moveComment`.
* **Host page DOM** — `/variation/` and the trainer both render `svg#drawings`
  (a different, React/chessground-ish renderer) whose children carry
  `data-start` / `data-end` / `data-color` as **0-based square indices from
  a8**: `idx = (8 − rank) × 8 + (file − 1)`, i.e. a8 = 0 … h1 = 63. Our own
  overlay board uses `rank × 8 + file` (a1 = 0), so the conversion is
  `ours = (7 − (theirs >> 3)) * 8 + (theirs & 7)`.

  Unlike a comment, this is not a lossy rendering — it is the stored data —
  but it describes the move the BOARD is showing, not the move the pencil is
  hovering. Good enough for an instant preview; the authoritative read stays
  the driver visit.

`svg#drawings` serves the trainer too: a completed variation's browse board
paints the same `data-start`/`data-end`/`data-color` children (verified live on
a /learn/ overstudy of 70382641, 2026-08-01).

## 4. Why we cannot use Chessable's own drawing UI on the host pages

The drawing code (SVG.js + the jQuery handlers above) exists ONLY in the mt1
explore/edit page, and only when the server sets `can_add_arrows`. The
`/variation/` page and the trainer board are a different React component that
only PAINTS `svg#drawings` from data — there is no drawing code there to
enable, no flag to flip. Making our own arrows is the only option, and we
already have them: section 18/19's overlay board draws arrows and circles by
right-drag today (`cr.shapes`, `shapeArrow`, `shapeCircle`, `startShape` /
`moveShape` / `endShape`) — currently single-colour scratch work, cleared on
any ordinary press and never persisted.

## 5. Design (implemented, v0.52.0)

**One read, one job, one POST.** The comment and the shapes live in the same
`allTheMoves` blob and are written by the same submit.

* The pencil's popup gains an **Arrows** tab beside Append / Edit / Alt move.
* `mode: 'load'` — the visit the Edit tab already makes — now reports `shapes`
  alongside `text`, so ONE driver window answers both tabs and the edit-rights
  question. Cached per `"<oid>#<ply>"` in `qe.reads` as `{text, shapes}` and
  dropped on any save to that ply.
* Opening the tab draws the position AFTER the move on a small board in the
  popup, pre-loaded with the stored shapes. Position source: the lesson plan
  (`reviewPlan.fens[plyIndex + 1]` — exact, free) where it is available,
  otherwise `pressAndReadFen` presses the move element (navigating the host
  board, the click the user would make anyway) and reads the FEN back, verified
  by side to move.
* Input: drag between two squares for an arrow, press one square for a circle,
  in Chessable's own four colours (swatch row; the same shape again removes it,
  in a different colour recolours it). Deliberately NOT right-button-only, as
  the overlay board is — a finger has no right button, and nothing else a press
  could mean exists on this board.
* `mode: 'shapes'` writes: select the move → prime → middle-click clear → one
  right-drag per shape → verify → submit. `baseShapes` guards staleness the way
  `baseText` does. An empty set deletes every arrow on the move and arms first.

The board itself is section 11c of `content/lichessable.js`, hoisted out of the
continuation overlay so the two boards share one implementation of the
geometry, the cloned piece SVGs and the shape drawing.

### The one workaround

`quickEditPrimeShapes` draws and discards one throwaway arrow before the clear.
Chessable's mousedown draws a preview CIRCLE on the source square, and the
branch taken on the very first arrow of a document's life is
`null == n ? l.add(line) : (l.clear(), l.add(line))` — so that preview survives
and the commit moves it into the drawing layer as a `circle_<from>` present in
the SVG but NOT in `turnArray`. Harmless to the save, fatal to a verification
that reads the DOM. Priming leaves the layer in the state every later shape
assumes; the clear that follows removes the throwaway and its stray circle.

### One fix it forced elsewhere

The popup opens on a non-reading tab, which is what STARTS the per-course
rights probe; switching straight to a reading tab fired a read beside it, the
worker refused it (one job at a time), and the refusal carried no `plyIndex`,
so it matched no key and the tab sat on "Reading…" for ever. Now the worker
echoes `plyIndex` on a refusal, and a read that finds a probe in flight parks
in state `'waiting'` until `onResult` (or the probe watchdog) releases it. This
bug predates the arrows tab — the Edit tab could hit it too.

## 6. Verified

Round-tripped live on variation 70382641, both hosts, 2026-08-01:

* variation page — read 8 stored shapes; added a green `a1a4`; saved; re-read
  from a fresh edit page (9, correct colour, comment untouched); removed it
  again; back to exactly the original 8.
* variation page, a move with NO arrows — added a red circle and a blue arrow;
  saved (`move: "2w"` computed by Chessable); then Clear all + the arming press
  deleted both; the whole variation back to its original state, every comment
  intact.
* trainer browse state — the board mounted from the lesson plan with no press
  at all, the read landed, all 8 shapes drawn.
* the write verification caught a real mismatch before the priming fix was in,
  and refused to save: "the edit board did not take the arrows (10 of 9 drawn)".

Also settled here: a completed variation's trainer browse board **does** paint
`svg#drawings` (checked live — the same `data-start`/`data-end`/`data-color`
children as the variation page), which section 3 had left open.

## 7. Showing the save without a reload (v0.53.x → v0.62.1)

**Moved to `DESIGN-quick-edit.md` §6.**

It was never arrows-specific — the same round trip refreshes a comment save — and
the version that lived here described v0.53 and had gone stale in one load-bearing
respect: it rejected the opposite pager button outright as a way home, which
v0.60.1 overruled (on the sibling we have just stepped to, our own variation is on
the other side of that button, so it is always enabled). It also predates the whole
`watchVariationFetch` / `siblingVariation` / `watchLateDeparture` rewrite that
stopped saves occasionally stranding the user on a stranger's variation.

Do not re-document it here.

## 8. Still open

* `openingTurnArray` — shapes on the variation's STARTING position. The pencil
  never targets ply −1, so out of scope; the field is left alone.
* Subvariation drawings (`saveSubvarDrawing` / `serializeSubvariationDrawings`)
  are `undefined` on this edit page, so shapes attach to MAINLINE moves only —
  which is exactly the pencil's scope.
* The host pages' own `svg#drawings` is exact stored data, not a rendering, so
  it could drive an instant preview before the read lands. Not done: it
  describes the move the BOARD is showing, not the one the pencil is on.
