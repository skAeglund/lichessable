/**
 * LiChessable — Puzzle Explorer dataset primitives (pure, dependency-free)
 *
 * The lookup model for github.com/skAeglund/puzzle-explorer-data:
 *
 *     FEN → fenPositionKey() → SHA-1 → first 3 hex chars → index/<shard>.json
 *         → shard[posKey] → [ [id, rating, color, ply, startPly, themes[]], … ]
 *         → SHA-1(id)[0..3] → puzzles/<shard>.ndjson → the puzzle body
 *
 * Loaded by the manifest before content/lichessable.js in every frame, and
 * requireable from node so `dev/check-puzzles.js` can execute it. Exposes a
 * single global `CloPuzzles`; no chrome.* usage, and no fetching — the fetch
 * goes through the service worker (background.js, `clo-fetch-puzzles`).
 *
 * THIS FILE IS A MIRROR, NOT CODE TO IMPROVE, and that is why it is a file of
 * its own rather than a block inside lichessable.js. Three things in it are
 * shared with a published 60-million-entry dataset and cannot be changed on
 * this side alone (PUZZLE-DATA-INTEGRATION.md §12):
 *
 *   1. `fenPositionKey` must stay byte-identical to upstream `lib/posKey.js`.
 *      Change it and every lookup misses — silently, returning "no puzzles
 *      here", which is also what a genuinely empty position returns. The
 *      en-passant normalisation is the half most likely to be "tidied", and
 *      dropping it makes every position after a double pawn push miss.
 *   2. `THEME_LIST` is APPEND-ONLY. A theme's code is its array index, and
 *      those indices are stamped into every shard already published, so
 *      reordering or removing one remaps every code in the whole dataset.
 *   3. `SHARD_HEX_LEN` is 3. Changing it changes every filename.
 *
 * And one rule that reads like a bug and is not: A MISSING TUPLE FIELD PASSES
 * EVERY FILTER. Older shards emit shorter tuples, and the scheme is designed so
 * a client written against length-6 entries keeps working against length-4
 * data — the newer filters simply no-op. Branch on FIELD PRESENCE, never on a
 * schema version; there isn't one. Themes are the single deliberate exception
 * (see `filterByTheme`).
 */
'use strict';

