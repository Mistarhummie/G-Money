"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { computerMove, gameStatus, inCheck, play, startPosition, toUci } from "@/lib/games/arcade/chessbot";
import type { GameComponentProps } from "@/lib/games/arcade/types";
import { CapturedTray, ChessBoard, KEYBOARD_HINT } from "./chessbot/ChessBoard";
import { useGameFx } from "./fx/GameFx";

export default function ChessGame({ seed, stage, onFinish }: GameComponentProps) {
  const [pos, setPos] = useState(startPosition);
  const [playerMoves, setPlayerMoves] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<number | null>(null);
  const [resigned, setResigned] = useState(false);
  const finished = useRef(false);
  const { fullscreen } = useGameFx();

  const status = useMemo(() => gameStatus(pos), [pos]);
  const yourTurn = !status.over && !resigned && pos.side === 1;

  // The computer replies after a short "thinking" pause, once the player's piece has landed.
  useEffect(() => {
    if (status.over || resigned || pos.side !== -1) return;
    const timer = setTimeout(() => {
      const m = computerMove(pos, seed, stage);
      setPos(play(pos, m));
      setLastMove(m);
    }, 650);
    return () => clearTimeout(timer);
  }, [pos, status.over, resigned, seed, stage]);

  // Report the game once it ends on the board.
  useEffect(() => {
    if (status.over && !finished.current) {
      finished.current = true;
      onFinish(playerMoves.join(" "));
    }
  }, [status.over, playerMoves, onFinish]);

  function move(m: number) {
    setPos(play(pos, m));
    setPlayerMoves((list) => [...list, toUci(m)]);
    setLastMove(m);
  }

  function resign() {
    if (finished.current) return;
    finished.current = true;
    setResigned(true);
    onFinish(playerMoves.join(" "));
  }

  const check = inCheck(pos);
  const statusText = status.over
    ? `${status.reason}${status.winner === 1 ? ": you win!" : status.winner === -1 ? ": the computer wins." : "."}`
    : resigned
      ? "You resigned."
      : yourTurn
        ? check
          ? "Check! Your move."
          : "Your move (White)."
        : "Computer is thinking…";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-sm text-white/70">
        <span>Move {playerMoves.length + (yourTurn ? 1 : 0)}</span>
        <button type="button" className="underline disabled:opacity-40" onClick={resign} disabled={status.over || resigned}>
          Resign
        </button>
      </div>
      <div className={`mx-auto flex w-full flex-col gap-2 ${fullscreen ? "max-w-[calc(100dvh-13rem)]" : ""}`}>
        <CapturedTray pos={pos} colour={1} />
        <ChessBoard pos={pos} canMove={yourTurn} lastMove={lastMove} onMove={move} you={1} />
        <CapturedTray pos={pos} colour={-1} />
      </div>
      <p
        className={`rounded-xl px-3 py-2 text-center text-sm ${
          check && !status.over
            ? "bg-gradient-to-r from-rose-500/25 to-amber-500/25 font-semibold text-amber-200"
            : yourTurn
              ? "bg-gradient-to-r from-emerald-500/15 to-sky-500/15 text-emerald-100"
              : "bg-white/5 text-white/80"
        } ${!yourTurn && !status.over && !resigned ? "animate-pulse" : ""}`}
      >
        {statusText}
      </p>
      <p className="hidden text-center text-xs text-white/40 sm:block">{KEYBOARD_HINT}</p>
    </div>
  );
}
