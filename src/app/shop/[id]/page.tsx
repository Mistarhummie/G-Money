import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandTile } from "@/components/ui";
import { getDb } from "@/db";
import { products } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { methodsAvailable, paymentsSimulated } from "@/lib/shop/checkout";
import { catalog, shopLimits } from "@/lib/shop/orders";
import { getSupplier } from "@/lib/shop/suppliers";
import { BuyForm } from "./BuyForm";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const [row] = await db.select().from(products).where(eq(products.id, id));
  if (!row) notFound();
  const product = (await catalog(db, getSupplier().name)).find((p) => p.id === id);
  const user = await getCurrentUser();

  return (
    <div className="mx-auto grid max-w-3xl gap-6 sm:grid-cols-[2fr_3fr]">
      <div className="flex flex-col gap-3">
        <BrandTile brand={row.brand} logoUrl={row.logoUrl} />
        <h1 className="text-xl font-bold">{row.name}</h1>
        <p className="rounded-lg bg-amber-500/10 p-2 text-sm text-amber-200">
          Works only on {row.countryCode} accounts. Check your account region before buying. Codes cannot be returned once shown.
        </p>
        {row.redeemInstructions && <p className="whitespace-pre-line text-sm text-white/70">{row.redeemInstructions}</p>}
      </div>
      <div>
        {!product ? (
          <p className="text-white/70">This card is not on sale right now.</p>
        ) : !user ? (
          <div className="flex flex-col gap-3">
            <p className="text-white/80">Sign in with your phone number to buy. It takes a few seconds.</p>
            <Link href={`/login?next=/shop/${id}`} className="btn-primary text-center">Sign in to buy</Link>
          </div>
        ) : (
          <BuyForm
            productId={product.id}
            currency={product.currency}
            prices={product.prices}
            cardFeePercent={shopLimits.cardFeePercent()}
            methods={methodsAvailable()}
            simulated={paymentsSimulated()}
            phone={user.phone}
          />
        )}
      </div>
    </div>
  );
}
