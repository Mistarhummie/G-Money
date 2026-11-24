import { mulberry32, randInt } from "./rng";
import { invalid, type ArcadeGame } from "./types";

/**
 * Darts. Aim at the board; your hand sways a little and the dart lands where the sight is when you
 * throw, so steady timing matters as much as aim. The sway grows stage by stage.
 *
 * The board is drawn in millimetres on a 400 × 400 field (centre 200, 200; the doubles ring ends at
 * 170 mm). Time runs in fixed 16 ms ticks. Input is each throw as "tick:x:y" (where the player aimed,
 * whole units) plus the tick the game ended on, e.g. "80:200:60,130:205:58|end:300".
 *
 * Determinism: the sway is made of straight-line (triangle) waves and the sectors are found with
 * fixed direction vectors, so only + - * / are used and the browser and the server agree exactly.
 */

export const FIELD = 400;
export const CX = 200;
export const CY = 200;
export const TICK_MS = 16;
/** Ticks between throws (the next dart is in your hand after about 0.6 seconds). */
export const RELOAD_TICKS = 38;

/** Ring edges in mm from the centre. */
export const R_BULL = 6.35;
export const R_OUTER_BULL = 15.9;
export const R_TREBLE_IN = 99;
export const R_TREBLE_OUT = 107;
export const R_DOUBLE_IN = 162;
export const R_DOUBLE_OUT = 170;

/** Numbers clockwise from the top. */
export const SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

/** Unit vectors (x right, y up) along the clockwise edge of each sector: 81° − 18° × k. Written out so every engine uses identical numbers. */
const EDGES: [number, number][] = [
  [0.15643446504023092, 0.9876883405951378], [0.45399049973954686, 0.8910065241883678], [0.7071067811865476, 0.7071067811865475],
  [0.8910065241883679, 0.45399049973954675], [0.9876883405951378, 0.15643446504023087], [0.9876883405951378, -0.15643446504023087],
  [0.8910065241883679, -0.45399049973954675], [0.7071067811865476, -0.7071067811865475], [0.45399049973954686, -0.8910065241883678],
  [0.15643446504023092, -0.9876883405951378], [-0.15643446504023104, -0.9876883405951377], [-0.45399049973954675, -0.8910065241883679],
  [-0.7071067811865475, -0.7071067811865476], [-0.8910065241883678, -0.45399049973954686], [-0.9876883405951377, -0.15643446504023098],
  [-0.9876883405951378, 0.15643446504023073], [-0.8910065241883681, 0.45399049973954625], [-0.7071067811865477, 0.7071067811865475],
  [-0.4539904997395469, 0.8910065241883678], [-0.15643446504023104, 0.9876883405951377],
];

export type Hit = { x: number; y: number; base: number; mult: 0 | 1 | 2 | 3; points: number; label: string };

/** What a dart landing at field point (x, y) scores. */
export function scoreAt(x: number, y: number): Hit {
  const px = x - CX;
  const py = CY - y;
  const d2 = px * px + py * py;
  if (d2 <= R_BULL * R_BULL) return { x, y, base: 25, mult: 2, points: 50, label: "Bull" };
  if (d2 <= R_OUTER_BULL * R_OUTER_BULL) return { x, y, base: 25, mult: 1, points: 25, label: "25" };
  if (d2 > R_DOUBLE_OUT * R_DOUBLE_OUT) return { x, y, base: 0, mult: 0, points: 0, label: "Miss" };
  let k = 0;
  for (let i = 0; i < 20; i++) {
    const a = EDGES[(i + 19) % 20];
    const b = EDGES[i];
    if (a[0] * py - a[1] * px <= 0 && b[0] * py - b[1] * px > 0) {
      k = i;
      break;
    }
  }
  const base = SECTORS[k];
  const mult: 1 | 2 | 3 =
    d2 > R_DOUBLE_IN * R_DOUBLE_IN ? 2 : d2 > R_TREBLE_IN * R_TREBLE_IN && d2 <= R_TREBLE_OUT * R_TREBLE_OUT ? 3 : 1;
  return { x, y, base, mult, points: base * mult, label: mult === 1 ? String(base) : `${mult === 2 ? "D" : "T"}${base}` };
}

