/**
 * LiChessable — background service worker
 *
 * The Lichess opening explorer requires authentication (Bearer token) since
 * early 2026. Doing the fetch here instead of in the content script has two
 * advantages:
 *   1. With the host_permission for explorer.lichess.org, worker fetches are
 *      exempt from CORS entirely — no preflight concerns.
 *   2. The token never has to pass through the content script.
 *
 * Message protocol (from content/lichessable.js):
 *   { type: 'clo-fetch-explorer', url }  -> { ok:true, data }
 *                                        |  { ok:false, status, error, noToken? }
 *   { type: 'clo-open-options' }         -> opens the extension options page
 *   { type: 'clo-open-overstudy', url }  -> opens a chessable.com /learn/ URL
 *                                           in a BACKGROUND tab (review-mode
 *                                           overstudy widget; needs no "tabs"
 *                                           permission)
 *
 * Quick-edit (content section 12): drives Chessable's own edit page in a
 * small unfocused popup window to append a PGN comment (mode 'save') or add
 * an alternative move (mode 'alt'; altSan = the SAN the trainer should also
 * accept). A visible window rather than a hidden tab because Chrome clamps
 * every timer on hidden pages to ~1 s, tripling the save time. One job
 * at a time, kept in chrome.storage.session so it survives a worker
 * idle-restart:
 *   { type:'clo-quick-edit-run', mode:'probe'|'save'|'alt', oid, bid, san,
 *     color, plyIndex, commentText, altSan, forThisVariationOnly }
 *     (review tab -> worker) -> opens /explore/edit/<oid>/ focused:false
 *   { type:'clo-quick-edit-claim', oid }   (edit-tab driver -> worker)
 *       -> { claimed, mode, san, color, plyIndex, commentText, altSan,
 *            forThisVariationOnly }
 *   { type:'clo-quick-edit-submitting', oid } (driver -> worker; marks phase)
 *   { type:'clo-quick-edit-landing', oid }    (post-POST doc -> worker)
 *       -> { isOurs }  (true = the job's submit succeeded)
 *   { type:'clo-quick-edit-result', oid, ok, canEdit?, error? } (driver -> worker)
 *   The worker relays a clo-quick-edit-result back to the review tab via
 *   chrome.tabs.sendMessage and closes the hidden tab.
 *
 * { type:'clo-ping' } -> { ok:true }. Exists so a content script can wake
 * this worker (and thereby run the setAccessLevel call below) before its
 * first chrome.storage.session read.
 *
 * Engine messages (Stockfish runs in an offscreen document; this worker is
 * the hub because offscreen sendMessage can never reach content scripts).
 * All engine messages carry a `target` field ('sw' | 'offscreen'); each
 * context ignores messages not addressed to it:
 *   { target:'sw', type:'clo-engine-analyze', fen, profile } -> forwarded to
 *       offscreen (profile 'desktop'|'mobile' picks the Stockfish build —
 *       computed by the content script, this worker just relays it); the
 *       sender's {tabId, frameId} is stored in chrome.storage.session so
 *       replies can be routed even after this worker idle-restarts
 *   { target:'sw', type:'clo-engine-stop' }         -> forwarded (engine warm)
 *   { target:'sw', type:'clo-engine-shutdown' }     -> closes the offscreen
 *       document, freeing the engine's memory
 *   { target:'sw', type:'clo-engine-update'|'clo-engine-status', ... }
 *       (from offscreen) -> relayed to the requesting tab/frame via
 *       chrome.tabs.sendMessage (no "tabs" permission needed)
 */
'use strict';

const ALLOWED_URL_PREFIX = 'https://explorer.lichess.org/';
const TOKEN_KEY = 'lichessToken'; // must match content/lichessable.js and options/options.js

