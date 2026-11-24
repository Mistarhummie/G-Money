import { eq } from "drizzle-orm";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { Card, kes, nairobiTime } from "@/components/ui";
import { getDb } from "@/db";
import { walletDeposits } from "@/db/schema";
import { config } from "@/lib/config";
import { requireUser } from "@/lib/session";
import { paymentsSimulated } from "@/lib/shop/checkout";
import { shopLimits } from "@/lib/shop/orders";
import { accountBalance, ensureTestFunds, walletHistory, walletOf } from "@/lib/wallet";
import { myWalletActivity, refreshDeposit, refreshWithdrawal, walletLimits, walletPaymentsOn } from "@/lib/wallet-payments";
import { AutoRefresh } from "../orders/[id]/client";
import { cancelDepositAction, checkDepositAction, simulateDepositAction, withdrawAction } from "../actions";
import { TopUpForm } from "./TopUpForm";

const DEPOSIT_LABEL: Record<string, string> = {
  pending: "Waiting for payment",
  credited: "Added",
  held: "Being checked",
  failed: "Not paid",
  refunded: "Refunded",
};
const WITHDRAW_LABEL: Record<string, string> = {
  requested: "Waiting for approval",
  sending: "Sending",
  paid: "Sent",
  failed: "Not sent, money returned",
  rejected: "Not approved, money returned",
  needs_check: "Being checked",
};

