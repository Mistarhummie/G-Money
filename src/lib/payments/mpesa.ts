/**
 * M-Pesa Express (STK push) through Safaricom Daraja.
 * Docs: https://developer.safaricom.co.ke (M-Pesa Express Simulate / Query).
 * Needs MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE, MPESA_PASSKEY, MPESA_CALLBACK_SECRET,
 * PUBLIC_BASE_URL, and MPESA_ENV=production for live payments (sandbox otherwise).
 */

const base = () => (process.env.MPESA_ENV === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke");

export function mpesaConfigured(): boolean {
  const e = process.env;
  return !!(e.MPESA_CONSUMER_KEY && e.MPESA_CONSUMER_SECRET && e.MPESA_SHORTCODE && e.MPESA_PASSKEY && e.MPESA_CALLBACK_SECRET && e.PUBLIC_BASE_URL);
}

async function token(): Promise<string> {
  const auth = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString("base64");
  const res = await fetch(`${base()}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) throw new Error(`M-Pesa sign-in failed (${res.status})`);
  return ((await res.json()) as { access_token: string }).access_token;
}

/** YYYYMMDDHHmmss in Kenyan time, as Daraja expects. */
export function darajaTimestamp(now = new Date()): string {
  const eat = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return eat.toISOString().replace(/[-:T]/g, "").slice(0, 14);
}

function password(timestamp: string): string {
  return Buffer.from(`${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`).toString("base64");
}

/** Sends the payment prompt to the customer's phone. Returns the CheckoutRequestID used to match the callback. */
export async function startStkPush(input: { phone: string; amountKes: number; reference: string }): Promise<string> {
  const timestamp = darajaTimestamp();
  const res = await fetch(`${base()}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: password(timestamp),
      Timestamp: timestamp,
      TransactionType: process.env.MPESA_TRANSACTION_TYPE ?? "CustomerPayBillOnline",
      Amount: input.amountKes,
      PartyA: input.phone.replace("+", ""),
      PartyB: process.env.MPESA_PARTY_B ?? process.env.MPESA_SHORTCODE,
      PhoneNumber: input.phone.replace("+", ""),
      CallBackURL: `${process.env.PUBLIC_BASE_URL}/api/payments/mpesa/${process.env.MPESA_CALLBACK_SECRET}`,
      AccountReference: input.reference.slice(0, 12),
      TransactionDesc: "Gift card",
    }),
  });
  const json = (await res.json()) as { ResponseCode?: string; CheckoutRequestID?: string; errorMessage?: string };
  if (!res.ok || json.ResponseCode !== "0" || !json.CheckoutRequestID) {
    throw new Error(`M-Pesa did not accept the request: ${json.errorMessage ?? res.status}`);
  }
  return json.CheckoutRequestID;
}

export type MpesaResult =
  | { status: "paid"; checkoutRequestId: string; amountKes: number; receipt: string }
  | { status: "failed"; checkoutRequestId: string; reason: string }
  | { status: "pending"; checkoutRequestId: string };

type Callback = {
  Body?: {
    stkCallback?: {
      CheckoutRequestID: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: { Item: { Name: string; Value?: string | number }[] };
    };
  };
};

export function parseCallback(body: unknown): MpesaResult | null {
  const cb = (body as Callback)?.Body?.stkCallback;
  if (!cb?.CheckoutRequestID) return null;
  if (Number(cb.ResultCode) !== 0) return { status: "failed", checkoutRequestId: cb.CheckoutRequestID, reason: cb.ResultDesc };
  const item = (name: string) => cb.CallbackMetadata?.Item.find((i) => i.Name === name)?.Value;
  return {
    status: "paid",
    checkoutRequestId: cb.CheckoutRequestID,
    amountKes: Number(item("Amount")),
    receipt: String(item("MpesaReceiptNumber") ?? ""),
  };
}

/** Asks Safaricom for the result directly, for when the callback never arrived. */
export async function queryStkPush(checkoutRequestId: string): Promise<MpesaResult> {
  const timestamp = darajaTimestamp();
  const res = await fetch(`${base()}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: password(timestamp),
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    }),
  });
  const json = (await res.json()) as { ResultCode?: string; ResultDesc?: string; errorCode?: string };
  // While the customer hasn't answered, Daraja replies with an error saying the transaction is being processed.
  if (json.ResultCode === undefined) return { status: "pending", checkoutRequestId };
  if (json.ResultCode !== "0") return { status: "failed", checkoutRequestId, reason: json.ResultDesc ?? "Payment failed" };
  // The query does not return the receipt or amount; the callback carries those.
  return { status: "paid", checkoutRequestId, amountKes: NaN, receipt: "" };
}
