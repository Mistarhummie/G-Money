import { mulberry32, randInt, tooFast } from "./rng";
import { invalid, type ArcadeGame } from "./types";

/**
 * Bao la Kujifunza, the learner's Bao of East Africa, simplified for quick play.
 *
 * Board: 4 rows of 8 pits. Each player owns the two rows nearest them (inner row "B" facing the
 * opponent, outer row "A" behind it); 2 seeds in every pit at the start (64 seeds). Like the
 * learner's game there is no nyumba (house) and no seeds-in-hand phase: every seed is on the board.
 *
 * A move: pick one of your pits with at least 2 seeds and a direction, and sow one seed per pit
 * around your own 16 pits (they form a loop). Where the last seed lands:
 *  - an empty pit: the move ends.
 *  - an occupied pit of your inner row whose facing opponent pit has seeds (in a capturing move):
 *    capture those seeds and sow them from an end (kichwa) of your inner row: from the left end going
 *    right if the capture was on the left half, otherwise from the right end going left. Sowing then
 *    continues in that direction.
 *  - any other occupied pit: pick up all its seeds and keep sowing (relay sowing).
 * As in the learner's rules, a move is a capturing move (mtaji) when its first lap ends in a capture,
 * and capturing is compulsory: if any capturing move exists you must play one. Otherwise you play a
 * non-capturing move (takasa), which relay-sows but never captures. This keeps the opening from being
 * decided by one giant chain of captures.
 * A player whose inner row is empty, or who has no pit with 2+ seeds, loses.
 *
 * Simplifications compared with the full tournament rules (Bao la Kiswahili): the kichwa is chosen by
 * which half the capture is on (the full game has extra kimbi/kichwa choices) and takasa moves have no
 * extra restrictions. A move that sows 1000 seeds is cut off there (it would loop forever), and a game
 * reaching 200 plies is a draw.
 *
 * Notation (from the mover's own side): row letter A = outer, B = inner; pit 1-8 counted from that
 * player's left; "+" clockwise, "-" anticlockwise. Clockwise runs left to right along your inner
 * row and right to left along your outer row. Example: "B3+" sows from your 3rd inner pit towards B4.
 * Input is the player's moves separated by spaces, e.g. "A5+ B3- B8+". The computer's replies are
 * replayed by the server, so they are not sent.
 */

/**
 * The board: 32 counts. Side s (0 = player, 1 = computer) owns indices s*16 .. s*16+15 in loop order:
 * k = 0..7 is the inner row B1..B8 (from that side's left), k = 8..15 is the outer row A8..A1.
 * Clockwise is k+1. Inner pit k faces the opponent's inner pit 7-k.
 */
export type Board = Uint8Array;
export type Move = { pit: number; dir: 1 | -1 }; // pit = k in 0..15
export type Side = 0 | 1;

export const STAGES = [
  { depth: 1, mistakes: 0.4, name: "Beginner", goal: "Beat a beginner who often slips up" },
  { depth: 2, mistakes: 0, name: "Novice", goal: "Beat the computer looking 2 moves ahead" },
  { depth: 3, mistakes: 0, name: "Club", goal: "Beat the computer looking 3 moves ahead" },
  { depth: 4, mistakes: 0, name: "Strong", goal: "Beat the computer looking 4 moves ahead" },
  { depth: 5, mistakes: 0, name: "Master", goal: "Beat the computer looking 5 moves ahead" },
];

export const stageConfig = (stage: number) => STAGES[Math.min(Math.max(stage, 1), STAGES.length) - 1];

export const MAX_SOWN_PER_MOVE = 1000;
export const MAX_PLIES = 200;
const WIN = 10000;

export function startBoard(): Board {
  return new Uint8Array(32).fill(2);
}

/** Pit index k (0..15) for "A5"/"B3" style names, from the owner's view. */
export const pitIndex = (row: "A" | "B", n: number) => (row === "B" ? n - 1 : 16 - n);
export const pitName = (k: number) => (k < 8 ? `B${k + 1}` : `A${16 - k}`);

export const moveToString = (m: Move) => `${pitName(m.pit)}${m.dir === 1 ? "+" : "-"}`;

export function parseMove(token: string): Move | null {
  const m = /^([AB])([1-8])([+-])$/.exec(token);
  if (!m) return null;
  return { pit: pitIndex(m[1] as "A" | "B", Number(m[2])), dir: m[3] === "+" ? 1 : -1 };
}

export function seedsOf(board: Board, side: Side): number {
  let n = 0;
  for (let k = 0; k < 16; k++) n += board[side * 16 + k];
  return n;
}