// Overstudy tabs may only ever point at Chessable's learn route:
// /learn/<courseId>/<variationId>[/<listId>][/w|b] — ground-truthed against
// Chessable's own Overstudy buttons (they navigate to e.g.
// /learn/<bid>/<oid>/<lid>/b; the color suffix is optional).
const OVERSTUDY_URL_RE = /^https:\/\/www\.chessable\.com\/learn\/\d+\/\d+(?:\/\d+)?(?:\/[wb])?\/?$/;

// chrome.storage.session key: {tabId, frameId} of the tab the engine serves.
const ENGINE_TARGET_KEY = 'cloEngineTarget';

// Quick-edit comment (content section 12): the worker opens Chessable's own
// edit page in a background tab and the driver there submits the change. Only
// the numeric variation id is ever interpolated into the URL.
const QUICK_EDIT_BASE = 'https://www.chessable.com/explore/edit/';
const QUICK_EDIT_JOB_KEY = 'cloQuickEditJob'; // chrome.storage.session; one job at a time
const QUICK_EDIT_TIMEOUT_MS = 25000;          // hard cap; force-fail + close the tab
let quickEditTimer = null;



// The auto-play session record lives in chrome.storage.session but is read
// and written by the content script, which cannot touch that area until this
// runs. Top-level so every worker start re-applies it.
chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })
  .catch((err) => console.warn('[CLO] setAccessLevel failed:', err));

// Last engine-hub failure, surfaced via clo-engine-ping (the worker console
// is hard to reach; the content script asks for this when the engine goes
// quiet and logs it in the page console).
let lastEngineError = '';
function recordEngineError(where, err) {
  lastEngineError = where + ': ' + String(err && err.message || err);
  console.warn('[CLO]', lastEngineError);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'clo-fetch-explorer') {
    handleExplorerFetch(msg.url).then(sendResponse);
    return true; // keep the message channel open for the async response
  }
  if (msg && msg.type === 'clo-open-options') {
    chrome.runtime.openOptionsPage();
  }
  if (msg && msg.type === 'clo-open-overstudy') {
    openOverstudyTab(msg.url);
  }
  // Quick-edit comment hub.
  if (msg && msg.type === 'clo-quick-edit-run') {
    startQuickEditJob(msg, sender);
  }
  if (msg && msg.type === 'clo-quick-edit-claim') {
    claimQuickEditJob(msg, sender).then(sendResponse);
    return true;
  }
  if (msg && msg.type === 'clo-quick-edit-submitting') {
    markQuickEditSubmitting(msg);
  }
  if (msg && msg.type === 'clo-quick-edit-landing') {
    handleQuickEditLanding(msg, sender).then(sendResponse);
    return true;
  }
  if (msg && msg.type === 'clo-quick-edit-result') {
    finishQuickEditJob(msg);
  }
  if (msg && msg.type === 'clo-quick-edit-is-driver') {
    // The popup window's TOP document asks whether it belongs to a running
    // job, so it can cover the page with the "Saving…" shield.
    (async () => {
      const job = await getQuickEditJob();
      const isDriver = Boolean(job && sender.tab && sender.tab.id === job.hiddenTabId
        && String(job.oid) === String(msg.oid));
      sendResponse({ isDriver, mode: isDriver ? job.mode : undefined });
    })();
    return true;
  }

  if (msg && msg.type === 'clo-ping') {
    sendResponse({ ok: true });
  }
  // Engine hub.
  if (msg && msg.target === 'sw') {
    if (msg.type === 'clo-engine-ping') {
      engineHubState().then(sendResponse);
      return true;
    }
    if (msg.type === 'clo-engine-analyze') {
      handleEngineAnalyze(msg, sender);
    } else if (msg.type === 'clo-engine-stop') {
      forwardToOffscreenIfPresent(msg);
    } else if (msg.type === 'clo-engine-shutdown') {
      chrome.offscreen.closeDocument().catch(() => {});
    } else if (msg.type === 'clo-engine-update' || msg.type === 'clo-engine-status') {
      relayEngineMessageToTab(msg);
    }
  }
  return false;
});

// --- engine hub -------------------------------------------------------------

