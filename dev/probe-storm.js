/**
 * dev/probe-storm.js — does the "Intuition Storm on my repertoire's frontier"
 * idea actually yield usable positions? Answers that BEFORE any UI exists.
 *
 * The pipeline it measures, end to end:
 *   1. walk a course into FRONTIER positions (the FEN each variation ends on)
 *   2. ask the Lichess explorer which real games passed through that position
 *   3. pull those games' PGNs and walk 1..maxPly plies past the frontier
 *   4. ask ChessDB to score every move at each ply (learn=1) — measured at
 *      98% coverage over real continuations, but the SCORED set shrinks with
 *      depth (36/36 at ply 1, 6/6 by ply 13), which is what `minScored` is for
 *   5. apply the STOP rules and the PICK rules, and report what survives
 *
 * It reports DISTRIBUTIONS, not a pass/fail against the guessed bands — the
 * two spread thresholds are exactly what this exists to tune, so it prints a
 * grid of what each setting would yield and how many positions each individual
 * rule eliminates.
 *
 * TWO BLOCKS EXIST FOR A DECISION RATHER THAN FOR TUNING (2026-08-28):
 *
 *   - the `minScored` DISPUTE DUMP. §12.7b measured 6 -> 5 at 11 -> 27
 *     survivors and left the setting alone pending "twenty FENs and a human".
 *     The dump prints exactly those FENs — admitted at 5, rejected at 6, every
 *     other band shipped — so the look can be taken from the report. The
 *     "sample survivors" block prints positions that are NOT in dispute.
 *   - the WIN-PROBABILITY columns (§16.5). The grade moved to win probability
 *     lost in v0.141.0; the PICK rules are still centipawns, so `spreadMinCp`
 *     demands measurably less of a one-sided position than of a level one. The
 *     spread distributions and the tuning grid are both printed a second time
 *     in wp, over the SAME candidates, so the two can be read against each
 *     other. `stormWinPct`/`stormWpLoss` are sliced out of the shipped file.
 *
 * Not part of the extension; not referenced by the manifest.
 *
 * NEEDS: dev/tmp-courses.json (gitignored — the recipe for remaking it is in
 * the header of dev/probe-course-tree.js) and local-token.json for the
 * explorer's Bearer token.
 *
 *   node dev/probe-storm.js [--bid 453453] [--n 8] [--minply 2] [--maxply 16] [--seed 1]
 *   node dev/probe-storm.js --bid 453453 --dump-fens dev/tmp-storm-fens.json
 */
'use strict';
const fs = require('fs');
const path = require('path');
const CloSan = require('../engine/san.js');
const { sliceDecl } = require('./slice-source.js');

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const SQ_FILES = 'abcdefgh';
const squareName = (i) => SQ_FILES[i & 7] + ((i >> 3) + 1);
const cacheKey = (fen) => fen.split(' ').slice(0, 4).join(' ');
const NL = String.fromCharCode(10);

// The shipped resolver, sliced out so this cannot drift from the source.
// `stormWinPct`/`stormWpLoss` ride along for the same reason (§16): the grade
// moved to win probability in v0.141.0 while the PICK rules stayed in
// centipawns, and §16.5 is the open question of whether `spreadMinCp` 60 is
// therefore a different filter at +200 than it is at equality. Answering that
// with a transcription of the curve would answer it about a different curve.
const { sanToUci, stormWinPct, stormWpLoss } = new Function('CloSan', 'squareName', [
  sliceDecl('RELAXED_SAN_RE'), sliceDecl('sanToUciRelaxed'), sliceDecl('sanToUci'),
  sliceDecl('stormWinPct'), sliceDecl('stormWpLoss'),
  'return { sanToUci, stormWinPct, stormWpLoss };',
].join(NL))(CloSan, squareName);

function fenAfterUci(preFen, uci) {
  const pos = CloSan.parseFen(preFen);
  const mv = pos && CloSan.uciToMove(pos, uci);
  if (!mv) return null;
  const isPawn = (pos.board[mv.from] || '').toUpperCase() === 'P';
  const isCapture = Boolean(pos.board[mv.to]) || (isPawn && mv.to === pos.ep);
  const preHalf = Number(preFen.trim().split(/\s+/)[4]);
  const postHalf = (isPawn || isCapture) ? 0 : (Number.isInteger(preHalf) ? preHalf : 0) + 1;
  return CloSan.fenFromPos(CloSan.makeMove(pos, mv), postHalf);
}

