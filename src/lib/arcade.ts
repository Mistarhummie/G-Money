import { randomInt } from "node:crypto";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { challenges, entries, gameProgress, gameSessions, tournaments, users, type User } from "@/db/schema";
import { afterRaceRound, RACE_WINDOW_MS } from "./challenges";
import { UserError } from "./errors";
import { ARCADE, isArcadeKey, type ArcadeKey } from "./games/arcade";

/** Stages a player may start: stage 1, and every stage after one they have cleared. */
export async function unlockedStages(db: Db, userId: string, game: ArcadeKey): Promise<number> {
  const [{ top }] = await db
    .select({ top: sql<number>`coalesce(max(${gameProgress.stage}), 0)::int` })
    .from(gameProgress)
    .where(and(eq(gameProgress.userId, userId), eq(gameProgress.game, game), sql`${gameProgress.clearedAt} is not null`));
  return Math.min(top + 1, ARCADE[game].stages.length);
}

export async function startSession(
  db: Db,
  user: User,
  input: { game: string; stage?: number; tournamentId?: string | null; challengeId?: string | null },
  now = new Date(),
): Promise<{ sessionId: string; seed: number; stage: number }> {
  if (user.bannedAt) throw new UserError("Your account is suspended");
  if (!isArcadeKey(input.game)) throw new UserError("Unknown game");
  const game = ARCADE[input.game];
  return db.transaction(async (tx) => {
    let stage = Math.trunc(Number(input.stage ?? 1));
    const tournamentId = input.tournamentId || null;
    const challengeId = input.challengeId || null;
    if (challengeId) {
      const [c] = await tx.select().from(challenges).where(eq(challenges.id, challengeId)).for("update");
      if (!c || c.kind !== "race" || c.game !== game.key) throw new UserError("Match not found");
      if (c.side0Id !== user.id && c.side1Id !== user.id) throw new UserError("You are not playing in this match");
      if (c.status !== "active" || !c.lastMoveAt || now.getTime() - c.lastMoveAt.getTime() > RACE_WINDOW_MS) {
        throw new UserError("This match is over");
      }
      const [played] = await tx
        .select({ id: gameSessions.id })
        .from(gameSessions)
        .where(and(eq(gameSessions.challengeId, c.id), eq(gameSessions.userId, user.id)));
      if (played) throw new UserError("You have already played your round");
      // Both players get the same board, so the better player wins.
      const [session] = await tx
        .insert(gameSessions)
        .values({ userId: user.id, game: game.key, stage: c.stage, challengeId: c.id, seed: c.seed, startedAt: now })
        .returning();
      return { sessionId: session.id, seed: Number(c.seed), stage: c.stage };
    }
    if (tournamentId) {
      const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, tournamentId)).for("update");
      if (!t || t.game !== game.key) throw new UserError("Tournament not found");
      if (t.status !== "running" || (t.endsAt && t.endsAt <= now)) throw new UserError("This tournament is not open for attempts");
      const [entry] = await tx
        .select()
        .from(entries)
        .where(and(eq(entries.tournamentId, t.id), eq(entries.userId, user.id)));
      if (!entry) throw new UserError("Join the tournament first");
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(gameSessions)
        .where(and(eq(gameSessions.tournamentId, t.id), eq(gameSessions.userId, user.id)));
      if (count >= t.attemptsPerPlayer) throw new UserError(`You have used all ${t.attemptsPerPlayer} attempts`);
      // Everyone in a tournament plays the same stage.
      stage = t.stage;
    } else {
      if (!(stage >= 1 && stage <= game.stages.length)) throw new UserError("Unknown stage");
      const unlocked = await unlockedStages(tx as unknown as Db, user.id, game.key);
      if (stage > unlocked) throw new UserError(`Clear stage ${stage - 1} first`);
    }
    // Seeds come from the server so nobody can practise their tournament board in advance.
    const seed = randomInt(1, 2 ** 31);
    const [session] = await tx
      .insert(gameSessions)
      .values({ userId: user.id, game: game.key, stage, tournamentId, seed, startedAt: now })
      .returning();
    return { sessionId: session.id, seed, stage };
  });
}

export type SessionResult = {
  valid: boolean;
  cleared: boolean;
  score: number;
  timeMs: number;
  flagged: boolean;
  detail?: string;
  /** Set when this result unlocked the next stage. */
  unlockedStage?: number;
};

const MAX_INPUT = 500_000;

