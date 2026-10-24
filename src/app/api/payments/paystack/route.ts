import { getDb } from "@/db";
import { validWebhookSignature, verifyCardPayment } from "@/lib/payments/paystack";
import { paymentSucceeded } from "@/lib/shop/checkout";
import { markPaymentFailed } from "@/lib/shop/orders";

/** Paystack webhook. The signature is checked, then the payment is confirmed with Paystack directly. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!validWebhookSignature(raw, req.headers.get("x-paystack-signature"))) return new Response("Bad signature", { status: 401 });
  const event = JSON.parse(raw) as { event?: string; data?: { reference?: string } };
  const reference = event.data?.reference;
  if (event.event === "charge.success" && reference) {
    const db = await getDb();
    const r = await verifyCardPayment(reference);
    if (r.status === "paid") {
      if (r.currency !== "KES") await markPaymentFailed(db, { paymentRef: reference }, `Paid in ${r.currency}, expected KES`);
      else await paymentSucceeded(db, { paymentRef: reference }, { amountKes: r.amountKes, receipt: reference });
    }
  }
  return new Response("ok");
}
