/** Small deterministic PRNG (mulberry32): the same seed gives the same sequence in the browser and on the server. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [0, n). */
export function randInt(rand: () => number, n: number): number {
  return Math.floor(rand() * n);
}

/** Moves per second above which a session is flagged for review. */
export function tooFast(moves: number, elapsedMs: number, maxPerSecond: number): boolean {
  return moves / Math.max(elapsedMs / 1000, 0.001) > maxPerSecond;
}
