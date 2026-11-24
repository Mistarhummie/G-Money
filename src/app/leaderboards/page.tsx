import Link from "next/link";
import { Card, kes } from "@/components/ui";
import { POSTER_ART } from "@/components/posters/art";
import { getDb } from "@/db";
import { ARCADE, ARCADE_KEYS } from "@/lib/games/arcade";
import { FIRST_RUN_KES, previousWeek, REPLAY_KES, weekBounds, weekLabel, weekOf, WEEKLY_FEE_PERCENT, WEEKLY_SPLIT } from "@/lib/games/weekly-rules";
import { settleDueWeeks, weeklyBoard, weeklyPaid, weekPot, weeksSettled } from "@/lib/weekly";

export const dynamic = "force-dynamic";

export default async function LeaderboardsPage() {
  const db = await getDb();
  const now = new Date();
  await settleDueWeeks(db, now).catch((err) => console.error("weekly payout failed", err));
  const week = weekOf(now);
  const paid = weeklyPaid();
  const rows = await Promise.all(
    ARCADE_KEYS.map(async (k) => {
      const [board, pot] = await Promise.all([weeklyBoard(db, k, week), weekPot(db, k, week)]);
      return { k, leader: board[0] ?? null, pot };
    }),
  );
  const last = await weeksSettled(db, previousWeek(week));
  const daysLeft = Math.ceil((weekBounds(week).end.getTime() - now.getTime()) / 86_400_000);

  return (
    <div className="flex flex-col gap-6">
      <section className="hero animate-pop overflow-hidden rounded-3xl border border-white/10">
        <div className="hero-hex" aria-hidden />
        <div className="p-6 sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lilac">Weekly leaderboards · {weekLabel(week)}</p>
          <h1 className="mt-2 text-3xl leading-tight sm:text-5xl">
            Play every level. <span className="text-gradient">Top the week.</span>
          </h1>
          <p className="mt-3 max-w-xl text-white/80">
            Every game has its own leaderboard, reset each Monday.{" "}
            {paid
              ? `Your first run of the week is ${kes(FIRST_RUN_KES)}, replays are ${kes(REPLAY_KES)}. On Sunday night the top 3 in each game share that game's pool ${WEEKLY_SPLIT.join("/")}, after our ${WEEKLY_FEE_PERCENT}%.`
              : "Runs are free for now, with no prizes."}
          </p>
          <p className="mt-2 text-sm text-emerald-200">Closes in {daysLeft} {daysLeft === 1 ? "day" : "days"}</p>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {rows.map(({ k, leader, pot }) => {
          const Art = POSTER_ART[k];
          return (
            <Link key={k} href={`/leaderboards/${k}`} className="group">
              <Card className="flex items-center gap-3 transition group-hover:border-mint/40">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl" aria-hidden>
                  {Art ? <Art /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-semibold">{ARCADE[k].name}</h2>
                  <p className="truncate text-sm text-white/60">
                    {leader ? `🥇 ${leader.username ?? "Player"} · ${leader.points.toLocaleString()} pts` : "No runs yet"}
                  </p>
                </div>
                <div className="text-right">
                  {paid && <div className="font-bold text-amber-200">{kes(pot.poolKes)}</div>}
                  <div className="text-xs text-white/50">
                    {pot.players} {pot.players === 1 ? "player" : "players"}
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </section>

      {last.some((w) => w.winners.length > 0) && (
        <Card>
          <h2 className="mb-2 font-semibold">Last week&apos;s winners ({weekLabel(previousWeek(week))})</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {last
              .filter((w) => w.winners.length > 0)
              .map((w) => (
                <li key={w.game} className="flex justify-between gap-2">
                  <span className="text-white/70">{ARCADE[w.game].name}</span>
                  <span>
                    🥇 {w.winners[0].username ?? "Player"}
                    {w.winners[0].prizeKes > 0 && <span className="text-amber-200"> · {kes(w.winners[0].prizeKes)}</span>}
                  </span>
                </li>
              ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
