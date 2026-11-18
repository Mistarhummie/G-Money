"use client";

import { useActionState, useState } from "react";
import { buyAction } from "@/app/actions";
import { kes } from "@/components/ui";
import { formatFace } from "@/lib/shop/pricing";

type Props = {
  productId: string;
  currency: string;
  prices: { faceCents: number; priceKes: number }[];
  cardFeePercent: number;
  methods: { mpesa: boolean; card: boolean };
  simulated: boolean;
  phone: string;
};

export function BuyForm({ productId, currency, prices, cardFeePercent, methods, simulated, phone }: Props) {
  const [state, action, pending] = useActionState(buyAction.bind(null, productId), undefined);
  const [face, setFace] = useState(prices[0]?.faceCents);
  const [method, setMethod] = useState<"mpesa" | "card">(methods.mpesa ? "mpesa" : "card");
  const price = prices.find((p) => p.faceCents === face)?.priceKes ?? 0;
  // Must match cardFeeKes on the server; the server's figure is what gets charged.
  const fee = method === "card" ? Math.ceil((price * cardFeePercent) / 100) : 0;

  if (!methods.mpesa && !methods.card) return <p className="text-white/70">Payments are not set up yet.</p>;

  return (
    <form action={action} className="flex flex-col gap-4">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Card value</legend>
        <div className="grid grid-cols-3 gap-2">
          {prices.map((p) => (
            <label
              key={p.faceCents}
              className={`cursor-pointer rounded-xl border p-2 text-center ${face === p.faceCents ? "border-emerald-400 bg-emerald-500/15" : "border-white/15"}`}
            >
              <input type="radio" name="faceCents" value={p.faceCents} checked={face === p.faceCents} onChange={() => setFace(p.faceCents)} className="sr-only" />
              <span className="block font-semibold">{formatFace(p.faceCents, currency)}</span>
              <span className="block text-xs text-white/60">{kes(p.priceKes)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Pay with</legend>
        <div className="grid grid-cols-2 gap-2">
          {methods.mpesa && (
            <label className={`cursor-pointer rounded-xl border p-2 text-center ${method === "mpesa" ? "border-emerald-400 bg-emerald-500/15" : "border-white/15"}`}>
              <input type="radio" name="method" value="mpesa" checked={method === "mpesa"} onChange={() => setMethod("mpesa")} className="sr-only" />
              M-Pesa
            </label>
          )}
          {methods.card && (
            <label className={`cursor-pointer rounded-xl border p-2 text-center ${method === "card" ? "border-emerald-400 bg-emerald-500/15" : "border-white/15"}`}>
              <input type="radio" name="method" value="card" checked={method === "card"} onChange={() => setMethod("card")} className="sr-only" />
              Card
            </label>
          )}
        </div>
      </fieldset>

      {method === "card" && (
        <label className="label">
          Email for the card receipt
          <input name="email" type="email" autoComplete="email" required className="input" />
        </label>
      )}

      <div className="rounded-xl bg-white/5 p-3 text-sm">
        <div className="flex justify-between"><span>Card</span><span>{kes(price)}</span></div>
        {fee > 0 && <div className="flex justify-between text-white/70"><span>Card payment fee</span><span>{kes(fee)}</span></div>}
        <div className="mt-1 flex justify-between border-t border-white/10 pt-1 font-semibold"><span>Total</span><span>{kes(price + fee)}</span></div>
      </div>

      <button className="btn-primary" disabled={pending}>
        {pending ? "Starting payment…" : `Pay ${kes(price + fee)}`}
      </button>
      {method === "mpesa" && !simulated && <p className="text-xs text-white/60">An M-Pesa prompt will appear on {phone}. Enter your PIN to pay.</p>}
      {simulated && <p className="text-xs text-amber-200">Test site: no real money moves. You will press a button to pretend to pay.</p>}
      {state?.error && <p className="text-sm text-red-400">{state.error}</p>}
    </form>
  );
}
