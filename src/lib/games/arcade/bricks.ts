import { mulberry32 } from "./rng";
import { invalid, type ArcadeGame } from "./types";

/**
 * Brick Blitz: keep a ball in play with a paddle and break every brick. The ball speeds up the longer
 * you play. The field is 400 × 400 units and runs in fixed 16 ms ticks, each split into substeps so a
 * fast ball can't skip through a brick.
 *
 * Input is the paddle's target position and launches, as "tick:x" (x a whole number 0–400, where the
 * paddle heads) and "tick:L" (launch the ball), plus the tick the game ended on, e.g. "1:200,4:L,9:180|end:900".
 * The paddle glides towards its target at a capped speed, so a pointer, a finger or keys all play the same.
 *
 * Determinism: only + - * / and Math.sqrt, in a fixed order, so the browser and the server agree exactly.
 */

export const W = 400;
export const H = 400;
export const TICK_MS = 16;
const SUBSTEPS = 4;
export const BALL_R = 6;
export const PADDLE_Y = 372;
export const PADDLE_H = 10;
/** Furthest the paddle moves in one tick. */
export const PADDLE_SPEED = 13;
export const LIVES = 3;
/** The ball launches by itself after this many ticks on the paddle (about 2½ seconds). */
export const AUTO_LAUNCH_TICKS = 150;

/** Bricks: 10 columns, 38 units apart, starting 10 units in; rows 18 units apart from y = 48. */
export const COLS = 10;
export const BRICK_W = 36;
export const BRICK_H = 14;
const BRICK_X0 = 11;
const BRICK_Y0 = 48;
const STEP_X = 38;
const STEP_Y = 18;
/** Hit points of a steel brick: it never breaks. */
export const STEEL = 9;

/**
 * Each stage's layout, one string per row: "." empty, 1–3 hits to break, "#" steel.
 * Steel bricks don't count towards clearing the stage.
 */
export const STAGES = [
  {
    name: "Warm-up",
    goal: "Break every brick",
    speed: 3.6,
    paddle: 84,
    rows: ["1111111111", "1111111111", "1111111111", "1111111111", "1111111111"],
  },
  {
    name: "Double layer",
    goal: "Break every brick",
    speed: 4.0,
    paddle: 78,
    rows: ["2222222222", "2111111112", "2111111112", "2222222222", "1111111111", "1111111111"],
  },
  {
    name: "Diamond",
    goal: "Break every brick",
    speed: 4.4,
    paddle: 72,
    rows: ["....33....", "...3223...", "..322223..", ".32211223.", "..322223..", "...3223...", "....33...."],
  },
  {
    name: "Steel gates",
    goal: "Break every brick around the steel",
    speed: 4.8,
    paddle: 66,
    rows: ["3333333333", "2222222222", "##.####.##", "2121212121", "1212121212", "1111111111"],
  },
  {
    name: "Overdrive",
    goal: "Break every brick at top speed",
    speed: 5.4,
    paddle: 60,
    rows: ["3333333333", "#3#3##3#3#", "2323232323", "3232323232", "2222222222", "#.#.##.#.#", "1111111111", "1111111111"],
  },
];

export const stageConfig = (stage: number) => STAGES[Math.min(Math.max(stage, 1), STAGES.length) - 1];
const stageNumber = (stage: number) => Math.min(Math.max(stage, 1), STAGES.length);

/** The ball gets faster every RAMP_TICKS (15 seconds): +8% of the stage's starting speed each time, up to MAX_SPEED. */
export const RAMP_TICKS = 940;
export const RAMP_STEP = 0.08;
export const MAX_SPEED = 10;
export function speedAt(stage: number, ticks: number): number {
  const base = stageConfig(stage).speed;
  return Math.min(MAX_SPEED, base * (1 + RAMP_STEP * Math.floor(ticks / RAMP_TICKS)));
}
/** 1 at the start, rising each time the ball speeds up. */
export const speedLevel = (s: BricksState) => Math.floor(s.ticks / RAMP_TICKS) + 1;

