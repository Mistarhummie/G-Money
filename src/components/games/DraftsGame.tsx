"use client";

import { useEffect, useRef, useState } from "react";
import { computerMove, newGame, notation, play, type DraftsState, type Move } from "@/lib/games/arcade/drafts";
import type { GameComponentProps } from "@/lib/games/arcade/types";
import { DraftsBoard, SideDot } from "./drafts/DraftsBoard";

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
  return { board: Array.from(g.board), turn: g.turn, result: g.result, moves: g.turn === 1 && !g.result ? g.moves : [], last };
}

export default function DraftsGame({ seed, stage, onFinish }: GameComponentProps) {
  // The game object is mutable and only touched in event handlers; `view` drives rendering.
  const [game] = useState(() => newGame(seed, stage));
  const [view, setView] = useState(() => viewOf(game, []));
  const [tokens, setTokens] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finished = useRef(false);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function finish(all: string[]) {
    if (finished.current) return;
    finished.current = true;
    onFinish(all.join(" "));
  }

  function commit(m: Move) {
    if (finished.current || game.turn !== 1) return;
    play(game, m);
    const all = [...tokens, notation(m)];
    setTokens(all);
    setView(viewOf(game, []));
    if (game.result) return finish(all);
    timer.current = setTimeout(() => {
      const reply = computerMove(game);
      play(game, reply);
      setView(viewOf(game, reply.path));
      if (game.result) finish(all);
    }, 300);
  }

  const mustCapture = view.moves.length > 0 && view.moves[0].captures.length > 0;
  const status =
    view.result === 1
      ? "You win!"
      : view.result === 2
        ? "The computer wins"
        : view.result === 3
          ? "Draw"
          : view.turn !== 1
            ? "Computer is thinking…"
            : mustCapture
              ? "You must capture"
              : "Your turn";
  const count = (v: number) => view.board.filter((p) => p * v > 0).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-sm text-white/70">
        <span className="flex items-center gap-2">
          <SideDot side={view.turn === 1 && !view.result ? 0 : 1} />
          <span className={mustCapture ? "font-semibold text-emerald-300" : ""}>{status}</span>
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
      <DraftsBoard board={view.board} moves={view.moves} last={view.last} onMove={commit} />
      <p className="text-center text-xs text-white/50">You are green and move up. Tap a piece, then where it goes; for a chain of jumps tap each landing square.</p>
    </div>
  );
}
