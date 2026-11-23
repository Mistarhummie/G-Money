import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db";
import { users, type User } from "@/db/schema";
import { startSession, submitSession } from "@/lib/arcade";
import { blocks, gravityAt, newGame, RAMP_TICKS, stageConfig, tick, MIN_GRAVITY } from "@/lib/games/arcade/blocks";
import { formatEntries, puzzleFromSeed, type Entry } from "@/lib/games/arcade/sudoku";
import { levelLimitMs, levelPoints, previousWeek, weekBounds, weekLabel, weekOf } from "@/lib/games/weekly-rules";
import { accountBalance, joinWithUsername, walletOf } from "@/lib/wallet";
import { activeRun, giveUpRun, settleDueWeeks, settledWeek, startRun, weeklyBoard, weekPot, weeklyPool } from "@/lib/weekly";

let db: Db;
// A Wednesday in Nairobi.
const T0 = new Date("2026-11-25T09:00:00Z");
const mins = (n: number, from = T0) => new Date(from.getTime() + n * 60_000);
const balance = (u: User) => accountBalance(db, walletOf(u.id));

function solve(seed: number, stage: number): string {
  const { givens, solution } = puzzleFromSeed(seed, stage);
  const out: Entry[] = [];
  for (let i = 0; i < 81; i++) if (!givens[i]) out.push([Math.floor(i / 9), i % 9, solution[i]]);
  return formatEntries(out);
}

/** Plays one level of a sudoku run: solves it (or not) `took` minutes after it starts. */
async function level(u: User, runId: string, at: Date, took: number, solveIt = true) {
  const s = await startSession(db, u, { game: "sudoku", runId }, at);
  return submitSession(db, u, s.sessionId, solveIt ? solve(s.seed, s.stage) : "", mins(took, at));
}

beforeEach(async () => {
  db = await createPgliteDb();
  process.env.TEST_FUNDS = "true";
});
afterEach(() => {
  delete process.env.TEST_FUNDS;
});

describe("weeks, Nairobi time", () => {
  it("start on Monday at midnight in Nairobi", () => {
    expect(weekOf(new Date("2026-11-23T00:00:00+03:00"))).toBe("2026-11-23");
    expect(weekOf(new Date("2026-11-22T23:59:00+03:00"))).toBe("2026-11-16");
    // Sunday 22:00 UTC is already Monday 01:00 in Nairobi.
    expect(weekOf(new Date("2026-11-29T22:00:00Z"))).toBe("2026-11-30");
    expect(weekBounds("2026-11-23").end.toISOString()).toBe("2026-11-29T21:00:00.000Z");
    expect(previousWeek("2026-11-23")).toBe("2026-11-16");
    expect(weekLabel("2026-11-23")).toBe("23–29 Nov");
    expect(weekLabel("2026-11-30")).toBe("30 Nov–6 Dec");
  });
});

describe("points", () => {
  it("add a speed bonus for clearing a level quickly", () => {
    const limit = 10 * 60_000;
    expect(levelPoints("time", 2, limit, { valid: true, cleared: true, score: 50 }, 5 * 60_000)).toBe(2000 + 1000);
    expect(levelPoints("time", 2, limit, { valid: true, cleared: false, score: 50 }, 1000)).toBe(0);
    expect(levelPoints("score", 3, limit, { valid: true, cleared: true, score: 3400 }, limit)).toBe(3400);
    expect(levelPoints("score", 3, limit, { valid: true, cleared: true, score: 3400 }, 0)).toBe(3400 + 750);
    expect(levelPoints("score", 3, limit, { valid: false, cleared: true, score: 3400 }, 0)).toBe(0);
  });
});

