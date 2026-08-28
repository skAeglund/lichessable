/**
 * dev/probe-chessdb-queue.js — does `action=queue` widen what ChessDB will
 * grade, and by enough to be worth spending a volunteer network's compute on?
 *
 * THE QUESTION. DESIGN-intuition-storm.md §6.2 measured that the binding
 * constraint on the storm's yield is ChessDB's elaboration, not chess: 27 of 54
 * candidate rejections and 11 of 18 walk stops are the database running out.
 * Those are TWO different failures and `queue` may fix one, both, or neither:
 *
 *   UNKNOWN — the position is not in the graph at all. `learn=1` cannot fill it
 *             in (DESIGN-chessdb.md §3.4), so the walk stops dead. §2.4 of that
 *             document already ground-truthed ONE position here: queued, and
 *             ~25 minutes later it answered `ok` with all 7 moves scored.
 *   THIN    — the position IS known, but `learn=1` returns a short list (§3.3
 *             measured 36/36 at ply 1 decaying to 6/6 by ply 13), so `minScored`
 *             rejects it for want of a spread. THIS IS THE UNMEASURED HALF, and
 *             it is the larger one: 16 of 54 rejections, the joint-largest
 *             single reason. Whether `queue` widens a thin list or merely
 *             deepens the scores already there decides whether queueing is a
 *             ~20% yield bump or close to a doubling.
 *
 * WHY IT NEEDS A CONTROL ARM. `learn=1` fill-ins are computed on the spot and
 * do not persist (DESIGN-chessdb.md §3.2, checked directly), and the
 * distributed book grows on its own from everybody else's traffic. So "I queued
 * it and later it was better" is not evidence. Every collected position is
 * assigned to a QUEUED or a CONTROL arm, alternating so the two arms match on
 * depth and course, and only the queued arm is ever written to. The control arm
 * is the null hypothesis and costs nothing but two reads.
 *
 * !! THIS FILE PERFORMS THE ONLY WRITE THIS REPOSITORY EVER MAKES TO A THIRD
 *    PARTY. `queue` spends volunteer compute. Therefore:
 *      * a dry run is the DEFAULT — `--queue` is required to send anything
 *      * `--max` caps each arm (default 10), so a full run queues ~20 positions
 *      * queue calls are rate-limited to one per `QUEUE_GAP_MS`
 *      * nothing here is reachable from the extension: background.js's
 *        `handleChessdbFetch` is an allow-list of `queryall|querypv`, and this
 *        probe deliberately does NOT go through it
 *    If this ever becomes a feature it must stay behind an explicit press with
 *    its own cap — DESIGN-chessdb.md §2.4, and CLAUDE.md's section 27 rule.
 *
 * TWO PHASES, because the turnaround is tens of minutes:
 *
 *   node dev/probe-chessdb-queue.js --collect --bid 291847 --n 14          (dry run)
 *   node dev/probe-chessdb-queue.js --collect --bid 291847 --n 14 --queue  (sends)
 *   ... wait 30-60 minutes ...
 *   node dev/probe-chessdb-queue.js --recheck
 *
 * `--collect` walks the course exactly as dev/probe-storm.js does — same
 * frontier selection, same stop rules, same `minScored` — so the positions it
 * collects are exactly the ones the storm actually loses, not a synthetic
 * sample. It writes dev/tmp-queue-probe.json (gitignored).
 *
 * NEEDS: dev/tmp-courses.json (gitignored — recipe in the header of
 * dev/probe-course-tree.js) and local-token.json for the explorer's Bearer token.
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
const STATE_FILE = path.join(__dirname, 'tmp-queue-probe.json');

// The shipped resolver, sliced out so this cannot drift from the source.
const { sanToUci } = new Function('CloSan', 'squareName', [
  sliceDecl('RELAXED_SAN_RE'), sliceDecl('sanToUciRelaxed'), sliceDecl('sanToUci'),
  'return { sanToUci };',
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
  let fen = v.fen || START_FEN;
  const plies = [];
  for (const san of v.sans) {
    const pos = CloSan.parseFen(fen);
    const uci = pos && sanToUci(pos, san);
    const after = uci && fenAfterUci(fen, uci);
    if (!after) return null;
    plies.push({ san, uci });
    fen = after;
  }
  return { plies, end: fen };
}

const legalCount = (fen) => {
  const pos = CloSan.parseFen(fen);
  return pos ? CloSan.generateMoves(pos).length : 0;
};

// --- the storm's own rules, so the sample is the storm's own losses ---------
const C = {
  maxPly: 16, minPly: 2, blunderCp: 150, decidedCp: 250,
  userLoCp: -100, userHiCp: 200, minScored: 6,
};
const QUEUE_GAP_MS = 1100;   // politeness: one write per ~second, never a burst
const CDB_TRIES = 4;         // chessdb.cn times out often enough to matter
const CDB_RETRY_MS = 2500;   // ...backing off linearly: 2.5s, 5s, 7.5s

// --- tiny http -------------------------------------------------------------
const TOKEN = (() => {
  try {
    return JSON.parse(fs.readFileSync(
      path.join(__dirname, '..', 'local-token.json'), 'utf8')).lichessToken || '';
  } catch (e) { return ''; }
})();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reqCount = { explorer: 0, pgn: 0, cdbRead: 0, cdbQueue: 0 };

/**
 * NEVER THROWS. chessdb.cn is intermittently unreachable — measured 2 of 3
 * attempts timing out at 10 s, the third landing in 7.8 s — and an unhandled
 * fetch rejection here killed a whole 45-minute recheck once already. A caller
 * gets `__err` and decides what that means; it must never look like data.
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
  if (d.__err) return { err: 'explorer ' + d.__err, games: [] };
  return { games: [].concat(d.topGames || [], d.recentGames || []) };
}

async function gamePgn(id) {
  reqCount.pgn++;
  const r = await fetch('https://lichess.org/game/export/' + id +
    '?evals=false&clocks=false&literate=false');
  return r.ok ? r.text() : '';
}

/**
 * The full `queryall` answer, NOT filtered to scored moves — this probe's whole
 * subject is how many moves come back at all, so `listed` and `scored` are two
 * different numbers here and both are recorded.
 */
