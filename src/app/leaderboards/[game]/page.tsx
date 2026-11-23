import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, kes } from "@/components/ui";
import { getDb } from "@/db";
import { kindOf } from "@/lib/challenges";
import { ARCADE, isArcadeKey } from "@/lib/games/arcade";
import {
  FIRST_RUN_KES,
  levelLimitMs,
  previousWeek,
  REPLAY_KES,
  weekBounds,
  weekLabel,
  weekOf,
  WEEKLY_FEE_PERCENT,
  weeklySplit,
  WEEKLY_SPLIT,
} from "@/lib/games/weekly-rules";
import { distributePrizes } from "@/lib/payouts";
import { getCurrentUser } from "@/lib/session";
import { accountBalance, ensureTestFunds, walletOf } from "@/lib/wallet";
import { activeRun, myRuns, nextRunFee, runLevels, settledWeek, settleDueWeeks, weeklyBoard, weeklyPaid, weekPot } from "@/lib/weekly";
import { RunPanel } from "./RunPanel";

export const dynamic = "force-dynamic";

const PLACE = ["🥇", "🥈", "🥉"];
const mins = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.round((ms / 60_000) * 10) / 10} min`);

export default async function GameLeaderboardPage({ params }: { params: Promise<{ game: string }> }) {
  const { game: key } = await params;
  if (!isArcadeKey(key)) notFound();
  const game = ARCADE[key];
  const db = await getDb();
  const now = new Date();
  await settleDueWeeks(db, now).catch((err) => console.error("weekly payout failed", err));
  const user = await getCurrentUser();
  const week = weekOf(now);
  const paid = weeklyPaid();
  if (user) await ensureTestFunds(db, user.id);

  const [board, pot, last, active, fee, balance, mine] = await Promise.all([
    weeklyBoard(db, key, week),
    weekPot(db, key, week),
    settledWeek(db, key, previousWeek(week)),
    user ? activeRun(db, user.id, key, now) : null,
    user ? nextRunFee(db, user.id, key, now) : paid ? FIRST_RUN_KES : 0,
    user && paid ? accountBalance(db, walletOf(user.id)) : null,
    user ? myRuns(db, user.id, key, week) : [],
  ]);
  const myBest = mine.filter((r) => r.status === "finished").sort((a, b) => b.points - a.points)[0];
  const myLevels = myBest ? await runLevels(db, myBest.id) : [];
  const split = weeklySplit(Math.max(board.length, 3));
  const prizes = distributePrizes(pot.poolKes, split);
  const hoursLeft = Math.max(0, Math.round((weekBounds(week).end.getTime() - now.getTime()) / 3_600_000));
  const limits = game.stages.map((_, i) => levelLimitMs(key, i + 1));
  const myRank = user ? board.find((r) => r.userId === user.id)?.rank : undefined;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <div>
        <Link href="/leaderboards" className="text-sm text-white/60 hover:text-white">← All leaderboards</Link>
        <h1 className="text-2xl font-bold">{game.name}: weekly leaderboard</h1>
        <p className="text-sm text-white/70">
          {weekLabel(week)} · closes Sunday midnight, {hoursLeft >= 24 ? `${Math.floor(hoursLeft / 24)} days ${hoursLeft % 24} h` : `${hoursLeft} h`} left
        </p>
      </div>

      {paid && (
        <Card className="border-amber-300/20">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">Prize pool</h2>
            <span className="text-2xl font-black text-amber-200">{kes(pot.poolKes)}</span>
          </div>
          <p className="text-sm text-white/60">
            {pot.players} {pot.players === 1 ? "player" : "players"}, {pot.runs} {pot.runs === 1 ? "run" : "runs"}. Entry fees go into the pool; we keep{" "}
            {WEEKLY_FEE_PERCENT}%.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
            {WEEKLY_SPLIT.map((pct, i) => (
              <div key={i} className="rounded-xl bg-white/5 p-2">
                <div className="text-xl" aria-hidden>{PLACE[i]}</div>
                <div className="font-semibold">{kes(prizes[i] ?? 0)}</div>
                <div className="text-xs text-white/50">{pct}%</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <RunPanel
        game={key}
        name={game.name}
        pvp={kindOf(game)}
        stages={game.stages}
        kind={game.kind}
        limits={limits}
        fee={fee}
        balance={balance}
        signedIn={!!user}
        active={active ? { runId: active.run.id, stage: active.run.stage, points: active.run.points, open: active.open ? { stage: active.open.stage } : null } : null}
      />

      <Card>
        <h2 className="mb-2 font-semibold">This week&apos;s top players</h2>
        {board.length === 0 ? (
          <p className="text-sm text-white/60">Nobody has finished a run yet. Be the first.</p>
        ) : (
          <ol className="flex flex-col gap-1 text-sm">
            {board.slice(0, 25).map((r) => (
              <li
                key={r.userId}
                className={`flex items-center justify-between rounded-lg px-2 py-1 ${r.userId === user?.id ? "bg-mint/10" : ""} ${r.rank <= 3 ? "font-semibold" : ""}`}
              >
                <span>
                  <span className="mr-2 inline-block w-6 text-white/50">{PLACE[r.rank - 1] ?? `${r.rank}.`}</span>
                  {r.username ?? "Player"}
                  {r.userId === user?.id && <span className="text-white/50"> (you)</span>}
                </span>
                <span className="font-mono">{r.points.toLocaleString()} pts</span>
              </li>
            ))}
          </ol>
        )}
        {myRank && myRank > 25 && <p className="mt-2 text-sm text-white/60">You are #{myRank}.</p>}
      </Card>

      {myBest && (
        <Card>
          <h2 className="mb-2 font-semibold">Your best run this week: {myBest.points.toLocaleString()} pts</h2>
          <ul className="text-sm">
            {game.stages.map((s, i) => {
              const l = myLevels.find((x) => x.stage === i + 1);
              return (
                <li key={i} className="flex justify-between">
                  <span>
                    {l ? (l.cleared ? "✅" : "❌") : "⬜"} Level {i + 1}: {s.name}
                  </span>
                  <span className="font-mono">{l ? `${(l.points ?? 0).toLocaleString()} pts` : "—"}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-white/50">
            {mine.length} {mine.length === 1 ? "run" : "runs"} this week. Only your best run counts.
            {myBest.flagged && " This run was flagged for review because it looked faster than a person can play."}
          </p>
        </Card>
      )}

      <Card>
        <h2 className="mb-2 font-semibold">How it works</h2>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-white/75">
          <li>
            {paid ? (
              <>
                Your first run each week costs {kes(FIRST_RUN_KES)}. Each run after that costs {kes(REPLAY_KES)}.
              </>
            ) : (
              <>Runs are free while paid entry is switched off, and there are no prizes.</>
            )}
          </li>
          <li>A run is all {game.stages.length} levels in order. Points from every level add up to your score, and your best run of the week counts.</li>
          <li>Each level has a clock: {limits.map(mins).join(", ")}. Finishing faster earns bonus points.</li>
          <li>Not clearing a level ends the run, keeping the points you have.</li>
          {paid && (
            <li>
              The week closes Sunday at midnight, Nairobi time. The top 3 share the pool {WEEKLY_SPLIT.join("/")} after our {WEEKLY_FEE_PERCENT}% (60/40 if only two
              players finish a run). Prizes go to your wallet. If nobody finishes a run, everyone gets their entry back.
            </li>
          )}
          <li>Pure skill: everyone gets fresh, fair boards, and every result is checked by replaying your moves.</li>
        </ul>
      </Card>

      {last && last.winners.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold">Last week&apos;s winners ({weekLabel(last.week)})</h2>
          <ol className="text-sm">
            {last.winners.map((w) => (
              <li key={w.rank} className="flex justify-between">
                <span>
                  {PLACE[w.rank - 1]} {w.username ?? "Player"} · {w.points.toLocaleString()} pts
                </span>
                {w.prizeKes > 0 && <span className="font-mono text-amber-200">{kes(w.prizeKes)}</span>}
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}
