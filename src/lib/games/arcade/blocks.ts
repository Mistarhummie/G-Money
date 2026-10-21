import { mulberry32, randInt, tooFast } from "./rng";
import { invalid, type ArcadeGame } from "./types";

/**
 * Falling-block stacker on a 10×20 board. Pieces come from a seeded 7-bag. The game runs in
 * fixed 16 ms ticks. Input is the player's actions as "tick:action" pairs (L, R, C rotate,
 * S soft drop one row, H hard drop) plus the tick the game ended on, e.g. "5:L,9:C|end:300".
 */

export type Action = "L" | "R" | "C" | "S" | "H";

export const W = 10;
export const H = 20;
export const TICK_MS = 16;
/** Ticks a piece may rest on the stack before it locks. */
export const LOCK_TICKS = 30;
export const PIECE_NAMES = ["I", "O", "T", "S", "Z", "J", "L"] as const;

// Each piece at rotation 0 as [row, col] cells inside an n×n box.
const SHAPES: { n: number; cells: [number, number][] }[] = [
  { n: 4, cells: [[1, 0], [1, 1], [1, 2], [1, 3]] }, // I
  { n: 2, cells: [[0, 0], [0, 1], [1, 0], [1, 1]] }, // O
  { n: 3, cells: [[0, 1], [1, 0], [1, 1], [1, 2]] }, // T
  { n: 3, cells: [[0, 1], [0, 2], [1, 0], [1, 1]] }, // S
  { n: 3, cells: [[0, 0], [0, 1], [1, 1], [1, 2]] }, // Z
  { n: 3, cells: [[0, 0], [1, 0], [1, 1], [1, 2]] }, // J
  { n: 3, cells: [[0, 2], [1, 0], [1, 1], [1, 2]] }, // L
];

/** CELLS[type][rot] = cells after rotating clockwise rot times. */
export const CELLS: [number, number][][][] = SHAPES.map(({ n, cells }) => {
  const rots = [cells];
  for (let k = 1; k < 4; k++) rots.push(rots[k - 1].map(([r, c]) => [c, n - 1 - r] as [number, number]));
  return rots;
});

const KICKS: [number, number][] = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1]];
const LINE_POINTS = [0, 100, 300, 500, 800];

export const STAGES = [
  { name: "Level 1", goal: "Clear 10 lines", gravity: 40, target: 10 },
  { name: "Level 2", goal: "Clear 15 lines", gravity: 28, target: 15 },
  { name: "Level 3", goal: "Clear 20 lines", gravity: 18, target: 20 },
  { name: "Level 4", goal: "Clear 25 lines", gravity: 10, target: 25 },
  { name: "Level 5", goal: "Clear 30 lines at top speed", gravity: 5, target: 30 },
];

export const stageConfig = (stage: number) => STAGES[Math.min(Math.max(stage, 1), STAGES.length) - 1];
const stageNumber = (stage: number) => Math.min(Math.max(stage, 1), STAGES.length);

export const MAX_MS = 30 * 60 * 1000;
export const MAX_TICKS = Math.floor(MAX_MS / TICK_MS);
export const MAX_ACTIONS = 40_000;
/** Average actions per second above which a game is flagged. */
export const MAX_HUMAN_ACTIONS_PER_SECOND = 12;

export type Piece = { type: number; rot: number; x: number; y: number };

export type BlocksState = {
  seed: number;
  stage: number;
  gravity: number;
  /** W*H cells, 0 empty or piece type + 1. Row 0 is the top. */
  board: Uint8Array;
  piece: Piece;
  queue: number[];
  bags: number;
  fall: number;
  lock: number;
  lines: number;
  score: number;
  alive: boolean;
};

/** Each bag is shuffled with its own RNG derived from the seed. */
function fillBag(s: BlocksState) {
  const rand = mulberry32((s.seed ^ Math.imul(s.bags + 1, 0x9e3779b1)) >>> 0);
  s.bags++;
  const bag = [0, 1, 2, 3, 4, 5, 6];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = randInt(rand, i + 1);
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  s.queue.push(...bag);
}

export function fits(board: Uint8Array, type: number, rot: number, x: number, y: number): boolean {
  for (const [r, c] of CELLS[type][rot]) {
    const row = y + r;
    const col = x + c;
    if (col < 0 || col >= W || row < 0 || row >= H || board[row * W + col]) return false;
  }
  return true;
}

function spawn(s: BlocksState) {
  if (s.queue.length < 2) fillBag(s);
  const type = s.queue.shift()!;
  s.piece = { type, rot: 0, x: type === 1 ? 4 : 3, y: 0 };
  s.fall = 0;
  s.lock = 0;
  if (!fits(s.board, type, 0, s.piece.x, 0)) s.alive = false;
}

export function newGame(seed: number, stage: number): BlocksState {
  const s: BlocksState = {
    seed,
    stage: stageNumber(stage),
    gravity: stageConfig(stage).gravity,
    board: new Uint8Array(W * H),
    piece: { type: 0, rot: 0, x: 0, y: 0 },
    queue: [],
    bags: 0,
    fall: 0,
    lock: 0,
    lines: 0,
    score: 0,
    alive: true,
  };
  spawn(s);
  return s;
}

