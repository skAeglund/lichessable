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
 * small FOCUSED popup window to append a PGN comment (mode 'save'), REPLACE
 * one wholesale (mode 'edit'; baseText = the text the popup was filled from,
 * which the driver refuses to clobber if it has changed since) or add
 * alternative moves (mode 'alt'; altSans = the SANs the trainer should also
 * accept — several are added in one visit, under one submit). Mode 'load' is
 * the read half of an edit: it selects the move,
 * reports the raw "Comments After" text and submits NOTHING — the rendered
 * comment in the review column is not the stored text, so this round trip is
 * the only way to fill the editor with something safe to save back. Like
 * 'probe' it also answers the edit-rights question, so an edit never needs a
 * probe of its own. ALWAYS a VISIBLE surface, never a background tab — Chrome
 * clamps every timer on a hidden page to ~1 s (Chessable's own boot,
 * animations and dialogs included), which stretched a save from ~4-5 s to
 * ~13-20 s, i.e. right up against this worker's job timeout. That surface is a
 * focused popup window wherever there are windows, and a FOREGROUND tab where
 * there are not (Android; see openDriverSurface). One job at a
 * time, kept in chrome.storage.session so it survives a worker idle-restart:
 *   { type:'clo-quick-edit-run', mode:'probe'|'load'|'save'|'edit'|'alt'|'shapes'|'key',
 *     oid, bid, san, color, plyIndex, commentText, baseText, altSans,
 *     shapes, baseShapes, forThisVariationOnly, win }
 *     ('key' carries plyIndex/san/color plus fromPlyIndex, the ply the key mark
 *      is expected to be on - the driver reads the mark off the edit page and
 *      refuses when the two disagree)
 *     (review tab -> worker) -> opens /explore/edit/<oid>/ in the popup
 *   { type:'clo-quick-edit-claim', oid }   (edit-tab driver -> worker)
 *       -> { claimed, mode, san, color, plyIndex, commentText, baseText,
 *            altSans, shapes, baseShapes, forThisVariationOnly }
 *   { type:'clo-quick-edit-submitting', oid } (driver -> worker; marks phase)
 *   { type:'clo-quick-edit-landing', oid }    (post-POST doc -> worker)
 *       -> { isOurs }  (true = the job's submit succeeded)
 *   { type:'clo-quick-edit-result', oid, ok, canEdit?, text?, shapes?, error? }
 *       (driver -> worker; `text` + `shapes` are the 'load' payload)
 *   The worker relays a clo-quick-edit-result back to the review tab via
 *   chrome.tabs.sendMessage and closes the driver window.
 *
 * { type:'clo-ping' } -> { ok:true }. Exists so a content script can wake
 * this worker (and thereby run the setAccessLevel call below) before its
 * first chrome.storage.session read.
 *
 * Engine messages (Stockfish runs in an offscreen document; this worker is
 * the hub because offscreen sendMessage can never reach content scripts).
 * All engine messages carry a `target` field ('sw' | 'offscreen'); each
 * context ignores messages not addressed to it:
 *   { target:'sw', type:'clo-engine-analyze', fen, profile, reqId?, depth? }
 *       -> forwarded to offscreen (profile 'desktop'|'mobile' picks the
 *       Stockfish build — computed by the content script, this worker just
 *       relays it; reqId is an optional request tag the offscreen echoes on
 *       that search's updates, depth an optional per-request cap — both used
 *       by the alt-check feature, content section 15); the sender's
 *       {tabId, frameId} is stored in chrome.storage.session so replies can
 *       be routed even after this worker idle-restarts
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

// A token this browser profile can start with, so a new profile (or a reinstall,
// or the phone) does not need it pasted in by hand. It lives in an UNTRACKED
// file — `local-token.json`, gitignored — rather than in any source file here,
// which is the whole point: a secret committed once is in every clone and in
// every .crx packed from them for ever, and CLAUDE.md's "never store the token
// in the repo" rule exists for that reason rather than because the token's
// scope is frightening. Absent file = exactly the behaviour before this: the
// options page asks for a token.
//
// It NEVER overwrites a token already in storage, so pasting a new one in the
// options page wins permanently and rotating the old one costs nothing here.
const LOCAL_TOKEN_FILE = 'local-token.json';

async function seedTokenFromLocalFile() {
  try {
    const stored = await chrome.storage.local.get(TOKEN_KEY);
    if (stored && stored[TOKEN_KEY]) return; // never clobber a real answer
    const res = await fetch(chrome.runtime.getURL(LOCAL_TOKEN_FILE));
    if (!res.ok) return;
    const body = await res.json();
    const token = body && typeof body[TOKEN_KEY] === 'string' && body[TOKEN_KEY].trim();
    if (!token) return;
    await chrome.storage.local.set({ [TOKEN_KEY]: token });
    // Deliberately no token value in the log line — see the rule above.
    console.log('[CLO] seeded the Lichess token from ' + LOCAL_TOKEN_FILE);
  } catch (err) {
    // No file, bad JSON, nothing to do. This must never break the worker.
  }
}

chrome.runtime.onInstalled.addListener(seedTokenFromLocalFile);
chrome.runtime.onStartup.addListener(seedTokenFromLocalFile);
seedTokenFromLocalFile(); // and on every worker wake, which is what a reload is

// Overstudy tabs may only ever point at Chessable's learn route:
// /learn/<courseId>/<variationId>[/<listId>][/w|b] — ground-truthed against
// Chessable's own Overstudy buttons (they navigate to e.g.
// /learn/<bid>/<oid>/<lid>/b; the color suffix is optional).
const OVERSTUDY_URL_RE = /^https:\/\/www\.chessable\.com\/learn\/\d+\/\d+(?:\/\d+)?(?:\/[wb])?\/?$/;

// chrome.storage.session key: {tabId, frameId} of the tab the engine serves.
const ENGINE_TARGET_KEY = 'cloEngineTarget';

// Quick-edit comment (content section 12): the worker opens Chessable's own
// edit page in the driver popup window and the driver there submits the
// change. Only the numeric variation id is ever interpolated into the URL.
const QUICK_EDIT_BASE = 'https://www.chessable.com/explore/edit/';
const QUICK_EDIT_JOB_KEY = 'cloQuickEditJob'; // chrome.storage.session; one job at a time
// Everything the driver knows how to do. Anything else falls back to 'save'
// (append a comment), which is what the very first version of this feature did.
const QUICK_EDIT_MODES = ['probe', 'load', 'save', 'edit', 'alt', 'shapes', 'key'];
// Hard cap; force-fail + close the driver window. Deliberately longer than
// every wait the driver itself owns (boot gate + drive + post-submit watch),
// so a stall is reported by the driver with a real reason and this blind
// timeout only ever catches a driver that never ran at all.
const QUICK_EDIT_TIMEOUT_MS = 35000;
// …but an 'alt' job adds its alternatives ONE AT A TIME on the same board
// (arm → step back → play → dismiss, ~2 s each), so the cap grows with the
// list. Without this a five-move list could be force-failed mid-run and have
// its window closed while the driver was still working — the one thing this
// blind cap must never do.
const QUICK_EDIT_ALT_EXTRA_MS = 8000;
function quickEditJobCap(job) {
  const extra = job && Array.isArray(job.altSans) ? Math.max(0, job.altSans.length - 1) : 0;
  return QUICK_EDIT_TIMEOUT_MS + extra * QUICK_EDIT_ALT_EXTRA_MS;
}
// How long chrome.windows.create is given to ANSWER before the driver gives up
// on it and opens a tab instead (see openDriverWindow). Opening a window is a
// local operation with no network in it — this is a stuck-API cap, not a
// patience allowance, so it is short.
const DRIVER_WINDOW_TIMEOUT_MS = 5000;
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
  // Dev lever (see README, "Reloading the extension"): reload the whole
  // extension from disk. chrome.runtime.reload() is not exposed to content
  // scripts, so the relay has to land here.
  if (msg && msg.type === 'clo-dev-reload') {
    console.log('[CLO] dev reload requested — reloading extension');
    chrome.runtime.reload();
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
      const isDriver = Boolean(job && sender.tab && sender.tab.id === job.driverTabId
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
    chrome.runtime.sendMessage({
      target: 'offscreen', type: 'clo-engine-analyze', fen: msg.fen, profile: msg.profile,
      reqId: msg.reqId, depth: msg.depth,
    }).catch((err) => recordEngineError('analyze forward', err));
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

/**
 * The stored job, or null. Two things happen here that cannot happen anywhere
 * else, because the job outlives this worker but `quickEditTimer` does not:
 *
 *  - A job older than twice the cap is REAPED. Without this, a worker that
 *    idle-restarted mid-job left the record in storage.session with no timer
 *    to end it, and every later quick-edit was refused with "another
 *    quick-edit is in progress" for the rest of the browser session.
 *  - The timeout is RE-ARMED whenever we hold a job and have no timer, so a
 *    job that survives a restart still finishes (and still closes its window).
 */
async function getQuickEditJob() {
  let job = null;
  try {
    const stored = await chrome.storage.session.get(QUICK_EDIT_JOB_KEY);
    job = stored[QUICK_EDIT_JOB_KEY] || null;
  } catch (err) { return null; }
  if (!job) return null;
  const age = job.t0 ? Date.now() - job.t0 : 0;
  const cap = quickEditJobCap(job);
  if (age > cap * 2) {
    console.warn('[CLO] discarding a stale quick-edit job for variation', job.oid);
    if (job.driverTabId != null) chrome.tabs.remove(job.driverTabId).catch(() => {});
    await clearQuickEditJob();
    return null;
  }
  if (!quickEditTimer) {
    quickEditTimer = setTimeout(() => failQuickEditJob('timeout'), Math.max(1000, cap - age));
  }
  return job;
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
    // The ply the job was about, so the requester can tell a result for the
    // move its popup is open on from one for a move it has since left (the
    // comment editor's read, and its per-ply cache, are keyed on this).
    plyIndex: job.plyIndex,
    ok: Boolean(result.ok), canEdit: result.canEdit, text: result.text,
    shapes: result.shapes,
    error: result.error,
    timing: quickEditTiming(job),
  }, { frameId: job.requesterFrameId }).catch(() => {});
}

/**
 * Opens the quick-edit driver in a small FOCUSED popup window — the preferred
 * surface everywhere the browser has windows, and NEVER a background tab.
 * Chrome clamps every timer on a hidden page to ~1 s, and that
 * includes Chessable's own boot, animations and dialogs, which stretched a
 * save from ~4-5 s to ~13-20 s. Focused is equally load-bearing: an unfocused
 * window opens BEHIND a maximized browser, where the occlusion tracker
 * throttles it exactly like a hidden tab (verified — focused:false saved
 * nothing). The content script covers the window with a "Saving…" shield that
 * also swallows stray keystrokes, and closing the job's tab (finalize) closes
 * the window, returning focus.
 *
 * Placement: `req` is the requester's screen bounds putting the window right
 * BESIDE its quick-edit popup (sanity-checked here, sizes clamped; Chrome
 * additionally enforces its own popup minimums). Without it, the window is
 * parked bottom-right of the user's current window.
 *
 * See openDriverSurface for what happens where there are no windows at all.
 */
async function openDriverWindow(url, req) {
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
  const create = chrome.windows.create({
    url, focused: true, type: 'popup', width, height, left, top,
  });
  // A create that never ANSWERS is the one failure this await cannot survive:
  // startQuickEditJob arms the job timeout only after it returns, so a stub
  // that accepts the call and drops it hangs the job before anything exists to
  // time it out — no window, no job record, no error, and a popup stuck on
  // "Saving…" or "Checking edit rights…" for the rest of the session. Lemur
  // throws instead (ground-truthed 2026-08-10), which try/catch already
  // handles, but the honest failure and the silent one cost the same to cover.
  let timer = 0;
  const win = await Promise.race([
    create,
    new Promise((resolve) => { timer = setTimeout(() => resolve(null), DRIVER_WINDOW_TIMEOUT_MS); }),
  ]);
  clearTimeout(timer);
  if (!win) {
    // …and if it turns up late, close it: the fallback surface is by then
    // already open, and an orphan popup window over the user's page is worse
    // than the failure it came from.
    create.then((late) => {
      if (late && late.id != null && chrome.windows.remove) {
        chrome.windows.remove(late.id).catch(() => {});
      }
    }).catch(() => {});
    throw new Error('windows.create did not answer');
  }
  const tab = win && win.tabs && win.tabs[0];
  if (!tab) throw new Error('driver window has no tab');
  return tab;
}

/**
 * The fallback driver surface: a FOREGROUND tab, used only where the browser
 * has no windows to give. Android Chromium forks are the case — there is no
 * window concept on the platform, so the API is stubbed or absent (Lemur
 * Browser throws outright; ground-truthed 2026-08-10 on a build where the
 * Lichess panel and the overstudy tab both work, i.e. the worker, both
 * message directions and chrome.tabs are all fine and chrome.windows alone is
 * not).
 *
 * `active: true`, and that is the whole point — NOT the openOverstudyTab
 * treatment. Everything the doc comment above says about hidden pages being
 * clamped to ~1 s applies to a background tab exactly as it does to an
 * occluded window, and the driver's clocks are what a save is made of. A
 * FOREGROUND tab is not hidden, so it runs at full speed; it takes the screen
 * while it works, which on a phone or tablet is what a popup window would have
 * done anyway. finalizeQuickEditJob closes it (chrome.tabs.remove) and the
 * browser returns to the tab underneath.
 *
 * The cost, which cannot be avoided on a single-window browser: the REQUESTER
 * tab is backgrounded for the duration, and Android evicts background
 * renderers aggressively. If Chessable's tab is killed mid-job the result
 * lands nowhere and the popup that was waiting for it is gone with the page.
 */
async function openDriverTab(url) {
  const tab = await chrome.tabs.create({ url, active: true });
  if (!tab || tab.id == null) throw new Error('driver tab has no id');
  return tab;
}

/** Whether this browser can open a window at all (see openDriverTab). */
function canOpenDriverWindow() {
  return Boolean(chrome.windows && typeof chrome.windows.create === 'function');
}

/**
 * Window first, tab last. The middle step is the original retry: the only
 * input the requester controls is the placement, and bad screen bounds (a
 * monitor that went away between the two calls, say) are the one thing that
 * can make windows.create refuse on a browser that has windows.
 */
async function openDriverSurface(url, req) {
  if (canOpenDriverWindow()) {
    try {
      return await openDriverWindow(url, req);
    } catch (err) {
      try {
        return await openDriverWindow(url, null);
      } catch (err2) {
        console.warn('[CLO] quick-edit: could not open a driver window (' +
          ((err2 && err2.message) || err2) + ') — falling back to a foreground tab');
      }
    }
  } else {
    console.warn('[CLO] quick-edit: this browser has no chrome.windows.create — ' +
      'using a foreground tab for the driver');
  }
  return openDriverTab(url);
}

async function startQuickEditJob(msg, sender) {
  const oid = String(msg.oid || '');
  if (!/^\d+$/.test(oid)) return;
  if (!sender.tab || typeof sender.tab.id !== 'number') return;

  // One job at a time: reject a second concurrent request outright.
  if (await getQuickEditJob()) {
    chrome.tabs.sendMessage(sender.tab.id, {
      type: 'clo-quick-edit-result', oid, bid: msg.bid, mode: msg.mode,
      // Echoed so the requester can match this against the move its popup is
      // open on — a read keyed on an undefined plyIndex matches nothing, and
      // the popup then waits on a refusal it has already been told about.
      plyIndex: msg.plyIndex,
      ok: false, error: 'another quick-edit is in progress',
    }, { frameId: sender.frameId || 0 }).catch(() => {});
    return;
  }

  const url = QUICK_EDIT_BASE + oid + '/';
  let tab;
  try {
    tab = await openDriverSurface(url, msg.win);
  } catch (err) {
    chrome.tabs.sendMessage(sender.tab.id, {
      type: 'clo-quick-edit-result', oid, bid: msg.bid, mode: msg.mode,
      // plyIndex, for the reason spelled out on the refusal above: the 'load'
      // handler keys its state machine on "<oid>#<plyIndex>" and DROPS a result
      // that does not match, so an error sent without it is an error the popup
      // never hears — the Edit and Arrows tabs then sit on "Reading the current
      // comment from Chessable…" for ever, over a failure they were told about.
      // (Ground-truthed 2026-08-10: Append reported this failure correctly while
      // Edit hung on the same one, which is what led to this branch.)
      plyIndex: msg.plyIndex,
      ok: false, error: 'could not open the Chessable edit window',
    }, { frameId: sender.frameId || 0 }).catch(() => {});
    return;
  }

  const job = {
    oid, bid: msg.bid || '',
    mode: QUICK_EDIT_MODES.includes(msg.mode) ? msg.mode : 'save',
    san: msg.san, color: msg.color, plyIndex: msg.plyIndex,
    // Mode 'key' only: which ply the key mark is expected to be on right now.
    // The driver refuses when it is anywhere else - that write moves a range in
    // either direction, so a mark somewhere unexpected cannot be shrugged off.
    fromPlyIndex: msg.fromPlyIndex,
    commentText: msg.commentText, baseText: msg.baseText, altSans: msg.altSans,
    shapes: msg.shapes, baseShapes: msg.baseShapes,
    forThisVariationOnly: Boolean(msg.forThisVariationOnly),
    requesterTabId: sender.tab.id, requesterFrameId: sender.frameId || 0,
    driverTabId: tab.id, phase: 'loading',
    t0: Date.now(), // phase timestamps for the timing line in the result
  };
  await setQuickEditJob(job);
  clearTimeout(quickEditTimer);
  quickEditTimer = setTimeout(() => failQuickEditJob('timeout'), quickEditJobCap(job));
}

/**
 * The driver popup window's edit iframe asks whether it has a job.
 *
 * A job already in the 'submitted' phase is NEVER handed out again: a POST
 * that fails server-side reloads the edit page at its path form, whose driver
 * would otherwise claim the same job and append the same comment a SECOND
 * time. Let it time out instead — a duplicated comment in the user's course is
 * far worse than a retryable failure.
 */
async function claimQuickEditJob(msg, sender) {
  const job = await getQuickEditJob();
  if (!job || String(job.oid) !== String(msg.oid)) return { claimed: false };
  if (job.phase === 'submitted') return { claimed: false };
  if (!sender.tab || typeof sender.tab.id !== 'number') return { claimed: false };
  // Bind the driver tab id on first claim (windows.create resolves before the
  // page's content script runs, so this is normally already set).
  if (job.driverTabId == null) job.driverTabId = sender.tab.id;
  if (job.driverTabId !== sender.tab.id) return { claimed: false };
  job.tClaim = Date.now();
  await setQuickEditJob(job);
  return {
    claimed: true, mode: job.mode,
    san: job.san, color: job.color, plyIndex: job.plyIndex,
    fromPlyIndex: job.fromPlyIndex,
    commentText: job.commentText, baseText: job.baseText, altSans: job.altSans,
    shapes: job.shapes, baseShapes: job.baseShapes,
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

/** Post-submit landing (/mt1/explore/?edit=<oid>) from the driver window = success. */
async function handleQuickEditLanding(msg, sender) {
  const job = await getQuickEditJob();
  if (!job || job.phase !== 'submitted' || String(job.oid) !== String(msg.oid)) return { isOurs: false };
  if (!sender.tab || sender.tab.id !== job.driverTabId) return { isOurs: false };
  await finalizeQuickEditJob(job, { ok: true, mode: job.mode });
  return { isOurs: true };
}

/** From the driver (probe/load result, or a save error). */
async function finishQuickEditJob(msg) {
  const job = await getQuickEditJob();
  if (!job || String(job.oid) !== String(msg.oid)) return;
  await finalizeQuickEditJob(job, {
    ok: msg.ok, mode: msg.mode, canEdit: msg.canEdit,
    text: msg.text, shapes: msg.shapes, error: msg.error,
  });
}

async function failQuickEditJob(reason) {
  const job = await getQuickEditJob();
  if (!job) return;
  await finalizeQuickEditJob(job, { ok: false, error: reason });
}

/** Relay the outcome to the review tab, close the driver window, clear the job. */
async function finalizeQuickEditJob(job, result) {
  clearTimeout(quickEditTimer);
  quickEditTimer = null;
  relayQuickEditResult(job, result);
  if (job.driverTabId != null) chrome.tabs.remove(job.driverTabId).catch(() => {});
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
