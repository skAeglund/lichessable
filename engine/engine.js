/**
 * LiChessable — offscreen Stockfish controller
 *
 * Runs in the offscreen document (engine/offscreen.html). Hosts one of the
 * two vendored multi-threaded Stockfish WASM builds (full/lite; see PROFILES)
 * in a Web Worker and speaks UCI to it. Each analyze request names a profile;
 * a mismatch with the running worker's reboots it on the other build.
 * The service worker is the message hub: analyze/stop requests arrive here
 * with target 'offscreen'; updates go back with target 'sw' and are relayed
 * to the requesting tab (offscreen sendMessage can never reach content
 * scripts directly).
 *
 * Search protocol: latest-position-wins. A new analyze during a search sends
 * "stop" and DISCARDS every info line until the "bestmove" fence — UCI info
 * lines carry no request id, so the fence is the only reliable staleness
 * barrier. Scores are normalized to White's perspective before sending.
 */
'use strict';

const LOG_PREFIX = '[CLO]';
const log = (...a) => console.log(LOG_PREFIX, ...a);
const warn = (...a) => console.warn(LOG_PREFIX, ...a);

// Sizing profiles. The content script picks one per analyze request (the
// offscreen document cannot see what device the tab is on); an analyze whose
// profile differs from the running worker's tears it down and reboots on the
// other build. `movetime` 0 = no cap; non-zero bounds the search alongside
// depth ("go depth D movetime M" — whichever hits first ends it) so a sharp
// position can't run away on a weak device. Both builds are multi-threaded
// and need SharedArrayBuffer; engine/vendor/ files are downloaded manually
// per README.
const PROFILES = {
  desktop: { worker: 'vendor/stockfish-18.js',      threads: 4, hash: 64, depth: 30, movetime: 0 },
  mobile:  { worker: 'vendor/stockfish-18-lite.js', threads: 2, hash: 16, depth: 25, movetime: 0 },
};
// The panel's width, and the DEFAULT for a request that names none. Since
// v0.158.0 MultiPV is per REQUEST (the storm's gather stores a whole scored
// move list, DESIGN-intuition-storm.md §23), so this is no longer the only
// width the worker ever runs at — `MULTIPV_MAX` is what bounds it. Stockfish
// clamps MultiPV to the number of legal moves by itself, so asking for more
// than a position has is how "every legal move" is spelled.
const MULTIPV = 3;
const MULTIPV_MAX = 250;
const SAN_PLIES = 12;        // PV plies converted to SAN for display
const THROTTLE_MS = 400;     // coalesce info bursts into one update per window
const HANDSHAKE_TIMEOUT_MS = 10000;
const STOP_FENCE_TIMEOUT_MS = 5000;   // no bestmove after stop => worker is wedged
const SEARCH_SILENCE_MS = 15000;      // no output at all mid-search => worker is dead
const IDLE_CLOSE_MS = 5 * 60 * 1000;  // self-close to free NNUE memory

let worker = null;
let bootPromise = null;      // resolves when the UCI handshake completes
let requestedProfile = 'desktop'; // profile of the latest analyze request
let bootedProfile = null;    // profile the current worker was booted with
let expecting = null;        // { token, resolve, reject, timer } during handshake
let phase = 'idle';          // 'idle' | 'searching' | 'stopping'
let currentFen = null;       // FEN of the running search
let pendingFen = null;       // latest requested FEN, started when idle
// Optional per-request extras (alt-check, content section 15): a request id
// echoed on every update of that search (UCI info lines carry none, so this
// is the only per-request correlation), and a depth cap below the profile's.
// Both ride the same pending->current lifecycle as the FEN. Panel analyzes
// carry neither, and their updates are byte-identical to before.
let currentReqId = null;
let pendingReqId = null;
let currentDepth = 0;        // 0 = use the profile depth
let pendingDepth = 0;
// …and the width, which rides the same lifecycle for the same reason. It is
// applied with a `setoption` before each `go` rather than once at boot,
// because the panel and the storm's gather want different widths from ONE
// worker — and a width left behind by the previous search is a panel drawing
// twelve lines, or a gather storing three.
let currentMultipv = MULTIPV;
let pendingMultipv = 0;      // 0 = use MULTIPV
let appliedMultipv = 0;      // what the worker was last told, to skip a no-op
// PV plies converted to SAN, per request. A gather wants none: it stores
// scores, and converting a 12-ply line for each of thirty PVs is work whose
// output is thrown away.
let currentSanPlies = SAN_PLIES;
let pendingSanPlies = -1;    // <0 = use SAN_PLIES
let latest = null;           // { depth, pvs: { [multipv]: {depth, cp, mate, moves} } }
let flushTimer = 0;
let fenceTimer = 0;
let idleTimer = 0;
let lastLineAt = 0;          // liveness: timestamp of the last worker output line