export default async function WalletPage({ searchParams }: { searchParams: Promise<{ deposit?: string; tracking_id?: string; invoice_id?: string }> }) {
  const user = await requireUser();
  const db = await getDb();
  const query = await searchParams;
  await ensureTestFunds(db, user.id);
  const on = walletPaymentsOn();
  const sim = paymentsSimulated();

  // Coming back from IntaSend's card page, or waiting on an M-Pesa prompt: ask IntaSend now.
  let current = query.deposit ? (await db.select().from(walletDeposits).where(eq(walletDeposits.id, query.deposit)))[0] : undefined;
  if (current && current.userId !== user.id) current = undefined;
  if (current?.status === "pending") {
    await refreshDeposit(db, current, query.tracking_id || query.invoice_id).catch(() => undefined);
    current = (await db.select().from(walletDeposits).where(eq(walletDeposits.id, current.id)))[0];
  }

  let activity = await myWalletActivity(db, user.id);
  const sending = activity.withdrawals.filter((w) => w.status === "sending");
  if (sending.length) {
    for (const w of sending) await refreshWithdrawal(db, w).catch(() => undefined);
    activity = await myWalletActivity(db, user.id);
  }
  const balance = await accountBalance(db, walletOf(user.id));
  const history = await walletHistory(db, user.id);
  const testAccount = user.phone.startsWith("test:");
  const fee = walletLimits.withdrawFeeKes();
  const waiting = current?.status === "pending" || activity.withdrawals.some((w) => w.status === "sending");

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-bold">Wallet</h1>
      <Card className="flex items-baseline justify-between">
        <span className="text-white/70">{config.testFunds() ? "Balance (test funds)" : "Balance"}</span>
        <span className="text-3xl font-bold text-mint">{kes(balance)}</span>
      </Card>

      {!on && <Card className="text-sm text-white/70">Top-ups and withdrawals are not open yet.</Card>}

      {current?.status === "pending" && !sim && (
        <Card className="border-mint/40">
          <p>
            {current.method === "mpesa"
              ? `Check your phone for the M-Pesa prompt for ${kes(current.totalKes)} and enter your PIN. This page updates when it arrives.`
              : "Waiting for the card payment to be confirmed."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionForm action={checkDepositAction.bind(null, current.id)} submitLabel="I have paid, check now" buttonClassName="btn-secondary" />
            <ActionForm action={cancelDepositAction.bind(null, current.id)} submitLabel="Cancel" buttonClassName="btn-danger" />
          </div>
        </Card>
      )}
      {current?.status === "pending" && sim && (
        <Card className="border-amber-400/40">
          <p className="text-sm text-amber-200">Test site: pretend to pay {kes(current.totalKes)}.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionForm action={simulateDepositAction.bind(null, current.id, "paid")} submitLabel="Pay (test)" />
            <ActionForm action={simulateDepositAction.bind(null, current.id, "failed")} submitLabel="Decline (test)" buttonClassName="btn-secondary" />
          </div>
        </Card>
      )}
      {current?.status === "credited" && <Card className="border-emerald-400/40 text-emerald-200">{kes(current.amountKes)} added to your wallet.</Card>}
      {current?.status === "held" && <Card>Payment received. We are checking it and will add it to your wallet shortly.</Card>}
      {current?.status === "failed" && <Card>That top-up was not paid{current.note ? `: ${current.note}` : ""}. You were not charged.</Card>}

      {on && (
        <>
          <Card>
            <h2 className="mb-3 font-semibold">Top up</h2>
            <TopUpForm
              cardFeePercent={shopLimits.cardFeePercent()}
              min={walletLimits.topUpMinKes()}
              max={walletLimits.topUpMaxKes()}
              simulated={sim}
              phone={testAccount ? null : user.phone}
            />
          </Card>
          <Card>
            <h2 className="mb-1 font-semibold">Withdraw to M-Pesa</h2>
            <p className="mb-3 text-xs text-white/60">
              Smallest withdrawal {kes(walletLimits.withdrawMinKes())}. Fee {kes(fee)}, taken from your wallet on top of the amount.
              {testAccount ? "" : ` Sent to ${user.phone}.`}
            </p>
            <ActionForm action={withdrawAction} submitLabel="Withdraw" confirmText="Send this to your M-Pesa?">
              <label className="label">
                Amount (KES)
                <input name="amountKes" type="number" inputMode="numeric" min={walletLimits.withdrawMinKes()} max={Math.max(0, balance - fee)} required className="input" />
              </label>
              {testAccount && (
                <label className="label">
                  M-Pesa number (test site)
                  <input name="phone" inputMode="tel" placeholder="0712 345 678" required className="input" />
                </label>
              )}
            </ActionForm>
          </Card>
        </>
      )}

      {(activity.deposits.length > 0 || activity.withdrawals.length > 0) && (
        <Card className="flex flex-col gap-2 text-sm">
          <h2 className="font-semibold">Top-ups and withdrawals</h2>
          {[
            ...activity.deposits.map((d) => ({ at: d.createdAt, label: `Top-up via ${d.method === "mpesa" ? "M-Pesa" : "card"}`, amount: d.amountKes, sign: 1, status: DEPOSIT_LABEL[d.status], note: d.receipt })),
            ...activity.withdrawals.map((w) => ({
              at: w.createdAt,
              label: `Withdrawal to ${w.phone}`,
              amount: w.amountKes,
              sign: -1,
              status: WITHDRAW_LABEL[w.status],
              note: w.status === "rejected" || w.status === "failed" ? w.note : w.receipt,
            })),
          ]
            .sort((a, b) => b.at.getTime() - a.at.getTime())
            .slice(0, 12)
            .map((r, i) => (
              <div key={i} className="flex justify-between gap-2 border-t border-white/5 pt-1">
                <div>
                  <div>{r.label}</div>
                  <div className="text-xs text-white/50">
                    {nairobiTime(r.at)} · {r.status}
                    {r.note ? ` · ${r.note}` : ""}
                  </div>
                </div>
                <span className={`font-mono ${r.sign > 0 ? "text-emerald-300" : "text-red-300"}`}>
                  {r.sign > 0 ? "+" : "−"}
                  {r.amount.toLocaleString()}
                </span>
              </div>
            ))}
        </Card>
      )}

      {history.length > 0 && (
        <Card className="flex flex-col gap-1 text-sm">
          <h2 className="font-semibold">Wallet history</h2>
          {history.map((h, i) => (
            <div key={i} className="flex justify-between gap-2">
              <span className="text-white/70">{h.memo}</span>
              <span className={`font-mono ${h.amountKes >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                {h.amountKes >= 0 ? "+" : "−"}
                {Math.abs(h.amountKes).toLocaleString()}
              </span>
            </div>
          ))}
        </Card>
      )}
      <Link href="/profile" className="text-sm text-emerald-300">Profile</Link>
      {waiting && <AutoRefresh everyMs={5000} />}
    </div>
  );
}
