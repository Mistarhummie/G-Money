import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { BrandTile, Card, OrderBadge, kes, nairobiTime } from "@/components/ui";
import { getDb } from "@/db";
import { orders, products, users } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { paymentsSimulated } from "@/lib/shop/checkout";
import { ordersNeedingAttention, salesSummary, shopLimits, usdKesRate } from "@/lib/shop/orders";
import { formatFace, priceKes } from "@/lib/shop/pricing";
import { getSupplier } from "@/lib/shop/suppliers";
import { adminOrderAction, refundOrderAction, setRateAction, syncProductsAction, toggleProductAction } from "../../actions";

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

export default async function ShopAdminPage() {
  await requireAdmin();
  const db = await getDb();
  const supplier = getSupplier();
  const [rate, attention, today, week, list, recent, balance] = await Promise.all([
    usdKesRate(db),
    ordersNeedingAttention(db),
    salesSummary(db, daysAgo(1)),
    salesSummary(db, daysAgo(7)),
    db.select().from(products).where(eq(products.supplier, supplier.name)).orderBy(products.brand, products.name),
    db
      .select({ o: orders, p: products, username: users.username, phone: users.phone })
      .from(orders)
      .innerJoin(products, eq(products.id, orders.productId))
      .innerJoin(users, eq(users.id, orders.userId))
      .orderBy(desc(orders.createdAt))
      .limit(30),
    supplier.balanceUsd().catch(() => null),
  ]);
  // Rough profit: what customers paid minus what the cards cost us, at today's rate.
  const profit = (s: { revenueKes: number; costUsdCents: number }) => (rate ? Math.round(s.revenueKes - (s.costUsdCents / 100) * rate) : null);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Shop admin</h1>
        <Link href="/admin" className="btn-secondary">Tournament admin</Link>
      </div>

      {supplier.name === "test" && (
        <p className="rounded-lg bg-amber-500/15 p-3 text-sm text-amber-200">
          Test supplier: cards and codes are fake.{paymentsSimulated() ? " Payments are simulated." : ""} Switch to Reloadly once the business is registered.
        </p>
      )}

      <section className="grid gap-3 sm:grid-cols-4">
        <Card>
          <p className="text-xs text-white/60">Supplier balance</p>
          <p className="text-xl font-semibold">{balance == null ? "Unavailable" : `$${balance.toFixed(2)}`}</p>
        </Card>
        <Card>
          <p className="text-xs text-white/60">Last 24 hours</p>
          <p className="text-xl font-semibold">{kes(today.revenueKes)}</p>
          <p className="text-xs text-white/60">{today.count} cards · profit ≈ {profit(today) == null ? "?" : kes(profit(today)!)}</p>
        </Card>
        <Card>
          <p className="text-xs text-white/60">Last 7 days</p>
          <p className="text-xl font-semibold">{kes(week.revenueKes)}</p>
          <p className="text-xs text-white/60">{week.count} cards · profit ≈ {profit(week) == null ? "?" : kes(profit(week)!)}</p>
        </Card>
        <Card>
          <p className="text-xs text-white/60">Dollar rate</p>
          <ActionForm action={setRateAction} submitLabel="Save" className="mt-1 flex gap-2" buttonClassName="btn-primary !px-3 !py-1">
            <input name="rate" type="number" step="0.01" min={50} max={1000} defaultValue={rate ?? ""} placeholder="KES per $1" required className="input !py-1" />
          </ActionForm>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Orders needing you ({attention.length})</h2>
        {attention.length === 0 && <Card className="text-sm text-white/60">Nothing waiting.</Card>}
        {attention.map(({ order, product, phone, username }) => (
          <Card key={order.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                <strong>{product.brand} {formatFace(order.faceCents, product.currency)}</strong> for {username ?? phone} ({phone}) ·{" "}
                {order.method === "prize" ? "Tournament prize" : `${kes(order.totalKes)} by ${order.method === "mpesa" ? "M-Pesa" : "card"}`}
              </span>
              <OrderBadge status={order.status} />
            </div>
            <p className="text-xs text-white/60">
              {nairobiTime(order.createdAt)}
              {order.paymentReceipt && ` · receipt ${order.paymentReceipt}`}
              {order.heldReason && ` · held: ${order.heldReason}`}
              {order.failureReason && ` · ${order.failureReason}`}
            </p>
            <div className="flex flex-wrap items-end gap-2">
              {order.status === "held" && (
                <ActionForm
                  action={adminOrderAction.bind(null, order.id, "approve")}
                  submitLabel={order.method === "prize" ? "Send prize" : "Approve and send"}
                  className="flex flex-col"
                  confirmText="Buy this card from the supplier and deliver it?"
                />
              )}
              {order.status === "paid" && (
                <ActionForm action={adminOrderAction.bind(null, order.id, "send")} submitLabel="Send now" className="flex flex-col" />
              )}
              {order.status === "needs_check" && (
                <ActionForm
                  action={adminOrderAction.bind(null, order.id, "recheck")}
                  submitLabel="Check with supplier"
                  className="flex flex-col"
                  confirmText="Ask the supplier whether this order went through? If it never arrived, it will be sent again."
                />
              )}
              {order.method !== "prize" && order.status !== "paid" && (
                <ActionForm
                  action={refundOrderAction.bind(null, order.id)}
                  submitLabel="Mark refunded"
                  buttonClassName="btn-danger"
                  className="flex gap-2"
                  confirmText="Only do this after you have sent the money back. Continue?"
                >
                  <input name="note" required placeholder="Refund M-Pesa code" className="input !py-1" />
                </ActionForm>
              )}
            </div>
          </Card>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Cards ({list.filter((p) => p.enabled).length} on sale)</h2>
          <ActionForm action={syncProductsAction} submitLabel="Load cards from supplier" buttonClassName="btn-secondary" className="flex flex-col" />
        </div>
        {!rate && <p className="text-sm text-amber-200">Set the dollar rate first. The shop stays closed without it.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((p) => (
            <Card key={p.id} className="flex gap-3">
              <BrandTile brand={p.brand} logoUrl={p.logoUrl} className="!w-24 text-xs" />
              <div className="flex flex-1 flex-col gap-1 text-sm">
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-white/60">
                  {p.denominations
                    .map((d) => `${formatFace(d.faceCents, p.currency)} → ${rate ? kes(priceKes(d.costUsdCents, rate, shopLimits.markupPercent())) : "?"}`)
                    .join(" · ")}
                </p>
                <ActionForm
                  action={toggleProductAction.bind(null, p.id, !p.enabled)}
                  submitLabel={p.enabled ? "Hide from shop" : "Put on sale"}
                  buttonClassName={p.enabled ? "btn-secondary !py-1" : "btn-primary !py-1"}
                  className="mt-auto flex flex-col"
                />
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Recent orders</h2>
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-white/60">
              <tr><th className="py-1">When</th><th>Buyer</th><th>Card</th><th>Paid</th><th>Status</th></tr>
            </thead>
            <tbody>
              {recent.map(({ o, p, username, phone }) => (
                <tr key={o.id} className="border-t border-white/5">
                  <td className="py-1 pr-2">{nairobiTime(o.createdAt)}</td>
                  <td className="pr-2">{username ?? phone}</td>
                  <td className="pr-2">{p.brand} {formatFace(o.faceCents, p.currency)}</td>
                  <td className="pr-2">{o.method === "prize" ? "Prize" : kes(o.totalKes)}</td>
                  <td><OrderBadge status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}
