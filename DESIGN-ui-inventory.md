# DESIGN — control inventory & visual hierarchy

Status: **implemented except #6 and #9 — see §6 for what landed and what is
owed.** Ground-truthed from the code 2026-08-02 (v0.55.0); every gate below is
quoted from the `sync*` function that owns it, not from prose. §1's table
describes the row **as it was before** the changes in §6 — it is the baseline
the findings argue against, not a description of today's code.

Companion: `dev/harness.html` renders every surface named here.

---

## 0. Why this document

The styling is consistent — `.clo-review-btn`, `.clo-cov-btn`, `.clo-chapter-btn`,
`.clo-cr-btn` and `.clo-mx-btn` agree on 3px radius, 12px type, 1px border and
±2px of padding. Nobody drifted.

The problem is one level up. Twelve independent modules append controls to one
horizontal row, each choosing its own colour by local reasoning, and the
resulting hierarchy encodes **which module built a button** rather than **what
the button does or how much it matters**. Each pairwise conflict was already
noticed and fixed locally — the launcher hides while the queue button shows,
precisely so "the two green buttons compete" cannot happen — but no module can
see the row as a whole, so the conflicts reappear between modules that never
meet in one file.

---

## 1. The trainer row (`.clo-review`)

Body-mounted, one flex row under the board. Four modules append to it:
section 9 (overstudy), 13 (auto-play), 16/17 (mistakes/retry), 18–20
(continuation/analysis/drill).

| # | Control | Class | Treatment | Gate (verbatim) | Kind |
|---|---------|-------|-----------|-----------------|------|
| 1 | "Overstudy" | `.clo-review-title` | label | widget shown | label |
| 2 | This variation | `.clo-review-btn` | **filled #629924** | `!entry` → hidden; entry = current variation detected | action → background tab |
| 3 | Previous variation | `.clo-review-btn--secondary` | green outline | previous exists and differs from current | action → background tab |
| 4 | Auto-play | `.clo-ap-toggle` / `--on` | outline / **filled #629924 when ON** | trainer path | **setting (toggle)** |
| 5 | speed | `.clo-ap-speed` | select | `hidden = !ap.enabled` | setting |
| 6 | Clear | `.clo-ap-clear` | grey outline | `hidden = !ap.enabled` | destructive, 2-click arm |
| 7 | status | `.clo-ap-status` | amber text | replaying / cancelled | status **and** action (cancels) |
| 8 | Mistakes (N) / (0 of M) | `.clo-mx-btn`, `--quiet` when none outstanding | amber outline / neutral outline | `running \|\| !history.length` → hidden | disclosure → popup |
| 9 | Retry | `.clo-mx-retry` | **filled #629924** | `running \|\| !pending.length` → hidden | action → **navigates away** |
| 10 | Retry n/m — title | `.clo-mx-status` | amber text | `!running` → hidden | status |
| 11 | Skip | `.clo-mx-mini` | bare text | `!running` → hidden | action |
| 12 | Stop | `.clo-mx-mini` | bare text | `!running` → hidden | action |
| 13 | Review clickable(s) (n) | `.clo-cr-open` | green outline | `!cr.active && n > 0 && !showQueue` | action → our overlay |
| 14 | Review queued lines (n) | `.clo-cr-queue` | **filled #629924, 600 weight, 6×14 padding** | `!cr.active && queued > 0 && reviewBrowseReady()` | action → our overlay |
| 15 | Analyse | `.clo-cr-analyse` | neutral outline | `!cr.active && reviewBrowseReady()` | action → our overlay |
| 16 | Drill mistakes (N) | `.clo-cr-drill` | amber outline | `!cr.active && mistakes > 0 && reviewBrowseReady()` | action → our overlay |

### 1.1 What is on screen at once

| State | Controls | Filled green |
|---|---|---|
| **Live quiz**, auto-play on, mistakes logged | 2, 3, 4, 5, 6, 8, 9 | **3** (2, 4, 9) |
| **Browse**, auto-play on, mistakes, lines queued | 2, 3, 4, 5, 6, 8, 9, 14, 15, 16 | **4** (2, 4, 9, 14) |
| **Browse**, nothing pending, auto-play off | 2, 3, 4, 15 | 2 (2, 4) |
| **Retry pass running** | 2, 3, 10, 11, 12 (+ browse items between variations) | 1 |
| **Our overlay active** (quiz/drill/analysis) | 2, 3, 4, 5, 6, 8, 9 — 13–16 hidden by `cr.active` | **3** |

Peak: **ten interactive controls in one flat row, four of them wearing the
strongest treatment in the design.**

---

## 2. Findings, ranked

### F1 — The strongest treatment is worn by four controls at once, one of which is not an action (fixed, v0.56.0 + v0.58.0)

Filled `#629924` with white text is the loudest thing the extension draws. It is
used by `.clo-review-btn`, `.clo-mx-retry`, `.clo-cr-queue` (which adds
`font-weight: 600` and larger padding, so it is loudest of all) — and by
`.clo-ap-toggle--on`.

