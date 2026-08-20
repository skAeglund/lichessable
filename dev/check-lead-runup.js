/**
 * Executable checks for the key-move lead-in's SHARED-RUN-UP rule (section 23c,
 * DESIGN-key-move-leadin.md §5).
 *
 *   node dev/check-lead-runup.js
 *
 * WHY THIS EXISTS. The rule is a two-variable state machine — `leadSeen` (what
 * the user has watched) and `leadDiv` (where the branch point was) — whose whole
 * behaviour is a SEQUENCE of variations, and every interesting case is the third
 * or fourth one in a chapter. That is not something a live session shows you
 * cheaply (a Key Moves session, four sibling variations, one console line each),
 * and it is exactly the shape of thing `node --check` cannot see at all. So the
 * sequence is executed here, against the real functions.
 *
 * HOW. `dev/slice-source.js` lifts the real text of `maybeStartLead`, `leadGoto`,
 * `leadStep`, `playPlyOnBoard` and the run-up helpers out of
 * content/lichessable.js by brace matching, and runs them against the real
 * engine/san.js on real positions. Nothing here is a transcription: a rename or
 * a signature change breaks the slice loudly. The board, the panel, the timer
 * and the speech are stubbed and RECORDED; `sg.board` is null, which is the one
 * branch of `playPlyOnBoard` that wants the DOM.
 *
 * `leadArm` is a no-op stub, so the replay does not run itself — the driver
 * below steps it, which is what the timer chain does.
 *
 * Point CLO_SRC at a modified copy to run a control:
 *
 *   CLO_SRC=/tmp/reverted.js node dev/check-lead-runup.js   # must FAIL
 */
const path = require('path');
const { sliceDecl, SRC_PATH } = require('./slice-source.js');
const CloSan = require(path.join(__dirname, '..', 'engine', 'san.js'));

const NAMES = ['SQ_FILES', 'squareName', 'squareIndexOf', 'fenAfterUci',
  'sanToUciRelaxed', 'sanToUci',
  'leadPrefixOf', 'leadCommonPlies', 'noteLeadShown', 'leadCeiling',
  'playPlyOnBoard', 'leadStep', 'leadGoto', 'maybeStartLead'];

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  console.log((ok ? '  pass  ' : '  FAIL  ') + name + (ok ? '' : '   -> ' + detail));
  ok ? pass++ : fail++;
};

// --- the harness ------------------------------------------------------------
// One scope, rebuilt per chapter so a test cannot inherit another's state.
function makeSession() {
  const rec = { logs: [], ended: [], warns: [] };
  const sg = {
    leadSeen: '',
    leadDiv: 0,
    pos: null,
    lastMove: null,
    lastMoveSpeech: '',
    announced: '',
    active: false,
    board: null,          // the one branch of playPlyOnBoard that wants the DOM
    pieces: new Map(),
    lead: {
      active: false, plies: [], planFen: '', oid: null, reading: false,
      k: 0, idx: 0, shown: 0, target: 0, manual: false, timer: 0,
      armed: 0, nudgeAt: 0, startedAt: 0, doneAt: 0, fenAt: 0,
    },
  };
  const scope = {
    CloSan,
    sg,
    log: (...a) => rec.logs.push(a.join(' ')),
    warn: (...a) => rec.warns.push(a.join(' ')),
    leadWatching: () => true,
    leadActive: () => sg.lead.active,
    leadArm: () => {},        // the driver below is the timer chain
    leadDisarm: () => {},
    endLead: (why) => { sg.lead.active = false; rec.ended.push(why); },
    buildBoard: () => {},
    render: () => {},
    positionBoard: () => {},
    setBoardVisible: () => {},
    syncPanel: () => {},
    reconcile: () => {},
    paintSquares: () => {},
    paintArrow: () => {},
    placeBoardPieceAt: () => {},
    animMs: () => 0,
    sanSpeech: () => '',
    speak: () => {},
    setTimeout: () => 0,      // the post-glide reconcile is not this test's subject
  };
  const M = new Function(...Object.keys(scope),
    NAMES.map(sliceDecl).join('\n\n') + '\n;return {' + NAMES.join(',') + '};'
  )(...Object.values(scope));
  return { sg, rec, M };
}

