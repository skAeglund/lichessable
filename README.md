# LiChessable

Chrome extension (Manifest V3) that injects a **Lichess Database** panel on
Chessable Explore pages (`https://www.chessable.com/explore/<number>/`) and the
Analysis board (`https://www.chessable.com/analysis/`), so you can compare
Chessable course statistics against real-world Lichess games for the current
position. On wide windows (≥ 1700px) the panel occupies the empty space to the
right of Chessable's content column; on narrower windows it falls back to
sitting beneath Chessable's move table.

On the Analysis board the panel takes over the whole column to the right of
the board (Chessable's toolbar underneath stays where it is). Chessable's own
move tree is moved *into* the panel — the top section of it is literally their
move list element, so clicking moves, the right-click menus and everything
else behave exactly as before; the Lichess data and engine lines fill the rest.
Collapsing the panel with **Hide** hands the move tree back to Chessable's own
card. The panel is always visible — deliberately
independent of the **Toggle Opening Explorer** toolbar button, which Chessable
disables in some entry states (e.g. opening the page via a `?fen=` link).

The panel header's **⚙ cogwheel** opens its settings menu: the **database
filters** the Lichess numbers are drawn from — which **time controls**
(UltraBullet … Correspondence) and which **rating bands** (0, 1000 … 2500,
the lower bounds of Lichess's own buckets) count. The defaults are
blitz-and-slower at 1600+. A change applies immediately — cached positions are
dropped and the current one refetched — and is remembered per browser, across
every place the extension queries the explorer: the panel wherever it appears
(Explore, Analysis, review, variation pages), the win-rate line in the
wrong-answer check, and the chapter sort's popularity ranking. Each dimension
keeps at least one value, since an empty one returns no games at all. The
cogwheel turns green while the filters differ from the defaults (hover it for
the current set), and a **Reset** link in the menu puts them back.

The same panel also appears in **review and learn sessions** once a variation
is **completed** and the trainer enters its browse state (stepping through the
moves, reading comments). It follows whatever position is on the board —
mainline moves, clickable subvariation moves, the initial-position dot, and
the prev/next buttons all included. It never shows during an active quiz, so
it cannot spoil an answer. Because the trainer has no FEN field, the position
is reconstructed from the DOM (see Architecture notes); the panel sits in the
empty gutter to the left of the board (falling back to below the board, under
the Overstudy widget, on narrow windows — and in portrait/mobile, where the
comments stack under the board, both the Overstudy widget and the panel drop
below the whole board+comments block, so nothing covers Chessable's own UI).
Panel and widget are placed in document coordinates, so they scroll naturally
with the page instead of chasing it — on mobile a viewport-fixed panel visibly
popped up and down on every scroll and URL-bar resize — and an upward move of
the below-the-board spot must persist ~1.2 s before it is applied, so the
trainer row collapsing for a couple of renders at a variation transition no
longer bounces the panel. Throughout a
review/learn session — quiz included, not just the browse state — the trainer
row is nudged sideways so the **board** rather than Chessable's board+comments
block sits horizontally centered, so the board never shifts as a variation
completes. The nudge is a pure CSS transform; Chessable's own layout is
untouched.

The panel also appears on any standalone **variation page**
(`https://www.chessable.com/variation/<id>/`), following the board as you step
through the moves. That page has a real (readonly) FEN field that Chessable
keeps current on every move navigation, so no DOM reconstruction is needed
there; placement works like review — the gutter left of the board, falling
back to below the whole page content (FEN row, Review box, Comments) on
narrow windows, so nothing gets covered. The quick-edit pencil (below) works
on the same page, so variation pages are now a full study surface: Lichess
stats, engine, and comment editing in one place.

It also adds an **Overstudy widget** to trainer sessions — review
(`https://www.chessable.com/practice/…`) and learn
(`https://www.chessable.com/learn/…`), which run the same trainer app with
identical markup: a small floating card centered
beneath the board (below the Exit/nav row; bottom-right corner as fallback)
with two buttons — overstudy **this variation** and overstudy
the **previous variation** (i.e. the one you most recently completed, after
the review queue advances). Each opens the variation's overstudy in a
**background tab**, so the running review session keeps focus. On
chessable.com, "overstudy" is simply the learn route
(`/learn/<course>/<variation>/…`) for an already-learned variation — exactly
where Chessable's own Overstudy buttons navigate. Because the session timer
would otherwise start running unseen, a learn session that boots in a
**hidden** tab gets its timer auto-paused (the extension clicks Chessable's
own pause control once it renders); switch to the tab and click the play
overlay to start.

Trainer sessions — review and learn alike — can also **auto-play moves you
already proved this session**
(the *Auto-play* toggle on the overstudy widget, off by default, with a
Fast/Normal/Relaxed pace select). Every move you answer correctly is recorded
against its **position** for the rest of the browser session (12 h cap); when
a later variation reaches a position you've already answered — typically the
shared prefix of the next line, but any transposition counts — the extension
plays your recorded move for you and hands control back at the first move you
have *not* proven yet. Before anything is auto-played the move is verified
against that variation's actual mainline, so an updated repertoire never gets
a wrong move replayed: on any mismatch the position is left to you (and not
retried that session). Auto-played moves count as **normal correct answers** —
the move was proven earlier this session, and Chessable schedules it as
passed. Failed or timed-out moves are never auto-played, and a move is never
auto-played the first time it appears in a session. Once you've played a move
by hand in a variation, auto-play stays out for the rest of that variation —
even if a later transposition reaches a position you've already proven —
because handing control back and forth mid-line is jarring; only a
variation's opening run ever replays. A click on the board (or on the status
chip) stops auto-play for the current variation. The **Clear** button beside
the pace select (visible while auto-play is on) throws the recorded moves for
the current course away — click it twice to confirm — so the rest of the
session behaves like a fresh one and every move has to be answered by hand
once again before it can be replayed. The proven-move record is
kept per course, evaporates when the browser closes, and is deliberately
**not** persisted across days — that would silently pass genuinely-due cards
and defeat spaced repetition. Under the **Key Moves** study setting Chessable
itself already auto-plays the non-key prefix; the feature stays enabled but
simply finds nothing to do until the first quizzed move.

The move list auto-play checks against is the trainer's own: MoveTrainer2
already holds the current variation's full line in memory before it plays the
first move, so nothing is fetched, cached or waited for.

You can also **quick-edit a move**: hover a mainline move and a small pencil
appears; its popup has two tabs. **Comment** lets you type a note and append it
as a PGN comment after that move (with the same "For this variation only"
toggle Chessable's editor has). **Alt move** registers an alternative move the
trainer should also accept in place of that move — type its notation (`Nf6`,
`Qxd5`, `O-O`), or just click a move row in the Lichess panel to fill it in.
The tab is only available on your own moves (your colour is the side at the
bottom of the board) — an alternative to an opponent move would be a misclick,
since the trainer plays those itself.
This works in two places — the completed-variation browse state during review,
and any standalone **variation page** (`/variation/<id>/`). It only shows for
courses you can edit, and it works by driving Chessable's own edit page in a
small popup window showing "Saving to Chessable…" that appears for the few
seconds the save takes and closes itself (the window has to be visible and
focused — Chrome slows hidden or covered pages down to a crawl) — see
"Quick-edit" under Architecture notes. Promotion moves aren't supported as
alternatives yet. On touch screens, where there is no hover, tapping a move
keeps the pencil on screen for a few seconds so it can be tapped.

When the trainer refuses a quiz answer (**"Incorrect"** — in a `/practice/`
review session or a `/learn/` overstudy tab alike, and on the **first** wrong
attempt, not just the one that reveals the solution), a small chip appears
under the board: **"Check Nf3 as alternative?"**. Clicking it opens a popup
that runs two local Stockfish searches to depth 20 — the position after the
**course's own move** and the position after yours — and shows the **pawn
loss versus the course move**, from the mover's point of view (a guess that
evaluates at least as well reads "As good as the course move"). Each move
also gets its **Lichess database line** — score and game count for the
current rating/speed filters, e.g. "45% · 822k" — from one cached explorer
request. An **Add alternative** button appears, coloured by the loss:
**green** below 0.2 pawns, **yellow** between 0.2 and 0.4, **red** above
0.4 — a red move can still be added, but needs a second **"Add anyway"**
click. Adding uses the same edit-page driver as the quick-edit Alt-move tab
(so the same edit-rights rules apply, probed lazily and cached per course),
with the familiar "For this variation only" checkbox; if a rights check
fails, the popup says so — close and reopen it to retry. The engine is
booted on demand — the panel's Engine toggle does not need to be on — and
released again as soon as both searches finish (it frees its memory after 5
idle minutes). Timed-out answers and promotion guesses are not offered; the
chip disappears once the line moves on past the failed move, or via its ×.

Every move you fail in a trainer session is logged, and the widget shows
**Mistakes (N)** next to the Overstudy buttons — click it for the list
(`5…Nc6 — Sicilian: Najdorf — played c5, timed out`, each with a checkbox).
**Retry** then walks those variations again, one after another, so you get a
second pass at exactly what went wrong. The retry runs as **Overstudy**, so
nothing is rescheduled — it is a plain "do those again", not an SRS operation
(Chessable's own in-session re-ask is separate; this is optional, after the
fact, and repeatable).

How much of each line you play yourself is a setting in the popup (**You
play**), and auto-play does the rest — switched on (or, for the first mode,
off) for the duration and put back the way you had it afterwards:

- **Whole variation** — every line from move 1, by hand, no auto-play; the
  runner moves on when the line is finished.
- **From the mistake** (default) — auto-play replays what you already answered
  correctly this session and hands the board over at the move you failed; the
  rest of the line is yours, and the runner moves on once the last failed move
  is answered.
- **Only the mistakes** — as above, but auto-play takes over again after each
  retried mistake, so in a line where you failed moves 8 and 12 you play those
  two moves and nothing else.

A failed move is always yours to play even if you happened to answer it
correctly later in the session (which would otherwise count as proven and get
replayed past). The progress line offers **Skip** and **Stop**; Stop restores
your auto-play setting and leaves you where you are. A move you fail *again* during the pass stays in the
list, so a second pass picks it up. Only the first variation costs a page load
— from then on the runner switches variations inside the same learn session.
Starting a pass from a **review** session leaves that session (Chrome may ask
you to confirm); you can return to the review afterwards. The list lives in
the browser session only (12 h cap), for the same reason the auto-play record
does.

When a completed variation's comment holds one or more **clickable lines**
(`5.Nb3 g6 6.Be3 Qb4+`), the widget offers **Review clickable(s)**. Chessable
prints those lines but never quizzes them — they are
comment text, not variations — so this plays them like a variation: the
opponent's moves are made for you, yours are asked for, one line after another.
(The name is deliberately not "continuations": a line branching off earlier in
the variation continues nothing. What they have in common is being clickable.)

It happens on **our own board**, laid over Chessable's: their browse board is
navigation-only and accepts no moves at all. The board uses their piece art
(cloned from the live board, so it looks like the same board), their legal-move
dots and capture rings, and is oriented the same way; moves go in by **click-then-
click or by dragging**, whichever you reach for, and clicking a piece you have
already picked up puts it down again. The **right button draws**, as on every
chess site: drag for an arrow, click a square for a circle, draw the same one
again to remove it. They are scratch marks — the next press on the board, or the
next move, wipes them. Only the square colour is
deliberately ours, so it is always obvious which board you are on.
Our panel covers the comment column while the quiz runs, for the
obvious reason that the lines are printed there — **Exit** gives Chessable its
screen back, as does Escape, finishing the last line, or the variation changing
underneath. **Hint** shows the move; two wrong tries and it appears by itself.
The pause before the opponent's replies follows the auto-play speed dropdown.

**You are left where the line ended.** When the review closes, Chessable's own
board is put on the position the line you were last playing reached — the same
click on that line's last move you would otherwise make yourself. So the Lichess
panel is already showing that position's database and engine line when the
overlays come down, instead of the position you started from. Exiting halfway
through a line lands you on the last move you were actually shown, never on moves
ahead of you; a review the trainer tore down (the variation changed underneath)
leaves the board alone.

A variation can carry continuations in two places: after its **final** position,
and branching off somewhere earlier in the line. When both are present, pressing
the button first asks which you want — **All continuations** or **Final
continuations** — since an earlier branch revisits a move you have already
answered. With only one kind there is nothing to ask and the quiz starts straight
away.

If you always want them, there is a setting: **Review clickable lines
automatically** on the options page, off by default. With it on, the review
starts by itself as soon as a variation is finished and plays every line it has —
no button, no All/Final question. It fires once per variation, so exiting a
review does not drop you straight back into it, and it stands down while a
**Retry** pass is running (that pass moves to the next variation on its own).

Lines that ask *you* to play a move the author marked **?**, **??** or **?!** are
skipped: those are there to show what to avoid, and drilling them would teach the
blunder. A marked move by your *opponent* is fine — that is the premise of a line
about how to punish it — and **!?** counts as interesting rather than bad, so it
stays.

**Lines you have already added are left out.** Chessable lets you add a clickable
line to your repertoire as a real variation (right-click on the line), and once
you have, that line gets reviewed like any other — quizzing it here as well would
drill it twice in the same session. So each line's final position is checked
against your course through Chessable's own "Find position in course" endpoint,
and the ones that are already in there are skipped: the button counts only the
rest, and its tooltip says how many were left out (the console names them, with
the variation they were found in). If the check cannot be made — signed out, a
network error — the line is kept rather than lost.

**One position, one answer.** Where a comment offers you a choice — "10...fxe6 …
or 10...dxe6 …" — neither line is quizzed: you would be shown the same board
twice and marked wrong for a move the author also recommends. Which one is your
repertoire is a decision only you can make, by editing the comment down to one
line. The same applies to a line that answers a position differently from the
variation you have just played. Lines that differ in your *opponent's* move are
untouched — that is the ordinary "and if he plays this instead" case, and both
still get quizzed.

The positions are not read off the board: each line is anchored on the trainer's
own lesson plan and replayed with the extension's move generator, so the FENs are
exact (castling and en passant included) even for lines that start mid-game.
Every move number the author printed has to match the position it would be played
from, so a line is only quizzed where it actually belongs — including a line
written inside another one, which is placed on its parent's board rather than on
the mainline. A line that cannot be placed with certainty is skipped with a
console note rather than guessed at, and so is a comment that writes several
branches as one run of moves ("10.dxe6 fxe6 11.Bd3 d5 10...dxe6 …"): it still
supplies the positions for the lines written inside it, but it is not itself a
line anyone can play through. This is practice only — nothing is rescheduled, and
nothing is recorded as proven for auto-play. See
`DESIGN-continuation-review.md`.

**Meeting a line where it starts.** The button above only appears once the
variation is over, by which point you have long left the position each line
branches off. So while you are still playing, the moment Chessable prints a
comment offering the opponent an alternative, a small panel appears next to the
board: **The opponent can also respond with:**, the branch position on a mini
board with an arrow for that move, and **Review on variation end**. Press it and
the line is queued — the panel confirms it and then takes itself away a moment
later, since it has nothing left to say and you are in the middle of a move.
Ignore it and it goes away on its own the moment you play
your next move; **×** dismisses it for that position, and the end-of-variation
button still offers everything as before.

On a **phone in portrait**, where Chessable stacks its comment column under the
board, this panel sits directly under the board while you are playing — over that
column, which says nothing but "Quiz — White to play!" at that point. Once the
variation ends and the column holds the actual comment, it moves out of the way
below everything again.

The same panel appears once more when the variation **ends**, for the lines that
carry on from the final position — those branch exactly where the variation
stops, so there is no earlier moment at which to show them. There the button
reads **Add to review queue**, and because the variation is already over, a
continuation of your *own* colour is offered too (there is nothing left to give
away).

Nothing starts on its own. When anything is queued, a filled **Review queued
lines (n)** button appears once the variation is over — being dropped into a quiz
you did not ask for is jarring, and you need a moment to add the final
continuations to the queue first. Press it when you are ready. While it is up it
*replaces* **Review clickable(s)**: having picked lines by hand you have already
said which ones you want, so the offer to play all of them is just noise. It
comes back as soon as the queue is played out, or on the next variation.

Only the **branching move** is printed — never the rest of the line. Half of it
is your own moves, and that is precisely what the review is going to ask you
for.

Mid-variation only the opponent's alternatives are raised, never one of yours: a
line starting with a move of *your* colour branches where the trainer is about to
ask *you* for a move, so showing it would hand you the answer. (At the final
position that no longer applies, hence the exception above.) Lines already in your course,
lines marked as blunders and lines with two answers are left out here for the
same reasons as above, and a line whose first move simply transposes back into
the variation is not an alternative at all.

This can get noisy if you never use it, so it is a setting: **Point out
clickable lines while playing a variation** on the extension's options page, on
by default. The panel also carries its own **Turn off** — the same setting,
reachable in the moment it is annoying you rather than in another tab. It takes
two clicks (the options page is the only way back), and turning it off changes
nothing about the end-of-variation button.

Once a variation is completed the widget also offers **Analyse**, which opens a
free-play board on the position Chessable is showing — step back through the
move list first if you want to start somewhere earlier in the line. It is the
same overlay board the clickable-line review uses (Chessable's own browse board
accepts no moves at all), but here it takes **any legal move, for either side**,
by click or by drag; right-click still draws arrows and circles. The **Lichess
Database** panel in the gutter follows *that* board rather than Chessable's, so
the database — and Stockfish, if the engine is on — describe the position you
have played into, and clicking a row in the panel plays that move on the board.

The panel over the comment column keeps the move list: click any move to jump to
it, or use **⏮ / ◀ / ▶**, the arrow keys, Home/End. Playing a move after
stepping back replaces what followed, like any analysis board. **Remove from
here** (or Backspace) throws away the move the board is standing on together
with everything after it — click the move you regret in the list, press it, and
you are back at the position before that move, ready to try something else.
**Flip** (or `F`) turns the board around. Playing here is never recorded or rescheduled, and
**Exit** (or Escape) simply takes the overlay away — Chessable's own board never
moved.

**Add as line** keeps a line you have worked out: it appends it to the comment
on the move the analysis was opened on, written the way Chessable's authors
write one — in parentheses, `(12.Be3 Rb7 13.Nc3)` — so Chessable prints it as
clickable moves, and the extension can then quiz you on it with **Review
clickable(s)**. The field above the buttons is an optional lead-in: type
`An example continuation:` and the comment gets
`An example continuation: (12.Be3 Rb7 13.Nc3)`. It is kept for the next analysis
in the same tab, and the board's single-key shortcuts (`F` to flip, the arrows)
stand down while you are typing in it — Escape steps back out of the field.
The whole move list goes in, not just the part currently on the board.

One press saves — the line under the buttons shows the exact text the whole
time, so there is nothing a confirmation would tell you that you cannot already
read. The save goes through the same Chessable edit page the comment pencil
drives (a small window opens and closes itself), and if you change your mind the
pencil's **Edit** tab opens that comment for editing. It needs edit rights on the
course, checked the first time you press it — that check opens the same kind of
window, and the save follows by itself once it comes back. The button stays greyed out when there is no move to
hang a line on — the board was on the starting position, or inside a clickable
line rather than on a move of the variation itself — and the line underneath
says which. The comment column behind the overlay still shows the old text; it
is rebuilt the next time the variation is drawn.

On a chapter's **Edit Variations** page (`/course/<course>/<chapter>/e/`) the
extension adds a **Sort by popularity** button, which reorders the whole chapter to
follow the shape of the move tree: lines that share an opening sequence end up
next to each other, and the deeper the sequence two lines share, the closer
together they sit. A line that is itself the prefix of longer lines is listed
just before them.

Where the tree branches, the order comes from the **Lichess database**: the move
your opponent plays most often comes first, so you meet the positions you are
most likely to actually face first. Branches whose move isn't in the database
fall back to listing the shortest line first, with equally deep siblings keeping
their current relative order. Lines that can't be put on a board from move 1 —
tactics, anything starting mid-game — are moved to the end of the chapter with a
warning (chapter intro cards, which have no moves at all, still lead). Every
branching point is printed to the console with each candidate's share of games.

This replaces dragging cards one at a time — the whole chapter is reordered in a
single request, and the previous order is written to the console first so an
unwanted result can be undone by hand. It queries one position per branching
point, not per variation — a real 64-variation chapter needed 29 requests
(~20 s) — results are cached across chapters and runs, and the button turns into
**Cancel** while it works. See "Chapter sort" under Architecture notes.

The panel can also run **optional local Stockfish analysis** (eval + top 3
lines in SAN) for the current position — see "Local engine (optional)" below.

Plain JS/HTML/CSS. No bundler, no npm, no frameworks, no remote code. (The
optional engine is a vendored Stockfish WASM build, downloaded manually.)

## Folder structure

```
lichessable/
├── manifest.json            Manifest V3 definition
├── background.js            Service worker: authenticated explorer fetches
│                            + engine message hub + quick-edit tab driver hub
├── content/
│   ├── lichessable.js       Panel logic (mt1 iframe) + review overstudy widget,
│   │                        quick-edit UI, review auto-play, the mistake
│   │                        log / retry runner and continuation review
│   │                        (top document)
│   ├── pagestate.js         MAIN-world reader: the trainer's own lesson plan —
│   │                        the auto-play line oracle AND each move's live quiz
│   │                        record (the mistake log's source), read-only
│   └── lichessable.css      Panel styling (namespaced under .clo-)
├── engine/
│   ├── offscreen.html       Offscreen document hosting the engine
│   ├── engine.js            UCI controller (worker lifecycle, MultiPV parsing)
│   ├── san.js               Self-contained UCI→SAN converter + move generator
│   │                        (also loaded as a content script: review auto-play
│   │                        uses it to track the board and verify moves)
│   └── vendor/              Stockfish WASM builds (full + lite) — NOT in git; see below
├── options/
│   ├── options.html         Settings page: Lichess API token entry + test
│   ├── options.js
│   └── options.css
├── icons/
│   ├── icon16.png           Simple generated placeholder icons —
│   ├── icon48.png           feel free to replace or delete them
│   └── icon128.png          (remove the "icons" block from the manifest if deleted)
└── README.md
```

## Install (load unpacked)

1. Put this folder somewhere permanent (Chrome loads it from disk every start).
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (toggle, top right).
4. Click **Load unpacked** and select the `lichessable` folder (the one
   containing `manifest.json`).
5. **Set up the Lichess API token** (required since early 2026 — Lichess
   locked the opening explorer behind authentication after DDoS attacks):
   1. On the LiChessable card in `chrome://extensions`, click **Details** →
      **Extension options**.
   2. Follow the link to create a personal access token on lichess.org
      (log in, leave **all scope checkboxes unchecked**, click Create).
   3. Copy the token (starts with `lip_`), paste it into the options page,
      click **Test** (should say "Token works ✓"), then **Save**.
6. Open an Explore page, e.g. `https://www.chessable.com/explore/287495/`,
   or the Analysis board, `https://www.chessable.com/analysis/`. The
   "Lichess Database" panel appears to the right of Chessable's content
   (or under their move table / notation area, if the window is narrower
   than 1700px).
7. After editing any file: click the ↻ reload icon on the extension's card in
   `chrome://extensions`, then reload the Chessable tab.

## Reloading the extension

Content scripts are **cached by Chrome**: after editing any file, reloading the
Chessable tab still runs the OLD code. The extension itself has to be reloaded
first. Two ways:

- **By hand** — the ↻ icon on the extension's card in `chrome://extensions`.
- **From a page / from automation** — dispatch a `clo-dev-reload` DOM event on
  any Chessable tab:

  ```js
  document.dispatchEvent(new Event('clo-dev-reload'))
  ```

  The content script relays it to the service worker, which calls
  `chrome.runtime.reload()` (that API does not exist in content scripts, hence
  the relay). Then reload the Chessable tab to pick up the new content script.

**Confirm it took effect.** The content script logs its build on startup —
`[CLO] v0.33.2 (top)` — and the options page shows the loaded version at the
bottom. Both read `chrome.runtime.getManifest()`, which reflects the build
Chrome has *in memory*, not the one on disk. If the version still shows the old
number after a reload, the reload did not happen. Bumping the version in
`manifest.json` (which every functional change does anyway) makes this an
unambiguous check.

Two things that do **not** work, both verified 2026-07-26 — don't rediscover
them:

- **`chrome://extensions` cannot be automated.** Neither CDP nor an extension
  can script a `chrome://` page, and synthetic keyboard automation of the UI is
  blocked too.
- **A reload hook on the options page never fires.** Extension pages *are*
  re-read from disk on every load, so a `location.hash` hook there looks like a
  clean lever — but an options page opened programmatically lands in a
  background tab, and Chrome defers loading those indefinitely (measured: still
  unloaded after 4 minutes, hash untouched, `last_update_time` unchanged). It
  also loops: `chrome.runtime.reload()` tears the page down, Chrome re-loads the
  tab at the same URL, and the hook fires again — a perpetually reloading
  extension injects no content scripts at all.

A caveat on the relay: it only works if the *currently loaded* extension already
contains it. If the loaded build predates it, or the content script is broken
enough not to run, the ↻ button is the only way back.

## Debugging

- All logs are prefixed `[CLO]`.
- The script runs inside the **mt1 iframe**, so in DevTools either select the
  `mt1/explore` frame in the console context dropdown, or just filter the
  console for `[CLO]` (the default "top" context still shows iframe logs in
  current Chrome, but the frame context is needed if you want to poke at the
  panel from the console).

## Architecture notes

- **Frame targeting** — the manifest injects into all `www.chessable.com`
  frames (`"all_frames": true`); iframes exit immediately unless
  `location.pathname` starts with `/mt1/explore/` or `/mt1/analysis/`
  (both pages render the same widgets inside the same mt1 iframe app).
  The **top document never exits**: it runs the lightweight review watcher
  below, because chessable.com navigates SPA-style (`pushState`) — a review
  session can be reached from any page without a load, so the script must
  already be resident.
- **Every top-document feature starts on every page** and decides whether it
  applies from the *current* URL on its own 500 ms poll (`isTrainerPath()`,
  `isVariationPath()`, the chapter-page regex). Nothing is branched on the
  path the tab happened to load with: a single tab goes home → course →
  variation page → trainer session with no load at all, so a start-up
  decision would be wrong for the rest of that tab's life. (Until v0.27.1 the
  variation page was chosen once at start-up, which is why its panel and
  pencil only appeared after a manual reload.)
- **Touch-sized UI** — on a device whose *primary* pointer is a finger, every
  widget this extension owns steps up one size: larger type in the panel,
  taller move rows (they are click-to-play targets), roomier buttons, and a
  quick-edit pencil big enough to hit. Nothing about the layout changes, so
  desktop is untouched. The switch is a single `clo-touch` class that
  `applyTouchUiClass()` puts on `<html>` in each document the script runs in;
  all the rules live in one block at the end of `lichessable.css`.
  Chrome's **Desktop site** setting deliberately hides a phone from
  `navigator.userAgent`, from the UA-CH `mobile` hint and from the viewport
  width (it forces a ~980 CSS px layout), so none of those can be used.
  Input capability is *not* spoofed, so the opening guess is
  `(pointer: coarse)` — the primary pointer, so a touchscreen laptop being
  driven with a mouse still counts as fine — and the human's own trusted
  `pointerType` corrects it for good on their first tap or click. That is the
  same ground truth `useTouchInput()` uses to pick the event flavour for
  injected moves, and it was verified on Android in Desktop site mode.
- **Trainer overstudy widget** — trainer sessions (`/practice/…` and
  `/learn/…`, which render the identical MoveTrainer2 markup) run in the
  top document (no mt1 iframe, no `#inputFEN`). The session URL
  stays **constant** for the whole session (`/practice/<course>/0/<listId>`,
  `/learn/<course>/0/<listId>`);
  the variation id never appears in it. The watcher instead polls the DOM
  every 500 ms: the active drawer row (parent of the
  `#currentStudyingVariation` marker) exposes the variation id, list id, and
  name as plain `oid`/`lid`/`title` attributes, with the panel header's
  `/variation/<id>/` title link as fallback. Current/previous variation are
  tracked from that. The widget mounts on `document.body` (never inside
  Chessable's React tree, where foreign children can crash reconciliation)
  and re-mounts if an app re-render removes it. Clicking a button builds
  `/learn/<course>/<variation>/<listId>` — the same route Chessable's own
  Overstudy buttons use — and messages the worker (`clo-open-overstudy`),
  which validates the URL shape and opens it via
  `chrome.tabs.create({ active: false })`.
- **Review-mode panel** — in the trainer's post-completion browse state
  (detected by the `practiceProgress` "Completed" block plus the
  `commentMove` move list) the panel mounts on `document.body`,
  absolutely positioned in **document coordinates** (viewport rect + scroll
  offset; never `fixed` — a fixed element anchored to scrolling content lags
  the compositor on mobile and pops on every scroll, and `setInlinePx` writes
  a style only when its value changed, so the safety-net scroll listeners are
  no-ops while the document scrolls) in the gutter left of the board — or
  beneath it (below the overstudy widget) when that gutter is narrower than
  `CONFIG.review.panelMinWidth`. When the comment column is stacked under the
  board (portrait/mobile; `stackedTrainerLayout` — the progress block sitting
  under, not beside, the board, or too little free width beside it outside
  the browse state) the overstudy widget drops below the entire trainer row
  and the panel below the widget, with width and left clamped into the
  viewport; an upward move of that anchor must persist `holdUpMs` before it
  is applied (`holdReviewPanelTop`), so the trainer row collapsing at a
  variation transition doesn't bounce the panel — while
  `centerReviewBoard()` (independent of
  the panel: it runs for the whole session) translates `.row-practice` so the
  board itself is viewport-centered, and the
  same 500 ms tick doubles as its watchdog. With no `#inputFEN` in the top
  document, the FEN is rebuilt from the DOM: piece placement from the board
  squares' `[data-piece]` divs, side to move + move number by parsing the SAN
  numbering around the currently shown move (`commentMove_shownOnBoard`, or
  `commentSubMove_shownOnBoard` when a clickable subvariation move is on the
  board; neither marker = the variation's initial position). Two deliberate
  approximations, both fine for explorer statistics: castling rights are
  inferred from king/rook standing on their home squares (over-grants after a
  piece moves away and back), and the en-passant field is always `-`. Frames
  where the board is mid-animation (a piece momentarily on two squares) are
  skipped by requiring exactly one king per side. Move rows are **not**
  clickable here — the trainer's board is not free-play.
- **Variation-page panel** — the standalone variation page
  (`/variation/<id>/`) is the panel's third host (section 11b). Also a React
  top document, so the panel body-mounts absolutely in document coordinates
  like review — but the page has a real (readonly) `#inputFEN` that Chessable
  rewrites on every move navigation (verified live), so `readFen()` takes the
  ordinary input path and none of the DOM board reconstruction runs. No
  browse-state gate: the panel shows whenever the board and FEN input exist.
  Placement reuses the review thresholds — gutter left of the board, falling
  back below the **entire page content** (`#bodyContainer`: FEN row, Review
  box, Comments) on narrow windows, since unlike the trainer this page has
  real content under the board that an overlay must not cover. A `hashchange`
  listener (move navigation rewrites `#/<move>/<side>`) supplements the
  500 ms tick. Move rows are not clickable here either.
- **Background-tab auto-pause** — a `/learn/…` session that boots while its
  document is hidden (i.e. any background tab, which is what the overstudy
  buttons create) gets its move timer paused: the script polls for the
  trainer's pause-timer footer control (`SELECTORS.trainerIconBtn` containing
  `SELECTORS.trainerPauseIcon`) and clicks it once. If the tab becomes
  visible before the control appears, it backs off. Resuming is Chessable's
  native play overlay on the board.
- **Quick-edit** — hovering a mainline move shows a pencil (a
  body-mounted singleton, never inserted into Chessable's move list) whose popup
  appends a PGN comment to the variation, edits that comment as a whole, or
  adds an alternative move the
  trainer should also accept. It runs on two host pages behind a
  small adapter: the completed-variation browse state (moves are `commentMove`
  spans; ply = index in that list; edit rights probed lazily on popup open) and the
  standalone variation page (moves live in `#theOpeningMoves`, where each move
  div's id already *is* its 0-based ply index and its class gives the colour;
  the variation id comes from the URL and edit rights are simply whether
  Chessable rendered the "Edit Variation" link, so no probe tab is needed).
  There is no JSON API for either, and several of Chessable's edit-form
  POST fields are session/CSRF-bound and opaque, so the only safe path is to
  drive Chessable's **own edit page**: the worker opens `/explore/edit/<oid>/`
  in a small focused popup window covered by a "Saving…" shield
  (`clo-quick-edit-run`; visible and focused because Chrome clamps every timer
  on hidden or occluded pages — Chessable's own boot and dialogs included — to
  ~1 s, tripling the save time; the shield swallows keystrokes so nothing
  reaches the edit page. It is *always* that popup — never a background tab,
  which would be throttled the same way; if the window can't be created the
  worker retries once letting Chrome place it, then reports the failure). The
  driver waits for the edit board to finish booting (`#inputFEN` parseable and
  stable), then clicks the
  target move by its position in `#interactivePGN` (matched by ply index, since
  the edit page renumbers each variation from move 1 while review keeps the
  source game's numbering) and verifies the board actually reached that move,
  then either appends to the "Comments After"
  textarea and sets the "For This Variation Only" checkbox, or replaces that
  textarea's contents outright (the *Edit* tab — see below), or — for an
  alternative move — runs Chessable's own add-alternative flow: click "Add New
  Alternative Move", confirm the "next move you make on the board" dialog
  (the board then steps back one move), resolve the typed SAN against the edit
  page's own `#inputFEN` with the bundled move generator, and *play* the
  alternative on the edit board with the same synthetic click recipe used
  everywhere else. Chessable itself validates the move (only a board-legal
  move reaches its handler; duplicates and the mainline move raise its own
  dialogs, whose text is relayed to the popup) and lists it under
  "Alternative Moves", which is the success signal. Either way the driver then
  clicks "Update variation" and
  confirms Chessable's SweetAlert dialog — which is what actually submits the
  full-variation form. Success is detected when the POST lands the iframe on
  `/mt1/explore/?edit=<oid>`; the worker then relays the result to the review
  tab and closes the driver window. If Chessable neither navigates nor
  complains, the driver reports the stall itself (with the text of any late
  dialog) instead of letting the job die on the worker's blind timeout, and a
  job already submitted is never handed out to a second driver — a failed POST
  reloads the edit page, and re-driving it would append the same comment
  twice. Edit rights are a per-course property,
  probed lazily: the pencil shows without knowing them, and only opening the
  popup while rights are still unknown runs the probe (one throwaway
  driver window, result cached per course per session) — the popup's Save
  button stays disabled until the probe confirms edit rights, and a course
  confirmed uneditable hides the pencil from then on. So no window ever opens
  unless you actually try to edit. The move rows themselves are read only;
  nothing in Chessable's DOM is mutated.
- **Editing an existing comment** — the popup's *Edit* tab shows the move's
  comment as Chessable actually stores it, and saving replaces it. That text
  cannot come from the review column: what is printed there is a *rendering* —
  clickable lines are figurine spans, prose is markup — so an editor filled
  from the page and saved back would rewrite the stored comment from a
  reconstruction and destroy exactly the clickable lines the continuation
  review quizzes. So opening the tab makes one extra trip to the edit page: the
  same driver window, the same move selection, but it reads the "Comments
  After" textarea and submits nothing. That read also answers the edit-rights
  question, so it replaces the rights probe instead of queueing behind it, and
  its result is cached per move for the session (dropped again whenever a save
  lands on that move). The save then carries both the new text *and* the text
  the box was filled from, and the driver refuses to write if the stored
  comment no longer matches the latter — the read and the write are separate
  visits, and quietly overwriting a comment that changed in between is the one
  way this feature could lose work. Clearing the box deletes the comment, so
  Save asks a second time first. Only "Comments After" is reachable this way;
  a comment attached *before* a move is a different field on Chessable's form.
- **Review auto-play** — runs entirely in the top document alongside the
  overstudy watcher. A `MutationObserver` on the trainer board coalesces
  mutations per animation frame into placement snapshots (the same
  `[data-piece]` reads the review panel uses); consecutive snapshots are
  diffed by asking the bundled move generator (`engine/san.js`, loaded as a
  content script) for the unique legal move that produces the new placement —
  castling, en passant and promotions all come out of the same comparison,
  and the resulting position object is the authoritative game state (true
  castling rights, side to move, ply count; the student's colour comes from
  the board orientation). Moves are classified by colour and provenance:
  opponent-colour ⇒ the trainer's; user-colour injected by us ⇒ bookkeeping;
  user-colour with recent *trusted* pointer input on the board ⇒ a genuine
  answer, recorded once the opponent replies or the variation completes
  (vetoed if the move notification reads "Incorrect"/"Time's up");
  user-colour with no pointer input ⇒ trainer-played (solution replays,
  Key-Moves prefixes) and never recorded. The record lives in
  `chrome.storage.session` keyed on placement+side+castling per course, so
  transpositions hit and nothing survives a browser restart. Before any
  auto-play the recorded move is checked against the variation's mainline,
  supplied by the **line oracle**: MoveTrainer2's own `lessonPlan`, which
  carries each ply's SAN and full source FEN and is already in memory before
  the variation's first move animates. React fibers are page-world state, so
  `content/pagestate.js` — the extension's only MAIN-world script, read-only
  and matched by shape rather than by minified component names — hands it to
  the content script over a `CustomEvent` pair. Nothing is fetched or cached.
  Any mismatch, unreadable plan,
  promotion, lost board tracking or unaccepted drag degrades to manual play —
  never a blind move. The move is **clicked** — one synthetic press on the
  source square and one on the target, back to back — only after the board has
  sat quiet long enough that Chessable's own auto-plays can't race it, and
  paused whenever the tab is hidden. Clicking rather than dragging is what
  makes a replayed move look like one the trainer played: Chessable animates
  click-moves, gliding the piece across with the same tween it uses for its own
  replies, while a drag would redraw the board instantly. Sending both presses
  in one go also means the selection — the grey pickup tint and the legal-move
  dots — never gets a frame to appear. The speed setting controls two waits:
  the pause before each replayed move (*Normal* is tuned to the ~480 ms the
  trainer itself waits before answering) and the longer quiet period required
  before the first move of a variation, while Chessable may still be setting
  the position up. The rest of the cycle belongs to Chessable — roughly 440 ms
  for the move to animate onto the board and 480 ms for its reply — so a
  replayed move takes about a second end to end even on *Fast*. Both waits are
  measured from the moment the board actually changed, not from the moment the
  extension gets round to looking at it: on a phone, where the board mutation,
  the animation frame and the timer callback each land later than they do on a
  desktop, timing them from the change is what keeps every replay the same
  length instead of occasionally a second longer.
- **Wrong-guess alt check** — section 15 in `content/lichessable.js`, built
  almost entirely from parts that already existed. The *capture* has two
  paths. The primary one is pointer-based: a refused move usually never
  reaches the board DOM at all (review mode — and every learn attempt before
  the final one — animates the piece straight back without committing it), so
  there is nothing for the board observer to see. Instead, the tracker keeps
  the last few board squares touched by trusted pointer input, and while the
  "Incorrect" notification is showing with the user still to move, the last
  two distinct squares are the refused move — validated for legality against
  the line oracle, which filters out deselection clicks. The second path is
  the original snap-back hook, for a move that *was* committed and then
  retracted (a learn session's final attempt); it finds the pre-guess
  position by the pending record's own key, so it survives the trainer
  rewinding more than one ply. Both paths land in the same capture routine
  and dedupe per position + move. The tracker (like every trainer feature)
  runs on `/practice/` and `/learn/` alike — both routes render the identical
  MoveTrainer2 markup. The
  refused move is located in the line oracle by placement + side, which yields
  the plan's exact pre-move FEN (real castling/en-passant — the tracker's own
  reconstruction is approximate), the ply index the edit driver needs, the
  mainline move at that ply, and the position *after* the mainline move — the
  comparison target. The *check* runs two engine searches (course move's
  position, then the guess's) through the
  normal offscreen hub, tagged with a `reqId` that `engine.js` echoes on that
  search's updates (UCI info lines carry no request id, so the tag is the only
  per-request correlation; panel updates stay untagged and unchanged) and
  capped with a per-request `depth` — the search then ends itself at depth 20
  and its `done` flag is the completion signal. `state.altCheckBusy` makes the
  panel's `syncEngine` stand down while the check owns the engine; the engine
  is booted on demand regardless of the panel toggle and given back the moment
  both evals are in. Both scores arrive White-normalized; the verdict converts
  them to the mover's perspective and maps mates near ±100 pawns minus the
  mate distance, so missing a mate reads red while a slower mate stays green.
  The win-rate line comes from a single explorer request for the quiz
  position with a deeper move limit than the panel's (a refused move is often
  too rare for the top 20), cached separately. The *add* is the quick-edit
  alt-move job, byte-compatible — the alt-check
  popup only fills in what the quick-edit popup would have (mainline
  SAN/colour/ply index, the guess's SAN, the scope checkbox), and shares its
  per-course edit-rights cache and lazy probe through `quickEditApi` — though
  the popup starts at most one probe per open, and a failed probe shows a
  "close and reopen to retry" error instead of silently probing again.
- **Mistake log** — section 16. MoveTrainer2 keeps a live per-move quiz record
  for the session it is running: every *user* ply of the lesson plan carries a
  `progress` object whose `quizIncorrectAttempts` array holds the SAN actually
  played, or the literal `"timeUp"`, once per failed attempt. That is the
  mistake list itself — no DOM reconstruction, no engine, no request — and
  `content/pagestate.js` already reads that plan for auto-play, so the log just
  samples the same read (~1/s) and upserts an entry whenever a move's attempt
  count grows. Entries are keyed on the trainer's own `mid` (the move's index
  among the user's moves in the variation — the same id Chessable's
  difficult-moves data calls `moveId`) and stored per course in
  `chrome.storage.session` with the auto-play record's 12 h TTL. The counters
  are per-lesson rather than lifetime, so a move failed again in a later
  session reads as growth from zero and re-arms its entry while keeping the
  mode it was first logged in. Mistakes made *during* an overstudy are logged
  under a mode the count ignores, or a retry pass would keep refilling its own
  queue — "during an overstudy" means a `/learn/` session, not Chessable's own
  per-move `startedAsOverstudy` flag, which is also set for a not-yet-due card
  inside an ordinary `/practice/` review and used to hide those failures from
  the list. Writes merge rather than overwrite, since every tab shares that
  storage area. One accepted race: a variation completed and skipped inside one
  sampling interval can lose its last ply's record, because the plan swaps to
  the next variation ~90 ms before its first move animates.
- **Retry runner** — section 17. A pass is a queue of one item per *variation*
  (targeting the last failed move of the line, so the earlier ones are met on
  the way) held in `chrome.storage.session`, because the first switch is a real
  navigation that destroys the document — the next one adopts the pass. Only
  that first switch costs a load: inside a `/learn/` session an untrusted
  `.click()` on a drawer row (`SELECTORS.reviewDrawerRow`, which carries
  `oid`/`lid`/`title`) switches the trainer to any variation of the course
  in-session. **Never in a `/practice/` session** — a drawer click there starts
  a real review and would change scheduling, so from a review session the
  runner navigates out to the `/learn/` URL instead. A variation the trainer
  has already *completed* is the one case a click cannot solve (its drawer row
  is the active one), so a pass that starts on the variation the previous one
  ended on reloads that overstudy URL instead. Because that storage area
  is profile-wide, a run is *owned* by one document at a time (random id +
  heartbeat); a navigating document hands over by nulling the owner, a quiet
  owner can be taken over by another trainer tab of the same course, and the
  owner ends its own pass on `pagehide`, on leaving the trainer inside the SPA,
  or — as a backstop for a tab that died — when nobody has beaten on the record
  for ten minutes. Ending a pass always restores the auto-play setting it
  borrowed. A variation is done when the failed move's `quizCorrectTotal` grows
  past the value read on arrival (a baseline, not a zero test — a seeded
  counter would otherwise race the whole queue through) or when the variation
  completes, which is also how a move the user keeps failing releases the pass.
  Auto-play is told to hold on the failed positions (`autoPlaySetHold`,
  compared on placement + side): a move failed early and answered correctly
  later in the session *is* proven, and replaying it would skip the very move
  the retry exists for. The same bridge carries the replay mode: **Only the
  mistakes** lifts auto-play's rule that a variation belongs to the user for
  good once they have played one move in it (`vs.handedOver`) — that rule
  exists because jumping back in mid-line is jarring, which is exactly what
  this mode asks for — and **Whole variation** forces the toggle *off* instead
  of on and waits for the line to complete. The lift is scoped to the
  variation a pass is driving, so ordinary sessions behave as before.
- **Continuation review** — section 18. Chessable's browse board is
  **navigation-only**: verified live that the extension's own click-click move
  recipe changes nothing on it, on any square pair, so the quiz cannot happen
  there and moving their React-rendered pieces ourselves is out of the question.
  Instead two body-mounted overlays, absolute in document coordinates like every
  other widget here: our board pinned over theirs (64 of our square divs, pieces
  cloned off their live `<svg>` nodes — no vendored art and no `innerHTML` — with
  percentage geometry so a resize needs no JS) and our panel covering the comment
  column, which is not decoration but the whole quiz: the lines are printed
  there. The lines come from the `commentSubMove` spans, grouped by the id prefix
  (`7.0.0` … `7.0.3`) **scoped by the attach ply** — the ids alone are not
  unique, because every comment block restarts the numbering, so a variation
  with three commented moves prints `0.0.0`, `0.0.1` three times over. Grouping
  on the id alone welded three separate lines into one 8-move line that fitted
  nowhere and dropped the lot, which broke this button for any variation with
  more than one commented move (found and fixed while debugging the heads-up).
  The **id nesting is not semantic** either — ground-truthed
  live, a second line came out nested under the first line's last move while
  branching from the mainline like the first. So the id yields the grouping and
  the mainline attach ply only; the branch position is derived by trying the
  position after that ply, then instead of it, then the parent line's, then the
  rest of the mainline, and accepting one only when the printed move number
  matches its side/fullmove *and* every SAN in the line resolves legally
  (CloSan). The mainline positions are the lesson plan's own exact `sourceFen`s —
  the oracle still answers in the browse state — so this needed no board reading
  and no FEN approximation; both lines of the test comment reproduced Chessable's
  own board square for square. A line that fits nowhere is dropped with a console
  line. While a quiz runs the review panel stands down (`continuationActive`),
  since its FEN would describe the board we are covering, and keys are swallowed
  on `document` in capture phase — MoveTrainer2's single-key shortcuts ("n" =
  next variation) ignore focus and one keypress would end the quiz. A refused
  move needs no rollback: our position only advances on the right one.
  Closing a review the user ended (finished, **Exit**, Escape) leaves
  Chessable's board on the position that line reached, by pressing its last
  played `commentSubMove` span with the same pointer+mouse recipe the board
  squares get — ground-truthed live that a bare `.click()` on such a span does
  nothing at all. The span is found by matching the line's SAN sequence against
  the freshly grouped spans rather than by a stored element, since a queued line
  came from the plan and never had one. `cr.plyIdx` caps how far it goes, so an
  early exit never navigates past what the user saw, and a teardown the trainer
  forced (variation changed, browse state gone) navigates nothing.
  **Auto-start** (`cloAutoReviewClickables`, opt-in) fires `beginRun(freshLines())`
  from the tick once the lines are ready, skipping launcher and picker; it is
  armed once per variation (`cr.autoRan`, also set by any manual run) and stands
  down while `retryRunActive()` — a retry pass navigates by itself and would tear
  the quiz down a moment after it opened.
- **Mid-quiz heads-up** — section 18b, the second way into the same review. It
  runs in the state the launcher cannot: outside the browse gates, while the
  quiz is live. **Its lines come from the lesson plan, not the DOM** —
  ground-truthed by playing a variation through with a MutationObserver
  watching, a quiz renders no `commentMove`, no `commentSubMove` and not even a
  `commentScrollContainer`; the comment column says "Quiz — Black to play!" and
  nothing else, and everything the browse scanner reads is created only once the
  variation completes. Each ply's `comment` is a JSON string the plan already
  carries (`{before, after, data:[{key:'V', val:[{key:'S', val:'5.Nb3'}, …]}]}`
  — `V` a line, `S` a clickable move, `C` prose, a `V` inside a `V` the same
  nesting the DOM ids spell out), so this gives the grouping, the nesting, the
  branch index *and* the exact positions the comment hangs between, which the
  DOM never had. Anchoring is the same discipline as the browse scan: `after`
  first, then `before`, accepted only when every printed move number matches and
  every SAN is legal. Three rules keep it honest. Only lines whose **first move
  is the opponent's** are raised — a line starting with a move of the user's
  colour branches where the trainer is about to ask them for one, so it would be
  a spoiler (and it is why the wording is "the opponent can also respond with")
  — except at the **final** position, where the variation is over and there is
  nothing left to give away, so the panel runs in the browse state too and
  offers continuations of either colour (`startPly < finalPly` is the whole
  test). Only lines anchored on a **mainline** position are raised, since a line
  anchored inside another comment line branches from a position the user never
  plays through. And the clock is the plan's own `fen` located in its
  `sourceFen`s — **never** the board, which can hold a stale duplicate piece
  (seen live: a knight on b8 *and* c6 after a rolled-back wrong answer) long
  after any animation, defeating the one-king-per-side check and stopping the
  clock dead. A line branching at ply *k* goes up when the trainer reaches ply
  *k* and comes down at *k+2*: the opponent's reply leaves it standing, the
  user's own next move takes it away. The mini board reuses the quiz board's
  grid, cloned piece SVGs and arrow shapes wholesale (`fillGrid`, `makePiece`,
  `shapeArrow`), so the two can never drift apart. **The queue holds the
  resolved lines themselves**, and `openArmed` hands those objects straight to
  `beginRun` — driven by the **Review queued lines** button, never by the tick,
  so nothing starts on its own and the final continuations can be added first;
  `beginRun` then clears the queue whichever way the run began. It
  used to store only their names and look them up again in the browse scanner's
  own list, which let a line be offered mid-quiz and then withdrawn at the end
  ("no longer offered") — the two readers are allowed to differ (wider anchor
  set, DOM-counted attach ply, `comment_before` blocks), and any of those can
  land the same line on a different start position. Nothing about a queued line
  needs re-deriving: it was resolved against the plan's exact positions and
  every condition was applied before it was raised. Unlike the quiz panel this one does **not**
  swallow keys — the user is still playing on Chessable's board and needs their
  shortcuts — so its buttons blur themselves after a press instead. Only the
  line's FIRST ply is ever printed: the rest is the quiz's own answer. Setting:
  `cloLineHeadsUp` in `chrome.storage.local`, opt-out (absent means on), with
  the options-page checkbox and the panel's own two-click **Turn off** writing
  the same key — the `storage.onChanged` listener is what keeps every open
  trainer tab in step. Queueing a line hides the panel after
  `headsUpQueuedHideMs`; the group is already in `seen`, so the tick does not
  raise it again. Placement is the usual gutter-left, else below the board — but
  in a **stacked** layout (portrait) while the quiz is live it stops at the
  board's own footer instead of clearing the overstudy widget and the whole
  trainer row, i.e. it covers the comment column, which at that moment holds
  nothing but "Quiz — White to play!". In the browse state that column holds the
  comment itself, so the old placement stands.
- **Analysis board** — section 19, a second *mode* of the section-18 overlays
  rather than a board of its own: `cr.mode` flips three input gates (which
  colour may move, and whether a move is checked against a line or simply
  played) and the panel's contents; everything else — the grid, the drag layer,
  the promotion picker, the arrows, the positioning, the teardown — is the quiz
  code unchanged. Free play needs a position of its own, so moves are kept as
  one line of `{uci, san, fen}` with the FEN from `fenAfterUci` (exact castling,
  en passant and halfmove clock); playing a move after stepping back truncates
  the rest, and `anRemoveFrom` (**Remove from here**, Backspace) truncates
  without playing anything — it drops the move at `cr.an.idx` and everything
  after it, then `anGoto`s to the position before it, so one call repaints the
  board, re-renders the list and refreshes the database panel. **The panel follows our board** through a second null-safe bridge,
  `continuationAnalysisFen`: `readFen()` returns it when it is non-null and
  `reviewPanelTick` skips its usual stand-down, so the database, the opening
  name and the engine all key off our position with no other change — and a
  click on a database row plays that move here (the row carries no
  `dataset.uci` in a review document, so the SAN is resolved against our
  position with `sanToUci`). The starting position is `readReviewFen()`, so it
  inherits that function's two approximations (castling by home squares, en
  passant always "-"); every position after it is exact. Board orientation moved
  from `cr.userColor` to `cr.view` so **Flip** cannot change what a quiz asks
  for. Playing writes nothing — no proofs, no rescheduling — and Chessable's own
  board is never touched, so leaving is just hiding the overlays.
- **Add as line** — the analysis board's one write, and an ordinary quick-edit
  `save` job (section 12) with no change to the driver: the line is rendered as
  numbered SAN from its own start position (`analysisLinePgn`, ellipsis form
  when Black moves first), wrapped in **parentheses** and given the user's
  optional lead-in (`analysisCommentText`; the separating space is added only
  when the typed text does not end in one), then appended to the comment of the
  move the board was showing when the analysis opened. The lead-in lives on
  `cr.addPrefix`, outside `cr.an`, so it survives closing one analysis and
  opening the next; its field is exempted from the panel's own single-key
  shortcuts, or an "f" typed into it would flip the board. That move is read *before* the overlays go
  up (`analysisEntryMove` → `reviewMoveDescriptor`, whose ply index maps 1:1
  onto the edit page) and refused outright when a **sub**-move was shown: the
  board is then inside a comment line, so the positions our moves continue from
  are not the ones a mainline comment hangs at. Every refusal carries a sentence
  for the panel — a greyed-out button with no reason is the one outcome the user
  cannot act on. Rights come from `quickEditApi` (the shared per-course cache
  and its lazy probe), probed on the first press rather than on open, because a
  probe opens a focused driver window; the press that triggered a probe is
  carried out by `onAnalysisQuickEditResult` once rights come back, unless the
  text has changed in the meantime. ONE press saves — the status line carries
  `analysisPreview()` (the exact text) whenever the button is idle, so the
  preview a confirming press would have shown is on screen before it is pressed.
  Both the probe and the save get
  a local watchdog — the worker's job timer does not survive an idle restart,
  and quick-edit's own probe watchdog only unsticks its own popup. Results
  arrive on the shared `clo-quick-edit-result` message, which all three modules
  listen to and each ignores what is not theirs (ours: `save` mode, matching
  `oid` + `plyIndex`).
- **Selectors** — every Chessable selector (`#inputFEN`, `#nextMovesBit`,
  `.nextMovesTable`, `.nextMovesContainer`, `.chessboard-63f37`) is
  centralized in the `SELECTORS` object at the top of `lichessable.js`.
  If Chessable changes their markup, edit only that object.
- **Boot** — waits for the async app via MutationObserver + a 250 ms fallback
  poll, with a 25 s timeout.
- **Position detection** — three overlapping mechanisms, debounced by 300 ms:
  `input`/`change` events on `#inputFEN`, mutations of the `#nextMovesBit`
  tbody, and a 500 ms poll of the input's value (the value is written
  programmatically without events).
