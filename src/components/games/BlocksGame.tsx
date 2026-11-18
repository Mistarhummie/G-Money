"use client";

import { useEffect, useRef, useState } from "react";
import {
  act,
  CELLS,
  encodeInput,
  H,
  MAX_MS,
  newGame,
  nextPiece,
  stageConfig,
  tick,
  TICK_MS,
  W,
  type Action,
  type BlocksState,
  type Piece,
  type TimedAction,
} from "@/lib/games/arcade/blocks";
import type { GameComponentProps } from "@/lib/games/arcade/types";
import { clearSparks, drawBlocks, makeSurface, newFx, PALETTE, type BlocksFx, type Surface } from "./blocks/render";
import { useGameFx, type PopOptions } from "./fx/GameFx";
import { prefersReducedMotion, useTweened, vibrate } from "./fx/motion";
import { useReportProgress } from "./useProgress";

type View = { next: number; spawned: number; lines: number; score: number; alive: boolean };

const snapshot = (s: BlocksState): View => ({
  next: nextPiece(s),
  spawned: s.bags * 7 - s.queue.length,
  lines: s.lines,
  score: s.score,
  alive: s.alive,
});

const swatch = (type: number) => {
  const [light, base, dark] = PALETTE[type];
  return { background: `linear-gradient(135deg, ${light}, ${base} 45%, ${dark})`, boxShadow: `0 0 8px ${base}88` };
};

const KEYS: Record<string, Action> = {
  ArrowLeft: "L",
  a: "L",
  A: "L",
  ArrowRight: "R",
  d: "R",
  D: "R",
  ArrowUp: "C",
  w: "C",
  W: "C",
  x: "C",
  X: "C",
  ArrowDown: "S",
  s: "S",
  S: "S",
  " ": "H",
};


/** The game hands itself in this long before the server's time limit, leaving room for network delays. */
const END_MS = MAX_MS - 15_000;

