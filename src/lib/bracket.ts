/** Single-elimination bracket helpers. Pure functions, no database access. */

export function bracketSize(playerCount: number): number {
  if (playerCount < 2) throw new Error("A bracket needs at least 2 players");
  let size = 2;
  while (size < playerCount) size *= 2;
  return size;
}

export function roundCount(size: number): number {
  return Math.log2(size);
}

/**
 * Standard seed order for a bracket of `size`, e.g. size 8 -> [1, 8, 4, 5, 2, 7, 3, 6].
 * Pairing consecutive entries keeps the top seeds apart until the late rounds
 * and gives byes to the top seeds when the field is not a power of two.
 */
export function seedOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const next = order.length * 2 + 1;
    order = order.flatMap((seed) => [seed, next - seed]);
  }
  return order;
}

export type FirstRoundPairing = { slot: number; playerA: string | null; playerB: string | null };

/** `seededPlayers[0]` is seed 1. Missing opponents are byes (null). */
export function firstRoundPairings(seededPlayers: string[]): FirstRoundPairing[] {
  const size = bracketSize(seededPlayers.length);
  const order = seedOrder(size);
  const pairings: FirstRoundPairing[] = [];
  for (let i = 0; i < order.length; i += 2) {
    pairings.push({
      slot: i / 2,
      playerA: seededPlayers[order[i] - 1] ?? null,
      playerB: seededPlayers[order[i + 1] - 1] ?? null,
    });
  }
  return pairings;
}

/** Where the winner of (round, slot) plays next. */
export function nextMatchPosition(round: number, slot: number): { round: number; slot: number; side: "A" | "B" } {
  return { round: round + 1, slot: Math.floor(slot / 2), side: slot % 2 === 0 ? "A" : "B" };
}
