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
 * Run a control by pointing CLO_SRC at a copy with the change reverted and
 * confirming it FAILS.
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
  sliceDecl('dbMovesFor'),
  sliceDecl('gapsFor'),
  sliceDecl('pathOfLine'),
  'return { buildCourseTree, foldFrom, rowsAt, standColumn, columnsFor, standingPlies, keyOfPlies,' +
  '         positionSide, gapKind, dbMovesFor, gapsFor, pathOfLine };',
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
const C = {
  foldShow: num('foldShow'), foldMax: num('foldMax'), maxRows: num('maxRows'),
  maxColumns: num('maxColumns'), maxDepth: num('maxDepth'),
  maxNames: num('maxNames'), maxNameLen: num('maxNameLen'), chunkVars: num('chunkVars'),
  lichess: {
    minGames: lnum('minGames'), gapMinShare: lnum('gapMinShare'), gapMaxRows: lnum('gapMaxRows'),
  },
};

const ct = { tree: null, rootKey: null, path: [], dbOn: true, db: new Map() };
// eslint-disable-next-line no-new-func
const api = new Function(
  'CloSan', 'squareName', 'cacheKey', 'sleepMs', 'warn', 'C', 'ct', 'START_FEN', 'L',
  shared)(CloSan, squareName, cacheKey, sleepMs, warn, C, ct, START_FEN, C.lichess);

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
