/**
 * dev/probe-puzzles.js — the §3 measurements for DESIGN-storm-puzzles.md.
 *
 * Runs the REAL content/puzzles.js and the REAL stormAnchorAdd (sliced out of
 * content/lichessable.js) against the LIVE dataset, over a dump of getList.
 * Answers the one question that decides whether a course is stormable with
 * puzzles at all: how many anchors does its ply band produce, how many index
 * shards do they cost, and how many puzzles come back.
 *
 * THIS IS THE CHEAPEST QUESTION TO ASK OF A NEW COURSE, and the numbers it
 * reports are the ones every threshold in `CONFIG.storm.puzzle*` was chosen
 * from. Re-run it before changing any of them.
 *
 * Not part of the extension; not referenced by the manifest. It makes real
 * network requests — one ~320 KB index shard per anchor — so it is bounded by
 * --max and is not something to point at a repertoire idly.
 *
 * Usage:
 *   node dev/probe-puzzles.js                  every course in the dump
 *   node dev/probe-puzzles.js --bid 453453     one of them
 *   node dev/probe-puzzles.js --bands          the floor/ceiling sweep
 *   node dev/probe-puzzles.js --max 40         shards per course (default 60)
 *
 * REMAKING dev/tmp-courses.json: see the header of dev/probe-course-tree.js —
 * it is the same dump, and it is gitignored because course content is not ours
 * to redistribute.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { sliceDecl } = require('./slice-source.js');
const CloSan = require('../engine/san.js');
const CloPuzzles = require('../content/puzzles.js');

const BASE = 'https://skaeglund.github.io/puzzle-explorer-data/';
const DUMP = path.join(__dirname, 'tmp-courses.json');

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const has = (name) => argv.indexOf('--' + name) >= 0;
const MAX_SHARDS = Number(arg('max', 60));
const ONLY = arg('bid', '');

if (!fs.existsSync(DUMP)) {
  console.error('dev/tmp-courses.json is missing — see the header of\n' +
    'dev/probe-course-tree.js for the one console call that remakes it.');
  process.exit(2);
}
const courses = JSON.parse(fs.readFileSync(DUMP, 'utf8'));

// --- the shipped pieces, sliced so this cannot drift from the source --------
const SQ_FILES = 'abcdefgh';
const src = [
  sliceDecl('RELAXED_SAN_RE'),
  sliceDecl('sanToUciRelaxed'),
  sliceDecl('sanToUci'),
  sliceDecl('fenAfterUci'),
  sliceDecl('walkVariation'),
  sliceDecl('sideOf'),
  sliceDecl('stormAnchorAdd'),
  'return { walkVariation, stormAnchorAdd, sideOf };',
].join('\n');
const pliesBefore = (fen) => {
  const parts = String(fen || '').trim().split(/\s+/);
  const full = Number(parts[5]);
  if (!Number.isInteger(full) || full < 1) return null;
  if (parts[1] !== 'w' && parts[1] !== 'b') return null;
  return 2 * (full - 1) + (parts[1] === 'b' ? 1 : 0);
};
// eslint-disable-next-line no-new-func
const S = new Function('CloSan', 'CloPuzzles', 'pliesBefore', 'squareName',
  'START_FEN', 'warn', src)(
  CloSan, CloPuzzles, pliesBefore,
  (i) => SQ_FILES[i & 7] + ((i >> 3) + 1),
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  () => {});

// --- the live dataset -------------------------------------------------------
const shardCache = new Map();
let fetched = 0;
async function indexShard(shard) {
  if (shardCache.has(shard)) return shardCache.get(shard);
  const res = await fetch(BASE + 'index/' + shard + '.json');
  // A 404 is "no puzzles here", not an error (integration guide §4.1).
  const data = res.status === 404 ? null : (res.ok ? await res.json() : null);
  if (!res.ok && res.status !== 404) {
    throw new Error('HTTP ' + res.status + ' for index/' + shard);
  }
  fetched++;
  shardCache.set(shard, data);
  return data;
}

const pct = (n, d) => (d ? Math.round((n / d) * 100) + '%' : '—');

async function anchorsFor(course, lo, hi) {
  const C = { puzzleAnchorMinPly: lo, puzzleAnchorMaxPly: hi };
  const anchors = new Map();
  let walked = 0, short = 0;
  for (const v of course.vars || []) {
    if (!v.sans || !v.sans.length) continue;
    const side = S.sideOf(v.color);
    const w = side ? S.walkVariation(v) : null;
    if (!w) continue;
    walked++;
    if (w.plies.length < lo) short++;
    S.stormAnchorAdd(anchors, w, v, side, C);
  }
  return { anchors, walked, short };
}

async function report(bid, course) {
  const lo = 10, hi = 16;
  const { anchors, walked, short } = await anchorsFor(course, lo, hi);
  console.log('\n=== ' + bid + '  ' + (course.name || '') + ' ===');
  console.log('  variations walked        ' + walked +
    '   (' + short + ' never reach ply ' + lo + ')');
  console.log('  anchors, ply ' + lo + '-' + hi + '        ' + anchors.size);
  if (!anchors.size) {
    console.log('  nothing to look up — this course cannot be stormed with puzzles');
    return;
  }
  // Deepest first, which is the order the gather itself takes: within the band,
  // deeper is a stronger claim that the game really played the line.
  const todo = [...anchors.values()].sort((a, b) => b.ply - a.ply)
    .slice(0, MAX_SHARDS);
  const byShard = new Map();
  for (const a of todo) {
    const shard = await CloPuzzles.shardIdFor(a.key);
    if (!byShard.has(shard)) byShard.set(shard, []);
    byShard.get(shard).push(a);
  }
  let hitAnchors = 0;
  const ids = new Set();
  const ratings = [];
  const startPlies = [];
  for (const [shard, group] of byShard) {
    const idx = await indexShard(shard);
    for (const a of group) {
      const raw = (idx && idx[a.key]) || [];
      let any = false;
      for (const side of ['w', 'b']) {
        if (!a.sides[side]) continue;
        for (const m of CloPuzzles.applyFilters(raw, {
          color: side, plyMin: lo, plyMax: hi,
        })) {
          any = true;
          if (ids.has(m[0])) continue;
          ids.add(m[0]);
          if (typeof m[1] === 'number') ratings.push(m[1]);
          if (typeof m[4] === 'number') startPlies.push(m[4]);
        }
      }
      if (any) hitAnchors++;
    }
  }
  ratings.sort((a, b) => a - b);
  startPlies.sort((a, b) => a - b);
  const q = (arr, f) => (arr.length ? arr[Math.floor(arr.length * f)] : null);
  console.log('  anchors probed           ' + todo.length +
    '   in ' + byShard.size + ' index shard(s)');
  console.log('  ...with any puzzle       ' + hitAnchors +
    '   (' + pct(hitAnchors, todo.length) + ')');
  console.log('  puzzles, colour-filtered ' + ids.size);
  console.log('  rating  min/median/max   ' +
    [ratings[0], q(ratings, 0.5), ratings[ratings.length - 1]].join(' / '));
  // The puzzle's OWN start ply, reported and deliberately NOT filtered on: the
  // median is around 55, so a start-ply band would throw away most of the
  // supply for a distinction the feature does not make. What matters is that
  // the GAME played the line, which is m[3] and is what the band above filters.
  console.log('  puzzle start ply p10/50/90 ' +
    [q(startPlies, 0.1), q(startPlies, 0.5), q(startPlies, 0.9)].join(' / '));
}

async function bands(bid, course) {
  console.log('\n=== ' + bid + '  ' + (course.name || '') + '  — band sweep ===');
  console.log('  band        anchors  shards');
  for (const [lo, hi] of [[8, 22], [10, 22], [10, 16], [12, 22], [14, 22]]) {
    const { anchors } = await anchorsFor(course, lo, hi);
    const shards = new Set();
    for (const a of anchors.values()) shards.add(await CloPuzzles.shardIdFor(a.key));
    console.log('  ply ' + String(lo).padStart(2) + '-' + hi +
      String(anchors.size).padStart(10) + String(shards.size).padStart(8));
  }
  console.log('  (shards are the cost: ~320 KB gzip and ~0.9 MB parsed each)');
}

(async () => {
  for (const bid of Object.keys(courses)) {
    if (ONLY && bid !== ONLY) continue;
    if (has('bands')) await bands(bid, courses[bid]);
    else await report(bid, courses[bid]);
  }
  console.log('\n' + fetched + ' index shard(s) fetched.');
})().catch((err) => { console.error(err); process.exit(1); });
