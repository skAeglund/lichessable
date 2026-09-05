/**
 * dev/check-course-tree.js — executes the REAL section 24 walk, fold and
 * column logic, sliced out of content/lichessable.js by brace matching, over a
 * live `getList` dump of the account's courses (dev/tmp-courses.json).
 *
 * This exists for the reason `dev/check-continuation-lines.js` does: the parts
 * of this feature that can be wrong are the parts `node --check` cannot see —
 * the fold's stopping rules, the cycle guard, and whether a column's "chosen"
 * row survives standing mid-run. None of them is reachable without a real
 * course, and two of them (§12.2's eighty-ply run, §12.5's back-edge) only
 * occur on the bought course.
 *
 * The dump is GITIGNORED — course content is not ours to redistribute — and the
 * recipe for remaking it in one console call is in the header of
 * `dev/probe-course-tree.js`; without it this exits 2 and says so.
 *
 * Run a control by pointing CLO_SRC at a copy with the change reverted and
 * confirming it FAILS. Controls, each failing on exactly its own assertions and
 * no others:
 *   * the fold's line-end stop and the cycle guard removed → the three
 *     assertions that cover them
 *   * `columnsFor`'s mid-run arm (24e) reverted            → the five that
 *     cover the standing column. Those five are written to REPORT rather than
 *     throw when there is no third column, since that is precisely the shape a
 *     control of this arm has.
 *   * 24f's Black returned as the stored DRAWS rather than derived from the
 *     move's own total                                     → 4 fail
 *   * 24h's whose-move-it-is taken from `positionSide`      → 4 fail, and it
 *     still passes every 453453 case, which is the whole point (run 2026-08-26)
 *   * 24b's explorer SAN compared raw instead of resolved through CloSan
 *                                                          → 4 fail, castling
 *     being the case
 *   * 24b's `positionSide` falling back to `courseSide`'s majority → 1 fail
 *   * 24b's gap-list guard removed on the user's own move   → the first arm
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { sliceDecl, SRC_PATH } = require('./slice-source.js');
const CloSan = require('../engine/san.js');

const DUMP = path.join(__dirname, 'tmp-courses.json');
if (!fs.existsSync(DUMP)) {
  console.error('dev/tmp-courses.json is missing — it is a dump of getList from a live\n' +
    'session (see DESIGN-course-tree.md §12). Without it this check cannot run.');
  process.exit(2);
}
const courses = require(DUMP);

// --- the surrounding closure, faithful to the shipped file -------------------
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const SQ_FILES = 'abcdefgh';
const squareName = (i) => SQ_FILES[i & 7] + ((i >> 3) + 1);
const cacheKey = (fen) => fen.split(' ').slice(0, 4).join(' ');
const sleepMs = () => Promise.resolve();
const warn = () => {};

const shared = [
  sliceDecl('RELAXED_SAN_RE'),
  sliceDecl('sanToUciRelaxed'),
  sliceDecl('sanToUci'),
  sliceDecl('fenAfterUci'),
  sliceDecl('walkVariation'),
  sliceDecl('sideOf'),
  sliceDecl('courseSide'),
  // The four under test, plus the two one-liners they lean on.
  sliceDecl('buildCourseTree'),
  sliceDecl('rowKey'),
  sliceDecl('isLineEnd'),
  sliceDecl('foldFrom'),
  sliceDecl('rowsAt'),
  sliceDecl('standColumn'),
  sliceDecl('columnsFor'),
  sliceDecl('standingPlies'),
  sliceDecl('keyOfPlies'),
  // 24b/24c. `positionSide` and `gapKind` are the whole of "is an uncovered
  // move a gap or a decision", which is the one judgement in the scan that can
  // be wrong in a way nobody notices; `dbMovesFor`/`gapsFor` are the read that
  // rests on it; `pathOfLine` is what the find field stands on.
  sliceDecl('positionSide'),
  sliceDecl('gapKind'),
  // 24f's result split. Shipped top level (both bulk fillers of the shared
  // popularity cache write it), and `dbMovesFor` resolves it move by move
  // alongside the counts — so it has to come along or the read under test
  // throws rather than answering.
  sliceDecl('popEntryWdl'),
  sliceDecl('popEntryScore'),
  sliceDecl('moverScorePct'),
  sliceDecl('dbMovesFor'),
  sliceDecl('gapsFor'),
  sliceDecl('pathOfLine'),
  // 24h. The split scan is a second reading of the same index - free, and wrong
  // in exactly one way that nobody would notice (see the assertions below).
  sliceDecl('parseAltList'),
  sliceDecl('findSplits'),
  sliceDecl('cardVerdict'),
  sliceDecl('groupVerdict'),
  'return { buildCourseTree, foldFrom, rowsAt, standColumn, columnsFor, standingPlies, keyOfPlies,' +
  '         positionSide, gapKind, dbMovesFor, gapsFor, pathOfLine, moverScorePct,' +
  '         parseAltList, findSplits, cardVerdict, groupVerdict };',
].join('\n');

// CONFIG.courseTree, read out of the shipped file so the numbers cannot drift.
const SRC = fs.readFileSync(SRC_PATH, 'utf8');
const cfgBody = SRC.slice(SRC.indexOf('courseTree: {'));
const num = (name) => {
  const m = new RegExp('\\b' + name + ':\\s*(\\d+)').exec(cfgBody.slice(0, 2500));
  if (!m) throw new Error('CONFIG.courseTree.' + name + ' not found');
  return Number(m[1]);
};
// CONFIG.courseTree.lichess sits past the window `num` reads, and its two
// interesting values are FRACTIONS rather than ints.
const lichessBody = cfgBody.slice(cfgBody.indexOf('lichess: {'), cfgBody.indexOf('lichess: {') + 1600);
const lnum = (name) => {
  const m = new RegExp('\\b' + name + ':\\s*([\\d.]+)').exec(lichessBody);
  if (!m) throw new Error('CONFIG.courseTree.lichess.' + name + ' not found');
  return Number(m[1]);
};
// CONFIG.courseTree.splits, like `lichess` past the window `num` reads.
const splitsBody = cfgBody.slice(cfgBody.indexOf('splits: {'), cfgBody.indexOf('splits: {') + 1400);
const snum = (name) => {
  const m = new RegExp('\\b' + name + ':\\s*(\\d+)').exec(splitsBody);
  if (!m) throw new Error('CONFIG.courseTree.splits.' + name + ' not found');
  return Number(m[1]);
};
const C = {
  foldShow: num('foldShow'), foldMax: num('foldMax'), maxRows: num('maxRows'),
  maxColumns: num('maxColumns'), maxDepth: num('maxDepth'),
  maxNames: num('maxNames'), maxNameLen: num('maxNameLen'), chunkVars: num('chunkVars'),
  lichess: {
    minGames: lnum('minGames'), gapMinShare: lnum('gapMinShare'), gapMaxRows: lnum('gapMaxRows'),
  },
  splits: {
    maxRows: snum('maxRows'), altsMax: snum('altsMax'), pathPlies: snum('pathPlies'),
  },
};

const ct = {
  tree: null, rootKey: null, path: [], dbOn: true, db: new Map(),
  splits: null, alts: new Map(),
};
const log = () => {};
// eslint-disable-next-line no-new-func
const api = new Function(
  'CloSan', 'squareName', 'cacheKey', 'sleepMs', 'warn', 'log', 'C', 'ct', 'START_FEN', 'L',
  shared)(CloSan, squareName, cacheKey, sleepMs, warn, log, C, ct, START_FEN, C.lichess);

let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log('  ok   ' + name); return; }
  failures++;
  console.log('  FAIL ' + name + (detail ? '  — ' + detail : ''));
}

(async () => {
  console.log('source: ' + SRC_PATH);
  console.log('CONFIG.courseTree: ' + JSON.stringify(C));

  const trees = {};
  for (const [bid, course] of Object.entries(courses)) {
    const t0 = Date.now();
    trees[bid] = await api.buildCourseTree({ name: course.name, vars: course.vars }, bid, null, null);
    trees[bid].ms = Date.now() - t0;
  }

  console.log('\nthe walk');
  for (const [bid, t] of Object.entries(trees)) {
    console.log(`  ${bid} ${t.name}: ${t.indexed} line(s), ${t.answers.size} positions, ` +
      `${t.starts.length} start(s), ${t.informational} informational, ` +
      `${t.unplayable} unplayable, ${t.ms} ms`);
  }
  // §12.7: with the relaxed SAN pass in, the bought course replays whole. This
  // is the assertion that would catch a regression in sanToUci.
  check('291847 replays with nothing unplayable', trees['291847'].unplayable === 0,
    trees['291847'].unplayable + ' unplayable');
  check('291847 has the 39 start positions §12.6 measured', trees['291847'].starts.length === 39,
    String(trees['291847'].starts.length));
  check('its commonest start covers 34 lines', trees['291847'].starts[0].n === 34,
    String(trees['291847'].starts[0].n));
  check('453453 has exactly one start', trees['453453'].starts.length === 1,
    String(trees['453453'].starts.length));

  console.log('\nthe fold (§3.3, §12.2)');
  ct.tree = trees['291847'];
  ct.rootKey = ct.tree.starts[0].ck;
  ct.path = [];
  {
    const rows = api.rowsAt(ct.rootKey, new Set([ct.rootKey]));
    check('the root column is the 4 rows §12.1 measured', rows.length === 4, String(rows.length));
    check('rows are commonest first', rows.every((r, i) => i === 0 || rows[i - 1].n >= r.n));
    check('the commonest root move is 1.e4', rows[0].plies[0].san === 'e4', rows[0].plies[0].san);
    const longest = rows.reduce((a, r) => Math.max(a, r.plies.length), 0);
    // §12.2's finding: a model game is one unbranched line, so a fold really
    // does produce a row carrying dozens of plies. The fold is CORRECT there —
    // it is the DISPLAY that caps, which is why nothing here asserts a short run.
    check('a folded run really can be dozens of plies (§12.2)', longest > 40, 'longest ' + longest);
    check('no run exceeds foldMax', longest <= C.foldMax + 1, 'longest ' + longest);
    // Losslessness: every ply of every row must be a legal continuation of the
    // one before it, or the fold has stitched together positions that are not
    // adjacent.
    let broken = 0;
    for (const r of rows) {
      for (let i = 1; i < r.plies.length; i++) {
        if (r.plies[i].before !== r.plies[i - 1].after) broken++;
      }
    }
    check('every folded run is contiguous', broken === 0, broken + ' break(s)');
    // A run must never continue past a position that branches — that is the
    // whole of the fold rule and the only thing that makes it lossless.
    let overRun = 0;
    for (const r of rows) {
      for (let i = 1; i < r.plies.length; i++) {
        const m = ct.tree.answers.get(r.plies[i].before);
        if (m && m.size !== 1) overRun++;
      }
    }
    check('no run folds through a branching position', overRun === 0, overRun + ' case(s)');
    // …nor past a position where a variation ends, or the row's "line ends"
    // tag would be attached to the wrong position.
    let pastEnd = 0;
    for (const r of rows) {
      for (let i = 1; i < r.plies.length; i++) {
        if (ct.tree.ends.has(r.plies[i].before)) pastEnd++;
      }
    }
    check('no run folds through a line end', pastEnd === 0, pastEnd + ' case(s)');
  }

  console.log('\nthe cycle guard (§5.2, §12.5)');
  {
    // Walking every position of the course with the real rowsAt must terminate
    // and must never emit a ply landing on a position already on its path.
    let visitedPositions = 0, loops = 0, escapes = 0;
    for (const ck of ct.tree.answers.keys()) {
      const rows = api.rowsAt(ck, new Set([ck]));
      visitedPositions++;
      for (const r of rows) {
        if (r.loop) loops++;
        const seen = new Set([ck]);
        for (const p of r.plies) {
          if (seen.has(p.after)) escapes++;
          seen.add(p.after);
        }
      }
    }
    check('rowsAt terminates over every position', visitedPositions === ct.tree.answers.size,
      visitedPositions + ' of ' + ct.tree.answers.size);
    check('no run revisits a position on its own path', escapes === 0, escapes + ' escape(s)');
    check('§12.5’s loop is actually reached and marked', loops > 0, loops + ' marked row(s)');
  }

  console.log('\nthe columns');
  {
    ct.path = [];
    let cols = api.columnsFor();
    check('an empty path gives exactly one column', cols.length === 1, String(cols.length));
    check('…with nothing chosen', cols[0].chosen === -1, String(cols[0].chosen));

    // Take the whole of the commonest row: the next column must open.
    const first = cols[0].rows[0];
    ct.path = first.plies.slice();
    cols = api.columnsFor();
    check('taking a whole row opens the next column', cols.length === 2, String(cols.length));
    check('the taken row is marked chosen', cols[0].chosen === 0, String(cols[0].chosen));
    check('the second column starts where the run ended',
      cols[1].ck === first.end, cols[1].ck + ' vs ' + first.end);

    // Stand HALFWAY into a run (§3.3: the board must be able to). Since
    // v0.125.0 that position gets a COLUMN OF ITS OWN — it is the frontier, it
    // is what the panel is about, and it is the only way 24b's scan (which asks
    // only about a column DRAWN) ever reads the position the user selected.
    const deep = cols[1].rows.find((r) => r.plies.length > 2) || cols[1].rows[0];
    ct.path = first.plies.concat(deep.plies.slice(0, 1));
    cols = api.columnsFor();
    check('standing mid-run opens a column for the standing position',
      cols.length === 3 && cols[2].ck === deep.plies[0].after,
      cols.length + ' / ' + (cols[2] || {}).ck + ', wanted ' + deep.plies[0].after);
    // A control that reverts the arm has no third column at all, and every
    // assertion below it must still REPORT rather than throw.
    const stand = cols[2] || { rows: [], prefix: [] };
    check('…marked mid and NOT auto, so it is drawn rather than walked through',
      stand.mid === true && stand.auto === false,
      'mid=' + stand.mid + ' auto=' + stand.auto);
    check('…with nothing chosen in it, so it reads as the frontier',
      stand.chosen === -1, String(stand.chosen));
    check('…carrying the plies stood through as its prefix',
      stand.prefix.length === ct.path.length &&
      stand.prefix.every((p, i) => p.uci === ct.path[i].uci),
      stand.prefix.map((p) => p.uci).join(' '));
    check('…and the course’s continuation as its only move',
      stand.rows.length === 1 && stand.rows[0].plies[0].uci === deep.plies[1].uci,
      stand.rows.length + ' row(s), first ' + (stand.rows[0] || {}).uci);
    // Compared by UCI, not by identity: columnsFor rebuilds its rows on every
    // call (the visited set differs), so the objects from the previous call are
    // not the ones in this one.
    check('…and the row it is inside still reads as chosen',
      cols[1].chosen >= 0 && cols[1].rows[cols[1].chosen].uci === deep.uci,
      cols[1].chosen + ' → ' + (cols[1].rows[cols[1].chosen] || {}).uci + ', wanted ' + deep.uci);
    check('…and the board still stands on the ply that was clicked',
      api.keyOfPlies(api.standingPlies(cols)) === deep.plies[0].after,
      api.keyOfPlies(api.standingPlies(cols)));

    // A path that does not match any row must not silently pick one.
    ct.path = [{ uci: 'a2a3', san: 'a3', before: ct.rootKey, after: 'nonsense' }];
    cols = api.columnsFor();
    check('an unmatched path chooses nothing', cols.length === 1 && cols[0].chosen === -1,
      cols.length + '/' + cols[0].chosen);
  }

  console.log('\nforced columns are taken automatically (v0.116.0)');
  {
    // 455941 opens "1.e4 c5" and nothing else — a column with one row, which is
    // not a decision. It must never be drawn, the walk must go through it, and
    // the board and breadcrumb must stand where it left them rather than two
    // moves behind the leftmost column on screen.
    ct.tree = trees['455941'];
    ct.rootKey = ct.tree.starts[0].ck;
    ct.path = [];
    let cols = api.columnsFor();
    check('the single-move root column is marked auto', cols[0] && cols[0].auto === true,
      String(cols[0] && cols[0].auto));
    check('…and the walk carries on past it', cols.length > 1, String(cols.length));
    check('…so something real is left to draw', cols.filter((c) => !c.auto).length > 0,
      String(cols.filter((c) => !c.auto).length));
    const first = cols.find((c) => !c.auto);
    check('the first drawn column really branches', first && first.rows.length > 1,
      String(first && first.rows.length));
    check('its prefix is the forced moves', first && first.prefix.map((p) => p.san).join(' ') === 'e4 c5',
      first && first.prefix.map((p) => p.san).join(' '));
    check('standingPlies follows the auto-take with an empty path',
      api.standingPlies(cols).length > 0, String(api.standingPlies(cols).length));
    check('…and lands on the position the drawn column is about',
      api.keyOfPlies(api.standingPlies(cols)) === cols[cols.length - 1].ck,
      api.keyOfPlies(api.standingPlies(cols)) + ' vs ' + cols[cols.length - 1].ck);

    // Navigation goes through the column's own prefix, so a click in a column
    // reached only by auto-take still produces a path that leads to it.
    const row = first.rows[1] || first.rows[0];
    ct.path = first.prefix.concat(row.plies);
    cols = api.columnsFor();
    const again = cols.find((c) => c.ck === first.ck);
    check('after clicking, that column reads the click back',
      again && again.chosen >= 0 && again.rows[again.chosen].uci === row.uci,
      String(again && again.chosen));
    check('…and it is no longer auto', again && again.auto === false, String(again && again.auto));

    // A course whose root really branches must be untouched by any of this.
    ct.tree = trees['291847'];
    ct.rootKey = ct.tree.starts[0].ck;
    ct.path = [];
    cols = api.columnsFor();
    check('a branching root is NOT auto-taken', cols[0].auto === false, String(cols[0].auto));
    check('…and stands on the root itself',
      api.standingPlies(cols).length === 0, String(api.standingPlies(cols).length));
  }

  console.log('\nfinding a line by name (24c)');
  {
    // The find field STANDS on a match, so the only thing that can be wrong is
    // the path it builds — and it is rebuilt from `answers` rather than stored,
    // precisely so that it cannot disagree with what the columns will draw.
    ct.tree = trees['291847'];
    check('every playable line is indexed by name',
      ct.tree.lines.length === ct.tree.indexed,
      ct.tree.lines.length + ' vs ' + ct.tree.indexed);
    let bad = 0, short = 0, offEnd = 0;
    for (const line of ct.tree.lines) {
      const plies = api.pathOfLine(line);
      if (!plies) { bad++; continue; }
      if (plies.length !== line.ucis.length) short++;
      // Contiguity, the same property the fold has to have: a path whose plies
      // do not join up would put the board on a position the line never reached.
      for (let i = 1; i < plies.length; i++) {
        if (plies[i].before !== plies[i - 1].after) offEnd++;
      }
    }
    check('every indexed line rebuilds into a path', bad === 0, bad + ' failed');
    check('…of its own length', short === 0, short + ' wrong length');
    check('…and contiguous', offEnd === 0, offEnd + ' break(s)');

    // Standing on one really does put the browser at its end.
    const line = ct.tree.lines.find((l) => l.ucis.length > 6) || ct.tree.lines[0];
    const plies = api.pathOfLine(line);
    ct.rootKey = line.startCk;
    ct.path = plies;
    const cols = api.columnsFor();
    check('standing on a found line lands on its last position',
      api.keyOfPlies(api.standingPlies(cols)) === plies[plies.length - 1].after,
      api.keyOfPlies(api.standingPlies(cols)));
  }

  console.log('\nwhose move it is (24b)');
  {
    // 453453 is a Black repertoire end to end, so the START position — White to
    // move — is the OPPONENT's, and an uncovered popular move there is a gap.
    // One ply on it is the user's own, where the same uncovered move is a
    // repertoire decision. Getting this backwards would paint every course red
    // for having an opinion, and nothing on screen would say so.
    ct.tree = trees['453453'];
    const root = ct.tree.starts[0].ck;
    const rootFen = ct.tree.fens.get(root);
    check('an all-Black course reads as Black at its root', api.positionSide(root) === 'b',
      String(api.positionSide(root)));
    check('…so White to move there is the opponent', api.gapKind(root, rootFen) === 'gap',
      api.gapKind(root, rootFen));
    const firstUci = [...ct.tree.answers.get(root).keys()][0];
    const after = ct.tree.answers.get(root).get(firstUci).afterCk;
    check('…and one ply on it is the user’s own move',
      api.gapKind(after, ct.tree.fens.get(after)) === 'choice',
      api.gapKind(after, ct.tree.fens.get(after)));

    // A mixed course must never be forced into an answer. 291847 holds 66 White
    // and 15 Black lines, which is exactly the case `courseSide` gets wrong.
    ct.tree = trees['291847'];
    let odd = 0, mixed = 0;
    for (const ck of ct.tree.answers.keys()) {
      const s = api.positionSide(ck);
      if (s !== 'w' && s !== 'b' && s !== null) odd++;
      if (s === null) mixed++;
    }
    check('positionSide only ever answers w / b / null', odd === 0, odd + ' odd answer(s)');
    check('…and does answer null somewhere on a mixed course', mixed > 0, mixed + ' position(s)');
  }

  console.log('\nreading the explorer (24b)');
  {
    ct.tree = trees['453453'];
    const root = ct.tree.starts[0].ck;
    const fen = ct.tree.fens.get(root);
    const pos = CloSan.parseFen(fen);
    const covered = [...ct.tree.answers.get(root).values()];
    // A fake explorer answer built from the course's OWN moves plus two the
    // course does not play, one of them under the share floor.
    const counts = {};
    covered.forEach((e, i) => { counts[e.san.replace(/[+#]+$/, '')] = 4000 - i * 100; });
    const gapSan = ['d4', 'c4', 'Nf3', 'g3', 'b3', 'f4']
      .find((s) => !covered.some((e) => e.san.replace(/[+#]+$/, '') === s));
    counts[gapSan] = 3000;
    counts.a3 = 1;               // real, and far under gapMinShare
    counts.Zz9 = 500;            // not a move at all: must be dropped, never guessed at
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    ct.db.set(root, { counts, total });

    const col = { ck: root, pos };
    const db = api.dbMovesFor(col);
    check('a healthy sample is not thin', db && db.thin === false, String(db && db.thin));
    check('every covered move resolves to its own uci',
      [...ct.tree.answers.get(root).keys()].every((u) => db.byUci.has(u)),
      [...ct.tree.answers.get(root).keys()].filter((u) => !db.byUci.has(u)).join(','));
    check('an unresolvable SAN is dropped rather than guessed at',
      db.byUci.size === Object.keys(counts).length - 1, db.byUci.size + ' of ' +
      (Object.keys(counts).length - 1));

    const gaps = api.gapsFor(col, db);
    check('the uncovered move is reported', gaps.some((g) => g.san === gapSan),
      gaps.map((g) => g.san).join(','));
    check('…and nothing the course covers is', !gaps.some((g) =>
      ct.tree.answers.get(root).has(g.uci)), gaps.map((g) => g.san).join(','));
    check('a move under gapMinShare is not a gap', !gaps.some((g) => g.san === 'a3'),
      gaps.map((g) => g.san).join(','));
    check('gaps are commonest first',
      gaps.every((g, i) => i === 0 || gaps[i - 1].games >= g.games));
    check('at most gapMaxRows of them', gaps.length <= C.lichess.gapMaxRows, String(gaps.length));
    check('each carries the position it leads to',
      gaps.every((g) => g.after && CloSan.parseFen(g.after)));

    // §7's floor, and the reason it exists: at this size "more popular" is
    // regularly three games against two, so NOTHING is claimed.
    ct.db.set(root, { counts, total: C.lichess.minGames - 1 });
    const thin = api.dbMovesFor({ ck: root, pos });
    check('a sample under minGames reads as thin', thin && thin.thin === true, String(thin && thin.thin));
    check('…and yields no gaps at all', api.gapsFor({ ck: root, pos }, thin).length === 0);

    // ON THE USER'S OWN MOVE THE LIST IS DROPPED, not merely re-worded
    // (v0.124.0). `gapKind` has always known the difference; until now both
    // answers still printed a list of moves the course "does not have", which
    // on your own move is a repertoire DECISION and reads as a coverage
    // failure for having an opinion. The one thing that can be wrong here
    // invisibly is the direction, so both arms are asserted.
    {
      ct.db.clear();
      const mine = ct.tree.answers.get(root).get([...ct.tree.answers.get(root).keys()][0]).afterCk;
      const minePos = CloSan.parseFen(ct.tree.fens.get(mine));
      const mineCovered = [...ct.tree.answers.get(mine).values()];
      const mc = {};
      mineCovered.forEach((e, i) => { mc[e.san.replace(/[+#]+$/, '')] = 1000 - i * 10; });
      // Something popular the course does not play here — taken from the
      // position's own legal moves, so it cannot be a SAN this board refuses.
      const spare = CloSan.generateMoves(minePos)
        .map((m) => CloSan.moveToSan(minePos, squareName(m.from) + squareName(m.to)))
        .filter(Boolean)
        .find((sn) => !mineCovered.some((e) => e.san.replace(/[+#]+$/, '') === sn.replace(/[+#]+$/, '')));
      mc[spare.replace(/[+#]+$/, '')] = 5000;
      const mineTotal = Object.values(mc).reduce((a, b) => a + b, 0);
      ct.db.set(mine, { counts: mc, total: mineTotal });
      const mineDb = api.dbMovesFor({ ck: mine, pos: minePos });
      check('the fake answer for the user-move position is healthy',
        Boolean(mineDb) && mineDb.thin === false && mineDb.byUci.size > 1,
        String(mineDb && mineDb.byUci.size));
      check('a course answer here really is the user’s own move',
        api.gapKind(mine, ct.tree.fens.get(mine)) === 'choice',
        api.gapKind(mine, ct.tree.fens.get(mine)));
      check('…so nothing is listed as missing, however popular',
        api.gapsFor({ ck: mine, pos: minePos }, mineDb).length === 0,
        api.gapsFor({ ck: mine, pos: minePos }, mineDb).map((g) => g.san).join(','));
      // …and the opponent's move is untouched by the same rule: that is where
      // an uncovered popular reply IS a hole the user will meet.
      ct.db.set(root, { counts, total });
      check('…while the opponent’s move still lists them',
        api.gapsFor({ ck: root, pos }, api.dbMovesFor({ ck: root, pos })).length > 0);
    }

    // THE EXPLORER'S OWN SPELLING, which is the trap section 6c fell into:
    // Lichess writes castling as KING TAKES ROOK. Resolving through CloSan is
    // what makes the two agree; a string compare never would.
    const cFen = 'r3k2r/pppq1ppp/2n1bn2/2bpp3/2BPP3/2N1BN2/PPPQ1PPP/R3K2R w KQkq - 0 1';
    ct.db.set('castle', { counts: { 'O-O': 900, 'O-O-O': 100 }, total: 1000 });
    const cdb = api.dbMovesFor({ ck: 'castle', pos: CloSan.parseFen(cFen) });
    check('castling resolves to the king-two-files uci both sides use',
      cdb.byUci.get('e1g1') === 900 && cdb.byUci.get('e1c1') === 100,
      [...cdb.byUci].join(' '));

    // A failed position is remembered, and must read as "no answer" rather than
    // as an empty one — an empty one would say the course covers 0%.
    ct.db.set('boom', { error: 'nope' });
    check('a failed position yields no reading',
      api.dbMovesFor({ ck: 'boom', pos }) === null);
    // …and with the scan off nothing is read at all, however much is cached.
    ct.dbOn = false;
    check('with the scan off nothing is read', api.dbMovesFor({ ck: root, pos }) === null);
    ct.dbOn = true;
  }

  // --- 24f) the result split -------------------------------------------------
  //
  // Three things here can be wrong without anyone noticing, because a missing
  // win rate looks exactly like a position with no data: that the split is
  // MERGED the way the counts are (two spellings of one move), that BLACK is
  // derived rather than stored, and that an entry written before v0.126.0
  // yields no bar rather than a wrong one.
  console.log('\nwin rates (24f)');
  {
    const cFen = 'r3k2r/pppq1ppp/2n1bn2/2bpp3/2BPP3/2N1BN2/PPPQ1PPP/R3K2R w KQkq - 0 1';
    const cPos = CloSan.parseFen(cFen);
    // Two spellings of the SAME move, which is what Lichess and our own
    // generator regularly disagree about. `counts` merges them; so must the
    // split, or the bar would describe half the games its share is drawn from.
    ct.db.set('wdl', {
      counts: { 'O-O': 600, 'O-O-O': 400 },
      total: 1000,
      entry: {
        m: { 'O-O': 600, 'O-O-O': 400 },
        n: 1000,
        r: { 'O-O': [300, 200], 'O-O-O': [100, 100] },
        s: [400, 300],
      },
    });
    const wdb = api.dbMovesFor({ ck: 'wdl', pos: cPos });
    const short = wdb.wdlByUci.get('e1g1');
    check('a move carries its own split', Boolean(short), JSON.stringify(short));
    check('…which sums to the games the share is drawn from',
      short.w + short.d + short.b === wdb.byUci.get('e1g1'),
      short.w + '+' + short.d + '+' + short.b + ' vs ' + wdb.byUci.get('e1g1'));
    check('…with Black DERIVED, never stored', short.b === 600 - 300 - 200, String(short.b));
    const longCastle = wdb.wdlByUci.get('e1c1');
    check('the other spelling keeps its own', Boolean(longCastle) && longCastle.w === 100,
      JSON.stringify(longCastle));
    check('the position’s own score comes back too',
      Boolean(wdb.score) && wdb.score.w === 400 && wdb.score.b === 300,
      JSON.stringify(wdb.score));

    // A hit written before the split existed. The share must survive it and the
    // bar must simply not be drawn: the tree re-asks for these ONCE (drainDb),
    // but a redraw between the ask and the answer still has to render.
    ct.db.set('old', {
      counts: { 'O-O': 600, 'O-O-O': 400 }, total: 1000,
      entry: { m: { 'O-O': 600, 'O-O-O': 400 }, n: 1000 },
    });
    const odb = api.dbMovesFor({ ck: 'old', pos: cPos });
    check('a pre-split entry still answers shares', odb.byUci.get('e1g1') === 600,
      String(odb.byUci.get('e1g1')));
    check('…and offers no win rate rather than a wrong one',
      odb.wdlByUci.size === 0 && odb.score === null,
      odb.wdlByUci.size + ' / ' + JSON.stringify(odb.score));

    // A gap row carries the split of the move it names, since that is the half
    // of the answer its share cannot give.
    ct.tree = trees['453453'];
    const root2 = ct.tree.starts[0].ck;
    const fen2 = ct.tree.fens.get(root2);
    const pos2 = CloSan.parseFen(fen2);
    const covered2 = [...ct.tree.answers.get(root2).values()];
    const counts2 = {}, r2 = {};
    covered2.forEach((e, i) => {
      const sn = e.san.replace(/[+#]+$/, '');
      counts2[sn] = 4000 - i * 100;
      r2[sn] = [Math.round(counts2[sn] * 0.4), Math.round(counts2[sn] * 0.2)];
    });
    const gapSan2 = ['d4', 'c4', 'Nf3', 'g3', 'b3', 'f4']
      .find((sn) => !covered2.some((e) => e.san.replace(/[+#]+$/, '') === sn));
    counts2[gapSan2] = 3000;
    r2[gapSan2] = [900, 600];
    const total2 = Object.values(counts2).reduce((a, b) => a + b, 0);
    ct.db.set(root2, {
      counts: counts2, total: total2,
      entry: { m: counts2, n: total2, r: r2, s: [1, 1] },
    });
    const db2 = api.dbMovesFor({ ck: root2, pos: pos2 });
    const gaps2 = api.gapsFor({ ck: root2, pos: pos2 }, db2);
    const one = gaps2.find((g) => g.san === gapSan2);
    check('a gap row carries its own split', Boolean(one && one.wdl),
      JSON.stringify(one && one.wdl));
    check('…summing to its own games', one.wdl.w + one.wdl.d + one.wdl.b === one.games,
      one.wdl.w + '+' + one.wdl.d + '+' + one.wdl.b + ' vs ' + one.games);
    // The mover's score, which is what the number beside the bar says: 900 wins
    // and 600 draws of 3000 is 40% for White, and the mirror for Black.
    check('the mover’s score is wins plus half the draws',
      Math.abs(api.moverScorePct(one.wdl, 'w') - 40) < 0.001,
      String(api.moverScorePct(one.wdl, 'w')));
    check('…and it inverts for the other side',
      Math.abs(api.moverScorePct(one.wdl, 'b') - 60) < 0.001,
      String(api.moverScorePct(one.wdl, 'b')));
    ct.db.clear();
  }

  console.log('\nsplit positions (24h)');
  {
    // The whole feature is one line of arithmetic on the index, and the line
    // can be wrong in exactly one way that nobody would notice: reading whose
    // move it is from `positionSide` instead of from the LINE. That answers
    // null wherever both colours pass through a position — which includes the
    // standard start position of any course holding lines for both sides — so
    // the naive version silently hides the most consequential split there is.
    const splitsOf = (bid) => {
      ct.tree = trees[bid];
      ct.rootKey = ct.tree.starts[0].ck;
      ct.path = [];
      return api.findSplits();
    };

    const sp291 = splitsOf('291847');
    check('291847 has the 3 own-move splits per-line colour finds', sp291.length === 3,
      String(sp291.length));
    const root = sp291[0];
    check('…the shallowest of them is the start position', root && root.depth === 0,
      root ? String(root.depth) : '(none)');
    check('…and it is the course’s three first moves',
      root && root.groups.map((g) => g.san + ':' + g.n).join(' ') === 'e4:26 c4:2 d4:2',
      root ? root.groups.map((g) => g.san + ':' + g.n).join(' ') : '');
    // THE CONTROL-SENSITIVE ONE. If this ever passes with `positionSide` in
    // `findSplits`, the assertion above has stopped meaning anything.
    check('…which `positionSide` cannot see (it answers null there)',
      api.positionSide(root.ck) === null, String(api.positionSide(root.ck)));
    check('a Black split in a White-majority course is still found',
      sp291.some((s) => s.stm === 'b'), '');

    const sp453 = splitsOf('453453');
    check('453453 has its 3 own-move splits', sp453.length === 3, String(sp453.length));
    check('…the shallowest being 2…Nc6 (60 lines) against 2…Qb6 (2)',
      sp453[0] && sp453[0].groups.map((g) => g.san + ':' + g.n).join(' ') === 'Nc6:60 Qb6:2',
      sp453[0] ? sp453[0].groups.map((g) => g.san + ':' + g.n).join(' ') : '');
    check('groups are listed commonest first',
      sp453.every((s) => s.groups.every((g, i) => i === 0 || s.groups[i - 1].n >= g.n)));
    check('a repertoire with no two answers reports none', splitsOf('455941').length === 0,
      String(splitsOf('455941').length));

    // Every card named is (a) a line written for the side to move — a card only
    // ever QUIZZES its own colour, so a line passing through playing the
    // opponent's move is not a card that can refuse anything — and (b) carries
    // a `userPly` that really is the index of this move among that line's own
    // user moves. (b) is the join onto getLesson's rows, and it is the other
    // thing here that would be wrong invisibly: a misaligned index reads a
    // DIFFERENT move's alternatives and reports them with full confidence.
    let cards = 0, wrongSide = 0, misaligned = 0, miscounted = 0;
    for (const bid of ['291847', '453453']) {
      const tree = trees[bid];
      ct.tree = tree;
      const byOid = new Map(tree.lines.map((l) => [l.oid, l]));
      for (const s of api.findSplits()) {
        for (const g of s.groups) {
          if (g.cards.length !== g.n) miscounted++;
          for (const c of g.cards) {
            cards++;
            const line = byOid.get(c.oid);
            if (!line || line.side !== s.stm) { wrongSide++; continue; }
            const user = api.pathOfLine(line)
              .filter((p) => (tree.fens.get(p.before) || '').split(' ')[1] === line.side);
            if (!user[c.userPly] || user[c.userPly].san !== g.san) misaligned++;
          }
        }
      }
    }
    check('every card named is a line written for the side to move',
      cards > 0 && wrongSide === 0, wrongSide + ' of ' + cards);
    check('every card’s userPly indexes its own move', misaligned === 0,
      misaligned + ' of ' + cards);
    check('the cards found match the walk’s own per-colour count', miscounted === 0,
      String(miscounted));
  }

  console.log('\nthe alternatives verdict (24h)');
  {
    // Synthetic, because the only way to reach this is a course where the user
    // HAS registered an alternative — and the three things it can get wrong all
    // fail silently: an over-disambiguated spelling, castling, and a lesson row
    // that does not line up with the walk.
    ct.tree = trees['453453'];
    const split = api.findSplits()[0];           // 2…Nc6 (60) / 2…Qb6 (2)
    const [main, minor] = split.groups;
    const card = minor.cards[0];                 // one of the two Qb6 cards

    const set = (alts) => ct.alts.set(card.oid, {
      plies: Object.assign([], { length: card.userPly + 1 }, { [card.userPly]: { san: minor.san, alts } }),
    });

    ct.alts.clear();
    check('an unread card claims nothing', api.cardVerdict(split, minor, card) === null);

    set([]);
    check('no alternatives registered ⇒ it refuses the other move',
      api.cardVerdict(split, minor, card).refuses === true);

    set([main.san]);
    check('the other move registered ⇒ it accepts',
      api.cardVerdict(split, minor, card).refuses === false);

    // CHESSABLE OVER-DISAMBIGUATES (§12.7) and an author types the alternative
    // by hand, so the stored string is not necessarily the walk's spelling.
    // Only the b8 knight can reach c6, so "Nbc6" is the same move spelled long.
    set(['Nbc6']);
    check('an over-disambiguated spelling is still the same move',
      api.cardVerdict(split, minor, card).refuses === false);

    set(['Qa5']);
    check('an unrelated alternative does not count',
      api.cardVerdict(split, minor, card).refuses === true);

    set(['not a move']);
    check('an unresolvable alternative is dropped, not guessed at',
      api.cardVerdict(split, minor, card).refuses === true);

    // A lesson whose row does not carry this move's SAN means the join failed,
    // and the honest answer is silence: reporting the alternatives of whatever
    // move DID land at that index is worse than reporting nothing.
    ct.alts.set(card.oid, {
      plies: Object.assign([], { length: card.userPly + 1 },
        { [card.userPly]: { san: 'e5', alts: [main.san] } }),
    });
    check('a lesson that will not align claims nothing',
      api.cardVerdict(split, minor, card) === null);

    ct.alts.set(card.oid, { error: 'HTTP 500' });
    check('a card that could not be read claims nothing',
      api.cardVerdict(split, minor, card) === null);

    // The group summary is what the row prints, and "checked" must never count
    // a card nothing is known about.
    ct.alts.clear();
    set([]);
    const gv = api.groupVerdict(split, minor);
    check('the group counts only the cards actually read',
      gv.checked === 1 && gv.refusing === 1, JSON.stringify(gv));
    ct.alts.clear();
  }

  console.log('\nthe alternatives wire (24h)');
  {
    // Chessable stores the list as a JSON-encoded STRING (section 23's ground
    // truth). A correct field name alone still read as empty, so this is the
    // shape, not a formality.
    check('a JSON-encoded string parses', api.parseAltList('["d5","Nc6"]').join(',') === 'd5,Nc6');
    check('null is no alternatives', api.parseAltList(null).length === 0);
    check('an empty string is no alternatives', api.parseAltList('').length === 0);
    check('a bare array is taken as-is', api.parseAltList(['d5']).join(',') === 'd5');
    check('garbage is no alternatives, never a throw', api.parseAltList('{oops').length === 0);
    check('a JSON non-array is no alternatives', api.parseAltList('"d5"').length === 0);
  }

  console.log('\nthe refusal (§7)');
  {
    // A course whose lines mostly will not replay must THROW rather than answer
    // — section 21's lesson, and the one failure mode that looks like a result.
    const junk = { name: 'junk', vars: [] };
    for (let i = 0; i < 10; i++) junk.vars.push({ oid: 'x' + i, name: 'bad', sans: ['Qz9'], color: 'white', fen: '' });
    junk.vars.push({ oid: 'ok', name: 'ok', sans: ['e4'], color: 'white', fen: '' });
    let threw = '';
    try {
      await api.buildCourseTree(junk, '1', null, null);
    } catch (err) { threw = String(err.message || err); }
    check('a course that will not replay refuses', /could not be replayed/.test(threw), threw || '(no throw)');
  }

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nall passed');
  process.exit(failures ? 1 : 0);
})();
