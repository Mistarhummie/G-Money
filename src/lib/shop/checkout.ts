import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { orders, type Order, type User } from "@/db/schema";
import { UserError } from "../errors";
import * as intasend from "../payments/intasend";
import { fulfilOrder, markPaid, markPaymentFailed, setPaymentRef } from "./orders";
import { getSupplier } from "./suppliers";

/**
 * "simulated" lets testers pretend to pay on a test site. It is refused in production
 * unless OTP_DEV_MODE is also on, so a live shop can never hand out cards for free.
 */
export function paymentsSimulated(): boolean {
  if (process.env.PAYMENTS_MODE !== "simulated") return false;
  return process.env.NODE_ENV !== "production" || process.env.OTP_DEV_MODE === "true";
}

export function methodsAvailable(): { mpesa: boolean; card: boolean } {
  const on = paymentsSimulated() || intasend.intasendConfigured();
  return { mpesa: on, card: on };
}

/** IntaSend's api_ref for a shop order. Webhooks carry it back so we know which order was paid. */
export const orderRef = (orderId: string) => `order-${orderId}`;

/** Starts payment for a new order. Card payments return IntaSend's card page to send the buyer to. */
export async function startPayment(db: Db, order: Order, user: User): Promise<{ redirectUrl?: string }> {
  if (paymentsSimulated()) {
    await setPaymentRef(db, order.id, `SIM-${order.id}`);
    return {};
  }
  if (!intasend.intasendConfigured()) throw new UserError("Payments are not set up yet");
  if (order.method === "mpesa") {
    if (user.phone.startsWith("test:")) throw new UserError("Sign in with your phone number to pay with M-Pesa");
    const invoiceId = await intasend.stkPush({ phone: user.phone, amountKes: order.totalKes, apiRef: orderRef(order.id), narrative: "G-Money gift card" });
    await setPaymentRef(db, order.id, invoiceId);
    return {};
  }
  if (order.method === "card") {
    const { url, checkoutId } = await intasend.cardCheckout({
      email: order.payerEmail!,
      amountKes: order.totalKes,
      apiRef: orderRef(order.id),
      redirectPath: `/orders/${order.id}`,
    });
    // Replaced by the invoice id once IntaSend reports the payment.
    await setPaymentRef(db, order.id, `checkout:${checkoutId}`);
    return { redirectUrl: url };
  }
  throw new UserError("Unknown payment method");
}

/**
 * Applies IntaSend's answer about an order's payment. The result must come from IntaSend's status check,
 * never straight from a webhook body, and its api_ref must name this order.
 */
export async function applyOrderPayment(db: Db, orderId: string, r: intasend.CollectionResult): Promise<void> {
  if (r.apiRef !== orderRef(orderId)) return;
  if (r.status === "paid") {
    if (r.currency !== "KES") return markPaymentFailed(db, { orderId }, `Paid in ${r.currency}, expected KES`);
    await setPaymentRef(db, orderId, r.invoiceId);
    await paymentSucceeded(db, { orderId }, { amountKes: r.amountKes, receipt: r.receipt });
  } else if (r.status === "failed") {
    await markPaymentFailed(db, { orderId }, r.reason);
  } else {
    await setPaymentRef(db, orderId, r.invoiceId);
  }
}

/** Records a confirmed payment and, when nothing needs checking, buys the card straight away. */
export async function paymentSucceeded(
  db: Db,
  match: { orderId?: string; paymentRef?: string },
  payment: { amountKes?: number; receipt?: string },
): Promise<Order | null> {
  const res = await markPaid(db, match, payment);
  if (!res) return null;
  if (res.readyToFulfil) return fulfilOrder(db, res.order.id, getSupplier());
  return res.order;
}

/**
 * Asks IntaSend directly, for when a webhook is slow or lost. invoiceHint is the id IntaSend adds to the
 * address when a card buyer comes back; it is trusted only if IntaSend says it belongs to this order.
 */
export async function refreshPayment(db: Db, order: Order, invoiceHint?: string): Promise<void> {
  if (order.status !== "pending_payment" || paymentsSimulated() || !intasend.intasendConfigured()) return;
  const invoiceId = order.paymentRef && !order.paymentRef.startsWith("checkout:") ? order.paymentRef : invoiceHint;
  if (!invoiceId) return;
  await applyOrderPayment(db, order.id, await intasend.paymentStatus(invoiceId));
}

/** Test sites only: the buyer presses "pay" or "fail" instead of using M-Pesa or a card. */
export async function simulatePayment(db: Db, user: User, orderId: string, outcome: "paid" | "failed"): Promise<void> {
  if (!paymentsSimulated()) throw new UserError("Test payments are switched off");
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order || order.userId !== user.id) throw new UserError("Order not found");
  if (outcome === "failed") return markPaymentFailed(db, { orderId }, "Test payment declined");
  await paymentSucceeded(db, { orderId }, { amountKes: order.totalKes, receipt: `SIM${Date.now().toString(36).toUpperCase()}` });
}
