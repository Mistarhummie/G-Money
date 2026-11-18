import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db";
import { ludoPlayers, users, type User } from "@/db/schema";
import { chooseMove } from "@/lib/ludo/bots";
import { BOT_MOVE_MS, BOT_ROLL_MS, TURN_SECONDS } from "@/lib/ludo/meta";
import {
  BASE,
  HOME,
  apply,
  distinctChoices,
  legalTokens,
  move,
  newGame,
  replay,
  roll,
  seatColours,
  trackSquare,
  type LudoSetup,
  type LudoState,
} from "@/lib/ludo/rules";
import {
  createTable,
  getLudoGame,
  joinTable,
  leaveTable,
  ludoAct,
  ludoProgressOf,
  ludoUnlocked,
  ludoView,
  quickMatch,
  startComputerGame,
  startTable,
  stateOf,
} from "@/lib/ludo/service";

const two: LudoSetup = { colours: seatColours(2), humans: [true, true], first: 0 };
const four: LudoSetup = { colours: seatColours(4), humans: [true, true, true, true], first: 0 };

/** A game with tokens placed by hand. */
function at(setup: LudoSetup, tokens: number[][], patch: Partial<LudoState> = {}): LudoState {
  return { ...newGame(setup), tokens: tokens.map((r) => [...r]), ...patch };
}
const rolled = (s: LudoState, v: number) => {
  const r = roll(s, v);
  expect(r).not.toBeNull();
  return r!;
};

