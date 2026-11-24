import { GOAL_H, GOAL_W, KEEPER_X, KEEPER_Y } from "@/lib/games/arcade/penalty";

/**
 * Drawing for the penalty games (solo and two-player). The camera sits behind the penalty spot,
 * looking at the goal. Goal coordinates are centimetres; the scene is 750 × 500 units.
 */

export const SCENE_W = 750;
export const SCENE_H = 500;
const GOAL_LEFT = 75;
const GROUND_Y = 360;
const K = 600 / GOAL_W;
export const SPOT: [number, number] = [375, 470];

export const toScene = (x: number, y: number): [number, number] => [GOAL_LEFT + x * K, GROUND_Y - y * K];
export const fromScene = (sx: number, sy: number): [number, number] => [(sx - GOAL_LEFT) / K, (GROUND_Y - sy) / K];

export function drawPitch(ctx: CanvasRenderingContext2D, calm: boolean, now: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, SCENE_H);
  sky.addColorStop(0, "#0b1020");
  sky.addColorStop(0.55, "#1e1b4b");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, SCENE_W, SCENE_H);
  // Stadium lights.
  for (const x of [90, 660]) {
    const g = ctx.createRadialGradient(x, 30, 2, x, 30, 160);
    g.addColorStop(0, `rgba(250,250,210,${calm ? 0.35 : 0.3 + Math.sin(now / 1400 + x) * 0.04})`);
    g.addColorStop(1, "rgba(250,250,210,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - 160, 0, 320, 200);
  }
  // Crowd: a band of soft dots.
  ctx.fillStyle = "rgba(167,139,250,0.18)";
  for (let i = 0; i < 160; i++) ctx.fillRect((i * 47) % SCENE_W, 120 + ((i * 31) % 60), 3, 3);
  // Grass with mowing stripes.
  const top = GROUND_Y - 30;
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? "#15803d" : "#166534";
    const y0 = top + ((SCENE_H - top) * i) / 8;
    ctx.fillRect(0, y0, SCENE_W, (SCENE_H - top) / 8 + 1);
  }
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y + 2);
  ctx.lineTo(SCENE_W, GROUND_Y + 2);
  ctx.moveTo(20, GROUND_Y + 2);
  ctx.lineTo(-40, SCENE_H);
  ctx.moveTo(SCENE_W - 20, GROUND_Y + 2);
  ctx.lineTo(SCENE_W + 40, SCENE_H);
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.ellipse(SPOT[0], SPOT[1] + 6, 7, 3, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function drawGoal(ctx: CanvasRenderingContext2D, shake: number) {
  const [x0, y0] = toScene(0, GOAL_H);
  const [x1, y1] = toScene(GOAL_W, 0);
  ctx.save();
  ctx.translate(shake, 0);
  // Net.
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = x0; x <= x1; x += 15) {
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
  }
  for (let y = y0; y <= y1; y += 15) {
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
  }
  ctx.stroke();
  // Posts and bar.
  ctx.strokeStyle = "#f8fafc";
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  ctx.shadowColor = "#a78bfa";
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(x0, y1);
  ctx.lineTo(x0, y0);
  ctx.lineTo(x1, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();
}

/** Keeper at (x, y) cm (body centre), leaning by `tilt` radians as he dives. */
export function drawKeeper(ctx: CanvasRenderingContext2D, x: number, y: number, tilt: number, jersey = "#f59e0b", gloves = "#22d3a6") {
  const [sx, sy] = toScene(x, y);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(tilt);
  // Legs.
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 12;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-8, 30);
  ctx.lineTo(-14, 72);
  ctx.moveTo(8, 30);
  ctx.lineTo(14, 72);
  ctx.stroke();
  // Arms up and out.
  ctx.strokeStyle = jersey;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(-14, -18);
  ctx.lineTo(-44, -44);
  ctx.moveTo(14, -18);
  ctx.lineTo(44, -44);
  ctx.stroke();
  // Body.
  ctx.fillStyle = jersey;
  ctx.beginPath();
  ctx.roundRect(-18, -26, 36, 58, 12);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(-12, -18, 24, 5);
  // Head.
  ctx.fillStyle = "#7c4a2d";
  ctx.beginPath();
  ctx.arc(0, -40, 12, 0, Math.PI * 2);
  ctx.fill();
  // Gloves.
  ctx.fillStyle = gloves;
  ctx.shadowColor = gloves;
  ctx.shadowBlur = 10;
  for (const gx of [-46, 46]) {
    ctx.beginPath();
    ctx.arc(gx, -46, 9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.restore();
}

/** The keeper's lean for a dive towards (tx, ty) cm, progress p 0–1. */
export function diveTilt(tx: number, ty: number, p: number) {
  const dx = tx - KEEPER_X;
  const dy = ty - KEEPER_Y;
  const side = Math.max(-1, Math.min(1, dx / 300));
  return side * (0.35 + Math.max(0, -dy) / 600 + Math.min(1, Math.abs(dx) / 300) * 0.9) * p;
}

/** A ball flying from the spot to (x, y) cm; t 0–1. It shrinks as it goes away from the camera. */
export function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, spin: number) {
  const [tx, ty] = toScene(x, y);
  const k = Math.max(0, Math.min(1, t));
  const sx = SPOT[0] + (tx - SPOT[0]) * k;
  const sy = SPOT[1] + (ty - SPOT[1]) * k - Math.sin(k * Math.PI) * 40 * (1 - y / 400);
  const r = 16 - 7 * k;
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(SPOT[0] + (tx - SPOT[0]) * k, SPOT[1] + 8 + (GROUND_Y + 4 - SPOT[1] - 8) * k, r, r * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(spin);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0b1020";
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const px = Math.cos(a) * r * 0.38;
    const py = Math.sin(a) * r * 0.38;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.fill();
  ctx.restore();
  return [sx, sy] as const;
}

/** The kicker's run-up: from behind and to the left of the ball, reaching it at p = 1. */
export function drawKicker(ctx: CanvasRenderingContext2D, p: number, jersey = "#7c3aed") {
  const k = Math.max(0, Math.min(1, p));
  const x = SPOT[0] - 90 + 70 * k;
  const y = SPOT[1] + 30 - 10 * k;
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = jersey;
  ctx.beginPath();
  ctx.roundRect(-16, -60, 32, 50, 10);
  ctx.fill();
  ctx.fillStyle = "#7c4a2d";
  ctx.beginPath();
  ctx.arc(0, -72, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  const stride = Math.sin(k * Math.PI * 4) * 12;
  ctx.beginPath();
  ctx.moveTo(-6, -12);
  ctx.lineTo(-8 - stride, 22);
  ctx.moveTo(6, -12);
  ctx.lineTo(10 + stride, 22);
  ctx.stroke();
  ctx.restore();
}

/** The aiming sight, in goal cm. */
export function drawSight(ctx: CanvasRenderingContext2D, x: number, y: number, alpha: number, calm: boolean) {
  const [sx, sy] = toScene(x, y);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.shadowColor = "#22d3a6";
  ctx.shadowBlur = calm ? 0 : 10;
  ctx.beginPath();
  ctx.arc(sx, sy, 12, 0, Math.PI * 2);
  ctx.moveTo(sx - 20, sy);
  ctx.lineTo(sx - 6, sy);
  ctx.moveTo(sx + 6, sy);
  ctx.lineTo(sx + 20, sy);
  ctx.moveTo(sx, sy - 20);
  ctx.lineTo(sx, sy - 6);
  ctx.moveTo(sx, sy + 6);
  ctx.lineTo(sx, sy + 20);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

export const OUTCOME_TEXT: Record<string, string> = {
  goal: "GOAL!",
  saved: "Saved!",
  post: "Off the post!",
  wide: "Wide!",
  over: "Over the bar!",
  late: "Too slow!",
};
