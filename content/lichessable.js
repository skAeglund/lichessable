/**
 * LiChessable — content script
 *
 * Runs inside Chessable's mt1 iframes on Explore pages
 * (https://www.chessable.com/mt1/explore/<n>/) and the Analysis board
 * (https://www.chessable.com/mt1/analysis/) and injects a "Lichess Database"
 * panel: on wide windows it sits to the right of Chessable's content column;
 * on narrow ones, beneath their move table. Both pages use the exact same
 * widgets (#inputFEN, .nextMovesContainer, …); the difference is that on
 * Analysis the moves container is only visible while Chessable's "Toggle
 * Opening Explorer" button is active — and that button is sometimes disabled
 * outright (e.g. entering the page with a ?fen= parameter) — so there the
 * panel mounts as a sibling AFTER the container instead of inside it, and is
 * always visible.
 *
 * The manifest injects this into EVERY chessable.com frame ("all_frames": true);
 * the script bails out immediately in any frame that isn't one of those apps.
 *
 * All console output is prefixed [CLO]. Note: the logs appear in the IFRAME's
 * console context — in DevTools, pick the mt1 frame from the context dropdown,
 * or just filter the console for "[CLO]".
 */
(() => {
  'use strict';

  // ==========================================================================
  // 1) Configuration — every Chessable selector lives here. If Chessable
  //    changes their markup, this object should be the only thing to edit.
  // ==========================================================================
  const SELECTORS = {
    fenInput:       '#inputFEN',            // <input> holding the current FEN — the single source of truth
    movesTbody:     '#nextMovesBit',        // <tbody> of Chessable's own move table
    movesTableWrap: '.nextMovesTable',      // DIV directly wrapping that table
    movesContainer: '.nextMovesContainer',  // DIV we inject the panel into (right after movesTableWrap)
    board:          '.chessboard-63f37',    // chessboard.js container — not used, documented for completeness
  };

  const CONFIG = {
    // Only activate in these mt1 iframe documents.
    framePathPrefixes: ['/mt1/explore/', '/mt1/analysis/'],
    debounceMs:      300,             // settle time after any detected change before refreshing
    fenPollMs:       500,             // safety-net poll: the FEN value can change with no event or mutation
    bootPollMs:      250,             // fallback poll while waiting for the async app to render
    bootTimeoutMs:   25000,           // give up waiting for the app after this long
    storageKey:      'lichessableHidden', // chrome.storage.local key for the show/hide preference
    logPrefix:       '[CLO]',

    // --- Lichess opening-explorer settings ---------------------------------
    lichess: {
      // Note .org — the old explorer.lichess.ovh host now returns 401.
      // Requests require a Bearer token and are performed by background.js.
      apiBase: 'https://explorer.lichess.org/lichess',
      tokenKey: 'lichessToken', // chrome.storage.local key; must match background.js / options.js
      variant: 'standard',
      // Defaults: 1600+ opposition, blitz and slower time controls.
      // Rating values are the lower bounds of Lichess's fixed buckets
      // (0, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500).
      speeds:  ['blitz', 'rapid', 'classical', 'correspondence'],
      ratings: [1600, 1800, 2000, 2200, 2500],
      movesLimit: 20,             // max candidate moves to request (side panel has room)
      cacheMax: 200,              // positions kept in the in-memory LRU cache
      rateLimitCooldownMs: 61000, // Lichess asks for a full minute after a 429
    },
  };

  const PANEL_ID = 'lichessable-panel';

  const log  = (...a) => console.log(CONFIG.logPrefix, ...a);
  const warn = (...a) => console.warn(CONFIG.logPrefix, ...a);

  // Wrong frame (e.g. the top /explore/<n>/ document, or any other iframe): do nothing.
  if (!CONFIG.framePathPrefixes.some((p) => location.pathname.startsWith(p))) return;

  // On Analysis the panel needs a CSS modifier (see lichessable.css) to share
  // the fixed-height Opening Explorer column with Chessable's own move table.
  const IS_ANALYSIS = location.pathname.startsWith('/mt1/analysis/');

  // Guard against accidental double-injection into the same document.
  if (window.__lichessableLoaded) { warn('already initialised in this frame — skipping'); return; }
  window.__lichessableLoaded = true;

  // ==========================================================================
  // 2) State
  // ==========================================================================
  const state = {
    fen: null,            // last FEN we fetched/rendered
    requestSeq: 0,        // increases per fetch; responses for stale positions are dropped
    hidden: false,        // panel body collapsed? (persisted in chrome.storage.local)
    debounceTimer: 0,
    fenPollTimer: 0,
    tbodyObserver: null,  // MutationObserver on Chessable's move-table tbody
    observedTbody: null,  // the exact node being observed (so we notice if the app replaces it)
    rateLimitedUntil: 0,  // timestamp: no requests fired until then after a 429
    rateLimitTimer: 0,    // timer that retries the current position once the cooldown ends
    panel: null,          // our injected root element
    ui: null,             // cached refs to elements inside the panel
  };

  // ==========================================================================
  // 3) Boot — wait for the asynchronously-rendered app, then wire up
  // ==========================================================================
  async function boot() {
    log('waiting for Chessable explore UI…');
    try {
      await waitForApp();
    } catch (err) {
      warn('gave up waiting for the explore UI:', err.message);
      return;
    }
    state.hidden = await loadHiddenPref();
    mountPanel();
    bindFenInput();
    observeMovesTable();
    startWatchdog();
    refresh();                                  // initial render for the current position
    window.addEventListener('pagehide', teardown);
    // When a token is saved (or changed) in the options page, retry the
    // current position immediately — no page reload needed.
    chrome.storage.onChanged.addListener(onStorageChanged);
    log('initialised on', location.pathname);
  }

  function onStorageChanged(changes, area) {
    if (area === 'local' && changes[CONFIG.lichess.tokenKey]) {
      log('Lichess token changed — retrying current position');
      state.fen = null; // forget the last position so the next tick refetches
      scheduleRefresh();
    }
  }

  function appReady() {
    return document.querySelector(SELECTORS.fenInput) &&
           document.querySelector(SELECTORS.movesTbody) &&
           document.querySelector(SELECTORS.movesContainer);
  }

  /**
   * Resolves once the FEN input, the move table and its container all exist.
   * Uses a MutationObserver for responsiveness PLUS a low-frequency poll as a
   * fallback (in case the app builds its DOM in a way the observer misses),
   * and a hard timeout so we never wait forever on a broken page.
   */
  function waitForApp() {
    return new Promise((resolve, reject) => {
      if (appReady()) return resolve();

      let observer = null, pollTimer = 0, timeoutTimer = 0;
      const finish = (ok, err) => {
        if (observer) observer.disconnect();
        clearInterval(pollTimer);
        clearTimeout(timeoutTimer);
        ok ? resolve() : reject(err);
      };

      observer = new MutationObserver(() => { if (appReady()) finish(true); });
      observer.observe(document.documentElement, { childList: true, subtree: true });

      pollTimer = setInterval(() => { if (appReady()) finish(true); }, CONFIG.bootPollMs);
      timeoutTimer = setTimeout(
        () => finish(false, new Error(`explore UI not found within ${CONFIG.bootTimeoutMs} ms`)),
        CONFIG.bootTimeoutMs
      );
    });
  }

  // ==========================================================================
  // 4) Position-change detection
  //
  // Three overlapping mechanisms, all funnelled through the same debounce:
  //   a) input/change events on #inputFEN (covers manual edits),
  //   b) mutations of Chessable's move-table tbody (the table re-renders on
  //      every move, which reliably coincides with a position change),
  //   c) a 500 ms poll of the input's value (covers programmatic value writes
  //      that fire no event and cause no attribute mutation).
  // The poll also doubles as a watchdog that heals us after SPA-style
  // re-renders (see healIfDetached).
  // ==========================================================================

  /** Always read the FEN fresh from the DOM — the input element itself may be replaced. */
  function readFen() {
    const input = document.querySelector(SELECTORS.fenInput);
    const value = input ? input.value.trim() : '';
    return value || null;
  }

  function bindFenInput() {
    const input = document.querySelector(SELECTORS.fenInput);
    if (!input || input.__cloBound) return; // expando lives in our isolated world only
    input.__cloBound = true;
    input.addEventListener('input', scheduleRefresh);
    input.addEventListener('change', scheduleRefresh);
  }

  function observeMovesTable() {
    const tbody = document.querySelector(SELECTORS.movesTbody);
    if (!tbody || tbody === state.observedTbody) return;
    if (state.tbodyObserver) state.tbodyObserver.disconnect();
    state.tbodyObserver = new MutationObserver(scheduleRefresh);
    state.tbodyObserver.observe(tbody, { childList: true, subtree: true });
    state.observedTbody = tbody;
  }

  function startWatchdog() {
    state.fenPollTimer = setInterval(() => {
      healIfDetached();
      const fen = readFen();
      if (fen && fen !== state.fen) scheduleRefresh();
    }, CONFIG.fenPollMs);
  }

  /**
   * If the app re-rendered part of its DOM (navigating between explore pages
   * without a full iframe reload, etc.), our panel / listeners / observer may
   * be attached to dead nodes. Re-attach everything that got detached.
   * Every operation here is idempotent, so calling it repeatedly is safe.
   */
  function healIfDetached() {
    if (!state.panel || !state.panel.isConnected) {
      if (document.querySelector(SELECTORS.movesContainer)) {
        log('panel detached (app re-render?) — re-mounting');
        mountPanel();
        state.fen = null;      // force a full refresh for the current position
        scheduleRefresh();
      }
    }
    if (state.observedTbody && !state.observedTbody.isConnected) {
      state.observedTbody = null;
      observeMovesTable();     // re-observe the replacement tbody
    }
    bindFenInput();            // no-op if the live input is already bound
  }

  function scheduleRefresh() {
    clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(refresh, CONFIG.debounceMs);
  }

  async function refresh() {
    const fen = readFen();
    if (!fen) return;
    if (fen === state.fen) return; // tbody churn without an actual position change
    state.fen = fen;

    const seq = ++state.requestSeq;
    log('position:', fen);

    // Cache first: cached positions render instantly — no loading flicker,
    // no network — and they keep working even during a rate-limit pause.
    const cached = cacheGet(fen);
    if (cached) {
      present(cached);
      return;
    }

    // During a 429 cooldown, don't fire requests. The timer armed when the
    // 429 happened will re-refresh whatever position is current at that time.
    if (Date.now() < state.rateLimitedUntil) {
      showRateLimitStatus();
      return;
    }

    setLoading();

    let data;
    try {
      data = await fetchLichessData(fen);
    } catch (err) {
      if (seq !== state.requestSeq) return; // stale failure; a newer position took over
      if (err && err.isAuth) {
        warn(err.noToken ? 'no Lichess API token configured' : 'Lichess rejected the API token (401)');
        showTokenNeeded(Boolean(err.noToken));
        return;
      }
      if (err && err.isRateLimit) {
        warn('Lichess rate limit (429) — pausing requests for a minute');
        startRateLimitCooldown();
        return;
      }
      warn('Lichess fetch failed:', err);
      showStatus('Could not load Lichess data — see console.', 'clo-error');
      return;
    }

    // Cache even if we've already moved on — the data is still valid for the
    // position it was requested for, and stepping back will hit the cache.
    cachePut(fen, data);

    if (seq !== state.requestSeq) return; // a newer position superseded this request
    present(data);
  }

  /** Renders a response, choosing the empty state when there are no games. */
  function present(data) {
    const total = data ? (data.white || 0) + (data.draws || 0) + (data.black || 0) : 0;
    if (!data || (total === 0 && (!data.moves || data.moves.length === 0))) {
      showStatus('No Lichess games for this position');
    } else {
      renderData(data);
    }
  }

  // --- 429 cooldown ---------------------------------------------------------

  function startRateLimitCooldown() {
    state.rateLimitedUntil = Date.now() + CONFIG.lichess.rateLimitCooldownMs;
    showRateLimitStatus();
    clearTimeout(state.rateLimitTimer);
    // Once the cooldown ends, force a refresh of whatever position is current.
    state.rateLimitTimer = setTimeout(() => {
      state.fen = null;
      scheduleRefresh();
    }, CONFIG.lichess.rateLimitCooldownMs);
  }

  function showRateLimitStatus() {
    const secondsLeft = Math.max(1, Math.ceil((state.rateLimitedUntil - Date.now()) / 1000));
    showStatus(`Lichess rate limit — retrying in ~${secondsLeft} s`, 'clo-error');
  }

  // ==========================================================================
  // 5) Data — Lichess opening explorer
  // ==========================================================================

  /**
   * Fetches opening-explorer data for a FEN. Response shape (the stub already
   * mimicked it, so everything downstream is unchanged):
   *
   *   {
   *     white, draws, black,                                   // aggregate for the position
   *     moves: [ { san, uci, averageRating, white, draws, black }, ... ],
   *     opening: { eco, name } | null
   *   }
   *
   * Speed/rating filters live in CONFIG.lichess. Flip USE_STUB_DATA to true
   * to develop the UI without touching the API (shows the "stub data" badge).
   */
  const USE_STUB_DATA = false;

  function fetchLichessData(fen) {
    return USE_STUB_DATA ? fetchStubData(fen) : fetchExplorerData(fen);
  }

  async function fetchExplorerData(fen) {
    const params = new URLSearchParams({
      variant: CONFIG.lichess.variant,
      fen, // full FEN from #inputFEN; URLSearchParams handles the encoding
      speeds: CONFIG.lichess.speeds.join(','),
      ratings: CONFIG.lichess.ratings.join(','),
      moves: String(CONFIG.lichess.movesLimit),
      topGames: '0',    // stats only — no sample games,
      recentGames: '0', // keeps the payload small
    });
    const url = `${CONFIG.lichess.apiBase}?${params}`;

    // The actual fetch happens in the background service worker: the explorer
    // requires a Bearer token, and the worker's host_permission makes its
    // fetch CORS-exempt (a content-script fetch with an Authorization header
    // would depend on the server's preflight handling).
    const reply = await chrome.runtime.sendMessage({ type: 'clo-fetch-explorer', url });
    if (!reply) throw new Error('no reply from background worker');
    if (reply.ok) return reply.data;

    const err = new Error(reply.error || `HTTP ${reply.status}`);
    if (reply.status === 429) err.isRateLimit = true;
    if (reply.status === 401) {
      err.isAuth = true;
      err.noToken = Boolean(reply.noToken); // 401 because no token vs. rejected token
    }
    throw err;
  }

  /** Kept for UI development; identical shape to a real response. */
  function fetchStubData(fen) {
    log('fetchLichessData (stub) for', fen);
    return new Promise((resolve) => {
      setTimeout(() => resolve({
        __stub: true,
        white: 2151000, draws: 219000, black: 1930000,
        opening: { eco: 'A00', name: 'Stub Opening' },
        moves: [
          { san: 'e4',  uci: 'e2e4', averageRating: 1850, white: 1180000, draws: 101000, black: 1019000 },
          { san: 'd4',  uci: 'd2d4', averageRating: 1870, white: 640000,  draws: 78000,  black: 602000 },
          { san: 'Nf3', uci: 'g1f3', averageRating: 1890, white: 201000,  draws: 24000,  black: 189000 },
          { san: 'c4',  uci: 'c2c4', averageRating: 1910, white: 96000,   draws: 12000,  black: 88000 },
          { san: 'g3',  uci: 'g2g3', averageRating: 1900, white: 34000,   draws: 4000,   black: 32000 },
        ],
      }), 400); // small artificial delay so the loading state is visible
    });
  }

  // --- FEN-keyed LRU cache ---------------------------------------------------
  // Keyed on the first four FEN fields (pieces, side to move, castling,
  // en passant) so positions that differ only in the move counters — e.g.
  // transpositions — share one entry. An insertion-ordered Map doubles as the
  // LRU: hits are re-inserted, and the oldest entry is evicted at the cap.
  const fenCache = new Map();

  const cacheKey = (fen) => fen.split(' ').slice(0, 4).join(' ');

  function cacheGet(fen) {
    const key = cacheKey(fen);
    if (!fenCache.has(key)) return null;
    const value = fenCache.get(key);
    fenCache.delete(key); // re-insert to mark as most recently used
    fenCache.set(key, value);
    return value;
  }

  function cachePut(fen, data) {
    const key = cacheKey(fen);
    if (fenCache.has(key)) fenCache.delete(key);
    fenCache.set(key, data);
    if (fenCache.size > CONFIG.lichess.cacheMax) {
      fenCache.delete(fenCache.keys().next().value); // evict least recently used
    }
  }

  // ==========================================================================
  // 6) Panel — mounting and rendering
  // ==========================================================================

  function mountPanel() {
    const container = document.querySelector(SELECTORS.movesContainer);
    if (!container) { warn('moves container not found — cannot mount panel'); return; }

    // On Analysis the panel cannot live INSIDE the container: Chessable hides
    // it unless the "Toggle Opening Explorer" button is active, and disables
    // that button entirely in some entry states (e.g. ?fen= deep links). The
    // panel mounts after the container instead, and the parent column becomes
    // the side-mode anchor. No extra selector needed: the parent is reached
    // relationally from the one configured container selector.
    const anchor = IS_ANALYSIS ? container.parentElement : container;

    // Side-mode anchor: on wide windows the CSS positions the panel absolutely
    // against this element (see the media query in lichessable.css), so it
    // must establish a positioning context.
    if (getComputedStyle(anchor).position === 'static') {
      anchor.style.position = 'relative';
    }

    // Remove any stale copy (defensive: avoids duplicates across re-inits).
    const stale = document.getElementById(PANEL_ID);
    if (stale) stale.remove();

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'clo-panel' + (IS_ANALYSIS ? ' clo-panel--analysis' : '');
    // Static skeleton only — no user/remote data ever goes through innerHTML.
    panel.innerHTML = `
      <div class="clo-header">
        <span class="clo-title">Lichess Database</span>
        <span class="clo-stub-badge" hidden>stub data</span>
        <button type="button" class="clo-toggle" aria-expanded="true">Hide</button>
      </div>
      <div class="clo-body">
        <div class="clo-opening" hidden></div>
        <div class="clo-summary" hidden>
          <span class="clo-total"></span>
          <div class="clo-bar clo-summary-bar"></div>
        </div>
        <div class="clo-status" hidden></div>
        <table class="clo-table" hidden>
          <thead>
            <tr>
              <th class="clo-th-move">Move</th>
              <th class="clo-th-pct">%</th>
              <th class="clo-th-games">Games</th>
              <th class="clo-th-wdb">White / Draw / Black</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>`;

    // Explore: insert directly AFTER Chessable's own table wrapper, inside
    // the container — in narrow-window mode the panel flows right beneath
    // their stats; in side mode the CSS pulls it out to the right, but this
    // stays its DOM home either way. Analysis: insert after the container
    // itself (see the comment above).
    if (IS_ANALYSIS) {
      container.after(panel);
    } else {
      const tableWrap = container.querySelector(SELECTORS.movesTableWrap);
      if (tableWrap) tableWrap.after(panel);
      else container.appendChild(panel); // fallback if the wrapper class changed
    }

    state.panel = panel;
    state.ui = {
      body:       panel.querySelector('.clo-body'),
      toggle:     panel.querySelector('.clo-toggle'),
      stubBadge:  panel.querySelector('.clo-stub-badge'),
      opening:    panel.querySelector('.clo-opening'),
      summary:    panel.querySelector('.clo-summary'),
      total:      panel.querySelector('.clo-total'),
      summaryBar: panel.querySelector('.clo-summary-bar'),
      status:     panel.querySelector('.clo-status'),
      table:      panel.querySelector('.clo-table'),
      tbody:      panel.querySelector('.clo-table tbody'),
    };

    state.ui.toggle.addEventListener('click', onToggle); // no inline handlers
    applyHidden();
  }

  function onToggle() {
    state.hidden = !state.hidden;
    applyHidden();
    saveHiddenPref(state.hidden);
  }

  /** Collapses the body but keeps the header, so the panel can be re-shown. */
  function applyHidden() {
    if (!state.ui) return;
    state.ui.body.hidden = state.hidden;
    state.ui.toggle.textContent = state.hidden ? 'Show' : 'Hide';
    state.ui.toggle.setAttribute('aria-expanded', String(!state.hidden));
  }

  /** Loading: if data is already on screen, just dim it; otherwise show text. */
  function setLoading() {
    const ui = state.ui;
    if (!ui) return;
    if (!ui.table.hidden) { ui.body.classList.add('clo-busy'); return; }
    ui.status.textContent = 'Loading Lichess data…';
    ui.status.className = 'clo-status clo-loading';
    ui.status.hidden = false;
  }

  /** Empty / error states replace the table with a one-line message. */
  function showStatus(text, extraClass) {
    const ui = state.ui;
    if (!ui) return;
    ui.body.classList.remove('clo-busy');
    ui.opening.hidden = true;
    ui.summary.hidden = true;
    ui.table.hidden = true;
    ui.status.textContent = text;
    ui.status.className = 'clo-status' + (extraClass ? ' ' + extraClass : '');
    ui.status.hidden = false;
  }

  /** 401 state: explain the token requirement and offer to open the options. */
  function showTokenNeeded(noToken) {
    const ui = state.ui;
    if (!ui) return;
    showStatus(noToken
      ? 'The Lichess explorer now requires a (free) API token.'
      : 'Lichess rejected the API token (401) — it may have been revoked.', 'clo-error');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'clo-settings-btn';
    btn.textContent = 'Open LiChessable settings';
    btn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'clo-open-options' });
    });
    ui.status.appendChild(document.createElement('br'));
    ui.status.appendChild(btn);
  }

  function renderData(data) {
    const ui = state.ui;
    if (!ui) return;

    ui.body.classList.remove('clo-busy');
    ui.status.hidden = true;
    ui.stubBadge.hidden = !data.__stub;

    // Opening name/ECO comes free with the response (null for unnamed positions).
    if (data.opening && data.opening.name) {
      ui.opening.textContent = data.opening.eco
        ? `${data.opening.eco} · ${data.opening.name}`
        : data.opening.name;
      ui.opening.hidden = false;
    } else {
      ui.opening.hidden = true;
    }

    // Aggregate header row: total games + overall W/D/B bar.
    const total = (data.white || 0) + (data.draws || 0) + (data.black || 0);
    ui.total.textContent = `${formatGames(total)} games`;
    buildBar(ui.summaryBar, data.white, data.draws, data.black);
    ui.summary.hidden = false;

    // Per-move rows. Built with createElement/textContent — SAN strings come
    // from a remote API and must never be interpreted as HTML.
    ui.tbody.textContent = '';
    for (const move of data.moves || []) {
      const moveTotal = (move.white || 0) + (move.draws || 0) + (move.black || 0);

      const tr = document.createElement('tr');

      const tdMove = document.createElement('td');
      tdMove.className = 'clo-move';
      tdMove.textContent = move.san || move.uci || '?';
      if (move.averageRating) tdMove.title = `Avg rating ${move.averageRating}`;

      const tdPct = document.createElement('td');
      tdPct.className = 'clo-pct';
      const pct = total ? (100 * moveTotal) / total : 0;
      tdPct.textContent = (pct >= 10 ? Math.round(pct) : pct.toFixed(1)) + '%';
      tdPct.title = `${pct.toFixed(1)}% of games`;

      const tdGames = document.createElement('td');
      tdGames.className = 'clo-games';
      tdGames.textContent = formatGames(moveTotal);
      tdGames.title = `${moveTotal.toLocaleString('en-US')} games`;

      const tdBar = document.createElement('td');
      tdBar.className = 'clo-wdb';
      const bar = document.createElement('div');
      bar.className = 'clo-bar';
      buildBar(bar, move.white, move.draws, move.black);
      tdBar.appendChild(bar);

      tr.append(tdMove, tdPct, tdGames, tdBar);
      ui.tbody.appendChild(tr);
    }
    ui.table.hidden = false;
  }

  /**
   * Fills a bar element with up to three width-proportional segments,
   * mirroring the style of Chessable's own moveWin bars. Percentage labels
   * are only drawn in segments wide enough to hold them; exact numbers are
   * always available in the tooltip.
   */
  function buildBar(barEl, white, draws, black) {
    const w = white || 0, d = draws || 0, b = black || 0;
    const total = w + d + b;
    barEl.textContent = '';
    if (!total) return;

    const segments = [
      ['clo-seg-white', w],
      ['clo-seg-draw',  d],
      ['clo-seg-black', b],
    ];
    for (const [cls, n] of segments) {
      const pct = (100 * n) / total;
      if (pct <= 0) continue;
      const seg = document.createElement('span');
      seg.className = `clo-seg ${cls}`;
      seg.style.width = pct.toFixed(1) + '%';
      const rounded = Math.round(pct);
      if (pct >= 12) seg.textContent = rounded + '%'; // no label in slivers
      seg.title = `${rounded}% — ${n.toLocaleString('en-US')} games`;
      barEl.appendChild(seg);
    }
  }

  const compactFmt = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

  /** ≥ 1M games shown compact ("2.4M") to fit the column; exact value in tooltip. */
  function formatGames(n) {
    return n >= 1000000 ? compactFmt.format(n) : n.toLocaleString('en-US');
  }

  // ==========================================================================
  // 7) Persistence (chrome.storage.local) — wrapped so a storage failure
  //    (e.g. extension reloaded underneath us) never breaks the panel.
  // ==========================================================================
  async function loadHiddenPref() {
    try {
      const res = await chrome.storage.local.get(CONFIG.storageKey);
      return Boolean(res[CONFIG.storageKey]);
    } catch (err) {
      warn('storage read failed:', err);
      return false;
    }
  }

  function saveHiddenPref(value) {
    try {
      chrome.storage.local.set({ [CONFIG.storageKey]: value })
        .catch((err) => warn('storage write failed:', err));
    } catch (err) {
      warn('storage unavailable:', err);
    }
  }

  // ==========================================================================
  // 8) Teardown — mostly for hygiene; the browser reclaims everything on a
  //    real unload, but this keeps SPA-style transitions leak-free.
  // ==========================================================================
  function teardown() {
    clearTimeout(state.debounceTimer);
    clearTimeout(state.rateLimitTimer);
    clearInterval(state.fenPollTimer);
    chrome.storage.onChanged.removeListener(onStorageChanged);
    if (state.tbodyObserver) state.tbodyObserver.disconnect();
  }

  // ==========================================================================
  // Kick-off ("document_idle" normally means the DOM is ready, but guard anyway)
  // ==========================================================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
