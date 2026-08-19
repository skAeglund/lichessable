// Executes the REAL `computePrefix` and `cardIsProven` (section 23's auto-play),
// sliced out of content/lichessable.js by brace matching, against hand-built
// lesson plans — an ALL MOVES one and a KEY MOVES one, in the shape Chessable
// actually serves each.
//
// WHAT IT PINS, and it is not what the first version of this file claimed.
// v0.112.0 started the walk at `sg.firstCard` instead of ply 0 on the theory
// that under Key Moves the pre-key user plies were in the walk, unproven, and
// stopped it dead. They are not: Chessable itself clears `isUserMove` on every
// ply before the first key move, INCLUDING plies of the user's own colour
// (DESIGN-key-move-leadin.md §2, live 2026-08-19), and
// `content/pagestate.js` takes that flag straight off the plan. So the walk
// never sees them, and `start = 0` and `start = firstCard` produce the identical
// walk. The change is a no-op; the file's original key-moves arm asserted a bug
// that has never existed, and its control run failed on that half because of the
// FIXTURE, not because of the world.
//
// So what is pinned here is the property that actually holds and that a future
// change could still break:
//
//   THE FIRST PLY THE WALK CONSIDERS IS THE FIRST CARD, IN BOTH STUDY MODES —
//   before the first anchor as well as after it, so a plan read landing ahead of
//   `anchor()` cannot answer "nothing is proven" about a variation whose every
//   card is.
//
// …plus the one piece of v0.112.0 that IS load-bearing: `cardIsProven`'s
// `sg.cardIdx < sg.firstCard` guard, which refuses auto-play to a trainer
// standing on a card before its own first one (a repetition walking backwards).
// That direction — refuse, never grant — is the one this must never get wrong.
//
// Run a control before trusting it: copy the source, revert the change, point
// CLO_SRC at the copy and confirm it FAILS on the guard cases (the walk cases
// pass either way, which is the whole finding). dev/check-continuation-lines.js
// and dev/check-pin-store.js carry the same warning, for the same reason.
const path = require('path');
const { sliceDecl, SRC_PATH } = require(path.join(__dirname, 'slice-source.js'));

const SRC = sliceDecl('computePrefix') + '\n' + sliceDecl('cardIsProven');

/**
 * One sandbox per case: the real source, with everything it reaches out of
 * section 23 for handed in. `plyIsProven` is stubbed on purpose — what is under
 * test is WHICH plies the walk asks about, not how a proof is looked up.
 */
function build(sg, proven) {
  const logged = [];
  const plyIsProven = (ply) => proven.has(ply.san);
  const log = (...args) => { logged.push(args.join(' ')); };
  const api = new Function('sg', 'plyIsProven', 'log',
    SRC + '\nreturn { computePrefix, cardIsProven };')(sg, plyIsProven, log);
  return { api, logged };
}

/**
 * A plan as a string of `o` (the opponent's ply) and `u` (the user's own).
 *
 * `keyFrom` is what makes it a KEY MOVES plan, and it does the ONE thing the old
 * fixture got wrong: everything before the first key move is stripped of
 * `isUserMove`, whatever colour it is, because that is what Chessable serves
 * (§2). So a spec of 'ouououou' with keyFrom 5 describes a variation the user
 * plays four moves of and is asked for TWO — plies 5 and 7.
 */
function plan(spec, keyFrom) {
  return spec.split('').map((ch, i) => ({
    san: 'm' + i,
    // The plan's own colours, kept whether or not the ply is a card: the
    // lead-in's gate (23c) is exactly "a ply of this colour before the first
    // card", so a fixture that dropped them could not describe the difference.
    color: ch === 'u' ? 'b' : 'w',
    isUserMove: ch === 'u' && (keyFrom == null || i >= keyFrom),
    isKey: keyFrom != null && i >= keyFrom,
    sourceFen: 'fen' + i,
  }));
}

const fresh = (plies) => ({
  plies,
  prefixEnd: 0,
  prefixAt: -1,
  prefixLogged: false,
  firstCard: -1,
  cardIdx: -1,
  autoPlay: true,
});

let passed = 0;
const failures = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { passed++; console.log('  pass  ' + name); return; }
  failures.push(name + ': got ' + JSON.stringify(got) + ', wanted ' + JSON.stringify(want));
  console.log('  FAIL  ' + name + ' — got ' + JSON.stringify(got) +
    ', wanted ' + JSON.stringify(want));
}

