"use client";

import { useActionState } from "react";
import { sendCodeAction, verifyCodeAction } from "../actions";

export function LoginForm({ next }: { next: string }) {
  const [sent, sendAction, sending] = useActionState(sendCodeAction, undefined);
  const [verified, verifyAction, verifying] = useActionState(verifyCodeAction, undefined);
  const phone = sent?.phone;

  if (!phone || sent?.error) {
    return (
      <form action={sendAction} className="flex flex-col gap-3">
        <label className="label">
          Phone number
          <input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0712 345 678" required className="input" />
        </label>
        <button className="btn-primary" disabled={sending}>{sending ? "Sending…" : "Send code"}</button>
        {sent?.error && <p className="text-sm text-red-400">{sent.error}</p>}
      </form>
    );
  }

  return (
    <form action={verifyAction} className="flex flex-col gap-3">
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="next" value={next} />
      <p className="text-sm text-white/80">Code sent to {phone}.</p>
      {sent.devCode && (
        <p className="rounded-lg bg-amber-500/15 p-2 text-sm text-amber-200">Test mode: your code is {sent.devCode}</p>
      )}
      <label className="label">
        6-digit code
        <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required className="input tracking-widest" />
      </label>
      <button className="btn-primary" disabled={verifying}>{verifying ? "Checking…" : "Sign in"}</button>
      {verified?.error && <p className="text-sm text-red-400">{verified.error}</p>}
    </form>
  );
}
