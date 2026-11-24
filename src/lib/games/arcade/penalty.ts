import { mulberry32, randInt } from "./rng";
import { sha256 } from "./sha256";
import { invalid, type ArcadeGame, type PvpRules, type PvpState } from "./types";

/**
 * Penalty Shootout. You take a kick, then you go in goal, five times each, then sudden death.
 *
 * Kicking: aim anywhere in the goal. The aim sways (more on later stages), and the ball goes where the
 * sight is when you shoot. The keeper covers the middle well and the corners poorly, so the closer to a
 * post you go, the better the chance of beating him, and the bigger the chance of hitting the post or
 * missing. The computer keeper also leans towards the side you kicked to last time.
 *
 * Saving: the kicker runs up and shoots; you see where the ball is going and must dive in time. The
 * kicks are a fixed set for each stage, shuffled by the seed, so everyone faces the same ten kicks.
 *
 * Goal coordinates are centimetres: x 0–732 across, y 0–244 up from the ground.
 * Input: "tick:K:x:y" (shoot, aiming at x, y) and "tick:D:x:y" (dive towards x, y), plus "|end:tick".
 *
 * Two players: one kicks while the other keeps, swapping each kick. See `pvp` below.
 */

export const GOAL_W = 732;
export const GOAL_H = 244;
export const BALL_R = 11;
export const TICK_MS = 16;
/** Where the keeper stands before diving (centre of his body). */
export const KEEPER_X = 366;
export const KEEPER_Y = 90;
/** How fast the keeper dives, cm per tick, and how far his gloves reach from his centre. */
export const DIVE_SPEED = 18;
export const KEEPER_REACH = 62;
/** Ticks the ball flies on your kicks (for the picture; the result is known when you shoot). */
export const KICK_FLIGHT = 34;
/** Pause between one kick's result and the next kick. */
export const PAUSE_TICKS = 75;
/** A kick not taken within 15 seconds counts as a miss. */
export const KICK_TIMEOUT = 940;
const MAX_ROUNDS = 10;

type Pt = [number, number];

type StageDef = {
  name: string;
  goal: string;
  /** Largest sway of your aim, cm. */
  sway: number;
  /** How far the computer keeper reaches from his spot, across and up (cm). */
  reach: [number, number];
  /** Ticks the computer's kicks take to reach the goal: less time to react on later stages. */
  flight: number;
  /** The computer's ten kicks (first five, then sudden death), in cm. Some miss. */
  kicks: Pt[];
};

export const STAGES: StageDef[] = [
  {
    name: "Training ground",
    goal: "Win the shootout",
    sway: 20,
    reach: [235, 175],
    flight: 48,
    kicks: [[180, 60], [560, 40], [366, 200], [-40, 80], [620, 150], [120, 190], [520, 90], [300, 30], [780, 60], [640, 200]],
  },
  {
    name: "Local derby",
    goal: "Win the shootout",
    sway: 26,
    reach: [250, 182],
    flight: 43,
    kicks: [[110, 50], [640, 70], [420, 210], [600, 180], [90, 170], [250, 30], [700, 40], [366, 270], [160, 120], [560, 130]],
  },
  {
    name: "Cup semi-final",
    goal: "Win the shootout",
    sway: 32,
    reach: [265, 190],
    flight: 39,
    kicks: [[70, 40], [670, 60], [80, 200], [640, 210], [400, 40], [690, 140], [40, 120], [300, 220], [600, 30], [130, 80]],
  },
  {
    name: "Cup final",
    goal: "Win the shootout",
    sway: 38,
    reach: [280, 198],
    flight: 35,
    kicks: [[50, 30], [690, 50], [60, 210], [680, 205], [690, 120], [40, 140], [600, 225], [130, 220], [700, 30], [30, 60]],
  },
  {
    name: "World stage",
    goal: "Win the shootout against the best keeper",
    sway: 44,
    reach: [292, 205],
    flight: 32,
    kicks: [[40, 25], [700, 40], [45, 215], [690, 215], [710, 110], [25, 120], [620, 228], [110, 228], [705, 25], [30, 40]],
  },
];

export const stageConfig = (stage: number) => STAGES[Math.min(Math.max(stage, 1), STAGES.length) - 1];
const stageNumber = (stage: number) => Math.min(Math.max(stage, 1), STAGES.length);

export const MAX_MS = 30 * 60 * 1000;
export const MAX_TICKS = Math.floor(MAX_MS / TICK_MS);

