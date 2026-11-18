import { mulberry32, tooFast } from "./rng";
import { invalid, type ArcadeGame } from "./types";

/**
 * Sliding tile puzzle. The board is shuffled by a random walk of the gap from the solved
 * position, so every board is solvable. Input is the list of gap moves (U, D, L, R).
 */

export type Move = "U" | "D" | "L" | "R";
export type Board = number[]; // size*size cells, 0 is the gap

const DELTAS: Record<Move, [number, number]> = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] };
const OPPOSITE: Record<Move, Move> = { U: "D", D: "U", L: "R", R: "L" };

export const STAGES = [
  { size: 3, seconds: 0, name: "3×3", goal: "Solve the 3×3 board" },
  { size: 3, seconds: 45, name: "3×3 sprint", goal: "Solve the 3×3 board in 45 seconds" },
  { size: 4, seconds: 0, name: "4×4", goal: "Solve the 4×4 board" },
  { size: 4, seconds: 150, name: "4×4 sprint", goal: "Solve the 4×4 board in 2½ minutes" },
  { size: 5, seconds: 0, name: "5×5", goal: "Solve the 5×5 board" },
];

export const stageConfig = (stage: number) => STAGES[Math.min(Math.max(stage, 1), STAGES.length) - 1];

export function solvedBoard(size: number): Board {
  return [...Array.from({ length: size * size - 1 }, (_, i) => i + 1), 0];
}

export function isSolved(board: Board): boolean {
  return board.every((v, i) => (i === board.length - 1 ? v === 0 : v === i + 1));
}

export function applyMove(board: Board, size: number, move: Move): Board | null {
  const gap = board.indexOf(0);
  const r = Math.floor(gap / size) + DELTAS[move][0];
  const c = (gap % size) + DELTAS[move][1];
  if (r < 0 || r >= size || c < 0 || c >= size) return null;
  const target = r * size + c;
  const next = board.slice();
  next[gap] = next[target];
  next[target] = 0;
  return next;
}

export function shufflePath(seed: number, size: number): Move[] {
  const rand = mulberry32(seed);
  const steps = size * size * 25;
  let board = solvedBoard(size);
  const path: Move[] = [];
  const all: Move[] = ["U", "D", "L", "R"];
  while (path.length < steps || isSolved(board)) {
    const last = path[path.length - 1];
    const options = all.filter((m) => !last || m !== OPPOSITE[last]);
    const move = options[Math.floor(rand() * options.length)];
    const next = applyMove(board, size, move);
    if (!next) continue;
    board = next;
    path.push(move);
  }
  return path;
}

export function boardFromSeed(seed: number, size: number): Board {
  let board = solvedBoard(size);
  for (const m of shufflePath(seed, size)) board = applyMove(board, size, m)!;
  return board;
}

/** Undoing the shuffle solves the board (used in tests; players find their own way). */
export function inverse(path: Move[]): string {
  return [...path].reverse().map((m) => OPPOSITE[m]).join("");
}

/** The move that slides the tile at `index` into the gap, if it is next to the gap. */
export function moveForTile(board: Board, size: number, index: number): Move | null {
  const gap = board.indexOf(0);
  const [gr, gc, tr, tc] = [Math.floor(gap / size), gap % size, Math.floor(index / size), index % size];
  if (tr === gr && tc === gc + 1) return "R";
  if (tr === gr && tc === gc - 1) return "L";
  if (tc === gc && tr === gr + 1) return "D";
  if (tc === gc && tr === gr - 1) return "U";
  return null;
}

export const MAX_HUMAN_MOVES_PER_SECOND = 10;

export const slide: ArcadeGame = {
  key: "slide",
  name: "Sliding Puzzle",
  tagline: "Slide the tiles back into order, fast.",
  howToPlay: "Tap a tile next to the gap to slide it. Put the numbers in order with the gap in the bottom-right corner.",
  kind: "solo",
  ranking: "time",
  scoreLabel: "moves",
  stages: STAGES.map(({ name, goal }) => ({ name, goal })),
  timeLimitMs: 15 * 60 * 1000,
  verify({ seed, stage, input, elapsedMs }) {
    const { size, seconds } = stageConfig(stage);
    if (input.length > 20000 || !/^[UDLR]*$/.test(input)) return invalid("Invalid moves");
    let board = boardFromSeed(seed, size);
    for (const m of input) {
      const next = applyMove(board, size, m as Move);
      if (!next) return invalid("Illegal move");
      board = next;
    }
    const solved = isSolved(board);
    const inTime = !seconds || elapsedMs <= seconds * 1000;
    return {
      valid: true,
      cleared: solved && inTime,
      score: input.length,
      flagged: solved && tooFast(input.length, elapsedMs, MAX_HUMAN_MOVES_PER_SECOND),
      detail: solved && !inTime ? "Solved, but over the time limit" : undefined,
    };
  },
};
