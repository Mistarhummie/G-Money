import { mulberry32, tooFast } from "./rng";
import { invalid, type ArcadeGame, type PvpState } from "./types";

/**
 * Chess against the computer. Our own rules engine on a 0x88 board (square = rank * 16 + file,
 * rank 0 is White's back rank). The player is White and moves first. Input is the player's moves
 * in UCI ("e2e4 g1f3 e7e8q"); the server replays them and computes every computer reply itself
 * with the same deterministic search, so the browser and the server always see the same game.
 */

// Pieces: positive = White, negative = Black.
export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

// Move = from | to << 7 | promo << 14 | flags << 17
const F_CAPTURE = 1;
const F_EP = 2;
const F_CASTLE = 4;
const F_DOUBLE = 8;

export const moveFrom = (m: number) => m & 127;
export const moveTo = (m: number) => (m >> 7) & 127;
export const movePromo = (m: number) => (m >> 14) & 7;
const moveFlags = (m: number) => m >> 17;
const encode = (from: number, to: number, promo: number, flags: number) => from | (to << 7) | (promo << 14) | (flags << 17);

export type Position = {
  board: Int8Array; // 128 cells, only those with (sq & 0x88) === 0 are on the board
  side: 1 | -1; // 1 = White to move
  castling: number; // 1 White O-O, 2 White O-O-O, 4 Black O-O, 8 Black O-O-O
  ep: number; // en passant target square, or -1
  halfmove: number; // plies since the last capture or pawn move (50-move rule)
  ply: number; // plies played in the game
  kings: [number, number]; // [White king, Black king]
  history: string[]; // position keys of every position so far, current one last (repetition)
  undo: number[]; // make/unmake stack used by the search
};

export const MAX_PLIES = 200;
export const MAX_HUMAN_MOVES_PER_SECOND = 2;

export const STAGES = [
  { depth: 1, quiescence: false, blunder: 0.35, nodes: 20000, name: "Beginner", goal: "Checkmate a computer that often blunders" },
  { depth: 2, quiescence: false, blunder: 0, nodes: 20000, name: "Novice", goal: "Checkmate a computer that looks 2 moves ahead" },
  { depth: 3, quiescence: false, blunder: 0, nodes: 20000, name: "Club", goal: "Checkmate a computer that looks 3 moves ahead" },
  { depth: 3, quiescence: true, blunder: 0, nodes: 20000, name: "Strong", goal: "Checkmate a computer that sees every exchange" },
  { depth: 4, quiescence: true, blunder: 0, nodes: 20000, name: "Master", goal: "Checkmate the strongest computer" },
];

export const stageConfig = (stage: number) => STAGES[Math.min(Math.max(stage, 1), STAGES.length) - 1];

// ---------------------------------------------------------------- squares

export const sqName = (sq: number) => "abcdefgh"[sq & 7] + ((sq >> 4) + 1);
export const sqOf = (file: number, rank: number) => rank * 16 + file;
const parseSq = (s: string) => sqOf(s.charCodeAt(0) - 97, s.charCodeAt(1) - 49);

const KNIGHT_D = [33, 31, 18, 14, -33, -31, -18, -14];
const BISHOP_D = [15, 17, -15, -17];
const ROOK_D = [1, -1, 16, -16];
const KING_D = [1, -1, 16, -16, 15, 17, -15, -17];

// Castling rights kept after a move touches a square.
const CASTLE_MASK = new Int8Array(128).fill(15);
CASTLE_MASK[0x04] = 12;
CASTLE_MASK[0x07] = 14;
CASTLE_MASK[0x00] = 13;
CASTLE_MASK[0x74] = 3;
CASTLE_MASK[0x77] = 11;
CASTLE_MASK[0x70] = 7;

// ---------------------------------------------------------------- position

export function startPosition(): Position {
  const board = new Int8Array(128);
  const back = [ROOK, KNIGHT, BISHOP, QUEEN, KING, BISHOP, KNIGHT, ROOK];
  for (let f = 0; f < 8; f++) {
    board[sqOf(f, 0)] = back[f];
    board[sqOf(f, 1)] = PAWN;
    board[sqOf(f, 6)] = -PAWN;
    board[sqOf(f, 7)] = -back[f];
  }
  const pos: Position = { board, side: 1, castling: 15, ep: -1, halfmove: 0, ply: 0, kings: [0x04, 0x74], history: [], undo: [] };
  pos.history.push(positionKey(pos));
  return pos;
}

