/**
 * LiChessable — options page logic.
 * MV3 forbids inline scripts, so everything is wired up here.
 */
'use strict';

const TOKEN_KEY = 'lichessToken'; // must match background.js and content/lichessable.js
const BUILD_KEY = 'cloEngineBuild'; // must match CONFIG.engine.buildKey in content/lichessable.js
const SOURCE_KEY = 'cloEngineSource'; // must match CONFIG.chessdb.sourceKey in content/lichessable.js
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
// must match CONFIG.retry.pinPromptKey in content/lichessable.js. Opt-OUT (absent
// = ON, the cloLineHeadsUp shape): the offer costs one glance at the corner of
// the screen and nothing else, and the whole point of it is that the moment the
// user has an opinion about a move is the moment they get it wrong.
const PIN_PROMPT_KEY = 'cloPinPrompt';
// Section 16e (DESIGN-chessable-sync.md). All four must match CONFIG.pinSync in
// content/lichessable.js. THIS PAGE CANNOT TALK TO CHESSABLE — it is a different
// origin, so it holds no JWT — which is the whole reason these exist: the
// content script publishes the writable courses and the last result, and reads
// back the choice and the "sync now" ping. The pins themselves it CAN read,
// since storage.sync belongs to the extension.
const PIN_SYNC_KEY     = 'cloPinSync';
const PIN_SYNC_STATUS  = 'cloPinSyncStatus';
const PIN_SYNC_COURSES = 'cloPinSyncCourses';
const PIN_SYNC_NOW     = 'cloPinSyncNow';
// must match CONFIG.retry.pinItemPrefix / pinSteps.
const PIN_ITEM_PREFIX  = 'cloPin:';
const PIN_STEPS = [30 * 60 * 1000, 4 * 3600 * 1000, 24 * 3600 * 1000];
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

/**
 * <clo-pick> — a <select> that works where a native one does not.
 *
 * ANDROID CANNOT OPEN THE DROPDOWNS ON THIS PAGE. The native select popup
 * never appears, so every setting here was stuck on whatever the last desktop
 * visit left it at — "Auto" included, and Auto is precisely the value a phone
 * has to change: engine-build detection reads a phone in Chrome's "Desktop
 * site" mode as a desktop and asks for the full Stockfish build, which is not
 * in a mobile package at all (README, "Packing a trimmed build"). A settings
 * page whose settings cannot be reached is worse than no settings page, so the
 * control must not depend on a popup existing.
 *
 * A radio group is ordinary DOM: no popup, no platform behaviour to fail. This
 * wraps one in the <select> API its consumers already use — `.value` reads and
 * writes, and a 'change' event fired on the element itself — so every listener
 * and every `.value` in this file is unchanged. The one exception is
 * renderSync(), whose list is built at runtime and calls setOptions() instead
 * of appending <option> nodes; emulating HTMLSelectElement's options/remove as
 * well would be pretending to be a select rather than replacing one.
 *
 * Declarative options are still <option> children in the markup, read once at
 * upgrade and replaced by the rows. Defined BEFORE the listeners below, since
 * those run at parse time and would otherwise bind to an un-upgraded element.
 */
class CloPick extends HTMLElement {
  connectedCallback() {
    if (this._built) return;
    this._built = true;
    const opts = [];
    for (const el of Array.from(this.children)) {
      if (el.tagName === 'OPTION') {
        opts.push({ value: el.getAttribute('value') || '', label: el.textContent });
      }
    }
    this.setOptions(opts);
  }

