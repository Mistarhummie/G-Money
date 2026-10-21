"use client";

import type { Board, Move, Side } from "@/lib/games/arcade/bao";

// Shared Bao board UI, used by the vs-computer game and the two-player board.
// Rows top to bottom: opponent outer, opponent inner, my inner, my outer. Each maps a screen
// column (0..7, left to right as I see it) to a pit index k of that side (see bao.ts).
const ROWS: { mine: boolean; k: (c: number) => number }[] = [
  { mine: false, k: (c) => 8 + c },
  { mine: false, k: (c) => 7 - c },
  { mine: true, k: (c) => c },
  { mine: true, k: (c) => 15 - c },
];

/** Screen direction to sowing direction: on my inner row "right" is clockwise, on my outer row it is anticlockwise. */
export const dirFor = (pit: number, screen: "left" | "right"): 1 | -1 => ((pit < 8) === (screen === "right") ? 1 : -1);

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

type BoardProps = {
  board: Board;
  /** The side drawn at the bottom (the viewer's rows). */
  me: Side;
  /** Legal moves for `me` (empty when it is not my turn). */
  legal: Move[];
  selected: number | null;
  onSelect: (pit: number | null) => void;
  /** Pit the opponent last played from (amber ring). */
  theirLast?: number | null;
  /** Pit I last played from (faint ring). */
  myLast?: number | null;
};

export function BaoBoard({ board, me, legal, selected, onSelect, theirLast = null, myLast = null }: BoardProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#3b2414]/60 p-1.5">
      {ROWS.map((row, r) => (
        <div key={r} className={`grid grid-cols-8 gap-1 ${r === 2 ? "mt-2 border-t border-white/10 pt-2" : r ? "mt-1" : ""}`}>
          {Array.from({ length: 8 }, (_, c) => {
            const k = row.k(c);
            const side = row.mine ? me : 1 - me;
            const n = board[side * 16 + k];
            const canPick = row.mine && legal.some((m) => m.pit === k);
            const isSel = row.mine && selected === k;
            const ring = isSel
              ? "ring-2 ring-emerald-400"
              : canPick
                ? "ring-1 ring-emerald-400/50 active:scale-95"
                : !row.mine && theirLast === k
                  ? "ring-2 ring-amber-400/80"
                  : row.mine && myLast === k
                    ? "ring-1 ring-white/30"
                    : "";
            return (
              <button
                key={c}
                type="button"
                disabled={!canPick}
                onClick={() => onSelect(isSel ? null : k)}
                aria-label={`${row.mine ? "My" : "Opponent"} pit, ${n} seeds`}
                className={`relative flex aspect-square items-center justify-center rounded-full bg-black/45 shadow-inner transition ${ring}`}
              >
                <Seeds n={n} />
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** The ← / → buttons shown once a pit is selected. */
export function DirectionPicker({ pit, legal, onPick }: { pit: number; legal: Move[]; onPick: (dir: 1 | -1) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {(["left", "right"] as const).map((screen) => {
        const dir = dirFor(pit, screen);
        const ok = legal.some((m) => m.pit === pit && m.dir === dir);
        return (
          <button
            key={screen}
            type="button"
            disabled={!ok}
            onClick={() => onPick(dir)}
            className="rounded-xl bg-emerald-500/90 py-3 text-lg font-bold text-emerald-950 transition active:scale-95 disabled:bg-white/5 disabled:text-white/30"
          >
            {screen === "left" ? "← Sow left" : "Sow right →"}
          </button>
        );
      })}
    </div>
  );
}

/** Arrow keys sow the selected pit, Escape cancels. Returns a keydown handler to attach to window. */
export function arrowKeyHandler(selected: number | null, legal: Move[], onSelect: (pit: number | null) => void, onPick: (pit: number, dir: 1 | -1) => void) {
  return (e: KeyboardEvent) => {
    if (selected === null) return;
    if (e.key === "Escape") onSelect(null);
    else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const dir = dirFor(selected, e.key === "ArrowLeft" ? "left" : "right");
      if (legal.some((m) => m.pit === selected && m.dir === dir)) onPick(selected, dir);
    }
  };
}
