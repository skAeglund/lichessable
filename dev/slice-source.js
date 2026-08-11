// Extracts real function source from content/lichessable.js by brace matching,
// so the harness executes the shipped code rather than a transcription.
const fs = require('fs');
const path = require('path');
const SRC_PATH = process.env.CLO_SRC || path.join(__dirname, '..', 'content', 'lichessable.js');
const SRC = fs.readFileSync(SRC_PATH, 'utf8');
const LINES = SRC.split('\n');

function findDecl(name) {
  const pats = [
    new RegExp('^\\s*function\\s+' + name + '\\s*\\('),
    new RegExp('^\\s*const\\s+' + name + '\\s*='),
  ];
  for (let i = 0; i < LINES.length; i++) {
    for (const p of pats) if (p.test(LINES[i])) return i;
  }
  throw new Error('not found: ' + name);
}

function sliceDecl(name) {
  const start = findDecl(name);
  const isArrow = /^\s*const\s/.test(LINES[start]);
  let depth = 0, seen = false, paren = 0;
  for (let i = start; i < LINES.length; i++) {
    const line = LINES[i];
    let inStr = null;
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (inStr) {
        if (ch === String.fromCharCode(92)) c++;
        else if (ch === inStr) inStr = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
      if (ch === '/' && line[c + 1] === '/') break;
      if (ch === '(') paren++;
      if (ch === ')') paren--;
      if (ch === '{') { depth++; seen = true; }
      if (ch === '}') depth--;
    }
    if (seen && depth === 0) return LINES.slice(start, i + 1).join('\n');
    if (isArrow && !seen && paren === 0 && /;\s*$/.test(line)) return LINES.slice(start, i + 1).join('\n');
  }
  throw new Error('unterminated: ' + name);
}

module.exports = { sliceDecl, findDecl, SRC_PATH };

if (require.main === module) {
  console.log('source: ' + SRC_PATH);
  for (const n of process.argv.slice(2)) {
    const s = sliceDecl(n);
    console.log('--- ' + n + ' @ line ' + (findDecl(n) + 1) + ', ' + s.split('\n').length + ' lines ---');
    console.log(s.split('\n').slice(0, 2).join('\n'));
  }
}
