"use client";

import { useEffect, useRef, useState } from "react";
import { encodeInput, MAX_MS, newGame, scoreFor, stageConfig, step, turn, type Dir, type SnakeState, type Turn } from "@/lib/games/arcade/snake";
import type { GameComponentProps } from "@/lib/games/arcade/types";
import { useGameFx, type PopOptions } from "./fx/GameFx";
import { prefersReducedMotion, useTweened, vibrate } from "./fx/motion";
import { burst, drawBackground, drawSnake, type SnakeScene } from "./snake/render";
import { useReportProgress } from "./useProgress";

type View = { body: number[]; food: number; eaten: number; alive: boolean };

const KEYS: Record<string, Dir> = {
  ArrowUp: "U",
  ArrowDown: "D",
  ArrowLeft: "L",
  ArrowRight: "R",
  w: "U",
  s: "D",
  a: "L",
  d: "R",
  W: "U",
  S: "D",
  A: "L",
  D: "R",
};

/** Two foods eaten within this many ticks of each other make a combo. */
const COMBO_TICKS = 10;

const snapshot = (s: SnakeState): View => ({ body: s.body.slice(), food: s.food, eaten: s.eaten, alive: s.alive });

/** What the renderer needs between ticks. Written by the game loop, read by the drawing loop; never read back by the game. */
type Visual = {
  prev: number[];
  lastTickAt: number;
  foodBorn: number;
  swallow: { cell: number; at: number } | null;
  crashAt: number | null;
  particles: SnakeScene["particles"];
};


/** The game hands itself in this long before the server's time limit, leaving room for network delays. */
const END_MS = MAX_MS - 15_000;

