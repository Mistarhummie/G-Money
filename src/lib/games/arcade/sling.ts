import { mulberry32, randInt } from "./rng";
import { invalid, type ArcadeGame } from "./types";

/**
 * Sling Strike: pull back the sling, let go, and pop every glowing orb with the stones you have.
 * Stones fly under gravity, bounce off walls and the ground, smash wooden crates and ricochet off
 * steel. Later stages bring moving orbs, bank shots and wind.
 *
 * The world is 800 × 500 units and runs in fixed 16 ms ticks, so moving orbs keep moving while you aim.
 * Input is each shot as "tick:px:py" (how far the sling was pulled back, in whole units) plus the tick
 * the game ended on, e.g. "120:-80:40,400:-70:55|end:900".
 *
 * Determinism: only + - * / and Math.sqrt, in a fixed order, so the browser and the server agree exactly.
 */

export const W = 800;
export const H = 500;
export const GROUND = 460;
export const TICK_MS = 16;
const SUBSTEPS = 4;
export const STONE_R = 10;
/** Where the stone sits in the sling. */
export const SLING_X = 110;
export const SLING_Y = 360;
export const MAX_PULL = 100;
/** Pulls shorter than this don't fire. */
export const MIN_PULL = 14;
/** Launch speed per unit of pull, in units per tick. */
const POWER = 0.21;
export const GRAVITY = 0.34;
/** A stone breaks wood when it hits at least this fast (units per tick, straight into the face). */
export const BREAK_SPEED = 5;
const BOUNCE = 0.45;
const SPRING = 1.05;
/** Longest a single stone may fly before the next one loads (about 8 seconds). */
const MAX_FLIGHT = 500;
/** Ticks a stone must sit almost still before it counts as stopped. */
const REST_TICKS = 18;

export type BlockKind = "wood" | "steel" | "spring";
export type BlockDef = { x: number; y: number; w: number; h: number; kind: BlockKind };
/** A floating orb. Moving orbs glide back and forth between (x, y) and (x2, y2) every `period` ticks. */
export type OrbDef = { x: number; y: number; r?: number; x2?: number; y2?: number; period?: number };

type StageDef = {
  name: string;
  goal: string;
  stones: number;
  /** Ticks of flight the aiming guide shows (0: none). */
  guide: number;
  /** Largest sideways push from wind, chosen from the seed (0: none). */
  wind: number;
  orbs: OrbDef[];
  blocks: BlockDef[];
};

const crate = (x: number, y: number, w = 40, h = 40): BlockDef => ({ x, y, w, h, kind: "wood" });
const steel = (x: number, y: number, w: number, h: number): BlockDef => ({ x, y, w, h, kind: "steel" });
const spring = (x: number, y: number, w: number, h: number): BlockDef => ({ x, y, w, h, kind: "spring" });

export const STAGES: StageDef[] = [
  {
    name: "First shots",
    goal: "Pop 3 orbs with 5 stones",
    stones: 5,
    guide: 45,
    wind: 0,
    orbs: [{ x: 430, y: 340 }, { x: 570, y: 250 }, { x: 690, y: 380 }],
    blocks: [crate(670, 420), steel(380, 380, 20, 80)],
  },
  {
    name: "Crate cover",
    goal: "Break through the crates and pop 4 orbs",
    stones: 6,
    guide: 30,
    wind: 0,
    orbs: [{ x: 600, y: 420 }, { x: 660, y: 340 }, { x: 720, y: 420 }, { x: 520, y: 200 }],
    blocks: [crate(490, 420), crate(490, 380), crate(490, 340), crate(490, 300), crate(530, 260, 80, 20), steel(760, 300, 40, 160)],
  },
  {
    name: "On the move",
    goal: "Hit 4 orbs, two of them moving",
    stones: 6,
    guide: 22,
    wind: 0,
    orbs: [
      { x: 420, y: 160, x2: 420, y2: 400, period: 220 },
      { x: 520, y: 120, x2: 740, y2: 120, period: 260 },
      { x: 640, y: 300 },
      { x: 700, y: 430 },
    ],
    blocks: [steel(560, 330, 160, 18), crate(620, 420), crate(740, 420), crate(740, 380)],
  },
  {
    name: "Bank shot",
    goal: "Get under the steel roof and pop 4 orbs",
    stones: 6,
    guide: 12,
    wind: 0,
    orbs: [{ x: 600, y: 425, r: 13 }, { x: 690, y: 425, r: 13 }, { x: 640, y: 120, x2: 640, y2: 210, period: 160 }, { x: 470, y: 260 }],
    blocks: [
      steel(520, 340, 260, 20),
      steel(780, 120, 20, 340),
      crate(520, 360, 30, 100),
      spring(300, 446, 90, 14),
      crate(430, 300, 80, 20),
    ],
  },
  {
    name: "Storm",
    goal: "Pop 5 orbs in the wind, with no aiming guide",
    stones: 7,
    guide: 0,
    wind: 0.03,
    orbs: [
      { x: 460, y: 140, x2: 460, y2: 380, period: 190 },
      { x: 560, y: 90, x2: 720, y2: 90, period: 170 },
      { x: 640, y: 420, r: 12 },
      { x: 720, y: 280 },
      { x: 600, y: 250, x2: 700, y2: 250, period: 140 },
    ],
    blocks: [
      crate(560, 420),
      crate(560, 380),
      crate(680, 420),
      crate(680, 380),
      steel(560, 300, 160, 18),
      steel(760, 200, 20, 260),
      crate(540, 160, 60, 20),
    ],
  },
];

