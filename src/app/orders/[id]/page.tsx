import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { BrandTile, Card, OrderBadge, kes, nairobiTime } from "@/components/ui";
import { getDb } from "@/db";
import { orders, products } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { paymentsSimulated, refreshPayment } from "@/lib/shop/checkout";
import { revealCode } from "@/lib/shop/orders";
import { formatFace } from "@/lib/shop/pricing";
import { cancelOrderAction, checkPaymentAction, simulatePaymentAction } from "../../actions";
import { AutoRefresh, CopyButton } from "./client";

const WAITING = ["pending_payment", "paid", "fulfilling"];

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const db = await getDb();
  const load = async () => (await db.select({ o: orders, p: products }).from(orders).innerJoin(products, eq(products.id, orders.productId)).where(eq(orders.id, id)))[0];
  let row = await load();
  if (!row || row.o.userId !== user.id) notFound();
  // Coming back from the card payment page: confirm with Paystack straight away.
  if (row.o.method === "card" && row.o.status === "pending_payment") {
    await refreshPayment(db, row.o).catch(() => undefined);
    row = await load();
  }
  const { o: order, p: product } = row;
  const card = revealCode(order, user);
  const sim = paymentsSimulated() && order.status === "pending_payment" && order.method !== "prize";

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <div className="flex items-center gap-3">
        <BrandTile brand={product.brand} logoUrl={product.logoUrl} className="!w-28 text-sm" />
        <div>
          <h1 className="text-lg font-bold">{product.name}</h1>
          <p className="text-white/70">{formatFace(order.faceCents, product.currency)}</p>
          <OrderBadge status={order.status} />
        </div>
      </div>

      {card && (
        <Card className="border-emerald-400/40">
          <p className="text-sm text-white/70">Your code</p>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 break-all rounded-lg bg-black/40 p-3 font-mono text-lg tracking-wider">{card.code}</code>
            <CopyButton text={card.code} />
          </div>
          {card.pin && (
            <p className="mt-2 text-sm">
              PIN: <code className="font-mono">{card.pin}</code>
            </p>
          )}
          {product.redeemInstructions && <p className="mt-3 whitespace-pre-line text-sm text-white/70">{product.redeemInstructions}</p>}
          <p className="mt-3 text-xs text-white/50">Keep this code private. Anyone with it can use the card.</p>
        </Card>
      )}

      {order.status === "pending_payment" && !sim && (
        <Card>
          {order.method === "mpesa" ? (
            <p>Check your phone for the M-Pesa prompt and enter your PIN. This page updates when the payment arrives.</p>
          ) : (
            <p>Waiting for the card payment to be confirmed.</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionForm action={checkPaymentAction.bind(null, order.id)} submitLabel="I have paid, check now" buttonClassName="btn-secondary" />
            <ActionForm action={cancelOrderAction.bind(null, order.id)} submitLabel="Cancel order" buttonClassName="btn-danger" confirmText="Cancel this order?" />
          </div>
        </Card>
      )}

      {sim && (
        <Card className="border-amber-400/40">
          <p className="text-sm text-amber-200">Test site: pretend to pay {kes(order.totalKes)}.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionForm action={simulatePaymentAction.bind(null, order.id, "paid")} submitLabel="Pay (test)" />
            <ActionForm action={simulatePaymentAction.bind(null, order.id, "failed")} submitLabel="Decline (test)" buttonClassName="btn-secondary" />
          </div>
        </Card>
      )}

      {(order.status === "held" || order.status === "needs_check") && (
        <Card>
          {order.method === "prize"
            ? "You won this card! It will be sent once the tournament results are checked."
            : "Payment received. We are doing a quick safety check on this order and your code will appear here shortly. If anything is wrong you get a full refund."}
        </Card>
      )}
      {order.status === "failed" && (
        <Card>The supplier could not issue this card. Your money will be refunded to you in full. No action is needed.</Card>
      )}
      {order.status === "cancelled" && <Card>This order was cancelled{order.failureReason ? `: ${order.failureReason}` : ""}. You were not charged.</Card>}
      {order.status === "refunded" && <Card>This order was refunded.</Card>}

      <Card className="text-sm">
        <div className="flex justify-between"><span>Order</span><span className="font-mono text-xs">{order.id.slice(0, 8)}</span></div>
        <div className="flex justify-between"><span>Placed</span><span>{nairobiTime(order.createdAt)}</span></div>
        {order.method !== "prize" && (
          <>
            <div className="flex justify-between"><span>Paid with</span><span>{order.method === "mpesa" ? "M-Pesa" : "Card"}</span></div>
            <div className="flex justify-between"><span>Total</span><span>{kes(order.totalKes)}</span></div>
          </>
        )}
        {order.paymentReceipt && order.method === "mpesa" && (
          <div className="flex justify-between"><span>M-Pesa receipt</span><span>{order.paymentReceipt}</span></div>
        )}
      </Card>

      <Link href="/orders" className="text-sm text-emerald-300">All my orders</Link>
      {WAITING.includes(order.status) && <AutoRefresh />}
    </div>
  );
}
