import { mulberry32, randInt, tooFast } from "./rng";
import { invalid, type ArcadeGame } from "./types";

/**
 * 8-Ball Pool against the computer.
 *
 * The table is drawn in portrait: x runs across (0..W), y runs down the table (0..H), in millimetres.
 * The rack sits on the foot spot near the top, the kitchen (behind the head string) is at the bottom.
 *
 * Determinism: the physics uses only + - * / and Math.sqrt with a fixed time step and a fixed
 * processing order (balls by index, pairs i<j), so the browser and the server compute bit-identical
 * shots. The computer's shots are recomputed by the server from the seed, never read from the input.
 *
 * Input: the player's actions in order, separated by ";":
 *   p:x,y        place the cue ball (ball in hand) at integer mm; required exactly when you have ball in hand
 *   s:tx,ty,pow  shoot towards the integer point (tx,ty) in mm, with power 1..100
 * e.g. "p:635,2100;s:635,635,100;s:200,400,55"
 */

export const W = 1270;
export const H = 2540;
export const R = 28.5;
/** The head string: on the opening break the cue ball goes at or below this line (y >= HEAD_Y). */
export const HEAD_Y = 1905;
export const FOOT_Y = 635;
/** Physics step (seconds) and how many steps make one animation frame (120 frames per second). */
export const DT = 1 / 480;
export const STEPS_PER_FRAME = 4;
export const FRAMES_PER_SECOND = 120;
const FRICTION = 600; // rolling deceleration, mm/s²
const MAX_STEPS = 480 * 20; // no shot runs longer than 20 simulated seconds
const BALL_E = 0.95; // ball-ball restitution
const CUSHION_E = 0.75; // cushion restitution
const MIN_SPEED = 150;
const MAX_SPEED = 4000;
export const MAX_SHOTS = 120; // both players together; then the game is a draw
const MAX_HUMAN_SHOTS_PER_SECOND = 1;

/** Pocket centres and capture radii: a ball whose centre comes within r of a pocket centre drops. */
/** Pocket centres and capture radii: a ball whose centre comes within r of a pocket centre drops.
 * (ax, ay) is the point inside the mouth the computer aims object balls at. */
export const POCKETS = [
  { x: 0, y: 0, r: 68, ax: R + 12, ay: R + 12 },
  { x: W, y: 0, r: 68, ax: W - R - 12, ay: R + 12 },
  { x: -12, y: H / 2, r: 60, ax: R + 10, ay: H / 2 },
  { x: W + 12, y: H / 2, r: 60, ax: W - R - 10, ay: H / 2 },
  { x: 0, y: H, r: 68, ax: R + 12, ay: H - R - 12 },
  { x: W, y: H, r: 68, ax: W - R - 12, ay: H - R - 12 },
];

export type Ball = { x: number; y: number; on: boolean };
export type Group = "solids" | "stripes";
export type Player = 0 | 1; // 0 = you, 1 = the computer
export type Shot = { tx: number; ty: number; power: number };

export type State = {
  /** Index 0 is the cue ball, 1..15 the object balls. */
  balls: Ball[];
  turn: Player;
  groups: [Group | null, Group | null];
  /** The player to shoot must place the cue ball first. */
  ballInHand: boolean;
  isBreak: boolean;
  shots: number;
  playerShots: number;
  /** null while playing, -1 for a draw. */
  winner: Player | -1 | null;
  /** What happened on the last shot, for the UI. */
  note: string;
};

export const STAGES = [
  { name: "Beginner", aimError: 0.035, goal: "Beat a beginner who misses a lot" },
  { name: "Novice", aimError: 0.016, goal: "Beat a novice player" },
  { name: "Club", aimError: 0.008, goal: "Beat a club player" },
  { name: "Strong", aimError: 0.0035, goal: "Beat a strong player" },
  { name: "Master", aimError: 0.0012, goal: "Beat a master who rarely misses" },
];

export const stageConfig = (stage: number) => STAGES[Math.min(Math.max(stage, 1), STAGES.length) - 1];

export const groupOf = (n: number): Group | null => (n >= 1 && n <= 7 ? "solids" : n >= 9 && n <= 15 ? "stripes" : null);
const other = (g: Group): Group => (g === "solids" ? "stripes" : "solids");