/** Builds a position from FEN (used by tests). */
export function fromFen(fen: string): Position {
  const [placement, side, castling, ep, halfmove] = fen.split(" ");
  const board = new Int8Array(128);
  const kings: [number, number] = [0, 0];
  placement.split("/").forEach((row, i) => {
    let f = 0;
    for (const ch of row) {
      if (ch >= "1" && ch <= "8") f += Number(ch);
      else {
        const t = " pnbrqk".indexOf(ch.toLowerCase());
        const p = ch === ch.toUpperCase() ? t : -t;
        const sq = sqOf(f, 7 - i);
        board[sq] = p;
        if (p === KING) kings[0] = sq;
        if (p === -KING) kings[1] = sq;
        f++;
      }
    }
  });
  let rights = 0;
  if (castling.includes("K")) rights |= 1;
  if (castling.includes("Q")) rights |= 2;
  if (castling.includes("k")) rights |= 4;
  if (castling.includes("q")) rights |= 8;
  const pos: Position = { board, side: side === "w" ? 1 : -1, castling: rights, ep: ep === "-" ? -1 : parseSq(ep), halfmove: Number(halfmove ?? 0), ply: 0, kings, history: [], undo: [] };
  pos.history.push(positionKey(pos));
  return pos;
}

/** Counts leaf nodes of the legal move tree (used by tests to check move generation). */
export function perft(pos: Position, depth: number): number {
  if (depth === 0) return 1;
  const moves: number[] = [];
  generate(pos, moves, false);
  let n = 0;
  for (const m of moves) {
    if (!make(pos, m)) continue;
    n += perft(pos, depth - 1);
    unmake(pos);
  }
  return n;
}

function clone(pos: Position): Position {
  return { ...pos, board: pos.board.slice(), kings: [pos.kings[0], pos.kings[1]], history: pos.history.slice(), undo: [] };
}

/** Identifies a position for repetition: pieces, side, castling, and en passant only if a capture is possible. */
export function positionKey(pos: Position): string {
  let key = "";
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) key += String.fromCharCode(72 + pos.board[r * 16 + f]);
  let ep = -1;
  if (pos.ep >= 0) {
    const from = pos.ep - 16 * pos.side;
    for (const d of [-1, 1]) {
      const sq = from + d;
      if (!(sq & 0x88) && pos.board[sq] === PAWN * pos.side) ep = pos.ep;
    }
  }
  return `${key}${pos.side}${pos.castling}${ep}`;
}

/** Is `sq` attacked by side `by`? */
export function attacked(pos: Position, sq: number, by: number): boolean {
  const b = pos.board;
  // Pawns: a White pawn on x attacks x+15 and x+17.
  const p1 = sq - 15 * by;
  const p2 = sq - 17 * by;
  if (!(p1 & 0x88) && b[p1] === PAWN * by) return true;
  if (!(p2 & 0x88) && b[p2] === PAWN * by) return true;
  for (let i = 0; i < 8; i++) {
    const n = sq + KNIGHT_D[i];
    if (!(n & 0x88) && b[n] === KNIGHT * by) return true;
    const k = sq + KING_D[i];
    if (!(k & 0x88) && b[k] === KING * by) return true;
  }
  for (let i = 0; i < 4; i++) {
    let t = sq + BISHOP_D[i];
    while (!(t & 0x88)) {
      const p = b[t];
      if (p !== 0) {
        if (p === BISHOP * by || p === QUEEN * by) return true;
        break;
      }
      t += BISHOP_D[i];
    }
    t = sq + ROOK_D[i];
    while (!(t & 0x88)) {
      const p = b[t];
      if (p !== 0) {
        if (p === ROOK * by || p === QUEEN * by) return true;
        break;
      }
      t += ROOK_D[i];
    }
  }
  return false;
}

export const inCheck = (pos: Position) => attacked(pos, pos.kings[pos.side === 1 ? 0 : 1], -pos.side);

// ---------------------------------------------------------------- move generation

