import { SIZE, type Dir } from "@/lib/games/arcade/snake";
import { ease } from "../fx/motion";

/**
 * Canvas drawing for snake. Purely visual: it reads the game state and a few timestamps,
 * and glides the snake between the last two ticks. It never touches the game itself.
 */

export type Particle = { x: number; y: number; vx: number; vy: number; born: number; life: number; hue: number; r: number };

export type SnakeScene = {
  wrap: boolean;
  /** Body before the latest tick and after it (cell indexes, head first). */
  prev: number[];
  body: number[];
  /** 0 → 1 through the current tick. */
  alpha: number;
  dir: Dir;
  alive: boolean;
  food: number;
  /** When the current food appeared (it grows in). */
  foodBorn: number;
  /** The food just eaten, shrinking as the head swallows it. */
  swallow: { cell: number; at: number } | null;
  crashAt: number | null;
  particles: Particle[];
  now: number;
  tickMs: number;
  /** Player prefers reduced motion: no pulsing. */
  calm: boolean;
};

const VEC: Record<Dir, [number, number]> = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
const cx = (cell: number) => (cell % SIZE) + 0.5;
const cy = (cell: number) => Math.floor(cell / SIZE) + 0.5;
const mod = (v: number) => ((v % SIZE) + SIZE) % SIZE;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Shortest step from a to b, going round the edge when the board wraps. */
function delta(a: number, b: number, wrap: boolean) {
  let d = b - a;
  if (wrap) {
    if (d > SIZE / 2) d -= SIZE;
    else if (d < -SIZE / 2) d += SIZE;
  }
  return d;
}

/** Calls draw at every board offset where a shape spanning x0..x1, y0..y1 would be visible (for wrapping boards). */
function wrapped(wrap: boolean, x0: number, x1: number, y0: number, y1: number, draw: (ox: number, oy: number) => void) {
  if (!wrap) return draw(0, 0);
  const lo = Math.min(x0, x1);
  const hi = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  for (const ox of [0, -SIZE, SIZE]) {
    if (lo + ox > SIZE + 1 || hi + ox < -1) continue;
    for (const oy of [0, -SIZE, SIZE]) {
      if (top + oy > SIZE + 1 || bottom + oy < -1) continue;
      draw(ox, oy);
    }
  }
}

/** Board background and walls, drawn once per size. */
export function drawBackground(px: number, dpr: number, walls: Uint8Array): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(px * dpr));
  c.height = c.width;
  const ctx = c.getContext("2d")!;
  const cell = c.width / SIZE;
  const bg = ctx.createLinearGradient(0, 0, c.width, c.height);
  bg.addColorStop(0, "#0b2230");
  bg.addColorStop(0.55, "#0a1424");
  bg.addColorStop(1, "#1b0f30");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "rgba(255,255,255,0.028)";
  for (let r = 0; r < SIZE; r++) for (let k = 0; k < SIZE; k++) if ((r + k) % 2 === 0) ctx.fillRect(k * cell, r * cell, cell, cell);

  ctx.save();
  ctx.shadowColor = "rgba(129,140,248,0.55)";
  ctx.shadowBlur = cell * 0.35;
  for (let i = 0; i < walls.length; i++) {
    if (!walls[i]) continue;
    const x = (i % SIZE) * cell;
    const y = Math.floor(i / SIZE) * cell;
    const g = ctx.createLinearGradient(x, y, x, y + cell);
    g.addColorStop(0, "#a5b4fc");
    g.addColorStop(0.35, "#6366f1");
    g.addColorStop(1, "#312e81");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x + cell * 0.06, y + cell * 0.06, cell * 0.88, cell * 0.88, cell * 0.2);
    ctx.fill();
  }
  ctx.restore();
  return c;
}

