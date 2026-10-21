"use client";

import { useMemo, useState } from "react";
import { inCheck, pvpState, replayPvp, toUci } from "@/lib/games/arcade/chessbot";
import type { PvpBoardProps } from "@/lib/games/arcade/types";
import { CapturedTray, ChessBoard, KEYBOARD_HINT } from "../chessbot/ChessBoard";

/** Two-player chess. Side 0 is White. The board is turned so the viewer's pieces are at the bottom. */
export default function ChessbotPvp({ moves, mySide, names, onMove, disabled }: PvpBoardProps) {
  // My move, shown while it is being sent and until the server's move list includes it.
  // If the send fails (`disabled` clears with no new move), it disappears again.
  const [pending, setPending] = useState<{ base: number; uci: string } | null>(null);
  const shown = useMemo(() => (pending && disabled && pending.base === moves.length ? [...moves, pending.uci] : moves), [moves, pending, disabled]);
  const game = useMemo(() => replayPvp(shown) ?? replayPvp(moves), [shown, moves]);

  if (!game) return <div className="rounded-2xl bg-black/30 p-6 text-center text-white/70">This game could not be loaded.</div>;

  const state = pvpState(game);
  const myTurn = mySide !== null && !disabled && !state.over && state.turn === mySide && shown === moves;
  const flipped = mySide === 1;
  const check = inCheck(game.pos);

  function move(m: number) {
    if (!myTurn) return;
    const uci = toUci(m);
    setPending({ base: moves.length, uci });
    onMove(uci);
  }

  const label = (side: 0 | 1) => (
    <div className={`flex items-center justify-between rounded-lg px-2 py-1 text-sm ${!state.over && state.turn === side ? "bg-emerald-500/20 text-emerald-200" : "text-white/70"}`}>
      <span className="truncate">
        {side === 0 ? "♔︎" : "♚︎"} {names[side]}
        {mySide === side ? " (you)" : ""}
      </span>
      {!state.over && state.turn === side && <span className="text-xs">to move</span>}
    </div>
  );

  const top: 0 | 1 = flipped ? 0 : 1;
  const bottom: 0 | 1 = flipped ? 1 : 0;
  const colour = (side: 0 | 1) => (side === 0 ? 1 : -1);

  const statusText = state.over
    ? `${state.detail}${state.winner === null ? "." : `: ${names[state.winner]} wins${mySide === state.winner ? " (you)" : ""}.`}`
    : mySide === null
      ? `${names[state.turn]} to move${check ? " (check)" : ""}.`
      : state.turn === mySide
        ? check
          ? "Check! Your move."
          : "Your move."
        : `Waiting for ${names[state.turn]}…`;

  return (
    <div className="flex flex-col gap-2">
      {label(top)}
      <CapturedTray pos={game.pos} colour={colour(bottom) as 1 | -1} />
      <ChessBoard pos={game.pos} canMove={myTurn} flipped={flipped} lastMove={game.lastMove} onMove={move} />
      <CapturedTray pos={game.pos} colour={colour(top) as 1 | -1} />
      {label(bottom)}
      <p className={`rounded-xl bg-white/5 px-3 py-2 text-center text-sm ${check && !state.over ? "text-amber-300" : "text-white/80"}`}>
        {statusText}
      </p>
      {mySide !== null && <p className="hidden text-center text-xs text-white/40 sm:block">{KEYBOARD_HINT}</p>}
    </div>
  );
}
