import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { orders, products, settings, users, type Order, type PaymentMethod, type Product, type User } from "@/db/schema";
import { decrypt, encrypt } from "../crypto";
import { UserError } from "../errors";
import { cardFeeKes, priceKes } from "./pricing";
import type { GiftCardSupplier } from "./suppliers";

// ---------------------------------------------------------------- settings

export const SETTING_USD_KES = "usd_kes_rate";

export async function getSetting(db: Db, key: string): Promise<string | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  return row?.value ?? null;
}

export async function setSetting(db: Db, key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}

export async function usdKesRate(db: Db): Promise<number | null> {
  const v = Number(await getSetting(db, SETTING_USD_KES));
  return v > 0 ? v : null;
}

export async function setUsdKesRate(db: Db, admin: User, rate: number): Promise<void> {
  if (!admin.isAdmin) throw new UserError("Only admins can change the exchange rate");
  if (!(rate > 50 && rate < 1000)) throw new UserError("Enter the KES price of one US dollar, e.g. 129.5");
  await setSetting(db, SETTING_USD_KES, String(rate));
}

export const shopLimits = {
  markupPercent: () => Number(process.env.MARKUP_PERCENT ?? 5),
  cardFeePercent: () => Number(process.env.CARD_FEE_PERCENT ?? 3.5),
  /** Accounts younger than this many days are "new". */
  newAccountDays: () => Number(process.env.NEW_ACCOUNT_DAYS ?? 7),
  newAccountDailyKes: () => Number(process.env.NEW_ACCOUNT_DAILY_KES ?? 5000),
  dailyKes: () => Number(process.env.DAILY_LIMIT_KES ?? 50000),
};

// ---------------------------------------------------------------- catalog

/** Imports or refreshes the supplier's catalog. New products start hidden until the admin enables them. */
export async function syncProducts(db: Db, admin: User, supplier: GiftCardSupplier, countryCode = "US"): Promise<number> {
  if (!admin.isAdmin) throw new UserError("Only admins can sync products");
  const list = await supplier.listProducts(countryCode);
  for (const p of list) {
    await db
      .insert(products)
      .values({ supplier: supplier.name, ...p })
      .onConflictDoUpdate({
        target: [products.supplier, products.supplierProductId],
        set: {
          brand: p.brand,
          name: p.name,
          countryCode: p.countryCode,
          currency: p.currency,
          denominations: p.denominations,
          logoUrl: p.logoUrl ?? null,
          redeemInstructions: p.redeemInstructions ?? null,
          updatedAt: new Date(),
        },
      });
  }
  return list.length;
}

export async function setProductEnabled(db: Db, admin: User, productId: string, enabled: boolean): Promise<void> {
  if (!admin.isAdmin) throw new UserError("Only admins can change products");
  await db.update(products).set({ enabled }).where(eq(products.id, productId));
}

export type PricedProduct = Product & { prices: { faceCents: number; priceKes: number }[] };

/** Enabled products from the active supplier, with KES prices. */
export async function catalog(db: Db, supplierName: string): Promise<PricedProduct[]> {
  const rate = await usdKesRate(db);
  if (!rate) return [];
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.enabled, true), eq(products.supplier, supplierName)))
    .orderBy(products.brand, products.name);
  return rows.map((p) => ({
    ...p,
    prices: p.denominations.map((d) => ({ faceCents: d.faceCents, priceKes: priceKes(d.costUsdCents, rate, shopLimits.markupPercent()) })),
  }));
}

// ---------------------------------------------------------------- buying

export type Quote = { priceKes: number; feeKes: number; totalKes: number; costUsdCents: number };

export async function quote(db: Db, product: Product, faceCents: number, method: PaymentMethod): Promise<Quote> {
  const denom = product.denominations.find((d) => d.faceCents === faceCents);
  if (!denom) throw new UserError("That amount is not available");
  const rate = await usdKesRate(db);
  if (!rate) throw new UserError("The shop is not open yet");
  const price = priceKes(denom.costUsdCents, rate, shopLimits.markupPercent());
  const fee = method === "card" ? cardFeeKes(price, shopLimits.cardFeePercent()) : 0;
  return { priceKes: price, feeKes: fee, totalKes: price + fee, costUsdCents: denom.costUsdCents };
}

const DAY = 24 * 60 * 60 * 1000;

/** Spending already counted against today's limit: everything not cancelled or refunded in the last 24 hours. */
async function spentLast24h(db: Db, userId: string, now: Date): Promise<number> {
  const [{ total }] = await db
    .select({ total: sql<number>`coalesce(sum(${orders.totalKes}), 0)::int` })
    .from(orders)
    .where(
      and(
        eq(orders.userId, userId),
        gte(orders.createdAt, new Date(now.getTime() - DAY)),
        inArray(orders.status, ["pending_payment", "held", "paid", "fulfilling", "delivered", "needs_check"]),
      ),
    );
  return total;
}

