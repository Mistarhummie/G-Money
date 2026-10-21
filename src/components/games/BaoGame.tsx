"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BaoBoard, DirectionPicker, arrowKeyHandler } from "@/components/games/bao/BaoBoard";
import { legalMoves, moveToString, replay, seedsOf, startsWithCapture, type Move } from "@/lib/games/arcade/bao";
import type { GameComponentProps } from "@/lib/games/arcade/types";

export default function BaoGame({ seed, stage, onFinish }: GameComponentProps) {
  const [moves, setMoves] = useState<Move[]>([]);
  const [thinking, setThinking] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const finished = useRef(false);

  // The whole game is replayed from the moves (cheap), exactly as the server does.
  const game = useMemo(() => replay(seed, stage, moves, thinking)!, [seed, stage, moves, thinking]);
  const input = moves.map(moveToString).join(" ");
  const myTurn = !game.result && !thinking;
  const legal = useMemo(() => (myTurn ? legalMoves(game.board, 0) : []), [game, myTurn]);
  const mustCapture = legal.length > 0 && startsWithCapture(game.board, 0, legal[0]);

  // The computer replies after a short pause.
  useEffect(() => {
    if (!thinking) return;
    const t = setTimeout(() => setThinking(false), 350);
    return () => clearTimeout(t);
  }, [thinking]);

  useEffect(() => {
    if (game.result && !thinking && !finished.current) {
      finished.current = true;
      onFinish(input);
    }
  }, [game.result, thinking, input, onFinish]);

  function play(pit: number, dir: 1 | -1) {
    if (!myTurn || !legal.some((m) => m.pit === pit && m.dir === dir)) return;
    setSelected(null);
    setMoves((ms) => [...ms, { pit, dir }]);
    setThinking(true);
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

  const last = game.lastComputerMove;
  const lastMine = moves[moves.length - 1];
  const status = game.result
    ? game.result === "win"
      ? "You win!"
      : game.result === "draw"
        ? "Draw"
        : "The computer wins"
    : thinking
      ? "Computer is thinking…"
      : selected !== null
        ? "Pick a direction"
        : mustCapture
          ? "Your turn: you must capture"
          : "Your turn: tap one of your pits";

  return (
    <div className="flex flex-col gap-3 select-none">
      <div className="flex justify-between text-sm text-white/70">
        <span>
          You {seedsOf(game.board, 0)} · Computer {seedsOf(game.board, 1)}
        </span>
        <button type="button" className="underline disabled:opacity-40" onClick={giveUp} disabled={!!game.result}>
          Give up
        </button>
      </div>

      <BaoBoard
        board={game.board}
        me={0}
        legal={legal}
        selected={selected}
        onSelect={setSelected}
        theirLast={last && !thinking ? last.pit : null}
        myLast={lastMine?.pit ?? null}
      />

      <div className="rounded-xl bg-black/30 px-3 py-2 text-center text-sm">
        <div className="font-semibold text-white">{status}</div>
        {last && !thinking && (
          <div className="text-xs text-white/60">
            Computer played {moveToString(last)} from its side (amber ring)
            {lastMine ? ` · you played ${moveToString(lastMine)}` : ""}
          </div>
        )}
      </div>

      {selected !== null && myTurn && <DirectionPicker pit={selected} legal={legal} onPick={(dir) => play(selected, dir)} />}
      <p className="text-center text-xs text-white/50">Your rows are the bottom two. Pits with a green ring can be played.</p>
    </div>
  );
}
