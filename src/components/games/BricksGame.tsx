"use client";

import { useEffect, useRef, useState } from "react";
import {
  aim, BALL_R, BRICK_H, BRICK_W, encodeInput, H, launch, LIVES, MAX_MS, newGame, PADDLE_H, PADDLE_Y, speedAt, speedLevel, stageConfig, STEEL, tick,
  TICK_MS, W, type BricksAction, type BricksState,
} from "@/lib/games/arcade/bricks";
import type { GameComponentProps } from "@/lib/games/arcade/types";
import { drawSparks, sparks, toWorld, useCanvasLoop, useFixedStep, type Spark } from "./fx/canvas";
import { useGameFx } from "./fx/GameFx";
import { prefersReducedMotion, useTweened, vibrate } from "./fx/motion";
import { useReportProgress } from "./useProgress";

/** Brick colours by hits left (1–3), steel is grey. */
const BRICK_COLOURS = ["", "#22d3a6", "#a78bfa", "#f43f5e"];
const END_MS = MAX_MS - 15_000;

type View = { score: number; lives: number; left: number; total: number; speed: number; held: boolean; alive: boolean; cleared: boolean };
const snapshot = (s: BricksState, total: number): View => ({
  score: s.score,
  lives: s.lives,
  left: s.left,
  total,
  speed: speedLevel(s),
  held: s.held,
  alive: s.alive,
  cleared: s.cleared,
});

