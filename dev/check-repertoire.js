/**
 * dev/check-repertoire.js — executes the REAL repertoireRowStates, repRowTint
 * and applyRepertoirePref, sliced out of content/lichessable.js, against two
 * hand-built repertoire indexes and explorer answers in the shape the live
 * Lichess API returns.
 *
 * Why this exists: v0.187.0 gave section 6c a SECOND slot, and every judgement
 * it added is silent when it is wrong.
 *
 *  - THE MERGE. The unprepared-reply warning means "neither of them answers
 *    this", so its threshold is the most popular move covered by ANY slot and a
 *    move marked by ANY slot is silenced. Computed per slot instead, a White
 *    course and a Black one flag each other's positions: still a plausible
 *    table, now with a red triangle on the main line of a course that answers
 *    it perfectly well.
 *  - THE "OUR MOVE" SILENCE, which is that merge's subtle half. It is asked of
 *    every slot that COVERS the position, and one saying "mine" is enough. Ask
 *    it of the wrong slot — one that has never heard of the position — and the
 *    warning fires on the user's OWN repertoire decisions, which is the exact
 *    failure section 6c's original rule exists to prevent.
 *  - THE TINT PRECEDENCE. A row can be answered by both slots and a background
 *    can say one thing: hue is identity (first slot with an opinion), strength
 *    is the kind ('in' anywhere beats 'transposes' anywhere). Reverse either
 *    half and the table still paints, in the wrong colour or the wrong weight.
 *  - THE PREFERENCE SHAPE. `applyRepertoirePref` reads BOTH the pre-v0.187.0
 *    single { bid, name } and the array. Lose the old arm and every profile
 *    that has ever nominated a repertoire silently has none, with the panel
 *    politely offering to link one.
 *
 * CONTROLS RUN (each is a source edit, confirmed to make this file FAIL — a
 * control that does not fail has proved nothing):
 *   1. repertoireRowStates: drop the `st.kind === 'in'` test on `covered`, so a
 *      transposition sets the threshold.                        FAILS case M4.
 *   2. repertoireRowStates: `out[i].marks.some(Boolean)` → `out[i].marks[0]`,
 *      i.e. only slot 0 silences a row.                         FAILS case M5.
 *   3. repertoireRowStates: drop `if (!a || !a.size) continue` from the
 *      covering scan, so a slot that does not cover here votes. FAILS case M6.
 *   4. repertoireRowStates: `ourMove` read from `live[0]` alone.
 *                                                          FAILS case M6 (1st).
 *   5. repRowTint: run the 'transposes' loop first.              FAILS case T3.
 *   6. repRowTint: return `REP_HUE[1]` from the 'in' loop.       FAILS case T2.
 *   7. applyRepertoirePref: drop the non-array arm.              FAILS case P1.
 *
 * Run: node dev/check-repertoire.js
 *      CLO_SRC=/path/to/copy.js node dev/check-repertoire.js   (to run a control)
 */
'use strict';

const path = require('path');
const { sliceDecl, SRC_PATH } = require('./slice-source');
const CloSan = require('../engine/san.js');

// --- the shipped code ------------------------------------------------------
//
// Sliced, never transcribed. `repKey` is sliced too even though the fixtures
// could compute it themselves: it is the key on BOTH sides of every comparison
// below, so a transcribed copy could quietly agree with a broken one.
const NAMES = [
  'repKey', 'repertoireMovesAt', 'repertoireReaches', 'repertoireMoveState',
  'repertoireOpponentToMove', 'repertoireRowStates', 'repRowTint',
  'applyRepertoirePref',
];

const REP_SLOTS = 2;
const REP_HUE = ['a', 'b'];
const REP = { riskMinGames: 50 };

// ONE ARRAY IDENTITY for the whole run — the slices capture it in their
// closure, so a case REFILLS it rather than replacing it. Assigning a fresh
// array leaves every sliced function looking at the empty one it was defined
// with, which reads as "nothing nominated" and makes this whole file pass
// vacuously (which is exactly what the first draft of it did).
const reps = [];
const setReps = (list) => { reps.length = 0; for (const x of list) reps.push(x); };
const repActive = () => reps.filter((s) => s.bid);

const squareName = (sq) => 'abcdefgh'[sq & 7] + (1 + (sq >> 3));

const src = NAMES.map(sliceDecl).join('\n\n');
const api = new Function(
  'CloSan', 'REP', 'REP_SLOTS', 'REP_HUE', 'squareName', 'reps', 'repActive',
  src + '\nreturn { repKey, repertoireMovesAt, repertoireReaches, repertoireMoveState,'
      + ' repertoireOpponentToMove, repertoireRowStates, repRowTint, applyRepertoirePref };'
)(CloSan, REP, REP_SLOTS, REP_HUE, squareName, reps, repActive);

let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log('FAIL ' + name + '\n  got  ' + g + '\n  want ' + w);
};

// --- fixtures --------------------------------------------------------------

