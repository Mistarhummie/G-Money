import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPgliteDb, type Db } from "@/db";
import { orders, products, users, walletDeposits, withdrawals, type User } from "@/db/schema";
import { readPayout } from "@/lib/payments/intasend";
import { applyOrderPayment, orderRef, startPayment } from "@/lib/shop/checkout";
import { createOrder, setProductEnabled, setUsdKesRate, syncProducts } from "@/lib/shop/orders";
import { TestSupplier } from "@/lib/shop/suppliers";
import { accountBalance, PLATFORM_FEES, postTransfer, walletOf } from "@/lib/wallet";
import {
  approveWithdrawal,
  createDeposit,
  depositRef,
  handleIntaSendEvent,
  rejectWithdrawal,
  requestWithdrawal,
  resolveWithdrawal,
  startDeposit,
  walletPaymentsOn,
} from "@/lib/wallet-payments";

// ---------------------------------------------------------------- a fake IntaSend

type Inv = { invoice_id: string; state: string; value: number; currency: string; api_ref: string; mpesa_reference?: string; failed_reason?: string };
type Out = { tracking_id: string; status: string; transactions: { status: string; status_code: string; provider_reference?: string; status_description?: string }[] };

let invoices: Map<string, Inv>;
let payouts: Map<string, Out>;
let calls: { path: string; body: Record<string, unknown>; headers: Record<string, string> }[];
let payoutReply: "ok" | "refuse" | "network";
let seq = 0;

function fakeFetch(url: string | URL, init?: RequestInit): Promise<Response> {
  const path = new URL(String(url)).pathname;
  const body = JSON.parse(String(init?.body ?? "{}"));
  calls.push({ path, body, headers: init?.headers as Record<string, string> });
  const json = (x: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(x), { status }));
  if (path === "/api/v1/payment/mpesa-stk-push/") {
    const inv: Inv = { invoice_id: `INV${++seq}`, state: "PENDING", value: body.amount, currency: "KES", api_ref: body.api_ref };
    invoices.set(inv.invoice_id, inv);
    return json({ invoice: inv });
  }
  if (path === "/api/v1/checkout/") return json({ id: `CHK${++seq}`, url: `https://sandbox.intasend.com/checkout/CHK${seq}/` });
  if (path === "/api/v1/payment/status/") {
    const inv = invoices.get(body.invoice_id);
    return inv ? json({ invoice: inv }) : json({ detail: "Not found" }, 404);
  }
  if (path === "/api/v1/send-money/initiate/") {
    if (payoutReply === "refuse") return json({ errors: [{ detail: "Insufficient balance" }] }, 400);
    if (payoutReply === "network") return Promise.reject(new TypeError("fetch failed"));
    const out: Out = { tracking_id: `TRK${++seq}`, status: "Processing", transactions: [{ status: "Pending", status_code: "TP101" }] };
    payouts.set(out.tracking_id, out);
    return json(out);
  }
  if (path === "/api/v1/send-money/status/") return json(payouts.get(body.tracking_id));
  return json({ detail: "unknown path" }, 404);
}

/** The customer pays (or not) on their phone; IntaSend then knows the result. */
function settle(invoiceId: string, state: "COMPLETE" | "FAILED", value?: number) {
  const inv = invoices.get(invoiceId)!;
  inv.state = state;
  if (value !== undefined) inv.value = value;
  if (state === "COMPLETE") inv.mpesa_reference = "QWE123RTY";
  else inv.failed_reason = "Request cancelled by user";
}

// ---------------------------------------------------------------- setup

