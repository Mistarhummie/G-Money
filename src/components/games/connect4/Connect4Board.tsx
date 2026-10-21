"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { cellAt, COLS, ROWS, winningLine, type C4State } from "@/lib/games/arcade/connect4";

/** What the board shows; rebuilt from the game after every move. */
export type C4View = {
  cells: number[][]; // [col][row], row 0 at the bottom; 1 = side 0 (green), 2 = side 1 (amber)
  result: C4State["result"];
  turn: 1 | 2;
  last: [number, number] | null;
  win: string[];
};

export function viewOf(g: C4State): C4View {
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

/**
 * The Connect Four board, shared by the vs-computer and two-player games. The newest disc drops in
 * with a short animation and the winning four are ringed.
 */
export function Connect4Board({ view, canDrop, onDrop }: { view: C4View; canDrop: boolean; onDrop: (col: number) => void }) {
  const [cursor, setCursor] = useState(3);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!canDrop) return;
      if (e.key >= "1" && e.key <= "7") onDrop(Number(e.key) - 1);
      else if (e.key === "ArrowLeft") setCursor((c) => Math.max(0, c - 1));
      else if (e.key === "ArrowRight") setCursor((c) => Math.min(COLS - 1, c + 1));
      else if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") onDrop(cursor);
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="grid select-none gap-1 overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-1.5" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
      <style>{`@keyframes c4drop { from { transform: translateY(var(--c4-from)); } to { transform: translateY(0); } }`}</style>
      {view.cells.map((col, c) => (
        <button
          key={c}
          type="button"
          aria-label={`Drop in column ${c + 1}`}
          onClick={() => onDrop(c)}
          onMouseEnter={() => setCursor(c)}
          disabled={!canDrop || col[ROWS - 1] !== 0}
          className={`flex flex-col-reverse gap-1 rounded-xl p-0.5 transition ${cursor === c && canDrop ? "bg-white/10" : "bg-white/5"}`}
        >
          {col.map((v, r) => {
            const isLast = view.last?.[0] === c && view.last?.[1] === r;
            const winning = view.win.includes(`${c},${r}`);
            return (
              <span key={r} className="relative block aspect-square w-full rounded-full bg-black/40">
                {v !== 0 && (
                  <span
                    className={`absolute inset-0 rounded-full ${v === 1 ? "bg-emerald-400" : "bg-amber-400"} ${
                      winning ? "ring-4 ring-white" : view.win.length ? "opacity-50" : isLast ? "ring-2 ring-white/50" : ""
                    }`}
                    style={isLast ? ({ "--c4-from": `${-(ROWS - r) * 115}%`, animation: "c4drop 0.25s ease-in" } as CSSProperties) : undefined}
                  />
                )}
              </span>
            );
          })}
        </button>
      ))}
    </div>
  );
}
