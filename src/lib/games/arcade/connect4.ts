import { mulberry32, randInt, tooFast } from "./rng";
import { invalid, type ArcadeGame } from "./types";

/**
 * Connect Four against the computer. 7 columns x 6 rows, the player (1) drops first, the computer is 2.
 * Input is the player's columns as digits 0-6, e.g. "3324"; the server replays the computer's replies.
 *
 * The board is a bitboard per side: each column takes 7 bits (6 cells + 1 guard bit), bit = col * 7 + row,
 * row 0 at the bottom.
 */

export const COLS = 7;
export const ROWS = 6;
const H = 7; // bits per column
const PLAYER = 1;
const COMPUTER = 2;

export const STAGES = [
  { depth: 1, mistakes: 0.4, name: "Beginner", goal: "Beat a computer that still makes mistakes" },
  { depth: 3, mistakes: 0, name: "Novice", goal: "Beat a computer that looks 3 moves ahead" },
  { depth: 5, mistakes: 0, name: "Club", goal: "Beat a computer that looks 5 moves ahead" },
  { depth: 7, mistakes: 0, name: "Strong", goal: "Beat a computer that looks 7 moves ahead" },
  { depth: 9, mistakes: 0, name: "Master", goal: "Beat a computer that looks 9 moves ahead" },
];

export const stageConfig = (stage: number) => STAGES[Math.min(Math.max(stage, 1), STAGES.length) - 1];

// ---- Bitboard ---------------------------------------------------------------------------------
// JS bitwise operators work on 32 bits, so each side's 49-bit board is kept as two 32-bit words:
// `lo` holds columns 0-3 (bits 0-27) and `hi` holds columns 4-6 (bits 0-20).

type Bits = { lo: number; hi: number };

const has = (b: Bits, col: number, row: number) =>
  col < 4 ? (b.lo >>> (col * H + row)) & 1 : (b.hi >>> ((col - 4) * H + row)) & 1;

function set(b: Bits, col: number, row: number): void {
  if (col < 4) b.lo |= 1 << (col * H + row);
  else b.hi |= 1 << ((col - 4) * H + row);
}

function clear(b: Bits, col: number, row: number): void {
  if (col < 4) b.lo &= ~(1 << (col * H + row));
  else b.hi &= ~(1 << ((col - 4) * H + row));
}

const DIRS: [number, number][] = [[1, 0], [0, 1], [1, 1], [1, -1]];

/** Length of the run through (col, row) in direction (dc, dr), counting both ways. */
function run(b: Bits, col: number, row: number, dc: number, dr: number): number {
  let n = 1;
  for (let c = col + dc, r = row + dr; c >= 0 && c < COLS && r >= 0 && r < ROWS && has(b, c, r); c += dc, r += dr) n++;
  for (let c = col - dc, r = row - dr; c >= 0 && c < COLS && r >= 0 && r < ROWS && has(b, c, r); c -= dc, r -= dr) n++;
  return n;
}

/** True when the disc just placed at (col, row) completes four in a row. */
function wins(b: Bits, col: number, row: number): boolean {
  for (const [dc, dr] of DIRS) if (run(b, col, row, dc, dr) >= 4) return true;
  return false;
}

// ---- Game state -------------------------------------------------------------------------------

export type C4State = {
  /** Bitboards of each side's discs: index 1 = player, 2 = computer (0 unused). */
  bits: [Bits, Bits, Bits];
  heights: number[];
  /** Columns played so far, both sides in turn. */
  history: number[];
  turn: 1 | 2;
  /** 0 while playing, 1 player won, 2 computer won, 3 draw. */
  result: 0 | 1 | 2 | 3;
  stage: number;
  rand: () => number;
};

const empty = (): Bits => ({ lo: 0, hi: 0 });

export function newGame(seed: number, stage: number): C4State {
  return { bits: [empty(), empty(), empty()], heights: [0, 0, 0, 0, 0, 0, 0], history: [], turn: PLAYER, result: 0, stage, rand: mulberry32(seed) };
}

