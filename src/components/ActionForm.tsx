"use client";

import { useActionState } from "react";
import type { ActionState } from "@/app/actions";

type Props = {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  submitLabel: string;
  pendingLabel?: string;
  className?: string;
  buttonClassName?: string;
  confirmText?: string;
  children?: React.ReactNode;
};

/** A form wired to a server action that shows the action's error or success message inline. */
export function ActionForm({ action, submitLabel, pendingLabel, className, buttonClassName, confirmText, children }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form
      action={formAction}
      className={className ?? "flex flex-col gap-3"}
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {children}
      <button type="submit" disabled={pending} className={buttonClassName ?? "btn-primary"}>
        {pending ? (pendingLabel ?? "Working…") : submitLabel}
      </button>
      {state?.error && <p className="text-sm text-red-400">{state.error}</p>}
      {state?.message && !state.error && <p className="text-sm text-emerald-400">{state.message}</p>}
    </form>
  );
}