// --------------------------------------------------------------------------
// ALL MOVES — the trainer asks every user ply, so the first card IS the first
// user ply and nothing about this mode may change.
// --------------------------------------------------------------------------
console.log('all moves');
{
  // o u o u o u   — the user is Black; cards at 1, 3, 5.
  const plies = plan('ououou');
  const sg = fresh(plies);
  const { api, logged } = build(sg, new Set(['m1', 'm3', 'm5']));
  sg.firstCard = 1;                       // what the first anchor() sets
  sg.cardIdx = 1;
  api.computePrefix();
  check('every card proven ⇒ the prefix runs to the end', sg.prefixEnd, plies.length);
  check('…and the first card is auto-playable', api.cardIsProven(), true);
  check('…and the count is the CARDS, not the plies', logged.join('|'),
    'show-and-grade: 3 of 3 card(s) proven this session');
}
{
  const plies = plan('oouoou');   // o o u o o u
  const sg = fresh(plies);
  const { api } = build(sg, new Set(['m2']));    // the second card is NOT proven
  sg.firstCard = 2;
  sg.cardIdx = 2;
  check('a proven first card is taken', api.cardIsProven(), true);
  sg.cardIdx = 5;
  check('…and the walk stops at the unproven one', api.cardIsProven(), false);
  check('prefixEnd is that ply', sg.prefixEnd, 5);
}

// --------------------------------------------------------------------------
// KEY MOVES — the trainer plays plies 0-4 itself and asks from ply 5 on. In the
// shape Chessable serves: the user's own moves at 1 and 3 carry isUserMove
// FALSE, so the walk never considers them and the first ply it looks at is the
// first card — which is the property under test.
// --------------------------------------------------------------------------
console.log('key moves (the trainer played the prefix itself)');
{
  // o u o u o u o u with key moves from 5 ⇒ cards at 5 and 7 only.
  const plies = plan('ouououou', 5);
  const sg = fresh(plies);
  check('the pre-key user plies are NOT cards',
    plies.map((p) => (p.isUserMove ? 'u' : '.')).join(''), '.....u.u');

  // Only the cards the user was ever ASKED can be in the record.
  const { api, logged } = build(sg, new Set(['m5', 'm7']));

  // THE HEADLINE. The first plan read of a variation happens BEFORE the first
  // anchor, so the walk runs with `firstCard` still -1 and starts at ply 0 —
  // and it must reach the same answer anyway, because there is nothing before
  // the first card for it to trip over.
  api.computePrefix();
  check('before the anchor, the walk still reaches the end of the line',
    sg.prefixEnd, plies.length);
  check('…and counts the CARDS, not the plies the trainer played',
    logged[logged.length - 1],
    'show-and-grade: 2 of 2 card(s) proven this session');

  // …and then anchor() lands on the first card the trainer actually asked.
  sg.firstCard = 5;
  sg.cardIdx = 5;
  check('the first key move is auto-playable', api.cardIsProven(), true);
  check('…the answer did not move', sg.prefixEnd, plies.length);
  sg.cardIdx = 7;
  check('the second key move too', api.cardIsProven(), true);
}
{
  const plies = plan('ouououou', 5);
  const sg = fresh(plies);
  const { api } = build(sg, new Set(['m7']));   // the FIRST card is not proven
  sg.firstCard = 5;
  sg.cardIdx = 5;
  check('an unproven first card still stops the walk', api.cardIsProven(), false);
  check('prefixEnd is that card', sg.prefixEnd, 5);
  // …and the ply after it must not be reached round the outside: cardIsProven
  // is asked per card, and 7 is past the stop.
  sg.cardIdx = 7;
  sg.prefixAt = -1;
  check('a later proven card is NOT taken over an unproven one',
    api.cardIsProven(), false);
}
{
  // THE ONE PIECE OF v0.112.0 THAT DOES SOMETHING: a trainer standing on a card
  // BEFORE its own first one. Not known to happen — it takes a repetition
  // walking backwards past the variation's first card — and the point is that
  // it costs auto-play rather than granting it.
  //
  // This is also the case a control run must fail on: without the guard the
  // answer is `true`, i.e. a card outside the walk's own answer read as proven.
  const plies = plan('ouououou', 5);
  const sg = fresh(plies);
  const { api } = build(sg, new Set(['m1', 'm3', 'm5', 'm7']));
  sg.firstCard = 5;
  sg.cardIdx = 3;
  check('a card before the first one is never auto-played', api.cardIsProven(), false);
}
{
  // The same guard in an ALL MOVES plan, where `firstCard` is 1 rather than 5 —
  // so it is not a key-moves special case and does not become dead code if the
  // key-moves arm above is ever changed.
  const plies = plan('ououou');
  const sg = fresh(plies);
  const { api } = build(sg, new Set(['m1', 'm3', 'm5']));
  sg.firstCard = 3;      // the trainer's first card was the SECOND user ply
  sg.cardIdx = 1;
  check('…and in an All Moves plan too', api.cardIsProven(), false);
}

console.log('');
console.log('source: ' + SRC_PATH);
if (failures.length) {
  console.log(passed + ' passed, ' + failures.length + ' FAILED');
  process.exit(1);
}
console.log(passed + ' passed, 0 failed');
