import { ViewTransition } from "react";
import type { Tournament } from "@/db/schema";
import { GAMES } from "@/lib/games/catalog";
import { brandStyle, type Glyph } from "@/lib/shop/brands";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-4 ${className}`}>{children}</div>;
}

const STATUS_STYLES: Record<string, string> = {
  open: "bg-emerald-500/15 text-emerald-300",
  running: "bg-amber-500/15 text-amber-300",
  completed: "bg-white/10 text-white/70",
  cancelled: "bg-red-500/15 text-red-300",
  pending: "bg-white/10 text-white/70",
  awaiting_confirmation: "bg-amber-500/15 text-amber-300",
  disputed: "bg-red-500/15 text-red-300",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open for entries",
  running: "Live",
  completed: "Finished",
  cancelled: "Cancelled",
  pending: "To play",
  awaiting_confirmation: "Waiting for confirmation",
  disputed: "Disputed",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? ""}`}>{STATUS_LABELS[status] ?? status}</span>;
}

export function kes(amount: number) {
  return `KES ${amount.toLocaleString("en-KE")}`;
}

export function nairobiTime(date: Date | null) {
  if (!date) return "—";
  return date.toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" });
}

export function gameName(t: Pick<Tournament, "game">) {
  return GAMES[t.game].name;
}

function GlyphIcon({ glyph, className = "" }: { glyph: Glyph; className?: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      {glyph === "controller" && (
        <>
          <path {...p} d="M7 8h10a5 5 0 0 1 4.6 7l-.7 1.6a2.4 2.4 0 0 1-4 .6L15 15H9l-1.9 2.2a2.4 2.4 0 0 1-4-.6L2.4 15A5 5 0 0 1 7 8Z" />
          <path {...p} d="M7 11v3M5.5 12.5h3" />
          <circle cx="16" cy="11.5" r="0.9" fill="currentColor" />
          <circle cx="18" cy="13.5" r="0.9" fill="currentColor" />
        </>
      )}
      {glyph === "android" && (
        <>
          <path {...p} d="M5 16v-4a7 7 0 0 1 14 0v4Z" />
          <path {...p} d="M7.5 6.5 6 4.5M16.5 6.5 18 4.5" />
          <circle cx="9.5" cy="11.5" r="0.9" fill="currentColor" />
          <circle cx="14.5" cy="11.5" r="0.9" fill="currentColor" />
        </>
      )}
      {glyph === "apple" && (
        <>
          <rect {...p} x="7" y="2.5" width="10" height="19" rx="2.5" />
          <path {...p} d="M11 18.5h2" />
        </>
      )}
      {glyph === "cart" && (
        <>
          <path {...p} d="M3 4h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L20.5 8H6" />
          <circle cx="9.5" cy="19.5" r="1.3" fill="currentColor" />
          <circle cx="17" cy="19.5" r="1.3" fill="currentColor" />
        </>
      )}
      {glyph === "tag" && (
        <>
          <path {...p} d="M3 12V4.5A1.5 1.5 0 0 1 4.5 3H12l9 9-9 9Z" />
          <circle cx="7.5" cy="7.5" r="1.4" fill="currentColor" />
        </>
      )}
      {glyph === "play" && (
        <>
          <rect {...p} x="2.5" y="5" width="19" height="14" rx="3" />
          <path d="M10 9.2v5.6l4.6-2.8Z" fill="currentColor" />
        </>
      )}
      {glyph === "music" && (
        <>
          <path {...p} d="M9 18V6l11-2v12" />
          <circle {...p} cx="6.5" cy="18" r="2.5" />
          <circle {...p} cx="17.5" cy="16" r="2.5" />
        </>
      )}
      {glyph === "cube" && (
        <>
          <path {...p} d="m12 2.5 8.5 4.8v9.4L12 21.5l-8.5-4.8V7.3Z" />
          <path {...p} d="M3.5 7.3 12 12l8.5-4.7M12 12v9.5" />
        </>
      )}
      {glyph === "bolt" && <path {...p} d="M13 2.5 4.5 13.5H12l-1 8 8.5-11H12Z" />}
      {glyph === "steam" && (
        <>
          <circle {...p} cx="15.5" cy="8.5" r="4" />
          <circle cx="15.5" cy="8.5" r="1.6" fill="currentColor" />
          <path {...p} d="M2.5 13.5 9 16.2M12 11.5l-3 4.7" />
          <circle {...p} cx="9" cy="16.5" r="2.5" />
        </>
      )}
    </svg>
  );
}

