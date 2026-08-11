# Testing notes → todo list (2026-08-07)

Twelve notes from a testing session, grouped into nine prompts. Each block below is
meant to be pasted as-is into a future session; the pointers exist so the session
does not have to re-find the code. Nothing here has been implemented or verified.

Ordering is by independence, not priority — 1-4 are small and self-contained,
5-7 are behaviour changes inside one module, 8-9 are new features.

---

## 1 DONE (v0.84.0)

Both halves landed. **(a) went to the QUIZ panel** (`.clo-cr-panel`) as
`cr.browse` — a flag inside the quiz mode, not a fourth `cr.mode`; **(b) went to
the mid-quiz/browse HEADS-UP** (`.clo-cr-heads`) as a resting opacity. Harness
figures and the reasoning are in CLAUDE.md sections 18 and 18b.

Not yet checked in a live session: the CSS and layout were measured in
`dev/harness.html`, but every JS behaviour (entering/leaving browse, the
resume-from-here, the arrow keys, `--cover` being set by `placeHeadsUp`) needs a
real trainer session and an extension reload.

<details><summary>original note</summary>

Covers notes:
- *"Inside the panel that shows clickable lines during review: add option to simply
  navigate the line (`<<` `>>`) in the panel"*
- *"The clickable line panel is somewhat annoying. Let's make it darker or
  transparent when not hovered. Important clickable lines (!) can have higher
  brightness/opacity than normal ones."*

> Two changes to the clickable-line panels (section 18 / 18b in
> `content/lichessable.js`).
>
> **(a) Navigate instead of quiz.** In the panel that shows clickable lines during
> review, add a way to simply step through the line — `<<` / `>>` buttons that walk
> our board along the line's plies without asking for a move. Note the quiz already
> has the machinery: `cr.path` / `linePath()`, `step()`, `currentPly()`, and
> `applyMove` on our board. The question to settle first is whether this is a
> third `cr.mode`, or a "browse" flag inside the quiz mode that only changes what
> `step()` waits for. Keyboard equivalents (arrow keys) fit, but check the
> capture-phase key swallow in `closeReview`'s listener first.
>
> **(b) Dim when not hovered.** The panel is intrusive. Make it darker/more
> transparent at rest and full strength on hover, with lines marked important
> (section 18c, `importantLine` / `.clo-cr-*--important`) sitting at a higher
> opacity than ordinary ones so the mark still reads through the dimming.
>
> First tell me **which panel each half applies to** — I meant the one that shows
> the clickable lines during review, but the code has two candidates and they have
> different jobs: the mid-quiz/browse heads-up (`.clo-cr-heads`, ~line 3093 of the
> stylesheet, lists several lines with the important marking per row) and the quiz
> panel that covers the comment box during a run (`.clo-cr-panel`, ~line 2636).
> Say which you're changing before you change it.
>
> Remember `.clo-cr-heads` in the browse state deliberately COVERS the comment box
> because the lines are printed there — dimming it must not turn it back into a
> spoiler. Check the result in `dev/harness.html` (bust the stylesheet cache) and
> report measured opacity/rects, not "looks fine".

</details>

---

## 2 DONE (v0.86.0)

Ground-truthed on a live lichess.org analysis board 2026-08-09 (four shapes drawn
with synthetic right-button events, `svg.cg-shapes` read back), not from
chessground's source. The numbers are in CLAUDE.md section 18's 11c paragraph.
What was wrong with ours: the shaft started 0.26 out of the source centre and the
tip overshot the target by 0.06 (theirs: centre to centre), and the head was 0.44
wide against their 0.625 — a thin dart rather than an arrow. Also adopted their
opacity (1, was 0.72) and their circle (r 0.46875 / stroke 0.0625). Colours
unchanged. Kept as line + polygon rather than a `<marker>`, so `paintShape`'s
one-property-per-element contract is untouched.

All five callers checked in the harness; **not yet seen in a live session**.

<details><summary>original note</summary>

Covers note: *"Make our board's arrow look the same as the original chessable board's"*
— **revised 2026-08-07: copy Lichess, not Chessable. Chessable's arrows look bad.**

