/**
 * LiChessable — Key Moves probe (dev only; NOT referenced by the manifest).
 *
 * Re-checks §2 of DESIGN-key-move-leadin.md — the GATE, which is the whole of
 * that feature and is a fact about Chessable's own lesson plan rather than about
 * our code. If the lead-in ever fires in an All Moves session, or stops firing in
 * a Key Moves one, this is what says which half of the plan changed. One paste.
 * Run it in a LIVE trainer session (/practice/… or /learn/…) through Claude in
 * Chrome's `javascript_tool`, which evaluates in the page's own world — the
 * only world React fibers are visible from (content/pagestate.js exists for
 * exactly that reason).
 *
 * It RETURNS its report as an object (the tool serialises it) and also logs it,
 * so either channel is enough. It reads and only reads: no page state written
 * and no page function called.
 *
 * BY HAND, with no Claude in Chrome: open DevTools on the trainer tab (F12,
 * Console), paste the whole file, press Enter — then `copy(__cloKeyMoves)` puts
 * the report on the clipboard as JSON. That is the one thing it leaves behind on
 * `window`, and it is there for exactly this: the console truncates a long
 * object and a report that cannot be copied out is a probe that has to be run
 * twice.
 *
 * WHAT TO RUN IT ON, in this order:
 *   1. a KEY MOVES session (course 453453 — key moves were designated on it
 *      during the original auto-play work), one read per variation;
 *   2. an ALL MOVES session on the same course, or any other course. §10.2 is
 *      answered by DIFFING the two reports: whatever differs is a gate
 *      candidate, whatever does not (expected: `isKey` on the plies) is not.
 *
 * The one thing it cannot answer is §10.4 (the timing of Chessable's own prefix
 * animation) — that needs the observer at the bottom, armed BEFORE the next
 * variation is asked for.
 */
(() => {
  'use strict';

  const FIBER_PREFIX = '__reactFiber$';
  const MAX_FIBERS = 20000;

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

  function findContext(root) {
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
      } catch (err) { /* exotic proxies — skip */ }
      if (fiber.child) stack.push(fiber.child);
      if (fiber.sibling) stack.push(fiber.sibling);
    }
    return null;
  }

  const root = fiberRoot();
  const ctx = root ? findContext(root) : null;
  if (!ctx) {
    // No fibers from here: either the tool is evaluating in an isolated world,
    // or the trainer is not up. Say which, rather than reporting "no session".
    return { error: root ? 'no lesson context (is a variation loaded?)'
                         : 'no fiber root — probably not the page world',
             path: location.pathname };
  }

  const plan = ctx.lessonPlan || [];

  // --- §10.1: what in the CONTEXT could name the study mode -----------------
  //
  // NAMES, and scalars only. The context holds far more of the user's progress
  // data than this question needs, and a probe that dumps it is a probe that
  // cannot be pasted anywhere. `simpleSettingsApiData` is the one blob whose
  // KEYS are the answer (it is where `eq_<bid>_<colour>_alternative` lives), so
  // its keys come out whole and its values only where they are short.
  const scalar = (v) => v === null || ['string', 'number', 'boolean'].includes(typeof v);
  const ctxScalars = {};
  for (const k of Object.keys(ctx)) {
    try {
      const v = ctx[k];
      if (scalar(v) && String(v).length <= 60) ctxScalars[k] = v;
    } catch (err) { /* getters that throw */ }
  }
  const settings = {};
  try {
    const s = ctx.simpleSettingsApiData || {};
    for (const k of Object.keys(s).slice(0, 400)) {
      const v = s[k];
      settings[k] = scalar(v) ? v : ('<' + typeof v + '>');
    }
  } catch (err) { settings.__error = String(err).slice(0, 80); }

  // --- §10.2 and §10.3: the plies, and the two indices ----------------------
  const plies = plan.map((m, i) => ({
    i,
    san: m && m.san,
    color: m && m.color,
    user: !!(m && m.isUserMove),
    key: !!(m && m.isKey),
    mid: m && m.mid,
    // The number of attempts recorded so far — a ply the trainer plays ITSELF
    // should stay at zero all session, which is the direct evidence for §10.3's
    // premise (it is never quizzed, so it is never proven).
    quizTotal: (m && m.progress && m.progress.quizTotal) || 0,
    src: m && typeof m.sourceFen === 'string' ? m.sourceFen.split(' ').slice(0, 2).join(' ') : null,
  }));
  const firstUser = plies.findIndex((p) => p.user);
  const firstKeyUser = plies.findIndex((p) => p.user && p.key);
  const fen = typeof ctx.fen === 'string' ? ctx.fen : null;
  // WHERE THE TRAINER IS STANDING RIGHT NOW. On the first card of a freshly
  // loaded variation this IS `k` — and `k > firstUser` is the whole observation
  // the gate could be built on, with no settings key at all.
  const at = fen ? plan.findIndex((m) => m && m.sourceFen === fen) : -1;

  const report = {
    path: location.pathname,
    oid: plan[0] && String(plan[0].variationId != null ? plan[0].variationId : ''),
    bid: plan[0] && String(plan[0].bid != null ? plan[0].bid : ''),
    studyMode: ctx.lessonStudyMode,
    studyColor: ctx.studyColor,
    plyCount: plies.length,
    userPlies: plies.filter((p) => p.user).length,
    keyUserPlies: plies.filter((p) => p.user && p.key).length,
    firstUserPly: firstUser,
    firstKeyUserPly: firstKeyUser,
    trainerAtPly: at,                       // = k on the first card of a variation
    prefixUserPliesSkipped: at > 0 ? plies.slice(0, at).filter((p) => p.user).length : 0,
    ctxScalars,
    settings,
    plies: plies.slice(0, 40),
  };
  console.log('[CLO probe]', report);
  try { window.__cloKeyMoves = report; } catch (err) { /* sealed window — the log stands */ }
  return report;
})();