async function cdbAsk(fen, learn) {
  const q = new URLSearchParams({
    action: 'queryall', board: fen, json: '1', learn: String(learn),
  });
  let d = null;
  for (let attempt = 0; attempt < CDB_TRIES; attempt++) {
    reqCount.cdbRead++;
    d = await getJson('https://www.chessdb.cn/cdb.php?' + q);
    if (!d.__err) break;
    if (attempt < CDB_TRIES - 1) await sleep(CDB_RETRY_MS * (attempt + 1));
  }
  // A TRANSPORT FAILURE IS NOT A MEASUREMENT. `ok: false` is what keeps it out
  // of every mean and counter in the report — returning `scored: 0` here would
  // read as "this position collapsed to nothing", which is the one wrong answer
  // this probe could produce with total confidence.
  if (d.__err) {
    return { ok: false, status: 'unreachable (' + d.__err + ')', listed: 0, scored: 0, best: null, top: [] };
  }
  const moves = d.moves || [];
  const scored = moves.filter((m) => typeof m.score === 'number')
    .sort((a, b) => b.score - a.score);
  return {
    ok: true,
    status: d.status || 'unknown',
    listed: moves.length,
    scored: scored.length,
    best: scored.length ? scored[0].score : null,
    top: scored.slice(0, 5).map((m) => m.san + ' ' + m.score),
  };
}

/** THE WRITE. Guarded by --queue at the one call site; never called otherwise. */
async function cdbQueue(fen) {
  reqCount.cdbQueue++;
  const q = new URLSearchParams({ action: 'queue', board: fen, json: '1' });
  try {
    const r = await fetch('https://www.chessdb.cn/cdb.php?' + q);
    const body = (await r.text()).trim();
    return r.ok ? (body || 'ok') : ('HTTP ' + r.status);
  } catch (e) { return 'error ' + String(e); }
}

const PGN_HEADER_RE = /^\[.*$/gm;
const PGN_COMMENT_RE = /\{[^}]*\}/g;
const PGN_NAG_RE = /\$\d+/g;
const PGN_NUM_RE = /\b\d+\.(\.\.)?/g;
const PGN_RESULT_RE = /(1-0|0-1|1\/2-1\/2|\*)\s*$/;