/** Our own placeholder card design for a brand, or the supplier's logo when there is one. */
export function BrandTile({
  brand,
  logoUrl,
  className = "",
  morphId,
  compact = false,
}: {
  brand: string;
  logoUrl?: string | null;
  className?: string;
  /** Same id on the shop grid and the card page makes the tile glide between them. */
  morphId?: string;
  /** Small tiles (lists, admin) drop the extra lettering. */
  compact?: boolean;
}) {
  const style = brandStyle(brand);
  const tile = logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logoUrl} alt={brand} className={`card-shine aspect-[16/10] w-full rounded-xl bg-white object-contain p-3 ${className}`} />
  ) : (
    <div
      className={`card-shine relative flex aspect-[16/10] w-full flex-col justify-between overflow-hidden rounded-xl p-[7%] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_10px_24px_-14px_rgb(0_0_0/0.8)] ${className}`}
      style={{ background: `linear-gradient(135deg, ${style.from} 0%, ${style.to} 100%)` }}
      role="img"
      aria-label={`${brand} gift card`}
    >
      <span className="pointer-events-none absolute -right-[12%] -top-[30%] h-[90%] w-[60%] rounded-full bg-white/25 blur-2xl" aria-hidden />
      <GlyphIcon glyph={style.glyph} className="pointer-events-none absolute -bottom-[14%] -right-[6%] h-[78%] w-auto text-white/15" />
      {!compact && (
        <div className="relative flex items-center justify-between">
          <span className="h-[1.1em] w-[1.6em] rounded-[3px] bg-gradient-to-br from-amber-100 to-amber-400/80 shadow-inner" aria-hidden />
          <span className="font-display text-[0.6rem] font-extrabold uppercase tracking-[0.18em] text-white/75">Gift card</span>
        </div>
      )}
      <div className="relative">
        <div className="flex items-center gap-1.5">
          <GlyphIcon glyph={style.glyph} className="h-[1.2em] w-[1.2em] shrink-0" />
          <span className="font-display text-[clamp(0.85rem,3.6vw,1.2rem)] font-black leading-tight">{brand}</span>
        </div>
        {!compact && style.hint && <span className="text-[0.65rem] font-semibold text-white/75">{style.hint}</span>}
      </div>
    </div>
  );
  if (!morphId) return tile;
  return (
    <ViewTransition name={`card-${morphId}`} share="morph" default="none">
      {tile}
    </ViewTransition>
  );
}

const ORDER_STATUS: Record<string, { label: string; style: string }> = {
  pending_payment: { label: "Waiting for payment", style: "bg-amber-500/15 text-amber-300" },
  held: { label: "Being checked", style: "bg-amber-500/15 text-amber-300" },
  paid: { label: "Paid, sending card", style: "bg-amber-500/15 text-amber-300" },
  fulfilling: { label: "Sending card", style: "bg-amber-500/15 text-amber-300" },
  delivered: { label: "Delivered", style: "bg-emerald-500/15 text-emerald-300" },
  failed: { label: "Problem, refund due", style: "bg-red-500/15 text-red-300" },
  needs_check: { label: "Being checked", style: "bg-amber-500/15 text-amber-300" },
  cancelled: { label: "Cancelled", style: "bg-white/10 text-white/70" },
  refunded: { label: "Refunded", style: "bg-white/10 text-white/70" },
};

export function OrderBadge({ status }: { status: string }) {
  const s = ORDER_STATUS[status];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s?.style ?? ""}`}>{s?.label ?? status}</span>;
}
