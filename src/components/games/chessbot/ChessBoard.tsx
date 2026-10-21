"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { BISHOP, KNIGHT, QUEEN, ROOK, VALUES, inCheck, legalMoves, moveFrom, movePromo, moveTo, sqOf, type Position } from "@/lib/games/arcade/chessbot";

/**
 * The chess board shared by the vs-computer game and the two-player board: tap a piece then a
 * target square, legal targets, last move, check, promotion picker and keyboard control.
 */

// Filled glyphs for both colours (we colour them), with U+FE0E so phones don't draw emoji.
const GLYPH = ["", "♟", "♞", "♝", "♜", "♛", "♚"].map((g) => (g ? g + "︎" : ""));
const START_COUNT = [0, 8, 2, 2, 2, 1, 1];

export function Piece({ p, size }: { p: number; size?: string }) {
  if (!p) return null;
  const white = p > 0;
  return (
    <span
      className="leading-none select-none"
      style={{
        fontSize: size,
        color: white ? "#fff" : "#151515",
        textShadow: white ? "0 0 2px #000, 0 0 1px #000, 0 0 1px #000" : "0 0 2px rgba(255,255,255,.45)",
      }}
    >
      {GLYPH[Math.abs(p)]}
    </span>
  );
}

/** Pieces of `colour` (1 or -1) missing from the board, most valuable first. */
function captured(pos: Position, colour: number): number[] {
  const count = [0, 0, 0, 0, 0, 0, 0];
  for (let r = 0; r < 8; r++)
    for (let f = 0; f < 8; f++) {
      const p = pos.board[sqOf(f, r)] * colour;
      if (p > 0) count[p]++;
    }
  const out: number[] = [];
  for (let t = QUEEN; t >= 1; t--) for (let i = count[t]; i < START_COUNT[t]; i++) out.push(t * colour);
  return out;
}

/** The pieces `colour` has lost, with the material lead of the other side if it has one. */
export function CapturedTray({ pos, colour }: { pos: Position; colour: 1 | -1 }) {
  const lost = captured(pos, colour);
  const gained = captured(pos, -colour);
  const lead = lost.reduce((a, p) => a + VALUES[Math.abs(p)], 0) - gained.reduce((a, p) => a + VALUES[Math.abs(p)], 0);
  return (
    <div className="flex h-6 items-center gap-0.5 text-white/70">
      {lost.map((p, i) => (
        <Piece key={i} p={p} size="1.1rem" />
      ))}
      {lead > 0 && <span className="ml-1 text-xs">+{lead / 100}</span>}
    </div>
  );
}

type Props = {
  pos: Position;
  /** True when the viewer may move now (it is their colour's turn). */
  canMove: boolean;
  /** Show Black at the bottom. */
  flipped?: boolean;
  lastMove: number | null;
  onMove: (m: number) => void;
};

