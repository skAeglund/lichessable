/**
 * dev/probe-gather-cost.js — what would it COST to grade the storm with
 * Stockfish instead of ChessDB, and how much accuracy does each price buy?
 *
 * DESIGN-intuition-storm.md §12.3c measured that ChessDB's own top move is
 * systematically over-scored, that going deeper does not vindicate it, and that
 * the bias explains ~70% of all disagreement with a local search. The answer
 * is to stop asking ChessDB for the numbers a verdict is computed from. That
 * turns a ~380 ms request into a search, so the whole design question is a
 * timing one:
 *
 *   GATHER TIME   one MultiPV search per position, paid overnight with nobody
 *                 waiting. Decides how many positions a night yields.
 *   PLAY TIME     zero if the move the user played is in the stored list; one
 *                 single-move search if it is not. Decides the only wait the
 *                 user ever sees.
 *
 * So the grid is (MultiPV x depth), and `--mpv 0` means EVERY LEGAL MOVE —
 * the setting that makes play-time grading free for ever, on any device,
 * including the phone that cannot run this engine at all. That is the reason
 * to measure it rather than assume 8 is the answer.
 *
 * IT ALSO RECORDS THE SCORES, so the same run answers the other half: how far
 * a cheaper cell's verdict is from the most expensive one. A depth that costs
 * half as much and moves no verdict is the setting to ship.
 *
 * THREADS DEFAULT TO 4 AND HASH TO 64, which is `CONFIG.engine`'s DESKTOP
 * profile — not this machine's core count. A gather could raise both, but the
 * shipped profile is what an unmodified build would do.
 *
 * Not part of the extension; not referenced by the manifest.
 *
 * NEEDS: a survivor dump from `probe-storm.js --dump-fens`, and engine/vendor/.
 *
 *   node dev/probe-gather-cost.js [--fens dev/tmp-qfens-pass2.json] [--n 8]
 *       [--cells 8x20,8x24,16x20,0x18,0x20] [--single 20,24]
 *       [--capms 300000] [--threads 4] [--build full] [--dump out.json]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const NL = String.fromCharCode(10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const FENS = arg('fens', path.join(__dirname, 'tmp-qfens-pass2.json'));
const WANT = Number(arg('n', 8));
const CAP_MS = Number(arg('capms', 300000));
const THREADS = arg('threads', '4');
const HASH = arg('hash', '64');
const BUILD = arg('build', 'full') === 'full' ? 'stockfish-18' : 'stockfish-18-lite';
const DUMP = arg('dump', '');
// `mpv x depth`, mpv 0 = every legal move (Stockfish clamps MultiPV to the
// number of legal moves, so a large number asks for all of them).
const CELLS = arg('cells', '8x20,8x24,16x20,0x18,0x20').split(',').map((c) => {
  const [m, d] = c.split('x').map(Number);
  return { mpv: m, depth: d, key: c };
});
const SINGLE = arg('single', '20,24').split(',').filter(Boolean).map(Number);
const ALL_MPV = 200;

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
  cmd('setoption name Hash value ' + HASH);
  await sleep(500);
  const bad = lines.filter((l) => /No such option/.test(l));
  if (bad.length) { console.error(bad.join(NL)); process.exit(2); }
  return { cmd, lines };
}

function parseScore(line) {
  const m = /\bscore (cp|mate) (-?\d+)\b/.exec(line);
  if (!m) return null;
  const n = Number(m[2]);
  return m[1] === 'cp' ? n : (n >= 0 ? 30000 - n : -30000 - n);
}

/**
 * One search. `ucis` null = the whole position; otherwise `searchmoves`.
 * A LINE SHORT OF THE CEILING IS KEPT (§14.23) — the budget is a wall clock and
 * the depth actually reached is reported.
 *
 * THE CLOCK STARTS AFTER `ucinewgame`+`isready`, not before: without clearing
 * the hash every cell after the first would be timed on the previous cell's
 * table and the cheap ones would look free.
 */
