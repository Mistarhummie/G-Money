/** Feature switches and settings read from environment variables. */

export const config = {
  /** Paid entry stays off until a Kenyan gaming lawyer confirms it is allowed. */
  paidEntryEnabled: () => process.env.PAID_ENTRY_ENABLED === "true",
  /** Shows sign-in codes on screen instead of sending an SMS. Never enable in production. */
  otpDevMode: () => process.env.NODE_ENV !== "production" || process.env.OTP_DEV_MODE === "true",
  adminPhones: () =>
    (process.env.ADMIN_PHONES ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean),
  sessionSecret: () => {
    const secret = process.env.SESSION_SECRET;
    if (secret && secret.length >= 32) return secret;
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET must be set to at least 32 characters in production");
    }
    return "dev-only-session-secret-change-me-0123456789";
  },
  /** Minutes the opponent has to confirm or dispute a reported score before it is accepted. */
  confirmWindowMinutes: 30,
};