  /** @param {{value: string, label: string}[]} opts */
  setOptions(opts) {
    this.textContent = '';
    this._inputs = [];
    // Radios are grouped by NAME, so it has to be unique per control on the page.
    const group = 'pick-' + (this.id || String(this._inputs.length));
    for (const o of opts) {
      const row = document.createElement('label');
      row.className = 'opt';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = group;
      input.value = o.value;
      const span = document.createElement('span');
      span.textContent = o.label;
      row.appendChild(input);
      row.appendChild(span);
      this.appendChild(row);
      this._inputs.push(input);
      input.addEventListener('change', () => {
        if (!input.checked) return;
        this._paint();
        this.dispatchEvent(new Event('change'));
      });
    }
    // A rebuild must not silently drop the selection: renderSync sets the value
    // after its own setOptions, but the second pass there re-sets a list that
    // already had one chosen.
    if (this._want !== undefined) this.value = this._want;
    else this._paint();
  }

  /** '' when nothing matched — which is what the callers test for. */
  get value() {
    for (const input of this._inputs || []) if (input.checked) return input.value;
    return '';
  }

  set value(v) {
    const want = String(v === null || v === undefined ? '' : v);
    this._want = want;
    for (const input of this._inputs || []) input.checked = input.value === want;
    this._paint();
  }

  /** A class rather than :has(), which an older Chromium fork may not have. */
  _paint() {
    for (const input of this._inputs || []) {
      input.parentNode.className = input.checked ? 'opt on' : 'opt';
    }
  }
}
customElements.define('clo-pick', CloPick);

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
     PIN_PROMPT_KEY, SHOW_GRADE_KEY, TOUCH_KEY, TOUCH_DEVICE_KEY,
     DIFFICULT_THRESHOLD_KEY, DIFFICULT_RECENT_KEY, SOURCE_KEY]);
  if (stored[TOKEN_KEY]) $('token').value = stored[TOKEN_KEY];
  const build = stored[BUILD_KEY];
  $('engineBuild').value = build === 'full' || build === 'lite' ? build : 'auto';
  const source = stored[SOURCE_KEY];
  $('engineSource').value = source === 'chessdb' || source === 'local' ? source : 'auto';
  $('headsUp').checked = stored[HEADS_UP_KEY] !== false;
  $('autoReview').checked = stored[AUTO_REVIEW_KEY] === true;
  $('textMove').checked = stored[TEXT_MOVE_KEY] === true;
  $('pinPrompt').checked = stored[PIN_PROMPT_KEY] !== false;
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

