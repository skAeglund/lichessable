/**
 * puzzlecache.js — IndexedDB for the Puzzle Explorer dataset (section 29).
 *
 * Loaded into the SERVICE WORKER by background.js's importScripts, and that
 * placement is the whole point rather than a convenience: a content script's
 * IndexedDB belongs to `www.chessable.com`, so caching there would write
 * hundreds of megabytes into a third party's origin — where Chessable's own
 * "clear site data" drops it and where it has no business being. The worker's
 * IDB is the EXTENSION's origin, which is ours.
 *
 * FOUR STORES, answering three different questions:
 *
 *   indexShards   position key -> puzzle ids.   LRU. A working set.
 *   bodyShards    puzzle id    -> puzzle body.  LRU. A working set.
 *   bodies        one puzzle body, by id.       DURABLE, unbounded.
 *   meta          the dataset's build stamp.
 *
 * `bodies` IS THE FEATURE. The two shard stores are caches — a course scan asks
 * for ~180 index shards and a body sweep for up to 4096, and keeping them only
 * saves re-fetching. `bodies` is the artifact: ~420 bytes per puzzle, so a
 * course's entire published haul (10923 on the largest course on this account)
 * is 4.6 MB and never has to be bought again. That is what makes collection a
 * ONE-OFF, and it is why that store is not LRU-bounded and is NOT wiped by
 * `cloPzCheckBuild` — a stored body still drills perfectly after a republish,
 * and an id the new build dropped is simply never asked for again.
 *
 * SHARDS ARE STORED AS TEXT, NEVER AS PARSED JSON. An index shard is ~6900
 * position keys; structured-cloning an object that size in and out of IDB costs
 * more than the ~10 ms `JSON.parse` it saves (measured 2026-09-02: 165 ms for
 * 16 shards), and text is far smaller on disk. The parse happens in the worker,
 * once, on the way to a FILTERED answer — see background.js.
 *
 * BEST-EFFORT THROUGHOUT, exactly like the store it mirrors upstream
 * (`lib/cache.js` in skAeglund/puzzle-explorer): every operation degrades to a
 * no-op and a null on any failure path — no IDB at all, quota exceeded, an
 * aborted transaction, a schema mismatch. A cache that can break the feature it
 * accelerates is worse than no cache, and every caller treats a miss and a
 * failure as the same thing: fetch it.
 */
'use strict';

const CLO_PZDB_NAME = 'clo-puzzles';
const CLO_PZDB_VERSION = 1;
const CLO_PZ_INDEX = 'indexShards';
const CLO_PZ_BODYSHARDS = 'bodyShards';
const CLO_PZ_BODIES = 'bodies';
const CLO_PZ_META = 'meta';
const CLO_PZ_BUILT_AT = 'builtAt';

// LRU caps, in ENTRIES rather than bytes, because an entry here is a shard and
// every shard is the same size to within 10% (measured live 2026-09-02: index
// 0.94-1.08 MB parsed, bodies 335-360 KB raw).
//
// 300 index shards is ~290 MB and covers a whole course scan (182 shards on the
// largest course here) with room for a second course and a widened ply band.
// 64 body shards is ~22 MB and is deliberately SMALL: a sweep visits up to 4096
// of them and keeps what it wanted in `bodies`, so caching the shard itself
// only ever pays inside one run.
const CLO_PZ_INDEX_MAX = 300;
const CLO_PZ_BODYSHARD_MAX = 64;

let cloPzDbPromise = null;

