/**
 * dev/probe-anchor-depth.js — WHO IS RIGHT about the anchor?
 *
 * `probe-cdb-quality.js` measures how far apart ChessDB and a depth-~24 search
 * are; it cannot say which of them is wrong, because the engine is the
 * reference by assumption. This asks the only question that separates them:
 * point a MUCH deeper search at the handful of moves the two disagree about and
 * see which way the answer moves.
 *
 *   if the deeper search drifts TOWARDS ChessDB  -> ChessDB was ahead of the
 *       shallow search, and the "error" was the reference's
 *   if it stays where it was                     -> ChessDB is simply wrong
 *       there, and the anchor optimism is a defect of the source
 *
 * It is affordable only because it is restricted: the positions whose anchor
 * error is worth explaining (|excess| >= `--min`), and within each, only the two
 * or three moves the anchor question is actually about — ChessDB's own top move,
 * the engine's best of the sampled set, and ChessDB's runner-up. MultiPV 3 at
 * depth 30 on three moves is minutes; the full 10-move sweep at that depth is
 * DESIGN-intuition-storm.md §12.3b's "tens of minutes per position".
 *
 * The engine driving here is `probe-cdb-quality.js`'s, verbatim in its three
 * hard-won details (locateFile by extension, `listener` not `print`, options
 * after a wait) — see that file's `bootEngine` for why each one is there.
 *
 * NEEDS: a dump from `probe-cdb-quality.js --dump`, and engine/vendor/.
 *
 *   node dev/probe-anchor-depth.js dev/tmp-anchor-pass1.json [--min 25]
 *       [--depth 30] [--capms 240000] [--threads 6] [--build full]
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
const MIN = Number(arg('min', 25));
const DEPTH = Number(arg('depth', 30));
const CAP_MS = Number(arg('capms', 240000));
const THREADS = arg('threads', '6');
const BUILD = arg('build', 'full') === 'full' ? 'stockfish-18' : 'stockfish-18-lite';
const DUMP = arg('dump', '');
// A FLAG'S VALUE IS NOT AN INPUT FILE. `--dump out.json` ends in .json like
// every input does, so the predecessor has to be looked at — without that the
// probe reads its own output file as a dump and dies on ENOENT.
const files = process.argv.slice(2).filter((a, i) =>
  !a.startsWith('--') && !process.argv[i + 1].startsWith('--') && /\.json$/.test(a));

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
  cmd('setoption name Hash value 512');
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

/** One MultiPV search restricted to `ucis`; a line short of the ceiling is KEPT. */
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
  const byPv = new Map();
  for (const l of eng.lines) {
    if (!/^info /.test(l) || /\b(lowerbound|upperbound)\b/.test(l)) continue;
    const d = /\bdepth (\d+)\b/.exec(l);
    const first = / pv ([a-h][1-8][a-h][1-8][qrbn]?)/.exec(l);
    const sc = parseScore(l);
    if (!d || !first || sc === null) continue;
    const prev = byPv.get(first[1]);
    if (!prev || Number(d[1]) >= prev.depth) byPv.set(first[1], { depth: Number(d[1]), cp: sc });
  }
  let depth = Infinity;
  for (const v of byPv.values()) depth = Math.min(depth, v.depth);
  return { scores: byPv, depth: Number.isFinite(depth) ? depth : 0, elapsed: Date.now() - t0, capped: stopped };
}

