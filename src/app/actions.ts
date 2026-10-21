"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { requestOtp, verifyOtp } from "@/lib/auth";
import { UserError } from "@/lib/errors";
import * as arcade from "@/lib/arcade";
import { endSession, getCurrentUser, requireAdmin, requireUser, startSession } from "@/lib/session";
import * as tournaments from "@/lib/tournaments";
import { simulatePayment, startPayment, refreshPayment } from "@/lib/shop/checkout";
import * as shop from "@/lib/shop/orders";
import { getSupplier } from "@/lib/shop/suppliers";
import { orders } from "@/db/schema";

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
  const next = str(form, "next");
  redirect(/^\/(?![\/\\])/.test(next) ? next : "/profile");
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

// ---------------------------------------------------------------- our own games

export async function startGameAction(
  game: string,
  stage: number,
  tournamentId: string | null,
): Promise<{ sessionId: string; seed: number; stage: number } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to play" };
  try {
    return await arcade.startSession(await getDb(), user, { game, stage, tournamentId });
  } catch (err) {
    if (err instanceof UserError) return { error: err.message };
    throw err;
  }
}

export async function submitGameAction(sessionId: string, input: string): Promise<arcade.SessionResult | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to play" };
  try {
    return await arcade.submitSession(await getDb(), user, sessionId, input);
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
      stage: str(form, "stage") || 1,
      startsAt: nairobiDate(str(form, "startsAt")) ?? new Date(),
      endsAt: nairobiDate(str(form, "endsAt")),
      rules: str(form, "rules"),
      prizeProductId: str(form, "prizeProductId") || undefined,
      prizeCardValues: str(form, "prizeCardValues") || undefined,
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

// ---------------------------------------------------------------- shop

export async function buyAction(productId: string, _: ActionState, form: FormData): Promise<ActionState> {
  let target = "";
  const result = await run(async () => {
    const user = await getCurrentUser();
    if (!user) redirect(`/login?next=/shop/${productId}`);
    const db = await getDb();
    const method = str(form, "method") === "card" ? "card" : "mpesa";
    const order = await shop.createOrder(
      db,
      user,
      { productId, faceCents: Number(str(form, "faceCents")), method, email: str(form, "email") },
      getSupplier().name,
    );
    try {
      const { redirectUrl } = await startPayment(db, order, user);
      target = redirectUrl ?? `/orders/${order.id}`;
    } catch (err) {
      await shop.cancelUnpaidOrder(db, order.id, err instanceof Error ? err.message : "Payment could not start");
      if (err instanceof UserError) throw err;
      throw new UserError("The payment could not start. Please try again.");
    }
  });
  if (result?.error) return result;
  redirect(target);
}

async function ownOrder(orderId: string) {
  const user = await requireUser();
  const db = await getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order || order.userId !== user.id) throw new UserError("Order not found");
  return { user, db, order };
}

export async function checkPaymentAction(orderId: string): Promise<ActionState> {
  return run(async () => {
    const { db, order } = await ownOrder(orderId);
    await refreshPayment(db, order);
    revalidatePath(`/orders/${orderId}`);
    return { message: "Checked" };
  });
}

export async function cancelOrderAction(orderId: string): Promise<ActionState> {
  return run(async () => {
    const { db, order } = await ownOrder(orderId);
    await refreshPayment(db, order);
    await shop.cancelUnpaidOrder(db, order.id, "Cancelled by buyer");
    revalidatePath(`/orders/${orderId}`);
    return { message: "Order cancelled" };
  });
}

export async function simulatePaymentAction(orderId: string, outcome: "paid" | "failed"): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    await simulatePayment(await getDb(), user, orderId, outcome);
    revalidatePath(`/orders/${orderId}`);
    return { message: outcome === "paid" ? "Test payment made" : "Test payment declined" };
  });
}

// ---------------------------------------------------------------- shop admin

export async function setRateAction(_: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await requireAdmin();
    await shop.setUsdKesRate(await getDb(), admin, Number(str(form, "rate")));
    revalidatePath("/", "layout");
    return { message: "Rate saved. Shop prices now use it." };
  });
}

export async function syncProductsAction(): Promise<ActionState> {
  return run(async () => {
    const admin = await requireAdmin();
    const n = await shop.syncProducts(await getDb(), admin, getSupplier());
    revalidatePath("/admin/shop");
    return { message: `${n} cards loaded from the supplier. New ones stay hidden until you switch them on.` };
  });
}

export async function toggleProductAction(productId: string, enabled: boolean): Promise<ActionState> {
  return run(async () => {
    const admin = await requireAdmin();
    await shop.setProductEnabled(await getDb(), admin, productId, enabled);
    revalidatePath("/", "layout");
    return { message: enabled ? "Now on sale" : "Hidden from the shop" };
  });
}

export async function adminOrderAction(orderId: string, op: "approve" | "send" | "recheck", _?: ActionState, form?: FormData): Promise<ActionState> {
  void form;
  return run(async () => {
    const admin = await requireAdmin();
    const db = await getDb();
    const supplier = getSupplier();
    let order;
    if (op === "approve") {
      await shop.approveHeldOrder(db, admin, orderId);
      order = await shop.fulfilOrder(db, orderId, supplier);
    } else if (op === "send") {
      order = await shop.fulfilOrder(db, orderId, supplier);
    } else {
      order = await shop.recheckOrder(db, admin, orderId, supplier);
    }
    revalidatePath("/admin/shop");
    if (order.status === "delivered") return { message: "Card delivered" };
    return { error: `Not delivered: ${order.failureReason ?? order.status}` };
  });
}

export async function refundOrderAction(orderId: string, _: ActionState, form: FormData): Promise<ActionState> {
  return run(async () => {
    const admin = await requireAdmin();
    await shop.markRefunded(await getDb(), admin, orderId, str(form, "note"));
    revalidatePath("/admin/shop");
    return { message: "Marked as refunded" };
  });
}
