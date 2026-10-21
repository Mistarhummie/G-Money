"use client";

import { useActionState } from "react";
import { createChallengeAction } from "@/app/actions";
import type { Stage } from "@/lib/games/arcade/types";

/** Start a match: open to anyone, or sent to one player by username. */
export function NewChallengeForm({ game, stages, race }: { game: string; stages: Stage[]; race: boolean }) {
  const [state, action, pending] = useActionState(createChallengeAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-2 text-sm">
      <input type="hidden" name="game" value={game} />
      <label className="label">
        Opponent&apos;s username (leave empty for anyone)
        <input name="opponent" className="input" placeholder="e.g. otieno" autoComplete="off" />
      </label>
      {race && (
        <label className="label">
          Stage
          <select name="stage" className="input" defaultValue="1">
            {stages.map((s, i) => (
              <option key={i} value={i + 1}>
                {i + 1}. {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <button className="btn-primary" disabled={pending}>{pending ? "Creating…" : "Create challenge"}</button>
      {state?.error && <p className="text-red-400">{state.error}</p>}
    </form>
  );
}