export function remaining(balls: Ball[], g: Group): number {
  let n = 0;
  for (let i = 1; i < 16; i++) if (balls[i].on && groupOf(i) === g) n++;
  return n;
}

/** Balls the shooter may legally hit first. */
export function legalTargets(state: State): number[] {
  const g = state.groups[state.turn];
  const out: number[] = [];
  if (state.isBreak) {
    for (let i = 1; i < 16; i++) if (state.balls[i].on) out.push(i);
    return out;
  }
  if (g && remaining(state.balls, g) === 0) return state.balls[8].on ? [8] : [];
  for (let i = 1; i < 16; i++) if (state.balls[i].on && i !== 8 && (!g || groupOf(i) === g)) out.push(i);
  return out;
}

function shuffle<T>(rand: () => number, items: T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(rand, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Rack spots: row r (0 = apex on the foot spot) has r+1 balls, rows go up the table. */
function rackSpots(): { x: number; y: number }[] {
  const d = 2 * R + 0.5;
  const rowGap = (d * Math.sqrt(3)) / 2;
  const spots: { x: number; y: number }[] = [];
  for (let r = 0; r < 5; r++) for (let k = 0; k <= r; k++) spots.push({ x: W / 2 + (k - r / 2) * d, y: FOOT_Y - r * rowGap });
  return spots;
}

export function initialState(seed: number): State {
  const rand = mulberry32(seed);
  const spots = rackSpots();
  const slot: number[] = new Array(15).fill(0); // ball number per spot
  slot[4] = 8; // middle of the third row
  const solids = shuffle(rand, [1, 2, 3, 4, 5, 6, 7]);
  const stripes = shuffle(rand, [9, 10, 11, 12, 13, 14, 15]);
  // One of each group in the two back corners.
  if (rand() < 0.5) {
    slot[10] = solids.pop()!;
    slot[14] = stripes.pop()!;
  } else {
    slot[10] = stripes.pop()!;
    slot[14] = solids.pop()!;
  }
  const rest = shuffle(rand, [...solids, ...stripes]);
  for (let i = 0; i < 15; i++) if (!slot[i]) slot[i] = rest.pop()!;
  const balls: Ball[] = new Array(16);
  balls[0] = { x: W / 2, y: 2100, on: true };
  for (let i = 0; i < 15; i++) balls[slot[i]] = { x: spots[i].x, y: spots[i].y, on: true };
  return { balls, turn: 0, groups: [null, null], ballInHand: true, isBreak: true, shots: 0, playerShots: 0, winner: null, note: "Place the cue ball behind the line and break." };
}

/** Why the cue ball cannot go at (x, y), or null if it can. */
export function placementError(state: State, x: number, y: number): string | null {
  if (x < R || x > W - R || y < R || y > H - R) return "Off the table";
  if (state.isBreak && y < HEAD_Y) return "Must be behind the line for the break";
  for (const p of POCKETS) {
    const dx = x - p.x;
    const dy = y - p.y;
    if (dx * dx + dy * dy <= (p.r + 2) * (p.r + 2)) return "Too close to a pocket";
  }
  for (let i = 1; i < 16; i++) {
    const b = state.balls[i];
    if (!b.on) continue;
    const dx = x - b.x;
    const dy = y - b.y;
    if (dx * dx + dy * dy < 4 * R * R) return "Touching another ball";
  }
  return null;
}

/** Puts the cue ball in hand on the table, or returns an error. */
export function placeCue(state: State, x: number, y: number): State | string {
  if (!state.ballInHand || state.winner !== null) return "No ball in hand";
  const err = placementError(state, x, y);
  if (err) return err;
  const balls = state.balls.slice();
  balls[0] = { x, y, on: true };
  return { ...state, balls, ballInHand: false };
}

export type SimResult = {
  balls: Ball[];
  /** First object ball the cue ball touched, -1 for none. */
  firstHit: number;
  /** Balls potted, in the order they dropped (0 = cue ball). */
  potted: number[];
  /** Ball positions every STEPS_PER_FRAME steps (x0,y0,x1,y1,...; NaN once potted), when recorded. */
  frames: Float32Array[] | null;
  steps: number;
};

export const powerToSpeed = (power: number) => MIN_SPEED + ((MAX_SPEED - MIN_SPEED) * (power - 1)) / 99;

/** Runs one shot to rest. Pure and deterministic. */
export function simulate(start: Ball[], shot: Shot, record: boolean): SimResult {
  const x = start.map((b) => b.x);
  const y = start.map((b) => b.y);
  const on = start.map((b) => b.on);
  const vx: number[] = new Array(16).fill(0);
  const vy: number[] = new Array(16).fill(0);
  const potted: number[] = [];
  const frames: Float32Array[] | null = record ? [] : null;
  let firstHit = -1;
  const snap = () => {
    const f = new Float32Array(32);
    for (let i = 0; i < 16; i++) {
      f[2 * i] = on[i] ? x[i] : NaN;
      f[2 * i + 1] = on[i] ? y[i] : NaN;
    }
    frames!.push(f);
  };
  if (record) snap();

  const dx0 = shot.tx - x[0];
  const dy0 = shot.ty - y[0];
  const len = Math.sqrt(dx0 * dx0 + dy0 * dy0);
  const speed = powerToSpeed(shot.power);
  vx[0] = (dx0 / len) * speed;
  vy[0] = (dy0 / len) * speed;

  const D = 2 * R;
  const D2 = D * D;
  const slow = FRICTION * DT;
  let step = 0;
  for (; step < MAX_STEPS; step++) {
    // 1. Move and apply rolling friction.
    let moving = false;
    for (let i = 0; i < 16; i++) {
      if (!on[i] || (vx[i] === 0 && vy[i] === 0)) continue;
      moving = true;
      x[i] += vx[i] * DT;
      y[i] += vy[i] * DT;
      const s = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]);
      const ns = s - slow;
      if (ns <= 0) {
        vx[i] = 0;
        vy[i] = 0;
      } else {
        vx[i] = (vx[i] * ns) / s;
        vy[i] = (vy[i] * ns) / s;
      }
    }
    if (!moving) break;

    // 2. Ball-ball collisions (equal masses, along the line of centres).
    for (let i = 0; i < 15; i++) {
      if (!on[i]) continue;
      for (let j = i + 1; j < 16; j++) {
        if (!on[j]) continue;
        if (vx[i] === 0 && vy[i] === 0 && vx[j] === 0 && vy[j] === 0) continue;
        const dx = x[j] - x[i];
        if (dx >= D || dx <= -D) continue;
        const dy = y[j] - y[i];
        if (dy >= D || dy <= -D) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 >= D2 || d2 === 0) continue;
        // Rewind to the exact moment of contact so the contact normal (and so the cut) is accurate.
        const wx = vx[j] - vx[i];
        const wy = vy[j] - vy[i];
        const dw = dx * wx + dy * wy;
        const ww = wx * wx + wy * wy;
        let back = 0;
        if (dw < 0 && ww > 0) {
          back = (dw + Math.sqrt(dw * dw - ww * (d2 - D2))) / ww;
          if (back > DT) back = DT;
        }
        const cix = x[i] - vx[i] * back;
        const ciy = y[i] - vy[i] * back;
        const cjx = x[j] - vx[j] * back;
        const cjy = y[j] - vy[j] * back;
        let nx = cjx - cix;
        let ny = cjy - ciy;
        const cd = Math.sqrt(nx * nx + ny * ny);
        if (cd === 0) continue;
        nx /= cd;
        ny /= cd;
        const vn = (vx[i] - vx[j]) * nx + (vy[i] - vy[j]) * ny;
        if (vn > 0) {
          if (i === 0 && firstHit < 0) firstHit = j;
          const imp = (vn * (1 + BALL_E)) / 2;
          vx[i] -= imp * nx;
          vy[i] -= imp * ny;
          vx[j] += imp * nx;
          vy[j] += imp * ny;
          // Advance from the contact point with the new velocities.
          x[i] = cix + vx[i] * back;
          y[i] = ciy + vy[i] * back;
          x[j] = cjx + vx[j] * back;
          y[j] = cjy + vy[j] * back;
        }
        // Separate any remaining overlap.
        const ex = x[j] - x[i];
        const ey = y[j] - y[i];
        const e2 = ex * ex + ey * ey;
        if (e2 < D2 && e2 > 0) {
          const e = Math.sqrt(e2);
          const push = (D - e) / 2;
          x[i] -= (push * ex) / e;
          y[i] -= (push * ey) / e;
          x[j] += (push * ex) / e;
          y[j] += (push * ey) / e;
        }
      }
    }

    // 3. Pockets, then cushions.
    for (let i = 0; i < 16; i++) {
      if (!on[i]) continue;
      let dropped = false;
      for (const p of POCKETS) {
        const dx = x[i] - p.x;
        const dy = y[i] - p.y;
        if (dx * dx + dy * dy < p.r * p.r) {
          dropped = true;
          break;
        }
      }
      if (dropped) {
        on[i] = false;
        vx[i] = 0;
        vy[i] = 0;
        potted.push(i);
        continue;
      }
      if (x[i] < R) {
        x[i] = R;
        if (vx[i] < 0) vx[i] = -vx[i] * CUSHION_E;
      } else if (x[i] > W - R) {
        x[i] = W - R;
        if (vx[i] > 0) vx[i] = -vx[i] * CUSHION_E;
      }
      if (y[i] < R) {
        y[i] = R;
        if (vy[i] < 0) vy[i] = -vy[i] * CUSHION_E;
      } else if (y[i] > H - R) {
        y[i] = H - R;
        if (vy[i] > 0) vy[i] = -vy[i] * CUSHION_E;
      }
    }
    if (record && (step + 1) % STEPS_PER_FRAME === 0) snap();
  }
  if (record) snap();
  const balls = x.map((bx, i) => ({ x: bx, y: y[i], on: on[i] }));
  return { balls, firstHit, potted, frames, steps: step };
}

