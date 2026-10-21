import { and, asc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { Card, StatusBadge, gameName, kes, nairobiTime } from "@/components/ui";
import { getDb } from "@/db";
import { disputes, entries, matches, tournaments, users, type Match, type User } from "@/db/schema";
import { computePrizePool, distributePrizes, payoutSplit } from "@/lib/payouts";
import { getCurrentUser } from "@/lib/session";
import { applyAutoConfirms, finishLeaderboard, leaderboard } from "@/lib/tournaments";
import { ARCADE, isArcadeKey } from "@/lib/games/arcade";
import { joinAction, leaveAction } from "../../actions";
import { MatchActions } from "./MatchActions";

export default async function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const [found] = await db.select().from(tournaments).where(eq(tournaments.id, id));
  if (!found) notFound();

  // No background jobs on the free tier: overdue work happens when someone opens the page.
  if (found.status === "running") {
    if (found.format === "bracket") await applyAutoConfirms(db, id);
    if (found.format === "leaderboard" && found.endsAt && found.endsAt <= new Date()) {
      await finishLeaderboard(db, null, id).catch(() => undefined);
    }
  }
  const [t] = await db.select().from(tournaments).where(eq(tournaments.id, id));
  const user = await getCurrentUser();

  const players = await db
    .select({ entry: entries, username: users.username })
    .from(entries)
    .innerJoin(users, eq(users.id, entries.userId))
    .where(eq(entries.tournamentId, id))
    .orderBy(asc(entries.finalRank), asc(entries.createdAt));
  const joined = !!user && players.some((p) => p.entry.userId === user.id);

  const pool = computePrizePool({
    entryFeeKes: t.entryType === "paid" ? t.entryFeeKes : 0,
    entrants: players.length,
    sponsoredPrizeKes: t.sponsoredPrizeKes,
    platformFeePercent: t.platformFeePercent,
  });
  const prizes = distributePrizes(pool.prizePoolKes, payoutSplit(t.format, players.length));

  const path = `/tournaments/${id}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/" className="text-sm text-white/60 hover:text-white">← All tournaments</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{t.title}</h1>
          <StatusBadge status={t.status} />
        </div>
        <p className="text-white/70">{gameName(t)}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <p className="text-xs uppercase text-white/50">Prize pool</p>
          <p className="text-2xl font-bold text-emerald-300">{kes(pool.prizePoolKes)}</p>
          <p className="text-xs text-white/60">
            {prizes.map((p, i) => `${["1st", "2nd", "3rd"][i]} ${kes(p)}`).join(" · ")}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-white/50">Entry</p>
          <p className="text-xl font-semibold">{t.entryType === "free" ? "Free" : kes(t.entryFeeKes)}</p>
          {t.entryType === "paid" && <p className="text-xs text-white/60">{t.platformFeePercent}% platform fee from entries</p>}
        </Card>
        <Card>
          <p className="text-xs uppercase text-white/50">Players</p>
          <p className="text-xl font-semibold">
            {players.length}/{t.maxPlayers}
          </p>
          <p className="text-xs text-white/60">
            Starts {nairobiTime(t.startsAt)}
            {t.endsAt && <> · ends {nairobiTime(t.endsAt)}</>}
          </p>
        </Card>
      </div>

      {t.status === "open" && (
        <Card className="flex flex-wrap items-center gap-3">
          {!user ? (
            <Link href="/login" className="btn-primary">Sign in to join</Link>
          ) : joined ? (
            <>
              <span className="text-emerald-300">You&apos;re in.</span>
              <ActionForm action={leaveAction.bind(null, id)} submitLabel="Leave" buttonClassName="btn-secondary" className="flex items-center gap-2" />
            </>
          ) : (
            <ActionForm action={joinAction.bind(null, id)} submitLabel="Join tournament" className="flex items-center gap-3" />
          )}
        </Card>
      )}

      {t.rules && (
        <Card>
          <h2 className="mb-1 font-semibold">Rules</h2>
          <p className="whitespace-pre-wrap text-sm text-white/80">{t.rules}</p>
        </Card>
      )}

      {t.format === "leaderboard" ? (
        <Leaderboard tournamentId={id} game={t.game} stage={t.stage} running={t.status === "running"} joined={joined} />
      ) : (
        t.status !== "open" && <Bracket tournamentId={id} user={user} path={path} game={t.game} />
      )}

      <Card>
        <h2 className="mb-2 font-semibold">Players</h2>
        {players.length === 0 ? (
          <p className="text-sm text-white/60">Nobody has joined yet.</p>
        ) : (
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {players.map((p) => (
              <li key={p.entry.id} className="flex justify-between gap-2">
                <span>
                  {p.entry.finalRank && <span className="mr-2 text-white/50">#{p.entry.finalRank}</span>}
                  {p.username}
                </span>
                {p.entry.prizeKes > 0 && <span className="text-emerald-300">{kes(p.entry.prizeKes)}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

async function Leaderboard({
  tournamentId,
  game,
  stage,
  running,
  joined,
}: {
  tournamentId: string;
  game: string;
  stage: number;
  running: boolean;
  joined: boolean;
}) {
  if (!isArcadeKey(game)) return null;
  const def = ARCADE[game];
  const db = await getDb();
  const rows = await leaderboard(db, tournamentId);
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Leaderboard</h2>
          <p className="text-xs text-white/60">
            Stage {stage}: {def.stages[stage - 1]?.goal}. {def.ranking === "score" ? "Highest score wins." : "Fastest time wins."}
          </p>
        </div>
        {running && joined && (
          <Link href={`/play/${game}?t=${tournamentId}`} className="btn-primary">Play an attempt</Link>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-white/60">No results yet.</p>
      ) : (
        <ol className="flex flex-col gap-1 text-sm">
          {rows.map((r, i) => (
            <li key={r.userId} className="flex justify-between">
              <span>
                <span className="mr-2 text-white/50">{i + 1}.</span>
                {r.username}
              </span>
              <span className="font-mono">
                {def.ranking === "score" ? `${r.score.toLocaleString()} ${def.scoreLabel} · ` : ""}
                {(r.timeMs / 1000).toFixed(2)}s
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

async function Bracket({ tournamentId, user, path, game }: { tournamentId: string; user: User | null; path: string; game: string }) {
  const db = await getDb();
  const all = await db.select().from(matches).where(eq(matches.tournamentId, tournamentId)).orderBy(asc(matches.round), asc(matches.slot));
  const ids = [...new Set(all.flatMap((m) => [m.playerAId, m.playerBId]).filter((x): x is string => !!x))];
  const names = new Map(
    ids.length ? (await db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, ids))).map((u) => [u.id, u.username ?? "?"]) : [],
  );
  const rounds = [...new Set(all.map((m) => m.round))];
  const maxRound = Math.max(...rounds);
  const mine = user
    ? all.filter((m) => (m.playerAId === user.id || m.playerBId === user.id) && m.playerAId && m.playerBId && m.status !== "completed")
    : [];
  const openDisputes = mine.length
    ? await db.select().from(disputes).where(and(inArray(disputes.matchId, mine.map((m) => m.id))))
    : [];

  const roundName = (r: number) => (r === maxRound ? "Final" : r === maxRound - 1 ? "Semi-finals" : `Round ${r}`);
  const label = (m: Match, side: "A" | "B") => {
    const pid = side === "A" ? m.playerAId : m.playerBId;
    if (pid) return names.get(pid) ?? "?";
    return m.round === 1 ? "bye" : "TBD";
  };

  return (
    <div className="flex flex-col gap-4">
      {mine.map((m) => (
        <Card key={m.id} className="border-emerald-400/40">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">
              Your match: {label(m, "A")} vs {label(m, "B")}
            </h2>
            <StatusBadge status={m.status} />
          </div>
          <MatchActions
            match={{
              id: m.id,
              status: m.status,
              scoreA: m.scoreA,
              scoreB: m.scoreB,
              reportedByMe: m.reportedBy === user!.id,
              nameA: label(m, "A"),
              nameB: label(m, "B"),
              disputed: openDisputes.some((d) => d.matchId === m.id && !d.resolvedAt),
            }}
            game={game}
            path={path}
          />
        </Card>
      ))}

      <Card>
        <h2 className="mb-3 font-semibold">Bracket</h2>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {rounds.map((r) => (
            <div key={r} className="flex min-w-44 flex-col justify-around gap-3">
              <p className="text-xs uppercase text-white/50">{roundName(r)}</p>
              {all
                .filter((m) => m.round === r)
                .map((m) => (
                  <div key={m.id} className="rounded-lg border border-white/10 bg-black/20 text-sm">
                    {(["A", "B"] as const).map((side) => {
                      const pid = side === "A" ? m.playerAId : m.playerBId;
                      const won = m.winnerId && m.winnerId === pid;
                      const score = side === "A" ? m.scoreA : m.scoreB;
                      return (
                        <div key={side} className={`flex justify-between px-2 py-1 ${won ? "font-semibold text-emerald-300" : "text-white/80"}`}>
                          <span>{label(m, side)}</span>
                          {m.status === "completed" && score != null && <span>{score}</span>}
                        </div>
                      );
                    })}
                  </div>
                ))}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
