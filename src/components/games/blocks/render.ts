import { CELLS, dropRow, fits, H, LOCK_TICKS, W, type BlocksState, type Piece } from "@/lib/games/arcade/blocks";
import { ease } from "../fx/motion";

/**
 * Canvas drawing for the block stacker. Purely visual: it reads the game state and the effects
 * the game loop recorded (locks, hard drops, line clears) and never changes the game.
 */

/** Light, base and dark shade for each piece type (I O T S Z J L). */
export const PALETTE: [string, string, string][] = [
  ["#cffafe", "#22d3ee", "#0e7490"],
  ["#fef9c3", "#facc15", "#a16207"],
  ["#fae8ff", "#d946ef", "#86198f"],
  ["#dcfce7", "#4ade80", "#15803d"],
  ["#ffe4e6", "#f43f5e", "#9f1239"],
  ["#dbeafe", "#3b82f6", "#1e3a8a"],
  ["#ffedd5", "#fb923c", "#c2410c"],
];

export const FLASH_MS = 140;
export const COLLAPSE_MS = 230;

type Spark = { x: number; y: number; vx: number; vy: number; born: number; life: number; colour: string; r: number };

/** Effects recorded by the game loop, plus the smoothing state of the falling piece. */
export type BlocksFx = {
  piece: Piece | null;
  /** Where the piece was drawn relative to where it is; decays to zero so moves glide. */
  off: { x: number; y: number };
  prevTarget: { x: number; y: number };
  spawnAt: number;
  rotAt: number;
  boardVersion: number;
  lockFlash: { cells: number[]; at: number } | null;
  slam: { type: number; cols: { x: number; from: number; to: number }[]; at: number; power: number } | null;
  clear: { rows: number[]; merged: Uint8Array; at: number } | null;
  sparks: Spark[];
};

export const newFx = (): BlocksFx => ({
  piece: null,
  off: { x: 0, y: 0 },
  prevTarget: { x: 0, y: 0 },
  spawnAt: 0,
  rotAt: -1,
  boardVersion: 0,
  lockFlash: null,
  slam: null,
  clear: null,
  sparks: [],
});

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Falls under gravity, then a small bounce as it settles. */
const land = (t: number) => (t < 0.78 ? (t / 0.78) ** 2 : 1 - 0.07 * Math.sin(((t - 0.78) / 0.22) * Math.PI));
const boxSize = (type: number) => (type === 0 ? 4 : type === 1 ? 2 : 3);

/** Everything sized to the canvas: background, one sprite per piece type, and a cached drawing of the stack. */
export type Surface = {
  px: number;
  dpr: number;
  bg: HTMLCanvasElement;
  sprites: HTMLCanvasElement[];
  stack: HTMLCanvasElement;
  stackVersion: number;
};

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function sprite(size: number, [light, base, dark]: [string, string, string]) {
  const c = canvas(size, size);
  const ctx = c.getContext("2d")!;
  const s = c.width;
  const pad = Math.max(0.5, s * 0.04);
  const g = ctx.createLinearGradient(0, 0, s, s);
  g.addColorStop(0, light);
  g.addColorStop(0.4, base);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(pad, pad, s - 2 * pad, s - 2 * pad, s * 0.18);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.32)";
  ctx.beginPath();
  ctx.roundRect(s * 0.18, s * 0.12, s * 0.64, s * 0.16, s * 0.08);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = Math.max(1, s * 0.04);
  ctx.beginPath();
  ctx.roundRect(pad, pad, s - 2 * pad, s - 2 * pad, s * 0.18);
  ctx.stroke();
  return c;
}

export function makeSurface(px: number, dpr: number): Surface {
  const cell = (px / W) * dpr;
  const bg = canvas(px * dpr, px * 2 * dpr);
  const ctx = bg.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, bg.height);
  g.addColorStop(0, "#160b33");
  g.addColorStop(0.5, "#0b1430");
  g.addColorStop(1, "#071a24");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, bg.width, bg.height);
  ctx.fillStyle = "rgba(255,255,255,0.035)";
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      ctx.beginPath();
      ctx.roundRect(c * cell + cell * 0.06, r * cell + cell * 0.06, cell * 0.88, cell * 0.88, cell * 0.16);
      ctx.fill();
    }
  return {
    px,
    dpr,
    bg,
    sprites: PALETTE.map((p) => sprite(Math.ceil(cell), p)),
    stack: canvas(px * dpr, px * 2 * dpr),
    stackVersion: -1,
  };
}

function drawCells(ctx: CanvasRenderingContext2D, sprites: HTMLCanvasElement[], board: Uint8Array, rowY: (r: number) => number | null) {
  for (let r = 0; r < H; r++) {
    const y = rowY(r);
    if (y === null) continue;
    for (let c = 0; c < W; c++) {
      const v = board[r * W + c];
      if (v) ctx.drawImage(sprites[v - 1], c, y, 1, 1);
    }
  }
}

