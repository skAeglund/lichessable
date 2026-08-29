/**
 * dev/probe-engine-tier.js — how deep does §3.4's THIRD grading source get, and
 * what does the pair cost, per engine profile?
 *
 * TODO-storm.md block 3 / DESIGN-intuition-storm.md §8.1a and §14.23.5. The
 * tier is two Stockfish searches under a per-search budget, and every number
 * governing it is an estimate: `enginePhaseMs` 8000 was chosen from the timeout
 * chain (§14.23.2), not from a measurement, and `engineDepthSlack` 3 is a
 * declared judgement. v0.149.0 made the tier fail SOFT — a shallower verdict
 * instead of none — which is exactly what makes the question answerable:
 * before it, every profile "reached" nothing at all.
 *
 * WHAT MAKES THIS A MEASUREMENT OF THE SHIPPED TIER AND NOT OF A COPY OF IT:
 *
 *  1. THE STATE MACHINE IS THE SHIPPED ONE, sliced out by `dev/slice-source.js`
 *     — `stormEngineLoss`, `armEnginePhase`, `startEngineChild`,
 *     `finishEngineJob`, `endEngineJob`, `onStormEngineUpdate` and both
 *     `keepEngine*` helpers, exactly as `dev/check-storm.js` §10 executes them.
 *     The budgets come out of `CONFIG.storm` and the profile out of
 *     `engine/engine.js`'s own `PROFILES`; nothing here is transcribed.
 *  2. THE ENGINE HOST BEHAVES LIKE `engine/engine.js`, which is not the same as
 *     "a Stockfish". Three of its behaviours are load-bearing for the timing:
 *     updates are COALESCED into one per `THROTTLE_MS` window (so the depth the
 *     tier sees can lag the depth the engine has printed by up to 400 ms — the
 *     raw info lines would over-report what the tier actually gets); an analyze
 *     arriving mid-search sends `stop` and waits for the `bestmove` FENCE
 *     before starting the next one (that latency is part of the pair's wall
 *     clock, and it is paid on every position because phase 1 usually ends on
 *     its budget); and a per-request depth only ever LOWERS the profile depth.
 *  3. THE MOVE GRADED IS A RANDOM LEGAL ONE, seeded. That is the population:
 *     §14.8 is explicit that this tier is reached precisely where ChessDB knows
 *     neither the move nor its child, i.e. for arbitrary human moves, and a
 *     move out of the book would be one the tier is never asked about.
 *
 * WHAT IT CANNOT MEASURE. `--profile mobile` runs the LITE BUILD ON TWO
 * THREADS — the build-and-threads half of the profile — on whatever CPU node is
 * on. It is not a phone. A phone's answer needs a phone, and §14.23.5's third
 * bullet stays open whatever this prints.
 *
 * Not part of the extension; not referenced by the manifest.
 *
 * NEEDS: engine/vendor/ (gitignored — see README) and a survivor dump from
 * `node dev/probe-storm.js --dump-fens <path>`.
 *
 *   node dev/probe-engine-tier.js --profile desktop --n 10
 *   node dev/probe-engine-tier.js --profile mobile  --n 10
 *
 * ONE PROFILE PER PROCESS, deliberately: the two builds are two WASM modules
 * with their own pthread pools, and booting both in one node process measures
 * neither cleanly.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { sliceDecl } = require('./slice-source.js');
const CloSan = require('../engine/san.js');

const NL = String.fromCharCode(10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SRC_PATH = process.env.CLO_SRC ||
  path.join(__dirname, '..', 'content', 'lichessable.js');
const SRC = fs.readFileSync(SRC_PATH, 'utf8');

// --- args -------------------------------------------------------------------
function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const PROFILE = arg('profile', 'desktop') === 'mobile' ? 'mobile' : 'desktop';
const FENS_PATH = arg('fens', path.join(__dirname, 'tmp-storm-fens-all.json'));
const N = Number(arg('n', 10));
const SEED = Number(arg('seed', 11));
const PHASE_OVERRIDE = Number(arg('phasems', 0));
// PROBE-ONLY OVERRIDES of the two numbers this file exists to question. They
// are what makes "what would a different ceiling cost" a measurement rather
// than an argument; neither changes anything the extension ships, and the
// header line prints whichever value was used.
const CEIL_OVERRIDE = Number(arg('ceiling', 0));

// --- the shipped numbers ----------------------------------------------------
// Read, never transcribed, and THROWN on rather than defaulted: a default
// quietly standing in for a number that could not be read would be invisible in
// the output and would answer this question about a tier nobody ships.
const cfgStart = SRC.indexOf('storm: {');
const cfgBody = SRC.slice(cfgStart, SRC.indexOf(NL + '    },', cfgStart));
function cfgNum(name) {
  const m = new RegExp('\\b' + name + ':\\s*(-?[0-9.]+)').exec(cfgBody);
  if (!m) throw new Error('CONFIG.storm.' + name + ' not readable from the shipped file');
  return Number(m[1]);
}
function cfgDepths() {
  const m = /\bengineDepth:\s*\{([^}]*)\}/.exec(cfgBody);
  if (!m) throw new Error('CONFIG.storm.engineDepth not readable from the shipped file');
  const out = {};
  for (const part of m[1].split(',')) {
    const kv = /\s*(\w+)\s*:\s*(\d+)/.exec(part);
    if (kv) out[kv[1]] = Number(kv[2]);
  }
  if (!out.desktop || !out.mobile) {
    throw new Error('CONFIG.storm.engineDepth is not a two-profile map');
  }
  return out;
}
const DEPTHS = cfgDepths();
if (CEIL_OVERRIDE) DEPTHS[PROFILE] = CEIL_OVERRIDE;
const C = {
  engineFallback: true,
  engineDepth: DEPTHS,
  enginePhaseMs: PHASE_OVERRIDE || cfgNum('enginePhaseMs'),
  engineDepthSlack: cfgNum('engineDepthSlack'),
  engineTimeoutMs: cfgNum('engineTimeoutMs'),
  gradeTimeoutMs: cfgNum('gradeTimeoutMs'),
  engineMateCp: cfgNum('engineMateCp'),
};

// engine/engine.js's own sizing, read the same way. The profile is half of what
// this probe is measuring, so a copy of it here that had drifted would answer
// about a machine the extension never configures.
const ENG_SRC = fs.readFileSync(path.join(__dirname, '..', 'engine', 'engine.js'), 'utf8');
function engProfile(name) {
  const m = new RegExp('\\n\\s*' + name + ':\\s*\\{([^}]*)\\}').exec(ENG_SRC);
  if (!m) throw new Error('PROFILES.' + name + ' not readable from engine/engine.js');
  const grab = (k, re) => {
    const g = new RegExp('\\b' + k + ':\\s*' + re).exec(m[1]);
    if (!g) throw new Error('PROFILES.' + name + '.' + k + ' not readable');
    return g[1];
  };
  return {
    worker: grab('worker', "'([^']+)'"),
    threads: Number(grab('threads', '(\\d+)')),
    hash: Number(grab('hash', '(\\d+)')),
    depth: Number(grab('depth', '(\\d+)')),
    movetime: Number(grab('movetime', '(\\d+)')),
  };
}
function engNum(name) {
  const m = new RegExp('\\bconst ' + name + '\\s*=\\s*(\\d+)').exec(ENG_SRC);
  if (!m) throw new Error(name + ' not readable from engine/engine.js');
  return Number(m[1]);
}
const PROF = engProfile(PROFILE);
const MULTIPV = engNum('MULTIPV');
const THROTTLE_MS = engNum('THROTTLE_MS');
const SAN_PLIES = engNum('SAN_PLIES');

// --- the shipped tier -------------------------------------------------------
// `dev/check-storm.js` §10's harness, unchanged in shape: the six page-world
// bindings arrive as parameters and `__setEnv` supplies `st` and `C`.
const tierSrc = [
  sliceDecl('stormMoverCp'),
  sliceDecl('fenAfterUci'),
  sliceDecl('stormEngineLoss'),
  sliceDecl('armEnginePhase'),
  sliceDecl('startEngineChild'),
  sliceDecl('finishEngineJob'),
  sliceDecl('endEngineJob'),
  sliceDecl('onStormEngineUpdate'),
  sliceDecl('keepEngineBest'),
  sliceDecl('keepEngineChild'),
  'let st = null; let C = null;',
  'function __setEnv(a, b) { st = a; C = b; }',
  'return { stormEngineLoss, onStormEngineUpdate, endEngineJob, __setEnv };',
].join(NL);
const host = { state: {}, onSend: () => {} };
// eslint-disable-next-line no-new-func
const S = new Function('CloSan', 'warn', 'log', 'state', 'engineSend',
  'engineProfile', 'pingEngineIfSilent', 'syncEngine', tierSrc)(
  CloSan, () => {}, () => {}, host.state,
  (msg) => host.onSend(msg), () => PROFILE, () => {}, () => {});
const stFake = { eng: null, engSeq: 0 };
S.__setEnv(stFake, C);

// --- a stand-in for engine/offscreen.js ------------------------------------
/**
 * The vendored WASM build driven from node. The three traps are
 * `dev/probe-cdb-quality.js`'s (locateFile answering by EXTENSION, output on
 * `listener` and not `print`, and options needing a moment before they
 * register); what is added here is engine.js's own protocol on top.
 */
