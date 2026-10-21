import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { challengeView, getChallenge } from "@/lib/challenges";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Match pages poll this to see the other player's moves. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const c = await getChallenge(db, id);
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const view = await challengeView(db, c, await getCurrentUser());
  return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
}
