import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { ledgerEntries, users, type User } from "@/db/schema";
import { config } from "./config";
import { UserError } from "./errors";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Exec = Db | Tx;

/** Account names in the ledger. */
export const walletOf = (userId: string) => `user:${userId}`;
export const PLATFORM_FEES = "platform:fees";
const TEST_GRANT = "testfunds:grant";
const TEST_GRANT_MEMO = "Test funds to play with";

export async function accountBalance(db: Exec, account: string): Promise<number> {
  const [{ total }] = await db
    .select({ total: sql<number>`coalesce(sum(${ledgerEntries.amountKes}), 0)::int` })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.account, account));
  return total;
}

export async function postTransfer(tx: Exec, from: string, to: string, amountKes: number, memo: string) {
  const txId = crypto.randomUUID();
  await tx.insert(ledgerEntries).values([
    { txId, account: from, amountKes: -amountKes, memo },
    { txId, account: to, amountKes, memo },
  ]);
}

/**
 * Locks players' wallets until the transaction ends, so two payments from one wallet at once can't both
 * pass the balance check. Locks are taken in id order so two transactions can't wait on each other.
 */
export async function lockWallets(tx: Tx, userIds: string[]) {
  for (const id of [...new Set(userIds)].sort()) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`wallet:${id}`}))`);
  }
}

/** A player's latest wallet movements, newest first. */
export async function walletHistory(db: Exec, userId: string, limit = 20) {
  return db
    .select({ amountKes: ledgerEntries.amountKes, memo: ledgerEntries.memo, at: ledgerEntries.createdAt })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.account, walletOf(userId)))
    .orderBy(desc(ledgerEntries.createdAt), desc(ledgerEntries.id))
    .limit(limit);
}

// ---------------------------------------------------------------- test sites: join with a username

export const usernameRule = /^[A-Za-z0-9_]{3,20}$/;

/**
 * Test sites only: makes a player from just a username and gives them the test funds. They have no phone
 * number, so the account lives in this browser's session cookie.
 */
export async function joinWithUsername(db: Db, raw: string): Promise<User> {
  if (!config.testFunds()) throw new UserError("Sign in with your phone number");
  const username = raw.trim().replace(/^@/, "");
  if (!usernameRule.test(username)) throw new UserError("Username must be 3 to 20 letters, numbers or underscores");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`username:${username.toLowerCase()}`}))`);
    const taken = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.username}) = lower(${username})`);
    if (taken.length) throw new UserError("That username is taken. Try another.");
    // Accounts made this way have no phone; this placeholder keeps the column unique and can never match a real number.
    const [user] = await tx.insert(users).values({ phone: `test:${crypto.randomUUID()}`, username }).returning();
    await postTransfer(tx, TEST_GRANT, walletOf(user.id), config.testFundsKes, TEST_GRANT_MEMO);
    return user;
  });
}

/**
 * Test sites only: gives an account that signed in another way (a phone number, such as the admin's) the same
 * test funds as a new username gets. Once per account; safe to call on every page load.
 */
export async function ensureTestFunds(db: Db, userId: string): Promise<void> {
  if (!config.testFunds()) return;
  const granted = (tx: Exec) =>
    tx
      .select({ id: ledgerEntries.id })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.account, walletOf(userId)), eq(ledgerEntries.memo, TEST_GRANT_MEMO)))
      .limit(1);
  if ((await granted(db)).length) return;
  await db.transaction(async (tx) => {
    await lockWallets(tx, [userId]);
    if ((await granted(tx)).length) return;
    await postTransfer(tx, TEST_GRANT, walletOf(userId), config.testFundsKes, TEST_GRANT_MEMO);
  });
}