That last one is the sharpest problem: **auto-play is a persistent setting**, and
when it is on — the normal state for anyone who wants it — it advertises itself
as forcefully as "Retry". A toggle's on-state and a call to action need
different vocabularies; sharing one means the row shouts loudest about the thing
that needs no decision.

### F2 — Retry and Drill are siblings with different gates, and the unguarded one is the destructive one

`.clo-cr-drill` is gated on `reviewBrowseReady()`; `startRun()` has no such
guard. So mid-quiz, **Retry is pressable and Drill is not** — and Retry is the
one that navigates, abandoning the card being answered, while Drill merely opens
an overlay. The safer sibling is the guarded one.

`openDrill` also declines with a sentence when it cannot run (v0.45.1, after a
drill started mid-quiz was torn down leaving no board and no message). Retry has
no equivalent.

### F3 — Amber means two different things (fixed, v0.58.0)

`.clo-mx-btn` "Mistakes (3)" and `.clo-cr-drill` "Drill mistakes (3)" were
pixel-identical: `#7a6a2e` border, `#d9a942` text, same padding, same radius,
adjacent in the row, both ending in the same number. One opens a list; the other
starts a quiz. The only thing telling them apart is the verb — and they were
placed four controls apart, so they did not even read as a pair.

Amber is *also* section 18c's "important line" colour (`--clo-cr-important`,
`#e6b422`), applied as a ring on the queue button. Three meanings, one hue.

Resolved by giving each meaning a treatment it does not share:

| Meaning | Now |
|---|---|
| "you have N outstanding items" | amber **outline**, `.clo-mx-btn` alone |
| …and when none are outstanding | `.clo-mx-btn--quiet`, neutral outline (v0.61.0) |
| "this launches practice" | green outline, joining `.clo-cr-open`/`.clo-cr-queue` |
| "an author marked this important" | amber **ring**, never an outline |
| "something is happening" | amber **text**, on the status line, no border |

Two of those needed a change. `.clo-cr-drill` and its popup twin `.clo-mx-drill`
became green-outline practice actions: the row's amber outline now means exactly
one thing and never launches anything, which is §3's Attention tier written down.
What still ties the drill to the mistakes is its label, its count, and the
grouping — §3.2 puts it at the head of the practice cluster, immediately right of
the mistake group it draws from, so the two finally read as the pair they are
instead of sitting four controls apart in the same colour.

`.clo-cr-open--important` became a ring, which `.clo-cr-queue--important` always
was. The reason given for the queue button at the time turns out to be the
general one — *"an amber fill would read as a different kind of button rather
than the same one carrying a mark"* — and after §3.1 the mark cannot assume a
weight to recolour anyway, since whether either launcher is filled is now the
row's decision and not the module's. Measured: amber-outlined controls in the
row went **2 → 1**.

Section 18c's own surfaces — the quiz panel, the heads-up — keep the amber border
and glow. They are overlays, nothing in them counts anything, and there is no
attention-amber within a hundred pixels to be confused with.

### F4 — Settings live in an action row (fixed, v0.59.0)

Controls 4–6 (toggle, speed, Clear) persist across sessions and belong with
preferences. Everything else in the row acts on the current variation or session.
The panel already solved this exact problem: its preferences went behind a
cogwheel (`.clo-cog`), leaving the header to Engine/Hide.

Fixed as change #9: the three moved into `.clo-ap-menu`, a body-mounted fixed
popover, and the row keeps a single `.clo-ap-cog`. Two things the move had to
pay for:

- **the cog carries the state.** Hiding a toggle costs exactly one thing — its
  state stops being legible for free — so `.clo-ap-cog--on` takes the accent
  border and glyph, and the tooltip says "currently ON (normal)" in words,
  because a colour alone is not a state. Never a *fill*: this is still a
  setting, and a fill now means "the one thing to do next".
- **an armed "Clear?" must not be hidden between its two clicks.** Closing the
  popover — by outside press, by Escape, or by the row collapsing — disarms it.
  That is the same `disarmClear()` the module already called on re-mount.

### F5 — No grouping, and the order is initialisation order (fixed, v0.58.0)

The row was flat: no separators, no spacing changes, no labels except the
leading "Overstudy". Between modules the order was whichever `ensureUi()` ran
first (`start()` order); within them append order, which is not task order —
`cluster.append(queueBtn, button, analyse, drill)` put the free-play escape
hatch **between** the two practice launchers, and auto-play's destructive
"Clear" ended up adjacent to unrelated actions from the next module.

The leading label "Overstudy" also named only controls 2–3 while appearing to
title all ten.

Fixed per §3.2. Every cluster now carries `.clo-review-grp`, which owns the
layout, the 8px inset and the `1px #3d3a36` rule, and a block of `order`
declarations at the top of the row's stylesheet decides the sequence:
`title(0) → mistakes(1) → practice(2) → overstudy(3) → settings(4) →
status(99)`. So a module may keep appending whenever it boots and still land in
its own group, which is the actual fix — the ordering stops being a fact about
`start()`. Measured in the harness: rendered order matches, and the groups'
left edges are monotonic left-to-right (83, 165, 326, 682, 924 px).