/** The database, opened once. Null for ever if IDB is unavailable. */
function cloPzOpen() {
  if (cloPzDbPromise) return cloPzDbPromise;
  cloPzDbPromise = new Promise((resolve) => {
    let req;
    try {
      req = indexedDB.open(CLO_PZDB_NAME, CLO_PZDB_VERSION);
    } catch (err) {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      // Only ever CREATE what is missing, so a future version bump stays
      // additive and an existing archive survives it.
      if (!db.objectStoreNames.contains(CLO_PZ_INDEX)) {
        db.createObjectStore(CLO_PZ_INDEX, { keyPath: 'key' })
          .createIndex('at', 'at');
      }
      if (!db.objectStoreNames.contains(CLO_PZ_BODYSHARDS)) {
        db.createObjectStore(CLO_PZ_BODYSHARDS, { keyPath: 'key' })
          .createIndex('at', 'at');
      }
      if (!db.objectStoreNames.contains(CLO_PZ_BODIES)) {
        db.createObjectStore(CLO_PZ_BODIES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(CLO_PZ_META)) {
        db.createObjectStore(CLO_PZ_META, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return cloPzDbPromise;
}

/** One request as a promise. Resolves `null` on any error — never rejects. */
function cloPzReq(request) {
  return new Promise((resolve) => {
    try {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch (err) {
      resolve(null);
    }
  });
}

/** A transaction's completion. Resolves false on abort/error, never rejects. */
function cloPzDone(tx) {
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
    tx.onabort = () => resolve(false);
  });
}

async function cloPzTx(storeName, mode) {
  const db = await cloPzOpen();
  if (!db) return null;
  try {
    const tx = db.transaction(storeName, mode);
    return { tx, store: tx.objectStore(storeName) };
  } catch (err) {
    return null;
  }
}

/**
 * Evict down to `max`, oldest `at` first.
 *
 * `index('at').getAllKeys(null, n)` returns the n oldest PRIMARY keys in one
 * request, which is why both shard stores carry that index: the alternative is
 * reading every record back in order to sort them, and a record here is a
 * megabyte.
 */
async function cloPzEvict(storeName, max) {
  const t = await cloPzTx(storeName, 'readwrite');
  if (!t) return;
  const n = await cloPzReq(t.store.count());
  if (typeof n !== 'number' || n <= max) return;
  const old = await cloPzReq(t.store.index('at').getAllKeys(null, n - max));
  for (const key of old || []) t.store.delete(key);
  await cloPzDone(t.tx);
}

/** A cached shard's text, or null. */
async function cloPzGetShard(storeName, key) {
  const t = await cloPzTx(storeName, 'readonly');
  if (!t) return null;
  const rec = await cloPzReq(t.store.get(key));
  return (rec && typeof rec.text === 'string') ? rec.text : null;
}

/** …and back, with the LRU trim behind it. Never awaited by a caller that
 *  already has its answer: a cache write must not delay the data it caches. */
async function cloPzPutShard(storeName, key, text, max) {
  const t = await cloPzTx(storeName, 'readwrite');
  if (!t) return;
  t.store.put({ key, text, at: Date.now() });
  const ok = await cloPzDone(t.tx);
  if (ok) await cloPzEvict(storeName, max);
}

/** Touch an entry's `at` so a cache HIT counts as use — without it the LRU is
 *  a FIFO on insertion order and evicts the shard being re-read every pass. */
async function cloPzTouch(storeName, key) {
  const t = await cloPzTx(storeName, 'readwrite');
  if (!t) return;
  const rec = await cloPzReq(t.store.get(key));
  if (rec) { rec.at = Date.now(); t.store.put(rec); }
  await cloPzDone(t.tx);
}

const cloPzGetIndexShard = (key) => cloPzGetShard(CLO_PZ_INDEX, key);
const cloPzPutIndexShard = (key, text) =>
  cloPzPutShard(CLO_PZ_INDEX, key, text, CLO_PZ_INDEX_MAX);
const cloPzTouchIndexShard = (key) => cloPzTouch(CLO_PZ_INDEX, key);
const cloPzGetBodyShard = (key) => cloPzGetShard(CLO_PZ_BODYSHARDS, key);
const cloPzPutBodyShard = (key, text) =>
  cloPzPutShard(CLO_PZ_BODYSHARDS, key, text, CLO_PZ_BODYSHARD_MAX);
const cloPzTouchBodyShard = (key) => cloPzTouch(CLO_PZ_BODYSHARDS, key);

/**
 * THE ARCHIVE. `ids` -> the bodies we hold, as `{ id: body }`, skipping what we
 * do not. A miss is an ordinary answer here: it is what a body sweep is for.
 */
async function cloPzGetBodies(ids) {
  const out = {};
  if (!Array.isArray(ids) || !ids.length) return out;
  const t = await cloPzTx(CLO_PZ_BODIES, 'readonly');
  if (!t) return out;
  await Promise.all(ids.map(async (id) => {
    const rec = await cloPzReq(t.store.get(String(id)));
    if (rec && rec.b) out[rec.id] = rec.b;
  }));
  return out;
}

/** …and the write, in ONE transaction: a sweep hands over a whole shard's
 *  worth at a time and a transaction per body would dominate the cost. */
async function cloPzPutBodies(records) {
  if (!Array.isArray(records) || !records.length) return 0;
  const t = await cloPzTx(CLO_PZ_BODIES, 'readwrite');
  if (!t) return 0;
  const at = Date.now();
  let n = 0;
  for (const r of records) {
    if (!r || !r.id || !r.b) continue;
    t.store.put({ id: String(r.id), b: r.b, at });
    n++;
  }
  return (await cloPzDone(t.tx)) ? n : 0;
}

/**
 * Which of these ids the archive already holds — the cheap question, asked
 * before a sweep so a re-run buys nothing it has. `getKey` rather than `get`
 * on purpose: it answers without reading the record back.
 */
async function cloPzHaveBodies(ids) {
  const out = [];
  if (!Array.isArray(ids) || !ids.length) return out;
  const t = await cloPzTx(CLO_PZ_BODIES, 'readonly');
  if (!t) return out;
  await Promise.all(ids.map(async (id) => {
    const k = await cloPzReq(t.store.getKey(String(id)));
    if (k) out.push(String(id));
  }));
  return out;
}

async function cloPzDeleteBodies(ids) {
  if (!Array.isArray(ids) || !ids.length) return;
  const t = await cloPzTx(CLO_PZ_BODIES, 'readwrite');
  if (!t) return;
  for (const id of ids) t.store.delete(String(id));
  await cloPzDone(t.tx);
}

/** Empty one store. Used by the build-stamp check and by the panel's own
 *  "forget" controls. */
async function cloPzClear(storeName) {
  const t = await cloPzTx(storeName, 'readwrite');
  if (!t) return;
  t.store.clear();
  await cloPzDone(t.tx);
}

/**
 * Build-stamp invalidation, and the asymmetry in it is deliberate.
 *
 * A republish rewrites SHARD CONTENTS at stable urls, so every cached shard is
 * potentially stale and both caches are dropped. The `bodies` archive is NOT:
 * a puzzle body is a position and a solution, neither of which goes stale, and
 * throwing away thousands of them because the publisher re-ran a filter would
 * cost the user the whole collection on every republish. An id the new build no
 * longer emits simply stops being asked for.
 *
 * A FIRST RUN CLEARS NOTHING (`if (was)`): there is no stale data to drop and
 * the stamp is merely being recorded.
 */
async function cloPzCheckBuild(builtAt) {
  if (!builtAt) return { changed: false };
  const t = await cloPzTx(CLO_PZ_META, 'readwrite');
  if (!t) return { changed: false };
  const rec = await cloPzReq(t.store.get(CLO_PZ_BUILT_AT));
  const was = rec && rec.value;
  if (was === builtAt) return { changed: false };
  t.store.put({ key: CLO_PZ_BUILT_AT, value: builtAt });
  await cloPzDone(t.tx);
  if (was) {
    await cloPzClear(CLO_PZ_INDEX);
    await cloPzClear(CLO_PZ_BODYSHARDS);
  }
  return { changed: Boolean(was) };
}

/** What the panel reports, and what the "forget" controls empty. */
async function cloPzStats() {
  const count = async (name) => {
    const t = await cloPzTx(name, 'readonly');
    if (!t) return 0;
    const n = await cloPzReq(t.store.count());
    return typeof n === 'number' ? n : 0;
  };
  return {
    bodies: await count(CLO_PZ_BODIES),
    indexShards: await count(CLO_PZ_INDEX),
    bodyShards: await count(CLO_PZ_BODYSHARDS),
    indexMax: CLO_PZ_INDEX_MAX,
    bodyShardMax: CLO_PZ_BODYSHARD_MAX,
  };
}

/** Drop the two shard caches and KEEP the archive — "reclaim the disk the
 *  working set is using", which is the only part of this worth reclaiming. */
async function cloPzClearShards() {
  await cloPzClear(CLO_PZ_INDEX);
  await cloPzClear(CLO_PZ_BODYSHARDS);
}