- **Self-healing** — the same 500 ms poll re-mounts the panel and re-attaches
  listeners/observers if the app re-renders its DOM (SPA-style navigation
  between explore pages). All re-attachment is idempotent, so there are never
  duplicate panels or leaked observers.
- **Click to play** — clicking a move row plays that move on Chessable's
  board, by simulating click-click input (a full pointer/mouse press sequence
  on the source square, then the destination square — squares carry
  orientation-independent ids like `e4-<uuid>`). Chessable handles it exactly
  like a user move, and the resulting FEN change triggers the panel's normal
  refresh. Promotion moves open Chessable's own promotion picker; pick the
  piece there. When the board is being TAPPED (an Android phone/tablet,
  including Chrome's "Desktop site" mode) the same helper instead replays a
  real finger tap — pointer(touch) + touch events + the compatibility click —
  since the board's live handlers there are the touch ones and a mouse-only
  sequence reaches nothing. Which flavour is used comes from the human's own
  trusted pointer events (`pointerType`), NOT from `navigator.maxTouchPoints`:
  a touchscreen laptop is touch-capable while being driven with a mouse, and
  tapping such a board leaves the trainer with a stale selection (the piece of
  the last injected move then cannot be picked up). Before any pointer event is
  seen the fallback is "touch points but no fine pointer at all". The move
  injection used by auto-play shares this helper, so it works on mobile too.
- **Stale responses** — each fetch carries a sequence number; responses for
  positions you've already left are not rendered (though still cached).
- **Toggle** — Hide/Show collapses the panel body (header stays so you can
  re-open it); the choice persists in `chrome.storage.local` under
  `lichessableHidden`.

### Chapter sort

The **Sort by popularity** button (section 14 in `content/lichessable.js`) is the
only part of the extension that calls Chessable's own JSON API. Notes worth
keeping:

- **Drag-and-drop is not what saves an order.** Dragging a card only dispatches
  a local React/Redux array splice; the order is persisted by `POST
  /api/v1/saveOrder` with `{bid, lid, order}`, where `order` is the chapter's
  complete list of variation ids. So one request replaces the entire ordering.
- **The complete list is mandatory.** `saveOrder` does *not* leave omitted ids
  alone — it resets them to order 0, which sinks them to the *front* of the
  chapter sorted by id. A partial call therefore scrambles everything you left
  out. The code refuses to POST anything that is not a permutation of the ids it
  just read. (Soft-deleted variations are excluded from the read and so do get
  reset; they are invisible in the UI, so this is accepted.)
- **Auth is the page's own session JWT** (`localStorage`, sent as a Bearer
  token). The request is same-origin with the page, so it needs no host
  permission, and — unlike the variation *edit* form that the quick-edit feature
  has to drive through a real tab — no CSRF field is involved.