Two smaller halves:

- the overstudy pair moved into a group of its own (it was two loose children of
  the row), and `.clo-review-grp:not(:has(> *:not([hidden])))` hides a group
  whose every child is hidden — so the pair with no variation detected takes its
  separator with it, and no module has to tell the row it has nothing to show.
  Measured: `display: none` when empty, `flex` with a 1px left border otherwise.
- within the practice cluster the order is now `drill, queue|open, analyse` —
  the drill leads, next to the mistake group it spends; Analyse, the escape
  hatch, goes last instead of splitting the two launchers.

`.clo-review-title` says **LiChessable**, matching `.clo-chapter-title`. Taking
on the collapse control is change #6 and has not been done.

### F6 — The slot that swaps is weighted backwards (fixed, v0.58.0)

`.clo-cr-open` (green outline) and `.clo-cr-queue` (filled, bold, larger) are
mutually exclusive and occupy the same slot. The **queue** button is far rarer —
it needs the user to have armed lines from the mid-quiz heads-up — yet it was
the loudest control in the extension, while the everyday launcher was an
outline. Rarity was being rewarded with weight.

Fixed by #8, as predicted: both now rest as the same green-outline button and
whichever is showing is filled by `reviewRowPrimary()`. Queued lines are still
deliberately never started on their own (section 18b), which needs the button to
be impossible to miss — and it is, but because the row named it, not because the
module shouted. Measured: `font-size`, `font-weight` and `padding` identical
across the pair (12px / 400 / 4px 10px), where the queue button used to be
13px / 600 / 6px 14px.

### F8 — Status text moved the buttons (fixed, v0.57.0)

Both status elements sat inline among the controls — auto-play's inside
`.clo-ap`, the retry pass's inside `.clo-mx` — so every message re-laid-out the
row. Measured in the harness, changing **only** the auto-play status text:

| | before |
|---|---|
| "Drill mistakes" | moved **77px across, 32px down** |
| "Retry" | moved up to **467px** as the row re-wrapped |
| Widget height | **75px → 107px** |

The last one reaches past the widget: `positionReviewPanel`, `positionChip` and
the heads-up all anchor below it, so a status message moved the Lichess panel.

Fixed by re-parenting both into a `.clo-review-status` line of the widget's own,
`order: 99; flex: 0 0 100%` — after every cluster, on a line by itself. `order`
and `flex-basis` apply to flex *items*, so this could not be done in CSS where
the elements were: they are children of the cluster spans, not of `.clo-review`.

After: **0px on both axes, at every width, and one constant widget height.**
Getting the height fully constant needed an explicit `line-height` on the status
children — the messages are emoji-prefixed (▶ ✋ 🧹 ⚠) and the differing ascents
grew and shrank the line box by 2px, which the panel below dutifully followed.

**Residual, accepted:** a status *appearing or disappearing* still changes the
widget height by one line (75 → 101px). That is a state change the user caused,
once per transition, not the per-message churn that was distracting. Reserving
the line permanently would fix it too, at the cost of an empty strip in the
common state where no status ever shows — not worth it. Revisit if the panel
below is seen to jump when a pass starts.

### F7 — Weight is inverse to discoverability (answered, v0.58.0/v0.59.0)

The repertoire picker is buried in the panel's cogwheel and needed a
`+ link a repertoire` hint added inside the panel body because, as the code
comment says, "the cogwheel is not an obvious place to look for *my
repertoire*". Meanwhile transient, self-announcing actions are filled green. The
loud things are the ones the user would have found anyway.

Answered from the other end: nothing was promoted, the loud things stopped
shouting. Four filled controls became one, chosen by role; the overstudy pair —
the row's most self-announcing item, and the one a user reaches for least —
dropped to a neutral outline and then to a single button. The repertoire picker
is untouched and its own hint stands.

Worth keeping honest about: this finding named a *symptom* of the other six
rather than a fix of its own, and the fix for the discoverability half of it is
still the panel's, not this row's.

### F9 — One intention, two buttons, one of them usually dead (fixed, v0.59.0)

Not in the original inventory; found while implementing §3.2. "This variation"
and "Previous variation" are one intention — overstudy something — split across
two controls, and the second is unavailable for the whole first variation of
every session. So the row carried a permanently-dead button in order to describe
a choice that usually is not one, and `syncButton` had to hide it (plus a
same-oid guard for in-session back-navigation, which is the *third* state that
pair could be in).

Now one **Overstudy** button. With a distinct previous variation it raises a
chooser (`.clo-os-menu`, body-mounted and fixed, placed once from the button's
rect like every other popup here); otherwise the press goes straight to the only
answer there is. The chooser is where the variation *titles* live, which the two
buttons could only ever put in a tooltip.

The row is down a control in every state, and down two whenever there is no
previous variation to offer.

### F10 — The heads-up sat in the wrong place entirely (fixed, v0.60.0)

