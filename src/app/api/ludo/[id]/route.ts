import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { getLudoGame, ludoView } from "@/lib/ludo/service";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Ludo tables poll this. `?from=N` sends only the actions after the first N. Catches up computer turns and timeouts first. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const from = Number(new URL(request.url).searchParams.get("from") ?? 0);
  const db = await getDb();
  const g = await getLudoGame(db, id);
  if (!g) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const view = await ludoView(db, g, await getCurrentUser(), from);
  return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
}