export type Outcome = "goal" | "saved" | "post" | "wide" | "over" | "late";

/** Where a ball at (x, y) ends up, before any keeper. */
export function placement(x: number, y: number): "in" | "post" | "wide" | "over" {
  if (x >= BALL_R && x <= GOAL_W - BALL_R && y <= GOAL_H - BALL_R) return "in";
  const nearPost = (x > -BALL_R && x < BALL_R) || (x > GOAL_W - BALL_R && x < GOAL_W + BALL_R);
  const nearBar = y > GOAL_H - BALL_R && y < GOAL_H + BALL_R;
  if ((nearPost && y < GOAL_H + BALL_R) || (nearBar && x > -BALL_R && x < GOAL_W + BALL_R)) return "post";
  return y >= GOAL_H + BALL_R ? "over" : "wide";
}

/** Which side of the goal a point is on: −1 left, 1 right. */
const sideOf = (x: number) => (x < KEEPER_X ? -1 : 1);

/** The computer keeper's reach: an ellipse round his spot, a little wider on the side you kicked to last. */
export function cpuSaves(stage: number, x: number, y: number, lastSide: number): boolean {
  const [rx0, ry] = stageConfig(stage).reach;
  const rx = rx0 + (lastSide !== 0 && sideOf(x) === lastSide ? 30 : 0);
  const dx = (x - KEEPER_X) / rx;
  const dy = y / ry;
  return dx * dx + dy * dy <= 1;
}

/** Where a diving keeper's centre is `ticks` after the dive started, heading for (tx, ty). */
export function keeperAt(tx: number, ty: number, ticks: number): Pt {
  const dx = tx - KEEPER_X;
  const dy = ty - KEEPER_Y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0 || ticks <= 0) return [KEEPER_X, KEEPER_Y];
  const go = Math.min(len, DIVE_SPEED * ticks);
  return [KEEPER_X + (dx / len) * go, KEEPER_Y + (dy / len) * go];
}

export type Wave = { period: number; phase: number };
const tri = (t: number, w: Wave) => {
  const u = ((t + w.phase) % w.period) / w.period;
  return 1 - 4 * Math.abs(u - 0.5);
};

export type KickRecord = { by: "you" | "cpu"; outcome: Outcome; x: number; y: number };

export type PenaltyState = {
  seed: number;
  stage: number;
  waves: Wave[];
  /** Order the computer takes its kicks in. */
  order: number[];
  /** Ticks before each computer kick is struck, counted from the start of the save. */
  waits: number[];
  round: number;
  phase: "kick" | "save" | "over";
  /** Tick the current phase started (or will start, during a pause). */
  phaseAt: number;
  /** Save phase: when the ball is struck and when it arrives. */
  strikeAt: number;
  arriveAt: number;
  /** Save phase: the dive, if made. */
  dive: { at: number; x: number; y: number } | null;
  /** Your last kick: where you aimed, and when (for the picture). */
  lastKick: { at: number; x: number; y: number; outcome: Outcome } | null;
  lastSide: number;
  kicks: KickRecord[];
  you: number;
  cpu: number;
  score: number;
  alive: boolean;
  cleared: boolean;
  ticks: number;
};