type StageDef = {
  name: string;
  goal: string;
  darts: number;
  /** Largest sway from the aim point, in mm. */
  sway: number;
  /** "total": score at least `target`. "countdown": bring `target` down to exactly 0. */
  mode: "total" | "countdown";
  target: number;
  doubleOut?: boolean;
};

export const STAGES: StageDef[] = [
  { name: "Warm-up", goal: "Score 150 with 9 darts", darts: 9, sway: 7, mode: "total", target: 150 },
  { name: "Treble hunt", goal: "Score 250 with 9 darts", darts: 9, sway: 10, mode: "total", target: 250 },
  { name: "301", goal: "Count 301 down to exactly 0 in 15 darts", darts: 15, sway: 13, mode: "countdown", target: 301 },
  { name: "Steady hands", goal: "Score 320 with 12 darts", darts: 12, sway: 17, mode: "total", target: 320 },
  { name: "501 double out", goal: "Count 501 down to 0 in 24 darts, finishing on a double", darts: 24, sway: 21, mode: "countdown", target: 501, doubleOut: true },
];

export const stageConfig = (stage: number) => STAGES[Math.min(Math.max(stage, 1), STAGES.length) - 1];
const stageNumber = (stage: number) => Math.min(Math.max(stage, 1), STAGES.length);

/** Countdown stages: 50 × stage for each dart left when you finish. */
export const finishBonus = (stage: number, dartsLeft: number) => 50 * stage * dartsLeft;

export const MAX_MS = 30 * 60 * 1000;
export const MAX_TICKS = Math.floor(MAX_MS / TICK_MS);

export type Wave = { period: number; phase: number };

export type DartsState = {
  seed: number;
  stage: number;
  /** Two waves across and two up and down, set by the seed. */
  waves: Wave[];
  sway: number;
  darts: number;
  thrown: Hit[];
  /** Total so far, or what is left to count down. */
  total: number;
  left: number;
  /** Tick the last dart was thrown on. */
  lastThrow: number;
  score: number;
  alive: boolean;
  cleared: boolean;
  ticks: number;
};

/** A straight-line wave between −1 and 1. */
const tri = (t: number, w: Wave) => {
  const u = ((t + w.phase) % w.period) / w.period;
  return 1 - 4 * Math.abs(u - 0.5);
};

/** How far the sight sits from the aim point at a tick. */
export function swayAt(s: Pick<DartsState, "waves" | "sway">, t: number): { dx: number; dy: number } {
  const [a, b, c, d] = s.waves;
  return { dx: s.sway * (0.75 * tri(t, a) + 0.25 * tri(t, b)), dy: s.sway * (0.75 * tri(t, c) + 0.25 * tri(t, d)) };
}

export function newGame(seed: number, stage: number): DartsState {
  const n = stageNumber(stage);
  const cfg = stageConfig(n);
  const rand = mulberry32(seed >>> 0);
  const wave = (lo: number, hi: number): Wave => {
    const period = lo + randInt(rand, hi - lo + 1);
    return { period, phase: randInt(rand, period) };
  };
  return {
    seed,
    stage: n,
    waves: [wave(100, 150), wave(37, 53), wave(120, 170), wave(41, 59)],
    sway: cfg.sway,
    darts: cfg.darts,
    thrown: [],
    total: 0,
    left: cfg.mode === "countdown" ? cfg.target : 0,
    lastThrow: -RELOAD_TICKS,
    score: 0,
    alive: true,
    cleared: false,
    ticks: 0,
  };
}

export const ready = (s: DartsState) => s.alive && s.thrown.length < s.darts && s.ticks - s.lastThrow >= RELOAD_TICKS;

export type ThrowResult = Hit & { bust: boolean; checkout: boolean };