// Dedupes concurrent createDocument calls within one worker life;
// hasDocument() covers worker restarts.
let creatingOffscreen = null;
async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: 'engine/offscreen.html',
      reasons: ['WORKERS'],
      justification: 'Runs the Stockfish WASM engine in Web Workers',
    }).finally(() => { creatingOffscreen = null; });
  }
  await creatingOffscreen;
}

async function handleEngineAnalyze(msg, sender) {
  try {
    if (!sender.tab || typeof sender.tab.id !== 'number') return;
    await chrome.storage.session.set({
      [ENGINE_TARGET_KEY]: { tabId: sender.tab.id, frameId: sender.frameId || 0 },
    });
    await ensureOffscreen();
    chrome.runtime.sendMessage({ target: 'offscreen', type: 'clo-engine-analyze', fen: msg.fen, profile: msg.profile })
      .catch((err) => recordEngineError('analyze forward', err));
  } catch (err) {
    recordEngineError('analyze', err);
  }
}

/** stop must never CREATE the document just to tell nobody to stop. */
async function forwardToOffscreenIfPresent(msg) {
  try {
    if (!(await chrome.offscreen.hasDocument())) return;
    chrome.runtime.sendMessage({ target: 'offscreen', type: msg.type }).catch(() => {});
  } catch (err) {
    recordEngineError('forward', err);
  }
}

/** Diagnostic snapshot for clo-engine-ping. */
async function engineHubState() {
  const out = { lastEngineError };
  try { out.hasDocument = await chrome.offscreen.hasDocument(); }
  catch (err) { out.hasDocument = 'error: ' + String(err && err.message || err); }
  try {
    const stored = await chrome.storage.session.get(ENGINE_TARGET_KEY);
    out.target = stored[ENGINE_TARGET_KEY] || null;
  } catch (err) { out.target = 'error: ' + String(err && err.message || err); }
  return out;
}

async function relayEngineMessageToTab(msg) {
  try {
    const stored = await chrome.storage.session.get(ENGINE_TARGET_KEY);
    const target = stored[ENGINE_TARGET_KEY];
    if (!target) return;
    await chrome.tabs.sendMessage(target.tabId, msg, { frameId: target.frameId });
  } catch (err) {
    // Tab or frame is gone (e.g. mid-navigation) — just drop the message.
    // Do NOT close the offscreen document here: a stale in-flight update
    // racing a fresh analyze from the new page would kill a healthy engine.
    // Memory is reclaimed by the engine's own idle self-close instead.
  }
}

function openOverstudyTab(url) {
  if (typeof url !== 'string' || !OVERSTUDY_URL_RE.test(url)) {
    console.warn('[CLO] blocked overstudy tab for unexpected URL:', url);
    return;
  }
  // active:false — the review session keeps focus; the overstudy tab waits.
  chrome.tabs.create({ url, active: false });
}

// --- quick-edit comment hub -------------------------------------------------
// A single job at a time, stored in chrome.storage.session so routing/cleanup
// survives a worker idle-restart (same rationale as ENGINE_TARGET_KEY).

async function getQuickEditJob() {
  try {
    const stored = await chrome.storage.session.get(QUICK_EDIT_JOB_KEY);
    return stored[QUICK_EDIT_JOB_KEY] || null;
  } catch (err) { return null; }
}
async function setQuickEditJob(job) {
  try { await chrome.storage.session.set({ [QUICK_EDIT_JOB_KEY]: job }); } catch (err) { /* ignore */ }
}
async function clearQuickEditJob() {
  try { await chrome.storage.session.remove(QUICK_EDIT_JOB_KEY); } catch (err) { /* ignore */ }
}

function relayQuickEditResult(job, result) {
  chrome.tabs.sendMessage(job.requesterTabId, {
    type: 'clo-quick-edit-result',
    oid: job.oid, bid: job.bid, mode: result.mode || job.mode,
    ok: Boolean(result.ok), canEdit: result.canEdit, error: result.error,
    timing: quickEditTiming(job),
  }, { frameId: job.requesterFrameId }).catch(() => {});
}