export const stageConfig = (stage: number) => STAGES[Math.min(Math.max(stage, 1), STAGES.length) - 1];
const stageNumber = (stage: number) => Math.min(Math.max(stage, 1), STAGES.length);

export const MAX_MS = 30 * 60 * 1000;
export const MAX_TICKS = Math.floor(MAX_MS / TICK_MS);

export type Orb = { x: number; y: number; r: number; def: OrbDef; phase: number; popped: boolean };
export type Block = BlockDef & { hp: number };
export type Stone = { x: number; y: number; vx: number; vy: number; flight: number; still: number };

export type SlingState = {
  seed: number;
  stage: number;
  orbs: Orb[];
  blocks: Block[];
  /** Sideways push from wind, units per tick² (stage 5). */
  wind: number;
  /** Stones not yet thrown. */
  stones: number;
  /** The stone in the air, if any. */
  stone: Stone | null;
  /** Orbs popped by the stone in the air (for the combo). */
  shotPops: number;
  score: number;
  alive: boolean;
  cleared: boolean;
  ticks: number;
  /** Things that happened on the last tick, for sounds and sparks only. */
  events: SlingEvent[];
};

export type SlingEvent =
  | { kind: "pop"; orb: number; points: number; combo: number }
  | { kind: "break"; block: number; points: number }
  | { kind: "crack"; block: number }
  | { kind: "bounce"; speed: number; spring?: boolean }
  | { kind: "shot" }
  | { kind: "stop" }
  | { kind: "clear"; bonus: number };

export const orbPoints = (stage: number, combo: number) => 100 * stage * combo;
export const breakPoints = (stage: number) => 20 * stage;
/** On clearing: 300 × stage for every stone not thrown. */
export const clearBonus = (stage: number, stones: number) => 300 * stage * stones;

/** Position of a moving orb at a tick: straight back and forth along its path. */
function orbAt(o: Orb, t: number) {
  const d = o.def;
  if (!d.period || d.x2 === undefined || d.y2 === undefined) return;
  const u = ((t + o.phase) % d.period) / d.period;
  const tri = u < 0.5 ? 2 * u : 2 - 2 * u;
  o.x = d.x + (d.x2 - d.x) * tri;
  o.y = d.y + (d.y2 - d.y) * tri;
}

export function newGame(seed: number, stage: number): SlingState {
  const n = stageNumber(stage);
  const cfg = stageConfig(n);
  const rand = mulberry32(seed >>> 0);
  // The seed nudges still orbs a little and sets where moving ones start, so each round is its own.
  const orbs: Orb[] = cfg.orbs.map((d) => {
    const moving = !!d.period;
    const jx = moving ? 0 : randInt(rand, 21) - 10;
    const jy = moving ? 0 : randInt(rand, 21) - 10;
    const def = moving ? d : { ...d, x: d.x + jx, y: Math.min(d.y + jy, GROUND - (d.r ?? 15) - 2) };
    return { x: def.x, y: def.y, r: d.r ?? 15, def, phase: moving ? randInt(rand, d.period!) : 0, popped: false };
  });
  const wind = cfg.wind ? Math.round((rand() * 2 - 1) * cfg.wind * 1000) / 1000 : 0;
  const s: SlingState = {
    seed,
    stage: n,
    orbs,
    blocks: cfg.blocks.map((b) => ({ ...b, hp: b.kind === "wood" ? 2 : 0 })),
    wind,
    stones: cfg.stones,
    stone: null,
    shotPops: 0,
    score: 0,
    alive: true,
    cleared: false,
    ticks: 0,
    events: [],
  };
  for (const o of s.orbs) orbAt(o, 0);
  return s;
}

/** True when a stone can be thrown now. */
export const ready = (s: SlingState) => s.alive && !s.stone && s.stones > 0;

/** Clamps a pull to the sling's reach. Returns null when the pull is too short to fire. */
export function clampPull(px: number, py: number): { px: number; py: number } | null {
  const len = Math.sqrt(px * px + py * py);
  if (len < MIN_PULL) return null;
  if (len <= MAX_PULL) return { px, py };
  return { px: (px / len) * MAX_PULL, py: (py / len) * MAX_PULL };
}

