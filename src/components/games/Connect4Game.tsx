"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { canPlay, cellAt, COLS, computerMove, newGame, play, ROWS, winningLine, type C4State } from "@/lib/games/arcade/connect4";
import type { GameComponentProps } from "@/lib/games/arcade/types";

/** What the board shows; rebuilt from the game after every move. */
type View = {
  cells: number[][]; // [col][row], row 0 at the bottom
  result: C4State["result"];
  turn: 1 | 2;
  last: [number, number] | null;
  win: string[];
};

function viewOf(g: C4State): View {
  const cells = Array.from({ length: COLS }, (_, c) => Array.from({ length: ROWS }, (_, r) => cellAt(g, c, r)));
  const lastCol = g.history[g.history.length - 1];
  return {
    cells,
    result: g.result,
    turn: g.turn,
    last: lastCol === undefined ? null : [lastCol, g.heights[lastCol] - 1],
    win: (winningLine(g) ?? []).map(([c, r]) => `${c},${r}`),
  };
}

export default function Connect4Game({ seed, stage, onFinish }: GameComponentProps) {
  // The game object is mutable and only touched in event handlers; `view` drives rendering.
  const [game] = useState(() => newGame(seed, stage));
  const [view, setView] = useState(() => viewOf(game));
  const [input, setInput] = useState("");
  const [cursor, setCursor] = useState(3);
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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key >= "1" && e.key <= "7") drop(Number(e.key) - 1);
      else if (e.key === "ArrowLeft") setCursor((c) => Math.max(0, c - 1));
      else if (e.key === "ArrowRight") setCursor((c) => Math.min(COLS - 1, c + 1));
      else if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") drop(cursor);
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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
      <style>{`@keyframes c4drop { from { transform: translateY(var(--c4-from)); } to { transform: translateY(0); } }`}</style>
      <div className="flex items-center justify-between text-sm text-white/70">
        <span className="flex items-center gap-2">
          <span className={`inline-block h-3 w-3 rounded-full ${view.turn === 1 && !view.result ? "bg-emerald-400" : "bg-amber-400"}`} />
          {status}
        </span>
        <button type="button" className="underline disabled:opacity-40" onClick={() => finish(input)} disabled={!!view.result}>
          Give up
        </button>
      </div>
      <div className="grid select-none gap-1 overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-1.5" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
        {view.cells.map((col, c) => (
          <button
            key={c}
            type="button"
            aria-label={`Drop in column ${c + 1}`}
            onClick={() => drop(c)}
            onMouseEnter={() => setCursor(c)}
            disabled={view.turn !== 1 || !!view.result || col[ROWS - 1] !== 0}
            className={`flex flex-col-reverse gap-1 rounded-xl p-0.5 transition ${cursor === c && view.turn === 1 && !view.result ? "bg-white/10" : "bg-white/5"}`}
          >
            {col.map((v, r) => {
              const isLast = view.last?.[0] === c && view.last?.[1] === r;
              const winning = view.win.includes(`${c},${r}`);
              return (
                <span key={r} className="relative block aspect-square w-full rounded-full bg-black/40">
                  {v !== 0 && (
                    <span
                      className={`absolute inset-0 rounded-full ${v === 1 ? "bg-emerald-400" : "bg-amber-400"} ${
                        winning ? "ring-4 ring-white" : view.win.length ? "opacity-50" : ""
                      }`}
                      style={
                        isLast
                          ? ({ "--c4-from": `${-(ROWS - r) * 115}%`, animation: "c4drop 0.25s ease-in" } as CSSProperties)
                          : undefined
                      }
                    />
                  )}
                </span>
              );
            })}
          </button>
        ))}
      </div>
      <p className="text-center text-xs text-white/50">You are green and drop first. Keys 1-7 or ← → and Enter also work.</p>
    </div>
  );
}
