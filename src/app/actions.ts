"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { requestOtp, verifyOtp } from "@/lib/auth";
import { UserError } from "@/lib/errors";
import { startPuzzleAttempt, submitPuzzleAttempt, type AttemptResult } from "@/lib/puzzles";
import { endSession, getCurrentUser, requireAdmin, requireUser, startSession } from "@/lib/session";
import * as tournaments from "@/lib/tournaments";

export type ActionState = { error?: string; message?: string; devCode?: string; phone?: string } | undefined;

/** Turns player-facing errors into form messages; anything else (including redirects) is rethrown. */
async function run(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await fn()) ?? { message: "Done" };
  } catch (err) {
    if (err instanceof UserError) return { error: err.message };
    throw err;
  }
}

const str = (form: FormData, key: string) => String(form.get(key) ?? "");

/** Admin forms use datetime-local inputs, which carry no time zone. They are Kenyan time. */
function nairobiDate(value: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}:00+03:00`);
  if (Number.isNaN(d.getTime())) throw new UserError("Invalid date");
  return d;
}

async function fileFrom(form: FormData, key: string) {
  const file = form.get(key);
  if (!(file instanceof File) || file.size === 0) return null;
  return { mimeType: file.type, data: Buffer.from(await file.arrayBuffer()) };
}

// ---------------------------------------------------------------- sign-in

export async function sendCodeAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const db = await getDb();
    const res = await requestOtp(db, str(form, "phone"));
    return { phone: res.phone, devCode: res.devCode, message: "Code sent" };
  });
}

export async function verifyCodeAction(_: ActionState, form: FormData): Promise<ActionState> {
  const result = await run(async () => {
    const db = await getDb();
    const user = await verifyOtp(db, str(form, "phone"), str(form, "code"));
    await startSession(user.id);
  });
  if (result?.error) return { ...result, phone: str(form, "phone") };
  redirect("/profile");
}

export async function signOutAction() {
  await endSession();
  redirect("/");
}

// ---------------------------------------------------------------- profile

const profileSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_]{3,20}$/, "Username must be 3 to 20 letters, numbers or underscores"),
  lichessUsername: z.string().trim().max(30),
  efootballId: z.string().trim().max(40),
  eafcId: z.string().trim().max(40),
});

export async function updateProfileAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    const parsed = profileSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) throw new UserError(parsed.error.issues[0].message);
    const data = parsed.data;
    const db = await getDb();
    const taken = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.username, data.username), ne(users.id, user.id)));
    if (taken.length) throw new UserError("That username is taken");
    await db
      .update(users)
      .set({
        username: data.username,
        lichessUsername: data.lichessUsername || null,
        efootballId: data.efootballId || null,
        eafcId: data.eafcId || null,
      })
      .where(eq(users.id, user.id));
    revalidatePath("/", "layout");
    return { message: "Profile saved" };
  });
}

// ---------------------------------------------------------------- tournaments

export async function joinAction(tournamentId: string): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    await tournaments.joinTournament(await getDb(), user, tournamentId);
    revalidatePath(`/tournaments/${tournamentId}`);
    return { message: "You're in!" };
  });
}

export async function leaveAction(tournamentId: string): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    await tournaments.leaveTournament(await getDb(), user, tournamentId);
    revalidatePath(`/tournaments/${tournamentId}`);
    return { message: "You have left the tournament" };
  });
}

export async function reportScoreAction(matchId: string, path: string, _: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    await tournaments.reportScore(await getDb(), user, matchId, {
      scoreA: form.get("scoreA"),
      scoreB: form.get("scoreB"),
      screenshot: await fileFrom(form, "screenshot"),
    });
    revalidatePath(path);
    return { message: "Score sent. Your opponent has 30 minutes to confirm or dispute it." };
  });
}

export async function confirmScoreAction(matchId: string, path: string): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    await tournaments.confirmScore(await getDb(), user, matchId);
    revalidatePath(path);
    return { message: "Result confirmed" };
  });
}

export async function disputeScoreAction(matchId: string, path: string, _: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    await tournaments.disputeScore(await getDb(), user, matchId, {
      reason: str(form, "reason"),
      scoreA: form.get("scoreA") || undefined,
      scoreB: form.get("scoreB") || undefined,
      screenshot: await fileFrom(form, "screenshot"),
    });
    revalidatePath(path);
    return { message: "Dispute sent to the admin" };
  });
}

export async function submitChessAction(matchId: string, path: string, _: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    await tournaments.submitChessGame(await getDb(), user, matchId, str(form, "gameLink"));
    revalidatePath(path);
    return { message: "Result recorded from Lichess" };
  });
}

// ---------------------------------------------------------------- puzzle

export async function startPuzzleAction(tournamentId: string | null): Promise<{ attemptId: string; seed: number } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to play" };
  try {
    return await startPuzzleAttempt(await getDb(), user, tournamentId);
  } catch (err) {
    if (err instanceof UserError) return { error: err.message };
    throw err;
  }
}

export async function submitPuzzleAction(attemptId: string, moves: string): Promise<AttemptResult | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to play" };
  try {
    return await submitPuzzleAttempt(await getDb(), user, attemptId, moves);
  } catch (err) {
    if (err instanceof UserError) return { error: err.message };
    throw err;
  }
}

// ---------------------------------------------------------------- admin

export async function createTournamentAction(_: ActionState, form: FormData): Promise<ActionState> {
  let id = "";
  const result = await run(async () => {
    const admin = await requireAdmin();
    const t = await tournaments.createTournament(await getDb(), admin, {
      title: str(form, "title"),
      game: str(form, "game") as tournaments.CreateTournamentInput["game"],
      entryType: (str(form, "entryType") || "free") as "free" | "paid",
      entryFeeKes: str(form, "entryFeeKes") || 0,
      sponsoredPrizeKes: str(form, "sponsoredPrizeKes") || 0,
      maxPlayers: str(form, "maxPlayers"),
      attemptsPerPlayer: str(form, "attemptsPerPlayer") || 3,
      startsAt: nairobiDate(str(form, "startsAt")) ?? new Date(),
      endsAt: nairobiDate(str(form, "endsAt")),
      rules: str(form, "rules"),
    });
    id = t.id;
  });
  if (result?.error) return result;
  redirect(`/tournaments/${id}`);
}

export async function adminTournamentAction(tournamentId: string, op: "start" | "finish" | "cancel"): Promise<ActionState> {
  return run(async () => {
    const admin = await requireAdmin();
    const db = await getDb();
    if (op === "start") await tournaments.startTournament(db, admin, tournamentId);
    if (op === "finish") await tournaments.finishLeaderboard(db, admin, tournamentId);
    if (op === "cancel") await tournaments.cancelTournament(db, admin, tournamentId);
    revalidatePath("/admin");
    revalidatePath(`/tournaments/${tournamentId}`);
    return { message: op === "start" ? "Started" : op === "finish" ? "Finished and prizes assigned" : "Cancelled" };
  });
}

export async function resolveDisputeAction(disputeId: string, _: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await requireAdmin();
    await tournaments.resolveDispute(await getDb(), admin, disputeId, { winnerId: str(form, "winnerId"), note: str(form, "note") });
    revalidatePath("/admin");
    return { message: "Dispute resolved" };
  });
}

export async function recordPayoutAction(userId: string, _: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await requireAdmin();
    await tournaments.recordPayout(await getDb(), admin, userId, Number(str(form, "amountKes")), str(form, "reference"));
    revalidatePath("/admin");
    return { message: "Payout recorded" };
  });
}

export async function banUserAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await requireAdmin();
    const username = str(form, "username").trim();
    const reason = str(form, "reason").trim();
    const unban = form.get("unban") === "on";
    if (!username) throw new UserError("Enter a username");
    if (!unban && !reason) throw new UserError("Give a reason so the player can appeal");
    const db = await getDb();
    const [target] = await db.select().from(users).where(eq(users.username, username));
    if (!target) throw new UserError("No player with that username");
    if (target.id === admin.id) throw new UserError("You cannot ban yourself");
    await db
      .update(users)
      .set(unban ? { bannedAt: null, banReason: null } : { bannedAt: new Date(), banReason: reason })
      .where(eq(users.id, target.id));
    revalidatePath("/admin");
    return { message: unban ? `${username} unbanned` : `${username} suspended` };
  });
}
