import { timingSafeEqual } from "node:crypto";

/**
 * Payments through IntaSend (https://developers.intasend.com): M-Pesa STK push and card checkout to
 * take money in, and M-Pesa B2C "send money" to pay players out. Paths and fields follow IntaSend's
 * own Node SDK (intasend-node 1.1.2).
 *
 * Needs INTASEND_PUBLISHABLE_KEY, INTASEND_SECRET_KEY, INTASEND_WEBHOOK_CHALLENGE and PUBLIC_BASE_URL.
 * Uses the sandbox unless INTASEND_ENV=live.
 */

const base = () => (process.env.INTASEND_ENV === "live" ? "https://payment.intasend.com" : "https://sandbox.intasend.com");

export function intasendConfigured(): boolean {
  const e = process.env;
  return !!(e.INTASEND_PUBLISHABLE_KEY && e.INTASEND_SECRET_KEY && e.INTASEND_WEBHOOK_CHALLENGE && e.PUBLIC_BASE_URL);
}

/** Collections use the public key; status checks and payouts use the secret key. */
async function call<T>(path: string, body: Record<string, unknown>, auth: "public" | "secret"): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const payload = { ...body };
  if (auth === "secret") headers.Authorization = `Bearer ${process.env.INTASEND_SECRET_KEY}`;
  else {
    headers.INTASEND_PUBLIC_API_KEY = process.env.INTASEND_PUBLISHABLE_KEY!;
    payload.public_key = process.env.INTASEND_PUBLISHABLE_KEY;
  }
  const res = await fetch(`${base()}${path}`, { method: "POST", headers, body: JSON.stringify(payload) });
  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { detail: text.slice(0, 200) };
  }
  if (!res.ok) throw new IntaSendError(res.status, json);
  return json as T;
}

export class IntaSendError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`IntaSend refused the request (${status}): ${describe(body)}`);
  }
}

function describe(body: unknown): string {
  if (!body || typeof body !== "object") return String(body);
  const b = body as Record<string, unknown>;
  if (Array.isArray(b.errors)) return b.errors.map((e) => (e as { detail?: string }).detail ?? JSON.stringify(e)).join("; ");
  return String(b.detail ?? b.message ?? JSON.stringify(body)).slice(0, 300);
}

/** "+254712345678" → "254712345678", the form M-Pesa expects. */
const msisdn = (phone: string) => phone.replace(/^\+/, "");

// ---------------------------------------------------------------- collections

export type Invoice = {
  invoice_id: string;
  state: string; // PENDING, PROCESSING, COMPLETE, FAILED (RETRY also seen)
  provider?: string;
  value?: string | number;
  net_amount?: string | number;
  charges?: string | number;
  currency?: string;
  account?: string;
  api_ref?: string | null;
  mpesa_reference?: string | null;
  failed_reason?: string | null;
};

/** Sends the M-Pesa PIN prompt to the customer's phone. Returns IntaSend's invoice id. */
export async function stkPush(input: { phone: string; amountKes: number; apiRef: string; narrative: string }): Promise<string> {
  const json = await call<{ invoice?: Invoice; id?: string }>(
    "/api/v1/payment/mpesa-stk-push/",
    {
      method: "M-PESA",
      currency: "KES",
      amount: input.amountKes,
      phone_number: msisdn(input.phone),
      api_ref: input.apiRef,
      narrative: input.narrative,
    },
    "public",
  );
  const id = json.invoice?.invoice_id;
  if (!id) throw new Error("IntaSend did not return an invoice for the M-Pesa prompt");
  return id;
}

/** Creates IntaSend's card payment page. Returns its address and the checkout id. */
export async function cardCheckout(input: {
  amountKes: number;
  apiRef: string;
  email: string;
  redirectPath: string;
}): Promise<{ url: string; checkoutId: string }> {
  const site = process.env.PUBLIC_BASE_URL!;
  const json = await call<{ id?: string; url?: string }>(
    "/api/v1/checkout/",
    {
      method: "CARD-PAYMENT",
      currency: "KES",
      amount: input.amountKes,
      email: input.email,
      api_ref: input.apiRef,
      host: site,
      redirect_url: `${site}${input.redirectPath}`,
    },
    "public",
  );
  if (!json.url || !json.id) throw new Error("IntaSend did not return a card payment page");
  return { url: json.url, checkoutId: json.id };
}