- **The ordering** builds a trie of all the chapter's lines and walks it in
  pre-order. Lines are read from the API's PGN-ish `moves` string and tokenised
  into `{san, ply}` pairs with an *absolute* ply index, so a tactic that starts
  at move 25 can never share a node with an opening line that repeats the same
  SAN. At each node the variations that end there are emitted first (they are
  shorter than anything continuing past them), then the child branches — ordered
  by Lichess popularity, falling back to the shortest line each contains, with
  ties keeping their existing relative order.
- The button is mounted on `document.body` and only *anchored* to Chessable's
  toolbar row (preferred spot: the empty gutter left of the content column,
  fixed-corner fallback on narrow windows) — the same rule as the review
  widget: nothing of ours goes inside their React tree.
- The page is reloaded after a successful save, because Chessable's own React
  state knows nothing about the change.

**How this differs from Chessable's own "Logical order"** (the *Order By*
dropdown, `POST /v1/applyLogicalOrder` with `mode: "orderOnly"`). Both produce a
tree-grouped list; the difference is the **branch order**. Theirs depends on the
order the chapter was already in — the same chapter run from its original vs. its
reversed order gives two different results (from reversed, the whole `1.h3` group
led and the deep `1.e4` lines came out longest-first). It clusters lines into
branches but largely keeps whatever relative branch order was already there, so
it carries an arbitrary starting order straight through. This feature decides the
branch order from real game frequency instead, which is information Chessable's
option has no notion of. (Both are deterministic and idempotent for a *fixed*
input.)

