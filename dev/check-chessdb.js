/**
 * dev/check-chessdb.js — executes the REAL parseCdbAnswer / cdbEvalText,
 * sliced out of content/lichessable.js, against ChessDB answers in the exact
 * shape the live API returns (captured 2026-08-26; see DESIGN-chessdb.md §11).
 *
 * Why this exists: every failure mode in this pair is SILENT.
 *
 *  - The score bands. A mate is 30000 - distance and a tablebase result is
 *    ~25000 - DTZ, so a plain centipawn read prints "+249.78" for a rook
 *    endgame and "+299.99" for a mate in 1. Both are perfectly plausible
 *    numbers in a column of evals; nothing throws.
 *  - The PERSPECTIVE. CDB scores are the MOVER's, the panel is White's. Get it
 *    wrong and every Black-to-move position is inverted — still a tidy column
 *    of numbers, every one of them backwards.
 *  - The BOOK flag. `learn=1` scores every legal move but computes the unknown
 *    ones on the spot, and nothing INSIDE that answer distinguishes the two
 *    (§3.3: the fill-ins routinely carry a higher `note` than the real entries
 *    beside them). Only the second, `learn=0` answer can say. Lose that and the
 *    panel presents guesses as book evals.
 *  - The "??" type check. An unelaborated move's score is the literal STRING
 *    "??", and `typeof x === 'number'` is the only thing between that and
 *    "NaN" in the table — a truthiness test also wrongly drops a real 0.
 *
 * It also asserts the WORKER's action allow-list, read straight out of
 * background.js — `queue` and `store` are this API's two WRITES and must stay
 * unreachable, and a hidden automated tab cannot exercise the `querypv` path
 * at all.
 *
 * Since v0.129.0 it also covers the green<->red RAMP, which fails in the same
 * silent way and for the same reason. `cdbEvalText` returns the tone ALONGSIDE
 * the text, so the check asserts the two AGREE across the whole score range and
 * in both perspectives rather than case by case — a perspective bug in one band
 * only is exactly what a hand-picked list of cases misses.
 *
 * Run a control by pointing CLO_SRC at a copy with the change reverted and
 * confirming it FAILS. Controls run 2026-08-27, each failing on exactly its own
 * assertions and no others:
 *   * the perspective pinned to White                  → 4 fail
 *   * the mate band disabled                           → 4 fail
 *   * a truthiness test in place of `typeof score === 'number'`
 *                                                      → 3 fail, including "a
 *     score of 0 counts as book", which is the one a truthiness bug gets wrong
 *     in both directions at once
 *   * `cdbTone(entry.score)` for `cdbTone(signed)`, i.e. the tone losing the
 *     perspective flip                                 → 8 fail, six of them
 *     the range sweep
 *   * the mate/tablebase steps collapsed into the ordinary ramp
 *                                                      → 6 fail
 */
'use strict';
const { sliceDecl, SRC_PATH } = require('./slice-source.js');

// The two functions read CONFIG.chessdb for the band boundaries; the slice is
// executed against the same numbers the shipped file declares.
const CONFIG = { chessdb: {
  mateBand: 29000, mateBase: 30000, decisiveBand: 20000,
  toneEdge: 50, toneStrong: 150,
} };

const src = [
  sliceDecl('parseCdbAnswer'),
  sliceDecl('cdbEvalText'),
  sliceDecl('cdbTone'),
  'return { parseCdbAnswer, cdbEvalText };',
].join('\n');
// eslint-disable-next-line no-new-func
const { parseCdbAnswer, cdbEvalText } = new Function('CONFIG', src)(CONFIG);

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log('FAIL ' + label + '\n       got  ' + g + '\n       want ' + w);
};