/** Pseudo-legal moves (may leave the king in check). With `capturesOnly`, captures and queen promotions. */
function generate(pos: Position, out: number[], capturesOnly: boolean): void {
  const b = pos.board;
  const s = pos.side;
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) {
      sq += 7;
      continue;
    }
    const p = b[sq] * s;
    if (p <= 0) continue;
    if (p === PAWN) {
      const fwd = 16 * s;
      const promoRank = s > 0 ? 7 : 0;
      const to = sq + fwd;
      if (!(to & 0x88) && b[to] === 0) {
        if (to >> 4 === promoRank) {
          out.push(encode(sq, to, QUEEN, 0));
          if (!capturesOnly) {
            out.push(encode(sq, to, ROOK, 0));
            out.push(encode(sq, to, BISHOP, 0));
            out.push(encode(sq, to, KNIGHT, 0));
          }
        } else if (!capturesOnly) {
          out.push(encode(sq, to, 0, 0));
          if (sq >> 4 === (s > 0 ? 1 : 6) && b[to + fwd] === 0) out.push(encode(sq, to + fwd, 0, F_DOUBLE));
        }
      }
      for (let i = -1; i <= 1; i += 2) {
        const c = to + i;
        if (c & 0x88) continue;
        if (b[c] * s < 0) {
          if (c >> 4 === promoRank) {
            out.push(encode(sq, c, QUEEN, F_CAPTURE));
            if (!capturesOnly) {
              out.push(encode(sq, c, ROOK, F_CAPTURE));
              out.push(encode(sq, c, BISHOP, F_CAPTURE));
              out.push(encode(sq, c, KNIGHT, F_CAPTURE));
            }
          } else out.push(encode(sq, c, 0, F_CAPTURE));
        } else if (c === pos.ep) out.push(encode(sq, c, 0, F_CAPTURE | F_EP));
      }
    } else if (p === KNIGHT || p === KING) {
      const dirs = p === KNIGHT ? KNIGHT_D : KING_D;
      for (let i = 0; i < 8; i++) {
        const to = sq + dirs[i];
        if (to & 0x88) continue;
        const q = b[to] * s;
        if (q > 0) continue;
        if (q < 0) out.push(encode(sq, to, 0, F_CAPTURE));
        else if (!capturesOnly) out.push(encode(sq, to, 0, 0));
      }
    } else {
      const dirs = p === BISHOP ? BISHOP_D : p === ROOK ? ROOK_D : KING_D;
      for (let i = 0; i < dirs.length; i++) {
        let to = sq + dirs[i];
        while (!(to & 0x88)) {
          const q = b[to] * s;
          if (q > 0) break;
          if (q < 0) {
            out.push(encode(sq, to, 0, F_CAPTURE));
            break;
          }
          if (!capturesOnly) out.push(encode(sq, to, 0, 0));
          to += dirs[i];
        }
      }
    }
  }
  if (capturesOnly) return;
  // Castling: the king may not be in check or pass through an attacked square.
  const home = s > 0 ? 0x00 : 0x70;
  const ks = s > 0 ? 1 : 4;
  const qs = s > 0 ? 2 : 8;
  if (pos.castling & (ks | qs) && b[home + 4] === KING * s && !attacked(pos, home + 4, -s)) {
    if (pos.castling & ks && b[home + 5] === 0 && b[home + 6] === 0 && b[home + 7] === ROOK * s && !attacked(pos, home + 5, -s) && !attacked(pos, home + 6, -s))
      out.push(encode(home + 4, home + 6, 0, F_CASTLE));
    if (
      pos.castling & qs &&
      b[home + 3] === 0 &&
      b[home + 2] === 0 &&
      b[home + 1] === 0 &&
      b[home] === ROOK * s &&
      !attacked(pos, home + 3, -s) &&
      !attacked(pos, home + 2, -s)
    )
      out.push(encode(home + 4, home + 2, 0, F_CASTLE));
  }
}