> Our arrows look wrong. Make `boardShapeArrow` (section 11c,
> `content/lichessable.js:5107`) draw arrows that look like **Lichess's** — the
> chessground ones on lichess.org's own board. Explicitly NOT Chessable's: I've
> looked at theirs and they're the worse of the two.
>
> Ground-truth Lichess's first, by measurement rather than from memory. Chessground
> renders shapes as an SVG overlay over the board with the geometry in board units,
> the same idea ours uses, so the numbers transfer directly: open a board on
> lichess.org, draw an arrow, and read the actual `<svg>` off it — shaft width, how
> far the shaft is pulled back from the source square's centre, head length and
> width, whether the head is a `marker` on a `<line>` or a separate polygon, and
> the opacity. Write the measured numbers down — don't eyeball it, and don't take
> chessground's source constants as the answer without checking them against what
> the page actually renders.
>
> One structural difference to decide on: theirs is a line plus an arrowhead
> `marker`, ours is a shaft element plus a separate head polygon that `paintShape`
> colours independently. If you keep our two-element shape, the head still has to
> sit where theirs does relative to the target square centre.
>
> Constraints: geometry stays in BOARD UNITS (`viewBox="0 0 8 8"`, percentages
> everywhere) so a resize still needs no JS, and the colour rules in section 11c
> hold — exactly one property per element (`stroke` on the shaft, `fill` on the
> head, which the CSS also gives `stroke: none`), inline style not attribute, and
> `paintShape` accepts either a key or a CSS value. A `getBoundingClientRect()` on
> the head excludes stroke, so it will measure correct while looking wrong.
> COLOURS STAY OURS — copy the shape, not the palette: our arrow colours are
> load-bearing (green course move vs blue alternatives in show-and-grade, the four
> `SHAPE_COLOR_HEX` keys in the quick-edit editor). And nothing is vendored or
> fetched from lichess.org — the measurement is research, the output is our own
> geometry.
>
> Five callers share this: the line quiz, the drill, the heads-up mini board,
> show-and-grade (green course arrow + blue alternatives) and the quick-edit arrows
> editor. Check all five in `dev/harness.html`.

</details>

---

## 3. /variation/ page: Analyse button and the lingering save popup

**(a) DONE (v0.99.0).** `.clo-cr-analyse-head` drops the header's bare text for
the neutral tier's own outline — `1px var(--clo-line)`, `var(--clo-text)`, at the
header's smaller padding. No fill, no green: its salience is being the only
bordered control in that header. Measured old-vs-new in one headless run at the
live 420px: the button 50.7×18 → **60.7×20**, the header 31 → **33px** desktop and
**61px unchanged** under `html.clo-touch` (the ⚙ still sets that line), one line in
both, right edge unchanged because `.clo-title` is `flex: 1`. Reasoning in
`DESIGN-ui-inventory.md` ("v0.99.0 — …and the vocabulary goes back to the tier's").
**Seen live 2026-08-11** on /variation/70382641/ at the same 420px panel: button
**60.70×20**, `1px solid rgb(61,58,54)` on `rgb(186,186,186)` text, background
transparent — the harness figure to the pixel. The one divergence: the live
`.clo-header` is **38px**, not the harness's 33 (still one line, and the button
is not what sets it).

**(b) MEASURED LIVE 2026-08-11 (four saves), NOTHING CHANGED — a decision is
owed.** Table and reasoning in `DESIGN-quick-edit.md` §6, "The measurement".
Headlines:

* the popup is up for **~4.5 s** from "Saving…", of which the **driver write is
  ~2.4 s (54%)**, the pre-visible half of the refresh ~1.4 s (30%) and the
  **post-visible tail 0.70 s (16%)**;
* the prediction was wrong in the user's favour: the tail is the **FLOOR**
  (`refreshHoldMs`, 703–723 ms), not ~1.5–2 s. `restore` took **0 presses in
  three of four runs**, because `history.back()` restores the hash, the hash is
  the page's move pointer, and the fresh render therefore lands on the move we
  started on. The navigate-to-move-1 override the retry loop exists for never
  fired;