export async function createOrder(
  db: Db,
  user: User,
  input: { productId: string; faceCents: number; method: "mpesa" | "card"; email?: string },
  supplierName: string,
  now = new Date(),
): Promise<Order> {
  if (user.bannedAt) throw new UserError("Your account is suspended");
  const [product] = await db.select().from(products).where(eq(products.id, input.productId));
  if (!product || !product.enabled || product.supplier !== supplierName) throw new UserError("That card is not available");
  if (input.method === "card" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email ?? "")) {
    throw new UserError("Enter your email address for card payments");
  }
  const q = await quote(db, product, input.faceCents, input.method);

  const isNew = now.getTime() - user.createdAt.getTime() < shopLimits.newAccountDays() * DAY;
  const limit = isNew ? shopLimits.newAccountDailyKes() : shopLimits.dailyKes();
  const spent = await spentLast24h(db, user.id, now);
  if (spent + q.totalKes > limit) {
    throw new UserError(
      isNew
        ? `New accounts can spend up to KES ${limit.toLocaleString("en-KE")} a day. This limit rises after ${shopLimits.newAccountDays()} days.`
        : `The daily limit is KES ${limit.toLocaleString("en-KE")}.`,
    );
  }

  const [order] = await db
    .insert(orders)
    .values({
      userId: user.id,
      productId: product.id,
      faceCents: input.faceCents,
      costUsdCents: q.costUsdCents,
      priceKes: q.priceKes,
      feeKes: q.feeKes,
      totalKes: q.totalKes,
      method: input.method,
      payerEmail: input.method === "card" ? input.email!.trim() : null,
      createdAt: now,
    })
    .returning();
  return order;
}

export async function setPaymentRef(db: Db, orderId: string, ref: string): Promise<void> {
  await db.update(orders).set({ paymentRef: ref }).where(and(eq(orders.id, orderId), eq(orders.status, "pending_payment")));
}

export async function cancelUnpaidOrder(db: Db, orderId: string, reason: string): Promise<void> {
  await db
    .update(orders)
    .set({ status: "cancelled", failureReason: reason })
    .where(and(eq(orders.id, orderId), eq(orders.status, "pending_payment")));
}

/** Why a paid order should wait for the admin, or null if it can go straight out. */
async function holdReason(db: Db, order: Order, now: Date): Promise<string | null> {
  if (order.method !== "card") return null;
  const [user] = await db.select().from(users).where(eq(users.id, order.userId));
  if (now.getTime() - user.createdAt.getTime() < DAY) return "Card payment from an account less than a day old";
  const earlier = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.userId, order.userId), eq(orders.method, "card"), eq(orders.status, "delivered")))
    .limit(1);
  if (!earlier.length) return "First card order on this account";
  return null;
}

/**
 * Records a confirmed payment. Safe to call more than once for the same payment.
 * Returns the order when it is now ready to send to the supplier.
 */
export async function markPaid(
  db: Db,
  match: { orderId?: string; paymentRef?: string },
  payment: { amountKes?: number; receipt?: string },
  now = new Date(),
): Promise<{ order: Order; readyToFulfil: boolean } | null> {
  const where = match.orderId ? eq(orders.id, match.orderId) : eq(orders.paymentRef, match.paymentRef!);
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(where).for("update");
    if (!order) return null;
    if (order.status === "cancelled") {
      // The buyer cancelled (or the prompt timed out) but the money still arrived. Keep it for the admin to send or refund.
      const [updated] = await tx
        .update(orders)
        .set({ status: "held", heldReason: "Payment arrived after the order was cancelled", paidAt: now, paymentReceipt: payment.receipt || null })
        .where(eq(orders.id, order.id))
        .returning();
      return { order: updated, readyToFulfil: false };
    }
    if (order.status !== "pending_payment") return { order, readyToFulfil: order.status === "paid" };
    if (payment.amountKes !== undefined && !Number.isNaN(payment.amountKes) && payment.amountKes < order.totalKes) {
      const [updated] = await tx
        .update(orders)
        .set({ status: "held", heldReason: `Paid KES ${payment.amountKes}, expected KES ${order.totalKes}`, paidAt: now, paymentReceipt: payment.receipt || null })
        .where(eq(orders.id, order.id))
        .returning();
      return { order: updated, readyToFulfil: false };
    }
    const reason = await holdReason(tx as unknown as Db, order, now);
    const [updated] = await tx
      .update(orders)
      .set({ status: reason ? "held" : "paid", heldReason: reason, paidAt: now, paymentReceipt: payment.receipt || null })
      .where(eq(orders.id, order.id))
      .returning();
    return { order: updated, readyToFulfil: !reason };
  });
}

export async function markPaymentFailed(db: Db, match: { orderId?: string; paymentRef?: string }, reason: string): Promise<void> {
  const where = match.orderId ? eq(orders.id, match.orderId) : eq(orders.paymentRef, match.paymentRef!);
  await db
    .update(orders)
    .set({ status: "cancelled", failureReason: reason })
    .where(and(where, eq(orders.status, "pending_payment")));
}

/**
 * Buys the card from the supplier and stores the code. Only one caller can claim a paid order,
 * so a repeated callback can never buy the same card twice.
 */
