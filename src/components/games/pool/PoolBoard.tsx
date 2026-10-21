"use client";

/** The pool table UI shared by the vs-computer game and the two-player board. */

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  FRAMES_PER_SECOND,
  groupOf,
  H,
  HEAD_Y,
  legalTargets,
  placementError,
  POCKETS,
  R,
  remaining,
  W,
  type Group,
  type Shot,
  type State,
} from "@/lib/games/arcade/pool";

export const RAIL = 70; // drawn rail width, mm
export const VW = W + 2 * RAIL;
export const VH = H + 2 * RAIL;
export const SPEED = 1.5; // animation plays the simulated frames 1.5x faster than real time
export const AIM_REACH = 3000; // the aim point sent to the server sits this far from the cue ball

const BASE = ["#f5f5ef", "#f2c21b", "#1d55c9", "#d42a2a", "#6a2fa3", "#ee7a16", "#15803d", "#7f1d1d", "#111111"];
export const colorOf = (n: number) => (n <= 8 ? BASE[n] : BASE[n - 8]);

export type Vec = { x: number; y: number };
/** What the canvas shows besides the balls: the aim, and where the cue ball is being placed. */
export type Overlay = { aim: Vec | null; place: { at: Vec; ok: boolean } | null };

/** Aim point (integer mm) a long way from the cue ball in direction `dir`. */
export const targetFor = (cue: Vec, dir: Vec) => ({ x: Math.round(cue.x + dir.x * AIM_REACH), y: Math.round(cue.y + dir.y * AIM_REACH) });

export function norm(x: number, y: number): Vec {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
}

/** A sensible starting aim: the nearest ball the shooter may hit. */
export function defaultDir(s: State, cue: Vec): Vec {
  let best: Vec = { x: 0, y: -1 };
  let bestD = Infinity;
  for (const t of legalTargets(s)) {
    const b = s.balls[t];
    const d = Math.hypot(b.x - cue.x, b.y - cue.y);
    if (d < bestD && d > 1) {
      bestD = d;
      best = norm(b.x - cue.x, b.y - cue.y);
    }
  }
  return best;
}

export function defaultCue(s: State): Vec {
  const c = s.balls[0];
  if (c.on && !placementError(s, Math.round(c.x), Math.round(c.y))) return { x: Math.round(c.x), y: Math.round(c.y) };
  for (let y = s.isBreak ? 2100 : H - 400; y > R; y -= 50)
    for (const x of [W / 2, W / 2 - 150, W / 2 + 150, W / 2 - 300, W / 2 + 300]) if (!placementError(s, x, y)) return { x, y };
  return { x: W / 2, y: H - 200 };
}

/** Where a shot from `cue` towards `target` first meets a ball or cushion. */
export function castAim(xs: Float32Array, cue: Vec, target: Vec) {
  const d = norm(target.x - cue.x, target.y - cue.y);
  let best = Infinity;
  let hit = -1;
  for (let i = 1; i < 16; i++) {
    const bx = xs[2 * i];
    const by = xs[2 * i + 1];
    if (Number.isNaN(bx)) continue;
    const ox = bx - cue.x;
    const oy = by - cue.y;
    const along = ox * d.x + oy * d.y;
    if (along <= 0) continue;
    const perp2 = ox * ox + oy * oy - along * along;
    if (perp2 >= 4 * R * R) continue;
    const t = along - Math.sqrt(4 * R * R - perp2);
    if (t < best) {
      best = t;
      hit = i;
    }
  }
  const walls = [d.x < 0 ? (R - cue.x) / d.x : d.x > 0 ? (W - R - cue.x) / d.x : Infinity, d.y < 0 ? (R - cue.y) / d.y : d.y > 0 ? (H - R - cue.y) / d.y : Infinity];
  const wall = Math.max(0, Math.min(...walls));
  if (wall < best) return { end: { x: cue.x + d.x * wall, y: cue.y + d.y * wall }, hit: -1 };
  return { end: { x: cue.x + d.x * best, y: cue.y + d.y * best }, hit };
}

export function positionsOf(s: State): Float32Array {
  const f = new Float32Array(32);
  s.balls.forEach((b, i) => {
    f[2 * i] = b.on ? b.x : NaN;
    f[2 * i + 1] = b.on ? b.y : NaN;
  });
  return f;
}

