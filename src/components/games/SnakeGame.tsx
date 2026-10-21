"use client";

import { useEffect, useRef, useState } from "react";
import { encodeInput, newGame, scoreFor, SIZE, stageConfig, step, turn, type Dir, type SnakeState, type Turn } from "@/lib/games/arcade/snake";
import type { GameComponentProps } from "@/lib/games/arcade/types";

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

const snapshot = (s: SnakeState): View => ({ body: s.body.slice(), food: s.food, eaten: s.eaten, alive: s.alive });

export default function SnakeGame({ seed, stage, onFinish }: GameComponentProps) {
  const { tickMs, target } = stageConfig(stage);
  const [walls] = useState(() => newGame(seed, stage).walls);
  const [view, setView] = useState<View>(() => snapshot(newGame(seed, stage)));
  const [started, setStarted] = useState(false);
  const [over, setOver] = useState(false);

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

  // Fixed-step loop: never runs ahead of real time, and skips (rather than races) after the tab was hidden.
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
        step(s);
      }
      if (acc > tickMs) acc = tickMs;
      if (steps) setView(snapshot(s));
      if (finished.current) return;
      if (!s.alive) {
        // Crashed: the game ends on this tick.
        finished.current = true;
        setOver(true);
        finishRef.current(encodeInput(turns.current, ticks.current));
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [started, tickMs]);

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

  const cells = new Uint8Array(SIZE * SIZE); // 0 empty, 1 wall, 2 body, 3 head, 4 food
  for (let i = 0; i < cells.length; i++) if (walls[i]) cells[i] = 1;
  view.body.forEach((b, i) => (cells[b] = i === 0 ? 3 : 2));
  if (view.food >= 0) cells[view.food] = 4;
  const reached = view.eaten >= target;

  return (
    <div className="flex flex-col gap-3 select-none">
      <div className="flex items-center justify-between text-sm text-white/70">
        <span>
          🍎 {view.eaten}/{target} · {scoreFor(view.eaten, stage)} pts
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

      <div
        className="relative aspect-square rounded-2xl border border-white/10 bg-black/30 p-1"
        style={{ touchAction: "none" }}
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchMove={onTouchMove}
        onTouchEnd={() => (touch.current = null)}
      >
        <div className="grid h-full w-full gap-px" style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)`, gridTemplateRows: `repeat(${SIZE}, 1fr)` }}>
          {Array.from(cells, (c, i) => (
            <div
              key={i}
              className={
                c === 1
                  ? "rounded-sm bg-white/25"
                  : c === 2
                    ? "rounded-sm bg-emerald-500"
                    : c === 3
                      ? "rounded-sm bg-emerald-300"
                      : c === 4
                        ? "scale-75 rounded-full bg-amber-400"
                        : "rounded-sm bg-white/[0.03]"
              }
            />
          ))}
        </div>
        {!started && !over && (
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50 p-6 text-center text-white/80">
            Swipe, tap an arrow or press an arrow key to start
          </div>
        )}
        {over && !view.alive && (
          <div className="absolute inset-x-0 top-1/3 text-center text-2xl font-bold text-white drop-shadow">Crashed!</div>
        )}
        {reached && !over && view.alive && (
          <div className="pointer-events-none absolute inset-x-0 top-2 text-center text-xs font-semibold text-emerald-300">
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
            className={`${pos} h-14 w-14 rounded-xl border border-white/10 bg-white/5 text-2xl text-white/80 active:bg-emerald-500/30`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
