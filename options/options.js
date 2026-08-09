/**
 * LiChessable — options page logic.
 * MV3 forbids inline scripts, so everything is wired up here.
 */
'use strict';

const TOKEN_KEY = 'lichessToken'; // must match background.js and content/lichessable.js
const BUILD_KEY = 'cloEngineBuild'; // must match CONFIG.engine.buildKey in content/lichessable.js
// must match CONFIG.continuation.headsUpKey in content/lichessable.js. Opt-OUT:
// absent means ON, so only an explicit false is ever stored as "off".
const HEADS_UP_KEY = 'cloLineHeadsUp';
// must match CONFIG.continuation.autoKey in content/lichessable.js. Opt-IN,
// the other way round: only an explicit true starts a review by itself.
const AUTO_REVIEW_KEY = 'cloAutoReviewClickables';
// must match CONFIG.textMove.key in content/lichessable.js. Opt-IN: the field
// takes the keyboard from MoveTrainer's own single-key shortcuts while it is
// focused, which is not something to hand anyone who did not ask for it.
const TEXT_MOVE_KEY = 'cloTextMove';
// must match CONFIG.showGrade.key in content/lichessable.js. Opt-OUT since
// v0.81.0 (absent = ON, so only an explicit false is ever stored as "off"). It
// used to be opt-IN because the mode takes two keys off MoveTrainer2 for a whole
// session and answers real SRS cards — but none of that happens until the row's
// "Show & grade" button is pressed, so this preference only decides whether that
// button is offered at all.
const SHOW_GRADE_KEY = 'cloShowGrade';
// must match CONFIG.touch.modeKey / CONFIG.touch.deviceKey in
// content/lichessable.js. The MODE is the user's override ('auto' unless they
// say otherwise); the DEVICE flag is the content script's own latch — it writes
// it the first time this browser proves it is running on a touch device and
// never clears it, so this page only ever reads it back.
const TOUCH_KEY = 'cloTouchUi';
const TOUCH_DEVICE_KEY = 'cloTouchDevice';
// must match CONFIG.autoPlay.difficult.thresholdKey / .recentKey in
// content/lichessable.js. The MODE's own on/off switch is deliberately not
// here — it lives in the in-session auto-play menu, because it is the sort of
// thing you turn on partway through a session. These two are the numbers
// behind it, which are set once and then left alone.
const DIFFICULT_THRESHOLD_KEY = 'cloDifficultThreshold';
const DIFFICULT_RECENT_KEY = 'cloDifficultRecentDays';
const DIFFICULT_DEFAULT_THRESHOLD = 90;
const DIFFICULT_DEFAULT_RECENT_DAYS = 7;
const $ = (id) => document.getElementById(id);

// NOTE: there is deliberately no reload hook on this page. An options page
// opened programmatically lands in a background tab, and Chrome defers loading
// those indefinitely (measured: still unloaded after 4 minutes), so the hook
// would never run. The working lever is the `clo-dev-reload` DOM event on any
// Chessable page — see README, "Reloading the extension".

function setStatus(text, isError) {
  const el = $('status');
  el.textContent = text;
  el.className = isError ? 'error' : 'ok';
}

async function init() {
  $('loadedVersion').textContent = chrome.runtime.getManifest().version;
  const stored = await chrome.storage.local.get(
    [TOKEN_KEY, BUILD_KEY, HEADS_UP_KEY, AUTO_REVIEW_KEY, TEXT_MOVE_KEY,
     SHOW_GRADE_KEY, TOUCH_KEY, TOUCH_DEVICE_KEY,
     DIFFICULT_THRESHOLD_KEY, DIFFICULT_RECENT_KEY]);
  if (stored[TOKEN_KEY]) $('token').value = stored[TOKEN_KEY];
  const build = stored[BUILD_KEY];
  $('engineBuild').value = build === 'full' || build === 'lite' ? build : 'auto';
  $('headsUp').checked = stored[HEADS_UP_KEY] !== false;
  $('autoReview').checked = stored[AUTO_REVIEW_KEY] === true;
  $('textMove').checked = stored[TEXT_MOVE_KEY] === true;
  $('showGrade').checked = stored[SHOW_GRADE_KEY] !== false;
  const touch = stored[TOUCH_KEY];
  $('touchUi').value = touch === 'touch' || touch === 'desktop' ? touch : 'auto';
  // Worth stating: it is the answer to "why is this still/not large?", and the
  // only way to see the latch at all.
  $('touchUiState').textContent = stored[TOUCH_DEVICE_KEY] === true
    ? 'This browser is remembered as running on a touch device.'
    : 'This browser has not been detected as a touch device yet.';
  $('difficultThreshold').value =
    numberPref(stored[DIFFICULT_THRESHOLD_KEY], DIFFICULT_DEFAULT_THRESHOLD, 0, 100);
  $('difficultRecentDays').value =
    numberPref(stored[DIFFICULT_RECENT_KEY], DIFFICULT_DEFAULT_RECENT_DAYS, 0, 3650);
}

