import { randomInt } from "node:crypto";
import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import {
  disputes,
  entries,
  evidence,
  ledgerEntries,
  matches,
  puzzleAttempts,
  tournaments,
  users,
  type Match,
  type Tournament,
  type User,
} from "@/db/schema";
import { GAMES } from "./games/catalog";
import { firstRoundPairings, nextMatchPosition, roundCount, bracketSize } from "./bracket";
import { config } from "./config";
import { UserError } from "./errors";
import { checkChessGame, fetchLichessGame, parseLichessGameId, type FetchGame } from "./lichess";
import { computePrizePool, distributePrizes, payoutSplit } from "./payouts";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Exec = Db | Tx;

export { GAMES } from "./games/catalog";

// ---------------------------------------------------------------- creation

export const createTournamentSchema = z.object({
  title: z.string().trim().min(3).max(80),
  game: z.enum(["puzzle15", "chess", "efootball", "eafc"]),
  entryType: z.enum(["free", "paid"]),
  entryFeeKes: z.coerce.number().int().min(0).max(100_000),
  sponsoredPrizeKes: z.coerce.number().int().min(0).max(10_000_000),
  maxPlayers: z.coerce.number().int().min(2).max(256),
  attemptsPerPlayer: z.coerce.number().int().min(1).max(20).default(3),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional(),
  rules: z.string().trim().max(2000).optional(),
});

export type CreateTournamentInput = z.input<typeof createTournamentSchema>;

export async function createTournament(db: Db, admin: User, input: CreateTournamentInput): Promise<Tournament> {
  if (!admin.isAdmin) throw new UserError("Only admins can create tournaments");
  const parsed = createTournamentSchema.safeParse(input);
  if (!parsed.success) throw new UserError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const data = parsed.data;
  if (data.entryType === "paid" && !config.paidEntryEnabled()) {
    throw new UserError("Paid entry is switched off until the legal review is done. Use free entry with a sponsored prize.");
  }
  if (data.entryType === "free" && data.entryFeeKes !== 0) throw new UserError("Free tournaments cannot have an entry fee");
  if (data.entryType === "paid" && data.entryFeeKes <= 0) throw new UserError("Paid tournaments need an entry fee");
  const format = GAMES[data.game].format;
  if (format === "leaderboard" && !data.endsAt) throw new UserError("Leaderboard tournaments need an end time");
  if (data.endsAt && data.endsAt <= data.startsAt) throw new UserError("End time must be after the start time");

  const [created] = await db
    .insert(tournaments)
    .values({
      title: data.title,
      game: data.game,
      format,
      entryType: data.entryType,
      entryFeeKes: data.entryFeeKes,
      sponsoredPrizeKes: data.sponsoredPrizeKes,
      maxPlayers: data.maxPlayers,
      attemptsPerPlayer: data.attemptsPerPlayer,
      startsAt: data.startsAt,
      endsAt: data.endsAt ?? null,
      rules: data.rules || null,
      createdBy: admin.id,
    })
    .returning();
  return created;
}

// ---------------------------------------------------------------- joining

function assertCanPlay(user: User) {
  if (user.bannedAt) throw new UserError("Your account is suspended");
  if (!user.username) throw new UserError("Choose a username on your profile first");
}

export async function joinTournament(db: Db, user: User, tournamentId: string): Promise<void> {
  assertCanPlay(user);
  await db.transaction(async (tx) => {
    // Lock the tournament row so two last-second joins cannot overfill it.
    const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, tournamentId)).for("update");
    if (!t) throw new UserError("Tournament not found");
    if (t.status !== "open") throw new UserError("Entries are closed");
    const handle = GAMES[t.game].handle;
    if (handle && !user[handle]) throw new UserError(`Add your ${GAMES[t.game].handleLabel} on your profile first`);

    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(entries)
      .where(eq(entries.tournamentId, t.id));
    if (count >= t.maxPlayers) throw new UserError("This tournament is full");

    const existing = await tx
      .select({ id: entries.id })
      .from(entries)
      .where(and(eq(entries.tournamentId, t.id), eq(entries.userId, user.id)));
    if (existing.length) throw new UserError("You have already joined");

    if (t.entryType === "paid") {
      if (!config.paidEntryEnabled()) throw new UserError("Paid entry is not available yet");
      const balance = await accountBalance(tx, `user:${user.id}`);
      if (balance < t.entryFeeKes) throw new UserError(`You need KES ${t.entryFeeKes} in your wallet to join`);
      await postTransfer(tx, `user:${user.id}`, `tournament:${t.id}`, t.entryFeeKes, `Entry fee: ${t.title}`);
    }
    await tx.insert(entries).values({ tournamentId: t.id, userId: user.id });
  });
}

