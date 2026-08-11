# DESIGN — Quick-edit (section 12)

Hovering a mainline move shows a pencil whose popup can, for a course the user can
edit: **append** a PGN comment to the variation, **edit** that comment as a whole,
edit the move's **arrows and circles**, or add **alternative moves** the trainer
should also accept.

Arrows (12b) have their own document: `DESIGN-quick-edit-arrows.md` — the storage
shape, the write gestures and the read path. Everything else is here, including
§6, refreshing the host after a save (12c), which applies to every mode and was
moved here from that document when it went stale.

---

## 1. There is no JSON API — we drive Chessable's own edit page

Several of the edit form's POST fields are session/CSRF-bound and opaque, so the
only safe path is to open `/explore/edit/<oid>/` and drive it.

`background.js` opens it in a **small focused popup window**
(`chrome.windows.create focused:true`, ~260×180) placed right beside the
quick-edit popup — the requester computes screen bounds in `driverWindowBounds()`
(a thin wrapper over the hoisted `popupDriverBounds(anchorEl)`, shared with the
alt-check popup) and sends them as `msg.win`; bottom-right parking when absent.

**Always that popup, never a background tab.** v0.28.0 removed the tab fallback
(`openDriverWindow` just retries once without bounds): a hidden tab clamps every
timer — ours AND Chessable's boot, animations and dialogs — to ~1 s, which
stretched a save from ~4–5 s to ~13–20 s, i.e. right into the worker's job
timeout. `focused: false` was tried and saved NOTHING: the window opens occluded
behind a maximized browser and is throttled the same.

#### …unless the browser has no windows (v0.96.0)

Android has no window concept, so every Android Chromium fork has to fake
`chrome.windows` — and quick-edit is the extension's ONLY user of that API.
Ground-truthed 2026-08-10 on **Lemur Browser** (Android tablet), against a build
where the Lichess panel populates and the overstudy button opens a tab: the
service worker runs, messaging works in both directions, and `chrome.tabs` is
fine. `chrome.windows.create` alone throws. **Kiwi Browser maps it onto a tab**,
which is why the same extension works on the user's phone.

`openDriverSurface(url, req)` is the new entry point and the order is
window → window-without-bounds → tab:

| step | when |
| --- | --- |
| `openDriverWindow(url, req)` | `canOpenDriverWindow()`, i.e. `chrome.windows.create` is a function |
| `openDriverWindow(url, null)` | the original v0.28.0 retry — bad screen bounds are the one thing a caller can get wrong |
| `openDriverTab(url)` | anything else |

`openDriverTab` is `chrome.tabs.create({ url, active: true })`. **`active: true` is
the whole point** — the rule above is about HIDDEN pages, and a foreground tab is
not one, so the driver's clocks run at full speed. `active: false` would
reintroduce the exact ~1 s clamp the popup window exists to escape. Finish is
unchanged: `finalizeQuickEditJob` removes the tab and the browser returns to the
tab underneath.

`openDriverWindow` also races `create` against `DRIVER_WINDOW_TIMEOUT_MS` (5 s) and
falls through on no answer, closing the window if it turns up late. This covers the
failure a try/catch cannot: `startQuickEditJob` arms the job timeout only AFTER the
await returns, so a stub that accepts the call and drops it hangs the job before
anything exists to time it out — no window, no job record, no error, and a popup
stuck for the rest of the session. Lemur throws rather than hanging, so this arm is
untested against a real browser.

**The cost, and it cannot be avoided on a single-window browser:** the requester tab
is backgrounded while the driver works, and Android evicts background renderers
aggressively. If Chessable's tab is killed mid-job, the result lands nowhere and the
popup waiting for it is gone with the page. Nothing in the design can fix that —
opening a *visible* driver necessarily hides the requester when there is only one
slot to be visible in.

The popup's TOP document covers itself with an opaque "Saving…" shield
(`maybeMountQuickEditShield`, worker msg `clo-quick-edit-is-driver`) that also
swallows all keystrokes in capture phase — the window has real focus, so typing
would otherwise reach the edit page's own shortcuts.

### Message hub

In `background.js`: `clo-quick-edit-run` / `-claim` / `-submitting` / `-landing` /
`-result`. One job at a time, job in `chrome.storage.session`, 25 s hard timeout,
popup window closed on finish (removing its only tab closes the window).

`getQuickEditJob` reaps a job older than twice the cap and re-arms the timeout when
it has none: `quickEditTimer` does not survive a worker idle-restart, and an
orphaned job refused every later quick-edit with "another quick-edit is in
progress" for the whole browser session.

