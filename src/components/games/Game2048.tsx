"use client";

import { useEffect, useRef, useState } from "react";
import { canMove, maxTile, move, newGame, stageConfig, type Dir } from "@/lib/games/arcade/g2048";
import type { GameComponentProps } from "@/lib/games/arcade/types";

const KEYS: Record<string, Dir> = { ArrowUp: "U", ArrowDown: "D", ArrowLeft: "L", ArrowRight: "R", w: "U", s: "D", a: "L", d: "R" };

function tileClass(v: number): string {
  if (v <= 2) return "bg-white/80 text-emerald-950";
  if (v <= 4) return "bg-emerald-100 text-emerald-950";
  if (v <= 8) return "bg-amber-300 text-amber-950";
  if (v <= 16) return "bg-orange-400 text-orange-950";
  if (v <= 32) return "bg-orange-500 text-white";
  if (v <= 64) return "bg-red-500 text-white";
  if (v <= 256) return "bg-yellow-400 text-yellow-950";
  if (v <= 1024) return "bg-emerald-400 text-emerald-950";
  return "bg-emerald-600 text-white";
}

export default function Game2048({ seed, stage, onFinish }: GameComponentProps) {
  const { target } = stageConfig(stage);
  const [game, setGame] = useState(() => ({ state: newGame(seed), moves: "" }));
  const [done, setDone] = useState(false);
  // The latest game, updated at once so two quick key presses never play from a stale board.
  const live = useRef(game);
  const ended = useRef(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const { state, moves } = game;
  const reached = maxTile(state.board) >= target;
  const stuck = !canMove(state.board);

  function finish() {
    if (ended.current) return;
    ended.current = true;
    setDone(true);
    onFinish(live.current.moves);
  }

  function play(dir: Dir) {
    if (ended.current) return;
    // Moves that change nothing are not sent.
    const next = move(seed, live.current.state, dir);
    if (!next) return;
    live.current = { state: next, moves: live.current.moves + dir };
    setGame(live.current);
    if (!canMove(next.board)) finish();
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const dir = KEYS[e.key];
      if (!dir) return;
      e.preventDefault();
      play(dir);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function onTouchEnd(e: React.TouchEvent) {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const p = e.changedTouches[0];
    const dx = p.clientX - start.x;
    const dy = p.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    play(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "R" : "L") : dy > 0 ? "D" : "U");
  }

  return (
    <div className="flex flex-col gap-3 select-none">
      <div className="flex items-center justify-between text-sm text-white/70">
        <span>
          {state.score.toLocaleString()} pts · {moves.length} moves
        </span>
        <button
          type="button"
          className={reached ? "rounded-full bg-emerald-500 px-3 py-1 font-semibold text-emerald-950" : "underline"}
          onClick={finish}
          disabled={done}
        >
          {reached ? "Finish" : "Give up"}
        </button>
      </div>

      <div
        className="relative grid aspect-square grid-cols-4 gap-2 rounded-2xl border border-white/10 bg-black/30 p-2"
        style={{ touchAction: "none" }}
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={onTouchEnd}
      >
        {state.board.map((v, i) => (
          <div
            key={i}
            className={`flex items-center justify-center rounded-xl font-bold transition-colors ${v ? tileClass(v) : "bg-white/5"} ${
              v >= 1024 ? "text-xl" : v >= 128 ? "text-2xl" : "text-3xl"
            }`}
          >
            {v || ""}
          </div>
        ))}
        {stuck && (
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50 text-2xl font-bold text-white">No moves left</div>
        )}
      </div>

      <p className="text-center text-xs text-white/50">
        {reached ? `You made ${target}! Keep going for more points, or press Finish.` : `Swipe or use the arrow keys. Make a ${target} tile.`}
      </p>
    </div>
  );
}
