"use client";

import { useEffect, useRef, useState } from "react";
import { canPlay, computerMove, newGame, play } from "@/lib/games/arcade/connect4";
import type { GameComponentProps } from "@/lib/games/arcade/types";
import { Connect4Board, DiscFace, landingMs, useConnect4Moments, viewOf } from "./connect4/Connect4Board";
import { vibrate } from "./fx/motion";

/** How long the computer "thinks" (after your disc lands) and then hovers over its column before dropping. */
const THINK_MS = 250;
const HOVER_MS = 320;

export default function Connect4Game({ seed, stage, onFinish }: GameComponentProps) {
  // The game object is mutable and only touched in event handlers; `view` drives rendering.
  const [game] = useState(() => newGame(seed, stage));
  const [view, setView] = useState(() => viewOf(game));
  const [input, setInput] = useState("");
  // The column the computer's disc hovers over just before it drops.
  const [ghost, setGhost] = useState<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const finished = useRef(false);

  useConnect4Moments(view, 1);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const later = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));

  function finish(all: string, delay = 0) {
    if (finished.current) return;
    finished.current = true;
    // Let the last disc land before the result shows.
    if (delay) later(delay, () => onFinish(all));
    else onFinish(all);
  }

  function drop(col: number) {
    if (game.turn !== 1 || !canPlay(game, col) || finished.current) return;
    play(game, col);
    const row = game.heights[col] - 1;
    const all = input + col;
    setInput(all);
    setView(viewOf(game));
    vibrate(10);
    if (game.result) return finish(all, landingMs(row) + 250);
    later(landingMs(row) + THINK_MS, () => {
      const reply = computerMove(game);
      setGhost(reply);
      later(HOVER_MS, () => {
        play(game, reply);
        setGhost(null);
        setView(viewOf(game));
        if (game.result) finish(all, landingMs(game.heights[reply] - 1) + 250);
      });
    });
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
      <div className="flex items-center justify-between text-sm text-white/80">
        <span className="flex items-center gap-2">
          <span className="relative inline-block h-5 w-5 shrink-0">
            <DiscFace v={view.result ? (view.result === 2 ? 2 : 1) : view.turn} full />
          </span>
          <span className={view.turn === 2 && !view.result ? "animate-pulse" : ""}>{status}</span>
        </span>
        <button type="button" className="underline disabled:opacity-40" onClick={() => finish(input)} disabled={!!view.result}>
          Give up
        </button>
      </div>
      <Connect4Board view={view} canDrop={view.turn === 1 && !view.result} onDrop={drop} ghost={ghost} />
      <p className="text-center text-xs text-white/50">You are green and drop first. Keys 1-7 or ← → and Enter also work.</p>
    </div>
  );
}
