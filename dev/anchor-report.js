/**
 * dev/anchor-report.js — re-print the ANCHOR analysis over one or more
 * `probe-cdb-quality.js --dump` files, so several engine passes can be read as
 * one sample without re-running the engine.
 *
 * The question (DESIGN-intuition-storm.md §12.3b, asked again 2026-08-30): a
 * storm verdict is a difference against ONE number per position — the best
 * score ChessDB names — so an error concentrated THERE is paid by every other
 * move in the position, while the same error spread evenly cancels out of the
 * grade. `excess` is that anchor error net of the rest of the position:
 *
 *     excess = (cdb - eng) on ChessDB's own top move
 *            - median (cdb - eng) over the other moves sampled there
 *
 * Every row carries `cdbBandFix`, the verdict ChessDB's own move scores give
 * once its top move is brought back down by `excess` — so "how much of the
 * disagreement is the anchor's fault" is a count, not an argument.
 *
 *   node dev/anchor-report.js dev/tmp-anchor-pass1.json [more.json ...]
 */
'use strict';
const fs = require('fs');
const NL = String.fromCharCode(10);
const BANDS = ['great', 'good', 'ok', 'bad', 'blunder'];
const grp = (b) => (BANDS.indexOf(b) <= 1 ? 'scores' : (b === 'ok' ? 'nothing' : 'costs'));

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node dev/anchor-report.js <dump.json> [dump.json ...]');
  process.exit(2);
}

const rows = [];
const pos = [];
const seen = new Set();
let meta = null;
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  meta = meta || d.meta;
  let kept = 0;
  for (const p of d.positions) {
    const k = p.fen.split(' ').slice(0, 4).join(' ');
    if (seen.has(k)) continue;
    seen.add(k);
    pos.push(p);
    kept++;
    for (const r of d.rows) if (r.fen === p.fen) rows.push(r);
  }
  console.log(String(kept).padStart(3) + ' new positions from ' + f);
}

const q = (arr, pr) => (arr.length
  ? arr.slice().sort((a, b) => a - b)[Math.floor(pr * (arr.length - 1))] : 0);
const pc = (n) => String(Math.round(100 * n / (rows.length || 1))).padStart(3) + '%';
const r0 = (n) => String(Math.round(n));
const stat = (label, arr) => console.log('  ' + label.padEnd(26) +
  'median ' + r0(q(arr, 0.5)).padStart(6) + '   p25 ' + r0(q(arr, 0.25)).padStart(6) +
  '   p75 ' + r0(q(arr, 0.75)).padStart(6) + '   min ' + r0(q(arr, 0)).padStart(6) +
  '   max ' + r0(q(arr, 1)).padStart(6));

console.log(NL + '='.repeat(74));
console.log('positions ' + pos.length + '   moves ' + rows.length +
  '   engine ' + (meta ? meta.build + ' depth<=' + meta.depthCeiling : '?'));
const dep = pos.map((p) => p.depth);
console.log('depth reached: min ' + q(dep, 0) + '  median ' + q(dep, 0.5) + '  max ' + q(dep, 1));

// --- the two headline agreements, recomputed over the union ----------------
const agree = rows.filter((r) => r.cdbBand === r.engBand).length;
const sameGrp = rows.filter((r) => grp(r.cdbBand) === grp(r.engBand)).length;
const agreeFix = rows.filter((r) => r.cdbBandFix === r.engBand).length;
const grpFix = rows.filter((r) => grp(r.cdbBandFix) === grp(r.engBand)).length;
const dAbs = rows.map((r) => Math.abs(r.d));
console.log(NL + 'ChessDB minus engine, absolute centipawns:');
console.log('  <25 ' + rows.filter((r) => Math.abs(r.d) < 25).length +
  '  <50 ' + rows.filter((r) => Math.abs(r.d) >= 25 && Math.abs(r.d) < 50).length +
  '  <100 ' + rows.filter((r) => Math.abs(r.d) >= 50 && Math.abs(r.d) < 100).length +
  '  100+ ' + rows.filter((r) => Math.abs(r.d) >= 100).length +
  '   (median ' + r0(q(dAbs, 0.5)) + ', p90 ' + r0(q(dAbs, 0.9)) + ')');
console.log(NL + 'VERDICT BAND        as shipped        anchor corrected');
console.log('  same band        ' + String(agree).padStart(5) + ' ' + pc(agree) +
  '       ' + String(agreeFix).padStart(5) + ' ' + pc(agreeFix));
console.log('  same outcome     ' + String(sameGrp).padStart(5) + ' ' + pc(sameGrp) +
  '       ' + String(grpFix).padStart(5) + ' ' + pc(grpFix));
const diff = rows.filter((r) => r.cdbBand !== r.engBand);
const fixedBy = diff.filter((r) => r.cdbBandFix === r.engBand).length;
const brokeBy = rows.filter((r) => r.cdbBand === r.engBand && r.cdbBandFix !== r.engBand).length;
console.log('  of ' + diff.length + ' disagreements the anchor alone explains ' + fixedBy +
  '   (and the correction breaks ' + brokeBy + ' that were right)');

