/**
 * dev/check-key-moves.js — section 25's proposal rule, executed.
 *
 * `propose()` is the whole of the feature's judgement: it decides whether a
 * variation's key range is offered a move, in which direction, and to which
 * ply. Both of its interesting properties are hard to reach from a live
 * session — the first needs a course whose key moves this extension lowered
 * WEEKS ago, the second needs a move to have stopped being difficult in the
 * meantime — so this runs the shipped function over both instead.
 *
 * The scenario it exists for, in the user's own words:
 *
 *   1. variation A's key moves are pulled back to cover difficult move B
 *   2. the user reviews A many times
 *   3. B is no longer difficult (>= the threshold)
 *   4. the user scans again
 *   5. B should no longer hold the key moves back
 *
 * It also covers 25c, the spread of difficulty by POSITION. Chessable's record
 * is per CARD, so a move can be difficult in one variation and unrecorded in
 * twenty others — and a move in a variation's run-up is never ASKED there, so it
 * can never be recorded there at all. Pooling is what finds those, and the
 * property that matters is that pooling can only ever ADD.
 *
 * Run a control (CLO_SRC at a copy with the change reverted) and confirm it
 * FAILS: the pre-25b source proposes nothing at step 4.
 *
 *   node dev/check-key-moves.js
 */
'use strict';
const { sliceDecl, SRC_PATH } = require('./slice-source.js');
const CloSan = require('../engine/san.js');

const START_FEN_ = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const START_FEN = START_FEN_;
const cacheKeyOf = (fen) => fen.split(' ').slice(0, 4).join(' ');

// The module-level state `propose` reads, and the three ply helpers it calls.
// Everything else in initKeyMoves is UI or I/O and is deliberately not here.
const km = { lead: 0, useStale: false };
const build = new Function('CloSan', 'km', [
  'const SQ_FILES = "abcdefgh";',
  sliceDecl('squareName'),
  sliceDecl('START_FEN'),
  sliceDecl('cacheKey'),
  sliceDecl('RELAXED_SAN_RE'),
  sliceDecl('sanToUciRelaxed'),
  sliceDecl('sanToUci'),
  sliceDecl('fenAfterUci'),
  sliceDecl('walkVariation'),
  sliceDecl('CONFIG'),
  sliceDecl('difficultRowCounts'),
  sliceDecl('plyBase'),
  sliceDecl('plyColor'),
  sliceDecl('snapToMove'),
  sliceDecl('plyLabel'),
  sliceDecl('posMoveKey'),
  sliceDecl('poolByPosition'),
  sliceDecl('pooledAccuracy'),
  sliceDecl('spreadByPosition'),
  sliceDecl('propose'),
  'return { propose, plyBase, plyColor, snapToMove, plyLabel,',
  '  poolByPosition, pooledAccuracy, spreadByPosition, walkVariation };',
].join('\n'));
const {
  propose, plyBase, snapToMove, poolByPosition, pooledAccuracy, spreadByPosition,
} = build(CloSan, km);

let failures = 0;
function check(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { console.log('  ok   ' + name); return; }
  failures++;
  console.log('  FAIL ' + name + '\n         got  ' + g + '\n         want ' + w);
}

/**
 * One entry in exactly the shape `analyse()` builds, so `propose` cannot tell
 * this apart from a real course read.
 *
 * `sans` is a plain 1.e4 e5 2.Nf3 Nc6 3.d4 exd4 4.Nxd4 Nf6 line — ply 0..7 —
 * because nothing here depends on the moves being anything in particular; what
 * matters is the ply arithmetic and the colours it produces.
 */
const SANS = ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4', 'Nf6'];

function entry(over) {
  const v = { fen: START_FEN, sans: SANS };
  const e = Object.assign({
    oid: '1', name: 'A', plies: SANS.length,
    low: 4, high: SANS.length - 1, noKeys: false, endMark: false,
    base: plyBase(v), sans: SANS,
    hard: [], outside: [], tail: [], staleLow: null, baseLow: null,
  }, over);
  e.outside = e.hard.filter((h) => h.ply < e.low);
  e.tail = e.hard.filter((h) => h.ply > e.high);
  return e;
}

const move = (ply, acc) => ({ ply, san: SANS[ply], acc, attempts: 20 });
const out = (e) => { propose(e); return { dir: e.targetDir, ply: e.target }; };

console.log('source: ' + SRC_PATH + '\n');

