import { and, asc, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { gameSessions, leaderboardRuns, leaderboardWeeks, users, type User, type WeekWinner } from "@/db/schema";
import { config } from "./config";
import { UserError } from "./errors";
import { distributePrizes } from "./payouts";
import { ARCADE, isArcadeKey, type ArcadeKey } from "./games/arcade";
import { entryFeeFor, levelLimitMs, LEVEL_GRACE_MS, weekBounds, weekOf, WEEKLY_FEE_PERCENT, weeklySplit } from "./games/weekly-rules";
import { accountBalance, lockWallets, PLATFORM_FEES, postTransfer, walletOf } from "./wallet";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Exec = Db | Tx;
export type Run = typeof leaderboardRuns.$inferSelect;

/** Ledger account holding one game's entry fees for one week until they are paid out. */
export const weeklyPool = (game: ArcadeKey, week: string) => `weekly:${game}:${week}`;

/** Paid entry is on (test funds on the test site); otherwise runs are free and there are no prizes. */
export const weeklyPaid = () => config.paidEntryEnabled();

export async function runsThisWeek(db: Exec, userId: string, game: ArcadeKey, week: string): Promise<number> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(leaderboardRuns)
    .where(and(eq(leaderboardRuns.userId, userId), eq(leaderboardRuns.game, game), eq(leaderboardRuns.week, week)));
  return n;
}

/** What the player's next run of this game costs this week. */
export async function nextRunFee(db: Exec, userId: string, game: ArcadeKey, now = new Date()): Promise<number> {
  if (!weeklyPaid()) return 0;
  return entryFeeFor(await runsThisWeek(db, userId, game, weekOf(now)));
}

async function openLevel(db: Exec, runId: string) {
  const [s] = await db
    .select()
    .from(gameSessions)
    .where(and(eq(gameSessions.runId, runId), isNull(gameSessions.finishedAt)));
  return s ?? null;
}

/** Ends a run where it stands. A level still in play scores 0. */
async function endRun(tx: Exec, run: Run, now: Date, detail: string) {
  await tx
    .update(gameSessions)
    .set({ finishedAt: now, timeMs: 0, score: 0, points: 0, valid: false, cleared: false, detail })
    .where(and(eq(gameSessions.runId, run.id), isNull(gameSessions.finishedAt)));
  await tx.update(leaderboardRuns).set({ status: "finished", finishedAt: now, detail }).where(eq(leaderboardRuns.id, run.id));
}

/**
 * The player's active run of this game, if any. A level left running past its clock (the page was closed)
 * is scored 0 and ends the run; so does a run from a week that has closed.
 */
export async function activeRun(db: Db, userId: string, game: ArcadeKey, now = new Date()) {
  const [run] = await db
    .select()
    .from(leaderboardRuns)
    .where(and(eq(leaderboardRuns.userId, userId), eq(leaderboardRuns.game, game), eq(leaderboardRuns.status, "active")))
    .orderBy(desc(leaderboardRuns.startedAt));
  if (!run) return null;
  if (run.week !== weekOf(now)) {
    await endRun(db, run, now, "The week ended");
    return null;
  }
  const level = await openLevel(db, run.id);
  if (level && now.getTime() - level.startedAt.getTime() > levelLimitMs(game, level.stage) + LEVEL_GRACE_MS) {
    await endRun(db, run, now, `Level ${level.stage} was left unfinished`);
    return null;
  }
  return { run, open: level ? { sessionId: level.id, stage: level.stage, startedAt: level.startedAt } : null };
}

/** Pays the entry fee (KES 10 the first time this week, KES 20 after) and starts a run at level 1. */
export async function startRun(db: Db, user: User, gameKey: string, now = new Date()): Promise<Run> {
  if (user.bannedAt) throw new UserError("Your account is suspended");
  if (!isArcadeKey(gameKey)) throw new UserError("Unknown game");
  const game = gameKey;
  if (await activeRun(db, user.id, game, now)) throw new UserError("Finish your current run first");
  const week = weekOf(now);
  return db.transaction(async (tx) => {
    await lockWallets(tx, [user.id]);
    const [again] = await tx
      .select({ id: leaderboardRuns.id })
      .from(leaderboardRuns)
      .where(and(eq(leaderboardRuns.userId, user.id), eq(leaderboardRuns.game, game), eq(leaderboardRuns.status, "active")));
    if (again) throw new UserError("Finish your current run first");
    const fee = weeklyPaid() ? entryFeeFor(await runsThisWeek(tx, user.id, game, week)) : 0;
    if (fee > 0) {
      const balance = await accountBalance(tx, walletOf(user.id));
      if (balance < fee) throw new UserError(`You need KES ${fee} in your wallet to play`);
      await postTransfer(tx, walletOf(user.id), weeklyPool(game, week), fee, `Weekly leaderboard: ${ARCADE[game].name}`);
    }
    const [run] = await tx.insert(leaderboardRuns).values({ userId: user.id, game, week, feeKes: fee, startedAt: now }).returning();
    return run;
  });
}

