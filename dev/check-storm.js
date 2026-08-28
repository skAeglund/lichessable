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
 *   * …its continuation index made colour-agnostic       → 1 fail
 *   * …restricted to the lines eligible to BE a frontier → 2 fail
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { sliceDecl, findDecl, SRC_PATH } = require('./slice-source.js');
const CloSan = require('../engine/san.js');

// --- the surrounding closure, faithful to the shipped file -------------------
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const SQ_FILES = 'abcdefgh';
const squareName = (i) => SQ_FILES[i & 7] + ((i >> 3) + 1);
const cacheKey = (fen) => fen.split(' ').slice(0, 4).join(' ');
const warn = () => {};
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
  sliceDecl('stormFrontiers'),
  sliceDecl('stormDrawFrontier'),
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
  'let st = null; let C = null;',
  'function __setEnv(a, b) { st = a; C = b; }',
  sliceDecl('stormStoreDraw'),
  sliceDecl('stormWirePack'),
  sliceDecl('stormWireUnpack'),
  sliceDecl('stormWireMerge'),
  // §15's performance record. The three silent failures are the denominator,
  // the merge and the roll-up — see section 9 below.
  sliceDecl('STAT_BAND'),
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
  sliceDecl('stormCandidate'),
  sliceDecl('stormAdvance'),
  sliceDecl('stormWalkGame'),
  sliceDecl('stormRandomLine'),
  sliceDecl('stormCard'),
  // The verdict line: pure, and the half of this feature the user reads.
  sliceDecl('stormCp'),
  sliceDecl('stormWp'),
  sliceDecl('stormVerdictLine'),
  sliceDecl('stormBestLine'),
  'return { stormFrontiers, stormDrawFrontier, stormUserEval, stormPgnMoves,' +
  '         stormPickReject, stormMoveLoss, stormGrade, stormPoints,' +
  '         stormWalkGame, stormRandomLine, stormCandidate, stormAdvance,' +
  '         stormCard, stormPack, stormUnpack, stormRetain, stormStoreDraw,' +
  '         stormDone, stormPickGames,' +
  '         stormFunnelBlank, stormFunnelBump, stormFunnelWhy,' +
  '         stormFunnelNote, stormFunnelLines,' +
  '         storeAdd, harvestCandidates, __setEnv,' +
  '         stormWirePack, stormWireUnpack, stormWireMerge,' +
  '         stormStatBlank, stormStatApply, stormStatPlus, stormStatSum,' +
  '         stormStatGraded,' +
  '         stormStatRoll, stormStatRate, stormStatLoss,' +
  '         stormStatsMerge, stormStatsPrune,' +
  '         stormStatsWirePack, stormStatsWireUnpack,' +
  '         stormCp, stormWp, stormMoverCp,' +
  '         stormWinPct, stormWpLoss,' +
  '         stormVerdictLine, stormBestLine,' +
  '         sanToUci, fenAfterUci };',
].join('\n');
// eslint-disable-next-line no-new-func
const S = new Function('CloSan', 'squareName', 'cacheKey', 'START_FEN', 'warn', 'sleepMs', src)(
  CloSan, squareName, cacheKey, START_FEN, warn, sleepMs);

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
const numF = (name) => {
  const m = new RegExp('\\b' + name + ':\\s*(-?[0-9.]+)').exec(cfgBody);
  if (!m) throw new Error('CONFIG.storm.' + name + ' not found');
  return Number(m[1]);
};
const C = {
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
  engineMateCp: num('engineMateCp'),
  wireVersion: num('wireVersion'), goneMax: num('goneMax'), goneDays: num('goneDays'),
  // Read out of the shipped file the same way, so the rule and the assertions
  // about it cannot disagree about which verdicts drop a position.
  storeDropOn: (cfgBody.match(/storeDropOn:\s*\[([^\]]*)\]/) || [, ''])[1]
    .split(',').map((x) => x.trim().replace(/'/g, '')).filter(Boolean),
  minPlyMax: num('minPlyMax'), maxPlyMin: num('maxPlyMin'), maxPlyMax: num('maxPlyMax'),
  randomTopN: num('randomTopN'), randomTopCp: num('randomTopCp'),
  randomMinPlies: num('randomMinPlies'),
  streakStep: num('streakStep'), streakMax: num('streakMax'),
  // §15. Not a threshold anybody tunes, but the wire version IS what a payload
  // is refused on, so it has to be the shipped one.
  statsWireVersion: num('statsWireVersion'),
  statsMaxLines: num('statsMaxLines'),
};

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log('FAIL ' + label + '\n       got  ' + g + '\n       want ' + w);
};