/** Throws a dart aimed at (x, y) on the current tick. Returns null if no dart is ready. */
export function throwDart(s: DartsState, x: number, y: number): ThrowResult | null {
  if (!ready(s)) return null;
  const cfg = stageConfig(s.stage);
  const { dx, dy } = swayAt(s, s.ticks);
  const hit = scoreAt(x + dx, y + dy);
  s.thrown.push(hit);
  s.lastThrow = s.ticks;
  let bust = false;
  let checkout = false;
  if (cfg.mode === "total") {
    s.total += hit.points;
    s.score = s.total;
    if (s.total >= cfg.target) s.cleared = true;
  } else {
    const after = s.left - hit.points;
    // A bust (too much, or a finish that isn't allowed) scores nothing for that dart.
    if (after < 0 || (cfg.doubleOut && (after === 1 || (after === 0 && hit.mult !== 2)))) bust = true;
    else s.left = after;
    s.score = cfg.target - s.left;
    if (s.left === 0) {
      checkout = true;
      s.cleared = true;
      s.alive = false;
      s.score += finishBonus(s.stage, s.darts - s.thrown.length);
    }
  }
  if (s.thrown.length >= s.darts) s.alive = false;
  return { ...hit, bust, checkout };
}

export function tick(s: DartsState) {
  if (!s.alive) return;
  s.ticks++;
}

export type Throw = { tick: number; x: number; y: number };

export const encodeInput = (throws: Throw[], end: number) => `${throws.map((x) => `${x.tick}:${x.x}:${x.y}`).join(",")}|end:${end}`;

function parseInput(input: string): { throws: Throw[]; end: number } | string {
  const bar = input.indexOf("|");
  if (bar < 0) return "Invalid input";
  const endMatch = /^end:(\d{1,7})$/.exec(input.slice(bar + 1));
  if (!endMatch) return "Invalid input";
  const end = Number(endMatch[1]);
  if (end > MAX_TICKS) return "Game too long";
  const throws: Throw[] = [];
  const body = input.slice(0, bar);
  if (body) {
    const parts = body.split(",");
    if (parts.length > 30) return "Too many darts";
    let last = 0;
    for (const p of parts) {
      const m = /^(\d{1,7}):(\d{1,3}):(\d{1,3})$/.exec(p);
      if (!m) return "Invalid input";
      const t = Number(m[1]);
      if (t < last || t > end) return "Throws out of order";
      last = t;
      const x = Number(m[2]);
      const y = Number(m[3]);
      if (x > FIELD || y > FIELD) return "Invalid input";
      throws.push({ tick: t, x, y });
    }
  }
  return { throws, end };
}

/**
 * Replays a whole game. A throw on tick t happens after t ticks have passed (so the sway is the one
 * shown on that tick). Exported for tests.
 */
export function replay(seed: number, stage: number, throws: Throw[], end: number): DartsState | string {
  const s = newGame(seed, stage);
  let i = 0;
  for (let t = 0; t <= end; t++) {
    if (t > 0) {
      if (!s.alive) return "Throws after the game ended";
      tick(s);
    }
    while (i < throws.length && throws[i].tick === t) {
      const th = throws[i++];
      if (!throwDart(s, th.x, th.y)) return "Threw before the next dart was ready";
    }
  }
  return s;
}

export const darts: ArcadeGame = {
  key: "darts",
  name: "Darts",
  tagline: "Steady hand, sharp aim. Hit the trebles, finish on a double.",
  howToPlay:
    "Move the sight over the board and throw when it's where you want it. Your hand sways, so time each throw. Score enough with your darts, or count down to exactly zero on the 301 and 501 stages.",
  kind: "solo",
  ranking: "score",
  scoreLabel: "points",
  stages: STAGES.map(({ name, goal }) => ({ name, goal })),
  timeLimitMs: MAX_MS,
  verify({ seed, stage, input, elapsedMs }) {
    if (input.length > 1_000) return invalid("Input too long");
    const parsed = parseInput(input);
    if (typeof parsed === "string") return invalid(parsed);
    const { throws, end } = parsed;
    if (end * TICK_MS > elapsedMs + 2000) return invalid("Played faster than real time");
    const s = replay(seed, stage, throws, end);
    if (typeof s === "string") return invalid(s);
    const cfg = stageConfig(stage);
    return {
      valid: true,
      cleared: s.cleared,
      score: s.score,
      flagged: false,
      detail: cfg.mode === "total" ? `${s.total} with ${s.thrown.length} darts` : `${s.left} left after ${s.thrown.length} darts`,
    };
  },
};
