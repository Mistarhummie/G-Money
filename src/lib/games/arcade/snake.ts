import { mulberry32, randInt, tooFast } from "./rng";
import { invalid, type ArcadeGame } from "./types";

/**
 * Snake on a 17×17 grid. The game runs in fixed ticks; each tick the snake moves one cell.
 * Input is the list of turns as "tick:dir" pairs plus the tick the game ended on,
 * e.g. "12:U,30:L|end:57". The server replays every tick from the seed.
 */

export type Dir = "U" | "D" | "L" | "R";

export const SIZE = 17;
const CELLS = SIZE * SIZE;
const VEC: Record<Dir, [number, number]> = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] };
const OPPOSITE: Record<Dir, Dir> = { U: "D", D: "U", L: "R", R: "L" };

// Wall layouts, "#" is a wall. Row 8 from the left edge to the middle stays open for the start.
const BORDER = ["#################", ...Array.from({ length: 15 }, () => "#...............#"), "#################"];
const BLOCKS = [
  "#################",
  "#...............#",
  "#...............#",
  "#..###.....###..#",
  "#...............#",
  "#.......#.......#",
  "#.......#.......#",
  "#...............#",
  "#...............#",
  "#...............#",
  "#.......#.......#",
  "#.......#.......#",
  "#...............#",
  "#..###.....###..#",
  "#...............#",
  "#...............#",
  "#################",
];
const MAZE = [
  "#################",
  "#...............#",
  "#..#####.#####..#",
  "#..#.........#..#",
  "#..#.........#..#",
  "#...............#",
  "#.####.....####.#",
  "#...............#",
  "#...............#",
  "#...............#",
  "#.####.....####.#",
  "#...............#",
  "#..#.........#..#",
  "#..#.........#..#",
  "#..#####.#####..#",
  "#...............#",
  "#################",
];
const PILLARS = [
  "#################",
  "#...............#",
  "#...............#",
  "#...............#",
  "#...##.....##...#",
  "#...##.....##...#",
  "#...............#",
  "#...............#",
  "#...............#",
  "#...............#",
  "#...............#",
  "#...##.....##...#",
  "#...##.....##...#",
  "#...............#",
  "#...............#",
  "#...............#",
  "#################",
];

export const STAGES = [
  { name: "Garden", goal: "Eat 10 food. The edges wrap around.", tickMs: 200, target: 10, layout: null },
  { name: "Walls", goal: "Eat 15 food without hitting the walls", tickMs: 160, target: 15, layout: BORDER },
  { name: "Blocks", goal: "Eat 20 food around the blocks", tickMs: 130, target: 20, layout: BLOCKS },
  { name: "Maze", goal: "Eat 25 food in the maze", tickMs: 110, target: 25, layout: MAZE },
  { name: "Lightning", goal: "Eat 30 food at lightning speed", tickMs: 75, target: 30, layout: PILLARS },
];

export const stageConfig = (stage: number) => STAGES[Math.min(Math.max(stage, 1), STAGES.length) - 1];

/** Longest game we replay: 30 minutes of ticks. */
export const MAX_MS = 30 * 60 * 1000;
/** Average turns per second above which a game is flagged. */
export const MAX_HUMAN_TURNS_PER_SECOND = 8;

export type SnakeState = {
  seed: number;
  wrap: boolean;
  walls: Uint8Array;
  /** Cell indexes, head first. */
  body: number[];
  occupied: Uint8Array;
  /** Direction of the next move. */
  dir: Dir;
  /** -1 when the board is full. */
  food: number;
  foodSpawned: number;
  eaten: number;
  alive: boolean;
};

