"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  acceptChallengeAction,
  cancelChallengeAction,
  playMoveAction,
  quickMatchAction,
  reportProgressAction,
  resignAction,
} from "@/app/actions";
import { GameFrame, useGameFx } from "@/components/games/fx/GameFx";
import { HowToPlay } from "@/components/games/guide/HowToPlay";
import { PVP_COMPONENTS } from "@/components/games/pvp/registry";
import type { ChallengeView } from "@/lib/challenges";
import type { ArcadeKey, Stage } from "@/lib/games/arcade/types";
import { GameRunner } from "@/app/play/[game]/GameRunner";

type Props = {
  initial: ChallengeView;
  game: ArcadeKey;
  name: string;
  stages: Stage[];
  ranking: "score" | "time";
  scoreLabel: string;
  kind: "solo" | "versus";
};

type Live = { score: number; detail?: string };

const POLL_MS = 2000;
/** "Ready?" then 3-2-1, counted from the moment both players are in. */
const COUNTDOWN_MS = 4500;
/** Live progress goes to the server at most this often. */
const PROGRESS_EVERY_MS = 1500;

export function MatchClient({ initial, game, name, stages, ranking, scoreLabel, kind }: Props) {
  const router = useRouter();
  const [view, setViewRaw] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(initial.serverNow);
  const [pending, startTransition] = useTransition();
  // Server time minus browser time, so countdowns agree with the other player's screen. Until the first
  // clock tick the page shows the server's time, so the server and browser render the same thing.
  const [skew, setSkew] = useState<number | null>(null);
  const live = view.status === "open" || view.status === "active";
  const serverNow = skew == null ? initial.serverNow : now + skew;

  const setView = useCallback((next: ChallengeView | ((cur: ChallengeView) => ChallengeView), serverNow?: number) => {
    setViewRaw(next);
    const at = serverNow ?? (typeof next === "function" ? undefined : next.serverNow);
    if (at) setSkew(at - Date.now());
  }, []);

  useEffect(() => {
    if (!live) return;
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/challenges/${view.id}`, { cache: "no-store" });
        if (res.ok && !stop) {
          const next: ChallengeView = await res.json();
          // A poll that started before our own move landed must not roll the board back.
          setView((cur) => (next.moves.length >= cur.moves.length || next.status !== cur.status ? next : cur), next.serverNow);
        }
      } catch {
        // Try again on the next tick.
      }
    };
    const poll = setInterval(tick, POLL_MS);
    const clock = setInterval(() => {
      setSkew((s) => s ?? initial.serverNow - Date.now());
      setNow(Date.now());
    }, 250);
    return () => {
      stop = true;
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [live, view.id, setView, initial.serverNow]);

  function act(fn: () => Promise<{ error?: string; view?: ChallengeView }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      if (res.view) setView(res.view);
      else router.refresh();
      const fresh = await fetch(`/api/challenges/${view.id}`, { cache: "no-store" });
      if (fresh.ok) setView(await fresh.json());
    });
  }

  function searchAgain() {
    setError(null);
    startTransition(async () => {
      const res = await quickMatchAction(game, view.stage);
      if (res?.error) setError(res.error);
    });
  }

  async function move(m: string) {
    setError(null);
    setSending(true);
    try {
      const res = await playMoveAction(view.id, m);
      if (res.error) setError(res.error);
      if (res.view) setView(res.view);
    } finally {
      setSending(false);
    }
  }

  // ------------------------------------------------ race rounds: live progress out, countdown, auto start
  const [inRound, setInRound] = useState(false);
  const [myLive, setMyLive] = useState<Live | null>(null);
  const progressQueue = useRef<{ last: number; next: Live | null; timer: ReturnType<typeof setTimeout> | null }>({
    last: 0,
    next: null,
    timer: null,
  });
  const onProgress = useCallback(
    (p: Live) => {
      setMyLive(p);
      const q = progressQueue.current;
      q.next = p;
      const send = () => {
        q.timer = null;
        if (!q.next) return;
        const { score, detail } = q.next;
        q.next = null;
        q.last = Date.now();
        reportProgressAction(view.id, score, detail).catch(() => {});
      };
      const wait = q.last + PROGRESS_EVERY_MS - Date.now();
      if (wait <= 0) send();
      else q.timer ??= setTimeout(send, wait);
    },
    [view.id],
  );
  useEffect(() => () => void (progressQueue.current.timer && clearTimeout(progressQueue.current.timer)), []);

  const countdownLeft = view.startedAt != null ? view.startedAt + COUNTDOWN_MS - serverNow : null;
  // Only played when the players arrive while it is running, never on a later visit.
  const [armed, setArmed] = useState(false);
  const iPlay = view.mySide !== null && view.status === "active";
  if (!armed && iPlay && !view.iStarted && countdownLeft != null && countdownLeft > 600) setArmed(true);
  const countdown = armed && countdownLeft != null && countdownLeft > 0;
  const countdownDone = armed && countdownLeft != null && countdownLeft <= 0;

  const Board = PVP_COMPONENTS[game];
  const left = view.deadline ? Math.max(0, Math.ceil((view.deadline - serverNow) / 1000)) : null;
  const clock = left == null ? "" : left >= 60 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : `${left}s`;
  const myTurn = view.status === "active" && view.kind === "turns" && view.mySide === view.turn;
  const shareUrl = typeof window === "undefined" ? "" : `${window.location.origin}/challenge/${view.id}`;
  const iCreated = view.canCancel && view.mySide === null && !view.canAccept;
  const showRunner = view.kind === "race" && view.mySide !== null && ((view.status === "active" && !view.iStarted) || inRound);

  return (
    <div className="flex flex-col gap-4">
      {countdown && countdownLeft != null && <Countdown msLeft={countdownLeft} names={view.names} mySide={view.mySide} />}

      {view.status === "open" && view.quick && iCreated && (
        <Searching waitedMs={serverNow - view.createdAt} stage={view.kind === "race" ? stages[view.stage - 1]?.name : null}>
          <button className="btn-secondary w-full" disabled={pending} onClick={() => act(() => cancelChallengeAction(view.id))}>
            Cancel
          </button>
        </Searching>
      )}

      {view.status === "open" && !(view.quick && iCreated) && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
          {iCreated ? (
            <>
              <p>
                Waiting for {view.invited ? <strong>{view.invited}</strong> : "someone"} to accept. This page updates by itself.
              </p>
              <p className="mt-2 text-white/60">Send this link to a friend so they can join:</p>
              <div className="mt-1 flex gap-2">
                <input readOnly value={shareUrl} className="input flex-1 font-mono text-xs" onFocus={(e) => e.target.select()} />
                <button type="button" className="btn-secondary" onClick={() => navigator.clipboard?.writeText(shareUrl)}>
                  Copy
                </button>
              </div>
            </>
          ) : (
            <p>
              <strong>{view.creator}</strong> {view.quick ? "is looking for an opponent right now." : `challenges ${view.invited ? "you" : "anyone"} to a match.`}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            {view.canAccept && (
              <button className="btn-primary flex-1" disabled={pending} onClick={() => act(() => acceptChallengeAction(view.id))}>
                Accept and play
              </button>
            )}
            {view.canCancel && (
              <button className="btn-secondary flex-1" disabled={pending} onClick={() => act(() => cancelChallengeAction(view.id))}>
                {view.canAccept ? "Decline" : "Cancel challenge"}
              </button>
            )}
          </div>
        </div>
      )}

      {view.status === "cancelled" && (
        <div className="flex flex-col gap-3 rounded-xl bg-white/5 p-4 text-center text-white/70">
          <p>{view.quick ? "You stopped looking, or nobody joined in time." : "This challenge was cancelled."}</p>
          {view.quick && (
            <button className="btn-primary" disabled={pending} onClick={searchAgain}>
              {pending ? "Searching…" : "⚡ Search again"}
            </button>
          )}
        </div>
      )}

      {view.status !== "open" && view.status !== "cancelled" && (
        <>
          {/* Turn-based boards show whose move it is and the clock in their own frame. */}
          {view.status === "active" && view.kind === "race" && (
            <div className="flex items-center justify-between text-sm">
              <span className={myTurn ? "font-semibold text-emerald-300" : "text-white/70"}>
                {view.iPlayed
                    ? "Waiting for the other player to finish"
                    : view.iStarted || inRound
                      ? "Your round is on. Go!"
                      : view.mySide !== null
                        ? "Your round is ready"
                        : "Players are taking their rounds"}
              </span>
              {clock && <span className={`font-mono ${left! < 20 ? "text-red-400" : "text-white/80"}`}>⏱ {clock}</span>}
            </div>
          )}

          {view.kind === "turns" && Board && (
            <GameFrame
              aspect={game === "bao" ? 1.8 : 1}
              help={<HowToPlay game={game} name={name} stages={stages} pvp="turns" />}
              toolbar={
                <span className={myTurn ? "text-sm font-semibold text-emerald-300" : "text-sm text-white/60"}>
                  {view.status === "active" ? (myTurn ? "Your move" : `${view.names[view.turn]} to move`) : "Game over"}
                  {clock && view.status === "active" && <span className="ml-2 font-mono text-white/80">⏱ {clock}</span>}
                </span>
              }
            >
              <MatchFx view={view} />
              <Board
                seed={view.seed}
                moves={view.moves}
                mySide={view.mySide}
                names={view.names}
                onMove={move}
                disabled={sending || !myTurn || countdown}
              />
            </GameFrame>
          )}

          {view.kind === "race" && <RaceBoard view={view} myLive={myLive} ranking={ranking} scoreLabel={scoreLabel} />}
          {showRunner && (
            <GameRunner
              game={game}
              name={name}
              pvp="race"
              stages={stages}
              unlocked={view.stage}
              ranking={ranking}
              scoreLabel={scoreLabel}
              kind={kind}
              tournament={null}
              challenge={{ id: view.id, stage: view.stage }}
              onProgress={onProgress}
              autoStart={countdownDone}
              onStarted={() => setInRound(true)}
            >
              <RaceFx view={view} myLive={myLive} />
            </GameRunner>
          )}
          {view.kind === "race" && view.status === "active" && view.iStarted && !inRound && !view.iPlayed && (
            <p className="rounded-xl bg-white/5 p-3 text-center text-sm text-white/70">
              Your round was started on another page or before a reload, so it can&apos;t be played again here.
            </p>
          )}

          {view.status === "finished" && (
            <div
              className={`rounded-xl p-3 text-center ${
                view.mySide !== null && view.winnerSide === view.mySide ? "bg-emerald-500/15 text-emerald-200" : "bg-white/5 text-white/80"
              }`}
            >
              {view.winnerSide === null
                ? "It's a draw."
                : view.mySide === null
                  ? `${view.names[view.winnerSide]} won.`
                  : view.winnerSide === view.mySide
                    ? "You won! 🎉"
                    : `${view.names[view.winnerSide]} won.`}
              {view.result && <span className="text-white/60"> ({view.result})</span>}
            </div>
          )}

          {view.status === "finished" && view.mySide !== null && view.quick && (
            <button className="btn-primary" disabled={pending} onClick={searchAgain}>
              {pending ? "Searching…" : "⚡ Play online again"}
            </button>
          )}

          {view.status === "active" && view.kind === "turns" && view.mySide !== null && (
            <button
              className="btn-secondary"
              disabled={pending}
              onClick={() => {
                if (confirm("Resign this match? Your opponent wins.")) act(() => resignAction(view.id));
              }}
            >
              Resign
            </button>
          )}
        </>
      )}
      {error && <p className="text-center text-sm text-red-400">{error}</p>}
    </div>
  );
}

/** The waiting screen of "Play online": a pulsing search and how long it has been. */
function Searching({ waitedMs, stage, children }: { waitedMs: number; stage: string | null; children: React.ReactNode }) {
  const s = Math.max(0, Math.floor(waitedMs / 1000));
  const waited = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-emerald-400/20 bg-gradient-to-b from-emerald-500/10 to-sky-500/5 p-6 text-center">
      <style>{`
        @keyframes gm-ping { 0% { transform: scale(.35); opacity: .9 } 100% { transform: scale(1.6); opacity: 0 } }
        @keyframes gm-spin { to { transform: rotate(360deg) } }
      `}</style>
      <div className="relative flex h-36 w-36 items-center justify-center" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="absolute inset-0 rounded-full border-2 border-emerald-400/60"
            style={{ animation: `gm-ping 2.4s ease-out ${i * 0.8}s infinite` }}
          />
        ))}
        <span
          className="absolute inset-3 rounded-full"
          style={{ background: "conic-gradient(from 0deg, rgba(52,211,153,.35), transparent 30%)", animation: "gm-spin 2s linear infinite" }}
        />
        <span className="relative text-4xl">🎮</span>
      </div>
      <div>
        <p className="text-lg font-semibold" role="status">
          Looking for an opponent…
        </p>
        <p className="text-sm text-white/60">
          {stage ? `Stage: ${stage} · ` : ""}waiting <span className="font-mono text-white/80">{waited}</span>
        </p>
        <p className="mt-1 text-xs text-white/50">Keep this page open. The game starts as soon as someone joins.</p>
      </div>
      <div className="w-full max-w-xs">{children}</div>
    </div>
  );
}

/** "Ready?" then 3-2-1 over the whole screen when both players are in. */
function Countdown({ msLeft, names, mySide }: { msLeft: number; names: [string, string]; mySide: 0 | 1 | null }) {
  const n = Math.ceil(msLeft / 1000);
  const text = n > 3 ? "Ready?" : String(Math.max(1, n));
  const opponent = mySide === null ? null : names[mySide === 0 ? 1 : 0];
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm" role="status">
      <style>{`@keyframes gm-count { 0% { transform: scale(1.8); opacity: 0 } 25% { transform: scale(1); opacity: 1 } 85% { opacity: 1 } 100% { transform: scale(.8); opacity: 0 } }`}</style>
      {opponent && <p className="text-sm uppercase tracking-widest text-emerald-300">vs {opponent}</p>}
      <div key={text} className="text-7xl font-black text-white drop-shadow-lg" style={{ animation: "gm-count 1s ease-out both" }}>
        {text}
      </div>
    </div>
  );
}

/** Both players' rounds side by side: live progress while they play, results once the match is over. */
function RaceBoard({
  view,
  myLive,
  ranking,
  scoreLabel,
}: {
  view: ChallengeView;
  myLive: Live | null;
  ranking: "score" | "time";
  scoreLabel: string;
}) {
  const over = view.status === "finished";
  const liveOf = (i: 0 | 1): Live | null => (i === view.mySide && myLive ? myLive : view.rounds[i].live);
  const scores = ([0, 1] as const).map((i) => liveOf(i)?.score ?? 0);
  const top = Math.max(1, ...scores);
  const final = (i: 0 | 1) => {
    const r = view.rounds[i];
    if (!r.played) return "Didn't play";
    if (!r.valid) return "Didn't count";
    const time = r.timeMs != null ? `${(r.timeMs / 1000).toFixed(1)}s` : "";
    if (ranking === "score") return `${(r.score ?? 0).toLocaleString()} ${scoreLabel} · ${time}`;
    return r.cleared ? time : "Not cleared";
  };
  return (
    <div className="grid grid-cols-2 gap-2 text-sm">
      {([0, 1] as const).map((i) => {
        const r = view.rounds[i];
        const l = liveOf(i);
        const state = r.played ? "Finished ✓" : r.started || (i === view.mySide && myLive) ? "Playing…" : "Not started";
        return (
          <div key={i} className={`rounded-xl border p-3 ${view.winnerSide === i && over ? "border-emerald-400/60" : "border-white/10"}`}>
            <div className="truncate font-semibold">
              {view.names[i]}
              {view.mySide === i && <span className="text-white/50"> (you)</span>}
            </div>
            {over ? (
              <div className="text-white/70">{final(i)}</div>
            ) : (
              <>
                <div className={`text-xs ${state === "Playing…" ? "animate-pulse text-sky-300" : r.played ? "text-emerald-300" : "text-white/50"}`}>
                  {state}
                </div>
                {view.status === "active" && (
                  <>
                    <div className="mt-1 font-mono text-lg tabular-nums">{(l?.score ?? 0).toLocaleString()}</div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${i === view.mySide ? "bg-emerald-400" : "bg-sky-400"}`}
                        style={{ width: `${Math.round(((l?.score ?? 0) / top) * 100)}%` }}
                      />
                    </div>
                    {l?.detail && <div className="mt-1 truncate text-xs text-white/60">{l.detail}</div>}
                  </>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Popups during a race: the opponent starts, overtakes you, or finishes. */
function RaceFx({ view, myLive }: { view: ChallengeView; myLive: Live | null }) {
  const fx = useGameFx();
  const opp = view.mySide === null ? null : view.mySide === 0 ? 1 : 0;
  const theirs = opp === null ? null : view.rounds[opp];
  const name = opp === null ? "" : view.names[opp];
  const seen = useRef({ started: theirs?.started ?? false, played: theirs?.played ?? false, lead: 0 });
  useEffect(() => {
    if (!theirs || view.status !== "active") return;
    const s = seen.current;
    if (theirs.started && !s.started) fx.pop(`${name} started`, { tone: "info", emoji: "🏁", ms: 1600 });
    if (theirs.played && !s.played) fx.pop(`${name} finished`, { tone: "warn", emoji: "⏱", sub: view.iPlayed ? undefined : "Beat their result!", ms: 2000 });
    s.started = theirs.started;
    s.played = theirs.played;
    const mine = myLive?.score ?? 0;
    const them = theirs.live?.score ?? 0;
    const lead = them > mine ? -1 : mine > them ? 1 : s.lead;
    if (!view.iPlayed && lead !== s.lead && mine + them > 0) {
      if (lead < 0) fx.pop(`${name} overtook you!`, { tone: "bad", emoji: "😱", ms: 1500 });
      else if (s.lead < 0) fx.pop("You're ahead!", { tone: "good", emoji: "💪", ms: 1300 });
    }
    s.lead = lead;
  }, [theirs?.started, theirs?.played, theirs?.live?.score, myLive?.score, view.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const wasOver = useRef(view.status === "finished");
  useEffect(() => {
    if (wasOver.current || view.status !== "finished") return;
    wasOver.current = true;
    if (view.mySide !== null && view.winnerSide === view.mySide) {
      fx.confetti(120);
      fx.pop("You won the race!", { tone: "great", emoji: "🏆", sub: view.result ?? undefined, ms: 2600 });
    } else if (view.winnerSide === null) fx.pop("Draw", { tone: "info", emoji: "🤝", ms: 2400 });
    else fx.pop(`${view.names[view.winnerSide]} wins`, { tone: "warn", sub: view.result ?? undefined, ms: 2400 });
  }, [view.status]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** Turn and result popups for a two-player board. */
function MatchFx({ view }: { view: ChallengeView }) {
  const fx = useGameFx();
  const myTurn = view.status === "active" && view.mySide === view.turn;
  const seenMoves = useRef(view.moves.length);
  const seenStatus = useRef(view.status);
  useEffect(() => {
    if (view.moves.length > seenMoves.current && myTurn) fx.pop("Your move", { tone: "info", emoji: "👉", ms: 1000 });
    seenMoves.current = view.moves.length;
  }, [view.moves.length, myTurn]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (seenStatus.current !== "finished" && view.status === "finished") {
      if (view.mySide !== null && view.winnerSide === view.mySide) {
        fx.confetti(120);
        fx.pop("You won!", { tone: "great", emoji: "🏆", sub: view.result ?? undefined, ms: 2500 });
      } else if (view.winnerSide === null) fx.pop("Draw", { tone: "info", emoji: "🤝", sub: view.result ?? undefined, ms: 2500 });
      else fx.pop(`${view.names[view.winnerSide]} wins`, { tone: "warn", sub: view.result ?? undefined, ms: 2500 });
    }
    seenStatus.current = view.status;
  }, [view.status]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
