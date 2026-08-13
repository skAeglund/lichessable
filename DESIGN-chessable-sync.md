# DESIGN — Pinned mistakes across devices, carried by Chessable (section 16e)

Status: **built and VERIFIED END TO END live, 2026-08-12 (v0.107.0).** The wire
is §4; the full exchange — adopt a course, create the card, push, absorb another
device's pin, and go quiet when nothing has changed — is §6.2. Requested 2026-08-12, immediately after
v0.105.0 put the pin store on `chrome.storage.sync`
(`DESIGN-pinned-mistakes.md` §9).

The one-line version: **`storage.sync` carries the pins wherever Chrome Sync
runs; this carries them where it does not** — i.e. to the phone, whose browser
is a Chromium fork with no Google sync behind it. The transport is the user's
own Chessable account, which both devices are already logged in to, through the
same JWT endpoints sections 19c/19d/21 already use. No new permission, no host,
no server, no account of ours.

---

## 1. Why this, and what it costs

v0.105.0's failure mode is silent by design: on a fork, `storage.sync` is local
storage under another name, so pins simply do not cross and nothing complains.
That is fine as a floor and useless as an answer for the device that most needs
it — the phone is where sessions happen away from the desk.

The alternatives were weighed when the user asked (2026-08-12):

| | works | costs |
|---|---|---|
| `storage.sync` | wherever Chrome Sync runs | shipped in v0.105.0 |
| export/import blob in the options page | anywhere | manual, every sitting |
| **this** | anywhere logged in to Chessable | ~150 lines and five live facts (§4) |

### 1.1 The cost that was named first — and then removed

*Written before the live session, kept because the reasoning is still the reason
the card is shaped the way it is. The wart itself is GONE: see §4.5. The user's
own suggestion — mark it informational — turned out to be a first-class
Chessable card type, and `--` is how you write one.*


The payload has to live somewhere Chessable will hold arbitrary text for us, and
the only such place we can write is **a variation** (§2.1). A normal variation is
a trainable object: unlearned it sits in the course's new-material queue, learned
it enters SRS. That was the cost this design opened with, and the reason it was
worth naming first is that it was nearly a reason not to build the feature.

**It does not apply.** An informational card — one whose move is `--` — is
`nColor: 0`, never quizzed and never scheduled (§4.5). What survives from the
argument above is only the naming rule, which still holds for a different reason:

* **Name it so it explains itself** — `CLO-SYNC · do not delete`. The user will
  meet it while browsing the course one day and must not delete it by reflex.
* **Do not hide it.** A card the extension creates and the user cannot find is
  worse than a visible one they were told about.
* The picker still defaults to a course the user can write to, and a scratch
  course is still the tidiest home — but it is now a preference, not a mitigation.

---

## 2. The mechanism

### 2.1 Write: `importGame` with `oid`, which OVERWRITES

Section 19d's endpoint, already ground-truthed 2026-08-11
(`DESIGN-add-as-puzzle.md` §2.2), with the one field that feature is forbidden
to send:

```
POST /api/v1/importGame?uid=<uid>&bid=<sync course>
{ data: "[ { head:{…,fen}, color, name, orig, lid, moves:[…pairs…], line } ]" }
```

> **Never send `oid`.** With `allowDup:false` their own flow looks up an
> existing variation by `head.fen + line` and sets `oid` on the entry, which
> makes the call **overwrite** that variation.
> — `DESIGN-add-as-puzzle.md` §2.2

That sentence is this feature's whole write path: the thing 19d must never do is
exactly what a store needs. Verified in both directions in §4.2 — same oid, new
comment, no second variation, informational flag intact.

The payload rides in the move pair's own comment field. `pairPuzzleMoves`
already emits `commentW, commentB, commentBW, commentBB` per row
([lichessable.js:17964](content/lichessable.js:17964)) because it is a faithful
copy of their client's fold — so the write needs no new shape, only a value in a
field we have always sent empty.