// A search that produces NO output for SEARCH_SILENCE_MS means the worker
// died silently (some crashes never fire worker.onerror) — respawn.
setInterval(() => {
  if (phase === 'searching' && lastLineAt &&
      Date.now() - lastLineAt > SEARCH_SILENCE_MS) {
    respawnAndResume('no engine output for ' + SEARCH_SILENCE_MS + ' ms',
      pendingFen || currentFen,
      pendingFen ? pendingReqId : currentReqId,
      pendingFen ? pendingDepth : currentDepth,
      pendingFen ? pendingMultipv : currentMultipv,
      pendingFen ? pendingSanPlies : currentSanPlies);
  }
}, 5000);

// --- messaging --------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.target !== 'offscreen') return;
  touchIdleTimer();
  if (msg.type === 'clo-engine-analyze' && typeof msg.fen === 'string') {
    sendDebug('analyze received (phase ' + phase + ', profile ' + msg.profile + '): ' + msg.fen);
    handleAnalyze(msg.fen, msg.profile, msg.reqId, msg.depth, msg.multipv, msg.sanPlies);
  } else if (msg.type === 'clo-engine-stop') {
    sendDebug('stop received (phase ' + phase + ')');
    handleStop();
  }
});

function sendToSw(msg) {
  chrome.runtime.sendMessage(Object.assign({ target: 'sw' }, msg)).catch(() => {});
}

function sendStatus(status, detail) {
  sendToSw({ type: 'clo-engine-status', status, detail: detail || '' });
}

/** Breadcrumbs relayed to the tab console — the offscreen console is hard to
 *  reach, so lifecycle diagnostics travel the same status channel. */
function sendDebug(detail) {
  log(detail);
  sendStatus('debug', detail);
}

// --- engine boot ------------------------------------------------------------

function ensureEngine() {
  if (bootPromise) return bootPromise;
  bootPromise = bootEngine().catch((err) => {
    warn('engine boot failed:', err);
    sendStatus('error', String(err && err.message || err));
    bootPromise = null; // allow a retry on the next analyze
    killWorker();
    throw err;
  });
  return bootPromise;
}

/** Rejects with a clear "missing-build" error when a vendored file is absent —
 *  a fresh clone has neither pair, and many users download only one. The
 *  loader derives the .wasm path from the worker script's own name. */
async function assertBuildPresent(profileName, prof) {
  const files = [prof.worker, prof.worker.replace(/\.js$/, '.wasm')];
  for (const file of files) {
    let ok = false;
    // Plain GET with the body cancelled straight away: HEAD support on the
    // chrome-extension:// scheme is not guaranteed, and cancelling keeps the
    // 108 MB wasm from ever being buffered.
    try {
      const res = await fetch(file);
      ok = res.ok;
      if (res.body) res.body.cancel().catch(() => {});
    } catch (err) { /* missing */ }
    if (!ok) {
      throw new Error('missing-build (' + profileName + '): engine/' + file
        + ' — download it to engine/vendor/, see README');
    }
  }
}