export function drawTable(canvas: HTMLCanvasElement, xs: Float32Array, overlay: Overlay, showHead: boolean) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const k = canvas.width / VW;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(k, 0, 0, k, RAIL * k, RAIL * k);
  // Rails and cloth.
  ctx.fillStyle = "#3b2414";
  ctx.beginPath();
  ctx.roundRect(-RAIL, -RAIL, VW, VH, 40);
  ctx.fill();
  ctx.fillStyle = "#0f6b3e";
  ctx.fillRect(0, 0, W, H);
  // Head string and foot spot.
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 4;
  if (showHead) {
    ctx.setLineDash([20, 20]);
    ctx.beginPath();
    ctx.moveTo(0, HEAD_Y);
    ctx.lineTo(W, HEAD_Y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // Pockets.
  ctx.fillStyle = "#050505";
  for (const p of POCKETS) {
    ctx.beginPath();
    ctx.arc(p.x === -12 ? -4 : p.x === W + 12 ? W + 4 : p.x, p.y, p.x < 0 || p.x > W ? 50 : 58, 0, Math.PI * 2);
    ctx.fill();
  }
  // Aim line and ghost ball.
  const cue = Number.isNaN(xs[0]) ? null : { x: xs[0], y: xs[1] };
  if (overlay.aim && cue) {
    const { end, hit } = castAim(xs, cue, overlay.aim);
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cue.x, cue.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(end.x, end.y, R, 0, Math.PI * 2);
    ctx.stroke();
    if (hit > 0) {
      const bx = xs[2 * hit];
      const by = xs[2 * hit + 1];
      const d = norm(bx - end.x, by - end.y);
      ctx.strokeStyle = "rgba(250,204,21,0.8)";
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + d.x * 280, by + d.y * 280);
      ctx.stroke();
    }
  }
  // Balls.
  for (let i = 15; i >= 0; i--) {
    const x = xs[2 * i];
    const y = xs[2 * i + 1];
    if (Number.isNaN(x)) continue;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = i >= 9 ? "#f5f5ef" : colorOf(i);
    ctx.fillRect(x - R, y - R, 2 * R, 2 * R);
    if (i >= 9) {
      ctx.fillStyle = colorOf(i);
      ctx.fillRect(x - R, y - R * 0.55, 2 * R, R * 1.1);
    }
    if (i > 0) {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(x, y, R * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#000";
      ctx.font = `bold ${R * 0.62}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i), x, y + 1);
    }
    ctx.restore();
  }
  // Ball in hand marker.
  if (overlay.place) {
    const { at, ok } = overlay.place;
    ctx.strokeStyle = ok ? "rgba(52,211,153,0.9)" : "rgba(248,113,113,0.95)";
    ctx.lineWidth = 6;
    ctx.setLineDash([12, 10]);
    ctx.beginPath();
    ctx.arc(at.x, at.y, R + 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

export function GroupChips({ s, g }: { s: State; g: Group | null }) {
  if (!g) return <span className="text-white/50">open table</span>;
  const nums = g === "solids" ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15];
  const left = remaining(s.balls, g);
  return (
    <span className="flex items-center gap-0.5">
      {nums.map((n) => (
        <span
          key={n}
          className={`inline-block h-2.5 w-2.5 rounded-full ${s.balls[n].on ? "" : "opacity-15"}`}
          style={{ background: n >= 9 ? `linear-gradient(#f5f5ef 25%, ${colorOf(n)} 25% 75%, #f5f5ef 75%)` : colorOf(n) }}
        />
      ))}
      {left === 0 && <span className="ml-1 inline-block h-2.5 w-2.5 rounded-full bg-black ring-1 ring-white/40" title="On the 8" />}
    </span>
  );
}
/** A recorded shot to play on the table; `aim` (the cue line) is shown for `aimMs` first. */
export type Playback = { key: number; frames: Float32Array[]; aim: Vec | null; aimMs: number };