async function search(eng, fen, mpv, depth, ucis) {
  eng.lines.length = 0;
  eng.cmd('ucinewgame');
  eng.cmd('isready');
  await sleep(120);
  eng.lines.length = 0;
  eng.cmd('setoption name MultiPV value ' + mpv);
  eng.cmd('position fen ' + fen);
  const t0 = Date.now();
  eng.cmd('go depth ' + depth + (ucis ? ' searchmoves ' + ucis.join(' ') : ''));
  let stopped = false;
  await new Promise((resolve) => {
    const iv = setInterval(() => {
      if (eng.lines.some((l) => l.startsWith('bestmove'))) { clearInterval(iv); resolve(); return; }
      if (!stopped && Date.now() - t0 > CAP_MS) { stopped = true; eng.cmd('stop'); }
    }, 50);
  });
  const elapsed = Date.now() - t0;

  // THE ANSWER IS ONE ITERATION, NOT THE UNION OF ALL OF THEM. With a
  // full-width MultiPV over more legal moves than `mpv`, the reported set
  // ROTATES between iterations — a move can hold a slot at depth 2 and never
  // appear again. Folding every line into one map by "keep the deepest per
  // move" (which is right when `searchmoves` pins the set, as it does in
  // probe-cdb-quality.js) therefore invents moves the final answer does not
  // contain and drags the reported depth down to theirs: measured, MultiPV 8
  // came back as "12 moves, reached depth 1".
  //
  // So lines are collected PER DEPTH and the answer is the deepest COMPLETE
  // iteration — complete meaning it reported as many lines as the widest one
  // did, which also drops the partial iteration a `stop` interrupts.
  const byDepth = new Map();
  for (const l of eng.lines) {
    if (!/^info /.test(l) || /\b(lowerbound|upperbound)\b/.test(l)) continue;
    const d = /\bdepth (\d+)\b/.exec(l);
    const first = / pv ([a-h][1-8][a-h][1-8][qrbn]?)/.exec(l);
    const sc = parseScore(l);
    if (!d || !first || sc === null) continue;
    const k = Number(d[1]);
    if (!byDepth.has(k)) byDepth.set(k, new Map());
    byDepth.get(k).set(first[1], sc);
  }
  let full = 0;
  for (const m of byDepth.values()) full = Math.max(full, m.size);
  let pick = 0;
  for (const [k, m] of byDepth) if (m.size >= full && k > pick) pick = k;
  const scores = byDepth.get(pick) || new Map();
  return { scores, moves: scores.size, elapsed, capped: stopped, depth: pick };
}

const med = (a) => (a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : 0);
const fmt = (ms) => (ms / 1000).toFixed(1) + 's';

