import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/db";
import { parseCallback } from "@/lib/payments/mpesa";
import { paymentSucceeded } from "@/lib/shop/checkout";
import { markPaymentFailed } from "@/lib/shop/orders";

/**
 * Safaricom posts the STK push result here. Daraja callbacks are not signed, so the URL carries a
 * secret only we and Safaricom know.
 */
export async function POST(req: Request, ctx: { params: Promise<{ secret: string }> }) {
  const { secret } = await ctx.params;
  const expected = process.env.MPESA_CALLBACK_SECRET ?? "";
  const a = Buffer.from(secret);
  const b = Buffer.from(expected);
  if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) return new Response("Not found", { status: 404 });

  const result = parseCallback(await req.json().catch(() => null));
  if (result) {
    const db = await getDb();
    if (result.status === "paid") {
      await paymentSucceeded(db, { paymentRef: result.checkoutRequestId }, { amountKes: result.amountKes, receipt: result.receipt });
    } else if (result.status === "failed") {
      await markPaymentFailed(db, { paymentRef: result.checkoutRequestId }, result.reason);
    }
  }
  return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
}
