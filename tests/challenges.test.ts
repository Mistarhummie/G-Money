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
  heartbeat,
  liveActivity,
  myChallenges,
  needsMe,
  openChallenges,
  playMove,
  quickMatch,
  reportProgress,
  resign,
  WAITING_STALE_MS,
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

describe("play online (quick match)", () => {
  it("pairs the next player with the one already waiting, and both see the same match", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const first = await quickMatch(db, a, { game: "connect4" }, T0);
    expect(first.matched).toBe(false);
    expect(first.challenge.status).toBe("open");
    expect((await challengeView(db, first.challenge, a, T0)).quick).toBe(true);
    // Pressing again while waiting keeps the same search.
    expect((await quickMatch(db, a, { game: "connect4" }, secs(2))).challenge.id).toBe(first.challenge.id);
    expect((await liveActivity(db, ["connect4"], secs(3))).connect4).toMatchObject({ waiting: 1, playing: 0 });

    const second = await quickMatch(db, b, { game: "connect4" }, secs(5));
    expect(second.matched).toBe(true);
    expect(second.challenge.id).toBe(first.challenge.id);
    expect(second.challenge.status).toBe("active");
    expect([second.challenge.side0Id, second.challenge.side1Id].sort()).toEqual([a.id, b.id].sort());
    expect((await liveActivity(db, ["connect4"], secs(6))).connect4).toMatchObject({ waiting: 0, playing: 2 });
    // The countdown starts from the moment both are in.
    expect((await challengeView(db, second.challenge, a, secs(6))).startedAt).toBe(secs(5).getTime());
  });

  it("puts two players pressing at the same moment into one match", async () => {
    for (let round = 0; round < 3; round++) {
      const a = await makeUser();
      const b = await makeUser();
      const [ra, rb] = await Promise.all([quickMatch(db, a, { game: "bao" }, T0), quickMatch(db, b, { game: "bao" }, T0)]);
      expect(ra.challenge.id).toBe(rb.challenge.id);
      expect([ra.matched, rb.matched].sort()).toEqual([false, true]);
    }
    const c = await makeUser();
    const d = await makeUser();
    const e = await makeUser();
    const results = await Promise.all([c, d, e].map((u) => quickMatch(db, u, { game: "drafts" }, T0)));
    // Three players: one pair plays, one waits.
    expect(results.filter((r) => r.matched)).toHaveLength(1);
    expect(new Set(results.map((r) => r.challenge.id)).size).toBe(2);
  });

  it("only pairs players on the same game and stage", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await quickMatch(db, a, { game: "snake", stage: 2 }, T0);
    expect((await quickMatch(db, b, { game: "snake", stage: 3 }, secs(1))).matched).toBe(false);
    expect((await quickMatch(db, b, { game: "g2048", stage: 2 }, secs(1))).matched).toBe(false);
    const c = await makeUser();
    const r = await quickMatch(db, c, { game: "snake", stage: 2 }, secs(2));
    expect(r).toMatchObject({ matched: true });
    expect(r.challenge.createdBy).toBe(a.id);
    expect((await liveActivity(db, ["snake"], secs(3))).snake.waitingByStage).toEqual({ 3: 1 });
  });

  it("doesn't match a player who left, but keeps one whose page is still polling", async () => {
    const gone = await makeUser();
    const here = await makeUser();
    const late = await makeUser();
    const left = await quickMatch(db, gone, { game: "chessbot" }, T0);
    const after = secs(WAITING_STALE_MS / 1000 + 15);
    expect(await liveActivity(db, ["chessbot"], after)).toMatchObject({ chessbot: { waiting: 0 } });
    expect(await openChallenges(db, "chessbot", here, after)).toHaveLength(0);

    const waiting = await quickMatch(db, here, { game: "chessbot" }, after);
    expect(waiting.matched).toBe(false);
    expect((await getChallenge(db, left.challenge.id))?.status).toBe("cancelled");

    // `here` keeps their page open: each poll is a heartbeat, so they are still found a minute later.
    let t = after.getTime();
    for (let i = 0; i < 6; i++) {
      t += 10_000;
      await heartbeat(db, here, (await getChallenge(db, waiting.challenge.id, new Date(t)))!, new Date(t));
    }
    const paired = await quickMatch(db, late, { game: "chessbot" }, new Date(t + 5000));
    expect(paired).toMatchObject({ matched: true, challenge: { id: waiting.challenge.id, status: "active" } });
  });

  it("can join a friend challenge whose creator is watching, never an invited one", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const c = await makeUser();
    const invite = await createChallenge(db, a, { game: "pool", opponent: b.username! });
    await heartbeat(db, a, invite, T0);
    const open = await createChallenge(db, a, { game: "pool" });
    // Not watched yet: not matchable.
    const r1 = await quickMatch(db, c, { game: "pool" }, T0);
    expect(r1.matched).toBe(false);
    await cancelChallenge(db, c, r1.challenge.id);
    await heartbeat(db, a, open, secs(1));
    const r2 = await quickMatch(db, c, { game: "pool" }, secs(2));
    expect(r2).toMatchObject({ matched: true, challenge: { id: open.id } });
    expect((await getChallenge(db, invite.id))?.status).toBe("open");
  });
});