type BoardProps = {
  /** The table to show when no shot is playing. */
  game: State;
  /** The viewer may aim, place the cue ball (ball in hand) and shoot. */
  canShoot: boolean;
  onShoot: (place: [number, number] | null, shot: Shot) => void;
  playback: Playback | null;
  onPlaybackDone: (key: number) => void;
  /** Players, status and last event, shown above the table. */
  header: ReactNode;
  /** Shown under the Shoot button when the viewer cannot shoot. */
  idleText: string;
  /** Extra control at the bottom right, e.g. a Resign button. */
  extra?: ReactNode;
};

export function PoolBoard({ game, canShoot: allowed, onShoot, playback, onPlaybackDone, header, idleText, extra }: BoardProps) {
  const [power, setPower] = useState(70);
  const [cue, setCue] = useState<Vec>(() => defaultCue(game));
  const [dir, setDir] = useState<Vec>(() => defaultDir(game, defaultCue(game)));
  const [shown, setShown] = useState(game);
  const [width, setWidth] = useState(320);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<Float32Array | null>(null); // the animation frame on screen, if animating
  const aimRef = useRef<Vec | null>(null); // someone else's cue line, shown before their shot plays
  const drag = useRef<"cue" | "aim" | null>(null);
  const doneRef = useRef(onPlaybackDone);

  // A new table: start the aim (and the cue ball in hand) from sensible defaults.
  if (shown !== game) {
    setShown(game);
    const c = defaultCue(game);
    setCue(c);
    setDir(defaultDir(game, game.ballInHand ? c : { x: game.balls[0].x, y: game.balls[0].y }));
  }

  const myTurn = allowed && !playback && game.winner === null;
  const placing = myTurn && game.ballInHand;
  const placeErr = placing ? placementError(game, cue.x, cue.y) : null;
  const cuePos: Vec = placing ? cue : { x: game.balls[0].x, y: game.balls[0].y };
  const aimTarget = myTurn ? targetFor(cuePos, dir) : null;

  // Size the canvas to its container (max 360 css px wide, about 3/4 of the screen height).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => setWidth(Math.floor(Math.min(360, el.clientWidth, (window.innerHeight * 0.75 * VW) / VH)));
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function paint() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const xs = frameRef.current ?? positionsOf(game);
    if (!frameRef.current && placing) {
      xs[0] = cue.x;
      xs[1] = cue.y;
    }
    const overlay: Overlay = {
      aim: frameRef.current ? null : (aimTarget ?? aimRef.current),
      place: placing && !frameRef.current ? { at: cue, ok: !placeErr } : null,
    };
    drawTable(canvas, xs, overlay, game.isBreak);
  }
  const paintRef = useRef(paint);
  // Redraw whenever anything shown changes (animation frames draw themselves).
  useEffect(() => {
    paintRef.current = paint;
    doneRef.current = onPlaybackDone;
    const canvas = canvasRef.current;
    if (canvas) {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(width * dpr);
      const h = Math.round((width * VH * dpr) / VW);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    }
    paint();
  });

  // Play a recorded shot: the cue line first (if any), then the frames, then report back.
  useEffect(() => {
    if (!playback) return;
    let raf = 0;
    aimRef.current = playback.aim;
    paintRef.current();
    const timer = window.setTimeout(
      () => {
        aimRef.current = null;
        const t0 = performance.now();
        const tick = (now: number) => {
          const idx = Math.floor(((now - t0) / 1000) * FRAMES_PER_SECOND * SPEED);
          if (idx >= playback.frames.length - 1) {
            frameRef.current = null;
            doneRef.current(playback.key);
            return;
          }
          frameRef.current = playback.frames[idx];
          paintRef.current();
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      playback.aim ? playback.aimMs : 0,
    );
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      frameRef.current = null;
      aimRef.current = null;
    };
  }, [playback]);

  function shoot() {
    if (!myTurn || placeErr || !aimTarget) return;
    onShoot(placing ? [cue.x, cue.y] : null, { tx: aimTarget.x, ty: aimTarget.y, power });
  }

  function toTable(e: React.PointerEvent<HTMLCanvasElement>): Vec {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * VW - RAIL, y: ((e.clientY - rect.top) / rect.height) * VH - RAIL };
  }

  function pointer(e: React.PointerEvent<HTMLCanvasElement>, phase: "down" | "move") {
    if (!myTurn) return;
    const p = toTable(e);
    if (phase === "down") {
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = placing && Math.hypot(p.x - cue.x, p.y - cue.y) < 120 ? "cue" : "aim";
    }
    if (!drag.current) return;
    if (drag.current === "cue") {
      const minY = game.isBreak ? HEAD_Y : R;
      setCue({ x: Math.round(Math.min(W - R, Math.max(R, p.x))), y: Math.round(Math.min(H - R, Math.max(minY, p.y))) });
    } else if (Math.hypot(p.x - cuePos.x, p.y - cuePos.y) > 15) {
      setDir(norm(p.x - cuePos.x, p.y - cuePos.y));
    }
  }

  function nudge(deg: number) {
    const a = (deg * Math.PI) / 180;
    setDir((d) => norm(d.x * Math.cos(a) - d.y * Math.sin(a), d.x * Math.sin(a) + d.y * Math.cos(a)));
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA") && e.key !== "Enter") return;
      if (e.key === "ArrowLeft") nudge(e.shiftKey ? -2 : -0.25);
      else if (e.key === "ArrowRight") nudge(e.shiftKey ? 2 : 0.25);
      else if (e.key === "ArrowUp") setPower((p) => Math.min(100, p + 5));
      else if (e.key === "ArrowDown") setPower((p) => Math.max(1, p - 5));
      else if (e.key === " " || e.key === "Enter") shoot();
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const target = aimTarget ? castAim(positionsOf({ ...game, balls: game.balls.map((b, i) => (i === 0 ? { ...b, ...cuePos, on: true } : b)) }), cuePos, aimTarget) : null;
  const targetName = target && target.hit > 0 ? (target.hit === 8 ? "the 8" : `the ${target.hit} (${groupOf(target.hit) === "solids" ? "solid" : "stripe"})`) : "a cushion";

  return (
    <div className="flex flex-col gap-2 select-none">
      <div className="rounded-2xl bg-black/30 p-2">
        {header}
        <div ref={wrapRef} className="flex justify-center">
          <canvas
            ref={canvasRef}
            style={{ width, height: (width * VH) / VW, touchAction: "none" }}
            className="rounded-xl"
            onPointerDown={(e) => pointer(e, "down")}
            onPointerMove={(e) => pointer(e, "move")}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            aria-label="Pool table: drag to aim"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-2xl bg-white/5 p-3">
        <div className="flex items-center gap-2 text-sm text-white/70">
          <span className="w-14">Power</span>
          <input type="range" min={1} max={100} value={power} onChange={(e) => setPower(Number(e.target.value))} className="flex-1 accent-emerald-500" aria-label="Power" />
          <span className="w-8 text-right font-mono">{power}</span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => nudge(-0.25)} disabled={!myTurn} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm disabled:opacity-40" aria-label="Aim left">
            ◀
          </button>
          <button type="button" onClick={shoot} disabled={!myTurn || !!placeErr} className="flex-1 rounded-lg bg-emerald-500 py-2 font-bold text-emerald-950 transition active:scale-95 disabled:opacity-40">
            Shoot
          </button>
          <button type="button" onClick={() => nudge(0.25)} disabled={!myTurn} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm disabled:opacity-40" aria-label="Aim right">
            ▶
          </button>
        </div>
        <div className="flex justify-between gap-2 text-xs text-white/60">
          <span>{myTurn ? (placeErr ? placeErr : `Aiming at ${targetName}`) : idleText}</span>
          {extra}
        </div>
      </div>
    </div>
  );
}

/** Both players' names, groups and whose turn it is, plus a status line and the last event. */
export function PoolHeader({ game, names, status, active }: { game: State; names: [string, string]; status: string; active: 0 | 1 | null }) {
  return (
    <>
      <div className="mb-1.5 grid grid-cols-2 gap-2 text-xs text-white/70">
        {([0, 1] as const).map((side) => (
          <div key={side} className={`rounded-lg border px-2 py-1 ${active === side ? "border-emerald-400/70 bg-emerald-500/10" : "border-white/10"}`}>
            <div className="truncate font-semibold text-white">{names[side]}</div>
            <GroupChips s={game} g={game.groups[side]} />
          </div>
        ))}
      </div>
      <p className="text-center text-sm font-semibold text-emerald-300">{status}</p>
      <p className="mb-1.5 min-h-[2.5em] text-center text-xs text-white/60">{game.note}</p>
    </>
  );
}
