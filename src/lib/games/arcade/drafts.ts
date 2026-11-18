import { mulberry32, randInt, tooFast } from "./rng";
import { invalid, type ArcadeGame, type PvpState } from "./types";

/**
 * Drafts (draughts) as commonly played in East Africa, against the computer.
 *
 * Rules: 8x8 board, 12 men each on the dark squares. Men step one square diagonally forward but
 * capture forwards and backwards. Captures are compulsory and a capture chain must be completed,
 * but when several captures exist the player may pick any of them (no "take the most" rule).
 * Captured pieces are lifted when the move ends, so a piece cannot be jumped twice. A man that ENDS
 * its move on the far row becomes a king (passing through it mid-chain does not crown it). Kings
 * "fly": they move and capture any distance along a diagonal, landing on any empty square beyond the
 * captured piece. A side with no legal move loses. Draw after 40 moves each (80 plies) with no
 * capture and no man move, or after 200 plies in all.
 *
 * Square numbering (standard 1-32), looking at the board with the player at the bottom:
 *
 *        a  b  c  d  e  f  g  h
 *   row0  .  1  .  2  .  3  .  4     computer's men start on 1-12
 *   row1  5  .  6  .  7  .  8  .
 *   row2  .  9  . 10  . 11  . 12
 *   row3 13  . 14  . 15  . 16  .
 *   row4  . 17  . 18  . 19  . 20
 *   row5 21  . 22  . 23  . 24  .     player's men start on 21-32 and move up
 *   row6  . 25  . 26  . 27  . 28
 *   row7 29  . 30  . 31  . 32  .
 *
 * Input is the player's moves only, separated by spaces: a step is "22-18", a capture lists every
 * landing square, e.g. "31x22x13". The server replays the computer's replies.
 */

export const PLAYER = 1;
export const COMPUTER = -1;
/** Board cell values: 0 empty, 1 player man, 2 player king, -1 computer man, -2 computer king. */
export type Board = Int8Array;

export const STAGES = [
  { depth: 1, mistakes: 0.35, name: "Beginner", goal: "Beat a computer that still makes mistakes" },
  { depth: 2, mistakes: 0, name: "Novice", goal: "Beat a computer that looks 2 moves ahead" },
  { depth: 4, mistakes: 0, name: "Club", goal: "Beat a computer that looks 4 moves ahead" },
  { depth: 6, mistakes: 0, name: "Strong", goal: "Beat a computer that looks 6 moves ahead" },
  { depth: 8, mistakes: 0, name: "Master", goal: "Beat a computer that looks 8 moves ahead" },
];

export const stageConfig = (stage: number) => STAGES[Math.min(Math.max(stage, 1), STAGES.length) - 1];

// ---- Geometry ---------------------------------------------------------------------------------

/** Row (0 = top) and column of square index 0-31 (square number - 1). */
export const rowOf = (sq: number) => sq >> 2;
export const colOf = (sq: number) => 2 * (sq & 3) + (rowOf(sq) % 2 === 0 ? 1 : 0);
/** Square index at (row, col), or -1 for a light square / off the board. */
export function squareAt(row: number, col: number): number {
  if (row < 0 || row > 7 || col < 0 || col > 7 || (row + col) % 2 === 0) return -1;
  return row * 4 + (col >> 1);
}

/** Diagonal directions: 0 up-left, 1 up-right, 2 down-left, 3 down-right. */
const DIRS: [number, number][] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
/** RAYS[sq][dir] = squares along that diagonal, nearest first. */
const RAYS: number[][][] = Array.from({ length: 32 }, (_, sq) =>
  DIRS.map(([dr, dc]) => {
    const ray: number[] = [];
    for (let r = rowOf(sq) + dr, c = colOf(sq) + dc; squareAt(r, c) >= 0; r += dr, c += dc) ray.push(squareAt(r, c));
    return ray;
  }),
);
/** A man's forward directions. */
const FORWARD: Record<number, number[]> = { [PLAYER]: [0, 1], [COMPUTER]: [2, 3] };
/** The row where each side's men are crowned. */
const CROWN_ROW: Record<number, number> = { [PLAYER]: 0, [COMPUTER]: 7 };

// ---- Moves ------------------------------------------------------------------------------------

export type Move = {
  /** Start square then every landing square (indices 0-31). */
  path: number[];
  /** Squares of the pieces captured (empty for a step). */
  captures: number[];
};

