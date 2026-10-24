/**
 * Drawing the pool table: a felt cloth with wood rails, shaded 3D balls that roll as they travel,
 * the cue stick, and balls dropping into pockets. Purely visual; the physics lives in src/lib.
 */

import { FOOT_Y, H, HEAD_Y, POCKETS, R, W } from "@/lib/games/arcade/pool";

export const RAIL = 70; // drawn rail width, mm
export const VW = W + 2 * RAIL;
export const VH = H + 2 * RAIL;
const CUSHION = 22; // the green cushion strip inside the wood, mm

const BASE = ["#f7f4ea", "#f5c518", "#1f5fd6", "#d9302c", "#6b2fa8", "#f07d18", "#17924a", "#8a1f1f", "#141414"];
export const colorOf = (n: number) => (n <= 8 ? BASE[n] : BASE[n - 8]);

const RGB = BASE.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
const CREAM = [247, 244, 234];

/** Where each pocket is drawn (side pockets sit a little into the rail) and how big. */
export const POCKET_DRAW = POCKETS.map((p) => ({
  x: p.x === -12 ? -4 : p.x === W + 12 ? W + 4 : p.x,
  y: p.y,
  r: p.x < 0 || p.x > W ? 50 : 58,
}));

// ---------------------------------------------------------------------------
// Ball orientation: each ball keeps its three body axes in table coordinates
// (x across, y down the table, z up towards the viewer). Rolling turns them.

/** 9 numbers per ball: body axes e1, e2, e3. Solids show their number on ±e3, stripes on ±e1 with the band around e3. */
export type Orient = Float64Array;

/** Rolls a ball by (dx, dy) mm: a ball that rolls without slipping turns by distance / radius. */
export function roll(o: Orient, dx: number, dy: number) {
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return;
  const th = dist / R;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const kx = -dy / dist;
  const ky = dx / dist; // axis = up × direction, so the top of the ball moves forward
  for (let a = 0; a < 9; a += 3) {
    const vx = o[a];
    const vy = o[a + 1];
    const vz = o[a + 2];
    const kv = kx * vx + ky * vy;
    o[a] = vx * c + ky * vz * s + kx * kv * (1 - c);
    o[a + 1] = vy * c - kx * vz * s + ky * kv * (1 - c);
    o[a + 2] = vz * c + (kx * vy - ky * vx) * s;
  }
  // Keep the axes orthonormal (rounding drifts over thousands of frames).
  const l1 = Math.hypot(o[0], o[1], o[2]);
  o[0] /= l1;
  o[1] /= l1;
  o[2] /= l1;
  const d = o[0] * o[3] + o[1] * o[4] + o[2] * o[5];
  o[3] -= d * o[0];
  o[4] -= d * o[1];
  o[5] -= d * o[2];
  const l2 = Math.hypot(o[3], o[4], o[5]);
  o[3] /= l2;
  o[4] /= l2;
  o[5] /= l2;
  o[6] = o[1] * o[5] - o[2] * o[4];
  o[7] = o[2] * o[3] - o[0] * o[5];
  o[8] = o[0] * o[4] - o[1] * o[3];
}

/** Starting orientations: numbers face up, each ball turned a little differently. */
export function freshOrients(): Orient[] {
  return Array.from({ length: 16 }, (_, i) => {
    // Stripes: number axis e1 faces up, band axis e3 lies across the table.
    const o = i >= 9 ? Float64Array.from([0, 0, 1, 0, 1, 0, -1, 0, 0]) : Float64Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    roll(o, Math.sin(i * 2.3) * 9, Math.cos(i * 1.7) * 9);
    return o;
  });
}

// ---------------------------------------------------------------------------
// Ball sprites, shaded per pixel (cheap: a ball is a few hundred pixels).

type Sprite = { canvas: HTMLCanvasElement; rpx: number; dirty: boolean; img: ImageData | null };
export type Sprites = (Sprite | null)[];

