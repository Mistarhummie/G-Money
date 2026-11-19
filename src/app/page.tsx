import Link from "next/link";
import { BrandTile, Card, kes } from "@/components/ui";
import { getDb } from "@/db";
import { formatFace } from "@/lib/shop/pricing";
import { catalog } from "@/lib/shop/orders";
import { getSupplier } from "@/lib/shop/suppliers";
import { getCurrentUser } from "@/lib/session";

export default async function ShopHome() {
  const db = await getDb();
  const [items, user] = await Promise.all([catalog(db, getSupplier().name), getCurrentUser()]);

  return (
    <div className="flex flex-col gap-8">
      <section className="hero animate-pop rounded-3xl border border-white/10 p-6 sm:p-10">
        <div className="hero-hex" aria-hidden />
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lilac">Gift cards + games</p>
        <h1 className="mt-2 text-3xl leading-tight sm:text-5xl">
          Gaming gift cards, <span className="text-gradient">paid with M-Pesa.</span>
        </h1>
        <p className="mt-3 max-w-xl text-white/80">
          PlayStation, Xbox, Steam, Google Play and more. Pay in shillings and your code shows up here in seconds. It is also kept
          safe in My orders.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a href="#cards" className="btn-primary">Browse cards</a>
          <Link href="/tournaments" className="btn-secondary">Play tournaments</Link>
        </div>
      </section>

      <section id="cards" className="scroll-mt-20">
        <h2 className="mb-3 text-2xl">Gift cards</h2>
        {items.length === 0 ? (
          <Card>
            The shop opens soon.
            {user?.isAdmin && (
              <>
                {" "}
                Set the dollar rate and switch cards on in <Link href="/admin/shop" className="text-emerald-300 underline">shop admin</Link>.
              </>
            )}
          </Card>
        ) : (
          <div className="reveal grid grid-cols-2 gap-3 sm:grid-cols-3">
            {items.map((p) => {
              const from = Math.min(...p.prices.map((x) => x.priceKes));
              const faces = p.prices.map((x) => formatFace(x.faceCents, p.currency));
              return (
                <Link key={p.id} href={`/shop/${p.id}`} className="rounded-2xl">
                  <Card className="card-link flex h-full flex-col gap-2 !p-3">
                    <BrandTile brand={p.brand} logoUrl={p.logoUrl} morphId={p.id} />
                    <h3 className="text-sm leading-tight">{p.name}</h3>
                    <p className="text-xs text-white/60">
                      {p.countryCode} cards · {faces[0]} to {faces[faces.length - 1]}
                    </p>
                    <p className="price-glow mt-auto font-display text-base font-black">From {kes(from)}</p>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="reveal grid gap-3 text-sm sm:grid-cols-3">
        <Card>
          <h3 className="text-base">Instant codes</h3>
          <p className="mt-1 text-white/70">Most orders are delivered as soon as M-Pesa confirms the payment.</p>
        </Card>
        <Card>
          <h3 className="text-base">Real, licensed cards</h3>
          <p className="mt-1 text-white/70">Every card comes from an authorised distributor, never from resellers.</p>
        </Card>
        <Card>
          <h3 className="text-base">Check the region</h3>
          <p className="mt-1 text-white/70">Cards only work in their region. US cards need a US account on PlayStation, Xbox or Steam.</p>
        </Card>
      </section>
    </div>
  );
}
