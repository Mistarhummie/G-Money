/**
 * 15-puzzle (sliding tiles). Shared by the browser board and the server.
 * The server hands out a seed, the player sends back the list of moves, and the
 * server replays them: a result only counts if the moves really solve that board.
 */

export const SIZE = 4;
export type Board = number[]; // 16 cells, 0 is the gap
export type Move = "U" | "D" | "L" | "R"; // direction the gap moves

const DELTAS: Record<Move, [number, number]> = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] };
const OPPOSITE: Record<Move, Move> = { U: "D", D: "U", L: "R", R: "L" };

export function solvedBoard(): Board {
  return [...Array.from({ length: SIZE * SIZE - 1 }, (_, i) => i + 1), 0];
}

/** Small deterministic PRNG so the same seed always gives the same board. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function applyMove(board: Board, move: Move): Board | null {
  const gap = board.indexOf(0);
  const row = Math.floor(gap / SIZE);
  const col = gap % SIZE;
  const [dr, dc] = DELTAS[move];
  const r = row + dr;
  const c = col + dc;
  if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return null;
  const target = r * SIZE + c;
  const next = board.slice();
  next[gap] = next[target];
  next[target] = 0;
  return next;
}

/** The random walk of the gap used to shuffle the board for `seed`. Every board made this way is solvable. */
export function shufflePath(seed: number, shuffleMoves = 400): Move[] {
  const rand = mulberry32(seed);
  let board = solvedBoard();
  const path: Move[] = [];
  const all: Move[] = ["U", "D", "L", "R"];
  // Keep walking if the walk happens to land back on the solved board.
  while (path.length < shuffleMoves || isSolved(board)) {
    const last = path[path.length - 1];
    const options = all.filter((m) => !last || m !== OPPOSITE[last]);
    const move = options[Math.floor(rand() * options.length)];
    const next = applyMove(board, move);
    if (!next) continue;
    board = next;
    path.push(move);
  }
  return path;
}

export function boardFromSeed(seed: number): Board {
  let board = solvedBoard();
  for (const m of shufflePath(seed)) board = applyMove(board, m)!;
  return board;
}

/** Undoing the shuffle solves the board (used in tests; real players find their own way). */
export function inverse(path: Move[]): string {
  return [...path].reverse().map((m) => OPPOSITE[m]).join("");
}

export function isSolved(board: Board): boolean {
  return board.every((v, i) => (i === board.length - 1 ? v === 0 : v === i + 1));
}

/** The move that slides the tile at `index` into the gap, if that tile is next to the gap. */
export function moveForTile(board: Board, index: number): Move | null {
  const gap = board.indexOf(0);
  const gr = Math.floor(gap / SIZE);
  const gc = gap % SIZE;
  const tr = Math.floor(index / SIZE);
  const tc = index % SIZE;
  if (tr === gr && tc === gc + 1) return "R";
  if (tr === gr && tc === gc - 1) return "L";
  if (tc === gc && tr === gr + 1) return "D";
  if (tc === gc && tr === gr - 1) return "U";
  return null;
}

export const MAX_MOVES = 5000;

export type ReplayResult = { solved: boolean; moveCount: number; error?: string };

export function replay(seed: number, moves: string): ReplayResult {
  if (moves.length > MAX_MOVES) return { solved: false, moveCount: 0, error: "Too many moves" };
  if (!/^[UDLR]*$/.test(moves)) return { solved: false, moveCount: 0, error: "Invalid moves" };
  let board = boardFromSeed(seed);
  for (const m of moves) {
    const next = applyMove(board, m as Move);
    if (!next) return { solved: false, moveCount: moves.length, error: "Illegal move" };
    board = next;
  }
  return { solved: isSolved(board), moveCount: moves.length };
}

/** Faster than any person can click. Attempts above this are flagged for review. */
export const MAX_HUMAN_MOVES_PER_SECOND = 10;
