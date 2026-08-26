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
 * Run a control by pointing CLO_SRC at a copy with the change reverted and
 * confirming it FAILS.
 */
'use strict';
const { sliceDecl, SRC_PATH } = require('./slice-source.js');

// The two functions read CONFIG.chessdb for the band boundaries; the slice is
// executed against the same numbers the shipped file declares.
const CONFIG = { chessdb: { mateBand: 29000, mateBase: 30000, decisiveBand: 20000 } };

const src = [
  sliceDecl('parseCdbAnswer'),
  sliceDecl('cdbEvalText'),
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
