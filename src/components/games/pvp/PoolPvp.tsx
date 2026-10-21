"use client";

import { useState } from "react";
import { PoolBoard, PoolHeader, type Playback } from "@/components/games/pool/PoolBoard";
import { applyShot, encodePlace, encodeShot, initialState, parseInput, placeCue, replayPvp, shotError, type Shot, type State } from "@/lib/games/arcade/pool";
import type { PvpBoardProps } from "@/lib/games/arcade/types";

/** The shot in `move` played from `before`, with frames for the animation (null if the move is not legal there). */
function playMove(before: State, move: string, names: [string, string]) {
  const toks = parseInput(move);
  if (!toks || toks.length === 0) return null;
  let s = before;
  const first = toks[0];
  if (first.kind === "p") {
    const p = placeCue(s, first.x, first.y);
    if (typeof p === "string") return null;
    s = p;
  }
  const last = toks[toks.length - 1];
  if (last.kind !== "s" || shotError(s, last.shot)) return null;
  const res = applyShot(s, last.shot, true, names);
  return { placed: s, shot: last.shot, after: res.state, frames: res.sim.frames! };
}

/**
 * Two people at one table. Each move is one visit: "s:tx,ty,pow", or "p:x,y;s:tx,ty,pow" with ball in hand.
 * Both players see the table the same way (side 0 broke from the bottom).
 */
export default function PoolPvp({ seed, moves, mySide, names, onMove, disabled }: PvpBoardProps) {
  const replayed = (ms: string[]) => replayPvp(seed, ms, names) ?? initialState(seed);
  const [table, setTable] = useState<State>(() => replayed(moves));
  const [seen, setSeen] = useState(moves); // the move list the table reflects
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [after, setAfter] = useState<State | null>(null); // the table once the playing shot is over
  // My move, shown before the server has accepted it.
  const [mine, setMine] = useState<{ base: number; move: string; sawDisabled: boolean } | null>(null);

  // The move list changed: show the new move (animated unless it is the one I just played).
  if (moves !== seen) {
    setSeen(moves);
    const grew = moves.length === seen.length + 1 && seen.every((m, i) => moves[i] === m);
    if (mine && moves.length === mine.base + 1 && moves[mine.base] === mine.move) {
      setMine(null);
    } else if (grew) {
      const before = replayed(seen);
      const played = playMove(before, moves[moves.length - 1], names);
      setMine(null);
      if (played) {
        setTable(played.placed);
        setAfter(played.after);
        setPlayback({ key: moves.length * 2, frames: played.frames, aim: { x: played.shot.tx, y: played.shot.ty }, aimMs: 700 });
      } else {
        setTable(replayed(moves));
        setPlayback(null);
      }
    } else if (moves.length !== seen.length || moves.some((m, i) => m !== seen[i])) {
      // Several moves at once (or a reload): jump straight to the position.
      setMine(null);
      setPlayback(null);
      setTable(replayed(moves));
    }
  }

  // My move was rejected (sending finished but the list did not grow): go back to the server's table.
  if (mine && disabled && !mine.sawDisabled) setMine({ ...mine, sawDisabled: true });
  if (mine && mine.sawDisabled && !disabled && moves.length === mine.base) {
    setMine(null);
    setPlayback(null);
    setTable(replayed(moves));
  }

  function playbackDone(key: number) {
    if (key !== playback?.key) return;
    setPlayback(null);
    if (after) setTable(after);
    setAfter(null);
  }

  function shoot(place: [number, number] | null, shot: Shot) {
    if (mySide === null || disabled || mine || playback || table.winner !== null || table.turn !== mySide) return;
    const move = (place ? encodePlace(place[0], place[1]) + ";" : "") + encodeShot(shot);
    const played = playMove(table, move, names);
    if (!played) return;
    setMine({ base: moves.length, move, sawDisabled: false });
    setTable(played.placed);
    setAfter(played.after);
    setPlayback({ key: moves.length * 2 + 1, frames: played.frames, aim: null, aimMs: 0 });
    onMove(move);
  }

  const over = table.winner !== null && !playback;
  const shooter = names[table.turn];
  const status = over
    ? table.winner === -1
      ? "Draw"
      : `${names[table.winner as 0 | 1]} wins${mySide === null ? "" : table.winner === mySide ? " – well played!" : ""}`
    : playback
      ? "Balls rolling…"
      : mySide === table.turn
        ? table.ballInHand
          ? table.isBreak
            ? "Your break: drag the cue ball behind the line"
            : "Ball in hand: drag the cue ball anywhere"
          : "Your shot"
        : `${shooter} to shoot${table.ballInHand ? " (ball in hand)" : ""}…`;

  return (
    <PoolBoard
      game={table}
      canShoot={mySide !== null && !disabled && !mine && table.turn === mySide && table.winner === null}
      onShoot={shoot}
      playback={playback}
      onPlaybackDone={playbackDone}
      header={<PoolHeader game={table} names={names} status={status} active={table.winner === null ? table.turn : null} />}
      idleText={mySide === null ? "Watching" : `Shot ${table.shots + 1}`}
    />
  );
}
