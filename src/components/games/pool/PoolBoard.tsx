"use client";

/** The pool table UI shared by the vs-computer game and the two-player board. */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useGameFx } from "@/components/games/fx/GameFx";
import { ease, prefersReducedMotion } from "@/components/games/fx/motion";
import {
  colorOf,
  drawScene,
  freshOrients,
  POCKET_DRAW,
  RAIL,
  roll,
  touch,
  VH,
  VW,
  type Drop,
  type Orient,
  type Sprites,
  type Stick,
} from "@/components/games/pool/render";
import {
  FRAMES_PER_SECOND,
  groupOf,
  H,
  HEAD_Y,
  legalTargets,
  placementError,
  R,
  remaining,
  W,
  type Group,
  type Shot,
  type State,
} from "@/lib/games/arcade/pool";

export { colorOf, RAIL, VH, VW };
export const SPEED = 1; // the simulated frames play at true speed: real acceleration and deceleration
export const FAST_FORWARD = 4; // a tap on the table while balls roll speeds the rest of the shot up this much
export const AIM_REACH = 3000; // the aim point sent to the server sits this far from the cue ball
const MAX_POWER_SPEED = 4000; // mm/s at power 100 (matches the physics), to read a shot's power back from its frames

/** How far the cue tip rests behind the cue ball while aiming, for a power of 0..1 (mm). */
const restBack = (p: number) => 30 + 150 * p;

export type Vec = { x: number; y: number };

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
  const walls = [
    d.x < 0 ? (R - cue.x) / d.x : d.x > 0 ? (W - R - cue.x) / d.x : Infinity,
    d.y < 0 ? (R - cue.y) / d.y : d.y > 0 ? (H - R - cue.y) / d.y : Infinity,
  ];
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
  /** Called as each ball drops into a pocket while a shot plays. */
  onPot?: (ball: number) => void;
  /** Players, status and last event, shown above the table. */
  header: ReactNode;
  /** Shown under the Shoot button when the viewer cannot shoot. */
  idleText: string;
  /** Extra control at the bottom right, e.g. a Resign button. */
  extra?: ReactNode;
};

/** The cue ball's direction and power (0..1) at the start of a recorded shot, read from its frames. */
function strokeOf(frames: Float32Array[]): { dir: Vec; p: number } {
  const f0 = frames[0];
  for (let i = 1; i < Math.min(frames.length, 40); i++) {
    const dx = frames[i][0] - f0[0];
    const dy = frames[i][1] - f0[1];
    if (Number.isNaN(dx) || Number.isNaN(dy)) break;
    const d = Math.hypot(dx, dy);
    if (d > 0.5) return { dir: { x: dx / d, y: dy / d }, p: Math.min(1, ((d / i) * FRAMES_PER_SECOND) / MAX_POWER_SPEED) };
  }
  return { dir: { x: 0, y: -1 }, p: 0.5 };
}

/** Ball positions at fractional frame `f`, interpolated so the motion is smooth on any screen refresh rate. */
function framesAt(frames: Float32Array[], f: number, out: Float32Array) {
  const i0 = Math.min(frames.length - 1, Math.floor(f));
  const i1 = Math.min(frames.length - 1, i0 + 1);
  const t = f - i0;
  const a = frames[i0];
  const b = frames[i1];
  for (let j = 0; j < 32; j++) out[j] = Number.isNaN(a[j]) || Number.isNaN(b[j]) ? a[j] : a[j] + (b[j] - a[j]) * t;
}

function nearestPocket(x: number, y: number) {
  let best = POCKET_DRAW[0];
  for (const p of POCKET_DRAW) if (Math.hypot(p.x - x, p.y - y) < Math.hypot(best.x - x, best.y - y)) best = p;
  return best;
}

