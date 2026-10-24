"use client";

import { useEffect, useRef, useState } from "react";
import { PoolBoard, PoolHeader, type Playback } from "@/components/games/pool/PoolBoard";
import { usePoolPopups } from "@/components/games/pool/poolFx";
import { applyShot, computerMove, encodePlace, encodeShot, initialState, placeCue, shotError, type Shot, type State } from "@/lib/games/arcade/pool";
import type { GameComponentProps } from "@/lib/games/arcade/types";

export default function PoolGame({ seed, stage, onFinish }: GameComponentProps) {
  const [game, setGame] = useState<State>(() => initialState(seed));
  const [busy, setBusy] = useState(false); // a shot is playing or the computer is at the table
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resigned, setResigned] = useState(false);

  const tokens = useRef<string[]>([]);
  const after = useRef<State | null>(null); // the table once the playing shot is over
  const timers = useRef<number[]>([]);
  const finished = useRef(false);
  const keys = useRef(0);
  const popups = usePoolPopups(0, ["You", "Computer"]);

  useEffect(
    () => () => {
      timers.current.forEach((t) => clearTimeout(t));
    },
    [],
  );

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  function finish() {
    if (finished.current) return;
    finished.current = true;
    onFinish(tokens.current.join(";"));
  }

  /** Plays a shot from `from` (cue ball already placed) and shows the result afterwards. */
  function play(from: State, shot: Shot, showAim: boolean) {
    const res = applyShot(from, shot, true);
    after.current = res.state;
    setGame(from);
    setPlayback({ key: ++keys.current, frames: res.sim.frames!, aim: showAim ? { x: shot.tx, y: shot.ty } : null, aimMs: 700 });
  }

  function playbackDone() {
    const next = after.current;
    setPlayback(null);
    if (!next || finished.current) return;
    popups.shotOver(game, next);
    setGame(next);
    if (next.winner !== null) later(finish, 1200);
    else if (next.turn === 1) later(() => computerTurn(next), 600);
    else setBusy(false);
  }

  function computerTurn(s: State) {
    if (finished.current) return;
    const mv = computerMove(s, stage, seed);
    let placed = s;
    if (mv.place) {
      const p = placeCue(s, mv.place[0], mv.place[1]);
      if (typeof p === "string") return; // cannot happen: the computer only picks legal spots
      placed = p;
    }
    play(placed, mv.shot, true);
  }

  function shoot(place: [number, number] | null, shot: Shot) {
    if (busy || finished.current || game.turn !== 0) return;
    let s = game;
    const pending: string[] = [];
    if (place) {
      const p = placeCue(s, place[0], place[1]);
      if (typeof p === "string") return setError(p);
      s = p;
      pending.push(encodePlace(place[0], place[1]));
    }
    const err = shotError(s, shot);
    if (err) return setError(err);
    setError(null);
    tokens.current.push(...pending, encodeShot(shot));
    setBusy(true);
    play(s, shot, false);
  }

  function resign() {
    if (finished.current) return;
    timers.current.forEach((t) => clearTimeout(t));
    setPlayback(null);
    setResigned(true);
    finish();
  }

  const status =
    game.winner === 0
      ? "You win!"
      : game.winner === 1
        ? "The computer wins"
        : game.winner === -1
          ? "Draw"
          : game.turn === 0
            ? busy
              ? "Balls rolling…"
              : game.ballInHand
                ? game.isBreak
                  ? "Your break: drag the cue ball behind the line"
                  : "Ball in hand: drag the cue ball anywhere"
                : "Your shot"
            : "Computer's shot…";

  return (
    <div className="flex flex-col gap-1">
      <PoolBoard
        game={game}
        canShoot={!busy && !resigned && game.turn === 0}
        onShoot={shoot}
        playback={playback}
        onPlaybackDone={playbackDone}
        onPot={(ball) => popups.pot(game, ball)}
        header={<PoolHeader game={game} names={["You", "Computer"]} status={status} active={game.winner === null ? game.turn : null} />}
        idleText={`Shot ${game.shots + 1}`}
        extra={
          <button type="button" className="underline" onClick={resign} disabled={resigned || game.winner !== null}>
            Resign
          </button>
        }
      />
      {error && <p className="text-center text-xs text-red-400">{error}</p>}
    </div>
  );
}
