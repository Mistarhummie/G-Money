"use client";

import { useEffect, useRef, useState } from "react";
import {
  CX, CY, encodeInput, FIELD, MAX_MS, newGame, R_BULL, R_DOUBLE_IN, R_DOUBLE_OUT, R_OUTER_BULL, R_TREBLE_IN, R_TREBLE_OUT, ready, SECTORS,
  stageConfig, swayAt, throwDart, tick, TICK_MS, type DartsState, type Throw, type ThrowResult,
} from "@/lib/games/arcade/darts";
import type { GameComponentProps } from "@/lib/games/arcade/types";
import { drawSparks, sparks, toWorld, useCanvasLoop, useFixedStep, type Spark } from "./fx/canvas";
import { useGameFx } from "./fx/GameFx";
import { prefersReducedMotion, useTweened, vibrate } from "./fx/motion";
import { useReportProgress } from "./useProgress";

const END_MS = MAX_MS - 15_000;
/** On touch screens the sight sits this far above the finger, so the finger doesn't hide it. */
const TOUCH_LIFT = 70;
const FLIGHT_MS = 170;

type View = { score: number; thrown: ThrowResult[]; left: number; total: number; ready: boolean; alive: boolean; cleared: boolean };

/** Draws the board once into an offscreen canvas (it never changes). */
function boardImage(scale: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = Math.round(FIELD * scale);
  const ctx = c.getContext("2d")!;
  ctx.scale(scale, scale);
  // Backboard.
  ctx.fillStyle = "#0b1020";
  ctx.beginPath();
  ctx.arc(CX, CY, 196, 0, Math.PI * 2);
  ctx.fill();
  const ring = (r0: number, r1: number, colour: (k: number) => string) => {
    for (let k = 0; k < 20; k++) {
      const a0 = ((-90 - 9 + 18 * k) * Math.PI) / 180;
      const a1 = a0 + (18 * Math.PI) / 180;
      ctx.fillStyle = colour(k);
      ctx.beginPath();
      ctx.arc(CX, CY, r1, a0, a1);
      ctx.arc(CX, CY, r0, a1, a0, true);
      ctx.closePath();
      ctx.fill();
    }
  };
  ring(R_TREBLE_OUT, R_DOUBLE_IN, (k) => (k % 2 ? "#e9e4d4" : "#151a36"));
  ring(R_OUTER_BULL, R_TREBLE_IN, (k) => (k % 2 ? "#e9e4d4" : "#151a36"));
  ring(R_DOUBLE_IN, R_DOUBLE_OUT, (k) => (k % 2 ? "#22d3a6" : "#f43f5e"));
  ring(R_TREBLE_IN, R_TREBLE_OUT, (k) => (k % 2 ? "#22d3a6" : "#f43f5e"));
  ctx.fillStyle = "#22d3a6";
  ctx.beginPath();
  ctx.arc(CX, CY, R_OUTER_BULL, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f43f5e";
  ctx.beginPath();
  ctx.arc(CX, CY, R_BULL, 0, Math.PI * 2);
  ctx.fill();
  // Wires.
  ctx.strokeStyle = "rgba(203,213,225,0.55)";
  ctx.lineWidth = 0.8;
  for (const r of [R_OUTER_BULL, R_TREBLE_IN, R_TREBLE_OUT, R_DOUBLE_IN, R_DOUBLE_OUT]) {
    ctx.beginPath();
    ctx.arc(CX, CY, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let k = 0; k < 20; k++) {
    const a = ((-90 - 9 + 18 * k) * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(CX + Math.cos(a) * R_OUTER_BULL, CY + Math.sin(a) * R_OUTER_BULL);
    ctx.lineTo(CX + Math.cos(a) * R_DOUBLE_OUT, CY + Math.sin(a) * R_DOUBLE_OUT);
    ctx.stroke();
  }
  // Numbers.
  ctx.fillStyle = "#f8fafc";
  ctx.font = "700 15px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  SECTORS.forEach((n, k) => {
    const a = ((-90 + 18 * k) * Math.PI) / 180;
    ctx.fillText(String(n), CX + Math.cos(a) * 184, CY + Math.sin(a) * 184);
  });
  return c;
}

export default function DartsGame({ seed, stage, onFinish, onProgress, timeUp }: GameComponentProps) {
  const cfg = stageConfig(stage);
  const [preview] = useState(() => newGame(seed, stage));
  const snapshot = (s: DartsState): View => ({
    score: s.score,
    thrown: s.thrown as ThrowResult[],
    left: s.left,
    total: s.total,
    ready: ready(s),
    alive: s.alive,
    cleared: s.cleared,
  });
  const [view, setView] = useState<View>(() => snapshot(preview));
  const [started, setStarted] = useState(false);
  const [over, setOver] = useState(false);
  const [last, setLast] = useState<ThrowResult | null>(null);
  const fx = useGameFx();
  const shownScore = useTweened(view.score, 300);
  useReportProgress(
    onProgress,
    started,
    view.score,
    cfg.mode === "total" ? `${view.total}/${cfg.target}` : `${view.left} left`,
  );

  const game = useRef<DartsState>(preview);
  const throws = useRef<Throw[]>([]);
  const results = useRef<ThrowResult[]>([]);
  const ticks = useRef(0);
  const finished = useRef(false);
  const aim = useRef<{ x: number; y: number }>({ x: CX, y: CY - 103 });
  const queued = useRef(false);
  const touching = useRef(false);
  const finishRef = useRef(onFinish);
  useEffect(() => {
    finishRef.current = onFinish;
  });
  const fxRef = useRef(fx);
  useEffect(() => {
    fxRef.current = fx;
  });
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visual = useRef({ sparks: [] as Spark[], flying: null as null | { x: number; y: number; at: number }, board: null as HTMLCanvasElement | null });

  function finish() {
    if (finished.current) return;
    finished.current = true;
    setOver(true);
    finishRef.current(encodeInput(throws.current, ticks.current));
  }
  useEffect(() => {
    if (timeUp) finish();
  }, [timeUp]);

  useFixedStep(started && !over, TICK_MS, () => {
    const s = game.current;
    if (finished.current) return false;
    const t = ++ticks.current;
    tick(s);
    if (queued.current && ready(s)) {
      queued.current = false;
      const x = Math.max(0, Math.min(FIELD, Math.round(aim.current.x)));
      const y = Math.max(0, Math.min(FIELD, Math.round(aim.current.y)));
      const before = s.cleared;
      const r = throwDart(s, x, y);
      if (r) {
        throws.current.push({ tick: t, x, y });
        results.current = [...results.current, r];
        setLast(r);
        const now = performance.now();
        visual.current.flying = { x: r.x, y: r.y, at: now };
        setTimeout(() => {
          vibrate(r.mult >= 2 ? [10, 30, 10] : 8);
          const calm = prefersReducedMotion();
          if (r.points >= 40 && !calm) visual.current.sparks.push(...sparks(r.x, r.y, performance.now(), r.mult === 3 ? "#22d3a6" : "#f43f5e", 16, 120));
          if (r.checkout) {
            fxRef.current.confetti(70);
            fxRef.current.pop("Game shot!", { tone: "great", emoji: "🏆", sub: `Finished on ${r.label}` });
          } else if (r.bust) fxRef.current.pop("Bust!", { tone: "bad", emoji: "💢", sub: cfg.doubleOut ? "Finish on a double" : "Too many" });
          else if (r.label === "Bull") fxRef.current.pop("Bullseye!", { tone: "great", emoji: "🎯" });
          else if (r.mult === 3) fxRef.current.pop(`Treble ${r.base}!`, { tone: r.base >= 18 ? "great" : "good", emoji: "🎯", ms: 900 });
          else if (r.points === 0) fxRef.current.pop("Missed the board", { tone: "bad", ms: 900 });
          if (cfg.mode === "total" && s.cleared && !before) {
            fxRef.current.pop("Target reached!", { tone: "great", emoji: "🏆", sub: "Keep throwing for points" });
            fxRef.current.confetti(40);
          }
        }, FLIGHT_MS);
      }
    }
    if (t % 3 === 0 || !s.alive) setView(snapshot(s));
    if (!s.alive) {
      // Let the last dart land before handing in.
      setTimeout(finish, FLIGHT_MS + 50);
      return false;
    }
    if (t * TICK_MS >= END_MS) {
      finish();
      return false;
    }
    return true;
  });

  useCanvasLoop(boxRef, canvasRef, FIELD, FIELD, (ctx, now, dt) => {
    const s = game.current;
    const v = visual.current;
    const calm = prefersReducedMotion();
    const bgr = ctx.createRadialGradient(CX, CY, 50, CX, CY, 290);
    bgr.addColorStop(0, "#1e1b4b");
    bgr.addColorStop(1, "#0b1020");
    ctx.fillStyle = bgr;
    ctx.fillRect(0, 0, FIELD, FIELD);
    if (!v.board) v.board = boardImage(Math.min(window.devicePixelRatio || 1, 3) * 2);
    ctx.shadowColor = "#7c3aed";
    ctx.shadowBlur = calm ? 0 : 30;
    ctx.drawImage(v.board, 0, 0, FIELD, FIELD);
    ctx.shadowBlur = 0;

    // Darts already thrown.
    const fly = v.flying;
    results.current.forEach((r, i) => {
      const inAir = fly && i === results.current.length - 1 && now - fly.at < FLIGHT_MS;
      if (inAir) return;
      drawDart(ctx, r.x, r.y, 1);
    });
    if (fly && now - fly.at < FLIGHT_MS) {
      const k = (now - fly.at) / FLIGHT_MS;
      const sx = CX + 40;
      const sy = FIELD + 40;
      drawDart(ctx, sx + (fly.x - sx) * k, sy + (fly.y - sy) * k - Math.sin(k * Math.PI) * 40, 1.8 - 0.8 * k);
    }

    // The sight: where a dart thrown now would land.
    if (!over && s.alive) {
      const { dx, dy } = swayAt(s, s.ticks);
      const x = aim.current.x + dx;
      const y = aim.current.y + dy;
      const r = ready(s) ? 1 : 0.4;
      ctx.globalAlpha = r;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.6;
      ctx.shadowColor = "#22d3a6";
      ctx.shadowBlur = calm ? 0 : 8;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.moveTo(x - 13, y);
      ctx.lineTo(x - 4, y);
      ctx.moveTo(x + 4, y);
      ctx.lineTo(x + 13, y);
      ctx.moveTo(x, y - 13);
      ctx.lineTo(x, y - 4);
      ctx.moveTo(x, y + 4);
      ctx.lineTo(x, y + 13);
      ctx.stroke();
      ctx.fillStyle = "#22d3a6";
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
    v.sparks = drawSparks(ctx, v.sparks, now, dt);
  });

  function point(e: React.PointerEvent<HTMLDivElement>) {
    const p = toWorld(e, e.currentTarget, FIELD);
    return e.pointerType === "mouse" ? p : { x: p.x, y: p.y - TOUCH_LIFT };
  }
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (over) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    aim.current = point(e);
    touching.current = true;
    if (!started) setStarted(true);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse" && !touching.current) return;
    aim.current = point(e);
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!touching.current) return;
    touching.current = false;
    aim.current = point(e);
    // Letting go throws (a click, or lifting your finger).
    if (!over) queued.current = true;
  }

  const dartsLeft = cfg.darts - view.thrown.length;
  return (
    <div className="flex flex-col gap-3 select-none">
      <div className="flex items-center justify-between gap-2 text-sm text-white/70">
        <span className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white/10 px-2 py-0.5">🎯 {dartsLeft} {dartsLeft === 1 ? "dart" : "darts"}</span>
          {cfg.mode === "total" ? (
            <span>
              <span className="font-semibold text-amber-200">{view.total}</span>/{cfg.target}
            </span>
          ) : (
            <span>
              <span className="font-semibold text-amber-200">{view.left}</span> to go{cfg.doubleOut ? " · double out" : ""}
            </span>
          )}
          <span className="text-white/50">{Math.round(shownScore).toLocaleString()} pts</span>
        </span>
        <button type="button" className="underline" onClick={finish} disabled={over}>
          Give up
        </button>
      </div>
      <div
        className="relative mx-auto aspect-square w-full overflow-hidden rounded-2xl border border-brand-violet/30 shadow-[0_0_30px_rgba(124,58,237,0.25)]"
        style={{ touchAction: "none", maxWidth: fx.fullscreen ? "calc(100dvh - 14rem)" : 540, cursor: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (touching.current = false)}
      >
        <div ref={boxRef} className="absolute inset-0">
          <canvas ref={canvasRef} className="block h-full w-full" role="img" aria-label="Dartboard" />
        </div>
        {!started && !over && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/45 p-6 text-center text-white/85">
            <p className="text-lg font-semibold">{cfg.name}</p>
            <p>Move the sight, then let go to throw</p>
            <p className="text-xs text-white/60">Your hand sways: throw when the sight is on target</p>
          </div>
        )}
        {last && (
          <div key={view.thrown.length} className="pointer-events-none absolute right-3 top-3 animate-pop rounded-xl bg-black/50 px-3 py-1 text-lg font-bold text-white">
            {last.bust ? "Bust" : last.label}
          </div>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-1 text-xs">
        {view.thrown.map((r, i) => (
          <span key={i} className={`rounded-md px-1.5 py-0.5 ${r.bust ? "bg-rose-500/20 text-rose-200 line-through" : r.mult === 3 ? "bg-mint/20 text-mint" : "bg-white/10 text-white/70"}`}>
            {r.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function drawDart(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.rotate(0.5);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(3, 3, 3, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#cbd5e1";
  ctx.fillRect(-1, 0, 2, 8);
  ctx.fillStyle = "#7c3aed";
  ctx.beginPath();
  ctx.roundRect(-2.5, 8, 5, 16, 2);
  ctx.fill();
  ctx.fillStyle = "#facc15";
  ctx.beginPath();
  ctx.moveTo(0, 22);
  ctx.lineTo(-7, 34);
  ctx.lineTo(0, 30);
  ctx.lineTo(7, 34);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