async function bootEngine() {
  const V = path.join(__dirname, '..', 'engine', 'vendor');
  const base = path.basename(PROF.worker, '.js');
  for (const f of [base + '.js', base + '.wasm']) {
    if (!fs.existsSync(path.join(V, f))) {
      console.error('engine/vendor/' + f + ' missing — see README, engine vendoring');
      process.exit(2);
    }
  }
  const lines = [];
  const factory = require(path.join(V, base + '.js'))();
  const sf = await factory({
    locateFile: (p) => path.join(V, base + (p.endsWith('.wasm') ? '.wasm' : '.js')),
    listener: (s) => { lines.push(String(s)); onLine(String(s)); },
  });
  const send = (c) => sf.ccall('command', null, ['string'], [c]);
  send('uci');
  await sleep(2500);
  send('setoption name Threads value ' + PROF.threads);
  send('setoption name Hash value ' + PROF.hash);
  send('setoption name MultiPV value ' + MULTIPV);
  await sleep(600);
  const bad = lines.filter((l) => /No such option/.test(l));
  if (bad.length) { console.error(bad.join(NL)); process.exit(2); }
  return send;
}

let cmd = null;
let phase = 'idle';           // 'idle' | 'searching' | 'stopping'
let currentFen = null, currentReqId = null, currentDepth = 0;
let pending = null;           // { fen, reqId, depth } queued behind a stop fence
let latest = null;
let flushTimer = 0;
let onUpdate = () => {};
let fenceWaiters = [];