export function startBoard(): Board {
  const b = new Int8Array(32);
  for (let i = 0; i < 12; i++) b[i] = COMPUTER;
  for (let i = 20; i < 32; i++) b[i] = PLAYER;
  return b;
}

/** Standard notation for a move, e.g. "22-18" or "31x22x13". */
export function notation(m: Move): string {
  return m.path.map((s) => s + 1).join(m.captures.length ? "x" : "-");
}

const isEnemy = (piece: number, side: number) => piece * side < 0;

/** Extend a capture chain from `sq` (path and caps are reused scratch arrays); captured pieces stay on the board (blocking) until the move ends. */
function captureChains(b: Board, side: number, king: boolean, sq: number, path: number[], caps: number[], out: Move[]): void {
  let extended = false;
  for (let d = 0; d < 4; d++) {
    const ray = RAYS[sq][d];
    if (king) {
      // Fly over empty squares to the first piece; it must be an uncaptured enemy with space behind it.
      let i = 0;
      while (i < ray.length && b[ray[i]] === 0) i++;
      if (i >= ray.length - 1 || !isEnemy(b[ray[i]], side) || caps.includes(ray[i])) continue;
      const victim = ray[i];
      caps.push(victim);
      for (let j = i + 1; j < ray.length && b[ray[j]] === 0; j++) {
        extended = true;
        path.push(ray[j]);
        captureChains(b, side, king, ray[j], path, caps, out);
        path.pop();
      }
      caps.pop();
    } else {
      if (ray.length < 2) continue;
      const victim = ray[0];
      if (!isEnemy(b[victim], side) || caps.includes(victim) || b[ray[1]] !== 0) continue;
      extended = true;
      path.push(ray[1]);
      caps.push(victim);
      captureChains(b, side, king, ray[1], path, caps, out);
      path.pop();
      caps.pop();
    }
  }
  if (!extended && caps.length) out.push({ path: path.slice(), captures: caps.slice() });
}

/** Every legal move for `side`. Captures are compulsory, so if any exist only captures are returned. */
export function legalMoves(b: Board, side: number): Move[] {
  const caps: Move[] = [];
  for (let sq = 0; sq < 32; sq++) {
    const p = b[sq];
    if (p * side <= 0) continue;
    b[sq] = 0; // the moving piece has left its square (a king's chain may pass back over it)
    captureChains(b, side, p * side === 2, sq, [sq], [], caps);
    b[sq] = p;
  }
  if (caps.length) return caps;
  const steps: Move[] = [];
  for (let sq = 0; sq < 32; sq++) {
    const p = b[sq];
    if (p * side <= 0) continue;
    if (p * side === 2) {
      for (let d = 0; d < 4; d++)
        for (const to of RAYS[sq][d]) {
          if (b[to] !== 0) break;
          steps.push({ path: [sq, to], captures: [] });
        }
    } else {
      for (const d of FORWARD[side]) {
        const to = RAYS[sq][d][0];
        if (to !== undefined && b[to] === 0) steps.push({ path: [sq, to], captures: [] });
      }
    }
  }
  return steps;
}

/** Play a move on the board in place. Returns true if it was "quiet" (a king step without capture). */
export function applyMove(b: Board, m: Move): boolean {
  const from = m.path[0];
  const to = m.path[m.path.length - 1];
  const p = b[from];
  const side = p > 0 ? PLAYER : COMPUTER;
  b[from] = 0;
  for (const c of m.captures) b[c] = 0;
  const crowned = Math.abs(p) === 1 && rowOf(to) === CROWN_ROW[side];
  b[to] = crowned ? 2 * side : p;
  return Math.abs(p) === 2 && m.captures.length === 0;
}

// ---- Game state -------------------------------------------------------------------------------

export const MAX_PLIES = 200;
export const MAX_QUIET_PLIES = 80;

export type DraftsState = {
  board: Board;
  turn: 1 | -1;
  plies: number;
  /** Plies since the last capture or man move. */
  quiet: number;
  /** 0 while playing, 1 player won, 2 computer won, 3 draw. */
  result: 0 | 1 | 2 | 3;
  /** Legal moves for the side to move. */
  moves: Move[];
  stage: number;
  rand: () => number;
  /** Every move played so far, in notation. */
  history: string[];
};

export function newGame(seed: number, stage: number): DraftsState {
  const board = startBoard();
  return { board, turn: PLAYER, plies: 0, quiet: 0, result: 0, moves: legalMoves(board, PLAYER), stage, rand: mulberry32(seed), history: [] };
}

