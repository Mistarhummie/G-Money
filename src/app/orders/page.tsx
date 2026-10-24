import Link from "next/link";
import { Card, OrderBadge, kes, nairobiTime } from "@/components/ui";
import { getDb } from "@/db";
import { requireUser } from "@/lib/session";
import { myOrders } from "@/lib/shop/orders";
import { formatFace } from "@/lib/shop/pricing";

export default async function OrdersPage() {
  const user = await requireUser();
  const list = await myOrders(await getDb(), user);
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3">
      <h1 className="text-2xl font-bold">My orders</h1>
      {list.length === 0 ? (
        <Card>
          No orders yet. <Link href="/" className="text-emerald-300 underline">Browse gift cards</Link>.
        </Card>
      ) : (
        list.map(({ order, product }) => (
          <Link key={order.id} href={`/orders/${order.id}`}>
            <Card className="flex items-center justify-between gap-3 transition hover:border-emerald-400/50">
              <div>
                <p className="font-medium">
                  {product.brand} {formatFace(order.faceCents, product.currency)}
                  {order.method === "prize" && <span className="ml-2 text-xs text-emerald-300">Prize</span>}
                </p>
                <p className="text-xs text-white/60">{nairobiTime(order.createdAt)}</p>
              </div>
              <div className="text-right">
                <OrderBadge status={order.status} />
                {order.method !== "prize" && <p className="mt-1 text-sm">{kes(order.totalKes)}</p>}
              </div>
            </Card>
          </Link>
        ))
      )}
    </div>
  );
}