Notes on the popularity ranking itself:

- **Positions are computed, not fetched.** `editVariations` returns SAN text
  with no FEN, so each line is replayed from the start position with `CloSan`
  (SAN is matched by generating the legal moves and comparing their SAN, with
  `+`/`#` stripped on both sides, since Chessable and CloSan don't always agree
  on writing check). A line is fully replayed *before* anything is inserted into
  the tree, so an unplayable line can never leave half of itself behind.
- **One request per branching point**, not per variation or per position — a
  531-node tree over 64 variations has only 29 branching points. Results are
  cached in `chrome.storage.local` keyed by FEN plus the rating/speed filters,
  so chapters of one repertoire share their early positions.
- **Same filters as the panel** (whatever ratings and speeds are set in its
  settings menu), so the ordering agrees with the numbers the Lichess Database
  panel shows you.
- **The scope assumption:** in a repertoire, every branching point is a position
  where the *opponent* chooses — you don't prepare two answers to one position —
  so no side detection is done. Where `course.color` makes it knowable, branches
  that are actually *your* move are flagged in the console report and counted in
  a warning, since ranking your own alternatives by crowd frequency is
  meaningless.
- **Unrankable lines** (tactics, mid-game starts, anything that fails replay) are
  parked at the end of the chapter in their existing order. Move-less
  informational cards are *not* in that group — they lead.