function pgnMoves(pgn) {
  return String(pgn)
    .replace(PGN_HEADER_RE, '')
    .replace(PGN_COMMENT_RE, '')
    .replace(PGN_NAG_RE, '')
    .replace(PGN_NUM_RE, '')
    .replace(PGN_RESULT_RE, '')
    .split(/\s+/).filter(Boolean);
}

// --- phase 1: collect ------------------------------------------------------
const collectSkips = {};
const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };

/**
 * Walk one game from the frontier under the storm's own stop rules, recording
 * the two ChessDB-elaboration failures rather than the survivors.
 *
 * It stops on `unknown` exactly as the storm does. Walking PAST an unknown to
 * harvest more of them would collect positions the storm never reaches, which
 * is a different (and flattering) sample.
 */
async function walkGame(frontierFen, userSide, sans, found) {
  let fen = START_FEN;
  let i = 0;
  const target = cacheKey(frontierFen);
  while (i < sans.length && cacheKey(fen) !== target) {
    const pos = CloSan.parseFen(fen);
    const uci = pos && sanToUci(pos, sans[i]);
    const after = uci && fenAfterUci(fen, uci);
    if (!after) return;
    fen = after;
    i++;
  }
  if (cacheKey(fen) !== target) return;

  for (let k = 0; k < C.maxPly && i + k < sans.length; k++) {
    const pos = CloSan.parseFen(fen);
    if (!pos) return;

    const a = await cdbAsk(fen, 1);
    await sleep(90);

    // An unreachable host is not an `unknown` position. Collecting one as such
    // would put a position ChessDB may know perfectly well into the sample the
    // whole experiment is measured on.
    if (!a.ok) { bump(collectSkips, 'chessdb unreachable'); return; }

    if (a.status !== 'ok' || !a.scored) {
      found.push({ kind: 'unknown', fen, ply: k + 1, legal: legalCount(fen), base: a });
      return;                                   // the storm's own stop
    }
    if (Math.abs(a.best) > C.decidedCp) return;

    if (pos.side === userSide && k + 1 >= C.minPly && a.scored < C.minScored) {
      found.push({ kind: 'thin', fen, ply: k + 1, legal: legalCount(fen), base: a });
    }

    const uci = sanToUci(pos, sans[i + k]);
    if (!uci) return;
    const after = fenAfterUci(fen, uci);
    if (!after) return;
    fen = after;
  }
}