/** Launch velocity for a pull: the stone flies the opposite way to the pull. */
export function launchVelocity(px: number, py: number) {
  const p = clampPull(px, py);
  if (!p) return null;
  return { vx: -p.px * POWER, vy: -p.py * POWER };
}

/** Throws a stone. `px`, `py` are whole units of pull back from the sling. */
export function shoot(s: SlingState, px: number, py: number): boolean {
  if (!ready(s)) return false;
  const v = launchVelocity(px, py);
  if (!v) return false;
  s.stones--;
  s.shotPops = 0;
  s.stone = { x: SLING_X, y: SLING_Y, vx: v.vx, vy: v.vy, flight: 0, still: 0 };
  s.events.push({ kind: "shot" });
  return true;
}

function collideBlock(s: SlingState, st: Stone, i: number): boolean {
  const b = s.blocks[i];
  if (b.kind === "wood" && b.hp <= 0) return false;
  const cx = Math.max(b.x, Math.min(st.x, b.x + b.w));
  const cy = Math.max(b.y, Math.min(st.y, b.y + b.h));
  let nx = st.x - cx;
  let ny = st.y - cy;
  const d2 = nx * nx + ny * ny;
  if (d2 >= STONE_R * STONE_R) return false;
  let depth: number;
  if (d2 > 0) {
    const d = Math.sqrt(d2);
    nx /= d;
    ny /= d;
    depth = STONE_R - d;
  } else {
    // Centre inside the block: push out through the nearest face.
    const l = st.x - b.x;
    const r = b.x + b.w - st.x;
    const t = st.y - b.y;
    const u = b.y + b.h - st.y;
    const m = Math.min(l, r, t, u);
    nx = m === l ? -1 : m === r ? 1 : 0;
    ny = m === t ? -1 : m === u && m !== l && m !== r ? 1 : 0;
    depth = m + STONE_R;
  }
  const vn = st.vx * nx + st.vy * ny;
  if (vn >= 0) {
    // Already moving away: just separate.
    st.x += nx * depth;
    st.y += ny * depth;
    return true;
  }
  const speed = -vn;
  if (b.kind === "wood" && speed >= BREAK_SPEED) {
    b.hp -= speed >= BREAK_SPEED * 2 ? 2 : 1;
    if (b.hp <= 0) {
      // Smashed straight through: the stone carries on, slowed.
      const points = breakPoints(s.stage);
      s.score += points;
      s.events.push({ kind: "break", block: i, points });
      st.vx *= 0.65;
      st.vy *= 0.65;
      return true;
    }
    s.events.push({ kind: "crack", block: i });
  }
  st.x += nx * depth;
  st.y += ny * depth;
  const e = b.kind === "spring" ? SPRING : b.kind === "steel" ? 0.6 : BOUNCE;
  // Bounce the part of the speed going into the face, and rub off a little of the rest.
  const tx = st.vx - vn * nx;
  const ty = st.vy - vn * ny;
  const keep = b.kind === "spring" ? 1 : 0.85;
  st.vx = tx * keep - e * vn * nx;
  st.vy = ty * keep - e * vn * ny;
  if (speed > 1.5) s.events.push({ kind: "bounce", speed, spring: b.kind === "spring" });
  return true;
}

function endShot(s: SlingState) {
  s.stone = null;
  s.events.push({ kind: "stop" });
  if (s.stones <= 0 && s.orbs.some((o) => !o.popped)) s.alive = false;
}

function substep(s: SlingState, st: Stone) {
  st.vy += GRAVITY / SUBSTEPS;
  st.vx += s.wind / SUBSTEPS;
  st.x += st.vx / SUBSTEPS;
  st.y += st.vy / SUBSTEPS;
  if (st.y + STONE_R > GROUND) {
    st.y = GROUND - STONE_R;
    if (st.vy > 1.5) s.events.push({ kind: "bounce", speed: st.vy });
    st.vy = st.vy > 1 ? -st.vy * BOUNCE : 0;
    st.vx *= 0.9;
  }
  for (let i = 0; i < s.blocks.length; i++) collideBlock(s, st, i);
  for (let i = 0; i < s.orbs.length; i++) {
    const o = s.orbs[i];
    if (o.popped) continue;
    const dx = st.x - o.x;
    const dy = st.y - o.y;
    const reach = o.r + STONE_R;
    if (dx * dx + dy * dy >= reach * reach) continue;
    o.popped = true;
    s.shotPops++;
    const points = orbPoints(s.stage, s.shotPops);
    s.score += points;
    s.events.push({ kind: "pop", orb: i, points, combo: s.shotPops });
  }
}

