/**
 * LiChessable — trainer page-state reader (MAIN world, /practice/… only).
 *
 * TWO consumers, ONE read (see readLine below):
 *   * auto-play (content section 13) needs the variation's mainline;
 *   * the mistake log (section 16) needs each user ply's live `progress`,
 *     which is where MoveTrainer2 records the moves failed THIS session.
 *
 * Auto-play (content section 13) must know the current variation's real
 * mainline before it may replay a remembered move. MoveTrainer2 already holds
 * exactly that, and more precisely than any rendered page does: its state
 * machine's context carries a `lessonPlan` array with, per ply, `san`,
 * `from`, `to`, and the FULL `sourceFen`/`targetFen` (castling rights and en
 * passant included). It is loaded before the trainer animates the variation's
 * first move — verified live: on "Next variation" the plan swapped to the new
 * oid with all plies present ~90 ms BEFORE the first move appeared, with no
 * network request of its own.
 *
 * That context lives on React fibers, which are page-world expando properties
 * on DOM nodes and therefore invisible to an isolated content script — hence
 * this file, the extension's only MAIN-world script. It reads, and only reads:
 * no page state is written, no page function is called, nothing is exposed on
 * `window`. The isolated world asks by dispatching `clo-ps-req` on `document`
 * and gets one `clo-ps-res` back, detail carrying a JSON STRING (plain-string
 * detail crosses the world boundary unambiguously; live objects would not).
 *
 * Fragility note: component names in the bundle are minified and MUST NOT be
 * matched on. Property names come from Chessable's own API payload and are
 * not — so the search below is by SHAPE (a context object owning an array
 * `lessonPlan`), which is what makes it survive a rebundle.
 */
(() => {
  'use strict';

  const FIBER_PREFIX = '__reactFiber$';
  const MAX_FIBERS = 20000; // hard cap; a whole trainer tree measured ~950

  /** The fiber root reachable from any board node, or null. */
  function fiberRoot() {
    // Any element rendered by the trainer will do; the board is the one node
    // guaranteed to exist whenever a lesson is running.
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

  /** The trainer context object (shape: owns an array `lessonPlan`), or null. */
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
          // The same context also travels inside a ref-like `current` wrapper.
          if (props.current && props.current.context &&
              Array.isArray(props.current.context.lessonPlan)) return props.current.context;
        }
      } catch (err) { /* exotic proxies — skip */ }
      if (fiber.child) stack.push(fiber.child);
      if (fiber.sibling) stack.push(fiber.sibling);
    }
    return null;
  }

  /**
   * The per-ply quiz record, trimmed to the fields the mistake log needs.
   * `quizIncorrectAttempts` is the mistake list itself: the SAN actually
   * played ("c5") or the literal "timeUp", per failed attempt of THIS
   * session's lesson (the counters are per-lesson, not lifetime).
   *
   * Everything here is optional by design: a plan entry without `progress`, or
   * with a shape Chessable has since changed, must degrade to "no mistakes
   * known" and MUST NOT fail the read that auto-play depends on.
   */
  function trimProgress(p) {
    if (!p || typeof p !== 'object') return null;
    const attempts = Array.isArray(p.quizIncorrectAttempts)
      ? p.quizIncorrectAttempts.filter((a) => typeof a === 'string').slice(-20)
      : [];
    const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
    return {
      finished: p.finished === true,
      quizTotal: num(p.quizTotal),
      quizCorrectTotal: num(p.quizCorrectTotal),
      quizIncorrectTotal: num(p.quizIncorrectTotal),
      quizIncorrectAttempts: attempts,
      softFail: p.softFail === true,
    };
  }

  /**
   * The current variation's line, or an { error } object. Only the fields the
   * two consumers need are copied out — never the whole context, which holds
   * far more of the user's progress data than either of them has any use for.
   */
  function readLine() {
    const root = fiberRoot();
    if (!root) return { error: 'no fiber root' };
    const ctx = findContext(root);
    if (!ctx) return { error: 'no lesson context' };
    const plan = ctx.lessonPlan;
    if (!plan.length) return { error: 'empty lesson plan' };

    const plies = [];
    for (const move of plan) {
      // A plan entry missing any of these is unusable: fail the WHOLE read
      // rather than hand auto-play a line with a hole in it.
      if (!move || typeof move.san !== 'string' || !move.san ||
          (move.color !== 'w' && move.color !== 'b') ||
          typeof move.sourceFen !== 'string' || !move.sourceFen) {
        return { error: 'unusable plan entry' };
      }
      plies.push({
        san: move.san,
        color: move.color,
        from: typeof move.from === 'string' ? move.from : null,
        to: typeof move.to === 'string' ? move.to : null,
        sourceFen: move.sourceFen,
        // --- mistake-log extras (section 16). All OPTIONAL: auto-play ignores
        // them, and a plan that stops carrying them must still yield a usable
        // line. `mid` is the ply's index among the USER's moves in the
        // variation and is the same id Chessable's own difficult-moves data
        // calls `moveId` — it is the mistake log's key.
        mid: Number.isInteger(move.mid) ? move.mid : null,
        ply: Number.isInteger(move.ply) ? move.ply : null,
        isUserMove: move.isUserMove === true,
        isKey: move.isKey === true,
        startedAsOverstudy: move.startedAsOverstudy === true,
        progress: trimProgress(move.progress),
      });
    }
    // The plan belongs to whichever variation the trainer is currently on;
    // the caller matches this against the oid it tracks and ignores a stale
    // answer, so a mid-swap read can never be applied to the wrong variation.
    const oid = plan[0].variationId != null ? String(plan[0].variationId)
      : (ctx.currentVariationId != null ? String(ctx.currentVariationId) : null);
    if (!oid) return { error: 'no variation id' };
    return {
      oid,
      plies,
      // Context-level extras for the mistake log: "review" in /practice/,
      // "learn" in /learn/ (an overstudy run is a learn session whose plies
      // also carry startedAsOverstudy).
      studyMode: typeof ctx.lessonStudyMode === 'string' ? ctx.lessonStudyMode : null,
      variationName: typeof plan[0].variationName === 'string' ? plan[0].variationName : null,
    };
  }

  document.addEventListener('clo-ps-req', () => {
    let payload;
    try {
      payload = readLine();
    } catch (err) {
      payload = { error: String((err && err.message) || err).slice(0, 200) };
    }
    document.dispatchEvent(new CustomEvent('clo-ps-res', { detail: JSON.stringify(payload) }));
  });
})();
