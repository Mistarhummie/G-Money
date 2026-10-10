import { desc, inArray, sql } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "@/db";
import { entries, tournaments } from "@/db/schema";
import { Card, StatusBadge, gameName, kes, nairobiTime } from "@/components/ui";

export default async function Home() {
  const db = await getDb();
  const list = await db
    .select({
      t: tournaments,
      players: sql<number>`(select count(*)::int from ${entries} where ${entries.tournamentId} = ${tournaments.id})`,
    })
    .from(tournaments)
    .where(inArray(tournaments.status, ["open", "running", "completed"]))
    .orderBy(sql`case ${tournaments.status} when 'running' then 0 when 'open' then 1 else 2 end`, desc(tournaments.startsAt))
    .limit(30);

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-3xl bg-gradient-to-br from-emerald-600/30 to-emerald-900/10 p-6 sm:p-10">
        <h1 className="text-3xl font-bold sm:text-4xl">Play. Win. Get paid.</h1>
        <p className="mt-3 max-w-xl text-white/80">
          Skill tournaments for eFootball, EA FC, chess and our own speed puzzle. Results are checked, prizes go out over M-Pesa,
          and every dispute is reviewed with evidence.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/play/puzzle" className="btn-primary">Try the speed puzzle</Link>
          <Link href="/login" className="btn-secondary">Create an account</Link>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Tournaments</h2>
        {list.length === 0 ? (
          <Card>No tournaments yet. Check back soon.</Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {list.map(({ t, players }) => (
              <Link key={t.id} href={`/tournaments/${t.id}`}>
                <Card className="h-full transition hover:border-emerald-400/50">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold">{t.title}</h3>
                    <StatusBadge status={t.status} />
                  </div>
                  <p className="mt-1 text-sm text-white/70">{gameName(t)}</p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/80">
                    <span>{t.entryType === "free" ? "Free entry" : `Entry ${kes(t.entryFeeKes)}`}</span>
                    {t.sponsoredPrizeKes > 0 && <span>Prize {kes(t.sponsoredPrizeKes)}</span>}
                    <span>
                      {players}/{t.maxPlayers} players
                    </span>
                    <span>{nairobiTime(t.startsAt)}</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
