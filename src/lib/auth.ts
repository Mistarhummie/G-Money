import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { otpCodes, users, type User } from "@/db/schema";
import { config } from "./config";
import { UserError } from "./errors";
import { normaliseKenyanPhone } from "./phone";
import { sendSms } from "./sms";

const CODE_TTL_MINUTES = 10;
const MAX_CODES_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

function hashCode(phone: string, code: string): string {
  return createHmac("sha256", config.sessionSecret()).update(`${phone}:${code}`).digest("hex");
}

const isAdminPhone = (phone: string) => config.adminPhones().some((p) => normaliseKenyanPhone(p) === phone);

export type OtpRequestResult = { phone: string; devCode?: string };

export async function requestOtp(db: Db, rawPhone: string, now = new Date()): Promise<OtpRequestResult> {
  const phone = normaliseKenyanPhone(rawPhone);
  if (!phone) throw new UserError("Enter a valid Kenyan mobile number, e.g. 0712 345 678");

  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(otpCodes)
    .where(and(eq(otpCodes.phone, phone), gt(otpCodes.createdAt, hourAgo)));
  if (count >= MAX_CODES_PER_HOUR) throw new UserError("Too many codes requested. Try again in an hour.");

  // On test sites codes are shown on screen, so anyone could sign in as the admin. Admin numbers
  // therefore use a private PIN (ADMIN_TEST_PIN) as their code instead, and it is never shown.
  const adminPin = config.otpDevMode() && isAdminPhone(phone) ? config.adminTestPin() : null;
  if (config.otpDevMode() && isAdminPhone(phone) && !adminPin && process.env.NODE_ENV === "production") {
    throw new UserError("Admin sign-in on the test site needs ADMIN_TEST_PIN to be set");
  }
  const code = adminPin ?? String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(otpCodes).values({
    phone,
    codeHash: hashCode(phone, code),
    expiresAt: new Date(now.getTime() + CODE_TTL_MINUTES * 60 * 1000),
    createdAt: now,
  });

  if (adminPin) return { phone };
  if (config.otpDevMode()) return { phone, devCode: code };
  await sendSms(phone, `Your G-Money code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes.`);
  return { phone };
}

export async function verifyOtp(db: Db, rawPhone: string, code: string, now = new Date()): Promise<User> {
  const phone = normaliseKenyanPhone(rawPhone);
  if (!phone) throw new UserError("Invalid phone number");

  const [otp] = await db
    .select()
    .from(otpCodes)
    .where(and(eq(otpCodes.phone, phone), isNull(otpCodes.usedAt), gt(otpCodes.expiresAt, now)))
    .orderBy(sql`${otpCodes.createdAt} desc`)
    .limit(1);
  if (!otp) throw new UserError("Code expired. Request a new one.");
  if (otp.attempts >= MAX_ATTEMPTS) throw new UserError("Too many wrong attempts. Request a new code.");

  const expected = Buffer.from(otp.codeHash, "hex");
  const actual = Buffer.from(hashCode(phone, code.trim()), "hex");
  if (!timingSafeEqual(expected, actual)) {
    await db.update(otpCodes).set({ attempts: otp.attempts + 1 }).where(eq(otpCodes.id, otp.id));
    throw new UserError("Wrong code");
  }
  await db.update(otpCodes).set({ usedAt: now }).where(eq(otpCodes.id, otp.id));

  const isAdmin = isAdminPhone(phone);
  const [existing] = await db.select().from(users).where(eq(users.phone, phone));
  if (existing) {
    if (isAdmin && !existing.isAdmin) {
      const [updated] = await db.update(users).set({ isAdmin: true }).where(eq(users.id, existing.id)).returning();
      return updated;
    }
    return existing;
  }
  const [created] = await db.insert(users).values({ phone, isAdmin }).returning();
  return created;
}
