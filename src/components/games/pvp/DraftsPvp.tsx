"use client";

import { useMemo, useState } from "react";
import { notation, pathOf, pvpStateOf, replayDrafts, type Move } from "@/lib/games/arcade/drafts";
import type { PvpBoardProps } from "@/lib/games/arcade/types";
import { DraftsBoard, SideDot } from "../drafts/DraftsBoard";

const NO_MOVES: Move[] = [];

/** Two-player drafts. Side 0 (green) moves first from the bottom; side 1 (amber) sees the board flipped. */
export default function DraftsPvp({ seed, moves, mySide, names, onMove, disabled }: PvpBoardProps) {
  // The move we just sent, shown while it is being sent (if the server rejects it, it disappears).
  const [pending, setPending] = useState<{ move: string; at: number } | null>(null);
  const shown = useMemo(
    () => (pending && disabled && pending.at === moves.length ? [...moves, pending.move] : moves),
    [moves, pending, disabled],
  );
  const game = useMemo(() => replayDrafts(seed, shown) ?? replayDrafts(seed, moves), [seed, shown, moves]);

  if (!game) return <div className="rounded-2xl bg-black/30 p-6 text-center text-white/70">This game could not be loaded.</div>;

  const state = pvpStateOf(game);
  const myTurn = mySide !== null && !state.over && state.turn === mySide && !disabled && shown === moves;
  const legal = myTurn ? game.moves : NO_MOVES;
  const lastText = game.history[game.history.length - 1];
  const last = lastText ? pathOf(lastText) : [];
  const mustCapture = !state.over && game.moves.length > 0 && game.moves[0].captures.length > 0;

  function send(m: Move) {
    if (!myTurn) return;
    const text = notation(m);
    setPending({ move: text, at: moves.length });
    onMove(text);
  }

  const name = (side: 0 | 1) => (mySide === side ? `${names[side]} (you)` : names[side]);
  const status = state.over
    ? state.winner === null
      ? state.detail ?? "Draw"
      : `${names[state.winner]} wins${state.detail ? ` · ${state.detail}` : ""}`
    : mySide === state.turn
      ? mustCapture
        ? "Your turn: you must capture"
        : "Your turn"
      : `${names[state.turn]} to move${mustCapture ? " (must capture)" : ""}`;
  const count = (v: number) => Array.from(game.board).filter((p) => p * v > 0).length;
  // The viewer's own side sits at the bottom; spectators see side 0 at the bottom.
  const top: 0 | 1 = mySide === 1 ? 0 : 1;
  const bottom: 0 | 1 = top === 0 ? 1 : 0;

  const nameRow = (side: 0 | 1) => (
    <div className={`flex items-center justify-between rounded-xl px-3 py-1.5 text-sm ${!state.over && state.turn === side ? "bg-white/10 text-white" : "text-white/60"}`}>
      <span className="flex items-center gap-2">
        <SideDot side={side} />
        {name(side)}
      </span>
      <span className="font-mono text-xs">{count(side === 0 ? 1 : -1)} pieces</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      {nameRow(top)}
      <DraftsBoard board={Array.from(game.board)} moves={legal} last={last} flipped={mySide === 1} onMove={send} />
      {nameRow(bottom)}
      <p className={`text-center text-sm ${state.over ? "font-semibold text-emerald-200" : mustCapture && myTurn ? "font-semibold text-emerald-300" : "text-white/70"}`}>
        {status}
      </p>
    </div>
  );
}