/**
 * A Key Moves plan: `sans` played for the user by the trainer, then one card.
 * Every ply carries its own exact `sourceFen`, which is what the real plan does
 * and what `leadGoto` opens the board on.
 *
 * `isUserMove` is FALSE on every prefix ply INCLUDING the user's own colour —
 * that is Chessable's own doing under Key Moves and it is §2's whole gate.
 */
function plan(M, sans, cardSan) {
  const out = [];
  let fen = START;
  const all = sans.concat([cardSan]);
  for (let i = 0; i < all.length; i++) {
    const pos = CloSan.parseFen(fen);
    const uci = M.sanToUci(pos, all[i]);
    if (!uci) throw new Error('unplayable in the fixture: ' + all[i] + ' on ' + fen);
    out.push({
      san: all[i],
      color: pos.side,
      isUserMove: i === sans.length,
      sourceFen: fen,
    });
    fen = M.fenAfterUci(fen, uci);
  }
  return out;
}

/**
 * Offer one variation to the lead-in and let the replay run to the end, exactly
 * as the timer chain would. Returns what a reader of the console would see.
 */
function offer(H, sans, cardSan, opts) {
  const stopAfter = (opts || {}).stopAfter;   // simulate a cut-short replay
  const before = H.rec.logs.length;
  H.sg.lead.plies = plan(H.M, sans, cardSan);
  H.sg.lead.active = false;
  H.M.maybeStartLead();
  if (!H.sg.lead.active) {
    return { replayed: false, from: null, played: [], logs: H.rec.logs.slice(before) };
  }
  const from = H.sg.lead.idx;
  const played = [];
  let guard = 0;
  while (H.sg.lead.active && H.sg.lead.idx < H.M.leadCeiling() && guard++ < 64) {
    if (stopAfter !== undefined && played.length >= stopAfter) break;
    const at = H.sg.lead.idx;
    H.M.leadStep();
    if (H.sg.lead.idx > at) played.push(sans[at]);
  }
  const endFen = H.sg.pos ? H.M.fenAfterUci(
    H.sg.lead.plies[H.sg.lead.idx] ? H.sg.lead.plies[H.sg.lead.idx].sourceFen : START, 'a1a1') : '';
  H.sg.lead.active = false;   // the trainer arrives and it hands over
  return { replayed: true, from, played, endFen, logs: H.rec.logs.slice(before) };
}

const V1 = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6'];
const V3 = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'a6'];
const V4 = ['e4', 'c5', 'Nf3', 'Nc6'];
const V5 = ['e4', 'c5', 'Nf3', 'e6'];
const V6 = ['e4', 'c5', 'Nf3', 'e6', 'd4', 'cxd4', 'Nxd4', 'Nc6'];
const V7 = ['e4', 'e5'];

// --- 1. a chapter walked in course order ------------------------------------
{
  const H = makeSession();
  const r1 = offer(H, V1, 'Nc3');
  check('V1 (nothing watched yet) replays the whole run-up',
    r1.replayed && r1.from === 0 && r1.played.length === 8,
    'from=' + r1.from + ' played=' + r1.played.length);

  const r2 = offer(H, V1, 'Bd3');
  check('V2 (identical run-up) is not replayed at all',
    !r2.replayed && /nothing new in the run-up/.test(r2.logs.join('|')),
    r2.logs.join('|'));

  const r3 = offer(H, V3, 'Nc3');
  check('V3 (shares 7) opens at the divergence and shows only 4...a6',
    r3.replayed && r3.from === 7 && r3.played.join(' ') === 'a6',
    'from=' + r3.from + ' played=[' + r3.played.join(' ') + ']');

  // The skipped V2 must not have moved the branch point: had it set leadDiv to
  // 8, V3's divergence at 7 would have read as "shallower" and replayed all 8.
  check('a skipped run-up leaves the branch point alone', r3.from === 7,
    'from=' + r3.from);

  const r3b = offer(H, V3, 'Be2');
  check('a second sibling of the same branch point is skipped', !r3b.replayed,
    'from=' + r3b.from);

  const r3c = offer(H, ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'e5'], 'Nb3');
  check('…and a third opens at that same branch point (leadDiv held at 7)',
    r3c.replayed && r3c.from === 7 && r3c.played.join(' ') === 'e5',
    'from=' + r3c.from + ' played=[' + r3c.played.join(' ') + ']');

  const r4 = offer(H, V4, 'Bb5');
  check('V4 (branches SHALLOWER, shares 3) replays from the start',
    r4.replayed && r4.from === 0 && r4.played.join(' ') === 'e4 c5 Nf3 Nc6',
    'from=' + r4.from + ' played=[' + r4.played.join(' ') + ']');

  const r5 = offer(H, V5, 'd4');
  check('V5 (the sibling after it) truncates again — the full replay was once',
    r5.replayed && r5.from === 3 && r5.played.join(' ') === 'e6',
    'from=' + r5.from + ' played=[' + r5.played.join(' ') + ']');

  const r6 = offer(H, V6, 'Nc3');
  check('V6 (a deeper branch point, run-up extended) shows only the new plies',
    r6.replayed && r6.from === 4 && r6.played.join(' ') === 'd4 cxd4 Nxd4 Nc6',
    'from=' + r6.from + ' played=[' + r6.played.join(' ') + ']');

  const r7 = offer(H, V7, 'Nf3');
  check('V7 (shares 1, far shallower than 4) replays from the start',
    r7.replayed && r7.from === 0 && r7.played.join(' ') === 'e4 e5',
    'from=' + r7.from + ' played=[' + r7.played.join(' ') + ']');
}

