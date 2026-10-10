import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { evidence, matches } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";

/** Screenshots are only visible to admins and the two players in the match. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  const db = await getDb();
  const [row] = await db
    .select({ e: evidence, m: matches })
    .from(evidence)
    .innerJoin(matches, eq(matches.id, evidence.matchId))
    .where(eq(evidence.id, id));
  if (!row) return new Response("Not found", { status: 404 });
  const allowed = user.isAdmin || row.m.playerAId === user.id || row.m.playerBId === user.id;
  if (!allowed) return new Response("Forbidden", { status: 403 });
  return new Response(new Uint8Array(row.e.data), {
    headers: {
      "Content-Type": row.e.mimeType,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
