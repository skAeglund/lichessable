#!/usr/bin/env node
/**
 * dev/probe-puzzle-collect.js — the measurement §29.2 rests on.
 *
 * Runs BOTH collect stages against the live dataset, with no Chessable session
 * and no extension, and reports the two numbers the design turns on:
 *
 *   1. what a full stage-A scan actually costs (shards, bytes, wall clock) —
 *      the figure v0.171.x got wrong by reading a shard's PARSED size as its
 *      download size, which is why gathering puzzles was an overnight job;
 *   2. how much GROUPING stage B by body shard saves — one fetch per puzzle
 *      against one fetch per distinct shard, which is the whole reason
 *      "collect the lot" is affordable.
 *
 * It takes a LINE rather than a course, so it needs no auth: any repertoire
 * line will do and the shape of the answer does not depend on which.
 *
 *   node dev/probe-puzzle-collect.js
 *   node dev/probe-puzzle-collect.js --line "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6"
 *   node dev/probe-puzzle-collect.js --min 10 --max 16 --color w
 *   node dev/probe-puzzle-collect.js --bodies 64   # cap the stage-B sample
 *
 * NOTHING HERE WRITES ANYTHING. It is a read of a static CC0 dataset.
 */
'use strict';

const CloPuzzles = require('../content/puzzles.js');
const CloSan = require('../engine/san.js');

const BASE = 'https://skaeglund.github.io/puzzle-explorer-data/';
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const DEFAULT_LINE =
  'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O';

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i === -1 ? dflt : process.argv[i + 1];
}

const LINE = String(arg('line', DEFAULT_LINE)).trim().split(/\s+/).filter(Boolean);
const MIN_PLY = Number(arg('min', 10));
const MAX_PLY = Number(arg('max', 16));
const COLOR = String(arg('color', 'w'));
const BODY_CAP = Number(arg('bodies', 48));
const BATCH = 8;

/** engine/san.js speaks 0..63 square INDICES (a1 = 0), not square names, so a
 *  uci has to be spelled out rather than concatenated off a move object. */
const sq = (i) => 'abcdefgh'[i % 8] + (Math.floor(i / 8) + 1);

/** SAN -> uci on a position, strictly (the probe writes its own line, so there
 *  is no need for lichessable's relaxed second pass). */
function sanToUci(fen, san) {
  const pos = CloSan.parseFen(fen);
  for (const mv of CloSan.generateMoves(pos)) {
    const uci = sq(mv.from) + sq(mv.to) + (mv.promo || '');
    if (CloSan.moveToSan(pos, uci) === san) return uci;
  }
  return null;
}

/** The line's positions, with each one's ABSOLUTE ply in the game (§3.2's rule:
 *  ply is never an index into the line). */
function walk() {
  const out = [];
  let fen = START;
  let ply = 0;
  out.push({ fen, ply });
  for (const san of LINE) {
    const uci = sanToUci(fen, san);
    if (!uci) throw new Error('illegal SAN in --line: ' + san + ' at ply ' + ply);
    const pos = CloSan.parseFen(fen);
    fen = CloSan.fenFromPos(CloSan.makeMove(pos, CloSan.uciToMove(pos, uci)));
    ply++;
    out.push({ fen, ply });
  }
  return out;
}

async function get(path) {
  const t0 = Date.now();
  const res = await fetch(BASE + path);
  if (res.status === 404) return { missing: true, ms: Date.now() - t0, bytes: 0 };
  if (!res.ok) throw new Error('HTTP ' + res.status + ' on ' + path);
  const text = await res.text();
  return { text, ms: Date.now() - t0, bytes: text.length };
}

/** `paths` through `worker` at concurrency `BATCH`. */
async function pool(items, worker) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: BATCH }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await worker(items[k], k);
    }
  }));
  return out;
}

const mb = (n) => (n / (1024 * 1024)).toFixed(1);