/** A fresh RNG for the k-th food, derived from the seed so each spawn is independent of play speed. */
const rngFor = (seed: number, k: number) => mulberry32((seed ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0);

function placeFood(s: SnakeState) {
  const empty: number[] = [];
  for (let i = 0; i < CELLS; i++) if (!s.walls[i] && !s.occupied[i]) empty.push(i);
  s.food = empty.length ? empty[randInt(rngFor(s.seed, s.foodSpawned), empty.length)] : -1;
  s.foodSpawned++;
}

export function newGame(seed: number, stage: number): SnakeState {
  const { layout } = stageConfig(stage);
  const walls = new Uint8Array(CELLS);
  if (layout) for (let i = 0; i < CELLS; i++) walls[i] = layout[Math.floor(i / SIZE)][i % SIZE] === "#" ? 1 : 0;
  const row = 8;
  const body = [row * SIZE + 4, row * SIZE + 3, row * SIZE + 2];
  const occupied = new Uint8Array(CELLS);
  for (const b of body) occupied[b] = 1;
  const s: SnakeState = { seed, wrap: !layout, walls, body, occupied, dir: "R", food: -1, foodSpawned: 0, eaten: 0, alive: true };
  placeFood(s);
  return s;
}

export const cloneState = (s: SnakeState): SnakeState => ({ ...s, body: s.body.slice(), occupied: s.occupied.slice() });

/** Changes direction for the next move. Turning back on yourself or keeping the same direction does nothing. */
export function turn(s: SnakeState, dir: Dir): boolean {
  if (dir === s.dir || dir === OPPOSITE[s.dir]) return false;
  s.dir = dir;
  return true;
}

/** Moves the snake one cell (one tick). */
export function step(s: SnakeState) {
  if (!s.alive) return;
  const head = s.body[0];
  let r = Math.floor(head / SIZE) + VEC[s.dir][0];
  let c = (head % SIZE) + VEC[s.dir][1];
  if (s.wrap) {
    r = (r + SIZE) % SIZE;
    c = (c + SIZE) % SIZE;
  } else if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) {
    s.alive = false;
    return;
  }
  const next = r * SIZE + c;
  if (s.walls[next]) {
    s.alive = false;
    return;
  }
  const grow = next === s.food;
  // The tail moves out of the way first, so following your own tail is allowed.
  let tail = -1;
  if (!grow) {
    tail = s.body.pop()!;
    s.occupied[tail] = 0;
  }
  if (s.occupied[next]) {
    if (tail >= 0) {
      s.body.push(tail);
      s.occupied[tail] = 1;
    }
    s.alive = false;
    return;
  }
  s.body.unshift(next);
  s.occupied[next] = 1;
  if (grow) {
    s.eaten++;
    placeFood(s);
  }
}

/** 10 points per food, times the stage number. */
export const scoreFor = (eaten: number, stage: number) => eaten * 10 * Math.min(Math.max(stage, 1), STAGES.length);

export type Turn = { tick: number; dir: Dir };

/** Builds the input string the server replays. */
export const encodeInput = (turns: Turn[], end: number) => `${turns.map((t) => `${t.tick}:${t.dir}`).join(",")}|end:${end}`;

function parseInput(input: string, maxTicks: number): { turns: Turn[]; end: number } | string {
  const bar = input.indexOf("|");
  if (bar < 0) return "Invalid input";
  const endMatch = /^end:(\d{1,7})$/.exec(input.slice(bar + 1));
  if (!endMatch) return "Invalid input";
  const end = Number(endMatch[1]);
  if (end > maxTicks) return "Game too long";
  const turns: Turn[] = [];
  const body = input.slice(0, bar);
  if (body) {
    const parts = body.split(",");
    if (parts.length > end) return "Too many turns";
    let last = 0;
    for (const p of parts) {
      const m = /^(\d{1,7}):([UDLR])$/.exec(p);
      if (!m) return "Invalid input";
      const tick = Number(m[1]);
      if (tick <= last || tick > end) return "Turns out of order";
      last = tick;
      turns.push({ tick, dir: m[2] as Dir });
    }
  }
  return { turns, end };
}

export const snake: ArcadeGame = {
  key: "snake",
  name: "Snake",
  tagline: "Eat, grow, don't crash. Faster every stage.",
  howToPlay: "Swipe, use the arrow buttons or the arrow keys to steer. Eat the food to grow and score, and don't run into walls or yourself.",
  kind: "solo",
  ranking: "score",
  scoreLabel: "points",
  stages: STAGES.map(({ name, goal }) => ({ name, goal })),
  timeLimitMs: MAX_MS,
  verify({ seed, stage, input, elapsedMs }) {
    const { tickMs, target } = stageConfig(stage);
    if (input.length > 300_000) return invalid("Input too long");
    const parsed = parseInput(input, Math.floor(MAX_MS / tickMs));
    if (typeof parsed === "string") return invalid(parsed);
    const { turns, end } = parsed;
    if (end * tickMs > elapsedMs + 2000) return invalid("Played faster than real time");
    const s = newGame(seed, stage);
    let i = 0;
    for (let t = 1; t <= end; t++) {
      if (!s.alive) return invalid("Moves after the game ended");
      if (i < turns.length && turns[i].tick === t) turn(s, turns[i++].dir);
      step(s);
    }
    return {
      valid: true,
      cleared: s.eaten >= target,
      score: scoreFor(s.eaten, stage),
      flagged: tooFast(turns.length, elapsedMs, MAX_HUMAN_TURNS_PER_SECOND),
    };
  },
};
