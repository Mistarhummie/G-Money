import { describe, expect, it } from "vitest";
import { firstRoundPairings, nextMatchPosition, seedOrder } from "@/lib/bracket";
import { boardFromSeed, inverse, isSolved, moveForTile, shufflePath, slide } from "@/lib/games/arcade/slide";
import { parseLichessGameId, checkChessGame, type LichessGame } from "@/lib/lichess";
import { computePrizePool, distributePrizes, payoutSplit } from "@/lib/payouts";
import { normaliseKenyanPhone } from "@/lib/phone";

describe("bracket", () => {
  it("orders seeds so top seeds meet last", () => {
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it("gives byes to top seeds", () => {
    const pairings = firstRoundPairings(["s1", "s2", "s3", "s4", "s5", "s6"]);
    expect(pairings).toHaveLength(4);
    expect(pairings[0]).toEqual({ slot: 0, playerA: "s1", playerB: null });
    expect(pairings[2]).toEqual({ slot: 2, playerA: "s2", playerB: null });
    // Every first-round match has at least one real player.
    expect(pairings.every((p) => p.playerA || p.playerB)).toBe(true);
  });

  it("feeds winners into the next round", () => {
    expect(nextMatchPosition(1, 0)).toEqual({ round: 2, slot: 0, side: "A" });
    expect(nextMatchPosition(1, 3)).toEqual({ round: 2, slot: 1, side: "B" });
  });
});

describe("payouts", () => {
  it("takes the 10% fee from entry fees only", () => {
    expect(computePrizePool({ entryFeeKes: 200, entrants: 32, sponsoredPrizeKes: 1000, platformFeePercent: 10 })).toEqual({
      grossEntryFeesKes: 6400,
      platformFeeKes: 640,
      prizePoolKes: 6760,
    });
  });

  it("always pays out exactly the pool", () => {
    const amounts = distributePrizes(1001, payoutSplit("leaderboard", 12));
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(1001);
    expect(amounts).toEqual([501, 300, 200]);
  });
});

describe("sliding puzzle", () => {
  it("makes the same board from the same seed, and it is not already solved", () => {
    expect(boardFromSeed(42, 4)).toEqual(boardFromSeed(42, 4));
    expect(isSolved(boardFromSeed(42, 4))).toBe(false);
    expect(boardFromSeed(42, 3)).toHaveLength(9);
  });

  it("accepts a real solution and rejects junk", () => {
    const solution = inverse(shufflePath(42, 4));
    expect(slide.verify({ seed: 42, stage: 3, input: solution, elapsedMs: 120_000 })).toMatchObject({ valid: true, cleared: true, flagged: false });
    expect(slide.verify({ seed: 42, stage: 3, input: "", elapsedMs: 1000 })).toMatchObject({ valid: true, cleared: false });
    expect(slide.verify({ seed: 42, stage: 3, input: "XYZ", elapsedMs: 1000 }).valid).toBe(false);
    // 400 moves in 5 seconds is not humanly possible.
    expect(slide.verify({ seed: 42, stage: 3, input: solution, elapsedMs: 5000 }).flagged).toBe(true);
  });

  it("enforces the sprint stage time limit", () => {
    const solution = inverse(shufflePath(7, 3));
    expect(slide.verify({ seed: 7, stage: 2, input: solution, elapsedMs: 40_000 }).cleared).toBe(true);
    expect(slide.verify({ seed: 7, stage: 2, input: solution, elapsedMs: 50_000 }).cleared).toBe(false);
  });

  it("maps a tapped tile to a move", () => {
    const solved = [...Array.from({ length: 15 }, (_, i) => i + 1), 0];
    expect(moveForTile(solved, 4, 14)).toBe("L");
    expect(moveForTile(solved, 4, 11)).toBe("U");
    expect(moveForTile(solved, 4, 0)).toBeNull();
  });
});

describe("phone numbers", () => {
  it.each([
    ["0712 345 678", "+254712345678"],
    ["+254712345678", "+254712345678"],
    ["254112345678", "+254112345678"],
    ["0112-345-678", "+254112345678"],
  ])("normalises %s", (input, expected) => {
    expect(normaliseKenyanPhone(input)).toBe(expected);
  });

  it("rejects non-Kenyan mobile numbers", () => {
    expect(normaliseKenyanPhone("0201234567")).toBeNull();
    expect(normaliseKenyanPhone("+15551234567")).toBeNull();
  });
});

describe("lichess", () => {
  it("parses game links", () => {
    expect(parseLichessGameId("https://lichess.org/abcd1234")).toBe("abcd1234");
    expect(parseLichessGameId("https://lichess.org/abcd1234wxyz")).toBe("abcd1234");
    expect(parseLichessGameId("https://lichess.org/abcd1234/black")).toBe("abcd1234");
    expect(parseLichessGameId("abcd1234")).toBe("abcd1234");
    expect(parseLichessGameId("nope")).toBeNull();
  });

  const game = (winner?: "white" | "black"): LichessGame => ({
    id: "abcd1234",
    createdAt: Date.parse("2026-10-10T12:00:00Z"),
    status: winner ? "mate" : "draw",
    winner,
    players: { white: { user: { name: "Alice" } }, black: { user: { name: "Bob" } } },
  });

  it("finds the winner between the right players", () => {
    expect(checkChessGame(game("black"), "alice", "BOB", new Date("2026-10-10T11:00:00Z"))).toEqual({ ok: true, winnerUsername: "Bob" });
  });

  it("rejects other players, old games and draws", () => {
    const since = new Date("2026-10-10T11:00:00Z");
    expect(checkChessGame(game("white"), "alice", "carol", since).ok).toBe(false);
    expect(checkChessGame(game("white"), "alice", "bob", new Date("2026-10-10T13:00:00Z")).ok).toBe(false);
    expect(checkChessGame(game(), "alice", "bob", since).ok).toBe(false);
  });
});
