import { getDb } from "@/db";
import { validChallenge } from "@/lib/payments/intasend";
import { handleIntaSendEvent } from "@/lib/wallet-payments";

/**
 * IntaSend webhook for collections (M-Pesa and card) and send-money (payouts). Set it on the IntaSend
 * dashboard as PUBLIC_BASE_URL/api/payments/intasend with the challenge from INTASEND_WEBHOOK_CHALLENGE.
 * The challenge is checked, then every event is confirmed with IntaSend before money moves.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !validChallenge(body.challenge ?? req.headers.get("x-intasend-challenge"))) {
    return new Response("Bad challenge", { status: 401 });
  }
  try {
    await handleIntaSendEvent(await getDb(), body);
  } catch (err) {
    // A 500 makes IntaSend retry later, which is what we want if IntaSend or the database was briefly down.
    console.error("IntaSend webhook failed", err);
    return new Response("Try again", { status: 500 });
  }
  return Response.json({ ok: true });
}