export function newGame(seed: number, stage: number): PenaltyState {
  const n = stageNumber(stage);
  const rand = mulberry32(seed >>> 0);
  const wave = (lo: number, hi: number): Wave => {
    const period = lo + randInt(rand, hi - lo + 1);
    return { period, phase: randInt(rand, period) };
  };
  const waves = [wave(90, 130), wave(33, 47), wave(100, 150), wave(37, 53)];
  // First five shuffled among themselves, then the sudden-death five.
  const shuffle = (a: number[]) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = randInt(rand, i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const order = [...shuffle([0, 1, 2, 3, 4]), ...shuffle([5, 6, 7, 8, 9])];
  const waits = order.map(() => 45 + randInt(rand, 60));
  return {
    seed,
    stage: n,
    waves,
    order,
    waits,
    round: 0,
    phase: "kick",
    phaseAt: 0,
    strikeAt: 0,
    arriveAt: 0,
    dive: null,
    lastKick: null,
    lastSide: 0,
    kicks: [],
    you: 0,
    cpu: 0,
    score: 0,
    alive: true,
    cleared: false,
    ticks: 0,
  };
}

/** How far the sight sits from the aim point at a tick. */
export function swayAt(s: Pick<PenaltyState, "waves" | "stage">, t: number): { dx: number; dy: number } {
  const a = stageConfig(s.stage).sway;
  const [w1, w2, w3, w4] = s.waves;
  return { dx: a * (0.75 * tri(t, w1) + 0.25 * tri(t, w2)), dy: a * 0.7 * (0.75 * tri(t, w3) + 0.25 * tri(t, w4)) };
}

/** The computer's kick for the current round. */
export const cpuKick = (s: PenaltyState): Pt => stageConfig(s.stage).kicks[s.order[s.round]];

/** True once one side can't be caught. `a`, `b` goals; `ka`, `kb` kicks taken. */
export function decided(a: number, b: number, ka: number, kb: number, rounds = 5): boolean {
  if (ka <= rounds && kb <= rounds) {
    if (a + (rounds - ka) < b || b + (rounds - kb) < a) return true;
    return ka === rounds && kb === rounds && a !== b;
  }
  return ka === kb && a !== b;
}

function finishIfDecided(s: PenaltyState) {
  const yk = s.kicks.filter((k) => k.by === "you").length;
  const ck = s.kicks.filter((k) => k.by === "cpu").length;
  if (decided(s.you, s.cpu, yk, ck) || (yk >= MAX_ROUNDS && ck >= MAX_ROUNDS)) {
    s.alive = false;
    s.phase = "over";
    if (s.you > s.cpu) {
      s.cleared = true;
      s.score += 500 * s.stage;
    }
  }
}

function recordKick(s: PenaltyState, x: number, y: number, outcome: Outcome) {
  s.kicks.push({ by: "you", outcome, x, y });
  s.lastKick = { at: s.ticks, x, y, outcome };
  if (outcome === "goal") {
    s.you++;
    s.score += 100 * s.stage;
  }
  s.lastSide = sideOf(x);
  finishIfDecided(s);
  if (!s.alive) return;
  s.phase = "save";
  s.phaseAt = s.ticks + PAUSE_TICKS;
  s.dive = null;
  s.strikeAt = s.phaseAt + s.waits[s.round];
  s.arriveAt = s.strikeAt + stageConfig(s.stage).flight;
}

/** True when you may shoot now. */
export const canKick = (s: PenaltyState) => s.alive && s.phase === "kick" && s.ticks >= s.phaseAt;
/** True when you may dive now. */
export const canDive = (s: PenaltyState) => s.alive && s.phase === "save" && s.ticks >= s.phaseAt && !s.dive && s.ticks < s.arriveAt;

/** Shoots, aiming at (x, y). Returns the outcome, or null if you can't shoot now. */
export function kick(s: PenaltyState, x: number, y: number): Outcome | null {
  if (!canKick(s)) return null;
  const { dx, dy } = swayAt(s, s.ticks);
  const bx = x + dx;
  const by = Math.max(0, y + dy);
  const p = placement(bx, by);
  const outcome: Outcome = p !== "in" ? p : cpuSaves(s.stage, bx, by, s.lastSide) ? "saved" : "goal";
  recordKick(s, bx, by, outcome);
  return outcome;
}

/** Dives towards (x, y). Returns false if you can't dive now. */
export function dive(s: PenaltyState, x: number, y: number): boolean {
  if (!canDive(s)) return false;
  s.dive = { at: s.ticks, x, y };
  return true;
}

/** One tick: runs the clock on a kick nobody took, and settles the computer's kick when it arrives. */
export function tick(s: PenaltyState) {
  if (!s.alive) return;
  s.ticks++;
  if (s.phase === "kick" && s.ticks >= s.phaseAt + KICK_TIMEOUT) {
    recordKick(s, KEEPER_X, -100, "late");
    return;
  }
  if (s.phase === "save" && s.ticks === s.arriveAt) {
    const [x, y] = cpuKick(s);
    const p = placement(x, y);
    let outcome: Outcome = p === "in" ? "goal" : p;
    if (p === "in" && s.dive) {
      const [kx, ky] = keeperAt(s.dive.x, s.dive.y, s.arriveAt - s.dive.at);
      const ex = kx - x;
      const ey = ky - y;
      const reach = KEEPER_REACH + BALL_R;
      if (ex * ex + ey * ey <= reach * reach) outcome = "saved";
    }
    s.kicks.push({ by: "cpu", outcome, x, y });
    if (outcome === "goal") s.cpu++;
    if (outcome === "saved") s.score += 100 * s.stage;
    finishIfDecided(s);
    if (!s.alive) return;
    s.round++;
    s.phase = "kick";
    s.phaseAt = s.ticks + PAUSE_TICKS;
  }
}

export type Action = { tick: number; a: "K" | "D"; x: number; y: number };

export const encodeInput = (actions: Action[], end: number) => `${actions.map((x) => `${x.tick}:${x.a}:${x.x}:${x.y}`).join(",")}|end:${end}`;

function parseInput(input: string): { actions: Action[]; end: number } | string {
  const bar = input.indexOf("|");
  if (bar < 0) return "Invalid input";
  const endMatch = /^end:(\d{1,7})$/.exec(input.slice(bar + 1));
  if (!endMatch) return "Invalid input";
  const end = Number(endMatch[1]);
  if (end > MAX_TICKS) return "Game too long";
  const actions: Action[] = [];
  const body = input.slice(0, bar);
  if (body) {
    const parts = body.split(",");
    if (parts.length > 2 * MAX_ROUNDS) return "Too many moves";
    let last = 0;
    for (const p of parts) {
      const m = /^(\d{1,7}):([KD]):(-?\d{1,3}):(-?\d{1,3})$/.exec(p);
      if (!m) return "Invalid input";
      const t = Number(m[1]);
      if (t < last || t > end) return "Moves out of order";
      last = t;
      actions.push({ tick: t, a: m[2] as "K" | "D", x: Number(m[3]), y: Number(m[4]) });
    }
  }
  return { actions, end };
}

/** Replays a whole game: on each tick the clock moves first, then that tick's moves. Exported for tests. */
export function replay(seed: number, stage: number, actions: Action[], end: number): PenaltyState | string {
  const s = newGame(seed, stage);
  let i = 0;
  for (let t = 0; t <= end; t++) {
    if (t > 0) {
      if (!s.alive) return "Moves after the game ended";
      tick(s);
    }
    while (i < actions.length && actions[i].tick === t) {
      const a = actions[i++];
      const ok = a.a === "K" ? kick(s, a.x, a.y) !== null : dive(s, a.x, a.y);
      if (!ok) return "Move at the wrong time";
    }
  }
  return s;
}

// ---------------------------------------------------------------- two players

/**
 * Two players take turns: side 0 kicks first while side 1 keeps, then they swap, five kicks each and
 * then sudden death (up to ten each, then a draw).
 *
 * Each kick is three moves, so the keeper's choice stays secret until the ball is struck:
 * 1. The keeper picks one of six zones and sends only a fingerprint of it: "c:<sha256 of 'zone:secret'>".
 * 2. The kicker aims: "k:x:y" (cm, like the solo game).
 * 3. The keeper's screen reveals the choice: "r:zone:secret". The replay checks it matches the fingerprint.
 *
 * Zones: 0–2 low left, centre, right; 3–5 high left, centre, right (thirds across, halves up).
 * The ball lands within a few centimetres of the aim, worked out from the keeper's secret (which the
 * kicker can't know), so aiming right at the post is a risk. A keeper who dives into the zone the ball
 * goes into saves it, except right up in the top corners, which no keeper reaches.
 */
export const PVP_ERROR = 26;
export const ZONE_NAMES = ["Low left", "Low centre", "Low right", "High left", "High centre", "High right"];

export function zoneOf(x: number, y: number): number {
  const col = x < GOAL_W / 3 ? 0 : x < (2 * GOAL_W) / 3 ? 1 : 2;
  return col + (y >= GOAL_H / 2 ? 3 : 0);
}
/** Top corners: out of every keeper's reach. */
export const topCorner = (x: number, y: number) => y > 175 && (x < 75 || x > GOAL_W - 75);

export const commitment = (zone: number, secret: string) => sha256(`${zone}:${secret}`);

/** The small miss for a kick, from the keeper's secret: between −PVP_ERROR and PVP_ERROR each way. */
export function pvpError(secret: string): { dx: number; dy: number } {
  const h = sha256(`err:${secret}`);
  const a = parseInt(h.slice(0, 8), 16) / 0xffffffff;
  const b = parseInt(h.slice(8, 16), 16) / 0xffffffff;
  return { dx: (a * 2 - 1) * PVP_ERROR, dy: (b * 2 - 1) * PVP_ERROR * 0.7 };
}

export type PvpKick = { kicker: 0 | 1; aimX: number; aimY: number; x: number; y: number; zone: number; outcome: Outcome };

export type PenaltyMatch = {
  kicks: PvpKick[];
  goals: [number, number];
  /** The kick in progress: 0 waiting for the keeper's choice, 1 for the kicker, 2 for the keeper to reveal. */
  step: 0 | 1 | 2;
  /** The commitment and aim of the kick in progress. */
  pending: { commit?: string; aimX?: number; aimY?: number };
  kicker: 0 | 1;
  keeper: 0 | 1;
  over: boolean;
  winner: 0 | 1 | null;
  detail?: string;
};

export function replayMatch(seed: number, moves: string[]): PenaltyMatch | null {
  const m: PenaltyMatch = { kicks: [], goals: [0, 0], step: 0, pending: {}, kicker: 0, keeper: 1, over: false, winner: null };
  for (const mv of moves) {
    if (m.over) return null;
    if (m.step === 0) {
      const c = /^c:([0-9a-f]{64})$/.exec(mv);
      if (!c) return null;
      m.pending = { commit: c[1] };
      m.step = 1;
    } else if (m.step === 1) {
      const k = /^k:(-?\d{1,3}):(-?\d{1,3})$/.exec(mv);
      if (!k) return null;
      const x = Number(k[1]);
      const y = Number(k[2]);
      if (x < -150 || x > GOAL_W + 150 || y < 0 || y > 400) return null;
      m.pending.aimX = x;
      m.pending.aimY = y;
      m.step = 2;
    } else {
      const r = /^r:([0-5]):([0-9a-f]{16,32})$/.exec(mv);
      if (!r) return null;
      const zone = Number(r[1]);
      if (commitment(zone, r[2]) !== m.pending.commit) return null;
      const { dx, dy } = pvpError(r[2]);
      const x = m.pending.aimX! + dx;
      const y = Math.max(0, m.pending.aimY! + dy);
      const p = placement(x, y);
      const outcome: Outcome = p !== "in" ? p : zoneOf(x, y) === zone && !topCorner(x, y) ? "saved" : "goal";
      m.kicks.push({ kicker: m.kicker, aimX: m.pending.aimX!, aimY: m.pending.aimY!, x, y, zone, outcome });
      if (outcome === "goal") m.goals[m.kicker]++;
      const k0 = m.kicks.filter((k) => k.kicker === 0).length;
      const k1 = m.kicks.length - k0;
      if (decided(m.goals[0], m.goals[1], k0, k1)) {
        m.over = true;
        m.winner = m.goals[0] > m.goals[1] ? 0 : 1;
        m.detail = `${m.goals[0]}–${m.goals[1]} on penalties`;
      } else if (k0 >= MAX_ROUNDS && k1 >= MAX_ROUNDS) {
        m.over = true;
        m.detail = "Level after ten kicks each";
      }
      m.kicker = m.kicker === 0 ? 1 : 0;
      m.keeper = m.kicker === 0 ? 1 : 0;
      m.step = 0;
      m.pending = {};
    }
  }
  return m;
}

/** Whose move it is: the keeper to choose and reveal, the kicker to shoot. */
export function pvpStateOf(m: PenaltyMatch): PvpState {
  return { turn: m.step === 1 ? m.kicker : m.keeper, over: m.over, winner: m.winner, detail: m.detail };
}

const pvp: PvpRules = {
  replay(seed, moves) {
    const m = replayMatch(seed, moves);
    return m && pvpStateOf(m);
  },
  maxMoveLength: 80,
};

export const penalty: ArcadeGame = {
  key: "penalty",
  name: "Penalty Shootout",
  tagline: "Pick your spot, then go in goal. Five kicks each, then sudden death.",
  howToPlay:
    "Take a kick, then save one, five times each. Shooting: aim at the goal and shoot when the swaying sight is on your spot; corners beat the keeper but can hit the post. Saving: watch the kick and drag or tap where the ball is going to dive in time. Online, one player kicks while the other keeps, swapping every kick.",
  kind: "versus",
  ranking: "score",
  scoreLabel: "points",
  stages: STAGES.map(({ name, goal }) => ({ name, goal })),
  timeLimitMs: MAX_MS,
  pvp,
  verify({ seed, stage, input, elapsedMs }) {
    if (input.length > 1_000) return invalid("Input too long");
    const parsed = parseInput(input);
    if (typeof parsed === "string") return invalid(parsed);
    const { actions, end } = parsed;
    if (end * TICK_MS > elapsedMs + 2000) return invalid("Played faster than real time");
    const s = replay(seed, stage, actions, end);
    if (typeof s === "string") return invalid(s);
    return { valid: true, cleared: s.cleared, score: s.score, flagged: false, detail: `${s.you}–${s.cpu}` };
  },
};