async function startQuickEditJob(msg, sender) {
  const oid = String(msg.oid || '');
  if (!/^\d+$/.test(oid)) return;
  if (!sender.tab || typeof sender.tab.id !== 'number') return;

  // One job at a time: reject a second concurrent request outright.
  if (await getQuickEditJob()) {
    chrome.tabs.sendMessage(sender.tab.id, {
      type: 'clo-quick-edit-result', oid, bid: msg.bid, mode: msg.mode,
      ok: false, error: 'another quick-edit is in progress',
    }, { frameId: sender.frameId || 0 }).catch(() => {});
    return;
  }

  const url = QUICK_EDIT_BASE + oid + '/';
  let tab;
  try {
    // A small FOCUSED popup window, not a hidden tab: Chrome clamps every
    // timer on a hidden page to ~1 s — Chessable's own boot, animations and
    // dialogs included — which stretched a save from ~4-5 s to ~13-20 s. It
    // must be focused: an unfocused window opens BEHIND a maximized browser,
    // where the occlusion tracker throttles it exactly like a hidden tab
    // (verified: focused:false saved nothing). The content script covers the
    // window with a "Saving…" shield that also swallows stray keystrokes, and
    // closing the job's tab (finalize) closes the window, returning focus.
    // Placement: the requester sends screen bounds putting the window right
    // BESIDE its quick-edit popup (msg.win — position sanity-checked here,
    // sizes clamped; Chrome additionally enforces its own popup minimums);
    // fallback is the bottom-right of the user's current window.
    let req = msg.win;
    if (!req || ![req.left, req.top, req.width, req.height].every(Number.isFinite)) req = null;
    const width = req ? Math.min(Math.max(req.width, 200), 800) : 380;
    const height = req ? Math.min(Math.max(req.height, 120), 800) : 320;
    let left, top;
    if (req) {
      left = req.left;
      top = req.top;
    } else {
      let bounds = null;
      try { bounds = await chrome.windows.getLastFocused(); } catch (e) { /* fall through */ }
      left = bounds ? Math.max(0, bounds.left + bounds.width - width - 8) : undefined;
      top = bounds ? Math.max(0, bounds.top + bounds.height - height - 8) : undefined;
    }
    const win = await chrome.windows.create({
      url, focused: true, type: 'popup', width, height, left, top,
    });
    tab = win && win.tabs && win.tabs[0];
    if (!tab) throw new Error('popup window has no tab');
  } catch (err) {
    // Popup creation can be refused (e.g. odd window managers) — fall back to
    // the hidden tab: slower, but the job still completes.
    try {
      tab = await chrome.tabs.create({ url, active: false });
    } catch (err2) {
      chrome.tabs.sendMessage(sender.tab.id, {
        type: 'clo-quick-edit-result', oid, bid: msg.bid, mode: msg.mode,
        ok: false, error: 'could not open the edit tab',
      }, { frameId: sender.frameId || 0 }).catch(() => {});
      return;
    }
  }

  const job = {
    oid, bid: msg.bid || '',
    mode: msg.mode === 'probe' ? 'probe' : msg.mode === 'alt' ? 'alt' : 'save',
    san: msg.san, color: msg.color, plyIndex: msg.plyIndex,
    commentText: msg.commentText, altSan: msg.altSan,
    forThisVariationOnly: Boolean(msg.forThisVariationOnly),
    requesterTabId: sender.tab.id, requesterFrameId: sender.frameId || 0,
    hiddenTabId: tab.id, phase: 'loading',
    t0: Date.now(), // phase timestamps for the timing line in the result
  };
  await setQuickEditJob(job);
  clearTimeout(quickEditTimer);
  quickEditTimer = setTimeout(() => failQuickEditJob('timeout'), QUICK_EDIT_TIMEOUT_MS);
}