export async function leaveTournament(db: Db, user: User, tournamentId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, tournamentId)).for("update");
    if (!t) throw new UserError("Tournament not found");
    if (t.status !== "open") throw new UserError("You can only leave before the tournament starts");
    const deleted = await tx
      .delete(entries)
      .where(and(eq(entries.tournamentId, t.id), eq(entries.userId, user.id)))
      .returning();
    if (!deleted.length) throw new UserError("You are not in this tournament");
    if (t.entryType === "paid") {
      await postTransfer(tx, `tournament:${t.id}`, `user:${user.id}`, t.entryFeeKes, `Refund: ${t.title}`);
    }
  });
}

// ---------------------------------------------------------------- starting

export async function startTournament(db: Db, admin: User, tournamentId: string, now = new Date()): Promise<void> {
  if (!admin.isAdmin) throw new UserError("Only admins can start tournaments");
  await db.transaction(async (tx) => {
    const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, tournamentId)).for("update");
    if (!t) throw new UserError("Tournament not found");
    if (t.status !== "open") throw new UserError("Tournament has already started");
    const players = await tx.select().from(entries).where(eq(entries.tournamentId, t.id));
    if (players.length < 2) throw new UserError("At least 2 players are needed to start");

    // Random seeding using a secure RNG (Fisher-Yates).
    const ids = players.map((p) => p.userId);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = randomInt(0, i + 1);
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    for (let i = 0; i < ids.length; i++) {
      await tx
        .update(entries)
        .set({ seed: i + 1 })
        .where(and(eq(entries.tournamentId, t.id), eq(entries.userId, ids[i])));
    }

    // startsAt becomes the real start time, so chess games played before it cannot be submitted.
    await tx.update(tournaments).set({ status: "running", startsAt: now }).where(eq(tournaments.id, t.id));
    if (t.format === "leaderboard") return;

    const size = bracketSize(ids.length);
    const rounds = roundCount(size);
    for (let round = 1; round <= rounds; round++) {
      const slots = size / 2 ** round;
      for (let slot = 0; slot < slots; slot++) {
        await tx.insert(matches).values({ tournamentId: t.id, round, slot });
      }
    }
    for (const p of firstRoundPairings(ids)) {
      const [m] = await tx
        .update(matches)
        .set({ playerAId: p.playerA, playerBId: p.playerB })
        .where(and(eq(matches.tournamentId, t.id), eq(matches.round, 1), eq(matches.slot, p.slot)))
        .returning();
      // A bye: the lone player goes straight through.
      const lone = p.playerA && !p.playerB ? p.playerA : !p.playerA && p.playerB ? p.playerB : null;
      if (lone) await completeMatch(tx, t, m, lone, "bye", now);
    }
  });
}

// ---------------------------------------------------------------- results

const reportSchema = z
  .object({
    scoreA: z.coerce.number().int().min(0).max(99),
    scoreB: z.coerce.number().int().min(0).max(99),
  })
  .refine((s) => s.scoreA !== s.scoreB, { message: "Scores cannot be level. Include extra time or penalties." });

export type EvidenceFile = { mimeType: string; data: Buffer };

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_EVIDENCE_BYTES = 2.5 * 1024 * 1024;

function validateEvidence(file: EvidenceFile | null | undefined) {
  if (!file) return;
  if (!ALLOWED_IMAGE_TYPES.includes(file.mimeType)) throw new UserError("Screenshots must be PNG, JPEG or WebP");
  if (file.data.length > MAX_EVIDENCE_BYTES) throw new UserError("Screenshot is too large (max 2.5 MB)");
}

async function loadMatchForPlayer(tx: Exec, user: User, matchId: string) {
  const [m] = await tx.select().from(matches).where(eq(matches.id, matchId)).for("update");
  if (!m) throw new UserError("Match not found");
  if (m.playerAId !== user.id && m.playerBId !== user.id) throw new UserError("You are not in this match");
  const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, m.tournamentId));
  if (t.status !== "running") throw new UserError("This tournament is not running");
  return { m, t };
}