function walkVariation(v) {
  const start = v.fen || START_FEN;
  let fen = start;
  const plies = [];
  for (const san of v.sans) {
    const pos = CloSan.parseFen(fen);
    const uci = pos && sanToUci(pos, san);
    const after = uci && fenAfterUci(fen, uci);
    if (!after) return null;
    plies.push({ san, uci, before: fen, after, side: pos.side });
    fen = after;
  }
  return { start, plies, end: fen };
}

// --- the config under test -------------------------------------------------
// Every number here is a GUESS. The report is what turns each into a measurement.
const C = {
  maxPly: 16,          // how far past the frontier to walk
  minPly: 2,           // never offer a position still in the course's own line
  blunderCp: 150,      // "the side to move just erred" — stop the walk
  decidedCp: 250,      // |eval| beyond this and the position is over
  userLoCp: -100,      // the user may be slightly worse; not lost
  userHiCp: 200,       // ...and not already winning
  spreadMinCp: 60,     // best - 5th: there must be something to get wrong
  spreadMaxCp: 200,    // best - 2nd: beyond this it is a tactic, not intuition
  minScored: 6,        // ChessDB must grade enough moves to rank an answer
  // §16's curve, read out of the shipped CONFIG.storm rather than transcribed:
  // `wpK` is Lichess's own fit and is not a dial, so a copy of it here that had
  // drifted would answer §16.5 about a curve the extension does not use.
  wpK: 0, wpClampCp: 0,
};

// THE SHIPPED BANDS, for the blocks that ask what the EXTENSION would do rather
// than what this probe's own config does. `C` above is the config UNDER TEST and
// §6's numbers were produced with it; these are read from CONFIG.storm so the
// minScored dump and the wp grid cannot quietly describe a build that is gone.
const SHIPPED = { spreadMinCp: 60, spreadMaxCp: 300, minScored: 6 };
(() => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'content', 'lichessable.js'), 'utf8');
  const start = src.indexOf('storm: {');
  const body = src.slice(start, src.indexOf(String.fromCharCode(10) + '    },', start));
  // THROWS rather than falling back. A default quietly standing in for a
  // number that could not be read is the drift this block exists to prevent —
  // and it would be invisible, since every default here is today's value.
  const num = (name) => {
    const m = new RegExp('\\b' + name + ':\\s*(-?[0-9.]+)').exec(body);
    if (!m) throw new Error('CONFIG.storm.' + name + ' not readable from the shipped file');
    return Number(m[1]);
  };
  C.wpK = num('wpK');
  C.wpClampCp = num('wpClampCp');
  SHIPPED.spreadMinCp = num('spreadMinCp');
  SHIPPED.spreadMaxCp = num('spreadMaxCp');
  SHIPPED.minScored = num('minScored');
})();

// --- tiny http -------------------------------------------------------------
const TOKEN = (() => {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', 'local-token.json'), 'utf8');
    return JSON.parse(raw).lichessToken || '';
  } catch (e) { return ''; }
})();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reqCount = { explorer: 0, pgn: 0, cdb: 0 };

/**
 * NEVER THROWS (2026-08-28). chessdb.cn goes unreachable for minutes at a time —
 * measured 2 of 3 attempts timing out at 10 s — and an unhandled rejection here
 * kills a ten-minute run outright.
 */
async function getJson(url, headers) {
  try {
    const r = await fetch(url, { headers: headers || {} });
    if (!r.ok) return { __err: 'HTTP ' + r.status };
    return await r.json();
  } catch (e) {
    return { __err: String((e && e.cause && e.cause.code) || (e && e.message) || e) };
  }
}

async function explorerGames(fen) {
  reqCount.explorer++;
  const q = new URLSearchParams({
    variant: 'standard', fen, moves: '0', topGames: '4', recentGames: '4',
  });
  const d = await getJson('https://explorer.lichess.org/lichess?' + q,
    { Authorization: 'Bearer ' + TOKEN });
  if (d.__err) return { err: 'explorer ' + d.__err, games: [], total: 0 };
  return {
    games: [].concat(d.topGames || [], d.recentGames || []),
    total: (d.white || 0) + (d.draws || 0) + (d.black || 0),
  };
}

