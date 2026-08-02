# DESIGN — control inventory & visual hierarchy

Status: **partly implemented — see §6 for what landed and what is owed.**
Ground-truthed from the code 2026-08-02 (v0.55.0); every gate below is quoted
from the `sync*` function that owns it, not from prose. §1's table describes the
row **as it was before** the changes in §6 — it is the baseline the findings
argue against, not a description of today's code.

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
| 8 | Mistakes (N) | `.clo-mx-btn` | amber outline | `running \|\| !pending.length` → hidden | disclosure → popup |
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

### F1 — The strongest treatment is worn by four controls at once, one of which is not an action

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

### F3 — Amber means two different things

`.clo-mx-btn` "Mistakes (3)" and `.clo-cr-drill` "Drill mistakes (3)" are
pixel-identical: `#7a6a2e` border, `#d9a942` text, same padding, same radius,
adjacent in the row, both ending in the same number. One opens a list; the other
starts a quiz. The only thing telling them apart is the verb — and they are
placed four controls apart, so they do not even read as a pair.

Amber is *also* section 18c's "important line" colour (`--clo-cr-important`,
`#e6b422`), applied as a ring on the queue button. Three meanings, one hue.

### F4 — Settings live in an action row

Controls 4–6 (toggle, speed, Clear) persist across sessions and belong with
preferences. Everything else in the row acts on the current variation or session.
The panel already solved this exact problem: its preferences went behind a
cogwheel (`.clo-cog`), leaving the header to Engine/Hide.

### F5 — No grouping, and the order is initialisation order

The row is flat: no separators, no spacing changes, no labels except the leading
"Overstudy". Between modules the order is whichever `ensureUi()` ran first
(`start()` order); within them it is append order, which is not task order —
`cluster.append(queueBtn, button, analyse, drill)` puts the free-play escape
hatch **between** the two practice launchers, and auto-play's destructive
"Clear" ends up adjacent to unrelated actions from the next module.

The leading label "Overstudy" also now names only controls 2–3 while appearing
to title all ten.

### F6 — The slot that swaps is weighted backwards

`.clo-cr-open` (green outline) and `.clo-cr-queue` (filled, bold, larger) are
mutually exclusive and occupy the same slot. The **queue** button is far rarer —
it needs the user to have armed lines from the mid-quiz heads-up — yet it is the
loudest control in the extension, while the everyday launcher is an outline.
Rarity is being rewarded with weight.

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

### F7 — Weight is inverse to discoverability

The repertoire picker is buried in the panel's cogwheel and needed a
`+ link a repertoire` hint added inside the panel body because, as the code
comment says, "the cogwheel is not an obvious place to look for *my
repertoire*". Meanwhile transient, self-announcing actions are filled green. The
loud things are the ones the user would have found anyway.

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

### 3.2 Grouping and order

```
[LiChessable ⌄] │ [Mistakes (3)] [Retry] │ [Drill (3)] [Review clickables (2)] [Analyse] │ [This variation] [Previous] │ [⚙]
```

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

### 3.4 Out of scope: the heads-up panel

Per §5.3 the heads-up is a temporary popup, not part of this row, and its two
equal green-outline buttons stay as they are. It is also the one thing that
*does* appear mid-quiz — which the collapse makes cleaner rather than worse:
with the row down to a chip, the panel is the only thing under the board asking
for a decision, so its two buttons have nothing to compete with.

---

## 4. Change list, cheapest first

| # | Change | Cost | Risk |
|---|---|---|---|
| 1 | Give `.clo-ap-toggle--on` a switch treatment instead of the primary fill | ~10 lines CSS | none — no JS, no gates |
| 2 | Browse-gate `startRun()`, with a refusal sentence like `openDrill`'s | ~6 lines JS | low; fixes F2 |
| 3 | Drop the fill from `.clo-review-btn`; both overstudy buttons to neutral outline | ~4 lines CSS | none — §5.1 |
| 4 | Extract 63 hex literals into a `:root` token block | mechanical, ~1h | none if done by substitution |
| ✅ | ~~Status text onto its own line so it cannot move a button~~ — **done, v0.57.0** (F8) | CSS + re-parenting in two `ensureUi`s | landed |
| 5 | Split amber: attention (counts) vs. a distinct colour for practice launches | CSS + one class rename | low |
| 6 | Collapse the row mid-quiz (§3.3): title chip becomes the control, running-status exceptions | ~40 lines JS + CSS | **medium** — new state; needs the live check below |
| 7 | Reorder into three groups with separators (§3.2) | CSS (`order` / flex gaps) + fixed append order | medium — `ensureUi` appends on first run |
| 8 | One `primaryControl(state)` decision, applied by all four modules | shared helper, each `sync*` consults it | medium — the real fix for F1/F6 |
| 9 | Move auto-play's three controls behind a widget cog | new popover, mirrors `.clo-cog` | medium |

1–4 are independent, CSS-only or near enough, and safe to land in any order.
**8 is where the actual gain is**; it wants 7 done first so there is a place to
put the primary. 6 is the one change that cannot be judged from the harness —
it is a *state* change, not a styling one — so it wants a live session:
collapse/expand across a variation boundary, a retry pass running through it,
and an auto-play replay, watching that the panel below does not jump.

Suggested first landing: **1 + 2 + 3**. Two of them are the findings with real
consequences (a toggle shouting as loudly as an action; the destructive sibling
being the ungated one), and none of the three can break a gate.

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

Filled-green controls in the busiest row went **4 → 2**. The two left are Retry
and *Review queued lines*, which is F6 — fixed by change #8, not by anything
above.

### Owed: live checks

Neither JS change has been exercised against a real trainer session. Both need
an extension reload first (see CLAUDE.md, "Reloading the extension").

1. **Retry's gate.** Mid-quiz, press Retry on the widget → refusal text, no
   navigation. Mid-quiz, open the Mistakes popup and press "Retry selected" →
   refusal text *in the popup*, since the widget's own flash is behind it. Then
   in the browse state → a pass still starts normally.
2. **The status line.** Watch a retry pass run: "Retry n/m" and auto-play's
   "▶ replaying…" now share one line below the buttons, and no button should
   move as either changes. Check the Lichess panel below the widget does not
   jump when a status first appears — that is F8's accepted residual (one line,
   ~26px, on appear/disappear only) and the place it would show.

### Next

Change **#5** (split the amber) is the cheapest remaining and needs no live
session. Then **#7 → #8**: the grouping has to exist before there is a place to
put a single primary, and #8 is the change the whole document is really for.

**#6 (collapse the row mid-quiz) is a trial**, per §5.2 — behaviour, not
appearance, and the one item here the harness cannot judge. Do it when there is
a live session to live with it in, not before.
