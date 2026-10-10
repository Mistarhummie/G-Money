import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db";
import { disputes, entries, matches, users, type User } from "@/db/schema";
import { requestOtp, verifyOtp } from "@/lib/auth";
import { inverse, shufflePath } from "@/lib/games/puzzle15";
import type { LichessGame } from "@/lib/lichess";
import { startPuzzleAttempt, submitPuzzleAttempt } from "@/lib/puzzles";
import {
  accountBalance,
  applyAutoConfirms,
  confirmScore,
  createTournament,
  disputeScore,
  finishLeaderboard,
  joinTournament,
  leaderboard,
  prizesOwed,
  recordPayout,
  reportScore,
  resolveDispute,
  startTournament,
  submitChessGame,
} from "@/lib/tournaments";

let db: Db;
let counter = 0;

async function makeUser(overrides: Partial<User> = {}): Promise<User> {
  counter++;
  const [u] = await db
    .insert(users)
    .values({
      phone: `+2547${String(counter).padStart(8, "0")}`,
      username: `player${counter}`,
      efootballId: `EF${counter}`,
      lichessUsername: `lichess${counter}`,
      ...overrides,
    })
    .returning();
  return u;
}

const screenshot = { mimeType: "image/png", data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) };
const T0 = new Date("2026-11-01T10:00:00Z");
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);

beforeEach(async () => {
  db = await createPgliteDb();
});

describe("sign-in", () => {
  it("creates an account from a phone code and blocks wrong codes", async () => {
    const { devCode, phone } = await requestOtp(db, "0712 000 111");
    expect(phone).toBe("+254712000111");
    await expect(verifyOtp(db, "0712000111", "000000" === devCode ? "111111" : "000000")).rejects.toThrow("Wrong code");
    const user = await verifyOtp(db, "+254712000111", devCode!);
    expect(user.phone).toBe("+254712000111");
    // Codes are single use.
    await expect(verifyOtp(db, "0712000111", devCode!)).rejects.toThrow();
  });

  it("limits how many codes a number can request", async () => {
    for (let i = 0; i < 5; i++) await requestOtp(db, "0712000222");
    await expect(requestOtp(db, "0712000222")).rejects.toThrow("Too many codes");
  });
});