/** One tick: moving orbs move, and the stone in the air (if any) flies in substeps. */
export function tick(s: SlingState) {
  s.events = [];
  if (!s.alive) return;
  s.ticks++;
  for (const o of s.orbs) if (!o.popped) orbAt(o, s.ticks);
  const st = s.stone;
  if (!st) return;
  for (let k = 0; k < SUBSTEPS; k++) substep(s, st);
  if (s.orbs.every((o) => o.popped)) {
    s.cleared = true;
    s.alive = false;
    s.stone = null;
    const bonus = clearBonus(s.stage, s.stones);
    s.score += bonus;
    s.events.push({ kind: "clear", bonus });
    return;
  }
  st.flight++;
  st.still = st.vx * st.vx + st.vy * st.vy < 0.09 ? st.still + 1 : 0;
  if (st.still >= REST_TICKS || st.flight >= MAX_FLIGHT || st.x < -60 || st.x > W + 60 || st.y > H + 60) endShot(s);
}

/** Where a stone thrown with this pull would be, tick by tick, ignoring what it hits (for the aiming guide). */
export function guidePath(s: SlingState, px: number, py: number, ticks: number): [number, number][] {
  const v = launchVelocity(px, py);
  if (!v) return [];
  const pts: [number, number][] = [];
  let { vx, vy } = v;
  let x = SLING_X;
  let y = SLING_Y;
  for (let t = 1; t <= ticks; t++) {
    for (let k = 0; k < SUBSTEPS; k++) {
      vy += GRAVITY / SUBSTEPS;
      vx += s.wind / SUBSTEPS;
      x += vx / SUBSTEPS;
      y += vy / SUBSTEPS;
    }
    if (t % 3 === 0) pts.push([x, y]);
    if (y > GROUND) break;
  }
  return pts;
}

export type Shot = { tick: number; px: number; py: number };

export const encodeInput = (shots: Shot[], end: number) => `${shots.map((x) => `${x.tick}:${x.px}:${x.py}`).join(",")}|end:${end}`;

function parseInput(input: string): { shots: Shot[]; end: number } | string {
  const bar = input.indexOf("|");
  if (bar < 0) return "Invalid input";
  const endMatch = /^end:(\d{1,7})$/.exec(input.slice(bar + 1));
  if (!endMatch) return "Invalid input";
  const end = Number(endMatch[1]);
  if (end > MAX_TICKS) return "Game too long";
  const shots: Shot[] = [];
  const body = input.slice(0, bar);
  if (body) {
    const parts = body.split(",");
    if (parts.length > 20) return "Too many shots";
    let last = 1;
    for (const p of parts) {
      const m = /^(\d{1,7}):(-?\d{1,3}):(-?\d{1,3})$/.exec(p);
      if (!m) return "Invalid input";
      const t = Number(m[1]);
      if (t < last || t > end) return "Shots out of order";
      last = t;
      shots.push({ tick: t, px: Number(m[2]), py: Number(m[3]) });
    }
  }
  return { shots, end };
}

/** Replays a whole game. Exported for tests. */
export function replay(seed: number, stage: number, shots: Shot[], end: number): SlingState | string {
  const s = newGame(seed, stage);
  let i = 0;
  for (let t = 1; t <= end; t++) {
    if (!s.alive) return "Shots after the game ended";
    while (i < shots.length && shots[i].tick === t) {
      const sh = shots[i++];
      if (!shoot(s, sh.px, sh.py)) return "Shot while no stone was ready";
    }
    tick(s);
  }
  if (i < shots.length) return "Shots after the game ended";
  return s;
}

export const sling: ArcadeGame = {
  key: "sling",
  name: "Sling Strike",
  tagline: "Pull back, let fly, pop every orb.",
  howToPlay:
    "Drag back from the sling and let go to throw a stone. Pull further for more power. Pop every glowing orb before your stones run out: smash through crates, bounce off steel and springs, and time your shots at moving orbs.",
  kind: "solo",
  ranking: "score",
  scoreLabel: "points",
  stages: STAGES.map(({ name, goal }) => ({ name, goal })),
  timeLimitMs: MAX_MS,
  verify({ seed, stage, input, elapsedMs }) {
    if (input.length > 2_000) return invalid("Input too long");
    const parsed = parseInput(input);
    if (typeof parsed === "string") return invalid(parsed);
    const { shots, end } = parsed;
    if (end * TICK_MS > elapsedMs + 2000) return invalid("Played faster than real time");
    const s = replay(seed, stage, shots, end);
    if (typeof s === "string") return invalid(s);
    const popped = s.orbs.filter((o) => o.popped).length;
    return {
      valid: true,
      cleared: s.cleared,
      score: s.score,
      flagged: false,
      detail: `${popped}/${s.orbs.length} orbs, ${shots.length} ${shots.length === 1 ? "stone" : "stones"}`,
    };
  },
};
