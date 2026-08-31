/**
 * dev/probe-cdb-quality.js — is a ChessDB `learn=1` score good enough to GRADE
 * a human's move with?
 *
 * DESIGN-intuition-storm.md §12.3 (and DESIGN-chessdb.md §10.1 arriving from the
 * other direction). It is the storm's core claim: tier 1 of §3.4 grades most
 * cards straight out of `queryall(P, learn=1)`, and §12.7b established that that
 * list is exactly the moves whose CHILD is in ChessDB's graph — a game-derived
 * number of unmeasured strength, not a search. If it is wrong by more than a
 * band width often enough, §16's five bands are measuring the wrong thing and no
 * amount of interface work matters.
 *
 * WHAT IT COMPARES. For each position, for each move ChessDB scores:
 *
 *     cdbLoss(m) = stormWpLoss(best of ChessDB's list, ChessDB's score for m)
 *     engLoss(m) = stormWpLoss(best of the engine's set, the engine's score for m)
 *
 * …and reports how often `stormGrade` puts the two in the SAME BAND. That is
 * the question stated in the units the verdict is stated in; a mean centipawn
 * error would answer a different one (§16 is the whole argument for why).
 * The raw |cp| spread is printed beside it, split by whether the move is in the
 * REAL book (`learn=0`) or is a `learn=1` fill-in — DESIGN-chessdb.md §3.3's own
 * confidence signal, and the one thing this probe must not conflate.
 *
 * THREE THINGS ABOUT THE ENGINE HALF, all of which bias the answer if forgotten:
 *
 *  1. BOTH SCORES ARE THE MOVER'S. ChessDB's `queryall` is mover-perspective and
 *     so is raw UCI `score cp`. NOTHING IS FLIPPED HERE — unlike `stormMoverCp`
 *     in the extension, which flips because engine/engine.js has already
 *     normalised to White. Do not "fix" that asymmetry by adding a flip.
 *  2. THE SEARCH IS RESTRICTED to the candidate moves (`searchmoves` + MultiPV),
 *     so the engine's best is the best OF THAT SET. The set always contains
 *     ChessDB's top four, so the true best is almost always in it; where it is
 *     not, every engine loss is understated by the same amount, which biases the
 *     report TOWARDS agreement. The optimistic direction is the safe one for a
 *     probe asking whether something is good enough.
 *  3. THE DEPTH IS A CEILING AND THE WALL CLOCK IS THE LIMIT — the same
 *     discipline v0.149.0 put into the shipped engine tier (§14.23). §12.3 asks
 *     for depth 30; measured here, depth 30 at MultiPV 8 is tens of minutes per
 *     position on the author's desktop (depth 24 alone took 220 s), so the run
 *     takes whatever depth the budget reaches and REPORTS it per position. A
 *     depth-20 Stockfish 18 reference is not the constraint on an answer whose
 *     resolution is a 33cp band.
 *
 * Not part of the extension; not referenced by the manifest.
 *
 * NEEDS: a survivor dump from `node dev/probe-storm.js --dump-fens <path>` and
 * engine/vendor/ (gitignored — see README).
 *
 *   node dev/probe-storm.js --bid 453453 --dump-fens dev/tmp-storm-fens.json
 *   node dev/probe-cdb-quality.js [--fens dev/tmp-storm-fens.json] [--n 20]
 *       [--depth 24] [--capms 120000] [--moves 10] [--threads 6] [--build lite]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { sliceDecl } = require('./slice-source.js');

const NL = String.fromCharCode(10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The shipped grade, sliced out rather than transcribed. `wpK` is Lichess's own
// fit and is not a dial (§16): a copy of it here that had drifted would answer
// this question about a curve the extension does not use.
const { stormWinPct, stormWpLoss, stormGrade } = new Function([
  sliceDecl('stormWinPct'), sliceDecl('stormWpLoss'), sliceDecl('stormGrade'),
  'return { stormWinPct, stormWpLoss, stormGrade };',
].join(NL))();

const C = { wpK: 0, wpClampCp: 0, greatWp: 0, goodWp: 0, okWp: 0, badWp: 0 };
(() => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'content', 'lichessable.js'), 'utf8');
  const start = src.indexOf('storm: {');
  const body = src.slice(start, src.indexOf(NL + '    },', start));
  // THROWS rather than defaulting, for probe-storm.js's reason: a default
  // quietly standing in for a number that could not be read would be invisible.
  for (const name of Object.keys(C)) {
    const m = new RegExp('\\b' + name + ':\\s*(-?[0-9.]+)').exec(body);
    if (!m) throw new Error('CONFIG.storm.' + name + ' not readable from the shipped file');
    C[name] = Number(m[1]);
  }
})();

const BANDS = ['great', 'good', 'ok', 'bad', 'blunder'];

// --- args ------------------------------------------------------------------
function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const FENS = arg('fens', path.join(__dirname, 'tmp-storm-fens.json'));
const WANT = Number(arg('n', 20));
const DEPTH = Number(arg('depth', 24));
const CAP_MS = Number(arg('capms', 120000));
const MAX_MOVES = Number(arg('moves', 10));
const THREADS = arg('threads', '6');
const BUILD = arg('build', 'lite') === 'full' ? 'stockfish-18' : 'stockfish-18-lite';
const DUMP = arg('dump', '');

// --- chessdb ---------------------------------------------------------------
/**
 * `fetch` IS CAPTURED HERE, BEFORE THE ENGINE BOOTS, AND THAT IS LOAD-BEARING.
 * The vendored Emscripten glue installs an XMLHttpRequest shim for node and
 * then does a bare `fetch = null` — an assignment to the global, not a local —
 * so every ChessDB request after `bootEngine()` fails with the same "not a
 * function" a network outage would produce, four retries deep, and the run
 * reports every position as unknown to ChessDB. Measured 2026-08-29.
 */