/** eFootball / EA FC: one player reports the score with a screenshot; the opponent confirms or disputes. */
export async function reportScore(
  db: Db,
  user: User,
  matchId: string,
  input: { scoreA: unknown; scoreB: unknown; screenshot?: EvidenceFile | null },
  now = new Date(),
): Promise<void> {
  assertCanPlay(user);
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) throw new UserError(parsed.error.issues[0].message);
  if (!input.screenshot) throw new UserError("Attach a screenshot of the final score");
  validateEvidence(input.screenshot);

  await db.transaction(async (tx) => {
    const { m, t } = await loadMatchForPlayer(tx, user, matchId);
    if (t.game === "chess") throw new UserError("Chess results come from Lichess. Submit the game link instead.");
    if (m.status !== "pending") throw new UserError("A score has already been reported for this match");
    if (!m.playerAId || !m.playerBId) throw new UserError("Your opponent is not decided yet");
    await tx
      .update(matches)
      .set({
        status: "awaiting_confirmation",
        scoreA: parsed.data.scoreA,
        scoreB: parsed.data.scoreB,
        reportedBy: user.id,
        reportedAt: now,
      })
      .where(eq(matches.id, m.id));
    await tx.insert(evidence).values({ matchId: m.id, uploadedBy: user.id, mimeType: input.screenshot!.mimeType, data: input.screenshot!.data });
  });
}

export async function confirmScore(db: Db, user: User, matchId: string, now = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const { m, t } = await loadMatchForPlayer(tx, user, matchId);
    if (m.status !== "awaiting_confirmation") throw new UserError("There is no score waiting for your confirmation");
    if (m.reportedBy === user.id) throw new UserError("Your opponent has to confirm the score you reported");
    await completeMatch(tx, t, m, scoreWinner(m), "confirmed", now);
  });
}

export async function disputeScore(
  db: Db,
  user: User,
  matchId: string,
  input: { reason: string; scoreA?: unknown; scoreB?: unknown; screenshot?: EvidenceFile | null },
  now = new Date(),
): Promise<void> {
  const reason = input.reason?.trim();
  if (!reason || reason.length < 5) throw new UserError("Explain what is wrong with the reported score");
  validateEvidence(input.screenshot);
  const claimed = reportSchema.safeParse({ scoreA: input.scoreA, scoreB: input.scoreB });

  await db.transaction(async (tx) => {
    const { m } = await loadMatchForPlayer(tx, user, matchId);
    if (m.status !== "awaiting_confirmation") throw new UserError("Only a reported score can be disputed");
    if (m.reportedBy === user.id) throw new UserError("You cannot dispute your own report");
    if (m.reportedAt && now.getTime() - m.reportedAt.getTime() > config.confirmWindowMinutes * 60_000) {
      throw new UserError("The time to dispute this score has passed");
    }
    await tx.update(matches).set({ status: "disputed" }).where(eq(matches.id, m.id));
    await tx.insert(disputes).values({
      matchId: m.id,
      openedBy: user.id,
      reason,
      claimedScoreA: claimed.success ? claimed.data.scoreA : null,
      claimedScoreB: claimed.success ? claimed.data.scoreB : null,
      createdAt: now,
    });
    if (input.screenshot) {
      await tx.insert(evidence).values({ matchId: m.id, uploadedBy: user.id, mimeType: input.screenshot.mimeType, data: input.screenshot.data });
    }
  });
}

