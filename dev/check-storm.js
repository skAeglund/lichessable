/**
 * dev/check-storm.js — executes the REAL intuition-storm pipeline (section 27),
 * sliced out of content/lichessable.js by brace matching, with no network and
 * no browser.
 *
 * This exists because THREE things here fail SILENTLY, and every one of them
 * still produces a tidy column of plausible numbers:
 *
 *  - THE PERSPECTIVE FLIP (`stormUserEval`). ChessDB scores are the MOVER's,
 *    and whether to negate one depends on whose move it is IN THE POSITION,
 *    never on which colour the course is for — and the two are usually
 *    opposite, since a White line ending after White's move leaves Black to
 *    move. `dev/probe-storm.js`'s own `--frontiers` block got this wrong and
 *    reported a median frontier eval of −20 with nothing above +0.80 for a
 *    course whose frontiers actually run to a median of +0.39 with four lines
 *    above +1.10 (DESIGN-intuition-storm.md §6.5). Nothing threw, nothing
 *    looked odd, and the whole eval-band argument would have been built on it.
 *  - THE CHILD-NEGATION FALLBACK (`stormMoveLoss`). `best(P after m)` is from
 *    the OPPONENT's side, so the move's own value is MINUS it and the loss is
 *    `best + childBest`. Written `best − childBest` it is wrong by twice the
 *    child's eval, which on a roughly balanced position is a small number.
 *  - THE ENGINE TIER'S OWN FLIP (`stormMoverCp`), which runs the OTHER WAY:
 *    engine/engine.js normalises to WHITE, ChessDB to the MOVER. Two
 *    perspective conversions in one feature, in opposite directions, both
 *    silent.
 *  - THE STOP AND PICK RULES (`stormWalkGame`, `stormPickReject`). A stop rule
 *    that never fires yields MORE positions, not fewer, so it looks like the
 *    feature working better.
 *
 * §9 covers the verdict LINE, which is the half of this the user actually
 * reads, and it is there because of what a live session found: playing the top
 * move printed it twice — "best Nxf3+ -0.89   Nxf3+ -0.89" — which reads as a
 * defect rather than as agreement.
 *
 * The walk takes its ChessDB lookup as a PARAMETER, so the whole of stage 2 is
 * executed here against a scripted book — which is also the only way to reach
 * the stop rules deterministically.
 *
 * Run a control by pointing CLO_SRC at a copy with the change reverted and
 * confirming it FAILS. Controls run 2026-08-28, each failing on exactly its own
 * assertions and no others:
 *   * `stormUserEval` returning `bestScore` unflipped     → 5 fail
 *   * `stormMoverCp` with `sign` pinned to 1              → 4 fail
 *   * `stormMoveLoss`'s fallback as `best - childBest`    → 3 fail (and NOT
 *     the zero-score case, which is about the type check rather than the
 *     negation — the two really are separate traps)
 *   * `stormPickReject`'s spread5 rule removed            → 3 fail
 *   * `stormBestLine`'s same-move guard defeated          → 3 fail
 *   * §14.18's stub filter removed altogether            → 6 fail
 *   * §14.18.4's walk re-entry stop reverted             → 5 fail
 *   * §14.19's UNKNOWN reachability read as bucket 0     → 4 fail
 *   * …its term sorted in FRONT of the failure count     → 1 fail (§14.15
 *     reversed in a new shape: every position still comes back, in an order
 *     that still looks deliberate)
 *   * …the figure dropped from the wire                  → 2 fail
 *   * …a missing figure stored as 0 rather than unset    → 1 fail
 *   * §14.20's `.clo-cdb--est` made unconditional again   → 1 fail (which is
 *     how it shipped from v0.130.0: the class means "ChessDB computed this for
 *     us just now" and the engine tier is the one source it is false of)
 *   * …only the ENGINE named, the two ChessDB tiers silent → 4 fail
 *   * …the label put back on the VERDICT line             → 4 fail
 *   * …the engine depth dropped from the label            → 1 fail
 *   * §14.21's oid cap put back on a frontier              → 3 fail (a frontier
 *     four lines converge on then answers the chapter question wrongly, and
 *     silently)
 *   * …its pool filter written as a plain `.filter()`      → 4 fail (which
 *     drops §14.18.4's walk stop along with both refusal counts)
 *   * …an unattributed stored position kept anyway         → 3 fail
 *   * …with its `pos.side !== userSide` guard removed    → 3 fail (the "tidy":
 *     it still stops walks and still looks plausible, and silently discards
 *     every position where the OPPONENT left the book first)
 *   * …its continuation index made colour-agnostic       → 1 fail
 *   * …restricted to the lines eligible to BE a frontier → 2 fail
 *
 * §19's second SOURCE (v0.152.0). Controls run 2026-08-30, each failing on
 * exactly its own assertions and no others:
 *   * `stormDecisions`'s "opponent to move" guard removed  → 3 fail (the
 *     "tidy" that turns every one of the author's own choices into a hole)
 *   * `stormUncoveredMoves` preferring the explorer's raw uci → 2 fail (both
 *     castling cases, and NOTHING else — which is exactly why it is invisible)
 *   * …its comparator reversed                             → 4 fail
 *   * `stormFilterSource` returning the whole store        → 3 fail
 *
 * §29's controls, run 2026-09-01, each failing on exactly its own assertions
 * and no others. Everything here is silent in the same way: a puzzle that will
 * not replay still looks like a puzzle in storage, and a wire merge that
 * double-counts keeps producing plausible, growing numbers.
 *   * `moves[0]` applied as an opponent set-up move        → 4 fail (the raw
 *     Lichess CSV's convention, which this dataset does NOT use)
 *   * every ply counted as the user's                      → 2 fail (an
 *     even-length puzzle then counts up to a move never asked for)
 *   * the draw order reversed, hardest first               → 1 fail (§14.15's
 *     rule in its third home, and silent from the outside)
 *   * the random tie-break dropped                         → 1 fail
 *   * the anchor FLOOR removed                             → 1 fail (the floor
 *     IS the feature: below it a "match" means the game shares an opening)
 *   * `minPly` kept per line instead of course-wide        → 1 fail
 *   * the line end left out of the anchors                 → 3 fail
 *   * a malformed body stored rather than refused          → 1 fail
 *   * `statMapOf` not knowing about puzzles                → 1 fail (the third
 *     map then stays empty for ever while looking implemented)
 *   * the puzzle retention rule inverted                   → 2 fail
 *   * a zero tombstone read as a real retirement           → 1 fail (and note
 *     the assertion had to be asked NEAR THE EPOCH: at the far clock the first
 *     version of it passed for the wrong reason and covered nothing)
 *   * the anchor scope filter passing everything           → 1 fail
 *   * the wire merge summing `k` instead of taking the max → 1 fail
 *   * …ignoring the LOCAL tombstones                       → 2 fail
 *   * …ignoring the REMOTE tombstones                      → 3 fail
 *   * the wire pack ignoring its budget                    → 2 fail
 *   * …carrying candidates as well as ready puzzles        → 1 fail
 *   * the payload no longer naming its course (§27b)       → 1 fail
 *
 * §31's end-of-session push (§15.7). Controls run 2026-09-03, each failing on
 * exactly its own assertions and no others:
 *   * `pushStatsAfterSession`'s debt gate removed        → 2 fail (the second
 *     of them is the no-course case writing a status line after every session)
 *   * a failed write no longer putting the debt back    → 1 fail
 *   * the queued re-fire dropped, i.e. a push refused
 *     outright while another is in flight               → 3 fail
 * What NO assertion here can cover is the CALL in `endSession`: that function
 * is not sliced, and a push removed from it looks exactly like the behaviour
 * before v0.177.0 — the record leaving one session late.
 *
 * §32's position-store push (§14.25). Controls run 2026-09-03, each failing on
 * exactly its own assertions and no others:
 *   * `syncStore` capturing the write counter LATE, after the pack
 *     rather than before the read                          → 1 fail (and it is
 *     the one that loses a position: every sync still reports success)
 *   * its mid-flight course guard removed                  → 2 fail (the state
 *     it writes is course B's positions onto course A's card, which §27b's
 *     `stormWireForeign` then refuses for ever)
 *   * `pushStoreAfterSession`'s debt gate removed          → 1 fail
 *   * …its gather hand-off gate removed                    → 2 fail
 *   * `resetStoreDebt` made a no-op                        → 1 fail
 * Not covered, for §31's reason: the two `noteStoreChanged` calls inside
 * `saveStore` and `savePuzzleStore` (the funnel itself), and the call in
 * `endSession`.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { sliceDecl, findDecl, SRC_PATH } = require('./slice-source.js');
const CloSan = require('../engine/san.js');
// §29) The puzzle dataset primitives. Required rather than sliced: that file
// is a module in its own right (engine/san.js's idiom) and has its own check,
// `dev/check-puzzles.js`. What is needed here is only that the sliced walks
// can call `fenPositionKey` while collecting anchors.
const CloPuzzles = require('../content/puzzles.js');

// --- the surrounding closure, faithful to the shipped file -------------------
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const SQ_FILES = 'abcdefgh';
const squareName = (i) => SQ_FILES[i & 7] + ((i >> 3) + 1);
const cacheKey = (fen) => fen.split(' ').slice(0, 4).join(' ');
const warn = () => {};
const log = () => {};
// The stage-0 walk yields every `chunkVars` variations (a 500-line course is
// ~8 s of CloSan). Here that is a microtask.
const sleepMs = () => Promise.resolve();

const src = [
  sliceDecl('RELAXED_SAN_RE'),
  sliceDecl('sanToUciRelaxed'),
  sliceDecl('sanToUci'),
  sliceDecl('fenAfterUci'),
  sliceDecl('walkVariation'),
  sliceDecl('sideOf'),
  // The pipeline under test.
  // §19b) THE COVERAGE KEY. Sliced rather than transcribed for the usual
  // reason and one of its own: both sides of every coverage comparison go
  // through it, so a transcription that drifted would agree with itself and
  // with nothing shipped.
  sliceDecl('stormCoverKey'),
  // §28) The scope key and the line test. Both PURE and both silent when wrong:
  // a key that never matches is a scope that finds no line, which looks exactly
  // like a position the course does not reach.
  sliceDecl('stormFenKey'),
  sliceDecl('stormLineThrough'),
  sliceDecl('stormFrontiers'),
  // §19's stage 0 and stage 1, and the store split that keeps the two sources
  // apart. Every one of them fails SILENTLY — see section 13.
  sliceDecl('stormDecisions'),
  sliceDecl('stormUncoveredMoves'),
  sliceDecl('stormFilterSource'),
  sliceDecl('stormDrawFrontier'),
  sliceDecl('stormFilterPool'),
  sliceDecl('stormFilterStore'),
  // §28) …and the impure resolve over them, which is where the latch and the
  // intersection live. Sliced for `harvestCandidates`'s reason: the rule is in
  // this function's control flow and nowhere else, and every way of getting it
  // wrong quietly widens or empties a scope.
  sliceDecl('stormScope'),
  sliceDecl('stormUserEval'),
  sliceDecl('PGN_COMMENT_RE'),
  sliceDecl('stormPgnMoves'),
  // §16's conversion, which everything below it is a transformation of.
  sliceDecl('stormWinPct'),
  sliceDecl('stormWpLoss'),
  sliceDecl('stormPickReject'),
  sliceDecl('stormMoveLoss'),
  sliceDecl('stormMoverCp'),
  sliceDecl('stormGrade'),
  sliceDecl('stormPoints'),
  sliceDecl('stormPack'),
  sliceDecl('stormUnpack'),
  sliceDecl('stormRetain'),
  sliceDecl('stormDone'),
  sliceDecl('stormPickGames'),
  // §14.17's funnel. `harvestCandidates` and `storeAdd` are the only IMPURE
  // things this file executes, and they are here for one reason: the property
  // worth asserting — that the four candidate outcomes account for every
  // examined position — lives in `harvestCandidates`'s control flow and nowhere
  // else. `__setEnv` supplies the two module-level bindings they close over
  // (`st` and `C`), which is what makes them reachable without reordering the
  // harness below.
  sliceDecl('stormFunnelBlank'),
  sliceDecl('stormFunnelBump'),
  sliceDecl('stormFunnelWhy'),
  sliceDecl('stormFunnelNote'),
  sliceDecl('stormFunnelLines'),
  sliceDecl('storeAdd'),
  sliceDecl('harvestCandidates'),
  // 19b) The stored-position sweep. IMPURE, and here for the funnel's own
  // reason: what it removes is what the user would otherwise be asked, and a
  // sweep that removes nothing is indistinguishable from one that works.
  sliceDecl('dropCoveredStored'),
  'let st = null; let C = null; let pz = null;',
  'function __setEnv(a, b) { st = a; C = b; }',
  'function __setPz(a) { pz = a; }',
  // §14.23's engine tier. IMPURE, like the funnel above and for the same
  // reason: the property worth asserting — that a search which runs out of
  // budget is TAKEN at the depth it reached rather than thrown away — lives in
  // this state machine's control flow and nowhere else. `__setEnv` supplies
  // `st` and `C`; the six page-world bindings come in as parameters.
  sliceDecl('stormEngineLoss'),
  sliceDecl('armEnginePhase'),
  sliceDecl('startEngineChild'),
  sliceDecl('finishEngineJob'),
  sliceDecl('endEngineJob'),
  sliceDecl('onStormEngineUpdate'),
  sliceDecl('keepEngineBest'),
  sliceDecl('keepEngineChild'),
  // §23) THE STORED LIST'S DEPTH RULE (v0.159.0). Both PURE. This is the one
  // place that decides whether a search is allowed to become a STANDARD, and
  // every way of getting it wrong stores a list that is indistinguishable from
  // a right one — `d` is the only thing that tells two lists apart.
  sliceDecl('deepestCompleteList'),
  sliceDecl('deepenPickDepth'),
  sliceDecl('stormReachBucket'),
  sliceDecl('stormReachLabel'),
  sliceDecl('stormStoreDraw'),
  // 27b) ONE CARD PER COURSE and the guard behind it. Both PURE, and both
  // silent when wrong: one name for every course is what let a second synced
  // course overwrite the first and then be merged into it (see section 18).
  sliceDecl('stormCardName'),
  sliceDecl('stormWireForeign'),
  sliceDecl('stormWirePack'),
  sliceDecl('stormWireUnpack'),
  sliceDecl('stormWireMerge'),
  // §15's performance record. The three silent failures are the denominator,
  // the merge and the roll-up — see section 9 below.
  sliceDecl('STAT_BAND'),
  sliceDecl('STAT_MAPS'),
  sliceDecl('statMapOf'),
  sliceDecl('stormStatBlank'),
  sliceDecl('stormStatApply'),
  sliceDecl('stormStatPlus'),
  sliceDecl('stormStatSum'),
  sliceDecl('stormStatGraded'),
  sliceDecl('stormStatRoll'),
  sliceDecl('stormStatRate'),
  sliceDecl('stormStatLoss'),
  sliceDecl('stormStatsMerge'),
  sliceDecl('stormStatsPrune'),
  sliceDecl('stormStatsWirePack'),
  sliceDecl('stormStatsWireUnpack'),
  // §21's sentence. Pure, and it is the entire point of the `s` counter: a
  // figure made of two conditions has to say so, and this is where it says it.
  sliceDecl('statUnhurriedNote'),
  // §15.7) The end-of-session push and the debt it clears. IMPURE, like the
  // funnel and the engine tier above, and here for the same reason: what is
  // worth asserting lives in these two functions' control flow and nowhere
  // else, and EVERY way of getting it wrong is silent — a push that never
  // fires looks exactly like the behaviour before it existed (the record
  // leaves on the NEXT session opened here), and a debt cleared by a write
  // that failed looks exactly like one that succeeded.
  //
  // The carrier is section 16e's and comes in through `__setSync`, so nothing
  // here touches a network; the five bindings below it are the shipped file's
  // own and are stubbed to be observable rather than transcribed.
  'let pinSyncApi = null;',
  'function __setSync(a) { pinSyncApi = a; }',
  'let __note = "";',
  'function __statsNote() { return __note; }',
  'function setStatsNote(t) { __note = t || ""; }',
  'function render() {}',
  'async function loadStats() { st.stats = st.stats || {}; }',
  'async function saveStats() { st.statsSaves = (st.statsSaves || 0) + 1; }',
  sliceDecl('syncStats'),
  sliceDecl('pushStatsAfterSession'),
  // §14.25) The POSITION store's own end-of-session push, on the same argument
  // and with two rules of its own that fail silently: the write counter is
  // captured BEFORE the card is read, so a change landing mid-exchange stays a
  // debt (capturing late loses it, and nothing says so), and a course changed
  // under an exchange in flight must ABANDON it — writing there puts course B's
  // positions on course A's card under `b: B`, which `stormWireForeign` then
  // refuses for ever.
  //
  // `syncStore`'s own collaborators are stubbed. `saveStore`/`savePuzzleStore`
  // are the two real callers of `noteStoreChanged` and are NOT executed here,
  // so the funnel itself is asserted only through the counter it moves.
  'function setSyncNote(t) { __note = t || ""; }',
  'async function loadStore() {}',
  'async function loadSyncMeta() {}',
  'async function saveStore() {}',
  'async function saveSyncMeta() {}',
  'async function syncPuzzles() {}',
  'function storeTotal() { return Object.keys(st.store || {}).length; }',
  'function storeDraw() { return []; }',
  'function produceFromStore() { return false; }',
  'function nextCard() {}',
  'function filling() { return false; }',
  'function __clearNote() { __note = ""; }',
  sliceDecl('noteStoreChanged'),
  sliceDecl('storeChanged'),
  sliceDecl('resetStoreDebt'),
  sliceDecl('syncStore'),
  sliceDecl('pushStoreAfterSession'),
  // §17's SET rules. Pure, and every one of them fails silently: a hold rule
  // that never fires is a mode that quietly behaves like a storm with no
  // clock, and an outcome rule that mis-files an attempt still produces a
  // plausible tally.
  sliceDecl('stormSetClean'),
  sliceDecl('stormSetHeld'),
  sliceDecl('stormSetOutcome'),
  sliceDecl('stormSetTally'),
  // §29) The anchor collector, which BOTH walks now call — so without it the
  // slice throws before a single assertion runs.
  sliceDecl('stormAnchorAdd'),
  sliceDecl('stormFilterAnchors'),
  // …and the pure puzzle rules. Every one of them fails silently: a draw
  // comparator that is wrong still returns every puzzle in a plausible order
  // (§14.15), a retention rule that is wrong still keeps a store, and a ply
  // walk that mis-reads the move list still produces a card.
  sliceDecl('stormPuzzleBlank'),
  sliceDecl('stormPuzzleCand'),
  sliceDecl('stormPuzzleReady'),
  sliceDecl('stormPuzzlePlies'),
  sliceDecl('stormPuzzleUserPlies'),
  sliceDecl('stormPuzzleRetain'),
  sliceDecl('stormPuzzleDraw'),
  sliceDecl('stormPuzzleArchived'),
  sliceDecl('stormPuzzleArchiveDraw'),
  sliceDecl('stormPuzzleDone'),
  sliceDecl('cardLineRef'),
  sliceDecl('stormPuzzleCardName'),
  sliceDecl('stormPuzzleWirePack'),
  sliceDecl('stormPuzzleWireUnpack'),
  sliceDecl('stormPuzzleWireMerge'),
  // §29.4) The disguise's own gate. IMPURE — it closes over `pz` — and here
  // for the funnel's reason: what it decides is whether an unanswered puzzle is
  // distinguishable from a graded card, and BOTH ways of being wrong are quiet.
  // Under-disguising leaks a tactic's existence only on the cards that are
  // tactics, which at 10% is one card in ten; over-disguising silently costs
  // every graded card the sentence that says where it is.
  sliceDecl('puzzlesInPlay'),
  // §30) The three deal-side spreads. IMPURE (`st`, `pz`) and here for
  // §14.15's reason in its fourth home: a spread that never fires still deals
  // every position, in a plausible order, and looks exactly like the bug it was
  // added to remove — six cards from one variation.
  sliceDecl('stormLineKey'),
  sliceDecl('queuedOrDealt'),
  sliceDecl('cardLineKey'),
  // §30b) …and the recency half, IMPURE (`st.recentStore`) and quiet in BOTH
  // directions: a window that never matches leaves the feature switched off
  // and looking exactly like a course with more lines than the window, while
  // one that blocks too much would defer every card and be invisible behind
  // the fallback each deal point ends with.
  sliceDecl('recentList'),
  sliceDecl('lineRecent'),
  sliceDecl('noteRecentLine'),
  sliceDecl('setModeOn'),
  // §30) …and the backfill, IMPURE for the same reason: what it decides is
  // whether the store's own line names ever reach the items and cards ALREADY
  // DRAWN off it, and §14.11's early draw guarantees there are some. Nothing
  // throws when it does not — the session simply deals with the spread switched
  // off.
  sliceDecl('backfillStoreOids'),
  sliceDecl('takeStoreItem'),
  sliceDecl('takeQueued'),
  sliceDecl('takeQueuedPuzzle'),
  sliceDecl('stormCandidate'),
  sliceDecl('stormAdvance'),
  sliceDecl('stormReentered'),
  sliceDecl('stormWalkGame'),
  sliceDecl('stormRandomLine'),
  sliceDecl('stormCard'),
  // The verdict line: pure, and the half of this feature the user reads.
  sliceDecl('stormCp'),
  sliceDecl('stormWp'),
  sliceDecl('stormSharePct'),
  sliceDecl('stormGapNote'),
  sliceDecl('stormEstimated'),
  sliceDecl('stormSourceLabel'),
  sliceDecl('stormSourceTitle'),
  sliceDecl('stormVerdictLine'),
  sliceDecl('stormBestLine'),
  'return { stormFrontiers, stormDecisions, stormUncoveredMoves, stormCoverKey,' +
  '         stormFenKey, stormLineThrough,' +
  '         stormFilterSource, stormSharePct, stormGapNote,' +
  '         statMapOf, STAT_MAPS,' +
  '         stormDrawFrontier, stormUserEval, stormPgnMoves,' +
  '         stormPickReject, stormMoveLoss, stormGrade, stormPoints,' +
  '         stormWalkGame, stormRandomLine, stormCandidate, stormAdvance,' +
'         stormReentered,' +
  '         stormCard, stormPack, stormUnpack, stormRetain, stormStoreDraw,' +
  '         stormDone, stormPickGames,' +
'         stormFilterPool, stormFilterStore, stormScope,' +
'         stormReachBucket, stormReachLabel,' +
  '         stormFunnelBlank, stormFunnelBump, stormFunnelWhy,' +
  '         stormFunnelNote, stormFunnelLines,' +
  '         storeAdd, harvestCandidates, dropCoveredStored, __setEnv,' +
  '         puzzlesInPlay, __setPz,' +
  '         takeStoreItem, takeQueued, takeQueuedPuzzle, backfillStoreOids,' +
  '         stormLineKey, cardLineKey, queuedOrDealt,' +
  '         recentList, lineRecent, noteRecentLine,' +
  '         stormEngineLoss, onStormEngineUpdate, endEngineJob,' +
  '         deepestCompleteList, deepenPickDepth,' +
  '         stormWirePack, stormWireUnpack, stormWireMerge,' +
  '         stormCardName, stormWireForeign,' +
  '         stormStatBlank, stormStatApply, stormStatPlus, stormStatSum,' +
  '         stormStatGraded,' +
  '         stormStatRoll, stormStatRate, stormStatLoss,' +
  '         stormStatsMerge, stormStatsPrune,' +
  '         stormStatsWirePack, stormStatsWireUnpack, statUnhurriedNote,' +
  '         syncStats, pushStatsAfterSession, __setSync, __statsNote,' +
  '         syncStore, pushStoreAfterSession, noteStoreChanged,' +
  '         storeChanged, resetStoreDebt, __clearNote,' +
  '         stormCp, stormWp, stormMoverCp,' +
  '         stormWinPct, stormWpLoss,' +
  '         stormSetClean, stormSetHeld, stormSetOutcome, stormSetTally,' +
  '         stormEstimated, stormSourceLabel, stormSourceTitle,' +
'         stormVerdictLine, stormBestLine,' +
  '         walkVariation, stormAnchorAdd, stormFilterAnchors,' +
  '         stormPuzzleBlank, stormPuzzleCand, stormPuzzleReady,' +
  '         stormPuzzlePlies, stormPuzzleUserPlies, stormPuzzleRetain,' +
  '         stormPuzzleDraw, stormPuzzleDone, cardLineRef,' +
  '         stormPuzzleArchived, stormPuzzleArchiveDraw,' +
  '         stormPuzzleCardName, stormPuzzleWirePack,' +
  '         stormPuzzleWireUnpack, stormPuzzleWireMerge,' +
  '         sanToUci, fenAfterUci };',
].join('\n');
// eslint-disable-next-line no-new-func
// The engine tier's six page-world bindings. `engineHost` is rebound by
// section 10; everything above it never reaches them.
const engineHost = {
  state: {},
  sent: [],
  send(msg) { engineHost.sent.push(msg); },
  profile: () => 'desktop',
  ping: () => {},
  sync: () => { engineHost.synced++; },
  synced: 0,
};
// §29) `pliesBefore` is 19c's, top level in the shipped file and used by the
// anchor collector to number a position ABSOLUTELY in the game — which is what
// makes a custom-start line fall out of the band by itself instead of having
// its first position numbered 0.
const pliesBefore = (fen) => {
  const parts = String(fen || '').trim().split(/\s+/);
  const full = Number(parts[5]);
  if (!Number.isInteger(full) || full < 1) return null;
  if (parts[1] !== 'w' && parts[1] !== 'b') return null;
  return 2 * (full - 1) + (parts[1] === 'b' ? 1 : 0);
};
const S = new Function('CloSan', 'CloPuzzles', 'pliesBefore',
  'squareName', 'cacheKey', 'START_FEN', 'warn', 'log',
  'sleepMs', 'state', 'engineSend', 'engineProfile', 'pingEngineIfSilent', 'syncEngine', src)(
  CloSan, CloPuzzles, pliesBefore, squareName, cacheKey, START_FEN, warn, warn, sleepMs,
  engineHost.state,
  (msg) => engineHost.send(msg),
  () => engineHost.profile(),
  () => engineHost.ping(),
  () => engineHost.sync());

// CONFIG.storm, read out of the shipped file so the thresholds cannot drift.
const SRC = fs.readFileSync(SRC_PATH, 'utf8');
// Bounded at the BLOCK's own closing brace rather than by a character count:
// the block grows, and a count that has fallen behind reads a number out of
// whatever section follows — or, as here, throws for one that is plainly there.
const cfgStart = SRC.indexOf('storm: {');
const cfgBody = SRC.slice(cfgStart, SRC.indexOf('\n    },', cfgStart));
const num = (name) => {
  const m = new RegExp('\\b' + name + ':\\s*(-?\\d+)').exec(cfgBody);
  if (!m) throw new Error('CONFIG.storm.' + name + ' not found');
  return Number(m[1]);
};
// §27b) …and the first STRING settings this file has needed. Without it `C`
// held only numbers, so `C.cardPrefix` was `undefined` and `stormCardName`
// happily returned "undefined · 453453 · do not delete" — which still contains
// the bid and still differs per course, so every assertion about it PASSED
// while the name was wrong. The same shape of vacuous pass that
// `check-popup-placement.js` records in its own header: a missing value that
// loses every comparison rather than failing one.
const str = (name) => {
  const m = new RegExp('\\b' + name + ":\\s*'([^']*)'").exec(cfgBody);
  if (!m) throw new Error('CONFIG.storm.' + name + ' not found');
  return m[1];
};
// §29.3) …and the first ARRAY setting. Same discipline as `str` above and for
// the same recorded reason: a reader that quietly answers `undefined` turns
// every assertion about the value into a vacuous pass, so this throws when the
// field is not there rather than handing back nothing.
const nums = (name) => {
  const m = new RegExp('\\b' + name + ':\\s*\\[([^\\]]*)\\]').exec(cfgBody);
  if (!m) throw new Error('CONFIG.storm.' + name + ' not found');
  return m[1].split(',').map((x) => Number(x.trim())).filter((x) => Number.isFinite(x));
};

const numF = (name) => {
  const m = new RegExp('\\b' + name + ':\\s*(-?[0-9.]+)').exec(cfgBody);
  if (!m) throw new Error('CONFIG.storm.' + name + ' not found');
  return Number(m[1]);
};
const C = {
  // §27b) the card names. STRINGS — see `str`.
  cardPrefix: str('cardPrefix'), cardName: str('cardName'),
  minVarPlies: num('minVarPlies'), chunkVars: num('chunkVars'),
  userLoCp: num('userLoCp'), userHiCp: num('userHiCp'),
  maxPly: num('maxPly'), minPly: num('minPly'),
  blunderCp: num('blunderCp'), decidedCp: num('decidedCp'),
  minScored: num('minScored'),
  spreadMinCp: num('spreadMinCp'), spreadMaxCp: num('spreadMaxCp'),
  // §16's bands. `wpK` is a float and `num`'s pattern only matches integers —
  // it would have read "0" and made every position a coin toss, which is a
  // failure that still grades every move and still looks entirely plausible.
  greatWp: num('greatWp'), goodWp: num('goodWp'),
  okWp: num('okWp'), badWp: num('badWp'),
  greatPoints: num('greatPoints'), goodPoints: num('goodPoints'),
  badPoints: num('badPoints'), blunderPoints: num('blunderPoints'),
  wpK: numF('wpK'), wpClampCp: num('wpClampCp'),
  // PER PROFILE since v0.134.0 (`{ desktop: 20, mobile: 18 }`), so it is no
  // longer a scalar — section 8 below asserts the shape and the two orderings
  // that fail silently.
  engineDepth: (() => {
    const m = /\bengineDepth:\s*\{([^}]*)\}/.exec(cfgBody);
    if (!m) throw new Error('CONFIG.storm.engineDepth not found (expected an object)');
    const out = {};
    for (const part of m[1].split(',')) {
      const kv = /(\w+)\s*:\s*(\d+)/.exec(part);
      if (kv) out[kv[1]] = Number(kv[2]);
    }
    return out;
  })(),
  engineTimeoutMs: num('engineTimeoutMs'), gradeTimeoutMs: num('gradeTimeoutMs'),
  // §14.23: the two that actually decide whether the tier ever answers.
  enginePhaseMs: num('enginePhaseMs'), engineDepthSlack: num('engineDepthSlack'),
  engineMateCp: num('engineMateCp'),
  wireVersion: num('wireVersion'), goneMax: num('goneMax'), goneDays: num('goneDays'),
  // Read out of the shipped file the same way, so the rule and the assertions
  // about it cannot disagree about which verdicts drop a position.
  storeDropOn: (cfgBody.match(/storeDropOn:\s*\[([^\]]*)\]/) || [, ''])[1]
    .split(',').map((x) => x.trim().replace(/'/g, '')).filter(Boolean),
  minPlyMax: num('minPlyMax'), maxPlyMin: num('maxPlyMin'), maxPlyMax: num('maxPlyMax'),
  // §17's set. `setCleanOn` is read the same way `storeDropOn` above is, and
  // section 11 asserts the two still say the same thing — they answer different
  // questions and are written out twice on purpose, so a change to either must
  // be a deliberate change to both.
  setSize: num('setSize'), setRetryMax: num('setRetryMax'),
  // The verdict pause and its short form (v0.151.0). Both are read here rather
  // than asserted by eye because the fast one is invisible when it is wrong: a
  // value above `verdictMs` makes the "quick" path the slow one and nothing
  // else changes, and a value near zero makes a verdict flash past unread.
  verdictMs: num('verdictMs'), verdictFastMs: num('verdictFastMs'),
  // §14.24's background pass. `backfillStore` above `queueTarget` is what makes
  // the pass able to do anything at all, and its budget below the gather pass's
  // is what keeps "background" meaning quieter than the burst you ask for.
  backfillMaxCdb: num('backfillMaxCdb'), backfillStore: num('backfillStore'),
  backfillGapMs: num('backfillGapMs'), gatherMaxCdb: num('gatherMaxCdb'),
  queueTarget: num('queueTarget'), queueSpread: num('queueSpread'),
  // §30b) The recency window. `str()` for the key rather than `num()`:
  // a string field read as a number is `undefined`, which every
  // truthiness assertion about it would fail — and one read the other
  // way round is §18's own lesson about `stormCardName`.
  recentLines: num('recentLines'), recentKey: str('recentKey'),
  setCleanOn: (cfgBody.match(/setCleanOn:\s*\[([^\]]*)\]/) || [, ''])[1]
    .split(',').map((x) => x.trim().replace(/'/g, '')).filter(Boolean),
  // §14.19's reachability bucket. UNKNOWN answers this value, so a wrong one
  // here would make the 'no figure ties with the most reachable' assertion
  // pass against a source that had changed its mind about that.
  reachTop: num('reachTop'),
  randomTopN: num('randomTopN'), randomTopCp: num('randomTopCp'),
  randomMinPlies: num('randomMinPlies'),
  streakStep: num('streakStep'), streakMax: num('streakMax'),
  // §15. Not a threshold anybody tunes, but the wire version IS what a payload
  // is refused on, so it has to be the shipped one.
  statsWireVersion: num('statsWireVersion'),
  statsMaxLines: num('statsMaxLines'),
  // §19's two floors and its cap. Read out of the shipped file like everything
  // else here, so an assertion about the rule cannot drift from the rule.
  uncMinShare: num('uncMinShare'), uncMinGames: num('uncMinGames'),
  uncMaxPerPosition: num('uncMaxPerPosition'), uncMovesLimit: num('uncMovesLimit'),
  // §23's gather depth (v0.159.0). A SCALAR, unlike `engineDepth` above, and
  // section 15 asserts that — the two profiles are what it stopped being, and a
  // map restored here would put a phone's depth-18 lists into the same store as
  // a desktop's depth-20 ones under the same `d` field.
  // §29) The puzzle retention list. Read the way `storeDropOn` is, and
  // asserted to have the same membership — the two are written out twice on
  // purpose, so a change to either has to be a deliberate change to the other.
  puzzleDropOn: (cfgBody.match(/puzzleDropOn:\s*\[([^\]]*)\]/) || [, ''])[1]
    .split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean),
  puzzleAnchorMinPly: num('puzzleAnchorMinPly'),
  puzzleAnchorMaxPly: num('puzzleAnchorMaxPly'),
  puzzleAnchorPlyChoices: nums('puzzleAnchorPlyChoices'),
  puzzlesPerAnchor: num('puzzlesPerAnchor'),
  puzzleReadyMax: num('puzzleReadyMax'),
  puzzleCandMax: num('puzzleCandMax'),
  deepenDepth: num('deepenDepth'), deepenMinMoves: num('deepenMinMoves'),
  deepenMultipv: num('deepenMultipv'), deepenStallMs: num('deepenStallMs'),
};

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log('FAIL ' + label + '\n       got  ' + g + '\n       want ' + w);
};

// ===========================================================================
// 0) THE DISPLAY HELPERS MUST BE AT TOP LEVEL
// ===========================================================================
// SLICING FLATTENS EVERY SCOPE INTO ONE, so nothing else in this file can tell
// a helper section 18 can reach from one it cannot — and section 18's panel and
// section 27's review print the SAME verdict line from two different closures.
// Found live 2026-08-28: `renderReview` threw `stormVerdictLine is not defined`
// at the first teardown, which `node --check` cannot see and no assertion below
// would have caught. Two-space indent IS top level in this file.
//
// §14.20 added two more with exactly the same reach: `stormEstimated` decides a
// CLASS on both hosts and `stormSourceTitle` a tooltip on both, so a move into
// either closure fails in the other at the first verdict.
//
// §19 added two more of the same shape: `stormGapNote` says what an uncovered
// card IS, and section 18's panel prints it while the card is up while section
// 27's review prints the same fact from its own closure.
for (const name of ['stormCp', 'stormWp', 'stormVerdictLine', 'stormBestLine',
  'stormEstimated', 'stormSourceLabel', 'stormSourceTitle',
  'stormSharePct', 'stormGapNote']) {
  const line = SRC.split('\n')[findDecl(name)];
  const indent = line.length - line.replace(/^ +/, '').length;
  eq(name + ' is declared at top level (2-space indent), not inside a module', indent, 2);
}

// ===========================================================================
// 1) THE PERSPECTIVE FLIP
// ===========================================================================
// The frontier of a WHITE line ending after White's move leaves BLACK to move,
// so the mover's score has to be negated to read as White's. This pair is the
// exact shape §6.5's bug had.
eq('white line, black to move: +180 for Black is −180 for us',
  S.stormUserEval(180, 'b', 'w'), -180);
eq('white line, white to move: taken as it stands',
  S.stormUserEval(180, 'w', 'w'), 180);
eq('black line, white to move: negated',
  S.stormUserEval(180, 'w', 'b'), -180);
eq('black line, black to move: taken as it stands',
  S.stormUserEval(180, 'b', 'b'), 180);
eq('zero is zero either way', S.stormUserEval(0, 'w', 'b'), -0);
// The one that makes the bug's SHAPE visible: the same frontier read the two
// ways must differ in sign, never merely in value.
eq('the two readings of one frontier are opposite',
  S.stormUserEval(116, 'b', 'w') === -S.stormUserEval(116, 'b', 'b'), true);

// ===========================================================================
// 2) THE GRADER
// ===========================================================================
// A real-shaped scored list, mover's perspective, best first.
const scored = [
  { uci: 'g1f3', san: 'Nf3', score: 32, winrate: 54 },
  { uci: 'f1b5', san: 'Bb5', score: 20, winrate: 53 },
  { uci: 'd2d4', san: 'd4', score: -5, winrate: 49 },
  { uci: 'b1c3', san: 'Nc3', score: -48, winrate: 47 },
  { uci: 'h2h3', san: 'h3', score: -120, winrate: 43 },
];

eq('the top move loses nothing', S.stormMoveLoss(scored, 'g1f3', undefined, C).loss, 0);
eq('…and is rank 1', S.stormMoveLoss(scored, 'g1f3', undefined, C).rank, 1);
eq('the second move is 12cp behind', S.stormMoveLoss(scored, 'f1b5', undefined, C).loss, 12);
eq('the fourth is 80cp behind', S.stormMoveLoss(scored, 'b1c3', undefined, C).loss, 80);
eq('a listed move reports its source', S.stormMoveLoss(scored, 'd2d4', undefined, C).source, 'list');
eq('a listed move carries its win rate', S.stormMoveLoss(scored, 'd2d4', undefined, C).winrate, 49);

// THE FALLBACK. The move is not in the list; the position AFTER it scores
// −10 for the OPPONENT, so the move is worth +10 to us and is 22cp behind the
// best (32). `best − childBest` would say 42, which is a perfectly plausible
// number for a move nobody can check.
const viaChild = S.stormMoveLoss(scored, 'a2a3', -10, C);
// §16: BOTH numbers ride together, and the win-probability one is derived from
// the SAME pair — a `wp` computed from anything but this move's own score and
// the position's best is the one way this could disagree with itself.
eq('a listed move carries a win-probability loss too',
  Math.abs(S.stormMoveLoss(scored, 'f1b5', undefined, C).wp -
    S.stormWpLoss(scored[0].score, scored[1].score, C)) < 1e-9, true);
eq('the top move gives up no probability either',
  S.stormMoveLoss(scored, 'g1f3', undefined, C).wp, 0);
eq('…and the position it was measured against rides along',
  S.stormMoveLoss(scored, 'f1b5', undefined, C).bestScore, scored[0].score);
eq('the child-negation fallback negates', viaChild.loss, 22);
eq('…and says so', viaChild.source, 'child');
eq('…and claims no rank', viaChild.rank, null);
// A child that is GOOD for the opponent means the move was bad for us.
eq('a child good for the opponent is a big loss',
  S.stormMoveLoss(scored, 'a2a3', 150, C).loss, 182);
// …and one that is terrible for them means our move was fine.
eq('a child bad for the opponent is no loss at all',
  S.stormMoveLoss(scored, 'a2a3', -400, C).loss, 0);
eq('with no child there is no answer', S.stormMoveLoss(scored, 'a2a3', undefined, C), null);
eq('an empty list answers nothing', S.stormMoveLoss([], 'g1f3', 0, C), null);
// A score of 0 is a real score, so the fallback must type-check rather than
// test truthiness — the trap DESIGN-chessdb.md §3.2 is about, arriving here.
eq('a child score of 0 is a real answer',
  S.stormMoveLoss(scored, 'a2a3', 0, C).loss, 32);

// ===========================================================================
// 3) THE VERDICT BANDS AND THE SCORE
// ===========================================================================
// §16: WIN PROBABILITY LOST, not centipawns lost. Two things here are silent:
// the CONVERSION (a wrong `wpK` re-scales every band at once and the verdicts
// stay entirely plausible) and the CALIBRATION against the system this
// replaced, which is the whole claim that this is a change of meaning rather
// than of difficulty.

// The curve itself. Lichess's own fit, and these are the fixed points that
// pin it: equality is 50%, it is symmetric, and it saturates rather than
// running off.
eq('an equal position is a coin toss', Math.round(S.stormWinPct(0, C)), 50);
eq('the curve is symmetric',
  Math.round(S.stormWinPct(300, C) + S.stormWinPct(-300, C)), 100);
eq('a big advantage is not a certainty', S.stormWinPct(500, C) < 90, true);
eq('…and a decisive one is close to one', S.stormWinPct(1000, C) > 97, true);
// THE CLAMP is what keeps a mate score from needing a band of its own: ChessDB
// writes one as ~30000 and the engine tier as `engineMateCp`, and without this
// the arithmetic would run on numbers thirty times the board's own scale.
eq('a mate score is clamped, not special-cased',
  S.stormWinPct(30000, C), S.stormWinPct(C.wpClampCp, C));
eq('…in both directions',
  S.stormWinPct(-30000, C), S.stormWinPct(-C.wpClampCp, C));
eq('no score is no probability', S.stormWinPct(null, C), null);

// THE LOSS IS FLOORED AT 0 — a move scoring better than the book's "best" is
// the book being imprecise, not a bonus to be handed out.
eq('the best move gives up nothing', S.stormWpLoss(0, 0, C), 0);
eq('…and neither does a better one', S.stormWpLoss(0, 50, C), 0);
eq('giving up ground costs', S.stormWpLoss(0, -100, C) > 8, true);

// THE POINT OF THE WHOLE CHANGE: the same centipawn loss is worth less where
// the game is already decided. Measured — 100cp costs 9.10 points of
// probability at equality, 4.96 at +500 and 3.80 at +600 — so the assertion is
// written as a RELATION rather than against those figures, which move with
// `wpK`.
eq('a centipawn is worth less once you are winning',
  S.stormWpLoss(0, -100, C) > 1.5 * S.stormWpLoss(500, 400, C), true);
eq('…and less again the further ahead you are',
  S.stormWpLoss(500, 400, C) > S.stormWpLoss(600, 500, C), true);

// CALIBRATION (§16.2). At EQUALITY the two scoring bands land where the old
// flat 30cp/70cp ones did — which is what makes this a change of meaning
// rather than a change of difficulty, and it is the property a re-tuned `wpK`
// or a re-typed threshold would silently lose.
const cpAtEquality = (band) => {
  let lo = -2000, hi = 0;
  for (let i = 0; i < 200; i++) {
    const m = (lo + hi) / 2;
    if (S.stormWpLoss(0, m, C) > band) lo = m; else hi = m;
  }
  return Math.round(-(lo + hi) / 2);
};
const greatCp = cpAtEquality(C.greatWp), goodCp = cpAtEquality(C.goodWp);
eq('at equality the "great" band is the old 30cp band, within 5cp',
  Math.abs(greatCp - 30) <= 5, true);
eq('…and the "good" band is the old 70cp one, within 5cp',
  Math.abs(goodCp - 70) <= 5, true);
// …and at the top of the frontier band (`userHiCp`) the SAME verdicts are
// reached later, which is the behaviour the old system could not express.
const cpAt = (band, base) => {
  let lo = base - 2000, hi = base;
  for (let i = 0; i < 200; i++) {
    const m = (lo + hi) / 2;
    if (S.stormWpLoss(base, m, C) > band) lo = m; else hi = m;
  }
  return Math.round(base - (lo + hi) / 2);
};
eq('the same band is more forgiving at +200 than at equality',
  cpAt(C.greatWp, C.userHiCp) > greatCp, true);

// The bands themselves. Written with `<`, so a threshold value falls into the
// band BELOW it.
eq('level with the best is great', S.stormGrade(0, C), 'great');
eq('just under greatWp is still great', S.stormGrade(C.greatWp - 0.01, C), 'great');
eq('exactly greatWp is good', S.stormGrade(C.greatWp, C), 'good');
eq('exactly goodWp is an inaccuracy', S.stormGrade(C.goodWp, C), 'ok');
eq('exactly okWp is a mistake', S.stormGrade(C.okWp, C), 'bad');
eq('exactly badWp is a blunder', S.stormGrade(C.badWp, C), 'blunder');
eq('giving up the game is a blunder', S.stormGrade(60, C), 'blunder');
eq('no number is no verdict', S.stormGrade(null, C), 'unknown');
eq('NaN is no verdict', S.stormGrade(NaN, C), 'unknown');
// THE BANDS MUST BE IN ORDER, or one of them is unreachable and nothing says
// so — a five-band ladder typed by hand is exactly where that happens.
eq('the bands ascend', C.greatWp < C.goodWp && C.goodWp < C.okWp &&
  C.okWp < C.badWp, true);

eq('the first great answer scores the base', S.stormPoints('great', 0, C), C.greatPoints);
eq('a good one scores its own base', S.stormPoints('good', 0, C), C.goodPoints);
// THE MIDDLE BAND IS WORTH NOTHING, which is the whole reason it exists: it is
// neither a reward nor a punishment, and giving it either would collapse the
// five bands back into the three this replaced.
eq('an inaccuracy scores nothing', S.stormPoints('ok', 0, C), 0);
eq('…on any streak', S.stormPoints('ok', C.streakStep * 50, C), 0);
eq('a mistake costs badPoints', S.stormPoints('bad', 0, C), C.badPoints);
eq('a blunder costs blunderPoints', S.stormPoints('blunder', 0, C), C.blunderPoints);
// THE FLAT PENALTY, pinned. Multiplying it would make one lapse after twelve
// right answers cost four times what the same lapse costs after none —
// punishing the STREAK rather than the mistake, and it is invisible from the
// outside: the score still moves in the right direction, just by the wrong
// amount, and only on the answers hardest to reproduce deliberately.
eq('…and costs exactly the same on a long streak',
  S.stormPoints('blunder', C.streakStep * 50, C), C.blunderPoints);
eq('…as does a mistake',
  S.stormPoints('bad', C.streakStep * 50, C), C.badPoints);
eq('a pass is a blunder, so it costs the same',
  S.stormPoints('blunder', C.streakStep, C), C.blunderPoints);
eq('an ungradeable answer scores nothing', S.stormPoints('unknown', 99, C), 0);
// §14.10c's card: never answered, so never charged for either.
eq('the card the storm ended on scores nothing',
  S.stormPoints('unanswered', 99, C), 0);
eq('the multiplier steps at streakStep',
  S.stormPoints('great', C.streakStep, C), C.greatPoints * 2);
eq('…and is capped',
  S.stormPoints('great', C.streakStep * 50, C), C.greatPoints * C.streakMax);
eq('good answers ride the same multiplier',
  S.stormPoints('good', C.streakStep, C), C.goodPoints * 2);

// ===========================================================================
// 4) THE PICK RULES
// ===========================================================================
const cand = (over) => Object.assign({
  evalUser: 20, nScored: 20, inCheck: false, recapture: false,
  spread2: 15, spread5: 120,
}, over);

eq('an ordinary post-book position is offered', S.stormPickReject(cand({}), C), null);
eq('a lost position is refused',
  S.stormPickReject(cand({ evalUser: C.userLoCp - 1 }), C), 'you are losing');
eq('a won position is refused',
  S.stormPickReject(cand({ evalUser: C.userHiCp + 1 }), C), 'you are already winning');
eq('the band edges themselves are IN',
  [S.stormPickReject(cand({ evalUser: C.userLoCp }), C),
    S.stormPickReject(cand({ evalUser: C.userHiCp }), C)], [null, null]);
eq('too little scored is refused',
  S.stormPickReject(cand({ nScored: C.minScored - 1 }), C),
  'too few moves scored to rank an answer');
eq('a check is refused', S.stormPickReject(cand({ inCheck: true }), C),
  'in check — the choice is narrow');
eq('a forced recapture is refused', S.stormPickReject(cand({ recapture: true }), C),
  'forced recapture');
// THE RULE THE WHOLE EXERCISE RESTS ON: a position where every move scores the
// same awards and punishes nothing, and offering it teaches the user that their
// judgement is not what is being measured.
eq('a flat position is refused',
  S.stormPickReject(cand({ spread5: C.spreadMinCp - 1 }), C),
  'flat — nothing to get wrong');
eq('…and the threshold itself is IN',
  S.stormPickReject(cand({ spread5: C.spreadMinCp }), C), null);
eq('a one-move tactic is refused',
  S.stormPickReject(cand({ spread2: C.spreadMaxCp + 1 }), C),
  'one move only — a tactic, not intuition');
// Order matters: the counts are reported by FIRST failing rule, so a candidate
// failing two must name the earlier one.
eq('a losing AND flat position names the eval first',
  S.stormPickReject(cand({ evalUser: -900, spread5: 0 }), C), 'you are losing');

// ===========================================================================
// 5) THE FRONTIER SET
// ===========================================================================
const vars = [
  // A normal White line: 1.e4 e5 2.Nf3 Nc6 3.Bb5 — ends after White's move, so
  // BLACK is to move at its frontier, which is what §1's flip is about.
  { oid: 1, name: 'Ruy', color: 'white', sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'] },
  // A second line converging on the SAME frontier by another move order.
  { oid: 2, name: 'Ruy by transposition', color: 'white',
    sans: ['Nf3', 'Nc6', 'e4', 'e5', 'Bb5'] },
  // A tactics puzzle: a custom start FEN, so no real game passes through its
  // frontier. This is 38 of 71 frontiers on the bought course (§6.4).
  { oid: 3, name: 'Puzzle', color: 'white', sans: ['Qh5', 'g6', 'Qxh8'],
    fen: 'rnbqkbnr/pppppp1p/8/6p1/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
  // Too short to have a frontier.
  { oid: 4, name: 'Stub', color: 'black', sans: ['e4', 'c5'] },
  // A line the course does not state a colour for: dropped rather than guessed
  // at, because an inverted answer asks for the OPPONENT's best move.
  { oid: 5, name: 'Colourless', color: 'both', sans: ['d4', 'd5', 'c4', 'e6', 'Nc3'] },
  // An informational card (Chessable writes these with no moves).
  { oid: 6, name: 'Chapter intro', color: 'white', sans: [] },
  // PAUSED / SKIPPED. Ordinary in every other respect — same colour, same
  // length, a frontier a real game passes through — so ONLY the flag can be
  // what excludes it. That is the point: a fixture that would have been
  // dropped anyway proves nothing.
  { oid: 7, name: 'Paused Italian', color: 'white', paused: true,
    sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'] },
  // …and one that would converge on the SURVIVING frontier. It must not add to
  // that frontier's weight or to its name list either: a paused line is not
  // half-excluded.
  { oid: 8, name: 'Paused Ruy', color: 'white', paused: true,
    sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'] },
];
// ===========================================================================
// 6) THE PGN READER
// ===========================================================================
const pgn = [
  '[Event "Rated blitz game"]',
  '[Site "https://lichess.org/DST7LbuE"]',
  '[Result "1-0"]',
  '',
  '1. e4 { [%eval 0.2] } e5 2. Nf3 $1 Nc6 3. Bb5 a6 1-0',
].join('\n');
eq('the PGN reader strips everything but the moves', S.stormPgnMoves(pgn),
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
eq('an empty PGN is an empty list', S.stormPgnMoves(''), []);

// ===========================================================================
// 7) THE WALK
// ===========================================================================
// A SCRIPTED BOOK, but one built off the REAL move generator: ChessDB only ever
// scores legal moves, and a hand-written list of plausible-looking ucis would
// let `stormCard` fall over on an illegal "best move" without the walk noticing.
// So the book generates the position's actual moves, orders them for
// determinism, and hands out a descending ladder of scores.
const LADDER = [0, -12, -40, -60, -130, -200];

function scoredFor(fen, base, override) {
  const pos = CloSan.parseFen(fen);
  const legal = CloSan.generateMoves(pos)
    .map((m) => squareName(m.from) + squareName(m.to) + (m.promo || ''))
    .sort();
  const out = legal.slice(0, LADDER.length).map((uci, i) => ({
    uci,
    san: CloSan.moveToSan(pos, uci) || '',
    score: base + LADDER[i],
    winrate: 54 - i,
  }));
  if (override) override(out, pos, legal);
  out.sort((a, b) => b.score - a.score);
  return out;
}

/** A book that answers every position with the same ladder. */
const book = (base, override) => (fen) => Promise.resolve(scoredFor(fen, base, override));