const httpFetch = globalThis.fetch.bind(globalThis);
const reqCount = { cdb: 0 };
async function getJson(url) {
  try {
    const r = await httpFetch(url);
    if (!r.ok) return { __err: 'HTTP ' + r.status };
    return await r.json();
  } catch (e) {
    return { __err: String((e && e.cause && e.cause.code) || (e && e.message) || e) };
  }
}

/** probe-storm.js's `cdbScored`, same retry and the same `undefined` vs `null`. */
async function cdbScored(fen, learn) {
  const q = new URLSearchParams({ action: 'queryall', board: fen, json: '1', learn: String(learn) });
  let d = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    reqCount.cdb++;
    d = await getJson('https://www.chessdb.cn/cdb.php?' + q);
    if (!d.__err) break;
    if (attempt < 3) await sleep(2500 * (attempt + 1));
  }
  if (d.__err) return undefined;
  if (d.status !== 'ok') return null;
  const moves = (d.moves || []).filter((m) => typeof m.score === 'number');
  moves.sort((a, b) => b.score - a.score);
  return moves;
}

// --- engine ----------------------------------------------------------------
/**
 * The vendored WASM build, driven from node. THREE things about it that cost an
 * afternoon to find, recorded so the next reader does not:
 *
 *  - `locateFile` is asked for BOTH `stockfish.wasm` AND `stockfish.worker.js`,
 *    so it must answer by extension. Returning the .wasm for everything makes
 *    the pthread worker try to import the .wasm as an ES module, and the error
 *    it prints ("Cannot find package 'a'") names neither file.
 *  - OUTPUT COMES OUT OF `listener`, NOT `print`. The glue overwrites `print`
 *    with its own function immediately after merging the config, so a `print`
 *    override is silently ignored and the caller waits for a `bestmove` that is
 *    going to `console.log` instead.
 *  - options are not registered the instant `ready` resolves; a `setoption` sent
 *    too early answers "No such option: Threads" and is dropped.
 */
async function bootEngine() {
  const V = path.join(__dirname, '..', 'engine', 'vendor');
  for (const f of [BUILD + '.js', BUILD + '.wasm']) {
    if (!fs.existsSync(path.join(V, f))) {
      console.error('engine/vendor/' + f + ' missing — see README, engine vendoring');
      process.exit(2);
    }
  }
  const lines = [];
  const factory = require(path.join(V, BUILD + '.js'))();
  const sf = await factory({
    locateFile: (p) => path.join(V, BUILD + (p.endsWith('.wasm') ? '.wasm' : '.js')),
    listener: (s) => { lines.push(String(s)); },
  });
  const cmd = (c) => sf.ccall('command', null, ['string'], [c]);
  cmd('uci');
  await sleep(2500);
  cmd('setoption name Threads value ' + THREADS);
  cmd('setoption name Hash value 256');
  await sleep(500);
  const bad = lines.filter((l) => /No such option/.test(l));
  if (bad.length) { console.error(bad.join(NL)); process.exit(2); }
  return { cmd, lines };
}