Found in the live session of 2026-08-03, not from the code. §3.4 exempted the
mid-quiz heads-up from this hierarchy on the grounds that *"with the row down to
a chip, the panel is the only thing under the board asking for a decision, so its
two buttons have nothing to compete with"*. That is true mid-quiz. It stopped
being true in v0.37.0, when the heads-up was extended to the **browse state** so
that lines branching at the variation's final position could be offered — and in
the browse state the row is expanded and its primary is *"Review clickables (n)"*,
filled green.

Observed simultaneously on one screen, all three about the same lines:

| Surface | Control |
|---|---|
| the row | **Review clickables (2)** — filled green, the primary, amber ring |
| the heads-up | **Review on variation end** — green outline |
| the heads-up | **Review now** — green outline |

Three green controls offering a review of overlapping sets of lines, which is
exactly the condition §0 describes: each surface reasoned about itself correctly
and no one could see both at once.

Two further facts from the same screen, both worth weighing before fixing it:

- the heads-up was **overlapping the Lichess panel**, covering most of its move
  table. Both are body-mounted overlays that prefer the gutter left of the board
  (§11 for the panel, §18b for the heads-up) and neither consults the other.
  That is a placement bug independent of this finding, and it is the more
  user-visible of the two.
- the two surfaces are **not redundant**: the launcher opens every fresh line in
  the variation, the heads-up's buttons act on the one group it is showing. So
  the fix is not "hide one of them".

#### The fix (v0.60.0), and the third problem that turned out to be the real one

Raised by the author against a live Sicilian Repertoire session, and it reframes
the finding: the comment column is not merely *something the panel could have
covered instead* — it is **a spoiler that has to be covered**. A completed
variation's comment routinely ends with the whole line written out —

> If white goes for the doubled pawns:
> **7.Bxc6+! bxc6 8.O-O Bg4 9.h3 Bh5 10.d3 Rg8 11.Bf4 Qd5**

— and that is exactly the line the heads-up is offering to quiz. A panel that
offers a quiz while leaving its own answers on screen has given the game away
before the user presses anything.

This is not a new principle; it is the one section 18's *quiz* panel was built
on. `positionOverlays` has always covered `reviewCommentBox`, and the reason
recorded next to the selector is *"the lines being quizzed are printed in it in
plain sight, so leaving it visible would spoil every answer."* The heads-up
offers the same lines and was exempt from the same rule.

So `placeHeadsUp` now prefers `reviewCommentBox` — the comment's own **scroll
container**, which a live quiz does not render at all. That one fact makes the
change self-limiting and is why it needed no state test:

| | container | placement |
|---|---|---|
| live quiz | absent | **unchanged** — gutter, sized to content |
| browse | present | covers it exactly |

The column is deliberately **not** a fallback here, which is where this differs
from `positionOverlays`: that one is a quiz the user asked for and may be opened
mid-quiz ("Review now"), so it wants the same spot in both states. This one is
unsolicited, and mid-quiz there is nothing to spoil and Chessable's own
"Quiz — White to play!" prompt is worth leaving readable.

Covering the *whole* container matters: the clickable lines are usually the last
thing in a long comment, so a panel merely parked at its top would leave them
showing — which is precisely what the screenshot above shows happening.

Verified live, 2026-08-03 (course 453453, overstudy of 70382641):

| | |
|---|---|
| mid-quiz | `commentScrollContainer` **absent**; panel at `[406, 113, 300, 304]`, content-sized — unchanged |
| browse | panel `[1226, 161, 506, 385]` vs comment `[1226, 161, 506, 385]` — **pixel-identical**, `height` set inline, background `rgb(38,36,33)` opaque |
| the old spot | Lichess panel `[286, 113, 420]`, **no overlap** |

**What this does not fix.** The competition in the table above is reduced but not
resolved: in the browse state the row still shows a filled *"Review clickables
(n)"* while the heads-up shows *"Review on variation end"* and *"Review now"*.
They are now in different places rather than fighting over one, and the heads-up
covers the spoiler, so the felt problem is largely gone. If it still reads as
competition, the remaining candidates are unchanged:

1. In the browse state, drop *"Review on variation end"* — the variation has
   already ended, so the button's own name is wrong there — and keep
   *"Review now"*, which is the one thing the row's launcher cannot do.
2. If they still compete, quieten the row's launcher rather than the heads-up:
   the heads-up names a specific group and is transient, so it is the more
   informative of the two.

---

## 3. Proposed hierarchy

Four tiers, assigned by **role**, never by owning module.

| Tier | Treatment | Meaning | Rule |
|---|---|---|---|
| **Primary** | filled `#629924` | "the one thing to do next here" | **At most one per state.** Never a toggle. |
| **Secondary** | green outline | an ordinary action | any number |
| **Neutral** | `#3d3a36` outline, `#bababa` | an action away from the main task | any number |
| **Attention** | amber outline | "you have N outstanding items" | **counts and disclosure only — never launches anything** |

Plus a fifth vocabulary the design does not currently have:

| **Toggle** | pill/switch, filled only in its *track*, not the whole button | a persistent setting | must not read as a call to action |

### 3.1 The single primary, per state

Resolved against §5.

| State | Primary |
|---|---|
| Live quiz | **none** — the row is collapsed (§3.3) |
| Browse, lines queued | Review queued lines (n) |
| Browse, lines available | Review clickable(s) (n) |
| Browse, mistakes only | Retry |
| Browse, nothing pending | **none** |
| Retry pass running | Stop |

Two states now have no primary at all, and that is the point: a filled button is
a claim that there is something to do, and after a clean variation with nothing
outstanding there isn't. "This variation" loses the fill entirely — §5.1.

Where mistakes are outstanding, **Retry is primary and Drill is secondary** —
decided by the author 2026-08-03, against the first draft of this document,
which had it the other way round on the grounds that the drill is cheaper and
reversible. Cost is not the deciding question here; **completeness is.** A drill
card cannot yet show the moves *before* the mistake: `CONFIG.continuation.
drillLeadPlies` is 1, and §20's first rule plays a run-up ply only when it is the
opponent's, because a user-colour ply would be asked for by `step()` and the
drill would quiz a move the user never failed. So the drill shows the failed move
nearly cold, while Retry walks the line into it. Until the drill can replay the
moves before and between mistakes, it is the *faster* answer and not the
*better* one, and the primary belongs on the one that teaches the move in
context.

If that lands — a per-ply "auto" flag in `step()` rather than a bigger
`drillLeadPlies`, per §20 — then the drill can replace Retry outright and this
row inverts. Separate task; noted here so the reason the primary moves is on the
record.

One rule, evaluated in one place, rather than four modules each deciding it is
the important one.

**Implemented v0.58.0** as `reviewRowPrimary()`, a top-level function beside
`reviewStatusHost()`. It returns a *role* name — `'stop' | 'queue' |
'clickables' | 'retry' | null` — and each module applies `.clo-rowprimary` to
its own control in its own `sync*`, but only when that control is also showing.
Two consequences worth keeping:

- **a named control that is hidden fills nothing.** So the function needs no
  clause about our own overlays: during a quiz, drill or analysis the practice
  launchers are hidden by their own sync, `'clickables'` names nothing, and the
  row goes quiet behind the board that has the user's attention. That is the
  honest answer rather than a gap in the table.
- **the treatment is a modifier, not a base style.** `.clo-review
  .clo-rowprimary` carries its own border, padding and radius, because the
  primary can land on a control that has none — "Stop" is `.clo-mx-mini`, bare
  text. Measured: Stop as primary is a 47×24 button with a 1px border and the
  fill; Skip beside it stays 27×14 bare text. `html.clo-touch .clo-review
  .clo-rowprimary` restores the row's 10×16 tap padding, which the mini rule
  would otherwise keep at 6×8.

The inputs cross module boundaries the way everything else here does — through
null-safe bridges: `retryRunActive()`, `mistakeLogApi.pending()`, and a new
`continuationLineCounts()` returning `{lines, queued}`.

Measured across every state in the harness: **exactly one filled control**, and
zero in the two states that should have none.

Filled green in the busiest row, over the whole exercise: **4 → 1.**

### 3.2 Grouping and order

```
[LiChessable ⌄] │ [Mistakes (3)] [Retry] │ [Drill (3)] [Review clickables (2)] [Analyse] │ [Overstudy] │ [⚙]
```

