import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { users, walletDeposits, withdrawals, type User, type WalletDeposit, type Withdrawal } from "@/db/schema";
import { config } from "./config";
import { UserError } from "./errors";
import * as intasend from "./payments/intasend";
import { normaliseKenyanPhone } from "./phone";
import { cardFeeKes } from "./shop/pricing";
import { applyOrderPayment, orderRef, paymentsSimulated } from "./shop/checkout";
import { shopLimits } from "./shop/orders";
import { accountBalance, lockWallets, PLATFORM_FEES, postTransfer, walletOf } from "./wallet";

/**
 * Real money into and out of player wallets through IntaSend: M-Pesa or card top-ups, and withdrawals
 * to M-Pesa. Prizes (tournaments, matches, weekly leaderboards) are paid into the wallet; players
 * withdraw from there.
 *
 * Ledger accounts: money arrives from "external:intasend"; a withdrawal is set aside in
 * "withdrawal:<id>" until IntaSend confirms, then goes to "external:intasend" (and the fee to platform fees).
 */
export const INTASEND = "external:intasend";
const held = (w: { id: string }) => `withdrawal:${w.id}`;
export const depositRef = (id: string) => `deposit-${id}`;

const num = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && process.env[name] !== "" && process.env[name] !== undefined ? v : fallback;
};

export const walletLimits = {
  topUpMinKes: () => num("TOPUP_MIN_KES", 10),
  topUpMaxKes: () => num("TOPUP_MAX_KES", 20_000),
  topUpDailyKes: () => num("TOPUP_DAILY_KES", 50_000),
  withdrawMinKes: () => num("WITHDRAW_MIN_KES", 100),
  withdrawFeeKes: () => num("WITHDRAW_FEE_KES", 20),
  withdrawDailyKes: () => num("WITHDRAW_DAILY_KES", 50_000),
  /** Withdrawals up to this size go straight out; bigger ones wait for the admin. 0 = the admin approves all. */
  withdrawAutoMaxKes: () => num("WITHDRAW_AUTO_MAX_KES", 0),
};

/**
 * Top-ups and withdrawals only make sense where the wallet is used for paid entry. On a test site
 * (TEST_FUNDS) the wallet holds play money, so real IntaSend payments are never allowed there; only
 * simulated ones.
 */
export function walletPaymentsOn(): boolean {
  if (paymentsSimulated()) return true;
  return config.paidEntryEnabled() && !config.testFunds() && intasend.intasendConfigured();
}

function requireOn(user: User) {
  if (!walletPaymentsOn()) throw new UserError("Wallet top-ups and withdrawals are not open yet");
  if (user.bannedAt) throw new UserError("Your account is suspended");
}

const DAY = 24 * 60 * 60 * 1000;
const isTestAccount = (u: User) => u.phone.startsWith("test:");

// ---------------------------------------------------------------- top-ups

export async function createDeposit(
  db: Db,
  user: User,
  input: { amountKes: number; method: "mpesa" | "card"; email?: string },
  now = new Date(),
): Promise<WalletDeposit> {
  requireOn(user);
  const amount = Math.floor(input.amountKes);
  const { topUpMinKes, topUpMaxKes, topUpDailyKes } = walletLimits;
  if (!(amount >= topUpMinKes() && amount <= topUpMaxKes())) {
    throw new UserError(`Top up between KES ${topUpMinKes().toLocaleString("en-KE")} and KES ${topUpMaxKes().toLocaleString("en-KE")}`);
  }
  if (input.method === "mpesa" && isTestAccount(user) && !paymentsSimulated()) throw new UserError("Sign in with your phone number to pay with M-Pesa");
  if (input.method === "card" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email ?? "")) throw new UserError("Enter your email address for card payments");
  const [{ total }] = await db
    .select({ total: sql<number>`coalesce(sum(${walletDeposits.amountKes}), 0)::int` })
    .from(walletDeposits)
    .where(and(eq(walletDeposits.userId, user.id), gte(walletDeposits.createdAt, new Date(now.getTime() - DAY)), inArray(walletDeposits.status, ["pending", "credited", "held"])));
  if (total + amount > topUpDailyKes()) throw new UserError(`You can top up KES ${topUpDailyKes().toLocaleString("en-KE")} a day`);
  const fee = input.method === "card" ? cardFeeKes(amount, shopLimits.cardFeePercent()) : 0;
  const [dep] = await db
    .insert(walletDeposits)
    .values({
      userId: user.id,
      method: input.method,
      amountKes: amount,
      feeKes: fee,
      totalKes: amount + fee,
      payerEmail: input.method === "card" ? input.email!.trim() : null,
      createdAt: now,
    })
    .returning();
  return dep;
}