export function ChessBoard({ pos, canMove, flipped = false, lastMove, onMove }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [promo, setPromo] = useState<{ from: number; to: number } | null>(null);
  const [cursor, setCursor] = useState(sqOf(4, flipped ? 6 : 1));
  const [keyboard, setKeyboard] = useState(false); // show the cursor only once the keyboard is used

  const moves = useMemo(() => (canMove ? legalMoves(pos) : []), [pos, canMove]);
  const targets = useMemo(() => new Set(moves.filter((m) => moveFrom(m) === selected).map(moveTo)), [moves, selected]);
  const checkSq = inCheck(pos) ? pos.kings[pos.side === 1 ? 0 : 1] : -1;
  const showPromo = canMove && promo;

  function commit(m: number) {
    setSelected(null);
    setPromo(null);
    onMove(m);
  }

  function tap(sq: number) {
    if (!canMove || promo) return;
    if (selected !== null && targets.has(sq)) {
      const options = moves.filter((m) => moveFrom(m) === selected && moveTo(m) === sq);
      if (options.some((m) => movePromo(m))) setPromo({ from: selected, to: sq });
      else commit(options[0]);
      return;
    }
    const mine = moves.some((m) => moveFrom(m) === sq);
    setSelected(mine && sq !== selected ? sq : null);
  }

  function choosePromotion(piece: number) {
    if (!promo) return;
    const m = moves.find((x) => moveFrom(x) === promo.from && moveTo(x) === promo.to && movePromo(x) === piece);
    if (m !== undefined) commit(m);
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (showPromo) {
      const piece = ({ q: QUEEN, r: ROOK, b: BISHOP, n: KNIGHT } as Record<string, number>)[e.key.toLowerCase()];
      if (piece) choosePromotion(piece);
      if (e.key === "Escape") setPromo(null);
      return;
    }
    setKeyboard(true);
    const dir = flipped ? -1 : 1;
    const step: Record<string, [number, number]> = { ArrowUp: [0, dir], ArrowDown: [0, -dir], ArrowLeft: [-dir, 0], ArrowRight: [dir, 0] };
    if (step[e.key]) {
      e.preventDefault();
      const f = Math.min(7, Math.max(0, (cursor & 7) + step[e.key][0]));
      const r = Math.min(7, Math.max(0, (cursor >> 4) + step[e.key][1]));
      setCursor(sqOf(f, r));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      tap(cursor);
    } else if (e.key === "Escape") setSelected(null);
  }

  return (
    <div
      className="relative rounded-2xl bg-black/30 p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
      tabIndex={0}
      onKeyDown={onKey}
      aria-label="Chess board"
    >
      <div className="grid aspect-square grid-cols-8 overflow-hidden rounded-xl">
        {Array.from({ length: 64 }, (_, i) => {
          const row = Math.floor(i / 8);
          const col = i % 8;
          const r = flipped ? row : 7 - row;
          const f = flipped ? 7 - col : col;
          const sq = sqOf(f, r);
          const p = pos.board[sq];
          const light = (r + f) % 2 === 1;
          const isLast = lastMove !== null && (moveFrom(lastMove) === sq || moveTo(lastMove) === sq);
          const isTarget = targets.has(sq);
          return (
            <button
              key={sq}
              type="button"
              onClick={() => {
                setCursor(sq);
                setKeyboard(false);
                tap(sq);
              }}
              className={`relative flex items-center justify-center ${light ? "bg-[#cfd8c4]" : "bg-[#6b8f71]"}`}
              aria-label={`${"abcdefgh"[f]}${r + 1}`}
            >
              {isLast && <span className="absolute inset-0 bg-amber-300/45" />}
              {sq === checkSq && <span className="absolute inset-0 bg-[radial-gradient(circle,rgba(239,68,68,.95)_0%,rgba(239,68,68,.4)_55%,transparent_75%)]" />}
              {canMove && sq === selected && <span className="absolute inset-0 bg-emerald-400/60" />}
              {keyboard && sq === cursor && <span className="absolute inset-0.5 rounded-sm border-2 border-sky-500/80" />}
              <span className="relative">
                <Piece p={p} size="min(9vw, 2.6rem)" />
              </span>
              {isTarget &&
                (p ? (
                  <span className="absolute inset-0.5 rounded-full border-4 border-emerald-600/70" />
                ) : (
                  <span className="absolute h-1/3 w-1/3 rounded-full bg-emerald-700/60" />
                ))}
              {col === 0 && <span className="absolute top-0.5 left-0.5 text-[9px] leading-none text-black/50">{r + 1}</span>}
              {row === 7 && <span className="absolute right-0.5 bottom-0.5 text-[9px] leading-none text-black/50">{"abcdefgh"[f]}</span>}
            </button>
          );
        })}
      </div>

      {showPromo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-black/70">
          <p className="text-sm text-white/80">Promote to:</p>
          <div className="flex gap-2">
            {[QUEEN, ROOK, BISHOP, KNIGHT].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => choosePromotion(t)}
                className="flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 bg-white/10 active:scale-95"
                aria-label={["", "", "Knight", "Bishop", "Rook", "Queen"][t]}
              >
                <Piece p={t * pos.side} size="2.2rem" />
              </button>
            ))}
          </div>
          <button type="button" className="text-sm text-white/60 underline" onClick={() => setPromo(null)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

export const KEYBOARD_HINT = "Keyboard: arrows to move, Enter to pick up and drop, Q/R/B/N to promote.";