async function collect(courses, wantBid, nFrontiers, perArm, doQueue) {
  const found = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  for (const entry of Object.entries(courses)) {
    const bid = entry[0];
    const course = entry[1];
    if (wantBid && bid !== wantBid) continue;

    const byEnd = new Map();
    for (const v of course.vars) {
      if (!v.sans || !v.sans.length) continue;
      // A custom start FEN is a tactics puzzle or a model-game fragment: no real
      // game passes through its frontier (§6.4), so it can never be a source.
      if (v.fen && cacheKey(v.fen) !== cacheKey(START_FEN)) continue;
      const w = walkVariation(v);
      if (!w || w.plies.length < 4) continue;
      const ck = cacheKey(w.end);
      if (!byEnd.has(ck)) {
        byEnd.set(ck, {
          fen: w.end,
          side: String(v.color || '').toLowerCase().charAt(0) === 'b' ? 'b' : 'w',
          name: String(v.name || v.oid).slice(0, 44),
        });
      }
    }

    const pool = [...byEnd.values()];
    const sample = [];
    for (let i = 0; i < nFrontiers && pool.length; i++) {
      sample.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    }
    console.log('='.repeat(74));
    console.log(bid + '  ' + course.name + '  - sampling ' + sample.length +
      ' of ' + byEnd.size + ' frontiers');

    for (const f of sample) {
      const res = await explorerGames(f.fen);
      await sleep(120);
      if (res.err || !res.games.length) {
        console.log('  ' + f.name.padEnd(46) + ' ' + (res.err || 'no games'));
        continue;
      }
      const before = found.length;
      for (const g of res.games.slice(0, 2)) {
        const pgn = await gamePgn(g.id);
        await sleep(120);
        const sans = pgnMoves(pgn);
        if (sans.length) await walkGame(f.fen, f.side, sans, found);
      }
      for (const x of found.slice(before)) x.from = f.name;
      console.log('  ' + f.name.padEnd(46) + ' +' + (found.length - before) + ' collected');
    }
  }

  // ARMS. Alternate WITHIN each kind, so the two arms match on depth and course
  // rather than being split by collection order (which is course order).
  const items = [];
  for (const kind of ['unknown', 'thin']) {
    const of = found.filter((x) => x.kind === kind);
    for (let i = 0; i < of.length && i < perArm * 2; i++) {
      of[i].arm = (i % 2) ? 'control' : 'queued';
      items.push(of[i]);
    }
  }

  const tally = (k, a) => items.filter((x) => x.kind === k && x.arm === a).length;
  console.log(NL + '  collected: ' +
    'unknown ' + tally('unknown', 'queued') + 'q/' + tally('unknown', 'control') + 'c, ' +
    'thin ' + tally('thin', 'queued') + 'q/' + tally('thin', 'control') + 'c');
  for (const s of Object.entries(collectSkips)) {
    console.log('  walks abandoned: ' + s[1] + '  ' + s[0]);
  }
  console.log('  requests: ' + JSON.stringify(reqCount));

  const toQueue = items.filter((x) => x.arm === 'queued');
  if (!doQueue) {
    console.log(NL + '  DRY RUN - nothing was sent. ' + toQueue.length +
      ' positions WOULD be queued.');
    console.log('  Re-run with --queue to spend them, then --recheck in 30-60 min.');
  } else {
    console.log(NL + '  QUEUEING ' + toQueue.length + ' positions, one per ' +
      QUEUE_GAP_MS + 'ms...');
    for (const x of toQueue) {
      x.queueReply = await cdbQueue(x.fen);
      x.queuedAt = Date.now();
      await sleep(QUEUE_GAP_MS);
    }
    const okN = toQueue.filter((x) => /ok/i.test(String(x.queueReply))).length;
    console.log('  ' + okN + ' of ' + toQueue.length + ' accepted.');
  }

  fs.writeFileSync(STATE_FILE, JSON.stringify({
    at: Date.now(), queued: doQueue, items,
  }, null, 1));
  console.log('  wrote ' + path.relative(process.cwd(), STATE_FILE));
}