async function bootEngine() {
  const profileName = requestedProfile;
  const prof = PROFILES[profileName];
  bootedProfile = profileName;
  log('offscreen boot: crossOriginIsolated =', self.crossOriginIsolated);
  if (!self.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
    throw new Error('SharedArrayBuffer unavailable — multi-threaded build cannot run '
      + '(swap engine/vendor for the -single build as a fallback)');
  }
  await assertBuildPresent(profileName, prof);
  sendStatus('loading');
  sendDebug('boot: spawning worker ' + prof.worker + ' (profile ' + profileName + ')');
  worker = new Worker(prof.worker);
  worker.onmessage = (e) => onEngineLine(String(e.data));
  worker.onerror = (e) => {
    const where = (e.filename || '?') + ':' + (e.lineno || '?');
    warn('engine worker error:', e.message || e, where);
    // Report ALWAYS — a crash mid-search would otherwise be silent.
    sendStatus('error', 'worker error: ' + (e.message || 'unknown') + ' @ ' + where);
    if (expecting) {
      expecting.reject(new Error('worker error: ' + (e.message || 'unknown')));
    } else {
      // Crash outside the handshake: respawn and re-search the position the
      // dead worker was on (otherwise the search wedges until the NEXT
      // analyze happens to arm the stop-fence).
      respawnAndResume('worker error', pendingFen || currentFen,
        pendingFen ? pendingReqId : currentReqId,
        pendingFen ? pendingDepth : currentDepth);
    }
  };
  worker.onmessageerror = () => sendStatus('error', 'worker messageerror (deserialization)');
  uciSend('uci');
  await waitFor('uciok');
  sendDebug('boot: uciok received');
  uciSend(`setoption name Threads value ${prof.threads}`);
  uciSend(`setoption name Hash value ${prof.hash}`);
  uciSend(`setoption name MultiPV value ${MULTIPV}`);
  appliedMultipv = MULTIPV;
  uciSend('isready');
  await waitFor('readyok');
  log(`engine ready (profile=${profileName} Threads=${prof.threads} Hash=${prof.hash} MultiPV=${MULTIPV})`);
  sendStatus('ready');
}

function uciSend(cmd) {
  if (worker) worker.postMessage(cmd);
}

function waitFor(token) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => { expecting = null; reject(new Error(`timed out waiting for "${token}"`)); },
      HANDSHAKE_TIMEOUT_MS);
    expecting = {
      token,
      resolve: () => { clearTimeout(timer); expecting = null; resolve(); },
      reject:  (err) => { clearTimeout(timer); expecting = null; reject(err); },
    };
  });
}

function killWorker() {
  if (worker) { worker.terminate(); worker = null; }
  bootPromise = null;
  bootedProfile = null;
  phase = 'idle';
  currentFen = null;
  currentReqId = null;
  currentDepth = 0;
  clearTimeout(flushTimer); flushTimer = 0;
  clearTimeout(fenceTimer); fenceTimer = 0;
}

/** Tears the worker down and restarts a search. Crash recovery passes the
 *  position the dead worker was on; the stop-fence passes only pendingFen
 *  (null after a deliberate stop — a stop must never resurrect a search).
 *  The resumed search keeps its request tag and depth cap. */
function respawnAndResume(reason, resumeFen, resumeReqId, resumeDepth, resumeMultipv, resumeSanPlies) {
  sendDebug('respawning worker (' + reason + '), phase was ' + phase);
  killWorker();
  pendingFen = resumeFen || null;
  pendingReqId = resumeReqId || null;
  pendingDepth = resumeDepth || 0;
  // THE WIDTH HAS TO BE RESUMED TOO, or a wide search that died is silently
  // restarted three lines wide — which for a stored list is not a failure but
  // a shorter answer, i.e. exactly the shape of defect this file's comments
  // keep warning about. `appliedMultipv` is belt and braces: every worker birth
  // resets it in `bootEngine`, and this makes the invariant local to the one
  // place that kills a worker without going through a `go`.
  pendingMultipv = resumeMultipv || 0;
  pendingSanPlies = typeof resumeSanPlies === 'number' ? resumeSanPlies : -1;
  appliedMultipv = 0;
  startPending();
}

// --- search state machine ---------------------------------------------------

function handleAnalyze(fen, profile, reqId, depth, multipv, sanPlies) {
  // Unknown/absent profile falls back to desktop — today's behaviour.
  requestedProfile = PROFILES[profile] ? profile : 'desktop';
  pendingFen = fen;
  pendingReqId = typeof reqId === 'string' && reqId ? reqId : null;
  pendingDepth = Number.isInteger(depth) && depth > 0 ? depth : 0;
  pendingMultipv = Number.isInteger(multipv) && multipv > 0
    ? Math.min(multipv, MULTIPV_MAX) : 0;
  pendingSanPlies = Number.isInteger(sanPlies) && sanPlies >= 0 ? sanPlies : -1;
  if (phase === 'searching') {
    // Fence: discard everything until bestmove, then start the pending FEN.
    phase = 'stopping';
    uciSend('stop');
    armFence();
  } else if (phase === 'idle') {
    startPending();
  }
  // phase === 'stopping': pendingFen is updated; the fence handler starts it.
}