/** The clock is the server's: from when the seed was handed out to when the input arrives. */
export async function submitSession(db: Db, user: User, sessionId: string, input: string, now = new Date()): Promise<SessionResult> {
  const res = await submitInTx(db, user, sessionId, input, now);
  if (res.challengeId) await afterRaceRound(db, res.challengeId, now);
  return res.result;
}

async function submitInTx(db: Db, user: User, sessionId: string, input: string, now: Date) {
  return db.transaction(async (tx): Promise<{ result: SessionResult; challengeId: string | null }> => {
    const [session] = await tx
      .select()
      .from(gameSessions)
      .where(and(eq(gameSessions.id, sessionId), eq(gameSessions.userId, user.id), isNull(gameSessions.finishedAt)))
      .for("update");
    if (!session) throw new UserError("Game not found or already submitted");
    const game = ARCADE[session.game];
    const timeMs = now.getTime() - session.startedAt.getTime();
    let verdict =
      input.length > MAX_INPUT
        ? { valid: false, cleared: false, score: 0, flagged: false, detail: "Input too long" }
        : game.verify({ seed: Number(session.seed), stage: session.stage, input, elapsedMs: timeMs });
    if (timeMs > game.timeLimitMs) verdict = { ...verdict, cleared: false, detail: "Over the time limit" };
    const score = verdict.valid ? Math.trunc(verdict.score) : 0;
    await tx
      .update(gameSessions)
      .set({ finishedAt: now, timeMs, score, valid: verdict.valid, cleared: verdict.cleared, flagged: verdict.flagged, detail: verdict.detail ?? null })
      .where(eq(gameSessions.id, session.id));

    let unlockedStage: number | undefined;
    // Match rounds don't count towards stage progress: the stage was the challenger's pick.
    if (verdict.valid && !verdict.flagged && !session.challengeId) {
      const [prev] = await tx
        .select()
        .from(gameProgress)
        .where(and(eq(gameProgress.userId, user.id), eq(gameProgress.game, game.key), eq(gameProgress.stage, session.stage)));
      const better = (a: number | null | undefined, b: number, higher: boolean) => (a == null ? b : higher ? Math.max(a, b) : Math.min(a, b));
      const scoreHigher = game.ranking === "score";
      const row = {
        bestScore: better(prev?.bestScore, score, scoreHigher),
        bestTimeMs: verdict.cleared ? better(prev?.bestTimeMs, timeMs, false) : (prev?.bestTimeMs ?? null),
        clearedAt: prev?.clearedAt ?? (verdict.cleared ? now : null),
      };
      if (prev) {
        await tx
          .update(gameProgress)
          .set(row)
          .where(and(eq(gameProgress.userId, user.id), eq(gameProgress.game, game.key), eq(gameProgress.stage, session.stage)));
      } else {
        await tx.insert(gameProgress).values({ userId: user.id, game: game.key, stage: session.stage, ...row });
      }
      if (verdict.cleared && !prev?.clearedAt && session.stage < game.stages.length) unlockedStage = session.stage + 1;
    }
    return {
      result: { valid: verdict.valid, cleared: verdict.cleared, score, timeMs, flagged: verdict.flagged, detail: verdict.detail, unlockedStage },
      challengeId: session.challengeId,
    };
  });
}

export async function myProgress(db: Db, userId: string, game: ArcadeKey) {
  return db
    .select()
    .from(gameProgress)
    .where(and(eq(gameProgress.userId, userId), eq(gameProgress.game, game)))
    .orderBy(asc(gameProgress.stage));
}

/** Best practice results for one stage, across all players. */
export async function stageBoard(db: Db, game: ArcadeKey, stage: number, limit = 10) {
  const byScore = ARCADE[game].ranking === "score";
  return db
    .select({ username: users.username, bestScore: gameProgress.bestScore, bestTimeMs: gameProgress.bestTimeMs })
    .from(gameProgress)
    .innerJoin(users, eq(users.id, gameProgress.userId))
    .where(
      and(
        eq(gameProgress.game, game),
        eq(gameProgress.stage, stage),
        byScore ? sql`${gameProgress.bestScore} is not null` : sql`${gameProgress.clearedAt} is not null`,
      ),
    )
    .orderBy(...(byScore ? [desc(gameProgress.bestScore), asc(gameProgress.bestTimeMs)] : [asc(gameProgress.bestTimeMs)]))
    .limit(limit);
}
