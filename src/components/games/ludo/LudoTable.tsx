"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ludoJoinAction,
  ludoLeaveAction,
  ludoMoveAction,
  ludoQuickMatchAction,
  ludoRollAction,
  ludoStartAction,
  startLudoComputerAction,
} from "@/app/ludo-actions";
import { GameFrame, useGameFx } from "@/components/games/fx/GameFx";
import { vibrate } from "@/components/games/fx/motion";
import { HowToPlay } from "@/components/games/guide/HowToPlay";
import { LUDO_STAGES } from "@/lib/ludo/meta";
import { COLOUR_NAMES, HOME, apply, legalTokens, replay, seatColours, type LudoEvent, type LudoState } from "@/lib/ludo/rules";
import type { LudoView } from "@/lib/ludo/service";
import { Die } from "./Die";
import { LUDO_COLOURS, LudoBoard, type BoardHandle } from "./LudoBoard";

const MEDALS = ["🥇", "🥈", "🥉", "4th"];
const ordinal = (n: number) => ["1st", "2nd", "3rd", "4th"][n] ?? `${n + 1}th`;

type Act = (fn: () => Promise<{ error?: string; view?: LudoView }>) => Promise<boolean>;

/**
 * A Ludo table: the waiting room, then the game. It polls the server for new actions (computer
 * turns, other players, timeouts) and plays each one in order on the board.
 */