- The result is **not stable over time**: the database shifts, so re-running the
  sort months later can produce a slightly different order.

## Local engine (optional)

An **Engine** button in the panel header (all three modes: Explore, Analysis,
review browse) toggles local Stockfish analysis of the current position:
evaluation, search depth, and the top 3 lines (MultiPV 3) in SAN. Off by
default; the choice persists across sessions and tabs.

**Setup (one-time):** the engine binaries are not in the repo. From
<https://github.com/nmrugg/stockfish.js/releases/tag/v18.0.0> download the
multi-threaded NNUE build pair(s) you want into `engine/vendor/` (keep the
filenames — the loader derives each `.wasm` path from its `.js` name), then
reload the extension:

- **Full** (108 MB, the pair with **no** `lite`/`single`/`asm` suffix) —
  used on desktop-class machines:
  - <https://github.com/nmrugg/stockfish.js/releases/download/v18.0.0/stockfish-18.js>
  - <https://github.com/nmrugg/stockfish.js/releases/download/v18.0.0/stockfish-18.wasm>
- **Lite** (~7 MB, smaller NNUE net) — used on low-power devices:
  - <https://github.com/nmrugg/stockfish.js/releases/download/v18.0.0/stockfish-18-lite.js>
  - <https://github.com/nmrugg/stockfish.js/releases/download/v18.0.0/stockfish-18-lite.wasm>

