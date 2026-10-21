import { randomInt } from "node:crypto";
import { and, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { challenges, gameSessions, users, type Challenge, type GameSession, type User } from "@/db/schema";
import { UserError } from "./errors";
import { ARCADE, isArcadeKey, type ArcadeGame } from "./games/arcade";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Exec = Db | Tx;

/** Race games: both players must play their round within this time of the challenge being accepted. */
export const RACE_WINDOW_MS = 60 * 60 * 1000;
/** Open challenges nobody accepts are hidden after this long. */
export const OPEN_FOR_MS = 24 * 60 * 60 * 1000;

export const kindOf = (game: ArcadeGame) => (game.pvp ? "turns" : "race");

export function sideOf(c: Challenge, userId: string): 0 | 1 | null {
  if (c.side0Id === userId) return 0;
  if (c.side1Id === userId) return 1;
  return null;
}

export async function createChallenge(
  db: Db,
  user: User,
  input: { game: string; stage?: number; opponent?: string },
): Promise<Challenge> {
  if (user.bannedAt) throw new UserError("Your account is suspended");
  if (!user.username) throw new UserError("Choose a username on your profile first");
  if (!isArcadeKey(input.game)) throw new UserError("Unknown game");
  const game = ARCADE[input.game];
  const kind = kindOf(game);
  const stage = kind === "race" ? Math.trunc(Number(input.stage ?? 1)) : 1;
  if (!(stage >= 1 && stage <= game.stages.length)) throw new UserError("Unknown stage");

  let invitedUserId: string | null = null;
  const name = input.opponent?.trim().replace(/^@/, "");
  if (name) {
    const [other] = await db.select().from(users).where(sql`lower(${users.username}) = lower(${name})`);
    if (!other) throw new UserError(`No player called ${name}`);
    if (other.id === user.id) throw new UserError("You can't challenge yourself");
    invitedUserId = other.id;
  }
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(challenges)
    .where(and(eq(challenges.createdBy, user.id), eq(challenges.status, "open")));
  if (count >= 10) throw new UserError("You already have 10 open challenges. Cancel some first.");

  const [created] = await db
    .insert(challenges)
    .values({ game: game.key, kind, stage, seed: randomInt(1, 2 ** 31), createdBy: user.id, invitedUserId })
    .returning();
  return created;
}

export async function acceptChallenge(db: Db, user: User, id: string, now = new Date()): Promise<Challenge> {
  if (user.bannedAt) throw new UserError("Your account is suspended");
  if (!user.username) throw new UserError("Choose a username on your profile first");
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(challenges).where(eq(challenges.id, id)).for("update");
    if (!c || c.status !== "open") throw new UserError("This challenge is no longer open");
    if (c.createdBy === user.id) throw new UserError("You can't accept your own challenge");
    if (c.invitedUserId && c.invitedUserId !== user.id) throw new UserError("This challenge is for someone else");
    // Who moves first is drawn at random.
    const creatorFirst = randomInt(0, 2) === 0;
    const [updated] = await tx
      .update(challenges)
      .set({
        status: "active",
        side0Id: creatorFirst ? c.createdBy : user.id,
        side1Id: creatorFirst ? user.id : c.createdBy,
        turn: 0,
        lastMoveAt: now,
      })
      .where(eq(challenges.id, c.id))
      .returning();
    return updated;
  });
}

/** The creator withdraws an open challenge, or the invited player turns it down. */
export async function cancelChallenge(db: Db, user: User, id: string): Promise<void> {
  const res = await db
    .update(challenges)
    .set({ status: "cancelled", result: "Cancelled" })
    .where(
      and(
        eq(challenges.id, id),
        eq(challenges.status, "open"),
        or(eq(challenges.createdBy, user.id), eq(challenges.invitedUserId, user.id)),
      ),
    )
    .returning();
  if (!res.length) throw new UserError("Only an open challenge you made or were sent can be cancelled");
}

async function finish(tx: Exec, c: Challenge, winnerSide: 0 | 1 | null, result: string, now: Date): Promise<Challenge> {
  const [updated] = await tx
    .update(challenges)
    .set({ status: "finished", winnerSide, result, finishedAt: now })
    .where(eq(challenges.id, c.id))
    .returning();
  return updated;
}

/** Whoever's clock ran out loses. Applied whenever anyone looks at or plays in the match. */
async function applyClock(tx: Exec, c: Challenge, now: Date): Promise<Challenge> {
  if (c.status !== "active" || !c.lastMoveAt) return c;
  if (c.kind === "turns") {
    if (now.getTime() - c.lastMoveAt.getTime() <= c.moveSeconds * 1000) return c;
    const loser = c.turn as 0 | 1;
    return finish(tx, c, loser === 0 ? 1 : 0, "Ran out of time", now);
  }
  if (now.getTime() - c.lastMoveAt.getTime() <= RACE_WINDOW_MS) return c;
  return settleRace(tx, c, now, true);
}