/** `score cp|mate` -> centipawns, mover's perspective, mates on ChessDB's scale. */
function parseScore(line) {
  const m = /\bscore (cp|mate) (-?\d+)\b/.exec(line);
  if (!m) return null;
  const n = Number(m[2]);
  return m[1] === 'cp' ? n : (n >= 0 ? 30000 - n : -30000 - n);
}

/**
 * One MultiPV search restricted to `ucis`. Returns the best score reached for
 * each of them plus the depth that actually ran.
 *
 * A LINE SHORT OF THE FINAL DEPTH IS KEPT, not discarded — §14.23's rule, and
 * the whole reason the budget can be a wall clock. `lowerbound`/`upperbound`
 * lines are dropped: they are a search in progress, not an evaluation.
 */
async function searchMoves(eng, fen, ucis) {
  eng.lines.length = 0;
  eng.cmd('setoption name MultiPV value ' + ucis.length);
  eng.cmd('position fen ' + fen);
  eng.cmd('go depth ' + DEPTH + ' searchmoves ' + ucis.join(' '));
  const t0 = Date.now();
  let stopped = false;
  await new Promise((resolve) => {
    const iv = setInterval(() => {
      if (eng.lines.some((l) => l.startsWith('bestmove'))) { clearInterval(iv); resolve(); return; }
      if (!stopped && Date.now() - t0 > CAP_MS) { stopped = true; eng.cmd('stop'); }
    }, 100);
  });
  const elapsed = Date.now() - t0;
  const byPv = new Map();
  for (const l of eng.lines) {
    if (!/^info /.test(l) || /\b(lowerbound|upperbound)\b/.test(l)) continue;
    const d = /\bdepth (\d+)\b/.exec(l);
    const pv = /\bmultipv (\d+)\b/.exec(l);
    const first = / pv ([a-h][1-8][a-h][1-8][qrbn]?)/.exec(l);
    const sc = parseScore(l);
    if (!d || !pv || !first || sc === null) continue;
    const prev = byPv.get(first[1]);
    if (!prev || Number(d[1]) >= prev.depth) byPv.set(first[1], { depth: Number(d[1]), cp: sc });
  }
  let depth = Infinity;
  for (const v of byPv.values()) depth = Math.min(depth, v.depth);
  return { scores: byPv, depth: Number.isFinite(depth) ? depth : 0, elapsed, capped: stopped };
}

/**
 * The moves to ask about. ChessDB's top four ALWAYS (so the engine's best is
 * almost certainly inside the set — see the header's point 2), then the rest of
 * its list evenly spaced down to the worst move it names.
 *
 * SPREAD RATHER THAN TOP-N, deliberately: the moves a grade is most likely to
 * get wrong are the BAD ones a human plays, and a top-10 slice of a 40-move list
 * would never contain one.
 */
function pickMoves(scored, max) {
  const keep = [];
  const take = (i) => { if (i >= 0 && i < scored.length && keep.indexOf(i) < 0) keep.push(i); };
  for (let i = 0; i < Math.min(4, scored.length); i++) take(i);
  const rest = max - keep.length;
  for (let j = 0; j < rest; j++) {
    take(4 + Math.round(j * (scored.length - 5) / Math.max(1, rest - 1)));
  }
  return keep.sort((a, b) => a - b).map((i) => scored[i]);
}

