/**
 * dev/probe-nogames-cdb.js - ONE question, asked of the live APIs:
 *
 *   When the Lichess explorer has NO games at a frontier, how far does the
 *   invented-line fallback (§6.4, `stormRandomLine`) actually get before
 *   ChessDB runs out?
 *
 * The suspicion it exists to test: a position nobody has played is unlikely to
 * be in ChessDB's graph either, so the fallback may be walking one ply and
 * dying - in which case it is spending requests to produce nothing.
 *
 * It runs the SHIPPED walk, sliced out by dev/slice-source.js, against live
 * ChessDB, and counts the plies ChessDB was able to score. The `ask` it hands
 * in is wrapped, so "how many positions did ChessDB know" is MEASURED rather
 * than inferred from the stop reason.
 *
 * For CONTRAST it does the same for frontiers that DO have games - same walk,
 * same course, same depth - so "ChessDB is thin out here" can be told apart
 * from "ChessDB is thin everywhere past a repertoire".
 *
 * NEEDS: dev/tmp-courses.json and local-token.json, like dev/probe-storm.js.
 *
 *   node dev/probe-nogames-cdb.js [--bid 453453] [--n 40] [--seed 7]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const CloSan = require('../engine/san.js');
const { sliceDecl, SRC_PATH } = require('./slice-source.js');

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const SQ_FILES = 'abcdefgh';
const squareName = (i) => SQ_FILES[i & 7] + ((i >> 3) + 1);
const cacheKey = (fen) => fen.split(' ').slice(0, 4).join(' ');
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
const NL = String.fromCharCode(10);

// --- the shipped pipeline ---------------------------------------------------
const src = [
  sliceDecl('RELAXED_SAN_RE'), sliceDecl('sanToUciRelaxed'), sliceDecl('sanToUci'),
  sliceDecl('fenAfterUci'), sliceDecl('walkVariation'), sliceDecl('sideOf'),
  sliceDecl('stormCoverKey'), sliceDecl('stormFrontiers'),
  sliceDecl('stormUserEval'), sliceDecl('stormWinPct'), sliceDecl('stormWpLoss'),
  sliceDecl('stormPickReject'),
  sliceDecl('stormCandidate'), sliceDecl('stormAdvance'), sliceDecl('stormReentered'),
  sliceDecl('stormRandomLine'),
  'return { stormFrontiers, stormRandomLine, stormUserEval, stormPickReject };',
].join(NL);
const S = new Function('CloSan', 'squareName', 'cacheKey', 'START_FEN', 'warn', 'log',
  'sleepMs', src)(CloSan, squareName, cacheKey, START_FEN, () => {}, () => {}, sleepMs);

// CONFIG.storm, read out of the shipped file so nothing here can drift.
const SRC = fs.readFileSync(SRC_PATH, 'utf8');
const cfgStart = SRC.indexOf('storm: {');
const cfgBody = SRC.slice(cfgStart, SRC.indexOf(NL + '    },', cfgStart));
const num = (name) => {
  const m = new RegExp('\\b' + name + ':\\s*(-?[0-9.]+)').exec(cfgBody);
  if (!m) throw new Error('CONFIG.storm.' + name + ' not found');
  return Number(m[1]);
};
const list = (name) => {
  const m = new RegExp('\\b' + name + ':\\s*\\[([^\\]]*)\\]').exec(cfgBody);
  if (!m) throw new Error('CONFIG.storm.' + name + ' not found');
  return m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
};
const C = {
  minVarPlies: num('minVarPlies'), chunkVars: num('chunkVars'),
  minPly: num('minPly'), maxPly: num('maxPly'),
  blunderCp: num('blunderCp'), decidedCp: num('decidedCp'),
  userLoCp: num('userLoCp'), userHiCp: num('userHiCp'),
  spreadMinCp: num('spreadMinCp'), spreadMaxCp: num('spreadMaxCp'),
  minScored: num('minScored'),
  randomTopN: num('randomTopN'), randomTopCp: num('randomTopCp'),
  randomMinPlies: num('randomMinPlies'),
  wpK: num('wpK'), wpClampCp: num('wpClampCp'),
  speeds: list('speeds'), ratings: list('ratings'),
};
// The same config with the random LENGTH removed - see the walk below.
const CFULL = Object.assign({}, C, { randomMinPlies: C.maxPly });

// --- network ----------------------------------------------------------------
const TOKEN = (() => {
  try {
    return JSON.parse(fs.readFileSync(
      path.join(__dirname, '..', 'local-token.json'), 'utf8')).lichessToken || '';
  } catch (e) { return ''; }
})();
const req = { explorer: 0, cdb: 0 };
async function getJson(url, headers) {
  try {
    const r = await fetch(url, { headers: headers || {} });
    if (!r.ok) return { __err: 'HTTP ' + r.status };
    return await r.json();
  } catch (e) { return { __err: String((e && e.cause && e.cause.code) || e.message || e) }; }
}

/** The SHIPPED `askGames` parameters - relaxed bands and all (§6.4). */
async function explorerTotal(fen) {
  req.explorer++;
  const q = new URLSearchParams({
    variant: 'standard', fen, speeds: C.speeds.join(','), ratings: C.ratings.join(','),
    moves: '0', topGames: '4', recentGames: '4',
  });
  const d = await getJson('https://explorer.lichess.org/lichess?' + q,
    { Authorization: 'Bearer ' + TOKEN });
  if (d.__err) return { err: d.__err };
  const w = d.white, dr = d.draws, b = d.black;
  const games = [].concat(d.topGames || [], d.recentGames || []).filter((g) => g && g.id);
  return { total: (w || 0) + (dr || 0) + (b || 0), games: games.length };
}