async function main() {
  let positions;
  try {
    positions = JSON.parse(fs.readFileSync(FENS, 'utf8'));
  } catch (e) {
    console.error(FENS + ' missing — run probe-storm.js --dump-fens first');
    process.exit(2);
  }
  const seen = new Set();
  positions = positions.filter((p) => {
    const k = p.fen.split(' ').slice(0, 4).join(' ');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, WANT);

  console.log('positions: ' + positions.length + ' from ' + FENS);
  console.log('engine: ' + BUILD + ', ' + THREADS + ' threads, ' + HASH + 'MB hash' +
    '   (CONFIG.engine desktop profile)');
  console.log('cells: ' + CELLS.map((c) => (c.mpv || 'all') + ' PV @ d' + c.depth).join(', '));
  console.log('single-move searches at depth: ' + SINGLE.join(', ') + NL);

  const eng = await bootEngine();
  const results = [];
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    console.log((i + 1) + '. ' + p.fen);
    const rec = { fen: p.fen, ply: p.ply, cells: {}, single: {} };
    for (const c of CELLS) {
      const r = await search(eng, p.fen, c.mpv || ALL_MPV, c.depth, null);
      rec.cells[c.key] = {
        ms: r.elapsed, moves: r.moves, depth: r.depth, capped: r.capped,
        // `search` returns a Map of uci -> cp SINCE THE PER-DEPTH REWRITE; it
        // used to hold `{depth, cp}` objects. Reading `.cp` off a number gave
        // every move `undefined`, which cost nothing visible in the timing
        // half and silently emptied the AGREEMENT table — every cell reported
        // "n=0 shared moves", which reads as an unlucky sample rather than as
        // a defect. Measured 2026-08-30, and the timings in §23.2 are from the
        // run that had it.
        scores: Object.fromEntries([...r.scores]),
      };
      console.log('     ' + ((c.mpv || 'all') + 'PV d' + c.depth).padEnd(10) +
        fmt(r.elapsed).padStart(8) + '   ' + String(r.moves).padStart(3) + ' moves' +
        '   reached d' + r.depth + (r.capped ? ' (capped)' : ''));
    }
    // The play-time cost: one move, MultiPV 1. Timed on the move the user is
    // most likely to have played that is NOT the best one — the second-best by
    // the cheapest cell, since a grade is only ever needed for a move outside
    // the stored list and those are never the top one.
    const base = rec.cells[CELLS[0].key];
    const ranked = Object.entries(base.scores).sort((a, b) => b[1] - a[1]);
    const target = (ranked[1] || ranked[0] || [])[0];
    for (const d of SINGLE) {
      if (!target) break;
      const r = await search(eng, p.fen, 1, d, [target]);
      rec.single['d' + d] = { ms: r.elapsed, depth: r.depth, capped: r.capped };
      console.log('     ' + ('1 move d' + d).padEnd(10) + fmt(r.elapsed).padStart(8) +
        '   reached d' + r.depth + (r.capped ? ' (capped)' : ''));
    }
    results.push(rec);
  }

  // --- the report -----------------------------------------------------------
  console.log(NL + '='.repeat(74));
  console.log('GATHER COST — one search per position, nobody waiting' + NL);
  console.log('  cell         median   p90      moves   depth      per hour   8h yield');
  for (const c of CELLS) {
    const ms = results.map((r) => r.cells[c.key].ms);
    const m = med(ms);
    const p90 = ms.slice().sort((a, b) => a - b)[Math.floor(0.9 * (ms.length - 1))] || 0;
    const mv = med(results.map((r) => r.cells[c.key].moves));
    const dp = med(results.map((r) => r.cells[c.key].depth));
    console.log('  ' + ((c.mpv || 'all') + 'PV d' + c.depth).padEnd(12) +
      fmt(m).padStart(7) + fmt(p90).padStart(8) + String(mv).padStart(9) +
      ('d' + dp).padStart(9) + String(Math.round(3600000 / (m || 1))).padStart(13) +
      String(Math.round(8 * 3600000 / (m || 1))).padStart(11));
  }
  console.log(NL + 'PLAY COST — one move, only when it is outside the stored list' + NL);
  for (const d of SINGLE) {
    const ms = results.map((r) => (r.single['d' + d] || {}).ms).filter((x) => x != null);
    console.log('  1 move at d' + d + ':  median ' + fmt(med(ms)) +
      '   max ' + fmt(Math.max.apply(null, ms.concat(0))));
  }

  // ACCURACY AGAINST THE MOST EXPENSIVE CELL. A cheaper cell that moves no
  // score by more than a band width is the one to ship; the comparison is on
  // the moves the two cells share, since a narrow MultiPV scores fewer.
  const ref = CELLS.slice().sort((a, b) =>
    (b.depth - a.depth) || ((b.mpv || 999) - (a.mpv || 999)))[0];
  console.log(NL + 'AGREEMENT with the most expensive cell (' +
    ((ref.mpv || 'all') + 'PV d' + ref.depth) + '), over shared moves' + NL);
  console.log('  cell         n    median |d|   p90 |d|   >25cp   >50cp');
  for (const c of CELLS) {
    if (c.key === ref.key) continue;
    const ds = [];
    for (const r of results) {
      const a = r.cells[c.key].scores, b = r.cells[ref.key].scores;
      for (const u of Object.keys(a)) if (b[u] != null) ds.push(Math.abs(a[u] - b[u]));
    }
    const p90 = ds.slice().sort((x, y) => x - y)[Math.floor(0.9 * (ds.length - 1))] || 0;
    console.log('  ' + ((c.mpv || 'all') + 'PV d' + c.depth).padEnd(12) +
      String(ds.length).padStart(4) + String(Math.round(med(ds))).padStart(12) +
      String(Math.round(p90)).padStart(10) +
      String(ds.filter((x) => x > 25).length).padStart(8) +
      String(ds.filter((x) => x > 50).length).padStart(8));
  }

  // HOW MANY MOVES A POSITION HAS, which is what decides whether "store every
  // legal move" is a sentence about 30 moves or about 45.
  const legal = results.map((r) => {
    let mx = 0;
    for (const c of CELLS) mx = Math.max(mx, r.cells[c.key].moves);
    return mx;
  });
  console.log(NL + '  legal moves per position: median ' + med(legal) +
    '  min ' + Math.min.apply(null, legal) + '  max ' + Math.max.apply(null, legal));

  if (DUMP) {
    fs.writeFileSync(DUMP, JSON.stringify({
      meta: { build: BUILD, threads: THREADS, hash: HASH, capMs: CAP_MS, cells: CELLS, single: SINGLE },
      results,
    }, null, 1));
    console.log(NL + 'written to ' + DUMP);
  }
  console.log();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
