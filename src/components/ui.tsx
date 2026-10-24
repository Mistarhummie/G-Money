import type { Tournament } from "@/db/schema";
import { GAMES } from "@/lib/games/catalog";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-white/10 bg-white/5 p-4 ${className}`}>{children}</div>;
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

const BRAND_COLORS: Record<string, string> = {
  PlayStation: "from-blue-600 to-blue-900",
  Xbox: "from-green-600 to-green-900",
  Steam: "from-slate-600 to-slate-900",
  "Google Play": "from-teal-500 to-emerald-800",
  Apple: "from-zinc-500 to-zinc-800",
  Netflix: "from-red-600 to-red-900",
};

/** A coloured tile with the brand name, or the supplier's logo when there is one. */
export function BrandTile({ brand, logoUrl, className = "" }: { brand: string; logoUrl?: string | null; className?: string }) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt={brand} className={`aspect-[16/10] w-full rounded-xl bg-white object-contain p-3 ${className}`} />;
  }
  return (
    <div
      className={`flex aspect-[16/10] w-full items-center justify-center rounded-xl bg-gradient-to-br ${BRAND_COLORS[brand] ?? "from-emerald-600 to-emerald-900"} p-3 text-center text-lg font-bold ${className}`}
    >
      {brand}
    </div>
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
