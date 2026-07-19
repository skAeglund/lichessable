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