/** Sends the M-Pesa prompt, or returns IntaSend's card page to send the player to. */
export async function startDeposit(db: Db, dep: WalletDeposit, user: User): Promise<{ redirectUrl?: string }> {
  if (paymentsSimulated()) return {};
  try {
    if (dep.method === "mpesa") {
      const invoiceId = await intasend.stkPush({ phone: user.phone, amountKes: dep.totalKes, apiRef: depositRef(dep.id), narrative: "G-Money wallet top-up" });
      await db.update(walletDeposits).set({ invoiceId }).where(eq(walletDeposits.id, dep.id));
      return {};
    }
    const { url, checkoutId } = await intasend.cardCheckout({ email: dep.payerEmail!, amountKes: dep.totalKes, apiRef: depositRef(dep.id), redirectPath: `/wallet?deposit=${dep.id}` });
    await db.update(walletDeposits).set({ checkoutId }).where(eq(walletDeposits.id, dep.id));
    return { redirectUrl: url };
  } catch (err) {
    await db.update(walletDeposits).set({ status: "failed", note: err instanceof Error ? err.message.slice(0, 300) : "Could not start" }).where(eq(walletDeposits.id, dep.id));
    throw new UserError("The payment could not start. Please try again.");
  }
}

/**
 * Applies IntaSend's answer about a top-up. Only call it with a result from IntaSend's status check.
 * Safe to call any number of times: the wallet is credited once.
 */
export async function applyDepositPayment(db: Db, depositId: string, r: intasend.CollectionResult, now = new Date()): Promise<WalletDeposit | null> {
  if (r.apiRef !== depositRef(depositId)) return null;
  return db.transaction(async (tx) => {
    const [dep] = await tx.select().from(walletDeposits).where(eq(walletDeposits.id, depositId)).for("update");
    if (!dep) return null;
    if (r.status === "pending") {
      if (!dep.invoiceId) await tx.update(walletDeposits).set({ invoiceId: r.invoiceId }).where(eq(walletDeposits.id, dep.id));
      return dep;
    }
    if (r.status === "failed") {
      if (dep.status !== "pending") return dep;
      const [d] = await tx.update(walletDeposits).set({ status: "failed", note: r.reason }).where(eq(walletDeposits.id, dep.id)).returning();
      return d;
    }
    // Paid. A top-up marked failed (e.g. the player cancelled) can still be paid late: credit it then.
    if (dep.status !== "pending" && dep.status !== "failed") return dep;
    const short = r.currency !== "KES" || !(r.amountKes >= dep.totalKes);
    if (short) {
      const [d] = await tx
        .update(walletDeposits)
        .set({ status: "held", invoiceId: r.invoiceId, receipt: r.receipt, note: `Paid ${r.currency} ${r.amountKes}, expected KES ${dep.totalKes}` })
        .where(eq(walletDeposits.id, dep.id))
        .returning();
      return d;
    }
    await postTransfer(tx, INTASEND, walletOf(dep.userId), dep.amountKes, `Top-up via ${dep.method === "mpesa" ? "M-Pesa" : "card"} ${r.receipt}`);
    const [d] = await tx
      .update(walletDeposits)
      .set({ status: "credited", invoiceId: r.invoiceId, receipt: r.receipt, note: null, creditedAt: now })
      .where(eq(walletDeposits.id, dep.id))
      .returning();
    return d;
  });
}

/** Asks IntaSend directly, for when the webhook is slow. invoiceHint comes from the card page's return address. */
export async function refreshDeposit(db: Db, dep: WalletDeposit, invoiceHint?: string): Promise<void> {
  if (dep.status !== "pending" || paymentsSimulated() || !intasend.intasendConfigured()) return;
  const invoiceId = dep.invoiceId ?? invoiceHint;
  if (!invoiceId) return;
  await applyDepositPayment(db, dep.id, await intasend.paymentStatus(invoiceId));
}

export async function cancelDeposit(db: Db, user: User, depositId: string): Promise<void> {
  const [dep] = await db.select().from(walletDeposits).where(eq(walletDeposits.id, depositId));
  if (!dep || dep.userId !== user.id) throw new UserError("Top-up not found");
  await refreshDeposit(db, dep);
  await db
    .update(walletDeposits)
    .set({ status: "failed", note: "Cancelled" })
    .where(and(eq(walletDeposits.id, depositId), eq(walletDeposits.status, "pending")));
}