**One `--`, one comment.** The variation is `1.--` from the standard position
with the blob on `commentW` — the null move is what makes it informational
(§4.5), so the shape that carries the payload is also the shape that keeps it out
of the user's reviews.

### 2.2 Read: `getLesson`, which the extension already calls

```
GET /api/v1/getLesson?uid&oid&bid  →  { lesson: { moves: [ {mid, move_white,
     move_black, alt_white, alt_black, move_fen, …} ] } }
```

Sections 15 and 23 already read this for `alt_white`/`alt_black`
([lichessable.js:24305](content/lichessable.js:24305)). The comment is on the
same rows, as `comment_white` — a JSON string whose `data` array holds our text
under `key:"C"` (§4.1). Presence of the CARD, however, is confirmed through
`getList`, never through this call: a deleted variation still answers here
(§4.6).

Cost per read: a lesson is ~9 KB per the alt cache's own note, i.e. one cheap
call, unlike `getList`'s ~180 KB course dump.

### 2.3 Encoding

```
CLOSYNC1.<RFC 4648 base32 of gzip of the JSON>
```

* **gzip through `CompressionStream('gzip')`** — native, no library. Measured
  18.7× on a full 180-pin store (§4.4): 86 KB of JSON becomes 4.6 KB.
* **base32, alphabet `A-Z2-7`, NOT base64** — and this is not a style choice.
  Chessable's comment parser marks up move-like substrings, and base64's alphabet
  contains every letter and digit a SAN is made of, so a long enough payload
  eventually corrupts itself (§4.4). No token over `A-Z2-7` can be a SAN.
* **A marker with a version and no hyphen** — `CLOSYNC1.`; the separator is a dot
  because `-` plus the letter `O` is how castling is written.

### 2.4 The merge, and why this one needs TOMBSTONES

v0.105.0 deliberately has none: `storage.sync` merges per key, so a deletion is
an absent key and that is unambiguous. **Here it is not.** The blob is
rewritten whole, so a record present remotely and absent locally could mean
either "added on the other device" or "deleted on this one", and a store that
guesses wrong either resurrects retired pins for ever or silently drops new
ones.

```
blob = { v: 1, at: <ms>, pins: { "<bid>:<oid>:<mkey>": rec },
                          gone: { "<bid>:<oid>:<mkey>": <ms deleted> } }
```

Merge, both directions, per key:

