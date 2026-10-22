"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { startGameAction, submitGameAction } from "@/app/actions";
import { GameFrame, useGameFx } from "@/components/games/fx/GameFx";
import { HowToPlay } from "@/components/games/guide/HowToPlay";
import { GAME_COMPONENTS } from "@/components/games/registry";
import type { ArcadeKey, Stage } from "@/lib/games/arcade/types";

type Props = {
  game: ArcadeKey;
  name: string;
  /** How two-player matches of this game work, for the guide. */
  pvp: "turns" | "race";
  stages: Stage[];
  unlocked: number;
  ranking: "score" | "time";
  scoreLabel: string;
  kind: "solo" | "versus";
  /** Tournament attempts play the tournament's stage only. */
  tournament: { id: string; stage: number } | null;
  /** A match round against another player: one go, on the match's stage. */
  challenge?: { id: string; stage: number } | null;
};

type Result = { valid: boolean; cleared: boolean; score: number; timeMs: number; flagged: boolean; detail?: string; unlockedStage?: number };

export function GameRunner({ game, name, pvp, stages, unlocked, ranking, scoreLabel, kind, tournament, challenge = null }: Props) {
  const router = useRouter();
  const [stage, setStage] = useState(challenge?.stage ?? tournament?.stage ?? unlocked);
  const [session, setSession] = useState<{ id: string; seed: number; stage: number; startedAt: number } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [pending, startTransition] = useTransition();
  const Game = GAME_COMPONENTS[game];
  const playing = !!session && !result;

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, [playing]);

  function start(which: number) {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await startGameAction(game, which, tournament?.id ?? null, challenge?.id ?? null);
      if ("error" in res) return setError(res.error);
      setStage(res.stage);
      setSession({ id: res.sessionId, seed: res.seed, stage: res.stage, startedAt: Date.now() });
      setNow(Date.now());
    });
  }

  function finish(input: string) {
    if (!session || result) return;
    const id = session.id;
    startTransition(async () => {
      const res = await submitGameAction(id, input);
      if ("error" in res) setError(res.error);
      else setResult(res);
      router.refresh();
    });
  }

  const elapsed = session ? ((result ? result.timeMs : now - session.startedAt) / 1000).toFixed(1) : "0.0";
  const current = stages[stage - 1];

  return (
    <div className="flex flex-col gap-4">
      {!tournament && !challenge && (
        <div className="flex flex-wrap gap-2">
          {stages.map((s, i) => {
            const n = i + 1;
            const locked = n > unlocked;
            return (
              <button
                key={n}
                type="button"
                disabled={locked || playing}
                onClick={() => setStage(n)}
                className={`rounded-full border px-3 py-1 text-sm ${stage === n ? "border-emerald-400 bg-emerald-500/20" : "border-white/15"} disabled:opacity-40`}
                title={locked ? `Clear stage ${n - 1} to unlock` : s.goal}
              >
                {locked ? "🔒 " : ""}
                {n}. {s.name}
              </button>
            );
          })}
        </div>
      )}
      <p className="text-sm text-white/70">
        <strong>Stage {stage}:</strong> {current?.goal}
      </p>

      <GameFrame
        aspect={game === "bao" ? 1.8 : 1}
        help={<HowToPlay game={game} name={name} stages={stages} pvp={pvp} />}
        toolbar={
          session ? (
            <div className="flex justify-between font-mono text-sm text-white/80">
              <span>⏱ {elapsed}s</span>
              {pending && !result && <span>Checking…</span>}
            </div>
          ) : (
            <span className="text-sm text-white/50">Stage {stage}</span>
          )
        }
      >
        <ResultFx result={result} kind={kind} sessionId={session?.id ?? null} stage={stage} />
        {session ? (
          <div className={result ? "pointer-events-none opacity-60" : ""}>
            <Game key={session.id} seed={session.seed} stage={session.stage} onFinish={finish} />
          </div>
        ) : (
          <div className="flex aspect-square items-center justify-center rounded-2xl border border-dashed border-white/15 bg-gradient-to-br from-emerald-500/10 via-sky-500/5 to-fuchsia-500/10 text-white/60">
            Press start to play
          </div>
        )}
      </GameFrame>

      {result && (
        <div
          className={`rounded-xl p-3 text-center ${
            result.cleared && !result.flagged ? "bg-emerald-500/15 text-emerald-200" : "bg-amber-500/15 text-amber-200"
          }`}
        >
          {!result.valid
            ? `That game didn't count${result.detail ? `: ${result.detail}` : "."}`
            : result.cleared
              ? `${kind === "versus" ? "You won!" : "Stage cleared!"} ${ranking === "score" ? `${result.score.toLocaleString()} ${scoreLabel} · ` : ""}${(result.timeMs / 1000).toFixed(1)}s`
              : `${kind === "versus" ? "The computer won this time." : "Not cleared."}${ranking === "score" ? ` ${result.score.toLocaleString()} ${scoreLabel}.` : ""}${result.detail ? ` ${result.detail}.` : ""}`}
          {result.flagged && " It was flagged for review because it looked faster than a person can play."}
          {result.unlockedStage && <div className="mt-1 font-semibold">Stage {result.unlockedStage} unlocked 🎉</div>}
        </div>
      )}
      {error && <p className="text-center text-sm text-red-400">{error}</p>}

      {!playing && !(challenge && session) && (
        <div className="flex gap-2">
          <button onClick={() => start(stage)} disabled={pending} className="btn-primary flex-1">
            {pending ? "Loading…" : session ? "Play again" : challenge ? "Start my round" : "Start"}
          </button>
          {result?.unlockedStage && !tournament && !challenge && (
            <button onClick={() => start(result.unlockedStage!)} disabled={pending} className="btn-secondary flex-1">
              Next stage
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Celebrates or commiserates once a game's result comes back. */
function ResultFx({ result, kind, sessionId, stage }: { result: Result | null; kind: "solo" | "versus"; sessionId: string | null; stage: number }) {
  const fx = useGameFx();
  useEffect(() => {
    if (sessionId) fx.pop("Go!", { tone: "good", emoji: "🚀", sub: `Stage ${stage}`, ms: 1000 });
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!result) return;
    if (!result.valid) fx.pop("Didn't count", { tone: "bad", emoji: "⚠️", sub: result.detail });
    else if (result.cleared) {
      fx.confetti(result.unlockedStage ? 120 : 70);
      fx.pop(kind === "versus" ? "You won!" : "Stage cleared!", { tone: "great", emoji: "🏆", ms: 2200 });
      if (result.unlockedStage) setTimeout(() => fx.pop(`Stage ${result.unlockedStage} unlocked`, { tone: "info", emoji: "🔓", ms: 2000 }), 700);
    } else fx.pop(kind === "versus" ? "The computer won" : "So close!", { tone: "warn", emoji: "💪", sub: "Try again" });
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