/** Test sites only: press "pay" or "fail" instead of using M-Pesa or a card. */
export async function simulateDeposit(db: Db, user: User, depositId: string, outcome: "paid" | "failed"): Promise<void> {
  if (!paymentsSimulated()) throw new UserError("Test payments are switched off");
  const [dep] = await db.select().from(walletDeposits).where(eq(walletDeposits.id, depositId));
  if (!dep || dep.userId !== user.id) throw new UserError("Top-up not found");
  const invoiceId = dep.invoiceId ?? `SIM-${dep.id}`;
  const apiRef = depositRef(dep.id);
  await applyDepositPayment(
    db,
    dep.id,
    outcome === "paid"
      ? { status: "paid", invoiceId, apiRef, amountKes: dep.totalKes, currency: "KES", receipt: `SIM${Date.now().toString(36).toUpperCase()}` }
      : { status: "failed", invoiceId, apiRef, reason: "Test payment declined" },
  );
}

// ---------------------------------------------------------------- withdrawals

async function withdrawnLast24h(db: Db, userId: string, now: Date): Promise<number> {
  const [{ total }] = await db
    .select({ total: sql<number>`coalesce(sum(${withdrawals.amountKes}), 0)::int` })
    .from(withdrawals)
    .where(and(eq(withdrawals.userId, userId), gte(withdrawals.createdAt, new Date(now.getTime() - DAY)), inArray(withdrawals.status, ["requested", "sending", "paid", "needs_check"])));
  return total;
}

/**
 * Sets the money aside from the wallet at once, so it can't be spent twice, then sends it if it is
 * under the automatic limit. Real payouts always go to the account's own (verified) phone number.
 */
export async function requestWithdrawal(db: Db, user: User, input: { amountKes: number; phone?: string }, now = new Date()): Promise<Withdrawal> {
  requireOn(user);
  const amount = Math.floor(input.amountKes);
  const fee = walletLimits.withdrawFeeKes();
  if (!(amount >= walletLimits.withdrawMinKes())) throw new UserError(`The smallest withdrawal is KES ${walletLimits.withdrawMinKes().toLocaleString("en-KE")}`);
  let phone = user.phone;
  if (isTestAccount(user)) {
    // Only reachable on a simulated test site (real payments need a phone sign-in).
    if (!paymentsSimulated()) throw new UserError("Sign in with your phone number to withdraw");
    const typed = normaliseKenyanPhone(input.phone ?? "");
    if (!typed) throw new UserError("Enter the M-Pesa number to send to");
    phone = typed;
  }
  if ((await withdrawnLast24h(db, user.id, now)) + amount > walletLimits.withdrawDailyKes()) {
    throw new UserError(`You can withdraw up to KES ${walletLimits.withdrawDailyKes().toLocaleString("en-KE")} a day`);
  }
  const w = await db.transaction(async (tx) => {
    await lockWallets(tx, [user.id]);
    const balance = await accountBalance(tx, walletOf(user.id));
    if (balance < amount + fee) {
      throw new UserError(`You have ${balance.toLocaleString("en-KE")} KES. Withdrawing ${amount.toLocaleString("en-KE")} needs ${(amount + fee).toLocaleString("en-KE")} with the KES ${fee} fee.`);
    }
    const [row] = await tx.insert(withdrawals).values({ userId: user.id, amountKes: amount, feeKes: fee, phone, createdAt: now }).returning();
    await postTransfer(tx, walletOf(user.id), held(row), amount + fee, `Withdrawal to M-Pesa ${phone}`);
    return row;
  });
  if (amount <= walletLimits.withdrawAutoMaxKes()) return sendWithdrawal(db, w.id, now);
  return w;
}

