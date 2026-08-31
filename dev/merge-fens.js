/**
 * dev/merge-fens.js — merge several `--dump-fens` survivor dumps into one,
 * deduped on `cacheKey` (the storm never shows a position twice, so measuring
 * one twice would weight it twice).
 *
 *   node dev/merge-fens.js out.json in1.json in2.json ...
 */
'use strict';
const fs = require('fs');
const out = process.argv[2];
const seen = new Set();
const all = [];
for (const f of process.argv.slice(3)) {
  if (!fs.existsSync(f)) { console.log('skipped (missing) ' + f); continue; }
  const a = JSON.parse(fs.readFileSync(f, 'utf8'));
  let kept = 0;
  for (const p of a) {
    const k = p.fen.split(' ').slice(0, 4).join(' ');
    if (seen.has(k)) continue;
    seen.add(k);
    all.push(p);
    kept++;
  }
  console.log(String(kept).padStart(3) + ' new of ' + String(a.length).padStart(3) + '  ' + f);
}
fs.writeFileSync(out, JSON.stringify(all, null, 1));
const byBid = {};
for (const p of all) byBid[p.bid] = (byBid[p.bid] || 0) + 1;
console.log('wrote ' + all.length + ' positions to ' + out + '   ' + JSON.stringify(byBid));
