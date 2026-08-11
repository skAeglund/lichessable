/**
 * Executable checks for section 18's line reading — the branch walk, the
 * combining of a comment's two answers, and PLAYING the alternative.
 *
 *   node dev/check-continuation-lines.js
 *
 * WHY THIS EXISTS. `node --check` cannot see a property read on undefined, and
 * the alternative arm has now shipped broken twice on exactly that: v0.67.0
 * introduced `applyMove(played)` with no resolved `mv` and it threw on every
 * alternative for six weeks, and v0.100.0 shipped a ReferenceError in section
 * 23's key handler for the same class of reason. CLAUDE.md's rule — "an
 * extraction in this file is not shippable on static checks alone" — needs
 * something that actually RUNS, and this is it.
 *
 * HOW. `dev/slice-source.js` lifts each function's real text out of
 * content/lichessable.js by brace matching and it is evaluated against the real
 * engine/san.js. Nothing here is a transcription of the source, and it cannot
 * drift from it: a rename or a signature change breaks the slice loudly.
 * The DOM-facing calls in `tryMove` are stubbed and RECORDED.
 *
 * Point CLO_SRC at a modified copy to run a control:
 *
 *   node -e "…revert the fix in a copy…"
 *   CLO_SRC=/tmp/broken.js node dev/check-continuation-lines.js   # must FAIL
 *
 * A control that cannot fail proves nothing — an early version of this file
 * overwrote CLO_SRC and silently read the good source, so the control passed
 * against a copy with the bug still in it. Check the control fails.
 */
const path = require('path');
const { sliceDecl } = require('./slice-source.js');
const CloSan = require(path.join(__dirname, '..', 'engine', 'san.js'));

const NAMES = ['SQ_FILES', 'squareName', 'squareIndexOf', 'fenAfterUci', 'sanToUci',
  'cacheKey', 'parseMoveNumber', 'fenMatchesNumber', 'moveFits', 'walkLine',
  'branchLines', 'isBlunderAnnot', 'quizzableLines', 'dropAmbiguous',
  'mergeUserAlternatives', 'withSource'];
let LOG = [];
const M = new Function('CloSan', 'log',
  NAMES.map(sliceDecl).join('\n\n') + '\n;return {' + NAMES.join(',') + '};'
)(CloSan, (...a) => LOG.push(a.join(' ')));

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  console.log((ok ? '  pass  ' : '  FAIL  ') + name + (ok ? '' : '   -> ' + detail));
  ok ? pass++ : fail++;
};

// --- positions --------------------------------------------------------------
const START_POS = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// White to play 15.Nxd4; BOTH black rooks see e8, which is what makes the
// reported comment's "Rfe8" carry its file disambiguation.
const MID = 'r4rk1/pb1q1ppp/2n2n2/2p5/3pP3/2N2N2/PPP1BPPP/R1BQ1RK1 w - - 0 15';
const FORK = 'r4rk1/pb1q1ppp/2n2n2/8/3pP3/1PN5/P1P1BPPP/R1BQ1RK1 b - - 0 16';
// After 1.g3 d5 — same position as 1.Nf3 d5 2.g3 by the other move order, and
// NOT via a double pawn push, whose ep square is in cacheKey and would stop the
// two being recognised as one position at all.
const AFTER_G3 = 'rnbqkbnr/ppp1pppp/8/3p4/8/6P1/PPPPPP1P/RNBQKBNR w KQkq - 0 2';
// 1.e4 c5 2.Nf3 Nc6, White to play 3.d4 — the reported v0.101.1 line's anchor.
const SICILIAN = 'r1bqkbnr/pp1ppppp/2n5/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 4';

/** "15.Nxd4" -> the move object a clickable span would yield. */
const mv = (text) => {
  const t = text.trim();
  const printed = M.parseMoveNumber(t);
  const san = t.replace(/^\d+\s*(\.{3}|…|\.)\s*/, '');
  const annot = (/([!?]+)$/.exec(san) || ['', ''])[1];
  return { san: san.slice(0, san.length - annot.length), annot, printed };
};

/** One printed comment line -> the resolved entry the quiz would get. */
function group(key, fen, text) {
  const moves = text.split(/\s+/).filter(Boolean).map(mv);
  const walk = M.walkLine(fen, moves);
  if (!walk) return null;
  return {
    key, startFen: fen, plies: walk.plies, before: walk.before,
    branched: walk.branched, branches: M.branchLines({ key }, walk, fen),
    truncated: false, label: moves.map((m) => m.san + m.annot).join(' '),
  };
}