function handleStop() {
  pendingFen = null;
  pendingReqId = null;
  pendingDepth = 0;
  if (phase === 'searching') {
    phase = 'stopping';
    uciSend('stop');
    armFence();
  }
}

function startPending() {
  if (!pendingFen) return;
  // Profile switch: an idle worker on the wrong build is torn down here, so
  // ensureEngine below boots the requested one (same lifecycle path as a
  // crash respawn). A switch mid-search needs nothing extra — handleAnalyze
  // already stops it and the bestmove fence lands back here with phase idle.
  if (bootedProfile && bootedProfile !== requestedProfile && phase === 'idle') {
    sendDebug('profile switch: ' + bootedProfile + ' -> ' + requestedProfile);
    killWorker();
  }
  ensureEngine().then(() => {
    // Re-check everything: newer analyze/stop calls may have landed while the
    // engine booted, and concurrent startPending calls all run this block.
    if (!pendingFen) return;
    if (bootedProfile !== requestedProfile) { killWorker(); startPending(); return; } // profile changed mid-boot
    if (phase === 'searching') { phase = 'stopping'; uciSend('stop'); armFence(); return; }
    if (phase !== 'idle') return; // 'stopping': the bestmove fence will restart us
    const fen = pendingFen;
    const prof = PROFILES[bootedProfile];
    pendingFen = null;
    currentFen = fen;
    currentReqId = pendingReqId;
    pendingReqId = null;
    // A per-request depth cap only ever lowers the profile depth.
    currentDepth = pendingDepth > 0 ? Math.min(pendingDepth, prof.depth) : 0;
    pendingDepth = 0;
    const goDepth = currentDepth || prof.depth;
    currentMultipv = pendingMultipv > 0 ? pendingMultipv : MULTIPV;
    pendingMultipv = 0;
    currentSanPlies = pendingSanPlies >= 0 ? pendingSanPlies : SAN_PLIES;
    pendingSanPlies = -1;
    latest = { depth: 0, pvs: {} };
    phase = 'searching';
    lastLineAt = Date.now();
    sendDebug('search start: ' + fen + (currentReqId ? ' (req ' + currentReqId + ', depth ' + goDepth + ')' : ''));
    // BEFORE `position`, and only when it changed: a `setoption` mid-search is
    // undefined behaviour, and this is the one moment the worker is idle and
    // the width for the search about to start is known.
    if (appliedMultipv !== currentMultipv) {
      uciSend(`setoption name MultiPV value ${currentMultipv}`);
      appliedMultipv = currentMultipv;
    }
    uciSend(`position fen ${fen}`);
    uciSend(prof.movetime > 0
      ? `go depth ${goDepth} movetime ${prof.movetime}`
      : `go depth ${goDepth}`);
  }).catch(() => {}); // boot failure already reported via clo-engine-status
}

function armFence() {
  clearTimeout(fenceTimer);
  fenceTimer = setTimeout(() => {
    respawnAndResume('no bestmove within ' + STOP_FENCE_TIMEOUT_MS + ' ms after stop',
      pendingFen, pendingReqId, pendingDepth);
  }, STOP_FENCE_TIMEOUT_MS);
}

function onEngineLine(line) {
  lastLineAt = Date.now();
  if (expecting) {
    if (line === expecting.token || line.startsWith(expecting.token)) expecting.resolve();
    return;
  }
  if (line.startsWith('bestmove')) {
    clearTimeout(fenceTimer); fenceTimer = 0;
    sendDebug('bestmove (phase was ' + phase + ')');
    if (phase === 'searching') flush(true); // natural completion
    phase = 'idle';
    currentFen = null;
    currentReqId = null;
    currentDepth = 0;
    startPending();
    return;
  }
  if (phase === 'searching' && line.startsWith('info ')) parseInfo(line);
}

