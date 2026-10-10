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