const REAL_START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** A slot whose index answers `answers` and reaches `answers` plus `extraSeen`. */
function slot(i, side, answers, extraSeen) {
  const a = new Map();
  for (const [fen, moves] of Object.entries(answers)) {
    const m = new Map();
    for (const [uci, san] of Object.entries(moves)) m.set(uci, { san, n: 1, names: [] });
    a.set(api.repKey(fen), m);
  }
  const seen = new Set(a.keys());
  for (const f of extraSeen || []) seen.add(api.repKey(f));
  return {
    i, bid: 'b' + i, name: 'course ' + i, loading: false, error: '',
    index: { bid: 'b' + i, name: 'course ' + i, side, answers: a, seen, ends: [] },
  };
}

const empty = (i) => ({ i, bid: null, name: '', index: null, loading: false, error: '' });

/** The explorer's own shape: san + uci + w/d/b counts. */
const mv = (san, uci, games) => ({ san, uci, white: games, draws: 0, black: 0 });

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
const AFTER_E4_C5 = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2';
const AFTER_E4_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2';

const BLACK_REPLIES = [
  mv('e5', 'e7e5', 400),
  mv('c5', 'c7c5', 300),
  mv('e6', 'e7e6', 100),
];

/** "risk", or the per-slot kinds joined — the shape every M case reads. */
const shape = (rows) => rows.map((e) => (e.risk
  ? 'risk'
  : e.marks.map((m) => (m ? m.kind : '-')).join(',')));

// ===========================================================================
// M) the merged warning
// ===========================================================================

// M1: one slot, a White course, Black to move, e5 uncovered and more popular
// than the covered c5 — the warning, exactly as before two slots existed.
setReps([slot(0, 'w', { [AFTER_E4]: { c7c5: 'c5' } }), empty(1)]);
let r = api.repertoireRowStates(AFTER_E4, BLACK_REPLIES, 800);
ok('M1 one slot: uncovered and more popular = risk', shape(r), ['risk', 'in,-', '-,-']);

// M2: the SECOND slot covers e5, so the warning must go. This is the merge.
setReps([slot(0, 'w', { [AFTER_E4]: { c7c5: 'c5' } }),
         slot(1, 'w', { [AFTER_E4]: { e7e5: 'e5' } })]);
r = api.repertoireRowStates(AFTER_E4, BLACK_REPLIES, 800);
ok('M2 covered by the OTHER slot = no warning, each mark under its own slot',
  shape(r), ['-,in', 'in,-', '-,-']);

// M3: the threshold is the most popular move ANY slot covers. Slot 0 covers
// e6 (100) and slot 1 covers e5 (400), so the bar is 400 and the uncovered c5
// at 300 is UNDER it — silence. Measured against slot 0 alone the bar would be
// 100 and c5 would be flagged, which is the companion below: this pair is what
// makes the case discriminate rather than merely pass.
setReps([slot(0, 'w', { [AFTER_E4]: { e7e6: 'e6' } }),
         slot(1, 'w', { [AFTER_E4]: { e7e5: 'e5' } })]);
r = api.repertoireRowStates(AFTER_E4, BLACK_REPLIES, 800);
ok('M3 the union max raises the bar over both slots', shape(r),
  ['-,in', '-,-', 'in,-']);

setReps([slot(0, 'w', { [AFTER_E4]: { e7e6: 'e6' } }), empty(1)]);
r = api.repertoireRowStates(AFTER_E4, BLACK_REPLIES, 800);
ok('M3 without slot 1 the same c5 IS flagged', shape(r), ['risk', 'risk', 'in,-']);

// M4: a TRANSPOSITION silences its own row but sets NO threshold — only an
// 'in' does. Slot 0 plays nothing here and merely reaches the position after
// e5; slot 1 covers e6 (100), so c5 at 300 clears the bar.
setReps([slot(0, 'w', {}, [AFTER_E4, AFTER_E4_E5]),
         slot(1, 'w', { [AFTER_E4]: { e7e6: 'e6' } })]);
r = api.repertoireRowStates(AFTER_E4, BLACK_REPLIES, 800);
ok('M4 a ring silences its row but sets no threshold',
  shape(r), ['transposes,-', 'risk', '-,in']);

// M5: a row marked by slot 1 ALONE is silenced.
setReps([slot(0, 'w', { [AFTER_E4]: { e7e6: 'e6' } }),
         slot(1, 'w', {}, [AFTER_E4, AFTER_E4_C5])]);
r = api.repertoireRowStates(AFTER_E4, BLACK_REPLIES, 800);
ok('M5 slot 1 alone silences a row', shape(r), ['risk', '-,transposes', 'in,-']);

// M6: OUR MOVE. Black to move; slot 1 is the BLACK course and covers this
// position, so every reply here is the user's own choice and none is a gap —
// even though slot 0, the White course, would call it the opponent's.
setReps([slot(0, 'w', { [AFTER_E4]: { e7e6: 'e6' } }),
         slot(1, 'b', { [AFTER_E4]: { c7c5: 'c5' } })]);
r = api.repertoireRowStates(AFTER_E4, BLACK_REPLIES, 800);
ok('M6 a covering slot calling it OUR move silences everything',
  r.map((e) => Boolean(e.risk)), [false, false, false]);