// ===========================================================================
// 0) THE THREE DISPLAY HELPERS MUST BE AT TOP LEVEL
// ===========================================================================
// SLICING FLATTENS EVERY SCOPE INTO ONE, so nothing else in this file can tell
// a helper section 18 can reach from one it cannot — and section 18's panel and
// section 27's review print the SAME verdict line from two different closures.
// Found live 2026-08-28: `renderReview` threw `stormVerdictLine is not defined`
// at the first teardown, which `node --check` cannot see and no assertion below
// would have caught. Two-space indent IS top level in this file.
for (const name of ['stormCp', 'stormWp', 'stormVerdictLine', 'stormBestLine']) {
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

  // --- a game that never reaches the frontier -----------------------------
  const elsewhere = await S.stormWalkGame(
    fFen, 'w', ['d4', 'd5', 'c4', 'e6'], book(20), C);
  eq('a game that misses the frontier yields nothing', elsewhere.found, false);
  eq('…and says so', elsewhere.stop, 'never reached the frontier');

  // --- the stop rules -----------------------------------------------------
  const unknown = await S.stormWalkGame(fFen, 'w', gameSans, () => Promise.resolve(null), C);
  eq('an unscored position stops the walk', unknown.stop, 'ChessDB has no score here');
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
  eq('an engine verdict says where the number came from',
    S.stormVerdictLine({ verdict: 'bad', userSan: 'Nxh2', rank: null, wp: 12.7,
      source: 'engine', points: 0 }, cardOf()),
    'Nxh2 · 13% of the game · by the engine');
  eq('…and names the ENGINE’s best, not the book’s',
    S.stormBestLine({ verdict: 'bad', userSan: 'Nxh2', rank: null, userScore: -108,
      source: 'engine', bestSan: 'Qf3', bestScore: 32 }, cardOf()),
    'best Qf3 +0.32   Nxh2 -1.08');
  eq('…with no win rate, which is a book figure and not a search one',
    S.stormBestLine({ verdict: 'bad', userSan: 'Nxh2', rank: null, userScore: -108,
      source: 'engine', bestSan: 'Qf3', bestScore: 32,
      userWinrate: 41 }, cardOf()).indexOf('%'), -1);
  eq('an engine verdict agreeing with the engine’s best prints it once',
    S.stormBestLine({ verdict: 'good', userSan: 'Qf3', rank: null, userScore: 32,
      source: 'engine', bestSan: 'Qf3', bestScore: 32 }, cardOf()),
    'best Qf3 +0.32');

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
    inventedUnknown.stop, 'ChessDB has no score here');
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
  const order = S.stormStoreDraw(drawStore, () => 0.5).map((x) => x.ck);
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
  const ks = S.stormStoreDraw(drawStore, () => 0.5).map((x) => x.k);
  eq('failure counts never decrease down the queue',
    ks.every((v, i) => i === 0 || ks[i - 1] <= v), true);
  eq('an empty store draws nothing', S.stormStoreDraw({}, () => 0.5).length, 0);
  eq('no store at all draws nothing', S.stormStoreDraw(null, () => 0.5).length, 0);
  // An unreadable entry is dropped rather than queued with no moves — the same
  // refusal `stormUnpack` makes, reached through the draw.
  eq('an entry that will not unpack is left out',
    S.stormStoreDraw({ bad: { f: fFen, m: [] } }, () => 0.5).length, 0);

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
    stops: { 'ChessDB has no score here': 11, 'the opponent erred here': 3 } }));
  eq('the breakdown leads with the line ends', /^line ends walked/.test(lines[0]), true);
  eq('…and sorts a reason table biggest first',
    lines.findIndex((l) => /ChessDB has no score here/.test(l)) <
    lines.findIndex((l) => /the opponent erred here/.test(l)), true);
  eq('no funnel breaks nothing', S.stormFunnelLines(null).length, 0);
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
    a1: { f: fFen, p: 3, c: 'w', n: 'Ruy', i: 0, a: ['f1b5', 'Bb5'], t: 1000, k: 2,
      m: [['a7a6', 'a6', 30, 54], ['g8f6', 'Nf6', 12], ['b8e5', '??', -5]] },
    a2: { f: fFen, p: 5, c: 'w', n: 'Ruy', i: 1, a: null, t: 2000, k: 0,
      m: [['a7a6', 'a6', 8]] },
  });

  const packedWire = S.stormWirePack(wireStore(), { dead1: Date.now() }, C, 0);
  eq('the wire says which version wrote it', packedWire.v, C.wireVersion);
  eq('…and how many positions it carries', packedWire.n, 2);
  eq('the SAN is NOT on the wire', packedWire.p.a1.m[0].length, 3);
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
  eq('…and the move that led there', un.store.a1.a[1], 'Bb5');
  eq('the SAN is RECOMPUTED, not carried',
    un.store.a1.m.map((m) => m[1]).join(), 'a6,Nf6');
  eq('…and a move that will not resolve is DROPPED, never given a blank SAN',
    un.store.a1.m.length, 2);
  eq('the win rate survives where there was one', un.store.a1.m[0][3], 54);
  eq('…and is not invented where there was none', un.store.a1.m[1].length, 3);
  eq('the tombstones come back too', Object.keys(un.gone), ['dead1']);
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
    { n: 0, a: 0, g: 0, o: 0, b: 0, x: 0, u: 0, ls: 0, lc: 0, t: 0 });
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

  }
  console.log('\n' + SRC_PATH);
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
