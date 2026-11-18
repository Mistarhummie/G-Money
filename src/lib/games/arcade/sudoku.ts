import { mulberry32, randInt, tooFast } from "./rng";
import { invalid, type ArcadeGame } from "./types";

/**
 * Sudoku. A full grid is built from the seed (backtracking with seeded digit order), then clues
 * are removed in a seeded order, keeping each removal only if the puzzle still has exactly one
 * solution. The stage sets how many clues remain (fewer clues = harder). If uniqueness stops the
 * removal before the target, the puzzle keeps the lowest clue count reached.
 *
 * Input is the list of cell entries "r c d" separated by ";" (row, column 0-8, digit 1-9, 0 clears).
 * The server replays them: givens may not be changed, and the final grid must equal the solution.
 */

export type Grid = number[]; // 81 cells, row-major, 0 = empty

export const STAGES = [
  { clues: 40, name: "Easy", goal: "Solve the Easy puzzle (40 clues)" },
  { clues: 33, name: "Medium", goal: "Solve the Medium puzzle (33 clues)" },
  { clues: 28, name: "Hard", goal: "Solve the Hard puzzle (28 clues)" },
  { clues: 24, name: "Expert", goal: "Solve the Expert puzzle (as few as 24 clues)" },
];

export const stageConfig = (stage: number) => STAGES[Math.min(Math.max(stage, 1), STAGES.length) - 1];

export const rowOf = (i: number) => Math.floor(i / 9);
export const colOf = (i: number) => i % 9;
export const boxOf = (i: number) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);

/** The 20 cells that share a row, column or box with each cell. */
export const PEERS: number[][] = Array.from({ length: 81 }, (_, i) => {
  const out: number[] = [];
  for (let j = 0; j < 81; j++) {
    if (j !== i && (rowOf(j) === rowOf(i) || colOf(j) === colOf(i) || boxOf(j) === boxOf(i))) out.push(j);
  }
  return out;
});

const ALL = 0x3fe; // bits 1..9

function popcount(x: number): number {
  let n = 0;
  while (x) {
    x &= x - 1;
    n++;
  }
  return n;
}

/**
 * Counts solutions up to `limit` with bitmask backtracking (most constrained cell first).
 * When `order` is given, digits are tried in that order and the first solution is written to `out`.
 */
function solve(grid: Grid, limit: number, order?: number[], out?: Grid): number {
  const g = grid.slice();
  const rows = new Array(9).fill(0);
  const cols = new Array(9).fill(0);
  const boxes = new Array(9).fill(0);
  for (let i = 0; i < 81; i++) {
    const d = g[i];
    if (!d) continue;
    const bit = 1 << d;
    if (rows[rowOf(i)] & bit || cols[colOf(i)] & bit || boxes[boxOf(i)] & bit) return 0;
    rows[rowOf(i)] |= bit;
    cols[colOf(i)] |= bit;
    boxes[boxOf(i)] |= bit;
  }
  let count = 0;
  const digits = order ?? [1, 2, 3, 4, 5, 6, 7, 8, 9];

  const search = (): boolean => {
    // Most constrained empty cell.
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const mask = ALL & ~(rows[rowOf(i)] | cols[colOf(i)] | boxes[boxOf(i)]);
      const n = popcount(mask);
      if (n < bestCount) {
        best = i;
        bestMask = mask;
        bestCount = n;
        if (n <= 1) break;
      }
    }
    if (best < 0) {
      count++;
      if (out && count === 1) for (let i = 0; i < 81; i++) out[i] = g[i];
      return count >= limit;
    }
    if (!bestMask) return false;
    const [r, c, b] = [rowOf(best), colOf(best), boxOf(best)];
    for (const d of digits) {
      const bit = 1 << d;
      if (!(bestMask & bit)) continue;
      g[best] = d;
      rows[r] |= bit;
      cols[c] |= bit;
      boxes[b] |= bit;
      const stop = search();
      g[best] = 0;
      rows[r] &= ~bit;
      cols[c] &= ~bit;
      boxes[b] &= ~bit;
      if (stop) return true;
    }
    return false;
  };

  search();
  return count;
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(rand, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export type Puzzle = { givens: Grid; solution: Grid };

const cache = new Map<string, Puzzle>();

/** The puzzle for a seed and stage (deterministic). */
export function puzzleFromSeed(seed: number, stage: number): Puzzle {
  const { clues } = stageConfig(stage);
  const key = `${seed >>> 0}:${clues}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const rand = mulberry32(seed);
  const solution: Grid = new Array(81).fill(0);
  solve(new Array(81).fill(0), 1, shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rand), solution);

  const givens = solution.slice();
  let count = 81;
  const order = shuffle(Array.from({ length: 81 }, (_, i) => i), rand);
  for (const i of order) {
    if (count <= clues) break;
    const keep = givens[i];
    givens[i] = 0;
    if (solve(givens, 2) === 1) count--;
    else givens[i] = keep;
  }

  const puzzle = { givens, solution };
  if (cache.size > 50) cache.clear();
  cache.set(key, puzzle);
  return puzzle;
}

export type Entry = [row: number, col: number, digit: number];

/** "r c d;r c d" -> entries, or null if malformed. */
export function parseEntries(input: string): Entry[] | null {
  const text = input.trim();
  if (!text) return [];
  const out: Entry[] = [];
  for (const part of text.split(";")) {
    const m = /^\s*([0-8])\s+([0-8])\s+([0-9])\s*$/.exec(part);
    if (!m) return null;
    out.push([Number(m[1]), Number(m[2]), Number(m[3])]);
  }
  return out;
}

export const formatEntries = (entries: Entry[]) => entries.map((e) => e.join(" ")).join(";");

/** Cells whose digit clashes with another cell in the same row, column or box. */
export function conflicts(grid: Grid): Set<number> {
  const bad = new Set<number>();
  for (let i = 0; i < 81; i++) {
    if (grid[i] && PEERS[i].some((j) => grid[j] === grid[i])) bad.add(i);
  }
  return bad;
}

export const isSolvedGrid = (grid: Grid, solution: Grid) => grid.every((v, i) => v === solution[i]);

export const MAX_ENTRIES = 2000;
export const MAX_HUMAN_ENTRIES_PER_SECOND = 3;

export const sudoku: ArcadeGame = {
  key: "sudoku",
  name: "Sudoku",
  tagline: "Fill the grid, against the clock.",
  howToPlay:
    "Fill every row, column and 3×3 box with the digits 1 to 9, each exactly once. Tap a cell, then a number; the fastest correct solve wins.",
  kind: "solo",
  ranking: "time",
  scoreLabel: "moves",
  stages: STAGES.map(({ name, goal }) => ({ name, goal })),
  timeLimitMs: 60 * 60 * 1000,
  verify({ seed, stage, input, elapsedMs }) {
    if (input.length > MAX_ENTRIES * 7) return invalid("Too many entries");
    const entries = parseEntries(input);
    if (!entries) return invalid("Invalid entries");
    if (entries.length > MAX_ENTRIES) return invalid("Too many entries");
    const { givens, solution } = puzzleFromSeed(seed, stage);
    const grid = givens.slice();
    for (const [r, c, d] of entries) {
      const i = r * 9 + c;
      if (givens[i]) return invalid("Changed a given number");
      grid[i] = d;
    }
    const solved = isSolvedGrid(grid, solution);
    return {
      valid: true,
      cleared: solved,
      score: entries.length,
      flagged: tooFast(entries.length, elapsedMs, MAX_HUMAN_ENTRIES_PER_SECOND),
    };
  },
};