/** Play one of the current legal moves and settle the game result. */
export function play(s: DraftsState, m: Move): void {
  const quiet = applyMove(s.board, m);
  s.history.push(notation(m));
  s.plies++;
  s.quiet = quiet ? s.quiet + 1 : 0;
  s.turn = s.turn === PLAYER ? COMPUTER : PLAYER;
  s.moves = legalMoves(s.board, s.turn);
  if (!s.moves.length) s.result = s.turn === PLAYER ? 2 : 1;
  else if (s.quiet >= MAX_QUIET_PLIES || s.plies >= MAX_PLIES) s.result = 3;
}

/** Find the legal move written as `text` (e.g. "22-18" or "31x22x13"). */
export function findMove(s: DraftsState, text: string): Move | null {
  return s.moves.find((m) => notation(m) === text) ?? null;
}

// ---- Computer opponent: alpha-beta search -----------------------------------------------------

const WIN = 100_000;
/** Search nodes allowed per computer move; deeper iterations stop here, keeping verification fast. */
const NODE_BUDGET = 30_000;
/** Forced captures are followed past the depth limit, up to this many plies in all. */
const MAX_SEARCH_PLY = 24;

/** Static score for `side`: material, kings, how far men have advanced, and men kept in the centre. */
function evaluate(b: Board, side: number): number {
  let score = 0;
  for (let sq = 0; sq < 32; sq++) {
    const p = b[sq];
    if (p === 0) continue;
    const owner = p > 0 ? PLAYER : COMPUTER;
    let v: number;
    if (Math.abs(p) === 2) v = 300;
    else {
      const advance = owner === PLAYER ? 7 - rowOf(sq) : rowOf(sq);
      const col = colOf(sq);
      v = 100 + advance * 4 + (col >= 2 && col <= 5 ? 3 : 0) + (advance === 0 ? 4 : 0);
    }
    score += owner === side ? v : -v;
  }
  return score;
}

/** Play a move during search; returns what is needed to take it back. */
function makeMove(b: Board, m: Move): number[] {
  const undo = [b[m.path[0]]];
  for (const c of m.captures) undo.push(b[c]);
  applyMove(b, m);
  return undo;
}

function unmakeMove(b: Board, m: Move, undo: number[]): void {
  b[m.path[m.path.length - 1]] = 0;
  b[m.path[0]] = undo[0];
  for (let i = 0; i < m.captures.length; i++) b[m.captures[i]] = undo[i + 1];
}

class OutOfNodes extends Error {}

type Ctx = { nodes: number; limit: number };