export default function BricksGame({ seed, stage, onFinish, onProgress, timeUp }: GameComponentProps) {
  const cfg = stageConfig(stage);
  const [preview] = useState(() => newGame(seed, stage));
  const total = preview.left;
  const [view, setView] = useState<View>(() => snapshot(preview, total));
  const [started, setStarted] = useState(false);
  const [over, setOver] = useState(false);
  const fx = useGameFx();
  const shownScore = useTweened(view.score, 300);
  useReportProgress(onProgress, started, view.score, `${total - view.left}/${total} bricks`);

  const game = useRef<BricksState>(preview);
  const actions = useRef<BricksAction[]>([]);
  const ticks = useRef(0);
  const finished = useRef(false);
  const want = useRef<{ x: number | null; launch: boolean }>({ x: null, launch: false });
  const lastSent = useRef<number>(W / 2);
  const keys = useRef({ left: false, right: false });
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
  const visual = useRef({ sparks: [] as Spark[], trail: [] as [number, number][], flash: new Map<number, number>(), shakeAt: 0, paddleGlow: 0 });

  function finish() {
    if (finished.current) return;
    finished.current = true;
    setOver(true);
    finishRef.current(encodeInput(actions.current, ticks.current));
  }

  useEffect(() => {
    if (timeUp) finish();
  }, [timeUp]);

  function begin() {
    if (finished.current || started) return;
    setStarted(true);
  }

  const lastSpeed = useRef(1);

  useFixedStep(started && !over, TICK_MS, () => {
    const s = game.current;
    if (finished.current) return false;
    const t = ++ticks.current;
    // Keys steer towards the edges; letting go stops the paddle where it is.
    let x = want.current.x;
    if (keys.current.left !== keys.current.right) x = keys.current.left ? 0 : W;
    if (x !== null) {
      const r = Math.max(0, Math.min(W, Math.round(x)));
      if (r !== lastSent.current) {
        aim(s, r);
        actions.current.push({ tick: t, x: r });
        lastSent.current = r;
      }
    }
    if (want.current.launch) {
      want.current.launch = false;
      if (launch(s)) actions.current.push({ tick: t, a: "L" });
    }
    tick(s);
    const now = performance.now();
    const v = visual.current;
    const calm = prefersReducedMotion();
    for (const e of s.events) {
      if (e.kind === "hit") {
        const b = s.bricks[e.brick];
        v.flash.set(e.brick, now);
        if (e.broke && !calm) v.sparks.push(...sparks(b.x + BRICK_W / 2, b.y + BRICK_H / 2, now, BRICK_COLOURS[b.max] || "#e2e8f0", 16, 150));
        if (e.broke) vibrate(6);
        if (e.broke && s.streak >= 4 && s.streak % 2 === 0) fxRef.current.pop(`Streak x${s.streak}`, { tone: s.streak >= 6 ? "great" : "good", emoji: "🔥", ms: 900 });
      } else if (e.kind === "paddle") {
        v.paddleGlow = now;
      } else if (e.kind === "lost") {
        v.shakeAt = now;
        fxRef.current.shake();
        vibrate([30, 40, 30]);
        if (s.lives > 0) fxRef.current.pop(s.lives === 1 ? "Last ball!" : `${s.lives} balls left`, { tone: "bad", emoji: "💥" });
      } else if (e.kind === "clear") {
        fxRef.current.confetti(70);
        fxRef.current.pop("Stage cleared!", { tone: "great", emoji: "🏆", sub: `+${e.bonus} bonus` });
      }
    }
    const lvl = speedLevel(s);
    if (lvl > lastSpeed.current && !s.held) {
      lastSpeed.current = lvl;
      fxRef.current.pop("Speed up!", { tone: "warn", emoji: "⚡", sub: `x${(speedAt(s.stage, s.ticks) / cfg.speed).toFixed(2)}`, ms: 1000 });
    }
    if (t % 4 === 0 || s.events.length || !s.alive) setView(snapshot(s, total));
    if (!s.alive) {
      finish();
      return false;
    }
    if (t * TICK_MS >= END_MS) {
      fxRef.current.pop("Time's up", { tone: "warn", emoji: "⏰" });
      finish();
      return false;
    }
    return true;
  });

  useCanvasLoop(boxRef, canvasRef, W, H, (ctx, now, dt) => {
    const s = game.current;
    const v = visual.current;
    const calm = prefersReducedMotion();
    ctx.save();
    if (!calm && now - v.shakeAt < 300) {
      const k = (1 - (now - v.shakeAt) / 300) * 5;
      ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
    }
    // Background: deep navy with a faint hex glow and grid.
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#151a36");
    bg.addColorStop(1, "#0b1020");
    ctx.fillStyle = bg;
    ctx.fillRect(-10, -10, W + 20, H + 20);
    ctx.strokeStyle = "rgba(124,58,237,0.08)";
    ctx.lineWidth = 1;
    for (let x = 20; x < W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }

    // Bricks.
    s.bricks.forEach((b, i) => {
      if (b.hp <= 0) return;
      const flash = v.flash.get(i);
      const hot = flash !== undefined && now - flash < 140;
      if (b.max === STEEL) {
        const g = ctx.createLinearGradient(b.x, b.y, b.x, b.y + BRICK_H);
        g.addColorStop(0, "#cbd5e1");
        g.addColorStop(1, "#475569");
        ctx.fillStyle = hot ? "#f8fafc" : g;
      } else {
        ctx.fillStyle = hot ? "#ffffff" : BRICK_COLOURS[b.hp];
        ctx.shadowColor = BRICK_COLOURS[b.hp];
        ctx.shadowBlur = calm ? 0 : 8;
      }
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, BRICK_W, BRICK_H, 3);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.fillRect(b.x + 3, b.y + 2, BRICK_W - 6, 3);
      if (b.max !== STEEL && b.hp < b.max) {
        // Cracks on a brick that has been hit.
        ctx.strokeStyle = "rgba(11,16,32,0.7)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(b.x + 8, b.y + 2);
        ctx.lineTo(b.x + 14, b.y + 8);
        ctx.lineTo(b.x + 11, b.y + 13);
        if (b.max - b.hp > 1) {
          ctx.moveTo(b.x + 26, b.y + 1);
          ctx.lineTo(b.x + 22, b.y + 9);
        }
        ctx.stroke();
      }
    });

    // Paddle, glowing brighter for a moment after each hit.
    const glow = calm ? 0 : Math.max(0, 1 - (now - v.paddleGlow) / 250);
    const px = s.paddleX - s.paddleW / 2;
    const pg = ctx.createLinearGradient(px, 0, px + s.paddleW, 0);
    pg.addColorStop(0, "#7c3aed");
    pg.addColorStop(0.5, "#a78bfa");
    pg.addColorStop(1, "#7c3aed");
    ctx.shadowColor = "#a78bfa";
    ctx.shadowBlur = 10 + glow * 20;
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.roundRect(px, PADDLE_Y, s.paddleW, PADDLE_H, 5);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillRect(px + 6, PADDLE_Y + 2, s.paddleW - 12, 2);

    // Ball with a mint trail.
    const b = s.ball;
    if (s.alive || s.cleared) {
      if (!s.held && !calm) {
        v.trail.push([b.x, b.y]);
        if (v.trail.length > 10) v.trail.shift();
        v.trail.forEach(([x, y], i) => {
          ctx.globalAlpha = ((i + 1) / v.trail.length) * 0.35;
          ctx.fillStyle = "#22d3a6";
          ctx.beginPath();
          ctx.arc(x, y, BALL_R * ((i + 1) / v.trail.length), 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
      } else v.trail = [];
      ctx.shadowColor = "#22d3a6";
      ctx.shadowBlur = calm ? 0 : 14;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    v.sparks = drawSparks(ctx, v.sparks, now, dt);
    ctx.restore();
  });

  // Keyboard: arrows or A/D to steer, space or up to launch.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === "ArrowLeft" || k === "a" || k === "A") keys.current.left = true;
      else if (k === "ArrowRight" || k === "d" || k === "D") keys.current.right = true;
      else if (k === " " || k === "ArrowUp" || k === "w" || k === "W") want.current.launch = true;
      else return;
      e.preventDefault();
      want.current.x = null;
      begin();
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === "ArrowLeft" || k === "a" || k === "A") keys.current.left = false;
      else if (k === "ArrowRight" || k === "d" || k === "D") keys.current.right = false;
      else return;
      if (!keys.current.left && !keys.current.right) want.current.x = game.current.paddleX;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  });

  const down = useRef<{ at: number; x: number } | null>(null);
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const p = toWorld(e, e.currentTarget, W);
    down.current = { at: performance.now(), x: p.x };
    want.current.x = p.x;
    begin();
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    // Mouse: the paddle follows the pointer. Touch: it follows the finger while it is down.
    if (e.pointerType !== "mouse" && !down.current) return;
    want.current.x = toWorld(e, e.currentTarget, W).x;
  }
  function onPointerUp() {
    // A tap (or click) launches the ball.
    if (down.current && performance.now() - down.current.at < 400) want.current.launch = true;
    down.current = null;
  }

  const bricksDone = total - view.left;
  return (
    <div className="flex flex-col gap-3 select-none">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2 text-sm text-white/70">
          <span className="flex items-center gap-2">
            <span aria-label={`${view.lives} balls left`} className="tracking-tight">
              {Array.from({ length: LIVES }, (_, i) => (
                <span key={i} className={i < view.lives ? "text-mint" : "text-white/20"}>●</span>
              ))}
            </span>
            <span className="font-semibold text-amber-200">{Math.round(shownScore).toLocaleString()}</span> pts
            <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-semibold text-amber-200">⚡ x{view.speed}</span>
          </span>
          <button type="button" className="underline" onClick={finish} disabled={over}>
            Give up
          </button>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-mint via-brand-violet to-rose-500 transition-[width] duration-300 ease-out"
            style={{ width: `${(bricksDone / total) * 100}%` }}
          />
        </div>
      </div>

      <div
        className="relative mx-auto aspect-square w-full overflow-hidden rounded-2xl border border-brand-violet/30 shadow-[0_0_30px_rgba(124,58,237,0.25)]"
        style={{ touchAction: "none", maxWidth: fx.fullscreen ? "calc(100dvh - 14rem)" : 560 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div ref={boxRef} className="absolute inset-0">
          <canvas ref={canvasRef} className="block h-full w-full" role="img" aria-label="Brick Blitz field" />
        </div>
        {!started && !over && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/45 p-6 text-center text-white/85">
            <p className="text-lg font-semibold">{cfg.name}</p>
            <p>Drag or move to steer, tap to launch</p>
            <p className="text-xs text-white/60">Keys: ← → to steer, space to launch</p>
          </div>
        )}
        {started && view.held && !over && (
          <div className="pointer-events-none absolute inset-x-0 bottom-16 text-center text-sm font-semibold text-mint drop-shadow">Tap to launch</div>
        )}
        {over && !view.cleared && view.lives === 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-2xl font-bold text-white drop-shadow">Out of balls</div>
        )}
      </div>
      <p className="text-center text-xs text-white/50">
        {bricksDone}/{total} bricks · the ball speeds up every 15 seconds
      </p>
    </div>
  );
}