* `render` is confirmed as the visible moment (predicted vs observed within
  ~50 ms), so the instrument's own boundary is sound;
* cold (extension just reloaded) and warm runs are indistinguishable.

So the candidate fix — close the popup on `render`, let `restore` finish behind
it — is safe and cheap but buys **0.7 s of 4.5**. It does not by itself answer
"lingers quite a while", and the rest of the wait is the write actually
happening. Your call between (i) take the 0.7 s anyway, (ii) leave it and change
what the popup SAYS while it waits, or (iii) both. The session's very first save
felt far slower but was not instrumented and did not reproduce in four attempts;
the log line now answers that if it recurs.

v0.99.1 is the only code change from this: the timing line is `JSON.stringify`d,
because an object logs as `Object` in every console reader that is not DevTools.

Covers notes:
- *"Make the 'Analyse' button in /variation/ page stand out more."*
- *"When saving a comment (at least in /variation/) the popup lingers quite a while,
  even after the variation has been updated with the new text"*

> Two things on the standalone `/variation/<id>/` page.
>
> **(a)** The "Analyse" launcher in the Lichess panel header (`CR_VARBTN_ID`,
> `content/lichessable.js:956`, `.clo-cr-analyse-head` at stylesheet ~2936) is too
> quiet — I miss it. Make it stand out more. The current design argument for bare
> text is in CLAUDE.md section 19b (every control in that header is bare text, and
> an outlined button would be the loudest thing in a panel meant to be read) — I'm
> overruling that if it takes an outline, but check `DESIGN-ui-inventory.md` §3 for
> which tier it should sit in and keep the colour meaning intact (it is a neutral
> "away from the main task" action, not the primary). Measure the header at 420px
> afterwards; it currently fits on one 38px line.
>
> **(b)** Saving a comment there leaves the quick-edit popup up for a long time
> after the variation on the page has visibly updated with the new text. Find out
> what it's still waiting on — likely `qe.refreshing` / `refreshVariationPage`
> (`content/lichessable.js:6668`, section 12c), whose round trip goes pager →
> `refreshGameApi` landing → `history.back()` → `restoreShownMove`'s
> press-confirm-and-hold. Instrument the phases and tell me where the time
> actually goes before changing any of it.
>
> Careful: that function's `finally` is what stops a save stranding the user on a
> sibling variation, and `qe.refreshing` is what stops a second Save writing back
> a stale comment. Neither may be shortcut to make the popup close sooner — if the
> honest answer is "the work really takes that long", the fix is what the popup
> SAYS while it waits.

---

## 4 DONE (v0.101.0)

**The expectation was right and the diagnosis was worse than expected: BOTH lines
were dropped, not one.** Full write-up in `DESIGN-continuation-review.md` §7.6a.

Answering the note's own questions in its own terms:

* **which segmentation rule fires** — rule 3, "a position this line has already
  been played FROM ⇒ a new branch off an earlier move". The rewind to `16...Rfe8`
  fails `moveFits` at the running end on BOTH counts (printed number and side to
  move), so it opens a segment of its own starting at the fork.
* **whether it becomes two branches** — yes, `branched: true`, and both are
  quizzable, so `dropAmbiguous` sees them.
* **whether `mergeUserAlternatives` combines or drops them** — it dropped them,
  and so did the caller: a refusal takes *every* line at that position, which is
  why the comment lost both. Two guards fired at once, a different `startFen` and
  a different fork index — because the author wrote the alternative in SHORTHAND,
  from the fork, instead of repeating the road to it.

So `mergeUserAlternatives` refusing was **not** correct here, and the bug was in
this function rather than elsewhere: its shape check described only the case where
both branches are written out in full, which is the rarer of the two. Members no
longer have to fork at the same index — a shorthand member's plies are matched
BACKWARDS from the fork and its start position must be one the base line actually
stands on. The full-form path is untouched, term for term, and a genuine
transposition is still refused.

Result on the reported comment: ONE line accepting either 16...Qf5 or 16...Rfe8,
carrying on down whichever was played — exactly what the note expected.

