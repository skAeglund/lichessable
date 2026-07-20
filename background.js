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
 * Quick-edit comment (content section 12): drives Chessable's own edit page in
 * a background tab to append a PGN comment. One job at a time, kept in
 * chrome.storage.session so it survives a worker idle-restart:
 *   { type:'clo-quick-edit-run', mode:'probe'|'save', oid, bid, san, color,
 *     plyIndex, commentText, forThisVariationOnly }  (review tab -> worker)
 *       -> opens /explore/edit/<oid>/ active:false
 *   { type:'clo-quick-edit-claim', oid }   (edit-tab driver -> worker)
 *       -> { claimed, mode, san, color, plyIndex, commentText, forThisVariationOnly }
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
 *   { target:'sw', type:'clo-engine-analyze', fen } -> forwarded to offscreen;
 *       the sender's {tabId, frameId} is stored in chrome.storage.session so
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
    chrome.runtime.sendMessage({ target: 'offscreen', type: 'clo-engine-analyze', fen: msg.fen })
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
    tab = await chrome.tabs.create({ url, active: false });
  } catch (err) {
    chrome.tabs.sendMessage(sender.tab.id, {
      type: 'clo-quick-edit-result', oid, bid: msg.bid, mode: msg.mode,
      ok: false, error: 'could not open the edit tab',
    }, { frameId: sender.frameId || 0 }).catch(() => {});
    return;
  }

  const job = {
    oid, bid: msg.bid || '', mode: msg.mode === 'probe' ? 'probe' : 'save',
    san: msg.san, color: msg.color, plyIndex: msg.plyIndex,
    commentText: msg.commentText, forThisVariationOnly: Boolean(msg.forThisVariationOnly),
    requesterTabId: sender.tab.id, requesterFrameId: sender.frameId || 0,
    hiddenTabId: tab.id, phase: 'loading',
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
  if (job.hiddenTabId == null) { job.hiddenTabId = sender.tab.id; await setQuickEditJob(job); }
  if (job.hiddenTabId !== sender.tab.id) return { claimed: false };
  return {
    claimed: true, mode: job.mode,
    san: job.san, color: job.color, plyIndex: job.plyIndex,
    commentText: job.commentText, forThisVariationOnly: job.forThisVariationOnly,
  };
}

async function markQuickEditSubmitting(msg) {
  const job = await getQuickEditJob();
  if (!job || String(job.oid) !== String(msg.oid)) return;
  job.phase = 'submitted';
  await setQuickEditJob(job);
}

/** Post-submit landing (/mt1/explore/?edit=<oid>) from the hidden tab = success. */
async function handleQuickEditLanding(msg, sender) {
  const job = await getQuickEditJob();
  if (!job || job.phase !== 'submitted' || String(job.oid) !== String(msg.oid)) return { isOurs: false };
  if (!sender.tab || sender.tab.id !== job.hiddenTabId) return { isOurs: false };
  await finalizeQuickEditJob(job, { ok: true, mode: 'save' });
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
