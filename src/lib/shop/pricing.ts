/** Shop price maths. Prices are whole Kenyan shillings, supplier costs are USD cents. */

export const DEFAULT_MARKUP_PERCENT = 5;

/** KES price for a card that costs us `costUsdCents`, rounded up to the next 10 shillings. */
export function priceKes(costUsdCents: number, usdKesRate: number, markupPercent = DEFAULT_MARKUP_PERCENT): number {
  if (!(usdKesRate > 0)) throw new Error("Exchange rate is not set");
  const raw = (costUsdCents / 100) * usdKesRate * (1 + markupPercent / 100);
  return Math.ceil(raw / 10) * 10;
}

/** Card buyers pay the card processing fee on top; M-Pesa buyers pay none. */
export function cardFeeKes(priceKesValue: number, cardFeePercent: number): number {
  return Math.ceil((priceKesValue * cardFeePercent) / 100);
}

export function formatFace(faceCents: number, currency: string): string {
  const amount = faceCents % 100 === 0 ? String(faceCents / 100) : (faceCents / 100).toFixed(2);
  const symbol: Record<string, string> = { USD: "$", GBP: "£", EUR: "€" };
  return symbol[currency] ? `${symbol[currency]}${amount}` : `${amount} ${currency}`;
}
