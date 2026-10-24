import Link from "next/link";
import { notFound } from "next/navigation";
import { LudoTable } from "@/components/games/ludo/LudoTable";
import { getDb } from "@/db";
import { LUDO_STAGES } from "@/lib/ludo/meta";
import { getLudoGame, ludoView } from "@/lib/ludo/service";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Ludo table · G-Money" };

export default async function LudoGamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const g = await getLudoGame(db, id);
  if (!g) notFound();
  const user = await getCurrentUser();
  const view = await ludoView(db, g, user);
  const title =
    g.mode === "computer"
      ? `Ludo vs computer · stage ${g.stage}: ${LUDO_STAGES[(g.stage ?? 1) - 1]?.name}`
      : g.isPrivate
        ? "Ludo with friends"
        : "Ludo online";

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3">
      <div>
        <Link href="/play/ludo" className="text-sm text-white/60 hover:text-white">← Ludo</Link>
        <h1 className="text-xl font-bold">{title}</h1>
      </div>
      {!user && g.status === "waiting" ? (
        <Link href={`/login?next=/play/ludo/${id}`} className="btn-primary text-center">Sign in to sit down</Link>
      ) : (
        <LudoTable initial={view} />
      )}
    </div>
  );
}