/** `askCdb`'s own read, with its `learn=1` and its type check. */
async function cdbScored(fen) {
  let d = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    req.cdb++;
    d = await getJson('https://www.chessdb.cn/cdb.php?' + new URLSearchParams({
      action: 'queryall', board: fen, json: '1', learn: '1',
    }));
    if (!d.__err) break;
    if (attempt < 2) await sleepMs(2000 * (attempt + 1));
  }
  if (d.__err) return undefined;                 // unreachable, NOT unknown
  if (d.status !== 'ok' || !Array.isArray(d.moves)) return null;
  return d.moves
    .filter((m) => m && m.uci && typeof m.score === 'number')
    .map((m) => ({ uci: m.uci, san: m.san, score: m.score }))
    .sort((a, b) => b.score - a.score);
}

// --- main -------------------------------------------------------------------
const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
let seed = Number(arg('seed', 7)) >>> 0;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const wantBid = arg('bid', '');
const nMax = Number(arg('n', 40));

const pct = (a, b) => (b ? (100 * a / b).toFixed(0) + '%' : '-');

(async () => {
  if (!TOKEN) console.log('!! no lichess token - explorer calls will 401' + NL);
  const courses = JSON.parse(fs.readFileSync(
    path.join(__dirname, 'tmp-courses.json'), 'utf8'));

  const rows = { none: [], some: [] };

  for (const [bid, course] of Object.entries(courses)) {
    if (wantBid && bid !== wantBid) continue;
    const pool = await S.stormFrontiers(course.vars, C);
    console.log('='.repeat(74));
    console.log(bid + '  ' + course.name + '  -  ' + pool.length + ' frontiers' +
      ' (' + pool.paused + ' paused, ' + pool.covered + ' stubs)');

    // A random sample, so a course is not read front to back.
    const sample = pool.slice();
    for (let i = sample.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = sample[i]; sample[i] = sample[j]; sample[j] = t;
    }
    const take = sample.slice(0, nMax);

    for (const f of take) {
      const ex = await explorerTotal(f.fen);
      await sleepMs(160);
      if (ex.err) { console.log('  explorer failed (' + ex.err + ') - skipping'); continue; }
      const bucket = ex.games ? 'some' : 'none';

      // STAGE 0, exactly as `harvestFrontier` does it: a frontier ChessDB
      // cannot score at all is skipped before any game is fetched.
      const scored = await cdbScored(f.fen);
      await sleepMs(100);
      const row = {
        bid, name: f.names[0], total: ex.total, games: ex.games,
        frontierScored: scored === undefined ? null : (scored ? scored.length : 0),
      };
      if (scored === undefined) {
        row.stop = 'chessdb unreachable'; rows[bucket].push(row); continue;
      }
      if (!scored) {
        row.stop = 'frontier itself unknown to ChessDB'; rows[bucket].push(row);
        console.log('  ' + (bucket === 'none' ? '[0 games] ' : '[' + row.total + ' games] ') +
          (row.name || '').slice(0, 34).padEnd(35) + ' frontier UNKNOWN to ChessDB');
        continue;
      }

      const stm = String(f.fen).split(' ')[1] === 'b' ? 'b' : 'w';
      const evalUser = S.stormUserEval(scored[0].score, stm, f.side);
      row.evalUser = evalUser;
      if (evalUser < C.userLoCp || evalUser > C.userHiCp) {
        row.stop = 'off the stage-0 eval band'; rows[bucket].push(row); continue;
      }

      // THE WALK, AT FULL LENGTH. `randomMinPlies` is raised to `maxPly` so
      // the random line LENGTH cannot be what ends it - the shipped walk picks
      // a length in [randomMinPlies, maxPly] for variety, and a walk that ran
      // out of its own dice roll would be indistinguishable here from one that
      // ran out of ChessDB. This measures the CEILING: how far the graph goes.
      //
      // `ask` is wrapped so the plies ChessDB could score are MEASURED rather
      // than inferred from the stop reason.
      let asked = 0, known = 0;
      const ask = async (fen) => {
        asked++;
        const got = await cdbScored(fen);
        await sleepMs(100);
        if (got && got.length) known++;
        return got;
      };
      const walked = await S.stormRandomLine(
        f.fen, f.side, ask, CFULL, rnd,
        f.lastUci ? { san: f.lastSan || '', uci: f.lastUci, before: f.lastFen || null } : null,
        pool.cont && pool.cont[f.side]);
      row.asked = asked;
      row.known = known;                     // positions ChessDB DID score
      row.plies = Math.max(0, known - 1);    // ...past the frontier itself
      row.stop = walked.stop;
      row.candidates = walked.out.length;
      row.survivors = walked.out.filter((c) => !S.stormPickReject(c, C)).length;
      rows[bucket].push(row);
      console.log('  ' + (bucket === 'none' ? '[0 games] ' : '[' + row.total + ' games] ') +
        (row.name || '').slice(0, 34).padEnd(35) +
        ' plies past frontier: ' + String(row.plies).padStart(2) +
        '   cand ' + row.candidates + '   surv ' + row.survivors +
        '   (' + row.stop + ')');
    }
  }

  // --- the report -----------------------------------------------------------
  const report = (label, rs) => {
    console.log(NL + '-'.repeat(74));
    console.log(label + ' - ' + rs.length + ' frontiers');
    if (!rs.length) return;
    const walked = rs.filter((r) => typeof r.plies === 'number');
    const unknownFrontier =
      rs.filter((r) => r.stop === 'frontier itself unknown to ChessDB').length;
    const offBand = rs.filter((r) => r.stop === 'off the stage-0 eval band').length;
    console.log('  frontier UNKNOWN to ChessDB : ' + unknownFrontier +
      ' (' + pct(unknownFrontier, rs.length) + ')');
    console.log('  off the stage-0 eval band   : ' + offBand);
    console.log('  walked                      : ' + walked.length);
    if (!walked.length) return;
    const plies = walked.map((r) => r.plies).sort((a, b) => a - b);
    const q = (p) => plies[Math.min(plies.length - 1, Math.floor(p * plies.length))];
    const sum = plies.reduce((a, b) => a + b, 0);
    console.log('  plies past the frontier     : min ' + plies[0] + '  p25 ' + q(0.25) +
      '  median ' + q(0.5) + '  p75 ' + q(0.75) + '  max ' + plies[plies.length - 1] +
      '  mean ' + (sum / plies.length).toFixed(1));
    const died = plies.filter((p) => p === 0).length;
    const oneOrTwo = plies.filter((p) => p >= 1 && p <= 2).length;
    const deep = plies.filter((p) => p >= 3).length;
    console.log('  ...died at the frontier (0) : ' + died + ' (' + pct(died, plies.length) + ')');
    console.log('  ...1-2 plies                : ' + oneOrTwo + ' (' + pct(oneOrTwo, plies.length) + ')');
    console.log('  ...3 or more                : ' + deep + ' (' + pct(deep, plies.length) + ')');
    const stops = {};
    for (const r of walked) stops[r.stop] = (stops[r.stop] || 0) + 1;
    console.log('  where the walk stopped:');
    for (const [k, v] of Object.entries(stops).sort((a, b) => b[1] - a[1])) {
      console.log('    ' + String(v).padStart(3) + '  ' + k);
    }
    const cand = walked.reduce((a, r) => a + r.candidates, 0);
    const surv = walked.reduce((a, r) => a + r.survivors, 0);
    const cdb = walked.reduce((a, r) => a + r.asked, 0);
    console.log('  candidates ' + cand + ' -> survivors ' + surv +
      '   (' + cdb + ' ChessDB requests in the walks, ' +
      (surv ? (cdb / surv).toFixed(1) : 'inf') + ' per survivor)');
  };

  report('NO EXPLORER GAMES  (the invented-line path)', rows.none);
  report('HAS GAMES          (contrast: same walk, real frontiers)', rows.some);
  console.log(NL + 'requests: explorer ' + req.explorer + ', chessdb ' + req.cdb);
})();