export const MAX_MS = 30 * 60 * 1000;
export const MAX_TICKS = Math.floor(MAX_MS / TICK_MS);
export const MAX_EVENTS = 200_000;

export type Brick = { x: number; y: number; hp: number; max: number };

export type BricksState = {
  seed: number;
  stage: number;
  bricks: Brick[];
  /** Bricks still standing that count for clearing (not steel). */
  left: number;
  paddleX: number;
  paddleW: number;
  target: number;
  ball: { x: number; y: number; dx: number; dy: number };
  /** True while the ball sits on the paddle waiting to launch. */
  held: boolean;
  heldTicks: number;
  launches: number;
  lives: number;
  score: number;
  /** Bricks broken in a row without the ball touching the paddle. */
  streak: number;
  alive: boolean;
  cleared: boolean;
  ticks: number;
  /** Things that happened on the last tick, for sounds and sparks only. */
  events: BricksEvent[];
};

export type BricksEvent =
  | { kind: "hit"; brick: number; broke: boolean; points: number }
  | { kind: "paddle" }
  | { kind: "wall" }
  | { kind: "lost" }
  | { kind: "launch" }
  | { kind: "clear"; bonus: number };

export const pointsPerHit = (stage: number) => 10 * stage;
/** On clearing: 500 × stage, plus 250 × stage for each ball still in hand. */
export const clearBonus = (stage: number, lives: number) => 500 * stage + 250 * stage * lives;

export function newGame(seed: number, stage: number): BricksState {
  const n = stageNumber(stage);
  const cfg = stageConfig(n);
  const bricks: Brick[] = [];
  cfg.rows.forEach((row, r) => {
    for (let c = 0; c < COLS; c++) {
      const ch = row[c];
      if (!ch || ch === ".") continue;
      const hp = ch === "#" ? STEEL : Number(ch);
      bricks.push({ x: BRICK_X0 + c * STEP_X, y: BRICK_Y0 + r * STEP_Y, hp, max: hp });
    }
  });
  const s: BricksState = {
    seed,
    stage: n,
    bricks,
    left: bricks.filter((b) => b.hp !== STEEL).length,
    paddleX: W / 2,
    paddleW: cfg.paddle,
    target: W / 2,
    ball: { x: W / 2, y: PADDLE_Y - BALL_R, dx: 0, dy: -1 },
    held: true,
    heldTicks: 0,
    launches: 0,
    lives: LIVES,
    score: 0,
    streak: 0,
    alive: true,
    cleared: false,
    ticks: 0,
    events: [],
  };
  return s;
}

/** Sets where the paddle is heading. */
export function aim(s: BricksState, x: number) {
  s.target = Math.max(0, Math.min(W, Math.round(x)));
}

/** Releases the ball from the paddle. Returns false if it was already in play. */
export function launch(s: BricksState): boolean {
  if (!s.alive || !s.held) return false;
  // Each launch leans a little left or right, from the seed.
  const rand = mulberry32((s.seed ^ Math.imul(s.launches + 1, 0x9e3779b1)) >>> 0);
  const lean = (rand() - 0.5) * 0.7;
  const len = Math.sqrt(lean * lean + 1);
  s.ball.dx = lean / len;
  s.ball.dy = -1 / len;
  s.held = false;
  s.heldTicks = 0;
  s.launches++;
  s.events.push({ kind: "launch" });
  return true;
}

/** Keeps the ball from settling into a nearly flat path that would never come down. */
function steepen(b: BricksState["ball"]) {
  const MIN = 0.28;
  if (b.dy > -MIN && b.dy < MIN) {
    b.dy = b.dy < 0 ? -MIN : MIN;
    const sx = Math.sqrt(1 - MIN * MIN);
    b.dx = b.dx < 0 ? -sx : sx;
  }
}

