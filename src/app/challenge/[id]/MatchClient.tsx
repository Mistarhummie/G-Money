"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { acceptChallengeAction, cancelChallengeAction, playMoveAction, resignAction } from "@/app/actions";
import { PVP_COMPONENTS } from "@/components/games/pvp/registry";
import type { ChallengeView } from "@/lib/challenges";
import type { ArcadeKey, Stage } from "@/lib/games/arcade/types";
import { GameRunner } from "@/app/play/[game]/GameRunner";

type Props = {
  initial: ChallengeView;
  game: ArcadeKey;
  stages: Stage[];
  ranking: "score" | "time";
  scoreLabel: string;
  kind: "solo" | "versus";
};

const POLL_MS = 2000;

export function MatchClient({ initial, game, stages, ranking, scoreLabel, kind }: Props) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [pending, startTransition] = useTransition();
  const live = view.status === "open" || view.status === "active";

  useEffect(() => {
    if (!live) return;
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/challenges/${view.id}`, { cache: "no-store" });
        if (res.ok && !stop) {
          const next: ChallengeView = await res.json();
          // A poll that started before our own move landed must not roll the board back.
          setView((cur) => (next.moves.length >= cur.moves.length || next.status !== cur.status ? next : cur));
        }
      } catch {
        // Try again on the next tick.
      }
    };
    const poll = setInterval(tick, POLL_MS);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stop = true;
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [live, view.id]);

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

  const Board = PVP_COMPONENTS[game];
  const left = view.deadline ? Math.max(0, Math.ceil((view.deadline - now) / 1000)) : null;
  const clock = left == null ? "" : left >= 60 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : `${left}s`;
  const myTurn = view.status === "active" && view.kind === "turns" && view.mySide === view.turn;
  const shareUrl = typeof window === "undefined" ? "" : `${window.location.origin}/challenge/${view.id}`;

  return (
    <div className="flex flex-col gap-4">
      {view.status === "open" && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
          {view.canCancel && view.mySide === null && !view.canAccept ? (
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
              <strong>{view.creator}</strong> challenges {view.invited ? "you" : "anyone"} to a match.
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

      {view.status === "cancelled" && <p className="rounded-xl bg-white/5 p-3 text-center text-white/70">This challenge was cancelled.</p>}

      {view.status !== "open" && view.status !== "cancelled" && (
        <>
          {view.status === "active" && (
            <div className="flex items-center justify-between text-sm">
              <span className={myTurn ? "font-semibold text-emerald-300" : "text-white/70"}>
                {view.kind === "turns"
                  ? myTurn
                    ? "Your move"
                    : `${view.names[view.turn]} to move`
                  : view.iPlayed
                    ? "Waiting for the other player's round"
                    : view.mySide !== null
                      ? "Your round is ready"
                      : "Players are taking their rounds"}
              </span>
              {clock && <span className={`font-mono ${left! < 20 ? "text-red-400" : "text-white/80"}`}>⏱ {clock}</span>}
            </div>
          )}

          {view.kind === "turns" && Board && (
            <Board
              seed={view.seed}
              moves={view.moves}
              mySide={view.mySide}
              names={view.names}
              onMove={move}
              disabled={sending || !myTurn}
            />
          )}

          {view.kind === "race" && (
            <RaceSummary view={view} ranking={ranking} scoreLabel={scoreLabel} />
          )}
          {view.kind === "race" && view.status === "active" && view.mySide !== null && !view.iPlayed && (
            <GameRunner
              game={game}
              stages={stages}
              unlocked={view.stage}
              ranking={ranking}
              scoreLabel={scoreLabel}
              kind={kind}
              tournament={null}
              challenge={{ id: view.id, stage: view.stage }}
            />
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

function RaceSummary({ view, ranking, scoreLabel }: { view: ChallengeView; ranking: "score" | "time"; scoreLabel: string }) {
  const show = (i: 0 | 1) => {
    const r = view.rounds[i];
    if (!r.played) return view.status === "finished" ? "Didn't play" : "Not played yet";
    if (view.status !== "finished") return "Played ✓";
    if (!r.valid) return "Didn't count";
    const time = r.timeMs != null ? `${(r.timeMs / 1000).toFixed(1)}s` : "";
    if (ranking === "score") return `${(r.score ?? 0).toLocaleString()} ${scoreLabel} · ${time}`;
    return r.cleared ? time : "Not cleared";
  };
  return (
    <div className="grid grid-cols-2 gap-2 text-sm">
      {([0, 1] as const).map((i) => (
        <div key={i} className={`rounded-xl border p-3 ${view.winnerSide === i ? "border-emerald-400/60" : "border-white/10"}`}>
          <div className="font-semibold">
            {view.names[i]}
            {view.mySide === i && <span className="text-white/50"> (you)</span>}
          </div>
          <div className="text-white/70">{show(i)}</div>
        </div>
      ))}
    </div>
  );
}