/** Disc at (col, row): 0 empty, 1 player, 2 computer. */
export function cellAt(s: C4State, col: number, row: number): 0 | 1 | 2 {
  if (has(s.bits[1], col, row)) return 1;
  if (has(s.bits[2], col, row)) return 2;
  return 0;
}

export const canPlay = (s: C4State, col: number) => s.result === 0 && Number.isInteger(col) && col >= 0 && col < COLS && s.heights[col] < ROWS;

/** Drop a disc for the side to move. Returns false if the column is full or the game is over. */
export function play(s: C4State, col: number): boolean {
  if (!canPlay(s, col)) return false;
  const side = s.turn;
  const row = s.heights[col]++;
  set(s.bits[side], col, row);
  s.history.push(col);
  if (wins(s.bits[side], col, row)) s.result = side;
  else if (s.history.length === COLS * ROWS) s.result = 3;
  s.turn = side === PLAYER ? COMPUTER : PLAYER;
  return true;
}

/** The four winning cells as [col, row] pairs, if someone has won. */
export function winningLine(s: C4State): [number, number][] | null {
  if (s.result !== 1 && s.result !== 2) return null;
  const side = s.result;
  for (let c = 0; c < COLS; c++)
    for (let r = 0; r < ROWS; r++)
      for (const [dc, dr] of DIRS) {
        const line: [number, number][] = [];
        for (let k = 0; k < 4; k++) {
          const cc = c + dc * k;
          const rr = r + dr * k;
          if (cc < 0 || cc >= COLS || rr < 0 || rr >= ROWS || cellAt(s, cc, rr) !== side) break;
          line.push([cc, rr]);
        }
        if (line.length === 4) return line;
      }
  return null;
}

// ---- Computer opponent: negamax with alpha-beta ------------------------------------------------

/** Every possible four-in-a-row window as a pair of masks [lo, hi] (69 of them). */
const WINDOWS: number[] = [];
for (let c = 0; c < COLS; c++)
  for (let r = 0; r < ROWS; r++)
    for (const [dc, dr] of DIRS) {
      if (c + dc * 3 >= COLS || r + dr * 3 < 0 || r + dr * 3 >= ROWS) continue;
      const w = empty();
      for (let k = 0; k < 4; k++) set(w, c + dc * k, r + dr * k);
      WINDOWS.push(w.lo, w.hi);
    }
const WINDOW_SCORE = [0, 1, 5, 50, 0];
const CENTER = empty();
for (let r = 0; r < ROWS; r++) set(CENTER, 3, r);
const ORDER = [3, 2, 4, 1, 5, 0, 6];
const WIN = 1_000_000;

/** Number of set bits in a 32-bit integer. */
function popcount(x: number): number {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return Math.imul(x, 0x01010101) >>> 24;
}

/** Static score for the side owning `me`: open windows and centre discs. */
function evaluate(me: Bits, them: Bits): number {
  let score = 0;
  for (let i = 0; i < WINDOWS.length; i += 2) {
    const a = popcount(me.lo & WINDOWS[i]) + popcount(me.hi & WINDOWS[i + 1]);
    const b = popcount(them.lo & WINDOWS[i]) + popcount(them.hi & WINDOWS[i + 1]);
    if (a && !b) score += WINDOW_SCORE[a];
    else if (b && !a) score -= WINDOW_SCORE[b];
  }
  return score + 3 * (popcount(me.lo & CENTER.lo) - popcount(them.lo & CENTER.lo));
}

type Search = { heights: number[]; filled: number };

