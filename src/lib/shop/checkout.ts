import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { orders, type Order, type User } from "@/db/schema";
import { UserError } from "../errors";
import * as mpesa from "../payments/mpesa";
import * as paystack from "../payments/paystack";
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
  const sim = paymentsSimulated();
  return { mpesa: sim || mpesa.mpesaConfigured(), card: sim || paystack.paystackConfigured() };
}

/** Starts payment for a new order. Card payments return the Paystack page to send the buyer to. */
export async function startPayment(db: Db, order: Order, user: User): Promise<{ redirectUrl?: string }> {
  if (paymentsSimulated()) {
    await setPaymentRef(db, order.id, `SIM-${order.id}`);
    return {};
  }
  if (order.method === "mpesa") {
    if (!mpesa.mpesaConfigured()) throw new UserError("M-Pesa payments are not set up yet");
    const checkoutId = await mpesa.startStkPush({ phone: user.phone, amountKes: order.totalKes, reference: order.id.slice(0, 12) });
    await setPaymentRef(db, order.id, checkoutId);
    return {};
  }
  if (order.method === "card") {
    if (!paystack.paystackConfigured()) throw new UserError("Card payments are not set up yet");
    const reference = `GM-${order.id}`;
    await setPaymentRef(db, order.id, reference);
    const url = await paystack.startCardPayment({ email: order.payerEmail!, amountKes: order.totalKes, reference, orderId: order.id });
    return { redirectUrl: url };
  }
  throw new UserError("Unknown payment method");
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

/** Asks the payment provider directly, for when a callback is slow or lost. */
export async function refreshPayment(db: Db, order: Order): Promise<void> {
  if (order.status !== "pending_payment" || !order.paymentRef || paymentsSimulated()) return;
  if (order.method === "mpesa" && mpesa.mpesaConfigured()) {
    const r = await mpesa.queryStkPush(order.paymentRef);
    if (r.status === "paid") await paymentSucceeded(db, { orderId: order.id }, { receipt: r.receipt || undefined });
    if (r.status === "failed") await markPaymentFailed(db, { orderId: order.id }, r.reason);
  }
  if (order.method === "card" && paystack.paystackConfigured()) {
    const r = await paystack.verifyCardPayment(order.paymentRef);
    if (r.status === "paid") {
      if (r.currency !== "KES") await markPaymentFailed(db, { orderId: order.id }, `Paid in ${r.currency}, expected KES`);
      else await paymentSucceeded(db, { orderId: order.id }, { amountKes: r.amountKes, receipt: order.paymentRef });
    }
    if (r.status === "failed") await markPaymentFailed(db, { orderId: order.id }, r.reason);
  }
}

/** Test sites only: the buyer presses "pay" or "fail" instead of using M-Pesa or a card. */
export async function simulatePayment(db: Db, user: User, orderId: string, outcome: "paid" | "failed"): Promise<void> {
  if (!paymentsSimulated()) throw new UserError("Test payments are switched off");
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order || order.userId !== user.id) throw new UserError("Order not found");
  if (outcome === "failed") return markPaymentFailed(db, { orderId }, "Test payment declined");
  await paymentSucceeded(db, { orderId }, { amountKes: order.totalKes, receipt: `SIM${Date.now().toString(36).toUpperCase()}` });
}