function search(b: Board, side: number, depth: number, alpha: number, beta: number, ply: number, ctx: Ctx): number {
  if (++ctx.nodes > ctx.limit) throw new OutOfNodes();
  const moves = legalMoves(b, side);
  if (!moves.length) return -WIN + ply;
  const forced = moves[0].captures.length > 0;
  if (depth <= 0 && (!forced || ply >= MAX_SEARCH_PLY)) return evaluate(b, side);
  let best = -Infinity;
  for (const m of moves) {
    const undo = makeMove(b, m);
    const score = -search(b, -side, depth - 1, -beta, -alpha, ply + 1, ctx);
    unmakeMove(b, m, undo);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

/**
 * The computer's move. Deterministic: ties and the beginner's mistakes come from the seeded RNG,
 * and the search stops at a fixed node budget (iterative deepening keeps the last finished depth).
 */
export function computerMove(s: DraftsState): Move {
  const { depth, mistakes } = stageConfig(s.stage);
  const moves = s.moves;
  // The RNG is drawn the same number of times every move so browser and server stay in step.
  const roll = s.rand();
  const pick = moves[randInt(s.rand, moves.length)];
  const order = moves.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = randInt(s.rand, i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (roll < mistakes || moves.length === 1) return moves.length === 1 ? moves[0] : pick;
  const b = s.board.slice();
  const ctx: Ctx = { nodes: 0, limit: NODE_BUDGET };
  let best = order[0];
  for (let d = 1; d <= depth; d++) {
    try {
      let alpha = -Infinity;
      let bestThis = order[0];
      for (const m of order) {
        const undo = makeMove(b, m);
        const score = -search(b, -s.turn, d - 1, -Infinity, -alpha, 1, ctx);
        unmakeMove(b, m, undo);
        if (score > alpha) {
          alpha = score;
          bestThis = m;
        }
      }
      best = bestThis;
      // Search the best move first next time.
      order.splice(order.indexOf(best), 1);
      order.unshift(best);
      if (alpha >= WIN - 100) break; // a forced win is found
    } catch (e) {
      if (e instanceof OutOfNodes) break;
      throw e;
    }
  }
  return best;
}

// ---- Verification -----------------------------------------------------------------------------

export const MAX_HUMAN_MOVES_PER_SECOND = 3;

/** Points for a finished game: wins in fewer moves earn a bigger bonus. */
export function scoreFor(stage: number, result: 0 | 1 | 2 | 3, playerMoves: number): number {
  if (result === 1) return stage * 1000 + Math.max(0, Math.min(999, 1100 - 15 * playerMoves));
  if (result === 3) return stage * 100;
  return 0;
}

// ---- Player vs player ------------------------------------------------------------------------
// Side 0 is the side that moves first (the "player" side above, starting on 21-32); side 1 starts on 1-12.
// Each move string is one turn in the same notation as the vs-computer input, e.g. "22-18" or "31x22x13".

export const PVP_MAX_MOVE_LENGTH = 64;
const MOVE_TEXT = /^\d{1,2}([-x]\d{1,2})+$/;

/** Replay a two-player game; null if any move is malformed, illegal or comes after the end. */
export function replayDrafts(seed: number, moves: string[]): DraftsState | null {
  if (moves.length > MAX_PLIES) return null;
  const s = newGame(seed, 1);
  for (const t of moves) {
    if (s.result !== 0 || typeof t !== "string" || t.length > PVP_MAX_MOVE_LENGTH || !MOVE_TEXT.test(t)) return null;
    const m = findMove(s, t);
    if (!m) return null;
    play(s, m);
  }
  return s;
}

/** Squares (0-31) of a move written in notation, e.g. "31x22x13" -> [30, 21, 12]. */
export const pathOf = (text: string) => text.split(/[-x]/).map((n) => Number(n) - 1);

export function pvpStateOf(s: DraftsState): PvpState {
  const turn = s.turn === PLAYER ? 0 : 1;
  if (s.result === 1 || s.result === 2) return { turn, over: true, winner: s.result === 1 ? 0 : 1, detail: "No moves left" };
  if (s.result === 3)
    return { turn, over: true, winner: null, detail: s.plies >= MAX_PLIES ? "Draw: move limit reached" : "Draw: 40 moves each without a capture or man move" };
  return { turn, over: false, winner: null };
}

export const drafts: ArcadeGame = {
  key: "drafts",
  name: "Drafts",
  tagline: "Classic draughts against the computer.",
  howToPlay:
    "Tap one of your pieces, then the square to move to; captures are compulsory and you must finish a chain of jumps. Kings fly any distance along a diagonal, and you win when the computer cannot move.",
  kind: "versus",
  ranking: "score",
  scoreLabel: "points",
  stages: STAGES.map(({ name, goal }) => ({ name, goal })),
  timeLimitMs: 30 * 60 * 1000,
  verify({ seed, stage, input, elapsedMs }) {
    if (input.length > 4000 || !/^[0-9x\- ]*$/.test(input)) return invalid("Invalid moves");
    const tokens = input.split(" ").filter(Boolean);
    if (tokens.length > MAX_PLIES / 2) return invalid("Too many moves");
    const s = newGame(seed, stage);
    for (const t of tokens) {
      if (s.result !== 0) return invalid("Moves after the game ended");
      const m = findMove(s, t);
      if (!m) return invalid(`Illegal move ${t}`);
      play(s, m);
      if (s.result === 0) play(s, computerMove(s));
    }
    // Stopping before the game is over counts as giving up (a loss).
    const result = s.result;
    return {
      valid: true,
      cleared: result === 1,
      score: scoreFor(stage, result, tokens.length),
      flagged: tooFast(tokens.length, elapsedMs, MAX_HUMAN_MOVES_PER_SECOND),
      detail: result === 0 ? "Gave up" : result === 2 ? "The computer won" : result === 3 ? "Draw" : undefined,
    };
  },
  pvp: {
    replay(seed, moves) {
      const s = replayDrafts(seed, moves);
      return s && pvpStateOf(s);
    },
    maxMoveLength: PVP_MAX_MOVE_LENGTH,
  },
};