export async function getChallenge(db: Db, id: string, now = new Date()): Promise<Challenge | null> {
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(challenges).where(eq(challenges.id, id)).for("update");
    if (!c) return null;
    return applyClock(tx, c, now);
  });
}

export async function playMove(db: Db, user: User, id: string, move: string, now = new Date()): Promise<Challenge> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(challenges).where(eq(challenges.id, id)).for("update");
    if (!row || row.kind !== "turns") throw new UserError("Match not found");
    const c = await applyClock(tx, row, now);
    if (c.status !== "active") throw new UserError(c.result ?? "This match is over");
    const side = sideOf(c, user.id);
    if (side === null) throw new UserError("You are not playing in this match");
    if (side !== c.turn) throw new UserError("It's not your turn");
    const rules = ARCADE[c.game].pvp!;
    if (move.length > rules.maxMoveLength) throw new UserError("Illegal move");
    const moves = [...c.moves, move];
    const state = rules.replay(Number(c.seed), moves);
    if (!state) throw new UserError("Illegal move");
    const [updated] = await tx
      .update(challenges)
      .set({ moves, turn: state.turn, lastMoveAt: now })
      .where(eq(challenges.id, c.id))
      .returning();
    if (!state.over) return updated;
    return finish(tx, updated, state.winner, state.detail ?? (state.winner === null ? "Draw" : "Game over"), now);
  });
}

export async function resign(db: Db, user: User, id: string, now = new Date()): Promise<Challenge> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(challenges).where(eq(challenges.id, id)).for("update");
    if (!row) throw new UserError("Match not found");
    const c = await applyClock(tx, row, now);
    if (c.status !== "active") throw new UserError(c.result ?? "This match is over");
    const side = sideOf(c, user.id);
    if (side === null) throw new UserError("You are not playing in this match");
    return finish(tx, c, side === 0 ? 1 : 0, "Resigned", now);
  });
}

// ---------------------------------------------------------------- races

export async function raceSessions(db: Exec, challengeId: string): Promise<GameSession[]> {
  return db.select().from(gameSessions).where(eq(gameSessions.challengeId, challengeId));
}

/** Better of two race results by the game's ranking; 0 = a, 1 = b, null = tie. */
function compare(game: ArcadeGame, a: GameSession | undefined, b: GameSession | undefined): 0 | 1 | null {
  const ok = (s?: GameSession) => !!s?.finishedAt && s.valid && !s.flagged;
  if (!ok(a) && !ok(b)) return null;
  if (!ok(a)) return 1;
  if (!ok(b)) return 0;
  if (game.ranking === "score") {
    if (a!.score! !== b!.score!) return a!.score! > b!.score! ? 0 : 1;
  } else {
    if (a!.cleared !== b!.cleared) return a!.cleared ? 0 : 1;
    if (!a!.cleared) return null;
  }
  if (a!.timeMs! !== b!.timeMs!) return a!.timeMs! < b!.timeMs! ? 0 : 1;
  return null;
}

/** Decides a race once both have played, or when the window closes (`final`). */
async function settleRace(tx: Exec, c: Challenge, now: Date, final: boolean): Promise<Challenge> {
  const sessions = await raceSessions(tx, c.id);
  const of = (userId: string | null) => sessions.find((s) => s.userId === userId);
  const a = of(c.side0Id);
  const b = of(c.side1Id);
  const done = (s?: GameSession) => !!s?.finishedAt;
  if (!final && !(done(a) && done(b))) return c;
  const winner = compare(ARCADE[c.game], a, b);
  const result = winner === null ? "Draw" : !done(winner === 0 ? b : a) ? "Opponent didn't play in time" : "Better result";
  return finish(tx, c, winner, result, now);
}

/** Called after a race round is submitted. */
export async function afterRaceRound(db: Db, challengeId: string, now = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const [c] = await tx.select().from(challenges).where(eq(challenges.id, challengeId)).for("update");
    if (c?.status === "active") await settleRace(tx, c, now, false);
  });
}

// ---------------------------------------------------------------- lists

const nameOf = sql<string | null>`(select ${users.username} from ${users} where ${users.id} = ${challenges.createdBy})`;

/** Challenges anyone (or this user) can accept for one game. */
export async function openChallenges(db: Db, game: string, viewer: User | null, now = new Date()) {
  if (!isArcadeKey(game)) return [];
  return db
    .select({ c: challenges, creator: nameOf })
    .from(challenges)
    .where(
      and(
        eq(challenges.game, game),
        eq(challenges.status, "open"),
        sql`${challenges.createdAt} > ${new Date(now.getTime() - OPEN_FOR_MS)}`,
        viewer ? or(isNull(challenges.invitedUserId), eq(challenges.invitedUserId, viewer.id)) : isNull(challenges.invitedUserId),
        viewer ? ne(challenges.createdBy, viewer.id) : undefined,
      ),
    )
    .orderBy(desc(challenges.createdAt))
    .limit(20);
}