describe("Ludo rules", () => {
  it("lays out the board: starts 13 apart, opposite colours for two players", () => {
    expect(seatColours(2)).toEqual([0, 2]);
    expect(seatColours(3)).toEqual([0, 1, 2]);
    expect(trackSquare(0, 0)).toBe(0);
    expect(trackSquare(1, 0)).toBe(13);
    expect(trackSquare(3, 20)).toBe(7);
    expect(trackSquare(0, 51)).toBeNull();
    expect(trackSquare(0, BASE)).toBeNull();
  });

  it("needs a 6 to leave base; anything else with all tokens at home base passes the turn", () => {
    const s = newGame(two);
    const r = rolled(s, 4);
    expect(r.last).toMatchObject({ k: "roll", outcome: "pass" });
    expect(r.turn).toBe(1);
    const six = rolled(r, 6);
    expect(six.phase).toBe("move");
    expect(legalTokens(six)).toEqual([0, 1, 2, 3]);
    // All four are in base: one real choice.
    expect(distinctChoices(six)).toEqual([0]);
    const out = move(six, 2)!;
    expect(out.tokens[1][2]).toBe(0);
    // A 6 gives another roll.
    expect(out.turn).toBe(1);
    expect(out.phase).toBe("roll");
  });

  it("moves by the roll and passes the turn without a 6", () => {
    const s = rolled(at(two, [[0, BASE, BASE, BASE], [BASE, BASE, BASE, BASE]]), 3);
    expect(legalTokens(s)).toEqual([0]);
    const m = move(s, 0)!;
    expect(m.tokens[0][0]).toBe(3);
    expect(m.turn).toBe(1);
    expect(move(s, 1)).toBeNull();
  });

  it("captures on a plain square, sends the token home to base and gives a bonus roll", () => {
    // Red at progress 10 (track 10); yellow token at its progress 36 = track (26+36)%52 = 10.
    const s = rolled(at(two, [[7, BASE, BASE, BASE], [36, BASE, BASE, BASE]]), 3);
    const m = move(s, 0)!;
    expect(m.last).toMatchObject({ k: "move", captured: [{ seat: 1, token: 0, from: 36 }], again: true });
    expect(m.tokens[1][0]).toBe(BASE);
    expect(m.turn).toBe(0);
  });

  it("never captures on a star or a start square", () => {
    // Track 8 is a star. Yellow's progress 34 = track 8.
    const star = move(rolled(at(two, [[5, BASE, BASE, BASE], [34, BASE, BASE, BASE]]), 3), 0)!;
    expect(star.tokens[1][0]).toBe(34);
    expect(star.last).toMatchObject({ captured: [], safeSave: true, again: false });
    // Yellow's start is track 26 = red's progress 26.
    const start = move(rolled(at(two, [[22, BASE, BASE, BASE], [0, BASE, BASE, BASE]]), 4), 0)!;
    expect(start.tokens[1][0]).toBe(0);
    // A token leaving base onto its start square doesn't capture either.
    const enter = move(rolled(at(two, [[BASE, BASE, BASE, BASE], [26, BASE, BASE, BASE]]), 6), 0)!;
    expect(enter.tokens[1][0]).toBe(26);
  });

  it("turns into the home column and needs the exact roll to get home", () => {
    // Red at 50 (last track square). A 6 lands on 56 = home.
    const s = at(two, [[53, 50, HOME, HOME], [BASE, BASE, BASE, BASE]]);
    const r5 = rolled(s, 5);
    // 53 + 5 overshoots; only the token on 50 can move.
    expect(legalTokens(r5)).toEqual([1]);
    const m = move(r5, 1)!;
    expect(m.tokens[0][1]).toBe(55);
    // Home column squares are off the shared track: nobody can capture there.
    expect(trackSquare(0, 55)).toBeNull();
    const r3 = rolled(at(two, [[53, 55, HOME, HOME], [BASE, BASE, BASE, BASE]]), 3);
    const home = move(r3, 0)!;
    expect(home.last).toMatchObject({ home: true, again: true });
    expect(home.turn).toBe(0);
    // Nothing fits a 6 (53+6 and 55+6 overshoot): it still earns the next roll.
    const six = rolled(at(two, [[53, 55, HOME, HOME], [BASE, BASE, BASE, BASE]]), 6);
    expect(six.last).toMatchObject({ outcome: "again" });
    expect(six.turn).toBe(0);
  });

  it("forfeits the turn on three 6s in a row, keeping the moves already made", () => {
    let s = rolled(newGame(two), 6);
    s = move(s, 0)!;
    s = rolled(s, 6);
    s = move(s, 0)!;
    expect(s.tokens[0][0]).toBe(6);
    s = rolled(s, 6);
    expect(s.last).toMatchObject({ outcome: "forfeit" });
    expect(s.turn).toBe(1);
    expect(s.tokens[0][0]).toBe(6);
    // The run of 6s starts again on the next turn.
    expect(s.sixes).toBe(0);
  });

  it("a capture's bonus roll that comes up 6 starts a fresh run of sixes", () => {
    let s = rolled(at(two, [[7, BASE, BASE, BASE], [36, BASE, BASE, BASE]]), 3);
    s = move(s, 0)!;
    s = rolled(s, 6);
    expect(s.sixes).toBe(1);
  });

  it("wins when all four tokens are home, and the game ends with two players", () => {
    const s = rolled(at(two, [[HOME, HOME, HOME, 54], [BASE, 3, BASE, BASE]]), 2);
    const m = move(s, 3)!;
    expect(m.over).toBe(true);
    expect(m.places).toEqual([0, 1]);
    expect(roll(m, 3)).toBeNull();
  });

  it("with four players the rest play on for places, skipping finished players", () => {
    const s = rolled(at(four, [[HOME, HOME, HOME, 54], [1, BASE, BASE, BASE], [2, BASE, BASE, BASE], [3, BASE, BASE, BASE]]), 2);
    const m = move(s, 3)!;
    expect(m.over).toBe(false);
    expect(m.finished).toEqual([0]);
    expect(m.turn).toBe(1);
    // Seat 3 rolls a 1 and passes back round to seat 1, never to the finished seat 0.
    const later = rolled({ ...m, turn: 3 }, 1);
    const mv = move(later, 0)!;
    expect(mv.turn).toBe(1);
  });

  it("ends when only computers are left racing, ranking the rest by distance", () => {
    const setup: LudoSetup = { colours: seatColours(3), humans: [true, false, false], first: 0 };
    const s = at(setup, [[10, BASE, BASE, BASE], [30, 20, BASE, BASE], [5, BASE, BASE, BASE]]);
    const left = apply(s, "b0")!;
    expect(left.over).toBe(true);
    expect(left.places).toEqual([1, 0, 2]);
  });

  it("replays logs and rejects anything illegal", () => {
    expect(replay(two, ["r6", "m0", "r3", "m0"])?.tokens[0][0]).toBe(3);
    expect(replay(two, ["r6", "m0", "r3", "m1"])).toBeNull(); // token 1 is still in base
    expect(replay(two, ["m0"])).toBeNull(); // no roll yet
    expect(replay(two, ["r6", "r6"])).toBeNull(); // must move first
    expect(replay(two, ["r7"])).toBeNull();
    expect(replay(two, ["x1"])).toBeNull();
  });

  it("computers at every level finish whole games", () => {
    let seed = 7;
    const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let level = 1; level <= 5; level++) {
      for (const n of [2, 4]) {
        let s = newGame({ colours: seatColours(n), humans: Array(n).fill(false), first: 0 });
        let steps = 0;
        while (!s.over && steps < 20000) {
          s = s.phase === "roll" ? roll(s, 1 + Math.floor(rng() * 6))! : move(s, chooseMove(s, level, rng))!;
          steps++;
        }
        expect(s.over).toBe(true);
        expect(s.places).toHaveLength(n);
        expect(s.finished.length).toBe(n - 1);
      }
    }
  });

  it("stronger computers beat random ones", () => {
    let seed = 99;
    const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    let strongWins = 0;
    for (let game = 0; game < 120; game++) {
      let s = newGame({ colours: seatColours(2), humans: [false, false], first: game % 2 });
      while (!s.over) s = s.phase === "roll" ? roll(s, 1 + Math.floor(rng() * 6))! : move(s, chooseMove(s, s.turn === 0 ? 5 : 1, rng))!;
      if (s.places![0] === 0) strongWins++;
    }
    expect(strongWins).toBeGreaterThan(70);
  });

  it("the computer captures and avoids danger when it can", () => {
    // Red rolls 3: token 0 (progress 7) can capture yellow on track 10; token 1 just moves.
    const s = rolled(at(two, [[7, 20, BASE, BASE], [36, BASE, BASE, BASE]]), 3);
    expect(chooseMove(s, 5, () => 0.5)).toBe(0);
  });
});