// A real game carrying on 3...a6 4.Ba4 Nf6 5.O-O Be7 6.Re1 b5. The frontier it
// is walked from — 1.e4 e5 2.Nf3 Nc6 3.Bb5, a White line, so BLACK is to move
// there, which is exactly the shape §1's flip is about — comes out of section 5
// inside the async block below, because the stage-0 walk yields.
const gameSans = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5'];

/** Scores the move the GAME actually plays here far below the best, so the
 *  blunder stop fires. */
const blunderBook = (fen) => {
  const pos = CloSan.parseFen(fen);
  return Promise.resolve(scoredFor(fen, 20, (out) => {
    const played = playedUciAt(fen);
    if (!played) return;
    const hit = out.find((m) => m.uci === played);
    if (hit) hit.score = 20 - C.blunderCp - 10;
    else {
      out.push({ uci: played, san: CloSan.moveToSan(pos, played) || '',
        score: 20 - C.blunderCp - 10, winrate: 20 });
    }
  }));
};

// The positions the game passes through, so the blunder book knows which move
// was played at each one.
const gameLine = (() => {
  const out = new Map();
  let fen = START_FEN;
  for (const san of gameSans) {
    const pos = CloSan.parseFen(fen);
    const uci = S.sanToUci(pos, san);
    out.set(cacheKey(fen), uci);
    fen = S.fenAfterUci(fen, uci);
  }
  return out;
})();
const playedUciAt = (fen) => gameLine.get(cacheKey(fen)) || null;

/**
 * §20) Does this arrival's own `before` position, with its move played, really
 * land on `fen`? Written to REPORT rather than throw when the field is missing
 * — that is exactly the control's shape, and a control that dies on the first
 * assertion says nothing about the rest.
 */
const leadsTo = (arrived, fen) => {
  if (!arrived || !arrived.before || !arrived.uci) return false;
  const after = S.fenAfterUci(arrived.before, arrived.uci);
  return Boolean(after) && cacheKey(after) === cacheKey(fen);
};

