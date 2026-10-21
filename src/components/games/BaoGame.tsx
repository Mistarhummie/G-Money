"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { legalMoves, moveToString, replay, seedsOf, startsWithCapture, type Move } from "@/lib/games/arcade/bao";
import type { GameComponentProps } from "@/lib/games/arcade/types";

// Board rows top to bottom: computer outer, computer inner, your inner, your outer.
// Each cell maps a screen column (0..7, left to right as you see it) to [side, pit index k].
const ROWS: { side: 0 | 1; k: (c: number) => number }[] = [
  { side: 1, k: (c) => 8 + c },
  { side: 1, k: (c) => 7 - c },
  { side: 0, k: (c) => c },
  { side: 0, k: (c) => 15 - c },
];

/** Screen direction to sowing direction: on your inner row "right" is clockwise, on your outer row it is anticlockwise. */
const dirFor = (pit: number, screen: "left" | "right"): 1 | -1 => ((pit < 8) === (screen === "right") ? 1 : -1);

function Seeds({ n }: { n: number }) {
  const dots = Math.min(n, 12);
  return (
    <>
      <span className="pointer-events-none absolute inset-1 flex flex-wrap content-center items-center justify-center gap-[2px] opacity-60">
        {Array.from({ length: dots }, (_, i) => (
          <span key={i} className="h-1 w-1 rounded-full bg-amber-200" />
        ))}
      </span>
      <span className="relative text-sm font-bold text-white drop-shadow">{n || ""}</span>
    </>
  );
}

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
  const isLegalMove = (pit: number, dir: 1 | -1) => legal.some((m) => m.pit === pit && m.dir === dir);

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

  function play(pit: number, screen: "left" | "right") {
    const dir = dirFor(pit, screen);
    if (!myTurn || !isLegalMove(pit, dir)) return;
    setSelected(null);
    setMoves([...moves, { pit, dir }]);
    setThinking(true);
  }

  function giveUp() {
    if (finished.current) return;
    finished.current = true;
    onFinish(input);
  }

  // Keyboard: arrows sow the selected pit, Escape cancels.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (selected === null) return;
      if (e.key === "Escape") setSelected(null);
      else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const dir = dirFor(selected, e.key === "ArrowLeft" ? "left" : "right");
        if (!myTurn || !legal.some((m) => m.pit === selected && m.dir === dir)) return;
        setSelected(null);
        setMoves((ms) => [...ms, { pit: selected, dir }]);
        setThinking(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, myTurn, legal]);

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

      <div className="rounded-2xl border border-white/10 bg-[#3b2414]/60 p-1.5">
        {ROWS.map((row, r) => (
          <div key={r} className={`grid grid-cols-8 gap-1 ${r === 2 ? "mt-2 border-t border-white/10 pt-2" : r ? "mt-1" : ""}`}>
            {Array.from({ length: 8 }, (_, c) => {
              const k = row.k(c);
              const n = game.board[row.side * 16 + k];
              const mine = row.side === 0;
              const canPick = mine && legal.some((m) => m.pit === k);
              const isSel = mine && selected === k;
              const wasComputer = !mine && last && last.pit === k && !thinking;
              const wasMine = mine && lastMine && lastMine.pit === k;
              return (
                <button
                  key={c}
                  type="button"
                  disabled={!canPick}
                  onClick={() => setSelected(isSel ? null : k)}
                  aria-label={`${mine ? "Your" : "Computer"} pit, ${n} seeds`}
                  className={`relative flex aspect-square items-center justify-center rounded-full bg-black/45 shadow-inner transition ${
                    isSel
                      ? "ring-2 ring-emerald-400"
                      : canPick
                        ? "ring-1 ring-emerald-400/50 active:scale-95"
                        : wasComputer
                          ? "ring-2 ring-amber-400/80"
                          : wasMine
                            ? "ring-1 ring-white/30"
                            : ""
                  }`}
                >
                  <Seeds n={n} />
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-black/30 px-3 py-2 text-center text-sm">
        <div className="font-semibold text-white">{status}</div>
        {last && !thinking && (
          <div className="text-xs text-white/60">
            Computer played {moveToString(last)} from its side (amber ring)
            {lastMine ? ` · you played ${moveToString(lastMine)}` : ""}
          </div>
        )}
      </div>

      {selected !== null && myTurn && (
        <div className="grid grid-cols-2 gap-2">
          {(["left", "right"] as const).map((screen) => {
            const ok = isLegalMove(selected, dirFor(selected, screen));
            return (
              <button
                key={screen}
                type="button"
                disabled={!ok}
                onClick={() => play(selected, screen)}
                className="rounded-xl bg-emerald-500/90 py-3 text-lg font-bold text-emerald-950 transition active:scale-95 disabled:bg-white/5 disabled:text-white/30"
              >
                {screen === "left" ? "← Sow left" : "Sow right →"}
              </button>
            );
          })}
        </div>
      )}
      <p className="text-center text-xs text-white/50">Your rows are the bottom two. Pits with a green ring can be played.</p>
    </div>
  );
}