function innerEmpty(board: Board, side: Side): boolean {
  const base = side * 16;
  for (let k = 0; k < 8; k++) if (board[base + k]) return false;
  return true;
}

/** True if the first lap of this move ends in a capture (that makes it a capturing move). */
export function startsWithCapture(board: Board, side: Side, m: Move): boolean {
  const base = side * 16;
  const n = board[base + m.pit];
  const land = (((m.pit + m.dir * n) % 16) + 16) % 16;
  if (land >= 8) return false;
  // Seeds in the landing pit after the lap: what was there, plus one per pass (the start pit is emptied first).
  const passes = Math.floor((n - 1) / 16) + 1;
  const before = land === m.pit ? 0 : board[base + land];
  return before + passes >= 2 && board[(1 - side) * 16 + 7 - land] > 0;
}

/**
 * Legal moves for `side`, in a fixed order (pit 0..15, clockwise first). Capturing is compulsory:
 * if any move starts with a capture, only those moves are legal.
 */
export function legalMoves(board: Board, side: Side): Move[] {
  const all: Move[] = [];
  if (innerEmpty(board, side)) return all;
  const base = side * 16;
  for (let k = 0; k < 16; k++) {
    if (board[base + k] >= 2) {
      all.push({ pit: k, dir: 1 });
      all.push({ pit: k, dir: -1 });
    }
  }
  const captures = all.filter((m) => startsWithCapture(board, side, m));
  return captures.length ? captures : all;
}

export const isLegal = (board: Board, side: Side, m: Move) =>
  legalMoves(board, side).some((l) => l.pit === m.pit && l.dir === m.dir);

/** Plays a move for `side` and returns the new board (the input board is not changed). */
export function applyMove(board: Board, side: Side, m: Move): Board {
  const b = board.slice();
  const base = side * 16;
  const opp = (1 - side) * 16;
  let dir: number = m.dir;
  let pos = m.pit;
  let hand = b[base + pos];
  b[base + pos] = 0;
  let sown = 0;
  const capturing = startsWithCapture(board, side, m);
  for (;;) {
    while (hand > 0) {
      pos = (pos + dir + 16) % 16;
      b[base + pos]++;
      hand--;
      sown++;
    }
    if (sown >= MAX_SOWN_PER_MOVE) break;
    if (b[base + pos] === 1) break; // landed in an empty pit
    const facing = opp + 7 - pos;
    if (capturing && pos < 8 && b[facing] > 0) {
      // Capture: sow the opponent's seeds from the kichwa on the capture's side.
      hand = b[facing];
      b[facing] = 0;
      if (pos < 4) {
        dir = 1;
        pos = 15; // next pit is 0 (B1)
      } else {
        dir = -1;
        pos = 8; // next pit is 7 (B8)
      }
    } else {
      // Relay sowing: lift the pit and carry on.
      hand = b[base + pos];
      b[base + pos] = 0;
    }
  }
  return b;
}

/** Static score for `side`: seed difference. */
const evaluate = (board: Board, side: Side) => seedsOf(board, side) - seedsOf(board, (1 - side) as Side);

