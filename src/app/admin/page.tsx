import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { Card, StatusBadge, gameName, kes, nairobiTime } from "@/components/ui";
import { getDb } from "@/db";
import { disputes, evidence, matches, products, puzzleAttempts, tournaments, users } from "@/db/schema";
import { formatFace } from "@/lib/shop/pricing";
import { config } from "@/lib/config";
import { requireAdmin } from "@/lib/session";
import { prizesOwed } from "@/lib/tournaments";
import {
  adminTournamentAction,
  banUserAction,
  createTournamentAction,
  recordPayoutAction,
  resolveDisputeAction,
} from "../actions";

export default async function AdminPage() {
  await requireAdmin();
  const db = await getDb();

  const openDisputes = await db
    .select({ d: disputes, m: matches, t: tournaments })
    .from(disputes)
    .innerJoin(matches, eq(matches.id, disputes.matchId))
    .innerJoin(tournaments, eq(tournaments.id, matches.tournamentId))
    .where(isNull(disputes.resolvedAt))
    .orderBy(disputes.createdAt);
  const matchIds = openDisputes.map((r) => r.m.id);
  const evidenceRows = matchIds.length
    ? await db.select({ id: evidence.id, matchId: evidence.matchId, uploadedBy: evidence.uploadedBy }).from(evidence).where(inArray(evidence.matchId, matchIds))
    : [];
  const playerIds = [...new Set(openDisputes.flatMap((r) => [r.m.playerAId!, r.m.playerBId!]))];
  const players = playerIds.length ? await db.select().from(users).where(inArray(users.id, playerIds)) : [];
  const name = (id: string | null) => players.find((p) => p.id === id)?.username ?? "?";
  const record = (id: string | null) => {
    const p = players.find((u) => u.id === id);
    return p ? `${p.matchesPlayed} matches, ${p.disputesLost} disputes lost` : "";
  };

  const active = await db
    .select()
    .from(tournaments)
    .where(inArray(tournaments.status, ["open", "running"]))
    .orderBy(tournaments.startsAt);
  const owed = await prizesOwed(db);
  const flagged = await db
    .select({ a: puzzleAttempts, username: users.username })
    .from(puzzleAttempts)
    .innerJoin(users, eq(users.id, puzzleAttempts.userId))
    .where(and(eq(puzzleAttempts.flagged, true)))
    .orderBy(desc(puzzleAttempts.startedAt))
    .limit(20);
  const prizeProducts = await db.select().from(products).orderBy(products.brand, products.name);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Tournament admin</h1>
        <Link href="/admin/shop" className="btn-secondary">Shop admin</Link>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Disputes ({openDisputes.length})</h2>
        {openDisputes.length === 0 && <Card className="text-sm text-white/60">No open disputes.</Card>}
        {openDisputes.map(({ d, m, t }) => (
          <Card key={d.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <Link href={`/tournaments/${t.id}`} className="font-semibold hover:underline">
                {t.title}: {name(m.playerAId)} vs {name(m.playerBId)}
              </Link>
              <span className="text-white/60">{nairobiTime(d.createdAt)}</span>
            </div>
            <p className="text-sm">
              <strong>{name(m.reportedBy)}</strong> reported {name(m.playerAId)} {m.scoreA} – {m.scoreB} {name(m.playerBId)}.
              <br />
              <strong>{name(d.openedBy)}</strong> disputes: “{d.reason}”
              {d.claimedScoreA != null && ` (claims ${d.claimedScoreA} – ${d.claimedScoreB})`}
            </p>
            <p className="text-xs text-white/60">
              {name(m.playerAId)}: {record(m.playerAId)} · {name(m.playerBId)}: {record(m.playerBId)}
            </p>
            <div className="flex flex-wrap gap-3">
              {evidenceRows
                .filter((e) => e.matchId === m.id)
                .map((e) => (
                  <a key={e.id} href={`/api/evidence/${e.id}`} target="_blank" className="text-xs text-white/70">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/evidence/${e.id}`} alt={`Evidence from ${name(e.uploadedBy)}`} className="h-40 rounded-lg border border-white/10 object-contain" />
                    from {name(e.uploadedBy)}
                  </a>
                ))}
            </div>
            <ActionForm action={resolveDisputeAction.bind(null, d.id)} submitLabel="Decide" className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="label">
                Winner
                <select name="winnerId" className="input" required>
                  <option value={m.playerAId!}>{name(m.playerAId)}</option>
                  <option value={m.playerBId!}>{name(m.playerBId)}</option>
                </select>
              </label>
              <label className="label flex-1">
                Reason (shown in the record)
                <input name="note" required className="input" />
              </label>
            </ActionForm>
          </Card>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Prizes to pay ({owed.length})</h2>
        <p className="text-sm text-white/60">Send each prize over M-Pesa, then record the transaction code here.</p>
        {owed.map((o) => (
          <Card key={o.userId} className="flex flex-col gap-2">
            <p className="text-sm">
              <strong>{o.username}</strong> · {o.phone} · owed <span className="text-emerald-300">{kes(o.owedKes)}</span>
            </p>
            <ActionForm action={recordPayoutAction.bind(null, o.userId)} submitLabel="Record payout" className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="label">
                Amount (KES)
                <input name="amountKes" type="number" min={1} defaultValue={o.owedKes} className="input" />
              </label>
              <label className="label flex-1">
                M-Pesa code
                <input name="reference" required className="input uppercase" />
              </label>
            </ActionForm>
          </Card>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Running and upcoming</h2>
        {active.length === 0 && <Card className="text-sm text-white/60">No open or running tournaments.</Card>}
        {active.map((t) => (
          <Card key={t.id} className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Link href={`/tournaments/${t.id}`} className="font-semibold hover:underline">{t.title}</Link>
              <p className="text-sm text-white/60">
                {gameName(t)} · {nairobiTime(t.startsAt)} <StatusBadge status={t.status} />
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {t.status === "open" && (
                <ActionForm action={adminTournamentAction.bind(null, t.id, "start")} submitLabel="Start now" className="flex flex-col" confirmText="Close entries and start?" />
              )}
              {t.status === "running" && t.format === "leaderboard" && (
                <ActionForm action={adminTournamentAction.bind(null, t.id, "finish")} submitLabel="Finish & assign prizes" className="flex flex-col" confirmText="End the tournament now?" />
              )}
              <ActionForm
                action={adminTournamentAction.bind(null, t.id, "cancel")}
                submitLabel="Cancel"
                buttonClassName="btn-danger"
                className="flex flex-col"
                confirmText="Cancel this tournament?"
              />
            </div>
          </Card>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">New tournament</h2>
        <Card>
          <ActionForm action={createTournamentAction} submitLabel="Create tournament" className="grid gap-3 sm:grid-cols-2">
            <label className="label sm:col-span-2">
              Title
              <input name="title" required className="input" placeholder="Saturday eFootball Cup" />
            </label>
            <label className="label">
              Game
              <select name="game" className="input">
                <option value="efootball">eFootball (bracket)</option>
                <option value="eafc">EA SPORTS FC (bracket)</option>
                <option value="chess">Chess via Lichess (bracket)</option>
                <option value="puzzle15">Speed puzzle (leaderboard)</option>
              </select>
            </label>
            <label className="label">
              Entry
              <select name="entryType" className="input">
                <option value="free">Free entry</option>
                <option value="paid" disabled={!config.paidEntryEnabled()}>
                  Paid entry {config.paidEntryEnabled() ? "" : "(off until legal review)"}
                </option>
              </select>
            </label>
            <label className="label">
              Entry fee (KES, paid only)
              <input name="entryFeeKes" type="number" min={0} defaultValue={0} className="input" />
            </label>
            <label className="label">
              Sponsored prize (KES)
              <input name="sponsoredPrizeKes" type="number" min={0} defaultValue={0} className="input" />
            </label>
            <label className="label">
              Max players
              <input name="maxPlayers" type="number" min={2} max={256} defaultValue={16} className="input" />
            </label>
            <label className="label">
              Attempts per player (puzzle)
              <input name="attemptsPerPlayer" type="number" min={1} max={20} defaultValue={3} className="input" />
            </label>
            <label className="label">
              Starts (Kenya time)
              <input name="startsAt" type="datetime-local" required className="input" />
            </label>
            <label className="label">
              Ends (Kenya time, puzzle only)
              <input name="endsAt" type="datetime-local" className="input" />
            </label>
            <label className="label">
              Gift card prize (optional)
              <select name="prizeProductId" className="input" defaultValue="">
                <option value="">No gift card prize</option>
                {prizeProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.denominations.map((d) => formatFace(d.faceCents, p.currency)).join(", ")})
                  </option>
                ))}
              </select>
            </label>
            <label className="label">
              Card value per place, e.g. 25,10
              <input name="prizeCardValues" className="input" placeholder="1st, 2nd, 3rd…" />
            </label>
            <label className="label sm:col-span-2">
              Rules
              <textarea name="rules" rows={3} className="input" placeholder="Match settings, time limits, what to screenshot…" />
            </label>
          </ActionForm>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Flagged puzzle attempts</h2>
        {flagged.length === 0 ? (
          <Card className="text-sm text-white/60">Nothing flagged.</Card>
        ) : (
          <Card>
            <ul className="text-sm">
              {flagged.map(({ a, username }) => (
                <li key={a.id}>
                  {username}: {a.moveCount} moves in {((a.timeMs ?? 0) / 1000).toFixed(2)}s · {nairobiTime(a.startedAt)}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Suspend a player</h2>
        <Card>
          <ActionForm action={banUserAction} submitLabel="Apply" buttonClassName="btn-danger" className="grid gap-3 sm:grid-cols-2">
            <label className="label">
              Username
              <input name="username" required className="input" />
            </label>
            <label className="label">
              Reason (shown to the player)
              <input name="reason" className="input" />
            </label>
            <label className="flex items-center gap-2 text-sm text-white/80">
              <input type="checkbox" name="unban" /> Lift a suspension instead
            </label>
          </ActionForm>
        </Card>
      </section>
    </div>
  );
}