**Both readers**: the change is in `dropAmbiguous`/`mergeUserAlternatives`, which
sit *below* the DOM scanner and the lesson-plan one, so neither reader needed
touching and they cannot disagree about it.

Nine cases against the real functions (sliced out of the source by brace matching,
run against the real `CloSan`), and ground-truthed live 2026-08-11 on variation
70382641 — the test comment written through Chessable's own edit page, the rendered
markup read back, and the comment restored afterwards. **"alt." renders as prose
between the clickable spans and all three moves stay in ONE group**, which is the
one thing the headless run had assumed rather than observed.

**v0.101.1 — playing the alternative threw, and had done since v0.67.0.** Reported
on `(4.d4 cxd4 5.Nxd4 g6 or 5...Nxd4)`: `Cannot read properties of undefined
(reading 'from')`, board frozen mid-trade. `tryMove`'s alternative arm handed
`applyMove` a ply with no resolved `mv`; it reads `ply.mv` on its first line and has
since v0.33.0. Not caused by v0.101.0 — **made reachable** by it, since a combined
line was rare until the shorthand shape started combining. The alt arm is now
EXECUTED in a harness (real `tryMove`, real `CloSan`, DOM calls stubbed), with a
control that reproduces the reported message when the fix is reverted.

Consequence for the record: `DESIGN-continuation-review.md` §7.6's 2026-08-04 note
claimed the non-primary answer "finished the line" — impossible, and now corrected
there. The run verified the OFFER; the write-up claimed the ANSWER.

Still unverified: the combined line being played in a real session, and
`navigateToLineEnd` landing on the right span after an alternative.

<details><summary>original note</summary>

Covers note: *"Alternative clickable lines doesn't work fully:
(15. Nxd4 cxd4 16. b3 Qf5 alt. 16...Rfe8) for example"*

> A clickable-line comment of this shape isn't handled fully:
>
> `(15. Nxd4 cxd4 16. b3 Qf5 alt. 16...Rfe8)`
>
> One pair of parentheses, several branches inside it, with the word "alt." as
> prose between them. Work out what actually happens today — which of `walkLine`'s
> three segmentation rules (`content/lichessable.js:12944`) fires on the rewind to
> `16...Rfe8`, whether it becomes two branches, and then whether `dropAmbiguous` /
> `mergeUserAlternatives` (`:13268`, `:13368`) combines them or drops them. Both
> readers must be checked: the DOM/browse scanner and the lesson-plan one
> (`:16063`), which legitimately disagree about how far a flat run stays clickable.
>
> My expectation is that this should end up as ONE line accepting either 16...Qf5
> or 16...Rfe8 and carrying on accordingly — but confirm what the branches
> actually resolve to before deciding that's the right answer; if the two branches
> aren't a clean single divergence, `mergeUserAlternatives` refusing is correct and
> the bug is elsewhere.
>
> I'll give you the real variation to test against if you need one. Do the
> reasoning against the real `walkLine` in a headless harness first, then
> ground-truth live before writing anything into CLAUDE.md.
> (Resolved, 2026-08-11: **Node is on BOTH machines** and the question is closed.
> This folder is carried between a home PC and a work PC; one had Node v24.14.1
> all along, the other had none until it was installed with
> `scoop install nodejs-lts` → v24.19.0 + npm 11.17.0, whole `node --check` block
> verified on it. So CLAUDE.md's verification block works as written and the
> headless-Chrome parse harness the earlier notes describe is retired — do not
> rebuild it. The one live trap left is a STALE PATH, not a missing install:
> scoop writes the user PATH to the registry and an already-running shell does not
> re-read it, so prepend
> `$env:Path = "$env:USERPROFILE\scoop\apps\nodejs-lts\current;$env:Path"` or open
> a new terminal. Note scoop puts node on PATH via the app directory, so there is
> no `~\scoop\shims\node.exe` to find. `py` works on both.)

</details>

---
## 5 DONE

---

## 6 DONE (v0.100.0) — but NOT as a hold

Landed as **§2g of `DESIGN-show-and-grade.md`**: a `next` press the mode cannot act
on *yet* is **queued** rather than dropped, so four quick taps move the line four
moves on. Two presses make one card, so that is 4 moves / 2 cards — the mode's
existing arithmetic, unchanged.