/** The viewer's own challenges: waiting, in play, and recent results. */
export async function myChallenges(db: Db, user: User, game?: string) {
  const rows = await db
    .select()
    .from(challenges)
    .where(
      and(
        or(eq(challenges.createdBy, user.id), eq(challenges.side0Id, user.id), eq(challenges.side1Id, user.id), eq(challenges.invitedUserId, user.id)),
        game && isArcadeKey(game) ? eq(challenges.game, game) : undefined,
        inArray(challenges.status, ["open", "active", "finished"]),
      ),
    )
    .orderBy(desc(challenges.createdAt))
    .limit(30);
  const ids = [...new Set(rows.flatMap((c) => [c.createdBy, c.side0Id, c.side1Id, c.invitedUserId]).filter((x): x is string => !!x))];
  const names = new Map(
    ids.length ? (await db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, ids))).map((u) => [u.id, u.username ?? "Player"]) : [],
  );
  return rows.map((c) => ({ c, name: (id: string | null) => (id ? (names.get(id) ?? "Player") : "Anyone") }));
}

export async function playerNames(db: Exec, c: Challenge): Promise<[string, string]> {
  const ids = [c.side0Id, c.side1Id].filter((x): x is string => !!x);
  const rows = ids.length ? await db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, ids)) : [];
  const n = (id: string | null) => rows.find((r) => r.id === id)?.username ?? "Waiting…";
  return [n(c.side0Id), n(c.side1Id)];
}

export type ChallengeView = {
  id: string;
  game: string;
  kind: "turns" | "race";
  stage: number;
  seed: number;
  status: Challenge["status"];
  moves: string[];
  turn: 0 | 1;
  winnerSide: 0 | 1 | null;
  result: string | null;
  names: [string, string];
  creator: string;
  invited: string | null;
  mySide: 0 | 1 | null;
  canAccept: boolean;
  canCancel: boolean;
  /** When the player to move (turns) or both players (race) run out of time. */
  deadline: number | null;
  /** Race rounds: who has played, and the results once the match is over. */
  rounds: { played: boolean; score: number | null; timeMs: number | null; cleared: boolean | null; valid: boolean | null }[];
  iPlayed: boolean;
};

/** Everything a match page needs, from one player's point of view. Results of a race stay hidden until it ends. */
export async function challengeView(db: Db, c: Challenge, viewer: User | null): Promise<ChallengeView> {
  const names = await playerNames(db, c);
  const ids = [c.createdBy, c.invitedUserId].filter((x): x is string => !!x);
  const people = await db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, ids));
  const nameFor = (id: string | null) => (id ? (people.find((p) => p.id === id)?.username ?? "Player") : null);
  const mySide = viewer ? sideOf(c, viewer.id) : null;
  const sessions = c.kind === "race" ? await raceSessions(db, c.id) : [];
  const over = c.status === "finished";
  const rounds = [c.side0Id, c.side1Id].map((id) => {
    const s = sessions.find((x) => x.userId === id);
    const show = over && !!s?.finishedAt;
    return {
      played: !!s?.finishedAt,
      score: show ? s!.score : null,
      timeMs: show ? s!.timeMs : null,
      cleared: show ? s!.cleared : null,
      valid: show ? s!.valid : null,
    };
  });
  const deadline =
    c.status === "active" && c.lastMoveAt
      ? c.lastMoveAt.getTime() + (c.kind === "turns" ? c.moveSeconds * 1000 : RACE_WINDOW_MS)
      : null;
  return {
    id: c.id,
    game: c.game,
    kind: c.kind,
    stage: c.stage,
    // A race board is only handed out when the round starts, so nobody can practise it first.
    seed: c.kind === "turns" ? Number(c.seed) : 0,
    status: c.status,
    moves: c.moves,
    turn: c.turn as 0 | 1,
    winnerSide: c.winnerSide as 0 | 1 | null,
    result: c.result,
    names,
    creator: nameFor(c.createdBy) ?? "Player",
    invited: nameFor(c.invitedUserId),
    mySide,
    canAccept:
      !!viewer && c.status === "open" && c.createdBy !== viewer.id && (!c.invitedUserId || c.invitedUserId === viewer.id),
    canCancel: !!viewer && c.status === "open" && (c.createdBy === viewer.id || c.invitedUserId === viewer.id),
    deadline,
    rounds,
    iPlayed: viewer ? sessions.some((s) => s.userId === viewer.id) : false,
  };
}