// --- info parsing & updates -------------------------------------------------

function parseInfo(line) {
  const tokens = line.split(/\s+/);
  // Bound scores mid-aspiration are noise; require a real PV line.
  if (tokens.includes('lowerbound') || tokens.includes('upperbound')) return;
  const pvIdx = tokens.indexOf('pv');
  const mpvIdx = tokens.indexOf('multipv');
  const depthIdx = tokens.indexOf('depth');
  const scoreIdx = tokens.indexOf('score');
  if (pvIdx < 0 || mpvIdx < 0 || depthIdx < 0 || scoreIdx < 0) return;

  const multipv = Number(tokens[mpvIdx + 1]);
  const depth = Number(tokens[depthIdx + 1]);
  if (!multipv || multipv > currentMultipv || !depth) return;

  const entry = { depth, cp: null, mate: null, moves: tokens.slice(pvIdx + 1) };
  if (tokens[scoreIdx + 1] === 'cp') entry.cp = Number(tokens[scoreIdx + 2]);
  else if (tokens[scoreIdx + 1] === 'mate') entry.mate = Number(tokens[scoreIdx + 2]);
  else return;

  latest.pvs[multipv] = entry;
  if (multipv === 1) latest.depth = depth;
  scheduleFlush();
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => { flushTimer = 0; flush(false); }, THROTTLE_MS);
}

function flush(done) {
  clearTimeout(flushTimer); flushTimer = 0;
  if (!currentFen || !latest) return;
  const blackToMove = currentFen.split(/\s+/)[1] === 'b';
  const pvs = [];
  for (let n = 1; n <= currentMultipv; n++) {
    const entry = latest.pvs[n];
    if (!entry) continue;
    // PER-PV DEPTH, and it is load-bearing for any WIDE search: `latest.pvs`
    // is cumulative across iterations, so a search ended early (a budget, a
    // stop) flushes a list whose lines come from TWO different depths — and a
    // scored list straddling two depths is exactly the cross-depth subtraction
    // §3.4 forbids, made invisible. `msg.depth` alone cannot show it, being
    // multipv 1's. A consumer that wants one consistent iteration groups on
    // this; the panel, which draws three lines as they improve, ignores it.
    const pv = { multipv: n, depth: entry.depth };
    // UCI scores are side-to-move-relative; display is always White-positive.
    if (entry.cp !== null) pv.cp = blackToMove ? -entry.cp : entry.cp;
    if (entry.mate !== null) pv.mate = blackToMove ? -entry.mate : entry.mate;
    // `currentSanPlies` 0 = the caller wants scores only (a gather), so no
    // conversion runs and `pv.san` is simply absent. Every existing consumer
    // asks for the default and is unaffected.
    let san = '';
    if (currentSanPlies > 0) {
      san = CloSan.pvToSan(currentFen, entry.moves.slice(0, currentSanPlies));
      pv.san = san || entry.moves.slice(0, currentSanPlies).join(' '); // raw UCI fallback
    }
    // The line's FIRST move as plain uci. `san` is a numbered STRING ("5.Nf3
    // Nc6 …") and cannot be joined onto anything; this is what lets the panel
    // put a second source's eval for the same move beside this line
    // (DESIGN-chessdb.md §6.4) without parsing that string back apart.
    pv.uci = entry.moves[0] || '';
    if (currentSanPlies > 0 && !san) warn('SAN conversion failed for pv', n, 'of', currentFen);
    pvs.push(pv);
  }
  if (!pvs.length) return;
  const update = { type: 'clo-engine-update', fen: currentFen, depth: latest.depth, done, pvs };
  if (currentReqId) update.reqId = currentReqId; // panel updates stay tag-free
  sendToSw(update);
  touchIdleTimer();
}

// --- idle self-close --------------------------------------------------------

function touchIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (phase === 'idle') {
      log('idle for', IDLE_CLOSE_MS / 1000, 's — closing offscreen document');
      window.close();
    } else {
      touchIdleTimer(); // search still running; check again later
    }
  }, IDLE_CLOSE_MS);
}

touchIdleTimer();
log('offscreen engine controller loaded');