**The hold was built first, verified live, and then withdrawn on a hardware
finding.** The ring this mode exists for sends **one event per tap, on release,
never while held, and never faster than ~200 ms apart** — so there is no key-down
state to observe, and a long press is *swallowed by the ring* rather than merely
undetectable. Every hold-shaped gesture is unbuildable on the one device that
matters. (The hold itself worked: five cards from one hold with Auto off and
nothing proven, release stopping it within one card, and a key held 6.5 s past the
end of a variation advancing nothing. Kept only as the record in §2g.)

**Do not reach for `e.repeat` again** — v0.81.0's rule stands unqualified, and the
one design that had an argument for bending it is gone for unrelated reasons.

The queue turns out to be the better feature anyway, and not only because it fits
the hardware:

* **it fixes a real drop.** After every grade there is a ~950 ms window
  (`settleMs` 400, then Chessable's own ~550 ms) in which the phase is `'acting'`
  and then `'think'` with `cardReady()` false — every press landing there was
  discarded with "Waiting for the board…". At 200–250 ms taps that is about four
  presses lost per card, which is most of what "it doesn't respond" feels like.
* **every queued press is still a real press**, so nothing runs that the user did
  not ask for and there is no latch to forget — which is exactly what a
  play-through toggle could not promise.

Rejected on the way: a **double-tap latch** on `2` (the natural reveal→grade
rhythm and the deliberate trigger are the same gesture) and **`1` as a toggle**
(it is the TTS "say that again" key, which is what a blindfold ring user reaches
for).

Simulated over 9 sequences / 24 assertions, including a control case showing the
old code losing a press from the same four taps.

**Confirmed working by the user on the ring, 2026-08-11** (v0.100.1). What is
still only argued, not felt: `maxQueued` (8), `queueTtlMs` (3 s), the pacing at
the non-default `paces`, and the boundary drop — `DESIGN-show-and-grade.md` §12.9.

**v0.100.0 shipped broken and v0.100.1 is the fix.** Lifting `onKey`'s body into
`doNext` stranded `isNext`, a local of the old scope, so every reveal threw a
`ReferenceError` and the mode "stopped working completely". `node --check` cannot
see that class and a transcription-based simulation does not execute the source,
so both passed. `onKey` now carries `tick`'s try/catch — a throwing key handler is
otherwise entirely silent — and the standing rule is in CLAUDE.md: **an extraction
in this file is not shippable on static checks alone.**

<details><summary>original note</summary>

Covers note: *"'Show and grade' idea: hold down 'correct' (2) to auto-play moves"*

> Add a hold-to-auto-play gesture to show-and-grade: holding the "known" key (2)
> keeps cards playing instead of needing a press per card.
>
> Note this interacts directly with two rules already in section 23:
> - `e.repeat` is currently swallowed and never acted on, deliberately — auto-repeat
>   landing in the NEXT variation's think phase is what took it over before its
>   first card was served (v0.81.0). A hold gesture has to be built on the repeat
>   stream or on keyup timing without reintroducing that.
> - The existing Auto toggle (`cloShowGradeAutoPlay`) already replays PROVEN moves
>   only, and stops at the first unproven one. A hold would run cards regardless of
>   proof, i.e. it grades unproven cards correct without the user seeing them —
>   decide explicitly whether that is what I want (it probably is: the hold IS the
>   user asserting they know these), and whether releasing mid-card is safe.
>
> Also say how it composes with the Auto toggle and whether the hold should
> count as `handedOver`.

</details>

---

## 7 DONE (v0.85.0)

`drillShowGradeKey` → `showGradeKey`, serving the drill and the clickable-line
quiz from the one listener. The three open questions were answered as:

- **the verdict** re-queues the line once at the end of the run (`requeueLine`,
  `cr.sgAgain`), which is the drill verdict's shape scoped to something that does
  not outlive the run — rather than a verdict that does nothing.
- **combined lines**: the reveal plays the line's own move and NAMES the others,
  so the alternatives key is deliberately not bound here (the accepted set is
  already on the ply; a review session has to fetch it).
- **the timer** needs nothing — `holdTrainer()` is called only from `reviewNow`,
  i.e. from exactly the runs with a live card being timed.

Panel states measured in the harness; the key behaviour is NOT yet live-verified.

<details><summary>original note</summary>

Covers note: *"lets extend the show and grade mode to review clickable lines"*

> Bring show-and-grade's two-key interaction to the clickable-line review
> (section 18's quiz), the way it was already brought to the drill in v0.72.0:
> first press plays the line's next move on our board, second press is the verdict.
>
> The drill precedent is the model — the two keys live in the continuation module's
> existing capture-phase listener, gated on `showGradeEnabled()` (the preference,
> not a running trainer session), and the board still accepts a played move so the
> keys are a second way to answer rather than a mode. Reuse that, don't build a
> parallel path.
>
> Open questions to answer before coding:
> - what the verdict DOES here. A drill grade flips `retried` in the mistake log.
>   A clickable line reschedules nothing and records nothing — so is the verdict
>   only "advance", or should a "didn't know" line be re-queued at the end of the run?
> - combined lines (`mergeUserAlternatives`) accept either of two moves — which one
>   does the reveal show, and does the alternatives key (3/space) apply?
> - whether the trainer timer needs holding, as `holdTrainer` does for "Review now".

</details>

---

## 8 DONE (v0.95.0, "Open it" in v0.95.1)

Landed as **section 19c**, a second button beside "Add as line" on both analysis-board
hosts, with `DESIGN-add-as-variation.md` holding the wire shape and the ten live facts.

**The note's central guess is wrong, and that is the main finding: there is a JSON
API.** `POST /api/v1/importSubvariationFromSource`, on section 5c's JWT auth — the
call Chessable's own "add this clickable line to my repertoire" context menu makes.
So no edit-page driver, no popup window, no worker job, no rights probe and no
staleness guard, and section 12 is untouched by this feature. (The general creator,
`importGame`, exists too and is deliberately NOT used: it would make us build every
FEN, move number and drawing blob, and a variation carrying an `oid` there
*overwrites* that variation.)

Three findings decided the shape, all ground-truthed:

* **the server splices the prefix**, per-move comments, nested clickable lines and
  arrows byte-identical, so we send only our own moves. That answers the note's
  question about the copied prefix's comments and arrows outright — and it is the
  only way to get the arrows at all, since a variation's arrows cannot be read
  outside the edit page;
* **`plyNumber` is absolute in the GAME**, not an index in the variation. A tactics
  variation starting `… b - - 0 34` numbers its own first ply 68 and the server
  refuses anything below that. Hence the top-level `pliesBefore(fen)`, derived from
  our own start FEN so a mid-game start needs no special case;
* the illegal-SAN error **echoes the FEN the server resolved to**, which makes it a
  free read-only probe of all of the above — that is how the ply semantics were
  settled with no writes at all.

The note's four "decide and state" questions, answered in `DESIGN-add-as-variation.md`
§3.3–3.5: destination is **this course, the source variation's own chapter** (one
destination, decided with the user; the nominated repertoire is the case it cannot
serve yet, and §3.3 says what that would cost); the name is Chessable's own
convention, source title + the branching move; the prefix is neither copied nor
re-derived by us; and the guards are §21's — `authorUid`, arm-before-fire, re-read
afterwards — plus dropping the caches that now lie (5c's course cache, and 6c's index
when the target is the nominated repertoire).

Verified live end to end on the variation-page host, including the created line, its
chapter, its inherited comments, and the refusal on a course the user did not create;
all test writes deleted and the courses confirmed back at their original counts. **The
trainer host is verified only as far as its readers** — reaching the browse state means
completing a variation, and driving MoveTrainer2 from automation lost to the per-move
clock. `DESIGN-add-as-variation.md` §3b says exactly what is untested and what to watch
on the first real run.

<details><summary>original note</summary>

Covers note: *"In our analysis. Add option 'Add as variation' to course, if started
from a specific variation it should included those moves + comments etc."*

> Second write for the analysis board (section 19 / 19b), beside the existing
> "Add as line": **"Add as variation"** — write the analysed line into the course
> as a real variation rather than as a clickable line inside a comment. When the
> board was opened from a specific variation, the new variation should carry that
> variation's moves up to the entry point (and its comments etc.), with our
> analysed line continuing from there.
>
> This is the biggest item on the list — treat it as design-then-build, and give
> me the design before you write anything.
>
> Existing pieces to survey first:
> - section 21 already CREATES variations, via Chessable's own
>   `duplicateVariationsToRepertoire` — but that copies an EXISTING oid; it is not
>   an "insert these SAN moves" call. `DESIGN-repertoire-coverage.md` has every
>   endpoint and what each one actually does.
> - the quick-edit driver (section 12) drives Chessable's own edit page for
>   everything else we write, because the edit POST fields are session/CSRF-bound.
>   Adding a variation is very likely another driven flow, not an API call — find
>   out which, by hooking `fetch` and driving Chessable's own "add variation" UI to
>   its last button and BLOCKING the request, the way §21's add body was captured.
> - `analysisLinePgn` / `analysisCommentText` already render our line as numbered
>   SAN from its start position.
>
> Decide and state: where the new variation lands (which chapter), what its name is,
> whether the prefix moves are copied from the source variation's own move list or
> re-derived, and what happens to the source variation's per-move comments and
> arrows (`allTheMoves[...].drawing`) on the copied prefix. Guard it like §21's
> writes: destination authored by the user, arm-before-fire, and re-read afterwards
> rather than trusting our model of what we wrote.

</details>

---

## 9 DONE (v0.90.0)

Landed as **section 13b**, inside auto-play rather than as a mode of its own —
a second toggle in auto-play's cog menu. The endpoint report the note asked for
is in CLAUDE.md section 13b and the corrections to `DESIGN-retry-mistakes.md`
§2.2; the two decisions taken from it were to exclude timeouts from the accuracy
and to scope the mode to `/practice/`.

**The note's suggested shape does not work, and that is the main finding.**
"Hold on the difficult positions, let auto-play cover everything else" is a no-op:
§13 only plays a move it has watched you answer correctly *this* session, so at a
review session's start there are no proofs and nothing to hold back. It had to be
a second **proof source** (not-difficult ⇒ playable) plus a **veto** (difficult ⇒
never played, even when this session proved it). `autoPlaySetHold` was unusable
for a second reason too: it is section 17's exclusively, cleared from
`applyHold()` in that tick's `finally` twice a second.

Not yet verified in a live session: everything above was measured against the
real endpoint and spot-checked over 27 cases on 29 real rows, and the harness
figures are real, but no trainer session has run with the switch on.

<details><summary>original note</summary>

Covers note: *"Feature request: Difficult moves only mode. Auto-play all moves that
have above 90% and hasn't failed recently"*

> New session mode: **difficult moves only**. Auto-play every move I'm reliably
> good at — above ~90% success and not failed recently — so a session only ever
> stops on the moves that are actually hard.
>
> This is layer 2 of `DESIGN-retry-mistakes.md`, which is still unimplemented and
> names the `/difficult-moves` JSON endpoint as the source. Start there: find out
> what that endpoint actually returns per move (success rate? attempt counts? last
> failure?), whether it is per course or per chapter, and what it costs to fetch.
> Report that before designing the mode.
>
> Then the mode itself is mostly a new source for an existing mechanism: section 13
> already replays a variation's opening run and hands back at the first unproven
> move, and `autoPlaySetHold` already forces a hand-back on chosen positions
> (section 17 uses it to stop auto-play playing the very move being retried). A
> "difficult moves only" pass is plausibly: hold on the difficult positions, let
> auto-play cover everything else. Check whether that composes with §13's
> opening-run-only rule — mistakes at moves 8 and 12 need control handed back
> twice, which is exactly what §17's `resumeAfterHandover` exists for.
>
> Settle the threshold as a SETTING, not a constant, and say where the percentage
> comes from — if the endpoint doesn't give one, the session's own mistake log
> (section 16) is a much weaker substitute and the feature may need to wait.

</details>
