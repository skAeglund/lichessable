// Executes the REAL initPinnedMistakes (section 16b), sliced out of
// content/lichessable.js by brace matching, against a fake chrome.storage —
// TWO devices sharing one sync area, so the properties the per-key store rests
// on are checked rather than argued: migration off the pre-v0.105.0 blob, the
// write diff, deletion-by-absent-key, the global cap, retirement, and that a
// device still hears about the other one after saving itself.
//
// Run a control before trusting it: copy the source, revert the change, point
// CLO_SRC at the copy and confirm it FAILS (dev/check-continuation-lines.js
// carries the same warning, for the same reason).
const path = require('path');
const { sliceDecl, SRC_PATH } = require(path.join(__dirname, 'slice-source.js'));
const fs = require('fs');

const SRC = fs.readFileSync(SRC_PATH, 'utf8');
const num = (name) => Number(new RegExp(name + ':\\s*(\\d+)').exec(SRC)[1]);
const str = (name) => new RegExp(name + ":\\s*'([^']*)'").exec(SRC)[1];
const PIN_STEPS = eval(/pinSteps:\s*(\[[^\]]*\])/.exec(SRC)[1]);

const CONFIG = {
  retry: {
    pinKey: str('pinKey'), pinItemPrefix: str('pinItemPrefix'),
    pinMaxTotal: num('pinMaxTotal'), pinSteps: PIN_STEPS,
    pinGoneKey: str('pinGoneKey'), pinGoneDays: num('pinGoneDays'),
    pinGoneMax: num('pinGoneMax'),
  },
  autoPlay: { saveDebounceMs: 5 },
};

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const listeners = [];               // every device's onChanged listeners
const syncData = {};                // ONE backing store, shared by both devices

function makeArea(name, data) {
  return {
    _data: data,
    async get(k) {
      if (k === null || k === undefined) return clone(data);
      const keys = [].concat(k), out = {};
      for (const key of keys) if (key in data) out[key] = clone(data[key]);
      return out;
    },
    async set(obj) {
      const ch = {};
      for (const [k, v] of Object.entries(obj)) {
        ch[k] = { oldValue: clone(data[k]), newValue: clone(v) };
        data[k] = clone(v);
      }
      emit(ch, name);
    },
    async remove(k) {
      const keys = [].concat(k), ch = {};
      for (const key of keys) {
        if (!(key in data)) continue;
        ch[key] = { oldValue: clone(data[key]) };
        delete data[key];
      }
      if (Object.keys(ch).length) emit(ch, name);
    },
  };
}
function emit(changes, area) {
  const snap = listeners.slice();
  setTimeout(() => { for (const fn of snap) fn(clone(changes), area); }, 0);
}

/** One "device": its own local area, its own listeners, the shared sync area. */
function makeDevice(label, localSeed) {
  const localData = clone(localSeed || {});
  const mine = [];
  const chrome = {
    storage: {
      sync: makeArea('sync', syncData),
      local: makeArea('local', localData),
      onChanged: { addListener: (fn) => { mine.push(fn); listeners.push(fn); } },
    },
  };
  const logs = [];
  // Both module-level bridges the slice touches. pinSyncApi (section 16e) stays
  // null on purpose: this check must keep working with no transport in it.
  const src = 'return (function(){ let pinApi = null, pinSyncApi = null;\n' + sliceDecl('initPinnedMistakes') +
    '\ninitPinnedMistakes();\nreturn { api: () => pinApi };\n})();';
  const factory = new Function('CONFIG', 'log', 'warn', 'isDeadContextError',
    'readQuickEditBid', 'mistakeLogApi', 'chrome', 'window', src);
  const out = factory(CONFIG,
    (...a) => logs.push('log  ' + label + ': ' + a.join(' ')),
    (...a) => logs.push('WARN ' + label + ': ' + a.join(' ')),
    () => false, () => '', null, chrome, { addEventListener() {} });
  return { label, chrome, local: localData, logs, api: out.api };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const entry = (oid, mkey, extra) => Object.assign({
  oid: String(oid), mkey, san: 'Nf3', sourceFen: 'rnbqkbnr/8/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  color: 'w', ply: 2, lead: ['e4', 'e5'], title: 'Line ' + oid, chapter: 'Ch 1',
}, extra || {});

const pinKeys = () => Object.keys(syncData).filter((k) => k.startsWith(CONFIG.retry.pinItemPrefix)).sort();

let failed = 0;
function check(name, cond, extra) {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (cond || extra === undefined ? '' : '  → ' + extra));
  if (!cond) failed++;
}