// --- 1) the two-answer fold ------------------------------------------------
// Real shape, Italian after 3.Bc4 (Black to move): learn=1 scores all of them,
// learn=0 knows only Nf6 and Bc5. Verified live 2026-08-26.
const full = {
  status: 'ok',
  moves: [
    { uci: 'g8f6', san: 'Nf6', score: 0, rank: 2, note: '! (33-06)' },
    { uci: 'f8c5', san: 'Bc5', score: -1, rank: 2, note: '! (33-13)' },
    { uci: 'd8h4', san: 'Qh4', score: -739, rank: 0, note: '? (32-01)' },
    { uci: 'c6d4', san: 'Nd4', score: -144, rank: 0, note: '? (31-01)' },
  ],
};
const book = {
  status: 'ok',
  moves: [
    { uci: 'g8f6', san: 'Nf6', score: 0, rank: 2, note: '! (33-06)' },
    { uci: 'f8c5', san: 'Bc5', score: -1, rank: 2, note: '! (33-13)' },
    // learn=0 still LISTS every move — the unelaborated ones just carry "??".
    { uci: 'd8h4', san: 'Qh4', score: '??', rank: 0, note: '? (??-??)' },
    { uci: 'c6d4', san: 'Nd4', score: '??', rank: 0, note: '? (??-??)' },
  ],
};
const folded = parseCdbAnswer(full, book);
eq('all four moves survive the fold', folded.moves.size, 4);
eq('a learn=0 number marks the move as book', folded.moves.get('g8f6').book, true);
eq('a learn=0 "??" does NOT mark it as book', folded.moves.get('d8h4').book, false);
eq('a fill-in keeps its learn=1 score', folded.moves.get('d8h4').score, -739);
// The trap this guards: the fill-ins' notes are as rich as the book entries'.
eq('the note cannot be used as the book signal',
  folded.moves.get('c6d4').note.includes('??'), false);

// A score of 0 is a REAL eval and must survive a truthiness-shaped bug.
const zero = parseCdbAnswer(
  { status: 'ok', moves: [{ uci: 'e2e4', san: 'e4', score: 0, note: '! (20-05)' }] },
  { status: 'ok', moves: [{ uci: 'e2e4', san: 'e4', score: 0, note: '! (20-05)' }] });
eq('score 0 is kept', zero.moves.size, 1);
eq('score 0 counts as book', zero.moves.get('e2e4').book, true);

// --- 2) statuses -----------------------------------------------------------
eq('unknown yields no moves', parseCdbAnswer({ status: 'unknown' }, null).moves.size, 0);
eq('invalid board yields no moves',
  parseCdbAnswer({ status: 'invalid board' }, null).moves.size, 0);
eq('a null answer does not throw', parseCdbAnswer(null, null).moves.size, 0);
// The book half failing is survivable: evals still show, all as estimates.
const noBook = parseCdbAnswer(full, { status: 'unknown' });
eq('no book answer still yields evals', noBook.moves.size, 4);
eq('no book answer marks everything an estimate', noBook.moves.get('g8f6').book, false);

// --- 3) the score bands ----------------------------------------------------
const txt = (score, note, whiteToMove) =>
  cdbEvalText({ score, note: note || '', san: '', book: true }, whiteToMove).text;

eq('centipawns, White to move', txt(42, '! (33-06)', true), '+0.4');
eq('centipawns, small positive', txt(8, '! (33-06)', true), '+0.1');
eq('centipawns, sign kept', txt(-144, '? (31-01)', true), '-1.4');
// The perspective flip: the SAME mover-score reads opposite on Black's move.
eq('centipawns, Black to move inverts', txt(-144, '? (31-01)', false), '+1.4');
eq('a mover advantage for Black is negative for White', txt(200, '? (31-01)', false), '-2.0');

// Mate: 30000 - distance. Live: mate in 1 = 29999.
eq('mate in 1, White to move', txt(29999, '! (00-00)', true), '#1');
eq('mate in 3', txt(29997, '! (00-00)', true), '#3');
eq('being mated, White to move', txt(-29997, '? (00-00)', true), '#-3');
// Same score, Black to move: Black is mating, so it is White who is lost.
eq('mate for Black reads as negative', txt(29997, '! (00-00)', false), '#-3');

