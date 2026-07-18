# CLAUDE.md — LiChessable

Personal Chrome extension (Manifest V3), loaded unpacked. Injects a "Lichess
Database" panel beneath Chessable's move table on Explore pages
(`https://www.chessable.com/explore/<id>/`) so course statistics can be
compared against real Lichess games for the current position. Currently
working (v0.3.x).

## Structure

- `manifest.json` — MV3. Permissions: `storage` + host permission for
  `explorer.lichess.org`. Nothing else, keep it that way.
- `content/lichessable.js` — the only content script. Runs inside Chessable's
  same-origin mt1 iframe (`all_frames: true`; exits unless
  `location.pathname` starts with `/mt1/explore/`).
- `content/lichessable.css` — panel styles, all namespaced `.clo-`.
- `background.js` — service worker; does the authenticated explorer fetch.
  Message types: `clo-fetch-explorer`, `clo-open-options`.
- `options/` — Lichess API token entry + Test button.
- `README.md` — living documentation; update it alongside functional changes.

## Hard constraints

- Plain JS/HTML/CSS only. No bundler, no npm, no frameworks, no remote code.
- Every Chessable selector lives ONLY in the `SELECTORS` object at the top of
  `content/lichessable.js`; Lichess API settings ONLY in `CONFIG.lichess`.
  Chessable's markup is fragile third-party internals — never scatter
  selectors through the code.
- All console output prefixed `[CLO]`.
- No inline event handlers. Remote/dynamic text via `textContent`, never
  `innerHTML` (the static panel skeleton is the sole innerHTML use).
- Bump `manifest.json` version on functional changes.

## Key mechanics (don't accidentally break)

- `#inputFEN` (inside the iframe) is the single source of truth for the
  position. Its value changes programmatically WITHOUT events — hence the
  triple detection: input events + MutationObserver on `#nextMovesBit` +
  500 ms poll, all debounced 300 ms.
- The 500 ms poll is also a self-healing watchdog: re-mounts the panel and
  re-binds listeners after SPA-style re-renders. All healing is idempotent.
- Fetches carry a sequence number; stale responses are cached but not
  rendered. LRU cache: 200 positions, keyed on the first four FEN fields
  (so move-counter-only differences share entries).
- The Lichess opening explorer requires a Bearer token since early 2026 and
  lives at `explorer.lichess.org` (`explorer.lichess.ovh` now 401s). Token:
  `chrome.storage.local` key `lichessToken` — the string is duplicated in
  content script, worker, and options.js; keep all three in sync.
- 429 → 61 s cooldown, then one auto-retry. 401 → in-panel settings prompt.
  Saving a token in options triggers a retry via `chrome.storage.onChanged`.

## Verification (no automated tests)

```
node --check content/lichessable.js
node --check background.js
node --check options/options.js
python3 -c "import json; json.load(open('manifest.json'))"
```

Manual test loop (user does this; end implementation turns by reminding them):
reload the extension at `chrome://extensions` (↻ on the card), then reload the
Chessable tab. Logs appear in the mt1 IFRAME's console context — filter the
console for `[CLO]`.

## Never

- Ask for, log, or store the actual `lip_` token value anywhere in the repo.
- Add permissions, hosts, or libraries without explicit discussion.
- Fix Chessable-markup breakage anywhere except `SELECTORS`.
