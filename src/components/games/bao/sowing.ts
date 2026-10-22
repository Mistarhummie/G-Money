import { MAX_SOWN_PER_MOVE, startsWithCapture, type Board, type Move, type Side } from "@/lib/games/arcade/bao";

/**
 * One visible step of a move: lifting a pit into the hand, dropping one seed, or capturing the
 * opponent's pit. `hand` is how many seeds are in hand after the step; `board` is the board after it.
 */
export type SowStep = {
  kind: "lift" | "drop" | "capture";
  side: Side;
  k: number;
  hand: number;
  /** True while the hand is carrying captured seeds. */
  captured: boolean;
  board: Board;
};

export type SowTrace = {
  steps: SowStep[];
  final: Board;
  /** Seeds taken from the opponent, and in how many captures. */
  captured: number;
  captures: number;
  /** Times the hand picked a pit back up and kept sowing. */
  relays: number;
  sown: number;
};

/**
 * Plays a move exactly as `applyMove` in bao.ts does, recording every step so it can be animated.
 * (A test checks that `final` always matches `applyMove`.)
 */
export function traceMove(board: Board, side: Side, m: Move): SowTrace {
  const b = board.slice();
  const base = side * 16;
  const opp = (1 - side) * 16;
  const steps: SowStep[] = [];
  const push = (kind: SowStep["kind"], s: Side, k: number, hand: number, captured: boolean) =>
    steps.push({ kind, side: s, k, hand, captured, board: b.slice() });

  let dir: number = m.dir;
  let pos = m.pit;
  let hand = b[base + pos];
  b[base + pos] = 0;
  push("lift", side, pos, hand, false);
  let sown = 0;
  let captured = 0;
  let captures = 0;
  let relays = 0;
  let carryingCapture = false;
  const capturing = startsWithCapture(board, side, m);
  for (;;) {
    while (hand > 0) {
      pos = (pos + dir + 16) % 16;
      b[base + pos]++;
      hand--;
      sown++;
      push("drop", side, pos, hand, carryingCapture && hand > 0);
    }
    carryingCapture = false;
    if (sown >= MAX_SOWN_PER_MOVE) break;
    if (b[base + pos] === 1) break;
    const facing = opp + 7 - pos;
    if (capturing && pos < 8 && b[facing] > 0) {
      hand = b[facing];
      b[facing] = 0;
      captured += hand;
      captures++;
      carryingCapture = true;
      push("capture", (1 - side) as Side, 7 - pos, hand, true);
      if (pos < 4) {
        dir = 1;
        pos = 15;
      } else {
        dir = -1;
        pos = 8;
      }
    } else {
      hand = b[base + pos];
      b[base + pos] = 0;
      relays++;
      push("lift", side, pos, hand, false);
    }
  }
  return { steps, final: b, captured, captures, relays, sown };
}

/** Longest a move's animation may take, in ms; longer sowings speed up to fit. */
const MAX_MS = 3200;

/**
 * Timing of each step, in ms from the start of the move: the hand spends `dur[i]` travelling to the
 * pit of step `i` and the pit changes when it arrives, at `land[i]`. Drops speed up for long sowings
 * so a move never drags; captured seeds get time to fly across the board.
 */
export function schedule(trace: SowTrace): { at: number[]; dur: number[]; land: number[]; total: number } {
  const drops = trace.steps.filter((s) => s.kind === "drop").length;
  const drop = Math.max(22, Math.min(120, 1500 / Math.max(1, drops)));
  const raw = trace.steps.map((s, i) =>
    s.kind === "capture"
      ? 260
      : s.kind === "lift"
        ? i === 0
          ? 140
          : Math.max(drop * 1.4, 110)
        : trace.steps[i - 1]?.kind === "capture"
          ? 340
          : drop,
  );
  const sum = raw.reduce((a, b) => a + b, 0);
  const fit = Math.min(1, MAX_MS / sum);
  const at: number[] = [];
  const dur: number[] = [];
  const land: number[] = [];
  let t = 0;
  for (const r of raw) {
    const d = r * fit;
    at.push(t);
    dur.push(d);
    land.push(t + d * 0.8);
    t += d;
  }
  return { at, dur, land, total: t + 100 };
}