// --- the scenario, step by step ------------------------------------------
console.log('the user\'s scenario (1-5)');
{
  // 1. key range starts at ply 4; move B at ply 1 is difficult.
  const step1 = entry({ low: 4, hard: [move(1, 78)] });
  check('1. difficult move before the range ⇒ lower to it', out(step1), { dir: 'lower', ply: 0 });
  // Chessable snaps a range to the start of a move pair, so ply 1 (Black's)
  // becomes ply 0. That is the ply the write actually asks for.

  // 2-3. the range is now at 0, and B is no longer difficult. Nothing else in
  //      the variation is hard. The baseline remembers where it came from.
  const step4 = entry({ low: 0, baseLow: 4, hard: [] });
  check('4. nothing difficult left ⇒ restore to where it was',
    out(step4), { dir: 'raise', ply: 4 });

  // 5. …and once it is back there, it stays there.
  const step5 = entry({ low: 4, baseLow: null, hard: [] });
  check('5. already back ⇒ nothing offered', out(step5), { dir: '', ply: null });
}

// --- the raise is bounded by whatever is STILL difficult ------------------
console.log('\nwhat still holds a range back');
{
  // B (ply 1) recovered but C (ply 3) has not: the range may come back as far
  // as C and no further. This is the case that needs `hard` rather than
  // `outside` — C sits INSIDE the lowered range, so an "outside" reading would
  // see nothing and restore all the way past it.
  const partial = entry({ low: 0, baseLow: 4, hard: [move(3, 71)] });
  check('a difficult move inside the range caps the restore',
    out(partial), { dir: 'raise', ply: 2 });

  // Nothing recovered at all: the range is exactly where it should be.
  const held = entry({ low: 0, baseLow: 4, hard: [move(1, 78)] });
  check('nothing recovered ⇒ no offer', out(held), { dir: '', ply: null });

  // A difficult move that is still EARLIER than the current start: lowering
  // wins over restoring, even with a baseline present.
  const deeper = entry({ low: 4, baseLow: 6, hard: [move(1, 78)] });
  check('a range that must go further back still lowers',
    out(deeper), { dir: 'lower', ply: 0 });
}

// --- the invariant for a range this tool has never touched ----------------
console.log('\nno baseline ⇒ it can only ever be lowered (§2)');
{
  const clean = entry({ low: 4, baseLow: null, hard: [move(6, 60)] });
  check('difficult move already inside ⇒ nothing', out(clean), { dir: '', ply: null });

  const never = entry({ low: 2, baseLow: null, hard: [] });
  check('no record and nothing hard ⇒ nothing', out(never), { dir: '', ply: null });

  // The one that matters: a variation whose difficult moves are ALL well after
  // the start must never be raised on that evidence alone.
  const late = entry({ low: 0, baseLow: null, hard: [move(5, 55)] });
  check('late difficult move, no record ⇒ still nothing', out(late), { dir: '', ply: null });
}

// --- the lead setting -----------------------------------------------------
console.log('\nthe lead setting');
{
  km.lead = 1;
  const white = entry({ low: 6, hard: [move(4, 80)] });   // 3.d4, White's
  check('lead 1 on a White difficult move ⇒ a whole move earlier',
    out(white), { dir: 'lower', ply: 2 });
  const black = entry({ low: 6, hard: [move(3, 80)] });   // 2...Nc6, Black's
  check('lead 1 on a Black one ⇒ the same pair the snap would give',
    out(black), { dir: 'lower', ply: 2 });
  km.lead = 0;
}

// --- refusals -------------------------------------------------------------
console.log('\nrefusals');
{
  const ended = entry({ low: 4, high: 5, endMark: true, hard: [move(1, 70)] });
  check('a variation with an END mark is never offered anything',
    out(ended), { dir: '', ply: null });

  // A range already at ply 0 cannot go lower, whatever is difficult.
  const floor = entry({ low: 0, hard: [move(1, 70)] });
  check('already at the first ply ⇒ nothing', out(floor), { dir: '', ply: null });
}

