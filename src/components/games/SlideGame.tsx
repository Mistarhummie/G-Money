"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useGameFx, type PopOptions } from "@/components/games/fx/GameFx";
import { vibrate } from "@/components/games/fx/motion";
import { applyMove, boardFromSeed, isSolved, moveForTile, stageConfig, type Board, type Move } from "@/lib/games/arcade/slide";
import type { GameComponentProps } from "@/lib/games/arcade/types";

const SLIDE_MS = 170; // a tile glides into the gap, speeding up then slowing down
const POP_GAP_MS = 1000;

/** Arrow keys push the tile next to the gap in that direction (so the gap moves the other way). */
const KEY_MOVES: Record<string, Move> = { ArrowUp: "D", ArrowDown: "U", ArrowLeft: "R", ArrowRight: "L" };

/** A rainbow across the solved board: each tile keeps its colour wherever it is. */
function hueOf(v: number, size: number) {
  return Math.round(200 + ((v - 1) / (size * size - 2)) * 250) % 360;
}

const homeCount = (b: Board) => b.reduce((n, v, i) => n + (v === i + 1 ? 1 : 0), 0);
const rowDone = (b: Board, size: number, r: number) => Array.from({ length: size }, (_, c) => r * size + c).every((i) => b[i] === i + 1);
const colDone = (b: Board, size: number, c: number) =>
  Array.from({ length: size }, (_, r) => r * size + c).every((i) => i === size * size - 1 || b[i] === i + 1);