function hitBricks(s: BricksState): boolean {
  const b = s.ball;
  for (let i = 0; i < s.bricks.length; i++) {
    const k = s.bricks[i];
    if (k.hp <= 0) continue;
    const cx = Math.max(k.x, Math.min(b.x, k.x + BRICK_W));
    const cy = Math.max(k.y, Math.min(b.y, k.y + BRICK_H));
    const ex = b.x - cx;
    const ey = b.y - cy;
    if (ex * ex + ey * ey >= BALL_R * BALL_R) continue;
    // Bounce off the side it went in least deep.
    const ox = BRICK_W / 2 + BALL_R - Math.abs(b.x - (k.x + BRICK_W / 2));
    const oy = BRICK_H / 2 + BALL_R - Math.abs(b.y - (k.y + BRICK_H / 2));
    if (ox < oy) {
      const right = b.x > k.x + BRICK_W / 2;
      b.dx = right ? Math.abs(b.dx) : -Math.abs(b.dx);
      b.x += right ? ox : -ox;
    } else {
      const below = b.y > k.y + BRICK_H / 2;
      b.dy = below ? Math.abs(b.dy) : -Math.abs(b.dy);
      b.y += below ? oy : -oy;
    }
    steepen(b);
    let points = 0;
    let broke = false;
    if (k.hp !== STEEL) {
      k.hp--;
      points = pointsPerHit(s.stage);
      if (k.hp === 0) {
        broke = true;
        s.left--;
        s.streak++;
        // A run of bricks without touching the paddle earns extra: +5 × stage for each brick after the second.
        if (s.streak > 2) points += 5 * s.stage * (s.streak - 2);
      }
      s.score += points;
    }
    s.events.push({ kind: "hit", brick: i, broke, points });
    return true;
  }
  return false;
}

function substep(s: BricksState, v: number) {
  const b = s.ball;
  b.x += b.dx * v;
  b.y += b.dy * v;
  // Walls and ceiling.
  if (b.x < BALL_R) {
    b.x = BALL_R;
    b.dx = Math.abs(b.dx);
    s.events.push({ kind: "wall" });
  } else if (b.x > W - BALL_R) {
    b.x = W - BALL_R;
    b.dx = -Math.abs(b.dx);
    s.events.push({ kind: "wall" });
  }
  if (b.y < BALL_R) {
    b.y = BALL_R;
    b.dy = Math.abs(b.dy);
    s.events.push({ kind: "wall" });
  }
  // Paddle: where it lands on the paddle sets the angle it goes back up at.
  const half = s.paddleW / 2;
  if (b.dy > 0 && b.y + BALL_R >= PADDLE_Y && b.y - BALL_R <= PADDLE_Y + PADDLE_H && b.x >= s.paddleX - half - BALL_R && b.x <= s.paddleX + half + BALL_R) {
    const off = Math.max(-1, Math.min(1, (b.x - s.paddleX) / (half + BALL_R)));
    b.dx = off * 0.86;
    b.dy = -Math.sqrt(1 - b.dx * b.dx);
    b.y = PADDLE_Y - BALL_R;
    s.streak = 0;
    s.events.push({ kind: "paddle" });
    return;
  }
  if (hitBricks(s) && s.left === 0) {
    s.cleared = true;
    s.alive = false;
    const bonus = clearBonus(s.stage, s.lives - 1);
    s.score += bonus;
    s.events.push({ kind: "clear", bonus });
    return;
  }
  if (b.y - BALL_R > H) {
    s.lives--;
    s.streak = 0;
    s.events.push({ kind: "lost" });
    if (s.lives <= 0) {
      s.alive = false;
      return;
    }
    s.held = true;
    s.heldTicks = 0;
  }
}