/** Called from `startSession`: checks the run and hands back the level to play. */
export async function levelToStart(tx: Tx, user: User, runId: string, game: ArcadeKey, now: Date): Promise<number> {
  const [run] = await tx.select().from(leaderboardRuns).where(eq(leaderboardRuns.id, runId)).for("update");
  if (!run || run.userId !== user.id || run.game !== game) throw new UserError("Run not found");
  if (run.status !== "active") throw new UserError("This run is over");
  if (run.week !== weekOf(now)) throw new UserError("This week's leaderboard has closed");
  if (await openLevel(tx, run.id)) throw new UserError("Finish or give up the level you are playing first");
  return run.stage;
}

/** Called from `submitSession` once a run's level has been checked: adds its points and moves the run on. */
export async function recordLevel(
  tx: Tx,
  runId: string,
  game: ArcadeKey,
  stage: number,
  v: { cleared: boolean; flagged: boolean; detail?: string },
  points: number,
  timeMs: number,
  now: Date,
) {
  const [run] = await tx.select().from(leaderboardRuns).where(eq(leaderboardRuns.id, runId)).for("update");
  const last = stage >= ARCADE[game].stages.length;
  const over = !v.cleared || last;
  const [after] = await tx
    .update(leaderboardRuns)
    .set({
      points: run.points + points,
      timeMs: run.timeMs + timeMs,
      flagged: run.flagged || v.flagged,
      ...(over
        ? { status: "finished" as const, finishedAt: now, detail: v.cleared ? "Every level cleared" : `Stopped at level ${stage}${v.detail ? `: ${v.detail}` : ""}` }
        : { stage: stage + 1 }),
    })
    .where(eq(leaderboardRuns.id, runId))
    .returning();
  return { points, total: after.points, over, nextStage: over ? null : stage + 1 };
}

/** The level's clock, used by `submitSession` to stop counting a level that ran over. */
export const levelDeadlineMs = (game: ArcadeKey, stage: number) => levelLimitMs(game, stage) + LEVEL_GRACE_MS;

/** Gives up the level in play (or the run between levels): it scores 0 and the run ends. */
export async function giveUpRun(db: Db, user: User, runId: string, now = new Date()) {
  await db.transaction(async (tx) => {
    const [run] = await tx.select().from(leaderboardRuns).where(eq(leaderboardRuns.id, runId)).for("update");
    if (!run || run.userId !== user.id) throw new UserError("Run not found");
    if (run.status !== "active") return;
    await endRun(tx, run, now, `Gave up at level ${run.stage}`);
  });
}

// ---------------------------------------------------------------- the boards

export type BoardRow = { rank: number; userId: string; username: string | null; points: number; timeMs: number; runs: number };