/** Chess: the result is read from Lichess, so there is nothing to confirm or dispute. */
export async function submitChessGame(
  db: Db,
  user: User,
  matchId: string,
  gameLink: string,
  now = new Date(),
  fetchGame: FetchGame = fetchLichessGame,
): Promise<{ winnerId: string }> {
  assertCanPlay(user);
  const gameId = parseLichessGameId(gameLink);
  if (!gameId) throw new UserError("Paste the Lichess game link, e.g. https://lichess.org/abcd1234");
  const game = await fetchGame(gameId);
  if (!game) throw new UserError("Lichess has no game with that link");

  return db.transaction(async (tx) => {
    const { m, t } = await loadMatchForPlayer(tx, user, matchId);
    if (t.game !== "chess") throw new UserError("This is not a chess match");
    if (m.status !== "pending") throw new UserError("This match already has a result");
    if (!m.playerAId || !m.playerBId) throw new UserError("Your opponent is not decided yet");
    const reused = await tx
      .select({ id: matches.id })
      .from(matches)
      .where(and(eq(matches.tournamentId, t.id), eq(matches.lichessGameId, gameId)));
    if (reused.length) throw new UserError("That game has already been used for another match");

    const [a] = await tx.select().from(users).where(eq(users.id, m.playerAId));
    const [b] = await tx.select().from(users).where(eq(users.id, m.playerBId));
    if (!a.lichessUsername || !b.lichessUsername) throw new UserError("Both players need a Lichess username on their profile");
    const check = checkChessGame(game, a.lichessUsername, b.lichessUsername, t.startsAt);
    if (!check.ok) throw new UserError(check.reason);
    const winnerId = check.winnerUsername.toLowerCase() === a.lichessUsername.toLowerCase() ? a.id : b.id;
    await tx.update(matches).set({ lichessGameId: gameId }).where(eq(matches.id, m.id));
    await completeMatch(tx, t, m, winnerId, "lichess", now);
    return { winnerId };
  });
}

/** Accepts reported scores the opponent left unanswered past the confirmation window. */
export async function applyAutoConfirms(db: Db, tournamentId: string, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - config.confirmWindowMinutes * 60_000);
  const due = await db
    .select({ id: matches.id })
    .from(matches)
    .where(and(eq(matches.tournamentId, tournamentId), eq(matches.status, "awaiting_confirmation"), lt(matches.reportedAt, cutoff)));
  let applied = 0;
  for (const { id } of due) {
    await db.transaction(async (tx) => {
      const [m] = await tx.select().from(matches).where(eq(matches.id, id)).for("update");
      if (m.status !== "awaiting_confirmation") return;
      const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, m.tournamentId));
      await completeMatch(tx, t, m, scoreWinner(m), "auto-confirmed", now);
      applied++;
    });
  }
  return applied;
}

export async function resolveDispute(
  db: Db,
  admin: User,
  disputeId: string,
  input: { winnerId: string; note: string },
  now = new Date(),
): Promise<void> {
  if (!admin.isAdmin) throw new UserError("Only admins can resolve disputes");
  const note = input.note?.trim();
  if (!note) throw new UserError("Write a short note explaining the decision");
  await db.transaction(async (tx) => {
    const [d] = await tx.select().from(disputes).where(eq(disputes.id, disputeId)).for("update");
    if (!d) throw new UserError("Dispute not found");
    if (d.resolvedAt) throw new UserError("Dispute already resolved");
    const [m] = await tx.select().from(matches).where(eq(matches.id, d.matchId)).for("update");
    if (input.winnerId !== m.playerAId && input.winnerId !== m.playerBId) throw new UserError("Winner must be one of the two players");
    const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, m.tournamentId));

    await tx.update(disputes).set({ resolution: note, resolvedBy: admin.id, resolvedAt: now }).where(eq(disputes.id, d.id));
    // Whoever the decision goes against loses reputation: the reporter for a false report,
    // or the disputer for a dispute without merit.
    const loserId = input.winnerId === m.playerAId ? m.playerBId! : m.playerAId!;
    await tx.update(users).set({ disputesLost: sql`${users.disputesLost} + 1` }).where(eq(users.id, loserId));
    await completeMatch(tx, t, m, input.winnerId, `admin:${admin.id}`, now);
  });
}

function scoreWinner(m: Match): string {
  if (m.scoreA == null || m.scoreB == null) throw new Error("Match has no score");
  return m.scoreA > m.scoreB ? m.playerAId! : m.playerBId!;
}