export function LudoTable({ initial }: { initial: LudoView }) {
  const [view, setView] = useState(initial);
  const [log, setLog] = useState<string[]>(initial.log);
  const [error, setError] = useState<string | null>(null);
  // Server clock minus ours, so countdowns match the server's deadlines.
  const offset = useRef(0);
  useEffect(() => {
    offset.current = initial.serverNow - Date.now();
  }, [initial.serverNow]);
  const logRef = useRef(log);
  const viewRef = useRef(view);
  useEffect(() => {
    logRef.current = log;
    viewRef.current = view;
  });

  const merge = useCallback((v: LudoView) => {
    offset.current = v.serverNow - Date.now();
    setView((cur) => (v.status === cur.status && v.logLength < logRef.current.length ? cur : v));
    setLog((cur) => {
      if (v.status === "waiting") return [];
      if (v.logFrom > cur.length || v.logFrom + v.log.length <= cur.length) return cur;
      return [...cur.slice(0, v.logFrom), ...v.log];
    });
  }, []);

  const live = view.status === "waiting" || view.status === "playing";
  useEffect(() => {
    if (!live) return;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/ludo/${view.id}?from=${logRef.current.length}`, { cache: "no-store" });
        if (res.ok && !stopped) merge(await res.json());
      } catch {
        // Try again next time.
      }
      if (!stopped) schedule();
    };
    const schedule = () => {
      const v = viewRef.current;
      let delay = v.mode === "online" ? 1700 : 4000;
      if (v.nextAt) delay = Math.min(delay, Math.max(250, v.nextAt - offset.current - Date.now() + 80));
      if (document.hidden) delay = Math.max(delay, 5000);
      timer = setTimeout(poll, delay);
    };
    schedule();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [live, view.id, merge]);

  const [pending, startTransition] = useTransition();
  const act: Act = useCallback(
    (fn) =>
      new Promise<boolean>((resolve) => {
        setError(null);
        startTransition(async () => {
          const res = await fn();
          if (res.error) setError(res.error);
          if (res.view) merge(res.view);
          resolve(!res.error);
        });
      }),
    [merge],
  );

  return (
    <div className="flex flex-col gap-3">
      {view.status === "waiting" || view.status === "cancelled" ? (
        <WaitingRoom view={view} act={act} pending={pending} />
      ) : (
        <LudoPlay key={view.status === "playing" || view.status === "finished" ? "game" : "x"} view={view} log={log} act={act} offset={offset} />
      )}
      {error && <p className="text-center text-sm text-red-400">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- waiting room

function WaitingRoom({ view, act, pending }: { view: LudoView; act: Act; pending: boolean }) {
  const [copied, setCopied] = useState(false);
  const share = typeof window === "undefined" ? "" : `${window.location.origin}/play/ludo/${view.id}`;
  const colours = seatColours(view.size);
  const people = view.seats.filter((s) => !s.empty).length;
  if (view.status === "cancelled") {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center text-white/70">
        This table was closed. <Link href="/play/ludo" className="text-emerald-300 underline">Back to Ludo</Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-gradient-to-br from-rose-500/10 via-amber-400/5 to-sky-500/10 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">{view.isPrivate ? "Friends' table" : "Waiting for players"}</h2>
          <p className="text-xs text-white/60">
            {people} of {view.size} seated. The game starts by itself when the table is full.
          </p>
        </div>
        <HowToPlay game="ludo" name="Ludo" stages={LUDO_STAGES} pvp="ludo" />
      </div>
      <ul className="grid grid-cols-2 gap-2">
        {view.seats.map((s, i) => {
          const col = LUDO_COLOURS[colours[i]];
          return (
            <li
              key={i}
              className={`flex items-center gap-2 rounded-xl border p-3 transition ${s.empty ? "border-dashed border-white/15" : "border-white/20 bg-white/5"}`}
              style={s.empty ? undefined : { boxShadow: `inset 4px 0 0 ${col.main}` }}
            >
              <span
                className={`h-6 w-6 shrink-0 rounded-full ${s.empty ? "opacity-30" : ""}`}
                style={{ background: `radial-gradient(circle at 35% 30%, #fff, ${col.light} 25%, ${col.main} 60%, ${col.dark})` }}
              />
              <span className="min-w-0 flex-1 text-sm leading-tight">
                {s.empty ? (
                  <span className="text-white/45">
                    Waiting<span className="inline-block animate-pulse">…</span>
                  </span>
                ) : (
                  <>
                    <strong className="block truncate">{s.name}</strong>
                    <span className="text-[11px] text-white/50">
                      {[s.isMe && "you", s.isHost && "host"].filter(Boolean).join(" · ") || "ready"}
                    </span>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {view.invited.length > 0 && <p className="text-xs text-white/60">Invited: {view.invited.join(", ")}</p>}
      {view.mySeat !== null && (
        <div className="text-sm">
          <p className="text-white/60">Send this link to friends so they can sit down:</p>
          <div className="mt-1 flex gap-2">
            <input readOnly value={share} className="input flex-1 font-mono text-xs" onFocus={(e) => e.target.select()} aria-label="Table link" />
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                navigator.clipboard?.writeText(share).then(() => setCopied(true), () => {});
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {view.canJoin && (
          <button className="btn-primary flex-1" disabled={pending} onClick={() => act(() => ludoJoinAction(view.id))}>
            Sit down and play
          </button>
        )}
        {view.isHost && (
          <>
            {people >= 2 && people < view.size && (
              <button className="btn-primary flex-1" disabled={pending} onClick={() => act(() => ludoStartAction(view.id, false))}>
                Start with {people} players
              </button>
            )}
            <button className="btn-secondary flex-1" disabled={pending} onClick={() => act(() => ludoStartAction(view.id, true))}>
              Start, computers in empty seats
            </button>
          </>
        )}
        {view.mySeat !== null && (
          <button className="btn-secondary" disabled={pending} onClick={() => act(() => ludoLeaveAction(view.id, 0))}>
            Leave
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the game

function LudoPlay({ view, log, act, offset }: { view: LudoView; log: string[]; act: Act; offset: React.RefObject<number> }) {
  // What the board shows. It trails the server's log while moves are being animated.
  const [shown, setShown] = useState<LudoState>(() => replay(view.setup, log) ?? replay(view.setup, [])!);
  const [ply, setPly] = useState(log.length);
  const [dice, setDice] = useState<{ key: number; value: number | null }[]>(() => {
    const last = [...log].reverse().find((a) => a[0] === "r");
    return view.seats.map((_, i) => ({ key: 0, value: i === shown.turn && last ? Number(last[1]) : null }));
  });
  const [spinning, setSpinning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [moment, setMoment] = useState<LudoEvent | null>(null);
  const board = useRef<BoardHandle>(null);
  const animating = useRef(false);
  const settle = useRef<(() => void) | null>(null);

  const mySeat = view.mySeat;
  const caughtUp = ply === log.length;
  const over = shown.over || view.status === "finished";
  const myTurn = caughtUp && mySeat !== null && !over && view.status === "playing" && shown.turn === mySeat && !shown.bots[mySeat];
  const canRoll = myTurn && shown.phase === "roll" && !busy;
  const movable = useMemo(() => (myTurn && shown.phase === "move" && !busy ? legalTokens(shown) : []), [myTurn, shown, busy]);

  // Play each new action from the server in order.
  useEffect(() => {
    if (animating.current || ply >= log.length) return;
    animating.current = true;
    const next = apply(shown, log[ply]);
    if (!next || !next.last) {
      // Out of step (should not happen): jump to the server's position.
      Promise.resolve().then(() => {
        const s = replay(view.setup, log);
        if (s) {
          setShown(s);
          setPly(log.length);
        }
        animating.current = false;
      });
      return;
    }
    const backlog = log.length - ply;
    const speed = backlog > 10 ? 5 : backlog > 4 ? 2.2 : backlog > 2 ? 1.4 : 1;
    const ev = next.last;
    const run = async () => {
      if (ev.k === "roll") {
        await new Promise<void>((done) => {
          settle.current = done;
          // Never wait forever on an animation (a hidden tab pauses them).
          setTimeout(done, 2500 / speed);
          setDice((d) => d.map((x, i) => (i === ev.seat ? { key: x.key + 1, value: ev.value } : x)));
          if (ev.seat === mySeat) setSpinning(false);
        });
        settle.current = null;
      } else if (ev.k === "move") {
        await board.current?.playMove(ev, shown, next, speed);
      }
      setMoment(ev);
      setShown(next);
      setPly((p) => p + 1);
      animating.current = false;
    };
    run();
  }, [log, ply, shown]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (over || view.deadline === null) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [over, view.deadline]);

  const roll = useCallback(async () => {
    if (!canRoll) return;
    setBusy(true);
    setSpinning(true);
    vibrate(12);
    const ok = await act(() => ludoRollAction(view.id, log.length));
    if (!ok) setSpinning(false);
    setBusy(false);
  }, [canRoll, act, view.id, log.length]);

  const pick = useCallback(
    async (token: number) => {
      if (!movable.includes(token)) return;
      setBusy(true);
      await act(() => ludoMoveAction(view.id, token, log.length));
      setBusy(false);
    },
    [movable, act, view.id, log.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.key === " " || e.key === "Enter" || e.key.toLowerCase() === "r") && canRoll) {
        e.preventDefault();
        roll();
      } else if (e.key >= "1" && e.key <= "4" && movable.includes(Number(e.key) - 1)) {
        e.preventDefault();
        pick(Number(e.key) - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canRoll, movable, roll, pick]);

  const deadline = view.deadline !== null && caughtUp ? view.deadline - offset.current : null;
  const secondsLeft = deadline !== null ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
  const timerFrac = deadline !== null ? Math.max(0, Math.min(1, (deadline - now) / (view.turnSeconds * 1000))) : null;
  const colours = shown.setup.colours;
  const seatOfColour = (c: number) => colours.indexOf(c as 0 | 1 | 2 | 3);
  const places = shown.places ?? view.places;

  const status = over
    ? places && mySeat !== null
      ? places[0] === mySeat
        ? "You won! 🏆"
        : `You came ${ordinal(places.indexOf(mySeat))}`
      : "Game over"
    : myTurn
      ? shown.phase === "roll"
        ? "Your turn: tap the die to roll"
        : movable.length > 1
          ? "Tap a glowing token to move it"
          : "Moving…"
      : `${view.seats[shown.turn]?.name ?? ""}'s turn`;

  const panel = (c: number) => {
    const seat = seatOfColour(c);
    if (seat === -1) return <div />;
    const s = view.seats[seat];
    const active = !over && shown.turn === seat;
    const place = shown.finished.indexOf(seat);
    const mine = seat === mySeat;
    const right = c === 1 || c === 2;
    const col = LUDO_COLOURS[c];
    return (
      <div
        className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 transition-all duration-300 ${right ? "flex-row-reverse text-right" : ""} ${
          active ? "border-white/60 bg-white/15 shadow-lg" : "border-white/10 bg-black/20"
        }`}
        style={active ? { boxShadow: `0 0 18px ${col.main}aa` } : undefined}
      >
        <button
          type="button"
          onClick={mine ? roll : undefined}
          disabled={!(mine && canRoll)}
          aria-label={mine && canRoll ? "Roll the die" : `${s.name}'s die`}
          className={`relative shrink-0 rounded-xl p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${mine && canRoll ? "cursor-pointer" : "cursor-default"}`}
          style={{ background: `linear-gradient(145deg, ${col.main}, ${col.dark})` }}
        >
          {mine && canRoll && <span className="absolute inset-0 animate-ping rounded-xl bg-white/30" />}
          <Die
            value={dice[seat]?.value ?? null}
            rollKey={dice[seat]?.key ?? 0}
            spinning={mine && spinning}
            dim={!active && !over}
            size={34}
            onSettled={() => settle.current?.()}
          />
        </button>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-semibold">
            {s.bot || s.left ? "🤖 " : ""}
            {s.name}
            {mine && <span className="font-normal text-white/60"> (you)</span>}
          </div>
          <div className="truncate text-[11px] text-white/60">
            {place >= 0
              ? `${MEDALS[place]} finished`
              : s.left
                ? "Left · computer plays"
                : shown.bots[seat] && !s.bot
                  ? "Computer took over"
                  : active
                    ? secondsLeft !== null && !shown.bots[seat]
                      ? `⏱ ${secondsLeft}s`
                      : shown.bots[seat]
                        ? "Thinking…"
                        : "To play"
                    : `${shown.tokens[seat].filter((p) => p === HOME).length}/4 home`}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <GameFrame
        aspect={0.8}
        help={<HowToPlay game="ludo" name="Ludo" stages={LUDO_STAGES} pvp="ludo" />}
        toolbar={
          <span className={`text-sm ${myTurn ? "font-semibold text-emerald-300" : "text-white/70"}`}>
            {status}
            {view.mode === "computer" && view.stage && <span className="ml-2 text-white/40">Stage {view.stage}</span>}
          </span>
        }
      >
        <Moments moment={moment} view={view} state={shown} />
        <TurnFx myTurn={myTurn} online={view.mode === "online"} />
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            {panel(0)}
            {panel(1)}
          </div>
          <div className="mx-auto w-full overflow-hidden rounded-2xl shadow-[0_18px_40px_-12px_rgba(0,0,0,.8)]">
            <LudoBoard ref={board} state={shown} movable={movable} onPick={pick} activeSeat={over ? null : shown.turn} timerFrac={timerFrac} mySeat={mySeat} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {panel(3)}
            {panel(2)}
          </div>
        </div>
      </GameFrame>

      {over && places && <Result view={view} places={places} />}

      {!over && mySeat !== null && (
        <button
          type="button"
          className="btn-secondary text-sm"
          onClick={() => {
            if (confirm(view.mode === "online" ? "Leave this game? A computer will take your seat." : "Leave this game? It counts as a loss.")) {
              act(() => ludoLeaveAction(view.id, log.length));
            }
          }}
        >
          Leave game
        </button>
      )}
    </>
  );
}

/** Popups for what just happened on the board. */
function Moments({ moment, view, state }: { moment: LudoEvent | null; view: LudoView; state: LudoState }) {
  const fx = useGameFx();
  const seen = useRef<LudoEvent | null>(null);
  useEffect(() => {
    if (!moment || moment === seen.current) return;
    seen.current = moment;
    const me = view.mySeat;
    const name = (seat: number) => (seat === me ? "You" : (view.seats[seat]?.name ?? "Player"));
    const colour = (seat: number) => COLOUR_NAMES[state.setup.colours[seat]];
    if (moment.k === "roll") {
      if (moment.outcome === "forfeit") {
        fx.pop("3 sixes: turn lost", { tone: "bad", emoji: "😵", sub: name(moment.seat) });
        if (moment.seat === me) fx.shake();
      } else if (moment.value === 6) fx.pop("Six! Roll again", { tone: "great", emoji: "🎲", sub: moment.seat === me ? undefined : name(moment.seat), ms: 1100 });
      else if (moment.outcome === "pass" && moment.seat === me) fx.pop("No move", { tone: "info", emoji: "🤷", sub: "The turn passes", ms: 1000 });
    } else if (moment.k === "move") {
      const victims = [...new Set(moment.captured.map((c) => c.seat))];
      for (const v of victims) {
        const mine = moment.seat === me;
        fx.pop(`Captured ${colour(v)}!`, {
          tone: mine ? "great" : v === me ? "bad" : "warn",
          emoji: mine ? "💥" : v === me ? "😱" : "⚔️",
          sub: mine ? "Roll again" : v === me ? `${name(moment.seat)} sent you home` : `${name(moment.seat)} hit ${name(v)}`,
        });
        fx.shake();
        vibrate(v === me ? [30, 40, 30] : 25);
      }
      if (moment.finished) {
        const place = state.finished.indexOf(moment.seat);
        fx.pop(moment.seat === me ? `You finished ${ordinal(place)}!` : `${name(moment.seat)} finished ${ordinal(place)}`, {
          tone: moment.seat === me ? "great" : "info",
          emoji: MEDALS[place] ?? "🏁",
          ms: 2200,
        });
        if (moment.seat === me) fx.confetti(place === 0 ? 140 : 60);
      } else if (moment.home) fx.pop("Token home!", { tone: "good", emoji: "🏠", sub: moment.seat === me ? "Roll again" : name(moment.seat) });
      else if (moment.safeSave) fx.pop("Safe!", { tone: "info", emoji: "⭐", sub: "Nobody can be captured on a star", ms: 1100 });
    } else if (moment.k === "bot") {
      const s = view.seats[moment.seat];
      fx.pop(s?.left ? `${s.name} left` : `${s?.name ?? "Player"} is away`, { tone: "warn", emoji: "🤖", sub: "The computer plays for them" });
    }
  }, [moment]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!state.over || !state.places || view.mySeat === null) return;
    if (state.places[0] === view.mySeat && !state.finished.includes(view.mySeat)) fx.confetti(140);
  }, [state.over]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function TurnFx({ myTurn, online }: { myTurn: boolean; online: boolean }) {
  const fx = useGameFx();
  const was = useRef(myTurn);
  useEffect(() => {
    if (myTurn && !was.current) {
      if (online) fx.pop("Your turn", { tone: "info", emoji: "👉", ms: 900 });
      vibrate(15);
    }
    was.current = myTurn;
  }, [myTurn]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function Result({ view, places }: { view: LudoView; places: number[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const won = view.mySeat !== null && places[0] === view.mySeat;
  const go = (fn: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      const res = await fn();
      if (res?.error) setError(res.error);
    });
  const opponents = view.size - 1;
  return (
    <div className={`flex flex-col gap-3 rounded-2xl p-4 ${won ? "bg-emerald-500/15" : "bg-white/5"}`}>
      <ol className="flex flex-col gap-1 text-sm">
        {places.map((seat, i) => {
          const s = view.seats[seat];
          return (
            <li key={seat} className="flex items-center gap-2">
              <span className="w-8 text-center">{MEDALS[i]}</span>
              <span className="h-3 w-3 rounded-full" style={{ background: LUDO_COLOURS[view.setup.colours[seat]].main }} />
              <span className={s?.isMe ? "font-semibold" : ""}>
                {s?.name}
                {s?.isMe && " (you)"}
                {s?.left && <span className="text-white/50"> · left</span>}
              </span>
            </li>
          );
        })}
      </ol>
      {view.mode === "computer" && view.stage && (
        <p className="text-sm text-white/80">
          {won
            ? view.stage < LUDO_STAGES.length
              ? `Stage ${view.stage} cleared! Stage ${view.stage + 1} is open.`
              : "You beat the Master computers!"
            : "Finish first to clear the stage."}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {view.mode === "computer" && view.stage ? (
          <>
            <button className="btn-primary flex-1" disabled={pending} onClick={() => go(() => startLudoComputerAction(view.stage!, opponents))}>
              Play again
            </button>
            {won && view.stage < LUDO_STAGES.length && (
              <button className="btn-secondary flex-1" disabled={pending} onClick={() => go(() => startLudoComputerAction(view.stage! + 1, opponents))}>
                Next stage
              </button>
            )}
          </>
        ) : (
          <button className="btn-primary flex-1" disabled={pending} onClick={() => go(() => ludoQuickMatchAction(view.size))}>
            Play online again
          </button>
        )}
        <Link href="/play/ludo" className="btn-secondary text-center">
          Ludo home
        </Link>
      </div>
      {error && <p className="text-center text-sm text-red-400">{error}</p>}
    </div>
  );
}
