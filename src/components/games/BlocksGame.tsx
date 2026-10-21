"use client";

import { useEffect, useRef, useState } from "react";
import {
  act,
  CELLS,
  dropRow,
  encodeInput,
  H,
  newGame,
  nextPiece,
  stageConfig,
  tick,
  TICK_MS,
  W,
  type Action,
  type BlocksState,
  type TimedAction,
} from "@/lib/games/arcade/blocks";
import type { GameComponentProps } from "@/lib/games/arcade/types";

// One colour per piece type (I O T S Z J L).
const COLORS = ["bg-cyan-400", "bg-yellow-300", "bg-fuchsia-400", "bg-emerald-400", "bg-red-400", "bg-blue-400", "bg-orange-400"];

type View = { board: Uint8Array; type: number; rot: number; x: number; y: number; ghost: number; next: number; lines: number; score: number; alive: boolean };

const snapshot = (s: BlocksState): View => ({
  board: s.board.slice(),
  ...s.piece,
  ghost: dropRow(s),
  next: nextPiece(s),
  lines: s.lines,
  score: s.score,
  alive: s.alive,
});

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

export default function BlocksGame({ seed, stage, onFinish }: GameComponentProps) {
  const { target } = stageConfig(stage);
  const [view, setView] = useState<View>(() => snapshot(newGame(seed, stage)));
  const [started, setStarted] = useState(false);
  const [over, setOver] = useState(false);

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
          if (act(s, a)) actions.current.push({ tick: t, a });
        }
        tick(s);
      }
      if (acc > TICK_MS) acc = TICK_MS;
      // Only redraw when something visible changed.
      const p = s.piece;
      const key = `${p.type},${p.rot},${p.x},${p.y},${s.score},${s.lines},${s.queue.length},${s.alive}`;
      if (key !== drawn) {
        drawn = key;
        setView(snapshot(s));
      }
      if (finished.current) return;
      if (!s.alive) {
        // Topped out: the game ends on this tick.
        finished.current = true;
        setOver(true);
        finishRef.current(encodeInput(actions.current, ticks.current));
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [started]);

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

  // Draw the stack, the ghost and the falling piece.
  const cells: string[] = Array.from(view.board, (v) => (v ? COLORS[v - 1] : ""));
  if (view.alive) {
    for (const [r, c] of CELLS[view.type][view.rot]) {
      const gi = (view.ghost + r) * W + view.x + c;
      if (!cells[gi]) cells[gi] = "ghost";
    }
    for (const [r, c] of CELLS[view.type][view.rot]) cells[(view.y + r) * W + view.x + c] = COLORS[view.type];
  }
  const reached = view.lines >= target;

  return (
    <div className="flex flex-col gap-3 select-none">
      <div className="flex items-center justify-between text-sm text-white/70">
        <span>
          Lines {view.lines}/{target} · {view.score.toLocaleString()} pts
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

      <div className="flex gap-2">
        <div
          className="relative flex-1 rounded-2xl border border-white/10 bg-black/30 p-1"
          style={{ touchAction: "none" }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onClick={start}
        >
          <div className="mx-auto grid gap-px" style={{ gridTemplateColumns: `repeat(${W}, 1fr)`, aspectRatio: `${W} / ${H}`, height: "min(62vh, calc((100vw - 130px) * 2), 560px)" }}>
            {cells.map((c, i) => (
              <div
                key={i}
                className={c === "ghost" ? "rounded-[3px] border border-white/25" : c ? `rounded-[3px] ${c}` : "rounded-[3px] bg-white/[0.04]"}
              />
            ))}
          </div>
          {!started && !over && (
            <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50 p-6 text-center text-white/80">
              Tap to start
            </div>
          )}
          {over && !view.alive && (
            <div className="absolute inset-x-0 top-1/3 text-center text-2xl font-bold text-white drop-shadow">Game over</div>
          )}
        </div>

        <div className="flex w-16 flex-col items-center gap-2 text-xs text-white/60">
          <span>Next</span>
          <div className="grid w-14 grid-cols-4 gap-px rounded-lg bg-black/30 p-1">
            {Array.from({ length: 8 }, (_, i) => {
              const filled = CELLS[view.next][0].some(([r, c]) => r * 4 + c === i);
              return <div key={i} className={`aspect-square rounded-[2px] ${filled ? COLORS[view.next] : ""}`} />;
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
            className="h-14 rounded-xl border border-white/10 bg-white/5 text-2xl text-white/80 active:bg-emerald-500/30"
            style={{ touchAction: "none" }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