function onLine(line) {
  if (/^bestmove/.test(line)) {
    flush(true);
    phase = 'idle';
    const waiters = fenceWaiters; fenceWaiters = [];
    for (const w of waiters) w();
    // Out of the callback for the same reason as `flush`'s update above.
    if (pending) { const p = pending; pending = null; setTimeout(() => startSearch(p), 0); }
    return;
  }
  if (!/^info /.test(line) || phase !== 'searching') return;
  parseInfo(line);
}

/** engine.js's `parseInfo`, same rejections. */
function parseInfo(line) {
  const t = line.split(/\s+/);
  if (t.includes('lowerbound') || t.includes('upperbound')) return;
  const pvIdx = t.indexOf('pv'), mpvIdx = t.indexOf('multipv');
  const dIdx = t.indexOf('depth'), sIdx = t.indexOf('score');
  if (pvIdx < 0 || mpvIdx < 0 || dIdx < 0 || sIdx < 0) return;
  const multipv = Number(t[mpvIdx + 1]), depth = Number(t[dIdx + 1]);
  if (!multipv || multipv > MULTIPV || !depth) return;
  const entry = { depth, cp: null, mate: null, moves: t.slice(pvIdx + 1) };
  if (t[sIdx + 1] === 'cp') entry.cp = Number(t[sIdx + 2]);
  else if (t[sIdx + 1] === 'mate') entry.mate = Number(t[sIdx + 2]);
  else return;
  latest.pvs[multipv] = entry;
  if (multipv === 1) latest.depth = depth;
  if (!flushTimer) {
    flushTimer = setTimeout(() => { flushTimer = 0; flush(false); }, THROTTLE_MS);
  }
}

