"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BaoBoard, DirectionPicker, arrowKeyHandler, type Sowing } from "@/components/games/bao/BaoBoard";
import { legalMoves, moveToString, replayPvp, seedsOf, startsWithCapture, type Board, type Side } from "@/lib/games/arcade/bao";
import type { PvpBoardProps } from "@/lib/games/arcade/types";

export default function BaoPvp({ moves, mySide, names, onMove, disabled }: PvpBoardProps) {
  const [selected, setSelected] = useState<number | null>(null);
  // A move I just sent, shown until the page's `moves` catch up (or the send ends without them changing).
  const [pending, setPending] = useState<{ move: string; at: number } | null>(null);
  const shown = pending && disabled && moves.length === pending.at ? [...moves, pending.move] : moves;

  const key = shown.join(" ");
  const game = useMemo(() => replayPvp(key ? key.split(" ") : []), [key]);
  const me: Side = mySide ?? 0; // spectators see side 0 at the bottom

  // When exactly one move is added (theirs arriving, or mine sent), sow it visibly from the board before it.
  const [seen, setSeen] = useState<{ key: string; board: Board | null }>({ key, board: game?.board ?? null });
  const [sowing, setSowing] = useState<Sowing | null>(null);
  const [sowingDone, setSowingDone] = useState<string | null>(null);
  if (seen.key !== key) {
    const appended = shown.length > 0 && shown.slice(0, -1).join(" ") === seen.key;
    setSowing(
      appended && game?.lastMove && seen.board
        ? { id: `m${shown.length}`, from: seen.board, side: ((shown.length - 1) % 2) as Side, move: game.lastMove }
        : null,
    );
    setSeen({ key, board: game?.board ?? null });
  }
  const sowingNow = !!sowing && sowingDone !== sowing.id;

  const myTurn = !!game && !game.over && mySide !== null && game.turn === mySide && !disabled && !sowingNow;
  const legal = useMemo(() => (myTurn && game ? legalMoves(game.board, me) : []), [game, myTurn, me]);
  const mustCapture = legal.length > 0 && game !== null && startsWithCapture(game.board, me, legal[0]);

  function play(pit: number, dir: 1 | -1) {
    if (!myTurn || !legal.some((m) => m.pit === pit && m.dir === dir)) return;
    const move = moveToString({ pit, dir });
    setSelected(null);
    setPending({ move, at: moves.length });
    onMove(move);
  }

  const playRef = useRef(play);
  useEffect(() => {
    playRef.current = play;
  });
  useEffect(() => {
    const onKey = arrowKeyHandler(selected, legal, setSelected, (pit, dir) => playRef.current(pit, dir));
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, legal]);

  if (!game) {
    return <div className="rounded-2xl bg-black/30 p-6 text-center text-white/70">This game&apos;s moves could not be replayed.</div>;
  }

  const them = (1 - me) as Side;
  // Who made the last move: side 0 makes moves 0, 2, 4…
  const lastBy: Side | null = shown.length ? ((shown.length - 1) % 2 as Side) : null;
  const lastPit = game.lastMove?.pit ?? null;
  const nameOf = (s: Side) => (mySide === s ? `${names[s]} (you)` : names[s]);

  const status = game.over
    ? game.winner === null
      ? `Draw · ${game.detail ?? ""}`
      : `${mySide === game.winner ? "You win" : `${names[game.winner]} wins`} · ${game.detail ?? ""}`
    : myTurn
      ? selected !== null
        ? "Pick a direction"
        : mustCapture
          ? "Your turn: you must capture"
          : "Your turn: tap one of your pits"
      : sowingNow
        ? "Sowing… (tap the board to skip)"
        : mySide !== null && game.turn === mySide
          ? "Sending…"
          : `${names[game.turn]} to move`;

  const player = (side: Side) => (
    <div
      className={`flex items-center justify-between rounded-lg px-2 py-1 text-sm transition-colors duration-300 ${
        !game.over && game.turn === side
          ? side === me
            ? "bg-gradient-to-r from-emerald-400/25 to-teal-500/10 text-emerald-100 ring-1 ring-emerald-300/30"
            : "bg-gradient-to-r from-amber-400/25 to-orange-500/10 text-amber-100 ring-1 ring-amber-300/30"
          : "text-white/70"
      }`}
    >
      <span className="truncate font-semibold">
        {!game.over && game.turn === side ? "● " : ""}
        {nameOf(side)}
      </span>
      <span className="shrink-0">{seedsOf(game.board, side)} seeds</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-2 select-none">
      {player(them)}
      <BaoBoard
        board={game.board}
        me={me}
        legal={legal}
        selected={selected}
        onSelect={setSelected}
        theirLast={lastBy === them ? lastPit : null}
        myLast={lastBy === me ? lastPit : null}
        sowing={sowing}
        onSowDone={setSowingDone}
      />
      {player(me)}

      <div className="rounded-xl bg-black/30 px-3 py-2 text-center text-sm">
        <div className="font-semibold text-white">{status}</div>
        {game.lastMove && lastBy !== null && (
          <div className="text-xs text-white/60">
            {names[lastBy]} played {moveToString(game.lastMove)}
            {lastBy === them ? " (amber ring)" : ""}
          </div>
        )}
      </div>

      {selected !== null && myTurn && <DirectionPicker pit={selected} legal={legal} onPick={(dir) => play(selected, dir)} />}
      {mySide !== null && (
        <p className="text-center text-xs text-white/50">Your rows are the bottom two. Pits with a green ring can be played.</p>
      )}
    </div>
  );
}