/** Plays a move in place; returns false (and takes it back) if it leaves the mover's king in check. */
function make(pos: Position, m: number): boolean {
  const b = pos.board;
  const s = pos.side;
  const from = moveFrom(m);
  const to = moveTo(m);
  const promo = movePromo(m);
  const flags = moveFlags(m);
  const piece = b[from];
  const capSq = flags & F_EP ? to - 16 * s : to;
  const captured = b[capSq];
  pos.undo.push(m, captured, pos.castling, pos.ep, pos.halfmove);
  b[capSq] = 0;
  b[to] = promo ? promo * s : piece;
  b[from] = 0;
  if (flags & F_CASTLE) {
    if (to > from) {
      b[from + 1] = b[from + 3];
      b[from + 3] = 0;
    } else {
      b[from - 1] = b[from - 4];
      b[from - 4] = 0;
    }
  }
  if (piece * s === KING) pos.kings[s > 0 ? 0 : 1] = to;
  pos.castling &= CASTLE_MASK[from] & CASTLE_MASK[to];
  pos.ep = flags & F_DOUBLE ? from + 16 * s : -1;
  pos.halfmove = piece * s === PAWN || captured ? 0 : pos.halfmove + 1;
  pos.side = -s as 1 | -1;
  pos.ply++;
  if (attacked(pos, pos.kings[s > 0 ? 0 : 1], -s)) {
    unmake(pos);
    return false;
  }
  return true;
}

function unmake(pos: Position): void {
  const u = pos.undo;
  const halfmove = u.pop()!;
  const ep = u.pop()!;
  const castling = u.pop()!;
  const captured = u.pop()!;
  const m = u.pop()!;
  pos.side = -pos.side as 1 | -1;
  pos.ply--;
  pos.halfmove = halfmove;
  pos.ep = ep;
  pos.castling = castling;
  const b = pos.board;
  const s = pos.side;
  const from = moveFrom(m);
  const to = moveTo(m);
  const flags = moveFlags(m);
  const piece = movePromo(m) ? PAWN * s : b[to];
  b[from] = piece;
  b[to] = 0;
  b[flags & F_EP ? to - 16 * s : to] = captured;
  if (flags & F_CASTLE) {
    if (to > from) {
      b[from + 3] = b[from + 1];
      b[from + 1] = 0;
    } else {
      b[from - 4] = b[from - 1];
      b[from - 1] = 0;
    }
  }
  if (piece * s === KING) pos.kings[s > 0 ? 0 : 1] = from;
}

export function legalMoves(pos: Position): number[] {
  const all: number[] = [];
  generate(pos, all, false);
  const legal: number[] = [];
  for (const m of all) {
    if (make(pos, m)) {
      unmake(pos);
      legal.push(m);
    }
  }
  return legal;
}

/** Returns the position after a legal move (the original is untouched). */
export function play(pos: Position, m: number): Position {
  const next = clone(pos);
  if (!make(next, m)) throw new Error("Illegal move");
  next.undo = [];
  next.history.push(positionKey(next));
  return next;
}

export function toUci(m: number): string {
  const promo = movePromo(m);
  return sqName(moveFrom(m)) + sqName(moveTo(m)) + (promo ? " pnbrqk"[promo] : "");
}

/** The legal move written as `uci`, or null. A promotion must name its piece. */
export function fromUci(pos: Position, uci: string): number | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
  const from = parseSq(uci.slice(0, 2));
  const to = parseSq(uci.slice(2, 4));
  const promo = uci.length === 5 ? " pnbrqk".indexOf(uci[4]) : 0;
  for (const m of legalMoves(pos)) if (moveFrom(m) === from && moveTo(m) === to && movePromo(m) === promo) return m;
  return null;
}

// ---------------------------------------------------------------- game end

export type GameStatus = { over: false } | { over: true; winner: 1 | -1 | 0; reason: string };

function insufficientMaterial(pos: Position): boolean {
  let minors = 0;
  let bishopColors = 0; // bit 1: a bishop on a light square, bit 2: on a dark square
  let knights = 0;
  for (let sq = 0; sq < 120; sq++) {
    if (sq & 0x88) continue;
    const t = Math.abs(pos.board[sq]);
    if (t === PAWN || t === ROOK || t === QUEEN) return false;
    if (t === KNIGHT) {
      minors++;
      knights++;
    }
    if (t === BISHOP) {
      minors++;
      bishopColors |= ((sq >> 4) + (sq & 7)) % 2 ? 1 : 2;
    }
  }
  if (minors <= 1) return true;
  return knights === 0 && bishopColors !== 3; // only bishops, all on one colour
}

