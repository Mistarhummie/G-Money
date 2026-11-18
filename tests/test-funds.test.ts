import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db";
import { users, type User } from "@/db/schema";
import { acceptChallenge, cancelChallenge, createChallenge, getChallenge, playMove, prizeFor, quickMatch, resign } from "@/lib/challenges";
import { accountBalance, joinWithUsername, walletHistory, walletOf } from "@/lib/wallet";

let db: Db;
const T0 = new Date("2026-11-18T10:00:00Z");
const secs = (n: number) => new Date(T0.getTime() + n * 1000);
const balance = (u: User) => accountBalance(db, walletOf(u.id));

beforeEach(async () => {
  db = await createPgliteDb();
  process.env.TEST_FUNDS = "true";
});
afterEach(() => {
  delete process.env.TEST_FUNDS;
});

describe("joining a test site with a username", () => {
  it("makes a player with 50,000 test funds, and usernames are unique ignoring case", async () => {
    const amina = await joinWithUsername(db, " Amina_K ");
    expect(amina.username).toBe("Amina_K");
    expect(await balance(amina)).toBe(50_000);
    expect(await walletHistory(db, amina.id)).toMatchObject([{ amountKes: 50_000, memo: "Test funds to play with" }]);
    await expect(joinWithUsername(db, "amina_k")).rejects.toThrow("taken");
    await expect(joinWithUsername(db, "a b")).rejects.toThrow("3 to 20");
  });

  it("is switched off on the real site", async () => {
    delete process.env.TEST_FUNDS;
    await expect(joinWithUsername(db, "otieno")).rejects.toThrow("phone number");
  });
});

describe("staked matches", () => {
  it("takes both stakes when the match starts and pays the winner both less 10%", async () => {
    const a = await joinWithUsername(db, "alpha");
    const b = await joinWithUsername(db, "bravo");
    const c = await createChallenge(db, a, { game: "connect4", stake: 1000 });
    // Nothing is taken while the challenge waits, so cancelling needs no refund.
    expect(await balance(a)).toBe(50_000);
    const started = await acceptChallenge(db, b, c.id, T0);
    expect([await balance(a), await balance(b)]).toEqual([49_000, 49_000]);

    const first = started.side0Id === a.id ? a : b;
    const second = first === a ? b : a;
    const moves: [User, string][] = [[first, "0"], [second, "1"], [first, "0"], [second, "1"], [first, "0"], [second, "1"], [first, "0"]];
    for (const [i, [u, m]] of moves.entries()) await playMove(db, u, c.id, m, secs(1 + i));
    expect(prizeFor(1000)).toBe(1800);
    expect(await balance(first)).toBe(49_000 + 1800);
    expect(await balance(second)).toBe(49_000);
    expect(await accountBalance(db, `challenge:${c.id}`)).toBe(0);
    expect(await accountBalance(db, "platform:fees")).toBe(200);
  });

  it("refunds both on a draw, and pays out when time runs out or someone resigns", async () => {
    const a = await joinWithUsername(db, "charlie");
    const b = await joinWithUsername(db, "delta");
    const c1 = await createChallenge(db, a, { game: "chessbot", stake: 500 });
    await acceptChallenge(db, b, c1.id, T0);
    await resign(db, a, c1.id, secs(1));
    expect([await balance(a), await balance(b)]).toEqual([49_500, 50_000 + 400]);

    const c2 = await createChallenge(db, a, { game: "connect4", stake: 100 });
    await acceptChallenge(db, b, c2.id, secs(10));
    // Nobody moves: whoever was to move first loses on time.
    const done = await getChallenge(db, c2.id, secs(10 + 121));
    expect(done?.status).toBe("finished");
    expect((await balance(a)) + (await balance(b))).toBe(100_000 - 100 - 20);

    // A race neither plays within the hour is a draw: both get their stake back.
    const before = [await balance(a), await balance(b)];
    const c3 = await createChallenge(db, a, { game: "snake", stage: 1, stake: 1000 });
    await acceptChallenge(db, b, c3.id, secs(200));
    expect(await balance(a)).toBe(before[0] - 1000);
    const draw = await getChallenge(db, c3.id, secs(200 + 3601));
    expect(draw).toMatchObject({ status: "finished", winnerSide: null });
    expect([await balance(a), await balance(b)]).toEqual(before);
  });

  it("needs enough funds, only allows the listed stakes, and refuses stakes on the real site", async () => {
    const a = await joinWithUsername(db, "echo");
    const b = await joinWithUsername(db, "foxtrot");
    await expect(createChallenge(db, a, { game: "connect4", stake: 123 })).rejects.toThrow("stakes shown");
    // Spend down b's funds, then b can't take on a 5,000 match.
    for (let i = 0; i < 10; i++) {
      const c = await createChallenge(db, a, { game: "chessbot", stake: 5000 });
      if (i < 5) {
        await acceptChallenge(db, b, c.id, secs(i));
        await resign(db, b, c.id, secs(i));
      } else {
        await cancelChallenge(db, a, c.id);
      }
    }
    expect(await balance(b)).toBe(25_000);
    const big = await createChallenge(db, a, { game: "chessbot", stake: 5000 });
    await acceptChallenge(db, b, big.id, secs(20));
    await resign(db, b, big.id, secs(21));
    expect(await balance(b)).toBe(20_000);

    delete process.env.TEST_FUNDS;
    await expect(createChallenge(db, a, { game: "connect4", stake: 100 })).rejects.toThrow("free");
  });

  it("refuses a match the player can't afford", async () => {
    const rich = await joinWithUsername(db, "golf");
    const [poor] = await db.insert(users).values({ phone: "+254700000001", username: "hotel" }).returning();
    const c = await createChallenge(db, rich, { game: "connect4", stake: 100 });
    await expect(acceptChallenge(db, poor, c.id, T0)).rejects.toThrow("test funds");
    await expect(createChallenge(db, poor, { game: "connect4", stake: 100 })).rejects.toThrow("test funds");
  });

  it("only pairs quick matches at the same stake", async () => {
    const a = await joinWithUsername(db, "india");
    const b = await joinWithUsername(db, "juliet");
    await quickMatch(db, a, { game: "connect4", stake: 500 }, T0);
    expect((await quickMatch(db, b, { game: "connect4", stake: 100 }, secs(1))).matched).toBe(false);
    const c = await joinWithUsername(db, "kilo");
    const r = await quickMatch(db, c, { game: "connect4", stake: 500 }, secs(2));
    expect(r.matched).toBe(true);
    expect(r.challenge.stakeKes).toBe(500);
    expect([await balance(a), await balance(c)]).toEqual([49_500, 49_500]);
  });
});
