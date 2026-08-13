// Executes the REAL visualViewportBox + placeFixedPopup, sliced out of
// content/lichessable.js by brace matching, against the viewport shapes a
// phone actually presents: a "Desktop site" layout viewport thousands of CSS
// pixels tall, an on-screen keyboard that shrinks the VISIBLE area and leaves
// window.innerHeight untouched, and a pinch-zoom that offsets it.
//
// It exists because those are exactly the states no desktop browser and no
// harness page can be put into, and getting them wrong is invisible on a
// desktop: every case here passes with the old innerHeight arithmetic on a
// full-size window and parks the popup off screen on a phone.
//
// Run a control before trusting it: copy the source, revert the change, point
// CLO_SRC at the copy and confirm it FAILS (dev/check-pin-store.js and
// dev/check-continuation-lines.js carry the same warning, for the same reason).
const path = require('path');
const { sliceDecl, SRC_PATH } = require(path.join(__dirname, 'slice-source.js'));

const src = [sliceDecl('visualViewportBox'), sliceDecl('placeFixedPopup')].join('\n');
const load = new Function('window', src + '\nreturn { visualViewportBox, placeFixedPopup };');

let failures = 0;

/** A popup element as far as placeFixedPopup is concerned: a style bag and a
 *  measured size. Real elements shrink when max-width caps them; so does this. */
function popupEl(w, h) {
  const style = {};
  return {
    style,
    get offsetWidth() {
      const cap = parseFloat(style.maxWidth);
      return cap ? Math.min(w, cap) : w;
    },
    get offsetHeight() {
      const cap = parseFloat(style.maxHeight);
      return cap ? Math.min(h, cap) : h;
    },
  };
}

function check(name, win, rect, size, opts) {
  const api = load(win);
  const el = popupEl(size[0], size[1]);
  api.placeFixedPopup(el, rect, opts);
  const box = api.visualViewportBox();
  const left = parseFloat(el.style.left), top = parseFloat(el.style.top);
  const w = el.offsetWidth, h = el.offsetHeight;
  const bad = [];
  // A NaN loses every comparison below, so it would read as six passes: the
  // control run that first exercised this file did exactly that.
  if (!Number.isFinite(left) || !Number.isFinite(top)) bad.push('not a number');
  if (left < box.left) bad.push('left of the visible area');
  if (top < box.top) bad.push('above the visible area');
  if (left + w > box.left + box.width + 0.01) bad.push('past the right edge');
  if (top + h > box.top + box.height + 0.01) bad.push('below the fold');
  console.log((bad.length ? 'FAIL  ' : 'ok    ') + name.padEnd(32) +
    ' left ' + left + ' top ' + top + ' ' + w + 'x' + h +
    (bad.length ? '  <-- ' + bad.join(', ') : ''));
  if (bad.length) failures++;
}

// A desktop window with no visualViewport at all: the pre-fix behaviour, and
// the one that must not change — popup under the move, where it was.
check('desktop, no visualViewport',
  { innerWidth: 1600, innerHeight: 900 },
  { left: 700, top: 280, bottom: 300 }, [280, 220]);

// Chrome's "Desktop site" on a phone: ~980x2100 laid out, 980x760 of it seen,
// scrolled 1200px down. The move is visible; innerHeight-based clamping would
// have allowed a top of ~1300 past the bottom of it.
check('phone, desktop-site, scrolled',
  { innerWidth: 980, innerHeight: 2100,
    visualViewport: { offsetLeft: 0, offsetTop: 1200, width: 980, height: 760 } },
  { left: 300, top: 1480, bottom: 1500 }, [280, 300]);

// A move low in that visible band, with the layout viewport carrying on far
// below it: the popup does not fit under the move, and the layout viewport has
// room it can never use. This is the half of the report that is NOT about the
// keyboard — the panel opening "too far down to see the whole of".
check('move low in the visible band',
  { innerWidth: 980, innerHeight: 2100,
    visualViewport: { offsetLeft: 0, offsetTop: 1200, width: 980, height: 760 } },
  { left: 300, top: 1912, bottom: 1930 }, [280, 300], { minHeight: 160 });

// …and the reported bug: the popup's own autofocus raises the keyboard, the
// visible band drops to 300px, and window.innerHeight does not move at all.
check('phone, keyboard up',
  { innerWidth: 980, innerHeight: 2100,
    visualViewport: { offsetLeft: 0, offsetTop: 1200, width: 980, height: 300 } },
  { left: 300, top: 1480, bottom: 1500 }, [280, 520], { minHeight: 160 });

// Pinch-zoomed 2x into the right half of the page.
check('phone, pinch-zoomed 2x',
  { innerWidth: 980, innerHeight: 2100,
    visualViewport: { offsetLeft: 490, offsetTop: 900, width: 490, height: 380 } },
  { left: 900, top: 1230, bottom: 1250 }, [400, 300], { minHeight: 160 });

// A move in the bottom-right corner of a narrow phone: the popup has to go
// ABOVE it and left of it, which is the case the two clamps have to agree on.
check('move at the visible corner',
  { innerWidth: 412, innerHeight: 620,
    visualViewport: { offsetLeft: 0, offsetTop: 0, width: 412, height: 620 } },
  { left: 390, top: 596, bottom: 610 }, [400, 460], { minHeight: 160 });

// The arrows tab (400px wide under html.clo-touch) on a viewport narrower than
// it: only max-width can save this one, not the left clamp.
check('arrows tab, narrow screen',
  { innerWidth: 360, innerHeight: 640,
    visualViewport: { offsetLeft: 0, offsetTop: 0, width: 360, height: 640 } },
  { left: 20, top: 100, bottom: 118 }, [400, 500], { minHeight: 160 });

console.log(failures ? failures + ' FAILED' : 'all placements inside the visible viewport');
process.exit(failures ? 1 : 0);