/** Puts the 8 back on the foot spot (or the nearest free point up the table). */
function respotEight(balls: Ball[]): void {
  for (let y = FOOT_Y; y > R; y -= 1) {
    let free = true;
    for (let i = 0; i < 16; i++) {
      if (i === 8 || !balls[i].on) continue;
      const dx = balls[i].x - W / 2;
      const dy = balls[i].y - y;
      if (dx * dx + dy * dy < 4 * R * R) {
        free = false;
        break;
      }
    }
    if (free) {
      balls[8] = { x: W / 2, y, on: true };
      return;
    }
  }
  balls[8] = { x: W / 2, y: FOOT_Y + 300, on: true };
}

export function shotError(state: State, shot: Shot): string | null {
  if (state.winner !== null) return "Game is over";
  if (state.ballInHand || !state.balls[0].on) return "Place the cue ball first";
  const { tx, ty, power } = shot;
  if (![tx, ty, power].every(Number.isInteger)) return "Bad shot";
  if (tx < -10000 || tx > 10000 || ty < -10000 || ty > 10000) return "Aim point out of range";
  if (power < 1 || power > 100) return "Bad power";
  const dx = tx - state.balls[0].x;
  const dy = ty - state.balls[0].y;
  if (dx * dx + dy * dy < 1) return "Aim point on the cue ball";
  return null;
}