var CloPuzzles = (() => {

  /** Hex chars of the SHA-1 used as a shard name. 3 → 4096 shards. */
  const SHARD_HEX_LEN = 3;

  /**
   * Canonical position key: the first four FEN fields, with the en-passant
   * square stripped unless an enemy pawn could actually make the capture.
   *
   * The halfmove clock and fullmove number are dropped, so the same position
   * reached by different move orders keys identically — which is the entire
   * point of the scheme, and is also why the storm's own `cacheKey` (four
   * fields, ep kept) is NOT interchangeable with it.
   *
   * After 1.e4 most FEN generators emit "e3", but no black pawn can take it,
   * so the canonical key carries "-". Miss that and every position after a
   * double pawn push returns zero matches while looking perfectly healthy.
   */
  function fenPositionKey(fen) {
    var parts = String(fen).split(' ');
    var board = parts[0];
    var side = parts[1];
    var castling = parts[2];
    var ep = parts[3] || '-';

    if (ep !== '-' && ep.length >= 2) {
      // A valid ep target sits on rank 6 when White is to move, rank 3 when
      // Black is; anything else is malformed and is dropped.
      var expectedEpRank = side === 'w' ? '6' : '3';
      if (ep[1] !== expectedEpRank) {
        ep = '-';
      } else {
        var file = ep.charCodeAt(0) - 97;         // 0..7
        var captureRank = side === 'w' ? 5 : 4;   // 1..8
        var rowIdx = 8 - captureRank;             // FEN rank 8 = row index 0
        var ranks = board.split('/');
        var rowStr = ranks[rowIdx] || '';
        var row = [];
        for (var i = 0; i < rowStr.length; i++) {
          var ch = rowStr[i];
          if (ch >= '1' && ch <= '8') {
            for (var j = 0; j < (ch.charCodeAt(0) - 48); j++) row.push(null);
          } else {
            row.push(ch);
          }
        }
        var wantPawn = side === 'w' ? 'P' : 'p';
        var canEP =
          (file > 0 && row[file - 1] === wantPawn) ||
          (file < 7 && row[file + 1] === wantPawn);
        if (!canEP) ep = '-';
      }
    } else {
      ep = '-';
    }
    return board + ' ' + side + ' ' + castling + ' ' + ep;
  }

  /**
   * Shard name for any string: lowercase hex SHA-1, first SHARD_HEX_LEN chars.
   * Used for BOTH position keys (→ index/<shard>.json) and puzzle ids
   * (→ puzzles/<shard>.ndjson); the only difference is what gets hashed.
   *
   * Needs `crypto.subtle`, i.e. a secure context — fine in a content script on
   * https, in an extension page or worker, and in node ≥ 18.
   */
  async function shardIdFor(s) {
    var buf = new TextEncoder().encode(String(s));
    var h = await crypto.subtle.digest('SHA-1', buf);
    var bytes = new Uint8Array(h);
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex.slice(0, SHARD_HEX_LEN);
  }

  /** Side to move from a FEN: 'w' | 'b' | null. */
  function fenSideToMove(fen) {
    if (typeof fen !== 'string' || !fen) return null;
    var stm = fen.split(/\s+/)[1];
    return (stm === 'w' || stm === 'b') ? stm : null;
  }

  // --- index entry accessors ------------------------------------------------
  //
  //   entry = [ id, rating, color, ply, startPly, themeCodes[] ]
  //             m0    m1      m2    m3     m4          m5
  //
  // m[3] vs m[4] is the distinction that matters and the one an edit is most
  // likely to get wrong: m[3] is the ply of THE POSITION THAT WAS SEARCHED in
  // the source game — so it varies entry to entry for one puzzle, and it is
  // what says how deep into your line the game actually went. m[4] is the ply
  // THE PUZZLE ITSELF begins at, constant across all of one puzzle's entries,
  // and it is what an "opening tactics only" control would read.

  const M = { ID: 0, RATING: 1, COLOR: 2, PLY: 3, START_PLY: 4, THEMES: 5 };

  const entryId = (m) => m[0];
  const entryRating = (m) => m[1];
  const entryColor = (m) => m[2];       // side to move at the puzzle's own FEN
  const entryPly = (m) => m[3];         // ply of the SEARCHED position
  const entryStartPly = (m) => m[4];    // ply the PUZZLE begins at
  const entryThemes = (m) => m[5];      // curated theme codes

  // --- filters --------------------------------------------------------------

  /** Inclusive rating band. A non-numeric rating passes. */
  function filterByRating(matches, min, max) {
    var lo = (min === null || min === undefined) ? -Infinity : +min;
    var hi = (max === null || max === undefined) ? Infinity : +max;
    var out = [];
    for (var i = 0; i < matches.length; i++) {
      var m = matches[i];
      if (!m || m.length < 2) continue;
      var r = m[1];
      if (typeof r === 'number' && isFinite(r) && (r < lo || r > hi)) continue;
      out.push(m);
    }
    return out;
  }

  /**
   * Inclusive band on the ply THE PUZZLE BEGINS AT — m[4], never m[3].
   * Missing m[4] passes.
   */
  function filterByStartPly(matches, min, max) {
    var lo = (min === null || min === undefined) ? -Infinity : +min;
    var hi = (max === null || max === undefined) ? Infinity : +max;
    if (lo === -Infinity && hi === Infinity) return matches.slice();
    var out = [];
    for (var i = 0; i < matches.length; i++) {
      var m = matches[i];
      if (!m || m.length < 1) continue;
      var sp = m[4];
      if (typeof sp === 'number' && isFinite(sp) && (sp < lo || sp > hi)) continue;
      out.push(m);
    }
    return out;
  }

  /**
   * Inclusive band on the ply of the SEARCHED POSITION — m[3], never m[4].
   * Missing m[3] passes.
   *
   * NOT UPSTREAM: the parent app has no use for it, because it searches one
   * position at a time and already knows how deep that position is. The storm
   * needs it because a course position is reached at different depths by
   * different games, and "did this game really play my line" is exactly the
   * question m[3] answers (DESIGN-storm-puzzles.md §3).
   */
  function filterByPly(matches, min, max) {
    var lo = (min === null || min === undefined) ? -Infinity : +min;
    var hi = (max === null || max === undefined) ? Infinity : +max;
    if (lo === -Infinity && hi === Infinity) return matches.slice();
    var out = [];
    for (var i = 0; i < matches.length; i++) {
      var m = matches[i];
      if (!m || m.length < 1) continue;
      var p = m[3];
      if (typeof p === 'number' && isFinite(p) && (p < lo || p > hi)) continue;
      out.push(m);
    }
    return out;
  }

  /**
   * Perspective filter. `color` is 'w' | 'b'; anything else disables it.
   * Keeps entries the given colour SOLVES; missing m[2] passes.
   *
   * For a course this must be the COURSE's colour, not the side to move in the
   * position being searched: a Caro-Kann repertoire studied as Black sits on
   * white-to-move positions for half of every line.
   */
  function filterByColor(matches, color) {
    if (color !== 'w' && color !== 'b') return matches.slice();
    var out = [];
    for (var i = 0; i < matches.length; i++) {
      var m = matches[i];
      if (!m || m.length < 1) continue;
      if (m[2] === undefined || m[2] === color) out.push(m);
    }
    return out;
  }

  /**
   * Theme filter, OR semantics over integer codes. An empty selection is a
   * no-op.
   *
   * THE ONE PLACE A MISSING FIELD DOES NOT SIMPLY PASS, and the distinction is
   * the classic bug here:
   *   m[5] undefined → PASS   (shard predates theme stamping; unanswerable)
   *   m[5] []        → DROP   (stamped, and this puzzle has no curated theme)
   *   m[5] [codes]   → keep iff it intersects the selection
   * Collapsing the first two into one case is wrong in both directions at once.
   */
  function filterByTheme(matches, themeCodes) {
    var sel = null;
    if (themeCodes instanceof Set) {
      if (themeCodes.size) sel = themeCodes;
    } else if (Array.isArray(themeCodes) && themeCodes.length) {
      var s = new Set();
      for (var i = 0; i < themeCodes.length; i++) {
        var code = themeCodes[i];
        if (typeof code === 'number' && isFinite(code)) s.add(code);
      }
      if (s.size) sel = s;
    }
    if (!sel) return matches.slice();

    var out = [];
    for (var k = 0; k < matches.length; k++) {
      var m = matches[k];
      if (!m || m.length < 1) continue;
      var codes = m[5];
      if (codes === undefined || codes === null || !Array.isArray(codes)) {
        out.push(m);
        continue;
      }
      for (var j = 0; j < codes.length; j++) {
        if (sel.has(codes[j])) { out.push(m); break; }
      }
    }
    return out;
  }

  /** Every filter, cheap first. */
  function applyFilters(matches, opts) {
    opts = opts || {};
    var out = matches || [];
    if (opts.color) out = filterByColor(out, opts.color);
    out = filterByPly(out, opts.plyMin, opts.plyMax);
    out = filterByStartPly(out, opts.startPlyMin, opts.startPlyMax);
    out = filterByTheme(out, opts.themeCodes);
    out = filterByRating(out, opts.ratingMin, opts.ratingMax);
    return out;
  }

  // --- themes ---------------------------------------------------------------
  //
  // APPEND-ONLY. A theme's code is its index in this array and those indices
  // are stamped into every published shard. Mirror of upstream lib/themes.js;
  // never reorder, never remove, never sort.

  const THEME_LIST = [
    'advancedPawn', 'advantage', 'anastasiaMate', 'arabianMate', 'attackingF2F7',
    'attraction', 'backRankMate', 'bishopEndgame', 'bodenMate', 'capturingDefender',
    'castling', 'clearance', 'crushing', 'defensiveMove', 'deflection',
    'discoveredAttack', 'doubleBishopMate', 'doubleCheck', 'dovetailMate', 'endgame',
    'enPassant', 'equality', 'exposedKing', 'fork', 'hangingPiece',
    'hookMate', 'interference', 'intermezzo', 'kingsideAttack', 'knightEndgame',
    'long', 'master', 'masterVsMaster', 'mate', 'mateIn1',
    'mateIn2', 'mateIn3', 'mateIn4', 'mateIn5', 'middlegame',
    'oneMove', 'opening', 'pawnEndgame', 'pin', 'promotion',
    'queenEndgame', 'queenRookEndgame', 'queensideAttack', 'quietMove', 'rookEndgame',
    'sacrifice', 'short', 'skewer', 'smotheredMate', 'superGM',
    'trappedPiece', 'underPromotion', 'veryLong', 'xRayAttack', 'zugzwang',
  ];

  const CODE_BY_KEY = Object.create(null);
  for (var ti = 0; ti < THEME_LIST.length; ti++) CODE_BY_KEY[THEME_LIST[ti]] = ti;

  /**
   * The subset the publish pipeline actually stamps into m[5]. Only these codes
   * will ever appear in the index, so selecting anything outside it matches
   * nothing — silently. A puzzle BODY carries the full uncurated theme list as
   * strings, which is what display should use.
   */
  const CURATED_THEMES = {
    Tactics: [
      'fork', 'pin', 'skewer', 'discoveredAttack', 'doubleCheck',
      'sacrifice', 'deflection', 'attraction', 'clearance', 'interference',
      'intermezzo', 'hangingPiece', 'trappedPiece', 'capturingDefender',
      'xRayAttack', 'quietMove', 'defensiveMove', 'zugzwang',
      'advancedPawn', 'promotion', 'underPromotion',
    ],
    Mates: ['mateIn1', 'mateIn2', 'mateIn3', 'mateIn4', 'mateIn5',
      'smotheredMate', 'backRankMate'],
    Phase: ['opening', 'middlegame', 'endgame'],
  };

  /** Theme key → integer code, or -1. */
  function codeFor(key) {
    var c = CODE_BY_KEY[key];
    return c === undefined ? -1 : c;
  }

  /** Integer code → theme key, or null. */
  function keyForCode(code) {
    return THEME_LIST[code] === undefined ? null : THEME_LIST[code];
  }

  /** ['fork','pin'] → [23, 43]. Unknown keys are dropped. */
  function encodeSelection(keys) {
    var out = [];
    var list = keys || [];
    for (var i = 0; i < list.length; i++) {
      var c = codeFor(list[i]);
      if (c >= 0) out.push(c);
    }
    return out;
  }

  /**
   * Names for a body's uncurated theme strings, for display only. Kept here so
   * the card and the review say the same words.
   */
  function themeLabel(key) {
    return String(key || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  }

  return {
    SHARD_HEX_LEN, M,
    fenPositionKey, shardIdFor, fenSideToMove,
    entryId, entryRating, entryColor, entryPly, entryStartPly, entryThemes,
    filterByRating, filterByPly, filterByStartPly, filterByColor, filterByTheme,
    applyFilters,
    THEME_LIST, CURATED_THEMES, codeFor, keyForCode, encodeSelection, themeLabel,
  };
})();

// Node spot-check support (ignored in the browser).
if (typeof module !== 'undefined' && module.exports) module.exports = CloPuzzles;
