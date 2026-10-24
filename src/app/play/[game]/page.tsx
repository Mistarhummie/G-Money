import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { getDb } from "@/db";
import { tournaments } from "@/db/schema";
import { myProgress, stageBoard, unlockedStages } from "@/lib/arcade";
import { isQuick, kindOf, liveActivity, myChallenges, openChallenges } from "@/lib/challenges";
import { ARCADE, isArcadeKey } from "@/lib/games/arcade";
import { getCurrentUser } from "@/lib/session";
import { GameRunner } from "./GameRunner";
import { NewChallengeForm, PlayOnline } from "./Lobby";

export default async function PlayGamePage({
  params,
  searchParams,
}: {
  params: Promise<{ game: string }>;
  searchParams: Promise<{ t?: string; stage?: string }>;
}) {
  const { game: key } = await params;
  const { t: tournamentId } = await searchParams;
  if (!isArcadeKey(key)) notFound();
  const game = ARCADE[key];
  const db = await getDb();
  const user = await getCurrentUser();
  const [t] = tournamentId ? await db.select().from(tournaments).where(eq(tournaments.id, tournamentId)) : [];
  const unlocked = user ? await unlockedStages(db, user.id, key) : 1;
  const progress = user ? await myProgress(db, user.id, key) : [];
  const boardStage = t?.stage ?? unlocked;
  const board = await stageBoard(db, key, boardStage);
  const race = kindOf(game) === "race";
  const open = t ? [] : await openChallenges(db, key, user);
  const mine = user && !t ? await myChallenges(db, user, key) : [];
  const activity = t ? null : (await liveActivity(db, [key]))[key];
  const statusText: Record<string, string> = { open: "Waiting", active: "In play", finished: "Finished" };
  const fmt = (row: { bestScore: number | null; bestTimeMs: number | null }) =>
    game.ranking === "score"
      ? `${(row.bestScore ?? 0).toLocaleString()} ${game.scoreLabel}`
      : row.bestTimeMs != null
        ? `${(row.bestTimeMs / 1000).toFixed(1)}s`
        : "—";

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <div>
        {t ? (
          <Link href={`/tournaments/${t.id}`} className="text-sm text-white/60 hover:text-white">← {t.title}</Link>
        ) : (
          <Link href="/play" className="text-sm text-white/60 hover:text-white">← All games</Link>
        )}
        <h1 className="text-2xl font-bold">{game.name}</h1>
        <p className="text-sm text-white/70">{game.howToPlay}</p>
        {t && <p className="mt-1 text-sm text-amber-200">Tournament attempt: you get {t.attemptsPerPlayer} attempts and your best one counts.</p>}
      </div>

      {activity && (
        <PlayOnline
          game={key}
          stages={game.stages}
          race={race}
          signedIn={!!user}
          waiting={activity.waiting}
          playing={activity.playing}
          waitingByStage={activity.waitingByStage}
        />
      )}

      {user ? (
        <GameRunner
          game={key}
          name={game.name}
          pvp={kindOf(game)}
          stages={game.stages}
          unlocked={unlocked}
          ranking={game.ranking}
          scoreLabel={game.scoreLabel}
          kind={game.kind}
          tournament={t ? { id: t.id, stage: t.stage } : null}
        />
      ) : (
        <Link href={`/login?next=/play/${key}`} className="btn-primary text-center">Sign in to play</Link>
      )}

      {!t && (
        <Card>
          <h2 className="font-semibold">Play a friend</h2>
          <p className="mb-3 text-sm text-white/60">
            {race
              ? "You both get the same board, one go each. The better result wins. Free to play."
              : "Take turns on one board, 2 minutes a move. Free to play."}
          </p>
          {user ? (
            <NewChallengeForm game={key} stages={game.stages} race={race} />
          ) : (
            <Link href={`/login?next=/play/${key}`} className="text-sm text-emerald-300 underline">Sign in to challenge someone</Link>
          )}
          {open.length > 0 && (
            <>
              <h3 className="mb-1 mt-4 text-sm font-semibold">Open challenges</h3>
              <ul className="flex flex-col gap-1 text-sm">
                {open.map(({ c, creator }) => (
                  <li key={c.id} className="flex items-center justify-between">
                    <span>
                      {creator ?? "Player"}
                      {race && <span className="text-white/50"> · stage {c.stage}</span>}
                      {c.invitedUserId && <span className="text-amber-200"> · for you</span>}
                      {isQuick(c) && <span className="text-emerald-300"> · looking for a game now</span>}
                    </span>
                    <Link href={`/challenge/${c.id}`} className="text-emerald-300 underline">View</Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          {mine.length > 0 && (
            <>
              <h3 className="mb-1 mt-4 text-sm font-semibold">Your matches</h3>
              <ul className="flex flex-col gap-1 text-sm">
                {mine.map(({ c, name }) => {
                  const opponent =
                    c.status === "open"
                      ? c.createdBy === user!.id
                        ? name(c.invitedUserId)
                        : name(c.createdBy)
                      : c.side0Id === user!.id
                        ? name(c.side1Id)
                        : name(c.side0Id);
                  const mySide = c.side0Id === user!.id ? 0 : c.side1Id === user!.id ? 1 : null;
                  const outcome =
                    c.status !== "finished" ? statusText[c.status] : c.winnerSide === null ? "Draw" : c.winnerSide === mySide ? "Won" : "Lost";
                  return (
                    <li key={c.id} className="flex items-center justify-between">
                      <span>
                        vs {opponent}
                        <span className="text-white/50"> · {outcome}</span>
                      </span>
                      <Link href={`/challenge/${c.id}`} className="text-emerald-300 underline">
                        {c.status === "finished" ? "View" : "Open"}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Card>
      )}

      {progress.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold">Your best</h2>
          <ul className="text-sm">
            {progress.map((p) => (
              <li key={p.stage} className="flex justify-between">
                <span>
                  {p.clearedAt ? "✅" : "⬜"} Stage {p.stage}: {game.stages[p.stage - 1]?.name}
                </span>
                <span className="font-mono">{fmt(p)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="mb-2 font-semibold">Top players, stage {boardStage}</h2>
        {board.length === 0 ? (
          <p className="text-sm text-white/60">Nobody yet. Be the first.</p>
        ) : (
          <ol className="text-sm">
            {board.map((r, i) => (
              <li key={i} className="flex justify-between">
                <span>
                  <span className="mr-2 text-white/50">{i + 1}.</span>
                  {r.username ?? "Player"}
                </span>
                <span className="font-mono">{fmt(r)}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