export default function SlideGame({ seed, stage, onFinish }: GameComponentProps) {
  const { size, seconds } = stageConfig(stage);
  const fx = useGameFx();
  const start = useMemo(() => boardFromSeed(seed, size), [seed, size]);
  const [board, setBoard] = useState(start);
  const [moves, setMoves] = useState("");
  const [arrived, setArrived] = useState<{ v: number; id: number } | null>(null); // a tile that just reached home
  const [gaveUp, setGaveUp] = useState(false);
  const done = isSolved(board) || gaveUp;
  const shown = useRef(new Set<string>()); // popups already shown this game
  const lastPop = useRef(0);

  function say(id: string, text: string, opts: PopOptions) {
    const now = performance.now();
    if (shown.current.has(id) || now - lastPop.current < POP_GAP_MS) return false;
    shown.current.add(id);
    lastPop.current = now;
    fx.pop(text, opts);
    return true;
  }

  function play(move: Move | null) {
    if (done || !move) return;
    const next = applyMove(board, size, move);
    if (!next) return;
    const all = moves + move;
    const gap = board.indexOf(0); // the moving tile lands where the gap was
    const v = next[gap];
    setBoard(next);
    setMoves(all);
    if (v === gap + 1) {
      setArrived({ v, id: all.length });
      vibrate(8);
    }
    if (isSolved(next)) {
      onFinish(all);
      return;
    }
    // Milestones, each shown once and never more than about one a second.
    const total = size * size - 1;
    const before = homeCount(board);
    const now = homeCount(next);
    const half = Math.ceil(total / 2);
    if (!rowDone(board, size, 0) && rowDone(next, size, 0) && say("row", "Top row done!", { tone: "good", emoji: "🧩" })) return;
    if (size >= 4 && !colDone(board, size, 0) && colDone(next, size, 0) && say("col", "Left column done!", { tone: "good", emoji: "🧱" })) return;
    if (before < half && now >= half && say("half", "Halfway there", { tone: "info", emoji: "🌗", sub: `${now} of ${total} tiles home` })) return;
    if (before < total - 2 && now >= total - 2 && say("almost", "Nearly there!", { tone: "great", emoji: "✨", sub: "Just a few tiles to go" }))
      fx.confetti(20);
  }

  function tap(index: number) {
    play(moveForTile(board, size, index));
  }

  // Keyboard: arrow keys slide a tile into the gap. Held keys don't repeat (a person taps).
  const playRef = useRef(play);
  const fxRef = useRef(fx);
  useEffect(() => {
    playRef.current = play;
    fxRef.current = fx;
  });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const m = KEY_MOVES[e.key];
      if (!m) return;
      e.preventDefault();
      if (!e.repeat) playRef.current(m);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Sprint stages: a warning ten seconds before the time runs out (cancelled once solved or given up).
  useEffect(() => {
    if (!seconds || seconds <= 10 || done) return;
    const t = window.setTimeout(
      () => {
        fxRef.current.pop("10 seconds left!", { tone: "warn", emoji: "⏰" });
        fxRef.current.shake();
      },
      (seconds - 10) * 1000,
    );
    return () => clearTimeout(t);
  }, [seconds, done]);

  const at = new Array<number>(size * size); // value -> cell
  board.forEach((v, i) => (at[v] = i));
  const home = homeCount(board);

  return (
    <div className="flex flex-col gap-3">
      <style>{`
        @keyframes slide-home { 0% { opacity: 0; transform: scale(.85) } 35% { opacity: 1; transform: scale(1.06) } 100% { opacity: 0; transform: scale(1.12) } }
        @media (prefers-reduced-motion: reduce) { .slide-anim { animation: none !important; transition: none !important } }
      `}</style>
      <div className="flex items-center justify-between text-sm text-white/70">
        <span>
          {moves.length} moves ·{" "}
          <span className="text-fuchsia-300">
            {home}/{size * size - 1} home
          </span>
        </span>
        <button
          type="button"
          className="underline"
          onClick={() => {
            setGaveUp(true);
            onFinish(moves);
          }}
          disabled={done}
        >
          Give up
        </button>
      </div>
      <div className="relative aspect-square rounded-2xl bg-gradient-to-br from-indigo-950 via-slate-900 to-fuchsia-950 p-1.5 shadow-[inset_0_2px_12px_rgba(0,0,0,0.6)] ring-1 ring-white/10 select-none">
        <div className="relative h-full w-full">
          {Array.from({ length: size * size - 1 }, (_, k) => k + 1).map((v) => {
            const i = at[v];
            const r = Math.floor(i / size);
            const c = i % size;
            const hue = hueOf(v, size);
            const isHome = i === v - 1;
            return (
              <button
                key={v}
                type="button"
                onClick={() => tap(i)}
                aria-label={`Tile ${v}${isHome ? ", in place" : ""}`}
                className="slide-anim absolute top-0 left-0 p-[3px] will-change-transform"
                style={{
                  width: `${100 / size}%`,
                  height: `${100 / size}%`,
                  transform: `translate(${c * 100}%, ${r * 100}%)`,
                  transition: `transform ${SLIDE_MS}ms cubic-bezier(0.45, 0, 0.25, 1)`,
                }}
              >
                <span
                  className={`relative flex h-full w-full items-center justify-center rounded-xl font-extrabold text-white transition-shadow duration-300 active:brightness-110 ${
                    size > 4 ? "text-lg sm:text-2xl" : "text-2xl sm:text-4xl"
                  }`}
                  style={{
                    background: `linear-gradient(145deg, hsl(${hue} 90% 66%), hsl(${hue + 25} 80% 44%))`,
                    textShadow: "0 1px 2px rgba(0,0,0,0.45)",
                    boxShadow: isHome
                      ? `inset 0 0 0 2px rgba(255,255,255,0.75), 0 0 14px hsl(${hue} 95% 62% / 0.75)`
                      : "inset 0 -3px 0 rgba(0,0,0,0.25), 0 2px 6px rgba(0,0,0,0.35)",
                  }}
                >
                  {v}
                  {arrived?.v === v && (
                    <span
                      key={arrived.id}
                      className="slide-anim pointer-events-none absolute inset-0 rounded-xl"
                      style={{
                        boxShadow: `0 0 0 3px #fff, 0 0 26px 6px hsl(${hue} 95% 65%)`,
                        animation: `slide-home 650ms ease-out ${SLIDE_MS - 30}ms both`,
                      }}
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
