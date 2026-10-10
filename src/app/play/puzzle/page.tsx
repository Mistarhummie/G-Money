import { eq } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "@/db";
import { tournaments } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { PuzzleGame } from "./PuzzleGame";

export default async function PuzzlePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t: tournamentId } = await searchParams;
  const user = await getCurrentUser();
  const db = await getDb();
  const [t] = tournamentId ? await db.select().from(tournaments).where(eq(tournaments.id, tournamentId)) : [];

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <div>
        {t && (
          <Link href={`/tournaments/${t.id}`} className="text-sm text-white/60 hover:text-white">
            ← {t.title}
          </Link>
        )}
        <h1 className="text-2xl font-bold">{t ? "Tournament attempt" : "Speed puzzle practice"}</h1>
        <p className="text-sm text-white/70">
          Slide the tiles into order 1 to 15. The clock starts when the board appears and is kept by our server.
          {t && ` You get ${t.attemptsPerPlayer} attempts; your best time counts.`}
        </p>
      </div>
      {user ? (
        <PuzzleGame tournamentId={t?.id ?? null} />
      ) : (
        <Link href="/login" className="btn-primary text-center">Sign in to play</Link>
      )}
    </div>
  );
}