async function main() {
  if (!files.length) {
    console.error('usage: node dev/probe-anchor-depth.js <dump.json> [...] [--min 25]');
    process.exit(2);
  }
  const pos = [];
  const rowsByFen = new Map();
  const seen = new Set();
  for (const f of files) {
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const p of d.positions) {
      const k = p.fen.split(' ').slice(0, 4).join(' ');
      if (seen.has(k)) continue;
      seen.add(k);
      pos.push(p);
      rowsByFen.set(p.fen, d.rows.filter((r) => r.fen === p.fen));
    }
  }
  const want = pos.filter((p) => Math.abs(p.excess) >= MIN)
    .sort((a, b) => b.excess - a.excess);
  console.log('positions read: ' + pos.length + '   |excess| >= ' + MIN + ': ' + want.length);
  console.log('engine: ' + BUILD + ', ' + THREADS + ' threads, depth ceiling ' + DEPTH +
    ', ' + (CAP_MS / 1000) + 's per position' + NL);

  const eng = await bootEngine();
  const out = [];
  for (let i = 0; i < want.length; i++) {
    const p = want[i];
    const rows = rowsByFen.get(p.fen) || [];
    // The moves the anchor question is about, and no others.
    const ucis = [];
    const add = (u) => { if (u && ucis.indexOf(u) < 0) ucis.push(u); };
    add(p.cdbBestUci);
    const engRow = rows.slice().sort((a, b) => b.eng - a.eng)[0];
    if (engRow) add(engRow.uci);
    const runnerUp = rows.filter((r) => !r.isTop).sort((a, b) => b.cdb - a.cdb)[0];
    if (runnerUp) add(runnerUp.uci);
    if (!ucis.length) continue;

    const res = await searchMoves(eng, p.fen, ucis);
    const deepTop = (res.scores.get(p.cdbBestUci) || {}).cp;
    let deepBest = -Infinity;
    for (const v of res.scores.values()) if (v.cp > deepBest) deepBest = v.cp;
    if (typeof deepTop !== 'number' || !Number.isFinite(deepBest)) {
      console.log((i + 1) + '. the engine returned nothing, skipped   ' + p.fen);
      continue;
    }
    // The same two errors as the shallow run, recomputed against the deep search.
    const dTopDeep = p.cdbBest - deepTop;
    const ceilDeep = p.cdbBest - deepBest;
    const rec = {
      fen: p.fen, nScored: p.nScored, san: p.cdbBestSan,
      cdb: p.cdbBest, shallow: p.engOfCdbTop, deep: deepTop,
      dTopShallow: p.dTop, dTopDeep, ceilShallow: p.ceilGap, ceilDeep,
      moved: deepTop - p.engOfCdbTop, depth: res.depth, capped: res.capped,
      shallowDepth: p.depth, excess: p.excess,
    };
    out.push(rec);
    const verdict = Math.abs(dTopDeep) < Math.abs(p.dTop) ? 'engine moved TOWARDS ChessDB'
      : (Math.abs(dTopDeep) > Math.abs(p.dTop) ? 'engine moved AWAY' : 'unchanged');
    console.log((i + 1) + '. ' + p.cdbBestSan.padEnd(7) +
      'cdb ' + String(p.cdbBest).padStart(6) +
      '   d' + String(p.depth).padStart(2) + ' ' + String(p.engOfCdbTop).padStart(6) +
      '   d' + String(res.depth).padStart(2) + (res.capped ? '*' : ' ') + String(deepTop).padStart(6) +
      '   gap ' + String(p.dTop).padStart(5) + ' -> ' + String(dTopDeep).padStart(5) +
      '   ' + verdict);
    console.log('     ' + String((res.elapsed / 1000).toFixed(0) + 's').padStart(6) + '  ' + p.fen);
  }

  // --- the answer -----------------------------------------------------------
  console.log(NL + '='.repeat(74));
  const med = (a) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
  const closer = out.filter((r) => Math.abs(r.dTopDeep) < Math.abs(r.dTopShallow)).length;
  const farther = out.filter((r) => Math.abs(r.dTopDeep) > Math.abs(r.dTopShallow)).length;
  console.log('positions re-searched: ' + out.length);
  console.log('  median gap on ChessDB\'s top move, shallow: ' +
    Math.round(med(out.map((r) => r.dTopShallow))) + 'cp');
  console.log('  median gap on ChessDB\'s top move, deep:    ' +
    Math.round(med(out.map((r) => r.dTopDeep))) + 'cp');
  console.log('  median movement of the engine\'s own eval:  ' +
    Math.round(med(out.map((r) => r.moved))) + 'cp  (+ = towards ChessDB)');
  console.log('  the deeper search agrees with ChessDB MORE in ' + closer + ' of ' + out.length +
    ', LESS in ' + farther);
  const shrink = out.filter((r) => r.moved >= 20).length;
  console.log('  moved >=20cp towards ChessDB: ' + shrink + ' of ' + out.length);
  if (DUMP) {
    fs.writeFileSync(DUMP, JSON.stringify({ min: MIN, depth: DEPTH, rows: out }, null, 1));
    console.log(NL + 'written to ' + DUMP);
  }
  console.log();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
