"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { createChallengeAction, quickMatchAction } from "@/app/actions";
import type { Stage } from "@/lib/games/arcade/types";

/** Start a match: open to anyone, or sent to one player by username. */
export function NewChallengeForm({ game, stages, race }: { game: string; stages: Stage[]; race: boolean }) {
  const [state, action, pending] = useActionState(createChallengeAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-2 text-sm">
      <input type="hidden" name="game" value={game} />
      <label className="label">
        Opponent&apos;s username (leave empty for anyone)
        <input name="opponent" className="input" placeholder="e.g. otieno" autoComplete="off" />
      </label>
      {race && (
        <label className="label">
          Stage
          <select name="stage" className="input" defaultValue="1">
            {stages.map((s, i) => (
              <option key={i} value={i + 1}>
                {i + 1}. {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <button className="btn-primary" disabled={pending}>{pending ? "Creating…" : "Create challenge"}</button>
      {state?.error && <p className="text-red-400">{state.error}</p>}
    </form>
  );
}

/** Live "3 waiting · 4 playing now" line. */
export function LiveCount({ waiting, playing, className = "" }: { waiting: number; playing: number; className?: string }) {
  const any = waiting + playing > 0;
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className={`inline-block h-2 w-2 rounded-full ${any ? "animate-pulse bg-emerald-400" : "bg-white/30"}`} />
      {any ? (
        <span>
          {waiting > 0 && `${waiting} waiting`}
          {waiting > 0 && playing > 0 && " · "}
          {playing > 0 && `${playing} playing now`}
        </span>
      ) : (
        <span>Nobody online yet</span>
      )}
    </span>
  );
}

/**
 * "Play online": pairs you with someone waiting for this game right now (same stage for races),
 * or puts you on the waiting screen until someone joins.
 */
export function PlayOnline({
  game,
  stages,
  race,
  signedIn,
  waiting,
  playing,
  waitingByStage,
}: {
  game: string;
  stages: Stage[];
  race: boolean;
  signedIn: boolean;
  waiting: number;
  playing: number;
  waitingByStage: Record<number, number>;
}) {
  const busiest = Object.entries(waitingByStage).sort((a, b) => b[1] - a[1])[0];
  const [stage, setStage] = useState(busiest ? Number(busiest[0]) : 1);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function go() {
    setError(null);
    startTransition(async () => {
      const res = await quickMatchAction(game, race ? stage : 1);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-500/15 via-sky-500/10 to-fuchsia-500/10 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">Play online</h2>
          <p className="text-xs text-white/60">
            {race ? "Race a real person on the same board, live." : "Play a real person, move by move, live."}
          </p>
        </div>
        <LiveCount waiting={waiting} playing={playing} className="shrink-0 text-xs text-white/70" />
      </div>
      {race && (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Stage">
          {stages.map((s, i) => {
            const n = i + 1;
            const w = waitingByStage[n] ?? 0;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={stage === n}
                onClick={() => setStage(n)}
                className={`rounded-full border px-2.5 py-1 text-xs ${stage === n ? "border-emerald-400 bg-emerald-500/20" : "border-white/15"}`}
                title={s.goal}
              >
                {n}. {s.name}
                {w > 0 && <span className="ml-1 rounded-full bg-emerald-400 px-1.5 font-semibold text-emerald-950">{w}</span>}
              </button>
            );
          })}
        </div>
      )}
      {signedIn ? (
        <button type="button" onClick={go} disabled={pending} className="btn-primary py-3 text-base font-bold">
          {pending ? "Finding a player…" : `⚡ Play online${race ? ` · stage ${stage}` : ""}`}
        </button>
      ) : (
        <Link href={`/login?next=/play/${game}`} className="btn-primary py-3 text-center text-base font-bold">
          Sign in to play online
        </Link>
      )}
      {error && <p className="text-center text-sm text-red-400">{error}</p>}
    </div>
  );
}