/** Hands a requested withdrawal to IntaSend. Only one caller can claim it, so it is never sent twice. */
export async function sendWithdrawal(db: Db, withdrawalId: string, now = new Date()): Promise<Withdrawal> {
  const [w] = await db
    .update(withdrawals)
    .set({ status: "sending", sentAt: now })
    .where(and(eq(withdrawals.id, withdrawalId), eq(withdrawals.status, "requested")))
    .returning();
  if (!w) {
    const [current] = await db.select().from(withdrawals).where(eq(withdrawals.id, withdrawalId));
    if (!current) throw new UserError("Withdrawal not found");
    return current;
  }
  if (paymentsSimulated()) {
    return applyPayoutResult(db, w.id, { status: "paid", trackingId: `SIM-${w.id}`, receipt: `SIM${Date.now().toString(36).toUpperCase()}` }, now);
  }
  const [owner] = await db.select().from(users).where(eq(users.id, w.userId));
  let trackingId: string;
  try {
    trackingId = await intasend.sendToMpesa({ phone: w.phone, name: owner?.username ?? "G-Money player", amountKes: w.amountKes, narrative: "G-Money withdrawal" });
  } catch (err) {
    // A clear refusal (bad request, low balance) means nothing was sent. Anything else might have been.
    const refused = err instanceof intasend.IntaSendError && err.status >= 400 && err.status < 500;
    const reason = err instanceof Error ? err.message.slice(0, 300) : String(err);
    if (refused) return applyPayoutResult(db, w.id, { status: "failed", trackingId: "", reason }, now);
    const [x] = await db.update(withdrawals).set({ status: "needs_check", note: reason }).where(eq(withdrawals.id, w.id)).returning();
    return x;
  }
  const [x] = await db.update(withdrawals).set({ trackingId }).where(eq(withdrawals.id, w.id)).returning();
  return x;
}

/** Records how a payout ended. Paid: the set-aside money leaves. Failed: it goes back to the wallet. */
export async function applyPayoutResult(db: Db, withdrawalId: string, r: intasend.PayoutResult, now = new Date()): Promise<Withdrawal> {
  return db.transaction(async (tx) => {
    const [w] = await tx.select().from(withdrawals).where(eq(withdrawals.id, withdrawalId)).for("update");
    if (!w) throw new UserError("Withdrawal not found");
    if (r.status === "pending" || !["sending", "needs_check"].includes(w.status)) return w;
    if (r.status === "paid") {
      await postTransfer(tx, held(w), INTASEND, w.amountKes, `Withdrawal sent ${r.receipt}`);
      if (w.feeKes > 0) await postTransfer(tx, held(w), PLATFORM_FEES, w.feeKes, "Withdrawal fee");
      const [x] = await tx.update(withdrawals).set({ status: "paid", receipt: r.receipt, completedAt: now, note: null }).where(eq(withdrawals.id, w.id)).returning();
      return x;
    }
    await postTransfer(tx, held(w), walletOf(w.userId), w.amountKes + w.feeKes, "Withdrawal returned: M-Pesa did not accept it");
    const [x] = await tx.update(withdrawals).set({ status: "failed", note: r.reason, completedAt: now }).where(eq(withdrawals.id, w.id)).returning();
    return x;
  });
}

export async function refreshWithdrawal(db: Db, w: Withdrawal): Promise<Withdrawal> {
  if (!["sending", "needs_check"].includes(w.status) || !w.trackingId || paymentsSimulated() || !intasend.intasendConfigured()) return w;
  return applyPayoutResult(db, w.id, await intasend.payoutStatus(w.trackingId));
}

// ---------------------------------------------------------------- admin

function mustAdmin(u: User) {
  if (!u.isAdmin) throw new UserError("Only admins can do this");
}

export async function approveWithdrawal(db: Db, admin: User, withdrawalId: string): Promise<Withdrawal> {
  mustAdmin(admin);
  await db.update(withdrawals).set({ reviewedBy: admin.id }).where(and(eq(withdrawals.id, withdrawalId), eq(withdrawals.status, "requested")));
  return sendWithdrawal(db, withdrawalId);
}

export async function rejectWithdrawal(db: Db, admin: User, withdrawalId: string, reason: string): Promise<void> {
  mustAdmin(admin);
  if (!reason.trim()) throw new UserError("Give a reason; the player sees it");
  await db.transaction(async (tx) => {
    const [w] = await tx.select().from(withdrawals).where(eq(withdrawals.id, withdrawalId)).for("update");
    if (!w || w.status !== "requested") throw new UserError("Only withdrawals waiting for approval can be rejected");
    await postTransfer(tx, held(w), walletOf(w.userId), w.amountKes + w.feeKes, `Withdrawal not approved: ${reason.trim()}`);
    await tx.update(withdrawals).set({ status: "rejected", note: reason.trim(), reviewedBy: admin.id, completedAt: new Date() }).where(eq(withdrawals.id, w.id));
  });
}

/**
 * For a payout whose result is unclear: asks IntaSend if there is a tracking id; otherwise the admin
 * checks the IntaSend dashboard and says whether it went out (with the M-Pesa code) or not.
 */