// --- 2. a run-up that was cut short is not counted as watched ---------------
{
  const H = makeSession();
  const r1 = offer(H, V1, 'Nc3', { stopAfter: 4 });
  check('a replay stopped after 4 plies leaves 4 plies watched',
    r1.replayed && H.sg.leadSeen === 'e4 c5 Nf3 d6',
    'leadSeen=[' + H.sg.leadSeen + ']');

  const r2 = offer(H, V1, 'Bd3');
  check('…so the SAME run-up next time is shown from where it stopped',
    r2.replayed && r2.from === 4 && r2.played.join(' ') === 'd4 cxd4 Nxd4 Nf6',
    'from=' + r2.from + ' played=[' + r2.played.join(' ') + ']');
}

// --- 3. stepping BACK does not un-see a position ----------------------------
{
  const H = makeSession();
  offer(H, V1, 'Nc3');
  H.sg.lead.active = true;               // as if the user were still in it
  H.M.leadGoto(3);                       // …and pressed BACK five times
  check('BACK lowers idx but not the high-water mark',
    H.sg.lead.idx === 3 && H.sg.lead.shown === 8 &&
    H.sg.leadSeen === 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6',
    'idx=' + H.sg.lead.idx + ' shown=' + H.sg.lead.shown + ' seen=[' + H.sg.leadSeen + ']');
  H.sg.lead.active = false;
  const r = offer(H, V3, 'Nc3');
  check('…so the next variation still truncates against the whole run-up',
    r.replayed && r.from === 7, 'from=' + r.from);
}

// --- 4. the board really is on the divergence position ----------------------
{
  const H = makeSession();
  offer(H, V1, 'Nc3');
  H.sg.lead.plies = plan(H.M, V3, 'Nc3');
  H.sg.lead.active = false;
  H.M.maybeStartLead();
  const want = CloSan.parseFen(H.sg.lead.plies[7].sourceFen);
  const got = H.sg.pos;
  check('opening mid-run-up lands on the plan\'s own position for that ply',
    Boolean(got) && got.board.join('') === want.board.join('') &&
    got.side === want.side && got.castling === want.castling,
    got ? 'side=' + got.side + ' castling=' + got.castling : 'no position');
  check('…with the ply before the divergence highlighted',
    Boolean(H.sg.lastMove) && H.sg.lastMove.to === H.M.squareIndexOf('d4'),
    JSON.stringify(H.sg.lastMove));
}

// --- 5. the gate itself is untouched ----------------------------------------
{
  const H = makeSession();
  const allKey = plan(H.M, [], 'e4').map((p) => Object.assign({}, p, { isUserMove: true }));
  check('an All Moves variation still has no run-up', H.M.leadPrefixOf(allKey) === 0,
    String(H.M.leadPrefixOf(allKey)));
  const keyMoves = plan(H.M, V1, 'Nc3');
  check('a Key Moves variation still reports its prefix',
    H.M.leadPrefixOf(keyMoves) === 8, String(H.M.leadPrefixOf(keyMoves)));
}

console.log('\nsource: ' + SRC_PATH);
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