/** Plays a shot and applies the rules. Assumes shotError(state, shot) is null. */
export function applyShot(state: State, shot: Shot, record: boolean): { state: State; sim: SimResult } {
  const shooter = state.turn;
  const opp: Player = shooter === 0 ? 1 : 0;
  const who = shooter === 0 ? "You" : "Computer";
  const sim = simulate(state.balls, shot, record);
  const balls = sim.balls.slice();
  const myGroup = state.groups[shooter];
  const onEight = myGroup !== null && remaining(state.balls, myGroup) === 0;
  const cuePotted = sim.potted.includes(0);
  const eightPotted = sim.potted.includes(8);
  const objectPots = sim.potted.filter((b) => b !== 0 && b !== 8);

  let foul = "";
  if (cuePotted) foul = "cue ball potted";
  else if (sim.firstHit < 0) foul = "no ball hit";
  else if (!state.isBreak) {
    const f = sim.firstHit;
    const legal = myGroup === null ? f !== 8 : onEight ? f === 8 : groupOf(f) === myGroup;
    if (!legal) foul = "wrong ball hit first";
  }

  const next: State = {
    ...state,
    balls,
    groups: [state.groups[0], state.groups[1]],
    shots: state.shots + 1,
    playerShots: state.playerShots + (shooter === 0 ? 1 : 0),
    isBreak: false,
    ballInHand: false,
  };

  if (eightPotted) {
    if (state.isBreak) respotEight(balls);
    else {
      const won = onEight && !foul;
      next.winner = won ? shooter : opp;
      next.note = won ? `${who} potted the 8 and won.` : `${who} potted the 8${foul ? ` with a foul (${foul})` : " too early"} and lost.`;
      return { state: next, sim };
    }
  }

  if (!foul && !state.isBreak && myGroup === null && objectPots.length) {
    const g = groupOf(objectPots[0])!;
    next.groups[shooter] = g;
    next.groups[opp] = other(g);
  }

  const potCount = objectPots.length ? `potted ${objectPots.length} ball${objectPots.length > 1 ? "s" : ""}` : "potted nothing";
  if (foul) {
    if (cuePotted) balls[0] = { ...balls[0], on: false };
    next.turn = opp;
    next.ballInHand = true;
    next.note = `Foul by ${who === "You" ? "you" : "the computer"}: ${foul}. ${opp === 0 ? "You have" : "Computer has"} ball in hand.`;
  } else {
    const g = next.groups[shooter];
    const potOwn = state.isBreak ? objectPots.length > 0 : g !== null && objectPots.some((b) => groupOf(b) === g);
    next.turn = potOwn ? shooter : opp;
    next.note = `${who} ${potCount}${eightPotted ? " (the 8 was respotted)" : ""}.${potOwn ? " Shoot again." : ""}`;
  }
  if (next.shots >= MAX_SHOTS) {
    next.winner = -1;
    next.note = `Shot limit of ${MAX_SHOTS} reached: draw.`;
  }
  return { state: next, sim };
}

