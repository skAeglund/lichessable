/**
 * dev/probe-course-tree.js — the §8 measurements for DESIGN-course-tree.md.
 *
 * Runs the REAL engine/san.js and a faithful copy of walkVariation over a dump
 * of getList (dev/tmp-courses.json, produced from a live session). Answers:
 * bushiness, repKey-vs-cacheKey merging, isKey density, cycles, colour.
 *
 * Not part of the extension; not referenced by the manifest.
 *
 * REMAKING dev/tmp-courses.json (it is gitignored — course content is not ours
 * to redistribute). On a logged-in chessable.com tab, in the page console:
 *
 *   const jwt = localStorage.getItem('chessable.web.production.JWT');
 *   const uid = localStorage.getItem('chessable.web.production.UID');
 *   const h = { Authorization: 'Bearer ' + jwt, platform: 'web' };
 *   const home = await (await fetch(
 *     `/api/v1/getHomeData?uid=${uid}&sortBookRowsBy=alphabetically&userLanguageShort=en`,
 *     { headers: h })).json();
 *   const N = /^\d+\.+/, out = {};
 *   for (const b of home.homeData.booksList) {
 *     const body = await (await fetch(`/api/v1/getList?uid=${uid}&bid=${b.bid}`,
 *       { headers: h })).json();
 *     out[String(b.bid)] = { name: body.list.name, vars: body.list.data.map((v) => ({
 *       oid: String(v.id), name: String(v.name || '').trim(),
 *       sans: (v.moves || []).map((m) => (m && m.san || '').replace(N, '').trim()).filter(Boolean),
 *       keys: (v.moves || []).map((m) => (m && m.isKey ? 1 : 0)),
 *       color: v.color || '', fen: (v.initialFEN || '').trim() })) };
 *   }
 *   const a = document.createElement('a');
 *   a.href = URL.createObjectURL(new Blob([JSON.stringify(out)]));
 *   a.download = 'clo-courses.json'; document.body.appendChild(a); a.click();
 *
 * …then move the download to dev/tmp-courses.json. (Chrome's "ask where to
 * save" leaves it in Downloads as a .tmp until confirmed; either works.)
 */
'use strict';
const CloSan = require('../engine/san.js');
const courses = require('./tmp-courses.json');

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const SQ_FILES = 'abcdefgh';
const squareName = (i) => SQ_FILES[i & 7] + ((i >> 3) + 1);
const cacheKey = (fen) => fen.split(' ').slice(0, 4).join(' ');
const repKey   = (fen) => fen.split(' ').slice(0, 2).join(' ');

const { sliceDecl } = require('./slice-source.js');
const { sanToUci } = new Function('CloSan', 'squareName', [
  sliceDecl('RELAXED_SAN_RE'), sliceDecl('sanToUciRelaxed'), sliceDecl('sanToUci'),
  'return { sanToUci };',
].join(String.fromCharCode(10)))(CloSan, squareName);
function fenAfterUci(preFen, uci) {
  const pos = CloSan.parseFen(preFen);
  const mv = pos && CloSan.uciToMove(pos, uci);
  if (!mv) return null;
  const isPawn = (pos.board[mv.from] || '').toUpperCase() === 'P';
  const isCapture = Boolean(pos.board[mv.to]) || (isPawn && mv.to === pos.ep);
  const preHalf = Number(preFen.trim().split(/\s+/)[4]);
  const postHalf = (isPawn || isCapture) ? 0 : (Number.isInteger(preHalf) ? preHalf : 0) + 1;
  return CloSan.fenFromPos(CloSan.makeMove(pos, mv), postHalf);
}
function walkVariation(v) {
  const start = v.fen || START_FEN;
  let fen = start;
  const plies = [];
  for (const san of v.sans) {
    const pos = CloSan.parseFen(fen);
    const uci = pos && sanToUci(pos, san);
    const after = uci && fenAfterUci(fen, uci);
    if (!after) return null;
    plies.push({ san, uci, before: fen, after, side: pos.side });
    fen = after;
  }
  return { start, plies, end: fen };
}