let db: Db;
let n = 0;
const NOW = new Date("2026-11-23T10:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const balance = (u: User) => accountBalance(db, walletOf(u.id));

async function player(extra: Partial<User> = {}) {
  n++;
  const [u] = await db
    .insert(users)
    .values({ phone: `+2547${String(n).padStart(8, "0")}`, username: `p${n}`, createdAt: new Date(NOW.getTime() - 30 * DAY), ...extra })
    .returning();
  return u;
}

const ENV = {
  INTASEND_PUBLISHABLE_KEY: "ISPubKey_test_x",
  INTASEND_SECRET_KEY: "ISSecretKey_test_y",
  INTASEND_WEBHOOK_CHALLENGE: "open-sesame",
  PUBLIC_BASE_URL: "https://g-money.example",
  PAID_ENTRY_ENABLED: "true",
};

beforeEach(async () => {
  db = await createPgliteDb();
  invoices = new Map();
  payouts = new Map();
  calls = [];
  payoutReply = "ok";
  Object.assign(process.env, ENV);
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
});
afterEach(() => {
  for (const k of [...Object.keys(ENV), "TEST_FUNDS", "WITHDRAW_AUTO_MAX_KES", "PAYMENTS_MODE"]) delete process.env[k];
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------- tests

describe("when wallet payments are open", () => {
  it("needs IntaSend keys and paid entry, and never takes real money on a test-funds site", () => {
    expect(walletPaymentsOn()).toBe(true);
    process.env.TEST_FUNDS = "true";
    expect(walletPaymentsOn()).toBe(false);
    delete process.env.TEST_FUNDS;
    delete process.env.INTASEND_SECRET_KEY;
    expect(walletPaymentsOn()).toBe(false);
  });
});

describe("M-Pesa top-ups", () => {
  it("sends the prompt and credits the wallet once, however many webhooks arrive", async () => {
    const u = await player();
    const dep = await createDeposit(db, u, { amountKes: 200, method: "mpesa" }, NOW);
    await startDeposit(db, dep, u);
    const stk = calls.find((c) => c.path.endsWith("mpesa-stk-push/"))!;
    expect(stk.body).toMatchObject({ amount: 200, phone_number: u.phone.slice(1), api_ref: depositRef(dep.id), currency: "KES", public_key: "ISPubKey_test_x" });
    const [saved] = await db.select().from(walletDeposits).where(eq(walletDeposits.id, dep.id));
    expect(saved.invoiceId).toBeTruthy();

    // Still pending: nothing moves.
    await handleIntaSendEvent(db, { invoice_id: saved.invoiceId!, state: "COMPLETE" });
    expect(await balance(u)).toBe(0);

    settle(saved.invoiceId!, "COMPLETE");
    await handleIntaSendEvent(db, { invoice_id: saved.invoiceId! });
    await handleIntaSendEvent(db, { invoice_id: saved.invoiceId! });
    expect(await balance(u)).toBe(200);
    const [after] = await db.select().from(walletDeposits).where(eq(walletDeposits.id, dep.id));
    expect(after).toMatchObject({ status: "credited", receipt: "QWE123RTY" });
    // The status check uses the secret key.
    expect(calls.find((c) => c.path.endsWith("payment/status/"))!.headers.Authorization).toBe("Bearer ISSecretKey_test_y");
  });

  it("ignores a payment IntaSend says belongs to someone else, and holds an underpayment", async () => {
    const u = await player();
    const dep = await createDeposit(db, u, { amountKes: 500, method: "mpesa" }, NOW);
    await startDeposit(db, dep, u);
    const [{ invoiceId }] = await db.select().from(walletDeposits).where(eq(walletDeposits.id, dep.id));
    // Another invoice, fully paid, but for another reference: a webhook naming it can't credit this top-up.
    invoices.set("INVX", { invoice_id: "INVX", state: "COMPLETE", value: 500, currency: "KES", api_ref: "deposit-someone-else" });
    await handleIntaSendEvent(db, { invoice_id: "INVX", api_ref: depositRef(dep.id) });
    expect(await balance(u)).toBe(0);

    settle(invoiceId!, "COMPLETE", 300);
    await handleIntaSendEvent(db, { invoice_id: invoiceId! });
    expect(await balance(u)).toBe(0);
    const [d] = await db.select().from(walletDeposits).where(eq(walletDeposits.id, dep.id));
    expect(d.status).toBe("held");
  });

  it("marks a declined prompt as not paid", async () => {
    const u = await player();
    const dep = await createDeposit(db, u, { amountKes: 100, method: "mpesa" }, NOW);
    await startDeposit(db, dep, u);
    const [{ invoiceId }] = await db.select().from(walletDeposits).where(eq(walletDeposits.id, dep.id));
    settle(invoiceId!, "FAILED");
    await handleIntaSendEvent(db, { invoice_id: invoiceId! });
    const [d] = await db.select().from(walletDeposits).where(eq(walletDeposits.id, dep.id));
    expect(d).toMatchObject({ status: "failed", note: "Request cancelled by user" });
  });

  it("checks the amount limits", async () => {
    const u = await player();
    await expect(createDeposit(db, u, { amountKes: 5, method: "mpesa" }, NOW)).rejects.toThrow("between");
    await expect(createDeposit(db, u, { amountKes: 25_000, method: "mpesa" }, NOW)).rejects.toThrow("between");
  });
});

describe("card top-ups", () => {
  it("charges the card fee on top and credits only the amount asked for", async () => {
    const u = await player();
    const dep = await createDeposit(db, u, { amountKes: 1000, method: "card", email: "a@b.co" }, NOW);
    expect(dep).toMatchObject({ feeKes: 35, totalKes: 1035 });
    const { redirectUrl } = await startDeposit(db, dep, u);
    expect(redirectUrl).toMatch(/^https:\/\/sandbox\.intasend\.com\/checkout\//);
    const chk = calls.find((c) => c.path === "/api/v1/checkout/")!;
    expect(chk.body).toMatchObject({ method: "CARD-PAYMENT", amount: 1035, redirect_url: `https://g-money.example/wallet?deposit=${dep.id}` });

    invoices.set("INVC", { invoice_id: "INVC", state: "COMPLETE", value: 1035, currency: "KES", api_ref: depositRef(dep.id) });
    await handleIntaSendEvent(db, { invoice_id: "INVC" });
    expect(await balance(u)).toBe(1000);
  });
});

describe("withdrawals", () => {
  async function funded(kes: number) {
    const u = await player();
    await postTransfer(db, "external:intasend", walletOf(u.id), kes, "Prize");
    return u;
  }

  it("waits for the admin by default, with the money set aside at once", async () => {
    const u = await funded(1000);
    const admin = await player({ isAdmin: true });
    const w = await requestWithdrawal(db, u, { amountKes: 500 }, NOW);
    expect(w.status).toBe("requested");
    expect(await balance(u)).toBe(480);
    await expect(requestWithdrawal(db, u, { amountKes: 500 }, NOW)).rejects.toThrow("You have 480");

    const sent = await approveWithdrawal(db, admin, w.id);
    expect(sent.status).toBe("sending");
    const init = calls.find((c) => c.path.endsWith("send-money/initiate/"))!;
    expect(init.body).toMatchObject({ provider: "MPESA-B2C", requires_approval: "NO", transactions: [{ account: u.phone.slice(1), amount: "500" }] });

    // A second approve doesn't send it again.
    await approveWithdrawal(db, admin, w.id);
    expect(calls.filter((c) => c.path.endsWith("send-money/initiate/"))).toHaveLength(1);

    const out = payouts.get(sent.trackingId!)!;
    out.status = "Completed";
    out.transactions[0] = { status: "Successful", status_code: "TS100", provider_reference: "RKT55" };
    await handleIntaSendEvent(db, { tracking_id: sent.trackingId! });
    const [done] = await db.select().from(withdrawals).where(eq(withdrawals.id, w.id));
    expect(done).toMatchObject({ status: "paid", receipt: "RKT55" });
    expect(await accountBalance(db, PLATFORM_FEES)).toBe(20);
    expect(await accountBalance(db, `withdrawal:${w.id}`)).toBe(0);
  });

  it("returns the money when M-Pesa refuses or the admin rejects", async () => {
    process.env.WITHDRAW_AUTO_MAX_KES = "1000";
    const u = await funded(1000);
    const admin = await player({ isAdmin: true });
    const w = await requestWithdrawal(db, u, { amountKes: 300 }, NOW);
    expect(w.status).toBe("sending");
    const out = payouts.get(w.trackingId!)!;
    out.transactions[0] = { status: "Failed", status_code: "TF102", status_description: "Invalid account" };
    await handleIntaSendEvent(db, { tracking_id: w.trackingId! });
    expect(await balance(u)).toBe(1000);

    payoutReply = "refuse";
    const refused = await requestWithdrawal(db, u, { amountKes: 300 }, NOW);
    expect(refused.status).toBe("failed");
    expect(await balance(u)).toBe(1000);

    delete process.env.WITHDRAW_AUTO_MAX_KES;
    const asked = await requestWithdrawal(db, u, { amountKes: 400 }, NOW);
    await expect(rejectWithdrawal(db, admin, asked.id, "")).rejects.toThrow("reason");
    await rejectWithdrawal(db, admin, asked.id, "Play a few games first");
    expect(await balance(u)).toBe(1000);
  });

  it("keeps an unclear payout aside until the admin checks it", async () => {
    process.env.WITHDRAW_AUTO_MAX_KES = "1000";
    payoutReply = "network";
    const u = await funded(1000);
    const admin = await player({ isAdmin: true });
    const w = await requestWithdrawal(db, u, { amountKes: 200 }, NOW);
    expect(w.status).toBe("needs_check");
    expect(await balance(u)).toBe(780);
    await expect(resolveWithdrawal(db, admin, w.id, "check")).rejects.toThrow("tracking id");
    await expect(resolveWithdrawal(db, admin, w.id, "paid")).rejects.toThrow("M-Pesa code");
    await resolveWithdrawal(db, admin, w.id, "failed");
    expect(await balance(u)).toBe(1000);
  });

  it("can't be used on an account without a phone", async () => {
    const [u] = await db.insert(users).values({ phone: "test:abc", username: "nophone" }).returning();
    await postTransfer(db, "external:intasend", walletOf(u.id), 1000, "Prize");
    await expect(requestWithdrawal(db, u, { amountKes: 200, phone: "0712345678" }, NOW)).rejects.toThrow("phone number");
  });
});

describe("gift card orders through IntaSend", () => {
  it("delivers the card once IntaSend confirms the M-Pesa payment", async () => {
    const admin = await player({ isAdmin: true });
    await setUsdKesRate(db, admin, 130);
    await syncProducts(db, admin, new TestSupplier());
    const [p] = await db.select().from(products).where(eq(products.brand, "PlayStation"));
    await setProductEnabled(db, admin, p.id, true);
    const buyer = await player();
    const order = await createOrder(db, buyer, { productId: p.id, faceCents: p.denominations[0].faceCents, method: "mpesa" }, "test", NOW);
    await startPayment(db, order, buyer);
    const [o1] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(invoices.get(o1.paymentRef!)!.api_ref).toBe(orderRef(order.id));

    settle(o1.paymentRef!, "COMPLETE");
    await handleIntaSendEvent(db, { invoice_id: o1.paymentRef! });
    const [o2] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(o2.status).toBe("delivered");

    // A result for another order is ignored.
    await applyOrderPayment(db, order.id, { status: "failed", invoiceId: "X", apiRef: "order-other", reason: "no" });
    const [o3] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(o3.status).toBe("delivered");
  });
});

describe("reading payout results", () => {
  it("treats TS100 as sent, failures as failed and the rest as still going", () => {
    expect(readPayout({ tracking_id: "T", transactions: [{ status: "Successful", status_code: "TS100", provider_reference: "R" }] })).toEqual({ status: "paid", trackingId: "T", receipt: "R" });
    expect(readPayout({ tracking_id: "T", status: "Processing", transactions: [{ status: "Pending", status_code: "TP101" }] }).status).toBe("pending");
    expect(readPayout({ tracking_id: "T", status: "Failed Processing", transactions: [] }).status).toBe("failed");
  });
});
