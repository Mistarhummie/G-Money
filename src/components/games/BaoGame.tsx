"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BaoBoard, DirectionPicker, arrowKeyHandler, type Sowing } from "@/components/games/bao/BaoBoard";
import { legalMoves, moveToString, replay, seedsOf, startsWithCapture, type Board, type Move } from "@/lib/games/arcade/bao";
import type { GameComponentProps } from "@/lib/games/arcade/types";
import { useTweened } from "./fx/motion";

/**
 * idle: your turn (or the game is over) · mine: your move is being sown · thinking: the computer's
 * short pause · theirs: the computer's reply is being sown.
 */
type Phase = "idle" | "mine" | "thinking" | "theirs";

export default function BaoGame({ seed, stage, onFinish }: GameComponentProps) {
  const [moves, setMoves] = useState<Move[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [selected, setSelected] = useState<number | null>(null);
  const [mineSow, setMineSow] = useState<Sowing | null>(null);
  const [theirFrom, setTheirFrom] = useState<Board | null>(null);
  const finished = useRef(false);

  // The whole game is replayed from the moves (cheap), exactly as the server does. Until the computer's
  // turn comes, its reply to the last move is left out.
  const awaiting = phase === "mine" || phase === "thinking";
  const game = useMemo(() => replay(seed, stage, moves, awaiting)!, [seed, stage, moves, awaiting]);
  const input = moves.map(moveToString).join(" ");
  const myTurn = !game.result && phase === "idle";
  const legal = useMemo(() => (myTurn ? legalMoves(game.board, 0) : []), [game, myTurn]);
  const mustCapture = legal.length > 0 && startsWithCapture(game.board, 0, legal[0]);

  const theirMove = game.lastComputerMove;
  const sowing = useMemo<Sowing | null>(() => {
    if (phase === "mine") return mineSow;
    if (phase === "theirs" && theirFrom && theirMove) return { id: `c${moves.length}`, from: theirFrom, side: 1, move: theirMove };
    return null;
  }, [phase, mineSow, theirFrom, theirMove, moves.length]);

  // The computer replies after a short pause once your sowing has finished.
  useEffect(() => {
    if (phase !== "thinking") return;
    const t = setTimeout(() => {
      setTheirFrom(game.board);
      setPhase("theirs");
    }, 450);
    return () => clearTimeout(t);
  }, [phase, game]);

  useEffect(() => {
    if (game.result && phase === "idle" && !finished.current) {
      finished.current = true;
      onFinish(input);
    }
  }, [game.result, phase, input, onFinish]);

  function sowDone(id: string) {
    if (id.startsWith("p")) setPhase((p) => (p === "mine" ? (game.result ? "idle" : "thinking") : p));
    else setPhase((p) => (p === "theirs" ? "idle" : p));
  }

  function play(pit: number, dir: 1 | -1) {
    if (!myTurn || !legal.some((m) => m.pit === pit && m.dir === dir)) return;
    setSelected(null);
    setMineSow({ id: `p${moves.length + 1}`, from: game.board, side: 0, move: { pit, dir } });
    setMoves((ms) => [...ms, { pit, dir }]);
    setPhase("mine");
  }

  function giveUp() {
    if (finished.current) return;
    finished.current = true;
    onFinish(input);
  }

  // Keyboard: arrows sow the selected pit, Escape cancels.
  const playRef = useRef(play);
  useEffect(() => {
    playRef.current = play;
  });
  useEffect(() => {
    const onKey = arrowKeyHandler(selected, legal, setSelected, (pit, dir) => playRef.current(pit, dir));
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, legal]);

  // Seed totals glide to their new values once a sowing has played out.
  const counted = phase === "mine" && mineSow ? mineSow.from : phase === "theirs" && theirFrom ? theirFrom : game.board;
  const mine = Math.round(useTweened(seedsOf(counted, 0), 700));
  const theirs = Math.round(useTweened(seedsOf(counted, 1), 700));

  const last = phase === "idle" ? theirMove : null;
  const lastMine = moves[moves.length - 1];
  const status = game.result && phase === "idle"
    ? game.result === "win"
      ? "You win!"
      : game.result === "draw"
        ? "Draw"
        : "The computer wins"
    : phase === "mine"
      ? "Sowing…"
      : phase === "thinking"
        ? "Computer is thinking…"
        : phase === "theirs"
          ? "Computer is sowing…"
          : selected !== null
            ? "Pick a direction"
            : mustCapture
              ? "Your turn: you must capture"
              : "Your turn: tap one of your pits";

  return (
    <div className="flex flex-col gap-3 select-none">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-2 font-semibold">
          <span className="rounded-full bg-gradient-to-r from-emerald-400/25 to-teal-500/25 px-2.5 py-0.5 text-emerald-200 ring-1 ring-emerald-300/30">
            You {mine}
          </span>
          <span className="rounded-full bg-gradient-to-r from-amber-400/25 to-orange-500/25 px-2.5 py-0.5 text-amber-200 ring-1 ring-amber-300/30">
            Computer {theirs}
          </span>
        </span>
        <button type="button" className="text-white/70 underline disabled:opacity-40" onClick={giveUp} disabled={!!game.result}>
          Give up
        </button>
      </div>

      <BaoBoard
        board={game.board}
        me={0}
        legal={legal}
        selected={selected}
        onSelect={setSelected}
        theirLast={last ? last.pit : null}
        myLast={lastMine?.pit ?? null}
        sowing={sowing}
        onSowDone={sowDone}
      />

      <div className="rounded-xl bg-black/30 px-3 py-2 text-center text-sm">
        <div className={`font-semibold ${phase === "thinking" || phase === "theirs" ? "animate-pulse text-amber-200" : "text-white"}`}>{status}</div>
        {last && (
          <div className="text-xs text-white/60">
            Computer played {moveToString(last)} from its side (amber ring)
            {lastMine ? ` · you played ${moveToString(lastMine)}` : ""}
          </div>
        )}
      </div>

      {selected !== null && myTurn && <DirectionPicker pit={selected} legal={legal} onPick={(dir) => play(selected, dir)} />}
      <p className="text-center text-xs text-white/50">Your rows are the bottom two. Pits with a green ring can be played. Tap the board to skip a sowing.</p>
    </div>
  );
}