export default function SnakeGame({ seed, stage, onFinish, onProgress }: GameComponentProps) {
  const { tickMs, target } = stageConfig(stage);
  const [preview] = useState(() => newGame(seed, stage));
  const walls = preview.walls;
  const [view, setView] = useState<View>(() => snapshot(preview));
  const [started, setStarted] = useState(false);
  const [over, setOver] = useState(false);
  const fx = useGameFx();
  const shownScore = useTweened(scoreFor(view.eaten, stage), 350);
  useReportProgress(onProgress, started, scoreFor(view.eaten, stage), `${view.eaten}/${target} food`);

  // The live game runs in refs; `view` is a copy for drawing.
  const game = useRef<SnakeState | null>(null);
  const queue = useRef<Dir[]>([]);
  const turns = useRef<Turn[]>([]);
  const ticks = useRef(0);
  const finished = useRef(false);
  const finishRef = useRef(onFinish);
  useEffect(() => {
    finishRef.current = onFinish;
  });
  const touch = useRef<{ x: number; y: number } | null>(null);

  const visual = useRef<Visual>({ prev: preview.body.slice(), lastTickAt: 0, foodBorn: 0, swallow: null, crashAt: null, particles: [] });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Popups: at most one a second, except the ones that must be seen.
  const fxRef = useRef(fx);
  useEffect(() => {
    fxRef.current = fx;
  });
  const lastPop = useRef(0);
  const say = (text: string, opts: PopOptions, force = false) => {
    const now = performance.now();
    if (!force && now - lastPop.current < 1000) return;
    lastPop.current = now;
    fxRef.current.pop(text, opts);
  };
  const combo = useRef({ lastTick: -999, count: 1 });
  const warned = useRef({ minute: false, ten: false });

  function finish() {
    if (finished.current) return;
    finished.current = true;
    setOver(true);
    finishRef.current(encodeInput(turns.current, ticks.current));
  }

  function press(dir: Dir) {
    if (finished.current) return;
    if (!game.current) {
      game.current = newGame(seed, stage);
      setStarted(true);
    }
    if (queue.current.length < 3) queue.current.push(dir);
  }

  /** Feedback for food eaten on tick `t` (visual only). */
  function ate(s: SnakeState, cell: number, t: number, at: number) {
    const v = visual.current;
    v.swallow = { cell, at };
    // The head reaches the food over the next tick: sparks then, and the new food grows in a little later.
    v.foodBorn = at + tickMs * 0.6;
    if (!prefersReducedMotion()) v.particles.push(...burst(cell, at, tickMs * 0.8));
    vibrate(10);
    const c = combo.current;
    c.count = t - c.lastTick <= COMBO_TICKS ? c.count + 1 : 1;
    c.lastTick = t;
    if (s.eaten === target) {
      say("Target reached!", { tone: "great", emoji: "🏆", sub: "Keep going or press Finish" }, true);
      fxRef.current.confetti(25);
    } else if (s.eaten === Math.ceil(target / 2)) {
      say("Halfway there", { tone: "info", emoji: "🐍", sub: `${s.eaten}/${target} eaten` });
    } else if (c.count >= 2) {
      say(`Combo x${c.count}`, { tone: c.count >= 3 ? "great" : "good", emoji: "🔥" });
    }
  }

  // Fixed-step loop: never runs ahead of real time, and skips (rather than races) after the tab was hidden.
  // The rendering only records what happened here; it never changes when or how ticks run.
  useEffect(() => {
    if (!started) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const frame = (now: number) => {
      const s = game.current!;
      acc += now - last;
      last = now;
      let steps = 0;
      while (acc >= tickMs && steps < 3 && s.alive && !finished.current) {
        acc -= tickMs;
        steps++;
        const t = ++ticks.current;
        while (queue.current.length) {
          const d = queue.current.shift()!;
          if (turn(s, d)) {
            turns.current.push({ tick: t, dir: d });
            break;
          }
        }
        const before = s.body.slice();
        const eaten = s.eaten;
        const food = s.food;
        step(s);
        visual.current.prev = before;
        if (s.eaten > eaten) ate(s, food, t, now - acc);
      }
      if (acc > tickMs) acc = tickMs;
      if (steps) {
        visual.current.lastTickAt = now - acc;
        setView(snapshot(s));
        const played = ticks.current * tickMs;
        if (!warned.current.minute && played >= END_MS - 60_000) {
          warned.current.minute = true;
          say("1 minute left", { tone: "warn", emoji: "⏳" }, true);
        }
        if (!warned.current.ten && played >= END_MS - 10_000) {
          warned.current.ten = true;
          say("Last 10 seconds", { tone: "bad", emoji: "⏰" }, true);
        }
      }
      if (finished.current) return;
      if (s.alive && ticks.current * tickMs >= END_MS) {
        // Out of time: hand in the game as it stands, before the server's limit would throw it out.
        finished.current = true;
        setOver(true);
        finishRef.current(encodeInput(turns.current, ticks.current));
        fxRef.current.pop("Time's up", { tone: "warn", emoji: "⏰" });
        return;
      }
      if (!s.alive) {
        // Crashed: the game ends on this tick.
        finished.current = true;
        setOver(true);
        finishRef.current(encodeInput(turns.current, ticks.current));
        visual.current.crashAt = now;
        fxRef.current.shake();
        vibrate([30, 40, 30]);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ate` only reads refs
  }, [started, tickMs]);

  // Drawing loop: sizes the canvas from its box and draws every frame, gliding between ticks.
  useEffect(() => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!canvas || !box) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let px = 0;
    let dpr = 1;
    let bg: HTMLCanvasElement | null = null;
    const resize = () => {
      px = box.clientWidth;
      dpr = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = Math.max(1, Math.round(px * dpr));
      canvas.height = canvas.width;
      bg = px > 0 ? drawBackground(px, dpr, walls) : null;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(box);
    const calm = prefersReducedMotion();
    let raf = 0;
    let last = performance.now();
    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const s = game.current ?? preview;
      const v = visual.current;
      const alpha = game.current ? Math.min(1, Math.max(0, (now - v.lastTickAt) / tickMs)) : 1;
      const scene: SnakeScene = {
        wrap: s.wrap,
        prev: v.prev,
        body: s.body,
        alpha: calm ? 1 : alpha,
        dir: s.dir,
        alive: s.alive,
        food: s.food,
        foodBorn: v.foodBorn,
        swallow: v.swallow,
        crashAt: v.crashAt,
        particles: v.particles,
        now,
        tickMs,
        calm,
      };
      if (px > 0) drawSnake(ctx, bg, scene, px, dpr, dt);
      v.particles = scene.particles;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [preview, walls, tickMs]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const dir = KEYS[e.key];
      if (!dir) return;
      e.preventDefault();
      press(dir);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function onTouchMove(e: React.TouchEvent) {
    const start = touch.current;
    if (!start) return;
    const p = e.touches[0];
    const dx = p.clientX - start.x;
    const dy = p.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    press(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "R" : "L") : dy > 0 ? "D" : "U");
    // Keep tracking from here so one long gesture can make several turns.
    touch.current = { x: p.clientX, y: p.clientY };
  }

  const reached = view.eaten >= target;
  const progress = Math.min(1, view.eaten / target);

  return (
    <div className="flex flex-col gap-3 select-none">
      <style>{`@keyframes snake-bump { 0% { transform: scale(1) } 40% { transform: scale(1.35) } 100% { transform: scale(1) } }`}</style>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-sm text-white/70">
          <span>
            🍎{" "}
            <span key={view.eaten} className="inline-block font-semibold text-rose-300" style={{ animation: view.eaten ? "snake-bump .3s ease-out" : undefined }}>
              {view.eaten}
            </span>
            /{target} · <span className="font-semibold text-amber-200">{Math.round(shownScore)}</span> pts
          </span>
          <button
            type="button"
            className={reached ? "rounded-full bg-emerald-500 px-3 py-1 font-semibold text-emerald-950" : "underline"}
            onClick={finish}
            disabled={over}
          >
            {reached ? "Finish" : "Give up"}
          </button>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-fuchsia-500 transition-[width] duration-300 ease-out"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      <div
        className="relative mx-auto aspect-square w-full overflow-hidden rounded-2xl border border-indigo-300/20 shadow-[0_0_30px_rgba(99,102,241,0.18)]"
        style={{ touchAction: "none", maxWidth: fx.fullscreen ? "calc(100dvh - 17rem)" : undefined }}
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchMove={onTouchMove}
        onTouchEnd={() => (touch.current = null)}
      >
        <div ref={boxRef} className="absolute inset-0">
          <canvas ref={canvasRef} className="block h-full w-full" aria-label="Snake board" role="img" />
        </div>
        {!started && !over && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/45 p-6 text-center text-white/85">
            Swipe, tap an arrow or press an arrow key to start
          </div>
        )}
        {over && !view.alive && (
          <div className="absolute inset-x-0 top-1/3 text-center text-2xl font-bold text-white drop-shadow">Crashed!</div>
        )}
        {reached && !over && view.alive && (
          <div className="pointer-events-none absolute inset-x-0 top-2 text-center text-xs font-semibold text-emerald-300 drop-shadow">
            Target reached! Keep going or press Finish
          </div>
        )}
      </div>

      <div className="mx-auto grid grid-cols-3 gap-2">
        {([
          ["U", "↑", "col-start-2"],
          ["L", "←", "col-start-1 row-start-2"],
          ["D", "↓", "col-start-2 row-start-2"],
          ["R", "→", "col-start-3 row-start-2"],
        ] as [Dir, string, string][]).map(([dir, label, pos]) => (
          <button
            key={dir}
            type="button"
            aria-label={`Turn ${label}`}
            onPointerDown={(e) => {
              e.preventDefault();
              press(dir);
            }}
            className={`${pos} h-14 w-14 rounded-xl border border-white/10 bg-gradient-to-b from-white/10 to-white/[0.03] text-2xl text-white/80 transition-transform active:scale-90 active:bg-emerald-500/30`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
