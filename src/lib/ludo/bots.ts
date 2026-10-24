import {
  BASE,
  HOME,
  LAST_TRACK,
  SAFE_SQUARES,
  distinctChoices,
  target,
  trackSquare,
  type LudoState,
} from "./rules";

/**
 * Computer players. Level 1 moves at random; each level up weighs more of what good players think
 * about: capturing, getting home, leaving base, landing on safe squares, and running from tokens
 * that could hit them next roll. Level 5 plays every one of those with no mistakes.
 */

export type Rng = () => number;

/** How many opponent tokens could land on track square `sq` with one roll (1–6). */
export function threatsTo(s: LudoState, seat: number, sq: number): number {
  if (SAFE_SQUARES.has(sq)) return 0;
  let n = 0;
  s.tokens.forEach((row, other) => {
    if (other === seat || s.finished.includes(other)) return;
    const colour = s.setup.colours[other];
    for (const p of row) {
      const at = trackSquare(colour, p);
      if (at === null) continue;
      const gap = (sq - at + 52) % 52;
      // They can only reach it if it lies before their own turn into the home column.
      if (gap >= 1 && gap <= 6 && p + gap <= LAST_TRACK) n++;
    }
  });
  return n;
}

type Weights = { capture: number; home: number; out: number; column: number; safe: number; danger: number; flee: number; progress: number; noise: number };

const LEVELS: Record<number, Weights> = {
  2: { capture: 30, home: 30, out: 30, column: 5, safe: 0, danger: 0, flee: 0, progress: 0.2, noise: 40 },
  3: { capture: 50, home: 40, out: 30, column: 15, safe: 5, danger: 4, flee: 0, progress: 0.5, noise: 12 },
  4: { capture: 60, home: 45, out: 35, column: 22, safe: 14, danger: 14, flee: 12, progress: 0.6, noise: 4 },
  5: { capture: 70, home: 50, out: 40, column: 28, safe: 18, danger: 22, flee: 20, progress: 0.8, noise: 0 },
};

/** Score of moving `token` for the player to move. Higher is better. */
export function scoreMove(s: LudoState, token: number, w: Weights): number {
  const seat = s.turn;
  const colour = s.setup.colours[seat];
  const from = s.tokens[seat][token];
  const to = target(from, s.dice!)!;
  const sq = trackSquare(colour, to);
  let score = 0;
  if (sq !== null && !SAFE_SQUARES.has(sq)) {
    s.tokens.forEach((row, other) => {
      if (other === seat) return;
      for (const p of row) {
        // Capturing a token that has gone far hurts the opponent more.
        if (trackSquare(s.setup.colours[other], p) === sq) score += w.capture + p * 0.5;
      }
    });
  }
  if (to === HOME) score += w.home;
  if (from === BASE) score += w.out;
  if (from <= LAST_TRACK && to > LAST_TRACK && to < HOME) score += w.column;
  if (sq !== null && SAFE_SQUARES.has(sq)) score += w.safe;
  if (sq !== null) score -= w.danger * threatsTo(s, seat, sq);
  const fromSq = trackSquare(colour, from);
  if (fromSq !== null) {
    const now = threatsTo(s, seat, fromSq);
    score += w.flee * now * (1 + from / LAST_TRACK);
  }
  score += w.progress * (to - Math.max(0, from)) + (from > 0 ? from * 0.05 : 0);
  return score;
}

/** The computer's pick for the player to move. */
export function chooseMove(s: LudoState, level: number, rng: Rng = Math.random): number {
  const options = distinctChoices(s);
  if (!options.length) throw new Error("No legal move");
  if (options.length === 1 || level <= 1) return options[Math.floor(rng() * options.length)];
  const w = LEVELS[Math.min(5, Math.max(2, level))];
  let best = options[0];
  let bestScore = -Infinity;
  for (const t of options) {
    const v = scoreMove(s, t, w) + rng() * w.noise;
    if (v > bestScore) {
      bestScore = v;
      best = t;
    }
  }
  return best;
}