/**
 * Same rule as the content script's own reader: anything unusable degrades to
 * the default rather than writing NaN into a setting the replay decides on.
 */
function numberPref(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return fallback;
  return n;
}

$('autoReview').addEventListener('change', async () => {
  // Saved immediately; the content script's storage listener picks it up in
  // every open trainer tab, no reload needed.
  await chrome.storage.local.set({ [AUTO_REVIEW_KEY]: $('autoReview').checked });
  setStatus($('autoReview').checked
    ? 'Clickable lines will be reviewed automatically.'
    : 'Automatic clickable-line review off.');
});

$('headsUp').addEventListener('change', async () => {
  // Saved immediately; the content script's storage listener picks it up in
  // every open trainer tab, no reload needed.
  await chrome.storage.local.set({ [HEADS_UP_KEY]: $('headsUp').checked });
  setStatus($('headsUp').checked
    ? 'Clickable-line heads-up on.'
    : 'Clickable-line heads-up off.');
});

$('textMove').addEventListener('change', async () => {
  // Saved immediately; the content script's storage listener puts the field on
  // (or takes it off) every open trainer tab, no reload needed.
  await chrome.storage.local.set({ [TEXT_MOVE_KEY]: $('textMove').checked });
  setStatus($('textMove').checked
    ? 'Type-a-move on — the field appears while a quiz is waiting for you.'
    : 'Type-a-move off.');
});

$('showGrade').addEventListener('change', async () => {
  // Saved immediately; the content script's storage listener puts the button on
  // (or takes it off, stopping a running mode) in every open trainer tab.
  await chrome.storage.local.set({ [SHOW_GRADE_KEY]: $('showGrade').checked });
  setStatus($('showGrade').checked
    ? 'Show and grade on — the button appears in Review sessions.'
    : 'Show and grade off.');
});

// Both saved on `change` (i.e. on commit, not per keystroke) and clamped back
// into the field, so an out-of-range entry is visibly corrected rather than
// silently ignored. The content script's storage listener re-decides every
// move from the new number in any open trainer tab.
$('difficultThreshold').addEventListener('change', async () => {
  const v = numberPref($('difficultThreshold').value, DIFFICULT_DEFAULT_THRESHOLD, 0, 100);
  $('difficultThreshold').value = v;
  await chrome.storage.local.set({ [DIFFICULT_THRESHOLD_KEY]: v });
  setStatus('Difficult-moves threshold saved: ' + v + '%.');
});

$('difficultRecentDays').addEventListener('change', async () => {
  const v = numberPref($('difficultRecentDays').value, DIFFICULT_DEFAULT_RECENT_DAYS, 0, 3650);
  $('difficultRecentDays').value = v;
  await chrome.storage.local.set({ [DIFFICULT_RECENT_KEY]: v });
  setStatus(v > 0
    ? 'Difficult-moves window saved: ' + v + ' day(s).'
    : 'Difficult-moves window off — accuracy alone decides.');
});

$('touchUi').addEventListener('change', async () => {
  // Saved immediately; the content script's storage listener resizes every open
  // Chessable document (top and mt1 iframe alike), no reload needed.
  await chrome.storage.local.set({ [TOUCH_KEY]: $('touchUi').value });
  setStatus($('touchUi').value === 'auto'
    ? 'Interface size back to automatic.'
    : 'Interface size forced to ' + $('touchUi').value + '.');
});

$('engineBuild').addEventListener('change', async () => {
  // Saved immediately; the content script's storage listener restarts any
  // running search on the newly selected build.
  await chrome.storage.local.set({ [BUILD_KEY]: $('engineBuild').value });
  setStatus('Engine build saved.');
});

$('show').addEventListener('change', () => {
  $('token').type = $('show').checked ? 'text' : 'password';
});

$('save').addEventListener('click', async () => {
  const token = $('token').value.trim();
  await chrome.storage.local.set({ [TOKEN_KEY]: token });
  // The content script listens for this storage change and retries the
  // current position automatically — no page reload needed.
  setStatus(token ? 'Saved.' : 'Token cleared.');
});

$('test').addEventListener('click', async () => {
  const token = $('token').value.trim(); // tests what's typed, saved or not
  if (!token) { setStatus('Enter a token first.', true); return; }
  setStatus('Testing…');
  try {
    // Minimal request for the starting position. Extension pages can use the
    // host_permission, so this fetch is CORS-exempt just like the worker's.
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const url = 'https://explorer.lichess.org/lichess?variant=standard'
      + '&fen=' + encodeURIComponent(fen)
      + '&moves=1&topGames=0&recentGames=0';
    const response = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (response.ok) {
      setStatus('Token works ✓');
    } else if (response.status === 401) {
      setStatus('Rejected (401) — token invalid or revoked.', true);
    } else if (response.status === 429) {
      setStatus('Rate limited (429) — token is probably fine, try again in a minute.', true);
    } else {
      setStatus('Unexpected response: HTTP ' + response.status, true);
    }
  } catch (err) {
    setStatus('Network error: ' + err, true);
  }
});

init();
