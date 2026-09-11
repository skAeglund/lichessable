// Section 23d — the media-key ring: the rules a live session cannot show you.
//
// It EXECUTES the shipped functions, sliced out of content/lichessable.js, so
// it cannot drift from what runs. Point CLO_SRC at a copy to run a control.
//
// WHY THIS FILE EXISTS. Every failure mode this covers is SILENT, and three of
// them look exactly like "the ring is faulty":
//
//  * A MEDIA SPELLING WITH NO `KEY_LABEL` ENTRY prints itself, so the panel
//    reads "2 / MediaTrackNext — show me the move" — a legend that is now
//    longer than the line it is in and says nothing a ring user can act on.
//  * A DUPLICATE LABEL is three names for one button printed three times
//    ("3 / Space / ⏯ / ⏯ / ⏯"), which is the same line again.
//  * `mediaPress` PICKING THE WRONG SPELLING fires a key that the very binding
//    it came from does not contain, so the press is swallowed by `onKeyInner`
//    as "not one of ours" and the ring is dead with nothing in the console.
//  * THE PLAY/PAUSE COLLAPSE is wrong in both directions at once: too short and
//    one toggle tap grades two cards, too long and a real double tap is eaten.
//    The ring's own floor is ~200ms (DESIGN-show-and-grade.md §8), which is what
//    bounds it from above.
//  * A KEY IN TWO BINDINGS means one press does two things, and which one wins
//    is the order of the tests in `onKeyInner` — i.e. invisible from here.
//
// CONTROLS RUN (each against a copy of content/lichessable.js with the one
// change made; every one of them FAILED this file, which is the point):
//   1. `KEY_LABEL`'s MediaPlayPause entry dropped  -> labels: alts unlabelled
//   2. `keyName`'s dedupe reverted to `.map().join()`
//                                                  -> labels: "2 / <next> / <next>"
//   3. `mediaPress`'s find() changed to `list[0]`  -> press: next fires "2"
//   4. `media.repeatMs` raised to 250              -> collapse: above the floor
//   5. `media.repeatMs` set to 0                   -> collapse: above the floor
//                                                     (it is also not a collapse)
//   6. `mediaPress`'s guard dropped to `now - md.lastAt` (the kind ignored)
//                                                  -> collapse: two actions collapsed
//   7. ' ' added to C.keys.next                    -> bindings: next/alts overlap
//   8. `MediaTrackNext` dropped from C.keys.next   -> bindings: next does not bind it
//   9. `syncMediaKeys()` moved below tick's gate   -> claim: not above the gate
//  10. `mediaWanted` drops the continuationActive term
//                                                  -> claim: term missing
//  11. `pagehide` stops releasing                  -> claim: never released
//  12. `mediaWanted` drops `!document.hidden`      -> claim: term missing
//  13. the visibilitychange listener removed       -> claim: does not follow the tab
//  14. `mediaPress`'s `md.logged` latch dropped     -> press: named 7 times
//  15. the two track spellings put back the tidy way round
//                                                  -> bindings: next binds …Previous
//  16. only the HANDLERS uncrossed (bindings left)  -> bindings: nexttrack handled
//
// Run: node dev/check-media-keys.js

const { sliceDecl, SRC_PATH } = require('./slice-source');
const fs = require('fs');

const SRC = fs.readFileSync(SRC_PATH, 'utf8');

let failed = 0;
function ok(group, what, cond, detail) {
  if (cond) { console.log('  ok   ' + group + ': ' + what); return; }
  failed++;
  console.log('  FAIL ' + group + ': ' + what + (detail ? '  [' + detail + ']' : ''));
}

// --- the shipped config -----------------------------------------------------
//
// Read out of the source rather than retyped: a check that carries its own copy
// of the bindings is a check that agrees with itself and with nothing else.
function configBlock(name) {
  const at = SRC.indexOf('      ' + name + ': {');
  if (at < 0) throw new Error('not found in CONFIG.showGrade: ' + name);
  let depth = 0, i = SRC.indexOf('{', at);
  for (let c = i; c < SRC.length; c++) {
    if (SRC[c] === '{') depth++;
    else if (SRC[c] === '}') { depth--; if (!depth) return SRC.slice(i, c + 1); }
  }
  throw new Error('unterminated: ' + name);
}