describe("eFootball bracket tournament", () => {
  it("runs from sign-up to champion with confirm, auto-confirm and a dispute", async () => {
    const admin = await makeUser({ isAdmin: true });
    const t = await createTournament(db, admin, {
      title: "Saturday eFootball Cup",
      game: "efootball",
      entryType: "free",
      entryFeeKes: 0,
      sponsoredPrizeKes: 5000,
      maxPlayers: 8,
      startsAt: T0,
    });
    const players = await Promise.all([1, 2, 3, 4, 5].map(() => makeUser()));
    for (const p of players) await joinTournament(db, p, t.id);
    await expect(joinTournament(db, players[0], t.id)).rejects.toThrow("already joined");

    await startTournament(db, admin, t.id, T0);
    const all = await db.select().from(matches).where(eq(matches.tournamentId, t.id));
    expect(all).toHaveLength(4 + 2 + 1);
    // 5 players in an 8 bracket: 3 byes complete straight away.
    expect(all.filter((m) => m.round === 1 && m.status === "completed")).toHaveLength(3);

    const byId = new Map(players.map((p) => [p.id, p]));
    const pending = async (round: number) =>
      (await db.select().from(matches).where(eq(matches.tournamentId, t.id))).filter(
        (m) => m.round === round && m.status === "pending" && m.playerAId && m.playerBId,
      );

    // Round 1: the one real match, reported and confirmed.
    const [r1] = await pending(1);
    const a = byId.get(r1.playerAId!)!;
    const b = byId.get(r1.playerBId!)!;
    await expect(reportScore(db, a, r1.id, { scoreA: 2, scoreB: 2, screenshot }, minutes(5))).rejects.toThrow("level");
    await expect(reportScore(db, a, r1.id, { scoreA: 2, scoreB: 1 }, minutes(5))).rejects.toThrow("screenshot");
    await reportScore(db, a, r1.id, { scoreA: 2, scoreB: 1, screenshot }, minutes(5));
    await expect(confirmScore(db, a, r1.id)).rejects.toThrow("opponent");
    await confirmScore(db, b, r1.id, minutes(6));

    // Round 2: one match auto-confirms after 30 minutes, the other is disputed.
    const r2 = await pending(2);
    expect(r2).toHaveLength(2);
    const [m1, m2] = r2;
    await reportScore(db, byId.get(m1.playerAId!)!, m1.id, { scoreA: 3, scoreB: 0, screenshot }, minutes(10));
    expect(await applyAutoConfirms(db, t.id, minutes(20))).toBe(0);
    expect(await applyAutoConfirms(db, t.id, minutes(41))).toBe(1);

    await reportScore(db, byId.get(m2.playerAId!)!, m2.id, { scoreA: 1, scoreB: 0, screenshot }, minutes(10));
    await disputeScore(db, byId.get(m2.playerBId!)!, m2.id, { reason: "I won 2-1, he reported the wrong game", scoreA: 1, scoreB: 2, screenshot }, minutes(15));
    expect(await applyAutoConfirms(db, t.id, minutes(60))).toBe(0);
    const [d] = await db.select().from(disputes);
    await expect(resolveDispute(db, players[0].isAdmin ? players[0] : await makeUser(), d.id, { winnerId: m2.playerBId!, note: "x" })).rejects.toThrow("admins");
    await resolveDispute(db, admin, d.id, { winnerId: m2.playerBId!, note: "Screenshot shows 2-1" }, minutes(70));
    const [reporter] = await db.select().from(users).where(eq(users.id, m2.playerAId!));
    expect(reporter.disputesLost).toBe(1);

    // Final.
    const [final] = await pending(3);
    await reportScore(db, byId.get(final.playerAId!)!, final.id, { scoreA: 4, scoreB: 2, screenshot }, minutes(80));
    await confirmScore(db, byId.get(final.playerBId!)!, final.id, minutes(81));

    const results = await db.select().from(entries).where(eq(entries.tournamentId, t.id));
    const champion = results.find((e) => e.finalRank === 1)!;
    expect(champion.userId).toBe(final.playerAId);
    expect(champion.prizeKes).toBe(3500);
    expect(results.find((e) => e.finalRank === 2)!.prizeKes).toBe(1500);
    expect(await accountBalance(db, `user:${champion.userId}`)).toBe(3500);
    expect(await accountBalance(db, `sponsor:${t.id}`)).toBe(-5000);

    // The prize is paid by hand over M-Pesa and recorded.
    expect(await prizesOwed(db)).toHaveLength(2);
    await expect(recordPayout(db, admin, champion.userId, 4000, "QWE123")).rejects.toThrow("only owed");
    await recordPayout(db, admin, champion.userId, 3500, "QWE123");
    expect(await accountBalance(db, `user:${champion.userId}`)).toBe(0);
    expect(await prizesOwed(db)).toHaveLength(1);
  });

  it("keeps paid entry switched off", async () => {
    const admin = await makeUser({ isAdmin: true });
    await expect(
      createTournament(db, admin, { title: "Paid cup", game: "eafc", entryType: "paid", entryFeeKes: 100, sponsoredPrizeKes: 0, maxPlayers: 8, startsAt: T0 }),
    ).rejects.toThrow("Paid entry is switched off");
  });

  it("requires a username and game ID to join, and blocks banned players", async () => {
    const admin = await makeUser({ isAdmin: true });
    const t = await createTournament(db, admin, { title: "Cup", game: "efootball", entryType: "free", entryFeeKes: 0, sponsoredPrizeKes: 0, maxPlayers: 2, startsAt: T0 });
    await expect(joinTournament(db, await makeUser({ efootballId: null }), t.id)).rejects.toThrow("eFootball ID");
    await expect(joinTournament(db, await makeUser({ username: null }), t.id)).rejects.toThrow("username");
    await expect(joinTournament(db, await makeUser({ bannedAt: new Date() }), t.id)).rejects.toThrow("suspended");
    await joinTournament(db, await makeUser(), t.id);
    await joinTournament(db, await makeUser(), t.id);
    await expect(joinTournament(db, await makeUser(), t.id)).rejects.toThrow("full");
  });
});

