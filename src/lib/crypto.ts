import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { config } from "./config";

/**
 * Gift card codes are as good as cash, so they are encrypted before they are stored.
 * CODE_ENCRYPTION_KEY must be set in production; changing it makes stored codes unreadable.
 */
function key(): Buffer {
  const raw = process.env.CODE_ENCRYPTION_KEY;
  if (raw && raw.length >= 32) return createHash("sha256").update(raw).digest();
  if (process.env.NODE_ENV === "production" && process.env.OTP_DEV_MODE !== "true") {
    throw new Error("CODE_ENCRYPTION_KEY must be set to at least 32 characters in production");
  }
  return createHash("sha256").update(`codes:${config.sessionSecret()}`).digest();
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(sealed: string): string {
  const [iv, tag, data] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