// eslint-disable-next-line no-new-func
const KEYS = new Function('return (' + configBlock('keys') + ');')();
// eslint-disable-next-line no-new-func
const MEDIA = new Function('return (' + configBlock('media') + ');')();

// --- the shipped functions --------------------------------------------------
const scope = {
  C: { keys: KEYS, media: MEDIA },
  sg: { media: { lastAt: 0, lastKind: '', on: true, dead: false }, enabled: true },
  fired: [],
  navigator: { mediaSession: {} },
};
scope.document = {
  dispatchEvent(e) { if (e.type === 'keydown') scope.fired.push(e.key); },
};
// The real `ringKey` builds a KeyboardEvent; node has none, and the thing being
// asserted is WHICH NAME it is given, so a recording stand-in is the honest
// stub. `mediaPress` — the function whose pick is under test — is the real one.
scope.KeyboardEvent = function (type, base) { return { type, key: base.key }; };

// `log` is real code's, and the one-shot transport line in `mediaPress` calls
// it — collected rather than printed, so the "once per session" latch is
// something this file can assert rather than merely not crash on.
const logged = [];
const built = new Function(
  'C', 'sg', 'document', 'navigator', 'KeyboardEvent', 'fired', 'log',
  sliceDecl('KEY_LABEL') + '\n' +
  sliceDecl('keyName') + '\n' +
  sliceDecl('ringKey') + '\n' +
  sliceDecl('mediaPress') + '\n' +
  'return { KEY_LABEL, keyName, mediaPress };'
)(scope.C, scope.sg, scope.document, scope.navigator, scope.KeyboardEvent, scope.fired,
  (m) => logged.push(m));

console.log('source: ' + SRC_PATH);

// --- 1. every binding is labelled, and each button is named once -------------
console.log('\nlabels');
const MEDIA_RE = /^Media/;
for (const kind of ['next', 'wrong', 'alts']) {
  const list = KEYS[kind] || [];
  const unlabelled = list.filter((k) => MEDIA_RE.test(k) && !built.KEY_LABEL[k]);
  ok('labels', kind + ' has a readable name for every media spelling',
    unlabelled.length === 0, unlabelled.join(', '));
  const printed = built.keyName(list).split(' / ');
  ok('labels', kind + ' prints each button once',
    printed.length === new Set(printed).size, built.keyName(list));
  // …and the media spellings really do collapse to ONE printed name, which is
  // the whole reason the dedupe was added.
  const names = new Set(list.filter((k) => MEDIA_RE.test(k)).map((k) => built.KEY_LABEL[k]));
  ok('labels', kind + "'s media spellings are one button", names.size <= 1,
    [...names].join(', '));
}

// --- 2. no key means two things ---------------------------------------------
console.log('\nbindings');
const seen = new Map();
let clash = '';
for (const kind of ['next', 'wrong', 'alts', 'repeat']) {
  for (const k of KEYS[kind] || []) {
    if (seen.has(k)) clash += k + ' (' + seen.get(k) + '/' + kind + ') ';
    seen.set(k, kind);
  }
}
ok('bindings', 'every key belongs to exactly one action', !clash, clash.trim());
// CROSSED ON PURPOSE — see the note on `CONFIG.showGrade.keys`. Written out
// here as the pairs rather than derived, so that "correcting" the source to read
// tidily fails this file instead of silently moving the commonest press of the
// mode onto the other button.
for (const [kind, want] of [['next', 'MediaTrackPrevious'],
  ['wrong', 'MediaTrackNext'], ['alts', 'MediaPlayPause']]) {
  ok('bindings', kind + ' binds ' + want, (KEYS[kind] || []).includes(want));
}
// …and the handler that receives that physical button agrees with the binding.
// Source text: `claimMediaKeys` closes over the media session, which node has
// no stand-in for, and a crossing that holds in one half and not the other is
// a ring whose two buttons do the same thing.
for (const [action, kind] of [['nexttrack', 'wrong'], ['previoustrack', 'next']]) {
  ok('bindings', action + " is handled as '" + kind + "'",
    SRC.includes("setActionHandler('" + action + "', () => mediaPress('" + kind + "'))"));
}

