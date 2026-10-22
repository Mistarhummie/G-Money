"use client";

import { useMemo, useState } from "react";
import { canPlay, pvpStateOf, replayConnect4 } from "@/lib/games/arcade/connect4";
import type { PvpBoardProps } from "@/lib/games/arcade/types";
import { Connect4Board, DiscFace, useConnect4Moments, viewOf } from "../connect4/Connect4Board";

/** Two-player Connect Four. Side 0 (green) drops first, side 1 is amber. */
export default function Connect4Pvp({ seed, moves, mySide, names, onMove, disabled }: PvpBoardProps) {
  // The move we just sent, shown while it is being sent (if the server rejects it, it disappears).
  const [pending, setPending] = useState<{ move: string; at: number } | null>(null);
  const shown = useMemo(
    () => (pending && disabled && pending.at === moves.length ? [...moves, pending.move] : moves),
    [moves, pending, disabled],
  );
  const game = useMemo(() => replayConnect4(seed, shown) ?? replayConnect4(seed, moves), [seed, shown, moves]);
  const view = useMemo(() => game && viewOf(game), [game]);
  useConnect4Moments(view, mySide === null ? null : mySide === 0 ? 1 : 2);

  if (!game || !view) return <div className="rounded-2xl bg-black/30 p-6 text-center text-white/70">This game could not be loaded.</div>;

  const state = pvpStateOf(game);
  const myTurn = mySide !== null && !state.over && state.turn === mySide && !disabled && shown === moves;

  function drop(col: number) {
    if (!myTurn || !game || !canPlay(game, col)) return;
    const text = String(col);
    setPending({ move: text, at: moves.length });
    onMove(text);
  }

  const name = (side: 0 | 1) => (mySide === side ? `${names[side]} (you)` : names[side]);
  const status = state.over
    ? state.winner === null
      ? state.detail ?? "Draw"
      : `${names[state.winner]} wins${state.detail ? ` · ${state.detail}` : ""}`
    : mySide === state.turn
      ? "Your turn: tap a column"
      : `${names[state.turn]} to move`;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 text-sm">
        {([0, 1] as const).map((side) => (
          <div
            key={side}
            className={`flex items-center gap-2 truncate rounded-xl px-3 py-1.5 transition-colors duration-300 ${
              !state.over && state.turn === side
                ? side === 0
                  ? "bg-emerald-400/15 text-white ring-1 ring-emerald-300/40"
                  : "bg-amber-400/15 text-white ring-1 ring-amber-300/40"
                : "text-white/60"
            }`}
          >
            <span className="relative inline-block h-4 w-4 shrink-0">
              <DiscFace v={side === 0 ? 1 : 2} full />
            </span>
            <span className="truncate">{name(side)}</span>
          </div>
        ))}
      </div>
      <Connect4Board view={view} canDrop={myTurn} onDrop={drop} />
      <p className={`text-center text-sm ${state.over ? "font-semibold text-emerald-200" : "text-white/70"}`}>{status}</p>
    </div>
  );
}