export async function fulfilOrder(db: Db, orderId: string, supplier: GiftCardSupplier, now = new Date()): Promise<Order> {
  const [claimed] = await db
    .update(orders)
    .set({ status: "fulfilling" })
    .where(and(eq(orders.id, orderId), eq(orders.status, "paid")))
    .returning();
  if (!claimed) {
    const [current] = await db.select().from(orders).where(eq(orders.id, orderId));
    return current;
  }
  const [product] = await db.select().from(products).where(eq(products.id, claimed.productId));
  let result;
  try {
    result = await supplier.order({ supplierProductId: product.supplierProductId, faceCents: claimed.faceCents, reference: claimed.id });
  } catch (err) {
    result = { status: "unknown" as const, reason: err instanceof Error ? err.message : String(err) };
  }
  return saveSupplierResult(db, claimed.id, result, now);
}

async function saveSupplierResult(
  db: Db,
  orderId: string,
  result: Awaited<ReturnType<GiftCardSupplier["order"]>>,
  now: Date,
): Promise<Order> {
  if (result.status === "delivered") {
    const card = result.cards[0];
    const [o] = await db
      .update(orders)
      .set({
        status: "delivered",
        supplierTxId: result.supplierTxId,
        codeEncrypted: encrypt(card.code),
        pinEncrypted: card.pin ? encrypt(card.pin) : null,
        deliveredAt: now,
        failureReason: null,
      })
      .where(eq(orders.id, orderId))
      .returning();
    return o;
  }
  const [o] = await db
    .update(orders)
    .set({ status: result.status === "failed" ? "failed" : "needs_check", failureReason: result.reason })
    .where(eq(orders.id, orderId))
    .returning();
  return o;
}

// ---------------------------------------------------------------- admin

export async function approveHeldOrder(db: Db, admin: User, orderId: string): Promise<void> {
  if (!admin.isAdmin) throw new UserError("Only admins can approve orders");
  const res = await db
    .update(orders)
    .set({ status: "paid", heldReason: null })
    .where(and(eq(orders.id, orderId), eq(orders.status, "held")))
    .returning();
  if (!res.length) throw new UserError("That order is not waiting for approval");
}

/** After the money has been sent back to the customer outside the site. */
export async function markRefunded(db: Db, admin: User, orderId: string, note: string): Promise<void> {
  if (!admin.isAdmin) throw new UserError("Only admins can refund orders");
  if (!note.trim()) throw new UserError("Note how the refund was sent (e.g. the M-Pesa code)");
  const res = await db
    .update(orders)
    .set({ status: "refunded", failureReason: note.trim() })
    .where(and(eq(orders.id, orderId), inArray(orders.status, ["held", "failed", "needs_check"])))
    .returning();
  if (!res.length) throw new UserError("Only held, failed or unchecked orders can be marked refunded");
}

/** For orders whose supplier result was unknown: asks the supplier before doing anything else. */
export async function recheckOrder(db: Db, admin: User, orderId: string, supplier: GiftCardSupplier, now = new Date()): Promise<Order> {
  if (!admin.isAdmin) throw new UserError("Only admins can recheck orders");
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order || order.status !== "needs_check") throw new UserError("That order does not need checking");
  const found = await supplier.findOrder(order.id);
  if (!found) {
    // The supplier never received it, so it is safe to try again.
    await db.update(orders).set({ status: "paid" }).where(and(eq(orders.id, orderId), eq(orders.status, "needs_check")));
    return fulfilOrder(db, orderId, supplier, now);
  }
  return saveSupplierResult(db, orderId, found, now);
}

export async function ordersNeedingAttention(db: Db) {
  return db
    .select({ order: orders, product: products, phone: users.phone, username: users.username })
    .from(orders)
    .innerJoin(products, eq(products.id, orders.productId))
    .innerJoin(users, eq(users.id, orders.userId))
    .where(inArray(orders.status, ["held", "failed", "needs_check", "paid"]))
    .orderBy(orders.createdAt);
}

export async function salesSummary(db: Db, since: Date) {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
      revenueKes: sql<number>`coalesce(sum(${orders.totalKes}), 0)::int`,
      costUsdCents: sql<number>`coalesce(sum(${orders.costUsdCents}), 0)::int`,
    })
    .from(orders)
    .where(and(eq(orders.status, "delivered"), gte(orders.deliveredAt, since), inArray(orders.method, ["mpesa", "card"])));
  return row;
}

// ---------------------------------------------------------------- customer view

export async function myOrders(db: Db, user: User) {
  return db
    .select({ order: orders, product: products })
    .from(orders)
    .innerJoin(products, eq(products.id, orders.productId))
    .where(eq(orders.userId, user.id))
    .orderBy(desc(orders.createdAt))
    .limit(50);
}

/** The code and PIN, only for the order's owner and only once delivered. */
export function revealCode(order: Order, viewer: User): { code: string; pin: string | null } | null {
  if (order.userId !== viewer.id || order.status !== "delivered" || !order.codeEncrypted) return null;
  return { code: decrypt(order.codeEncrypted), pin: order.pinEncrypted ? decrypt(order.pinEncrypted) : null };
}