/** Draws one frame on a canvas `px` CSS pixels square. `dt` is seconds since the last frame (for particles). */
export function drawSnake(ctx: CanvasRenderingContext2D, bg: HTMLCanvasElement | null, scene: SnakeScene, px: number, dpr: number, dt: number) {
  const { wrap, prev, body, alpha, now } = scene;
  const cell = px / SIZE;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, px, px);
  if (bg) ctx.drawImage(bg, 0, 0, px, px);
  ctx.setTransform(dpr * cell, 0, 0, dpr * cell, 0, 0);

  // ---- food
  const pulse = scene.calm ? 1 : 1 + 0.08 * Math.sin(now / 160);
  const drawFood = (cell0: number, scale: number) => {
    if (scale <= 0.01) return;
    const x = cx(cell0);
    const y = cy(cell0);
    if (!scene.calm) {
      const ring = (now % 1200) / 1200;
      ctx.strokeStyle = `rgba(251,113,133,${0.45 * (1 - ring)})`;
      ctx.lineWidth = 0.06;
      ctx.beginPath();
      ctx.arc(x, y, (0.35 + ring * 0.45) * scale, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.save();
    ctx.shadowColor = "rgba(251,113,133,0.9)";
    ctx.shadowBlur = cell * dpr * 0.5;
    const r = 0.34 * scale * pulse;
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, "#fef3c7");
    g.addColorStop(0.35, "#fb7185");
    g.addColorStop(1, "#be123c");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#4ade80";
    ctx.beginPath();
    ctx.ellipse(x + r * 0.35, y - r * 0.95, r * 0.32, r * 0.16, -0.6, 0, Math.PI * 2);
    ctx.fill();
  };
  if (scene.food >= 0 && now >= scene.foodBorn) drawFood(scene.food, ease.outBack(clamp01((now - scene.foodBorn) / 260)));
  if (scene.swallow && now - scene.swallow.at < scene.tickMs) drawFood(scene.swallow.cell, 1 - alpha);

  // ---- snake: each segment glides from where it was to where it is
  const pts: [number, number][] = body.map((to, i) => {
    const from = prev[Math.min(i, prev.length - 1)] ?? to;
    const x = cx(from) + delta(cx(from), cx(to), wrap) * alpha;
    const y = cy(from) + delta(cy(from), cy(to), wrap) * alpha;
    return wrap ? [mod(x), mod(y)] : [x, y];
  });
  let [fx, fy] = VEC[scene.dir];
  if (prev.length && prev[0] !== body[0]) {
    const dx = delta(cx(prev[0]), cx(body[0]), wrap);
    const dy = delta(cy(prev[0]), cy(body[0]), wrap);
    const len = Math.hypot(dx, dy) || 1;
    fx = dx / len;
    fy = dy / len;
  }
  if (scene.crashAt !== null) {
    // A little bump into whatever it hit.
    const t = clamp01((now - scene.crashAt) / 240);
    const bump = 0.25 * Math.sin(Math.PI * t);
    pts[0] = [pts[0][0] + fx * bump, pts[0][1] + fy * bump];
  }
  const n = pts.length;
  const hue = (i: number) => 135 + (200 * i) / Math.max(n - 1, 1);
  const width = (i: number) => 0.8 - 0.32 * (i / Math.max(n - 1, 1)) ** 1.4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const pass = (style: (i: number) => string, w: (i: number) => number, shift = 0) => {
    for (let i = n - 1; i >= 1; i--) {
      const [ax, ay] = pts[i];
      const bx = ax + delta(ax, pts[i - 1][0], wrap);
      const by = ay + delta(ay, pts[i - 1][1], wrap);
      ctx.strokeStyle = style(i);
      ctx.lineWidth = w(i);
      wrapped(wrap, ax, bx, ay, by, (ox, oy) => {
        ctx.beginPath();
        ctx.moveTo(ax + ox + shift, ay + oy + shift);
        ctx.lineTo(bx + ox + shift, by + oy + shift);
        ctx.stroke();
      });
    }
  };
  pass((i) => `hsla(${hue(i)},95%,55%,0.18)`, (i) => width(i) + 0.32);
  pass((i) => `hsl(${hue(i)},85%,${scene.calm ? 50 : 50 + 6 * Math.sin(i * 0.9 - now / 140)}%)`, width);
  pass((i) => `hsla(${hue(i)},100%,85%,0.35)`, (i) => width(i) * 0.28, -0.08);

  // ---- head and eyes
  const [hx, hy] = pts[0];
  wrapped(wrap, hx - 0.5, hx + 0.5, hy - 0.5, hy + 0.5, (ox, oy) => {
    const x = hx + ox;
    const y = hy + oy;
    const g = ctx.createRadialGradient(x - 0.15, y - 0.15, 0.05, x, y, 0.48);
    g.addColorStop(0, "hsl(140,100%,75%)");
    g.addColorStop(1, "hsl(140,85%,42%)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 0.47, 0, Math.PI * 2);
    ctx.fill();
    for (const side of [-1, 1]) {
      const ex = x + fx * 0.12 - fy * 0.2 * side;
      const ey = y + fy * 0.12 + fx * 0.2 * side;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(ex, ey, 0.13, 0, Math.PI * 2);
      ctx.fill();
      if (scene.alive) {
        ctx.fillStyle = "#0f172a";
        ctx.beginPath();
        ctx.arc(ex + fx * 0.05, ey + fy * 0.05, 0.07, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 0.045;
        ctx.beginPath();
        ctx.moveTo(ex - 0.07, ey - 0.07);
        ctx.lineTo(ex + 0.07, ey + 0.07);
        ctx.moveTo(ex + 0.07, ey - 0.07);
        ctx.lineTo(ex - 0.07, ey + 0.07);
        ctx.stroke();
      }
    }
  });

  // ---- particles: thrown out, slowed by drag, pulled down a little
  const live: Particle[] = [];
  for (const p of scene.particles) {
    if (now < p.born) {
      live.push(p);
      continue;
    }
    const age = (now - p.born) / p.life;
    if (age >= 1) continue;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - 3 * dt;
    p.vy = p.vy * (1 - 3 * dt) + 6 * dt;
    ctx.fillStyle = `hsla(${p.hue},95%,62%,${1 - age})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * (1 - age * 0.5), 0, Math.PI * 2);
    ctx.fill();
    live.push(p);
  }
  scene.particles = live;
}

/** A burst of sparks at a cell, starting after `delay` ms. */
export function burst(cell: number, now: number, delay: number, count = 16): Particle[] {
  return Array.from({ length: count }, (_, k) => {
    const a = (k / count) * Math.PI * 2 + Math.random() * 0.4;
    const speed = 3 + Math.random() * 4;
    return {
      x: cx(cell),
      y: cy(cell),
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      born: now + delay,
      life: 380 + Math.random() * 260,
      hue: [350, 40, 140, 190, 290][k % 5],
      r: 0.07 + Math.random() * 0.07,
    };
  });
}