// ---------------------------------------------------------------- server

let db: Db;
let counter = 0;
async function makeUser(overrides: Partial<User> = {}): Promise<User> {
  counter++;
  const [u] = await db
    .insert(users)
    .values({ phone: `+2547${String(counter).padStart(8, "0")}`, username: `ludo${counter}`, ...overrides })
    .returning();
  return u;
}
const T0 = new Date("2026-11-01T10:00:00Z");
const ms = (n: number) => new Date(T0.getTime() + n);
/** A die that returns these values in order, then 1s. */
const dice = (...values: number[]) => () => values.shift() ?? 1;

const freshDb = () =>
  beforeEach(async () => {
    db = await createPgliteDb();
  });

describe("Ludo vs computer", () => {
  freshDb();
  it("rolls on the server, auto-moves a single choice, and lets the computer reply in time", async () => {
    const me = await makeUser();
    const g = await startComputerGame(db, me, { stage: 1, opponents: 1 }, T0, { rng: () => 0 });
    expect(g.first).toBe(0);
    expect(g.seats).toHaveLength(2);
    // Roll a 6: four tokens in base are one choice, so it comes out at once.
    let after = await ludoAct(db, me, g.id, { kind: "roll" }, 0, ms(500), { dice: dice(6) });
    expect(after.log).toEqual(["r6", "m0"]);
    after = await ludoAct(db, me, g.id, { kind: "roll" }, 2, ms(1000), { dice: dice(2) });
    expect(after.log).toEqual(["r6", "m0", "r2", "m0"]);
    // The computer (seat 1) waits before rolling.
    await expect(ludoAct(db, me, g.id, { kind: "roll" }, 4, ms(1100))).rejects.toThrow("not your turn");
    const later = await getLudoGame(db, g.id, ms(1000 + BOT_ROLL_MS), { dice: dice(3) });
    expect(later!.log).toEqual(["r6", "m0", "r2", "m0", "r3"]);
    // Its 3 can't move anything, so it is now my turn again.
    expect(stateOf(later!).turn).toBe(0);
  });

  it("refuses moves the stored roll doesn't allow, stale screens and other people", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const g = await startComputerGame(db, me, { stage: 1, opponents: 1 }, T0, { rng: () => 0 });
    await ludoAct(db, me, g.id, { kind: "roll" }, 0, ms(10), { dice: dice(6) }); // r6 m0, token 0 out
    await ludoAct(db, me, g.id, { kind: "roll" }, 2, ms(20), { dice: dice(6) }); // a choice now: token 0 or a new one
    const s = stateOf((await getLudoGame(db, g.id, ms(30)))!);
    expect(s.phase).toBe("move");
    // The browser can't pick a roll; a move uses the server's 6. Token 3 is in base: legal with a 6.
    await expect(ludoAct(db, me, g.id, { kind: "roll" }, 3, ms(40))).rejects.toThrow("Move a token first");
    await expect(ludoAct(db, me, g.id, { kind: "move", token: 9 }, 3, ms(40))).rejects.toThrow();
    await expect(ludoAct(db, other, g.id, { kind: "move", token: 0 }, 3, ms(40))).rejects.toThrow("not playing");
    await expect(ludoAct(db, me, g.id, { kind: "move", token: 0 }, 2, ms(40))).rejects.toThrow("moved on");
    const moved = await ludoAct(db, me, g.id, { kind: "move", token: 0 }, 3, ms(50));
    expect(stateOf(moved).tokens[0][0]).toBe(6);
  });

  it("finishing first clears the stage and unlocks the next; leaving counts as a loss", async () => {
    const me = await makeUser();
    expect(await ludoUnlocked(db, me.id)).toBe(1);
    await expect(startComputerGame(db, me, { stage: 2, opponents: 1 }, T0)).rejects.toThrow("Clear stage 1");
    const g = await startComputerGame(db, me, { stage: 1, opponents: 1 }, T0, { rng: () => 0 });
    // My dice are kind: a 6 while a token waits in base, otherwise exactly what the leading token needs.
    const kindDie = (st: LudoState) => () => {
      const mine = st.tokens[0];
      if (mine.includes(BASE)) return 6;
      const p = Math.max(...mine.filter((x) => x < HOME));
      return Math.min(6, HOME - p);
    };
    let now = 100;
    let cur = g;
    for (let i = 0; i < 400 && cur.status === "playing"; i++) {
      now += 5000;
      // The computer only ever rolls 1s, so it never leaves base.
      cur = (await getLudoGame(db, g.id, ms(now), { dice: dice(1), rng: () => 0 }))!;
      if (cur.status !== "playing") break;
      const s = stateOf(cur);
      if (s.turn !== 0) continue;
      if (s.phase === "roll") cur = await ludoAct(db, me, g.id, { kind: "roll" }, cur.log.length, ms(now), { dice: kindDie(s) });
      else cur = await ludoAct(db, me, g.id, { kind: "move", token: distinctChoices(s).at(-1)! }, cur.log.length, ms(now));
    }
    expect(cur.status).toBe("finished");
    expect(cur.places![0]).toBe(0);
    const [p] = await ludoProgressOf(db, me.id);
    expect(p).toMatchObject({ stage: 1, played: 1, wins: 1 });
    expect(p.clearedAt).not.toBeNull();
    expect(await ludoUnlocked(db, me.id)).toBe(2);

    const g2 = await startComputerGame(db, me, { stage: 2, opponents: 3 }, ms(10_000_000), { rng: () => 0 });
    const left = await leaveTable(db, me, g2.id, ms(10_000_001));
    expect(left.status).toBe("finished");
    const rows = await ludoProgressOf(db, me.id);
    expect(rows[1]).toMatchObject({ stage: 2, played: 1, wins: 0, clearedAt: null });
  });
});

