"use client";

import { useEffect, useRef, useState } from "react";
import { canPlay, computerMove, newGame, play } from "@/lib/games/arcade/connect4";
import type { GameComponentProps } from "@/lib/games/arcade/types";
import { Connect4Board, viewOf } from "./connect4/Connect4Board";

export default function Connect4Game({ seed, stage, onFinish }: GameComponentProps) {
  // The game object is mutable and only touched in event handlers; `view` drives rendering.
  const [game] = useState(() => newGame(seed, stage));
  const [view, setView] = useState(() => viewOf(game));
  const [input, setInput] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finished = useRef(false);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function finish(all: string) {
    if (finished.current) return;
    finished.current = true;
    onFinish(all);
  }

  function drop(col: number) {
    if (game.turn !== 1 || !canPlay(game, col) || finished.current) return;
    play(game, col);
    const all = input + col;
    setInput(all);
    setView(viewOf(game));
    if (game.result) return finish(all);
    timer.current = setTimeout(() => {
      play(game, computerMove(game));
      setView(viewOf(game));
      if (game.result) finish(all);
    }, 300);
  }

  const status =
    view.result === 1
      ? "You win!"
      : view.result === 2
        ? "The computer wins"
        : view.result === 3
          ? "Draw: the board is full"
          : view.turn === 1
            ? "Your turn: tap a column"
            : "Computer is thinking…";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-sm text-white/70">
        <span className="flex items-center gap-2">
          <span className={`inline-block h-3 w-3 rounded-full ${view.turn === 1 && !view.result ? "bg-emerald-400" : "bg-amber-400"}`} />
          {status}
        </span>
        <button type="button" className="underline disabled:opacity-40" onClick={() => finish(input)} disabled={!!view.result}>
          Give up
        </button>
      </div>
      <Connect4Board view={view} canDrop={view.turn === 1 && !view.result} onDrop={drop} />
      <p className="text-center text-xs text-white/50">You are green and drop first. Keys 1-7 or ← → and Enter also work.</p>
    </div>
  );
}
