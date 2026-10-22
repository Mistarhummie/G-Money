import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { challengeView, getChallenge } from "@/lib/challenges";
import { ARCADE, isArcadeKey } from "@/lib/games/arcade";
import { getCurrentUser } from "@/lib/session";
import { MatchClient } from "./MatchClient";

export const dynamic = "force-dynamic";

export default async function ChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const c = await getChallenge(db, id);
  if (!c || !isArcadeKey(c.game)) notFound();
  const user = await getCurrentUser();
  const view = await challengeView(db, c, user);
  const game = ARCADE[c.game];

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <div>
        <Link href={`/play/${game.key}`} className="text-sm text-white/60 hover:text-white">← {game.name}</Link>
        <h1 className="text-2xl font-bold">{game.name}: player vs player</h1>
        <p className="text-sm text-white/70">
          {view.kind === "turns"
            ? "Take turns on the same board. You have 2 minutes for each move, or you lose."
            : `Both players get the same board on stage ${view.stage} (${game.stages[view.stage - 1]?.name}). One go each, within an hour of the match starting. The better result wins.`}
        </p>
      </div>
      {user ? (
        <MatchClient
          initial={view}
          game={game.key}
          name={game.name}
          stages={game.stages}
          ranking={game.ranking}
          scoreLabel={game.scoreLabel}
          kind={game.kind}
        />
      ) : (
        <Link href={`/login?next=/challenge/${id}`} className="btn-primary text-center">Sign in to play</Link>
      )}
    </div>
  );
}