function negamax(board: Board, side: Side, depth: number, alpha: number, beta: number): number {
  const moves = legalMoves(board, side);
  if (!moves.length) return -WIN - depth; // losing sooner is worse
  if (depth === 0) return evaluate(board, side);
  const other = (1 - side) as Side;
  // Order children by their immediate result to prune more.
  const children = moves.map((m) => applyMove(board, side, m));
  const keys = children.map((c) => evaluate(c, side));
  const idx = keys.map((_, i) => i).sort((a, b) => keys[b] - keys[a] || a - b);
  let best = -Infinity;
  for (const i of idx) {
    const v = -negamax(children[i], other, depth - 1, -beta, -alpha);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

/**
 * The computer's choice for `side` at this stage. `rand` is the seeded RNG for the game; it is used
 * for tie-breaks (move order is shuffled first) and, at stage 1, for occasional random slips.
 */
export function computerMove(board: Board, side: Side, stage: number, rand: () => number): Move | null {
  const { depth, mistakes } = stageConfig(stage);
  const moves = legalMoves(board, side);
  if (!moves.length) return null;
  for (let i = moves.length - 1; i > 0; i--) {
    const j = randInt(rand, i + 1);
    [moves[i], moves[j]] = [moves[j], moves[i]];
  }
  const slip = rand() < mistakes;
  if (slip) return moves[0];
  const other = (1 - side) as Side;
  const children = moves.map((m) => applyMove(board, side, m));
  const keys = children.map((c) => evaluate(c, side));
  const idx = keys.map((_, i) => i).sort((a, b) => keys[b] - keys[a] || a - b);
  let best = idx[0];
  let alpha = -Infinity;
  for (const i of idx) {
    // Strictly-better only, so ties keep the earlier (shuffled) move.
    const v = -negamax(children[i], other, depth - 1, -Infinity, -alpha);
    if (v > alpha) {
      alpha = v;
      best = i;
    }
  }
  return moves[best];
}

export type Result = "win" | "loss" | "draw" | null; // from the player's view; null = still playing

/** Full game state, replayed the same way in the browser and on the server. */
export type Game = {
  board: Board;
  turn: Side;
  plies: number;
  playerMoves: number;
  result: Result;
  rand: () => number;
  lastComputerMove: Move | null;
};

export function newGame(seed: number): Game {
  return { board: startBoard(), turn: 0, plies: 0, playerMoves: 0, result: null, rand: mulberry32(seed ^ 0x6ba0), lastComputerMove: null };
}

/** Sets `result` if the side to move cannot move, or the ply cap is reached. */
function settle(g: Game) {
  if (!legalMoves(g.board, g.turn).length) g.result = g.turn === 0 ? "loss" : "win";
  else if (g.plies >= MAX_PLIES) g.result = "draw";
}

/** Plays the player's move (returns false if illegal). The computer's reply is a separate step. */
export function playerStep(g: Game, m: Move): boolean {
  if (g.result || g.turn !== 0 || !isLegal(g.board, 0, m)) return false;
  g.board = applyMove(g.board, 0, m);
  g.turn = 1;
  g.plies++;
  g.playerMoves++;
  settle(g);
  return true;
}

export function computerStep(g: Game, stage: number) {
  if (g.result || g.turn !== 1) return;
  const m = computerMove(g.board, 1, stage, g.rand)!;
  g.board = applyMove(g.board, 1, m);
  g.lastComputerMove = m;
  g.turn = 0;
  g.plies++;
  settle(g);
}

/**
 * Replays the player's moves from the start (the computer replies after each one). With
 * `awaitingReply`, the computer's reply to the last move is not played yet (the browser adds a short pause).
 * Returns null if a move is illegal or comes after the end of the game.
 */
export function replay(seed: number, stage: number, moves: Move[], awaitingReply = false): Game | null {
  const g = newGame(seed);
  for (let i = 0; i < moves.length; i++) {
    if (g.result || !playerStep(g, moves[i])) return null;
    if (!(awaitingReply && i === moves.length - 1)) computerStep(g, stage);
  }
  return g;
}

export const MAX_HUMAN_MOVES_PER_SECOND = 2;

export function scoreFor(result: Result, stage: number, playerMoves: number): number {
  if (result === "win") return stage * 1000 + Math.max(0, Math.min(999, 999 - 10 * playerMoves));
  if (result === "draw") return stage * 100;
  return 0;
}

export const bao: ArcadeGame = {
  key: "bao",
  name: "Bao",
  tagline: "The East African seed-sowing board game.",
  howToPlay:
    "Tap one of your pits with 2+ seeds, then a direction, to sow around your two rows: landing in an occupied pit means you keep sowing, and a move whose first lap ends in your front row opposite enemy seeds captures them (you must capture when you can). Win by emptying the computer's front row or leaving it with no move.",
  kind: "versus",
  ranking: "score",
  scoreLabel: "points",
  stages: STAGES.map(({ name, goal }) => ({ name, goal })),
  timeLimitMs: 30 * 60 * 1000,
  verify({ seed, stage, input, elapsedMs }) {
    if (input.length > 600) return invalid("Too many moves");
    const tokens = input.trim() ? input.trim().split(/\s+/) : [];
    if (tokens.length > MAX_PLIES / 2) return invalid("Too many moves");
    const moves: Move[] = [];
    for (const t of tokens) {
      const m = parseMove(t);
      if (!m) return invalid("Invalid move");
      moves.push(m);
    }
    const g = replay(seed, stage, moves);
    if (!g) return invalid("Illegal move");
    // Stopping before the end is giving up: a loss.
    const result: Result = g.result ?? "loss";
    return {
      valid: true,
      cleared: result === "win",
      score: scoreFor(result, stage, g.playerMoves),
      flagged: tooFast(g.playerMoves, elapsedMs, MAX_HUMAN_MOVES_PER_SECOND),
      detail: g.result ? undefined : "Gave up",
    };
  },
};
