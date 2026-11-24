"use client";

import { useActionState, useState } from "react";
import { topUpAction } from "@/app/actions";
import { kes } from "@/components/ui";

type Props = { cardFeePercent: number; min: number; max: number; simulated: boolean; phone: string | null };

const QUICK = [50, 100, 200, 500, 1000];

export function TopUpForm({ cardFeePercent, min, max, simulated, phone }: Props) {
  const [state, action, pending] = useActionState(topUpAction, undefined);
  const [amount, setAmount] = useState(100);
  const [method, setMethod] = useState<"mpesa" | "card">("mpesa");
  // Must match cardFeeKes on the server; the server's figure is what gets charged.
  const fee = method === "card" ? Math.ceil((amount * cardFeePercent) / 100) : 0;
  const choice = (on: boolean) => `cursor-pointer rounded-xl border p-2 text-center ${on ? "border-emerald-400 bg-emerald-500/15" : "border-white/15"}`;

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <button key={q} type="button" onClick={() => setAmount(q)} className={`${choice(amount === q)} min-w-16 text-sm`}>
            {q.toLocaleString()}
          </button>
        ))}
      </div>
      <label className="label">
        Amount (KES)
        <input
          name="amountKes"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={amount || ""}
          onChange={(e) => setAmount(Math.floor(Number(e.target.value)))}
          required
          className="input"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className={choice(method === "mpesa")}>
          <input type="radio" name="method" value="mpesa" checked={method === "mpesa"} onChange={() => setMethod("mpesa")} className="sr-only" />
          M-Pesa
        </label>
        <label className={choice(method === "card")}>
          <input type="radio" name="method" value="card" checked={method === "card"} onChange={() => setMethod("card")} className="sr-only" />
          Card
        </label>
      </div>
      {method === "card" && (
        <label className="label">
          Email for the card receipt
          <input name="email" type="email" autoComplete="email" required className="input" />
        </label>
      )}
      {fee > 0 && (
        <p className="text-sm text-white/70">
          Card payment fee {kes(fee)}. You pay {kes(amount + fee)} and {kes(amount)} goes into your wallet.
        </p>
      )}
      <button className="btn-primary" disabled={pending || !amount}>
        {pending ? "Starting payment…" : `Top up ${kes(amount || 0)}`}
      </button>
      {method === "mpesa" && !simulated && phone && <p className="text-xs text-white/60">An M-Pesa prompt will appear on {phone}. Enter your PIN to pay.</p>}
      {simulated && <p className="text-xs text-amber-200">Test site: no real money moves. You will press a button to pretend to pay.</p>}
      {state?.error && <p className="text-sm text-red-400">{state.error}</p>}
    </form>
  );
}