describe("live race progress", () => {
  it("is only taken from the match's players while it is on, and not too often", async () => {
    const { c, a, b } = await start("snake", { stage: 1 });
    const outsider = await makeUser();
    expect(await reportProgress(db, a, c.id, { score: 30, detail: "3/10 food" }, secs(1))).toBe(true);
    // Too soon after the last one: dropped.
    expect(await reportProgress(db, a, c.id, { score: 40 }, secs(1.2))).toBe(false);
    expect(await reportProgress(db, a, c.id, { score: 40, detail: "4/10 food" }, secs(2))).toBe(true);
    expect(await reportProgress(db, b, c.id, { score: 10 }, secs(2))).toBe(true);
    await expect(reportProgress(db, outsider, c.id, { score: 99 }, secs(3))).rejects.toThrow("not playing");
    await expect(reportProgress(db, a, c.id, { score: -1 }, secs(4))).rejects.toThrow("Bad progress");
    await expect(reportProgress(db, a, c.id, { score: Number.NaN }, secs(4))).rejects.toThrow("Bad progress");
    await expect(reportProgress(db, a, c.id, { score: 1e12 }, secs(4))).rejects.toThrow("Bad progress");

    const view = await challengeView(db, (await getChallenge(db, c.id, secs(5)))!, b, secs(5));
    const sideA = c.side0Id === a.id ? 0 : 1;
    expect(view.rounds[sideA].live).toMatchObject({ score: 40, detail: "4/10 food" });
    expect(view.rounds[1 - sideA].live).toMatchObject({ score: 10 });

    await resign(db, b, c.id, secs(6)).catch(() => {}); // races can't be resigned; end it by the clock instead
    await getChallenge(db, c.id, secs(3700));
    await expect(reportProgress(db, a, c.id, { score: 50 }, secs(3701))).rejects.toThrow("over");
  });

  it("isn't accepted for turn-based matches or matches still waiting", async () => {
    const { c, first } = await start("connect4");
    await expect(reportProgress(db, first, c.id, { score: 1 }, secs(1))).rejects.toThrow("not found");
    const a = await makeUser();
    const waiting = await quickMatch(db, a, { game: "sudoku", stage: 1 }, T0);
    await expect(reportProgress(db, a, waiting.challenge.id, { score: 1 }, secs(1))).rejects.toThrow();
  });
});

describe("header badge", () => {
  it("shows challenges sent to you and matches waiting on your move", async () => {
    const a = await makeUser();
    const b = await makeUser();
    expect((await needsMe(db, b, T0)).count).toBe(0);
    const invite = await createChallenge(db, a, { game: "drafts", opponent: b.username! });
    // (Created just now, by the real clock.)
    expect(await needsMe(db, b)).toMatchObject({ count: 1, href: `/challenge/${invite.id}`, label: "New challenge" });
    const accepted = await acceptChallenge(db, b, invite.id, secs(1));
    const toMove = accepted.side0Id === a.id ? a : b;
    const other = toMove === a ? b : a;
    expect(await needsMe(db, toMove, secs(2))).toMatchObject({ count: 1, label: "Your move" });
    expect((await needsMe(db, other, secs(2))).count).toBe(0);
    // Once the clock has run out it's no longer anyone's move.
    expect((await needsMe(db, toMove, secs(200))).count).toBe(0);

    const race = await start("g2048", { stage: 1 });
    expect(await needsMe(db, race.a, T0)).toMatchObject({ count: 1, label: "Your round" });
    await startSession(db, race.a, { game: "g2048", challengeId: race.c.id }, secs(1));
    expect((await needsMe(db, race.a, secs(2))).count).toBe(0);
  });
});