(async () => {
  // ---------------------------------------------------------------- meta ---
  const meta = JSON.parse((await get('meta.json')).text);
  const emissionCap = meta.filterStats && meta.filterStats.maxEmissionPly;
  console.log('dataset built ' + meta.builtAt +
    ', ' + meta.filterStats.puzzlesReferenced.toLocaleString() + ' puzzles, ' +
    'maxEmissionPly ' + emissionCap);
  const hi = Math.min(MAX_PLY, emissionCap || MAX_PLY);
  console.log('band ply ' + MIN_PLY + '-' + hi + ', colour ' + COLOR +
    ', line of ' + LINE.length + ' plies\n');

  // ------------------------------------------------------------- stage A ---
  const anchors = walk().filter((x) => x.ply >= MIN_PLY && x.ply <= hi)
    .map((x) => ({ ...x, key: CloPuzzles.fenPositionKey(x.fen) }))
    .filter((x) => x.key);

  const byIndexShard = new Map();
  for (const a of anchors) {
    const shard = await CloPuzzles.shardIdFor(a.key);
    if (!byIndexShard.has(shard)) byIndexShard.set(shard, []);
    byIndexShard.get(shard).push(a);
  }

  const idxShards = [...byIndexShard.keys()];
  const tA = Date.now();
  let idxBytes = 0;
  const matches = new Map();   // id -> tuple
  await pool(idxShards, async (shard) => {
    const got = await get('index/' + shard + '.json');
    idxBytes += got.bytes;
    if (got.missing) return;
    const idx = JSON.parse(got.text);
    for (const a of byIndexShard.get(shard)) {
      const raw = idx[a.key];
      if (!raw) continue;
      const keep = CloPuzzles.applyFilters(raw, {
        color: COLOR, plyMin: MIN_PLY, plyMax: hi,
      });
      for (const m of keep) matches.set(String(m[0]), m);
    }
  });
  const msA = Date.now() - tA;

  console.log('STAGE A  anchors in band ' + anchors.length +
    ', index shards ' + idxShards.length);
  console.log('         ' + msA + ' ms wall at concurrency ' + BATCH +
    ', ' + mb(idxBytes) + ' MB parsed');
  console.log('         ' + matches.size + ' distinct puzzle(s) matched');
  if (idxShards.length) {
    console.log('         -> a 182-shard course scan: ' +
      (msA / idxShards.length * 182 / 1000).toFixed(0) + ' s\n');
  }
  if (!matches.size) {
    console.log('No puzzles at this line in this band — try a shallower --min.');
    return;
  }

  // ------------------------------------------------------------- stage B ---
  // THE CLAIM THIS PROBE EXISTS TO CHECK: ids hash across all 4096 body shards,
  // so ungrouped stage B costs one fetch per PUZZLE and grouped costs one per
  // DISTINCT SHARD. The saving grows with the haul and is the whole reason a
  // complete collect is a minute rather than an evening.
  const ids = [...matches.keys()];
  const byBodyShard = new Map();
  for (const id of ids) {
    const shard = await CloPuzzles.shardIdFor(id);
    if (!byBodyShard.has(shard)) byBodyShard.set(shard, []);
    byBodyShard.get(shard).push(id);
  }
  const bodyShards = [...byBodyShard.keys()];
  console.log('STAGE B  ' + ids.length + ' puzzle(s) live in ' +
    bodyShards.length + ' distinct body shard(s)');
  console.log('         ungrouped: ' + ids.length + ' fetches; grouped: ' +
    bodyShards.length + ' — ' +
    (100 - bodyShards.length / ids.length * 100).toFixed(0) + '% fewer');

  const sample = bodyShards.slice(0, Math.min(BODY_CAP, bodyShards.length));
  const tB = Date.now();
  let bodyBytes = 0;
  let found = 0;
  let replayed = 0;
  await pool(sample, async (shard) => {
    const got = await get('puzzles/' + shard + '.ndjson');
    bodyBytes += got.bytes;
    if (got.missing) return;
    const want = new Set(byBodyShard.get(shard));
    for (const line of got.text.split('\n')) {
      if (!line) continue;
      const mk = line.indexOf('"id":"');
      if (mk !== -1) {
        const s0 = mk + 6;
        const s1 = line.indexOf('"', s0);
        if (s1 === -1 || !want.has(line.slice(s0, s1))) continue;
      }
      let b = null;
      try { b = JSON.parse(line); } catch (e) { continue; }
      if (!b || !want.has(String(b.id))) continue;
      found++;
      // …and that it will actually REPLAY, which is what `stormPuzzlePlies`
      // asks before a body is ever stored. A body that will not is a card that
      // cannot be shown.
      let fen = b.fen;
      let ok = Array.isArray(b.moves) && b.moves.length > 0;
      for (const uci of (b.moves || [])) {
        const pos = CloSan.parseFen(fen);
        const mv = pos && CloSan.uciToMove(pos, uci);
        if (!mv) { ok = false; break; }
        fen = CloSan.fenFromPos(CloSan.makeMove(pos, mv));
      }
      if (ok) replayed++;
    }
  });
  const msB = Date.now() - tB;

  console.log('         sampled ' + sample.length + ' shard(s) in ' + msB +
    ' ms, ' + mb(bodyBytes) + ' MB raw');
  console.log('         ' + found + ' body(ies) extracted, ' + replayed +
    ' replay cleanly' + (found === replayed ? '' : '  <-- MISMATCH'));
  if (sample.length) {
    console.log('         -> all ' + bodyShards.length + ' shards: ' +
      (msB / sample.length * bodyShards.length / 1000).toFixed(0) + ' s, ' +
      mb(bodyBytes / sample.length * bodyShards.length) + ' MB raw');
    console.log('         -> the whole 4096-shard corpus: ' +
      (msB / sample.length * 4096 / 1000).toFixed(0) + ' s');
  }
})().catch((err) => {
  console.error('probe failed:', err && err.message ? err.message : err);
  process.exit(1);
});