function run(entries, userColor, planMoves, planFen) {
  LOG = [];
  const lines = [];
  for (const e of entries) {
    if (!e) return { error: 'a line did not walk - the test position is wrong' };
    for (const l of M.quizzableLines(e, userColor, 'continuation')) lines.push(l);
  }
  const fens = [], plies = [];
  if (planMoves) {
    let f = planFen;
    for (const m of planMoves.split(/\s+/).filter(Boolean).map(mv)) {
      const uci = M.sanToUci(CloSan.parseFen(f), m.san);
      fens.push(f); plies.push({ san: m.san });
      f = M.fenAfterUci(f, uci);
    }
    fens.push(f);
  }
  return { kept: M.dropAmbiguous(lines, { plies }, fens, userColor), log: LOG.slice() };
}

// ===========================================================================
// 1. Combining (mergeUserAlternatives / dropAmbiguous) — DESIGN §7.6, §7.6a
// ===========================================================================
console.log('\ncombining a comment\'s two answers');

const CASES = [
  { name: 'the reported shorthand case, no continuation',
    entries: [['0', MID, '15.Nxd4 cxd4 16.b3 Qf5 16...Rfe8']], user: 'b',
    expect: { kept: 1, combined: true, label: 'Nxd4 cxd4 b3 Qf5/Rfe8', altAt: 3, altPlies: [[]] } },
  { name: 'shorthand branch WITH a continuation',
    entries: [['0', MID, '15.Nxd4 cxd4 16.b3 Qf5 16...Rfe8 17.Bd3']], user: 'b',
    expect: { kept: 1, combined: true, altAt: 3, altPlies: [['Bd3']] } },
  { name: 'PARTIAL shorthand - the author repeats 16.b3 before forking',
    entries: [['0', MID, '15.Nxd4 cxd4 16.b3 Qf5 16.b3 Rfe8']], user: 'b',
    expect: { kept: 1, combined: true, altAt: 3, altPlies: [[]] } },
  { name: 'REGRESSION: two full-form lines, same start, same fork index',
    entries: [['0', START_POS, '1.e4 e5 2.Nf3'], ['1', START_POS, '1.e4 c5 2.Nf3']], user: 'b',
    expect: { kept: 1, combined: true, baseKey: '0', altAt: 1, altPlies: [['Nf3']] } },
  { name: 'order independence - the shorthand branch read FIRST',
    entries: [['0', FORK, '16...Rfe8'], ['1', MID, '15.Nxd4 cxd4 16.b3 Qf5']], user: 'b',
    expect: { kept: 1, combined: true, baseKey: '1', altAt: 3 } },
  { name: 'REFUSED: a transposition (different start, different fork index)',
    entries: [['0', START_POS, '1.Nf3 d5 2.g3 Nf6'], ['1', AFTER_G3, '2.Nf3 e6']], user: 'b',
    expect: { kept: 0 } },
  { name: 'REFUSED: the mainline answers the position differently',
    entries: [['0', MID, '15.Nxd4 cxd4 16.b3 Qf5 16...Rfe8']], user: 'b',
    plan: { fen: MID, moves: '15.Nxd4 cxd4 16.b3 h6' }, expect: { kept: 0 } },
  { name: 'REGRESSION: a "?" on the shorthand branch drops only that branch',
    entries: [['0', MID, '15.Nxd4 cxd4 16.b3 Qf5 16...Rfe8?']], user: 'b',
    expect: { kept: 1, combined: false, label: 'Nxd4 cxd4 b3 Qf5' } },
  { name: 'white user - the fork is an OPPONENT choice, nothing to combine',
    entries: [['0', MID, '15.Nxd4 cxd4 16.b3 Qf5 16...Rfe8']], user: 'w',
    expect: { kept: 1, combined: false } },
  // Chessable's OWN markup, read off /variation/70382641/ 2026-08-11 with the
  // comment "(2. h3 Nc6 alt. 2...e6)" written onto Nf3_w_2: "alt." renders as
  // PROSE between the spans and all three moves stay in ONE group (2.0.0/1/2).
  { name: 'live-derived: (2. h3 Nc6 alt. 2...e6) off the real page',
    entries: [['2.0', 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2',
      '2.h3 Nc6 2...e6']], user: 'b',
    expect: { kept: 1, combined: true, label: 'h3 Nc6/e6', altAt: 1 } },
];