describe("block stacker", () => {
  it("speeds up every 20 seconds, down to a floor", () => {
    expect(gravityAt(1, 0)).toBe(stageConfig(1).gravity);
    expect(gravityAt(1, RAMP_TICKS)).toBeLessThan(stageConfig(1).gravity);
    expect(gravityAt(1, RAMP_TICKS * 3)).toBeLessThan(gravityAt(1, RAMP_TICKS * 2));
    expect(gravityAt(5, RAMP_TICKS * 50)).toBe(MIN_GRAVITY);
    const s = newGame(7, 1);
    for (let t = 0; t < RAMP_TICKS && s.alive; t++) tick(s);
    expect(s.gravity).toBe(gravityAt(1, RAMP_TICKS));
    // With no input the faster blocks top out sooner at a higher stage too, and the replay still verifies.
    expect(blocks.verify({ seed: 7, stage: 1, input: "|end:200", elapsedMs: 10_000 }).valid).toBe(true);
  });
});

describe("weekly leaderboard runs", () => {
  it("charge KES 10 for the first run of the week and KES 20 after, into the game's pool", async () => {
    const a = await joinWithUsername(db, "amina");
    const r1 = await startRun(db, a, "sudoku", T0);
    expect(r1.feeKes).toBe(10);
    await expect(startRun(db, a, "sudoku", T0)).rejects.toThrow("current run");
    await giveUpRun(db, a, r1.id, mins(1));
    const r2 = await startRun(db, a, "sudoku", mins(2));
    expect(r2.feeKes).toBe(20);
    // Another game is a separate leaderboard with its own first-run price.
    expect((await startRun(db, a, "snake", mins(3))).feeKes).toBe(10);
    expect(await balance(a)).toBe(50_000 - 40);
    expect(await accountBalance(db, weeklyPool("sudoku", "2026-11-23"))).toBe(30);
    // Next week the first run is KES 10 again.
    await giveUpRun(db, a, r2.id, mins(4));
    expect((await startRun(db, a, "sudoku", new Date("2026-12-01T09:00:00Z"))).feeKes).toBe(10);
  });

  it("plays every level in order and adds up the points", async () => {
    const a = await joinWithUsername(db, "baraka");
    const run = await startRun(db, a, "sudoku", T0);
    let at = T0;
    let total = 0;
    for (let stage = 1; stage <= 4; stage++) {
      const res = await level(a, run.id, at, 2);
      expect(res.cleared).toBe(true);
      expect(res.run!.points).toBe(levelPoints("time", stage, levelLimitMs("sudoku", stage), res, res.timeMs));
      total += res.run!.points;
      expect(res.run).toMatchObject({ total, over: stage === 4, nextStage: stage === 4 ? null : stage + 1 });
      at = mins(3, at);
    }
    const board = await weeklyBoard(db, "sudoku", "2026-11-23");
    expect(board).toMatchObject([{ rank: 1, username: "baraka", points: total }]);
  });

  it("ends the run at the first level not cleared, and when a level runs out of time", async () => {
    const a = await joinWithUsername(db, "chebet");
    const run = await startRun(db, a, "sudoku", T0);
    const l1 = await level(a, run.id, T0, 2);
    const l2 = await level(a, run.id, mins(3), 1, false);
    expect(l2.run).toMatchObject({ points: 0, total: l1.run!.points, over: true });
    await expect(startSession(db, a, { game: "sudoku", runId: run.id }, mins(5))).rejects.toThrow("run is over");

    const run2 = await startRun(db, a, "sudoku", mins(10));
    // Level 1 has a 10 minute clock: solving it after 11 minutes doesn't count.
    const late = await level(a, run2.id, mins(10), 11);
    expect(late).toMatchObject({ cleared: false, detail: "Out of time", run: { points: 0, over: true } });
  });

  it("closes a level left open past its clock, and only lets one level be in play", async () => {
    const a = await joinWithUsername(db, "dede");
    const run = await startRun(db, a, "sudoku", T0);
    await startSession(db, a, { game: "sudoku", runId: run.id }, T0);
    await expect(startSession(db, a, { game: "sudoku", runId: run.id }, mins(1))).rejects.toThrow("level you are playing");
    expect((await activeRun(db, a.id, "sudoku", mins(5)))?.open?.stage).toBe(1);
    expect(await activeRun(db, a.id, "sudoku", mins(11))).toBeNull();
  });

  it("pays the top 3 from the pool after our 10% once the week ends", async () => {
    const players = await Promise.all(["pl1", "pl2", "pl3", "pl4"].map((n) => joinWithUsername(db, n)));
    // p1 solves 3 levels, p2 2, p3 1, p4 none. p1 also pays for a replay.
    for (const [i, p] of players.entries()) {
      const run = await startRun(db, p, "sudoku", mins(i * 100));
      let at = mins(i * 100);
      for (let s = 0; s < 3 - i; s++) {
        await level(p, run.id, at, 3);
        at = mins(4, at);
      }
      await level(p, run.id, at, 1, false);
    }
    const replay = await startRun(db, players[0], "sudoku", mins(500));
    await giveUpRun(db, players[0], replay.id, mins(501));
    expect((await weekPot(db, "sudoku", "2026-11-23")).grossKes).toBe(60);
    // p4 is still playing when the week closes: the run ends where it stands.
    const open = await startRun(db, players[3], "sudoku", new Date("2026-11-29T20:50:00Z"));
    await startSession(db, players[3], { game: "sudoku", runId: open.id }, new Date("2026-11-29T20:51:00Z"));

    expect(await settleDueWeeks(db, new Date("2026-11-29T20:59:00Z"))).toBe(0);
    const after = new Date("2026-11-30T05:00:00Z");
    expect(await settleDueWeeks(db, after)).toBe(1);
    expect(await settleDueWeeks(db, after)).toBe(0);

    // Gross 80 (10+20+10+10+10+20), our 10% = 8, pool 72 split 50/30/20 = 36/21/14 plus the rounding to first.
    const week = await settledWeek(db, "sudoku", "2026-11-23");
    expect(week).toMatchObject({ grossKes: 80, platformFeeKes: 8, poolKes: 72, players: 4 });
    expect(week!.winners.map((w) => [w.username, w.prizeKes])).toEqual([["pl1", 37], ["pl2", 21], ["pl3", 14]]);
    expect(await balance(players[0])).toBe(50_000 - 30 + 37);
    expect(await balance(players[3])).toBe(50_000 - 30);
    expect(await accountBalance(db, weeklyPool("sudoku", "2026-11-23"))).toBe(0);
    expect(await accountBalance(db, "platform:fees")).toBe(8);
  });

  it("closes runs still going at the end of the week, so a lone player still wins the pool", async () => {
    const a = await joinWithUsername(db, "solo");
    const run = await startRun(db, a, "sudoku", T0);
    await startSession(db, a, { game: "sudoku", runId: run.id }, T0);
    await settleDueWeeks(db, new Date("2026-12-01T00:00:00Z"));
    // The run ended when the week closed, so it does count, with 0 points: one player takes it all less 10%.
    expect(await settledWeek(db, "sudoku", "2026-11-23")).toMatchObject({ grossKes: 10, platformFeeKes: 1, poolKes: 9 });
    expect(await balance(a)).toBe(50_000 - 10 + 9);
  });

  it("is free with no prizes when paid entry is off", async () => {
    delete process.env.TEST_FUNDS;
    const [a] = await db.insert(users).values({ phone: "+254700000001", username: "free" }).returning();
    const run = await startRun(db, a, "sudoku", T0);
    expect(run.feeKes).toBe(0);
    await level(a, run.id, T0, 2);
    await settleDueWeeks(db, new Date("2026-12-01T00:00:00Z"));
    expect(await settledWeek(db, "sudoku", "2026-11-23")).toMatchObject({ grossKes: 0, poolKes: 0, winners: [{ username: "free", prizeKes: 0 }] });
  });
});
