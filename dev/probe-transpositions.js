/**
 * MEASUREMENT for §25's transposition hole (DESIGN-intuition-storm.md §25.1).
 *
 * §19's uncovered source offers "the course answers this position with these
 * replies; here is a popular one it does not answer", and §14.18.4's re-entry
 * check is what stops it offering a reply whose RESULTING position the course
 * answers by another move order. Until v0.162.0 both the covered set and that
 * check were keyed on `cacheKey` — placement + side + castling + EN PASSANT —
 * and a transposition is exactly the case where the two routes differ in their
 * LAST MOVE, so one FEN carries an ep square and the other does not.
 *
 * This counts, over the real course dump, what that cost:
 *   A) decision points SPLIT into two entries by ep alone, so a reply covered
 *      by one route would read as a gap from the other;
 *   B) child positions the course DOES play a move from, missed by the
 *      re-entry check for the same reason.
 *
 * BOTH indexes are rebuilt here rather than one taken off the pool: `dec.cont`
 * is whichever key is SHIPPED, so reading the other one out of it would compare
 * a set with itself and answer 0 for ever.
 *
 * Run: node dev/probe-transpositions.js   (needs dev/tmp-courses.json — see the
 * header of dev/probe-course-tree.js for the one console call that remakes it)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { sliceDecl, SRC_PATH } = require('./slice-source.js');
const CloSan = require('../engine/san.js');

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const SQ_FILES = 'abcdefgh';
const squareName = (i) => SQ_FILES[i & 7] + ((i >> 3) + 1);
const cacheKey = (fen) => fen.split(' ').slice(0, 4).join(' ');
const warn = () => {};
const sleepMs = () => Promise.resolve();

const src = [
  sliceDecl('RELAXED_SAN_RE'), sliceDecl('sanToUciRelaxed'), sliceDecl('sanToUci'),
  sliceDecl('fenAfterUci'), sliceDecl('walkVariation'), sliceDecl('sideOf'),
  sliceDecl('stormCoverKey'),
  sliceDecl('stormLineKeys'), sliceDecl('stormNoteLineKeys'),
  sliceDecl('stormDecisions'), sliceDecl('stormFrontiers'),
  'return { stormDecisions, stormFrontiers, walkVariation, sideOf, sanToUci, fenAfterUci, stormCoverKey };',
].join('\n');
const S = new Function('CloSan', 'squareName', 'cacheKey', 'START_FEN', 'warn', 'log',
  'sleepMs', src)(CloSan, squareName, cacheKey, START_FEN, warn, warn, sleepMs);

const C = { minVarPlies: 6, chunkVars: 40 };

/** The SHIPPED coverage key, sliced so this measurement cannot drift from it. */
const looseKey = (fen) => S.stormCoverKey(fen);

const dumpPath = path.join(__dirname, 'tmp-courses.json');
if (!fs.existsSync(dumpPath)) {
  console.error('dev/tmp-courses.json missing — see dev/probe-course-tree.js header.');
  process.exit(2);
}
const dump = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));

(async () => {
  console.log('source: ' + SRC_PATH + '\n');
  for (const bid of Object.keys(dump)) {
    const course = dump[bid];
    const vars = course.vars || [];
    console.log('=== ' + bid + '  ' + (course.name || '') + '  (' + vars.length + ' variations)');

    const dec = await S.stormDecisions(vars, C);
    console.log('  decision points (cacheKey): ' + dec.length);

    // --- A) decision points split by ep alone ------------------------------
    const byLoose = new Map();
    for (const d of dec) {
      const lk = looseKey(d.fen);
      if (!byLoose.has(lk)) byLoose.set(lk, []);
      byLoose.get(lk).push(d);
    }
    let split = 0, splitGain = 0;
    const splitEx = [];
    for (const [lk, group] of byLoose) {
      if (group.length < 2) continue;
      split += group.length;
      const union = new Set();
      for (const g of group) for (const u of g.covered) union.add(u);
      for (const g of group) {
        const missed = [...union].filter((u) => !g.covered.has(u));
        splitGain += missed.length;
        if (missed.length && splitEx.length < 4) {
          splitEx.push('    ' + g.fen + '\n      covers ' + [...g.covered].join(',') +
            '  — the other route also answers ' + missed.join(','));
        }
      }
    }
    console.log('  A) split by en passant alone: ' + split + ' entries in ' +
      [...byLoose.values()].filter((g) => g.length > 1).length + ' group(s); ' +
      splitGain + ' reply(ies) read as a gap that another route answers');
    for (const e of splitEx) console.log(e);

    // --- B) children the re-entry check misses -----------------------------
    // Rebuild both indexes exactly as stormDecisions does, one per key.
    // BOTH indexes are rebuilt here rather than one of them taken off the
    // pool: `dec.cont` is whichever key is SHIPPED, so reading the other one
    // out of it would compare the same set with itself and answer 0 for ever.
    const cont = { w: new Set(), b: new Set() };
    const contLoose = { w: new Set(), b: new Set() };
    for (const v of vars) {
      if (!v.sans || !v.sans.length) continue;
      const side = S.sideOf(v.color);
      const w = side ? S.walkVariation(v) : null;
      if (!w) continue;
      for (const p of w.plies) {
        cont[side].add(cacheKey(p.before));
        contLoose[side].add(looseKey(p.before));
      }
    }

    let replies = 0, missed = 0, alsoExact = 0;
    const ex = [];
    for (const d of dec) {
      const pos = CloSan.parseFen(d.fen);
      if (!pos) continue;
      for (const mv of CloSan.generateMoves(pos)) {
        const u = squareName(mv.from) + squareName(mv.to) + (mv.promo || "");
        const san = CloSan.moveToSan(pos, u) || u;
        if (!u || d.covered.has(u)) continue;
        const childFen = S.fenAfterUci(d.fen, u);
        if (!childFen) continue;
        const child = CloSan.parseFen(childFen);
        if (!child || child.side !== d.side) continue;
        replies++;
        const exact = cont[d.side].has(cacheKey(childFen));
        const loose = contLoose[d.side].has(looseKey(childFen));
        if (exact) alsoExact++;
        else if (loose) {
          missed++;
          if (ex.length < 5) ex.push('    ' + d.fen + '  +' + san + '  ->  ' + childFen);
        }
      }
    }
    console.log('  B) uncovered replies examined: ' + replies +
      '; caught by the exact key: ' + alsoExact +
      '; MISSED but covered under placement+side+castling: ' + missed);
    for (const e of ex) console.log(e);
    console.log('');
  }
})();