(async () => {
  // --- 1. migration off the pre-v0.105.0 single-item store ------------------
  console.log('\n1. migration');
  const legacy = {
    [CONFIG.retry.pinKey]: {
      '453453': {
        '70382641:m9': Object.assign(entry(70382641, 'm9'),
          { isPin: true, streak: 1, lastSeenAt: 1000, pinnedAt: 1000 }), // no bid: v0.103.0
      },
    },
  };
  const a = makeDevice('A', legacy);
  await wait(50);
  check('legacy pin is now a sync item', pinKeys().length === 1, pinKeys().join(','));
  check('item key is cloPin:<bid>:<oid>:<mkey>',
    pinKeys()[0] === 'cloPin:453453:70382641:m9', pinKeys()[0]);
  check('missing bid healed from the key', syncData[pinKeys()[0]].bid === '453453');
  check('legacy blob removed', !(CONFIG.retry.pinKey in a.local));
  check('api sees it', a.api().all('453453').length === 1);

  // --- 2. a second device picks it up, and pins of its own ------------------
  console.log('\n2. two devices on one sync area');
  const b = makeDevice('B');
  await wait(50);
  check('B loaded A\'s pin', b.api().all(null).length === 1);
  b.api().pin(entry(70382642, 'm3'), '453453');
  await wait(60);
  check('B\'s pin is a second item', pinKeys().length === 2, pinKeys().join(','));
  await wait(60);
  check('A picked B\'s pin up via onChanged', a.api().all(null).length === 2,
    JSON.stringify(a.api().all(null).map((r) => r.oid)));

  // --- 3. unpin on one device propagates as an ABSENT key ------------------
  console.log('\n3. deletion');
  a.api().unpin('70382642', 'm3');
  await wait(60);
  check('item gone from sync', pinKeys().length === 1, pinKeys().join(','));
  await wait(60);
  check('B no longer holds it', b.api().all(null).length === 1,
    JSON.stringify(b.api().all(null).map((r) => r.oid)));
  check('B did not resurrect it from a legacy blob', !(CONFIG.retry.pinKey in b.local));

  // --- 4. onChanged still works after a save (the spent-timer bug) ---------
  console.log('\n4. onChanged survives a save');
  b.api().pin(entry(70382643, 'm5'), '453453');
  await wait(60);
  b.api().pin(entry(70382644, 'm7'), '453453');
  await wait(120);
  check('A sees both later pins', a.api().all(null).length === 3,
    JSON.stringify(a.api().all(null).map((r) => r.oid)));

  // --- 5. the write diff carries only what changed -------------------------
  console.log('\n5. write diff');
  const seen = [];
  const realSet = a.chrome.storage.sync.set.bind(a.chrome.storage.sync);
  a.chrome.storage.sync.set = async (obj) => { seen.push(Object.keys(obj)); return realSet(obj); };
  a.api().note('70382643', 'm5', true); // drilled inside its window → no credit
  await wait(60);
  check('one set, one item', seen.length === 1 && seen[0].length === 1,
    JSON.stringify(seen));
  a.chrome.storage.sync.set = realSet;

  // --- 6. the global cap ---------------------------------------------------
  console.log('\n6. global cap');
  const c = makeDevice('C');
  await wait(30);
  const total = CONFIG.retry.pinMaxTotal;
  const already = pinKeys().length;
  for (let i = 0; i < total + 5 - already; i++) {
    c.api().pin(entry(900000 + i, 'm1', { title: 'Bulk ' + i }), i < 3 ? '111' : '222');
  }
  await wait(200);
  check('capped at pinMaxTotal', pinKeys().length === total, String(pinKeys().length));
  // The 5 oldest by `pinnedAt` are the 3 left over from tests 2-4 (course
  // 453453) and then the first 2 of course 111 — the cap spans every course.
  check('the oldest pins went, across course lines',
    !pinKeys().some((k) => k.startsWith('cloPin:453453:')) &&
    pinKeys().filter((k) => k.startsWith('cloPin:111:')).length === 1,
    pinKeys().filter((k) => !k.startsWith('cloPin:222:')).join(','));
  check('warned about it', c.logs.some((l) => /WARN.*pin cap/.test(l)),
    c.logs.filter((l) => l.startsWith('WARN')).join(' | '));

  // --- 7. retirement removes the item --------------------------------------
  console.log('\n7. retirement');
  const target = c.api().all('222')[0];
  let outcome;
  for (let i = 0; i < PIN_STEPS.length; i++) {
    const rec = c.api().record(target.oid, target.mkey);
    rec.lastSeenAt = Date.now() - PIN_STEPS[Math.min(rec.streak, PIN_STEPS.length - 1)] - 1;
    outcome = c.api().note(target.oid, target.mkey, true);
  }
  await wait(80);
  check('retired after ' + PIN_STEPS.length + ' clean credits', outcome === 'retired', outcome);
  check('its item is gone from sync',
    !pinKeys().includes('cloPin:222:' + target.oid + ':' + target.mkey));

  // --- 8. section 16e: exportAll / merge / tombstones ----------------------
  console.log('\n8. the blob operations (16e)');
  const d = makeDevice('D');
  await wait(30);
  d.api().pin(entry(80000001, 'm1'), '777');
  d.api().pin(entry(80000002, 'm2'), '777');
  await wait(60);
  // The area still holds test 6's bulk pins, so this asserts the SHAPE and that
  // both new keys are in it, not that they are the only ones.
  const blob = d.api().exportAll();
  const keys = Object.keys(blob.pins);
  check('exportAll keys are <bid>:<oid>:<mkey>',
    keys.includes('777:80000001:m1') && keys.includes('777:80000002:m2') &&
    keys.every((k) => /^\d+:\d+:[a-z]\d+$/.test(k)),
    keys.filter((k) => !/^\d+:\d+:[a-z]\d+$/.test(k)).join(',') || keys.length + ' keys');

  const remote = { '777:80000003:m3': Object.assign(entry(80000003, 'm3'),
    { isPin: true, bid: '777', streak: 2, lastSeenAt: Date.now(), pinnedAt: Date.now() }) };
  let out = d.api().merge(remote, {});
  await wait(60);
  check('a remote pin is taken', out.added === 1 && d.api().record('80000003', 'm3') !== null,
    JSON.stringify(out));
  check('...and reaches storage', pinKeys().includes('cloPin:777:80000003:m3'));

  const newer = { '777:80000003:m3': Object.assign({}, remote['777:80000003:m3'],
    { streak: 3, lastSeenAt: Date.now() + 5000 }) };
  out = d.api().merge(newer, {});
  check('a later lastSeenAt wins', out.updated === 1 &&
    d.api().record('80000003', 'm3').streak === 3, JSON.stringify(out));
  out = d.api().merge(remote, {});
  check('an older one does not', out.updated === 0 &&
    d.api().record('80000003', 'm3').streak === 3, JSON.stringify(out));

  out = d.api().merge({}, { '777:80000001:m1': Date.now() + 10000 });
  await wait(60);
  check('a remote tombstone deletes', out.deleted === 1 &&
    d.api().record('80000001', 'm1') === null, JSON.stringify(out));
  check('...and removes the item', !pinKeys().includes('cloPin:777:80000001:m1'));

  out = d.api().merge({ '777:80000001:m1': Object.assign(entry(80000001, 'm1'),
    { isPin: true, bid: '777', lastSeenAt: 1000, pinnedAt: 1000 }) }, {});
  check('a deleted pin does not resurrect', out.added === 0 &&
    d.api().record('80000001', 'm1') === null, JSON.stringify(out));

  d.api().unpin('80000002', 'm2');
  await wait(60);
  check('unpin files a tombstone', Boolean(d.api().exportAll().gone['777:80000002:m2']),
    JSON.stringify(d.api().exportAll().gone));
  check('tombstones are stored',
    Boolean((syncData[CONFIG.retry.pinGoneKey] || {})['777:80000002:m2']));

  d.api().pin(entry(80000002, 'm2'), '777');
  await wait(60);
  check('re-pinning beats our own tombstone', d.api().record('80000002', 'm2') !== null);

  console.log('\n' + (failed ? failed + ' FAILURE(S)' : 'all checks passed'));
  process.exit(failed ? 1 : 0);
})();
