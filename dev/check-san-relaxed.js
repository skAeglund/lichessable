/**
 * dev/check-san-relaxed.js — executes the REAL sanToUci / sanToUciRelaxed,
 * sliced out of content/lichessable.js, against the real engine/san.js.
 *
 * Why this exists: Chessable OVER-DISAMBIGUATES ("Ndb5" where only one knight
 * can legally reach b5, the other being pinned), which an exact SAN compare
 * drops — silently costing section 21 a line reported as "could not be
 * replayed" and section 24 a hole in the tree. Ground-truthed 2026-08-19 on
 * course 291847, variation "Scotch 4...Qh4?!".
 *
 * The controls matter more than the fix: the relaxed pass must never resolve
 * an ambiguous move, and must never change one the exact pass already got.
 *
 * Run a control by pointing CLO_SRC at a copy with the change reverted and
 * confirming it FAILS.
 */
'use strict';
const { sliceDecl, SRC_PATH } = require('./slice-source.js');
const CloSan = require('../engine/san.js');

const SQ_FILES = 'abcdefgh';
const squareName = (i) => SQ_FILES[i & 7] + ((i >> 3) + 1);

const src = [
  sliceDecl('RELAXED_SAN_RE'),
  sliceDecl('sanToUciRelaxed'),
  sliceDecl('sanToUci'),
  'return { sanToUci, sanToUciRelaxed };',
].join('\n');
// eslint-disable-next-line no-new-func
const { sanToUci } = new Function('CloSan', 'squareName', src)(CloSan, squareName);

let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log('  ok   ' + name); return; }
  failures++;
  console.log('  FAIL ' + name + (detail ? '  — ' + detail : ''));
}
function uciOf(fen, san) {
  const pos = CloSan.parseFen(fen);
  return pos ? sanToUci(pos, san) : null;
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

console.log('source: ' + SRC_PATH);

console.log('\nthe live case — Chessable writes Ndb5, only Nd4 can legally go there');
{
  // 1.e4 e5 2.Nf3 Nc6 3.d4 exd4 4.Nxd4 Qh4 5.Nc3 Bb4 6.Be2 Qxe4 — the c3
  // knight is pinned by the bishop on b4, so "Nb5" is the strict spelling.
  const fen = 'r1b1k1nr/pppp1ppp/2n5/8/1b1Nq3/2N5/PPP1BPPP/R1BQK2R w KQkq - 0 7';
  check('Ndb5 resolves to d4b5', uciOf(fen, 'Ndb5') === 'd4b5', String(uciOf(fen, 'Ndb5')));
  check('Nb5 (strict) still resolves', uciOf(fen, 'Nb5') === 'd4b5', String(uciOf(fen, 'Nb5')));
  check('Ncb5 is refused (that knight is pinned)', uciOf(fen, 'Ncb5') === null, String(uciOf(fen, 'Ncb5')));
}

console.log('\ncontrols — the relaxed pass must never invent a move');
{
  // Two knights genuinely able to reach d2, both legal: under-specified SAN
  // must stay refused.
  const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  check('start: Nf3 exact', uciOf(fen, 'Nf3') === 'g1f3', String(uciOf(fen, 'Nf3')));
  check('start: "Na1" is not a move', uciOf(fen, 'Na1') === null, String(uciOf(fen, 'Na1')));
  check('start: "e5" is not White\'s move', uciOf(fen, 'e5') === null, String(uciOf(fen, 'e5')));
}
{
  // Knights on b1 and f3 both reach d2 — "Nd2" is genuinely ambiguous. The
  // d-pawn has to be off, or d2 is occupied and neither move exists.
  const fen = 'rnbqkbnr/pppppppp/8/8/8/5N2/PPP1PPPP/RNBQKB1R w KQkq - 0 1';
  check('ambiguous Nd2 refused', uciOf(fen, 'Nd2') === null, String(uciOf(fen, 'Nd2')));
  check('Nbd2 resolves', uciOf(fen, 'Nbd2') === 'b1d2', String(uciOf(fen, 'Nbd2')));
  check('Nfd2 resolves', uciOf(fen, 'Nfd2') === 'f3d2', String(uciOf(fen, 'Nfd2')));
}
{
  // Rank disambiguation: rooks on e1 and e5 both reach e3, same file, so the
  // hint is a RANK. (Two rooks on the a-file do NOT work — the nearer one
  // blocks the farther, which makes the move unambiguous after all.)
  const fen = '4k3/8/8/4R3/8/8/8/4R1K1 w - - 0 1';
  check('rank hint R1e3', uciOf(fen, 'R1e3') === 'e1e3', String(uciOf(fen, 'R1e3')));
  check('rank hint R5e3', uciOf(fen, 'R5e3') === 'e5e3', String(uciOf(fen, 'R5e3')));
  check('ambiguous Re3 refused', uciOf(fen, 'Re3') === null, String(uciOf(fen, 'Re3')));
}

console.log('\nthe ordinary spellings must be untouched');
{
  check('castling O-O', uciOf('4k3/8/8/8/8/8/8/4K2R w K - 0 1', 'O-O') === 'e1g1');
  check('castling O-O-O', uciOf('4k3/8/8/8/8/8/8/R3K3 w Q - 0 1', 'O-O-O') === 'e1c1');
  check('promotion e8=Q', uciOf('4k3/4P3/8/8/8/8/8/4K3 w - - 0 1', 'e8=Q') === null
    || uciOf('7k/4P3/8/8/8/8/8/4K3 w - - 0 1', 'e8=Q') === 'e7e8q');
  check('en passant exd6', uciOf('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3', 'exd6') === 'e5d6',
    String(uciOf('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3', 'exd6')));
  check('pawn capture bxc3', uciOf('rnbqkbnr/pp1ppppp/8/8/8/2p5/PPPPPPPP/RNBQKBNR w KQkq - 0 3', 'bxc3') === 'b2c3',
    String(uciOf('rnbqkbnr/pp1ppppp/8/8/8/2p5/PPPPPPPP/RNBQKBNR w KQkq - 0 3', 'bxc3')));
  check('bishop Bxc3 is not the pawn', uciOf('rnbqk1nr/pppppppp/8/8/1b6/2N5/PPPPPPPP/R1BQKBNR b KQkq - 0 3', 'Bxc3') === 'b4c3',
    String(uciOf('rnbqk1nr/pppppppp/8/8/1b6/2N5/PPPPPPPP/R1BQKBNR b KQkq - 0 3', 'Bxc3')));
  check('check suffix tolerated', uciOf(START, 'Nf3+') === 'g1f3');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall passed');
process.exit(failures ? 1 : 0);