/** The next piece to come. */
export const nextPiece = (s: BlocksState) => s.queue[0];

/** Row the current piece would land on (for the ghost and the hard drop). */
export function dropRow(s: BlocksState): number {
  const { type, rot, x } = s.piece;
  let y = s.piece.y;
  while (fits(s.board, type, rot, x, y + 1)) y++;
  return y;
}

function lockPiece(s: BlocksState) {
  const { type, rot, x, y } = s.piece;
  for (const [r, c] of CELLS[type][rot]) s.board[(y + r) * W + x + c] = type + 1;
  let cleared = 0;
  for (let row = H - 1; row >= 0; row--) {
    let full = true;
    for (let col = 0; col < W; col++) if (!s.board[row * W + col]) full = false;
    if (!full) continue;
    s.board.copyWithin(W, 0, row * W);
    s.board.fill(0, 0, W);
    cleared++;
    row++; // check the same row again, it now holds the row above
  }
  s.lines += cleared;
  s.score += LINE_POINTS[cleared] * s.stage;
  spawn(s);
}

/** Applies one player action. Returns false when it changed nothing. */
export function act(s: BlocksState, a: Action): boolean {
  if (!s.alive) return false;
  const p = s.piece;
  switch (a) {
    case "L":
    case "R": {
      const x = p.x + (a === "L" ? -1 : 1);
      if (!fits(s.board, p.type, p.rot, x, p.y)) return false;
      p.x = x;
      return true;
    }
    case "C": {
      const rot = (p.rot + 1) % 4;
      for (const [dx, dy] of KICKS) {
        if (fits(s.board, p.type, rot, p.x + dx, p.y + dy)) {
          p.rot = rot;
          p.x += dx;
          p.y += dy;
          return true;
        }
      }
      return false;
    }
    case "S":
      if (!fits(s.board, p.type, p.rot, p.x, p.y + 1)) return false;
      p.y++;
      s.fall = 0;
      s.score += 1;
      return true;
    case "H": {
      const y = dropRow(s);
      s.score += 2 * (y - p.y);
      p.y = y;
      lockPiece(s);
      return true;
    }
  }
}

/** One tick of time: gravity, then locking once the piece has rested long enough. */
export function tick(s: BlocksState) {
  if (!s.alive) return;
  const p = s.piece;
  if (fits(s.board, p.type, p.rot, p.x, p.y + 1)) {
    s.lock = 0;
    if (++s.fall >= s.gravity) {
      s.fall = 0;
      p.y++;
    }
  } else if (++s.lock >= LOCK_TICKS) {
    lockPiece(s);
  }
}

export type TimedAction = { tick: number; a: Action };

export const encodeInput = (actions: TimedAction[], end: number) => `${actions.map((x) => `${x.tick}:${x.a}`).join(",")}|end:${end}`;

function parseInput(input: string): { actions: TimedAction[]; end: number } | string {
  const bar = input.indexOf("|");
  if (bar < 0) return "Invalid input";
  const endMatch = /^end:(\d{1,7})$/.exec(input.slice(bar + 1));
  if (!endMatch) return "Invalid input";
  const end = Number(endMatch[1]);
  if (end > MAX_TICKS) return "Game too long";
  const actions: TimedAction[] = [];
  const body = input.slice(0, bar);
  if (body) {
    const parts = body.split(",");
    if (parts.length > MAX_ACTIONS) return "Too many moves";
    let last = 1;
    for (const p of parts) {
      const m = /^(\d{1,7}):([LRCSH])$/.exec(p);
      if (!m) return "Invalid input";
      const t = Number(m[1]);
      if (t < last || t > end) return "Moves out of order";
      last = t;
      actions.push({ tick: t, a: m[2] as Action });
    }
  }
  return { actions, end };
}

export const blocks: ArcadeGame = {
  key: "blocks",
  name: "Block Stacker",
  tagline: "Clear lines as the blocks fall faster.",
  howToPlay: "Move and rotate the falling blocks to fill whole rows; full rows disappear and score points. Don't let the stack reach the top.",
  kind: "solo",
  ranking: "score",
  scoreLabel: "points",
  stages: STAGES.map(({ name, goal }) => ({ name, goal })),
  timeLimitMs: MAX_MS,
  verify({ seed, stage, input, elapsedMs }) {
    const { target } = stageConfig(stage);
    if (input.length > 450_000) return invalid("Input too long");
    const parsed = parseInput(input);
    if (typeof parsed === "string") return invalid(parsed);
    const { actions, end } = parsed;
    if (end * TICK_MS > elapsedMs + 2000) return invalid("Played faster than real time");
    const s = newGame(seed, stage);
    let i = 0;
    for (let t = 1; t <= end; t++) {
      if (!s.alive) return invalid("Moves after the game ended");
      while (i < actions.length && actions[i].tick === t) {
        if (!s.alive) return invalid("Moves after the game ended");
        act(s, actions[i++].a);
      }
      tick(s);
    }
    return {
      valid: true,
      cleared: s.lines >= target,
      score: s.score,
      flagged: tooFast(actions.length, elapsedMs, MAX_HUMAN_ACTIONS_PER_SECOND),
      detail: `${s.lines} lines`,
    };
  },
};