(async () => {
  const frontiers = await S.stormFrontiers(vars, C);
  eq('only the two real line ends survive', frontiers.length, 1);
  eq('…and they converge on ONE frontier', frontiers[0].n, 2);
  // --- paused lines (2026-08-28) ------------------------------------------
  // Chessable's own variation card reads `1 == e.paused` off the getList row,
  // and its tooltip calls the same flag "PAUSED" or "SKIPPED" depending on
  // `isPausable`. Both mean "do not prompt me about this line".
  eq('a paused line contributes no frontier of its own',
    frontiers.some((f) => f.names.indexOf('Paused Italian') >= 0), false);
  eq('…nor its NAME to a frontier it shares',
    frontiers[0].names.indexOf('Paused Ruy') >= 0, false);
  eq('…nor its WEIGHT, which is what the draw is biased by', frontiers[0].n, 2);
  eq('the count is reported so a refusal can say why', frontiers.paused, 2);
  eq('a course with nothing paused reports zero',
    (await S.stormFrontiers([vars[0]], C)).paused, 0);
  // The flag is read as Chessable reads it: the wire carries 0/1, not a boolean.
  eq('paused: 1 excludes the line', (await S.stormFrontiers(
    [{ oid: 1, name: 'W', color: 'white', paused: 1, sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'] }],
    C)).length, 0);
  eq('paused: 0 does not', (await S.stormFrontiers(
    [{ oid: 1, name: 'W', color: 'white', paused: 0, sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'] }],
    C)).length, 1);
  eq('the frontier belongs to White', frontiers[0].side, 'w');
  eq('…and BLACK is to move there', frontiers[0].fen.split(' ')[1], 'b');
  eq('it names the lines that end there', frontiers[0].names.length, 2);
  // The dropped ones, asserted by absence so a loosened rule fails loudly.
  eq('no custom-FEN frontier is in the set',
    frontiers.some((f) => f.names.indexOf('Puzzle') >= 0), false);
  eq('no colourless frontier is in the set',
    frontiers.some((f) => f.names.indexOf('Colourless') >= 0), false);

  // A frontier that lines of BOTH colours end on is ambiguous about whose move
  // the storm should ask for, so it is dropped.
  const mixed = await S.stormFrontiers([
    { oid: 1, name: 'W', color: 'white', sans: ['e4', 'e5', 'Nf3', 'Nc6'] },
    { oid: 2, name: 'B', color: 'black', sans: ['e4', 'e5', 'Nf3', 'Nc6'] },
  ], C);
  eq('a frontier two repertoires share is dropped', mixed.length, 0);

  // --- §14.18: a line that ends where another one carries on ---------------
  // The measured shape (2026-08-28): course 453453 has "Sicilian: 2...Nc6 3.d4"
  // ending on 6...Bg7 while three other cards play 7.Be3 from that very
  // position, and 291847 has eight "- Introduction" model-game headers stopping
  // exactly where the game itself continues. Storming such an end walks a real
  // game forward from a position the repertoire already answers.
  const stubSans = ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4', 'g6'];
  const deepSans = stubSans.concat(['Nc3', 'Bg7', 'Be3', 'Nf6']);
  const stubs = await S.stormFrontiers([
    { oid: 1, name: 'Overview stub', color: 'white', sans: stubSans },
    { oid: 2, name: 'The real line', color: 'white', sans: deepSans },
  ], C);
  eq('a line ending inside another one is not a frontier',
    stubs.some((f) => f.names.indexOf('Overview stub') >= 0), false);
  eq('…and the line that carries on still has its own',
    stubs.length === 1 && stubs[0].names[0], 'The real line');
  eq('the count is reported so a refusal can say why', stubs.covered, 1);
  eq('a course with no stubs reports zero',
    (await S.stormFrontiers([{ oid: 2, name: 'The real line', color: 'white',
      sans: deepSans }], C)).covered, 0);
  // SCOPED TO THE FRONTIER'S OWN SIDE. A Black line playing a move in that
  // position says nothing about whether the WHITE repertoire continues there —
  // it is the other half of the same board, met from the other end.
  const crossColour = await S.stormFrontiers([
    { oid: 1, name: 'Overview stub', color: 'white', sans: stubSans },
    { oid: 2, name: 'Black meets it', color: 'black', sans: deepSans },
  ], C);
  eq('a line of the OTHER colour continuing does not exclude it',
    crossColour.some((f) => f.names.indexOf('Overview stub') >= 0), true);
  // …and the two asymmetries with the source rules above. Both lines below are
  // barred from BEING a frontier and both are still evidence that the course
  // answers the position — which is the whole of the question here.
  const byPuzzle = await S.stormFrontiers([
    { oid: 1, name: 'Overview stub', color: 'white', sans: stubSans },
    // 291847's shape exactly: an "Improving Our Position" card whose custom
    // start FEN IS the stub's last position.
    { oid: 2, name: 'Improving Our Position', color: 'white', sans: ['Nc3', 'Bg7'],
      fen: 'r1bqkbnr/pp1ppp1p/2n3p1/8/3NP3/8/PPP2PPP/RNBQKB1R w KQkq - 0 5' },
  ], C);
  eq('a CUSTOM-FEN line continuing there excludes it',
    byPuzzle.some((f) => f.names.indexOf('Overview stub') >= 0), false);
  const byPaused = await S.stormFrontiers([
    { oid: 1, name: 'Overview stub', color: 'white', sans: stubSans },
    { oid: 2, name: 'Paused deep line', color: 'white', paused: 1, sans: deepSans },
  ], C);
  eq('a PAUSED line continuing there excludes it too',
    byPaused.some((f) => f.names.indexOf('Overview stub') >= 0), false);
  eq('…and is still counted as paused for its own end', byPaused.paused, 1);

  // The weighted draw removes what it hands out, so a session never repeats a
  // frontier however the random numbers fall.
  const pool = [{ n: 1 }, { n: 1 }, { n: 1 }];
  const drawn = [S.stormDrawFrontier(pool, () => 0.99), S.stormDrawFrontier(pool, () => 0),
    S.stormDrawFrontier(pool, () => 0.5)];
  eq('the draw empties the pool', pool.length, 0);
  eq('…handing out three distinct frontiers', new Set(drawn).size, 3);
  eq('an empty pool answers null', S.stormDrawFrontier(pool, () => 0), null);
  // Weighted: with one frontier carrying nine tenths of the weight, a draw at the
  // very bottom of the range must not land on it.
  const weighted = [{ n: 90, tag: 'fat' }, { n: 10, tag: 'thin' }];
  eq('the weight orders the draw', S.stormDrawFrontier(weighted, () => 0.99).tag, 'thin');

  const fFen = frontiers[0].fen;
  // §20) …and the position it was reached FROM, which is the lead-in the
  // analysis board opens on.
  const preFen = (() => {
    let fen = START_FEN;
    let prev = null;
    for (const san of gameSans) {
      if (cacheKey(fen) === cacheKey(fFen)) break;
      prev = fen;
      fen = S.fenAfterUci(fen, S.sanToUci(CloSan.parseFen(fen), san));
    }
    return prev;
  })();

  // --- §14.21: A CHAPTER SCOPE (v0.148.0) ---------------------------------
  // §15 built "which part of my repertoire do I not understand one move past
  // the book" and left the only available response a whole-course storm. The
  // scope is a FILTER on the frontier pool and on the store, never a term in
  // `stormStoreDraw`'s comparator — §14.15's rule, and the reason both filters
  // are pure functions this file can execute.
  eq('every line ending at a frontier is recorded, not just the first three',
    frontiers[0].oids.length, 2);
  eq('…while the NAMES stay capped, which is what that cap was for',
    frontiers[0].names.length <= 3, true);
  // The cap mattered: a frontier four lines converge on answered the chapter
  // question wrongly and silently while only three oids were kept.
  const manyEnd = await S.stormFrontiers([
    { oid: 11, name: 'A', color: 'white', sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'] },
    { oid: 12, name: 'B', color: 'white', sans: ['Nf3', 'Nc6', 'e4', 'e5', 'Bb5'] },
    { oid: 13, name: 'C', color: 'white', sans: ['e4', 'Nc6', 'Nf3', 'e5', 'Bb5'] },
    { oid: 14, name: 'D', color: 'white', sans: ['Nf3', 'e5', 'e4', 'Nc6', 'Bb5'] },
  ], C);
  eq('four lines converging on one frontier record four oids',
    manyEnd.length === 1 && manyEnd[0].oids.length, 4);
  eq('…and still name only three', manyEnd[0].names.length, 3);
  eq('a chapter holding only the FOURTH of them still finds the frontier',
    S.stormFilterPool(manyEnd, new Set(['14'])).length, 1);

  // The pool filter, and the properties it MUST carry across: `cont` is
  // §14.18.4's walk stop, `paused` and `covered` word the refusals. A plain
  // `.filter()` drops all three and switches that stop off, silently, for
  // every chapter-scoped session.
  const scoped = S.stormFilterPool(frontiers, new Set(['1']));
  eq('a chapter the frontier belongs to keeps it', scoped.length, 1);
  eq('…and one it does not, drops it',
    S.stormFilterPool(frontiers, new Set(['999'])).length, 0);
  eq('the continuation index survives the filter', scoped.cont, frontiers.cont);
  eq('…and so does the paused count', scoped.paused, frontiers.paused);
  eq('…and the covered one', scoped.covered, frontiers.covered);
  eq('what was left out is counted, for the note',
    S.stormFilterPool(manyEnd, new Set(['14'])).dropped, 0);
  eq('no filter at all is the pool itself',
    S.stormFilterPool(frontiers, null), frontiers);

  // The store filter — the half that matters, since §14.11 is why a session
  // opens at once.
  const scopeStore = {
    mine:   { f: fFen, o: '1', m: [['g1f3', 'Nf3', 12]], k: 0 },
    theirs: { f: fFen, o: '2', m: [['g1f3', 'Nf3', 12]], k: 0 },
    old:    { f: fFen, m: [['g1f3', 'Nf3', 12]], k: 0 },   // pre-v0.140.0: no oid
  };
  const scopeCut = S.stormFilterStore(scopeStore, new Set(['1']));
  eq('the chapter’s own stored positions are kept', Object.keys(scopeCut.kept), ['mine']);
  eq('…another chapter’s are dropped and counted', scopeCut.dropped, 1);
  // A POSITION WITH NO OID IS EXCLUDED, not included on the benefit of the
  // doubt: it could be from anywhere, and offering it under a heading naming a
  // chapter is a claim the session cannot support.
  eq('…and one that cannot be attributed at all is excluded', scopeCut.unattributed, 1);
  eq('…and is NOT quietly counted as another chapter’s', scopeCut.dropped, 1);
  eq('the filtered store still draws in the ordinary order',
    S.stormStoreDraw(scopeCut.kept, () => 0.5, C).map((x) => x.ck), ['mine']);
  eq('an empty store filters to nothing without complaint',
    Object.keys(S.stormFilterStore({}, new Set(['1'])).kept).length, 0);

  // --- an ordinary walk ---------------------------------------------------
  const ordinary = await S.stormWalkGame(fFen, 'w', gameSans, book(20), C);
  eq('the walk finds the frontier', ordinary.found, true);
  eq('every offered position has the USER to move',
    ordinary.out.every((c) => c.fen.split(' ')[1] === 'w'), true);
  eq('none is offered before minPly',
    ordinary.out.every((c) => c.ply >= C.minPly), true);
  eq('an ordinary walk offers something', ordinary.out.some((c) => !c.reject), true);
  eq('a candidate carries the move that led to it',
    Boolean(ordinary.out[0].arrived && ordinary.out[0].arrived.uci), true);
  // §20) …AND THE POSITION IT WAS PLAYED FROM, which is the one field of an
  // arrival that cannot be recomputed: a capture loses the captured piece, so a
  // FEN cannot be un-played. It is what lets the analysis board open one ply
  // earlier and play the opponent's move in, so an added puzzle carries the
  // move that MADE the position. The property worth asserting is not that the
  // field is filled but that it is the RIGHT position — a `before` that does
  // not lead here opens the board a ply short with the wrong side to move,
  // which is this feature's one plausible silent failure.
  eq('…and the position that move was played FROM, which really leads here',
    leadsTo(ordinary.out[0].arrived, ordinary.out[0].fen), true);
  eq('…for every position the walk offers',
    ordinary.out.every((c) => leadsTo(c.arrived, c.fen)), true);
  eq('…and the whole scored list, so grading needs no second request',
    ordinary.out[0].scored.length, LADDER.length);
  eq('the walk runs to the end of the game', ordinary.stop, 'the game ended');
  // THE FLIP, WHERE IT ACTUALLY BITES. Inside the walk every offered position
  // is one where the USER is to move — that is the collection condition — so
  // `stormUserEval` is the identity there and a lost flip would not show. It
  // bites at STAGE 0, on the frontier itself, where the side to move is the
  // OPPONENT's: a White line ending after White's move leaves Black to move,
  // and reading Black's +116 as the White repertoire's is §6.5's bug exactly.
  eq('every offered position is one the user is to move in',
    ordinary.out.every((c) => c.fen.split(' ')[1] === c.userColor), true);
  eq('…so the walk’s own eval is the book’s, unflipped',
    ordinary.out[0].evalUser, ordinary.out[0].scored[0].score);
  const fStm = fFen.split(' ')[1];
  eq('the frontier of a White line has BLACK to move', [fStm, frontiers[0].side], ['b', 'w']);
  eq('…so a +116 book there is −116 for the repertoire',
    S.stormUserEval(116, fStm, frontiers[0].side), -116);
  eq('…and a frontier at +1.16 for the OPPONENT is outside the band',
    S.stormPickReject({ evalUser: S.stormUserEval(116, fStm, frontiers[0].side),
      nScored: 20, inCheck: false, recapture: false, spread2: 15, spread5: 120 }, C),
    'you are losing');

  // --- the frontier's own last move ---------------------------------------
  // The very first card must still say how its position was arrived at, and at
  // the frontier that move is the course's own final ply — which is not inside
  // the loop at all, so it is the one `arrived` a naive walk loses.
  const atFrontier = await S.stormWalkGame(
    fFen, 'b', gameSans, book(20), Object.assign({}, C, { minPly: 1 }));
  eq('the frontier position knows its own arriving move',
    atFrontier.out[0].arrived.san, 'Bb5');
  // §20) …and the position it came from, which the loop above never visits:
  // that ply is played in the fast-forward, before the walk proper begins, so
  // it is the one `before` a naive implementation loses.
  eq('…and the position that move was played from',
    leadsTo(atFrontier.out[0].arrived, fFen), true);
  // The same ply, read off the FRONTIER rather than off a game — this is what
  // the invented-line walk is seeded with when the explorer has no games.
  eq('a frontier carries the course’s own last move and where it was played from',
    leadsTo({ before: frontiers[0].lastFen, uci: frontiers[0].lastUci }, frontiers[0].fen),
    true);

  // --- a game that never reaches the frontier -----------------------------
  const elsewhere = await S.stormWalkGame(
    fFen, 'w', ['d4', 'd5', 'c4', 'e6'], book(20), C);
  eq('a game that misses the frontier yields nothing', elsewhere.found, false);
  eq('…and says so', elsewhere.stop, 'never reached the frontier');

  // --- the stop rules -----------------------------------------------------
  const unknown = await S.stormWalkGame(fFen, 'w', gameSans, () => Promise.resolve(null), C);
  eq('an unscored position stops the walk', unknown.stop, 'nothing could score this position');
  eq('…with nothing offered', unknown.out.length, 0);

  const decided = await S.stormWalkGame(fFen, 'w', gameSans, book(C.decidedCp + 50), C);
  eq('a decided position stops the walk', decided.stop, 'the position is already decided');
  eq('…before offering anything', decided.out.length, 0);

  // The blunder rule fires on BOTH sides. 3...a6 is Black's, so a White-side
  // walk must name the OPPONENT — which is what stops a
  // convert-an-advantage exercise from being offered one ply later.
  const blundered = await S.stormWalkGame(fFen, 'w', gameSans, blunderBook, C);
  eq('a blunder by the opponent stops the walk', blundered.stop, 'the opponent erred here');
  const ownBlunder = await S.stormWalkGame(
    fFen, 'b', gameSans, blunderBook, Object.assign({}, C, { minPly: 1 }));
  eq('a blunder by the user stops the walk too', ownBlunder.stop, 'you would have erred here');

  const short = await S.stormWalkGame(
    fFen, 'w', gameSans, book(20), Object.assign({}, C, { maxPly: 2 }));
  eq('maxPly stops the walk', short.stop, 'the walk reached its ply limit');

  // --- §14.18.3: the walk re-entering the repertoire -----------------------
  // v0.144.0 stopped the storm asking about a line END that sits inside another
  // line. A WALK can arrive at the same place one move later — a real game is
  // free to leave the repertoire at the very first move the repertoire had an
  // answer for — and the card it produces looks exactly like a good one, which
  // is why this fails silently and needs a fixture that actually re-enters.
  //
  // THE FIXTURE HAS TO REACH THE LATER POSITION BY ANOTHER MOVE ORDER, or the
  // §14.18 stub filter would have dropped the frontier before the walk began:
  // 1.e4 e5 2.Nf3 a6 3.Bb5 Nc6 4.Ba4 arrives at the position after 3...a6 of
  // the main order without ever standing on the Ruy frontier itself.
  const reentry = await S.stormFrontiers([
    { oid: 1, name: 'Ruy', color: 'white', sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'] },
    { oid: 9, name: 'Morphy by transposition', color: 'white',
      sans: ['e4', 'e5', 'Nf3', 'a6', 'Bb5', 'Nc6', 'Ba4'] },
  ], C);
  const ruy = reentry.filter((f) => f.names.indexOf('Ruy') >= 0)[0];
  eq('the transposing line does not itself exclude the frontier', Boolean(ruy), true);
  const covW = reentry.cont && reentry.cont.w;
  eq('the continuation index rides out on the pool', covW instanceof Set, true);
  const freeWalk = await S.stormWalkGame(ruy.fen, 'w', gameSans, book(20), C);
  eq('with no index the walk offers positions as before', freeWalk.out.length > 0, true);
  const stopped = await S.stormWalkGame(ruy.fen, 'w', gameSans, book(20), C, covW);
  eq('a walk back into the repertoire stops',
    stopped.stop, 'your own course answers this position');
  eq('…and the position it stopped AT is not offered', stopped.out.length, 0);
  // SCOPED TO THE USER'S OWN MOVE, which is the precision of the rule rather
  // than an optimisation: the index holds every ply's `before`, the opponent's
  // included, and an opponent-to-move position in it means only that the course
  // has a reply prepared for what the opponent is ABOUT to play. If they play
  // something else the user really is unprepared — which is the good half.
  const gameFens = (() => {
    let fen = START_FEN;
    const out = [fen];
    for (const san of gameSans) {
      fen = S.fenAfterUci(fen, S.sanToUci(CloSan.parseFen(fen), san));
      out.push(fen);
    }
    return out;
  })();
  eq('the fixture position really is the one the course transposes into',
    covW.has(S.stormCoverKey(gameFens[6])), true);
  eq('…and it is the user’s move there', gameFens[6].split(' ')[1], 'w');
  const oppOnly = new Set([S.stormCoverKey(gameFens[7])]);
  eq('the same position with the OPPONENT to move is not in the index',
    covW.has(S.stormCoverKey(gameFens[7])), false);
  const opponentCovered = await S.stormWalkGame(ruy.fen, 'w', gameSans, book(20), C, oppOnly);
  eq('an opponent-to-move position in the index does not stop the walk',
    opponentCovered.out.length, freeWalk.out.length);
  eq('…and the walk runs on to its ordinary end',
    opponentCovered.stop, freeWalk.stop);
  // The predicate itself, since the side scoping is the one thing here that is
  // wrong invisibly — a rule that never fires yields MORE positions.
  eq('a user-to-move position the course answers is a re-entry',
    S.stormReentered(covW, CloSan.parseFen(gameFens[6]), gameFens[6], 'w'), true);
  eq('…asked of the other side it is not',
    S.stormReentered(covW, CloSan.parseFen(gameFens[6]), gameFens[6], 'b'), false);
  eq('no index at all is never a re-entry',
    S.stormReentered(null, CloSan.parseFen(gameFens[6]), gameFens[6], 'w'), false);
  // §14.17: it gets a row of its own in the funnel, so how often it fires is a
  // number before it is an argument.
  const reFn = S.stormFunnelBlank();
  S.stormFunnelWhy(reFn, 'stops', stopped.stop);
  S.stormFunnelWhy(reFn, 'stops', freeWalk.stop);
  eq('the re-entry stop is counted separately from every other reason',
    Object.keys(reFn.stops).length, 2);
  eq('…under its own name', reFn.stops['your own course answers this position'], 1);

  // --- the flat rule, through the walk ------------------------------------
  const flat = await S.stormWalkGame(fFen, 'w', gameSans,
    (fen) => Promise.resolve(scoredFor(fen, 20).map((m, i) => ({ ...m, score: 20 - i }))), C);
  eq('a flat book offers nothing at all', flat.out.every((c) => c.reject), true);
  eq('…and says why', flat.out[0].reject, 'flat — nothing to get wrong');

  // ===========================================================================
  // 8) THE CARD
  // ===========================================================================
  // A card carries exactly ONE ply, the position's own best move. That is not
  // decoration: `startLine` ends in `step()`, and an EMPTY ply list reads there
  // as "this line is already finished", so the card would be skipped the instant
  // it was put on the board.
  const usable = ordinary.out.find((c) => !c.reject);
  const card = S.stormCard(usable, frontiers[0]);
  eq('a card is built', Boolean(card), true);
  eq('…with exactly one ply', card.plies.length, 1);
  eq('…of the user’s own colour', card.plies[0].color, card.userColor);
  eq('…which is the position’s best move', card.plies[0].uci, usable.scored[0].uci);
  eq('…spelled by our own generator, not by ChessDB',
    card.plies[0].san, CloSan.moveToSan(CloSan.parseFen(usable.fen), usable.scored[0].uci));
  eq('the ply carries the position after it',
    card.plies[0].fen, S.fenAfterUci(usable.fen, usable.scored[0].uci));
  eq('the card is keyed on the position, so a session cannot repeat one',
    card.key, 'storm:' + cacheKey(usable.fen));
  eq('it keeps the best move’s own score for the verdict line',
    card.storm.bestScore, usable.scored[0].score);
  eq('…and how far past the course’s own line the position is',
    card.storm.plyPast, usable.ply);
  // A candidate whose best move will not resolve is REFUSED, never guessed at.
  eq('an unresolvable best move yields no card',
    S.stormCard(Object.assign({}, usable, {
      scored: [{ uci: 'a1a8', san: '??', score: 0 }],
    }), frontiers[0]), null);

  // ===========================================================================
  // 9) THE VERDICT LINE
  // ===========================================================================
  // §8.1's one line, and it is one line because the clock is running. Checked
  // here because the failure found live was in exactly this shape: playing the
  // TOP move printed it twice — "best Nxf3+ -0.89   Nxf3+ -0.89" — which reads
  // as a defect rather than as agreement.
  const cardOf = (over) => Object.assign({
    bestSan: 'Bb5', bestScore: 32, bestWinrate: 54, from: 'Ruy', plyPast: 6,
    cand: { nScored: 31 },
  }, over);

  eq('a plain centipawn score reads as pawns', S.stormCp(32), '+0.32');
  eq('…negative keeps its sign', S.stormCp(-116), '-1.16');
  // Two decimals, so an integer centipawn always has digits: -1cp really is
  // -0.01 here, and the "never -0.00" guard the panel's own 1dp column needs
  // (section 26) is only ever reached at exactly zero.
  eq('one centipawn is a real figure at two decimals', S.stormCp(-1), '-0.01');
  eq('…and exactly zero is written without a sign', S.stormCp(0), '0.00');
  eq('a missing score is nothing at all', S.stormCp(undefined), '');

  // §16: THE LINE PRINTS WIN PROBABILITY, one decimal under ten points and
  // none above — "23.4%" is a precision the figure does not have, and the
  // difference between 23% and 24% changes no verdict.
  eq('a small loss keeps its decimal', S.stormWp(3.44), '3.4%');
  eq('…and a large one does not', S.stormWp(23.4), '23%');
  eq('a missing figure is nothing at all', S.stormWp(null), '');

  eq('the top move says so',
    S.stormVerdictLine({ verdict: 'great', userSan: 'Bb5', rank: 1, wp: 0, points: 2 }, cardOf()),
    'Bb5 · the top move · level with the best · +2');
  eq('a ranked move names its place',
    S.stormVerdictLine({ verdict: 'good', userSan: 'Nf3', rank: 4, wp: 3.44, points: 1 }, cardOf()),
    'Nf3 · #4 of 31 · 3.4% of the game · +1');
  eq('a move graded through the child has no rank to name',
    S.stormVerdictLine({ verdict: 'bad', userSan: 'a3', rank: null, wp: 14.2, points: 0 }, cardOf()),
    'a3 · 14% of the game');
  // SIGNED, since v0.139.0: a mistake scores a NEGATIVE number, and the old
  // unconditional '+' rendered the penalty as "+-2" — a bug that survives
  // every numeric assertion about `stormPoints` above.
  eq('a penalty is printed with its own sign',
    S.stormVerdictLine({ verdict: 'blunder', userSan: 'a3', rank: null, wp: 31.5,
      points: C.blunderPoints }, cardOf()),
    'a3 · 32% of the game · ' + C.blunderPoints);
  eq('…and a reward keeps its plus',
    S.stormVerdictLine({ verdict: 'great', userSan: 'Bb5', rank: 1, wp: 0, points: 6 }, cardOf()),
    'Bb5 · the top move · level with the best · +6');
  // A LOSS TOO SMALL TO PRINT IS NOT A LOSS. Without the floor the line would
  // read "0.0% of the game", which is a claim of imprecision about a move that
  // was simply the best one.
  eq('a hair behind the best still reads as level',
    S.stormVerdictLine({ verdict: 'great', userSan: 'Bb5', rank: 2, wp: 0.01, points: 2 }, cardOf()),
    'Bb5 · #2 of 31 · level with the best · +2');
  eq('a pass says what it was',
    S.stormVerdictLine({ verdict: 'blunder', passed: true }, cardOf()), 'Passed — no answer given');
  eq('an ungradeable move claims nothing about the move',
    S.stormVerdictLine({ verdict: 'unknown', userSan: 'Nxh2' }, cardOf()),
    'Nxh2 — ChessDB cannot score it here');

  // §14.10c: THE CARD THE STORM ENDED ON. It reaches the review with no rank,
  // no loss and no points, which every other arm here would print as "your
  // move" — a sentence claiming an answer that was never given. The arm has to
  // come FIRST, above `passed`, since a card abandoned mid-grade is neither.
  eq('the position the clock ran out on says so',
    S.stormVerdictLine({ verdict: 'unanswered', unanswered: true, userSan: '',
      wp: null, loss: null, rank: null }, cardOf()),
    'Not answered — the storm ended on this position');
  eq('…and one abandoned mid-grade names the move instead',
    S.stormVerdictLine({ verdict: 'unanswered', unanswered: true, userSan: 'Nf3',
      wp: null, loss: null, rank: null }, cardOf()),
    'Nf3 — the storm ended before it was graded');
  eq('an unanswered card still names the best move there was',
    S.stormBestLine({ verdict: 'unanswered', unanswered: true, userSan: '' }, cardOf()),
    'best Bb5 +0.32 · 54%');

  // THE BUG FOUND LIVE, pinned: the user's move is named only when it is a
  // DIFFERENT move from the best.
  eq('playing the top move prints it once',
    S.stormBestLine({ verdict: 'great', userSan: 'Bb5', rank: 1, userScore: 32, userWinrate: 54 }, cardOf()),
    'best Bb5 +0.32 · 54%');
  eq('…however the rank came out, if the SAN agrees',
    S.stormBestLine({ verdict: 'great', userSan: 'Bb5', rank: null, userScore: 32 }, cardOf()),
    'best Bb5 +0.32 · 54%');
  eq('a different move IS named, with both win rates',
    S.stormBestLine({ verdict: 'good', userSan: 'Nf3', rank: 4, userScore: -10, userWinrate: 49 }, cardOf()),
    'best Bb5 +0.32 · 54%   Nf3 -0.10 · 49%');
  eq('…and without one where the child supplied the score',
    S.stormBestLine({ verdict: 'blunder', userSan: 'a3', rank: null, userScore: -148, userWinrate: null }, cardOf()),
    'best Bb5 +0.32 · 54%   a3 -1.48');
  eq('a best move with no win rate of its own still prints',
    S.stormBestLine({ verdict: 'unknown', userSan: 'Nxh2' },
      cardOf({ bestSan: 'Qe8', bestScore: -83, bestWinrate: undefined })),
    'best Qe8 -0.83');

  // ===========================================================================
  // 10) THE ENGINE TIER'S OWN PERSPECTIVE FLIP (§3.4's third source)
  // ===========================================================================
  // THE SECOND SILENT FLIP IN THIS FEATURE, and it runs the other way from the
  // first: `engine/engine.js` normalises every score to WHITE at its own
  // boundary, while ChessDB's are the MOVER's. Lose the sign and every
  // Black-to-move verdict becomes its own opposite, still printing a number
  // nobody can tell is backwards.
  eq('white to move takes the engine score as it stands',
    S.stormMoverCp({ cp: 120 }, 'w', C), 120);
  eq('black to move negates it', S.stormMoverCp({ cp: 120 }, 'b', C), -120);
  eq('…and a Black advantage reads positive for Black',
    S.stormMoverCp({ cp: -120 }, 'b', C), 120);
  eq('the two readings of one score are opposite',
    S.stormMoverCp({ cp: 77 }, 'w', C) === -S.stormMoverCp({ cp: 77 }, 'b', C), true);
  // A mate maps near ±mateCp MINUS its distance, so "missed a mate" is a huge
  // loss while mate-in-3 against mate-in-5 is negligible.
  eq('mate in 3 for the mover', S.stormMoverCp({ mate: 3 }, 'w', C), C.engineMateCp - 3);
  eq('…is the same for Black to move with a negative mate',
    S.stormMoverCp({ mate: -3 }, 'b', C), C.engineMateCp - 3);
  eq('being mated is the mirror', S.stormMoverCp({ mate: -3 }, 'w', C), -C.engineMateCp + 3);
  eq('a faster mate scores higher than a slower one',
    S.stormMoverCp({ mate: 3 }, 'w', C) > S.stormMoverCp({ mate: 5 }, 'w', C), true);
  // …and §16 is what makes that concrete: both mates clamp to the same end of
  // the curve, so preferring a slower one costs NOTHING at all, while missing
  // one entirely is most of the game.
  eq('…but choosing the slower mate costs nothing',
    S.stormWpLoss(S.stormMoverCp({ mate: 3 }, 'w', C),
      S.stormMoverCp({ mate: 5 }, 'w', C), C), 0);
  eq('…while missing the mate for a modest edge is a blunder',
    S.stormGrade(S.stormWpLoss(S.stormMoverCp({ mate: 3 }, 'w', C), 300, C), C), 'blunder');
  eq('a score of 0 is a real score, not an absence',
    S.stormMoverCp({ cp: 0 }, 'b', C), -0);
  eq('an evaluation carrying neither is refused', S.stormMoverCp({}, 'w', C), null);
  eq('…and so is nothing at all', S.stormMoverCp(null, 'w', C), null);

  // THE LINE AN ENGINE-GRADED VERDICT PRINTS names the ENGINE's best, never
  // ChessDB's: both halves of a comparison have to come from one evaluator,
  // which is the same rule that makes this tier TWO searches rather than one.
  // §14.20: the provenance MOVED to the second line in v0.147.0. The verdict
  // line is read in about a second with a clock running and is not to be
  // lengthened; it says how you did, not where the number came from.
  eq('the verdict line does NOT carry the source',
    S.stormVerdictLine({ verdict: 'bad', userSan: 'Nxh2', rank: null, wp: 12.7,
      source: 'engine', points: 0 }, cardOf()),
    'Nxh2 · 13% of the game');
  eq('…and reads the same whichever tier graded it',
    S.stormVerdictLine({ verdict: 'bad', userSan: 'Nxh2', rank: null, wp: 12.7,
      source: 'engine', points: 0 }, cardOf()),
    S.stormVerdictLine({ verdict: 'bad', userSan: 'Nxh2', rank: null, wp: 12.7,
      source: 'list', points: 0 }, cardOf()));
  eq('…and names the ENGINE’s best, not the book’s',
    S.stormBestLine({ verdict: 'bad', userSan: 'Nxh2', rank: null, userScore: -108,
      source: 'engine', bestSan: 'Qf3', bestScore: 32 }, cardOf()),
    'best Qf3 +0.32   Nxh2 -1.08   · by Stockfish');
  eq('…with no win rate, which is a book figure and not a search one',
    S.stormBestLine({ verdict: 'bad', userSan: 'Nxh2', rank: null, userScore: -108,
      source: 'engine', bestSan: 'Qf3', bestScore: 32,
      userWinrate: 41 }, cardOf()).indexOf('%'), -1);
  eq('an engine verdict agreeing with the engine’s best prints it once',
    S.stormBestLine({ verdict: 'good', userSan: 'Qf3', rank: null, userScore: 32,
      source: 'engine', bestSan: 'Qf3', bestScore: 32 }, cardOf()),
    'best Qf3 +0.32   · by Stockfish');

  // --- §14.20: WHICH TIER GRADED THE CARD (v0.147.0) ----------------------
  // Three sources of wildly different strength — the position's own scored
  // list, one `queryall` on the child, and two Stockfish searches — arrived
  // wearing ONE treatment and ONE tooltip. DESIGN-chessdb.md §3.3's standing
  // rule is that a `learn=1` fill-in must never be presented as a book eval;
  // read forwards it says three claims must not be presented as one.
  eq('the position’s own ranking is named', S.stormSourceLabel({ source: 'list' }),
    'ChessDB’s ranking here');
  eq('…and one more request about the child is a DIFFERENT claim',
    S.stormSourceLabel({ source: 'child' }), 'scored one move on');
  eq('the engine tier names the engine and the depth it actually ran to',
    S.stormSourceLabel({ source: 'engine', depth: 20 }), 'by Stockfish d20');
  eq('…and still names the engine where no depth was recorded',
    S.stormSourceLabel({ source: 'engine' }), 'by Stockfish');
  eq('a verdict with no source claims nothing', S.stormSourceLabel({}), '');
  // On the SECOND line, last on it, and for EVERY source — naming only the odd
  // one out is what left 'list' and 'child' reading as the same claim.
  eq('the book’s own ranking is named too, not only the odd one out',
    S.stormBestLine({ verdict: 'good', userSan: 'Nf3', rank: 4, userScore: -10,
      userWinrate: 49, source: 'list' }, cardOf()),
    'best Bb5 +0.32 · 54%   Nf3 -0.10 · 49%   · ChessDB’s ranking here');
  eq('…and so is a child-scored one',
    S.stormBestLine({ verdict: 'blunder', userSan: 'a3', rank: null, userScore: -148,
      source: 'child' }, cardOf()),
    'best Bb5 +0.32 · 54%   a3 -1.48   · scored one move on');
  eq('a verdict with no source adds nothing to the line',
    S.stormBestLine({ verdict: 'unknown', userSan: 'Nxh2' }, cardOf()),
    'best Bb5 +0.32 · 54%');

  // `.clo-cdb--est` MEANS "ChessDB computed this for us just now" and nothing
  // else. It was applied UNCONDITIONALLY until v0.147.0, i.e. to the one source
  // it is false of — DESIGN-chessdb.md §3.3's rule broken the other way round.
  // Both display hosts read this one predicate.
  eq('a list-graded verdict is a ChessDB estimate',
    S.stormEstimated({ source: 'list' }), true);
  eq('…and so is a child-graded one', S.stormEstimated({ source: 'child' }), true);
  eq('an ENGINE-graded verdict is not', S.stormEstimated({ source: 'engine' }), false);
  eq('an ungraded verdict is still ChessDB’s silence, not the engine’s',
    S.stormEstimated({ verdict: 'unknown' }), true);
  eq('no verdict at all is nothing', S.stormEstimated(null), false);
  // The tooltip is a different sentence per source, since that is the half that
  // can actually explain the difference.
  eq('each source gets its own sentence', new Set([
    S.stormSourceTitle({ source: 'list' }),
    S.stormSourceTitle({ source: 'child' }),
    S.stormSourceTitle({ source: 'engine', depth: 20 }),
  ]).size, 3);
  eq('…and the engine’s names the depth',
    /depth 20/.test(S.stormSourceTitle({ source: 'engine', depth: 20 })), true);
  eq('…without inventing one it was not given',
    /depth/.test(S.stormSourceTitle({ source: 'engine' })), false);
  eq('no verdict has no sentence', S.stormSourceTitle(null), '');

  // ===========================================================================
  // 11) THE PLY RANGE IS A SETTING (§14.9)
  // ===========================================================================
  // The walks take their bounds from the config object handed in, which is what
  // lets the user's own range reach them without either walk knowing a setting
  // exists. Asserted through the WALK rather than on the numbers, because the
  // failure that matters is a range the walk quietly ignores.
  const ranged = (lo, hi) => Object.assign({}, C, { minPly: lo, maxPly: hi });

  const fromOne = await S.stormWalkGame(fFen, 'w', gameSans, book(20), ranged(1, 16));
  const fromFour = await S.stormWalkGame(fFen, 'w', gameSans, book(20), ranged(4, 16));
  eq('a wider range offers at least as much',
    fromOne.out.length >= fromFour.out.length, true);
  eq('nothing is offered below the floor',
    fromFour.out.every((c) => c.ply >= 4), true);
  eq('…and the floor of 1 reaches the very first ply past the line',
    Math.min(...fromOne.out.map((c) => c.ply)) <= 2, true);
  const capped = await S.stormWalkGame(fFen, 'w', gameSans, book(20), ranged(1, 3));
  eq('the ceiling bounds the walk', capped.out.every((c) => c.ply <= 3), true);
  eq('…and the walk says it stopped there', capped.stop, 'the walk reached its ply limit');

  // ===========================================================================
  // 12) THE INVENTED CONTINUATION (§6.4's no-games fallback)
  // ===========================================================================
  // A frontier the explorer has nothing at. The line is chosen from ChessDB's
  // own best moves, so this is the ONE walk that never plays a blunder — and
  // therefore the one whose blunder stop can never fire.
  let seq = 0;
  const cyc = () => { seq = (seq * 1103515245 + 12345) % 2147483648; return (seq >>> 8) / 8388608; };
  const invented = await S.stormRandomLine(fFen, 'b', book(20), C, cyc, { san: 'Bb5', uci: 'f1b5' });
  eq('an invented line walks', invented.found, true);
  eq('…and says it is invented', invented.invented, true);
  eq('every position it offers is the user’s to move',
    invented.out.every((c) => c.fen.split(' ')[1] === c.userColor), true);
  eq('…and every candidate is MARKED invented, so nothing downstream guesses',
    invented.out.every((c) => c.invented === true), true);
  eq('the first one still knows the course’s own last move',
    invented.out.length ? invented.out[0].arrived.san : 'Bb5', 'Bb5');
  eq('it never runs past the ceiling',
    invented.out.every((c) => c.ply <= C.maxPly), true);

  // THE CHOICE IS BOUNDED, and this is what keeps an invented line plausible: a
  // uniformly random legal move would reach positions no player does, which is
  // exactly what §5.1's blunder stop keeps out of a real game's walk. Asserted
  // by driving the pick to its extremes — `rnd` at 0 takes the first of the
  // pool, at ~1 the last — and checking BOTH stay inside the band.
  const seen = [];
  const spy = (base) => (fen) => {
    const list = scoredFor(fen, base);
    seen.push(list);
    return Promise.resolve(list);
  };
  for (const r of [() => 0, () => 0.999]) {
    seen.length = 0;
    const line = await S.stormRandomLine(fFen, 'b', spy(20), C, r, null);
    // Each position's chosen move is the NEXT position's arriving uci.
    const chosen = line.out.map((c) => c.arrived && c.arrived.uci).filter(Boolean);
    eq('every chosen move is one ChessDB scored',
      chosen.every((u) => seen.some((l) => l.some((m) => m.uci === u))), true);
    eq('…and is within the top band of its position',
      chosen.every((u) => seen.some((l) => {
        const i = l.findIndex((m) => m.uci === u);
        return i >= 0 && i < C.randomTopN && (l[0].score - l[i].score) <= C.randomTopCp;
      })), true);
  }

  // The stops it CAN reach.
  const inventedUnknown = await S.stormRandomLine(
    fFen, 'b', () => Promise.resolve(null), C, cyc, null);
  eq('an unscored position stops the invented walk too',
    inventedUnknown.stop, 'nothing could score this position');
  const inventedDecided = await S.stormRandomLine(
    fFen, 'b', book(C.decidedCp + 50), C, cyc, null);
  eq('…and so does a decided one', inventedDecided.stop, 'the position is already decided');
  eq('…with nothing offered', inventedDecided.out.length, 0);

  // ===========================================================================
  // 13) THE SHARED CANDIDATE BUILDER
  // ===========================================================================
  // Both walks go through it, which is the point: a second copy of these seven
  // numbers is a second place for a rule to be subtly different.
  const ctxPos = CloSan.parseFen(fFen);
  const ctxScored = scoredFor(fFen, 20);
  const built = S.stormCandidate({
    fen: fFen, pos: ctxPos, scored: ctxScored, ply: 3, userSide: 'b',
    arrived: { san: 'Bb5', uci: 'f1b5' }, prevCapSq: null, gaveCheck: false,
  }, C);
  eq('it reads the eval from the user’s side', built.evalUser, 20);
  eq('…counts what was scored', built.nScored, ctxScored.length);
  eq('…measures both spreads', [built.spread2, built.spread5],
    [ctxScored[0].score - ctxScored[1].score, ctxScored[0].score - ctxScored[4].score]);
  eq('…and applies the pick rules', built.reject, null);
  eq('a real-game candidate is NOT marked invented', built.invented, false);
  // The recapture rule reads the square the previous move captured on.
  const bestTo = ctxScored[0].uci.slice(2, 4);
  eq('a recapture onto the same square is refused',
    S.stormCandidate({ fen: fFen, pos: ctxPos, scored: ctxScored, ply: 3, userSide: 'b',
      prevCapSq: bestTo }, C).reject, 'forced recapture');
  eq('…and a capture somewhere else is not',
    S.stormCandidate({ fen: fFen, pos: ctxPos, scored: ctxScored, ply: 3, userSide: 'b',
      prevCapSq: 'h6' }, C).reject, null);

  // `stormAdvance` is the other half, and the two things it reads a SAN for are
  // the only two the rest of the walk needs it for.
  const adv = S.stormAdvance(fFen, ctxPos, 'a7a6', 'a6');
  eq('advancing gives the position after', adv.fen, S.fenAfterUci(fFen, 'a7a6'));
  eq('…a quiet move captures nothing', adv.prevCapSq, null);
  eq('…and gives no check', adv.gaveCheck, false);
  eq('…and it names the move it played', adv.arrived.uci, 'a7a6');
  eq('…and the position it played it from', adv.arrived.before, fFen);
  eq('an illegal move advances nowhere', S.stormAdvance(fFen, ctxPos, 'a1a8', ''), null);

  // ===========================================================================
  // 14) THE POSITION STORE'S ROUND TRIP (§14.11)
  // ===========================================================================
  // The store exists so the ~11 ChessDB requests a position costs are paid once
  // rather than once per session — which means what comes back has to be the
  // same candidate that went in. A field silently lost here is a card that
  // grades differently a week later, and nothing throws: `stormMoveLoss`
  // searches a shorter list, misses, and falls through to a fallback that used
  // to be the exception.
  const packed = S.stormPack(usable, { names: ['Ruy'] });
  const back = S.stormUnpack(packed);
  eq('the position survives', back.fen, usable.fen);
  eq('…the ply it is at', back.ply, usable.ply);
  eq('…whose move it is', back.userColor, usable.userColor);
  eq('…and the move that led there', back.arrived.uci, usable.arrived.uci);
  // §20) The lead-in, which is the ONLY field here that cannot be recomputed
  // from the others — losing it in the store is a position that can be analysed
  // from the frontier walk and not from the store, i.e. a feature that works
  // for three seconds and then does not.
  eq('…and the position that move was played from',
    back.arrived.before, usable.arrived.before);
  eq('…which still leads to the stored position', leadsTo(back.arrived, back.fen), true);
  // An entry written before v0.153.0 has a two-element `a`. It must read as
  // "not known" — never as an empty-string FEN, which parses as nothing and
  // would be handed to the board.
  eq('a pre-v0.153.0 entry has no lead-in rather than a broken one',
    S.stormUnpack(Object.assign({}, packed, { a: ['f1b5', 'Bb5'] })).arrived.before, null);
  eq('…and one with an empty third element is no lead-in either',
    S.stormUnpack(Object.assign({}, packed, { a: ['f1b5', 'Bb5', ''] })).arrived.before, null);
  eq('EVERY scored move survives, not just the top few',
    back.scored.length, usable.scored.length);
  eq('…each with its uci, san and score',
    back.scored.map((m) => m.uci + '/' + m.san + '/' + m.score).join(' '),
    usable.scored.map((m) => m.uci + '/' + m.san + '/' + m.score).join(' '));
  eq('…in the same order, best first',
    back.scored[0].uci, usable.scored[0].uci);
  eq('nScored is recomputed rather than stored', back.nScored, usable.scored.length);
  eq('a stored candidate says so', back.stored, true);
  // A win rate is absent on roughly half of ChessDB's moves, so the three- and
  // four-element forms both have to come back right.
  const halfRated = S.stormPack(Object.assign({}, usable, {
    scored: [{ uci: 'g1f3', san: 'Nf3', score: 20, winrate: 54 },
      { uci: 'f1b5', san: 'Bb5', score: 8 }],
  }), null);
  const halfBack = S.stormUnpack(halfRated);
  eq('a move WITH a win rate keeps it', halfBack.scored[0].winrate, 54);
  eq('…and one without does not gain one', halfBack.scored[1].winrate, undefined);
  eq('the absent one is not stored as null either', halfRated.m[1].length, 3);
  // An INVENTED position stays marked as one: the panel says so, and that claim
  // must survive a week in storage.
  const inv = S.stormUnpack(S.stormPack(Object.assign({}, usable, { invented: true }), null));
  eq('an invented position is still invented after a round trip', inv.invented, true);
  eq('…and a real one is still real', back.invented, false);

  // A CARD BUILDS FROM THE UNPACKED CANDIDATE exactly as from a fresh one —
  // which is what makes the store transparent to everything downstream.
  const fresh = S.stormCard(usable, frontiers[0]);
  const stored = S.stormCard(back, { names: ['Ruy'] });
  eq('a stored position builds the same card', Boolean(stored), true);
  eq('…on the same position', stored.startFen, fresh.startFen);
  eq('…asking the same move', stored.plies[0].uci, fresh.plies[0].uci);
  eq('…keyed the same, so a session cannot offer both', stored.key, fresh.key);
  eq('…and naming the same best score', stored.storm.bestScore, fresh.storm.bestScore);

  // Corrupt or half-written entries are REFUSED, never half-read: a card built
  // from a broken list is one that grades against nothing.
  eq('an entry with no position is refused', S.stormUnpack({ m: [['a', 'b', 0]] }), null);
  eq('an entry with no moves is refused', S.stormUnpack({ f: fFen, m: [] }), null);
  eq('an entry whose scores are not numbers is refused',
    S.stormUnpack({ f: fFen, m: [['g1f3', 'Nf3', '??']] }), null);
  eq('nothing at all is refused', S.stormUnpack(null), null);

  // ===========================================================================
  // 15) THE RETENTION RULE (§14.11)
  // ===========================================================================
  // The user's own: a position answered WELL has been learned and leaves the
  // store; one MISSED stays and comes round again. The half that is hard to see
  // live is the DELETE — it needs a good answer, and a random legal move is a
  // miss nearly every time, so five live cards in a row demonstrated only that
  // misses are kept.
  eq('the config says which verdicts drop a position', C.storeDropOn, ['great', 'good']);
  const store = () => ({ ck1: { f: fFen, k: 0 }, ck2: { f: fFen, k: 2 } });
  for (const good of C.storeDropOn) {
    const st1 = store();
    eq('"' + good + '" changes the store', S.stormRetain(st1, 'ck1', good, C), true);
    eq('…by removing the position', Object.keys(st1).join(), 'ck2');
  }
  const st2 = store();
  eq('a miss changes it too', S.stormRetain(st2, 'ck1', 'miss', C), true);
  eq('…but by KEEPING the position', Object.keys(st2).sort().join(), 'ck1,ck2');
  eq('…and counting the failure, which is what sends it to the BACK next time',
    st2.ck1.k, 1);
  // An ungradeable answer is not the user's fault and taught them nothing, so
  // it must not drop the position either — otherwise eleven requests are spent
  // to meet the same silence again.
  const st3 = store();
  S.stormRetain(st3, 'ck1', 'unknown', C);
  eq('an ungradeable answer keeps it', Object.keys(st3).sort().join(), 'ck1,ck2');
  eq('a position the store does not hold changes nothing',
    S.stormRetain(store(), 'nope', 'good', C), false);
  eq('…and neither does an empty store', S.stormRetain({}, 'ck1', 'good', C), false);

  // --- THE DRAW ORDER (§14.15, v0.137.0) ----------------------------------
  // UNSEEN FIRST, misses behind them, most-missed last. Reversed from v0.130.0
  // on the argument in `stormStoreDraw`'s own note, and asserted here because a
  // flipped comparator is SILENT: every position is still returned, in a
  // sequence that still looks deliberate.
  //
  // `rnd` is pinned so the within-tier shuffle cannot decide an assertion — the
  // tiers are what is being tested, not the jitter.
  const drawStore = {
    fresh:  { f: fFen, n: 'Fresh',  m: [['g1f3', 12]], k: 0 },
    once:   { f: fFen, n: 'Once',   m: [['g1f3', 12]], k: 1 },
    thrice: { f: fFen, n: 'Thrice', m: [['g1f3', 12]], k: 3 },
    never:  { f: fFen, n: 'Never',  m: [['g1f3', 12]] },   // no `k` at all
  };
  // The local store keeps its SANs, so build the moves the way stormPack does.
  for (const k of Object.keys(drawStore)) drawStore[k].m = [['g1f3', 'Nf3', 12]];
  const order = S.stormStoreDraw(drawStore, () => 0.5, C).map((x) => x.ck);
  eq('every stored position is drawn', order.length, 4);
  eq('a position never missed comes before one missed once',
    order.indexOf('fresh') < order.indexOf('once'), true);
  eq('…and one missed once before one missed three times',
    order.indexOf('once') < order.indexOf('thrice'), true);
  eq('the most-missed position is LAST', order[order.length - 1], 'thrice');
  eq('a missing `k` counts as never missed, not as infinitely hard',
    order.indexOf('never') < order.indexOf('once'), true);
  // The tail is the harder half — the one sentence that describes the whole
  // rule, asserted as the monotonic property rather than as a fixed sequence.
  const ks = S.stormStoreDraw(drawStore, () => 0.5, C).map((x) => x.k);
  eq('failure counts never decrease down the queue',
    ks.every((v, i) => i === 0 || ks[i - 1] <= v), true);
  eq('an empty store draws nothing', S.stormStoreDraw({}, () => 0.5, C).length, 0);
  eq('no store at all draws nothing', S.stormStoreDraw(null, () => 0.5, C).length, 0);
  // An unreadable entry is dropped rather than queued with no moves — the same
  // refusal `stormUnpack` makes, reached through the draw.
  eq('an entry that will not unpack is left out',
    S.stormStoreDraw({ bad: { f: fFen, m: [] } }, () => 0.5, C).length, 0);

  // --- REACHABILITY (§14.19, v0.146.0) ------------------------------------
  // §4's "storming the frontier of a line you meet twice a year is a wasted
  // rep", paid for out of a reply the storm already fetches. The failure modes
  // here are all silent: a bucket that reads UNKNOWN as zero freezes an
  // existing store out of every session, and a term put in front of `k`
  // reverses §14.15 while still returning every position in a plausible order.
  eq('under ten games is the bottom bucket', S.stormReachBucket(3, C), 0);
  eq('tens', S.stormReachBucket(42, C), 1);
  eq('hundreds', S.stormReachBucket(231, C), 2);
  eq('thousands', S.stormReachBucket(7631, C), 3);
  eq('ten thousand and over is one bucket', S.stormReachBucket(36363, C), C.reachTop);
  eq('…and so is a million', S.stormReachBucket(1e6, C), C.reachTop);
  eq('zero games is the bottom bucket, not unknown', S.stormReachBucket(0, C), 0);
  // THE ONE THAT MATTERS. Absence means "not recorded", never "never played" —
  // every position stored before v0.146.0 has no figure, and demoting them
  // would freeze an existing store out of every session until it had been
  // gathered again.
  eq('a missing figure is UNKNOWN and ties with the most reachable',
    S.stormReachBucket(undefined, C), C.reachTop);
  eq('…and so is a null one', S.stormReachBucket(null, C), C.reachTop);
  eq('…and so is a NaN', S.stormReachBucket(NaN, C), C.reachTop);

  const reachStore = {
    rare:    { f: fFen, n: 'Rare',    m: [['g1f3', 'Nf3', 12]], k: 0, g: 3 },
    common:  { f: fFen, n: 'Common',  m: [['g1f3', 'Nf3', 12]], k: 0, g: 36363 },
    unknown: { f: fFen, n: 'Unknown', m: [['g1f3', 'Nf3', 12]], k: 0 },
    missed:  { f: fFen, n: 'Missed',  m: [['g1f3', 'Nf3', 12]], k: 2, g: 36363 },
  };
  const reachOrder = S.stormStoreDraw(reachStore, () => 0.5, C).map((x) => x.ck);
  eq('a much-played line end is asked about before a rare one',
    reachOrder.indexOf('common') < reachOrder.indexOf('rare'), true);
  eq('…and a position with no figure is not demoted below either',
    reachOrder.indexOf('unknown') < reachOrder.indexOf('rare'), true);
  // §14.15 IS STILL THE PRIMARY KEY. A much-played position already missed
  // twice must stay behind every unseen one, however reachable — this is the
  // assertion a term inserted in front of `k` fails, and nothing else would.
  eq('reachability never outranks the failure count',
    reachOrder[reachOrder.length - 1], 'missed');
  eq('the figure rides out on the drawn item, for the report',
    S.stormStoreDraw(reachStore, () => 0.5, C)
      .filter((x) => x.ck === 'common')[0].games, 36363);
  eq('…and is null, never 0, where there is none',
    S.stormStoreDraw(reachStore, () => 0.5, C)
      .filter((x) => x.ck === 'unknown')[0].games, null);

  // It is stored, and only when the frontier really carries one.
  const packedReach = S.stormPack(
    { fen: fFen, ply: 2, userColor: 'w', scored: [{ uci: 'g1f3', san: 'Nf3', score: 12 }] },
    { names: ['Ruy'], oids: ['1'], games: 145 });
  eq('the frontier’s game count is stored', packedReach.g, 145);
  const packedNone = S.stormPack(
    { fen: fFen, ply: 2, userColor: 'w', scored: [{ uci: 'g1f3', san: 'Nf3', score: 12 }] },
    { names: ['Ruy'], oids: ['1'] });
  eq('…and a frontier with no figure stores none, not a zero',
    packedNone.g, undefined);

  // The words, which are what the two report hosts print.
  eq('the label says when nothing was recorded',
    S.stormReachLabel(undefined), 'reach not recorded');
  eq('…and names the order of magnitude otherwise',
    S.stormReachLabel(231), '100-999 games at the line end');
  eq('…counting exactly under ten', S.stormReachLabel(3), '3 game(s) at the line end');
  eq('…and saying zero plainly', S.stormReachLabel(0), 'no games at the line end');

  // --- DEEPENED FIRST (§23.8) ---------------------------------------------
  // The deepen pass buys a Stockfish list per position at tens of seconds of
  // CPU each, and a store is only ever partly deepened — so which half a
  // session opens on is decided here and NOWHERE else. Every failure mode is
  // the family's usual one: the term dropped, or put in the wrong place, still
  // returns every position in a plausible sequence, and the session simply
  // grades by ChessDB while looking exactly as it should.
  const deepStore = {
    plain:  { f: fFen, n: 'Plain',  m: [['g1f3', 'Nf3', 12]], k: 0 },
    // `g` DELIBERATELY LOW. With no figure this would read as UNKNOWN, which
    // §14.19 puts in the TOP reach bucket — it would then tie with `busy`
    // below and the deepened term would decide by default, so the assertion
    // about WHERE the term sits would pass however it was placed.
    scored: { f: fFen, n: 'Scored', m: [['g1f3', 'Nf3', 12]], k: 0, d: 20, g: 3 },
    // A list written by an older build, or by a device that stopped short of
    // the standard. It still grades with the engine, so it is still deepened
    // HERE — `undeepened`'s stricter `d >= deepenDepth` answers a different
    // question and using it in the draw would sort this back among ChessDB's.
    older:  { f: fFen, n: 'Older',  m: [['g1f3', 'Nf3', 12]], k: 0, d: 18 },
    // …and the case that pins the term BELOW `k`.
    missed: { f: fFen, n: 'Missed', m: [['g1f3', 'Nf3', 12]], k: 2, d: 20 },
    // …and the one that pins it ABOVE `reach`: unseen, undeepened, and as
    // reachable as a position gets.
    busy:   { f: fFen, n: 'Busy',   m: [['g1f3', 'Nf3', 12]], k: 0, g: 36363 },
  };
  const deepOrder = S.stormStoreDraw(deepStore, () => 0.5, C).map((x) => x.ck);
  eq('every position is still drawn — it is a preference, not a filter',
    deepOrder.length, 5);
  eq('a position Stockfish has scored is asked before one only ChessDB has',
    deepOrder.indexOf('scored') < deepOrder.indexOf('plain'), true);
  // THE ONE THAT PLACES IT. Above `reach` — without that, the most-played
  // undeepened position opens the session and the request is not honoured.
  eq('…and before an undeepened one however reachable',
    deepOrder.indexOf('scored') < deepOrder.indexOf('busy'), true);
  // AND THE ONE THAT KEEPS IT BELOW `k` (§14.15). A deepened position already
  // missed twice must still come behind every unseen one, or this reinstates
  // exactly the hardest-first order v0.137.0 reversed — the deepened half
  // would open every session for as long as it kept being got wrong.
  eq('the failure count still outranks it',
    deepOrder[deepOrder.length - 1], 'missed');
  eq('a sub-standard engine list still counts as engine-scored',
    deepOrder.indexOf('older') < deepOrder.indexOf('plain'), true);
  eq('the flag is a boolean, so depth does not order within the group',
    S.stormStoreDraw(deepStore, () => 0.5, C)
      .filter((x) => x.ck === 'older')[0].deep, 1);
  eq('…and an entry with no `d` is not deepened',
    S.stormStoreDraw(deepStore, () => 0.5, C)
      .filter((x) => x.ck === 'plain')[0].deep, 0);
  // The round trip the flag is read through — asserted here rather than taken
  // on trust, since a `d` lost in the pack or the unpack is the same silence.
  eq('the depth survives pack → unpack',
    S.stormUnpack(S.stormPack(
      { fen: fFen, ply: 2, userColor: 'w', listDepth: 20,
        scored: [{ uci: 'g1f3', san: 'Nf3', score: 12 }] }, null)).listDepth, 20);

  // --- RETIREMENT (§14.16, v0.142.0) --------------------------------------
  // The half of the retention rule that was missing. `stormRetain` takes an
  // answered position OUT of the store; leaving the store is not the same as
  // not coming back, because the producer re-walks frontiers every session and
  // `stormWalkGame` is deterministic. So the tombstone list is asked at every
  // point a position can enter a session, and THIS is the assertion that a
  // "tidy-up" removing that question would fail — live, it needs a position
  // answered well in one session and the same frontier drawn in the next.
  const DAY = 24 * 60 * 60 * 1000;
  const NOW = 1e12;
  eq('a position never answered is not retired',
    S.stormDone({}, 'ck1', C, NOW), false);
  eq('one answered just now IS retired',
    S.stormDone({ ck1: NOW - 1000 }, 'ck1', C, NOW), true);
  eq('…and stays retired the day before the horizon',
    S.stormDone({ ck1: NOW - (C.goneDays - 1) * DAY }, 'ck1', C, NOW), true);
  // The horizon is what makes this a RETIREMENT and not a deletion: the
  // position is worth asking again eventually, and `goneDays` is how long
  // "eventually" is.
  eq('one answered longer ago than the horizon comes back',
    S.stormDone({ ck1: NOW - (C.goneDays + 1) * DAY }, 'ck1', C, NOW), false);
  eq('a tombstone for another position says nothing about this one',
    S.stormDone({ ck2: NOW - 1000 }, 'ck1', C, NOW), false);
  eq('no list at all retires nothing', S.stormDone(null, 'ck1', C, NOW), false);
  // A 0 is "no record", not "retired at the epoch" — the truthiness trap
  // DESIGN-key-moves.md §9.2 is about, and it would retire the position for
  // ever rather than never.
  eq('a zero timestamp is no record', S.stormDone({ ck1: 0 }, 'ck1', C, NOW), false);
  eq('…and so is a non-number', S.stormDone({ ck1: 'yes' }, 'ck1', C, NOW), false);

  // --- THE RANDOM FACTOR (§14.16) -----------------------------------------
  // Not the guarantee — `stormDone` is that — but what keeps a course yielding
  // new material: eight games taken two at a time is 28 pairs, where the old
  // `slice(0, 2)` asked every frontier the same question for ever.
  const gs = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => ({ id }));
  const ids = (arr) => arr.map((g) => g.id).join('');
  eq('it takes exactly as many games as asked',
    S.stormPickGames(gs, 2, () => 0).length, 2);
  eq('an rnd of 0 is the identity, which is what pins the shuffle',
    ids(S.stormPickGames(gs, 2, () => 0)), 'ab');
  // THE POINT: a different roll walks different games. Asserted as a concrete
  // sequence rather than as "not ab", so a pick that ignored `rnd` entirely
  // cannot pass by returning something else.
  eq('…and a high roll does NOT walk the first two',
    ids(S.stormPickGames(gs, 2, () => 0.999)), 'ha');
  const picked = S.stormPickGames(gs, 3, () => 0.5);
  eq('no game is walked twice in one pass',
    new Set(picked.map((g) => g.id)).size, 3);
  eq('every game picked is a real one',
    picked.every((g) => g && g.id), true);
  eq('asking for more than there are yields all of them',
    S.stormPickGames(gs, 20, () => 0.5).length, 8);
  eq('the source list is left alone', ids(gs), 'abcdefgh');
  eq('no games at all is not an error', S.stormPickGames([], 2, () => 0.5).length, 0);
  eq('…and neither is nothing at all', S.stormPickGames(null, 2, () => 0.5).length, 0);
  // An out-of-contract rnd must not index past the end and walk `undefined` as
  // a game with no id — the shape that would fail three walks later, in
  // `askPgn`, with a message about the explorer.
  eq('an rnd of 1 still returns real games',
    S.stormPickGames(gs, 2, () => 1).every((g) => g && g.id), true);

  // --- THE FUNNEL (§14.17, v0.143.0) --------------------------------------
  // A gather used to report ONE number — positions stored — which is the single
  // number least able to say whether the pass worked: a course whose store is
  // already full reports the same "2 new" as one ChessDB knows nothing about.
  //
  // THE PROPERTY WORTH ASSERTING IS CONSERVATION: every examined candidate is
  // counted in exactly one of rejected / retired / dup / stored. That lives in
  // `harvestCandidates`'s control flow, so this is the one place in this file
  // that executes an IMPURE function — `__setEnv` supplies `st` and `C`. The
  // way it drifts is a fifth `continue` added there and counted nowhere, after
  // which the totals stop adding up while every individual number still looks
  // right.
  const blank = S.stormFunnelBlank();
  eq('a fresh funnel counts nothing', blank.examined + blank.stored + blank.rejected +
    blank.retired + blank.dup + blank.frontiers + blank.games, 0);
  eq('…and has both reason tables', typeof blank.why + ' ' + typeof blank.stops,
    'object object');
  // §14.19's third table. A new table must not disturb the conservation
  // invariant below — it counts FRONTIERS, not candidates.
  eq('…and the reachability one', typeof blank.reach, 'object');
  // Four candidates with four known fates, plus a fifth that repeats the
  // fourth's position — which is how a `dup` arises inside a single walk.
  // Each candidate needs a best move LEGAL on its own position: `stormCard`
  // resolves it through CloSan and answers null otherwise, which would read as
  // "the card could not be built" rather than as the fate under test.
  const cand = (fen, uci, san, reject) => ({
    fen, ply: 3, userColor: 'w', arrived: null, invented: false, reject: reject || null,
    scored: [{ uci, san, score: 20 }, { uci, san, score: 6 }],
  });
  const FEN_A = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
  const FEN_B = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';
  const FEN_C = 'rnbqkbnr/pp2pppp/3p4/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3';
  const FEN_D = 'rnbqkbnr/pp2pppp/3p4/8/3pP3/5N2/PPP2PPP/RNBQKB1R w KQkq - 0 4';
  const held = cacheKey(FEN_C);
  const fakeSt = {
    store: { [held]: { f: FEN_C, m: [['g1f3', 'Nf3', 20]], k: 0 } },
    gone: { [cacheKey(FEN_B)]: Date.now() },
    seen: new Set(),
    gathered: 0,
    funnel: S.stormFunnelBlank(),
  };
  S.__setEnv(fakeSt, C);
  const got = S.harvestCandidates([
    cand(FEN_A, 'g1f3', 'Nf3', 'flat — nothing to get wrong'), // rejected
    cand(FEN_B, 'b8c6', 'Nc6'),                                // retired (§14.16)
    cand(FEN_C, 'g1f3', 'Nf3'),                                // already in the store
    cand(FEN_D, 'f3d4', 'Nxd4'),                               // new
    cand(FEN_D, 'f3d4', 'Nxd4'),                               // …and now a duplicate
  ], { names: ['A line'], oids: ['1'] });
  const fn = fakeSt.funnel;
  eq('every candidate is examined', fn.examined, 5);
  eq('a pick rule counts as rejected', fn.rejected, 1);
  eq('…and names itself in the reason table',
    fn.why['flat — nothing to get wrong'], 1);
  eq('a retired position counts as retired', fn.retired, 1);
  eq('one the store already holds counts as a duplicate', fn.dup, 2);
  eq('…and only the unseen one is stored', fn.stored, 1);
  // THE INVARIANT. Written as the sum rather than as the four numbers above, so
  // it keeps holding when the fixture changes and fails when the code grows a
  // fate nobody counted.
  eq('the four outcomes account for every examined position',
    fn.rejected + fn.retired + fn.dup + fn.stored, fn.examined);
  eq('the reason table adds up to the rejections',
    Object.values(fn.why).reduce((a, b) => a + b, 0), fn.rejected);
  // …and the two things the pass actually keeps.
  eq('only the stored position becomes a card', got.length, 1);
  eq('a retired position is never put on a board',
    got.some((c) => c.startFen === FEN_B), false);
  eq('the store gained exactly one entry', Object.keys(fakeSt.store).length, 2);
  eq('the gathered count is the stored count', fakeSt.gathered, 1);

  // The status line has to tell the three cases apart — a full store, a course
  // ChessDB does not know, and a pass with nothing to walk.
  const note = S.stormFunnelNote(fn.frontiers ? fn : Object.assign({}, fn,
    { frontiers: 47, unscored: 6, offBand: 5, noGames: 9, games: 108 }));
  eq('the note says what was walked', /47 line end\(s\)/.test(note), true);
  eq('…and why line ends were skipped', /6 unscored, 5 off-band, 9 with no games/.test(note), true);
  eq('…and where the positions went',
    /5 position\(s\) examined: 1 rejected, 1 already answered, 2 already stored, 1 new/.test(note),
    true);
  eq('a pass that walked nothing says nothing', S.stormFunnelNote(blank), '');
  eq('no funnel at all says nothing', S.stormFunnelNote(null), '');
  eq('a pass that reached no candidate says so',
    /No candidate position was reached/.test(
      S.stormFunnelNote(Object.assign(S.stormFunnelBlank(), { frontiers: 3 }))), true);
  // The console breakdown is where the reason tables go, biggest first — §6.2
  // measured the binding constraint as ChessDB running out rather than as
  // anything about chess, and that is a fact about a COURSE.
  const lines = S.stormFunnelLines(Object.assign({}, fn, { frontiers: 4, games: 8,
    stops: { 'nothing could score this position': 11, 'the opponent erred here': 3 } }));
  eq('the breakdown leads with the line ends', /^line ends walked/.test(lines[0]), true);
  eq('…and sorts a reason table biggest first',
    lines.findIndex((l) => /nothing could score this position/.test(l)) <
    lines.findIndex((l) => /the opponent erred here/.test(l)), true);
  eq('no funnel breaks nothing', S.stormFunnelLines(null).length, 0);
  // §14.19: reported in the console, not in the status sentence — a reason
  // table is a dozen lines and `stormFunnelNote` has to fit four numbers.
  const reachLines = S.stormFunnelLines(Object.assign({}, fn, { frontiers: 2,
    reach: { '10000-99999 games at the line end': 3, 'reach not recorded': 1 } }));
  eq('the breakdown names how reachable the line ends were',
    reachLines.some((l) => /how often they are reached/.test(l)), true);
  eq('…biggest first, like the other tables',
    reachLines.findIndex((l) => /10000-99999/.test(l)) <
    reachLines.findIndex((l) => /not recorded/.test(l)), true);
  eq('…and it stays out of the one-sentence status line',
    /reached/.test(S.stormFunnelNote(Object.assign({}, fn, { frontiers: 2,
      reach: { 'reach not recorded': 1 } }))), false);
  // `stormFunnelBump` is null-safe because the PRODUCER runs with no funnel at
  // all — every call site would otherwise need a guard of its own.
  eq('bumping nothing is not an error',
    (() => { S.stormFunnelBump(null, 'examined'); S.stormFunnelWhy(null, 'why', 'x'); return true; })(),
    true);

  // ===========================================================================
  // 16) THE WIRE (§14.12) — pack, unpack, merge
  // ===========================================================================
  // A snapshot in an informational card in the user's own course. Three things
  // here fail silently and all three make the feature quietly worse rather than
  // broken:
  //
  //  * THE SAN IS DROPPED ON THE WIRE and recomputed from the uci. A move whose
  //    SAN comes back wrong is a verdict line naming the wrong move, and a move
  //    whose SAN comes back EMPTY is one that reads as a defect.
  //  * THE MERGE IS A UNION, so without tombstones a position the retention
  //    rule dropped comes back from the other device's copy on every exchange.
  //  * THE FAILURE COUNT decides how soon a position comes round again, and
  //    losing it in a merge is invisible.
  const wireStore = () => ({
    a1: { f: fFen, p: 3, c: 'w', n: 'Ruy', i: 0, a: ['f1b5', 'Bb5', preFen], t: 1000, k: 2,
      g: 145, o: 'L1',
      m: [['a7a6', 'a6', 30, 54], ['g8f6', 'Nf6', 12], ['b8e5', '??', -5]] },
    // …and one with NO reachability figure, which is what every entry written
    // before v0.146.0 looks like (§14.19).
    a2: { f: fFen, p: 5, c: 'w', n: 'Ruy', i: 1, a: null, t: 2000, k: 0,
      m: [['a7a6', 'a6', 8]] },
  });

  const packedWire = S.stormWirePack(wireStore(), { dead1: Date.now() }, C, 0);
  eq('the wire says which version wrote it', packedWire.v, C.wireVersion);
  eq('…and how many positions it carries', packedWire.n, 2);
  eq('the SAN is NOT on the wire', packedWire.p.a1.m[0].length, 3);
  // §20) …but the LEAD-IN is, and unlike a SAN it has to be: a FEN cannot be
  // un-played, so a device that received a position without it could only
  // analyse from the position itself. It rides at a price — ~60 of an entry's
  // ~450 characters — which the budget check below spends as fewer positions
  // carried, never as a failed exchange.
  eq('the lead-in position IS on the wire', packedWire.p.a1.a[2], preFen);
  eq('…nor on a move without a win rate', packedWire.p.a2.m[0].length, 2);
  eq('the tombstones ride along', Object.keys(packedWire.g), ['dead1']);
  // Hardest first, so a payload cut to fit keeps the positions most worth
  // carrying.
  eq('the hardest position is packed first', Object.keys(packedWire.p)[0], 'a1');

  const un = S.stormWireUnpack(packedWire, C);
  eq('every position comes back', Object.keys(un.store).sort().join(), 'a1,a2');
  eq('…with its own position', un.store.a1.f, fFen);
  eq('…its failure count', un.store.a1.k, 2);
  eq('…whether it was invented', un.store.a2.i, 1);
  eq('…and the lead-in that led to it', un.store.a1.a[2], preFen);
  eq('…which still reaches the position',
    leadsTo(S.stormUnpack(un.store.a1).arrived, un.store.a1.f), true);
  eq('…and the move that led there', un.store.a1.a[1], 'Bb5');
  eq('the SAN is RECOMPUTED, not carried',
    un.store.a1.m.map((m) => m[1]).join(), 'a6,Nf6');
  eq('…and a move that will not resolve is DROPPED, never given a blank SAN',
    un.store.a1.m.length, 2);
  eq('the win rate survives where there was one', un.store.a1.m[0][3], 54);
  eq('…and is not invented where there was none', un.store.a1.m[1].length, 3);
  eq('the tombstones come back too', Object.keys(un.gone), ['dead1']);
  // §14.19: the reachability figure RIDES, as an OPTIONAL field and with no
  // version bump — it is not re-derivable on the far device without another
  // explorer request, and absence is already read as "not known" everywhere.
  eq('the reachability figure is on the wire', packedWire.p.a1.g, 145);
  eq('…and comes back', un.store.a1.g, 145);
  eq('…while an entry that never had one still has none, not a zero',
    un.store.a2.g, undefined);
  {
    // §30) …and the LINE is taken the same way. Without this an entry that
    // landed here before v0.176.0 stays unattributed for ever however many
    // times the device that HAS its oid pushes — the merge only ever added the
    // entries this store was missing.
    const bare = wireStore(); delete bare.a1.o;
    S.stormWireMerge(bare, wireStore(), {}, {});
    eq('a line the other device knows is taken', bare.a1.o, 'L1');
    const own = wireStore(); own.a1.o = 'MINE';
    S.stormWireMerge(own, wireStore(), {}, {});
    eq('…and one this device already has is NOT overwritten', own.a1.o, 'MINE');
  }
  // §30) THE LINE RIDES TOO, and it is the field whose absence is silent in a
  // way none of the others are: the receiving device's store then has positions
  // it cannot attribute, `takeStoreItem` and `takeQueued` read "no line" as
  // "never blocks", and a synced store deals six cards off one variation while
  // every position in it is perfectly good. `backfillStoreOids` is not the
  // answer on its own — it refuses a name two variations share, and it cannot
  // run until the course has been read, which is AFTER the first cards have
  // been drawn.
  eq('the line rides on the wire', packedWire.p.a1.o, 'L1');
  eq('…and comes back', un.store.a1.o, 'L1');
  eq('…while an entry with no line still has none, not a stray truthy value',
    un.store.a2.o, '');
  eq('a payload written before it existed is still valid',
    S.stormWireUnpack({ v: C.wireVersion, at: 1, g: {},
      p: { z: { f: fFen, p: 2, c: 'w', m: [['a7a6', 12]] } } }, C).store.z.o, '');
  eq('a payload written before it existed is still valid',
    Boolean(S.stormWireUnpack({ v: C.wireVersion, at: 1, g: {},
      p: { z: { f: fFen, p: 2, c: 'w', m: [['a7a6', 12]] } } }, C).store.z), true);
  // A card written by a newer build is refused rather than half-read.
  eq('a newer payload is refused',
    S.stormWireUnpack(Object.assign({}, packedWire, { v: C.wireVersion + 1 }), C), null);
  eq('an empty one is refused', S.stormWireUnpack(null, C), null);
  // An entry whose every move is unresolvable has no card in it.
  const junk = S.stormWireUnpack({ v: C.wireVersion, at: 1, g: {},
    p: { z: { f: fFen, m: [['a1a8', 0]] } } }, C);
  eq('an entry with no resolvable move is dropped whole', Object.keys(junk.store).length, 0);

  // --- the merge --------------------------------------------------------
  const mine = wireStore();
  delete mine.a2;                       // learned here, so dropped
  const myGone = { a2: Date.now() };
  const theirs = wireStore();           // …but the other device still has it
  const res = S.stormWireMerge(mine, theirs, myGone, {});
  eq('a position only they have is taken', res.added >= 0, true);
  eq('A POSITION I DROPPED DOES NOT COME BACK', Boolean(mine.a2), false);
  eq('…and my own store still has the one we share', Boolean(mine.a1), true);
  eq('their tombstones are honoured too', (() => {
    const l = wireStore();
    S.stormWireMerge(l, {}, {}, { a1: Date.now() });
    return Boolean(l.a1);
  })(), false);
  // A position only THEY have really is added.
  const bare = { a1: wireStore().a1 };
  // §14.19: a figure the OTHER device has and this one does not is taken. It
  // is a property of the position's frontier and not of the device, so the two
  // can only disagree by one of them not knowing — there is nothing to
  // reconcile and nothing to double-count, unlike §15's counters.
  const noReach = wireStore();
  delete noReach.a1.g;
  S.stormWireMerge(noReach, wireStore(), {}, {});
  eq('a merge takes a reachability figure the local store lacks', noReach.a1.g, 145);
  const hasReach = wireStore();
  S.stormWireMerge(hasReach, (() => {
    const r = wireStore(); r.a1.g = 9; return r;
  })(), {}, {});
  eq('…and does not overwrite one it already has', hasReach.a1.g, 145);

  const res2 = S.stormWireMerge(bare, wireStore(), {}, {});
  eq('a position only the other device has is added', Boolean(bare.a2), true);
  eq('…and counted', res2.added, 1);
  // The failure count is the number that decides how soon it comes round.
  const low = { a1: Object.assign({}, wireStore().a1, { k: 0 }) };
  S.stormWireMerge(low, { a1: Object.assign({}, wireStore().a1, { k: 5 }) }, {}, {});
  eq('the HIGHER failure count wins', low.a1.k, 5);
  const high = { a1: Object.assign({}, wireStore().a1, { k: 9 }) };
  S.stormWireMerge(high, { a1: Object.assign({}, wireStore().a1, { k: 1 }) }, {}, {});
  eq('…in both directions', high.a1.k, 9);

  // --- §22.6) A CLEAR, ACROSS DEVICES -------------------------------------
  // A cleared position leaves NO tombstone — one would mean RETIRED (§14.16)
  // and would block the very re-gather a clear is asking for — so it is simply
  // ABSENT, and absent is what a union merge fills in from the other device.
  // Clearing and then syncing is the ordinary sequence, and it silently undid
  // the clear: reported 2026-08-30.
  //
  // The mark fails silently in BOTH directions. Ignored, every cleared position
  // comes back and the store looks healthy; applied too widely, positions
  // gathered after the clear are eaten and the store looks empty for no reason.
  const clStore = () => ({
    old1: { f: fFen, p: 3, c: 'w', n: 'Ruy', i: 0, a: null, t: 1000, k: 0,
      m: [['a7a6', 'a6', 8]] },
    old2: { f: fFen, p: 4, c: 'w', n: 'Ruy', i: 0, a: null, t: 1500, k: 1,
      m: [['g8f6', 'Nf6', 4]] },
    fresh: { f: fFen, p: 5, c: 'w', n: 'Ruy', i: 0, a: null, t: 9000, k: 0,
      m: [['b8c6', 'Nc6', 2]] },
  });
  const CLEARED_AT = 5000;

  // The reported bug, in one assertion: I cleared, the other device had not.
  const wipedLocal = {};   // everything thrown away here
  const theirCopy = clStore();
  const afterClear = S.stormWireMerge(wipedLocal, theirCopy, {}, {}, CLEARED_AT, 0);
  eq('a position cleared here does NOT come back from the other device',
    Object.keys(wipedLocal).sort(), ['fresh']);
  eq('…and the one gathered since the clear does', Boolean(wipedLocal.fresh), true);
  eq('…with the two of them counted apart from "learned elsewhere"',
    [afterClear.added, afterClear.dropped], [1, 0]);

  // The other direction, which is what makes a clear PROPAGATE rather than
  // merely defend the device that pressed the button.
  const theirsStale = clStore();
  const mineCleared = S.stormWireMerge(theirsStale, {}, {}, {}, 0, CLEARED_AT);
  eq('a clear on the OTHER device drops this one’s pre-clear positions',
    Object.keys(theirsStale).sort(), ['fresh']);
  eq('…counted as cleared, never as learned',
    [mineCleared.wiped, mineCleared.dropped], [2, 0]);
  eq('…and the mark is taken over, so it is not re-learned every exchange',
    mineCleared.clearedAt, CLEARED_AT);

  // Merged by max, in both orders — a mark is a high-water figure.
  eq('the LATER mark wins whichever side holds it',
    [S.stormWireMerge({}, {}, {}, {}, 7000, 3000).clearedAt,
      S.stormWireMerge({}, {}, {}, {}, 3000, 7000).clearedAt], [7000, 7000]);
  // No clear anywhere: byte-identical to the merge as it was before v0.156.0.
  const untouched = clStore();
  const noMark = S.stormWireMerge({}, untouched, {}, {}, 0, 0);
  eq('with no clear anywhere every position is still taken', noMark.added, 3);
  eq('…and nothing is wiped', noMark.wiped, 0);
  eq('…and the mark stays absent', noMark.clearedAt, 0);
  // A tombstone still wins: it is the stronger statement of the two.
  const bothRules = {};
  S.stormWireMerge(bothRules, clStore(), {}, { fresh: Date.now() }, CLEARED_AT, 0);
  eq('a retired position is not taken even when it is newer than the mark',
    Object.keys(bothRules).length, 0);

  // The wire. Absence is "nothing has been cleared", which is what every
  // payload written before v0.156.0 is — so no wireVersion bump.
  const clPacked = S.stormWirePack(clStore(), {}, C, 0, CLEARED_AT);
  eq('the clear mark rides the wire', clPacked.cl, CLEARED_AT);
  eq('…and comes back', S.stormWireUnpack(clPacked, C).clearedAt, CLEARED_AT);
  eq('a payload from a device that has never cleared carries no mark',
    S.stormWirePack(clStore(), {}, C, 0).cl, undefined);
  eq('…and reads back as zero rather than as undefined',
    S.stormWireUnpack(S.stormWirePack(clStore(), {}, C, 0), C).clearedAt, 0);

  // --- the budget -------------------------------------------------------
  // A payload that overshoots is a card the server refuses, so the honest
  // answer is fewer positions rather than a failed exchange.
  const big = {};
  for (let i = 0; i < 50; i++) {
    big['k' + i] = { f: fFen, p: 3, c: 'w', n: 'x', i: 0, a: null, t: i, k: 0,
      m: [['a7a6', 'a6', 1], ['g8f6', 'Nf6', 2]] };
  }
  const cut = S.stormWirePack(big, {}, C, 2000);
  eq('the budget cuts the payload', cut.n < 50, true);
  eq('…and the count matches what is in it', cut.n, Object.keys(cut.p).length);
  eq('…and what is in it is still readable',
    Object.keys(S.stormWireUnpack(cut, C).store).length, cut.n);
  eq('no budget carries everything', S.stormWirePack(big, {}, C, 0).n, 50);

  // =========================================================================
  // 8) THE ENGINE TIER'S DEPTH AND ITS TWO WATCHDOGS
  // =========================================================================
  // Every failure here is SILENT — the tier still runs, still answers, and just
  // answers "No verdict" for ever, which looks exactly like ChessDB being
  // ignorant. None of it is reachable from a sliced pure function, so these are
  // assertions about the CONFIG, which is where the mistakes actually live.
  //
  // engine/engine.js caps with `Math.min(pendingDepth, prof.depth)` against the
  // PROFILES table (30 desktop / 25 mobile). A storm depth above its own
  // profile's ceiling is not an error: it is silently clamped, so the number in
  // CONFIG stops being the number that runs.
  const PROF = /desktop:\s*\{[^}]*depth:\s*(\d+)/.exec(
    fs.readFileSync(path.join(__dirname, '..', 'engine', 'engine.js'), 'utf8'));
  const PROF_M = /mobile:\s*\{[^}]*depth:\s*(\d+)/.exec(
    fs.readFileSync(path.join(__dirname, '..', 'engine', 'engine.js'), 'utf8'));
  eq('engineDepth names both profiles',
    Object.keys(C.engineDepth).sort(), ['desktop', 'mobile']);
  eq('desktop storm depth is under engine.js\'s desktop ceiling (else clamped silently)',
    C.engineDepth.desktop <= Number(PROF[1]), true);
  eq('mobile storm depth is under engine.js\'s mobile ceiling (else clamped silently)',
    C.engineDepth.mobile <= Number(PROF_M[1]), true);
  eq('mobile does not search deeper than desktop',
    C.engineDepth.mobile <= C.engineDepth.desktop, true);

  // ONE timer covers BOTH searches — it is armed when the job is created and
  // never re-armed between phases (`stormEngineLoss`). And `gradeTimeoutMs` is
  // armed EARLIER still, before the ChessDB tiers, so if it is not the larger
  // of the two it fires first and the engine watchdog can never matter.
  eq('gradeTimeoutMs leaves room for the whole engine job',
    C.gradeTimeoutMs > C.engineTimeoutMs, true);
  // A pair of searches at these depths in six seconds is not credible; the old
  // 6000 was chosen for depth 14 and left behind when the depth moved. This is
  // the ordering that would have made the raise a silent no-op.
  eq('engineTimeoutMs was raised along with the depth',
    C.engineTimeoutMs >= 15000, true);

  // =========================================================================
  // 9) THE PERFORMANCE RECORD (§15)
  // =========================================================================
  // THREE THINGS HERE FAIL SILENTLY and all three still print a tidy
  // percentage, which is why they are executed rather than eyeballed:
  //
  //  * THE DENOMINATOR. `unknown` is a verdict about ChessDB and not about the
  //    user — `finishAnswer` scores it nothing and holds the streak for exactly
  //    that reason. Counted as a failure it marks the user down for the book's
  //    ignorance; counted as a success it flatters them. Either reads as a
  //    plausible number. Since §16 the NUMERATOR is a second way to be wrong:
  //    it is the two bands that SCORE, and quietly folding `ok` into them would
  //    turn "how often did I find it" into "how often was it survivable".
  //  * THE MERGE. These are COUNTERS and the wire merge is a UNION over a whole
  //    snapshot, so summing two devices' totals sums them AGAIN on the next
  //    exchange, and again after that. The numbers stay plausible and keep
  //    growing, which is what a working feature also does.
  //  * THE AVERAGE LOSS. A mean over ANSWERS, never a mean over lines: rolling
  //    a chapter up from its lines' averages weights a line answered once like
  //    one answered forty times.

  // Block-scoped: this file is one long function body and the names below are
  // ordinary enough to collide with section 7's.
  {
  // §16's five bands. `ls` is in TENTHS of a point of win probability, which
  // is what keeps the whole record integral on the wire.
  const dev = (n, a, g, o, b, x, u, ls, lc, t) => ({ n, a, g, o, b, x, u, ls, lc, t });

  // --- the denominator ---------------------------------------------------
  const rec = S.stormStatBlank();
  eq('a fresh record is empty', rec,
    { n: 0, a: 0, g: 0, o: 0, b: 0, x: 0, u: 0, ls: 0, lc: 0, s: 0, t: 0 });
  eq('a great answer counts', S.stormStatApply(rec, { verdict: 'great', wp: 1.2 }, 100), true);
  S.stormStatApply(rec, { verdict: 'good', wp: 5.5 }, 200);
  S.stormStatApply(rec, { verdict: 'ok', wp: 8.0 }, 250);
  S.stormStatApply(rec, { verdict: 'blunder', wp: 21.0 }, 300);
  eq('…and an ungradeable one counts as an ANSWER',
    S.stormStatApply(rec, { verdict: 'unknown', wp: null }, 400), true);
  eq('five answers', rec.n, 5);
  eq('…of which four were graded', S.stormStatGraded(rec), 4);
  eq('every band lands in its own counter',
    [rec.a, rec.g, rec.o, rec.b, rec.x, rec.u], [1, 1, 1, 0, 1, 1]);
  // THE NUMERATOR IS THE TWO BANDS THAT SCORE. An inaccuracy is not a move
  // found — it is the answer "no, but it did not matter much", which is what
  // the average loss beside it is for.
  eq('THE RATE IS THE SCORING BANDS OVER THE GRADED ONES', S.stormStatRate(rec), 2 / 4);
  eq('…and so does the loss: four graded, four losses', rec.lc, 4);
  eq('the mean loss is over the answers that HAVE one, in probability points',
    S.stormStatLoss(rec), (12 + 55 + 80 + 210) / 4 / 10);
  eq('the stamp is the last answer', rec.t, 400);

  // §14.10c's card the clock stopped on is in the review because it is the
  // position most in mind. It is NOT an answer, and counting it would mark the
  // user down for running out of time.
  const noAns = S.stormStatBlank();
  eq('`unanswered` is refused', S.stormStatApply(noAns, { verdict: 'unanswered' }, 1), false);
  eq('…and leaves nothing behind', noAns.n, 0);
  eq('a verdict with no name is refused', S.stormStatApply(noAns, {}, 1), false);

  // A missing loss is NOT zero. Reading it as one is what would make the
  // book's ignorance show up as perfect play.
  const noLoss = S.stormStatBlank();
  S.stormStatApply(noLoss, { verdict: 'unknown', wp: null }, 1);
  eq('an ungradeable answer contributes no loss', S.stormStatLoss(noLoss), null);
  eq('…and no rate at all, rather than 0%', S.stormStatRate(noLoss), null);

  // A perfect record and an empty one are different claims.
  const perfect = S.stormStatBlank();
  S.stormStatApply(perfect, { verdict: 'great', wp: 0 }, 1);
  eq('a lone great answer is 100%', S.stormStatRate(perfect), 1);
  eq('…and a loss of 0 is a real number, not a missing one', S.stormStatLoss(perfect), 0);
  // …and the middle band is a graded answer that is NOT a find: 0%, with a
  // real loss behind it. This is the pair a folded-in `ok` makes identical.
  const meh = S.stormStatBlank();
  S.stormStatApply(meh, { verdict: 'ok', wp: 8 }, 1);
  eq('a lone inaccuracy is 0% found', S.stormStatRate(meh), 0);
  eq('…but it is still a graded answer with a loss', S.stormStatLoss(meh), 8);

  // --- the roll-up is over ANSWERS ---------------------------------------
  // The trap: one line answered once at 20 points of probability and one
  // answered nine times at 0 average to 10 per LINE and 2 per ANSWER. Only the
  // second is the chapter's average loss.
  const busy = S.stormStatBlank();
  for (let i = 0; i < 9; i++) S.stormStatApply(busy, { verdict: 'great', wp: 0 }, 10 + i);
  const rare = S.stormStatBlank();
  S.stormStatApply(rare, { verdict: 'blunder', wp: 20 }, 5);
  const rolled = S.stormStatRoll([{ dv: { a: busy } }, { dv: { b: rare } }]);
  eq('a roll-up sums the answers', rolled.n, 10);
  eq('…so the mean loss is per answer, not per line', S.stormStatLoss(rolled), 2);
  eq('…and the rate likewise', S.stormStatRate(rolled), 0.9);
  eq('the roll-up takes the LATEST stamp, never their sum', rolled.t, 18);

  // --- the merge ---------------------------------------------------------
  // PER DEVICE, AND NEVER A SUM. A device's own counters only grow, so the
  // longer record is the later one.
  const statsA = () => ({
    '1': { name: 'Course one', lines: {
      v1: { nm: 'Scotch', dv: { A: dev(10, 6, 2, 0, 0, 2, 0, 400, 10, 900) } },
    } },
  });
  const statsB = {
    '1': { name: 'Course one', lines: {
      v1: { nm: 'Scotch', dv: { B: dev(4, 1, 1, 0, 0, 2, 0, 300, 4, 800) } },
      v2: { nm: 'Caro', dv: { B: dev(3, 3, 0, 0, 0, 0, 0, 30, 3, 850) } },
    } },
    '2': { name: 'Course two', lines: {
      v9: { nm: 'Sicilian', dv: { B: dev(2, 0, 0, 0, 0, 2, 0, 500, 2, 700) } },
    } },
  };
  const local = statsA();
  const merged = S.stormStatsMerge(local, statsB);
  eq('the other device is added, not added IN', merged.added, 3);
  eq('…so one line now holds two devices', Object.keys(local['1'].lines.v1.dv).sort(), ['A', 'B']);
  eq('…and the line total is their sum', S.stormStatSum(local['1'].lines.v1.dv).n, 14);
  eq('a course only the other device has arrives whole', local['2'].lines.v9.dv.B.n, 2);

  // THE SAME EXCHANGE AGAIN MUST CHANGE NOTHING. This is the assertion a
  // summing merge fails, and it fails it while still looking like progress.
  const again = S.stormStatsMerge(local, statsB);
  eq('a second exchange adds nothing', again.added, 0);
  eq('…and bumps nothing', again.bumped, 0);
  eq('…and the total is unmoved', S.stormStatSum(local['1'].lines.v1.dv).n, 14);

  // …and a LONGER record from the same device replaces the shorter one.
  const grown = { '1': { name: 'Course one', lines: {
    v1: { nm: 'Scotch', dv: { B: dev(9, 4, 3, 0, 0, 2, 0, 600, 9, 999) } },
  } } };
  const bump = S.stormStatsMerge(local, grown);
  eq('a device that has answered more replaces its own record', bump.bumped, 1);
  eq('…and the line total moves by the DIFFERENCE, not by the whole',
    S.stormStatSum(local['1'].lines.v1.dv).n, 19);
  eq('…and a SHORTER one is ignored',
    S.stormStatsMerge(local, statsB).bumped, 0);
  eq('…leaving the total where it was',
    S.stormStatSum(local['1'].lines.v1.dv).n, 19);

  // --- pruning -----------------------------------------------------------
  const old = { '1': { name: 'c', lines: {
    fresh: { nm: 'f', dv: { A: dev(1, 1, 0, 0, 0, 0, 0, 0, 1, 1000) } },
    stale: { nm: 's', dv: { A: dev(1, 1, 0, 0, 0, 0, 0, 0, 1, 10) } },
  } } };
  eq('a line untouched for longer than the TTL is dropped',
    S.stormStatsPrune(old, { statsTtlMs: 500, statsMaxLines: 99 }, 1000), 1);
  eq('…and the recent one stays', Object.keys(old['1'].lines), ['fresh']);
  const many = { '1': { name: 'c', lines: {} } };
  for (let i = 0; i < 12; i++) {
    many['1'].lines['l' + i] = { nm: 'l', dv: { A: dev(1, 1, 0, 0, 0, 0, 0, 0, 1, 1000 + i) } };
  }
  eq('…and the cap drops the least recently answered',
    S.stormStatsPrune(many, { statsTtlMs: 1e9, statsMaxLines: 5 }, 2000), 7);
  eq('…keeping the newest', Object.keys(many['1'].lines).sort(),
    ['l11', 'l10', 'l9', 'l8', 'l7'].sort());

  // --- the wire ----------------------------------------------------------
  const wired = S.stormStatsWirePack(statsA(), C, 0, 4242);
  eq('the payload names its version', wired.v, C.statsWireVersion);
  eq('…and carries one line', wired.n, 1);
  const statsBack = S.stormStatsWireUnpack(wired, C);
  eq('…which reads back with its counters intact',
    statsBack.stats['1'].lines.v1.dv.A.n, 10);
  eq('…and its name', statsBack.stats['1'].lines.v1.nm, 'Scotch');
  eq('a payload from a newer version is refused, never half-read',
    S.stormStatsWireUnpack({ v: C.statsWireVersion + 1, c: {} }, C), null);
  // A record read from a card is one another build wrote: a single bad field
  // would poison every total it is ever added to.
  const junk = S.stormStatsWireUnpack({ v: C.statsWireVersion, at: 1, c: {
    '1': { name: 'c', lines: {
      ok: { nm: 'a', dv: { A: { n: 3, g: 'x', d: null, m: 0, u: 0, ls: 9, lc: 3, t: 5 } } },
      bad: { nm: 'b', dv: { A: { n: 'lots' } } },
    } },
  } }, C);
  eq('a non-numeric counter is forced to a number', junk.stats['1'].lines.ok.dv.A.g, 0);
  eq('…and a record with no usable count is dropped whole',
    Object.keys(junk.stats['1'].lines), ['ok']);

  // The budget: fewer lines rather than a failed exchange.
  const lots = { '1': { name: 'Course one', lines: {} } };
  for (let i = 0; i < 60; i++) {
    lots['1'].lines['v' + i] = { nm: 'A line with a fairly long name ' + i,
      dv: { A: dev(4, 2, 1, 0, 0, 1, 0, 120, 4, 1000 + i) } };
  }
  const cutStats = S.stormStatsWirePack(lots, C, 1500, 1);
  eq('the budget cuts the record', cutStats.n < 60, true);
  eq('…and the count matches what is in it',
    cutStats.n, Object.keys(cutStats.c['1'].lines).length);
  eq('…and what is carried is the most recently answered',
    Object.keys(cutStats.c['1'].lines).indexOf('v59') >= 0, true);
  eq('…and it still reads back',
    Object.keys(S.stormStatsWireUnpack(cutStats, C).stats['1'].lines).length, cutStats.n);

  // --- §21) HOW THE ANSWERS WERE GIVEN ------------------------------------
  // A set used to write NOTHING here, so somebody who plays sets had an empty
  // record — a measurement of nothing. It writes now, and `s` is what stops the
  // resulting figure from being a mixture that does not say so.
  //
  // TWO SILENT FAILURES, and they fail in OPPOSITE directions. If `s` is never
  // incremented the caveat never appears and the mixture is presented as a
  // timed measurement — the thing §15.2 forbids. If `s` is ever allowed into a
  // denominator the percentages move, which is the thing it must never do: it
  // is a LABEL, not a term.
  const unh = S.stormStatBlank();
  S.stormStatApply(unh, { verdict: 'great', wp: 1.0 }, 100);
  eq('a timed answer is not counted as unhurried', unh.s, 0);
  S.stormStatApply(unh, { verdict: 'bad', wp: 9.0 }, 200, true);
  eq('…and a set answer is', unh.s, 1);
  eq('…without changing how many answers there are', unh.n, 2);
  // The one thing `s` must NEVER do: move a figure.
  const timedOnly = S.stormStatBlank();
  S.stormStatApply(timedOnly, { verdict: 'great', wp: 1.0 }, 100);
  S.stormStatApply(timedOnly, { verdict: 'bad', wp: 9.0 }, 200);
  eq('the found rate is the same whether or not the answers were timed',
    S.stormStatRate(unh), S.stormStatRate(timedOnly));
  eq('…and so is the average loss', S.stormStatLoss(unh), S.stormStatLoss(timedOnly));
  // It rolls up like every other counter, or a chapter's caveat would be the
  // last line's rather than the chapter's.
  const mixRoll = S.stormStatPlus(S.stormStatBlank(), unh);
  S.stormStatPlus(mixRoll, unh);
  eq('unhurried answers sum when records are folded together', mixRoll.s, 2);
  eq('…alongside the answers they are part of', mixRoll.n, 4);
  // The sentence itself, which is the whole reason the counter exists.
  eq('all timed says nothing', S.statUnhurriedNote({ n: 4, s: 0 }), '');
  eq('nothing at all says nothing', S.statUnhurriedNote({ n: 0, s: 0 }), '');
  eq('a mixture says it is one',
    /2 of 5/.test(S.statUnhurriedNote({ n: 5, s: 2 })), true);
  eq('…and names both conditions',
    /four seconds/.test(S.statUnhurriedNote({ n: 5, s: 2 })), true);
  eq('a record made entirely of set answers says THAT instead',
    S.statUnhurriedNote({ n: 5, s: 5 }), 'All 5 answered in a set, without a clock.');
  // The wire. `s` rides with NO version bump, §19's precedent: a payload
  // written before v0.154.0 has none, which reads as "all of these were timed"
  // — true of every answer any earlier build ever counted.
  const mixStats = { '1': { name: 'Course one', lines: {
    v1: { nm: 'Scotch', dv: { A: { n: 4, a: 1, g: 1, o: 1, b: 1, x: 0, u: 0,
      ls: 40, lc: 4, s: 3, t: 900 } } },
  } } };
  const mixBack = S.stormStatsWireUnpack(
    S.stormStatsWirePack(mixStats, C, 0, 4242), C);
  eq('the unhurried count survives the wire', mixBack.stats['1'].lines.v1.dv.A.s, 3);
  eq('…and a payload written without one reads as all-timed',
    S.stormStatsWireUnpack({ v: C.statsWireVersion, at: 1, c: { '1': { name: 'c', lines: {
      v1: { nm: 'x', dv: { A: { n: 2, a: 2, g: 0, o: 0, b: 0, x: 0, u: 0,
        ls: 10, lc: 2, t: 5 } } },
    } } } }, C).stats['1'].lines.v1.dv.A.s, 0);

  }

  // =========================================================================
  // 10) THE ENGINE TIER (§3.4's third source, §14.23)
  // =========================================================================
  // THIS TIER SHIPPED DEAD FROM v0.130.0 TO v0.148.0 and nothing said so.
  // Measured live 2026-08-29 on course 291847: the FIRST of the two searches
  // reached depth 17 of 20 in 20.7 s, i.e. one search alone outlasted the whole
  // pair's watchdog — and every update short of the target depth was DISCARDED,
  // so the job died on its watchdog with a perfectly good depth-17 evaluation
  // in hand. Every card ChessDB could not score was graded `unknown`, which
  // scores nothing and holds the streak, and read as the book being ignorant.
  //
  // The property below is the fix and it cannot be seen from outside: a slow
  // machine and an ignorant ChessDB produce IDENTICAL output — "No verdict" —
  // whether this works or not. So it is executed, with the budgets shrunk to
  // milliseconds and the updates fed in by hand.
  {
  const FEN = 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';
  const UCI = 'a7a6';   // …a6, so the reply is a WHITE-to-move position
  const AFTER = 'r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4';
  const CEIL = 20;
  // Real timers, tiny budgets: the state machine's whole subject is what
  // happens when one expires.
  const EC = Object.assign({}, C, {
    engineFallback: true,
    engineDepth: { desktop: CEIL, mobile: 18 },
    enginePhaseMs: 40,
    engineTimeoutMs: 400,
    engineDepthSlack: 3,
    engineMateCp: 10000,
  });
  const stEng = { eng: null, engSeq: 0 };
  S.__setEnv(stEng, EC);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // engine/engine.js's own update shape: White-normalised cp, `pv.uci`, and a
  // `done` flag set only by the bestmove fence.
  const upd = (fen, reqId, depth, cp, done, uci) => ({
    type: 'clo-engine-update', fen, reqId, depth, done: Boolean(done),
    pvs: [{ multipv: 1, cp, san: 'x', uci: uci || 'b5c6' }],
  });
  const begin = () => {
    engineHost.sent.length = 0;
    engineHost.state.altCheckBusy = false;
    engineHost.synced = 0;
    const promise = S.stormEngineLoss(FEN, UCI);
    return { promise, job: stEng.eng, req: stEng.eng && stEng.eng.reqId };
  };

  // --- the good case: both searches reach the ceiling ---------------------
  {
    const r = begin();
    eq('the first analyze is capped at the profile depth',
      engineHost.sent[0] && engineHost.sent[0].depth, CEIL);
    eq('…and it claims the shared engine', engineHost.state.altCheckBusy, true);
    S.onStormEngineUpdate(upd(FEN, r.req + ':best', CEIL, -60, true, 'a7a6'));
    const child = engineHost.sent[engineHost.sent.length - 1];
    eq('reaching the ceiling starts the reply search', child.reqId, r.req + ':child');
    eq('…on the position after the move', child.fen, AFTER);
    S.onStormEngineUpdate(upd(AFTER, r.req + ':child', CEIL, 90, true));
    const got = await r.promise;
    // Black to move, so the mover's score is the negated White figure: the
    // position is +60 for Black, and White's best reply is +90 for White, i.e.
    // −90 for us. loss = 60 − (−90) = 150.
    eq('the position is scored from the MOVER side', got && got.best, 60);
    eq('…and the reply negated into the same side', got && got.value, -90);
    eq('…and the depth reported is the one both ran to', got && got.depth, CEIL);
    eq('the engine is given back', stEng.eng, null);
    eq('…and the panel told to resume', engineHost.synced, 1);
  }

  // --- THE REGRESSION: neither search reaches the ceiling -----------------
  // This is the one assertion the shipped v0.148.0 fails. Everything arrives
  // below the target, exactly as it did live, and the tier must still answer.
  {
    const r = begin();
    S.onStormEngineUpdate(upd(FEN, r.req + ':best', 12, -50, false, 'a7a6'));
    S.onStormEngineUpdate(upd(FEN, r.req + ':best', 15, -70, false, 'a7a6'));
    await wait(EC.enginePhaseMs + 30);
    const child = engineHost.sent[engineHost.sent.length - 1];
    eq('a search that runs out of budget is TAKEN, not thrown away',
      child && child.reqId, r.req + ':child');
    // …AND THE REPLY IS CAPPED AT WHAT THE POSITION ACTUALLY REACHED. A
    // subtraction across two depths is the same mistake as one across two
    // evaluators, one size down.
    eq('…and the reply is asked for the depth the position reached, not the ceiling',
      child && child.depth, 15);
    S.onStormEngineUpdate(upd(AFTER, r.req + ':child', 15, 40, true));
    const got = await r.promise;
    eq('the pair still produces a verdict', Boolean(got), true);
    eq('…from the DEEPEST update each search managed', got && got.best, 70);
    eq('…and it names the depth that actually ran, never the ceiling',
      got && got.depth, 15);
  }

  // --- the budget expiring with nothing at all -----------------------------
  {
    const r = begin();
    await wait(EC.enginePhaseMs + 30);
    const got = await r.promise;
    eq('a search that produced nothing answers null', got, null);
    eq('…and still gives the engine back', engineHost.state.altCheckBusy, false);
    eq('…and never asks for the reply',
      engineHost.sent.filter((m) => m.type === 'clo-engine-analyze').length, 1);
  }

  // --- the two halves too far apart ---------------------------------------
  {
    const r = begin();
    S.onStormEngineUpdate(upd(FEN, r.req + ':best', 18, -50, false, 'a7a6'));
    await wait(EC.enginePhaseMs + 30);
    S.onStormEngineUpdate(upd(AFTER, r.req + ':child', 10, 40, false));
    await wait(EC.enginePhaseMs + 30);
    const got = await r.promise;
    eq('a pair searched to depth 18 and 10 is refused rather than subtracted',
      got, null);
    eq('…and the claim is released anyway', stEng.eng, null);
  }

  // --- an update belonging to somebody else --------------------------------
  {
    const r = begin();
    S.onStormEngineUpdate(upd(FEN, 'ac999:pre', CEIL, -50, true, 'a7a6'));
    S.onStormEngineUpdate(upd(FEN, r.req + ':best', CEIL, -50, true, 'a7a6'));
    eq("another module's update does not drive this job", r.job.foreign, 1);
    eq('…and ours still starts the reply search', r.job.phase, 'child');
    S.onStormEngineUpdate(upd(AFTER, r.req + ':child', CEIL, 50, true));
    await r.promise;
  }

  // --- one claim at a time --------------------------------------------------
  {
    const r = begin();
    eq('a second grade does not start a second search while one is claimed',
      await S.stormEngineLoss(FEN, UCI), null);
    S.onStormEngineUpdate(upd(FEN, r.req + ':best', CEIL, -50, true, 'a7a6'));
    S.onStormEngineUpdate(upd(AFTER, r.req + ':child', CEIL, 50, true));
    await r.promise;
    eq('…and once it is over the next one can', Boolean(begin().job), true);
    S.endEngineJob(stEng.eng, null);
  }

  // --- the ceiling is still a backstop -------------------------------------
  // The phase budget only fires while updates are flowing sensibly; a worker
  // that answers nothing at all for a whole phase and then goes quiet has to
  // be caught by something. `engineTimeoutMs` must stay above a full pair of
  // phases or it fires first and the phase budget can never matter.
  eq('the pair ceiling outlasts two phase budgets',
    C.engineTimeoutMs >= 2 * C.enginePhaseMs, true);
  eq('…and the whole grade outlasts the pair ceiling',
    C.gradeTimeoutMs > C.engineTimeoutMs, true);
  eq('the depth slack is small enough to mean something',
    C.engineDepthSlack > 0 && C.engineDepthSlack <= 4, true);
  }

  // ==========================================================================
  // 11) §17) THE SET's RULES
  //
  // The no-clock mode, whose whole subject is what happens after a MISTAKE — so
  // the rules below decide, for every answer, whether the session stops. Three
  // ways they fail and all three are silent:
  //
  //  * A HOLD RULE THAT NEVER FIRES leaves a mode that behaves exactly like a
  //    storm with no clock: every card still appears, every verdict still
  //    prints, and the one thing the mode exists for simply never happens.
  //  * `unknown` HELD would trap the user on a position ChessDB cannot score,
  //    with no answer to reveal and no way to satisfy the hold — and it is the
  //    obvious thing to lose, since `unknown` is not clean either.
  //  * AN OUTCOME MIS-FILED still produces a plausible tally: "8 of 12 first
  //    time" reads the same whether or not the retries were counted as first
  //    attempts.
  // ==========================================================================
  {
    const SC = { setCleanOn: ['great', 'good'], setRetryMax: 3 };

    // --- what settles a position, and what stops the session ---------------
    eq('a great move is clean', S.stormSetClean('great', SC), true);
    eq('a good move is clean', S.stormSetClean('good', SC), true);
    // The author's own boundary: more than 6% of the game given up. `ok` is
    // the first band past `goodWp`, so it is where the mode starts acting.
    eq('an inaccuracy is NOT clean', S.stormSetClean('ok', SC), false);
    eq('a mistake is not clean', S.stormSetClean('bad', SC), false);
    eq('a blunder is not clean', S.stormSetClean('blunder', SC), false);
    eq('…and neither is an ungradeable answer', S.stormSetClean('unknown', SC), false);

    eq('an inaccuracy holds the session', S.stormSetHeld('ok', SC), true);
    eq('a mistake holds it', S.stormSetHeld('bad', SC), true);
    eq('a blunder holds it', S.stormSetHeld('blunder', SC), true);
    eq('a good move does not', S.stormSetHeld('good', SC), false);
    eq('a great move does not', S.stormSetHeld('great', SC), false);
    // THE ONE THAT IS NOT `!clean`. An ungradeable answer is a verdict about
    // ChessDB, not about the user: there is no mistake to correct and no best
    // move to reveal, so holding on it is a position that can never be
    // satisfied. §15's record excludes it from both halves of its fraction for
    // the same reason.
    eq('an UNGRADEABLE answer does not hold it', S.stormSetHeld('unknown', SC), false);
    eq('…and neither does a missing verdict', S.stormSetHeld(null, SC), false);

    // --- how a resolved position is filed ----------------------------------
    eq('found with the first move played', S.stormSetOutcome(1, 'great', false, SC), 'first');
    eq('…and a good move counts the same', S.stormSetOutcome(1, 'good', false, SC), 'first');
    eq('found on the second attempt', S.stormSetOutcome(2, 'good', false, SC), 'retry');
    eq('found on the third', S.stormSetOutcome(3, 'great', false, SC), 'retry');
    // REVEALED BEATS EVERYTHING BELOW IT. Once the move has been shown, nothing
    // played afterwards says whether the position was known — which is exactly
    // why a revealed position is what the second pass exists to re-ask.
    eq('a shown answer is `shown` however good the move that follows',
      S.stormSetOutcome(1, 'great', true, SC), 'shown');
    eq('…and however many attempts came first',
      S.stormSetOutcome(3, 'good', true, SC), 'shown');
    // …EXCEPT for `unknown`, which is above it: a position ChessDB could not
    // score was never shown an answer, because there was no answer to show.
    eq('an ungradeable answer is not filed as shown',
      S.stormSetOutcome(1, 'unknown', true, SC), 'unknown');
    eq('a still-wrong answer that resolves anyway is `missed`',
      S.stormSetOutcome(2, 'blunder', false, SC), 'missed');

    // --- the tally, which is the mode's whole score ------------------------
    const mk = (outcome, secondOutcome) =>
      ({ card: {}, first: null, second: null, attempts: 1, outcome, secondOutcome });
    const set = [
      mk('first'), mk('first'), mk('retry'), mk('shown', 'first'),
      mk('shown', 'missed'), mk('unknown'), mk(null),
    ];
    const t = S.stormSetTally(set);
    eq('every entry is asked', t.asked, 7);
    eq('…and the one still in play is not resolved', t.resolved, 6);
    eq('two found first time', t.first, 2);
    eq('one on a retry', t.retry, 1);
    eq('two shown', t.shown, 2);
    eq('one ungradeable', t.unknown, 1);
    // THE SECOND PASS IS COUNTED SEPARATELY AND NEVER FOLDED IN. `first` and
    // `retry` say how a position went the FIRST time it was ever seen, which is
    // the question the mode is about; a position found only after being shown
    // the move must not be able to climb into them.
    eq('two came back on the second pass', t.again, 2);
    eq('…and one of those was found', t.againClean, 1);
    eq('the second pass did not inflate the first-time count', t.first, 2);

    // --- the two thresholds hold their meaning ------------------------------
    // The hold boundary IS `goodWp`, the author's own instruction, and the two
    // must not drift apart: if `setCleanOn` ever admitted the `ok` band, "more
    // than 6% of the game" would silently become "more than 10%".
    eq('the clean set is exactly the two bands that score in a storm',
      C.setCleanOn.join(','), 'great,good');
    eq('…which is the same membership the store drops on',
      C.setCleanOn.join(','), C.storeDropOn.join(','));
    // A cap of one would make "try again" a single guess and a cap in the tens
    // would let ~30 legal moves be searched rather than thought about.
    eq('the retry cap leaves room to think and not to search',
      C.setRetryMax >= 2 && C.setRetryMax <= 5, true);
    eq('a set is short enough to be finished in one sitting',
      C.setSize >= 4 && C.setSize <= 12, true);
  }

  // ========================================================================
  // 12) THE VERDICT PAUSE, and the background pass's bounds (v0.151.0)
  //
  // Two settings whose every failure mode is silent. A `verdictFastMs` above
  // `verdictMs` inverts the rule while every card still advances; one near zero
  // shows a verdict nobody can read, which looks like a rendering bug rather
  // than a number. And a background pass whose store target sits at or below
  // `queueTarget` can never run — the session's own producer keeps the queue
  // there — so the feature would simply, quietly, never happen.
  // ========================================================================
  {
    console.log('\n-- 12) the verdict pause and the background pass --');
    eq('the fast verdict pause is shorter than the full one',
      C.verdictFastMs < C.verdictMs, true);
    eq('...and long enough to be read', C.verdictFastMs >= 800, true);
    // If the background pass may only run with the queue full, its own stop
    // has to sit well above that or it stands down before it has begun.
    eq('the background store target leaves the pass something to do',
      C.backfillStore > C.queueTarget * 4, true);
    eq('...and its budget is smaller than the burst you ask for by name',
      C.backfillMaxCdb < C.gatherMaxCdb, true);
    // A pass with no beat between line ends is a flood, and the beat is also
    // what re-asks `backfillOk()` often enough for a press of Start to get its
    // bandwidth back promptly.
    eq('...and it pauses between line ends',
      C.backfillGapMs >= 500 && C.backfillGapMs <= 10000, true);
  }

  // ========================================================================
  // 13) §19) THE UNCOVERED-REPLY SOURCE
  //
  // The second source, and every rule in it fails the way every rule in this
  // feature fails — silently, yielding a plausible session made of the wrong
  // positions:
  //
  //  * WHOSE MOVE IT IS. A decision point is an OPPONENT-to-move position.
  //    Drop that test and the storm starts asking the user to improvise against
  //    lines they deliberately chose not to play (section 6c's rule, 24b's
  //    reason), which reads as the course being full of holes.
  //  * THE CASTLING SPELLING. Lichess writes O-O as KING TAKES ROOK, so a raw
  //    compare against the walk's own `e1g1` misses exactly the castling
  //    replies — and succeeds on everything else, which is what makes it
  //    invisible: the storm asks "what do you play against O-O?" about a
  //    position the course answers.
  //  * THE ORDER. "Most popular first" is the whole of what the user asked
  //    for, and a comparator the wrong way round still returns every reply.
  //  * THE TWO FLOORS. A share and an absolute count are two different rules;
  //    with either missing the session fills up with one-game sidelines or
  //    refuses everything at depth, and both look like "this course has no
  //    gaps".
  //  * THE STORE SPLIT. One store holds both sources, so a missing filter
  //    deals a frontier position into an uncovered session, where the panel
  //    describes it with the wrong sentence entirely.
  // ========================================================================
  {
    console.log('\n-- 13) the uncovered-reply source (§19) --');
    const uc = Object.assign({}, C, { uncMinShare: 3, uncMinGames: 20,
      uncMaxPerPosition: 4 });

    // --- stage 0: the decision points --------------------------------------
    const decVars = [
      { oid: 1, name: 'Italian', color: 'white', sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'] },
      { oid: 2, name: 'Ruy', color: 'white', sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'] },
      { oid: 3, name: 'Scotch', color: 'white', sans: ['e4', 'e5', 'Nf3', 'Nf6', 'Nxe5'] },
    ];
    const dec = await S.stormDecisions(decVars, uc);
    const at = (fen) => dec.find((d) => d.ck === cacheKey(fen));
    const startPoint = at(START_FEN);
    eq('the start position is not a decision point for White', Boolean(startPoint), false);
    const afterE4 = at('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
    eq('the position after 1.e4 is one', Boolean(afterE4), true);
    eq('…and it is BLACK to move there', afterE4.fen.split(' ')[1], 'b');
    eq('…for the WHITE repertoire', afterE4.side, 'w');
    eq('…which answers exactly the reply its lines play',
      Array.from(afterE4.covered).sort(), ['e7e5']);
    eq('…and three lines pass through it', afterE4.n, 3);
    // WHOSE MOVE IT IS. Every decision point must have the opponent to move,
    // or the storm is asking the user to second-guess their own repertoire.
    eq('every decision point has the OPPONENT to move',
      dec.every((d) => d.fen.split(' ')[1] !== d.side), true);
    // The position after 2...Nc6, where the course plays two different moves —
    // both are answers, so neither is a gap.
    const afterNc6 = at('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 6 4');
    eq('a position with the USER to move is not a decision point',
      Boolean(afterNc6), false);
    const afterNf3 = at('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2');
    eq('a position the course answers two ways covers both',
      Array.from(afterNf3.covered).sort(), ['b8c6', 'g8f6']);

    // A PAUSED line is not a source and still counts as coverage — §14.18's
    // asymmetry, in its second home. Both halves matter: the first stops the
    // storm asking about a line the user asked not to be prompted on, the
    // second stops it calling a move a gap when the course plainly answers it.
    const pausedDec = await S.stormDecisions([
      { oid: 1, name: 'Live', color: 'white', sans: ['e4', 'e5', 'Nf3'] },
      { oid: 2, name: 'Paused', color: 'white', paused: 1,
        sans: ['e4', 'c5', 'd4', 'cxd4'] },
    ], uc);
    const pAfterE4 = pausedDec.find((d) =>
      d.ck === cacheKey('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'));
    eq('a paused line still covers the reply it answers',
      Array.from(pAfterE4.covered).sort(), ['c7c5', 'e7e5']);
    eq('…but does not count as a source line', pAfterE4.n, 1);
    eq('…and is reported, so a refusal can say why', pausedDec.paused, 1);
    eq('a position only a paused line reaches is no decision point',
      pausedDec.some((d) => d.ck ===
        cacheKey('rnbqkbnr/pp1ppppp/8/2p5/3PP3/8/PPP2PPP/RNBQKBNR b KQkq d3 0 2')), false);
    // …and the same for a custom-FEN line, which likewise may cover and may
    // not be a source.
    const puzzleDec = await S.stormDecisions([
      { oid: 1, name: 'Live', color: 'white', sans: ['e4', 'e5', 'Nf3'] },
      { oid: 2, name: 'Puzzle', color: 'white', sans: ['c5', 'Nf3'],
        fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1' },
    ], uc);
    const qAfterE4 = puzzleDec.find((d) =>
      d.ck === cacheKey('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'));
    eq('a custom-FEN line covers the reply it answers',
      Array.from(qAfterE4.covered).sort(), ['c7c5', 'e7e5']);
    eq('…and is not counted as a source line', qAfterE4.n, 1);
    // A line whose colour the course does not state is walked for neither use.
    eq('a colourless line yields no decision point',
      (await S.stormDecisions([{ oid: 1, name: 'X', sans: ['e4', 'e5'] }], uc)).length, 0);
    // §14.18.3's index rides out on the array, which is what `frontierCovered`
    // hands the walk-stop AND what the harvest asks about a reply's child.
    eq('the continuation index rides out',
      dec.cont.w.has(S.stormCoverKey(
        'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2')), true);
    eq('…and holds nothing for the colour that has no lines', dec.cont.b.size, 0);

    // --- stage 1: which replies are gaps, and in what order -----------------
    const point = {
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      covered: new Set(['e7e5']),
    };
    const reply = (san, games) =>
      ({ san, white: games, draws: 0, black: 0 });
    const gaps = S.stormUncoveredMoves(point, [
      reply('e5', 4000), reply('c5', 3000), reply('e6', 1200), reply('c6', 900),
      reply('d5', 400), reply('Nf6', 300), reply('g6', 60), reply('b6', 5),
    ], 10000, uc);
    eq('the covered reply is not offered',
      gaps.some((g) => g.san === 'e5'), false);
    eq('…and the most popular gap is first', gaps[0].san, 'c5');
    eq('MOST POPULAR FIRST, all the way down',
      gaps.map((g) => g.san), ['c5', 'e6', 'c6', 'd5']);
    eq('…capped at the cap', gaps.length, uc.uncMaxPerPosition);
    eq('the share is against the position’s own total, not the listed moves',
      Math.round(gaps[0].share), 30);
    eq('…and the reply’s own game count rides with it', gaps[0].games, 3000);
    // THE TWO FLOORS ARE TWO RULES. `g6` clears the share (0.6% of 10000 is
    // under 3) and `b6` clears neither; a move can also clear the share and
    // fail the absolute floor, which is the case a single rule cannot express.
    const deep = S.stormUncoveredMoves(point, [reply('c5', 12), reply('e6', 8)], 40, uc);
    eq('a reply popular in share but tiny in games is refused', deep.length, 0);
    const wide = S.stormUncoveredMoves(point, [reply('c5', 30)], 100000, uc);
    eq('…and a reply with plenty of games but no share is refused too',
      wide.length, 0);
    // An unresolvable SAN is DROPPED, never guessed at.
    eq('a SAN that will not resolve is dropped',
      S.stormUncoveredMoves(point, [reply('Qh5', 5000)], 10000, uc).length, 0);

    // THE CASTLING TRAP (section 6c's v0.48.1 rule, from the other side).
    // Lichess writes Black's O-O as `e8h8`; the course's covered set, built by
    // `walkVariation`, spells it `e8g8`. A raw compare offers a position the
    // course answers, and succeeds on every other move.
    const castleFen = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R b KQkq - 6 5';
    const castlePoint = { fen: castleFen, covered: new Set(['e8g8']) };
    const castleGaps = S.stormUncoveredMoves(castlePoint,
      [{ san: 'O-O', uci: 'e8h8', white: 5000, draws: 0, black: 0 },
        { san: 'd6', uci: 'd7d6', white: 2000, draws: 0, black: 0 }], 10000, uc);
    eq('a covered CASTLING reply is recognised through its SAN',
      castleGaps.map((g) => g.san), ['d6']);
    eq('…and an uncovered one is still offered',
      S.stormUncoveredMoves({ fen: castleFen, covered: new Set(['d7d6']) },
        [{ san: 'O-O', uci: 'e8h8', white: 5000, draws: 0, black: 0 }], 10000, uc)
        .map((g) => g.uci), ['e8g8']);

    // --- the store: two sources, one store ---------------------------------
    const uCand = {
      fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2',
      ply: 1, userColor: 'w', scored: [{ uci: 'g1f3', san: 'Nf3', score: 20, winrate: 52 }],
      arrived: { uci: 'c7c5', san: 'c5' },
      unc: { san: 'c5', uci: 'c7c5', share: 30, games: 3000 },
    };
    const packedU = S.stormPack(uCand, { names: ['Italian'], oids: ['1'], games: 90000 });
    eq('an uncovered position is marked in the store', packedU.u, 1);
    eq('…its share is kept in tenths of a per cent', packedU.sh, 300);
    // §14.19's reachability is the REPLY's own count here, not the decision
    // point's — which is what makes "ask about the popular gaps first" the
    // draw order that already exists rather than a new rule.
    eq('…and the reach is the REPLY’s own game count, not the position’s',
      packedU.g, 3000);
    const backU = S.stormUnpack(packedU);
    eq('…and it comes back as an uncovered candidate', backU.unc.san, 'c5');
    eq('…with its share', backU.unc.share, 30);
    const fCand = Object.assign({}, uCand, { unc: null });
    const packedF = S.stormPack(fCand, { names: ['Italian'], oids: ['1'], games: 90000 });
    eq('a frontier position is not marked', packedF.u, undefined);
    eq('…and its reach is still the line end’s', packedF.g, 90000);
    eq('…and unpacks with no reply', S.stormUnpack(packedF).unc, null);

    const store = { a: packedU, b: packedF };
    eq('the store splits by source',
      Object.keys(S.stormFilterSource(store, 'uncovered')), ['a']);
    eq('…and the frontier half is the rest',
      Object.keys(S.stormFilterSource(store, 'frontier')), ['b']);
    eq('an entry written before v0.152.0 is a frontier position',
      Object.keys(S.stormFilterSource({ b: { f: 'x' } }, 'frontier')), ['b']);
    // The popularity order survives the store: among positions nobody has
    // answered, the more played gap comes first (§14.19's bucket, fed by the
    // reply's own count).
    const drawn = S.stormStoreDraw({
      big: S.stormPack(Object.assign({}, uCand,
        { unc: { san: 'c5', uci: 'c7c5', share: 30, games: 3000 } }),
      { names: ['A'], oids: ['1'] }),
      small: S.stormPack(Object.assign({}, uCand,
        { fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2',
          unc: { san: 'e5', uci: 'e7e5', share: 4, games: 40 } }),
      { names: ['B'], oids: ['2'] }),
    }, () => 0.5, C).map((d) => d.name);
    eq('the more popular gap is drawn first', drawn, ['A', 'B']);

    // --- the wire ----------------------------------------------------------
    const wire = S.stormWirePack({ a: packedU, b: packedF }, {}, C, 0);
    eq('the wire carries the uncovered mark', wire.p.a.u, 1);
    eq('…and the share', wire.p.a.sh, 300);
    const backWire = S.stormWireUnpack(wire, C);
    eq('…and both come back', Object.keys(backWire.store).sort(), ['a', 'b']);
    eq('…the uncovered one still marked', backWire.store.a.u, 1);
    eq('…and the frontier one still not', backWire.store.b.u, undefined);
    eq('…so a payload written before v0.152.0 reads as frontier positions',
      Object.keys(S.stormFilterSource(backWire.store, 'frontier')), ['b']);

    // --- the record: two questions, never pooled ---------------------------
    eq('a card knows which record it belongs in',
      S.statMapOf({ storm: { unc: { san: 'c5' } } }), 'ulines');
    eq('…and a frontier card the other', S.statMapOf({ storm: {} }), 'lines');
    const recA = S.stormStatBlank(), recB = S.stormStatBlank();
    S.stormStatApply(recA, { verdict: 'great', wp: 1 }, 1000);
    S.stormStatApply(recB, { verdict: 'blunder', wp: 40 }, 1000);
    const mine = { 7: { name: 'C', lines: { 1: { nm: 'L', dv: { d1: recA } } },
      ulines: { 1: { nm: 'L', dv: { d1: recB } } } } };
    eq('the two records are not pooled',
      S.stormStatRate(S.stormStatRoll([mine[7].lines[1]])), 1);
    eq('…and the other reads its own answers',
      S.stormStatRate(S.stormStatRoll([mine[7].ulines[1]])), 0);
    // The wire and the merge carry both, and a device that has only one is the
    // ordinary case rather than an error.
    const sw = S.stormStatsWirePack(mine, C, 0, 2000);
    eq('the record wire carries both maps', sw.n, 2);
    const swBack = S.stormStatsWireUnpack(sw, C);
    eq('…and both come back', Object.keys(swBack.stats[7].ulines), ['1']);
    const local = {};
    S.stormStatsMerge(local, swBack.stats);
    eq('a merge keeps them apart',
      S.stormStatRate(S.stormStatSum(local[7].ulines[1].dv)), 0);
    eq('…and does not move answers between them',
      S.stormStatSum(local[7].lines[1].dv).n, 1);
    const only = { 7: { name: 'C', lines: { 1: { nm: 'L', dv: { d1: recA } } } } };
    const into = {};
    S.stormStatsMerge(into, only);
    eq('a device with only the old record merges cleanly',
      S.stormStatSum(into[7].lines[1].dv).n, 1);
    eq('…and grows no record it was not sent', into[7].ulines, undefined);
    // The cap is per map: a long uncovered record must not delete a frontier
    // line's history.
    const many = { 7: { name: 'C', lines: {}, ulines: {} } };
    for (let i = 0; i < C.statsMaxLines + 5; i++) {
      many[7].ulines['u' + i] = { nm: 'u', dv: { d1: Object.assign(
        S.stormStatBlank(), { n: 1, a: 1, t: 5000 + i }) } };
    }
    many[7].lines.keep = { nm: 'k', dv: { d1: Object.assign(
      S.stormStatBlank(), { n: 1, a: 1, t: 5000 }) } };
    S.stormStatsPrune(many, C, 5000);
    eq('the line cap is per record, not shared',
      Boolean(many[7].lines.keep), true);
    eq('…and the long one is capped', Object.keys(many[7].ulines).length, C.statsMaxLines);

    // --- what the panel says -----------------------------------------------
    eq('a share reads to one decimal under ten', S.stormSharePct(3.42), '3.4%');
    eq('…and to none above it', S.stormSharePct(30.4), '30%');
    eq('a frontier card has no gap note', S.stormGapNote({ plyPast: 3 }), '');
    eq('an uncovered card names the reply and its share',
      S.stormGapNote({ unc: { san: 'c5', share: 30 } }),
      'after c5, which your course never answers · 30% of games here');
    eq('…and says the first half even with no share',
      S.stormGapNote({ unc: { san: 'c5' } }),
      'after c5, which your course never answers');
  }

  // --- 14) the stored Stockfish list (§23) ---------------------------------
  //
  // EVERY FAILURE HERE IS SILENT. A list is a list: whichever source filled it,
  // `stormMoveLoss` reads it, every verdict still prints, and every number
  // still looks like a number. What tells the two apart is `d` alone — so a
  // `d` that does not survive the pack, the wire or the merge does not break
  // anything visible, it just quietly puts the feature back on the source
  // §12.3c measured as biased, while labelling it as a search.
  {
    console.log('\n-- 14) the stored Stockfish list (§23) --\n');
    const cand = {
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      ply: 3, userColor: 'w', scored: [
        { uci: 'e2e4', san: 'e4', score: 30 },
        { uci: 'd2d4', san: 'd4', score: 18 },
        { uci: 'g1f3', san: 'Nf3', score: 12 },
      ],
      arrived: null, unc: null,
    };
    const f = { names: ['L'], oids: ['9'], games: 100 };

    const plain = S.stormPack(cand, f);
    eq('a ChessDB list carries no depth', plain.d, undefined);
    eq('…and unpacks as one', S.stormUnpack(plain).listDepth, 0);

    const deep = S.stormPack(Object.assign({ listDepth: 20 }, cand), f);
    eq('an engine list carries its depth', deep.d, 20);
    eq('…and unpacks with it', S.stormUnpack(deep).listDepth, 20);
    eq('…and its moves are unchanged', S.stormUnpack(deep).scored.length, 3);
    // The one that would be missed: a depth of 0 must read as "ChessDB", never
    // as "an engine list searched to depth 0", which would suppress the second
    // search AND claim a search that never ran.
    eq('a zero depth is not an engine list',
      S.stormUnpack(Object.assign({}, deep, { d: 0 })).listDepth, 0);

    // --- the wire ----------------------------------------------------------
    const store = { ck1: deep, ck2: plain };
    const packed = S.stormWirePack(store, {}, C, 0, 0);
    eq('the wire carries the depth', packed.p.ck1.d, 20);
    eq('…and carries none where there is none', packed.p.ck2.d, undefined);
    const back = S.stormWireUnpack(packed, C);
    eq('…and it survives the round trip', back.store.ck1.d, 20);
    eq('…on the right entry only', back.store.ck2.d, undefined);
    eq('…with the moves intact', back.store.ck1.m.length, 3);

    // --- the merge ---------------------------------------------------------
    // THE POINT OF CARRYING IT AT ALL: a phone cannot run this search, so a
    // desktop that has deepened a position is the only way the phone will ever
    // grade it with an engine.
    const mine = { ck1: JSON.parse(JSON.stringify(plain)) };
    const theirs = { ck1: JSON.parse(JSON.stringify(deep)) };
    const m1 = S.stormWireMerge(mine, theirs, {}, {}, 0, 0);
    eq('a deeper list is taken from the other device', mine.ck1.d, 20);
    eq('…and counted', m1.deepened, 1);
    // …and the reverse must NOT happen, or a device that has done the work
    // loses it to one that has not.
    const mine2 = { ck1: JSON.parse(JSON.stringify(deep)) };
    const theirs2 = { ck1: JSON.parse(JSON.stringify(plain)) };
    const m2 = S.stormWireMerge(mine2, theirs2, {}, {}, 0, 0);
    eq('a shallower list never displaces a deeper one', mine2.ck1.d, 20);
    eq('…and nothing is counted', m2.deepened, 0);
    eq('…and the moves are the deep ones', mine2.ck1.m.length, 3);
    // The moves MOVE WITH the depth. A depth taken without them would be a
    // claim about scores that were never measured at it.
    const short = Object.assign(JSON.parse(JSON.stringify(deep)), { m: [], d: 24 });
    const mine3 = { ck1: JSON.parse(JSON.stringify(plain)) };
    S.stormWireMerge(mine3, { ck1: short }, {}, {}, 0, 0);
    eq('a depth with no moves behind it is refused', mine3.ck1.d, undefined);

    // --- what it is called -------------------------------------------------
    // §14.20's rule, and the half that is easy to get backwards: `.clo-cdb--est`
    // means "ChessDB computed this for us just now" and is FALSE of both engine
    // sources.
    eq('a stored engine list is not an estimate',
      S.stormEstimated({ source: 'sflist' }), false);
    eq('a ChessDB list still is', S.stormEstimated({ source: 'list' }), true);
    eq('…and so is its child tier', S.stormEstimated({ source: 'child' }), true);
    eq('the engine tier is not', S.stormEstimated({ source: 'engine' }), false);
    eq('a stored engine list names the engine and its depth',
      S.stormSourceLabel({ source: 'sflist', depth: 20 }), 'by Stockfish d20');
    // §23) The engine tier's own sentence must not describe a search that did
    // not run: with a stored anchor only the reply is searched.
    eq('a one-search engine grade does not claim two',
      /two local Stockfish searches/.test(
        S.stormSourceTitle({ source: 'engine', depth: 20, oneSearch: true })), false);
    eq('…and still names the depth',
      S.stormSourceTitle({ source: 'engine', depth: 20, oneSearch: true })
        .indexOf('depth 20') >= 0, true);
    eq('a two-search engine grade still says so',
      /two local Stockfish searches/.test(
        S.stormSourceTitle({ source: 'engine', depth: 20 })), true);
    eq('…and its sentence is its own',
      S.stormSourceTitle({ source: 'sflist', depth: 20 }) ===
      S.stormSourceTitle({ source: 'engine', depth: 20 }), false);
    // A `sflist` verdict names the ENGINE's best, like the engine tier and for
    // the same reason — both halves come from one search — and prints no win
    // rate, which is a ChessDB figure.
    const line = S.stormBestLine(
      { source: 'sflist', depth: 20, bestSan: 'Nf3', bestScore: 30,
        san: 'a3', score: -40, winrate: 44 },
      { bestSan: 'WRONG', bestScore: 999, bestWinrate: 51 });
    eq('…and names the engine best, not the card\'s', line.indexOf('Nf3') >= 0, true);
    eq('…never the stored one', line.indexOf('WRONG'), -1);
    eq('…and prints no win rate', line.indexOf('%'), -1);
  }

  // --- 15) the gather's depth rule (§23, v0.159.0) -------------------------
  //
  // "Depth 20 or do not store it." EVERY failure here is silent in the same way
  // section 14's are: a list is a list whichever iteration filled it, every
  // verdict computed from one still prints, and `d` — which is what says how
  // deep it is — is written from the same number that chose the iteration. So a
  // rule that picks an iteration IN FLIGHT files a partial list under a depth
  // most of its moves never reached, and nothing downstream can tell.
  {
    console.log('\n-- 15) the gather\'s depth rule (§23) --\n');
    const rows = (n) => new Map(Array.from({ length: n }, (_, i) => ['a' + i, 0]));

    // A search IN PROGRESS: depth 19 finished at twelve lines, depth 20 has the
    // first three of its own. This is the shape of every update while a search
    // is running, and reading 20 off it is the silent bug.
    const inFlight = () => ({
      depth: 20, multipv: 12,
      byDepth: new Map([[18, rows(12)], [19, rows(12)], [20, rows(3)]]),
    });
    eq('an iteration in flight is not the complete one',
      S.deepestCompleteList(inFlight()), 19);
    eq('…so a running search short of the target stores nothing',
      S.deepenPickDepth(inFlight(), false, C), 0);

    // The same search a moment later, with the target iteration whole. This is
    // both the completion TRIGGER and the answer.
    const done20 = () => ({
      depth: 20, multipv: 12,
      byDepth: new Map([[19, rows(12)], [20, rows(12)]]),
    });
    eq('a whole target iteration is the complete one',
      S.deepestCompleteList(done20()), 20);
    eq('…and is what gets stored', S.deepenPickDepth(done20(), false, C), 20);

    // THE RULE THIS VERSION EXISTS FOR. A search that ran out of time at depth
    // 17 used to be TAKEN at 17; it is now refused, whether or not the engine
    // stopped of its own accord.
    const cut = () => ({
      depth: 20, multipv: 12,
      byDepth: new Map([[16, rows(12)], [17, rows(12)]]),
    });
    eq('a search cut short of the target stores nothing',
      S.deepenPickDepth(cut(), false, C), 0);
    eq('…and finishing early does not rescue it',
      S.deepenPickDepth(cut(), true, C), 0);

    // …AND THE ONE RELAXATION, which is about WIDTH and never depth. A finished
    // search whose last iteration lost a line to a bounded score is still a
    // depth-20 search, and refusing it throws away minutes of a phone's work.
    const narrow = () => ({
      depth: 20, multipv: 12,
      byDepth: new Map([[19, rows(12)], [20, rows(11)]]),
    });
    eq('a narrow final iteration is not the complete one',
      S.deepestCompleteList(narrow()), 19);
    eq('…so a RUNNING search does not take it',
      S.deepenPickDepth(narrow(), false, C), 0);
    eq('…but a FINISHED one does, at its own depth',
      S.deepenPickDepth(narrow(), true, C), 20);

    // …down to `deepenMinMoves` and no further: a two-move list at depth 20 is
    // barely better than the anchor alone, which is that floor's whole job.
    const thin = (n) => ({
      depth: 20, multipv: 12,
      byDepth: new Map([[19, rows(12)], [20, rows(n)]]),
    });
    eq('the relaxation stops at deepenMinMoves',
      S.deepenPickDepth(thin(C.deepenMinMoves), true, C), 20);
    eq('…and refuses below it',
      S.deepenPickDepth(thin(C.deepenMinMoves - 1), true, C), 0);

    // MultiPV is clamped to the legal move count, so a five-move position
    // completes at five and must not read as four-fifths of a full iteration.
    eq('a position with few legal moves completes at its own width',
      S.deepenPickDepth({ depth: 20, multipv: 12,
        byDepth: new Map([[19, rows(5)], [20, rows(5)]]) }, false, C), 20);

    // A search that got PAST the target is stored at what it reached, never at
    // the target: `d` has to be the depth that ran.
    eq('a deeper complete iteration is stored at ITS depth',
      S.deepenPickDepth({ depth: 20, multipv: 12,
        byDepth: new Map([[20, rows(12)], [22, rows(12)]]) }, false, C), 22);

    eq('nothing at all stores nothing',
      S.deepenPickDepth({ depth: 20, multipv: 12, byDepth: new Map() }, true, C), 0);

    // THE CONFIG ITSELF. `deepenDepth` is a SCALAR, and that is the whole of
    // "one standard for every device" — a per-profile map would put a phone's
    // depth-18 lists and a desktop's depth-20 ones in one store, wearing the
    // same `d`. It must also sit under BOTH engine.js profile ceilings, or
    // engine.js's own `Math.min` lowers it and that device quietly stores a
    // shallower standard than the one it was asked for.
    eq('deepenDepth is one number, not a per-profile map',
      typeof C.deepenDepth, 'number');
    eq('…at or below the desktop profile ceiling',
      C.deepenDepth <= Number(PROF[1]), true);
    eq('…and at or below the MOBILE one, which is the lower of the two',
      C.deepenDepth <= Number(PROF_M[1]), true);
    // The stall watchdog has to outlast a slow iteration, or it becomes the
    // truncation this version removed wearing a different name.
    eq('the stall watchdog is minutes, not seconds',
      C.deepenStallMs === 0 || C.deepenStallMs >= 300000, true);
  }

  // ========================================================================
  // 16) THE COVERAGE KEY AND THE STORED-POSITION SWEEP (§19b)
  //
  // Both halves fail SILENTLY and in the same way: a card whose position the
  // repertoire covers looks exactly like a card whose position it does not, so
  // the only way to see either is to compare what the two keys answer about the
  // same board.
  //
  // THE FIXTURE IS A REAL TRANSPOSITION, not a hand-built pair of FENs: two
  // lines of one repertoire reaching one position by opposite move orders
  // (1.e4 e6 2.d4 c5 and 1.e4 c5 2.d4 e6), which differ in NOTHING but the en
  // passant square — c6 in the first, because the double pawn push is the last
  // move there, and dash in the second, where it was the move before. That is
  // what a transposition IS, and it is why cacheKey cannot answer this
  // question.
  // ========================================================================
  {
    console.log('\n-- 16) the coverage key and the stored sweep (19b) --');
    const uc = Object.assign({}, C, { uncMinShare: 3, uncMinGames: 20,
      uncMaxPerPosition: 4 });
    const lineA = { oid: 11, name: 'French', color: 'white',
      sans: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Bb4'] };
    const lineB = { oid: 12, name: 'Sicilian, e6', color: 'white',
      sans: ['e4', 'c5', 'd4', 'e6', 'Nf3', 'a6'] };
    // A's decision point, the reply it does not answer, and the board that
    // reply leads to — all computed the way the harvest computes them.
    const afterD4 = 'rnbqkbnr/pppp1ppp/4p3/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq d3 0 2';
    const childA = S.fenAfterUci(afterD4, 'c7c5');
    const inB = 'rnbqkbnr/pp1p1ppp/4p3/2p5/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3';
    const other = 'rnbqkbnr/pp1p1ppp/4p3/2p5/3PP3/2N5/PPP2PPP/R1BQKBNR b KQkq - 1 3';

    // --- the key itself -----------------------------------------------------
    eq('the two routes really do reach one board',
      childA.split(' ').slice(0, 3).join(' '), inB.split(' ').slice(0, 3).join(' '));
    eq('and cacheKey says they are different positions',
      cacheKey(childA) === cacheKey(inB), false);
    eq('the coverage key says they are the same',
      S.stormCoverKey(childA), S.stormCoverKey(inB));
    // CASTLING STAYS. A king that has moved and come home leaves the same
    // placement and a genuinely different position, so dropping this field too
    // would answer "covered" about a board nobody can castle in.
    eq('but castling rights are still part of it',
      S.stormCoverKey('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1') ===
      S.stormCoverKey('r3k2r/8/8/8/8/8/8/R3K2R w - - 0 1'), false);
    eq('and so is the side to move',
      S.stormCoverKey(START_FEN) ===
      S.stormCoverKey(START_FEN.replace(' w ', ' b ')), false);

    // --- and what it costs, through the real pipeline ------------------------
    const trans = await S.stormDecisions([lineA, lineB], uc);
    const point = trans.find((d) => d.ck === cacheKey(afterD4));
    eq('the position after 2.d4 is a decision point', Boolean(point), true);
    eq('answering only the reply its own line plays',
      Array.from(point.covered), ['d7d5']);
    eq('so 2...c5 reads as an unanswered reply', point.covered.has('c7c5'), false);
    // THE WHOLE POINT. The course plays 3.Nf3 on that board by the other move
    // order, so the storm must not ask what to play there.
    eq('the course does answer the position 2...c5 leads to',
      S.stormReentered(trans.cont.w, CloSan.parseFen(childA), childA, 'w'), true);
    // ...and the same question asked with the exact key, which is what shipped:
    // this is the assertion that fails when the key is put back.
    eq('which cacheKey alone cannot see',
      trans.cont.w.has(cacheKey(childA)), false);
    eq('the index holds the board under the coverage key instead',
      trans.cont.w.has(S.stormCoverKey(childA)), true);

    // --- the sweep ----------------------------------------------------------
    // THE HARVEST'S CHECK IS NOT ENOUGH: produceFromStore runs before the
    // course is read, so a position stored weeks ago — before the user went and
    // prepared the very line this feature showed them — is dealt with no
    // coverage test at all.
    const sweepSt = {
      pool: trans,
      store: {
        [cacheKey(childA)]: { f: childA, c: 'w', m: [['g1f3', 'Nf3', 12]], t: 1 },
        // A position nothing in the course answers, which must survive.
        keep: { f: other, c: 'w', m: [['a7a6', 'a6', 5]], t: 1 },
        // ...and one with no side recorded, which cannot be judged and stays.
        noside: { f: childA, m: [['g1f3', 'Nf3', 12]], t: 1 },
      },
      storeQueue: [{ ck: cacheKey(childA) }, { ck: 'keep' }],
      queue: [{ startFen: childA }, { startFen: other }],
      storeDirty: false,
      seen: new Set(),
    };
    S.__setEnv(sweepSt, C);
    const swept = S.dropCoveredStored();
    eq('the covered stored position is dropped', swept, 1);
    eq('and is gone from the store', Boolean(sweepSt.store[cacheKey(childA)]), false);
    eq('and from the queue it had already been dealt into', sweepSt.queue.length, 1);
    eq('and from the store queue behind it', sweepSt.storeQueue.length, 1);
    eq('a position the course does not answer survives',
      Boolean(sweepSt.store.keep), true);
    // A record with no c cannot be asked whose move it is, and a sweep that
    // guessed would delete positions on a coin toss.
    eq('and so does one with no side recorded', Boolean(sweepSt.store.noside), true);
    eq('the write is marked', sweepSt.storeDirty, true);
    // NO POOL, NO SWEEP: the course could not be read, and a store is worth
    // more than a rule applied against nothing.
    const noPool = { pool: null, store: { a: { f: childA, c: 'w' } }, queue: [], storeQueue: [] };
    S.__setEnv(noPool, C);
    eq('with no course read nothing is dropped', S.dropCoveredStored(), 0);
    eq('and the store is untouched', Boolean(noPool.store.a), true);
  }

  // --- 17) the walk's scorer and its provenance (§26, v0.164.0) ------------
  // ChessDB is no longer what ends a walk: `askScores` falls through to
  // Stockfish where the book is ignorant. Two things about that fail SILENTLY
  // and neither is visible from any verdict.
  {
    console.log('\n-- 17) the walk\'s scorer and its provenance (§26) --');

    // (a) A LIST'S PROVENANCE REACHES THE STORE. `stormPack` files
    // `cand.listDepth` as `d`, and §23's whole compatibility story is that an
    // ABSENT `d` means a ChessDB list. So a walk that searched a position and
    // did not record the depth stores an engine list wearing ChessDB's
    // clothes — it still grades, still prints, and is graded by the source
    // §23.1 measured as biased while `stormBestLine` calls it a search.
    const scoredEng = [
      { uci: 'e2e4', san: 'e4', score: 30 },
      { uci: 'd2d4', san: 'd4', score: 22 },
      { uci: 'g1f3', san: 'Nf3', score: 18 },
      { uci: 'c2c4', san: 'c4', score: 10 },
      { uci: 'b1c3', san: 'Nc3', score: 4 },
      { uci: 'g2g3', san: 'g3', score: -40 },
    ];
    scoredEng.depth = 14;                       // as `askEngineScores` hangs it
    const posStart = CloSan.parseFen(START_FEN);
    const cEng = S.stormCandidate({
      fen: START_FEN, pos: posStart, scored: scoredEng, ply: 2, userSide: 'w',
      arrived: null, prevCapSq: null, gaveCheck: false,
    }, C);
    eq('an engine-scored list carries its depth onto the candidate',
      cEng.listDepth, 14);
    eq('...and `stormPack` files it as the entry\'s d',
      S.stormPack(cEng, { names: ['x'], oids: ['1'] }).d, 14);

    // The other half of the same rule, and the one an implementation loses:
    // a ChessDB list has no `depth`, and its entry must carry no `d`.
    const scoredCdb = scoredEng.map((m) => ({ ...m }));   // a plain array
    const cCdb = S.stormCandidate({
      fen: START_FEN, pos: posStart, scored: scoredCdb, ply: 2, userSide: 'w',
      arrived: null, prevCapSq: null, gaveCheck: false,
    }, C);
    eq('a ChessDB list records no depth', cCdb.listDepth, 0);
    eq('...and its entry carries no d, which is what says it is one',
      S.stormPack(cCdb, { names: ['x'], oids: ['1'] }).d, undefined);
    // …which is what `stormStoreDraw`'s `deep` term reads, so the two must
    // still sort apart. A `listDepth` that never arrived would make every
    // walked position look unscored and undo §23.8's ordering entirely.
    eq('so the two are still distinguishable downstream',
      (cEng.listDepth > 0) !== (cCdb.listDepth > 0), true);

    // (b) THE CONFIG'S OWN SHAPE, asserted the way §15 asserts `deepenDepth`'s:
    // these are the numbers whose wrong values produce a storm that runs
    // perfectly and finds nothing.
    const walkMultipv = num('walkMultipv');
    const walkDepth = num('walkDepth');
    // THE ONE THAT KILLS THE FEATURE IN SILENCE. `stormPickReject` rejects on
    // `nScored < minScored`, and `spread5` is best-minus-FIFTH — so a list
    // narrower than `minScored` fails EVERY candidate with "too few moves
    // scored to rank an answer". Every walk still runs, every request is still
    // spent, and nothing is ever stored.
    eq('the walk searches at least as wide as `minScored` demands',
      walkMultipv >= C.minScored, true);
    // …and wide enough for `spread5` to be a spread of five rather than of
    // however many came back.
    eq('...which is also what makes spread5 a five-move spread',
      walkMultipv >= 5, true);
    // A WALK MUST NOT WRITE A STANDARD. §23.7: a stored list is used for as
    // long as the position is in the store and crosses devices, so
    // `deepenDepth` is one number for every device. The walk is deliberately
    // shallower — its job is to decide where to step next — and the deepen
    // pass's `undeepened` test (`d < deepenDepth`) is what later raises what a
    // walk stored. At or above it, a walk's list would masquerade as deepened
    // and the pass would never revisit it.
    eq('the walk searches shallower than the deepen standard',
      walkDepth < num('deepenDepth'), true);
    eq('...but deep enough to be worth storing', walkDepth >= 10, true);

    // (c) A FALLBACK THAT ANSWERS MUST NOT STOP THE WALK — the contract the
    // whole change rests on, and the reason both walks take `ask` as a
    // parameter. What is asserted is that a walk's reach is decided ENTIRELY
    // by its scorer: hand it one that runs out and it stops, hand it one that
    // answers and it runs its length. That is what makes `askScores`'s
    // fall-through sufficient, with no change to either walk.
    const flat = (fen) => {
      const p = CloSan.parseFen(fen);
      if (!p) return null;
      const out = [];
      for (const m of CloSan.generateMoves(p)) {
        const uci = squareName(m.from) + squareName(m.to) + (m.promo || '');
        // Scores fan out by 10cp a move, so `spread5` (best - 5th) is 40 and
        // `spread2` is 10 — inside the pick band either way. What is being
        // asserted here is where the WALK stops, not which positions survive.
        out.push({ uci, san: CloSan.moveToSan(p, uci) || '', score: 20 - out.length * 10 });
      }
      return out.length >= 6 ? out : null;
    };
    let asked = 0;
    // ChessDB-only: ignorant after two plies, exactly the shape measured live.
    const cdbOnly = async (fen) => (++asked <= 2 ? flat(fen) : null);
    asked = 0;
    const short = await S.stormRandomLine(
      START_FEN, 'w', cdbOnly, { ...C, randomMinPlies: 8, maxPly: 8 },
      () => 0.5, null, null);
    eq('a ChessDB-only walk stops where the book runs out',
      short.stop, 'nothing could score this position');

    // …and the same walk, with a scorer that falls through, runs its length.
    asked = 0;
    const hybrid = async (fen) => flat(fen);
    const long = await S.stormRandomLine(
      START_FEN, 'w', hybrid, { ...C, randomMinPlies: 8, maxPly: 8 },
      () => 0.5, null, null);
    eq('with a fallback it reaches the ply limit instead',
      long.stop, 'the walk reached its ply limit');
    eq('...and so yields strictly more candidates',
      long.out.length > short.out.length, true);
  }

  // ----------------------------------------------------------------------
  // 18) ONE CARD PER COURSE, AND THE GUARD BEHIND IT (§27b)
  //
  // Both failures here are silent and both have already happened once. The
  // pre-v0.166.0 transport had ONE card name for every course, so a second
  // course synced overwrote the first and the next device to open the first
  // course merged the other repertoire's positions AND its tombstones into it —
  // in a session that then dealt them, attributed them to lines that are not in
  // that course, and suppressed their keys for sixty days. Nothing errored, and
  // being asked a position from your other repertoire looks like a feature.
  //
  // So two things are asserted: the NAME distinguishes courses, and the GUARD
  // refuses a foreign payload while still accepting one that simply does not
  // say (which is what an upgrading device's own card looks like).
  // ----------------------------------------------------------------------
  console.log('\n-- 18) one card per course, and the guard (§27b) --\n');
  {
    const a = S.stormCardName('453453', C);
    const b = S.stormCardName('291847', C);
    // FIRST, because it is what catches a prefix that is not there at all:
    // "undefined · 453453 · do not delete" satisfies every other assertion here.
    eq('a card name starts with the configured prefix',
      a.startsWith(C.cardPrefix + ' · '), true);
    eq('a card name carries the course id', a.includes('453453'), true);
    eq('…and two courses never share one', a === b, false);
    eq('…while one course is stable', S.stormCardName('453453', C), a);
    // The pre-v0.166.0 name must not be reproducible from any bid: it is left
    // in the user's course on purpose and must never be read as a course's own.
    eq('…and none of them is the old shared card',
      a === C.cardName || b === C.cardName, false);

    const store = { [cacheKey(START_FEN)]: {
      f: START_FEN, p: 1, c: 'w', n: 'x', i: 0, a: ['e2e4', 'e4', null],
      t: Date.now(), k: 0, m: [['e2e4', 'e4', 10]] } };
    const packed = S.stormWirePack(store, {}, C, 0, 0, '453453');
    eq('the payload names its course', packed.b, '453453');
    const got = S.stormWireUnpack(packed, C);
    eq('…and it survives the round trip', got.bid, '453453');

    // Omitted rather than empty when no bid is given — that is what a payload
    // written before v0.166.0 looks like, and it must read as "cannot say".
    const old = S.stormWirePack(store, {}, C, 0, 0);
    eq('a payload with no course omits the field',
      Object.prototype.hasOwnProperty.call(old, 'b'), false);
    eq('…and unpacks as "cannot say"', S.stormWireUnpack(old, C).bid, '');

    eq('a foreign card is refused', S.stormWireForeign({ bid: '291847' }, '453453'), true);
    eq('…this course\'s own is not', S.stormWireForeign({ bid: '453453' }, '453453'), false);
    eq('…and one that does not say is NOT foreign',
      S.stormWireForeign({ bid: '' }, '453453'), false);
    eq('…nor is a payload with no bid field at all',
      S.stormWireForeign({}, '453453'), false);
    // Numbers and strings meet here: `st.bid` is a string but a payload is
    // whatever another build wrote.
    eq('…and the compare survives a numeric bid',
      S.stormWireForeign({ bid: 453453 }, '453453'), false);
  }

  // --- §28) STORM FROM A POSITION (v0.170.0) ------------------------------
  // A scope, and it is §14.21's above with one thing changed: which oids the
  // set is made of. So the only NEW rules are the two pure functions that
  // answer "does this line go through the board I named", and both fail
  // silently — a key that never matches is a scope that finds no line, which
  // looks exactly like a position the course does not reach, and a key that
  // matches too readily quietly widens the session back out to the course.
  {
    const step = (fen, san) => S.fenAfterUci(fen, S.sanToUci(CloSan.parseFen(fen), san));
    const f1 = step(START_FEN, 'e4');                    // after 1.e4
    const f2 = step(f1, 'e5');                           // after 1...e5
    const f3 = step(f2, 'Nf3');                          // after 2.Nf3
    const f4 = step(f3, 'Nc6');                          // after 2...Nc6
    const f5 = step(f4, 'Bb5');                          // the Ruy frontier

    // The key: placement, side, castling. EN PASSANT DROPPED, which is what a
    // transposition differs by — §19b's rule, and this is its second reader.
    eq('the key is three fields', S.stormFenKey(START_FEN).split(' ').length, 3);
    eq('…and it is the coverage key of the same FEN',
      S.stormFenKey(f5), S.stormCoverKey(f5));
    // Two move orders reaching one board. The en passant square is exactly
    // where two such routes disagree, so this is the whole reason the scope
    // cannot key on `cacheKey`.
    const epRoute = step(step(step(START_FEN, 'Nf3'), 'e5'), 'e4');
    const noEp = step(step(step(START_FEN, 'e4'), 'e5'), 'Nf3');
    eq('the two routes really do differ in the raw FEN', epRoute === noEp, false);
    eq('…and the scope key calls them one position',
      S.stormFenKey(epRoute), S.stormFenKey(noEp));

    // A FEN THAT WILL NOT PARSE IS THE EMPTY STRING AND NEVER A SCOPE. That is
    // the caller's whole contract: an unusable one widens to the course with a
    // sentence, and must never become a filter that silently matches nothing.
    eq('nonsense is not a key', S.stormFenKey('not a fen'), '');
    eq('an empty string is not a key', S.stormFenKey(''), '');
    eq('undefined is not a key', S.stormFenKey(undefined), '');
    eq('a truncated board is not a key',
      S.stormFenKey('rnbqkbnr/pppppppp/8 w KQkq - 0 1'), '');
    // `parseFen` wants two fields and the key needs three, so the castling
    // field has to be SUPPLIED rather than left missing: a two-field key would
    // match nothing the walk ever builds.
    eq('a FEN with only placement and side still keys in three fields',
      S.stormFenKey('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w').split(' ').length, 3);
    eq('padded whitespace is trimmed',
      S.stormFenKey('  ' + START_FEN + '  '), S.stormFenKey(START_FEN));

    // THE CASTLING FIELD IS NORMALISED, and this assertion is the one that
    // catches a total, silent failure: `fenFromPos` copies `pos.castling`
    // VERBATIM, so a FEN pasted with the rights in another order would key as
    // written and match nothing, while one pasted in the usual order would
    // match everything. Every key the walk builds descends from START_FEN's own
    // "KQkq" through `makeMove`, which only ever removes characters.
    const shuffled = START_FEN.replace(' KQkq ', ' kqKQ ');
    eq('a scrambled castling field keys the same as the canonical one',
      S.stormFenKey(shuffled), S.stormFenKey(START_FEN));
    // …and a genuinely different set of rights is a different position. Only
    // the field recording the last MOVE is dropped; castling is history the
    // board cannot show (section 11's reasoning).
    eq('fewer rights is NOT the same position',
      S.stormFenKey(START_FEN.replace(' KQkq ', ' Kk ')) === S.stormFenKey(START_FEN),
      false);

    // …and whether a line goes through it. The END counts as well as every
    // position a move is played FROM — a user pasting a line-END FEN is asking
    // for that line's own frontier, which is the most obvious thing to paste.
    const walk = { plies: [
      { before: START_FEN }, { before: f1 }, { before: f2 }, { before: f3 },
      { before: f4 }], end: f5 };
    eq('a position in the middle of the line is found',
      S.stormLineThrough(walk, S.stormFenKey(f2)), true);
    eq('the START position is found',
      S.stormLineThrough(walk, S.stormFenKey(START_FEN)), true);
    eq('the line END is found', S.stormLineThrough(walk, S.stormFenKey(f5)), true);
    const off = step(step(START_FEN, 'd4'), 'd5');
    eq('a position the line never reaches is not',
      S.stormLineThrough(walk, S.stormFenKey(off)), false);
    eq('no key means no match', S.stormLineThrough(walk, ''), false);
    eq('no walk means no match', S.stormLineThrough(null, S.stormFenKey(f2)), false);

    // THE WALKS CARRY THE OID SET OUT, and `C.fenKey` is what turns it on. An
    // ordinary session passes none and the set is built and never read, which
    // is what makes this cost one string compare per ply.
    const plain = await S.stormFrontiers(vars, C);
    eq('with no scope the index is empty', plain.through.size, 0);
    const scopeC = { ...C, fenKey: S.stormFenKey(f2) };
    const withKey = await S.stormFrontiers(vars, scopeC);
    const through = withKey.through;
    // The position after 1...e5 is on the Ruy's own path and on the Italian's,
    // which is the point of scoping to a position rather than to a line: it
    // catches every line that goes THROUGH it, however they diverge later.
    eq('the lines that go through it are named', through.has('1'), true);
    eq('…including one that diverges only later', through.has('7'), true);
    eq('…and a line that does not is absent', through.has('3'), false);
    // …and a line that arrives by another MOVE ORDER. Line 2 is 1.Nf3 Nc6 2.e4
    // e5 3.Bb5, so it never stands on the position after 1...e5 (its knights are
    // out) and DOES reach the frontier the Ruy ends on — which is what the
    // dropped en passant field is for. Scoping on the frontier finds both.
    const atEnd = (await S.stormFrontiers(vars,
      { ...C, fenKey: S.stormFenKey(f5) })).through;
    eq('a scope on the line END finds the line itself', atEnd.has('1'), true);
    eq('…and the one that transposes into it', atEnd.has('2'), true);
    eq('…and NOT the position two plies earlier', through.has('2'), false);
    // A PAUSED line is still recorded here, and that costs nothing: the set is
    // only ever intersected with the oids of POOL entries, and a paused line
    // contributes none. Asserted so a "tidy" that filters THIS walk instead of
    // the pool fails rather than looking equivalent.
    eq('a paused line going through it is still in the index', through.has('8'), true);
    eq('a colourless line contributes nothing, having no walk kept',
      through.has('5'), false);
    // …and the uncovered source's stage 0 answers the same question the same
    // way, which is what lets `stormScope` serve both with no branch.
    const uncThrough = (await S.stormDecisions(vars,
      { ...C, fenKey: S.stormFenKey(f5) })).through;
    eq('the uncovered walk carries the same index', uncThrough.has('1'), true);
    eq('…and it too finds the transposition', uncThrough.has('2'), true);
    eq('the uncovered walk with no scope carries an empty one',
      (await S.stormDecisions(vars, C)).through.size, 0);

    // THE POOL FILTER IS §14.21's, UNCHANGED — asserted here anyway, because
    // that is the claim this whole feature rests on: the scope is a different
    // oid set and nothing else.
    const scoped = S.stormFilterPool(plain, through);
    eq('the pool filter takes the walk’s own set', scoped.length, 1);
    eq('…and still carries the continuation index', scoped.cont, plain.cont);
    eq('a set no frontier is in empties the pool',
      S.stormFilterPool(plain, new Set(['999'])).length, 0);
    // THE RESOLVE ITSELF, which is IMPURE and is here for §14.17's reason: the
    // rule lives in this function's control flow and nowhere else. Three ways
    // it can be wrong and every one of them is silent —
    //  * keyed on "`st.oidFilter` is still null" instead of the latch, the FEN
    //    scope is never applied on a session that asked for a chapter too;
    //  * without the latch, `gather`'s own call re-derives over a set
    //    `cycleGoHome` had just put back;
    //  * a union instead of an intersection widens a chapter scope back out.
    {
      const env = { fenKey: S.stormFenKey(f2), fenResolved: false, oidFilter: null };
      S.__setEnv(env, C);
      const got = S.stormScope(withKey);
      eq('the resolve fills the oid set from the walk', env.oidFilter.has('1'), true);
      eq('…and latches', env.fenResolved, true);
      eq('…and the pool comes back filtered', got.length, 1);
      // A second call must change nothing: `gather` reuses a session's answer.
      env.oidFilter = new Set(['1']);
      S.stormScope(withKey);
      eq('a second call does not re-derive', [...env.oidFilter], ['1']);
      // …and the two scopes compose by INTERSECTION. Oid 7 goes through the
      // position; a chapter holding only oid 1 must not gain it.
      const both = { fenKey: S.stormFenKey(f2), fenResolved: false,
        oidFilter: new Set(['1', '3']) };
      S.__setEnv(both, C);
      S.stormScope(withKey);
      eq('a chapter scope is narrowed, never widened', [...both.oidFilter], ['1']);
      // …and the latch is SET even though the set was already non-null, which is
      // the whole reason it is the test: keyed on the null instead, the position
      // scope is never applied on a session that asked for a chapter too, and the
      // assertion above passes because oid 3 was simply left alone.
      eq('…and the latch is set over a set that was already there',
        both.fenResolved, true);
      const other = { fenKey: S.stormFenKey(f2), fenResolved: false,
        oidFilter: new Set(['3']) };
      S.__setEnv(other, C);
      eq('…and a chapter with no line through the position empties',
        S.stormScope(withKey).length, 0);
      // No scope at all is the pool itself, untouched.
      const none = { fenKey: '', fenResolved: false, oidFilter: null };
      S.__setEnv(none, C);
      eq('no position scope leaves the pool alone', S.stormScope(withKey), withKey);
      eq('…and sets no latch', none.fenResolved, false);
    }
    // THE ROUND TRIP, which is what a scope is FOR: a gather stores a position
    // under it, and a LATER session scoped to the same position deals that
    // position back. Two functions have to agree for that to hold and they ask
    // slightly different questions — the pool keeps a frontier when ANY of its
    // lines is in scope (`oids.some`), while `stormPack` writes ONE oid and
    // `stormFilterStore` tests that. Executed end to end because "the gather
    // pays and the session does not deal" is invisible from either half alone.
    {
      const scopedF = S.stormFilterPool(withKey, through)[0];
      const gSt = { store: {}, gone: {}, seen: new Set(), gathered: 0,
        funnel: S.stormFunnelBlank() };
      S.__setEnv(gSt, C);
      S.harvestCandidates([cand(FEN_D, 'f3d4', 'Nxd4')], scopedF);
      eq('the scoped gather stored one position', Object.keys(gSt.store).length, 1);
      const ck = Object.keys(gSt.store)[0];
      eq('…under a line of the frontier it came from',
        scopedF.oids.indexOf(gSt.store[ck].o) >= 0, true);
      // The next session, same FEN: the walk is deterministic, so `through` is
      // the same set — this is literally the same object here.
      const back = S.stormFilterStore(gSt.store, through);
      eq('a position gathered under a position scope is dealt back by it',
        Object.keys(back.kept), [ck]);
      eq('…and nothing is reported as belonging elsewhere', back.dropped, 0);
      // …and a DIFFERENT scope does not take it. `through` for a position none
      // of this frontier's lines pass through is empty, and an empty scope must
      // drop rather than fall through to the whole store.
      const elsewhere = S.stormFilterStore(gSt.store, new Set(['999']));
      eq('…while another scope does not', Object.keys(elsewhere.kept).length, 0);
      eq('…and counts it as another scope’s', elsewhere.dropped, 1);
      // THE MEASURED EXCEPTION (§28.4): `stormPack` writes `oids[0]` and the
      // pool asked `oids.some`, so a frontier several lines converge on can be
      // stored under a line the scope excludes — and then the next scoped
      // session drops it, re-harvesting the position rather than dealing it.
      // Probed over all three of the account's courses (2026-09-01): 2 of 1518
      // scoped positions, 0.08% of frontier-slots, and zero on two of the three.
      // Asserted as a KNOWN SHAPE rather than fixed, so a later change that
      // makes the two agree fails here and has to say so.
      const wrongFirst = { x: { f: FEN_D, o: 'not-in-scope',
        m: [['f3d4', 'Nxd4', 20]], k: 0 } };
      eq('a position stored under a line the scope excludes is dropped',
        Object.keys(S.stormFilterStore(wrongFirst, through).kept).length, 0);
    }
  }


  // ----------------------------------------------------------------------
  // 29) PUZZLES FROM THE GAMES THAT PLAYED YOUR LINES (§29)
  //
  // Everything here fails SILENTLY, which is why it is executed rather than
  // read. A puzzle that will not replay still looks like a puzzle in storage;
  // a draw comparator that is wrong still returns every puzzle in a plausible
  // order (§14.15's rule, third home); an anchor band that has lost its floor
  // still produces anchors, just generic ones; and the two-list store still
  // holds things whichever list they are in.
  //
  // FOUR THINGS IN PARTICULAR:
  //  * the BODY'S `fen` IS THE SOLVER'S POSITION and `moves[0]` is the USER's
  //    move. The raw Lichess CSV differs, so an implementation that "helpfully"
  //    applies the first move as the opponent's produces a card that asks the
  //    user for the reply to a move nobody saw.
  //  * an EVEN-LENGTH `moves` means the opponent has the last word. Get the
  //    user's-move count wrong and the panel counts up to a move that is never
  //    asked for.
  //  * the ANCHOR BAND's floor, without which a game sharing two opening moves
  //    is treated as a game that played the line.
  //  * `minPly` IS COURSE-WIDE, not per line: a position any line reaches
  //    shallowly is a generic position however deep another line gets to it.
  // ----------------------------------------------------------------------
  // Its own clock: the one at section 14.16 is local to that block.
  const NOW29 = 1e12;
  console.log('\n-- 29) puzzles (§29) --\n');
  {
    const body = {
      id: 'aBcD1',
      // White to move and to solve.
      fen: 'r3k2r/1pp1nppp/p2pR3/7Q/8/B1q5/P1P2PPP/R5K1 w kq - 0 16',
      moves: ['a1e1', 'e8g8', 'e6e3', 'c3c6', 'e3e7'],
      previousFen: 'r3k2r/1pp1nppp/p1qpR3/7Q/8/B1P5/P1P2PPP/R5K1 b kq - 0 15',
      previousMove: 'c6c3',
      rating: 2147,
      themes: ['advantage', 'fork', 'long', 'middlegame'],
      gameUrl: 'https://lichess.org/aOg3Z6Zd',
      opening: 'Scotch Game',
    };
    const cand = { i: 'aBcD1', r: 2147, c: 'w', p: 14, s: 30,
      k: 'anchor-key', o: 'oid-1', n: 'Scotch: 4...Qh4', t: 1 };

    const ready = S.stormPuzzleReady(body, cand);
    eq('a body becomes a ready puzzle', Boolean(ready), true);
    eq('...keeping the solver own FEN verbatim', ready.f, body.fen);
    eq('...the moves as one uci string', ready.m, 'a1e1 e8g8 e6e3 c3c6 e3e7');
    eq('...the game url, the only route back to the game', ready.g, body.gameUrl);
    // §15) The ANCHOR's line, not the puzzle's — a body knows nothing about
    // this course, so if this is ever dropped the third stats map fills up
    // under one blank oid and every row reads "line not recorded".
    eq('...and the anchor line, carried from the candidate', ready.o, 'oid-1');
    eq('...with the anchor depth beside it', ready.ap, 14);
    eq('a fresh puzzle has never been missed', ready.k, 0);

    eq('a body with no moves is refused, not stored half-built',
      S.stormPuzzleReady({ ...body, moves: [] }, cand), null);
    eq('a body with no fen is refused',
      S.stormPuzzleReady({ ...body, fen: '' }, cand), null);
    // A move too short to be a uci would produce a ply list that silently
    // stopped early — a puzzle solved one move before its real end.
    eq('a body with a malformed move is refused',
      S.stormPuzzleReady({ ...body, moves: ['a1e1', 'e8'] }, cand), null);

    const plies = S.stormPuzzlePlies(ready);
    eq('every move of the solution replays', plies.length, 5);
    // THE GOVERNING RULE: `fen` is where the SOLVER moves, so ply 0 is theirs.
    eq('the first ply is the USER move, not an opponent set-up move',
      plies[0].color, 'w');
    eq('...and it is moves[0] itself', plies[0].uci, 'a1e1');
    eq('the plies alternate', plies.map((p) => p.color).join(''), 'wbwbw');
    eq('each ply carries the position after it', plies[4].fen.split(' ')[1], 'b');
    // SAN is what the panel and the review print; a null renders as
    // "undefined is not it."
    eq('every ply resolves to a SAN', plies.every((p) => Boolean(p.san)), true);

    // ODD length: the user has the last word, so 3 of the 5 are theirs.
    eq('an odd-length puzzle ends on the user, who plays 3 of its 5 plies',
      S.stormPuzzleUserPlies(plies, 'w'), 3);
    // EVEN length: the opponent replies last, and that reply is NOT asked for.
    // Counting it makes the panel say "move 3 of 3" for a move never asked.
    const evenReady = S.stormPuzzleReady(
      { ...body, moves: ['a1e1', 'e8g8', 'e6e3', 'c3c6'] }, cand);
    const evenPlies = S.stormPuzzlePlies(evenReady);
    eq('an even-length puzzle ends on the OPPONENT', evenPlies[3].color, 'b');
    eq('...so only two of its four plies are asked for',
      S.stormPuzzleUserPlies(evenPlies, 'w'), 2);

    // Refused rather than guessed at (`drillLine`'s rule), and BEFORE a board
    // is opened rather than after.
    eq('a puzzle whose moves will not replay is refused',
      S.stormPuzzlePlies({ ...ready, m: 'a1e1 h8h1' }), null);
    eq('an empty move list is refused', S.stormPuzzlePlies({ ...ready, m: '' }), null);

    const store = S.stormPuzzleBlank();
    store.r.solved = { i: 'solved', k: 0, t: 1 };
    store.r.missed = { i: 'missed', k: 0, t: 1 };
    eq('the config says which verdicts drop a puzzle',
      C.puzzleDropOn, ['great', 'good']);
    // Same MEMBERSHIP as the position store's, written out twice on purpose: a
    // change to either has to be a deliberate change to the other rather than
    // one edit that silently moved both.
    eq('...which is the same membership the position store drops on',
      C.puzzleDropOn, C.storeDropOn);
    eq('a solved puzzle leaves the store',
      S.stormPuzzleRetain(store, 'solved', 'great', C), false);
    eq('a missed one stays and comes round again',
      S.stormPuzzleRetain(store, 'missed', 'blunder', C), true);
    eq('...and so does one that was never there',
      S.stormPuzzleRetain(store, 'absent', 'great', C), false);

    // §14.16 in its second home. Stage A is deterministic given an anchor, so
    // a solved puzzle found again at the same position would be re-bought and
    // re-offered — absence alone is not retirement.
    const DAY29 = 24 * 60 * 60 * 1000;
    eq('a puzzle retired today is still retired',
      S.stormPuzzleDone({ p1: NOW29 - DAY29 }, 'p1', C, NOW29), true);
    eq('...and one retired beyond the horizon is offerable again',
      S.stormPuzzleDone({ p1: NOW29 - (C.goneDays + 1) * DAY29 }, 'p1', C, NOW29), false);
    // A zero timestamp is "no record", never "retired at the epoch" — the rule
    // `stormDone` follows, and the one a truthiness test gets wrong.
    eq('a puzzle with no tombstone is not retired',
      S.stormPuzzleDone({}, 'p1', C, NOW29), false);
    // ASKED CLOSE TO THE EPOCH, deliberately. At NOW29 a zero timestamp is
    // millennia past the horizon, so it reads "not retired" whether the entry is
    // tested or merely the map — i.e. the assertion passes for the wrong reason
    // and covers nothing. One day in, the epoch IS inside the horizon, so only
    // code that tests the ENTRY answers false. (Found by a control: the first
    // version of this line survived the very bug it was written for.)
    eq('...and a zero timestamp reads as no record, not as the epoch',
      S.stormPuzzleDone({ p1: 0 }, 'p1', C, DAY29), false);

    // A REVERSED COMPARATOR IS SILENT: every puzzle is still returned, in a
    // plausible sequence, and nothing says which was meant first.
    const drawStore = S.stormPuzzleBlank();
    drawStore.r.fresh = { i: 'fresh', k: 0 };
    drawStore.r.missedOnce = { i: 'missedOnce', k: 1 };
    drawStore.r.missedTwice = { i: 'missedTwice', k: 2 };
    const seq29 = [0.9, 0.1, 0.5];
    let ri29 = 0;
    eq('unseen first, most-missed last — never the other way round',
      S.stormPuzzleDraw(drawStore, () => seq29[(ri29++) % seq29.length], C),
      ['fresh', 'missedOnce', 'missedTwice']);
    // The random term stops one course dealing in the same sequence every
    // session; it must sit BELOW `k`, never above it.
    const tied = S.stormPuzzleBlank();
    tied.r.a = { i: 'a', k: 0 };
    tied.r.b = { i: 'b', k: 0 };
    tied.r.c = { i: 'c', k: 0 };
    const tiedSeq = [0.7, 0.2, 0.4];
    let tj = 0;
    eq('...and ties are broken at random, not by insertion order',
      S.stormPuzzleDraw(tied, () => tiedSeq[(tj++) % 3], C), ['b', 'c', 'a']);

    // §15's third map. A puzzle is answered and a position is graded, and the
    // two bands mean different things — pooling them makes one percentage out
    // of two questions.
    eq('the record has three maps now', S.STAT_MAPS, ['lines', 'ulines', 'plines']);
    eq('a puzzle card is counted in plines',
      S.statMapOf({ puzzle: { id: 'x' } }), 'plines');
    eq('...a frontier card still in lines', S.statMapOf({ storm: {} }), 'lines');
    eq('...and an uncovered one still in ulines',
      S.statMapOf({ storm: { unc: {} } }), 'ulines');
    // A puzzle has no `storm` block at all, so a reader that looks there finds
    // nothing and the third map stays empty for ever while looking implemented.
    eq('a puzzle card names its anchor line',
      S.cardLineRef({ puzzle: { oid: 'oid-1', from: 'Scotch' } }),
      { oid: 'oid-1', from: 'Scotch' });
    eq('...and a graded card still names its frontier line',
      S.cardLineRef({ storm: { oid: 'oid-2', from: 'Sicilian' } }),
      { oid: 'oid-2', from: 'Sicilian' });
    eq('...and a card that is neither names nothing', S.cardLineRef({}), null);
  }

  // ----------------------------------------------------------------------
  // 29b) THE ANCHOR BAND (§3)
  //
  // The floor is the feature and the ceiling is the budget. Measured
  // 2026-09-01 on a 38-ply line of course 453453: plies 2/4/6/8 list
  // 1434/1422/1451/1322 puzzles and plies 10/12/14/16 list 33/10/37/8. Below
  // the floor a "match" means the game shares an opening; above the ceiling a
  // position is so specific that a 0.9 MB shard comes back with nothing.
  // ----------------------------------------------------------------------
  console.log('\n-- 29b) the puzzle anchor band (§3) --\n');
  {
    const bandCfg = { ...C, puzzleAnchorMinPly: 10, puzzleAnchorMaxPly: 16 };
    // 1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6 5.O-O Be7 6.Re1 b5 — 12 plies, so
    // its positions run from ply 0 to ply 12 and only plies 10-12 are in band.
    const line = {
      oid: 'oid-9', name: 'Ruy Lopez: Closed', color: 'white',
      sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7',
        'Re1', 'b5'],
    };
    const w = S.walkVariation(line);
    eq('the fixture line replays', Boolean(w), true);

    const anchors = new Map();
    S.stormAnchorAdd(anchors, w, line, 'w', bandCfg);
    const plies29 = [...anchors.values()].map((a) => a.ply).sort((a, b) => a - b);
    eq('only positions inside the band become anchors', plies29, [10, 11, 12]);
    // THE LINE END IS INCLUDED. `w.plies[i].before` leaves out the position the
    // line stops on, which on a short line is the deepest thing the course has.
    eq('...the line end among them', plies29[plies29.length - 1], 12);
    const one = [...anchors.values()][0];
    eq('an anchor carries the line it belongs to', one.oids, ['oid-9']);
    eq('...and its name, for the card', one.names, ['Ruy Lopez: Closed']);
    eq('...and the side the LINE is written for, not the side to move',
      one.sides, { w: true });

    // THE FLOOR IS THE FEATURE. Without it every ply of every line is an
    // anchor, and the shallow ones are exactly the generic positions that make
    // "this game played my line" untrue.
    const noFloor = new Map();
    S.stormAnchorAdd(noFloor, w, line, 'w', { ...bandCfg, puzzleAnchorMinPly: 0 });
    eq('dropping the floor admits every position of the line', noFloor.size, 13);

    // §29) BAND MEMBERSHIP IS COURSE-WIDE, decided by a position's SHALLOWEST
    // ply anywhere in the course. Two lines that transpose reach the same board
    // at different depths, and the shallow sighting is what makes it generic —
    // written per line instead, this still produces a plausible anchor set with
    // the generic positions quietly back in it.
    //
    // The fixture: A reaches the post-Nf3/Nf6 board in 2 plies, B reaches the
    // SAME board in 6 by shuffling the knights out and back.
    const shallow = { oid: 'oid-S', name: 'Direct', color: 'white',
      sans: ['Nf3', 'Nf6'] };
    const roundabout = { oid: 'oid-R', name: 'Roundabout', color: 'white',
      sans: ['Nc3', 'Nc6', 'Nb1', 'Nb8', 'Nf3', 'Nf6'] };
    const openBand = { ...C, puzzleAnchorMinPly: 0, puzzleAnchorMaxPly: 20 };
    const sharedKey = CloPuzzles.fenPositionKey(S.walkVariation(shallow).end);
    eq('the two fixture lines really do transpose',
      CloPuzzles.fenPositionKey(S.walkVariation(roundabout).end), sharedKey);
    // DEEP FIRST, then shallow: the shallow sighting must LOWER it.
    const orderA = new Map();
    S.stormAnchorAdd(orderA, S.walkVariation(roundabout), roundabout, 'w', openBand);
    S.stormAnchorAdd(orderA, S.walkVariation(shallow), shallow, 'w', openBand);
    eq('a transposed position keeps the shallowest ply, deep line seen first',
      orderA.get(sharedKey).ply, 2);
    // …and the other way round, which is what makes the rule order-independent
    // rather than an accident of which line the course lists first.
    const orderB = new Map();
    S.stormAnchorAdd(orderB, S.walkVariation(shallow), shallow, 'w', openBand);
    S.stormAnchorAdd(orderB, S.walkVariation(roundabout), roundabout, 'w', openBand);
    eq('…and shallow line seen first', orderB.get(sharedKey).ply, 2);
    eq('…attributed to both lines either way',
      orderB.get(sharedKey).oids.slice().sort(), ['oid-R', 'oid-S']);
    // A position both colours reach keeps both sides: the lookup then filters
    // each separately, since `m[2]` is the colour that SOLVES a puzzle.
    const mixed = new Map();
    S.stormAnchorAdd(mixed, w, line, 'w', bandCfg);
    S.stormAnchorAdd(mixed, w, { ...line, oid: 'oid-B' }, 'b', bandCfg);
    eq('a position reached by lines of both colours keeps both',
      [...mixed.values()][0].sides, { w: true, b: true });

    // The scope filter, §14.21's rule applied to anchors: any line in scope
    // keeps the anchor, and the map's identity survives.
    const scoped = S.stormFilterAnchors(anchors, new Set(['oid-9']));
    eq('an anchor whose line is in scope survives', scoped.size, anchors.size);
    const cut29 = S.stormFilterAnchors(anchors, new Set(['nope']));
    eq('...and one whose lines are all out of scope does not', cut29.size, 0);
    eq('no scope is a no-op', S.stormFilterAnchors(anchors, null), anchors);

  // --- the band's own config shape (§29.3) ---------------------------------
  // THE SELECTOR IS BUILT FROM `puzzleAnchorPlyChoices` AND SET TO
  // `pz.minPly`/`pz.maxPly`. A default that is not among the choices therefore
  // fails in the quietest possible way: `applyPuzzleBand`'s fallback still
  // returns it, so the band is correct and every puzzle is found — but
  // `sel.value = '12'` with no matching <option> leaves the value '', and the
  // dropdown renders BLANK. Nothing errors and nothing in the store is wrong.
  eq('the default floor is one of the offered choices',
    C.puzzleAnchorPlyChoices.indexOf(C.puzzleAnchorMinPly) >= 0, true);
  eq('...and so is the default ceiling',
    C.puzzleAnchorPlyChoices.indexOf(C.puzzleAnchorMaxPly) >= 0, true);
  eq('...and the band is not inverted',
    C.puzzleAnchorMinPly <= C.puzzleAnchorMaxPly, true);
  // §3's cliff sits between ply 8 and ply 10 (1322 puzzles against 33), so a
  // floor at or below it stops meaning "the game played this line".
  eq('the floor stays above §3 measured cliff', C.puzzleAnchorMinPly >= 10, true);
  }


  // ----------------------------------------------------------------------
  // 29c) THE PUZZLE WIRE (§29)
  //
  // A CARD OF ITS OWN (§15.3), because the position payload is CUT to fit its
  // budget and a puzzle folded into it would be dropped whenever a position
  // list ran long — silently, and after the ~331 KB body fetch had been paid
  // for. Only the READY list travels: candidates are index tuples any machine
  // with the dataset can regenerate.
  //
  // Every failure here is invisible from the outside — a merge that loses a
  // tombstone puts a solved puzzle back for ever, and one that drops the
  // budget check writes a card Chessable will not hold.
  // ----------------------------------------------------------------------
  console.log('\n-- 29c) the puzzle wire (§29) --\n');
  {
    const mk = (id, t) => ({ i: id, f: 'r3k2r/1pp1nppp/p2pR3/7Q/8/B1q5/P1P2PPP/R5K1 w kq - 0 16',
      m: 'a1e1 e8g8', r: 1500, o: 'oid-1', n: 'Line', ap: 12,
      pf: '', pm: '', g: '', op: '', th: [], k: 0, t });

    const local = S.stormPuzzleBlank();
    local.r.mine = mk('mine', 3);
    const packed = S.stormPuzzleWirePack(local, C, 120000, '453453');
    eq('the payload names its course (§27b)', packed.b, '453453');
    eq('...and carries the ready puzzle', Object.keys(packed.p), ['mine']);
    eq('...and says how many', packed.n, 1);
    // CANDIDATES DO NOT TRAVEL. They are regenerable and would eat the budget.
    local.c.acand = { i: 'acand' };
    eq('candidates are not carried',
      Object.keys(S.stormPuzzleWirePack(local, C, 120000, '453453').p), ['mine']);

    const round = S.stormPuzzleWireUnpack(packed, C);
    eq('a payload round-trips', Object.keys(round.store), ['mine']);
    eq('...keeping the solver position', round.store.mine.f, local.r.mine.f);
    eq('...and the moves', round.store.mine.m, 'a1e1 e8g8');
    eq('...and the anchor line, which §15 counts against', round.store.mine.o, 'oid-1');
    // A version this build does not understand is refused WHOLE: every field it
    // has is a field this one also has, so a half-read is the silent shape.
    eq('a payload of another wire version is refused',
      S.stormPuzzleWireUnpack({ ...packed, v: 99 }, C), null);
    eq('a payload with no puzzle map is refused',
      S.stormPuzzleWireUnpack({ v: C.puzzleWireVersion }, C), null);

    // §27b's guard, reused verbatim rather than copied.
    eq('a card naming another course is foreign',
      S.stormWireForeign(round, '291847'), true);
    eq('...and one naming this course is not',
      S.stormWireForeign(round, '453453'), false);
    // An upgrading device's own card says nothing, and refusing THAT is the one
    // thing that would break the exchange this guard exists to protect.
    eq('...and one that does not say is not foreign',
      S.stormWireForeign({ ...round, bid: '' }, '453453'), false);

    // --- the merge ------------------------------------------------------
    const a = S.stormPuzzleBlank();
    a.r.shared = mk('shared', 1);
    a.r.onlyA = mk('onlyA', 1);
    const remote = { shared: mk('shared', 1), onlyB: mk('onlyB', 1) };
    const m1 = S.stormPuzzleWireMerge(a, remote, {});
    eq('the merge takes what the other device has', m1.added, 1);
    eq('...and holds all three', Object.keys(a.r).sort(), ['onlyA', 'onlyB', 'shared']);
    // A SECOND EXCHANGE ADDS NOTHING. §15's own lesson: a merge that
    // double-counts keeps producing plausible, growing numbers, and this is the
    // only assertion a double-count can be seen in.
    const m2 = S.stormPuzzleWireMerge(a, remote, {});
    eq('a second exchange adds nothing', m2.added, 0);
    eq('...and the store is unchanged', Object.keys(a.r).length, 3);

    // `k` takes the HIGHER: both devices' misses are real misses.
    const bumped = S.stormPuzzleBlank();
    bumped.r.x = mk('x', 1);
    S.stormPuzzleWireMerge(bumped, { x: { ...mk('x', 1), k: 3 } }, {});
    eq('a miss count merges upwards', bumped.r.x.k, 3);
    S.stormPuzzleWireMerge(bumped, { x: { ...mk('x', 1), k: 1 } }, {});
    eq('...and never downwards', bumped.r.x.k, 3);

    // TOMBSTONES, APPLIED AFTER THE UNION. Without them a puzzle the retention
    // rule dropped comes back from the other device's snapshot every exchange.
    const solved = S.stormPuzzleBlank();
    solved.g.gonepz = NOW29;
    const m3 = S.stormPuzzleWireMerge(solved, { gonepz: mk('gonepz', 1) }, {});
    eq('a puzzle retired HERE is not taken back', Boolean(solved.r.gonepz), false);
    eq('...and is counted as already learned', m3.dropped, 1);
    // …and the other direction: their retirement removes ours.
    const keeping = S.stormPuzzleBlank();
    keeping.r.theirs = mk('theirs', 1);
    const m4 = S.stormPuzzleWireMerge(keeping, {}, { theirs: NOW29 });
    eq('a puzzle retired THERE leaves here too', Boolean(keeping.r.theirs), false);
    eq('...and the tombstone is kept, so it stays gone', keeping.g.theirs, NOW29);
    eq('...counted as learned elsewhere', m4.dropped, 1);

    // --- the budget -----------------------------------------------------
    // A card Chessable will not hold is worse than a short one, so the pack
    // CUTS rather than overflowing — and it measures the ENCODED size, base32
    // being what actually goes into the comment.
    const many = S.stormPuzzleBlank();
    for (let i = 0; i < 200; i++) many.r['p' + i] = mk('p' + i, i);
    const cut = S.stormPuzzleWirePack(many, C, 4000, '453453');
    eq('the pack cuts to fit its budget', cut.n < 200, true);
    eq('...and stays inside it',
      JSON.stringify(cut).length * 1.6 <= 4000 + 400, true);
    // NEWEST FIRST: between two puzzles the other device may not hold, the one
    // gathered most recently is the one it is least likely to have.
    eq('...taking the newest first', Object.keys(cut.p)[0], 'p199');
  }


// ---------------------------------------------------------------------------
// 29d) THE ARCHIVE RECORD AND ITS DRAW ORDER (§29.2)
//
// The one-shot collect splits a puzzle in two: the BODY goes into the worker's
// IndexedDB archive and `store.p` keeps a ~60-byte record of it, so the ready
// working set can be trimmed and rehydrated for free. Two things here fail in
// the way §14.15 is emphatic about — silently, with every puzzle still returned
// in a plausible order:
//
//  * `stormPuzzleArchived` MUST SPEAK THE CANDIDATE'S FIELD NAMES, because
//    `refillReady` hands the record straight back to `stormPuzzleReady` as its
//    second argument. Rename `p` to `ap` there and every rehydrated puzzle comes
//    back with no anchor depth and no line — §15's third stats map then fills up
//    under one blank oid while looking implemented.
//  * `stormPuzzleArchiveDraw` is `stormPuzzleDraw`'s rule over a different map,
//    and it additionally EXCLUDES what is already loaded and what is retired.
//    Dropping either exclusion still returns a plausible list — one that
//    rehydrates puzzles already in hand, or resurrects a solved one.
// ---------------------------------------------------------------------------
console.log('\n-- 29d) the archive record and its draw (§29.2) --\n');
{
  const NOW29D = 1e12;
  const readyEntry = {
    i: 'aBcD1', f: 'r3k2r/1pp1nppp/p2pR3/7Q/8/B1q5/P1P2PPP/R5K1 w kq - 0 16',
    m: 'a1e1 e8g8', r: 2147, o: 'oid-1', n: 'Scotch: 4...Qh4', ap: 14,
    pf: '', pm: '', g: '', op: '', th: [], k: 3, t: 77,
  };

  const rec = S.stormPuzzleArchived(readyEntry);
  eq('the light record keeps the anchor line', rec.o, 'oid-1');
  eq('...and its name', rec.n, 'Scotch: 4...Qh4');
  eq('...and the rating', rec.r, 2147);
  eq('...and the miss count, which is the durable half', rec.k, 3);
  // THE FIELD NAME IS THE CANDIDATE'S. stormPuzzleReady reads cand.p for the
  // anchor depth, so a record calling it "ap" rebuilds every puzzle with none —
  // and nothing errors.
  eq('...and the anchor depth UNDER THE CANDIDATE NAME', rec.p, 14);
  eq('a record round-trips back into a ready entry',
    S.stormPuzzleReady({ id: 'aBcD1', fen: readyEntry.f,
      moves: ['a1e1', 'e8g8'], rating: 2147, themes: [] }, rec).ap, 14);
  eq('...carrying its line with it',
    S.stormPuzzleReady({ id: 'aBcD1', fen: readyEntry.f,
      moves: ['a1e1', 'e8g8'], rating: 2147, themes: [] }, rec).o, 'oid-1');

  // --- the draw ---
  const pstore = S.stormPuzzleBlank();
  pstore.p = {
    fresh: { r: 1500, o: 'o', n: 'n', p: 12, k: 0, t: 1 },
    missed: { r: 1500, o: 'o', n: 'n', p: 12, k: 2, t: 1 },
    loaded: { r: 1500, o: 'o', n: 'n', p: 12, k: 0, t: 1 },
    retired: { r: 1500, o: 'o', n: 'n', p: 12, k: 0, t: 1 },
  };
  pstore.r = { loaded: readyEntry };
  pstore.g = { retired: NOW29D - 1000 };

  const drawn = S.stormPuzzleArchiveDraw(pstore, () => 0.5, C, NOW29D);

  eq('the draw skips what is already loaded', drawn.indexOf('loaded'), -1);
  eq('...and what is retired', drawn.indexOf('retired'), -1);
  eq('...leaving exactly the rest', drawn.length, 2);
  // §14.15's rule in its third home: unseen first, most-missed last. Reversed,
  // every session would rehydrate the same failures and starve everything the
  // collect paid for.
  eq('unseen before missed', drawn[0], 'fresh');
  eq('...and the missed one last', drawn[1], 'missed');

  // A tombstone past the horizon is NOT a retirement any more.
  const oldStore = S.stormPuzzleBlank();
  oldStore.p = { back: { r: 1, o: 'o', n: 'n', p: 12, k: 0, t: 1 } };
  oldStore.g = { back: NOW29D - (C.goneDays + 1) * 24 * 60 * 60 * 1000 };
  eq('an aged-out tombstone lets a puzzle back into the draw',
    S.stormPuzzleArchiveDraw(oldStore, () => 0.5, C, NOW29D).length, 1);

  // An empty archive is not an error, it is a course nobody has collected.
  eq('an empty archive draws nothing',
    S.stormPuzzleArchiveDraw(S.stormPuzzleBlank(), () => 0.5, C, NOW29D).length, 0);
}


// ---------------------------------------------------------------------------
// 29e) THE DISGUISE'S GATE (§29.4)
//
// Knowing a tactic is there is most of finding it, so an unanswered puzzle must
// read exactly as a graded card does. `puzzlesInPlay` is what says when that is
// in force, and it is asked ONCE per card, in `showCard`.
//
// It is a three-way condition and each way of getting it wrong is quiet:
//
//  * dropped to `Boolean(pz.on)` alone — every graded card on a course with no
//    puzzles loses its "N moves past the line" sentence for ever, and nothing
//    says why;
//  * dropped to `pz.queue.length` alone — a SET's second pass re-asks puzzles
//    out of `st.set` rather than out of the queue, so exactly the cards that
//    have already beaten the user once come back wearing their rating;
//  * inverted to `pz.on === 0` — the disguise is then on precisely when there
//    is nothing to disguise, which looks like it working.
// ---------------------------------------------------------------------------
console.log('\n-- 29e) the disguise gate (§29.4) --\n');
{
  const pzOf = (on, queue, seen) => ({ on, queue, seen: new Set(seen || []) });

  eq('off is never disguised',
    (S.__setPz(pzOf(0, ['p1'], [])), S.puzzlesInPlay()), false);
  eq('on with a ready puzzle is disguised',
    (S.__setPz(pzOf(10, ['p1'], [])), S.puzzlesInPlay()), true);
  // The clause a "simplification" removes first.
  eq('on with an empty queue but a puzzle already dealt is still disguised',
    (S.__setPz(pzOf(10, [], ['p1'])), S.puzzlesInPlay()), true);
  // …and the clause that keeps the cost off everybody else.
  eq('on with nothing available at all is not disguised',
    (S.__setPz(pzOf(10, [], [])), S.puzzlesInPlay()), false);
  // 100% is a percentage, not a flag: it must not read as "off" anywhere.
  eq('100% is disguised',
    (S.__setPz(pzOf(100, ['p1'], [])), S.puzzlesInPlay()), true);
}

// ---------------------------------------------------------------------------
// 30) THE LINE SPREAD (§30)
//
// Reported live 2026-09-03: a set of six answered six positions from ONE line
// end. One frontier walk yields three to eight survivors, all of them from the
// same variation, and every one went onto the queue — so `queueTarget` was met
// by a single line and the whole set came out of it.
//
// Everything here fails the way §14.15 is emphatic about: a spread that never
// fires still deals every position, in a plausible order, and looks exactly
// like the bug it was added to remove. Three deal points share one
// `st.dealtLines`, and each has its own way of being quietly wrong:
//
//  * `takeStoreItem` — skipping only what is ON THE QUEUE lets a line come back
//    two cards later; skipping nothing is the original bug on a warm store.
//  * `takeQueued` — the SET/STORM split. A set waits for a fresh line rather
//    than repeat one, a storm never stalls, and an EXHAUSTED pool drops the
//    distinction entirely, or a small course's set ends its first round short
//    with usable cards in hand.
//  * `takeQueuedPuzzle` — a hundred puzzles hang off one line's anchors, so a
//    plain shift repeats a variation inside six cards.
//
// None of them may WITHHOLD: when nothing qualifies the head is taken.
// ---------------------------------------------------------------------------
console.log('\n-- 30) the line spread (§30) --\n');
{
  const card = (oid) => ({ startFen: 'x', storm: { oid, from: oid } });
  // A control that reverts one of these rules must FAIL an assertion, never
  // throw: a thrown control ends the run and proves nothing about the rest.
  const oidOf = (c) => (c && c.storm ? c.storm.oid : '(nothing)');
  const ckOf = (it) => (it ? it.ck : '(nothing)');
  const item = (ck, oid) => ({ ck, oid, name: oid });
  const envOf = (over) => Object.assign({
    mode: 'storm', exhausted: false, queue: [], spare: [],
    storeQueue: [], dealtLines: new Set(),
    // §30b) The recency window, EMPTY unless a case says otherwise — so every
    // assertion written before it existed still describes the rule it was
    // written for.
    bid: 'B1', recentStore: {}, recentDirty: false,
  }, over || {});

  // The producer's own half of the spread is async and is not reachable from
  // here, so what CAN be pinned is the number it reads. A 0 would put nothing
  // on the queue from a walk at all — every card would have to come from a
  // spare, and a session on a cold store would deal one position and stop.
  eq('queueSpread is at least 1', C.queueSpread >= 1, true);
  eq('...and small enough to mean something', C.queueSpread <= 2, true);

  // --- takeStoreItem ------------------------------------------------------
  {
    const env = envOf({
      queue: [card('L1')],
      storeQueue: [item('a', 'L1'), item('b', 'L1'), item('c', 'L2')],
    });
    S.__setEnv(env, C);
    eq('a store item from a line already on the queue is passed over',
      ckOf(S.takeStoreItem()), 'c');
    eq('...and the ones it passed over are still there', env.storeQueue.length, 2);
  }
  {
    // BOTH tests, not just the queue: a line dealt two cards ago must not come
    // straight back while another line is sitting behind it.
    const env = envOf({
      dealtLines: new Set(['L2']),
      storeQueue: [item('a', 'L2'), item('b', 'L3')],
    });
    S.__setEnv(env, C);
    eq('a store item from a line already dealt is passed over',
      ckOf(S.takeStoreItem()), 'b');
  }
  {
    // It defers, never withholds.
    const env = envOf({
      dealtLines: new Set(['L1']),
      queue: [card('L1')],
      storeQueue: [item('a', 'L1'), item('b', 'L1')],
    });
    S.__setEnv(env, C);
    eq('with every line spoken for the head is taken anyway',
      ckOf(S.takeStoreItem()), 'a');
  }
  {
    // An unattributed position (stored before §15) is not "the same line" as
    // every other unattributed position.
    const env = envOf({
      dealtLines: new Set(['']),
      storeQueue: [item('a', ''), item('b', 'L9')],
    });
    S.__setEnv(env, C);
    eq('an empty oid never blocks', ckOf(S.takeStoreItem()), 'a');
  }

  // --- takeQueued ---------------------------------------------------------
  {
    const env = envOf({ queue: [card('L1')], spare: [card('L2')] });
    S.__setEnv(env, C);
    eq('the queue comes before the spares', oidOf(S.takeQueued()), 'L1');
    eq('...and the spare is untouched', env.spare.length, 1);
  }
  {
    // v0.176.0: THE QUEUE IS SCANNED, NOT SHIFTED. Capping what one WALK
    // contributes says nothing about a queue filled from several sources —
    // `produceFromStore` and `produce`'s own loop both push, and on the
    // uncovered source two decision points on one variation are two frontiers
    // carrying one oid. A head-first deal hands those out in a row.
    const env = envOf({
      dealtLines: new Set(['L1']),
      queue: [card('L1'), card('L1'), card('L5')],
    });
    S.__setEnv(env, C);
    eq('a queued card from a line already dealt is passed over',
      oidOf(S.takeQueued()), 'L5');
    eq('...and the ones it passed over are still queued', env.queue.length, 2);
  }
  {
    // Two cards of one line reaching the queue together: the second is
    // deferred behind anything else, not dealt straight after the first.
    // `showCard` is what records a dealt line, so the deal loop stands in for
    // it — which is also the shape of the bug, since a card carrying no oid
    // records nothing and the next deal is made in the dark.
    const env = envOf({ queue: [card('L1'), card('L1'), card('L2')] });
    S.__setEnv(env, C);
    const seq = [];
    for (let i = 0; i < 3; i++) {
      const c = S.takeQueued();
      seq.push(oidOf(c));
      if (c && c.storm && c.storm.oid) env.dealtLines.add(c.storm.oid);
    }
    eq('...a repeat is deferred behind the other line', seq.join(), 'L1,L2,L1');
  }
  {
    // A fresh line among the SPARES beats a repeat sitting on the queue: the
    // spares are cards of other variations, which is the whole point of them.
    const env = envOf({
      dealtLines: new Set(['L1']),
      queue: [card('L1')], spare: [card('L8')],
    });
    S.__setEnv(env, C);
    eq('a fresh spare beats a repeat on the queue', oidOf(S.takeQueued()), 'L8');
    eq('...and the queued repeat is still there', env.queue.length, 1);
  }
  {
    // THE DEADLOCK GUARD. `produce` returns at once while the queue is at
    // `queueTarget`, so a set refusing a full queue would never call it and
    // nothing would arrive to change the answer. The queue always yields.
    const env = envOf({
      mode: 'set', dealtLines: new Set(['L1']),
      queue: [card('L1'), card('L1'), card('L1')],
    });
    S.__setEnv(env, C);
    eq('a SET never stalls on a full queue of one line',
      oidOf(S.takeQueued()), 'L1');
  }
  {
    // The spare that is NOT first is the one worth having.
    const env = envOf({
      dealtLines: new Set(['L1']),
      spare: [card('L1'), card('L1'), card('L7')],
    });
    S.__setEnv(env, C);
    eq('a spare from an undealt line is taken over the head',
      oidOf(S.takeQueued()), 'L7');
  }
  {
    const env = envOf({
      mode: 'set', dealtLines: new Set(['L1']), spare: [card('L1'), card('L1')],
    });
    S.__setEnv(env, C);
    eq('a SET waits rather than repeat a line', S.takeQueued(), undefined);
    eq('...and nothing was consumed by the refusal', env.spare.length, 2);
  }
  {
    const env = envOf({
      mode: 'storm', dealtLines: new Set(['L1']), spare: [card('L1')],
    });
    S.__setEnv(env, C);
    eq('a STORM takes it rather than show an empty board',
      oidOf(S.takeQueued()), 'L1');
  }
  {
    // The clause that stops a small course's set ending short.
    const env = envOf({
      mode: 'set', exhausted: true, dealtLines: new Set(['L1']),
      spare: [card('L1')],
    });
    S.__setEnv(env, C);
    eq('...and so does a set once the pool is spent',
      oidOf(S.takeQueued()), 'L1');
  }
  {
    S.__setEnv(envOf({}), C);
    eq('an empty everything is undefined, not a throw', S.takeQueued(), undefined);
  }

  // --- the key itself -----------------------------------------------------
  //
  // The SPREAD's question is weaker than §15's and takes a weaker answer. It is
  // what covers the positions the record has to give up on: measured live
  // 2026-09-03 on course 453453, 11 of 45 stored positions could not be named,
  // 8 of them one cluster whose name 13 variations share. Those 8 are one line
  // end, and without the name fallback they are eight cards the spread cannot
  // tell apart — which is exactly what dealt three of six from one line.
  eq('the key is the oid where there is one', S.stormLineKey('L1', 'Ruy'), 'L1');
  eq('...the NAME where there is not', S.stormLineKey('', 'Ruy'), 'Ruy');
  eq('...and empty where there is neither', S.stormLineKey('', ''), '');
  eq('...never the two mixed up', S.stormLineKey(0, 0), '');
  eq('a card answers through the same rule',
    [S.cardLineKey({ storm: { oid: 'L1', from: 'Ruy' } }),
     S.cardLineKey({ storm: { oid: '', from: 'Ruy' } }),
     S.cardLineKey({ puzzle: { oid: '', from: 'Ruy' } }),
     S.cardLineKey(null)],
    ['L1', 'Ruy', 'Ruy', '']);
  {
    // The live shape: two unattributable positions of one line end, told apart
    // from a third by nothing but the name they were stored under.
    const env = envOf({
      storeQueue: [{ ck: 'a', oid: '', name: 'shared' },
                   { ck: 'b', oid: '', name: 'shared' },
                   { ck: 'c', oid: '', name: 'other' }],
    });
    S.__setEnv(env, C);
    const first = S.takeStoreItem();
    env.dealtLines.add(S.stormLineKey(first.oid, first.name));
    eq('an unnamed position is spread by the name it was stored under',
      ckOf(S.takeStoreItem()), 'c');
  }

  // --- queuedOrDealt (the producer's half) ---------------------------------
  //
  // The deal point can only choose among what it is handed, so a walk landing
  // on a line already dealt puts a repeat in front of the user however
  // carefully `takeQueued` scans. Seen live 2026-09-03: five distinct lines in
  // six cards, the sixth a fresh walk of the line dealt first.
  {
    const env = envOf({
      dealtLines: new Set(['L1']),
      queue: [card('L2')],
    });
    S.__setEnv(env, C);
    eq('a walk landing on a line already dealt is a repeat',
      S.queuedOrDealt(card('L1')), true);
    eq('...so is one already on the queue', S.queuedOrDealt(card('L2')), true);
    eq('...a fresh line is not', S.queuedOrDealt(card('L9')), false);
    eq('...and a card with no line NEVER counts as one',
      S.queuedOrDealt(card('')), false);
  }

  // --- backfillStoreOids --------------------------------------------------
  //
  // §14.11 draws the store BEFORE the course is read, and this runs after it —
  // so an oid written only into `st.store` reaches nothing the session is
  // actually dealt from. That is silent twice over: `takeStoreItem` reads a
  // missing oid as "never blocks" and `showCard` records no line at all, so the
  // whole spread is switched off for the sitting while every position in the
  // store is perfectly good. It is what a synced store looks like — the wire
  // carried no `o` at all before v0.176.0.
  {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 5 4';
    const env = envOf({
      store: {
        // Named in the course listing, so the backfill can name it…
        [cacheKey(fen)]: { f: fen, n: 'Italian', o: '' },
        // …and one whose name matches two variations, which it must refuse.
        z: { f: fen, n: 'Twice', o: '' },
      },
      storeQueue: [{ ck: cacheKey(fen), oid: '', name: 'Italian' },
                   { ck: 'z', oid: '', name: 'Twice' }],
      queue: [{ startFen: fen, storm: { oid: '', from: 'Italian' } }],
      spare: [],
      storeDirty: false,
    });
    S.__setEnv(env, C);
    S.backfillStoreOids({ vars: [
      { oid: 'L4', name: 'Italian' },
      { oid: 'L5', name: 'Twice' },
      { oid: 'L6', name: 'Twice' },
    ] });
    eq('the store entry is named', env.store[cacheKey(fen)].o, 'L4');
    eq('...and so is the item ALREADY DRAWN from it', env.storeQueue[0].oid, 'L4');
    eq('...and the card already built from that item',
      env.queue[0].storm.oid, 'L4');
    eq('a name two variations share is still refused',
      [env.store.z.o, env.storeQueue[1].oid], ['', '']);
  }

  // --- takeQueuedPuzzle ---------------------------------------------------
  {
    S.__setEnv(envOf({ dealtLines: new Set(['L1']) }), C);
    S.__setPz({ queue: ['p1', 'p2', 'p3'],
      store: { r: { p1: { o: 'L1' }, p2: { o: 'L1' }, p3: { o: 'L4' } } } });
    eq('a puzzle whose anchor line has been dealt is passed over',
      S.takeQueuedPuzzle(), 'p3');
  }
  {
    S.__setEnv(envOf({ dealtLines: new Set(['L1']) }), C);
    const pzq = { queue: ['p1', 'p2'],
      store: { r: { p1: { o: 'L1' }, p2: { o: 'L1' } } } };
    S.__setPz(pzq);
    eq('...and the head is taken when every one of them has',
      S.takeQueuedPuzzle(), 'p1');
    eq('...consuming exactly one', pzq.queue.length, 1);
  }
  {
    S.__setEnv(envOf({ dealtLines: new Set(['L1']) }), C);
    S.__setPz({ queue: ['p1'], store: { r: {} } });
    eq('a puzzle with no stored entry never blocks', S.takeQueuedPuzzle(), 'p1');
  }
  {
    // …AND SOMETHING MUST ACTUALLY CALL IT. From v0.175.0 to v0.178.0
    // `nextPuzzleCard` shifted the queue itself, so the puzzle half of the
    // spread never ran once — and every assertion above passed the whole time,
    // because they execute the function rather than the path. That is the one
    // defect in this section a behavioural check cannot see, so it is asserted
    // against the source text, §0's discipline.
    const lines = SRC.split('\n').slice(findDecl('nextPuzzleCard'));
    let n = 1;
    while (n < lines.length && lines[n] !== '    }') n++;
    const fn = lines.slice(0, n).join(' ');
    eq('nextPuzzleCard draws THROUGH takeQueuedPuzzle',
      /takeQueuedPuzzle\(\)/.test(fn), true);
    eq('...and never shifts the queue behind its back',
      /pz\.queue\.shift\(\)/.test(fn), false);
  }

  // --- 30b) the recency window --------------------------------------------
  //
  // `st.dealtLines` is reset by `startSession`, so until v0.179.0 "Storm
  // again" had no memory at all: a set spread carefully across six variations
  // was followed by a second set drawn from the same six, both draws seeing
  // the same store in the same comparator order. The window is the last
  // `recentLines` line ends dealt, per course, in `storage.local`.
  //
  // BOTH ways of being wrong are quiet. A window that never matches leaves the
  // feature switched off and looks exactly like a course with more lines than
  // the window has room for; a window applied as a HARD rule would defer cards
  // behind the fallback every deal point ends with, i.e. behave correctly
  // until the moment the store is small, and then deal the head anyway with
  // the preferred order silently thrown away.
  eq('the window is at least a set wide', C.recentLines >= C.setSize, true);
  eq('...and the key it lives under is named', Boolean(C.recentKey), true);
  {
    // THE TIERS ARE ORDERED, and this is the assertion that a single union
    // would fail: L2 is recent but NOT dealt this session, L1 is dealt — so
    // the recent line must be preferred over the dealt one rather than lumped
    // in with it.
    const env = envOf({
      dealtLines: new Set(['L1']),
      recentStore: { B1: ['L2'] },
      storeQueue: [item('a', 'L1'), item('b', 'L2'), item('c', 'L3')],
    });
    S.__setEnv(env, C);
    eq('a store item from a line dealt in a recent sitting is passed over',
      ckOf(S.takeStoreItem()), 'c');
    S.__setEnv(env, C);
    eq('...but preferred over one dealt in THIS session',
      ckOf(S.takeStoreItem()), 'b');
  }
  {
    // It defers, never withholds — the whole store recent is the ordinary case
    // on a course with fewer lines than the window.
    const env = envOf({
      recentStore: { B1: ['L1', 'L2'] },
      storeQueue: [item('a', 'L1'), item('b', 'L2')],
    });
    S.__setEnv(env, C);
    eq('with every line recent the store deals its head anyway',
      ckOf(S.takeStoreItem()), 'a');
  }
  {
    // PER COURSE. The window is another course's, so it must not apply.
    const env = envOf({
      recentStore: { B9: ['L1'] },
      storeQueue: [item('a', 'L1'), item('b', 'L2')],
    });
    S.__setEnv(env, C);
    eq("another course's window does not apply", ckOf(S.takeStoreItem()), 'a');
  }
  {
    const env = envOf({
      recentStore: { B1: ['L1'] },
      queue: [card('L1'), card('L4')],
    });
    S.__setEnv(env, C);
    eq('a queued card from a recent line is passed over',
      oidOf(S.takeQueued()), 'L4');
  }
  {
    // …and the strict pass still yields it, which is what keeps the preference
    // from ever costing a card. A SET may WAIT on the session rule (above) and
    // must never wait on this one: nothing the producer can find will change
    // the answer, since the window is about sittings already over.
    const env = envOf({
      mode: 'set', recentStore: { B1: ['L1'] }, spare: [card('L1')],
    });
    S.__setEnv(env, C);
    eq('a SET does not wait on the recency window alone',
      oidOf(S.takeQueued()), 'L1');
  }
  {
    const env = envOf({
      recentStore: { B1: ['L1'] }, queue: [card('L1')], spare: [card('L7')],
    });
    S.__setEnv(env, C);
    eq('a fresh spare beats a recent line on the queue',
      oidOf(S.takeQueued()), 'L7');
  }
  {
    S.__setEnv(envOf({ recentStore: { B1: ['L1'] } }), C);
    S.__setPz({ queue: ['p1', 'p2'],
      store: { r: { p1: { o: 'L1' }, p2: { o: 'L4' } } } });
    eq('a puzzle whose anchor line is recent is passed over',
      S.takeQueuedPuzzle(), 'p2');
  }
  {
    S.__setEnv(envOf({ recentStore: { B1: ['L1'] } }), C);
    S.__setPz({ queue: ['p1'], store: { r: { p1: { o: 'L1' } } } });
    eq('...and taken anyway when it is the only one', S.takeQueuedPuzzle(), 'p1');
  }
  {
    // AN ENTRY IS MOVED, NOT DUPLICATED: the window is the last N LINE ENDS,
    // not the last N cards, or one line dealt a dozen times would fill it and
    // evict every other line the user had seen.
    const env = envOf({ recentStore: { B1: ['L1', 'L2'] } });
    S.__setEnv(env, C);
    S.noteRecentLine('L1');
    eq('a line dealt again moves to the back of the window',
      env.recentStore.B1.join(), 'L2,L1');
    eq('...and the write is marked', env.recentDirty, true);
  }
  {
    const env = envOf({ recentStore: {} });
    S.__setEnv(env, C);
    for (let i = 0; i < C.recentLines + 5; i++) S.noteRecentLine('L' + i);
    eq('the window is capped', env.recentStore.B1.length, C.recentLines);
    eq('...oldest out', env.recentStore.B1[0], 'L5');
    eq('...newest last',
      env.recentStore.B1[C.recentLines - 1], 'L' + (C.recentLines + 4));
  }
  {
    // '' is a position nothing can attribute — `stormLineKey`'s rule, in its
    // fourth home. Recording one would make every unattributed position in the
    // store look like the same recently-dealt line.
    const env = envOf({ recentStore: {} });
    S.__setEnv(env, C);
    S.noteRecentLine('');
    eq('an empty key is not recorded', env.recentStore.B1, undefined);
    eq('...and never blocks', S.lineRecent(''), false);
  }
}

// ---------------------------------------------------------------------------
// 31) THE END-OF-SESSION PUSH (§15.7)
//
// §15's record is about EVERY device by construction, and until v0.177.0 the
// only two pushes were "opening a session" and the button in the stats view.
// So a set played through on the phone reached the desktop only if a further
// session was later opened on the phone, and a device that is only ever read
// on carried nothing at all — while every number on screen stayed plausible,
// which is why this needs asserting rather than looking at.
//
// Everything here is silent when it is wrong, in three different ways:
//   * a push that never fires is exactly the behaviour that was there before
//     it existed — the record simply leaves one session late,
//   * a debt cleared by a write that FAILED is a session's answers dropped on
//     the floor behind a status line nobody is looking at, and
//   * a push refused because another was in flight loses precisely the answers
//     that came after the one in flight had packed its payload.
//
// IMPURE, with section 16e's carrier stubbed: `st` and `C` come in through
// `__setEnv` and the carrier through `__setSync`, so no network is touched.
// ---------------------------------------------------------------------------
console.log('\n-- 31) the end-of-session push (§15.7) --\n');
{
  // The fields `syncStats` reads on top of the config every other section
  // uses. Read out of the shipped file, like everything else here.
  const SC = Object.assign({}, C, {
    statsCardName: str('statsCardName'),
    statsMaxWireBytes: num('statsMaxWireBytes'),
    cardChapter: str('cardChapter'),
    statsTtlMs: 1e12,
  });

  // A record with one answer in it, so the payload is not empty.
  const statsOf = () => ({ B1: { name: 'A course',
    lines: { L1: { nm: 'A line', dv: { D1: { n: 1, a: 1, g: 0, o: 0, b: 0, x: 0, u: 0,
      ls: 0, lc: 1, t: 1000, s: 0 } } } } } });

  const envOf = (over) => Object.assign({
    bid: 'B1', stats: statsOf(), devId: 'D1',
    statsPending: true, statsSyncing: false, statsResync: false,
    statsDirty: false, statsNote: '', ui: null, panel: null,
  }, over || {});

  // Enough of section 16e's carrier to be driven. base32 is not what is under
  // test here, so the codecs are any faithful round trip.
  const carrierOf = (over) => Object.assign({
    course: () => 'B1',
    read: async () => '',
    write: async () => 'oid1',
    encode: (bytes) => Buffer.from(bytes).toString('base64'),
    decode: (text) => Buffer.from(text, 'base64'),
    maxBytes: 120000,
  }, over || {});

  // The push is fired and forgotten, so every assertion has to let its
  // microtasks run first.
  const settle = async () => {
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
  };

  // --- the two silences ---------------------------------------------------
  {
    const env = envOf({ statsPending: false });
    let writes = 0;
    S.__setEnv(env, SC);
    S.__setSync({ carrier: carrierOf({ write: async () => { writes++; return 'x'; } }) });
    S.pushStatsAfterSession('closed by hand');
    await settle();
    eq('a session that counted nothing pushes nothing', writes, 0);
  }
  {
    // The user's own switch is off: this has to be as quiet as it was before
    // this existed, or every session would end with a line about it.
    const env = envOf({});
    let writes = 0;
    S.__setEnv(env, SC);
    S.__setSync({ carrier: carrierOf({ course: () => '',
      write: async () => { writes++; return 'x'; } }) });
    S.pushStatsAfterSession('time');
    await settle();
    eq('no sync course pushes nothing', writes, 0);
    eq('...and the debt is kept', env.statsPending, true);
    eq('...and nothing is said about it', S.__statsNote(), '');
  }

  // --- the ordinary push --------------------------------------------------
  {
    const env = envOf({});
    const wrote = [];
    S.__setEnv(env, SC);
    S.__setSync({ carrier: carrierOf({
      write: async (name, text) => { wrote.push({ name, text }); return 'x'; } }) });
    S.pushStatsAfterSession('set cleared');
    await settle();
    eq('a set that answered something is pushed', wrote.length, 1);
    eq('...to the stats card', wrote[0].name, SC.statsCardName);
    eq('...and the debt is cleared', env.statsPending, false);
    eq('...and nothing is left marked as syncing', env.statsSyncing, false);
  }

  // --- a write that fails leaves the debt ---------------------------------
  {
    const env = envOf({});
    S.__setEnv(env, SC);
    S.__setSync({ carrier: carrierOf({
      write: async () => { throw new Error('offline'); } }) });
    S.pushStatsAfterSession('time');
    await settle();
    eq('a failed write puts the debt back', env.statsPending, true);
    eq('...and says so', /Could not sync/.test(S.__statsNote()), true);
  }

  // --- a push asked for while one is in flight ----------------------------
  {
    // THE CASE THE QUEUE EXISTS FOR: the exchange fired when the session
    // OPENED packed its payload before any of this session's answers were
    // counted, so a second push merely refused there is those answers
    // stranded on the device until the next session is opened on it.
    const env = envOf({});
    let writes = 0;
    let release = null;
    const held = new Promise((r) => { release = r; });
    let first = true;
    S.__setEnv(env, SC);
    S.__setSync({ carrier: carrierOf({ write: async () => {
      writes++;
      if (first) { first = false; await held; }
      return 'x';
    } }) });
    S.pushStatsAfterSession('opening');
    await settle();
    eq('the first push is in flight', [writes, env.statsSyncing], [1, true]);
    // …and now the session ends underneath it.
    env.statsPending = true;
    S.pushStatsAfterSession('set cleared');
    await settle();
    eq('the second is queued rather than dropped', env.statsResync, true);
    release();
    await settle();
    eq('...and re-fires once the first is done', writes, 2);
    eq('...clearing the debt', env.statsPending, false);
    eq('...and not looping', env.statsResync, false);
  }
}


// ---------------------------------------------------------------------------
// 32) THE POSITION STORE'S END-OF-SESSION PUSH (§14.25)
//
// §15.7's argument, one store over: the pushes were "opening a session",
// "after gathering" and the round's per-course one — all about work this
// device is ABOUT to do — so a session that answered its way through a dozen
// positions left every retirement and every miss on the device.
//
// Three things here are silent when wrong:
//   * THE CAPTURE. `syncStore` claims the write counter it read BEFORE the
//     card, so a change landing mid-exchange is still a debt. Capturing after
//     the pack instead loses exactly those positions, and every sync still
//     reports success.
//   * THE COURSE GUARD. An exchange whose course moves under it must abandon
//     the write: the card is named from the OLD bid and the payload stamped
//     with the NEW one, so §27b's `stormWireForeign` would then refuse that
//     card for ever — the one dead end this feature cannot dig itself out of.
//   * THE SILENCES. A push that fires when it should not is an exchange per
//     window close; one that never fires is the behaviour that was there
//     before, i.e. indistinguishable from working.
//
// IMPURE, with the carrier and `syncStore`'s collaborators stubbed. NOT
// covered here: the two calls to `noteStoreChanged` inside `saveStore` and
// `savePuzzleStore`, and the call to `pushStoreAfterSession` in `endSession`
// — none of those three functions is sliced.
// ---------------------------------------------------------------------------
console.log('\n-- 32) the position store push (§14.25) --\n');
{
  const SC = Object.assign({}, C, {
    cardPrefix: str('cardPrefix'),
    cardName: str('cardName'),
    cardChapter: str('cardChapter'),
    maxWireBytes: num('maxWireBytes'),
    storeTtlMs: 1e12,
  });

  const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 5 4';
  const storeOf = () => ({ [cacheKey(fen)]: {
    f: fen, n: 'A line', o: 'L1', t: 1000, k: 0,
    a: ['e2e4', 'e4'], m: [['g1f3', 20], ['b1c3', 10]] } });

  const envOf = (over) => Object.assign({
    bid: 'B1', store: storeOf(), gone: {}, clearedAt: 0,
    storeSeq: 0, storeSynced: 0, handingToGather: false, syncing: false,
    storeDirty: false, goneDirty: false, lastPull: 0,
    running: false, over: true, ui: null, panel: null,
  }, over || {});

  const carrierOf = (over) => Object.assign({
    course: () => 'B1',
    read: async () => '',
    write: async () => 'oid1',
    encode: (bytes) => Buffer.from(bytes).toString('base64'),
    decode: (text) => Buffer.from(text, 'base64'),
    maxBytes: 120000,
  }, over || {});

  const settle = async () => {
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
  };

  // --- the counter --------------------------------------------------------
  {
    const env = envOf({});
    S.__setEnv(env, SC);
    eq('a store nothing has written to owes nothing', S.storeChanged(), false);
    S.noteStoreChanged();
    eq('...and one write is a debt', S.storeChanged(), true);
    S.resetStoreDebt();
    eq('changing course drops it', S.storeChanged(), false);
  }

  // --- an exchange claims it ----------------------------------------------
  {
    const env = envOf({});
    const wrote = [];
    S.__setEnv(env, SC);
    S.__setSync({ carrier: carrierOf({
      write: async (name) => { wrote.push(name); return 'x'; } }) });
    S.noteStoreChanged();
    await S.syncStore('by hand');
    eq('an exchange writes the card', wrote.length, 1);
    eq('...and clears the debt', S.storeChanged(), false);
  }

  // --- …but only as much of it as it carried ------------------------------
  {
    // THE CASE THE EARLY CAPTURE EXISTS FOR: a background walk stores a
    // position while the exchange is reading the card. That position is not in
    // the payload, so it must still be owed afterwards.
    const env = envOf({});
    S.__setEnv(env, SC);
    S.__setSync({ carrier: carrierOf({
      read: async () => { S.noteStoreChanged(); return ''; } }) });
    S.noteStoreChanged();
    await S.syncStore('by hand');
    eq('a write landing mid-exchange is still owed', S.storeChanged(), true);
  }

  // --- the course moving under it -----------------------------------------
  {
    const env = envOf({});
    const wrote = [];
    S.__setEnv(env, SC);
    S.__setSync({ carrier: carrierOf({
      read: async () => { env.bid = 'B2'; return ''; },
      write: async (name) => { wrote.push(name); return 'x'; } }) });
    S.noteStoreChanged();
    await S.syncStore('opening a session');
    eq('a course change mid-exchange writes nothing', wrote.length, 0);
    eq('...and leaves the debt', S.storeChanged(), true);
  }

  // --- the four silences ---------------------------------------------------
  {
    const env = envOf({});
    let writes = 0;
    S.__setEnv(env, SC);
    S.__setSync({ carrier: carrierOf({ write: async () => { writes++; return 'x'; } }) });
    S.pushStoreAfterSession('closed by hand');
    await settle();
    eq('a session that wrote nothing pushes nothing', writes, 0);
  }
  {
    const env = envOf({ handingToGather: true });
    let writes = 0;
    S.__setEnv(env, SC);
    S.__setSync({ carrier: carrierOf({ write: async () => { writes++; return 'x'; } }) });
    S.noteStoreChanged();
    S.pushStoreAfterSession('gathering instead');
    await settle();
    eq('handing over to a gather pushes nothing', writes, 0);
    eq('...and the debt stands for the gather to push', S.storeChanged(), true);
  }
  {
    const env = envOf({ syncing: true });
    let writes = 0;
    S.__setEnv(env, SC);
    S.__setSync({ carrier: carrierOf({ write: async () => { writes++; return 'x'; } }) });
    S.noteStoreChanged();
    S.pushStoreAfterSession('time');
    await settle();
    eq('an exchange already in flight is not doubled', writes, 0);
    eq('...and the debt stands', S.storeChanged(), true);
  }
  {
    const env = envOf({});
    let writes = 0;
    S.__setEnv(env, SC);
    S.__setSync({ carrier: carrierOf({ course: () => '',
      write: async () => { writes++; return 'x'; } }) });
    S.noteStoreChanged();
    S.__clearNote();
    S.pushStoreAfterSession('time');
    await settle();
    eq('no sync course pushes nothing', writes, 0);
    // It must not even reach `setSyncNote`: with the carrier switched off,
    // every session close would otherwise end with a line about it.
    eq('...and says nothing about it', S.__statsNote(), '');
  }

  // --- and the ordinary one ------------------------------------------------
  {
    const env = envOf({});
    const wrote = [];
    S.__setEnv(env, SC);
    S.__setSync({ carrier: carrierOf({
      write: async (name) => { wrote.push(name); return 'x'; } }) });
    S.noteStoreChanged();
    S.pushStoreAfterSession('set cleared');
    await settle();
    eq('a session that stored or retired something is pushed', wrote.length, 1);
    eq('...to this course’s own card', wrote[0], S.stormCardName('B1'));
    eq('...and the debt is cleared', S.storeChanged(), false);
  }
}



  console.log('\n' + SRC_PATH);
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