/** Each player's best finished run of the week (flagged runs are left out), best first. */
export async function weeklyBoard(db: Exec, game: ArcadeKey, week: string): Promise<BoardRow[]> {
  const rows = await db
    .select({
      userId: leaderboardRuns.userId,
      username: users.username,
      points: leaderboardRuns.points,
      timeMs: leaderboardRuns.timeMs,
      finishedAt: leaderboardRuns.finishedAt,
    })
    .from(leaderboardRuns)
    .innerJoin(users, eq(users.id, leaderboardRuns.userId))
    .where(
      and(
        eq(leaderboardRuns.game, game),
        eq(leaderboardRuns.week, week),
        eq(leaderboardRuns.status, "finished"),
        eq(leaderboardRuns.flagged, false),
      ),
    )
    .orderBy(desc(leaderboardRuns.points), asc(leaderboardRuns.timeMs), asc(leaderboardRuns.finishedAt));
  const best = new Map<string, BoardRow>();
  for (const r of rows) {
    const seen = best.get(r.userId);
    if (seen) seen.runs++;
    else best.set(r.userId, { rank: 0, userId: r.userId, username: r.username, points: r.points, timeMs: r.timeMs, runs: 1 });
  }
  return [...best.values()].map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Entry fees collected so far this week, and what the top 3 would share. */
export async function weekPot(db: Exec, game: ArcadeKey, week: string) {
  const [{ gross, players, runs }] = await db
    .select({
      gross: sql<number>`coalesce(sum(${leaderboardRuns.feeKes}), 0)::int`,
      players: sql<number>`count(distinct ${leaderboardRuns.userId})::int`,
      runs: sql<number>`count(*)::int`,
    })
    .from(leaderboardRuns)
    .where(and(eq(leaderboardRuns.game, game), eq(leaderboardRuns.week, week)));
  const fee = Math.floor((gross * WEEKLY_FEE_PERCENT) / 100);
  return { grossKes: gross, platformFeeKes: fee, poolKes: gross - fee, players, runs };
}

export async function myRuns(db: Exec, userId: string, game: ArcadeKey, week: string) {
  return db
    .select()
    .from(leaderboardRuns)
    .where(and(eq(leaderboardRuns.userId, userId), eq(leaderboardRuns.game, game), eq(leaderboardRuns.week, week)))
    .orderBy(desc(leaderboardRuns.startedAt));
}

export async function runLevels(db: Exec, runId: string) {
  return db
    .select({ stage: gameSessions.stage, points: gameSessions.points, cleared: gameSessions.cleared, timeMs: gameSessions.timeMs, detail: gameSessions.detail })
    .from(gameSessions)
    .where(eq(gameSessions.runId, runId))
    .orderBy(asc(gameSessions.stage));
}

export async function settledWeek(db: Exec, game: ArcadeKey, week: string) {
  const [w] = await db.select().from(leaderboardWeeks).where(and(eq(leaderboardWeeks.game, game), eq(leaderboardWeeks.week, week)));
  return w ?? null;
}

// ---------------------------------------------------------------- paying out a finished week

/**
 * Pays out every game's weeks that have ended and not been paid yet: our 10% first, then the top 3 share
 * the rest 50/30/20 (60/40 with two players, all of it with one). Safe to call on every page load.
 * If nobody finished a run that counts, everyone's entry fees go back.
 */
export async function settleDueWeeks(db: Db, now = new Date()): Promise<number> {
  const current = weekOf(now);
  const due = await db
    .selectDistinct({ game: leaderboardRuns.game, week: leaderboardRuns.week })
    .from(leaderboardRuns)
    .leftJoin(leaderboardWeeks, and(eq(leaderboardWeeks.game, leaderboardRuns.game), eq(leaderboardWeeks.week, leaderboardRuns.week)))
    .where(and(lt(leaderboardRuns.week, current), isNull(leaderboardWeeks.week)));
  for (const { game, week } of due) await settleWeek(db, game, week, now);
  return due.length;
}

async function settleWeek(db: Db, game: ArcadeKey, week: string, now: Date) {
  if (weekBounds(week).end > now) throw new Error("That week has not ended");
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`weekly:${game}:${week}`}))`);
    if (await settledWeek(tx, game, week)) return;

    // Runs still going when the week closed end where they stand.
    const open = await tx
      .select()
      .from(leaderboardRuns)
      .where(and(eq(leaderboardRuns.game, game), eq(leaderboardRuns.week, week), eq(leaderboardRuns.status, "active")));
    for (const run of open) await endRun(tx, run, now, "The week ended");

    const board = await weeklyBoard(tx, game, week);
    const pot = await weekPot(tx, game, week);
    const account = weeklyPool(game, week);
    const held = await accountBalance(tx, account);
    const winners: WeekWinner[] = [];
    let platformFeeKes = 0;
    let poolKes = 0;

    if (board.length === 0) {
      // Nobody to pay: every entry fee goes back.
      const paid = await tx
        .select()
        .from(leaderboardRuns)
        .where(and(eq(leaderboardRuns.game, game), eq(leaderboardRuns.week, week), sql`${leaderboardRuns.feeKes} > 0`));
      await lockWallets(tx, paid.map((r) => r.userId));
      for (const r of paid) await postTransfer(tx, account, walletOf(r.userId), r.feeKes, `Refund, weekly leaderboard: ${ARCADE[game].name}`);
    } else {
      platformFeeKes = Math.floor((held * WEEKLY_FEE_PERCENT) / 100);
      poolKes = held - platformFeeKes;
      const split = weeklySplit(board.length);
      const prizes = distributePrizes(poolKes, split);
      if (platformFeeKes > 0) await postTransfer(tx, account, PLATFORM_FEES, platformFeeKes, `Fee, weekly leaderboard: ${ARCADE[game].name} ${week}`);
      await lockWallets(tx, board.slice(0, split.length).map((r) => r.userId));
      for (const [i, r] of board.slice(0, split.length).entries()) {
        const prizeKes = prizes[i] ?? 0;
        if (prizeKes > 0) await postTransfer(tx, account, walletOf(r.userId), prizeKes, `Prize, #${i + 1} weekly leaderboard: ${ARCADE[game].name}`);
        winners.push({ rank: i + 1, userId: r.userId, username: r.username, points: r.points, prizeKes });
      }
    }
    await tx.insert(leaderboardWeeks).values({
      game,
      week,
      grossKes: pot.grossKes,
      platformFeeKes,
      poolKes,
      players: board.length,
      winners,
      settledAt: now,
    });
  });
}

/** Last week's results for every game that had players, for the leaderboards page. */
export async function weeksSettled(db: Exec, week: string, games?: ArcadeKey[]) {
  return db
    .select()
    .from(leaderboardWeeks)
    .where(and(eq(leaderboardWeeks.week, week), games ? inArray(leaderboardWeeks.game, games) : undefined));
}