export async function resolveWithdrawal(db: Db, admin: User, withdrawalId: string, outcome: "check" | "paid" | "failed", code = ""): Promise<Withdrawal> {
  mustAdmin(admin);
  const [w] = await db.select().from(withdrawals).where(eq(withdrawals.id, withdrawalId));
  if (!w || !["sending", "needs_check"].includes(w.status)) throw new UserError("That withdrawal is not waiting on a result");
  if (outcome === "check") {
    if (!w.trackingId) throw new UserError("IntaSend never returned a tracking id. Check the IntaSend dashboard, then mark it sent or not sent.");
    return refreshWithdrawal(db, w);
  }
  if (outcome === "paid" && !code.trim()) throw new UserError("Enter the M-Pesa code from the IntaSend dashboard");
  return applyPayoutResult(
    db,
    w.id,
    outcome === "paid" ? { status: "paid", trackingId: w.trackingId ?? "", receipt: code.trim() } : { status: "failed", trackingId: w.trackingId ?? "", reason: `Checked by admin: not sent` },
  );
}

export async function creditHeldDeposit(db: Db, admin: User, depositId: string, amountKes: number): Promise<void> {
  mustAdmin(admin);
  const amount = Math.floor(amountKes);
  if (!(amount > 0)) throw new UserError("Enter the KES amount to add to the wallet");
  await db.transaction(async (tx) => {
    const [d] = await tx.select().from(walletDeposits).where(eq(walletDeposits.id, depositId)).for("update");
    if (!d || d.status !== "held") throw new UserError("That top-up is not waiting for a decision");
    await postTransfer(tx, INTASEND, walletOf(d.userId), amount, `Top-up ${d.receipt ?? ""} (checked by admin)`.trim());
    await tx.update(walletDeposits).set({ status: "credited", amountKes: amount, creditedAt: new Date() }).where(eq(walletDeposits.id, d.id));
  });
}

export async function markDepositRefunded(db: Db, admin: User, depositId: string, note: string): Promise<void> {
  mustAdmin(admin);
  if (!note.trim()) throw new UserError("Note how the money was sent back");
  const res = await db
    .update(walletDeposits)
    .set({ status: "refunded", note: note.trim() })
    .where(and(eq(walletDeposits.id, depositId), eq(walletDeposits.status, "held")))
    .returning();
  if (!res.length) throw new UserError("That top-up is not waiting for a decision");
}

export async function walletAttention(db: Db) {
  const ws = await db
    .select({ w: withdrawals, username: users.username })
    .from(withdrawals)
    .innerJoin(users, eq(users.id, withdrawals.userId))
    .where(inArray(withdrawals.status, ["requested", "sending", "needs_check"]))
    .orderBy(withdrawals.createdAt);
  const ds = await db
    .select({ d: walletDeposits, username: users.username })
    .from(walletDeposits)
    .innerJoin(users, eq(users.id, walletDeposits.userId))
    .where(eq(walletDeposits.status, "held"))
    .orderBy(walletDeposits.createdAt);
  return { withdrawals: ws, deposits: ds };
}

// ---------------------------------------------------------------- player view

export async function myWalletActivity(db: Db, userId: string) {
  const deps = await db.select().from(walletDeposits).where(eq(walletDeposits.userId, userId)).orderBy(desc(walletDeposits.createdAt)).limit(10);
  const outs = await db.select().from(withdrawals).where(eq(withdrawals.userId, userId)).orderBy(desc(withdrawals.createdAt)).limit(10);
  return { deposits: deps, withdrawals: outs };
}

// ---------------------------------------------------------------- webhooks

/**
 * One endpoint takes every IntaSend event. The body is only used to find which record it is about;
 * the outcome always comes from asking IntaSend.
 */
export async function handleIntaSendEvent(db: Db, body: Record<string, unknown>): Promise<void> {
  if (typeof body.invoice_id === "string" && body.invoice_id) {
    const r = await intasend.paymentStatus(body.invoice_id);
    const ref = r.apiRef ?? "";
    if (ref.startsWith("deposit-")) await applyDepositPayment(db, ref.slice("deposit-".length), r);
    else if (ref.startsWith("order-")) {
      const orderId = ref.slice("order-".length);
      if (orderRef(orderId) === ref) await applyOrderPayment(db, orderId, r);
    }
    return;
  }
  if (typeof body.tracking_id === "string" && body.tracking_id) {
    const [w] = await db.select().from(withdrawals).where(eq(withdrawals.trackingId, body.tracking_id));
    if (w) await refreshWithdrawal(db, w);
  }
}