// --- the anchor itself ------------------------------------------------------
console.log(NL + 'THE ANCHOR  (signed, ChessDB minus engine; + = ChessDB more optimistic)');
stat('ceiling gap best-best', pos.map((p) => p.ceilGap));
stat('error on cdb top move', pos.filter((p) => p.dTop !== null).map((p) => p.dTop));
stat('error on the rest', pos.map((p) => p.dMed));
stat('EXCESS = top - rest', pos.map((p) => p.excess));
const n = pos.length || 1;
const cnt = (f) => pos.filter(f).length;
console.log(NL + '  anchor optimistic by   >=25cp ' + cnt((p) => p.excess >= 25) + '/' + n +
  '   >=50cp ' + cnt((p) => p.excess >= 50) + '/' + n +
  '   >=100cp ' + cnt((p) => p.excess >= 100) + '/' + n);
console.log('  anchor pessimistic by  >=25cp ' + cnt((p) => p.excess <= -25) + '/' + n +
  '   >=50cp ' + cnt((p) => p.excess <= -50) + '/' + n +
  '   >=100cp ' + cnt((p) => p.excess <= -100) + '/' + n);
console.log('  ChessDB best == engine best of the set: ' + cnt((p) => p.bestSame) + '/' + n);

// --- what it costs ----------------------------------------------------------
const harsh = rows.filter((r) => BANDS.indexOf(r.engBand) <= 1 && BANDS.indexOf(r.cdbBand) >= 2);
const soft = rows.filter((r) => BANDS.indexOf(r.cdbBand) <= 1 && BANDS.indexOf(r.engBand) >= 2);
console.log(NL + '  engine great/good, ChessDB ok or worse: ' + harsh.length + ' ' + pc(harsh.length) +
  '   anchor correction restores ' + harsh.filter((r) => BANDS.indexOf(r.cdbBandFix) <= 1).length);
console.log('  ChessDB great/good, engine ok or worse: ' + soft.length + ' ' + pc(soft.length) +
  '   <- the dangerous direction');
const flat = rows.filter((r) => BANDS.indexOf(r.cdbBand) >= 3 && BANDS.indexOf(r.engBand) <= 1);
console.log('  ChessDB bad/blunder, engine great/good: ' + flat.length + ' ' + pc(flat.length));

console.log(NL + '  rows = ChessDB, cols = engine');
console.log('           ' + BANDS.map((b) => b.slice(0, 7).padStart(8)).join(''));
for (const a of BANDS) {
  console.log('  ' + a.padEnd(9) + BANDS.map((b) =>
    String(rows.filter((r) => r.cdbBand === a && r.engBand === b).length).padStart(8)).join(''));
}

// --- does it concentrate where the book is thin? ---------------------------
console.log(NL + 'by how elaborated the position is (moves ChessDB scored):');
console.log('  bucket    pos   median excess   median |excess|   bands agree');
for (const b of [[0, 5], [6, 9], [10, 14], [15, 999]]) {
  const sel = pos.filter((p) => p.nScored >= b[0] && p.nScored <= b[1]);
  const keys = new Set(sel.map((p) => p.fen));
  const rs = rows.filter((r) => keys.has(r.fen));
  const ag = rs.filter((r) => r.cdbBand === r.engBand).length;
  console.log('  ' + (b[1] === 999 ? b[0] + '+' : b[0] + '-' + b[1]).padEnd(8) +
    String(sel.length).padStart(5) +
    r0(q(sel.map((p) => p.excess), 0.5)).padStart(15) +
    r0(q(sel.map((p) => Math.abs(p.excess)), 0.5)).padStart(18) +
    ('   ' + ag + '/' + rs.length + (rs.length ? '  ' + Math.round(100 * ag / rs.length) + '%' : '')).padStart(16));
}
for (const arm of [['top move in the real book', (p) => p.nBook > 0],
  ['nothing in the real book', (p) => !p.nBook],
  ['ChessDB and engine agree on best', (p) => p.bestSame],
  ['they disagree on best', (p) => !p.bestSame]]) {
  const sel = pos.filter(arm[1]);
  console.log('  ' + arm[0].padEnd(34) + String(sel.length).padStart(3) + ' positions   median excess ' +
    r0(q(sel.map((p) => p.excess), 0.5)).padStart(5) + 'cp   median |excess| ' +
    r0(q(sel.map((p) => Math.abs(p.excess)), 0.5)).padStart(4) + 'cp');
}

console.log(NL + 'per position, worst anchor first:');
console.log('  excess  ceil  scored   cdbTop            cdb    eng   rest   agree  fen');
for (const p of pos.slice().sort((a, b) => b.excess - a.excess)) {
  const rs = rows.filter((r) => r.fen === p.fen);
  const ag = rs.filter((r) => r.cdbBand === r.engBand).length;
  console.log('  ' + r0(p.excess).padStart(6) + r0(p.ceilGap).padStart(6) +
    String(p.nScored).padStart(8) + '   ' +
    String(p.cdbBestSan + (p.bestSame ? '' : ' (eng ' + p.engBestSan + ')')).padEnd(16) +
    String(p.cdbBest).padStart(6) + String(p.engOfCdbTop).padStart(7) + r0(p.dMed).padStart(7) +
    ('   ' + ag + '/' + rs.length).padEnd(9) + p.fen);
}
console.log();