$('pinPrompt').addEventListener('change', async () => {
  // Saved immediately; the content script's storage listener picks it up in
  // every open trainer tab, no reload needed.
  await chrome.storage.local.set({ [PIN_PROMPT_KEY]: $('pinPrompt').checked });
  setStatus($('pinPrompt').checked
    ? 'You will be offered the pin right after a mistake.'
    : 'Pin offer off — pin from the Mistakes list instead.');
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

$('engineSource').addEventListener('change', async () => {
  // The content script's storage listener drops whatever the other source
  // had on screen and re-asks; no reload needed.
  await chrome.storage.local.set({ [SOURCE_KEY]: $('engineSource').value });
  setStatus('Analysis source saved.');
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


// --- section 16e: the sync picker, and the pin list -------------------------

function dueAt(rec) {
  const streak = Math.min(Math.max(rec.streak || 0, 0), PIN_STEPS.length - 1);
  return (rec.lastSeenAt || rec.pinnedAt || 0) + PIN_STEPS[streak];
}

function dueLabel(rec) {
  const left = dueAt(rec) - Date.now();
  if (left <= 0) return 'due now';
  const mins = Math.round(left / 60000);
  if (mins < 60) return 'in ' + Math.max(1, mins) + ' min';
  const hours = Math.round(left / 3600000);
  if (hours < 48) return 'in ' + hours + ' h';
  return 'in ' + Math.round(hours / 24) + ' days';
}

/** The pins this device holds, soonest first. Read straight out of
 *  storage.sync — no Chessable call, so this works on any device and with the
 *  transport switched off. */
async function renderPins() {
  const table = $('pinList'), note = $('pinListNote');
  let recs = [];
  try {
    const all = await chrome.storage.sync.get(null);
    recs = Object.entries(all)
      .filter(([k, v]) => k.startsWith(PIN_ITEM_PREFIX) && v && v.san)
      .map(([, v]) => v)
      .sort((a, b) => dueAt(a) - dueAt(b));
  } catch (err) {
    note.textContent = 'Could not read the pins: ' + err;
    table.hidden = true;
    return;
  }
  const body = table.querySelector('tbody');
  body.textContent = '';
  for (const rec of recs) {
    const tr = document.createElement('tr');
    const due = Date.now() >= dueAt(rec);
    if (due) tr.className = 'due';
    const cells = [
      ['move', (rec.num ? rec.num + (rec.color === 'b' ? '...' : '.') : '') + rec.san],
      ['line', [rec.chapter, rec.title].filter(Boolean).join(' — ')],
      ['streak', (rec.streak || 0) + '/' + PIN_STEPS.length],
      ['due', dueLabel(rec)],
    ];
    for (const [cls, text] of cells) {
      const td = document.createElement('td');
      td.className = cls;
      td.textContent = text;
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }
  table.hidden = !recs.length;
  const dueCount = recs.filter((r) => Date.now() >= dueAt(r)).length;
  note.textContent = recs.length
    ? recs.length + ' pinned move(s), ' + dueCount + ' due now.'
    : 'No pinned mistakes on this device yet.';
}

async function renderSync() {
  const sel = $('syncCourse');
  const stored = await chrome.storage.local.get([PIN_SYNC_KEY, PIN_SYNC_STATUS, PIN_SYNC_COURSES]);
  const pref = stored[PIN_SYNC_KEY] || {};
  const courses = stored[PIN_SYNC_COURSES] || [];
  const status = stored[PIN_SYNC_STATUS];
  const opts = [{ value: '', label: 'Off — pins stay on this device' }];
  for (const c of courses) opts.push({ value: String(c.bid), label: c.name });
  sel.setOptions(opts);
  sel.value = (pref.on && pref.bid) ? String(pref.bid) : '';
  // A course the picker has never heard of (the list is published by whichever
  // device last visited Chessable) must not read as "off".
  if (pref.on && pref.bid && sel.value !== String(pref.bid)) {
    opts.push({ value: String(pref.bid), label: 'Course ' + pref.bid });
    sel.setOptions(opts);
    sel.value = String(pref.bid);
  }
  $('syncCoursesNote').textContent = courses.length
    ? 'Courses you can write to, as of the last Chessable page you opened.'
    : 'Open any Chessable page once and come back — this page cannot ask ' +
      'Chessable for your courses itself.';
  $('syncStatus').textContent = status
    ? (status.text + ' (' + new Date(status.at).toLocaleString() + ')')
    : 'Not synced on this device yet.';
  $('syncStatus').className = 'fineprint' + (status && !status.ok ? ' error' : '');
}

$('syncCourse').addEventListener('change', async () => {
  const bid = $('syncCourse').value;
  await chrome.storage.local.set({ [PIN_SYNC_KEY]: { on: Boolean(bid), bid, lid: 0 } });
  setStatus(bid
    ? 'Sync course set. Open a Chessable page to finish setting it up.'
    : 'Pin sync switched off — pins stay on this device.');
  renderSync();
});

$('syncNow').addEventListener('click', async () => {
  // The content script is the only thing that can reach Chessable, so this is
  // a ping it watches for rather than a call. The value has to CHANGE for
  // storage.onChanged to fire on the other side.
  await chrome.storage.local.set({ [PIN_SYNC_NOW]: Date.now() });
  setStatus('Asked the open Chessable tab to sync. Open one if there is none.');
});

// Both halves update themselves: the content script writes the status and the
// course list from another document, and pins arrive from another DEVICE.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes[PIN_SYNC_STATUS] || changes[PIN_SYNC_COURSES] ||
      changes[PIN_SYNC_KEY])) renderSync();
  if (area === 'sync' && Object.keys(changes).some((k) => k.startsWith(PIN_ITEM_PREFIX)))
    renderPins();
});

init();
renderSync();
renderPins();
