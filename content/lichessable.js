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
 * It also adds a small "Overstudy" widget to Chessable's REVIEW sessions
 * (https://www.chessable.com/practice/…). Those render in the TOP document
 * (MoveTrainer2 — no mt1 iframe, none of the explore widgets), so the widget
 * is a separate, self-contained module (section 9) that shares nothing with
 * the panel machinery except CONFIG and the log helpers.
 *
 * The TOP document additionally gets the Lichess Database panel in the
 * trainer's post-completion browse state (section 11): once a variation is
 * completed you can step through its moves, and the panel follows the board.
 * There is no #inputFEN there, so the FEN is reconstructed from the DOM.
 *
 * The manifest injects this into EVERY chessable.com frame ("all_frames": true);
 * the script bails out immediately in any frame that isn't one of those apps —
 * except the top document, which must stay resident (idle) because review
 * sessions are reached by SPA-style pushState with no page load.
 *
 * All console output is prefixed [CLO]. Note: the panel logs appear in the
 * IFRAME's console context — in DevTools, pick the mt1 frame from the context
 * dropdown, or just filter the console for "[CLO]". Review-widget logs appear
 * in the normal top context.
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
    // Analysis board only: the card right of the board, the move list inside
    // it, and the toolbar under it. The panel covers the card (see
    // positionAnalysisPanel) and ADOPTS the move list into itself
    // (adoptAnalysisMoves) — Chessable's own element, handlers and all.
    analysisCard:     '.analysis-container',      // card holding the move list, behind the panel
    analysisMovesBox: '.movesContainer',          // scroll box wrapping the move tree — the adopted node
    analysisControls: '.edit-controls-container', // toolbar under the card; stays uncovered
    board:          '.chessboard-63f37',    // chessboard.js container — scopes the square lookups below
    boardSquare:    '[id^="%s-"]',          // square lookup template; %s = algebraic name ("e4") — squares carry ids like "e4-<uuid>"

    // MoveTrainer2 (review/learn sessions, top document — sections 9/10):
    trainerIconBtn:   '.board-footer__icon-btn', // footer icon buttons (hint, pause, …)
    trainerPauseIcon: '.fa-pause',               // icon inside the pause-timer button
    trainerFooter:    '.board-footer',           // Exit / nav row under the board — widget sits below it
    trainerRow:       '.row-practice',           // flex row holding board + comment column; shifted to re-center the board
    // Review drawer: an empty marker div sits INSIDE the active variation row;
    // the row itself carries the ids as plain attributes (+ name in `title`).
    reviewCurrentMarker: '#currentStudyingVariation',
    reviewRowVidAttr:    'oid', // attribute on the marker's parent row: variation id
    reviewRowListAttr:   'lid', // attribute on the marker's parent row: list id
    // Fallback: the panel header's variation name links to /variation/<oid>/.
    reviewTitleLink: '.practice-header__title a[href^="/variation/"]',

    // Trainer browse state (completed variation — section 11). The comment
    // panel lists the mainline as commentMove spans; the move currently shown
    // on the board carries the "_shownOnBoard" testid variant. Clickable
    // subvariation moves work the same way with the commentSubMove testids,
    // grouped per line inside one .commentInMove parent.
    reviewProgress:     '[data-testid="practiceProgress"]', // "Completed" stats block — only present in the browse state
    reviewMoves:        '[data-testid="commentMove"], [data-testid="commentMove_shownOnBoard"]',
    reviewMoveShown:    '[data-testid="commentMove_shownOnBoard"]',
    reviewSubMoves:     '[data-testid="commentSubMove"], [data-testid="commentSubMove_shownOnBoard"]',
    reviewSubMoveShown: '[data-testid="commentSubMove_shownOnBoard"]',
    reviewBoardWrap:    '[data-testid="boardContainer"]', // scopes the board lookup to the trainer's own board
    reviewSquare:       '.square-%s',   // square lookup by class; %s = algebraic name — orientation-independent
    reviewPiece:        '[data-piece]', // piece div inside a square; attribute value like "wK" / "bP"

    // Explore EDIT page (quick-edit-comment feature — section 12). The edit
    // page reuses the mt1 explore iframe (/mt1/explore/edit/<oid>/), so these
    // only ever match there. Each mainline ply is a div in #interactivePGN with
    // id "{san}_{w|b}_{moveNumber}" (e.g. "d4_w_8", "Qe6+_b_5") — built
    // dynamically and looked up with getElementById (the ids contain +, #, =,
    // which would need escaping in a CSS selector). NOTE: the ids KEEP check/
    // mate (+ #) but STRIP evaluation glyphs (!?, =, …), so the SAN read from
    // the review panel must be normalised the same way (quickEditSan).
    editInteractivePGN: '#interactivePGN',  // mainline move list on the edit page
    editCommentAfter:   '#moveComment',     // "Comments After <move>" textarea (React-controlled)
    editVariationOnly:  '#specificAltMove', // "For This Variation Only" checkbox
    editSubmitButton:   '#submitButton',    // "Update variation" button (onclick=addVariation → swal confirm)
    editConfirmButton:  '.swal2-confirm',   // SweetAlert2 "Update" button that actually submits the form

    // Standalone variation page (/variation/<oid>/ — second quick-edit host,
    // section 12). Wholly different markup from both the trainer and the edit
    // page: #theOpeningMoves holds one <span> per ply, each wrapping a
    // .whiteMove/.blackMove div whose id IS the 0-based ply index ("0", "1", …)
    // — so no SAN-numbering parsing is needed here at all. Move-number labels
    // are .openingNum (no id) and comments are .commentInMove spans, which
    // never contain move divs (verified on a variation with 14 comments and
    // subvariations), hence the > span > child scoping.
    variationMoves:    '#theOpeningMoves > span > .whiteMove, #theOpeningMoves > span > .blackMove',
    variationEditLink: 'a[href*="/explore/edit/"]', // "Edit Variation" — rendered only with edit rights
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

    // --- Analysis-board overlay placement (positionAnalysisPanel) ----------
    analysis: {
      panelMinHeight: 260,      // never shrink the overlay below this, whatever the column does
      movesMinHeight: 44,       // adopted move box: floor, so a one-move game still reads as a box
      movesMaxFraction: 0.45,   // …and ceiling, as a fraction of the panel height (then it scrolls)
    },

    // --- Review-mode overstudy widget (top document, section 9) ------------
    review: {
      pathPrefix: '/practice/', // review sessions live here (NOT an mt1 iframe)
      learnPrefix: '/learn/',   // Chessable's overstudy = the learn route for a learned variation
      pollMs: 500,              // URL poll; the player rewrites the URL via replaceState (no event)
      // Review-panel placement (positionReviewPanel): preferred gutter left of
      // the board, with the below-the-board layout as the narrow-window fallback.
      panelGap: 12,             // breathing room from the board / viewport edge
      panelMinWidth: 300,       // narrower gutter than this → fall back below the board
      panelMaxWidth: 420,
    },

    // --- Optional local Stockfish (offscreen document, section 5b) ----------
    engine: {
      enabledKey: 'cloEngineEnabled', // chrome.storage.local; off by default
      pvCount: 3,                     // rendered rows; matches MULTIPV in engine/engine.js
    },

    // --- Quick-edit comment (section 12) -----------------------------------
    // Adds a hover pencil to mainline moves in the review browse panel that
    // appends a PGN comment to the real Chessable variation by driving its own
    // edit page in a background tab (opened by background.js).
    quickEdit: {
      editPathPrefix:   '/mt1/explore/edit/', // the edit page inside the mt1 iframe
      commentJoin:      '\n\n', // separator when appending to an existing comment
      settleMs:         150,    // wait after clicking a move for #moveComment to update
      bootTimeoutMs:    15000,  // wait for the edit form (absence ⇒ no edit rights)
      confirmTimeoutMs: 6000,   // wait for the SweetAlert confirm button after submit
    },
  };

  const PANEL_ID = 'lichessable-panel';
  const REVIEW_WIDGET_ID = 'lichessable-review'; // overstudy widget (section 9); the review panel anchors below it
  const QE_PENCIL_ID = 'lichessable-qe-pencil';  // quick-edit hover pencil (section 12)
  const QE_POPUP_ID  = 'lichessable-qe-popup';   // quick-edit comment popup (section 12)

  const log  = (...a) => console.log(CONFIG.logPrefix, ...a);
  const warn = (...a) => console.warn(CONFIG.logPrefix, ...a);

  // Frame targeting. Explore/Analysis render inside mt1 iframes: any OTHER
  // iframe exits immediately. The TOP document never exits: review sessions
  // (/practice/…) render there and are reached by SPA pushState from any
  // chessable.com page without a load, so it runs the lightweight overstudy
  // watcher (section 9) instead of the panel.
  const IS_FRAME_APP = CONFIG.framePathPrefixes.some((p) => location.pathname.startsWith(p));
  if (!IS_FRAME_APP && window !== window.top) return;

  // On Analysis the panel needs a CSS modifier (see lichessable.css) to share
  // the fixed-height Opening Explorer column with Chessable's own move table.
  const IS_ANALYSIS = location.pathname.startsWith('/mt1/analysis/');
  // The explore EDIT page (also inside the mt1 iframe): host of the quick-edit
  // driver (section 12). Its path is a subset of the explore prefix, so it is
  // also an IS_FRAME_APP page.
  const IS_EDIT_PAGE = location.pathname.startsWith(CONFIG.quickEdit.editPathPrefix);
  // Top document = MoveTrainer2 territory: the panel machinery below runs in
  // review mode (DOM-derived FEN, body-mounted panel — section 11).
  const IS_REVIEW = !IS_FRAME_APP;
  // The standalone variation page (top document, no mt1 iframe): the SECOND
  // host of the quick-edit UI (section 12). Nothing else runs there — the
  // review panel/overstudy gates below never match it.
  const VARIATION_PATH_RE = /^\/variation\/(\d+)\/?/;
  const IS_VARIATION_PAGE = IS_REVIEW && VARIATION_PATH_RE.test(location.pathname);

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
    engineEnabled: false, // optional Stockfish analysis on? (persisted; section 5b)
    engineFen: null,      // FEN last sent to the engine (dedup / stop bookkeeping)
    lastEngineMsgAt: 0,   // last engine update/status received (silence diagnostics)
    enginePingTimer: 0,   // pending silence check after an analyze
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
    state.engineEnabled = await loadEnginePref();
    mountPanel();
    bindFenInput();
    observeMovesTable();
    startWatchdog();
    refresh();                                  // initial render for the current position
    window.addEventListener('pagehide', teardown);
    // When a token is saved (or changed) in the options page, retry the
    // current position immediately — no page reload needed.
    chrome.storage.onChanged.addListener(onStorageChanged);
    // Engine updates relayed by the service worker + battery guard (stop the
    // search while this tab is in the background).
    chrome.runtime.onMessage.addListener(onEngineMessage);
    document.addEventListener('visibilitychange', onVisibilityChange);
    log('initialised on', location.pathname);
  }

  function onStorageChanged(changes, area) {
    if (area !== 'local') return;
    if (changes[CONFIG.lichess.tokenKey]) {
      log('Lichess token changed — retrying current position');
      state.fen = null; // forget the last position so the next tick refetches
      scheduleRefresh();
    }
    // Keeps the toggle in sync across tabs/modes (idempotent in the tab that
    // flipped it — syncEngine dedups on state.engineFen).
    if (changes[CONFIG.engine.enabledKey]) {
      state.engineEnabled = Boolean(changes[CONFIG.engine.enabledKey].newValue);
      applyEngineEnabled();
      syncEngine();
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
    if (IS_REVIEW) return readReviewFen(); // no #inputFEN in the trainer — section 11
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
      if (IS_ANALYSIS && !state.hidden) adoptAnalysisMoves(); // re-adopt after a re-render
      if (IS_ANALYSIS) positionAnalysisPanel();
      const fen = readFen();
      if (fen && fen !== state.fen) scheduleRefresh();
    }, CONFIG.fenPollMs);
    if (IS_ANALYSIS) {
      window.addEventListener('resize', positionAnalysisPanel);
      // Leaving the page: hand the move list back, so nothing of Chessable's
      // is left inside a panel that is about to disappear.
      window.addEventListener('pagehide', releaseAnalysisMoves);
    }
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
    syncEngine(); // before the cache short-circuit: engine analysis is per-position

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
    releaseAnalysisMoves(); // never let a stale panel take Chessable's move list with it
    let container = null;
    if (!IS_REVIEW) {
      container = document.querySelector(SELECTORS.movesContainer);
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
    }

    // Remove any stale copy (defensive: avoids duplicates across re-inits).
    const stale = document.getElementById(PANEL_ID);
    if (stale) stale.remove();

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'clo-panel' +
      (IS_ANALYSIS ? ' clo-panel--analysis' : '') +
      (IS_REVIEW ? ' clo-panel--review' : '');
    // Static skeleton only — no user/remote data ever goes through innerHTML.
    panel.innerHTML = `
      <div class="clo-header">
        <span class="clo-title">Lichess Database</span>
        <span class="clo-stub-badge" hidden>stub data</span>
        <button type="button" class="clo-engine-toggle" aria-pressed="false">Engine</button>
        <button type="button" class="clo-toggle" aria-expanded="true">Hide</button>
      </div>
      <div class="clo-moves" hidden></div>
      <div class="clo-body">
        <div class="clo-engine" hidden>
          <div class="clo-engine-head">
            <span class="clo-engine-eval"></span>
            <span class="clo-engine-depth"></span>
            <span class="clo-engine-note"></span>
          </div>
          <div class="clo-engine-line"><span class="clo-line-eval"></span><span class="clo-line-moves"></span></div>
          <div class="clo-engine-line"><span class="clo-line-eval"></span><span class="clo-line-moves"></span></div>
          <div class="clo-engine-line"><span class="clo-line-eval"></span><span class="clo-line-moves"></span></div>
        </div>
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
    // itself (see the comment above). Review: on document.body — never inside
    // Chessable's React tree — fixed-positioned under the board (section 11).
    if (IS_REVIEW) {
      document.body.appendChild(panel);
    } else if (IS_ANALYSIS) {
      container.after(panel);
    } else {
      const tableWrap = container.querySelector(SELECTORS.movesTableWrap);
      if (tableWrap) tableWrap.after(panel);
      else container.appendChild(panel); // fallback if the wrapper class changed
    }

    state.panel = panel;
    state.ui = {
      body:       panel.querySelector('.clo-body'),
      movesHost:  panel.querySelector('.clo-moves'),
      toggle:     panel.querySelector('.clo-toggle'),
      stubBadge:  panel.querySelector('.clo-stub-badge'),
      opening:    panel.querySelector('.clo-opening'),
      summary:    panel.querySelector('.clo-summary'),
      total:      panel.querySelector('.clo-total'),
      summaryBar: panel.querySelector('.clo-summary-bar'),
      status:     panel.querySelector('.clo-status'),
      table:      panel.querySelector('.clo-table'),
      tbody:      panel.querySelector('.clo-table tbody'),
      engine:       panel.querySelector('.clo-engine'),
      engineToggle: panel.querySelector('.clo-engine-toggle'),
      engineEval:   panel.querySelector('.clo-engine-eval'),
      engineDepth:  panel.querySelector('.clo-engine-depth'),
      engineNote:   panel.querySelector('.clo-engine-note'),
      engineLines:  Array.from(panel.querySelectorAll('.clo-engine-line'), (row) => ({
        evalEl:  row.querySelector('.clo-line-eval'),
        movesEl: row.querySelector('.clo-line-moves'),
      })),
    };

    state.ui.toggle.addEventListener('click', onToggle); // no inline handlers
    state.ui.engineToggle.addEventListener('click', onEngineToggle);
    // One delegated listener instead of per-row handlers: rows are rebuilt on
    // every render, the tbody lives as long as the panel.
    state.ui.tbody.addEventListener('click', onMoveRowClick);
    applyHidden();
    applyEngineEnabled(); // restore the engine section state on (re)mount
    if (IS_ANALYSIS) {
      adoptAnalysisMoves();
      positionAnalysisPanel();
    }
  }

  // --- analysis: adopting Chessable's move tree ------------------------------
  //
  // The panel covers the whole card right of the board, so the move tree has to
  // live INSIDE it. Rather than mirroring the tree (and reimplementing click-to-
  // navigate, the two right-click menus, promote/delete branch, …), we move
  // Chessable's own `.movesContainer` element into the panel: it keeps every
  // handler it had, because it IS their element. Their two right-click menus
  // are descendants of that node and travel with it (the host is
  // position:relative so any absolutely-positioned one still resolves inside
  // the move box rather than against the whole panel).
  //
  // Two rules make this safe: we never insert anything of ours INTO their
  // subtree, and the node always goes home before the panel is torn down
  // (mountPanel, pagehide). If their app re-renders and rebuilds the card, the
  // fresh copy is simply adopted again on the next poll.

  /** The adopted node and where it came from, so it can be put back exactly.
   *  Held in a variable, not looked up through the panel: a panel that got
   *  detached by a re-render must not take Chessable's move list with it. */
  let analysisMovesHome = null; // { node, parent, next }

  function adoptAnalysisMoves() {
    const host = state.ui && state.ui.movesHost;
    if (!IS_ANALYSIS || !host || !host.isConnected || !state.panel) return;
    const column = state.panel.parentElement;
    // Prefer a node that is still in Chessable's own card: after a re-render
    // theirs is the live one and ours is a detached leftover.
    const card = column && column.querySelector(SELECTORS.analysisCard);
    const fresh = card && card.querySelector(SELECTORS.analysisMovesBox);
    const adopted = host.firstElementChild;
    if (!fresh) {
      host.hidden = !adopted; // nothing new to take; keep what we already hold
      return;
    }
    if (fresh === adopted) return; // already ours — the common case
    if (adopted) adopted.remove(); // stale duplicate left behind by a re-render
    analysisMovesHome = { node: fresh, parent: fresh.parentElement, next: fresh.nextElementSibling };
    // Their box is overflow:scroll, so the scrollbar gutter is always drawn.
    // Hidden inline (their stylesheet outranks ours on their element); the
    // ::-webkit-scrollbar rule in lichessable.css is the fallback for Chrome
    // versions without scrollbar-width. Scrolling itself is unaffected.
    fresh.style.scrollbarWidth = 'none';
    host.appendChild(fresh);
    host.hidden = false;
    log('adopted Chessable\'s move list into the panel');
  }

  /**
   * Size the moves box to its content, between a floor and a fraction of the
   * panel — a two-move game should not leave a hole above the Lichess data,
   * and a long tree should not push it off screen (the box scrolls instead).
   *
   * Our CSS pins the box's height, which also makes its scrollHeight useless
   * as a "how tall do the moves want to be" answer — so the natural height is
   * measured by briefly restoring `height: auto`. That is one synchronous
   * reflow of a small subtree per poll, and unlike measuring the move tree
   * itself it needs no assumptions about their padding, leading or wrapping.
   */
  function sizeAnalysisMovesHost() {
    const host = state.ui && state.ui.movesHost;
    const box = host && !host.hidden && host.firstElementChild;
    if (!box || !state.panel) return;
    const panelHeight = state.panel.getBoundingClientRect().height;
    if (!panelHeight) return;
    box.style.height = 'auto';
    const natural = box.scrollHeight + 1; // +1: sub-pixel rounding, else it scrolls by a hair
    const max = Math.round(panelHeight * CONFIG.analysis.movesMaxFraction);
    const height = Math.max(CONFIG.analysis.movesMinHeight, Math.min(natural, max));
    host.style.height = height + 'px';
    // Inline, not from our stylesheet: Chessable's own rules for this element
    // outrank ours, and it does not stretch as a flex item either — without
    // this the box stays at its padding height and slices the moves in half.
    box.style.boxSizing = 'border-box';
    box.style.height = height + 'px';
  }

  /** Put the move tree back where Chessable expects it (idempotent). */
  function releaseAnalysisMoves() {
    const home = analysisMovesHome;
    if (!home) return;
    analysisMovesHome = null;
    // Undo the inline sizing from sizeAnalysisMovesHost() — their node goes
    // back exactly as it was found.
    home.node.style.height = '';
    home.node.style.boxSizing = '';
    home.node.style.scrollbarWidth = '';
    const parent = home.parent && home.parent.isConnected
      ? home.parent
      : document.querySelector(SELECTORS.analysisCard);
    if (!parent) return; // card gone entirely — leave the node where it is
    if (home.next && home.next.parentElement === parent) parent.insertBefore(home.node, home.next);
    else parent.appendChild(home.node);
  }

  /**
   * Analysis board: the panel fills the whole column right of the board, from
   * its top down to Chessable's toolbar (which stays uncovered and usable) —
   * move tree at the top, Lichess/engine data below. It stays a child of the
   * column (its DOM home from mountPanel, which also makes the column a
   * positioning context), so the card behind it is only measured, never
   * restyled; with the move tree adopted away that card collapses, which is
   * why the height comes from the COLUMN minus the toolbar, not from the card.
   * Recomputed on the 500 ms poll and on resize.
   */
  function positionAnalysisPanel() {
    const panel = state.panel;
    if (!IS_ANALYSIS || !panel || !panel.isConnected) return;
    const column = panel.parentElement;
    if (!column) return;
    const columnRect = column.getBoundingClientRect();
    if (!columnRect.height) return;
    const controls = column.querySelector(SELECTORS.analysisControls);
    const controlsHeight = controls ? controls.getBoundingClientRect().height : 0;
    const height = Math.max(CONFIG.analysis.panelMinHeight, columnRect.height - controlsHeight);
    panel.style.left = '0px';
    panel.style.right = '0px';
    panel.style.width = 'auto';
    panel.style.top = '0px';
    // Collapsed ("Hide") the panel is just its header — let it shrink to that.
    panel.style.height = state.hidden ? 'auto' : Math.round(height) + 'px';
    sizeAnalysisMovesHost(); // depends on the height just set
  }

  // --- click-to-play ---------------------------------------------------------

  function onMoveRowClick(event) {
    const row = event.target.closest('tr');
    if (!row || !row.dataset.uci) return;
    playMove(row.dataset.uci);
  }

  /**
   * Plays a move on Chessable's board by simulating click-click input: a full
   * pointer/mouse press sequence on the source square, then on the destination
   * square. Chessable's board treats this exactly like a user clicking the two
   * squares, so all their own bookkeeping (move list / notation, FEN input,
   * their stats table) runs normally — and the FEN change then triggers our
   * usual refresh. Squares are looked up by algebraic name: Chessable ids them
   * "e4-<uuid>", orientation-independent, so no flip handling is needed.
   *
   * Promotion moves (5-char UCI, e.g. e7e8q) open Chessable's own promotion
   * picker after the two clicks; the piece choice is left to the user there.
   */
  function playMove(uci) {
    if (!uci || uci.length < 4) return;
    const fromEl = findSquare(uci.slice(0, 2));
    const toEl = findSquare(uci.slice(2, 4));
    if (!fromEl || !toEl) { warn('cannot play', uci, '— board squares not found'); return; }
    log('playing move', uci);
    pressSquare(fromEl);
    pressSquare(toEl);
  }

  function findSquare(name) {
    const board = document.querySelector(SELECTORS.board);
    return (board || document).querySelector(SELECTORS.boardSquare.replace('%s', name));
  }

  function pressSquare(el) {
    const rect = el.getBoundingClientRect();
    const opts = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: rect.x + rect.width / 2,
      clientY: rect.y + rect.height / 2,
      button: 0,
    };
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      el.dispatchEvent(type.startsWith('pointer')
        ? new PointerEvent(type, opts)
        : new MouseEvent(type, opts));
    }
  }

  function onToggle() {
    state.hidden = !state.hidden;
    applyHidden();
    saveHiddenPref(state.hidden);
    syncEngine(); // a collapsed panel stops the search (engine kept warm)
  }

  /** Collapses the body but keeps the header, so the panel can be re-shown. */
  function applyHidden() {
    if (!state.ui) return;
    state.ui.body.hidden = state.hidden;
    state.ui.toggle.textContent = state.hidden ? 'Show' : 'Hide';
    state.ui.toggle.setAttribute('aria-expanded', String(!state.hidden));
    if (IS_ANALYSIS) {
      // Collapsing gives Chessable its own UI back: the move list returns to
      // the card, and the panel shrinks to its header.
      if (state.hidden) {
        releaseAnalysisMoves();
        state.ui.movesHost.hidden = true;
      } else {
        adoptAnalysisMoves();
      }
      positionAnalysisPanel();
    }
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
      // Clicking the row plays the move on the board (see onMoveRowClick) —
      // except in review mode, where the trainer's board is not free-play.
      if (move.uci && !IS_REVIEW) tr.dataset.uci = move.uci;

      const tdMove = document.createElement('td');
      tdMove.className = 'clo-move';
      tdMove.textContent = move.san || move.uci || '?';
      const hints = [];
      if (move.averageRating) hints.push(`Avg rating ${move.averageRating}`);
      if (!IS_REVIEW) hints.push(`Click to play ${move.san || move.uci}`);
      if (hints.length) tdMove.title = hints.join(' · ');

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
  // 5b) Optional engine client — Stockfish runs in the extension's offscreen
  //     document; background.js is the message hub (an offscreen document's
  //     sendMessage can never reach content scripts). Streamed updates arrive
  //     via chrome.tabs.sendMessage targeted at exactly this frame. The
  //     `msg.fen === state.fen` guard is the engine's staleness rule,
  //     mirroring requestSeq for the explorer fetches.
  // ==========================================================================

  function engineSend(msg) {
    try {
      chrome.runtime.sendMessage(Object.assign({ target: 'sw' }, msg)).catch(() => {});
    } catch (err) {
      warn('engine message failed:', err);
    }
  }

  /**
   * Single decision point, called from every relevant event (position change,
   * toggles, tab visibility, review browse state): analyze when the engine
   * should be running for the current position, stop when it should not.
   */
  function syncEngine() {
    const active = state.engineEnabled && !state.hidden && !document.hidden &&
      Boolean(state.fen) && (!IS_REVIEW || (state.panel && !state.panel.hidden));
    if (active && state.fen !== state.engineFen) {
      state.engineFen = state.fen;
      if (state.ui) state.ui.engine.classList.add('clo-busy'); // dim until fresh lines land
      log('engine: sending analyze for', state.fen);
      engineSend({ type: 'clo-engine-analyze', fen: state.fen });
      pingEngineIfSilent();
    } else if (!active && state.engineFen) {
      state.engineFen = null;
      log('engine: sending stop (enabled=' + state.engineEnabled + ' panelHidden=' + state.hidden +
        ' docHidden=' + document.hidden + ' fen=' + Boolean(state.fen) + ')');
      engineSend({ type: 'clo-engine-stop' });
    }
  }

  function onEngineToggle() {
    state.engineEnabled = !state.engineEnabled;
    saveEnginePref(state.engineEnabled);
    applyEngineEnabled();
    if (state.engineEnabled) {
      syncEngine();
    } else {
      // Full shutdown (not just stop): closing the offscreen document frees
      // the engine's few hundred MB immediately.
      state.engineFen = null;
      engineSend({ type: 'clo-engine-shutdown' });
    }
  }

  function applyEngineEnabled() {
    const ui = state.ui;
    if (!ui) return;
    ui.engineToggle.setAttribute('aria-pressed', String(state.engineEnabled));
    ui.engine.hidden = !state.engineEnabled;
    if (state.engineEnabled) resetEngineDisplay('Starting engine…');
  }

  function resetEngineDisplay(note) {
    const ui = state.ui;
    if (!ui) return;
    ui.engine.classList.remove('clo-busy');
    ui.engineEval.textContent = '—';
    ui.engineDepth.textContent = '';
    ui.engineNote.textContent = note || '';
    for (const row of ui.engineLines) {
      row.evalEl.textContent = '';
      row.movesEl.textContent = '';
      row.movesEl.title = '';
    }
  }

  function onVisibilityChange() {
    log('engine: visibilitychange, hidden =', document.hidden);
    syncEngine();
  }

  /**
   * If nothing at all comes back within a few seconds of an analyze, ask the
   * hub for its state and log it — the service worker's own console is hard
   * to reach, so its failures would otherwise be invisible.
   */
  function pingEngineIfSilent() {
    clearTimeout(state.enginePingTimer);
    const sentAt = Date.now();
    state.enginePingTimer = setTimeout(async () => {
      if (state.lastEngineMsgAt > sentAt) return; // engine responded — all good
      try {
        const res = await chrome.runtime.sendMessage({ target: 'sw', type: 'clo-engine-ping' });
        warn('engine silent after analyze; hub state:', JSON.stringify(res));
      } catch (err) {
        warn('engine ping failed:', err);
      }
    }, 3000);
  }

  function onEngineMessage(msg) {
    if (!msg || !state.ui || !state.engineEnabled) return;
    if (msg.type === 'clo-engine-update' || msg.type === 'clo-engine-status') {
      state.lastEngineMsgAt = Date.now();
    }
    if (msg.type === 'clo-engine-status') {
      if (msg.status === 'debug') { log('engine:', msg.detail); return; }
      if (msg.status === 'loading') {
        state.ui.engineNote.textContent = 'Loading engine…';
      } else if (msg.status === 'ready') {
        state.ui.engineNote.textContent = '';
      } else if (msg.status === 'error') {
        state.ui.engine.classList.remove('clo-busy');
        warn('engine error:', msg.detail);
        state.ui.engineNote.textContent = 'Engine error — see the offscreen console.';
      }
      return;
    }
    if (msg.type !== 'clo-engine-update') return;
    if (msg.fen !== state.fen) return; // stale: the board has moved on
    renderEngineUpdate(msg);
  }

  function renderEngineUpdate(msg) {
    const ui = state.ui;
    ui.engine.classList.remove('clo-busy');
    ui.engineNote.textContent = '';
    const pvs = Array.isArray(msg.pvs) ? msg.pvs : [];
    const best = pvs.find((p) => p.multipv === 1);
    ui.engineEval.textContent = best ? formatEval(best) : '—';
    ui.engineDepth.textContent = msg.depth ? 'depth ' + msg.depth + (msg.done ? '' : '…') : '';
    for (let i = 0; i < ui.engineLines.length; i++) {
      const pv = pvs.find((p) => p.multipv === i + 1);
      const row = ui.engineLines[i];
      row.evalEl.textContent = pv ? formatEval(pv) : '';
      row.movesEl.textContent = pv ? pv.san : '';
      row.movesEl.title = pv ? pv.san : ''; // long PVs truncate; full line on hover
    }
  }

  /** Scores arrive already normalized to White's perspective (engine.js). */
  function formatEval(pv) {
    if (typeof pv.mate === 'number') return '#' + pv.mate;
    if (typeof pv.cp !== 'number') return '—';
    const pawns = pv.cp / 100;
    return (pawns >= 0 ? '+' : '') + pawns.toFixed(1);
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

  async function loadEnginePref() {
    try {
      const res = await chrome.storage.local.get(CONFIG.engine.enabledKey);
      return Boolean(res[CONFIG.engine.enabledKey]);
    } catch (err) {
      warn('storage read failed:', err);
      return false;
    }
  }

  function saveEnginePref(value) {
    try {
      chrome.storage.local.set({ [CONFIG.engine.enabledKey]: value })
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
    chrome.runtime.onMessage.removeListener(onEngineMessage);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    if (state.engineFen) { state.engineFen = null; engineSend({ type: 'clo-engine-stop' }); }
    if (state.tbodyObserver) state.tbodyObserver.disconnect();
  }

  // ==========================================================================
  // 9) Review-mode overstudy widget (top document, /practice/…)
  //
  // The review URL is CONSTANT for the whole session —
  // /practice/<courseId>/0/<listId> — the variation id never appears in it
  // (confirmed by hooking history.replaceState through a live session), so
  // the old "swap /practice/ for /learn/ in the URL" approach could never
  // identify a variation. The real sources, in the DOM:
  //
  //   * The active drawer row (parent of the #currentStudyingVariation
  //     marker div) carries the variation id and list id as plain `oid` /
  //     `lid` attributes, plus the variation name in `title`.
  //   * Fallback: the panel header title is a link to /variation/<oid>/.
  //
  // Overstudy = Chessable's learn route: their own Overstudy buttons navigate
  // to /learn/<courseId>/<variationId>/<listId>[/w|b] (the color suffix is
  // optional — verified). The widget builds that URL and has the service
  // worker open it in a background tab.
  //
  // Two buttons: the variation on the board now, and the previous one (= the
  // most recently completed, once the queue auto-advances past it).
  //
  // The widget mounts on document.body — never inside Chessable's React tree,
  // where foreign children can crash their reconciliation. The 500 ms poll
  // also re-mounts the widget if an app re-render removes it (same
  // self-healing philosophy as section 4).
  // ==========================================================================
  function initReviewOverstudy() {
    const WIDGET_ID = REVIEW_WIDGET_ID;

    const rs = {
      current: null,    // { bid, oid, lid, title } — variation on the board now
      previous: null,   // { bid, oid, lid, title } — the one before it
      widget: null,
      buttons: null,    // { current, previous }
      warnedNoDetect: false, // one warning per detection outage, not per tick
    };

    // Course id from the session URL; the trailing list id doubles as a
    // fallback when the drawer row is unavailable.
    const PRACTICE_URL_RE = /^\/practice\/(\d+)(?:\/(\d+))?(?:\/(\d+))?/;

    function readCurrentVariation() {
      const m = PRACTICE_URL_RE.exec(location.pathname);
      if (!m) return null;
      const bid = m[1];
      const marker = document.querySelector(SELECTORS.reviewCurrentMarker);
      const row = marker && marker.parentElement;
      const oid = row && row.getAttribute(SELECTORS.reviewRowVidAttr);
      if (oid && oid !== '0') {
        return {
          bid, oid,
          lid: row.getAttribute(SELECTORS.reviewRowListAttr) || m[3] || '',
          title: row.getAttribute('title') || '',
        };
      }
      const link = document.querySelector(SELECTORS.reviewTitleLink);
      const hm = link && /^\/variation\/(\d+)/.exec(link.getAttribute('href') || '');
      if (hm && hm[1] !== '0') {
        return { bid, oid: hm[1], lid: m[3] || '', title: (link.textContent || '').trim() };
      }
      return null;
    }

    function tick() {
      const inReview = location.pathname.startsWith(CONFIG.review.pathPrefix);
      const cur = inReview ? readCurrentVariation() : null;
      if (cur) {
        rs.warnedNoDetect = false;
        if (!rs.current || rs.current.oid !== cur.oid) {
          if (rs.current) rs.previous = rs.current;
          rs.current = cur;
          log('review variation:', cur.oid, cur.title);
        }
      } else {
        if (inReview && !rs.warnedNoDetect) {
          rs.warnedNoDetect = true; // summary screen, or markup changed
          log('review session, but no current variation detected:', location.pathname);
        }
        if (rs.current) {
          rs.previous = rs.current;
          rs.current = null;
        }
      }
      updateWidget(inReview);
    }

    function updateWidget(inReview) {
      if (!inReview || (!rs.current && !rs.previous)) {
        if (rs.widget) rs.widget.hidden = true;
        return;
      }
      if (!rs.widget || !rs.widget.isConnected) mountWidget(); // idempotent self-heal
      rs.widget.hidden = false;
      positionWidget();
      // After in-session back-navigation "previous" can equal "current" —
      // showing both would just open the same overstudy twice.
      const previous = rs.previous && (!rs.current || rs.previous.oid !== rs.current.oid)
        ? rs.previous : null;
      syncButton(rs.buttons.current, rs.current, 'current');
      syncButton(rs.buttons.previous, previous, 'previous');
    }

    /**
     * Centers the widget beneath the board (below Chessable's Exit/nav footer
     * row). position:fixed + getBoundingClientRect are both viewport-relative,
     * so the coordinates line up directly; the 500 ms tick (plus resize/scroll
     * listeners) keeps them fresh. If the board isn't in the DOM the inline
     * styles are never set and the stylesheet's bottom-right fallback applies.
     */
    function positionWidget() {
      if (!rs.widget || rs.widget.hidden) return;
      const board = document.querySelector(SELECTORS.board);
      if (!board) return;
      const rect = board.getBoundingClientRect();
      if (!rect.width) return;
      const footer = document.querySelector(SELECTORS.trainerFooter);
      const footerRect = footer ? footer.getBoundingClientRect() : null;
      const top = (footerRect && footerRect.height ? footerRect.bottom : rect.bottom) + 10;
      rs.widget.style.left = rect.left + rect.width / 2 + 'px';
      rs.widget.style.top = top + 'px';
      rs.widget.style.right = 'auto';
      rs.widget.style.bottom = 'auto';
      rs.widget.style.transform = 'translateX(-50%)';
    }

    function syncButton(btn, entry, which) {
      btn.hidden = !entry;
      if (entry) {
        const name = entry.title || '#' + entry.oid;
        btn.title = `Open overstudy for the ${which} variation (${name}) in a background tab`;
      }
    }

    function mountWidget() {
      const stale = document.getElementById(WIDGET_ID);
      if (stale) stale.remove(); // defensive: avoids duplicates across re-inits

      const widget = document.createElement('div');
      widget.id = WIDGET_ID;
      widget.className = 'clo-review';

      const title = document.createElement('span');
      title.className = 'clo-review-title';
      title.textContent = 'Overstudy';

      const btnCurrent = makeOverstudyButton('This variation', 'current', '');
      const btnPrevious = makeOverstudyButton('Previous variation', 'previous', ' clo-review-btn--secondary');

      widget.append(title, btnCurrent, btnPrevious);
      document.body.appendChild(widget);

      rs.widget = widget;
      rs.buttons = { current: btnCurrent, previous: btnPrevious };
    }

    function makeOverstudyButton(label, which, extraClass) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'clo-review-btn' + extraClass;
      btn.textContent = label;
      btn.hidden = true;
      btn.addEventListener('click', () => { // no inline handlers
        const entry = which === 'current' ? rs.current : rs.previous;
        if (!entry) return;
        const url = location.origin + CONFIG.review.learnPrefix +
          entry.bid + '/' + entry.oid + (entry.lid ? '/' + entry.lid : '');
        log('opening overstudy in a background tab:', url);
        chrome.runtime.sendMessage({ type: 'clo-open-overstudy', url });
      });
      return btn;
    }

    const pollTimer = setInterval(tick, CONFIG.review.pollMs);
    window.addEventListener('pagehide', () => clearInterval(pollTimer));
    // Keep the board anchoring snappy between ticks.
    window.addEventListener('resize', positionWidget);
    window.addEventListener('scroll', positionWidget, true);
    tick();
    log('review overstudy watcher active (top document)');
  }

  // ==========================================================================
  // 10) Auto-pause for background overstudy tabs (top document, /learn/…)
  //
  // Overstudy tabs open with active:false, but the session's timer starts as
  // soon as the player loads. If a learn session boots while this document is
  // HIDDEN (a background tab — ours or any other), click Chessable's own
  // pause-timer footer control once it renders. Their native paused UI takes
  // over: the board dims behind a play overlay, which the user clicks to
  // resume when they actually switch to the tab. If the user focuses the tab
  // before the control appears, back off and leave the timer alone.
  // ==========================================================================
  function initOverstudyAutoPause() {
    if (!location.pathname.startsWith(CONFIG.review.learnPrefix)) return;
    if (!document.hidden) return; // foreground load — user is already watching

    const startedAt = Date.now();
    const pollTimer = setInterval(() => {
      if (!document.hidden) { clearInterval(pollTimer); return; } // user got here first
      if (Date.now() - startedAt > CONFIG.bootTimeoutMs) { clearInterval(pollTimer); return; }
      const btn = [...document.querySelectorAll(SELECTORS.trainerIconBtn)]
        .find((el) => el.querySelector(SELECTORS.trainerPauseIcon));
      if (!btn) return; // player still booting
      clearInterval(pollTimer);
      btn.click();
      log('background overstudy tab — paused the session timer');
    }, CONFIG.bootPollMs);
    window.addEventListener('pagehide', () => clearInterval(pollTimer));
  }

  // ==========================================================================
  // 11) Review-mode Lichess panel (top document — /practice/… and /learn/…)
  //
  // Once a variation is completed, MoveTrainer2 enters a browse state: the
  // comment panel lists the moves (clickable, prev/next buttons under the
  // board) and a "Completed" stats block appears. Only then does the panel
  // show — never during an active quiz, where it would spoil the answer.
  //
  // There is no #inputFEN in the trainer, so readReviewFen() rebuilds the FEN
  // from the DOM: piece placement from the board squares' [data-piece] divs,
  // side to move + move number by parsing the SAN numbering around the
  // currently shown move (SELECTORS.reviewMoveShown / reviewSubMoveShown;
  // neither present = the variation's initial position). Two approximations,
  // both fine for explorer statistics: castling rights are inferred from king
  // and rook standing on their home squares (over-grants after a piece moves
  // away and back), and the en-passant field is always "-".
  //
  // Everything else — debounce, fetch, cache, 429/401 handling, rendering —
  // is the shared machinery of sections 2–8 running with IS_REVIEW branches.
  // The 500 ms tick below is this mode's watchdog: it mounts/hides the panel,
  // re-positions it under the board (fixed, like the overstudy widget), and
  // detects position changes by comparing the derived FEN.
  // ==========================================================================

  async function initReviewPanel() {
    state.hidden = await loadHiddenPref();
    state.engineEnabled = await loadEnginePref();
    chrome.storage.onChanged.addListener(onStorageChanged);
    chrome.runtime.onMessage.addListener(onEngineMessage);
    document.addEventListener('visibilitychange', onVisibilityChange);
    setInterval(reviewPanelTick, CONFIG.review.pollMs);
    window.addEventListener('resize', centerReviewBoard); // also matters mid-quiz, panel hidden
    window.addEventListener('resize', positionReviewPanel);
    window.addEventListener('scroll', positionReviewPanel, true);
    reviewPanelTick();
    log('review Lichess panel watcher active (top document)');
  }

  function reviewPanelTick() {
    // Independent of the panel: the board stays centered for the WHOLE trainer
    // session, so it never jumps when a variation completes.
    centerReviewBoard();
    if (!reviewBrowseReady()) {
      if (state.panel) state.panel.hidden = true;
      state.fen = null; // the next completed variation starts with a fresh fetch
      syncEngine();     // leaving the browse state stops any running search
      return;
    }
    if (!state.panel || !state.panel.isConnected) mountPanel(); // idempotent self-heal
    if (!state.panel) return;
    state.panel.hidden = false;
    positionReviewPanel();
    const fen = readFen();
    if (fen && fen !== state.fen) scheduleRefresh();
  }

  /** The browse state exists only after completion (progress block + move list). */
  function reviewBrowseReady() {
    return Boolean(document.querySelector(SELECTORS.reviewProgress) &&
                   document.querySelector(SELECTORS.reviewMoves) &&
                   getReviewBoard());
  }

  function getReviewBoard() {
    const wrap = document.querySelector(SELECTORS.reviewBoardWrap);
    return (wrap || document).querySelector(SELECTORS.board);
  }

  /**
   * Anchors the panel in the empty gutter LEFT of the board, top-aligned with
   * it, whenever that gutter is wide enough (CONFIG.review.panelMinWidth plus
   * margins); otherwise falls back to the original spot beneath the board,
   * below the overstudy widget (or the Exit/nav footer when the widget is
   * hidden) — and beneath the ENTIRE trainer row when the comment column is
   * stacked under the board (portrait/mobile), so the panel never covers
   * Chessable's own UI. The gutter also holds Chessable's collapsible variation drawer —
   * when that is open the panel simply overlays it (z-index 99999).
   * position:fixed + getBoundingClientRect are both viewport-relative, so the
   * coordinates line up directly; the 500 ms tick plus resize/scroll listeners
   * keep them fresh. Remaining viewport height caps the panel; the body
   * scrolls internally (see .clo-panel--review in lichessable.css).
   */
  function positionReviewPanel() {
    if (!IS_REVIEW || !state.panel || state.panel.hidden) return;
    centerReviewBoard(); // keep the shift fresh on resize/scroll before measuring
    const board = getReviewBoard();
    if (!board) return;
    const rect = board.getBoundingClientRect();
    if (!rect.width) return;
    const gap = CONFIG.review.panelGap;
    const gutter = rect.left - gap * 2; // usable width left of the board
    if (gutter >= CONFIG.review.panelMinWidth) {
      const width = Math.round(Math.min(gutter, CONFIG.review.panelMaxWidth));
      const top = Math.round(Math.max(gap, rect.top));
      state.panel.style.left = Math.round(rect.left - gap - width) + 'px';
      state.panel.style.top = top + 'px';
      state.panel.style.width = width + 'px';
      state.panel.style.maxHeight = Math.max(120, window.innerHeight - top - 12) + 'px';
      return;
    }
    let anchorBottom = rect.bottom;
    const footer = document.querySelector(SELECTORS.trainerFooter);
    const footerRect = footer ? footer.getBoundingClientRect() : null;
    if (footerRect && footerRect.height) anchorBottom = Math.max(anchorBottom, footerRect.bottom);
    const widget = document.getElementById(REVIEW_WIDGET_ID);
    const widgetRect = widget && !widget.hidden ? widget.getBoundingClientRect() : null;
    if (widgetRect && widgetRect.height) anchorBottom = Math.max(anchorBottom, widgetRect.bottom);
    // Portrait/mobile: the comment column WRAPS BELOW the board, so anchoring
    // under the board would overlay the comments/progress block — anchor under
    // the whole trainer row instead. Stacking is detected by the progress
    // block sitting under the board rather than beside it, so a desktop side
    // column that happens to run taller than the board keeps the old anchor.
    const progress = document.querySelector(SELECTORS.reviewProgress);
    const row = document.querySelector(SELECTORS.trainerRow);
    if (progress && row) {
      const progRect = progress.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      if (progRect.width && rowRect.height && progRect.left < rect.left + rect.width / 2) {
        anchorBottom = Math.max(anchorBottom, rowRect.bottom);
      }
    }
    const top = Math.round(anchorBottom + 10);
    const width = Math.round(Math.max(rect.width, 320));
    state.panel.style.left = Math.round(rect.left + (rect.width - width) / 2) + 'px';
    state.panel.style.top = top + 'px';
    state.panel.style.width = width + 'px';
    state.panel.style.maxHeight = Math.max(120, window.innerHeight - top - 12) + 'px';
  }

  /**
   * Chessable centers the WHOLE trainer row (board + comment column), which
   * leaves the board itself sitting left of the viewport centre. With our panel
   * in the left gutter the composition reads better with the BOARD centered, so
   * the row gets a translateX — a transform, never a layout property, so
   * Chessable's own sizing is untouched and one assignment fully reverts it.
   * Rects already include the current shift, hence the incremental `delta`;
   * because transforms don't reflow, this converges in a single tick. The
   * applied offset is read back off the element (not remembered in a variable)
   * so a React re-render that replaces the row simply re-centres from zero.
   *
   * Applied for the whole trainer session, quiz included — the target (board
   * centre = viewport centre) is state-independent, so completing a variation
   * never makes the board jump.
   */
  function centerReviewBoard() {
    const row = document.querySelector(SELECTORS.trainerRow);
    const board = getReviewBoard();
    if (!row || !board) return; // not a trainer page (any more) — nothing to undo
    const current = readRowShift(row);
    const boardRect = board.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const gap = CONFIG.review.panelGap;
    if (!boardRect.width || !rowRect.width) return;
    let next;
    if (rowRect.width > window.innerWidth - gap * 2) {
      next = 0; // no slack to play with — leave Chessable's layout alone
    } else {
      let delta = window.innerWidth / 2 - (boardRect.left + boardRect.width / 2);
      delta = Math.min(delta, window.innerWidth - gap - rowRect.right); // keep the comment column on screen
      delta = Math.max(delta, gap - rowRect.left);
      next = Math.round(current + delta);
    }
    if (next === current) return;
    row.style.transform = next ? `translateX(${next}px)` : '';
  }

  function readRowShift(row) {
    const m = /translateX\((-?[\d.]+)px\)/.exec(row.style.transform || '');
    return m ? Math.round(parseFloat(m[1])) : 0;
  }

  /** Full FEN from the trainer DOM, or null while the board is mid-render. */
  function readReviewFen() {
    const board = getReviewBoard();
    if (!board) return null;
    const turn = readReviewTurn();
    if (!turn) return null;
    const at = {}; // square name -> FEN piece letter, for the castling checks
    let whiteKings = 0, blackKings = 0;
    const ranks = [];
    for (let rank = 8; rank >= 1; rank--) {
      let row = '', empty = 0;
      for (const file of 'abcdefgh') {
        const name = file + rank;
        const squareEl = board.querySelector(SELECTORS.reviewSquare.replace('%s', name));
        if (!squareEl) return null; // board mid-render
        const pieceEl = squareEl.querySelector(SELECTORS.reviewPiece);
        const dp = pieceEl ? pieceEl.getAttribute('data-piece') : null;
        if (dp && /^[wb][PNBRQK]$/.test(dp)) {
          const ch = dp[0] === 'w' ? dp[1] : dp[1].toLowerCase();
          at[name] = ch;
          if (ch === 'K') whiteKings++;
          else if (ch === 'k') blackKings++;
          if (empty) { row += empty; empty = 0; }
          row += ch;
        } else {
          empty++;
        }
      }
      if (empty) row += empty;
      ranks.push(row);
    }
    // A move animation can briefly show a piece on two squares — skip the tick.
    if (whiteKings !== 1 || blackKings !== 1) return null;
    let castling = '';
    if (at.e1 === 'K') {
      if (at.h1 === 'R') castling += 'K';
      if (at.a1 === 'R') castling += 'Q';
    }
    if (at.e8 === 'k') {
      if (at.h8 === 'r') castling += 'k';
      if (at.a8 === 'r') castling += 'q';
    }
    return ranks.join('/') + ' ' + turn.side + ' ' + (castling || '-') + ' - 0 ' + turn.fullmove;
  }

  /**
   * Side to move + fullmove number for the position on the board, derived
   * from the currently shown move's place in its line. A shown subvariation
   * move takes precedence over the mainline marker; neither marker means the
   * initial position of the variation (the state Chessable's own
   * initial-position dot navigates to).
   */
  function readReviewTurn() {
    const shownSub = document.querySelector(SELECTORS.reviewSubMoveShown);
    if (shownSub) {
      const line = [...shownSub.parentElement.querySelectorAll(SELECTORS.reviewSubMoves)];
      return turnFromLine(line, shownSub);
    }
    const moves = [...document.querySelectorAll(SELECTORS.reviewMoves)];
    if (!moves.length) return null;
    const shown = document.querySelector(SELECTORS.reviewMoveShown);
    if (!shown) {
      const first = parseMoveNumber(moves[0].textContent);
      return first ? { side: first.black ? 'b' : 'w', fullmove: first.num } : null;
    }
    return turnFromLine(moves, shown);
  }

  /** "50." -> white's 50th; "50..." (or "50…") -> black's 50th; plain SAN -> null. */
  function parseMoveNumber(text) {
    const m = /^(\d+)\s*(\.{3}|…|\.)/.exec(text.trim());
    return m ? { num: Number(m[1]), black: m[2] !== '.' } : null;
  }

  /**
   * Walks back from the shown move to the nearest numbered one and converts
   * to a ply count — unnumbered moves (Black's replies, and continuation
   * moves after a comment) simply advance the ply by their distance.
   */
  function turnFromLine(line, shownEl) {
    const idx = line.indexOf(shownEl);
    for (let i = idx; i >= 0; i--) {
      const parsed = parseMoveNumber(line[i].textContent);
      if (!parsed) continue;
      const ply = (parsed.black ? 2 * parsed.num : 2 * parsed.num - 1) + (idx - i);
      return { side: ply % 2 ? 'b' : 'w', fullmove: Math.floor(ply / 2) + 1 };
    }
    return null; // no numbered move found — cannot trust a side-to-move guess
  }

  // ==========================================================================
  // 12) Quick-edit comment (review browse state ↔ background edit tab)
  //
  // In the review browse state, hovering a mainline move shows a pencil; the
  // popup appends a PGN comment to the real Chessable variation. There is no
  // JSON API for this — the only safe path is to drive Chessable's own edit
  // page (verified: several of its POST fields are session/CSRF-bound and
  // opaque). So background.js opens /explore/edit/<oid>/ in a background tab;
  // the driver below (running in that tab's mt1 edit iframe) clicks the target
  // move, appends to the "Comments After" textarea, sets the scope checkbox,
  // clicks "Update variation", and confirms Chessable's SweetAlert dialog —
  // which is what actually submits the full-variation form. Success is detected
  // when the form's POST lands the iframe on /mt1/explore/?edit=<oid>.
  //
  // Edit rights are a per-COURSE property. They are probed LAZILY: the pencil
  // shows without knowing them, and the probe (one throwaway background tab)
  // only runs when a popup is opened while rights are still unknown — the
  // popup's Save button stays disabled until the probe confirms them. The
  // result is cached per course per session; a known-uneditable course hides
  // the pencil again.
  // ==========================================================================

  /**
   * Normalises a review-panel move label (e.g. "8. d4", "4... Qxd5", "Qe6+!",
   * "Bd7=") to the SAN used in the edit page's element ids: the move-number
   * prefix is dropped, check/mate (+ #) and promotion (=Q) are kept, and
   * evaluation glyphs (!, ?, =, ±, …) are stripped — matching how Chessable
   * ids the moves in #interactivePGN.
   */
  function quickEditSan(text) {
    const t = String(text).trim().replace(/^\d+\s*(?:\.{3}|…|\.)\s*/, '');
    const m = /^(O-O-O|O-O|[KQRNB]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRNB])?[+#]?)/.exec(t);
    return m ? m[1] : null;
  }

  /**
   * Descriptor for a mainline move element: its 0-based PLY INDEX within the
   * variation plus its own SAN and colour (for verification). The move is
   * matched on the edit page BY POSITION, not by absolute move number: the edit
   * page renumbers each variation from move 1 (verified — a tactics puzzle shown
   * as "25. Qc2!" in review is "Qc2_w_1" on the edit page), while the review
   * panel keeps the source game's numbering. The review commentMove list and
   * the edit page's #interactivePGN list are the same mainline in the same
   * order, so index N maps to index N. Colour still comes from turnFromLine
   * (correct regardless of the absolute number).
   */
  function reviewMoveDescriptor(el) {
    const moves = [...document.querySelectorAll(SELECTORS.reviewMoves)];
    const plyIndex = moves.indexOf(el);
    if (plyIndex < 0) return null;
    const turn = turnFromLine(moves, el);
    if (!turn) return null;
    const san = quickEditSan(el.textContent);
    if (!san) return null;
    const color = turn.side === 'w' ? 'b' : 'w';
    return { san, color, plyIndex };
  }

  /**
   * Same descriptor from the standalone variation page, where Chessable hands
   * us everything directly: the move div's id IS the 0-based ply index and its
   * class carries the colour, so no move-number parsing is involved.
   */
  function variationMoveDescriptor(el) {
    const plyIndex = Number(el.id);
    if (!Number.isInteger(plyIndex) || plyIndex < 0) return null;
    const san = quickEditSan(el.textContent);
    if (!san) return null;
    return { san, color: el.classList.contains('whiteMove') ? 'w' : 'b', plyIndex };
  }

  /** Current variation id in the review browse state (marker row, then link). */
  function readQuickEditOid() {
    const marker = document.querySelector(SELECTORS.reviewCurrentMarker);
    const row = marker && marker.parentElement;
    const oid = row && row.getAttribute(SELECTORS.reviewRowVidAttr);
    if (oid && oid !== '0') return oid;
    const link = document.querySelector(SELECTORS.reviewTitleLink);
    const hm = link && /^\/variation\/(\d+)/.exec(link.getAttribute('href') || '');
    return hm && hm[1] !== '0' ? hm[1] : null;
  }

  const QUICK_EDIT_BID_RE = /^\/practice\/(\d+)/;
  function readQuickEditBid() {
    const m = QUICK_EDIT_BID_RE.exec(location.pathname);
    return m ? m[1] : null;
  }

  // --- driver (runs in the background edit tab's mt1 iframe) -----------------

  /**
   * Sets a React-controlled textarea's value so the framework notices: the
   * native value setter bypasses React's own value tracker, and the dispatched
   * input event then reaches its onChange (a bare `.value =` would be ignored).
   */
  function setReactTextareaValue(el, value) {
    const proto = Object.getPrototypeOf(el);
    const setter = Object.getOwnPropertyDescriptor(proto, 'value') &&
                   Object.getOwnPropertyDescriptor(proto, 'value').set;
    if (setter) setter.call(el, value);
    else el.value = value; // fallback: plain assignment
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function quickEditWaitFor(selector, timeoutMs) {
    return new Promise((resolve, reject) => {
      const found = document.querySelector(selector);
      if (found) return resolve(found);
      let observer = null, pollTimer = 0, timeoutTimer = 0;
      const finish = (el, err) => {
        if (observer) observer.disconnect();
        clearInterval(pollTimer);
        clearTimeout(timeoutTimer);
        el ? resolve(el) : reject(err);
      };
      observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) finish(el);
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      pollTimer = setInterval(() => {
        const el = document.querySelector(selector);
        if (el) finish(el);
      }, CONFIG.bootPollMs);
      timeoutTimer = setTimeout(() => finish(null, new Error('timeout: ' + selector)), timeoutMs);
    });
  }

  const quickEditDelay = (ms) => new Promise((r) => setTimeout(r, ms));

  /**
   * Called from start() only on the edit page. Asks the worker whether this
   * background tab was opened for a quick-edit job; if so, drives it and
   * returns true (so the caller skips the normal explore panel). Returns false
   * for a manual visit, so the normal panel still mounts.
   */
  async function runQuickEditDriverIfJob() {
    const m = /^\/mt1\/explore\/edit\/(\d+)\//.exec(location.pathname);
    if (!m) return false;
    const oid = m[1];
    let job;
    try {
      job = await chrome.runtime.sendMessage({ type: 'clo-quick-edit-claim', oid });
    } catch (err) {
      warn('quick-edit claim failed:', err);
      return false;
    }
    if (!job || !job.claimed) return false; // manual visit — let the normal panel boot
    log('quick-edit driver claimed job', job.mode, 'for variation', oid);
    driveQuickEdit(oid, job).catch((err) => {
      warn('quick-edit driver error:', err);
      try {
        chrome.runtime.sendMessage({
          type: 'clo-quick-edit-result', oid, mode: job.mode,
          ok: false, error: String((err && err.message) || err),
        }).catch(() => {});
      } catch (e) { /* worker gone */ }
    });
    return true;
  }

  async function driveQuickEdit(oid, job) {
    let hasForm = true;
    try {
      await quickEditWaitFor(SELECTORS.editInteractivePGN, CONFIG.quickEdit.bootTimeoutMs);
    } catch (err) {
      hasForm = false; // no edit form rendered ⇒ no edit rights on this course
    }

    if (job.mode === 'probe') {
      chrome.runtime.sendMessage({ type: 'clo-quick-edit-result', oid, mode: 'probe', ok: true, canEdit: hasForm }).catch(() => {});
      return;
    }

    if (!hasForm) throw new Error('edit form not available (no edit rights?)');

    // Match the move by POSITION (the edit page renumbers from move 1), then
    // verify SAN + colour against the element id to catch any list mismatch.
    const moveEls = [...document.querySelectorAll(SELECTORS.editInteractivePGN + ' div[id]')];
    const moveEl = moveEls[job.plyIndex];
    if (!moveEl) throw new Error(`move #${job.plyIndex} not found on the edit page (${moveEls.length} moves listed)`);
    const idm = /^(.+)_([wb])_\d+$/.exec(moveEl.id);
    if (!idm || idm[1] !== job.san || idm[2] !== job.color) {
      throw new Error(`move mismatch at #${job.plyIndex}: id "${moveEl.id}" vs expected ${job.san}/${job.color}`);
    }
    moveEl.click(); // selects the move; #moveComment updates synchronously
    await quickEditDelay(CONFIG.quickEdit.settleMs);

    const ta = document.querySelector(SELECTORS.editCommentAfter);
    if (!ta) throw new Error('comment field not found');
    const existing = ta.value || '';
    const next = existing.trim()
      ? existing + CONFIG.quickEdit.commentJoin + job.commentText
      : job.commentText;
    setReactTextareaValue(ta, next);

    const box = document.querySelector(SELECTORS.editVariationOnly);
    if (box && box.checked !== Boolean(job.forThisVariationOnly)) box.click();

    // Tell the worker we're about to submit, so the post-POST landing document
    // (/mt1/explore/?edit=<oid>) is recognised as this job's success.
    try { await chrome.runtime.sendMessage({ type: 'clo-quick-edit-submitting', oid }); } catch (e) { /* worker gone */ }

    const submitBtn = document.querySelector(SELECTORS.editSubmitButton);
    if (!submitBtn) throw new Error('submit button not found');
    submitBtn.click(); // fires addVariation() → SweetAlert confirm dialog

    // Chessable only serialises + POSTs the variation after the user confirms
    // the "Update variation?" dialog, so click its confirm button. The POST
    // then navigates the iframe; success is reported by the landing document.
    const confirmBtn = await quickEditWaitFor(SELECTORS.editConfirmButton, CONFIG.quickEdit.confirmTimeoutMs);
    confirmBtn.click();
  }

  /**
   * On any explore-frame boot, recognise the post-submit landing
   * (/mt1/explore/?edit=<oid>) of a quick-edit job and report success. Returns
   * true when handled (caller skips the normal panel boot in that throwaway
   * tab, which the worker closes anyway). Cheap: only pings the worker when an
   * ?edit= query param is actually present.
   */
  async function maybeReportQuickEditLanding() {
    const editParam = new URLSearchParams(location.search).get('edit');
    if (!editParam || !/^\d+$/.test(editParam)) return false;
    try {
      const res = await chrome.runtime.sendMessage({ type: 'clo-quick-edit-landing', oid: editParam });
      return Boolean(res && res.isOurs);
    } catch (err) {
      return false;
    }
  }

  // --- review-side UI (hover pencil + popup) ---------------------------------

  function initQuickEditUi() {
    const qe = {
      rightsByBid: new Map(), // bid -> boolean (edit rights), cached per session
      probing: new Set(),     // bids with a probe in flight
      pencil: null,
      popup: null,
      els: null,              // cached popup child refs
      pencilTarget: null,     // move element the pencil currently points at
      popupTarget: null,      // move element the open popup refers to
      hideTimer: 0,
      saving: false,
    };

    // Host adapter. The two pages that offer quick-edit differ ONLY in how
    // moves are found, how a move maps to a ply, where the variation id comes
    // from, and how edit rights become known. Everything below this — pencil,
    // popup, save round-trip, and the whole edit-page driver — is shared.
    const HOSTS = {
      review: {
        name: 'review browse state',
        moveSelector: SELECTORS.reviewMoves,
        ready: () => reviewBrowseReady(),
        oid: () => readQuickEditOid(),
        descriptor: (el) => reviewMoveDescriptor(el),
        bid: () => readQuickEditBid(),
        // The trainer DOM carries no ownership signal, so rights come from a
        // hidden-tab probe, run lazily on popup open. Tri-state: true / false
        // once probed, null while unknown.
        rights: () => {
          const bid = readQuickEditBid();
          if (!bid) return null;
          return qe.rightsByBid.has(bid) ? qe.rightsByBid.get(bid) : null;
        },
      },
      variation: {
        name: 'variation page',
        moveSelector: SELECTORS.variationMoves,
        ready: () => Boolean(document.querySelector(SELECTORS.variationMoves)),
        oid: () => {
          const m = VARIATION_PATH_RE.exec(location.pathname);
          return m ? m[1] : null;
        },
        descriptor: (el) => variationMoveDescriptor(el),
        bid: () => '',
        // No probe needed here: the page itself is the rights signal, since
        // Chessable only renders the "Edit Variation" link (Repertoire Admin
        // box) for a course you can actually edit. Never null.
        rights: () => Boolean(document.querySelector(SELECTORS.variationEditLink)),
      },
    };
    const host = IS_VARIATION_PAGE ? HOSTS.variation : HOSTS.review;

    function buildPencil() {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = QE_PENCIL_ID;
      btn.className = 'clo-qe-pencil';
      btn.title = 'Add a comment after this move';
      btn.textContent = '✎';
      btn.hidden = true;
      btn.addEventListener('mouseenter', cancelHide);
      btn.addEventListener('mouseleave', scheduleHide);
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (qe.pencilTarget) openPopup(qe.pencilTarget);
      });
      document.body.appendChild(btn);
      qe.pencil = btn;
    }

    function buildPopup() {
      const popup = document.createElement('div');
      popup.id = QE_POPUP_ID;
      popup.className = 'clo-qe-popup';
      popup.hidden = true;

      const moveLabel = document.createElement('div');
      moveLabel.className = 'clo-qe-move';

      const textarea = document.createElement('textarea');
      textarea.className = 'clo-qe-text';
      textarea.rows = 3;
      textarea.placeholder = 'Comment after this move…';

      const scopeLabel = document.createElement('label');
      scopeLabel.className = 'clo-qe-scope';
      const scopeBox = document.createElement('input');
      scopeBox.type = 'checkbox';
      scopeLabel.appendChild(scopeBox);
      scopeLabel.appendChild(document.createTextNode(' For this variation only'));

      const status = document.createElement('div');
      status.className = 'clo-qe-status';
      status.hidden = true;

      const actions = document.createElement('div');
      actions.className = 'clo-qe-actions';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'clo-qe-cancel';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', closePopup);
      const save = document.createElement('button');
      save.type = 'button';
      save.className = 'clo-qe-save';
      save.textContent = 'Save';
      save.addEventListener('click', doSave);
      actions.append(cancel, save);

      popup.append(moveLabel, textarea, scopeLabel, status, actions);
      // Keep the pencil alive while the pointer is inside the popup.
      popup.addEventListener('mouseenter', cancelHide);
      // MoveTrainer2 binds single-key shortcuts ("n" = next variation, space,
      // …) on document in the BUBBLE phase and does NOT skip them while a text
      // field has focus — so typing a comment would drive the trainer. Swallow
      // key events here, once they have already reached their target inside the
      // popup: the default action (inserting the character) still happens, but
      // they never bubble on to Chessable's listeners. Bubble-phase is enough —
      // verified live that a capture-phase guard is not needed.
      for (const type of ['keydown', 'keypress', 'keyup']) {
        popup.addEventListener(type, (e) => {
          e.stopPropagation();
          if (type === 'keydown' && e.key === 'Escape' && !qe.saving) closePopup();
        });
      }
      document.body.appendChild(popup);

      qe.popup = popup;
      qe.els = { moveLabel, textarea, scopeBox, status, save, cancel };
    }

    function ensureElements() {
      if (!qe.pencil || !qe.pencil.isConnected) buildPencil();
      if (!qe.popup || !qe.popup.isConnected) buildPopup();
    }

    function cancelHide() { clearTimeout(qe.hideTimer); }
    function scheduleHide() {
      clearTimeout(qe.hideTimer);
      qe.hideTimer = setTimeout(() => {
        if (qe.pencil) qe.pencil.hidden = true;
        qe.pencilTarget = null;
      }, 200);
    }

    function showPencilFor(moveEl) {
      ensureElements();
      qe.pencilTarget = moveEl;
      cancelHide();
      const rect = moveEl.getBoundingClientRect();
      qe.pencil.style.left = Math.round(rect.right + 2) + 'px';
      qe.pencil.style.top = Math.round(rect.top - 2) + 'px';
      qe.pencil.hidden = false;
    }

    function openPopup(moveEl) {
      ensureElements();
      qe.popupTarget = moveEl;
      qe.saving = false;
      qe.els.moveLabel.textContent = 'After ' + moveEl.textContent.trim();
      qe.els.textarea.value = '';
      qe.els.scopeBox.checked = false; // matches Chessable's own default
      setStatus('', false);
      setSavingUi(false);
      const rect = moveEl.getBoundingClientRect();
      qe.popup.style.left = Math.round(Math.min(rect.left, window.innerWidth - 300)) + 'px';
      qe.popup.style.top = Math.round(rect.bottom + 6) + 'px';
      qe.popup.hidden = false;
      qe.pencil.hidden = true;
      applyRightsToPopup();
      qe.els.textarea.focus();
    }

    /**
     * Reflects the host's tri-state edit rights in the open popup: Save is
     * only enabled once rights are KNOWN true. Unknown rights (review host,
     * course not probed yet) trigger the hidden-tab probe now — this is the
     * only place a probe starts, so no tab ever opens before the user asks
     * to comment.
     */
    function applyRightsToPopup() {
      if (!qe.popup || qe.popup.hidden || qe.saving) return;
      const rights = host.rights();
      qe.els.save.disabled = rights !== true;
      if (rights === true) {
        setStatus('', false);
      } else if (rights === false) {
        setStatus("You don't have edit rights for this course.", true);
      } else {
        setStatus('Checking edit rights…', false);
        maybeProbe();
      }
    }

    function closePopup() {
      if (qe.popup) qe.popup.hidden = true;
      qe.popupTarget = null;
      qe.saving = false;
    }

    function setStatus(text, isError) {
      if (!qe.els) return;
      qe.els.status.textContent = text || '';
      qe.els.status.className = 'clo-qe-status' + (isError ? ' clo-error' : '');
      qe.els.status.hidden = !text;
    }

    function setSavingUi(busy) {
      if (!qe.els) return;
      qe.els.save.disabled = busy || host.rights() !== true;
      qe.els.cancel.disabled = busy;
      qe.els.textarea.disabled = busy;
      qe.els.scopeBox.disabled = busy;
      qe.els.save.textContent = busy ? 'Saving…' : 'Save';
    }

    function doSave() {
      if (qe.saving || !qe.popupTarget || host.rights() !== true) return;
      const text = qe.els.textarea.value.trim();
      if (!text) { setStatus('Enter a comment first.', true); return; }
      const desc = host.descriptor(qe.popupTarget);
      if (!desc) { setStatus('Could not identify the move.', true); return; }
      const oid = host.oid();
      if (!oid) { setStatus('Could not identify the variation.', true); return; }
      const bid = host.bid();
      qe.saving = true;
      setSavingUi(true);
      setStatus('Saving…', false);
      try {
        chrome.runtime.sendMessage({
          type: 'clo-quick-edit-run', mode: 'save', oid, bid,
          san: desc.san, color: desc.color, plyIndex: desc.plyIndex,
          commentText: text, forThisVariationOnly: qe.els.scopeBox.checked,
        }).catch(() => {});
      } catch (err) {
        qe.saving = false;
        setSavingUi(false);
        setStatus('Could not reach the extension worker.', true);
      }
    }

    function onResult(msg) {
      if (msg.mode === 'probe') {
        if (msg.bid) qe.probing.delete(msg.bid);
        if (msg.ok && msg.bid) {
          // Only a completed probe is cached — a timeout/error stays unknown
          // so the next popup open retries instead of locking the course out.
          qe.rightsByBid.set(msg.bid, Boolean(msg.canEdit));
          log('quick-edit rights for course', msg.bid, '=', Boolean(msg.canEdit));
          applyRightsToPopup();
        } else if (qe.popup && !qe.popup.hidden && !qe.saving) {
          setStatus('Could not check edit rights — close and retry.', true);
        }
        return;
      }
      // save result
      if (!qe.popup || qe.popup.hidden) return;
      qe.saving = false;
      setSavingUi(false);
      if (msg.ok) {
        setStatus('Saved.', false);
        setTimeout(() => { if (!qe.saving) closePopup(); }, 900);
      } else {
        setStatus(msg.error === 'another quick-edit is in progress'
          ? 'Another save is in progress — try again in a moment.'
          : 'Save failed or timed out — your text is kept, you can retry.', true);
      }
    }

    /** Starts the hidden-tab rights probe (review host only, once per course). */
    function maybeProbe() {
      const bid = host.bid();
      const oid = host.oid();
      if (!bid || !oid) return;
      if (qe.rightsByBid.has(bid) || qe.probing.has(bid)) return;
      qe.probing.add(bid);
      log('quick-edit: probing edit rights for course', bid);
      try {
        chrome.runtime.sendMessage({ type: 'clo-quick-edit-run', mode: 'probe', oid, bid }).catch(() => {});
      } catch (err) {
        qe.probing.delete(bid);
      }
    }

    function tick() {
      if (!host.ready()) {
        if (qe.pencil) qe.pencil.hidden = true;
        if (qe.popup && !qe.popup.hidden) closePopup();
      }
    }

    // Hover detection: read-only, never mutates Chessable's move list.
    document.addEventListener('pointerover', (e) => {
      const moveEl = e.target.closest && e.target.closest(host.moveSelector);
      if (!moveEl) return;
      // Unknown rights (null) still show the pencil — only a known-uneditable
      // course hides it. The popup's Save button is the real rights gate.
      if (!host.ready() || host.rights() === false) return;
      if (qe.popup && !qe.popup.hidden) return; // don't fight an open popup
      showPencilFor(moveEl);
    });
    document.addEventListener('pointerout', (e) => {
      const moveEl = e.target.closest && e.target.closest(host.moveSelector);
      if (moveEl) scheduleHide();
    });

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'clo-quick-edit-result') onResult(msg);
    });

    setInterval(tick, CONFIG.review.pollMs);
    tick();
    log('quick-edit UI active (' + host.name + ')');
  }

  // ==========================================================================
  // Kick-off ("document_idle" normally means the DOM is ready, but guard anyway)
  // ==========================================================================
  async function start() {
    if (IS_FRAME_APP) {
      // Recognise a quick-edit post-submit landing before anything else.
      if (await maybeReportQuickEditLanding()) return;
      // On the edit page, drive a pending quick-edit job (if this tab was
      // opened for one); otherwise fall through to the normal explore panel.
      if (IS_EDIT_PAGE && await runQuickEditDriverIfJob()) return;
      boot();
      return;
    }
    // The standalone variation page hosts ONLY the quick-edit UI — every other
    // top-document feature is MoveTrainer2 machinery whose gates never match
    // there, so don't start their pollers.
    if (IS_VARIATION_PAGE) { initQuickEditUi(); return; }
    // Top document: overstudy widget, background-tab auto-pause, review panel,
    // and the quick-edit hover UI.
    initReviewOverstudy();
    initOverstudyAutoPause();
    initReviewPanel();
    initQuickEditUi();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