// --- main ------------------------------------------------------------------
async function main() {
  let positions;
  try {
    positions = JSON.parse(fs.readFileSync(FENS, 'utf8'));
  } catch (e) {
    console.error(FENS + ' missing — run:' + NL +
      '  node dev/probe-storm.js --bid 453453 --dump-fens ' + FENS);
    process.exit(2);
  }
  // Distinct positions only. The storm never shows one twice in a session
  // (CLAUDE.md section 27), so measuring one twice here would weight it twice.
  const seen = new Set();
  positions = positions.filter((p) => {
    const k = p.fen.split(' ').slice(0, 4).join(' ');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, WANT);

  console.log('positions: ' + positions.length + ' from ' + FENS);
  console.log('engine: ' + BUILD + ', ' + THREADS + ' threads, depth ceiling ' +
    DEPTH + ', ' + (CAP_MS / 1000) + 's per position');
  console.log('bands (wp given up): great <' + C.greatWp + '  good <' + C.goodWp +
    '  ok <' + C.okWp + '  bad <' + C.badWp + '  blunder >=' + C.badWp + NL);

  const eng = await bootEngine();
  const rows = [];
  const posInfo = [];
  const depths = [];
  let bestAgree = 0;
  let bestBoth = 0;

  for (let n = 0; n < positions.length; n++) {
    const p = positions[n];
    const scored = await cdbScored(p.fen, 1);
    await sleep(90);
    if (!scored || !scored.length) {
      // `undefined` is a transport failure and `null` is a genuinely unknown
      // position — probe-storm.js's distinction, kept because reporting one as
      // the other is how a broken run reads as a finding about ChessDB.
      console.log((n + 1) + '. ' + p.fen + '  — ' +
        (scored === undefined ? 'ChessDB unreachable' : 'not in ChessDB') + ', skipped');
      continue;
    }
    const book = await cdbScored(p.fen, 0);
    await sleep(90);
    const bookSet = new Set((book || []).map((m) => m.uci));

    const cands = pickMoves(scored, MAX_MOVES);
    const res = await searchMoves(eng, p.fen, cands.map((m) => m.uci));
    depths.push(res.depth);

    const cdbBest = scored[0].score;
    let engBest = -Infinity;
    for (const m of cands) {
      const e = res.scores.get(m.uci);
      if (e && e.cp > engBest) engBest = e.cp;
    }
    if (!Number.isFinite(engBest)) {
      console.log((n + 1) + '. ' + p.fen + '  — the engine returned nothing, skipped');
      continue;
    }
    let engBestUci = '';
    for (const m of cands) {
      const e = res.scores.get(m.uci);
      if (e && e.cp === engBest && !engBestUci) engBestUci = m.uci;
    }
    bestBoth++;
    const bestSame = engBestUci === scored[0].uci;
    if (bestSame) bestAgree++;
    const engBestSan = (cands.find((m) => m.uci === engBestUci) || {}).san || engBestUci;

    const here = [];
    for (const m of cands) {
      const e = res.scores.get(m.uci);
      if (!e) continue;
      const cdbLoss = stormWpLoss(cdbBest, m.score, C);
      const engLoss = stormWpLoss(engBest, e.cp, C);
      here.push({
        fen: p.fen, san: m.san, uci: m.uci, book: bookSet.has(m.uci),
        cdb: m.score, eng: e.cp, d: m.score - e.cp,
        cdbBand: stormGrade(cdbLoss, C), engBand: stormGrade(engLoss, C),
        cdbLoss, engLoss, offset: 0,
        // position-level context, copied onto every row so the dump is flat
        bid: p.bid, ply: p.ply, nScored: scored.length, nBook: bookSet.size,
        isTop: m.uci === scored[0].uci, bestSame,
        excess: 0, ceilGap: cdbBest - engBest,
        cdbLossFix: cdbLoss, cdbBandFix: stormGrade(cdbLoss, C),
      });
    }
    // §3.3's own claim, made measurable: "a uniformly shallow answer is still a
    // fair ranking". Most of a position's error turns out to be a COMMON
    // OFFSET — every move of it read the same amount too high or too low — and
    // a loss is a difference, so an offset shared by the best move and the
    // played move cancels out of the grade entirely. What does NOT cancel is
    // the residual after removing it. Splitting the two says whether ChessDB is
    // a poor evaluator that still ranks well, or simply noisy.
    if (here.length) {
      const ds = here.map((r) => r.d).sort((a, b) => a - b);
      const off = ds[Math.floor(ds.length / 2)];
      for (const r of here) r.offset = off;
    }

    // THE ANCHOR (2026-08-30). Every verdict in a position is a difference
    // against ONE number — the best score ChessDB names — so an error
    // concentrated THERE is multiplied across every other move, while the same
    // error spread evenly over the whole position cancels out of the grade.
    // `excess` isolates exactly that: how much more optimistic ChessDB is about
    // its own top move than it is about the rest of the same position. It is
    // offset-free by construction, which is what makes it a different question
    // from the residual above.
    const topRow = here.find((r) => r.isTop) || null;
    const rest = here.filter((r) => !r.isTop).map((r) => r.d).sort((a, b) => a - b);
    const dMed = rest.length ? rest[Math.floor(rest.length / 2)] : 0;
    const excess = topRow ? topRow.d - dMed : 0;
    // The counterfactual: ChessDB's own move scores, with its top move brought
    // back down by `excess`, re-graded. What survives is the damage its
    // individual move scores do; what vanishes is the damage the anchor does.
    if (topRow) {
      const fixed = new Map(here.map((r) => [r.uci, r.cdb - (r.isTop ? excess : 0)]));
      let fixBest = -Infinity;
      for (const v of fixed.values()) if (v > fixBest) fixBest = v;
      for (const r of here) {
        r.excess = excess;
        r.cdbLossFix = stormWpLoss(fixBest, fixed.get(r.uci), C);
        r.cdbBandFix = stormGrade(r.cdbLossFix, C);
      }
    }
    posInfo.push({
      fen: p.fen, bid: p.bid, ply: p.ply, nScored: scored.length, nBook: bookSet.size,
      cdbBestSan: scored[0].san, cdbBestUci: scored[0].uci, cdbBest,
      engOfCdbTop: topRow ? topRow.eng : null, engBest, engBestSan, bestSame,
      dTop: topRow ? topRow.d : null, dMed, excess, ceilGap: cdbBest - engBest,
      moves: here.length, depth: res.depth, capped: res.capped,
    });
    rows.push.apply(rows, here);

    const same = here.filter((r) => r.cdbBand === r.engBand).length;
    console.log((n + 1) + '. ply +' + p.ply + '  ' + String(p.from).slice(0, 32).padEnd(32) +
      '  d' + String(res.depth).padStart(2) + (res.capped ? '*' : ' ') +
      ' ' + String((res.elapsed / 1000).toFixed(0) + 's').padStart(5) +
      '  ' + String(scored.length).padStart(2) + ' scored, ' +
      String(bookSet.size).padStart(2) + ' in book' +
      '  bands agree ' + same + '/' + here.length +
      (bestSame ? '  best ' + scored[0].san
        : '  BEST DIFFERS cdb ' + scored[0].san + ' eng ' + engBestSan));
    console.log('     ' + p.fen);
    for (const r of here) {
      console.log('       ' + (r.book ? 'book ' : 'fill ') + r.san.padEnd(7) +
        'cdb ' + String(r.cdb).padStart(6) + '   eng ' + String(r.eng).padStart(6) +
        '   d ' + String(r.d).padStart(6) +
        '   ' + r.cdbBand.padEnd(8) + ' / ' + r.engBand.padEnd(8) +
        (r.cdbBand === r.engBand ? '' : '  <-- differs'));
    }
  }

  // --- the report ----------------------------------------------------------
  console.log(NL + '='.repeat(74));
  console.log('moves compared: ' + rows.length + '   positions: ' + bestBoth +
    '   chessdb requests: ' + reqCount.cdb);
  depths.sort((a, b) => a - b);
  if (depths.length) {
    console.log('engine depth reached: min ' + depths[0] + '  median ' +
      depths[Math.floor(depths.length / 2)] + '  max ' + depths[depths.length - 1]);
  }
  console.log('ChessDB best move == the engine best of the set: ' +
    bestAgree + ' of ' + bestBoth);

  const buckets = [25, 50, 100, 200, Infinity];
  const dist = (arr) => {
    const out = buckets.map(() => 0);
    for (const r of arr) {
      const a = Math.abs(r.d);
      for (let i = 0; i < buckets.length; i++) if (a < buckets[i]) { out[i]++; break; }
    }
    return out.map((n, i) => (buckets[i] === Infinity ? '200+' : '<' + buckets[i]) + ': ' +
      String(n).padStart(4) + ' (' + String(Math.round(100 * n / (arr.length || 1))).padStart(3) + '%)');
  };
  console.log(NL + 'ChessDB minus engine, absolute centipawns:');
  console.log('  all       n=' + String(rows.length).padStart(4) + '   ' + dist(rows).join('  '));
  const bookRows = rows.filter((r) => r.book);
  const fillRows = rows.filter((r) => !r.book);
  console.log('  in book   n=' + String(bookRows.length).padStart(4) + '   ' + dist(bookRows).join('  '));
  console.log('  fill-in   n=' + String(fillRows.length).padStart(4) + '   ' + dist(fillRows).join('  '));
  const resid = rows.map((r) => ({ d: r.d - r.offset }));
  console.log('  residual  n=' + String(resid.length).padStart(4) + '   ' + dist(resid).join('  ') +
    '   (the same error with each position\'s own median offset removed)');

  // THE ANSWER, in the units the verdict is stated in.
  const agree = rows.filter((r) => r.cdbBand === r.engBand).length;
  const off1 = rows.filter((r) =>
    Math.abs(BANDS.indexOf(r.cdbBand) - BANDS.indexOf(r.engBand)) === 1).length;
  const off2 = rows.filter((r) =>
    Math.abs(BANDS.indexOf(r.cdbBand) - BANDS.indexOf(r.engBand)) >= 2).length;
  const pc = (n) => String(Math.round(100 * n / (rows.length || 1))).padStart(3) + '%';
  console.log(NL + 'VERDICT BAND, ChessDB vs engine, over the same move:');
  console.log('  same band            ' + String(agree).padStart(4) + '  ' + pc(agree));
  console.log('  one band out         ' + String(off1).padStart(4) + '  ' + pc(off1));
  console.log('  two bands or more    ' + String(off2).padStart(4) + '  ' + pc(off2));

  // A BAND DISAGREEMENT IS NOT THE SAME AS A GRADING ERROR, and reporting only
  // the first would overstate the damage badly. Five bands over a continuous
  // quantity means five thresholds, and two numbers 3cp apart either side of one
  // of them disagree about the WORD while agreeing about the move. So the same
  // comparison is printed in the underlying quantity too — how much win
  // probability the two sources say the move gave up — and the disagreements are
  // split on whether they are a straddle or a real difference.
  const wpD = rows.map((r) => Math.abs(r.cdbLoss - r.engLoss));
  const qw = (p) => (wpD.length
    ? wpD.slice().sort((a, b) => a - b)[Math.floor(p * (wpD.length - 1))].toFixed(2) : '0');
  console.log(NL + 'win probability given up, |ChessDB - engine| (points):');
  console.log('  median ' + qw(0.5) + '  p75 ' + qw(0.75) + '  p90 ' + qw(0.9) +
    '  p95 ' + qw(0.95) + '  max ' + qw(1));
  const diff = rows.filter((r) => r.cdbBand !== r.engBand);
  const straddle = diff.filter((r) => Math.abs(r.cdbLoss - r.engLoss) < 1).length;
  console.log('  of the ' + diff.length + ' band disagreements, ' + straddle +
    ' are within 1 wp point of each other (a threshold straddle, not a different answer)');

  // THE DECISION-RELEVANT COLLAPSE. Five bands, but `stormPoints` only ever
  // does one of three things with them: the top two SCORE, `ok` scores nothing,
  // the bottom two COST. A band disagreement inside one of those groups changes
  // a word on screen; one that crosses a group changes what the session says
  // the user did. Those are the two numbers to argue from.
  const grp = (b) => (BANDS.indexOf(b) <= 1 ? 'scores' : (b === 'ok' ? 'nothing' : 'costs'));
  const sameGrp = rows.filter((r) => grp(r.cdbBand) === grp(r.engBand)).length;
  console.log(NL + 'collapsed to what the answer DOES (scores / nothing / costs):');
  console.log('  same outcome         ' + String(sameGrp).padStart(4) + '  ' + pc(sameGrp));
  console.log('  scores <-> costs     ' +
    String(rows.filter((r) => (grp(r.cdbBand) === 'scores' && grp(r.engBand) === 'costs') ||
      (grp(r.cdbBand) === 'costs' && grp(r.engBand) === 'scores')).length).padStart(4));

  console.log(NL + '  rows = ChessDB, cols = engine');
  console.log('           ' + BANDS.map((b) => b.slice(0, 7).padStart(8)).join(''));
  for (const a of BANDS) {
    console.log('  ' + a.padEnd(9) + BANDS.map((b) =>
      String(rows.filter((r) => r.cdbBand === a && r.engBand === b).length).padStart(8)).join(''));
  }

  // The two failures that matter in opposite directions: a move the engine
  // calls a mistake that ChessDB scores as playable is the one that tells the
  // user they were right when they were not.
  const flattered = rows.filter((r) =>
    BANDS.indexOf(r.cdbBand) <= 1 && BANDS.indexOf(r.engBand) >= 3);
  const maligned = rows.filter((r) =>
    BANDS.indexOf(r.cdbBand) >= 3 && BANDS.indexOf(r.engBand) <= 1);
  console.log(NL + '  scored as good, engine says mistake or blunder: ' +
    flattered.length + '  (' + pc(flattered.length) + ')');
  console.log('  scored as mistake or blunder, engine says good: ' +
    maligned.length + '  (' + pc(maligned.length) + ')');
  for (const r of flattered.slice(0, 12)) {
    console.log('    ' + (r.book ? 'book ' : 'fill ') + r.san.padEnd(7) +
      'cdb ' + String(r.cdb).padStart(6) + ' -> ' + r.cdbBand.padEnd(8) +
      '   eng ' + String(r.eng).padStart(6) + ' -> ' + r.engBand + '   ' + r.fen);
  }
  // === THE ANCHOR (2026-08-30) ============================================
  // The report above answers "how far apart are the two sources, move by move".
  // This one answers a sharper question the shipped feature is exposed to: a
  // loss is measured against ONE number per position, so an error on THAT
  // number is paid by every other move in the position, while the same error
  // spread evenly cancels. `excess` is the anchor's error net of the rest of
  // the position, and the corrected columns are what the verdicts would have
  // been without it.
  const q = (arr, pr) => (arr.length
    ? arr.slice().sort((a, b) => a - b)[Math.floor(pr * (arr.length - 1))] : 0);
  const stat = (label, arr, unit) => {
    const f = (n) => (unit === 'cp' ? String(Math.round(n)) : n.toFixed(2));
    console.log('  ' + label.padEnd(26) +
      'median ' + f(q(arr, 0.5)).padStart(6) +
      '   p25 ' + f(q(arr, 0.25)).padStart(6) +
      '   p75 ' + f(q(arr, 0.75)).padStart(6) +
      '   min ' + f(q(arr, 0)).padStart(6) +
      '   max ' + f(q(arr, 1)).padStart(6));
  };
  console.log(NL + '='.repeat(74));
  console.log('THE ANCHOR - is ChessDB systematically too kind to its own best move?');
  console.log('positions: ' + posInfo.length + NL);
  console.log('  (all signed, ChessDB minus engine; + means ChessDB is the more optimistic)');
  stat('ceiling gap  best-best', posInfo.map((p2) => p2.ceilGap), 'cp');
  stat('error on cdb top move', posInfo.filter((p2) => p2.dTop !== null).map((p2) => p2.dTop), 'cp');
  stat('error on the rest', posInfo.map((p2) => p2.dMed), 'cp');
  stat('EXCESS = top - rest', posInfo.map((p2) => p2.excess), 'cp');
  const nPos = posInfo.length || 1;
  const cnt = (f) => posInfo.filter(f).length;
  console.log(NL + '  positions whose anchor is optimistic by:  ' +
    '>=25cp ' + cnt((p2) => p2.excess >= 25) + '/' + nPos +
    '   >=50cp ' + cnt((p2) => p2.excess >= 50) + '/' + nPos +
    '   >=100cp ' + cnt((p2) => p2.excess >= 100) + '/' + nPos);
  console.log('  ...pessimistic by:                        ' +
    '>=25cp ' + cnt((p2) => p2.excess <= -25) + '/' + nPos +
    '   >=50cp ' + cnt((p2) => p2.excess <= -50) + '/' + nPos +
    '   >=100cp ' + cnt((p2) => p2.excess <= -100) + '/' + nPos);

  // WHAT IT COSTS IN VERDICTS. Not "is the anchor wrong" but "how much of the
  // disagreement is the anchor's fault" - the only version of the question the
  // feature has to act on.
  const agreeFix = rows.filter((r) => r.cdbBandFix === r.engBand).length;
  const grpFix = rows.filter((r) => grp(r.cdbBandFix) === grp(r.engBand)).length;
  console.log(NL + 'VERDICT BAND with the anchor corrected (ChessDB own move scores kept):');
  console.log('  same band            ' + String(agreeFix).padStart(4) + '  ' + pc(agreeFix) +
    '   (as shipped: ' + agree + '  ' + pc(agree).trim() + ')');
  console.log('  same outcome         ' + String(grpFix).padStart(4) + '  ' + pc(grpFix) +
    '   (as shipped: ' + sameGrp + '  ' + pc(sameGrp).trim() + ')');
  const fixedBy = rows.filter((r) => r.cdbBand !== r.engBand && r.cdbBandFix === r.engBand).length;
  const brokeBy = rows.filter((r) => r.cdbBand === r.engBand && r.cdbBandFix !== r.engBand).length;
  console.log('  disagreements the anchor alone explains: ' + fixedBy + ' of ' + diff.length +
    '   (and ' + brokeBy + ' correct verdicts the correction would break)');

  // THE COMPLAINT, STATED AS A COUNT. "ChessDB rates its best move higher than
  // Stockfish does, so the second move reads as an inaccuracy where Stockfish
  // would not have called it one." That is a row the engine puts in the top two
  // bands and ChessDB does not.
  const harsh = rows.filter((r) => BANDS.indexOf(r.engBand) <= 1 && BANDS.indexOf(r.cdbBand) >= 2);
  const harshFix = harsh.filter((r) => BANDS.indexOf(r.cdbBandFix) <= 1).length;
  console.log(NL + '  engine says great/good, ChessDB says ok or worse: ' +
    harsh.length + '  (' + pc(harsh.length) + ')');
  console.log('    of those, the anchor correction restores: ' + harshFix +
    ' of ' + harsh.length);
  const soft = rows.filter((r) => BANDS.indexOf(r.cdbBand) <= 1 && BANDS.indexOf(r.engBand) >= 2);
  console.log('  ChessDB says great/good, engine says ok or worse: ' +
    soft.length + '  (' + pc(soft.length) + ')   <- the dangerous direction');

  // DOES IT GO WRONG WHERE THE BOOK IS THIN? If the anchor error concentrates
  // in barely-elaborated positions, a gate is buildable and `minScored` is the
  // lever; if it is flat, there is nothing to gate on.
  console.log(NL + 'by how elaborated the position is (moves ChessDB scored):');
  console.log('  bucket      n   median excess   median abs excess   bands agree');
  for (const b of [[0, 5], [6, 9], [10, 999]]) {
    const sel = posInfo.filter((p2) => p2.nScored >= b[0] && p2.nScored <= b[1]);
    const keys = new Set(sel.map((p2) => p2.fen));
    const rs = rows.filter((r) => keys.has(r.fen));
    const ag = rs.filter((r) => r.cdbBand === r.engBand).length;
    console.log('  ' + (b[1] === 999 ? '10+' : b[0] + '-' + b[1]).padEnd(8) +
      String(sel.length).padStart(4) +
      String(Math.round(q(sel.map((p2) => p2.excess), 0.5))).padStart(15) +
      String(Math.round(q(sel.map((p2) => Math.abs(p2.excess)), 0.5))).padStart(20) +
      ('   ' + ag + '/' + rs.length + (rs.length ? '  ' + Math.round(100 * ag / rs.length) + '%' : '')).padStart(16));
  }
  const inBook = posInfo.filter((p2) => p2.nBook > 0);
  const noBook = posInfo.filter((p2) => !p2.nBook);
  console.log('  top move in the real book (learn=0): ' + inBook.length +
    ' positions, median excess ' + Math.round(q(inBook.map((p2) => p2.excess), 0.5)) + 'cp');
  console.log('  nothing in the real book:            ' + noBook.length +
    ' positions, median excess ' + Math.round(q(noBook.map((p2) => p2.excess), 0.5)) + 'cp');

  console.log(NL + 'per position, worst anchor first:');
  console.log('  excess  ceil   cdbTop              cdb    eng   rest  scored  agree  fen');
  for (const p2 of posInfo.slice().sort((a, b) => b.excess - a.excess)) {
    const rs = rows.filter((r) => r.fen === p2.fen);
    const ag = rs.filter((r) => r.cdbBand === r.engBand).length;
    console.log('  ' + String(Math.round(p2.excess)).padStart(6) +
      String(Math.round(p2.ceilGap)).padStart(6) + '   ' +
      String(p2.cdbBestSan + (p2.bestSame ? '' : ' (eng ' + p2.engBestSan + ')')).padEnd(18) +
      String(p2.cdbBest).padStart(6) + String(p2.engOfCdbTop).padStart(7) +
      String(Math.round(p2.dMed)).padStart(7) + String(p2.nScored).padStart(8) +
      ('  ' + ag + '/' + rs.length).padEnd(9) + p2.fen);
  }

  if (DUMP) {
    fs.writeFileSync(DUMP, JSON.stringify({
      meta: {
        when: new Date().toISOString(), fens: FENS, build: BUILD, threads: THREADS,
        depthCeiling: DEPTH, capMs: CAP_MS, maxMoves: MAX_MOVES, bands: C,
      },
      positions: posInfo, rows,
    }, null, 1));
    console.log(NL + 'per-move rows written to ' + DUMP);
  }

  console.log();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