/** engine.js's `flush`: White-normalised, `pv.uci` beside the numbered SAN. */
function flush(done) {
  clearTimeout(flushTimer); flushTimer = 0;
  if (!currentFen || !latest) return;
  const blackToMove = currentFen.split(/\s+/)[1] === 'b';
  const pvs = [];
  for (let n = 1; n <= MULTIPV; n++) {
    const e = latest.pvs[n];
    if (!e) continue;
    const pv = { multipv: n };
    if (e.cp !== null) pv.cp = blackToMove ? -e.cp : e.cp;
    if (e.mate !== null) pv.mate = blackToMove ? -e.mate : e.mate;
    pv.san = CloSan.pvToSan(currentFen, e.moves.slice(0, SAN_PLIES)) || '';
    pv.uci = e.moves[0] || '';
    pvs.push(pv);
  }
  if (!pvs.length) return;
  const update = { type: 'clo-engine-update', fen: currentFen, depth: latest.depth, done, pvs };
  if (currentReqId) update.reqId = currentReqId;
  // DELIVERED ASYNCHRONOUSLY, and that is fidelity rather than tidiness: in the
  // extension this update crosses a Worker boundary, then the service worker,
  // then `chrome.tabs.sendMessage`, so the tier's reaction — which is another
  // UCI command — can never re-enter the engine from inside its own output
  // callback. Delivered synchronously here it does exactly that, and the
  // vendored build silently drops the `go` that follows: measured, the reply
  // search was started and never produced a single info line.
  setTimeout(() => onUpdate(update), 0);
}

function startSearch(req) {
  currentFen = req.fen; currentReqId = req.reqId;
  currentDepth = req.depth > 0 ? Math.min(req.depth, PROF.depth) : 0;
  const goDepth = currentDepth || PROF.depth;
  latest = { depth: 0, pvs: {} };
  phase = 'searching';
  cmd('position fen ' + req.fen);
  cmd(PROF.movetime > 0
    ? 'go depth ' + goDepth + ' movetime ' + PROF.movetime
    : 'go depth ' + goDepth);
}

/** engine.js's `handleAnalyze`: a search in flight is STOPPED and the next one
 *  waits for its `bestmove` fence. That wait is real time and is counted. */
function handleAnalyze(msg) {
  const req = { fen: msg.fen, reqId: msg.reqId, depth: msg.depth || 0 };
  if (phase === 'searching') { pending = req; phase = 'stopping'; cmd('stop'); return; }
  if (phase === 'stopping') { pending = req; return; }
  startSearch(req);
}
function idle() {
  if (phase === 'idle') return Promise.resolve();
  return new Promise((r) => fenceWaiters.push(r));
}

