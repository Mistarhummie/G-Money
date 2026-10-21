"use client";

import { useMemo, useState } from "react";
import { applyMove, boardFromSeed, isSolved, moveForTile, stageConfig } from "@/lib/games/arcade/slide";
import type { GameComponentProps } from "@/lib/games/arcade/types";

export default function SlideGame({ seed, stage, onFinish }: GameComponentProps) {
  const { size } = stageConfig(stage);
  const start = useMemo(() => boardFromSeed(seed, size), [seed, size]);
  const [board, setBoard] = useState(start);
  const [moves, setMoves] = useState("");
  const done = isSolved(board);

  function tap(index: number) {
    if (done) return;
    const move = moveForTile(board, size, index);
    if (!move) return;
    const next = applyMove(board, size, move)!;
    const all = moves + move;
    setBoard(next);
    setMoves(all);
    if (isSolved(next)) onFinish(all);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between text-sm text-white/70">
        <span>{moves.length} moves</span>
        <button type="button" className="underline" onClick={() => onFinish(moves)} disabled={done}>
          Give up
        </button>
      </div>
      <div className="grid aspect-square gap-1.5 rounded-2xl bg-black/30 p-1.5 select-none" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>
        {board.map((v, i) =>
          v === 0 ? (
            <div key={i} />
          ) : (
            <button
              key={i}
              type="button"
              onClick={() => tap(i)}
              className={`rounded-xl bg-emerald-500/90 font-bold text-emerald-950 transition active:scale-95 ${size > 4 ? "text-lg" : "text-2xl"}`}
            >
              {v}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