/** Score of the position for `me` (to move), searching `depth` plies. */
function negamax(s: Search, me: Bits, them: Bits, depth: number, alpha: number, beta: number, ply: number): number {
  if (depth === 0) return evaluate(me, them);
  // Win now if we can.
  for (const col of ORDER) {
    const row = s.heights[col];
    if (row < ROWS) {
      set(me, col, row);
      const won = wins(me, col, row);
      clear(me, col, row);
      if (won) return WIN - ply;
    }
  }
  if (s.filled + 1 === COLS * ROWS) return 0;
  if (depth === 1) return evaluate(me, them);
  let best = -Infinity;
  for (const col of ORDER) {
    const row = s.heights[col];
    if (row >= ROWS) continue;
    set(me, col, row);
    s.heights[col]++;
    s.filled++;
    const score = -negamax(s, them, me, depth - 1, -beta, -alpha, ply + 1);
    s.heights[col]--;
    s.filled--;
    clear(me, col, row);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

/**
 * The computer's column for the current position. Deterministic for a given game: ties between
 * equally good columns and the beginner's mistakes come from the game's seeded RNG.
 */
export function computerMove(s: C4State): number {
  const { depth, mistakes } = stageConfig(s.stage);
  const legal = ORDER.filter((c) => s.heights[c] < ROWS);
  // The RNG is always drawn the same number of times per move, so browser and server stay in step.
  const roll = s.rand();
  const pick = legal[randInt(s.rand, legal.length)];
  if (roll < mistakes) return pick;
  // Seeded shuffle, then stable sort by distance from the centre: ties between mirror columns are random.
  const shuffled = legal.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = randInt(s.rand, i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const roots = shuffled
    .map((c, i) => ({ c, i }))
    .sort((a, b) => Math.abs(a.c - 3) - Math.abs(b.c - 3) || a.i - b.i)
    .map((x) => x.c);
  const me = { ...s.bits[s.turn] };
  const them = { ...s.bits[s.turn === PLAYER ? COMPUTER : PLAYER] };
  const search: Search = { heights: s.heights.slice(), filled: s.history.length };
  let bestCol = roots[0];
  let alpha = -Infinity;
  for (const col of roots) {
    const row = search.heights[col];
    set(me, col, row);
    let score: number;
    if (wins(me, col, row)) score = WIN;
    else if (search.filled + 1 === COLS * ROWS) score = 0;
    else {
      search.heights[col]++;
      search.filled++;
      score = -negamax(search, them, me, depth - 1, -Infinity, -alpha, 1);
      search.heights[col]--;
      search.filled--;
    }
    clear(me, col, row);
    if (score > alpha) {
      alpha = score;
      bestCol = col;
    }
  }
  return bestCol;
}

// ---- Verification -----------------------------------------------------------------------------

export const MAX_HUMAN_MOVES_PER_SECOND = 3;

/** Points for a finished game: wins in fewer moves earn a bigger bonus. */
export function scoreFor(stage: number, result: 0 | 1 | 2 | 3, playerMoves: number): number {
  if (result === 1) return stage * 1000 + Math.max(0, Math.min(999, Math.round(((22 - playerMoves) * 999) / 18)));
  if (result === 3) return stage * 100;
  return 0;
}

export const connect4: ArcadeGame = {
  key: "connect4",
  name: "Connect Four",
  tagline: "Get four in a row before the computer does.",
  howToPlay: "Tap a column to drop your disc; you and the computer take turns. Line up four of your discs across, up or diagonally to win.",
  kind: "versus",
  ranking: "score",
  scoreLabel: "points",
  stages: STAGES.map(({ name, goal }) => ({ name, goal })),
  timeLimitMs: 30 * 60 * 1000,
  verify({ seed, stage, input, elapsedMs }) {
    if (input.length > 21 || !/^[0-6]*$/.test(input)) return invalid("Invalid moves");
    const s = newGame(seed, stage);
    for (const ch of input) {
      if (s.result !== 0) return invalid("Moves after the game ended");
      if (!play(s, Number(ch))) return invalid("Illegal move");
      if (s.result === 0) play(s, computerMove(s));
    }
    // Stopping before the game is over counts as giving up (a loss).
    const result = s.result;
    return {
      valid: true,
      cleared: result === 1,
      score: scoreFor(stage, result, input.length),
      flagged: tooFast(input.length, elapsedMs, MAX_HUMAN_MOVES_PER_SECOND),
      detail: result === 0 ? "Gave up" : result === 2 ? "The computer won" : result === 3 ? "Draw" : undefined,
    };
  },
};