// Tablebase: the lettered note is the authority. Live: KRK win in 22 = 24978.
eq('tablebase win for White', txt(24978, '! (W-0022)', true), '+∞');
eq('tablebase loss for the mover, White to move', txt(-24973, '! (L-0027)', true), '−∞');
// Mover is Black and Black is winning -> negative from White's side.
eq('tablebase win for Black', txt(24978, '! (W-0022)', false), '−∞');
eq('tablebase draw', txt(0, '! (D-0000)', true), '0.0');
// The whole point of the bands: none of these may come out as centipawns.
for (const [score, note] of [[29999, '! (00-00)'], [24978, '! (W-0022)'], [-24973, '! (L-0027)']]) {
  const t = txt(score, note, true);
  if (/^[+-]?\d+\.\d$/.test(t) && Math.abs(parseFloat(t)) > 100) {
    fail++; console.log('FAIL a decisive score printed as centipawns: ' + t);
  } else pass++;
}

// --- 3b) the green<->red ramp (v0.129.0) -----------------------------------
// The tone is computed in cdbEvalText, off the same `signed` value the digits
// are, precisely so it cannot disagree with the sign printed beside it. That
// is the one failure mode of a coloured eval that is entirely silent: a tidy
// column of numbers, every colour backwards, nothing thrown. It is WHITE's
// perspective for the same reason the digits are.
const tone = (score, note, whiteToMove) =>
  cdbEvalText({ score, note: note || '', san: '', book: true }, whiteToMove).tone;

eq('a clear White edge is green', tone(180, '! (33-06)', true), 'w2');
eq('a slight White edge is the mild step', tone(80, '! (33-06)', true), 'w1');
eq('equality has no tone at all', tone(20, '! (33-06)', true), 'eq');
eq('dead equal has no tone', tone(0, '! (33-06)', true), 'eq');
eq('a slight Black edge is the mild step', tone(-80, '? (33-06)', true), 'b1');
eq('a clear Black edge is red', tone(-180, '? (33-06)', true), 'b2');
// The band edges themselves: toneEdge/toneStrong are inclusive at the top.
eq('exactly at the edge takes the mild step', tone(50, '! (33-06)', true), 'w1');
eq('one below the edge is equal', tone(49, '! (33-06)', true), 'eq');
eq('exactly at the strong edge takes the full step', tone(150, '! (33-06)', true), 'w2');

// THE PERSPECTIVE, asserted directly — the same mover-score colours opposite
// on Black's move, exactly as its digits flip sign.
eq('a mover edge for Black is RED', tone(180, '! (33-06)', false), 'b2');
eq('a mover loss for Black is GREEN', tone(-180, '? (33-06)', false), 'w2');

// The decisive ends: mate and tablebase take the loudest step of the ramp.
eq('mate for White is the decisive step', tone(29999, '! (00-00)', true), 'w3');
eq('being mated is the decisive step the other way', tone(-29997, '? (00-00)', true), 'b3');
eq('mate for Black reads decisive-for-Black', tone(29997, '! (00-00)', false), 'b3');
eq('a tablebase win for White', tone(24978, '! (W-0022)', true), 'w3');
eq('a tablebase win for Black', tone(24978, '! (W-0022)', false), 'b3');
eq('a tablebase draw is equal', tone(0, '! (D-0000)', true), 'eq');
eq('a decisive score with no distance', tone(22000, '! (00-00)', true), 'w3');

