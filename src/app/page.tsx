import Link from "next/link";
import { BrandTile, Card, kes } from "@/components/ui";
import { getDb } from "@/db";
import { CATEGORIES, brandRank, categoryOf } from "@/lib/shop/brands";
import { formatFace } from "@/lib/shop/pricing";
import { catalog, ensureTestCatalog, type PricedProduct } from "@/lib/shop/orders";
import { getSupplier } from "@/lib/shop/suppliers";
import { getCurrentUser } from "@/lib/session";

function CardTile({ p }: { p: PricedProduct }) {
  const from = Math.min(...p.prices.map((x) => x.priceKes));
  const faces = p.prices.map((x) => formatFace(x.faceCents, p.currency));
  return (
    <Link href={`/shop/${p.id}`} className="rounded-2xl">
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
}

const STEPS = [
  ["1", "Pick a card", "Choose the brand and amount. Prices are in shillings, with the card's value in dollars."],
  ["2", "Pay with M-Pesa", "Confirm the prompt on your phone. Bank cards work too."],
  ["3", "Get your code", "Your code shows on screen in seconds and stays safe in My orders."],
];

const FAQ = [
  ["Which region should I buy?", "Most cards here are US cards. They work on accounts set to the United States. If your PlayStation, Xbox or Steam account is set to Kenya, a US card won't redeem."],
  ["How fast is delivery?", "Most codes appear as soon as M-Pesa confirms the payment. A first order paid by bank card can take a little longer while we check it."],
  ["Can I return a card?", "Not once the code has been shown, because a code can't be taken back. Check the brand and region before you pay."],
  ["Is there a spending limit?", "New accounts have a lower daily limit for the first week, to keep everyone's payments safe."],
];

export default async function ShopHome() {
  const db = await getDb();
  const supplier = getSupplier();
  // Test site only: put every placeholder card on sale. Never blocks the page.
  await ensureTestCatalog(db, supplier).catch(() => {});
  const [items, user] = await Promise.all([catalog(db, supplier.name), getCurrentUser()]);
  const groups = CATEGORIES.map((c) => ({ ...c, items: items.filter((p) => categoryOf(p.brand) === c.key).sort((a, b) => brandRank(a.brand) - brandRank(b.brand)) })).filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-10">
      <section className="hero animate-pop rounded-3xl border border-white/10 p-6 sm:p-10">
        <div className="hero-hex" aria-hidden />
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-lilac">Gift cards + games</p>
        <h1 className="mt-2 text-3xl leading-tight sm:text-5xl">
          Gaming gift cards, <span className="text-gradient">paid with M-Pesa.</span>
        </h1>
        <p className="mt-3 max-w-xl text-white/80">
          PlayStation, Xbox, Steam, Android, iPhone, Amazon, eBay and more. Pay in shillings and your code shows up here in seconds.
          It is also kept safe in My orders.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a href="#cards" className="btn-primary">Browse cards</a>
          <Link href="/tournaments" className="btn-secondary">Play tournaments</Link>
        </div>
        {groups.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {groups.map((g) => (
              <a
                key={g.key}
                href={`#${g.key}`}
                className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-sm font-semibold backdrop-blur transition hover:border-lilac/50 hover:bg-white/10 active:scale-95"
              >
                <span aria-hidden>{g.icon}</span> {g.label}
              </a>
            ))}
          </div>
        )}
      </section>

      <div id="cards" className="flex scroll-mt-20 flex-col gap-10">
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
          groups.map((g) => (
            <section key={g.key} id={g.key} className="scroll-mt-20">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-2xl">
                    <span aria-hidden>{g.icon}</span>
                    {g.label}
                  </h2>
                  <p className="text-sm text-white/60">{g.blurb}</p>
                </div>
                <span className="text-xs text-white/50">{g.items.length} cards</span>
              </div>
              <div className="reveal grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {g.items.map((p) => (
                  <CardTile key={p.id} p={p} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <section>
        <h2 className="mb-3 text-2xl">How it works</h2>
        <ol className="reveal grid gap-3 text-sm sm:grid-cols-3">
          {STEPS.map(([n, title, text]) => (
            <li key={n} className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-4">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-violet-700 font-display font-black">
                {n}
              </span>
              <h3 className="mt-3 text-base">{title}</h3>
              <p className="mt-1 text-white/70">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="reveal grid gap-3 text-sm sm:grid-cols-3">
        <Card>
          <h3 className="text-base">⚡ Instant codes</h3>
          <p className="mt-1 text-white/70">Most orders are delivered as soon as M-Pesa confirms the payment.</p>
        </Card>
        <Card>
          <h3 className="text-base">🛡️ Real, licensed cards</h3>
          <p className="mt-1 text-white/70">Every card comes from an authorised distributor, never from resellers.</p>
        </Card>
        <Card>
          <h3 className="text-base">🌍 Check the region</h3>
          <p className="mt-1 text-white/70">Cards only work in their region. US cards need a US account on PlayStation, Xbox or Steam.</p>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-2xl">Questions</h2>
        <div className="flex flex-col gap-2">
          {FAQ.map(([q, a]) => (
            <details key={q} className="faq group rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 open:bg-white/[0.07]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">
                {q}
                <span className="text-lilac transition-transform duration-200 group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="mt-2 text-sm text-white/70">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
