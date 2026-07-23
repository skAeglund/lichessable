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
 * It also adds a small "Overstudy" widget to Chessable's trainer sessions —
 * REVIEW (https://www.chessable.com/practice/…) and LEARN
 * (https://www.chessable.com/learn/…), which run the same MoveTrainer2 app
 * with identical markup. Those render in the TOP document (no mt1 iframe,
 * none of the explore widgets), so the widget is a separate, self-contained
 * module (section 9) that shares nothing with the panel machinery except
 * CONFIG and the log helpers.
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
    editVariationOnly:  '#specificAltMove', // "For This Variation Only" checkbox (comments AND alternatives read it)
    editSubmitButton:   '#submitButton',    // "Update variation" button (onclick=addVariation → swal confirm)
    editConfirmButton:  '.swal2-confirm',   // SweetAlert2 "Update" button that actually submits the form
    // Alternative moves (quick-edit alt mode — section 12). The add link has no
    // id or class, only its inline onclick; #altMoves holds one "alt_<n>" div
    // per alternative, each wrapping a <span>{san}</span> plus a Delete link.
    // The add flow's dialogs are SweetAlert2: instruction → confirm → the next
    // BOARD move is captured (doAddAltMove) → success/error dialog. The shown
    // container class scopes queries to the dialog actually open right now.
    editAltAddLink:     'a[onclick^="addAltMove"]', // "Add New Alternative Move"
    editAltList:        '#altMoves',                // rendered list of this move's alternatives
    editSwalShown:      '.swal2-container.swal2-shown', // the currently OPEN SweetAlert2 dialog

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
    // BOTH quick-edit hosts render a piece move's letter as an SVG figurine
    // (span class "commentMove__piece", data-piece="knight" …) — the move
    // TEXT alone reads "c6", so the SAN letter must be prepended from this
    // child before any SAN parsing (quickEditSanFromEl). Pawn moves and
    // castling carry no figurine.
    moveFigurine:      '[data-piece]',
    // The variation page ALSO has a #inputFEN (readonly, kept current by the
    // page on every move navigation — verified live), so the panel there reads
    // SELECTORS.fenInput like explore does; no DOM board reconstruction needed.
    // This is the fallback anchor when the gutter left of the board is too
    // narrow: the panel drops below ALL the page's content (FEN row, Review
    // box, Comments) rather than overlaying any of it.
    variationContent:  '#bodyContainer',

    // Auto-play (section 13). trainerMoveNote is only ever a VETO on recording
    // a move — if the testid or wording changes, the worst case is
    // over-cautious non-recording, never a wrong record. The two variation-page
    // entries feed the line oracle: a mainline move div may carry the key-move
    // class, and its piece letter is an SVG figurine whose span carries
    // data-piece ("knight", …) — the move text lacks the letter, so full SAN is
    // pieceLetter(data-piece) + text.
    trainerMoveNote:     '[data-testid="moveNotification"]', // "Incorrect" / "Time's up" / XP toast

    // Chapter edit page (/course/<bid>/<lid>/e/ — section 14): the toolbar row
    // holding "With selected: …" and Chessable's own "Order By" dropdown. Our
    // Sort button is only ANCHORED to it (mounted on document.body) — this is
    // the same React app that owns the trainer, so nothing of ours goes inside
    // their tree.
    chapterToolbar: '.variationSort',
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
      stackedMinSide: 250,      // less free width than this beside the board ⇒ the comment column must have wrapped under it
      holdUpMs: 1200,           // an UPWARD move of the below-the-board panel must persist this long before it is applied (anti-bounce)
    },

    // --- Optional local Stockfish (offscreen document, section 5b) ----------
    engine: {
      enabledKey: 'cloEngineEnabled', // chrome.storage.local; off by default
      buildKey:   'cloEngineBuild',   // chrome.storage.local; 'auto'|'full'|'lite' (options page)
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
      // Alt-move driver: after the instruction dialog is confirmed the edit
      // board steps BACK one move (its #inputFEN changes) before the
      // alternative can be played; after the two square presses Chessable
      // either lists the move in #altMoves or raises an error dialog.
      altStepBackTimeoutMs: 4000, // wait for the board to reach the pre-move position
      altResultTimeoutMs:   5000, // wait for #altMoves to list the move (or an error swal)
      // Touch has no hover: a tap fires pointerover (pencil shows) and the
      // finger lifting fires pointerout right after, whose 200 ms hide made
      // the pencil unhittable. After a TAP it stays up this long instead.
      touchPencilMs: 4000,
    },

    // --- Auto-play already-mastered moves in review (section 13) -----------
    autoPlay: {
      enabledKey: 'cloAutoPlayEnabled', // chrome.storage.local; off by default
      speedKey:   'cloAutoPlaySpeed',   // chrome.storage.local; 'fast'|'normal'|'relaxed'
      recordKey:  'cloAutoPlayRecord',  // chrome.storage.session; per-course position records
      recordTtlMs: 12 * 3600 * 1000,    // entries older than this are ignored and pruned
      // The two waits the speed setting owns. Everything else in a replayed
      // move's cycle belongs to Chessable and is not ours to shorten: ~440 ms
      // for our own move to reach the board (its animation lead-in plus the
      // ~200 ms glide) and ~480 ms for the trainer to answer it.
      //
      // `move` — pause before each auto-played move, counted from the board
      //   change that made it our turn, i.e. the same clock the trainer
      //   answers on (~480 ms measured live, hence 'normal').
      // `settle` — quiet time required instead whenever the trainer may still
      //   be auto-playing by itself (variation setup, Key-Moves prefix,
      //   solution replay), so the two never race. This is the wait at the
      //   START of a variation, and the one worth shortening if replays feel
      //   slow to get going. Keep it above ~450 ms: that is how long a single
      //   animated trainer move occupies the board, so a lower floor could
      //   let an injection land mid-burst.
      speeds: {
        fast:    { move: 0,   settle: 500 },
        normal:  { move: 450, settle: 700 },
        relaxed: { move: 900, settle: 900 },
      },
      defaultSpeed: 'normal',
      injectVerifyMs: 2500,    // an injected move must land within this, else manual for the position
      pointerWindowMs: 3000,   // trusted pointer input this recent ⇒ the user played the move
      saveDebounceMs: 800,     // record writes are debounced
      statusFlashMs: 2500,     // lifetime of the transient status chips
      pageStateTimeoutMs: 1500, // wait for content/pagestate.js to answer a line request
      oracleRetryMs: 400,      // back-off before re-reading the plan (trainer mid-variation-swap)
      oracleMaxTries: 6,       // consecutive unusable reads before the variation goes manual
    },

    // --- Wrong-guess alternative check (section 15) ------------------------
    // After an Incorrect answer in a trainer quiz (/practice/ review sessions
    // AND /learn/ overstudy tabs), a chip offers to engine-check the refused
    // move as a candidate alternative: two tagged depth-capped searches (the
    // quiz position for the engine best, the position after the guess for the
    // guess itself), then a colour-coded "Add alternative" button that reuses
    // the quick-edit alt-move driver.
    altCheck: {
      targetDepth: 20,           // both searches end here (profile depth is the ceiling)
      thresholds: { green: 0.2, yellow: 0.4 }, // pawn loss vs the course move
      mateCp: 10000,             // centipawn stand-in for mate scores (minus mate distance)
      noteGraceMs: 2500,         // Incorrect note seen this recently still counts at capture time
      searchTimeoutMs: 120000,   // whole-check watchdog (boot + two searches)
      oracleWaitMs: 300,         // poll while the line oracle is still 'pending' at capture time
      // A refused move is often NEVER committed to the board DOM (review mode
      // animates it straight back), so the primary capture is pointer-based:
      // the last two distinct board squares the user touched, taken while the
      // Incorrect note is up, are the refused move — if this recent.
      guessPairWindowMs: 5000,
      dbMovesLimit: 50,          // explorer moves for the popup's win-rate lookup — deep
                                 // enough that a rare refused move still has an entry
      dbCacheMax: 30,            // popup win-rate responses kept (keyed like the panel LRU)
    },

    // --- Sort variations in a chapter (section 14) -------------------------
    // The ONLY feature that talks to Chessable's own JSON API. It is same-origin
    // with the page (so no host permission) and authenticated with the page's
    // own session JWT as a Bearer token — no CSRF field is involved, unlike the
    // variation edit form that section 12 has to drive through a real tab.
    chapterSort: {
      // localStorage key holding the session JWT the page itself sends.
      jwtKey:    'chessable.web.production.JWT',
      readPath:  '/api/v1/editVariations', // GET  ?bid&lid&includeDeleted&locale → { data: { variations[] } }
      writePath: '/api/v1/saveOrder',      // POST { bid, lid, order: [oid…] }    → { data: { status } }
      pollMs:         500, // mount/position watchdog (also catches SPA chapter switches)
      gap:            12,  // breathing room from the toolbar / viewport edge
      minGutter:      210, // narrower gutter left of the column → fixed-corner fallback
      reloadDelayMs:  900, // let the success message register before reloading

      // Sibling branches are ordered by how often the move is actually played,
      // from the same Lichess explorer (and the same CONFIG.lichess rating and
      // speed filters) the panel uses.
      popularity: {
        requestGapMs: 300,             // politeness pause between uncached explorer calls
        cacheKey:     'cloPopularityCache', // chrome.storage.local: FEN → move counts
        cacheMax:     3000,            // entries kept; oldest pruned first
        // Chapters of one repertoire share their early positions, so the cache
        // pays for itself across a course, not just on a re-run.
      },
    },
  };

  const PANEL_ID = 'lichessable-panel';
  const REVIEW_WIDGET_ID = 'lichessable-review'; // overstudy widget (section 9); the review panel anchors below it
  const QE_PENCIL_ID = 'lichessable-qe-pencil';  // quick-edit hover pencil (section 12)
  const QE_POPUP_ID  = 'lichessable-qe-popup';   // quick-edit comment popup (section 12)
  const QE_SHIELD_ID = 'lichessable-qe-shield';  // "Saving…" cover in the driver popup window (section 12)
  const CHAPTER_WIDGET_ID = 'lichessable-chapter'; // chapter sort button (section 14)
  const AC_CHIP_ID  = 'lichessable-ac-chip';  // wrong-guess check chip (section 15)
  const AC_POPUP_ID = 'lichessable-ac-popup'; // wrong-guess check popup (section 15)

  const log  = (...a) => console.log(CONFIG.logPrefix, ...a);
  const warn = (...a) => console.warn(CONFIG.logPrefix, ...a);

  // Shared chess helpers. CloSan indexes squares 0..63 from a1, so square 0 is
  // a1 and 63 is h8. Used by auto-play (section 13) and the chapter sort
  // (section 14) — keep one copy.
  const SQ_FILES = 'abcdefgh';
  const squareName = (i) => SQ_FILES[i & 7] + ((i >> 3) + 1);
  const squareIndexOf = (name) => (name.charCodeAt(1) - 49) * 8 + (name.charCodeAt(0) - 97);
  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  /**
   * Full FEN after playing `uci` on `preFen`, with the halfmove clock reset on
   * a pawn move or capture (CloSan's position model drops the clock, so it is
   * recomputed from the pre-FEN here). Null when the move is illegal or the
   * FEN unparseable. Used by the alt check for both the guessed move and the
   * course move, so the two engine searches are built the same way.
   */
  function fenAfterUci(preFen, uci) {
    if (typeof CloSan === 'undefined') return null;
    const pos = CloSan.parseFen(preFen);
    const mv = pos && CloSan.uciToMove(pos, uci);
    if (!mv) return null;
    const isPawn = (pos.board[mv.from] || '').toUpperCase() === 'P';
    const isCapture = Boolean(pos.board[mv.to]) || (isPawn && mv.to === pos.ep);
    const preHalf = Number(preFen.trim().split(/\s+/)[4]);
    const postHalf = (isPawn || isCapture) ? 0 : (Number.isInteger(preHalf) ? preHalf : 0) + 1;
    return CloSan.fenFromPos(CloSan.makeMove(pos, mv), postHalf);
  }

  /**
   * UCI string for the legal move whose SAN matches `san` on `pos` (check/mate
   * glyphs ignored on both sides), or null. The reverse of CloSan.moveToSan —
   * used to turn the lesson plan's mainline SAN into a playable move.
   */
  function sanToUci(pos, san) {
    if (typeof CloSan === 'undefined' || !pos) return null;
    const want = String(san).replace(/[+#]+$/, '');
    for (const mv of CloSan.generateMoves(pos)) {
      const uci = squareName(mv.from) + squareName(mv.to) + (mv.promo || '');
      const got = CloSan.moveToSan(pos, uci);
      if (got && got.replace(/[+#]+$/, '') === want) return uci;
    }
    return null;
  }

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

  // Trainer-session path test, evaluated per call (SPA navigation changes the
  // path without a load). /practice/ review sessions and /learn/ sessions
  // (first-time learning AND overstudy tabs) run the SAME MoveTrainer2 app
  // with the same markup — drawer marker, .row-practice, header title, board,
  // footer, all ground-truthed live 2026-07-23 — so every trainer feature
  // (overstudy widget, auto-play, alt check) treats the two identically.
  const isTrainerPath = () =>
    location.pathname.startsWith(CONFIG.review.pathPrefix) ||
    location.pathname.startsWith(CONFIG.review.learnPrefix);

  /**
   * False once this content script has been ORPHANED by an extension reload:
   * chrome.runtime.id disappears and every chrome.* call throws "Extension
   * context invalidated". The auto-play module stands down on its own via
   * noteDeadContext (its chrome calls throw); anything that starts a NEW
   * chrome-dependent flow from user input (the alt-check popup) must check
   * this first, or it silently waits forever for replies that cannot come.
   */
  function extensionAlive() {
    try {
      return Boolean(chrome.runtime && chrome.runtime.id);
    } catch (err) {
      return false;
    }
  }

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
    engineBuild: 'auto',  // 'auto' | 'full' | 'lite' (persisted; options page)
    engineFen: null,      // FEN last sent to the engine (dedup / stop bookkeeping)
    lastEngineMsgAt: 0,   // last engine update/status received (silence diagnostics)
    enginePingTimer: 0,   // pending silence check after an analyze
    altCheckBusy: false,  // the alt check owns the engine (section 15) — syncEngine stands down
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
    state.engineBuild = await loadEngineBuildPref();
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
    // Build choice saved on the options page: restart any running search on
    // the newly selected build, no reload needed.
    if (changes[CONFIG.engine.buildKey]) {
      state.engineBuild = normalizeEngineBuild(changes[CONFIG.engine.buildKey].newValue);
      if (state.engineFen) {
        log('engine build changed to', state.engineBuild, '— restarting analysis');
        state.engineFen = null; // force a fresh analyze carrying the new profile
      }
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
    // The trainer has no #inputFEN, so review derives the FEN from the DOM
    // (section 11) — but the standalone variation page, though also a top
    // document, DOES have one (readonly, updated on every move navigation),
    // so it falls through to the normal input read (section 11b).
    if (IS_REVIEW && !IS_VARIATION_PAGE) return readReviewFen();
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

  async function fetchExplorerData(fen, movesLimit) {
    const params = new URLSearchParams({
      variant: CONFIG.lichess.variant,
      fen, // full FEN from #inputFEN; URLSearchParams handles the encoding
      speeds: CONFIG.lichess.speeds.join(','),
      ratings: CONFIG.lichess.ratings.join(','),
      moves: String(movesLimit || CONFIG.lichess.movesLimit),
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
    // Chessable's React tree — absolutely positioned next to / under the
    // board in document coordinates (section 11).
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

  // Input device the HUMAN is actually using, learned from their own trusted
  // pointer events; null until one is seen. Touch CAPABILITY is not touch USE:
  // a Windows laptop with a touchscreen reports maxTouchPoints 10 while the
  // board is being driven with a mouse, and `maxTouchPoints` alone therefore
  // sent such a machine down the touch path (v0.18.8) — where MoveTrainer2 is
  // left with a stale selection and the piece of the last injected move can no
  // longer be picked up. Ask the pointer events instead: they carry the real
  // device, and any tap/click anywhere in this frame (the auto-play toggle, a
  // move, the page itself) settles it long before an injection runs.
  let observedPointerType = null; // 'mouse' | 'pen' | 'touch'

  for (const type of ['pointerdown', 'pointermove']) {
    document.addEventListener(type, (e) => {
      if (e.isTrusted && e.pointerType && e.pointerType !== observedPointerType) {
        observedPointerType = e.pointerType;
        applyTouchUiClass(); // the human's first real input can flip the opening guess
      }
    }, { capture: true, passive: true });
  }

  /** True when a synthesised finger TAP — not a mouse click — is what this
   *  board's live handlers are listening for (see pressSquareTouch). */
  function useTouchInput() {
    if (observedPointerType) return observedPointerType === 'touch';
    // Nothing observed yet: a device with touch and no fine pointer at all is
    // a phone/tablet; anything with a mouse available keeps the desktop path.
    return Boolean(navigator.maxTouchPoints) && !matchMedia('(any-pointer: fine)').matches;
  }

  // --- touch-sized UI --------------------------------------------------------
  // Phones and tablets get a slightly larger type/tap-target scale for every
  // widget this extension owns; the rules live behind `html.clo-touch` at the
  // end of lichessable.css. This is a SEPARATE question from useTouchInput()
  // above — that one decides which event flavour the board's handlers are
  // listening for and is load-bearing for move injection, so it stays exactly
  // as it is; guessing wrong here only means type is the wrong size for a
  // moment, so this one may guess early and cheaply.
  //
  // Chrome's "Desktop site" setting is designed to be invisible to the page:
  // it rewrites navigator.userAgent, reports the UA-CH `mobile` hint as false,
  // and widens the layout viewport to ~980 CSS px. So the user agent, the UA
  // hints and window.innerWidth can ALL be lying, and any check built on them
  // reads a desktop-mode phone as a desktop. Input capability is not spoofed,
  // which leaves two signals worth trusting:
  //   * `(pointer: coarse)` — the PRIMARY pointer, so a touchscreen laptop
  //     driven with a mouse still reads as fine (`any-pointer: coarse` would
  //     not). This is only the opening guess: some Android builds have been
  //     reported to claim a fine pointer as well, and a phone with a Bluetooth
  //     mouse keeps reporting coarse.
  //   * the human's own trusted pointerType, which settles it for good on
  //     their first tap or click anywhere in this frame — the same ground
  //     truth the injection path relies on, verified on Android in Desktop
  //     site mode (v0.18.9).
  // Both frames matter: the panel lives in the mt1 iframe, the review widgets
  // in the top document, and each runs its own copy of this script — so each
  // sets the class on its OWN <html>.
  function wantsTouchUi() {
    if (observedPointerType) return observedPointerType === 'touch';
    return matchMedia('(pointer: coarse)').matches;
  }

  function applyTouchUiClass() {
    const root = document.documentElement;
    if (root) root.classList.toggle('clo-touch', wantsTouchUi());
  }

  applyTouchUiClass();
  // A mouse plugged into a tablet (or unplugged from one) changes the primary
  // pointer without any input from the user; re-evaluate rather than wait.
  matchMedia('(pointer: coarse)').addEventListener('change', applyTouchUiClass);

  function pressSquare(el) {
    const rect = el.getBoundingClientRect();
    const clientX = rect.x + rect.width / 2;
    const clientY = rect.y + rect.height / 2;

    // Desktop path — kept byte-for-byte as it was. With a mouse as the input
    // device Chessable's board consumes this plain pointer/mouse click sequence
    // directly, so nothing about the desktop experience changes.
    if (!useTouchInput()) {
      const opts = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX,
        clientY,
        button: 0,
      };
      for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
        el.dispatchEvent(type.startsWith('pointer')
          ? new PointerEvent(type, opts)
          : new MouseEvent(type, opts));
      }
      return;
    }

    // Touch path — on a device actually being TAPPED (an Android phone/tablet,
    // Chrome's "Desktop site" mode included) the board's
    // live input handlers are the touch / pointer(touch) ones; the mouse-only
    // sequence above reaches nothing, which is why click-to-play and auto-play
    // replays did not register on mobile. Replay a genuine finger tap: the same
    // event set a real tap emits, in the same order. Whichever API the board
    // listens on fires — and only ONCE, because a board binds exactly one of
    // pointer/touch/click for a tap (otherwise every real tap would move twice).
    pressSquareTouch(el, clientX, clientY);
  }

  /**
   * Synthesises a finger tap on one square: pointer(touch) down/up, the matching
   * touchstart/touchend, then the compatibility mouse+click a non-preventing tap
   * also produces. Fully synchronous, so a from-tap then a to-tap issued by the
   * caller stay in the SAME task — the property MoveTrainer2 relies on to animate
   * the move (and keep the selection unpainted) instead of reading it as a drag.
   */
  function pressSquareTouch(el, clientX, clientY) {
    const base = { bubbles: true, cancelable: true, view: window, clientX, clientY };
    const pointer = (type, down) => new PointerEvent(type, {
      ...base,
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      width: 23,
      height: 23,
      button: 0,
      buttons: down ? 1 : 0,
      pressure: down ? 0.5 : 0,
    });
    const mouse = (type, down) => new MouseEvent(type, {
      ...base,
      button: 0,
      buttons: down ? 1 : 0,
    });

    el.dispatchEvent(pointer('pointerdown', true));
    dispatchTouch(el, 'touchstart', clientX, clientY);
    el.dispatchEvent(pointer('pointerup', false));
    dispatchTouch(el, 'touchend', clientX, clientY);
    // A tap that isn't preventDefault()ed also emits these; a board that acts on
    // touch/pointer ignores them, one that acts on the synthesised click gets it.
    el.dispatchEvent(mouse('mousedown', true));
    el.dispatchEvent(mouse('mouseup', false));
    el.dispatchEvent(mouse('click', false));
  }

  /** One TouchEvent with a single Touch at the given point; no-op if the UA
   *  lacks the constructors (it won't on a touch-capable Chromium). */
  function dispatchTouch(el, type, clientX, clientY) {
    if (typeof Touch !== 'function' || typeof TouchEvent !== 'function') return;
    const touch = new Touch({
      identifier: 1,
      target: el,
      clientX,
      clientY,
      pageX: clientX + window.scrollX,
      pageY: clientY + window.scrollY,
      screenX: clientX,
      screenY: clientY,
      radiusX: 11.5,
      radiusY: 11.5,
      rotationAngle: 0,
      force: 1,
    });
    const active = type === 'touchend' ? [] : [touch];
    el.dispatchEvent(new TouchEvent(type, {
      bubbles: true,
      cancelable: true,
      touches: active,
      targetTouches: active,
      changedTouches: [touch],
    }));
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
   * Engine sizing profile for this device, sent with every analyze (the
   * offscreen document cannot see what device the tab is on — detection has
   * to happen here). 'auto' guesses from device signals; the options page's
   * Full/Lite choice overrides the guess.
   */
  function engineProfile() {
    if (state.engineBuild === 'full') return 'desktop';
    if (state.engineBuild === 'lite') return 'mobile';
    const lowPower = (navigator.userAgentData && navigator.userAgentData.mobile === true) ||
      (typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 4) ||
      (typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4);
    return lowPower ? 'mobile' : 'desktop';
  }

  /**
   * Single decision point, called from every relevant event (position change,
   * toggles, tab visibility, review browse state): analyze when the engine
   * should be running for the current position, stop when it should not.
   */
  function syncEngine() {
    // altCheckBusy: the alt check (section 15) is running its own tagged
    // searches — the panel must neither analyze over them nor stop them.
    // Its beginCheck nulls engineFen, so the !active branch is a no-op too.
    const active = state.engineEnabled && !state.hidden && !document.hidden &&
      !state.altCheckBusy &&
      Boolean(state.fen) && (!IS_REVIEW || (state.panel && !state.panel.hidden));
    if (active && state.fen !== state.engineFen) {
      state.engineFen = state.fen;
      if (state.ui) state.ui.engine.classList.add('clo-busy'); // dim until fresh lines land
      log('engine: sending analyze for', state.fen);
      engineSend({ type: 'clo-engine-analyze', fen: state.fen, profile: engineProfile() });
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
        const detail = String(msg.detail || '');
        // A missing vendored build gets an actionable note (the full detail
        // with the exact filename is in the warn above); no silent fallback
        // to the other build.
        state.ui.engineNote.textContent = detail.startsWith('missing-build')
          ? (detail.includes('lite') ? 'Lite' : 'Full') + ' engine files missing — see README'
          : 'Engine error — see the offscreen console.';
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

  function normalizeEngineBuild(value) {
    return value === 'full' || value === 'lite' ? value : 'auto';
  }

  async function loadEngineBuildPref() {
    try {
      const res = await chrome.storage.local.get(CONFIG.engine.buildKey);
      return normalizeEngineBuild(res[CONFIG.engine.buildKey]);
    } catch (err) {
      warn('storage read failed:', err);
      return 'auto';
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
  // 9) Trainer overstudy widget (top document, /practice/… and /learn/…)
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
    // fallback when the drawer row is unavailable. /learn/ sessions use the
    // same shape (/learn/<bid>/<oid|0>/<lid>) and the same drawer markup
    // (ground-truthed live 2026-07-23), so one regex serves both.
    const TRAINER_URL_RE = /^\/(?:practice|learn)\/(\d+)(?:\/(\d+))?(?:\/(\d+))?/;

    function readCurrentVariation() {
      const m = TRAINER_URL_RE.exec(location.pathname);
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
      const inReview = isTrainerPath(); // /practice/ review or /learn/ session
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
     * row) in DOCUMENT coordinates (viewport rect + scroll offset) — the
     * widget is position:absolute, same reasoning as the review panel: fixed
     * anchoring to scrolling content pops on mobile, absolute scrolls natively
     * and the tick/resize/scroll listeners only correct real layout changes
     * (setInlinePx skips unchanged values). When the comment column is
     * STACKED under the board (portrait/mobile) the spot below the footer is
     * occupied by Chessable's own comment header, so the widget drops below
     * the entire trainer row instead — and the review panel, which anchors
     * below the widget, follows. If the board isn't in the DOM the inline
     * styles are never set and the stylesheet's fallback applies.
     */
    function positionWidget() {
      if (!rs.widget || rs.widget.hidden) return;
      const board = document.querySelector(SELECTORS.board);
      if (!board) return;
      const rect = board.getBoundingClientRect();
      if (!rect.width) return;
      const footer = document.querySelector(SELECTORS.trainerFooter);
      const footerRect = footer ? footer.getBoundingClientRect() : null;
      let top = (footerRect && footerRect.height ? footerRect.bottom : rect.bottom) + 10;
      if (stackedTrainerLayout(rect)) {
        const row = document.querySelector(SELECTORS.trainerRow);
        const rowRect = row ? row.getBoundingClientRect() : null;
        if (rowRect && rowRect.height) top = Math.max(top, rowRect.bottom + 10);
      }
      rs.widget.style.right = 'auto';
      rs.widget.style.bottom = 'auto';
      rs.widget.style.transform = 'translateX(-50%)';
      setInlinePx(rs.widget, {
        left: rect.left + rect.width / 2 + window.scrollX,
        top: top + window.scrollY,
      });
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
  // re-positions it next to / under the board (absolute, in document
  // coordinates, like the overstudy widget — see positionReviewPanel), and
  // detects position changes by comparing the derived FEN.
  // ==========================================================================

  async function initReviewPanel() {
    state.hidden = await loadHiddenPref();
    state.engineEnabled = await loadEnginePref();
    state.engineBuild = await loadEngineBuildPref();
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
      resetReviewAnchorHold(); // a fresh show must never fight a stale hold
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
   * Writes rounded px values as inline styles, skipping properties whose value
   * is already what it should be. The skip is what keeps the fixed→absolute
   * positioning scheme calm: when the DOCUMENT scrolls, document coordinates
   * do not change, so the scroll listeners (kept as a safety net for inner
   * scroll containers) become measure-only no-ops instead of style thrash.
   */
  function setInlinePx(el, styles) {
    for (const prop of Object.keys(styles)) {
      const want = Math.round(styles[prop]) + 'px';
      if (el.style[prop] !== want) el.style[prop] = want;
    }
  }

  /**
   * True when Chessable's comment column is STACKED under the board
   * (portrait/mobile) rather than beside it. Preferred signal: the progress
   * block's left edge sitting under the board — but that block only exists in
   * the browse state, so outside it (quiz, study intro) the fallback is room:
   * a side column needs at least CONFIG.review.stackedMinSide px beside the
   * board, and less free width than that means it must have wrapped.
   */
  function stackedTrainerLayout(boardRect) {
    const progress = document.querySelector(SELECTORS.reviewProgress);
    if (progress) {
      const progRect = progress.getBoundingClientRect();
      if (progRect.width) return progRect.left < boardRect.left + boardRect.width / 2;
    }
    return window.innerWidth - boardRect.width < CONFIG.review.stackedMinSide;
  }

  // Anti-bounce for the below-the-board panel spot: at a variation transition
  // the trainer row collapses for a couple of renders (move list resets, the
  // progress block unmounts) BEFORE the browse gates flip false, so the shown
  // panel got yanked up for a tick and then hidden — visible as popping on
  // every new variation. An UPWARD move must therefore persist holdUpMs before
  // it is applied; downward moves apply immediately. Reset whenever the panel
  // hides or sits in the gutter, so a fresh show never fights a stale hold.
  const reviewAnchorHold = { top: null, upSince: 0 };

  function resetReviewAnchorHold() {
    reviewAnchorHold.top = null;
    reviewAnchorHold.upSince = 0;
  }

  function holdReviewPanelTop(top) {
    const hold = reviewAnchorHold;
    if (hold.top !== null && top < hold.top) {
      if (!hold.upSince) hold.upSince = Date.now();
      if (Date.now() - hold.upSince < CONFIG.review.holdUpMs) return hold.top;
    }
    hold.upSince = 0;
    hold.top = top;
    return top;
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
   *
   * The panel is position:absolute in DOCUMENT coordinates (viewport rect +
   * scroll offset), NOT fixed: a fixed element anchored to scrolling content
   * has to chase the page from scroll events, which lag the compositor on
   * mobile and made the panel visibly pop up and down. Absolute placement
   * scrolls natively with the trainer; the 500 ms tick plus resize/scroll
   * listeners only correct real layout changes (and cost nothing otherwise —
   * see setInlinePx). The height cap is likewise scroll-independent: gutter
   * mode fits the viewport below the board's DOCUMENT top, the stacked
   * fallback simply caps near one viewport height — the page scrolls down to
   * the panel, and the body scrolls internally (see .clo-panel--review in
   * lichessable.css).
   */
  function positionReviewPanel() {
    if (!IS_REVIEW || !state.panel || state.panel.hidden) return;
    centerReviewBoard(); // keep the shift fresh on resize/scroll before measuring
    const board = getReviewBoard();
    if (!board) return;
    const rect = board.getBoundingClientRect();
    if (!rect.width) return;
    const gap = CONFIG.review.panelGap;
    const sx = window.scrollX, sy = window.scrollY;
    const gutter = rect.left - gap * 2; // usable width left of the board
    if (gutter >= CONFIG.review.panelMinWidth) {
      resetReviewAnchorHold(); // gutter placement is stable; never hold stale fallback state
      const width = Math.min(gutter, CONFIG.review.panelMaxWidth);
      const docTop = Math.max(gap, rect.top + sy); // board's document top — scroll-independent
      setInlinePx(state.panel, {
        left: rect.left + sx - gap - width,
        top: docTop,
        width,
        maxHeight: Math.max(240, window.innerHeight - docTop - gap),
      });
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
    // the whole trainer row instead (the overstudy widget already sits below
    // it in this layout, and the widgetRect line above then puts the panel
    // below the widget). A desktop side column that happens to run taller
    // than the board keeps the old anchor — see stackedTrainerLayout.
    const row = document.querySelector(SELECTORS.trainerRow);
    const rowRect = row ? row.getBoundingClientRect() : null;
    if (rowRect && rowRect.height && stackedTrainerLayout(rect)) {
      anchorBottom = Math.max(anchorBottom, rowRect.bottom);
    }
    // Centered on the board, but never wider than the viewport and never off
    // its edges — on a phone the board IS the viewport width, minus margins.
    const width = Math.min(Math.max(rect.width, 320), window.innerWidth - gap * 2);
    const left = Math.min(Math.max(rect.left + (rect.width - width) / 2, gap),
                          window.innerWidth - width - gap);
    setInlinePx(state.panel, {
      left: left + sx,
      top: holdReviewPanelTop(anchorBottom + 10 + sy),
      width,
      maxHeight: Math.max(240, window.innerHeight - gap * 2),
    });
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
  // 11b) Lichess panel on the standalone variation page (/variation/<oid>/)
  //
  // Same panel, third host. The page is a React app (fibers verified on the
  // board), so the panel body-mounts absolutely in document coordinates
  // exactly like review mode — mountPanel() already does both for any top
  // document. Two things make this host SIMPLER than review: the page has a
  // real #inputFEN (readonly, rewritten on every move navigation — verified
  // live), so readFen() takes the ordinary input path instead of the DOM
  // board reconstruction; and there is no browse-state gate — the panel shows
  // whenever the board and the FEN input exist. Placement mirrors
  // positionReviewPanel's gutter-left-of-the-board spot, but the narrow
  // fallback anchors below ALL the page's content (SELECTORS.variationContent)
  // instead of below the board: unlike the trainer, this page has real
  // content under the board (FEN row, Review box, Comments) that an overlay
  // must not cover. No anti-bounce hold is needed — nothing here collapses
  // transiently the way the trainer row does at a variation transition.
  // Move rows are non-clickable (the IS_REVIEW branches already do that);
  // whether this board accepts injected free-play clicks is unverified.
  // ==========================================================================

  async function initVariationPanel() {
    state.hidden = await loadHiddenPref();
    state.engineEnabled = await loadEnginePref();
    state.engineBuild = await loadEngineBuildPref();
    chrome.storage.onChanged.addListener(onStorageChanged);
    chrome.runtime.onMessage.addListener(onEngineMessage);
    document.addEventListener('visibilitychange', onVisibilityChange);
    setInterval(variationPanelTick, CONFIG.review.pollMs);
    window.addEventListener('resize', positionVariationPanel);
    window.addEventListener('scroll', positionVariationPanel, true);
    // Move navigation rewrites the location hash (#/<move>/<side>) — a free
    // instant signal on top of the 500 ms poll.
    window.addEventListener('hashchange', scheduleRefresh);
    variationPanelTick();
    log('variation-page Lichess panel active (top document)');
  }

  function variationPanelReady() {
    return Boolean(document.querySelector(SELECTORS.fenInput) &&
                   document.querySelector(SELECTORS.board));
  }

  function variationPanelTick() {
    if (!variationPanelReady()) {
      if (state.panel) state.panel.hidden = true;
      state.fen = null;  // a re-rendered page starts with a fresh fetch
      syncEngine();      // no board — stop any running search
      return;
    }
    if (!state.panel || !state.panel.isConnected) mountPanel(); // idempotent self-heal
    if (!state.panel) return;
    state.panel.hidden = false;
    positionVariationPanel();
    const fen = readFen();
    if (fen && fen !== state.fen) scheduleRefresh();
  }

  /**
   * Gutter left of the board when it is wide enough (same thresholds as
   * review), otherwise centered on the board BELOW the whole content block —
   * document coordinates, absolute, height capped near the viewport with the
   * body scrolling internally (see .clo-panel--review in lichessable.css).
   */
  function positionVariationPanel() {
    if (!IS_VARIATION_PAGE || !state.panel || state.panel.hidden) return;
    const board = document.querySelector(SELECTORS.board);
    if (!board) return;
    const rect = board.getBoundingClientRect();
    if (!rect.width) return;
    const gap = CONFIG.review.panelGap;
    const sx = window.scrollX, sy = window.scrollY;
    const gutter = rect.left - gap * 2; // usable width left of the board
    if (gutter >= CONFIG.review.panelMinWidth) {
      const width = Math.min(gutter, CONFIG.review.panelMaxWidth);
      const docTop = Math.max(gap, rect.top + sy); // board's document top — scroll-independent
      setInlinePx(state.panel, {
        left: rect.left + sx - gap - width,
        top: docTop,
        width,
        maxHeight: Math.max(240, window.innerHeight - docTop - gap),
      });
      return;
    }
    // Narrow window: below everything (FEN row, Review box, Comments) — this
    // page has real content under the board that the panel must not cover.
    let anchorBottom = rect.bottom;
    const content = document.querySelector(SELECTORS.variationContent);
    const contentRect = content ? content.getBoundingClientRect() : null;
    if (contentRect && contentRect.height) anchorBottom = Math.max(anchorBottom, contentRect.bottom);
    const width = Math.min(Math.max(rect.width, 320), window.innerWidth - gap * 2);
    const left = Math.min(Math.max(rect.left + (rect.width - width) / 2, gap),
                          window.innerWidth - width - gap);
    setInlinePx(state.panel, {
      left: left + sx,
      top: anchorBottom + 10 + sy,
      width,
      maxHeight: Math.max(240, window.innerHeight - gap * 2),
    });
  }

  // ==========================================================================
  // 12) Quick-edit (review browse state ↔ background edit tab)
  //
  // In the review browse state, hovering a mainline move shows a pencil; the
  // popup has two tabs: append a PGN comment to the real Chessable variation,
  // or add an ALTERNATIVE MOVE the trainer should also accept. There is no
  // JSON API for either — the only safe path is to drive Chessable's own edit
  // page (verified: several of its POST fields are session/CSRF-bound and
  // opaque). So background.js opens /explore/edit/<oid>/ in a background tab;
  // the driver below (running in that tab's mt1 edit iframe) clicks the target
  // move, then either appends to the "Comments After" textarea (mode 'save')
  // or runs Chessable's add-alternative flow (mode 'alt' — see
  // driveQuickEditAltMove: the "Add New Alternative Move" link arms a
  // next-board-move capture behind a SweetAlert confirm, the board steps BACK
  // one move, and the alternative is PLAYED on the edit board with the
  // standard pressSquare recipe; Chessable itself validates legality — only a
  // board-accepted move ever reaches its handler — plus duplicates and
  // same-as-mainline, stores the SAN on the move's alt_white/alt_black list in
  // its page state, honouring the #specificAltMove checkbox read at store
  // time, and lists it in #altMoves, which is the isolated-world success
  // signal). Both modes end the same way: click "Update variation" and confirm
  // Chessable's SweetAlert dialog — which is what actually submits the
  // full-variation form. Success is detected when the form's POST lands the
  // iframe on /mt1/explore/?edit=<oid>. The alt SAN's legality is resolved
  // from the edit page's own #inputFEN (exact castling/en-passant, mid-game
  // tactics lines included), so the popup ships a bare SAN string and never
  // reconstructs a position. Promotion alternatives are refused (the edit
  // board's promotion picker is unverified). While the popup's alt tab is
  // open, clicking a Lichess panel move row prefills the SAN input.
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

  /** SANs compared ignoring a trailing check/mate glyph — Chessable and CloSan
   *  agree on the move but not always on writing "+". */
  const quickEditBareSan = (san) => String(san).replace(/[+#]$/, '');

  const QE_PIECE_LETTER = { king: 'K', queen: 'Q', rook: 'R', bishop: 'B', knight: 'N', pawn: '' };

  /**
   * SAN from a move ELEMENT. Both quick-edit hosts draw the piece letter as an
   * SVG figurine child (data-piece="knight" …) whose letter never appears in
   * the text — el.textContent of "2. ♘f3" is "2. f3" — so the letter is
   * re-attached after the move-number prefix is stripped. Elements without a
   * figurine (pawn moves, castling) pass through quickEditSan unchanged.
   */
  function quickEditSanFromEl(el) {
    const fig = el.querySelector(SELECTORS.moveFigurine);
    const letter = fig ? (QE_PIECE_LETTER[fig.getAttribute('data-piece')] || '') : '';
    if (!letter) return quickEditSan(el.textContent);
    const stripped = String(el.textContent).trim().replace(/^\d+\s*(?:\.{3}|…|\.)\s*/, '');
    return quickEditSan(letter + stripped);
  }

  /**
   * Which colour sits at the BOTTOM of a board, from two square elements —
   * the user's colour on both quick-edit hosts (Chessable orients the board
   * to the course colour). Null while the board is mid-render.
   */
  function boardBottomColor(a1El, h8El) {
    if (!a1El || !h8El) return null;
    const ra = a1El.getBoundingClientRect(), rh = h8El.getBoundingClientRect();
    if (!ra.height || !rh.height) return null;
    return ra.top > rh.top ? 'w' : 'b';
  }

  /**
   * Resolves `san` against a CloSan position to the legal {from, to, promo}
   * move it names, or null. Same generate-and-compare recipe as the chapter
   * sort's playSan: CloSan converts each legal move to SAN and the bare forms
   * are compared, so user input with or without "+"/"#" both match.
   */
  function quickEditResolveSan(pos, san) {
    const want = quickEditBareSan(san);
    for (const mv of CloSan.generateMoves(pos)) {
      const uci = squareName(mv.from) + squareName(mv.to) + (mv.promo || '');
      const got = CloSan.moveToSan(pos, uci);
      if (got && quickEditBareSan(got) === want) return mv;
    }
    return null;
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
    const san = quickEditSanFromEl(el);
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
    const san = quickEditSanFromEl(el);
    if (!san) return null;
    return { san, color: el.classList.contains('whiteMove') ? 'w' : 'b', plyIndex };
  }

  /** Current variation id in the review browse state (marker row, then link).
   *  A /learn/ overstudy tab has the id in its URL itself
   *  (/learn/<bid>/<oid>/<lid> — constant for the tab's whole session). */
  function readQuickEditOid() {
    const marker = document.querySelector(SELECTORS.reviewCurrentMarker);
    const row = marker && marker.parentElement;
    const oid = row && row.getAttribute(SELECTORS.reviewRowVidAttr);
    if (oid && oid !== '0') return oid;
    const link = document.querySelector(SELECTORS.reviewTitleLink);
    const hm = link && /^\/variation\/(\d+)/.exec(link.getAttribute('href') || '');
    if (hm && hm[1] !== '0') return hm[1];
    const lm = LEARN_IDS_RE.exec(location.pathname);
    return lm && lm[2] !== '0' ? lm[2] : null;
  }

  const QUICK_EDIT_BID_RE = /^\/practice\/(\d+)/;
  const LEARN_IDS_RE = /^\/learn\/(\d+)\/(\d+)/; // course id, variation id
  function readQuickEditBid() {
    const m = QUICK_EDIT_BID_RE.exec(location.pathname);
    if (m) return m[1];
    const lm = LEARN_IDS_RE.exec(location.pathname);
    return lm ? lm[1] : null;
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
   * Runs `fn` until it returns a truthy value (resolved) or `timeoutMs`
   * passes (resolves null — the CALLER decides what a timeout means, since
   * for the alt driver it may just mean "check for an error dialog instead").
   *
   * DOM mutations re-run the predicate IMMEDIATELY: MutationObserver is not
   * timer-throttled in a hidden tab, whereas setInterval is clamped to ~1 s
   * there — and the hidden edit tab is exactly where this runs. Every state
   * this driver waits for (board position, dialogs, the alt list) mutates the
   * DOM when it arrives, so chaining a dozen such waits stays fast without
   * the tab ever being focused; the interval is only a backstop for the
   * purely time-based predicates (boot stability).
   */
  function quickEditWaitUntil(fn, timeoutMs) {
    return new Promise((resolve) => {
      let observer = null, pollTimer = 0, timeoutTimer = 0;
      const finish = (value) => {
        if (observer) observer.disconnect();
        clearInterval(pollTimer);
        clearTimeout(timeoutTimer);
        resolve(value);
      };
      const check = () => {
        let value = null;
        try { value = fn(); } catch (err) { /* keep waiting */ }
        if (value) finish(value);
        return Boolean(value);
      };
      if (check()) return;
      observer = new MutationObserver(check);
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
      pollTimer = setInterval(check, 100);
      timeoutTimer = setTimeout(() => finish(null), timeoutMs);
    });
  }

  /** The confirm button of the SweetAlert2 dialog that is open RIGHT NOW —
   *  stale buttons from an already-closed dialog never match, because the
   *  shown-container class scopes the query. */
  const quickEditOpenConfirm = () =>
    document.querySelector(SELECTORS.editSwalShown + ' ' + SELECTORS.editConfirmButton);

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
    if (job.mode === 'alt') {
      // The alt flow does its own move click (after its board-ready gate) and
      // its own settling — a fixed delay here would only add a ~1 s clamped
      // timer in the hidden tab. 'already' = the alternative was saved on a
      // previous visit (the form renders stored alternatives on selection):
      // nothing to change, success without touching the variation at all.
      const outcome = await driveQuickEditAltMove(job, moveEl);
      if (outcome === 'already') {
        chrome.runtime.sendMessage({ type: 'clo-quick-edit-result', oid, mode: 'alt', ok: true }).catch(() => {});
        return;
      }
    } else {
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
    }

    // Tell the worker we're about to submit, so the post-POST landing document
    // (/mt1/explore/?edit=<oid>) is recognised as this job's success.
    try { await chrome.runtime.sendMessage({ type: 'clo-quick-edit-submitting', oid }); } catch (e) { /* worker gone */ }

    const submitBtn = document.querySelector(SELECTORS.editSubmitButton);
    if (!submitBtn) throw new Error('submit button not found');
    submitBtn.click(); // fires addVariation() → SweetAlert confirm dialog

    // Chessable only serialises + POSTs the variation after the user confirms
    // the "Update variation?" dialog, so click its confirm button. The POST
    // then navigates the iframe; success is reported by the landing document.
    // Scoped to the OPEN dialog: the alt flow has already shown and dismissed
    // other SweetAlerts in this document, and a stale hidden confirm button
    // must never be the one clicked.
    const confirmBtn = await quickEditWaitUntil(quickEditOpenConfirm, CONFIG.quickEdit.confirmTimeoutMs);
    if (!confirmBtn) throw new Error('update-confirm dialog did not appear');
    confirmBtn.click();
  }

  /** True when the selected move's rendered alternatives include `san`. */
  function quickEditAltListed(san) {
    const spans = document.querySelectorAll(SELECTORS.editAltList + ' span');
    return [...spans].some((s) => quickEditBareSan(s.textContent.trim()) === quickEditBareSan(san));
  }

  /**
   * Adds job.altSan as an alternative to the currently selected move by
   * driving Chessable's own add-alternative flow (ground-truthed live):
   * the add link arms the capture ("The next move you make on the board will
   * be added as an alternative"), confirming steps the board BACK one move,
   * and the next board move is recorded by doAddAltMove — which validates
   * duplicates and same-as-mainline itself and reports either in a dialog.
   * The move is played with the same pressSquare click recipe as everywhere
   * else; the edit board carries the standard square markup. Returns 'already'
   * when the alternative was stored on a previous visit (nothing to submit);
   * otherwise the caller submits the form normally.
   */
  async function driveQuickEditAltMove(job, moveEl) {
    const fenInput = document.querySelector(SELECTORS.fenInput);
    if (!fenInput) throw new Error('edit-page FEN input not found');

    // The driver starts as soon as #interactivePGN exists — BEFORE the edit
    // board has necessarily finished booting (the comment flow never noticed:
    // it only touches the React comment field). A move click on a half-booted
    // board does not navigate it, so first wait until the FEN input holds a
    // parseable value that has stopped changing (the boot navigates to move 1
    // on its own), THEN re-click the target move and require the position
    // AFTER it: side to move = the opponent of the move's colour. Side-based
    // checks stay valid on renumbered tactics lines, where the FEN's fullmove
    // number matches the source game rather than the edit page's numbering.
    const afterSide = job.color === 'w' ? 'b' : 'w';
    let lastFen = null, stableSince = 0;
    const ready = await quickEditWaitUntil(() => {
      const v = fenInput.value;
      if (!CloSan.parseFen(v)) { lastFen = null; return null; }
      if (v !== lastFen) { lastFen = v; stableSince = Date.now(); return null; }
      return Date.now() - stableSince >= 450 ? v : null;
    }, CONFIG.quickEdit.bootTimeoutMs);
    if (!ready) throw new Error('edit board did not finish loading');

    moveEl.click(); // idempotent re-select, now that the board is live
    const fenBefore = await quickEditWaitUntil(() => {
      const pos = CloSan.parseFen(fenInput.value);
      return pos && pos.side === afterSide ? fenInput.value : null;
    }, CONFIG.quickEdit.altStepBackTimeoutMs);
    if (!fenBefore) throw new Error('edit board did not reach the selected move');

    // Selecting the move rendered its stored alternatives — already listed
    // means already saved.
    if (quickEditAltListed(job.altSan)) return 'already';

    const addLink = document.querySelector(SELECTORS.editAltAddLink);
    if (!addLink) throw new Error('add-alternative link not found');
    addLink.click();

    const okBtn = await quickEditWaitUntil(quickEditOpenConfirm, CONFIG.quickEdit.confirmTimeoutMs);
    if (!okBtn) throw new Error('add-alternative dialog did not appear');
    // Keep the dialog's text: if the step-back never happens, this was most
    // likely a REFUSAL dialog rather than the arming instruction, and its
    // wording is the only diagnosis the closing hidden tab leaves behind.
    const armDialog = document.querySelector(SELECTORS.editSwalShown);
    const armText = armDialog ? armDialog.textContent.trim().replace(/\s+/g, ' ').slice(0, 160) : '';
    okBtn.click();

    // The board steps back to the position the alternative is played FROM;
    // its FEN is the ground truth the SAN is resolved against — exact
    // castling/en-passant state, tactics lines starting mid-game included.
    // Require the side to move to be the target move's colour, so a mid-boot
    // flicker can never be mistaken for the stepped-back position.
    const fenNow = await quickEditWaitUntil(() => {
      if (fenInput.value === fenBefore) return null;
      const pos = CloSan.parseFen(fenInput.value);
      return pos && pos.side === job.color ? fenInput.value : null;
    }, CONFIG.quickEdit.altStepBackTimeoutMs);
    if (!fenNow) {
      throw new Error('edit board did not step back to the pre-move position'
        + (armText ? ' (dialog said: ' + armText + ')' : ''));
    }

    // pushAltMove reads the checkbox at store time — set it BEFORE the move.
    const box = document.querySelector(SELECTORS.editVariationOnly);
    if (box && box.checked !== Boolean(job.forThisVariationOnly)) box.click();

    const pos = CloSan.parseFen(fenNow);
    if (!pos) throw new Error('could not read the edit board position');
    const mv = quickEditResolveSan(pos, job.altSan);
    if (!mv) throw new Error(job.altSan + ' is not a legal move in that position');
    if (mv.promo) throw new Error('promotion alternatives are not supported yet');

    const fromEl = findSquare(squareName(mv.from));
    const toEl = findSquare(squareName(mv.to));
    if (!fromEl || !toEl) throw new Error('board squares not found on the edit page');
    pressSquare(fromEl);
    pressSquare(toEl);

    // Success = the move shows up in #altMoves. On timeout, the open dialog
    // (if any) carries Chessable's own reason — relay it instead of a bare
    // timeout so the popup can show something actionable.
    const listed = await quickEditWaitUntil(
      () => quickEditAltListed(job.altSan), CONFIG.quickEdit.altResultTimeoutMs);
    if (!listed) {
      const dialog = document.querySelector(SELECTORS.editSwalShown);
      const reason = dialog ? dialog.textContent.trim().replace(/\s+/g, ' ').slice(0, 160) : '';
      throw new Error(reason || ('the board did not accept ' + job.altSan));
    }

    // Dismiss the "Done, you added …" dialog — WAIT for it first (the list can
    // render a beat before the dialog opens), then wait for it to actually
    // close, so the submit-confirm wait that follows can never grab this
    // dialog's fading confirm button. Both waits are best-effort: on timeout
    // just proceed to the submit.
    const doneBtn = await quickEditWaitUntil(quickEditOpenConfirm, CONFIG.quickEdit.confirmTimeoutMs);
    if (doneBtn) doneBtn.click();
    await quickEditWaitUntil(() => !quickEditOpenConfirm(), CONFIG.quickEdit.confirmTimeoutMs);
    // No settle delay here: the submit-confirm wait that follows is scoped to
    // the OPEN dialog, and a fixed timer would cost a full ~1 s clamp in the
    // hidden tab.
  }

  /**
   * The driver popup window's TOP document (the edit page shell around the
   * mt1 iframe): when this tab belongs to a running quick-edit job, cover the
   * whole window with an opaque "Saving…" shield. The window is FOCUSED (an
   * unfocused one sits occluded behind a maximized browser and gets throttled
   * exactly like a hidden tab — see background.js), so the shield both makes
   * the flash look intentional and swallows stray keystrokes that would
   * otherwise reach the edit page while the driver works. Returns true when
   * mounted, so start() skips every other top-document feature in this tab.
   */
  async function maybeMountQuickEditShield() {
    const m = /^\/explore\/edit\/(\d+)\//.exec(location.pathname);
    if (!m) return false;
    let res;
    try {
      res = await chrome.runtime.sendMessage({ type: 'clo-quick-edit-is-driver', oid: m[1] });
    } catch (err) {
      return false;
    }
    if (!res || !res.isDriver) return false; // manual visit — leave the page alone

    const shield = document.createElement('div');
    shield.id = QE_SHIELD_ID;
    shield.className = 'clo-qe-shield';
    const box = document.createElement('div');
    box.className = 'clo-qe-shield-box';
    const spinner = document.createElement('div');
    spinner.className = 'clo-qe-shield-spinner';
    const label = document.createElement('div');
    label.className = 'clo-qe-shield-label';
    label.textContent = res.mode === 'probe' ? 'Checking edit rights…' : 'Saving to Chessable…';
    const sub = document.createElement('div');
    sub.className = 'clo-qe-shield-sub';
    sub.textContent = 'This window closes itself.';
    box.append(spinner, label, sub);
    shield.appendChild(box);
    (document.body || document.documentElement).appendChild(shield);

    // Capture-phase swallow: the focused window receives real keyboard input,
    // and the edit page binds its own shortcuts — nothing may reach it.
    for (const type of ['keydown', 'keypress', 'keyup']) {
      window.addEventListener(type, (e) => { e.stopPropagation(); e.preventDefault(); }, true);
    }
    return true;
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

  /**
   * Screen bounds for the driver popup window: a small window right beside the
   * given anchor popup, so the "Saving…" surface appears attached to the action
   * that launched it. Screen coords ≈ window.screenX/Y plus the browser chrome
   * height plus the popup's viewport rect (exact enough for placement); clamped
   * to the current screen. Null when the anchor is not visible — the worker
   * then falls back to its bottom-right parking spot. Shared by the quick-edit
   * popup and the alt-check popup (section 15).
   */
  function popupDriverBounds(anchorEl) {
    if (!anchorEl || anchorEl.hidden || !anchorEl.isConnected) return null;
    const W = 260, H = 180;
    const r = anchorEl.getBoundingClientRect();
    const chromeH = Math.max(0, window.outerHeight - window.innerHeight);
    let left = Math.round(window.screenX + r.right + 10);
    let top = Math.round(window.screenY + chromeH + r.top);
    const availLeft = screen.availLeft != null ? screen.availLeft : 0;
    const availTop = screen.availTop != null ? screen.availTop : 0;
    left = Math.min(Math.max(left, availLeft), availLeft + screen.availWidth - W);
    top = Math.min(Math.max(top, availTop), availTop + screen.availHeight - H);
    return { left, top, width: W, height: H };
  }

  // Minimal API the alt-check module (section 15) uses to share quick-edit's
  // per-course rights cache and its lazy probe. Assigned by initQuickEditUi;
  // null until it has run (start() calls it before initAltCheck).
  let quickEditApi = null;

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
      mode: 'comment',        // 'comment' | 'alt' — which popup tab is active
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
        // The user's colour = the board's bottom side (the trainer orients the
        // board to the course colour). Gates the alt tab: an alternative on an
        // opponent move is always a misclick.
        userColor: () => {
          const board = getReviewBoard();
          if (!board) return null;
          return boardBottomColor(
            board.querySelector(SELECTORS.reviewSquare.replace('%s', 'a1')),
            board.querySelector(SELECTORS.reviewSquare.replace('%s', 'h8')));
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
        // Same bottom-of-board signal as review; the variation page's board is
        // the standard chessboard.js one, so squares come from findSquare.
        userColor: () => boardBottomColor(findSquare('a1'), findSquare('h8')),
      },
    };
    const host = IS_VARIATION_PAGE ? HOSTS.variation : HOSTS.review;

    function buildPencil() {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = QE_PENCIL_ID;
      btn.className = 'clo-qe-pencil';
      btn.title = 'Add a comment or alternative move';
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

      // Mode tabs: append a comment (the original feature) or register an
      // alternative move the trainer should also accept.
      const tabs = document.createElement('div');
      tabs.className = 'clo-qe-tabs';
      const tabButtons = {};
      for (const [mode, label] of [['comment', 'Comment'], ['alt', 'Alt move']]) {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'clo-qe-tab';
        tab.textContent = label;
        tab.addEventListener('click', () => { if (!qe.saving) applyMode(mode); });
        tabs.appendChild(tab);
        tabButtons[mode] = tab;
      }

      const textarea = document.createElement('textarea');
      textarea.className = 'clo-qe-text';
      textarea.rows = 3;
      textarea.placeholder = 'Comment after this move…';

      const sanInput = document.createElement('input');
      sanInput.type = 'text';
      sanInput.className = 'clo-qe-san';
      sanInput.placeholder = 'e.g. Nf6 — or click a move in the Lichess panel';
      sanInput.spellcheck = false;
      sanInput.hidden = true;

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

      popup.append(moveLabel, tabs, textarea, sanInput, scopeLabel, status, actions);
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
      qe.els = { moveLabel, tabButtons, textarea, sanInput, scopeBox, status, save, cancel };
    }

    /** Switches the popup between its comment and alt-move tabs. */
    function applyMode(mode) {
      qe.mode = mode;
      const alt = mode === 'alt';
      qe.els.textarea.hidden = alt;
      qe.els.sanInput.hidden = !alt;
      for (const [m, tab] of Object.entries(qe.els.tabButtons)) {
        tab.classList.toggle('clo-qe-tab--active', m === mode);
      }
      // The element's own text lacks the figurine piece letter ("c6" for
      // ♘c6) — show the descriptor's full SAN when it resolves.
      const desc = qe.popupTarget ? host.descriptor(qe.popupTarget) : null;
      const moveText = desc ? desc.san
        : qe.popupTarget ? qe.popupTarget.textContent.trim() : '';
      qe.els.moveLabel.textContent = (alt ? 'Alternative to ' : 'After ') + moveText;
      if (!qe.popup.hidden) (alt ? qe.els.sanInput : qe.els.textarea).focus();
    }

    function ensureElements() {
      if (!qe.pencil || !qe.pencil.isConnected) buildPencil();
      if (!qe.popup || !qe.popup.isConnected) buildPopup();
    }

    function cancelHide() { clearTimeout(qe.hideTimer); }
    function scheduleHide(ms) {
      clearTimeout(qe.hideTimer);
      qe.hideTimer = setTimeout(() => {
        if (qe.pencil) qe.pencil.hidden = true;
        qe.pencilTarget = null;
      }, ms != null ? ms : 200);
    }
    function hidePencilNow() {
      clearTimeout(qe.hideTimer);
      if (qe.pencil) qe.pencil.hidden = true;
      qe.pencilTarget = null;
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
      qe.els.textarea.value = '';
      qe.els.sanInput.value = '';
      qe.els.scopeBox.checked = false; // matches Chessable's own default
      setStatus('', false);
      setSavingUi(false);
      const rect = moveEl.getBoundingClientRect();
      qe.popup.style.left = Math.round(Math.min(rect.left, window.innerWidth - 300)) + 'px';
      qe.popup.style.top = Math.round(rect.bottom + 6) + 'px';
      qe.popup.hidden = false;
      qe.pencil.hidden = true;
      // An alternative on an OPPONENT move is always a misclick (the trainer
      // plays those itself), so the alt tab is disabled for them — the user's
      // colour being the board's bottom side. Unknown colour (board
      // mid-render) stays permissive; doSave re-checks.
      const desc = host.descriptor(moveEl);
      const uc = host.userColor();
      const altOk = !(desc && uc && desc.color !== uc);
      qe.els.tabButtons.alt.disabled = !altOk;
      qe.els.tabButtons.alt.title = altOk ? '' : "Opponent's move — alternatives apply to your own moves";
      applyMode(altOk ? qe.mode : 'comment'); // keeps the last-used tab; sets the label and focus
      applyRightsToPopup();
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
      qe.els.sanInput.disabled = busy;
      qe.els.scopeBox.disabled = busy;
      for (const tab of Object.values(qe.els.tabButtons)) tab.disabled = busy;
      qe.els.save.textContent = busy ? 'Saving…' : 'Save';
    }

    /** Driver-window bounds beside the open quick-edit popup (see
     *  popupDriverBounds — hoisted so the alt-check popup can share it). */
    const driverWindowBounds = () => popupDriverBounds(qe.popup);

    function doSave() {
      if (qe.saving || !qe.popupTarget || host.rights() !== true) return;
      const desc = host.descriptor(qe.popupTarget);
      if (!desc) { setStatus('Could not identify the move.', true); return; }
      const oid = host.oid();
      if (!oid) { setStatus('Could not identify the variation.', true); return; }
      const bid = host.bid();

      const payload = {
        type: 'clo-quick-edit-run', oid, bid,
        san: desc.san, color: desc.color, plyIndex: desc.plyIndex,
        forThisVariationOnly: qe.els.scopeBox.checked,
        win: driverWindowBounds(),
      };
      if (qe.mode === 'alt') {
        // Light checks only — legality is decided by the DRIVER against the
        // edit board's own FEN, which is exact for any position. Zero-notation
        // castling ("0-0") is normalised to the letter form SAN uses.
        const raw = qe.els.sanInput.value.trim()
          .replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O');
        const altSan = quickEditSan(raw);
        if (!altSan) { setStatus('Not a valid move (e.g. Nf6, Qxd5, O-O).', true); return; }
        if (altSan.includes('=')) { setStatus('Promotion alternatives are not supported yet.', true); return; }
        if (quickEditBareSan(altSan) === quickEditBareSan(desc.san)) {
          setStatus('That is the main move itself.', true); return;
        }
        const uc = host.userColor();
        if (uc && desc.color !== uc) {
          setStatus("That is the opponent's move — alternatives apply to your own moves.", true); return;
        }
        payload.mode = 'alt';
        payload.altSan = altSan;
      } else {
        const text = qe.els.textarea.value.trim();
        if (!text) { setStatus('Enter a comment first.', true); return; }
        payload.mode = 'save';
        payload.commentText = text;
      }

      qe.saving = true;
      setSavingUi(true);
      setStatus('Saving…', false);
      try {
        chrome.runtime.sendMessage(payload).catch(() => {});
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
      if (msg.timing) log('quick-edit timing:', msg.timing);
      if (!qe.popup || qe.popup.hidden) return;
      qe.saving = false;
      setSavingUi(false);
      if (msg.ok) {
        setStatus('Saved.', false);
        setTimeout(() => { if (!qe.saving) closePopup(); }, 900);
      } else if (msg.error === 'another quick-edit is in progress') {
        setStatus('Another save is in progress — try again in a moment.', true);
      } else if (msg.error && msg.error !== 'timeout') {
        // Driver errors are written to be shown ("g6 is not a legal move in
        // that position", Chessable's own dialog text, …).
        setStatus(msg.error, true);
      } else {
        setStatus('Save failed or timed out — your text is kept, you can retry.', true);
      }
    }

    /** Starts the hidden-tab rights probe (review host only, once per course). */
    function maybeProbe() {
      probeRights(host.bid(), host.oid(), driverWindowBounds());
    }

    /** The probe itself, host-independent — also called by the alt-check
     *  module through quickEditApi. One probe per course per session; the
     *  result lands in qe.rightsByBid via onResult. */
    function probeRights(bid, oid, win) {
      if (!bid || !oid) return;
      if (qe.rightsByBid.has(bid) || qe.probing.has(bid)) return;
      qe.probing.add(bid);
      log('quick-edit: probing edit rights for course', bid);
      try {
        chrome.runtime.sendMessage({
          type: 'clo-quick-edit-run', mode: 'probe', oid, bid, win,
        }).catch(() => {});
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
      if (!moveEl) return;
      // A tap has no hover: the finger lifting fires pointerout right after
      // the pencil appeared, so on touch it stays up long enough to press
      // (tapping a move also navigates the board there — tap move, then tap
      // the lingering pencil is the intended mobile flow).
      scheduleHide(e.pointerType === 'touch' ? CONFIG.quickEdit.touchPencilMs : undefined);
    });

    // The pencil is fixed-positioned from the move's rect at show time, so
    // any scroll (page or an inner container) leaves it floating over the
    // wrong move — hide it rather than chase the anchor. Matters mostly on
    // touch, where it now lingers for seconds.
    window.addEventListener('scroll', () => {
      if (qe.pencil && !qe.pencil.hidden) hidePencilNow();
    }, { capture: true, passive: true });

    // While the popup is open on its alt-move tab, clicking a move row in the
    // Lichess panel prefills the SAN input. Both quick-edit hosts are review
    // documents where panel rows are otherwise non-clickable (no dataset.uci),
    // so this never competes with the explore click-to-play handler.
    document.addEventListener('click', (e) => {
      if (!qe.popup || qe.popup.hidden || qe.mode !== 'alt' || qe.saving) return;
      const cell = e.target.closest && e.target.closest('#' + PANEL_ID + ' td.clo-move');
      if (!cell) return;
      const san = quickEditSan(cell.textContent);
      if (!san) return;
      qe.els.sanInput.value = san;
      setStatus('', false);
    });

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'clo-quick-edit-result') onResult(msg);
    });

    // Shared surface for the alt-check module: the rights cache is read-only
    // from outside and stays in this closure; probe results reach BOTH
    // listeners (this one first — registration order — so the cache is
    // already updated when the alt-check's fires).
    quickEditApi = {
      rightsFor: (bid) => (bid && qe.rightsByBid.has(bid) ? qe.rightsByBid.get(bid) : null),
      probe: probeRights,
    };

    setInterval(tick, CONFIG.review.pollMs);
    tick();
    log('quick-edit UI active (' + host.name + ')');
  }

  // ==========================================================================
  // 13) Auto-play already-mastered moves (top document, /practice/… and /learn/…)
  //
  // Within one review session, every move the user answers correctly is
  // recorded, keyed on the POSITION (placement + side + castling; en passant
  // dropped — same normalization as the explorer cache). When the trainer
  // later reaches a recorded position — the shared prefix of the next
  // variation, or any transposition — the recorded move is verified against
  // the variation's actual mainline (the "line oracle": the trainer's OWN
  // lesson plan, read out of page state by content/pagestate.js) and
  // then played by a synthetic DRAG (the explore click-click recipe does not
  // work on the trainer board — verified). Control naturally returns at the
  // first position the user has not proven: the lookup misses and nothing
  // happens. Records live in chrome.storage.session (12 h TTL) so "proven"
  // never leaks across days; the worker's setAccessLevel call is what lets
  // this content script touch that storage area.
  //
  // The tracker: a MutationObserver on the board container coalesces
  // mutations per animation frame into placement snapshots (the same
  // [data-piece] reads as readReviewFen; mid-animation frames are skipped by
  // the one-king-per-side check). Consecutive snapshots are diffed by asking
  // CloSan (engine/san.js, loaded as a content script) for the unique legal
  // move that produces the new placement — castling, en passant and
  // promotions come out uniformly, and the resulting position object IS the
  // authoritative game state (true castling rights, side to move, ply count).
  // Moves are classified by mover colour + provenance: opponent-colour ⇒
  // trainer; user-colour and injected by us ⇒ bookkeeping only; user-colour
  // with recent TRUSTED pointer input on the board ⇒ a genuine answer
  // (recorded once the opponent replies or the variation completes, unless
  // the move notification reads "Incorrect"/"Time's up"); user-colour with no
  // pointer input ⇒ the trainer played it (solution replay, Key-Moves prefix)
  // and it is never recorded.
  //
  // Fail-safe bias throughout: any uncertainty (oracle missing or failed, SAN
  // mismatch, unparseable board, promotion picker, text gate swallowing the
  // drag, ply misalignment after losing track) degrades to MANUAL play —
  // never to a blind move.
  //
  // The oracle is the trainer's own `lessonPlan`, lifted from page state by
  // the MAIN-world content/pagestate.js: per ply a SAN plus the full
  // `sourceFen`, so the positions the conflict guard compares against are
  // Chessable's, exactly — no move list is re-parsed, no line is re-simulated,
  // and nothing is fetched (the plan is in memory before the variation's first
  // move animates). Read once per variation, in the tab auto-play runs in.
  // ==========================================================================

  // --- the line oracle (the trainer's own lesson plan) ----------------------

  /**
   * Asks content/pagestate.js (MAIN world) for the current variation's
   * mainline and resolves with its answer: { oid, plies:[…] } | { error }.
   * Rejection is impossible — a missing responder resolves as an error after
   * CONFIG.autoPlay.pageStateTimeoutMs, so every caller has exactly one shape
   * to handle.
   */
  function readLessonLine() {
    return new Promise((resolve) => {
      let timer = 0;
      const onRes = (ev) => {
        clearTimeout(timer);
        document.removeEventListener('clo-ps-res', onRes);
        let payload = null;
        try { payload = JSON.parse(ev.detail); } catch (err) { /* fall through */ }
        resolve(payload && typeof payload === 'object' ? payload : { error: 'unreadable reply' });
      };
      document.addEventListener('clo-ps-res', onRes);
      timer = setTimeout(() => {
        document.removeEventListener('clo-ps-res', onRes);
        resolve({ error: 'page-state reader did not answer' });
      }, CONFIG.autoPlay.pageStateTimeoutMs);
      document.dispatchEvent(new CustomEvent('clo-ps-req'));
    });
  }

  // --- the auto-play module (trainer sessions: /practice/ and /learn/) -------

  // Bridges into the alt-check module (section 15), assigned by initAltCheck.
  // The tracker calls them fire-and-forget; null until that module has run.
  let altCheckOffer = null;     // (offer) => void — a captured wrong guess
  let altCheckOnAdvance = null; // () => void — an opponent move was observed (line moved on)

  function initAutoPlay() {
    if (typeof CloSan === 'undefined') {
      warn('auto-play disabled: CloSan (engine/san.js) not loaded');
      return;
    }

    const C = CONFIG.autoPlay;
    const AP_CLUSTER_ID = 'lichessable-ap';
    const STANDARD_START = CloSan.parseFen(START_FEN);

    /** The `{ move, settle }` pair for the selected speed (see CONFIG). */
    const currentSpeed = () => C.speeds[ap.speed] || C.speeds[C.defaultSpeed];

    const ap = {
      enabled: false,          // the toggle (persisted; off by default)
      speed: C.defaultSpeed,   // extra pause before each auto-played move
      record: null,            // { posKey: entry } for the current course
      recordBid: null,
      saveTimer: 0,
      ui: null,                // { root, toggle, speed, status }
      statusTimer: 0,
      lastPointerAt: 0,        // last TRUSTED pointer down (grab) or drop
      pointerDownOnBoard: false, // a trusted drag started on the board and is in flight
      recentSquares: [],       // [{sq, t}] board squares under recent trusted pointer
                               // events — the alt check reconstructs a refused move
                               // from the last two (the board DOM often never commits it)
      injectClassTimer: 0,     // pending removal of the html.clo-injecting gate
      contextDead: false,      // orphaned by an extension reload — see noteDeadContext
      pollTimer: 0,
      observer: null,
      observedBoard: null,
      rafPending: false,
      vs: null,                // per-variation state, see freshVariationState
    };
    ap.vs = freshVariationState(null, null);

    function freshVariationState(oid, bid) {
      return {
        oid, bid,
        startedAt: Date.now(),
        adopted: false,      // position came from a recognised waiting quiz (already idle)
        userColor: null,     // board orientation at anchor time ('w'|'b')
        anchor: null,        // placement waiting for its first move to reveal the side to move
        pos: null,           // CloSan position object — the authoritative game state
        ply: 0,              // moves applied since the anchor (logging only — the oracle
                             // is aligned by POSITION, not by this count)
        lastSkippedKey: null, // placement of the last skipped mid-animation frame
        movesApplied: 0,     // total observed moves this variation (any classification)
        lastMoveAt: 0,       // when the last move (or the anchor) was observed
        trainerDrove: false, // a user-colour move was trainer-played (Key-Moves prefix,
                             // solution replay) — strictly that, so it stays false until
                             // one is actually observed; `movesApplied === 0` is what
                             // covers the nothing-seen-yet case (see evaluateAutoPlay)
        lastKey: null,       // placement key of the last processed snapshot
        history: new Map(),  // placement key -> { pos, ply } for snap-backs/restarts
        oracle: null,        // null | 'pending' | 'failed' | [{san, color, key}, …]
        oracleSim: null,     // the plan's line: [{pos, key}] — positions BEFORE each oracle ply
        oracleNextTryAt: 0,  // back-off before re-reading a not-yet-ready plan
        oracleTries: 0,      // unusable reads so far this variation
        pendingRecord: null, // { posKey, uci, promo } — user answer awaiting confirmation
        incorrectNoteAt: 0,  // last time the Incorrect note was seen this variation
        lastOfferKey: null,  // placement+side+uci of the last alt-check offer (dedupe:
                             // the pointer path and the rollback path see the same refusal)
        injected: null,      // { uci, at } — our drag in flight
        injectTimer: 0,      // pending speed-delay before a drag
        verifyTimer: 0,      // injected move must land before this fires
        manualHold: false,   // no auto-play until the position changes
        handedOver: false,   // the user has played a move this variation — the rest is theirs
        cancelled: false,    // user stopped auto-play for this variation
        suspended: false,    // browse state reached — tracker off until the next variation
        replayed: 0,         // auto-played moves this variation
        handbackShown: false,
        lastHandbackLog: null, // dedupe key for logHandback
      };
    }

    // --- board snapshots and positions --------------------------------------

    /**
     * 64-array placement (CloSan board layout, a1 = 0) from the trainer DOM,
     * or null while the board is mid-render/mid-animation (missing squares, a
     * piece on two squares, the paused session's empty board, …).
     */
    function readBoardSnapshot() {
      const board = getReviewBoard();
      if (!board) return null;
      const arr = new Array(64).fill(null);
      let whiteKings = 0, blackKings = 0;
      for (let i = 0; i < 64; i++) {
        const squareEl = board.querySelector(SELECTORS.reviewSquare.replace('%s', squareName(i)));
        if (!squareEl) return null;
        const pieceEl = squareEl.querySelector(SELECTORS.reviewPiece);
        const dp = pieceEl ? pieceEl.getAttribute('data-piece') : null;
        if (dp && /^[wb][PNBRQK]$/.test(dp)) {
          const ch = dp[0] === 'w' ? dp[1] : dp[1].toLowerCase();
          arr[i] = ch;
          if (ch === 'K') whiteKings++;
          else if (ch === 'k') blackKings++;
        }
      }
      if (whiteKings !== 1 || blackKings !== 1) return null;
      return arr;
    }

    const placementKey = (arr) => arr.map((p) => p || '.').join('');

    function boardsEqual(a, b) {
      for (let i = 0; i < 64; i++) if (a[i] !== b[i]) return false;
      return true;
    }

    function countPieces(arr) {
      let n = 0;
      for (const p of arr) if (p) n++;
      return n;
    }

    /**
     * Decides whether a snapshot that matched no move is a mid-animation /
     * mid-drag frame to be skipped. A PIECE-DEFICIT frame (fewer pieces than
     * the reference — a lifted piece following the cursor, possibly held for
     * many seconds while the user thinks) is skipped for as long as it lasts.
     * Any other partial-looking frame is transient by nature, so it is
     * skipped once; seeing the same placement again on a later poll means
     * the board has SETTLED there and the caller should re-anchor.
     */
    function shouldSkipFrame(refPos, snap, key) {
      const vs = ap.vs;
      if (!isPartialMoveFrame(refPos, snap)) return false;
      if (countPieces(snap) < countPieces(refPos.board)) {
        vs.lastSkippedKey = key;
        return true;
      }
      if (key === vs.lastSkippedKey) return false; // settled, not an animation
      vs.lastSkippedKey = key;
      return true;
    }

    /** FEN placement field for a 64-array board. */
    function placementFen(arr) {
      const rows = [];
      for (let rank = 7; rank >= 0; rank--) {
        let row = '', empty = 0;
        for (let file = 0; file < 8; file++) {
          const p = arr[rank * 8 + file];
          if (p) {
            if (empty) { row += empty; empty = 0; }
            row += p;
          } else empty++;
        }
        if (empty) row += empty;
        rows.push(row);
      }
      return rows.join('/');
    }

    /** The record key: placement + side + castling; en passant dropped. */
    const posKeyOf = (pos) => placementFen(pos.board) + ' ' + pos.side + ' ' + (pos.castling || '-');

    /**
     * Position object for a mid-game anchor. Castling is the same home-square
     * heuristic readReviewFen uses (may over-grant); en passant unknown. Both
     * are accepted approximations — and internally consistent, because every
     * key is derived from positions the tracker itself maintains.
     */
    function posFromBoard(arr, side) {
      let castling = '';
      if (arr[4] === 'K') {
        if (arr[7] === 'R') castling += 'K';
        if (arr[0] === 'R') castling += 'Q';
      }
      if (arr[60] === 'k') {
        if (arr[63] === 'r') castling += 'k';
        if (arr[56] === 'r') castling += 'q';
      }
      return { board: arr.slice(), side, castling, ep: -1, fullmove: 1 };
    }

    /** The unique legal move that turns pos into the target placement, or null. */
    function findSingleMove(pos, target) {
      let found = null;
      for (const move of CloSan.generateMoves(pos)) {
        const next = CloSan.makeMove(pos, move);
        if (boardsEqual(next.board, target)) {
          if (found) return null; // ambiguous — be safe, treat as no match
          found = { move, next };
        }
      }
      return found;
    }

    /** Squares a move is allowed to disturb (incl. castling rook, ep pawn). */
    function moveSquares(pos, move) {
      const set = [move.from, move.to];
      const piece = pos.board[move.from];
      const type = piece && piece.toUpperCase();
      if (type === 'K' && Math.abs((move.to & 7) - (move.from & 7)) === 2) {
        const rank = move.from & 56;
        if ((move.to & 7) === 6) set.push(rank + 7, rank + 5);
        else set.push(rank + 0, rank + 3);
      }
      if (type === 'P' && move.to === pos.ep) {
        set.push(move.to + (pos.side === 'w' ? -8 : 8));
      }
      return set;
    }

    /**
     * True when the snapshot looks like SOME legal move caught mid-animation:
     * it matches that move's resulting board everywhere except on the move's
     * own squares (e.g. the piece is already on the target but not yet
     * removed from the source — Chessable renders such frames, and only kings
     * are caught by the snapshot sanity check). Such frames are skipped
     * instead of derailing the tracker into a re-anchor.
     */
    function isPartialMoveFrame(pos, target) {
      for (const move of CloSan.generateMoves(pos)) {
        const next = CloSan.makeMove(pos, move);
        const allowed = moveSquares(pos, move);
        let partial = true;
        for (let i = 0; i < 64; i++) {
          if (next.board[i] !== target[i] && allowed.indexOf(i) < 0) { partial = false; break; }
        }
        if (partial) return true;
      }
      return false;
    }

    /** The trainer orients the board with the student's colour at the bottom. */
    function readBoardOrientation() {
      const board = getReviewBoard();
      if (!board) return null;
      const a1 = board.querySelector(SELECTORS.reviewSquare.replace('%s', 'a1'));
      const h8 = board.querySelector(SELECTORS.reviewSquare.replace('%s', 'h8'));
      if (!a1 || !h8) return null;
      const ra = a1.getBoundingClientRect(), rh = h8.getBoundingClientRect();
      if (!ra.height || !rh.height) return null;
      return ra.top > rh.top ? 'w' : 'b';
    }

    // --- session record (chrome.storage.session) ----------------------------

    async function loadRecord(bid) {
      ap.recordBid = bid;
      ap.record = {};
      try {
        // Wake the worker first: its startup applies the storage.session
        // access level that lets a content script read the area at all.
        await chrome.runtime.sendMessage({ type: 'clo-ping' }).catch(() => {});
        const stored = await chrome.storage.session.get(C.recordKey);
        const mine = (stored[C.recordKey] || {})[bid] || {};
        const now = Date.now();
        for (const [key, entry] of Object.entries(mine)) {
          if (entry && now - entry.seenAt < C.recordTtlMs) ap.record[key] = entry;
        }
        log('auto-play: loaded', Object.keys(ap.record).length, 'proven positions for course', bid);
      } catch (err) {
        if (noteDeadContext(err)) return;
        warn('auto-play: could not read the session record:', err);
      }
    }

    function scheduleSaveRecord() {
      clearTimeout(ap.saveTimer);
      ap.saveTimer = setTimeout(saveRecord, C.saveDebounceMs);
    }

    async function saveRecord() {
      if (!ap.recordBid || !ap.record) return;
      try {
        const stored = await chrome.storage.session.get(C.recordKey);
        const all = stored[C.recordKey] || {};
        all[ap.recordBid] = ap.record;
        const now = Date.now(); // prune expired entries of every course while we're here
        for (const bid of Object.keys(all)) {
          for (const [key, entry] of Object.entries(all[bid])) {
            if (!entry || now - entry.seenAt >= C.recordTtlMs) delete all[bid][key];
          }
          if (!Object.keys(all[bid]).length) delete all[bid];
        }
        await chrome.storage.session.set({ [C.recordKey]: all });
        log('auto-play: record saved —', Object.keys(ap.record).length,
          'positions for course', ap.recordBid);
      } catch (err) {
        if (noteDeadContext(err)) return;
        warn('auto-play: could not save the session record:', err);
      }
    }

    /**
     * True when `err` is the "Extension context invalidated" that every
     * chrome.* call throws in a content script orphaned by an extension
     * reload. Such a script keeps running on the page with a record it can
     * neither refresh nor save — and could still drive synthetic drags off it
     * — so it stands down instead: auto-play off, pollers stopped, one clear
     * line saying what to do. Everything else about the page keeps working;
     * only this module retires.
     */
    function noteDeadContext(err) {
      if (!/Extension context invalidated/i.test(String((err && err.message) || err))) return false;
      if (ap.contextDead) return true;
      ap.contextDead = true;
      ap.enabled = false;
      stopReplaying();
      if (ap.observer) { ap.observer.disconnect(); ap.observer = null; }
      clearInterval(ap.pollTimer);
      clearTimeout(ap.saveTimer);
      warn('auto-play: the extension was reloaded — this tab is running an orphaned ' +
        'content script and auto-play has stood down. Reload the page to resume.');
      return true;
    }

    /**
     * Debug probe: dispatching a `clo-debug` DOM event makes this content
     * script dump a SUMMARY of the extension's session storage (counts and
     * key names only, no contents) into a data attribute on <html>, where
     * page-context tooling can read it. Storage areas are invisible from the
     * page, so without this there is no way to diagnose persistence issues
     * in a running session.
     */
    document.addEventListener('clo-debug', async () => {
      let out;
      try {
        const all = await chrome.storage.session.get(null);
        out = {};
        for (const [k, v] of Object.entries(all)) {
          if (k === C.recordKey) {
            out[k] = Object.fromEntries(Object.entries(v).map(([bid, recs]) =>
              [bid, Object.keys(recs).length]));
          } else if (v && typeof v === 'object') {
            out[k] = Object.keys(v);
          } else {
            out[k] = typeof v;
          }
        }
      } catch (err) {
        out = { error: String(err) };
      }
      document.documentElement.setAttribute('data-clo-session', JSON.stringify(out));
    });

    // --- tracker -------------------------------------------------------------

    function resetVariation(oid, bid) {
      const vs = ap.vs;
      clearTimeout(vs.injectTimer);
      clearTimeout(vs.verifyTimer);
      ap.vs = freshVariationState(oid, bid);
      setStatus('');
      if (oid) log('auto-play: tracking variation', oid);
    }

    /**
     * Begin (or restart) tracking from this placement. The standard starting
     * position fixes the side to move immediately; any other position waits
     * for the first observed move, whose mover's colour reveals it. Losing
     * the exact ply here is fine: the oracle check aligns by POSITION (see
     * requestOracle), not by counted plies.
     */
    function startTracking(snap, key) {
      const vs = ap.vs;
      vs.pendingRecord = null;
      vs.lastSkippedKey = null;
      vs.pos = null;
      vs.ply = 0;
      vs.history.clear();
      vs.userColor = readBoardOrientation();
      vs.anchor = snap;
      vs.lastMoveAt = Date.now();
      if (boardsEqual(snap, STANDARD_START.board)) {
        vs.pos = { board: snap.slice(), side: 'w', castling: 'KQkq', ep: -1, fullmove: 1 };
        vs.history.set(key, { pos: vs.pos, ply: 0 });
      }
    }

    /**
     * First snapshot(s) of a variation: anchor, then fix the side to move.
     * Returns 'skip' for mid-animation frames, which must not update lastKey
     * (drag-lift frames are common here — before the side is known there is
     * no tracked position, so this path needs its own animation tolerance or
     * a single user drag cascades into blind re-anchoring).
     */
    function anchorOrFirstMove(snap, key) {
      const vs = ap.vs;
      if (!vs.anchor) {
        startTracking(snap, key);
        return;
      }
      let found = null;
      for (const side of ['w', 'b']) {
        const pos = posFromBoard(vs.anchor, side);
        const match = findSingleMove(pos, snap);
        if (match) {
          if (found) return startTracking(snap, key); // ambiguous — re-anchor
          found = { match, side };
        }
      }
      if (!found) {
        if (shouldSkipFrame(posFromBoard(vs.anchor, 'w'), snap, key) ||
            shouldSkipFrame(posFromBoard(vs.anchor, 'b'), snap, key)) {
          return 'skip';
        }
        log('auto-play: unmatched frame while the side to move is unknown — re-anchoring');
        startTracking(snap, key);
        return;
      }
      vs.lastSkippedKey = null;
      vs.pos = posFromBoard(vs.anchor, found.side);
      vs.history.set(placementKey(vs.anchor), { pos: vs.pos, ply: 0 });
      applyObservedMove(found.match, key);
    }

    function readMoveNote() {
      const el = document.querySelector(SELECTORS.trainerMoveNote);
      return el ? (el.textContent || '').trim() : '';
    }

    /**
     * Commit the pending user answer, unless the trainer's notification vetoes
     * it. Called when the opponent replies (primary confirmation) or when the
     * variation completes.
     */
    function confirmPendingRecord(why) {
      const vs = ap.vs;
      const pending = vs.pendingRecord;
      if (!pending) return;
      vs.pendingRecord = null;
      const note = readMoveNote();
      if (/incorrect|time.s up/i.test(note)) {
        log('auto-play: not recording', pending.uci, '— notification reads:', note);
        return;
      }
      if (!ap.record) return;
      const prev = ap.record[pending.posKey];
      ap.record[pending.posKey] = {
        uci: pending.uci,
        promo: pending.promo,
        seenAt: Date.now(),
        count: (prev && prev.count || 0) + 1,
        // A fresh proof of a DIFFERENT move lifts the conflict flag (the
        // oracle check still guards every future auto-play of it).
        conflicted: Boolean(prev && prev.conflicted && prev.uci === pending.uci),
      };
      scheduleSaveRecord();
      log('auto-play: recorded', pending.uci, '(' + why + ')');
    }

    function applyObservedMove(found, key) {
      const vs = ap.vs;
      const mover = vs.pos.side;
      const move = found.move;
      const uci = squareName(move.from) + squareName(move.to);
      const posKeyBefore = posKeyOf(vs.pos);

      let kind;
      if (mover !== vs.userColor) {
        // Opponent move: the trainer played it, and its arrival is the
        // primary confirmation of the user's preceding answer.
        kind = 'opponent';
        // Alt-check chip lifecycle: an opponent reply that confirms a PENDING
        // USER answer means the user genuinely moved past any wrong-guess
        // offer — dismiss it. The pending gate matters in learn mode: after a
        // failure the trainer DEMONSTRATES (solution replay, sometimes the
        // reply too), and those trainer-driven opponent moves carry no
        // pending record — they must not kill the chip the moment it shows.
        const hadPendingAnswer = Boolean(vs.pendingRecord);
        confirmPendingRecord('opponent replied');
        if (hadPendingAnswer && altCheckOnAdvance) altCheckOnAdvance();
      } else if (vs.injected && vs.injected.uci === uci) {
        // Our own auto-play landed: refresh the proof's timestamp only.
        kind = 'injected';
        clearTimeout(vs.verifyTimer);
        vs.verifyTimer = 0;
        vs.injected = null;
        vs.replayed++;
        vs.handbackShown = false; // a later handback (transposition resume) flashes again
        vs.trainerDrove = false;
        const entry = ap.record && ap.record[posKeyBefore];
        if (entry) { entry.seenAt = Date.now(); scheduleSaveRecord(); }
      } else if (Date.now() - ap.lastPointerAt < C.pointerWindowMs) {
        // A genuine answer. Recorded once confirmed and not vetoed — and from
        // here on this variation belongs to the user: auto-play only ever
        // replays the variation's OPENING run of moves, never jumps back in
        // after the user has taken over (bouncing control back and forth on a
        // mid-line transposition is too jarring).
        kind = 'user';
        vs.pendingRecord = { posKey: posKeyBefore, uci, promo: move.promo || null };
        vs.trainerDrove = false;
        vs.handedOver = true;
      } else {
        // Trainer-played user-colour move (solution replay after "Time's up",
        // Key-Moves prefix auto-play) — never recorded, and a signal to give
        // the trainer room before our next injection.
        kind = 'trainer';
        vs.trainerDrove = true;
      }

      vs.pos = found.next;
      vs.ply++;
      vs.movesApplied++;
      vs.lastMoveAt = Date.now();
      vs.manualHold = false;
      vs.history.set(key, { pos: vs.pos, ply: vs.ply });
      log('auto-play: observed', uci, '(' + kind + ')');
    }

    /** The board snapped back (wrong answer) or jumped to a known position. */
    function rollbackTo(key) {
      const vs = ap.vs;
      const entry = vs.history.get(key);
      // Wrong-guess capture (section 15), rollback path: a snap-back of a
      // pending user answer with the Incorrect note live (or seen within the
      // grace window — the note and the retraction race in both orders) is
      // the trainer refusing that move. The rollback need not land exactly on
      // the pre-guess position (the trainer sometimes rewinds further and
      // replays the opponent move), so the pre-guess position is looked up by
      // the pending record's own key. Time's-up is deliberately excluded:
      // there is no guessed move worth checking. This path only fires when
      // the refused move was actually COMMITTED to the board (learn mode's
      // final attempt); the pointer path in maybeCaptureRefusedGuess covers
      // the — more common — case where it never was.
      const pending = vs.pendingRecord;
      if (pending &&
          (/incorrect/i.test(readMoveNote()) ||
           Date.now() - vs.incorrectNoteAt < CONFIG.altCheck.noteGraceMs)) {
        const pre = (entry && posKeyOf(entry.pos) === pending.posKey)
          ? entry.pos
          : [...vs.history.values()].map((h) => h.pos).find((p) => posKeyOf(p) === pending.posKey);
        if (pre) {
          captureWrongGuess(pre, pending)
            .catch((err) => warn('alt-check: capture failed:', err));
        }
      }
      vs.pos = entry.pos;
      vs.ply = entry.ply;
      vs.pendingRecord = null; // never record a move the board took back
      // The user just failed here (or the trainer restarted) — leave the
      // retry to them; auto-play resumes once the position advances.
      vs.manualHold = true;
      // Withdraw the pointer credit too: if the trainer now shows the
      // solution itself, the user's earlier (failed) drag must not vouch for
      // it — they have to touch the board again to get a move recorded.
      ap.lastPointerAt = 0;
      stopReplaying();
    }

    /**
     * Wrong-guess capture (section 15), pointer path — the PRIMARY one. A
     * refused move is usually never committed to the board DOM at all (review
     * mode, and every non-final learn attempt, animates the piece straight
     * back), so no rollback ever fires for it. But the user's own trusted
     * pointer input names the move: the last two distinct board squares
     * touched, read while the Incorrect note is up and the tracked position
     * still has the user to move, are the refused from→to. Legality against
     * the line oracle's exact position is the garbage filter — a deselection
     * click or a re-tap never forms a legal user-colour move. Runs on every
     * frame AND every 500 ms tick, so it needs neither rAF (hidden tabs) nor
     * a board mutation.
     */
    function maybeCaptureRefusedGuess() {
      const vs = ap.vs;
      if (!altCheckOffer || ap.contextDead) return;
      if (!vs.oid || vs.suspended) return;
      if (!vs.pos || !vs.userColor || vs.pos.side !== vs.userColor) return;
      if (!/incorrect/i.test(readMoveNote()) &&
          Date.now() - vs.incorrectNoteAt >= CONFIG.altCheck.noteGraceMs) return;
      const rs = ap.recentSquares;
      const last = rs[rs.length - 1], prev = rs[rs.length - 2];
      if (!last || !prev || Date.now() - last.t > CONFIG.altCheck.guessPairWindowMs) return;
      const uci = prev.sq + last.sq;
      // Promotion guesses are refused downstream; flag them so the message is
      // the same as the rollback path's.
      const piece = vs.pos.board[squareIndexOf(prev.sq)] || '';
      const promo = piece.toUpperCase() === 'P' && /[18]$/.test(last.sq) ? 'q' : null;
      captureWrongGuess(vs.pos, { uci, promo })
        .catch((err) => warn('alt-check: capture failed:', err));
    }

    /**
     * A refused user answer — from the pointer path above or from a rollback
     * of a committed move (rollbackTo): turn it into an alt-check offer. The
     * pre-guess FEN is NOT the tracker's own (approximate castling / no en
     * passant) — the position is located in the line oracle by placement +
     * side and the plan's exact sourceFen is used, which also yields the ply
     * index the edit-page driver needs, the mainline move at that ply, and
     * the position AFTER the mainline move (the popup's comparison target).
     * Any uncertainty degrades to no offer, with one console line saying why
     * (a silent no-op reads as a bug).
     */
    async function captureWrongGuess(prePos, pending) {
      const vs = ap.vs;
      if (!altCheckOffer || ap.contextDead) return;
      // Both capture paths see the same refusal (and the pointer path runs
      // every tick) — offer each (position, move) pair once per variation.
      const offerKey = placementKey(prePos.board) + ' ' + prePos.side + ' ' + pending.uci;
      if (vs.lastOfferKey === offerKey) return;
      vs.lastOfferKey = offerKey;
      if (pending.promo) {
        log('alt-check: promotion guess — not offering (promotion alternatives unsupported)');
        return;
      }
      // The oracle may not have been requested yet (auto-play toggle off
      // means evaluateAutoPlay never drives it) — drive it here.
      for (let i = 0; i < 10 && ap.vs === vs &&
           !Array.isArray(vs.oracle) && vs.oracle !== 'failed'; i++) {
        if (vs.oracle === 'pending') await quickEditDelay(CONFIG.altCheck.oracleWaitMs);
        else await requestOracle();
      }
      if (ap.vs !== vs || !Array.isArray(vs.oracle)) {
        vs.lastOfferKey = null; // transient — let a later pass retry this guess
        log('alt-check: line oracle unavailable — not offering');
        return;
      }
      const here = placementKey(prePos.board) + ' ' + prePos.side;
      const idx = vs.oracleSim.findIndex((step) => step.key === here);
      if (idx < 0) {
        vs.lastOfferKey = null; // transient (tracker mid-re-anchor) — allow a retry
        log('alt-check: guessed-from position not found in the line — not offering');
        return;
      }
      const oraclePos = vs.oracleSim[idx].pos; // exact castling/en-passant state
      const uci = pending.uci; // promo guesses were refused above, so from+to is complete
      const sanGuess = CloSan.moveToSan(oraclePos, uci);
      if (!sanGuess) {
        // Pointer-path pairs can be a deselection or stray click — this is
        // the expected filter for those, so no log (a rollback-path guess is
        // always legal by construction).
        return;
      }
      const mainline = vs.oracle[idx];
      if (quickEditBareSan(sanGuess) === quickEditBareSan(mainline.san)) return; // not an alternative
      // The popup compares the guess against the COURSE move, so it needs the
      // position after the mainline ply: the next sim entry's own exact FEN,
      // or — for the variation's final ply — one derived move ourselves.
      const coursePostFen = idx + 1 < vs.oracleSim.length
        ? vs.oracleSim[idx + 1].fen
        : fenAfterUci(vs.oracleSim[idx].fen, sanToUci(oraclePos, mainline.san) || '');
      if (!coursePostFen) {
        log('alt-check: could not build the position after', mainline.san, '— not offering');
        return;
      }
      log('alt-check: wrong guess', sanGuess, 'captured at line index', idx,
        '(mainline ' + mainline.san + ')');
      altCheckOffer({
        uci,
        sanGuess,
        preFen: vs.oracleSim[idx].fen,
        coursePostFen,
        plyIndex: idx,
        mainlineSan: mainline.san,
        mainlineColor: mainline.color,
        moverColor: oraclePos.side,
        oid: vs.oid,
        bid: vs.bid,
        capturedAt: Date.now(),
      });
    }

    /**
     * Pick up a variation change (and a course change) from the drawer. Runs
     * on the 500 ms tick AND on every board frame: the board resetting to the
     * start position is the earliest visible sign of a new variation, and
     * waiting for the next tick to notice would spend up to 500 ms of the gap
     * before the trainer's opening move is even ours to answer. Idempotent
     * and cheap — two attribute reads when nothing changed.
     */
    function syncVariation() {
      const bid = readQuickEditBid();
      const oid = readQuickEditOid();
      if (bid && bid !== ap.recordBid) loadRecord(bid);
      // Only ever act on a POSITIVE reading. Because this now runs on every
      // board frame, a drawer that is momentarily unreadable (mid re-render)
      // would otherwise reset tracking in the middle of a variation, where
      // the old 500 ms sampling would simply have missed the blink. Leaving
      // review altogether is handled by tick(), which owns that transition.
      if (oid && oid !== ap.vs.oid) resetVariation(oid, bid);
    }

    function processFrame() {
      if (ap.contextDead) return;
      if (!isTrainerPath()) return;
      syncVariation();
      const vs = ap.vs;
      if (!vs.oid || vs.suspended) return;
      if (reviewBrowseReady()) return; // completion is handled by tick()
      // Alt-check: remember having seen the Incorrect note — the snap-back
      // (or the pointer-path check) that consumes it may run a beat after the
      // note is gone again (see rollbackTo / maybeCaptureRefusedGuess).
      if (/incorrect/i.test(readMoveNote())) vs.incorrectNoteAt = Date.now();
      maybeCaptureRefusedGuess();
      const snap = readBoardSnapshot();
      if (!snap) return;
      const key = placementKey(snap);
      if (key === vs.lastKey) return;

      if (!vs.pos) {
        if (anchorOrFirstMove(snap, key) === 'skip') return; // lastKey untouched
      } else {
        const found = findSingleMove(vs.pos, snap);
        if (found) {
          vs.lastSkippedKey = null;
          applyObservedMove(found, key);
        } else if (vs.history.has(key)) {
          vs.lastSkippedKey = null;
          rollbackTo(key);
        } else if (shouldSkipFrame(vs.pos, snap, key)) {
          return; // move animation in flight — deliberately NOT updating lastKey
        } else {
          log('auto-play: lost track of the board — re-anchoring');
          startTracking(snap, key);
        }
      }
      vs.lastKey = key;
      evaluateAutoPlay();
    }

    // --- the auto-play loop --------------------------------------------------

    const stripCheckGlyphs = (san) => String(san).replace(/[+#]+$/, '');

    function maybeHandback() {
      const vs = ap.vs;
      if (vs.replayed > 0 && !vs.handbackShown) {
        vs.handbackShown = true;
        setStatus('✋ new move — your turn');
      }
    }

    /**
     * Debug trail for why auto-play did NOT act on the current position — a
     * silent no-op is indistinguishable from a bug without this. Gated to one
     * line per (position, reason) pair, since evaluateAutoPlay also runs on
     * the tick() safety net (every 500 ms) while sitting on the same unproven
     * position.
     */
    function logHandback(reason) {
      const vs = ap.vs;
      const tag = vs.lastKey + '|' + reason;
      if (vs.lastHandbackLog === tag) return;
      vs.lastHandbackLog = tag;
      log('auto-play: not replaying here —', reason);
    }

    /**
     * Reads the trainer's own lesson plan for the CURRENT variation and turns
     * it into the two arrays the conflict guard uses:
     *   vs.oracle    — [{san, color}] per ply of the mainline
     *   vs.oracleSim — [{pos, key}]: the position BEFORE each ply, parsed from
     *                  the plan's own sourceFen. Exact castling and en-passant
     *                  state, straight from Chessable — nothing is replayed,
     *                  so there is no ambiguity to bail out on and no starting
     *                  position to guess (tactics lines starting mid-game come
     *                  out as naturally as openings).
     * evaluateAutoPlay then locates the current board in oracleSim by CONTENT
     * (placement + side to move), which keeps the ply alignment self-
     * correcting: it does not matter where the tracker happened to anchor, and
     * a transposition matches wherever it joins the line.
     *
     * An answer for a different variation, or no answer at all, means the
     * trainer is mid-swap: retry a few times, then fall back to manual play
     * for the variation rather than replaying anything unverified.
     */
    async function requestOracle() {
      const vs = ap.vs;
      const oid = String(vs.oid);
      vs.oracle = 'pending';
      setStatus('… checking the line', true);

      const res = await readLessonLine();
      if (ap.vs !== vs || String(vs.oid) !== oid) return; // variation moved on — stale answer

      const retry = (why) => {
        vs.oracleTries++;
        setStatus('');
        if (vs.oracleTries >= C.oracleMaxTries) {
          vs.oracle = 'failed';
          warn('auto-play: line oracle unavailable (' + why + ') — manual for this variation');
          return;
        }
        vs.oracle = null; // evaluateAutoPlay re-requests once the back-off expires
        vs.oracleNextTryAt = Date.now() + C.oracleRetryMs;
      };

      if (res.error) return retry(res.error);
      if (String(res.oid) !== oid) return retry('plan is still on variation ' + res.oid);

      const line = [];
      const sim = [];
      for (const ply of res.plies) {
        const pos = CloSan.parseFen(ply.sourceFen);
        if (!pos || pos.side !== ply.color) return retry('unparseable plan position');
        line.push({ san: ply.san, color: ply.color });
        // fen: the plan's own exact pre-ply FEN, kept verbatim — the alt
        // check (section 15) analyzes it instead of a reconstructed one.
        sim.push({ pos, key: placementKey(pos.board) + ' ' + pos.side, fen: ply.sourceFen });
      }
      vs.oracle = line;
      vs.oracleSim = sim;
      log('auto-play: line oracle ready (' + line.length + ' plies)');
      setStatus('');
      evaluateAutoPlay();
    }

    /**
     * A variation can load with the trainer's prefix moves already played
     * before the tracker gets a clean frame: the anchor is then a WAITING
     * quiz position whose side to move nothing will ever reveal (the next
     * move is the user's). An idle quiz board means it is the user's turn,
     * so assume the orientation colour, look the position up in the record,
     * and let the oracle line CONFIRM the assumption — the anchor
     * placement must sit on the line with the user to move — before the
     * plan's position (true castling/en-passant) is adopted as tracked
     * state. If the line does not confirm it, nothing is ever played.
     */
    function tryAdoptAnchorPosition() {
      const vs = ap.vs;
      if (vs.pos || !vs.anchor || !vs.userColor || !ap.record) return;
      if (Date.now() - vs.lastMoveAt < currentSpeed().settle) return; // board may still be settling
      const assumed = posFromBoard(vs.anchor, vs.userColor);
      if (!ap.record[posKeyOf(assumed)]) return; // nothing recorded here — stay passive
      if (!vs.oracle) {
        if (Date.now() >= vs.oracleNextTryAt) requestOracle();
        return;
      }
      if (vs.oracle === 'pending' || vs.oracle === 'failed') return;
      const here = placementKey(vs.anchor) + ' ' + vs.userColor;
      const idx = vs.oracleSim.findIndex((step) => step.key === here);
      if (idx < 0) return; // the line disagrees — leave the quiz alone
      vs.pos = vs.oracleSim[idx].pos;
      vs.ply = idx;
      vs.adopted = true; // the idle wait is already served — no settle floor on top
      vs.history.set(placementKey(vs.anchor), { pos: vs.pos, ply: idx });
      log('auto-play: waiting quiz recognised at line index', idx, '— position adopted');
    }

    /**
     * The per-position decision (§4b of the design): on a user-turn position,
     * look up the record, verify the entry against the variation's mainline,
     * and only then schedule the drag. Every guard degrades to manual play.
     */
    function evaluateAutoPlay() {
      const vs = ap.vs;
      if (!ap.enabled || ap.contextDead || document.hidden) return;
      if (!vs.oid || !vs.bid || vs.suspended || vs.cancelled) return;
      if (vs.manualHold) { logHandback('manual hold on this position'); return; }
      if (vs.handedOver) { logHandback('user has taken over this variation'); return; }
      if (!vs.pos) tryAdoptAnchorPosition();
      if (!vs.pos || !vs.userColor || vs.pos.side !== vs.userColor) return;
      if (vs.injected || vs.injectTimer) return;
      if (!ap.record) return;

      const entry = ap.record[posKeyOf(vs.pos)];
      const now = Date.now();
      if (!entry) { logHandback('no record for this position'); maybeHandback(); return; }
      if (entry.conflicted) { logHandback('position marked conflicted'); maybeHandback(); return; }
      if (now - entry.seenAt >= C.recordTtlMs) { logHandback('record expired'); maybeHandback(); return; }
      if (entry.promo) { logHandback('recorded move is a promotion'); maybeHandback(); return; }

      if (vs.oracle === 'failed') { logHandback('line oracle failed'); return; }
      if (vs.oracle === 'pending') return; // no log — expected transient state
      if (!vs.oracle) {
        if (now >= vs.oracleNextTryAt) requestOracle();
        return;
      }

      // Conflict guard: locate the CURRENT position in the plan's own line by
      // content (self-aligning — see requestOracle) and require the recorded
      // move to be exactly what the mainline plays there. The SAN is computed
      // on the plan's position, whose castling/en-passant state is exact.
      const here = placementKey(vs.pos.board) + ' ' + vs.pos.side;
      const idx = vs.oracleSim.findIndex((step) => step.key === here);
      if (idx < 0) { logHandback('position not found in the line'); maybeHandback(); return; }
      const expected = vs.oracle[idx];
      const san = CloSan.moveToSan(vs.oracleSim[idx].pos, entry.uci);
      if (!san) { logHandback('recorded move is illegal in the line'); maybeHandback(); return; }
      if (stripCheckGlyphs(san) !== stripCheckGlyphs(expected.san)) {
        entry.conflicted = true; // same position, different expected move — never retry this session
        scheduleSaveRecord();
        setStatus('⚠ line differs here — manual');
        log('auto-play: conflict at line index', idx, '— recorded', san, 'vs expected', expected.san);
        return;
      }

      // Settle floor, for the two states where the trainer may still be
      // moving by itself: nothing observed yet this variation (it could be
      // mid-setup), or it drove the last user-colour move (Key-Moves prefix,
      // solution replay) and may drive the next one too.
      //
      // Having just watched the OPPONENT reply is deliberately not one of
      // them, at a variation's start no less than mid-line: chess gives the
      // trainer no second move to race us with, and mid-line injection —
      // which has always run with no floor at all — is the same situation and
      // lands reliably. That default used to cost 700 ms on every variation.
      let delay = currentSpeed().move;
      if ((vs.movesApplied === 0 && !vs.adopted) || vs.trainerDrove) {
        delay = Math.max(delay, vs.lastMoveAt + currentSpeed().settle - now);
      }
      setStatus('▶ replaying known moves… (click to stop)', true);
      const expectKey = vs.lastKey;
      // With no pause to serve (Fast's mid-line case, move:0) skip the timer
      // hop and play in THIS task. setTimeout(…,0) still yields to the event
      // loop, where the callback can sit behind Chessable's own post-move work
      // — exactly the main-thread contention that makes a phone feel laggier
      // than a desktop. injectMove re-verifies state, so a synchronous call is
      // safe, and its two presses still share one task (so the move animates,
      // not drags). Any real pause (variation-start settle floor) still defers.
      if (delay <= 0) {
        injectMove(entry, expectKey);
        return;
      }
      vs.injectTimer = setTimeout(() => {
        vs.injectTimer = 0;
        injectMove(entry, expectKey);
      }, delay);
    }

    function injectMove(entry, expectKey) {
      const vs = ap.vs;
      // The world may have changed during the speed delay — re-verify, and
      // drop the sticky "replaying" chip if the injection is off.
      if (!ap.enabled || document.hidden || vs.cancelled || vs.suspended || vs.manualHold ||
          vs.lastKey !== expectKey || !vs.pos || vs.pos.side !== vs.userColor) {
        setStatus('');
        evaluateAutoPlay(); // the position may have moved on — rejoin the chain
        return;
      }
      const board = getReviewBoard();
      const fromEl = board && board.querySelector(SELECTORS.reviewSquare.replace('%s', entry.uci.slice(0, 2)));
      const toEl = board && board.querySelector(SELECTORS.reviewSquare.replace('%s', entry.uci.slice(2, 4)));
      if (!fromEl || !toEl) { vs.manualHold = true; return; }
      log('auto-play: playing', entry.uci);
      // beforeKey is what the verify timer compares against: the placement the
      // injection is supposed to change. Observing our own move is the normal
      // way the injection gets closed out, but it is not the only evidence that
      // it landed — see the timer below.
      vs.injected = { uci: entry.uci, at: Date.now(), beforeKey: vs.lastKey };
      // Belt and braces for the two presses below: if MoveTrainer2 ever does
      // get a frame between them, this class hides what a half-made selection
      // would paint. Dropped again well before the move's own animation runs.
      clearTimeout(ap.injectClassTimer);
      document.documentElement.classList.add('clo-injecting');
      // The move is CLICKED, not dragged, and the two presses go out in the
      // SAME task. Both halves are load-bearing (ground-truthed live, 2026-07):
      //
      // - Click-move is the path MoveTrainer2 animates. It paints the yellow
      //   last-move tint on both squares and then glides the piece across with
      //   its own ~200 ms tween — the very same animation its own replies use,
      //   so a replayed move becomes indistinguishable from one it played.
      //   mousedown-here/mouseup-there is read as a DRAG instead, and a drag
      //   redraws the board instantly: that is why replays used to teleport.
      // - Same task is what keeps the SELECTION invisible. The grey pickup
      //   tint on the source square and the legal-move dots are rendered from
      //   React state, so with no frame in between they are never painted.
      //
      // (`pressSquare` is the explore panel's recipe, unchanged. An older note
      // claimed it did not work on the trainer board; it does — verified on
      // quiet moves and captures alike.)
      pressSquare(fromEl);
      pressSquare(toEl);
      ap.injectClassTimer = setTimeout(() => {
        document.documentElement.classList.remove('clo-injecting');
      }, 150);
      clearTimeout(vs.verifyTimer);
      vs.verifyTimer = setTimeout(() => {
        if (ap.vs !== vs || !vs.injected) return;
        // Not having OBSERVED our move is not proof it failed. The tracker can
        // lose the thread across an injection — the trainer bursting several
        // plies (Key-Moves prefix, a variation resuming mid-line) re-anchors us
        // and clears the history our own move would have been matched against —
        // and then no 'injected' frame is ever attributed, though the move went
        // through perfectly. Ask the board instead: only a placement still
        // identical to the one the drag was meant to change means it was
        // refused (text gate, markup change), and only that may hand back.
        const snap = readBoardSnapshot();
        const stillThere = snap && placementKey(snap) === vs.injected.beforeKey;
        vs.injected = null;
        if (!stillThere) {
          log('auto-play: injected move landed but was not tracked — continuing');
          setStatus('');
          evaluateAutoPlay(); // rejoin the chain from wherever we are now
          return;
        }
        warn('auto-play: injected move did not land — handing back');
        vs.manualHold = true;
        setStatus('');
      }, C.injectVerifyMs);
    }

    /** Stop any in-flight/scheduled injection without cancelling the variation. */
    function stopReplaying() {
      const vs = ap.vs;
      clearTimeout(vs.injectTimer);
      vs.injectTimer = 0;
      clearTimeout(vs.verifyTimer);
      vs.verifyTimer = 0;
      vs.injected = null;
      clearTimeout(ap.injectClassTimer);
      document.documentElement.classList.remove('clo-injecting');
      setStatus('');
    }

    function cancelForVariation() {
      ap.vs.cancelled = true;
      stopReplaying();
      log('auto-play: cancelled for this variation');
    }

    // --- UI cluster on the overstudy widget ----------------------------------

    function ensureUi() {
      const widget = document.getElementById(REVIEW_WIDGET_ID);
      if (!widget) return;
      if (ap.ui && ap.ui.root.isConnected && ap.ui.root.parentElement === widget) return;
      const stale = document.getElementById(AP_CLUSTER_ID);
      if (stale) stale.remove();

      const root = document.createElement('span');
      root.id = AP_CLUSTER_ID;
      root.className = 'clo-ap';

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'clo-ap-toggle';
      toggle.textContent = 'Auto-play';
      toggle.setAttribute('aria-pressed', 'false');
      toggle.title = 'Auto-play moves you already answered correctly this session.\n' +
        'Auto-played moves count as normal correct answers — the move was proven earlier this ' +
        'session, and Chessable schedules it as passed. Failed or timed-out moves are never ' +
        'auto-played, and a move is never auto-played the first time it appears in a session.';
      toggle.addEventListener('click', () => { // no inline handlers
        ap.enabled = !ap.enabled;
        saveAutoPlayPref(C.enabledKey, ap.enabled);
        if (!ap.enabled) stopReplaying();
        syncUi();
        evaluateAutoPlay();
      });

      const speed = document.createElement('select');
      speed.className = 'clo-ap-speed';
      speed.title = 'Extra pause before each auto-played move';
      for (const [value, label] of [['fast', 'Fast'], ['normal', 'Normal'], ['relaxed', 'Relaxed']]) {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = label;
        speed.appendChild(opt);
      }
      speed.addEventListener('change', () => {
        ap.speed = Object.prototype.hasOwnProperty.call(C.speeds, speed.value)
          ? speed.value : C.defaultSpeed;
        saveAutoPlayPref(C.speedKey, ap.speed);
      });

      const status = document.createElement('button');
      status.type = 'button';
      status.className = 'clo-ap-status';
      status.hidden = true;
      status.addEventListener('click', cancelForVariation);

      root.append(toggle, speed, status);
      widget.appendChild(root);
      ap.ui = { root, toggle, speed, status };
      syncUi();
    }

    function syncUi() {
      if (!ap.ui) return;
      ap.ui.toggle.setAttribute('aria-pressed', String(ap.enabled));
      ap.ui.toggle.classList.toggle('clo-ap-toggle--on', ap.enabled);
      ap.ui.speed.value = ap.speed;
      ap.ui.speed.hidden = !ap.enabled;
      if (!ap.enabled) ap.ui.status.hidden = true;
    }

    /** Status chip; sticky text stays until replaced, flashes auto-hide. */
    function setStatus(text, sticky) {
      clearTimeout(ap.statusTimer);
      if (!ap.ui) return;
      ap.ui.status.textContent = text || '';
      ap.ui.status.hidden = !text || !ap.enabled;
      if (text && !sticky) {
        ap.statusTimer = setTimeout(() => { if (ap.ui) ap.ui.status.hidden = true; }, C.statusFlashMs);
      }
    }

    function saveAutoPlayPref(key, value) {
      try {
        chrome.storage.local.set({ [key]: value })
          .catch((err) => warn('storage write failed:', err));
      } catch (err) {
        warn('storage unavailable:', err);
      }
    }

    // --- wiring --------------------------------------------------------------

    function ensureObserver() {
      const board = getReviewBoard();
      if (!board) {
        if (ap.observer) { ap.observer.disconnect(); ap.observer = null; ap.observedBoard = null; }
        return;
      }
      if (board === ap.observedBoard && ap.observer) return;
      if (ap.observer) ap.observer.disconnect();
      ap.observer = new MutationObserver(onBoardMutation);
      ap.observer.observe(board, {
        childList: true, subtree: true,
        attributes: true, attributeFilter: ['data-piece', 'class'],
      });
      ap.observedBoard = board;
    }

    function onBoardMutation() {
      if (ap.rafPending) return;
      ap.rafPending = true;
      requestAnimationFrame(() => {
        ap.rafPending = false;
        processFrame();
      });
    }

    /** Board square under a pointer event, by geometry — during a drag the
     *  event's target is the floating piece, so a hit test is what works for
     *  clicks and drops alike. Null off the board. */
    function pointSquare(e) {
      for (const el of document.elementsFromPoint(e.clientX, e.clientY)) {
        const cls = typeof el.className === 'string' ? el.className
          : (el.className && el.className.baseVal) || '';
        const m = /(?:^|\s)square-([a-h][1-8])(?:\s|$)/.exec(cls);
        if (m) return m[1];
      }
      return null;
    }

    /** Feeds ap.recentSquares (alt-check pointer capture). Consecutive events
     *  on the same square collapse — a click is a down+up pair on one square,
     *  and only distinct squares can form a move. */
    function recordPointerSquare(e) {
      const sq = pointSquare(e);
      if (!sq) return;
      const rs = ap.recentSquares;
      const lastEntry = rs[rs.length - 1];
      if (lastEntry && lastEntry.sq === sq) { lastEntry.t = Date.now(); return; }
      rs.push({ sq, t: Date.now() });
      if (rs.length > 4) rs.shift();
    }

    function onTrustedPointer(e) {
      if (!e.isTrusted) return; // our own synthetic drags never count
      if (e.type === 'pointerdown') {
        const wrap = document.querySelector(SELECTORS.reviewBoardWrap);
        if (!wrap || !wrap.contains(e.target)) return;
        ap.pointerDownOnBoard = true;
        ap.lastPointerAt = Date.now();
        recordPointerSquare(e);
        // A real pointer on the board while we're replaying = "stop": hand
        // control back for the rest of this variation.
        if (ap.vs.injectTimer || ap.vs.injected) cancelForVariation();
        return;
      }
      // Drop of a drag that STARTED on the board. The move lands at this
      // moment, and the event's target is the floating piece under the cursor
      // (not a board child) — so credit the drop regardless of target, or a
      // piece held for a few seconds while thinking loses its user credit.
      if (e.type === 'pointerup' && ap.pointerDownOnBoard) {
        ap.pointerDownOnBoard = false;
        ap.lastPointerAt = Date.now();
        recordPointerSquare(e);
      }
    }

    function tick() {
      if (ap.contextDead) return;
      if (!isTrainerPath()) {
        if (ap.vs.oid) resetVariation(null, null);
        return;
      }
      ensureUi();
      syncVariation();
      ensureObserver();
      if (reviewBrowseReady()) {
        // Post-completion browse state: confirm the final answer (there is no
        // opponent reply after a line-ending move) and freeze the tracker —
        // browse navigation is not play.
        if (!ap.vs.suspended) {
          confirmPendingRecord('variation completed');
          ap.vs.suspended = true;
          stopReplaying();
        }
        return;
      }
      if (ap.vs.suspended) {
        // Back in a quiz under the same oid (restarted variation without an
        // intervening oid change) — start over from a fresh anchor.
        resetVariation(ap.vs.oid, ap.vs.bid);
      }
      processFrame();       // safety net for missed mutations
      evaluateAutoPlay();   // safety net for aborted/paused injections
    }

    // Prefs (shared across tabs via storage; off by default).
    (async () => {
      try {
        const stored = await chrome.storage.local.get([C.enabledKey, C.speedKey]);
        ap.enabled = Boolean(stored[C.enabledKey]);
        const speed = stored[C.speedKey];
        ap.speed = typeof speed === 'string' && Object.prototype.hasOwnProperty.call(C.speeds, speed)
          ? speed : C.defaultSpeed;
      } catch (err) {
        warn('auto-play: pref read failed:', err);
      }
      syncUi();
    })();

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes[C.enabledKey]) {
        ap.enabled = Boolean(changes[C.enabledKey].newValue);
        if (!ap.enabled) stopReplaying();
        syncUi();
      }
      if (changes[C.speedKey]) {
        const v = changes[C.speedKey].newValue;
        if (typeof v === 'string' && Object.prototype.hasOwnProperty.call(C.speeds, v)) ap.speed = v;
        syncUi();
      }
    });

    document.addEventListener('pointerdown', onTrustedPointer, true);
    document.addEventListener('pointerup', onTrustedPointer, true);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopReplaying(); // paused while hidden (§8) …
      else evaluateAutoPlay();              // … and re-armed on return
    });

    ap.pollTimer = setInterval(tick, CONFIG.review.pollMs);
    window.addEventListener('pagehide', () => {
      clearInterval(ap.pollTimer);
      clearTimeout(ap.saveTimer);
      saveRecord(); // best effort — flush an unsaved answer
    });
    tick();
    log('auto-play watcher active (top document)');
  }

  // ==========================================================================
  // 14) Sort variations in a chapter (top document, /course/<bid>/<lid>/e/)
  //
  // Reorders a chapter so the list reads the way you'd walk the move tree —
  // every line sharing an opening sequence sits together — with each set of
  // sibling branches ordered by how often that move is actually played in the
  // Lichess database, so you meet the likeliest positions first.
  //
  // Chessable's own drag-and-drop is NOT what persists an order — a drag only
  // dispatches a local React/Redux splice. The order is saved by POSTing the
  // chapter's COMPLETE oid list to /v1/saveOrder, so one request replaces the
  // whole ordering and N drags collapse into a single call. Ground-truthed
  // live, including the failure mode below.
  //
  // CRUCIAL: send every oid you read. saveOrder does not leave omitted oids
  // alone — it resets them to order 0, which sinks them to the FRONT of the
  // chapter sorted by oid. A partial "just move these three" call silently
  // scrambles everything else, hence the isPermutation() guard before the POST.
  // (Soft-deleted variations are excluded from the read and therefore do get
  // reset; they are invisible in the UI, so this is accepted.)
  //
  // The button is mounted on document.body and merely ANCHORED to Chessable's
  // toolbar — same rule as the review widget in section 9: nothing of ours is
  // ever inserted into their React tree.
  // ==========================================================================
  function initChapterSort() {
    // /course/<courseId>/<chapterId>/e — the chapter's "Edit Variations" page.
    // chapterId is 0 for a single-level course, so it is NOT a truthy test.
    const CHAPTER_PATH_RE = /^\/course\/(\d+)\/(\d+)\/e\/?$/;

    const cs = {
      bid: null, lid: null,
      widget: null, btn: null, statusEl: null,
      busy: false,
      job: null,   // in-flight run, so the button can cancel it
    };

    // --- the ordering itself, pure ------------------------------------------

    // Chessable returns a variation's line as a PGN-ish string with the number
    // glued to White's move ("1.e4 c5 2.Nf3 Nc6"). Tokenise it into
    // { san, ply } pairs where ply is 0-based and ABSOLUTE (0 = White's first
    // move), so a tactic that starts at move 25 can never share a tree node
    // with an opening line that happens to repeat the same SAN.
    const MOVE_NUM_RE = /^(\d+)(\.+)(.*)$/;
    const RESULT_RE   = /^(?:1-0|0-1|1\/2-1\/2|\*)$/;

    function linePlies(moves) {
      const out = [];
      let ply = null;
      for (const raw of String(moves || '').trim().split(/\s+/)) {
        if (!raw || RESULT_RE.test(raw)) continue;
        let rest = raw;
        const m = MOVE_NUM_RE.exec(raw);
        if (m) {
          // "12." → White to move, "12..." → Black. The SAN either follows in
          // the same token ("12.Nf3") or is the next one ("12. Nf3").
          ply = (Number(m[1]) - 1) * 2 + (m[2].length >= 3 ? 1 : 0);
          rest = m[3];
          if (!rest) continue;
        }
        const san = quickEditSan(rest); // also strips !? and other eval glyphs
        if (!san) continue;
        if (ply === null) ply = 0;      // unnumbered line — assume it starts at move 1
        out.push({ san, ply });
        ply += 1;
      }
      return out;
    }

    function isPermutation(a, b) {
      if (a.length !== b.length) return false;
      const seen = new Set(b);
      return seen.size === b.length && a.every((oid) => seen.has(oid));
    }

    // --- popularity ordering --------------------------------------------------
    //
    // Where a node has 2+ sibling branches, the branches are ordered by how
    // often that move is actually played in the Lichess database, most common
    // first — i.e. study what you are most likely to face first. Every branching point in a repertoire is a point
    // where the OPPONENT chooses (you don't prepare two answers to the same
    // position), so no side detection is needed; if a chapter ever did contain
    // your own alternatives, they would be ordered by crowd frequency too,
    // which is meaningless — that is the one assumption this button makes.
    //
    // Unranked siblings (move absent from the database, or no data for the
    // position at all) fall back to the structural rule: shortest line first,
    // ties keeping their current relative order. A variation that ENDS at a node
    // is emitted before the branches continuing past it.
    //
    // Lines that cannot be placed on a board from the start — tactics, and
    // anything beginning mid-game — are excluded and parked at the END of the
    // chapter in their existing order, because "most popular reply" is not a
    // meaningful question for them.

    // Check/mate suffixes are dropped on BOTH sides before comparing: Chessable
    // and CloSan agree on the move, but not always on writing "+".
    const bareSan = (san) => String(san).replace(/[+#]$/, '');

    /** CloSan position → FEN. The halfmove clock isn't tracked (or needed). */
    function positionToFen(pos) {
      const rows = [];
      for (let rank = 7; rank >= 0; rank--) {
        let row = '', empty = 0;
        for (let file = 0; file < 8; file++) {
          const piece = pos.board[rank * 8 + file];
          if (piece) { if (empty) { row += empty; empty = 0; } row += piece; } else empty++;
        }
        if (empty) row += empty;
        rows.push(row);
      }
      return [
        rows.join('/'),
        pos.side,
        pos.castling || '-',
        pos.ep >= 0 ? squareName(pos.ep) : '-',
        '0',
        String(pos.fullmove),
      ].join(' ');
    }

    /** Plays `san` on `pos`, or returns null if no legal move matches it. */
    function playSan(pos, san) {
      const want = bareSan(san);
      for (const mv of CloSan.generateMoves(pos)) {
        const uci = squareName(mv.from) + squareName(mv.to) + (mv.promo || '');
        const got = CloSan.moveToSan(pos, uci);
        if (got && bareSan(got) === want) return CloSan.makeMove(pos, mv);
      }
      return null;
    }

    /**
     * Builds the trie with a real position on every node.
     *
     * A line is replayed BEFORE anything is inserted, so a line that turns out
     * to be unplayable can never leave half of itself in the tree.
     * Returns { root, deferred } — deferred keeps its input order.
     */
    function buildPositionTree(variations) {
      const root = {
        ends: [], kids: new Map(), san: null,
        pos: CloSan.parseFen(START_FEN), depth: Infinity, seq: 0,
      };
      const deferred = [];

      for (const v of variations) {
        const line = linePlies(v.moves);
        // Informational cards carry no moves at all (Chessable writes "1.--").
        // They are chapter intros, so they belong at the very FRONT, not in the
        // unrankable tail with the tactics.
        if (!v.isTactic && !line.length) { root.ends.push(v.oid); continue; }
        // Tactics and mid-game starts are out of scope by design; the API gives
        // us no source FEN for them, so they could not be placed anyway.
        if (v.isTactic || !line.length || line[0].ply !== 0) { deferred.push(v); continue; }

        const path = [];
        let pos = root.pos, playable = true;
        for (const { san, ply } of line) {
          const next = playSan(pos, san);
          if (!next) { playable = false; break; }
          pos = next;
          path.push({ san, ply, pos });
        }
        if (!playable) { deferred.push(v); continue; }

        const len = path.length;
        let node = root;
        for (const step of path) {
          const key = step.ply + '|' + step.san;
          let kid = node.kids.get(key);
          if (!kid) {
            kid = {
              ends: [], kids: new Map(), san: step.san,
              pos: step.pos, depth: len, seq: node.kids.size,
            };
            node.kids.set(key, kid);
          } else if (len < kid.depth) {
            kid.depth = len;
          }
          node = kid;
        }
        node.ends.push(v.oid);
      }
      return { root, deferred };
    }

    /** Every node where the opponent picks between 2+ continuations. */
    function branchNodes(root) {
      const out = [];
      (function walk(node) {
        if (node.kids.size >= 2) out.push(node);
        for (const kid of node.kids.values()) walk(kid);
      })(root);
      return out;
    }

    // --- explorer results cache (chrome.storage.local) ----------------------

    // Tagged with the filters, so changing CONFIG.lichess invalidates cleanly.
    const popCacheTag = () =>
      'r:' + CONFIG.lichess.ratings.join(',') + '|s:' + CONFIG.lichess.speeds.join(',');

    async function loadPopCache() {
      try {
        const got = await chrome.storage.local.get(CONFIG.chapterSort.popularity.cacheKey);
        const raw = got && got[CONFIG.chapterSort.popularity.cacheKey];
        return (raw && typeof raw === 'object') ? raw : {};
      } catch (err) {
        warn('popularity cache unreadable — continuing without it:', err);
        return {};
      }
    }

    async function savePopCache(cache) {
      const { cacheKey, cacheMax } = CONFIG.chapterSort.popularity;
      try {
        let entries = Object.entries(cache);
        if (entries.length > cacheMax) { // prune oldest first
          entries.sort((a, b) => (b[1].t || 0) - (a[1].t || 0));
          entries = entries.slice(0, cacheMax);
        }
        await chrome.storage.local.set({ [cacheKey]: Object.fromEntries(entries) });
      } catch (err) {
        warn('could not persist the popularity cache:', err);
      }
    }

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    /**
     * Fills node.pop = { san: gameCount } for every branching node, from cache
     * or the Lichess explorer (via the same background worker the panel uses).
     * Reports progress and honours cancellation between requests.
     */
    async function fetchPopularity(nodes, job) {
      const cache = await loadPopCache();
      const tag = popCacheTag();
      let fetched = 0, fromCache = 0, empty = 0, dirty = false;

      for (let i = 0; i < nodes.length; i++) {
        if (job.cancelled) throw new Error('cancelled');
        const node = nodes[i];
        const fen = positionToFen(node.pos);
        const key = tag + '||' + fen;

        const hit = cache[key];
        if (hit && hit.m) { node.pop = hit.m; fromCache++; continue; }

        setStatus(`Checking Lichess… ${i + 1}/${nodes.length} positions`, '');
        let data;
        try {
          data = await fetchExplorerData(fen);
        } catch (err) {
          if (err.isRateLimit) {
            // Same cooldown the panel honours, then one retry.
            setStatus('Lichess rate limit — waiting 60 s…', 'warn');
            await sleep(CONFIG.lichess.rateLimitCooldownMs);
            if (job.cancelled) throw new Error('cancelled');
            setStatus(`Checking Lichess… ${i + 1}/${nodes.length} positions`, '');
            data = await fetchExplorerData(fen);
          } else if (err.isAuth) {
            throw new Error(err.noToken
              ? 'a Lichess API token is needed — add one in the extension options'
              : 'Lichess rejected the API token — check it in the extension options');
          } else {
            throw err;
          }
        }

        const counts = {};
        for (const m of (data && data.moves) || []) {
          counts[bareSan(m.san)] = (m.white || 0) + (m.draws || 0) + (m.black || 0);
        }
        if (!Object.keys(counts).length) empty++;
        node.pop = counts;
        cache[key] = { m: counts, t: Date.now() };
        dirty = true;
        fetched++;
        if (i < nodes.length - 1) await sleep(CONFIG.chapterSort.popularity.requestGapMs);
      }

      if (dirty) await savePopCache(cache);
      return { fetched, fromCache, empty };
    }

    /**
     * Walks the tree emitting oids, ordering siblings by popularity where it is
     * known. Also logs one report line per branching point (SAN + share of games
     * at that position), since a silent reshuffle is hard to sanity-check.
     */
    function walkByPopularity(root, yourSide) {
      const out = [];
      let unranked = 0, ownSide = 0;

      (function walk(node, lineSan) {
        for (const oid of node.ends) out.push(oid);
        const kids = [...node.kids.values()];
        const pop = node.pop || null;
        const countOf = (kid) => {
          if (!pop) return -1;
          const n = pop[bareSan(kid.san)];
          return n === undefined ? -1 : n;
        };
        kids.sort((a, b) => {
          const ca = countOf(a), cb = countOf(b);
          if (ca !== cb) return cb - ca;              // most played first
          return a.depth - b.depth || a.seq - b.seq;  // else shortest line first
        });

        if (kids.length >= 2) {
          const total = pop ? Object.values(pop).reduce((s, n) => s + n, 0) : 0;
          const parts = kids.map((k) => {
            const n = countOf(k);
            if (n < 0) { unranked++; return `${k.san} —`; }
            const pct = total ? Math.round((n / total) * 100) : 0;
            return `${k.san} ${pct}% (${n})`;
          });
          // A branch where YOU choose is your own prepared alternatives, not
          // something the opponent picks — ranking those by how often the crowd
          // plays them is meaningless. Repertoires rarely have any, so they are
          // flagged rather than treated specially.
          const yours = yourSide && node.pos && node.pos.side === yourSide;
          if (yours) ownSide++;
          log(`  ${lineSan || '(start)'} → ${parts.join(', ')}${yours ? '   [your move — ranking is meaningless here]' : ''}`);
        }

        for (const kid of kids) walk(kid, (lineSan ? lineSan + ' ' : '') + kid.san);
      })(root, '');

      return { order: out, unranked, ownSide };
    }

    // --- Chessable's API ----------------------------------------------------

    function apiHeaders() {
      const jwt = localStorage.getItem(CONFIG.chapterSort.jwtKey);
      if (!jwt) return null;
      return {
        'Authorization': 'Bearer ' + jwt,
        'Content-Type': 'application/json',
        'platform': 'web',
      };
    }

    async function fetchChapter(headers) {
      const url = location.origin + CONFIG.chapterSort.readPath +
        `?bid=${cs.bid}&lid=${cs.lid}&includeDeleted=0&locale=en`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`could not read the chapter (HTTP ${res.status})`);
      const body = await res.json();
      const data = body && body.data;
      const list = data && data.variations;
      if (!Array.isArray(list)) throw new Error('unexpected response reading the chapter');
      // course.color is 'white' | 'black' (the side the course is written for);
      // anything else means "unknown", and no branch gets flagged.
      const color = data.course && data.course.color;
      const yourSide = color === 'white' ? 'w' : color === 'black' ? 'b' : null;
      return { variations: list, yourSide };
    }

    async function postOrder(headers, order) {
      const res = await fetch(location.origin + CONFIG.chapterSort.writePath, {
        method: 'POST',
        headers,
        body: JSON.stringify({ bid: Number(cs.bid), lid: Number(cs.lid), order }),
      });
      if (!res.ok) throw new Error(`could not save the order (HTTP ${res.status})`);
      const body = await res.json().catch(() => null);
      if (!body || !body.data || body.data.status !== 'ok') {
        throw new Error('the server did not confirm the new order');
      }
    }

    // --- the button ---------------------------------------------------------

    /** Guard, save, reload. Returns true when the page is on its way out. */
    async function saveComputedOrder(headers, current, order, note) {
      // A bug that dropped or duplicated an oid would not fail loudly — it
      // would quietly reshuffle the chapter (see the saveOrder note above).
      if (!isPermutation(current, order)) {
        throw new Error('computed order did not match the chapter — nothing saved');
      }
      const suffix = note ? ' — ' + note : '';
      if (order.every((oid, i) => oid === current[i])) {
        setStatus(`Already in this order (${order.length} variations)${suffix}.`, 'ok');
        return false;
      }
      // Once the POST lands, the old order is gone from the page — log it so
      // it can be restored by hand if the result isn't what was wanted.
      log(`sorting chapter ${cs.bid}/${cs.lid}; previous order was`, current.join(','));
      setStatus('Saving new order…', '');
      await postOrder(headers, order);
      log('chapter reordered:', order.join(','));
      setStatus(`Sorted ${order.length} variations${suffix} — reloading…`, 'ok');
      setTimeout(() => location.reload(), CONFIG.chapterSort.reloadDelayMs);
      return true;
    }

    async function runPopularitySort() {
      if (cs.busy || !cs.bid) return;
      if (typeof CloSan === 'undefined') {
        setStatus('move engine unavailable — reload the page', 'warn');
        return;
      }
      cs.busy = true;
      cs.job = { cancelled: false };
      const job = cs.job;
      syncButton();
      let reloading = false;
      try {
        setStatus('Reading chapter…', '');
        const headers = apiHeaders();
        if (!headers) throw new Error('no Chessable session found — reload the page');
        const { variations, yourSide } = await fetchChapter(headers);
        if (!variations.length) { setStatus('This chapter has no variations.', 'warn'); return; }
        const current = variations.map((v) => v.oid);

        const { root, deferred } = buildPositionTree(variations);
        if (deferred.length) {
          warn(`${deferred.length} line(s) can't be ranked (tactic or mid-game start) ` +
               '— moving them to the end of the chapter:',
               deferred.map((v) => v.oid).join(','));
        }
        const nodes = branchNodes(root);
        if (!nodes.length && !root.kids.size) {
          setStatus('No lines here can be ranked by popularity.', 'warn');
          return;
        }

        log(`popularity sort: ${nodes.length} branching point(s) to check`);
        const stats = await fetchPopularity(nodes, job);
        if (job.cancelled) throw new Error('cancelled');
        log(`Lichess: ${stats.fetched} fetched, ${stats.fromCache} cached` +
            (stats.empty ? `, ${stats.empty} with no data` : ''));

        const { order: ranked, unranked, ownSide } = walkByPopularity(root, yourSide);
        // Unrankable lines keep their existing relative order, at the end.
        const order = ranked.concat(deferred.map((v) => v.oid));
        if (ownSide) {
          warn(`${ownSide} branching point(s) are YOUR move, not the opponent's — ` +
               'popularity says nothing useful there (see the report above)');
        }

        const notes = [];
        if (deferred.length) notes.push(`${deferred.length} unrankable moved to the end`);
        if (unranked) notes.push(`${unranked} branch(es) not in the database`);
        reloading = await saveComputedOrder(headers, current, order, notes.join(', '));
      } catch (err) {
        if (String(err && err.message) === 'cancelled') {
          log('popularity sort cancelled — nothing was saved');
          setStatus('Cancelled — nothing saved.', 'warn');
        } else {
          warn('popularity sort failed:', err);
          setStatus(String(err.message || err), 'warn');
        }
      } finally {
        if (!reloading) { cs.busy = false; cs.job = null; syncButton(); }
      }
    }

    function setStatus(text, kind) {
      if (!cs.statusEl) return;
      cs.statusEl.textContent = text;
      cs.statusEl.hidden = !text;
      cs.statusEl.className = 'clo-chapter-status' +
        (kind ? ' clo-chapter-status--' + kind : '');
    }

    /**
     * The button doubles as Cancel while a run is in flight — a queue of
     * Lichess calls should always be interruptible.
     */
    function syncButton() {
      if (!cs.btn) return;
      cs.btn.textContent = cs.busy ? 'Cancel' : 'Sort by popularity';
      cs.btn.classList.toggle('clo-chapter-btn--cancel', cs.busy);
    }

    function mountWidget() {
      const stale = document.getElementById(CHAPTER_WIDGET_ID);
      if (stale) stale.remove(); // defensive: no duplicates across re-inits

      const widget = document.createElement('div');
      widget.id = CHAPTER_WIDGET_ID;
      widget.className = 'clo-chapter';

      const title = document.createElement('span');
      title.className = 'clo-chapter-title';
      title.textContent = 'LiChessable';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'clo-chapter-btn';
      btn.textContent = 'Sort by popularity';
      btn.title = 'Group this chapter by the move tree, ordering every branching ' +
        'point so the opponent\'s most commonly played move comes first ' +
        '(Lichess database). Tactics and lines starting mid-game move to the end.';
      btn.addEventListener('click', () => { // no inline handlers
        if (cs.job && cs.busy) { cs.job.cancelled = true; setStatus('Cancelling…', 'warn'); return; }
        runPopularitySort();
      });

      const statusEl = document.createElement('span');
      statusEl.className = 'clo-chapter-status';
      statusEl.hidden = true;

      widget.append(title, btn, statusEl);
      document.body.appendChild(widget);

      cs.widget = widget;
      cs.btn = btn;
      cs.statusEl = statusEl;
    }

    /**
     * Preferred home is the empty gutter LEFT of Chessable's content column,
     * top-aligned with their toolbar row — the same gutter-first approach the
     * review panel uses. On a narrow window that gutter disappears, and the
     * inline styles are cleared so the stylesheet's fixed-corner fallback
     * applies. position:fixed and getBoundingClientRect are both
     * viewport-relative, so the numbers line up directly.
     */
    function positionWidget() {
      if (!cs.widget || cs.widget.hidden) return;
      const toolbar = document.querySelector(SELECTORS.chapterToolbar);
      if (!toolbar) return;
      const rect = toolbar.getBoundingClientRect();
      if (!rect.width) return;
      const { gap, minGutter } = CONFIG.chapterSort;
      const width = cs.widget.offsetWidth || minGutter;
      if (rect.left >= width + gap * 2) {
        cs.widget.style.left = Math.max(gap, rect.left - gap - width) + 'px';
        cs.widget.style.top = Math.max(gap, rect.top) + 'px';
        cs.widget.style.right = 'auto';
        cs.widget.style.bottom = 'auto';
      } else {
        cs.widget.style.left = '';
        cs.widget.style.top = '';
        cs.widget.style.right = '';
        cs.widget.style.bottom = '';
      }
    }

    function tick() {
      const m = CHAPTER_PATH_RE.exec(location.pathname);
      // The toolbar is also the "page has finished rendering" signal.
      const toolbar = m && document.querySelector(SELECTORS.chapterToolbar);
      if (!toolbar) {
        if (cs.widget) cs.widget.hidden = true;
        return;
      }
      if (cs.bid !== m[1] || cs.lid !== m[2]) {
        cs.bid = m[1];
        cs.lid = m[2];
        setStatus('', ''); // SPA-switched to another chapter — drop the old message
      }
      if (!cs.widget || !cs.widget.isConnected) mountWidget(); // idempotent self-heal
      cs.widget.hidden = false;
      syncButton();
      positionWidget();
    }

    const pollTimer = setInterval(tick, CONFIG.chapterSort.pollMs);
    window.addEventListener('pagehide', () => clearInterval(pollTimer));
    window.addEventListener('resize', positionWidget);
    window.addEventListener('scroll', positionWidget, true);
    tick();
  }

  // ==========================================================================
  // 15) Wrong-guess alternative check (top document — /practice/ and /learn/)
  //
  // When the trainer refuses an answer ("Incorrect"), the auto-play tracker
  // captures the refused move — primarily from the user's own pointer squares
  // (maybeCaptureRefusedGuess; a refused move usually never commits to the
  // board DOM, so there is nothing to observe), with the rollback hook
  // (rollbackTo) covering committed-then-retracted moves — and hands an OFFER
  // to this module: a body-mounted chip appears under the board ("Check Nf3
  // as alternative?"). Clicking it opens a popup that runs TWO tagged engine
  // searches to CONFIG.altCheck.targetDepth — the position after the COURSE
  // move (offer.coursePostFen) and the position after the guess — regardless
  // of the panel's engine toggle. state.altCheckBusy makes syncEngine stand
  // down while they run; the searches carry a reqId that engine.js echoes on
  // their updates, so the panel's fen-matched listener and this module's
  // id-matched one never confuse each other's streams. Both evals are
  // White-perspective; the verdict is the MOVER's pawn loss vs the course
  // move (mate scores mapped near ±mateCp so "misses a mate" reads as a big
  // loss while mate-in-3 vs mate-in-5 stays green). The Add button colours
  // green/yellow/red by CONFIG.altCheck.thresholds; red requires a second
  // "Add anyway" click. Each row also shows the move's Lichess-explorer
  // score/games for the quiz position (one cached fetch of the panel's
  // explorer with a deeper move limit — a refused move is often rare).
  // Adding reuses the quick-edit alt-move job unchanged (mode 'alt' —
  // background.js drives the edit page), with rights shared through
  // quickEditApi (lazy per-course probe, cached per session). A probe is
  // started at most once per popup-open and a FAILED probe surfaces as a
  // "close and reopen to retry" error — never a silent re-probe loop.
  // ==========================================================================

  function initAltCheck() {
    if (typeof CloSan === 'undefined') return;
    const C = CONFIG.altCheck;
    let seq = 0;

    const ac = {
      offer: null,        // latest captured wrong guess (what the chip shows)
      job: null,          // the offer the OPEN popup is checking/saving
      chip: null,
      chipLabel: null,
      popup: null,
      els: null,          // cached popup child refs
      phase: 'idle',      // idle|best|guess|ready|saving|error ('best' = the course-move search)
      reqId: null,        // tag prefix of the running check's searches
      postFen: null,      // FEN after the guess (built from the oracle position)
      courseEval: null,   // { cp, mate } after the course move, at target depth (multipv 1)
      guessEval: null,
      loss: null,         // mover-perspective pawn loss vs the course move
      band: null,         // 'green' | 'yellow' | 'red'
      confirmArmed: false, // red verdict: first Add click arms, second sends
      probeStarted: false, // a rights probe was launched for THIS popup-open
      probeFailed: false,  // …and it failed — show the retry hint, don't re-probe
      watchdog: 0,
    };
    // Explorer responses for the popup's win-rate line, keyed like the panel
    // LRU (first four FEN fields). Separate from the panel cache: these are
    // fetched with the deeper C.dbMovesLimit.
    const acDbCache = new Map();

    // --- chip ----------------------------------------------------------------

    function buildChip() {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.id = AC_CHIP_ID;
      chip.className = 'clo-ac-chip';
      chip.hidden = true;
      const label = document.createElement('span');
      label.className = 'clo-ac-chip-label';
      const x = document.createElement('span');
      x.className = 'clo-ac-chip-x';
      x.textContent = '×';
      x.title = 'Dismiss';
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        dismissOffer();
      });
      chip.append(label, x);
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        openPopup();
      });
      document.body.appendChild(chip);
      ac.chip = chip;
      ac.chipLabel = label;
    }

    /** Below the board / footer / overstudy widget, left-aligned with the
     *  board — absolute in DOCUMENT coordinates like every other widget. */
    function positionChip() {
      if (!ac.chip || ac.chip.hidden) return;
      const board = getReviewBoard();
      if (!board) return;
      const rect = board.getBoundingClientRect();
      if (!rect.width) return;
      let anchorBottom = rect.bottom;
      const footer = document.querySelector(SELECTORS.trainerFooter);
      const fr = footer ? footer.getBoundingClientRect() : null;
      if (fr && fr.height) anchorBottom = Math.max(anchorBottom, fr.bottom);
      const widget = document.getElementById(REVIEW_WIDGET_ID);
      const wr = widget && !widget.hidden ? widget.getBoundingClientRect() : null;
      if (wr && wr.height) anchorBottom = Math.max(anchorBottom, wr.bottom);
      setInlinePx(ac.chip, {
        left: Math.max(8, rect.left) + window.scrollX,
        top: anchorBottom + 8 + window.scrollY,
      });
    }

    function showChip(offer) {
      ac.offer = offer;
      if (!ac.chip || !ac.chip.isConnected) buildChip();
      ac.chipLabel.textContent = 'Check ' + offer.sanGuess + ' as alternative?';
      ac.chip.hidden = false;
      positionChip();
    }

    function hideChip() {
      if (ac.chip) ac.chip.hidden = true;
    }

    /** Chip + offer gone; the open popup (if any) is left alone. */
    function dismissOffer() {
      ac.offer = null;
      hideChip();
    }

    // --- popup ---------------------------------------------------------------

    function buildPopup() {
      const popup = document.createElement('div');
      popup.id = AC_POPUP_ID;
      popup.className = 'clo-ac-popup';
      popup.hidden = true;

      const title = document.createElement('div');
      title.className = 'clo-ac-title';

      const makeRow = (label) => {
        const row = document.createElement('div');
        row.className = 'clo-ac-row';
        const labelEl = document.createElement('span');
        labelEl.className = 'clo-ac-row-label';
        labelEl.textContent = label;
        const dbEl = document.createElement('span');
        dbEl.className = 'clo-ac-row-db'; // Lichess win rate ("54% · 1.2k"), filled async
        const evalEl = document.createElement('span');
        evalEl.className = 'clo-ac-row-eval';
        evalEl.textContent = '—';
        const depthEl = document.createElement('span');
        depthEl.className = 'clo-ac-row-depth';
        row.append(labelEl, dbEl, evalEl, depthEl);
        popup.appendChild(row);
        return { row, labelEl, dbEl, evalEl, depthEl };
      };

      popup.appendChild(title);
      const courseRow = makeRow('Course move');
      const guessRow = makeRow('Your move');

      const verdict = document.createElement('div');
      verdict.className = 'clo-ac-verdict';
      verdict.hidden = true;

      const scopeLabel = document.createElement('label');
      scopeLabel.className = 'clo-ac-scope';
      const scopeBox = document.createElement('input');
      scopeBox.type = 'checkbox';
      scopeLabel.appendChild(scopeBox);
      scopeLabel.appendChild(document.createTextNode(' For this variation only'));

      const status = document.createElement('div');
      status.className = 'clo-ac-status';
      status.hidden = true;

      const actions = document.createElement('div');
      actions.className = 'clo-ac-actions';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'clo-ac-cancel';
      cancel.textContent = 'Close';
      cancel.addEventListener('click', closePopup);
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'clo-ac-add';
      add.textContent = 'Add alternative';
      add.disabled = true;
      add.addEventListener('click', doAdd);
      actions.append(cancel, add);

      popup.append(verdict, scopeLabel, status, actions);
      // Same key discipline as the quick-edit popup: MoveTrainer2 binds
      // single-key shortcuts on document and does not care what has focus.
      for (const type of ['keydown', 'keypress', 'keyup']) {
        popup.addEventListener(type, (e) => {
          e.stopPropagation();
          if (type === 'keydown' && e.key === 'Escape' && ac.phase !== 'saving') closePopup();
        });
      }
      document.body.appendChild(popup);
      ac.popup = popup;
      ac.els = { title, courseRow, guessRow, verdict, scopeBox, status, add, cancel };
    }

    function setAcStatus(text, isError) {
      if (!ac.els) return;
      ac.els.status.textContent = text || '';
      ac.els.status.className = 'clo-ac-status' + (isError ? ' clo-error' : '');
      ac.els.status.hidden = !text;
    }

    function openPopup() {
      if (!ac.offer) return;
      if (!ac.popup || !ac.popup.isConnected) buildPopup();
      // A save in flight is never abandoned; a check already running for THIS
      // offer just re-shows. A different offer starts a fresh check (its new
      // reqId orphans the old search's updates; the analyze supersedes it).
      if (ac.phase === 'saving' ||
          (ac.job === ac.offer && ac.phase !== 'idle' && ac.phase !== 'error')) {
        ac.popup.hidden = false;
        return;
      }
      const offer = ac.offer;
      ac.job = offer;
      ac.confirmArmed = false;
      ac.courseEval = null;
      ac.guessEval = null;
      ac.loss = null;
      ac.band = null;
      ac.probeStarted = false;
      ac.probeFailed = false;

      ac.els.title.textContent = offer.sanGuess + ' instead of ' + offer.mainlineSan + '?';
      ac.els.courseRow.labelEl.textContent = 'Course move (' + offer.mainlineSan + ')';
      ac.els.courseRow.evalEl.textContent = '—';
      ac.els.courseRow.depthEl.textContent = '';
      ac.els.courseRow.dbEl.textContent = '';
      ac.els.guessRow.labelEl.textContent = 'Your move (' + offer.sanGuess + ')';
      ac.els.guessRow.evalEl.textContent = '—';
      ac.els.guessRow.depthEl.textContent = '';
      ac.els.guessRow.dbEl.textContent = '';
      ac.els.verdict.hidden = true;
      ac.els.verdict.className = 'clo-ac-verdict';
      ac.els.scopeBox.checked = false; // matches the quick-edit default
      ac.els.add.textContent = 'Add alternative';
      ac.els.add.className = 'clo-ac-add';
      ac.els.add.disabled = true;
      setAcStatus('', false);

      // Beside the chip; clamped into the viewport (position:fixed, like the
      // quick-edit popup — placed once at open time).
      const anchor = ac.chip && !ac.chip.hidden ? ac.chip.getBoundingClientRect() : null;
      const popupW = 348; // CSS width (340) + shadow margin, for the viewport clamp
      const left = anchor ? anchor.left : (window.innerWidth - popupW) / 2;
      const top = anchor ? anchor.bottom + 6 : window.innerHeight / 3;
      ac.popup.style.left = Math.round(Math.min(Math.max(8, left), window.innerWidth - popupW)) + 'px';
      ac.popup.style.top = Math.round(Math.min(Math.max(8, top), window.innerHeight - 260)) + 'px';
      ac.popup.hidden = false;

      // The guess is applied to the plan's own exact position; a failure to
      // resolve it means the offer is stale/garbled — no engine run.
      ac.postFen = fenAfterUci(offer.preFen, offer.uci);
      if (!ac.postFen) {
        ac.phase = 'error';
        setAcStatus('Could not reconstruct the position for this guess.', true);
        return;
      }

      // An orphaned script (extension reloaded, page not) can still show the
      // chip and popup, but every chrome.* call throws — starting the engine
      // flow would hang on "Analyzing…" forever. Say what to do instead.
      if (!extensionAlive()) {
        ac.phase = 'error';
        setAcStatus('The extension was reloaded — reload this page to run the engine check.', true);
        return;
      }

      applyAcRights();
      beginCheck(offer);
      loadAcWinRates(offer);
    }

    function closePopup() {
      if (ac.phase === 'saving') return; // the driver window is mid-flight
      if (ac.popup) ac.popup.hidden = true;
      releaseEngine();
      ac.job = null;
      ac.phase = 'idle';
    }

    /** Chip, popup and engine all torn down (path/variation change). */
    function dismissAll() {
      dismissOffer();
      if (ac.popup) ac.popup.hidden = true;
      releaseEngine();
      ac.job = null;
      ac.phase = 'idle';
    }

    // --- rights (shared with quick-edit through quickEditApi) ---------------

    function acRights() {
      return quickEditApi && ac.job ? quickEditApi.rightsFor(ac.job.bid) : null;
    }

    function applyAcRights() {
      if (!ac.popup || ac.popup.hidden || !ac.job || ac.phase === 'saving') return;
      const rights = acRights();
      if (rights === false) {
        setAcStatus("You don't have edit rights for this course.", true);
      } else if (rights !== true) {
        // One probe per popup-open; a failed probe becomes a visible,
        // user-retryable error — never a silent endless re-probe (each probe
        // opens a driver window, and a wedged probe used to leave the popup
        // stuck on this status forever).
        if (ac.probeFailed) {
          setAcStatus('Could not check edit rights — close and reopen to retry.', true);
        } else {
          setAcStatus('Checking edit rights…', false);
          if (!ac.probeStarted && quickEditApi) {
            ac.probeStarted = true;
            quickEditApi.probe(ac.job.bid, ac.job.oid, popupDriverBounds(ac.popup));
          }
        }
      } else if (ac.phase === 'best' || ac.phase === 'guess') {
        setAcStatus('Analyzing…', false);
      } else {
        setAcStatus('', false);
      }
      updateAddEnabled();
    }

    function updateAddEnabled() {
      if (!ac.els) return;
      ac.els.add.disabled = !(ac.phase === 'ready' && acRights() === true);
    }

    // --- the two searches ----------------------------------------------------

    function beginCheck(offer) {
      state.altCheckBusy = true;   // syncEngine stands down (see its comment)
      state.engineFen = null;      // any panel search is superseded by ours
      ac.reqId = 'ac' + Date.now() + '-' + (++seq);
      ac.phase = 'best';
      setAcStatus('Analyzing…', false);
      log('alt-check: engine check started for', offer.sanGuess, '(req ' + ac.reqId + ')');
      engineSend({
        type: 'clo-engine-analyze', fen: offer.coursePostFen, profile: engineProfile(),
        reqId: ac.reqId + ':pre', depth: C.targetDepth,
      });
      pingEngineIfSilent();
      clearTimeout(ac.watchdog);
      ac.watchdog = setTimeout(() => {
        if (ac.phase === 'best' || ac.phase === 'guess') {
          ac.phase = 'error';
          setAcStatus('Engine check timed out.', true);
          releaseEngine();
        }
      }, C.searchTimeoutMs);
    }

    /** Ends this module's claim on the engine and lets the panel resume. */
    function releaseEngine() {
      clearTimeout(ac.watchdog);
      ac.watchdog = 0;
      ac.reqId = null;
      if (!state.altCheckBusy) return;
      state.altCheckBusy = false;
      engineSend({ type: 'clo-engine-stop' });
      state.engineFen = null;
      syncEngine(); // restart the panel's search where it should be running
    }

    function renderAcRow(row, pv, depth, done) {
      row.evalEl.textContent = formatEval(pv);
      row.depthEl.textContent = 'depth ' + Math.min(depth, C.targetDepth) + '/' + C.targetDepth +
        (done ? '' : '…');
    }

    function onAcUpdate(msg) {
      const which = msg.reqId.slice(ac.reqId.length + 1); // 'pre' | 'post'
      const pv = (Array.isArray(msg.pvs) ? msg.pvs : []).find((p) => p.multipv === 1);
      if (!pv) return;
      const finished = msg.done || msg.depth >= C.targetDepth;
      if (which === 'pre' && ac.phase === 'best') {
        renderAcRow(ac.els.courseRow, pv, msg.depth, finished);
        if (finished) {
          ac.courseEval = { cp: pv.cp, mate: pv.mate };
          ac.phase = 'guess';
          engineSend({
            type: 'clo-engine-analyze', fen: ac.postFen, profile: engineProfile(),
            reqId: ac.reqId + ':post', depth: C.targetDepth,
          });
        }
      } else if (which === 'post' && ac.phase === 'guess') {
        renderAcRow(ac.els.guessRow, pv, msg.depth, finished);
        if (finished) {
          ac.guessEval = { cp: pv.cp, mate: pv.mate };
          finishCheck();
        }
      }
    }

    function onAcStatus(msg) {
      if (msg.status === 'loading') setAcStatus('Loading engine…', false);
      else if (msg.status === 'ready') setAcStatus('Analyzing…', false);
      else if (msg.status === 'error') {
        const detail = String(msg.detail || '');
        ac.phase = 'error';
        setAcStatus(detail.startsWith('missing-build')
          ? (detail.includes('lite') ? 'Lite' : 'Full') + ' engine files missing — see README'
          : 'Engine error — see the console.', true);
        releaseEngine();
      }
    }

    /** Mover-perspective centipawns; mates map near ±mateCp minus the mate
     *  distance, so a missed mate reads as a huge loss while a slightly
     *  slower mate stays negligible. */
    function moverCp(ev) {
      const sign = ac.job.moverColor === 'w' ? 1 : -1;
      if (typeof ev.mate === 'number') {
        const m = sign * ev.mate;
        return m > 0 ? C.mateCp - m : -C.mateCp - m;
      }
      return sign * (typeof ev.cp === 'number' ? ev.cp : 0);
    }

    function finishCheck() {
      ac.phase = 'ready';
      // Our own searches are done; give the engine back right away (the
      // popup stays open on the recorded evals).
      releaseEngine();

      // Negative differences clamp to 0 — a guess that evaluates BETTER than
      // the course move is simply "as good as" it for the verdict.
      const loss = Math.max(0, (moverCp(ac.courseEval) - moverCp(ac.guessEval)) / 100);
      ac.loss = loss;
      ac.band = loss < C.thresholds.green ? 'green'
        : loss <= C.thresholds.yellow ? 'yellow' : 'red';
      ac.els.verdict.hidden = false;
      ac.els.verdict.className = 'clo-ac-verdict clo-ac-verdict--' + ac.band;
      ac.els.verdict.textContent = loss === 0
        ? 'As good as the course move.'
        : 'Loses ' + loss.toFixed(2) + ' pawns vs the course move.';
      ac.els.add.className = 'clo-ac-add clo-ac-add--' + ac.band;
      ac.els.add.textContent = 'Add alternative (−' + loss.toFixed(2) + ')';
      log('alt-check: verdict for', ac.job.sanGuess, '— loss', loss.toFixed(2),
        'vs ' + ac.job.mainlineSan, '(' + ac.band + ')');
      applyAcRights();
    }

    // --- Lichess win rates for the two moves (one explorer fetch) ------------

    /** "54% · 1.2k" (mover-perspective score · game count) for `san` in the
     *  explorer response, or "no games". */
    function renderAcDb(row, data, san, mover) {
      const want = quickEditBareSan(san);
      const mv = (Array.isArray(data.moves) ? data.moves : [])
        .find((m) => quickEditBareSan(m.san || '') === want);
      const total = mv ? (mv.white || 0) + (mv.draws || 0) + (mv.black || 0) : 0;
      if (!total) {
        row.dbEl.textContent = 'no games';
        row.dbEl.title = 'No games with this move in the Lichess database (current filters)';
        return;
      }
      const wins = mover === 'w' ? (mv.white || 0) : (mv.black || 0);
      const score = Math.round(100 * (wins + (mv.draws || 0) / 2) / total);
      row.dbEl.textContent = score + '% · ' + formatGames(total);
      row.dbEl.title = total.toLocaleString('en-US') + ' Lichess games — ' + score +
        '% score for ' + (mover === 'w' ? 'White' : 'Black');
    }

    /** Fetches (and caches) the quiz position's explorer stats and fills the
     *  win-rate cell of both rows. Failures just leave the cells empty — the
     *  engine verdict is the popup's job; the database line is a bonus. */
    async function loadAcWinRates(offer) {
      const key = offer.preFen.split(' ').slice(0, 4).join(' ');
      let data = acDbCache.get(key);
      if (!data) {
        try {
          data = await fetchExplorerData(offer.preFen, C.dbMovesLimit);
        } catch (err) {
          log('alt-check: explorer lookup failed:', String((err && err.message) || err));
          return;
        }
        acDbCache.set(key, data);
        if (acDbCache.size > C.dbCacheMax) acDbCache.delete(acDbCache.keys().next().value);
      }
      if (ac.job !== offer || !ac.els || !ac.popup || ac.popup.hidden) return; // popup moved on
      renderAcDb(ac.els.courseRow, data, offer.mainlineSan, offer.moverColor);
      renderAcDb(ac.els.guessRow, data, offer.sanGuess, offer.moverColor);
    }

    // --- adding the alternative (quick-edit alt job, unchanged) --------------

    function doAdd() {
      if (ac.phase !== 'ready' || !ac.job || acRights() !== true) return;
      if (ac.band === 'red' && !ac.confirmArmed) {
        ac.confirmArmed = true;
        ac.els.add.textContent = 'Add anyway';
        setAcStatus('Loses ' + ac.loss.toFixed(2) + ' pawns vs the course move — add it anyway?', true);
        return;
      }
      const san = quickEditSan(ac.job.mainlineSan);
      const altSan = quickEditSan(ac.job.sanGuess);
      if (!san || !altSan) {
        setAcStatus('Could not normalise the move names.', true);
        return;
      }
      if (!extensionAlive()) {
        setAcStatus('The extension was reloaded — reload this page to save.', true);
        return;
      }
      ac.phase = 'saving';
      ac.els.add.disabled = true;
      ac.els.cancel.disabled = true;
      ac.els.scopeBox.disabled = true;
      setAcStatus('Saving…', false);
      try {
        chrome.runtime.sendMessage({
          type: 'clo-quick-edit-run', mode: 'alt',
          oid: ac.job.oid, bid: ac.job.bid || '',
          san, color: ac.job.mainlineColor, plyIndex: ac.job.plyIndex,
          altSan,
          forThisVariationOnly: ac.els.scopeBox.checked,
          win: popupDriverBounds(ac.popup),
        }).catch(() => {});
      } catch (err) {
        ac.phase = 'ready';
        ac.els.cancel.disabled = false;
        ac.els.scopeBox.disabled = false;
        updateAddEnabled();
        setAcStatus('Could not reach the extension worker.', true);
      }
    }

    function onAcQuickEditResult(msg) {
      if (msg.mode === 'probe') {
        // The quick-edit listener (registered first) has already cached a
        // successful result — reflect it. A FAILED probe for our course is
        // remembered so applyAcRights shows the retry hint instead of
        // spinning up probe after probe (the old silent loop read as the
        // popup being stuck on "Checking edit rights…" forever).
        if (!msg.ok && ac.job && String(msg.bid || '') === String(ac.job.bid || '')) {
          ac.probeFailed = true;
        }
        applyAcRights();
        return;
      }
      if (ac.phase !== 'saving' || !ac.job || String(msg.oid) !== String(ac.job.oid)) return;
      if (msg.timing) log('alt-check timing:', msg.timing);
      ac.els.cancel.disabled = false;
      ac.els.scopeBox.disabled = false;
      if (msg.ok) {
        ac.phase = 'ready';
        setAcStatus('Saved — the trainer now accepts ' + ac.job.sanGuess + ' here.', false);
        dismissOffer(); // the chip's job is done
        setTimeout(() => { if (ac.phase !== 'saving') closePopup(); }, 1500);
      } else {
        ac.phase = 'ready';
        ac.confirmArmed = false;
        ac.els.add.textContent = 'Add alternative (−' + (ac.loss != null ? ac.loss.toFixed(2) : '?') + ')';
        updateAddEnabled();
        setAcStatus(msg.error === 'another quick-edit is in progress'
          ? 'Another save is in progress — try again in a moment.'
          : (msg.error && msg.error !== 'timeout' ? msg.error : 'Save failed or timed out — you can retry.'), true);
      }
    }

    // --- lifecycle -----------------------------------------------------------

    function tick() {
      if (!isTrainerPath()) {
        if (ac.offer || ac.job) dismissAll();
        return;
      }
      const oid = readQuickEditOid();
      if (oid) {
        if (ac.offer && String(ac.offer.oid) !== String(oid)) dismissOffer();
        if (ac.job && String(ac.job.oid) !== String(oid) && ac.phase !== 'saving') closePopup();
      }
      positionChip();
    }

    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg) return;
      if (msg.type === 'clo-engine-update' || msg.type === 'clo-engine-status') {
        state.lastEngineMsgAt = Date.now(); // keeps pingEngineIfSilent quiet mid-quiz
      }
      if (msg.type === 'clo-engine-update') {
        if (ac.reqId && typeof msg.reqId === 'string' && msg.reqId.startsWith(ac.reqId + ':')) {
          onAcUpdate(msg);
        }
      } else if (msg.type === 'clo-engine-status') {
        if (ac.phase === 'best' || ac.phase === 'guess') onAcStatus(msg);
      } else if (msg.type === 'clo-quick-edit-result') {
        onAcQuickEditResult(msg);
      }
    });

    // The tracker's bridges (fire-and-forget from section 13).
    altCheckOffer = (offer) => {
      if (!isTrainerPath()) return;
      showChip(offer);
    };
    altCheckOnAdvance = () => {
      if (ac.offer) dismissOffer();
    };

    setInterval(tick, CONFIG.review.pollMs);
    log('alt-check watcher active (top document)');
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
    // The standalone variation page hosts the quick-edit UI plus its own
    // Lichess panel (section 11b — the page has a real #inputFEN). Every
    // other top-document feature is MoveTrainer2 machinery whose gates never
    // match there, so don't start their pollers.
    if (IS_VARIATION_PAGE) {
      initVariationPanel();
      initQuickEditUi();
      return;
    }
    // Quick-edit driver popup window: its top document only shows the
    // "Saving…" shield — none of the review machinery belongs there.
    if (await maybeMountQuickEditShield()) return;
    // Top document: overstudy widget, background-tab auto-pause, review panel,
    // the quick-edit hover UI, review auto-play, the wrong-guess alt check,
    // and the chapter sort button. Each one gates itself on the URL from its
    // own poll, so SPA navigation into a review session or a chapter page is
    // picked up without a load. Order matters twice: initQuickEditUi must run
    // before initAltCheck (probe results hit quick-edit's listener first, so
    // the rights cache is warm when the alt check reads it), and initAutoPlay
    // before initAltCheck only by convention (the bridge vars are null-safe).
    initReviewOverstudy();
    initOverstudyAutoPause();
    initReviewPanel();
    initQuickEditUi();
    initAutoPlay();
    initAltCheck();
    initChapterSort();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