async function completeMatch(tx: Exec, t: Tournament, m: Match, winnerId: string, resolvedBy: string, now: Date): Promise<void> {
  await tx
    .update(matches)
    .set({ status: "completed", winnerId, resolvedBy, completedAt: now })
    .where(eq(matches.id, m.id));
  if (m.playerAId && m.playerBId) {
    await tx
      .update(users)
      .set({ matchesPlayed: sql`${users.matchesPlayed} + 1` })
      .where(inArray(users.id, [m.playerAId, m.playerBId]));
  }

  const [{ maxRound }] = await tx
    .select({ maxRound: sql<number>`max(${matches.round})::int` })
    .from(matches)
    .where(eq(matches.tournamentId, t.id));
  if (m.round === maxRound) {
    await finishBracket(tx, t, now);
    return;
  }
  const next = nextMatchPosition(m.round, m.slot);
  await tx
    .update(matches)
    .set(next.side === "A" ? { playerAId: winnerId } : { playerBId: winnerId })
    .where(and(eq(matches.tournamentId, t.id), eq(matches.round, next.round), eq(matches.slot, next.slot)));
}

// ---------------------------------------------------------------- finishing

async function finishBracket(tx: Exec, t: Tournament, now: Date) {
  const all = await tx.select().from(matches).where(eq(matches.tournamentId, t.id)).orderBy(asc(matches.round));
  const maxRound = Math.max(...all.map((m) => m.round));
  const final = all.find((m) => m.round === maxRound)!;
  // Rank 1 = champion, 2 = finalist; others ranked by the round they went out in.
  const ranking: string[][] = [[final.winnerId!]];
  for (let round = maxRound; round >= 1; round--) {
    const losers = all
      .filter((m) => m.round === round && m.playerAId && m.playerBId && m.winnerId)
      .map((m) => (m.winnerId === m.playerAId ? m.playerBId! : m.playerAId!));
    if (losers.length) ranking.push(losers);
  }
  await settle(tx, t, ranking, now);
}

/** Ends a leaderboard tournament: best solved time wins. */
export async function finishLeaderboard(db: Db, admin: User | null, tournamentId: string, now = new Date()): Promise<void> {
  if (admin && !admin.isAdmin) throw new UserError("Only admins can finish tournaments");
  await db.transaction(async (tx) => {
    const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, tournamentId)).for("update");
    if (!t || t.format !== "leaderboard") throw new UserError("Not a leaderboard tournament");
    if (t.status !== "running") throw new UserError("Tournament is not running");
    if (!admin && (!t.endsAt || t.endsAt > now)) throw new UserError("Tournament has not ended yet");
    const board = await leaderboard(tx, t.id);
    await settle(tx, t, board.map((row) => [row.userId]), now);
  });
}

export async function leaderboard(db: Exec, tournamentId: string) {
  return db
    .select({
      userId: puzzleAttempts.userId,
      username: users.username,
      bestTimeMs: sql<number>`min(${puzzleAttempts.timeMs})::int`,
      bestMoves: sql<number>`min(${puzzleAttempts.moveCount})::int`,
    })
    .from(puzzleAttempts)
    .innerJoin(users, eq(users.id, puzzleAttempts.userId))
    .where(and(eq(puzzleAttempts.tournamentId, tournamentId), eq(puzzleAttempts.solved, true), eq(puzzleAttempts.flagged, false)))
    .groupBy(puzzleAttempts.userId, users.username)
    .orderBy(sql`min(${puzzleAttempts.timeMs}) asc`, sql`min(${puzzleAttempts.moveCount}) asc`);
}

