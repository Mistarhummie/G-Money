"use client";

import { useEffect, useState } from "react";
import { squareAt, type Move } from "@/lib/games/arcade/drafts";

/**
 * The drafts board, shared by the vs-computer and two-player games. It handles picking a piece and
 * tapping its landing squares; the parent decides which moves are allowed and what happens on a move.
 */
type Props = {
  /** Cell values for squares 0-31: 1/2 side-0 man/king (green), -1/-2 side-1 man/king (amber). */
  board: number[];
  /** Moves the viewer may make now (empty when it is not their turn). Keep the same array for a turn: a new one clears the selection. */
  moves: Move[];
  /** Squares of the last move, highlighted. */
  last: number[];
  /** Show the board from side 1's point of view (square 1 at the bottom). */
  flipped?: boolean;
  onMove: (m: Move) => void;
};

const startsWith = (path: number[], prefix: number[]) => prefix.every((s, i) => path[i] === s);

export function DraftsBoard({ board, moves, last, flipped = false, onMove }: Props) {
  /** The piece picked and the landing squares tapped so far. */
  const [sel, setSel] = useState<number[]>([]);
  /** Keyboard cursor in screen coordinates [row, col]. */
  const [cursor, setCursor] = useState<[number, number]>([5, 0]);
  // A new list of moves means a new turn: drop any half-made selection.
  const [seenMoves, setSeenMoves] = useState(moves);
  if (seenMoves !== moves) {
    setSeenMoves(moves);
    setSel([]);
  }

  const candidates = moves.filter((m) => startsWith(m.path, sel));
  const movable = new Set(moves.map((m) => m.path[0]));
  const targets = new Set(sel.length ? candidates.map((m) => m.path[sel.length]) : []);
  const mustCapture = moves.length > 0 && moves[0].captures.length > 0;
  const pendingCaptures = new Set(sel.length > 1 ? candidates.flatMap((m) => m.captures.slice(0, sel.length - 1)) : []);
  const toBoard = (r: number, c: number): [number, number] => (flipped ? [7 - r, 7 - c] : [r, c]);

  function tap(sq: number) {
    if (!moves.length) return;
    if (sel.length && targets.has(sq)) {
      const next = [...sel, sq];
      const matches = candidates.filter((m) => startsWith(m.path, next));
      // Auto-complete as soon as only one way remains.
      if (matches.length === 1) {
        setSel([]);
        onMove(matches[0]);
      } else setSel(next);
    } else if (sel.length <= 1 && movable.has(sq)) {
      setSel(sel[0] === sq ? [] : [sq]);
    } else {
      setSel([]);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const [r, c] = cursor;
      if (e.key === "ArrowUp") setCursor([Math.max(0, r - 1), c]);
      else if (e.key === "ArrowDown") setCursor([Math.min(7, r + 1), c]);
      else if (e.key === "ArrowLeft") setCursor([r, Math.max(0, c - 1)]);
      else if (e.key === "ArrowRight") setCursor([r, Math.min(7, c + 1)]);
      else if (e.key === "Enter" || e.key === " ") {
        const sq = squareAt(...toBoard(r, c));
        if (sq >= 0) tap(sq);
      } else if (e.key === "Escape") setSel([]);
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="grid aspect-square select-none grid-cols-8 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
      {Array.from({ length: 64 }, (_, i) => {
        const vr = i >> 3;
        const vc = i & 7;
        const sq = squareAt(...toBoard(vr, vc));
        const isCursor = moves.length > 0 && cursor[0] === vr && cursor[1] === vc;
        if (sq < 0) return <div key={i} className={`bg-white/10 ${isCursor ? "ring-2 ring-inset ring-white/40" : ""}`} />;
        const p = board[sq];
        const selected = sel[0] === sq;
        const onPath = sel.includes(sq) && !selected;
        const canMove = sel.length === 0 && movable.has(sq);
        let bg = "bg-emerald-950/80";
        if (last.includes(sq)) bg = "bg-amber-500/25";
        if (onPath || selected) bg = "bg-emerald-500/30";
        const piece = (v: number, ring: string) => (
          <span
            className={`flex h-[78%] w-[78%] items-center justify-center rounded-full border-2 text-base font-bold shadow-md transition ${
              v > 0 ? "border-emerald-200 bg-emerald-400 text-emerald-950" : "border-amber-200 bg-amber-400 text-amber-950"
            } ${ring}`}
          >
            {Math.abs(v) === 2 ? "♛" : ""}
          </span>
        );
        return (
          <button
            key={i}
            type="button"
            aria-label={`Square ${sq + 1}`}
            onClick={() => tap(sq)}
            className={`relative flex items-center justify-center ${bg} ${isCursor ? "ring-2 ring-inset ring-white/40" : ""}`}
          >
            {p !== 0 &&
              !(selected && sel.length > 1) &&
              piece(
                p,
                `${selected ? "ring-4 ring-white" : canMove && mustCapture ? "ring-2 ring-emerald-300 animate-pulse" : canMove ? "ring-2 ring-white/30" : ""} ${
                  pendingCaptures.has(sq) ? "opacity-40" : ""
                }`,
              )}
            {sel.length > 1 && sel[sel.length - 1] === sq && piece(board[sel[0]], "ring-4 ring-white")}
            {targets.has(sq) && <span className="absolute h-1/3 w-1/3 rounded-full bg-emerald-300/70" />}
          </button>
        );
      })}
    </div>
  );
}

/** Coloured dot + label used in the status line above the board. */
export function SideDot({ side }: { side: 0 | 1 }) {
  return <span className={`inline-block h-3 w-3 rounded-full ${side === 0 ? "bg-emerald-400" : "bg-amber-400"}`} />;
}