// …and a slot that does NOT cover this position has no standing to say so.
setReps([slot(0, 'w', { [AFTER_E4]: { e7e6: 'e6' } }),
         slot(1, 'b', { [REAL_START]: { e2e4: 'e4' } })]);
r = api.repertoireRowStates(AFTER_E4, BLACK_REPLIES, 800);
ok('M6 a slot that does not cover here does not silence',
  r.map((e) => Boolean(e.risk)), [true, true, false]);

// M7: sample size. M1's shape, under riskMinGames for the POSITION.
setReps([slot(0, 'w', { [AFTER_E4]: { c7c5: 'c5' } }), empty(1)]);
r = api.repertoireRowStates(AFTER_E4, BLACK_REPLIES, 49);
ok('M7 under riskMinGames nothing is flagged',
  r.map((e) => Boolean(e.risk)), [false, false, false]);

// M8: nothing nominated — every row silent, and no throw.
setReps([empty(0), empty(1)]);
r = api.repertoireRowStates(AFTER_E4, BLACK_REPLIES, 800);
ok('M8 nothing nominated = nothing said',
  r.map((e) => Boolean(e.risk) || e.marks.some(Boolean)), [false, false, false]);

// M9: THE CASTLING TRAP (v0.48.1), now with a slot argument. Lichess writes
// O-O as king-takes-rook; the index holds the king-two-files form. It must be
// RESOLVED through CloSan, never compared raw.
const CASTLE_FEN = 'rnbqk2r/pppp1ppp/5n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
setReps([slot(0, 'w', { [CASTLE_FEN]: { e1g1: 'O-O' } }), empty(1)]);
r = api.repertoireRowStates(CASTLE_FEN, [mv('O-O', 'e1h1', 900)], 900);
ok('M9 explorer king-takes-rook resolves to the index spelling',
  shape(r), ['in,-']);
ok('M9 …and the state carries the CANONICAL uci', r[0].marks[0].uci, 'e1g1');

// ===========================================================================
// T) the row tint
// ===========================================================================

const tint = (a, b, risk) => api.repRowTint({
  marks: [a ? { slot: 0, kind: a } : null, b ? { slot: 1, kind: b } : null],
  risk: risk ? { kind: 'risk' } : null,
});

setReps([slot(0, 'w', {}), slot(1, 'w', {})]);
ok('T1 slot 0 alone, in', tint('in', null, false), { hue: 'a', weak: false });
ok('T2 slot 1 alone, in', tint(null, 'in', false), { hue: 'b', weak: false });
ok('T3 in beats transposes whichever slot it is on',
  tint('transposes', 'in', false), { hue: 'b', weak: false });
ok('T3b and the other way round',
  tint('in', 'transposes', false), { hue: 'a', weak: false });
ok('T4 both in: hue is the FIRST slot', tint('in', 'in', false), { hue: 'a', weak: false });
ok('T5 rings only: faint, first slot',
  tint('transposes', 'transposes', false), { hue: 'a', weak: true });
ok('T6 slot 1 ring only', tint(null, 'transposes', false), { hue: 'b', weak: true });
ok('T7 the warning has no slot', tint(null, null, true), { hue: 'risk', weak: false });
ok('T8 nothing at all', tint(null, null, false), null);

// ===========================================================================
// P) the preference shape
// ===========================================================================

const prefState = () => reps.map((s) => (s.bid ? s.bid + '/' + s.name : null));

setReps([empty(0), empty(1)]);
api.applyRepertoirePref({ bid: '123', name: 'White' });
ok('P1 the PRE-v0.187.0 single object still loads', prefState(), ['123/White', null]);

setReps([empty(0), empty(1)]);
api.applyRepertoirePref([{ bid: '1', name: 'A' }, { bid: '2', name: 'B' }]);
ok('P2 the array loads both slots', prefState(), ['1/A', '2/B']);

setReps([empty(0), empty(1)]);
api.applyRepertoirePref([{ bid: '1', name: 'A' }, null]);
ok('P3 a null second slot stays empty', prefState(), ['1/A', null]);

setReps([empty(0), empty(1)]);
api.applyRepertoirePref([{ bid: '1', name: 'A' }, { bid: '2', name: 'B' }]);
api.applyRepertoirePref(null);
ok('P4 clearing empties both', prefState(), [null, null]);

// A changed bid must DROP that slot's index; an unchanged one must keep it.
setReps([slot(0, 'w', {}), slot(1, 'w', {})]);
reps[0].bid = '1'; reps[1].bid = '2';
const changed = api.applyRepertoirePref([{ bid: '1', name: 'A' }, { bid: '9', name: 'C' }]);
ok('P5 only the changed slot loses its index',
  [changed, Boolean(reps[0].index), Boolean(reps[1].index)], [true, true, false]);

setReps([slot(0, 'w', {}), empty(1)]);
reps[0].bid = '1';
ok('P6 an identical preference reports no change',
  api.applyRepertoirePref([{ bid: '1', name: 'course 0' }, null]), false);

// ---------------------------------------------------------------------------
console.log('source: ' + path.relative(process.cwd(), SRC_PATH));
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