**Implemented v0.58.0 (order) and v0.59.0 (the two ends).** `.clo-review-grp`
owns the layout, the 8px inset and the rule; an `order` block owns the sequence.
The overstudy pair became one button (F9) and auto-play's three controls went
behind the cog (F4/#9), so the diagram above is now literally the row.

Ordered **mistakes → practice → session**, which inverts today's layout. Per
§5.1 the overstudy pair is no longer the headline act; it moves to the end and
drops to neutral outline, keeping it available without competing. Auto-play's
toggle, speed and Clear go behind the trailing cog, as the panel's preferences
already do.

`.clo-review-title` stops saying "Overstudy" — it names two controls while
appearing to title all ten (F5). It becomes "LiChessable" (matching
`.clo-chapter-title`) and takes on a second job as the collapse control.

### 3.3 The collapsed mid-quiz row

Per §5.2 the row collapses while a quiz is live. Mid-quiz nothing in it acts on
the card being answered, and after the F2 fix nothing in it may even be pressed.

**Collapsed state** = the title chip alone, `[LiChessable ⌄]`, plus **anything
actively running**:

| Mid-quiz, collapsed | Shown | Why |
|---|---|---|
| Retry pass running | `Retry 2/3 — <title>` · Skip · Stop | the pass runs *through* live quizzes; Stop must never be a click away |
| Auto-play replaying | the status chip | it is the cancel affordance, and a replay in progress is exactly when you want it |
| Everything else | hidden behind the chevron | — |

Rules:

- **Default by state, override by hand.** Collapsed when `!reviewBrowseReady()`,
  expanded in browse; a manual toggle holds until the state flips. Not
  persisted — the sticky version means a user who collapses once loses the
  browse-state launchers for the rest of the session with no clue why.
- **The exceptions are not "peeking" the collapsed row**, they are the same
  status controls the row already shows in those states — items 7 and 10–12 of
  §1, which are already gated on exactly these conditions. So this is a
  visibility rule over existing gates, not new UI.
- **Never collapse over an armed confirm.** Auto-play's Clear and the heads-up
  "Turn off" both arm on the first click; collapsing between the two presses
  would leave a pending confirm invisible. Cheapest fix: `disarmClear()` on
  collapse, which the code already calls on re-mount.

Integration is cheap because three things measure this widget's rect and
re-anchor below it every 500 ms tick — the review panel
(`positionReviewPanel`), the alt-check chip (`positionChip`) and the heads-up
panel — so a height change propagates on its own. Worth a live check that the
panel does not visibly jump on each collapse; if it does, the anti-bounce hold
(`holdReviewPanelTop`) is the existing lever.

**Implemented v0.59.0.** It came out smaller than the estimate because the
exceptions really were a visibility rule over existing gates:

```css
.clo-review--collapsed .clo-review-grp { display: none; }
.clo-review--collapsed .clo-mx:has(> .clo-mx-mini:not([hidden])) { display: flex; }
```

That second rule reads the gates section 17 already sets — while a pass runs,
`count` and `retry` are hidden and the two minis are not, so *"this group has a
visible mini"* **is** *"a pass is running"*, with no flag to keep in step and no
module told anything new. Auto-play's status chip needs no rule at all: it lives
on `.clo-review-status`, which is not a group.

State lives in section 9 beside the label that toggles it — `collapseAuto` (what
the trainer state asks for), `collapseManual` (the user overriding it, dropped
the moment `reviewBrowseReady()` flips), never persisted. Collapsing closes the
overstudy chooser and calls the new `autoPlayCloseSettings` bridge, which shuts
the cog popover and disarms a pending "Clear?".

Measured: a collapsed row with nothing running is **29px**, against **64px**
expanded. With a retry pass running it stays 64px — the status line is a second
line either way — but eight controls come off it.

### 3.4 Out of scope: the heads-up panel

Per §5.3 the heads-up is a temporary popup, not part of this row, and its two
equal green-outline buttons stay as they are. It is also the one thing that
*does* appear mid-quiz — which the collapse makes cleaner rather than worse:
with the row down to a chip, the panel is the only thing under the board asking
for a decision, so its two buttons have nothing to compete with.

> **This reasoning is only half true, and the live session showed it — see F10.**
> It holds mid-quiz, which is the state it was written about. It does not hold
> in the browse state, where the heads-up also runs (v0.37.0) and the row is
> expanded.

---

## 4. Change list, cheapest first

| # | Change | Cost | Risk |
|---|---|---|---|
| ✅ 1 | ~~Give `.clo-ap-toggle--on` a switch treatment instead of the primary fill~~ — **done, v0.56.0** (F1) | ~10 lines CSS | landed |
| ✅ 2 | ~~Browse-gate `startRun()`, with a refusal sentence like `openDrill`'s~~ — **done, v0.56.0** (F2) | ~6 lines JS | landed, live check owed |
| ✅ 3 | ~~Drop the fill from `.clo-review-btn`; both overstudy buttons to neutral outline~~ — **done, v0.56.0** (§5.1) | ~4 lines CSS | landed |
| ✅ 4 | ~~Extract 63 hex literals into a `:root` token block~~ — **done, v0.59.0** | 16 tokens, 292 substitutions | landed; proved value-preserving |
| ✅ | ~~Status text onto its own line so it cannot move a button~~ — **done, v0.57.0** (F8) | CSS + re-parenting in two `ensureUi`s | landed |
| ✅ 5 | ~~Split amber: attention (counts) vs. a distinct colour for practice launches~~ — **done, v0.58.0** (F3) | CSS only, in the end | landed |
| ✅ 6 | ~~Collapse the row mid-quiz (§3.3)~~ — **done, v0.59.0**, and still a trial per §5.2 | 2 CSS rules + ~30 lines JS | **needs the live check below** |
| ✅ 7 | ~~Reorder into three groups with separators (§3.2)~~ — **done, v0.58.0** (F5) | `.clo-review-grp` + an `order` block; one class per cluster in JS | landed |
| ✅ 8 | ~~One `primaryControl(state)` decision, applied by all four modules~~ — **done, v0.58.0** as `reviewRowPrimary()` (F1/F6) | shared helper + one new bridge, each `sync*` consults it | landed |
| ✅ 9 | ~~Move auto-play's three controls behind a widget cog~~ — **done, v0.59.0** (F4) | popover + a cog that carries the state | landed |
| ✅ 10 | ~~One Overstudy button with a chooser instead of two buttons~~ — **done, v0.59.0** (F9) | not in the original list | landed |

**All ten are in.** #8 was where the actual gain was, and it wanted #7 done
first so there was a place to put the primary — that held: the `order` block
landed first and #8 was then a decision function plus four `classList.toggle`
calls. #6 is the only one the harness could not fully judge, since it is a
*state* change rather than a styling one, and it stays a trial per §5.2 until it
has been lived with (see the checks below).

Two came out smaller than estimated, for the same reason each time — the state
they needed already existed and only had to be *read*:

- **#5** needed no class rename. The drill launchers moved to the practice
  vocabulary that was already there, and the important-line mark moved to the
  ring `.clo-cr-queue--important` already used.
- **#6** needed no new flag. `:has(> .clo-mx-mini:not([hidden]))` reads section
  17's own gates, so "a pass is running" is derived rather than tracked.

**#4** was the one worth being careful with rather than clever: 16 tokens, 292
substitutions, applied only inside declaration values (never a selector, never a
comment). Verified by snapshotting `color`, `backgroundColor`, all four border
colours, `boxShadow`, `fill`, `stroke`, `outlineColor`, `textDecorationColor` and
`caretColor` for every element **and its `::before`/`::after`** across the whole
harness, before and after: **1711 rows, 0 differences.** A mechanical change of
this size should be proved value-preserving, not asserted to be.

---

## 5. Resolutions

Answered by the author 2026-08-03.

### 5.1 The empty browse state has no primary

"This variation" is unlikely to be pressed until the user has made a mistake —
and now that Retry exists, retrying a mistake is worth more than overstudying
the variation it came from. So the overstudy pair is not the headline act it was
when it was the only button here: it **loses the fill**, drops to neutral
outline, and moves to the end of the row (§3.2). It is not hidden — it is still
the escape hatch for "I want this line again regardless" — it simply stops
claiming to be the next thing to do.

This is the change that makes §3.1 honest. With `.clo-review-btn` unfilled, a
clean variation with nothing outstanding shows **no filled control anywhere**,
which is the correct answer to "what should I do next?" when the answer is
"nothing".

### 5.2 The mid-quiz row collapses

Confirmed: nothing in the row acts on the card being answered, so it collapses
to its title chip while a quiz is live, with the running-status exceptions in
§3.3. Marked as a trial — it is the one proposal here that changes behaviour
rather than appearance, so it is worth living with for a session before it is
settled.

Note it does **not** replace change #2: collapsed is not unreachable, since the
user can expand the row mid-quiz. Retry still needs its gate.

### 5.3 The heads-up panel is separate

It is a temporary popup, not part of the row's hierarchy — see §3.4. Its two
equal buttons stay.

---

## 6. Where this stands

Updated 2026-08-03. **Read this first when picking the work up again.**

### Landed

| Change | Version | Verified |
|---|---|---|
| `.clo-ap-toggle--on` → switch treatment, not a primary fill (F1) | 0.56.0 | harness: measured |
| `startRun()` browse-gated + returns false so the popup can say why (F2) | 0.56.0 | **syntax only — needs a live session** |
| `.clo-review-btn` pair → neutral outline (§5.1) | 0.56.0 | harness: measured |
| Status text onto its own flex line (F8) | 0.57.0 | harness: measured (0px travel, constant height) |
| Amber split three ways: outline = counts, ring = important, green = launches (F3) | 0.58.0 | harness: measured (amber-outlined controls 2 → 1) |
| `.clo-review-grp` + an `order` block; four groups, one separator rule (F5) | 0.58.0 | harness: measured (order + monotonic geometry + empty-group collapse) |
| `reviewRowPrimary()` — one filled control, decided once (F1/F6) | 0.58.0 | harness: measured (exactly 1 per state, 0 in the two that want none) |
| Auto-play's three controls behind a cog that carries the state (F4, #9) | 0.59.0 | harness: measured (state in colour, never a fill) |
| One **Overstudy** button + a chooser, instead of two buttons (F9, #10) | 0.59.0 | harness: measured (1 button, `--secondary` gone, long titles clipped) |
| The row collapses mid-quiz to its label + whatever is running (§3.3, #6) | 0.59.0 | harness: measured (29px vs 64px) — **behaviour, needs a session** |
| 16 colour tokens, 292 substitutions (#4) | 0.59.0 | harness: 1711 computed-colour rows, **0 differences** |

**Every finding is answered and every change is in.**

| | before | after |
|---|---|---|
| Filled green at once, busiest row | 4 | **1** |
| Amber-outlined controls | 2 | **1** |
| Interactive controls, busiest row | 10 | **7** |
| Interactive controls, live quiz | 7 | **0** (label only) |

Nothing here touched a gate. Every control's `hidden` logic is what it was; the
primary is only ever applied to a control already showing, and the collapse is a
`display` rule laid over those same gates.

### Live session, 2026-08-03 — course 453453, overstudy of variation 70382641

Run on the overstudy route (`/learn/<bid>/<oid>/<lid>`) deliberately: it is the
one trainer path that reschedules nothing.

**Confirmed:**

| | |
|---|---|
| Boot | `[CLO] v0.59.0`, all nine modules active, no errors |
| Collapsed mid-quiz | **107×29px**, label only, `aria-expanded="false"`, chevron at `rotate(-90deg)` — the harness predicted 29px |
| Expanded mid-quiz | `LiChessable ▾ │ Overstudy │ ⚙`, and **nothing filled** — §3.1's "live quiz → none" |
| Browse state | `LiChessable ▾ │ Review clickables (2) │ Analyse │ Overstudy │ ⚙`, 473×38, one line |
| The primary | exactly one filled control, `Review clickables (2)`, with separators on all three following groups |
| **Manual override dropped at the flip** | expanded by hand mid-quiz → completed → next quiz arrived **collapsed**. This is the §3.3 rule the harness could not construct, and it holds |
| Empty groups | the mistake group never appeared — the one logged mistake was `(overstudy)` mode, which §16 excludes from the count — and took its separator with it |
| Cog | `off` → `ON (normal)` in colour *and* tooltip; speed and Clear appear with the toggle; never a fill |
| Chooser | direct-open with one variation (`"Open overstudy for 1"`), menu with two (`Current variation` / `Previous variation` + titles); placed above the button, in viewport, **widget height unchanged at 38px** |
| Dismissal | Escape ✓, outside press ✓, and a `"n"` keydown in the menu **does not reach `document`**, so MoveTrainer2's shortcuts stay swallowed |

**The single most valuable thing the session showed** is a case the harness had
no way to produce: in the browse state the launcher rendered as

```
class="clo-cr-open clo-rowprimary clo-cr-open--important"
background: rgb(98,153,36)          ← the primary fill
box-shadow: rgb(230,180,34) 0 0 0 2px  ← the important ring
```

— fill and mark composing on one button. Under the pre-v0.58.0 rule this control
would have had `border-color: amber; color: amber` applied *over* a green fill.
That is the exact collision that motivated moving the important mark to a ring,
and it is now confirmed to be real rather than theoretical.

**Incidental, and worth keeping:** synthetic presses were classified
`observed c7c5 (trainer)`, not as genuine answers, because they carry no trusted
pointer input — so nothing was falsely recorded as proven. Auto-play's provenance
rule is doing its job under automation.

### Still owed

1. **Retry's gate** (owed since 0.56.0) and **the status line** (0.57.0). Both
   need a session with **real logged mistakes in review mode**; this one produced
   only an overstudy-mode timeout, which is correctly excluded. Mid-quiz, press
   Retry → refusal text, no navigation; from the Mistakes popup → refusal text
   *in the popup*. Then watch a pass run: no button may move as either status
   changes.
2. **`Stop` as the primary, mid-pass** — unreached here for the same reason, and
   still the one tier assignment worth arguing with. A retry pass drives *through
   live quizzes*, so a filled green button sits under the board while a card is
   being answered. If it reads badly, the fix is not to un-fill it — Stop must
   stay findable — but to give the collapsed row a quieter treatment for it.
3. **Portrait / stacked layout.** Four groups with rules between them wrap
   differently from twelve loose children, and three surfaces anchor below this
   widget. Not exercised: the session ran at 1920px.
4. **The panel below on each collapse.** 38px → 29px propagates through
   `positionReviewPanel` on the next tick. It was not visibly objectionable, but
   it was not measured across the transition either; `holdReviewPanelTop` is the
   existing lever if it jumps.
5. **F10's residue.** The placement half is fixed and measured (v0.60.0); what
   is left is whether the heads-up's two buttons still read as competing with
   the row's filled launcher now that they are no longer in the same place. That
   is a judgement, not a measurement — see the finding for the two candidates.
6. **A heads-up raised naturally in the browse state.** v0.60.0's cover was
   verified by forcing the panel's *visibility* and letting the extension's own
   `placeHeadsUp` position it — the placement is the real code against the real
   DOM, but the trigger was not. Whether the panel is raised there at all is
   racy: a group already offered mid-quiz is in `cr.hu.seen` and correctly not
   re-offered, so reproducing it takes a variation whose line branches at the
   FINAL position (the author's Sicilian screenshot is one; 453453's variation 1
   is not).

### Next

**Nothing on the change list**, and the parts of it a single session could reach
are confirmed. The collapse (#6) — the one change that alters behaviour rather
than appearance, and a trial per §5.2 — behaved correctly in every state reached,
including the manual-override drop. It is not yet *settled*: §5.2 asks for it to
be lived with, and one driven session is not that.

**F10 is fixed** (v0.60.0) and was the more interesting half of it anyway: the
heads-up now covers the comment in the browse state, because the lines it offers
to quiz are printed there. What remains of that finding is a judgement about
whether its two buttons still compete with the row's launcher — see F10.

The lesson worth keeping: this document exempted the heads-up from the hierarchy
(§3.4/§5.3) on reasoning that only covered the mid-quiz half of where it appears,
and the exemption hid a spoiler, not just a collision. **An exemption is a claim
about every state the thing appears in**, and §3.4's was written before v0.37.0
added one.
