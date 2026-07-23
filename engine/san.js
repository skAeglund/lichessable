/**
 * LiChessable — UCI→SAN converter (pure, dependency-free)
 *
 * Turns engine PVs ("e2e4 e7e5 g1f3") into numbered SAN ("1. e4 e5 2. Nf3").
 * Standard chess only. Loaded by engine/offscreen.html before engine.js;
 * exposes a single global namespace object `CloSan`. No chrome.* usage, so
 * it can be spot-checked directly from node during development.
 *
 * Board model: 64-array, index = rank * 8 + file (a1 = 0, h8 = 63).
 * White pieces are uppercase FEN letters, black lowercase, empty = null.
 */
'use strict';

var CloSan = (() => {

  const FILES = 'abcdefgh';

  const fileOf = (sq) => sq & 7;
  const rankOf = (sq) => sq >> 3;
  const sqName = (sq) => FILES[fileOf(sq)] + (rankOf(sq) + 1);
  const parseSquare = (s) => {
    const f = FILES.indexOf(s[0]);
    const r = s.charCodeAt(1) - 49; // '1' -> 0
    if (f < 0 || r < 0 || r > 7) return -1;
    return r * 8 + f;
  };

  const colorOf = (piece) => (piece === piece.toUpperCase() ? 'w' : 'b');
  const typeOf  = (piece) => piece.toUpperCase(); // 'P' 'N' 'B' 'R' 'Q' 'K'

  // Direction offsets. Every step also checks the file delta to reject wraps.
  const KNIGHT_OFFS = [17, 15, 10, 6, -6, -10, -15, -17];
  const KING_OFFS   = [9, 8, 7, 1, -1, -7, -8, -9];
  const BISHOP_DIRS = [9, 7, -7, -9];
  const ROOK_DIRS   = [8, 1, -1, -8];

  /** True when moving by `off` from `from` stays on the board without wrapping. */
  function onBoard(from, off) {
    const to = from + off;
    if (to < 0 || to > 63) return false;
    return Math.abs(fileOf(to) - fileOf(from)) <= 2; // widest legal jump (knight)
  }

  // --- FEN ------------------------------------------------------------------

  /** Parses the first four+ FEN fields; returns null on malformed input. */
  function parseFen(fen) {
    if (typeof fen !== 'string') return null;
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 2) return null;
    const board = new Array(64).fill(null);
    const rows = parts[0].split('/');
    if (rows.length !== 8) return null;
    for (let r = 0; r < 8; r++) {
      let file = 0;
      for (const ch of rows[r]) { // rows[0] is rank 8
        if (ch >= '1' && ch <= '8') { file += Number(ch); continue; }
        if (!'pnbrqkPNBRQK'.includes(ch) || file > 7) return null;
        board[(7 - r) * 8 + file] = ch;
        file++;
      }
      if (file !== 8) return null;
    }
    const side = parts[1] === 'b' ? 'b' : 'w';
    const castling = parts[2] && parts[2] !== '-' ? parts[2] : '';
    const ep = parts[3] && parts[3] !== '-' ? parseSquare(parts[3]) : -1;
    const fullmove = Number(parts[5]) || 1;
    return { board, side, castling, ep, fullmove };
  }

  /**
   * Serializes a position object back to a full six-field FEN string. The
   * halfmove clock is not part of the position model (parseFen drops it), so
   * it is an explicit parameter; omitted/invalid values become 0.
   */
  function fenFromPos(pos, halfmove) {
    if (!pos || !Array.isArray(pos.board) || pos.board.length !== 64) return null;
    const rows = [];
    for (let rank = 7; rank >= 0; rank--) {
      let row = '', empty = 0;
      for (let file = 0; file < 8; file++) {
        const p = pos.board[rank * 8 + file];
        if (p) {
          if (empty) { row += empty; empty = 0; }
          row += p;
        } else empty++;
      }
      if (empty) row += empty;
      rows.push(row);
    }
    const half = Number.isInteger(halfmove) && halfmove >= 0 ? halfmove : 0;
    return rows.join('/') + ' ' + pos.side + ' ' + (pos.castling || '-') + ' ' +
      (pos.ep >= 0 ? sqName(pos.ep) : '-') + ' ' + half + ' ' + (pos.fullmove || 1);
  }

  // --- attacks --------------------------------------------------------------

  /** Is `sq` attacked by any piece of color `by`? */
  function attacked(board, sq, by) {
    // Pawns: a white pawn on sq-7/sq-9 attacks sq (and mirrored for black).
    const pawn = by === 'w' ? 'P' : 'p';
    for (const off of by === 'w' ? [-7, -9] : [7, 9]) {
      const from = sq + off;
      if (from >= 0 && from < 64 &&
          Math.abs(fileOf(from) - fileOf(sq)) === 1 &&
          board[from] === pawn) return true;
    }
    const knight = by === 'w' ? 'N' : 'n';
    for (const off of KNIGHT_OFFS) {
      if (onBoard(sq, off) && board[sq + off] === knight) return true;
    }
    const king = by === 'w' ? 'K' : 'k';
    for (const off of KING_OFFS) {
      if (onBoard(sq, off) && Math.abs(fileOf(sq + off) - fileOf(sq)) <= 1 &&
          board[sq + off] === king) return true;
    }
    // Sliders.
    for (const dirs of [BISHOP_DIRS, ROOK_DIRS]) {
      const diag = dirs === BISHOP_DIRS;
      for (const dir of dirs) {
        let from = sq;
        for (;;) {
          const next = from + dir;
          if (next < 0 || next > 63) break;
          if (Math.abs(fileOf(next) - fileOf(from)) > 1) break; // wrapped
          from = next;
          const piece = board[from];
          if (!piece) continue;
          if (colorOf(piece) === by) {
            const t = typeOf(piece);
            if (t === 'Q' || (diag ? t === 'B' : t === 'R')) return true;
          }
          break; // any piece blocks the ray
        }
      }
    }
    return false;
  }

  function findKing(board, color) {
    const king = color === 'w' ? 'K' : 'k';
    return board.indexOf(king);
  }

  function inCheck(pos, color) {
    const kingSq = findKing(pos.board, color);
    if (kingSq < 0) return false; // defensive: malformed position
    return attacked(pos.board, kingSq, color === 'w' ? 'b' : 'w');
  }

  // --- move making (copy-make; PVs are short, performance is irrelevant) ----

  /** Applies a move ({from, to, promo}) and returns the NEW position. */
  function makeMove(pos, move) {
    const board = pos.board.slice();
    const piece = board[move.from];
    const type = typeOf(piece);
    const isPawn = type === 'P';
    let castling = pos.castling;
    let ep = -1;

    // En-passant capture: pawn moves diagonally onto the empty ep square.
    if (isPawn && move.to === pos.ep && !board[move.to] &&
        fileOf(move.to) !== fileOf(move.from)) {
      board[move.to + (pos.side === 'w' ? -8 : 8)] = null;
    }

    // Castling: king moves two files; hop the rook over.
    if (type === 'K' && Math.abs(fileOf(move.to) - fileOf(move.from)) === 2) {
      const rank = rankOf(move.from) * 8;
      if (fileOf(move.to) === 6) { board[rank + 5] = board[rank + 7]; board[rank + 7] = null; }
      else                       { board[rank + 3] = board[rank + 0]; board[rank + 0] = null; }
    }

    // Double pawn push sets the en-passant square.
    if (isPawn && Math.abs(move.to - move.from) === 16) {
      ep = (move.from + move.to) / 2;
    }

    // Castling rights: king moves, rook moves, or rook captured at home.
    const strip = (rights) => { castling = castling.split('').filter((c) => !rights.includes(c)).join(''); };
    if (type === 'K') strip(pos.side === 'w' ? 'KQ' : 'kq');
    for (const sq of [move.from, move.to]) {
      if (sq === 0) strip('Q');
      else if (sq === 7) strip('K');
      else if (sq === 56) strip('q');
      else if (sq === 63) strip('k');
    }

    board[move.to] = move.promo
      ? (pos.side === 'w' ? move.promo.toUpperCase() : move.promo.toLowerCase())
      : piece;
    board[move.from] = null;

    return {
      board,
      side: pos.side === 'w' ? 'b' : 'w',
      castling,
      ep,
      fullmove: pos.side === 'b' ? pos.fullmove + 1 : pos.fullmove,
    };
  }

  // --- move generation ------------------------------------------------------

  /** All legal moves for the side to move, as {from, to, promo|null}. */
  function generateMoves(pos) {
    const { board, side } = pos;
    const moves = [];
    const push = (from, to, promo) => moves.push({ from, to, promo: promo || null });
    const pushPawn = (from, to) => {
      if (rankOf(to) === 0 || rankOf(to) === 7) {
        for (const promo of ['q', 'r', 'b', 'n']) push(from, to, promo);
      } else push(from, to);
    };

    for (let from = 0; from < 64; from++) {
      const piece = board[from];
      if (!piece || colorOf(piece) !== side) continue;
      const type = typeOf(piece);

      if (type === 'P') {
        const dir = side === 'w' ? 8 : -8;
        const startRank = side === 'w' ? 1 : 6;
        const one = from + dir;
        if (one >= 0 && one < 64 && !board[one]) {
          pushPawn(from, one);
          const two = from + dir * 2;
          if (rankOf(from) === startRank && !board[two]) push(from, two);
        }
        for (const capOff of [dir - 1, dir + 1]) {
          const to = from + capOff;
          if (to < 0 || to > 63 || Math.abs(fileOf(to) - fileOf(from)) !== 1) continue;
          if ((board[to] && colorOf(board[to]) !== side) || to === pos.ep) pushPawn(from, to);
        }
      } else if (type === 'N' || type === 'K') {
        const offs = type === 'N' ? KNIGHT_OFFS : KING_OFFS;
        const maxFileDelta = type === 'N' ? 2 : 1;
        for (const off of offs) {
          const to = from + off;
          if (to < 0 || to > 63) continue;
          if (Math.abs(fileOf(to) - fileOf(from)) > maxFileDelta) continue;
          if (!board[to] || colorOf(board[to]) !== side) push(from, to);
        }
      } else {
        const dirs = type === 'Q' ? KING_OFFS
          : type === 'R' ? ROOK_DIRS : BISHOP_DIRS;
        for (const dir of dirs) {
          let cur = from;
          for (;;) {
            const to = cur + dir;
            if (to < 0 || to > 63) break;
            if (Math.abs(fileOf(to) - fileOf(cur)) > 1) break; // wrapped
            if (!board[to]) { push(from, to); cur = to; continue; }
            if (colorOf(board[to]) !== side) push(from, to);
            break;
          }
        }
      }
    }

    // Castling (standard squares only; rights already imply king/rook homes,
    // but verify the pieces are actually there — the FEN may be hand-built).
    const enemy = side === 'w' ? 'b' : 'w';
    const base = side === 'w' ? 0 : 56;
    const kingHome = base + 4;
    if (board[kingHome] === (side === 'w' ? 'K' : 'k') &&
        !attacked(board, kingHome, enemy)) {
      const rook = side === 'w' ? 'R' : 'r';
      if (pos.castling.includes(side === 'w' ? 'K' : 'k') &&
          board[base + 7] === rook && !board[base + 5] && !board[base + 6] &&
          !attacked(board, base + 5, enemy) && !attacked(board, base + 6, enemy)) {
        push(kingHome, base + 6);
      }
      if (pos.castling.includes(side === 'w' ? 'Q' : 'q') &&
          board[base + 0] === rook && !board[base + 1] && !board[base + 2] && !board[base + 3] &&
          !attacked(board, base + 3, enemy) && !attacked(board, base + 2, enemy)) {
        push(kingHome, base + 2);
      }
    }

    // Legality filter: the mover's own king must not be left in check.
    return moves.filter((move) => !inCheck(makeMove(pos, move), side));
  }

  // --- SAN ------------------------------------------------------------------

  /**
   * Resolves a UCI string against the position to a legal move object, or
   * null. Normalizes king-onto-own-rook castling (chess960-style e1h1) to the
   * standard king-two-files form Stockfish emits by default (e1g1).
   */
  function uciToMove(pos, uci) {
    if (typeof uci !== 'string' || uci.length < 4) return null;
    const from = parseSquare(uci.slice(0, 2));
    let to = parseSquare(uci.slice(2, 4));
    if (from < 0 || to < 0) return null;
    const promo = uci.length > 4 ? uci[4].toLowerCase() : null;
    const piece = pos.board[from];
    if (!piece || colorOf(piece) !== pos.side) return null;
    if (typeOf(piece) === 'K' && pos.board[to] &&
        typeOf(pos.board[to]) === 'R' && colorOf(pos.board[to]) === pos.side) {
      to = rankOf(from) * 8 + (fileOf(to) > fileOf(from) ? 6 : 2);
    }
    const legal = generateMoves(pos);
    return legal.find((m) => m.from === from && m.to === to && (m.promo || null) === promo) || null;
  }

  /** SAN for an already-validated legal move object. */
  function sanForMove(pos, move) {
    const piece = pos.board[move.from];
    const type = typeOf(piece);
    let san;

    if (type === 'K' && Math.abs(fileOf(move.to) - fileOf(move.from)) === 2) {
      san = fileOf(move.to) === 6 ? 'O-O' : 'O-O-O';
    } else {
      const isCapture = Boolean(pos.board[move.to]) ||
        (type === 'P' && move.to === pos.ep && fileOf(move.to) !== fileOf(move.from));
      if (type === 'P') {
        san = (isCapture ? FILES[fileOf(move.from)] + 'x' : '') + sqName(move.to);
        if (move.promo) san += '=' + move.promo.toUpperCase();
      } else {
        // Disambiguate against other same-type pieces that can reach move.to.
        const rivals = generateMoves(pos).filter((m) =>
          m.to === move.to && m.from !== move.from &&
          typeOf(pos.board[m.from]) === type);
        let hint = '';
        if (rivals.length) {
          const sameFile = rivals.some((m) => fileOf(m.from) === fileOf(move.from));
          const sameRank = rivals.some((m) => rankOf(m.from) === rankOf(move.from));
          if (!sameFile) hint = FILES[fileOf(move.from)];
          else if (!sameRank) hint = String(rankOf(move.from) + 1);
          else hint = sqName(move.from);
        }
        san = type + hint + (isCapture ? 'x' : '') + sqName(move.to);
      }
    }

    const next = makeMove(pos, move);
    if (inCheck(next, next.side)) {
      san += generateMoves(next).length === 0 ? '#' : '+';
    }
    return san;
  }

  /** SAN for one UCI move in a position, or null if illegal. */
  function moveToSan(pos, uci) {
    const move = uciToMove(pos, uci);
    return move ? sanForMove(pos, move) : null;
  }

  /**
   * Numbered SAN line for a PV, e.g. "12... Nf6 13. Bg5 h6". Returns null if
   * the FEN is malformed or any move is illegal in sequence (caller falls
   * back to raw UCI).
   */
  function pvToSan(fen, uciMoves) {
    let pos = parseFen(fen);
    if (!pos || !Array.isArray(uciMoves) || uciMoves.length === 0) return null;
    const out = [];
    for (let i = 0; i < uciMoves.length; i++) {
      const move = uciToMove(pos, uciMoves[i]);
      if (!move) return null;
      if (pos.side === 'w') out.push(pos.fullmove + '.');
      else if (i === 0) out.push(pos.fullmove + '...');
      out.push(sanForMove(pos, move));
      pos = makeMove(pos, move);
    }
    return out.join(' ');
  }

  return { parseFen, fenFromPos, generateMoves, makeMove, uciToMove, moveToSan, pvToSan };
})();

// Node spot-check support (ignored in the browser).
if (typeof module !== 'undefined' && module.exports) module.exports = CloSan;
