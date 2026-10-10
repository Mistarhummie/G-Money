import { randomInt } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { entries, puzzleAttempts, tournaments, type User } from "@/db/schema";
import { UserError } from "./errors";
import { MAX_HUMAN_MOVES_PER_SECOND, replay } from "./games/puzzle15";

/** An attempt left open longer than this no longer counts. */
export const ATTEMPT_TIMEOUT_MS = 15 * 60 * 1000;

export async function startPuzzleAttempt(
  db: Db,
  user: User,
  tournamentId: string | null,
  now = new Date(),
): Promise<{ attemptId: string; seed: number }> {
  if (user.bannedAt) throw new UserError("Your account is suspended");
  return db.transaction(async (tx) => {
    if (tournamentId) {
      const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, tournamentId)).for("update");
      if (!t || t.game !== "puzzle15") throw new UserError("Puzzle tournament not found");
      if (t.status !== "running" || (t.endsAt && t.endsAt <= now)) throw new UserError("This tournament is not open for attempts");
      const [entry] = await tx
        .select()
        .from(entries)
        .where(and(eq(entries.tournamentId, t.id), eq(entries.userId, user.id)));
      if (!entry) throw new UserError("Join the tournament first");
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(puzzleAttempts)
        .where(and(eq(puzzleAttempts.tournamentId, t.id), eq(puzzleAttempts.userId, user.id)));
      if (count >= t.attemptsPerPlayer) throw new UserError(`You have used all ${t.attemptsPerPlayer} attempts`);
    }
    // Seeds come from the server so nobody can practise their tournament board in advance.
    const seed = randomInt(1, 2 ** 31);
    const [attempt] = await tx
      .insert(puzzleAttempts)
      .values({ userId: user.id, tournamentId, seed, startedAt: now })
      .returning();
    return { attemptId: attempt.id, seed };
  });
}

export type AttemptResult = { solved: boolean; timeMs: number; moveCount: number; flagged: boolean };

/** The clock is the server's: from when the board was handed out to when the moves arrive. */
export async function submitPuzzleAttempt(
  db: Db,
  user: User,
  attemptId: string,
  moves: string,
  now = new Date(),
): Promise<AttemptResult> {
  return db.transaction(async (tx) => {
    const [attempt] = await tx
      .select()
      .from(puzzleAttempts)
      .where(and(eq(puzzleAttempts.id, attemptId), eq(puzzleAttempts.userId, user.id), isNull(puzzleAttempts.finishedAt)))
      .for("update");
    if (!attempt) throw new UserError("Attempt not found or already submitted");
    const timeMs = now.getTime() - attempt.startedAt.getTime();
    const result = replay(Number(attempt.seed), moves);
    const solved = result.solved && timeMs <= ATTEMPT_TIMEOUT_MS;
    const flagged = solved && result.moveCount / Math.max(timeMs / 1000, 0.001) > MAX_HUMAN_MOVES_PER_SECOND;
    await tx
      .update(puzzleAttempts)
      .set({ finishedAt: now, moveCount: result.moveCount, timeMs, solved, flagged })
      .where(eq(puzzleAttempts.id, attempt.id));
    return { solved, timeMs, moveCount: result.moveCount, flagged };
  });
}
