/**
 * dev/check-puzzles.js — executes the REAL content/puzzles.js.
 *
 * No slicing: that file is requireable from node by design (engine/san.js's
 * idiom), so this runs the shipped module rather than a transcription of it.
 * Point CLO_PUZZLES at a copy to run a control.
 *
 * WHY THIS EXISTS. Every failure mode in that file is SILENT — it returns "no
 * puzzles at this position", which is also the correct answer for most
 * positions, so a broken key derivation and an empty opening are the same
 * observation from the outside. Four of them:
 *
 *   * the EN-PASSANT normalisation (PUZZLE-DATA-INTEGRATION.md §3.1). Drop it
 *     and every position immediately after a double pawn push misses. The
 *     guide names this "the single most likely integration bug".
 *   * `m[5] === undefined` vs `m[5] === []`. The first PASSES a theme filter
 *     (the shard predates theme stamping, so the question is unanswerable) and
 *     the second DROPS (stamped, and this puzzle has no curated theme).
 *     Collapsing them is wrong in both directions at once.
 *   * `filterByStartPly` reading m[3] instead of m[4] — and, since the storm
 *     added it, `filterByPly` reading m[4] instead of m[3]. Both still return
 *     a plausible subset. m[3] is how deep the SEARCHED position was in the
 *     source game (what says the game really played your line);
 *     m[4] is where the PUZZLE begins.
 *   * a missing field failing a filter instead of passing it, which silently
 *     empties every older shard.
 *
 * Controls run 2026-09-01, each failing on exactly its own assertions and no
 * others: ep normalisation removed so everything is stripped → 1; ep KEPT
 * without the capture check, which is the guide's own bug and the one that
 * makes 1.e4 miss → 2; undefined/[] collapsed → 1; m[3]/m[4] swapped in both
 * ply filters → 3; `filterByColor` written so a missing colour fails → 2.
 *
 * BOTH ep controls are needed and neither alone is enough: "always strip"
 * passes the 1.e4 case and fails only the capturable one, "never strip" does
 * the reverse. The pair is what pins the rule.
 */
'use strict';
const path = require('path');
const SRC = process.env.CLO_PUZZLES ||
  path.join(__dirname, '..', 'content', 'puzzles.js');
const P = require(SRC);

let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log('  ok   ' + name); return; }
  failures++;
  console.log('  FAIL ' + name + (detail === undefined ? '' : '  — ' + detail));
}
const ids = (ms) => ms.map((m) => m[0]).join(',');

console.log('source: ' + SRC);

