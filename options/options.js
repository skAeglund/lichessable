/**
 * LiChessable — options page logic.
 * MV3 forbids inline scripts, so everything is wired up here.
 */
'use strict';

const TOKEN_KEY = 'lichessToken'; // must match background.js and content/lichessable.js
const $ = (id) => document.getElementById(id);

function setStatus(text, isError) {
  const el = $('status');
  el.textContent = text;
  el.className = isError ? 'error' : 'ok';
}

async function init() {
  const stored = await chrome.storage.local.get(TOKEN_KEY);
  if (stored[TOKEN_KEY]) $('token').value = stored[TOKEN_KEY];
}

$('show').addEventListener('change', () => {
  $('token').type = $('show').checked ? 'text' : 'password';
});

$('save').addEventListener('click', async () => {
  const token = $('token').value.trim();
  await chrome.storage.local.set({ [TOKEN_KEY]: token });
  // The content script listens for this storage change and retries the
  // current position automatically — no page reload needed.
  setStatus(token ? 'Saved.' : 'Token cleared.');
});

$('test').addEventListener('click', async () => {
  const token = $('token').value.trim(); // tests what's typed, saved or not
  if (!token) { setStatus('Enter a token first.', true); return; }
  setStatus('Testing…');
  try {
    // Minimal request for the starting position. Extension pages can use the
    // host_permission, so this fetch is CORS-exempt just like the worker's.
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const url = 'https://explorer.lichess.org/lichess?variant=standard'
      + '&fen=' + encodeURIComponent(fen)
      + '&moves=1&topGames=0&recentGames=0';
    const response = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (response.ok) {
      setStatus('Token works ✓');
    } else if (response.status === 401) {
      setStatus('Rejected (401) — token invalid or revoked.', true);
    } else if (response.status === 429) {
      setStatus('Rate limited (429) — token is probably fine, try again in a minute.', true);
    } else {
      setStatus('Unexpected response: HTTP ' + response.status, true);
    }
  } catch (err) {
    setStatus('Network error: ' + err, true);
  }
});

init();