/** Sparks flying out of cleared rows. */
export function clearSparks(rows: number[], merged: Uint8Array, now: number, calm: boolean): Spark[] {
  if (calm) return [];
  const out: Spark[] = [];
  for (const r of rows)
    for (let c = 0; c < W; c++) {
      const v = merged[r * W + c];
      for (let k = 0; k < 2; k++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
        const speed = 4 + Math.random() * 7;
        out.push({
          x: c + 0.5,
          y: r + 0.5,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          born: now + FLASH_MS * 0.5,
          life: 450 + Math.random() * 300,
          colour: PALETTE[(v || 1) - 1][k ? 0 : 1],
          r: 0.08 + Math.random() * 0.08,
        });
      }
    }
  return out;
}

/** Where the piece should appear: its row, plus how far gravity has got toward the next row. */
export function pieceTarget(s: BlocksState) {
  const p = s.piece;
  const canFall = fits(s.board, p.type, p.rot, p.x, p.y + 1);
  return { x: p.x, y: p.y + (canFall ? s.fall / s.gravity : 0) };
}

/** Moves the smoothing offsets: jumps (side steps, soft drops, kicks) glide; steady gravity is drawn exactly. */
export function follow(fx: BlocksFx, s: BlocksState, now: number, dt: number, calm: boolean) {
  const t = pieceTarget(s);
  if (fx.piece !== s.piece) {
    fx.piece = s.piece;
    fx.off = { x: 0, y: 0 };
    fx.spawnAt = now;
  } else {
    const dx = t.x - fx.prevTarget.x;
    const dy = t.y - fx.prevTarget.y;
    fx.off.x -= dx;
    if (dy < 0 || dy > 2.5 / s.gravity + 0.05) fx.off.y -= dy;
  }
  fx.prevTarget = t;
  const k = calm ? 0 : Math.exp(-dt / 0.035);
  fx.off.x *= k;
  fx.off.y *= k;
  if (Math.abs(fx.off.x) < 0.002) fx.off.x = 0;
  if (Math.abs(fx.off.y) < 0.002) fx.off.y = 0;
  return t;
}

