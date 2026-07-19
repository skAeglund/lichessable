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
 */
'use strict';

const ALLOWED_URL_PREFIX = 'https://explorer.lichess.org/';
const TOKEN_KEY = 'lichessToken'; // must match content/lichessable.js and options/options.js

// Overstudy tabs may only ever point at Chessable's learn route:
// /learn/<courseId>/<variationId>[/<chapterId>][/w|b]
const OVERSTUDY_URL_RE = /^https:\/\/www\.chessable\.com\/learn\/\d+\/\d+(?:\/\d+)?(?:\/[wb])?\/?$/;

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
  return false;
});

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