| local | remote | result |
|---|---|---|
| absent | present, not in `gone` | take remote |
| present | present | higher `lastSeenAt` wins (v0.105.0's rule) |
| present | in `gone`, `gone[k] > rec.lastSeenAt` | delete locally |
| in local removals | present | keep deleting; contribute the tombstone |

Tombstones are pruned at `syncTombstoneDays` (60) — comfortably longer than the
~28.5 h a pin needs to retire, so a retirement can never be undone by a device
that was off for a week.

**This means the local store grows a removals log.** `pn.removed` is currently
cleared once written (v0.105.0); tombstones must persist, so they become part of
the sync-side state rather than of the pin store proper.

### 2.5 When it runs

* **On load**, once per document, if the last pull is older than `syncPullMs`
  (10 min) — the pins are then whatever both devices agreed on before anything
  is drilled.
* **After a change**, debounced `syncPushMs` (60 s), and only when the merged
  blob actually differs from what was last pushed.
* **Never during a drill or a quiz.** A POST is cheap but the merge can delete
  the card on screen.
* Failures are silent beyond a console line and never block the local store,
  which is authoritative for the session. This is a transport, not a database.

---

## 3. The shape of it in code

### 3.1 It is a MODULE BESIDE the pin store, not a change to it

`initPinnedMistakes` gains no knowledge of Chessable. The sync module reads and
writes through a small bridge — the pin store already has every operation this
needs — so the store stays testable by `dev/check-pin-store.js` with no network
in it, and a session with no Chessable credentials behaves exactly as v0.105.0.

Proposed bridge, `pinSyncApi` (null-safe like every other):

```
pinApi.merge(records, tombstones)   → { changed, dropped }   NEW on pinApi
pinApi.exportAll()                  → { pins, gone }         NEW on pinApi
```

Both are pure store operations, so both are checkable in the dev harness.

### 3.2 Where the slot pointer lives

`{ bid, lid, oid }` in `chrome.storage.sync` under `cloSyncSlot` — which layers
the two transports properly: **the pointer rides Chrome Sync where it works, and
the payload rides Chessable everywhere.** On the phone, where the pointer will
not arrive, the user picks the course once and the variation is FOUND by its
name (`CLO-SYNC`) through one `getList` of that course.

### 3.3 Discovery, not configuration, wherever possible

**A course called `LiChessable` is adopted by itself** (v0.107.0) on any device
whose picker has never been touched — so the second device needs no setup at
all, and the third needs none either. The trap this has to avoid is that
switching the picker to Off writes `{ on: false }`, which looks exactly like
"not configured" if you test `pref.on`; the test is therefore whether the
preference KEY exists, so an explicit Off survives every page load. Two courses
of that name means taking the first and saying so.


A device with no slot: pick a course → `getList` → look for the marker name → if
found, adopt its `oid`; if not, create it with one `importGame`. So the second
device's setup is one dropdown, and the third device's is the same dropdown.

### 3.4 The options page is the host

Not the trainer row (DESIGN-ui-inventory §3: nothing here acts on the card being
answered) and not the panel. The options page gets: the course picker, the
current slot, "Sync now", the last result, and the pin count both sides hold.
That also answers the question asked while v0.105.0 was being tested — *how do I
see the queue on a device that did not make the mistake* — for which there is
currently no surface at all outside a trainer session.

---

## 4. The wire, established live (2026-08-12, test account, course 453453)

Every probe below was run against the real endpoints and its result is what the
implementation is built on. Both test variations were deleted afterwards
(`updateOpening&mode=del`) and the course re-read to prove it: 80 variations, no
`CLO-SYNC*` left.

### 4.1 `getLesson` carries the comment — `comment_white`

The row keys are far richer than section 15's alt read suggested:

```
mid, fullMove0Based, readyW, readyB, isKey, variant, result, default_study,
default_review, move_white, move_black, move_fen, useSoftFail, INFORMATIONAL,
reference, quizAfterLearn, alternative, last_black_move, level, level_b, …
comment_white, comment_black, comment_before_white, comment_before_black,
annotation_white, annotation_black, drawing_white, drawing_black, prev_comment_*
```

A comment is **stored as a JSON string**, not as text:

```json
{"before":"<fen>","after":"<fen>","data":[{"key":"C","state":"","val":"<our text>"}]}
```

`key:"C"` is a plain text node; `key:"S"` is a clickable move (section 18's
reader knows that shape already). **We send plain text and the server builds
that structure** — so the write needs no knowledge of it, and the read is
`JSON.parse(comment_white).data` filtered to `key === 'C'`.

### 4.2 `oid` on the entry overwrites in place

`importGame` with `oid` set returned `oids:[71474128]` — **the same oid** — with
the comment replaced and no second variation created. This is the one thing 19d
is forbidden to do (`DESIGN-add-as-puzzle.md` §2.2) and it is exactly what a
store needs. Confirmed twice: once on a normal variation, once on the
informational card, which stayed informational across the overwrite.

### 4.3 A comment holds at least 128 KB

Ladder written and read back byte-compared: 1 KB, 8 KB, 32 KB, 64 KB, 128 KB —
all five exact, `informational` unchanged throughout. The real payload is 7.4 KB
(§4.4), so the ceiling is not a constraint and was not pushed further.

### 4.4 THE PAYLOAD MUST NOT CONTAIN A SAN — base32, never base64

The first real payload came back CORRUPTED, and this is the finding that shapes
the encoding. Chessable's comment parser scans text for moves and marks them up:

```
sent: …dfffHu7-7a3f06zYf33x9Pfz79cW3f…
got:  …dfffHu7-@@SANStart@@7a3@@SANEnd@@f06z…
```

`7a3` inside a base64url run was read as a move. Base64's alphabet contains
`a`–`h` and `1`–`8`, i.e. every letter and digit a SAN is made of, so a
sufficiently long base64 payload will eventually contain one — the synthetic
ladder in §4.3 passed only because its repeating pattern happened never to form
one. **A silent, content-dependent corruption is the worst failure this feature
could have**, and it would have shipped green on §4.3's evidence alone.

The fix is to make the trigger unrepresentable rather than to strip the markers:
**RFC 4648 base32**, alphabet `A-Z2-7`. A SAN needs a lowercase file letter, so
no token in that alphabet can be one. Castling is not reachable either — `O-O`
needs a hyphen, which base32 does not have.

Measured, 180 pins (the `pinMaxTotal` ceiling), fat records:

| | bytes |
|---|---|
| JSON | 86 335 |
| gzip (`CompressionStream`, native) | 4 627 |
| base32 + marker | **7 413** |
| round trip | byte-exact, 180 pins recovered |

**18.7×** — pin JSON is the same twenty keys and the same FEN shapes repeated,
which is the best case for deflate. 7.4 KB against a proven 128 KB ceiling means
the transport is nowhere near binding, and `pinMaxTotal` stays sync's problem
(§9.4 of the pin doc), not this one's.

### 4.5 §1.1's wart is gone: `--` is an informational card

Sending `isKey:false` does **not** work — the row came back `isKey:true,
informational:false`. Nor does an `informational:true` field on the row; it is
ignored. What works is the move itself:

```
sanW: '--',  line: '1.--',  fenB = fenW = the start position
→ informational: true,  nColor: 0,  and getList reports moves: []
```

`nColor: 0` is "no moves of the study colour to train", i.e. **the card is never
quizzed and never scheduled**. `getList`'s `moves: []` is the same signature
`DESIGN-repertoire-coverage.md` §225 already records for informational cards —
and our own walk already skips them
([lichessable.js:3169](content/lichessable.js:3169), `if (!w.plies.length)
continue`), so the sync card cannot pollute the repertoire index, the coverage
report, or anything else that walks a course. §5's first rule is therefore
already enforced by code that predates this feature.

### 4.6 Two smaller facts worth having

* **`getList`'s entries key the variation as `id`, not `oid`** (`oid` is
  `getLesson`'s spelling). Discovery reads `id`.
* **`getLesson` still answers for a DELETED variation** — oid 71474128 returned
  200 with its lesson after `mode=del` removed it from the course. So presence
  must be confirmed through `getList`, never by "the lesson read succeeded", or
  a user who deletes the sync card by hand would keep resurrecting its blob.

## 5. What must never happen

* **The sync variation is never quizzed by us.** Its oid is known; every list
  this extension builds (mistake log, pins, drill, coverage) must skip it.
* **A failed or half-read sync never deletes a local pin.** Deletions apply only
  from a tombstone that parsed, from a blob whose marker and version matched.
* **No user data beyond pins goes into the blob.** Not the mistake log, not
  progress, not tokens. A comment in a course is not private — it travels with
  the course if it is ever shared.
* **It never writes to a course the user did not nominate**, and never to one
  `getImportData` did not list as importable.
* **It is opt-in.** Nothing about it starts until a course is picked: a feature
  that creates a card in someone's course on its own is not one to default on.


---

## 6. What is built, and what is still unproven

Built in v0.106.0: the store operations (`pinApi.exportAll` / `merge` /
tombstones, section 16b), the transport (`initPinSync`, section 16e) and the
options-page surface — the course picker, "Sync now", the last result, and the
list of pins this device holds, which also answers "how do I see the queue on a
device that did not make the mistake" and needed no Chessable call at all.

**Checked without a live exchange.** `dev/check-pin-store.js` §8 executes the
real merge against a fake `chrome.storage`: a remote pin is taken, a later
`lastSeenAt` wins and an older one does not, a remote tombstone deletes and the
pin does not resurrect, an unpin files a tombstone, and re-pinning beats our own
tombstone. A control with `noteGone` removed fails two of those.

**Two bugs the live boot caught that no static check could.**

1. `CONFIG.pinSync` was nested inside `CONFIG.retry`, so `C` was undefined and
   the module died in its own IIFE — visible only as one warning about a
   *different* field. `node --check` cannot see it, and the unit check does not
   load `CONFIG` from the file's structure.
2. `cardEntry(comment, oid)` took an `oid` and never put it on the entry, which
   would have CREATED a card per push instead of overwriting one. Caught by
   reading the diff, not by running it — and it is the exact failure §4.2 exists
   to prevent.

A third was reasoned out rather than observed: the blob carries `at:
Date.now()`, so no two encodes are byte-equal and a "has anything changed?" test
on the payload would POST on every poll of every open tab. The comparison is on
the pins and tombstones only.

### 6.1 Auto-adoption (v0.107.0)

A course called `LiChessable` is adopted on any device whose picker has never
been touched (§3.3), so a second device needs no setup at all. The trap is that
switching the picker to Off writes `{ on: false }`, which is indistinguishable
from "never configured" if you test `pref.on` — so the test is whether the
preference KEY exists, and an explicit Off survives every page load.

### 6.2 The live run (2026-08-12, test account, course 453453)

Driven by temporarily pointing `autoName` at the test course, with a throwaway
reset hook; both were reverted and the clean build re-verified (`v0.107.0`,
0 pins, no course chosen). In order, from the console:

```
pin sync: adopted the course called "Testing course" (453453) — nothing was configured
pin sync active (course 453453)
pin sync: created the sync card in course 453453 — oid 71476458
pin sync: Synced — nothing had changed.          ← 0 pins both ends
                                                  [seeded a blob as another device]
pin sync: Synced — took 1 new, 0 updated, 0 deleted.
pinned mistakes: saved 1 and removed 0 item(s); 1 pin(s) held
pin sync: Synced — nothing had changed.          ← idempotent
```

The card was then read back independently: `move_white: "--"`,
`informational: true`, marker present, and the extension's own blob decoded by a
decoder written separately from the one that wrote it. Card deleted afterwards,
course re-read: 80 variations, no `CLO-SYNC*`.

### 6.3 What the live run found that nothing else could

**`chrome.storage` normalises object key order to alphabetical.** A record just
folded in from a remote blob is still in that blob's key order, so
`JSON.stringify(local) !== JSON.stringify(remote)` for two identical stores, and
the exchange wrote the whole blob back — once per absorbed pin, on every device
that absorbed it, self-correcting only after the record had round-tripped
through storage. Seen as a `Synced — sent 1 pin(s)` on a page load where nothing
had changed. The comparison is now `stableStringify`, which sorts keys at every
level; the next load said `nothing had changed`, as it should.

Two earlier bugs the live BOOT caught, both invisible to `node --check` and to
the unit check: `CONFIG.pinSync` nested inside `CONFIG.retry` (the module died
in its own IIFE, surfacing as one warning about an unrelated field), and
`cardEntry` accepting an `oid` it never put on the entry — which would have
created a card per push instead of overwriting one, i.e. exactly what §4.2
exists to prevent.

### 6.4 Still unproven

* **A real pin, made by the trainer**, has never crossed — every pin in the live
  run was hand-built. The shape is the store's own (`pinApi.exportAll`), so this
  is about the trainer's fields, not the transport.
* **A second real device.** The inbound half was proved by seeding the card
  through the API, which is what another device would have written, but no phone
  has yet read or written one.
* **A deletion crossing devices** — tombstone semantics are covered by
  `dev/check-pin-store.js` §8 and a control, but not live.