// --- phase 2: recheck ------------------------------------------------------
async function recheck() {
  let state;
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (e) {
    console.error('no ' + path.relative(process.cwd(), STATE_FILE) + ' - run --collect first');
    process.exit(2);
  }
  if (!state.queued) {
    console.log('!! that collection was a DRY RUN - nothing was queued, so both');
    console.log('   arms are controls. Useful only as a drift measurement.' + NL);
  }
  const mins = Math.round((Date.now() - state.at) / 60000);
  console.log('collected ' + mins + ' minutes ago; rechecking ' +
    state.items.length + ' positions' + NL);

  // RESUMABLE, and it has to be: chessdb.cn goes unreachable for minutes at a
  // time, and losing a whole read-back to one blip already happened once. Each
  // answered position is written back to the state file as it lands, so a
  // re-run picks up only what is still missing (--refresh forces all of them).
  const forceAll = has('refresh');
  let done = 0;
  let failed = 0;
  for (const x of state.items) {
    if (!forceAll && x.now && x.now.ok && x.now0 && x.now0.ok) { done++; continue; }
    x.now = await cdbAsk(x.fen, 1);
    await sleep(90);
    x.now0 = await cdbAsk(x.fen, 0);      // the honest book signal (§3.3)
    await sleep(90);
    if (x.now.ok && x.now0.ok) done++; else failed++;
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1));
  }
  console.log('  read back ' + done + ' of ' + state.items.length +
    (failed ? '   (' + failed + ' unreachable — re-run --recheck to retry those)' : '') + NL);

  for (const kind of ['unknown', 'thin']) {
    const rows = state.items.filter((x) => x.kind === kind);
    if (!rows.length) continue;
    const lost = rows.filter((x) => !x.now || !x.now.ok).length;
    console.log('-'.repeat(74));
    console.log('KIND: ' + kind + '   (' + rows.length + ' positions' +
      (lost ? ', ' + lost + ' NOT READ BACK and excluded' : '') + ')');
    for (const arm of ['queued', 'control']) {
      // Only positions actually read back. A transport failure must not be
      // averaged in as a zero — see cdbAsk.
      const a = rows.filter((x) => x.arm === arm && x.now && x.now.ok);
      if (!a.length) { console.log('  ' + arm + ': none read back'); continue; }
      const known = a.filter((x) => x.now.status === 'ok' && x.now.scored > 0).length;
      const wasKnown = a.filter((x) => x.base.status === 'ok' && x.base.scored > 0).length;
      const wider = a.filter((x) => x.now.scored > x.base.scored).length;
      const same = a.filter((x) => x.now.scored === x.base.scored).length;
      const narrower = a.filter((x) => x.now.scored < x.base.scored).length;
      const mean = (f) => (a.reduce((s, x) => s + f(x), 0) / a.length).toFixed(1);
      console.log('  ' + arm.padEnd(8) + ' n=' + a.length +
        '   scored ' + mean((x) => x.base.scored) + ' -> ' + mean((x) => x.now.scored) +
        '   (of ' + mean((x) => x.legal) + ' legal)');
      const book = a.filter((x) => x.now0 && x.now0.ok);
      console.log('           known ' + wasKnown + ' -> ' + known +
        '   widened ' + wider + '  same ' + same + '  narrowed ' + narrower +
        (book.length
          ? '   book(learn=0) now ' +
            (book.reduce((s, x) => s + x.now0.scored, 0) / book.length).toFixed(1)
          : '   book(learn=0) not read'));
    }
    console.log(NL + '  per position:');
    for (const x of rows) {
      const ok = x.now && x.now.ok;
      console.log('    ' + x.arm.padEnd(8) + ' +' + String(x.ply).padStart(2) + 'ply  ' +
        String(x.base.status).padEnd(8) +
        ' scored ' + String(x.base.scored).padStart(2) + ' -> ' +
        (ok ? String(x.now.scored).padStart(2) : '??') +
        ' / ' + String(x.legal).padStart(2) + ' legal' +
        '   book ' + ((x.now0 && x.now0.ok) ? String(x.now0.scored).padStart(2) : '??') +
        (ok ? '' : '   [' + x.now.status + ']'));
      console.log('             ' + x.fen);
    }
    console.log();
  }

  console.log('-'.repeat(74));
  console.log('requests this run: ' + JSON.stringify(reqCount));
  console.log(NL + 'READ IT LIKE THIS:');
  console.log('  * queued widens and control does not  -> queue helps, build it');
  console.log('  * both widen about equally            -> the book grew anyway; queue is noise');
  console.log('  * neither widens                      -> queue deepens scores only,');
  console.log('    and the `thin` half of the yield is NOT recoverable this way.');
  console.log('  The `unknown` rows answer the easier question and should flip to');
  console.log('  known in the queued arm (DESIGN-chessdb.md 2.4 saw exactly that,');
  console.log('  n=1). The `thin` rows are the ones this probe exists for.');
}

// --- phase 3: why five? ----------------------------------------------------
/**
 * THE MEASUREMENT THAT SETTLES THE WHOLE QUESTION (2026-08-28).
 *
 * Both arms converge on exactly five scored moves and stay there. This asks
 * why, by probing every CHILD of a position with `learn=0`:
 *
 *   legal moves 43   children in the book 5   parent scores 5
 *   known child AND scored 5 / known but not scored 0 / scored but unknown 0
 *
 * A perfect 1:1. `learn=1` scores exactly the moves whose CHILD is in the
 * graph, so the width of the answer is a property of the children — and
 * `action=queue` on the PARENT cannot change it at any timescale. Widening one
 * position would mean queueing its ~38 unknown children; a 200-position gather
 * would be ~7600 writes. That is the argument against queueing, and it is
 * structural rather than a matter of waiting longer.
 *
 * Reads only.
 */