// --- the snap, on its own -------------------------------------------------
console.log('\nthe move-pair snap');
{
  const base = plyBase({ fen: START_FEN, sans: SANS });
  check('a White ply is left alone', snapToMove(base, 4), 4);
  check('a Black ply comes back one', snapToMove(base, 5), 4);
  check('ply 0 has nowhere to go', snapToMove(base, 0), 0);
  // A variation whose own start position has Black to move: ply 0 is Black's
  // half of a pair and there is no earlier half to snap to.
  const bb = plyBase({ fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', sans: SANS });
  check('Black-to-move start: ply 0 stays', snapToMove(bb, 0), 0);
  check('Black-to-move start: ply 1 is White\'s and stays', snapToMove(bb, 1), 1);
  check('Black-to-move start: ply 2 comes back one', snapToMove(bb, 2), 1);
}

// --- 25c: difficulty pooled by position ----------------------------------
//
// One row of the shape the Difficult Moves feed serves. `attempted` is every
// attempt, `totalamount` the failures among them, and `wrongMoves` names each
// failure — `timeU` being the clock rather than the move, which section 13b's
// rule drops from BOTH halves of the fraction.
function feedRow(fen, san, attempted, fails, timeouts) {
  const wrong = [];
  if (timeouts) wrong.push({ move: 'timeU', amount: timeouts });
  if (fails - timeouts > 0) wrong.push({ move: 'Xx1', amount: fails - timeouts });
  return { fen, correctMove: san, attempted: String(attempted), totalamount: String(fails), wrongMoves: wrong };
}

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

console.log('\npooling (25c)');
{
  // The real shape of the problem, from the live course: six records of
  // 1...c5, five of them comfortable, one at 88.9% over nine attempts.
  const rows = [
    feedRow(AFTER_E4, 'c5', 56, 10, 6),
    feedRow(AFTER_E4, 'c5', 13, 1, 1),
    feedRow(AFTER_E4, 'c5', 11, 2, 1),
    feedRow(AFTER_E4, 'c5', 8, 1, 1),
    feedRow(AFTER_E4, 'c5', 9, 3, 3),
    feedRow(AFTER_E4, 'c5', 9, 1, 0),
  ];
  const pool = poolByPosition(rows);
  const e = pool.get(cacheKeyOf(AFTER_E4) + '|c5');
  check('six records pool into one', [e.rows, e.successes, e.counted], [6, 88, 94]);
  check('pooled is attempt-weighted, not an average of percentages',
    Math.round(pooledAccuracy(e) * 10) / 10, 93.6);
  // The mean of the six own-accuracies is ~95.1 and the min is 88.9; neither is
  // 93.6, so this genuinely pins the weighting rather than a coincidence.
}

console.log('\nthe spread, on a variation with no record of its own');
{
  const rows = [feedRow(AFTER_E4, 'c5', 20, 8, 0)];   // 60% — well under the bar
  const pool = poolByPosition(rows);
  // A variation that PLAYS 1...c5 but has never had a record of it, because it
  // is in the run-up and is therefore never asked. This is the whole point.
  const v = { fen: START_FEN_, sans: ['e4', 'c5', 'Nf3', 'Nc6', 'd4'] };
  const hard = [];
  check('it walks', spreadByPosition(v, hard, pool, 90), true);
  check('the move is found by position alone',
    hard.map((h) => [h.ply, h.san, Math.round(h.acc), Boolean(h.spread)]), [[1, 'c5', 60, true]]);

  // …and a variation that never reaches that position gains nothing.
  const other = { fen: START_FEN_, sans: ['d4', 'd5', 'c4'] };
  const none = [];
  spreadByPosition(other, none, pool, 90);
  check('a variation that never reaches the position is untouched', none.length, 0);
}

console.log('\nthe spread can only ever ADD');
{
  const v = { fen: START_FEN_, sans: ['e4', 'c5', 'Nf3', 'Nc6', 'd4'] };

  // THE GUARANTEE, and the line that provides it is `if (acc >= threshold)
  // continue`. Pooled 93.6% is above the bar while this variation's own record
  // is 70%: turning the spread on must not withdraw a lowering the user could
  // already see. (Sensitive to removing that guard — without it the own entry
  // would be rewritten to 93.6 and drop out of `hard`.)
  const comfy = poolByPosition([
    feedRow(AFTER_E4, 'c5', 56, 10, 6), feedRow(AFTER_E4, 'c5', 13, 1, 1),
    feedRow(AFTER_E4, 'c5', 11, 2, 1), feedRow(AFTER_E4, 'c5', 8, 1, 1),
    feedRow(AFTER_E4, 'c5', 9, 3, 3), feedRow(AFTER_E4, 'c5', 9, 1, 0),
  ]);
  const kept = [{ ply: 1, san: 'c5', acc: 70, attempts: 10 }];
  spreadByPosition(v, kept, comfy, 90);
  check('a comfortable pool leaves an own record below the bar alone',
    [kept.length, kept[0].acc, kept[0].pooled === undefined], [1, 70, true]);

  // The adding direction: a pool below the bar reaches a variation whose own
  // record is comfortable, and the move joins `hard`.
  const harsh = poolByPosition([feedRow(AFTER_E4, 'c5', 20, 8, 0)]);   // 60%
  const sharpened = [{ ply: 1, san: 'c5', acc: 95, attempts: 20 }];
  spreadByPosition(v, sharpened, harsh, 90);
  check('a pool below the bar sharpens a comfortable own record',
    [sharpened.length, sharpened[0].acc], [1, 60]);

  // With BOTH under the bar the proposal is the same either way, so this only
  // pins the figure DISPLAYED: the worse of the two, being the one that argues
  // for the range being where it is. (Sensitive to `own.acc = acc`.)
  const mid = poolByPosition([feedRow(AFTER_E4, 'c5', 100, 15, 0)]);   // 85%
  const both = [{ ply: 1, san: 'c5', acc: 60, attempts: 10 }];
  spreadByPosition(v, both, mid, 90);
  check('both under the bar ⇒ the worse figure is the one shown',
    [both[0].acc, Math.round(both[0].pooled)], [60, 85]);
}

console.log('\na line that will not replay is left alone');
{
  const pool = poolByPosition([feedRow(AFTER_E4, 'c5', 20, 8, 0)]);
  const broken = { fen: START_FEN_, sans: ['e4', 'c5', 'Qz9'] };
  const hard = [];
  check('spreadByPosition reports the refusal', spreadByPosition(broken, hard, pool, 90), false);
  check('…and adds nothing', hard.length, 0);
}

// --- 25d: moves the user has never been asked ----------------------------
//
// `propose` sees this as one more number in the same `min`: `unprovenPly`, the
// earliest user ply of the variation whose (position, move) the course has no
// record of ANYWHERE. Everything below is about how it composes with the two
// numbers that were already there.
console.log('\nnever asked (25d)');
{
  // The plain case: the range hides a move the user has never answered.
  const hidden = entry({ low: 4, hard: [], unprovenPly: 1 });
  check('an unrecorded move before the range ⇒ lower to its move pair',
    out(hidden), { dir: 'lower', ply: 0 });

  // NO LEAD IS SUBTRACTED. The lead gives context before a DIFFICULT move; the
  // whole of this pressure is "ask this move", and stacking the two compounds.
  km.lead = 2;
  const lead = entry({ low: 6, hard: [], unprovenPly: 4 });
  check('the lead does not apply to it', out(lead), { dir: 'lower', ply: 4 });
  km.lead = 0;

  // Difficulty still wins when it reaches further back — they are one `min`.
  const both = entry({ low: 6, hard: [move(1, 70)], unprovenPly: 5 });
  check('a difficult move earlier than it still decides',
    out(both), { dir: 'lower', ply: 0 });

  // …and the other way round.
  const deeper = entry({ low: 6, hard: [move(5, 70)], unprovenPly: 1 });
  check('an unrecorded move earlier than the difficult one decides',
    out(deeper), { dir: 'lower', ply: 0 });
}

console.log('\nnever asked, against 25b\'s restore');
{
  // THE CASE THIS RULE EXISTS TO BOUND. The range was lowered to ply 0, the
  // difficult move has recovered, and the baseline says it may go back to 4 —
  // but ply 1 has still never been answered anywhere in the course, so it may
  // not go back past it. `min(ideal, unproven)` is 1, which snaps onto the
  // range's current start: nothing is offered at all.
  const held = entry({ low: 0, baseLow: 4, hard: [], unprovenPly: 1 });
  check('an unrecorded move holds a lowered range where it is',
    out(held), { dir: '', ply: null });

  // A PARTIAL restore, exactly as a still-difficult move produces one: the
  // range comes back as far as the first move with no record and no further.
  const partial = entry({ low: 0, baseLow: 6, hard: [], unprovenPly: 5 });
  check('…and otherwise caps the restore at that move\'s pair',
    out(partial), { dir: 'raise', ply: 4 });

  // With the option off (or a variation the index could not read) the field is
  // absent, and every answer above is the one 25b gave before this existed.
  const off = entry({ low: 0, baseLow: 4, hard: [] });
  check('no unproven answer ⇒ 25b is unchanged', out(off), { dir: 'raise', ply: 4 });
}

// --- the index behind it -------------------------------------------------
//
// `buildProvenIndex` decides which plies carry that flag, and it is TWO
// sources: the feed's own `successes` for a move that has ever failed, and
// `level - 3` for one that never has — which, per §9.2, is exactly the number
// of sittings the user answered it in, because the reset branch never fires.
// Its other job is §9.4's cost rule: at floor 1 the count is a boolean and
// `unstudied` from getList answers it for free, so only a PART-learned
// variation is fetched; above 1 the values are needed and every studied
// variation is read.
const lessons = new Map();   // oid → the rows getLesson would serve
let lessonCalls = 0;
const idxEnv = {
  CloSan,
  km: { bid: '1', provenIdx: null },
  C: { chunkVars: 20, lessonMax: 2, lessonConc: 2 },
  CONFIG: { showGrade: { lessonPath: '/api/v1/getLesson' },
    autoPlay: { difficult: { ignoreWrongMoves: ['timeU'] } } },
  chessableCreds: () => ({ uid: '7', jwt: 'x' }),
  chessableHeaders: () => ({}),
  chessableApiUrl: (path, q) => path + '?oid=' + q.oid,
  chessableApiFetch: async (url) => {
    lessonCalls++;
    const oid = url.split('oid=')[1];
    if (!lessons.has(oid)) throw new Error('no lesson for ' + oid);
    return { lesson: { moves: lessons.get(oid) } };
  },
  sleepMs: async () => {},
  warn: () => {},
};

const buildIdx = new Function(...Object.keys(idxEnv), [
  'const SQ_FILES = "abcdefgh";',
  sliceDecl('squareName'),
  sliceDecl('START_FEN'),
  sliceDecl('cacheKey'),
  sliceDecl('RELAXED_SAN_RE'),
  sliceDecl('sanToUciRelaxed'),
  sliceDecl('sanToUci'),
  sliceDecl('fenAfterUci'),
  sliceDecl('walkVariation'),
  sliceDecl('sideOf'),
  sliceDecl('difficultRowCounts'),
  sliceDecl('difficultPlyIndex'),
  sliceDecl('posMoveKey'),
  sliceDecl('fetchLessonLevels'),
  sliceDecl('feedTimesByPly'),
  sliceDecl('buildProvenIndex'),
  'return buildProvenIndex;',
].join('\n'))(...Object.values(idxEnv));

// 1.e4 c5 2.Nf3 d6 — a Black course, so plies 1 and 3 are the user's.
const BLACK_LINE = ['e4', 'c5', 'Nf3', 'd6'];
const variation = (oid, unstudied, sans) => ({
  oid, name: oid, color: 'black', fen: START_FEN_, sans: sans || BLACK_LINE, unstudied,
});
/** getLesson's own shape: one row per move PAIR, `level_b` on a Black course. */
const pairRows = (sans, levels) => {
  const rows = [];
  for (let i = 0; i < sans.length; i += 2) {
    rows.push({ move_white: sans[i], move_black: sans[i + 1], level: null, level_b: levels[i / 2] });
  }
  return rows;
};
/** A feed row placed on a PAIR index, in the variation's own numbering. */
const feedFor = (oid, moveId, san, attempted, fails, timeouts) => Object.assign(
  feedRow('', san, attempted, fails, timeouts || 0),
  { openingId: oid, moveId: String(moveId), color: 'b' });
const timesOf = (idx, oid, ply) => {
  const p = (idx.vars.get(oid) || []).find((x) => x.ply === ply);
  return p ? (idx.times.get(p.key) || 0) : null;
};
const underFloor = (idx, oid, floor) => (idx.vars.get(oid) || [])
  .filter((p) => (idx.times.get(p.key) || 0) < floor).map((p) => p.ply);

(async () => {
  console.log('\nthe index behind it (25d), at "never asked"');
  {
    lessonCalls = 0;
    const idx = await buildIdx({ vars: [variation('a', 0), variation('b', 2)] }, [], 1);
    check('a fully studied variation counts each of its user moves once',
      [timesOf(idx, 'a', 1), timesOf(idx, 'a', 3)], [1, 1]);
    check('neither it nor an untouched one costs a lesson read', lessonCalls, 0);
    check('the untouched one is answered by POSITION, from the other line',
      underFloor(idx, 'b', 1), []);
    check('…and the index is not exact, so it can only answer this floor',
      idx.exact, false);
  }

  {
    // b now plays a second move nothing else in the course has ever answered.
    const idx = await buildIdx({
      vars: [variation('a', 0), variation('b', 2, ['e4', 'c5', 'Nf3', 'Nc6'])],
    }, [], 1);
    check('a move no variation has answered is under the floor',
      underFloor(idx, 'b', 1), [3]);
  }

  console.log('\nthe two sources, above "never asked"');
  {
    // EVERY studied variation is read now, because the counts are needed.
    lessonCalls = 0;
    lessons.set('a', pairRows(BLACK_LINE, [7, 4]));   // level 7 and 4 ⇒ 4 and 1 sittings
    const idx = await buildIdx({ vars: [variation('a', 0)] }, [], 3);
    check('the values are read', lessonCalls, 1);
    check('level − 3 is the count', [timesOf(idx, 'a', 1), timesOf(idx, 'a', 3)], [4, 1]);
    check('…so only the second move is under a floor of 3', underFloor(idx, 'a', 3), [3]);
    check('…and none of them under a floor of 1', underFloor(idx, 'a', 1), []);
    check('an index with the values answers any floor', idx.exact, true);
  }

  {
    // THE CASE THE COMBINED RULE EXISTS FOR. A move that failed once is RESET
    // to level 4, so the level alone says "answered once" however many times it
    // has really been asked — and the feed, which lists it precisely because it
    // failed, says 46. Without the feed half this move would be dragged back by
    // any floor above 1.
    lessonCalls = 0;
    lessons.set('a', pairRows(BLACK_LINE, [4, 9]));
    const rows = [feedFor('a', 0, 'c5', 56, 10, 6)];    // 46 clean answers
    const idx = await buildIdx({ vars: [variation('a', 0)] }, rows, 5);
    check('a failed move is counted from the feed, not from its reset level',
      timesOf(idx, 'a', 1), 46);
    check('…so a floor of 5 leaves it alone', underFloor(idx, 'a', 5), []);
    const levelOnly = await buildIdx({ vars: [variation('a', 0)] }, [], 5);
    check('…where the level alone would have dragged it back',
      underFloor(levelOnly, 'a', 5), [1]);
  }

  {
    // Counted per POSITION, summed across every card that plays it — the same
    // pooling 25c does, and the reason the per-card reading is degenerate.
    lessonCalls = 0;
    lessons.set('a', pairRows(BLACK_LINE, [4, 4]));
    lessons.set('b', pairRows(BLACK_LINE, [5, 4]));
    const idx = await buildIdx({ vars: [variation('a', 0), variation('b', 0)] }, [], 3);
    check('two cards of the same move add up', timesOf(idx, 'a', 1), 3);
    check('…and the pooled figure is what the floor sees', underFloor(idx, 'a', 3), [3]);
  }

  console.log('\nwhat the index refuses to claim');
  {
    // A lesson whose rows do not line up with the walk claims NOTHING, in
    // either direction: the variation joins `unknown` and is never proposed for.
    lessonCalls = 0;
    lessons.set('d', pairRows(['e4', 'e5', 'Nf3', 'Nc6'], [5, 5]));
    const idx = await buildIdx({ vars: [variation('d', 1)] }, [], 1);
    check('a lesson that does not match the line is refused', idx.unknown.has('d'), true);
    check('…and counts nothing', idx.times.size, 0);
  }

  {
    // `lessonMax` is the cap, and what it drops becomes `unknown` rather than
    // "barely asked" — a variation we did not read must not lower a range.
    lessonCalls = 0;
    for (const oid of ['e', 'f', 'g']) lessons.set(oid, pairRows(BLACK_LINE, [5, 5]));
    const idx = await buildIdx({ vars: ['e', 'f', 'g'].map((o) => variation(o, 1)) }, [], 1);
    check('the cap holds', lessonCalls, 2);
    check('…and what it drops is unknown, not under the floor', idx.capped, 1);
  }

  {
    // THE GUARD. Nothing answered anywhere ⇒ every move is under the floor ⇒
    // the answer would be "every range to ply 0". Reported as empty, not applied.
    const idx = await buildIdx({ vars: [variation('a', 2), variation('b', 2)] }, [], 1);
    check('a course with no record at all is empty', idx.empty, true);
    const some = await buildIdx({ vars: [variation('a', 0), variation('b', 2)] }, [], 1);
    check('…and one with any record is not', some.empty, false);
  }

  {
    // A variation that will not replay is unknown in both directions.
    const idx = await buildIdx({ vars: [variation('x', 0, ['e4', 'Qz9'])] }, [], 1);
    check('an unplayable line is unknown', idx.unknown.has('x'), true);
    check('…and counts nothing', idx.times.size, 0);
  }

  console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'all checks passed'));
  process.exit(failures ? 1 : 0);
})();