async function gamePgn(id) {
  reqCount.pgn++;
  const url = 'https://lichess.org/game/export/' + id + '?evals=false&clocks=false&literate=false';
  const r = await fetch(url);
  return r.ok ? r.text() : '';
}

/**
 * Every move ChessDB will actually score here, best first, mover's perspective.
 *
 * `null` MEANS "ChessDB HAS NO SCORE HERE" AND NOTHING ELSE. A transport failure
 * returns `undefined` instead, because the walk records `null` as the stop reason
 * "ChessDB has no score here" — counting a timeout as that would inflate the one
 * number the elaboration argument rests on (§6.2). Retried before giving up.
 */
async function cdbScored(fen, learn) {
  const q = new URLSearchParams({ action: 'queryall', board: fen, json: '1', learn: String(learn) });
  let d = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    reqCount.cdb++;
    d = await getJson('https://www.chessdb.cn/cdb.php?' + q);
    if (!d.__err) break;
    if (attempt < 3) await sleep(2500 * (attempt + 1));
  }
  if (d.__err) return undefined;                       // unreachable, NOT unknown
  if (d.status !== 'ok') return null;                  // genuinely not in the graph
  const moves = (d.moves || []).filter((m) => typeof m.score === 'number');
  moves.sort((a, b) => b.score - a.score);
  return moves;
}

// --- pgn -------------------------------------------------------------------
function pgnMoves(pgn) {
  const body = String(pgn)
    .replace(/^\[.*$/gm, '')            // headers
    .replace(/\{[^}]*\}/g, '')          // comments
    .replace(/\$\d+/g, '')              // NAGs
    .replace(/\b\d+\.(\.\.)?/g, '')     // move numbers
    .replace(/(1-0|0-1|1\/2-1\/2|\*)\s*$/, '');
  return body.split(/\s+/).filter(Boolean);
}

// --- the walk --------------------------------------------------------------
const stopReasons = {};
const rejects = {};
const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };

/**
 * Walk one game forward from the frontier, collecting every user-to-move
 * position along the way with the numbers each PICK rule needs.
 */
