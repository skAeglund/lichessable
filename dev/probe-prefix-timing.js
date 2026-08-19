/**
 * LiChessable — Chessable's own prefix animation, timed (dev only).
 *
 * Answers the last open item of DESIGN-key-move-leadin.md §10: *how long does the
 * trainer's own
 * Key-Moves prefix take, is it animated at all, and how much of it is on screen
 * before we could cover it?* The cover is now raised off a MutationObserver
 * (§6 of that doc) rather than off the poll; this number is what says whether that
 * was enough, or whether the course-level `getList` index in §6 is worth building.
 *
 * Unlike `probe-key-moves.js` this one has to WATCH, so it leaves a handle on
 * `window.__cloProbe` and must be stopped. Page world, dev only, never shipped.
 *
 * BY HAND, with no Claude in Chrome: it works the same way in DevTools (F12,
 * Console) on the trainer tab — paste, ask for the next variation, then run
 * `copy(__cloProbe.report())` to put the timeline on the clipboard.
 *
 * Use:
 *   1. paste this in a live trainer session — it arms and returns 'armed';
 *   2. ask for the next variation (Chessable's own control, or the "n" key);
 *   3. paste `window.__cloProbe.report()` — every timestamp, relative to the
 *      plan swap.
 *   4. `window.__cloProbe.stop()` when done. It also stops itself after
 *      `maxMs`, so a forgotten probe cannot poll the page for ever.
 */
(() => {
  'use strict';

  if (window.__cloProbe) window.__cloProbe.stop();

  const FIBER_PREFIX = '__reactFiber$';
  const MAX_FIBERS = 20000;
  const POLL_MS = 60;
  const MAX_MS = 120000;

  function fiberRoot() {
    let node = document.querySelector('.board') || document.querySelector('[data-piece]');
    let key = null;
    while (node && !key) {
      key = Object.keys(node).find((k) => k.startsWith(FIBER_PREFIX));
      if (!key) node = node.parentElement;
    }
    if (!node) return null;
    let fiber = node[key];
    while (fiber && fiber.return) fiber = fiber.return;
    return fiber;
  }

  function context() {
    const root = fiberRoot();
    if (!root) return null;
    const seen = new Set();
    const stack = [root];
    let count = 0;
    while (stack.length && count < MAX_FIBERS) {
      const fiber = stack.pop();
      if (!fiber || seen.has(fiber)) continue;
      seen.add(fiber);
      count++;
      try {
        const props = fiber.memoizedProps;
        if (props) {
          if (props.context && Array.isArray(props.context.lessonPlan)) return props.context;
          if (props.current && props.current.context &&
              Array.isArray(props.current.context.lessonPlan)) return props.current.context;
        }
      } catch (err) { /* skip */ }
      if (fiber.child) stack.push(fiber.child);
      if (fiber.sibling) stack.push(fiber.sibling);
    }
    return null;
  }

  const events = [];
  let t0 = 0;           // the plan swap — every other time is relative to it
  let oid = '';
  let started = Date.now();

  const stamp = (what, extra) => {
    events.push(Object.assign({ what, ms: t0 ? Math.round(performance.now() - t0) : null }, extra || null));
    if (events.length > 400) events.splice(0, 200);
  };

  // --- the board, as it moves ----------------------------------------------
  //
  // MoveTrainer2 animates a click-move by parking a `.piece-417db` on
  // document.body for the glide (section 13's note), so watching the board
  // subtree alone can miss one — the body is watched for that node instead, and
  // the board for where the pieces land.
  const board = document.querySelector('[data-testid="boardContainer"]') ||
                document.querySelector('.chessboard-63f37') ||
                document.querySelector('.board');
  const obs = new MutationObserver((records) => {
    let moved = 0;
    for (const r of records) {
      if (r.type === 'attributes' && r.attributeName === 'style') moved++;
      moved += r.addedNodes.length + r.removedNodes.length;
    }
    if (moved) stamp('board', { mutations: moved });
  });
  if (board) obs.observe(board, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class', 'data-piece'] });

  const poll = setInterval(() => {
    if (Date.now() - started > MAX_MS) { window.__cloProbe.stop(); return; }
    const ctx = context();
    if (!ctx) return;
    const plan = ctx.lessonPlan || [];
    const id = plan[0] && plan[0].variationId != null ? String(plan[0].variationId) : '';
    if (id && id !== oid) {
      oid = id;
      t0 = performance.now();
      events.length = 0;
      stamp('plan swapped', {
        oid,
        plies: plan.length,
        userPlies: plan.filter((m) => m && m.isUserMove).length,
        keyUserPlies: plan.filter((m) => m && m.isUserMove && m.isKey).length,
        firstUserPly: plan.findIndex((m) => m && m.isUserMove),
        firstKeyUserPly: plan.findIndex((m) => m && m.isUserMove && m.isKey),
      });
      return;
    }
    // WHERE THE TRAINER SAYS IT IS. The interesting stamp: the first time this
    // names a USER ply is the moment the prefix is over and the first card is
    // being asked — i.e. `k`, and the deadline the cover has to beat.
    const fen = typeof ctx.fen === 'string' ? ctx.fen : '';
    const at = fen ? plan.findIndex((m) => m && m.sourceFen === fen) : -1;
    const last = events[events.length - 1];
    if (at >= 0 && (!last || last.what !== 'ctx.fen' || last.ply !== at)) {
      stamp('ctx.fen', { ply: at, user: !!(plan[at] && plan[at].isUserMove), san: plan[at] && plan[at].san });
    }
  }, POLL_MS);

  window.__cloProbe = {
    stop() {
      clearInterval(poll);
      obs.disconnect();
      delete window.__cloProbe;
      return 'stopped';
    },
    report() {
      // Board mutations are collapsed into RUNS — one animated move is dozens of
      // style writes, and the gaps between the runs are what "is it animated"
      // actually means.
      const out = [];
      for (const e of events) {
        const last = out[out.length - 1];
        if (e.what === 'board' && last && last.what === 'board' && e.ms - last.until <= 80) {
          last.until = e.ms;
          last.mutations += e.mutations;
          continue;
        }
        out.push(Object.assign({ until: e.ms }, e));
      }
      return { oid, pollMs: POLL_MS, events: out };
    },
  };
  return 'armed — now ask for the next variation, then call window.__cloProbe.report()';
})();
