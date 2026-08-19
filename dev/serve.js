/**
 * dev/serve.js — a static file server for dev/harness.html.
 *
 * The harness is a file:// page, and neither browser-automation surface here
 * will navigate to one, so measuring it needs an http origin. Nothing else
 * uses this; it is not referenced by the manifest.
 *
 *   node dev/serve.js        # → http://127.0.0.1:8731/dev/harness.html
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-store', // the harness's stylesheet is edited between reloads
  });
  fs.createReadStream(file).pipe(res);
}).listen(8731, '127.0.0.1', () => console.log('harness: http://127.0.0.1:8731/dev/harness.html'));