// ---------------------------------------------------------------------------
// Computer opponent

/** `ball`/`pocket` name the pot the computer is going for, when it has one. */
export type Move = { place: [number, number] | null; shot: Shot; ball?: number; pocket?: number };

/** Squared distance from point p to segment a-b. */
function segDist2(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx - px;
  const qy = ay + t * dy - py;
  return qx * qx + qy * qy;
}

function pathClear(balls: Ball[], ax: number, ay: number, bx: number, by: number, skipA: number, skipB: number): boolean {
  const lim = 4 * R * R - 1;
  for (let i = 0; i < 16; i++) {
    if (i === skipA || i === skipB || !balls[i].on) continue;
    if (segDist2(ax, ay, bx, by, balls[i].x, balls[i].y) < lim) return false;
  }
  return true;
}

type Plan = { score: number; gx: number; gy: number; cut: number; dCG: number; dTP: number; t: number; p: number };

/** A straight "ghost ball" pot of ball t into pocket p from (cx, cy), scored by difficulty (lower is easier). */
function planPot(balls: Ball[], cx: number, cy: number, t: number, p: number): Plan | null {
  const T = balls[t];
  const P = POCKETS[p];
  let ux = P.ax - T.x;
  let uy = P.ay - T.y;
  const dTP = Math.sqrt(ux * ux + uy * uy);
  ux /= dTP;
  uy /= dTP;
  if (p === 2 || p === 3) {
    if (ux * ux < 0.2) return null; // too shallow into a side pocket
  }
  const gx = T.x - ux * 2 * R;
  const gy = T.y - uy * 2 * R;
  if (gx < R - 0.5 || gx > W - R + 0.5 || gy < R - 0.5 || gy > H - R + 0.5) return null;
  let ax = gx - cx;
  let ay = gy - cy;
  const dCG = Math.sqrt(ax * ax + ay * ay);
  if (dCG < 1) return null;
  ax /= dCG;
  ay /= dCG;
  const cut = ax * ux + ay * uy; // cosine of the cut angle
  if (cut < 0.2) return null;
  if (!pathClear(balls, cx, cy, gx, gy, 0, t)) return null;
  if (!pathClear(balls, T.x, T.y, P.ax, P.ay, 0, t)) return null;
  return { score: (dCG + 2 * dTP) / (cut * cut), gx, gy, cut, dCG, dTP, t, p };
}