for (const c of CASES) {
  const r = run(c.entries.map((e) => group(...e)), c.user,
    c.plan && c.plan.moves, c.plan && c.plan.fen);
  const kept = r.kept || [], e = c.expect, one = kept[0], errs = [];
  if (r.error) errs.push(r.error);
  if (kept.length !== e.kept) errs.push('kept ' + kept.length + ', expected ' + e.kept);
  if (e.combined !== undefined && one && (one.altAt !== undefined) !== e.combined) {
    errs.push('combined=' + (one.altAt !== undefined));
  }
  if (e.label && one && one.label !== e.label) errs.push('label "' + one.label + '"');
  if (e.altAt !== undefined && one && one.altAt !== e.altAt) errs.push('altAt ' + one.altAt);
  if (e.baseKey && one && one.key !== e.baseKey) errs.push('base key "' + one.key + '"');
  if (e.altPlies && one && one.altAt !== undefined) {
    const got = one.plies[one.altAt].alts.map((a) => a.plies.map((p) => p.san));
    if (JSON.stringify(got) !== JSON.stringify(e.altPlies)) {
      errs.push('alt continuations ' + JSON.stringify(got));
    }
    for (const a of one.plies[one.altAt].alts) {
      for (const p of a.plies) {
        if (!p.src || p.src.line !== a.src.line) errs.push('alt ply ' + p.san + ' has the wrong src line');
      }
    }
  }
  check(c.name, !errs.length, errs.join('; '));
}

// ===========================================================================
// 2. PLAYING the alternative — the real tryMove(). DESIGN §7.6a.
// ===========================================================================
console.log('\nplaying the alternative (real tryMove)');

const entry = group('3.0', SICILIAN, '4.d4 cxd4 5.Nxd4 g6 5...Nxd4');
const line = (run([entry], 'b').kept || [])[0];
if (!line || line.altAt === undefined) {
  check('the reported line combines at all', false, 'not combined - the rest cannot run');
} else {
  const applied = [];
  const cr = { mode: 'quiz', line, path: null, plyIdx: line.altAt, sel: 'x',
    pos: CloSan.parseFen(line.before[line.altAt]), attempts: 0, hint: false,
    userColor: 'b', pieces: new Map() };
  const scope = {
    cr, CloSan, log: (...a) => LOG.push(a.join(' ')), squareName: M.squareName,
    anPlay: () => { throw new Error('anPlay must not be called in quiz mode'); },
    linePath: () => cr.path || line.plies,
    currentPly: () => {
      const ply = scope.linePath()[cr.plyIdx];
      if (!ply) return null;
      const m = CloSan.uciToMove(cr.pos, ply.uci);
      return m ? { ...ply, mv: m } : null;
    },
    // The real applyMove's first statements — exactly where it threw.
    applyMove: (ply) => {
      const m = ply.mv;
      if (!m) throw new TypeError("Cannot read properties of undefined (reading 'from')");
      void m.from; void m.to;
      cr.pos = CloSan.makeMove(cr.pos, m);
      applied.push({ san: ply.san, uci: ply.uci });
    },
    flashSquare: () => {}, step: () => {}, syncUi: () => {}, C: { wrongHintAfter: 3 },
  };
  const tryMove = new Function(...Object.keys(scope),
    sliceDecl('tryMove') + '\n;return tryMove;')(...Object.values(scope));

  const altUci = line.plies[line.altAt].alts[0].uci;
  let thrown = null;
  try { tryMove(CloSan.uciToMove(cr.pos, altUci)); } catch (err) { thrown = err; }
  check('no exception on the alternative', !thrown, thrown && thrown.message);
  check('the ALTERNATIVE was applied', applied.length === 1 && applied[0].uci === altUci,
    JSON.stringify(applied));
  check('plyIdx advanced past the fork', cr.plyIdx === line.altAt + 1, cr.plyIdx);
  check('the path was re-pathed to the answer given',
    Array.isArray(cr.path) && cr.path.length === line.altAt + 1,
    cr.path && cr.path.map((p) => p.san).join(' '));
  check('not counted as a wrong guess', cr.attempts === 0, cr.attempts);

  cr.pos = CloSan.parseFen(line.before[line.altAt]);
  cr.plyIdx = line.altAt; cr.path = null; applied.length = 0;
  const primUci = line.plies[line.altAt].uci;
  let thrown2 = null;
  try { tryMove(CloSan.uciToMove(cr.pos, primUci)); } catch (err) { thrown2 = err; }
  check('the PRIMARY answer still plays',
    !thrown2 && applied.length === 1 && applied[0].uci === primUci,
    thrown2 ? thrown2.message : JSON.stringify(applied));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