// -- 1) the position key, and the ep rule it lives or dies by -----------------
console.log('\n1) fenPositionKey — must stay byte-identical to upstream lib/posKey.js');
{
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  check('counters are dropped (that is the whole scheme)',
    P.fenPositionKey(START) === 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -',
    P.fenPositionKey(START));

  // The guide's own worked example: after 1.e4 the generator emits "e3", and
  // no black pawn can take it.
  check('1.e4 — ep square stripped, no black pawn can capture',
    P.fenPositionKey('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1') ===
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -');

  // 1.e4 c5 2.e5 d5 — a black pawn IS on c5, adjacent to d6's file, so the ep
  // square is real and must be KEPT. This is the assertion a blanket "always
  // strip ep" would pass the one above and fail here.
  check('a capturable ep square is KEPT (black pawn on c5 can take d6)',
    P.fenPositionKey('rnbqkbnr/pp2pppp/8/2ppP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3') ===
    'rnbqkbnr/pp2pppp/8/2ppP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6',
    P.fenPositionKey('rnbqkbnr/pp2pppp/8/2ppP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3'));

  // The same double push with NO white pawn beside it — c5 and e5 are empty,
  // so the square is unusable and must be stripped. The pair above and below
  // is what pins the rule: a blanket "always strip" passes 1.e4 and fails the
  // one above, and a blanket "always keep" passes the one above and fails this.
  check('an uncapturable ep square is stripped even on the right rank',
    P.fenPositionKey('rnbqkbnr/pp2pppp/8/3p4/8/8/PPPPPPPP/RNBQKBNR w KQkq d6 0 3')
      .endsWith(' w KQkq -'),
    P.fenPositionKey('rnbqkbnr/pp2pppp/8/3p4/8/8/PPPPPPPP/RNBQKBNR w KQkq d6 0 3'));

  // Black to move wants rank 3; an ep square on rank 6 is impossible and is
  // dropped by the RANK test, before the capture test is ever reached. Written
  // with a black pawn on d4 that could otherwise take a rank-3 square, so it
  // cannot be passed by a capture check alone.
  check('an ep square on the wrong rank for the side to move is stripped',
    P.fenPositionKey('rnbqkbnr/ppp1pppp/8/8/3p4/8/PPPPPPPP/RNBQKBNR b KQkq e6 0 3')
      .endsWith(' b KQkq -'),
    P.fenPositionKey('rnbqkbnr/ppp1pppp/8/8/3p4/8/PPPPPPPP/RNBQKBNR b KQkq e6 0 3'));

  check('a malformed ep field is stripped, not carried',
    P.fenPositionKey('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq x 0 1')
      .endsWith(' w KQkq -'));

  // Transpositions collapse — the property the whole dataset is built on, and
  // the reason this key is NOT the storm's own `cacheKey`.
  const a = P.fenPositionKey('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2');
  const b = P.fenPositionKey('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 9 40');
  check('the same board at different move numbers keys identically', a === b);
}

// -- 2) shard names -----------------------------------------------------------
console.log('\n2) shardIdFor — three hex chars, captured live 2026-09-01');
{
  // These are the shards the live dataset actually serves for these keys; both
  // were fetched and confirmed non-empty on that date. A changed SHARD_HEX_LEN
  // or a changed key derivation moves them.
  const want = [
    ['rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -', 'e62'],
    ['r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2PP1N2/PP3PPP/RNBQ1RK1 w - -', 'e97'],
  ];
  (async () => {
    check('SHARD_HEX_LEN is 3 (4096 shards; changing it renames every file)',
      P.SHARD_HEX_LEN === 3, String(P.SHARD_HEX_LEN));
    for (const [key, shard] of want) {
      const got = await P.shardIdFor(key);
      check('shard for "' + key.slice(0, 24) + '…" is ' + shard, got === shard, got);
    }
    // A puzzle id hashes through the same function — that is the only thing
    // that makes one implementation serve both files.
    check('a puzzle id hashes the same way', (await P.shardIdFor('UMEVR')).length === 3);
    finish();
  })();
}

// -- 3) the filters, and the back-compat posture ------------------------------
function finish() {
  console.log('\n3) filters — a MISSING field passes, always (older shards are shorter)');
  {
    const short = [['a', 1500], ['b', 1500]];
    check('rating-only tuples survive a colour filter',
      ids(P.filterByColor(short, 'w')) === 'a,b');
    check('rating-only tuples survive a start-ply filter',
      ids(P.filterByStartPly(short, 0, 20)) === 'a,b');
    check('rating-only tuples survive a ply filter',
      ids(P.filterByPly(short, 10, 16)) === 'a,b');
    check('a non-numeric rating passes a rating band',
      ids(P.filterByRating([['a', null]], 1400, 1600)) === 'a');
  }

  console.log('\n4) themes — undefined PASSES, [] DROPS (collapsing them is the classic bug)');
  {
    const sel = P.encodeSelection(['fork', 'pin']);   // [23, 43]
    const rows = [
      ['none', 1500, 'w', 12, 20],                    // m[5] undefined
      ['empty', 1500, 'w', 12, 20, []],               // stamped, no curated theme
      ['fork', 1500, 'w', 12, 20, [23, 41]],
      ['other', 1500, 'w', 12, 20, [41]],
    ];
    check('fork+pin is [23,43]', sel.join(',') === '23,43', sel.join(','));
    check('undefined themes PASS, [] DROPS, and only matching codes keep',
      ids(P.filterByTheme(rows, sel)) === 'none,fork', ids(P.filterByTheme(rows, sel)));
    check('an empty selection is a no-op (all four kept)',
      ids(P.filterByTheme(rows, [])) === 'none,empty,fork,other');
    check('an unknown theme key is dropped from a selection, not coded as -1',
      P.encodeSelection(['fork', 'notAThing']).join(',') === '23');
    check('theme codes round-trip through keyForCode',
      P.keyForCode(P.codeFor('skewer')) === 'skewer');
    check('THEME_LIST is append-only: 60 entries, advancedPawn first',
      P.THEME_LIST.length === 60 && P.THEME_LIST[0] === 'advancedPawn',
      P.THEME_LIST.length + '/' + P.THEME_LIST[0]);
    // Every curated key must exist in the list, or that selection silently
    // matches nothing for ever.
    const missing = [].concat(...Object.values(P.CURATED_THEMES))
      .filter((k) => P.codeFor(k) < 0);
    check('every curated theme has a code', missing.length === 0, missing.join(','));
  }

  console.log('\n5) the two ply filters read DIFFERENT fields — m[3] vs m[4]');
  {
    // m[3] = ply of the searched position; m[4] = ply the puzzle begins at.
    // Built so a swap cannot pass: the two are far apart and on opposite sides
    // of each band.
    const rows = [
      ['deepGameLatePuzzle', 1500, 'w', 14, 55],
      ['shallowGameEarlyPuzzle', 1500, 'w', 4, 12],
    ];
    check('filterByPly(10,16) reads m[3] — keeps the ply-14 search only',
      ids(P.filterByPly(rows, 10, 16)) === 'deepGameLatePuzzle',
      ids(P.filterByPly(rows, 10, 16)));
    check('filterByStartPly(0,20) reads m[4] — keeps the ply-12 puzzle only',
      ids(P.filterByStartPly(rows, 0, 20)) === 'shallowGameEarlyPuzzle',
      ids(P.filterByStartPly(rows, 0, 20)));
    check('an unbounded band is a no-op',
      ids(P.filterByPly(rows)) === 'deepGameLatePuzzle,shallowGameEarlyPuzzle');
  }

  console.log('\n6) colour — the course’s, and a missing one passes');
  {
    const rows = [['w', 1500, 'w'], ['b', 1500, 'b'], ['old', 1500]];
    check('white keeps white and the unstamped entry',
      ids(P.filterByColor(rows, 'w')) === 'w,old', ids(P.filterByColor(rows, 'w')));
    check('an invalid colour disables the filter',
      ids(P.filterByColor(rows, null)) === 'w,b,old');
  }

  console.log('\n7) applyFilters runs all five');
  {
    const rows = [
      ['keep', 1500, 'w', 12, 30, [23]],
      ['wrongColour', 1500, 'b', 12, 30, [23]],
      ['tooShallow', 1500, 'w', 4, 30, [23]],
      ['tooCheap', 900, 'w', 12, 30, [23]],
      ['wrongTheme', 1500, 'w', 12, 30, [41]],
    ];
    check('colour + ply + rating + theme compose',
      ids(P.applyFilters(rows, {
        color: 'w', plyMin: 10, plyMax: 16, ratingMin: 1000, ratingMax: 2400,
        themeCodes: [23],
      })) === 'keep');
    check('no options is a no-op copy',
      P.applyFilters(rows, {}).length === rows.length &&
      P.applyFilters(rows, {}) !== rows);
  }

  console.log('');
  if (failures) {
    console.log(failures + ' FAILURE(S)');
    process.exit(1);
  }
  console.log('all checks passed');
}