async function whyFive() {
  let state;
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (e) {
    console.error('no ' + path.relative(process.cwd(), STATE_FILE) + ' - run --collect first');
    process.exit(2);
  }
  const target = state.items.find((x) => x.arm === 'queued' && x.now && x.now.ok) ||
    state.items.find((x) => x.now && x.now.ok);
  if (!target) { console.error('nothing read back yet - run --recheck first'); process.exit(2); }

  console.log('POSITION (' + target.kind + ', ' + target.arm + ', +' + target.ply + 'ply, ' +
    Math.round((Date.now() - state.at) / 60000) + ' min since the queue call)');
  console.log(target.fen + NL);

  const parent = await cdbAsk(target.fen, 1);
  if (!parent.ok) { console.error('parent unreachable: ' + parent.status); process.exit(1); }
  const full = await getJson('https://www.chessdb.cn/cdb.php?' + new URLSearchParams({
    action: 'queryall', board: target.fen, json: '1', learn: '1',
  }));
  const scoredUci = new Set((full.moves || [])
    .filter((m) => typeof m.score === 'number').map((m) => m.uci));
  console.log('learn=1 scores ' + scoredUci.size + ' of ' + (full.moves || []).length + ' listed');

  const pos = CloSan.parseFen(target.fen);
  const legal = CloSan.generateMoves(pos);
  console.log('legal moves: ' + legal.length + NL + 'probing every child with learn=0...' + NL);

  let known = 0;
  let knownScored = 0;
  let knownUnscored = 0;
  let unknownScored = 0;
  for (const mv of legal) {
    const uci = squareName(mv.from) + squareName(mv.to) + (mv.promo || '');
    const child = fenAfterUci(target.fen, uci);
    if (!child) continue;
    const d = await cdbAsk(child, 0);
    await sleep(120);
    if (!d.ok) { console.log('  ' + uci.padEnd(6) + 'unreachable'); continue; }
    const isKnown = d.status === 'ok';
    const isScored = scoredUci.has(uci);
    if (isKnown) known++;
    if (isKnown && isScored) knownScored++;
    if (isKnown && !isScored) knownUnscored++;
    if (!isKnown && isScored) unknownScored++;
    console.log('  ' + uci.padEnd(6) + (isKnown ? 'child KNOWN  ' : 'child unknown') +
      (isScored ? '   <- parent scores it' : ''));
  }

  console.log(NL + '-'.repeat(60));
  console.log('legal moves            : ' + legal.length);
  console.log('children in the book   : ' + known);
  console.log('parent scores          : ' + scoredUci.size);
  console.log('  known child AND scored   : ' + knownScored);
  console.log('  known child, NOT scored  : ' + knownUnscored);
  console.log('  unknown child, yet scored: ' + unknownScored);
  console.log(NL + 'A 1:1 match means the width is a property of the CHILDREN, so');
  console.log('queueing the parent cannot widen it however long you wait.');
}

// --- main ------------------------------------------------------------------
function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1] : dflt;
}
const has = (name) => process.argv.indexOf('--' + name) > 0;

async function main() {
  if (has('recheck')) return recheck();
  if (has('children')) return whyFive();
  if (!has('collect')) {
    console.log('usage: node dev/probe-chessdb-queue.js --collect [--bid N] [--n 14]');
    console.log('                                       [--max 10] [--queue]');
    console.log('       node dev/probe-chessdb-queue.js --recheck [--refresh]');
    console.log('       node dev/probe-chessdb-queue.js --children   (why five?)');
    process.exit(2);
  }
  let courses;
  try {
    courses = require('./tmp-courses.json');
  } catch (e) {
    console.error('dev/tmp-courses.json missing - see the header of dev/probe-course-tree.js');
    process.exit(2);
  }
  if (!TOKEN) {
    console.error('local-token.json missing a lichessToken - the explorer needs a Bearer token');
    process.exit(2);
  }
  const doQueue = has('queue');
  if (doQueue) {
    console.log('!! --queue: this run WILL send `action=queue` to chessdb.cn.');
    console.log('   That spends volunteer compute (DESIGN-chessdb.md 2.4).');
    console.log('   Capped at ' + Number(arg('max', 10)) * 2 + ' positions, ' +
      QUEUE_GAP_MS + 'ms apart.' + NL);
  }
  await collect(courses, arg('bid', ''), Number(arg('n', 14)),
    Number(arg('max', 10)), doQueue);
}

main().catch((e) => { console.error(e); process.exit(1); });