describe("Ludo online", () => {
  freshDb();
  it("quick match seats people once each and starts when the table is full", async () => {
    const [a, b, c] = [await makeUser(), await makeUser(), await makeUser()];
    const t1 = await quickMatch(db, a, 3, T0);
    expect(t1.status).toBe("waiting");
    // Asking again returns the same table, not a second seat.
    expect((await quickMatch(db, a, 3, ms(1))).id).toBe(t1.id);
    // A different size is a different table.
    const other = await quickMatch(db, b, 2, ms(2));
    expect(other.id).not.toBe(t1.id);
    const t2 = await quickMatch(db, c, 3, ms(3));
    expect(t2.id).toBe(t1.id);
    expect(t2.status).toBe("waiting");
    const d = await makeUser();
    const full = await quickMatch(db, d, 3, ms(4));
    expect(full.id).toBe(t1.id);
    expect(full.status).toBe("playing");
    expect(full.seats.map((s) => s.userId)).toEqual([a.id, c.id, d.id]);
    const seated = await db.select().from(ludoPlayers).where(eq(ludoPlayers.gameId, t1.id));
    expect(seated.map((r) => r.seat).sort()).toEqual([0, 1, 2]);
    // The database itself refuses a second seat for the same person.
    await expect(db.insert(ludoPlayers).values({ gameId: t1.id, userId: a.id, seat: 3 })).rejects.toThrow();
    // A late joiner can't get in.
    await expect(joinTable(db, await makeUser(), t1.id, ms(5))).rejects.toThrow("already started");
    // Without a username you can't play online.
    await expect(quickMatch(db, await makeUser({ username: null }), 2, ms(6))).rejects.toThrow("username");
  });

  it("the host can start early, with or without computers, and only the host", async () => {
    const [a, b] = [await makeUser(), await makeUser()];
    const t = await createTable(db, a, { size: 4, invite: `@${b.username}` }, T0);
    expect(t.isPrivate).toBe(true);
    expect(t.invited).toEqual([b.id]);
    await expect(startTable(db, a, t.id, false, ms(1))).rejects.toThrow("Wait for another player");
    await joinTable(db, b, t.id, ms(2));
    await expect(startTable(db, b, t.id, false, ms(3))).rejects.toThrow("Only the host");
    const started = await startTable(db, a, t.id, false, ms(4), { rng: () => 0 });
    expect(started.status).toBe("playing");
    expect(started.size).toBe(2);
    expect(stateOf(started).setup.colours).toEqual([0, 2]);

    const c = await makeUser();
    const t2 = await createTable(db, c, { size: 4 }, ms(10));
    const withBots = await startTable(db, c, t2.id, true, ms(11));
    expect(withBots.size).toBe(4);
    expect(withBots.seats.filter((s) => s.bot)).toHaveLength(3);
    await expect(createTable(db, c, { size: 2, invite: "nobody_here" }, ms(12))).rejects.toThrow("No player called nobody_here");
  });

  it("plays a two-player game: turns are enforced and the view never holds a roll before it is made", async () => {
    const [a, b] = [await makeUser(), await makeUser()];
    const t = await createTable(db, a, { size: 2 }, T0);
    const g = await joinTable(db, b, t.id, ms(1));
    expect(g.status).toBe("playing");
    const first = g.seats[g.first].userId === a.id ? a : b;
    const second = first === a ? b : a;
    await expect(ludoAct(db, second, g.id, { kind: "roll" }, 0, ms(2))).rejects.toThrow("not your turn");
    const r = await ludoAct(db, first, g.id, { kind: "roll" }, 0, ms(3), { dice: dice(4) });
    expect(r.log).toEqual(["r4"]); // no token out: turn passes
    const view = await ludoView(db, r, second, 0, ms(4));
    expect(view.log).toEqual(["r4"]);
    expect(view.mySeat).toBe(1 - g.first);
    expect(view.deadline).toBe(ms(3).getTime() + TURN_SECONDS * 1000);
    expect(Object.keys(view)).not.toContain("seed");
    // Asking for only the new part of the log.
    expect((await ludoView(db, r, second, 1, ms(4))).log).toEqual([]);
  });

  it("plays for a player who runs out of time, and hands the seat to the computer after 3 misses", async () => {
    const [a, b] = [await makeUser(), await makeUser()];
    const t = await createTable(db, a, { size: 2 }, T0);
    const g = await joinTable(db, b, t.id, ms(0));
    const late = g.first;
    // Nobody acts: every 30 s the server rolls (and moves) for whoever's turn it is.
    const once = await getLudoGame(db, g.id, ms(TURN_SECONDS * 1000 + 1), { dice: dice(6) });
    expect(once!.log).toEqual(["r6", "m0"]); // a 6 brought a token out for them
    expect(once!.missed[late]).toBe(1);
    // After three misses in a row both seats belong to the computer and the game is over.
    const much = await getLudoGame(db, g.id, ms(10 * TURN_SECONDS * 1000), { dice: dice(3) });
    expect(much!.log.filter((x) => x[0] === "b")).toHaveLength(2);
    expect(much!.status).toBe("finished");
  });

  it("a player who acts in time resets their missed count; one who leaves is replaced", async () => {
    const [a, b, c] = [await makeUser(), await makeUser(), await makeUser()];
    const t = await createTable(db, a, { size: 3 }, T0);
    await joinTable(db, b, t.id, ms(0));
    const g = await joinTable(db, c, t.id, ms(0));
    expect(g.status).toBe("playing");
    const order = [0, 1, 2].map((i) => (g.first + i) % 3);
    const who = (seat: number) => [a, b, c].find((u) => u.id === g.seats[seat].userId)!;
    // First player times out once.
    let cur = (await getLudoGame(db, g.id, ms(TURN_SECONDS * 1000), { dice: dice(2) }))!;
    expect(cur.missed[order[0]]).toBe(1);
    // Second player leaves during their turn: the computer takes the seat and rolls after a moment.
    cur = await leaveTable(db, who(order[1]), g.id, ms(TURN_SECONDS * 1000 + 100));
    expect(cur.seats[order[1]].left).toBe(true);
    expect(cur.log.at(-1)).toBe(`b${order[1]}`);
    cur = (await getLudoGame(db, g.id, ms(TURN_SECONDS * 1000 + 100 + BOT_ROLL_MS), { dice: dice(5) }))!;
    expect(cur.log.at(-1)).toBe("r5");
    expect(stateOf(cur).turn).toBe(order[2]);
    await expect(ludoAct(db, who(order[1]), g.id, { kind: "roll" }, cur.log.length, ms(TURN_SECONDS * 1000 + 2000))).rejects.toThrow();
    expect(BOT_MOVE_MS).toBeGreaterThan(0);
  });

  it("leaving a waiting table frees the seat and passes on the host", async () => {
    const [a, b] = [await makeUser(), await makeUser()];
    const t = await quickMatch(db, a, 4, T0);
    await quickMatch(db, b, 4, ms(1));
    const after = await leaveTable(db, a, t.id, ms(2));
    expect(after.status).toBe("waiting");
    expect(after.hostId).toBe(b.id);
    expect(after.seats.filter((s) => s.userId)).toHaveLength(1);
    const empty = await leaveTable(db, b, t.id, ms(3));
    expect(empty.status).toBe("cancelled");
  });
});