/** `ranking[i]` holds the players who finished in place i+1 (ties share a place). */
async function settle(tx: Exec, t: Tournament, ranking: string[][], now: Date) {
  const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(entries).where(eq(entries.tournamentId, t.id));
  const pool = computePrizePool({
    entryFeeKes: t.entryType === "paid" ? t.entryFeeKes : 0,
    entrants: count,
    sponsoredPrizeKes: t.sponsoredPrizeKes,
    platformFeePercent: t.platformFeePercent,
  });
  const prizes = distributePrizes(pool.prizePoolKes, payoutSplit(t.format, count));

  let place = 1;
  for (const group of ranking) {
    for (const userId of group) {
      await tx
        .update(entries)
        .set({ finalRank: place })
        .where(and(eq(entries.tournamentId, t.id), eq(entries.userId, userId)));
    }
    place += group.length;
  }

  const txId = crypto.randomUUID();
  const rows: { txId: string; account: string; amountKes: number; memo: string; createdAt: Date }[] = [];
  let paidOut = 0;
  for (let i = 0; i < prizes.length && i < ranking.length; i++) {
    // Ties at a paid place share that place's prize.
    const group = ranking[i];
    if (!group?.length || prizes[i] === 0) continue;
    const each = Math.floor(prizes[i] / group.length);
    for (const userId of group) {
      rows.push({ txId, account: `user:${userId}`, amountKes: each, memo: `Prize: ${t.title}`, createdAt: now });
      await tx.update(entries).set({ prizeKes: each }).where(and(eq(entries.tournamentId, t.id), eq(entries.userId, userId)));
      paidOut += each;
    }
  }
  if (paidOut > 0 || pool.platformFeeKes > 0) {
    const fromSponsor = Math.min(t.sponsoredPrizeKes, paidOut);
    if (fromSponsor > 0) rows.push({ txId, account: `sponsor:${t.id}`, amountKes: -fromSponsor, memo: `Sponsored prize: ${t.title}`, createdAt: now });
    const fromEntries = paidOut - fromSponsor + pool.platformFeeKes;
    if (fromEntries > 0) {
      rows.push({ txId, account: `tournament:${t.id}`, amountKes: -fromEntries, memo: `Payouts: ${t.title}`, createdAt: now });
    }
    if (pool.platformFeeKes > 0) rows.push({ txId, account: "platform:fees", amountKes: pool.platformFeeKes, memo: `Fee: ${t.title}`, createdAt: now });
    await tx.insert(ledgerEntries).values(rows);
  }
  await tx.update(tournaments).set({ status: "completed", endsAt: t.endsAt ?? now }).where(eq(tournaments.id, t.id));
}

export async function cancelTournament(db: Db, admin: User, tournamentId: string): Promise<void> {
  if (!admin.isAdmin) throw new UserError("Only admins can cancel tournaments");
  await db.transaction(async (tx) => {
    const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, tournamentId)).for("update");
    if (!t) throw new UserError("Tournament not found");
    if (t.status === "completed" || t.status === "cancelled") throw new UserError("Tournament is already closed");
    if (t.entryType === "paid") {
      const players = await tx.select().from(entries).where(eq(entries.tournamentId, t.id));
      for (const p of players) {
        await postTransfer(tx, `tournament:${t.id}`, `user:${p.userId}`, t.entryFeeKes, `Refund (cancelled): ${t.title}`);
      }
    }
    await tx.update(tournaments).set({ status: "cancelled" }).where(eq(tournaments.id, t.id));
  });
}

// ---------------------------------------------------------------- ledger

export async function accountBalance(db: Exec, account: string): Promise<number> {
  const [{ total }] = await db
    .select({ total: sql<number>`coalesce(sum(${ledgerEntries.amountKes}), 0)::int` })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.account, account));
  return total;
}

/** Pilot payouts are sent by hand over M-Pesa; this records that a player's prize balance was paid. */
export async function recordPayout(db: Db, admin: User, userId: string, amountKes: number, reference: string): Promise<void> {
  if (!admin.isAdmin) throw new UserError("Only admins can record payouts");
  if (!Number.isInteger(amountKes) || amountKes <= 0) throw new UserError("Enter a positive whole amount");
  const ref = reference.trim();
  if (!ref) throw new UserError("Enter the M-Pesa transaction code");
  await db.transaction(async (tx) => {
    const balance = await accountBalance(tx, `user:${userId}`);
    if (amountKes > balance) throw new UserError(`This player is only owed KES ${balance}`);
    await postTransfer(tx, `user:${userId}`, "external:mpesa", amountKes, `Payout via M-Pesa ${ref} by ${admin.username ?? admin.id}`);
  });
}

/** Players with an unpaid prize balance. */
export async function prizesOwed(db: Db) {
  return db
    .select({
      userId: users.id,
      username: users.username,
      phone: users.phone,
      owedKes: sql<number>`sum(${ledgerEntries.amountKes})::int`,
    })
    .from(ledgerEntries)
    .innerJoin(users, sql`${ledgerEntries.account} = 'user:' || ${users.id}`)
    .groupBy(users.id, users.username, users.phone)
    .having(sql`sum(${ledgerEntries.amountKes}) > 0`);
}

async function postTransfer(tx: Exec, from: string, to: string, amountKes: number, memo: string) {
  const txId = crypto.randomUUID();
  await tx.insert(ledgerEntries).values([
    { txId, account: from, amountKes: -amountKes, memo },
    { txId, account: to, amountKes, memo },
  ]);
}
