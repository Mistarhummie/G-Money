"use client";

import { useEffect, useRef, useState } from "react";
import { computerMove, newGame, notation, play, squareAt, type DraftsState, type Move } from "@/lib/games/arcade/drafts";
import type { GameComponentProps } from "@/lib/games/arcade/types";

/** What the board shows; rebuilt from the game after every move. */
type View = {
  board: number[];
  turn: 1 | -1;
  result: DraftsState["result"];
  /** The player's legal moves (empty while the computer is to move). */
  moves: Move[];
  /** Squares of the computer's last move, to highlight. */
  last: number[];
};

function viewOf(g: DraftsState, last: number[]): View {
  return { board: Array.from(g.board), turn: g.turn, result: g.result, moves: g.turn === 1 ? g.moves : [], last };
}

const startsWith = (path: number[], prefix: number[]) => prefix.every((s, i) => path[i] === s);

export default function DraftsGame({ seed, stage, onFinish }: GameComponentProps) {
  // The game object is mutable and only touched in event handlers; `view` drives rendering.
  const [game] = useState(() => newGame(seed, stage));
  const [view, setView] = useState(() => viewOf(game, []));
  const [tokens, setTokens] = useState<string[]>([]);
  /** The piece picked and the landing squares tapped so far. */
  const [sel, setSel] = useState<number[]>([]);
  const [cursor, setCursor] = useState<[number, number]>([5, 0]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finished = useRef(false);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const candidates = view.moves.filter((m) => startsWith(m.path, sel));
  const movable = new Set(view.moves.map((m) => m.path[0]));
  const targets = new Set(sel.length ? candidates.map((m) => m.path[sel.length]) : []);
  const mustCapture = view.moves.length > 0 && view.moves[0].captures.length > 0;
  const pendingCaptures = new Set(
    sel.length > 1 ? candidates.flatMap((m) => m.captures.slice(0, sel.length - 1)) : [],
  );

  function finish(all: string[]) {
    if (finished.current) return;
    finished.current = true;
    onFinish(all.join(" "));
  }

  function commit(m: Move) {
    play(game, m);
    const all = [...tokens, notation(m)];
    setTokens(all);
    setSel([]);
    setView(viewOf(game, []));
    if (game.result) return finish(all);
    timer.current = setTimeout(() => {
      const reply = computerMove(game);
      play(game, reply);
      setView(viewOf(game, reply.path));
      if (game.result) finish(all);
    }, 300);
  }

  function tap(sq: number) {
    if (finished.current || view.turn !== 1 || view.result) return;
    if (sel.length && targets.has(sq)) {
      const next = [...sel, sq];
      const matches = candidates.filter((m) => startsWith(m.path, next));
      // Auto-complete as soon as only one way remains.
      if (matches.length === 1) commit(matches[0]);
      else setSel(next);
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
        const sq = squareAt(r, c);
        if (sq >= 0) tap(sq);
      } else if (e.key === "Escape") setSel([]);
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const status =
    view.result === 1
      ? "You win!"
      : view.result === 2
        ? "The computer wins"
        : view.result === 3
          ? "Draw"
          : view.turn !== 1
            ? "Computer is thinking…"
            : sel.length > 1
              ? "Keep jumping: tap the next square"
              : mustCapture
                ? "You must capture"
                : "Your turn";
  const count = (v: number) => view.board.filter((p) => p * v > 0).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-sm text-white/70">
        <span className="flex items-center gap-2">
          <span className={`inline-block h-3 w-3 rounded-full ${view.turn === 1 && !view.result ? "bg-emerald-400" : "bg-amber-400"}`} />
          <span className={mustCapture && view.turn === 1 && !view.result ? "font-semibold text-emerald-300" : ""}>{status}</span>
        </span>
        <span className="flex items-center gap-3">
          <span className="font-mono text-xs">
            <span className="text-emerald-300">{count(1)}</span> v <span className="text-amber-300">{count(-1)}</span>
          </span>
          <button type="button" className="underline disabled:opacity-40" onClick={() => finish(tokens)} disabled={!!view.result}>
            Resign
          </button>
        </span>
      </div>
      <div className="grid aspect-square select-none grid-cols-8 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
        {Array.from({ length: 64 }, (_, i) => {
          const r = i >> 3;
          const c = i & 7;
          const sq = squareAt(r, c);
          const isCursor = cursor[0] === r && cursor[1] === c;
          if (sq < 0) return <div key={i} className={`bg-white/10 ${isCursor ? "ring-2 ring-inset ring-white/40" : ""}`} />;
          const p = view.board[sq];
          const selected = sel[0] === sq;
          const onPath = sel.includes(sq) && !selected;
          const canMove = sel.length === 0 && movable.has(sq);
          let bg = "bg-emerald-950/80";
          if (view.last.includes(sq)) bg = "bg-amber-500/25";
          if (onPath || selected) bg = "bg-emerald-500/30";
          return (
            <button
              key={i}
              type="button"
              aria-label={`Square ${sq + 1}`}
              onClick={() => tap(sq)}
              className={`relative flex items-center justify-center ${bg} ${isCursor ? "ring-2 ring-inset ring-white/40" : ""}`}
            >
              {p !== 0 && !(selected && sel.length > 1) && (
                <span
                  className={`flex h-[78%] w-[78%] items-center justify-center rounded-full border-2 text-base font-bold shadow-md transition ${
                    p > 0 ? "border-emerald-200 bg-emerald-400 text-emerald-950" : "border-amber-200 bg-amber-400 text-amber-950"
                  } ${selected ? "ring-4 ring-white" : canMove && mustCapture ? "ring-2 ring-emerald-300 animate-pulse" : canMove ? "ring-2 ring-white/30" : ""} ${
                    pendingCaptures.has(sq) ? "opacity-40" : ""
                  }`}
                >
                  {Math.abs(p) === 2 ? "♛" : ""}
                </span>
              )}
              {sel.length > 1 && sel[sel.length - 1] === sq && (
                <span className="flex h-[78%] w-[78%] items-center justify-center rounded-full border-2 border-emerald-200 bg-emerald-400 text-base font-bold text-emerald-950 ring-4 ring-white">
                  {Math.abs(view.board[sel[0]]) === 2 ? "♛" : ""}
                </span>
              )}
              {targets.has(sq) && <span className="absolute h-1/3 w-1/3 rounded-full bg-emerald-300/70" />}
            </button>
          );
        })}
      </div>
      <p className="text-center text-xs text-white/50">You are green and move up. Tap a piece, then where it goes; for a chain of jumps tap each landing square.</p>
    </div>
  );
}
