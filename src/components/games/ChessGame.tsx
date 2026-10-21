"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  BISHOP,
  KNIGHT,
  QUEEN,
  ROOK,
  VALUES,
  computerMove,
  gameStatus,
  inCheck,
  legalMoves,
  moveFrom,
  movePromo,
  moveTo,
  play,
  sqOf,
  startPosition,
  toUci,
  type Position,
} from "@/lib/games/arcade/chessbot";
import type { GameComponentProps } from "@/lib/games/arcade/types";

// Filled glyphs for both colours (we colour them), with U+FE0E so phones don't draw emoji.
const GLYPH = ["", "♟", "♞", "♝", "♜", "♛", "♚"].map((g) => (g ? g + "︎" : ""));
const START_COUNT = [0, 8, 2, 2, 2, 1, 1];

function Piece({ p, size }: { p: number; size?: string }) {
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

export default function ChessGame({ seed, stage, onFinish }: GameComponentProps) {
  const [pos, setPos] = useState(startPosition);
  const [playerMoves, setPlayerMoves] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [promo, setPromo] = useState<{ from: number; to: number } | null>(null);
  const [cursor, setCursor] = useState(sqOf(4, 1));
  const [resigned, setResigned] = useState(false);
  const [keyboard, setKeyboard] = useState(false); // show the cursor only once the keyboard is used
  const finished = useRef(false);

  const status = useMemo(() => gameStatus(pos), [pos]);
  const yourTurn = !status.over && !resigned && pos.side === 1;
  const moves = useMemo(() => (yourTurn ? legalMoves(pos) : []), [pos, yourTurn]);
  const targets = useMemo(() => new Set(moves.filter((m) => moveFrom(m) === selected).map(moveTo)), [moves, selected]);
  const checkSq = inCheck(pos) ? pos.kings[pos.side === 1 ? 0 : 1] : -1;

  // The computer replies after a short pause.
  useEffect(() => {
    if (status.over || resigned || pos.side !== -1) return;
    const timer = setTimeout(() => {
      const m = computerMove(pos, seed, stage);
      setPos(play(pos, m));
      setLastMove(m);
    }, 300);
    return () => clearTimeout(timer);
  }, [pos, status.over, resigned, seed, stage]);

  // Report the game once it ends on the board.
  useEffect(() => {
    if (status.over && !finished.current) {
      finished.current = true;
      onFinish(playerMoves.join(" "));
    }
  }, [status.over, playerMoves, onFinish]);

  function commit(m: number) {
    setPos(play(pos, m));
    setPlayerMoves((list) => [...list, toUci(m)]);
    setLastMove(m);
    setSelected(null);
    setPromo(null);
  }

  function tap(sq: number) {
    if (!yourTurn || promo) return;
    if (selected !== null && targets.has(sq)) {
      const options = moves.filter((m) => moveFrom(m) === selected && moveTo(m) === sq);
      if (options.some((m) => movePromo(m))) setPromo({ from: selected, to: sq });
      else commit(options[0]);
      return;
    }
    const mine = pos.board[sq] > 0 && moves.some((m) => moveFrom(m) === sq);
    setSelected(mine && sq !== selected ? sq : null);
  }

  function choosePromotion(piece: number) {
    if (!promo) return;
    const m = moves.find((x) => moveFrom(x) === promo.from && moveTo(x) === promo.to && movePromo(x) === piece);
    if (m !== undefined) commit(m);
  }

  function resign() {
    if (finished.current) return;
    finished.current = true;
    setResigned(true);
    onFinish(playerMoves.join(" "));
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (promo) {
      const piece = ({ q: QUEEN, r: ROOK, b: BISHOP, n: KNIGHT } as Record<string, number>)[e.key.toLowerCase()];
      if (piece) choosePromotion(piece);
      if (e.key === "Escape") setPromo(null);
      return;
    }
    setKeyboard(true);
    const step: Record<string, [number, number]> = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
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

  const lostByWhite = captured(pos, 1);
  const lostByBlack = captured(pos, -1);
  const material = lostByBlack.reduce((a, p) => a + VALUES[-p], 0) - lostByWhite.reduce((a, p) => a + VALUES[p], 0);

  const statusText = status.over
    ? `${status.reason}${status.winner === 1 ? ": you win!" : status.winner === -1 ? ": the computer wins." : "."}`
    : resigned
      ? "You resigned."
      : yourTurn
        ? checkSq >= 0
          ? "Check! Your move."
          : "Your move (White)."
        : "Computer is thinking…";

  const tray = (pieces: number[], lead: number) => (
    <div className="flex h-6 items-center gap-0.5 text-white/70">
      {pieces.map((p, i) => (
        <Piece key={i} p={p} size="1.1rem" />
      ))}
      {lead > 0 && <span className="ml-1 text-xs">+{lead / 100}</span>}
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-sm text-white/70">
        <span>Move {playerMoves.length + (yourTurn ? 1 : 0)}</span>
        <button type="button" className="underline disabled:opacity-40" onClick={resign} disabled={status.over || resigned}>
          Resign
        </button>
      </div>

      {tray(lostByWhite, -material)}

      <div
        className="relative rounded-2xl bg-black/30 p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        tabIndex={0}
        onKeyDown={onKey}
        aria-label="Chess board"
      >
        <div className="grid aspect-square grid-cols-8 overflow-hidden rounded-xl">
          {Array.from({ length: 64 }, (_, i) => {
            const r = 7 - Math.floor(i / 8);
            const f = i % 8;
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
                {sq === selected && <span className="absolute inset-0 bg-emerald-400/60" />}
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
                {f === 0 && <span className="absolute top-0.5 left-0.5 text-[9px] leading-none text-black/50">{r + 1}</span>}
                {r === 0 && <span className="absolute right-0.5 bottom-0.5 text-[9px] leading-none text-black/50">{"abcdefgh"[f]}</span>}
              </button>
            );
          })}
        </div>

        {promo && (
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
                  <Piece p={t} size="2.2rem" />
                </button>
              ))}
            </div>
            <button type="button" className="text-sm text-white/60 underline" onClick={() => setPromo(null)}>
              Cancel
            </button>
          </div>
        )}
      </div>

      {tray(lostByBlack, material)}

      <p className={`rounded-xl bg-white/5 px-3 py-2 text-center text-sm ${checkSq >= 0 && !status.over ? "text-amber-300" : "text-white/80"}`}>
        {statusText}
      </p>
      <p className="hidden text-center text-xs text-white/40 sm:block">Keyboard: arrows to move, Enter to pick up and drop, Q/R/B/N to promote.</p>
    </div>
  );
}