// --- the run ----------------------------------------------------------------
/** Mulberry32, `stormDrawFrontier`'s own shape: the pick has to be repeatable
 *  or the two profiles are not being asked the same question. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SQ = (i) => 'abcdefgh'[i % 8] + (Math.floor(i / 8) + 1);
function pickMove(fen, rnd) {
  const pos = CloSan.parseFen(fen);
  const moves = pos && CloSan.generateMoves(pos);
  if (!moves || !moves.length) return null;
  const m = moves[Math.min(moves.length - 1, Math.floor(rnd() * moves.length))];
  const uci = SQ(m.from) + SQ(m.to) + (m.promo || '');
  return { uci, san: CloSan.moveToSan(pos, uci) || uci };
}

function pctl(list, p) {
  if (!list.length) return 0;
  const s = list.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}
const mean = (l) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : 0);

(async () => {
  const dump = JSON.parse(fs.readFileSync(FENS_PATH, 'utf8'));
  const fens = (Array.isArray(dump) ? dump : dump.positions || []).slice(0, N);
  if (!fens.length) { console.error('no FENs in ' + FENS_PATH); process.exit(2); }

  console.log('profile ' + PROFILE + ' — ' + PROF.worker + ', Threads ' + PROF.threads +
    ', Hash ' + PROF.hash + ', MultiPV ' + MULTIPV + ', profile depth ' + PROF.depth);
  console.log('CONFIG.storm: engineDepth ' + C.engineDepth[PROFILE] +
    (CEIL_OVERRIDE ? ' (ceiling, OVERRIDDEN)' : ' (ceiling)') +
    ', enginePhaseMs ' + C.enginePhaseMs + (PHASE_OVERRIDE ? ' (OVERRIDDEN)' : '') +
    ', engineDepthSlack ' + C.engineDepthSlack +
    ', engineTimeoutMs ' + C.engineTimeoutMs + ', gradeTimeoutMs ' + C.gradeTimeoutMs);
  console.log('positions: ' + fens.length + ' from ' + path.basename(FENS_PATH) +
    ', seed ' + SEED);
  console.log('');

  cmd = await bootEngine();
  host.onSend = (msg) => {
    if (msg.type === 'clo-engine-analyze') handleAnalyze(msg);
    else if (msg.type === 'clo-engine-stop' && phase === 'searching') {
      phase = 'stopping'; cmd('stop');
    }
  };
  onUpdate = (u) => S.onStormEngineUpdate(u);

  const rows = [];
  const rnd = rng(SEED);
  for (const p of fens) {
    const mv = pickMove(p.fen, rnd);
    if (!mv) { console.log('skipped (no legal move): ' + p.fen); continue; }
    host.state.altCheckBusy = false;
    const t0 = Date.now();
    const promise = S.stormEngineLoss(p.fen, mv.uci);
    const job = stFake.eng;
    const answer = await promise;
    const elapsed = Date.now() - t0;
    // The fence after the last phase is paid by the NEXT position in a real
    // session too, but it is not part of this pair's answer — wait it out here
    // so the next row starts from idle, as the tier always does (`st.eng` is
    // null between grades and `syncEngine` has stopped the search).
    if (phase !== 'idle') { if (phase === 'searching') cmd('stop'); await idle(); }
    rows.push({
      fen: p.fen, san: mv.san, from: p.from || '',
      bestDepth: job.bestDepth, childDepth: job.childDepth,
      target: job.depth, childTarget: job.childTarget,
      elapsed, answered: Boolean(answer),
      depth: answer ? answer.depth : 0,
      refusedSlack: !answer && typeof job.best === 'number' &&
        typeof job.childBest === 'number' &&
        Math.abs(job.bestDepth - job.childDepth) > C.engineDepthSlack,
      hitCeiling: elapsed >= C.engineTimeoutMs,
      reachedTarget: job.bestDepth >= job.depth,
    });
    const r = rows[rows.length - 1];
    console.log((r.answered ? 'ok  ' : 'NULL') +
      '  ' + String(r.elapsed).padStart(6) + ' ms' +
      '  position d' + String(r.bestDepth).padStart(2) + '/' + r.target +
      '  reply d' + String(r.childDepth).padStart(2) + '/' + r.childTarget +
      '  ' + r.san.padEnd(8) + r.from.slice(0, 32));
  }

  const answered = rows.filter((r) => r.answered);
  const bestD = rows.map((r) => r.bestDepth);
  const childD = rows.map((r) => r.childDepth);
  const times = rows.map((r) => r.elapsed);
  const gaps = rows.map((r) => Math.abs(r.bestDepth - r.childDepth));
  console.log('');
  console.log('=== ' + PROFILE + ' · ' + rows.length + ' positions ===');
  console.log('answered              ' + answered.length + '/' + rows.length +
    ' (' + Math.round(100 * answered.length / rows.length) + '%)');
  console.log('pair wall clock       mean ' + Math.round(mean(times)) + ' ms · median ' +
    pctl(times, 0.5) + ' · p90 ' + pctl(times, 0.9) + ' · max ' + Math.max(...times));
  console.log('position depth        mean ' + mean(bestD).toFixed(1) + ' · min ' +
    Math.min(...bestD) + ' · median ' + pctl(bestD, 0.5) + ' · max ' + Math.max(...bestD) +
    ' (ceiling ' + C.engineDepth[PROFILE] + ')');
  console.log('reply depth           mean ' + mean(childD).toFixed(1) + ' · min ' +
    Math.min(...childD) + ' · median ' + pctl(childD, 0.5) + ' · max ' + Math.max(...childD));
  console.log('reached the ceiling   ' + rows.filter((r) => r.reachedTarget).length + '/' +
    rows.length + ' (the rest were TAKEN at the depth the budget reached)');
  console.log('depth gap |b-c|       ' + gaps.join(' ') + ' (slack ' + C.engineDepthSlack + ')');
  console.log('refused for slack     ' + rows.filter((r) => r.refusedSlack).length);
  console.log('hit the 20 s backstop ' + rows.filter((r) => r.hitCeiling).length);
  console.log('worst pair vs gradeTimeoutMs  ' + Math.max(...times) + ' / ' + C.gradeTimeoutMs +
    ' ms, i.e. ' + (C.gradeTimeoutMs - Math.max(...times)) +
    ' ms left for the two ChessDB round trips');
  const hist = {};
  for (const d of bestD) hist[d] = (hist[d] || 0) + 1;
  console.log('position depth histogram  ' +
    Object.keys(hist).sort((a, b) => a - b).map((d) => 'd' + d + '×' + hist[d]).join('  '));
  process.exit(0);
})();