for (const [bid, course] of Object.entries(courses)) {
  const t0 = Date.now();
  const answers = new Map();   // cacheKey -> Map(uci -> {san,n,oids:Set})
  const repAnswers = new Map();// repKey   -> Map(uci -> n)
  const posByRep = new Map();  // repKey   -> Set(cacheKey)
  const reachedBy = new Map(); // cacheKey -> Set(oid)  (how many lines pass through)
  let unplayable = [], informational = 0, plies = 0;
  let keyPlies = 0, keyVars = 0, colorCount = {};

  for (const v of course.vars) {
    colorCount[v.color || '(none)'] = (colorCount[v.color || '(none)'] || 0) + 1;
    if (!v.sans || !v.sans.length) { informational++; continue; }
    const w = walkVariation(v);
    if (!w) { unplayable.push(v.name || v.oid); continue; }
    if (v.keys) {
      const k = v.keys.filter(Boolean).length;
      keyPlies += k;
      if (k) keyVars++;
    }
    plies += w.plies.length;
    const add = (map, k) => { let s = map.get(k); if (!s) map.set(k, s = new Set()); return s; };
    add(reachedBy, cacheKey(w.start)).add(v.oid);
    for (const p of w.plies) {
      const ck = cacheKey(p.before);
      let m = answers.get(ck); if (!m) answers.set(ck, m = new Map());
      let e = m.get(p.uci); if (!e) m.set(p.uci, e = { san: p.san, n: 0 });
      e.n++;
      const rk = repKey(p.before);
      let rm = repAnswers.get(rk); if (!rm) repAnswers.set(rk, rm = new Map());
      rm.set(p.uci, (rm.get(p.uci) || 0) + 1);
      add(posByRep, rk).add(ck);
      add(reachedBy, cacheKey(p.after)).add(v.oid);
    }
  }

  // Bushiness of the tree as the browser would show it.
  const factors = [...answers.values()].map((m) => m.size);
  const branching = factors.filter((n) => n > 1);
  const hist = {};
  for (const n of factors) hist[n] = (hist[n] || 0) + 1;
  const max = factors.length ? Math.max(...factors) : 0;

  // §8.2 — how much does repKey merge that cacheKey does not?
  let overMerged = 0, overMergedPos = 0;
  for (const [rk, set] of posByRep) if (set.size > 1) { overMerged++; overMergedPos += set.size; }

  // §8.4 — a cycle: a position reachable from itself. Detected on the DAG of
  // distinct positions, following every answer edge.
  const edges = new Map();
  for (const [ck, m] of answers) {
    const outs = new Set();
    for (const uci of m.keys()) {
      const after = fenAfterUci(ck + ' 0 1', uci);
      if (after) outs.add(cacheKey(after));
    }
    edges.set(ck, outs);
  }
  const WHITE = 0, GREY = 1, BLACK = 2;
  const mark = new Map();
  let cycles = 0, deepest = 0;
  function dfs(root) {
    const stack = [[root, edges.get(root) ? [...edges.get(root)] : [], 0]];
    mark.set(root, GREY);
    while (stack.length) {
      const top = stack[stack.length - 1];
      deepest = Math.max(deepest, stack.length);
      if (!top[1].length) { mark.set(top[0], BLACK); stack.pop(); continue; }
      const next = top[1].pop();
      const st = mark.get(next);
      if (st === GREY) { cycles++; continue; }
      if (st === BLACK) continue;
      mark.set(next, GREY);
      stack.push([next, edges.get(next) ? [...edges.get(next)] : [], 0]);
    }
  }
  for (const ck of edges.keys()) if (!mark.has(ck)) dfs(ck);

  // §3.3 — how much does folding forced runs buy? Count rows a column browser
  // would draw with and without the fold, over positions with >= 1 answer.
  const forced = factors.filter((n) => n === 1).length;

  console.log('='.repeat(70));
  console.log(`${bid}  ${course.name}`);
  console.log(`  variations ${course.vars.length}  informational ${informational}  unplayable ${unplayable.length}`);
  if (unplayable.length) console.log('    unplayable:', unplayable.slice(0, 8).join(' | '));
  console.log(`  plies walked ${plies}   distinct positions with a move ${answers.size}   walk ${Date.now() - t0} ms`);
  console.log(`  branching factor: max ${max}  branching positions ${branching.length}  forced (bf=1) ${forced} (${(100 * forced / (factors.length || 1)).toFixed(0)}%)`);
  console.log('  histogram bf→positions:', JSON.stringify(hist));
  console.log(`  §8.2 repKey groups merging >1 cacheKey position: ${overMerged} (covering ${overMergedPos} positions of ${answers.size})`);
  console.log(`  §8.3 isKey: ${keyPlies}/${plies} plies (${(100 * keyPlies / (plies || 1)).toFixed(0)}%), on ${keyVars} variation(s)`);
  console.log(`  §8.4 back-edges into the current DFS path: ${cycles}   deepest DFS stack ${deepest}`);
  console.log('  §8.5 colours:', JSON.stringify(colorCount));
  const multi = [...reachedBy.values()].filter((s) => s.size > 1).length;
  console.log(`  positions reached by more than one variation: ${multi}`);
}

// --- §3.3 the fold, and what a real column looks like ----------------------
// Re-walks each course and reports, for the position a browser opens on, the
// column sizes down the most-travelled path with and without the fold.
console.log('\n' + '='.repeat(70));
console.log('FOLD / COLUMN SHAPE');
for (const [bid, course] of Object.entries(courses)) {
  const answers = new Map();
  const roots = new Map();
  for (const v of course.vars) {
    if (!v.sans || !v.sans.length) continue;
    const w = walkVariation(v);
    if (!w) continue;
    roots.set(cacheKey(w.start), (roots.get(cacheKey(w.start)) || 0) + 1);
    for (const p of w.plies) {
      const ck = cacheKey(p.before);
      let m = answers.get(ck); if (!m) answers.set(ck, m = new Map());
      let e = m.get(p.uci); if (!e) m.set(p.uci, e = { san: p.san, n: 0, after: cacheKey(p.after) });
      e.n++;
    }
  }
  const root = [...roots].sort((a, b) => b[1] - a[1])[0];
  console.log(`\n${bid} ${course.name} — ${roots.size} distinct start position(s), commonest covers ${root[1]} line(s)`);
  // Fold: from a position, follow single-answer positions until one branches.
  const seen = new Set();
  function foldRun(ck) {
    const run = [];
    let at = ck, guard = 0;
    while (guard++ < 200) {
      const m = answers.get(at);
      if (!m || m.size !== 1) break;
      const [, e] = [...m][0];
      run.push(e.san);
      at = e.after;
      if (seen.has(at)) break;
    }
    return { run, end: at };
  }
  let ck = root[0], depth = 0;
  while (depth++ < 8) {
    const m = answers.get(ck);
    if (!m) { console.log('  (line ends)'); break; }
    const rows = [...m.values()].sort((a, b) => b.n - a.n).map((e) => {
      const f = foldRun(e.after);
      return `${e.san}${f.run.length ? ' ' + f.run.join(' ') : ''} [${e.n}]`;
    });
    console.log(`  column ${depth}: ${m.size} row(s) — ` + rows.slice(0, 6).join('  |  '));
    const best = [...m.values()].sort((a, b) => b.n - a.n)[0];
    const f = foldRun(best.after);
    ck = f.end;
  }
}
