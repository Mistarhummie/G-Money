"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BaoBoard, choiceHint, phaseText, type Sowing } from "@/components/games/bao/BaoBoard";
import { legalMoves, moveToString, replay, seedsOf, type Move } from "@/lib/games/arcade/bao";
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
  const [mineSow, setMineSow] = useState<Sowing | null>(null);
  const finished = useRef(false);

  // The whole game is replayed from the moves (cheap), exactly as the server does. Until the computer's
  // turn comes, its reply to the last move is left out.
  const awaiting = phase === "mine" || phase === "thinking";
  const game = useMemo(() => replay(seed, stage, moves, awaiting)!, [seed, stage, moves, awaiting]);
  const input = moves.map(moveToString).join(" ");
  const myTurn = !game.result && phase === "idle";
  const legal = useMemo(() => (myTurn ? legalMoves(game.state) : []), [game, myTurn]);

  const theirMove = game.lastComputerMove;
  const sowing = useMemo<Sowing | null>(() => {
    if (phase === "mine") return mineSow;
    if (phase === "theirs" && game.beforeComputer && theirMove) return { id: `c${moves.length}`, from: game.beforeComputer, move: theirMove };
    return null;
  }, [phase, mineSow, game, theirMove, moves.length]);

  // The computer replies after a short pause once your sowing has finished.
  useEffect(() => {
    if (phase !== "thinking") return;
    const t = setTimeout(() => setPhase("theirs"), 450);
    return () => clearTimeout(t);
  }, [phase]);

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

  function play(m: Move) {
    if (!myTurn) return;
    setMineSow({ id: `p${moves.length + 1}`, from: game.state, move: m });
    setMoves((ms) => [...ms, m]);
    setPhase("mine");
  }

  function giveUp() {
    if (finished.current) return;
    finished.current = true;
    onFinish(input);
  }

  // Seed totals (pits + store) glide to their new values once a sowing has played out.
  const counted = sowing ? sowing.from : game.state;
  const mine = Math.round(useTweened(seedsOf(counted, 0), 700));
  const theirs = Math.round(useTweened(seedsOf(counted, 1), 700));

  const last = phase === "idle" ? theirMove : null;
  const lastMine = moves[moves.length - 1];
  const status =
    game.result && phase === "idle"
      ? game.result === "win"
        ? `You win! ${game.detail === "Front row emptied" ? "The computer's front row is empty" : "The computer has no move"}`
        : game.result === "draw"
          ? "Draw after 200 moves"
          : `The computer wins: ${game.detail === "Front row emptied" ? "your front row is empty" : "you have no move"}`
      : phase === "mine"
        ? "Sowing…"
        : phase === "thinking"
          ? "Computer is thinking…"
          : phase === "theirs"
            ? "Computer is sowing…"
            : choiceHint(game.state, legal);

  return (
    <div className="flex flex-col gap-3 select-none">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex flex-wrap items-center gap-2 font-semibold">
          <span className="rounded-full bg-gradient-to-r from-emerald-400/25 to-teal-500/25 px-2.5 py-0.5 text-emerald-200 ring-1 ring-emerald-300/30">
            You {mine}
          </span>
          <span className="rounded-full bg-gradient-to-r from-amber-400/25 to-orange-500/25 px-2.5 py-0.5 text-amber-200 ring-1 ring-amber-300/30">
            Computer {theirs}
          </span>
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white/75">{phaseText(counted, 0)}</span>
        </span>
        <button type="button" className="text-white/70 underline disabled:opacity-40" onClick={giveUp} disabled={!!game.result}>
          Give up
        </button>
      </div>

      <BaoBoard
        state={game.state}
        me={0}
        legal={legal}
        onMove={play}
        theirLast={last ? last.pit : null}
        myLast={lastMine?.pit ?? null}
        sowing={sowing}
        onSowDone={sowDone}
      />

      <div className="rounded-xl bg-black/30 px-3 py-2 text-center text-sm">
        <div className={`font-semibold ${phase === "thinking" || phase === "theirs" ? "animate-pulse text-amber-200" : "text-white"}`}>{status}</div>
        {last && (
          <div className="text-xs text-white/60">
            Computer played {moveToString(last)} (its own view, amber ring)
            {lastMine ? ` · you played ${moveToString(lastMine)}` : ""}
          </div>
        )}
      </div>
      <p className="text-center text-xs text-white/50">
        Your rows are the bottom two; your store is bottom left. Green rings can be played. Keys: 1-8 pick a front pit, ← → choose. Tap the board to skip a sowing.
      </p>
    </div>
  );
}
