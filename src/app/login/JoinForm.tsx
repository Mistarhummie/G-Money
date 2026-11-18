"use client";

import { useActionState } from "react";
import { joinWithUsernameAction } from "../actions";

/** Test sites only: pick a username and you're in, with test funds to play with. */
export function JoinForm({ next, funds }: { next: string; funds: number }) {
  const [state, action, pending] = useActionState(joinWithUsernameAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <label className="label">
        Username
        <input
          name="username"
          autoComplete="nickname"
          autoCapitalize="none"
          placeholder="e.g. otieno_254"
          pattern="[A-Za-z0-9_]{3,20}"
          title="3 to 20 letters, numbers or underscores"
          required
          autoFocus
          className="input"
        />
      </label>
      <button className="btn-primary py-3 text-base font-bold" disabled={pending}>
        {pending ? "Joining…" : `Join and get KES ${funds.toLocaleString()}`}
      </button>
      {state?.error && <p className="text-sm text-red-400">{state.error}</p>}
    </form>
  );
}