export function gameStatus(pos: Position): GameStatus {
  if (legalMoves(pos).length === 0) {
    return inCheck(pos) ? { over: true, winner: -pos.side as 1 | -1, reason: "Checkmate" } : { over: true, winner: 0, reason: "Stalemate" };
  }
  if (pos.halfmove >= 100) return { over: true, winner: 0, reason: "Draw by the 50-move rule" };
  const key = pos.history[pos.history.length - 1];
  let seen = 0;
  for (const k of pos.history) if (k === key) seen++;
  if (seen >= 3) return { over: true, winner: 0, reason: "Draw by threefold repetition" };
  if (insufficientMaterial(pos)) return { over: true, winner: 0, reason: "Draw by insufficient material" };
  if (pos.ply >= MAX_PLIES) return { over: true, winner: 0, reason: "Draw: move limit reached" };
  return { over: false };
}

// ---------------------------------------------------------------- evaluation

export const VALUES = [0, 100, 320, 330, 500, 900, 0];

// Piece-square tables from White's side, rank 8 first (as you look at the board).
// prettier-ignore
const PST_SRC: number[][] = [
  [],
  [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5,
   0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
  [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30,
   -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
  [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10,
   -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
  [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5,
   -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
  [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5,
   0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
  [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30,
   -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20],
];
// prettier-ignore
const KING_END_SRC = [-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30,
  -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30, -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50];

// PST[(piece + 6) * 128 + sq] = value + table for that coloured piece, from its own side.
const PST = new Int16Array(13 * 128);
const KING_END = new Int16Array(2 * 128);
for (let r = 0; r < 8; r++) {
  for (let f = 0; f < 8; f++) {
    const sq = sqOf(f, r);
    const white = (7 - r) * 8 + f;
    const black = r * 8 + f;
    for (let t = 1; t <= 6; t++) {
      PST[(t + 6) * 128 + sq] = VALUES[t] + PST_SRC[t][white];
      PST[(-t + 6) * 128 + sq] = VALUES[t] + PST_SRC[t][black];
    }
    KING_END[sq] = KING_END_SRC[white];
    KING_END[128 + sq] = KING_END_SRC[black];
  }
}

const centreDistance = (sq: number) => {
  const f = sq & 7;
  const r = sq >> 4;
  return Math.max(3 - f, f - 4) + Math.max(3 - r, r - 4);
};

/** Static score from the side to move's point of view, in centipawns. */
function evaluate(pos: Position): number {
  const b = pos.board;
  let score = 0; // White minus Black, without kings
  let pieces = 0; // non-pawn material of both sides
  let pawns = 0;
  for (let sq = 0; sq < 120; sq++) {
    if (sq & 0x88) {
      sq += 7;
      continue;
    }
    const p = b[sq];
    if (p === 0 || p === KING || p === -KING) continue;
    const v = PST[(p + 6) * 128 + sq];
    score += p > 0 ? v : -v;
    if (p === PAWN || p === -PAWN) pawns++;
    else pieces += VALUES[p > 0 ? p : -p];
  }
  const [wk, bk] = pos.kings;
  if (pieces <= 1300) {
    score += KING_END[wk] - KING_END[128 + bk];
    // Mop-up: the side that is well ahead drives the lone king to the edge and walks its own king in.
    if (pawns === 0 || pieces > 0) {
      const lead = score > 300 ? 1 : score < -300 ? -1 : 0;
      if (lead !== 0) {
        const loser = lead > 0 ? bk : wk;
        const dist = Math.abs((wk & 7) - (bk & 7)) + Math.abs((wk >> 4) - (bk >> 4));
        score += lead * (10 * centreDistance(loser) + 4 * (14 - dist));
      }
    }
  } else {
    score += PST[(KING + 6) * 128 + wk] - PST[(-KING + 6) * 128 + bk];
  }
  return score * pos.side;
}

// ---------------------------------------------------------------- search

const MATE = 100000;
const INF = 1000000;

type Search = { nodes: number; limit: number; aborted: boolean; quiescence: boolean; killers: Int32Array; history: Int32Array };

/** Ordering: captures by most valuable victim / least valuable attacker, promotions, killers, then history. */
function orderScores(pos: Position, moves: number[], s: Search, ply: number, first: number): number[] {
  const scores = new Array<number>(moves.length);
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    let v: number;
    if (m === first) v = 1 << 30;
    else if (moveFlags(m) & F_CAPTURE) {
      const victim = moveFlags(m) & F_EP ? PAWN : Math.abs(pos.board[moveTo(m)]);
      v = 1000000 + victim * 100 - Math.abs(pos.board[moveFrom(m)]);
    } else if (movePromo(m)) v = 900000 + movePromo(m);
    else if (m === s.killers[ply * 2]) v = 800000;
    else if (m === s.killers[ply * 2 + 1]) v = 700000;
    else v = s.history[(moveFrom(m) << 7) | moveTo(m)];
    scores[i] = v;
  }
  return scores;
}

/** Brings the best-scoring remaining move to index i (selection sort, one step at a time). */
function pick(moves: number[], scores: number[], i: number): void {
  let best = i;
  for (let j = i + 1; j < moves.length; j++) if (scores[j] > scores[best]) best = j;
  if (best !== i) {
    const m = moves[i];
    moves[i] = moves[best];
    moves[best] = m;
    const v = scores[i];
    scores[i] = scores[best];
    scores[best] = v;
  }
}

function quiesce(pos: Position, alpha: number, beta: number, s: Search, ply: number): number {
  if (++s.nodes > s.limit) {
    s.aborted = true;
    return 0;
  }
  const stand = evaluate(pos);
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  const moves: number[] = [];
  generate(pos, moves, true);
  const scores = orderScores(pos, moves, s, ply, 0);
  for (let i = 0; i < moves.length; i++) {
    pick(moves, scores, i);
    if (!make(pos, moves[i])) continue;
    const v = -quiesce(pos, -beta, -alpha, s, ply + 1);
    unmake(pos);
    if (s.aborted) return 0;
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

function negamax(pos: Position, depth: number, alpha: number, beta: number, s: Search, ply: number): number {
  const check = inCheck(pos);
  if (check && ply < 12) depth++; // look one move further when in check, to see mates
  if (depth <= 0) {
    if (s.quiescence) return quiesce(pos, alpha, beta, s, ply);
    if (++s.nodes > s.limit) s.aborted = true;
    return evaluate(pos);
  }
  if (++s.nodes > s.limit) {
    s.aborted = true;
    return 0;
  }
  if (pos.halfmove >= 100) return 0;
  const moves: number[] = [];
  generate(pos, moves, false);
  const scores = orderScores(pos, moves, s, ply, 0);
  let legal = 0;
  let best = -INF;
  for (let i = 0; i < moves.length; i++) {
    pick(moves, scores, i);
    const m = moves[i];
    if (!make(pos, m)) continue;
    legal++;
    const v = -negamax(pos, depth - 1, -beta, -alpha, s, ply + 1);
    unmake(pos);
    if (s.aborted) return 0;
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) {
      if (!(moveFlags(m) & F_CAPTURE) && !movePromo(m)) {
        if (s.killers[ply * 2] !== m) {
          s.killers[ply * 2 + 1] = s.killers[ply * 2];
          s.killers[ply * 2] = m;
        }
        s.history[(moveFrom(m) << 7) | moveTo(m)] += depth * depth;
      }
      break;
    }
  }
  if (legal === 0) return check ? -MATE + ply : 0;
  return best;
}

/**
 * The computer's move: iterative deepening alpha-beta up to the stage's depth, with a node budget
 * so the slowest search stays quick. Root moves are shuffled by a seeded RNG so equal moves vary
 * between games. Everything here is deterministic given (position, seed, stage).
 */
export function computerMove(pos: Position, seed: number, stage: number): number {
  const cfg = stageConfig(stage);
  const rand = mulberry32((seed ^ Math.imul(pos.ply + 1, 0x9e3779b1)) >>> 0);
  const work = clone(pos);
  const root = legalMoves(work);
  for (let i = root.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = root[i];
    root[i] = root[j];
    root[j] = t;
  }
  if (root.length === 1) return root[0];
  if (cfg.blunder && rand() < cfg.blunder) return root[0];

  // A move that repeats a position for the third time is a draw: score it 0.
  const repeats = root.map((m) => {
    make(work, m);
    const key = positionKey(work);
    unmake(work);
    let seen = 0;
    for (const k of pos.history) if (k === key) seen++;
    return seen >= 2;
  });

  const s: Search = { nodes: 0, limit: cfg.nodes, aborted: false, quiescence: cfg.quiescence, killers: new Int32Array(128), history: new Int32Array(128 * 128) };
  let order = root.map((_, i) => i);
  let best = 0;
  for (let depth = 1; depth <= cfg.depth; depth++) {
    let alpha = -INF;
    let bestHere = -1;
    const scored: number[] = new Array(root.length).fill(-INF);
    for (const i of order) {
      make(work, root[i]);
      const v = repeats[i] ? 0 : -negamax(work, depth - 1, -INF, -alpha, s, 1);
      unmake(work);
      if (s.aborted) break;
      scored[i] = v;
      if (v > alpha) {
        alpha = v;
        bestHere = i;
      }
    }
    if (s.aborted) break;
    best = bestHere;
    // Next depth: best first, then the rest by this depth's scores (stable, so ties keep the shuffle).
    order = order.slice().sort((a, b) => scored[b] - scored[a]);
    if (alpha >= MATE - 100) break;
  }
  return root[best];
}

// ---------------------------------------------------------------- replay

export type Replay = { error: string } | { pos: Position; status: GameStatus; playerMoves: number };

/** Replays the player's moves, computing each computer reply. Used by the server. */
export function replay(seed: number, stage: number, input: string): Replay {
  const tokens = input.trim() === "" ? [] : input.trim().split(/\s+/);
  if (tokens.length > MAX_PLIES / 2) return { error: "Too many moves" };
  let pos = startPosition();
  let status: GameStatus = { over: false };
  for (let i = 0; i < tokens.length; i++) {
    if (status.over) return { error: "Moves after the game ended" };
    const m = fromUci(pos, tokens[i]);
    if (m === null) return { error: `Illegal move ${tokens[i].slice(0, 6)}` };
    pos = play(pos, m);
    status = gameStatus(pos);
    if (status.over) continue;
    pos = play(pos, computerMove(pos, seed, stage));
    status = gameStatus(pos);
  }
  return { pos, status, playerMoves: tokens.length };
}

// ---------------------------------------------------------------- two players

export type PvpReplay = { pos: Position; status: GameStatus; lastMove: number | null };

/** Replays a two-player game (one UCI move per element, White first). Null if any move is illegal or after the end. */
export function replayPvp(moves: string[]): PvpReplay | null {
  if (moves.length > MAX_PLIES) return null;
  let pos = startPosition();
  let status: GameStatus = { over: false };
  let lastMove: number | null = null;
  for (const uci of moves) {
    if (status.over || typeof uci !== "string") return null;
    const m = fromUci(pos, uci);
    if (m === null) return null;
    pos = play(pos, m);
    lastMove = m;
    status = gameStatus(pos);
  }
  return { pos, status, lastMove };
}

/** Side 0 is White. Draws end the game with no winner. */
export function pvpState(r: PvpReplay): PvpState {
  const turn = r.pos.side === 1 ? 0 : 1;
  if (!r.status.over) return { turn, over: false, winner: null };
  const winner = r.status.winner === 1 ? 0 : r.status.winner === -1 ? 1 : null;
  return { turn, over: true, winner, detail: r.status.reason };
}

export const chessbot: ArcadeGame = {
  key: "chessbot",
  name: "Chess",
  tagline: "Beat the computer at chess, level by level.",
  howToPlay: "You are White and move first: tap a piece, then tap where it goes. Checkmate the computer to win; the faster you win, the more points you get.",
  kind: "versus",
  ranking: "score",
  scoreLabel: "points",
  stages: STAGES.map(({ name, goal }) => ({ name, goal })),
  timeLimitMs: 30 * 60 * 1000,
  pvp: {
    replay(_seed, moves) {
      const r = replayPvp(moves);
      return r && pvpState(r);
    },
    maxMoveLength: 5,
  },
  verify({ seed, stage, input, elapsedMs }) {
    if (input.length > 1000) return invalid("Too many moves");
    const r = replay(seed, stage, input);
    if ("error" in r) return invalid(r.error);
    const flagged = tooFast(r.playerMoves, elapsedMs, MAX_HUMAN_MOVES_PER_SECOND);
    if (!r.status.over) return { valid: true, cleared: false, score: 0, flagged, detail: "You resigned" };
    const { winner, reason } = r.status;
    if (winner === 1) {
      const bonus = Math.max(0, Math.min(999, 1000 - r.playerMoves * 10));
      return { valid: true, cleared: true, score: stage * 1000 + bonus, flagged, detail: reason };
    }
    if (winner === 0) return { valid: true, cleared: false, score: stage * 100, flagged, detail: reason };
    return { valid: true, cleared: false, score: 0, flagged, detail: reason };
  },
};