export function PoolBoard({ game, canShoot: allowed, onShoot, playback, onPlaybackDone, onPot, header, idleText, extra }: BoardProps) {
  const fx = useGameFx();
  const [power, setPower] = useState(70);
  const [cue, setCue] = useState<Vec>(() => defaultCue(game));
  const [dir, setDir] = useState<Vec>(() => defaultDir(game, defaultCue(game)));
  const [shown, setShown] = useState(game);
  const [width, setWidth] = useState(320);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<Float32Array | null>(null); // the animation frame on screen, if animating
  const aimRef = useRef<Vec | null>(null); // someone else's cue line, shown before their shot plays
  const stickRef = useRef<Stick | null>(null); // the cue stick while a shot plays
  const dropsRef = useRef<Drop[]>([]); // balls falling into pockets
  const fastRef = useRef(1); // playback speed (a tap fast-forwards)
  const orientsRef = useRef<Orient[] | null>(null); // how each ball has turned as it rolled
  const spritesRef = useRef<Sprites>([]);
  const lastXsRef = useRef<Float32Array | null>(null);
  const drag = useRef<"cue" | "aim" | null>(null);
  const doneRef = useRef(onPlaybackDone);
  const potRef = useRef(onPot);

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

  // Size the canvas from its container and the screen height (more room in full screen).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => {
      const room = fx.fullscreen ? window.innerHeight - 280 : window.innerHeight * 0.75;
      setWidth(Math.floor(Math.max(180, Math.min(el.clientWidth, (room * VW) / VH))));
    };
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [fx.fullscreen]);

  function paint() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const xs = frameRef.current ? frameRef.current.slice() : positionsOf(game);
    if (!frameRef.current && placing) {
      xs[0] = cue.x;
      xs[1] = cue.y;
    }
    // Turn each ball by how far it travelled since the last picture, so stripes and numbers roll.
    const orients = (orientsRef.current ??= freshOrients());
    const prev = lastXsRef.current;
    if (prev) {
      for (let i = 0; i < 16; i++) {
        const dx = xs[2 * i] - prev[2 * i];
        const dy = xs[2 * i + 1] - prev[2 * i + 1];
        if (Number.isNaN(dx) || Number.isNaN(dy) || (dx === 0 && dy === 0) || Math.hypot(dx, dy) > 150) continue;
        roll(orients[i], dx, dy);
        touch(spritesRef.current, i);
      }
    }
    lastXsRef.current = xs;

    const cueNow = Number.isNaN(xs[0]) ? null : { x: xs[0], y: xs[1] };
    const aimPoint = aimRef.current ?? (frameRef.current ? null : aimTarget);
    const stick: Stick | null =
      stickRef.current ?? (!frameRef.current && myTurn && cueNow ? { at: cueNow, dir, back: restBack(power / 100), alpha: placeErr ? 0.5 : 1 } : null);
    drawScene(canvas, {
      xs,
      showHead: game.isBreak,
      orients,
      sprites: spritesRef.current,
      aim: aimPoint && cueNow ? { cue: cueNow, ...castAim(xs, cueNow, aimPoint) } : null,
      place: placing && !frameRef.current ? { at: cue, ok: !placeErr } : null,
      stick,
      drops: dropsRef.current,
    });
  }
  const paintRef = useRef(paint);
  // Redraw whenever anything shown changes (animation frames draw themselves).
  useEffect(() => {
    paintRef.current = paint;
    doneRef.current = onPlaybackDone;
    potRef.current = onPot;
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

  // Play a recorded shot: the cue line (if any), the cue stick drawing back and striking,
  // then the simulated frames at true speed, with balls sinking into pockets as they drop.
  useEffect(() => {
    if (!playback) return;
    const { frames } = playback;
    const stroke = strokeOf(frames);
    const reduced = prefersReducedMotion();
    const at = { x: frames[0][0], y: frames[0][1] };
    const aimMs = playback.aim ? playback.aimMs : 0;
    const rest = restBack(stroke.p);
    const pullTo = rest + 70 + 230 * stroke.p;
    const pullMs = reduced ? 0 : 200 + 120 * stroke.p;
    const strikeMs = reduced ? 0 : 120 - 60 * stroke.p; // harder shots strike faster
    const hitAt = aimMs + pullMs + strikeMs;
    const out = new Float32Array(32);
    let drops: (Drop & { t0: number })[] = [];
    let raf = 0;
    let t0 = -1;
    let last = 0;
    let sim = 0; // simulated seconds played so far
    let seen = 0; // frames checked for pots

    fastRef.current = 1;
    aimRef.current = playback.aim;
    frameRef.current = frames[0];
    stickRef.current = reduced || Number.isNaN(at.x) ? null : { at, dir: stroke.dir, back: rest, alpha: 1 };
    dropsRef.current = [];
    paintRef.current();

    const tick = (now: number) => {
      if (t0 < 0) t0 = last = now;
      const t = now - t0;
      if (t < hitAt) {
        if (t >= aimMs && stickRef.current) {
          aimRef.current = null;
          const back =
            t < aimMs + pullMs
              ? rest + (pullTo - rest) * ease.outCubic((t - aimMs) / pullMs)
              : pullTo + (-2 - pullTo) * ease.inQuad((t - aimMs - pullMs) / strikeMs);
          stickRef.current = { at, dir: stroke.dir, back, alpha: 1 };
        }
        last = now;
        paintRef.current();
        raf = requestAnimationFrame(tick);
        return;
      }
      aimRef.current = null;
      sim += ((now - last) / 1000) * fastRef.current;
      last = now;
      // The stick follows through after the strike, then fades away.
      const ts = t - hitAt;
      stickRef.current =
        reduced || ts > 450 || Number.isNaN(at.x) ? null : { at, dir: stroke.dir, back: -2 - 55 * ease.outCubic(Math.min(1, ts / 220)), alpha: 1 - ts / 450 };

      const f = Math.min(frames.length - 1, sim * FRAMES_PER_SECOND * SPEED);
      const idx = Math.floor(f);
      for (; seen < idx; seen++) {
        const a = frames[seen];
        const b = frames[seen + 1];
        for (let n = 0; n < 16; n++) {
          if (Number.isNaN(a[2 * n]) || !Number.isNaN(b[2 * n])) continue;
          const pk = nearestPocket(a[2 * n], a[2 * n + 1]);
          drops.push({ n, x: a[2 * n], y: a[2 * n + 1], px: pk.x, py: pk.y, p: 0, t0: now });
          potRef.current?.(n);
        }
      }
      for (const d of drops) d.p = reduced ? 1 : (now - d.t0) / 380;
      drops = drops.filter((d) => d.p < 1);
      dropsRef.current = drops;

      if (idx >= frames.length - 1 && !drops.length) {
        frameRef.current = null;
        stickRef.current = null;
        dropsRef.current = [];
        doneRef.current(playback.key);
        return;
      }
      framesAt(frames, f, out);
      frameRef.current = out;
      paintRef.current();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      frameRef.current = null;
      aimRef.current = null;
      stickRef.current = null;
      dropsRef.current = [];
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
    if (playback && phase === "down") {
      fastRef.current = FAST_FORWARD; // impatient? the rest of the shot plays faster
      return;
    }
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

  const target = aimTarget
    ? castAim(positionsOf({ ...game, balls: game.balls.map((b, i) => (i === 0 ? { ...b, ...cuePos, on: true } : b)) }), cuePos, aimTarget)
    : null;
  const targetName =
    target && target.hit > 0 ? (target.hit === 8 ? "the 8" : `the ${target.hit} (${groupOf(target.hit) === "solids" ? "solid" : "stripe"})`) : "a cushion";
  const powerHue = Math.round(130 - power * 1.3); // green for a soft touch, red for a smash

  return (
    <div className="flex flex-col gap-2 select-none">
      <div className="rounded-2xl bg-gradient-to-b from-emerald-950/60 to-black/40 p-2 ring-1 ring-emerald-400/10">
        {header}
        <div ref={wrapRef} className="flex justify-center">
          <canvas
            ref={canvasRef}
            style={{ width, height: (width * VH) / VW, touchAction: "none" }}
            className="rounded-xl shadow-[0_12px_40px_-8px_rgba(0,0,0,0.8)]"
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
          <input
            type="range"
            min={1}
            max={100}
            value={power}
            onChange={(e) => setPower(Number(e.target.value))}
            className="flex-1"
            style={{ accentColor: `hsl(${powerHue} 85% 52%)` }}
            aria-label="Power"
          />
          <span className="w-8 text-right font-mono" style={{ color: `hsl(${powerHue} 90% 65%)` }}>
            {power}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => nudge(-0.25)}
            disabled={!myTurn}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm disabled:opacity-40"
            aria-label="Aim left"
          >
            ◀
          </button>
          <button
            type="button"
            onClick={shoot}
            disabled={!myTurn || !!placeErr}
            className="flex-1 rounded-lg bg-gradient-to-r from-emerald-400 via-lime-400 to-amber-300 py-2 font-bold text-emerald-950 shadow-lg shadow-emerald-500/20 transition active:scale-95 disabled:opacity-40"
          >
            Shoot
          </button>
          <button
            type="button"
            onClick={() => nudge(0.25)}
            disabled={!myTurn}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm disabled:opacity-40"
            aria-label="Aim right"
          >
            ▶
          </button>
        </div>
        <div className="flex justify-between gap-2 text-xs text-white/60">
          <span>{myTurn ? (placeErr ? placeErr : `Aiming at ${targetName}`) : playback ? "Tap the table to speed up" : idleText}</span>
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