function powerFor(plan: Plan): number {
  const a2 = 2 * FRICTION;
  const vHit = Math.sqrt(a2 * (plan.dTP + 200)) / (plan.cut * 0.975);
  const v0 = Math.sqrt(vHit * vHit + a2 * plan.dCG) * 1.25;
  const p = Math.round(1 + ((v0 - MIN_SPEED) / (MAX_SPEED - MIN_SPEED)) * 99);
  return Math.max(15, Math.min(100, p));
}

/** A shot from (cx, cy) along (ax, ay) with a seeded aim error, as an integer aim point. */
function aimed(rand: () => number, aimError: number, cx: number, cy: number, ax: number, ay: number, power: number): Shot {
  const theta = (rand() + rand() - 1) * aimError;
  let dx = ax - theta * ay;
  let dy = ay + theta * ax;
  const l = Math.sqrt(dx * dx + dy * dy);
  dx /= l;
  dy /= l;
  return { tx: Math.round(cx + dx * 3000), ty: Math.round(cy + dy * 3000), power };
}

/** The computer's move: deterministic for a given state, stage and seed. */
export function computerMove(state: State, stage: number, seed: number): Move {
  const { aimError } = stageConfig(stage);
  const rand = mulberry32((seed ^ Math.imul(state.shots + 1, 0x9e3779b1)) >>> 0);
  const targets = legalTargets(state);
  const balls = state.balls;
  let place: [number, number] | null = null;
  let cx = balls[0].x;
  let cy = balls[0].y;

  let best: Plan | null = null;
  if (state.ballInHand) {
    // Try placing the cue ball straight behind each ghost ball.
    for (const t of targets)
      for (let p = 0; p < 6; p++) {
        const P = POCKETS[p];
        let ux = P.ax - balls[t].x;
        let uy = P.ay - balls[t].y;
        const l = Math.sqrt(ux * ux + uy * uy);
        ux /= l;
        uy /= l;
        for (const back of [200, 350, 500]) {
          const px = Math.round(balls[t].x - ux * (2 * R + back));
          const py = Math.round(balls[t].y - uy * (2 * R + back));
          if (placementError(state, px, py)) continue;
          const plan = planPot(balls, px, py, t, p);
          if (plan && (!best || plan.score < best.score)) {
            best = plan;
            place = [px, py];
          }
        }
      }
    if (!place) {
      // Nothing straight: first free spot on a coarse grid from the bottom of the table.
      outer: for (let y = H - 300; y > R; y -= 100)
        for (let x = W / 2, k = 0; k < 12; k++, x = W / 2 + (k % 2 ? 1 : -1) * 100 * Math.ceil(k / 2)) {
          if (!placementError(state, x, y)) {
            place = [x, y];
            break outer;
          }
        }
      if (!place) place = [W / 2, H - 100];
    }
    cx = place[0];
    cy = place[1];
  } else {
    for (const t of targets)
      for (let p = 0; p < 6; p++) {
        const plan = planPot(balls, cx, cy, t, p);
        if (plan && (!best || plan.score < best.score)) best = plan;
      }
  }

  if (best) {
    const ax = (best.gx - cx) / best.dCG;
    const ay = (best.gy - cy) / best.dCG;
    return { place, shot: aimed(rand, aimError, cx, cy, ax, ay, powerFor(best)), ball: best.t, pocket: best.p };
  }

  // No pot on: hit the nearest legal ball full, preferring one with a clear path.
  let pick = -1;
  let pickScore = Infinity;
  for (const t of targets) {
    const dx = balls[t].x - cx;
    const dy = balls[t].y - cy;
    const d = Math.sqrt(dx * dx + dy * dy) + (pathClear(balls, cx, cy, balls[t].x, balls[t].y, 0, t) ? 0 : 10000);
    if (d < pickScore) {
      pickScore = d;
      pick = t;
    }
  }
  if (pick < 0) return { place, shot: { tx: W / 2, ty: cy > H / 2 ? 100 : H - 100, power: 40 } };
  const dx = balls[pick].x - cx;
  const dy = balls[pick].y - cy;
  const d = Math.sqrt(dx * dx + dy * dy);
  return { place, shot: aimed(rand, aimError, cx, cy, dx / d, dy / d, 45) };
}

