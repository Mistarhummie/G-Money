/**
 * Rules for the weekly leaderboards: fees, prize split, level timers and points. Pure, so the browser
 * can show the same numbers the server uses.
 */
import type { ArcadeKey } from "./arcade/types";

/** A player's first run of the week in a game. */
export const FIRST_RUN_KES = 10;
/** Every run after the first, same game, same week. */
export const REPLAY_KES = 20;
/** Our share of each game's weekly pool. */
export const WEEKLY_FEE_PERCENT = 10;
/** How the pool is shared by the top 3 (fewer players: see `weeklySplit`). */
export const WEEKLY_SPLIT = [50, 30, 20];
/** Network allowance on top of a level's timer before the server stops counting it. */
export const LEVEL_GRACE_MS = 15_000;

/** Minutes on the clock for each level of a leaderboard run. */
const LEVEL_MINUTES: Record<ArcadeKey, number[]> = {
  chessbot: [8, 10, 12, 15, 15],
  drafts: [6, 8, 10, 12, 12],
  bao: [8, 10, 12, 12, 15],
  connect4: [4, 5, 6, 7, 8],
  pool: [8, 10, 10, 12, 12],
  snake: [3, 4, 5, 6, 6],
  blocks: [5, 6, 7, 8, 10],
  g2048: [6, 10, 15, 20],
  sudoku: [10, 15, 20, 25],
  // The sprint levels keep their own clocks (45 seconds and 2½ minutes).
  slide: [3, 0.75, 8, 2.5, 15],
  bricks: [4, 5, 6, 7, 8],
  sling: [3, 4, 4, 5, 6],
  darts: [2, 2, 3, 3, 5],
  penalty: [5, 5, 6, 6, 7],
};

export const levelLimitMs = (game: ArcadeKey, stage: number) => {
  const list = LEVEL_MINUTES[game];
  return Math.round(list[Math.min(Math.max(stage, 1), list.length) - 1] * 60_000);
};

export const entryFeeFor = (runsThisWeek: number) => (runsThisWeek === 0 ? FIRST_RUN_KES : REPLAY_KES);

/**
 * Points for one level.
 * - Score games (the computer games, snake, block stacker, 2048): the game's own points, plus a speed
 *   bonus of up to 250 × level for clearing it with time to spare.
 * - Puzzle games scored on time (sudoku, sliding puzzle): 1,000 × level for solving it, plus up to the
 *   same again for speed. Unsolved earns nothing.
 */
export function levelPoints(
  ranking: "score" | "time",
  stage: number,
  limitMs: number,
  v: { valid: boolean; cleared: boolean; score: number },
  timeMs: number,
): number {
  if (!v.valid) return 0;
  const left = Math.max(0, Math.min(1, 1 - timeMs / limitMs));
  if (ranking === "time") return v.cleared ? 1000 * stage + Math.round(1000 * stage * left) : 0;
  return Math.max(0, Math.trunc(v.score)) + (v.cleared ? Math.round(250 * stage * left) : 0);
}

/** Percentages for the places paid, by how many players finished a run that week. */
export function weeklySplit(players: number): number[] {
  if (players >= 3) return WEEKLY_SPLIT;
  if (players === 2) return [60, 40];
  return players === 1 ? [100] : [];
}

// ---------------------------------------------------------------- weeks, Nairobi time (UTC+3 all year)

const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The Monday a moment's week starts on, Nairobi time, as YYYY-MM-DD. */
export function weekOf(now: Date): string {
  const local = new Date(now.getTime() + NAIROBI_OFFSET_MS);
  const sinceMonday = (local.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - sinceMonday));
  return monday.toISOString().slice(0, 10);
}

/** When a week starts and ends (Monday 00:00 to the next Monday 00:00, Nairobi time). */
export function weekBounds(week: string): { start: Date; end: Date } {
  const start = new Date(Date.parse(`${week}T00:00:00Z`) - NAIROBI_OFFSET_MS);
  return { start, end: new Date(start.getTime() + 7 * DAY_MS) };
}

export const previousWeek = (week: string) => weekOf(new Date(weekBounds(week).start.getTime() - DAY_MS));

/** e.g. "23–29 Nov". */
export function weekLabel(week: string): string {
  const first = new Date(`${week}T00:00:00Z`);
  const last = new Date(first.getTime() + 6 * DAY_MS);
  const opts = { timeZone: "UTC" } as const;
  const day = (d: Date) => d.toLocaleDateString("en-GB", { ...opts, day: "numeric" });
  const month = (d: Date) => d.toLocaleDateString("en-GB", { ...opts, month: "short" });
  return month(first) === month(last) ? `${day(first)}–${day(last)} ${month(last)}` : `${day(first)} ${month(first)}–${day(last)} ${month(last)}`;
}
