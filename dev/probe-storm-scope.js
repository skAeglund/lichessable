/**
 * Measures the one asymmetry §28 inherits from §14.21: the POOL filter keeps a
 * frontier when ANY of its lines is in scope (`oids.some`), while the STORE
 * filter tests the single `o` that `stormPack` wrote, which is `oids[0]`.
 *
 * So: how often does a frontier survive a position scope while `oids[0]` is OUT
 * of it? Every such frontier's stored positions are dropped by the next session
 * scoped to the same FEN — the gather pays and the session does not deal.
 *
 * ONE WALK, not one per candidate: the shipped `stormLineThrough` is executed
 * per line to build an INVERTED index (coverage key -> the oids that visit it),
 * which is exactly what `stormFrontiers`'s `through` set is a column of. So the
 * numbers are the shipped rules' own, and the probe runs in seconds instead of
 * re-walking a 300-line course a few thousand times.
 */
'use strict';
const fs = require('fs');
const { sliceDecl } = require('./slice-source.js');
const CloSan = require('../engine/san.js');

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const SQ_FILES = 'abcdefgh';
const squareName = (i) => SQ_FILES[i & 7] + ((i >> 3) + 1);
const cacheKey = (fen) => fen.split(' ').slice(0, 4).join(' ');
const sleepMs = () => Promise.resolve();
const warn = () => {};

const src = [
  sliceDecl('RELAXED_SAN_RE'), sliceDecl('sanToUciRelaxed'), sliceDecl('sanToUci'),
  sliceDecl('fenAfterUci'), sliceDecl('walkVariation'), sliceDecl('sideOf'),
  sliceDecl('stormCoverKey'), sliceDecl('stormFenKey'), sliceDecl('stormLineThrough'),
  sliceDecl('stormLineKeys'), sliceDecl('stormNoteLineKeys'),
  // §29) …and the anchor collector, which both walks call: without it the
  // slice throws before a single frontier is walked (this probe had gone stale
  // against v0.171.0 and was fixed in passing, v0.181.0).
  sliceDecl('stormAnchorAdd'), sliceDecl('pliesBefore'),
  sliceDecl('stormFilterAnchors'),
  sliceDecl('stormFrontiers'), sliceDecl('stormFilterPool'),
  'return { stormFrontiers, stormFilterPool, stormFenKey, stormCoverKey,' +
  '         stormLineThrough, walkVariation, sanToUci, fenAfterUci, sideOf };',
].join('\n');
const S = new Function('CloSan', 'squareName', 'cacheKey', 'START_FEN', 'warn', 'log',
  'sleepMs', src)(CloSan, squareName, cacheKey, START_FEN, warn, warn, sleepMs);

const C = { minVarPlies: 4, chunkVars: 40 };
// The dump is GITIGNORED — course content is not ours to redistribute — and the
// recipe for remaking it in one console call is in dev/probe-course-tree.js's
// header. Without it this exits 2 and says so, check-course-tree.js's rule.
const DUMP = require('path').join(__dirname, 'tmp-courses.json');
if (!fs.existsSync(DUMP)) {
  console.error('dev/probe-storm-scope.js needs dev/tmp-courses.json — see the header ' +
    'of dev/probe-course-tree.js for how to make it.');
  process.exit(2);
}
const dump = JSON.parse(fs.readFileSync(DUMP, 'utf8'));

(async () => {
  let tScoped = 0, tBad = 0, tProbes = 0, tBadProbes = 0;
  for (const bid of Object.keys(dump)) {
    const vars = (dump[bid].vars || []).filter((v) => v.sans && v.sans.length);
    if (!vars.length) continue;
    const base = await S.stormFrontiers(vars, C);
    if (!base.length) continue;

    // key -> Set(oid): every position each line visits, with the shipped
    // predicate asserted against the index it is being turned into.
    const idx = new Map();
    for (const v of vars) {
      const side = S.sideOf(v.color);
      const w = side ? S.walkVariation(v) : null;
      if (!w) continue;
      const oid = String(v.oid);
      const keys = new Set();
      for (const p of w.plies) keys.add(S.stormCoverKey(p.before));
      keys.add(S.stormCoverKey(w.end));
      for (const k of keys) {
        if (!S.stormLineThrough(w, k)) throw new Error('index disagrees with source');
        if (!idx.has(k)) idx.set(k, new Set());
        idx.get(k).add(oid);
      }
    }

    let scoped = 0, bad = 0, probes = 0, badProbes = 0;
    const examples = [];
    for (const [, through] of idx) {
      const kept = S.stormFilterPool(base, through);
      if (!kept.length) continue;
      probes++;
      let here = 0;
      for (const f of kept) {
        scoped++;
        if (!through.has(String(f.oids[0]))) {
          bad++; here++;
          if (examples.length < 3) {
            examples.push({ n: f.oids.length, names: f.names.slice(0, 2),
              oids: f.oids.slice(0, 5), first: f.oids[0] });
          }
        }
      }
      if (here) badProbes++;
    }
    tScoped += scoped; tBad += bad; tProbes += probes; tBadProbes += badProbes;
    console.log(bid + ' (' + dump[bid].name + '): ' + vars.length + ' lines, ' +
      base.length + ' frontiers, ' + idx.size + ' distinct positions');
    console.log('   ' + probes + ' positions yield a non-empty scope; ' + badProbes +
      ' of those (' + (probes ? (100 * badProbes / probes).toFixed(1) : '0') +
      '%) hold at least one frontier whose oids[0] is out of scope');
    console.log('   ' + bad + ' / ' + scoped + ' frontier-slots affected (' +
      (scoped ? (100 * bad / scoped).toFixed(2) : '0') + '%)');
    for (const e of examples) {
      console.log('      e.g. frontier of ' + e.n + ' line(s) [' + e.names.join(' | ') +
        '…], oids ' + JSON.stringify(e.oids) + ' → stored under ' + e.first);
    }
  }
  console.log('\nTOTAL: ' + tBadProbes + ' / ' + tProbes +
    ' scoped positions affected; ' + tBad + ' / ' + tScoped + ' frontier-slots (' +
    (tScoped ? (100 * tBad / tScoped).toFixed(2) : '0') + '%)');
})().catch((e) => { console.error(e); process.exit(1); });
