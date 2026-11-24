"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { giveUpRunAction, startGameAction, startRunAction, submitGameAction } from "@/app/actions";
import { GameFrame, useGameFx } from "@/components/games/fx/GameFx";
import { HowToPlay } from "@/components/games/guide/HowToPlay";
import { aspectOf, GAME_COMPONENTS } from "@/components/games/registry";
import type { ArcadeKey, Stage } from "@/lib/games/arcade/types";

type Props = {
  game: ArcadeKey;
  name: string;
  pvp: "turns" | "race";
  stages: Stage[];
  kind: "solo" | "versus";
  /** Each level's clock, in ms. */
  limits: number[];
  /** What the next run costs (0 when runs are free). */
  fee: number;
  balance: number | null;
  signedIn: boolean;
  /** The player's run in progress, from the server. */
  active: { runId: string; stage: number; points: number; open: { stage: number } | null } | null;
};

type LevelResult = { valid: boolean; cleared: boolean; detail?: string; timeMs: number; points: number; total: number; over: boolean; nextStage: number | null };

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const kes = (n: number) => `KES ${n.toLocaleString("en-KE")}`;

export function RunPanel({ game, name, pvp, stages, kind, limits, fee, balance, signedIn, active }: Props) {
  const router = useRouter();
  const [run, setRun] = useState(active ? { id: active.runId, stage: active.stage, points: active.points } : null);
  const [stuck, setStuck] = useState(active?.open ?? null);
  const [session, setSession] = useState<{ id: string; seed: number; stage: number; deadline: number } | null>(null);
  const [result, setResult] = useState<LevelResult | null>(null);
  const [finished, setFinished] = useState<{ total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [pending, startTransition] = useTransition();
  const Game = GAME_COMPONENTS[game];
  const playing = !!session && !result;
  const levels = stages.length;

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [playing]);

  const left = session ? session.deadline - now : 0;
  const timeUp = playing && now > 0 && left <= 0;

  function pay() {
    setError(null);
    startTransition(async () => {
      const res = await startRunAction(game);
      if ("error" in res) return setError(res.error);
      setRun({ id: res.runId, stage: 1, points: 0 });
      setFinished(null);
      setResult(null);
      setSession(null);
      router.refresh();
    });
  }

  function startLevel() {
    if (!run) return;
    setError(null);
    startTransition(async () => {
      const res = await startGameAction(game, run.stage, null, null, run.id);
      if ("error" in res) return setError(res.error);
      setResult(null);
      setNow(Date.now());
      setSession({ id: res.sessionId, seed: res.seed, stage: res.stage, deadline: Date.now() + limits[res.stage - 1] });
    });
  }

  function finish(input: string) {
    if (!session || result) return;
    const id = session.id;
    const outOfTime = timeUp;
    startTransition(async () => {
      const res = await submitGameAction(id, input);
      if ("error" in res) return setError(res.error);
      const r = res.run ?? { points: 0, total: run?.points ?? 0, over: true, nextStage: null };
      const detail = outOfTime && !res.cleared ? "Out of time" : res.detail;
      setResult({ valid: res.valid, cleared: res.cleared, detail, timeMs: res.timeMs, ...r });
      if (r.over) {
        setFinished({ total: r.total });
        setRun(null);
        router.refresh();
      } else setRun((x) => (x ? { ...x, stage: r.nextStage!, points: r.total } : x));
    });
  }

  function giveUp() {
    if (!run) return;
    startTransition(async () => {
      const res = await giveUpRunAction(run.id, game);
      if ("error" in res) return setError(res.error);
      setFinished({ total: run.points });
      setRun(null);
      setStuck(null);
      setSession(null);
      router.refresh();
    });
  }

  const level = session?.stage ?? run?.stage ?? 1;
  const feeText = fee > 0 ? kes(fee) : "Free";
  const short = balance != null && fee > balance;

  return (
    <div className="flex flex-col gap-3">
      {run && (
        <div className="flex items-center gap-2">
          {stages.map((s, i) => {
            const n = i + 1;
            const done = n < level || (n === level && !!result?.cleared);
            return (
              <div
                key={n}
                title={`Level ${n}: ${s.name}`}
                className={`h-2 flex-1 rounded-full ${done ? "bg-mint" : n === level ? "bg-brand-violet animate-pulse" : "bg-white/10"}`}
              />
            );
          })}
        </div>
      )}

      {(run || session) && (
        <p className="text-sm text-white/70">
          <strong>
            Level {level} of {levels}: {stages[level - 1]?.name}.
          </strong>{" "}
          {stages[level - 1]?.goal} · {clock(limits[level - 1])} on the clock
        </p>
      )}

      <GameFrame
        aspect={aspectOf(game)}
        help={<HowToPlay game={game} name={name} stages={stages} pvp={pvp} />}
        toolbar={
          session ? (
            <div className="flex justify-between font-mono text-sm">
              <span className={!result && left < 30_000 ? "animate-pulse font-bold text-red-300" : "text-white/80"}>
                ⏱ {result ? "Done" : clock(left)}
              </span>
              <span className="text-amber-200">{(result?.total ?? run?.points ?? 0).toLocaleString()} pts</span>
            </div>
          ) : (
            <span className="text-sm text-white/50">Weekly leaderboard</span>
          )
        }
      >
        <LevelFx result={result} sessionId={session?.id ?? null} level={level} kind={kind} />
        {session ? (
          <div className={result ? "pointer-events-none opacity-60" : ""}>
            <Game key={session.id} seed={session.seed} stage={session.stage} onFinish={finish} timeUp={timeUp} />
          </div>
        ) : (
          <div className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-gradient-to-br from-brand-violet/15 via-sky-500/5 to-mint/10 p-6 text-center text-white/70">
            <span className="text-4xl" aria-hidden>🏆</span>
            {run ? `Level ${run.stage} is ready. The clock starts when you press Start.` : `Play all ${levels} levels. Your points add up to your score.`}
          </div>
        )}
      </GameFrame>

      {result && (
        <div className={`rounded-xl p-3 text-center ${result.cleared ? "bg-emerald-500/15 text-emerald-200" : "bg-amber-500/15 text-amber-200"}`}>
          {!result.valid
            ? `That level didn't count${result.detail ? `: ${result.detail}` : "."}`
            : `${result.cleared ? (kind === "versus" ? "You won the level!" : "Level cleared!") : result.detail ?? "Not cleared."} +${result.points.toLocaleString()} points.`}
          {finished && (
            <div className="mt-1 font-semibold">
              Run over: {finished.total.toLocaleString()} points{result.over && result.cleared ? ". Every level cleared! 🎉" : "."}
            </div>
          )}
        </div>
      )}
      {!result && finished && (
        <div className="rounded-xl bg-amber-500/15 p-3 text-center text-amber-200">Run over: {finished.total.toLocaleString()} points.</div>
      )}
      {error && <p className="text-center text-sm text-red-400">{error}</p>}

      {!signedIn ? (
        <Link href={`/login?next=/leaderboards/${game}`} className="btn-primary text-center">Sign in to play</Link>
      ) : stuck && run ? (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          <p>
            Level {stuck.stage} is still running from before, so it can&apos;t be finished now. Give it up to end this run with{" "}
            {run.points.toLocaleString()} points, or wait for its clock to run out.
          </p>
          <button onClick={giveUp} disabled={pending} className="btn-secondary mt-2 w-full">Give up level {stuck.stage}</button>
        </div>
      ) : run && !playing ? (
        <div className="flex gap-2">
          <button onClick={startLevel} disabled={pending} className="btn-primary flex-1">
            {pending ? "Loading…" : `Start level ${run.stage}`}
          </button>
          {run.stage > 1 && (
            <button onClick={giveUp} disabled={pending} className="btn-secondary">End run</button>
          )}
        </div>
      ) : !run && !playing ? (
        <div className="flex flex-col gap-1">
          <button onClick={pay} disabled={pending || short} className="btn-primary">
            {pending ? "Loading…" : `${finished ? "Play again" : "Play for the leaderboard"} · ${feeText}`}
          </button>
          {short && <p className="text-center text-sm text-red-300">You need {kes(fee)} in your wallet.</p>}
        </div>
      ) : null}
    </div>
  );
}

function LevelFx({ result, sessionId, level, kind }: { result: LevelResult | null; sessionId: string | null; level: number; kind: "solo" | "versus" }) {
  const fx = useGameFx();
  useEffect(() => {
    if (sessionId) fx.pop("Go!", { tone: "good", emoji: "🚀", sub: `Level ${level}`, ms: 1000 });
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!result) return;
    if (result.cleared) {
      fx.confetti(result.over ? 140 : 60);
      fx.pop(result.over ? "All levels cleared!" : kind === "versus" ? "Level won!" : "Level cleared!", { tone: "great", emoji: "🏆", sub: `+${result.points.toLocaleString()} pts`, ms: 2000 });
    } else fx.pop(result.detail === "Out of time" ? "Time's up" : "Run over", { tone: "warn", emoji: "⏰", sub: `${result.total.toLocaleString()} pts total` });
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