const LIGHT = (() => {
  const l = [-0.38, -0.52, 0.76];
  const n = Math.hypot(l[0], l[1], l[2]);
  return l.map((v) => v / n);
})();
const HALF = (() => {
  const h = [LIGHT[0], LIGHT[1], LIGHT[2] + 1];
  const n = Math.hypot(h[0], h[1], h[2]);
  return h.map((v) => v / n);
})();

function paintSprite(sp: Sprite, n: number, o: Orient) {
  const S = sp.canvas.width;
  const ctx = sp.canvas.getContext("2d");
  if (!ctx) return;
  const img = (sp.img ??= ctx.createImageData(S, S));
  const data = img.data;
  data.fill(0);
  const c = S / 2;
  const r = sp.rpx;
  const col = RGB[n <= 8 ? n : n - 8];
  const stripe = n >= 9;
  for (let py = 0; py < S; py++) {
    const v = (py + 0.5 - c) / r;
    for (let px = 0; px < S; px++) {
      const u = (px + 0.5 - c) / r;
      const d2 = u * u + v * v;
      const edge = (1 - Math.sqrt(d2)) * r + 0.5;
      if (edge <= 0) continue;
      const z = Math.sqrt(Math.max(0, 1 - d2));
      // Body coordinates of this surface point.
      const p1 = o[0] * u + o[1] * v + o[2] * z;
      const p3 = o[6] * u + o[7] * v + o[8] * z;
      let base = col;
      if (n === 0) {
        if (Math.abs(p3) > 0.965)
          base = RGB[3]; // the cue ball's red spots, so you can see it roll
        else base = CREAM;
      } else if (stripe) {
        if (Math.abs(p3) > 0.5) base = CREAM;
        else if (Math.abs(p1) > 0.86) base = CREAM; // number circle on the band
      } else if (Math.abs(p3) > 0.86) base = CREAM;
      const diff = Math.max(0, u * LIGHT[0] + v * LIGHT[1] + z * LIGHT[2]);
      const nh = Math.max(0, u * HALF[0] + v * HALF[1] + z * HALF[2]);
      const spec = nh ** 48 * 0.85;
      const shade = 0.32 + 0.78 * diff;
      const k = (py * S + px) * 4;
      data[k] = Math.min(255, base[0] * shade + 255 * spec);
      data[k + 1] = Math.min(255, base[1] * shade + 255 * spec);
      data[k + 2] = Math.min(255, base[2] * shade + 255 * spec);
      data[k + 3] = Math.min(1, edge) * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  sp.dirty = false;
}

function spriteFor(sprites: Sprites, n: number, o: Orient, rpx: number): Sprite {
  let sp = sprites[n];
  if (!sp || Math.abs(sp.rpx - rpx) > 0.01) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = Math.ceil(rpx * 2) + 2;
    sp = { canvas, rpx, dirty: true, img: null };
    sprites[n] = sp;
  }
  if (sp.dirty) paintSprite(sp, n, o);
  return sp;
}

/** Marks a ball's sprite for repainting (it rolled). */
export function touch(sprites: Sprites, n: number) {
  const sp = sprites[n];
  if (sp) sp.dirty = true;
}

function drawBall(ctx: CanvasRenderingContext2D, sprites: Sprites, n: number, o: Orient, x: number, y: number, k: number, scale = 1) {
  const sp = spriteFor(sprites, n, o, R * k);
  const size = (sp.canvas.width / k) * scale;
  ctx.drawImage(sp.canvas, x - size / 2, y - size / 2, size, size);
  if (n === 0) return;
  // The number, on whichever number circle faces up, foreshortened as it turns away.
  const a = n >= 9 ? 0 : 6;
  const sgn = o[a + 2] >= 0 ? 1 : -1;
  const ax = o[a] * sgn;
  const ay = o[a + 1] * sgn;
  const az = o[a + 2] * sgn;
  if (az < 0.25) return;
  const ang = Math.atan2(ay, ax);
  ctx.save();
  ctx.globalAlpha *= Math.min(1, (az - 0.25) / 0.3);
  ctx.translate(x + ax * R * scale, y + ay * R * scale);
  ctx.rotate(ang);
  ctx.scale(az, 1);
  ctx.rotate(-ang);
  ctx.fillStyle = "#111";
  ctx.font = `bold ${R * 0.6 * scale}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(n), 0, R * 0.04 * scale);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// The table (cached: it only changes with the canvas size).

let tableCache: { key: string; canvas: HTMLCanvasElement } | null = null;

function woodGrain(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(-RAIL, -RAIL, VW, VH, 40);
  ctx.rect(W + CUSHION, -CUSHION, -W - 2 * CUSHION, H + 2 * CUSHION);
  ctx.clip("evenodd");
  for (let i = 0; i < 46; i++) {
    const off = ((i * 37) % 61) - 30;
    ctx.strokeStyle = i % 3 ? "rgba(255,220,170,0.05)" : "rgba(30,10,0,0.18)";
    ctx.lineWidth = 2 + (i % 4);
    ctx.beginPath();
    // Lines that run along the long rails and wrap around the short ones, gently wavy.
    const inset = -RAIL + 6 + ((i * 11) % (RAIL - CUSHION - 8));
    ctx.moveTo(inset, -RAIL);
    ctx.bezierCurveTo(inset + off * 0.2, H * 0.3, inset - off * 0.2, H * 0.7, inset, H + RAIL);
    ctx.moveTo(W - inset, -RAIL);
    ctx.bezierCurveTo(W - inset - off * 0.2, H * 0.35, W - inset + off * 0.2, H * 0.65, W - inset, H + RAIL);
    ctx.moveTo(-RAIL, inset);
    ctx.bezierCurveTo(W * 0.3, inset + off * 0.15, W * 0.7, inset - off * 0.15, W + RAIL, inset);
    ctx.moveTo(-RAIL, H - inset);
    ctx.bezierCurveTo(W * 0.3, H - inset - off * 0.15, W * 0.7, H - inset + off * 0.15, W + RAIL, H - inset);
    ctx.stroke();
  }
  ctx.restore();
}

function paintTable(ctx: CanvasRenderingContext2D, showHead: boolean) {
  // Wood rails.
  const wood = ctx.createLinearGradient(-RAIL, -RAIL, W + RAIL, H + RAIL);
  wood.addColorStop(0, "#7a4421");
  wood.addColorStop(0.35, "#5a2f15");
  wood.addColorStop(0.65, "#6e3b1b");
  wood.addColorStop(1, "#43220d");
  ctx.fillStyle = wood;
  ctx.beginPath();
  ctx.roundRect(-RAIL, -RAIL, VW, VH, 40);
  ctx.fill();
  woodGrain(ctx);
  // A polished edge on the outside of the rail.
  ctx.strokeStyle = "rgba(255,210,150,0.25)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(-RAIL + 4, -RAIL + 4, VW - 8, VH - 8, 36);
  ctx.stroke();

  // Cushions (a darker green strip) and the cloth.
  ctx.fillStyle = "#0a5530";
  ctx.fillRect(-CUSHION, -CUSHION, W + 2 * CUSHION, H + 2 * CUSHION);
  const felt = ctx.createRadialGradient(W / 2, H * 0.45, 80, W / 2, H / 2, H * 0.72);
  felt.addColorStop(0, "#22a565");
  felt.addColorStop(0.55, "#138a4e");
  felt.addColorStop(1, "#0a6338");
  ctx.fillStyle = felt;
  ctx.fillRect(0, 0, W, H);
  // Cushion shading where the cloth meets the rubber.
  ctx.strokeStyle = "rgba(0,0,0,0.28)";
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, W - 8, H - 8);

  // Sights (diamonds) on the rails.
  ctx.fillStyle = "#f3e9cf";
  const mid = -(RAIL + CUSHION) / 2;
  const diamond = (x: number, y: number) => {
    ctx.beginPath();
    ctx.moveTo(x, y - 10);
    ctx.lineTo(x + 7, y);
    ctx.lineTo(x, y + 10);
    ctx.lineTo(x - 7, y);
    ctx.closePath();
    ctx.fill();
  };
  for (let i = 1; i < 8; i++) {
    if (i === 4) continue;
    diamond(mid, (H * i) / 8);
    diamond(W - mid, (H * i) / 8);
  }
  for (let i = 1; i < 4; i++) {
    diamond((W * i) / 4, mid);
    diamond((W * i) / 4, H - mid);
  }

  // Head string and foot spot.
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 4;
  if (showHead) {
    ctx.setLineDash([20, 20]);
    ctx.beginPath();
    ctx.moveTo(0, HEAD_Y);
    ctx.lineTo(W, HEAD_Y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.arc(W / 2, FOOT_Y, 7, 0, Math.PI * 2);
  ctx.fill();

  // Pockets: a metal-and-leather rim around a deep hole.
  for (const p of POCKET_DRAW) {
    const rim = ctx.createRadialGradient(p.x, p.y, p.r * 0.7, p.x, p.y, p.r + 14);
    rim.addColorStop(0, "#2a2a2a");
    rim.addColorStop(0.6, "#9a8b6d");
    rim.addColorStop(1, "#3c2a17");
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 12, 0, Math.PI * 2);
    ctx.fill();
    const hole = ctx.createRadialGradient(p.x - p.r * 0.2, p.y - p.r * 0.2, 4, p.x, p.y, p.r);
    hole.addColorStop(0, "#000");
    hole.addColorStop(0.75, "#060606");
    hole.addColorStop(1, "#1d1d1d");
    ctx.fillStyle = hole;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function tableImage(width: number, height: number, k: number, showHead: boolean): HTMLCanvasElement {
  const key = `${width}x${height}:${showHead}`;
  if (tableCache?.key === key) return tableCache.canvas;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.setTransform(k, 0, 0, k, RAIL * k, RAIL * k);
    paintTable(ctx, showHead);
  }
  tableCache = { key, canvas };
  return canvas;
}

// ---------------------------------------------------------------------------
// The cue stick.

/** `at` is the cue ball's centre, `dir` the shot direction; the tip sits `back` mm behind the ball's edge. */
export type Stick = { at: { x: number; y: number }; dir: { x: number; y: number }; back: number; alpha: number };
export const STICK_LEN = 1450;

function drawStick(ctx: CanvasRenderingContext2D, s: Stick) {
  const { dir } = s;
  const tx = s.at.x - dir.x * (R + s.back);
  const ty = s.at.y - dir.y * (R + s.back);
  const bx = tx - dir.x * STICK_LEN;
  const by = ty - dir.y * STICK_LEN;
  const nx = -dir.y;
  const ny = dir.x;
  const shape = (ox: number, oy: number) => {
    ctx.beginPath();
    ctx.moveTo(tx + nx * 6 + ox, ty + ny * 6 + oy);
    ctx.lineTo(bx + nx * 15 + ox, by + ny * 15 + oy);
    ctx.lineTo(bx - nx * 15 + ox, by - ny * 15 + oy);
    ctx.lineTo(tx - nx * 6 + ox, ty - ny * 6 + oy);
    ctx.closePath();
  };
  ctx.save();
  ctx.globalAlpha = s.alpha;
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  shape(18, 26);
  ctx.fill();
  const g = ctx.createLinearGradient(tx, ty, bx, by);
  g.addColorStop(0, "#3d6fd1"); // chalk
  g.addColorStop(0.01, "#3d6fd1");
  g.addColorStop(0.011, "#f4eedc"); // ferrule
  g.addColorStop(0.03, "#f4eedc");
  g.addColorStop(0.031, "#ecd29b"); // maple shaft
  g.addColorStop(0.5, "#d8b06c");
  g.addColorStop(0.55, "#d8b06c");
  g.addColorStop(0.551, "#1c1c1c"); // joint ring
  g.addColorStop(0.565, "#1c1c1c");
  g.addColorStop(0.566, "#6a2f12"); // butt
  g.addColorStop(0.78, "#43200b");
  g.addColorStop(0.781, "#202020"); // wrap
  g.addColorStop(0.96, "#2b2b2b");
  g.addColorStop(0.961, "#111");
  ctx.fillStyle = g;
  shape(0, 0);
  ctx.fill();
  // A highlight along the shaft.
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(tx + nx * 2.5, ty + ny * 2.5);
  ctx.lineTo(bx + nx * 7, by + ny * 7);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// The whole scene.

/** A ball falling into a pocket: `p` runs 0 → 1. */
export type Drop = { n: number; x: number; y: number; px: number; py: number; p: number };

export type Scene = {
  xs: Float32Array;
  showHead: boolean;
  orients: Orient[];
  sprites: Sprites;
  /** Aim line from the cue ball to where it first hits, and the object ball's path. */
  aim: { cue: { x: number; y: number }; end: { x: number; y: number }; hit: number } | null;
  place: { at: { x: number; y: number }; ok: boolean } | null;
  stick: Stick | null;
  drops: Drop[];
};

export function drawScene(canvas: HTMLCanvasElement, sc: Scene) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const k = canvas.width / VW;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(tableImage(canvas.width, canvas.height, k, sc.showHead), 0, 0);
  ctx.setTransform(k, 0, 0, k, RAIL * k, RAIL * k);
  const { xs } = sc;

  // Balls dropping into pockets: they slide to the centre and sink (shrink and darken).
  for (const d of sc.drops) {
    const p = Math.min(1, d.p);
    const slide = 1 - (1 - Math.min(1, p * 1.6)) ** 2;
    const x = d.x + (d.px - d.x) * slide;
    const y = d.y + (d.py - d.y) * slide;
    ctx.save();
    ctx.globalAlpha = 1 - p * p;
    drawBall(ctx, sc.sprites, d.n, sc.orients[d.n], x, y, k, 1 - 0.5 * p * p);
    // The pocket's darkness closes over it as it falls.
    ctx.globalAlpha = Math.min(1, p * 1.2) * 0.85;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(x, y, R * (1 - 0.5 * p * p) + 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Aim line and ghost ball.
  if (sc.aim) {
    const { cue, end, hit } = sc.aim;
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 5;
    ctx.setLineDash([16, 12]);
    ctx.beginPath();
    ctx.moveTo(cue.x, cue.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(end.x, end.y, R, 0, Math.PI * 2);
    ctx.stroke();
    if (hit > 0) {
      const bx = xs[2 * hit];
      const by = xs[2 * hit + 1];
      const l = Math.hypot(bx - end.x, by - end.y) || 1;
      ctx.strokeStyle = "rgba(250,204,21,0.85)";
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + ((bx - end.x) / l) * 280, by + ((by - end.y) / l) * 280);
      ctx.stroke();
    }
  }

  // Shadows first, so no ball's shadow falls on top of another ball.
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  for (let i = 0; i < 16; i++) {
    const x = xs[2 * i];
    if (Number.isNaN(x)) continue;
    ctx.beginPath();
    ctx.ellipse(x + R * 0.28, xs[2 * i + 1] + R * 0.36, R * 1.02, R * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 15; i >= 0; i--) {
    const x = xs[2 * i];
    if (Number.isNaN(x)) continue;
    drawBall(ctx, sc.sprites, i, sc.orients[i], x, xs[2 * i + 1], k);
  }

  if (sc.stick && sc.stick.alpha > 0) drawStick(ctx, sc.stick);

  // Ball in hand marker.
  if (sc.place) {
    const { at, ok } = sc.place;
    ctx.strokeStyle = ok ? "rgba(52,211,153,0.9)" : "rgba(248,113,113,0.95)";
    ctx.lineWidth = 6;
    ctx.setLineDash([12, 10]);
    ctx.beginPath();
    ctx.arc(at.x, at.y, R + 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
