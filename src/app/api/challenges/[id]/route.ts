import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { challengeView, getChallenge, heartbeat } from "@/lib/challenges";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Match pages poll this to see the other player's moves. A poll from the creator of a waiting challenge
 * is also their heartbeat: it keeps their "Play online" search matchable while the page stays open.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const c = await getChallenge(db, id);
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await getCurrentUser();
  if (user) await heartbeat(db, user, c);
  const view = await challengeView(db, c, user);
  return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
}
