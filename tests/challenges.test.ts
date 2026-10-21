import { beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db";
import { users, type User } from "@/db/schema";
import { startSession, submitSession } from "@/lib/arcade";
import {
  acceptChallenge,
  cancelChallenge,
  challengeView,
  createChallenge,
  getChallenge,
  myChallenges,
  openChallenges,
  playMove,
  resign,
} from "@/lib/challenges";
import { inverse, shufflePath } from "@/lib/games/arcade/slide";

let db: Db;
let counter = 0;

async function makeUser(overrides: Partial<User> = {}): Promise<User> {
  counter++;
  const [u] = await db
    .insert(users)
    .values({ phone: `+2547${String(counter).padStart(8, "0")}`, username: `pvp${counter}`, ...overrides })
    .returning();
  return u;
}

const T0 = new Date("2026-11-01T10:00:00Z");
const secs = (n: number) => new Date(T0.getTime() + n * 1000);

beforeEach(async () => {
  db = await createPgliteDb();
});

/** Accepts and returns [whoever moves first, the other player]. */
async function start(game: string, opts: { stage?: number } = {}) {
  const a = await makeUser();
  const b = await makeUser();
  const c = await createChallenge(db, a, { game, ...opts });
  const accepted = await acceptChallenge(db, b, c.id, T0);
  const first = accepted.side0Id === a.id ? a : b;
  const second = first === a ? b : a;
  return { c: accepted, first, second, a, b };
}

describe("turn-based matches", () => {
  it("plays Connect Four to a win, checking turns and legality on the server", async () => {
    const { c, first, second } = await start("connect4");
    expect(c.kind).toBe("turns");
    await expect(playMove(db, second, c.id, "0", secs(1))).rejects.toThrow("not your turn");
    await expect(playMove(db, first, c.id, "9", secs(1))).rejects.toThrow("Illegal move");
    // First player stacks column 0, second plays column 1: four in a row on the 7th move.
    const script: [User, string][] = [
      [first, "0"], [second, "1"], [first, "0"], [second, "1"], [first, "0"], [second, "1"], [first, "0"],
    ];
    let last;
    for (const [i, [u, m]] of script.entries()) last = await playMove(db, u, c.id, m, secs(10 + i));
    expect(last).toMatchObject({ status: "finished", winnerSide: 0 });
    await expect(playMove(db, second, c.id, "1", secs(30))).rejects.toThrow();
  });

  it("loses on time when the player to move takes over 2 minutes", async () => {
    const { c, first } = await start("connect4");
    await playMove(db, first, c.id, "3", secs(5));
    const later = await getChallenge(db, c.id, secs(5 + 121));
    expect(later).toMatchObject({ status: "finished", winnerSide: 0, result: "Ran out of time" });
  });

  it("lets a player resign and keeps outsiders out", async () => {
    const { c, second } = await start("chessbot");
    const outsider = await makeUser();
    await expect(playMove(db, outsider, c.id, "e2e4", secs(1))).rejects.toThrow("not playing");
    expect(await resign(db, second, c.id, secs(2))).toMatchObject({ status: "finished", winnerSide: 0, result: "Resigned" });
  });
});

describe("challenges", () => {
  it("only the invited player can accept, and open lists respect that", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const other = await makeUser();
    await expect(createChallenge(db, a, { game: "drafts", opponent: "nobody" })).rejects.toThrow("No player");
    await expect(createChallenge(db, a, { game: "drafts", opponent: a.username! })).rejects.toThrow("yourself");
    const c = await createChallenge(db, a, { game: "drafts", opponent: `@${b.username!.toUpperCase()}` });
    expect(await openChallenges(db, "drafts", other)).toHaveLength(0);
    expect(await openChallenges(db, "drafts", b)).toHaveLength(1);
    await expect(acceptChallenge(db, other, c.id)).rejects.toThrow("someone else");
    await expect(acceptChallenge(db, a, c.id)).rejects.toThrow("your own");
    await acceptChallenge(db, b, c.id);
    await expect(acceptChallenge(db, b, c.id)).rejects.toThrow("no longer open");
    expect((await myChallenges(db, a, "drafts"))[0].c.status).toBe("active");
  });

  it("can be cancelled by its creator or declined by the invited player", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const c1 = await createChallenge(db, a, { game: "bao" });
    await expect(cancelChallenge(db, b, c1.id)).rejects.toThrow();
    await cancelChallenge(db, a, c1.id);
    const c2 = await createChallenge(db, a, { game: "bao", opponent: b.username! });
    await cancelChallenge(db, b, c2.id);
    expect((await getChallenge(db, c2.id))?.status).toBe("cancelled");
  });
});

describe("race matches", () => {
  it("gives both players the same board once, and the faster solve wins", async () => {
    const { c, a, b } = await start("slide", { stage: 3 });
    expect(c.kind).toBe("race");
    // The board isn't shown before the round starts.
    expect((await challengeView(db, c, a)).seed).toBe(0);

    const ra = await startSession(db, a, { game: "slide", challengeId: c.id }, secs(10));
    const rb = await startSession(db, b, { game: "slide", challengeId: c.id }, secs(20));
    expect(ra.seed).toBe(rb.seed);
    expect(ra.stage).toBe(3);
    await expect(startSession(db, a, { game: "slide", challengeId: c.id }, secs(30))).rejects.toThrow("already played");

    const solution = inverse(shufflePath(ra.seed, 4));
    await submitSession(db, a, ra.sessionId, solution, secs(10 + 200));
    // Results stay hidden until both have played.
    const mid = await challengeView(db, (await getChallenge(db, c.id, secs(215)))!, b);
    expect(mid.status).toBe("active");
    expect(mid.rounds.map((r) => r.score)).toEqual([null, null]);

    await submitSession(db, b, rb.sessionId, solution, secs(20 + 100));
    const done = (await getChallenge(db, c.id, secs(130)))!;
    expect(done.status).toBe("finished");
    expect(done.winnerSide).toBe(done.side0Id === b.id ? 0 : 1);
  });

  it("goes to the player who played when the other misses the hour", async () => {
    const { c, a } = await start("slide", { stage: 1 });
    const r = await startSession(db, a, { game: "slide", challengeId: c.id }, secs(10));
    await submitSession(db, a, r.sessionId, inverse(shufflePath(r.seed, 3)), secs(60));
    const late = (await getChallenge(db, c.id, secs(3601)))!;
    expect(late).toMatchObject({ status: "finished", winnerSide: late.side0Id === a.id ? 0 : 1, result: "Opponent didn't play in time" });
  });
});