/** One tick: the paddle moves towards its target, then the ball moves in substeps. */
export function tick(s: BricksState) {
  s.events = [];
  if (!s.alive) return;
  s.ticks++;
  const half = s.paddleW / 2;
  const goal = Math.max(half, Math.min(W - half, s.target));
  const d = goal - s.paddleX;
  s.paddleX += d > PADDLE_SPEED ? PADDLE_SPEED : d < -PADDLE_SPEED ? -PADDLE_SPEED : d;
  if (s.held) {
    s.ball.x = s.paddleX;
    s.ball.y = PADDLE_Y - BALL_R;
    if (++s.heldTicks >= AUTO_LAUNCH_TICKS) launch(s);
    return;
  }
  const v = speedAt(s.stage, s.ticks) / SUBSTEPS;
  for (let k = 0; k < SUBSTEPS && s.alive && !s.held; k++) substep(s, v);
}

export type BricksAction = { tick: number; a: "L" } | { tick: number; x: number };

export const encodeInput = (actions: BricksAction[], end: number) =>
  `${actions.map((x) => ("a" in x ? `${x.tick}:L` : `${x.tick}:${x.x}`)).join(",")}|end:${end}`;

function parseInput(input: string): { actions: BricksAction[]; end: number } | string {
  const bar = input.indexOf("|");
  if (bar < 0) return "Invalid input";
  const endMatch = /^end:(\d{1,7})$/.exec(input.slice(bar + 1));
  if (!endMatch) return "Invalid input";
  const end = Number(endMatch[1]);
  if (end > MAX_TICKS) return "Game too long";
  const actions: BricksAction[] = [];
  const body = input.slice(0, bar);
  if (body) {
    const parts = body.split(",");
    if (parts.length > MAX_EVENTS) return "Too many moves";
    let last = 1;
    for (const p of parts) {
      const m = /^(\d{1,7}):(L|\d{1,3})$/.exec(p);
      if (!m) return "Invalid input";
      const t = Number(m[1]);
      if (t < last || t > end) return "Moves out of order";
      last = t;
      if (m[2] === "L") actions.push({ tick: t, a: "L" });
      else {
        const x = Number(m[2]);
        if (x > W) return "Invalid input";
        actions.push({ tick: t, x });
      }
    }
  }
  return { actions, end };
}

/** Replays a whole game. Exported for tests. */
export function replay(seed: number, stage: number, actions: BricksAction[], end: number): BricksState | string {
  const s = newGame(seed, stage);
  let i = 0;
  for (let t = 1; t <= end; t++) {
    if (!s.alive) return "Moves after the game ended";
    while (i < actions.length && actions[i].tick === t) {
      const a = actions[i++];
      if ("a" in a) launch(s);
      else aim(s, a.x);
    }
    tick(s);
  }
  if (i < actions.length) return "Moves after the game ended";
  return s;
}

export const bricks: ArcadeGame = {
  key: "bricks",
  name: "Brick Blitz",
  tagline: "Bounce the ball, smash the bricks. It gets faster every 15 seconds.",
  howToPlay:
    "Slide the paddle to keep the ball in play and break every brick. Where the ball lands on the paddle sets the angle it flies back at. The ball speeds up every 15 seconds and you have 3 balls.",
  kind: "solo",
  ranking: "score",
  scoreLabel: "points",
  stages: STAGES.map(({ name, goal }) => ({ name, goal })),
  timeLimitMs: MAX_MS,
  verify({ seed, stage, input, elapsedMs }) {
    if (input.length > 1_600_000) return invalid("Input too long");
    const parsed = parseInput(input);
    if (typeof parsed === "string") return invalid(parsed);
    const { actions, end } = parsed;
    if (end * TICK_MS > elapsedMs + 2000) return invalid("Played faster than real time");
    const s = replay(seed, stage, actions, end);
    if (typeof s === "string") return invalid(s);
    const broken = s.bricks.filter((b) => b.max !== STEEL && b.hp === 0).length;
    return {
      valid: true,
      cleared: s.cleared,
      score: s.score,
      flagged: false,
      detail: `${broken} bricks${s.cleared ? `, ${s.lives - 1} spare ${s.lives - 1 === 1 ? "ball" : "balls"}` : ""}`,
    };
  },
};