describe("chess via Lichess", () => {
  it("completes the match from the Lichess result", async () => {
    const admin = await makeUser({ isAdmin: true });
    const t = await createTournament(db, admin, { title: "Chess", game: "chess", entryType: "free", entryFeeKes: 0, sponsoredPrizeKes: 1000, maxPlayers: 2, startsAt: T0 });
    const alice = await makeUser({ lichessUsername: "Alice" });
    const bob = await makeUser({ lichessUsername: "Bob" });
    await joinTournament(db, alice, t.id);
    await joinTournament(db, bob, t.id);
    await startTournament(db, admin, t.id, T0);
    const [m] = await db.select().from(matches).where(eq(matches.tournamentId, t.id));

    const game: LichessGame = {
      id: "abcd1234",
      createdAt: minutes(5).getTime(),
      status: "mate",
      winner: "black",
      players: { white: { user: { name: "alice" } }, black: { user: { name: "bob" } } },
    };
    const res = await submitChessGame(db, alice, m.id, "https://lichess.org/abcd1234", minutes(20), async () => game);
    expect(res.winnerId).toBe(bob.id);
    const [winner] = await db.select().from(entries).where(eq(entries.userId, bob.id));
    expect(winner.finalRank).toBe(1);
    expect(winner.prizeKes).toBe(1000);
  });
});

describe("speed puzzle leaderboard", () => {
  it("only counts real solutions, timed by the server", async () => {
    const admin = await makeUser({ isAdmin: true });
    const t = await createTournament(db, admin, {
      title: "Puzzle sprint",
      game: "puzzle15",
      entryType: "free",
      entryFeeKes: 0,
      sponsoredPrizeKes: 1000,
      maxPlayers: 50,
      attemptsPerPlayer: 2,
      startsAt: T0,
      endsAt: minutes(60 * 24),
    });
    const fast = await makeUser();
    const slow = await makeUser();
    const bot = await makeUser();
    for (const p of [fast, slow, bot]) await joinTournament(db, p, t.id);
    await expect(startPuzzleAttempt(db, fast, t.id, T0)).rejects.toThrow("not open");
    await startTournament(db, admin, t.id, T0);

    const solve = async (u: User, startMin: number, seconds: number) => {
      const { attemptId, seed } = await startPuzzleAttempt(db, u, t.id, minutes(startMin));
      return submitPuzzleAttempt(db, u, attemptId, inverse(shufflePath(seed)), new Date(minutes(startMin).getTime() + seconds * 1000));
    };

    expect(await solve(fast, 1, 90)).toMatchObject({ solved: true, flagged: false, timeMs: 90_000 });
    expect(await solve(slow, 2, 200)).toMatchObject({ solved: true, flagged: false });
    // 400 moves in 5 seconds is not humanly possible.
    expect(await solve(bot, 3, 5)).toMatchObject({ solved: true, flagged: true });

    // Junk moves do not count.
    const { attemptId } = await startPuzzleAttempt(db, slow, t.id, minutes(10));
    expect(await submitPuzzleAttempt(db, slow, attemptId, "UUUU", minutes(11))).toMatchObject({ solved: false });
    await expect(startPuzzleAttempt(db, slow, t.id, minutes(12))).rejects.toThrow("all 2 attempts");

    const board = await leaderboard(db, t.id);
    expect(board.map((r) => r.userId)).toEqual([fast.id, slow.id]);

    await finishLeaderboard(db, admin, t.id, minutes(100));
    const [first] = await db.select().from(entries).where(eq(entries.userId, fast.id));
    expect(first).toMatchObject({ finalRank: 1, prizeKes: 1000 });
  });
});