// ---------------------------------------------------------------------------
// Input and replay

export type Token = { kind: "p"; x: number; y: number } | { kind: "s"; shot: Shot };

export function parseInput(input: string): Token[] | null {
  if (input === "") return [];
  if (input.length > 8000) return null;
  const out: Token[] = [];
  for (const part of input.split(";")) {
    let m = /^p:(\d{1,4}),(\d{1,4})$/.exec(part);
    if (m) {
      out.push({ kind: "p", x: Number(m[1]), y: Number(m[2]) });
      continue;
    }
    m = /^s:(-?\d{1,5}),(-?\d{1,5}),(\d{1,3})$/.exec(part);
    if (m) {
      out.push({ kind: "s", shot: { tx: Number(m[1]), ty: Number(m[2]), power: Number(m[3]) } });
      continue;
    }
    return null;
  }
  return out.length > 2 * MAX_SHOTS ? null : out;
}

export const encodePlace = (x: number, y: number) => `p:${x},${y}`;
export const encodeShot = (s: Shot) => `s:${s.tx},${s.ty},${s.power}`;

/** Plays the computer's turns until it is the player's turn or the game is over. */
export function playComputer(state: State, stage: number, seed: number): State {
  let s = state;
  while (s.winner === null && s.turn === 1) {
    const mv = computerMove(s, stage, seed);
    if (mv.place) {
      const placed = placeCue(s, mv.place[0], mv.place[1]);
      if (typeof placed === "string") throw new Error(`Computer placement failed: ${placed}`);
      s = placed;
    }
    s = applyShot(s, mv.shot, false).state;
  }
  return s;
}

/** Replays a whole game. Returns the final state, or an error for illegal input. */
export function replay(seed: number, stage: number, tokens: Token[]): State | string {
  let s = initialState(seed);
  let i = 0;
  while (s.winner === null) {
    if (s.turn === 1) {
      s = playComputer(s, stage, seed);
      continue;
    }
    if (i >= tokens.length) break; // the player stopped: gave up
    if (s.ballInHand) {
      const t = tokens[i++];
      if (t.kind !== "p") return "Cue ball must be placed";
      const placed = placeCue(s, t.x, t.y);
      if (typeof placed === "string") return `Bad placement: ${placed}`;
      s = placed;
      if (i >= tokens.length) break;
    }
    const t = tokens[i++];
    if (t.kind !== "s") return "Expected a shot";
    const err = shotError(s, t.shot);
    if (err) return err;
    s = applyShot(s, t.shot, false).state;
  }
  if (i < tokens.length) return "Moves after the game ended";
  return s;
}

export const pool: ArcadeGame = {
  key: "pool",
  name: "8-Ball Pool",
  tagline: "Pot your balls, then the black, before the computer.",
  howToPlay:
    "Drag on the table to aim, set the power and tap Shoot. Pot all of your group (solids or stripes), then the 8-ball, before the computer does; a foul gives the other side ball in hand anywhere.",
  kind: "versus",
  ranking: "score",
  scoreLabel: "points",
  stages: STAGES.map(({ name, goal }) => ({ name, goal })),
  timeLimitMs: 30 * 60 * 1000,
  verify({ seed, stage, input, elapsedMs }) {
    const tokens = parseInput(input);
    if (!tokens) return invalid("Invalid moves");
    const end = replay(seed, stage, tokens);
    if (typeof end === "string") return invalid(end);
    const flagged = tooFast(end.playerShots, elapsedMs, MAX_HUMAN_SHOTS_PER_SECOND);
    if (end.winner === 0) {
      const bonus = Math.max(0, 999 - 16 * (end.playerShots - 1));
      return { valid: true, cleared: true, score: stage * 1000 + bonus, flagged, detail: end.note };
    }
    if (end.winner === -1) return { valid: true, cleared: false, score: stage * 100, flagged, detail: "Draw" };
    return { valid: true, cleared: false, score: 0, flagged, detail: end.winner === 1 ? end.note.replace(/\.$/, "") : "Resigned" };
  },
};