export type CollectionResult =
  | { status: "paid"; invoiceId: string; apiRef: string | null; amountKes: number; currency: string; receipt: string }
  | { status: "failed"; invoiceId: string; apiRef: string | null; reason: string }
  | { status: "pending"; invoiceId: string; apiRef: string | null };

export function readInvoice(inv: Invoice): CollectionResult {
  const apiRef = inv.api_ref ?? null;
  const state = String(inv.state ?? "").toUpperCase();
  if (state === "COMPLETE") {
    return {
      status: "paid",
      invoiceId: inv.invoice_id,
      apiRef,
      // value is what the customer paid; charges come out of it on IntaSend's side.
      amountKes: Number(inv.value),
      currency: inv.currency ?? "KES",
      receipt: inv.mpesa_reference || inv.invoice_id,
    };
  }
  if (state === "FAILED") return { status: "failed", invoiceId: inv.invoice_id, apiRef, reason: inv.failed_reason || "Payment failed" };
  return { status: "pending", invoiceId: inv.invoice_id, apiRef };
}

/** Asks IntaSend for a payment's current state. Webhooks are always re-checked this way before money moves. */
export async function paymentStatus(invoiceId: string): Promise<CollectionResult> {
  const json = await call<{ invoice?: Invoice }>("/api/v1/payment/status/", { invoice_id: invoiceId }, "secret");
  if (!json.invoice) return { status: "pending", invoiceId, apiRef: null };
  return readInvoice(json.invoice);
}

// ---------------------------------------------------------------- payouts (send money)

type PayoutTx = { status?: string; status_code?: string; status_description?: string; provider_reference?: string | null; account?: string };
type PayoutFile = { tracking_id?: string; status?: string; status_code?: string; transactions?: PayoutTx[] };

/**
 * Sends money to one M-Pesa number. requires_approval is "NO" because the admin has already approved it
 * on our side (or it was under the automatic limit). Returns IntaSend's tracking id.
 */
export async function sendToMpesa(input: { phone: string; name: string; amountKes: number; narrative: string }): Promise<string> {
  const json = await call<PayoutFile>(
    "/api/v1/send-money/initiate/",
    {
      provider: "MPESA-B2C",
      currency: "KES",
      requires_approval: "NO",
      callback_url: `${process.env.PUBLIC_BASE_URL}/api/payments/intasend`,
      transactions: [{ name: input.name, account: msisdn(input.phone), amount: String(input.amountKes), narrative: input.narrative }],
    },
    "secret",
  );
  if (!json.tracking_id) throw new Error("IntaSend did not return a tracking id for the payout");
  return json.tracking_id;
}

export type PayoutResult =
  | { status: "paid"; trackingId: string; receipt: string }
  | { status: "failed"; trackingId: string; reason: string }
  | { status: "pending"; trackingId: string };

/**
 * One payout per file, so the file's single transaction decides. "TS100" / "Successful" is the only
 * success IntaSend documents; anything that says it failed is a failure; everything else is still going.
 */
export function readPayout(file: PayoutFile): PayoutResult {
  const trackingId = file.tracking_id ?? "";
  const tx = file.transactions?.[0];
  const txStatus = `${tx?.status ?? ""} ${tx?.status_code ?? ""}`.toLowerCase();
  if (tx && (tx.status_code === "TS100" || /successful|completed/.test(txStatus))) {
    return { status: "paid", trackingId, receipt: tx.provider_reference || trackingId };
  }
  if (/fail|reject|cancel|revers/.test(txStatus)) {
    return { status: "failed", trackingId, reason: tx?.status_description || tx?.status || "Payout failed" };
  }
  const fileStatus = `${file.status ?? ""}`.toLowerCase();
  if (/fail|cancel/.test(fileStatus)) return { status: "failed", trackingId, reason: file.status! };
  return { status: "pending", trackingId };
}

export async function payoutStatus(trackingId: string): Promise<PayoutResult> {
  const json = await call<PayoutFile>("/api/v1/send-money/status/", { tracking_id: trackingId }, "secret");
  return readPayout({ tracking_id: trackingId, ...json });
}

// ---------------------------------------------------------------- webhooks

/**
 * IntaSend puts the "challenge" set on the dashboard's webhook into each event. It only proves the
 * sender knows that word, so every event is re-checked with IntaSend before any money moves.
 */
export function validChallenge(given: unknown): boolean {
  const expected = process.env.INTASEND_WEBHOOK_CHALLENGE ?? "";
  if (!expected || typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
