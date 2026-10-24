import { randomInt } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { challenges, gameSessions, users, type Challenge, type GameSession, type User } from "@/db/schema";
import { UserError } from "./errors";
import { ARCADE, ARCADE_KEYS, isArcadeKey, type ArcadeGame } from "./games/arcade";
import type { ArcadeKey } from "./games/arcade/types";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Exec = Db | Tx;

/** Race games: both players must play their round within this time of the challenge being accepted. */
export const RACE_WINDOW_MS = 60 * 60 * 1000;
/** Open challenges nobody accepts are hidden after this long. */
export const OPEN_FOR_MS = 24 * 60 * 60 * 1000;

/**
 * Quick matches ("Play online") are open challenges marked with this key in `progress`. While one waits,
 * its creator's match page polls the server and every poll stamps `lastMoveAt`: that is the heartbeat.
 */
export const QUICK_KEY = "quick";
/** A waiting player whose page hasn't polled for this long has left: not matched, not counted. */
export const WAITING_STALE_MS = 45 * 1000;
/** Matches count as "playing now" while a move (turns) or the start (races) is this recent. */
const TURNS_LIVE_MS = 150 * 1000;
const RACE_LIVE_MS = 15 * 60 * 1000;
/** Race progress reports closer together than this are dropped. */
export const PROGRESS_GAP_MS = 800;
const MAX_PROGRESS_SCORE = 10_000_000;

export const kindOf = (game: ArcadeGame) => (game.pvp ? "turns" : "race");

export const isQuick = (c: Pick<Challenge, "progress">) => !!c.progress?.[QUICK_KEY];

/** SQL: this row is a quick match. */
const quickSql = sql`(${challenges.progress} -> ${QUICK_KEY}) is not null`;
/** SQL: an open challenge whose creator is on its page right now. */
const waitingSql = (now: Date) => gte(challenges.lastMoveAt, new Date(now.getTime() - WAITING_STALE_MS));
/** SQL: hides quick matches whose creator left. Friend challenges stay open for a day whether or not anyone watches. */
const notAbandonedSql = (now: Date) =>
  or(ne(challenges.status, "open"), sql`not ${quickSql}`, waitingSql(now));

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
  checkPlayer(user);
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
  await checkOpenLimit(db, user);

  const [created] = await db
    .insert(challenges)
    .values({ game: game.key, kind, stage, seed: randomInt(1, 2 ** 31), createdBy: user.id, invitedUserId })
    .returning();
  return created;
}

export async function acceptChallenge(db: Db, user: User, id: string, now = new Date()): Promise<Challenge> {
  checkPlayer(user);
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(challenges).where(eq(challenges.id, id)).for("update");
    return acceptLocked(tx, c, user, now);
  });
}

function checkPlayer(user: User) {
  if (user.bannedAt) throw new UserError("Your account is suspended");
  if (!user.username) throw new UserError("Choose a username on your profile first");
}

/** Accepts a challenge row the caller has locked. */
async function acceptLocked(tx: Tx, c: Challenge | undefined, user: User, now: Date): Promise<Challenge> {
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
}

// ---------------------------------------------------------------- play online (matchmaking)

/**
 * "Play online": joins the longest-waiting player who is looking for the same game (and stage, for races)
 * right now, or starts waiting for one. Everyone pressing for the same game and stage queues on one
 * transaction-scoped advisory lock, so two people pressing at once always end up in one match: the second
 * one in finds the first one's waiting challenge.
 */
