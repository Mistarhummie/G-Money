import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Card payments through Paystack (https://paystack.com/docs/api/transaction). Paystack handles the
 * bank's 3-D Secure check. Needs PAYSTACK_SECRET_KEY and PUBLIC_BASE_URL.
 */

export function paystackConfigured(): boolean {
  return !!(process.env.PAYSTACK_SECRET_KEY && process.env.PUBLIC_BASE_URL);
}

const headers = () => ({ Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" });

/** Returns the Paystack page the customer is sent to. Amounts go to Paystack in cents. */
export async function startCardPayment(input: { email: string; amountKes: number; reference: string; orderId: string }): Promise<string> {
  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      email: input.email,
      amount: input.amountKes * 100,
      currency: "KES",
      reference: input.reference,
      channels: ["card"],
      callback_url: `${process.env.PUBLIC_BASE_URL}/orders/${input.orderId}`,
      metadata: { orderId: input.orderId },
    }),
  });
  const json = (await res.json()) as { status: boolean; message: string; data?: { authorization_url: string } };
  if (!res.ok || !json.status || !json.data) throw new Error(`Card payment could not start: ${json.message}`);
  return json.data.authorization_url;
}

export type CardResult = { status: "paid"; amountKes: number; currency: string } | { status: "failed"; reason: string } | { status: "pending" };

export async function verifyCardPayment(reference: string): Promise<CardResult> {
  const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: headers() });
  const json = (await res.json()) as { status: boolean; data?: { status: string; amount: number; currency: string; gateway_response?: string } };
  if (!res.ok || !json.data) return { status: "pending" };
  if (json.data.status === "success") return { status: "paid", amountKes: json.data.amount / 100, currency: json.data.currency };
  if (["failed", "reversed"].includes(json.data.status)) return { status: "failed", reason: json.data.gateway_response ?? json.data.status };
  return { status: "pending" };
}

/** Webhooks are signed with HMAC-SHA512 of the raw body using the secret key. */
export function validWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature || !process.env.PAYSTACK_SECRET_KEY) return false;
  const expected = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