**Which build runs:** each analyze request carries a profile computed in the
content script. By default (**Auto** on the options page) a low-power device —
`navigator.userAgentData.mobile`, ≤ 4 GB `deviceMemory`, or ≤ 4
`hardwareConcurrency` — gets the lite profile, everything else the full one;
the options page's **Engine build** setting (Auto / Full / Lite) overrides the
detection, taking effect immediately, mid-search included. If the selected
build's files are missing from `engine/vendor/` the panel says so ("… engine
files missing — see README") and the status error names the exact file — there
is deliberately **no silent fallback** to the other build.

**How it runs:** the engine loads in an MV3 *offscreen document*
(`engine/offscreen.html`) — the only extension context that can both run WASM
(`wasm-unsafe-eval` CSP) and get `SharedArrayBuffer` for the multi-threaded
pthread build (via the manifest's COOP/COEP keys). The service worker is the
message hub: content scripts request analysis (`clo-engine-analyze`), the
offscreen engine streams throttled updates back, and the worker relays them to
the requesting tab/frame (offscreen documents cannot message content scripts
directly). Search sizing comes from the `PROFILES` table at the top of
`engine/engine.js`: both profiles self-terminate at a fixed depth (CPUs idle
after) — the desktop profile runs `go depth 30` with the full build at
4 threads / 64 MB hash, the mobile profile `go depth 25` with the lite build
at 2 threads / 16 MB hash
(MultiPV 3 in both; a profile's `movetime` can additionally cap the search
wall-clock, currently unused). Scores are always shown from White's
perspective.

**Resource notes:** expect roughly 250–400 MB of memory while the full engine
is enabled, roughly 60–120 MB for the lite profile (check Chrome's task
manager, Shift+Esc). Turning the toggle off
closes the offscreen document and frees it immediately; an idle engine also
self-closes after 5 minutes. The search stops automatically when the tab is
hidden, the panel is collapsed, or a review session leaves its browse state.
If the multi-threaded build fails to start (a clear `[CLO]` error appears in
the offscreen console: `chrome://extensions` → LiChessable → *Inspect views:
offscreen.html*), drop in the `-single` build pair from the same release as a
fallback — same protocol, one thread, no SharedArrayBuffer requirement.

## Data source (Lichess opening explorer)

The extension calls `https://explorer.lichess.org/lichess` — note **.org**:
the old `explorer.lichess.ovh` host now returns 401. Since early 2026 the
explorer requires authentication (any personal access token, no scopes),
after Lichess was unable to defend anonymous requests against DDoS.

**How auth works here:** the content script builds the request URL and sends
it to the background service worker (`background.js`), which attaches
`Authorization: Bearer <token>` and performs the fetch. The worker's
`host_permissions` entry makes its fetches CORS-exempt, so no preflight
concerns; the token itself never enters the Chessable page context. The token
is stored in `chrome.storage.local` (key `lichessToken`) and is entered/tested
on the extension's options page.

Query defaults (all in `CONFIG.lichess` at the top of the content script):

- **Ratings:** 1600+ (Lichess buckets 1600, 1800, 2000, 2200, 2500)
- **Speeds:** blitz, rapid, classical, correspondence ("blitz and slower")
- **Moves:** up to 20 candidates; `topGames`/`recentGames` are 0 to keep
  payloads small.
- Ratings and speeds are the two the **user can change**, in the panel's
  settings menu (the header cogwheel). `CONFIG.lichess.defaultSpeeds` /
  `defaultRatings` are only the starting point; the live values are the module
  -level `lichessFilters` object, which every explorer request reads. They are
  persisted in `chrome.storage.local` under `cloLichessFilters` and re-applied
  from `chrome.storage.onChanged` in every document — the panel runs in the
  mt1 iframe on Explore/Analysis but in the top document during review, so a
  change made in one has to reach the other through storage anyway. Values the
  explorer doesn't know are dropped on read, and a dimension can never end up
  empty (it would return nothing at all): an unusable stored set falls back to
  the defaults.
- The response's `opening` field (ECO + name) is shown above the summary bar,
  and each move's `averageRating` appears as a tooltip on the move cell.

Network behavior:

- **Cache** — in-memory LRU (200 positions) keyed on the first four FEN
  fields, so transpositions that differ only in move counters share an entry.
  Stepping back and forth through a line never re-hits the API. Responses that
  arrive after you've already moved on are still cached for their position.
  Changing the filters empties it (and the alt-check's own win-rate cache) —
  every entry in it was fetched under the old ones. The chapter sort's
  persistent popularity cache needs no clearing: its entries are tagged with
  the filters they were fetched with, so they simply miss.
- **429 handling** — on a rate limit the panel shows a notice, requests pause
  for ~61 s (Lichess asks for a full minute after a 429), then the current
  position retries automatically. Cached positions keep rendering during the
  pause.
- **401 handling** — the panel explains that a token is needed (or was
  rejected) and shows a button that opens the options page. Saving a token
  there retries the current position immediately, no reload needed.

`USE_STUB_DATA` still exists — flip it to `true` to develop the UI against
mock data (marked with the yellow "stub data" badge) without touching the API.

## Permissions rationale

- `storage` — remembers the show/hide, database-filter, engine and auto-play
  preferences and holds the Lichess API token; `storage.session` carries the engine's reply
  routing and the tab-driver jobs across service-worker restarts, plus the
  auto-play session record (the worker calls
  `setAccessLevel('TRUSTED_AND_UNTRUSTED_CONTEXTS')` so the content script
  can read them — an API call, not a permission).
- `offscreen` — hosts the optional Stockfish engine in an offscreen document
  (the service worker cannot run a persistent WASM engine; content scripts
  are subject to the page's CSP). The manifest's `wasm-unsafe-eval` CSP and
  COOP/COEP keys exist solely for this: they enable WASM compilation and
  `SharedArrayBuffer` (multi-threading) on the extension's own pages.
- `host_permissions` for `https://explorer.lichess.org/*` — lets the
  background service worker (and the options page's Test button) call the
  explorer with the Authorization header, exempt from CORS. This became
  necessary when Lichess put the explorer behind authentication; before that,
  a plain content-script fetch was enough.
- Nothing else: no tabs permission, no scripting, no access beyond
  chessable.com (content script) and explorer.lichess.org (worker). The chapter
  sort calls Chessable's own API, but that is same-origin with the page the
  content script already runs in, so it needs no host permission either. Note the
  overstudy widget's and the quick-edit feature's `chrome.tabs.create` /
  `chrome.tabs.remove` / `chrome.tabs.sendMessage` calls do **not** require the
  `tabs` permission — that permission only gates reading tab metadata.

## Known behavior / limitations

- If a Lichess fetch fails with an ordinary error, the error state stays until
  the position changes (no retry loop, to avoid hammering the API). A 429 is
  the exception: it retries once automatically after the ~61 s cooldown.
- On Explore the panel lives inside Chessable's `.nextMovesContainer` in the
  DOM; on Analysis it is that container's next sibling (see below). On Explore
  the side placement is pure CSS (absolute positioning against the container,
  which `mountPanel` makes `position: relative`). Chessable centers a 940px
  content block, so the side-mode geometry (`50vw ± …` in the media query) is
  derived from that width — if Chessable changes their column width, those two
  CSS constants are the thing to retune.
- In side mode the panel caps its height at the viewport and scrolls the move
  list internally.
- On the Analysis board, Chessable's `.nextMovesContainer` is shown only
  while the Opening Explorer toggle is active — and that toggle is disabled
  in some entry states (e.g. `?fen=` deep links). The panel therefore mounts
  as the container's next sibling in the fixed-height column and is always
  visible. From there `positionAnalysisPanel()` pins it (absolute, against
  that column — `mountPanel` makes it `position: relative`) over the full
  column height minus Chessable's toolbar row, recomputed on the 500 ms poll
  and on resize.
- The move tree inside the panel is not a copy: `adoptAnalysisMoves()` moves
  Chessable's own `.movesContainer` element into the panel's `.clo-moves`
  host, so every handler of theirs (click-to-navigate, both right-click
  menus, promote/delete branch) keeps working untouched. The node is put back
  where it came from whenever the panel is re-mounted, collapsed via **Hide**,
  or the page is left, and re-adopted on the poll if their app re-renders.
- Auto-play is conservative by design: positions whose recorded move is a
  promotion are handed back to you (the trainer's promotion picker markup is
  unverified), a "stop for text" gate swallows the drag and the position falls
  back to manual, and after a wrong answer snaps back you retry that move
  yourself. Auto-play pauses while the tab is hidden. Records are per browser
  session (12 h cap) — never across days, and **Clear** drops the current
  course's on the spot (a pending record write is cancelled with it, so the
  old record cannot come back).
- A retry pass is a queue of whole variations, not of bare moves: Chessable has
  no arbitrary-FEN quiz and no multi-variation session URL, so each failed move
  is met inside its own line (auto-play covers the moves before it). A pass
  runs in the tab that started it, pauses while that tab is hidden, and ends if
  you leave the trainer. Mistakes are listed for the course you are currently
  in — a session across two courses gives you one list per course.
- All class names Chessable-side are treated as fragile; see `SELECTORS`.