export function drawBlocks(ctx: CanvasRenderingContext2D, sf: Surface, s: BlocksState, fx: BlocksFx, now: number, dt: number, calm: boolean) {
  const { px, dpr } = sf;
  const cell = px / W;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, px * dpr, px * 2 * dpr);
  ctx.drawImage(sf.bg, 0, 0);

  // A hard drop jolts the whole board down and lets it spring back.
  let jolt = 0;
  if (fx.slam && !calm) {
    const t = clamp01((now - fx.slam.at) / 260);
    if (t < 1) jolt = fx.slam.power * 0.22 * Math.sin(t * Math.PI * 2) * (1 - t);
  }
  ctx.setTransform(dpr * cell, 0, 0, dpr * cell, 0, jolt * dpr * cell);

  // ---- the stack
  const clearing = fx.clear && now - fx.clear.at < FLASH_MS + COLLAPSE_MS && !calm ? fx.clear : null;
  if (clearing) {
    const { rows, merged, at } = clearing;
    const t = now - at;
    const gone = new Set(rows);
    if (t < FLASH_MS) {
      const p = t / FLASH_MS;
      drawCells(ctx, sf.sprites, merged, (r) => (gone.has(r) ? null : r));
      for (const r of rows) {
        const h = 1 - ease.inQuad(p);
        ctx.save();
        ctx.translate(0, r + 0.5);
        ctx.scale(1, h);
        drawCells(ctx, sf.sprites, merged, (rr) => (rr === r ? -0.5 : null));
        ctx.restore();
        ctx.fillStyle = `rgba(255,255,255,${0.85 * (1 - p * 0.6)})`;
        ctx.beginPath();
        ctx.roundRect(0.05, r + 0.5 - h / 2, W - 0.1, h, 0.2);
        ctx.fill();
      }
    } else {
      const p = land(clamp01((t - FLASH_MS) / COLLAPSE_MS));
      drawCells(ctx, sf.sprites, merged, (r) => {
        if (gone.has(r)) return null;
        let below = 0;
        for (const g of rows) if (g > r) below++;
        return r + below * p;
      });
    }
  } else {
    if (sf.stackVersion !== fx.boardVersion) {
      const sc = sf.stack.getContext("2d")!;
      sc.setTransform(1, 0, 0, 1, 0, 0);
      sc.clearRect(0, 0, sf.stack.width, sf.stack.height);
      sc.setTransform(dpr * cell, 0, 0, dpr * cell, 0, 0);
      drawCells(sc, sf.sprites, s.board, (r) => r);
      sf.stackVersion = fx.boardVersion;
    }
    ctx.drawImage(sf.stack, 0, 0, W, H);
  }

  // The piece that just locked flashes white.
  if (fx.lockFlash && !clearing) {
    const a = 1 - (now - fx.lockFlash.at) / 180;
    if (a > 0) {
      ctx.fillStyle = `rgba(255,255,255,${0.55 * a})`;
      for (const i of fx.lockFlash.cells) {
        ctx.beginPath();
        ctx.roundRect((i % W) + 0.04, Math.floor(i / W) + 0.04, 0.92, 0.92, 0.18);
        ctx.fill();
      }
    }
  }

  // ---- hard-drop trail
  if (fx.slam) {
    const t = clamp01((now - fx.slam.at) / 220);
    if (t < 1) {
      const base = PALETTE[fx.slam.type][1];
      for (const { x, from, to } of fx.slam.cols) {
        const top = from + (to - from) * ease.outCubic(t);
        if (to - top < 0.05) continue;
        const g = ctx.createLinearGradient(0, top, 0, to);
        g.addColorStop(0, "rgba(255,255,255,0)");
        g.addColorStop(1, base);
        ctx.globalAlpha = 0.55 * (1 - t);
        ctx.fillStyle = g;
        ctx.fillRect(x + 0.15, top, 0.7, to - top);
      }
      ctx.globalAlpha = 1;
    }
  }

  // ---- danger glow when the stack is near the top
  let top = H;
  for (let i = 0; i < s.board.length; i++)
    if (s.board[i]) {
      top = Math.floor(i / W);
      break;
    }
  if (top < 6 && s.alive) {
    const a = 0.2 + (calm ? 0 : 0.1 * Math.sin(now / 180));
    const g = ctx.createLinearGradient(0, 0, 0, 6);
    g.addColorStop(0, `rgba(244,63,94,${a})`);
    g.addColorStop(1, "rgba(244,63,94,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, 6);
  }

  if (s.alive) {
    const p = s.piece;
    const target = follow(fx, s, now, dt, calm);
    const x = target.x + fx.off.x;
    const y = target.y + fx.off.y;
    const cells = CELLS[p.type][p.rot];
    const [, base] = PALETTE[p.type];

    // ---- ghost: where it will land
    const ghost = dropRow(s);
    if (ghost > p.y) {
      ctx.strokeStyle = base;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 0.06;
      ctx.fillStyle = base;
      for (const [r, c] of cells) {
        ctx.beginPath();
        ctx.roundRect(x + c + 0.1, ghost + r + 0.1, 0.8, 0.8, 0.16);
        ctx.globalAlpha = 0.1;
        ctx.fill();
        ctx.globalAlpha = 0.55;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // ---- the falling piece, turning when rotated, glowing in its colour
    const n = boxSize(p.type);
    const rp = fx.rotAt > fx.spawnAt ? clamp01((now - fx.rotAt) / 120) : 1;
    const angle = calm ? 0 : (-Math.PI / 2) * (1 - ease.outBack(rp));
    ctx.save();
    ctx.translate(x + n / 2, y + n / 2);
    ctx.rotate(angle);
    ctx.translate(-n / 2, -n / 2);
    ctx.globalAlpha = calm ? 1 : clamp01((now - fx.spawnAt) / 110);
    ctx.shadowColor = base;
    ctx.shadowBlur = cell * dpr * 0.6;
    for (const [r, c] of cells) ctx.drawImage(sf.sprites[p.type], c, r, 1, 1);
    ctx.shadowBlur = 0;
    // Brightens as it is about to lock in place.
    if (s.lock > 0) {
      ctx.fillStyle = `rgba(255,255,255,${0.3 * (s.lock / LOCK_TICKS)})`;
      for (const [r, c] of cells) {
        ctx.beginPath();
        ctx.roundRect(c + 0.04, r + 0.04, 0.92, 0.92, 0.18);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // ---- sparks
  const live: Spark[] = [];
  for (const sp of fx.sparks) {
    if (now < sp.born) {
      live.push(sp);
      continue;
    }
    const age = (now - sp.born) / sp.life;
    if (age >= 1) continue;
    sp.x += sp.vx * dt;
    sp.y += sp.vy * dt;
    sp.vx *= 1 - 2.5 * dt;
    sp.vy = sp.vy * (1 - 2.5 * dt) + 14 * dt;
    ctx.globalAlpha = 1 - age;
    ctx.fillStyle = sp.colour;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2);
    ctx.fill();
    live.push(sp);
  }
  ctx.globalAlpha = 1;
  fx.sparks = live;
}