// --- 3. a press fires a key that its own binding contains --------------------
console.log('\npress');
function press(kind, at) {
  scope.fired.length = 0;
  const real = Date.now;
  Date.now = () => at;
  try { built.mediaPress(kind); } finally { Date.now = real; }
  return scope.fired.slice();
}
let t = 1000;
for (const kind of ['next', 'wrong', 'alts']) {
  t += 10000;
  const out = press(kind, t);
  ok('press', kind + ' fires exactly one key', out.length === 1, JSON.stringify(out));
  ok('press', kind + ' fires a key its own binding holds',
    out.length === 1 && (KEYS[kind] || []).includes(out[0]), JSON.stringify(out));
  ok('press', kind + ' fires a MEDIA spelling, not the digit',
    out.length === 1 && MEDIA_RE.test(out[0]), JSON.stringify(out));
}

// --- 4. one physical press is one action ------------------------------------
console.log('\ncollapse');
ok('collapse', 'repeatMs is under the ring’s own ~200ms floor',
  MEDIA.repeatMs > 0 && MEDIA.repeatMs < 200, String(MEDIA.repeatMs));

// A toggle tap answered by the platform with `pause` AND `play`: both arrive as
// `alts`, microseconds apart, and must be ONE press.
t += 10000;
const first = press('alts', t);
const second = press('alts', t + 1);
ok('collapse', 'a play/pause pair for one tap is one press',
  first.length === 1 && second.length === 0,
  JSON.stringify(first) + ' then ' + JSON.stringify(second));

// …and a REAL second tap, at the hardware's own floor, is not eaten.
const third = press('alts', t + 200);
ok('collapse', 'a genuine second tap 200ms later still fires', third.length === 1,
  JSON.stringify(third));

// Two DIFFERENT buttons in the same instant are two presses — a ring cannot do
// it, but collapsing on time alone would make "wrong" straight after "next"
// vanish, which is the press that matters most.
t += 10000;
const a = press('next', t);
const b = press('wrong', t);
ok('collapse', 'two different actions never collapse into one',
  a.length === 1 && b.length === 1, JSON.stringify(a) + ' then ' + JSON.stringify(b));

// The transport line answers the one question the hardware has to, so it must
// actually be said — and said ONCE, or a ring session is a console full of it.
ok('press', 'the transport is named in the log once',
  logged.filter((m) => /MEDIA SESSION/.test(m)).length === 1,
  JSON.stringify(logged));

// --- 5. the claim is held exactly where the keys are bound -------------------
//
// Source-text, not execution: `mediaWanted` closes over `inSession` and
// `continuationActive`, and what is being asserted is that all three terms are
// in it — an omitted one is a claim held on the wrong pages, which reads as
// "the ring works sometimes".
console.log('\nclaim');
const wanted = sliceDecl('mediaWanted');
for (const term of ['sg.media.on', 'sg.enabled', '!sg.media.dead',
  '!document.hidden', 'inSession()', 'continuationActive()']) {
  ok('claim', 'mediaWanted tests ' + term, wanted.includes(term));
}
ok('claim', 'tick asks syncMediaKeys above its own gate',
  /function tick\(\)\s*\{[\s\S]{0,600}?syncMediaKeys\(\);[\s\S]{0,80}?if \(!sg\.enabled/.test(SRC));
ok('claim', 'the page going away releases it',
  /pagehide[\s\S]{0,600}?releaseMediaKeys\(/.test(SRC));
// A background overstudy tab is on a trainer path and would otherwise take the
// ring off the tab being played — see `mediaWanted`'s own note.
ok('claim', 'the claim follows the tab',
  /visibilitychange[\s\S]{0,200}?syncMediaKeys\(\)/.test(SRC));

console.log('\n' + (failed ? failed + ' FAILED' : 'all ok'));
process.exit(failed ? 1 : 0);