The worker never re-hands a job in phase `'submitted'`: a failed POST reloads the
edit page, and a second drive would append the same comment TWICE.

`quickEditJobCap` grows with an alt list (+8 s per extra move): force-failing a job
whose driver is still working, and closing its window, is the one thing that cap
must never do.

## 2. Two hosts, one adapter

`HOSTS` in `initQuickEditUi`. They differ in **only four things** — move lookup,
ply mapping, oid source and rights signal. The popup, the save round-trip and the
entire edit-page driver are shared.

| | review browse state | `/variation/<oid>/` |
|---|---|---|
| moves | `commentMove` spans | `#theOpeningMoves > span > .whiteMove\|.blackMove` |
| ply | index in that list | the move div's **id IS** the 0-based ply index |
| colour | parsed from the move number | the div's class |
| oid | drawer row / header link | the URL |
| rights | probed lazily | presence of the "Edit Variation" link |
| refresh | none (`refresh` is null) | `refreshVariationPage` (§6) |

Verified live that both hosts' ply indices map **1:1** onto the edit page's
`#interactivePGN` order.

**Both hosts draw a piece move's letter as an SVG FIGURINE child** (span
`data-piece="knight"` …), so `textContent` of "♘c6" is just "c6". SAN must come
from `quickEditSanFromEl` (letter re-attached after the number prefix is stripped),
**never** from bare `textContent`.

`readQuickEditBid` / `readQuickEditOid` parse trainer URLs through the ONE
module-level `TRAINER_URL_RE` — `/(practice|learn)/<bid>[/<oid>][/<lid>]`,
everything after the course id OPTIONAL — so rights probing and the alt check work
in learn sessions and overstudy tabs alike. They used to carry a private, stricter
pair of regexes whose `/learn/` form demanded a variation id the live session URL
does not always have: the bid read as null, `probeRights` refused to start, and both
popups hung on "Checking edit rights…" (v0.28.2). **Never re-duplicate that regex.**

## 3. The driver

Runs in the popup tab's mt1 edit iframe (`IS_EDIT_PAGE`).

**Match the move by its 0-based ply INDEX, never by absolute number.** The edit page
renumbers every variation from move 1 — a tactics puzzle shown as "25. Qc2!" in
review is `Qc2_w_1` there — while review keeps the source game's numbering. The
review `commentMove` list and `#interactivePGN` are the same mainline in the same
order, so index N ↔ index N. The driver still verifies SAN + colour against the
element id (`{san}_{w|b}_{n}`; ids KEEP `+`/`#` but STRIP eval glyphs, hence
`quickEditSan`). Colour comes from `turnFromLine`.

### Both modes gate on the board FIRST