/** The driver (in the hidden tab's edit iframe) asks whether it has a job. */
async function claimQuickEditJob(msg, sender) {
  const job = await getQuickEditJob();
  if (!job || String(job.oid) !== String(msg.oid)) return { claimed: false };
  if (!sender.tab || typeof sender.tab.id !== 'number') return { claimed: false };
  // Bind the hidden tab id on first claim (tabs.create resolves before the
  // page's content script runs, so this is normally already set).
  if (job.hiddenTabId == null) job.hiddenTabId = sender.tab.id;
  if (job.hiddenTabId !== sender.tab.id) return { claimed: false };
  job.tClaim = Date.now();
  await setQuickEditJob(job);
  return {
    claimed: true, mode: job.mode,
    san: job.san, color: job.color, plyIndex: job.plyIndex,
    commentText: job.commentText, altSan: job.altSan,
    forThisVariationOnly: job.forThisVariationOnly,
  };
}

async function markQuickEditSubmitting(msg) {
  const job = await getQuickEditJob();
  if (!job || String(job.oid) !== String(msg.oid)) return;
  job.phase = 'submitted';
  job.tSubmit = Date.now();
  await setQuickEditJob(job);
}

/** "load 3.2s, drive 7.8s, post 1.9s" — where a job's wall time went. */
function quickEditTiming(job) {
  if (!job.t0) return '';
  const s = (a, b) => (a && b ? ((b - a) / 1000).toFixed(1) + 's' : '?');
  const now = Date.now();
  return 'load ' + s(job.t0, job.tClaim)
    + ', drive ' + s(job.tClaim, job.tSubmit || now)
    + (job.tSubmit ? ', post ' + s(job.tSubmit, now) : '');
}

/** Post-submit landing (/mt1/explore/?edit=<oid>) from the hidden tab = success. */
async function handleQuickEditLanding(msg, sender) {
  const job = await getQuickEditJob();
  if (!job || job.phase !== 'submitted' || String(job.oid) !== String(msg.oid)) return { isOurs: false };
  if (!sender.tab || sender.tab.id !== job.hiddenTabId) return { isOurs: false };
  await finalizeQuickEditJob(job, { ok: true, mode: job.mode });
  return { isOurs: true };
}

/** From the driver (probe result, or a save error). */
async function finishQuickEditJob(msg) {
  const job = await getQuickEditJob();
  if (!job || String(job.oid) !== String(msg.oid)) return;
  await finalizeQuickEditJob(job, { ok: msg.ok, mode: msg.mode, canEdit: msg.canEdit, error: msg.error });
}

async function failQuickEditJob(reason) {
  const job = await getQuickEditJob();
  if (!job) return;
  await finalizeQuickEditJob(job, { ok: false, error: reason });
}

/** Relay the outcome to the review tab, close the hidden tab, clear the job. */
async function finalizeQuickEditJob(job, result) {
  clearTimeout(quickEditTimer);
  quickEditTimer = null;
  relayQuickEditResult(job, result);
  if (job.hiddenTabId != null) chrome.tabs.remove(job.hiddenTabId).catch(() => {});
  await clearQuickEditJob();
}

// --- Lichess explorer fetch ------------------------------------------------

async function handleExplorerFetch(url) {
  try {
    // Only ever fetch the explorer — refuse anything else on principle.
    if (typeof url !== 'string' || !url.startsWith(ALLOWED_URL_PREFIX)) {
      return { ok: false, status: 0, error: 'blocked non-explorer URL' };
    }

    const stored = await chrome.storage.local.get(TOKEN_KEY);
    const token = (stored[TOKEN_KEY] || '').trim();
    if (!token) {
      // Same shape as a real 401 so the panel shows the token prompt.
      return { ok: false, status: 401, error: 'no Lichess API token configured', noToken: true };
    }

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      return { ok: false, status: response.status, error: `HTTP ${response.status}` };
    }
    const data = await response.json();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, status: 0, error: String(err) };
  }
}