export default function BlocksGame({ seed, stage, onFinish, onProgress }: GameComponentProps) {
  const { target } = stageConfig(stage);
  const [preview] = useState(() => newGame(seed, stage));
  const [view, setView] = useState<View>(() => snapshot(preview));
  const [started, setStarted] = useState(false);
  const [over, setOver] = useState(false);
  const fx = useGameFx();
  const shownScore = useTweened(view.score, 400);
  useReportProgress(onProgress, started, view.score, `${view.lines}/${target} lines`);

  // The live game runs in refs; `view` is a copy for drawing.
  const game = useRef<BlocksState | null>(null);
  const queue = useRef<Action[]>([]);
  const actions = useRef<TimedAction[]>([]);
  const ticks = useRef(0);
  const finished = useRef(false);
  const finishRef = useRef(onFinish);
  useEffect(() => {
    finishRef.current = onFinish;
  });
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touch = useRef<{ x: number; y: number; sx: number; sy: number; t: number; moved: boolean } | null>(null);

  // Visual effects, recorded by the game loop and drawn by the drawing loop. The game never reads them.
  const effects = useRef<BlocksFx>(newFx());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const fxRef = useRef(fx);
  useEffect(() => {
    fxRef.current = fx;
  });
  // Popups: at most one a second, except the ones that must be seen.
  const lastPop = useRef(0);
  const say = (text: string, opts: PopOptions, force = false) => {
    const now = performance.now();
    if (!force && now - lastPop.current < 1000) return;
    lastPop.current = now;
    fxRef.current.pop(text, opts);
  };
  const combo = useRef(0);
  const warned = useRef({ high: false, minute: false, ten: false });

  /** A piece just locked: work out what happened for the effects and popups (visual only). */
  function locked(s: BlocksState, pre: Uint8Array, piece: Piece, fromY: number, hard: boolean, linesBefore: number, now: number) {
    const e = effects.current;
    const calm = prefersReducedMotion();
    const merged = pre.slice();
    const cells = CELLS[piece.type][piece.rot].map(([r, c]) => (piece.y + r) * W + piece.x + c);
    for (const i of cells) merged[i] = piece.type + 1;
    const rows: number[] = [];
    for (let r = 0; r < H; r++) {
      let full = true;
      for (let c = 0; c < W; c++) if (!merged[r * W + c]) full = false;
      if (full) rows.push(r);
    }
    e.boardVersion++;
    e.lockFlash = { cells, at: now };
    e.clear = rows.length ? { rows, merged, at: now } : null;
    if (rows.length) e.sparks.push(...clearSparks(rows, merged, now, calm));
    if (hard) {
      const dist = piece.y - fromY;
      const cols = new Map<number, { x: number; from: number; to: number }>();
      for (const [r, c] of CELLS[piece.type][piece.rot]) {
        const x = piece.x + c;
        const col = cols.get(x);
        if (!col || piece.y + r < col.to) cols.set(x, { x, from: fromY + r, to: piece.y + r });
      }
      e.slam = { type: piece.type, cols: [...cols.values()], at: now, power: Math.min(1, 0.35 + dist / 12) };
      vibrate(dist > 4 ? 20 : 10);
    }

    // Popups, most important first; one at a time.
    const n = rows.length;
    combo.current = n ? combo.current + 1 : 0;
    const half = Math.ceil(target / 2);
    if (n && linesBefore < target && s.lines >= target) {
      say("Target reached!", { tone: "great", emoji: "🏆", sub: "Keep going or press Finish" }, true);
      fxRef.current.confetti(25);
    } else if (n === 4) {
      say("Quad!", { tone: "great", emoji: "💥", sub: "4 lines at once" }, true);
      fxRef.current.confetti(25);
    } else if (n && !s.board.some((v) => v)) {
      say("Perfect clear!", { tone: "great", emoji: "✨" }, true);
      fxRef.current.confetti(25);
    } else if (n && linesBefore < half && s.lines >= half) {
      say("Halfway there", { tone: "info", emoji: "🧱", sub: `${s.lines}/${target} lines` });
    } else if (combo.current >= 2) {
      say(`Combo x${combo.current}`, { tone: combo.current >= 3 ? "great" : "good", emoji: "🔥" });
    } else if (n === 3) {
      say("Triple!", { tone: "good", emoji: "⚡" });
    } else if (n === 2) {
      say("Double!", { tone: "good" });
    }
    if (n) vibrate(n >= 4 ? [20, 30, 40] : 15);

    // Warn once when the stack climbs near the top; again only after it has come back down.
    let top = H;
    for (let i = 0; i < s.board.length; i++)
      if (s.board[i]) {
        top = Math.floor(i / W);
        break;
      }
    if (top <= 4 && !warned.current.high && s.alive) {
      warned.current.high = true;
      say("Danger! Stack is high", { tone: "warn", emoji: "⚠️" });
    } else if (top >= 9) warned.current.high = false;
  }

  function finish() {
    if (finished.current) return;
    finished.current = true;
    setOver(true);
    finishRef.current(encodeInput(actions.current, ticks.current));
  }

  function start() {
    if (game.current || finished.current) return;
    game.current = newGame(seed, stage);
    setStarted(true);
  }

  function press(a: Action) {
    if (finished.current) return;
    start();
    if (queue.current.length < 8) queue.current.push(a);
  }

  // Fixed-step loop: never runs ahead of real time, and skips (rather than races) after the tab was hidden.
  useEffect(() => {
    if (!started) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let drawn = "";
    const frame = (now: number) => {
      const s = game.current!;
      acc += now - last;
      last = now;
      let steps = 0;
      while (acc >= TICK_MS && steps < 4 && s.alive && !finished.current) {
        acc -= TICK_MS;
        steps++;
        const t = ++ticks.current;
        for (const a of queue.current.splice(0)) {
          if (!s.alive) break;
          // Recorded for the effects only; the game itself is untouched.
          const piece = s.piece;
          const fromY = piece.y;
          const pre = a === "H" ? s.board.slice() : null;
          const lines = s.lines;
          if (act(s, a)) {
            actions.current.push({ tick: t, a });
            if (a === "C") effects.current.rotAt = now;
            if (pre) locked(s, pre, piece, fromY, true, lines, now);
          }
        }
        const piece = s.piece;
        const pre = s.lock > 0 ? s.board.slice() : null;
        const lines = s.lines;
        tick(s);
        if (pre && s.piece !== piece) locked(s, pre, piece, piece.y, false, lines, now);
      }
      if (acc > TICK_MS) acc = TICK_MS;
      // Only re-render the panel when something it shows changed; the board is drawn on the canvas.
      const key = `${s.score},${s.lines},${s.queue.length},${s.alive}`;
      if (key !== drawn) {
        drawn = key;
        setView(snapshot(s));
      }
      if (steps) {
        const played = ticks.current * TICK_MS;
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
      if (s.alive && ticks.current * TICK_MS >= END_MS) {
        // Out of time: hand in the game as it stands, before the server's limit would throw it out.
        finished.current = true;
        setOver(true);
        finishRef.current(encodeInput(actions.current, ticks.current));
        fxRef.current.pop("Time's up", { tone: "warn", emoji: "⏰" });
        return;
      }
      if (!s.alive) {
        // Topped out: the game ends on this tick.
        finished.current = true;
        setOver(true);
        finishRef.current(encodeInput(actions.current, ticks.current));
        fxRef.current.shake();
        vibrate([30, 40, 60]);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `locked` and `say` only read refs
  }, [started]);

  // Drawing loop: sizes the canvas from its box and draws every frame.
  useEffect(() => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!canvas || !box) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let sf: Surface | null = null;
    const resize = () => {
      const px = box.clientWidth;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      if (px <= 0) return;
      canvas.width = Math.round(px * dpr);
      canvas.height = Math.round(px * 2 * dpr);
      sf = makeSurface(px, dpr);
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
      if (sf) drawBlocks(ctx, sf, game.current ?? preview, effects.current, now, dt, calm);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [preview]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = KEYS[e.key];
      if (!a) return;
      e.preventDefault();
      if (e.repeat && (a === "C" || a === "H")) return;
      press(a);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Holding a button repeats left, right and down.
  function holdStart(a: Action) {
    press(a);
    if (a === "C" || a === "H") return;
    const repeat = (delay: number) => {
      hold.current = setTimeout(() => {
        press(a);
        repeat(60);
      }, delay);
    };
    repeat(180);
  }
  function holdEnd() {
    if (hold.current) clearTimeout(hold.current);
    hold.current = null;
  }
  useEffect(() => holdEnd, []);

  // Board gestures: drag sideways to move, drag down to soft drop, flick down to hard drop, tap to rotate.
  const STEP_PX = 26;
  function onTouchStart(e: React.TouchEvent) {
    const p = e.touches[0];
    touch.current = { x: p.clientX, y: p.clientY, sx: p.clientX, sy: p.clientY, t: performance.now(), moved: false };
  }
  function onTouchMove(e: React.TouchEvent) {
    const g = touch.current;
    if (!g) return;
    const p = e.touches[0];
    while (p.clientX - g.x >= STEP_PX) {
      press("R");
      g.x += STEP_PX;
      g.moved = true;
    }
    while (g.x - p.clientX >= STEP_PX) {
      press("L");
      g.x -= STEP_PX;
      g.moved = true;
    }
    while (p.clientY - g.y >= STEP_PX) {
      press("S");
      g.y += STEP_PX;
      g.moved = true;
    }
  }
  function onTouchEnd(e: React.TouchEvent) {
    const g = touch.current;
    touch.current = null;
    if (!g) return;
    const p = e.changedTouches[0];
    const dt = performance.now() - g.t;
    const dy = p.clientY - g.sy;
    const dx = p.clientX - g.sx;
    if (dy > 60 && dt < 250 && dy > Math.abs(dx) * 2) press("H");
    else if (!g.moved && dt < 300 && Math.abs(dx) < 10 && Math.abs(dy) < 10) press("C");
  }

  const reached = view.lines >= target;
  const progress = Math.min(1, view.lines / target);

  return (
    <div className="flex flex-col gap-3 select-none">
      <style>{`@keyframes blocks-in { 0% { transform: scale(.4) rotate(-20deg); opacity: 0 } 70% { transform: scale(1.12) } 100% { transform: scale(1); opacity: 1 } }
        @keyframes blocks-bump { 0% { transform: scale(1) } 40% { transform: scale(1.35) } 100% { transform: scale(1) } }`}</style>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-sm text-white/70">
          <span>
            Lines{" "}
            <span key={view.lines} className="inline-block font-semibold text-cyan-300" style={{ animation: view.lines ? "blocks-bump .3s ease-out" : undefined }}>
              {view.lines}
            </span>
            /{target} · <span className="font-semibold text-amber-200">{Math.round(shownScore).toLocaleString()}</span> pts
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
            className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-amber-400 transition-[width] duration-300 ease-out"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <div
          className="relative flex flex-1 justify-center"
          style={{ touchAction: "none" }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onClick={start}
        >
          <div
            ref={boxRef}
            className="relative overflow-hidden rounded-2xl border border-fuchsia-300/20 shadow-[0_0_32px_rgba(217,70,239,0.18)]"
            style={{
              aspectRatio: `${W} / ${H}`,
              height: fx.fullscreen ? "min(calc(100dvh - 15rem), calc((100vw - 110px) * 2))" : "min(62vh, calc((100vw - 130px) * 2), 560px)",
            }}
          >
            <canvas ref={canvasRef} className="block h-full w-full" aria-label="Block stacker board" role="img" />
            {!started && !over && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/45 p-6 text-center text-white/85">Tap to start</div>
            )}
            {over && !view.alive && (
              <div className="absolute inset-x-0 top-1/3 text-center text-2xl font-bold text-white drop-shadow">Game over</div>
            )}
          </div>
        </div>

        <div className="flex w-16 flex-col items-center gap-2 text-xs text-white/60">
          <span>Next</span>
          <div
            key={view.spawned}
            className="grid w-14 grid-cols-4 gap-0.5 rounded-lg border border-white/10 bg-black/40 p-1"
            style={{ animation: started ? "blocks-in .28s ease-out" : undefined }}
          >
            {Array.from({ length: 8 }, (_, i) => {
              const filled = CELLS[view.next][0].some(([r, c]) => r * 4 + c === i);
              return <div key={i} className="aspect-square rounded-[3px]" style={filled ? swatch(view.next) : undefined} />;
            })}
          </div>
          {reached && !over && <span className="text-center font-semibold text-emerald-300">Target reached!</span>}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {([
          ["L", "←", "Left"],
          ["R", "→", "Right"],
          ["C", "⟳", "Rotate"],
          ["S", "↓", "Down"],
          ["H", "⤓", "Drop"],
        ] as [Action, string, string][]).map(([a, label, name]) => (
          <button
            key={a}
            type="button"
            aria-label={name}
            onPointerDown={(e) => {
              e.preventDefault();
              holdStart(a);
            }}
            onPointerUp={holdEnd}
            onPointerLeave={holdEnd}
            onPointerCancel={holdEnd}
            onContextMenu={(e) => e.preventDefault()}
            className="h-14 rounded-xl border border-white/10 bg-gradient-to-b from-white/10 to-white/[0.03] text-2xl text-white/80 transition-transform active:scale-90 active:bg-fuchsia-500/30"
            style={{ touchAction: "none" }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