// And the property that makes the whole thing safe: THE SIGN AND THE TONE
// NEVER DISAGREE. Asserted over the range rather than case by case, since a
// perspective bug in one band only is exactly what a hand-picked list misses.
for (const wtm of [true, false]) {
  for (const score of [-29999, -24978, -22000, -900, -180, -80, -20, 0,
                       20, 80, 180, 900, 22000, 24978, 29999]) {
    const shown = cdbEvalText({ score, note: '', san: '', book: true }, wtm);
    const positive = /^[+#]/.test(shown.text) && !/^#-/.test(shown.text);
    const negative = /^[-−]/.test(shown.text) || /^#-/.test(shown.text);
    const bad = (positive && shown.tone[0] === 'b') || (negative && shown.tone[0] === 'w') ||
      (shown.tone === 'eq' && Math.abs(score) >= CONFIG.chessdb.toneEdge);
    if (bad) {
      fail++;
      console.log('FAIL tone disagrees with the digits: score ' + score +
        ' wtm=' + wtm + ' -> "' + shown.text + '" tone ' + shown.tone);
    } else pass++;
  }
}

// --- 4) the estimate tooltip ----------------------------------------------
const est = cdbEvalText({ score: -739, note: '? (32-01)', san: 'Qh4', book: false }, false);
eq('an estimate still produces a number', est.text, '+7.4');

// --- 5) the castling join --------------------------------------------------
// The one failure here that SUCCEEDS quietly. Lichess spells castling
// king-takes-rook ("e1h1"); ChessDB spells it "e1g1", which is also what
// CloSan produces. So the panel keys the CDB map by ChessDB's uci and resolves
// each explorer row's SAN through sanToUci into that spelling. A raw compare
// misses exactly the castling rows and works everywhere else.
// Real CDB entry, captured 2026-08-26 (Italian, White to move, both sides can
// castle): {"uci":"e1g1","san":"O-O","score":27,"note":"! (34-03)"}.
const joinSrc = [
  sliceDecl('RELAXED_SAN_RE'),
  sliceDecl('sanToUciRelaxed'),
  sliceDecl('sanToUci'),
  'return { sanToUci };',
].join('\n');
const SQ = 'abcdefgh';
// eslint-disable-next-line no-new-func
const { sanToUci } = new Function('CloSan', 'squareName', joinSrc)(
  require('../engine/san.js'), (i) => SQ[i & 7] + ((i >> 3) + 1));

const castleFen = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2PP1N2/PP3PPP/RNBQK2R w KQkq - 0 6';
const castlePos = require('../engine/san.js').parseFen(castleFen);
const cdbCastle = parseCdbAnswer(
  { status: 'ok', moves: [{ uci: 'e1g1', san: 'O-O', score: 27, note: '! (34-03)' }] },
  { status: 'ok', moves: [{ uci: 'e1g1', san: 'O-O', score: 27, note: '! (34-03)' }] });

const resolved = sanToUci(castlePos, 'O-O');
eq('sanToUci gives ChessDB’s castling spelling', resolved, 'e1g1');
eq('the resolved uci finds the CDB entry', Boolean(cdbCastle.moves.get(resolved)), true);
// And the trap itself, asserted so it cannot quietly stop being one:
eq('Lichess’s raw castling uci would MISS', cdbCastle.moves.has('e1h1'), false);
// A non-castling move must resolve identically in both spellings.
eq('an ordinary move resolves to the same uci', sanToUci(castlePos, 'Bg5'), 'c1g5');

// --- 6) the worker's action allow-list -------------------------------------
// `queue` and `store` are this API's two WRITES: they spend a volunteer
// network's compute (DESIGN-chessdb.md §2.4 — a queued position came back
// analysed ~25 minutes later). The guard in background.js is therefore an
// ALLOW-LIST of the read actions rather than a block-list of the writes, so a
// future action nobody has heard of is refused by default. Asserted here
// because the worker cannot be required (top-level chrome.* calls) and because
// a hidden automated tab cannot exercise the querypv path at all.
const bg = require('fs').readFileSync(
  require('path').join(__dirname, '..', 'background.js'), 'utf8');
const guardSrc = (bg.match(/if \(!(\/\[\?&\]action=[^\n]*?)\.test\(url\)\) \{/) || [])[1];
if (!guardSrc) {
  fail++; console.log('FAIL could not find the chessdb action guard in background.js');
} else {
  // eslint-disable-next-line no-eval
  const re = eval(guardSrc);
  const allow = (u) => re.test(u);
  const base = 'https://www.chessdb.cn/cdb.php?';
  eq('queryall is allowed', allow(base + 'action=queryall&board=x'), true);
  eq('querypv is allowed', allow(base + 'action=querypv&board=x'), true);
  eq('queue is REFUSED', allow(base + 'action=queue&board=x'), false);
  eq('store is REFUSED', allow(base + 'action=store&board=x&move=x'), false);
  eq('an unknown action is REFUSED', allow(base + 'action=whatever&board=x'), false);
  // The prefix trick: "queryallish" must not slip through a loose boundary.
  eq('a lookalike action is REFUSED', allow(base + 'action=queryallx&board=x'), false);
  eq('queryall as the last param is allowed', allow(base + 'board=x&action=queryall'), true);
}

console.log('\n' + SRC_PATH);
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
