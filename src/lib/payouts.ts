/** Prize pool maths. Amounts are whole Kenyan shillings. */

export type PrizePoolInput = {
  entryFeeKes: number;
  entrants: number;
  sponsoredPrizeKes: number;
  platformFeePercent: number;
};

export type PrizePool = {
  grossEntryFeesKes: number;
  platformFeeKes: number;
  prizePoolKes: number;
};

export function computePrizePool(input: PrizePoolInput): PrizePool {
  const grossEntryFeesKes = input.entryFeeKes * input.entrants;
  const platformFeeKes = Math.floor((grossEntryFeesKes * input.platformFeePercent) / 100);
  return {
    grossEntryFeesKes,
    platformFeeKes,
    prizePoolKes: grossEntryFeesKes - platformFeeKes + input.sponsoredPrizeKes,
  };
}

/** Percentage split by finishing place. */
export function payoutSplit(format: "bracket" | "leaderboard", entrants: number): number[] {
  if (format === "bracket") return entrants >= 4 ? [70, 30] : [100];
  if (entrants >= 10) return [50, 30, 20];
  if (entrants >= 4) return [70, 30];
  return [100];
}

/**
 * Splits the pool across places. Rounding leftovers go to first place so the
 * payouts always add up to exactly the pool.
 */
export function distributePrizes(poolKes: number, split: number[]): number[] {
  const amounts = split.map((pct) => Math.floor((poolKes * pct) / 100));
  const remainder = poolKes - amounts.reduce((a, b) => a + b, 0);
  if (amounts.length > 0) amounts[0] += remainder;
  return amounts;
}