`quickEditWaitBoardReady` (`#inputFEN` parseable and unchanged for `boardStableMs`),
then `quickEditSelectMove` VERIFIES the move click landed (side to move = opponent
of the move's colour).

The comment flow used to skip both and submit ~150 ms after `#interactivePGN`
merely existed — that was the "popup spins until timeout" bug (v0.28.0). On a
half-booted page `addVariation()` throws inside Chessable's own confirm handler and
POSTs NOTHING, so there is no navigation, no dialog and nothing for the driver to
report; the same unlanded click also let a comment be appended to whatever move
happened to be selected.

### The comment write

Append to `#moveComment` — **React-controlled**: native value setter + dispatched
`input` event, NOT a bare `.value =`. Then set `#specificAltMove` ("For This
Variation Only"), click `#submitButton`, and **also click the SweetAlert2 confirm**
(`.swal2-confirm`) — `addVariation()` only serialises and POSTs the whole variation
after that dialog is confirmed.

After the confirm click the driver keeps a `postSubmitTimeoutMs` watch (a successful
POST navigates it away mid-await, so that code only ever runs on the stall path) and
reports the stall — or a late dialog's text — itself.

Success is detected when the POST lands the iframe on `/mt1/explore/?edit=<oid>`
(query form; a failed reload returns to the path form).

Append convention is `CONFIG.quickEdit.commentJoin`, and the exact stored wrapper is
`( { … } )` — the one thing to confirm in a manual save test.

### All waits are `quickEditWaitUntil`

MutationObserver-driven with the interval as backstop. A hidden tab clamps
`setInterval`/`setTimeout` to ~1 s, so a chain of polled waits cost 15–20 s there
(vs 4–5 s focused) until the waits were made observer-based. **Never add a plain
fixed delay to this driver.**

Dialog waits go through `quickEditOpenConfirm`, scoped to
`.swal2-container.swal2-shown`, because several SweetAlerts open and close in one
alt job — a stale hidden confirm button must never be clicked.

## 4. Edit mode is TWO visits, and that is not waiting to be optimised away

(v0.39.0.)

**The comment as RENDERED in the review column is not the text Chessable stores** —
clickable lines are figurine spans, prose is markup — so filling the editor from the
DOM and saving it back would rewrite the stored comment from a RECONSTRUCTION,
destroying exactly the clickable lines section 18 quizzes. **Never prefill that box
from the DOM or from the lesson plan's parsed `comment` JSON.**

So opening the Edit tab runs a READ job (`mode:'load'`): the same driver window, the
same `quickEditSelectMove` gate, but it reports `#moveComment`'s raw value and
submits NOTHING.

The save (`mode:'edit'`) carries the new text AND `baseText` — the text the editor
was filled from — and `driveQuickEditComment` **refuses to write** when the stored
comment no longer matches it (compared through `quickEditNormalizeText`: line
endings and trailing blanks survive neither React nor a form POST intact). Read and
write are separate visits, and silently clobbering a comment that moved in between
is the one failure of this feature that loses the user's work.

Reads are cached in `qe.comments` per `"<oid>#<plyIndex>"` and DROPPED on any
successful save to that ply — never updated to the text we sent, since Chessable is
what decides what got stored. The result relay carries `plyIndex` for exactly this
keying.

A `'load'` also answers the RIGHTS question on its way past (no edit form ⇒
`canEdit:false`, reported as a successful read rather than as an error, so the shared
cache still learns it), which is why the Edit tab never starts a probe of its own —
the worker runs ONE job at a time, so a probe fired beside a read would be refused
and read as a rights failure. `applyRightsToPopup` therefore hands over to
`syncEditUi` in edit mode, and suppresses its own probe on the other tabs while a
read is in flight.

An empty edit DELETES the comment, so Save arms first ("Delete comment", auto-play's
Clear pattern).

Only "Comments After" is reachable: a `comment_before` block is a different field on
the edit form and is NOT editable this way.

**A read QUEUES BEHIND a rights probe rather than racing it** (`state 'waiting'`):
the popup opens on a non-reading tab, which is what STARTS the probe, and the worker
runs one job at a time — so a read fired beside it was refused, and the refusal
carried no `plyIndex`, so it matched no key and the tab sat on "Reading…" for ever.
Both halves fixed (the worker now echoes `plyIndex` on a refusal); `onResult`'s probe
branch and the probe watchdog both release a waiting read.

**Every failure relay must carry `plyIndex`, not just that one** (v0.96.0). The same
omission was still sitting on the could-not-open-a-driver branch, and it presented
identically: on Lemur, Append reported "could not open the Chessable edit window"
correctly (the save handler does not key on the ply) while Edit and Arrows hung on
"Reading the current comment from Chessable…" over the very same failure. Whenever a
new refusal path is added to `startQuickEditJob`, it is `plyIndex` that makes it
audible to the reading tabs.

## 5. Alternative moves

`driveQuickEditAltMoves`, ground-truthed live 2026-07-22.

Chessable stores alternatives per move as `alt_white` / `alt_black` SAN arrays (plus
parallel `specific_alt_*` booleans) in its page-state `allTheMoves`, keyed by the
SAME `{san}_{w|b}_{n}` ids as `#interactivePGN` — but the driver never touches page
state; it drives the UI:

1. click the target move;
2. click `Add New Alternative Move` (`SELECTORS.editAltAddLink`);
3. confirm the SweetAlert ("The next move you make on the board will be added as an
   alternative") — the edit board then steps BACK one move (its `#inputFEN` changes;
   that FEN is what the typed SAN is resolved against with CloSan,
   `quickEditResolveSan`);
4. set `#specificAltMove` **before** the move (`pushAltMove` reads it at store time);
5. PLAY the alternative with the ordinary `pressSquare` click recipe — the edit board
   has the standard `square-55d63` / `e4-<uuid>` markup, so `SELECTORS.boardSquare`
   matches.

Chessable validates everything itself — board legality, duplicate, same-as-mainline —
and lists the move in `#altMoves` (`quickEditAltListed` = the isolated-world success
check; on timeout the open dialog's text is relayed as the error).

**An alt already listed on arrival short-circuits to success** (it was saved before)
— but that list RENDERS A BEAT AFTER the board reaches the move, so it is waited for
once per job (`quickEditAwaitAltList`, capped at `altListRenderMs`) before anything
is read from it. An empty `#altMoves` means both "no alternatives" and "not rendered
yet" and nothing distinguishes them, so a move with none pays the cap; reading it too
early offers the move to Chessable again and gets "It's there already", which for a
LIST fails every move in it (observed live 2026-08-03).

### Several alternatives at once (v0.62.0)

The wire field is `altSans`, a LIST ("Nc6, d5, a6" in the popup, split on
whitespace/commas; a bare move-number token is dropped so a pasted "3. Nc6" works),
and the driver adds them in ONE visit under ONE submit — the form POSTs the whole
variation, so the second alternative costs another arm-and-play round and nothing
more.

`driveQuickEditAltMoves` owns the board-ready gate, the ONE move selection and the
loop; `addOneQuickEditAltMove` is the unchanged per-move flow.

**The one new fact:** Chessable's flow leaves the board on the ALTERNATIVE'S OWN
POSITION, so every round after the first re-clicks the mainline move and requires the
BYTE-IDENTICAL `fenBefore` back — side to move cannot tell the two apart, both being
the opponent's.

Nothing is written until the submit, so a refusal halfway through leaves the
variation untouched, and the error says so ("… — none of the alternatives were
saved").

`altSan` (singular) survives ONLY as `quickEditAltSans`' fallback, for a job already
in `storage.session` when the extension reloads; the alt check (section 15) sends
`altSans: [san]` like everything else.

**Promotion alternatives are REFUSED** in popup and driver (edit-board picker
unverified).

The alt tab is DISABLED on opponent moves (always a misclick — the trainer plays
those itself): the user's colour is the board's bottom side (`host.userColor()`, via
`boardBottomColor`; Chessable orients both hosts' boards to the course colour),
permissive while the board is mid-render with a re-check in `doSave`.

While the popup's alt tab is open, clicking a Lichess panel move row prefills the SAN
input — both hosts are review documents, where rows carry no `dataset.uci`, so
nothing competes.

## 6. Refreshing the host after a save (12c, v0.53.x → v0.62.1)

*Moved here from `DESIGN-quick-edit-arrows.md` §7, which described the v0.53
version and had gone stale in one load-bearing respect (see the pager note below).*

Our write goes to the SERVER, not to the copy Chessable is rendering from, so both
hosts keep showing the old comment and the old arrows until they re-read.

### The trainer cannot, and `HOSTS.review.refresh` is null

It re-reads a variation only by fetching `/api/v1/getLesson`, which happens when you
SWITCH variation — and switching back re-QUIZZES it, i.e. costs the browse state the
pencil lives in (verified: `commentMove` count drops to 0 on return). The
alternatives are worse: the comment column and `svg#drawings` render from the lesson
plan in page state, so updating them in place would need a MAIN-world write
(`pagestate.js` is read-only by design) or our nodes inside Chessable's DOM (which
React would wipe).

So the status line says it instead: *"Saved. Chessable shows it next time you open
this variation."*

### The variation page CAN re-read in place

It fetches its whole chapter ONCE at load
(`getOpeningsForBookLevelInCorrectOrder`) and never again while you navigate moves —
only `getCommentsByFEN` per position. But its own variation PAGER
(`#variation-btn-next-variation` / `-prev-`, stable ids, so no language-dependent
text matching) is a real router navigation that refetches `getGame` + the chapter.
Step to a sibling, then come home.

Ground-truthed 2026-08-01 that `performance.getEntriesByType('navigation').length`
stays at **1** throughout: no document reload, so nothing of ours is torn down
either. A chapter of one has both buttons disabled — `refreshVariationPage` returns
false and the popup says "reload the page to see it" rather than implying the page
is current.

### Coming back is the whole risk of this feature

v0.60.1 rewrote it after saves were reported to sometimes leave the user on a
completely different variation. Once the pager is clicked we are COMMITTED to a
navigation, and the original code returned false on every unhappy path — leaving the
user standing on the SIBLING while the popup said "Saved — reload the page to see
it", i.e. reading a stranger's variation and being told it was theirs.

* `refreshVariationPage` is a try/**finally**, and the finally is the one
  unconditional step: if the page is on a sibling variation and the routes home have
  not already been walked, it walks them. Every timeout and every throw passes
  through it. **False now means "not refreshed", never "not where you were".**
* **The URL flip is NOT the landing** (v0.62.1, and the last way this stranded
  people). The router calls `pushState` SYNCHRONOUSLY on the click and only then
  fetches what it navigated for, so `siblingVariation(oid)` goes true within a
  millisecond or two — and the old code went straight home on it. Measured live
  2026-08-03: pushState at t+0, our `history.back()` at t+158 ms, the sibling's
  `/api/v1/getGame` finishing at t+792 ms — i.e. we reliably stepped back off a route
  that had not resolved yet, leaving it to commit AFTERWARDS with our one repair
  already spent. It is also what the round trip EXISTS for: that fetch is the chapter
  re-read.
  So `watchVariationFetch()` — a PerformanceObserver on `'resource'`, armed BEFORE
  the click, because `window.fetch` belongs to the page world and an isolated content
  script cannot patch it, while the performance timeline is shared and an entry means
  the response is COMPLETE — gates the step back on `refreshGameApi` landing, capped
  at `refreshSettleMs` for a sibling served from cache, plus `refreshLandMs` for the
  router to commit. Same wait on the late-departure path, which owns the observer
  once it takes over the guard.
  After the fix: flip at t+0, sibling `getGame` at t+792 ms, home at t+2.1 s, our own
  `getGame` at t+2.6 s.
* **The departure test is `siblingVariation(oid)`** — a DIFFERENT VARIATION page —
  never `!onVariation(oid)`. A pager click can land nowhere else, so any other route
  is one the USER took while we waited (a link, their own Back), and firing
  `history.back()` on top of that dragged them out of wherever they had just gone.
  That was the second way to end up somewhere else.
* **`returnToVariation` has THREE routes, cheapest first.**
  1. `history.back()` — but ONLY when the click really pushed, tested with
     `history.length` before/after: on a router that REPLACED instead, `back()` takes
     the user a step further away rather than home. (`history.length` saturates at 50
     in Chrome, where a push stops growing it; that reads as "replaced" and simply
     takes route 2, which works either way.)
  2. **The OPPOSITE pager button.** *This document's §7 used to reject it outright
     because it is disabled at the ends of a chapter — true in general, and
     irrelevant here: on the sibling we just stepped to, our own variation is on the
     other side of that button, so it is always enabled.*
  3. `location.assign` back to the URL we started on. It costs a document load, and
     so the popup — but the user lands on their own variation with the save showing,
     which beats every alternative left.
* **A click that misses `refreshLeaveMs` has NOT been cancelled** — a slow chapter
  fetch just lands later, by which time the function, its finally and the popup's
  status line have all settled. That is the plainest way this used to strand the
  user, and the finally cannot see it. So `watchLateDeparture` outlives the refresh
  (`refreshLateMs`, 10 s) and is deliberately NOT awaited: the popup has already been
  told, truthfully, that the refresh did not happen, and "do not leave them on
  someone else's variation" has no business holding that status line open.
* `qe.refreshBusy` makes it non-reentrant: two round trips would each step the pager
  and each undo one entry, which does not compose. The late watch KEEPS that flag
  (the refresh's own finally skips clearing it when `watching`) and clears it when it
  settles.
* `refreshHomeMs` (5 s) is per ROUTE, deliberately short — a URL flip, not a render.
  Three `refreshBackMs`-length waits in a row would leave the user on a stranger's
  variation for the best part of a minute.

### Restoring the shown move

Both halves are load-bearing. Being back on the URL is NOT being back on the page:
React keeps the sibling's move list mounted for ~1 s while the refetch lands and
REUSES the very nodes (verified — element identity is no signal at all; measured
`same0=true` across an 18-move variation and an 8-move one), so a press issued then
lands on the outgoing render and the page's own navigation to move 1 silently undoes
it, while our verify saw it succeed.

1. Wait for a state the sibling cannot be — our path, plus our own TITLE and MOVE
   LIST back on screen (`variationPageSig`), plus one piece of positive evidence
   that this is the fresh render rather than the outgoing one: the sibling's list
   was seen and has been replaced, or another `getGame` has completed since we
   started back. *(Until v0.102.0 this was our move COUNT plus a
   `variationMoveShown` marker — see "The marker that is not always there".)*
2. `restoreShownMove` presses, confirms, and then requires the move to STILL be shown
   `refreshHoldMs` later, retrying otherwise. It runs BEHIND the closed popup
   (v0.102.0): nothing the user waits on depends on it.

### Where the time goes (v0.99.0 — instrumentation only, no behaviour change)

Reported 2026-08-07: *"when saving a comment (at least in /variation/) the popup
lingers quite a while, even after the variation has been updated with the new
text."* Both halves of that are worth separating, because only the second one is
a complaint about waste:

* the popup is up for **the whole of `refreshVariationPage`** — it is what
  `qe.refreshing` holds the SAVING ui open for;
* the page **visibly updates at the end of the `render` phase**, whose composite
  gate (our path + our move count + a shown marker) is precisely "the fresh
  variation has rendered". Everything after that is the user looking at an answer
  they already have.

So `refreshVariationPage` now logs one line per round trip, from its `finally`
so a timeout or a throw is measured too:

```
[CLO] quick-edit refresh timing (ms): {total, leave, settle, home, render, restore[, rescue]}
```

and `restoreShownMove` logs its press count and its own total. Read the log, not
the constants — every one of those waits ends on an event and only caps out when
something has gone wrong.

What is already known, and what the log is for:

* **the pre-`render` half is measured** (2026-08-03, §6 above): pushState at t+0,
  the sibling's `getGame` at t+792 ms, home at t+2.1 s, our own `getGame` at
  t+2.6 s. That is the round trip the re-read *is*; it is not obviously reducible
  and none of it is post-visible.
* **`restore` is entirely post-visible, and has a floor of `refreshHoldMs`
  (700 ms) even in the perfect case** — the hold is unconditional per iteration,
  including the one where the move was never lost. Its ceiling is
  `refreshMoveTries × (refreshMoveWaitMs + refreshHoldMs)` = **9.5 s**, and the
  loop exists precisely because the page's own navigate-to-move-1 overrides the
  first press. Two iterations is the expected case, i.e. ~1.5–2 s of tail.
* **a refresh that returns false adds 2.5 s more** on top, from the
  `setTimeout` that keeps *"Saved — reload the page to see it"* readable. That
  one is a message, not a wait, and is correct as it stands.

**Nothing has been changed on the strength of the arithmetic above.** The two
things that must not be shortened to close the popup sooner are the `finally`
(what stops a save stranding the user on a sibling) and `qe.refreshing` (what
stops a second Save writing back a stale comment) — and `restore` is neither, so
it is where a fix would go if the numbers land where they are predicted to. The
candidate is not a smaller `refreshHoldMs` but **letting the popup close on
`render` and leaving `restore` to finish behind it**: the save is complete and
visible at that point, and putting the board back is housekeeping the user has no
reason to watch. That trades away nothing the two rules above protect — but it
needs the measurement first, in case the real tail is somewhere else entirely.

#### The measurement (2026-08-11, live, four saves)

Ground-truthed on `/variation/70382641/` with the board on ply 7 (Qb6), one line
of text appended per save through the Append tab. Alongside the extension's own
log line, a page-side MutationObserver timed the two moments the log cannot see:
when the new text actually appears in the comment column, and when the popup goes
`hidden`. Run E was the first save after an extension reload (cold service
worker); the others were warm. All four agree.

| ms | B | C | D | E |
|---|---|---|---|---|
| "Saving…" → "Saved" (the driver write) | 2390 | 2283 | 2457 | 2467 |
| `leave` | 35 | 38 | 48 | 46 |
| `settle` | 789 | 781 | 664 | 751 |
| `home` | 35 | 20 | 30 | 33 |
| `render` | 589 | 531 | 627 | 491 |
| `restore` (presses) | 702 (0) | 723 (1) | 702 (0) | 702 (0) |
| refresh `total` | 2151 | 2092 | 2071 | 2024 |
| "Saved" → **new text on screen** | 1443 | 1366 | 1362 | 1317 |
| **new text on screen → popup gone** | **703** | **723** | **703** | **703** |
| "Saving…" → popup gone | 4536 | 4372 | 4522 | 4487 |

Four things the numbers settle:

* **`render` IS the visible moment**, to within the observer's own resolution:
  `leave + settle + home + render` = 1448 / 1370 / 1369 / 1321 ms against a
  measured 1443 / 1366 / 1362 / 1317. The phase boundary this whole instrument
  was built around is the right one.
* **the post-visible tail is 703–723 ms — the FLOOR, not the predicted
  1.5–2 s.** `restore` took ZERO presses in three of four runs and one in the
  fourth; the second iteration never happened. The reason is `returnToVariation`'s
  first route: `history.back()` restores the URL, and the hash IS the page's own
  move pointer (`#/4/b`), so the fresh render lands on the move we started on and
  the shown marker is already right. The navigate-to-move-1 override the loop
  exists for did not fire on this host at all. It is `refreshHoldMs` and nothing
  else that is being waited on.
* **the wait is mostly the WRITE, and it is all pre-visible**: of ~4.5 s from
  "Saving…" to the popup going away, the driver round trip is ~2.4 s (54%), the
  pre-visible half of the refresh ~1.4 s (30%), and the post-visible tail 0.70 s
  (16%). Closing the popup on `render` therefore buys **0.7 s of 4.5** — real,
  cheap and safe, but not on its own an answer to "lingers quite a while".
* **cold vs warm makes no difference** to any of it (E vs B–D).

So the honest reading of the report is that the popup is up for ~4.5 s of which
only ~0.7 s is waste. The one run that felt much slower — the session's very
first save, before the page-side observer was armed — could not be phase-attributed
and was not reproduced in four attempts; if it recurs, the log line above now says
where it went.

(v0.99.1: the log line is `JSON.stringify`d. An object collapses to `Object` in
every console reader that is not DevTools itself, which is exactly how this line
gets read under automation.)

> **That last paragraph was wrong, and the run that "felt much slower" was real.**
> Every figure above holds for the variation it was measured on. The tail is not
> 0.7 s in general — it was **13.8 s** on the very next variation tried. See below.

#### The marker that is not always there (v0.102.0, live 2026-08-11)

The report was pushed back on in exactly the right place: *"the popup is shown
multiple seconds after the new comment has updated on screen — the rest of the
wait cannot be the write."* It is not, and the four-save table above is a
measurement of ONE variation (70382641, 8 plies) in a FRESH TAB, which is the
lucky case in two independent ways.

Seven further saves, instrumented from the page side (a `MutationObserver` for
the saved text plus a 100 ms recorder of URL / popup / move list / shown marker,
so the whole round trip reads back as a frame-by-frame movie):

| | 70382641, fresh tab | **70392537, 18 plies** |
|---|---|---|
| new text on screen | 10.9 s | **10.1 s** |
| popup gone | 11.6 s | **23.9 s** |
| post-visible tail | 0.70 s | **13.75 s** |
| how it ended | closed | *"Saved — reload the page to see it."* |

The second column is the report. The popup sat for fourteen seconds over a page
that was **already showing the save**, and then told the user to reload it.

**The cause is the `render` gate's third term, `variationMoveShown`.** That
marker is the page navigating itself to move 1 after a render — and it does not
happen when we came home by the OPPOSITE PAGER (`returnToVariation` route 2),
which lands on the bare path with no `#/<move>/<side>` hash. Measured: the fresh
variation and the saved text were up at 10.1 s with `shown = -`, and stayed that
way. So the gate could never be satisfied, burned its whole `refreshBackMs`
(12 s), and `back: false` reported "not refreshed" about a refresh that had
plainly worked — followed by the 2.5 s the message is held for.

**Why the first table never saw it: route 1 hides the whole thing.**
`history.back()` restores the hash, the hash IS the move pointer, so the fresh
render lands on a move and the marker appears. Route 1 is taken only when the
pager click grew `history.length` — and **Chrome saturates that at 50**, where a
push stops growing it and `pushed` reads false. A fresh tab therefore takes route
1 and a tab that has been browsed in for a while takes route 2, permanently. The
failing runs above were produced by padding history to 50 with `pushState`, which
is a one-line way to put a test tab into the state every real session ends up in.

Two changes, both in `refreshVariationPage`:

* **the gate is now the page's own SIGNATURE** — `variationPageSig()`, the
  variation title plus every move's id and SAN — and no longer asks for a marker
  or a bare move count. Two variations agreeing on their title and all of their
  moves are the same line, so there is nothing left for a sibling to fool it
  with, and a count that happened to match no longer can. Because a signature
  match would ALSO be satisfied trivially by our own outgoing list (if the
  sibling never rendered at all), it must come with one piece of positive
  evidence: the sibling's list was seen on screen and has since been replaced, or
  another `getGame` completed after we started back (`watchVariationFetch` now
  counts them and answers `fresh(n)`; with no `PerformanceObserver` it answers
  yes and the signature stands alone).
* **the popup closes at `render`, not at the end** — `refreshVariationPage` takes
  an `onVisible` callback and fires it at that mark. Both of the popup's jobs are
  finished there: explaining the flick to a sibling variation and back (which is
  alarming with nothing saying why — the movie shows a stranger's variation on
  screen for ~1.4 s of every save), and keeping a second Save off a copy that is
  now stale (a closed popup cannot save at all). What is left is `restore`, which
  is the board going back to the move it was on.

Measured after, same tab state and same variation as the failing run:
`{"total":3077,"leave":221,"settle":972,"home":111,"render":914,"restore":859}`,
popup hidden at the `render` boundary, `restore` behind it, refresh true. An
edit-mode save on the other host: `{"total":4322,…,"render":1702,"restore":1010}`,
popup hidden 25 ms before the `render` mark was logged. **Post-visible tail:
one observation frame, on both.**

The general point, worth more than the fix: `restore`'s ceiling is 9.5 s and the
old gate's was 12 s, so the popup's lifetime was tied to two phases that can each
run for many seconds after the user has their answer. It is now tied to neither —
whatever those two do, the popup is gone when the text appears.

(One number here is not comparable with the table above: the driver WRITE ran
~8 s in these runs against ~2.4 s in the earlier ones, of which the log says
`load 5.6s` — a CDP-driven tab loads the edit page slowly. It is all pre-visible
either way, and none of it is what was being measured.)

`qe.refreshing`: the loaded copy is stale by then (the read was dropped), so a second
Save would write it back and be refused by the driver's own staleness guard. `tick`
skips its not-ready close while that flag is set — the sibling's render passes through
a moment with no move list — and `closePopup` clears it, since Escape can close the
popup mid-refresh and a stuck flag would stop `tick` closing it ever again.

Verified live 2026-08-01, no reload in any case: arrows 8→9 on a save and 9→8 on a
removal, board back on the move it was on; an appended comment appearing in the move
list and disappearing again when deleted from the Edit tab.

## 7. Edit rights

Per-COURSE and TRI-STATE (`host.rights()`: true / false / null-unknown), probed
LAZILY. The pencil shows while rights are unknown, and the probe tab only opens from
`applyRightsToPopup()` when a popup opens on an unprobed course — Save stays disabled
until the probe confirms `canEdit` (result cached per `bid` per session; only an
`ok:true` probe is cached, so a timeout retries on the next popup). A known-uneditable
course hides the pencil.

**Nothing about a probe may fail silently** (v0.28.1). `probeRights` RETURNS false
when it cannot start one (unreadable bid/oid), and a probe whose result never arrives
is settled locally by a `probeTimeoutMs` watchdog — otherwise the bid stays in
`qe.probing` and BOTH popups (they share this cache) sit on "Checking edit rights…"
for the rest of the session with no retry. The alt check hears about a watchdog
give-up through the `altCheckProbeSettled` bridge, since its own knowledge of probes
comes only from `clo-quick-edit-result` messages.

**…and a failed probe may not start another one** (`qe.probeFailed`, v0.96.0). The
two facts above compose into a loop: a failure is deliberately not cached in
`rightsByBid`, so rights stay `null` — and `applyRightsToPopup` answered `null` by
calling `maybeProbe()`, which re-armed the watchdog, whose expiry called
`applyRightsToPopup` again. A probe that can never succeed therefore re-ran every
45 s for ever, opening a driver window each time, while the popup showed "Checking
edit rights…" permanently and the message explaining the failure was always one
tick away from being replaced. Section 15 was fixed for exactly this in v0.34.x
(`ac.probeFailed`, plus `ac.probeStarted` so `applyAcRights` cannot re-probe in a
loop); this half of the shared cache was missed. The latch is per popup-OPEN — reset
in `openPopup`, so closing and reopening is the retry the message asks for — and is
set from all three routes to a failure: the watchdog, the `ok:false` probe result,
and `maybeProbe()` returning false.

Found while diagnosing the Lemur failure above: with `chrome.windows.create`
throwing, every probe failed, and the loop is what turned a reportable error into a
hang.

`initQuickEditUi` exports `quickEditApi = { rightsFor(bid), probe(bid, oid, win) }`
(module-level variable). The alt check (15) and the analysis board's "Add as line"
(19) share the per-course rights cache and the lazy probe through it; the cache itself
stays in the `qe` closure, and probe results reach quick-edit's
`clo-quick-edit-result` listener FIRST (registration order: `initQuickEditUi` runs
before `initAltCheck` in `start()`), so the cache is warm when the alt-check's own
listener reads it.

`variationEditRights()` was hoisted to top level out of `HOSTS.variation` and is
shared with section 19b: the variation page renders its "Edit Variation" link only for
a course the user can edit, so the answer is never null. That is load-bearing rather
than an optimisation — the variation host reports NO `bid`, so
`quickEditApi.rightsFor('')` would answer "unknown" and open a driver window for a
question already answered on screen.

## 8. The popup, and touch

**It MUST swallow `keydown`/`keypress`/`keyup`** (bubble phase, `stopPropagation`) —
MoveTrainer2 binds single-key shortcuts ("n" = next variation, space, …) on
`document` and does NOT skip them while a text field has focus, so without this,
typing a comment drives the trainer. Bubble phase is enough (verified live); the
default action still inserts the character, and Escape closes the popup.

The pencil is a **singleton, body-mounted**, never inserted into Chessable's move
list.

Touch has no hover, so after a TAP on a move (`pointerout` with `pointerType 'touch'`)
the pencil lingers `touchPencilMs` (~4 s) instead of the 200 ms mouse hide — tap the
move (which also navigates the board there), then tap the lingering pencil. Any
scroll hides the pencil immediately: it is fixed-positioned from the move's rect at
show time and would otherwise float over the wrong move.
