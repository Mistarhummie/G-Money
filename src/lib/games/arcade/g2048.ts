import { mulberry32, randInt, tooFast } from "./rng";
import { invalid, type ArcadeGame } from "./types";

/**
 * 2048 on a 4×4 board. Each new tile (a 2, or a 4 one time in ten) lands on an empty cell
 * chosen by an RNG derived from the seed and the spawn number. Input is the list of moves
 * (U, D, L, R); a move that changes nothing is not allowed.
 */

export type Dir = "U" | "D" | "L" | "R";
export type Board = number[]; // 16 cells, row by row, 0 is empty

export type State = { board: Board; score: number; spawns: number };

export const STAGES = [
  { name: "512", goal: "Make a 512 tile", target: 512 },
  { name: "1024", goal: "Make a 1024 tile", target: 1024 },
  { name: "2048", goal: "Make a 2048 tile", target: 2048 },
  { name: "4096", goal: "Make a 4096 tile", target: 4096 },
];

export const stageConfig = (stage: number) => STAGES[Math.min(Math.max(stage, 1), STAGES.length) - 1];

export const MAX_MOVES = 20_000;
export const MAX_HUMAN_MOVES_PER_SECOND = 8;

/** Adds the k-th random tile. The board must have an empty cell. */
function spawn(seed: number, state: State): State {
  const rand = mulberry32((seed ^ Math.imul(state.spawns + 1, 0x9e3779b1)) >>> 0);
  const empty: number[] = [];
  state.board.forEach((v, i) => {
    if (!v) empty.push(i);
  });
  const board = state.board.slice();
  if (empty.length) board[empty[randInt(rand, empty.length)]] = rand() < 0.9 ? 2 : 4;
  return { board, score: state.score, spawns: state.spawns + 1 };
}

export function newGame(seed: number): State {
  return spawn(seed, spawn(seed, { board: Array(16).fill(0), score: 0, spawns: 0 }));
}

// For each direction, the four lines of cell indexes, each ordered from the side tiles slide toward.
const LINES: Record<Dir, number[][]> = {
  L: [0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => r * 4 + c)),
  R: [0, 1, 2, 3].map((r) => [3, 2, 1, 0].map((c) => r * 4 + c)),
  U: [0, 1, 2, 3].map((c) => [0, 1, 2, 3].map((r) => r * 4 + c)),
  D: [0, 1, 2, 3].map((c) => [3, 2, 1, 0].map((r) => r * 4 + c)),
};

/** Slides and merges without spawning. Returns null when nothing moves. */
export function slideBoard(board: Board, dir: Dir): { board: Board; gained: number } | null {
  const next = board.slice();
  let gained = 0;
  let moved = false;
  for (const line of LINES[dir]) {
    const tiles = line.map((i) => board[i]).filter((v) => v);
    const out: number[] = [];
    for (let k = 0; k < tiles.length; k++) {
      if (k + 1 < tiles.length && tiles[k] === tiles[k + 1]) {
        out.push(tiles[k] * 2);
        gained += tiles[k] * 2;
        k++;
      } else out.push(tiles[k]);
    }
    line.forEach((idx, k) => {
      const v = out[k] ?? 0;
      if (next[idx] !== v) moved = true;
      next[idx] = v;
    });
  }
  return moved ? { board: next, gained } : null;
}

/** Plays one move and spawns the next tile. Returns null when the move changes nothing. */
export function move(seed: number, state: State, dir: Dir): State | null {
  const res = slideBoard(state.board, dir);
  if (!res) return null;
  return spawn(seed, { board: res.board, score: state.score + res.gained, spawns: state.spawns });
}

export const canMove = (board: Board) => (["U", "D", "L", "R"] as Dir[]).some((d) => slideBoard(board, d) !== null);
export const maxTile = (board: Board) => Math.max(...board);

export const g2048: ArcadeGame = {
  key: "g2048",
  name: "2048",
  tagline: "Merge tiles to reach the target.",
  howToPlay: "Swipe or use the arrow keys to slide all tiles; two equal tiles that touch merge into one. Make the target tile, then keep going for a higher score.",
  kind: "solo",
  ranking: "score",
  scoreLabel: "points",
  stages: STAGES.map(({ name, goal }) => ({ name, goal })),
  timeLimitMs: 30 * 60 * 1000,
  verify({ seed, stage, input, elapsedMs }) {
    const { target } = stageConfig(stage);
    if (input.length > MAX_MOVES || !/^[UDLR]*$/.test(input)) return invalid("Invalid moves");
    let state = newGame(seed);
    for (const m of input) {
      const next = move(seed, state, m as Dir);
      if (!next) return invalid("Illegal move");
      state = next;
    }
    return {
      valid: true,
      cleared: maxTile(state.board) >= target,
      score: state.score,
      flagged: tooFast(input.length, elapsedMs, MAX_HUMAN_MOVES_PER_SECOND),
    };
  },
};