export async function quickMatch(
  db: Db,
  user: User,
  input: { game: string; stage?: number },
  now = new Date(),
): Promise<{ challenge: Challenge; matched: boolean }> {
  checkPlayer(user);
  if (!isArcadeKey(input.game)) throw new UserError("Unknown game");
  const game = ARCADE[input.game];
  const kind = kindOf(game);
  const stage = kind === "race" ? Math.trunc(Number(input.stage ?? 1)) : 1;
  if (!(stage >= 1 && stage <= game.stages.length)) throw new UserError("Unknown stage");
  const fresh = new Date(now.getTime() - WAITING_STALE_MS);

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`quick:${game.key}:${stage}`}))`);
    const here = and(eq(challenges.game, game.key), eq(challenges.stage, stage), eq(challenges.status, "open"));

    // Quick matches whose player left stop waiting.
    await tx
      .update(challenges)
      .set({ status: "cancelled", result: "Nobody joined" })
      .where(and(here, quickSql, or(isNull(challenges.lastMoveAt), lt(challenges.lastMoveAt, fresh))));

    // Anyone else waiting for this game right now (a quick match, or an open challenge its creator is watching)?
    const [other] = await tx
      .select()
      .from(challenges)
      .where(and(here, isNull(challenges.invitedUserId), ne(challenges.createdBy, user.id), gte(challenges.lastMoveAt, fresh)))
      .orderBy(asc(challenges.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });

    const [mine] = await tx
      .select()
      .from(challenges)
      .where(and(here, quickSql, eq(challenges.createdBy, user.id)))
      .orderBy(desc(challenges.createdAt))
      .limit(1);

    if (other) {
      if (mine) await tx.update(challenges).set({ status: "cancelled", result: "Matched elsewhere" }).where(eq(challenges.id, mine.id));
      return { challenge: await acceptLocked(tx, other, user, now), matched: true };
    }
    if (mine) {
      const [again] = await tx.update(challenges).set({ lastMoveAt: now }).where(eq(challenges.id, mine.id)).returning();
      return { challenge: again, matched: false };
    }
    await checkOpenLimit(tx, user);
    const [created] = await tx
      .insert(challenges)
      .values({
        game: game.key,
        kind,
        stage,
        seed: randomInt(1, 2 ** 31),
        createdBy: user.id,
        progress: { [QUICK_KEY]: { score: 0, at: now.getTime() } },
        lastMoveAt: now,
      })
      .returning();
    return { challenge: created, matched: false };
  });
}

/** The creator of an open challenge is on its page: keeps their quick match (or open challenge) matchable. */
export async function heartbeat(db: Db, user: User, c: Challenge, now = new Date()): Promise<void> {
  if (c.status !== "open" || c.createdBy !== user.id) return;
  if (c.lastMoveAt && now.getTime() - c.lastMoveAt.getTime() < 1000) return;
  await db
    .update(challenges)
    .set({ lastMoveAt: now })
    .where(and(eq(challenges.id, c.id), eq(challenges.status, "open")));
}

async function checkOpenLimit(tx: Exec, user: User) {
  const [{ count }] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(challenges)
    .where(and(eq(challenges.createdBy, user.id), eq(challenges.status, "open")));
  if (count >= 10) throw new UserError("You already have 10 open challenges. Cancel some first.");
}

// ---------------------------------------------------------------- live race progress

/**
 * A player's live progress in a race (food eaten, lines cleared, tiles home…), shown to the other player.
 * Display only: the result still comes from replaying the round's input. Only the match's own players can
 * report, only while it is active, and reports closer than PROGRESS_GAP_MS apart are dropped (returns false).
 */
export async function reportProgress(
  db: Db,
  user: User,
  id: string,
  p: { score: unknown; detail?: unknown },
  now = new Date(),
): Promise<boolean> {
  const score = Number(p.score);
  if (!Number.isFinite(score) || score < 0 || score > MAX_PROGRESS_SCORE) throw new UserError("Bad progress");
  const detail = typeof p.detail === "string" ? p.detail.replace(/\p{Cc}/gu, "").slice(0, 40) : undefined;
  const entry = { score: Math.round(score), ...(detail ? { detail } : {}), at: now.getTime() };
  const updated = await db
    .update(challenges)
    .set({ progress: sql`${challenges.progress} || ${JSON.stringify({ [user.id]: entry })}::jsonb` })
    .where(
      and(
        eq(challenges.id, id),
        eq(challenges.kind, "race"),
        eq(challenges.status, "active"),
        or(eq(challenges.side0Id, user.id), eq(challenges.side1Id, user.id)),
        gte(challenges.lastMoveAt, new Date(now.getTime() - RACE_WINDOW_MS)),
        sql`coalesce((${challenges.progress} -> ${user.id}::text ->> 'at')::bigint, 0) <= ${now.getTime() - PROGRESS_GAP_MS}`,
      ),
    )
    .returning({ id: challenges.id });
  if (updated.length) return true;
  const [c] = await db.select().from(challenges).where(eq(challenges.id, id));
  if (!c || c.kind !== "race") throw new UserError("Match not found");
  if (sideOf(c, user.id) === null) throw new UserError("You are not playing in this match");
  if (c.status !== "active") throw new UserError("This match is over");
  return false;
}

// ---------------------------------------------------------------- who's online

export type Activity = { waiting: number; playing: number; waitingByStage: Record<number, number> };

/** People waiting for a quick match and playing a match right now, per game. One indexed query. */
export async function liveActivity(db: Db, games: readonly ArcadeKey[] = ARCADE_KEYS, now = new Date()): Promise<Record<string, Activity>> {
  const out: Record<string, Activity> = {};
  for (const g of games) out[g] = { waiting: 0, playing: 0, waitingByStage: {} };
  if (!games.length) return out;
  const waitingSince = new Date(now.getTime() - WAITING_STALE_MS);
  const turnsSince = new Date(now.getTime() - TURNS_LIVE_MS);
  const raceSince = new Date(now.getTime() - RACE_LIVE_MS);
  const rows = await db
    .select({
      game: challenges.game,
      stage: challenges.stage,
      waiting: sql<number>`count(distinct ${challenges.createdBy}) filter (where ${challenges.status} = 'open' and ${challenges.invitedUserId} is null and ${challenges.lastMoveAt} >= ${waitingSince})::int`,
      playing: sql<number>`count(*) filter (where ${challenges.status} = 'active' and ((${challenges.kind} = 'turns' and ${challenges.lastMoveAt} >= ${turnsSince}) or (${challenges.kind} = 'race' and ${challenges.lastMoveAt} >= ${raceSince})))::int`,
    })
    .from(challenges)
    .where(and(inArray(challenges.game, [...games]), inArray(challenges.status, ["open", "active"]), gte(challenges.lastMoveAt, raceSince)))
    .groupBy(challenges.game, challenges.stage);
  for (const r of rows) {
    const a = out[r.game];
    if (!a) continue;
    a.waiting += r.waiting;
    a.playing += r.playing * 2;
    if (r.waiting) a.waitingByStage[r.stage] = (a.waitingByStage[r.stage] ?? 0) + r.waiting;
  }
  return out;
}

// ---------------------------------------------------------------- your move

/**
 * What needs this player now, for the header badge: challenges sent to them and matches waiting on them
 * (their move, or a race round they haven't played). The most urgent first.
 */
export async function needsMe(db: Db, user: User, now = new Date()): Promise<{ count: number; href: string | null; label: string | null }> {
  const me = user.id;
  const rows = await db
    .select({ id: challenges.id, status: challenges.status, kind: challenges.kind, invitedUserId: challenges.invitedUserId })
    .from(challenges)
    .where(
      and(
        inArray(challenges.game, [...ARCADE_KEYS]),
        inArray(challenges.status, ["open", "active"]),
        or(
          and(eq(challenges.status, "open"), eq(challenges.invitedUserId, me), gte(challenges.createdAt, new Date(now.getTime() - OPEN_FOR_MS))),
          and(
            eq(challenges.status, "active"),
            eq(challenges.kind, "turns"),
            or(and(eq(challenges.side0Id, me), eq(challenges.turn, 0)), and(eq(challenges.side1Id, me), eq(challenges.turn, 1))),
            sql`${challenges.lastMoveAt} >= ${now}::timestamptz - make_interval(secs => ${challenges.moveSeconds})`,
          ),
          and(
            eq(challenges.status, "active"),
            eq(challenges.kind, "race"),
            or(eq(challenges.side0Id, me), eq(challenges.side1Id, me)),
            gte(challenges.lastMoveAt, new Date(now.getTime() - RACE_WINDOW_MS)),
            sql`not exists (select 1 from ${gameSessions} where ${gameSessions.challengeId} = ${challenges.id} and ${gameSessions.userId} = ${me})`,
          ),
        ),
      ),
    )
    .orderBy(desc(challenges.lastMoveAt), desc(challenges.createdAt))
    .limit(20);
  if (!rows.length) return { count: 0, href: null, label: null };
  const first = rows.find((r) => r.status === "active" && r.kind === "turns") ?? rows.find((r) => r.status === "active") ?? rows[0];
  const label = first.status === "open" ? "New challenge" : first.kind === "turns" ? "Your move" : "Your round";
  return { count: rows.length, href: `/challenge/${first.id}`, label };
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
        notAbandonedSql(now),
      ),
    )
    .orderBy(desc(challenges.createdAt))
    .limit(20);
}

/** The viewer's own challenges: waiting, in play, and recent results. */
export async function myChallenges(db: Db, user: User, game?: string, now = new Date()) {
  const rows = await db
    .select()
    .from(challenges)
    .where(
      and(
        or(eq(challenges.createdBy, user.id), eq(challenges.side0Id, user.id), eq(challenges.side1Id, user.id), eq(challenges.invitedUserId, user.id)),
        game && isArcadeKey(game) ? eq(challenges.game, game) : undefined,
        inArray(challenges.status, ["open", "active", "finished"]),
        notAbandonedSql(now),
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
  rounds: {
    /** Started their round. */
    started: boolean;
    played: boolean;
    score: number | null;
    timeMs: number | null;
    cleared: boolean | null;
    valid: boolean | null;
    /** What their game reported while they played (display only), while the match is on. */
    live: { score: number; detail?: string; at: number } | null;
  }[];
  /** Finished their own round. */
  iPlayed: boolean;
  /** Started their own round. */
  iStarted: boolean;
  /** A "Play online" quick match. */
  quick: boolean;
  /** Server clock when this view was made, so the browser can count without trusting its own clock. */
  serverNow: number;
  createdAt: number;
  /** When the match started (both players in), while no move has been made yet. Drives the 3-2-1 countdown. */
  startedAt: number | null;
};

/** Everything a match page needs, from one player's point of view. Results of a race stay hidden until it ends. */
export async function challengeView(db: Db, c: Challenge, viewer: User | null, now = new Date()): Promise<ChallengeView> {
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
    const live = c.status === "active" && id ? (c.progress?.[id] ?? null) : null;
    return {
      started: !!s,
      played: !!s?.finishedAt,
      score: show ? s!.score : null,
      timeMs: show ? s!.timeMs : null,
      cleared: show ? s!.cleared : null,
      valid: show ? s!.valid : null,
      live: live ? { score: live.score, detail: live.detail, at: live.at } : null,
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
    iPlayed: viewer ? sessions.some((s) => s.userId === viewer.id && !!s.finishedAt) : false,
    iStarted: viewer ? sessions.some((s) => s.userId === viewer.id) : false,
    quick: isQuick(c),
    serverNow: now.getTime(),
    createdAt: c.createdAt.getTime(),
    startedAt:
      c.status === "active" && c.lastMoveAt && (c.kind === "race" || c.moves.length === 0) ? c.lastMoveAt.getTime() : null,
  };
}