async function walkGame(frontierFen, userSide, sans) {
  let fen = START_FEN;
  let i = 0;
  const target = cacheKey(frontierFen);
  while (i < sans.length && cacheKey(fen) !== target) {
    const pos = CloSan.parseFen(fen);
    const uci = pos && sanToUci(pos, sans[i]);
    const after = uci && fenAfterUci(fen, uci);
    if (!after) return { found: false, out: [] };
    fen = after;
    i++;
  }
  if (cacheKey(fen) !== target) return { found: false, out: [] };

  const out = [];
  let prevCapSq = null;
  let lastMoveGaveCheck = false;

  for (let k = 0; k < C.maxPly && i + k < sans.length; k++) {
    const pos = CloSan.parseFen(fen);
    if (!pos) { bump(stopReasons, 'unparseable position'); break; }

    const scored = await cdbScored(fen, 1);
    await sleep(90);
    // undefined = unreachable. Recording that as the elaboration stop would
    // inflate the one count §6.2's whole argument rests on.
    if (scored === undefined) { bump(stopReasons, 'ABANDONED: chessdb unreachable'); break; }
    if (!scored || !scored.length) { bump(stopReasons, 'ChessDB has no score here'); break; }

    const best = scored[0].score;                    // mover's perspective
    const evalUser = pos.side === userSide ? best : -best;
    if (Math.abs(best) > C.decidedCp) { bump(stopReasons, 'position already decided'); break; }

    if (pos.side === userSide && k + 1 >= C.minPly) {
      const second = scored.length > 1 ? scored[1].score : best;
      const fifth = scored[Math.min(4, scored.length - 1)].score;
      const cand = {
        fen,
        ply: k + 1,
        evalUser,
        nScored: scored.length,
        spread2: best - second,
        spread5: best - fifth,
        // §16.5: the same two spreads in the units the GRADE now uses. A
        // centipawn is not worth the same at +200 as at equality, so "there
        // must be something to get wrong" is a weaker demand on a one-sided
        // position than on a level one — and how much weaker is a number, not
        // an argument. Computed through the shipped curve, from the mover's
        // own scores, which is the perspective both of these already are in.
        wp2: stormWpLoss(best, second, C),
        wp5: stormWpLoss(best, fifth, C),
        bestScore: best,
        inCheck: lastMoveGaveCheck,
        recapture: prevCapSq !== null && scored[0].uci.slice(2, 4) === prevCapSq,
        best: scored.slice(0, 5).map(
          (m) => m.san + (m.score >= 0 ? '+' : '') + (m.score / 100).toFixed(2)),
      };
      cand.reject = pickReject(cand);
      out.push(cand);
    }

    // advance along the real game
    const san = sans[i + k];
    const uci = sanToUci(pos, san);
    if (!uci) { bump(stopReasons, 'SAN did not resolve'); break; }
    const played = scored.find((m) => m.uci === uci);
    if (played && best - played.score >= C.blunderCp) {
      bump(stopReasons, pos.side === userSide ? 'user-side blunder' : 'opponent blunder');
      break;
    }
    const mv = CloSan.uciToMove(pos, uci);
    const sanFull = (mv && CloSan.moveToSan(pos, mv)) || san;
    prevCapSq = sanFull.indexOf('x') >= 0 ? uci.slice(2, 4) : null;
    lastMoveGaveCheck = /[+#]/.test(sanFull);
    const after = fenAfterUci(fen, uci);
    if (!after) { bump(stopReasons, 'illegal in sequence'); break; }
    fen = after;
    if (k === C.maxPly - 1) bump(stopReasons, 'max plies reached');
    else if (i + k + 1 >= sans.length) bump(stopReasons, 'game ended');
  }
  return { found: true, out };
}

/** First failing PICK rule, or null if the position is offerable. */
function pickReject(c) {
  if (c.evalUser < C.userLoCp) return 'user is losing';
  if (c.evalUser > C.userHiCp) return 'user is already winning';
  if (c.nScored < C.minScored) return 'too few moves scored to rank an answer';
  if (c.inCheck) return 'in check (choice is narrow)';
  if (c.recapture) return 'forced recapture';
  if (c.spread5 < C.spreadMinCp) return 'flat — nothing to get wrong';
  if (c.spread2 > C.spreadMaxCp) return 'one move only — a tactic, not intuition';
  return null;
}

/**
 * The same rules with the two spread bands swapped in, for the tuning grid —
 * and with `minScored` swappable too (default: the shipped value).
 *
 * WHY minScored IS A PARAMETER (2026-08-28). dev/probe-chessdb-queue.js measured
 * that at the depth this walk loses positions, ChessDB elaborates to EXACTLY
 * FIVE scored moves and stops (25 of 29 positions). `spread5` reads the fifth as
 * `scored[Math.min(4, ...)]`, so it is exact at five — the filter demands six and
 * consumes five, one above the ceiling. This is what lets the grid answer what
 * closing that gap actually buys, on the SAME candidates, in one run.
 */
function rejectAt(c, lo, hi, ms) {
  const minScored = (ms === undefined) ? C.minScored : ms;
  if (c.evalUser < C.userLoCp || c.evalUser > C.userHiCp) return true;
  if (c.nScored < minScored) return true;
  if (c.inCheck || c.recapture) return true;
  return c.spread5 < lo || c.spread2 > hi;
}

/**
 * `rejectAt` with the best-5th rule stated in WIN PROBABILITY rather than
 * centipawns (§16.5). Everything else is unchanged, so the two grids differ in
 * exactly one term and the comparison means something.
 *
 * A candidate whose wp spread could not be computed is REJECTED rather than
 * admitted: an unmeasurable spread is not evidence that there is something to
 * get wrong, and admitting it would flatter the rule this exists to test.
 */
function rejectAtWp(c, loWp, hi, ms) {
  const minScored = (ms === undefined) ? C.minScored : ms;
  if (c.evalUser < C.userLoCp || c.evalUser > C.userHiCp) return true;
  if (c.nScored < minScored) return true;
  if (c.inCheck || c.recapture) return true;
  if (typeof c.wp5 !== 'number') return true;
  return c.wp5 < loWp || c.spread2 > hi;
}

// --- main ------------------------------------------------------------------
function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
let seed = Number(arg('seed', 1)) >>> 0;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

/**
 * --dump-fens <path>: write every SURVIVOR to a JSON file, so the positions
 * this pipeline produces can be fed to another probe without re-walking the
 * network. dev/probe-cdb-quality.js is the one consumer — §12.3 asks whether
 * a `learn=1` score is good enough to GRADE with, and the honest sample for
 * that question is exactly the positions the storm would actually offer.
 *
 * Survivors only, deliberately: a rejected candidate is one the user never
 * sees, so its grading accuracy is not the question being asked.
 */
const dumpPath = arg('dump-fens', '');
const dumped = [];

async function main() {
  let courses;
  try {
    courses = require('./tmp-courses.json');
  } catch (e) {
    console.error('dev/tmp-courses.json missing — see the header of dev/probe-course-tree.js');
    process.exit(2);
  }
  if (!TOKEN) {
    console.error('local-token.json missing a lichessToken — the explorer needs a Bearer token');
    process.exit(2);
  }

  const wantBid = arg('bid', '');
  C.maxPly = Number(arg('maxply', C.maxPly));
  C.minPly = Number(arg('minply', C.minPly));
  const nFrontiers = Number(arg('n', 8));

  for (const entry of Object.entries(courses)) {
    const bid = entry[0];
    const course = entry[1];
    if (wantBid && bid !== wantBid) continue;

    // --- frontiers -------------------------------------------------------
    const byEnd = new Map();
    let unplayable = 0;
    let informational = 0;
    for (const v of course.vars) {
      if (!v.sans || !v.sans.length) { informational++; continue; }
      const w = walkVariation(v);
      if (!w) { unplayable++; continue; }
      const side = String(v.color || '').toLowerCase().charAt(0) === 'b' ? 'b' : 'w';
      const ck = cacheKey(w.end);
      let e = byEnd.get(ck);
      const custom = Boolean(v.fen && cacheKey(v.fen) !== cacheKey(START_FEN));
      if (!e) byEnd.set(ck, e = { fen: w.end, side, n: 0, names: [], plies: w.plies.length, custom });
      e.n++;
      if (e.names.length < 3) e.names.push(v.name || v.oid);
    }

    console.log('='.repeat(74));
    console.log(bid + '  ' + course.name);
    console.log('  ' + course.vars.length + ' variations (' + informational +
      ' informational, ' + unplayable + ' unplayable)');
    console.log('  ' + byEnd.size + ' distinct FRONTIER positions');

    // A variation with a custom start FEN is a tactics puzzle or a model-game
    // fragment: no real game passes through its frontier, so it can never be a
    // storm source. Excluded here rather than paid for one explorer call at a time.
    const all = [];
    let customEnds = 0;
    for (const e of byEnd.values()) {
      if (e.custom) { customEnds++; continue; }
      if (e.plies >= 4) all.push(e);
    }
    console.log('  ' + customEnds + ' of those come from custom-FEN variations (never in a real game)');
    const pool = all.slice();
    const sample = [];
    for (let i = 0; i < nFrontiers && pool.length; i++) {
      sample.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    }
    console.log('  sampling ' + sample.length + ' of ' + all.length +
      ' frontiers at >=4 plies deep' + NL);

    // --frontiers: ask ChessDB what the course's own line ENDS on, and stop.
    // One request per frontier, no games fetched — the measurement behind
    // whether the eval band belongs at stage 0 rather than stage 3.
    if (process.argv.indexOf('--frontiers') > 0) {
      const evals = [];
      for (const f of all) {
        const scored = await cdbScored(f.fen, 1);
        await sleep(90);
        if (scored === undefined) { bump(rejects, 'ABANDONED: chessdb unreachable'); continue; }
        if (!scored || !scored.length) { bump(rejects, 'frontier unknown to ChessDB'); continue; }
        // The score is the MOVER's. Whether to flip it depends on whose move it
        // is in the frontier position, NOT on which colour the course is for —
        // a White line ending after White's move leaves Black to move, so the
        // two are usually opposite. Same rule as the walk's own `evalUser`.
        const best = scored[0].score;
        const stm = f.fen.split(' ')[1];
        evals.push({ e: stm === f.side ? best : -best, name: String(f.names[0]).slice(0, 44), n: f.n });
      }
      evals.sort((x, y) => x.e - y.e);
      const inBand = evals.filter((x) => x.e >= C.userLoCp && x.e <= C.userHiCp).length;
      console.log('  frontier evals (user perspective), ' + evals.length + ' scored of ' + all.length +
        ', ' + (rejects['frontier unknown to ChessDB'] || 0) + ' unknown to ChessDB');
      const qq = (p) => (evals.length ? evals[Math.floor(p * (evals.length - 1))].e : 0);
      console.log('    p10 ' + qq(.1) + '  p25 ' + qq(.25) + '  median ' + qq(.5) +
        '  p75 ' + qq(.75) + '  p90 ' + qq(.9));
      console.log('    inside the [' + C.userLoCp + ', ' + C.userHiCp + '] band: ' +
        inBand + ' of ' + evals.length +
        ' (' + (100 * inBand / (evals.length || 1)).toFixed(0) + '%)');
      console.log('    requests: ' + JSON.stringify(reqCount));
      console.log('    most one-sided frontiers:');
      for (const x of evals.slice(-6).reverse()) {
        console.log('      ' + (x.e / 100).toFixed(2).padStart(7) + '  ' + x.name);
      }
      console.log();
      continue;
    }

    const survivors = [];
    const cands = [];
    let noGames = 0;
    let notFound = 0;

    for (const f of sample) {
      const res = await explorerGames(f.fen);
      await sleep(120);
      const label = String(f.names[0]).slice(0, 46);
      if (res.err) { console.log('  ' + label.padEnd(46) + ' ' + res.err); continue; }
      if (!res.games.length) {
        noGames++;
        console.log('  ' + label.padEnd(46) + ' no games in the explorer (' + res.total + ' total)');
        continue;
      }
      console.log('  ' + label.padEnd(46) + ' ' + res.games.length + ' games, ' +
        res.total + ' in db, ' + (f.side === 'w' ? 'White' : 'Black') + ' to prepare');

      for (const g of res.games.slice(0, 2)) {
        const pgn = await gamePgn(g.id);
        await sleep(120);
        const sans = pgnMoves(pgn);
        if (!sans.length) continue;
        const walked = await walkGame(f.fen, f.side, sans);
        if (!walked.found) { notFound++; continue; }
        for (const c of walked.out) {
          // Provenance on EVERY candidate, not only on the survivors: part 1(a)
          // of TODO-storm.md prints the positions the two `minScored` settings
          // DISAGREE about, and those are by definition not survivors today.
          const withSrc = Object.assign({ from: label, game: g.id }, c);
          cands.push(withSrc);
          if (!c.reject) survivors.push(withSrc);
          if (dumpPath && !c.reject) {
            dumped.push({
              bid, fen: c.fen, ply: c.ply, evalUser: c.evalUser,
              nScored: c.nScored, spread2: c.spread2, spread5: c.spread5,
              from: label, game: g.id,
            });
          }
        }
        const strip = walked.out.map((c) => (c.reject ? '.' : '#')).join('');
        console.log('      ' + g.id + ' ' + String(g.white.rating).padStart(4) + '/' +
          String(g.black.rating).padEnd(4) + ' ' + String(g.speed).padEnd(9) + ' ' +
          (strip || '(no user-to-move plies)'));
      }
    }

    // --- the report ------------------------------------------------------
    console.log(NL + '  ' + '-'.repeat(70));
    const pct = cands.length ? '  (' + (100 * survivors.length / cands.length).toFixed(0) + '%)' : '';
    console.log('  candidate positions examined: ' + cands.length +
      '   SURVIVORS: ' + survivors.length + pct);
    console.log('  frontiers with no explorer games: ' + noGames +
      '   games not reaching the frontier: ' + notFound);
    console.log('  requests: ' + JSON.stringify(reqCount));

    for (const c of cands) if (c.reject) bump(rejects, c.reject);
    console.log(NL + '  why candidates were rejected (first failing rule):');
    for (const r of Object.entries(rejects).sort((a, b) => b[1] - a[1])) {
      console.log('    ' + String(r[1]).padStart(4) + '  ' + r[0]);
    }
    console.log(NL + '  where the walk stopped:');
    for (const r of Object.entries(stopReasons).sort((a, b) => b[1] - a[1])) {
      console.log('    ' + String(r[1]).padStart(4) + '  ' + r[0]);
    }

    // The two bands this whole file exists to tune.
    const q = (arr, p) => (arr.length
      ? arr.slice().sort((a, b) => a - b)[Math.floor(p * (arr.length - 1))] : 0);
    const s2 = cands.map((c) => c.spread2);
    const s5 = cands.map((c) => c.spread5);
    console.log(NL + '  spread distributions (cp), over every candidate:');
    console.log('    best-2nd : p10 ' + q(s2, .1) + '  p25 ' + q(s2, .25) +
      '  median ' + q(s2, .5) + '  p75 ' + q(s2, .75) + '  p90 ' + q(s2, .9));
    console.log('    best-5th : p10 ' + q(s5, .1) + '  p25 ' + q(s5, .25) +
      '  median ' + q(s5, .5) + '  p75 ' + q(s5, .75) + '  p90 ' + q(s5, .9));
    // §16.5. The SAME candidates, the same two spreads, in points of win
    // probability. Read the two blocks against each other: if the cp and wp
    // orderings agree, `spreadMinCp` is measuring what the grade measures and
    // the open question closes; where they disagree, the cp rule is admitting
    // one-sided positions that are flat in the terms the verdict is stated in.
    const w2 = cands.map((c) => c.wp2).filter((x) => typeof x === 'number');
    const w5 = cands.map((c) => c.wp5).filter((x) => typeof x === 'number');
    const q1 = (arr, p) => q(arr, p).toFixed(2);
    console.log('  the same spreads as WIN PROBABILITY given up (points, §16):');
    console.log('    best-2nd : p10 ' + q1(w2, .1) + '  p25 ' + q1(w2, .25) +
      '  median ' + q1(w2, .5) + '  p75 ' + q1(w2, .75) + '  p90 ' + q1(w2, .9));
    console.log('    best-5th : p10 ' + q1(w5, .1) + '  p25 ' + q1(w5, .25) +
      '  median ' + q1(w5, .5) + '  p75 ' + q1(w5, .75) + '  p90 ' + q1(w5, .9));
    // What one cp threshold is worth depends on where the position sits, which
    // is the whole of §16.5 — so print the conversion at the band's two ends
    // rather than leaving it to be recomputed by hand.
    const at = (base, cp) => stormWpLoss(base + cp, base, C).toFixed(2);
    console.log('    spreadMinCp ' + SHIPPED.spreadMinCp + ' is ' +
      at(0, SHIPPED.spreadMinCp) + ' wp at 0.00, ' +
      at(C.userHiCp, SHIPPED.spreadMinCp) + ' wp at +' + (C.userHiCp / 100).toFixed(2) +
      ' — i.e. ' + (100 * (1 - Number(at(C.userHiCp, SHIPPED.spreadMinCp)) /
        Number(at(0, SHIPPED.spreadMinCp)))).toFixed(0) + '% less demanded at the band top');
    // How many moves ChessDB will actually grade here. The ceiling this shows
    // is what `minScored` has to be set against — see rejectAt's note.
    const nsDist = {};
    for (const c of cands) nsDist[c.nScored] = (nsDist[c.nScored] || 0) + 1;
    const nsKeys = Object.keys(nsDist).map(Number).sort((a, b) => a - b);
    console.log(NL + '  moves ChessDB scored, per candidate:');
    console.log('    ' + nsKeys.map((k) => k + ':' + nsDist[k]).join('  '));
    const atFive = cands.filter((c) => c.nScored === 5).length;
    console.log('    exactly 5: ' + atFive + ' of ' + cands.length +
      '   (rejected by minScored 6, admitted by 5)');

    for (const ms of [C.minScored, 5]) {
      console.log(NL + '  survivors at minScored=' + ms +
        ' (rows = min best-5th, cols = max best-2nd):');
      for (const lo of [30, 60, 100]) {
        const row = [150, 200, 300, Infinity].map((hi) => {
          let n = 0;
          for (const c of cands) if (!rejectAt(c, lo, hi, ms)) n++;
          const head = hi === Infinity ? 'inf' : String(hi);
          return head.padStart(4) + ':' + String(n).padStart(4);
        });
        console.log('    min5=' + String(lo).padStart(3) + '   ' + row.join('   '));
      }
    }

    // A WP-BASED `spreadMin`, on the same candidates, so the yield effect of
    // restating the rule in the grade's own units is visible rather than
    // argued. The three rows are the wp equivalents AT EQUALITY of the three
    // cp rows above (30 -> 2.76, 60 -> 5.50, 100 -> 9.10), so a row here and
    // the row above it ask the same question of a level position and diverge
    // only on the one-sided ones — which is exactly §16.5.
    const wpAtEq = (cp) => stormWpLoss(cp, 0, C);
    for (const ms of [SHIPPED.minScored, 5]) {
      console.log(NL + '  survivors with a WP spreadMin at minScored=' + ms +
        ' (rows = min best-5th in wp, cols = max best-2nd in cp):');
      for (const cp of [30, 60, 100]) {
        const loWp = wpAtEq(cp);
        const row = [150, 200, 300, Infinity].map((hi) => {
          let n = 0;
          for (const c of cands) if (!rejectAtWp(c, loWp, hi, ms)) n++;
          const head = hi === Infinity ? 'inf' : String(hi);
          return head.padStart(4) + ':' + String(n).padStart(4);
        });
        console.log('    min5wp=' + loWp.toFixed(2).padStart(5) +
          ' (=' + String(cp).padStart(3) + 'cp at 0.00)   ' + row.join('   '));
      }
    }

    // --- part 1(a): the positions the two `minScored` settings DISAGREE about.
    // §12.7b measured 11 -> 27 survivors at the shipped bands and deliberately
    // did not change the setting, pending "twenty FENs and a human". These are
    // those FENs: admitted at 5, rejected at 6, everything else shipped. The
    // "sample survivors" block below prints positions that are NOT in dispute.
    const disputed = cands.filter((c) =>
      !rejectAt(c, SHIPPED.spreadMinCp, SHIPPED.spreadMaxCp, 5) &&
      rejectAt(c, SHIPPED.spreadMinCp, SHIPPED.spreadMaxCp, SHIPPED.minScored));
    console.log(NL + '  ' + '='.repeat(70));
    console.log('  minScored ' + SHIPPED.minScored + ' -> 5: ' + disputed.length +
      ' positions in dispute (admitted at 5, rejected at ' + SHIPPED.minScored + '),' +
      ' at the shipped bands (min5=' + SHIPPED.spreadMinCp +
      ', max2=' + SHIPPED.spreadMaxCp + ')');
    console.log('  These are the FENs the decision is about. Every one is a position' +
      ' whose FIFTH-best move is the last one ChessDB will name.');
    for (const d of disputed.slice(0, 40)) {
      console.log('    ply +' + d.ply + '  eval ' + (d.evalUser / 100).toFixed(2) +
        '  spread2 ' + d.spread2 + ' spread5 ' + d.spread5 +
        '  (wp2 ' + d.wp2.toFixed(2) + ' wp5 ' + d.wp5.toFixed(2) + ')' +
        '  ' + d.nScored + ' scored');
      console.log('      ' + d.fen);
      console.log('      top: ' + d.best.join('  ') + '   [' + d.from + ' / ' + d.game + ']');
    }
    if (disputed.length > 40) console.log('    …and ' + (disputed.length - 40) + ' more');

    console.log(NL + '  sample survivors:');
    for (const s of survivors.slice(0, 8)) {
      console.log('    ply +' + s.ply + '  eval ' + (s.evalUser / 100).toFixed(2) +
        '  spread2 ' + s.spread2 + ' spread5 ' + s.spread5 + '  ' + s.nScored + ' scored');
      console.log('      ' + s.fen);
      console.log('      top: ' + s.best.join('  ') + '   [' + s.from + ' / ' + s.game + ']');
    }
    console.log();
  }

  if (dumpPath) {
    fs.writeFileSync(dumpPath, JSON.stringify(dumped, null, 1));
    console.log('wrote ' + dumped.length + ' survivor positions to ' + dumpPath);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
