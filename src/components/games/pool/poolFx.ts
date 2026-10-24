"use client";

/** Mid-game popups for pool: pots as they drop, fouls, groups and "on the 8" once a shot is over. */

import { useEffect, useRef } from "react";
import { useGameFx, type PopOptions } from "@/components/games/fx/GameFx";
import { vibrate } from "@/components/games/fx/motion";
import { groupOf, remaining, type State } from "@/lib/games/arcade/pool";

const GAP_MS = 1000; // at most one popup about every second

/**
 * `viewer` is the side whose point of view the popups take (null for a spectator).
 * Call `pot` as each ball drops during a shot, and `shotOver` when the shot has finished playing.
 */
export function usePoolPopups(viewer: 0 | 1 | null, names: [string, string]) {
  const fx = useGameFx();
  const last = useRef(0);
  const queue = useRef<[string, PopOptions][]>([]);
  const timer = useRef(0);
  const pots = useRef(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  function flush() {
    timer.current = 0;
    const next = queue.current.shift();
    if (!next) return;
    last.current = performance.now();
    fx.pop(next[0], next[1]);
    if (queue.current.length) timer.current = window.setTimeout(flush, GAP_MS);
  }

  function say(text: string, opts: PopOptions) {
    const wait = last.current + GAP_MS - performance.now();
    if (wait <= 0 && !queue.current.length) {
      last.current = performance.now();
      fx.pop(text, opts);
      return;
    }
    queue.current = [...queue.current.slice(-1), [text, opts]]; // keep the newest two
    if (!timer.current) timer.current = window.setTimeout(flush, Math.max(0, wait));
  }

  /** Ball `n` just dropped during a shot taken from `before`. */
  function pot(before: State, n: number) {
    const shooter = before.turn;
    const mine = viewer !== null && shooter === viewer;
    if (n === 0) {
      if (mine) {
        fx.shake();
        vibrate(40);
      }
      return;
    }
    if (n === 8) return; // the end of the game is celebrated elsewhere (or the 8 is respotted on the break)
    const g = before.groups[shooter];
    if (!before.isBreak && g !== null && groupOf(n) !== g) return; // the other side's ball: no fanfare
    const count = ++pots.current;
    if (mine) {
      if (count === 1) say(before.isBreak ? "Pot on the break!" : "Nice pot!", { tone: "good", emoji: "🎯", sub: `The ${n} drops`, ms: 1100 });
      else if (count === 2) {
        say("Two in one shot!", { tone: "great", emoji: "🔥" });
        fx.confetti(25);
        vibrate([20, 40, 20]);
      } else {
        say(`${count} in one shot!`, { tone: "great", emoji: "💥" });
        fx.confetti(30);
      }
    } else if (count <= 2) {
      say(count === 1 ? `${names[shooter]} pots the ${n}` : `${names[shooter]}: two in one shot`, { tone: "info", emoji: "🎱", ms: 1100 });
    }
  }

  /** The shot from `before` has finished and the table is now `after`. */
  function shotOver(before: State, after: State) {
    pots.current = 0;
    if (after.winner !== null) return;
    const shooter = before.turn;
    const opp = shooter === 0 ? 1 : 0;
    const fouled = after.ballInHand && after.turn === opp;
    if (fouled) {
      const reason = /^Foul \(([^)]+)\)/.exec(after.note)?.[1] ?? "foul";
      if (viewer === shooter) {
        say("Foul!", { tone: "bad", emoji: "🚫", sub: `${reason[0].toUpperCase()}${reason.slice(1)}: ball in hand to ${names[opp]}` });
        fx.shake();
        vibrate([30, 30, 30]);
      } else {
        say("Foul: ball in hand", {
          tone: "warn",
          emoji: "✋",
          sub: viewer === null ? `${names[shooter]}: ${reason}` : `${names[shooter]}: ${reason}. Place the cue ball anywhere`,
        });
      }
    }
    if (viewer !== null && before.groups[viewer] === null && after.groups[viewer] !== null) {
      const g = after.groups[viewer]!;
      say(`You're ${g}`, { tone: "info", emoji: g === "solids" ? "🔵" : "🟠", sub: `Pot the ${g === "solids" ? "1 to 7" : "9 to 15"}, then the 8` });
    }
    for (const side of [0, 1] as const) {
      const g = after.groups[side];
      if (!g || remaining(after.balls, g) > 0) continue;
      const was = before.groups[side];
      if (was && remaining(before.balls, was) === 0) continue; // already on the 8
      if (side === viewer) say("On the 8 ball", { tone: "great", emoji: "🎱", sub: "Pot the 8 to win" });
      else say(`${names[side]} is on the 8`, { tone: "warn", emoji: "🎱" });
    }
  }

  return { pot, shotOver };
}
